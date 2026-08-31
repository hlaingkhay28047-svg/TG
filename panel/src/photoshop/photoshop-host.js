/* ============================================================
   HNK AI Tools — Photoshop Host Adapter (reference implementation)
   Implements the host interface the Phase-5 services depend on, against the
   real UXP / Photoshop APIs. The SERVICES carry the tested logic (validation,
   fit math, naming, grouping); this adapter only performs host I/O.

   Confidence map (be honest with the reader):
     ✓ tested-shape, low risk : hasActiveDocument, readImageFile, fetchImageUrl
     ⚠ needs in-panel verify   : captureActiveLayer, placeAsLayer, createGroup
                                 (batchPlay/imaging graphics ops — cannot be run
                                  outside Photoshop; wrapped so any failure
                                  surfaces as a normalized error, never a
                                  silent no-op).
   v6.9.0: placeAsLayer is REAL — the proven main.js placeResultToPS sequence
   (temp file → createSessionToken → batchPlay placeEvent → scale/translate →
   rename), generalized with group + white layer-mask support for the
   non-destructive masked-group standard (masked-place-service). The v6.8.0
   fake `{placed:true}` descriptor is gone.
   A `ref` is a data URL ("data:image/png;base64,…") so it round-trips through
   state, history and the request compiler without holding native handles.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _ps() { try { return require("photoshop"); } catch (e) { return null; } }
function _uxp() { try { return require("uxp"); } catch (e) { return null; } }

// v6.19: captureActiveLayer/placeAsLayer's catch blocks call \ for
// diagnostic logging, but nothing in this module declares it — it silently
// depended on legacy main.js having already run and left a global // behind (typeof-guarded, so it never crashed, just silently dropped the
// log on any load order where main.js hadn't run first). Give this module
// its own fallback so the diagnostic path doesn't depend on load order.
function _herr(msg, err) {
  try {
    if (typeof globalThis !== "undefined" && globalThis.HNK && typeof globalThis.HNK.herr === "function") {
      globalThis.HNK.herr(msg, err); return;
    }
  } catch (e) {}
  try { console.error("[HNK]", msg, err); } catch (e2) {}
}

function _bytesToBase64(bytes) {
  var bin = "";
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  // btoa exists in the UXP webview; fall back to Buffer under Node tests.
  if (typeof btoa === "function") return btoa(bin);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  return "";
}

function _guessMime(name) {
  var n = (name || "").toLowerCase();
  if (/\.png$/.test(n)) return "image/png";
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.webp$/.test(n)) return "image/webp";
  return "image/png";
}

/* ---- confident: active document present ---- */
function hasActiveDocument() {
  var ps = _ps();
  try { return !!(ps && ps.app && ps.app.documents && ps.app.documents.length > 0); }
  catch (e) { return false; }
}

/* ---- confident: canvas dimensions for fit-to-canvas placement (spec §14) ---- */
function canvasSize() {
  var ps = _ps();
  try {
    var d = ps && ps.app && ps.app.activeDocument;
    if (d) return { width: d.width | 0, height: d.height | 0 };
  } catch (e) {}
  return { width: 1024, height: 1024 };
}

/* ---- confident: read a chosen file into a data-URL ref ---- */
async function readImageFile(file) {
  try {
    if (!file || !file.read) return null;
    var buf = await file.read({ format: (_uxp() && _uxp().storage.formats.binary) || undefined });
    var bytes = new Uint8Array(buf);
    var ref = "data:" + _guessMime(file.name) + ";base64," + _bytesToBase64(bytes);
    return { ref: ref, width: 0, height: 0 };
  } catch (e) { return null; }
}

/* ---- confident: open the OS image picker and return the chosen file ----
   v6.27.0 — the AI Tools slots gained the classic tabs' File source, and the
   screens are host-agnostic, so the picker lives here. Returns the UXP file
   entry (readImageFile then reads it) or null on cancel / no UXP host. The
   two-step types fallback mirrors main.js pickAnyFile: some hosts reject a
   typeless call, others reject the types array. ---- */
async function pickImageFile() {
  var uxp = _uxp();
  var lfs = uxp && uxp.storage && uxp.storage.localFileSystem;
  if (!lfs || !lfs.getFileForOpening) return null;
  try {
    return await lfs.getFileForOpening({ allowMultiple: false });
  } catch (e) {
    try {
      return await lfs.getFileForOpening({ allowMultiple: false, types: ["png", "jpg", "jpeg", "webp"] });
    } catch (e2) { return null; }
  }
}

/* ---- confident: fetch a web image into a data-URL ref ---- */
async function fetchImageUrl(url) {
  try {
    var resp = await fetch(url);
    if (!resp || !resp.ok) return null;
    var ct = (resp.headers && resp.headers.get && resp.headers.get("content-type")) || "";
    if (ct && ct.indexOf("image/") !== 0) return null; // not an image
    var ab = await resp.arrayBuffer();
    var bytes = new Uint8Array(ab);
    var ref = "data:" + (ct || "image/png") + ";base64," + _bytesToBase64(bytes);
    return { ref: ref, width: 0, height: 0 };
  } catch (e) { return null; }
}

