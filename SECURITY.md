# Security Policy

Party Tools is a one-maintainer hobby project — not a company, not a
security team. This policy says how to report a problem responsibly and
what to expect back.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** Use GitHub's
private vulnerability reporting instead:

1. Go to the [Security tab](https://github.com/drsmith18/roll20-inventory-quest-tracker/security) of this repository.
2. Click **Report a vulnerability**.

That opens a private draft advisory that only the maintainer can see, so
the details aren't public before there's a fix.

If for some reason that route isn't available to you, contact the
maintainer directly through their GitHub profile:
[github.com/drsmith18](https://github.com/drsmith18). There is no other
contact address for this project — see [PRIVACY.md](PRIVACY.md) for why.

Please include:

- What you found and how you found it.
- Steps to reproduce it, ideally in a throwaway test game rather than
  anything with real campaign data.
- What you'd expect to happen instead.

## What's in scope

Roughly: anything that breaks a guarantee the extension actually makes.
That includes —

- **A player reading data Roll20's server is supposed to withhold from
  them** — the contents of a hidden bag, or an obscured item's true name
  and stats, becoming visible to a player client through Party Tools
  without the DM revealing it. Hidden bags and obscured items are
  server-enforced (Roll20 withholds the handout body itself), so a leak
  here is a real bug, not a UI nicety failing.
- **Writing to a campaign the reporting user doesn't control** — Party
  Tools reaching outside the current game, or a player's client managing
  to write into another game's storage.
- **Exfiltrating data off the machine** — anything that sends campaign
  data, sheet data, or anything else to a destination other than Roll20's
  own servers. Party Tools makes exactly one network request of its own
  kind (fetching compendium item details from Roll20 when you drop an
  item — see [PRIVACY.md](PRIVACY.md)); anything that adds another
  destination, or piggybacks data onto that one, is in scope.

## What's not a vulnerability

**A player editing or deleting *visible* shared data that Roll20 itself
lets their account write to.** That's not a bug in Party Tools — it's the
stated trust model. A player can already, by hand, edit any handout their
Roll20 account has write access to; Party Tools' own UI enforces who's
*meant* to do what (DM-only actions, confirmation on deletes, and so on),
but it doesn't and can't stop a determined person editing the underlying
Roll20 storage directly, any more than it can stop them lying about their
character's hit points at the table. Same as the table itself: it runs on
trust. If you find a way to do this, it's expected behaviour, not a
report.

The distinction that matters: **hidden bags and obscured items are
different**, because Roll20's server genuinely withholds that data from a
player's client — the player's browser never receives it at all. A way
around *that* is a real bug, because it defeats a guarantee that isn't
supposed to be defeatable by a player at all, cheat or not.

## Response time

This is a hobby project maintained by one person in their spare time.
Reports get looked at on a best-effort basis — there's no SLA and no
guaranteed turnaround. You will get a reply; it may not be fast.
