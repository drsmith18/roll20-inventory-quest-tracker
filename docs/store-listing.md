# Store listing copy and dashboard answers

Everything the two dashboards ask for, written out ready to paste. Where a
field is a judgement call rather than a fact, the reasoning is given so it
can be re-decided later rather than re-guessed.

Nothing in here is loaded by the extension. It exists so that a resubmission
in six months does not mean rewriting all of this from memory.

---

## 1. Shared facts

| Field | Value |
|---|---|
| Extension name | Party Tools for Roll20 |
| Version | 1.0.0 |
| Homepage | `https://github.com/drsmith18/roll20-inventory-quest-tracker` |
| Support / issues | `https://github.com/drsmith18/roll20-inventory-quest-tracker/issues` |
| Privacy policy | `https://github.com/drsmith18/roll20-inventory-quest-tracker/blob/main/PRIVACY.md` |
| Licence | MIT (see `LICENSE`) |
| Category | Chrome: **Workflow & Planning**. AMO: **Games & Entertainment** |
| Language | English (UK) |

---

## 2. Summary

Chrome caps this at 132 characters.

> Shared party loot for D&D 5e and 5.5e games on Roll20. Bags, coins and a who-took-what log, kept in your own campaign.

*(118 characters.)*

AMO allows 250, so it can carry a little more:

> A shared loot inventory for D&D 5e and 5.5e games on Roll20: bags, coins and a full who-took-what log that everyone at the table can see and edit. It is kept inside your own campaign, so there is no server and no account to create.

*(231 characters.)*

---

## 3. Detailed description

Paste into both stores. Neither renders Markdown, so this reads as plain text.

Two rules this copy follows, learned the hard way:

- **Nothing that does not exist yet.** No quest tracker, no roadmap, no
  "coming soon". A store page is read by someone deciding whether to install
  today, and a feature list they cannot use reads as padding at best and bait
  at worst.
- **No context the reader does not have.** They have not seen the repository,
  they do not know its name, and they have never heard of this project. Every
  sentence has to stand on its own.

```
A shared loot bag for your D&D group on Roll20, for both 5e and 5.5e.

Everyone at the table sees the same inventory. Drop items in, take them out,
split the coins, and it updates for everyone else within a second or two.

All of it lives in your own Roll20 campaign, stored as journal handouts.
There is no server involved, no account to create, and I never see any of it.


WHAT YOU NEED

A D&D game on Roll20's Jumpgate engine. If your game is still on Roll20's
older Legacy engine, the panel will not start, and it will tell you that is
why.

Both rulesets are supported, but not identically. Dragging items in reads
Roll20's D&D 5e compendium, which covers the 2014 rules (5e) and the 2024
rules (5.5e) alike. Sending an item onto a character sheet needs Roll20's
D&D 2024 sheet specifically; on the 2014 sheet, or any other sheet, the item
is recorded as assigned to that character instead of being written onto it.

Bags, coins, splitting and the log work whatever sheet you use.

Your DM needs to open the panel once in each game to set it up. If you get
there before they have, the panel says so, and starts working on its own
once they do.


WHAT IT DOES

Bags of loot the whole party can see and edit. The DM creates the bags,
everyone fills them.

Drag an item from the Roll20 compendium onto a bag and its name,
description, weight, cost and rarity come with it. You can also type in your
own items for anything homebrew.

Every bag has a coin purse. Splitting coins shows you the maths before you
commit to it: what converts down, what is left over, and who gets what. Each
share is held against a character until they take it.

Claim an item onto your character sheet, and move it back into a bag later.
A weapon stays a weapon, keeping its attack and damage.

Not everyone at the table needs to install it. If a player has not, their
share of the loot or the coins is held against their character in the panel
until someone ticks it off, so nobody gets left out of a split.

Every change is recorded against a name and a time, so there is always an
answer to who took the rope.

You can search across every bag, sort within one, and rename them.


IF YOU ARE THE DM

You can make a bag hidden. Roll20's own servers withhold its contents from
players, so it is genuinely hidden and not just tucked out of sight in the
interface.

You can also disguise an item, so players see a written description instead
of its real name until you choose to reveal it. Anything you do in secret
goes to a separate log only you can read.


PRIVACY

Party Tools only runs on Roll20 game pages, so it cannot see anything else
you do in your browser. There is no analytics and nothing is sent to me.
Full policy:
https://github.com/drsmith18/roll20-inventory-quest-tracker/blob/main/PRIVACY.md

It is free and it is staying free. There is a Ko-fi link in the panel if it
earns its keep at your table.
```

