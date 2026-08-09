# Party Tools for Roll20 — shared inventory & quest tracker

A browser extension (Chrome and Firefox) that adds a **shared party inventory** to a Roll20 game —
bags of items and coins the whole party can see and edit, with a full
who-did-what activity log. A DM-controlled quest tracker is planned next.
All data is stored *inside* the Roll20 campaign itself (as journal
handouts), so there is no external server, no accounts, and nothing to host.

**Status: v0.8 beta — the inventory is feature-complete and in testing at
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
  sheet

Not yet built: sub-bags, and the quest tracker. That's the current order of
work.

## Installing

Full instructions for players are in **[INSTALL.md](INSTALL.md)** (Chrome,
Edge and Firefox, with troubleshooting).

Short version for the impatient: download the repo as a ZIP, unzip it, then
in Chrome go to `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked**, and pick the `extension` folder. Reload your Roll20 game
and click the treasure-chest tab on the right edge. The DM must open the
panel once in each game before players can use it.

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
- Chrome (and Edge/Brave) is the tested browser. Firefox 128+ is supported
  by the manifest but not yet verified in real play — see INSTALL.md.
- **Trust model:** hidden bags are genuinely hidden (server-enforced), but
  the tool doesn't try to stop a determined cheat editing *visible* shared
  data — same as the table itself, it runs on trust.

## What's in this repository

| Path | What it is |
|---|---|
| `extension/` | The browser extension — the actual product |
| `INSTALL.md` | Install guide for players — the link to send your group |
| `docs/roll20-party-tools-prd.md` | Product requirements (v0.5). Every requirement has an ID |
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
