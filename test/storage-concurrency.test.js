// Concurrent writes to one bag, from more than one client (issue #51).
//
// Two players editing "Party Loot" in the same moment lost BOTH changes:
// one was spamming −/+ on a stack while the other added an item. The stub
// server here behaves the way spike S5 measured real Roll20 behaving: whole-
// body last-write-wins, a write lands some milliseconds after it is sent,
// and nobody is told when theirs was discarded.
const { createWorld, createSharedServer, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

// Real Roll20 echoes a write in ~1s and storage.js confirms after 1.6s; keep
// that ordering (confirm later than echo), just scaled down.
const LATENCY = 30;
function client(server, name) {
  const w = createWorld({ handouts: server.handouts, scripts: ["util.js", "storage.js"] });
  w.PT.VERIFY_DELAY_MS = 80;
  w.PT.RECONFIRM_DELAYS_MS = [150, 400];
  w.env = { playerName: name, playerId: "p-" + name, isGM: false };
  return w;
}

function makeBag(server, items) {
  const h = server.handouts.create({ name: "PT-bag", inplayerjournals: "all", controlledby: "all", archived: false });
  h._server.write(JSON.stringify({
    partyToolsBag: 1, name: "Party Loot", desc: "", items: items || [],
    purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, rev: "r0"
  }));
  return h;
}

const bagOf = h => JSON.parse(h._server.read());
const qtyOf = (h, name) => {
  const it = bagOf(h).items.find(i => i.name === name);
  return it ? it.qty : 0;
};
const settle = () => wait(700); // past the last re-confirmation tick

async function theIssue51Scenario() {
  section("issue #51: one player spams + on a stack while another adds an item:");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [{ id: "spear", name: "Spear", qty: 3 }]);
  const dr = client(server, "DR");
  const leslie = client(server, "Leslie");

  const pending = [];
  for (let i = 0; i < 10; i++) {
    pending.push(dr.PT.store.changeQty(dr.env, bag.id, "Party Loot", "spear", +1));
    if (i === 3) pending.push(leslie.PT.store.addItem(leslie.env, bag.id, "Party Loot", { name: "Gobblin' Hog Meat", qty: 4 }));
    await wait(15);
  }
  const results = await Promise.all(pending);
  await settle();

  check("every write reported success", results.every(r => r.ok), JSON.stringify(results.filter(r => !r.ok)));
  check("all ten + clicks landed (3 → 13)", qtyOf(bag, "Spear") === 13, qtyOf(bag, "Spear"));
  check("the other player's item survived", qtyOf(bag, "Gobblin' Hog Meat") === 4, qtyOf(bag, "Gobblin' Hog Meat"));
  check("clicks were folded into a few writes, not one write each",
    server.writes < 10, server.writes + " writes");
}

async function bothPlayersSpamAtOnce() {
  section("two players spamming −/+ on different stacks at the same time:");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [
    { id: "spear", name: "Spear", qty: 3 },
    { id: "meat", name: "Troglodyte Meat", qty: 7 }
  ]);
  const a = client(server, "A");
  const b = client(server, "B");
  const pending = [];
  for (let i = 0; i < 8; i++) {
    pending.push(a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +1));
    pending.push(b.PT.store.changeQty(b.env, bag.id, "Party Loot", "meat", -1));
    await wait(10);
  }
  const results = await Promise.all(pending);
  await settle();
  check("every write reported success", results.every(r => r.ok), JSON.stringify(results.filter(r => !r.ok)));
  check("A's stack went up by exactly 8", qtyOf(bag, "Spear") === 11, qtyOf(bag, "Spear"));
  check("B's stack went down by exactly 7, then left the bag at 0",
    qtyOf(bag, "Troglodyte Meat") === 0 && !bagOf(bag).items.some(i => i.id === "meat"),
    JSON.stringify(bagOf(bag).items));
}

