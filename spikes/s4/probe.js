// SPIKE S4 — DM window only. Probes the practical handout body size limit.
// Creates a GM-only handout "SPIKE-S4", writes progressively larger bodies
// (10 KB up to 8 MB), verifies each by re-read with a 20s timeout, reports
// the first size that fails, then deletes the handout.
// CHANGES DATA: one temporary handout, deleted at the end. The page may lag
// noticeably during the multi-megabyte writes; if the game hangs, reload —
// worst case a "SPIKE-S4" handout is left behind to delete by hand.
(function () {
  var sizes = [10000, 100000, 400000, 1000000, 2000000, 4000000, 8000000];
  var firebaseMsgs = [];
  var ow = console.warn, oe = console.error;
  function hook(orig) {
    return function () {
      var s = Array.prototype.slice.call(arguments).join(" ");
      if (/firebase/i.test(s)) firebaseMsgs.push(s.slice(0, 200));
      return orig.apply(console, arguments);
    };
  }
  console.warn = hook(ow); console.error = hook(oe);
  var h = Campaign.handouts.create({ name: "SPIKE-S4", archived: false });
  var i = 0;
  function finish(msg) {
    console.warn = ow; console.error = oe;
    console.log("RESULT(S4): " + msg);
    if (firebaseMsgs.length) console.log("firebase messages seen:\n" + firebaseMsgs.slice(0, 5).join("\n"));
    else console.log("no firebase warnings/errors seen");
    try { h.destroy(); console.log("SPIKE-S4 handout deleted."); }
    catch (e) { console.log("could not delete SPIKE-S4 (" + e.message + ") — delete it from the journal by hand."); }
  }
  function tryNext() {
    if (i >= sizes.length) { finish("no ceiling found up to 8,000,000 characters"); return; }
    var n = sizes[i];
    var body = "X".repeat(n);
    try { h.updateBlobs({ notes: body }); }
    catch (e) { finish("write THREW at " + n + " chars: " + e.message); return; }
    var t0 = Date.now();
    (function poll() {
      h._getLatestBlob("notes", function (b) {
        if (b && b.length === n) {
          console.log("PASS(size " + n + "): verified in " + (Date.now() - t0) + " ms");
          i++;
          setTimeout(tryNext, 1000);
        } else if (Date.now() - t0 > 20000) {
          finish("FAILED at " + n + " chars — re-read length " + (b ? b.length : 0) +
            " after 20s. Practical ceiling is the previous PASS size.");
        } else {
          setTimeout(poll, 2000);
        }
      });
    })();
  }
  setTimeout(tryNext, 1500);
})();
