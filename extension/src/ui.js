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

  // Palette follows Roll20's own dark UI: charcoal surfaces, thin grey
  // borders, off-white text, restrained crimson accent. Nothing purple.
  var CSS = [
    ":root{--pt-bg:#1f2126;--pt-bg2:#26282e;--pt-bg3:#2e3138;--pt-edge:#3d4046;--pt-edge2:#4a4e55;--pt-text:#e1e3e6;--pt-dim:#9aa0a8;--pt-accent:#c9302c;--pt-gold:#dcc275}",
    "#pt-launcher{position:fixed;right:0;top:38%;z-index:99990;background:var(--pt-bg2);color:var(--pt-text);border:1px solid var(--pt-edge2);border-right:none;border-radius:6px 0 0 6px;padding:10px 7px;cursor:pointer;font:bold 12px Arial,Helvetica,sans-serif;writing-mode:vertical-rl;letter-spacing:1.5px;user-select:none;box-shadow:-2px 2px 8px rgba(0,0,0,.35)}",
    "#pt-launcher:hover{background:var(--pt-bg3)}",
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
    ".pt-itemname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default}",
    ".pt-itemmeta{color:var(--pt-dim);font-size:11.5px;margin-left:6px}",
    ".pt-qty{color:var(--pt-dim);min-width:32px;text-align:right}",
    ".pt-empty{color:var(--pt-dim);font-style:italic;padding:6px 0}",
    ".pt-row{display:flex;gap:8px;margin:8px 0}",
    ".pt-btn{background:var(--pt-bg3);color:var(--pt-text);border:1px solid var(--pt-edge2);border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12.5px}",
    ".pt-btn:hover{background:#383b43}",
    ".pt-btn.pt-danger{background:#3a2426;border-color:#7c3c3c;color:#e8b4b4}",
    ".pt-btn.pt-danger:hover{background:#4a2b2e}",
    ".pt-drop-over{outline:3px dashed var(--pt-accent);outline-offset:-3px}",
    ".pt-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#17181c;color:var(--pt-text);border:1px solid var(--pt-edge2);border-left:3px solid var(--pt-accent);border-radius:5px;padding:9px 16px;font:13px Arial,Helvetica,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:70vw}",
    ".pt-modal-back{position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}",
    ".pt-modal{background:var(--pt-bg);color:var(--pt-text);border:1px solid var(--pt-edge2);border-radius:6px;padding:16px;width:320px;font:13px/1.5 Arial,Helvetica,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.6)}",
    ".pt-modal h3{margin:0 0 12px;font-size:14px;border-bottom:1px solid var(--pt-edge);padding-bottom:8px}",
    ".pt-modal label{display:flex;align-items:center;gap:8px;margin:6px 0}",
    ".pt-modal input[type=number],.pt-modal input[type=text]{width:100%;background:#17181c;border:1px solid var(--pt-edge2);color:var(--pt-text);border-radius:4px;padding:5px 8px;font:inherit}",
    ".pt-modal input[type=number]{width:80px}",
    ".pt-log{font-size:12.5px}",
    ".pt-log-entry{padding:5px 0;border-bottom:1px solid #2b2d33}",
    ".pt-log-when{color:var(--pt-dim);margin-right:8px;font-size:11.5px}",
    ".pt-log-who{color:#c8a86a;margin-right:5px;font-weight:bold}",
    ".pt-about a{color:#7eb0d5}",
    ".pt-kofi{display:inline-block;background:#13c3ff;color:#092533 !important;font-weight:bold;border-radius:4px;padding:7px 16px;text-decoration:none;margin:4px 0}",
    ".pt-bug{display:inline-block;background:var(--pt-bg3);color:var(--pt-text) !important;border:1px solid var(--pt-edge2);border-radius:4px;padding:7px 16px;text-decoration:none;margin:4px 0}",
    ".pt-note{color:var(--pt-dim);font-size:12px}"
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
  function modal(title, buildBody, onOk) {
    var back = PT.el("div", { class: "pt-modal-back" });
    var box = PT.el("div", { class: "pt-modal" }, [PT.el("h3", { text: title })]);
    var content = PT.el("div", {});
    buildBody(content);
    var row = PT.el("div", { class: "pt-row" }, [
      PT.el("button", { class: "pt-btn", text: "OK", onclick: function () { if (onOk(content) !== false) back.remove(); } }),
      PT.el("button", { class: "pt-btn pt-danger", text: "Cancel", onclick: function () { back.remove(); } })
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

  function addItemModal(bag) {
    modal("Add item — " + bag.doc.name, function (c) {
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Name:" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "name" }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Quantity:" })]));
      c.appendChild(PT.el("input", { type: "number", value: "1", "data-f": "qty" }));
      c.appendChild(PT.el("label", {}, [PT.el("span", { text: "Description (optional):" })]));
      c.appendChild(PT.el("input", { type: "text", "data-f": "desc" }));
      c.appendChild(PT.el("div", { class: "pt-note", text: "Tip: you can also drag items from the Roll20 compendium straight onto a bag." }));
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

  // ---- rendering ------------------------------------------------------------
  function renderBag(bag) {
    var d = bag.doc;
    var head = PT.el("div", { class: "pt-baghead" }, [
      PT.el("span", { class: "pt-bagname", text: d.name, title: d.name })
    ]);
    if (bag.hidden) head.appendChild(PT.el("span", { class: "pt-hidden-badge", text: "HIDDEN — players can NOT see this" }));
    head.appendChild(PT.el("button", {
      class: "pt-iconbtn", text: "+", title: "Add an item by name",
      onclick: function () { addItemModal(bag); }
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
    var items = PT.el("div", { class: "pt-items" });
    if (!(d.items || []).length) items.appendChild(PT.el("div", { class: "pt-empty", text: "No items yet — drag from the compendium or use +" }));
    (d.items || []).forEach(function (it) {
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
      var nameSpan = PT.el("span", { class: "pt-itemname", title: titleBits.join(" · ") }, [
        PT.el("span", { text: it.name + (it.resolved === false && it.note ? " *" : "") })
      ]);
      if (metaBits.length) nameSpan.appendChild(PT.el("span", { class: "pt-itemmeta", text: metaBits.join(" · ") }));
      items.appendChild(PT.el("div", { class: "pt-item" }, [
        nameSpan,
        PT.el("span", { class: "pt-qty", text: "×" + (it.qty || 1) }),
        PT.el("button", { class: "pt-iconbtn", text: "−", title: "One fewer", onclick: function () { PT.store.changeQty(env, bag.id, d.name, it.id, -1).then(ui.refresh); } }),
        PT.el("button", { class: "pt-iconbtn", text: "+", title: "One more", onclick: function () { PT.store.changeQty(env, bag.id, d.name, it.id, +1).then(ui.refresh); } }),
        PT.el("button", { class: "pt-iconbtn", text: "⇄", title: "Move to another bag", onclick: function () { moveItemModal(bag, it); } }),
        PT.el("button", {
          class: "pt-iconbtn", text: "×", title: "Delete item",
          onclick: function () {
            if (!confirm("Remove “" + it.name + "” from “" + d.name + "”? The DM can restore it via the activity log.")) return;
            PT.store.deleteItem(env, bag.id, d.name, it.id).then(ui.refresh);
          }
        })
      ]));
    });
    var card = PT.el("div", { class: "pt-bag" + (bag.hidden ? " pt-hidden-bag" : "") }, [head, purse, items]);
    // every bag is its own drop target (UI-5: it's obvious which bag receives)
    PT.drops.arm(card, function (payload) {
      ui.toast("Fetching item details…", 1500);
      PT.drops.resolve(payload).then(function (item) {
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
    if (snapshot.readOnly) body.appendChild(PT.el("div", { class: "pt-note", text: "⚠ This game's data was written by a NEWER version of Party Tools. Everything is read-only until you update the extension." }));
    var addRow = PT.el("div", { class: "pt-row" }, [
      PT.el("button", {
        class: "pt-btn", text: "+ New bag",
        onclick: function () {
          var name = prompt("Name for the new bag:");
          if (!name || !name.trim()) return;
          var hidden = env.isGM ? confirm("Create it HIDDEN from players?\n\nOK = hidden (only you see it)\nCancel = visible to the party") : false;
          PT.store.createBag(env, name.trim(), hidden).then(function (r) {
            if (!r.ok) ui.toast("Couldn't create the bag: " + r.err);
            ui.refresh();
          });
        }
      })
    ]);
    body.appendChild(addRow);
    if (!snapshot.bags.length) body.appendChild(PT.el("div", { class: "pt-empty", text: "No bags yet." }));
    snapshot.bags.forEach(function (bag) { body.appendChild(renderBag(bag)); });
  }

  function renderLog(body) {
    var wrap = PT.el("div", { class: "pt-log" }, [PT.el("div", { class: "pt-empty", text: "Loading…" })]);
    body.appendChild(wrap);
    PT.store.readLog().then(function (entries) {
      wrap.textContent = "";
      if (!entries.length) { wrap.appendChild(PT.el("div", { class: "pt-empty", text: "Nothing has happened yet." })); return; }
      entries.slice(-200).reverse().forEach(function (e) {
        wrap.appendChild(PT.el("div", { class: "pt-log-entry" }, [
          PT.el("span", { class: "pt-log-when", text: fmtWhen(e.t) }),
          PT.el("span", { class: "pt-log-who", text: e.who + (e.gm ? " (DM)" : "") }),
          PT.el("span", { text: e.msg })
        ]));
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
  function renderBody() {
    var body = panel.querySelector(".pt-body");
    body.textContent = "";
    if (activeTab === "inventory") renderInventory(body);
    else if (activeTab === "log") renderLog(body);
    else renderAbout(body);
    panel.querySelectorAll(".pt-tab").forEach(function (t) {
      t.classList.toggle("pt-active", t.getAttribute("data-tab") === activeTab);
    });
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

  ui.mount = function (envInfo, state) {
    env = envInfo;
    document.head.appendChild(PT.el("style", { text: CSS }));

    // Plain text: emoji rotate with vertical writing-mode and render
    // differently per platform (the backpack read as "a red arrow").
    launcher = PT.el("div", { id: "pt-launcher", text: "PARTY TOOLS", title: "Party Tools — shared inventory", onclick: togglePanel });
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
    var head = PT.el("div", { class: "pt-head" }, [
      titleSpan,
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
    if (state === "noStorage") {
      panel.querySelector(".pt-body").appendChild(PT.el("div", {
        class: "pt-empty",
        text: "This game doesn't have Party Tools data yet. The DM opens the panel once to set it up — players never initialise a game."
      }));
      return;
    }
    if (state === "notReady") {
      var body = panel.querySelector(".pt-body");
      body.appendChild(PT.el("div", { class: "pt-empty", text: "Party Tools storage is still loading (or a previous version left it in a mixed state). Retrying…" }));
      // Retry init a few times; Roll20 may just be slow delivering bodies.
      var tries = 0;
      var retry = setInterval(function () {
        tries++;
        PT.store.init(env).then(function (res) {
          if (res.state === "ready" || res.state === "readOnly") {
            clearInterval(retry); ui.state = res.state;
            ui.refresh().then(renderBody);
          } else if (tries >= 6) {
            clearInterval(retry);
            body.textContent = "";
            body.appendChild(PT.el("div", { class: "pt-empty", text: "Storage didn't finish loading. Try reloading the Roll20 page. If it persists, the DM can reset from the ♥ tab." }));
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
