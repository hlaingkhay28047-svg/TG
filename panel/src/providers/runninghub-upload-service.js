/* ============================================================
   HNK AI Tools — RunningHub Upload Service (openapi/v2)
   Spec §17 (Adapter: Upload Images)

   Uploads a slot's image ref (a data URL) to RunningHub's Standard Model API
   and returns the file's public URL to reference in the submit body. All I/O
   goes through an injected `transport`, so this is unit-testable with a fake
   and holds no fetch/UXP specifics.

   Auth is a Bearer token header (not a body field, unlike the old Enterprise
   ai-app scheme this replaced) — see runninghub-config.js.

   transport(req) -> Promise<{ ok, status, json(): Promise<any>, text(): Promise<string> }>
   req = { method, url, headers, body, signal }
   For uploads, body is a structured multipart descriptor the real transport
   converts to FormData: { multipart: true, file: { fieldName, name, dataUrl } }.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _url(cfg, path) { return (cfg.baseUrl || "").replace(/\/+$/, "") + path; }

function _err(status, body) {
  var e = new Error("upload failed"); e.status = status; e.body = body; return e;
}
// See runninghub-task-service.js's identical helper — parses the JSON body
// on both success and failure so a failed upload still surfaces the
// server's own error text instead of a bare status code.
async function _safeJson(resp) { try { return await resp.json(); } catch (e) { return null; } }

/* v6.6.3 — NAME THE UPLOAD BY WHAT IT ACTUALLY IS. Every ref used to go up
   as "hnk_<i>.png" because this service was written when only photos passed
   through it. Video Tools, Video Upscale and Talking Photo now send clips and
   recordings the same way, so a student's .mov arrived named .png and a .wav
   arrived named .png — a container the filename denies, rejected after the
   submit was already charged. The data URL carries the real type; the name
   follows it, and anything unrecognised stays .png, which is what it was. */
var UPLOAD_EXT = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "video/x-m4v": "m4v", "video/m4v": "m4v", "video/x-msvideo": "avi", "video/avi": "avi",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg"
};
function _uploadName(ref, index) {
  var m = /^data:([^;,]+)/i.exec(String(ref || ""));
  return "hnk_" + (index || 0) + "." + (UPLOAD_EXT[String((m && m[1]) || "").toLowerCase()] || "png");
}

/* deps = { transport, cfg, signal }. Returns the uploaded file's URL. */
async function upload(deps, apiKey, imageRef, index) {
  var cfg = deps.cfg;
  var resp = await deps.transport({
    method: "POST",
    url: _url(cfg, cfg.paths.upload),
    headers: { "Authorization": "Bearer " + apiKey, "Accept": "application/json" },
    body: {
      multipart: true,
      file: { fieldName: "file", name: _uploadName(imageRef, index), dataUrl: imageRef }
    },
    signal: deps.signal
  });
  var json = resp ? await _safeJson(resp) : null;
  if (!resp || !resp.ok) throw _err(resp && resp.status, json);
  // RunningHub returns { code, data: { download_url | fileName } }.
  var url = json && json.data && (json.data.download_url || json.data.fileName);
  if (!url) throw _err(200, json);
  if (!/^https?:\/\//i.test(url)) url = (cfg.baseUrl || "").replace(/\/+$/, "") + "/" + String(url).replace(/^\/+/, "");
  return url;
}

/* Upload many refs, preserving order. Fails fast on the first error so the
   adapter can normalize + abort (spec §13 cleanup happens at the adapter). */
async function uploadAll(deps, apiKey, imageRefs, onProgress) {
  var out = [];
  for (var i = 0; i < imageRefs.length; i++) {
    if (typeof onProgress === "function") onProgress(i, imageRefs.length);
    out.push(await upload(deps, apiKey, imageRefs[i], i));
  }
  return out;
}

var API = { upload: upload, uploadAll: uploadAll, uploadName: _uploadName };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubUploadService = API; }
})();
