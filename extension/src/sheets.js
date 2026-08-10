// Party Tools — character sheet writer. Talks to Roll20's D&D 2024 Beacon
// sheet ("dnd2024byroll20") directly, bypassing the sheet's own UI code path,
// exactly as verified in docs/roll20-spike-findings.md (S2). Nothing else is
// supported: any other charactersheetname is refused, never attempted.
//
// Shape of the world (S2):
//   - A character's `attribs` collection is LAZY. On a fresh client it is
//     empty until we attach a BackboneFirebase and wait for it to fill.
//   - The whole character lives in the "store" attribute's `current`, which
//     is normally a live object but can arrive as a JSON string.
//   - Items, currencies and attacks all live in a flat map,
//     store.integrants.integrants (id -> record), linked by parentID /
//     childIDs. childIDs is a STRING holding a JSON array — never treat it
//     as an array directly.
//   - Currency records are keyed by denomination name ("platinum", "gold",
//     "electrum", "silver", "copper"), amount in a single `value` field.
//   - Every write is verified by re-reading the store after the fact — Roll20
//     writes can be silently rejected or silently lost, same as handouts
//     (storage.js), and must never be assumed to have taken.
(function (PT) {
  "use strict";

  var SUPPORTED_SHEET = "dnd2024byroll20";
  var MIN_SHEET_VERSION = 20;
  var MAX_SHEET_VERSION = 29;
  var ATTRIBS_TIMEOUT_MS = 10000;
  var ATTRIBS_POLL_MS = 300;
  var WRITE_VERIFY_DELAY_MS = 1500;

  var CURRENCY_ID_TO_DENOM = { platinum: "pp", gold: "gp", electrum: "ep", silver: "sp", copper: "cp" };
  var DENOM_TO_CURRENCY_ID = { pp: "platinum", gp: "gold", ep: "electrum", sp: "silver", cp: "copper" };

  PT.sheets = {};
  PT.sheets.SUPPORTED_SHEET = SUPPORTED_SHEET;

  // ---- small helpers --------------------------------------------------------
  function attrByName(character, name) {
    return character.attribs.models.filter(function (a) { return a.get("name") === name; })[0] || null;
  }

  // store.get("current") is a live object on a freshly-loaded client, but can
  // be a JSON string (e.g. after certain save round-trips) — handle both.
  function readStoreDoc(storeAttr) {
    var cur = storeAttr.get("current");
    if (cur && typeof cur === "object") return cur;
    if (typeof cur === "string") return PT.tryJson(cur);
    return null;
  }

  PT.sheets.isSupported = function (character) {
    return !!character && character.get("charactersheetname") === SUPPORTED_SHEET;
  };

  // GM sees every character; a player sees characters whose controlledby
  // attribute lists their player id, or is "all". Empty-named characters
  // (placeholders) are excluded. Purely synchronous — no network touched.
  PT.sheets.controlledBy = function (env) {
    var chars = Campaign.characters.models.filter(function (c) {
      var name = c.get("name");
      if (!name) return false;
      if (env && env.isGM) return true;
      var cb = c.get("controlledby") || "";
      if (cb === "all") return true;
      var ids = cb.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      return ids.indexOf(env && env.playerId) !== -1;
    });
    return chars.sort(function (a, b) {
      var an = a.get("name"), bn = b.get("name");
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  };

  PT.sheets.PARTY_TAG = "party";

  // Roll20's journal tags. The field is a string; observed as a JSON array
  // ('["party","npc"]') but tolerant of a plain comma list, because the format
  // is inferred rather than documented. Anything unparseable means "no tags"
  // — never an exception, and never a guess that widens what a player sees.
  function tagsOf(character) {
    var raw = character.get("tags");
    if (!raw) return [];
    var list = PT.tryJson(raw);
    if (!Array.isArray(list)) list = String(raw).split(",");
    return list
      .filter(function (t) { return typeof t === "string"; })
      .map(function (t) { return t.trim().toLowerCase(); })
      .filter(function (t) { return t; });
  }
  PT.sheets.hasPartyTag = function (character) {
    return tagsOf(character).indexOf(PT.sheets.PARTY_TAG) !== -1;
  };

  // Characters a PLAYER may reasonably hand coins or items to: the party.
  //
  // Campaign.characters on a player's client is NOT what that player can see
  // — Roll20 ships the whole character list (names included) and withholds
  // only the bodies. Listing it raw leaked every DM-only NPC's name into the
  // coin-split recipient picker, which is both a spoiler and a nonsense
  // choice: you could hand a share to a character you have never met.
  //
  // The rule: a character counts as party if some player controls it
  // (controlledby non-empty — NOT just the current player, since splitting
  // with the rest of the table is the entire point), or if the DM has opted
  // it in with the "party" journal tag, which is how an NPC hireling or a
  // shared mount joins the list. Everything else is invisible to players.
  // The GM sees all of it, as they do everywhere else.
  PT.sheets.partyVisible = function (env) {
    var chars = Campaign.characters.models.filter(function (c) {
      if (!c.get("name")) return false;
      if (env && env.isGM) return true;
      var cb = (c.get("controlledby") || "").trim();
      if (cb) return true;
      return PT.sheets.hasPartyTag(c);
    });
    return chars.sort(function (a, b) {
      var an = a.get("name"), bn = b.get("name");
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  };

  // ---- lazy load --------------------------------------------------------------
  // Attach BackboneFirebase (only if not already attached) and poll until the
  // attribs collection has arrived AND the "store" attribute is among them.
  // Never throws, never rejects.
  PT.sheets.load = function (character) {
    if (!character) return Promise.resolve({ ok: false, err: "no character given" });
    if (!character.attribs.backboneFirebase) {
      try {
        character.attribs.backboneFirebase = new BackboneFirebase(character.attribs);
      } catch (e) {
        return Promise.resolve({ ok: false, err: "failed to attach background sync: " + e.message });
      }
    }
    var t0 = Date.now();
    return (function poll() {
      if (character.attribs.length > 0 && attrByName(character, "store")) {
        return Promise.resolve({ ok: true });
      }
      if (Date.now() - t0 > ATTRIBS_TIMEOUT_MS) {
        return Promise.resolve({ ok: false, err: "timed out waiting for character data to load (" + (ATTRIBS_TIMEOUT_MS / 1000) + "s)" });
      }
      return PT.delay(ATTRIBS_POLL_MS).then(poll);
    })();
  };

  // sheetVersion is one of the handful of always-present attributes. Only a
  // narrow observed-safe range is treated as known; anything else refuses to
  // write rather than risk corrupting a real character (per spike findings'
  // "fail loudly, never guess" posture).
  function checkSheetVersion(character) {
    var vAttr = attrByName(character, "sheetVersion");
    if (!vAttr) return { ok: false, err: "sheetVersion attribute not found; refusing to write to an unrecognised sheet" };
    var v = parseInt(vAttr.get("current"), 10);
    if (isNaN(v) || v < MIN_SHEET_VERSION || v > MAX_SHEET_VERSION) {
      return { ok: false, err: "unrecognised sheet version (" + vAttr.get("current") + "); refusing to write" };
    }
    return { ok: true, version: v };
  }

  // Common prefix for every operation that only needs to READ the store:
  // sheet-support check, lazy load, parse. Unsupported sheets are refused
  // before any load is attempted.
  function prepareRead(character) {
    if (!character) return Promise.resolve({ ok: false, err: "no character given" });
    if (!PT.sheets.isSupported(character)) {
      return Promise.resolve({ ok: false, err: "unsupported character sheet (only " + SUPPORTED_SHEET + " is supported)" });
    }
    return PT.sheets.load(character).then(function (res) {
      if (!res.ok) return res;
      var storeAttr = attrByName(character, "store");
      var doc = readStoreDoc(storeAttr);
      if (!doc) return { ok: false, err: "character store could not be read or parsed" };
      return { ok: true, storeAttr: storeAttr, doc: doc };
    });
  }

  // Same, plus the sheetVersion gate — used by every function that WRITES.
  function prepareWrite(character) {
    return prepareRead(character).then(function (p) {
      if (!p.ok) return p;
      var v = checkSheetVersion(character);
      if (!v.ok) return v;
      return p;
    });
  }

  // Saves the modified store, bumps updateId, waits, re-reads, and calls
  // verify(doc) on the fresh read to confirm the change actually stuck.
  // Never assumes a write succeeded (S1/S5: rejection and loss are silent).
  function writeStore(character, storeAttr, nextDoc, verify) {
    var updateIdAttr = attrByName(character, "updateId");
    try {
      storeAttr.save({ current: nextDoc });
      if (updateIdAttr) updateIdAttr.save({ current: PT.uid() });
    } catch (e) {
      return Promise.resolve({ ok: false, err: "write threw: " + e.message });
    }
    return PT.delay(WRITE_VERIFY_DELAY_MS).then(function () {
      var doc = readStoreDoc(storeAttr);
      if (!doc) return { ok: false, err: "could not re-read the store after writing" };
      if (verify && !verify(doc)) {
        return { ok: false, err: "write did not persist (verification failed after re-read)" };
      }
      return { ok: true, doc: doc };
    });
  }

  function purseFromDoc(doc) {
    var purse = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    var ints = doc && doc.integrants && doc.integrants.integrants;
    if (!ints) return purse;
    Object.keys(CURRENCY_ID_TO_DENOM).forEach(function (currencyId) {
      var rec = ints[currencyId];
      purse[CURRENCY_ID_TO_DENOM[currencyId]] = rec ? (Number(rec.value) || 0) : 0;
    });
    return purse;
  }

  // ---- coins ------------------------------------------------------------------
  PT.sheets.readCoins = function (character) {
    return prepareRead(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      return { ok: true, purse: purseFromDoc(p.doc) };
    });
  };

  // deltas is {pp,gp,ep,sp,cp}, positive or negative integers. Refuses
  // (changing nothing) if any resulting denomination would go below zero, or
  // if a denomination being changed has no currency record on the sheet at
  // all (we won't invent one — its conversion-chain shape is unknown to us).
  PT.sheets.addCoins = function (character, deltas) {
    return prepareWrite(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      var next = JSON.parse(JSON.stringify(p.doc));
      var ints = next.integrants && next.integrants.integrants;
      if (!ints) return { ok: false, err: "store has no integrants; cannot write coins" };

      var plan = {};
      for (var i = 0; i < PT.DENOMS.length; i++) {
        var d = PT.DENOMS[i];
        var delta = Number(deltas && deltas[d]) || 0;
        if (!delta) continue;
        var currencyId = DENOM_TO_CURRENCY_ID[d];
        var rec = ints[currencyId];
        if (!rec) return { ok: false, err: "no " + currencyId + " currency record on this sheet; nothing was changed" };
        var value = (Number(rec.value) || 0) + delta;
        if (value < 0) return { ok: false, err: "that would take " + currencyId + " below zero; nothing was changed" };
        plan[d] = value;
      }
      if (!Object.keys(plan).length) {
        // nothing to change — just report the current purse
        return { ok: true, purse: purseFromDoc(p.doc) };
      }
      Object.keys(plan).forEach(function (d) { ints[DENOM_TO_CURRENCY_ID[d]].value = plan[d]; });

      return writeStore(character, p.storeAttr, next, function (doc) {
        var bi = doc.integrants && doc.integrants.integrants;
        if (!bi) return false;
        return Object.keys(plan).every(function (d) {
          var r = bi[DENOM_TO_CURRENCY_ID[d]];
          return r && Number(r.value) === plan[d];
        });
      }).then(function (wr) {
        if (!wr.ok) return { ok: false, err: wr.err };
        return { ok: true, purse: purseFromDoc(wr.doc) };
      });
    });
  };

  // ---- items --------------------------------------------------------------
  // A compendium drop stores `data-datarecords` verbatim (drops.js) — the
  // Beacon payload graph this sheet itself consumes: the Item record plus its
  // parent-linked Attack and Damage records. Claiming used to ignore it and
  // synthesise one bare Item, which is why a longsword arrived on the sheet as
  // a possession with no attack, no damage dice and no properties.
  //
  // This rebuilds that graph onto the character. Every id is remapped to a
  // fresh one (the compendium's ids are not ours to reuse, and the same item
  // claimed twice must not collide), parent/child links are rewritten to
  // match, and the graph's root is re-rooted onto the character's own item
  // parent. Everything else in each record is carried over untouched — that
  // is where the weapon data lives, and we do not need to understand a field
  // to preserve it.
  //
  // Anything about the payload that does not match this understanding —
  // unparseable, no single Item root, implausibly large, a record without an
  // id — returns null, and the caller falls back to the plain-item write.
  // Refusing to guess is the house rule for sheet writes (see the version
  // gate above); a half-understood graph in a real character is not worth it.
  var MAX_GRAPH_RECORDS = 40;

  // Register a new record in its parent's child list, if the parent is itself
  // an integrant (a character-root parent isn't, and needs no update).
  // childIDs is a STRING holding a JSON array — parse, push, re-stringify.
  // Returns false if the parent's list is malformed, which means refuse.
  function registerWithParent(ints, parentId, childId) {
    if (!ints[parentId]) return true;
    var kids;
    try { kids = JSON.parse(ints[parentId].childIDs || "[]"); }
    catch (e) { return false; }
    if (!Array.isArray(kids)) return false;
    kids.push(childId);
    ints[parentId].childIDs = JSON.stringify(kids);
    return true;
  }

  // Every record in a payload list, parsed. Two different things arrive here
  // and they are told apart by whether the records carry ids (see below):
  //
  //   - a COMPENDIUM payload, as captured from a real longsword drop:
  //       [{name:"Longsword", payload:"{\"type\":\"Item\",\"name\":...}"}, ...]
  //     five records, each payload holding a `type` and content fields, and
  //     NO _id, NO parentID, NO childIDs. The links between them are not in
  //     the data.
  //   - a SHEET payload, which takeItem produces by serialising integrants
  //     that were already on a character. Those do carry _id/parentID/childIDs.
  function allPayloads(datarecords) {
    var raw = PT.tryJson(datarecords || "");
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_GRAPH_RECORDS) return null;
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i] && typeof raw[i].payload === "string" ? PT.tryJson(raw[i].payload) : null;
      if (!p || typeof p !== "object" || typeof p.type !== "string") return null;
      out.push(p);
    }
    return out;
  }

  // Only the id-carrying (sheet-sourced) case, which is the one buildGraph
  // can rewire. A compendium payload returns null here and takes the
  // single-record path instead.
  function payloadsOf(datarecords) {
    var out = allPayloads(datarecords);
    if (!out) return null;
    for (var i = 0; i < out.length; i++) {
      var id = out[i]._id || out[i].id;
      if (!id || typeof id !== "string") return null;
    }
    return out.length ? out : null;
  }

  // The compendium's own Item record. This is the fix for a longsword landing
  // as a possession: the record carries `weaponData`, `equipData.equippable`,
  // `properties` and the full description, and we were discarding all of it
  // to synthesise a bare Item from name/weight/cost. Using the sheet's own
  // record instead is not a guess about the format — it IS the format.
  //
  // Structural fields (_id, parentID, childIDs, quantity and the rest) are
  // never taken from here; addItem always sets those itself, which is also
  // what makes this safe for a sheet-sourced record that already has them.
  function compendiumItemPayload(datarecords) {
    var all = allPayloads(datarecords);
    if (!all) return null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].type === "Item") return all[i];
    }
    return null;
  }

  // Records in a payload that we have no rule for. Attack and Damage are
  // understood (see buildAttacks); anything else is counted and skipped
  // rather than written on a hunch.
  // Exactly what a claim will NOT write, by the same rules addItem applies.
  // Kept deliberately in step with buildAttacks: if this says nothing is left
  // over, nothing is being dropped.
  //
  // The cases that matter:
  //   - a SECOND Item record. A pack's contents would arrive this way, and
  //     only the first Item is written, so the rest are lost content — not a
  //     technicality. This used to be excluded from the count, which made it
  //     the one kind of loss the player was never told about.
  //   - a Damage with no preceding Attack: nothing to attach it to.
  //   - any type with no rule at all (armour and magic items are likely to
  //     bring some; see docs/future-ideas.md).
  function unwrittenSummary(datarecords) {
    var all = allPayloads(datarecords);
    if (!all) return { count: 0, types: [] };
    var types = [], seenItem = false, seenAttack = false, seenAction = false;
    all.forEach(function (p) {
      if (p.type === "Item") {
        if (!seenItem) { seenItem = true; return; }
        types.push("Item");
        return;
      }
      if (p.type === "Attack") { seenAttack = true; return; }
      if (p.type === "Damage") {
        if (!seenAttack) types.push("Damage");
        return;
      }
      if (CHILD_TYPES[p.type]) return;         // written as item children
      if (p.type === "Action") { seenAction = true; return; }
      if (p.type === "Resource" || p.type === "Healing") {
        if (!seenAction) types.push(p.type);   // nothing to attach it to
        return;
      }
      types.push(p.type);
    });
    return { count: types.length, types: types };
  }
  function unwrittenCount(datarecords) { return unwrittenSummary(datarecords).count; }

  function shortId() { return "pt" + Math.random().toString(36).slice(2, 8); }

  // What ties an attack to its weapon being equipped. Read off a real sheet:
  // every Attack and Damage record belonging to an item carries
  // cascades = { <itemId>: "[\"Equip\"]" }. A fresh object per record, so
  // nothing is shared between records in the same store.
  function equipCascade(itemId) {
    var c = {};
    c[itemId] = "[\"Equip\"]";
    return c;
  }

  // Turn a compendium payload's Attack and Damage records into sheet records
  // hanging off a newly written item.
  //
  // Pairing comes from ORDER, which is the only thing available — the payload
  // carries no ids and no links. A real longsword's five records arrive as
  // [Item, Attack, Damage, Attack, Damage], i.e. each Damage belongs to the
  // Attack it follows. A Damage appearing before any Attack has nowhere to go
  // and is counted as unwritten rather than guessed at.
  //
  // The structure being built, verified against a longsword the sheet itself
  // created (docs/future-ideas.md has the full capture):
  //   Item.childIDs   -> [attackId, ...]
  //   Attack.parentID -> itemId,   Attack.sourceID -> itemId, source "Item"
  //   Damage.parentID -> attackId, Damage.sourceID -> itemId, source "Item"
  // Record types that hang directly off the Item and are NOT attacks.
  // Captured from a sheet-made Breastplate, and deliberately different from
  // the Attack rule in three ways — every one of which would have been got
  // wrong by generalising from weapons:
  //   - no sourceID at all (an Attack carries sourceID: <itemId>)
  //   - no cascades at all (an Attack cascades off Equip)
  //   - `source` is the PAYLOAD'S own ("Armor" on an Armor Class record),
  //     not the provenance "Item" an Attack gets. Same field name, different
  //     meaning, and overwriting it would likely break the AC calculation
  //     while still looking right on screen.
  // Record types that hang off the item (or off each other) and are NOT
  // attacks. Each captured from a record Roll20 itself wrote:
  //
  //   Armor Class, Defense   children of the Item      (Breastplate)
  //   Attunement             child of the Item         (Amulet of Health)
  //   Ability Score          child of the ATTUNEMENT    (Amulet of Health)
  //
  // That last one is the shape a flat rule would have missed: the amulet's
  // Constitution effect hangs off the attunement, not the item, which is
  // exactly right — no attunement, no effect.
  //
  // None of these carry `sourceID` or `cascades`, unlike an Attack, and none
  // has its `source` overwritten: an Armor Class record's "Armor" is
  // meaningful, and the rest simply have "".
  var CHILD_TYPES = { "Armor Class": true, "Defense": true, "Attunement": true, "Ability Score": true };

  // The sheet names these after the item, with a per-type suffix:
  // "Breastplate AC", "Amulet of Health Attunement", and — using the ability
  // rather than the type — "Amulet of Health Constitution".
  // The sheet names an ability's records after the item AND the ability, with
  // the item suffix stripped: an Action called "Dark Blessing (Acheron
  // Longsword)" yields "Acheron Longsword Dark Blessing Action".
  function stripItemSuffix(name, itemName) {
    var suffix = " (" + itemName + ")";
    return name && itemName && name.slice(-suffix.length) === suffix
      ? name.slice(0, -suffix.length)
      : (name || "");
  }

  function childRecordName(type, itemName, p) {
    var base = itemName || "";
    if (type === "Armor Class") return (base + " AC").trim();
    if (type === "Ability Score") return (base + " " + (p.ability || type)).trim();
    return (base + " " + type).trim();
  }

  function buildAttacks(datarecords, itemId, itemName, pageId) {
    var all = allPayloads(datarecords);
    if (!all) return null;

    var records = {}, attackIds = [], unwritten = 0;
    // parentId -> [childId]. Collected as we go and applied at the end, so
    // one rule serves attacks, damage and the nested item children alike.
    var childrenOf = {};
    function addChild(parentId, childId) {
      (childrenOf[parentId] = childrenOf[parentId] || []).push(childId);
    }
    // The most recent Attack (Damage attaches to it) and the most recent
    // Attunement (an Ability Score attaches to that when there is one).
    var attackId = null, attunementId = null, actionId = null;
    // Which Resource records each Action consumes. The sheet records this as
    // relations:{<resourceId>:"uses"} on the Action, and the payload does not
    // carry it — it has to be generated once the new ids exist.
    var usesOf = {};

    function structural(rec, p) {
      rec._id = PT.uid();
      rec._enabled = true;
      if (rec.label === undefined) rec.label = "";
      if (!rec.shortID) rec.shortID = shortId();
      if (!rec.createdTime) rec.createdTime = Date.now();
      if (pageId && !rec.compendiumPageID) rec.compendiumPageID = pageId;
      return rec;
    }

    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.type === "Item") continue;               // the caller writes this

      if (p.type === "Attack") {
        var a = structural(JSON.parse(JSON.stringify(p)), p);
        a.parentID = itemId;
        a.sourceID = itemId;
        a.source = "Item";
        a.cascades = equipCascade(itemId);
        if (!a.actionType) a.actionType = "Action";
        if (!a.name) a.name = "Attack";
        if (!a.recordName) a.recordName = a.name;
        records[a._id] = a;
        addChild(itemId, a._id);
        attackIds.push(a._id);
        attackId = a._id;

      } else if (p.type === "Damage") {
        // Damage is the one type paired by ORDER — it belongs to the Attack
        // it follows. With no preceding Attack there is nowhere to put it.
        if (!attackId) { unwritten++; continue; }
        var d = structural(JSON.parse(JSON.stringify(p)), p);
        d.parentID = attackId;
        d.sourceID = itemId;                         // the ITEM, not the attack
        d.source = "Item";
        d.cascades = equipCascade(itemId);
        if (d._diceCount === undefined) d._diceCount = 1;
        if (d.critDiceSize === undefined) d.critDiceSize = "";
        if (d.overrideCrit === undefined) d.overrideCrit = false;
        if (!d.name) d.name = (records[attackId].name || "Attack") + " Damage";
        if (!d.recordName) d.recordName = d.name;
        records[d._id] = d;
        addChild(attackId, d._id);

      } else if (p.type === "Action") {
        // Abilities hang off the ATTUNEMENT (like Ability Score), while
        // attacks hang off the item — a split worth stating, since both were
        // in the same payload.
        var act = structural(JSON.parse(JSON.stringify(p)), p);
        act.parentID = attunementId || itemId;
        act.sourceID = itemId;
        act.source = "Item";
        if (!act.actionType) act.actionType = "Action";
        if (!act.name) act.name = (itemName || "") + " Action";
        if (!act.recordName) {
          act.recordName = ((itemName || "") + " " + stripItemSuffix(act.name, itemName) +
            " " + act.actionType).replace(/\s+/g, " ").trim();
        }
        records[act._id] = act;
        addChild(act.parentID, act._id);
        actionId = act._id;
        usesOf[act._id] = [];

      } else if (p.type === "Resource" || p.type === "Healing") {
        // Both belong to the Action they follow — this pair IS grouped by
        // order, like Damage under an Attack. With no Action in front of
        // them there is nowhere sensible to put them.
        if (!actionId) { unwritten++; continue; }
        var r = structural(JSON.parse(JSON.stringify(p)), p);
        r.parentID = actionId;
        if (r.source === undefined) r.source = "";
        var actBase = stripItemSuffix(records[actionId].name, itemName);
        if (p.type === "Resource") {
          if (!r.name) r.name = actBase;
          if (!r.recordName) {
            r.recordName = ((itemName || "") + " " + r.name + " Resource").replace(/\s+/g, " ").trim();
          }
          usesOf[actionId].push(r._id);
        } else {
          // The sheet stores the dice count with a leading underscore; the
          // payload sends it without one.
          if (r.diceCount !== undefined && r._diceCount === undefined) {
            r._diceCount = r.diceCount;
            delete r.diceCount;
          }
          if (r._diceCount === undefined) r._diceCount = 1;
          if (r.critDiceSize === undefined) r.critDiceSize = "";
          if (r.overrideCrit === undefined) r.overrideCrit = false;
          if (!r.name) {
            r.name = ((itemName || "") + " " + actBase + (r.isTemp ? " Temp HP" : " Healing"))
              .replace(/\s+/g, " ").trim();
          }
          if (!r.recordName) r.recordName = r.name;
        }
        records[r._id] = r;
        addChild(actionId, r._id);

      } else if (CHILD_TYPES[p.type]) {
        // Attached by TYPE, not position: real armour carries these two in
        // either order ([Armor Class, Defense] and [Defense, Armor Class]),
        // so pairing by position would be wrong half the time.
        var c = structural(JSON.parse(JSON.stringify(p)), p);
        c.parentID = p.type === "Ability Score" ? (attunementId || itemId) : itemId;
        if (!c.name) c.name = childRecordName(p.type, itemName, p);
        if (!c.recordName) c.recordName = c.name;
        // Every observed sheet record has a source field; only Armor Class
        // has a meaningful value, so fill in "" rather than inventing one.
        if (c.source === undefined) c.source = "";
        if (p.type === "Armor Class" && c.defaultAbility === undefined) c.defaultAbility = false;
        // Left alone deliberately: sourceID and cascades, which none of these
        // carry on the sheet.
        if (p.type === "Attunement" && c._attuned === undefined) {
          // NOT auto-attuned. The observed record read true, but that is a
          // character's own choice and attunement slots are limited to three
          // — silently spending one would be worse than the player ticking a
          // box. Left false, so the item's effects switch on when they attune.
          c._attuned = false;
        }
        records[c._id] = c;
        addChild(c.parentID, c._id);
        if (p.type === "Attunement") attunementId = c._id;

      } else {
        unwritten++;
      }
    }

    // An Action declares the Resource it spends. Generated here rather than
    // copied, because the ids are ours.
    Object.keys(usesOf).forEach(function (id) {
      if (!usesOf[id].length) return;
      var rel = records[id].relations && typeof records[id].relations === "object"
        ? records[id].relations : {};
      usesOf[id].forEach(function (resId) { rel[resId] = "uses"; });
      records[id].relations = rel;
    });

    // childIDs is a STRING holding a JSON array; apply it once, everywhere.
    Object.keys(records).forEach(function (id) {
      records[id].childIDs = JSON.stringify(childrenOf[id] || []);
    });

    return {
      records: records,
      attackIds: attackIds,
      childIds: childrenOf[itemId] || [],   // the item's own direct children
      unwritten: unwritten
    };
  }

  // childIDs is a STRING holding a JSON array on the sheet. The compendium
  // payload is documented as the same shape, but accept a real array too
  // rather than lose a graph to a format difference.
  function childIdsOf(rec) {
    var raw = rec.childIDs;
    if (Array.isArray(raw)) return raw.slice();
    if (typeof raw !== "string" || !raw) return [];
    var list = PT.tryJson(raw);
    return Array.isArray(list) ? list : null;   // null = malformed, bail out
  }

  // Returns {records: {newId -> record}, rootId} or null to fall back.
  function buildGraph(datarecords, parentId, qty) {
    var payloads = payloadsOf(datarecords);
    if (!payloads) return null;

    var byOldId = {};
    payloads.forEach(function (p) { byOldId[p._id || p.id] = p; });

    // A root is a record whose parent is outside this payload — on the
    // compendium side that is the page itself. Exactly one is expected, and
    // it must be the Item; anything else means we are reading a shape we
    // don't understand.
    var roots = payloads.filter(function (p) {
      var parent = p.parentID;
      return !parent || !byOldId[parent];
    });
    if (roots.length !== 1 || roots[0].type !== "Item") return null;

    var newIdOf = {};
    payloads.forEach(function (p) { newIdOf[p._id || p.id] = PT.uid(); });

    var records = {};
    for (var i = 0; i < payloads.length; i++) {
      var src = payloads[i];
      var oldId = src._id || src.id;
      var rec = JSON.parse(JSON.stringify(src));
      delete rec.id;                       // the sheet keys on _id alone
      rec._id = newIdOf[oldId];
      rec.parentID = src === roots[0] ? parentId : newIdOf[src.parentID];

      var kids = childIdsOf(src);
      if (kids === null) return null;
      // A child link pointing outside the payload cannot be honoured — the
      // record it names is not coming with us.
      var mapped = [];
      for (var k = 0; k < kids.length; k++) {
        var kid = kids[k];
        if (typeof kid !== "string") return null;
        if (!newIdOf[kid]) return null;
        mapped.push(newIdOf[kid]);
      }
      rec.childIDs = JSON.stringify(mapped);

      // sourceID and cascades reference the ITEM by id — on a sheet-sourced
      // graph those still name the character it came off, and left alone they
      // would point at a record that isn't here. cascades is what makes an
      // attack follow the item's equipped state, so a stale key there is the
      // difference between a working weapon and an inert one.
      if (rec.sourceID && newIdOf[rec.sourceID]) rec.sourceID = newIdOf[rec.sourceID];
      if (rec.cascades && typeof rec.cascades === "object") {
        var remapped = {};
        Object.keys(rec.cascades).forEach(function (key) {
          remapped[newIdOf[key] || key] = rec.cascades[key];
        });
        rec.cascades = remapped;
      }
      records[rec._id] = rec;
    }

    var rootRec = records[newIdOf[roots[0]._id || roots[0].id]];
    rootRec.quantity = qty;
    if (!rootRec.createdTime) rootRec.createdTime = Date.now();
    return { records: records, rootId: rootRec._id };
  }

  // Console diagnostic: PT.sheets.explainGraph(item) — says whether a stored
  // item's compendium payload will rebuild as a full weapon graph, and if not,
  // which check rejected it. The graph shape is taken from the drop-time
  // parser and the S2/S3 findings rather than from a captured sample, so this
  // is how you confirm it against a real compendium item in a test game
  // BEFORE trusting a claim onto a character you care about.
  // The structure of a record without its contents: enough to see how a graph
  // is wired and which fields exist, small enough to paste into a bug report,
  // and no field VALUES beyond type and name (a dump of someone's character
  // shouldn't need redacting before they can send it).
  function shapeOf(rec) {
    return {
      _id: rec._id || rec.id,
      type: rec.type,
      name: rec.name,
      parentID: rec.parentID,
      childIDs: rec.childIDs,
      keys: Object.keys(rec).sort().join(",")
    };
  }

  PT.sheets.explainGraph = function (item) {
    var dr = item && item.datarecords;
    if (!dr) return { willWrite: "plain", why: "this item has no compendium payload (manual, name-only, or obscured)" };

    var all = allPayloads(dr);
    if (!all) {
      var raw = PT.tryJson(dr);
      return {
        willWrite: "plain",
        why: !Array.isArray(raw)
          ? "the payload isn't a JSON array"
          : "a record was unparseable, had no string type, or there were more than " + MAX_GRAPH_RECORDS,
        rawCount: Array.isArray(raw) ? raw.length : null,
        rawKeys: Array.isArray(raw) && raw[0] && typeof raw[0] === "object" ? Object.keys(raw[0]).join(",") : null,
        rawFirst: Array.isArray(raw) ? JSON.stringify(raw[0]).slice(0, 600) : String(dr).slice(0, 600)
      };
    }

    var built = buildGraph(dr, "diagnostic-parent", 1);
    var itemRec = compendiumItemPayload(dr);
    return {
      willWrite: built ? "graph" : itemRec ? "compendium item record" : "plain",
      records: all.length,
      types: all.map(function (p) { return p.type; }),
      shape: all.map(shapeOf),
      unwritten: unwrittenCount(dr),
      // The non-Item records in full. The compendium payload carries no links
      // between its records, so what an Attack or Damage record must look
      // like — and what attaches it to its item — has to be read off real
      // data before any of it can be written to a character.
      others: all.filter(function (p) { return p.type !== "Item"; })
        .map(function (p) { return JSON.stringify(p).slice(0, 900); }),
      why: built
        ? "sheet-sourced records with ids: rebuilt in full"
        : itemRec
          ? "compendium records carry no ids or links, so the Item record is used as-is and the rest are not written yet"
          : "no Item record among the payloads"
    };
  };

  // The chain of record types from here up to the sheet root, e.g.
  // "Attack < Item < Inventory < (root)". Where a record SITS is half of what
  // makes the sheet treat it as an attack, and a parentID alone doesn't show
  // it. Bounded, so a cycle in the data can't hang the diagnostic.
  function ancestry(ints, id) {
    var chain = [], seen = {}, cur = ints[id], depth = 0;
    while (cur && depth++ < 12) {
      chain.push(cur.type || "?");
      if (seen[cur._id]) { chain.push("(cycle)"); break; }
      seen[cur._id] = true;
      cur = ints[cur.parentID];
    }
    chain.push("(root)");
    return chain.join(" < ");
  }

  // ---- probes for "let the sheet build the item" ----------------------------
  // Two experiments behind the open question in docs/future-ideas.md: can we
  // hand the sheet a compendium page id and let it do the work, instead of
  // reimplementing every record type by hand?

  // ROUTE 1. Does the open character sheet register a jQuery UI drop target?
  // Roll20's own compendium-to-sheet drop does the whole job already, and
  // drops.js proves that machinery can be driven (it enables and disables
  // Roll20's canvas zone on every drag). This just reports what drop targets
  // exist, so we know whether there is anything to aim at.
  //
  // Read-only, and safe to run any time.
  PT.sheets.probeDropTargets = function () {
    var out = { version: PT.VERSION, droppables: [] };
    if (!window.$ || !$.ui || !$.ui.ddmanager) {
      out.error = "jQuery UI's ddmanager isn't on this page, so nothing is registered as a drop target";
      console.log("[PartyTools] probeDropTargets:\n" + JSON.stringify(out, null, 2));
      return out;
    }
    var reg = $.ui.ddmanager.droppables || {};
    Object.keys(reg).forEach(function (scope) {
      (reg[scope] || []).forEach(function (d) {
        var el = d && d.element && d.element[0];
        if (!el) return;
        var classes = typeof el.className === "string" ? el.className : "";
        out.droppables.push({
          scope: scope,
          tag: el.tagName,
          id: el.id || null,
          classes: classes.slice(0, 140) || null,
          // A zero-sized element is registered but not on screen — it can't
          // be dropped onto as things stand.
          visible: !!(el.offsetWidth || el.offsetHeight),
          insideCharacterSheet: !!(el.closest && el.closest(
            ".characterdialog, .charsheet, .character-sheet, [class*='haracter']"))
        });
      });
    });
    out.note = "Open a character sheet BEFORE running this, then look for a droppable with insideCharacterSheet true. That is the target a synthesised drop would aim at.";
    console.log("[PartyTools] probeDropTargets:\n" + JSON.stringify(out, null, 2));
    return out;
  };

  // ROUTE 1, step 2. A probe of the sheet's OWN compendium drop target.
  //
  // probeDropTargets found `charsheet-compendium-drop-target` registered on an
  // open character sheet — Roll20's own landing zone for a compendium drag,
  // i.e. the code that builds a weapon properly, attacks and all. This reads
  // that droppable's configuration and the source of its handlers, so we can
  // see what a synthesised drop would have to supply.
  //
  // Read-only: it inspects the handler, it does not fire it.
  PT.sheets.probeCompendiumDrop = function () {
    var out = { version: PT.VERSION, targets: [] };
    if (!window.$ || !$.ui || !$.ui.ddmanager) {
      out.error = "jQuery UI's ddmanager isn't on this page";
      return logDrop(out);
    }
    var reg = $.ui.ddmanager.droppables || {};
    Object.keys(reg).forEach(function (scope) {
      (reg[scope] || []).forEach(function (d) {
        var el = d && d.element && d.element[0];
        if (!el) return;
        var classes = typeof el.className === "string" ? el.className : "";
        if (classes.indexOf("compendium-drop-target") === -1) return;

        var opts = d.options || {};
        var chain = [];
        var node = el;
        for (var i = 0; node && i < 8; i++) {
          chain.push(node.tagName + (node.id ? "#" + node.id : "") +
            (typeof node.className === "string" && node.className
              ? "." + node.className.trim().split(/\s+/).slice(0, 3).join(".")
              : ""));
          node = node.parentElement;
        }
        out.targets.push({
          scope: scope,
          classes: classes,
          attachedToDocument: !!(el.ownerDocument && el.ownerDocument.contains(el)),
          visible: !!(el.offsetWidth || el.offsetHeight),
          // Which character this target belongs to, if the sheet says so.
          nearbyCharacterId: (function () {
            var dlg = el.closest && el.closest("[data-characterid], .characterdialog");
            return dlg ? (dlg.getAttribute("data-characterid") || dlg.id || null) : null;
          })(),
          ancestry: chain.join(" < "),
          optionKeys: Object.keys(opts).sort().join(","),
          scopeOption: opts.scope || null,
          tolerance: opts.tolerance || null,
          // The interesting part: what it accepts, and what it does. Reading
          // these is how we learn what a synthesised drag must look like.
          accept: typeof opts.accept === "function" ? String(opts.accept).slice(0, 800) : (opts.accept || null),
          dropHandler: typeof opts.drop === "function" ? String(opts.drop).slice(0, 2500) : null,
          overHandler: typeof opts.over === "function" ? String(opts.over).slice(0, 600) : null
        });
      });
    });
    if (!out.targets.length) {
      out.error = "no compendium drop target registered — open a character sheet first, and leave it open";
    }
    return logDrop(out);
  };

  function logDrop(o) {
    console.log("[PartyTools] probeCompendiumDrop:\n" + JSON.stringify(o, null, 2));
    return o;
  }

  // ROUTE 1, step 3. Find the relay behind the drop target.
  //
  // The drop handler, read off a live sheet, turned out NOT to read the
  // dragged element at all:
  //
  //   drop(S) { ... window.wantsToReceiveDrop(this, S, () => {
  //     const {pageName, categoryName, expansionId} = C.compendiumDropData;
  //     C.relay.dropOver({ coordinates: {...}, dropData: {pageName, categoryName, expansionId} });
  //   }) }
  //
  // So synthesising a drag was never going to work: the payload comes from
  // the component's own `compendiumDropData`, and the real entry point is
  // `relay.dropOver`, which takes exactly the three fields a drop already
  // stores. This probe looks for that relay — on the element's framework
  // internals and up its parent chain — and reports where it found one.
  //
  // Read-only. It locates dropOver; it does not call it.
  PT.sheets.probeDropRelay = function () {
    var out = {
      version: PT.VERSION,
      wantsToReceiveDrop: typeof window.wantsToReceiveDrop,
      found: []
    };
    var el = document.querySelector(".charsheet-compendium-drop-target");
    if (!el) {
      out.error = "no .charsheet-compendium-drop-target in the DOM — open a character sheet and leave it open";
      return logRelay(out);
    }
    var roots = [];

    // EVERY own property, not a filtered subset. The first version of this
    // probe only looked for keys starting with _ or $, which excluded
    // jQuery's expando ("jQuery19104...") — precisely where a Backbone view
    // or a droppable instance hides.
    out.elementInternals = Object.getOwnPropertyNames(el).slice(0, 40);
    // Anything hung off an own property of the element is a candidate root,
    // whatever it is called.
    Object.getOwnPropertyNames(el).forEach(function (k) {
      var v;
      try { v = el[k]; } catch (e) { return; }
      if (v && typeof v === "object" && !(v instanceof Node)) {
        roots.push({ path: "el." + k, obj: v });
      }
    });
    try {
      if (window.$ && $(el).data) {
        var jq = $(el).data() || {};
        out.jqueryData = Object.keys(jq);
        Object.keys(jq).forEach(function (k) {
          if (jq[k] && typeof jq[k] === "object") roots.push({ path: "$(el).data()." + k, obj: jq[k] });
        });
      }
    } catch (e) { out.jqueryDataError = e.message; }

    // The global the handler calls. Its source may name the relay, and it is
    // reachable from a content script, unlike the component itself.
    if (typeof window.wantsToReceiveDrop === "function") {
      out.wantsToReceiveDropSource = String(window.wantsToReceiveDrop).slice(0, 1200);
    }

    // Framework internals on the element and each ancestor. Vue puts
    // __vueParentComponent / __vnode on the node; older builds used __vue__.
    var node = el, depth = 0;
    while (node && depth++ < 10) {
      ["__vueParentComponent", "__vue__", "__vnode", "_reactRootContainer"].forEach(function (key) {
        if (node[key]) roots.push({ path: "<" + (node.className || node.tagName) + ">." + key, obj: node[key] });
      });
      // jQuery data on ancestors too — the droppable is registered on the
      // target, but the VIEW that owns it may sit further up.
      try {
        if (window.$ && node.nodeType === 1) {
          var d = $(node).data() || {};
          Object.keys(d).forEach(function (k) {
            if (d[k] && typeof d[k] === "object") {
              roots.push({ path: "$(" + (node.id || node.className || node.tagName) + ").data()." + k, obj: d[k] });
            }
          });
        }
      } catch (e) { /* some nodes refuse; not worth failing over */ }
      node = node.parentElement;
    }
    out.rootsFound = roots.map(function (r) { return r.path; }).slice(0, 40);
    // The droppable instances themselves: their `options.drop` closes over
    // the component, and while a closure can't be opened, the instance may
    // carry other references worth walking.
    try {
      if (window.$ && $.ui && $.ui.ddmanager) {
        var reg = $.ui.ddmanager.droppables || {};
        Object.keys(reg).forEach(function (scope) {
          (reg[scope] || []).forEach(function (d) {
            var dEl = d && d.element && d.element[0];
            if (dEl && dEl === el) roots.push({ path: "ddmanager." + scope + "[droppable]", obj: d });
          });
        });
      }
    } catch (e) { /* covered by the error path below */ }

    if (!roots.length) {
      out.error = "nothing hung off the drop target or its ancestors — the component isn't reachable from the DOM";
      return logRelay(out);
    }

    // Bounded search for the things the handler uses. Capped hard: this runs
    // on a live VTT page and must not walk the whole object graph.
    var seen = new Set(), visited = 0, MAX = 6000;
    function walk(obj, path, depth) {
      if (!obj || visited > MAX || depth > 5) return;
      if (typeof obj !== "object" && typeof obj !== "function") return;
      if (seen.has(obj)) return;
      seen.add(obj);
      visited++;
      var keys;
      try { keys = Object.keys(obj); } catch (e) { return; }
      for (var i = 0; i < keys.length && visited <= MAX; i++) {
        var k = keys[i], v;
        try { v = obj[k]; } catch (e) { continue; }
        if (v && typeof v === "object" && typeof v.dropOver === "function") {
          out.found.push({ what: "relay.dropOver", at: path + "." + k, relayKeys: Object.keys(v).slice(0, 30).join(",") });
        }
        if (k === "compendiumDropData" && v && typeof v === "object") {
          out.found.push({ what: "compendiumDropData", at: path + "." + k, keys: Object.keys(v).join(","), value: JSON.stringify(v).slice(0, 300) });
        }
        if (k === "activeDrop") {
          out.found.push({ what: "activeDrop", at: path + "." + k, value: String(v) });
        }
        if (v && (v instanceof Node || v instanceof Window)) continue;  // never walk the DOM
        walk(v, path + "." + k, depth + 1);
      }
    }
    roots.forEach(function (r) { walk(r.obj, r.path, 0); });
    out.objectsVisited = visited;
    out.note = out.found.length
      ? "A relay with dropOver is reachable. Next: call it with {coordinates:{left,top}, dropData:{pageName, categoryName, expansionId}} — the same three fields drops.js already stores per item."
      : "Nothing found within the search bounds. The component may keep the relay in a closure, which would rule this route out.";
    return logRelay(out);
  };

  function logRelay(o) {
    console.log("[PartyTools] probeDropRelay:\n" + JSON.stringify(o, null, 2));
    return o;
  }

  // ROUTE 2. Does the sheet enrich a record that carries only a
  // compendiumPageID? Writes a deliberately BARE item — a name, a page id,
  // and nothing else, no weaponData, no attacks — then waits and re-reads to
  // see whether the sheet filled anything in or created records of its own.
  //
  // *** THIS WRITES TO A CHARACTER SHEET. Use a throwaway character. ***
  // It removes the probe item afterwards unless you pass {cleanup: false},
  // and reports what it saw either way.
  //
  // itemOrPageId: a compendium page id, or the name of an item in a bag to
  // take the page id from (drops have stored one since v0.9.8).
  PT.sheets.probeEnrich = function (characterName, itemOrPageId, opts) {
    opts = opts || {};
    var waitMs = opts.waitMs || 8000;
    var character = null;
    try {
      character = Campaign.characters.models.filter(function (c) {
        return (c.get("name") || "") === characterName;
      })[0] || null;
    } catch (e) {}
    if (!character) return Promise.resolve(logProbe({ error: "no character named " + JSON.stringify(characterName) }));

    return resolvePageId(itemOrPageId).then(function (res) {
      if (res.error) return logProbe(res);
      var pageId = res.pageId;

      return prepareWrite(character).then(function (p) {
        if (!p.ok) return logProbe({ error: p.err });
        var next = JSON.parse(JSON.stringify(p.doc));
        var ints = next.integrants && next.integrants.integrants;
        if (!ints) return logProbe({ error: "store has no integrants" });

        var probeId = PT.uid();
        var before = Object.keys(ints).length;
        ints[probeId] = {
          _enabled: true,
          _id: probeId,
          childIDs: "[]",
          compendiumPageID: pageId,
          createdTime: Date.now(),
          name: opts.name || "PT enrichment probe",
          parentID: "",
          quantity: 1,
          recordName: opts.name || "PT enrichment probe",
          shortID: shortId(),
          type: "Item"
        };
        var wroteKeys = Object.keys(ints[probeId]).sort().join(",");

        return writeStore(character, p.storeAttr, next, function (doc) {
          var bi = doc.integrants && doc.integrants.integrants;
          return !!(bi && bi[probeId]);
        }).then(function (wr) {
          if (!wr.ok) return logProbe({ error: "the probe item could not be written: " + wr.err });
          return PT.delay(waitMs).then(function () {
            return prepareRead(character).then(function (after) {
              if (!after.ok) return logProbe({ error: "could not re-read: " + after.err });
              var ai = (after.doc.integrants && after.doc.integrants.integrants) || {};
              var rec = ai[probeId];
              var out = {
                version: PT.VERSION,
                pageId: pageId,
                waitedMs: waitMs,
                wroteKeys: wroteKeys,
                stillThere: !!rec,
                nowKeys: rec ? Object.keys(rec).sort().join(",") : null,
                // The question in one field: did the sheet add anything we
                // did not write?
                fieldsAddedBySheet: rec
                  ? Object.keys(rec).filter(function (k) { return wroteKeys.split(",").indexOf(k) === -1; })
                  : [],
                recordsAddedBySheet: Object.keys(ai).filter(function (k) {
                  return ai[k] && (ai[k].parentID === probeId || ai[k].sourceID === probeId);
                }).map(function (k) { return { type: ai[k].type, name: ai[k].name }; }),
                integrantsBefore: before,
                integrantsAfter: Object.keys(ai).length,
                record: rec ? JSON.stringify(rec).slice(0, 1500) : null
              };
              out.verdict = (out.fieldsAddedBySheet.length || out.recordsAddedBySheet.length)
                ? "THE SHEET ENRICHED IT — a page id may be enough, see docs/future-ideas.md"
                : "no enrichment: the sheet left the bare record exactly as written";
              if (opts.cleanup === false) {
                out.cleanup = "left on the sheet by request; its id is " + probeId;
                return logProbe(out);
              }
              return PT.sheets.takeItem(character, probeId, 1).then(function (rm) {
                out.cleanup = rm.ok ? "probe item removed" : "COULD NOT REMOVE, delete it by hand: " + rm.err;
                return logProbe(out);
              });
            });
          });
        });
      });
    });
  };

  function logProbe(o) {
    console.log("[PartyTools] probeEnrich:\n" + JSON.stringify(o, null, 2));
    return o;
  }

  // A page id straight through, or looked up from a bag item by name.
  function resolvePageId(itemOrPageId) {
    var arg = String(itemOrPageId || "").trim();
    if (!arg) return Promise.resolve({ error: "pass a compendium page id, or the name of an item in a bag" });
    if (/^[a-f0-9]{16,}$/i.test(arg)) return Promise.resolve({ pageId: arg });
    if (!PT.store || !PT.store.snapshot) {
      return Promise.resolve({ error: "storage isn't ready, so a name can't be looked up — pass a page id" });
    }
    return PT.store.snapshot(PT.envInfo).then(function (snap) {
      var match = null;
      ((snap && snap.bags) || []).forEach(function (b) {
        (b.doc.items || []).forEach(function (it) {
          if (!match && (it.name || "").toLowerCase().indexOf(arg.toLowerCase()) !== -1) match = it;
        });
      });
      if (!match) return { error: "no item matching " + JSON.stringify(arg) + " in any bag you can see" };
      if (match.compendiumPageID) return { pageId: match.compendiumPageID };
      // Dropped before v0.9.8, so no page id was stored — but the compendium
      // reference was, and re-resolving it is a same-origin lookup we already
      // do on every drop. Cheaper than making someone re-drop the item.
      if (PT.drops && PT.drops.resolve && match.pagename) {
        return PT.drops.resolve({ pagename: match.pagename, expansionId: match.expansionId })
          .then(function (fresh) {
            return fresh && fresh.compendiumPageID
              ? { pageId: fresh.compendiumPageID, note: "page id fetched live; this item predates v0.9.8" }
              : { error: "could not resolve a page id for " + JSON.stringify(match.name) + " from the compendium" };
          });
      }
      return { error: JSON.stringify(match.name) + " has no compendium reference at all (added by hand, or a name-only drop), so there is no page id to find" };
    });
  }

  // Console diagnostic: PT.sheets.survey()
  //
  // Every item in every bag you can see, with the record types its compendium
  // payload carries and whether claiming it would drop anything. One command
  // instead of a payloadDump per item type, and it answers the standing
  // question — "does armour work?" — for armour and everything else at once.
  //
  // What to read:
  //   types: ["Item"]                     -> nothing to lose; claiming is complete
  //   types: ["Item","Attack","Damage"]   -> a weapon; handled since v0.9.6
  //   unwritten: [...]                    -> types we have no rule for YET.
  //                                          This is the list of work.
  //
  // Read-only, and compact by design: types and counts, no record contents.
  PT.sheets.survey = function () {
    if (!PT.store || !PT.store.snapshot) {
      return Promise.resolve({ error: "storage isn't ready on this client yet" });
    }
    return PT.store.snapshot(PT.envInfo).then(function (snap) {
      var out = { version: PT.VERSION, items: [], byShape: {}, needsWork: [] };
      ((snap && snap.bags) || []).forEach(function (b) {
        (b.doc.items || []).forEach(function (it) {
          var all = it.datarecords ? allPayloads(it.datarecords) : null;
          var types = all ? all.map(function (p) { return p.type; }) : [];
          var left = it.datarecords ? unwrittenSummary(it.datarecords) : { count: 0, types: [] };
          var row = {
            bag: b.doc.name,
            name: it.name,
            types: types.length ? types : (it.datarecords ? "unreadable payload" : "no payload (manual or name-only)"),
            unwritten: left.types
          };
          out.items.push(row);
          // Group by payload shape: items sharing a shape share a fate, so
          // this collapses a big inventory into the handful of cases that
          // actually differ.
          var shape = types.length ? types.join("+") : "none";
          out.byShape[shape] = (out.byShape[shape] || 0) + 1;
          if (left.count) out.needsWork.push(it.name + " -> " + left.types.join(","));
        });
      });
      out.verdict = out.needsWork.length
        ? out.needsWork.length + " item(s) carry record types with no rule yet — these are the ones that would arrive incomplete"
        : "every item in your bags claims complete: nothing in their payloads goes unwritten";
      return out;
    }).then(function (r) {
      console.log("[PartyTools] survey:\n" + JSON.stringify(r, null, 2));
      return r;
    });
  };

  // Console diagnostic: PT.sheets.payloadDump("Longsword")
  //
  // The other side of weaponDump: what the COMPENDIUM gives us for an item
  // sitting in a bag, every record in full and in order. weaponDump shows the
  // structure a weapon needs on the sheet; this shows the content we have to
  // pour into it. Order matters and is part of what's being read here — it is
  // the only thing that could pair a Damage record with its Attack, since the
  // payload carries no links.
  //
  // Read-only.
  PT.sheets.payloadDump = function (itemName) {
    if (!PT.store || !PT.store.snapshot) {
      return Promise.resolve({ error: "storage isn't ready on this client yet" });
    }
    var needle = String(itemName || "").toLowerCase();
    return PT.store.snapshot(PT.envInfo).then(function (snap) {
      var out = { version: PT.VERSION, item: itemName, matches: [] };
      ((snap && snap.bags) || []).forEach(function (b) {
        (b.doc.items || []).forEach(function (it) {
          if ((it.name || "").toLowerCase().indexOf(needle) === -1) return;
          var all = allPayloads(it.datarecords);
          out.matches.push({
            bag: b.doc.name,
            name: it.name,
            hasPayload: !!it.datarecords,
            count: all ? all.length : 0,
            types: all ? all.map(function (p) { return p.type; }) : null,
            // In payload order, deliberately: see above.
            records: all
              ? all.map(function (p) { return JSON.stringify(p).slice(0, 1800); })
              : String(it.datarecords || "").slice(0, 600)
          });
        });
      });
      if (!out.matches.length) out.error = "no item matching " + JSON.stringify(itemName) + " in any bag you can see";
      return out;
    }).then(function (r) {
      console.log("[PartyTools] payloadDump:\n" + JSON.stringify(r, null, 2));
      return r;
    });
  };

  // Console diagnostic: PT.sheets.weaponDump("Character Name", "Longsword")
  //
  // Everything about ONE item, in full, and nothing else. A whole sheet is
  // far too big to paste — a real character's Item/Attack/Damage records ran
  // past the console's truncation limit — and all that's needed to learn how
  // the sheet wires an attack is a single weapon it built itself.
  //
  // Dumps three things per matching item:
  //   subtree  - the Item and every record beneath it, values included
  //   parent   - what it hangs off, since a top-level weapon was observed
  //              with parentID "" rather than a container id
  //   related  - records elsewhere on the sheet whose name starts with the
  //              item's, which is how a weapon's extra attacks show up
  //              ("Sunsword (Two-handed)") when the item's own childIDs
  //              doesn't list them
  //
  // Read-only.
  PT.sheets.weaponDump = function (characterName, itemName) {
    var character = null;
    try {
      character = Campaign.characters.models.filter(function (c) {
        return (c.get("name") || "") === characterName;
      })[0] || null;
    } catch (e) {}
    if (!character) {
      var names = [];
      try { names = Campaign.characters.models.map(function (c) { return c.get("name"); }); } catch (e) {}
      var miss = { error: "no character named " + JSON.stringify(characterName), knownNames: names };
      console.log("[PartyTools] weaponDump:\n" + JSON.stringify(miss, null, 2));
      return Promise.resolve(miss);
    }
    return prepareRead(character).then(function (p) {
      if (!p.ok) return { error: p.err };
      var ints = (p.doc.integrants && p.doc.integrants.integrants) || {};
      var needle = String(itemName || "").toLowerCase();
      var matches = Object.keys(ints).filter(function (k) {
        return ints[k].type === "Item" && (ints[k].name || "").toLowerCase().indexOf(needle) !== -1;
      });

      var out = { version: PT.VERSION, character: characterName, item: itemName, found: matches.length, items: [] };
      if (!matches.length) {
        // Guessing an item's exact name costs a round trip. Hand back what
        // this sheet actually has instead.
        out.itemsOnSheet = Object.keys(ints)
          .filter(function (k) { return ints[k].type === "Item" && (ints[k].name || "").trim(); })
          .map(function (k) { return ints[k].name; })
          .sort();
      }
      matches.slice(0, 4).forEach(function (id) {
        var rec = ints[id];
        var ids = subtreeIds(ints, id) || [id];
        var inSubtree = {};
        ids.forEach(function (i) { inSubtree[i] = true; });
        var parent = ints[rec.parentID];
        out.items.push({
          id: id,
          name: rec.name,
          parentID: rec.parentID,
          parent: parent
            ? { id: rec.parentID, type: parent.type, name: parent.name }
            : "(no parent record — top level, parentID " + JSON.stringify(rec.parentID) + ")",
          ancestry: ancestry(ints, id),
          subtree: ids.map(function (i) {
            return { _id: i, type: ints[i].type, name: ints[i].name, record: JSON.stringify(ints[i]).slice(0, 1800) };
          }),
          related: Object.keys(ints).filter(function (k) {
            if (inSubtree[k]) return false;
            var n = (ints[k].name || "").toLowerCase();
            return n.indexOf((rec.name || "").toLowerCase()) === 0;
          }).slice(0, 12).map(function (k) {
            return {
              _id: k, type: ints[k].type, name: ints[k].name,
              ancestry: ancestry(ints, k),
              record: JSON.stringify(ints[k]).slice(0, 1800)
            };
          })
        });
      });
      return out;
    }).then(function (r) {
      console.log("[PartyTools] weaponDump:\n" + JSON.stringify(r, null, 2));
      return r;
    });
  };

  // Console diagnostic: PT.sheets.report("Character Name", {full: true})
  //
  // Dumps, in one paste: every bag item with its explainGraph verdict (which
  // includes the compendium payload's unwritten Attack/Damage records in
  // full), and every Item/Attack/Damage record on a named character with its
  // ancestry and field names.
  //
  // With {full: true} it also includes each sheet record's VALUES, capped.
  // That is what's needed to work out how the sheet wires an attack to its
  // weapon: put a Roll20-made weapon and a Party-Tools-made one on the same
  // character, and whatever differs between them is the answer.
  //
  // Read-only. Values are D&D content — no credentials, no campaign ids —
  // but it is your character sheet, so skim it before pasting anywhere
  // public.
  PT.sheets.report = function (characterName, opts) {
    opts = opts || {};
    var out = { version: PT.VERSION, character: characterName || null };
    var character = null;
    try {
      character = Campaign.characters.models.filter(function (c) {
        return (c.get("name") || "") === characterName;
      })[0] || null;
    } catch (e) {}

    var bagsP = (PT.store && PT.store.snapshot)
      ? PT.store.snapshot(PT.envInfo)
      : Promise.resolve(null);

    return bagsP.then(function (snap) {
      out.bagItems = [];
      ((snap && snap.bags) || []).forEach(function (b) {
        (b.doc.items || []).forEach(function (it) {
          out.bagItems.push({
            bag: b.doc.name,
            name: it.name,
            hasPayload: !!it.datarecords,
            verdict: PT.sheets.explainGraph(it)
          });
        });
      });
      if (!character) {
        out.sheet = characterName
          ? "no character named " + JSON.stringify(characterName) + " on this client"
          : "pass a character name to also dump a sheet";
        // Names must match exactly, and guessing one wastes a round trip —
        // so hand back the list rather than just saying no.
        try {
          out.knownNames = Campaign.characters.models
            .map(function (c) { return c.get("name"); })
            .filter(function (n) { return n; });
        } catch (e) {}
        return out;
      }
      return prepareRead(character).then(function (p) {
        if (!p.ok) { out.sheet = "could not read: " + p.err; return out; }
        var ints = (p.doc.integrants && p.doc.integrants.integrants) || {};

        // Every record type on the sheet with a count. Cheap, and it reveals
        // a container we'd otherwise never see — if attacks hang off some
        // "Actions" root rather than off the item, this is where it shows up.
        var counts = {};
        Object.keys(ints).forEach(function (k) {
          var t = (ints[k] && ints[k].type) || "?";
          counts[t] = (counts[t] || 0) + 1;
        });
        out.typeCounts = counts;

        out.sheet = Object.keys(ints).filter(function (k) {
          var t = ints[k] && ints[k].type;
          // Everything an item can be made of. Features, spells and the rest
          // of the character are not our business and stay out of the dump.
          return t === "Item" || t === "Attack" || t === "Damage";
        }).map(function (k) {
          var rec = ints[k];
          var parent = ints[rec.parentID];
          var s = shapeOf(rec);
          s.parentType = parent ? parent.type : "(not an integrant — a sheet root)";
          s.parentName = parent ? parent.name : null;
          s.ancestry = ancestry(ints, k);
          if (opts.full) s.record = JSON.stringify(rec).slice(0, 1500);
          return s;
        });
        return out;
      });
    }).then(function (r) {
      console.log("[PartyTools] report:\n" + JSON.stringify(r, null, 2));
      return r;
    });
  };

  // ---- reading items back off a sheet ---------------------------------------
  // Every Item record on the sheet, including the contents of containers (a
  // torch inside an Explorer's Pack is an Item whose parent is an Item). The
  // parent's name comes along so the UI can say where something lives, since
  // "Torch" alone is ambiguous when three packs each hold one.
  PT.sheets.listItems = function (character) {
    return prepareRead(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      var ints = (p.doc.integrants && p.doc.integrants.integrants) || {};
      var items = Object.keys(ints).filter(function (k) {
        return ints[k] && ints[k].type === "Item" && (ints[k].name || "").trim();
      }).map(function (k) {
        var r = ints[k];
        var parent = ints[r.parentID];
        return {
          id: k,
          name: r.name,
          qty: Number(r.quantity) || 1,
          description: r.description || "",
          weight: r.weight,
          cost: r.cost || "",
          rarity: r.rarity || "",
          container: parent && parent.type === "Item" ? parent.name : null
        };
      });
      items.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return { ok: true, items: items };
    });
  };

  // Walks a record and everything beneath it. Returns null on a malformed
  // childIDs anywhere in the subtree, or if the graph loops back on itself.
  function subtreeIds(ints, rootId) {
    var out = [], seen = {}, queue = [rootId];
    while (queue.length) {
      var id = queue.shift();
      if (seen[id]) continue;              // a cycle, or a shared child
      seen[id] = true;
      var rec = ints[id];
      if (!rec) continue;
      out.push(id);
      if (out.length > MAX_GRAPH_RECORDS) return null;
      var kids = childIdsOf(rec);
      if (kids === null) return null;
      queue = queue.concat(kids);
    }
    return out;
  }

  // Take an item OFF a sheet, for depositing into a bag: the reverse of
  // addItem. Removes `qty` (decrementing the stack, or deleting the record
  // and everything under it when the whole stack goes) and hands back an
  // inventory-shaped item carrying the removed subtree as `datarecords` — the
  // same format a compendium drop stores, so a deposited weapon can be
  // claimed again later with its attack and damage intact.
  //
  // Sheet-first, like claiming: the caller adds to the bag only once this
  // reports ok, so a failure here leaves the character untouched rather than
  // duplicating the item into the party's inventory.
  PT.sheets.takeItem = function (character, itemId, qty) {
    return prepareWrite(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      var next = JSON.parse(JSON.stringify(p.doc));
      var ints = next.integrants && next.integrants.integrants;
      if (!ints) return { ok: false, err: "store has no integrants; cannot read items" };
      var rec = ints[itemId];
      if (!rec || rec.type !== "Item") return { ok: false, err: "that item is no longer on the sheet" };

      var have = Number(rec.quantity) || 1;
      qty = Math.max(1, Math.min(Number(qty) || 1, have));
      var wholeStack = qty >= have;

      var ids = subtreeIds(ints, itemId);
      if (!ids) return { ok: false, err: "this item's records are shaped in a way we don't understand; refusing to change the sheet" };

      // Snapshot BEFORE mutating, in the payload shape buildGraph consumes.
      var datarecords = JSON.stringify(ids.map(function (id) {
        return { payload: JSON.stringify(ints[id]) };
      }));
      var taken = {
        name: rec.name, qty: qty, description: rec.description || "",
        weight: rec.weight, cost: rec.cost || "", rarity: rec.rarity || "",
        datarecords: datarecords
      };

      if (wholeStack) {
        var parent = ints[rec.parentID];
        if (parent) {
          var kids = childIdsOf(parent);
          if (kids === null) return { ok: false, err: "the parent record's childIDs was not valid JSON; refusing to write" };
          parent.childIDs = JSON.stringify(kids.filter(function (k) { return k !== itemId; }));
        }
        ids.forEach(function (id) { delete ints[id]; });
      } else {
        rec.quantity = have - qty;
      }

      return writeStore(character, p.storeAttr, next, function (doc) {
        var bi = doc.integrants && doc.integrants.integrants;
        if (!bi) return false;
        if (wholeStack) return !bi[itemId];
        return bi[itemId] && Number(bi[itemId].quantity) === have - qty;
      }).then(function (wr) {
        if (!wr.ok) return { ok: false, err: wr.err };
        return { ok: true, item: taken, removedWholeStack: wholeStack };
      });
    });
  };

  // item: {name, qty, description, weight, cost, rarity, datarecords} — our
  // stored inventory shape. Writes the item's full compendium graph when it
  // has one, otherwise a single plain Item record. Either way it is placed
  // under an existing top-level item's parent.
  PT.sheets.addItem = function (character, item) {
    return prepareWrite(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      var next = JSON.parse(JSON.stringify(p.doc));
      var ints = next.integrants && next.integrants.integrants;
      if (!ints) return { ok: false, err: "store has no integrants; cannot write item" };

      // A loose item on this sheet has parentID "" — verified on a real
      // character, both for an item Party Tools wrote and for the sheet's own
      // loose items. Items INSIDE a container point at it instead (a
      // Waterskin's parent is a Priest's Pack).
      //
      // This used to copy the parent of whichever top-level item it found
      // first, which was a latent bug: class starting equipment hangs off a
      // "Class Level" record and still counts as top-level, so a claimed item
      // could have been filed inside the character's Paladin class level. It
      // only ever worked because the first item found happened to have "".
      var parentId = "";

      var qty = Number(item && item.qty) || 1;
      var name = (item && item.name) || "";

      // Preferred path: replay the compendium's own record graph, so a weapon
      // lands as a weapon (attack + damage records intact) rather than as a
      // bare possession.
      var graph = item && item.datarecords ? buildGraph(item.datarecords, parentId, qty) : null;
      if (graph) {
        var newIds = Object.keys(graph.records);
        newIds.forEach(function (id) { ints[id] = graph.records[id]; });
        if (!registerWithParent(ints, parentId, graph.rootId)) {
          return { ok: false, err: "parent item's childIDs was not valid JSON; refusing to write" };
        }
        return writeStore(character, p.storeAttr, next, function (doc) {
          var bi = doc.integrants && doc.integrants.integrants;
          if (!bi) return false;
          return newIds.every(function (id) { return !!bi[id]; });
        }).then(function (wr) {
          if (!wr.ok) return { ok: false, err: wr.err };
          return { ok: true, id: graph.rootId, graph: true, records: newIds.length };
        });
      }

      // Single-record path. The base is the compendium's OWN Item record when
      // the drop captured one — that is what carries weaponData, equipData,
      // properties and the real description, and building our own instead is
      // exactly why a longsword arrived as a possession. Only when there is
      // no such record do we synthesise one from the little we stored.
      var newId = PT.uid();
      var source = item && item.datarecords ? compendiumItemPayload(item.datarecords) : null;
      var rec;
      if (source) {
        rec = JSON.parse(JSON.stringify(source));
      } else {
        rec = {
          _enabled: true,
          cost: (item && item.cost) || "",
          description: (item && item.description) || "",
          equipData: { equippable: false },
          label: "",
          rarity: (item && item.rarity) || "",
          source: "Item",
          sourceID: "",
          tempShopData: { compendiumUrl: "", useCompendiumLink: false }
        };
        // weight is omitted entirely rather than written as null/undefined
        // when the caller didn't supply one.
        if (item && item.weight !== undefined && item.weight !== null && item.weight !== "") {
          rec.weight = item.weight;
        }
      }

      // Structural fields are ours in BOTH cases: the compendium record has
      // no ids at all, and a sheet-sourced one carries ids belonging to the
      // character it came off. Setting them unconditionally is what makes
      // either safe to use as a base.
      rec._id = newId;
      rec.parentID = parentId;
      rec.childIDs = "[]";
      rec.quantity = qty;
      rec.type = "Item";
      rec.name = name || rec.name || "";
      rec.recordName = rec.name;
      if (!rec.shortID) rec.shortID = "pt" + Math.random().toString(36).slice(2, 8);
      if (!rec.createdTime) rec.createdTime = Date.now();
      if (rec._enabled === undefined) rec._enabled = true;
      // The link back to the compendium entry. Every record on a sheet-made
      // item carries it; ours carried none, because the id was being read at
      // drop time only to check the lookup succeeded and then discarded.
      if (item && item.compendiumPageID && !rec.compendiumPageID) {
        rec.compendiumPageID = item.compendiumPageID;
      }

      if (!registerWithParent(ints, parentId, newId)) {
        return { ok: false, err: "parent item's childIDs was not valid JSON; refusing to write" };
      }

      ints[newId] = rec;

      // The attacks and their damage, when the payload has them. Without
      // these the sheet shows a weapon with no attack roll — an item is not a
      // weapon to the sheet just because it carries weaponData.
      var extras = source ? buildAttacks(item.datarecords, newId, rec.name, item.compendiumPageID) : null;
      var extraIds = [];
      if (extras && extras.childIds.length) {
        rec.childIDs = JSON.stringify(extras.childIds);
        extraIds = Object.keys(extras.records);
        extraIds.forEach(function (id) { ints[id] = extras.records[id]; });
      }

      return writeStore(character, p.storeAttr, next, function (doc) {
        var bi = doc.integrants && doc.integrants.integrants;
        if (!bi || !bi[newId]) return false;
        return extraIds.every(function (id) { return !!bi[id]; });
      }).then(function (wr) {
        if (!wr.ok) return { ok: false, err: wr.err };
        return {
          ok: true, id: newId, graph: false,
          fromCompendium: !!source,
          records: 1 + extraIds.length,
          attacks: extras ? extras.attackIds.length : 0,
          // Armour and the like: item children that are not attacks.
          itemChildren: extras ? extras.childIds.length - extras.attackIds.length : 0,
          // Payload records we have no rule for, named rather than silently
          // dropped — the caller warns the player with these.
          unwritten: item && item.datarecords ? unwrittenCount(item.datarecords) : 0,
          unwrittenTypes: item && item.datarecords ? unwrittenSummary(item.datarecords).types : []
        };
      });
    });
  };
})(window.PartyTools);

