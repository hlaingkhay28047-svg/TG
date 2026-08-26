/* ============================================================
   HNK AI Tools — Preset Service
   Spec §23 (Preset System)

   A Free Generate preset stores prompt/negative/model/size/ratio/quality/
   variants/advancedSettings. Images are NOT embedded by default; an optional
   flag remembers the image ROLE LAYOUT only (not the pixels). Persistence uses
   the same injected `store` contract as the history service.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var KEY = "hnk_presets";

/* Build a preset from a Free Generate state (spec §23). Images excluded unless
   opts.rememberImageRoles — and then only their role layout, never pixels. */
function fromState(name, state, opts) {
  opts = opts || {};
  state = state || {};
  var preset = {
    name: String(name || "Untitled"),
    prompt: state.prompt || "",
    negativePrompt: state.negativePrompt || "",
    modelId: state.modelId || "auto",
    size: state.size || "2k",
    ratio: state.ratio || "auto",
    quality: state.quality || "high",
    variants: state.variants || 1,
    advancedSettings: Object.assign({}, state.advanced || {})
  };
  if (opts.rememberImageRoles) {
    preset.imageRoles = (state.images || []).map(function (im) { return im.role || "other"; });
  }
  return preset;
}

/* Apply a preset onto a Free Generate state IN PLACE. Never touches images
   unless the preset carries a role layout AND the caller opts in. Returns the
   state for chaining. */
function applyTo(state, preset, opts) {
  opts = opts || {};
  if (!state || !preset) return state;
  state.prompt = preset.prompt || "";
  state.negativePrompt = preset.negativePrompt || "";
  state.modelId = preset.modelId || "auto";
  state.size = preset.size || "2k";
  state.ratio = preset.ratio || "auto";
  state.quality = preset.quality || "high";
  state.variants = preset.variants || 1;
  state.advanced = Object.assign({}, state.advanced || {}, preset.advancedSettings || {});
  // Images are intentionally left untouched (spec §23: not embedded by default).
  return state;
}

function create(store) {
  function _read() {
    try { var v = store && store.get(KEY); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function _write(list) { try { store && store.set(KEY, list); } catch (e) {} }

  function save(preset) {
    var list = _read();
    var i = -1;
    for (var j = 0; j < list.length; j++) if (list[j].name === preset.name) { i = j; break; }
    if (i >= 0) list[i] = preset; else list.push(preset);
    _write(list);
    return preset;
  }
  function list() { return _read(); }
  function get(name) { var l = _read(); for (var i = 0; i < l.length; i++) if (l[i].name === name) return l[i]; return null; }
  function remove(name) { _write(_read().filter(function (p) { return p.name !== name; })); }

  return { save: save, list: list, get: get, remove: remove };
}

var API = { create: create, fromState: fromState, applyTo: applyTo, KEY: KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.presetService = API; }
})();