---

## 4. Chrome Web Store — the Privacy tab

This is the tab that most often sends a submission back. Every answer below
is checkable against the source.

**Single purpose description**

> Party Tools has one purpose: to give the players of a Roll20 game a shared
> inventory — bags of items and coins that everyone at the table can see and
> edit — stored inside their own Roll20 campaign. Every feature serves that
> one purpose.

**Justification for the `https://app.roll20.net/editor*` host permission**

> The extension's entire function happens inside the Roll20 virtual tabletop.
> It needs access to Roll20 game pages in order to (a) draw its inventory
> panel into the tabletop UI, and (b) read and write the journal handouts in
> which the party's inventory is stored. The match pattern is limited to
> Roll20's game editor pages; the extension requests no other host and no
> other permission of any kind. It cannot run on, or see, any other website.

**Are you using remote code?** — **No.** All logic ships inside the package
as plain, unminified JavaScript. There is no `eval`, no `new Function`, no
injected `<script>` tag and no code fetched at runtime. (`npm run build`
refuses to package if the first two appear.)

**Data usage — what the extension collects**

Tick **nothing**, and certify all three statements. Concretely:

| Category | Collected? |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

> **Why "website content" is No.** The extension reads and writes Roll20
> campaign data, but it neither collects it nor transmits it: the data is
> written back into the same Roll20 campaign the user already has open,
> over the user's own Roll20 connection. Nothing is sent to the developer or
> to any third party, and there is no server to send it to. The one outbound
> request the extension makes of its own accord is to Roll20's own
> compendium endpoint, to look up an item the user has just dragged.

The three certifications — no unrelated sale of data, no use for unrelated
purposes, no use to determine creditworthiness — are all true.

---

## 5. Firefox / AMO specifics

**Data collection declaration.** Already in the manifest, and required for
new extensions since 3 November 2025:

```json
"data_collection_permissions": { "required": ["none"] }
```

`none` is the correct value: the extension's data stays inside the user's
own Roll20 campaign and is not transmitted to the developer or anyone else.
This key needs Firefox 140, which is why `strict_min_version` is `140.0`.

**Source code submission.** AMO asks for source when the shipped code has
been generated, minified or transpiled. None of that applies here: the
package contains the source files unchanged, so the answer is **no** and
there is nothing to upload. If a reviewer asks anyway, point them at the
public repository.

**Android.** Not supported, and not claimed. The Roll20 tabletop is not
usable on a phone. `web-ext lint` leaves one warning saying
`data_collection_permissions` needs Firefox for Android 142 — expected, and
harmless for a desktop-only add-on.

---

## 6. Notes to the reviewer

Both stores let you leave a private note for the reviewer, and this one
needs it: **the extension does nothing visible without a Roll20 account and
a game to open it in.** A reviewer who installs it and browses to
roll20.net's front page will see no UI at all and may reject it as
non-functional. Say so up front.

