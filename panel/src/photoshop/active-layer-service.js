/* ============================================================
   HNK AI Tools — Active Layer Service
   Spec §5 ("Use Active Photoshop Layer")

   Small host-injected helper the UI uses to (a) know whether the "Use Active
   Layer" slot source should be offered, and (b) capture the active layer as a
   slot image. Capture is delegated to the image-import service so there is one
   normalization path.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var importSvc = _CJS ? require("./image-import-service") : globalThis.HNK.imageImportService;

/* host.hasActiveDocument() -> boolean */
function isAvailable(host) {
  try { return !!(host && host.hasActiveDocument && host.hasActiveDocument()); }
  catch (e) { return false; }
}

function capture(host) { return importSvc.fromActiveLayer(host); }

var API = { isAvailable: isAvailable, capture: capture };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.activeLayerService = API; }
})();
