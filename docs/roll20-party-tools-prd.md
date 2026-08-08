# Party Tools for Roll20 — Product Requirements

**Status:** Draft v0.3 — v0.2 plus pre-spike corrections (ROLE-3 rewording, C6 added, SC renumbering); change notes inline
**Type:** Product requirements. Describes *what* the product must do and for whom. Deliberately excludes technical design.

---

## 1. Problem

Roll20 gives every character a sheet, but a party is more than a set of individuals. Two things consistently live outside the system and end up in a shared Google Doc, a Discord pin, or somebody's notebook:

- **Party-held stuff.** The loot nobody has claimed yet, the shared coin pouch, the bag of holding, the cart, the quest item that isn't anyone's. Tracking it on one player's sheet makes that player the de facto quartermaster and creates arguments when they're absent.
- **What the party is actually doing.** Which threads are open, which steps are done, what the reward was supposed to be, and what that cryptic thing the innkeeper said three sessions ago might have meant.

Both are handled badly today, and both are handled *outside* the tool the group is already looking at, which means they go stale mid-session.

## 2. Product summary

A browser extension that adds a compact, dockable panel to a Roll20 game, providing:

1. **Shared party inventory** — one or more bags holding items and currency, visible and editable by the whole party, persisted per game.
2. **Quest tracker** — DM-authored multi-step quests with controlled reveal, attached loot rewards, and player-authored notes.

The quest tracker is optional and can be switched off per game; the inventory is the core.

## 3. Goals and non-goals

**Goals**

- G1 — Replace the out-of-band shared doc for party loot with something that lives next to the game.
- G2 — Make item handling fast enough to use live, mid-session, without breaking flow. Adding loot should take seconds, not a form.
- G3 — Preserve DM authority: the DM can prepare content in advance and control exactly when players see it.
- G4 — Work with zero setup. Install, open a game, it knows who you are and which game you're in.
- G5 — Survive between sessions and across many concurrent games per user.

**Non-goals (v1)**

- N1 — Not a character sheet replacement or an encumbrance simulator.
- N2 — Not a campaign wiki, session notes tool, or lore database.
- N3 — Not a combat tracker or initiative tool.
- N4 — Not a standalone product usable without Roll20 open. There is no separate web or mobile view in v1. Note this is less limiting than it sounds: a Roll20 game page can be opened solo at any time, so players can still review quests, read clues, and add notes between sessions without the DM present. It fails only for someone wanting to check the party's gold from their phone.
- N5 — No rules enforcement — the tool tracks what the group says is true, it does not adjudicate.

## 4. Users and roles

| Role | Who | Summary of rights |
|---|---|---|
| **DM** | Exactly one per game — the Roll20 GM | Everything a player can do, plus: create/hide/reveal bags, author quests, reveal and complete steps, attach rewards, configure the game, override anything |
| **Player** | One or more per game | View revealed bags, add and remove items, transfer items to their own character, view revealed quests, write notes |

**Role detection**

- ROLE-1 — The extension must determine whether the current user is the DM or a player from the Roll20 session itself. No setup screen, no "are you the DM?" prompt, no invite codes.
- ROLE-2 — If role cannot be determined confidently, the extension must fail closed: treat the user as a player and show nothing hidden.
- ROLE-3 — *(reworded in v0.3 — the original "a player must not be able to grant themselves DM rights" is not achievable client-side, per the technical findings §1)* What the product actually guarantees: a player who fakes the GM flag in their own console gains the DM **interface** but not DM **sight** — hidden bags and unrevealed quests stay hidden, because Roll20 withholds GM-only handout bodies server-side. DM-only *actions* on data players can already see and edit (marking steps complete, reversing log entries, currency rules) are enforced by the UI only; a determined cheat could perform them by manipulating shared storage directly. This is accepted: the tool serves tables that already run on trust. Hiding is the hard guarantee; authority over shared data is not.
- ROLE-4 — Where a Roll20 game has more than one GM, every GM receives full DM rights. This gives away nothing, since Roll20 already grants GMs sight of all hidden content in the game itself. The extension must not block or degrade for co-DM tables.
- ROLE-5 — Because "the DM" may be several people, the activity log records which GM performed each action rather than attributing it generically.
- ROLE-6 — Known limitation: a client can determine that it is a GM, but cannot identify which *other* users are GMs, because Roll20's player data carries no GM flag. Consequence: a co-DM appears in the per-player reveal picker alongside the players. This is cosmetic and accepted for v1.

