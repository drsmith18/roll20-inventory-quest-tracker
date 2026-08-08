# Roll20 Extension — Technical Feasibility Findings

**Date:** 8 August 2026
**Method:** Live inspection of three of DR's own Roll20 campaigns via browser, read-only. No campaign data was created, modified or deleted. No attempt was made to retrieve withheld GM content from the Eve of Ruin campaign.

**Campaigns inspected**
| Campaign | ID | Role | Purpose |
|---|---|---|---|
| DR's New Game 3 | 21861807 | GM | GM-side globals, compendium behaviour |
| DNDR | 11287757 | GM | Second GM sample |
| Eve of Ruin | 21391475 | Player | The player-side visibility test |

---

## 1. Role detection — works, but is not a security boundary

The page exposes, in page context:

| Global | Value observed |
|---|---|
| `window.is_gm` | `true` in his own games, `false` in Eve of Ruin |
| `window.campaign_id` | `21861807` |
| `window.campaign_storage_path` | `campaign-21861807-<token>` |
| `window.d20_player_id` | Firebase-style player key, differs per campaign |
| `window.d20_current_name` | `DR` |
| `window.Campaign` | Backbone model — `players`, `characters`, `handouts`, `pages` |

ROLE-1 and ROLE-2 are satisfied: role is readable with no user configuration, and the sensible default when the flag is missing is player.

**But ROLE-3 is not satisfied and cannot be, client-side.** `is_gm` is an ordinary page variable. Any player can set it to `true` in their own console before the extension reads it. It is fine for deciding what UI to draw; it is worthless as a guarantee about what data a user may access.

**A problem for the Q6 decision.** The `Campaign.players` collection exposes `displayname`, `d20userid`, `online` and `color` — but **no per-player GM flag**. A client can determine whether *it* is a GM; it cannot enumerate which *other* players are GMs. The agreed model of "all GMs get full DM rights" therefore has no direct client-side implementation. Options: infer from who has written GM-scoped data, have each GM client register itself on first load, or fall back to Roll20's own permission enforcement and let the server decide what each client can see. The third is the cleanest and lines up with §3 below.

## 2. Campaign scoping — trivially solved

`campaign_id` is a stable integer in page context, and `campaign_storage_path` gives a per-campaign namespaced token. SYS-1 and SYS-3 need no design work: key everything on `campaign_id`.

## 3. Storage and sync — much better than assumed

Roll20 runs on Firebase. Present in page context: `FIREBASE_ROOT` (`https://roll20-99911.firebaseio.com/`), `BackboneFirebase`, `firebaseLastPing`, and per-campaign credentials in `Campaign.attributes.fbauthinfo`.

Every seated client is therefore already connected to an authenticated, realtime, per-campaign datastore, with `handouts` and `characters` as live-syncing Backbone collections. Piggybacking on it would satisfy SYS-2, SYS-4, SYS-5 and SYS-6 with no hosting cost, no accounts, and no third-party dependency for the group to trust.

**This substantially resolves C2 in favour of storing state inside the game rather than a hosted service** — at the cost of the multi-group product ambition, which would need the hosted option later.

## 4. The hiding test — the important result

Logged in as a **player** in Eve of Ruin:

| Measure | Count |
|---|---|
| Handouts present in the player's client | 396 |
| Of those, not shared with players | 395 |
| Characters present in the player's client | 167 |
| Of those, not shared with players | 161 |

So the **existence and names** of GM-only objects are delivered to every player's client. A player can enumerate the entire journal.

However, for GM-only objects the `notes` and `gmnotes` fields came back **empty strings** — the bodies are withheld server-side, not merely hidden in the UI.

**Conclusion, and it is the answer to C1:** content can be genuinely hidden from players; existence and names cannot.

**Design rule that follows:** hidden bags, unrevealed quests and their contents must live in the *body* of a GM-only object, and the object's *name* must carry no information — a GUID or a fixed prefix, never "Lich's Vault" or "Session 12 Ambush Loot".

**Bonus finding for Q8.** `inplayerjournals` is a list of player IDs, not a boolean. Roll20's own permission model is therefore already per-player, which maps exactly onto the per-player quest reveal decision. Q8 costs less than feared.

## 5. Compendium drag — thin payload, but a resolvable one

