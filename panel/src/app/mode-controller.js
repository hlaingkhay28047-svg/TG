/* ============================================================
   HNK AI Tools — Mode Controller (Free Generate <-> Smart Workflow)
   Spec §16 (Mode Separation Rules) · §28 (Final Product Rule)

   The two modes keep fully separate state. This controller owns both and
   enforces the hard rule that their prompts, image requirements, validation and
   hidden instructions NEVER cross:

     Free Generate -> Workflow : free prompt + free image slots stay saved;
                                 workflow slots are separate; no auto image copy.
     Workflow -> Free Generate : the workflow hidden prompt must NOT enter the
                                 free prompt; workflow locks cleared; the saved
                                 Free Generate draft is restored untouched.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var freeState = _req("../free-generate/free-generate-state") || (globalThis.HNK && globalThis.HNK.freeGenerateState);
var wfState = _req("../workflows/workflow-state") || (globalThis.HNK && globalThis.HNK.workflowState);

function create() {
  return {
    activeMode: "free-generate",        // or "smart-workflow"
    freeGenerate: freeState.defaultState(),
    workflow: wfState.defaultState(),
    // preserved Free Generate draft snapshot, restored on return
    _freeDraft: null
  };
}

function switchToWorkflow(ctrl) {
  if (ctrl.activeMode === "smart-workflow") return ctrl;
  // Save the Free Generate draft so nothing is lost (spec §16).
  ctrl._freeDraft = freeState.snapshot(ctrl.freeGenerate);
  ctrl.activeMode = "smart-workflow";
  // Free Generate state remains intact in ctrl.freeGenerate; workflow state is
  // separate and untouched by Free Generate. No image copying occurs.
  return ctrl;
}

function switchToFreeGenerate(ctrl) {
  if (ctrl.activeMode === "free-generate") return ctrl;
  // Clear ONLY workflow-owned state — its hidden prompt and locks must not leak.
  wfState.reset(ctrl.workflow);
  // Restore the previously saved Free Generate draft exactly as it was.
  if (ctrl._freeDraft) {
    ctrl.freeGenerate = freeState.restore(ctrl._freeDraft);
    ctrl._freeDraft = null;
  }
  ctrl.activeMode = "free-generate";
  return ctrl;
}

/* Explicit, user-initiated hand-off of a Free Generate result INTO a workflow,
   or a workflow image into Free Generate. This is the ONLY sanctioned way an
   image crosses modes (spec §14 "Send to Workflow", §5 "unless user requests").
   Prompts / hidden instructions are never carried across. */
function sendImageToWorkflow(ctrl, workflowId, inputKey, imageSlot) {
  wfState.selectWorkflow(ctrl.workflow, workflowId);
  wfState.setInput(ctrl.workflow, inputKey, imageSlot ? {
    source: imageSlot.source, role: imageSlot.role, ref: imageSlot.ref, valid: imageSlot.valid !== false
  } : null);
  ctrl.activeMode = "smart-workflow";
  ctrl._freeDraft = ctrl._freeDraft || freeState.snapshot(ctrl.freeGenerate);
  return ctrl;
}

/* Assertion helper used by tests (spec §26): the free prompt must never equal
   or contain a workflow's hidden prompt after a round-trip. */
function assertNoLeak(ctrl, hiddenPrompt) {
  var fp = (ctrl.freeGenerate.prompt || "");
  if (hiddenPrompt && fp.indexOf(hiddenPrompt) !== -1) {
    throw new Error("Mode leak: workflow hidden prompt entered Free Generate");
  }
  return true;
}

var API = {
  create: create,
  switchToWorkflow: switchToWorkflow,
  switchToFreeGenerate: switchToFreeGenerate,
  sendImageToWorkflow: sendImageToWorkflow,
  assertNoLeak: assertNoLeak
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.modeController = API; }
})();
