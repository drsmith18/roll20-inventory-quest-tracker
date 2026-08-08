// SPIKE S2 part 4 — DM window. **CHANGES A CHARACTER SHEET.**
// Target: "Spike Warm" only. Keep its character sheet CLOSED while this runs.
//
// What it does, in order:
//   1. Backs the entire current store up into a GM-only handout
//      "SPIKE-S2-BACKUP" and VERIFIES the backup before changing anything.
//      (Handout, not a JS variable, so the backup survives a page reload.)
//   2. Adds one plain Item integrant, "Spike Test Rope", as a sibling of the
//      character's existing top-level items, and registers it in its parent's
//      childIDs (which is a STRING containing a JSON array, not an array).
//   3. Sets the gold currency integrant's `value` to 7 (from whatever it was,
//      reported before the change).
//   4. Writes the store back, bumps `updateId`, verifies by re-read.
// Undo: restore.js.
(function () {
  var NEWID = "SPIKE-ROPE-TEST-00001";
  var GOLD_TO = 7;
  var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === "Spike Warm"; });
  if (cs.length !== 1) { console.log("ABORT: expected 1 'Spike Warm', found " + cs.length); return; }
  var ch = cs[0];
  var A = function (n) { return ch.attribs.models.filter(function (a) { return a.get("name") === n; })[0]; };
  var st = A("store"), uid = A("updateId");
  if (!st) { console.log("ABORT: store not loaded — run background-load.js first"); return; }

  var original = JSON.parse(JSON.stringify(st.get("current")));   // deep copy, untouched
  var next = JSON.parse(JSON.stringify(original));                // deep copy, to modify
  var ints = next.integrants.integrants;
  if (ints[NEWID]) { console.log("ABORT: " + NEWID + " already exists — run restore.js first"); return; }

  // Where do top-level items hang? Find an Item whose parent is not an Item.
  var itemIds = Object.keys(ints).filter(function (k) { return ints[k].type === "Item"; });
  var topLevel = itemIds.filter(function (k) {
    var p = ints[ints[k].parentID];
    return !p || p.type !== "Item";
  });
  if (!topLevel.length) { console.log("ABORT: could not identify a top-level item to copy placement from"); return; }
  var rootId = ints[topLevel[0]].parentID;
  console.log("placing rope under parentID " + JSON.stringify(rootId) +
    " (same as top-level item '" + ints[topLevel[0]].name + "')" +
    " | that parent " + (ints[rootId] ? "IS an integrant of type " + ints[rootId].type : "is NOT an integrant (character root)"));

  var goldBefore = ints.gold ? ints.gold.value : "(no gold integrant)";
  console.log("gold value before: " + JSON.stringify(goldBefore));

  // --- step 1: back up, and do not proceed unless the backup verifies ---
  var backupText = JSON.stringify(original);
  var bh = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S2-BACKUP"; })[0]
        || Campaign.handouts.create({ name: "SPIKE-S2-BACKUP", archived: false });
  setTimeout(function () {
    bh.updateBlobs({ notes: backupText });
    setTimeout(function () {
      bh._getLatestBlob("notes", function (b) {
        if (!b || b.length !== backupText.length) {
          console.log("ABORT: backup did not verify (" + (b ? b.length : 0) + " of " +
            backupText.length + " chars). Nothing was changed.");
          return;
        }
        console.log("PASS(backup): " + b.length + " chars stored in handout SPIKE-S2-BACKUP");
        applyChanges();
      });
    }, 4000);
  }, 1000);

  function applyChanges() {
    // --- step 2: the new item ---
    ints[NEWID] = {
      _enabled: true,
      _id: NEWID,
      childIDs: "[]",
      cost: "1 GP",
      createdTime: Date.now(),
      description: "Spike test item written by the extension prototype. Safe to delete.",
      equipData: { equippable: false },
      label: "",
      name: "Spike Test Rope",
      parentID: rootId,
      quantity: 1,
      rarity: "",
      recordName: "Spike Test Rope",
      shortID: "spk" + Math.random().toString(36).slice(2, 8),
      source: "Item",
      sourceID: "",
      tempShopData: { compendiumUrl: "", useCompendiumLink: false },
      type: "Item",
      weight: 5
    };
    // register with the parent — childIDs is a STRING holding a JSON array
    if (ints[rootId]) {
      var kids;
      try { kids = JSON.parse(ints[rootId].childIDs || "[]"); }
      catch (e) { console.log("ABORT: parent childIDs is not parseable JSON: " + JSON.stringify(ints[rootId].childIDs)); return; }
      kids.push(NEWID);
      ints[rootId].childIDs = JSON.stringify(kids);
      console.log("registered in parent's childIDs (now " + kids.length + " children)");
    } else {
      console.log("parent is not an integrant — no childIDs registration needed");
    }

    // --- step 3: the coin change ---
    if (ints.gold) ints.gold.value = GOLD_TO;

    // --- step 4: write, bump updateId, verify ---
    var newUid = "spike" + Math.random().toString(36).slice(2, 12);
    try {
      st.save({ current: next });
      if (uid) uid.save({ current: newUid });
    } catch (e) { console.log("FAIL(write): threw: " + e.message); return; }
    console.log("store written, updateId bumped to " + newUid + " — verifying in 5s...");
    setTimeout(function () {
      var back = st.get("current");
      var bi = back && back.integrants && back.integrants.integrants;
      var ropeOk = !!(bi && bi[NEWID]);
      var goldOk = !!(bi && bi.gold && bi.gold.value === GOLD_TO);
      console.log((ropeOk ? "PASS" : "FAIL") + "(data-rope): rope integrant present in store = " + ropeOk);
      console.log((goldOk ? "PASS" : "FAIL") + "(data-gold): gold value now " +
        (bi && bi.gold ? bi.gold.value : "?") + " (wanted " + GOLD_TO + ")");
      console.log("--- NOW OPEN 'Spike Warm's character sheet and look. ---");
      console.log("Report: (a) does 'Spike Test Rope' appear in inventory? (b) does gold show " +
        GOLD_TO + "? (c) did the sheet load normally or complain?");
    }, 5000);
  }
})();
