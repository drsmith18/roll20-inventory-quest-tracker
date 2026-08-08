// SPIKE S3 part 2 — DM window. Run AFTER network-capture.js is armed.
// Adds a drop target box (bottom-left). Drag a compendium search result onto
// it. Reports what an HTML5 drop and a jQuery UI drop each deliver.
// CHANGES NOTHING in the game; remove the box afterwards with:
//   $('#spike-s3-target').remove()
(function () {
  var old = document.getElementById("spike-s3-target");
  if (old) old.remove();
  var box = document.createElement("div");
  box.id = "spike-s3-target";
  box.style.cssText = "position:fixed;bottom:20px;left:20px;width:260px;height:120px;" +
    "background:#224;color:#fff;z-index:99999;border:3px dashed #8af;display:flex;" +
    "align-items:center;justify-content:center;font:14px sans-serif;text-align:center;padding:8px;";
  box.textContent = "SPIKE S3 DROP TARGET — drag a compendium search result here";
  document.body.appendChild(box);
  ["dragenter", "dragover"].forEach(function (ev) {
    box.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  box.addEventListener("drop", function (e) {
    e.preventDefault();
    var types = e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.types) : [];
    console.log("HTML5 drop fired. dataTransfer types: " + JSON.stringify(types));
    types.forEach(function (t) {
      try { console.log("  " + t + " = " + e.dataTransfer.getData(t)); } catch (err) {}
    });
  });
  try {
    $(box).droppable({
      tolerance: "touch",
      drop: function (event, ui) {
        console.log("jQuery UI drop fired.");
        var el = (ui.draggable && ui.draggable[0]) || (ui.helper && ui.helper[0]);
        if (el) {
          console.log("  dragged element html: " + el.outerHTML.slice(0, 400));
          var attrs = {};
          Array.prototype.forEach.call(el.attributes, function (a) {
            if (a.name.indexOf("data-") === 0) attrs[a.name] = a.value;
          });
          console.log("  data-* attributes: " + JSON.stringify(attrs));
        }
        if (ui.draggable) console.log("  jQuery .data(): " + JSON.stringify(ui.draggable.data()));
      }
    });
    console.log("jQuery UI droppable armed on the box.");
  } catch (e) { console.log("jQuery droppable setup failed: " + e.message); }
  console.log("Drag the 2024 'Longsword' result onto the box, then the 2014 one. Each drop should print lines above.");
})();
