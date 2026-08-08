// SPIKE S2 recon — DM window only. READ-ONLY.
// Prerequisite: two characters exist in the test game:
//   "Spike Cold" — created but its Character Sheet tab NEVER opened
//   "Spike Warm" — sheet opened once, one inventory item and some gold
//                  added by hand through the sheet UI
// Dumps each character's attribute state and available model methods, to
// establish what lazy-loading looks like and what the loaded rows are named.
(function () {
  ["Spike Cold", "Spike Warm"].forEach(function (name) {
    var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === name; });
    if (cs.length !== 1) { console.log("FAIL(" + name + "): found " + cs.length + " characters with that name"); return; }
    var c = cs[0];
    console.log("=== " + name + " (id " + c.id + ") ===");
    console.log("charactersheetname: " + c.get("charactersheetname") +
      " | expansion: " + JSON.stringify(c.get("expansion")) +
      " | character_type: " + JSON.stringify(c.get("character_type")));
    console.log("attribs loaded in this client: " + c.attribs.length);
    console.log("methods present on the character model: " +
      ["updateBlobs", "_getLatestBlob", "getAttribs", "loadAttribs", "attribsLoaded"]
        .filter(function (k) { return typeof c[k] !== "undefined"; }).join(", ") || "(none of the guessed names)");
    console.log("own keys on the attribs collection: " + Object.keys(c.attribs).join(", "));
    if (c.attribs.length > 0) {
      console.log("first 40 attribs (name = current):");
      c.attribs.models.slice(0, 40).forEach(function (a) {
        console.log("  " + a.get("name") + " = " + JSON.stringify(a.get("current")).slice(0, 80));
      });
    }
  });
})();
