// sheets.js — the riskiest code in the extension, because it writes into a
// real player's character. Covers the compendium record-graph replay (a
// claimed weapon arriving as a weapon), taking an item back off a sheet, and
// the party-visibility filter that decides who a player may split coins with.
//
// The COMPENDIUM fixture below is captured from a real longsword drop
// (v0.9.1 diagnostic, Aug 2026) — it is the shape the live endpoint returns,
// not an inference. Note what it does NOT have: no _id, no parentID, no
// childIDs. The links between a weapon's five records are not in the data,
// which is why only the Item record is written today.
//
// The SHEET fixture is the other shape: integrants serialised off a character
// by takeItem, which DO carry ids and links and so can be rebuilt in full.
const { createWorld, makeCharacter, integrantsOf } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

const { win, PT } = createWorld({ scripts: ["util.js", "sheets.js"] });

const LONGSWORD = JSON.stringify([
  { name: "Longsword", payload: JSON.stringify({
    type: "Item", name: "Longsword",
    description: "Versatile. A Versatile weapon can be used with one or two hands.\nDamage: 1d8 (1d10)\nDamage Type: Slashing\nProperties: Versatile\nMastery: Sap\nWeight: 3",
    weight: 3, properties: ["Versatile (1d10)"], cost: "15 GP",
    weaponData: { category: "Melee", training: "Martial", type: "Longsword" },
    equipData: { equippable: true }
  }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Attack", name: "Longsword", attackType: "Melee" }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Damage", name: "Slashing", dice: "1d8" }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Damage", name: "Slashing (two-handed)", dice: "1d10" }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Mastery", name: "Sap" }) }
]);

// Sheet-sourced: ids and links present, so the full graph can be rewired.
const SHEET_GRAPH = JSON.stringify([
  { payload: JSON.stringify({ _id: "ls", type: "Item", name: "Longsword", quantity: 1, parentID: "inventory", childIDs: '["atk"]', weight: 3, cost: "15 GP", weaponData: { category: "Melee" }, equipData: { equippable: true } }) },
  { payload: JSON.stringify({ _id: "atk", type: "Attack", name: "Longsword", parentID: "ls", childIDs: '["dmg"]', attackType: "Melee" }) },
  { payload: JSON.stringify({ _id: "dmg", type: "Damage", name: "Slashing", parentID: "atk", childIDs: "[]", dice: "1d8" }) }
]);

