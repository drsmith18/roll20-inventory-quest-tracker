// Storage-layer concurrency (#41) — the cleverest code in the project and,
// until now, the least directly tested: every other suite exercises
// writeMerged, appendLog's union-merge and the gmLogCreating guard only
// incidentally, one client at a time. This suite attacks them on purpose.
//
// Real Roll20 SILENTLY discards a write on a permission failure and on a
// lost concurrent-write race (docs/roll20-spike-findings.md, S5) — the call
// returns normally, the body on the server just never changes. writeMerged
// exists entirely to survive that. test/lib/world.js now exposes an opt-in
// fault-injection hook on the handout stub (setFaultPredicate /
// dropNextWrites) so this suite can reproduce the silence, not just the
// happy path.
//
// Setup deliberately bypasses PT.store.init()'s discovery dance
// (waitForJournal / scanUntilReady): that path is already covered end to
// end by test/storage-init.test.js. What this suite attacks is what happens
// to writeMerged / appendLog / ensureGmLog once storage already exists, so
// each test here writes the handouts by hand and points PT.store.state at
// them directly — the same shape init() would have left behind, reached
// without paying its ~3s settle-and-poll cost four or five times over.
const { createWorld, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

// ---- seeded PRNG ------------------------------------------------------------
// mulberry32: small, dependency-free, and fully determined by one 32-bit
// seed — a failure here is reproducible by rerunning with the printed seed.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, maxExclusive) { return Math.floor(rng() * maxExclusive); }

const DENOMS = ["pp", "gp", "ep", "sp", "cp"];

function env(name, isGM) {
  return { isGM: !!isGM, playerId: "p-" + name, playerName: name };
}

let bootSeq = 0;
function mkDoc(h, doc) {
  doc = Object.assign({ rev: "boot" + ++bootSeq }, doc);
  h.updateBlobs({ notes: JSON.stringify(doc) });
  return doc;
}

// Hand-assembles a ready storage set (bag + index + gm index + log [+ gm
// log]) and points PT.store.state straight at it. See the file header for
// why this bypasses store.init().
function bootStorage(w, opts) {
  opts = opts || {};
  const handouts = w.handouts;
  const bagH = handouts.create({ name: "PT-bag", inplayerjournals: "all", controlledby: "all", archived: false });
  mkDoc(bagH, { partyToolsBag: 1, name: "Party Loot", desc: "", items: [], purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } });
  const indexH = handouts.create({ name: "PT-index", inplayerjournals: "all", controlledby: "all", archived: false });
  mkDoc(indexH, { partyToolsIndex: 1, bags: [bagH.id], settings: {} });
  const gmIndexH = handouts.create({ name: "PT-gmindex", inplayerjournals: "", controlledby: "", archived: false });
  mkDoc(gmIndexH, { partyToolsGmIndex: 1, hiddenBags: [], obscured: {} });
  const logH = handouts.create({ name: "PT-log", inplayerjournals: "all", controlledby: "all", archived: false });
  mkDoc(logH, { partyToolsLog: 1, entries: [] });
  let gmLogH = null;
  if (opts.withGmLog !== false) {
    gmLogH = handouts.create({ name: "PT-gmlog", inplayerjournals: "", controlledby: "", archived: false });
    mkDoc(gmLogH, { partyToolsGmLog: 1, entries: [] });
  }
  const st = w.PT.store.state;
  st.ready = true; st.readOnly = false;
  st.indexH = indexH; st.gmIndexH = gmIndexH; st.logH = logH; st.gmLogH = gmLogH;
  st.bagHs = {}; st.bagHs[bagH.id] = bagH;
  return { bagH: bagH, bagId: bagH.id, indexH: indexH, gmIndexH: gmIndexH, logH: logH, gmLogH: gmLogH };
}

