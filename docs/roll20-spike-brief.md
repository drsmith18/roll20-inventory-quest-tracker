# Spike Brief — Roll20 Party Tools

**Purpose:** Prove or disprove the assumptions the product design rests on, before any of it gets built. This is throwaway code. Nothing here needs to be well-structured, styled, or reusable — it needs to produce answers.

**Read first:** `roll20-party-tools-prd.md` (what the product is) and `roll20-technical-findings.md` (what was verified live on 8 August 2026).

**Stop condition:** each spike below has a written result. If a blocking spike fails, stop and report rather than working around it — the workaround changes the product, and that is a decision for DR, not for the build.

---

## Prerequisite — do this before writing any code

A **second free Roll20 account**, invited as a player to a dedicated test game on DR's account. Nothing about shared state, permissions, or reveal can be tested from one account, and every spike below except S3 needs it.

Use a throwaway test game, not DNDR or Eve of Ruin. Eve of Ruin in particular is an active campaign DR plays in and is not his to experiment on.

---

## S1 — Can a player write to a shared handout? **BLOCKING**

The entire shared-inventory premise assumes players can write to storage the DM created. Untested.

**Test**
1. As GM, create a handout and share it with the player account via `inplayerjournals`, with edit rights.
2. From the player account's browser, write to that handout's `notes` body through the page's own Backbone model.
3. Confirm the change persists, and confirm it appears in the GM's client without a reload.
4. Repeat with the player *not* granted edit rights, to establish what read-only looks like.
5. **S1b (added v0.3):** while the handout is shared with the player, have the GM write a distinctive string into its `gmnotes`. From the player account, attempt to read `gmnotes`. The findings verified gmnotes are withheld on *GM-only* handouts; this checks whether the same holds on *shared* ones. Decides where obscured-item true stats live (PRD C6.1).

**Record:** whether the write succeeds, whether it syncs live, roughly how fast, what failure looks like when rights are absent, and whether shared-handout `gmnotes` are readable by the player.

**If it fails:** the handout-storage approach collapses for the shared inventory and the whole C2 decision reopens. Stop and report. Do not fall back to a hosted service unilaterally.

## S2 — Writing items and coin to character sheets **BLOCKING**

Character `attribs` collections were observed present but empty until a sheet is opened. Gates INV-21, INV-23, INV-20g.

**Test**
1. On a character using `dnd2024byroll20`, force the attribute collection to load without the user opening the sheet. Establish whether that is possible at all.
2. Write a new inventory item to the sheet and confirm it appears correctly in the Roll20 UI.
3. Write a currency change and confirm the same.
4. Repeat all of the above on the 2014 sheet.
5. Note the repeating-row structure and ID conventions for items on each sheet.

**Record:** whether a background load is possible, the attribute names and row structure for items and coin on both sheets, and anything that differs between them.

**If it fails on one sheet only:** report which, and the fallback in INV-24 and INV-20h applies for that sheet.
**If it fails on both:** transfers become assignment-only and several requirements change. Stop and report.

## S3 — Compendium drop resolution

Verified that the dragged element carries only `data-pagename` and `data-expansionid`, and that a GraphQL endpoint exists at `compendium.production.roll20preflight.net/graphql`.

**Test**
1. Capture a real drop onto a test element. Confirm what arrives, and confirm whether the drop must be handled as a **jQuery UI droppable** rather than an HTML5 drop listener — the source element carries both.
2. Resolve `Items:Longsword` for both the 2014 and 2024 expansion IDs against the GraphQL endpoint, and record the full response shape.
3. Try to resolve an item from a book the account does *not* own, and record what entitlement failure looks like.

**Record:** the working query, the response shape, the field mapping to INV-10 (name, description, stats, weight, value, rarity, image), and the entitlement failure mode.

## S4 — Size limits

**Test:** write progressively larger bodies to a handout until something breaks. Establish the practical ceiling.

**Record:** the limit, and a rough estimate of how many items and how many log entries fit inside it. This determines whether the activity log can live in one handout for the life of a campaign (INV-22b) or needs rolling.

## S5 — Concurrent writes (SYS-7)

**Test:** have the GM client and the player client write to the same handout body within the same moment. Repeat several times.

**Record:** whether it is last-write-wins, whether either side is notified, and whether data is silently lost. This determines how much collision handling the product needs.

## S6 — Legacy backend

All three campaigns inspected reported `release: "jumpgate"`, but DR's games list shows at least one campaign tagged **Legacy**.

**Test:** open the Legacy campaign and re-check the globals from the findings document — `is_gm`, `campaign_id`, `campaign_storage_path`, the `Campaign` collections, and handout structure.

**Record:** every difference from Jumpgate. If they diverge significantly, declaring v1 Jumpgate-only is a legitimate outcome and should be recommended explicitly.

---

## Output

A single findings document covering all six spikes, in the same shape as `roll20-technical-findings.md`: what was tested, what was observed, and what it means for the requirements it gates. Include the working code for anything that will be reused in the real build.

No product code until S1 and S2 have answers.
