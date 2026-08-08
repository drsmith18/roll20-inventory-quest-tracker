# Spike S1 — Can a player write to a shared handout? (BLOCKING)

Six console snippets, run in order, alternating between the DM window and the
player window. Both accounts must be in the test game (the tabletop page at
`app.roll20.net/editor/`, not the game details page).

| Step | File | Window | Changes data? |
|---|---|---|---|
| 1 | `step1-dm-create.js` | DM | Yes — creates a handout named `SPIKE-S1` |
| 2 | `step2-dm-watch.js` | DM | No — watches for the player's edit |
| 3 | `step3-player-write.js` | Player | Yes — reads gmnotes (S1b), then overwrites notes |
| 4 | `step4-dm-revoke.js` | DM | Permissions only — removes player edit right |
| 5 | `step5-player-readonly.js` | Player | Attempts a write it shouldn't be allowed |
| 6 | `step6-dm-verify.js` | DM | No — checks whether step 5's write got through |

Every snippet prints lines starting `PASS(...)` or `FAIL(...)`. Copy the whole
console output back; no interpretation needed.

Cleanup afterwards: delete the `SPIKE-S1` handout from the journal.
