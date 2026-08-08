# Roll20 Spike Findings

**Started:** 8 August 2026
**Method:** Console snippets written by Claude, run by DR in a dedicated test
game ("Browser Extension Test") with the main account as GM and a second free
account ("Emerald Slip") as the player, in two browser windows on one machine.
Raw console output pasted back verbatim. Campaign identifiers are redacted in
this document per repo rules. The test game runs the D&D 2024 sheet (covers
both 2014 and 2024 rules) on the Jumpgate backend.

**Status board**

| Spike | Question | Status |
|---|---|---|
| S1 | Player write to shared handout (BLOCKING) | **PASS** — certified 8 Aug 2026 |
| S1b | gmnotes withheld on shared handouts? | **NO — leak confirmed.** gmnotes is unsafe on any player-visible handout |
| S2 | Write items/coin to character sheets (BLOCKING) | **PASS on the 2024 sheet** — item + coin written, rendered by the sheet UI, cleanly restored. 2014 sheet: deferred by scope decision, INV-24 fallback applies |
| S3 | Compendium drop resolution | Nearly answered — jQuery-UI-only drops confirmed; same-origin getPages endpoint returns full sheet-ready item data; miss/failure shapes pending |
| S4 | Handout size limits | **ANSWERED** — no ceiling up to 8MB (verified with 12s persistence wait); no practical constraint |
| S5 | Concurrent writes | **ANSWERED** — silent last-write-wins; loser discarded with no signal |
| S6 | Legacy backend | **CLOSED by scope decision (DR, 8 Aug 2026)** — v1 is Jumpgate-only; Legacy untested and unsupported |

---

## S1 — Player write to a shared handout — **PASS** (8 Aug 2026)

**How tested:** run 1 was contaminated by a leftover duplicate handout (all
steps had been run once in a single window first, leaving a stray `SPIKE-S1`;
find-by-name then sent the two clients to different objects). Operator
sequencing, not Roll20 behaviour. The certified run used a fresh handout
`SPIKE-S1-R2` after deleting all spike handouts, with duplicate guards and
run-specific markers. Snippets: `spikes/s1/`.

**Results**

1. **Player write works.** With the player's ID in `controlledby`, the player
   client's `updateBlobs({notes})` write persisted and was confirmed by
   re-read. The shared-inventory premise holds; the C2/Q18 storage decision
   stands. INV-13/INV-15/INV-18 are implementable as designed.

2. **Sync is sub-second.** The GM client, polling at 1 s intervals without a
   reload, saw the player's write ~611 ms after it was made (poll granularity
   means true latency is ≤ 611 ms). SYS-6's 5-second target is beaten by an
   order of magnitude.

3. **Read-only is enforced server-side, and rejection is SILENT.** With
   `controlledby` cleared (view kept via `inplayerjournals`), the player's
   write produced no exception and no callback error — only a Firebase console
   warning (`update at /campaign-<redacted>/hand-blobs/<handout-id> failed:
   permission_denied`). The write did not appear in the player's own re-read
   and never reached the GM. **Design consequences:** (a) QST-19's read-only
   quests are genuinely enforceable by leaving players out of `controlledby`;
   (b) SYS-7/SYS-8: the extension must confirm every write by re-read or
   echo, because a rejected write looks identical to a successful one at the
   call site.

4. **S1b — gmnotes leaks on shared handouts.** On a handout shared via
   `inplayerjournals`, the player's `_getLatestBlob("gmnotes")` returned the
   GM's secret. (The `gmnotes` *attribute* was `undefined`; the blob is where
   the content lives, and the blob is delivered.) The original findings doc's
   "gmnotes withheld" result applies **only to fully GM-only handouts**.
   **Design consequence (PRD C6.1):** obscured-item true stats must live in a
   GM-only handout, never in the gmnotes of a player-visible one.

5. **Reference by ID, never by name** (from the run-1 contamination): two
   handouts can share a name, and name lookups then diverge per client. The
   product's index must store Roll20 handout IDs.

