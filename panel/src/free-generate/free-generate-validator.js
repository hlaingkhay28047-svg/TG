/* ============================================================
   HNK AI Tools — Free Generate Validator
   Spec §5 (dynamic max references) · §8 (resolved model) · §11 (Generate rules)

   Generate ENABLED when: prompt exists OR at least one valid image exists.
   Generate DISABLED when: no api key · unsupported model/input combo ·
     invalid web image · required model parameter missing · request running.

   Also resolves the effective model (expanding "auto") and the dynamic image
   slot ceiling for the current model, which the UI uses to cap "Add Reference".
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) {
  return (typeof module !== "undefined" && module.exports) ? require(p) : null;
}
var registry = _req("../models/model-registry") || (globalThis.HNK && globalThis.HNK.modelRegistry);
var resolver = _req("../models/capability-resolver") || (globalThis.HNK && globalThis.HNK.capabilityResolver);
var autoSelector = _req("../models/auto-model-selector") || (globalThis.HNK && globalThis.HNK.autoModelSelector);

/* Resolve "auto" to a concrete model + reason, or echo the explicit choice. */
function resolveModel(state) {
  if (!state) return { modelId: "flux-2-dev", reason: "default", auto: true };
  if (state.modelId && state.modelId !== "auto") {
    return { modelId: state.modelId, reason: "Manually selected", auto: false };
  }
  var r = autoSelector.resolveSafe({
    prompt: state.prompt,
    images: state.images,
    imageCount: state.images ? state.images.length : 0
  });
  return { modelId: r.modelId, reason: r.reason, auto: true };
}

/* Dynamic max image slots — spec §5. Under Auto Model, use the global ceiling
   (Auto will route to a model that fits the added images); under an explicit
   model, use that model's own maxImages. */
function slotCeiling(state) {
  if (!state || !state.modelId || state.modelId === "auto") return resolver.globalMaxImages();
  return resolver.maxImages(state.modelId);
}

function maxSlots(state) { return slotCeiling(state); }

/* Full evaluation for the Generate button.
   ctx = { hasApiKey:boolean, requestRunning:boolean } */
function evaluate(state, ctx) {
  ctx = ctx || {};
  state = state || {};
  var reasons = [];
  var images = state.images || [];
  var validImages = images.filter(function (im) { return im && im.valid !== false; });
  var invalidImages = images.filter(function (im) { return im && im.valid === false; });
  var hasPrompt = !!(state.prompt && state.prompt.trim());

  var rm = resolveModel(state);

  // Empty request (spec §24)
  if (!hasPrompt && validImages.length === 0) {
    reasons.push({ code: "empty-request", message: "Add a prompt or at least one image before generating." });
  }
  // API key
  if (ctx.hasApiKey === false) {
    reasons.push({ code: "no-api-key", message: "Connect your RunningHub Enterprise key in Settings first." });
  }
  // Running
  if (ctx.requestRunning) {
    reasons.push({ code: "running", message: "A generation is already running." });
  }
  // Invalid web image (spec §11)
  if (invalidImages.length) {
    reasons.push({ code: "invalid-image", message: "One or more image references could not be loaded." });
  }
  // Model / input capability check (spec §11, §24)
  var cap = resolver.validate(rm.modelId, {
    images: validImages,
    imageCount: validImages.length,
    size: state.size,
    ratio: state.ratio
  });
  for (var i = 0; i < cap.errors.length; i++) reasons.push(cap.errors[i]);

  return {
    enabled: reasons.length === 0,
    reasons: reasons,
    resolvedModel: rm,
    maxSlots: slotCeiling(state),
    requestCount: resolver.requestCountForVariants(rm.modelId, state.variants || 1)
  };
}

var API = {
  resolveModel: resolveModel,
  maxSlots: maxSlots,
  evaluate: evaluate
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.freeGenerateValidator = API; }
})();
