# Release checklist — getting Party Tools into the two add-on stores

The order matters. The automated checks are quick and catch the dull
rejections; the manual gate is slow and catches the ones that matter. Do not
skip to the submission section — a rejected submission costs days, and both
stores review a *resubmission* from the back of the queue.

---

## 0. Decide two things first

Both are one-line changes, but both are awkward to change after the listing
is public.

### Version number

**Settled: 1.0.0.** The tree shipped its store debut at 1.0.0 rather than
0.9.x, on the grounds below. Kept here because the same question returns at
every release.

Section 2 is now green on **both** browsers, which was the condition set for
this decision, so the argument for staying on 0.9.x has largely gone:

- **Bump to 1.0.0** if you are willing to call the inventory finished. It is
  feature-complete, tested on both browsers, and the store shows the number
  to every visitor — 0.9.x reads as "not ready yet" to someone deciding
  whether to install.
- **Stay on 0.9.x** only if you want the beta label to keep setting
  expectations through the first wave of real users, on the grounds that the
  table testing it has been small.

Either way, update the README's status line in the same commit.

The version lives in **two** places and `npm run build` refuses to package if
they disagree:

- `extension/manifest.json` → `version`
- `extension/src/util.js` → `PT.VERSION`

(The stored-data schema is a separate constant, `SCHEMA` in
`extension/src/storage.js`, and does **not** move with the display version.
Bumping to 1.0.0 will not invalidate anybody's existing inventory.)

### A licence — **done**

`LICENSE` is now in the repository: **MIT**. Use that name in the AMO
licence field, and leave it alone otherwise.

One thing to check before the listing goes public: the copyright line reads
`Copyright (c) 2026 drsmith18` — the GitHub handle, because that is the only
name this repository knows. Substitute your real name if you would rather
the licence carry it.

---

## 1. The automated gate — a couple of minutes

```
npm install
npm run release:check
```

That runs, in order:

1. **`npm test`** — 289 checks across three suites, booting the real
   extension files inside jsdom against a stubbed Roll20 campaign.
2. **`npm run lint`** — `web-ext lint`, the same validator addons.mozilla.org
   runs on submission. **Must be 0 errors.** One warning is expected and
   fine: `data_collection_permissions` needs Firefox for Android 142, and
   this is a desktop-only add-on that does not claim Android support.
3. **`npm run build`** — writes `dist/party-tools-<version>.zip`, and refuses
   to if the two version strings disagree, a manifest-referenced file is
   missing, a store string is over length, or `eval`/`new Function` has
   appeared in the source.

The same three run in CI on every push (`.github/workflows/ci.yml`), and the
packaged zip is attached to the run as an artifact.

> **Upload `dist/party-tools-<version>.zip`, and nothing else.** Not GitHub's
> green *Code → Download ZIP*. That produces
> `roll20-inventory-quest-tracker-main.zip`, which wraps the whole repository
> — `docs/`, `spikes/`, `test/`, `package.json` — in a top-level folder, with
> `manifest.json` buried two levels down. Both stores reject it, Chrome with
> a wall of "Files outside directory with manifest … are not allowed".
>
> A valid package has **`manifest.json` at the very top**, with only `src/`
> and `icons/` beside it — 13 files. Check before uploading:
>
> ```
> unzip -l dist/party-tools-<version>.zip
> ```
>
> Upload the `.zip` itself; do not unzip it first.

**What a green run does not prove.** The test stubs are built from
`docs/roll20-spike-findings.md`. Green means the logic is right *given those
shapes*; it does not mean Roll20 still has those shapes. Only section 2 can
tell you that.

---

## 2. The manual gate — the one that actually decides

Do this in the **dedicated test game with the dedicated second account**,
never in a live campaign. Budget an evening, not ten minutes.

### 2a. Chrome — the tested path

Load `extension/` unpacked at `chrome://extensions` (Developer mode on →
Load unpacked). Then, as the DM:

- [ ] Panel opens from the chest tab; the header shows the right version and
      a **DM** badge.
- [ ] First run in a fresh game creates the storage and a *Party Loot* bag.
- [ ] Drag a compendium item onto a bag — name, description, weight, cost
      and rarity all arrive.
- [ ] Add a manual homebrew item.
- [ ] Change a quantity; move an item between bags; delete an item.
- [ ] Add and remove coins with a reason; check the purse log.
- [ ] Split coins: the preview maths is right, the remainder stays put, and
      shares land against the right characters.
- [ ] Claim an item to a character sheet, then put it back into a bag. A
      compendium **weapon** must survive the round trip with its attack and
      damage records intact — this is the fragile one. Verify against a real
      drop with `PT.sheets.explainGraph()` (snippet (a2) in
      `extension/src/sheets.js`) rather than trusting the reconstructed
      payload in the tests.
- [ ] Create a hidden bag; confirm from the player account that its contents
      genuinely do not arrive.
- [ ] Obscure an item (shift-drop from the compendium), then reveal it.
- [ ] Search across bags; sort within a bag; rename a bag.
- [ ] Activity log shows every one of the above with the right name and time.
- [ ] The 🐞 button opens a GitHub issue with the diagnostics filled in.

Then, with the **second account joined as a player**, in a second browser
profile and at the same time:

- [ ] Changes made by the DM appear for the player within a second or two,
      and vice versa.
- [ ] The player sees no hidden bag and no obscured item's true name.
- [ ] A player opening the panel in a game the DM has *not* yet set up gets
      the explanatory message, and the panel fills itself in within about
      fifteen seconds of the DM setting it up — without a reload.

### 2b. Firefox — **verified, 7 Sep 2026**

This was the biggest unknown in the release and it is now closed: Party
Tools has been run in a real game in Firefox, and the three places the two
browsers were most likely to diverge all behave.

Re-run this section on any release that touches `drops.js`, `env.js`, or the
manifest's `content_scripts` block — those are what the Firefox-specific
risks hang off.

```
npm run start:firefox
```

(or load `extension/manifest.json` by hand at
`about:debugging#/runtime/this-firefox` → Load Temporary Add-on. That route
needs no Node install; the panel goes away when Firefox closes, which is a
property of Load Temporary Add-on and not of Firefox.)

Then work through the **whole** of section 2a again in Firefox, paying
particular attention to:

- [ ] **The `world: "MAIN"` content script actually runs.** Everything
      depends on reaching Roll20's in-page `window.Campaign` objects. If the
      panel never appears at all, this is why. Firefox has supported
      MAIN-world content scripts since 128, but "supported" and "behaves
      identically" are different claims.
- [ ] **The compendium drag-and-drop.** It hangs off Roll20's jQuery UI
      `droppable`, and drag-and-drop is the classic cross-browser
      difference. If drops silently do nothing, check the console for
      "jQuery UI droppable not found".
- [ ] **The compendium `fetch`** in `src/drops.js` uses
      `credentials: "same-origin"`. Confirm items still resolve to full
      details rather than falling back to name-only.

Also confirm the extension loads on the declared minimum, **Firefox 140**,
not just on current Firefox.

### 2c. Package-level sanity

Install from the built artefact, not the working tree — this catches a file
that is in your folder but not in the zip:

- [ ] `npm run build`, unzip `dist/party-tools-<version>.zip` somewhere
      fresh, load *that* folder unpacked in Chrome, and re-check that the
      panel opens and a bag loads.

---

## 3. Chrome Web Store

**One-time setup**

- [ ] Register a developer account and pay the **one-off US$5** fee at
      <https://chrome.google.com/webstore/devconsole>. There is no annual
      renewal and no per-extension charge.
- [ ] Verify the developer email address.
- [ ] Set the publisher name shown under the extension title.
- [ ] Answer the **trader / non-trader** declaration. For a free hobby
      project with no business behind it, **non-trader** is correct. Traders
      must publish a legal name, address and phone number on the listing;
      non-traders do not. Revisit only if the extension ever charges money.

**Per submission**

- [ ] Upload `dist/party-tools-<version>.zip` — the built package, **not** a
      GitHub *Download ZIP* (see the warning in §1).
- [ ] Fill in the listing from `docs/store-listing.md` §2 and §3.
- [ ] Category **Workflow & Planning**, language **English (UK)**.
- [ ] Upload at least one 1280×800 screenshot (`docs/store-listing.md` §7 —
      check every shot for real names, avatars and campaign titles first).
- [ ] Privacy tab: single purpose, host-permission justification, "no
      remote code", and the data-usage answers — all written out in
      `docs/store-listing.md` §4.
- [ ] Privacy policy URL:
      `https://github.com/drsmith18/roll20-inventory-quest-tracker/blob/main/PRIVACY.md`
      — the rendered GitHub page, not the `raw.githubusercontent.com` one. Both
      resolve, but raw serves `text/plain`, so a reviewer or a user gets a wall
      of unstyled Markdown. The blob URL is a readable page.
- [ ] Paste the reviewer note from `docs/store-listing.md` §6. **Do not skip
      this** — a reviewer who cannot get past Roll20's login sees an
      extension that does nothing.
- [ ] Submit. Review is typically a few days, occasionally longer for a
      first submission from a new account.

---

## 4. addons.mozilla.org

§2b is green, so this is no longer gated — it can run alongside the Chrome
submission rather than after it.

- [ ] Create an account at <https://addons.mozilla.org/developers/> — free,
      no fee.
- [ ] Submit a **new add-on**, **listed on this site**, upload the same
      `dist/party-tools-<version>.zip` — again, not a GitHub *Download ZIP*.
- [ ] The validator runs on upload. It should report 0 errors; you have
      already seen its output from `npm run lint`.
- [ ] Source code: answer **no**. Nothing is minified, bundled or
      generated — the package is the source.
- [ ] Choose the licence decided in §0.
- [ ] Listing copy from `docs/store-listing.md` §2 and §3, category **Games &
      Entertainment**.
- [ ] Screenshots — reuse the Chrome set.
- [ ] Paste the same reviewer note (§6).
- [ ] Submit. AMO signs the add-on as part of review; that signature is what
      makes it permanently installable, which is the thing Firefox users
      currently cannot have.

---

## 5. After both are live

- [ ] Paste the two store URLs into `INSTALL.md`. The restructuring is
      already done — "Install from the store" is the lead section with
      *(Link to follow.)* in place of each URL, load-unpacked has been
      demoted to "Install from source", and the Firefox "unloads every
      session" warning is now scoped to that route only. Search the file for
      `Link to follow` and for the `Where things stand` block at the top,
      which should change from "being submitted" to "available".
- [ ] Update the README status line and drop the "until those listings are
      live" wording, adding both store links.
- [ ] Tag the release in git and attach the zip to a GitHub release, so the
      exact reviewed artefact stays recoverable.
- [ ] Tell the table.

## Updating later

Each subsequent release is: bump both version strings → `npm run
release:check` → work section 2 → upload the new zip to both dashboards.
Chrome re-reviews updates (usually faster than a first submission); AMO
re-signs. Neither lets you reuse a version number that has already been
published, so a rejected upload needs the patch number bumped again.
