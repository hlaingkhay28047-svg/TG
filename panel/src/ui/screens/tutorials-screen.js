/* ============================================================
   HNK AI Tools — Tutorials screen

   v6.49.0 — the web app's own third page (#pgTutorials), reached from a Home
   card exactly as the app reaches it. It used to sit at the foot of the
   panel's Home as a "HNK LEARNING" list; the app keeps it on its own page,
   so it lives on its own page here too.

   v6.159.0 — the lessons are the app's TABLE, not a copy of its markup:
   tools/build_panel_tutorials.js lifts TUT_HERO + TUTORIALS (ten lessons,
   nine languages) into js/hnk_tutorials.js, and this screen paints them in
   the panel's current language (HNK.i18n.pick, the same fallback chain as
   every other hand dict). Every card's button opens the page it teaches —
   the app's page ids are not the panel's route keys, so PAGE maps them.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;

function data() {
  if (_CJS) { try { return require("../../../js/hnk_tutorials.js"); } catch (e) { return null; } }
  return (globalThis.HNK && globalThis.HNK.tutorials) || null;
}
/* the panel's language, with its fallback chain; English outside the panel */
function pick(m) {
  var b = globalThis.HNK && globalThis.HNK.i18n;
  if (b && typeof b.pick === "function") { try { return b.pick(m); } catch (e) { } }
  return (m && (m.en || m.my)) || "";
}

/* the app's page ids → the panel's route keys (Home is the AI Tools stack) */
var PAGE = { pgDash: "aitools", pgAccount: "setup", pgHome: "setup", pgTutorials: "aitools",
  pgWf: "wf", pgCreate: "prompt", pgImagine: "imagine", pgMeitu: "meitu", pgEvoto: "evoto", pgRetouch: "retouch", pgPath: "path",
  pgText2Img: "create", pgVideo: "video", pgVideoUp: "vidup", pgV2V: "v2v", pgTalk: "talk", pgLib: "presets", pgGallery: "gallery" };

function render(root, deps) {
  var doc = deps.document;
  var d = data();
  dom.clear(root);

  var hero = dom.el(doc, "div", { class: "unified-hero" }, [
    dom.el(doc, "div", { class: "unified-kick", text: "HNK LEARNING" }),
    dom.el(doc, "h1", { text: d ? pick(d.HERO.h1) : "Tutorials" }),
    dom.el(doc, "p", { text: d ? pick(d.HERO.lede) : "" })
  ]);
  root.appendChild(hero);

  var grid = dom.el(doc, "div", { class: "tutorial-grid" });
  (d ? d.TUTORIALS : []).forEach(function (l) {
    var go = dom.el(doc, "button", { class: "btn", text: pick(l.b) });
    go.setAttribute("data-tutorial-page", l.page);
    dom.on(go, "click", function () {
      var key = PAGE[l.page] || "aitools";
      if (deps.onPage) deps.onPage(key);
    });
    grid.appendChild(dom.el(doc, "div", { class: "tutorial-card" }, [
      dom.el(doc, "div", { class: "chip on", text: l.n }),
      dom.el(doc, "h2", { text: pick(l.t) }),
      dom.el(doc, "p", { text: pick(l.p) }),
      go
    ]));
  });
  root.appendChild(grid);
  return root;
}

var API = { render: render, PAGE: PAGE, data: data };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.tutorialsScreen = API; }
})();
