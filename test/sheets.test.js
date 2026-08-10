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

// Captured verbatim from a real drop with PT.sheets.payloadDump (Aug 2026).
// Five records in the order [Item, Attack, Damage, Attack, Damage] — each
// Damage belongs to the Attack it follows, which is the only pairing signal
// there is, since none of these records carry ids or links.
const LONGSWORD = JSON.stringify([
  { name: "Longsword", payload: JSON.stringify({
    type: "Item", name: "Longsword",
    description: "Versatile. A Versatile weapon can be used with one or two hands. A damage value in parentheses appears with the property. The weapon deals that damage when used with two hands to make a melee attack.\nDamage: 1d8 (1d10)\nDamage Type: Slashing\nProperties: Versatile\nMastery: Sap\nWeight: 3",
    weight: 3, properties: ["Versatile (1d10)"], cost: "15 GP",
    weaponData: { category: "Melee", training: "Martial", type: "Longsword" },
    equipData: { equippable: true }
  }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Attack", name: "Longsword (One-Handed)", attack: { type: "Melee", abilityBonus: "Strength" } }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Damage", ability: "auto", damageType: "Slashing", diceSize: "d8" }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Attack", name: "Longsword (Two-Handed)", attack: { type: "Melee", abilityBonus: "Strength" } }) },
  { name: "Longsword", payload: JSON.stringify({ type: "Damage", ability: "auto", damageType: "Slashing", diceSize: "d10" }) }
]);

// Captured verbatim with payloadDump (Aug 2026). Note the Item carries
// armorData, but the AC VALUE lives in the separate Armor Class record —
// which is why armour used to equip, display, and grant nothing.
const BREASTPLATE = JSON.stringify([
  { payload: JSON.stringify({
    type: "Item", name: "Adamantine Breastplate",
    description: "This suit of armor is reinforced with adamantine...",
    weight: 20, properties: [], cost: "800 GP", rarity: "Uncommon",
    armorData: { category: "Medium", type: "Breastplate", bonusCap: 2, ability: "Dexterity" },
    equipData: { equippable: true }
  }) },
  { payload: JSON.stringify({ type: "Armor Class", calculation: "Set Base", source: "Armor", valueFormula: { flatValue: 14 } }) },
  { payload: JSON.stringify({ type: "Defense", defense: "Immunity", damage: "Critical Hit", details: "...becomes a normal hit." }) }
]);

// The same two records in the OPPOSITE order, exactly as the Adamantine
// Chain Shirt carries them. Armour must not be paired by position.
const CHAIN_SHIRT = JSON.stringify([
  { payload: JSON.stringify({ type: "Item", name: "Adamantine Chain Shirt", armorData: { category: "Medium" }, equipData: { equippable: true } }) },
  { payload: JSON.stringify({ type: "Defense", defense: "Immunity", damage: "Critical Hit" }) },
  { payload: JSON.stringify({ type: "Armor Class", calculation: "Set Base", source: "Armor", valueFormula: { flatValue: 13 } }) }
]);

// Captured with payloadDump (Aug 2026). Three records, and the effect is
// NOT a sibling of the item — see the assertions below.
const AMULET = JSON.stringify([
  { payload: JSON.stringify({
    type: "Item", name: "Amulet of Health",
    description: "Your Constitution is 19 while you wear this amulet...",
    weight: "1", properties: [], cost: "4005 GP", rarity: "Rare",
    equipData: { equippable: true }
  }) },
  { payload: JSON.stringify({ type: "Attunement", requireEquip: true }) },
  { payload: JSON.stringify({ type: "Ability Score", ability: "Constitution", calculation: "Minimum", valueFormula: { flatValue: 19 } }) }
]);

// Captured with payloadDump (Aug 2026). Eleven records: a magic weapon whose
// attacks hang off the ITEM while its abilities hang off the ATTUNEMENT.
const ACHERON = JSON.stringify([
  { payload: JSON.stringify({ type: "Item", name: "Acheron Longsword", weight: 3, properties: ["Versatile"], rarity: "Rare",
    weaponData: { category: "Melee", training: "Martial", type: "Longsword" }, equipData: { equippable: true } }) },
  { payload: JSON.stringify({ type: "Attunement", requireEquip: true }) },
  { payload: JSON.stringify({ type: "Attack", name: "Acheron Longsword", attack: { type: "Melee", abilityBonus: "Strength", bonus: 1 }, actionType: "Action" }) },
  { payload: JSON.stringify({ type: "Damage", ability: "auto", bonus: 1, damageType: "Slashing", diceSize: "d8" }) },
  { payload: JSON.stringify({ type: "Attack", name: "Acheron Longsword (Two-handed)", attack: { type: "Melee", abilityBonus: "Strength", bonus: 1 }, actionType: "Action" }) },
  { payload: JSON.stringify({ type: "Damage", ability: "auto", bonus: 1, damageType: "Slashing", diceSize: "d10" }) },
  { payload: JSON.stringify({ type: "Action", name: "Dark Blessing (Acheron Longsword)", description: "...temporary hit points.", actionType: "Action", excludeFamilialResources: false }) },
  { payload: JSON.stringify({ type: "Resource", name: "Dark Blessing", value: 1, maxValueFormula: { flatValue: 1 }, recoveryRate: { Other: { type: "Full" } } }) },
  { payload: JSON.stringify({ type: "Healing", ability: "none", _bonus: 4, isTemp: true, diceCount: 1, diceSize: "d4" }) },
  { payload: JSON.stringify({ type: "Action", name: "Disheartening Strike (Acheron Longsword)", description: "...unsettling dread.", actionType: "Free Action", excludeFamilialResources: false }) },
  { payload: JSON.stringify({ type: "Resource", name: "Disheartening Strike", value: 1, maxValueFormula: { flatValue: 1 }, recoveryRate: { Other: { type: "Full" } } }) }
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
  check("it wrote both attacks", add.attacks === 2, add.attacks);
  check("it wrote all five records", add.records === 5, add.records);
  check("nothing was left unwritten", add.unwritten === 0, add.unwritten);

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
  check("it got a fresh id", root._id === add.id, root._id);
  check("recordName tracks the name", root.recordName === "Longsword", root.recordName);
  check("the character's pre-existing item was left alone", !!ints.rope);

  // The wiring, asserted field by field against what a Roll20-made longsword
  // looks like. This is the part that decides whether the weapon can be
  // rolled, so it is checked rather than assumed.
  section("the attack wiring matches a sheet-made weapon:");
  const attackIds = JSON.parse(root.childIDs);
  check("the item lists both attacks as children", attackIds.length === 2, root.childIDs);
  const a1 = ints[attackIds[0]], a2 = ints[attackIds[1]];
  check("attacks are named as the compendium named them",
    a1.name === "Longsword (One-Handed)" && a2.name === "Longsword (Two-Handed)",
    a1.name + " / " + a2.name);
  check("each attack is a child of the item",
    a1.parentID === add.id && a2.parentID === add.id, a1.parentID + " / " + a2.parentID);
  check("each attack is SOURCED from the item",
    a1.sourceID === add.id && a1.source === "Item", a1.sourceID + " / " + a1.source);
  check("each attack cascades off the item being equipped",
    a1.cascades[add.id] === '["Equip"]', JSON.stringify(a1.cascades));
  check("attacks get an actionType the payload didn't supply",
    a1.actionType === "Action", a1.actionType);
  check("the attack's own roll data survived",
    a1.attack && a1.attack.abilityBonus === "Strength" && a1.attack.type === "Melee",
    JSON.stringify(a1.attack));

  const d1 = ints[JSON.parse(a1.childIDs)[0]], d2 = ints[JSON.parse(a2.childIDs)[0]];
  check("each attack has exactly one damage record", !!d1 && !!d2);
  check("damage is parented to its ATTACK",
    d1.parentID === a1._id && d2.parentID === a2._id, d1.parentID + " / " + d2.parentID);
  check("but damage is SOURCED from the item, not the attack",
    d1.sourceID === add.id && d1.source === "Item", d1.sourceID + " / " + d1.source);
  check("damage cascades off the item too",
    d1.cascades[add.id] === '["Equip"]', JSON.stringify(d1.cascades));
  // Order is the only pairing signal: d8 belongs to one-handed, d10 to
  // two-handed. Getting this backwards would silently mis-arm the weapon.
  check("the d8 went to the one-handed attack", d1.diceSize === "d8", d1.diceSize);
  check("the d10 went to the two-handed attack", d2.diceSize === "d10", d2.diceSize);
  check("damage type survived", d1.damageType === "Slashing", d1.damageType);
  check("a dice count was supplied, since the payload omits it",
    d1._diceCount === 1, d1._diceCount);
  check("crit fields the sheet expects are present",
    d1.critDiceSize === "" && d1.overrideCrit === false,
    JSON.stringify(d1.critDiceSize) + " / " + d1.overrideCrit);
  check("damage records got a name, since the payload has none",
    /Longsword \(One-Handed\)/.test(d1.name), d1.name);

  // Armour. Every assertion here is against a Breastplate that Roll20 itself
  // put on a character (weaponDump, Aug 2026) — the three differences from
  // the Attack rule are the whole point.
  section("armour: the AC record is written as the sheet writes it:");
  const armourChar2 = makeCharacter("Vex", { controlledby: "p1" });
  const bp = await PT.sheets.addItem(armourChar2, {
    name: "Adamantine Breastplate", qty: 1,
    datarecords: BREASTPLATE, compendiumPageID: "66a7b11eb69ce10013cfd429"
  });
  check("the write succeeds", bp.ok, bp.err);
  check("it writes the item plus both child records", bp.records === 3, bp.records);
  check("neither is counted as an attack", bp.attacks === 0, bp.attacks);
  check("both are counted as item children", bp.itemChildren === 2, bp.itemChildren);
  check("nothing is left unwritten now", bp.unwritten === 0, JSON.stringify(bp.unwrittenTypes));

  const aInts = integrantsOf(armourChar2);
  const bpItem = aInts[bp.id];
  check("armorData still rides on the item",
    bpItem.armorData && bpItem.armorData.bonusCap === 2, JSON.stringify(bpItem.armorData));
  const kids = JSON.parse(bpItem.childIDs).map(id => aInts[id]);
  const ac = kids.find(r => r.type === "Armor Class");
  const def = kids.find(r => r.type === "Defense");
  check("the item lists both children", kids.length === 2, bpItem.childIDs);
  check("the AC record is a child of the item", ac && ac.parentID === bp.id, ac && ac.parentID);
  check("the AC VALUE came across — the whole point",
    ac.valueFormula && ac.valueFormula.flatValue === 14, JSON.stringify(ac.valueFormula));
  check("calculation survived", ac.calculation === "Set Base", ac.calculation);
  // The three ways armour differs from an attack. Getting any of these wrong
  // yields an AC that looks plausible and computes wrongly.
  check("source stays the payload's \"Armor\", NOT provenance \"Item\"",
    ac.source === "Armor", ac.source);
  check("no sourceID is written, unlike an Attack", ac.sourceID === undefined, ac.sourceID);
  check("no cascades are written, unlike an Attack", ac.cascades === undefined, JSON.stringify(ac.cascades));
  check("it is named the way the sheet names it", ac.name === "Adamantine Breastplate AC", ac.name);
  check("defaultAbility is set, as on the sheet's own record",
    ac.defaultAbility === false, ac.defaultAbility);
  check("the compendium page id reaches the child records",
    ac.compendiumPageID === "66a7b11eb69ce10013cfd429", ac.compendiumPageID);
  check("the Defense record is written too, parented to the item",
    def && def.parentID === bp.id && def.defense === "Immunity", JSON.stringify(def && def.defense));
  check("Defense keeps its own detail fields", def.damage === "Critical Hit", def.damage);

  // The trap: the same two records arrive in either order on real armour.
  section("armour is order-independent, unlike Attack/Damage:");
  const shirtChar = makeCharacter("Vex", { controlledby: "p1" });
  const shirt = await PT.sheets.addItem(shirtChar, { name: "Adamantine Chain Shirt", qty: 1, datarecords: CHAIN_SHIRT });
  const sInts = integrantsOf(shirtChar);
  const sKids = JSON.parse(sInts[shirt.id].childIDs).map(id => sInts[id]);
  const sAc = sKids.find(r => r.type === "Armor Class");
  check("Defense-then-ArmorClass writes both", sKids.length === 2, sInts[shirt.id].childIDs);
  check("and the AC value is still right",
    sAc.valueFormula.flatValue === 13, JSON.stringify(sAc && sAc.valueFormula));
  check("neither attached itself to the other",
    sKids.every(r => r.parentID === shirt.id), JSON.stringify(sKids.map(r => r.parentID)));

  // Magic items. Asserted against an Amulet of Health that Roll20 itself put
  // on a character (weaponDump, Aug 2026). The shape is a CHAIN, not a flat
  // set — the effect hangs off the attunement, not the item.
  section("magic items: the effect hangs off the attunement:");
  const amuletChar = makeCharacter("Vex", { controlledby: "p1" });
  const am = await PT.sheets.addItem(amuletChar, {
    name: "Amulet of Health", qty: 1,
    datarecords: AMULET, compendiumPageID: "66e80318fc2ee400308b4730"
  });
  check("the write succeeds", am.ok, am.err);
  check("all three records are written", am.records === 3, am.records);
  check("nothing is left unwritten", am.unwritten === 0, JSON.stringify(am.unwrittenTypes));

  const mInts = integrantsOf(amuletChar);
  const amItem = mInts[am.id];
  const amKids = JSON.parse(amItem.childIDs);
  check("the item has exactly ONE child, the attunement", amKids.length === 1, amItem.childIDs);
  const attune = mInts[amKids[0]];
  check("that child is the Attunement", attune.type === "Attunement", attune.type);
  check("the attunement is parented to the item", attune.parentID === am.id, attune.parentID);
  check("requireEquip survived from the payload", attune.requireEquip === true, attune.requireEquip);
  check("it is named as the sheet names it",
    attune.name === "Amulet of Health Attunement", attune.name);
  // Deliberately NOT auto-attuned: attunement slots are limited to three and
  // spending one silently would be worse than the player ticking a box.
  check("it is NOT auto-attuned", attune._attuned === false, attune._attuned);

  const abilityId = JSON.parse(attune.childIDs)[0];
  const ability = mInts[abilityId];
  check("the Ability Score is a child of the ATTUNEMENT, not the item",
    ability && ability.parentID === attune._id, ability && ability.parentID);
  check("it is NOT a child of the item",
    !amKids.includes(abilityId), amItem.childIDs);
  check("the effect itself came across",
    ability.ability === "Constitution" && ability.valueFormula.flatValue === 19,
    JSON.stringify(ability.valueFormula));
  check("calculation survived", ability.calculation === "Minimum", ability.calculation);
  check("it is named after the ABILITY, as the sheet names it",
    ability.name === "Amulet of Health Constitution", ability.name);
  check("neither carries sourceID or cascades, unlike an Attack",
    attune.sourceID === undefined && attune.cascades === undefined &&
    ability.sourceID === undefined && ability.cascades === undefined);
  check("both get an empty source, as the sheet's own records do",
    attune.source === "" && ability.source === "", attune.source + "/" + ability.source);
  check("the page id reaches the whole chain",
    ability.compendiumPageID === "66e80318fc2ee400308b4730", ability.compendiumPageID);

  // An Ability Score with no Attunement in front of it must still land
  // somewhere sensible rather than being dropped.
  const looseChar = makeCharacter("Vex", { controlledby: "p1" });
  const loose = await PT.sheets.addItem(looseChar, {
    name: "Odd Charm", qty: 1,
    datarecords: JSON.stringify([
      { payload: JSON.stringify({ type: "Item", name: "Odd Charm" }) },
      { payload: JSON.stringify({ type: "Ability Score", ability: "Strength", valueFormula: { flatValue: 21 } }) }
    ])
  });
  const lInts = integrantsOf(looseChar);
  check("an Ability Score with no attunement falls back to the item",
    lInts[JSON.parse(lInts[loose.id].childIDs)[0]].parentID === loose.id);
  check("and is not counted as unwritten", loose.unwritten === 0, loose.unwritten);

  // The full magic weapon. Asserted against an Acheron Longsword that Roll20
  // itself added (weaponDump, Aug 2026) — attacks on the item, abilities
  // under the attunement, resources under their action.
  section("a magic weapon: attacks on the item, abilities under the attunement:");
  const magicChar = makeCharacter("Vex", { controlledby: "p1" });
  const ach = await PT.sheets.addItem(magicChar, {
    name: "Acheron Longsword", qty: 1,
    datarecords: ACHERON, compendiumPageID: "65e1b9f5c693a3001280987a"
  });
  check("the write succeeds", ach.ok, ach.err);
  check("all eleven records are written", ach.records === 11, ach.records);
  check("nothing is left unwritten", ach.unwritten === 0, JSON.stringify(ach.unwrittenTypes));

  const gInts = integrantsOf(magicChar);
  const gItem = gInts[ach.id];
  const gKids = JSON.parse(gItem.childIDs).map(id => gInts[id]);
  check("the item's children are the attunement and BOTH attacks",
    gKids.length === 3 && gKids.filter(r => r.type === "Attack").length === 2 &&
    gKids.filter(r => r.type === "Attunement").length === 1,
    gKids.map(r => r.type).join(","));
  check("attacks parent to the ITEM, not the attunement",
    gKids.filter(r => r.type === "Attack").every(r => r.parentID === ach.id));

  const gAttune = gKids.find(r => r.type === "Attunement");
  const actions = JSON.parse(gAttune.childIDs).map(id => gInts[id]);
  check("both abilities hang off the ATTUNEMENT", actions.length === 2, actions.length);
  check("and they are Actions", actions.every(r => r.type === "Action"),
    actions.map(r => r.type).join(","));
  const dark = actions.find(r => /Dark Blessing/.test(r.name));
  const dis = actions.find(r => /Disheartening/.test(r.name));
  check("an Action carries source and sourceID, like an Attack",
    dark.source === "Item" && dark.sourceID === ach.id, dark.source + "/" + dark.sourceID);
  check("actionType survives — one is a Free Action",
    dark.actionType === "Action" && dis.actionType === "Free Action",
    dark.actionType + "/" + dis.actionType);
  check("recordName follows the sheet's pattern",
    dark.recordName === "Acheron Longsword Dark Blessing Action", dark.recordName);
  check("including the Free Action variant",
    dis.recordName === "Acheron Longsword Disheartening Strike Free Action", dis.recordName);

  const darkKids = JSON.parse(dark.childIDs).map(id => gInts[id]);
  const res = darkKids.find(r => r.type === "Resource");
  const heal = darkKids.find(r => r.type === "Healing");
  check("the Resource and Healing are children of their ACTION",
    darkKids.length === 2 && res.parentID === dark._id && heal.parentID === dark._id,
    darkKids.map(r => r.type).join(","));
  check("the resource's uses survived",
    res.value === 1 && res.maxValueFormula.flatValue === 1, JSON.stringify(res.maxValueFormula));
  check("its recovery rate survived",
    res.recoveryRate && res.recoveryRate.Other.type === "Full", JSON.stringify(res.recoveryRate));
  // Generated, not copied: the payload has no relations, and the id is ours.
  check("the Action declares that it USES that resource",
    dark.relations && dark.relations[res._id] === "uses", JSON.stringify(dark.relations));
  check("the second action points at its own resource",
    dis.relations && dis.relations[JSON.parse(dis.childIDs)[0]] === "uses", JSON.stringify(dis.relations));
  check("the two actions do not share a resource",
    Object.keys(dark.relations)[0] !== Object.keys(dis.relations)[0]);

  // The payload sends diceCount; the sheet stores _diceCount.
  check("healing dice count is renamed to _diceCount",
    heal._diceCount === 1 && heal.diceCount === undefined,
    heal._diceCount + " / " + heal.diceCount);
  check("healing keeps its bonus, dice and temp flag",
    heal._bonus === 4 && heal.diceSize === "d4" && heal.isTemp === true,
    JSON.stringify([heal._bonus, heal.diceSize, heal.isTemp]));
  check("healing is named as the sheet names it",
    heal.name === "Acheron Longsword Dark Blessing Temp HP", heal.name);
  check("crit fields the sheet expects are present",
    heal.critDiceSize === "" && heal.overrideCrit === false);

  // Both attacks still work exactly as the plain weapon does.
  const gAtk = gKids.filter(r => r.type === "Attack");
  check("each attack still has its own damage",
    gAtk.every(a => JSON.parse(a.childIDs).length === 1));
  check("and the +1 magic bonus survived on the attack",
    gAtk[0].attack.bonus === 1, JSON.stringify(gAtk[0].attack));

  // A Resource with no Action in front of it has nowhere to go.
  const orphanRes = await PT.sheets.addItem(makeCharacter("Vex", { controlledby: "p1" }), {
    name: "Odd Thing", qty: 1,
    datarecords: JSON.stringify([
      { payload: JSON.stringify({ type: "Item", name: "Odd Thing" }) },
      { payload: JSON.stringify({ type: "Resource", name: "Nothing to spend" }) }
    ])
  });
  check("a Resource with no Action is reported, not guessed at",
    orphanRes.unwritten === 1 && orphanRes.unwrittenTypes.join(",") === "Resource",
    orphanRes.unwritten + "/" + JSON.stringify(orphanRes.unwrittenTypes));

  // A weapon must be untouched by the armour rule.
  section("the weapon path is unaffected:");
  check("a weapon still writes 5 records with 2 attacks",
    add.records === 5 && add.attacks === 2, add.records + "/" + add.attacks);
  check("a weapon's attack still carries sourceID and cascades",
    a1.sourceID === add.id && !!a1.cascades, a1.sourceID);
  check("a weapon reports no item children", add.itemChildren === 0, add.itemChildren);

  section("a payload with no attacks writes just the item:");
  const plainChar = makeCharacter("Vex", { controlledby: "p1" });
  const torch = await PT.sheets.addItem(plainChar, {
    name: "Torch", qty: 1,
    datarecords: JSON.stringify([{ payload: JSON.stringify({ type: "Item", name: "Torch", weight: 1 }) }])
  });
  check("a non-weapon writes one record", torch.records === 1 && torch.attacks === 0,
    torch.records + " / " + torch.attacks);
  check("and still uses its compendium record", torch.fromCompendium === true);

  section("a Damage with no preceding Attack is skipped, not guessed at:");
  const orphanChar = makeCharacter("Vex", { controlledby: "p1" });
  const orphan = await PT.sheets.addItem(orphanChar, {
    name: "Odd", qty: 1,
    datarecords: JSON.stringify([
      { payload: JSON.stringify({ type: "Item", name: "Odd" }) },
      { payload: JSON.stringify({ type: "Damage", diceSize: "d6" }) }
    ])
  });
  check("the item is written, the stray damage is not",
    orphan.ok && orphan.records === 1 && orphan.attacks === 0,
    orphan.records + " / " + orphan.attacks);
  check("and the loss is reported, not silent",
    orphan.unwritten === 1 && orphan.unwrittenTypes.join(",") === "Damage",
    orphan.unwritten + " / " + JSON.stringify(orphan.unwrittenTypes));
  check("no Damage record reached the sheet",
    !Object.values(integrantsOf(orphanChar)).some(r => r.type === "Damage"),
    Object.values(integrantsOf(orphanChar)).map(r => r.type).join(","));

  // The case behind "will armour have the same problem?": anything whose
  // function lives in records we have no rule for. A container's contents
  // arrive as extra Item records and used to be dropped WITHOUT being
  // counted, which made them the one loss nobody was told about.
  section("data we can't write is counted and named:");
  const packChar = makeCharacter("Vex", { controlledby: "p1" });
  const pack = await PT.sheets.addItem(packChar, {
    name: "Explorer's Pack", qty: 1,
    datarecords: JSON.stringify([
      { payload: JSON.stringify({ type: "Item", name: "Explorer's Pack" }) },
      { payload: JSON.stringify({ type: "Item", name: "Rope" }) },
      { payload: JSON.stringify({ type: "Item", name: "Torch" }) }
    ])
  });
  check("a container's contents are reported as unwritten",
    pack.unwritten === 2 && pack.unwrittenTypes.join(",") === "Item,Item",
    pack.unwritten + " / " + JSON.stringify(pack.unwrittenTypes));
  const armourChar = makeCharacter("Vex", { controlledby: "p1" });
  const armour = await PT.sheets.addItem(armourChar, {
    name: "Amulet of Health", qty: 1,
    datarecords: JSON.stringify([
      { payload: JSON.stringify({ type: "Item", name: "Amulet of Health", armorData: { ac: 16 } }) },
      { payload: JSON.stringify({ type: "Sense", sense: "Darkvision", range: 60 }) }
    ])
  });
  check("a type with no rule yet is named, so a bug report can point at it",
    armour.unwritten === 1 && armour.unwrittenTypes.join(",") === "Sense",
    armour.unwritten + " / " + JSON.stringify(armour.unwrittenTypes));
  check("the item itself still lands with its own data",
    integrantsOf(armourChar)[armour.id].armorData.ac === 16,
    JSON.stringify(integrantsOf(armourChar)[armour.id].armorData));
  check("and the item is written even though part of it was not",
    integrantsOf(armourChar)[armour.id].name === "Amulet of Health");
  check("a weapon reports nothing unwritten", add.unwrittenTypes.length === 0,
    JSON.stringify(add.unwrittenTypes));

  // The link back to the compendium entry. Sheet-made records all carry it;
  // ours carried none, because drops.js read the id only to check the lookup
  // had worked and then dropped it.
  section("the compendium page id is carried onto the sheet:");
  const pageChar = makeCharacter("Vex", { controlledby: "p1" });
  const paged = await PT.sheets.addItem(pageChar, {
    name: "Longsword", qty: 1, datarecords: LONGSWORD,
    compendiumPageID: "66a7b0b4b69ce10013cfb325"
  });
  const pInts = integrantsOf(pageChar);
  check("the item record carries it",
    pInts[paged.id].compendiumPageID === "66a7b0b4b69ce10013cfb325",
    pInts[paged.id].compendiumPageID);
  const pAttack = pInts[JSON.parse(pInts[paged.id].childIDs)[0]];
  check("its attacks carry it too",
    pAttack.compendiumPageID === "66a7b0b4b69ce10013cfb325", pAttack.compendiumPageID);
  check("and its damage records",
    pInts[JSON.parse(pAttack.childIDs)[0]].compendiumPageID === "66a7b0b4b69ce10013cfb325");
  check("an item with no page id is still written fine",
    integrantsOf(armourChar)[armour.id].compendiumPageID === undefined,
    integrantsOf(armourChar)[armour.id].compendiumPageID);

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
  const wdNoItem = await PT.sheets.weaponDump(hero2.get("name"), "Nonexistent Armour");
  check("a name that matches nothing lists the sheet's item names",
    Array.isArray(wdNoItem.itemsOnSheet) && wdNoItem.itemsOnSheet.includes("Longsword"),
    JSON.stringify(wdNoItem.itemsOnSheet));
  const wdMiss = await PT.sheets.weaponDump("Nobody At All", "x");
  check("an unknown character lists the names it does know",
    Array.isArray(wdMiss.knownNames) && wdMiss.knownNames.includes(hero2.get("name")),
    JSON.stringify(wdMiss.knownNames));

  // The probes behind "let the sheet build the item". probeEnrich WRITES, so
  // its safety behaviour is worth testing: it must clean up after itself, and
  // must report honestly when the sheet does nothing (which is the expected
  // answer against a stub that has no sheet logic at all).
  section("the enrichment probe:");
  const probeChar = makeCharacter("Vex", { controlledby: "p1" });
  win.Campaign.characters.models = [probeChar];
  const before = Object.keys(integrantsOf(probeChar)).length;
  const probe = await PT.sheets.probeEnrich(probeChar.get("name"), "66a7b0b4b69ce10013cfb325", { waitMs: 10 });
  check("it writes a bare record and finds it", probe.stillThere === true, JSON.stringify(probe.error));
  check("it reports no enrichment against a stub with no sheet logic",
    /no enrichment/.test(probe.verdict), probe.verdict);
  check("it names the fields it wrote", /compendiumPageID/.test(probe.wroteKeys), probe.wroteKeys);
  check("it cleans the probe item off the sheet", /removed/.test(probe.cleanup), probe.cleanup);
  check("the sheet is back exactly as it was",
    Object.keys(integrantsOf(probeChar)).length === before,
    Object.keys(integrantsOf(probeChar)).length + " vs " + before);
  const probeMiss = await PT.sheets.probeEnrich("Nobody", "abc123");
  check("an unknown character is refused, not written to", !!probeMiss.error, JSON.stringify(probeMiss));
  const probeBadId = await PT.sheets.probeEnrich(probeChar.get("name"), "");
  check("an empty page id is refused", !!probeBadId.error, JSON.stringify(probeBadId));
  check("the drop-target probe degrades without jQuery UI",
    !!PT.sheets.probeDropTargets().error);
  check("the compendium-drop probe degrades without jQuery UI",
    !!PT.sheets.probeCompendiumDrop().error);

  // The relay search: it runs on a live VTT page, so the properties that
  // matter are that it finds a dropOver without walking the DOM or the whole
  // object graph, and that it stops cleanly when there's nothing to find.
  section("the relay probe:");
  check("it reports when there's no drop target in the DOM",
    /no \.charsheet-compendium-drop-target/.test(PT.sheets.probeDropRelay().error || ""));
  const target = win.document.createElement("div");
  target.className = "charsheet-compendium-drop-target";
  win.document.body.appendChild(target);
  const relay = { dropOver: function () {}, dropLeave: function () {} };
  const cyclic = { name: "loops back" };
  cyclic.self = cyclic;
  target.__vueParentComponent = {
    ctx: {
      activeDrop: true,
      compendiumDropData: { pageName: "Items:Longsword", categoryName: "Items", expansionId: "33335" },
      relay: relay,
      cyclic: cyclic,
      // A DOM reference the walk must refuse to descend into.
      $el: win.document.body
    }
  };
  // A root reachable only via an own property whose name is neither _ nor $
  // prefixed — the jQuery-expando case the first version of this probe
  // filtered out and missed on a live sheet.
  target.jQuery19104 = { view: { relay: { dropOver: function () {} } } };
  const rel = PT.sheets.probeDropRelay();
  check("it walks own properties whatever they're named",
    rel.rootsFound.some(p => /jQuery19104/.test(p)), JSON.stringify(rel.rootsFound));
  check("and finds a relay reached only through one",
    rel.found.some(f => f.what === "relay.dropOver" && /jQuery19104/.test(f.at)),
    JSON.stringify(rel.found.map(f => f.at)));
  check("it finds the relay's dropOver",
    rel.found.some(f => f.what === "relay.dropOver"), JSON.stringify(rel.found));
  check("it finds compendiumDropData and shows its shape",
    rel.found.some(f => f.what === "compendiumDropData" && /pageName/.test(f.keys)),
    JSON.stringify(rel.found.filter(f => f.what === "compendiumDropData")));
  check("it finds the activeDrop gate",
    rel.found.some(f => f.what === "activeDrop"), JSON.stringify(rel.found));
  check("it reports where each was found, not just that it was",
    rel.found.every(f => typeof f.at === "string" && f.at.length), JSON.stringify(rel.found));
  check("a cycle doesn't hang it", rel.objectsVisited > 0 && rel.objectsVisited < 6000, rel.objectsVisited);
  target.remove();

  // With a stubbed ddmanager holding a target shaped like the real one
  // (found on a live sheet as `charsheet-compendium-drop-target`).
  const el = win.document.createElement("div");
  el.className = "charsheet-compendium-drop-target ui-droppable";
  win.document.body.appendChild(el);
  win.$ = Object.assign(() => ({}), {
    ui: { ddmanager: { droppables: { default: [{
      element: [el],
      options: {
        scope: "default", tolerance: "pointer",
        accept: function (d) { return d.hasClass("compendium-item"); },
        drop: function (event, ui) { return ui.draggable.attr("data-pagename"); }
      }
    }] } } }
  });
  const cd = PT.sheets.probeCompendiumDrop();
  check("it finds the compendium drop target", cd.targets.length === 1, JSON.stringify(cd.error));
  check("it reports what the target accepts", /compendium-item/.test(cd.targets[0].accept),
    cd.targets[0].accept);
  check("it reports the drop handler's source, which is the whole point",
    /data-pagename/.test(cd.targets[0].dropHandler), cd.targets[0].dropHandler);
  check("it reports the ancestry so we know where it lives",
    /DIV/.test(cd.targets[0].ancestry), cd.targets[0].ancestry);
  el.remove();
  delete win.$;

  win.Campaign.characters.models = [hero2];
  // survey(): the "what in my bags would arrive incomplete?" question, for
  // every item at once rather than one payloadDump per item type.
  section("the bag survey:");
  check("it says so when storage isn't ready",
    !!(await PT.sheets.survey()).error);
  PT.store = {
    snapshot: () => Promise.resolve({ bags: [{ doc: { name: "Party Loot", items: [
      { name: "Longsword", datarecords: LONGSWORD },
      { name: "Rope", datarecords: JSON.stringify([{ payload: JSON.stringify({ type: "Item", name: "Rope" }) }]) },
      // The armour shape we don't know yet: an Item plus something with no
      // rule. Whatever that turns out to be, this is how it should read.
      { name: "Amulet of Health", datarecords: JSON.stringify([
        { payload: JSON.stringify({ type: "Item", name: "Amulet of Health" }) },
        { payload: JSON.stringify({ type: "Sense", sense: "Darkvision", range: 60 }) }
      ]) },
      { name: "A Strangely Warm Rock" }
    ] } }] })
  };
  const survey = await PT.sheets.survey();
  check("a weapon reports its full payload shape",
    survey.items.find(i => i.name === "Longsword").types.join("+") === "Item+Attack+Damage+Attack+Damage",
    JSON.stringify(survey.items.find(i => i.name === "Longsword").types));
  check("a weapon has nothing unwritten",
    survey.items.find(i => i.name === "Longsword").unwritten.length === 0);
  check("a plain item reports a single Item record",
    survey.items.find(i => i.name === "Rope").types.join("+") === "Item");
  check("an item with a type we have no rule for is flagged",
    survey.items.find(i => i.name === "Amulet of Health").unwritten.join(",") === "Sense",
    JSON.stringify(survey.items.find(i => i.name === "Amulet of Health").unwritten));
  check("a manual item is described, not treated as broken",
    /no payload/.test(survey.items.find(i => i.name === "A Strangely Warm Rock").types));
  check("it groups by payload shape, so a big inventory collapses to cases",
    survey.byShape["Item"] === 1 && survey.byShape["Item+Sense"] === 1,
    JSON.stringify(survey.byShape));
  check("the verdict names what needs work",
    /1 item\(s\)/.test(survey.verdict) && survey.needsWork.length === 1, survey.verdict);
  delete PT.store;

  const missing = await PT.sheets.report("Nobody At All");
  check("report also lists known names on a miss",
    Array.isArray(missing.knownNames), JSON.stringify(missing.knownNames));
  check("an unknown character is reported, not thrown", typeof missing.sheet === "string", missing.sheet);
  check("a rejected payload shows its raw shape for diagnosis",
    !!PT.sheets.explainGraph({ datarecords: '[{"blob":"x"}]' }).rawFirst,
    JSON.stringify(PT.sheets.explainGraph({ datarecords: '[{"blob":"x"}]' })));

  report("sheets");
})();
