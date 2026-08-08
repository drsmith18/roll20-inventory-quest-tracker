// SPIKE S1 rerun — Step 2 of 6 — DM window. Read-only.
// Watches SPIKE-S1-R2 for the player's rerun-specific marker and measures
// arrival time. Stale markers from run 1 cannot match. Watches 2 minutes.
(function () {
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  console.log("Watching handout id " + h.id);
  var t0 = Date.now();
  var timer = setInterval(function () {
    h._getLatestBlob("notes", function (body) {
      var m = /PLAYER-WROTE-R2-(\d+)/.exec(body || "");
      if (m) {
        clearInterval(timer);
        console.log("PASS(sync): player's edit visible in DM window ~" +
          (Date.now() - Number(m[1])) + " ms after the player wrote it. Body: " + body);
      } else if (Date.now() - t0 > 120000) {
        clearInterval(timer);
        console.log("FAIL(sync): no player edit within 2 minutes. Last body: " + JSON.stringify(body));
      }
    });
  }, 1000);
  console.log("Watching... run Step 3 in the PLAYER window now. Result appears here by itself.");
})();
