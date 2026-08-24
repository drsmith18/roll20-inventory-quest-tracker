# Frequently asked questions

## Where is my data?

Inside your own Roll20 campaign, nowhere else. Every bag, item, coin and
log entry is stored as a journal handout named `PT-…`, with a deliberately
meaningless title so hidden loot can't leak through a name. The DM's client
files these into a journal folder called *Party Tools (do not edit)* to
keep the journal tidy — don't rename or edit them by hand, that folder
*is* the party's inventory.

There's no server behind Party Tools and nowhere else the data could be.
If you uninstall the extension, your data doesn't go anywhere — it's still
sitting in the campaign's journal as ordinary handouts, exactly as before.
Reinstalling (or installing a future version) picks the same data back up.
See [PRIVACY.md](../PRIVACY.md) for the full picture, including the one
network request the extension makes (fetching an item's details from
Roll20's own compendium when you drop it onto a bag).

## Why does the DM have to open the panel once before players can use it?

Two reasons, one of them a hard platform limit:

- **The storage doesn't exist until someone creates it.** The first time
  the panel opens in a game, it creates the handouts that hold the
  inventory, names them, and files them into the journal folder. Someone
  has to go first.
- **That someone has to be the DM, because Roll20 won't let a player do
  it.** Live testing showed Roll20's server refuses handout creation from
  a non-GM account (`permission_denied`). Bags are handouts, so a player's
  client genuinely cannot create the storage — this isn't a Party Tools
  restriction, it's what Roll20 allows.

If a player opens their panel before the DM has opened theirs, it says so
plainly rather than trying to create anything, and then keeps checking in
the background — about every fifteen seconds — so it picks the game up on
its own once the DM sets it up, with no reload needed. There's also a
"Check again" button if you don't want to wait.

## Why doesn't it work in my game?

Most likely because the game is running on Roll20's older **Legacy**
engine rather than the newer **Jumpgate** engine. Party Tools v1 only
supports Jumpgate games — if it detects anything else, it declines with a
plain "not supported" message rather than half-working. This is checked in
`extension/src/env.js`: the extension reads the campaign's own engine
marker and refuses to proceed if it says anything other than `jumpgate`.

If your game genuinely is on Jumpgate and the panel still isn't appearing,
check the basics in [INSTALL.md](../INSTALL.md#if-something-goes-wrong)
first — reload the game page, confirm the extension is switched on, and
make sure you're on the actual game page (with the map and chat), not a
settings or details page.

## Why can't my character receive an item?

Claiming an item writes directly to a character sheet, and Party Tools
only knows how to do that for Roll20's **D&D 2024 sheet**
(`dnd2024byroll20`). That's a deliberate v1 scope decision, not an
oversight — see the PRD's C3 for the reasoning. On any other sheet, the
item isn't lost: it's recorded as **assigned** to that character, and the
player moves it onto the sheet by hand.

There's a second, narrower case even on a supported sheet: **a character
whose sheet has never been opened in Roll20 has no data for Party Tools to
write to yet.** Roll20 only builds a character's sheet data lazily, the
first time someone opens it. If you try to claim an item onto a character
like that, the panel now says so directly — open that character's sheet in
Roll20 once (that creates it), then try the claim again. Nothing is
removed from the bag while a claim is refused for either reason.

## Can a player cheat?

For **visible** shared data, yes — the same as at the table itself. Party
Tools doesn't try to stop someone editing the underlying Roll20 storage
directly if they're determined to; its UI enforces who's *meant* to do
what (DM-only actions, confirmations, and so on), but that's a courtesy,
not a lock. This is a deliberate trade-off, not an oversight: the tool
serves tables that already run on trust, the same way nobody's stopping a
player from lying about a die roll.

**Hidden bags and obscured items are different.** Those are withheld by
Roll20's own server — a player's browser never receives the data at all,
regardless of what the extension's UI does or doesn't show. That
protection is real, and a way around it would be a genuine bug (see
[SECURITY.md](../SECURITY.md) if you find one).

## What happens if I uninstall, or if I delete the `PT-…` handouts?

**Uninstalling the extension** doesn't touch your data at all. Everything
stays exactly where it was, as ordinary handouts in the campaign's
journal. Reinstalling it — or a later version of it — picks the inventory
back up as if nothing happened.

**Deleting the `PT-…` handouts by hand** is different and destructive:
those handouts *are* the inventory, so deleting one deletes part of it —
a bag, its items, its coin purse, or a slice of the activity log,
depending on which one. There's no undo for that from outside the
extension. This is exactly why they're filed into their own "do not edit"
journal folder and given meaningless names — leave that folder alone.

## Is this official? Is it affiliated with Roll20?

No. Party Tools is not affiliated with, endorsed by, or sponsored by
Roll20 or The Orr Group, LLC. "Roll20" is used in this project only to
describe what it works with — it's an independent, unofficial tool built
by one person for their own table.

## What about the quest tracker?

Planned, not shipped yet. The product requirements describe a full
DM-authored quest tracker alongside the inventory — steps, controlled
reveal, attached rewards, player notes — but it's a later release. The
shared inventory is the part that's feature-complete and in testing now;
the quest tracker is the next piece of work once that's settled.
