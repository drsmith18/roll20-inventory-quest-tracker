// SPIKE S1 — Step 4 of 6 — run in the DM window's console.
// Removes the player's EDIT right on SPIKE-S1 but keeps the VIEW right,
// to set up the read-only test. CHANGES DATA: permissions only.
(function () {
  var h = Campaign.handouts.find(function (x) { return x.get("name") === "SPIKE-S1"; });
  if (!h) { console.log("FAIL(revoke): SPIKE-S1 not found"); return; }
  try {
    h.save({ controlledby: "" });
    console.log("PASS(revoke): edit right removed, view kept (controlledby now empty).");
    console.log("Now run Step 5 in the PLAYER window.");
  } catch (e) { console.log("FAIL(revoke): " + e.message); }
})();
