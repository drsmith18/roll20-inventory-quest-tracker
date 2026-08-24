// Accessibility (#43), driven through the real UI in jsdom.
//
// Before this, the whole panel was mouse-only: 1,643 lines of interface with
// one aria attribute in it. Modals had no dialog semantics, no Escape, and no
// focus trap, so Tab walked straight out of the dialog into the Roll20 page
// behind the overlay. The launcher was a div with an onclick — unreachable by
// keyboard, announced as nothing.
//
// Escape-to-close is the check worth caring about most: everybody uses it,
// not just assistive-technology users.
const { createWorld, wait } = require("./lib/world");
const { section, check, report } = require("./lib/assert");

async function readyDM() {
  const w = createWorld({ isGM: true });
  await wait(8000);
  w.click(w.$("#pt-launcher"));
  return w;
}

function key(w, target, k, opts) {
  target.dispatchEvent(new w.win.KeyboardEvent("keydown",
    Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {})));
}

// The "+ New bag" flow is the shortest route to a real modal built by the
// real code, rather than a fixture that only resembles one.
function openAModal(w) {
  // The coin dialog, because it is a real modal built by the real code and it
  // has several focusable controls to trap. ("+ New bag" uses the browser's
  // own prompt()/confirm(), which are the browser's problem, not ours.)
  const btn = w.$(".pt-purse");
  w.click(btn);
  return { trigger: btn, box: w.$(".pt-modal") };
}

async function launcher() {
  section("the launcher is reachable from the keyboard:");
  const w = createWorld({ isGM: true });
  await wait(8000);
  const el = w.$("#pt-launcher");

  check("it is a button, not a div with an onclick", el.tagName === "BUTTON", el.tagName);
  check("it has an accessible name", !!el.getAttribute("aria-label"), el.getAttribute("aria-label"));
  check("it reports the panel as closed to start", el.getAttribute("aria-expanded") === "false",
    el.getAttribute("aria-expanded"));

  w.click(el);
  check("and as open once opened", el.getAttribute("aria-expanded") === "true",
    el.getAttribute("aria-expanded"));
  check("opening moves focus into the panel",
    w.win.document.activeElement && w.win.document.activeElement.closest("#pt-panel") !== null,
    w.win.document.activeElement && w.win.document.activeElement.className);
}

async function tabs() {
  section("the tab strip is a real tablist:");
  const w = await readyDM();
  const all = () => w.all("#pt-panel .pt-tab");

  check("every tab is announced as a tab", all().every(t => t.getAttribute("role") === "tab"),
    all().map(t => t.getAttribute("role")).join(", "));
  check("the tab strip is announced as a tablist",
    w.$("#pt-panel .pt-tabs").getAttribute("role") === "tablist");
  check("exactly one tab is selected",
    all().filter(t => t.getAttribute("aria-selected") === "true").length === 1,
    all().map(t => t.getAttribute("aria-selected")).join(", "));
  check("only the selected tab is in the page's tab order",
    all().filter(t => t.getAttribute("tabindex") === "0").length === 1,
    all().map(t => t.getAttribute("tabindex")).join(", "));

  // Arrow keys, per the usual tablist pattern.
  const inventory = all().find(t => t.getAttribute("data-tab") === "inventory");
  key(w, inventory, "ArrowRight");
  const selected = all().find(t => t.getAttribute("aria-selected") === "true");
  check("ArrowRight moves to the next tab",
    selected.getAttribute("data-tab") === "log", selected.getAttribute("data-tab"));
  check("the announced state follows the visual state",
    selected.classList.contains("pt-active"), selected.className);

  key(w, selected, "ArrowLeft");
  check("ArrowLeft moves back",
    all().find(t => t.getAttribute("aria-selected") === "true").getAttribute("data-tab") === "inventory");

  // Wrapping matters: without it the keyboard user hits a dead end.
  key(w, all().find(t => t.getAttribute("data-tab") === "inventory"), "ArrowLeft");
  check("ArrowLeft from the first tab wraps to the last",
    all().find(t => t.getAttribute("aria-selected") === "true").getAttribute("data-tab") === "about",
    all().find(t => t.getAttribute("aria-selected") === "true").getAttribute("data-tab"));

  const heart = all().find(t => t.getAttribute("data-tab") === "about");
  check("the ♥ tab has a name that isn't just a symbol",
    /about|support|backup/i.test(heart.getAttribute("aria-label") || ""), heart.getAttribute("aria-label"));
}