function freshWorld(isGM) {
  // Only the two files the storage layer actually needs — no UI, no env
  // polling loop, nothing that would make this suite pay for a full boot.
  return createWorld({ isGM: !!isGM, scripts: ["util.js", "storage.js"] });
}

// appendLog calls fired from inside addItem/changeQty/changePurse are
// deliberately NOT awaited by those functions (fire-and-forget, same idea
// as ensureGmLog's background repair) — so a promise resolving from one of
// those calls says nothing about whether ITS log entry has landed yet. This
// polls for the log to catch up, bounded so a genuine shortfall still fails
// promptly instead of hanging.
async function waitForLogCount(w, expected, timeoutMs) {
  const t0 = Date.now();
  let log = await w.PT.store.readLog();
  while (log.length < expected && Date.now() - t0 < timeoutMs) {
    await wait(30);
    log = await w.PT.store.readLog();
  }
  return log;
}

// ---- 1. convergence fuzz ----------------------------------------------------
// N clients, each running its OWN sequential stream of random operations
// (exactly like N real browser tabs — one action, then the next), racing
// the other clients' streams on the same bag and log handouts. Every op
// only ever targets an item id that its OWN originating add has already
// confirmed, so a "not found yet" no-op (a legitimate outcome of
// writeMerged, not a bug — see mutateBag) never gets mistaken for a lost
// operation; what's under attack here is convergence of concurrent writes
// to state that DOES exist, not the existence race itself.
async function convergenceFuzz() {
  section("convergence fuzz: several clients racing random operations on one bag:");
  const SEED = process.env.PT_SEED ? Number(process.env.PT_SEED) : (Date.now() % 1000000000);
  console.log("  seed = " + SEED + " (rerun with PT_SEED=" + SEED + " node test/concurrency.test.js to reproduce)");
  const rng = mulberry32(SEED);

  const w = freshWorld(true);
  const boot = bootStorage(w);

  const CLIENTS = 4;
  const OPS_PER_CLIENT = 8;
  const expectedQty = {};
  const expectedPurse = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const allItemIds = [];
  const results = [];
  let itemSeq = 0;

  async function clientLoop(ci) {
    const c = env("client" + ci, ci === 0);
    for (let k = 0; k < OPS_PER_CLIENT; k++) {
      // add is always legal; the others need at least one confirmed item.
      let kind = randInt(rng, 4);
      if ((kind === 1 || kind === 2) && allItemIds.length === 0) kind = 0;
      if (kind === 0) {
        const id = "item-" + ci + "-" + (itemSeq++);
        const qty = 1 + randInt(rng, 5);
        // Unique names on purpose: addItem stacks same-name items onto one
        // record (INV-12), a different feature with its own coverage —
        // unique names keep "one add call, one item" an honest mapping here.
        const r = await w.PT.store.addItem(c, boot.bagId, "Party Loot", { id: id, name: "Loot-" + id, qty: qty });
        results.push({ op: "add", ok: r.ok });
        if (r.ok) { expectedQty[id] = qty; allItemIds.push(id); }
      } else if (kind === 1) {
        const id = allItemIds[randInt(rng, allItemIds.length)];
        const delta = 1 + randInt(rng, 3); // always positive: the sum is order-independent and never hits the qty=0 deletion path, which is out of scope for this fuzz
        const r = await w.PT.store.changeQty(c, boot.bagId, "Party Loot", id, delta);
        results.push({ op: "qty", ok: r.ok });
        if (r.ok) expectedQty[id] += delta;
      } else if (kind === 2) {
        const denom = DENOMS[randInt(rng, DENOMS.length)];
        const delta = 1 + randInt(rng, 5);
        const deltas = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
        deltas[denom] = delta;
        const r = await w.PT.store.changePurse(c, boot.bagId, "Party Loot", deltas, "fuzz");
        results.push({ op: "purse", ok: r.ok });
        if (r.ok) expectedPurse[denom] += delta;
      } else {
        const r = await w.PT.store.appendLog(c, "fuzz note " + ci + "-" + k);
        results.push({ op: "log", ok: r.ok });
      }
    }
  }

  const clientPromises = [];
  for (let ci = 0; ci < CLIENTS; ci++) clientPromises.push(clientLoop(ci));
  await Promise.all(clientPromises);

  check("every operation from every client eventually reported ok " +
    "(deltas here are all additive, so nothing should have been legitimately refused)",
    results.every(function (r) { return r.ok; }),
    JSON.stringify(results.filter(function (r) { return !r.ok; })));

  const finalDoc = await w.PT.store.readDoc(boot.bagH);

  check("no item was lost: the bag holds exactly the items that were added",
    finalDoc.items.length === allItemIds.length,
    finalDoc.items.length + " item(s), expected " + allItemIds.length);
  const seen = {};
  finalDoc.items.forEach(function (i) { seen[i.id] = (seen[i.id] || 0) + 1; });
  const duped = Object.keys(seen).filter(function (id) { return seen[id] > 1; });
  check("no item was duplicated: every item id appears at most once", duped.length === 0, JSON.stringify(duped));
  const qtyMismatches = allItemIds.filter(function (id) {
    const it = finalDoc.items.filter(function (i) { return i.id === id; })[0];
    return !it || it.qty !== expectedQty[id];
  });
  check("every item's quantity equals the sum of the operations concurrently applied to it",
    qtyMismatches.length === 0,
    JSON.stringify(qtyMismatches.map(function (id) {
      const it = finalDoc.items.filter(function (i) { return i.id === id; })[0];
      return { id: id, expected: expectedQty[id], got: it && it.qty };
    })));

  check("the purse total equals the sum of every applied deposit, across every client",
    DENOMS.every(function (d) { return finalDoc.purse[d] === expectedPurse[d]; }),
    JSON.stringify({ expected: expectedPurse, got: finalDoc.purse }));

  const addOk = results.filter(function (r) { return r.op === "add" && r.ok; }).length;
  const qtyOk = results.filter(function (r) { return r.op === "qty" && r.ok; }).length;
  const purseOk = results.filter(function (r) { return r.op === "purse" && r.ok; }).length;
  const logOk = results.filter(function (r) { return r.op === "log" && r.ok; }).length;
  // add/changeQty/changePurse each fire exactly one background appendLog on
  // success, on top of the explicit "log" ops — so the log's final length
  // is itself a convergence check: a clobbered concurrent append would show
  // up here as a shortfall.
  const expectedLogCount = addOk + qtyOk + purseOk + logOk;
  const log = await waitForLogCount(w, expectedLogCount, 5000);

  check("the activity log ends up with exactly one entry per successful operation " +
    "(none lost to a clobbered concurrent append)",
    log.length === expectedLogCount, log.length + " entries, expected " + expectedLogCount);
  const logIds = log.map(function (e) { return e.id; });
  check("no two log entries share an id", new Set(logIds).size === logIds.length,
    logIds.length + " entries, " + new Set(logIds).size + " unique id(s)");
}

