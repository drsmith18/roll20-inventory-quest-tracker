// Party Tools — environment gates.
// Waits for Roll20's game data to exist, then answers: who are we, which
// game is this, which backend, and is this a game we support (DEL-8).
(function (PT) {
  "use strict";
  PT.env = {};

  // Resolves when the Roll20 page objects the extension depends on exist.
  PT.env.ready = function () {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        if (window.Campaign && window.Campaign.handouts && window.Campaign.players && window.campaign_id) {
          return resolve();
        }
        if (Date.now() - t0 > 90000) return reject(new Error("Roll20 game data never appeared (90s)"));
        setTimeout(poll, 500);
      })();
    });
  };

  PT.env.info = function () {
    var release = null;
    try { release = (Campaign.attributes && (Campaign.attributes.release || Campaign.attributes.engine)) || null; } catch (e) {}
    var sheet = null;
    try {
      var withSheet = Campaign.characters.models.filter(function (c) { return c.get("charactersheetname"); })[0];
      sheet = withSheet ? withSheet.get("charactersheetname") : null;
    } catch (e) {}
    return {
      isGM: !!window.is_gm,
      playerId: window.d20_player_id || null,
      playerName: window.d20_current_name || "unknown",
      release: release,
      sheet: sheet,
      hasDroppable: !!(window.$ && window.$.fn && window.$.fn.droppable)
    };
  };

  // DEL-8: v1 is Jumpgate-only. An explicit different value means decline.
  // A missing value is treated as unknown-but-proceed, with a console note,
  // because the field name is inferred from live observation, not docs.
  PT.env.supported = function (info) {
    if (info.release && info.release !== "jumpgate") {
      return { ok: false, reason: "This game runs Roll20's \"" + info.release + "\" engine. Party Tools v1 supports Jumpgate games only." };
    }
    if (!info.release) PT.log("backend marker not found; proceeding on the assumption this is Jumpgate");
    if (!info.playerId) return { ok: false, reason: "Could not identify the current player." };
    return { ok: true };
  };
})(window.PartyTools);
