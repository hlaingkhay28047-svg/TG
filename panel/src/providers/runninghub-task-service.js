/* ============================================================
   HNK AI Tools — RunningHub Task Service (openapi/v2)
   Spec §17 (Submit Task · Poll Status · Download Result) · §12 · §13

   Submits a task to a model's fixed apiPath, polls the single `query`
   endpoint to completion (its success response already carries the result
   URLs — openapi/v2 has no separate "outputs" call, unlike the old
   Enterprise ai-app scheme this replaced) and downloads the result. All I/O
   goes over an injected `transport`, with an injected `sleep` and `now` so
   the poll loop is testable without real time. Honours an AbortSignal for
   cancel (spec §13) and a poll timeout (spec §12).

   RunningHub's openapi/v2 has no confirmed cancel endpoint (the companion
   web app never needed one either), so cancel here is client-side only: the
   poll loop stops immediately on abort, but the task may keep running
   server-side. That is an honest, documented limitation rather than a call
   to an invented endpoint.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _url(cfg, path) { return (cfg.baseUrl || "").replace(/\/+$/, "") + path; }
function _err(code, status, body) { var e = new Error(code); e.code = code; e.status = status; e.body = body; return e; }
// Parse the JSON body whether the response succeeded or failed — a failed
// submit/query still carries the server's own error text (bad param,
// offline node, wrong endpoint path), which the normalizer needs to show
// the user something more useful than a bare status code (ported from the
// web app's rhV2Submit, which always parses before checking r.ok).
async function _safeJson(resp) { try { return await resp.json(); } catch (e) { return null; } }

function _headers(apiKey) { return { "Content-Type": "application/json", "Accept": "application/json", "Authorization": "Bearer " + apiKey }; }

function _postJson(deps, apiKey, path, payload) {
  return deps.transport({
    method: "POST",
    url: _url(deps.cfg, path),
    headers: _headers(apiKey),
    body: JSON.stringify(payload),
    signal: deps.signal
  });
}

/* Submit -> taskId. `path` is "openapi/v2/" + the model's apiPath. */
async function submit(deps, apiKey, apiPath, body) {
  var resp = await deps.transport({
    method: "POST",
    url: _url(deps.cfg, "/openapi/v2/" + String(apiPath || "").replace(/^\/+/, "")),
    headers: _headers(apiKey),
    body: JSON.stringify(body || {}),
    signal: deps.signal
  });
  var json = resp ? await _safeJson(resp) : null;
  if (!resp || !resp.ok) throw _err("submit-failed", resp && resp.status, json);
  var taskId = json && json.taskId;
  if (!taskId) throw _err("submit-failed", 200, json);
  return taskId;
}

/* One query probe -> the full response body ({ taskId, status, results? }). */
async function query(deps, apiKey, taskId) {
  var resp = await _postJson(deps, apiKey, deps.cfg.paths.query, { taskId: taskId });
  var json = resp ? await _safeJson(resp) : null;
  if (!resp || !resp.ok) throw _err("query-failed", resp && resp.status, json);
  return json || {};
}

/* Poll to a terminal state. onTick(elapsedMs, status) fires each loop for the
   progress UI (spec §12). Aborts immediately on signal; throws "timeout" past
   the ceiling. Returns the final SUCCESS response body (carries `.results`). */
async function pollUntilDone(deps, apiKey, taskId, onTick) {
  var cfg = deps.cfg;
  var sleep = deps.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var now = deps.now || function () { return 0; };
  var start = now();
  while (true) {
    if (deps.signal && deps.signal.aborted) throw _err("cancelled", 0, null);
    var json = await query(deps, apiKey, taskId);
    var s = String(json.status || "").toUpperCase();
    var elapsed = now() - start;
    if (typeof onTick === "function") onTick(elapsed, s);
    if (s === "SUCCESS") return json;
    if (s === "FAILED") throw _err("failed", 0, json);
    if (elapsed >= cfg.pollTimeoutMs) throw _err("timeout", 0, null);
    await sleep(cfg.pollIntervalMs);
  }
}

/* Best-effort client-side cancel (spec §13 step 4) — see file header: no
   confirmed server-side cancel endpoint exists for openapi/v2, so this is
   intentionally a no-op that never calls the network. */
async function cancelTask(deps, apiKey, taskId) { /* no-op — see header */ }

/* Download an output URL into a data-URL ref via the transport. Result URLs
   from `query` are already public (valid ~24h), so this is an unauthenticated
   GET — no Authorization header. */
async function download(deps, url) {
  var resp = await deps.transport({ method: "GET", url: url, headers: { "Accept": "image/*" }, signal: deps.signal, binary: true });
  if (!resp || !resp.ok) throw _err("download-failed", resp && resp.status, resp);
  if (resp.dataUrl) return resp.dataUrl;          // transport already encoded
  var text = await resp.text();
  return text; // caller may pass a transport that returns a data URL as text
}

var API = { submit: submit, query: query, pollUntilDone: pollUntilDone, cancelTask: cancelTask, download: download };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubTaskService = API; }
})();
