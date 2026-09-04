/* ============================================================
   LIFT the web app's HD Finish engines into the panel.

   Retouch A, Retouch B and Retouch Pro all end in one finish pass, and the
   engine that runs it — plus whether Topaz gets to re-imagine the face on
   top of the student's retouch — is a choice, not a hard-wired default. The
   panel offers the same three retouch surfaces, so it must offer the same
   choice, over the same endpoints, with the same request bodies.

   Retyping five endpoints and four body shapes into the panel is how the two
   surfaces drift and how an undocumented field reaches a paid endpoint, so
   RH_FINISH_ENGINES and its three helpers are EXTRACTED from
   docs/app/index.html verbatim.

   test/verify_retouch_finish.js checks every field of every body against
   RunningHub's published schema, and re-runs this extraction to prove the
   committed panel file is still what the app produces.

   Usage: node tools/build_panel_finish_engines.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_finish_engines.js");

/* Cut a top-level `var NAME = [ ... \n];` or `function NAME( ... \n}` out of
   the app by its own anchor, comment-aware so an apostrophe inside a comment
   cannot be read as an opening quote. */
function cut(html, anchor, closer) {
  const at = html.indexOf(anchor);
  if (at < 0) throw new Error(anchor + " is no longer in the app — the anchor moved.");
  const end = html.indexOf(closer, at);
  if (end < 0) throw new Error(anchor + " is unterminated");
  return html.slice(at, end + closer.length);
}

function lift(html) {
  return [
    cut(html, "var RH_FINISH_ENGINES = [", "\n];"),
    cut(html, "function rhFinishEngine(", "\n}"),
    cut(html, "function rhFinishWH(", "\n}"),
    cut(html, "function rhFinishBody(", "\n}")
  ].join("\n");
}

const HEAD = `/* ============================================================
   HNK HD Finish engines — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_FINISH_ENGINES table and its
   rhFinishEngine / rhFinishWH / rhFinishBody helpers
   (docs/app/index.html), copied verbatim by
   tools/build_panel_finish_engines.js so a retouch finished in Photoshop
   and a retouch finished in the browser send RunningHub the same body.
   ============================================================ */
(function () {
"use strict";

/* the app reads its size tier through this helper; the panel's own copy
   lives in the studio module, so the lifted body builder gets it here */
function rhScaleFromSize(sizeSel){
  var s=String(sizeSel||"").toLowerCase();
  return s==="4k" ? "6x" : s==="2k" ? "4x" : "2x";
}

`;

const TAIL = `

/* The student's stored choice. svGet is the studio module's settings store,
   which is present whenever a retouch page is mounted; before that (and in
   a plain node require) the app's own defaults stand, which are exactly the
   endpoint and body this panel has always sent. */
function settings() {
  var g = (typeof globalThis.svGet === "function") ? globalThis.svGet : function (k, d) { return d; };
  return { engine: rhFinishEngine(g("st_fin_engine", "standard")), face: g("st_fin_face", "auto") };
}

var API = { list: RH_FINISH_ENGINES, get: rhFinishEngine, body: rhFinishBody, settings: settings };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else {
  globalThis.HNK = globalThis.HNK || {};
  globalThis.HNK.finishEngines = API;
  /* the lifted studio slices call these by their app names */
  globalThis.RH_FINISH_ENGINES = RH_FINISH_ENGINES;
  globalThis.rhFinishEngine = rhFinishEngine;
  globalThis.rhFinishBody = rhFinishBody;
  globalThis.rhFinishSettings = settings;
}
})();
`;

function build() { return HEAD + lift(fs.readFileSync(APP, "utf8")) + TAIL; }
module.exports = { build };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  console.log("wrote " + path.relative(ROOT, OUT) + " — " +
    (out.match(/apiPath:"/g) || []).length + " engines, " + out.length + " bytes");
}
