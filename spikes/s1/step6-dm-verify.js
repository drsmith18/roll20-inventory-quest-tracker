// SPIKE S1 — Step 6 of 6 — run in the DM window's console. Read-only.
// The verdict on read-only enforcement: did the player's forbidden write
// from Step 5 actually reach the game's data?
(function () {
  var h = Campaign.handouts.find(function (x) { return x.get("name") === "SPIKE-S1"; });
  if (!h) { console.log("FAIL: SPIKE-S1 not found"); return; }
  var read = function (cb) {
    if (h._getLatestBlob) h._getLatestBlob("notes", cb);
    else cb(h.get("notes"));
  };
  setTimeout(function () {
    read(function (b) {
      var leaked = (b || "").indexOf("PLAYER-READONLY-ATTEMPT") !== -1;
      console.log(leaked
        ? "FAIL(enforcement): the read-only player's write REACHED the game. Body: " + b
        : "PASS(enforcement): the read-only player's write did not propagate. Body: " + JSON.stringify(b));
      console.log("S1 complete. Paste all console output from both windows back to Claude.");
    });
  }, 2000);
})();
