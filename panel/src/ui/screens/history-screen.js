/* ============================================================
   HNK AI Tools — History screen controller
   Spec §22 (History Screen)

   Lists entries with a mode badge (FREE GENERATE / WORKFLOW), the
   model · size · ratio line and a prompt preview, plus Reuse / Re-run actions.
   Reads only sanitized entries from the history service (no keys/tokens).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;

/* v6.87.0 — THE VIDEO TAKES JOIN HISTORY. The four video pages' takes are
   kept by the takes store (a copy in the gallery folder + an index), and this
   screen lists them under their own heading: page · tool · resolution ·
   length · time · file, and Open, which takes the student back to that
   page with that take selected. */
var TAKE_PAGE = { video: "Video", v2v: "V\u2192V", talk: "Talking Photo", upscale: "Upscale" };
function _clock(ts) {
  var d = new Date(ts || 0); var p2 = function (x) { return (x < 10 ? "0" : "") + x; };
  return p2(d.getHours()) + ":" + p2(d.getMinutes());
}
function renderTakes(root, deps) {
  var doc = deps.document;
  var takes = deps.takes || (globalThis.HNK && globalThis.HNK.takesStore) || null;
  var vids = (takes && typeof takes.list === "function") ? takes.list() : [];
  if (!vids.length) return;
  root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_videos", "Videos") }));
  var listEl = dom.el(doc, "div", { class: "hnk-hist-list", id: "hnkTakes" });
  vids.forEach(function (v) {
    var card = dom.el(doc, "div", { class: "hnk-hist", id: "hnkTake_" + v.id });
    card.appendChild(dom.el(doc, "div", { class: "hnk-hist-badge free", text: TAKE_PAGE[v.page] || v.page }));
    var meta = [v.tool, v.resolution, v.duration ? (/^\d+$/.test(String(v.duration)) ? v.duration + "s" : v.duration) : "", _clock(v.ts), v.name].filter(Boolean).join(" \u00b7 ");
    card.appendChild(dom.el(doc, "div", { class: "hnk-hist-meta", text: meta }));
    if (v.prompt) card.appendChild(dom.el(doc, "div", { class: "hnk-hist-prompt", text: v.prompt }));
    var actions = dom.el(doc, "div", { class: "hnk-hist-actions" });
    var open = dom.el(doc, "button", { class: "hnk-btn", id: "hnkTakeOpen_" + v.id, text: dom.t("ai_open", "Open") });
    dom.on(open, "click", function () {
      if (deps.onOpenTake) { deps.onOpenTake(v); return; }
      if (globalThis.HNK && typeof globalThis.HNK.openTake === "function") globalThis.HNK.openTake(v.id);
    });
    actions.appendChild(open);
    card.appendChild(actions);
    listEl.appendChild(card);
  });
  root.appendChild(listEl);
}

function render(root, deps) {
  var doc = deps.document;
  var svc = deps.history;
  dom.clear(root);
  root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_history", "History") }));

  var entries = (svc && svc.list()) || [];
  if (!entries.length) {
    root.appendChild(dom.el(doc, "div", { class: "hnk-todo", text: dom.t("ai_no_gen", "No generations yet.") }));
    renderTakes(root, deps);   /* v6.87.0 — the video takes still show */
    return root;
  }

  var listEl = dom.el(doc, "div", { class: "hnk-hist-list" });
  entries.forEach(function (e) {
    var isWf = e.mode === "smart-workflow";
    var card = dom.el(doc, "div", { class: "hnk-hist", id: "hnkHist_" + e.id });
    card.appendChild(dom.el(doc, "div", { class: "hnk-hist-badge " + (isWf ? "wf" : "free"), text: e.badge }));
    var meta = [e.modelName, e.size, e.ratio].filter(Boolean).join(" · ");
    card.appendChild(dom.el(doc, "div", { class: "hnk-hist-meta", text: meta }));
    if (e.promptPreview) card.appendChild(dom.el(doc, "div", { class: "hnk-hist-prompt", text: e.promptPreview }));

    var actions = dom.el(doc, "div", { class: "hnk-hist-actions" });
    var reuse = dom.el(doc, "button", { class: "hnk-btn", id: "hnkHistReuse_" + e.id, text: isWf ? dom.t("ai_rerun", "Re-run") : dom.t("ai_reuse", "Reuse") });
    dom.on(reuse, "click", function () { if (deps.onReuse) deps.onReuse(e); });
    actions.appendChild(reuse);
    card.appendChild(actions);
    listEl.appendChild(card);
  });
  root.appendChild(listEl);
  renderTakes(root, deps);   /* v6.87.0 */

  var clearBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkHistClear", text: dom.t("ai_clear_hist", "Clear history") });
  dom.on(clearBtn, "click", function () { if (svc) svc.clear(); render(root, deps); });
  root.appendChild(clearBtn);
  return root;
}

var API = { render: render, renderTakes: renderTakes, TAKE_PAGE: TAKE_PAGE };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.historyScreen = API; }
})();
