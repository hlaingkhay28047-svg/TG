/* ============================================================
   HNK AI Tools — RunningHub Adapter (openapi/v2 "Standard Model API")
   Spec §17 (Adapter orchestration) · §11–§13 (states, progress, cancel) · §24

   Orchestrates a compiled request (from either mode's compiler) into a real
   generation: verify → upload → build payload → submit → poll → download.
   Drives the Free Generate state machine's stages for the progress UI, honours
   cancel (AbortSignal) and timeout, issues N sequential requests when the model
   has no batch variants, and normalizes every failure for the user (§24).

   Request-body shapes are ported 1:1 from the companion web app's proven
   openapi/v2 integration (same Enterprise-Shared key, same endpoints,
   confirmed against RunningHub's own API docs — see runninghub-config.js).

   Everything is injected — transport / sleep / now / config — so the whole flow
   is unit-testable with a fake transport and no real time or network.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
function dep(p, g) { return _CJS ? require(p) : globalThis.HNK[g]; }

var rhConfig = dep("./runninghub-config", "runninghubConfig");
var uploadSvc = dep("./runninghub-upload-service", "runninghubUploadService");
var taskSvc = dep("./runninghub-task-service", "runninghubTaskService");
var normalizer = dep("./runninghub-error-normalizer", "errorNormalizer");
var machine = dep("../free-generate/generate-state-machine", "generateStateMachine");
var registry = dep("../models/model-registry", "modelRegistry");

/* Ratio/size enums + per-family mappings — ported verbatim from the web
   app's confirmed rhV2Submit (see docs comment in runninghub-config.js). */
var RH_RATIO_ENUM = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "1:4", "4:1", "1:8", "8:1"];
var RH_QWEN_SIZE_MAP = {
  "1:1":  { std: "1024*1024", hd: "1536*1536" },
  "2:3":  { std: "768*1152",  hd: "1024*1536" },
  "3:2":  { std: "1152*768",  hd: "1536*1024" },
  "3:4":  { std: "960*1280",  hd: "1080*1440" },
  "4:3":  { std: "1280*960",  hd: "1440*1080" },
  "9:16": { std: "720*1280",  hd: "1080*1920" },
  "16:9": { std: "1280*720",  hd: "1920*1080" }
};
var RH_WAN_RATIO_WH = {
  "1:1": [1, 1], "3:4": [3, 4], "4:3": [4, 3], "4:5": [4, 5], "5:4": [5, 4],
  "9:16": [9, 16], "16:9": [16, 9], "2:3": [2, 3], "3:2": [3, 2]
};
/* The rhart-image/ ComfyUI-backed endpoints frame their output ratio as a
   node select with the SAME "1".."7" option table (owner's OpenAPI specs,
   2026-08-30): 1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9, 6=2:3, 7=3:2. FLUX.2
   Dev edit-lora additionally documents "8" custom width/height (unused
   here) and "9" auto-match-the-input; Z-Image Turbo's enum stops at the
   seven. Each branch picks its own documented fallback. */
var RH_NODE_RATIO_MAP = { "1:1": "1", "3:4": "2", "4:3": "3", "9:16": "4", "16:9": "5", "2:3": "6", "3:2": "7" };
/* Grok Imagine Quality Edit's OPTIONAL aspectRatio enum (owner's OpenAPI
   spec, 2026-08-30): auto/1:1/16:9/9:16/4:3/3:4/3:2/2:3 — omission IS the
   documented auto default, so a ratio is sent only when it is one of the
   seven. */
var RH_IMAGINE_RATIO_ENUM = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
/* v6.30.0 — the full-catalog wave's shared tables, each transcribed from
   the model's fetched doc (api-<id> cited beside every config entry). Wan
   2.5's edit and t2i routes document DIFFERENT fixed W*H enums; GPT Image
   1.5's three fixed sizes are keyed off the picked ratio's orientation. */
