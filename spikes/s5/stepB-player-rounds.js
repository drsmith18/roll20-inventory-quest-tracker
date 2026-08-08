// SPIKE S5 — Step B — PLAYER window — run within ~30 seconds of Step A.
// Reads the synchronized start time Step A planted in the handout, then
// appends one line at the same 6 instants as the GM client.
// CHANGES DATA: rewrites SPIKE-S1-R2's notes repeatedly.
(function () {
  var LABEL = "PLAYER";
  var hs = Campaign.handouts.models.filter(function (x) { return x.get("name") === "SPIKE-S1-R2"; });
  if (hs.length !== 1) { console.log("FAIL(dup): expected 1 SPIKE-S1-R2, found " + hs.length); return; }
  var h = hs[0];
  h._getLatestBlob("notes", function (base) {
    var m = /S5-BASE-(\d+)/.exec(base || "");
    if (!m) { console.log("FAIL(s5): start marker not found — run Step A in the DM window first, wait 3s, then rerun this."); return; }
    var start = Number(m[1]);
    console.log("Synchronised. Rounds start at " + new Date(start).toLocaleTimeString());
    var deniedCount = 0, origWarn = console.warn;
    console.warn = function () {
      if (Array.prototype.slice.call(arguments).join(" ").indexOf("permission_denied") !== -1) deniedCount++;
      return origWarn.apply(console, arguments);
    };
    var attempted = 0;
    for (var i = 0; i < 6; i++) (function (round) {
      var at = start + round * 10000;
      if (at < Date.now() + 1500) { console.log("round " + round + ": skipped (started too late)"); return; }
      attempted++;
      setTimeout(function () {
        h._getLatestBlob("notes", function (body) {
          var line = LABEL + "-r" + round + "-" + Date.now();
          h.updateBlobs({ notes: (body || "") + "\n" + line });
          console.log("appended: " + line);
        });
      }, at - Date.now());
    })(i);
    setTimeout(function () {
      h._getLatestBlob("notes", function (body) {
        console.warn = origWarn;
        var out = ["RESULT(" + LABEL + " view): attempted " + attempted + " of 6 rounds; permission_denied warnings: " + deniedCount];
        for (var r = 0; r < 6; r++) out.push("round " + r + ": GM " +
          ((body || "").indexOf("GM-r" + r + "-") !== -1 ? "survived" : "MISSING") + ", PLAYER " +
          ((body || "").indexOf("PLAYER-r" + r + "-") !== -1 ? "survived" : "MISSING"));
        console.log(out.join("\n"));
        console.log("final body:\n" + body);
      });
    }, start + 58000 - Date.now());
  });
})();
