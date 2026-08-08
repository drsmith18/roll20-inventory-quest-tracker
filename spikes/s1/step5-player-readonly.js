// SPIKE S1 — Step 5 of 6 — run in the PLAYER window's console.
// Attempts a write WITHOUT edit rights, to see what read-only failure looks
// like. If Roll20 fails to block it, that itself is the finding — Step 6 in
// the DM window is what decides, since the player's own view can lie.
(function () {
  var h = Campaign.handouts.find(function (x) { return x.get("name") === "SPIKE-S1"; });
  if (!h) { console.log("FAIL: SPIKE-S1 not found in player client"); return; }
  var read = function (cb) {
    if (h._getLatestBlob) h._getLatestBlob("notes", cb);
    else cb(h.get("notes"));
  };
  var marker = "PLAYER-READONLY-ATTEMPT-" + Date.now();
  console.log("Attempting forbidden write with marker: " + marker);
  try {
    if (h.updateBlobs) h.updateBlobs({ notes: marker });
    else h.save({ notes: marker });
    console.log("write call did not throw (silence is not success — Step 6 decides)");
  } catch (e) { console.log("write threw immediately: " + e.message); }
  setTimeout(function () {
    read(function (b) {
      console.log("player re-read after 3s: " + JSON.stringify(b) +
        " | marker " + ((b || "").indexOf(marker) !== -1 ? "PRESENT in player's own view" : "absent in player's own view"));
      console.log("Now run Step 6 in the DM window.");
    });
  }, 3000);
})();
