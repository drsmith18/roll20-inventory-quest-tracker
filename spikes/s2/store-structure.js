// SPIKE S2 part 2 — DM window. READ-ONLY.
// Maps the 2024 (Beacon) sheet's 'store' JSON: where the inventory rows and
// currency live, using the hand-added Torch and 10 gp as landmarks.
// Run after background-load.js has loaded Spike Warm's attribs (or after
// opening the sheet once, if the background load failed).
(function () {
  var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === "Spike Warm"; });
  if (cs.length !== 1) { console.log("FAIL: Spike Warm not found"); return; }
  var st = cs[0].attribs.models.filter(function (a) { return a.get("name") === "store"; })[0];
  if (!st) { console.log("FAIL: no 'store' attrib loaded — run background-load.js first (or open the sheet once), then rerun"); return; }
  // 'current' arrives as a live object when loaded via BackboneFirebase,
  // but is a JSON string when the sheet wrote it locally - handle both.
  var raw = st.get("current");
  var o = (typeof raw === "string") ? JSON.parse(raw) : raw;
  var full = JSON.stringify(o);
  console.log("store serialised length: " + full.length + " chars | current arrived as: " + typeof raw);
  console.log("top-level keys and sizes:");
  Object.keys(o).forEach(function (k) { console.log("  " + k + ": " + JSON.stringify(o[k]).length + " chars"); });
  var hits = [];
  function walk(node, path, depth) {
    if (depth > 8 || hits.length > 15) return;
    if (typeof node === "string") {
      if (node.indexOf("Torch") !== -1) hits.push("TORCH " + path + " = " + JSON.stringify(node).slice(0, 60));
      return;
    }
    if (node && typeof node === "object") {
      Object.keys(node).forEach(function (k) {
        if (/coin|currenc|gold|silver|copper|platinum|electrum/i.test(k))
          hits.push("COIN  " + path + "." + k + " = " + JSON.stringify(node[k]).slice(0, 200));
        walk(node[k], path + "." + k, depth + 1);
      });
    }
  }
  walk(o, "store", 0);
  console.log(hits.length ? "matches:\n" + hits.join("\n") : "no Torch/currency key matches found");
  var i = full.indexOf("Torch");
  if (i !== -1) console.log("serialised context around Torch:\n" + full.slice(Math.max(0, i - 400), i + 600));
  else console.log("'Torch' not found anywhere in store");
})();
