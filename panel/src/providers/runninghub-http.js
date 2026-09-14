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
/* v6.80.0 — ONE CEILING WAS NOT ENOUGH. The 60 s above applied alike to a
   200-byte query, to a reference upload and to the finished picture's
   download. On the owner's line (2026-09-09: "အင်တာနက်ကမကောင်းဘူး ခနခနကျတယ်")
   a 2K/4K result can take longer than that to arrive, and the abort came
   back as a bare AbortError, which the normalizer read as a dead line —
   "Could not reach RunningHub Enterprise" after the task had already been
   paid for. Three budgets now: the JSON calls keep 60 s; an upload gets 60 s
   plus its own bytes at 20 KB/s (a 1536-px layer capture is ~400 KB → 80 s;
   capped at 8 min); a binary download gets 3 min. And when it is OUR timer
   that fired, the throw says so — code "timeout", which every friendly path
   already translates — while the caller's own Stop stays "cancelled", and
   any other failure keeps its message and learns the host it was talking
   to (a host the manifest does not allow is the one failure the message
   alone cannot name). */
var UPLOAD_BYTES_PER_MS = 20;          /* 20 KB/s — a poor mobile uplink */
var UPLOAD_MAX_TIMEOUT_MS = 480000;
var DOWNLOAD_TIMEOUT_MS = 180000;

function _hostOf(url) { var m = /^https?:\/\/([^\/?#]+)/i.exec(String(url || "")); return m ? m[1].toLowerCase() : ""; }
function _kindOf(req) {
  if (req && req.body && typeof req.body === "object" && req.body.multipart) return "upload";
  if (req && req.binary) return "download";
  return "json";
}
function _uploadBytes(req) {
  var n = 0, b = req && req.body;
  if (!b || typeof b !== "object") return 0;
  if (b.file && b.file.dataUrl) n += String(b.file.dataUrl).length;
  if (Array.isArray(b.files)) b.files.forEach(function (f) { if (f && f.dataUrl) n += String(f.dataUrl).length; });
  return Math.round(n * 0.75);   /* base64 → bytes */
}
/* The ceiling for one request. An explicit opts.timeoutMs (tests, tools)
   stays a flat ceiling for every kind, exactly as before. */
function budgetFor(req, opts) {
  if (opts && opts.timeoutMs) return opts.timeoutMs;
  var kind = _kindOf(req);
  if (kind === "upload") return Math.min(UPLOAD_MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS + Math.round(_uploadBytes(req) / UPLOAD_BYTES_PER_MS));
  if (kind === "download") return DOWNLOAD_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

function create(opts) {
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
        // Multiple files under a repeated field name.
        if (Array.isArray(req.body.files)) {
          req.body.files.forEach(function (fl) {
            if (fl && fl.dataUrl) fd.append(fl.fieldName || "file", _dataUrlToBlob(fl.dataUrl), fl.name || "file.png");
          });
        }
        init.body = fd;
        delete init.headers["Content-Type"]; // let fetch set the boundary
      }
    }
    var kind = _kindOf(req), host = _hostOf(req.url), timeoutMs = budgetFor(req, opts);
    var timeoutCtrl = new AbortController(), ours = false;
    var timer = setTimeout(function () { ours = true; timeoutCtrl.abort(); }, timeoutMs);
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
    } catch (e) {
      if (ours) throw Object.assign(new Error("timeout after " + Math.round(timeoutMs / 1000) + "s (" + kind + (host ? " · " + host : "") + ")"), { code: "timeout", kind: kind, host: host });
      if (req.signal && req.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled", kind: kind, host: host });
      try { if (e && typeof e === "object") { e.kind = kind; e.host = host; } } catch (x) { }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

var API = { create: create, budgetFor: budgetFor, hostOf: _hostOf, kindOf: _kindOf };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubHttp = API; }
})();