var RH_WAN25I_SIZE = { "1:1": "1280*1280", "2:3": "800*1200", "3:2": "1200*800", "3:4": "960*1280", "4:3": "1280*960", "9:16": "720*1280", "16:9": "1280*720", "21:9": "1344*576" };
var RH_WAN25T_SIZE = { "1:1": "1280*1280", "3:4": "1104*1472", "4:3": "1472*1104", "9:16": "960*1696", "16:9": "1696*960" };
function rhGpt15Size(ratio) {
  if (ratio === "2:3" || ratio === "3:4" || ratio === "9:16" || ratio === "4:5" || ratio === "9:21" || ratio === "1:2") return "1024*1536";
  if (ratio === "3:2" || ratio === "4:3" || ratio === "16:9" || ratio === "5:4" || ratio === "21:9" || ratio === "2:1") return "1536*1024";
  return "1024*1024";
}

function rhRatio(ratio) { return RH_RATIO_ENUM.indexOf(ratio) !== -1 ? ratio : ""; }
/* Auto -> the cheapest tier; the Standard API requires a lowercase 1k/2k/4k
   on every call, never an empty/omitted value. */
function rhResolution(size) {
  var s = String(size || "").toLowerCase();
  return (s === "1k" || s === "2k" || s === "4k") ? s : "1k";
}
/* Some endpoints document a NARROWER resolution enum than 1k/2k/4k (config
   flag `resolutions`, e.g. Seedream v4.5 accepts only 2k|4k). Anything outside
   that enum maps to its smallest documented tier — never ship an out-of-enum
   value like "1k" to a 2k|4k-only endpoint. */
function rhResolutionFor(mc, size) {
  var r = rhResolution(size);
  if (mc && mc.resolutions && mc.resolutions.length && mc.resolutions.indexOf(r) === -1) r = mc.resolutions[0];
  return r;
}
function qwenSize(ratio, size) {
  var m = RH_QWEN_SIZE_MAP[ratio];
  if (!m) return "";
  var s = String(size || "").toLowerCase();
  return (s === "2k" || s === "4k") ? m.hd : m.std;
}
/* Qwen 3.0 Pro's TEXT-TO-IMAGE "size" enum — a different option list from
   its image-edit sibling's map above, kept separate exactly as the web app
   keeps RH_QWEN3_T2I_SIZE_MAP beside RH_QWEN_SIZE_MAP (the two endpoints'
   enums aren't guaranteed to match). Ported verbatim. */
var RH_QWEN3_T2I_SIZE_MAP = {
  "1:1":  { std: "1024*1024", hd: "1600*1600" },
  "2:3":  { std: "768*1152",  hd: "1280*1920" },
  "3:2":  { std: "1152*768",  hd: "1920*1280" },
  "3:4":  { std: "768*1024",  hd: "1536*2048" },
  "4:3":  { std: "1024*768",  hd: "1792*1344" },
  "9:16": { std: "576*1024",  hd: "1152*2048" },
  "16:9": { std: "1024*576",  hd: "2048*1152" }
};
function qwen3T2ISize(ratio, size) {
  var m = RH_QWEN3_T2I_SIZE_MAP[ratio];
  if (!m) return "";
  var s = String(size || "").toLowerCase();
  return (s === "2k" || s === "4k") ? m.hd : m.std;
}
function wanWH(ratio, size) {
  var pr = RH_WAN_RATIO_WH[ratio];
  if (!pr) return null;
  var s = String(size || "").toLowerCase();
  var base = s === "4k" ? 2048 : s === "2k" ? 1536 : 1024;
  var rw = pr[0], rh = pr[1], w, h;
  if (rw >= rh) { w = base; h = Math.round(base * rh / rw); } else { h = base; w = Math.round(base * rw / rh); }
  return { w: Math.max(512, Math.min(4096, w)), h: Math.max(512, Math.min(4096, h)) };
}

/* Build the openapi/v2 JSON body for a compiled request against one model's
   config (apiPath + kind/sizeParam/whParam/imageParam/promptMax/quality/
   resolutions). */
