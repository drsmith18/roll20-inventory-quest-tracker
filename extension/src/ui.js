// Party Tools — panel UI. Vanilla DOM, dark theme to sit over Roll20's UI.
// Hidden content in the DM view is loudly marked (UI-7): striped border and
// an explicit "players can NOT see this" badge — the one distinction that
// must never be ambiguous.
(function (PT) {
  "use strict";
  var ui = PT.ui = {};
  var env = null, snapshot = null, panel = null, launcher = null;
  var activeTab = "inventory";
  var pollTimer = null;
  // Set while there is no usable storage (noStorage / notReady): paints that
  // state's own message and controls into the inventory tab. Held here rather
  // than appended once at mount because EVERY render clears the body — see
  // renderInventory. Null once storage is adopted.
  var statusRender = null;
  // INV-25 search box. Survives ui.refresh() re-renders (see renderBody's
  // focus capture/restore) because it lives here, outside the DOM, and
  // renderInventory() rebuilds the input FROM this value on every render.
  var searchTerm = "";
  // INV-26 per-bag sort choice, keyed by bag id. View-only and intentionally
  // NOT persisted — lost on reload is fine, it never touches storage.
  var bagSort = {};
  // INV-16a (shift-drop obscures on arrival). Compendium drops arrive only
  // through jQuery UI (spike S3) — drops.js's droppable "drop" callback gets
  // the real mouseup event but, per this feature's file boundaries, drops.js
  // itself can't be touched to forward it. Instead a single CAPTURE-phase
  // mouseup listener on `document`, registered once in ui.mount below,
  // records shiftKey before any bubble-phase handler (including jQuery UI's
  // own, which is what eventually calls our onDrop) gets a chance to run —
  // so by the time onDrop fires this always reflects the shift state of that
  // exact drop's mouseup, not some earlier or later one.
  var lastDropShiftKey = false;

  // Palette follows Roll20's own dark UI: charcoal surfaces, thin grey
  // borders, off-white text, restrained crimson accent. Nothing purple.
  var CSS = [
    // --pt-dim lightened from #9aa0a8: at 12px on charcoal the old value was
    // legible by contrast-ratio maths but genuinely hard to read in use.
    ":root{--pt-bg:#1f2126;--pt-bg2:#26282e;--pt-bg3:#2e3138;--pt-edge:#3d4046;--pt-edge2:#4a4e55;--pt-text:#e1e3e6;--pt-dim:#b4bac2;--pt-accent:#c9302c;--pt-gold:#e8cf85}",
    "#pt-launcher{position:fixed;right:0;top:38%;z-index:99990;background:var(--pt-bg2);border:1px solid var(--pt-edge2);border-right:none;border-radius:6px 0 0 6px;padding:9px 7px;cursor:pointer;user-select:none;box-shadow:-2px 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;line-height:0}",
    "#pt-launcher:hover{background:var(--pt-bg3)}",
    "#pt-launcher svg{display:block}",
    "#pt-panel{position:fixed;z-index:99991;width:440px;height:62vh;min-width:340px;min-height:280px;max-width:92vw;max-height:92vh;resize:both;overflow:hidden;display:flex;flex-direction:column;background:var(--pt-bg);color:var(--pt-text);border:1px solid var(--pt-edge2);border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,.6);font:13px/1.5 Arial,Helvetica,sans-serif}",
    "#pt-panel *{box-sizing:border-box}",
    ".pt-head{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#17181c;border-bottom:1px solid var(--pt-edge);border-radius:6px 6px 0 0;cursor:move;user-select:none}",
    ".pt-head .pt-title{font-weight:bold;flex:1;font-size:14px}",
    ".pt-iconbtn{background:none;border:none;color:var(--pt-dim);cursor:pointer;font-size:15px;padding:3px 7px;border-radius:4px;line-height:1}",
    ".pt-iconbtn:hover{background:var(--pt-bg3);color:var(--pt-text)}",
    ".pt-tabs{display:flex;border-bottom:1px solid var(--pt-edge);background:var(--pt-bg)}",
    ".pt-tab{flex:1;text-align:center;padding:8px 0;cursor:pointer;color:var(--pt-dim);border-bottom:2px solid transparent}",
    ".pt-tab:hover{color:var(--pt-text)}",
    ".pt-tab.pt-active{color:var(--pt-text);border-bottom-color:var(--pt-accent);font-weight:bold}",
    ".pt-body{overflow-y:auto;padding:10px 12px;flex:1}",
    ".pt-bag{border:1px solid var(--pt-edge);border-radius:5px;margin-bottom:12px;background:var(--pt-bg2)}",
    ".pt-bag.pt-hidden-bag{border:2px dashed #b3455a;background:repeating-linear-gradient(45deg,#26282e,#26282e 14px,#2d262b 14px,#2d262b 28px)}",
    ".pt-hidden-badge{background:#b3455a;color:#fff;font-size:10px;font-weight:bold;border-radius:3px;padding:2px 7px;margin-left:6px;letter-spacing:.3px}",
    ".pt-baghead{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--pt-edge)}",
    ".pt-bagname{font-weight:bold;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pt-purse{padding:6px 10px;color:var(--pt-gold);font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--pt-edge)}",
    ".pt-purse:hover{background:var(--pt-bg3)}",
    ".pt-items{padding:4px 10px 8px}",
    ".pt-item{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #2b2d33}",
    ".pt-item:last-child{border-bottom:none}",
    // UI-7 applies to the DM ONLY here. Marking an obscured item in the
    // PLAYER's view defeats the entire feature: the highlight announces
    // "this is more than it seems", which is exactly what the DM is hiding.
    // This class is applied only when env.isGM.
    ".pt-item.pt-obscured{border-left:3px solid #b3455a;background:rgba(179,69,90,.10);padding-left:6px}",
    ".pt-truename{color:#b3455a;font-size:11px;margin-left:6px}",
    ".pt-warn{color:#e8b98a;font-size:11.5px;margin-top:8px;padding:6px 8px;border-left:3px solid #b3752f;background:rgba(179,117,47,.12)}",
    // Log tab (INV-16 visible redaction, GM-only side log): a redacted
    // entry keeps its "[hidden by the DM]" replacement text in the normal
    // log colour, with only a small muted tag marking that a redaction
    // happened — the redaction itself must be visible, not silent. A
    // GM-only entry (DM secrets that never reach the shared log) gets the
    // same crimson accent as hidden bags/obscured items elsewhere in the
    // panel, plus an explicit "DM ONLY" tag — the DM must never mistake it
    // for something players can also see.
    ".pt-redacted{color:var(--pt-dim);font-size:11px;font-style:italic}",
    ".pt-gmlog{border-left:3px solid #b3455a;padding-left:6px;background:rgba(179,69,90,.08)}",
    ".pt-gmtag{background:#b3455a;color:#fff;font-size:9px;font-weight:bold;border-radius:3px;padding:1px 5px;margin-right:6px}",
    ".pt-itemname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default}",
    ".pt-itemmeta{color:var(--pt-dim);font-size:11.5px;margin-left:6px}",
    ".pt-qty{color:var(--pt-dim);min-width:32px;text-align:right}",
    ".pt-empty{color:var(--pt-dim);font-style:italic;padding:6px 0}",
    ".pt-row{display:flex;gap:8px;margin:8px 0}",
    ".pt-btn{background:var(--pt-bg3);color:var(--pt-text);border:1px solid var(--pt-edge2);border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12.5px}",
    ".pt-btn:hover{background:#383b43}",
    ".pt-btn:disabled,.pt-btn:disabled:hover{background:var(--pt-bg3);opacity:.55;cursor:default}",
    ".pt-btn.pt-danger{background:#3a2426;border-color:#7c3c3c;color:#e8b4b4}",
    ".pt-btn.pt-danger:hover{background:#4a2b2e}",
    ".pt-drop-over{outline:3px dashed var(--pt-accent);outline-offset:-3px}",
    ".pt-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#17181c;color:var(--pt-text);border:1px solid var(--pt-edge2);border-left:3px solid var(--pt-accent);border-radius:5px;padding:9px 16px;font:13px Arial,Helvetica,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:70vw}",
    ".pt-modal-back{position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}",
    ".pt-modal{background:var(--pt-bg);color:var(--pt-text);border:1px solid var(--pt-edge2);border-radius:6px;padding:16px;width:340px;font:13px/1.5 Arial,Helvetica,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.6)}",
    // Modals are appended to document.body, OUTSIDE #pt-panel, so Roll20's
    // own stylesheet colours their h3/label/span text and the panel's colour
    // never reaches them — which is why dialog text read as dark-on-charcoal.
    // Force our colour onto every descendant, then re-assert the few
    // deliberately different ones below (higher specificity, so they win).
    ".pt-modal, .pt-modal *{color:var(--pt-text);font-family:Arial,Helvetica,sans-serif}",
    ".pt-modal .pt-note{color:var(--pt-dim)}",
    ".pt-modal .pt-warn{color:#e8b98a}",
    ".pt-modal .pt-prev-share{color:var(--pt-gold)}",
    ".pt-modal h3{margin:0 0 12px;font-size:14px;border-bottom:1px solid var(--pt-edge);padding-bottom:8px;color:var(--pt-text)}",
    ".pt-modal label{display:flex;align-items:center;gap:8px;margin:6px 0}",
    ".pt-modal input[type=number],.pt-modal input[type=text]{width:100%;background:#17181c;border:1px solid var(--pt-edge2);color:var(--pt-text);border-radius:4px;padding:5px 8px;font:inherit}",
    ".pt-modal input[type=number]{width:80px}",
    ".pt-log{font-size:12.5px}",
    ".pt-log-entry{padding:5px 0;border-bottom:1px solid #2b2d33}",
    ".pt-log-when{color:var(--pt-dim);margin-right:8px;font-size:11.5px}",
    ".pt-log-who{color:#c8a86a;margin-right:5px;font-weight:bold}",
    ".pt-assign{display:flex;align-items:center;gap:6px;margin:0 10px 6px;padding:4px 8px;border-left:3px solid var(--pt-accent);background:rgba(220,194,117,.06);color:var(--pt-gold);font-size:11.5px}",
    ".pt-assign span{flex:1;min-width:0}",
    ".pt-split-recipients{max-height:160px;overflow-y:auto;border:1px solid var(--pt-edge);border-radius:4px;padding:4px 8px;margin:6px 0}",
    ".pt-split-recipients label{margin:3px 0}",
    ".pt-about a{color:#7eb0d5}",
    ".pt-kofi{display:inline-block;background:#13c3ff;color:#092533 !important;font-weight:bold;border-radius:4px;padding:7px 16px;text-decoration:none;margin:4px 0}",
    ".pt-bug{display:inline-block;background:var(--pt-bg3);color:var(--pt-text) !important;border:1px solid var(--pt-edge2);border-radius:4px;padding:7px 16px;text-decoration:none;margin:4px 0}",
    ".pt-note{color:var(--pt-dim);font-size:12px}",
    // The split preview is a money confirmation — it gets full-strength text,
    // not the muted note colour.
    ".pt-prev-head{color:var(--pt-text);font-size:13px;margin-bottom:8px}",
    ".pt-prev-share{color:var(--pt-gold);font-size:14px;font-weight:bold;padding:3px 0}",
    ".pt-prev-left{color:var(--pt-text);font-size:12.5px;margin-top:10px;padding-top:8px;border-top:1px solid var(--pt-edge)}",
    ".pt-rolebadge{font-size:10px;font-weight:bold;letter-spacing:.4px;border-radius:3px;padding:2px 6px;background:var(--pt-bg3);color:var(--pt-dim);border:1px solid var(--pt-edge2)}",
    ".pt-rolebadge.pt-isgm{background:#3a2b1c;color:#e8cf85;border-color:#7a5f34}",
    ".pt-searchrow{display:flex;gap:6px;margin:0 0 8px}",
    ".pt-search-input{flex:1;min-width:0;background:#17181c;border:1px solid var(--pt-edge2);color:var(--pt-text);border-radius:4px;padding:5px 8px;font:inherit}",
    ".pt-sortsel{background:var(--pt-bg3);border:1px solid var(--pt-edge2);color:var(--pt-text);font-size:11px;border-radius:4px;padding:2px 3px;max-width:82px}",
    ".pt-bagdesc{color:var(--pt-dim);font-size:11.5px;padding:0 10px 6px}"
  ].join("\n");

  function posKey() { return "partytools-" + window.campaign_id + "-" + env.playerId; }

  ui.toast = function (msg, ms) {
    var t = PT.el("div", { class: "pt-toast", text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3500);
  };

  function fmtWhen(t) {
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function bugReportUrl() {
    var body = [
      "**What happened?**", "", "", "**What did you expect instead?**", "", "",
      "---", "_Diagnostics (auto-filled by Party Tools):_",
      "- Party Tools v" + PT.VERSION,
      "- Role: " + (env.isGM ? "DM" : "player"),
      "- Sheet: " + (env.sheet || "unknown"),
      "- Backend: " + (env.release || "unknown"),
      "- Browser: " + navigator.userAgent,
      "- Time: " + new Date().toISOString()
    ].join("\n");
    return PT.ISSUES_URL + "/new?title=" + encodeURIComponent("[bug] ") + "&body=" + encodeURIComponent(body);
  }

  // ---- modal helper ---------------------------------------------------------
  // opts (all optional): okText/cancelText relabel the two buttons (used by
  // the split flow's Confirm/Back step); onCancel fires after the Cancel/Back
  // button closes this modal — the split preview uses it to reopen the form.
  function modal(title, buildBody, onOk, opts) {
    opts = opts || {};
    var back = PT.el("div", { class: "pt-modal-back" });
    var box = PT.el("div", { class: "pt-modal" }, [PT.el("h3", { text: title })]);
    var content = PT.el("div", {});
    buildBody(content);
    var row = PT.el("div", { class: "pt-row" }, [
      PT.el("button", { class: "pt-btn", text: opts.okText || "OK", onclick: function () { if (onOk(content) !== false) back.remove(); } }),
      PT.el("button", { class: "pt-btn pt-danger", text: opts.cancelText || "Cancel", onclick: function () { back.remove(); if (opts.onCancel) opts.onCancel(); } })
    ]);
    box.appendChild(content); box.appendChild(row); back.appendChild(box);
    back.addEventListener("mousedown", function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }

  function coinModal(bag) {
    modal("Coins — " + bag.doc.name, function (c) {
      PT.DENOMS.forEach(function (d) {
        c.appendChild(PT.el("label", {}, [
          PT.el("span", { text: d + " (" + (Number(bag.doc.purse[d]) || 0) + " in purse): ", style: "width:130px" }),
          PT.el("input", { type: "number", value: "0", "data-denom": d })
        ]));
      });
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Reason:" })]));
      c.appendChild(PT.el("input", { type: "text", "data-reason": "1", placeholder: "e.g. sold the silver mirror" }));
      c.appendChild(PT.el("div", { class: "pt-note", text: "Use negative numbers to take coins out." }));
      c.appendChild(PT.el("div", { class: "pt-row" }, [
        PT.el("button", {
          class: "pt-btn", text: "Split coins…", title: "Divide these coins between characters",
          disabled: PT.purseToCopper(bag.doc.purse) > 0 ? undefined : "disabled",
          onclick: function (e) {
            var back = e.target.closest(".pt-modal-back");
            if (back) back.remove();
            splitModal(bag);
          }
        })
      ]));
    }, function (c) {
      var deltas = {};
      PT.DENOMS.forEach(function (d) {
        deltas[d] = parseInt(c.querySelector("[data-denom=" + d + "]").value, 10) || 0;
      });
      if (!PT.DENOMS.some(function (d) { return deltas[d]; })) return;
      var reason = c.querySelector("[data-reason]").value.trim();
      PT.store.changePurse(env, bag.id, bag.doc.name, deltas, reason).then(function (r) {
        if (!r.ok) ui.toast("Coin change failed: " + r.err);
        ui.refresh();
      });
    });
  }

  // ---- coin splitting (INV-20a..h) -------------------------------------------
  // Recipient candidates, sorted, capped at 30 (INV-20b's "chosen subset"
  // needs a bounded list to stay usable).
  //
  // This used to list every character in the campaign, on the reasoning that
  // the DM's NPCs were legitimate recipients. On a PLAYER's client that was a
  // leak: Roll20 ships the full character list to everyone and withholds only
  // the bodies, so the picker named every unmet NPC in the game. Players now
  // get the party (see sheets.partyVisible); the DM still sees everyone, and
  // the free-text field below still takes any name.
  function splitCharacterNames() {
    var models = [];
    try { models = PT.sheets.partyVisible(env) || []; } catch (e) {}
    var names = models
      .map(function (c) { return (c.get("name") || "").trim(); })
      .filter(function (n) { return n; });
    names.sort();
    return names.slice(0, 30);
  }

  function splitModal(bag) {
    var purse = bag.doc.purse || {};
    var chars = splitCharacterNames();
    // Preserved across a Back navigation from the preview step.
    var state = { mode: "whole", specific: {}, recipients: [] };

    function showForm() {
      modal("Split coins — " + bag.doc.name, function (c) {
        var specWrap = PT.el("div", { style: "margin-left:22px;display:" + (state.mode === "specific" ? "block" : "none") });
        PT.DENOMS.forEach(function (d) {
          specWrap.appendChild(PT.el("label", {}, [
            PT.el("span", { text: d + " (" + (Number(purse[d]) || 0) + " in purse): ", style: "width:130px" }),
            PT.el("input", { type: "number", value: String(state.specific[d] || 0), min: "0", "data-spec-denom": d })
          ]));
        });
        var wholeRadio = PT.el("input", { type: "radio", name: "pt-split-mode", value: "whole", checked: state.mode === "whole" ? "checked" : undefined });
        var specRadio = PT.el("input", { type: "radio", name: "pt-split-mode", value: "specific", checked: state.mode === "specific" ? "checked" : undefined });
        [wholeRadio, specRadio].forEach(function (r) {
          r.addEventListener("change", function () { specWrap.style.display = specRadio.checked ? "block" : "none"; });
        });
        c.appendChild(PT.el("label", {}, [wholeRadio, PT.el("span", { text: "Split the whole purse (" + PT.purseLabel(purse) + ")" })]));
        c.appendChild(PT.el("label", {}, [specRadio, PT.el("span", { text: "Split a specific amount:" })]));
        c.appendChild(specWrap);
        c.appendChild(PT.el("div", {
          class: "pt-note",
          text: env.isGM
            ? "Recipients (pick at least one):"
            : "Recipients (pick at least one) — party characters only:"
        }));
        var recipWrap = PT.el("div", { class: "pt-split-recipients" });
        if (!chars.length) {
          recipWrap.appendChild(PT.el("div", {
            class: "pt-note",
            text: env.isGM
              ? "No named characters in this game yet — use the free-text field below."
              : "No party characters found. A character counts as party if a player controls it, or the DM tags it “party” in the journal. Use the free-text field below meanwhile."
          }));
        }
        chars.forEach(function (name) {
          recipWrap.appendChild(PT.el("label", {}, [
            PT.el("input", { type: "checkbox", "data-recipient": "1", value: name, checked: state.recipients.indexOf(name) !== -1 ? "checked" : undefined }),
            PT.el("span", { text: name })
          ]));
        });
        c.appendChild(recipWrap);
        c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Add another name:" })]));
        c.appendChild(PT.el("input", { type: "text", "data-extra-name": "1", placeholder: "e.g. a hireling or NPC" }));
      }, function (c) {
        // NEVER default to "whole" here. The old code read the radio as
        // (querySelector(...) || {}).value || "whole", so ANY failure to read
        // the choice silently meant "split the entire purse" — which is how a
        // request to split 2 gp emptied a 10 gp purse. If the choice can't be
        // read, refuse and say so.
        var checkedRadio = c.querySelector("input[name=pt-split-mode]:checked");
        if (!checkedRadio) { ui.toast("Choose whether to split the whole purse or a specific amount."); return false; }
        var mode = checkedRadio.value;
        var specific = {};
        if (mode === "whole") {
          // "Whole purse" is resolved to explicit per-coin amounts HERE, so
          // the preview and the write always agree on a fixed number. The
          // write path no longer has a "take everything you find" mode.
          PT.DENOMS.forEach(function (d) { specific[d] = Number(purse[d]) || 0; });
        } else {
          PT.DENOMS.forEach(function (d) {
            var input = c.querySelector("[data-spec-denom=" + d + "]");
            specific[d] = input ? (parseInt(input.value, 10) || 0) : 0;
          });
        }
        var recipients = [];
        [].forEach.call(c.querySelectorAll("[data-recipient]"), function (cb) { if (cb.checked) recipients.push(cb.value); });
        var extra = c.querySelector("[data-extra-name]").value.trim();
        if (extra) recipients.push(extra);

        // One validation path now, because both modes produce explicit amounts.
        var over = PT.DENOMS.some(function (d) { return specific[d] > (Number(purse[d]) || 0); });
        if (over) { ui.toast("You can't split more of a coin than the purse holds."); return false; }
        if (!PT.DENOMS.some(function (d) { return specific[d] > 0; })) {
          ui.toast(mode === "whole" ? "The purse is empty." : "Enter an amount to split."); return false;
        }
        if (!recipients.length) { ui.toast("Choose at least one recipient."); return false; }

        state.mode = mode; state.specific = specific; state.recipients = recipients;
        showPreview();
        // fall through: this returns non-false, so the FORM modal closes —
        // the preview modal opened above is already on top of the document.
      });
    }

    function showPreview() {
      // state.specific is always explicit now (whole-purse was resolved to
      // concrete amounts in the form step), so preview and write cannot
      // disagree about how much is being spent.
      var totalCp = PT.DENOMS.reduce(function (sum, d) {
        return sum + (Number(state.specific[d]) || 0) * PT.COPPER_VALUE[d];
      }, 0);
      var n = state.recipients.length;
      var perCp = Math.floor(totalCp / n);
      var remCp = totalCp - perCp * n;
      var shareLabel = PT.coinLabel(PT.copperToGpMax(perCp));
      var leftover = {};
      PT.DENOMS.forEach(function (d) {
        leftover[d] = (Number(purse[d]) || 0) - (Number(state.specific[d]) || 0);
      });
      leftover.cp = (Number(leftover.cp) || 0) + remCp;

      modal("Confirm split — " + bag.doc.name, function (c) {
        c.appendChild(PT.el("div", { class: "pt-prev-head", text: "Splitting " + totalCp.toLocaleString() + " cp between " + n + " recipient" + (n === 1 ? "" : "s") + ":" }));
        var list = PT.el("div", { style: "margin:6px 0" });
        state.recipients.forEach(function (name) {
          list.appendChild(PT.el("div", { class: "pt-prev-share", text: "→ " + name + ": " + shareLabel }));
        });
        c.appendChild(list);
        c.appendChild(PT.el("div", { class: "pt-prev-left", text: "Stays in the purse: " + PT.purseLabel(leftover) }));
      }, function () {
        var recipients = state.recipients.slice();
        PT.store.splitCoins(env, bag.id, bag.doc.name, { specific: state.specific, recipients: recipients }).then(function (r) {
          if (!r.ok) ui.toast(r.err);
          ui.refresh();
        });
      }, { okText: "Confirm", cancelText: "Back", onCancel: showForm });
    }

    showForm();
  }

  function addItemModal(bag) {
    modal("Add item — " + bag.doc.name, function (c) {
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Name:" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "name" }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Quantity:" })]));
      c.appendChild(PT.el("input", { type: "number", value: "1", "data-f": "qty" }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Description (optional):" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "desc" }));
      c.appendChild(PT.el("div", {
        class: "pt-note",
        text: "Tip: you can also drag items from the Roll20 compendium straight onto a bag." +
          (env.isGM ? " Hold Shift while dropping to obscure it immediately — players never see its real stats." : "")
      }));
    }, function (c) {
      var name = c.querySelector("[data-f=name]").value.trim();
      if (!name) return false;
      PT.store.addItem(env, bag.id, bag.doc.name, {
        name: name,
        qty: parseInt(c.querySelector("[data-f=qty]").value, 10) || 1,
        description: c.querySelector("[data-f=desc]").value.trim(),
        resolved: false
      }).then(function (r) { if (!r.ok) ui.toast("Add failed: " + r.err); ui.refresh(); });
    });
  }

  function moveItemModal(bag, item) {
    var others = snapshot.bags.filter(function (b) { return b.id !== bag.id; });
    if (!others.length) { ui.toast("There is no other bag to move it to."); return; }
    modal("Move “" + item.name + "” to…", function (c) {
      others.forEach(function (b, i) {
        c.appendChild(PT.el("label", {}, [
          PT.el("input", { type: "radio", name: "pt-move", value: b.id, checked: i === 0 ? "checked" : undefined }),
          PT.el("span", { text: b.doc.name + (b.hidden ? " (hidden)" : "") })
        ]));
      });
    }, function (c) {
      var sel = c.querySelector("input[name=pt-move]:checked");
      if (!sel) return false;
      var target = others.filter(function (b) { return b.id === sel.value; })[0];
      PT.store.moveItem(env, bag.id, bag.doc.name, target.id, target.doc.name, item.id)
        .then(function (r) { if (!r.ok) ui.toast("Move failed: " + r.err); ui.refresh(); });
    });
  }

  function editBagModal(bag) {
    var d = bag.doc;
    modal("Edit bag", function (c) {
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Name:" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "name", value: d.name }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Description (optional):" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "desc", value: d.desc || "" }));
    }, function (c) {
      var name = c.querySelector("[data-f=name]").value.trim();
      if (!name) return false;
      var desc = c.querySelector("[data-f=desc]").value.trim();
      PT.store.renameBag(env, bag.id, name, desc).then(function (r) {
        if (!r.ok) ui.toast("Update failed: " + r.err);
        ui.refresh();
      });
    });
  }

  // ---- obscured items (INV-16/16a/16b) ---------------------------------------
  // Obscures an item already in a bag. The surface text is the ONLY thing
  // this modal collects — no stats, nothing that touches the true record.
  function obscureItemModal(bag, item) {
    var stack = Number(item.qty) || 1;
    modal("Obscure “" + item.name + "”", function (c) {
      // INV-12 stacks identical items, so obscuring one of a stack of three
      // would otherwise disguise all three. Offer the split explicitly.
      if (stack > 1) {
        c.appendChild(PT.el("label", {}, [
          PT.el("input", { type: "radio", name: "pt-obs-scope", value: "one", checked: "checked" }),
          PT.el("span", { text: "Obscure just ONE of these " + stack + " (the rest stay as they are)" })
        ]));
        c.appendChild(PT.el("label", {}, [
          PT.el("input", { type: "radio", name: "pt-obs-scope", value: "all" }),
          PT.el("span", { text: "Obscure all " + stack + " together" })
        ]));
      }
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Surface description (what players see):" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "surface", placeholder: "a dull grey rod, warm to the touch" }));
      c.appendChild(PT.el("div", { class: "pt-note", text: "Players will see only this as the item's name — no stats, value, or true name. You can reveal it later in one click." }));
      // Obscuring now also redacts the item's true name out of any past log
      // entries (INV-16 visible redaction) — no need to warn that the log
      // still names it; instead tell the DM what actually happens to it.
      c.appendChild(PT.el("div", {
        class: "pt-warn",
        text: "Note: obscuring will also redact this item's name from past activity log entries. Players will see “[hidden by the DM]” there instead — the redaction itself is visible, not silent."
      }));
    }, function (c) {
      var surface = c.querySelector("[data-f=surface]").value.trim();
      if (!surface) return false; // empty input rejected — stay open
      var scopeEl = c.querySelector("input[name=pt-obs-scope]:checked");
      var onlyOne = stack > 1 && (!scopeEl || scopeEl.value === "one");
      PT.store.obscureItem(env, bag.id, bag.doc.name, item.id, surface, onlyOne).then(function (r) {
        if (!r.ok) ui.toast("Obscure failed: " + r.err);
        else if (r.redactFailed) ui.toast("Item obscured, but its name could not be removed from older log entries — check the Log tab.");
        ui.refresh();
      });
    });
  }

  // INV-16a: obscures a compendium item at the moment of drop, so its full
  // stats never render into the bag at all — not even for one refresh cycle.
  // Sequence (must stay in this order): item is already resolved (caller) ->
  // prompt for surface text (this modal) -> true data written to the GM
  // index -> ONLY THEN is a surface-only item written to the bag.
  function obscureOnDropModal(bag, resolvedItem) {
    modal("Shift-drop: obscure on arrival", function (c) {
      c.appendChild(PT.el("div", { class: "pt-note", text: "“" + resolvedItem.name + "” will be added already obscured — players will never see its real stats." }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Surface description (what players see):" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "surface", placeholder: "a dull grey rod, warm to the touch" }));
    }, function (c) {
      var surface = c.querySelector("[data-f=surface]").value.trim();
      if (!surface) return false; // empty input rejected — stay open
      var itemId = PT.uid();
      var truth = {
        name: resolvedItem.name, description: resolvedItem.description, cost: resolvedItem.cost,
        weight: resolvedItem.weight, rarity: resolvedItem.rarity, itemType: resolvedItem.itemType,
        pagename: resolvedItem.pagename, expansionId: resolvedItem.expansionId, datarecords: resolvedItem.datarecords,
        hiddenAt: Date.now(), hiddenBy: env.playerName
      };
      // Truth to the GM index FIRST; the bag write only happens after that
      // is confirmed — see storage.js's obscureItem for why this order is
      // not interchangeable.
      PT.store.stashObscuredTruth(env, itemId, truth).then(function (r) {
        if (!r.ok) { ui.toast("Couldn't save the true item data — nothing was added. Try the drop again."); return; }
        PT.store.addObscuredItem(env, bag.id, bag.doc.name, itemId, resolvedItem.qty, surface).then(function (r2) {
          if (!r2.ok) ui.toast("True data was saved, but adding the obscured item to the bag failed: " + r2.err);
          ui.refresh();
        });
      });
    }, { okText: "Obscure & add" });
  }

  // ---- claim an item to a character sheet (INV-21/23a/23b/24) ---------------
  // Writes to the character sheet FIRST and only removes the claimed
  // quantity from the bag if that write reported ok:true. Never the other
  // way round: a bag removal followed by a failed sheet write would destroy
  // the item (it would be gone from the bag, and never actually landed on
  // the sheet). On a sheet-write failure this changes NOTHING in the bag.
  //
  // Obscured items (INV-16) store only their surface name in `item.name` —
  // the true stats live in the GM-only index and are never read here. That
  // means claiming an obscured item necessarily puts just the surface text
  // on the sheet, with no stats. That's correct behaviour (INV-16's whole
  // point is that even the item's owner shouldn't see the true data until
  // the DM reveals it), not a bug — this function makes no attempt to look
  // the true data up, and does not refuse the claim.
  function doClaimItem(bag, item, character, qty) {
    var charName = character.get("name");
    var whole = qty >= (Number(item.qty) || 1);

    function removeFromBag(extraDoc) {
      return PT.store.mutateBag(bag.id, function (doc) {
        var it = (doc.items || []).filter(function (i) { return i.id === item.id; })[0];
        if (!it) return false;
        if (extraDoc) extraDoc(doc);
        if (whole) doc.items = doc.items.filter(function (i) { return i.id !== item.id; });
        else it.qty = (Number(it.qty) || 1) - qty;
      });
    }

    if (PT.sheets.isSupported(character)) {
      return PT.sheets.addItem(character, {
        name: item.name, qty: qty, description: item.description,
        weight: item.weight, cost: item.cost, rarity: item.rarity,
        // The compendium graph, when the item came from a drop that resolved.
        // Absent on manual items, on name-only fallbacks (INV-11), and on
        // obscured items — whose true record is deliberately not read here.
        datarecords: item.datarecords
      }).then(function (sheetRes) {
        // Sheet write failed: STOP. Nothing about the bag changes.
        if (!sheetRes.ok) return { ok: false, err: sheetRes.err };
        // Sheet write succeeded: ONE mutateBag call removes the claimed
        // quantity (whole stack, or reduces qty).
        return removeFromBag().then(function (r) {
          if (r.ok) {
            // Surfaced so the caller can warn when an item that HAD a
            // compendium record still landed as a synthesised plain one.
            r.graph = !!sheetRes.graph;
            r.fromCompendium = !!sheetRes.fromCompendium;
            r.unwrittenTypes = sheetRes.unwrittenTypes || [];
            PT.store.appendLog(env, env.playerName + " claimed " + qty + "× “" + item.name + "” to " + charName);
            return r;
          }
          // The item IS on the sheet but did NOT leave the bag. Reporting a
          // plain "claim failed" here would be a lie that costs the user:
          // they would retry and end up with two copies on the sheet. Flag
          // it distinctly so the caller can say exactly what happened.
          return { ok: false, halfDone: true, err: r.err };
        });
      });
    }

    // INV-24: sheet not supported — do NOT write to any sheet. Record an
    // assignment exactly like coin splitting does, AND remove the claimed
    // quantity from the bag, in the SAME mutateBag call (mirrors INV-20h:
    // it must leave the bag, or the party's inventory double-counts it).
    return removeFromBag(function (doc) {
      doc.assignments = doc.assignments || [];
      doc.assignments.push({
        id: PT.uid(), to: charName, item: item.name, qty: qty, t: Date.now(), by: env.playerName
      });
    }).then(function (r) {
      if (r.ok) {
        PT.store.appendLog(env, env.playerName + " claimed " + qty + "× “" + item.name + "” to " + charName + " — sheet not supported, recorded as assigned");
      }
      return r;
    });
  }

  function claimItemModal(bag, item) {
    // controlledBy already implements INV-23b (a player only gets characters
    // they control) — this just calls it, never widens the result.
    var chars = PT.sheets.controlledBy(env);
    if (!chars.length) { ui.toast("You don't control any characters in this game."); return; }
    var stack = Number(item.qty) || 1;
    var single = chars.length === 1;

    modal(single ? "Claim “" + item.name + "”" : "Claim “" + item.name + "” to…", function (c) {
      if (single) {
        var unsupported0 = !PT.sheets.isSupported(chars[0]);
        c.appendChild(PT.el("div", {
          class: "pt-note",
          text: "To: " + chars[0].get("name") + (unsupported0 ? " — unsupported sheet, will be recorded as assigned instead" : "")
        }));
      } else {
        // INV-23a: only asks which character when there IS a choice. Sorted
        // exactly as controlledBy returned them; default the first.
        chars.forEach(function (ch, i) {
          var unsupported = !PT.sheets.isSupported(ch);
          c.appendChild(PT.el("label", {}, [
            PT.el("input", { type: "radio", name: "pt-claim-char", value: String(i), checked: i === 0 ? "checked" : undefined }),
            PT.el("span", { text: ch.get("name") + (unsupported ? " — unsupported sheet, will be recorded as assigned instead" : "") })
          ]));
        });
      }
      if (stack > 1) {
        c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Quantity (of " + stack + "):" })]));
        c.appendChild(PT.el("input", { type: "number", value: "1", min: "1", max: String(stack), "data-f": "qty" }));
      }
    }, function (c) {
      var character;
      if (single) {
        character = chars[0];
      } else {
        var sel = c.querySelector("input[name=pt-claim-char]:checked");
        if (!sel) return false;
        character = chars[parseInt(sel.value, 10)];
      }
      var qty = 1;
      if (stack > 1) {
        var qtyInput = c.querySelector("[data-f=qty]");
        qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
        if (qty < 1) qty = 1;
        if (qty > stack) qty = stack;
      }
      var unsupportedClaim = !PT.sheets.isSupported(character);
      doClaimItem(bag, item, character, qty).then(function (r) {
        if (r.halfDone) {
          ui.toast("“" + item.name + "” IS now on " + character.get("name") +
            "’s sheet, but it could not be removed from the bag. Delete it from the bag by hand — do NOT claim it again or you'll get two.", 12000);
          ui.refresh();
          return;
        }
        if (!r.ok) { ui.toast("Claim failed, nothing was changed: " + r.err); ui.refresh(); return; }
        if (unsupportedClaim) {
          ui.toast("“" + item.name + "” recorded as assigned to " + character.get("name") + " — move it onto the sheet by hand.");
        } else if (item.datarecords && !r.fromCompendium && !r.graph) {
          // It had a compendium record and we still couldn't use it, so the
          // item on the sheet was synthesised from the little the bag stored
          // — no weapon data. Say so, rather than let someone find out mid
          // combat. (An item that DID use its compendium record says nothing:
          // that is the normal, working case.)
          ui.toast("“" + item.name + "” went onto the sheet as a plain item — its compendium data couldn't be read. Add it from the sheet's own compendium if you need the full weapon.", 10000);
        } else if (r.unwrittenTypes && r.unwrittenTypes.length) {
          // Part of the item's data has no rule yet — armour and magic items
          // are the likely sources. Naming the record types turns "my armour
          // doesn't give AC" into something reportable, and tells whoever
          // picks up the bug report exactly which payload to go and dump.
          ui.toast("“" + item.name + "” is on the sheet, but " + r.unwrittenTypes.length +
            " part(s) of it weren't written (" + r.unwrittenTypes.join(", ") +
            "). Check it works on the sheet — and please report it with the 🐞 button.", 12000);
        }
        ui.refresh();
      });
    }, { okText: "Claim" });
  }

  // ---- deposit an item from a character sheet into a bag --------------------
  // The reverse of claiming, and the other half of a round trip: an item
  // taken off a sheet keeps its record graph (sheets.takeItem hands it back
  // in the same shape a compendium drop stores), so putting a longsword in
  // the bag and claiming it again later returns a working weapon, not a
  // flattened possession.
  //
  // Sheet first, bag second — the same ordering claiming uses, for the same
  // reason: if the bag write fails the item is off the sheet and nowhere, so
  // that case is reported loudly rather than swallowed.
  function depositItem(bag, character, sheetItem, qty) {
    var charName = character.get("name");
    return PT.sheets.takeItem(character, sheetItem.id, qty).then(function (res) {
      if (!res.ok) return { ok: false, err: res.err };
      return PT.store.addItem(env, bag.id, bag.doc.name, res.item).then(function (r) {
        if (r.ok) {
          PT.store.appendLog(env, env.playerName + " put " + qty + "× “" + res.item.name + "” from " + charName + " into “" + bag.doc.name + "”");
          return r;
        }
        return { ok: false, halfDone: true, err: r.err, item: res.item };
      });
    });
  }

  function depositModal(bag) {
    var chars = PT.sheets.controlledBy(env).filter(function (c) { return PT.sheets.isSupported(c); });
    if (!chars.length) {
      ui.toast("No character you control uses a supported sheet, so there's nothing to take items from.");
      return;
    }

    function pickItems(character) {
      // Reading a sheet means waiting for its attribs to load, which is why
      // this is its own step with its own message rather than a frozen modal.
      var loading = PT.el("div", { class: "pt-empty", text: "Reading " + character.get("name") + "’s sheet…" });
      var listWrap = PT.el("div", { class: "pt-split-recipients" }, [loading]);
      var state = { items: null };

      modal("Put an item into “" + bag.doc.name + "” — from " + character.get("name"), function (c) {
        c.appendChild(PT.el("div", { class: "pt-note", text: "Pick one item to move off the sheet and into the bag:" }));
        c.appendChild(listWrap);
        c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Quantity:" })]));
        c.appendChild(PT.el("input", { type: "number", value: "1", min: "1", "data-f": "qty" }));
      }, function (c) {
        if (!state.items) { ui.toast("Still reading the sheet — try again in a moment."); return false; }
        if (!state.items.length) return false;
        var sel = c.querySelector("input[name=pt-deposit-item]:checked");
        if (!sel) { ui.toast("Pick an item first."); return false; }
        var item = state.items[parseInt(sel.value, 10)];
        var qtyInput = c.querySelector("[data-f=qty]");
        var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
        if (qty < 1) qty = 1;
        if (qty > item.qty) qty = item.qty;

        depositItem(bag, character, item, qty).then(function (r) {
          if (r.halfDone) {
            ui.toast("“" + item.name + "” came OFF " + character.get("name") +
              "’s sheet but could not be added to the bag. Add it back by hand — it is not in the party inventory.", 12000);
            ui.refresh();
            return;
          }
          if (!r.ok) { ui.toast("Nothing was changed: " + r.err); ui.refresh(); return; }
          ui.toast("Moved " + qty + "× “" + item.name + "” into “" + bag.doc.name + "”.");
          ui.refresh();
        });
      }, { okText: "Put in bag" });

      PT.sheets.listItems(character).then(function (res) {
        listWrap.textContent = "";
        if (!res.ok) {
          listWrap.appendChild(PT.el("div", { class: "pt-note", text: "Could not read that sheet: " + res.err }));
          return;
        }
        state.items = res.items;
        if (!res.items.length) {
          listWrap.appendChild(PT.el("div", { class: "pt-note", text: "That sheet has no items on it." }));
          return;
        }
        res.items.forEach(function (it, i) {
          var label = it.name + (it.qty > 1 ? " ×" + it.qty : "") +
            (it.container ? " (in " + it.container + ")" : "");
          listWrap.appendChild(PT.el("label", {}, [
            PT.el("input", { type: "radio", name: "pt-deposit-item", value: String(i) }),
            PT.el("span", { text: label })
          ]));
        });
      });
    }

    if (chars.length === 1) { pickItems(chars[0]); return; }
    modal("Put an item into “" + bag.doc.name + "”", function (c) {
      c.appendChild(PT.el("div", { class: "pt-note", text: "Take an item from which character?" }));
      chars.forEach(function (ch, i) {
        c.appendChild(PT.el("label", {}, [
          PT.el("input", { type: "radio", name: "pt-deposit-char", value: String(i), checked: i === 0 ? "checked" : undefined }),
          PT.el("span", { text: ch.get("name") })
        ]));
      });
    }, function (c) {
      var sel = c.querySelector("input[name=pt-deposit-char]:checked");
      if (!sel) return false;
      pickItems(chars[parseInt(sel.value, 10)]);
    }, { okText: "Next" });
  }

  // ---- push a coin assignment to a character sheet (INV-20g) ----------------
  function pushCoinAssignmentToSheet(bag, a) {
    var chars = PT.sheets.controlledBy(env);
    var character = chars.filter(function (c) { return c.get("name") === a.to; })[0];
    if (!character) { ui.toast("No character you control is named " + a.to + "."); return; }
    if (!PT.sheets.isSupported(character)) {
      ui.toast(character.get("name") + "’s sheet isn’t supported — push these coins by hand instead.");
      return;
    }
    var denoms = PT.copperToGpMax(a.cp);
    PT.sheets.addCoins(character, { pp: 0, gp: denoms.gp, ep: 0, sp: denoms.sp, cp: denoms.cp }).then(function (r) {
      if (!r.ok) { ui.toast("Push failed: " + r.err); return; }
      // ONLY on ok:true: remove the assignment via the same code path the ✓
      // button uses, with a log message naming the push instead of the
      // generic "marked ... as transferred".
      var msg = env.playerName + " pushed " + a.label + " to " + character.get("name") + "’s sheet";
      PT.store.transferAssignment(env, bag.id, bag.doc.name, a.id, msg).then(function (r2) {
        if (!r2.ok) ui.toast("Coins were added to the sheet, but the assignment note couldn't be cleared: " + r2.err);
        ui.refresh();
      });
    });
  }

  // ---- search (INV-25) & sort (INV-26) helpers -------------------------------
  function itemMatches(it, needleLower) {
    var n = (it.name || "").toLowerCase();
    var desc = (it.description || "").toLowerCase();
    return n.indexOf(needleLower) !== -1 || desc.indexOf(needleLower) !== -1;
  }

  // View-only, stable (ties keep their original relative order — the tie
  // break is the original index, not object identity), and never mutates
  // `items` or the stored doc: callers always get a new array back.
  function sortItems(items, mode) {
    var decorated = (items || []).map(function (it, i) { return { it: it, i: i }; });
    var cmp;
    if (mode === "name") {
      cmp = function (a, b) {
        var an = (a.it.name || "").toLowerCase(), bn = (b.it.name || "").toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : a.i - b.i;
      };
    } else if (mode === "qty") {
      cmp = function (a, b) {
        var d = (Number(b.it.qty) || 0) - (Number(a.it.qty) || 0);
        return d !== 0 ? d : a.i - b.i;
      };
    } else if (mode === "value") {
      cmp = function (a, b) {
        var d = PT.costToCopper(b.it.cost) - PT.costToCopper(a.it.cost);
        return d !== 0 ? d : a.i - b.i;
      };
    } else if (mode === "weight") {
      cmp = function (a, b) {
        var d = (Number(b.it.weight) || 0) - (Number(a.it.weight) || 0);
        return d !== 0 ? d : a.i - b.i;
      };
    } else {
      return items || []; // "added" = storage order, unchanged
    }
    decorated.sort(cmp);
    return decorated.map(function (x) { return x.it; });
  }

  // ---- rendering ------------------------------------------------------------
  // itemsOverride: used by the search view (INV-25) to render only the
  // matching items for a bag whose NAME didn't itself match. Sorting (INV-26)
  // always applies on top of whichever list is showing.
  function renderBag(bag, itemsOverride) {
    var d = bag.doc;
    var head = PT.el("div", { class: "pt-baghead" }, [
      PT.el("span", { class: "pt-bagname", text: d.name, title: d.name })
    ]);
    if (bag.hidden) head.appendChild(PT.el("span", { class: "pt-hidden-badge", text: "HIDDEN — players can NOT see this" }));
    // INV-4: the DM can edit any bag; a player only a bag they created that
    // is still empty. Not shown at all when the viewer can't use it.
    var canEditBag = env.isGM || (PT.store.ownsBag(env, d) && !(d.items || []).length && PT.purseToCopper(d.purse) === 0);
    if (canEditBag) {
      head.appendChild(PT.el("button", {
        class: "pt-iconbtn", text: "✎", title: "Rename or describe this bag",
        onclick: function () { editBagModal(bag); }
      }));
    }
    var sortSel = PT.el("select", { class: "pt-sortsel", title: "Sort this bag's items (view only)" }, [
      PT.el("option", { value: "added", text: "Added" }),
      PT.el("option", { value: "name", text: "Name" }),
      PT.el("option", { value: "qty", text: "Quantity" }),
      PT.el("option", { value: "value", text: "Value" }),
      PT.el("option", { value: "weight", text: "Weight" })
    ]);
    sortSel.value = bagSort[bag.id] || "added";
    sortSel.addEventListener("change", function () {
      bagSort[bag.id] = sortSel.value;
      renderBody(); // view-only: no store call, nothing to refresh from the server
    });
    head.appendChild(sortSel);
    head.appendChild(PT.el("button", {
      class: "pt-iconbtn", text: "+", title: "Add an item by name",
      onclick: function () { addItemModal(bag); }
    }));
    head.appendChild(PT.el("button", {
      class: "pt-iconbtn", text: "⇩", title: "Put an item from a character sheet into this bag",
      onclick: function () { depositModal(bag); }
    }));
    if (env.isGM) {
      head.appendChild(PT.el("button", {
        class: "pt-iconbtn", text: bag.hidden ? "👁" : "🙈",
        title: bag.hidden ? "Reveal this bag to the party" : "Hide this bag from players",
        onclick: function () {
          PT.store.setBagHidden(env, bag.id, !bag.hidden, d.name).then(function (r) {
            if (!r.ok) ui.toast("Failed: " + r.err);
            ui.refresh();
          });
        }
      }));
      head.appendChild(PT.el("button", {
        class: "pt-iconbtn", text: "🗑", title: "Delete this bag",
        onclick: function () {
          var hasStuff = (d.items || []).length || PT.purseToCopper(d.purse) > 0;
          var others = snapshot.bags.filter(function (b) { return b.id !== bag.id; });
          if (hasStuff && !others.length) { ui.toast("Can't delete: the contents have nowhere to go."); return; }
          var msg = hasStuff
            ? "Delete “" + d.name + "”? Its items and coins will move to “" + others[0].doc.name + "”."
            : "Delete empty bag “" + d.name + "”?";
          if (!confirm(msg)) return;
          PT.store.deleteBag(env, bag.id, d.name, hasStuff ? others[0].id : null)
            .then(function (r) { if (!r.ok) ui.toast("Delete failed: " + r.err); ui.refresh(); });
        }
      }));
    }
    var purse = PT.el("div", {
      class: "pt-purse", text: "🪙 " + PT.purseLabel(d.purse), title: "Click to add or remove coins",
      onclick: function () { coinModal(bag); }
    });
    var assignRows = [];
    // Two shapes share this array: a coin-split entry (INV-20g/h) has
    // `.cp`/`.label`; an item claim to an unsupported sheet (INV-24) has
    // `.item`/`.qty` instead. Both render here, both get the ✓ "mark
    // transferred" button; only coin entries also get a "push to sheet"
    // button (INV-20g) — there is nothing to push for an item, the player
    // just moves it onto the sheet by hand.
    (d.assignments || []).forEach(function (a) {
      var isItem = a.item !== undefined;
      var label = isItem
        ? "→ " + a.to + ": " + a.qty + "× " + a.item + " (assigned — move it to the sheet by hand)"
        : (function () {
          var when = new Date(a.t);
          var dateStr = (when.getMonth() + 1) + "/" + when.getDate();
          return "→ " + a.to + ": " + a.label + " (assigned " + dateStr + " — waiting to be taken)";
        })();
      var rowChildren = [PT.el("span", { text: label })];
      if (!isItem) {
        rowChildren.push(PT.el("button", {
          class: "pt-iconbtn", text: "→", title: "Push these coins to the character's sheet",
          onclick: function () { pushCoinAssignmentToSheet(bag, a); }
        }));
      }
      rowChildren.push(PT.el("button", {
        class: "pt-iconbtn", text: "✓", title: "Mark as transferred (removes this note)",
        onclick: function () {
          PT.store.transferAssignment(env, bag.id, d.name, a.id).then(function (r) {
            if (!r.ok) ui.toast("Failed: " + r.err);
            ui.refresh();
          });
        }
      }));
      assignRows.push(PT.el("div", { class: "pt-assign" }, rowChildren));
    });
    var items = PT.el("div", { class: "pt-items" });
    var displayItems = sortItems(itemsOverride || d.items || [], bagSort[bag.id] || "added");
    if (!displayItems.length) items.appendChild(PT.el("div", { class: "pt-empty", text: "No items yet — drag from the compendium or use +" }));
    displayItems.forEach(function (it) {
      var titleBits = [];
      if (it.itemType) titleBits.push(it.itemType);
      if (it.rarity) titleBits.push(it.rarity);
      if (it.cost) titleBits.push(it.cost);
      if (it.weight != null) titleBits.push(it.weight + " lb");
      if (it.description) titleBits.push("— " + it.description);
      titleBits.push("(added by " + (it.addedBy || "?") + ")");
      var metaBits = [];
      if (it.cost) metaBits.push(it.cost);
      if (it.weight != null && it.weight !== "") metaBits.push(it.weight + " lb");
      // Note titleBits/metaBits above are built only from fields that still
      // exist on `it` — obscureItem deletes description/cost/weight/rarity/
      // itemType from an obscured item's record entirely (not just blanks
      // them), so this tooltip naturally carries nothing true-identity-ish
      // for players once an item is obscured. Nothing obscure-specific is
      // added to it here.
      var nameSpan = PT.el("span", { class: "pt-itemname", title: titleBits.join(" · ") }, [
        PT.el("span", { text: it.name + (it.resolved === false && it.note ? " *" : "") })
      ]);
      if (metaBits.length) nameSpan.appendChild(PT.el("span", { class: "pt-itemmeta", text: metaBits.join(" · ") }));
      // UI-7 / INV-16: the true name tag is built ONLY from the snapshot's
      // GM-only `obscured` map (never from anything on `it` itself, which
      // never carries it), and only ever rendered for the DM. For a player
      // client snapshot.obscured is always {} (storage.js's snapshot()) —
      // there is no code path here that could put a true name in front of a
      // player, in a tooltip/title or otherwise.
      var isObs = env.isGM && PT.store.isObscured(snapshot, it.id);
      if (isObs) {
        var truth = (snapshot.obscured || {})[it.id];
        if (truth) nameSpan.appendChild(PT.el("span", { class: "pt-truename", text: "[" + truth.name + "]" }));
      }
      var actionBtns = [
        PT.el("button", { class: "pt-iconbtn", text: "−", title: "One fewer", onclick: function () { PT.store.changeQty(env, bag.id, d.name, it.id, -1).then(ui.refresh); } }),
        PT.el("button", { class: "pt-iconbtn", text: "+", title: "One more", onclick: function () { PT.store.changeQty(env, bag.id, d.name, it.id, +1).then(ui.refresh); } }),
        PT.el("button", { class: "pt-iconbtn", text: "⇄", title: "Move to another bag", onclick: function () { moveItemModal(bag, it); } }),
        // INV-21/23a/23b: visible to everyone (players and DM alike) —
        // controlledBy itself is what restricts which characters show up.
        PT.el("button", { class: "pt-iconbtn", text: "→", title: "Claim this item to one of your characters", onclick: function () { claimItemModal(bag, it); } })
      ];
      if (env.isGM) {
        if (isObs) {
          actionBtns.push(PT.el("button", {
            class: "pt-iconbtn", text: "👁", title: "Reveal this item's true nature to the party",
            onclick: function () {
              var truth = (snapshot.obscured || {})[it.id];
              var trueName = truth ? truth.name : it.name;
              if (!confirm("Reveal “" + trueName + "” to the party? Players will see its real name and stats.")) return;
              PT.store.revealItem(env, bag.id, d.name, it.id).then(function (r) {
                if (!r.ok) ui.toast("Reveal failed: " + r.err);
                ui.refresh();
              });
            }
          }));
        } else {
          actionBtns.push(PT.el("button", {
            class: "pt-iconbtn", text: "👁", title: "Obscure this item from players",
            onclick: function () { obscureItemModal(bag, it); }
          }));
        }
      }
      actionBtns.push(PT.el("button", {
        class: "pt-iconbtn", text: "×", title: "Delete item",
        onclick: function () {
          if (!confirm("Remove “" + it.name + "” from “" + d.name + "”? The DM can restore it via the activity log.")) return;
          PT.store.deleteItem(env, bag.id, d.name, it.id).then(ui.refresh);
        }
      }));
      // isObs is env.isGM-gated, so a player never gets the marker class.
      items.appendChild(PT.el("div", { class: "pt-item" + (isObs ? " pt-obscured" : "") },
        [nameSpan, PT.el("span", { class: "pt-qty", text: "×" + (it.qty || 1) })].concat(actionBtns)));
    });
    var descDiv = d.desc ? PT.el("div", { class: "pt-bagdesc", text: d.desc }) : null;
    var card = PT.el("div", { class: "pt-bag" + (bag.hidden ? " pt-hidden-bag" : "") }, [head, descDiv, purse].concat(assignRows, [items]));
    // every bag is its own drop target (UI-5: it's obvious which bag receives)
    PT.drops.arm(card, function (payload) {
      // INV-16a: capture the shift state of THIS drop's mouseup right away —
      // see lastDropShiftKey's declaration for why it's read this way rather
      // than off the jQuery drop event directly.
      var shiftDrop = env.isGM && lastDropShiftKey;
      ui.toast("Fetching item details…", 1500);
      PT.drops.resolve(payload).then(function (item) {
        if (shiftDrop) {
          // Prompt for the surface text BEFORE anything is written anywhere;
          // the full-stat `item` here never gets past this point — see
          // obscureOnDropModal for the write sequence.
          obscureOnDropModal(bag, item);
          return;
        }
        PT.store.addItem(env, bag.id, d.name, item).then(function (r) {
          if (!r.ok) ui.toast("Drop failed to save: " + r.err);
          else if (!item.resolved) ui.toast("Added “" + item.name + "” by name only (" + item.note + ").");
          ui.refresh();
        });
      });
    });
    return card;
  }

  function renderInventory(body) {
    // No storage adopted yet, so there is nothing to list. Paint the blocked
    // state's message instead, on every render.
    //
    // This guard is load-bearing: mount() used to append that message once
    // and return, but opening the panel calls renderBody(), which clears the
    // body and then threw here on snapshot.readOnly — so a player in a game
    // the DM had not set up yet saw the explanation for a moment at most,
    // then an empty panel with no hint of what was wrong.
    if (!snapshot) {
      if (statusRender) statusRender(body);
      else body.appendChild(PT.el("div", { class: "pt-empty", text: "Party Tools is still starting up…" }));
      return;
    }
    if (snapshot.readOnly) body.appendChild(PT.el("div", { class: "pt-note", text: "⚠ This game's data was written by a NEWER version of Party Tools. Everything is read-only until you update the extension." }));

    // INV-25: search box. Rebuilt from `searchTerm` on every render, so the
    // module-level variable — not this element — is the source of truth;
    // renderBody()'s focus capture/restore is what keeps typing feeling
    // uninterrupted across a rebuild (see renderBody below).
    var searchRow = PT.el("div", { class: "pt-searchrow" });
    var searchInput = PT.el("input", { type: "text", class: "pt-search-input", placeholder: "Search items…", value: searchTerm });
    searchInput.addEventListener("input", function () {
      searchTerm = searchInput.value;
      renderBody();
    });
    searchRow.appendChild(searchInput);
    if (searchTerm) {
      searchRow.appendChild(PT.el("button", {
        class: "pt-iconbtn", text: "✕", title: "Clear search",
        onclick: function () { searchTerm = ""; renderBody(); }
      }));
    }
    body.appendChild(searchRow);

    // Bag creation is DM-only (INV-4, revised): Roll20's server refuses
    // handout creation by a non-GM, and every bag is a handout. Offering the
    // button to players would only ever produce a failure, so it is absent
    // rather than disabled.
    if (env.isGM) {
      body.appendChild(PT.el("div", { class: "pt-row" }, [
        PT.el("button", {
          class: "pt-btn", text: "+ New bag",
          onclick: function () {
            var name = prompt("Name for the new bag:");
            if (!name || !name.trim()) return;
            var hidden = confirm("Create it HIDDEN from players?\n\nOK = hidden (only you see it)\nCancel = visible to the party");
            PT.store.createBag(env, name.trim(), hidden).then(function (r) {
              if (!r.ok) ui.toast("Couldn't create the bag: " + r.err);
              ui.refresh();
            });
          }
        })
      ]));
    }

    var term = searchTerm.trim();
    if (!term) {
      if (!snapshot.bags.length) body.appendChild(PT.el("div", { class: "pt-empty", text: "No bags yet." }));
      snapshot.bags.forEach(function (bag) { body.appendChild(renderBag(bag)); });
      return;
    }

    // Bags whose name matches, or that hold at least one matching item, stay
    // visible; a name match shows ALL of that bag's items, otherwise only
    // the matching ones render (case-insensitive substring, name+description).
    var needle = term.toLowerCase();
    var matches = [];
    var totalItems = 0;
    snapshot.bags.forEach(function (bag) {
      var d = bag.doc;
      var nameMatch = (d.name || "").toLowerCase().indexOf(needle) !== -1;
      var all = d.items || [];
      var shown = nameMatch ? all : all.filter(function (it) { return itemMatches(it, needle); });
      if (nameMatch || shown.length) {
        matches.push({ bag: bag, items: shown });
        totalItems += shown.length;
      }
    });

    if (!matches.length) {
      body.appendChild(PT.el("div", { class: "pt-empty", text: "Nothing matches “" + term + "”." }));
      return;
    }

    var itemWord = totalItems === 1 ? "item" : "items";
    var bagWord = matches.length === 1 ? "bag" : "bags";
    body.appendChild(PT.el("div", {
      class: "pt-note",
      text: totalItems + " " + itemWord + " in " + matches.length + " " + bagWord + " match “" + term + "”"
    }));
    matches.forEach(function (m) { body.appendChild(renderBag(m.bag, m.items)); });
  }

  // DM sees the shared log AND the GM-only log (DM secrets: hidden bags,
  // obscuring), merged and sorted by time, with GM-only entries visually
  // unmistakable (pt-gmlog border/tint + a "DM ONLY" tag) — same principle
  // as UI-7 elsewhere in this file: what's DM-only must never look
  // ambiguous. Players only ever get the shared log; readGmLog() is never
  // even called for them (their client's st.gmLogH is null anyway, since
  // Roll20 withholds that handout's body server-side, but we don't rely on
  // that alone here).
  function renderLog(body) {
    var wrap = PT.el("div", { class: "pt-log" }, [PT.el("div", { class: "pt-empty", text: "Loading…" })]);
    body.appendChild(wrap);
    var logsP = env.isGM
      ? Promise.all([PT.store.readLog(), PT.store.readGmLog()])
      : PT.store.readLog().then(function (shared) { return [shared, []]; });
    logsP.then(function (both) {
      var entries = both[0].concat(both[1].map(function (e) {
        var tagged = {};
        for (var k in e) { if (e.hasOwnProperty(k)) tagged[k] = e[k]; }
        tagged.gmOnly = true;
        return tagged;
      }));
      entries.sort(function (a, b) { return a.t - b.t; });
      wrap.textContent = "";
      if (!entries.length) { wrap.appendChild(PT.el("div", { class: "pt-empty", text: "Nothing has happened yet." })); return; }
      entries.slice(-200).reverse().forEach(function (e) {
        var line = [];
        if (e.gmOnly) line.push(PT.el("span", { class: "pt-gmtag", text: "DM ONLY" }));
        line.push(PT.el("span", { class: "pt-log-when", text: fmtWhen(e.t) }));
        line.push(PT.el("span", { class: "pt-log-who", text: e.who + (e.gm ? " (DM)" : "") }));
        line.push(PT.el("span", { text: e.msg }));
        if (e.redacted) line.push(PT.el("span", { class: "pt-redacted", text: " (redacted)" }));
        wrap.appendChild(PT.el("div", { class: "pt-log-entry" + (e.gmOnly ? " pt-gmlog" : "") }, line));
      });
    });
  }

  function renderAbout(body) {
    var about = PT.el("div", { class: "pt-about" });
    about.appendChild(PT.el("p", { text: "Party Tools v" + PT.VERSION + " — shared party inventory for Roll20. All data lives inside this game as journal handouts named PT-…; deleting those deletes the party's data." }));
    about.appendChild(PT.el("p", {}, [
      PT.el("a", { class: "pt-bug", href: bugReportUrl(), target: "_blank", rel: "noopener", text: "🐞 Report a bug" })
    ]));
    about.appendChild(PT.el("p", { class: "pt-note", text: "The report opens on GitHub with the technical details pre-filled — just describe what happened. You need a (free) GitHub account to post it." }));
    about.appendChild(PT.el("p", {}, [
      PT.el("a", { class: "pt-kofi", href: PT.KOFI_URL, target: "_blank", rel: "noopener", text: "☕ Support on Ko-fi" })
    ]));
    about.appendChild(PT.el("p", { class: "pt-note", text: "If this tool is useful at your table, a coffee keeps it maintained." }));
    if (env.isGM) {
      about.appendChild(PT.el("hr", { style: "border-color:#37305c;margin:12px 0" }));
      about.appendChild(PT.el("p", { class: "pt-note", text: "DM tools:" }));
      about.appendChild(PT.el("button", {
        class: "pt-btn pt-danger", text: "Reset all Party Tools data",
        onclick: function () {
          if (!confirm("This DELETES every Party Tools bag, item, coin and log in this game and starts fresh. It cannot be undone. Continue?")) return;
          if (!confirm("Really sure? All party inventory in this game will be gone.")) return;
          var n = PT.store.wipeAll();
          ui.toast("Deleted " + n + " storage handout(s). Reload the Roll20 page to start clean.");
        }
      }));
      about.appendChild(PT.el("p", { class: "pt-note", text: "Use this if the panel reports leftover/duplicate storage from an earlier version. Reload the page afterwards." }));
    }
    body.appendChild(about);
  }

  // ---- panel shell ----------------------------------------------------------
  // renderBody() fully rebuilds the tab body, including the INV-25 search
  // input. That happens not just on tab clicks but every 4s from the poll
  // (see togglePanel/ui.refresh below) — while the user may be mid-keystroke
  // in that very input. A rebuilt <input> is a NEW DOM node, so simply
  // recreating it would silently drop focus and caret position out from
  // under typing. The fix: note whether the search input was focused (and
  // where its caret was) BEFORE tearing the body down, then look up the
  // freshly-built search input by class afterwards and restore both. The
  // typed text itself never depends on the DOM — renderInventory() rebuilds
  // the input's value from the module-level `searchTerm`, so that part
  // survives regardless.
  function captureSearchFocus(body) {
    var el = body.querySelector(".pt-search-input");
    if (el && document.activeElement === el) return { start: el.selectionStart, end: el.selectionEnd };
    return null;
  }
  function restoreSearchFocus(body, info) {
    if (!info) return;
    var el = body.querySelector(".pt-search-input");
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(info.start, info.end); } catch (e) {}
  }
  // Every bag card registers itself as a jQuery UI droppable. Clearing the
  // body with textContent="" rips those elements out behind jQuery's back,
  // so their droppable registrations survive in $.ui.ddmanager forever —
  // and we re-render on every poll AND every search keystroke, so stale
  // registrations would pile up all session and slow every later drag.
  // jQuery's .empty() runs the cleanup that destroys them properly.
  function clearBody(body) {
    try {
      if (window.$ && $.fn && $.fn.empty) { $(body).empty(); return; }
    } catch (e) { /* fall through to the plain wipe */ }
    body.textContent = "";
  }

  function renderBody() {
    var body = panel.querySelector(".pt-body");
    var focusInfo = captureSearchFocus(body);
    clearBody(body);
    if (activeTab === "inventory") renderInventory(body);
    else if (activeTab === "log") renderLog(body);
    else renderAbout(body);
    panel.querySelectorAll(".pt-tab").forEach(function (t) {
      t.classList.toggle("pt-active", t.getAttribute("data-tab") === activeTab);
    });
    restoreSearchFocus(body, focusInfo);
  }

  ui.refresh = function () {
    return PT.store.snapshot(env).then(function (snap) {
      if (!snap) return;
      var changed = JSON.stringify(snap) !== JSON.stringify(snapshot);
      snapshot = snap;
      if (changed && panel && panel.style.display !== "none") renderBody();
    });
  };

  // Position AND size are remembered per user per game (UI-4). Native CSS
  // resize writes inline width/height; a ResizeObserver picks that up.
  function savePanelGeometry() {
    try {
      localStorage.setItem(posKey(), JSON.stringify({
        left: panel.style.left, top: panel.style.top,
        w: panel.style.width || (panel.offsetWidth + "px"),
        h: panel.style.height || (panel.offsetHeight + "px")
      }));
    } catch (e) {}
  }
  var saveGeomSoon = (function () {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(savePanelGeometry, 400); };
  })();

  function makeDraggable(head) {
    head.addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) return;
      var startX = e.clientX, startY = e.clientY;
      var rect = panel.getBoundingClientRect();
      function move(ev) {
        panel.style.left = Math.max(0, rect.left + ev.clientX - startX) + "px";
        panel.style.top = Math.max(0, rect.top + ev.clientY - startY) + "px";
        panel.style.right = "auto";
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        savePanelGeometry();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  // "This game isn't set up yet." A player who loads before the DM has opened
  // the panel used to be stuck here until they reloaded the page: init runs
  // once at boot (main.js) and, unlike `notReady`, this state had no retry.
  // The DM typically initialises minutes later, mid-session, so watch for it
  // and adopt the storage the moment it appears.
  //
  // The tick is slow and starts with a free check — store.storageExists() is a
  // filter over the already-downloaded journal, no body reads — so the common
  // case (still waiting) costs nothing to repeat all session. Only once PT-
  // handouts actually exist do we pay for a full init(), which brings its own
  // journal-settling and body-read retries.
  //
  // Automatic polling is player-only. For the DM this state means init FAILED
  // (main.js), where a silent retry loop could re-attempt creation every tick
  // and spray duplicate storage sets if the writes are landing but failing
  // verification. The DM gets the button instead: one deliberate retry.
  var NO_STORAGE_POLL_MS = 15000;
  function mountNoStorage() {
    var timer = null, checking = false;
    var msg = PT.el("div", {
      class: "pt-empty",
      text: env.isGM
        ? "Party Tools could not set this game up. Check the browser console, then try again."
        : "This game doesn't have Party Tools data yet. The DM opens the panel once to set it up — players never initialise a game. Watching for it…"
    });
    var btn = PT.el("button", {
      class: "pt-btn", text: "Check again",
      title: "Look for Party Tools storage in this game right now",
      onclick: function () { check(true); }
    });
    var btnRow = PT.el("div", { style: "margin-top:8px" }, [btn]);
    // The same two nodes are re-appended on every render, so the button keeps
    // its in-flight "Checking…" state across a rebuild.
    statusRender = function (body) { body.appendChild(msg); body.appendChild(btnRow); };
    renderBody();

    function adopt(res) {
      if (timer) { clearInterval(timer); timer = null; }
      statusRender = null;
      ui.state = res.state;
      ui.refresh().then(renderBody);
      // res.firstRun only ever comes back on the DM's own retry, where this
      // click is what created the storage.
      PT.ui.toast(res.firstRun
        ? "Party Tools is set up — a “Party Loot” bag has been created. Drag compendium items onto it!"
        : env.isGM ? "Party Tools is ready."
        : "Party Tools is ready — the DM has set this game up.");
    }

    function reset() {
      checking = false;
      btn.disabled = false; btn.textContent = "Check again";
    }

    function check(manual) {
      if (checking) return;
      // Nothing has been created yet: the whole point of the cheap probe.
      if (!manual && !PT.store.storageExists()) return;
      checking = true;
      if (manual) { btn.disabled = true; btn.textContent = "Checking…"; }
      PT.store.init(env).then(function (res) {
        if (res.state === "ready" || res.state === "readOnly") { adopt(res); return; }
        reset();
        if (!manual) return;
        // notReady means handouts exist but no index was readable in time —
        // worth distinguishing from "the DM hasn't started yet", because it
        // usually clears on its own.
        PT.ui.toast(res.state === "notReady"
          ? "Party Tools storage is there but hasn't finished loading. Try again in a moment."
          : res.state === "initFailed"
            ? "Party Tools still could not create its storage: " + res.err
            : "Still no Party Tools data in this game.");
      }, function (e) {
        reset();
        if (manual) PT.ui.toast("Party Tools could not check this game's storage: " + (e && e.message ? e.message : e));
      });
    }

    if (!env.isGM) timer = setInterval(check, NO_STORAGE_POLL_MS);
  }

  ui.mount = function (envInfo, state) {
    env = envInfo;
    document.head.appendChild(PT.el("style", { text: CSS }));
    // See lastDropShiftKey's declaration above for why this is capture-phase
    // and lives here rather than in drops.js.
    document.addEventListener("mouseup", function (e) { lastDropShiftKey = !!e.shiftKey; }, true);

    // Icon only. Emoji rotated by the vertical writing-mode read as a red
    // arrow; vertical text was legible but visually noisy. An inline SVG
    // chest renders identically everywhere and needs no rotation.
    launcher = PT.el("div", { id: "pt-launcher", title: "Party Tools — shared inventory", onclick: togglePanel });
    launcher.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 16 16" aria-label="Party Tools">' +
      '<path fill="#e8cf85" d="M2.2 6.4a3.8 3.8 0 0 1 3.8-3.8h4a3.8 3.8 0 0 1 3.8 3.8v1.1H2.2z"/>' +
      '<rect x="2.2" y="8.1" width="11.6" height="5.5" rx="1" fill="#a8834c"/>' +
      '<rect x="6.9" y="5.9" width="2.2" height="4.3" rx=".5" fill="#5d4526"/>' +
      '<circle cx="8" cy="10.4" r=".55" fill="#e8cf85"/></svg>';
    document.body.appendChild(launcher);

    panel = PT.el("div", { id: "pt-panel", style: "display:none;top:120px;right:40px" });
    var titleSpan = PT.el("span", { class: "pt-title" });
    // Inline SVG chest: renders identically everywhere, unlike emoji.
    titleSpan.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:6px">' +
      '<path fill="#dcc275" d="M2 6a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1.2H2z"/>' +
      '<rect x="2" y="7.8" width="12" height="6" rx="1" fill="#a8834c"/>' +
      '<rect x="6.9" y="5.6" width="2.2" height="4.2" rx=".5" fill="#6e5330"/></svg>';
    titleSpan.appendChild(document.createTextNode("Party Tools"));
    // Role badge: the extension's view of who you are, always visible. A
    // player testing in view-as mode looks identical to a real player, and
    // without this there is no way to tell why DM-only actions are missing.
    var roleBadge = PT.el("span", {
      class: "pt-rolebadge" + (env.isGM ? " pt-isgm" : ""),
      text: env.isGM ? "DM" : "PLAYER",
      title: env.isGM
        ? "Party Tools sees you as the GM of this game."
        : "Party Tools sees you as a player. If you are the GM, you may be in Roll20's “view as player” mode — leave it and reload."
    });
    var head = PT.el("div", { class: "pt-head" }, [
      titleSpan, roleBadge,
      PT.el("button", { class: "pt-iconbtn", text: "🐞", title: "Report a bug on GitHub", onclick: function () { window.open(bugReportUrl(), "_blank"); } }),
      PT.el("button", { class: "pt-iconbtn", text: "☕", title: "Support on Ko-fi", onclick: function () { window.open(PT.KOFI_URL, "_blank"); } }),
      PT.el("button", { class: "pt-iconbtn", text: "—", title: "Minimise (UI-10: also hides instantly for screen shares)", onclick: togglePanel })
    ]);
    makeDraggable(head);
    var tabs = PT.el("div", { class: "pt-tabs" }, [
      PT.el("div", { class: "pt-tab", "data-tab": "inventory", text: "Inventory", onclick: function () { activeTab = "inventory"; renderBody(); } }),
      PT.el("div", { class: "pt-tab", "data-tab": "log", text: "Log", onclick: function () { activeTab = "log"; renderBody(); } }),
      PT.el("div", { class: "pt-tab", "data-tab": "about", text: "♥", onclick: function () { activeTab = "about"; renderBody(); } })
    ]);
    panel.appendChild(head); panel.appendChild(tabs);
    panel.appendChild(PT.el("div", { class: "pt-body" }));
    document.body.appendChild(panel);

    try {
      var saved = PT.tryJson(localStorage.getItem(posKey()));
      if (saved && saved.left) { panel.style.left = saved.left; panel.style.top = saved.top; panel.style.right = "auto"; }
      if (saved && saved.w) panel.style.width = saved.w;
      if (saved && saved.h) panel.style.height = saved.h;
    } catch (e) {}
    try { new ResizeObserver(saveGeomSoon).observe(panel); } catch (e) {}

    ui.state = state;
    if (state === "noStorage") { mountNoStorage(); return; }
    if (state === "notReady") {
      var note = PT.el("div", { class: "pt-empty", text: "Party Tools storage is still loading (or a previous version left it in a mixed state). Retrying…" });
      statusRender = function (body) { body.appendChild(note); };
      renderBody();
      // Retry init a few times; Roll20 may just be slow delivering bodies.
      var tries = 0;
      var retry = setInterval(function () {
        tries++;
        PT.store.init(env).then(function (res) {
          if (res.state === "ready" || res.state === "readOnly") {
            clearInterval(retry); statusRender = null; ui.state = res.state;
            ui.refresh().then(renderBody);
          } else if (tries >= 6) {
            clearInterval(retry);
            note.textContent = "Storage didn't finish loading. Try reloading the Roll20 page. If it persists, the DM can reset from the ♥ tab.";
            renderBody();
          }
        });
      }, 3000);
      return;
    }
    ui.refresh().then(renderBody);
  };

  function togglePanel() {
    var opening = panel.style.display === "none";
    panel.style.display = opening ? "flex" : "none";
    if (opening) {
      renderBody();
      ui.refresh();
      if (!pollTimer) pollTimer = setInterval(function () { ui.refresh(); }, 4000);
    } else if (pollTimer) {
      clearInterval(pollTimer); pollTimer = null;
    }
  }
})(window.PartyTools);
