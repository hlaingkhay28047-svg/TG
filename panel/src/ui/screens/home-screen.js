/* ============================================================
   HNK AI Tools — Home screen controller
   Spec §3 (Home Screen)

   Shows only user-facing actions: Free Generate + the home workflow buttons.
   Never renders provider settings, workflow IDs, node IDs, consumer controls
   or model endpoints (spec §3 Home Rules).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* face-centred square thumbs (icons/thumbs/) — the wide banners beheaded
   subjects when cover-cropped into the 48px square (user report) */
var HNK_SQ_THUMBS = {
  "icons/banners/create.jpg": 1, "icons/banners/studio.jpg": 1,
  "icons/banners/setup.jpg": 1, "icons/banners/aitools.jpg": 1,
  "icons/banners/retouch.jpg": 1, "icons/banners/reference-transfer.jpg": 1,
  "icons/banners/master-bgfg-replace.jpg": 1, "icons/hero-banner.jpg": 1,
  "assets/user_library_ui/user-ref-085.jpg": 1, "assets/user_library_ui/user-ref-087.jpg": 1
};
function hnkThumbSrc(v) {
  if (v && HNK_SQ_THUMBS[v]) return "icons/thumbs/" + v.split("/").pop();
  return v;
}


var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var workflowRegistry = _CJS ? require("../../workflows/workflow-registry") : globalThis.HNK.workflowRegistry;

/* deps: { document, onNavigate(screenId), onWorkflow(workflowId) } */
function render(root, deps) {
  var doc = deps.document;
  dom.clear(root);

  root.appendChild(dom.el(doc, "div", { class: "hnk-h-title", text: dom.t("ai_home_title", "What do you want to create?") }));

  var actions = [];
  // Free Generate is always first (spec §3)
  actions.push({ id: "free", label: dom.t("ai_free_generate", "Free Generate"), sub: dom.t("ai_free_sub", "Write your own prompt"), nav: "free-generate", visual: "icons/banners/create.jpg" });

  // Home workflows come from the registry (no hardcoded UI list)
  var homeWfs = workflowRegistry.homeList();
  for (var i = 0; i < homeWfs.length; i++) {
    actions.push({ id: homeWfs[i].id, label: homeWfs[i].title,
      sub: dom.t(workflowRegistry.summaryKey(homeWfs[i].id), homeWfs[i].summary),
      wf: homeWfs[i].id, visual: homeWfs[i].visual });
  }
  actions.push({ id: "more", label: dom.t("ai_more_tools", "More Tools"), sub: dom.t("ai_more_sub", "Water Edit \u00B7 Text/Logo \u00B7 all workflows"), nav: "workflow-tools", visual: "icons/banners/aitools.jpg" });

  var list = dom.el(doc, "div", { class: "hnk-h-actions" });
  actions.forEach(function (a) {
    /* signature-visual thumb (style.backgroundImage — the repo's proven
       UXP-safe image-fit) + text column */
    var thumb = null;
    if (a.visual) {
      thumb = dom.el(doc, "div", { class: "hnk-thumb" });
      thumb.style.backgroundImage = 'url("' + hnkThumbSrc(a.visual) + '")';
    }
    var card = dom.el(doc, "button", { class: "hnk-action" + (a.visual ? " has-thumb" : ""), id: "hnkAction_" + a.id }, [
      thumb,
      dom.el(doc, "div", { class: "hnk-action-txt" }, [
        dom.el(doc, "div", { class: "hnk-action-label", text: a.label }),
        a.sub ? dom.el(doc, "div", { class: "hnk-action-sub", text: a.sub }) : null
      ])
    ]);
    dom.on(card, "click", function () {
      if (a.wf && deps.onWorkflow) deps.onWorkflow(a.wf);
      else if (a.nav && deps.onNavigate) deps.onNavigate(a.nav);
    });
    list.appendChild(card);
  });
  root.appendChild(list);
  return root;
}

var API = { render: render };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.homeScreen = API; }
})();
