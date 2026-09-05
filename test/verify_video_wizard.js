/* v6.14.0 — the step-by-step VIDEO WIZARD: 1 Guide · 2 Inputs · 3 Generate · 4 Result.
 *
 * WHY THIS FILE EXISTS. The owner asked for the image→video and video→video
 * cards to walk a student through the run the way the image Smart Workflow
 * cards do — "1 2 3 4, with guides, so students find them easy". The wizard
 * owns no state of its own: the card's apply() has already written the request,
 * the model and the options into the page, the pickers are the page's own file
 * inputs, and Generate presses the page's own button. That is the design, and
 * it is also everything that can go quietly wrong:
 *
 *   - a card tap that applies the card but never opens the guide (or opens it
 *     without the card's own words) leaves the student exactly where they were;
 *   - a slot that lands on the page but never repaints the wizard shows "+"
 *     over a photo that is already there, and Next stays dead;
 *   - a clone of the page's select that does not write back means the student
 *     picked a model the request never used;
 *   - a Generate that does not run the page's own handler produces a result
 *     the page, the history and the Gallery never saw;
 *   - and the panel could retype the words instead of lifting them, so the
 *     same card says two things on two surfaces.
 *
 * Every one of those is driven here, against the shipped source, on both
 * surfaces, with the RunningHub call mocked at the app's own dispatcher so the
 * page's real handler runs end to end. The banners the owner asked for in the
 * same breath (Talk and Video→Video) are checked at the end, both surfaces.
 *
 * Usage: PORT=8931 node test/verify_video_wizard.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { build } = require("../tools/build_panel_video_wizard.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
/* a one-pixel PNG: enough for a slot to be "filled" and drawn */
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

