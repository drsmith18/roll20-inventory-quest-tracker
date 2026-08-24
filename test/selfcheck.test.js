// The self-check (#38) and the diagnostics buffer (#37).
//
// The failure this exists to prevent is not the loud one. If Roll20 renames a
// READ path we show nothing, and that is obvious to everybody. If Roll20
// renames a WRITE path we would carry on presenting a perfectly normal panel
// while every change went quietly nowhere — or worse, wrote something
// malformed onto a character somebody cares about. So the tests that matter
// here are the write-path ones.
const fs = require("fs");
const path = require("path");
const { createWorld, wait, SRC } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

// Boot in two stages, so a test can break Roll20 the way a Roll20 deploy
// would: after the extension has loaded, before it has run.
async function brokenWorld(breakIt, opts) {
  opts = opts || {};
  const w = createWorld({
    isGM: true,
    scripts: ["util.js", "env.js", "storage.js", "backup.js", "drops.js", "sheets.js", "ui.js"]
  });
  // ready() waits two real minutes before giving up. Tests exercise that path
  // too, so shorten it the way storage's verify delays are shortened.
  w.PT.READY_TIMEOUT_MS = opts.readyTimeout || 120000;
  breakIt(w.win);
  w.win.eval(fs.readFileSync(path.join(SRC, "main.js"), "utf8"));
  await wait(opts.settle || 8000);
  return w;
}

function notices(w) {
  return Array.from(w.win.document.body.children)
    .filter(el => /Party Tools:/.test(el.textContent || ""))
    .map(el => el.textContent).join(" | ");
}

async function healthyGame() {
  section("a healthy game passes the self-check:");
  const w = createWorld({ isGM: true });
  await wait(8000);

  const h = w.PT.env.selfCheck();
  check("nothing is reported missing", h.missing.length === 0, JSON.stringify(h.missing));
  check("it can read", h.canRead === true);
  check("it can write", h.canWrite === true);
  check("the summary is short enough for a bug report", h.summary.length < 60, h.summary);
  check("the panel mounted normally", w.PT.ui.state === "ready", w.PT.ui.state);
  check("no failure notice was shown", !/changed something/.test(notices(w)), notices(w));
}

// Two different read-path failures, because they take two different routes
// out of the boot sequence and only one of them reaches the self-check.
async function missingReadPathAfterReady() {
  section("a Roll20 change to a READ path stops the extension safely:");
  // Campaign.get is not one of the objects PT.env.ready() gates on, so boot
  // gets as far as the self-check — which is the case selfCheck exists for.
  const w = await brokenWorld(win => { win.Campaign.get = undefined; });

  const h = w.PT.health;
  check("the self-check ran and failed", !!h && h.canRead === false, JSON.stringify(h && h.missing));
  check("it names the thing that went missing",
    !!h && h.missing.some(m => m.name === "Campaign.get"), JSON.stringify(h && h.missing));
  check("no panel was mounted", !w.$("#pt-panel"), "a panel was mounted anyway");
  check("the user is told Roll20 changed something", /changed something/.test(notices(w)), notices(w));
  check("and is reassured their data is safe", /safe and untouched/.test(notices(w)), notices(w));
  check("and is told what to do about it", /check for an update/i.test(notices(w)), notices(w));
  check("nothing was written to the journal",
    w.handouts.models.length === 0, w.handouts.models.length + " handout(s)");
}

