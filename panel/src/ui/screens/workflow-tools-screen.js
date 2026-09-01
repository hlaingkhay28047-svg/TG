/* ============================================================
   HNK AI Tools — Workflow Tools screen (staged Smart-Workflow buttons)
   Spec §15 + self-contained staged-button rule.

   Per-button staged interaction:
     Click 1  select  -> show the workflow's explanation + required images.
     Click 2  Prepare -> load the protected prompt, validate, highlight missing
                         slots; green "ready" when every required input is valid.
     Next     GENERATE (enabled only when ready).
   Direct Generate mode (global toggle) skips Prepare: once inputs are valid,
   GENERATE is available immediately.

   The protection (subject/identity/pose locks, negatives, reference-transfer
   rules) is inside the workflow, not the UI — this screen shows no separate
   guard/lock/QC controls.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* v6.27.0 — webapp-parity art cards (same treatment as the home screen):
   each workflow shows its own bundled catalog card whole, as an <img> at
   its intrinsic 3:2 — the repo's proven UXP-safe image fit. */
function hnkArtCard(doc, visual) {
  if (!visual) return null;
  var art = doc.createElement("div");
  art.className = "hnk-cardart";
  var im = doc.createElement("img");
  /* remote catalog art (licensed host) falls back to a text card offline */
  im.onerror = function () { try { art.parentNode && art.parentNode.removeChild(art); } catch (e) { } };
  im.src = visual; im.alt = "";
  art.appendChild(im);
  return art;
}


var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var registry = _CJS ? require("../../workflows/workflow-registry") : globalThis.HNK.workflowRegistry;
var wstate = _CJS ? require("../../workflows/workflow-state") : globalThis.HNK.workflowState;
var validator = _CJS ? require("../../workflows/workflow-validator") : globalThis.HNK.workflowValidator;
var compiler = _CJS ? require("../../workflows/workflow-request-compiler") : globalThis.HNK.workflowRequestCompiler;
var modelRegistry = _CJS ? require("../../models/model-registry") : globalThis.HNK.modelRegistry;
var imageImport = _CJS ? require("../../photoshop/image-import-service") : (globalThis.HNK && globalThis.HNK.imageImportService);