async function iconButtons() {
  section("icon-only buttons have names, not just tooltips:");
  const w = await readyDM();
  const icons = w.all(".pt-iconbtn");
  check("there are icon buttons to check", icons.length >= 3, icons.length + " found");
  const unnamed = icons.filter(b => !b.getAttribute("aria-label"));
  check("every icon-only button has an accessible name",
    unnamed.length === 0, unnamed.map(b => b.textContent).join(", "));
}

async function modalSemantics() {
  section("a modal announces itself as a dialog:");
  const w = await readyDM();
  const { box } = openAModal(w);

  check("a modal opened", !!box, "no modal found");
  check("it is a dialog", box.getAttribute("role") === "dialog", box.getAttribute("role"));
  check("it is modal", box.getAttribute("aria-modal") === "true", box.getAttribute("aria-modal"));

  const labelledBy = box.getAttribute("aria-labelledby");
  check("it is labelled by something", !!labelledBy, "no aria-labelledby");
  const title = labelledBy && box.querySelector("#" + labelledBy);
  check("and that something is its own visible heading",
    !!title && title.tagName === "H3" && title.textContent.length > 0,
    title ? title.tagName + ": " + title.textContent : "not found");
}

async function escapeCloses() {
  section("Escape closes a modal — the check everybody benefits from:");
  const w = await readyDM();
  openAModal(w);
  check("the modal is open", !!w.$(".pt-modal"));

  key(w, w.win.document.activeElement || w.win.document.body, "Escape");
  check("Escape closed it", !w.$(".pt-modal"), "still open");

  // Escape must behave as Cancel, not as OK — closing a coin dialog should
  // never be the same as confirming it.
  const w2 = await readyDM();
  const before = w2.handouts.models.length;
  openAModal(w2);
  key(w2, w2.win.document.activeElement || w2.win.document.body, "Escape");
  await wait(2000);
  check("and it cancelled rather than confirming",
    w2.handouts.models.length === before, w2.handouts.models.length + " vs " + before);
}

async function focusHandling() {
  section("focus goes into the dialog and comes back out again:");
  const w = await readyDM();
  const doc = w.win.document;

  const focusedBefore = doc.activeElement;
  const { box } = openAModal(w);
  check("focus starts inside the dialog",
    box.contains(doc.activeElement), doc.activeElement && doc.activeElement.tagName);

  // The trap. Without it Tab leaves the dialog for the Roll20 page behind the
  // overlay, where the user cannot see where they are.
  const items = Array.prototype.filter.call(box.querySelectorAll("button, input, select, textarea, [href]"),
    el => !el.disabled);
  check("the dialog has more than one focusable control", items.length > 1, items.length + " found");

  const last = items[items.length - 1];
  last.focus();
  key(w, last, "Tab");
  check("Tab from the last control wraps to the first, not out of the dialog",
    doc.activeElement === items[0], doc.activeElement && doc.activeElement.textContent);

  items[0].focus();
  key(w, items[0], "Tab", { shiftKey: true });
  check("Shift+Tab from the first wraps to the last",
    doc.activeElement === last, doc.activeElement && doc.activeElement.textContent);

  // Returning focus is what stops a keyboard user being dumped at the top of
  // Roll20's page every time they dismiss something.
  key(w, doc.activeElement, "Escape");
  check("closing returns focus to where it was before the dialog took it",
    doc.activeElement === focusedBefore,
    "expected " + (focusedBefore && focusedBefore.textContent) +
    ", got " + (doc.activeElement && doc.activeElement.textContent));
}

(async () => {
  await launcher();
  await tabs();
  await iconButtons();
  await modalSemantics();
  await escapeCloses();
  await focusHandling();
  report("a11y");
})();
