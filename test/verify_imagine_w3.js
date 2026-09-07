/* Imagine W3 (6.32.0) — five more one-tap tools on the same shell: Photo Restore, Upscale & Enhance, Face Clarity, Object Remove
 * (with a brush), Object Add (with a brush). What is NEW and pinned here:
 *   A) the roster (the W3 five follow W2, every template counted, nine languages), each tool's own KEEP / AVOID line (Restore recovers
 *      and never reinvents, Upscale carries a DETAIL LOCK, Face Clarity keeps the face exactly and the skin natural, Object Remove a FILL
 *      LOCK, Object Add a SCENE LOCK), the two brush tools' `mark` + `markPrompt` ("RED PAINT"), the Reference Card transfer lines, the
 *      brush UI strings, the module's brush (canvas feature-detected, strokes as normalised polylines, the composite the model receives,
 *      the mark prompt) lifted to the panel byte for byte, the icons and the art on both surfaces, the lane's two job files, the What's New
 *      row, the CI step.
 *   B) in the browser: the hub shows every card (seventeen at 6.32.0, twenty-two once W4 followed) with the W3 five in their places; a tool without a brush shows no Mark bar; Object Remove shows it once a photo is in;
 *      Mark opens the paint view, a real pointer stroke lands as red paint (the composite carries red where the stroke is and none where
 *      it is not), the strip badge and the hint follow, Undo / Clear work; the prompt the page would send is the mark prompt inside the
 *      tool's frame (Object Add with a reference adds the shared red-paint line); Object Add refuses a mark with nothing to add, Object
 *      Remove accepts a mark alone; a mocked Apply uploads the composite (not the tiny original) under the mark prompt and lands the
 *      result on the compare view.
 * Usage: PORT=8931 node test/verify_imagine_w3.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel/js/hnk_imagine.js"), "utf8");
const PANEL_CSS = fs.readFileSync(path.join(ROOT, "panel/styles.css"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const lifter = require("../tools/build_panel_imagine.js");
const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
const css = lifter.between(APP, lifter.C0, lifter.C1, "css");
const DATA = (() => { const a = mod.indexOf("var IMAGINE_DATA = ") + "var IMAGINE_DATA = ".length, b = mod.indexOf(";\nvar IMAGINE = (function(){", a); return new Function("return " + mod.slice(a, b))(); })();
const JOBS_A = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs_w3.json"), "utf8")).jobs;
const JOBS_B = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs_w3b.json"), "utf8")).jobs;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = o => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].length > 0);
const W3 = { restore: 12, upscale: 8, faceclear: 12, objremove: 10, objadd: 12 };
const IDS = Object.keys(W3), DEGRADED = ["restore", "upscale", "faceclear"], BRUSHED = ["objremove", "objadd"];
/* 6.33.0 — W4 (Hair & Makeup · Body Shape · Sky Replace · Text & Sign Edit · Batch Imagine) follows W3 in the roster; verify_imagine_w4.js pins it, this file only counts it:
   the W3 five sit right after the W1 four and the W2 eight (positions 13-17), the roster is 12 + 5 + 5 tools and 232 + 52 templates */
const W4 = { hairmakeup: 14, bodyshape: 10, sky: 12, textedit: 8, batch: 8 };
const W3AT = 12, NTOOLS = W3AT + IDS.length + Object.keys(W4).length, TOTAL = 232 + Object.values(W4).reduce((a, b) => a + b, 0);
const GEAR = /NO STUDIO GEAR IN THE FRAME/;
const ART = path.join(ROOT, "docs/app/lib/wf/imagine"), PART = path.join(ROOT, "panel/icons/imagine");
const byId = Object.fromEntries(DATA.tools.map(t => [t.id, t]));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
function jpegSize(file) {
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); }
  return null;
}