function buildRequestBody(mc, request, uploadedUrls) {
  mc = mc || {};
  var body = { prompt: request.prompt || request.compiledPrompt || "" };
  if (mc.promptMax && body.prompt.length > mc.promptMax) body.prompt = body.prompt.slice(0, mc.promptMax);

  var ratio = (request.output && request.output.ratio) || "";
  var size = (request.output && request.output.size) || "";

  // Pure text-to-image endpoints take no image field at all. v6.29.0: this
  // branch is now genuinely ported 1:1 from the web app's rhV2SubmitT2I —
  // each model's config declares exactly the fields its own doc page lists
  // (t2iRatios/ratioRequired, resolutionField with an optional narrower
  // `resolutions` enum, sizeParam via the Qwen3 T2I map, numImagesField,
  // outputFormat, quality). The old branch sent a blanket aspectRatio +
  // outputFormat:"png" for every t2i model — right for flux-2-dev, but an
  // undeclared parameter for Nano Banana Pro/Qwen 3.0 (whose docs list no
  // outputFormat), and it never sent Nano's/Imagine's documented resolution
  // or Qwen 3.0's "size" at all. Return early so the imageUrls/resolution
  // logic below (which every image-edit endpoint needs) never runs.
  if (mc.kind === "t2i") {
    // Node-keyed T2I endpoints (currently flux-2-dev, per its fetched doc
    // api-448184518) name their fields as ComfyUI node keys. No auto
    // option exists on its "1".."8" select — fallback t2iRatios[0] (1:1),
    // the same value the old required-ratio logic defaulted to.
    if (mc.t2iNodeKeys) {
      var nbT = {};
      nbT[mc.t2iNodeKeys.prompt] = body.prompt;
      var nrT = mc.t2iRatios && mc.t2iRatios.indexOf(ratio) !== -1 ? ratio : (mc.t2iRatios ? mc.t2iRatios[0] : "1:1");
      nbT[mc.t2iNodeKeys.ratio] = RH_NODE_RATIO_MAP[nrT] || "1";
      // v6.30.0 — klein-4b's t2i-lora graph has no file_type field at all.
      if (mc.t2iNodeKeys.fileType) nbT[mc.t2iNodeKeys.fileType] = "PNG";
      return nbT;
    }
    if (mc.t2iRatios) {
      // v6.30.0 — autoRatioValue: nano-banana v1's aspectRatio is REQUIRED
      // with a literal documented "auto" value, sent for Auto/unknown.
      var useR = mc.t2iRatios.indexOf(ratio) !== -1 ? ratio : (mc.autoRatioValue || (mc.ratioRequired ? mc.t2iRatios[0] : ""));
      // ratioForSizeOnly (gpt-1.5 t2i): the ratio only picks the fixed
      // size — the endpoint declares NO aspectRatio field.
      if (useR && !mc.ratioForSizeOnly) body.aspectRatio = useR;
    }
    if (mc.resolutionField) {
      var allowedR = mc.resolutions && mc.resolutions.length ? mc.resolutions : ["1k", "2k", "4k"];
      var resV = String(size || "").toLowerCase();
      body.resolution = allowedR.indexOf(resV) !== -1 ? resV : allowedR[0];
    }
    if (mc.sizeParam || mc.sizeMap) {
      // v6.30.0 — per-model size tables: qwen2's fixed W*H enum, wan-2.5's
      // five fixed sizes (REQUIRED — documented default 1280*1280),
      // gpt-1.5's three orientation sizes, else the qwen3 free-form map.
      var szV = mc.sizeMap === "qwen2" ? qwenSize(ratio, size)
              : mc.sizeMap === "wan25" ? (RH_WAN25T_SIZE[ratio] || (mc.sizeRequired ? "1280*1280" : ""))
              : mc.sizeMap === "gpt15" ? rhGpt15Size(ratio)
              : qwen3T2ISize(ratio, size);
      if (szV) body.size = szV;
    }
    if (mc.whField) {
      // v6.30.0 — wan-2.7 t2i's optional width/height ints; omitted on
      // Auto so the documented 1024x1024 default applies.
      var whV = wanWH(ratio, size);
      if (whV) { body.width = whV.w; body.height = whV.h; }
    }
    if (mc.numImagesField) body.numImages = "1";
    if (mc.outputFormat) body.outputFormat = mc.outputFormat;
    if (mc.extraBody) { for (var ek in mc.extraBody) { if (mc.extraBody.hasOwnProperty(ek)) body[ek] = mc.extraBody[ek]; } }
    if (mc.quality) body.quality = mc.quality;
    return body;
  }

  uploadedUrls = uploadedUrls || [];

  // FLUX.2 Dev edit-lora (flux-2-dev-edit) takes a ComfyUI node-keyed body,
  // completely unlike the field-named endpoints around it: 51##image (ONE
  // image URL), 16##text (the prompt), 47##select (ratio enum — see
  // RH_FLUXEDIT_RATIO_MAP), 52##file_type (output format). The optional
  // 18##lora_name/18##strength_model pair is omitted on purpose (documented
  // default strength 0 = plain FLUX.2 Dev editing — a guessed .safetensors
  // name would invent a server-side asset), and no resolution/size field
  // exists on this endpoint. Ported 1:1 from the web app's fluxedit branch.
  if (mc.kind === "fluxedit") {
    var fx = {};
    fx["51##image"] = uploadedUrls[0] || "";
    fx["16##text"] = body.prompt;
    fx["47##select"] = RH_NODE_RATIO_MAP[ratio] || "9";
    fx["52##file_type"] = "PNG";
    return fx;
  }

  // Z-Image Turbo (v6.29.0): the owner's OpenAPI spec shows this
  // rhart-image/ sibling is node-keyed too — 66##image/41##text/
  // 64##select/65##file_type, all REQUIRED. Its ratio enum is the shared
  // "1".."7" table with NO auto option, so out-of-enum/Auto falls back to
  // "1" (1:1) — the same fallback the old flat body used. The flat
  // imageUrl/prompt/aspectRatio/outputFormat keys shipped before are not
  // in this spec and are gone. Ported 1:1 from the web app.
  if (mc.kind === "zimage") {
    var zb = {};
    zb["66##image"] = uploadedUrls[0] || "";
    zb["41##text"] = body.prompt;
    zb["64##select"] = RH_NODE_RATIO_MAP[ratio] || "1";
    zb["65##file_type"] = "PNG";
    return zb;
  }

  // v6.30.0 — generic ComfyUI node-keyed image-edit endpoints: mc.node
  // names each model's keys (single `image` or an ordered `images` list for
  // multi-slot graphs like qwen edit-2511). All share the "1".."7" ratio
  // table; models whose doc also lists "9" auto-match set node.auto, the
  // rest fall back to "1" = 1:1. fileType (when the field exists) always
  // ships the documented "PNG"; LoRA node pairs are never sent.
  if (mc.kind === "node") {
    var nn = mc.node || {}, nb2 = {};
    if (nn.images) { for (var qi = 0; qi < nn.images.length && qi < uploadedUrls.length; qi++) nb2[nn.images[qi]] = uploadedUrls[qi]; }
    else nb2[nn.image] = uploadedUrls[0] || "";
    nb2[nn.prompt] = body.prompt;
    nb2[nn.ratio] = RH_NODE_RATIO_MAP[ratio] || (nn.auto ? "9" : "1");
    if (nn.fileType) nb2[nn.fileType] = "PNG";
    return nb2;
  }
  // api-448184479 — one endpoint carries four Grok image versions via a
  // REQUIRED "model" field; prompt REQUIRED, imageUrl optional single.
  if (mc.kind === "grokimg") {
    var gb = { model: "g-4.2", prompt: body.prompt };
    if (uploadedUrls[0]) gb.imageUrl = uploadedUrls[0];
    return gb;
  }
  // api-498427798 — Seedream 5 layer decomposition: ONE imageUrl, optional
  // prompt, optional resolution (auto/1k/1.5k/2k — 4K coarsens to the 2k
  // ceiling). Results arrive as base + up to 16 layers; the shared download
  // loop collects them all (they land as layers in Photoshop).
  if (mc.kind === "sdlayer") {
    var lb = { imageUrl: uploadedUrls[0] || "" };
    if (body.prompt) lb.prompt = body.prompt;
    var lr = String(size || "").toLowerCase();
    if (lr === "1k") lb.resolution = "1k"; else if (lr === "2k" || lr === "4k") lb.resolution = "2k";
    return lb;
  }
  var imageParam = mc.imageParam || "imageUrls";
  if (imageParam === "image") body.image = uploadedUrls[0] || "";
  else if (imageParam === "imageUrl") body.imageUrl = uploadedUrls[0] || "";
  else body.imageUrls = uploadedUrls;

  if (mc.kind === "seedream") {
    body.resolution = rhResolutionFor(mc, size);
    body.sequentialImageGeneration = "disabled";
    body.maxImages = 1;
  } else if (mc.kind === "imagine") {
    var res3 = String(size || "").toLowerCase();
    body.resolution = (res3 === "2k" || res3 === "4k") ? "2k" : "1k";
    body.numImages = "1";
    // v6.29.0 — only the endpoint's own documented seven; the generic
    // rhRatio pass-through could ship 4:5/5:4/21:9, values outside this
    // spec's enum. Omission = the documented "auto" default.
    if (RH_IMAGINE_RATIO_ENUM.indexOf(ratio) !== -1) body.aspectRatio = ratio;
  } else if (mc.kind === "xedit") {
    // Grok Imagine — Edit (v6.29.0): the spec declares EXACTLY prompt +
    // image. The default branch's resolution/aspectRatio are not in it —
    // append nothing.
  } else if (mc.kind === "sd5lite") {
    // api-448184476 — resolution enum is 2k|3k and OPTIONAL: sent only for
    // an explicit 2K/4K pick (4K coarsens to the documented 3k ceiling).
    var s5 = String(size || "").toLowerCase();
    if (s5 === "2k") body.resolution = "2k"; else if (s5 === "4k") body.resolution = "3k";
    body.sequentialImageGeneration = "disabled"; body.maxImages = 1;
  } else if (mc.kind === "sd5pro") {
    // api-494859263 / api-494859267 — resolution 1k|2k (doc default 2k),
    // outputFormat jpeg|png (png for lossless layer work).
    body.resolution = String(size || "").toLowerCase() === "1k" ? "1k" : "2k";
    body.outputFormat = "png";
  } else if (mc.kind === "wan25") {
    // api-448184493 — a fixed W*H "size" enum keyed by ratio; omitted on
    // Auto so the documented 1280*1280 default applies.
    var w25 = RH_WAN25I_SIZE[ratio]; if (w25) body.size = w25;
  } else if (mc.kind === "nanov1") {
    // api-448184495 / api-448184498 — aspectRatio is REQUIRED and "auto"
    // is a documented enum value: anything outside the enum sends "auto".
    body.aspectRatio = (mc.ratioEnum || []).indexOf(ratio) !== -1 ? ratio : "auto";
  } else if (mc.kind === "ratioOnly") {
    // the nano-banana-2-lite pair — prompt + imageUrls plus an OPTIONAL
    // aspectRatio; no resolution field exists on these endpoints.
    if ((mc.ratioEnum || []).indexOf(ratio) !== -1 && ratio !== "auto") body.aspectRatio = ratio;
  } else if (mc.kind === "gpt15") {
    // api-448184503 — size and quality are REQUIRED; three fixed sizes
    // keyed off the picked ratio's orientation, documented default medium.
    body.size = rhGpt15Size(ratio); body.quality = "medium";
  } else if (mc.kind === "bare") {
    // api-465292102 — Jimeng 4.6 takes prompt + imageUrls only (its
    // optional width/height/scale knobs stay on their documented defaults).
  } else if (mc.sizeParam) {
    var sz = qwenSize(ratio, size); if (sz) body.size = sz;
  } else if (mc.whParam) {
    var wh = wanWH(ratio, size); if (wh) { body.width = wh.w; body.height = wh.h; }
  } else {
    body.resolution = rhResolutionFor(mc, size);
    var r2 = rhRatio(ratio); if (r2) body.aspectRatio = r2;
  }
  if (mc.quality) body.quality = mc.quality;
  return body;
}

