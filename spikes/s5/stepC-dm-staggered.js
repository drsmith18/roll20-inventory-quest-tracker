// SPIKE S5b — Step C — DM window — run FIRST, then Step D in the player
// window within ~30 seconds.
// Tiebreaker for the S5 result (all GM lines lost): rounds 0-2 are STAGGERED
// (player writes 3s after the GM), rounds 3-5 are SIMULTANEOUS. Every write
// self-checks 1.5s later, so "my write never landed" and "my write landed
// and was overwritten" are distinguishable.
// CHANGES DATA: rewrites SPIKE-S1-R2's notes repeatedly.
(function () {
  var LABEL = "GM";
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  var start = Date.now() + 30000;
  h.updateBlobs({ notes: "S5B-BASE-" + start });
  console.log("S5b rounds start at " + new Date(start).toLocaleTimeString() +
    " — run Step D in the PLAYER window now, then leave BOTH windows visible on screen.");
  function doRound(round) {
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
    }, start + round * 10000 - Date.now());
  }
  for (var i = 0; i < 6; i++) doRound(i);
  setTimeout(function () {
    h._getLatestBlob("notes", function (body) {
      var out = ["RESULT-S5B(" + LABEL + " view): rounds 0-2 staggered (player +3s), rounds 3-5 simultaneous"];
      for (var r = 0; r < 6; r++) out.push("round " + r + ": GM " +
        ((body || "").indexOf("GM-r" + r + "-") !== -1 ? "survived" : "MISSING") + ", PLAYER " +
        ((body || "").indexOf("PLAYER-r" + r + "-") !== -1 ? "survived" : "MISSING"));
      console.log(out.join("\n"));
      console.log("final body:\n" + body);
    });
  }, start + 58000 - Date.now());
})();
