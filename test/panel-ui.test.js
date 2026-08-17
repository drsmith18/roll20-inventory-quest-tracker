// Panel behaviours reported from the table (issues #3, #18, #19, #20), driven
// through the real UI in jsdom: a hidden bag's header layout, adding several
// items without reopening the box, what a player is told after an item moves
// off a character sheet, and the character pickers a DM has to scroll.
const { createWorld, makeCharacter, integrantsOf, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

function bagHead(w) { return w.$(".pt-baghead"); }
function iconBtn(w, title) {
  return w.all(".pt-iconbtn").find(b => b.getAttribute("title") === title);
}
function modalBtn(w, label) {
  return w.all(".pt-modal .pt-btn").find(b => b.textContent === label);
}
function toastText(w) {
  return w.all(".pt-toast").map(t => t.textContent).join(" | ");
}
function setInput(w, sel, value) {
  const el = w.$(".pt-modal " + sel);
  el.value = value;
  el.dispatchEvent(new w.win.Event("input", { bubbles: true }));
  return el;
}

// A DM whose game is already set up, panel open.
async function readyDM(opts) {
  const w = createWorld(Object.assign({ isGM: true }, opts));
  await wait(8000);
  w.click(w.$("#pt-launcher"));
  return w;
}

// #18 — the "players can NOT see this" marker used to live in the bag header,
// where it squeezed the controls and pushed 🗑 up against 👁.
async function hiddenBagHeader() {
  section("#18 — a hidden bag's header stays usable:");
  const w = await readyDM();
  const bag = w.all(".pt-bag")[0];
  const controlsWhenVisible = bag.querySelectorAll(".pt-baghead button").length;

  w.click(iconBtn(w, "Hide this bag from players"));
  await wait(2000);

  check("the bag is now marked hidden", !!w.$(".pt-bag.pt-hidden-bag"));
  check("the marker is still loud and unambiguous",
    /HIDDEN — players can NOT see this bag/.test(w.bodyText()), w.bodyText().slice(0, 120));
  check("the marker is NOT inside the header row",
    !/HIDDEN/.test(bagHead(w).textContent), bagHead(w).textContent);
  check("it sits on its own strip under the header",
    /HIDDEN/.test(w.$(".pt-hidden-strip").textContent));
  check("hiding cost the header none of its controls",
    w.$(".pt-bag").querySelectorAll(".pt-baghead button").length === controlsWhenVisible,
    w.$(".pt-bag").querySelectorAll(".pt-baghead button").length + " vs " + controlsWhenVisible);

  const del = iconBtn(w, "Delete this bag");
  const reveal = iconBtn(w, "Reveal this bag to the party");
  check("delete is set apart from reveal", del.classList.contains("pt-del"), del.className);
  check("reveal is still on the header", !!reveal && reveal.closest(".pt-baghead") === bagHead(w));
  check("delete is the last control on the row",
    bagHead(w).lastElementChild === del, bagHead(w).lastElementChild.getAttribute("title"));
}

// #19 — "you can only add one at a time and each time you end up going back
// up to the top."
async function addingSeveralItems() {
  section("#19 — adding several items in a row:");
  const w = await readyDM();
  w.click(iconBtn(w, "Add an item by name"));

  check("the add box offers a quantity", !!w.$(".pt-modal [data-f=qty]"));
  check("it offers an add-and-keep-going button", !!modalBtn(w, "Add & another"));

  setInput(w, "[data-f=name]", "Torch");
  setInput(w, "[data-f=qty]", "10");
  w.click(modalBtn(w, "Add & another"));
  await wait(2000);

  check("the box is still open", !!w.$(".pt-modal"));
  check("the name is cleared for the next one",
    w.$(".pt-modal [data-f=name]").value === "", JSON.stringify(w.$(".pt-modal [data-f=name]").value));
  check("the quantity is carried over", w.$(".pt-modal [data-f=qty]").value === "10");
  check("10 torches landed in the bag", /Torch/.test(w.bodyText()) && /×10/.test(w.bodyText()),
    w.bodyText().slice(0, 200));

  setInput(w, "[data-f=name]", "Rations");
  w.click(modalBtn(w, "Add"));
  await wait(2000);

  check("the second item landed too", /Rations/.test(w.bodyText()), w.bodyText().slice(0, 200));
  check("“Add” still closes the box", !w.$(".pt-modal"));

  // The other half of the report: every render rebuilt the body from scratch,
  // which threw the panel back to the top.
  //
  // jsdom does no layout, so it never CLAMPS scrollTop when the body is
  // emptied — an assertion on the resulting scrollTop passes with or without
  // the fix and proves nothing. What can be observed is the write itself, so
  // the property is instrumented and the render is expected to put the
  // position back deliberately.
  const body = w.$(".pt-body");
  let current = 300, written = [];
  Object.defineProperty(body, "clientHeight", { value: 200, configurable: true });
  Object.defineProperty(body, "scrollHeight", { value: 900, configurable: true });
  Object.defineProperty(body, "scrollTop", {
    configurable: true,
    get() { return current; },
    set(v) { written.push(v); current = v; }
  });

  w.click(iconBtn(w, "One more"));
  await wait(2000);
  check("a render restores the scroll position it found",
    written.length > 0 && written[written.length - 1] === 300,
    JSON.stringify(written));
}

// #20 — an item moved off a sheet stayed on screen there until the sheet was
// reopened, so the player deposited it, saw no change, and tried again.
async function depositTellsYouToReopen() {
  section("#20 — depositing an item off a character sheet:");
  const w = await readyDM();
  const character = makeCharacter("Aria", { controlledby: "p1" });
  w.win.Campaign.characters.models.push(character);

  w.click(iconBtn(w, "Put an item from a character sheet into this bag"));
  await wait(2000);
  check("the sheet's items are listed", /Rope/.test(w.$(".pt-modal").textContent),
    w.$(".pt-modal").textContent.slice(0, 200));
  check("the list says it is live data, not the open sheet",
    /read from the character's live data/.test(w.$(".pt-modal").textContent));

  w.$(".pt-modal input[name=pt-deposit-item]").checked = true;
  w.click(modalBtn(w, "Put in bag"));
  await wait(3000);

  check("the rope left the sheet", !integrantsOf(character).rope,
    JSON.stringify(Object.keys(integrantsOf(character))));
  check("the rope is in the bag", /Rope/.test(w.bodyText()), w.bodyText().slice(0, 200));
  check("the player is told the open sheet won't redraw itself",
    /close and reopen it/.test(toastText(w)), toastText(w));
  check("the message names the character", /Aria/.test(toastText(w)), toastText(w));
}

// #3 — "it would be nice to have a scrollbar to look through all of the
// available characters." controlledBy short-circuits for the GM and returns
// every character in the campaign, so the DM's list is as long as the NPC
// roster; the claim modal was the one picker with no scroll container.
async function characterPickersScroll() {
  section("#3 — the character pickers are bounded:");
  const w = await readyDM();
  for (let i = 0; i < 30; i++) {
    w.win.Campaign.characters.models.push(makeCharacter("NPC " + i, { controlledby: "" }));
  }

  // An item to claim, so the → button has something to open on.
  w.click(iconBtn(w, "Add an item by name"));
  setInput(w, "[data-f=name]", "Shortbow");
  w.click(modalBtn(w, "Add"));
  await wait(2000);

  w.click(iconBtn(w, "Claim this item to one of your characters"));
  const claimWrap = w.$(".pt-modal .pt-split-recipients");
  check("the claim picker has a scrolling wrapper", !!claimWrap);
  check("every character is inside it, not loose in the modal",
    claimWrap && claimWrap.querySelectorAll("input[name=pt-claim-char]").length ===
      w.all(".pt-modal input[name=pt-claim-char]").length,
    claimWrap ? claimWrap.querySelectorAll("input[name=pt-claim-char]").length + " of " +
      w.all(".pt-modal input[name=pt-claim-char]").length : "no wrapper");
  check("the DM is told how long the list is",
    /30 to choose from|31 to choose from/.test(w.$(".pt-modal").textContent),
    w.$(".pt-modal").textContent.slice(0, 120));
  check("the first character is still preselected",
    !!w.$(".pt-modal input[name=pt-claim-char]:checked"));
  w.click(modalBtn(w, "Cancel"));

  // The deposit picker's character step had the same unbounded list. Its
  // characters need supported sheets to appear at all.
  w.click(iconBtn(w, "Put an item from a character sheet into this bag"));
  const depWrap = w.$(".pt-modal .pt-split-recipients");
  check("the deposit character picker has one too", !!depWrap);
  check("its characters are inside it",
    depWrap && depWrap.querySelectorAll("input[name=pt-deposit-char]").length > 1,
    depWrap ? depWrap.querySelectorAll("input[name=pt-deposit-char]").length + " radio(s)" : "no wrapper");
}

(async () => {
  await hiddenBagHeader();
  await addingSeveralItems();
  await depositTellsYouToReopen();
  await characterPickersScroll();
  report("panel-ui");
})();
