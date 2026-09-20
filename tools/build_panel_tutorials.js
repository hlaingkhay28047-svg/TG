/* Lifts the web app's Tutorials — TUT_HERO and TUTORIALS — into the panel, verbatim.
 *
 * WHY A TOOL. Until 6.158.0 the panel's Tutorials screen carried its own
 * three English lessons, typed by hand from the app's markup, and the app's
 * page was English in every locale. 6.88.0 makes the app's table the single
 * source — ten lessons in nine languages — and this tool copies the literal
 * itself (characters and all, not a re-serialised object) into
 * panel/js/hnk_tutorials.js, so a student reads the same lesson in the same
 * words in Photoshop and on their phone. test/verify_tutorials.js pins the
 * generated file to this tool's output, byte for byte.
 *
 * Usage: node tools/build_panel_tutorials.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { uxpSafeCode } = require("./lib/uxp_safe_text.js");

const A = require("./lib/app-data.js");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "panel", "js", "hnk_tutorials.js");

/* 6.116.0 — the table lives in docs/app/data/tutorials.js (window.HNK_TUTORIALS = {hero, list}),
   the shell reads it from there, and so does this tool: the JSON text of each member, verbatim. */
function member(key) {
  const t = A.readTutorials();
  if (!t || !t.hero || !Array.isArray(t.list)) throw new Error("data/tutorials.js is not {hero, list}");
  return JSON.stringify(t[key]);
}

const HEADER = `/* ============================================================
   HNK Tutorials — LIFTED, do not edit by hand.
   Source of truth: the web app's own TUT_HERO + TUTORIALS tables
   (docs/app/data/tutorials.js), copied verbatim by tools/build_panel_tutorials.js
   so a student reads the same ten lessons in Photoshop as on their phone,
   in the same words and the same nine languages. test/verify_tutorials.js
   pins this file to the app's tables.
   ============================================================ */
(function () {
"use strict";
`;
const FOOTER = `
var API = { HERO: TUT_HERO, TUTORIALS: TUTORIALS };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.tutorials = API; }
})();
`;

function build() {
  const hero = member("hero");
  const list = member("list");
  return uxpSafeCode(HEADER + "var TUT_HERO = " + hero + ";\nvar TUTORIALS = " + list + ";\n" + FOOTER, "build_panel_tutorials");
}

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out);
  const n = (out.match(/\{"n":"/g) || []).length;
  console.log("wrote panel/js/hnk_tutorials.js — " + n + " lessons, " + Buffer.byteLength(out) + " bytes");
}
module.exports = { build, OUT };
