// Storage initialisation, end to end through the real boot sequence
// (main.js -> env -> store.init -> ui.mount), against a stubbed campaign.
//
// Scenario 1 is the bug the DM's table actually hit: a player who opens the
// game before the DM has set it up. Scenario 2 is the DM's own first run,
// here to catch regressions in the path that creates storage.
const { createWorld, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

// The DM's client creating storage, reproduced so a test can do it from
// "another browser" while the player's panel is already mounted. Mirrors
// store.init's first-run branch: default bag, index, gm index, log, gm log.
function dmCreatesStorage(handouts) {
  let n = 0;
  const mk = (share, doc) => {
    const h = handouts.create({
      name: "PT-" + Math.random().toString(36).slice(2, 10),
      inplayerjournals: share === "all" ? "all" : "",
      controlledby: share === "all" ? "all" : "",
      archived: false
    });
    h.updateBlobs({ notes: JSON.stringify(Object.assign({ rev: "r" + ++n }, doc)) });
    return h;
  };
  const bag = mk("all", {
    partyToolsBag: 1, name: "Party Loot", desc: "", items: [],
    purse: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  });
  mk("all", { partyToolsIndex: 1, bags: [bag.id], settings: {} });
  mk("gm", { partyToolsGmIndex: 1, hiddenBags: [], obscured: {} });
  mk("all", { partyToolsLog: 1, entries: [] });
  mk("gm", { partyToolsGmLog: 1, entries: [] });
}

async function playerWaitsForTheDM() {
  section("a player who arrives before the DM has set the game up:");
  // Intervals are scaled so the 15s watch tick doesn't make the suite crawl.
  const w = createWorld({ isGM: false, intervalDivisor: 30 });
  await wait(6000); // env poll, journal settling, init

  check("the panel mounts in the noStorage state", w.PT.ui.state === "noStorage", w.PT.ui.state);
  check("the player is told the DM has to set it up",
    /doesn't have Party Tools data yet/.test(w.bodyText()));
  check("a manual re-check button is offered",
    !!w.all(".pt-btn").find(b => /Check again/.test(b.textContent)));
  check("the player client created nothing",
    w.handouts.models.length === 0, w.handouts.models.length + " handout(s)");

  // Regression: opening the panel used to clear the body and then throw in
  // renderInventory on a null snapshot, leaving a blank panel.
  w.click(w.$("#pt-launcher"));
  check("opening the panel keeps the explanation on screen",
    /doesn't have Party Tools data yet/.test(w.bodyText()), JSON.stringify(w.bodyText()));
  check("opening the panel keeps the re-check button",
    !!w.all(".pt-btn").find(b => /Check again/.test(b.textContent)));

  const tab = name => w.all(".pt-tab").find(t => t.getAttribute("data-tab") === name);
  w.click(tab("log"));
  check("the Log tab renders with no storage", /Nothing has happened yet|Loading/.test(w.bodyText()), w.bodyText());
  w.click(tab("about"));
  check("the heart tab renders with no storage", w.bodyText().length > 0);
  w.click(tab("inventory"));
  check("returning to Inventory still shows the explanation",
    /doesn't have Party Tools data yet/.test(w.bodyText()), JSON.stringify(w.bodyText()));

  w.click(w.all(".pt-btn").find(b => /Check again/.test(b.textContent)));
  await wait(5000);
  check("a manual check as a player still creates nothing",
    w.handouts.models.length === 0, w.handouts.models.length + " handout(s)");
  check("the button returns to its idle label",
    !!w.all(".pt-btn").find(b => /Check again/.test(b.textContent)));

  dmCreatesStorage(w.handouts);
  await wait(12000); // one scaled watch tick, then a full init

  check("the player adopts the storage with no page reload",
    w.PT.ui.state === "ready", w.PT.ui.state);
  check("the default bag is on screen", /Party Loot/.test(w.bodyText()), w.bodyText().slice(0, 200));
  check("the stale 'no data yet' message is gone",
    !/doesn't have Party Tools data yet/.test(w.bodyText()));
  check("no duplicate storage set was created",
    w.handouts.models.length === 5, w.handouts.models.length + " handout(s)");
}

async function dmFirstRun() {
  section("the DM's first run in a fresh game:");
  const w = createWorld({ isGM: true });
  await wait(8000);

  check("init reaches the ready state", w.PT.ui.state === "ready", w.PT.ui.state);
  check("it created exactly five handouts",
    w.handouts.models.length === 5, w.handouts.models.length + " handout(s)");
  w.click(w.$("#pt-launcher"));
  check("the default Party Loot bag renders", /Party Loot/.test(w.bodyText()), w.bodyText().slice(0, 200));
  check("the DM sees the New bag control", /New bag/.test(w.bodyText()));
  check("the DM sees the deposit-from-sheet control",
    !!w.all(".pt-iconbtn").find(b => b.getAttribute("title") === "Put an item from a character sheet into this bag"));

  await wait(3000);
  check("no extra handouts appear while idling",
    w.handouts.models.length === 5, w.handouts.models.length + " handout(s)");
}

(async () => {
  await playerWaitsForTheDM();
  await dmFirstRun();
  report("storage-init");
})();
