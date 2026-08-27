/* ============================================================
   HNK AI Tools — Result Group Service
   Spec §14 (Add to Photoshop)

   Default behavior: add the result as a NEW layer, fit to canvas, centered,
   keep the original visible, and name the layer with the model + timestamp:
       HNK Free Generate — Nano Banana 2 — 07:42
   For multiple variants, create a group and name each child:
       HNK Free Generate Results
       ├── Variant 1 … └── Variant N

   Placement geometry comes from canvas-fit-service; host performs the actual
   layer creation. Both are injected/tested so this logic runs without Photoshop.
   Time is passed in (hh:mm) — the module never calls Date, matching the repo's
   testability conventions.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var fit = _CJS ? require("./canvas-fit-service") : globalThis.HNK.canvasFitService;
var registry = _CJS ? require("../models/model-registry") : globalThis.HNK.modelRegistry;

function modelName(modelId) {
  var m = registry.getModel(modelId);
  return m ? m.displayName : (modelId || "AI");
}

/* "HNK Free Generate — Nano Banana 2 — 07:42" (mode label configurable). */
function layerName(modelId, timeLabel, prefix) {
  prefix = prefix || "HNK Free Generate";
  var parts = [prefix, modelName(modelId)];
  if (timeLabel) parts.push(String(timeLabel));
  return parts.join(" — ");
}

/* Add a single result. deps:
     { host, result:{ ref, width, height }, modelId, canvas:{width,height},
       timeLabel, fitMode }  */
function addResult(deps) {
  deps = deps || {};
  var host = deps.host;
  if (!host || !host.placeAsLayer) return { ok: false, reason: "no-host" };
  var bounds = fit.computeFit(deps.result || {}, deps.canvas || { width: 1024, height: 1024 }, deps.fitMode || "fit");
  var name = layerName(deps.modelId, deps.timeLabel);
  var placed = host.placeAsLayer({ ref: (deps.result || {}).ref, name: name, bounds: bounds });
  return { ok: !!placed, layer: placed, name: name, bounds: bounds };
}

/* Add N variants grouped (spec §14). deps:
     { host, results:[{ref,width,height}], modelId, canvas, timeLabel, fitMode,
       groupName } */
function addVariants(deps) {
  deps = deps || {};
  var host = deps.host;
  var results = deps.results || [];
  if (!host || !host.placeAsLayer) return { ok: false, reason: "no-host" };

  // Single result → just a named layer, no group (spec §14).
  if (results.length <= 1) {
    return { ok: true, group: null, layers: [addResult({
      host: host, result: results[0], modelId: deps.modelId, canvas: deps.canvas,
      timeLabel: deps.timeLabel, fitMode: deps.fitMode
    })] };
  }

  var groupName = deps.groupName || "HNK Free Generate Results";
  var group = host.createGroup ? host.createGroup(groupName) : null;
  var layers = [];
  for (var i = 0; i < results.length; i++) {
    var bounds = fit.computeFit(results[i] || {}, deps.canvas || { width: 1024, height: 1024 }, deps.fitMode || "fit");
    var name = "Variant " + (i + 1);
    var placed = host.placeAsLayer({ ref: (results[i] || {}).ref, name: name, bounds: bounds, group: group });
    layers.push({ ok: !!placed, layer: placed, name: name, bounds: bounds });
  }
  return { ok: true, group: group, groupName: groupName, layers: layers };
}

var API = {
  modelName: modelName,
  layerName: layerName,
  addResult: addResult,
  addVariants: addVariants
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.resultGroupService = API; }
})();