## 5. Core concepts

| Term | Meaning |
|---|---|
| **Game** | A single Roll20 campaign. All data is scoped to one game. |
| **Bag** | A named container within the party inventory. Bags hold items and currency. Bags are flat containers, listed side by side or as a folder tree in the panel. |
| **Item** | An entry in a bag, ideally carrying the stats and description it had in the compendium, plus quantity and any party-added note. |
| **Quest** | A named objective with a description, a status, an ordered set of steps, and optional rewards. |
| **Step** | A stage within a quest, independently revealable and completable, with optional rewards of its own. |
| **Reward** | One or more items and/or an amount of currency attached to a quest or step, released into a bag when claimed. |
| **Reveal** | The act of making a DM-authored object visible to players. The inverse (re-hiding) must also be possible. |

---

## 6. Requirements — Party Inventory

### Bags

- INV-1 — Every game has at least one bag, created automatically on first use ("Party Loot" or similar) so there is no empty-state setup step.
- INV-2 — Bags have a name and, optionally, a short description and an icon or colour.
- INV-3 — The DM can create, rename, reorder, and delete bags.
- INV-4 — Players can also create bags. Players can rename and delete bags they created while those bags are empty; the DM can rename, delete, or merge any bag. This keeps a long campaign from accumulating "misc", "misc 2" and "stuff" with nobody able to clear them.
- INV-5 — Bags can be **hidden**. A hidden bag and its entire contents are invisible to players; they must have no indication it exists.
- INV-6 — The DM can reveal a hidden bag to the party, and can re-hide it.
- INV-7 — Deleting a non-empty bag requires confirmation and must offer to move contents elsewhere rather than destroy them.
- INV-8 — Bags nest exactly one level: a bag may contain sub-bags, but a sub-bag may not. This covers the pouch-inside-the-bag-of-holding case without becoming a file tree.
- INV-8a — A sub-bag can be hidden and revealed independently of its parent, so a known chest can hold a compartment the party hasn't found.

### Items

