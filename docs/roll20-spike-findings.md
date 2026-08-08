# Roll20 Spike Findings — Final

**Completed:** 8 August 2026, in one day of paired testing.
**Method:** Console snippets written by Claude, run by DR in a dedicated test
game ("Browser Extension Test", D&D 2024 sheet, Jumpgate backend) with the
main account as GM and a second free account ("Emerald Slip") as the player,
in two browser windows on one machine. Raw console output pasted back
verbatim; every claim below traces to observed output. Campaign identifiers
are redacted per repo rules. All working spike code is in `spikes/`.

## Verdict in one paragraph

**Both blocking spikes passed; the product as designed is buildable.** Shared
handout storage works: players can write to DM-created handouts, sync is
sub-second, and read-only sharing is enforced server-side. Character-sheet
writes work on the 2024 sheet end-to-end, verified in Roll20's own UI.
Compendium drops resolve through a same-origin endpoint that returns
everything INV-10 needs. Two designs changed along the way: the activity log
must be sharded per writer (concurrent writes silently lose data), and
obscured-item true stats need a GM-only side handout (gmnotes leaks on shared
handouts). Two scope decisions were taken by DR: v1 is Jumpgate-only, and
sheet writes target the 2024 sheet only, with the INV-24 assignment fallback
elsewhere.

## Status board

| Spike | Question | Result |
|---|---|---|
| S1 | Player write to shared handout (BLOCKING) | **PASS** |
| S1b | gmnotes withheld on shared handouts? | **NO — leaks.** Hidden per-item data needs GM-only handouts |
| S2 | Write items/coin to character sheets (BLOCKING) | **PASS on the 2024 sheet**; 2014 deferred by scope decision |
| S3 | Compendium drop resolution | **ANSWERED** — jQuery-UI drops; same-origin `getPages` returns sheet-ready data |
| S4 | Handout body size limits | **ANSWERED** — no ceiling up to 8 MB; capacity is a non-issue |
| S5 | Concurrent writes (SYS-7) | **ANSWERED** — silent last-write-wins; loser discarded, no signal |
| S6 | Legacy backend | **CLOSED by scope decision** — v1 is Jumpgate-only |

---

## S1 — Player write to a shared handout — PASS

**How tested:** GM created handout `SPIKE-S1-R2` shared with the player
(`inplayerjournals` = view, `controlledby` = edit) with a secret planted in
gmnotes; the player read it, wrote a timestamped marker, and a GM-side
watcher measured arrival; then edit rights were revoked and the write
repeated. (A first run was contaminated by a leftover duplicate handout from
an out-of-order dry run — operator sequencing, not Roll20 behaviour — and was
redone clean with duplicate guards and run-specific markers. Snippets:
`spikes/s1/`.)

**Results**

1. **Player write works.** With the player's ID in `controlledby`, the
   player client's `updateBlobs({notes})` write persisted and was confirmed
   by re-read. The shared-inventory premise holds; the C2/Q18 storage
   decision stands. INV-13/INV-15/INV-18 are implementable as designed.
2. **Sync is sub-second.** The GM client, polling at 1 s without a reload,
   saw the player's write **~611 ms** after it was made. SYS-6's 5-second
   target is beaten by an order of magnitude.
3. **Read-only is enforced server-side, and rejection is SILENT.** With
   `controlledby` cleared (view kept), the player's write produced no
   exception and no callback error — only a Firebase console warning
   (`update at /campaign-<redacted>/hand-blobs/<handout-id> failed:
   permission_denied`). The write did not stick in the player's own re-read
   and never reached the GM. QST-19's read-only quests are genuinely
   enforceable by leaving players out of `controlledby` — and no write may
   ever be assumed successful at the call site.
4. **S1b — gmnotes leaks on shared handouts.** The player's
   `_getLatestBlob("gmnotes")` returned the GM's secret on a handout shared
   via `inplayerjournals`. The original findings' "gmnotes withheld" result
   applies **only to fully GM-only handouts**. Obscured-item true stats
   (INV-16, PRD C6.1) must live in a GM-only side handout, never in gmnotes
   of anything players can see.