/* ---------------- A) the source, both surfaces ---------------- */
report("A1) the roster carries the W3 five in order (restore · upscale · faceclear · objremove · objadd) right after the W1 four and the W2 eight, " + NTOOLS + " tools and " + TOTAL + " templates in all (the W4 five counted after them), every name, summary and template in nine languages, {P} in every base prompt, unique template ids",
  DATA.tools.length === NTOOLS && DATA.tools.slice(W3AT, W3AT + 5).map(t => t.id).join(",") === IDS.join(",") && IDS.every(id => byId[id] && byId[id].presets.length === W3[id]) &&
  DATA.tools.reduce((n, t) => n + t.presets.length, 0) === TOTAL &&
  IDS.every(id => all9(byId[id].name) && all9(byId[id].sum) && /\{P\}/.test(byId[id].basePrompt) && byId[id].presets.every(p => all9(p.name) && p.p.length > 30) && new Set(byId[id].presets.map(p => p.id)).size === byId[id].presets.length),
  { ids: DATA.tools.map(t => t.id), counts: DATA.tools.map(t => t.presets.length) });

report("A2) each tool's own frame line: Restore recovers and never reinvents, Upscale carries a DETAIL LOCK, Face Clarity keeps the face exactly with natural skin, Object Remove a FILL LOCK, Object Add a SCENE LOCK; every AVOID ends with the no-studio-gear rule; the two brush tools carry mark + markPrompt (RED PAINT, {P}), the other three no mark; the frame carries markRef + markDefault",
  IDS.every(id => byId[id].keep && byId[id].avoid && GEAR.test(byId[id].avoid)) &&
  /Recover, do not reinvent/.test(byId.restore.keep) && /DETAIL LOCK/.test(byId.upscale.keep) && /SKIN: clean, even and smooth with fine natural detail/.test(byId.faceclear.keep) &&
  /FILL LOCK/.test(byId.objremove.keep) && /SCENE LOCK/.test(byId.objadd.keep) &&
  byId.objremove.mark === "remove" && byId.objadd.mark === "add" && BRUSHED.every(id => /RED PAINT/.test(byId[id].markPrompt) && /\{P\}/.test(byId[id].markPrompt) && /No red paint may remain/.test(byId[id].markPrompt)) &&
  DEGRADED.every(id => !byId[id].mark && !byId[id].markPrompt) && /RED PAINT on IMAGE 1/.test(DATA.frame.markRef) && DATA.frame.markDefault === "the marked object or area",
  IDS.map(id => ({ id, keep: (byId[id].keep || "").slice(0, 40), mark: byId[id].mark || null })));

const aspects = { restore: /CONDITION and FINISH/, upscale: /DETAIL LEVEL and SHARPNESS/, faceclear: /CLARITY and SKIN FINISH/, objremove: /KIND OF OBJECT/, objadd: /OBJECT shown/ };
report("A3) the Reference Card transfer lines (IMAGE 1 / IMAGE 2, each tool's own aspect, a nine-language hint), the brush UI strings in nine languages, and the hub's next-waves line no longer promises Restore · Upscale · Object Remove",
  IDS.every(id => /IMAGE 1/.test(byId[id].refPrompt) && /IMAGE 2/.test(byId[id].refPrompt) && aspects[id].test(byId[id].refPrompt) && /Copy only/.test(byId[id].refPrompt) && all9(byId[id].refHint)) &&
  ["mark_btn", "mark_on_remove", "mark_on_add", "mark_undo", "mark_clear", "mark_done", "mark_size", "mark_marked", "mark_nocanvas", "err_add_what"].every(k => all9(DATA.ui[k])) &&
  DATA.ui.mark_btn.en === "Mark area" && !/Restore|Upscale|Object/.test(DATA.ui.hub_next.en),
  { next: DATA.ui.hub_next.en, ui: Object.keys(DATA.ui).filter(k => /^mark_|err_add/.test(k)) });