// ---------------------------------------------------------------------------
// MANUAL TEST SNIPPETS — paste into the Roll20 DM browser console (F12) to
// exercise this module directly, no UI required. Requires the extension to
// already be loaded on the page (window.PartyTools.sheets must exist).
// Replace "Spike Warm" with a real character name in your game.
//
// (a) List characters the current user (here: the GM) controls:
/*
window.PartyTools.sheets.controlledBy({ isGM: true, playerId: null })
  .map(function (c) { return c.get("name") + " [" + c.get("charactersheetname") + "]"; });
*/
//
// (a2) *** THE ONE TO RUN WHEN AN ITEM LANDS WRONG *** Read-only.
//
//      Set-up that makes the output conclusive: on the character you name,
//      add a longsword through ROLL20'S OWN sheet UI (its compendium/add
//      button), and claim a longsword from a bag with Party Tools. Then both
//      are on the same sheet and the dump shows what differs between a
//      weapon the sheet made and one we made — including how the sheet's own
//      Attack and Damage records attach to their item, which is the part the
//      compendium payload does not describe.
/*
copy(JSON.stringify(await window.PartyTools.sheets.report("Spike Warm", { full: true }), null, 2))
*/
//
// (a3) The two probes behind "let the sheet build the item instead"
//      (docs/future-ideas.md). Run ROUTE 2 first — it's one line and it
//      either dissolves a lot of future work or rules the idea out.
//
//      ROUTE 2 — does a compendium page id alone make the sheet fill an item
//      in? *** WRITES to the named character; use a throwaway. *** It removes
//      its probe item afterwards. Name a weapon sitting in a bag (dropped on
//      v0.9.8 or later, so it has a stored page id), or pass a page id:
/*
await window.PartyTools.sheets.probeEnrich("Test Dummy", "Longsword")
*/
//
//      ROUTE 1 — is there a drop target on an open character sheet that a
//      synthesised compendium drop could aim at? Open a character sheet
//      first. Read-only:
/*
window.PartyTools.sheets.probeDropTargets()
*/
//
// (b) Read a named character's coin purse (read-only, safe to run any time):
/*
(function () {
  var c = Campaign.characters.models.filter(function (x) { return x.get("name") === "Spike Warm"; })[0];
  if (!c) { console.log("not found"); return; }
  window.PartyTools.sheets.readCoins(c).then(function (r) { console.log(r); });
})();
*/
//
// (c) *** THIS CHANGES THE SHEET *** — adds one test item and 5 gold to a
//     named character, then reads the purse back to confirm. Only run this
//     against a character you don't mind editing (a test character, or one
//     you're happy to clean up by hand afterwards):
/*
(function () {
  var c = Campaign.characters.models.filter(function (x) { return x.get("name") === "Spike Warm"; })[0];
  if (!c) { console.log("not found"); return; }
  window.PartyTools.sheets.addItem(c, {
    name: "Console Test Torch", qty: 1, description: "Added by a manual test snippet.",
    weight: 1, cost: "1 SP", rarity: ""
  }).then(function (itemRes) {
    console.log("addItem:", itemRes);
    return window.PartyTools.sheets.addCoins(c, { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 });
  }).then(function (coinRes) {
    console.log("addCoins:", coinRes);
    return window.PartyTools.sheets.readCoins(c);
  }).then(function (readRes) {
    console.log("readCoins:", readRes);
  });
})();
*/
