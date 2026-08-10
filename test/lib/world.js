// A stubbed Roll20 page: enough of Campaign, the handout model and the
// character model to boot the real extension inside jsdom and drive it.
//
// The shapes here come from docs/roll20-spike-findings.md — handout bodies
// read via _getLatestBlob and written via updateBlobs (S1), the character
// store as a single JSON document in `store` with everything in
// store.integrants.integrants linked by parentID and a childIDs STRING (S2).
// Where a stub and real Roll20 could disagree, the doc is the authority and
// this file is the thing that's wrong; say so in a comment if you find one.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "..", "extension", "src");
const ALL_SCRIPTS = ["util.js", "env.js", "storage.js", "drops.js", "sheets.js", "ui.js", "main.js"];

let idSeq = 0;
function nextId(prefix) { return (prefix || "h") + ++idSeq; }

// A Roll20 handout: attributes via get/save, body via the blob pair.
function makeHandout(attrs) {
  const blobs = { notes: "" };
  return {
    id: nextId("h"),
    attributes: Object.assign({}, attrs),
    get(k) { return this.attributes[k]; },
    save(o) { Object.assign(this.attributes, o); },
    destroy() {
      const models = this._collection.models;
      const i = models.indexOf(this);
      if (i >= 0) models.splice(i, 1);
    },
    _getLatestBlob(key, cb) { setTimeout(() => cb(blobs[key]), 0); },
    updateBlobs(o) { Object.assign(blobs, o); }
  };
}

function makeAttrib(name, current) {
  return {
    _v: current,
    get(k) { return k === "name" ? name : this._v; },
    save(o) { if ("current" in o) this._v = o.current; }
  };
}

// A character on the 2024 Beacon sheet. `integrants` defaults to a minimal
// inventory: one Item under a non-Item parent, which is what addItem looks
// for when deciding where to place a new item.
function makeCharacter(name, opts) {
  opts = opts || {};
  const integrants = opts.integrants || {
    inventory: { _id: "inventory", type: "Inventory", childIDs: '["rope"]' },
    rope: { _id: "rope", type: "Item", name: "Rope", quantity: 1, parentID: "inventory", childIDs: "[]", weight: 10 }
  };
  const attribs = [
    makeAttrib("store", { integrants: { integrants: integrants } }),
    makeAttrib("sheetVersion", opts.sheetVersion || "22"),
    makeAttrib("updateId", "u0")
  ];
  attribs.models = attribs;
  attribs.backboneFirebase = {};
  return {
    id: nextId("c"),
    attributes: {
      name: name,
      charactersheetname: "charactersheetname" in opts ? opts.charactersheetname : "dnd2024byroll20",
      controlledby: opts.controlledby || "",
      tags: opts.tags || ""
    },
    get(k) { return this.attributes[k]; },
    attribs: attribs
  };
}

// Reads a stubbed character's live integrant map — the thing assertions
// about sheet writes actually want to look at.
function integrantsOf(character) {
  return character.attribs.models[0]._v.integrants.integrants;
}

// opts:
//   isGM            - what window.is_gm reports (default false)
//   scripts         - which extension files to load (default: all of them)
//   intervalDivisor - divide every setInterval delay by this, so a test
//                     doesn't have to wait out a real 15s poll
function createWorld(opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://app.roll20.net/editor/",
    runScripts: "outside-only"
  });
  const win = dom.window;

  const handouts = {
    models: [],
    create(attrs) {
      const h = makeHandout(attrs);
      h._collection = handouts;
      handouts.models.push(h);
      return h;
    },
    get(id) { return handouts.models.find(h => h.id === id) || null; }
  };

  win.Campaign = {
    attributes: { release: "jumpgate", journalfolder: "" },
    get(k) { return this.attributes[k]; },
    save(o) { Object.assign(this.attributes, o); },
    handouts: handouts,
    players: { models: [{ id: "p1" }] },
    characters: { models: [] }
  };
  win.campaign_id = "c1";
  win.d20_player_id = "p1";
  win.d20_current_name = "Tester";
  win.is_gm = !!opts.isGM;
  win.BackboneFirebase = function () {};

  if (opts.intervalDivisor) {
    const real = win.setInterval.bind(win);
    win.setInterval = (fn, ms) => real(fn, Math.max(20, Math.round(ms / opts.intervalDivisor)));
  }

  (opts.scripts || ALL_SCRIPTS).forEach(f => {
    win.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  });

  // Verification delays exist for real Roll20's write echo; a stub echoes
  // instantly. storage.js exposes these hooks for exactly this.
  win.PartyTools.VERIFY_DELAY_MS = 5;
  win.PartyTools.CREATE_DELAY_MS = 5;

  return {
    win,
    PT: win.PartyTools,
    handouts,
    document: win.document,
    $: sel => win.document.querySelector(sel),
    all: sel => Array.from(win.document.querySelectorAll(sel)),
    bodyText: () => {
      const b = win.document.querySelector(".pt-body");
      return b ? b.textContent : "";
    },
    click(el) { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); }
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = { createWorld, makeCharacter, integrantsOf, wait, SRC };
