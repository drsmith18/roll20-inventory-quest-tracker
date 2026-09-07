# Party Tools for Roll20 — shared inventory & quest tracker

A browser extension (Chrome and Firefox) that adds a **shared party inventory** to a Roll20 game —
bags of items and coins the whole party can see and edit, with a full
who-did-what activity log. A DM-controlled quest tracker is planned next.
All data is stored *inside* the Roll20 campaign itself (as journal
handouts), so there is no external server, no accounts, and nothing to host.

**Status: v0.9 beta — the inventory is feature-complete and in testing at
the author's own table.** Not in the browser add-on stores yet, so it
installs by hand.

> ### 👉 Just want to install it and play?
> **Read [INSTALL.md](INSTALL.md)** — step-by-step instructions for Chrome
> and Firefox, written for players who've never installed an extension this
> way. That's the link to send your group.

## What works today

- One or more bags, visible to the whole party, live-syncing between
  everyone in under a second or two (the DM creates bags; everyone can
  fill them)
- Drag items from the Roll20 compendium straight onto a bag — name,
  description, weight, cost and rarity come along automatically
- Manual items for homebrew ("a strangely warm rock")
- Coin purse per bag with a reasons log; quantities, moves, deletes
- DM-only **hidden bags** for prepped loot — Roll20's servers genuinely
  withhold the contents from players, and the DM view marks hidden bags
  unmistakably
- An activity log of every change: who, what, when
- Coin splitting with preview: convert-down maths, remainder stays in the
  purse, shares recorded against characters until taken
- 🐞 one-click bug reporting (pre-filled GitHub issue) and ☕ [Ko-fi](https://ko-fi.com/drsmith080)
- Search across all bags, per-bag sorting, and bag renaming
- Obscured items: the DM can disguise an item so players see only a written
  description; true stats live in DM-only storage and are revealed in one
  click (shift-drop from the compendium to obscure on arrival)
- A DM-only side log for secret actions (hidden bags, obscuring), plus
  visible redaction of an item's name from past log entries when you
  obscure it
- Claim an item from a bag to your own character's sheet (D&D 2024 sheets;
  anything else is recorded as assigned), and push split coin shares to a
  sheet. A compendium weapon arrives as a weapon — its attack and damage
  records come along, not just the name
- Put items back: move an item off your character's sheet into a bag, keeping
  its weapon data, so the round trip doesn't flatten it
- Coin splitting only ever offers players the party — characters a player
  controls, plus any NPC the DM tags `party` in the journal. The DM still
  sees every character

Not yet built: sub-bags, and the quest tracker. That's the current order of
work.

## Installing

Full instructions for players are in **[INSTALL.md](INSTALL.md)** (Chrome,
Edge and Firefox, with troubleshooting).

