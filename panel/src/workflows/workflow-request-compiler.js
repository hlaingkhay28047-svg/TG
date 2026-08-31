/* ============================================================
   HNK AI Tools — Smart Workflow Request Compiler
   Spec §20 + self-contained button rule.

   Compiles the workflow state into a provider-agnostic request. The workflow's
   FULL protected prompt (base + reference-transfer rules + subject locks) and
   its negative prompt travel with the request — self-contained, no external
   guard. If the state wasn't staged (Direct-Generate mode), the protected
   prompt is assembled on the fly from the registry. None of this ever crosses
   into Free Generate (enforced by the mode controller, spec §16).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var registry = _req("./workflow-registry") || (globalThis.HNK && globalThis.HNK.workflowRegistry);
var resolver = _req("../models/capability-resolver") || (globalThis.HNK && globalThis.HNK.capabilityResolver);

function _collect(list) {
  return (list || [])
    .filter(function (s) { return s.image && s.image.ref; })
    .map(function (s) { return { key: s.key, role: s.role, source: s.image.source, ref: s.image.ref }; });
}

function compile(state) {
  var wf = registry.get(state && state.workflowId);
  if (!wf) return null;

  // Prefer the staged (prepared) prompt; else assemble it now (Direct Generate).
  var prompt = state.compiledPrompt;
  var negative = state.negativePrompt;
  var rules = state.protectionRules;
  if (!prompt) {
    var c = registry.compile(wf.id, state.fieldVals) || {};
    prompt = c.prompt; negative = c.negativePrompt; rules = c.rules;
  }
  /* v6.35.0 — design fields resolve at the moment of generation, so a
     staged prompt can never carry stale toggle/text/colour choices. */
  if (wf.fields && wf.fields.length) {
    var cf = registry.compile(wf.id, state.fieldVals) || {};
    if (cf.prompt) { prompt = cf.prompt; negative = negative || cf.negativePrompt; rules = rules || cf.rules; }
  }

  /* The screen's optional typed instruction: without it, object-edit and
     text-logo told the model to perform "the requested edit" while no
     request existed anywhere in the payload. */
  if (state.userText) prompt += "\nUSER REQUEST: " + state.userText;

  var route = state.resolvedRoute || wf.route;
  // Output comes from the shared, preserved prefs — with sane fallbacks only.
  var out = Object.assign({ size: "2k", ratio: "source", quality: "high" }, state.output || {});
  var size = resolver.clampSize(route.modelId, out.size);

  var requiredImages = _collect(state.requiredInputs);
  var optionalImages = _collect(state.optionalInputs);
  return {
    mode: "smart-workflow",
    workflowId: wf.id,
    regionBounds: state.regionBounds || null,
    compiledPrompt: prompt,
    negativePrompt: negative || "",
    requiredImages: requiredImages,
    optionalImages: optionalImages,
    /* flat list the provider adapter uploads (first = main image, rest = refs) —
       the adapter reads request.images; without this a workflow run uploads nothing */
    images: requiredImages.concat(optionalImages),
    workflowProtectionRules: (rules || []).slice(),
    model: route.modelId,
    modelResolvedFromAuto: !!route.auto,
    output: {
      size: size,
      requestedSize: out.size,
      ratio: out.ratio,
      quality: out.quality,
      variants: 1
    }
  };
}

var API = { compile: compile };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowRequestCompiler = API; }
})();
