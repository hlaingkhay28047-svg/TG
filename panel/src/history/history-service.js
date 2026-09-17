/* ============================================================
   HNK AI Tools — History Service
   Spec §22 (History Screen)

   Stores a capped, mode-tagged history of generations. Entries are SANITIZED
   before storage — the spec forbids keeping API keys, full provider auth
   responses or temporary upload tokens (§22). Persistence is delegated to an
   injected `store` ({ get(key), set(key, value) }) so this is unit-testable and
   works the same in the UXP data folder or an in-memory map.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var registry = _CJS ? require("../models/model-registry") : globalThis.HNK.modelRegistry;

var KEY = "hnk_history";
var CAP = 50;

/* Fields that must NEVER be persisted (spec §22). */
var FORBIDDEN = ["apiKey", "key", "auth", "authorization", "token", "uploadToken",
  "credentials", "secret", "bearer"];

function _stripSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  var out = {};
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    var low = k.toLowerCase();
    var bad = false;
    for (var i = 0; i < FORBIDDEN.length; i++) {
      if (low.indexOf(FORBIDDEN[i].toLowerCase()) !== -1) { bad = true; break; }
    }
    if (bad) continue;
    out[k] = obj[k];
  }
  return out;
}

function _preview(text, n) {
  var t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  n = n || 80;
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/* 6.101.0 — a workflow row used to preview its own id ("region-edit"), which told a
   student nothing and made eight rows of one workflow identical. The typed instruction
   is already in the compiled prompt, on its own USER REQUEST line, so the row previews
   THAT when there is one. Nothing new is stored: it is the same text, read back. */
function _userLine(prompt) {
  var m = /\nUSER REQUEST: ([^\n]+)/.exec(String(prompt == null ? "" : prompt));
  return m ? m[1] : "";
}

var _seq = 0;
function _id(now) { _seq += 1; return "h_" + (now || 0) + "_" + _seq; }

/* Build a sanitized entry from a compiled request (free-generate or workflow).
   idParams carry { now, timeLabel } so the module never calls Date. */
function entryFromRequest(request, idParams) {
  request = request || {};
  idParams = idParams || {};
  var isWorkflow = request.mode === "smart-workflow";
  var m = registry.getModel(request.model);
  var out = request.output || {};
  var fullPrompt = isWorkflow ? "" : (request.userPrompt || request.prompt || "");
  return _stripSecrets({
    id: _id(idParams.now),
    mode: request.mode || "free-generate",
    badge: isWorkflow ? "WORKFLOW" : "FREE GENERATE",
    workflowId: request.workflowId || null,
    model: request.model || "auto",
    modelName: m ? m.displayName : (request.model || "Auto"),
    size: (out.size || "").toUpperCase(),
    ratio: out.ratio || "",
    // full prompt is not a secret — kept so "Reuse" can restore the request;
    // the UI shows promptPreview for compactness (spec §22).
    prompt: fullPrompt,
    negativePrompt: request.negativePrompt || "",
    quality: out.quality || "",
    variants: out.variants || 1,
    promptPreview: _preview(isWorkflow ? (String(request.typedText || "") || _userLine(request.compiledPrompt) || request.workflowId || "") : fullPrompt),
    timeLabel: idParams.timeLabel || "",
    // a persistable reference only — never binary, never a token
    resultRef: request.resultRef || null
  });
}

function create(store) {
  function _read() {
    try { var v = store && store.get(KEY); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function _write(list) { try { store && store.set(KEY, list); } catch (e) {} }

  function add(entry) {
    var clean = _stripSecrets(entry);
    var list = _read();
    list.unshift(clean);
    if (list.length > CAP) list = list.slice(0, CAP);
    _write(list);
    return clean;
  }
  function addFromRequest(request, idParams) { return add(entryFromRequest(request, idParams)); }
  function list() { return _read(); }
  function get(id) { var l = _read(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function clear() { _write([]); }
  /* 6.101.0 — A RUN CAN BE FORGOTTEN. The owner: "pannel က history ဖျက်လို့ရတာအပြင်
     တစ်ခြားလိုအပ်တာတေွလဲ ဖြည့်ပေးပါ". The web app has had a cross on every row since
     6.18.0; the panel could only ever wipe the whole record. remove() drops one entry
     by id, clearWhere() drops the ones a page owns (its own workflow's runs) and
     answers how many went, so the button can say so. */
  function remove(id) {
    var l = _read(), out = [], gone = 0;
    for (var i = 0; i < l.length; i++) { if (l[i] && l[i].id === id) { gone++; } else { out.push(l[i]); } }
    if (gone) _write(out);
    return gone;
  }
  function clearWhere(pred) {
    if (typeof pred !== "function") { var n = _read().length; _write([]); return n; }
    var l = _read(), out = [], gone = 0;
    for (var i = 0; i < l.length; i++) {
      var keep = true;
      try { keep = !pred(l[i]); } catch (e) { keep = true; }
      if (keep) out.push(l[i]); else gone++;
    }
    if (gone) _write(out);
    return gone;
  }

  return { add: add, addFromRequest: addFromRequest, list: list, get: get, clear: clear,
    remove: remove, clearWhere: clearWhere };
}

var API = { create: create, entryFromRequest: entryFromRequest, CAP: CAP, KEY: KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.historyService = API; }
})();
