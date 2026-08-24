// Party Tools — export and import of the party's data.
//
// Why this exists: everything the party owns lives in Roll20 handouts we tell
// people never to touch by hand. Until this file, there was no way to get any
// of it back out. A deleted journal folder, a bad edit, or a lost handout
// meant a campaign's accumulated loot was simply gone, and the only available
// support answer was "I'm sorry".
//
// Two deliberate choices:
//
//   - Handout IDs are NOT exported. They are meaningless in any other campaign
//     and actively misleading in this one. An import always creates new bags
//     alongside whatever is already there, so restoring can add duplicates but
//     can never overwrite or destroy something that survived.
//
//   - The GM-only halves (the true fields behind obscured items, and the GM
//     log) are written only when the exporting client is actually a GM. In
//     practice a player's snapshot cannot contain them anyway — Roll20
//     withholds those handout bodies server-side — but a leak here would hand
//     a player the answers, so it is also checked explicitly rather than
//     relying on that alone.
//
// No new permissions: the download is a Blob and an object URL clicked by a
// temporary anchor, which is ordinary page JavaScript. Nothing is uploaded
// anywhere.
(function (PT) {
  "use strict";
  PT.backup = {};

  // Version of the EXPORT FILE format, which is not the storage schema. Bump
  // this if the file layout changes; bump storage's SCHEMA if the campaign
  // data layout changes. Both are recorded in every file.
  var FILE_FORMAT = 1;

  function bagOut(b) {
    var doc = b.doc || {};
    return {
      name: doc.name || "Unnamed bag",
      desc: doc.desc || "",
      hidden: !!b.hidden,
      purse: {
        pp: Number(doc.purse && doc.purse.pp) || 0,
        gp: Number(doc.purse && doc.purse.gp) || 0,
        ep: Number(doc.purse && doc.purse.ep) || 0,
        sp: Number(doc.purse && doc.purse.sp) || 0,
        cp: Number(doc.purse && doc.purse.cp) || 0
      },
      items: (doc.items || []).map(function (i) {
        // Copied wholesale rather than field-by-field: an item carries payload
        // data for weapons, armour and magic items whose shape this file has
        // no business knowing about, and dropping an unrecognised field would
        // silently flatten an item on the way back in.
        var copy = {};
        Object.keys(i).forEach(function (k) { copy[k] = i[k]; });
        return copy;
      })
    };
  }

  // Builds the export document. Resolves with null if storage isn't ready.
  PT.backup.build = function (env) {
    return PT.store.snapshot(env).then(function (snap) {
      if (!snap) return null;
      return Promise.all([PT.store.readLog(), env.isGM ? PT.store.readGmLog() : []])
        .then(function (logs) {
          var out = {
            partyToolsExport: FILE_FORMAT,
            schema: PT.store.SCHEMA,
            version: PT.VERSION,
            exportedAt: new Date().toISOString(),
            exportedBy: env.playerName || "unknown",
            exportedAsGM: !!env.isGM,
            bags: (snap.bags || []).map(bagOut),
            log: logs[0] || []
          };
          if (env.isGM) {
            // DM-only halves. See the header: guarded by role as well as by
            // Roll20's own server-side withholding.
            out.gmLog = logs[1] || [];
            out.obscured = snap.obscured || {};
          }
          return out;
        });
    });
  };

  PT.backup.filename = function (doc) {
    var stamp = (doc && doc.exportedAt ? doc.exportedAt : new Date().toISOString())
      .replace(/[:.]/g, "-").replace(/T/, "_").slice(0, 19);
    return "party-tools-" + stamp + ".json";
  };

  // Hands the user a file. No `downloads` permission: an object URL clicked by
  // a detached anchor is plain page JavaScript.
  PT.backup.download = function (doc) {
    var text = JSON.stringify(doc, null, 2);
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = PT.backup.filename(doc);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a timer rather than immediately: some browsers abort the
    // download if the URL dies in the same tick as the click.
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return text.length;
  };

  // Parses and validates a file the user picked. Never throws.
  PT.backup.parse = function (text) {
    var doc = PT.tryJson(text);
    if (!doc) return { ok: false, err: "That file isn't valid JSON — it may not be a Party Tools export." };
    if (!doc.partyToolsExport) return { ok: false, err: "That file isn't a Party Tools export." };
    if (doc.partyToolsExport > FILE_FORMAT) {
      return { ok: false, err: "That file was written by a newer version of Party Tools (file format " + doc.partyToolsExport + "; this version understands " + FILE_FORMAT + "). Update Party Tools and try again." };
    }
    // The same refusal storage.js applies to campaign data: newer data is not
    // something an older build may quietly reinterpret.
    if (Number(doc.schema) > PT.store.SCHEMA) {
      return { ok: false, err: "That file holds data from a newer storage version (" + doc.schema + "; this version understands " + PT.store.SCHEMA + "). Update Party Tools and try again." };
    }
    if (!doc.bags || !doc.bags.length) return { ok: false, err: "That export contains no bags." };
    return { ok: true, doc: doc };
  };

  // Counts for the confirmation step, so nobody imports blind.
  PT.backup.summarise = function (doc) {
    var bags = doc.bags || [];
    var items = 0, copper = 0, hidden = 0;
    bags.forEach(function (b) {
      (b.items || []).forEach(function (i) { items += Number(i.qty) || 1; });
      copper += PT.purseToCopper(b.purse);
      if (b.hidden) hidden++;
    });
    return {
      bags: bags.length,
      hidden: hidden,
      items: items,
      coins: PT.coinLabel(PT.copperToGpMax(copper)),
      exportedAt: doc.exportedAt,
      exportedBy: doc.exportedBy,
      version: doc.version
    };
  };

  // Recreates the exported bags ALONGSIDE whatever is already in the game.
  //
  // Sequential on purpose. Every write here goes through storage.js's
  // verify-and-retry, which deliberately waits on Roll20 echoing the write
  // back; firing a whole campaign's bags at it concurrently is the exact
  // race that machinery exists to survive, and there is no reason to make it
  // work harder than it must.
  PT.backup.restore = function (env, doc) {
    if (!env.isGM) {
      return Promise.resolve({ ok: false, err: "Only the DM can import — Roll20 does not let players create the journal handouts bags are stored in." });
    }
    var bags = doc.bags || [];
    var made = 0, itemsMade = 0, failures = [];

    return bags.reduce(function (chain, b) {
      return chain.then(function () {
        var name = b.name + " (imported)";
        return PT.store.createBag(env, name, !!b.hidden).then(function (res) {
          if (!res.ok) { failures.push(b.name + ": " + res.err); return null; }
          made++;
          var items = b.items || [];
          return items.reduce(function (inner, item) {
            return inner.then(function () {
              var copy = {};
              Object.keys(item).forEach(function (k) { copy[k] = item[k]; });
              // Let storage mint a fresh id; reusing the old one risks
              // colliding with an item already in this campaign.
              delete copy.id;
              return PT.store.addItem(env, res.id, name, copy).then(function (r) {
                if (r.ok) itemsMade++;
                else failures.push(b.name + " / " + (item.name || "item") + ": " + (r.err || "write failed"));
              });
            });
          }, Promise.resolve()).then(function () {
            var purse = b.purse || {};
            var any = PT.DENOMS.some(function (d) { return Number(purse[d]) > 0; });
            if (!any) return null;
            return PT.store.changePurse(env, res.id, name, purse, "restored from an export");
          });
        });
      });
    }, Promise.resolve()).then(function () {
      return { ok: failures.length === 0, bags: made, items: itemsMade, failures: failures };
    });
  };
})(window.PartyTools);
