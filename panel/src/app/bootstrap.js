/* ============================================================
   HNK AI Tools — Bootstrap (assemble + mount the two-mode panel)
   Spec §17 (Architecture) · §21 (Settings) · §26 (Reload restores draft/settings)

   Wires the store, persistence services, Photoshop host and app controller into
   a running panel, then:
     - restores the saved Free Generate DRAFT if present, else seeds a fresh
       state from the saved default settings (spec §21, §26);
     - auto-saves the draft on every Free Generate change;
     - records generations into history and forwards them to onGenerate.
   Everything is dependency-injected (io, document, host, verifier, now) so the
   assembly is unit-testable; the panel entry provides real UXP implementations.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
function dep(cjsPath, globalName) { return _CJS ? require(cjsPath) : globalThis.HNK[globalName]; }

var uxpStore = dep("./uxp-store", "uxpStore");
var settingsService = dep("./settings-service", "settingsService");
var historyService = dep("../history/history-service", "historyService");
var presetService = dep("../history/preset-service", "presetService");
var fstate = dep("../free-generate/free-generate-state", "freeGenerateState");
var appController = dep("../ui/app-controller", "appController");
var errorNormalizer = dep("../providers/runninghub-error-normalizer", "errorNormalizer");
var adapter = dep("../providers/runninghub-enterprise-adapter", "runninghubAdapter");
var rhSetupSvc = dep("../providers/runninghub-setup", "runninghubSetup");
var openaiAdapter = dep("../providers/openai-adapter", "openaiAdapter");
var registry = dep("../models/model-registry", "modelRegistry");
var resultGroup = dep("../photoshop/result-group-service", "resultGroupService");
var maskedPlace = dep("../photoshop/masked-place-service", "maskedPlaceService");
var wfRegistry = dep("../workflows/workflow-registry", "workflowRegistry");
var progressStrip = dep("../ui/progress-strip", "progressStrip");
var dom = dep("../ui/dom", "dom");

/* Route a request to its model's provider adapter (spec §17, §19 — model
   capabilities/routing are DATA, read from the registry, never hardcoded
   per call site). Unknown/"auto" models fall back to RunningHub, the
   original default provider. */
function adapterFor(modelId) {
  var m = registry.getModel(modelId);
  return (m && m.provider === "openai") ? openaiAdapter : adapter;
}

var DRAFT_KEY = "hnk_free_draft";

/* opts:
   { document, root, io, host, transport, configOverride, verifier,
     now, timeLabel, onGenerate, onStatus } */
