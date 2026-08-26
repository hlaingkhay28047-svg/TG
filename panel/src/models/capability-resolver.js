/* ============================================================
   HNK AI Tools — Capability Resolver
   Spec §9 (Output Settings) · §11 (Generate rules) · §20 (Compilation)

   Given a model and a proposed request, answers:
     - is this size supported?  (else which sizes are)
     - is this ratio supported?
     - is this image count within maxImages?
     - is this an edit request the model can do, or a generation it can do?
   Returns structured, reason-tagged results so the UI can disable options and
   show the exact guidance the spec's error messages (§24) require.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* Dual-env dependency lookup: under Node (CommonJS) require locally; inside the
   UXP panel read from the global HNK namespace. Probe on module.exports, NOT on
   `require` — UXP defines require (for native modules) but cannot resolve a
   relative path, so a `typeof require` probe would wrongly take the Node path. */
var _CJS = (typeof module !== "undefined" && module.exports);
var registry = _CJS
  ? require("./model-registry")
  : (globalThis.HNK && globalThis.HNK.modelRegistry);

function _model(modelOrId) {
  if (modelOrId && typeof modelOrId === "object" && modelOrId.capabilities) return modelOrId;
  return registry.getModel(modelOrId);
}

function supportedSizes(modelOrId) {
  var m = _model(modelOrId);
  return m ? m.capabilities.supportedSizes.slice() : registry.ALL_SIZES.slice();
}

function supportsSize(modelOrId, size) {
  var m = _model(modelOrId);
  if (!m) return true;
  return m.capabilities.supportedSizes.indexOf(String(size).toLowerCase()) !== -1;
}

function supportedRatios(modelOrId) {
  var m = _model(modelOrId);
  return m ? m.capabilities.supportedRatios.slice() : registry.COMMON_RATIOS.slice();
}

function supportsRatio(modelOrId, ratio) {
  var m = _model(modelOrId);
  if (!m) return true;
  return m.capabilities.supportedRatios.indexOf(String(ratio)) !== -1;
}

function maxImages(modelOrId) {
  var m = _model(modelOrId);
  return m ? m.capabilities.maxImages : 8;
}

/* Largest reference count any registered model can accept. Used for the
   "Add Reference" cap while Auto Model is selected — Auto will route to a model
   that fits the images the user adds, so the slot cap must not collapse to a
   text-to-image model's zero (spec §5 dynamic limit, §8 Auto). */
function globalMaxImages() {
  var max = 0;
  var all = registry.listModels();
  for (var i = 0; i < all.length; i++) {
    if (all[i].capabilities.maxImages > max) max = all[i].capabilities.maxImages;
  }
  return max;
}

/* Nearest supported size at or below the requested one, else the smallest. */
function clampSize(modelOrId, size) {
  var m = _model(modelOrId);
  if (!m) return size;
  var order = ["4k", "2k", "1k"];
  var want = String(size).toLowerCase();
  if (m.capabilities.supportedSizes.indexOf(want) !== -1) return want;
  var wantIdx = order.indexOf(want);
  for (var i = Math.max(wantIdx, 0); i < order.length; i++) {
    if (m.capabilities.supportedSizes.indexOf(order[i]) !== -1) return order[i];
  }
  // nothing smaller — take the largest available
  for (var j = 0; j < order.length; j++) {
    if (m.capabilities.supportedSizes.indexOf(order[j]) !== -1) return order[j];
  }
  return want;
}

/* Whether N variants require N separate requests (endpoint has no batch). */
function requestCountForVariants(modelOrId, variants) {
  var m = _model(modelOrId);
  var n = Math.max(1, variants | 0);
  if (!m) return n;
  return m.capabilities.variants ? 1 : n;
}

/* Does the model accept this input shape at all?
   imageCount 0  → needs textToImage
   imageCount >0 → needs imageEdit (or textToImage models that also take refs) */
function supportsInputShape(modelOrId, imageCount) {
  var m = _model(modelOrId);
  if (!m) return true;
  var n = imageCount | 0;
  if (n === 0) return !!m.capabilities.textToImage;
  // any image input requires slots the model actually has
  if (n > m.capabilities.maxImages) return false;
  if (n === 1) return !!(m.capabilities.imageEdit || m.capabilities.textToImage);
  // more than one image → needs multiReference and enough slots
  return !!m.capabilities.multiReference;
}

/* Full validation used by the Generate button + error messages (§11, §24).
   Returns { ok, errors:[{code,message,data}] }. */
function validate(modelOrId, req) {
  req = req || {};
  var errors = [];
  var m = _model(modelOrId);
  var imageCount = (req.images && req.images.length) || req.imageCount || 0;

  if (m) {
    // reference count
    if (imageCount > m.capabilities.maxImages) {
      errors.push({
        code: "too-many-images",
        message: m.displayName + " cannot accept this number of reference images.",
        data: { max: m.capabilities.maxImages, given: imageCount }
      });
    }
    // input shape
    if (imageCount === 0 && !m.capabilities.textToImage) {
      errors.push({
        code: "needs-image",
        message: m.displayName + " needs at least one input image.",
        data: {}
      });
    }
    if (imageCount >= 1 && !m.capabilities.imageEdit && !m.capabilities.textToImage) {
      errors.push({
        code: "no-edit-support",
        message: m.displayName + " does not support editing input images.",
        data: {}
      });
    }
    if (imageCount > 1 && !m.capabilities.multiReference) {
      errors.push({
        code: "no-multi-reference",
        message: m.displayName + " accepts only a single reference image.",
        data: { max: m.capabilities.maxImages }
      });
    }
    // size
    if (req.size && !supportsSize(m, req.size)) {
      errors.push({
        code: "unsupported-size",
        message: "The selected model does not support " + String(req.size).toUpperCase() + " output.",
        data: { available: m.capabilities.supportedSizes.slice() }
      });
    }
    // ratio
    if (req.ratio && !supportsRatio(m, req.ratio)) {
      errors.push({
        code: "unsupported-ratio",
        message: m.displayName + " does not support the " + req.ratio + " ratio.",
        data: { available: m.capabilities.supportedRatios.slice() }
      });
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

var API = {
  supportedSizes: supportedSizes,
  supportsSize: supportsSize,
  supportedRatios: supportedRatios,
  supportsRatio: supportsRatio,
  maxImages: maxImages,
  globalMaxImages: globalMaxImages,
  clampSize: clampSize,
  requestCountForVariants: requestCountForVariants,
  supportsInputShape: supportsInputShape,
  validate: validate
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.capabilityResolver = API; }
})();
