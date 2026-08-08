// SPIKE S1 — Step 1 of 6 — run in the DM window's console.
// Creates a handout named "SPIKE-S1", shared with the player account with
// view AND edit rights, and writes a secret into its gmnotes for the S1b test.
// CHANGES DATA: adds one handout to this game. Delete it from the journal when done.
(function () {
  var me = window.d20_player_id;
  var others = Campaign.players.models.filter(function (p) { return p.id !== me; });
  if (others.length !== 1) {
    console.log("FAIL(setup): expected exactly 1 other player, found " + others.length + ": " +
      others.map(function (p) { return p.get("displayname"); }).join(", "));
    return;
  }
  var pid = others[0].id;
  console.log("Sharing with player: " + others[0].get("displayname") + " (id " + pid + ")");
  var h;
  try {
    h = Campaign.handouts.create({
      name: "SPIKE-S1",
      inplayerjournals: pid,   // player can SEE it
      controlledby: pid,       // player can EDIT it
      archived: false
    });
  } catch (e) { console.log("FAIL(setup): create threw: " + e.message); return; }
  // notes/gmnotes are stored as "blobs"; give the model a moment, then write both.
  setTimeout(function () {
    try {
      if (h.updateBlobs) h.updateBlobs({ notes: "GM-INITIAL", gmnotes: "GM-SECRET-XYZZY" });
      else h.save({ notes: "GM-INITIAL", gmnotes: "GM-SECRET-XYZZY" });
      console.log("PASS(setup): handout created, id=" + h.id +
        " | blob writer used: " + (h.updateBlobs ? "updateBlobs" : "save"));
      console.log("Now run Step 2 in this same DM window.");
    } catch (e) { console.log("FAIL(setup): blob write threw: " + e.message); }
  }, 1500);
})();
