# Roll20 Party Tools — shared inventory & quest tracker

A Chrome extension (in development) that adds a shared party inventory and an
optional quest tracker to a Roll20 game, for D&D groups. All state is stored
inside the Roll20 campaign itself as handouts — no external server, no accounts.

**Current status: spike phase.** No extension exists yet. We are testing the
assumptions the design depends on before building anything. When there is an
extension to install, step-by-step loading instructions will appear here.

## What's in this repository

| Path | What it is |
|---|---|
| `docs/roll20-party-tools-prd.md` | Product requirements — what this is and who it's for. Every requirement has an ID (INV-, QST-, SYS-, ROLE-, UI-). |
| `docs/roll20-technical-findings.md` | What was verified by inspecting Roll20 live on 8 Aug 2026. Ground truth. |
| `docs/roll20-spike-brief.md` | Six tests (S1–S6) that must be answered before product code is written. S1 and S2 are blocking. |
| `spikes/` | Throwaway test code for the spikes. Pasted into the browser console on a Roll20 test game, by a human. Not part of the product. |

Spike results are written to `docs/roll20-spike-findings.md` as they come in.

## Ground rules

- All spike testing happens in a dedicated **test game** with a dedicated
  second test account — never in a live campaign.
- Nothing in this repo may contain credentials, session tokens, campaign IDs,
  or anything else from a real Roll20 account.