```
Thank you for reviewing.

WHAT THIS EXTENSION IS
Party Tools adds a shared party inventory panel to games on the Roll20
virtual tabletop (roll20.net). All of its data is stored inside the user's
own Roll20 campaign as journal handouts. There is no server, no account
system and no analytics, and nothing is transmitted to the developer.

HOW TO SEE IT WORKING
The extension only activates on a Roll20 game page
(https://app.roll20.net/editor/...), so a Roll20 account and a game are
needed to exercise it:

1. Create a free account at https://roll20.net and start a new game. Choose
   the "Dungeons & Dragons 5E by Roll20" sheet, or any sheet — the inventory
   works with any, and only the optional "claim to character sheet" feature
   is specific to the D&D 2024 sheet.
2. Launch the game. Party Tools starts on the game page only.
3. A treasure-chest tab appears on the right edge of the screen, about a
   third of the way down. Click it to open the panel.
4. On first open as the game's GM, the extension creates its storage and a
   bag called "Party Loot". Click "+ Item" to add an item by hand, or drag
   an entry from Roll20's compendium sidebar onto the bag.

A test account can be supplied on request if that is easier.

NOTES ON THE CODE
• The content script runs in the MAIN world. This is necessary and not
  incidental: the extension reads and writes the Roll20 campaign through
  Roll20's own in-page client objects (window.Campaign and friends), which
  are unreachable from an isolated content script. It uses this access only
  to manage its own PT-* handouts.
• All code is plain, unminified JavaScript, exactly as it appears in the
  public repository. Nothing is generated, bundled or obfuscated, so there
  is no separate source archive to review.
• There is no eval, no new Function and no remotely-loaded code.
• The single outbound request is to Roll20's own compendium endpoint
  (/compendium/compendium/getPages), to resolve an item the user has just
  dragged onto a bag. See extension/src/drops.js.
• The two buttons that open external pages (a pre-filled GitHub issue and a
  Ko-fi link) only ever open a tab; neither submits anything on its own.

Source: https://github.com/drsmith18/roll20-inventory-quest-tracker
```

---

## 7. Screenshots — the set that shipped with 1.0.0

Five 1280×800 shots, submitted to both stores on 10 Sep 2026. Cropped and
exported with `tools/shot-cropper.html`, annotated afterwards in red.

Reuse these captions verbatim if the set is ever rebuilt — they were written
against the real UI and they name features the description alone does not
make visible.

| # | What it shows | Caption on the shot |
|---|---|---|
| 1 | The panel with coin shares assigned to three characters, `→` and `✓` on each row | *Push items and coins directly to your character sheet* / *Items can be manually set as claimed if one person does not have the extension* |
| 2 | A Longsword mid-drag from the compendium sidebar onto Party Loot, drop target lit | *Drag & Drop items from the Compendium* |
| 3 | The Obscure dialog over a Vorpal Longsword, with a hidden "Secret Bag" behind it | *The DM can create hidden bags and disguise an items true properties* |
| 4 | The Log tab beside the journal showing the `PT-…` handouts in their folder | *Keep track of all activity in the log* / *All your data is saved in your game, not in the extension* |
| 5 | The split-coins dialog with the party picked | *Split coins with the party* |

**Why the annotations matter.** Two of them carry things the description
cannot show: that a player without the extension still gets their share
(shot 1, the `✓` control — "Mark as transferred"), and that the data lives
in the journal as `PT-…` handouts rather than in the extension (shot 4).
Both are trust arguments, and both land better as a picture than a sentence.

**When rebuilding the set:**

- The panel header shows the version, so a shot taken against an old build
  is obvious and dates the whole set. Retake after a version bump if the
  screenshots are being refreshed anyway.
- Check the map behind the panel is art you are entitled to publish.
  Roll20 marketplace maps are licensed for use in your game, not for
  republishing in a store listing.
- Scrub before uploading: browser chrome carries tab titles and your profile
  picture, the bottom-left carries the GM video tile, and the right sidebar
  carries the campaign's player invite link.
- Chrome takes 1280×800 or 640×400, 1 to 5 shots. AMO has no fixed size, so
  the same files serve both.

Still not made: the optional 440×280 Chrome promo tile. `extension/icons/icon.svg`
is the obvious basis and is entirely original artwork, so there is no
licensing question there.