function create(opts) {
  opts = opts || {};
  var store = uxpStore.create(opts.io || { load: function () { return {}; }, save: function () {} });

  // Read the no-code RunningHub config LIVE from the store, so values the user
  // saves in Settings take effect on the next generation without a reload.
  function currentOverride() { return opts.configOverride || store.get("hnk_rh_config") || undefined; }

  // A live transport (Phase 4) enables real key verification + generation.
  var verifier = opts.verifier ||
    (opts.transport ? function (apiKey) {
      return adapter.makeVerifier({ transport: opts.transport, configOverride: currentOverride() })(apiKey);
    } : undefined);
  var oaiVerifier = opts.oaiVerifier ||
    (opts.transport ? openaiAdapter.makeVerifier({ transport: opts.transport }) : undefined);

  var settings = settingsService.create(store, verifier, oaiVerifier);
  var history = historyService.create(store);
  var presets = presetService.create(store);
  var rhSetup = rhSetupSvc.create(store);

  // RunningHub setup helper for the Settings screen: persist a custom
  // model's endpoint path and verify a key (both live via the store — see
  // runninghub-setup.js). openapi/v2 has no per-account "discover my apps"
  // endpoint (unlike the old Enterprise ai-app scheme), so there is no
  // discover() here anymore.
  var rh = {
    setup: rhSetup,
    verify: function (apiKey) {
      if (!opts.transport) return Promise.resolve({ ok: false, error: { code: "no-transport" } });
      return adapter.verifyKey({ transport: opts.transport, configOverride: currentOverride(), apiKey: apiKey }, apiKey);
    }
  };

  // OpenAI key test connection for the Settings screen — no node-mapping to
  // manage (fixed model/endpoints), so just a verify.
  var oai = {
    verify: function (apiKey) {
      if (!opts.transport) return Promise.resolve({ ok: false, error: { code: "no-transport" } });
      return openaiAdapter.verifyKey({ transport: opts.transport, apiKey: apiKey }, apiKey);
    }
  };

  function saveDraft(state) {
    try { store.set(DRAFT_KEY, fstate.snapshot(state)); } catch (e) {}
  }

  // v6.9.0: compact progress strip (queued → uploading → generating →
  // downloading → placing) rendered into the mount root, driven by the
  // adapters' onStage lifecycle. Errors/success ALSO render here, so the live
  // panel finally shows generation feedback (the v6.8.0 no-op status bug).
  var strip = (opts.root && opts.document && progressStrip)
    ? progressStrip.create({ document: opts.document, root: opts.root })
    : null;
  function stageAll(stage, info) {
    if (strip) { try { strip.onStage(stage, info); } catch (e) {} }
    if (typeof opts.onStage === "function") { try { opts.onStage(stage, info); } catch (e2) {} }
  }

  function status(n) {
    if (strip && n && typeof n === "object") {
      // v6.19: title and message are frequently the exact same sentence
      // (e.g. every RunningHub invalid-key error) — joining both then
      // visibly duplicates it ("...failed. ...failed."). Also surface the
      // normalizer's own actionable bullets (built for exactly this, but
      // previously discarded here) instead of a bare one-line message.
      var head = (n.title && n.message && n.title === n.message) ? n.title : [n.title, n.message].filter(Boolean).join(" ");
      var line = [head].concat(n.bullets || []).filter(Boolean).join(" · ");
      try { if (n.code === "ready") strip.setDone(line); else strip.setError(line); } catch (e) {}
    }
    if (typeof opts.onStatus === "function") opts.onStatus(n);
  }

  function setGenerateBusy(busy) {
    var doc = opts.document;
    if (!doc || !doc.getElementById) return;
    ["hnkGenerate", "hnkWfGenerate"].forEach(function (id) {
      try {
        var b = doc.getElementById(id);
        if (b) {
          b.disabled = !!busy;
          var base = (b.className || "").replace(/\s*is-busy/g, "");
          b.className = busy ? (base + " is-busy") : base;
        }
      } catch (e) {}
    });
  }

  /* Human name of what is being generated -> group name "HNK — <feature>".
     Deliberately NOT localized: this becomes a Photoshop layer-group name,
     i.e. document data that outlives the panel and travels with a shared PSD.
     Layer names stay stable English; only the UI around them translates. */
  function featureOf(request) {
    if (request && request.mode === "smart-workflow" && request.workflowId) {
      var wf = wfRegistry && wfRegistry.get ? wfRegistry.get(request.workflowId) : null;
      return (wf && wf.title) || request.workflowId;
    }
    return "Free Generate";
  }

  // Run a compiled request against its model's provider, then place the
  // results into Photoshop as a masked layer group (spec §14 + the v6.9.0
  // non-destructive standard) when a host is present. `lastRun` exposes the
  // promise so callers/tests can await completion (the UI click is fire-and-go).
  var lastRun = Promise.resolve();
  function runViaProvider(request) {
    var run = (async function () {
      setGenerateBusy(true);
      try {
        var panelAuth = (typeof globalThis !== "undefined" && globalThis.HNK)
          ? globalThis.HNK.panelAuth : null;
        if (!panelAuth || typeof panelAuth.requireLease !== "function") {
          throw Object.assign(new Error("Panel authorization required"), { code: "license-required" });
        }
        await panelAuth.requireLease();
        var chosen = adapterFor(request && request.model);
        var isOai = chosen === openaiAdapter;
        var s = settings.get();
        var res = await chosen.generate({
          transport: opts.transport, configOverride: currentOverride(),
          apiKey: isOai ? s.oaiKey : s.apiKey, host: opts.host, now: opts.now
        }, request, { onStage: stageAll });
        if (!res.ok) { status(res.error); return res; }

        if (s.addAsNewLayer === false) {
          // The user turned placement off in Settings — say so honestly.
          status({ code: "ready", title: dom.t("ai_done", "Done."),
            message: dom.t("ai_ready_nolayer", "Result ready (add-as-layer is off in Settings)."), bullets: [] });
          return res;
        }
        if (opts.host && maskedPlace && res.results.length) {
          stageAll("PLACING", { label: dom.t("stage_placing", "Placing into Photoshop") });
          var canvas = (opts.host.canvasSize && opts.host.canvasSize()) || { width: 1024, height: 1024 };
          var placed = await maskedPlace.placeResults({
            host: opts.host, results: res.results, feature: featureOf(request),
            modelId: res.model, canvas: canvas, timeLabel: opts.timeLabel
          });
          res.placement = placed;
          if (!placed.ok) {
            // Never claim success for a failed placement (the old stub lied).
            status({ code: "place-failed", title: dom.t("ai_place_failed", "Generated, but could not place into Photoshop."),
              message: dom.t("ai_place_failed_fix", "Open a document, then re-run from History."), bullets: [placed.reason || "place-failed"] });
            return res;
          }
          var msg = placed.outcome === "masked-group"
            ? dom.tf("ai_placed_masked",
                "Placed into the \u201C{name}\u201D group as Layer + Mask \u2014 your original is untouched.", { name: placed.groupName })
            : placed.outcome === "group-only"
              ? dom.tf("ai_placed_group",
                  "Placed into the \u201C{name}\u201D group as a new layer (mask unavailable on this host).", { name: placed.groupName })
              : dom.t("ai_placed_plain", "Placed as a new layer (group/mask unavailable on this host).");
          status({ code: "ready", title: dom.t("ai_done", "Done."), message: msg, bullets: [] });
          return res;
        }
        status({ code: "ready", title: dom.t("ai_done", "Done."), message: dom.t("ai_result_ready", "Result ready."), bullets: [] });
        return res;
      } finally {
        setGenerateBusy(false);
      }
    })();
    lastRun = run;
    return run;
  }

  function handleGenerate(request) {
    if (typeof opts.onGenerate === "function") { opts.onGenerate(request); return; }
    if (opts.transport) { runViaProvider(request); return; }
    // No provider wired yet — surface a clear status, never a silent no-op.
    status(errorNormalizer.normalize({ code: "network", message: "provider not connected" }));
  }

  var settingsNow = settings.get();
  var app = appController.create({
    document: opts.document,
    root: opts.root,
    host: opts.host,
    history: history,
    settings: settings,
    hasApiKey: !!settingsNow.apiKey,
    now: opts.now,
    timeLabel: opts.timeLabel,
    onFreeChange: saveDraft,
    onLanguage: opts.onLanguage,
    onTheme: opts.onTheme,
    rh: rh,
    oai: oai,
    onGenerate: handleGenerate
  });

  // Restore the draft, or seed defaults from settings (spec §21, §26).
  var ctrl = app.controller();
  var saved = store.get(DRAFT_KEY);
  if (saved && typeof saved === "object") {
    ctrl.freeGenerate = fstate.restore(saved);
  } else {
    settings.applyDefaultsTo(ctrl.freeGenerate);
  }

  /* Publish the live app so main.js's applyI18n() refresher can repaint the
     AI Tools screens when the header language select changes. Mounting is the
     only re-render entry point the controller exposes, and it is idempotent. */
  function publishApp() {
    try {
      var g = (typeof globalThis !== "undefined") ? globalThis : null;
      if (!g) return;
      g.HNK = g.HNK || {};
      g.HNK.aiToolsApp = app;
    } catch (e) { }
  }

  function mount() { publishApp(); app.mount(); return app; }

  return {
    app: app,
    store: store,
    services: { settings: settings, history: history, presets: presets, rhSetup: rhSetup, rh: rh, oai: oai },
    saveDraft: saveDraft,
    runViaProvider: runViaProvider,
    lastRun: function () { return lastRun; },
    progress: strip,
    mount: mount
  };
}

