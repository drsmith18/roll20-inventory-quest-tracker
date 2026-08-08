// SPIKE S5b — Step D — PLAYER window — run within ~30 seconds of Step C.
// Rounds 0-2: this client writes 3s AFTER the GM (staggered). Rounds 3-5:
// same instant as the GM (simultaneous). Self-checks 1.5s after each write.
// CHANGES DATA: rewrites SPIKE-S1-R2's notes repeatedly.
(function () {
  var LABEL = "PLAYER";
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  h._getLatestBlob("notes", function (base) {
    var m = /S5B-BASE-(\d+)/.exec(base || "");
    if (!m) { console.log("FAIL(s5b): start marker not found — run Step C in the DM window first, wait 3s, rerun this."); return; }
    var start = Number(m[1]);
    console.log("Synchronised. Leave BOTH windows visible on screen.");
    function doRound(round) {
      var at = start + round * 10000 + (round < 3 ? 3000 : 0);
      if (at < Date.now() + 1500) { console.log("round " + round + ": skipped (late start)"); return; }
      setTimeout(function () {
        h._getLatestBlob("notes", function (body) {
          var line = LABEL + "-r" + round + "-" + Date.now();
          try { h.updateBlobs({ notes: (body || "") + "\n" + line }); }
          catch (e) { console.log("round " + round + ": write THREW: " + e.message); return; }
          console.log("appended: " + line);
          setTimeout(function () {
            h._getLatestBlob("notes", function (b2) {
              console.log("selfcheck r" + round + " (" + LABEL + "): my line " +
                ((b2 || "").indexOf(line) !== -1 ? "PRESENT" : "GONE") + " 1.5s after my write");
            });
          }, 1500);
        });
      }, at - Date.now());
    }
    for (var i = 0; i < 6; i++) doRound(i);
    setTimeout(function () {
      h._getLatestBlob("notes", function (body) {
        var out = ["RESULT-S5B(" + LABEL + " view): rounds 0-2 staggered, rounds 3-5 simultaneous"];
        for (var r = 0; r < 6; r++) out.push("round " + r + ": GM " +
          ((body || "").indexOf("GM-r" + r + "-") !== -1 ? "survived" : "MISSING") + ", PLAYER " +
          ((body || "").indexOf("PLAYER-r" + r + "-") !== -1 ? "survived" : "MISSING"));
        console.log(out.join("\n"));
        console.log("final body:\n" + body);
      });
    }, start + 58000 - Date.now());
  });
})();
