/* ============================================================
   HNK — Smart Workflow results (v6.83.0)

   The owner photographed panel 6.153.0: a Smart Workflow run ended with a
   green "Done." and a layer in Photoshop, and the wizard showed nothing of
   what it had made — no result picture, no Before | After, no history of
   the runs before it. Freeform has all three (the app's wizard has the
   result view and the results board); this is the wizard's own record.

   One session store, newest first, capped: every successful run records
   what went in (IMAGE 1, the "before") and what came out (each result,
   the "after") with the prompt that made it, so the wizard can show the
   latest, compare it with the photograph the student gave, re-place it,
   chain it back into IMAGE 1, or hand it to Freeform. It holds data: URLs
   in memory only — the gallery folder keeps the files across restarts,
   the history service keeps the sanitized request; nothing here persists
   and nothing here is ever a key or a token.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var CAP = 24;
var _list = [];
var _subs = [];
var _seq = 0;

function _notify(why) {
  for (var i = 0; i < _subs.length; i++) { try { _subs[i](why || "change"); } catch (e) { } }
}

function _isDataImage(ref) { return /^data:image\//.test(String(ref || "")); }

/* record({ workflowId, before, after, prompt, model, ratio, size, timeLabel, promptEdited })
   → the stored entry, or null when there is no picture to keep. */
function record(r) {
  r = r || {};
  if (!_isDataImage(r.after)) return null;
  _seq += 1;
  var e = {
    id: "wr_" + Date.now() + "_" + _seq,
    workflowId: String(r.workflowId || ""),
    before: _isDataImage(r.before) ? String(r.before) : "",
    after: String(r.after),
    prompt: String(r.prompt || ""),
    promptEdited: !!r.promptEdited,
    model: String(r.model || ""),
    ratio: String(r.ratio || ""),
    size: String(r.size || ""),
    timeLabel: String(r.timeLabel || ""),
    /* v6.84.0 — a Selection Edit result remembers the rectangle it was cut
       from, so "Place into Photoshop again" lands it there under the same
       mask, and the compare can say "Selection" instead of "IMAGE 1". */
    regionBounds: (r.regionBounds && r.regionBounds.width > 0 && r.regionBounds.height > 0)
      ? { x: Number(r.regionBounds.x) || 0, y: Number(r.regionBounds.y) || 0, width: Number(r.regionBounds.width), height: Number(r.regionBounds.height) }
      : null,
    inputSource: String(r.inputSource || ""),
    ts: Date.now()
  };
  _list.unshift(e);
  while (_list.length > CAP) _list.pop();
  _notify("record");
  return e;
}

function list(workflowId) {
  if (!workflowId) return _list.slice();
  return _list.filter(function (e) { return e.workflowId === workflowId; });
}
function latest(workflowId) { var l = list(workflowId); return l.length ? l[0] : null; }
function get(id) { for (var i = 0; i < _list.length; i++) if (_list[i].id === id) return _list[i]; return null; }
function remove(id) {
  var n = _list.length;
  _list = _list.filter(function (e) { return e.id !== id; });
  if (_list.length !== n) { _notify("remove"); return true; }
  return false;
}
function clear(workflowId) {
  if (!workflowId) _list = [];
  else _list = _list.filter(function (e) { return e.workflowId !== workflowId; });
  _notify("clear");
}
function subscribe(fn) {
  if (typeof fn !== "function") return function () { };
  _subs.push(fn);
  return function () { _subs = _subs.filter(function (f) { return f !== fn; }); };
}

var API = { record: record, list: list, latest: latest, get: get, remove: remove, clear: clear, subscribe: subscribe, CAP: CAP };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.wfResults = API; }
})();
