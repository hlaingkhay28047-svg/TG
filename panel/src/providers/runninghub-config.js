/* ============================================================
   HNK AI Tools — RunningHub config (openapi/v2 "Standard Model API")
   Spec §17 (Adapter) · §19 (registry-driven)

   Endpoint paths are DATA, not code — so a real RunningHub apiPath can be
   dropped in (or a user can add one via Settings) without touching the
   adapter. Every built-in model below ships with its real, confirmed
   apiPath already: paste your RunningHub Enterprise-Shared key in Settings
   and it works immediately — no per-app/node setup (spec §17, §21).

   This is the SAME openapi/v2 (Bearer key + fixed apiPath, JSON in/out)
   scheme already proven live in the HNK Web Studio companion web app —
   ported 1:1 rather than the older Enterprise ai-app/webappId+nodeId
   scheme this file used to hold, which needed external per-account app
   ids this plugin never received and so never went live.

   v6.28.2 — no placeholder remains: the owner's verified Enterprise-Shared
   reference (2026-08-30) identifies rhart-image-g-2-official as GPT Image 2
   official stable, so the old empty "gpt-image-2" entry is retired and the
   id aliases to rh-image-g2-off in the model registry. flux-2-dev carries
   its confirmed text-to-image endpoint, ported from the companion web
   app's RH_T2I_MODELS (kind:"t2i" — prompt+aspectRatio+outputFormat only).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function defaults() {
  return {
    baseUrl: "https://www.runninghub.ai",
    paths: {
      upload: "/openapi/v2/media/upload/binary",
      query: "/openapi/v2/query"
    },
    // Poll cadence + ceilings (ms). Overridable per install.
    pollIntervalMs: 2500,
    pollTimeoutMs: 180000,
    // Per-model routing. `apiPath` is appended to baseUrl + "/openapi/v2/"
    // for that model's submit call. The other flags (kind/sizeParam/
    // whParam/imageParam/promptMax/quality/resolutions) tell the adapter's
    // buildRequestBody how to shape that model's JSON body — confirmed
    // against RunningHub's own API docs, never guessed.
    //  · quality:      the endpoint marks `quality` REQUIRED — ship the
    //                  documented default on every request.
    //  · resolutions:  the endpoint's documented resolution enum, when it is
    //                  narrower than the standard 1k/2k/4k — the adapter maps
    //                  anything outside it up to the smallest documented tier
    //                  (Seedream v4.5 documents 2k|4k only, so Auto/1K → 2k).
    models: {
      "nano-banana-2":         { apiPath: "rhart-image-n-g31-flash/image-to-image" },
      "nano-banana-pro":       { apiPath: "rhart-image-n-pro/edit" },
      "nano-banana-pro-off":   { apiPath: "rhart-image-n-pro-official/edit" },
      "rh-image-g2-off":       { apiPath: "rhart-image-g-2-official/image-to-image", quality: "medium" },
      "rh-image-g2":           { apiPath: "rhart-image-g-2/image-to-image" },
      "rh-image-x-off":        { apiPath: "rhart-image-x-official/edit", imageParam: "image" },
      "qwen-image-2":          { apiPath: "alibaba/qwen-image-2.0/image-edit", sizeParam: true, promptMax: 800 },
      "qwen-image-2-pro":      { apiPath: "alibaba/qwen-image-2.0-pro/image-edit", sizeParam: true, promptMax: 800 },
      "flux-2-dev":            { apiPath: "rhart-image/f-2-dev/text-to-image", kind: "t2i" },
      /* v6.27.0 — the web app's three remaining text-to-image models, ported
         with their confirmed endpoints (owner: the model set must be
         complete). Field shapes mirror the app's defs verbatim. */
      "nano-banana-pro-t2i":   { apiPath: "rhart-image-n-pro-official/text-to-image", kind: "t2i", promptMax: 20000 },
      "qwen-image-3-pro-t2i":  { apiPath: "alibaba/qwen-image-3.0-pro/text-to-image", kind: "t2i", sizeParam: true, promptMax: 2048 },
      "rh-imagine-quality":    { apiPath: "rhart-imagine-image-quality/text-to-image", kind: "t2i", resolutions: ["1k", "2k"], promptMax: 4000 },
      "wan-image-edit":        { apiPath: "alibaba/wan-2.7/image-edit", whParam: true, promptMax: 2048 },
      "wan-image-edit-pro":    { apiPath: "alibaba/wan-2.7/image-edit-pro", whParam: true, promptMax: 2048 },
      "upscale-pro":           { apiPath: "topazlabs/image-upscale-standard-v2", imageParam: "imageUrl", kind: "upscale" },
      "seedream-v4":           { apiPath: "seedream-v4/image-to-image", kind: "seedream", promptMax: 2000 },
      "seedream-v4-5":         { apiPath: "seedream-v4.5/image-to-image", kind: "seedream", promptMax: 2000, resolutions: ["2k", "4k"] },
      "rh-imagine-quality-edit": { apiPath: "rhart-imagine-image-quality/edit", imageParam: "imageUrl", kind: "imagine" },
      "z-image-turbo":         { apiPath: "rhart-image/z-image-turbo/image-to-image", imageParam: "imageUrl", kind: "zimage" },
      "upscale-transparent":   { apiPath: "topazlabs/image-upscale-transparent", imageParam: "imageUrl", kind: "upscale-transparent" }
    }
  };
}

/* Merge a user override (from Settings — e.g. a custom model's pasted
   apiPath) over the defaults. */
function resolve(override) {
  var d = defaults();
  if (!override || typeof override !== "object") return d;
  var out = Object.assign({}, d, override);
  /* an override saved before a base URL was set carries baseUrl:"" — an empty
     host must never wipe the default, or every request URL turns path-only */
  if (!out.baseUrl) out.baseUrl = d.baseUrl;
  out.paths = Object.assign({}, d.paths, override.paths || {});
  /* Per-model DEEP merge, not a flat Object.assign: an override commonly only
     carries { apiPath } (e.g. Settings' "add a model endpoint" form saves
     just the path) — a flat merge would silently replace the whole model
     config and drop its request-body-shape flags (kind/sizeParam/whParam/
     imageParam/promptMax), corrupting every future request for that model. */
  out.models = Object.assign({}, d.models);
  var overrideModels = override.models || {};
  for (var id in overrideModels) {
    if (!overrideModels.hasOwnProperty(id)) continue;
    out.models[id] = Object.assign({}, d.models[id] || {}, overrideModels[id]);
  }
  return out;
}

function modelConfig(cfg, modelId) {
  return (cfg && cfg.models && cfg.models[modelId]) || null;
}

/* True when the model has no real apiPath yet (so the UI can warn instead
   of firing a doomed request). */
function isPlaceholder(cfg, modelId) {
  var mc = modelConfig(cfg, modelId);
  return !mc || !mc.apiPath;
}

var API = { defaults: defaults, resolve: resolve, modelConfig: modelConfig, isPlaceholder: isPlaceholder };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubConfig = API; }
})();