async function readPathGatedByReady() {
  section("a READ path that ready() itself waits on still explains itself:");
  // Campaign.handouts IS one of the objects ready() polls for, so removing it
  // means boot never reaches the self-check at all — it sits in the poll until
  // the timeout. Before this was tested, that produced a single console line
  // and nothing else: the user sat looking at a Roll20 page with no launcher
  // and no explanation, for two minutes and then for ever.
  const w = await brokenWorld(win => { delete win.Campaign.handouts; },
    { readyTimeout: 1500, settle: 4000 });

  check("no panel was mounted", !w.$("#pt-panel"), "a panel was mounted anyway");
  check("the user is told something, rather than nothing at all",
    notices(w).length > 0, "(no notice shown)");
  check("the notice names Roll20 as the cause", /changed something/.test(notices(w)), notices(w));
  check("and reassures them about their data", /safe/.test(notices(w)), notices(w));
  check("the give-up was recorded for diagnostics",
    w.PT.diagLog.some(e => e.kind === "error" && /boot/.test(e.text)),
    JSON.stringify(w.PT.diagLog.slice(-3)));
}

async function missingWritePath() {
  section("a Roll20 change to a WRITE path degrades to read-only, not to lying:");
  const w = await brokenWorld(win => {
    // The blob pair lives on a handout instance, so the journal needs one for
    // the probe to have anything to sample. A real game always does; a fresh
    // stub does not, and without this the test would take the "unverified"
    // branch and quietly cover nothing.
    win.Campaign.handouts.create({ name: "Some existing handout", archived: false });
    // The dangerous case: everything reads fine, but the write primitive is
    // gone. Storage still loads; only writing is broken.
    win.Campaign.handouts.models.forEach(h => { h.updateBlobs = undefined; });
    const realCreate = win.Campaign.handouts.create;
    win.Campaign.handouts.create = function (attrs) {
      const h = realCreate.call(this, attrs);
      h.updateBlobs = undefined;
      return h;
    };
  });

  const h = w.PT.health;
  check("reading is still fine", !!h && h.canRead === true, JSON.stringify(h && h.missing));
  check("the probe actually ran — it was not skipped as unverified",
    !!h && h.unverified.indexOf("handout.updateBlobs") === -1, JSON.stringify(h && h.unverified));
  check("writing is reported as broken", !!h && h.canWrite === false,
    JSON.stringify({ canWrite: h && h.canWrite, missing: h && h.missing }));
  check("it names the write primitive that went missing",
    !!h && h.missing.some(m => m.name === "handout.updateBlobs" && m.kind === "write"),
    JSON.stringify(h && h.missing));
  // This game has no Party Tools storage yet, so the only way forward would be
  // to create some — which is precisely what is broken. The right answer is to
  // refuse and leave the journal alone, not to half-create a storage set.
  check("no panel pretends to work", w.PT.ui.state !== "ready", w.PT.ui.state);
  check("the user is told Roll20 changed something we WRITE with",
    /writes with/.test(notices(w)), notices(w));
  check("and is told nothing was added to their journal",
    /Nothing has been added/.test(notices(w)), notices(w));
  check("no storage handouts were created",
    w.handouts.models.filter(h => /^PT-/.test(h.get("name") || "")).length === 0,
    w.handouts.models.map(h => h.get("name")).join(", "));
}

async function writePathBrokenWithExistingStorage() {
  section("a broken WRITE path in a game that ALREADY has data shows it, read-only:");
  // Seed a real storage set the way a DM's client would have left it, then let
  // the boot sequence find it with writing broken.
  const w2 = createWorld({
    isGM: true,
    scripts: ["util.js", "env.js", "storage.js", "backup.js", "drops.js", "sheets.js", "ui.js"]
  });
  let n = 0;
  const mk = (share, doc) => {
    const h = w2.handouts.create({
      name: "PT-" + Math.random().toString(36).slice(2, 10),
      inplayerjournals: share === "all" ? "all" : "",
      controlledby: share === "all" ? "all" : "", archived: false
    });
    h.updateBlobs({ notes: JSON.stringify(Object.assign({ rev: "r" + ++n }, doc)) });
    return h;
  };
  const bag = mk("all", {
    partyToolsBag: 1, name: "Party Loot", desc: "", items: [{ id: "i1", name: "Rope", qty: 1 }],
    purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  });
  mk("all", { partyToolsIndex: 1, bags: [bag.id], settings: {} });
  mk("gm", { partyToolsGmIndex: 1, hiddenBags: [], obscured: {} });
  mk("all", { partyToolsLog: 1, entries: [] });
  mk("gm", { partyToolsGmLog: 1, entries: [] });
  // Now break writing, after the data exists.
  w2.handouts.models.forEach(h => { h.updateBlobs = undefined; });
  w2.win.eval(fs.readFileSync(path.join(SRC, "main.js"), "utf8"));
  await wait(8000);

  check("the self-check spotted the broken write path",
    w2.PT.health && w2.PT.health.canWrite === false, JSON.stringify(w2.PT.health && w2.PT.health.missing));
  check("the panel mounts read-only rather than pretending to work",
    w2.PT.ui.state === "readOnly", w2.PT.ui.state);
  check("the existing data is still shown, so the party can at least see it",
    /Party Loot/.test(w2.bodyText()), w2.bodyText().slice(0, 200));
  check("and the storage layer itself refuses writes",
    w2.PT.store.state.readOnly === true, String(w2.PT.store.state.readOnly));
}

