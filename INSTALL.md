# Installing Party Tools — a guide for players

Party Tools adds a shared party inventory to your Roll20 game: bags of loot
and coins everyone can see and edit, right next to the tabletop.

> ### Two clicks, whichever browser you use
>
> **Chrome, Edge, Brave, Opera → [Add to Chrome](https://chromewebstore.google.com/detail/party-tools-for-roll20/pefhpilcdopnmoionkfhbbddpfjhklee)**
> **Firefox → [Add to Firefox](https://addons.mozilla.org/firefox/addon/party-tools-for-roll20/)**
>
> That is the whole install. Everything below is detail you only need if
> something looks wrong, or if you would rather run the code yourself.

---

## Before you start: is this safe?

Fair question — you're being asked to install software. Straight answers:

- **It only runs on Roll20 game pages.** It cannot see your email, your
  banking, or any other website. That restriction is written into the
  extension and enforced by your browser, not just promised here.
- **Nothing leaves your browser.** There's no server, no account, no
  tracking, no analytics. Your party's inventory is stored inside your
  Roll20 game itself, as journal handouts. The full
  [privacy policy](PRIVACY.md) is one short page.
- **You can read every line of it.** It's plain, readable code in this
  repository — nothing hidden, scrambled or minified. It's
  [MIT licensed](LICENSE), so you can also copy it, change it, or run your
  own version.
- **The store versions are reviewed.** Google and Mozilla both check the
  code before it goes up, and Mozilla cryptographically signs the Firefox
  build so your browser can verify it hasn't been tampered with.
- **It can be removed at any time**, and removing it doesn't delete your
  party's inventory (that lives in the Roll20 game, not in the extension).

---

## Install from the store

This is how almost everyone should install it.

### Chrome, Edge, Brave, Opera

1. Open the [Chrome Web Store listing](https://chromewebstore.google.com/detail/party-tools-for-roll20/pefhpilcdopnmoionkfhbbddpfjhklee).
2. Click **Add to Chrome**, then **Add extension**.

That's it. It updates itself from then on.

### Firefox

1. Open the [Firefox Add-ons listing](https://addons.mozilla.org/firefox/addon/party-tools-for-roll20/).
2. Click **Add to Firefox**, then **Add**.

That's it too — and unlike the from-source route below, it stays installed
when you close the browser. You need **Firefox 140 or newer** (Menu → Help →
About Firefox to check).

### Safari

Not supported. Safari needs a completely different packaging process.

---

## Install from source

You do not need this route — the store listings above are live. It is here
for anyone who'd rather run the code themselves, or who wants to try a
change before it ships.

These instructions assume you've never installed an extension this way
before. Nothing here can break your computer or your Roll20 account.

### Step 1 — Download it (everyone does this)

1. Go to the [repository page](https://github.com/drsmith18/roll20-inventory-quest-tracker).
2. Click the green **Code** button near the top right.
3. Choose **Download ZIP**.
4. Find the downloaded file and **unzip it** (Windows: right-click →
   *Extract All*. Mac: double-click it).
5. You'll get a folder with a long name like
   `roll20-inventory-quest-tracker-main`. **Open it.** Inside you'll see a
   folder called **`extension`** — that's the one that matters. Remember
   where it is.

> **Don't delete this folder afterwards.** Unlike a normal app, your browser
> reads the extension from this folder every time it starts. Put it
> somewhere sensible like your Documents folder, not in Downloads where you
> might clear it out.

### Step 2a — Chrome (also Edge, Brave, Opera and other Chrome-like browsers)

1. Type `chrome://extensions` into the address bar and press Enter.
   *(On Edge it's `edge://extensions` instead.)*
2. Find the **Developer mode** switch in the **top right** and turn it
   **on**. This just lets you install extensions from a folder.
3. Three buttons appear at the top left. Click **Load unpacked**.
4. A file browser opens. Navigate to the folder you unzipped and select the
   **`extension`** folder — the one containing a file called
   `manifest.json`. Click *Select Folder* / *Open*.
5. A card appears saying **Party Tools for Roll20**. Done.

**Chrome will nag you.** Every time you start Chrome you may see a popup
saying *"Disable developer mode extensions"*. This is Chrome being cautious
about anything not installed from its store. Click the **X** to dismiss it —
don't click "Disable". Installing from the store instead makes it stop.

### Step 2b — Firefox

1. Type `about:debugging#/runtime/this-firefox` into the address bar and
   press Enter.
2. Click **Load Temporary Add-on…**
3. Navigate into the **`extension`** folder and select the file called
   **`manifest.json`** (in Firefox you pick the file, not the folder).
4. It appears in the list. Done.

**Firefox unloads it when you close the browser**, so you'll need to repeat
these three steps at the start of each session. That's a limitation of
loading an add-on by hand — Firefox requires Mozilla's signature for a
permanent install, which is exactly what the store listing provides. You need
**Firefox 140 or newer**.

---

## Open your game

However you installed it:

1. Open (or reload) your Roll20 game.
2. Look at the **right-hand edge of the screen**, around a third of the way
   down. There's a small tab with a treasure-chest icon. Click it.
3. The Party Tools panel opens.

**Your DM must open it first, once, in each game.** That's what creates the
storage. If you open it before they have, the panel says so and then keeps
watching in the background — when your DM sets the game up, your panel picks
it up on its own within about fifteen seconds. No reload needed. There's a
**Check again** button if you'd rather not wait.

### Checking it's working

At the top of the panel you should see the version number and a badge
saying **DM** or **PLAYER**. If you're a player and it says PLAYER, that's
correct. You should see at least one bag, probably called *Party Loot*.

Try it: drag an item from Roll20's compendium onto a bag. It should appear
within a second or two — and appear for everyone else too.

---

## Updating

**Installed from a store:** nothing to do. Your browser updates it in the
background, usually within a day of a new version going up.

**Installed from source:** you update it by hand.

1. Download and unzip the new ZIP as in Step 1.
2. Replace your old folder with the new one (or put the new one somewhere
   and remember the new location).
3. **Chrome:** go to `chrome://extensions` and click the circular **↻**
   arrow on the Party Tools card. **Firefox:** just load it again as in
   Step 2b.
4. Reload your Roll20 tab.

Check the version number at the top of the panel to confirm it changed.

---

## If something goes wrong

**No tab appears on the right edge.**
Reload the Roll20 page first — the extension only starts on a fresh page
load. Check the extension is still listed and switched on. Make sure you're
on an actual game page (the one with the map and chat), not the game's
details or settings page.

**It says PLAYER but I'm the DM.**
You're probably in Roll20's "view as player" mode. Leave that mode and
reload the page.

**The panel says the game has no data yet.**
The DM needs to open the panel once first. Leave your panel open — it checks
every fifteen seconds and will fill in by itself once they have. Click
**Check again** to look immediately.

**Everything looks frozen or out of date.**
Reload the Roll20 page. The panel refreshes every few seconds, but a page
that's been open for hours can drift.

**It vanished when I restarted Firefox.**
Expected, if you loaded it by hand — see Step 2b. The store version stays
put.

**Something's genuinely broken.**
Click the **🐞** button at the top of the panel. It opens a pre-filled bug
report with all the technical details already filled in — you just describe
what happened. You'll need a free
[GitHub account](https://github.com/signup) to post it. No account? Tell
your DM and they can report it for you.

---

## A few things worth knowing

- **Only the DM can create bags.** Roll20 doesn't allow players to create
  the underlying storage. You can add, move, remove and claim items in any
  bag you can see — just not make new ones. Ask your DM.
- **Your DM can hide things.** Some bags and some items are deliberately
  concealed. If an item shows a vague description instead of a name, that's
  intentional — the DM knows what it really is.
- **Everything is logged.** Every item added, removed or claimed and every
  coin change is recorded with your name against it, visible to the whole
  party. That's deliberate: it's how you settle "who took the rope".
- **Don't touch the `PT-…` handouts** in the game's journal. They look like
  gibberish because they are — they're where the inventory is stored.
  Deleting one deletes part of your party's inventory.

---

Enjoying it? [Buy the author a coffee](https://ko-fi.com/drsmith080) ☕
