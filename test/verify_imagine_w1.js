/* 6.29.0 wave — IMAGINE W1: one-tap AI tools under Edit. A hub of four tools (Lighting 12 · Portrait scene 15 ·
   Surface 15 · Weather 12 templates) and one tool view — a strip of up to eleven photos, a Before | After compare,
   Templates / Describe, Model + Size, Apply / Apply to all / Export. ONE module draws it on the web app and, lifted
   verbatim by tools/build_panel_imagine.js, on the Photoshop panel.
   A) source pins on both surfaces and the lift in sync; B) the page in Chromium — hub, templates, a mocked Apply
   through the studio's own RunningHub path (upload → submit → query → download), the prompt frame, Apply to all,
   Stop, Export, the compare slider, nine languages, restore; C) the panel boots the same module.
   Usage: PORT=8931 node test/verify_imagine_w1.js  (serve docs/app on $PORT first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_MAIN = fs.readFileSync(path.join(ROOT, "panel/main.js"), "utf8");
const PANEL_HTML = fs.readFileSync(path.join(ROOT, "panel/index.html"), "utf8");
const PANEL_CSS = fs.readFileSync(path.join(ROOT, "panel/styles.css"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel/js/hnk_imagine.js"), "utf8");
const RH_CFG = fs.readFileSync(path.join(ROOT, "panel/src/providers/runninghub-config.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const lifter = require("../tools/build_panel_imagine.js");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 600)));
  if (!ok) failures++;
}
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = o => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].trim().length > 0);

/* ---------------- A) source ---------------- */
const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
const DATA = (() => { const a = mod.indexOf("var IMAGINE_DATA = ") + "var IMAGINE_DATA = ".length, b = mod.indexOf(";\nvar IMAGINE = (function(){", a); return new Function("return " + mod.slice(a, b))(); })();   /* the data block, as the page sees it */
const COUNTS = { lighting: 12, portrait: 15, surface: 15, weather: 12 };
report("A1) the page is registered after Freeform and the Edit roster carries it (6 pages)",
  /\["pgCreate","i-pen","Freeform"\],\n\s*\["pgImagine","i-wand","Imagine"\]/.test(APP) &&
  /pages:\["pgCreate","pgImagine","pgMeitu","pgEvoto","pgRetouch","pgPath"\]/.test(APP) &&
  /<div class="page" id="pgImagine">/.test(APP) && /<div id="imRoot"><\/div>/.test(APP) &&
  /<input type="file" id="imFile" accept="image\/\*" multiple/.test(APP) && /id="phImagine"/.test(APP) &&
  /\["phImagine","ph_imagine"\]/.test(APP) && (APP.match(/\n  ph_imagine:\{/g) || []).length === 2, null);
report("A2) four tools, 54 templates, every string in the studio's nine languages, the prompt frame present",
  DATA.tools.length === 4 && DATA.tools.every(t => COUNTS[t.id] === t.presets.length && all9(t.name) && all9(t.sum) && /\{P\}/.test(t.basePrompt) && t.presets.every(p => all9(p.name) && p.p.length > 20)) &&
  DATA.tools.reduce((n, t) => n + t.presets.length, 0) === 54 && Object.keys(DATA.ui).length >= 30 && Object.keys(DATA.ui).every(k => all9(DATA.ui[k])) &&
  /IDENTITY LOCK/.test(DATA.frame.keep) && /REALISM/.test(DATA.frame.real) && /AVOID/.test(DATA.frame.avoid) && /TASK GUARD/.test(DATA.frame.guard),
  { tools: DATA.tools.map(t => t.id + ":" + t.presets.length), ui: Object.keys(DATA.ui).length });
/* every model the picker offers exists on BOTH surfaces — no invented apiPath, no panel-only id */
const rhBlock = (() => { const i = APP.indexOf("var RH_MODELS = ["); let d = 0, j = APP.indexOf("[", i), k; for (k = j; k < APP.length; k++) { if (APP[k] === "[") d++; else if (APP[k] === "]") { d--; if (!d) break; } } return new Function("return " + APP.slice(j, k + 1))(); })();
const appIds = new Set(rhBlock.map(m => m.id)), missingApp = DATA.models.filter(m => !appIds.has(m.id)).map(m => m.id);
const missingPanel = DATA.models.filter(m => RH_CFG.indexOf('"' + m.id + '"') < 0 && RH_CFG.indexOf("'" + m.id + "'") < 0).map(m => m.id);
report("A3) the eight models exist in the app's RH_MODELS and in the panel's runninghub-config (no invented endpoints)",
  DATA.models.length === 8 && !missingApp.length && !missingPanel.length, { missingApp, missingPanel });
report("A4) the app host: nativePick over the add buttons, rhGenerateOne on the chosen model, the Gallery with the original as Before, switchPage repaints on entry",
  /nativePick\(btn, "imFile"\)/.test(APP) && /rhGenerateOne\(state\.rhKey, cfg\.apiPath, o\.prompt, "", \[o\.dataUrl\], rhV2Resolution\(o\.size\), cfg/.test(APP) &&
  /page:"pgImagine", before: m \? \{ mime:m\[1\], b64:m\[2\] \} : null/.test(APP) && /IMAGINE\.init\(host, \$\("imRoot"\)\)/.test(APP) &&
  /if\(id==="pgImagine" && typeof imagineOnEnter==="function"\)/.test(APP) && (APP.match(/\/\* ---- IMAGINE_HOST ---- \*\//g) || []).length === 1, null);
report("A5) What's New announces it (kind page → pgImagine, nine languages)",
  /\{ v:"6\.29\.0", kind:"page", ref:"pgImagine",\n\s*t:\{my:/.test(APP) && (() => { const i = APP.indexOf('{ v:"6.29.0", kind:"page", ref:"pgImagine"'); const row = APP.slice(i, APP.indexOf(" },\n", i)); return LANGS.every(l => new RegExp("\\b" + l + ':"').test(row)); })(), null);
/* art on both surfaces */
const ART = path.join(ROOT, "docs/app/lib/wf/imagine"), PART = path.join(ROOT, "panel/icons/imagine");
/* 6.29.1 wave — the card picture is a Before | After PAIR (the generated base photograph, the cardPreset result), both 2:3 and
   the same size so nothing is cropped in the compare; the page hero has a still AND a motion clip pair (mp4 + webm). */
function jpegSize(file) {
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); }
  return null;
}
const wantFiles = DATA.tools.flatMap(t => [t.before, t.after]).concat(DATA.tools.flatMap(t => t.presets.map(p => "th/" + t.id + "-" + p.id + ".jpg")));
const missingArt = wantFiles.filter(f => !fs.existsSync(path.join(ART, f)) || fs.statSync(path.join(ART, f)).size < 4000);
const driftArt = wantFiles.filter(f => !fs.existsSync(path.join(PART, f)) || !fs.readFileSync(path.join(ART, f)).equals(fs.readFileSync(path.join(PART, f))));
const cardShapes = DATA.tools.map(t => { const b = fs.existsSync(path.join(ART, t.before)) && jpegSize(path.join(ART, t.before)), a = fs.existsSync(path.join(ART, t.after)) && jpegSize(path.join(ART, t.after)); return { id: t.id, b, a, ok: !!(b && a && b.w === a.w && b.h === a.h && Math.abs(b.w / b.h - 2 / 3) < 0.01 && b.w >= 600) }; });
const staleCards = DATA.tools.filter(t => fs.existsSync(path.join(ART, "card-" + t.id + ".jpg")) || fs.existsSync(path.join(PART, "card-" + t.id + ".jpg"))).map(t => t.id);
report("A6) card Before | After pairs (4 × 2, each pair one 2:3 size — nothing cropped) + template thumbnails (54) + the page banner exist, the old composite cards are gone, and the panel carries the same bytes",
  !missingArt.length && !driftArt.length && cardShapes.every(c => c.ok) && !staleCards.length && fs.existsSync(path.join(ROOT, "docs/app/lib/banners/banner-imagine.jpg")) && fs.existsSync(path.join(ROOT, "panel/icons/banners/banner-imagine.jpg")),
  { missingArt: missingArt.slice(0, 5), driftArt: driftArt.slice(0, 5), files: wantFiles.length, cardShapes: cardShapes.filter(c => !c.ok), staleCards });
const MOTION = path.join(ROOT, "docs/app/lib/banners/motion");
report("A6b) the Imagine hero has its motion clip pair (mp4 + webm, 0.3–4 MB each) and it is announced in PH_MOTION_CLIPS, the README and the v441 sweep",
  ["mp4", "webm"].every(e => fs.existsSync(path.join(MOTION, "banner-imagine." + e)) && fs.statSync(path.join(MOTION, "banner-imagine." + e)).size > 300000 && fs.statSync(path.join(MOTION, "banner-imagine." + e)).size < 4000000) &&
  /var PH_MOTION_CLIPS=\[[^\]]*"banner-imagine"\]/.test(APP) && /banner-imagine\.mp4/.test(fs.readFileSync(path.join(MOTION, "README.txt"), "utf8")) &&
  /"banner-imagine"\]/.test(fs.readFileSync(path.join(ROOT, "test/sweep_v441_upgrades.js"), "utf8")) && /v57\.listed === 15/.test(fs.readFileSync(path.join(ROOT, "test/sweep_v441_upgrades.js"), "utf8")),
  ["mp4", "webm"].map(e => fs.existsSync(path.join(MOTION, "banner-imagine." + e)) ? fs.statSync(path.join(MOTION, "banner-imagine." + e)).size : "missing"));
const dry = lifter.build({ dry: true });
report("A7) the panel's module, CSS and art are exactly what the lift produces from the app today (run: node tools/build_panel_imagine.js)",
  dry.changed.length === 0 && PANEL_JS.indexOf(mod) >= 0 && /globalThis\.HNK\.imagine = IMAGINE;/.test(PANEL_JS) &&
  PANEL_CSS.indexOf(lifter.C0) >= 0 && PANEL_CSS.indexOf(lifter.C1) >= 0 && (() => { const b = lifter.between(PANEL_CSS, lifter.C0, lifter.C1, "panel css"); return b.indexOf("#pageImagine") >= 0 && b.indexOf("#pgImagine") < 0 && b.indexOf("var(--gold") < 0 && b.indexOf("var(--cream)") < 0 && b.indexOf("var(--accent)") >= 0; })(), dry.changed);
report("A8) the panel registers the page (Edit · Imagine, after Freeform), boots the module on entry, paints its hero head, and repaints on a language change",
  /\{ key: "prompt",[^\n]*\n[^\n]*\n\s*\{ key: "imagine", page: "pageImagine", group: "edit",\s*sub: "Imagine",\s*ic: "i-wand" \}/.test(PANEL_MAIN) &&
  /if \(key === "imagine"\) \{ try \{ imagineEnter\(\); \}/.test(PANEL_MAIN) && /phImagine: \{"my":/.test(PANEL_MAIN) &&
  /im\.init\(imagineHost\(\), \$\("imRoot"\)\)/.test(PANEL_MAIN) && /REFRESHERS\.push\(function \(\) \{ try \{ if \(imagineReady\) imagineEnter\(\); \}/.test(PANEL_MAIN) &&
  /callImageAPI\(o\.modelId, parts, \{ size: String\(o\.size \|\| ""\)\.toUpperCase\(\) \}, o\.signal\)/.test(PANEL_MAIN) && /await placeResultToPS\(\);/.test(PANEL_MAIN) &&
  /<div class="page apg" id="pageImagine">/.test(PANEL_HTML) && /<script src="js\/hnk_imagine\.js"><\/script>/.test(PANEL_HTML) &&
  PANEL_HTML.indexOf('src="js/hnk_imagine.js"') > PANEL_HTML.indexOf('src="js/hnk_whats_new.js"') && PANEL_HTML.indexOf('src="js/hnk_imagine.js"') < PANEL_HTML.indexOf('src="main.js"'), null);
report("A9) CI runs this test", /PORT=8931 node test\/verify_imagine_w1\.js/.test(CI), null);
report("A10) the module is ES5 and UXP-safe (no arrow functions / template literals / let / const, no CSS grid, no inline svg of its own)",
  !/=>/.test(mod) && !/`/.test(mod) && !/\b(let|const)\s/.test(mod) && !/innerHTML\s*=/.test(mod) &&
  !/display:\s*grid/.test(lifter.between(APP, lifter.C0, lifter.C1, "css")) && !/\bgap:/.test(lifter.between(APP, lifter.C0, lifter.C1, "css")), null);

/* ---------------- B) the page in the browser ---------------- */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_B64_2 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const MOCK = `(function(){
  window.__reqs = []; window.__hang = false; window.__outB64 = "${PNG_B64}";
  var realFetch = window.fetch;
  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf("mock.runninghub.test") >= 0) {
      var bin = atob(window.__outB64), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
    }
    if (u.indexOf("www.runninghub.ai") >= 0) {
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/in.png",fileName:"openapi/in.png",size:"100"}}), {status:200}));
      if (u.indexOf("/openapi/v2/query") >= 0)
        return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u, parseError: String(e) }); }
      if (window.__hang) return new Promise(function(resolve, reject){ if (opts && opts.signal) opts.signal.addEventListener("abort", function(){ var e=new Error("aborted"); e.name="AbortError"; reject(e); }); });
      return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200})); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  window.__gal = []; var _ga = null;
  Object.defineProperty(window, "__spyGallery", { value: function(){ if (_ga) return; _ga = window.galleryAdd; window.galleryAdd = function(out, snip, meta){ window.__gal.push({ mime: out.mime, b64: out.b64, snip: snip, page: meta && meta.page, before: !!(meta && meta.before) }); return Promise.resolve(true); }; } });
  window.__dl = []; HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
})();`;

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.addInitScript(MOCK);
  const open = async (q) => { await page.goto(`http://127.0.0.1:${PORT}/index.html${q || ""}`, { waitUntil: "load" }); await page.waitForTimeout(900); };
  await open("?page=pgImagine");
  const hub = await page.evaluate(() => ({
    on: /\bon\b/.test(document.getElementById("pgImagine").className), cards: [...document.querySelectorAll("#pgImagine .im-card")].map(c => c.getAttribute("data-tool")),
    subtabs: [...document.querySelectorAll("#subtabbar .subtab")].map(b => b.textContent.trim()), active: (document.querySelector("#subtabbar .subtab.on") || {}).textContent,
    h2: (document.querySelector("#pgImagine .im-hub h2") || {}).textContent, head: document.getElementById("phImagine").textContent }));
  report("B1) ?page=pgImagine opens the hub: four cards in order, Edit shows six subtabs with Imagine active, the headline is painted",
    hub.on && hub.cards.join(",") === "lighting,portrait,surface,weather" && hub.subtabs.length === 6 && /Imagine/.test(hub.active || "") && /IMAGINE/.test(hub.h2 || "") && hub.head.length > 8, hub);
  /* the strings are the module's own, in the current language (my by default) */
  const strs = await page.evaluate(() => ({ h2: document.querySelector("#pgImagine .im-hub h2").textContent.trim(), want: IMAGINE_DATA.ui.hub_h2[LANG], chips: [...document.querySelectorAll("#pgImagine .im-tplcount")].map(c => c.textContent), lang: LANG }));
  report("B2) the hub reads in the app's language and every card names its template count", strs.h2 === strs.want && strs.chips.length === 4 && strs.chips.every(c => /12|15/.test(c)), strs);
  /* 6.29.1 wave — the card picture is a real Before | After compare, dragged on the picture, and a tap still opens the tool */
  const hubCmp = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll("#pgImagine .im-card")];
    const shape = cards.map(c => ({ base: !!c.querySelector(".im-hubcmp img.im-base"), top: !!c.querySelector(".im-hubcmp .im-cmp-top img.im-orig"), knob: !!c.querySelector(".im-hubcmp .im-cmp-knob"), labels: c.querySelectorAll(".im-hubcmp .im-lb").length, w0: c.querySelector(".im-hubcmp .im-cmp-top").style.width }));
    const art = cards[0].querySelector(".im-hubcmp"); const r = art.getBoundingClientRect();
    const ev = (type, x) => art.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 }));
    ev("pointerdown", r.left + r.width * 0.5); const lifted = cards[0].classList.contains("lift");
    ev("pointermove", r.left + r.width * 0.55); ev("pointermove", r.left + r.width * 0.72); ev("pointerup", r.left + r.width * 0.72);
    await new Promise(x => setTimeout(x, 60));
    const afterDrag = { w: cards[0].querySelector(".im-hubcmp .im-cmp-top").style.width, line: cards[0].querySelector(".im-hubcmp .im-cmp-line").style.left, split: IMAGINE.hubSplit().lighting, stillHub: IMAGINE.state.tool === null && document.querySelectorAll("#pgImagine .im-card").length === 4 };
    await new Promise(x => setTimeout(x, 260)); const unlifted = !cards[0].classList.contains("lift");
    /* a plain tap (no movement) opens the tool */
    const art2 = document.querySelectorAll("#pgImagine .im-card")[1].querySelector(".im-hubcmp"); const r2 = art2.getBoundingClientRect();
    const ev2 = (type) => art2.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r2.left + r2.width / 2, clientY: r2.top + r2.height / 2, pointerId: 2, pointerType: "touch", isPrimary: true, button: 0 }));
    ev2("pointerdown"); ev2("pointerup"); await new Promise(x => setTimeout(x, 80));
    const opened = IMAGINE.state.tool; IMAGINE.goHub(); await new Promise(x => setTimeout(x, 40));
    const kept = document.querySelector('#pgImagine .im-card[data-tool="lighting"] .im-cmp-top').style.width;
    const cs = getComputedStyle(document.querySelector("#pgImagine .im-card")); const hover = /transform/.test(cs.transitionProperty || "") || /transform/.test(cs.transition || "");
    const motion = { listed: PH_MOTION_CLIPS.indexOf("banner-imagine") >= 0, video: !!document.querySelector("#pgImagine .page-hero video.ph-motion") };
    return { shape, lifted, afterDrag, unlifted, opened, kept, hover, motion };
  });
  report("B2b) every hub card is a Before | After compare (after as the picture, before clipped on top, knob, two labels, 50% start); a drag moves the line to ~72%, keeps the hub, and the split is remembered",
    hubCmp.shape.every(x => x.base && x.top && x.knob && x.labels === 2 && x.w0 === "50%") && hubCmp.afterDrag.w === "72%" && hubCmp.afterDrag.line === "72%" && hubCmp.afterDrag.split === 72 && hubCmp.afterDrag.stillHub && hubCmp.kept === "72%", hubCmp);
  report("B2c) the card lifts under a finger (lift class on pointerdown, gone after release; hover transitions transform), a plain tap on the picture opens that tool, and the hero carries its motion clip",
    hubCmp.lifted && hubCmp.unlifted && hubCmp.opened === "portrait" && hubCmp.hover && hubCmp.motion.listed && hubCmp.motion.video, { lifted: hubCmp.lifted, unlifted: hubCmp.unlifted, opened: hubCmp.opened, hover: hubCmp.hover, motion: hubCmp.motion });
  /* open each tool: tile count, back to hub */
  const tools = await page.evaluate(async () => {
    const out = {};
    for (const t of IMAGINE_DATA.tools) {
      document.querySelector('#pgImagine .im-card[data-tool="' + t.id + '"] .im-open').click();
      await new Promise(r => setTimeout(r, 60));
      out[t.id] = { tiles: document.querySelectorAll("#imTpls .im-tpl").length, title: document.querySelector(".im-tooltitle").textContent.trim(), tab: document.querySelector(".im-tab.on").getAttribute("data-tab"), restored: IMAGINE.state.tool,
        empty: !!document.getElementById("imAddBig"), hasApply: !!document.getElementById("imApply"), models: document.querySelectorAll("#imModel option").length, size: [...document.querySelectorAll("#imSize option")].map(o => o.textContent).join("/") };
      document.getElementById("imBack").click();
      await new Promise(r => setTimeout(r, 60));
      out[t.id].backToHub = document.querySelectorAll("#pgImagine .im-card").length === 4 && IMAGINE.state.tool === null;
    }
    return out;
  });
  report("B3) each card opens its tool view (12 · 15 · 15 · 12 templates, Templates tab, empty stage with Add photos, Model + Size), and ← Imagine returns to the hub",
    ["lighting", "portrait", "surface", "weather"].every(id => tools[id].tiles === COUNTS[id] && tools[id].empty && tools[id].hasApply && tools[id].models >= 6 && tools[id].size === "1K/2K/4K" && tools[id].backToHub && tools[id].tab === "tpl"), tools);
  /* photos in, template picked, mocked Apply */
  const flow = await page.evaluate(async (pngs) => {
    IMAGINE.openTool("lighting");
    IMAGINE.addPhotos([{ dataUrl: "data:image/png;base64," + pngs[0], name: "a.png" }, { dataUrl: "data:image/png;base64," + pngs[1], name: "b.png" }]);
    await new Promise(r => setTimeout(r, 50));
    const strip = document.querySelectorAll("#imStrip .im-th:not(.im-add)").length, add = !!document.getElementById("imAdd"), count = document.querySelector(".im-count").textContent;
    /* Apply with nothing chosen → refused, nothing sent */
    document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 50));
    const refused = window.__reqs.length === 0 && !IMAGINE.state.busy;
    /* pick Golden Rim Light */
    document.querySelector('#imTpls .im-tpl[data-preset="goldRim"]').click(); await new Promise(r => setTimeout(r, 50));
    const picked = document.querySelector('#imTpls .im-tpl.on') && document.querySelector('#imTpls .im-tpl.on').getAttribute("data-preset");
    const hint = document.querySelector(".im-tplhint").textContent;
    /* no key → refused, sent to Setup */
    const svKey = state.rhKey; state.rhKey = "";
    document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 80));
    const noKey = window.__reqs.length === 0 && curPage === "pgHome";
    state.rhKey = "rh-test-key-value-placeholder"; switchPage("pgImagine"); await new Promise(r => setTimeout(r, 80));
    window.__spyGallery();
    document.getElementById("imApply").click();
    const t0 = Date.now(); while (Date.now() - t0 < 8000 && (IMAGINE.state.busy || !IMAGINE.state.photos[IMAGINE.state.cur].out)) await new Promise(r => setTimeout(r, 40));
    const p = IMAGINE.state.photos[IMAGINE.state.cur];
    const req = window.__reqs[0] || {};
    return { strip, add, count, refused, picked, hint, noKey, sentOnce: window.__reqs.length === 1, url: req.url, prompt: (req.body && req.body.prompt) || "", hasImage: !!(req.body && (req.body.imageUrls || req.body.imageUrl || req.body.image)),
      out: !!(p.out && p.out.b64), outB64: p.out && p.out.b64, cmp: !!document.querySelector(".im-cmp-top"), range: !!document.getElementById("imSplit"), badge: (document.querySelector(".im-badge") || {}).textContent, status: document.getElementById("imStatus").textContent,
      gal: window.__gal, tick: document.querySelectorAll("#imStrip .im-th.done").length, model: IMAGINE.state.model || document.getElementById("imModel").value };
  }, [PNG_B64, PNG_B64_2]);
  const wantPrompt = await page.evaluate(() => IMAGINE.prompt("lighting", "goldRim", ""));
  report("B4) two photos land on the strip (Photo 2/2, + still offered); Apply refuses with no template and, without a key, sends the student to Setup",
    flow.strip === 2 && flow.add && /2\/2/.test(flow.count) && flow.refused && flow.noKey, { strip: flow.strip, count: flow.count, refused: flow.refused, noKey: flow.noKey });
  report("B5) Golden Rim Light is picked (tile .on, ✓ hint) and Apply sends ONE RunningHub submit for the chosen model with the image and the exact prompt: the tool's frame around the template + identity lock + realism + avoid + task guard",
    flow.picked === "goldRim" && /✓/.test(flow.hint) && flow.sentOnce && /runninghub\.ai\/openapi\/v2\//.test(flow.url || "") && flow.hasImage && flow.prompt === wantPrompt &&
    /Relight this photograph\. Change ONLY the lighting/.test(flow.prompt) && /golden backlight rimming the hair/.test(flow.prompt) && /IDENTITY LOCK/.test(flow.prompt) && /TASK GUARD/.test(flow.prompt),
    { picked: flow.picked, url: flow.url, promptHead: flow.prompt.slice(0, 90), same: flow.prompt === wantPrompt });
  report("B6) the result comes back onto the picture: Before | After compare with its slider and size badge, ✓ on the strip, Done status, and the Gallery gets the take tagged pgImagine with the original as Before",
    flow.out && flow.outB64 === PNG_B64 && flow.cmp && flow.range && flow.badge === "1K" && /✓/.test(flow.status) && flow.tick === 1 && flow.gal.length === 1 && flow.gal[0].page === "pgImagine" && flow.gal[0].before && flow.gal[0].b64 === PNG_B64 && /Golden Rim|ရွှေ Rim/.test(flow.gal[0].snip),
    { badge: flow.badge, status: flow.status, gal: flow.gal.map(g => ({ page: g.page, before: g.before, snip: g.snip })) });
  /* the slider */
  const slide = await page.evaluate(async () => {
    const r = document.getElementById("imSplit"); r.value = "30"; r.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(x => setTimeout(x, 30));
    return { top: document.querySelector(".im-cmp-top").style.width, line: document.querySelector(".im-cmp-line").style.left, split: IMAGINE.state.split };
  });
  report("B7) the Before | After slider moves the reveal (30% → overlay width 30%, line at 30%)", slide.top === "30%" && slide.line === "30%" && slide.split === 30, slide);
  /* export */
  const exp = await page.evaluate(async () => { document.getElementById("imExport").click(); await new Promise(r => setTimeout(r, 60)); return window.__dl; });
  report("B8) Export downloads the current result as hnk-imagine-<tool>-<template>-<stamp>.png", exp.length === 1 && /^hnk-imagine-lighting-goldRim-\d{8}-\d{6}\.png$/.test(exp[0]), exp);
  /* apply to all, then describe-only, then template + describe */
  const all = await page.evaluate(async () => {
    window.__reqs = []; window.__gal = [];
    document.getElementById("imApplyAll").click();
    const t0 = Date.now(); while (Date.now() - t0 < 10000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 40));
    const doneN = document.getElementById("imStatus").textContent;
    const both = IMAGINE.state.photos.every(p => p.out && p.out.b64);
    const galAfterAll = window.__gal.length;
    /* Describe only */
    document.querySelector('#imTpls .im-tpl[data-preset="goldRim"]').click(); await new Promise(r => setTimeout(r, 40));   /* unpick */
    document.querySelector('.im-tab[data-tab="desc"]').click(); await new Promise(r => setTimeout(r, 40));
    const ta = document.getElementById("imDesc"); ta.value = "warm shop lights at night"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    const counter = document.querySelector(".im-desccnt").textContent;
    window.__reqs = [];
    document.getElementById("imApply").click();
    const t1 = Date.now(); while (Date.now() - t1 < 8000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 40));
    const descPrompt = (window.__reqs[0] && window.__reqs[0].body && window.__reqs[0].body.prompt) || "";
    /* template + describe */
    document.querySelector('.im-tab[data-tab="tpl"]').click(); await new Promise(r => setTimeout(r, 40));
    document.querySelector('#imTpls .im-tpl[data-preset="window"]').click(); await new Promise(r => setTimeout(r, 40));
    window.__reqs = [];
    document.getElementById("imApply").click();
    const t2 = Date.now(); while (Date.now() - t2 < 8000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 40));
    const bothPrompt = (window.__reqs[0] && window.__reqs[0].body && window.__reqs[0].body.prompt) || "";
    return { reqs: 2, doneN, both, gal: galAfterAll, counter, descPrompt, bothPrompt, wantDesc: IMAGINE.prompt("lighting", "", "warm shop lights at night"), wantBoth: IMAGINE.prompt("lighting", "window", "warm shop lights at night") };
  });
  report("B9) Apply to all runs the strip in sequence (2/2 done, both photos carry a result, two Gallery takes)", all.both && /2\/2/.test(all.doneN) && all.gal === 2, { doneN: all.doneN, gal: all.gal });
  report("B10) Describe alone is the whole instruction (0/4000 counter live); with a template it rides along as EXTRA WISHES — both wrapped in the same frame",
    /^25\/4000$/.test(all.counter) && all.descPrompt === all.wantDesc && /^Edit this photograph as described/.test(all.descPrompt) && /warm shop lights at night/.test(all.descPrompt) && /IDENTITY LOCK/.test(all.descPrompt) &&
    all.bothPrompt === all.wantBoth && /soft directional daylight from a large window/.test(all.bothPrompt) && /EXTRA WISHES: warm shop lights at night/.test(all.bothPrompt), { counter: all.counter, d: all.descPrompt.slice(0, 80), b: all.bothPrompt.slice(0, 80) });
  /* model / size coupling */
  const ms = await page.evaluate(async () => {
    const sel = document.getElementById("imModel"); const has = id => [...sel.options].some(o => o.value === id);
    const out = { hasFlux: has("flux-2-dev"), hasPro: has("nano-banana-pro") };
    sel.value = "flux-2-dev"; sel.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(r => setTimeout(r, 40));
    out.fluxSize = !!document.getElementById("imSize"); out.fluxKept = document.getElementById("imModel").value;
    document.getElementById("imModel").value = "nano-banana-pro"; document.getElementById("imModel").dispatchEvent(new Event("change", { bubbles: true })); await new Promise(r => setTimeout(r, 40));
    out.proSize = [...document.querySelectorAll("#imSize option")].map(o => o.value).join(",");
    document.getElementById("imSize").value = "2k"; document.getElementById("imSize").dispatchEvent(new Event("change", { bubbles: true }));
    window.__reqs = []; document.getElementById("imApply").click();
    const t0 = Date.now(); while (Date.now() - t0 < 8000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 40));
    out.url = window.__reqs[0] && window.__reqs[0].url; out.badge = (document.querySelector(".im-badge") || {}).textContent; out.size = IMAGINE.state.size;
    return out;
  });
  report("B11) Model + Size follow the studio's rules: Flux 2 Dev (edit-lora) offers no Size; Nano Banana Pro offers 1k/2k/4k, 2K is kept, sent to its own apiPath and shown on the badge",
    ms.hasFlux && ms.hasPro && !ms.fluxSize && ms.fluxKept === "flux-2-dev" && ms.proSize === "1k,2k,4k" && /rhart-image-n-pro\/edit/.test(ms.url || "") && ms.badge === "2K" && ms.size === "2k", ms);
  /* stop */
  const stop = await page.evaluate(async () => {
    window.__hang = true; window.__reqs = [];
    document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 150));
    const busy = IMAGINE.state.busy, stopBtn = !!document.getElementById("imStop"), applyOff = document.getElementById("imApply").classList.contains("is-off"), overlay = !!document.querySelector(".im-busy");
    document.getElementById("imStop").click();
    const t0 = Date.now(); while (Date.now() - t0 < 3000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 30));
    window.__hang = false;
    return { busy, stopBtn, applyOff, overlay, after: IMAGINE.state.busy, status: document.getElementById("imStatus").textContent, want: IMAGINE_DATA.ui.stopped[LANG], stopGone: !document.getElementById("imStop") };
  });
  report("B12) while a job runs Apply is off, Stop and the working overlay show; Stop aborts and the page says so", stop.busy && stop.stopBtn && stop.applyOff && stop.overlay && !stop.after && stop.status === stop.want && stop.stopGone, stop);
  /* remove / clear */
  const rm = await page.evaluate(async () => {
    document.querySelector('#imStrip .im-th[data-idx="0"] .im-th-x').click(); await new Promise(r => setTimeout(r, 40));
    const one = IMAGINE.state.photos.length;
    document.getElementById("imClear").click(); await new Promise(r => setTimeout(r, 40));
    return { one, none: IMAGINE.state.photos.length, empty: !!document.getElementById("imAddBig"), noAll: !document.getElementById("imApplyAll") };
  });
  report("B13) ✕ removes one photo, Clear all empties the strip back to the Add photos stage", rm.one === 1 && rm.none === 0 && rm.empty && rm.noAll, rm);
  /* restore + nine languages */
  await open("");
  const restored = await page.evaluate(() => ({ page: curPage, tool: IMAGINE.state.tool, preset: IMAGINE.state.preset.lighting, model: IMAGINE.state.model, size: IMAGINE.state.size, desc: IMAGINE.state.desc.lighting, tiles: document.querySelectorAll("#imTpls .im-tpl").length, on: (document.querySelector("#imTpls .im-tpl.on") || {}).getAttribute && document.querySelector("#imTpls .im-tpl.on").getAttribute("data-preset") }));
  report("B14) a reload lands back on Imagine → Lighting with the template, model, size and description remembered (photos are the session's)",
    restored.page === "pgImagine" && restored.tool === "lighting" && restored.preset === "window" && restored.model === "nano-banana-pro" && restored.size === "2k" && restored.desc === "warm shop lights at night" && restored.tiles === 12 && restored.on === "window", restored);
  const langs = {};
  for (const l of LANGS) {
    await page.evaluate(l => { localStorage.setItem("hnk_ws_lang", l); IMAGINE.goHub(); }, l);
    await open("?page=pgImagine");
    langs[l] = await page.evaluate(() => ({ h2: document.querySelector("#pgImagine .im-hub h2").textContent.trim(), want: IMAGINE_DATA.ui.hub_h2[LANG], lang: LANG,
      head: document.getElementById("phImagine").textContent.replace(/\s+/g, " ").trim(), wantHead: t("ph_imagine").replace(/<\/?em>/g, "").replace(/\s+/g, " ").trim(),
      card: document.querySelector('#pgImagine .im-card[data-tool="weather"] .im-card-name').textContent.trim(), wantCard: IMAGINE_DATA.tools[3].name[LANG] }));
  }
  const badLang = LANGS.filter(l => langs[l].lang !== l || langs[l].h2 !== langs[l].want || langs[l].head !== langs[l].wantHead || langs[l].card !== langs[l].wantCard);
  report("B15) the hub, the headline and the cards read in each of the nine languages", badLang.length === 0, badLang.map(l => langs[l]));
  await page.evaluate(() => { localStorage.setItem("hnk_ws_lang", "my"); });
  report("B16) no page error during any of it", errs.length === 0, errs.slice(0, 3));

  /* ---------------- C) the panel boots the same module ---------------- */
  const PANEL = path.join(ROOT, "panel");
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const pport = server.address().port;
  const pp = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const perrs = []; pp.on("pageerror", e => perrs.push(String(e).slice(0, 240)));
  await pp.route("**/*", r => {
    const u = r.request().url();
    if (u.indexOf("127.0.0.1") >= 0) return r.continue();
    if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await pp.addInitScript(UXP_STUB);
  await pp.goto(`http://127.0.0.1:${pport}/index.html`, { waitUntil: "load" });
  await pp.waitForTimeout(2200);
  await pp.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
  const pan = await pp.evaluate(async () => {
    switchPage("imagine"); await new Promise(r => setTimeout(r, 200));
    const out = { on: /\bon\b/.test(document.getElementById("pageImagine").className), cards: [...document.querySelectorAll("#pageImagine .im-card")].map(c => c.getAttribute("data-tool")),
      subtabs: [...document.querySelectorAll("#subtabs .subtab")].map(b => b.textContent.trim()), h2: document.querySelector("#pageImagine .im-hub h2").textContent.trim(), want: globalThis.HNK.imagineData.ui.hub_h2[state.lang] || globalThis.HNK.imagineData.ui.hub_h2.en,
      head: document.getElementById("phImagine").textContent.trim().length > 8, icons: document.querySelectorAll("#pageImagine img.ic-s").length, svg: document.querySelectorAll("#pageImagine svg").length };
    globalThis.HNK.imagine.openTool("surface"); await new Promise(r => setTimeout(r, 120));
    out.tiles = document.querySelectorAll("#pageImagine #imTpls .im-tpl").length; out.roleBtns = document.querySelectorAll('#pageImagine [role="button"].btn').length; out.nativeBtns = document.querySelectorAll("#pageImagine button").length;
    out.size = [...document.querySelectorAll("#pageImagine #imSize option")].map(o => o.textContent).join("/"); out.models = document.querySelectorAll("#pageImagine #imModel option").length;
    globalThis.HNK.imagine.goHub();
    return out;
  });
  report("C1) the panel opens Edit · Imagine on the same module: four cards, six subtabs, the hub headline in the panel's language, <img> icons (no inline svg), div buttons (no native <button>), Surface's 15 tiles, Model + Size",
    pan.on && pan.cards.join(",") === "lighting,portrait,surface,weather" && pan.subtabs.length === 6 && pan.h2 === pan.want && pan.head && pan.icons > 0 && pan.svg === 0 && pan.tiles === 15 && pan.roleBtns > 0 && pan.nativeBtns === 0 && pan.size === "1K/2K/4K" && pan.models >= 6, pan);
  report("C2) the panel raised no error while it built the page", perrs.length === 0, perrs.slice(0, 3));
  await browser.close();
  await new Promise(r => server.close(r));
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed — Imagine W1 is the same page on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
