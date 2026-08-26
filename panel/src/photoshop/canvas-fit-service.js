/* ============================================================
   HNK AI Tools — Canvas Fit Service
   Spec §10 (Fit to Canvas) · §14 (Add to Photoshop: fit + center)

   Pure geometry — no host calls — so it is fully unit-testable. Computes where
   and at what scale a generated image should be placed on the document canvas:
     - "fit"    : contain the image within the canvas, preserving aspect ratio,
                  centered (never upscales past 1:1 unless allowUpscale).
     - "center" : keep native size, centered (may overflow — the caller clips).
     - "cover"  : fill the canvas, preserving aspect ratio, centered (crops).
   Returns integer pixel bounds { x, y, width, height, scale } with the origin
   at the canvas top-left.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _int(n) { return Math.round(n); }

function computeFit(image, canvas, mode, opts) {
  opts = opts || {};
  mode = mode || "fit";
  var iw = Math.max(1, (image && image.width) | 0);
  var ih = Math.max(1, (image && image.height) | 0);
  var cw = Math.max(1, (canvas && canvas.width) | 0);
  var ch = Math.max(1, (canvas && canvas.height) | 0);

  var scale;
  if (mode === "center") {
    scale = 1;
  } else if (mode === "cover") {
    scale = Math.max(cw / iw, ch / ih);
  } else { // fit / contain
    scale = Math.min(cw / iw, ch / ih);
    if (!opts.allowUpscale && scale > 1) scale = 1; // never enlarge past native
  }

  var w = _int(iw * scale);
  var h = _int(ih * scale);
  var x = _int((cw - w) / 2);
  var y = _int((ch - h) / 2);

  return { x: x, y: y, width: w, height: h, scale: scale };
}

/* Convenience: does the placed image fully fit inside the canvas? */
function fitsInside(bounds, canvas) {
  if (!bounds || !canvas) return false;
  return bounds.x >= 0 && bounds.y >= 0 &&
    bounds.x + bounds.width <= canvas.width &&
    bounds.y + bounds.height <= canvas.height;
}

var API = { computeFit: computeFit, fitsInside: fitsInside };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.canvasFitService = API; }
})();
