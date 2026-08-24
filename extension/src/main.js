// Party Tools — boot sequence.
// Wait for Roll20 → check the game is supported (DEL-8) → find or create
// storage (DEL-3/DEL-4) → mount the panel. Fail quietly in the console and
// loudly in the UI only where the user can act on it.
(function (PT) {
  "use strict";

  // A minimal, dismissible notice rather than a broken panel. Used for both
  // "we don't support this game" and "Roll20 moved something we need".
  function notice(text) {
    var note = PT.el("div", {
      style: "position:fixed;bottom:16px;right:16px;z-index:99999;background:#2b2545;color:#fff;border:1px solid #a83a5f;border-radius:8px;padding:10px 14px;font:13px sans-serif;max-width:320px;cursor:pointer",
      text: "Party Tools: " + text,
      onclick: function () { note.remove(); }
    });
    document.body.appendChild(note);
    return note;
  }

  PT.env.ready().then(function () {
    var info = PT.env.info();
    PT.envInfo = info;
    PT.log("v" + PT.VERSION, "role:", info.isGM ? "DM" : "player", "| backend:", info.release || "unknown", "| sheet:", info.sheet || "unknown");
    var support = PT.env.supported(info);
    if (!support.ok) {
      PT.log("not starting:", support.reason);
      notice(support.reason + " (click to dismiss)");
      return;
    }
    if (!info.hasDroppable) PT.log("jQuery UI droppable not found — compendium drops will be unavailable");

    // Everything below this line assumes Roll20's internals are where we left
    // them. Check before betting a campaign's data on it.
    var health = PT.env.selfCheck();
    PT.health = health;
    if (!health.canRead) {
      // Nothing we could show would be true. Say so plainly, and above all
      // reassure: their data is untouched, because we never got far enough to
      // touch it.
      notice("Roll20 has changed something Party Tools depends on, so it can't start. " +
        "Your party's data is safe and untouched — it lives in this game's journal, not in the extension. " +
        "Please check for an update. (click to dismiss)");
      return;
    }

    // A missing write path is the dangerous one: the panel would otherwise
    // look completely normal while every change went nowhere. Mark the storage
    // layer read-only up front so init() can find and load existing data but
    // can never create any.
    //
    // Deliberately NOT branching on storageExists() here: that reads the
    // already-downloaded journal collection, and at this point in boot the
    // journal may not have arrived yet — init()'s own waitForJournal() is what
    // settles it. Asking too early would report "no storage" for a game that
    // has plenty, and send the DM a notice saying nothing was created when in
    // fact there was something to show. init() tells us which case it is.
    if (!health.canWrite) PT.store.state.readOnly = true;

    PT.store.init(info).then(function (res) {
      if (!health.canWrite && res.state === "ready") res.state = "readOnly";

      // Now the journal has settled, so this answer is trustworthy: writing is
      // broken AND there is nothing to show, so there is nothing to mount.
      if (!health.canWrite && !PT.store.storageExists()) {
        notice("Roll20 has changed something Party Tools writes with, so it can't set this game up. " +
          "Nothing has been added to your journal. Please check for an update. (click to dismiss)");
        return;
      }

      if (res.state === "initFailed") {
        PT.log("storage initialisation failed:", res.err);
        PT.ui.mount(info, "noStorage");
        // Blaming storage creation would send the user hunting for a problem
        // in their own game, when the cause is Roll20 moving underneath us.
        PT.ui.toast(health.canWrite
          ? "Party Tools could not create its storage: " + res.err
          : "Party Tools: Roll20 has changed something Party Tools writes with. Your data is safe — please check for an update.");
        return;
      }
      PT.ui.mount(info, res.state);
      // A first run is the one moment a DM will read something, and the
      // things they need to know are the ones a toast cannot carry.
      if (res.firstRun) PT.ui.welcome();
      if (res.state === "readOnly" && !health.canWrite) {
        PT.ui.toast("Party Tools: Roll20 has changed something Party Tools writes with, so it is read-only. Your data is safe — please check for an update.");
      } else if (res.state === "readOnly") PT.ui.toast("Party Tools: this game's data comes from a newer version — read-only until you update.");
      if (res.state === "notReady") PT.ui.toast("Party Tools: storage exists but didn't finish loading. Reopen the panel in a moment, or reload the page.");
      if (res.duplicates) PT.ui.toast("Party Tools notice: found " + res.duplicates + " leftover storage set(s) from an earlier version. Ask the DM to reset — see the ♥ tab.");
    }).catch(function (e) {
      // Storage init throwing outright used to disappear into the outer catch
      // as a single console line, leaving the user with no panel and no
      // explanation at all.
      PT.captureError("storage init", e);
      notice("something went wrong setting up. Your data is safe — open the ♥ tab of a working game to copy diagnostics, or reload the page. (click to dismiss)");
    });
  }).catch(function (e) {
    PT.captureError("boot", e);
    // Reaching here means PT.env.ready() gave up: after two minutes, Roll20's
    // game data never arrived in the shape we wait for. That is either a very
    // sick connection or a Roll20 change to one of the objects ready() itself
    // gates on — and until now it produced a single console line, so the user
    // sat looking at a Roll20 page with no launcher and no explanation. The
    // self-check below cannot help: we never got far enough to run it.
    var why = PT.env.selfCheck();
    notice(why.canRead
      ? "Roll20's game data didn't finish loading. Reload the page to try again. Your party's data is safe. (click to dismiss)"
      : "Roll20 has changed something Party Tools depends on, so it can't start. Your party's data is safe and untouched — it lives in this game's journal, not in the extension. Please check for an update. (click to dismiss)");
  });
})(window.PartyTools);