(async () => {
  /* ---- A) the words, read off the shipped block ---- */
  const a = APP.indexOf("/* ---- VWIZ_DATA ----"), b = APP.indexOf("/* ---- /VWIZ_DATA ---- */");
  report("A) the app carries exactly one VWIZ_DATA block", a > 0 && b > a && APP.indexOf("/* ---- VWIZ_DATA ----", a + 1) < 0);
  const D = new Function(APP.slice(a, b) + "\nreturn { DOTS: VWIZ_DOTS, L: VWIZ_L, STEPS: VWIZ_STEPS };")();
  report("A2) four dots — Guide, Inputs, Generate, Result — the image wizard's shape",
    same(D.DOTS, ["Guide", "Inputs", "Generate", "Result"]), D.DOTS);
  const gaps = [];
  Object.keys(D.L).forEach(k => LANGS.forEach(l => { if (!D.L[k][l]) gaps.push(k + "." + l); }));
  ["i2v", "v2v"].forEach(k => LANGS.forEach(l => {
    const s = D.STEPS[k] && D.STEPS[k][l];
    if (!s || s.length !== 4 || s.some(x => !x)) gaps.push("STEPS." + k + "." + l);
  }));
  report("A3) every button word and all four guide lines exist in the nine languages, for both decks",
    gaps.length === 0 && Object.keys(D.L).length >= 20, gaps.slice(0, 8));
  /* the guide is honest in every language: line one asks for the card's own
     inputs ({N} is the badge), line three names the button the student presses */
  const shape = [];
  ["i2v", "v2v"].forEach(k => LANGS.forEach(l => {
    const s = D.STEPS[k][l];
    if (s[0].indexOf("{N}") < 0) shape.push(k + "." + l + ": line 1 never names the inputs");
    if (!/GENERATE/.test(s[2])) shape.push(k + "." + l + ": line 3 never names GENERATE");
    if (s.slice(1).some(x => x.indexOf("{N}") >= 0)) shape.push(k + "." + l + ": {N} outside line 1");
  }));
  report("A4) line one asks for the card's own inputs and line three names the button, in every language",
    shape.length === 0, shape.slice(0, 6));

  /* ---- B) the panel LIFTS the block; it does not retype it ---- */
  const committed = fs.readFileSync(path.join(PANEL, "js", "hnk_video_wizard.js"), "utf8");
  report("B) panel/js/hnk_video_wizard.js is exactly what the app's block produces today",
    committed === build(), "run: node tools/build_panel_video_wizard.js");
  const lifted = require(path.join(PANEL, "js", "hnk_video_wizard.js"));
  report("B2) the lifted module carries the same dots, labels and step lines",
    same(lifted.DOTS, D.DOTS) && same(lifted.L, D.L) && same(lifted.STEPS, D.STEPS) &&
    same(lifted.steps("v2v"), D.STEPS.v2v.en) /* no panel state here → English */,
    { dots: lifted.DOTS });
  const mainJs = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
  const panelHtml = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
  report("B3) both surfaces open the wizard from the card tap, load the lifted words, and repaint when a slot lands",
    APP.indexOf('vidWfApply(w); openVWiz("i2v", w);') >= 0 && APP.indexOf('vtWfApply(w); openVWiz("v2v", w);') >= 0 &&
    APP.indexOf("if(window._vwizOnPick) window._vwizOnPick();") >= 0 &&
    APP.indexOf("window._wizOnPick=renderVWiz; window._vwizOnPick=renderVWiz;") >= 0 &&
    mainJs.indexOf('vidWfApply(w); openVWiz("i2v", w);') >= 0 && mainJs.indexOf('vtWfApply(w); openVWiz("v2v", w);') >= 0 &&
    (mainJs.match(/vwizRepaint\(\);/g) || []).length >= 2 &&
    panelHtml.indexOf('<script src="js/hnk_video_wizard.js"></script>') >= 0 &&
    APP.indexOf(".wslot .th video{") >= 0, "a hook is missing on one surface");

  const VT_PACK = require(path.join(PANEL, "js", "hnk_video_tool_wf.js"));
  const QUIET_IDX = VT_PACK.WF.findIndex(w => !w.text);
  /* the photograph slot: the wizard marks it REQUIRED when the tool demands it or
     the card carries photo:true. Both must agree with what the badge tells the
     student — a badge that says "1 video + 1 photo" over an Optional slot, or a
     required slot under a badge that never asked, is the contradiction this
     rule exists to remove. (Badges that say "optional" are optional.) */
  const TOOLS = (() => { const i = APP.indexOf("var RH_VTOOL_MODELS = ["); const st = APP.indexOf("[", i); let d = 0;
    for (let k = st; k < APP.length; k++) { if (APP[k] === "[") d++; else if (APP[k] === "]") { d--; if (!d) return eval(APP.slice(st, k + 1)); } } })();
  const badgeGaps = [];
  VT_PACK.WF.forEach(w => {
    const t = TOOLS.find(x => x.id === w.model); if (!t) return;
    const promised = /photo/i.test(w.need.en) && !/optional/i.test(w.need.en);
    const required = !!(t.imageParam && (t.imageReq || w.photo));
    if (promised !== required) badgeGaps.push(w.key + ": badge \"" + w.need.en + "\" vs slot " + (required ? "required" : "optional"));
  });
  report("A5) every card's photograph slot is required exactly when its badge promised the photograph",
    badgeGaps.length === 0 && VT_PACK.WF.filter(w => w.photo).length === 3, badgeGaps);

  /* ---- C) the app: the whole walk, both decks, the page's own handler running under a mocked engine ---- */
  const browser = await chromium.launch();
  withPremium(browser);
  let app;
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    app = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const q = s => document.querySelectorAll(s);
      const txt = s => [...q(s)].map(n => n.textContent.trim());
      const isOpen = () => /\bon\b/.test(document.getElementById("wiz").className);
      const lastNav = () => [...q("#wizIn .wiz-nav .btn")].pop();
      state.rhKey = state.rhKey || "TEST_RH_KEY";
      out.lang = LANG;

      /* -- image → video -- */
      switchPage("pgVideo"); await settle();
      q("#vidWfRow .wfmini")[0].click(); await settle();
      out.i2v = {
        open: isOpen(), dots: txt("#wizIn .wiz-dot .l"), onDot: txt("#wizIn .wiz-dot.on .l"),
        steps: txt("#wizIn .wf-step span:not(.n)"), want: VWIZ_STEPS.i2v[LANG].map(s => s.replace("{N}", vwizNeed())),
        title: (document.querySelector("#wizIn .wiz-top .ttl") || {}).textContent,
        art: !!document.querySelector("#wizIn img.wiz-visual"), fastShown: !!document.querySelector("#wizIn .wiz-fast"),
        applied: { model: document.getElementById("selVidModel").value, prompt: document.getElementById("vidPrompt").value.length }
      };
      document.querySelector("#wizIn .wiz-nav .btn-gold").click(); await settle();
      out.i2v.step2 = { onDot: txt("#wizIn .wiz-dot.on .l"), slots: q("#wizIn .wslot").length,
        filled: q("#wizIn .wslot.filled").length, nextDisabled: lastNav().disabled,
        req: txt("#wizIn .wslot .rq") };
      /* the photo lands on the PAGE's slot — the page repaints and so must the wizard */
      state.refs[0] = { mime: "image/png", b64: arg.px, label: "test.png" }; state.imgRoles = null; renderRefs();
      if (window._wizOnPick) window._wizOnPick(); await settle();
      out.i2v.step2b = { filled: q("#wizIn .wslot.filled").length, thumb: !!document.querySelector("#wizIn .wslot .th img"),
        nextDisabled: lastNav().disabled };
      lastNav().click(); await settle();
      const cl = document.getElementById("vwiz_selVidModel");
      out.i2v.step3 = { onDot: txt("#wizIn .wiz-dot.on .l"), gen: !!document.getElementById("vwizGen"),
        clones: ["vwiz_selVidModel", "vwiz_selVidRes", "vwiz_selVidDur"].map(id => !!document.getElementById(id)),
        cloneValue: cl && cl.value, pageValue: document.getElementById("selVidModel").value,
        ta: (document.querySelector("#wizIn textarea") || {}).value, pagePrompt: document.getElementById("vidPrompt").value };
      /* a model picked in the wizard IS the page's model */
      const other = cl && [...cl.options].find(o => o.value !== cl.value && !o.disabled && !o.hidden);
      if (other) { cl.value = other.value; cl.dispatchEvent(new Event("change")); await settle(); }
      out.i2v.sync = { picked: other && other.value, page: document.getElementById("selVidModel").value,
        clone: (document.getElementById("vwiz_selVidModel") || {}).value, pageLabelKnown: !!document.getElementById("vwizGen") };
      /* an edit in the wizard's request box IS an edit in the page's */
      const ta = document.querySelector("#wizIn textarea");
      if (ta) { ta.value = ta.value + " — wizard edit"; ta.dispatchEvent(new Event("input")); }
      out.i2v.taSync = /— wizard edit$/.test(document.getElementById("vidPrompt").value);
      /* GENERATE — the page's own button runs; the engine is mocked at the app's dispatcher */
      const before = state.vidHist.length;
      rhGenerateVideo = async function () { await new Promise(r => setTimeout(r, 300)); return [{ url: arg.clip }]; };
      document.getElementById("vwizGen").click(); await settle();
      out.i2v.busy = { onDot: txt("#wizIn .wiz-dot.on .l"), spin: !!document.getElementById("vwizSpin"),
        pageBusy: document.getElementById("btnVidGen").disabled };
      await until(() => !vwiz.busy); await settle();
      const v = document.querySelector("#wizIn video");
      out.i2v.done = { onDot: txt("#wizIn .wiz-dot.on .l"), video: !!v, src: v && v.getAttribute("src"),
        hist: state.vidHist.length - before, pageResult: /\bon\b/.test(document.getElementById("vidResultBox").className),
        navBtns: q("#wizIn .wiz-nav .btn").length, pageFree: !document.getElementById("btnVidGen").disabled };
      document.querySelector("#wizIn .wiz-x").click(); await settle();
      out.i2v.closed = { open: isOpen(), hooks: window._wizOnPick === null && window._vwizOnPick === null,
        overflow: document.body.style.overflow };

      /* -- video → video -- */
      switchPage("pgV2V"); await settle();
      q("#vtWfRow .wfmini")[0].click(); await settle();
      out.v2v = { open: isOpen(), dots: txt("#wizIn .wiz-dot .l"), steps: txt("#wizIn .wf-step span:not(.n)"),
        want: VWIZ_STEPS.v2v[LANG].map(s => s.replace("{N}", vwizNeed())), need: vwizNeed(),
        model: document.getElementById("selVtModel").value };
      document.querySelector("#wizIn .wiz-nav .btn-gold").click(); await settle();
      out.v2v.step2 = { slots: q("#wizIn .wslot").length, req: txt("#wizIn .wslot .rq"), nextDisabled: lastNav().disabled };
      /* both files land on the page's slots — renderVtPicks carries the repaint */
      state.vtFile = { mime: "video/mp4", b64: "AAAAHGZ0eXBpc29t", name: "clip.mp4" };
      state.vtImg = { mime: "image/png", b64: arg.px };
      renderVtPicks(); await settle();
      out.v2v.step2b = { filled: q("#wizIn .wslot.filled").length, videoThumb: !!document.querySelector("#wizIn .wslot .th video"),
        nextDisabled: lastNav().disabled };
      lastNav().click(); await settle();
      out.v2v.step3 = { gen: !!document.getElementById("vwizGen"), ta: (document.querySelector("#wizIn textarea") || {}).value,
        pagePrompt: document.getElementById("vtPrompt").value, toolLine: txt("#wizIn .wizrow .mut")[0] || "",
        clones: ["vwiz_selVtOpt1", "vwiz_selVtOpt2"].map(id => !!document.getElementById(id)),
        pageOpts: ["selVtOpt1", "selVtOpt2"].map(id => document.getElementById(id).style.display !== "none") };
      const vtBefore = state.vtHist.length;
      rhGenerateVideoTool = async function () { await new Promise(r => setTimeout(r, 300)); return [{ url: arg.clip }]; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.v2v.done = { onDot: txt("#wizIn .wiz-dot.on .l"), video: !!document.querySelector("#wizIn video"),
        hist: state.vtHist.length - vtBefore, pageResult: /\bon\b/.test(document.getElementById("vtResultBox").className) };
      /* "make another" goes back to Inputs with the page's files still in place */
      q("#wizIn .wiz-nav .btn")[1].click(); await settle();
      out.v2v.again = { onDot: txt("#wizIn .wiz-dot.on .l"), filled: q("#wizIn .wslot.filled").length };
      document.querySelector("#wizIn .wiz-x").click(); await settle();

      /* -- the quiet card (no request of its own) and the failure path -- */
      q("#vtWfRow .wfmini")[arg.quietIdx].click(); await settle();
      const fast = document.querySelector("#wizIn .wiz-fast");
      out.quiet = { fast: !!fast };
      if (fast) fast.click(); else { document.querySelector("#wizIn .wiz-nav .btn-gold").click(); await settle(); lastNav().click(); }
      await settle();
      out.quiet.step3 = { onDot: txt("#wizIn .wiz-dot.on .l"), noPrompt: txt("#wizIn .wiz-body .mut").indexOf(vwizL("noPrompt")) >= 0,
        ta: !!document.querySelector("#wizIn textarea"), gen: !!document.getElementById("vwizGen") };
      rhGenerateVideoTool = async function () { const e = new Error("test refusal"); e.code = "failed"; throw e; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.fail = { onDot: txt("#wizIn .wiz-dot.on .l"), warn: !!document.querySelector("#wizIn .wiz-body .warn"),
        err: vwiz.error, pageStatus: document.getElementById("stVtGen").textContent, result: vwiz.result,
        navBtns: q("#wizIn .wiz-nav .btn").length, retryShown: document.getElementById("btnVtRetry").style.display !== "none" };
      document.querySelector("#wizIn .wiz-x").click(); await settle();
      out.closedAll = !isOpen();
      return out;
    }, { px: PX, clip: "http://127.0.0.1:" + PORT + "/lib/banners/motion/hero-mermaid.mp4", quietIdx: QUIET_IDX });
    app.errs = errs;
  } finally {
    await browser.close();
  }

  const I = app.i2v, V = app.v2v;
  report("C) tapping an image→video card applies it AND opens the wizard on Guide, with the card's own art, title and four lines",
    I.open && same(I.dots, D.DOTS) && same(I.onDot, ["Guide"]) && same(I.steps, I.want) && I.steps.length === 4 &&
    I.art && I.title && I.title.length > 2 && I.applied.prompt > 40 && !I.fastShown,
    { open: I.open, dots: I.dots, onDot: I.onDot, steps: I.steps, want: I.want, art: I.art, fast: I.fastShown });
  report("C2) Inputs asks for one photograph, marked required, and Next stays dead until it lands",
    same(I.step2.onDot, ["Inputs"]) && I.step2.slots === 1 && I.step2.filled === 0 && I.step2.nextDisabled === true &&
    same(I.step2.req, [D.L.req[app.lang] || D.L.req.en]), I.step2);
  report("C3) a photo dropped on the PAGE's slot repaints the wizard — slot filled, thumbnail drawn, Next alive",
    I.step2b.filled === 1 && I.step2b.thumb && I.step2b.nextDisabled === false, I.step2b);
  report("C4) Generate mirrors the page: the request box and the model/size/length selects, clones reading the page's values",
    same(I.step3.onDot, ["Generate"]) && I.step3.gen && I.step3.clones.every(Boolean) &&
    I.step3.cloneValue === I.step3.pageValue && I.step3.ta === I.step3.pagePrompt && I.step3.ta.length > 40, I.step3);
  report("C5) a model picked in the wizard is the page's model, and a request edited here is edited there",
    I.sync.picked && I.sync.page === I.sync.picked && I.sync.clone === I.sync.picked && I.taSync === true, { sync: I.sync, taSync: I.taSync });
  report("C6) GENERATE presses the page's own button — the page goes busy, the wizard shows Result running",
    same(I.busy.onDot, ["Result"]) && I.busy.spin && I.busy.pageBusy === true, I.busy);
  report("C7) the result is the page's result: one history entry, the page's result box on, the clip playing in the wizard, three ways on",
    same(I.done.onDot, ["Result"]) && I.done.video && I.done.hist === 1 && I.done.pageResult && I.done.navBtns === 3 &&
    I.done.pageFree && /hero-mermaid\.mp4$/.test(String(I.done.src)), I.done);
  report("C8) closing unwinds everything: the modal, the scroll lock and both pick hooks",
    I.closed.open === false && I.closed.hooks && I.closed.overflow === "", I.closed);
  report("C9) a video→video card opens the same wizard, its first line naming the card's own badge",
    V.open && same(V.dots, D.DOTS) && same(V.steps, V.want) && V.need.length > 2 && V.steps[0].indexOf(V.need) >= 0 &&
    V.model === VT_PACK.WF[0].model, { steps: V.steps, want: V.want, need: V.need, model: V.model });
  report("C10) Inputs shows the video slot AND the reference-photo slot this card's tool requires, both required, Next dead",
    V.step2.slots === 2 && V.step2.req.every(r => r === (D.L.req[app.lang] || D.L.req.en)) && V.step2.nextDisabled === true, V.step2);
  report("C11) the clip and the photo landing on the page fill both slots (the clip as a <video> thumbnail) and free Next",
    V.step2b.filled === 2 && V.step2b.videoThumb && V.step2b.nextDisabled === false, V.step2b);
  report("C12) Generate names the tool, mirrors the request, and clones exactly the option selects the page shows",
    V.step3.gen && V.step3.ta === V.step3.pagePrompt && V.step3.ta.length > 40 && V.step3.toolLine.length > 5 &&
    same(V.step3.clones, V.step3.pageOpts), V.step3);
  report("C13) the video→video result is the page's result too, and Make-another returns to Inputs with the files kept",
    same(V.done.onDot, ["Result"]) && V.done.video && V.done.hist === 1 && V.done.pageResult &&
    same(V.again.onDot, ["Inputs"]) && V.again.filled === 2, { done: V.done, again: V.again });
  report("C14) a card with no request says so on Generate — no request box, the tool does its one job — and files already in place skip straight there",
    app.quiet.fast && same(app.quiet.step3.onDot, ["Generate"]) && app.quiet.step3.noPrompt && !app.quiet.step3.ta && app.quiet.step3.gen, app.quiet);
  report("C15) a refused run shows the page's own status line on Result with one way back, no result, and the page's Retry offered",
    same(app.fail.onDot, ["Result"]) && app.fail.warn && app.fail.err && app.fail.err === app.fail.pageStatus &&
    app.fail.result === null && app.fail.navBtns === 1 && app.fail.retryShown && app.closedAll, app.fail);
  report("C16) no page error anywhere in this journey", app.errs.length === 0, app.errs.slice(0, 3));

  /* ---- D) the panel: the same walk, the lifted words, its own pickers and its own run ---- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  let pan;
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
      catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    pan = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const q = s => document.querySelectorAll(s);
      const txt = s => [...q(s)].map(n => n.textContent.trim());
      const P = window.HNK.videoWizard;
      const visible = () => { const s = document.getElementById("vwizSheet"); return !!s && s.style.display !== "none"; };
      const lastNav = () => [...q("#vwizIn .wiz-nav .btn")].pop();
      const dis = n => /\bdis\b/.test(n.className);
      out.lang = P.lang();
      out.beforeOpen = !document.getElementById("vwizSheet");

      switchPage("video"); await settle();
      q("#vidWfRow .wfmini")[0].click(); await settle();
      out.i2v = { open: visible(), dots: txt("#vwizIn .wiz-dot .l"), onDot: txt("#vwizIn .wiz-dot.on .l"),
        steps: txt("#vwizIn .wf-step span:not(.n)"), want: P.steps("i2v").map(s => s.replace("{N}", vwizNeed())),
        title: ((document.querySelector("#vwizIn .wiz-top .ttl") || {}).textContent || "").trim(),
        art: !!document.querySelector("#vwizIn img.wiz-visual"), pagePrompt: document.getElementById("vidPromptP").value.length };
      document.querySelector("#vwizIn .wiz-nav .btn-gold").click(); await settle();
      out.i2v.step2 = { onDot: txt("#vwizIn .wiz-dot.on .l"), slots: q("#vwizIn .wslot").length, nextDis: dis(lastNav()) };
      ffSlotSet(0, { mime: "image/png", b64: arg.px, label: "test.png" }); await settle();
      out.i2v.step2b = { filled: q("#vwizIn .wslot.filled").length, thumb: !!document.querySelector("#vwizIn .wslot .th .im"), nextDis: dis(lastNav()) };
      lastNav().click(); await settle();
      const cl = document.getElementById("vwiz_vidModel");
      out.i2v.step3 = { onDot: txt("#vwizIn .wiz-dot.on .l"), gen: !!document.getElementById("vwizGen"), clone: !!cl,
        cloneValue: cl && cl.value, pageValue: document.getElementById("vidModel").value,
        ta: (document.querySelector("#vwizIn textarea") || {}).value, pagePrompt: document.getElementById("vidPromptP").value };
      const other = cl && [...cl.options].find(o => o.value !== cl.value && !o.disabled && !o.hidden);
      if (other) { cl.value = other.value; cl.dispatchEvent(new Event("change")); await settle(); }
      out.i2v.sync = { picked: other && other.value, page: document.getElementById("vidModel").value,
        shown: ((document.getElementById("vidModelVal") || {}).textContent || "").trim() };
      const before = vidHist.length;
      vidGenerate = async function () { await new Promise(r => setTimeout(r, 250)); vidHist.unshift({ url: arg.clip, prompt: "p", ts: Date.now() }); };
      document.getElementById("vwizGen").click(); await settle();
      out.i2v.busy = txt("#vwizIn .wiz-dot.on .l");
      await until(() => !vwiz.busy); await settle();
      out.i2v.done = { onDot: txt("#vwizIn .wiz-dot.on .l"), video: !!document.querySelector("#vwizIn video"),
        hist: vidHist.length - before, navBtns: q("#vwizIn .wiz-nav .btn").length };
      document.querySelector("#vwizIn .wiz-x").click(); await settle();
      out.i2v.closed = !visible();

      switchPage("v2v"); await settle();
      q("#vtWfRow .wfmini")[0].click(); await settle();
      out.v2v = { open: visible(), dots: txt("#vwizIn .wiz-dot .l"), steps: txt("#vwizIn .wf-step span:not(.n)"),
        want: P.steps("v2v").map(s => s.replace("{N}", vwizNeed())), need: vwizNeed(), model: document.getElementById("vtModel").value };
      document.querySelector("#vwizIn .wiz-nav .btn-gold").click(); await settle();
      out.v2v.step2 = { slots: q("#vwizIn .wslot").length, names: txt("#vwizIn .wslot .nm"), nextDis: dis(lastNav()) };
      /* the page's own three inputs land: the clip, the photograph, the save folder */
      VT.video = { name: "clip.mp4", _url: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", _size: "12 B" };
      VT.img = { mime: "image/png", b64: arg.px, _url: "data:image/png;base64," + arg.px };
      VT.out = { name: "Renders" };
      renderVt(); await settle();
      out.v2v.step2b = { filled: q("#vwizIn .wslot.filled").length, nextDis: dis(lastNav()) };
      lastNav().click(); await settle();
      out.v2v.step3 = { gen: !!document.getElementById("vwizGen"), ta: (document.querySelector("#vwizIn textarea") || {}).value,
        pagePrompt: document.getElementById("vtPrompt").value, toolLine: txt("#vwizIn .wizrow .mut")[0] || "",
        clones: ["vwiz_vtOpt", "vwiz_vtOpt2"].map(id => !!document.getElementById(id)),
        pageOpts: ["vtOpt", "vtOpt2"].map(id => document.getElementById(id).style.display !== "none") };
      vtRun = async function () { await new Promise(r => setTimeout(r, 250)); VT.rows = [{ label: "hnk-videotool-1.mp4", level: "ok", detail: "saved" }]; renderVt(); };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.v2v.done = { onDot: txt("#vwizIn .wiz-dot.on .l"), rows: txt("#vwizIn .wiz-body .mut"), navBtns: q("#vwizIn .wiz-nav .btn").length };
      document.querySelector("#vwizIn .wiz-x").click(); await settle();
      out.v2v.closed = !visible();
      return out;
    }, { px: PX, clip: "http://127.0.0.1:" + port + "/x.mp4" });
    pan.errs = errs;
  } finally {
    await pb.close();
    server.close();
  }

  const PI = pan.i2v, PV = pan.v2v;
  report("D) the panel builds no sheet until a card is tapped, then opens on Guide with the same four dots and the lifted lines",
    pan.beforeOpen && PI.open && same(PI.dots, D.DOTS) && same(PI.onDot, ["Guide"]) && same(PI.steps, PI.want) &&
    PI.steps.length === 4 && PI.art && PI.title.length > 2 && PI.pagePrompt > 40,
    { before: pan.beforeOpen, open: PI.open, dots: PI.dots, steps: PI.steps, want: PI.want, art: PI.art });
  report("D2) the same words on both surfaces: dots identical, and the Burmese guide lines the panel draws are the app's block verbatim",
    same(PI.dots, I.dots) && pan.lang === "my" && same(PI.steps, D.STEPS.i2v.my.map(s => s.replace("{N}", "၁ ပုံ"))) &&
    same(PV.steps, D.STEPS.v2v.my.map(s => s.replace("{N}", PV.need))),
    { panelLang: pan.lang, panel: PI.steps, block: D.STEPS.i2v.my, v2v: PV.steps });
  report("D3) Inputs: one photo slot, Next dead; the panel's slot filling (ffSlotSet → renderRefs) repaints the wizard and frees Next",
    same(PI.step2.onDot, ["Inputs"]) && PI.step2.slots === 1 && PI.step2.nextDis === true &&
    PI.step2b.filled === 1 && PI.step2b.thumb && PI.step2b.nextDis === false, { step2: PI.step2, step2b: PI.step2b });
  report("D4) Generate clones the page's model select and mirrors its request; a pick here lands on the page and on its painted label",
    same(PI.step3.onDot, ["Generate"]) && PI.step3.gen && PI.step3.clone && PI.step3.cloneValue === PI.step3.pageValue &&
    PI.step3.ta === PI.step3.pagePrompt && PI.step3.ta.length > 40 &&
    PI.sync.picked && PI.sync.page === PI.sync.picked && PI.sync.shown.length > 0, { step3: PI.step3, sync: PI.sync });
  report("D5) GENERATE runs the page's own vidGenerate: Result running, then the new history entry playing, three ways on, and Close hides the sheet",
    same(PI.busy, ["Result"]) && same(PI.done.onDot, ["Result"]) && PI.done.video && PI.done.hist === 1 && PI.done.navBtns === 3 && PI.closed,
    { busy: PI.busy, done: PI.done, closed: PI.closed });
  report("D6) video→video on the panel asks for THREE inputs — the clip, the photograph and the save folder Photoshop writes to — all before Next",
    PV.open && same(PV.dots, D.DOTS) && PV.model === VT_PACK.WF[0].model && PV.step2.slots === 3 && PV.step2.nextDis === true &&
    PV.step2.names.some(n => n === (D.L.slotRef.my)) && PV.step2b.filled === 3 && PV.step2b.nextDis === false,
    { step2: PV.step2, step2b: PV.step2b, model: PV.model });
  report("D7) Generate names the tool, mirrors the request, clones exactly the option selects the page shows; vtRun's saved row is the Result",
    PV.step3.gen && PV.step3.ta === PV.step3.pagePrompt && PV.step3.ta.length > 40 && PV.step3.toolLine.length > 5 &&
    same(PV.step3.clones, PV.step3.pageOpts) && same(PV.done.onDot, ["Result"]) &&
    PV.done.rows.some(r => /hnk-videotool-1\.mp4 · saved/.test(r)) && PV.done.navBtns === 2 && PV.closed,
    { step3: PV.step3, done: PV.done });
  report("D8) no page error on the panel", pan.errs.length === 0, pan.errs.slice(0, 3));

  /* ---- E) the two pages' own hero banners, both surfaces, still + motion pair ---- */
  const bannersDir = path.join(ROOT, "docs", "app", "lib", "banners");
  const pairs = ["banner-talk-photo", "banner-v2v-portal"].map(n => ({ n,
    still: fs.existsSync(path.join(bannersDir, n + ".jpg")) && fs.statSync(path.join(bannersDir, n + ".jpg")).size > 50000,
    mp4: fs.existsSync(path.join(bannersDir, "motion", n + ".mp4")) && fs.statSync(path.join(bannersDir, "motion", n + ".mp4")).size > 100000,
    webm: fs.existsSync(path.join(bannersDir, "motion", n + ".webm")) && fs.statSync(path.join(bannersDir, "motion", n + ".webm")).size > 100000,
    panel: fs.existsSync(path.join(PANEL, "icons", "banners", n + ".jpg")) && fs.statSync(path.join(PANEL, "icons", "banners", n + ".jpg")).size > 10000,
    announced: APP.indexOf('"' + n + '"') >= 0 }));
  const talkHero = /<div class="page" id="pgTalk">\s*<header class="page-hero"><img src="lib\/banners\/banner-talk-photo\.jpg"/.test(APP);
  const v2vHero = /<div class="page" id="pgV2V">\s*<header class="page-hero"><img src="lib\/banners\/banner-v2v-portal\.jpg"/.test(APP);
  const panelTalk = /id="pageTalk">\s*<div class="phero">\s*<img src="icons\/banners\/banner-talk-photo\.jpg"/.test(panelHtml);
  const panelV2V = /id="pageV2V">\s*<div class="phero">\s*<img src="icons\/banners\/banner-v2v-portal\.jpg"/.test(panelHtml);
  report("E) the Talk and Video→Video pages wear their own hero banners on both surfaces — stills, mp4+webm pairs on disk, and announced to the clip system",
    pairs.every(p => p.still && p.mp4 && p.webm && p.panel && p.announced) && talkHero && v2vHero && panelTalk && panelV2V,
    { pairs, talkHero, v2vHero, panelTalk, panelV2V });

  if (failures) { console.log("\n" + failures + " check(s) failed."); process.exit(1); }
  console.log("\nAll checks passed — the 1-2-3-4 video wizard walks both decks on both surfaces with one set of words, and the two pages wear their own banners.");
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
