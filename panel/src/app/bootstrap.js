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
var registry = dep("../models/model-registry", "modelRegistry");
var resultGroup = dep("../photoshop/result-group-service", "resultGroupService");
var maskedPlace = dep("../photoshop/masked-place-service", "maskedPlaceService");
var wfRegistry = dep("../workflows/workflow-registry", "workflowRegistry");
var progressStrip = dep("../ui/progress-strip", "progressStrip");
var dom = dep("../ui/dom", "dom");

/* v6.26.0 — one engine: every model routes to the RunningHub Enterprise
   adapter (the direct-OpenAI adapter left with its provider). */
function adapterFor(modelId) {
  return adapter;
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
  var settings = settingsService.create(store, verifier);
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

  var STAGE_KEY = { UPLOADING: "stage_uploading", SUBMITTING: "stage_generating", PROCESSING: "stage_generating",
    DOWNLOADING_RESULT: "stage_downloading", PLACING: "stage_placing" };
  function stageWord(stage) {
    var k = STAGE_KEY[stage]; var v = k ? dom.t(k, "") : "";
    if (v) return v;
    return String(stage || "").toLowerCase().replace(/_/g, " ");
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
      /* v6.75.0 — IN THE PANEL'S OWN LANGUAGE. The owner pressed GENERATE on
         a dead line and the Burmese panel answered in English ("Could not
         reach RunningHub Enterprise…"): the normalizer speaks English only.
         The refusals a student actually meets carry a nine-language line in
         main.js's table (rh_err_<code>); anything without one keeps the
         normalizer's English. */
      try {
        var lk = n.code && n.code !== "ready" ? ("rh_err_" + String(n.code).replace(/-/g, "_")) : "";
        var loc = lk ? dom.t(lk, "") : "";
        if (loc) line = loc;
      } catch (eL) { }
      /* v6.80.0 — AND WHERE IT STOPPED, AND WHAT THE HOST SAID. The owner's
         photograph of 6.150.0 carried the nine-language "cannot reach
         RunningHub" line and nothing else, and that line fits a dead Wi-Fi,
         a task the server refused, a download the manifest blocked and a
         60-second ceiling alike. The stage the adapter recorded and the
         normalizer's one-line reason follow the sentence. */
      if (n.code !== "ready") {
        try {
          var extra = [n.stage ? stageWord(n.stage) : "", n.detail].filter(Boolean).join(" \u00b7 ");
          if (extra) line += " \u00b7 " + extra;
        } catch (eX) { }
      }
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
        var s = settings.get();
        var res = await chosen.generate({
          transport: opts.transport, configOverride: currentOverride(),
          apiKey: s.apiKey, host: opts.host, now: opts.now
        }, request, { onStage: stageAll });
        /* v6.159.1 — BOOK WHAT IT COST. The app books every paid run inside its poll (rhPollTracked → rhBookSpend), so its
           COST & BALANCE counts Smart Workflow runs; the panel's video pages and Freeform book their own (rhBookUsage), but
           these runs never reached the ledger — the owner's Setup card read "0 runs · 0 USD" after five Reference Scenes
           runs. The adapter has always returned usage:[{taskId, final}]; the host's hook writes the row. Never blocks or
           fails the run. */
        try {
          var sb = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.spendBook : null;
          if (typeof sb === "function" && res && res.usage && res.usage.length) sb(res.usage, { kind: "image", label: featureOf(request), prov: "rh" });
        } catch (eBook) { }
        if (!res.ok) { status(res.error); return res; }

        /* v6.46.0 — keep what we made, the way the app keeps it. Writing to
           the gallery never blocks or fails the run: a studio that cannot
           spare the disk still gets its layer. */
        try {
          var gs = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.galleryStore : null;
          if (gs && res.results) {
            res.results.forEach(function (r) {
              var ref = String((r && r.ref) || "");
              var b64 = ref.indexOf("data:") === 0 ? ref.split(",")[1] : "";
              var ext = /image\/(\w+)/.exec(ref);
              if (b64) gs.save(b64, (ext && ext[1]) || "png", request && request.workflowId);
            });
          }
        } catch (e) { }

        /* v6.83.0 — THE WIZARD'S OWN RECORD. The owner's photographs of
           6.153.0 show a Smart Workflow run end in a green "Done." and a
           layer, with nothing on the wizard to look at: no result, no
           Before | After, no earlier runs. Every result is recorded here
           with the photograph that went in (IMAGE 1) and the prompt that
           made it, so the screen can show, compare, re-place and chain it.
           Memory only; never blocks or fails the run. */
        try {
          var wr = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.wfResults : null;
          if (wr && request && request.mode === "smart-workflow" && res.results) {
            var firstIn = (request.images && request.images[0] && request.images[0].ref) || "";
            var firstSrc = (request.images && request.images[0] && request.images[0].source) || "";
            var outp = request.output || {};
            res.results.forEach(function (r) {
              wr.record({ workflowId: request.workflowId, before: firstIn, after: r && r.ref,
                prompt: request.compiledPrompt || request.prompt || "", promptEdited: !!request.promptEdited,
                model: res.model || request.model || "", ratio: outp.ratio || "", size: outp.size || "",
                /* v6.84.0 — Selection Edit: the rectangle the pixels came from, and that they did */
                regionBounds: request.regionBounds || null, inputSource: firstSrc,
                timeLabel: (typeof opts.timeLabel === "function") ? opts.timeLabel() : (opts.timeLabel || "") });
            });
          }
        } catch (e) { }

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
            modelId: res.model, canvas: canvas, timeLabel: opts.timeLabel,
            regionBounds: (request && request.regionBounds) || null
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
      } catch (e) {
        /* v6.80.0 — NOTHING ON THIS PATH FAILS IN SILENCE. The lease check and
           the placement threw straight out of the promise: the spinner
           stopped (finally) and the strip said nothing. A licence refusal
           keeps the gate's own translated sentence; anything else goes
           through the normalizer like a provider failure. */
        var lic = !!(e && (e.code === "license-required" || /^HNKERR:err_license:/.test(String(e.message || ""))));
        var n2 = lic
          ? { code: "license", title: String(e.message || "").replace(/^HNKERR:[a-z_]+:/, "") || "Panel authorization required", message: "", bullets: [] }
          : errorNormalizer.normalize(e);
        status(n2);
        return { ok: false, error: n2 };
      } finally {
        setGenerateBusy(false);
      }
    })();
    lastRun = run;
    return run;
  }

  /* v6.83.0 — place one kept result into Photoshop again (the wizard's
     result card: "Place into Photoshop again"), the same masked-group path
     a fresh run takes, with the same honest strip line at the end.
     v6.84.0 — with the region a Selection Edit result was cut from, so it
     lands where the marquee was, under the same mask, not fitted to the page. */
  async function placeResult(ref, workflowId, modelId, regionBounds) {
    if (!/^data:image\//.test(String(ref || ""))) return { ok: false, reason: "no-results" };
    if (!(opts.host && maskedPlace)) {
      status({ code: "place-failed", title: dom.t("ai_place_failed", "Generated, but could not place into Photoshop."),
        message: dom.t("ai_place_failed_fix", "Open a document, then re-run from History."), bullets: ["no-host"] });
      return { ok: false, reason: "no-host" };
    }
    setGenerateBusy(true);
    try {
      stageAll("PLACING", { label: dom.t("stage_placing", "Placing into Photoshop") });
      var canvas = (opts.host.canvasSize && opts.host.canvasSize()) || { width: 1024, height: 1024 };
      var placed = await maskedPlace.placeResults({
        host: opts.host, results: [{ ref: ref }], feature: featureOf({ mode: "smart-workflow", workflowId: workflowId }),
        modelId: modelId || "", canvas: canvas, timeLabel: opts.timeLabel,
        /* v6.84.0 — a Selection Edit result goes back to its own rectangle, masked to it */
        regionBounds: (regionBounds && regionBounds.width > 0 && regionBounds.height > 0) ? regionBounds : null
      });
      if (!placed.ok) {
        status({ code: "place-failed", title: dom.t("ai_place_failed", "Generated, but could not place into Photoshop."),
          message: dom.t("ai_place_failed_fix", "Open a document, then re-run from History."), bullets: [placed.reason || "place-failed"] });
        return placed;
      }
      var msg2 = placed.outcome === "masked-group"
        ? dom.tf("ai_placed_masked", "Placed into the \u201C{name}\u201D group as Layer + Mask \u2014 your original is untouched.", { name: placed.groupName })
        : placed.outcome === "group-only"
          ? dom.tf("ai_placed_group", "Placed into the \u201C{name}\u201D group as a new layer (mask unavailable on this host).", { name: placed.groupName })
          : dom.t("ai_placed_plain", "Placed as a new layer (group/mask unavailable on this host).");
      status({ code: "ready", title: dom.t("ai_done", "Done."), message: msg2, bullets: [] });
      return placed;
    } catch (e) {
      var n3 = errorNormalizer.normalize(e);
      status(n3);
      return { ok: false, reason: n3.code || "place-failed" };
    } finally {
      setGenerateBusy(false);
    }
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
    onGenerate: handleGenerate,
    /* v6.49.0 — the app's Home is a router. Its six picture cards and its
       destination buttons leave for other PANEL PAGES; both live in main.js
       and reach this stack through the HNK.panelNav bridge it publishes.
       6.102.1: Home and Tutorials carry no Panel-download button any more
       (one place — the Account card's Photoshop Panel group under Setup);
       onGetUpdate stays wired for that bridge. */
    onPage: function (key) {
      try {
        var nav = globalThis.HNK && globalThis.HNK.panelNav;
        if (nav && nav.switchPage) nav.switchPage(key);
      } catch (e) { }
    },
    onGetUpdate: function () {
      try {
        var nav = globalThis.HNK && globalThis.HNK.panelNav;
        if (nav && nav.getUpdate) nav.getUpdate();
      } catch (e) { }
    }
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
  /* v6.44.0 — ONE PHOTO AT A TIME IS NOT WHAT A STUDIO DOES.
     The web app has Path: fifty to a hundred photos, one look, one run. The
     panel could only ever do one. This is the same generate the single run
     uses — same adapter, same lease, same model routing — with two
     differences that make it a batch: the caller supplies the source image
     per item, and nothing is placed into the document (a hundred results are
     files, not a hundred layers). Placement stays the single run's job. */
  async function batchGenerate(request, onStage) {
    var panelAuth = (typeof globalThis !== "undefined" && globalThis.HNK)
      ? globalThis.HNK.panelAuth : null;
    if (panelAuth && panelAuth.requireLease) await panelAuth.requireLease();
    var chosen = adapterFor(request && request.model);
    var s = settings.get();
    return chosen.generate({
      transport: opts.transport, configOverride: currentOverride(),
      apiKey: s.apiKey, host: opts.host, now: opts.now
    }, request, { onStage: onStage || function () { } });
  }

  function publishApp() {
    try {
      var g = (typeof globalThis !== "undefined") ? globalThis : null;
      if (!g) return;
      g.HNK = g.HNK || {};
      g.HNK.aiToolsApp = app;
      g.HNK.batchGenerate = batchGenerate;
      /* v6.49.0 — Direct Generate is a panel-only output setting now (the
         app's Workflows page carries no such control), so Setup owns its
         toggle and reads it through this handle. */
      g.HNK.aiToolsSettings = settings;
    } catch (e) { }
  }

  function mount() {
    publishApp();
    /* v6.80.0 — the boot handle itself (runViaProvider, progress) beside the
       controller, so a test can drive the real provider path and read the
       strip exactly as a student would see it */
    try { globalThis.HNK.aiToolsBoot = handle; } catch (e) { }
    app.mount(); return app;
  }

  var handle = {
    app: app,
    store: store,
    services: { settings: settings, history: history, presets: presets, rhSetup: rhSetup, rh: rh },
    saveDraft: saveDraft,
    runViaProvider: runViaProvider,
    placeResult: placeResult,
    lastRun: function () { return lastRun; },
    progress: strip,
    mount: mount
  };
  return handle;
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
