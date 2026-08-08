// Party Tools — storage layer. Everything lives in Roll20 handouts inside
// the campaign, exactly as the spikes verified (docs/roll20-spike-findings.md):
//   - handout bodies read via _getLatestBlob, written via updateBlobs
//   - EVERY write is verified by re-read and re-applied if lost, because
//     Roll20 rejects (permissions) and discards (concurrent writes) silently
//   - handouts are referenced by ID, never by name; names are opaque "PT-…"
//   - revealed data is shared with all players; hidden data is GM-only,
//     which Roll20 enforces server-side (bodies are withheld from players)
// Layout: one shared index, one GM-only index (hidden bag list), one shared
// activity log (entries are union-merged by id, so concurrent appends
// converge instead of overwriting each other), and one handout per bag.
(function (PT) {
  "use strict";
  var PREFIX = "PT-";
  var SCHEMA = 1;
  // Verification delays are overridable so the test harness can run fast;
  // the defaults are tuned to real Roll20 (blob writes echo in ~1s).
  function verifyDelay() { return PT.VERIFY_DELAY_MS || 1600; }
  function createDelay() { return PT.CREATE_DELAY_MS || 1200; }
  var st = {
    ready: false, readOnly: false,
    indexH: null, gmIndexH: null, logH: null,
    bagHs: {}   // handout id -> handout model
  };
  PT.store = { state: st, SCHEMA: SCHEMA };

  function handoutById(id) { return Campaign.handouts.get(id) || null; }

  function readBlob(h) {
    return new Promise(function (resolve) {
      if (!h) return resolve("");
      try {
        h._getLatestBlob("notes", function (b) { resolve(typeof b === "string" ? b : ""); });
      } catch (e) { resolve(""); }
    });
  }
  PT.store.readDoc = function (h) {
    return readBlob(h).then(function (t) { return PT.tryJson(t); });
  };

  // The core write primitive. mutate(docOrNull) returns the new doc, or null
  // for "nothing to do". On every attempt the CURRENT body is re-read and
  // the mutation re-applied, so a lost race reapplies our change on top of
  // the winner instead of clobbering it (the S5 lesson).
  function writeMerged(h, mutate, attempts) {
    if (st.readOnly) return Promise.resolve({ ok: false, err: "read-only: data written by a newer version" });
    attempts = attempts == null ? 4 : attempts;
    return readBlob(h).then(function (cur) {
      var doc = mutate(PT.tryJson(cur));
      if (doc === null) return { ok: true, unchanged: true };
      doc.rev = PT.uid();
      var text = JSON.stringify(doc);
      try { h.updateBlobs({ notes: text }); }
      catch (e) { return { ok: false, err: "write threw: " + e.message }; }
      return PT.delay(verifyDelay()).then(function () {
        return readBlob(h).then(function (got) {
          if (got === text) return { ok: true, doc: doc };
          if (attempts <= 1) return { ok: false, err: "write did not persist (permissions, or repeated write races)" };
          return writeMerged(h, mutate, attempts - 1);
        });
      });
    });
  }
  PT.store.writeMerged = writeMerged;

  // share: "all" (revealed) or "gm" (hidden). Creation is attempted from any
  // client; whether Roll20 permits players to create handouts is unverified,
  // so the follow-up body write (verified) is what decides success.
  function createHandout(share, firstDoc) {
    var h;
    try {
      h = Campaign.handouts.create({
        name: PREFIX + Math.random().toString(36).slice(2, 10),
        inplayerjournals: share === "all" ? "all" : "",
        controlledby: share === "all" ? "all" : "",
        archived: false
      });
    } catch (e) { return Promise.resolve({ ok: false, err: "create threw: " + e.message }); }
    return PT.delay(createDelay()).then(function () {
      return writeMerged(h, function () { return firstDoc; }).then(function (res) {
        if (res.ok) return { ok: true, h: h };
        // Observed live: Roll20's server rejects handout creation by a
        // non-GM (permission_denied on /handouts/<id>), silently as ever.
        // Say so plainly instead of reporting a generic write failure.
        if (!window.is_gm) {
          return { ok: false, err: "Roll20 does not let players create journal handouts, which is where bags are stored. Ask your DM to create the bag.", notPermitted: true };
        }
        return { ok: false, err: res.err };
      });
    });
  }

  function setSharing(h, share) {
    try {
      h.save({
        inplayerjournals: share === "all" ? "all" : "",
        controlledby: share === "all" ? "all" : ""
      });
      return true;
    } catch (e) { PT.log("setSharing failed:", e.message); return false; }
  }

  // ---- discovery -----------------------------------------------------------
  function ptHandoutsByName() {
    return Campaign.handouts.models.filter(function (h) {
      return (h.get("name") || "").indexOf(PREFIX) === 0 && !h.get("archived");
    });
  }

  function scan() {
    // Sort by id so selection is DETERMINISTIC across clients: if duplicate
    // storage sets ever exist, the DM and every player pick the SAME one
    // (the earliest-created), instead of latching onto different sets.
    var candidates = ptHandoutsByName().sort(function (a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return Promise.all(candidates.map(function (h) {
      return readBlob(h).then(function (t) { return { h: h, doc: PT.tryJson(t) }; });
    })).then(function (list) {
      var found = { index: null, gmIndex: null, log: null, bags: {}, readable: 0, extraIndexes: [] };
      list.forEach(function (e) {
        if (!e.doc) return; // unreadable = hidden-from-us, or body not loaded yet
        found.readable++;
        if (e.doc.partyToolsIndex) { if (found.index) found.extraIndexes.push(e.h.id); else found.index = e; }
        else if (e.doc.partyToolsGmIndex) { if (!found.gmIndex) found.gmIndex = e; }
        else if (e.doc.partyToolsLog) { if (!found.log) found.log = e; }
        else if (e.doc.partyToolsBag) found.bags[e.h.id] = e;
      });
      return found;
    });
  }

  // Retry scan until an index is readable. Roll20 delivers the handout LIST
  // before their bodies, so a first scan can see the handouts exist yet read
  // every body as empty. Concluding "no storage" then is what created
  // duplicate sets (the DM re-initialised on top of real data). We only give
  // up — and, for the DM, create fresh — when NO PT- handouts exist by name
  // at all, which is the true first-run signal.
  function scanUntilReady() {
    var t0 = Date.now();
    return (function attempt() {
      return scan().then(function (found) {
        PT.log("scan: " + ptHandoutsByName().length + " PT- handout(s) by name, " +
          found.readable + " readable, index=" + (found.index ? found.index.h.id : "none") +
          (found.extraIndexes.length ? " (+" + found.extraIndexes.length + " duplicate index(es)!)" : ""));
        if (found.index) return found;
        var existByName = ptHandoutsByName().length;
        if (existByName > 0 && Date.now() - t0 < 20000) {
          return PT.delay(1000).then(attempt);
        }
        return found; // genuinely nothing (create), or gave up after 20s
      });
    })();
  }

  // Waits until the journal's initial download has finished: the handout
  // count must hold still for 3 consecutive one-second samples. A fresh page
  // races the download — v0.1.2 scanned an EMPTY list, read "no storage",
  // and re-initialised on every reload. This is the fix for that.
  function waitForJournal() {
    var last = -1, stable = 0, t0 = Date.now();
    return (function check() {
      var n = Campaign.handouts.models.length;
      if (n === last) stable++; else { stable = 0; last = n; }
      if (stable >= 3 || Date.now() - t0 > 30000) {
        PT.log("journal settled: " + n + " handout(s) after " + Math.round((Date.now() - t0) / 1000) + "s");
        return Promise.resolve();
      }
      return PT.delay(1000).then(check);
    })();
  }

  // ---- init (DEL-3 for the DM, DEL-4 for players) --------------------------
  PT.store.init = function (env) {
    return waitForJournal().then(scanUntilReady).then(function (found) {
      if (found.index) {
        if ((found.index.doc.partyToolsIndex || 0) > SCHEMA) st.readOnly = true;
        st.indexH = found.index.h;
        st.gmIndexH = found.gmIndex ? found.gmIndex.h : null;
        st.logH = found.log ? found.log.h : null;
        st.ready = true;
        if (found.extraIndexes.length) {
          PT.log("WARNING: " + found.extraIndexes.length + " duplicate storage set(s) present; using earliest. Run PartyTools.store.wipeAll() as DM to reset, or clean up PT- handouts by hand.");
        }
        return { state: st.readOnly ? "readOnly" : "ready", duplicates: found.extraIndexes.length };
      }
      if (ptHandoutsByName().length > 0) {
        // Handouts exist but no index became readable in time. Do NOT create
        // (that caused the duplication). For a player this is a load hiccup;
        // for the DM it may be a damaged set. Either way, surface it.
        return { state: "notReady" };
      }
      if (!env.isGM) return { state: "noStorage" }; // players never initialise a game
      // Genuine first run as DM: index + gm index + log + default bag (INV-1).
      return createHandout("all", {
        partyToolsBag: SCHEMA, name: "Party Loot", desc: "", items: [],
        purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
      }).then(function (bag) {
        if (!bag.ok) return { state: "initFailed", err: bag.err };
        return Promise.all([
          createHandout("all", { partyToolsIndex: SCHEMA, bags: [bag.h.id], settings: {} }),
          createHandout("gm", { partyToolsGmIndex: SCHEMA, hiddenBags: [], obscured: {} }),
          createHandout("all", { partyToolsLog: SCHEMA, entries: [] })
        ]).then(function (res) {
          if (!res[0].ok || !res[1].ok || !res[2].ok) return { state: "initFailed", err: (res[0].err || res[1].err || res[2].err) };
          st.indexH = res[0].h; st.gmIndexH = res[1].h; st.logH = res[2].h;
          st.ready = true;
          return { state: "ready", firstRun: true };
        });
      });
    });
  };

  // Console diagnostic: PartyTools.store.debug() — dumps what this client
  // can see of the storage. Paste its output into a bug report.
  PT.store.debug = function () {
    var names = ptHandoutsByName();
    console.log("[PartyTools] v" + PT.VERSION + " | role=" + (window.is_gm ? "DM" : "player") +
      " | state=" + (st.readOnly ? "readOnly" : st.ready ? "ready" : "NOT ready"));
    console.log("[PartyTools] chosen: index=" + (st.indexH ? st.indexH.id : "none") +
      " gmIndex=" + (st.gmIndexH ? st.gmIndexH.id : "none") + " log=" + (st.logH ? st.logH.id : "none"));
    console.log("[PartyTools] " + names.length + " PT- handout(s) by name; per-handout dump follows:");
    names.sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (h) {
      readBlob(h).then(function (b) {
        var d = PT.tryJson(b);
        var type = d ? (Object.keys(d).filter(function (k) { return k.indexOf("partyTools") === 0; })[0] || "?") : "UNREADABLE";
        console.log("[PartyTools]   " + h.get("name") + " | id=" + h.id + " | " + type +
          " | len=" + (b ? b.length : 0) +
          (d && d.name ? " | bagName=" + d.name : "") +
          (d && d.items ? " | items=" + d.items.length : "") +
          (d && d.bags ? " | listsBags=" + JSON.stringify(d.bags) : ""));
      });
    });
    return "dumping " + names.length + " handout(s)…";
  };

  // Danger tool, DM-only, for the console: delete EVERY PT- handout so the
  // game can re-initialise cleanly. Used to clear the duplicate sets created
  // by the pre-fix build. Reload the page as DM afterwards.
  PT.store.wipeAll = function () {
    var doomed = ptHandoutsByName();
    PT.log("wiping " + doomed.length + " PT- handout(s)…");
    doomed.forEach(function (h) { try { h.destroy(); } catch (e) {} });
    st.ready = false; st.indexH = st.gmIndexH = st.logH = null; st.bagHs = {};
    PT.log("done. Reload the page as the DM to recreate storage.");
    return doomed.length;
  };

  // ---- snapshot for the UI --------------------------------------------------
  // Re-reads the index and every listed bag. Hidden bags come from the GM
  // index, which player clients cannot read (server-enforced), so players
  // never receive hidden bag ids here, let alone contents.
  PT.store.snapshot = function (env) {
    if (!st.ready) return Promise.resolve(null);
    return Promise.all([PT.store.readDoc(st.indexH), st.gmIndexH ? PT.store.readDoc(st.gmIndexH) : null])
      .then(function (r) {
        var index = r[0] || { bags: [] };
        var gmIndex = r[1];
        var ids = (index.bags || []).slice();
        var hiddenIds = (env.isGM && gmIndex && gmIndex.hiddenBags) ? gmIndex.hiddenBags : [];
        var all = ids.concat(hiddenIds);
        return Promise.all(all.map(function (id) {
          var h = handoutById(id);
          if (!h) return null;
          return PT.store.readDoc(h).then(function (doc) {
            if (!doc || !doc.partyToolsBag) return null;
            st.bagHs[id] = h;
            return { id: id, doc: doc, hidden: hiddenIds.indexOf(id) !== -1 };
          });
        })).then(function (bags) {
          // Obscured items' true fields (INV-16): only ever non-empty for the
          // GM client, because gmIndex above is only non-null when THIS
          // client could actually read the GM-only handout's body — Roll20
          // withholds it from players server-side (S1). No fallback that
          // could substitute real data in for a player belongs here.
          return { index: index, bags: bags.filter(Boolean), readOnly: st.readOnly, obscured: (gmIndex && gmIndex.obscured) || {} };
        });
      });
  };

  // ---- activity log ---------------------------------------------------------
  // Entries are union-merged by id: if our append loses a race, the retry
  // re-reads the winner's body and re-inserts only the missing entry.
  PT.store.appendLog = function (env, msg) {
    if (!st.logH) return Promise.resolve({ ok: false });
    var entry = { id: PT.uid(), t: Date.now(), who: env.playerName, gm: !!env.isGM, msg: msg };
    return writeMerged(st.logH, function (doc) {
      doc = doc && doc.partyToolsLog ? doc : { partyToolsLog: SCHEMA, entries: [] };
      if (doc.entries.some(function (e) { return e.id === entry.id; })) return null;
      doc.entries.push(entry);
      doc.entries.sort(function (a, b) { return a.t - b.t; });
      if (doc.entries.length > 4000) doc.entries = doc.entries.slice(-4000);
      return doc;
    });
  };
  PT.store.readLog = function () {
    if (!st.logH) return Promise.resolve([]);
    return PT.store.readDoc(st.logH).then(function (doc) { return (doc && doc.entries) || []; });
  };

  // ---- bag operations -------------------------------------------------------
  function mutateBag(bagId, fn) {
    var h = st.bagHs[bagId] || handoutById(bagId);
    if (!h) return Promise.resolve({ ok: false, err: "bag handout not found" });
    return writeMerged(h, function (doc) {
      if (!doc || !doc.partyToolsBag) return null;
      return fn(doc) === false ? null : doc;
    });
  }
  PT.store.mutateBag = mutateBag;

  // Did this user create this bag? Prefers the player ID; falls back to the
  // display name only for bags written before IDs were recorded.
  PT.store.ownsBag = function (env, doc) {
    if (!doc) return false;
    if (doc.createdById) return doc.createdById === env.playerId;
    return !!doc.createdBy && doc.createdBy === env.playerName;
  };

  PT.store.createBag = function (env, name, hidden) {
    // INV-4 (revised 8 Aug 2026): DM-only. Roll20 rejects handout creation
    // by non-GMs server-side, so this is enforced by the platform whatever
    // the UI does; refusing here keeps the reason honest.
    if (!env.isGM) {
      return Promise.resolve({ ok: false, err: "Only the DM can create bags — Roll20 does not let players create the journal handouts bags are stored in." });
    }
    var body = {
      partyToolsBag: SCHEMA, name: name, desc: "", items: [],
      purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      // createdBy is for display; createdById is what ownership checks use.
      // Display names are not unique, and Roll20's "view as player" mode
      // keeps the GM's name while reporting is_gm false.
      createdBy: env.playerName,
      createdById: env.playerId
    };
    if (hidden && !env.isGM) return Promise.resolve({ ok: false, err: "only the DM can create hidden bags" });
    return createHandout(hidden ? "gm" : "all", body).then(function (res) {
      if (!res.ok) return res;
      var listH = hidden ? st.gmIndexH : st.indexH;
      var listKey = hidden ? "hiddenBags" : "bags";
      return writeMerged(listH, function (doc) {
        if (!doc) return null;
        doc[listKey] = doc[listKey] || [];
        if (doc[listKey].indexOf(res.h.id) === -1) doc[listKey].push(res.h.id);
        return doc;
      }).then(function (r2) {
        if (!r2.ok) return r2;
        st.bagHs[res.h.id] = res.h;
        if (!hidden) PT.store.appendLog(env, "created bag “" + name + "”");
        return { ok: true, id: res.h.id };
      });
    });
  };

  PT.store.setBagHidden = function (env, bagId, hidden, bagName) {
    if (!env.isGM || !st.gmIndexH) return Promise.resolve({ ok: false, err: "DM only" });
    var h = st.bagHs[bagId] || handoutById(bagId);
    if (!h) return Promise.resolve({ ok: false, err: "bag not found" });
    setSharing(h, hidden ? "gm" : "all");
    return writeMerged(st.indexH, function (doc) {
      if (!doc) return null;
      doc.bags = (doc.bags || []).filter(function (id) { return id !== bagId; });
      if (!hidden) doc.bags.push(bagId);
      return doc;
    }).then(function () {
      return writeMerged(st.gmIndexH, function (doc) {
        if (!doc) return null;
        doc.hiddenBags = (doc.hiddenBags || []).filter(function (id) { return id !== bagId; });
        if (hidden) doc.hiddenBags.push(bagId);
        return doc;
      });
    }).then(function (r) {
      if (r.ok && !hidden) PT.store.appendLog(env, "revealed bag “" + bagName + "”");
      return r;
    });
  };

  PT.store.deleteBag = function (env, bagId, bagName, moveToId) {
    var h = st.bagHs[bagId] || handoutById(bagId);
    if (!h) return Promise.resolve({ ok: false, err: "bag not found" });
    return PT.store.readDoc(h).then(function (doc) {
      var items = (doc && doc.items) || [];
      var purse = (doc && doc.purse) || {};
      var moveNeeded = items.length || PT.purseToCopper(purse) > 0;
      var movePromise = Promise.resolve({ ok: true });
      if (moveNeeded && moveToId) {
        movePromise = mutateBag(moveToId, function (target) {
          target.items = (target.items || []).concat(items);
          PT.DENOMS.forEach(function (d) { target.purse[d] = (Number(target.purse[d]) || 0) + (Number(purse[d]) || 0); });
        });
      } else if (moveNeeded && !moveToId) {
        return { ok: false, err: "bag is not empty; contents must move somewhere" };
      }
      return movePromise.then(function (mr) {
        if (!mr.ok) return mr;
        var cleanups = [writeMerged(st.indexH, function (doc2) {
          if (!doc2) return null;
          doc2.bags = (doc2.bags || []).filter(function (id) { return id !== bagId; });
          return doc2;
        })];
        if (env.isGM && st.gmIndexH) cleanups.push(writeMerged(st.gmIndexH, function (doc2) {
          if (!doc2) return null;
          doc2.hiddenBags = (doc2.hiddenBags || []).filter(function (id) { return id !== bagId; });
          return doc2;
        }));
        return Promise.all(cleanups).then(function () {
          try { h.destroy(); } catch (e) {}
          delete st.bagHs[bagId];
          PT.store.appendLog(env, "deleted bag “" + bagName + "”" + (moveNeeded ? " (contents moved)" : ""));
          return { ok: true };
        });
      });
    });
  };

  // ---- bag metadata (INV-3/4) -------------------------------------------------
  // Permission mirrors what the UI already hides the ✎ button for: the DM may
  // edit any bag; a player may edit only a bag THEY created that is still
  // empty (no items, no coins) — checked here too, against a freshly re-read
  // doc, in case the UI's view is stale. Only the fields that actually change
  // are written and logged; a no-op call makes no write.
  PT.store.renameBag = function (env, bagId, newName, newDesc) {
    newName = (newName || "").trim();
    newDesc = newDesc == null ? "" : String(newDesc).trim();
    if (!newName) return Promise.resolve({ ok: false, err: "name required" });
    var h = st.bagHs[bagId] || handoutById(bagId);
    if (!h) return Promise.resolve({ ok: false, err: "bag not found" });
    return PT.store.readDoc(h).then(function (doc) {
      if (!doc || !doc.partyToolsBag) return { ok: false, err: "bag not found" };
      var canEdit = env.isGM || (PT.store.ownsBag(env, doc) && !(doc.items || []).length && PT.purseToCopper(doc.purse) === 0);
      if (!canEdit) return { ok: false, err: "you don't have permission to edit this bag" };
      var change = null;
      return mutateBag(bagId, function (doc2) {
        var oldName = doc2.name;
        var oldDesc = doc2.desc || "";
        var nameChanged = oldName !== newName;
        var descChanged = oldDesc !== newDesc;
        if (!nameChanged && !descChanged) return false;
        change = { nameChanged: nameChanged, descChanged: descChanged, oldName: oldName, newName: newName };
        doc2.name = newName;
        doc2.desc = newDesc;
      }).then(function (r) {
        if (r.ok && change) {
          var msg;
          if (change.nameChanged && change.descChanged) {
            msg = "renamed bag “" + change.oldName + "” to “" + change.newName + "” and updated its description";
          } else if (change.nameChanged) {
            msg = "renamed bag “" + change.oldName + "” to “" + change.newName + "”";
          } else {
            msg = "updated the description of bag “" + change.newName + "”";
          }
          PT.store.appendLog(env, msg);
        }
        return r;
      });
    });
  };

  // ---- item operations ------------------------------------------------------
  PT.store.addItem = function (env, bagId, bagName, item) {
    item.id = item.id || PT.uid();
    item.addedBy = env.playerName;
    item.addedAt = Date.now();
    item.qty = Number(item.qty) || 1;
    return mutateBag(bagId, function (doc) {
      // stack identical items (INV-12): same name and same compendium source
      var twin = (doc.items || []).filter(function (i) {
        return i.name === item.name && (i.pagename || "") === (item.pagename || "");
      })[0];
      if (twin) twin.qty = (Number(twin.qty) || 1) + item.qty;
      else doc.items.push(item);
    }).then(function (r) {
      if (r.ok) PT.store.appendLog(env, "added " + item.qty + "× “" + item.name + "” to “" + bagName + "”");
      return r;
    });
  };

  PT.store.changeQty = function (env, bagId, bagName, itemId, delta) {
    var label = null;
    return mutateBag(bagId, function (doc) {
      var it = (doc.items || []).filter(function (i) { return i.id === itemId; })[0];
      if (!it) return false;
      it.qty = Math.max(0, (Number(it.qty) || 1) + delta);
      label = it.name + " → " + it.qty;
      if (it.qty === 0) doc.items = doc.items.filter(function (i) { return i.id !== itemId; });
    }).then(function (r) {
      if (r.ok && label) PT.store.appendLog(env, "quantity: " + label + " in “" + bagName + "”");
      return r;
    });
  };

  PT.store.deleteItem = function (env, bagId, bagName, itemId) {
    var name = null;
    return mutateBag(bagId, function (doc) {
      var it = (doc.items || []).filter(function (i) { return i.id === itemId; })[0];
      if (!it) return false;
      name = it.name;
      doc.items = doc.items.filter(function (i) { return i.id !== itemId; });
    }).then(function (r) {
      if (r.ok && name) PT.store.appendLog(env, "removed “" + name + "” from “" + bagName + "”");
      return r;
    });
  };

  PT.store.moveItem = function (env, fromId, fromName, toId, toName, itemId) {
    var moved = null;
    return mutateBag(fromId, function (doc) {
      var it = (doc.items || []).filter(function (i) { return i.id === itemId; })[0];
      if (!it) return false;
      moved = JSON.parse(JSON.stringify(it));
      doc.items = doc.items.filter(function (i) { return i.id !== itemId; });
    }).then(function (r) {
      if (!r.ok || !moved) return r;
      return mutateBag(toId, function (doc) { doc.items.push(moved); }).then(function (r2) {
        if (r2.ok) PT.store.appendLog(env, "moved “" + moved.name + "”: “" + fromName + "” → “" + toName + "”");
        else {
          // second write failed: put it back rather than lose the item
          return mutateBag(fromId, function (doc) { doc.items.push(moved); }).then(function () { return r2; });
        }
        return r2;
      });
    });
  };

  // ---- obscured items (INV-16/16a/16b) ---------------------------------------
  // THE HARD RULE this section exists to enforce (spike S1b, PRD C6.1): a bag
  // players can see is a handout whose ENTIRE body — including gmnotes — is
  // delivered to every player's browser. An item's true name/stats must
  // therefore NEVER be written into a bag record, not even transiently. The
  // only safe home for that data is the GM index handout's `obscured` map,
  // whose body Roll20's server withholds from players entirely (verified S1).

  // Shared by obscureItem (an item already in a bag) and ui.js's shift-drop
  // flow (INV-16a, a brand-new item that must obscure on arrival): writes one
  // item's true fields into the GM-only index, keyed by item id. Exposed on
  // PT.store because the drop flow needs to land this write BEFORE any trace
  // of the item — obscured or not — reaches the player-visible bag.
  function stashObscuredTruth(env, itemId, truth) {
    if (!env.isGM) return Promise.resolve({ ok: false, err: "DM only" });
    if (!st.gmIndexH) return Promise.resolve({ ok: false, err: "GM index not available" });
    return writeMerged(st.gmIndexH, function (gmDoc) {
      gmDoc = gmDoc && gmDoc.partyToolsGmIndex ? gmDoc : { partyToolsGmIndex: SCHEMA, hiddenBags: [], obscured: {} };
      gmDoc.obscured = gmDoc.obscured || {};
      gmDoc.obscured[itemId] = truth;
      return gmDoc;
    });
  }
  PT.store.stashObscuredTruth = stashObscuredTruth;

  // INV-16a support: pushes an ALREADY-obscured item straight into a bag —
  // used only after stashObscuredTruth has confirmed the true data is safely
  // in the GM index. Deliberately does not stack with an existing item the
  // way addItem does: two different true items can easily end up with the
  // same DM-written surface text ("a dull grey rod, warm to the touch" ×2),
  // and stacking would merge them under one id, silently orphaning one of
  // the two GM-index truth records this item is supposed to map to 1:1.
  PT.store.addObscuredItem = function (env, bagId, bagName, itemId, qty, surfaceDesc) {
    if (!env.isGM) return Promise.resolve({ ok: false, err: "DM only" });
    var item = {
      id: itemId, qty: Number(qty) || 1, name: surfaceDesc, obscured: true,
      addedBy: env.playerName, addedAt: Date.now()
    };
    return mutateBag(bagId, function (doc) { doc.items.push(item); }).then(function (r) {
      // Log message deliberately omits the true name (it's player-visible) —
      // see obscureItem below for the same rule.
      if (r.ok) PT.store.appendLog(env, "obscured an item in “" + bagName + "” — players now see “" + surfaceDesc + "”");
      return r;
    });
  };

  // INV-16: obscures an item already sitting in a bag. DM only. Write order
  // matters and is NOT interchangeable:
  //   (a) true fields -> GM index (stashObscuredTruth), confirmed by
  //       writeMerged's verify-and-retry
  //   (b) ONLY if (a) succeeded: visible fields -> bag (delete, don't blank,
  //       so no residual field can be inspected client-side)
  // If (a) fails, nothing about the visible item has changed — safe to just
  // report the error and let the DM retry. If (a) succeeds but (b) fails, the
  // true data is now safely stored but the bag STILL shows full stats to
  // players: that must never be reported as success, and never retried by
  // silently re-running (a) (writeMerged's own retries already cover
  // transient loss; a second call from the UI simply tries the whole
  // operation again, and (a) is naturally idempotent — it overwrites the
  // same key with the same truth).
  PT.store.obscureItem = function (env, bagId, bagName, itemId, surfaceDesc) {
    if (!env.isGM) return Promise.resolve({ ok: false, err: "DM only" });
    surfaceDesc = (surfaceDesc || "").trim();
    if (!surfaceDesc) return Promise.resolve({ ok: false, err: "a surface description is required" });
    if (!st.gmIndexH) return Promise.resolve({ ok: false, err: "GM index not available" });
    var h = st.bagHs[bagId] || handoutById(bagId);
    if (!h) return Promise.resolve({ ok: false, err: "bag not found" });
    return PT.store.readDoc(h).then(function (doc) {
      if (!doc || !doc.partyToolsBag) return { ok: false, err: "bag not found" };
      var it = (doc.items || []).filter(function (i) { return i.id === itemId; })[0];
      if (!it) return { ok: false, err: "item not found" };
      if (it.obscured) return { ok: false, err: "item is already obscured" };
      var truth = {
        name: it.name, description: it.description, cost: it.cost,
        weight: it.weight, rarity: it.rarity, itemType: it.itemType,
        pagename: it.pagename, expansionId: it.expansionId, datarecords: it.datarecords,
        hiddenAt: Date.now(), hiddenBy: env.playerName
      };
      // (a) FIRST — see the ordering note above.
      return stashObscuredTruth(env, itemId, truth).then(function (gmRes) {
        if (!gmRes.ok) {
          return { ok: false, err: "couldn't save the true item data — the item is NOT obscured yet, nothing changed. Try again." };
        }
        // (b) ONLY NOW touch the player-visible bag.
        return mutateBag(bagId, function (doc2) {
          var it2 = (doc2.items || []).filter(function (i) { return i.id === itemId; })[0];
          if (!it2) return false;
          it2.name = surfaceDesc;
          // Deleted, not blanked: an empty string/0 is still a value a
          // console-savvy player could read as "confirmed no rarity" etc.
          // Deleting removes the field from the record entirely. expansionId
          // isn't explicitly a "stat", but it's compendium-linkage metadata
          // already captured in the GM-index truth record, so it goes too —
          // nothing that could help reconstruct the item belongs here.
          delete it2.description; delete it2.cost; delete it2.weight;
          delete it2.rarity; delete it2.itemType; delete it2.pagename;
          delete it2.expansionId; delete it2.datarecords;
          it2.obscured = true;
        }).then(function (r) {
          if (!r.ok) {
            return { ok: false, err: "true item data was saved, but the bag update failed — the item is NOT yet obscured. Try again." };
          }
          // Player-visible log: the surface text is fine to name, the true
          // name never is.
          return PT.store.appendLog(env, "obscured an item in “" + bagName + "” — players now see “" + surfaceDesc + "”")
            .then(function () { return { ok: true }; });
        });
      });
    });
  };

  // INV-16b: reveals an item's true nature in one DM action. Write order:
  //   (a) FIRST restore every stored field onto the visible item
  //   (b) ONLY THEN remove the GM index's copy
  // If restore (a) fails, the GM-index copy is untouched — the DM can just
  // try again, the true data was never at risk. Removing the copy first
  // would risk the opposite: a failed restore leaving the item stuck showing
  // the surface text with the only copy of its true data gone.
  PT.store.revealItem = function (env, bagId, bagName, itemId) {
    if (!env.isGM) return Promise.resolve({ ok: false, err: "DM only" });
    if (!st.gmIndexH) return Promise.resolve({ ok: false, err: "GM index not available" });
    return PT.store.readDoc(st.gmIndexH).then(function (gmDoc) {
      var truth = gmDoc && gmDoc.obscured && gmDoc.obscured[itemId];
      if (!truth) return { ok: false, err: "no hidden data found for this item — it may already be revealed" };
      // (a) FIRST.
      return mutateBag(bagId, function (doc) {
        var it = (doc.items || []).filter(function (i) { return i.id === itemId; })[0];
        if (!it) return false;
        it.name = truth.name;
        it.description = truth.description;
        it.cost = truth.cost;
        it.weight = truth.weight;
        it.rarity = truth.rarity;
        it.itemType = truth.itemType;
        it.pagename = truth.pagename;
        it.expansionId = truth.expansionId;
        it.datarecords = truth.datarecords;
        delete it.obscured;
      }).then(function (r) {
        if (!r.ok) {
          return { ok: false, err: "couldn't restore the item — it's still obscured. The true data is still safely stored; try again." };
        }
        // (b) ONLY NOW clean up the GM index. This log message is allowed to
        // name the item — revealing is the whole point (INV-16b).
        return writeMerged(st.gmIndexH, function (gmDoc2) {
          if (!gmDoc2 || !gmDoc2.partyToolsGmIndex) return null;
          if (!gmDoc2.obscured || !gmDoc2.obscured[itemId]) return null;
          delete gmDoc2.obscured[itemId];
          return gmDoc2;
        }).then(function (cleanupRes) {
          if (!cleanupRes.ok) PT.log("revealItem: GM-index cleanup for " + itemId + " did not confirm (harmless leftover, not player-visible): " + cleanupRes.err);
          return PT.store.appendLog(env, "revealed the true nature of “" + truth.name + "” in “" + bagName + "”")
            .then(function () { return { ok: true, name: truth.name }; });
        });
      });
    });
  };

  // ---- currency -------------------------------------------------------------
  PT.store.changePurse = function (env, bagId, bagName, deltas, reason) {
    var applied = null;
    return mutateBag(bagId, function (doc) {
      doc.purse = doc.purse || {};
      var next = {};
      PT.DENOMS.forEach(function (d) { next[d] = (Number(doc.purse[d]) || 0) + (Number(deltas[d]) || 0); });
      if (PT.DENOMS.some(function (d) { return next[d] < 0; })) return false; // never go negative
      doc.purse = next;
      applied = PT.DENOMS.filter(function (d) { return Number(deltas[d]); })
        .map(function (d) { return (deltas[d] > 0 ? "+" : "") + deltas[d] + " " + d; }).join(", ");
    }).then(function (r) {
      if (r.ok && applied) {
        PT.store.appendLog(env, "coins in “" + bagName + "”: " + applied + (reason ? " (" + reason + ")" : ""));
      } else if (r.unchanged && !applied) {
        // the mutation refused to apply: taking out more than the purse holds
        return { ok: false, err: "not enough coins in the purse for that" };
      }
      return r;
    });
  };

  // ---- coin splitting (INV-20a..h) -------------------------------------------
  // opts: { whole: bool, specific: {pp,gp,ep,sp,cp}, recipients: [name, ...] }
  // Everything happens in ONE mutateBag call (INV-20f: one log entry, not
  // one write per recipient): the split amount converts to copper (INV-20c),
  // divides evenly by recipient count, the undivided remainder — plus, for a
  // specific-amount split, whatever coin wasn't part of the split — stays in
  // the purse (INV-20d). The same write also records the fallback "assigned
  // to a character" note (INV-20g/h), since sheet writing doesn't exist yet:
  // the coin still leaves the purse so the party's total wealth isn't
  // double-counted, but stays visible as owed until a player marks it taken.
  //
  // Guard: mutateBag's fn always sees the CURRENT doc, re-read fresh on every
  // attempt (writeMerged's verify-and-retry). If the purse no longer covers
  // the amount that was previewed — someone spent it, or split it again,
  // in the meantime — this returns false, which surfaces as {unchanged:true}
  // with nothing written, and the caller reports it rather than guessing.
  PT.store.splitCoins = function (env, bagId, bagName, opts) {
    var recipients = (opts && opts.recipients) || [];
    var n = recipients.length;
    var result = null;
    // One id for this split attempt, stamped on every assignment it writes.
    // writeMerged retries when its confirmation read looks stale — including
    // the case where the write DID land. Without this marker the retry would
    // re-run the mutation against a doc that already contains the split and
    // deduct the coins a second time. Money must be exactly-once.
    var splitId = PT.uid();
    var alreadyApplied = false;
    return mutateBag(bagId, function (doc) {
      if ((doc.assignments || []).some(function (a) { return a.splitId === splitId; })) {
        alreadyApplied = true;
        return false;
      }
      doc.purse = doc.purse || {};
      var cur = doc.purse;
      var deduct = {};
      if (opts.whole) {
        PT.DENOMS.forEach(function (d) { deduct[d] = Number(cur[d]) || 0; });
      } else {
        var enough = PT.DENOMS.every(function (d) {
          deduct[d] = Number(opts.specific[d]) || 0;
          return (Number(cur[d]) || 0) >= deduct[d];
        });
        if (!enough) return false;
      }
      var totalCp = PT.DENOMS.reduce(function (sum, d) { return sum + deduct[d] * PT.COPPER_VALUE[d]; }, 0);
      if (totalCp <= 0 || n <= 0) return false;
      var perCp = Math.floor(totalCp / n);
      var remCp = totalCp - perCp * n;
      PT.DENOMS.forEach(function (d) { cur[d] = (Number(cur[d]) || 0) - deduct[d]; });
      cur.cp = (Number(cur.cp) || 0) + remCp;
      doc.assignments = doc.assignments || [];
      var label = PT.coinLabel(PT.copperToGpMax(perCp));
      recipients.forEach(function (name) {
        doc.assignments.push({ id: PT.uid(), splitId: splitId, to: name, cp: perCp, label: label, t: Date.now(), by: env.playerName });
      });
      result = { totalCp: totalCp, perCp: perCp, remCp: remCp, label: label };
    }).then(function (r) {
      // The split landed on an earlier attempt; the retry correctly declined
      // to apply it again. That is success, not a collision.
      if (alreadyApplied) return { ok: true, result: result, deduped: true };
      if (r.unchanged) return { ok: false, err: "The purse changed while you were previewing — try again." };
      if (!r.ok || !result) return r;
      var verb = n === 1 ? " gets " : " get ";
      var wayWord = n === 1 ? " way: " : " ways: ";
      var msg = "split " + result.totalCp.toLocaleString() + " cp of “" + bagName + "” " + n + wayWord +
        recipients.join(", ") + verb + result.label + (n === 1 ? "" : " each") + "; " + result.remCp + " cp stays in the purse";
      return PT.store.appendLog(env, msg).then(function () { return { ok: true, result: result }; });
    });
  };

  // Removes one assignment record once a player confirms they've taken the
  // coin off the note (mirrors the item fallback in INV-24). Not a coin
  // mutation — the coin already left the purse when the split was confirmed.
  PT.store.transferAssignment = function (env, bagId, bagName, assignmentId) {
    var removed = null;
    return mutateBag(bagId, function (doc) {
      var a = (doc.assignments || []).filter(function (x) { return x.id === assignmentId; })[0];
      if (!a) return false;
      removed = a;
      doc.assignments = doc.assignments.filter(function (x) { return x.id !== assignmentId; });
    }).then(function (r) {
      if (r.ok && removed) {
        return PT.store.appendLog(env, env.playerName + " marked " + removed.to + "’s " + removed.label + " as transferred")
          .then(function () { return r; });
      }
      return r;
    });
  };
})(window.PartyTools);
