/* ============================================================
   LIFT the web app's VIDEO SMART WORKFLOW deck into the panel.

   The two cards that put a student's own character into a clip they like
   have to say the same thing in Photoshop as they say on the phone — the
   same labels in the same nine languages, and, far more important, the
   SAME REQUEST. A prompt retyped into the panel is a prompt that drifts,
   and a lock that exists in two copies is a lock that is eventually only
   in one of them. So VT_KEEP, VT_FINISH, VT_CLIP_WARN and VT_WF are
   EXTRACTED from docs/app/index.html and written to
   panel/js/hnk_video_tool_wf.js verbatim.

   ONE deliberate difference, and it is the same one hnk_video_wf_data.js
   documents: the panel's data modules load BEFORE main.js, so a label
   resolved at load would freeze to English. L9 is the identity function
   here and API.tr() resolves the nine-language maps at render time.

   test/verify_video_smart_workflow.js re-runs this extraction and fails
   when the committed panel file is no longer what the app produces.

   Usage: node tools/build_panel_video_tool_wf.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_video_tool_wf.js");

/* the app's block, start to end: the two shared halves, the clip warning and
   the deck itself. Bracket-matched rather than line-counted, because a card's
   text() body carries brackets of its own. */
function lift(html) {
  const start = html.indexOf("var VT_KEEP = ");
  if (start < 0) throw new Error("VT_KEEP is no longer in the app — the anchor moved.");
  const arr = html.indexOf("var VT_WF = [", start);
  if (arr < 0) throw new Error("VT_WF is no longer in the app — the anchor moved.");
  const open = html.indexOf("[", arr);
  let depth = 0, end = -1, inStr = false, q = "";
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) { end = i; break; } }
  }
  if (end < 0) throw new Error("the app's VT_WF array is unterminated");
  const semi = html.indexOf(";", end);
  const body = html.slice(start, semi + 1);

  /* VT_CLIP_WARN sits below the deck in the app (next to the guard that uses
     it) and the panel needs it too — lifted by its own line. */
  const warnAt = html.indexOf("var VT_CLIP_WARN = ");
  if (warnAt < 0) throw new Error("VT_CLIP_WARN is no longer in the app — the anchor moved.");
  const warnEnd = html.indexOf("\n", warnAt);
  return { body: body, warn: html.slice(warnAt, warnEnd).replace(/\s+$/, "") };
}

const HEAD = `/* ============================================================
   HNK video-smart-workflow deck — LIFTED, do not edit by hand.
   Source of truth: the web app's own VT_KEEP / VT_FINISH / VT_CLIP_WARN /
   VT_WF block (docs/app/index.html), copied verbatim by
   tools/build_panel_video_tool_wf.js so Media Lab ▸ VidUp offers the SAME
   two cards, the SAME written request and the SAME documented clip ceiling
   the app offers, and never invents an endpoint.

   L9 is the IDENTITY function here: these modules load before main.js, so a
   label resolved at load would freeze to English. API.tr() resolves the
   nine-language maps at render time, exactly as hnk_video_wf_data.js does.
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

const TAIL = `

var API = { WF: VT_WF, KEEP: VT_KEEP, FINISH: VT_FINISH, CLIP_WARN: VT_CLIP_WARN, tr: tr,
  byKey: function (k) { for (var i = 0; i < VT_WF.length; i++) if (VT_WF[i].key === k) return VT_WF[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoToolWorkflows = API; }
})();
`;

function build() {
  const html = fs.readFileSync(APP, "utf8");
  const { body, warn } = lift(html);
  return HEAD + body + "\n" + warn + TAIL;
}

module.exports = { build };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  const n = (out.match(/key:"/g) || []).length;
  console.log("wrote " + path.relative(ROOT, OUT) + " — " + n + " cards, " + out.length + " bytes");
}