- INV-9 — Items are added by dragging from the Roll20 compendium and dropping onto the panel or onto a specific bag.
- INV-10 — A dropped item inherits its name, description, stats, weight, value, rarity, and image from the source, and stores them so the entry remains meaningful without re-fetching.
- INV-11 — Items can also be created manually, by name, for homebrew and improvised objects ("the innkeeper's severed hand", "a strangely warm rock"). Free-text name, optional description, optional value and weight.
- INV-12 — Items have a quantity. Identical items stack, with an explicit split action.
- INV-13 — Any player or the DM can move an item between bags.
- INV-14 — Any player or the DM can delete an item, with confirmation. Deletion is recoverable by the DM from the activity log for the life of the game (INV-22a); there is no player-side undo. *(v0.3: was "recoverable for a period", which contradicted INV-22b's life-of-game retention.)*
- INV-15 — Items can carry a free-text note added by any party member ("Heather thinks this is cursed").
- INV-16 — The DM can obscure an item. Players then see only a DM-written surface description ("a dull grey rod, warm to the touch") with no stats, value, or true name. The DM sees both versions.
- INV-16a — Obscuring must be possible **at the moment of drop**, not only afterwards — an item dragged from the compendium arrives with full stats, and players must never see them flash into view first. Either a modifier on the drop, or a per-game setting where anything the DM drops starts obscured.
- INV-16b — Revealing an item's true nature is a single DM action, and appears in the activity log.

### Currency

- INV-17 — Each bag holds a coin purse tracked separately from items, by denomination. Denominations are ruleset-aware: pp/gp/ep/sp/cp under 2014, pp/gp/sp/cp under 2024, which dropped electrum from the standard coin table.
- INV-18 — Any player can add to or remove from a purse, with a reason field that is optional but encouraged. Every change is logged with who, how much, and when.
- INV-19 — The DM can stock a purse in a hidden bag, so prepped loot includes coin and not just items.
- INV-20 — Total party wealth is visible at a glance across all revealed bags, expressed as a single converted figure alongside the raw coin counts.

**Splitting**

- INV-20a — A **split** divides coin between a chosen set of characters. The DM or any player can initiate one.
- INV-20b — The split covers either the whole purse or a specified amount, and applies to a chosen subset of characters — not automatically everyone, since the party is often split or a member is absent.
- INV-20c — Mechanically the split converts all coin down to the smallest denomination, divides by the number of recipients, then re-expresses each share in the largest sensible denominations for display. This avoids the case where three platinum simply cannot be divided four ways.
- INV-20d — Any remainder that will not divide stays in the purse. It is never silently discarded and never handed to an arbitrary player.
- INV-20e — Shares are re-expressed to gold at most by default, not platinum, because players generally want spendable coin. Worth noting as a side effect: converting down means a purse of platinum comes out the other side as gold. Value is preserved, denomination is not.
- INV-20f — The split is previewed before it is committed: who receives what, in which denominations, and what stays behind. It is confirmed in one action, and appears in the activity log as a single entry rather than one per recipient.

**Worked example** — 3 pp, 137 gp, 12 sp, 7 cp split four ways:

| Step | Value |
|---|---|
| Converted to copper | 16,827 cp |
| Each share | 4,206 cp |
| Displayed as | 42 gp, 6 cp each |
| Stays in purse | 3 cp |

- INV-20g — Coin is pushed to each recipient's character sheet where that sheet supports it. Where it does not, the share is recorded against the character as assigned and the player transfers it manually, mirroring the item fallback in INV-24.
- INV-20h — In the fallback case the coin still leaves the purse on confirmation. Leaving it in place would double-count the party's wealth. The assigned-but-not-transferred state must be visible so nothing is quietly lost.

### Transfers to characters

- INV-21 — A player can claim an item from a bag to their own character. The item leaves the bag and appears on that character's sheet.
- INV-22 — Every add, remove, transfer, and currency change is recorded in an **activity log** showing who did what and when, visible to all. This is the mechanism for resolving "who took the rope".
- INV-22a — Only the DM can reverse an action from the log. Players see the full history but cannot undo, including their own mistakes — they ask the DM, which matches how a table already works.
- INV-22b — The log is retained for the life of the game. It is small, text-only, and its value is precisely that it goes back far enough to settle an argument about session four.
- INV-23 — Transfers work in both directions. A player can claim an item from a bag to their character, and push an item from their character into a bag.
- INV-23a — Where a player controls more than one character, the panel asks which character a transfer applies to rather than guessing.
- INV-23b — A player can only push from characters they control. Nobody can move items off someone else's sheet.
- INV-24 — If writing to a character sheet is not reliably possible, the fallback is a clearly-marked "assigned to" state on the item, with the transfer to the sheet done manually by the player. This must be a decision made explicitly, not a silent degradation.

### Search and scale

- INV-25 — Search across all revealed bags by item name.
- INV-26 — Sort a bag by name, value, weight, quantity, and date added.
- INV-27 — The panel must remain usable with 200+ items across 10+ bags in a long campaign.

---

## 7. Requirements — Quest Tracker

### Enable / disable

- QST-1 — The DM can turn the quest tracker on or off for a game. It is **off by default**, so a DM who only wants shared loot gets exactly that.
- QST-1a — Because it is off by default, discoverability is a real risk: a DM who never notices the toggle never finds half the product. A one-time, dismissible prompt on first use is required — burying it in settings is not sufficient.
- QST-2 — With it off, no quest UI appears for anyone and the inventory functions unchanged.
- QST-3 — Turning it off must not destroy existing quest data; turning it back on restores it exactly.

### Authoring (DM)

- QST-4 — The DM can create a quest with a title, description, and optional tags or category (main / side / faction / personal).
- QST-5 — A quest contains an ordered list of steps, each with a title and description.
- QST-6 — Steps can be reordered, edited, and deleted. Steps can be inserted mid-quest, since players rarely follow the plan.
- QST-7 — All quests and steps are hidden from players by default on creation. Nothing becomes visible without an explicit reveal.
- QST-8 — The DM can attach rewards — items dragged from the compendium and/or a currency amount — to a quest, or to any individual step.
- QST-9 — The DM can author quests offline, i.e. outside a live session, and have them ready when the game opens.
- QST-10 — Quest visibility is scoped per player. The DM can reveal a quest or an individual step to the whole party or to any subset of players, supporting personal quests, secrets, and split-party information.
- QST-10a — Visibility is therefore a set of players per object, not a single on/off flag. The DM's authoring view must make it obvious at a glance who can currently see each quest and each step.
- QST-10b — This raises the bar on §10 C1: content must be filtered per player, not merely DM-versus-everyone.

### Reveal and progression

- QST-11 — The DM can reveal a quest to players, and can reveal individual steps independently. A visible quest may have hidden later steps.
- QST-12 — The DM can re-hide a revealed quest or step.
- QST-13 — Only the DM can mark a step or quest complete.
- QST-14 — Quest statuses: Hidden, Active, Complete, Failed, Abandoned. Steps: Hidden, Active, Complete, Skipped.
- QST-15 — Completing a step with attached rewards drops those rewards automatically into the game's designated default bag. No claim step.
- QST-15a — Each game has a default reward bag, set by the DM, defaulting to the first bag created.
- QST-15b — Because auto-drop means loot appears the instant the step is ticked — potentially before the DM has described it — the DM can mark an individual reward as **held**, so it waits for an explicit release.
- QST-16 — Claimed rewards appear in the chosen bag as normal items and are recorded in the activity log as coming from that quest.
- QST-17 — Completing a quest surfaces some visible acknowledgement in the panel — this is a moment worth marking, not a silent state change.
- QST-18 — Completed quests move to a collapsed archive rather than cluttering the active list, and remain readable.

### Player interaction

- QST-19 — Quests and steps are read-only for players — title, description, status, and revealed steps.
- QST-20 — Players can add notes to a quest or to an individual step, and can edit and delete their own notes.
- QST-21 — Notes are visible to everyone, the DM included. Players write for the party, and the DM gets to see which clues have landed and which theories have gone badly wrong.
- QST-21a — Notes are attributed to their author. Any player can read them; only the author or the DM can edit or delete a given note.
- QST-22 — Players can see which rewards are attached to a revealed step **only if the DM has chosen to show them.** A DM may want to dangle a reward or keep it a surprise.
- QST-23 — Players cannot mark anything complete and have no "we think this is done" flag. Completion is the DM's call alone. If the party believes a step is finished, they say so at the table or write it in a note.

---

## 8. Cross-cutting requirements

### Persistence and game scoping

- SYS-1 — All data is scoped to a single Roll20 game. Opening a different game shows that game's data and nothing else, with no user action.
- SYS-2 — Data persists between sessions indefinitely, including across browser restarts, different devices, and different browsers.
- SYS-3 — A user with several games must never see one game's data in another, and must not have to switch context manually.
- SYS-4 — Data belongs to the game, not to the individual user's browser. A player who reinstalls the extension or joins on a new machine sees the current party inventory immediately.
- SYS-5 — If the DM's data is the source of truth, players must still see current state when the DM is offline, or the product fails between sessions.

### Sync and concurrency

- SYS-6 — Changes made by one user appear to all other connected users promptly — target under 5 seconds, ideally near-instant. Mid-session, two people should not be looking at different inventories.
- SYS-7 — Simultaneous edits must not silently lose data. Two players claiming the same last healing potion must produce one winner and a clear message to the loser, not two potions or none.
- SYS-8 — The panel must degrade gracefully if connectivity drops: show a clear stale/offline indicator rather than accepting edits that will vanish.

### Partial adoption

- SYS-9 — The product must be useful when only some of the group has installed it. A party where the DM and two of four players have it should still work, with the non-installers simply not participating.
- SYS-10 — There must be a way for the DM to see who at the table has the extension active.

### Permissions summary

| Action | Player | DM |
|---|---|---|
| View revealed bags and items | ✓ | ✓ |
| View hidden bags | ✗ | ✓ |
| Add / remove / move items | ✓ | ✓ |
| Add / remove currency | ✓ | ✓ |
| Create bags | ✓ | ✓ |
| Hide / reveal bags | ✗ | ✓ |
| Claim item to own character | ✓ | ✓ |
| Create / edit quests and steps | ✗ | ✓ |
| Reveal / hide quests and steps | ✗ | ✓ |
| Mark complete | ✗ | ✓ |
| Attach rewards | ✗ | ✓ |
| Add notes to quests | ✓ | ✓ |
| Toggle quest tracker on/off | ✗ | ✓ |
| View activity log | ✓ | ✓ |

---

## 9. Interface requirements

- UI-1 — The extension surfaces as a compact panel overlaid on the Roll20 game page, opened from a small persistent launcher (a tab, button, or icon) that is always reachable and never obscures Roll20 controls.
- UI-2 — The panel occupies a minority of the screen. Roll20's tabletop, journal, chat, and compendium must all remain usable and readable alongside it.
- UI-3 — The panel can be minimised to the launcher and reopened in one click, retaining its previous tab, scroll position, and expanded/collapsed state.
- UI-4 — The panel can be repositioned and resized, and remembers this per user across sessions.
- UI-5 — The panel is a valid drop target for Roll20 compendium drags, with clear visual affordance on hover: which bag will receive the item, and what will happen.
- UI-6 — Two primary tabs: Inventory and Quests. If the quest tracker is off, the tab is absent, not disabled.
- UI-7 — Hidden content in the DM's view must be visually unmistakable — no risk of the DM reading out a hidden bag believing the party can see it. This is the single most important visual distinction in the product.
- UI-8 — Reveal and hide actions are single-click and reversible, because they will be used live under time pressure.
- UI-9 — The panel must be legible over Roll20's dark UI and should not fight with it stylistically.
- UI-10 — Screen-share safety: the DM should be able to hide the panel instantly, since many groups share screens.

---

## 10. Constraints and things to resolve before design

These are the areas where the product intent above meets real limits. They need answers because the answers change what can be promised to users.

**C1 — Hiding is possible, but only of content, never of names. RESOLVED.**
Verified live: a player's client receives the existence and names of every GM-only object in a campaign, but Roll20 withholds the bodies server-side. So hidden bags and unrevealed quests must live in the *body* of a GM-only handout, and the handout's name must carry no information — an opaque identifier, never "Lich's Vault". Hiding is a real guarantee for content and no guarantee at all for names.

**C2 — State lives in Roll20 handouts. RESOLVED.**
Roll20 runs on Firebase and every seated client is already on an authenticated, realtime, per-campaign store. Storing state as handouts inside the campaign gives per-campaign scoping, cross-session persistence, live sync and server-enforced hiding, with no hosting cost and no accounts. The cost is that the product is bound to Roll20's data model and the hosted multi-group ambition is deferred rather than designed for.

**C3 — Writing to character sheets is sheet-specific, and v1 targets two sheets.**
"Send this to the player's inventory" means different things on different character sheets, and Roll20 supports many. v1 supports D&D 5e under both the 2014 and 2024 rulesets — which in Roll20 terms means two distinct character sheets and two compendium sets, with item fields that do not fully line up (2024 changed item properties and weapon handling). Two consequences: the item model must store whatever it is handed rather than assume a fixed schema, and a game should declare which ruleset it uses so transfers target the right sheet. Everything else falls back to INV-24.

**C4 — Compendium content and drag payloads.**
What data actually travels with a compendium drag, and whether it's enough to satisfy INV-10, needs verifying early. If it's thin, the fallback is enriching from an open content source, which raises a licensing and correctness question about what the product stores and redistributes.

**C5 — Extension distribution.**
Chrome Web Store and Firefox add-on review, plus the ongoing maintenance risk that any Roll20 UI change can break the integration. Not a v1 feature question, but it shapes how much the product should depend on Roll20's page structure.

**C6 — Three storage-layout gaps in Q19, found in pre-spike review (v0.3).**
1. An obscured item (INV-16) sits in a *revealed* bag, whose handout body every player's client can read. Its true name and stats therefore cannot be stored in that body — they need GM-only storage. Candidate: the bag handout's `gmnotes` field, **if** spike S1b confirms Roll20 withholds `gmnotes` on shared handouts the way it does on GM-only ones. Otherwise, a parallel GM-only handout per bag.
2. Quests must be player-visible but not player-editable (QST-19). Roll20 separates viewing (`inplayerjournals`) from editing (`controlledby`), so the quest handout can be read-only to players — but then player notes (QST-20) cannot live in it. Notes need a separate player-writable store.
3. The activity log is one handout that every client writes. It is the one place Q19's "concurrent edits never collide" argument fails — spike S5's result applies to it most of all — and anyone with write access can also edit history, so the log is evidence, not proof (see ROLE-3).

---

## 11. Decisions log

All questions raised in v0.1 are now resolved. Recorded here with the reasoning, so a later reader knows what was weighed rather than only what was chosen.

| # | Question | Decision | Reasoning |
|---|---|---|---|
| Q1 | Who can create bags? | Anyone | Players self-organise without asking; DM retains delete and merge as the tidy-up valve |
| Q2 | Bag nesting depth | One level | Covers pouch-in-a-bag-of-holding without becoming a file tree |
| Q3 | Unidentified items in v1? | Yes | Core D&D pattern; accepted cost is a third per-item visibility state |
| Q4 | Undo from the log? | DM only | Mirrors the table — players ask the DM to fix a mistake. Log kept for the life of the game |
| Q5 | Push items sheet → bag? | Yes, both directions | Accepted as double the sheet-integration work; one-way transfer is half a feature |
| Q6 | Multiple Roll20 GMs? | All GMs get DM rights | Revised from "block with warning". Co-DM tables are common and GMs already see everything in Roll20, so blocking cost real users for no security gain |
| Q7 | Quest tracker default | Off | Inventory is the core; quests are opt-in. Requires a first-use prompt to stay discoverable |
| Q8 | Quest reveal scope | Per player | Enables secrets, personal quests and split-party info. Raises the bar on C1 |
| Q9 | Systems supported | D&D 5e, 2014 and 2024 | Two Roll20 sheets and two compendium sets; item model must not assume a fixed schema |
| Q10 | Reward release | Auto-drop to default bag | Fewer clicks mid-session; a per-reward "hold" covers the DM who wants to narrate first |
| Q11 | Note visibility | Everyone, DM included | DM sees which clues landed; removes any private-channel complexity |
| Q12 | Player "done" flag | No | Completion stays unambiguously the DM's call |
| Q13 | View outside Roll20 | No, v1 is Roll20-only | Softened by the fact that a game page can be opened solo between sessions |
| Q14 | Bulk item import | No | Prep is one-at-a-time; revisit if prep friction shows up in use |
| Q15 | Split denomination handling | Convert down, then split | Only way to divide coin that won't split cleanly at its own denomination |
| Q16 | Uneven remainder | Stays in the purse | No arbitrary winner; the party decides what to do with the odd coppers |
| Q17 | Does a split move money? | Push where the sheet allows | Automatic where possible, recorded assignment where not |
| Q18 | Where does state live? | Roll20 handouts in the campaign | Free per-campaign scoping, live sync, no hosting or accounts, and genuine server-enforced content hiding |
| Q19 | Storage layout | One handout per bag and per quest | Only layout where per-player reveal maps onto `inplayerjournals` and concurrent edits to different objects never collide |
| Q20 | Item stat source | Roll20 compendium GraphQL | Open content covers SRD only, so purchased books would not resolve. Fragility accepted, with a name-only fallback |
| Q21 | First build | Spikes before v1 | Two unverified assumptions could invalidate the storage approach entirely |

### Still genuinely open

- **Two blocking assumptions, both unverified.** Whether a player can write to a shared handout body and have it sync, and whether items and coin can be written to the 2014 and 2024 sheets given attributes load lazily. Both are covered by the spike brief and must be answered before v1 work starts.
- **Three lesser unknowns.** Handout body size limits against a long campaign, behaviour on the Legacy backend, and what Roll20 does on simultaneous writes to the same handout (SYS-7).
- **One added in v0.3.** Whether `gmnotes` on a *shared* handout is withheld from players server-side, which decides where obscured-item true stats live (C6.1). Covered by spike S1b.

---

## 12. Success criteria

*(v0.3: renumbered from S1–S5 to SC-1–SC-5, which collided with the spike IDs in the spike brief.)*

- SC-1 — A group stops using their shared loot document within two sessions of adopting the tool.
- SC-2 — Adding a dropped item to a bag takes under 10 seconds mid-session.
- SC-3 — Zero instances of a DM accidentally revealing hidden content through the UI.
- SC-4 — Party inventory is still correct and current at the start of the next session with no manual reconciliation.
- SC-5 — A new player joining an existing campaign gets the full current picture with no onboarding beyond installing the extension.

## 13. Possible later scope

- Weight and encumbrance totals per bag, with carrying-capacity warnings
- Item marketplace / shop mode for buying and selling with automatic currency handling
- Export of party inventory and quest history at campaign end
- Templates: reusable loot tables and quest structures across campaigns
- Bulk item import for prepping a whole hoard at once (deferred from v1, Q14)
- Support for game systems beyond D&D 5e
- Standalone web view usable outside Roll20
- Multi-group hosted service, so the tool works for groups beyond the author's own

---

## 14. Delivery constraints

These were absent from v0.1 and v0.2. The values below are proposed defaults, not decisions already taken — flag anything you disagree with.

- **DEL-1 — Browser support.** Chrome and Chromium-based browsers for v1. Firefox is deferred. Nothing in the design depends on Chrome specifically, but supporting one browser halves the testing burden while the risky parts are still unproven.
- **DEL-2 — Distribution.** v1 is loaded unpacked for your own group. Chrome Web Store submission comes only once the product survives real sessions, since review adds a delay to every fix and the integration is exposed to Roll20 UI changes (C5).
- **DEL-3 — First run, DM.** On first open in a game the panel creates its storage handouts, names them opaquely, files them in a dedicated journal folder, and shows the one-time quest tracker prompt (QST-1a). No configuration screen.
- **DEL-4 — First run, player.** On first open the panel finds the game's existing storage and shows the current inventory. If none exists, it says so plainly rather than creating anything — players never initialise a game.
- **DEL-5 — Schema versioning.** Stored data carries a schema version from the first commit. When the extension meets data written by a newer version than it understands, it goes read-only and says so, rather than corrupting a live campaign. Migrations run once, by the DM's client, and are logged.
- **DEL-6 — Journal hygiene.** All storage handouts live in one clearly-named journal folder so the DM's own journal stays navigable. Names are opaque identifiers, per C1.
- **DEL-7 — Testing.** A second free Roll20 account, invited to a test game as a player, is required equipment. Nothing about shared state, permissions, or reveal can be tested from a single account. Set this up before any build work.
