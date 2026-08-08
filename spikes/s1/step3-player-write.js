// SPIKE S1 rerun — Step 3 of 6 — PLAYER window (incognito).
// (a) S1b: reads gmnotes both ways — PASS means the PLUGH secret is NOT visible.
// (b) Writes a rerun-specific marker to notes and verifies it, with Firebase
//     permission_denied warnings surfaced as readable lines.
// CHANGES DATA: overwrites SPIKE-S1-R2's notes.
(function () {
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length + " — tell Claude."); return; }
  var h = hs[0];
  console.log("Player operating on handout id " + h.id);
  var denied = false, origWarn = console.warn;
  console.warn = function () {
    var s = Array.prototype.slice.call(arguments).join(" ");
    if (s.indexOf("permission_denied") !== -1) {
      denied = true;
      console.log("NOTE: Firebase rejected a write (permission_denied)");
    }
    return origWarn.apply(console, arguments);
  };
  console.log("gmnotes attribute value: " + JSON.stringify(h.get("gmnotes")));
  h._getLatestBlob("gmnotes", function (gm) {
    console.log(((gm || "").indexOf("PLUGH") !== -1 ? "FAIL" : "PASS") +
      "(S1b): gmnotes blob as seen by player = " + JSON.stringify(gm));
    var marker = "PLAYER-WROTE-R2-" + Date.now();
    try { h.updateBlobs({ notes: marker }); }
    catch (e) { console.warn = origWarn; console.log("FAIL(write): threw: " + e.message); return; }
    setTimeout(function () {
      h._getLatestBlob("notes", function (after) {
        console.warn = origWarn;
        if (denied) console.log("FAIL(write): server refused the player's write (permission_denied)");
        else if ((after || "").indexOf(marker) !== -1) console.log("PASS(write): player wrote: " + after);
        else console.log("FAIL(write): no error, but re-read shows " + JSON.stringify(after));
        console.log("Check the DM window for PASS(sync), then run Step 4 there.");
      });
    }, 2500);
  });
})();
