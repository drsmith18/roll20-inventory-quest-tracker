# Contributing to Party Tools

Party Tools is a one-maintainer hobby project. Contributions, bug reports
and pull requests are welcome, but please read this first — it'll save you
writing something that can't be merged.

## Ground rules

- **All testing happens in a dedicated test game, with a dedicated second
  Roll20 account.** Never in a live campaign, and never in a game you or
  anyone else actually plays in, until a build has survived the test game.
  Shared state, permissions and reveal behaviour cannot be tested from a
  single account — you need to see what the other role sees.
- **Nothing in this repository may contain credentials, session tokens,
  campaign IDs, or anything else from a real Roll20 account.** Screenshots,
  console dumps and test fixtures should come from the test game, not your
  own table. If you're not sure whether something in a diagnostic dump is
  sensitive, leave it out and describe it in words instead.

## Running the tests

```
npm install     # jsdom, the only dependency — the extension itself has none
npm test
```

This takes about **2.5 minutes**. Most of that is deliberate: the tests
boot the real extension inside jsdom against a stubbed Roll20 campaign, and
they wait out the same journal-settling and write-verification delays the
real thing uses against Roll20's servers, rather than faking them away.
That's on purpose — a test that doesn't wait for a write to verify isn't
testing the thing that actually goes wrong at the table.

Four suites, run in this order:

- `test/version.test.js` — the version number agrees across
  `extension/manifest.json`, `package.json` and `PT.VERSION`, and the
  manifest is within the Chrome Web Store's name/description limits.
- `test/sheets.test.js` — character-sheet writes: the compendium weapon
  graph, taking an item back off a sheet, who a player is allowed to split
  coins with.
- `test/storage-init.test.js` — the DM's first run in a game, and a player
  who opens the panel before the DM has set the game up.
- `test/panel-ui.test.js` — panel behaviour reported from the table (a
  hidden bag's header layout, adding several items without reopening the
  box, what a player is told after an item moves off a sheet, the character
  pickers a DM has to scroll, and which characters can actually receive an
  item).

CI runs the same `npm test` on every push and pull request (see
`.github/workflows/test.yml`).

### What the tests can and cannot prove

The stubs the tests run against are built from
`docs/roll20-spike-findings.md` — the shapes of Roll20's own data,
confirmed by inspecting a live campaign. A green run proves the extension's
logic is correct *given those shapes*. It does not prove Roll20 still has
those shapes — Roll20 can and does change things under us. The compendium
payload used in `sheets.test.js` in particular is a reconstruction, not a
captured sample; if you're touching sheet writes, confirm the real shape
against a live drop with `PT.sheets.explainGraph()` (see `extension/src/sheets.js`)
before trusting a claim onto a character anyone cares about.

Real play in the test game is still the gate. A passing `npm test` is a
reason to move on to that step, not a substitute for it.

## Things not to "fix"

A few choices in this codebase look like they're missing something. They're
not — they're deliberate, and a PR that "fixes" them will be declined.

- **No build step, no bundler, no minifier.** What ships is exactly what's
  in `extension/src/`, line for line. This is what lets a reviewer — at
  AMO, at the Chrome Web Store, or just someone reading the repo — read the
  real code without an extra source-submission process. It also means a bug
  report's stack trace and line numbers match what's on disk. Keep new code
  as plain scripts; don't introduce a transpile or bundling step, however
  tempting the tooling looks.
- **No new permissions.** The manifest declares no `permissions` and no
  `host_permissions` at all — the content script only runs on
  `app.roll20.net/editor*`. That's a deliberate asset, not an oversight: it's
  a large part of why the privacy story is simple and why review should be
  fast. A change that needs a new permission needs a very good reason and a
  conversation first, not a quiet addition to the manifest.
- **One global namespace.** Everything hangs off `window.PartyTools` (`PT`
  inside the IIFEs), because the content script runs in the page's own
  `MAIN` world alongside Roll20's code, with no module loader. Keep new
  files in the same shape: an IIFE that extends `PT`, loaded in dependency
  order from `manifest.json`'s `content_scripts.js` array.

## Release process

The version lives in **`extension/manifest.json`** — that's the single
source of truth. `test/version.test.js` is what keeps `package.json` and
the `PT.VERSION` constant in `extension/src/util.js` from drifting out of
step with it (this has happened before: `package.json` once sat at 0.9.0
while the extension itself shipped 0.9.20).

To cut a release: bump the version in `extension/manifest.json` (and let
the test suite catch the other two files if you forget them), update
`CHANGELOG.md`, then push a tag matching `v<version>` (e.g. `v0.9.21`).
The `release` workflow (`.github/workflows/release.yml`) then:

1. Runs the full test suite — a tag is never shipped untested.
2. Checks the tag matches the manifest version, and fails loudly if not.
3. Builds `chrome.zip` and `firefox.zip` by copying `extension/` verbatim
   (Firefox keeps `browser_specific_settings`; Chrome has it stripped,
   since Chrome doesn't understand that key — nothing else differs between
   the two builds).
4. Verifies both zips actually contain the required files and aren't
   wrapped in an extra `extension/` directory.
5. Creates a GitHub release with both zips attached and that version's
   `CHANGELOG.md` section as the release notes.

## Filing a good bug report

Please use the 🐞 button inside the panel rather than opening a blank
issue. It opens a pre-filled GitHub issue with the Party Tools version,
your role (DM or player), the character sheet type and Roll20 backend
Roll20 itself reports, your browser's user-agent, and the time — the
details that are otherwise the first thing anyone would have to ask you
for. You just add what happened and what you expected instead.

If you can't use the button (no GitHub account, or the panel itself is
broken), the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
asks for the same things by hand: what happened, what you expected, when
it happened, whether you were the DM or a player, and any red errors from
the browser console (F12 → Console).