// ---- 1b. KNOWN BUG: a false-negative confirmation double-applies a delta ----
// The fuzz above turned this up; this is the smallest deterministic
// reproduction of it, kept as its own test so the failure is legible on its
// own rather than buried in the fuzz's diff.
//
// writeMerged's confirmation check is "does the body match EXACTLY the text
// I just wrote?" (storage.js writeMerged). That check cannot tell apart two
// very different situations: (a) my write was genuinely lost (permissions,
// or the server picked a different concurrent write), which retrying and
// reapplying is exactly right for; and (b) my write landed FINE, but some
// OTHER client's write landed afterwards, before my confirmation read —
// so the body no longer matches my text for a completely different reason.
// In case (b) writeMerged retries anyway, and for a mutate() that is not
// idempotent — changeQty's `it.qty = qty + delta`, changePurse's
// `next[d] = cur[d] + deltas[d]`, and addItem's same-name stacking
// (`twin.qty += item.qty`) all recompute from the CURRENT value rather than
// checking whether their own contribution is already present — the retry
// reapplies the same delta a second time on top of a base that already
// contains it once. The caller is told `ok: true` throughout; nothing about
// the response says the number is wrong.
//
// appendLog/appendGmLog don't have this problem: their mutate() checks
// `entries.some(e => e.id === entry.id)` before adding, so reapplying it is
// a safe no-op. splitCoins was explicitly hardened against exactly this
// failure mode (see its splitId comment: "Money must be exactly-once").
// changeQty, changePurse, and addItem's stacking path never got the
// equivalent guard.
//
// This is reachable in a real game, not just under this suite's artificial
// same-tick race: real Roll20's write echo is ~1.6s (verifyDelay's default,
// see storage.js), so any two party members adjusting the same bag within
// that window race this exact path.
//
// FIXED. writeMerged now stamps each write's own id into a short ring the
// document carries; anyone writing afterwards inherits it, so finding our id
// in the body we read back distinguishes (b) from (a) and we stop reapplying.
// The checks below are the regression guard — they failed before that change
// and must never fail again.
async function noDoubleAppliedDelta() {
  section("a confirmation false-negative must not reapply an already-landed delta:");
  const w = freshWorld(true);
  const boot = bootStorage(w);
  const gm = env("dm", true);
  await w.PT.store.addItem(gm, boot.bagId, "Party Loot", { id: "rope", name: "Rope", qty: 1 });

  const alice = env("alice", false);
  const bob = env("bob", true);
  const results = await Promise.all([
    w.PT.store.changeQty(alice, boot.bagId, "Party Loot", "rope", 1),
    w.PT.store.changeQty(bob, boot.bagId, "Party Loot", "rope", 1)
  ]);
  check("both concurrent +1s report ok",
    results[0].ok && results[1].ok, JSON.stringify(results));

  const doc = await w.PT.store.readDoc(boot.bagH);
  check("two concurrent +1 deltas on the SAME item converge to base(1) + 1 + 1 = 3, with neither delta counted twice",
    doc.items[0].qty === 3,
    "got qty=" + doc.items[0].qty + " — a delta was reapplied by a writeMerged retry (see comment above)");
}

