/* ============================================================
   HNK AI Tools — Smart Workflow State (staged, self-contained)
   Spec §15 · §16 + the staged Smart-Workflow-Button interaction rule.

   Staged interaction on a single button:
     Click 1  -> select: show the workflow's explanation + required images
                 (stage "explained").
     Click 2  -> prepare: clear previous workflow-owned state, LOAD the
                 workflow's protected prompt, validate inputs (stage "prepared";
                 the screen highlights missing slots and shows green when ready).
     Next     -> generate.
   A global Direct-Generate mode may skip straight to generate when all required
   inputs are already valid.

   Switching workflows clears ONLY workflow-owned state — the shared output
   preferences (size/ratio/quality) are NEVER reset here (spec rule: switching
   must not reset model/resolution/ratio/quality/language/theme/keys).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var registry = _req("./workflow-registry") || (globalThis.HNK && globalThis.HNK.workflowRegistry);

function defaultState() {
  return {
    workflowId: null,
    workflowStage: "idle",   // idle | explained | prepared | generating
    explained: false,
    prepared: false,
    requiredInputs: [],      // [{ key, label, role, image|null }]
    optionalInputs: [],
    compiledPrompt: "",      // loaded on prepare (Click 2)
    negativePrompt: "",
    protectionRules: [],
    validation: {},
    resolvedRoute: null,
    fieldVals: {},           // v6.35.0 — per-workflow design fields (text/colour/toggles)
    output: {}               // shared prefs — set by the app, preserved on switch
  };
}

/* Click 1 — select a workflow: show its explanation, load its input slots.
   Does NOT touch output (shared pref). Does NOT load the prompt yet. */
function selectWorkflow(state, workflowId) {
  var wf = registry.get(workflowId);
  if (!wf) return state;
  // clear only workflow-owned fields (keep output/prefs)
  state.workflowId = wf.id;
  state.workflowStage = "explained";
  state.explained = true;
  state.prepared = false;
  state.requiredInputs = wf.requiredInputs.map(function (r) { return { key: r.key, label: r.label, role: r.role, image: null }; });
  state.optionalInputs = wf.optionalInputs.map(function (r) { return { key: r.key, label: r.label, role: r.role, image: null }; });
  state.compiledPrompt = "";
  state.negativePrompt = "";
  state.protectionRules = [];
  state.userText = "";
  /* v6.35.0 — design fields start at the workflow's own defaults */
  state.fieldVals = {};
  (wf.fields || []).forEach(function (f) { state.fieldVals[f.key] = f.type === "toggle" ? f.default !== false : (f.default || ""); });
  state.validation = {};
  state.resolvedRoute = wf.route ? Object.assign({}, wf.route) : null;
  return state;
}

/* Click 2 — prepare: load the workflow's full protected prompt + negatives. */
function prepare(state) {
  if (!state.workflowId) return state;
  var c = registry.compile(state.workflowId, state.fieldVals);
  if (c) {
    state.compiledPrompt = c.prompt;
    state.negativePrompt = c.negativePrompt;
    state.protectionRules = c.rules || [];
  }
  state.prepared = true;
  state.workflowStage = "prepared";
  return state;
}

/* Optional typed instruction from the workflow screen (object edits, text
   wording, watermark targets). Travels with the protected prompt at compile. */
function setUserText(state, text) {
  state.userText = String(text == null ? "" : text).slice(0, 2000);
  return state;
}

function setInput(state, key, image) {
  var lists = [state.requiredInputs, state.optionalInputs];
  for (var l = 0; l < lists.length; l++) {
    for (var i = 0; i < lists[l].length; i++) {
      if (lists[l][i].key === key) { lists[l][i].image = image || null; return state; }
    }
  }
  return state;
}

/* Set the shared output preferences (size/ratio/quality). Called by the app
   from persisted settings; workflows never reset this. */
/* v6.35.0 — one design field changed on the screen */
function setField(state, key, val) {
  if (!state.fieldVals) state.fieldVals = {};
  state.fieldVals[key] = val;
  return state;
}

function setOutput(state, output) { state.output = Object.assign({}, state.output, output || {}); return state; }

/* Leaving workflow mode: clear workflow-owned state but KEEP output prefs. */
function reset(state) {
  var keepOutput = state.output || {};
  var fresh = defaultState();
  for (var k in fresh) { if (fresh.hasOwnProperty(k)) state[k] = fresh[k]; }
  state.output = keepOutput;
  return state;
}

var API = {
  defaultState: defaultState,
  selectWorkflow: selectWorkflow,
  prepare: prepare,
  setInput: setInput,
  setField: setField,
  setOutput: setOutput,
  setUserText: setUserText,
  reset: reset
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowState = API; }
})();
