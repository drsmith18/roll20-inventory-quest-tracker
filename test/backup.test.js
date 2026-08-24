// Export and import (#34) — the safety net for the campaign whose handouts
// got deleted, edited by hand, or lost.
//
// The two properties that actually matter here:
//   1. a round trip doesn't lose anything, including the payload fields that
//      make a claimed weapon arrive as a weapon rather than a name;
//   2. a player's export cannot contain the DM's secrets. Roll20 withholds
//      those handout bodies server-side, so this should be true for free —
//      which is exactly why it deserves a test rather than an assumption.
const { createWorld, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

// The DM's world, booted and initialised, with some data worth losing.
async function dmWorldWithData() {
  const w = createWorld({ isGM: true });
  await wait(8000);
  const env = w.PT.envInfo;

  // A weapon carrying the payload graph — the thing a naive export would
  // flatten back into a plain name.
  await w.PT.store.addItem(env, bagId(w), "Party Loot", {
    name: "Longsword", qty: 1, weight: 3, cost: "15 gp", rarity: "common",
    pagename: "compendium:longsword",
    payload: { type: "Item", attack: { name: "Longsword", damage: "1d8" } }
  });
  await w.PT.store.addItem(env, bagId(w), "Party Loot", { name: "Rope", qty: 2, weight: 10 });
  await w.PT.store.changePurse(env, bagId(w), "Party Loot", { gp: 137, sp: 12, cp: 7 }, "loot from the crypt");
  return w;
}

function bagId(w) {
  return w.PT.store.state.indexH && Object.keys(w.PT.store.state.bagHs)[0];
}

async function exportShape() {
  section("what an export contains:");
  const w = await dmWorldWithData();
  const doc = await w.PT.backup.build(w.PT.envInfo);

  check("it produces a document", !!doc);
  check("it records the export file format", doc.partyToolsExport === 1, doc.partyToolsExport);
  check("it records the storage schema it came from", doc.schema === w.PT.store.SCHEMA, doc.schema);
  check("it records the extension version", doc.version === w.PT.VERSION, doc.version);
  check("it has the bag", doc.bags.length === 1, doc.bags.length + " bag(s)");

  const bag = doc.bags[0];
  check("the bag keeps its name", bag.name === "Party Loot", bag.name);
  check("both items are there", bag.items.length === 2, bag.items.length + " item(s)");
  check("quantities survive", bag.items.filter(i => i.name === "Rope")[0].qty === 2);
  check("the purse survives", bag.purse.gp === 137 && bag.purse.sp === 12 && bag.purse.cp === 7,
    JSON.stringify(bag.purse));

  // The whole point of exporting an item rather than its name.
  const sword = bag.items.filter(i => i.name === "Longsword")[0];
  check("a weapon keeps its payload graph", !!(sword.payload && sword.payload.attack), JSON.stringify(sword.payload));
  check("a weapon keeps its compendium source", sword.pagename === "compendium:longsword", sword.pagename);

  // Handout ids are campaign-specific; carrying them would be misleading.
  check("no handout ids are carried into the file",
    !JSON.stringify(doc).includes(bagId(w)), "an id leaked into the export");

  const s = w.PT.backup.summarise(doc);
  check("the summary counts items, not stacks", s.items === 3, s.items + " item(s)");
  check("the summary reports the coins to gold at most", /gp/.test(s.coins) && !/pp/.test(s.coins), s.coins);
  check("the filename is stamped and safe", /^party-tools-[\d_-]+\.json$/.test(w.PT.backup.filename(doc)),
    w.PT.backup.filename(doc));
}

async function roundTrip() {
  section("a round trip loses nothing:");
  const source = await dmWorldWithData();
  const doc = await source.PT.backup.build(source.PT.envInfo);

  // A different game entirely: fresh world, fresh storage, fresh handouts.
  const target = createWorld({ isGM: true });
  await wait(8000);
  const before = target.handouts.models.length;

  const res = await target.PT.backup.restore(target.PT.envInfo, doc);
  check("the restore reports success", res.ok === true, JSON.stringify(res.failures || []));
  check("it created the bag", res.bags === 1, res.bags + " bag(s)");
  check("it created both items", res.items === 2, res.items + " item(s)");
  check("a new handout was created for the bag", target.handouts.models.length > before);

  const after = await target.PT.backup.build(target.PT.envInfo);
  const restored = after.bags.filter(b => /Party Loot \(imported\)/.test(b.name))[0];
  check("the imported bag is marked as imported", !!restored,
    after.bags.map(b => b.name).join(", "));
  check("its items came across", restored && restored.items.length === 2,
    restored ? restored.items.length + " item(s)" : "no bag");
  check("the weapon's payload survived the round trip",
    !!(restored && restored.items.filter(i => i.name === "Longsword")[0].payload.attack));
  check("the purse survived the round trip",
    !!restored && restored.purse.gp === 137 && restored.purse.cp === 7,
    restored ? JSON.stringify(restored.purse) : "no bag");

  // Add-alongside, not replace: the game's own default bag is untouched.
  check("the game's existing bag is still there",
    after.bags.some(b => b.name === "Party Loot"), after.bags.map(b => b.name).join(", "));
}

// Storage as the DM's client would have created it, seen from a PLAYER's
// client. The distinction that matters: Roll20 withholds GM-only handout
// bodies server-side, so a player asking for one gets nothing back. The stub
// has no server, so withholding is reproduced here by leaving those two
// bodies empty — which is exactly what the player's client observes.
function dmStorageAsAPlayerSeesIt(handouts) {
  let n = 0;
  const mk = (share, doc) => {
    const h = handouts.create({
      name: "PT-" + Math.random().toString(36).slice(2, 10),
      inplayerjournals: share === "all" ? "all" : "",
      controlledby: share === "all" ? "all" : "",
      archived: false
    });
    // GM-only bodies stay empty: the player never receives them.
    if (share === "all") h.updateBlobs({ notes: JSON.stringify(Object.assign({ rev: "r" + ++n }, doc)) });
    return h;
  };
  const bag = mk("all", {
    partyToolsBag: 1, name: "Party Loot", desc: "", items: [{ id: "i1", name: "Rope", qty: 2 }],
    purse: { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 }
  });
  mk("all", { partyToolsIndex: 1, bags: [bag.id], settings: {} });
  mk("gm", { partyToolsGmIndex: 1, hiddenBags: ["secret-bag"], obscured: { i9: { name: "Staff of Power" } } });
  mk("all", { partyToolsLog: 1, entries: [{ id: "l1", t: Date.now(), who: "DM", msg: "added Rope" }] });
  mk("gm", { partyToolsGmLog: 1, entries: [{ id: "g1", t: Date.now(), who: "DM", msg: "created hidden bag" }] });
}

async function playerExportIsSafe() {
  section("a player's export cannot carry the DM's secrets:");
  const w = createWorld({ isGM: false });
  dmStorageAsAPlayerSeesIt(w.handouts);
  await wait(12000); // a watch tick, then the player's client adopts the storage

  const doc = await w.PT.backup.build(w.PT.envInfo);
  check("the player can export what they CAN see", !!doc, "no export produced");
  check("and it contains the shared bag", !!doc && doc.bags.length >= 1,
    doc ? doc.bags.map(b => b.name).join(", ") : "none");
  check("the export is marked as not-a-GM export", doc.exportedAsGM === false, String(doc.exportedAsGM));
  check("it carries no GM log", doc.gmLog === undefined, JSON.stringify(doc.gmLog));
  check("it carries no obscured-item truths", doc.obscured === undefined, JSON.stringify(doc.obscured));
  // The blunt version of the same question, against the whole serialised file:
  // no DM secret may appear anywhere in it, under any key.
  const text = JSON.stringify(doc);
  check("the hidden bag's id appears nowhere in the file", !text.includes("secret-bag"));
  check("an obscured item's true name appears nowhere in the file", !text.includes("Staff of Power"));
  check("the GM-only log's entries appear nowhere in the file", !text.includes("created hidden bag"));

  const res = await w.PT.backup.restore(w.PT.envInfo, { bags: [{ name: "x", items: [], purse: {} }] });
  check("a player cannot import", res.ok === false, JSON.stringify(res));
  check("and is told why, in terms of Roll20's rules", /Only the DM/.test(res.err), res.err);
}

async function badFiles() {
  section("a file that shouldn't be imported is refused:");
  const w = createWorld({ isGM: true });
  await wait(8000);
  const P = w.PT;

  check("nonsense is refused", P.backup.parse("not json at all").ok === false);
  check("valid JSON that isn't an export is refused",
    P.backup.parse('{"hello":"world"}').ok === false);
  check("an export with no bags is refused",
    P.backup.parse(JSON.stringify({ partyToolsExport: 1, schema: 1, bags: [] })).ok === false);

  // The same refusal storage.js makes for campaign data written by a newer
  // build: an older version must not quietly reinterpret it.
  const newerSchema = P.backup.parse(JSON.stringify({
    partyToolsExport: 1, schema: P.store.SCHEMA + 1, bags: [{ name: "b", items: [], purse: {} }]
  }));
  check("a newer STORAGE schema is refused", newerSchema.ok === false, JSON.stringify(newerSchema));
  check("and the refusal tells the user to update", /Update Party Tools/.test(newerSchema.err), newerSchema.err);

  const newerFile = P.backup.parse(JSON.stringify({
    partyToolsExport: 99, schema: 1, bags: [{ name: "b", items: [], purse: {} }]
  }));
  check("a newer FILE FORMAT is refused", newerFile.ok === false, JSON.stringify(newerFile));

  const good = P.backup.parse(JSON.stringify({
    partyToolsExport: 1, schema: 1, bags: [{ name: "b", items: [{ name: "i", qty: 1 }], purse: { gp: 1 } }]
  }));
  check("a well-formed export is accepted", good.ok === true, JSON.stringify(good));
}

(async () => {
  await exportShape();
  await roundTrip();
  await playerExportIsSafe();
  await badFiles();
  report("backup");
})();