/* ---- needs in-panel verify: clipboard image ---- */
async function readClipboardImage() {
  // UXP clipboard image support varies by host version; treat as unavailable
  // until verified in-panel so the slot falls back cleanly (spec §5).
  return null;
}

/* ---- needs in-panel verify: capture the active layer as an image ref ----
   Export the active layer's pixels to PNG bytes. Wrapped so any failure returns
   null and the import service reports "no-active-layer" instead of crashing. */
async function captureActiveLayer() {
  var ps = _ps();
  if (!ps || !hasActiveDocument()) return null;
  try {
    var imaging = ps.imaging;
    var doc = ps.app.activeDocument;
    var layer = doc.activeLayers && doc.activeLayers[0];
    var pix = await imaging.getPixels({ layerID: layer && layer.id });
    var jpg = await imaging.encodeImageData({ imageData: pix.imageData, base64: true });
    if (pix.imageData && pix.imageData.dispose) pix.imageData.dispose();
    return { ref: "data:image/jpeg;base64," + jpg, width: pix.width || 0, height: pix.height || 0 };
  } catch (e) {
    _herr("captureActiveLayer failed", e);
    return null;
  }
}

/* ---- v6.36.0: the active RECTANGULAR selection's bounds, or null ----
   batchPlay get of the document's selection property; pixels. A missing
   selection resolves null so region-edit can say "select first" honestly. */