const MOD_BITS = ['var CAN_MARK = (function(){ try{ var c=document.createElement("canvas"); return !!(c && c.getContext && c.getContext("2d")); }catch(e){ return false; } })();',
  'var BRUSH = [0.018, 0.035, 0.065];', 'function paintStrokes(ctx, strokes, W, Hh, alpha){', 'function markView(p, live){', 'function composite(p){', 'paintStrokes(x, p.strokes, W, Hh, 0.55);',
  'res(c.toDataURL("image/jpeg", 0.92));', 'else if(marked && tool.markPrompt){ core = tool.markPrompt.split("{P}").join(preset ? preset.p : (desc || D.frame.markDefault));',
  'if(ref){ core = tool.refPrompt; if(desc) core += " EXTRA WISHES: " + desc; if(marked && tool.markPrompt) core += " " + D.frame.markRef; }',
  'if(!(tool.mark==="remove" && anyMarked())){ S.tab="tpl"; H.toast(t(tool.mark==="add" ? "err_add_what" : "err_no_pick"),"warn"); render(); return null; }',
  'var marked = !!(g.tool.mark && p.strokes && p.strokes.length), thisPrompt = marked ? buildPrompt(g.tool, g.preset, g.desc, g.ref, true) : prompt;',
  '(marked ? composite(p) : Promise.resolve(p.dataUrl)).then(function(src){ return H.generate({ modelId:modelId, prompt:thisPrompt, dataUrl:src,',
  'mark:function(on){ S.markMode = (on==null) ? !S.markMode : !!on; render(); }, addStroke:addStroke, undoMark:undoMark, clearMark:clearMark,', 'strokes:[] }); n++;'];
report("A4) the module's brush — a feature-detected canvas, three brush radii, strokes as normalised polylines, the paint view, the JPEG composite the model receives, the mark prompt (alone, with a template, beside a reference), the remove-alone guard — and the panel lift carries the same bytes; the brush CSS is on both surfaces",
  MOD_BITS.every(b => mod.indexOf(b) >= 0) && MOD_BITS.every(b => PANEL_JS.indexOf(b) >= 0) && /\.im-markcv\{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:crosshair\}/.test(css) &&
  /\.im-markcv\{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:crosshair\}/.test(PANEL_CSS) && !/display:\s*grid/.test(css) && !/=>/.test(mod) && !/\b(let|const)\s/.test(mod),
  { app: MOD_BITS.filter(b => mod.indexOf(b) < 0), panel: MOD_BITS.filter(b => PANEL_JS.indexOf(b) < 0) });

const icons = IDS.map(id => ({ id, ic: byId[id].ic, app: new RegExp('<symbol id="' + byId[id].ic + '"').test(APP), panel: fs.existsSync(path.join(ROOT, "panel/icons/ui", byId[id].ic + "-cream.svg")) }));
report("A5) every W3 tool's icon exists in the app's sprite AND as the panel's icons/ui/<name>-cream.svg", icons.every(i => i.app && i.panel), icons.filter(i => !(i.app && i.panel)));

const art = IDS.flatMap(id => [byId[id].before, byId[id].after].map(f => ({ f, size: jpegSize(path.join(ART, f)), panel: fs.existsSync(path.join(PART, f)) }))
  .concat(byId[id].presets.map(p => { const f = "th/" + id + "-" + p.id + ".jpg"; return { f, size: jpegSize(path.join(ART, f)), panel: fs.existsSync(path.join(PART, f)) }; })));
