// SPIKE S2 — UNDO. DM window. Restores "Spike Warm"'s store from the
// SPIKE-S2-BACKUP handout written by write-test.js, exactly as it was.
// Safe to run more than once. Keep the character sheet CLOSED while it runs.
(function () {
  var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === "Spike Warm"; });
  if (cs.length !== 1) { console.log("ABORT: expected 1 'Spike Warm', found " + cs.length); return; }
  var ch = cs[0];
  var A = function (n) { return ch.attribs.models.filter(function (a) { return a.get("name") === n; })[0]; };
  var st = A("store"), uid = A("updateId");
  if (!st) { console.log("ABORT: store not loaded — run background-load.js first"); return; }
  var bh = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S2-BACKUP"; })[0];
  if (!bh) { console.log("ABORT: no SPIKE-S2-BACKUP handout found"); return; }
  bh._getLatestBlob("notes", function (text) {
    if (!text) { console.log("ABORT: backup handout is empty"); return; }
    var orig;
    try { orig = JSON.parse(text); } catch (e) { console.log("ABORT: backup is not valid JSON: " + e.message); return; }
    st.save({ current: orig });
    if (uid) uid.save({ current: "restore" + Math.random().toString(36).slice(2, 10) });
    console.log("restore written (" + text.length + " chars) — verifying in 5s...");
    setTimeout(function () {
      var back = st.get("current");
      var bi = back && back.integrants && back.integrants.integrants;
      var ropeGone = !(bi && bi["SPIKE-ROPE-TEST-00001"]);
      console.log((ropeGone ? "PASS" : "FAIL") + "(restore): test rope removed = " + ropeGone +
        " | gold value = " + (bi && bi.gold ? bi.gold.value : "?"));
      console.log("Open the sheet to confirm it looks as it did before. " +
        "The SPIKE-S2-BACKUP handout can be deleted from the journal once you're happy.");
    }, 5000);
  });
})();
