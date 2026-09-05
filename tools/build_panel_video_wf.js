/* ============================================================
   LIFT the web app's VIDEO SMART WORKFLOW deck into the panel.

   panel/js/hnk_video_wf_data.js is the web app's own VID_CITIES / VID_ID /
   VID_KEEP / VID_CUT / VID_REF / VID_SETUP_V / VID_WF block, copied
   VERBATIM, so Media Lab > Video offers the same cards, the same prompts and
   the same model/resolution/duration/aspect setup the app offers, and never
   invents one. Until 6.15.0 that copy was made by hand and nothing checked it;
   test/verify_ref_video_cards.js now re-runs this extraction and fails when the
   committed file is no longer what the app produces.

   The one deliberate difference lives in the header the panel file carries
   (L9 is the identity function there, so labels resolve against the live
   language at render time) — it is written here, not in the lifted body.

   Usage: node tools/build_panel_video_wf.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_video_wf_data.js");

function lift(html) {
  const a = html.indexOf("var VID_CITIES=[");
  if (a < 0) throw new Error("VID_CITIES is no longer in the app — the anchor moved.");
  if (html.indexOf("var VID_CITIES=[", a + 1) >= 0) throw new Error("the app declares VID_CITIES twice");
  const w = html.indexOf("var VID_WF=[", a);
  if (w < 0) throw new Error("VID_WF does not follow VID_CITIES in the app");
  const e = html.indexOf("\n];", w);
  if (e < 0) throw new Error("the app's VID_WF array is unterminated");
  return html.slice(a, e + 3);
}

function head(n) {
  return `/* ============================================================
   HNK video-workflow catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own VID_CITIES / VID_ID / VID_KEEP /
   VID_CUT / VID_SETUP_V / VID_WF block (docs/app/index.html), copied
   verbatim so Media Lab ▸ Video offers the SAME ${n} cards, the SAME prompts
   and the SAME model/resolution/duration setup the app offers, and never
   invents one. Regenerate by re-lifting that block when the app changes it.

   ONE deliberate difference, and it is in this header rather than in the
   lifted body: the app evaluates L9() at load, because its language is
   already known by the time this array is defined. In the panel these
   modules load BEFORE main.js, so a label resolved here would freeze to
   English forever. L9 is therefore the IDENTITY function here — label,
   summary and hint stay as their nine-language maps — and API.tr() resolves
   them at render time against the live language. Nothing in the lifted text
   changes; only when it is read.
   ============================================================ */
(function () {
"use strict";

function L9(m) { return m; }   /* see the header: resolve late, not at load */

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
}

const TAIL = `

var API = { CITIES: VID_CITIES, WF: VID_WF, SETUP_V: VID_SETUP_V, tr: tr,
  cityDef: vidCityDef,
  byKey: function (k) { for (var i = 0; i < VID_WF.length; i++) if (VID_WF[i].key === k) return VID_WF[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoWorkflows = API; }
})();
`;

function build() {
  const html = fs.readFileSync(APP, "utf8");
  const body = lift(html);
  const n = (body.slice(body.indexOf("var VID_WF=[")).match(/\{ key:"/g) || []).length;
  return head(n) + body + TAIL;
}

module.exports = { build, lift };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  console.log("wrote " + path.relative(ROOT, OUT) + " — " + out.length + " bytes");
}
