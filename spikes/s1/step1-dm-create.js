// SPIKE S1 rerun — Step 1 of 6 — DM window.
// Creates ONE handout "SPIKE-S1-R2", shared with the player (view + edit),
// with a secret in gmnotes for the S1b test. Refuses to run if one already
// exists. CHANGES DATA: adds one handout.
(function () {
  if (Campaign.handouts.models.some(function (x) { return x.get("name") === "SPIKE-S1-R2"; })) {
    console.log("FAIL(setup): SPIKE-S1-R2 already exists — run Step 0 first.");
    return;
  }
  var me = window.d20_player_id;
  var others = Campaign.players.models.filter(function (p) { return p.id !== me; });
  if (others.length !== 1) {
    console.log("FAIL(setup): expected exactly 1 other player, found " + others.length);
    return;
  }
  var pid = others[0].id;
  var h = Campaign.handouts.create({
    name: "SPIKE-S1-R2",
    inplayerjournals: pid,
    controlledby: pid,
    archived: false
  });
  setTimeout(function () {
    try {
      h.updateBlobs({ notes: "GM-INITIAL-R2", gmnotes: "GM-SECRET-PLUGH" });
      console.log("PASS(setup): created SPIKE-S1-R2, id=" + h.id +
        ", shared with " + others[0].get("displayname"));
      console.log("Now run Step 2 in this same DM window.");
    } catch (e) { console.log("FAIL(setup): blob write threw: " + e.message); }
  }, 1500);
})();