Short version for the impatient: download the repo as a ZIP, unzip it, then
in Chrome go to `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked**, and pick the `extension` folder. Reload your Roll20 game
and click the treasure-chest tab on the right edge. The DM must open the
panel once in each game before players can use it — players who got there
first don't need to reload, their panel picks the game up on its own.

## Reporting bugs (please do!)

Click the **🐞** button in the panel — it opens a GitHub issue with the
technical details already filled in; you just describe what happened. You
need a free [GitHub account](https://github.com/signup) to post. No GitHub
account? Tell your DM and they can file it:
[issue tracker](https://github.com/drsmith18/roll20-inventory-quest-tracker/issues).

## Things worth knowing

- **Your data lives in your game's journal**, in handouts named `PT-…` with
  deliberately meaningless names (so hidden loot never leaks through a
  title). The DM's client files them into a folder called *Party Tools (do
  not edit)* to keep the journal tidy. Don't delete or edit those handouts
  by hand — that *is* the party's inventory.
- Works on Roll20's **Jumpgate** engine. Games on the old Legacy engine get
  a polite "not supported" note.
- Chrome (and Edge/Brave) is the tested browser. Firefox 140+ is supported
  by the manifest but not yet verified in real play — see INSTALL.md. (The
  floor is 140 rather than 128 because of the data-collection declaration
  Firefox now requires; see `docs/release-checklist.md`.)
- **Trust model:** hidden bags are genuinely hidden (server-enforced), but
  the tool doesn't try to stop a determined cheat editing *visible* shared
  data — same as the table itself, it runs on trust.

## What's in this repository

| Path | What it is |
|---|---|
| `extension/` | The browser extension — the actual product |
| `INSTALL.md` | Install guide for players — the link to send your group |
| `PRIVACY.md` | Privacy policy. The stores link to it; it is also the honest answer to "is this safe?" |
| `docs/release-checklist.md` | How a release gets tested and submitted to both add-on stores |
| `docs/store-listing.md` | Store listing copy and every dashboard answer, written out ready to paste |
| `tools/` | Release tooling — `npm run build` packages the zip, `npm run icons` redraws the PNGs |
| `docs/roll20-party-tools-prd.md` | Product requirements (v0.5). Every requirement has an ID |
| `docs/future-ideas.md` | Ideas and table feedback not yet built — shop sheets, sub-bags, and what would settle each open question |
| `docs/roll20-technical-findings.md` | What was verified by inspecting Roll20 live, 8 Aug 2026 |
| `docs/roll20-spike-brief.md` | The six make-or-break tests that were run before any code |
| `docs/roll20-spike-findings.md` | The answers — all six spikes, with evidence |
| `test/` | Automated tests (`npm install && npm test`) — see below |
| `spikes/` | Throwaway console-test code from the spike phase; kept for reference |

## Tests

```
npm install     # jsdom and web-ext — the extension itself has no dependencies
npm test
```

The tests boot the **real** extension inside jsdom against a stubbed Roll20
campaign, so they exercise the shipped files rather than a copy of the logic.
Three suites, 276 checks: `test/sheets.test.js` (character-sheet writes — the
compendium weapon graph, taking items back off a sheet, who a player may
split coins with), `test/storage-init.test.js` (the DM's first run, and a
player who opens the panel before the DM has set the game up) and
`test/panel-ui.test.js` (what the panel actually renders).

They take about a minute, most of it deliberate waiting on the same journal
settling and write-verification delays the real thing uses.

**What they can't tell you:** the stubs are built from
`docs/roll20-spike-findings.md`, so a green run proves the logic is right
*given those shapes*. It does not prove Roll20 still has those shapes. The
compendium payload in `sheets.test.js` is a reconstruction, not a captured
sample — confirm it against a real drop with `PT.sheets.explainGraph()`
(snippet (a2) in `extension/src/sheets.js`) before trusting a claim onto a
character you care about. Real play in the test game is still the gate.

## Releasing

```
npm run release:check   # tests, then the AMO validator, then the package
```

That writes `dist/party-tools-<version>.zip` — one file, uploaded unchanged
to both stores — and refuses to build if the version in `manifest.json` and
the one in `src/util.js` have drifted apart, if the manifest names a file
that isn't there, or if a store string is over length.

`npm run lint` alone runs `web-ext lint`, the same validator
addons.mozilla.org runs on submission. One warning is expected (Android,
which this add-on doesn't target); errors must be zero. All three run in CI
on every push.

**Green here is not the gate.** The real gate is a session in the test game,
and for Firefox that has never happened. See
**[docs/release-checklist.md](docs/release-checklist.md)**.

## Ground rules

- All testing happens in a dedicated test game with a dedicated second
  account — never in a live campaign until a build has survived the test
  game.
- Nothing in this repo may contain credentials, session tokens, campaign
  IDs, or anything else from a real Roll20 account.

## Support

If Party Tools is useful at your table: [ko-fi.com/drsmith080](https://ko-fi.com/drsmith080) ☕