(async () => {
  // ---- party visibility ----------------------------------------------------
  // Regression: the coin-split picker listed Campaign.characters raw, and that
  // collection reaches player clients with every NPC's name intact.
  section("party visibility (who a player may split coins with):");
  const pc1 = makeCharacter("Vex", { controlledby: "p1" });
  const pc2 = makeCharacter("Brann", { controlledby: "p2" });
  const npcSecret = makeCharacter("Zarantyr the Betrayer", {});
  const npcParty = makeCharacter("Hireling Bob", { tags: '["party","npc"]' });
  win.Campaign.characters.models = [pc1, pc2, npcSecret, npcParty];

  const asPlayer = PT.sheets.partyVisible({ isGM: false, playerId: "p1" }).map(c => c.get("name"));
  const asGM = PT.sheets.partyVisible({ isGM: true }).map(c => c.get("name"));
  check("a player sees characters controlled by ANY player",
    asPlayer.includes("Vex") && asPlayer.includes("Brann"), asPlayer.join(", "));
  check("a player does NOT see a DM-only NPC",
    !asPlayer.includes("Zarantyr the Betrayer"), asPlayer.join(", "));
  check("a player DOES see an NPC the DM tagged party",
    asPlayer.includes("Hireling Bob"), asPlayer.join(", "));
  check("the DM still sees everyone", asGM.length === 4, asGM.join(", "));
  check("a comma-separated tags field also works",
    PT.sheets.hasPartyTag(makeCharacter("X", { tags: "party, loot" })));
  check("an unparseable tags field means no tag, not a crash",
    !PT.sheets.hasPartyTag(makeCharacter("X", { tags: "{not json" })));

  // ---- claiming a compendium weapon ----------------------------------------
  // The bug this exists for: a longsword arriving as a possession, because
  // the write synthesised its own Item record and threw the compendium's away
  // along with weaponData and equipData.
  section("claiming a compendium weapon uses the compendium's own Item record:");
  const hero = makeCharacter("Vex", { controlledby: "p1" });
  const add = await PT.sheets.addItem(hero, {
    name: "Longsword", qty: 2, description: "(the bag's thinner copy)",
    weight: 3, cost: "15 GP", rarity: "", datarecords: LONGSWORD
  });
  check("the write reports success", add.ok, add.err);
  check("it used the compendium's Item record", add.fromCompendium === true);
  check("it reports the records it did not write", add.unwritten === 4, add.unwritten);

  const ints = integrantsOf(hero);
  const root = ints[add.id];
  check("weaponData survived — this is what makes it a weapon",
    root.weaponData && root.weaponData.category === "Melee" && root.weaponData.training === "Martial",
    JSON.stringify(root.weaponData));
  check("equipData.equippable survived as true, not the synthesised false",
    root.equipData && root.equipData.equippable === true, JSON.stringify(root.equipData));
  check("weapon properties survived",
    root.properties && root.properties.join(",") === "Versatile (1d10)", JSON.stringify(root.properties));
  check("the compendium's full description won over the bag's copy",
    /Mastery: Sap/.test(root.description), root.description);
  // Verified against a real sheet: a loose item sits at parentID "". The old
  // code copied another top-level item's parent, which on a real character
  // could have filed the claim inside a Class Level record.
  check("the item is placed loose, at parentID \"\"", root.parentID === "", JSON.stringify(root.parentID));
  check("it did not inherit another item's parent", root.parentID !== "inventory", root.parentID);
  check("quantity came from the claim, not the compendium", root.quantity === 2, root.quantity);
  check("it got a fresh id and an empty child list",
    root._id === add.id && root.childIDs === "[]", root._id + " / " + root.childIDs);
  check("recordName tracks the name", root.recordName === "Longsword", root.recordName);
  check("the character's pre-existing item was left alone", !!ints.rope);

  // ---- a sheet-sourced graph still rebuilds in full ------------------------
  section("a graph WITH ids (from takeItem) still rebuilds in full:");
  const heroG = makeCharacter("Vex", { controlledby: "p1" });
  const addG = await PT.sheets.addItem(heroG, { name: "Longsword", qty: 1, datarecords: SHEET_GRAPH });
  check("the write reports success", addG.ok, addG.err);
  check("it took the graph path", addG.graph === true);
  check("all three records were written", addG.records === 3, addG.records);
  const intsG = integrantsOf(heroG);
  const rootG = intsG[addG.id];
  check("the compendium's ids were NOT reused",
    !intsG.ls && !intsG.atk && !intsG.dmg, Object.keys(intsG).join(", "));
  const attack = intsG[JSON.parse(rootG.childIDs)[0]];
  check("the Attack record came with it", attack && attack.type === "Attack", attack && attack.type);
  check("the Attack points back at the new item id",
    attack && attack.parentID === addG.id, attack && attack.parentID);
  const dmg = intsG[JSON.parse(attack.childIDs)[0]];
  check("damage dice survived", dmg && dmg.dice === "1d8", dmg && dmg.dice);

  // ---- malformed payloads --------------------------------------------------
  // Every one of these must degrade to the plain-item write, never write a
  // half-understood graph into somebody's character.
  // Two outcomes are correct here, and which one applies is the point:
  //   - a payload with a usable Item record: use it, links or no links (a
  //     real compendium payload has NO links, so this is the common case).
  //   - a payload with nothing usable in it: synthesise a plain item.
  // Either way exactly one record is written and the sheet stays sane.
  section("payloads that can't be rebuilt as a graph:");
  const cases = {
    "not JSON at all": ["{{{", "plain"],
    "a record with no id (i.e. every real compendium payload)":
      [JSON.stringify([{ payload: JSON.stringify({ type: "Item", name: "X" }) }]), "compendium item record"],
    "two Item records": [JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: "[]" }) },
      { payload: JSON.stringify({ _id: "b", type: "Item", name: "B", parentID: "out", childIDs: "[]" }) }
    ]), "compendium item record"],
    "no Item record at all": [JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Attack", name: "A", parentID: "out", childIDs: "[]" }) }
    ]), "plain"],
    "a child link pointing outside the payload": [JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: '["ghost"]' }) }
    ]), "compendium item record"],
    "malformed childIDs": [JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: "[not json" }) }
    ]), "compendium item record"],
    "a payload record that isn't an object": [JSON.stringify([{ payload: "42" }]), "plain"]
  };
  for (const [label, [datarecords, expected]] of Object.entries(cases)) {
    const c = makeCharacter("Test", { controlledby: "p1" });
    const r = await PT.sheets.addItem(c, { name: "Thing", qty: 1, datarecords });
    const written = Object.keys(integrantsOf(c)).length;
    check(label + " -> exactly one record, sheet still sane",
      r.ok && r.graph === false && written === 3,
      "ok=" + r.ok + " graph=" + r.graph + " records=" + written);
    check(label + " -> explainGraph predicts “" + expected + "”",
      PT.sheets.explainGraph({ datarecords }).willWrite === expected,
      JSON.stringify(PT.sheets.explainGraph({ datarecords }).willWrite));
    // Whatever the base, the structural fields must be ours — a stale
    // parentID or a reused id from the payload would corrupt the sheet.
    const rec = integrantsOf(c)[r.id];
    check(label + " -> structural fields are ours, not the payload's",
      rec._id === r.id && rec.parentID === "" && rec.childIDs === "[]",
      rec._id + " / " + JSON.stringify(rec.parentID) + " / " + rec.childIDs);
  }

  // ---- taking an item back off a sheet -------------------------------------
  // Taken against the character carrying the FULL graph, so the subtree
  // deletion has something to delete. Doing this against a single-record
  // compendium item would pass vacuously.
  section("taking an item back off a sheet:");
  const partial = await PT.sheets.addItem(heroG, { name: "Longsword", qty: 2, datarecords: SHEET_GRAPH });
  const take = await PT.sheets.takeItem(heroG, partial.id, 1);
  check("a partial take reports success", take.ok, take.err);
  check("a partial take does not remove the record", take.removedWholeStack === false);
  check("the stack was decremented", integrantsOf(heroG)[partial.id].quantity === 1,
    integrantsOf(heroG)[partial.id] && integrantsOf(heroG)[partial.id].quantity);
  check("the taken item carries a record graph back", !!take.item.datarecords);

  const take2 = await PT.sheets.takeItem(heroG, addG.id, 1);
  check("taking the last one reports success", take2.ok, take2.err);
  check("the whole stack was removed", take2.removedWholeStack === true);
  check("the item record is gone", !integrantsOf(heroG)[addG.id]);
  check("its Attack and Damage records went too",
    !integrantsOf(heroG)[attack._id] && !integrantsOf(heroG)[dmg._id],
    Object.keys(integrantsOf(heroG)).join(","));
  check("the parent no longer lists it",
    !JSON.parse(integrantsOf(heroG).inventory.childIDs).includes(addG.id),
    integrantsOf(heroG).inventory.childIDs);
  check("the untouched item is still there", !!integrantsOf(heroG).rope);

  // ---- round trip ----------------------------------------------------------
  // The point of keeping the graph on the way out: a weapon put in the bag
  // and claimed again later must still be a weapon.
  section("round trip (sheet -> bag -> sheet):");
  const hero2 = makeCharacter("Vex", { controlledby: "p1" });
  const back = await PT.sheets.addItem(hero2, { name: "Longsword", qty: 1, datarecords: take2.item.datarecords });
  check("a deposited compendium item keeps its weapon data too", (await (async () => {
    const h = makeCharacter("Vex", { controlledby: "p1" });
    const a = await PT.sheets.addItem(h, { name: "Longsword", qty: 1, datarecords: LONGSWORD });
    const t = await PT.sheets.takeItem(h, a.id, 1);
    const h2 = makeCharacter("Vex", { controlledby: "p1" });
    const a2 = await PT.sheets.addItem(h2, { name: "Longsword", qty: 1, datarecords: t.item.datarecords });
    const r = integrantsOf(h2)[a2.id];
    return !!(r.weaponData && r.weaponData.category === "Melee" && r.equipData.equippable === true);
  })()));
  check("the deposited item can be claimed again", back.ok, back.err);
  check("and it still rebuilds as a graph", back.graph === true, "graph=" + back.graph);
  check("with all three records", back.records === 3, back.records);
  const ints2 = integrantsOf(hero2);
  const root2 = ints2[back.id];
  const atk2 = ints2[JSON.parse(root2.childIDs)[0]];
  const dmg2 = ints2[JSON.parse(atk2.childIDs)[0]];
  check("damage dice survived the round trip", dmg2 && dmg2.dice === "1d8", dmg2 && dmg2.dice);
  check("weaponData survived the round trip",
    root2.weaponData && root2.weaponData.category === "Melee", JSON.stringify(root2.weaponData));

  // ---- refusals ------------------------------------------------------------
  // "Fail loudly, never guess" is the house rule for sheet writes.
  section("refusals:");
  const wrongSheet = makeCharacter("Legacy", { charactersheetname: "dnd5e", controlledby: "p1" });
  check("takeItem refuses an unsupported sheet",
    !(await PT.sheets.takeItem(wrongSheet, "rope", 1)).ok);
  const badVersion = makeCharacter("Future", { controlledby: "p1", sheetVersion: "99" });
  check("takeItem refuses an unrecognised sheet version",
    !(await PT.sheets.takeItem(badVersion, "rope", 1)).ok);
  check("takeItem refuses an item that isn't on the sheet",
    !(await PT.sheets.takeItem(makeCharacter("Vex", { controlledby: "p1" }), "nope", 1)).ok);
  check("addItem still refuses an unsupported sheet",
    !(await PT.sheets.addItem(wrongSheet, { name: "X", qty: 1 })).ok);

  // ---- the diagnostic ------------------------------------------------------
  // It runs on a client in trouble, so it must not throw on anything it might
  // meet — including a character it can't find and a payload it rejected.
  section("the report() diagnostic:");
  win.Campaign.characters.models = [hero2];
  const rep = await PT.sheets.report(hero2.get("name"));
  check("it reports the sheet's item records", Array.isArray(rep.sheet), JSON.stringify(rep.sheet).slice(0, 120));
  check("it shows the Item, Attack and Damage records",
    ["Item", "Attack", "Damage"].every(t => rep.sheet.some(r => r.type === t)),
    rep.sheet.map(r => r.type).join(","));
  check("each record carries its parent's type, for spotting misplacement",
    rep.sheet.every(r => !!r.parentType), JSON.stringify(rep.sheet[0]));
  check("it lists field names so a native weapon can be diffed against ours",
    rep.sheet.every(r => typeof r.keys === "string" && r.keys.length));
  check("it reports the ancestry chain, not just the parent",
    rep.sheet.every(r => /\(root\)$/.test(r.ancestry || "")),
    JSON.stringify(rep.sheet.map(r => r.ancestry)));
  check("an Attack's ancestry shows it hanging off the Item",
    /^Attack < Item </.test(rep.sheet.find(r => r.type === "Attack").ancestry),
    rep.sheet.find(r => r.type === "Attack").ancestry);
  check("it counts every record type on the sheet",
    rep.typeCounts && rep.typeCounts.Item >= 1 && rep.typeCounts.Attack === 1,
    JSON.stringify(rep.typeCounts));
  check("values are withheld unless full is asked for", rep.sheet.every(r => r.record === undefined));
  const full = await PT.sheets.report(hero2.get("name"), { full: true });
  check("full: true includes the record values",
    full.sheet.every(r => typeof r.record === "string" && r.record.length),
    JSON.stringify(full.sheet[0] && full.sheet[0].record || "").slice(0, 120));

  // weaponDump: the focused one, because a whole sheet doesn't fit in a
  // console paste.
  const wd = await PT.sheets.weaponDump(hero2.get("name"), "longsword");
  check("weaponDump finds the item by a case-insensitive partial name", wd.found === 1, wd.found);
  check("it dumps the whole subtree with values",
    wd.items[0].subtree.length === 3 && wd.items[0].subtree.every(r => r.record.length),
    JSON.stringify(wd.items[0].subtree.map(r => r.type)));
  check("it reports what the item hangs off", !!wd.items[0].parent, JSON.stringify(wd.items[0].parent));
  check("it reports the ancestry", /\(root\)$/.test(wd.items[0].ancestry), wd.items[0].ancestry);
  check("it has a related list for attacks attached elsewhere",
    Array.isArray(wd.items[0].related));
  const wdMiss = await PT.sheets.weaponDump("Nobody At All", "x");
  check("an unknown character lists the names it does know",
    Array.isArray(wdMiss.knownNames) && wdMiss.knownNames.includes(hero2.get("name")),
    JSON.stringify(wdMiss.knownNames));

  const missing = await PT.sheets.report("Nobody At All");
  check("report also lists known names on a miss",
    Array.isArray(missing.knownNames), JSON.stringify(missing.knownNames));
  check("an unknown character is reported, not thrown", typeof missing.sheet === "string", missing.sheet);
  check("a rejected payload shows its raw shape for diagnosis",
    !!PT.sheets.explainGraph({ datarecords: '[{"blob":"x"}]' }).rawFirst,
    JSON.stringify(PT.sheets.explainGraph({ datarecords: '[{"blob":"x"}]' })));

  report("sheets");
})();
