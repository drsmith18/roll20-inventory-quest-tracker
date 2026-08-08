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
| S2 | Write items/coin to character sheets (BLOCKING) | Not started |
| S3 | Compendium drop resolution | Not started |
| S4 | Handout size limits | Not started |
| S5 | Concurrent writes | **ANSWERED** — silent last-write-wins; loser discarded with no signal |
| S6 | Legacy backend | Not started (awaiting identification of the Legacy campaign) |

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
