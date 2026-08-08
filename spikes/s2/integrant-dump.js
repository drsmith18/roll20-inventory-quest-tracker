// SPIKE S2 part 3 — DM window. READ-ONLY.
// Full dumps of the specific records needed to design the write test:
// the gold currency integrant (where does the amount live?), the Torch item
// integrant (the shape to clone), its parent container, and a census of
// integrant types. IDs are the ones observed in part 2's output.
(function () {
  var cs = Campaign.characters.models.filter(function (c) { return c.get("name") === "Spike Warm"; });
  if (cs.length !== 1) { console.log("FAIL: Spike Warm not found"); return; }
  var A = function (n) { return cs[0].attribs.models.filter(function (a) { return a.get("name") === n; })[0]; };
  var st = A("store");
  if (!st) { console.log("FAIL: store not loaded — run background-load.js first"); return; }
  var o = st.get("current");
  var ints = o.integrants.integrants;
  console.log("store.integrants keys besides 'integrants': " +
    Object.keys(o.integrants).filter(function (k) { return k !== "integrants"; }).join(", "));
  console.log("store.inventory = " + JSON.stringify(o.inventory));
  console.log("store.currencies = " + JSON.stringify(o.currencies));
  console.log("updateId attrib = " + JSON.stringify(A("updateId") && A("updateId").get("current")));
  console.log("--- gold integrant, complete ---");
  console.log(JSON.stringify(ints.gold, null, 1));
  console.log("--- Torch item integrant (e58XAtolfk3D7vmpjsepY), complete ---");
  console.log(JSON.stringify(ints.e58XAtolfk3D7vmpjsepY, null, 1));
  console.log("--- its parent (E_LA4Y-6zRqYtCiW5YH-K), complete ---");
  console.log(JSON.stringify(ints["E_LA4Y-6zRqYtCiW5YH-K"], null, 1));
  var types = {};
  Object.keys(ints).forEach(function (k) {
    var t = (ints[k] && ints[k].type) || "(none)";
    types[t] = (types[t] || 0) + 1;
  });
  console.log("integrant counts by type: " + JSON.stringify(types));
})();
