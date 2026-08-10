// Party Tools — shared utilities and constants.
// Everything lives on one namespace object so the files stay plain scripts
// with no build step: easy to read, easy to load unpacked.
window.PartyTools = window.PartyTools || {};
(function (PT) {
  "use strict";
  PT.VERSION = "0.9.12";
  PT.KOFI_URL = "https://ko-fi.com/drsmith080";
  PT.ISSUES_URL = "https://github.com/drsmith18/roll20-inventory-quest-tracker/issues";

  PT.uid = function () {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  };

  PT.delay = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  PT.tryJson = function (text) {
    if (typeof text !== "string") return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  };

  PT.log = function () {
    console.log.apply(console, ["[PartyTools]"].concat([].slice.call(arguments)));
  };

  // Tiny DOM builder. PT.el("div", {class: "x", text: "hi", onclick: fn}, [children])
  PT.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === undefined || attrs[k] === null) return; // absent, not "undefined"
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k]; // only for trusted, static markup
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  };

  // Coin helpers. Order matters: biggest first for display.
  PT.DENOMS = ["pp", "gp", "ep", "sp", "cp"];
  PT.COPPER_VALUE = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
  PT.purseToCopper = function (purse) {
    return PT.DENOMS.reduce(function (sum, d) { return sum + (Number(purse && purse[d]) || 0) * PT.COPPER_VALUE[d]; }, 0);
  };
  PT.purseLabel = function (purse) {
    var parts = PT.DENOMS.filter(function (d) { return Number(purse && purse[d]) > 0; })
      .map(function (d) { return purse[d] + " " + d; });
    if (!parts.length) return "empty purse";
    var gpTotal = (PT.purseToCopper(purse) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    return parts.join(", ") + " (≈" + gpTotal + " gp)";
  };

  // Parses an item's free-text `cost` field ("15 GP", "1,200 gp", "1 CP",
  // a bare number meaning gp, or missing/unparseable meaning 0) into copper,
  // for view-only value sorting (INV-26). Never throws; always returns a
  // number.
  PT.costToCopper = function (cost) {
    if (cost === undefined || cost === null) return 0;
    var s = String(cost).trim();
    if (!s) return 0;
    s = s.replace(/,/g, "");
    var m = s.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
    if (!m) return 0;
    var num = parseFloat(m[1]);
    if (isNaN(num)) return 0;
    var unit = (m[2] || "gp").toLowerCase();
    var mult = PT.COPPER_VALUE[unit];
    if (!mult) return 0;
    return Math.round(num * mult);
  };

  // Re-expresses a copper amount using GOLD as the largest denomination —
  // INV-20e: splits are shown "to gold at most", never platinum, and
  // electrum is input-only (it never comes back out of a split).
  //
  // Self-check against the PRD's worked example (§6, INV-20c):
  //   3 pp + 137 gp + 12 sp + 7 cp = 3000 + 13700 + 120 + 7 = 16,827 cp
  //   split 4 ways: floor(16827 / 4) = 4,206 cp each, remainder 16827 - 4206*4 = 3 cp
  //   PT.copperToGpMax(4206) -> {gp: 42, sp: 0, cp: 6}
  //   PT.coinLabel({gp: 42, sp: 0, cp: 6}) -> "42 gp, 6 cp"
  //   ...matching the PRD table exactly: "42 gp, 6 cp each", "3 cp" stays.
  PT.copperToGpMax = function (cp) {
    cp = Math.max(0, Math.floor(Number(cp) || 0));
    var gp = Math.floor(cp / 100);
    var rest = cp - gp * 100;
    var sp = Math.floor(rest / 10);
    return { gp: gp, sp: sp, cp: rest - sp * 10 };
  };
  PT.coinLabel = function (parts) {
    var bits = [];
    if (parts.gp) bits.push(parts.gp + " gp");
    if (parts.sp) bits.push(parts.sp + " sp");
    if (parts.cp || !bits.length) bits.push(parts.cp + " cp");
    return bits.join(", ");
  };
})(window.PartyTools);
