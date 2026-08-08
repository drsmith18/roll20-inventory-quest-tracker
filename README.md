# Party Tools for Roll20 — shared inventory & quest tracker

A Chrome extension that adds a **shared party inventory** to a Roll20 game —
bags of items and coins the whole party can see and edit, with a full
who-did-what activity log. A DM-controlled quest tracker is planned next.
All data is stored *inside* the Roll20 campaign itself (as journal
handouts), so there is no external server, no accounts, and nothing to host.

**Status: v0.1 — first working inventory build, being tested at the
author's own table.** Not yet on the Chrome Web Store; it loads "unpacked"
(instructions below).

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

Not yet built: sending items to character sheets, sub-bags, and the quest
tracker. That's the current order of work.

## Installing (no developer tools needed)

**Chrome** (main supported browser):

1. Download this repository: green **Code** button above → **Download
   ZIP**, then unzip it somewhere you won't delete by accident.
2. In Chrome, go to `chrome://extensions` (type it in the address bar).
3. Turn on **Developer mode** (toggle, top-right corner).
4. Click **Load unpacked** (button, top-left) and select the **`extension`
   folder** inside the unzipped download — the folder that contains
   `manifest.json`, not the whole repository.
5. Open (or reload) your Roll20 game. A **PARTY TOOLS** tab appears on the
   right edge of the screen. Click it.

**Firefox** (experimental): open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on…**, and select the `manifest.json` file inside
the `extension` folder. Needs Firefox 128 or newer. Note "temporary" is
Firefox's word, not ours: the add-on unloads when Firefox closes and has to
be loaded again next time. That's a Firefox restriction on unsigned
extensions; a permanent Firefox install comes with store signing, later.

**First time in a game:** the DM opens the panel first — that creates the
storage and a "Party Loot" bag. Players who open it before the DM has done
this will see a message saying so.

**Updating:** download the new ZIP, replace the old folder, then on
`chrome://extensions` click the ↻ reload icon on the Party Tools card, and
reload the Roll20 tab.

## Reporting bugs (please do!)

Click the **🐞** button in the panel — it opens a GitHub issue with the
technical details already filled in; you just describe what happened. You
need a free [GitHub account](https://github.com/signup) to post. No GitHub
account? Tell your DM and they can file it:
[issue tracker](https://github.com/drsmith18/roll20-inventory-quest-tracker/issues).

## Things worth knowing

- **Your data lives in your game's journal**, in handouts named `PT-…` with
  deliberately meaningless names (so hidden loot never leaks through a
  title). Don't delete or edit those handouts by hand — that *is* the
  party's inventory.
- Works on Roll20's **Jumpgate** engine and, for now, Chrome. Games on the
  old Legacy engine get a polite "not supported" note.
- **Trust model:** hidden bags are genuinely hidden (server-enforced), but
  the tool doesn't try to stop a determined cheat editing *visible* shared
  data — same as the table itself, it runs on trust.

## What's in this repository

| Path | What it is |
|---|---|
| `extension/` | The Chrome extension — the actual product |
| `docs/roll20-party-tools-prd.md` | Product requirements (v0.4, post-spike). Every requirement has an ID |
| `docs/roll20-technical-findings.md` | What was verified by inspecting Roll20 live, 8 Aug 2026 |
| `docs/roll20-spike-brief.md` | The six make-or-break tests that were run before any code |
| `docs/roll20-spike-findings.md` | The answers — all six spikes, with evidence |
| `spikes/` | Throwaway console-test code from the spike phase; kept for reference |

## Ground rules

- All testing happens in a dedicated test game with a dedicated second
  account — never in a live campaign until a build has survived the test
  game.
- Nothing in this repo may contain credentials, session tokens, campaign
  IDs, or anything else from a real Roll20 account.

## Support

If Party Tools is useful at your table: [ko-fi.com/drsmith080](https://ko-fi.com/drsmith080) ☕