5. **Reference handouts by ID, never by name.** Two handouts can share a
   name, and name lookups then diverge per client — the run-1 contamination
   proved it in practice.

**API surface confirmed on Jumpgate, both roles:**
`Campaign.handouts.create({name, inplayerjournals, controlledby, archived})`,
`handout.updateBlobs({notes, gmnotes})`, `handout._getLatestBlob(field, cb)`
(async), `handout.save({...})`, `handout.destroy()`, `Campaign.players`.

## S2 — Character sheet writes — PASS on the 2024 sheet

**Architecture discovery:** `dnd2024byroll20` is a Beacon sheet, not a
classic attribute sheet. A character has ~5 attributes (`store`, `updateId`,
`builder`, `appState`, `sheetVersion`); `store` is a single JSON document
(~57 KB nearly empty) holding the whole character. Almost everything lives
in `store.integrants.integrants`: a flat ID → record map where items,
attacks, damage entries, actions, features **and the five currencies** are
all records linked by `parentID`/`childIDs`. There are no
`repeating_inventory_*` rows; the original findings §7 assumed the classic
model, wrongly for this sheet. A never-opened character has no store at all
(the sheet initialises it on first open) — the case that matters in real
games is data existing server-side but not loaded in this client.

**Background load — PASS.** On a fresh client with zero attributes loaded
and the sheet never opened,
`char.attribs.backboneFirebase = new BackboneFirebase(char.attribs)`
populated everything within **1 second** (collection URL:
`/char-attribs/char/<character-id>/`). Character data is loadable in the
background, per character, on demand — the lazy-loading fear behind
INV-21/INV-23/INV-20g is dead. Note: loaded this way, `store` is a live
object, not a JSON string.

**Write test — PASS, verified in Roll20's own UI.** After backing the store
up to a handout (and verifying the backup before changing anything,
`spikes/s2/write-test.js`), a plain Item record ("Spike Test Rope") was
added and registered in its parent's `childIDs`, gold's `value` was set to
7, the store saved back via `storeAttrib.save({current})` and `updateId`
bumped. Opening the sheet showed the rope in inventory and gold at 7, sheet
loading normally; `restore.js` returned it exactly, sheet still healthy.
Full round trip: write → render → restore → render.

**Record shapes that matter:**

- *Currency:* one record per denomination, the amount a single `value`
  field: `{_id:"gold", type:"Currency", name:"Gold", value:0,
  conversion:{amountOfTarget:10, target:"silver"}, ...}`. Coin writes are
  one-field changes, and the conversion chain (platinum→gold→silver→copper,
  electrum→silver) is declared in the data, so INV-20c's convert-down maths
  can read the sheet's own rates rather than hardcoding them.
- *Item:* `name`, `description`, `quantity`, `weight`, `cost` (display
  string, "15 GP"), `rarity`, `equipData`, graph links, and
  `compendiumPageID` on compendium-sourced items — a clean INV-10 mapping.
- **Gotcha: `childIDs` is a STRING containing a JSON array**
  (`"[\"id1\",\"id2\"]"`). Parse, modify, re-stringify; treating it as an
  array corrupts the record.