// ---- 2. silent write rejection ----------------------------------------------
async function silentWriteRejection() {
  section("silent write rejection: Roll20 drops the first couple of writes without saying so:");
  const w = freshWorld(true);
  const boot = bootStorage(w);
  const gm = env("dm", true);

  w.handouts.dropNextWrites(2, boot.bagId);
  const res = await w.PT.store.changePurse(gm, boot.bagId, "Party Loot", { gp: 5 }, "silent-drop test");
  w.handouts.setFaultPredicate(null);

  check("the caller is told ok even though the first two writes vanished silently",
    res.ok === true, JSON.stringify(res));
  const doc = await w.PT.store.readDoc(boot.bagH);
  check("the change actually landed in the handout body once a write finally got through",
    doc.purse.gp === 5, JSON.stringify(doc.purse));
}

// ---- 3. attempt exhaustion ---------------------------------------------------
async function attemptExhaustion() {
  section("attempt exhaustion: every write to the handout is dropped, forever:");
  const w = freshWorld(true);
  const boot = bootStorage(w);
  const gm = env("dm", true);

  w.handouts.setFaultPredicate(function (h) { return h.id === boot.bagId; });

  const res = await w.PT.store.writeMerged(boot.bagH, function (doc) {
    doc.purse.gp = (doc.purse.gp || 0) + 1;
    return doc;
  });
  // storage.js's own comment names the cause; assert the actual string it
  // returns rather than assuming the shape of the failure.
  check("writeMerged reports failure rather than letting the change silently evaporate",
    res.ok === false, JSON.stringify(res));
  check("the failure names the cause storage.js documents for exhausted attempts",
    res.err === "write did not persist (permissions, or repeated write races)", res.err);

  const doc = await w.PT.store.readDoc(boot.bagH);
  check("the handout body was never actually touched", (doc.purse.gp || 0) === 0, JSON.stringify(doc.purse));

  // Not just writeMerged in isolation — a real store API has to surface the
  // same honest failure rather than swallowing it on the way back to the UI.
  const res2 = await w.PT.store.changePurse(gm, boot.bagId, "Party Loot", { gp: 5 }, "exhaustion test");
  w.handouts.setFaultPredicate(null);
  check("a real store API (changePurse) propagates the failure instead of reporting ok",
    res2.ok === false, JSON.stringify(res2));
}

