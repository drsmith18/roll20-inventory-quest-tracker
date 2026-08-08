// SPIKE S4b — DM window. Corrects a flaw in probe.js: the original verified
// against the local cache instantly, which cannot detect a server rejection
// (S1 showed rejected writes revert within a few seconds). This writes 8MB
// once, waits 12 seconds, then verifies.
// CHANGES DATA: one temporary handout, deleted at the end.
(function () {
  var h = Campaign.handouts.create({ name: "SPIKE-S4B", archived: false });
  var n = 8000000;
  var msgs = [];
  var ow = console.warn, oe = console.error;
  function hook(orig) {
    return function () {
      var s = Array.prototype.slice.call(arguments).join(" ");
      if (/firebase/i.test(s)) msgs.push(s.slice(0, 200));
      return orig.apply(console, arguments);
    };
  }
  console.warn = hook(ow); console.error = hook(oe);
  setTimeout(function () {
    h.updateBlobs({ notes: "Y".repeat(n) });
    console.log("8,000,000 chars written; waiting 12s before verifying...");
    setTimeout(function () {
      h._getLatestBlob("notes", function (b) {
        console.warn = ow; console.error = oe;
        console.log((b && b.length === n ? "PASS" : "FAIL") + "(S4b): length after 12s = " + (b ? b.length : 0));
        console.log(msgs.length ? "firebase messages:\n" + msgs.join("\n") : "no firebase messages");
        try { h.destroy(); console.log("SPIKE-S4B deleted."); }
        catch (e) { console.log("delete failed (" + e.message + ") — remove SPIKE-S4B from the journal by hand."); }
      });
    }, 12000);
  }, 1500);
})();