- One UI "item" can be a graph: a weapon carries parent-linked Attack and
  Damage records (the observed Torch — class starting equipment inside an
  Explorer's Pack container — had four). A mundane item needs one record
  plus parent registration.

**Residuals, neither blocking:** the 2014 sheet is untested and deferred by
scope decision — INV-24's assignment state is the decided behaviour for any
non-2024 sheet; and the write was made by the GM client — a player writing
to a character they control uses the same path but has not been exercised.

## S3 — Compendium drop resolution — ANSWERED

**Drop mechanics.** Only the **jQuery UI** drop fires; the HTML5 drop event
never arrives despite `draggable="true"` on the source. The dragged element
(`.compendium-page__upper`) carries exactly two data attributes —
`data-pagename` (percent-encoded, `Items%3ALongsword`) and
`data-expansionid` — and nothing else: a drop yields an identifier, not an
item, exactly as the original findings said. Two extra lessons: never
stringify `ui.draggable.data()` (it contains a cross-origin Window and
throws a SecurityError — read the element's attributes and stop), and
search results are category-ambiguous — "Longsword" appears as both an
*Items* page and an identically-named *Proficiencies* page, so the panel
must accept only `Items:` pagenames.

**Resolution — better than C4/Q20 priced in.** The undocumented cross-origin
GraphQL endpoint is only the *search* path (its exact `searchPages`
query — operation name, variables `{searchTerm, ruleSystem:"dnd5e"}`, full
query text — was captured for future use). Drops resolve through a
**same-origin, plain GET**:

```
GET /compendium/compendium/getPages?bookName=dnd5e
    &pages[]=<pagename, double-encoded (Items%253ALongsword)>
    &sharedCompendium=<campaign id>
    &expansionId=<expansion id>&dragDropRequest=true
```

It returns an array of JSON strings, each a full page record `{name, id,
expansion, expansioninitials, data:{...}}` where `data` holds the display
fields (Item Type, Properties, Rarity, damage, weight, filters) **and
`data-datarecords` — the exact Beacon payload graph (Item / Attack / Damage,
parent-linked) the 2024 sheet consumes**. Verified in full for both the 2024
(expansion 33335) and 2014 (expansion 34047) Longsword records; the payload
format is uniform across rulesets even though sheet-writing is not.

**Miss and failure shapes are identical and unambiguous.** An unowned item
("Vorpal Sword" against the free rules) and a nonexistent page both return
HTTP 200 with a stub:

```
["{\"name\":\"Vorpal Sword\",\"expansion\":0,\"data\":{\"blobs\":[],\"Category\":\"Items\"}}"]
```

No `id`, `expansion: 0`. **Detection rule: a record without an `id` is
unresolved → store name-only (INV-11 fallback).** "Unowned" and
"nonexistent" cannot be told apart, and don't need to be.

**Consequences:** INV-10 is satisfiable with no dependency on the
cross-origin GraphQL endpoint for resolution; resolved `data-datarecords`
mean a compendium-dropped item can later be pushed to a 2024 sheet with its
full attack/damage graph; and stored-at-drop-time (already required) also
sidesteps per-viewer entitlement differences.

## S4 — Handout body size limits — ANSWERED

Progressive writes up to **8,000,000 characters** succeeded. (The first
probe verified against the local cache — a flaw, honestly noted — so the top
size was re-verified after a 12-second wait, long enough to catch the
delayed-revert failure mode S1 demonstrated. It held, zero Firebase
messages.) At ~1–2 KB per stored item and ~150 bytes per log entry,
capacity is a non-issue for the life of a campaign (INV-22b, INV-27).

## S5 — Concurrent writes — ANSWERED: silent last-write-wins

Both clients appended one line to the same handout body at 6 synchronized
instants, 10 s apart (read body, append own line, write back — the naive
shared-log pattern; console timestamps prove the two windows fired within
1–2 ms of each other). **The same side lost every round: all 6 player lines
survived, all 6 GM lines vanished.** No errors, no warnings, no notification
on either side; the loser's client believes it wrote. Uncontended writes
from the losing client demonstrably work (its base marker survived and was
read by the other side), so the loss is purely a property of contention.

**Answers to the brief:** last-write-wins on the whole body; nobody is
notified; the losing write is discarded in its entirety.

**Design consequences (SYS-7, SYS-8, C6.3):**

1. **The activity log cannot be one shared handout.** Each client appends
   only to its own per-writer log handout; readers merge shards by
   timestamp. (Side benefit: each shard has a single author, which blunts
   the tampering concern.)
2. **Bags are multi-writer too**, at lower frequency. After every write,
   re-read and confirm; if the change vanished, reapply. With sub-second
   sync, retries converge and the user sees one winner.
3. **A verify-and-retry layer wraps every write.** Rejection (permissions)
   and loss (contention) are both silent and look identical to success.

## S6 — Legacy backend — CLOSED by scope decision

Not tested. DR's decision: v1 targets Jumpgate only — an outcome the spike
brief explicitly allowed. The extension must detect the backend
(`VTT Engine: jumpgate` in startup logs; `release` on campaign data) and
decline cleanly on Legacy games with a plain message, not a broken panel.
The same decision defers the 2014-sheet write integration; INV-24's
assignment state is the decided behaviour for non-2024 sheets.

---

## Consolidated consequences for the build

1. **Storage layout (revises Q19):** one handout per bag and per quest, an
   index handout, **per-writer activity-log shards**, and a **GM-only side
   handout for hidden per-item data** (obscured items' true stats). All
   referenced by handout ID, never name; all names opaque (C1).
2. **Every write goes through verify-and-retry** — re-read or echo after
   writing, reapply if lost. Applies to handouts and sheet writes alike.
3. **Sheet transfers:** the 2024 sheet gets full writes (background-load
   attribs → edit store → bump `updateId` → verify); everything else gets
   the INV-24 assignment state. Compendium-sourced items can carry their
   full Attack/Damage payload graph to the sheet via `data-datarecords`.
4. **Drops:** the panel registers as a jQuery UI droppable; accepts only
   `Items:` pagenames; resolves via same-origin `getPages`; stores resolved
   data at drop time; falls back to name-only when the record has no `id`.
5. **Backend gate:** detect and refuse cleanly on non-Jumpgate games.
6. **Reusable spike code** (in `spikes/`): handout create/read/write/perms
   helpers (s1), the BackboneFirebase background loader and store
   read/write/restore pattern (s2), the drop-capture pattern and `getPages`
   resolver (s3), and the write-verification idiom used throughout.

## Residual risks, stated plainly

- **Player-client sheet writes** (to characters they control) are expected
  to work but untested — a 10-minute check with the second account before
  the transfer feature ships.
- **Everything used is undocumented** (`BackboneFirebase`, `updateBlobs`,
  `getPages`, the Beacon store format) and can change under us without
  notice. C5's maintenance posture stands: the extension should fail loudly
  and read-only-safely when shapes stop matching, never guess.
- **The 2024 sheet write bypasses the Beacon sheet's own code path.** It
  rendered our records correctly in this test, but sheet updates can change
  the store schema (`sheetVersion` exists for a reason). The writer must
  check `sheetVersion` and refuse to write a shape it doesn't recognise.

---

## Post-spike finding — players cannot create handouts (8 Aug 2026)

Found in live build testing, not in the spike phase, because every spike
created handouts from the GM client.

**Observed:** a player-role client calling `Campaign.handouts.create(...)`
gets `permission_denied` from Firebase on `/campaign-<redacted>/handouts/<id>`
and again on the follow-up `hand-blobs` write. Silent as ever at the call
site — no exception, no callback error.

**Consequence:** bags are handouts, so **players cannot create bags**. PRD
INV-4 and decision Q1 ("anyone can create bags") were not implementable as
written. DR's decision: bag creation is DM-only for v1 (PRD v0.5). Every
other player right is unaffected — adding, moving and removing items and
editing coin all write to handouts that already exist, which S1 verified.

**If it ever needs revisiting:** player-created bags could live as entries
inside a single shared container handout the DM's client creates, since S1
proved players can write to shared handout bodies. The cost is that such
bags could not be hidden or per-player revealed individually, because
visibility is a property of the handout, not of entries within it.

**Lesson for the remaining build:** the spikes only ever exercised the GM
path for object *creation*. Any future feature where a player's client
creates a Roll20 object (characters, pages, macros) should be assumed
forbidden until tested from the player account.
