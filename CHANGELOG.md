# Changelog

All notable changes to Party Tools will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

v1.0.0 will be the first public release on the browser extension stores. Until
then, Party Tools runs at v0.9 in beta testing at the author's table.

### Added
- **Export and import.** The ♥ tab can save every bag, item, coin and log
  entry to a `.json` file, and restore one back into a game. Until now the
  party's data lived only in handouts we tell people never to touch, with no
  way to get it back out — a deleted journal folder meant a campaign's loot
  was simply gone. Importing adds the file's bags alongside whatever is
  already there, marked "(imported)"; it never overwrites or deletes. A DM's
  export contains hidden bags and the true stats behind obscured items; a
  player's cannot, because Roll20 never sends a player that data.
- Icons at 16/32/48/128, rendered from the launcher chest already in the
  panel. The manifest had none.
- A licence (MIT), a privacy policy, contributor and security guidance, an
  FAQ, and reviewer notes explaining why the extension runs in the page's own
  JavaScript context.
- Continuous integration on every push, and a tagged-release build producing
  the Chrome and Firefox zips.

- **The DM's first run explains itself.** Opening the panel for the first time
  in a game now says where the party's data lives, that the `PT-…` handouts
  ARE the inventory and must not be deleted by hand, and that the ♥ tab can
  export it. All of that was previously only in the README, and the most
  damaging of it was learned fastest by deleting something.
- A player who opens the panel before their DM has set the game up is now told
  they don't need to do anything or reload — the panel fills in on its own.

- **The panel can be used from the keyboard.** Modals are announced as
  dialogs, close on Escape, keep Tab inside themselves, and hand focus back to
  wherever it was when they close. The tab strip is a real tablist with arrow
  keys. The launcher and the coin strip are buttons rather than clickable
  divs, so they can be reached and focused at all. Icon-only buttons carry
  their tooltip as an accessible name, and there is now a visible focus ring.

### Fixed
- **Concurrent writes could silently double a quantity, a purse deposit or a
  stacked item.** The check that confirmed a write had landed compared the
  handout body to exactly what it had written, which cannot tell "my write was
  lost" from "my write landed and then somebody else wrote". The second was
  treated as the first, and the change was reapplied on top of a document that
  already contained it — while reporting success. Two people each adding 1 to
  the same item inside Roll20's ~1.6s write echo left it at 4, not 3. Coin
  splits were already defended against this individually; every other delta
  was not. The guarantee now lives in the write primitive itself, so it covers
  all of them. See #50.

### Changed
- Renamed to "Party Tools — Unofficial Shared Inventory for Roll20", with a
  non-affiliation disclaimer in the ♥ tab. Leading a store listing with
  another party's trademark is the most common cause of rejection.
- The version number now has one source of truth (the manifest), with a test
  that fails if `PT.VERSION` or `package.json` drifts from it.

## [0.9.20] — 2026-08-18

### Fixed
- Claiming an item now checks whether a character can actually hold items,
  rather than guessing from the sheet's name. A character that can't take the
  item says why — and a sheet that has never been opened tells the DM to open
  it once, instead of failing with a developer-facing timeout. Nothing is
  removed from the bag when the write is refused.

## [0.9.19] — 2026-08-17

### Fixed
- The claim-to-character list scrolls instead of running off the screen. It was
  unbounded for the DM, who sees every character in the game.

## [0.9.18] — 2026-08-17

### Fixed
- Three bugs found at the table: the bag header, adding several of the same
  item at once, and character sheets going stale after an item was moved.

## [0.9.17] — 2026-08-10

### Added
- A claimed magic item brings its abilities with it — Action, Resource and
  Healing records are written to the sheet, not just the item's name.

## [0.9.16] — 2026-08-10

### Added
- Attunement and its effects. An Amulet of Health claimed from a bag now
  actually changes the character it is attuned to.

## [0.9.15] — 2026-08-10

### Added
- Claimed armour arrives as armour: the Armor Class and Defense records are
  written to the character sheet.

## [0.9.14] — 2026-08-10