/* Upscale-kind models (Upscale Pro / Upscale Transparent) have no prompt at
   all — a single image plus a size-derived field. Kept separate from
   buildRequestBody since the shapes don't overlap. */
function buildUpscaleBody(mc, request, uploadedUrls) {
  var url = (uploadedUrls || [])[0] || "";
  var size = (request.output && request.output.size) || "";
  var s = String(size || "").toLowerCase();
  if (mc.kind === "upscale-transparent") {
    var body = { imageUrl: url };
    var wh = s === "4k" ? { w: 3840, h: 2160 } : s === "2k" ? { w: 2560, h: 1440 } : s === "1k" ? { w: 1920, h: 1080 } : null;
    if (wh) { body.outputWidth = wh.w; body.outputHeight = wh.h; }
    return body;
  }
  // "upscale" (Upscale Pro): a relative scale enum instead of absolute pixels.
  var scale = s === "4k" ? "6x" : s === "2k" ? "4x" : "2x";
  return { imageUrl: url, scale: scale };
}

/* Lightweight key check (spec §21 Save & Verify). Treats 401/403 as invalid and
   any other response as "key accepted". Returns { ok, error? }. */
async function verifyKey(deps, apiKey) {
  if (!apiKey) return { ok: false, error: { code: "invalid-key" } };
  deps = deps || {};
  deps.cfg = deps.cfg || rhConfig.resolve(deps.configOverride);
  try {
    var resp = await deps.transport({
      method: "POST",
      url: (deps.cfg.baseUrl || "").replace(/\/+$/, "") + deps.cfg.paths.query,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ taskId: "__hnk_verify__" })
    });
    if (resp && (resp.status === 401 || resp.status === 403)) return { ok: false, error: { code: "invalid-key" } };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: normalizer.normalize(e) };
  }
}

