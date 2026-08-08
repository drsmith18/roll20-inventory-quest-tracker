// SPIKE S3 part 3 — DM window. READ-ONLY.
// Calls the same-origin resolution endpoint the VTT itself uses on drop
// (/compendium/compendium/getPages), observed in part 1's capture:
//   1. the real 2014 Items:Longsword (part 2 accidentally dragged the
//      identically-named Proficiencies entry),
//   2. a 2024 item absent from the free rules (miss shape),
//   3. a nonexistent page (failure shape).
// pagename is passed exactly as it appears in data-pagename (already
// percent-encoded once) and encoded once more, matching the observed
// double-encoding (Items%253ALongsword).
(function () {
  function resolve(pagenameAttr, expansionId, label) {
    var url = "/compendium/compendium/getPages?bookName=dnd5e&pages%5B%5D=" +
      encodeURIComponent(pagenameAttr) +
      "&sharedCompendium=" + window.campaign_id +
      "&expansionId=" + expansionId + "&dragDropRequest=true&_=" + Date.now();
    fetch(url, { credentials: "same-origin" })
      .then(function (r) { return r.text().then(function (t) { return { s: r.status, t: t }; }); })
      .then(function (res) {
        console.log("=== " + label + " (HTTP " + res.s + ") ===");
        console.log(res.t.slice(0, 1500) + (res.t.length > 1500 ? " ...(" + res.t.length + " chars total)" : ""));
      })
      .catch(function (e) { console.log("=== " + label + " FAILED: " + e.message); });
  }
  resolve("Items%3ALongsword", 34047, "A: 2014 Items:Longsword");
  resolve("Items%3AVorpal Sword", 33335, "B: 2024 Items:Vorpal Sword (not in free rules — expect a miss)");
  resolve("Items%3ATotally Fake Item", 33335, "C: nonexistent page (failure shape)");
})();
