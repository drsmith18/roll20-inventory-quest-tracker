// Party Tools — compendium drag & drop (spike S3).
// Drops arrive only through jQuery UI (HTML5 drop never fires); the dragged
// element carries just data-pagename and data-expansionid; the full item is
// fetched from Roll20's own same-origin getPages endpoint and STORED at drop
// time. Unresolvable records (no id / expansion 0) become name-only entries
// (INV-11). Never touch ui.draggable.data() — it contains a cross-origin
// Window and throws.
(function (PT) {
  "use strict";
  PT.drops = {};

  // Make `elem` accept compendium drags. onDrop(payload) fires immediately
  // with {pagename, expansionId} after category filtering.
  // Roll20's tabletop (#editor-wrapper) is its own drop zone and fires on
  // the same mouseup as ours — that's the "item also pops up in the app"
  // double-drop. While a drag is over OUR panel, Roll20's zone is disabled;
  // it comes back the moment the drag leaves or completes.
  function setCanvasDrops(enabled) {
    try {
      var ew = $("#editor-wrapper");
      if (ew.length && ew.droppable) ew.droppable(enabled ? "enable" : "disable");
    } catch (e) { /* canvas zone not present or not a droppable — nothing to do */ }
  }

  PT.drops.arm = function (elem, onDrop) {
    if (!window.$ || !$.fn || !$.fn.droppable) return false;
    try {
      $(elem).droppable({
        tolerance: "pointer",
        greedy: true,
        over: function () { elem.classList.add("pt-drop-over"); setCanvasDrops(false); },
        out: function () { elem.classList.remove("pt-drop-over"); setCanvasDrops(true); },
        drop: function (event, ui) {
          elem.classList.remove("pt-drop-over");
          setTimeout(function () { setCanvasDrops(true); }, 100);
          var el = ui && ui.draggable && ui.draggable[0];
          if (!el || !el.getAttribute) return;
          var pagename = el.getAttribute("data-pagename") || "";
          var expansionId = el.getAttribute("data-expansionid") || "";
          if (!pagename) return;
          var category = decodeURIComponent(pagename).split(":")[0];
          if (category !== "Items") {
            PT.ui.toast("That was a " + category + " entry — only Items can go in a bag.");
            return;
          }
          onDrop({ pagename: pagename, expansionId: expansionId });
        }
      });
      return true;
    } catch (e) {
      PT.log("droppable arming failed:", e.message);
      return false;
    }
  };

  // Resolve a drop into a stored item. Resolves (never rejects) with an item
  // object; `resolved:false` means name-only fallback.
  PT.drops.resolve = function (payload) {
    var url = "/compendium/compendium/getPages?bookName=dnd5e&pages%5B%5D=" +
      encodeURIComponent(payload.pagename) +
      "&sharedCompendium=" + window.campaign_id +
      "&expansionId=" + encodeURIComponent(payload.expansionId) + "&dragDropRequest=true&_=" + Date.now();
    var fallbackName = decodeURIComponent(payload.pagename).split(":").pop();
    return fetch(url, { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        var rec = PT.tryJson((arr && arr[0]) || "");
        if (!rec || !rec.id) {
          return { resolved: false, name: fallbackName, qty: 1, note: "not in a compendium book this account can read" };
        }
        var d = rec.data || {};
        var itemPayload = null;
        (PT.tryJson(d["data-datarecords"] || "") || []).forEach(function (r2) {
          var p = PT.tryJson(r2.payload || "");
          if (p && p.type === "Item" && !itemPayload) itemPayload = p;
        });
        return {
          resolved: true,
          name: rec.name,
          qty: 1,
          description: (itemPayload && itemPayload.description) || "",
          weight: itemPayload && itemPayload.weight != null ? itemPayload.weight : (parseFloat(d.Weight) || null),
          cost: (itemPayload && itemPayload.cost) || d.Cost || "",
          rarity: d["Item Rarity"] || "",
          itemType: d["Item Type"] || d.Type || "",
          pagename: payload.pagename,
          expansionId: payload.expansionId,
          // kept verbatim for the future sheet-transfer feature (S2/S3)
          datarecords: d["data-datarecords"] || ""
        };
      })
      .catch(function (e) {
        PT.log("getPages failed:", e.message);
        return { resolved: false, name: fallbackName, qty: 1, note: "compendium lookup failed" };
      });
  };
})(window.PartyTools);
