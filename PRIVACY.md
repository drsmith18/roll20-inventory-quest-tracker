# Privacy policy — Party Tools for Roll20

*Last updated: 7 September 2026. Applies to the browser extension "Party
Tools for Roll20" published on the Chrome Web Store and addons.mozilla.org.*

## The short version

Party Tools collects nothing, sends nothing anywhere, and has no server.

## What the extension does with data

Party Tools adds a shared party inventory to a Roll20 game. Your bags,
items, coins and activity log are written into **your own Roll20 campaign**,
as journal handouts, using the same Roll20 connection your browser already
has open. That data belongs to your Roll20 game and is governed by
[Roll20's own privacy policy](https://roll20.net/privacypolicy).

The author of Party Tools cannot see any of it. There is no account to
create, no server to connect to, and no copy of your data anywhere outside
your Roll20 campaign.

## What is not collected

- **No analytics or telemetry.** The extension does not measure usage, count
  installs beyond what the stores report, or phone home in any form.
- **No personal information.** No name, email address, IP address, Roll20
  credentials or session token is read, stored or transmitted by the author.
- **No browsing history.** The extension runs only on Roll20 game pages
  (`https://app.roll20.net/editor*`). It cannot see any other website. That
  limit is enforced by your browser, not merely promised here.
- **No advertising, and no sale or sharing of data.** There is nothing to
  sell.

## Network requests

The extension makes exactly one kind of network request of its own: when you
drag an item from the Roll20 compendium onto a bag, it asks **Roll20's own
compendium endpoint** for that item's details (name, weight, cost, rarity,
description) so they can be filled in for you. That request goes to Roll20
and nowhere else.

## Links you can choose to click

Two buttons in the panel open a new tab when you click them. Neither sends
anything on its own:

- **🐞 Report a bug** opens a pre-filled GitHub issue form. The form is
  filled in with the extension version, whether you are the DM or a player,
  the character sheet and Roll20 engine in use, your browser's user-agent
  string, and the current time. **Nothing is submitted until you review it
  and press the button on GitHub yourself**, and you can edit or delete any
  of it first. Posting is subject to
  [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement).
- **☕ Support on Ko-fi** opens the author's Ko-fi page, subject to
  [Ko-fi's privacy policy](https://more.ko-fi.com/privacy). Donations are
  entirely optional and unconnected to the extension's function.

## Permissions, and why they exist

Party Tools requests one host permission: access to
`https://app.roll20.net/editor*`. It needs this to draw its panel inside the
Roll20 tabletop and to read and write the handouts that hold your party's
inventory. It requests no other permission of any kind — no storage, no
tabs, no cookies, no background process.

## Children

Party Tools is a tool for a tabletop game and is not directed at children
under 13. It collects no data from anyone, of any age.

## Changes to this policy

Any change will be committed to this file in the
[public repository](https://github.com/drsmith18/roll20-inventory-quest-tracker),
so its full history is visible to anyone.

## Contact

Questions about privacy, or anything else:
[open an issue](https://github.com/drsmith18/roll20-inventory-quest-tracker/issues).