report("A6) the art is on both surfaces: every card pair 800x1200 and every template thumbnail 420x630 under docs/app/lib/wf/imagine, the same files under panel/icons/imagine",
  art.length === 10 + 54 && art.every(a => a.size && a.panel && ((/^th\//.test(a.f) && a.size.w === 420 && a.size.h === 630) || (!/^th\//.test(a.f) && a.size.w === 800 && a.size.h === 1200))),
  art.filter(a => !(a.size && a.panel)).map(a => a.f).slice(0, 12));

const CATALOG = new Set(["alibaba/qwen-image-3.0-pro/image-edit", "alibaba/wan-2.7/text-to-image-pro"]);
const basesA = JOBS_A.filter(j => /^base-/.test(j.name)), thumbsA = JOBS_A.filter(j => /^th-/.test(j.name));
report("A7) the lane's two W3 job files: run A = the five brand-model bases (Qwen 3.0 Pro image-edit from the two references, 2:3, 2k) + the Object Remove / Object Add thumbnails on their bases (baseFrom); run B = the Restore / Upscale / Face Clarity thumbnails image-to-image on the committed DEGRADED before-cards (base, no baseFrom); every apiPath in the catalog",
  basesA.length === 5 && basesA.every(j => IDS.indexOf(j.name.slice(5)) >= 0 && j.apiPath === "alibaba/qwen-image-3.0-pro/image-edit" && Array.isArray(j.refs) && j.refs.length === 2 && j.ratio === "2:3" && j.resolution === "2k") &&
  thumbsA.length === W3.objremove + W3.objadd && thumbsA.every(j => /^th-(objremove|objadd)-/.test(j.name) && j.baseFrom === "base-" + j.name.split("-")[1] && j.ratio === "2:3" && j.resolution === "2k") &&
  JOBS_B.length === W3.restore + W3.upscale + W3.faceclear && JOBS_B.every(j => /^th-(restore|upscale|faceclear)-/.test(j.name) && !j.baseFrom && j.base === "docs/app/lib/wf/imagine/card-" + j.name.split("-")[1] + "-before.jpg") &&
  JOBS_A.concat(JOBS_B).every(j => CATALOG.has(j.apiPath)) && APP.indexOf('apiPath:"alibaba/qwen-image-3.0-pro/image-edit"') >= 0,
  { a: JOBS_A.length, b: JOBS_B.length, apis: [...new Set(JOBS_A.concat(JOBS_B).map(j => j.apiPath))] });

const wn = (APP.match(/\{ v:"6\.32\.0", kind:"page", ref:"pgImagine",[\s\S]*?\} \},\n/) || [""])[0];
report("A8) WHATS_NEW carries the 6.32.0 Imagine row (W3, brush) with a title and a line in all nine languages, and CI runs this test",
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Imagine W3/.test(wn) && /brush/.test(wn) && /PORT=8931 node test\/verify_imagine_w3\.js/.test(CI), { row: wn.slice(0, 120), ci: /verify_imagine_w3/.test(CI) });

/* ---------------- B) the page ---------------- */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MOCK = `(function(){
  window.__reqs = []; window.__ups = []; window.__outB64 = "${PNG_B64}";
  var realFetch = window.fetch;
  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf("mock.runninghub.test") >= 0) {
      var bin = atob(window.__outB64), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
    }
    if (u.indexOf("www.runninghub.ai") >= 0) {
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        var sz = 0; try { var b = opts && opts.body; if (b && b.get) { var f = b.get("file") || b.get("image") || b.get("data"); sz = f && f.size || 0; } else if (b && b.size != null) sz = b.size; else if (b && b.byteLength != null) sz = b.byteLength; } catch(e) {}
        window.__ups.push(sz);
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/in.jpg",fileName:"openapi/in.jpg",size:String(sz)}}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/query") >= 0)
        return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u, parseError: String(e) }); }
      return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200})); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  window.__gal = []; var _ga = null;
  Object.defineProperty(window, "__spyGallery", { value: function(){ if (_ga) return; _ga = window.galleryAdd; window.galleryAdd = function(out, snip, meta){ window.__gal.push({ mime: out.mime, snip: snip, page: meta && meta.page, before: !!(meta && meta.before) }); return Promise.resolve(true); }; } });
})();`;

(async () => {
  const browser = await chromium.launch(); withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 940 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
    await page.addInitScript(MOCK);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?page=pgImagine`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pgImagine .im-card", { timeout: 15000 });

    const hub = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#pgImagine .im-card")];
      const w3 = cards.slice(12, 17);   /* 6.33.0 — the W3 five sit after the W1 four and the W2 eight; the W4 five follow them */
      return { n: cards.length, w3: w3.map(c => c.getAttribute("data-tool")), chips: w3.map(c => c.querySelector(".im-tplcount").textContent), canMark: IMAGINE.canMark };
    });
    report("B1) the hub shows " + NTOOLS + " cards, the W3 five at positions 13-17 with their template counts (12 · 8 · 12 · 10 · 12); the page can paint (a 2D canvas exists)",
      hub.n === NTOOLS && hub.w3.join(",") === IDS.join(",") && [12, 8, 12, 10, 12].every((n, i) => new RegExp("(^|\\D)" + n + "(\\D|$)").test(hub.chips[i])) && hub.canMark === true, hub);

    /* a 60x90 blue photo, made in the page */
    const photo = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 60; c.height = 90; const x = c.getContext("2d"); x.fillStyle = "#1030ff"; x.fillRect(0, 0, 60, 90); return c.toDataURL("image/png"); });

    const noBar = await page.evaluate(async (png) => {
      IMAGINE.openTool("lighting"); IMAGINE.addPhotos([{ dataUrl: png, name: "p.png" }]); await new Promise(r => setTimeout(r, 60));
      const a = { lightingBar: !!document.getElementById("imMarkBar"), lightingMark: !!document.getElementById("imMark"), photos: IMAGINE.state.photos.length, strokesInit: JSON.stringify(IMAGINE.state.photos[0].strokes) };
      IMAGINE.openTool("objremove"); await new Promise(r => setTimeout(r, 60));
      const hint = document.getElementById("imMarkHint");
      return Object.assign(a, { bar: !!document.getElementById("imMarkBar"), mark: !!document.getElementById("imMark"), hint: hint && hint.textContent, hintIsOnRemove: !!hint && Object.values(IMAGINE.data.ui.mark_on_remove).indexOf(hint.textContent) >= 0,
        markOff: !document.getElementById("imMark").classList.contains("on"), noWrap: !document.getElementById("imMarkWrap"), cmp: !!document.querelectorAllSafe, compare: !!document.querySelector("#pgImagine .im-cmp"), brushes: document.querySelectorAll("#imMarkBar .im-brush").length });
    }, photo);
    report("B2) Lighting (no brush) shows no Mark bar even with a photo in; Object Remove shows the bar — Mark off, the paint-red hint, the plain compare view, no brush sizes yet — and a new photo starts with no strokes",
      !noBar.lightingBar && !noBar.lightingMark && noBar.photos === 1 && noBar.strokesInit === "[]" && noBar.bar && noBar.mark && noBar.hintIsOnRemove && noBar.markOff && noBar.noWrap && noBar.compare && noBar.brushes === 0, noBar);

    const on = await page.evaluate(async () => {
      document.getElementById("imMark").click(); await new Promise(r => setTimeout(r, 60));
      const mk = document.getElementById("imMark"), un = document.getElementById("imMarkUndo"), cl = document.getElementById("imMarkClear"), wrap = document.getElementById("imMarkWrap"), cv = document.getElementById("imMarkCv");
      return { on: mk.classList.contains("on"), pressed: mk.getAttribute("aria-pressed"), doneLabel: Object.values(IMAGINE.data.ui.mark_done).some(s => mk.textContent.indexOf(s) >= 0), brushes: document.querySelectorAll("#imMarkBar .im-brush").length,
        brushOn: (document.querySelector("#imMarkBar .im-brush.on") || {}).getAttribute && document.querySelector("#imMarkBar .im-brush.on").getAttribute("data-brush"),
        undoOff: !!un && un.classList.contains("is-off"), clearOff: !!cl && cl.classList.contains("is-off"), wrapOn: !!wrap && wrap.classList.contains("on"), cv: !!cv && !cv.classList.contains("ro"), cvW: cv && cv.width, cvH: cv && cv.height, noCmp: !document.querySelector("#pgImagine .im-cmp"), touch: cv && getComputedStyle(cv).touchAction };
    });
    report("B3) Mark opens the paint view: the chip reads Done and is on, three brush sizes with the medium one on, Undo and Clear disabled until a stroke, the picture with a live canvas over it (touch-action none) instead of the compare",
      on.on && on.pressed === "true" && on.doneLabel && on.brushes === 3 && on.brushOn === "1" && on.undoOff && on.clearOff && on.wrapOn && on.cv && on.cvW > 100 && on.cvH > 100 && on.noCmp && on.touch === "none", on);

    /* a real pointer stroke across the canvas */
    const box = await page.evaluate(() => { const r = document.getElementById("imMarkCv").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.30); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + box.w * (0.25 + 0.05 * k), box.y + box.h * (0.30 + 0.025 * k));
    await page.mouse.up(); await page.waitForTimeout(80);
    const stroke = await page.evaluate(async () => {
      const p = IMAGINE.state.photos[0], s = p.strokes[0], hint = document.getElementById("imMarkHint");
      const du = await IMAGINE.composite(0);
      const rgbAt = (dataUrl, fx, fy) => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext("2d"); x.drawImage(im, 0, 0); const d = x.getImageData(Math.round(fx * (c.width - 1)), Math.round(fy * (c.height - 1)), 1, 1).data; res({ r: d[0], g: d[1], b: d[2], w: c.width, h: c.height }); }; im.src = dataUrl; });
      const mid = s.pts[Math.floor(s.pts.length / 2)];
      return { n: p.strokes.length, pts: s.pts.length, r: s.r, inRange: s.pts.every(q => q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 1), jpeg: /^data:image\/jpeg;base64,/.test(du), onStroke: await rgbAt(du, mid[0], mid[1]), offStroke: await rgbAt(du, 0.92, 0.95), orig: await rgbAt(p.dataUrl, mid[0], mid[1]),
        hintMarked: !!hint && Object.values(IMAGINE.data.ui.mark_marked).indexOf(hint.textContent) >= 0, badge: !!document.querySelector('#imStrip .im-th[data-idx="0"] .im-th-mk'), undoOn: !document.getElementById("imMarkUndo").classList.contains("is-off"), clearOn: !document.getElementById("imMarkClear").classList.contains("is-off") };
    });
    report("B4) the stroke lands as one normalised polyline at the medium radius; the composite is a JPEG at the photo's own size with red under the stroke (the blue photo shows none there) and the untouched blue away from it; the hint reads Marked, the strip thumb wears ✎, Undo and Clear wake up",
      stroke.n === 1 && stroke.pts >= 3 && Math.abs(stroke.r - 0.035) < 1e-6 && stroke.inRange && stroke.jpeg && stroke.onStroke.w === 60 && stroke.onStroke.h === 90 &&
      stroke.onStroke.r > 100 && stroke.orig.r < 40 && stroke.offStroke.r < 40 && stroke.offStroke.b > 150 && stroke.hintMarked && stroke.badge && stroke.undoOn && stroke.clearOn, stroke);

    const prompts = await page.evaluate((png) => {
      const F = IMAGINE.data.frame, T = Object.fromEntries(IMAGINE.data.tools.map(t => [t.id, t]));
      const alone = IMAGINE.prompt("objremove", "", "", true), withTpl = IMAGINE.prompt("objremove", "people", "", true), words = IMAGINE.prompt("objremove", "", "the red scooter", true), plain = IMAGINE.prompt("objremove", "people", "", false);
      const add = IMAGINE.prompt("objadd", "bouquet", "", true), noMark = IMAGINE.prompt("lighting", "goldRim", "", true);
      IMAGINE.setRef("objadd", png, "ref.png"); const refM = IMAGINE.prompt("objadd", "__ref", "", true), refN = IMAGINE.prompt("objadd", "__ref", "", false); IMAGINE.clearRef("objadd");
      return { alone, withTpl, words, plain, add, noMark, refM, refN, keep: T.objremove.keep, avoid: T.objremove.avoid, guard: F.guard, real: F.real, markRef: F.markRef, people: T.objremove.presets[0].p, bouquet: T.objadd.presets[0].p, addKeep: T.objadd.keep };
    }, "data:image/png;base64," + PNG_B64);
    report("B5) the prompt the page would send: with red paint alone the mark prompt names 'the marked object or area'; with a template the template rides inside it; with words the words do; without paint the plain base prompt; Object Add places the template WHERE the red is; a tool without a brush ignores the flag; a Reference Card beside red paint adds the shared red-paint line — every one inside the tool's KEEP / REALISM / AVOID / GUARD frame",
      /RED PAINT on this photograph marks what to remove/.test(prompts.alone) && prompts.alone.indexOf("the marked object or area") > 0 && prompts.alone.indexOf(prompts.keep) > 0 && prompts.alone.indexOf(prompts.real) > 0 && prompts.alone.indexOf(prompts.avoid) > 0 && prompts.alone.endsWith(prompts.guard) &&
      prompts.withTpl.indexOf(prompts.people) > 0 && /RED PAINT/.test(prompts.withTpl) && prompts.words.indexOf("the red scooter") > 0 && /RED PAINT/.test(prompts.words) &&
      !/RED PAINT/.test(prompts.plain) && /^Remove from this photograph exactly the following/.test(prompts.plain) && prompts.plain.indexOf(prompts.people) > 0 &&
      /marks WHERE the new element goes: place a fresh bouquet/.test(prompts.add) && prompts.add.indexOf(prompts.addKeep) > 0 && !/RED PAINT/.test(prompts.noMark) && /^Relight this photograph/.test(prompts.noMark) &&
      /OBJECT shown in the reference IMAGE 2/.test(prompts.refM) && prompts.refM.indexOf(prompts.markRef) > 0 && !/marks the area to work in/.test(prompts.refN),
      { alone: prompts.alone.slice(0, 160), add: prompts.add.slice(0, 120), refM: prompts.refM.slice(0, 80) });

    const guard = await page.evaluate(async () => {
      /* Object Add: the same photo (with its paint) but nothing to add → refused with the "pick what to add" toast; Object Remove: paint alone passes the pick guard and, without a key, goes to Setup */
      IMAGINE.openTool("objadd"); await new Promise(r => setTimeout(r, 60));
      const addBar = !!document.getElementById("imMarkBar"), addBadge = !!document.querySelector('#imStrip .im-th[data-idx="0"] .im-th-mk');
      document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 80));
      const toast = document.getElementById("toast").textContent, refusedAdd = !IMAGINE.state.busy && window.__reqs.length === 0 && Object.values(IMAGINE.data.ui.err_add_what).indexOf(toast) >= 0;
      IMAGINE.openTool("objremove"); await new Promise(r => setTimeout(r, 60));
      const svKey = state.rhKey; state.rhKey = "";
      document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 100));
      const noKey = window.__reqs.length === 0 && curPage === "pgHome" && !IMAGINE.state.busy;
      state.rhKey = svKey; switchPage("pgImagine"); await new Promise(r => setTimeout(r, 80));
      return { addBar, addBadge, toast, refusedAdd, noKey };
    });
    report("B6) Object Add shows the bar and the ✎ for the same marked photo but refuses Apply with nothing to add (the pick-what-to-add toast, nothing sent); Object Remove lets red paint alone through the pick guard and, without a key, sends the student to Setup",
      guard.addBar && guard.addBadge && guard.refusedAdd && guard.noKey, guard);

    const flow = await page.evaluate(async () => {
      state.rhKey = "rh-test-key-value-placeholder"; window.__spyGallery();
      IMAGINE.openTool("objremove"); await new Promise(r => setTimeout(r, 60));
      const origBytes = Math.round(IMAGINE.state.photos[0].dataUrl.length * 3 / 4);
      document.getElementById("imApply").click();
      const t0 = Date.now(); while (Date.now() - t0 < 8000 && (IMAGINE.state.busy || !IMAGINE.state.photos[0].out)) await new Promise(r => setTimeout(r, 40));
      const p = IMAGINE.state.photos[0], req = window.__reqs[0] || {};
      const want = IMAGINE.prompt("objremove", "", "", true);
      return { sentOnce: window.__reqs.length === 1, ups: window.__ups.slice(), origBytes, prompt: (req.body && req.body.prompt) || "", same: ((req.body && req.body.prompt) || "") === want, hasImage: !!(req.body && (req.body.imageUrls || req.body.imageUrl || req.body.image)),
        out: !!(p.out && p.out.b64), preset: p.out && p.out.preset, strokesKept: p.strokes.length, markOff: !IMAGINE.state.markMode, cmp: !!document.querySelector(".im-cmp-top"), noWrap: !document.getElementById("imMarkWrap"), badge: !!document.querySelector('#imStrip .im-th[data-idx="0"] .im-th-mk'), gal: window.__gal.length, status: document.getElementById("imStatus").textContent };
    });
    report("B7) a mocked Apply on the marked photo uploads ONE picture that is the composite (far larger than the 60x90 original PNG), sends one submit whose prompt is exactly the mark prompt in the frame, lands the result on the Before | After compare (paint view closed, the strokes and the ✎ kept for a re-run) and saves the take to the Gallery",
      flow.sentOnce && flow.ups.length === 1 && flow.ups[0] > flow.origBytes * 1.5 && flow.same && /RED PAINT/.test(flow.prompt) && flow.hasImage && flow.out && flow.preset === "" && flow.strokesKept === 1 && flow.markOff && flow.cmp && flow.noWrap && flow.badge && flow.gal === 1 && /✓/.test(flow.status),
      { sentOnce: flow.sentOnce, ups: flow.ups, origBytes: flow.origBytes, same: flow.same, head: flow.prompt.slice(0, 80), out: flow.out, cmp: flow.cmp, gal: flow.gal });

    const undo = await page.evaluate(async () => {
      IMAGINE.mark(true); await new Promise(r => setTimeout(r, 60));
      IMAGINE.addStroke(0, [[0.7, 0.7], [0.75, 0.8]], 0.018); const two = IMAGINE.state.photos[0].strokes.length;
      IMAGINE.undoMark(0); const one = IMAGINE.state.photos[0].strokes.length, undoOn = !document.getElementById("imMarkUndo").classList.contains("is-off");
      IMAGINE.clearMark(0); await new Promise(r => setTimeout(r, 30));
      const zero = IMAGINE.state.photos[0].strokes.length, undoOff = document.getElementById("imMarkUndo").classList.contains("is-off"), hint = document.getElementById("imMarkHint").textContent, badge = !!document.querySelector('#imStrip .im-th[data-idx="0"] .im-th-mk');
      IMAGINE.mark(false); await new Promise(r => setTimeout(r, 60));
      return { two, one, undoOn, zero, undoOff, hintBack: Object.values(IMAGINE.data.ui.mark_on_remove).indexOf(hint) >= 0, badge, wrapGone: !document.getElementById("imMarkWrap"), cmpBack: !!document.querySelector("#pgImagine .im-cmp"), markChip: document.getElementById("imMark").classList.contains("on") };
    });
    report("B8) Undo drops the last stroke, Clear drops them all (Undo disabled again, the hint back to paint-red, the ✎ gone) and Done closes the paint view back to the compare",
      undo.two === 2 && undo.one === 1 && undo.undoOn && undo.zero === 0 && undo.undoOff && undo.hintBack && !undo.badge && undo.wrapGone && undo.cmpBack && !undo.markChip, undo);

    report("B9) no page error while the brush was driven", errs.length === 0, errs);
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
