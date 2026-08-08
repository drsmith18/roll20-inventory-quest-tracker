// SPIKE S1 rerun — Step 6 of 6 — DM window. Read-only.
// Verdict on read-only enforcement: did the player's forbidden write from
// Step 5 reach the game's data?
(function () {
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  setTimeout(function () {
    h._getLatestBlob("notes", function (b) {
      var leaked = (b || "").indexOf("PLAYER-READONLY-R2") !== -1;
      console.log(leaked
        ? "FAIL(enforcement): the read-only player's write REACHED the game. Body: " + b
        : "PASS(enforcement): read-only player's write did not propagate. Body: " + JSON.stringify(b));
      console.log("S1 rerun complete. Paste all output from both windows back to Claude. Keep the handout for S5.");
    });
  }, 2000);
})();