/* Convenience panel entry — builds the real UXP io + host, waits for the file
   preload, then mounts into #hnkAiToolsRoot. Returns a promise of the boot
   handle. Only runs where UXP is present. */
async function start(uxpLfs, host, doc) {
  doc = doc || (typeof document !== "undefined" ? document : null);
  var root = doc && doc.getElementById ? doc.getElementById("hnkAiToolsRoot") : null;
  if (!root) return null;
  var fileIo = uxpStore.uxpFileIo(uxpLfs);
  try { await fileIo.preload(); } catch (e) {}
  // Build the fetch transport so key verification + generation are live.
  // Built-in models already carry a real, confirmed apiPath (see
  // runninghub-config.js) and work as soon as a valid key is saved; a model
  // still without one returns a clear "not configured" status.
  var http = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.runninghubHttp)
    ? globalThis.HNK.runninghubHttp : null;
  var transport = http ? http.create() : null;
  // Optional per-install endpoint/node overrides persisted under "hnk_rh_config".
  var store = uxpStore.create(fileIo.io);
  var configOverride = store.get("hnk_rh_config") || undefined;
  var boot = create({ document: doc, root: root, io: fileIo.io, host: host, transport: transport, configOverride: configOverride });
  /* clear any inline display so the stylesheet's flex layout applies — the
     root now lives inside a classic .page whose visibility the tabs control */
  root.style.display = "";
  boot.mount();
  return boot;
}

var API = { create: create, start: start, DRAFT_KEY: DRAFT_KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.bootstrap = API; }
})();
