/* ============================================================
   HNK AI Tools — RunningHub HTTP transport (fetch-based)
   The single place that touches fetch / FormData / base64. The adapter, upload
   and task services stay transport-agnostic and fully testable; this thin
   factory adapts the injected-transport contract to the browser/UXP `fetch`.

   transport(req) -> Promise<{ ok, status, json(), text(), dataUrl? }>
   req = { method, url, headers, body, signal, binary }
     - body may be a string (JSON) or a multipart descriptor
       { multipart:true, fields:{}, file:{ name, dataUrl } }.
     - binary GETs resolve `dataUrl` with the fetched bytes as a data URL.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _dataUrlToBlob(dataUrl) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
  var mime = m ? m[1] : "application/octet-stream";
  var b64 = m ? m[2] : "";
  var bin = (typeof atob === "function") ? atob(b64) : (typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("binary") : "");
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function _bytesToDataUrl(bytes, mime) {
  var bin = "", chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  var b64 = (typeof btoa === "function") ? btoa(bin) : (typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : "");
  return "data:" + (mime || "image/png") + ";base64," + b64;
}

/* v6.21 — every fetch() here used to carry only the caller's own OPT-IN
   cancel signal, with no client-side timeout at all. A stalled connection
   (dead proxy, a VPN that drops packets without resetting the socket) left
   fetch() pending indefinitely; nothing ever threw, so runViaProvider's
   `finally` (bootstrap.js) never ran and the Generate button stayed stuck
   mid-spinner with no way to recover short of reloading the panel. Race
   every request against a bounded internal timeout — still honoring the
   caller's own signal for genuine user-triggered cancel. */
var DEFAULT_TIMEOUT_MS = 60000;

function create(opts) {
  var timeoutMs = (opts && opts.timeoutMs) || DEFAULT_TIMEOUT_MS;
  return async function transport(req) {
    var init = { method: req.method || "GET", headers: Object.assign({}, req.headers || {}) };
    if (req.body != null) {
      if (typeof req.body === "string") {
        init.body = req.body;
      } else if (req.body.multipart) {
        var fd = new FormData();
        var f = req.body.fields || {};
        for (var k in f) if (f.hasOwnProperty(k)) fd.append(k, f[k]);
        if (req.body.file && req.body.file.dataUrl) fd.append(req.body.file.fieldName || "file", _dataUrlToBlob(req.body.file.dataUrl), req.body.file.name || "file.png");
        // Multiple files under a repeated field name (e.g. OpenAI's "image[]").
        if (Array.isArray(req.body.files)) {
          req.body.files.forEach(function (fl) {
            if (fl && fl.dataUrl) fd.append(fl.fieldName || "file", _dataUrlToBlob(fl.dataUrl), fl.name || "file.png");
          });
        }
        init.body = fd;
        delete init.headers["Content-Type"]; // let fetch set the boundary
      }
    }
    var timeoutCtrl = new AbortController();
    var timer = setTimeout(function () { timeoutCtrl.abort(); }, timeoutMs);
    if (req.signal) {
      if (req.signal.aborted) timeoutCtrl.abort();
      else req.signal.addEventListener("abort", function () { timeoutCtrl.abort(); });
    }
    init.signal = timeoutCtrl.signal;
    try {
      var resp = await fetch(req.url, init);
      var out = {
        ok: resp.ok, status: resp.status,
        json: function () { return resp.json(); },
        text: function () { return resp.text(); }
      };
      if (req.binary && resp.ok) {
        var ab = await resp.arrayBuffer();
        var ct = (resp.headers && resp.headers.get && resp.headers.get("content-type")) || "image/png";
        out.dataUrl = _bytesToDataUrl(new Uint8Array(ab), ct);
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  };
}

var API = { create: create };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubHttp = API; }
})();
