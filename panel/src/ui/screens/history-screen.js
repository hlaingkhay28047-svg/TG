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

function render(root, deps) {
  var doc = deps.document;
  var svc = deps.history;
  dom.clear(root);
  root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_history", "History") }));

  var entries = (svc && svc.list()) || [];
  if (!entries.length) {
    root.appendChild(dom.el(doc, "div", { class: "hnk-todo", text: dom.t("ai_no_gen", "No generations yet.") }));
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

  var clearBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkHistClear", text: dom.t("ai_clear_hist", "Clear history") });
  dom.on(clearBtn, "click", function () { if (svc) svc.clear(); render(root, deps); });
  root.appendChild(clearBtn);
  return root;
}

var API = { render: render };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.historyScreen = API; }
})();
