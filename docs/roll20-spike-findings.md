# Roll20 Spike Findings

**Started:** 8 August 2026
**Method:** Console snippets written by Claude, run by DR in a dedicated test
game ("Browser Extension Test") with the main account as GM and a second free
account as the player, in two browser windows on one machine. Raw console
output pasted back verbatim. Campaign identifiers are redacted in this
document per repo rules.

**Status board**

| Spike | Question | Status |
|---|---|---|
| S1 | Player write to shared handout (BLOCKING) | Run 1 contaminated; rerun in progress |
| S1b | gmnotes withheld on shared handouts? | Leak observed in run 1; confirming on rerun |
| S2 | Write items/coin to character sheets (BLOCKING) | Not started |
| S3 | Compendium drop resolution | Not started |
| S4 | Handout size limits | Not started |
| S5 | Concurrent writes | Not started |
| S6 | Legacy backend | Not started (awaiting identification of the Legacy campaign) |

---

## S1 — Player write to a shared handout (run 1, 8 Aug 2026)

**What happened:** run 1 produced two handouts named `SPIKE-S1` (an earlier
partial attempt left one behind). Find-by-name then sent different steps to
different objects, so the write/sync/latency results are a mix of two runs and
are not certified. A controlled rerun (`SPIKE-S1-R2` snippets, with cleanup
and duplicate guards) is in progress.

**Findings that stand regardless of the contamination:**

1. **Handout creation and blob writes work from the console on Jumpgate.**
   `Campaign.handouts.create({...})` creates and shares a handout
   (`inplayerjournals` = view, `controlledby` = edit), and
   `handout.updateBlobs({notes, gmnotes})` writes the bodies. Reads go through
   `handout._getLatestBlob(field, callback)` (async). Both exist in the GM and
   player clients.

2. **Read-only is enforced server-side, and refusal is SILENT.** A player
   without `controlledby` rights who calls `updateBlobs` gets no exception and
   no callback error. The only evidence is a Firebase console warning:
   `FIREBASE WARNING: update at /campaign-<redacted>/hand-blobs/<handout-id>
   failed: permission_denied`, and the write does not propagate (confirmed
   from the GM client). **Design consequence (SYS-7, SYS-8): the extension
   must verify every write by re-read or echo — a rejected write looks
   exactly like a successful one to the caller.**

3. **S1b signal — gmnotes on a shared handout leaked to the player client.**
   The player's `_getLatestBlob("gmnotes")` returned the GM's secret string on
   a handout shared via `inplayerjournals`. If the rerun confirms this,
   `gmnotes` is NOT a safe home for obscured-item true stats (PRD C6.1), and
   hidden per-item data needs a parallel GM-only handout instead. Note this
   does not contradict the original findings doc, which only verified gmnotes
   withholding on fully GM-only handouts.

4. **Probable but uncertified: a player with edit rights can write.** A
   player-authored marker was present in a handout body and visible to the GM
   client — but it was written during the uncontrolled first attempt, so
   success and latency will be certified by the rerun, not this.

5. **Design lesson: reference handouts by ID, never by name.** Two handouts
   with the same name sent each client to a different object. The product's
   index must store Roll20 handout IDs. (Names were already required to be
   opaque per PRD C1; now they are also forbidden as keys.)

**Verdict: pending rerun.**
