// SPIKE S1 rerun — Step 0 of 6 — DM window.
// Deletes ALL handouts whose name starts with "SPIKE-S1" so the rerun starts
// clean. CHANGES DATA: deletes spike test handouts only, nothing else.
(function () {
  var doomed = Campaign.handouts.models.filter(function (x) {
    return /^SPIKE-S1/.test(x.get("name") || "");
  });
  console.log("Found " + doomed.length + " spike handout(s): " +
    doomed.map(function (x) { return x.get("name") + " (" + x.id + ")"; }).join(", "));
  doomed.forEach(function (x) { x.destroy(); });
  setTimeout(function () {
    var left = Campaign.handouts.models.filter(function (x) {
      return /^SPIKE-S1/.test(x.get("name") || "");
    });
    console.log(left.length === 0
      ? "PASS(cleanup): all spike handouts deleted. Run Step 1."
      : "FAIL(cleanup): " + left.length + " still present: " +
        left.map(function (x) { return x.id; }).join(", "));
  }, 2000);
})();