The draggable element in compendium search results is `.compendium-page__upper`, carrying **both** an HTML5 `draggable="true"` attribute and jQuery UI's `ui-draggable ui-draggable-handle` classes. `#editor-wrapper` carries `ui-droppable`.

Data attributes on the dragged element:

| Attribute | Example |
|---|---|
| `data-pagename` | `Items%3ALongsword` |
| `data-expansionid` | `33335` |

That is all. **No stats, no description, no weight, no value.** A drop yields an identifier, not an item.

Full data is served from a GraphQL endpoint — `https://compendium.production.roll20preflight.net/graphql` — observed firing on compendium search.

**Consequences for INV-10:**
- Achievable, via a lookup at drop time keyed on pagename plus expansion.
- The endpoint is undocumented and internal. It can change without notice. This is an ongoing maintenance risk on top of C5.
- Compendium content is entitlement-gated. A player may not be able to resolve a book they do not own. This is a second, independent reason the resolved data must be **stored at drop time** rather than re-fetched per viewer — which INV-10 already requires, so the spec holds.
- The panel must accept **jQuery UI drops**, not only HTML5 drop events. An extension listening for `drop` alone may see nothing.

## 6. Ruleset detection — better than expected

A search for "longsword" returned two distinct results, "Free Basic Rules (2024)" and "Free Basic Rules (2014)", each with its own `expansionid`. Characters carry `charactersheetname` — observed as `dnd2024byroll20` — plus `expansion` and `character_type` (`pc` / `npc`).

Ruleset is therefore detectable **per character**, not just per game, which is stronger than C3 assumed. The Q9 decision to support both 2014 and 2024 is feasible.

## 7. Two backends, and lazy loading

All three campaigns reported `release: "jumpgate"`, and the games list shows at least one campaign tagged **Legacy**. Two distinct Roll20 backends are therefore in play, and the extension must either handle both or declare Jumpgate-only.

More importantly: a character's `attribs` collection was present but **empty** until the sheet is opened. Character attributes are lazy-loaded. Writing an item or a coin total to a sheet is therefore not a single write — the attribute collection has to be loaded first. This is the main remaining unknown behind INV-21, INV-23 and INV-20g.

## 8. No mod scripts available

The account shows a free-tier upgrade prompt. Roll20's mod/API scripts are Pro-only, so a server-side authority implemented as a Roll20 script is not available to DR, and would not be available to most DMs either. The product must work entirely from the client plus Roll20's own server-side permission enforcement.

---

## Recommended direction — adopted

Store all state in Roll20 handouts within the campaign, **one handout per bag and per quest**, plus a small index handout for configuration and an append-only handout for the activity log. All of them opaquely named and filed in a dedicated journal folder.

- **Revealed data** — handouts shared with players via `inplayerjournals`, giving read and write access through Roll20's own permissions.
- **Hidden data** — GM-only handouts, whose bodies Roll20 refuses to send to player clients.
- **Per-player reveal** — expressed directly as `inplayerjournals` player-ID lists.

One handout for everything was rejected: hidden content would sit in a body players can read. Splitting revealed from hidden fixes that but not per-player reveal, since each distinct visibility set needs its own object. Per-object is also the only layout where two players editing different bags cannot collide.

**Item stats** resolve from Roll20's compendium GraphQL endpoint at drop time. Open content sources were rejected as a primary: they carry SRD only, so nothing from a purchased book would resolve. The fragility of an undocumented endpoint is accepted, with a name-only entry (INV-11) as the graceful fallback when a lookup fails.

**Multi-GM** support is retained rather than dropped. Each GM's own client reports `is_gm` true for itself, so every GM gets the DM interface with no enumeration needed. The only loss is that co-DMs cannot be distinguished from players in the reveal picker — cosmetic, and recorded as ROLE-6.

## Still to verify — now the spike brief

1. **Can a player write to a shared handout body and have it sync?** The whole shared-inventory premise rests on this. Needs a second Roll20 account.
2. **Writing items and coin to the 2024 and 2014 sheets**, including forcing the lazy `attribs` load. Gates INV-21, INV-23 and INV-20g.
3. **Handout body size limits**, and how a long campaign's inventory plus activity log behaves against them.
4. **Legacy backend behaviour** — everything above was observed on Jumpgate.
5. **Concurrency** — what Roll20 does when two clients write the same handout body simultaneously, which is SYS-7.

Items 1 and 2 are blocking. See the spike brief for how each is tested and what result would force a redesign.
