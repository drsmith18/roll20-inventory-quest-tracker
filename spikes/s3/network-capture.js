// SPIKE S3 part 1 — DM window. Run FIRST, before touching the compendium.
// Logs any fetch/XHR whose URL mentions graphql or compendium: the URL, the
// request body (the GraphQL query we need to learn), and the response.
// READ-ONLY: it only observes traffic. A page reload removes the hooks.
(function () {
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var isTarget = /graphql|compendium/i.test(url);
    if (isTarget) {
      console.log("FETCH → " + url);
      var body = init && init.body;
      if (body) console.log("  request body: " + String(body).slice(0, 1500));
    }
    var p = origFetch.apply(this, arguments);
    if (isTarget) {
      p.then(function (res) {
        try {
          res.clone().text().then(function (t) {
            console.log("  response (" + res.status + ") for " + url.slice(0, 80) + ": " + t.slice(0, 2500));
          });
        } catch (e) {}
        return res;
      });
    }
    return p;
  };
  var origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this._spikeUrl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (this._spikeUrl && /graphql|compendium/i.test(this._spikeUrl)) {
      console.log("XHR → " + this._spikeUrl);
      if (body) console.log("  request body: " + String(body).slice(0, 1500));
      this.addEventListener("load", function () {
        console.log("  response (" + this.status + "): " + String(this.responseText).slice(0, 2500));
      });
    }
    return origSend.apply(this, arguments);
  };
  console.log("Network capture armed. Now open the compendium tab in the right sidebar, search 'longsword', and CLICK one search result to open its page. Watch for FETCH/XHR lines here. If nothing appears at all, say so - that means the traffic runs outside this frame.");
})();
