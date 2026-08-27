/* ============================================================
   HNK AI Tools — OpenAI Provider Adapter
   Spec §17 (Adapter) · §11–§13 (states, progress, cancel) · §24

   Orchestrates a compiled request into a real generation via OpenAI's
   gpt-image-2: a single synchronous request (POST /v1/images/edits when
   reference images are attached, POST /v1/images/generations for a
   text-only prompt) — no upload/submit/poll/download cycle like RunningHub
   needs, since OpenAI returns the finished image in the same response.

   Migrated from gpt-image-1 (OpenAI retires that model's API on
   2026-10-23). gpt-image-2 keeps the same request shape this adapter
   already sends — model/prompt/size on both endpoints, multipart image[]
   for edits, b64_json response — per the current OpenAI Images API
   reference (gpt-image-2 additionally allows arbitrary WIDTHxHEIGHT
   sizes; the fixed sizes below remain valid).

   Implements the same generate(deps, request, opts) / verifyKey(deps, apiKey)
   contract as runninghub-enterprise-adapter.js so bootstrap.js can route to
   either provider by model, and both surface through the same status UI.

   Everything is injected — transport / sleep / now — so this is
   unit-testable with a fake transport and no real network.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
function dep(p, g) { return _CJS ? require(p) : globalThis.HNK[g]; }

var normalizer = dep("./openai-error-normalizer", "openaiErrorNormalizer");
var machine = dep("../free-generate/generate-state-machine", "generateStateMachine");
var registry = dep("../models/model-registry", "modelRegistry");

var BASE_URL = "https://api.openai.com/v1";
var MODEL = "gpt-image-2";

function _url(path) { return BASE_URL + path; }
function _err(code, status, body) { var e = new Error(code); e.code = code; e.status = status; e.body = body; return e; }

/* Map the app's free-form ratio onto the standard gpt-image sizes (still
   valid for gpt-image-2). Source/auto ratios fall through to "auto". */
function sizeFromOutput(output) {
  var ratio = output && output.ratio;
  if (!ratio || ratio === "auto" || ratio === "source") return "auto";
  var parts = String(ratio).split(":").map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "auto";
  if (parts[0] === parts[1]) return "1024x1024";
  return parts[0] > parts[1] ? "1536x1024" : "1024x1536";
}

/* Lightweight key check (spec §21 Save & Verify): probe an authenticated,
   side-effect-free endpoint. 401 = invalid; anything else that responds =
   key accepted. */
async function verifyKey(deps, apiKey) {
  if (!apiKey) return { ok: false, error: { code: "invalid-key" } };
  try {
    var resp = await deps.transport({ method: "GET", url: _url("/models"), headers: { "Authorization": "Bearer " + apiKey } });
    if (resp && resp.status === 401) return { ok: false, error: { code: "invalid-key" } };
    // A 429 on /models means the key AUTHENTICATED and merely hit a rate
    // limit — without this the key reports as failed, sending users hunting
    // for a non-existent key problem. Same fix already shipped on the web
    // app's oaVerifyKey (docs/app/index.html), ported here for parity.
    if (resp && resp.status === 429) return { ok: true };
    return { ok: !!(resp && resp.ok) };
  } catch (e) {
    return { ok: false, error: normalizer.normalize(e) };
  }
}

function _stage(onStage, m, extra) {
  if (typeof onStage === "function") onStage(m.stage, Object.assign({ label: machine.label(m.stage) }, extra || {}));
}

/* One request -> array of result refs (data URLs). */
async function _runOnce(deps, request) {
  var apiKey = deps.apiKey;
  var refs = (request.images || []).map(function (im) { return im.ref; }).filter(Boolean);
  var prompt = request.prompt || request.compiledPrompt || "";
  var size = sizeFromOutput(request.output);
  var resp;
  if (refs.length) {
    resp = await deps.transport({
      method: "POST", url: _url("/images/edits"),
      headers: { "Authorization": "Bearer " + apiKey },
      body: {
        multipart: true,
        fields: { model: MODEL, prompt: prompt, size: size },
        files: refs.map(function (ref, i) { return { fieldName: "image[]", name: "hnk_" + i + ".png", dataUrl: ref }; })
      },
      signal: deps.signal
    });
  } else {
    resp = await deps.transport({
      method: "POST", url: _url("/images/generations"),
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: prompt, size: size }),
      signal: deps.signal
    });
  }
  if (!resp || !resp.ok) throw _err("generate-failed", resp && resp.status, resp && await _safeJson(resp));
  var json = await resp.json();
  var d = json && json.data && json.data[0];
  if (!d || !d.b64_json) throw _err("generate-failed", 200, json);
  return [{ ref: "data:image/png;base64," + d.b64_json }];
}

async function _safeJson(resp) { try { return await resp.json(); } catch (e) { return null; } }

/* Public entry. deps = { transport, apiKey, sleep?, now?, signal? }.
   Returns { ok, results:[{ref}], model, error? }. */
async function generate(deps, request, opts) {
  opts = opts || {};
  var onStage = opts.onStage;
  deps = Object.assign({}, deps);
  deps.signal = opts.signal || deps.signal;

  var m = machine.create();
  _stage(onStage, m); // IDLE
  machine.advance(m, deps.now ? deps.now() : 0); _stage(onStage, m); // VALIDATING

  if (!deps.apiKey) {
    machine.fail(m, "not-configured");
    return { ok: false, model: request.model, machine: m,
      error: { code: "not-configured", title: "OpenAI is not configured yet.",
        message: "Add your OpenAI key in Settings.", bullets: [] } };
  }

  var model = registry.getModel(request.model);
  var count = Math.max(1, request.requestCount || 1);
  var all = [];
  try {
    for (var r = 0; r < count; r++) {
      if (deps.signal && deps.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
      // OpenAI is one round-trip (no separate upload/submit/poll/download
      // sub-stages), so walk the shared machine straight through to PROCESSING.
      machine.advance(m); machine.advance(m); machine.advance(m); machine.advance(m); _stage(onStage, m); // -> PROCESSING
      var res = await _runOnce(deps, request);
      machine.advance(m); _stage(onStage, m); // -> DOWNLOADING_RESULT (result already in hand)
      all = all.concat(res);
    }
    m.stage = "READY"; _stage(onStage, m);
    return { ok: true, results: all, model: request.model, machine: m };
  } catch (e) {
    if (e && e.code === "cancelled") {
      machine.cancel(m); _stage(onStage, m);
      return { ok: false, cancelled: true, model: request.model, machine: m, error: { code: "cancelled" } };
    }
    machine.fail(m, e && e.message); _stage(onStage, m);
    var n = normalizer.normalize(e, { modelName: model ? model.displayName : request.model });
    return { ok: false, model: request.model, machine: m, error: n };
  }
}

function makeVerifier(deps) {
  var d = Object.assign({}, deps);
  return function (apiKey) { return verifyKey(Object.assign({}, d, { apiKey: apiKey }), apiKey); };
}

var API = { generate: generate, verifyKey: verifyKey, makeVerifier: makeVerifier, sizeFromOutput: sizeFromOutput, MODEL: MODEL };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.openaiAdapter = API; }
})();
