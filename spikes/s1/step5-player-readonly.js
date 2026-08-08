// SPIKE S1 rerun — Step 5 of 6 — PLAYER window.
// Attempts a write WITHOUT edit rights. A permission_denied NOTE here is the
// EXPECTED outcome. Step 6 in the DM window gives the verdict.
(function () {
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  var denied = false, origWarn = console.warn;
  console.warn = function () {
    var s = Array.prototype.slice.call(arguments).join(" ");
    if (s.indexOf("permission_denied") !== -1) {
      denied = true;
      console.log("NOTE: Firebase rejected the write (permission_denied) — expected at this step");
    }
    return origWarn.apply(console, arguments);
  };
  var marker = "PLAYER-READONLY-R2-" + Date.now();
  console.log("Attempting forbidden write, marker: " + marker);
  try { h.updateBlobs({ notes: marker }); }
  catch (e) { console.log("write threw immediately: " + e.message); }
  setTimeout(function () {
    h._getLatestBlob("notes", function (b) {
      console.warn = origWarn;
      console.log("permission_denied observed: " + denied);
      console.log("player re-read after 3s: " + JSON.stringify(b) + " | marker " +
        ((b || "").indexOf(marker) !== -1 ? "PRESENT in player's own view" : "absent in player's own view"));
      console.log("Now run Step 6 in the DM window.");
    });
  }, 3000);
})();
