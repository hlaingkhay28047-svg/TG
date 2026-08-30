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

/* v6.27.0 — webapp-parity art cards. Every workflow's visual is now the
   SAME catalog card the web app shows for it (icons/cards/<id>.jpg, bundled
   in the CCX), rendered whole as an <img> at its intrinsic 3:2 — the
   repo's proven UXP-safe image fit — so the 48px square-thumb path (and its
   beheading crops) is gone from this screen. */
function hnkArtCard(doc, visual) {
  if (!visual) return null;
  var art = doc.createElement("div");
  art.className = "hnk-cardart";
  var im = doc.createElement("img");
  im.onerror = function () { try { art.parentNode && art.parentNode.removeChild(art); } catch (e) { } };
  im.src = visual; im.alt = "";
  art.appendChild(im);
  return art;
}

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var workflowRegistry = _CJS ? require("../../workflows/workflow-registry") : globalThis.HNK.workflowRegistry;

/* deps: { document, onNavigate(screenId), onWorkflow(workflowId) } */
function render(root, deps) {
  var doc = deps.document;
  dom.clear(root);

  /* v6.27.0 — webapp-parity time-greeting hero. Same clock split as the web
     app's renderDashGreet (morning <11 / afternoon <16 / evening) with the
     SAME three banner arts, bundled beside the page banners so the art and
     the words always agree — online or offline. */
  var h = new Date().getHours();
  var art = h < 11 ? "morning" : h < 16 ? "afternoon" : "evening";
  var greet = h < 11 ? dom.t("ai_greet_morning", "Good morning")
    : h < 16 ? dom.t("ai_greet_afternoon", "Good afternoon")
    : dom.t("ai_greet_evening", "Good evening");
  var hero = dom.el(doc, "div", { class: "hnk-greet", id: "hnkGreet" });
  hero.style.backgroundImage = 'url("icons/banners/hero-greet-' + art + '.jpg")';
  hero.appendChild(dom.el(doc, "div", { class: "hnk-greet-hi", text: greet }));
  var dt = "";
  try { dt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date()); }
  catch (e) { try { dt = new Date().toDateString(); } catch (e2) { dt = ""; } }
  if (dt) hero.appendChild(dom.el(doc, "div", { class: "hnk-greet-sub", text: dt }));
  root.appendChild(hero);

  root.appendChild(dom.el(doc, "div", { class: "hnk-h-title", text: dom.t("ai_home_title", "What do you want to create?") }));

  var actions = [];
  // Free Generate is always first (spec §3)
  actions.push({ id: "free", label: dom.t("ai_free_generate", "Free Generate"), sub: dom.t("ai_free_sub", "Write your own prompt"), nav: "free-generate", visual: "icons/cards/free-generate.jpg" });

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
    var art = hnkArtCard(doc, a.visual);
    var card = dom.el(doc, "button", { class: "hnk-action" + (art ? " art-card" : ""), id: "hnkAction_" + a.id }, [
      art,
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
