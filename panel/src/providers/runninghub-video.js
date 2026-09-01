/* ============================================================
   HNK — RunningHub video, ported from the web app (v6.45.0)

   The panel could generate images and nothing else, so Media Lab held one
   page where the app holds three. This is the app's own video path, lifted
   rather than reinvented: the model descriptors come from the app's
   doc-verified RH_VIDEO_MODELS table (panel/js/hnk_video_models.js, copied
   verbatim — no endpoint is invented here), and buildBody below is the app's
   rhV2SubmitVideo body builder, unchanged in behaviour. Upload, submit,
   poll and download reuse the panel's own services, so a video run carries
   the same lease, the same timeouts and the same cancel semantics as an
   image run.
   ============================================================ */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var uploadSvc = _req("./runninghub-upload-service") || (globalThis.HNK && globalThis.HNK.runninghubUpload);
var taskSvc   = _req("./runninghub-task-service")   || (globalThis.HNK && globalThis.HNK.runninghubTasks);
var rhConfig  = _req("./runninghub-config")         || (globalThis.HNK && globalThis.HNK.runninghubConfig);
var MODELS    = _req("../../js/hnk_video_models")   || (globalThis.HNK && globalThis.HNK.videoModels) || [];

function models() { return MODELS.slice(); }
function get(id) {
  for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i];
  return null;
}

/* The app's rhV2SubmitVideo body, verbatim in behaviour: the sixty-five
   endpoints do not share one request shape, so the shape comes from the
   model's own descriptor rather than from a branch here. */
function buildBody(def, imageUrls, promptText, resolution, duration, aspectRatio, imageParam, promptMax) {
  var body = { prompt: promptMax ? String(promptText || "").slice(0, promptMax) : (promptText || "") };
  imageUrls = imageUrls || [];
  def = def || {};
  if (def.kind === "vnode" && def.node) {
    var nd = def.node, nb = {};
    (nd.images || []).forEach(function (k, i) { nb[k] = imageUrls[i] || ""; });
    var used = (nd.images || []).length;
    (nd.optImages || []).forEach(function (k) { if (imageUrls[used]) nb[k] = imageUrls[used++]; });
    if (nd.prompt) nb[nd.prompt] = body.prompt;
    if (nd.dur) nb[nd.dur] = Number(duration || (nd.durRange && nd.durRange.def) || 5);
    if (nd.fixed) Object.keys(nd.fixed).forEach(function (k) { nb[k] = nd.fixed[k]; });
    return nb;
  }
  var ip = imageParam || def.imageParam || "imageUrls";
  var isArrayParam = (ip === "imageUrls" || ip === "referenceImages" || ip === "keyframes" || ip === "refImages");
  if (!imageUrls.length && (def.minImages === 0 || def.maxImages === 0)) {
    /* no image field at all */
  } else if (isArrayParam) {
    body[ip] = imageUrls;
  } else {
    body[ip] = imageUrls[0] || "";
    if (def.lastParam && imageUrls.length > 1) body[def.lastParam] = imageUrls[1];
  }
  if (resolution) body[def.resParam || "resolution"] = resolution;
  if (duration) body.duration = def.durInt ? Number(duration) : String(duration);
  if (aspectRatio) body[def.aspectParam || "aspectRatio"] = aspectRatio;
  if (def.extra) Object.keys(def.extra).forEach(function (k) { if (!(k in body)) body[k] = def.extra[k]; });
  return body;
}

/* deps = { transport, cfg?, apiKey, signal? } — the same deps an image run
   uses. Returns { ok, results:[{ref,url}], error? }. */
async function generate(deps, input, onStage) {
  deps = Object.assign({}, deps);
  deps.cfg = deps.cfg || rhConfig.resolve(deps.configOverride);
  var def = input.def || get(input.modelId);
  if (!def || !def.apiPath) return { ok: false, error: { code: "model", message: "unknown video model" } };
  try {
    var refs = (input.imageRefs || []).filter(Boolean);
    var uploaded = refs.length
      ? await uploadSvc.uploadAll(deps, deps.apiKey, refs, function (i, n) {
          if (onStage) onStage("UPLOADING", { current: i + 1, total: n });
        })
      : [];
    var body = buildBody(def, uploaded, input.prompt, input.resolution, input.duration,
      input.aspectRatio, def.imageParam, def.promptMax);
    if (onStage) onStage("SUBMITTING", {});
    var taskId = await taskSvc.submit(deps, deps.apiKey, def.apiPath, body);
    if (onStage) onStage("PROCESSING", {});
    var final = await taskSvc.pollUntilDone(deps, deps.apiKey, taskId, function (elapsed) {
      if (onStage) onStage("PROCESSING", { elapsedMs: elapsed });
    });
    var list = (final && final.results) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].url) continue;
      if (onStage) onStage("DOWNLOADING_RESULT", {});
      var ref = await taskSvc.download(deps, list[i].url);
      out.push({ ref: ref, url: list[i].url });
    }
    return { ok: true, results: out };
  } catch (e) {
    return { ok: false, error: { code: (e && e.code) || "network", message: (e && e.message) || "video failed" } };
  }
}

/* The app's video upscaler, same endpoint and same resolution enum. */
var VU_APIPATH = "rhart-video/video-upscaler";
var VU_RES = ["720p", "1080p", "2k", "4k"];   /* the app's own enum, verbatim */
async function upscale(deps, videoRef, targetResolution, onStage) {
  deps = Object.assign({}, deps);
  deps.cfg = deps.cfg || rhConfig.resolve(deps.configOverride);
  try {
    if (!videoRef) return { ok: false, error: { code: "no-video", message: "pick a video first" } };
    if (onStage) onStage("UPLOADING", { current: 1, total: 1 });
    var up = await uploadSvc.uploadAll(deps, deps.apiKey, [videoRef], function () { });
    var res = VU_RES.indexOf(targetResolution) >= 0 ? targetResolution : "1080p";
    if (onStage) onStage("SUBMITTING", {});
    var taskId = await taskSvc.submit(deps, deps.apiKey, VU_APIPATH,
      { videoUrl: up[0] || "", targetResolution: res });
    if (onStage) onStage("PROCESSING", {});
    var final = await taskSvc.pollUntilDone(deps, deps.apiKey, taskId, function (elapsed) {
      if (onStage) onStage("PROCESSING", { elapsedMs: elapsed });
    });
    var list = (final && final.results) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].url) continue;
      if (onStage) onStage("DOWNLOADING_RESULT", {});
      out.push({ ref: await taskSvc.download(deps, list[i].url), url: list[i].url });
    }
    return { ok: true, results: out };
  } catch (e) {
    return { ok: false, error: { code: (e && e.code) || "network", message: (e && e.message) || "upscale failed" } };
  }
}

var API = { models: models, get: get, buildBody: buildBody, generate: generate,
  upscale: upscale, upscaleResolutions: VU_RES.slice() };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubVideo = API; }
})();
