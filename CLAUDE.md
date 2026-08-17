# Notes for Claude Code sessions

## The project in one line

A Chrome/Firefox extension adding a shared party inventory to a Roll20 game,
storing everything inside the campaign itself as journal handouts. No server,
no accounts. `README.md` is the feature list; `docs/roll20-party-tools-prd.md`
is the spec; `docs/future-ideas.md` is the backlog with its evidence.

## Where the real constraints are written down

Read these before changing anything that touches Roll20:

- `docs/roll20-technical-findings.md` — what Roll20's page objects actually
  guarantee. Notably: `is_gm` is an ordinary page variable, fine for deciding
  what UI to draw and **worthless** as a guarantee about data access. The real
  boundary is Roll20's server.
- `docs/future-ideas.md` — captured record shapes for every item type, and the
  routes already closed. **Do not re-derive these.** Sheet record parentage and
  grouping differ per type and were each read off a real sheet; generalising
  one type's rule to another has already been shown to produce bugs that only
  appear on half the cases.

The house style is S2's: **fail loudly, never guess.** A half-completed write
is reported to the user, not swallowed — see `doClaimItem`'s `halfDone`.

## Jules integration (optional, off unless a key is set)

[Jules](https://jules.google) is Google's async coding agent. It runs tasks in
its own cloud VM against this GitHub repo — it does not run in your container.

`.mcp.json` defines a project-scoped `jules` MCP server. It activates only when
`JULES_API_KEY` is present in the environment; without it the server is
configured but non-functional, which is the intended default.

Check whether it's live before relying on it:

```bash
claude mcp list        # "jules" connected, or pending approval / missing var
```

Tools when connected: `create_session`, `list_sessions`, `get_session_state`,
`send_reply`, `get_code_review_context`, `show_code_diff`, `query_cache`.

**What Jules is and isn't good for here.** Delegating a self-contained,
well-scoped change is reasonable. Delegating anything that needs Roll20's real
behaviour is not: much of this backlog is console probes that must be run by a
human at a live Roll20 table (`PT.sheets.payloadDump`, `weaponDump`, `survey`,
`probeEnrich`). Neither agent can settle those.

Also note the API is `v1alpha` and the MCP server is early. If a Jules session
opens a PR, review its claims against the code rather than its description —
that has already gone wrong once on this repo (PR #2 shipped with a security
claim that was wrong and had to be retracted).

## Repo conventions

- Plain ES5-flavoured JavaScript, no build step, no framework. Match the
  surrounding file.
- Version bumps land in the commit subject: `v0.9.17: <what changed>`.
- `npm test` runs `test/sheets.test.js` and `test/storage-init.test.js`
  (jsdom, the only devDependency). Run it before pushing. `node --check` is
  the quick syntax gate for a file you've just edited.
