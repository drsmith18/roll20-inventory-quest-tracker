// Party Tools — shared utilities and constants.
// Everything lives on one namespace object so the files stay plain scripts
// with no build step: easy to read, easy to load unpacked.
window.PartyTools = window.PartyTools || {};
(function (PT) {
  "use strict";
  PT.VERSION = "0.1.1";
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
})(window.PartyTools);
