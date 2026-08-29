/* ============================================================
   HNK AI Tools — Auto Model Selector
   Spec §8 (Model Selector · Auto Model Rules)

   Auto Model rules:
     No image + creative prompt          -> FLUX or GPT Image
     One image + local edit instruction  -> Qwen Image 2.0 Pro
     One subject + one scene reference    -> Nano Banana 2
     Many reference images                -> Nano Banana 2
     Poster or visible text request       -> GPT Image 2
     Complex full-scene edit              -> Nano Banana Pro

   Auto Model may be selected, but the resolved model + reason MUST be shown to
   the user before Generate is pressed (spec §8).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var registry = _CJS
  ? require("./model-registry")
  : (globalThis.HNK && globalThis.HNK.modelRegistry);

/* Keyword heuristics — kept small, transparent and multilingual-friendly.
   These bias, not force: image count is the dominant signal. */
var LOCAL_EDIT_HINTS = [
  "remove", "erase", "delete", "replace", "add", "change", "fix", "clean",
  "retouch", "recolor", "recolour", "swap", "edit", "adjust", "cleanup",
  "clone", "patch", "extend", "crop", "brighten", "darken", "blur"
];
var POSTER_TEXT_HINTS = [
  "poster", "banner", "flyer", "layout", "logo", "typography", "headline",
  "caption", "title text", "add text", "with text", "sign", "label",
  "billboard", "cover", "menu", "brochure", "infographic", "certificate"
];
var FULL_SCENE_HINTS = [
  "full scene", "entire scene", "whole scene", "rebuild the scene",
  "complex", "composite everything", "recompose", "relight the whole",
  "full background and", "reconstruct", "multiple people", "group scene"
];

function _hit(text, list) {
  var t = (text || "").toLowerCase();
  for (var i = 0; i < list.length; i++) {
    if (t.indexOf(list[i]) !== -1) return list[i];
  }
  return null;
}

/* input:
     {
       prompt: string,
       images: [{ role }],   // role optional; used to detect subject+scene
       imageCount: number    // fallback when images[] not supplied
     }
   returns { modelId, reason } */
function resolve(input) {
  input = input || {};
  var prompt = input.prompt || "";
  var images = input.images || [];
  var count = images.length || input.imageCount || 0;
  var hasPrompt = !!prompt.trim();

  var posterHit = _hit(prompt, POSTER_TEXT_HINTS);
  var editHit = _hit(prompt, LOCAL_EDIT_HINTS);
  var fullSceneHit = _hit(prompt, FULL_SCENE_HINTS);

  // Poster / visible-text intent wins whenever the model can take the images.
  if (posterHit && count <= 4) {
    return { modelId: "gpt-image-2", reason: 'Poster or visible-text request detected ("' + posterHit + '")' };
  }

  // No image → creative text-to-image.
  if (count === 0) {
    if (posterHit) return { modelId: "gpt-image-2", reason: "Text-to-image with visible text" };
    return { modelId: "flux-2-dev", reason: "Creative prompt with no input image" };
  }

  // Complex full-scene edit → Nano Banana Pro.
  if (fullSceneHit) {
    return { modelId: "nano-banana-pro", reason: 'Complex full-scene edit detected ("' + fullSceneHit + '")' };
  }

  // Many reference images → Nano Banana 2.
  if (count >= 3) {
    return { modelId: "nano-banana-2", reason: count + " reference images detected" };
  }

  // Two images: subject + scene reference → Nano Banana 2.
  if (count === 2) {
    return { modelId: "nano-banana-2", reason: "One subject + one scene reference" };
  }

  // One image + local edit instruction → Qwen Image 2.0 Pro.
  if (count === 1) {
    if (editHit) {
      return { modelId: "qwen-image-2-pro", reason: 'Single-image local edit ("' + editHit + '")' };
    }
    // one image, no explicit local-edit verb → treat as reference-guided edit
    if (hasPrompt) {
      return { modelId: "nano-banana-2", reason: "Single reference image with instruction" };
    }
    return { modelId: "qwen-image-2-pro", reason: "Single input image" };
  }

  // Fallback.
  return { modelId: "nano-banana-2", reason: "Default multi-purpose model" };
}

/* Resolve, validating the chosen model can actually take the inputs; if not,
   fall back to Nano Banana 2 which has the broadest capability envelope. */
function resolveSafe(input) {
  var r = resolve(input);
  var m = registry.getModel(r.modelId);
  var count = (input && (input.images ? input.images.length : input.imageCount)) || 0;
  if (m && count > m.capabilities.maxImages) {
    return {
      modelId: "nano-banana-2",
      reason: r.reason + " — routed to Nano Banana 2 for " + count + " references"
    };
  }
  if (m && count === 0 && !m.capabilities.textToImage) {
    return { modelId: "flux-2-dev", reason: "Text-to-image fallback" };
  }
  return r;
}

var API = { resolve: resolve, resolveSafe: resolveSafe };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.autoModelSelector = API; }
})();
