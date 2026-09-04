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
function scanArray(html, open) {
  /* v6.6.0 — COMMENTS ARE NOT CODE. This scanner used to treat every quote
     as a string delimiter, including the ones inside the block comments that
     document each card — so a single apostrophe in prose ("the model's
     behaviour") opened a string that never closed and the lift died with
     "unterminated". The comment is the last place a lift should be fragile:
     it is where the reasoning lives, and prose has apostrophes in it. */
  let depth = 0, i = open;
  while (i < html.length) {
    const c = html[i], d = html[i + 1];
    if (c === "/" && d === "/") { const nl = html.indexOf("\n", i); if (nl < 0) break; i = nl + 1; continue; }
    if (c === "/" && d === "*") { const e = html.indexOf("*/", i + 2); if (e < 0) break; i = e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < html.length) {
        if (html[i] === "\\") { i += 2; continue; }
        if (html[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) return i; }
    i++;
  }
  return -1;
}

function lift(html) {
  const at = html.indexOf("var RH_TALK_MODELS = [");
  if (at < 0) throw new Error("RH_TALK_MODELS is no longer in the app — the anchor moved.");
  const open = html.indexOf("[", at);
  const end = scanArray(html, open);
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
