/* ============================================================
   HNK AI Tools — Masked Place Service (v6.9.0 "Results are real")
   Blueprint §5 plugin v6.9.0 · §3.4-note (non-destructive masked-group
   standard) · audit item #4.

   THE ONE shared helper for the professional, non-destructive delivery of a
   generated result into the open Photoshop document:

       HNK — <feature>              (layer group)
       └── <result layer>  [white reveal-all layer mask]
       …original layers untouched beneath…

   Every placement path routes through here:
     - AI Tools (Free Generate + 9 Smart Workflows) via bootstrap.js
       -> placeResults() (drives the host adapter end-to-end)
     - Classic panel (Prompt/Studio place, Create "Send to PS", Web import)
       via main.js placeResultToPS()
       -> groupNameFor() + maskDescriptor() + selectLayerDescriptor()
          (main.js owns its own modal scope and DOM-API layer motion)

   Capability rules (feature-detected, never assumed):
     - no group support  -> plain named layer (honest "plain" outcome)
     - no mask support   -> grouped but unmasked (outcome says so)
     - nothing placeable -> { ok:false, reason } — callers surface the reason,
       never a silent no-op (the v6.8.0 stub bug this wave kills).
   Pure logic (naming, capability detection, outcome classification) is fully
   unit-testable without Photoshop; only the injected host touches UXP.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var fit = _CJS ? require("./canvas-fit-service") : globalThis.HNK.canvasFitService;
var resultGroup = _CJS ? require("./result-group-service") : globalThis.HNK.resultGroupService;

/* "HNK — Free Generate", "HNK — BG Replace", "HNK — Prompt" … */
function groupNameFor(feature) {
  var f = String(feature || "Result").trim() || "Result";
  return "HNK — " + f;
}

/* batchPlay descriptor: white (reveal-all) layer mask on the ACTIVE layer.
   Shared verbatim by the host adapter and main.js so the two paths can never
   drift apart. */
function maskDescriptor() {
  return {
    _obj: "make",
    "new": { _class: "channel" },
    at: { _ref: "channel", _enum: "channel", _value: "mask" },
    using: { _enum: "userMaskEnabled", _value: "revealAll" },
    _options: { dialogOptions: "dontDisplay" }
  };
}

/* batchPlay descriptor: make a specific layer the active one (so the mask
   lands on the result layer, not on the group it was just moved into). */
function selectLayerDescriptor(layerId) {
  return {
    _obj: "select",
    _target: [{ _ref: "layer", _id: layerId }],
    makeVisible: false,
    _options: { dialogOptions: "dontDisplay" }
  };
}

/* Feature-detect what this host can actually do. Degrade, never crash. */
function capabilities(host) {
  var canPlace = !!(host && typeof host.placeAsLayer === "function");
  var canGroup = !!(host && typeof host.createGroup === "function");
  var canMask = false;
  try {
    if (host && typeof host.supportsLayerMask === "function") canMask = !!host.supportsLayerMask();
  } catch (e) { canMask = false; }
  return { canPlace: canPlace, canGroup: canGroup, canMask: canMask };
}

/* Classify what actually happened so status messages stay honest.
   -> "masked-group" | "group-only" | "plain-layer" | "failed" */
function outcomeOf(placeResult) {
  if (!placeResult || !placeResult.ok) return "failed";
  if (placeResult.grouped && placeResult.masked) return "masked-group";
  if (placeResult.grouped) return "group-only";
  return "plain-layer";
}

/* Place 1..N results the non-destructive way. deps:
     { host, results:[{ref,width,height}], feature, modelId,
       canvas:{width,height}, timeLabel, fitMode }
   Sequential (never parallel modal scopes). Returns:
     { ok, group, groupName, layers:[{ok,layer,name,bounds}],
       grouped, masked, outcome } */
async function placeResults(deps) {
  deps = deps || {};
  var host = deps.host;
  var results = deps.results || [];
  var caps = capabilities(host);
  if (!caps.canPlace) return { ok: false, reason: "no-host", outcome: "failed" };
  if (!results.length) return { ok: false, reason: "no-results", outcome: "failed" };

  var gName = groupNameFor(deps.feature);
  var group = null;
  if (caps.canGroup) {
    try { group = await host.createGroup(gName); } catch (e) { group = null; }
  }

  var layers = [];
  var anyOk = false, allMasked = true;
  for (var i = 0; i < results.length; i++) {
    var r = results[i] || {};
    // Only trust bounds computed from REAL dimensions; a 0×0 result would
    // otherwise "fit" to a 1px box. The host self-fits when bounds are null.
    var bounds = (r.width > 0 && r.height > 0)
      ? fit.computeFit(r, deps.canvas || { width: 1024, height: 1024 }, deps.fitMode || "fit")
      : null;
    var name = results.length > 1
      ? ("Variant " + (i + 1))
      : resultGroup.layerName(deps.modelId, deps.timeLabel, "HNK " + String(deps.feature || "Result"));
    var placed = null;
    try {
      placed = await host.placeAsLayer({ ref: r.ref, name: name, bounds: bounds, group: group, mask: caps.canMask });
    } catch (e) { placed = null; }
    var okOne = !!placed;
    anyOk = anyOk || okOne;
    if (!okOne || !placed.masked) allMasked = false;
    layers.push({ ok: okOne, layer: placed, name: name, bounds: bounds });
  }

  var res = {
    ok: anyOk,
    group: group,
    groupName: group ? gName : null,
    layers: layers,
    grouped: !!group,
    masked: anyOk && allMasked && caps.canMask
  };
  res.outcome = outcomeOf(res);
  return res;
}

var API = {
  groupNameFor: groupNameFor,
  maskDescriptor: maskDescriptor,
  selectLayerDescriptor: selectLayerDescriptor,
  capabilities: capabilities,
  outcomeOf: outcomeOf,
  placeResults: placeResults
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.maskedPlaceService = API; }
})();