**API surface confirmed working on Jumpgate, both roles:**
`Campaign.handouts.create({name, inplayerjournals, controlledby, archived})`,
`handout.updateBlobs({notes, gmnotes})` (write),
`handout._getLatestBlob(field, cb)` (async read),
`handout.save({controlledby})` / `handout.destroy()` (GM),
`Campaign.players` for enumerating seated accounts.

**Verdict:** the blocking assumption holds. Shared handout storage is viable
for the party inventory, with write-verification and a GM-only side store for
hidden per-item data.

---

## S5 — Concurrent writes — **ANSWERED: silent last-write-wins** (8 Aug 2026)

**How tested:** both clients appended one line to the same handout body at 6
synchronized instants, 10 s apart (read body, append own line, write back —
the pattern a naive shared activity log would use). Start time was planted in
the handout body by the GM client and read by the player client; console
timestamps show the two windows fired within 1–2 ms of each other every
round, so synchronization was real and neither window was throttled.

**Observed**

- Both clients attempted all 6 writes (both consoles show all six
  `appended:` lines with aligned timestamps).
- The final body — identical from both clients — contained **all 6 player
  lines and zero GM lines**. The same side lost every round.
- No errors, no exceptions, no permission warnings, no notification of any
  kind on either side. The loser's client believes it wrote.
- GM writes demonstrably work uncontended (the GM-written base marker
  survived and was read by the player), so the loss is a property of
  contention, not of the GM client.

**Answers to the brief's three questions:** it is last-write-wins on the
whole body; neither side is notified; data is silently lost — the losing
write is discarded in its entirety.

**Design consequences (PRD SYS-7, C6.3)**

