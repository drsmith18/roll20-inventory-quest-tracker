// Party Tools — boot sequence.
// Wait for Roll20 → check the game is supported (DEL-8) → find or create
// storage (DEL-3/DEL-4) → mount the panel. Fail quietly in the console and
// loudly in the UI only where the user can act on it.
(function (PT) {
  "use strict";
  PT.env.ready().then(function () {
    var info = PT.env.info();
    PT.envInfo = info;
    PT.log("v" + PT.VERSION, "role:", info.isGM ? "DM" : "player", "| backend:", info.release || "unknown", "| sheet:", info.sheet || "unknown");
    var support = PT.env.supported(info);
    if (!support.ok) {
      PT.log("not starting:", support.reason);
      // A minimal, dismissible notice rather than a broken panel.
      var note = PT.el("div", {
        style: "position:fixed;bottom:16px;right:16px;z-index:99999;background:#2b2545;color:#fff;border:1px solid #a83a5f;border-radius:8px;padding:10px 14px;font:13px sans-serif;max-width:300px;cursor:pointer",
        text: "Party Tools: " + support.reason + " (click to dismiss)",
        onclick: function () { note.remove(); }
      });
      document.body.appendChild(note);
      return;
    }
    if (!info.hasDroppable) PT.log("jQuery UI droppable not found — compendium drops will be unavailable");
    PT.store.init(info).then(function (res) {
      if (res.state === "initFailed") {
        PT.log("storage initialisation failed:", res.err);
        PT.ui.mount(info, "noStorage");
        PT.ui.toast("Party Tools could not create its storage: " + res.err);
        return;
      }
      PT.ui.mount(info, res.state);
      if (res.firstRun) PT.ui.toast("Party Tools is set up — a “Party Loot” bag has been created. Drag compendium items onto it!");
      if (res.state === "readOnly") PT.ui.toast("Party Tools: this game's data comes from a newer version — read-only until you update.");
      if (res.state === "notReady") PT.ui.toast("Party Tools: storage exists but didn't finish loading. Reopen the panel in a moment, or reload the page.");
      if (res.duplicates) PT.ui.toast("Party Tools notice: found " + res.duplicates + " leftover storage set(s) from an earlier version. Ask the DM to reset — see the ♥ tab.");
    });
  }).catch(function (e) {
    PT.log("boot failed:", e.message);
  });
})(window.PartyTools);
