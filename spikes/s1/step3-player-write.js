// SPIKE S1 — Step 3 of 6 — run in the PLAYER window's console (incognito).
// (a) S1b: tries to read the handout's gmnotes — PASS means the secret is NOT visible.
// (b) Writes a timestamped marker into the handout's notes and re-reads it.
// CHANGES DATA: overwrites SPIKE-S1's notes body.
(function () {
  var tries = 0;
  (function findIt() {
    var h = Campaign.handouts.find(function (x) { return x.get("name") === "SPIKE-S1"; });
    if (!h) {
      if (++tries > 15) { console.log("FAIL(visibility): SPIKE-S1 never appeared in the player client after 30s."); return; }
      setTimeout(findIt, 2000); return;
    }
    console.log("PASS(visibility): player client can see SPIKE-S1 (id " + h.id + ")");
    var read = function (field, cb) {
      if (h._getLatestBlob) h._getLatestBlob(field, cb);
      else cb(h.get(field));
    };
    read("gmnotes", function (gm) {
      var leaked = gm && String(gm).indexOf("XYZZY") !== -1;
      console.log((leaked ? "FAIL" : "PASS") + "(S1b gmnotes): player sees gmnotes = " + JSON.stringify(gm));
      read("notes", function (before) {
        console.log("notes before write: " + JSON.stringify(before));
        var marker = "PLAYER-WROTE-" + Date.now();
        try {
          if (h.updateBlobs) h.updateBlobs({ notes: marker });
          else h.save({ notes: marker });
        } catch (e) { console.log("FAIL(write): write threw: " + e.message); return; }
        setTimeout(function () {
          read("notes", function (after) {
            console.log((after || "").indexOf(marker) !== -1
              ? "PASS(write): player wrote and re-read its own marker: " + after
              : "FAIL(write): wrote, but re-read shows: " + JSON.stringify(after));
            console.log("Now check the DM window for the sync result, then run Step 4 there.");
          });
        }, 2000);
      });
    });
  })();
})();