async function getSelectionBounds() {
  var ps = _ps();
  if (!ps || !hasActiveDocument()) return null;
  try {
    var r = await ps.action.batchPlay([{
      _obj: "get",
      _target: [{ _property: "selection" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
      _options: { dialogOptions: "dontDisplay" }
    }], { synchronousExecution: false });
    var sel = r && r[0] && r[0].selection;
    if (!sel || sel.top == null) return null;
    var v = function (x) { return Math.round(Number(x && x._value != null ? x._value : x) || 0); };
    var top = v(sel.top), left = v(sel.left), bottom = v(sel.bottom), right = v(sel.right);
    if (right - left < 8 || bottom - top < 8) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  } catch (e) { return null; }
}

/* ---- v6.36.0: capture the document COMPOSITE inside bounds ----
   getPixels with sourceBounds sees the flattened view — a region edit must
   work on what the eye sees, not one layer. */
async function captureRegion(bounds) {
  var ps = _ps();
  if (!ps || !hasActiveDocument() || !bounds) return null;
  try {
    var imaging = ps.imaging;
    var pix = await imaging.getPixels({
      sourceBounds: { left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height }
    });
    var jpg = await imaging.encodeImageData({ imageData: pix.imageData, base64: true });
    if (pix.imageData && pix.imageData.dispose) pix.imageData.dispose();
    return { ref: "data:image/jpeg;base64," + jpg, width: bounds.width, height: bounds.height };
  } catch (e) {
    _herr("captureRegion failed", e);
    return null;
  }
}

/* ---- data-URL ("data:image/png;base64,…") -> bytes, UXP-safe ---- */
function _dataUrlToBytes(ref) {
  var m = /^data:([^;,]+)?(?:;base64)?,(.*)$/.exec(String(ref || ""));
  if (!m) return null;
  var b64 = m[2] || "";
  try {
    if (typeof atob === "function") {
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return { bytes: out, mime: m[1] || "image/png" };
    }
    if (typeof Buffer !== "undefined") {
      var buf = Buffer.from(b64, "base64");
      return { bytes: new Uint8Array(buf), mime: m[1] || "image/png" };
    }
  } catch (e) {}
  return null;
}

/* ---- feature-detect the layer-mask batchPlay path (masked-group standard).
   The masked-place-service degrades to a plain layer when this is false. ---- */
function supportsLayerMask() {
  var ps = _ps();
  return !!(ps && ps.core && typeof ps.core.executeAsModal === "function" &&
    ps.action && typeof ps.action.batchPlay === "function");
}

/* ---- needs in-panel verify: create a layer group ----
   Async + rejection-safe: a failed modal resolves to null so callers degrade
   to a plain layer instead of crashing (masked-place-service contract). */
function createGroup(name) {
  var ps = _ps();
  if (!ps) return null;
  try {
    return ps.core.executeAsModal(async function () {
      var g = await ps.app.activeDocument.createLayerGroup({ name: name });
      return g;
    }, { commandName: "HNK: create result group" }).catch(function () { return null; });
  } catch (e) { return null; }
}

/* ---- v6.9.0 REAL: place an image ref as a new layer (spec §14) ----
   opts: { ref (data URL), name, bounds|null, group|null, mask:boolean }
   Sequence (port of main.js placeResultToPS, generalized):
     1. decode data URL -> write a fixed temp file in the plugin data folder
     2. createSessionToken + batchPlay "placeEvent" (never a dialog)
     3. rename; scale/translate to opts.bounds — or self-fit (contain) into the
        document when bounds are unknown (0×0 results must never collapse)
     4. move into opts.group when given (PLACEINSIDE)
     5. white reveal-all layer mask when opts.mask (shared descriptor)
   Returns { id, name, placed:true, grouped, masked, bounds } or null. */
async function placeAsLayer(opts) {
  var ps = _ps();
  var uxp = _uxp();
  if (!ps || !uxp || !opts || !opts.ref) return null;
  try {
    var decoded = _dataUrlToBytes(opts.ref);
    if (!decoded) return null;
    var lfs = uxp.storage.localFileSystem;
    var formats = uxp.storage.formats;
    var folder = null;
    try { folder = await lfs.getTemporaryFolder(); } catch (e0) {}
    if (!folder) folder = await lfs.getDataFolder();
    var ext = /jpe?g/.test(decoded.mime) ? "jpg" : "png";
    // one fixed filename (overwrite) so the data folder never grows unbounded
    var file = await folder.createFile("hnk_aitools_place." + ext, { overwrite: true });
    await file.write(decoded.bytes.buffer, { format: formats.binary });
    var token = lfs.createSessionToken(file);

    var out = await ps.core.executeAsModal(async function () {
      var batchPlay = ps.action.batchPlay;
      await batchPlay([{
        _obj: "placeEvent",
        ID: 1,
        "null": { _path: token, _kind: "local" },
        freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
        _options: { dialogOptions: "dontDisplay" }
      }], {});
      var doc = ps.app.activeDocument;
      var ls = doc.activeLayers;
      var lyr = ls && ls.length ? ls[0] : null;
      if (!lyr) return null;
      try { lyr.name = opts.name || "HNK Result"; } catch (eN) {}

      var grouped = false, masked = false;
      var C = ps.constants;
      try {
        var b = lyr.bounds;
        var lw = Number(b.right) - Number(b.left);
        var lh = Number(b.bottom) - Number(b.top);
        var tgt = opts.bounds;
        if (!(tgt && tgt.width > 8 && tgt.height > 8)) {
          // self-fit (contain, never upscale) into the document
          var dw = Number(doc.width), dh = Number(doc.height);
          var s0 = (lw > 0 && lh > 0) ? Math.min(dw / lw, dh / lh, 1) : 1;
          tgt = {
            x: Math.round((dw - lw * s0) / 2), y: Math.round((dh - lh * s0) / 2),
            width: Math.round(lw * s0), height: Math.round(lh * s0)
          };
        }
        if (lw > 0 && lh > 0) {
          var sPct = (tgt.width / lw) * 100;
          if (Math.abs(sPct - 100) > 0.5) {
            await lyr.scale(sPct, sPct, C && C.AnchorPosition ? C.AnchorPosition.MIDDLECENTER : undefined);
          }
          b = lyr.bounds;
          var cx = (Number(b.left) + Number(b.right)) / 2;
          var cy = (Number(b.top) + Number(b.bottom)) / 2;
          var dx = (tgt.x + tgt.width / 2) - cx;
          var dy = (tgt.y + tgt.height / 2) - cy;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) await lyr.translate(dx, dy);
        }
      } catch (eF) { /* fit is best-effort; the layer is already placed */ }

      if (opts.group) {
        try {
          await lyr.move(opts.group, C.ElementPlacement.PLACEINSIDE);
          grouped = true;
        } catch (eG) { grouped = false; }
      }
      if (opts.mask) {
        try {
          var mps = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.maskedPlaceService : null;
          var selD = mps ? mps.selectLayerDescriptor(lyr.id)
            : { _obj: "select", _target: [{ _ref: "layer", _id: lyr.id }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } };
          var seq = [];
          /* v6.36.0 — region-edit: re-make the user's rectangle and cut the
             mask FROM it, so every pixel outside the selection is the
             original layer showing through — by construction, not by hope. */
          if (opts.maskSelection && opts.bounds && mps && mps.rectSelectDescriptor) {
            seq.push(mps.rectSelectDescriptor(opts.bounds));
            seq.push(selD);
            seq.push(mps.maskDescriptor("revealSelection"));
          } else {
            seq.push(selD);
            seq.push(mps ? mps.maskDescriptor()
              : { _obj: "make", "new": { _class: "channel" }, at: { _ref: "channel", _enum: "channel", _value: "mask" }, using: { _enum: "userMaskEnabled", _value: "revealAll" }, _options: { dialogOptions: "dontDisplay" } });
          }
          await batchPlay(seq, {});
          masked = true;
        } catch (eM) { masked = false; }
      }
      return { id: lyr.id, name: opts.name, placed: true, grouped: grouped, masked: masked, bounds: opts.bounds || null };
    }, { commandName: "HNK: add result layer" });
    return out || null;
  } catch (e) {
    _herr("placeAsLayer failed", e);
    return null;
  }
}

var API = {
  hasActiveDocument: hasActiveDocument,
  canvasSize: canvasSize,
  readImageFile: readImageFile,
  pickImageFile: pickImageFile,
  fetchImageUrl: fetchImageUrl,
  readClipboardImage: readClipboardImage,
  captureActiveLayer: captureActiveLayer,
  supportsLayerMask: supportsLayerMask,
  createGroup: createGroup,
  placeAsLayer: placeAsLayer,
  getSelectionBounds: getSelectionBounds,
  captureRegion: captureRegion
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.photoshopHost = API; }
})();