async function lateOverwriteIsRepaired() {
  section("a stale write that lands AFTER our confirmation (the S5 silent loser):");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [{ id: "spear", name: "Spear", qty: 3 }]);
  const a = client(server, "A");
  // Any earlier write by this version gives the bag its ops ring; without
  // one, a body is indistinguishable from a v1.0.0 write (see the test
  // below) and is deliberately left alone.
  await a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", 0);
  await settle();

  // B reads now, before A writes...
  const staleRead = bagOf(bag);
  const r = await a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +2);
  check("A's write confirmed", r.ok && qtyOf(bag, "Spear") === 5, JSON.stringify(r) + " qty=" + qtyOf(bag, "Spear"));

  // ...and B's write, built on that stale read, lands after A confirmed.
  staleRead.items.push({ id: "meat", name: "Gobblin' Hog Meat", qty: 4 });
  staleRead.rev = "stale";
  bag._server.write(JSON.stringify(staleRead));
  check("(setup) the stale write really did wipe A's change", qtyOf(bag, "Spear") === 3, qtyOf(bag, "Spear"));

  await settle();
  check("A noticed and re-applied its change", qtyOf(bag, "Spear") === 5, qtyOf(bag, "Spear"));
  check("B's item, from the stale write, is kept", qtyOf(bag, "Gobblin' Hog Meat") === 4, qtyOf(bag, "Gobblin' Hog Meat"));
  await settle();
  check("the re-applied change was applied once, not on every tick", qtyOf(bag, "Spear") === 5, qtyOf(bag, "Spear"));
}

async function staleConfirmationReadDoesNotDoubleApply() {
  section("a confirmation read that lags behind a write that DID land:");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [{ id: "spear", name: "Spear", qty: 3 }]);
  const a = client(server, "A");

  // Let the initial read through, then make the confirmation read stale.
  const p = a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +1);
  await wait(LATENCY + 10);
  server.staleReads = 1;
  const r = await p;
  await settle();
  check("the change reports success", r.ok, JSON.stringify(r));
  check("it was applied exactly once (3 → 4, not 5)", qtyOf(bag, "Spear") === 4, qtyOf(bag, "Spear"));
}

async function rejectedWritesStillFail() {
  section("a write Roll20 silently refuses (permissions):");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [{ id: "spear", name: "Spear", qty: 3 }]);
  const a = client(server, "A");
  server.rejectWrites = true;
  const r = await a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +1);
  check("the caller is told it failed", r.ok === false && /did not persist/.test(r.err || ""), JSON.stringify(r));
  check("nothing changed", qtyOf(bag, "Spear") === 3, qtyOf(bag, "Spear"));
  check("nothing is left being watched", a.PT.store._pendingRechecks() === 0, a.PT.store._pendingRechecks());

  server.rejectWrites = false;
  const r2 = await a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +1);
  check("the queue is not wedged by the failure", r2.ok && qtyOf(bag, "Spear") === 4, JSON.stringify(r2));
}

async function olderClientWritesAreNotDoubleCounted() {
  section("a v1.0.0 client (no ops ring) writes on top of a confirmed change:");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, [{ id: "spear", name: "Spear", qty: 3 }]);
  const a = client(server, "A");
  const r = await a.PT.store.changeQty(a.env, bag.id, "Party Loot", "spear", +1);
  check("A's write confirmed", r.ok && qtyOf(bag, "Spear") === 4);

  // The old client read AFTER A's write (so it carries A's +1) but strips
  // the fields it doesn't know about.
  const old = bagOf(bag);
  delete old.ops;
  old.items.push({ id: "club", name: "Club", qty: 1 });
  bag._server.write(JSON.stringify(old));
  await settle();
  check("A does not re-apply a change it cannot prove was lost", qtyOf(bag, "Spear") === 4, qtyOf(bag, "Spear"));
  check("the old client's item is kept", qtyOf(bag, "Club") === 1);
}

async function purseChangesAreExactlyOnce() {
  section("coins from two players at once:");
  const server = createSharedServer({ latencyMs: LATENCY });
  const bag = makeBag(server, []);
  const a = client(server, "A");
  const b = client(server, "B");
  const results = await Promise.all([
    a.PT.store.changePurse(a.env, bag.id, "Party Loot", { gp: 26 }),
    b.PT.store.changePurse(b.env, bag.id, "Party Loot", { gp: 53 }),
    a.PT.store.changePurse(a.env, bag.id, "Party Loot", { sp: 5 })
  ]);
  await settle();
  check("every change reported success", results.every(r => r.ok), JSON.stringify(results));
  check("the purse holds exactly 79 gp 5 sp", bagOf(bag).purse.gp === 79 && bagOf(bag).purse.sp === 5, JSON.stringify(bagOf(bag).purse));
}

(async () => {
  await theIssue51Scenario();
  await bothPlayersSpamAtOnce();
  await lateOverwriteIsRepaired();
  await staleConfirmationReadDoesNotDoubleApply();
  await rejectedWritesStillFail();
  await olderClientWritesAreNotDoubleCounted();
  await purseChangesAreExactlyOnce();
  report("storage-concurrency");
})();
