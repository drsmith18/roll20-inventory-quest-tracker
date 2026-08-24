# Privacy Policy — Party Tools

**Last updated: 24 August 2026**

Party Tools is a browser extension that adds a shared party inventory to a
Roll20 game. This page describes, plainly, what the extension does with
your data.

## The short version

Party Tools does not collect anything. It has no server, no analytics, no
accounts, and no third party it talks to. Everything it does happens inside
your own browser and your own Roll20 campaign.

## Where your data lives

Every bag, item, coin and log entry you create lives inside your Roll20
campaign itself, stored as journal handouts (named `PT-…`, with
deliberately meaningless titles so hidden loot never leaks through a
title). Roll20 hosts that data, syncs it between the players at your table,
and enforces who can see it — the same way it hosts every other handout,
character sheet and map in your game.

The developer of Party Tools never sees this data, has no way to see it,
and nothing is sent to the developer or to any third party. If you
uninstall the extension, your data doesn't go anywhere — it's still sitting
in your campaign's journal as ordinary handouts, exactly as it was before.
Reinstalling the extension (or a future version of it) picks the same data
back up.

Hidden bags — the DM's prepped loot — are stored the same way, but in
handouts Roll20 itself withholds from players at the server. Party Tools
doesn't invent that protection; it relies on the access control Roll20
already enforces for GM-only content.

## The one network request the extension makes

When you drag an item from the Roll20 compendium onto a bag, the extension
asks Roll20's own compendium API for that item's details, using a request
to Roll20's own domain with your existing Roll20 session — the same kind of
request Roll20's own interface makes when you open the compendium. That
request goes to Roll20, not to the developer or anyone else, and nothing
about it is stored or reused outside filling in the item you just dropped.

Aside from that, the extension makes no network requests of its own. It
requests no special browser permissions and no access to any site other
than the Roll20 game page it runs on.

## The 🐞 bug report button

If you click the 🐞 button in the panel, it opens a new GitHub issue in a
new browser tab, pre-filled with:

- the Party Tools version
- your role in the game (DM or player)
- the character sheet type Roll20 reports for the game
- the Roll20 backend/engine Roll20 reports
- your browser's user-agent string (the same "Chrome on Windows"-style
  string every website you visit can already read)
- the current time
- the result of Party Tools' start-up self-check (whether the Roll20 objects
  it depends on were all found)
- a short tail of its own recent activity — the last few things Party Tools
  logged about itself, so a fault can be diagnosed from the report rather than
  from a conversation

That activity tail is scrubbed before it goes anywhere. Your Roll20 campaign ID
and player ID are replaced with placeholders, and **the name of any bag or item
is replaced with `<name>`** — so a bug report can never reveal what your party
is carrying, what your DM has hidden, or what a disguised item really is.

The ♥ tab also has a **Copy diagnostics** button, which puts the same
information on your clipboard, scrubbed the same way, for you to paste
wherever you like. It sends nothing on its own.

Nothing is sent anywhere at this point. The GitHub issue form opens with
that text already typed into it, and you see exactly what it says before
anything happens. You then choose whether to add your own description and
submit it, edit or delete any of the pre-filled text first, or close the
tab and send nothing at all. Submitting requires you to be signed in to
your own GitHub account — Party Tools never has your GitHub credentials
and never posts on your behalf. This is you choosing to share information,
not the extension collecting it.

## The ☕ Ko-fi button and other links

The ☕ button, and any GitHub links in the panel, open a new browser tab to
Ko-fi or GitHub. Nothing is sent by the extension when you click them —
they're just outbound navigation, the same as clicking a link on any web
page. What Ko-fi or GitHub then do is governed by their own privacy
policies, not this one.

## What's stored locally in your browser

The extension remembers the panel's position and size on your screen, so
it opens back up where you left it. This is stored in your browser's
`localStorage`, under a key built from your Roll20 campaign ID and player
ID (so each game and each player keeps their own layout). It never leaves
your browser — it isn't sent to Roll20, the developer, or anyone else — and
clearing your browser's site data for `app.roll20.net` removes it.

That's the only thing the extension stores outside your Roll20 campaign.

## Exporting your data

The ♥ tab has an **Export party data** button. It writes a `.json` file of
your bags, items, coins and activity log and hands it to your browser as an
ordinary download, which lands wherever your browser puts downloads. The
file is built in your browser and is not uploaded anywhere — the extension
has no way to upload it.

Two things worth knowing about that file:

- It is a plain text file. Anyone who can read it can read everything in
  it.
- **A DM's export contains DM-only data**: hidden bags, and the true stats
  behind any obscured item. A player's export cannot contain those, because
  Roll20 never sends that data to a player's browser in the first place. If
  you are the DM, treat your export the way you'd treat your session notes.

Importing a file is the reverse, and equally local: the extension reads the
file you pick and writes its contents into your campaign as new bags. It
never overwrites or deletes anything already there.

## Changes to this policy

If what Party Tools does with data ever changes, this page will be updated
and the "Last updated" date at the top will change. If a future version
starts doing something meaningfully different from what's described here —
for example, adding a network request that wasn't here before — that
change will be called out in the extension's changelog and this page will
be updated before that version reaches the store. Checking back here is
the way to know; there's no account or email address for the extension to
notify you through, because it doesn't collect one.

## Questions

If anything here is unclear, or you think the extension is doing something
this page doesn't describe, open an issue on the tracker:
[github.com/drsmith18/roll20-inventory-quest-tracker/issues](https://github.com/drsmith18/roll20-inventory-quest-tracker/issues).
That's also the contact route for any privacy question.
