/* ============================================================
   HNK AI Tools — Free Generate State Machine
   Spec §11 (Generate State Machine) · §12 (Progress) · §13 (Cancel)

   IDLE -> VALIDATING -> PREPARING_IMAGES -> UPLOADING -> BUILDING_REQUEST
        -> SUBMITTING -> PROCESSING -> DOWNLOADING_RESULT -> READY
   Error states: ERROR, CANCELLED, TIMEOUT.

   This is a pure transition table + guard, deliberately separate from the
   Workflow mode's machine (spec §11). It carries no timers or network — the
   controller drives transitions; the machine only enforces legal moves and
   exposes the human-facing stage label (§12: known stages only, no fake %).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var STAGES = [
  "IDLE", "VALIDATING", "PREPARING_IMAGES", "UPLOADING", "BUILDING_REQUEST",
  "SUBMITTING", "PROCESSING", "DOWNLOADING_RESULT", "READY"
];
var TERMINAL = ["READY", "ERROR", "CANCELLED", "TIMEOUT"];

var NEXT = {
  IDLE: "VALIDATING",
  VALIDATING: "PREPARING_IMAGES",
  PREPARING_IMAGES: "UPLOADING",
  UPLOADING: "BUILDING_REQUEST",
  BUILDING_REQUEST: "SUBMITTING",
  SUBMITTING: "PROCESSING",
  PROCESSING: "DOWNLOADING_RESULT",
  DOWNLOADING_RESULT: "READY"
};

var LABELS = {
  IDLE: "Ready to generate",
  VALIDATING: "Checking your request",
  PREPARING_IMAGES: "Preparing images",
  UPLOADING: "Uploading references",
  BUILDING_REQUEST: "Building request",
  SUBMITTING: "Submitting request",
  PROCESSING: "Generating the image",
  DOWNLOADING_RESULT: "Downloading result",
  READY: "Done",
  ERROR: "Something went wrong",
  CANCELLED: "Generation cancelled",
  TIMEOUT: "Timed out"
};

function create() {
  return { stage: "IDLE", startedAt: null, error: null };
}

function isTerminal(stage) { return TERMINAL.indexOf(stage) !== -1; }

function label(stage) { return LABELS[stage] || stage; }

/* Advance one step along the happy path. now() is injected so the machine has
   no dependency on Date (matching the repo's testability conventions). */
function advance(m, now) {
  if (m.stage === "IDLE") m.startedAt = (typeof now === "number") ? now : null;
  var nxt = NEXT[m.stage];
  if (!nxt) return m; // already terminal or unknown
  m.stage = nxt;
  return m;
}

function fail(m, err) { m.stage = "ERROR"; m.error = err || "error"; return m; }

/* Cancel (spec §13): stop, do NOT ingest late results, keep prompt/images. */
function cancel(m) {
  if (isTerminal(m.stage)) return m;
  m.stage = "CANCELLED";
  return m;
}

function timeout(m) {
  if (isTerminal(m.stage)) return m;
  m.stage = "TIMEOUT";
  return m;
}

function reset(m) { m.stage = "IDLE"; m.startedAt = null; m.error = null; return m; }

/* A late result must be ignored once cancelled/timed out (spec §13 step 3). */
function acceptsResult(m) { return m.stage === "DOWNLOADING_RESULT" || m.stage === "PROCESSING"; }

var API = {
  STAGES: STAGES,
  TERMINAL: TERMINAL,
  create: create,
  isTerminal: isTerminal,
  label: label,
  advance: advance,
  fail: fail,
  cancel: cancel,
  timeout: timeout,
  reset: reset,
  acceptsResult: acceptsResult
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.generateStateMachine = API; }
})();
