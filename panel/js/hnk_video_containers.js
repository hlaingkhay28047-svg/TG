/* ============================================================
   HNK video-container map — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_VIDEO_EXTRA_CONTAINERS table
   (docs/app/index.html), copied verbatim by
   tools/build_panel_video_containers.js so both surfaces refuse the same
   files for the same tools — before the run is paid for.
   ============================================================ */
(function () {
"use strict";

var RH_VIDEO_EXTRA_CONTAINERS = {
  "alibaba/happyhorse-1.0/video-edit": ["mov"],
  "alibaba/wan-2.6/reference-to-video": ["mov"],
  "alibaba/wan-2.6/reference-to-video-flash": ["mov"],
  "alibaba/wan-2.7/reference-to-video": ["mov"],
  "alibaba/wan-2.7/video-edit": ["mov"],
  "alibaba/wan-2.7/video-extend": ["mov"],
  "bytedance/dreamactor-v2": ["mov", "webm"],
  "minimax/hailuo-h3/multimodal-to-video": ["mov"],
  "pixverse-v6/extend": ["mov", "webm"],
  "rhart-video-g-official/video-extend": ["mov"],
  "rhart-video/sparkvideo-2.0-mini/multimodal-video": ["mov"],
  "vidu/reference-to-video-q2-pro": ["avi", "mov"],
  /* v6.13.0 — the translate-and-dub tool takes the iPhone .mov and .m4v too */
  "volc-drama/video-translate": ["m4v", "mov", "webm"],
  "volc-subtitle-erase-pro/video": ["m4v", "mov", "webm"],
  "volc-subtitle-erase/video": ["m4v", "mov", "webm"]
};

/* the containers a given tool will take, MP4 always first */
function containers(apiPath) {
  return ["mp4"].concat(RH_VIDEO_EXTRA_CONTAINERS[apiPath] || []);
}
function accepts(apiPath, fileName) {
  var ext = String(fileName || "").toLowerCase().replace(/^.*\./, "");
  return containers(apiPath).indexOf(ext) >= 0;
}

var API = { containers: containers, accepts: accepts, map: RH_VIDEO_EXTRA_CONTAINERS };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoContainers = API; }
})();
