/* ============================================================
   LIFT the web app's TALKING PHOTO catalog into the panel.

   Two endpoints, two prices, two field names. Retyping four short lines
   into the panel looks harmless and is exactly how a catalog drifts: the
   app would bill ¥0.36 a second while the panel quoted something else, or
   one surface would keep sending imageUrl after the other had moved on.
   RH_TALK_MODELS is therefore EXTRACTED from docs/app/index.html and
   written to panel/js/hnk_talk_models.js verbatim.

   test/verify_talking_photo.js re-runs this extraction and fails when the
   committed panel file is no longer what the app produces.

   Usage: node tools/build_panel_talk_models.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_talk_models.js");

/* bracket-matched rather than line-counted, so a label carrying a bracket
   cannot truncate the lift */
function lift(html) {
  const at = html.indexOf("var RH_TALK_MODELS = [");
  if (at < 0) throw new Error("RH_TALK_MODELS is no longer in the app — the anchor moved.");
  const open = html.indexOf("[", at);
  let depth = 0, end = -1, inStr = false, q = "";
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) { end = i; break; } }
  }
  if (end < 0) throw new Error("the app's RH_TALK_MODELS array is unterminated");
  const semi = html.indexOf(";", end);
  return html.slice(at, semi + 1);
}

const HEAD = `/* ============================================================
   HNK talking-photo catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_TALK_MODELS table
   (docs/app/index.html), copied verbatim by
   tools/build_panel_talk_models.js so Media Lab ▸ Talk offers the SAME two
   published endpoints at the SAME published price, and never invents one.
   ============================================================ */
(function () {
"use strict";

`;

const TAIL = `

function models() { return RH_TALK_MODELS.slice(); }
function get(id) {
  for (var i = 0; i < RH_TALK_MODELS.length; i++) if (RH_TALK_MODELS[i].id === id) return RH_TALK_MODELS[i];
  return RH_TALK_MODELS[0] || null;
}
/* the app's rhTalkBody, verbatim in behaviour: exactly the two required
   fields under the names the endpoint documents, plus the optional prompt
   only when the student actually wrote one */
function body(def, imageUrl, audioUrl, promptText) {
  var out = {};
  out[def.imageParam] = imageUrl || "";
  out[def.audioParam] = audioUrl || "";
  var p = String(promptText || "").trim();
  if (p) out.prompt = p;
  return out;
}

var API = { models: models, get: get, body: body };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.talkModels = API; }
})();
`;

function build() {
  return HEAD + lift(fs.readFileSync(APP, "utf8")) + TAIL;
}

module.exports = { build };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  const n = (out.match(/apiPath:"/g) || []).length;
  console.log("wrote " + path.relative(ROOT, OUT) + " — " + n + " endpoints, " + out.length + " bytes");
}
