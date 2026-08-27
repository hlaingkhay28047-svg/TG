/* ============================================================
   HNK AI Tools — Free Generate State
   Spec §5 (Image Slot System) · §6 (Prompt) · §16 (Mode Separation)

   The Free Generate mode owns its own state object, fully separate from the
   Workflow state. Workflow hidden prompts and protection rules must NEVER leak
   in here (spec §16, §28). This module is a pure state container + reducers —
   no DOM, no network — so it can be unit-tested and reused by the controller.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var IMAGE_INPUT_SOURCES = ["active-layer", "file", "paste", "web-link"];

/* Slot roles (spec §5). Role is OPTIONAL; when unset the input order is used. */
var SLOT_ROLES = [
  "main", "subject", "face", "background", "style",
  "pose", "lighting", "color", "product", "text", "other"
];

var DEFAULT_MAX_SLOTS = 8;

function defaultState() {
  return {
    images: [],              // [{ id, source, role, ref, valid }]
    prompt: "",
    negativePrompt: "",
    modelId: "auto",
    size: "2k",
    ratio: "auto",
    quality: "high",
    variants: 1,
    advanced: {
      creativity: 0.5,
      referenceStrength: 0.7,
      editStrength: 0.4,
      instructionStrictness: "balanced", // relaxed|balanced|strict
      seed: null,                        // null = random
      preserveFace: false,
      preserveComposition: false,
      preserveOutfit: false,
      addAsNewLayer: true,
      fitToCanvas: true,
      createResultGroup: true
    }
  };
}

var _slotSeq = 0;
function _slotId() { _slotSeq += 1; return "slot_" + _slotSeq; }

function makeSlot(opts) {
  opts = opts || {};
  return {
    id: opts.id || _slotId(),
    source: opts.source || "file",   // one of IMAGE_INPUT_SOURCES
    role: opts.role || (opts.first ? "main" : "other"),
    ref: opts.ref || null,           // provider-agnostic handle (path/token/dataURL/url)
    valid: opts.valid !== false,
    reason: opts.reason || null      // set only on a failed capture (image-import-service)
  };
}

/* ---- Reducers (return the mutated state for chaining/testing) ---- */

function setPrompt(state, text) {
  state.prompt = String(text == null ? "" : text).slice(0, 20000);
  return state;
}

function setNegativePrompt(state, text) {
  state.negativePrompt = String(text == null ? "" : text).slice(0, 20000);
  return state;
}

function addImage(state, opts) {
  var first = state.images.length === 0;
  var slot = makeSlot(Object.assign({ first: first }, opts || {}));
  state.images.push(slot);
  return slot;
}

function removeImage(state, slotId) {
  state.images = state.images.filter(function (s) { return s.id !== slotId; });
  // If the main image was removed, promote the first remaining slot.
  if (state.images.length && !state.images.some(function (s) { return s.role === "main"; })) {
    state.images[0].role = "main";
  }
  return state;
}

function setImageRole(state, slotId, role) {
  if (SLOT_ROLES.indexOf(role) === -1) return state;
  for (var i = 0; i < state.images.length; i++) {
    if (state.images[i].id === slotId) { state.images[i].role = role; break; }
  }
  return state;
}

function clearImages(state) { state.images = []; return state; }

/* Spec §6: Clear resets ONLY the prompt workspace — never model/size/ratio/
   quality/theme/api-key/history. */
function clearPrompt(state) { state.prompt = ""; state.negativePrompt = ""; return state; }

function setModel(state, modelId) { state.modelId = modelId || "auto"; return state; }
function setSize(state, size) { state.size = String(size).toLowerCase(); return state; }
function setRatio(state, ratio) { state.ratio = ratio; return state; }
function setQuality(state, q) { state.quality = q; return state; }
function setVariants(state, n) {
  n = n | 0;
  state.variants = (n === 1 || n === 2 || n === 4) ? n : 1;
  return state;
}
function setAdvanced(state, patch) {
  state.advanced = Object.assign({}, state.advanced, patch || {});
  return state;
}

/* Deep-ish clone for draft save / restore (spec §16, §26 "Reload plugin"). */
function snapshot(state) { return JSON.parse(JSON.stringify(state)); }
function restore(snap) {
  var s = defaultState();
  if (snap && typeof snap === "object") {
    s = Object.assign(s, JSON.parse(JSON.stringify(snap)));
    s.advanced = Object.assign(defaultState().advanced, snap.advanced || {});
  }
  return s;
}

var API = {
  IMAGE_INPUT_SOURCES: IMAGE_INPUT_SOURCES,
  SLOT_ROLES: SLOT_ROLES,
  DEFAULT_MAX_SLOTS: DEFAULT_MAX_SLOTS,
  defaultState: defaultState,
  makeSlot: makeSlot,
  setPrompt: setPrompt,
  setNegativePrompt: setNegativePrompt,
  addImage: addImage,
  removeImage: removeImage,
  setImageRole: setImageRole,
  clearImages: clearImages,
  clearPrompt: clearPrompt,
  setModel: setModel,
  setSize: setSize,
  setRatio: setRatio,
  setQuality: setQuality,
  setVariants: setVariants,
  setAdvanced: setAdvanced,
  snapshot: snapshot,
  restore: restore
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.freeGenerateState = API; }
})();