// ---- 4. the gmLogCreating guard ----------------------------------------------
async function gmLogCreatingGuard() {
  section("the gmLogCreating guard: several overlapping snapshot() polls must create the GM log only once:");
  const w = freshWorld(true);
  // withGmLog: false reproduces a game whose storage predates the GM-only
  // log — exactly the case ensureGmLog exists to repair.
  const boot = bootStorage(w, { withGmLog: false });
  const gm = env("dm", true);

  check("the GM log genuinely starts absent, as a pre-existing game would have it",
    boot.gmLogH === null && w.PT.store.state.gmLogH === null);

  // The UI polls snapshot() every ~4s; several polls can be in flight at
  // once (a slow response, a tab regaining focus, ...). Fire them all in
  // the same tick, exactly as overlapping polls would land.
  const POLLS = 6;
  const snaps = [];
  for (let i = 0; i < POLLS; i++) snaps.push(w.PT.store.snapshot(gm));
  await Promise.all(snaps);
  // ensureGmLog is deliberately not part of snapshot()'s returned promise
  // chain (a background repair) — give its create+verify a moment to land.
  await wait(200);

  const docs = await Promise.all(w.handouts.models.map(function (h) { return w.PT.store.readDoc(h); }));
  const gmLogHandouts = docs.filter(function (d) { return d && d.partyToolsGmLog; });

  check("exactly one GM-only log handout exists after six overlapping polls",
    gmLogHandouts.length === 1, gmLogHandouts.length + " GM log handout(s)");
  check("PT.store.state now points at the created log",
    !!w.PT.store.state.gmLogH, "state.gmLogH is still null");
}

// ---- 5. log union-merge ------------------------------------------------------
async function logUnionMerge() {
  section("log union-merge: two clients appending at the same time both survive, in order:");
  const w = freshWorld(true);
  const boot = bootStorage(w);
  const alice = env("alice", false);
  const bob = env("bob", true);

  const pair = await Promise.all([
    w.PT.store.appendLog(alice, "alice's entry"),
    w.PT.store.appendLog(bob, "bob's entry")
  ]);
  check("both concurrent appends report ok", pair[0].ok && pair[1].ok, JSON.stringify(pair));

  const log = await w.PT.store.readLog();
  check("the log ends up with exactly both entries, not one clobbering the other",
    log.length === 2, log.length + " entries: " + JSON.stringify(log.map(function (e) { return e.msg; })));
  check("alice's entry made it in", log.some(function (e) { return e.msg === "alice's entry"; }));
  check("bob's entry made it in", log.some(function (e) { return e.msg === "bob's entry"; }));
  const ids = log.map(function (e) { return e.id; });
  check("the two entries have distinct ids", new Set(ids).size === ids.length);
  check("entries are ordered by timestamp, non-decreasing",
    log.every(function (e, i) { return i === 0 || log[i - 1].t <= e.t; }),
    JSON.stringify(log.map(function (e) { return e.t; })));
}

(async () => {
  await convergenceFuzz();
  await noDoubleAppliedDelta();
  await silentWriteRejection();
  await attemptExhaustion();
  await gmLogCreatingGuard();
  await logUnionMerge();
  report("concurrency");
})();