function create(deps) {
  var doc = deps.document;
  var state = deps.state || wstate.defaultState();
  var root = null;
  var nodes = {};

  function directMode() { return !!(deps.directGenerate && deps.directGenerate()); }

  /* v6.49.0 — THE APP'S WORKFLOWS PAGE, COMPONENT FOR COMPONENT.

     The owner walked both surfaces and reported the panel still did not
     match; the machine walk agreed in numbers. The app's Workflows page is a
     search field over collapsible category groups of TWO-UP 173px cards
     (.wfgrid > .wfmini: art, photo-count badge, title, summary, "open"); the
     panel drew one 380px art card per row down a single column with a
     "Workflow Tools" heading and a Direct Generate toggle the app has no
     equivalent for. Same 143 workflows, same nine categories, same order —
     the app's own layout for them, and the toggle moved to Setup where the
     app keeps its settings.

     UXP notes: the group body is shown/hidden by style.display (this
     renderer has no :checked or details/summary), the grid is flexbox at 48%
     (no grid-template), and every card is a div carrying role=button —
     dom.el maps "button" for exactly that reason. */
  var L_OPEN = { my: "ဖွင့်မယ်", en: "Wizard", shn: "ပိုတ်ႇ", kac: "Hpaw u", th: "เปิด", zh: "打开", vi: "Mở", id: "Buka", ms: "Buka" };
  var L_NEED0 = { my: "ပုံမလို", en: "No photo", shn: "ဢမ်ႇလူဝ်ႇၶႅပ်း", kac: "Sumla n ra", th: "ไม่ต้องใช้รูป", zh: "无需照片", vi: "Không cần ảnh", id: "Tanpa foto", ms: "Tanpa foto" };
  var L_NEED1 = { my: "၁ ပုံ", en: "1 photo", shn: "1 ၶႅပ်း", kac: "Sumla 1", th: "1 รูป", zh: "1 张", vi: "1 ảnh", id: "1 foto", ms: "1 foto" };
  var L_NEED2 = { my: "၂ ပုံ + Ref", en: "2 photos", shn: "2 ၶႅပ်း", kac: "Sumla 2", th: "2 รูป", zh: "2 张", vi: "2 ảnh", id: "2 foto", ms: "2 foto" };
  var L_SEARCH = { my: "Workflow ရှာရန် — veil, retouch, relight…", en: "Search Workflow — veil, retouch, relight…", shn: "သွၵ်ႈႁႃ Workflow — veil, retouch, relight…", kac: "Workflow tam u — veil, retouch, relight…", th: "ค้นหา Workflow — veil, retouch, relight…", zh: "搜索 Workflow — veil、retouch、relight…", vi: "Tìm Workflow — veil, retouch, relight…", id: "Cari Workflow — veil, retouch, relight…", ms: "Cari Workflow — veil, retouch, relight…" };
  var L_UNIT = { my: " ခု", en: "", shn: "", kac: "", th: "", zh: " 个", vi: "", id: "", ms: "" };

  function _lang() {
    try {
      var b = globalThis.HNK && globalThis.HNK.i18n;
      return (b && typeof b.lang === "function") ? b.lang() : "en";
    } catch (e) { return "en"; }
  }
  function l9(m) { var k = _lang(); return (m && m[k] != null) ? m[k] : (m && m.en) || ""; }

  /* every card built this render, so the search field can filter them all */
  var wfIndex = [];

  function needLabel(wf) {
    var n = (wf.requiredInputs || []).length;
    return n === 0 ? l9(L_NEED0) : n === 1 ? l9(L_NEED1) : l9(L_NEED2);
  }

  function miniCard(wf) {
    var m = dom.el(doc, "button", { class: "wfmini", id: "hnkWf_" + wf.id });
    if (wf.visual) {
      var box = dom.el(doc, "div", { class: "wfv" });
      var im = doc.createElement("img");
      /* eager: nothing drives a lazy load in this renderer, and a card that
         waits for a scroll event that never arrives stays black (v6.47.1) */
      im.loading = "eager";
      im.alt = "";
      im.onerror = function () { try { m.removeChild(box); } catch (e) { } };
      im.src = wf.visual;
      box.appendChild(im);
      box.appendChild(dom.el(doc, "div", { class: "wf-need", text: needLabel(wf) }));
      m.appendChild(box);
    }
    m.appendChild(dom.el(doc, "div", { class: "t", text: wf.title }));
    var summary = dom.t(registry.summaryKey(wf.id), wf.summary);
    if (summary) m.appendChild(dom.el(doc, "div", { class: "s", text: summary }));
    m.appendChild(dom.el(doc, "div", { class: "go", text: "› " + l9(L_OPEN) }));
    dom.on(m, "click", function () { select(wf.id); });
    wfIndex.push({ el: m, q: (wf.title + " " + (wf.summary || "") + " " + wf.id + " " + (wf.category || "")).toLowerCase() });
    return m;
  }

  /* the app's collapsible category group: a head that toggles its body */
  function group(title, count, open) {
    var g = dom.el(doc, "div", { class: "grp" });
    var car = dom.el(doc, "span", { class: "car", text: open ? "▾" : "▸" });
    var head = dom.el(doc, "button", { class: "grp-h" }, [
      car, dom.el(doc, "span", { text: title + " · " + count + l9(L_UNIT) })
    ]);
    var body = dom.el(doc, "div", { class: "grp-b" });
    body.style.display = open ? "block" : "none";
    dom.on(head, "click", function () {
      var now = body.style.display === "none";
      body.style.display = now ? "block" : "none";
      car.textContent = now ? "▾" : "▸";
    });
    g.appendChild(head);
    g.appendChild(body);
    return { g: g, b: body, open: function () { body.style.display = "block"; car.textContent = "▾"; } };
  }

  function renderList() {
    dom.clear(root);
    wfIndex = [];

    var cats = (registry.categories && registry.categories()) || [];
    var total = 0;
    cats.forEach(function (c) { total += c.ids.length; });
    if (!total) total = registry.list().length;

    var card = dom.el(doc, "div", { class: "card" });
    /* the app prints this heading in English in every locale (#wfPageH2),
       so it is the app's literal, not a lookup into the panel's table */
    card.appendChild(dom.el(doc, "h2", { text: "SMART WORKFLOW — " + total + l9(L_UNIT) }));

    /* the app's search field, in the app's place: above the groups */
    var srow = dom.el(doc, "div", { class: "row" });
    var search = doc.createElement("input");
    search.type = "text";
    search.className = "inp grow";
    search.id = "hnkWfSearch";
    search.placeholder = l9(L_SEARCH);
    srow.appendChild(search);
    card.appendChild(srow);

    /* the app's category quick-jump rail */
    var rail = dom.el(doc, "div", { class: "wfjump" });
    var groups = [];

    if (cats.length) {
      cats.forEach(function (c, ci) {
        var g = group(c.category, c.ids.length, ci === 0);
        var gd = dom.el(doc, "div", { class: "wfgrid" });
        var made = 0;
        c.ids.forEach(function (id) {
          var wf = registry.get(id);
          if (!wf) return;
          gd.appendChild(miniCard(wf));
          made++;
        });
        /* the app widens the last card of an odd group to fill the row */
        if (made % 2 === 1 && gd.lastChild && gd.lastChild.className)
          gd.lastChild.className = gd.lastChild.className + " wf-span2";
        g.b.appendChild(gd);
        groups.push(g);
        var chip = dom.el(doc, "button", { class: "chip", text: c.category + " " + c.ids.length });
        dom.on(chip, "click", function () { g.open(); });
        rail.appendChild(chip);
      });
    } else {
      var gd2 = dom.el(doc, "div", { class: "wfgrid" });
      registry.list().forEach(function (wf) { gd2.appendChild(miniCard(wf)); });
      card.appendChild(gd2);
    }

    if (rail.childNodes.length) card.appendChild(rail);
    groups.forEach(function (g) { card.appendChild(g.g); });

    /* filtering is the app's: match the card's own text, open every group
       that still has a visible card, and leave the rail alone */
    dom.on(search, "input", function () {
      var q = String(search.value || "").trim().toLowerCase();
      for (var i = 0; i < wfIndex.length; i++) {
        var hit = !q || wfIndex[i].q.indexOf(q) >= 0;
        wfIndex[i].el.style.display = hit ? "" : "none";
      }
      if (q) groups.forEach(function (g) { g.open(); });
    });

    root.appendChild(card);
  }

  function select(workflowId) {
    wstate.selectWorkflow(state, workflowId);       // Click 1
    if (directMode()) wstate.prepare(state);        // Direct: skip staging
    renderSelected();
  }

  /* v6.27.0 — owner requirement: EVERY image slot offers the same four
     sources the classic tabs do (Active Layer · File · Web Link · Library).
     One applier so all four sources land in the slot identically. */
  function applySlot(inp, slot) {
    wstate.setInput(state, inp.key, { source: slot.source, role: inp.role, ref: slot.ref, valid: slot.valid, reason: slot.reason });
    refresh();
  }

  function addImage(inp) {
    if (deps.host && imageImport) {
      var res = imageImport.fromActiveLayer(deps.host);
      if (res && typeof res.then === "function") res.then(function (slot) { applySlot(inp, slot); });
      else applySlot(inp, res);
    } else {
      wstate.setInput(state, inp.key, { source: "file", role: inp.role, ref: deps.stubRef || ("ref_" + inp.key), valid: true });
      refresh();
    }
  }

  function addFromFile(inp) {
    if (!(deps.host && deps.host.pickImageFile && imageImport)) {
      // stub hosts (tests) have no OS picker — behave like the stub add
      wstate.setInput(state, inp.key, { source: "file", role: inp.role, ref: deps.stubRef || ("ref_" + inp.key), valid: true });
      refresh();
      return;
    }
    Promise.resolve(deps.host.pickImageFile()).then(function (file) {
      if (!file) return; // user cancelled the picker — not an error
      return Promise.resolve(imageImport.fromFile(deps.host, file)).then(function (slot) { applySlot(inp, slot); });
    }).catch(function () { applySlot(inp, { source: "file", ref: null, valid: false, reason: "unreadable" }); });
  }

  function addFromWeb(inp, url) {
    if (!imageImport) return;
    var res = imageImport.fromWebLink(deps.host, url);
    if (res && typeof res.then === "function") res.then(function (slot) { applySlot(inp, slot); });
    else applySlot(inp, res);
  }

  function refresh() {
    if (!state.workflowId) return;
    var ev = validator.evaluate(state);
    (state.requiredInputs || []).forEach(function (inp) {
      var mark = nodes["req_" + inp.key];
      if (mark) {
        var okk = !!(inp.image && inp.image.ref);
        // v6.19: a failed capture (no-active-layer, unreadable file, ...)
        // used to look identical to "never touched this slot" — both said
        // "Missing". Show the specific reason when there was an actual
        // failed attempt.
        var failReason = (!okk && inp.image && inp.image.reason && imageImport) ? imageImport.reasonMessage(dom, inp.image.reason) : "";
        mark.textContent = okk ? "✓" : (failReason || "Missing");
        mark.className = "hnk-req-mark " + (okk ? "ok" : "miss");
      }
    });
    var ready = ev.ready;
    var canGenerate = ready && (state.prepared || directMode());
    if (nodes.prepareBtn) {
      var showPrepare = !state.prepared && !directMode();
      nodes.prepareBtn.style.display = showPrepare ? "" : "none";
    }
    if (nodes.generate) {
      nodes.generate.style.display = (state.prepared || directMode()) ? "" : "none";
      dom.setDisabled(nodes.generate, !canGenerate);
    }
    if (nodes.readyMsg) {
      nodes.readyMsg.className = "hnk-status " + (canGenerate ? "ok" : "");
      nodes.readyMsg.textContent = canGenerate ? "All required inputs are ready — press GENERATE."
        : (state.prepared || directMode())
          ? (ev.reasons[0] ? ev.reasons[0].message : "Add the required images.")
          : "Press Prepare to load this workflow and check your images.";
    }
    return ev;
  }

  function doGenerate() {
    if (!state.prepared) wstate.prepare(state); // Direct mode assembles now
    var wf = registry.get(state.workflowId);
    var hint = function (msg) { if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = msg; } };
    /* v6.36.0 — a required design field (Selection Edit's request box) must
       carry text before anything is sent. */
    var missingField = ((wf && wf.fields) || []).some(function (f) {
      return f.required && !String((state.fieldVals && state.fieldVals[f.key]) || "").trim();
    });
    if (missingField) { hint(dom.t("ai_wf_field_req", "Type your request first — the request box cannot be empty.")); return; }
    var ev = validator.evaluate(state);
    if (!ev.ready) { refresh(); return; }
    var fire = function () {
      var request = compiler.compile(state);
      if (deps.onGenerate) deps.onGenerate(request);
    };
    /* v6.36.0 — Selection Edit: capture the live rectangular selection as
       the subject at Generate time. The result is placed back at these exact
       bounds with a layer mask cut from the same rectangle, so pixels
       outside the selection are untouched by construction. */
    if (wf && wf.region && deps.host && deps.host.getSelectionBounds) {
      Promise.resolve(deps.host.getSelectionBounds()).then(function (b) {
        if (!b) { hint(dom.t("ai_wf_select_first", "Make a rectangular selection in Photoshop first, then press GENERATE.")); return; }
        return Promise.resolve(deps.host.captureRegion(b)).then(function (cap) {
          if (!cap || !cap.ref) { hint(dom.t("ai_wf_capture_fail", "Could not read the selected pixels — try again.")); return; }
          if (state.requiredInputs[0]) state.requiredInputs[0].image = { source: "selection", role: state.requiredInputs[0].role, ref: cap.ref, valid: true };
          state.regionBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
          fire();
        });
      }).catch(function () { hint(dom.t("ai_wf_capture_fail", "Could not read the selected pixels — try again.")); });
      return;
    }
    fire();
  }

  function renderSelected() {
    var wf = registry.get(state.workflowId);
    dom.clear(root);
    var back = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfBack", text: "\u2190 " + dom.t("ai_wf_tools", "Workflow Tools") });
    dom.on(back, "click", function () { wstate.reset(state); renderList(); });
    root.appendChild(back);

    root.appendChild(dom.el(doc, "div", { class: "hnk-h-title", text: wf.title }));
    // Signature visual hero for the selected workflow
    if (wf.visual) {
      var hero = dom.el(doc, "div", { class: "hnk-wf-hero" });
      hero.style.backgroundImage = 'url("' + wf.visual + '")';
      root.appendChild(hero);
    }
    // What this workflow protects / uses — meaning at a glance
    var chips = dom.el(doc, "div", { class: "hnk-wf-chips" }, [
      wf.humanSubject ? dom.el(doc, "span", { class: "hnk-wf-chip protect", text: dom.t("ai_identity_lock", "Identity Lock") }) : null,
      wf.referenceTransfer ? dom.el(doc, "span", { class: "hnk-wf-chip", text: dom.t("ai_ref_transfer", "Reference Transfer") }) : null,
      dom.el(doc, "span", { class: "hnk-wf-chip", text: (modelRegistry.getModel(wf.route.modelId) || { displayName: wf.route.modelId }).displayName })
    ]);
    root.appendChild(chips);
    // Click 1 — explanation + expected result
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc",
      text: dom.t(registry.explanationKey(wf.id), wf.explanation) }));

    // v6.35.0 — the workflow's own design controls: poster text, backdrop
    // colour swatches + hex, and one ON/OFF switch per enhancement. The
    // values live on the workflow state and resolve into the prompt at
    // generation time (workflow-request-compiler).
    if (wf.fields && wf.fields.length) {
      var langCode = "en";
      try { langCode = (globalThis.HNK && globalThis.HNK.i18n && globalThis.HNK.i18n.lang && globalThis.HNK.i18n.lang()) || "en"; } catch (e) { }
      var fl = function (lbl) { return (lbl && (lbl[langCode] || lbl.en)) || ""; };
      state.fieldVals = state.fieldVals || {};
      var fwrap = dom.el(doc, "div", { class: "hnk-wf-fields" });
      wf.fields.forEach(function (f) {
        if (state.fieldVals[f.key] === undefined) state.fieldVals[f.key] = f.type === "toggle" ? f.default !== false : (f.default || "");
        var row = dom.el(doc, "div", { class: "hnk-wf-field" });
        row.appendChild(dom.el(doc, "span", { class: "hnk-wf-field-l", text: fl(f.label) || f.key }));
        if (f.type === "toggle") {
          var tb = dom.el(doc, "button", { class: "hnk-btn hnk-wf-sw" + (state.fieldVals[f.key] ? " on" : ""), text: state.fieldVals[f.key] ? "ON" : "OFF" });
          dom.on(tb, "click", function () {
            wstate.setField(state, f.key, !state.fieldVals[f.key]);
            tb.textContent = state.fieldVals[f.key] ? "ON" : "OFF";
            tb.className = "hnk-btn hnk-wf-sw" + (state.fieldVals[f.key] ? " on" : "");
          });
          row.appendChild(tb);
        } else if (f.type === "text") {
          var ti = dom.el(doc, "input", { class: "hnk-input hnk-wf-text" });
          ti.setAttribute("type", "text");
          if (f.ph) ti.setAttribute("placeholder", f.ph);
          ti.value = state.fieldVals[f.key] || "";
          dom.on(ti, "input", function () { wstate.setField(state, f.key, ti.value); });
          row.appendChild(ti);
        } else if (f.type === "color") {
          var sww = dom.el(doc, "div", { class: "hnk-wf-swatches" });
          var hexInp = dom.el(doc, "input", { class: "hnk-input hnk-wf-hex" });
          hexInp.setAttribute("type", "text");
          hexInp.value = state.fieldVals[f.key] || f.default || "";
          dom.on(hexInp, "input", function () { wstate.setField(state, f.key, hexInp.value); });
          (f.swatches || []).forEach(function (swc) {
            var sb = dom.el(doc, "button", { class: "hnk-wf-swatch" });
            sb.style.background = swc;
            sb.setAttribute("aria-label", swc);
            dom.on(sb, "click", function () { wstate.setField(state, f.key, swc); hexInp.value = swc; });
            sww.appendChild(sb);
          });
          sww.appendChild(hexInp);
          row.appendChild(sww);
        }
        fwrap.appendChild(row);
      });
      root.appendChild(fwrap);
    }

    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_req_images", "Required Images") }));
    var reqWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
    state.requiredInputs.forEach(function (inp) {
      /* v6.36.0 — a region workflow's photo comes from the live rectangular
         selection at Generate time: no source buttons, just the slot. */
      if (wf.region && inp.image && inp.image.source === "selection") {
        var mark = dom.el(doc, "span", { class: "hnk-req-mark ok", text: "✓" });
        nodes["req_" + inp.key] = mark;
        reqWrap.appendChild(dom.el(doc, "div", { class: "hnk-req-block" }, [
          dom.el(doc, "div", { class: "hnk-req-row" }, [
            dom.el(doc, "span", { class: "hnk-req-label", text: dom.t(registry.inputLabelKey(inp.label) || "", inp.label) }), mark
          ])
        ]));
      } else {
        reqWrap.appendChild(inputRow(inp));
      }
    });
    if (wf.region) {
      reqWrap.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc",
        text: dom.t("ai_region_hint", "Drag a Rectangle-tool selection over the area to change, type your request above, then press GENERATE. Only the selected area changes — every pixel outside it stays identical.") }));
    }
    root.appendChild(reqWrap);
    if (state.optionalInputs.length) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_opt_images", "Optional Images") }));
      var optWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
      state.optionalInputs.forEach(function (inp) { optWrap.appendChild(inputRow(inp)); });
      root.appendChild(optWrap);
    }

    /* Optional typed instruction for workflows whose prompts act on a user
       request (the web app's guides all expect typed input for these). */
    var INSTRUCTION_WFS = { "object-edit": 1, "text-logo": 1, "water-edit": 1, "bg-replace": 1 };
    if (INSTRUCTION_WFS[wf.id]) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_your_request", "Your Request (optional)") }));
      var uTxt = dom.el(doc, "textarea", { class: "hnk-inp hnk-wf-usertext", id: "hnkWfUserText",
        placeholder: dom.t("ai_your_request_ph", "e.g. remove the chair on the left / write HNK STUDIO in gold serif") });
      uTxt.value = state.userText || "";
      dom.on(uTxt, "input", function () { wstate.setUserText(state, uTxt.value); });
      root.appendChild(uTxt);
    }

    var route = state.resolvedRoute || wf.route;
    var m = modelRegistry.getModel(route.modelId);
    var out = state.output || {};
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-route",
      text: dom.t("ai_model_lbl", "Model") + ": " + (route.auto ? dom.t("qual_auto", "Auto") + " \u00B7 " : "") + (m ? m.displayName : route.modelId) +
            "   ·   Output: " + String(out.size || "2k").toUpperCase() + " · " + (out.ratio || "source") }));

    // Click 2 — Prepare
    nodes.prepareBtn = dom.el(doc, "button", { class: "hnk-btn hnk-prepare", id: "hnkWfPrepare", text: dom.t("ai_prepare", "Prepare (load & check)") });
    dom.on(nodes.prepareBtn, "click", function () { wstate.prepare(state); refresh(); });
    root.appendChild(nodes.prepareBtn);

    nodes.readyMsg = dom.el(doc, "div", { class: "hnk-status", id: "hnkWfStatus" });
    root.appendChild(nodes.readyMsg);

    // Click 3 — Generate
    nodes.generate = dom.el(doc, "button", { class: "hnk-btn hnk-generate", id: "hnkWfGenerate", text: dom.t("btn_generate", "GENERATE") });
    dom.on(nodes.generate, "click", doGenerate);
    root.appendChild(nodes.generate);

    refresh();
  }

  function addFromLibrary(inp) {
    var g = (typeof globalThis !== "undefined") ? globalThis : {};
    var getPick = g.HNK && g.HNK.getLibraryPickDataUrl;
    var hint = function (msg) { if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = msg; } };
    if (!getPick) { hint(dom.t("ai_lib_bridge_off", "Library bridge unavailable on this host.")); return; }
    getPick().then(function (res) {
      if (!res || !res.dataUrl) { hint(dom.t("ai_lib_pick_first", "Pick a photo from the Presets tab \u2192 Visual Library first.")); return; }
      wstate.setInput(state, inp.key, { source: "library", role: inp.role, ref: res.dataUrl, valid: true });
      refresh();
    }).catch(function () { hint(dom.t("ai_lib_load_fail", "Library image could not be loaded.")); });
  }

  function inputRow(inp) {
    var mark = dom.el(doc, "span", { class: "hnk-req-mark miss", text: dom.t("ai_missing", "Missing") });
    nodes["req_" + inp.key] = mark;
    var lbl = dom.t(registry.inputLabelKey(inp.label) || "", inp.label);
    /* All four sources, matching the classic tabs' reference slots. The
       Layer button keeps the historic hnkWfAdd_ id (audit + muscle memory). */
    var add = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfAdd_" + inp.key, text: dom.t("btn_ref_layer", "+ Layer") });
    dom.on(add, "click", function () { addImage(inp); });
    var fileB = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfFile_" + inp.key, text: dom.t("btn_ref_file", "File") });
    dom.on(fileB, "click", function () { addFromFile(inp); });
    var webB = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfWeb_" + inp.key, text: dom.t("btn_ref_web", "Web") });
    var lib = dom.el(doc, "button", { class: "hnk-btn hnk-req-add hnk-req-lib", id: "hnkWfLib_" + inp.key, text: "\u2726 " + dom.t("ai_library", "Library") });
    dom.on(lib, "click", function () { addFromLibrary(inp); });

    /* Web Link entry row \u2014 hidden until its Web button is pressed. */
    var urlInp = dom.el(doc, "input", { class: "hnk-inp hnk-url-inp", id: "hnkWfUrl_" + inp.key,
      attrs: { type: "text", placeholder: dom.t("url_ph", "https://... image link") } });
    var urlGo = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfUrlGo_" + inp.key, text: dom.t("btn_load", "Load") });
    var urlRow = dom.el(doc, "div", { class: "hnk-url-row", id: "hnkWfUrlRow_" + inp.key }, [urlInp, urlGo]);
    urlRow.style.display = "none";
    dom.on(webB, "click", function () {
      var open = urlRow.style.display === "none";
      urlRow.style.display = open ? "" : "none";
      if (open) { try { urlInp.focus(); } catch (e) {} }
    });
    dom.on(urlGo, "click", function () {
      addFromWeb(inp, urlInp.value);
      urlRow.style.display = "none";
    });

    return dom.el(doc, "div", { class: "hnk-req-block" }, [
      dom.el(doc, "div", { class: "hnk-req-row" }, [
        dom.el(doc, "span", { class: "hnk-req-label", text: lbl }), mark, add, fileB, webB, lib
      ]),
      urlRow
    ]);
  }

  function render(mountRoot) {
    root = mountRoot;
    if (state.workflowId) renderSelected(); else renderList();
    return root;
  }

  return { render: render, refresh: refresh, select: select, getState: function () { return state; } };
}

var API = { create: create };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowToolsScreen = API; }
})();
