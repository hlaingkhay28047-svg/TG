/* ============================================================
   LIFT the web app's VIDEO WIZARD words into the panel.

   The step-by-step wizard over the two video decks says the same thing in
   Photoshop as on the phone: the same four dots, the same guide lines, the
   same button words in nine languages. The block between the VWIZ_DATA
   markers in docs/app/index.html is copied here VERBATIM and exported as
   HNK.videoWizard; test/verify_video_wizard.js re-runs this extraction and
   fails when the committed file is no longer what the app produces.

   Usage: node tools/build_panel_video_wizard.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_video_wizard.js");

function lift(html) {
  const a = html.indexOf("/* ---- VWIZ_DATA ----");
  if (a < 0) throw new Error("VWIZ_DATA is no longer in the app — the anchor moved.");
  const bTag = "/* ---- /VWIZ_DATA ---- */";
  const b = html.indexOf(bTag, a);
  if (b < 0) throw new Error("the app's VWIZ_DATA block is unterminated");
  return html.slice(a, b + bTag.length);
}

const HEAD = `/* ============================================================
   HNK video wizard words — LIFTED, do not edit by hand.
   Source of truth: the web app's own VWIZ_DATA block (docs/app/index.html),
   copied verbatim by tools/build_panel_video_wizard.js so the panel's
   step-by-step video wizard reads exactly what the app's reads.
   ============================================================ */
(function () {
"use strict";

function _lang() {
  try {
    var b = globalThis.HNK && globalThis.HNK.i18n;
    return (b && typeof b.lang === "function") ? b.lang() : "en";
  } catch (e) { return "en"; }
}
function tr(m) {
  if (m == null) return "";
  if (typeof m === "string") return m;
  var k = _lang();
  return (m[k] != null) ? m[k] : (m.en != null ? m.en : "");
}

`;
const TAIL = `

var API = { DOTS: VWIZ_DOTS, L: VWIZ_L, STEPS: VWIZ_STEPS, tr: tr, lang: _lang,
  steps: function (kind) { var s = VWIZ_STEPS[kind] || {}; return s[_lang()] || s.en || []; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoWizard = API; }
})();
`;

function build() {
  const html = fs.readFileSync(APP, "utf8");
  return HEAD + lift(html) + TAIL;
}

module.exports = { build };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  console.log("wrote " + path.relative(ROOT, OUT) + " — " + out.length + " bytes");
}
