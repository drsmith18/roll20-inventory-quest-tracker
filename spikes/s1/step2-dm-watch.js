// SPIKE S1 — Step 2 of 6 — run in the DM window's console. Read-only.
// Watches SPIKE-S1's notes for the player's marker and reports how fast it
// arrived, WITHOUT reloading the page. Watches for up to 2 minutes.
(function () {
  var h = Campaign.handouts.find(function (x) { return x.get("name") === "SPIKE-S1"; });
  if (!h) { console.log("FAIL(watch): SPIKE-S1 not found — did Step 1 pass?"); return; }
  var read = function (cb) {
    if (h._getLatestBlob) h._getLatestBlob("notes", cb);
    else cb(h.get("notes"));
  };
  var t0 = Date.now();
  var timer = setInterval(function () {
    read(function (body) {
      var m = /PLAYER-WROTE-(\d+)/.exec(body || "");
      if (m) {
        clearInterval(timer);
        console.log("PASS(sync): player's edit visible in DM window ~" +
          (Date.now() - Number(m[1])) + " ms after the player wrote it. Body: " + body);
      } else if (Date.now() - t0 > 120000) {
        clearInterval(timer);
        console.log("FAIL(sync): no player edit seen within 2 minutes. Last body seen: " +
          JSON.stringify(body));
      }
    });
  }, 1000);
  console.log("Watching... now run Step 3 in the PLAYER window. A PASS/FAIL line will appear here by itself.");
})();
