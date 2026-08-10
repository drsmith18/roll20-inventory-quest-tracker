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

## Verify the compendium payload shape against a real drop

Not an idea so much as an outstanding check on shipped code (v0.9.0).

Claiming rebuilds a weapon's Item/Attack/Damage graph from the
`data-datarecords` payload stored at drop time. That payload's exact shape is
inferred from `drops.js`'s parser and the S2/S3 findings — there is no
captured sample in this repo, and the tests use a reconstruction. The code
falls back to a plain item and warns when the payload doesn't match, so a
wrong guess degrades rather than corrupts, but it hasn't been confirmed
against the real thing.

**Settles it:** in a test game, drag a weapon from the compendium into a bag
and run snippet (a2) at the bottom of `extension/src/sheets.js`
(`PT.sheets.explainGraph`). Paste the output here.

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
