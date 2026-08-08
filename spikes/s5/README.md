# Spike S5 — Concurrent writes to the same handout (SYS-7)

Two snippets, one per window, that append lines to `SPIKE-S1-R2`'s notes at
the same synchronized instants — 6 rounds, 10 seconds apart. Each round both
clients read the body, append their own line, and write it back: the classic
lost-update pattern. Synchronization comes from Step A planting the start
time in the handout body, which Step B reads, so no code editing is needed
and both windows fire within milliseconds of each other (same machine clock).

| Step | File | Window | Notes |
|---|---|---|---|
| A | `stepA-dm-rounds.js` | DM | Run first. Re-grants player edit, resets notes, starts rounds 30s later |
| B | `stepB-player-rounds.js` | Player | Run within ~30s of Step A; skips rounds it missed |

Reading the result: 12 lines (6 GM + 6 PLAYER) surviving means no data loss;
a MISSING line in a round both clients attempted is a lost update. Each
window prints which lines it appended, so a skipped round can be told apart
from a lost one.

Prerequisite: `SPIKE-S1-R2` must exist (created by S1's Step 1).
