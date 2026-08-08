# Spike S1 — Can a player write to a shared handout? (BLOCKING)

**Rerun (R2) versions.** Run 1 was contaminated by a leftover duplicate
handout named `SPIKE-S1` (see `docs/roll20-spike-findings.md`). These
versions clean up first, use the name `SPIKE-S1-R2`, refuse to run when
duplicates exist, use rerun-specific markers so stale data cannot fake a
pass, and surface Firebase `permission_denied` warnings as readable lines.

Seven console snippets, run in order, alternating between the DM window and
the player window. Both accounts must be on the tabletop page
(`app.roll20.net/editor/`).

| Step | File | Window | Changes data? |
|---|---|---|---|
| 0 | `step0-dm-cleanup.js` | DM | Yes — deletes all `SPIKE-S1*` handouts |
| 1 | `step1-dm-create.js` | DM | Yes — creates `SPIKE-S1-R2` |
| 2 | `step2-dm-watch.js` | DM | No — watches for the player's edit |
| 3 | `step3-player-write.js` | Player | Yes — reads gmnotes (S1b), overwrites notes |
| 4 | `step4-dm-revoke.js` | DM | Permissions only |
| 5 | `step5-player-readonly.js` | Player | Attempts a write it shouldn't be allowed |
| 6 | `step6-dm-verify.js` | DM | No — verdict on read-only enforcement |

Every snippet prints `PASS(...)` / `FAIL(...)` lines. Copy the whole console
output from both windows back; no interpretation needed.

Keep `SPIKE-S1-R2` afterwards — S5 (concurrent writes) reuses it.
