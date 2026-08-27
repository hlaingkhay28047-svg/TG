/* ============================================================
   HNK AI Tools — core module barrel
   Aggregates the Free Generate / Smart Workflow logical core so a single
   require (Node/tests) or a single <script> (UXP) exposes the whole API under
   HNK.*. UI/Photoshop wiring lives outside this core (see docs/SPEC_*.md).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }

var core = {
  modelRegistry: _req("./models/model-registry"),
  capabilityResolver: _req("./models/capability-resolver"),
  autoModelSelector: _req("./models/auto-model-selector"),
  freeGenerateState: _req("./free-generate/free-generate-state"),
  freeGenerateValidator: _req("./free-generate/free-generate-validator"),
  freeRequestCompiler: _req("./free-generate/free-request-compiler"),
  generateStateMachine: _req("./free-generate/generate-state-machine"),
  workflowRegistry: _req("./workflows/workflow-registry"),
  workflowState: _req("./workflows/workflow-state"),
  workflowValidator: _req("./workflows/workflow-validator"),
  workflowRequestCompiler: _req("./workflows/workflow-request-compiler"),
  modeController: _req("./app/mode-controller"),
  errorNormalizer: _req("./providers/runninghub-error-normalizer")
};

if (typeof module !== "undefined" && module.exports) module.exports = core;
else {
  globalThis.HNK = globalThis.HNK || {};
  for (var k in core) { if (core.hasOwnProperty(k) && core[k]) globalThis.HNK[k] = core[k]; }
}
})();
