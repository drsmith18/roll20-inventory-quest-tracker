# Future ideas and table feedback

Things worth building, and the reasons they aren't built yet. Everything here
came from playing the thing — this file is where an idea waits until it's
either scoped into the PRD or dropped.

Format: what was asked for, what it would actually take, and **what would
settle the open question**, so the next person picks up an investigation
rather than a vague wish.

---

## Shop character sheets — buying and selling

**Asked for (Aug 2026, player feedback):** the DM tees up "shop" characters,
and players buy items from them — onto their own sheet, or straight into the
party inventory.

This is the most requested idea so far and it fits the tool's shape: a shop
is a bag with prices and an owner.

**What has to be true first, and isn't known yet:**

1. **Is a shop sheet a Beacon sheet?** `sheets.js` hard-refuses any
   `charactersheetname` that isn't `dnd2024byroll20`, deliberately (S2's
   "fail loudly, never guess"). If a shop sheet reports the same sheet name,
   or another Beacon sheet with the same `store.integrants.integrants`
   layout, most of the existing item read/write code applies as-is and the
   work is mostly widening that gate plus re-checking the version range. If
   it's a different structure, it's a new writer module and a much bigger
   job.

   **Settles it:** open a shop sheet in a test game and run
   `Campaign.characters.models.map(c => c.get("charactersheetname"))`.
   Record the answer here.

2. **Buying is a transaction, not a transfer.** A purchase is four writes —
   debit the buyer's coins, credit the shop's, remove the item from the
   shop, add it to the buyer — over a store where every write can be
   silently rejected or silently lost (S1/S5). The existing verify-and-retry
   idiom covers one write at a time. Four related writes with sensible
   partial-failure behaviour is a genuine design problem and the real cost
   of this feature, not plumbing.

   The ordering rule the rest of the codebase already uses is the starting
   point: do the write that can fail *before* the write that gives something
   away, and report a half-completed exchange loudly rather than swallowing
   it (see `doClaimItem`'s `halfDone`, and `depositItem`'s).

3. **Prices.** Items already carry a free-text `cost` ("15 GP") and
   `PT.costToCopper` parses it for value sorting. A shop needs a price per
   item that the DM can override, plus buy/sell rates. Probably a per-bag
   `prices` map rather than touching the item records.

**A cheaper first step, if the sheet answer is discouraging:** a "shop bag" —
an ordinary bag the DM marks as a shop, with prices, where "buy" moves the
item to the buyer's sheet and moves coins between the bag's purse and the
buyer. That reuses claiming and coin-splitting wholesale, needs no shop sheet
support at all, and would tell us whether the table actually enjoys shopping
in the panel before the expensive version gets built.

---

## Attack and damage records for a claimed weapon

**Answered, Aug 2026:** the compendium payload's real shape was captured from
a live longsword drop (`PT.sheets.report()`), and it is not what v0.9.0
assumed. A weapon's payload is five records:

```
[{name:"Longsword", payload:"{\"type\":\"Item\", ...}"}, ...]
```

Each payload has a `type` and its content fields, and **no `_id`, no
`parentID`, no `childIDs`**. The links between the five records are simply
not in the data. The v0.9.0 code was written for a pre-linked graph, so it
rejected every real payload and fell back to a synthesised plain item — which
is why longswords arrived as possessions.

v0.9.2 uses the compendium's own **Item** record as the base instead of
synthesising one. That carries `weaponData` (`{category, training, type}`),
`equipData.equippable`, `properties` and the full description, which is what
makes the sheet treat it as a weapon. **Confirmed working at the table** —
a claimed longsword now shows as a weapon rather than a possession.

**Confirmed at the table** that the sheet does NOT derive an attack from
`weaponData`: a claimed longsword showed as a weapon but offered no attack
roll even when equipped. So the payload's Attack and Damage records had to be
written too — done in v0.9.6, pending confirmation in play.

### The wiring, as read off a real sheet

Captured with `PT.sheets.weaponDump` from a longsword Roll20 itself put on a
character. This is the target structure; it does not need rediscovering.

A versatile weapon is **five records**: the Item, two Attacks (one-handed and
two-handed), and a Damage under each Attack.

```
Item  parentID: ""                        <- loose item; NOT a container id
      childIDs: "[attack1, attack2]"
      weaponData: {category, training, type}
      equipData: {equippable: true, equipped: false}
      properties: "[\"Versatile (1d10)\"]"   <- a STRING holding a JSON array
      source: "Class", sourceID: <class id>, compendiumPageID: <page id>

Attack  parentID: <itemId>                 <- child of the Item
        sourceID: <itemId>, source: "Item"
        childIDs: "[damageId]"
        cascades: { <itemId>: "[\"Equip\"]" }   <- ties the attack to equipping
        actionType: "Action"
        attack: { abilityBonus: "Strength", type: "Melee" }
        name: "Longsword (One-Handed)"
        recordName: "Longsword Attack One-Handed"

Damage  parentID: <attackId>               <- child of the ATTACK
        sourceID: <itemId>                 <- but sourced from the ITEM
        source: "Item"
        cascades: { <itemId>: "[\"Equip\"]" }
        _diceCount: 1, diceSize: "d8", damageType: "Slashing"
        ability: "auto", critDiceSize: "", overrideCrit: false
```

