/* ============================================================
   HNK AI Tools — Tutorials screen

   v6.49.0 — the web app's own third page (#pgTutorials), reached from a Home
   card exactly as the app reaches it. It used to sit at the foot of the
   panel's Home as a "HNK LEARNING" list; the app keeps it on its own page,
   so it lives on its own page here too.

   The app prints this hero and its three lessons in English in every locale,
   so the copy is carried over as written.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;

/* [number, title, body, button label, panel page key | "update"] — the app's
   own three tutorial-card actions: Open Dashboard, Check devices, Secure
   Panel download. */
var LESSONS = [
  ["01", "Dashboard & AI Tools",
    "Choose Workflows, Edit or Media Lab. Add only your own provider key in Setup; HNK never stores it as your account password.",
    "Open Dashboard", "home"],
  ["02", "Phone + Computer",
    "Use one Phone and one Computer. Your Computer slot is shared by the Web App and Photoshop Panel.",
    "Check devices", "setup"],
  ["03", "Install the Panel",
    "Request a temporary download, install it in Photoshop, then just sign in — the panel registers this computer by itself.",
    "Secure Panel download", "update"]
];

function render(root, deps) {
  var doc = deps.document;
  dom.clear(root);

  var hero = dom.el(doc, "div", { class: "unified-hero" }, [
    dom.el(doc, "div", { class: "unified-kick", text: "HNK LEARNING" }),
    dom.el(doc, "h1", { text: "Tutorials" }),
    dom.el(doc, "p", { text: "Start with device registration, then learn the AI Tools and pair the Photoshop Panel on the same Computer." })
  ]);
  root.appendChild(hero);

  var grid = dom.el(doc, "div", { class: "tutorial-grid" });
  LESSONS.forEach(function (l) {
    var go = dom.el(doc, "button", { class: l[4] === "update" ? "btn btn-gold" : "btn", text: l[3] });
    dom.on(go, "click", function () {
      if (l[4] === "update") { if (deps.onGetUpdate) deps.onGetUpdate(); return; }
      if (l[4] === "home") { if (deps.onPage) deps.onPage("aitools"); return; }
      if (deps.onPage) deps.onPage(l[4]);
    });
    grid.appendChild(dom.el(doc, "div", { class: "tutorial-card" }, [
      dom.el(doc, "div", { class: "chip on", text: l[0] }),
      dom.el(doc, "h2", { text: l[1] }),
      dom.el(doc, "p", { text: l[2] }),
      go
    ]));
  });
  root.appendChild(grid);
  return root;
}

var API = { render: render, LESSONS: LESSONS };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.tutorialsScreen = API; }
})();
