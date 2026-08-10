// sheets.js — the riskiest code in the extension, because it writes into a
// real player's character. Covers the compendium record-graph replay (a
// claimed weapon arriving as a weapon), taking an item back off a sheet, and
// the party-visibility filter that decides who a player may split coins with.
//
// KNOWN LIMIT, read before trusting a green run: LONGSWORD below is a
// reconstruction of the compendium payload, inferred from drops.js's parser
// and the S2/S3 spike findings — not a captured sample. These tests prove the
// logic is right GIVEN that shape. They cannot prove the shape. Confirm that
// separately with PT.sheets.explainGraph() against a real drop in a test game
// (snippet (a2) at the bottom of extension/src/sheets.js).
const { createWorld, makeCharacter, integrantsOf } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

const { win, PT } = createWorld({ scripts: ["util.js", "sheets.js"] });

// Item -> Attack -> Damage, the Item's parent pointing at the compendium page
// (i.e. outside the payload set, which is what marks it as the root).
const LONGSWORD = JSON.stringify([
  { payload: JSON.stringify({ _id: "ls", type: "Item", name: "Longsword", quantity: 1, parentID: "page-root", childIDs: '["atk"]', weight: 3, cost: "15 GP", rarity: "", description: "Versatile (1d10)", properties: ["Versatile", "Martial"] }) },
  { payload: JSON.stringify({ _id: "atk", type: "Attack", name: "Longsword", parentID: "ls", childIDs: '["dmg"]', attackType: "Melee", proficient: true, ability: "strength" }) },
  { payload: JSON.stringify({ _id: "dmg", type: "Damage", name: "Slashing", parentID: "atk", childIDs: "[]", dice: "1d8", damageType: "slashing" }) }
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

  // ---- claiming a weapon ---------------------------------------------------
  section("claiming a compendium weapon keeps its records:");
  const hero = makeCharacter("Vex", { controlledby: "p1" });
  const add = await PT.sheets.addItem(hero, {
    name: "Longsword", qty: 2, description: "Versatile (1d10)",
    weight: 3, cost: "15 GP", rarity: "", datarecords: LONGSWORD
  });
  check("the write reports success", add.ok, add.err);
  check("it took the graph path, not the plain-item path", add.graph === true);
  check("all three records were written", add.records === 3, add.records);

  const ints = integrantsOf(hero);
  const root = ints[add.id];
  check("the item landed under the character's own item parent",
    root && root.parentID === "inventory", root && root.parentID);
  check("the parent registered it as a child",
    JSON.parse(ints.inventory.childIDs).includes(add.id), ints.inventory.childIDs);
  check("the compendium's ids were NOT reused",
    !ints.ls && !ints.atk && !ints.dmg, Object.keys(ints).join(", "));
  check("quantity came from the claim, not the compendium",
    root.quantity === 2, root && root.quantity);

  const attack = ints[JSON.parse(root.childIDs)[0]];
  check("the Attack record came with it", attack && attack.type === "Attack", attack && attack.type);
  check("the Attack points back at the new item id",
    attack && attack.parentID === add.id, attack && attack.parentID);
  const dmg = ints[JSON.parse(attack.childIDs)[0]];
  check("the Damage record came with it", dmg && dmg.type === "Damage", dmg && dmg.type);
  check("damage dice survived", dmg && dmg.dice === "1d8", dmg && dmg.dice);
  check("weapon properties survived",
    root.properties && root.properties.join(",") === "Versatile,Martial", JSON.stringify(root.properties));
  check("the character's pre-existing item was left alone", !!ints.rope);

  // ---- malformed payloads --------------------------------------------------
  // Every one of these must degrade to the plain-item write, never write a
  // half-understood graph into somebody's character.
  section("malformed payloads fall back instead of writing nonsense:");
  const cases = {
    "not JSON at all": "{{{",
    "a record with no id": JSON.stringify([{ payload: JSON.stringify({ type: "Item", name: "X" }) }]),
    "two roots": JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: "[]" }) },
      { payload: JSON.stringify({ _id: "b", type: "Item", name: "B", parentID: "out", childIDs: "[]" }) }
    ]),
    "a root that isn't an Item": JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Attack", name: "A", parentID: "out", childIDs: "[]" }) }
    ]),
    "a child link pointing outside the payload": JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: '["ghost"]' }) }
    ]),
    "malformed childIDs": JSON.stringify([
      { payload: JSON.stringify({ _id: "a", type: "Item", name: "A", parentID: "out", childIDs: "[not json" }) }
    ])
  };
  for (const [label, datarecords] of Object.entries(cases)) {
    const c = makeCharacter("Test", { controlledby: "p1" });
    const r = await PT.sheets.addItem(c, { name: "Thing", qty: 1, datarecords });
    const written = Object.keys(integrantsOf(c)).length;
    check(label + " -> one plain item, sheet still sane",
      r.ok && r.graph === false && written === 3,
      "ok=" + r.ok + " graph=" + r.graph + " records=" + written);
    check(label + " -> explainGraph says why", PT.sheets.explainGraph({ datarecords }).graph === false);
  }

  // ---- taking an item back off a sheet -------------------------------------
  section("taking an item back off a sheet:");
  const take = await PT.sheets.takeItem(hero, add.id, 1);
  check("a partial take reports success", take.ok, take.err);
  check("a partial take does not remove the record", take.removedWholeStack === false);
  check("the stack was decremented", integrantsOf(hero)[add.id].quantity === 1,
    integrantsOf(hero)[add.id] && integrantsOf(hero)[add.id].quantity);
  check("the taken item carries a record graph back", !!take.item.datarecords);

  const take2 = await PT.sheets.takeItem(hero, add.id, 1);
  check("taking the last one reports success", take2.ok, take2.err);
  check("the whole stack was removed", take2.removedWholeStack === true);
  check("the item record is gone", !integrantsOf(hero)[add.id]);
  check("its Attack and Damage records went too",
    !integrantsOf(hero)[attack._id] && !integrantsOf(hero)[dmg._id]);
  check("the parent no longer lists it",
    !JSON.parse(integrantsOf(hero).inventory.childIDs).includes(add.id),
    integrantsOf(hero).inventory.childIDs);
  check("the untouched item is still there", !!integrantsOf(hero).rope);

  // ---- round trip ----------------------------------------------------------
  // The point of keeping the graph on the way out: a weapon put in the bag
  // and claimed again later must still be a weapon.
  section("round trip (sheet -> bag -> sheet):");
  const hero2 = makeCharacter("Vex", { controlledby: "p1" });
  const back = await PT.sheets.addItem(hero2, { name: "Longsword", qty: 1, datarecords: take2.item.datarecords });
  check("the deposited item can be claimed again", back.ok, back.err);
  check("and it still rebuilds as a graph", back.graph === true, "graph=" + back.graph);
  check("with all three records", back.records === 3, back.records);
  const ints2 = integrantsOf(hero2);
  const root2 = ints2[back.id];
  const atk2 = ints2[JSON.parse(root2.childIDs)[0]];
  const dmg2 = ints2[JSON.parse(atk2.childIDs)[0]];
  check("damage dice survived the round trip", dmg2 && dmg2.dice === "1d8", dmg2 && dmg2.dice);
  check("properties survived the round trip",
    root2.properties && root2.properties.join(",") === "Versatile,Martial", JSON.stringify(root2.properties));

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

  report("sheets");
})();