1. **The activity log cannot be a single shared handout.** Every client
   appending to one body guarantees silent entry loss. Layout change: each
   client appends only to its own per-writer log handout; readers merge all
   log handouts by timestamp. (Also neutralises the tamper concern partially
   — a client's log shard is written by one account.)
2. **Bags are multi-writer and carry the same risk** at lower frequency (two
   players editing the same bag in the same second). Required mitigation:
   after every write, re-read and confirm; if the change vanished, reapply.
   Combined with sub-second sync (S1), retries converge quickly and the user
   sees "one winner", satisfying SYS-7.
3. Reinforces S1 finding 3: **no write may ever be assumed successful.**
   Rejection (permissions) and loss (contention) are both silent; the
   echo-verify layer covers both.

**Verdict: answered. No redesign of the storage decision required, but the
log layout changes to per-writer shards and all writes go through a
verify-and-retry layer.**

---

## S4 — Handout body size limits (run 1, 8 Aug 2026) — provisional

Progressive writes of 10 KB → 8,000,000 characters to a GM-only handout all
"verified" instantly, with zero Firebase warnings or errors, and the handout
deleted cleanly afterwards.

**Caveat, honestly held:** the probe's verification read returned in 0–1 ms,
meaning it read the browser's local cache — it proves no client-side ceiling
and that no rejection arrived during the run, but it cannot prove the server
accepted the 8 MB write (S1 showed rejections surface as a delayed local
revert, seconds later). S4b re-checks the top size with a 12-second wait
before verification.

**S4b (same day):** a single 8,000,000-character write, verified after a
12-second wait (long enough for the delayed-revert failure mode S1
demonstrated), PASSED with no Firebase messages, and the handout deleted
cleanly.

**Verdict: answered — no ceiling up to 8 MB per handout body.** At ~1–2 KB
per stored item and ~150 bytes per log entry, capacity is a non-issue for
the life of a campaign (INV-22b, INV-27). The activity log would fit in one
handout for decades; it is sharded per-writer anyway because of S5, not
because of size.

---

## S2 — Character sheet writes (recon, 8 Aug 2026) — in progress

**Discovery: the D&D 2024 sheet (`dnd2024byroll20`) is not a classic
attribute sheet.** A character with one hand-added inventory item and coin
has just **five** attributes: `store`, `updateId`, `builder`, `appState`,
`sheetVersion`. `store` is a single large JSON document holding the whole
character — Roll20's newer Beacon-style sheet architecture. There are no
`repeating_inventory_*` rows.

**Consequences**

1. Writing an item or coin to a 2024-sheet character means editing the
   `store` JSON (and presumably bumping `updateId` so other clients notice),
   not creating attribute rows. The original findings doc §7 assumed the
   classic model; that assumption was wrong for this sheet.
2. The 2014 sheet, when tested (needs its own game — sheet choice is
   per-campaign), will be the classic row-based architecture. The two
   integrations in PRD C3 share almost nothing.
3. A never-opened character has no `store` at all (`Spike Cold`: 0 attribs) —
   the sheet initialises its data on first open. For the product this is the
   rare case (players open their characters' sheets constantly); the common
   case is data that exists server-side but is not loaded in this client,
   which is what the background-load test targets.
4. The character model also exposes `updateBlobs`/`_getLatestBlob` (bio and
   gmnotes blobs), and each `attribs` collection carries a `backboneFirebase`
   slot and a `url` — the presumed lazy-load wiring.

**Background load: PASSED (same day).** On a freshly reloaded client with
`attribs loaded = 0` and no sheet ever opened:
`c.attribs.backboneFirebase = new BackboneFirebase(c.attribs)` populated all
5 attributes (including `store`) within **1 second**. The collection's URL
is `/char-attribs/char/<character-id>/`. This kills the scariest half of S2:
character data is loadable in the background, per character, on demand.

**Correction from the first structure dump:** when loaded this way,
`store`'s `current` value is a live nested **object**, not a JSON string —
Firebase stores the tree natively. Reads need no parsing; the structure
dump was re-issued accordingly.

**Store structure (mapped 8 Aug 2026).** `store` is ~57 KB serialised for a
nearly-empty character, in 24 top-level sections (`about`, `actions`,
`inventory`, `currencies`, `integrants`, `settings`, …). One section holds
almost everything: `store.integrants.integrants` (54.7 KB of the 57 KB) is a
flat map of ID → record, where each record carries `_id`, `name`, `type`,
`parentID`, `childIDs`, `source`, `shortID`, `createdTime`, and
type-specific fields. Items, attacks, damage entries, actions and the five
currencies are all integrants in this one map, linked by ID.

Landmarks from the hand-added Torch and 10 gp:

| Path | Contents |
|---|---|
| `store.integrants.integrants.<id>` | every item/attack/damage/action/currency record |
| `store.integrants.integrants.{copper,silver,electrum,gold,platinum}` | currency records, each with a `conversion` ({amountOfTarget, target}) chain: platinum→gold→silver→copper, electrum→silver |
| `store.currencies` | only `{"initialized":true}` — the amounts are NOT here |
| `store.inventory` | 100 chars — small; likely container/config, not the item list |
| `updateId` (sibling attribute) | opaque token, presumably the change signal to other clients |

**Important consequence: one UI item is a graph of records, not a row.** The
single hand-added Torch produced at least four linked integrants — the item
(`e58XAtolfk3D7vmpjsepY`), an attack (`rJ96b252qbNs7ukHSsudO`), a damage
record (`DrUbJqb-t9jRwoOdakake`, `parentID` → the attack, `sourceID` → the
item, `cascades` back to the item) and a "Light Torch" action — all children
of a container integrant (`E_LA4Y-6zRqYtCiW5YH-K`) whose `childIDs` lists
them. Records also carry `compendiumPageID`, tying sheet items back to
compendium entries (relevant to S3), and `cost` as a display string
(`"10 GP"`).

For the product this is workable but not trivial: a mundane item (rope, a
quest trinket) plausibly needs one item record plus registration in its
container's `childIDs`; anything with an attack needs the linked set. The
2014 sheet will share none of this. Both are why INV-24's assignment
fallback stays in the spec.

**Record shapes (full dumps, 8 Aug 2026).**

*Currency* — one integrant per denomination, the amount in a single field:
```
{_id:"gold", type:"Currency", name:"Gold", value:0,
 conversion:{amountOfTarget:10, target:"silver"},
 childIDs:"[]", parentID:"", shortID:"bUSM9LqoM", _enabled:true, ...}
```
Writing coin to a 2024 sheet is therefore a one-field change per
denomination. The conversion chain (platinum→gold→silver→copper,
electrum→silver) is declared in the data, so INV-20c's convert-down maths can
read the sheet's own rates rather than hardcoding them.

*Item* — e.g. the Torch:
```
{_id:"e58XAtolfk3D7vmpjsepY", type:"Item", name:"Torch", recordName:"Torch",
 quantity:10, weight:1, cost:"1 CP", rarity:"", description:"A torch burns…",
 equipData:{equippable:true, equipped:false}, parentID:"E_LA4Y…",
 sourceID:"E_LA4Y…", source:"Item", compendiumPageID:"620473f664f27f21de838dc3",
 childIDs:"[\"rJ96b252qbNs7ukHSsudO\"]", shortID:"qjpz4I2wn", …}
```

**Three things that matter for the build:**

1. **`childIDs` is a STRING containing a JSON array**, not an array —
   `"[\"id1\",\"id2\"]"`. Parse and re-stringify; treating it as an array
   corrupts the record.
2. **The observed Torch was not hand-added** — it is a child of an
   *Explorer's Pack* item, itself from class starting equipment. Containers
   nest via `parentID`/`childIDs`, and the pack's contents each carry an
   attack/damage sub-graph where relevant. A plain item needs one record plus
   registration in its parent's `childIDs`.
3. **`compendiumPageID` links sheet items back to compendium entries**
   (Torch → `620473f664f27f21de838dc3`), which is a second, independent route
   into compendium data and directly relevant to S3.

Item fields map cleanly onto INV-10: name, description, weight, cost,
rarity, quantity all exist natively.

**Write test: PASS (8 Aug 2026).** `spikes/s2/write-test.js` backed the
store up to a handout (verified before changing anything), then:

- added one plain Item integrant ("Spike Test Rope": name, description,
  quantity, weight, cost — no attack/damage sub-graph), registered in its
  parent's `childIDs`;
- set the gold currency integrant's `value` to 7;
- wrote the store back with `storeAttrib.save({current})` and bumped
  `updateId` to a fresh token.

**Confirmed in Roll20's own sheet UI:** the rope appeared in the inventory,
gold displayed 7, and the sheet loaded normally — no errors, no complaint.
`restore.js` then put the original store back from the backup handout, and
the sheet again loaded cleanly with the test data gone. Full round trip:
write → render → restore → render.

**S2 verdict: PASS for the 2024 sheet.** INV-21/INV-23/INV-20g are
implementable on `dnd2024byroll20`: background-load the attribs (~1s), edit
the store object, bump `updateId`, verify by re-read. Two residuals, neither
blocking:

1. **The 2014 sheet is untested** — it needs its own test game (sheet choice
   is per-campaign) and is a different architecture entirely. Until tested,
   INV-24's assignment fallback is the honest promise for 2014-sheet games.
2. **The write was made by the GM client.** A player claiming an item writes
   to a character they control; Roll20's permission model should allow the
   same path (`controlledby` on the character), but it has not been
   exercised. Small follow-up test with the player account when convenient.

---

## S6 — Legacy backend — **CLOSED by scope decision** (8 Aug 2026)

Not tested. DR's call: v1 focuses on the 2024 sheet and the Jumpgate backend;
Legacy is out of scope. The spike brief explicitly allowed this outcome
("declaring v1 Jumpgate-only is a legitimate outcome").

**Consequences**

1. The extension must detect the backend and refuse cleanly on Legacy games
   (a clear "this game runs Roll20's Legacy engine, which isn't supported"
   message, not a broken panel). The marker is available in page context —
   the VTT startup logs report `VTT Engine: jumpgate`, and the findings doc
   recorded `release: "jumpgate"` on campaign data.
2. The same decision defers the 2014-sheet write integration (S2 residual 1).
   v1 sheet transfers target `dnd2024byroll20` only; in games with any other
   sheet, transfers use INV-24's explicit "assigned to" state and the player
   moves the item by hand. This is now a decided product behaviour, not a
   fallback that happens by accident.
3. PRD C3, Q9 and DEL-1's framing ("v1 supports 2014 and 2024") narrows to:
   full support on 2024, assignment-only on everything else. To be folded
   into the post-spike PRD revision.

---

## S3 — Compendium drop resolution (8 Aug 2026) — nearly answered

**How tested:** fetch/XHR hooks in the main frame captured the VTT's own
compendium traffic during a search and a drop; a test drop target registered
both an HTML5 drop listener and a jQuery UI droppable.

### Drop mechanics — findings confirmed, plus one correction to my own tooling

- **Only the jQuery UI drop fired.** The HTML5 `drop` event never arrived
  despite `draggable="true"` on the source element. The panel must register
  as a jQuery UI droppable (UI-5); an HTML5-only listener sees nothing.
- The dragged element (`.compendium-page__upper`) carries exactly two data
  attributes: `data-pagename` (percent-encoded, e.g. `Items%3ALongsword`)
  and `data-expansionid` (e.g. `33335`). Nothing else. As per the original
  findings: a drop yields an identifier, not an item.
- **Do not call `ui.draggable.data()` wholesale** — it contains a reference
  to the cross-origin compendium iframe's Window and stringifying it throws
  a SecurityError. Read the two attributes off the element and stop.
- Search results are category-ambiguous: "Longsword" appears as both an
  *Items* page and a *Proficiencies* page with identical names in the list
  (the test drop of the "2014 Longsword" actually delivered
  `Proficiencies%3ALongsword`). The panel must check the category prefix of
  `data-pagename` and only accept `Items:`.

### Resolution — better than the brief assumed

The GraphQL endpoint is only the **search** path. On an actual drop the VTT
calls a **same-origin, plain-GET** endpoint:

```
GET /compendium/compendium/getPages
    ?bookName=dnd5e
    &pages[]=<pagename, double-encoded (Items%253ALongsword)>
    &sharedCompendium=<campaign id>
    &expansionId=<expansion id>
    &dragDropRequest=true
```

It returns an array of JSON strings, each a full page record:
`{name, id, expansion, expansioninitials, data:{...}}`, where `data` holds
the item's display fields (Item Type, Properties, Rarity, Mastery, filters)
**and `data-datarecords` — the exact Beacon payload set the 2024 sheet uses
to build its integrant graph**: an Item payload (name, description, weight,
properties, cost, weaponData, equipData) plus parent-linked Attack and
Damage payloads. Observed for the 2024 Longsword in full.

**Consequences**

1. INV-10 is satisfiable with **no dependency on the undocumented
   cross-origin GraphQL endpoint for resolution** — same-origin `getPages`
   provides everything, with the caller's own cookies. Fragility drops
   substantially versus what C4/Q20 priced in.
2. The `data-datarecords` payloads mean a compendium-dropped item can later
   be pushed to a 2024 sheet **with its full attack/damage graph**, not just
   the S2 plain-item shape — the payload format matches what S2 observed
   inside the store.
3. The captured GraphQL `searchPages` query (operation, variables
   `{searchTerm, ruleSystem:"dnd5e"}`, full query text recorded in the raw
   capture) is available if the product ever wants its own search box, but
   is not needed for the drop flow.
4. The 2014 record observed was the Proficiencies page (thin: type/source
   only, empty `content`). The true 2014 *Items* record and the miss/failure
   shapes are covered by `spikes/s3/resolve-test.js`, results pending.

**Remaining before S3 closes:** the 2014 Items:Longsword record shape, and
what a miss (unowned/absent item) and a nonexistent page return — which
define when the product falls back to a name-only entry (INV-11).
