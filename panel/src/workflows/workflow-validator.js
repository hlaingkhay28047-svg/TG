/* ============================================================
   HNK AI Tools — Smart Workflow Validator
   Spec §15 (Required Images / Ready state)

   A workflow is ready to generate only when every required input has a valid
   image. Reports which inputs are still missing so the UI can show the
   "Missing" markers and gate the Prepare/Generate buttons.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var registry = _req("./workflow-registry") || (globalThis.HNK && globalThis.HNK.workflowRegistry);
var resolver = _req("../models/capability-resolver") || (globalThis.HNK && globalThis.HNK.capabilityResolver);

function evaluate(state) {
  if (!state || !state.workflowId) {
    return { ready: false, missing: [], reasons: [{ code: "no-workflow", message: "Select a workflow first." }] };
  }
  var missing = [];
  var reasons = [];
  var req = state.requiredInputs || [];
  for (var i = 0; i < req.length; i++) {
    var r = req[i];
    var img = r.image;
    if (!img || img.valid === false || !img.ref) missing.push(r.label);
  }
  if (missing.length) {
    reasons.push({ code: "missing-inputs", message: "Add: " + missing.join(", "), data: { missing: missing } });
  }

  // capability sanity against the resolved route
  var wf = registry.get(state.workflowId);
  var totalImages = req.filter(function (r) { return r.image && r.image.ref; }).length +
    (state.optionalInputs || []).filter(function (r) { return r.image && r.image.ref; }).length;
  if (wf && state.resolvedRoute) {
    var cap = resolver.validate(state.resolvedRoute.modelId, {
      imageCount: totalImages,
      size: state.output && state.output.size,
      ratio: state.output && state.output.ratio
    });
    for (var j = 0; j < cap.errors.length; j++) reasons.push(cap.errors[j]);
  }

  return { ready: missing.length === 0 && reasons.length === 0, missing: missing, reasons: reasons };
}

var API = { evaluate: evaluate };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowValidator = API; }
})();
