// Party Tools — environment gates.
// Waits for Roll20's game data to exist, then answers: who are we, which
// game is this, which backend, and is this a game we support (DEL-8).
(function (PT) {
  "use strict";
  PT.env = {};

  // Resolves when Roll20's campaign data is genuinely CONNECTED — not merely
  // when the (initially empty) collections exist. The proof used: our own
  // player record has arrived in Campaign.players. Before that point the
  // journal list is empty and any scan of it lies.
  PT.env.ready = function () {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        var base = window.Campaign && window.Campaign.handouts && window.Campaign.players && window.campaign_id;
        var selfLoaded = base && window.d20_player_id &&
          Campaign.players.models.some(function (p) { return p.id === window.d20_player_id; });
        if (selfLoaded) return resolve();
        // Overridable so the test harness can exercise the give-up path
        // without waiting two real minutes, the same way storage.js exposes
        // its verify delays.
        var limit = PT.READY_TIMEOUT_MS || 120000;
        if (Date.now() - t0 > limit) return reject(new Error("Roll20 game data never finished loading (" + Math.round(limit / 1000) + "s)"));
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

  // ---- self-check -----------------------------------------------------------
  // Everything this extension does rides on undocumented Roll20 internals. None
  // of it is a public API, so Roll20 can rename or reshape any of it in a
  // routine deploy with no notice — and when that happens it happens to every
  // user at once.
  //
  // The dangerous failure is not the loud one. If a READ path disappears we
  // show nothing and that is obvious. If a WRITE path disappears we would
  // carry on presenting a working panel while changes quietly went nowhere, or
  // worse, wrote something malformed onto a character someone cares about.
  // So the two are separated, and a missing write path is not something the
  // user can click past.
  //
  // `kind` is "read" or "write"; `probe` returns true when the thing is there.
  PT.env.PROBES = [
    { name: "window.Campaign", kind: "read", probe: function () { return !!window.Campaign; } },
    { name: "Campaign.handouts", kind: "read", probe: function () { return !!(window.Campaign && Campaign.handouts && Campaign.handouts.models && typeof Campaign.handouts.get === "function"); } },
    { name: "Campaign.characters", kind: "read", probe: function () { return !!(window.Campaign && Campaign.characters && Campaign.characters.models); } },
    { name: "Campaign.players", kind: "read", probe: function () { return !!(window.Campaign && Campaign.players && Campaign.players.models); } },
    { name: "Campaign.get", kind: "read", probe: function () { return !!(window.Campaign && typeof Campaign.get === "function"); } },
    { name: "window.campaign_id", kind: "read", probe: function () { return !!window.campaign_id; } },
    { name: "window.d20_player_id", kind: "read", probe: function () { return !!window.d20_player_id; } },
    { name: "window.is_gm", kind: "read", probe: function () { return typeof window.is_gm !== "undefined"; } },
    { name: "Campaign.handouts.create", kind: "write", probe: function () { return !!(window.Campaign && Campaign.handouts && typeof Campaign.handouts.create === "function"); } },
    { name: "Campaign.save", kind: "write", probe: function () { return !!(window.Campaign && typeof Campaign.save === "function"); } },
    // The blob pair lives on a handout instance, so it can only be probed when
    // the journal actually has one. In a brand-new campaign there may be none,
    // and "we could not check" is reported as exactly that rather than being
    // quietly counted as a pass.
    {
      name: "handout._getLatestBlob", kind: "write", needsSample: true,
      probe: function (h) { return typeof h._getLatestBlob === "function"; }
    },
    {
      name: "handout.updateBlobs", kind: "write", needsSample: true,
      probe: function (h) { return typeof h.updateBlobs === "function"; }
    }
  ];

  // Returns { ok, canRead, canWrite, missing: [...], unverified: [...] }.
  // Never throws: a probe that blows up counts as a miss, because whatever it
  // was checking is evidently not usable.
  PT.env.selfCheck = function () {
    var sample = null;
    try {
      sample = (window.Campaign && Campaign.handouts && Campaign.handouts.models &&
        Campaign.handouts.models[0]) || null;
    } catch (e) { sample = null; }

    var missing = [], unverified = [];
    PT.env.PROBES.forEach(function (p) {
      if (p.needsSample && !sample) { unverified.push(p.name); return; }
      var ok = false;
      try { ok = !!p.probe(sample); } catch (e) { ok = false; }
      if (!ok) missing.push({ name: p.name, kind: p.kind });
    });

    var canRead = !missing.some(function (m) { return m.kind === "read"; });
    var canWrite = canRead && !missing.some(function (m) { return m.kind === "write"; });
    if (missing.length) {
      PT.log("self-check: missing", missing.map(function (m) { return m.name + " (" + m.kind + ")"; }).join(", "));
    }
    if (unverified.length) PT.log("self-check: could not verify", unverified.join(", "), "(no handout to sample)");
    return {
      ok: missing.length === 0,
      canRead: canRead,
      canWrite: canWrite,
      missing: missing,
      unverified: unverified,
      // A one-line form for the bug report and the diagnostics dump.
      summary: missing.length
        ? "FAILED: " + missing.map(function (m) { return m.name; }).join(", ")
        : (unverified.length ? "passed (" + unverified.length + " unverified)" : "passed")
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
