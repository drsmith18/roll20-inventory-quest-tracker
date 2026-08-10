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

  function payloadsOf(datarecords) {
    var raw = PT.tryJson(datarecords || "");
    if (!Array.isArray(raw) || !raw.length) return null;
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i] && typeof raw[i].payload === "string" ? PT.tryJson(raw[i].payload) : null;
      if (!p || typeof p !== "object" || typeof p.type !== "string") return null;
      var id = p._id || p.id;
      if (!id || typeof id !== "string") return null;
      out.push(p);
    }
    return out.length && out.length <= MAX_GRAPH_RECORDS ? out : null;
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
    if (!dr) return { graph: false, why: "this item has no compendium payload (manual, name-only, or obscured)" };
    var payloads = payloadsOf(dr);
    if (!payloads) {
      var raw = PT.tryJson(dr);
      // On rejection, show the raw structure too — the whole point of this
      // diagnostic is to reveal a payload shape that differs from the one
      // buildGraph was written against, and "it was rejected" alone doesn't.
      return {
        graph: false,
        why: !Array.isArray(raw)
          ? "the payload isn't a JSON array"
          : "a record was unparseable, had no _id/id, had no string type, or there were more than " + MAX_GRAPH_RECORDS,
        rawCount: Array.isArray(raw) ? raw.length : null,
        rawKeys: Array.isArray(raw) && raw[0] && typeof raw[0] === "object" ? Object.keys(raw[0]).join(",") : null,
        rawFirst: Array.isArray(raw) ? JSON.stringify(raw[0]).slice(0, 600) : String(dr).slice(0, 600)
      };
    }
    var built = buildGraph(dr, "diagnostic-parent", 1);
    return {
      graph: !!built,
      records: payloads.length,
      types: payloads.map(function (p) { return p.type; }),
      shape: payloads.map(shapeOf),
      why: built ? "would rebuild in full" : "no single Item root, a child link pointing outside the payload, or malformed childIDs"
    };
  };

  // Console diagnostic: PT.sheets.report("Character Name")
  //
  // Answers the question "why did my longsword land as a possession?" in one
  // paste, because there are two completely different causes and the fix
  // differs: either the compendium payload was REJECTED and we wrote a plain
  // item (look at bagItems[].verdict), or the graph was written faithfully
  // and the sheet still doesn't consider it a weapon (compare `sheet` below
  // against the same weapon added through Roll20's own sheet UI — whatever
  // differs is what makes a weapon a weapon).
  //
  // Read-only. Dumps structure and field NAMES, not values.
  PT.sheets.report = function (characterName) {
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
        return out;
      }
      return prepareRead(character).then(function (p) {
        if (!p.ok) { out.sheet = "could not read: " + p.err; return out; }
        var ints = (p.doc.integrants && p.doc.integrants.integrants) || {};
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

      // Fallback: one plain Item record. This is everything a manual item or
      // an unresolved compendium drop has to offer, and what a compendium
      // item degrades to if its payload doesn't match what buildGraph knows.
      var newId = PT.uid();
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

      if (!registerWithParent(ints, parentId, newId)) {
        return { ok: false, err: "parent item's childIDs was not valid JSON; refusing to write" };
      }

      ints[newId] = rec;

      return writeStore(character, p.storeAttr, next, function (doc) {
        var bi = doc.integrants && doc.integrants.integrants;
        return !!(bi && bi[newId]);
      }).then(function (wr) {
        if (!wr.ok) return { ok: false, err: wr.err };
        return { ok: true, id: newId, graph: false, records: 1 };
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
//      weapon the sheet made and one we made.
/*
window.PartyTools.sheets.report("Spike Warm");
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