function _stage(onStage, m, extra) {
  if (typeof onStage === "function") onStage(m.stage, Object.assign({ label: machine.label(m.stage) }, extra || {}));
}

/* One task end-to-end → array of result refs. */
async function _runOnce(deps, request, onStage, m) {
  var apiKey = deps.apiKey;
  var cfg = deps.cfg;
  var mc = rhConfig.modelConfig(cfg, request.model) || {};

  // Prepare + upload images
  machine.advance(m); _stage(onStage, m); // PREPARING_IMAGES
  var refs = (request.images || []).map(function (im) { return im.ref; }).filter(Boolean);
  machine.advance(m); _stage(onStage, m, { total: refs.length }); // UPLOADING
  var uploaded = await uploadSvc.uploadAll(deps, apiKey, refs, function (i, n) {
    // Honour cancel between uploads (spec §13: cancel during upload).
    if (deps.signal && deps.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    _stage(onStage, m, { current: i + 1, total: n });
  });

  // Build + submit
  machine.advance(m); _stage(onStage, m); // BUILDING_REQUEST
  var isUpscale = mc.kind === "upscale" || mc.kind === "upscale-transparent";
  var body = isUpscale ? buildUpscaleBody(mc, request, uploaded) : buildRequestBody(mc, request, uploaded);
  machine.advance(m); _stage(onStage, m); // SUBMITTING
  var taskId = await taskSvc.submit(deps, apiKey, mc.apiPath, body);
  deps._taskId = taskId; // for cancel cleanup

  // Poll (the SUCCESS response already carries `.results` — no separate
  // outputs call under openapi/v2).
  machine.advance(m); _stage(onStage, m); // PROCESSING
  var final = await taskSvc.pollUntilDone(deps, apiKey, taskId, function (elapsed) {
    _stage(onStage, m, { elapsedMs: elapsed });
  });
  // The SUCCESS body also carries what RunningHub charged (usage /
  // taskUsageList). Kept per task so the caller can book the real cost.
  if (!deps._usage) deps._usage = [];
  deps._usage.push({ taskId: taskId, final: final });

  // Download
  machine.advance(m); _stage(onStage, m); // DOWNLOADING_RESULT
  var resultList = (final && final.results) || [];
  var results = [];
  for (var i = 0; i < resultList.length; i++) {
    if (!resultList[i] || !resultList[i].url) continue;
    var ref = await taskSvc.download(deps, resultList[i].url);
    if (ref) results.push({ ref: ref, url: resultList[i].url });
  }
  return results;
}

/* Public entry. deps = { transport, cfg?, apiKey, sleep?, now?, signal? }.
   Returns { ok, results:[{ref}], model, error? }. */
async function generate(deps, request, opts) {
  opts = opts || {};
  var onStage = opts.onStage;
  deps = Object.assign({}, deps);
  deps.cfg = deps.cfg || rhConfig.resolve(deps.configOverride);
  deps.signal = opts.signal || deps.signal;

  var m = machine.create();
  _stage(onStage, m); // IDLE
  machine.advance(m, deps.now ? deps.now() : 0); _stage(onStage, m); // VALIDATING

  // Guard: model has no real apiPath yet — fail clearly instead of guessing.
  if (rhConfig.isPlaceholder(deps.cfg, request.model)) {
    machine.fail(m, "not-configured");
    return { ok: false, model: request.model, machine: m,
      error: { code: "not-configured", title: "This model is not connected to RunningHub yet.",
        message: "This model has no RunningHub endpoint path yet.",
        bullets: ["Add its endpoint path in Settings → RunningHub"] } };
  }

  var model = registry.getModel(request.model);
  var count = Math.max(1, request.requestCount || 1);
  var all = [];
  try {
    for (var r = 0; r < count; r++) {
      if (deps.signal && deps.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
      // fresh sub-machine per request so stages read correctly for the UI
      var sub = machine.create();
      var res = await _runOnce(deps, request, onStage, sub);
      all = all.concat(res);
    }
    machine.advance(m); // (VALIDATING -> ... ) keep top machine READY
    m.stage = "READY"; _stage(onStage, m);
    return { ok: true, results: all, model: request.model, machine: m, usage: deps._usage || [] };
  } catch (e) {
    if (e && e.code === "cancelled") {
      machine.cancel(m); _stage(onStage, m);
      if (deps._taskId) taskSvc.cancelTask(deps, deps.apiKey, deps._taskId);
      return { ok: false, cancelled: true, model: request.model, machine: m, error: { code: "cancelled" } };
    }
    if (e && e.code === "timeout") { machine.timeout(m); _stage(onStage, m); }
    else { machine.fail(m, e && e.message); _stage(onStage, m); }
    var n = normalizer.normalize(e, { modelName: model ? model.displayName : request.model,
      size: request.output && request.output.requestedSize,
      available: model ? model.capabilities.supportedSizes : undefined });
    return { ok: false, model: request.model, machine: m, error: n };
  }
}

function makeVerifier(deps) {
  var d = Object.assign({}, deps);
  d.cfg = d.cfg || rhConfig.resolve(d.configOverride);
  return function (apiKey) { return verifyKey(Object.assign({}, d, { apiKey: apiKey }), apiKey); };
}

var API = { generate: generate, verifyKey: verifyKey, makeVerifier: makeVerifier, buildRequestBody: buildRequestBody, buildUpscaleBody: buildUpscaleBody };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubAdapter = API; }
})();
