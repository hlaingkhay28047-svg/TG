/* ============================================================
   LIFT the web app's per-endpoint video-container map into the panel.

   Every video endpoint RunningHub documents takes MP4; only fourteen of
   the ones we ship take anything else. The web app has always asked for
   MP4 and been safe. The PANEL offered mov and webm for every tool, so a
   student could pick an iPhone .mov for an MP4-only endpoint, be charged
   at submit, and have it rejected afterwards.

   Retyping fourteen lines into the panel is how the two surfaces drift, so
   RH_VIDEO_EXTRA_CONTAINERS is EXTRACTED from docs/app/index.html verbatim
   and both surfaces ask the same question of the same table.

   test/verify_video_containers.js re-runs this extraction and fails when
   the committed panel file is no longer what the app produces.

   Usage: node tools/build_panel_video_containers.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_video_containers.js");

function lift(html) {
  const at = html.indexOf("var RH_VIDEO_EXTRA_CONTAINERS = {");
  if (at < 0) throw new Error("RH_VIDEO_EXTRA_CONTAINERS is no longer in the app — the anchor moved.");
  const end = html.indexOf("\n};", at);
  if (end < 0) throw new Error("the app's RH_VIDEO_EXTRA_CONTAINERS map is unterminated");
  return html.slice(at, end + 3);
}

const HEAD = `/* ============================================================
   HNK video-container map — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_VIDEO_EXTRA_CONTAINERS table
   (docs/app/index.html), copied verbatim by
   tools/build_panel_video_containers.js so both surfaces refuse the same
   files for the same tools — before the run is paid for.
   ============================================================ */
(function () {
"use strict";

`;

const TAIL = `

/* the containers a given tool will take, MP4 always first */
function containers(apiPath) {
  return ["mp4"].concat(RH_VIDEO_EXTRA_CONTAINERS[apiPath] || []);
}
function accepts(apiPath, fileName) {
  var ext = String(fileName || "").toLowerCase().replace(/^.*\\./, "");
  return containers(apiPath).indexOf(ext) >= 0;
}

var API = { containers: containers, accepts: accepts, map: RH_VIDEO_EXTRA_CONTAINERS };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoContainers = API; }
})();
`;

function build() { return HEAD + lift(fs.readFileSync(APP, "utf8")) + TAIL; }
module.exports = { build };

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out, "utf8");
  console.log("wrote " + path.relative(ROOT, OUT) + " — " +
    (out.match(/": \[/g) || []).length + " endpoints, " + out.length + " bytes");
}