async function unverifiableProbes() {
  section("a probe that cannot be run says so, rather than passing:");
  const w = createWorld({ isGM: true, scripts: ["util.js", "env.js"] });
  // No handouts at all: the blob pair lives on an instance, so there is
  // nothing to sample. That is "could not check", not "checked and fine".
  const h = w.PT.env.selfCheck();
  check("the blob probes are listed as unverified",
    h.unverified.indexOf("handout.updateBlobs") !== -1, JSON.stringify(h.unverified));
  check("they are NOT counted as missing",
    !h.missing.some(m => /updateBlobs/.test(m.name)), JSON.stringify(h.missing));
  check("the summary admits the gap", /unverified/.test(h.summary), h.summary);
}

async function diagnostics() {
  section("diagnostics are useful and safe to paste in public:");
  const w = createWorld({ isGM: true });
  await wait(8000);
  const PT = w.PT;

  check("the ring buffer captured the boot messages", PT.diagLog.length > 0, PT.diagLog.length + " entries");

  PT.captureError("a test failure", new Error("something went wrong"));
  const text = PT.diagnostics(PT.envInfo, { "Self-check": PT.health.summary });

  check("an error is recorded", /ERROR a test failure: something went wrong/.test(text), text.slice(-300));
  check("it reports the version", text.indexOf("Party Tools v" + PT.VERSION) === 0, text.slice(0, 60));
  check("it reports the role", /Role: DM/.test(text));
  check("it includes the self-check result", /Self-check: passed/.test(text), text.slice(0, 400));

  // The whole point of the scrub: this text is written to be pasted somewhere
  // public, and these two values identify a real game and a real account.
  PT.log("a message mentioning campaign c1 and player p1");
  const scrubbed = PT.diagnostics(PT.envInfo, null);
  check("the campaign id never appears", !/\bc1\b/.test(scrubbed), scrubbed.slice(-200));
  check("the player id never appears", !/\bp1\b/.test(scrubbed), scrubbed.slice(-200));
  check("and the placeholders show where they were",
    /<campaign>/.test(scrubbed) && /<player>/.test(scrubbed), scrubbed.slice(-200));

  // A ring buffer that grows without bound is a memory leak in a page people
  // leave open for a six-hour session.
  for (let i = 0; i < 200; i++) PT.log("filler " + i);
  check("the buffer stays bounded", PT.diagLog.length <= 40, PT.diagLog.length + " entries");
  check("and keeps the most recent, not the oldest",
    /filler 199/.test(PT.diagLog[PT.diagLog.length - 1].text), PT.diagLog[PT.diagLog.length - 1].text);
}

(async () => {
  await healthyGame();
  await missingReadPathAfterReady();
  await readPathGatedByReady();
  await missingWritePath();
  await writePathBrokenWithExistingStorage();
  await unverifiableProbes();
  await diagnostics();
  report("selfcheck");
})();
