// SPIKE S1 rerun — Step 4 of 6 — DM window.
// Removes the player's EDIT right on SPIKE-S1-R2, keeps the VIEW right.
// CHANGES DATA: permissions only.
(function () {
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  try {
    hs[0].save({ controlledby: "" });
    console.log("PASS(revoke): edit removed, view kept, on handout id " + hs[0].id);
    console.log("Now run Step 5 in the PLAYER window.");
  } catch (e) { console.log("FAIL(revoke): " + e.message); }
})();
