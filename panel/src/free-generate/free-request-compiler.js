/* ============================================================
   HNK AI Tools — Free Generate Request Compiler
   Spec §11 (state machine) · §20 (Request Compilation)

   Compiles the Free Generate state into a provider-agnostic request. NO
   workflow rules, NO hidden prompt, NO protection instructions are ever added
   here (spec §16, §28) — only what the user typed and selected. Preservation
   toggles are surfaced as plain prompt-level instructions, exactly as the spec
   requires (§10: "Preservation toggles are prompt instructions").
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var validator = _req("./free-generate-validator") || (globalThis.HNK && globalThis.HNK.freeGenerateValidator);
var resolver = _req("../models/capability-resolver") || (globalThis.HNK && globalThis.HNK.capabilityResolver);

/* Preservation toggles become soft prompt instructions (spec §10). They ask the
   model to retain identity/composition/outfit; they do not guarantee pixels. */
function _preservationInstructions(adv) {
  var out = [];
  if (!adv) return out;
  if (adv.preserveFace) out.push("retain the subject's facial identity");
  if (adv.preserveComposition) out.push("keep the original composition and framing");
  if (adv.preserveOutfit) out.push("keep the subject's outfit unchanged");
  return out;
}

function compile(state, opts) {
  opts = opts || {};
  state = state || {};
  var rm = validator.resolveModel(state);
  var validImages = (state.images || []).filter(function (im) { return im && im.valid !== false; });

  var effectivePrompt = state.prompt || "";
  var preserve = _preservationInstructions(state.advanced);
  if (preserve.length) {
    effectivePrompt = (effectivePrompt ? effectivePrompt + "\n\n" : "") +
      "Preserve: " + preserve.join(", ") + ".";
  }

  var effectiveSize = resolver.clampSize(rm.modelId, state.size || "2k");
  var variants = state.variants || 1;

  return {
    mode: "free-generate",
    prompt: effectivePrompt,
    userPrompt: state.prompt || "",
    negativePrompt: state.negativePrompt || "",
    images: validImages.map(function (im, i) {
      return { index: i, source: im.source, role: im.role || "other", ref: im.ref };
    }),
    model: rm.modelId,
    modelResolvedFromAuto: rm.auto,
    modelReason: rm.reason,
    output: {
      size: effectiveSize,
      requestedSize: (state.size || "2k").toLowerCase(),
      ratio: state.ratio || "auto",
      quality: state.quality || "high",
      variants: variants
    },
    // N separate requests when the endpoint has no batch support (spec §9)
    requestCount: resolver.requestCountForVariants(rm.modelId, variants),
    controls: Object.assign({}, state.advanced || {})
  };
}

var API = { compile: compile };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.freeRequestCompiler = API; }
})();
