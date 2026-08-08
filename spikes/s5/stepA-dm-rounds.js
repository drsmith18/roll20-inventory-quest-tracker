// SPIKE S5 — Step A — DM window — run FIRST, then Step B in the player
// window within ~30 seconds.
// Re-grants the player edit rights on SPIKE-S1-R2, resets its notes, then
// appends one line at 6 synchronized instants, 10s apart. The player client
// does the same at the same instants; lost lines reveal how Roll20 handles
// simultaneous writes (SYS-7).
// CHANGES DATA: rewrites SPIKE-S1-R2's notes repeatedly.
(function () {
  var LABEL = "GM";
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  var me = window.d20_player_id;
  var others = Campaign.players.models.filter(function (p) { return p.id !== me; });
  if (others.length !== 1) { console.log("FAIL(setup): expected 1 other player, found " + others.length); return; }
  h.save({ controlledby: others[0].id });
  console.log("Edit re-granted to " + others[0].get("displayname"));
  var start = Date.now() + 30000;
  h.updateBlobs({ notes: "S5-BASE-" + start });
  console.log("Rounds start at " + new Date(start).toLocaleTimeString() +
    " — run Step B in the PLAYER window now.");
  var deniedCount = 0, origWarn = console.warn;
  console.warn = function () {
    if (Array.prototype.slice.call(arguments).join(" ").indexOf("permission_denied") !== -1) deniedCount++;
    return origWarn.apply(console, arguments);
  };
  for (var i = 0; i < 6; i++) (function (round) {
    setTimeout(function () {
      h._getLatestBlob("notes", function (body) {
        var line = LABEL + "-r" + round + "-" + Date.now();
        h.updateBlobs({ notes: (body || "") + "\n" + line });
        console.log("appended: " + line);
      });
    }, start + round * 10000 - Date.now());
  })(i);
  setTimeout(function () {
    h._getLatestBlob("notes", function (body) {
      console.warn = origWarn;
      var out = ["RESULT(" + LABEL + " view): permission_denied warnings: " + deniedCount];
      for (var r = 0; r < 6; r++) out.push("round " + r + ": GM " +
        ((body || "").indexOf("GM-r" + r + "-") !== -1 ? "survived" : "MISSING") + ", PLAYER " +
        ((body || "").indexOf("PLAYER-r" + r + "-") !== -1 ? "survived" : "MISSING"));
      console.log(out.join("\n"));
      console.log("final body:\n" + body);
    });
  }, start + 58000 - Date.now());
})();
