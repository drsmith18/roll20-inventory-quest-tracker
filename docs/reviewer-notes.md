# Reviewer notes — Party Tools

Background for the Chrome Web Store and AMO (Firefox add-ons) review
process. The sections below are written to be pasted directly into the
relevant justification fields on either dashboard.

## Single purpose

> Party Tools adds a shared party inventory to a Roll20 virtual tabletop
> game: bags of items and coins the whole party can see and edit, with an
> activity log of who did what. It is one feature, aimed at one site. It
> has no other function.

## Why `world: MAIN` is required

Party Tools has no backend, no API of its own, and no data format of its
own — it works entirely by reading and writing Roll20's own in-page
JavaScript objects, the same ones Roll20's own client code uses. Those
objects are Backbone models and collections that Roll20 constructs on
`window` after the game page loads. A content script running in the
default isolated world cannot see them — isolated-world scripts get a
separate JavaScript environment that shares the DOM with the page but not
its variables, so `window.Campaign` would simply be `undefined`. `world:
"MAIN"` puts the content script in the page's own JavaScript environment,
which is the only place these objects exist.

The specific globals and methods the extension depends on, found in
`extension/src/`:

- `window.Campaign` — the root Backbone object for the loaded game, and
  its collections:
  - `Campaign.handouts` (`.get`, `.create`, `.models`) — journal handouts,
    which is where all of the extension's data lives
  - `Campaign.players.models` — used to detect that the game has finished
    loading
  - `Campaign.characters.models` — used to find character sheets for the
    claim/split-coins features
  - `Campaign.attributes` / `Campaign.get("journalfolder")` /
    `Campaign.save(...)` — campaign-level settings, used to read the
    backend/engine name and to file handouts into a journal folder
- `handout._getLatestBlob("notes", callback)` — reads a handout's body
- `handout.updateBlobs({ notes: text })` — writes a handout's body
- `window.campaign_id` — identifies which game this is (used to scope
  local storage and one compendium request)
- `window.d20_player_id` — identifies the current player
- `window.d20_current_name` — the current player's display name
- `window.is_gm` — whether the current user is the DM
- jQuery UI's droppable widget (`$(elem).droppable(...)`, `$.fn.droppable`)
  — Roll20 loads jQuery UI itself for its own compendium drag-and-drop;
  the extension attaches a droppable zone to its own panel using the same
  library already present on the page, because compendium drag events only
  fire through it (a plain HTML5 `drop` listener never sees them).

None of this is reachable from an isolated-world content script. There is
no alternative Roll20 API — no REST endpoint, no postMessage bridge — that
exposes campaign data; the in-page objects are the only interface that
exists.

## Host permissions justification

> The extension's content script matches only
> `https://app.roll20.net/editor*` (the page a Roll20 game runs on). The
> manifest declares no `permissions` key and no `host_permissions` key —
> nothing beyond that one content script match. It doesn't request tabs,
> storage, cookies, or any other API surface, because it doesn't need
> them: all of its data lives in Roll20 handouts, reached only through the
> in-page objects above.

## The counterweight to `world: MAIN`

Running in the main world is a wider surface than isolated world, so it's
worth being explicit about what the extension does *not* do with it:

- Zero entries in `permissions` and zero in `host_permissions` in
  `extension/manifest.json`
- One content script, one match pattern
  (`https://app.roll20.net/editor*`), one `world` value (`MAIN`)
- No `fetch`, `XMLHttpRequest`, `WebSocket`, or `eval` anywhere in
  `extension/src/`, with one narrow exception: `extension/src/drops.js`
  makes a same-origin `fetch` to Roll20's own compendium endpoint
  (`/compendium/compendium/getPages`) when an item is dragged from the
  compendium onto a bag, using the browser's existing Roll20 session. That
  is the extension's only network request; it goes to Roll20's own domain,
  not to the developer or any third party.
- No remote code: everything the content script runs ships inside the
  extension package
- No bundler and no minifier — `extension/src/*.js` is exactly what loads
  at runtime (see the `js` array in `manifest.json`), so a reviewer reading
  the source is reading the shipped code, not a build artefact

## Firefox minimum version

`browser_specific_settings.gecko.strict_min_version` is pinned to `128.0`
in `extension/manifest.json`. This is not an arbitrary choice: Firefox
added support for `world: "MAIN"` on Manifest V3 content scripts in
Firefox 128. The extension cannot function on an older Firefox — the
content script would load into the isolated world instead and every
`Campaign`/`window.*` reference above would be `undefined` — so this
minimum must not be lowered.

## Engine support

Party Tools only runs on Roll20's current "Jumpgate" engine. It actively
declines to run on Roll20's older "Legacy" engine: `extension/src/env.js`
(`PT.env.supported`) checks the campaign's reported backend/engine and, if
it isn't Jumpgate (or unrecognised), shows the user a "not supported"
message instead of attempting to read or write any data. This is a
deliberate scope limit, not an oversight — Legacy's in-page objects were
never verified against and are not supported.
