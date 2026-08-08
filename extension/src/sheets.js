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
  // item: {name, qty, description, weight, cost, rarity} — our stored
  // inventory shape. Creates one plain Item record (no attack/damage graph)
  // and registers it under an existing top-level item's parent.
  PT.sheets.addItem = function (character, item) {
    return prepareWrite(character).then(function (p) {
      if (!p.ok) return { ok: false, err: p.err };
      var next = JSON.parse(JSON.stringify(p.doc));
      var ints = next.integrants && next.integrants.integrants;
      if (!ints) return { ok: false, err: "store has no integrants; cannot write item" };

      // Find an existing top-level item (its parent is not itself an Item)
      // and reuse that placement — never guess a parent out of thin air.
      var itemIds = Object.keys(ints).filter(function (k) { return ints[k].type === "Item"; });
      var topLevel = itemIds.filter(function (k) {
        var parent = ints[ints[k].parentID];
        return !parent || parent.type !== "Item";
      });
      if (!topLevel.length) {
        return { ok: false, err: "could not find an existing top-level item to place the new item alongside; refusing to guess a parent" };
      }
      var parentId = ints[topLevel[0]].parentID;

      var newId = PT.uid();
      var qty = Number(item && item.qty) || 1;
      var name = (item && item.name) || "";
      var rec = {
        _enabled: true,
        _id: newId,
        childIDs: "[]",
        cost: (item && item.cost) || "",
        createdTime: Date.now(),
        description: (item && item.description) || "",
        equipData: { equippable: false },
        label: "",
        name: name,
        parentID: parentId,
        quantity: qty,
        rarity: (item && item.rarity) || "",
        recordName: name,
        shortID: "pt" + Math.random().toString(36).slice(2, 8),
        source: "Item",
        sourceID: "",
        tempShopData: { compendiumUrl: "", useCompendiumLink: false },
        type: "Item"
      };
      // weight is omitted entirely rather than written as null/undefined
      // when the caller didn't supply one.
      if (item && item.weight !== undefined && item.weight !== null && item.weight !== "") {
        rec.weight = item.weight;
      }

      // Register with the parent, if the parent is itself an integrant
      // (a character-root parent isn't, and needs no childIDs update).
      // childIDs is a STRING holding a JSON array — parse, push, re-stringify.
      if (ints[parentId]) {
        var kids;
        try { kids = JSON.parse(ints[parentId].childIDs || "[]"); }
        catch (e) { return { ok: false, err: "parent item's childIDs was not valid JSON; refusing to write" }; }
        kids.push(newId);
        ints[parentId].childIDs = JSON.stringify(kids);
      }

      ints[newId] = rec;

      return writeStore(character, p.storeAttr, next, function (doc) {
        var bi = doc.integrants && doc.integrants.integrants;
        return !!(bi && bi[newId]);
      }).then(function (wr) {
        if (!wr.ok) return { ok: false, err: wr.err };
        return { ok: true, id: newId };
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