### Added
- Diagnostics: a one-command survey of every bagged item's payload shape, and
  a list of the sheet's items when a weapon dump finds nothing.

## [0.9.13] — 2026-08-10

### Added
- Survey every bagged item's payload shape in one command

## [0.9.12] — 2026-08-10

### Changed
- Widen the relay search past its own blind spot

## [0.9.11] — 2026-08-10

### Added
- Find the relay behind the sheet's compendium drop target

## [0.9.10] — 2026-08-10

### Added
- Roll20 has a compendium drop target on the character sheet

## [0.9.9] — 2026-08-10

### Added
- Probes for the two "let the sheet build it" routes

## [0.9.8] — 2026-08-10

### Changed
- Keep the compendium page id, and log the "let the sheet do it" option

## [0.9.7] — 2026-08-10

### Added
- Count and name the payload records a claim doesn't write

## [0.9.6] — 2026-08-10

### Added
- Write a claimed weapon's attacks and damage

## [0.9.5] — 2026-08-10

### Changed
- Place claimed items loose, and capture the attack wiring

## [0.9.4] — 2026-08-10

### Changed
- Dump one weapon instead of a whole sheet

## [0.9.3] — 2026-08-10

### Added
- Dump enough to work out how the sheet wires an attack to its weapon

## [0.9.2] — 2026-08-10

### Fixed
- Use the compendium's own Item record, so a weapon lands as a weapon

## [0.9.1] — 2026-08-10

### Added
- A diagnostic that can tell the two "landed as a possession" causes apart

## [0.9.0] — 2026-08-10

### Added
- Weapon data on claim, party-only split recipients, deposit from sheet
- Automated test suite for the sheet writes and storage init

## [0.8.4] — 2026-08-10

### Fixed
- Players pick up a game the DM sets up later, without reloading

## [0.8.3] — 2026-08-09

### Fixed
- Obscured items must look ordinary to players

## [0.8.2] — 2026-08-09

### Changed
- File storage handouts into a journal folder

## [0.8.1] — 2026-08-09

### Added
- Claim items and coin shares to character sheets
- INSTALL.md — player-facing install guide for Chrome and Firefox

### Changed
- Distinguish a half-completed claim from a failed one

## [0.7.1] — 2026-08-09

### Fixed
- Split emptying the purse; dialog contrast; obscure one of a stack

## [0.6.1] — 2026-08-08

### Added
- Obscured items — true stats in GM-only storage
- GM-only log for DM secrets, and visible redaction of obscured item names

### Changed
- Warn that obscuring cannot un-say the activity log

## [0.5.0] — 2026-08-08

### Changed
- Bag creation is DM-only (INV-4 revised by platform limit)

## [0.4.2] — 2026-08-08

### Added
- Role badge, launcher icon, split-preview contrast, honest player-create failure

## [0.4.1] — 2026-08-08

### Added
- Search, per-bag sorting, and bag rename/description

### Fixed
- Destroy droppables when re-rendering the panel

## [0.3.1] — 2026-08-08

### Added
- Coin splitting with preview — convert-down, remainder stays, assignment records
- Sheet-write module; make coin splits exactly-once

## [0.2.1] — 2026-08-08

### Changed
- Replace launcher emoji with plain text and an inline SVG chest

## [0.2.0] — 2026-08-08

### Changed
- Roll20-native restyle, resizable panel, roomier layout

## [0.1.3] — 2026-08-08

### Fixed
- Never scan before the journal has actually downloaded

## [0.1.2] — 2026-08-08

### Fixed
- Suppress Roll20's double-drop, Firefox loading, boot diagnostics

## [0.1.1] — 2026-08-08

### Fixed
- Duplicate-storage bug — wait for handout bodies before initialising

## [0.1] — 2026-08-08

### Fixed
- Move-dialog radio selection, silent purse overdraw

## Storage schema

The storage schema version is currently `SCHEMA = 1` (defined in `extension/src/storage.js`). Any future change to the schema must be recorded in this changelog, because older installations at the same table go read-only when they encounter data from a newer schema version.