Note `diceSize: "d8"` with a separate `_diceCount`, not a `"1d8"` string.

Two things this dump already fixed, in v0.9.5:

- **Item placement.** A loose item belongs at `parentID: ""`. The code used
  to copy the parent of whichever top-level item it found first — and class
  starting equipment hangs off a `Class Level` record while still counting as
  top-level, so a claimed item could have been filed inside the character's
  Paladin class level. It only ever worked by luck of ordering.
- `subtreeIds` walking a real sheet showed `(cycle)` markers in ancestry
  output, i.e. the guards there earn their keep on real data.

### The compendium side, captured

`PT.sheets.payloadDump("Longsword")` on a bagged longsword returned five
records in the order **[Item, Attack, Damage, Attack, Damage]** — each Damage
immediately following the Attack it belongs to, which is the only pairing
signal available since none of them carry ids or links:

```
{"type":"Attack","name":"Longsword (One-Handed)",
 "attack":{"type":"Melee","abilityBonus":"Strength"}}
{"type":"Damage","ability":"auto","damageType":"Slashing","diceSize":"d8"}
{"type":"Attack","name":"Longsword (Two-Handed)", ...}
{"type":"Damage","ability":"auto","damageType":"Slashing","diceSize":"d10"}
```

The payload's records are thinner than the sheet's: no `_diceCount` (every
observed sheet record had 1), no `actionType` (the sheet's say `"Action"`),
no name on Damage records at all (the sheet names them after their attack).
Those are filled in on write.

**Built in v0.9.6.** Claiming a compendium weapon now writes the Item, its
Attacks and their Damage, wired as above.

(The `Weapon Mastery Known` record seen next to the longsword comes from the
character's **class**, not from the item, so it is not ours to write.)

---

## Let the SHEET build the item, instead of writing records ourselves

**Asked at the table, Aug 2026:** "why not just add it by compendium ID and
let the sheet do the work?"

It is the right question, and the honest answer is that the alternative was
never evaluated. S2 went straight to writing `store.integrants` directly and
logged the consequence as a residual risk — *"the 2024 sheet write bypasses
the Beacon sheet's own code path"* — but nothing tried to drive that path
instead. Everything since (the weapon graph, the attack wiring, and whatever
armour turns out to need) is the cost of reimplementing, record by record,
something the sheet already knows how to do from a page id.

**Why it isn't a trivial swap.** The Beacon sheet runs sandboxed — there's a
`sheetsandboxworker.js` and the traffic goes over `postMessage`, so its
functions can't simply be called from a content script. No "add compendium
page X to character Y" entry point is known. It may not be reachable at all.

**What might make it reachable, in rough order of promise:**

1. Roll20's own compendium drop onto a character sheet does exactly this job.
   `drops.js` already enables and disables Roll20's canvas droppable, so
   there is precedent for driving that machinery — the question is whether a
   drop can be synthesised at the sheet's drop target without the sheet being
   open and focused.
2. Whether the sheet reacts to a record appearing with only a
   `compendiumPageID` set, and enriches it itself. Cheap to test now that
   v0.9.8 writes that field.
3. The `postMessage` protocol between the VTT and the sheet sandbox, read off
   the wire. Most work, most fragile, and it would be undocumented API on top
   of undocumented API.

**Both are now one-line probes** (v0.9.9), so this is a ten-minute question
rather than a project:

```js
// ROUTE 2 first — WRITES to the named character, so use a throwaway.
// Puts a deliberately bare item on the sheet (a name and a page id, nothing
// else), waits, re-reads, and reports whether the sheet added any fields or
// records of its own. Removes the probe item afterwards.
await window.PartyTools.sheets.probeEnrich("Test Dummy", "Longsword")

// ROUTE 1 — open a character sheet first. Read-only. Lists every jQuery UI
// drop target on the page; look for one with insideCharacterSheet true.
window.PartyTools.sheets.probeDropTargets()
```

Record the answers here either way. A `verdict` of "THE SHEET ENRICHED IT"
means a page id may be enough and the per-type work can stop.

### ROUTE 1 — answered, and it looks live (Aug 2026)

`probeDropTargets()` against an open character sheet found this among the
registered jQuery UI droppables:

```
{ "classes": "charsheet-compendium-drop-target ui-droppable",
  "insideCharacterSheet": true, "visible": false }
```

Roll20 has a **dedicated, named drop target on the character sheet for
compendium items**. That is the entry point to the code that builds a weapon
properly — attacks, damage, mastery and all — and it is registered in
`$.ui.ddmanager`, which `drops.js` already interacts with on every drag.

`visible: false` is expected: the target is presumably only shown mid-drag,
and being invisible does not stop its handler being invoked directly.

**Next step, and it is a small one:** `PT.sheets.probeCompendiumDrop()` reads
that droppable's `accept` and its `drop` handler source. Once we know what
the handler reads off the dragged element — `drops.js` already knows a
compendium drag carries `data-pagename` and `data-expansionid` — a
synthesised jQuery UI drop can very likely be handed straight to it.

If that works, claiming becomes: put the item's compendium reference in front
of Roll20's own handler and let it build the records. Armour, magic items and
containers stop being separate problems, and the hand-written record code
becomes a fallback for items with no compendium page rather than the main
path.

**Worth doing before the next item type is built by hand.** If (1) or (2)
works, armour, magic items and containers all stop being separate problems.
If neither does, at least the per-type approach is a considered choice rather
than an unexamined default.

**Related and now fixed:** the drop was discarding the compendium page id. It
read `rec.id` from the lookup, used it to decide the item had resolved, and
threw it away — so items Party Tools wrote had no link back to the compendium
at all, where every sheet-made record carries one. v0.9.8 stores it and
writes it onto the Item, its Attacks and their Damage. (It is stripped from
obscured items along with `pagename`, since a page id names an item exactly.)

---

## Item types other than weapons — armour, containers, magic items

**Asked at the table, Aug 2026:** "will armour have similar issues?"

Almost certainly yes, for anything whose *function* lives in records beside
the Item. The general rule the weapon work established:

- The **Item record itself** always comes across intact, because it is copied
  from the compendium verbatim. So an item's name, description, cost, weight,
  properties and its type data (`weaponData`, and presumably an equivalent
  for armour) are fine. This is why a claimed longsword looked right in the
  inventory list from v0.9.2 onward.
- Anything **mechanical that lives in a sibling record** needs a rule written
  for it, one type at a time. Attack and Damage have one now. Nothing else
  does.

Likely to need work, in rough order of how often a table hits them:

1. **Armour and shields** — if AC comes from a sibling record rather than
   from a field on the Item, armour will equip and show but grant nothing.
2. **Containers** (Explorer's Pack, Priest's Pack) — their contents arrive as
   extra `Item` records. Only the first Item is written, so a claimed pack
   would arrive empty. Note the sheet side of this already works: a contained
   item is just an Item whose parent is another Item, and `sheets.listItems`
   already reports which container something sits in.
3. **Magic items with bonuses** (+1 weapons, cloaks of protection) — likely
   a modifier record of some kind.
4. **Consumables** (potions) — may carry an action or healing record.

**v0.9.7 makes this visible instead of silent.** A claim now counts and names
every payload record it didn't write, and says so in a toast. Before this, a
container's contents were the one loss nobody was told about — they weren't
even counted.

**Settles any of them:** put one in a bag and run
`PT.sheets.payloadDump("Chain Mail")`. That prints the record types and
contents, in order. Then `PT.sheets.weaponDump("Character", "Chain Mail")`
against one the sheet made itself shows the structure to build. That pair of
dumps is what turned the weapon problem from guesswork into a morning's work,
and it will do the same for each of these.

---

## Smaller things raised at the table

- **Sub-bags.** Already in the PRD, still unbuilt. Containers on a sheet
  (an Explorer's Pack holding a torch) are Items with Item parents, so the
  sheet side of this already works — `sheets.listItems` reports the
  container an item sits in. The bag side is the missing half.
- **Quest tracker.** The other half of the product's name, still unstarted.
- **2014 sheet support.** Deliberately deferred by scope decision; any
  non-2024 sheet gets INV-24's assignment state instead of a real write.
  The compendium payload format is uniform across rulesets (S3), so the
  blocker is the sheet writer, not the item data.

---

## Fixed already — kept for the record

Feedback from the same round that turned into shipped changes, so nobody
re-reports them:

- Claimed weapons arrived as plain possessions with no attack or damage.
  Fixed in v0.9.0 (the graph replay above).
- The coin-split recipient list showed players every NPC in the campaign,
  including ones they had never met. Fixed in v0.9.0: players see party
  characters only — anyone a player controls, plus NPCs the DM tags `party`
  in the journal.
- No way to move an item from a character sheet back into a bag. Added in
  v0.9.0 (the ⇩ button on each bag).
- A player who opened the panel before the DM set the game up was stuck
  until they reloaded, and opening the panel blanked the explanation. Fixed
  in v0.8.4.
