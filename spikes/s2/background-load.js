// SPIKE S2 part 1 — DM window. Run AFTER RELOADING the page and BEFORE
// opening any character sheet. READ-ONLY (attaches a live sync to the
// attribs collection; writes nothing).
// Question: can a client load an existing character's data without the
// sheet ever being opened? Target: Spike Warm, whose data exists server-side
// but is not loaded in a fresh client.
(function () {
  var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === "Spike Warm"; });
  if (cs.length !== 1) { console.log("FAIL: Spike Warm not found (" + cs.length + ")"); return; }
  var c = cs[0];
  console.log("attribs loaded before: " + c.attribs.length);
  console.log("existing backboneFirebase: " + !!c.attribs.backboneFirebase +
    " | collection url: " + (typeof c.attribs.url === "function" ? c.attribs.url() : c.attribs.url));
  if (c.attribs.length > 0) console.log("NOTE: attribs already loaded — did the sheet get opened since reload?");
  if (!c.attribs.backboneFirebase) {
    try {
      c.attribs.backboneFirebase = new BackboneFirebase(c.attribs);
      console.log("BackboneFirebase attached — watching for attribute arrival...");
    } catch (e) { console.log("FAIL(attach): " + e.message); return; }
  }
  [1, 3, 6, 10].forEach(function (t) {
    setTimeout(function () {
      console.log("after " + t + "s: attribs loaded = " + c.attribs.length +
        (c.attribs.length ? " (" + c.attribs.models.map(function (a) { return a.get("name"); }).join(", ") + ")" : ""));
    }, t * 1000);
  });
})();
