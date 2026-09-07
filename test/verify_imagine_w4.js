/* Imagine W4 (6.33.0) — five more one-tap tools on the same shell: Hair & Makeup, Body Shape, Sky Replace, Text & Sign Edit (a brush
 * that marks the lettering + templates that write the student's typed words), Batch Imagine (recipes: three tools run in order on
 * every photo). What is NEW and pinned here:
 *   A) the roster (the W4 five follow W3, every template counted, nine languages), each tool's own frame line (Hair & Makeup keeps the
 *      face and changes only hair or makeup, Body Shape a BODY SHAPE line and its own REALISM, Sky Replace a SKY LOCK, Text & Sign Edit a
 *      TEXT LOCK with mark "text" + a RED PAINT markPrompt), the four ✎ templates that carry {T} and the tool's own Describe placeholder,
 *      the eight recipes (2–4 real [tool, template] steps of other tools, a nine-language step line), the transfer lines, the new UI
 *      strings, the module's typed-words / recipe / mark-hint code lifted to the panel byte for byte, icons (two new sprite symbols with
 *      their panel tints), art on both surfaces, the lane's two job files (run A: bases + thumbnails; run B: recipe chains on the committed
 *      before-card) and the chain-aware art runner, the What's New row, the CI step.
 *   B) in the browser: the hub shows twenty-two cards; Text & Sign Edit shows the Mark bar with the paint-the-sign hint and its own
 *      Describe placeholder; a ✎ template with no words is refused (the type-the-words toast, the Describe tab opens, nothing sent); the
 *      prompt the page would send writes the words in quotes with no EXTRA WISHES line (and inside the RED PAINT prompt when marked) while
 *      a plain template still takes the words as wishes; a recipe's step prompts are each step's own tool prompt in order, wishes on the
 *      last step only; the recipe tiles carry their step line; a mocked Apply on a recipe sends THREE submits in order whose prompts are
 *      exactly those steps, uploads the previous step's output as the next step's photo, lands the last result and saves one take.
 * Usage: PORT=8931 node test/verify_imagine_w4.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel/js/hnk_imagine.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const RUNNER = fs.readFileSync(path.join(ROOT, "tools/rh_art_gen.js"), "utf8");
const lifter = require("../tools/build_panel_imagine.js");
const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
const DATA = (() => { const a = mod.indexOf("var IMAGINE_DATA = ") + "var IMAGINE_DATA = ".length, b = mod.indexOf(";\nvar IMAGINE = (function(){", a); return new Function("return " + mod.slice(a, b))(); })();
const JOBS_A = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs_w4.json"), "utf8")).jobs;
const JOBS_B = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs_w4b.json"), "utf8")).jobs;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = o => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].length > 0);
const W4 = { hairmakeup: 14, bodyshape: 10, sky: 12, textedit: 8, batch: 8 };
const IDS = Object.keys(W4), TYPED = ["newWords", "shirtPrint", "neonSign", "chalkboard"];
const GEAR = /NO STUDIO GEAR IN THE FRAME/;
const ART = path.join(ROOT, "docs/app/lib/wf/imagine"), PART = path.join(ROOT, "panel/icons/imagine");
const byId = Object.fromEntries(DATA.tools.map(t => [t.id, t]));
const presetOf = (tid, pid) => byId[tid] && byId[tid].presets.find(p => p.id === pid);

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
report("A1) the roster ends with the W4 five in order (hairmakeup · bodyshape · sky · textedit · batch), twenty-two tools and 284 templates in all, every name, summary and template in nine languages, {P} in every base prompt, unique template ids",
  DATA.tools.length === 22 && DATA.tools.slice(-5).map(t => t.id).join(",") === IDS.join(",") && IDS.every(id => byId[id] && byId[id].presets.length === W4[id]) &&
  DATA.tools.reduce((n, t) => n + t.presets.length, 0) === 284 &&
  IDS.every(id => all9(byId[id].name) && all9(byId[id].sum) && /\{P\}/.test(byId[id].basePrompt) && byId[id].presets.every(p => all9(p.name) && p.p.length > 30) && new Set(byId[id].presets.map(p => p.id)).size === byId[id].presets.length),
  { ids: DATA.tools.map(t => t.id), counts: DATA.tools.map(t => t.presets.length) });

report("A2) each tool's own frame line: Hair & Makeup changes only hair or makeup on the same face, Body Shape a BODY SHAPE line and its own REALISM (believable anatomy), Sky Replace a SKY LOCK, Text & Sign Edit a TEXT LOCK with mark 'text' and a RED PAINT markPrompt ({P}, no red paint may remain); Batch Imagine rides the shared frame; every AVOID in force ends with the no-studio-gear rule; the other W4 tools carry no brush",
  /HAIR & MAKEUP:/.test(byId.hairmakeup.keep) && /only the hair \(its style, length or colour\) or the makeup changes/.test(byId.hairmakeup.keep) &&
  /BODY SHAPE: only the proportion named changes/.test(byId.bodyshape.keep) && /believable anatomy and posture/.test(byId.bodyshape.real) &&
  /SKY LOCK/.test(byId.sky.keep) && /TEXT LOCK/.test(byId.textedit.keep) && byId.textedit.mark === "text" && /RED PAINT/.test(byId.textedit.markPrompt) && /\{P\}/.test(byId.textedit.markPrompt) && /No red paint may remain/.test(byId.textedit.markPrompt) &&
  !byId.batch.keep && !byId.batch.avoid && !byId.batch.mark && ["hairmakeup", "bodyshape", "sky", "batch"].every(id => !byId[id].mark && !byId[id].markPrompt) &&
  IDS.every(id => GEAR.test(byId[id].avoid || DATA.frame.avoid)),
  IDS.map(id => ({ id, keep: (byId[id].keep || "").slice(0, 40), mark: byId[id].mark || null })));

const recipes = byId.batch.presets;
report("A3) the four ✎ templates of Text & Sign Edit carry t + {T} (the other four none), the tool brings its own Describe placeholder and hint in nine languages (no other tool does); the eight recipes each name 2–4 real [tool, template] steps of OTHER tools (none typed, none a recipe), a nine-language step line joined with →, three steps each; the new UI strings are in nine languages; the hub's next-waves line no longer promises W4",
  byId.textedit.presets.filter(p => p.t).map(p => p.id).join(",") === TYPED.join(",") && TYPED.every(pid => /\{T\}/.test(presetOf("textedit", pid).p)) && byId.textedit.presets.filter(p => !p.t).every(p => !/\{T\}/.test(p.p)) &&
  all9(byId.textedit.descPh) && all9(byId.textedit.descHint) && DATA.tools.filter(t => t.descPh || t.descHint).length === 1 &&
  recipes.length === 8 && recipes.every(p => Array.isArray(p.steps) && p.steps.length === 3 && p.steps.every(s => s[0] !== "batch" && byId[s[0]] && presetOf(s[0], s[1]) && !presetOf(s[0], s[1]).t && !presetOf(s[0], s[1]).steps) && all9(p.sub) && p.sub.en.split(" → ").length === 3) &&
  recipes.every(p => p.sub.en === p.steps.map(s => byId[s[0]].name.en).join(" → ")) && DATA.tools.filter(t => t.presets.some(p => p.steps)).length === 1 &&
  ["mark_on_text", "err_text_what", "text_needed", "step_of"].every(k => all9(DATA.ui[k])) && /\{k\}/.test(DATA.ui.step_of.en) && /\{n\}/.test(DATA.ui.step_of.en) &&
  !/Hair|Body Shape|Sky|Sign|Batch/.test(DATA.ui.hub_next.en),
  { typed: byId.textedit.presets.filter(p => p.t).map(p => p.id), recipes: recipes.map(p => p.id + ":" + p.steps.map(s => s.join("/")).join(">")), next: DATA.ui.hub_next.en });

const aspects = { hairmakeup: /HAIR and MAKEUP/, bodyshape: /PROPORTIONS and POSTURE/, sky: /SKY of IMAGE 1/, textedit: /TYPOGRAPHIC STYLE/, batch: /overall FINISH/ };
report("A4) the Reference Card transfer lines (IMAGE 1 / IMAGE 2, each tool's own aspect, Copy only, a nine-language hint)",
  IDS.every(id => /IMAGE 1/.test(byId[id].refPrompt) && /IMAGE 2/.test(byId[id].refPrompt) && aspects[id].test(byId[id].refPrompt) && /Copy only/.test(byId[id].refPrompt) && all9(byId[id].refHint)),
  IDS.map(id => ({ id, ref: (byId[id].refPrompt || "").slice(0, 60) })));

const MOD_BITS = ['if(preset && preset.t){ preset = { id:preset.id, p:preset.p.split("{T}").join(\'"\'+desc+\'"\'), t:true }; desc=""; }',
  'function markHint(tool){ return tool.mark==="add" ? "mark_on_add" : tool.mark==="text" ? "mark_on_text" : "mark_on_remove"; }',
  'if(preset && preset.t && !desc){ S.tab="desc"; H.toast(t("err_text_what"),"warn"); render(); return null; }',
  'var steps = (!g.ref && g.preset && g.preset.steps && g.preset.steps.length) ? g.preset.steps : null;',
  'function stepPrompts(steps, desc){', 'function runSteps(p, steps, modelId, size, ctrl, desc, onStep){',
  'last=out; cur="data:"+(out.mime||"image/png")+";base64,"+out.b64; return one();',
  'ta.placeholder=tool.descPh ? H.t9(tool.descPh) : t("desc_ph");', 'meta.appendChild(el("span","mut", tool.descHint ? H.t9(tool.descHint) : t("desc_hint")));',
  '(p.stepN ? t("step_of",{k:p.stepK,n:p.stepN})+" · " : "")', 'steps:function(toolId, presetId, desc){',
  /* the 6.32.0 lines the recipe path branches around are still there, byte for byte */
  '(marked ? composite(p) : Promise.resolve(p.dataUrl)).then(function(src){ return H.generate({ modelId:modelId, prompt:thisPrompt, dataUrl:src,'];
report("A5) the module's W4 code — typed-words templates spend the Describe text into {T}, the mark hint per brush kind, the type-the-words guard, the recipe chain (step prompts, one step's output the next step's photo, the step line in the status), the tool's own Describe placeholder — and the panel lift carries the same bytes; ES5 throughout",
  MOD_BITS.every(b => mod.indexOf(b) >= 0) && MOD_BITS.every(b => PANEL_JS.indexOf(b) >= 0) && !/=>/.test(mod) && !/\b(let|const)\s/.test(mod),
  { app: MOD_BITS.filter(b => mod.indexOf(b) < 0), panel: MOD_BITS.filter(b => PANEL_JS.indexOf(b) < 0) });

const icons = IDS.map(id => ({ id, ic: byId[id].ic, app: new RegExp('<symbol id="' + byId[id].ic + '"').test(APP), panel: ["cream", "gold", "ink", "muted"].every(tint => fs.existsSync(path.join(ROOT, "panel/icons/ui", byId[id].ic + "-" + tint + ".svg"))) }));
report("A6) every W4 tool's icon exists in the app's sprite AND as the panel's icons/ui/<name>-{cream,gold,ink,muted}.svg (i-sun and i-type are new; i-hair, i-body, i-stack were there)",
  icons.every(i => i.app && i.panel) && byId.sky.ic === "i-sun" && byId.textedit.ic === "i-type" && /<symbol id="i-sun" viewBox="0 0 24 24">\s*<circle cx="12" cy="12" r="4"\/>/.test(APP), icons.filter(i => !(i.app && i.panel)));

const art = IDS.flatMap(id => [byId[id].before, byId[id].after].map(f => ({ f, size: jpegSize(path.join(ART, f)), panel: fs.existsSync(path.join(PART, f)) }))
  .concat(byId[id].presets.map(p => { const f = "th/" + id + "-" + p.id + ".jpg"; return { f, size: jpegSize(path.join(ART, f)), panel: fs.existsSync(path.join(PART, f)) }; })));
report("A7) the art is on both surfaces: every card pair 800x1200 and every template thumbnail 420x630 under docs/app/lib/wf/imagine, the same files under panel/icons/imagine",
  art.length === 10 + 52 && art.every(a => a.size && a.panel && ((/^th\//.test(a.f) && a.size.w === 420 && a.size.h === 630) || (!/^th\//.test(a.f) && a.size.w === 800 && a.size.h === 1200))),
  art.filter(a => !(a.size && a.panel)).map(a => a.f).slice(0, 12));

const CATALOG = new Set(["alibaba/qwen-image-3.0-pro/image-edit", "alibaba/wan-2.7/text-to-image-pro"]);
const basesA = JOBS_A.filter(j => /^base-/.test(j.name)), thumbsA = JOBS_A.filter(j => /^th-/.test(j.name));
const chains = recipes.map(r => ({ id: r.id, jobs: JOBS_B.filter(j => j.name === "th-batch-" + r.id || j.name.indexOf("th-batch-" + r.id + "-s") === 0) }));
report("A8) the lane's two W4 job files: run A = the five brand-model bases (Qwen 3.0 Pro image-edit from the two references, 2:3, 2k) + the 44 Hair & Makeup / Body Shape / Sky Replace / Text & Sign Edit thumbnails on their bases (the ✎ templates write their sample words in quotes; no recipe); run B = eight three-step chains: step 1 image-to-image on the committed card-batch-before.jpg, each next step baseFrom the previous, the last named after the recipe; every apiPath in the catalog; the runner schedules jobs as their bases finish",
  basesA.length === 5 && basesA.every(j => IDS.indexOf(j.name.slice(5)) >= 0 && j.apiPath === "alibaba/qwen-image-3.0-pro/image-edit" && Array.isArray(j.refs) && j.refs.length === 2 && j.ratio === "2:3" && j.resolution === "2k") &&
  thumbsA.length === 44 && thumbsA.every(j => /^th-(hairmakeup|bodyshape|sky|textedit)-/.test(j.name) && j.baseFrom === "base-" + j.name.split("-")[1] && j.ratio === "2:3" && j.resolution === "2k") &&
  TYPED.every(pid => { const j = thumbsA.find(x => x.name === "th-textedit-" + pid); return j && /"[^"]{2,}"/.test(j.prompt) && !/\{T\}/.test(j.prompt); }) && thumbsA.every(j => !/\{P\}|\{T\}/.test(j.prompt)) &&
  JOBS_B.length === 24 && chains.every(c => c.jobs.length === 3 && c.jobs[0].name === "th-batch-" + c.id + "-s1" && c.jobs[0].base === "docs/app/lib/wf/imagine/card-batch-before.jpg" && !c.jobs[0].baseFrom && c.jobs[1].baseFrom === c.jobs[0].name && c.jobs[2].name === "th-batch-" + c.id && c.jobs[2].baseFrom === c.jobs[1].name) &&
  chains.every(c => { const r = presetOf("batch", c.id); return c.jobs.every((j, k) => j.prompt.indexOf(presetOf(r.steps[k][0], r.steps[k][1]).p) >= 0 && j.prompt.indexOf(byId[r.steps[k][0]].basePrompt.split("{P}")[0]) === 0); }) &&
  JOBS_A.concat(JOBS_B).every(j => CATALOG.has(j.apiPath)) && /function depsOf\(j\)/.test(RUNNER) && /const ready = waiting\.filter\(j => depsOf\(j\)\.every\(d => outputs\.has\(d\)\)\);/.test(RUNNER) && /while \(waiting\.length\)/.test(RUNNER),
  { a: JOBS_A.length, b: JOBS_B.length, chains: chains.map(c => c.id + ":" + c.jobs.length), runner: /while \(waiting\.length\)/.test(RUNNER) });

const wn = (APP.match(/\{ v:"6\.33\.0", kind:"page", ref:"pgImagine",[\s\S]*?\} \},\n/) || [""])[0];
report("A9) WHATS_NEW carries the 6.33.0 Imagine row (W4, recipes, typed words) with a title and a line in all nine languages, and CI runs this test",
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Imagine W4/.test(wn) && /Batch Imagine/.test(wn) && /PORT=8931 node test\/verify_imagine_w4\.js/.test(CI), { row: wn.slice(0, 120), ci: /verify_imagine_w4/.test(CI) });

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
      return { n: cards.length, last5: cards.slice(-5).map(c => c.getAttribute("data-tool")), chips: cards.slice(-5).map(c => c.querySelector(".im-tplcount").textContent), next: document.querySelector("#pgImagine .im-next").textContent };
    });
    report("B1) the hub shows twenty-two cards, the W4 five last with their template counts (14 · 10 · 12 · 8 · 8), and the next-waves line is the W4 one",
      hub.n === 22 && hub.last5.join(",") === IDS.join(",") && [14, 10, 12, 8, 8].every((n, i) => new RegExp("(^|\\D)" + n + "(\\D|$)").test(hub.chips[i])) && Object.values(DATA.ui.hub_next).indexOf(hub.next) >= 0, hub);

    /* a 60x90 blue photo, made in the page */
    const photo = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 60; c.height = 90; const x = c.getContext("2d"); x.fillStyle = "#1030ff"; x.fillRect(0, 0, 60, 90); return c.toDataURL("image/png"); });

    const text = await page.evaluate(async (png) => {
      IMAGINE.openTool("textedit"); IMAGINE.addPhotos([{ dataUrl: png, name: "sign.png" }]); await new Promise(r => setTimeout(r, 60));
      const hint = document.getElementById("imMarkHint");
      const a = { bar: !!document.getElementById("imMarkBar"), hintIsText: !!hint && Object.values(IMAGINE.data.ui.mark_on_text).indexOf(hint.textContent) >= 0 };
      /* the ✎ tile is marked in its label; pick New Words with no words and press Apply */
      const tile = document.querySelector('#imTpls .im-tpl[data-preset="newWords"]'); a.tileName = tile && tile.querySelector(".im-tpl-nm").textContent; tile.click(); await new Promise(r => setTimeout(r, 60));
      a.tplHint = document.querySelector("#pgImagine .im-tplhint").textContent;
      a.hintNeedsText = Object.values(IMAGINE.data.ui.text_needed).some(s => a.tplHint.indexOf(s) >= 0);
      document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 80));
      a.toast = document.getElementById("toast").textContent; a.refused = !IMAGINE.state.busy && window.__reqs.length === 0 && Object.values(IMAGINE.data.ui.err_text_what).indexOf(a.toast) >= 0;
      a.tab = IMAGINE.state.tab; const ta = document.getElementById("imDesc"); a.placeholder = ta && ta.placeholder; a.phIsOwn = !!ta && Object.values(IMAGINE.data.tools.find(t => t.id === "textedit").descPh).indexOf(ta.placeholder) >= 0;
      a.hintIsOwn = Object.values(IMAGINE.data.tools.find(t => t.id === "textedit").descHint).some(s => document.querySelector("#pgImagine .im-descmeta .mut").textContent === s);
      /* a plain template (Erase the Text) needs no words: the pick guard lets it through to the key guard */
      IMAGINE.state.preset.textedit = "eraseText"; const svKey = state.rhKey; state.rhKey = ""; IMAGINE.render(); await new Promise(r => setTimeout(r, 40));
      document.getElementById("imApply").click(); await new Promise(r => setTimeout(r, 100));
      a.plainPassed = window.__reqs.length === 0 && curPage === "pgHome"; state.rhKey = svKey; switchPage("pgImagine"); await new Promise(r => setTimeout(r, 80));
      return a;
    }, photo);
    report("B2) Text & Sign Edit shows the Mark bar with the paint-the-sign hint; its ✎ New Words tile wears the pen; picked with no words the hint asks for them and Apply is refused with the type-the-words toast (nothing sent) and the Describe tab opens with the tool's own placeholder and hint; a plain template (Erase the Text) passes the pick guard without words",
      text.bar && text.hintIsText && /✎/.test(text.tileName) && text.hintNeedsText && text.refused && text.tab === "desc" && text.phIsOwn && text.hintIsOwn && text.plainPassed, text);

    const prompts = await page.evaluate(() => {
      const T = Object.fromEntries(IMAGINE.data.tools.map(t => [t.id, t])), F = IMAGINE.data.frame, P = (id, pid) => T[id].presets.find(p => p.id === pid);
      const words = IMAGINE.prompt("textedit", "newWords", "HNK STUDIO", false), wordsMarked = IMAGINE.prompt("textedit", "newWords", "HNK STUDIO", true), plainWish = IMAGINE.prompt("textedit", "eraseText", "keep the frame", false);
      const steps = IMAGINE.steps("batch", "travelFix", ""), stepsWish = IMAGINE.steps("batch", "travelFix", "warm and soft"), notRecipe = IMAGINE.steps("lighting", "soft", ""), notPreset = IMAGINE.steps("batch", "nope", "");
      return { words, wordsMarked, plainWish, steps, stepsWish, notRecipe, notPreset, guard: F.guard, textKeep: T.textedit.keep,
        people: P("objremove", "people").p, sunset: P("sky", "goldenSunset").p, crisp: P("upscale", "crisp2x").p, skyKeep: T.sky.keep, upKeep: T.upscale.keep,
        hair: IMAGINE.prompt("hairmakeup", "longWaves", "", false), body: IMAGINE.prompt("bodyshape", "posture", "", false), bodyReal: T.bodyshape.real, sky: IMAGINE.prompt("sky", "clearBlue", "", false) };
    });
    report("B3) the prompt the page would send: a ✎ template writes the typed words in quotes (spelled exactly, no EXTRA WISHES line), inside the RED PAINT prompt when the sign is marked; a plain template still takes the words as EXTRA WISHES; a recipe's steps are each step's own tool prompt in order (Object Remove people → Sky golden sunset → Upscale 2x) each inside its tool's frame ending with the guard, the wishes on the LAST step only; a non-recipe answers null; Hair & Makeup / Body Shape / Sky Replace open with their own frames",
      /^Edit the text in this photograph:/.test(prompts.words) && prompts.words.indexOf('exactly "HNK STUDIO"') > 0 && !/EXTRA WISHES/.test(prompts.words) && !/\{T\}/.test(prompts.words) && prompts.words.indexOf(prompts.textKeep) > 0 && prompts.words.endsWith(prompts.guard) &&
      /^The translucent RED PAINT on this photograph marks the sign/.test(prompts.wordsMarked) && prompts.wordsMarked.indexOf('"HNK STUDIO"') > 0 && !/EXTRA WISHES/.test(prompts.wordsMarked) &&
      /EXTRA WISHES: keep the frame/.test(prompts.plainWish) && /^Edit the text in this photograph:/.test(prompts.plainWish) &&
      Array.isArray(prompts.steps) && prompts.steps.length === 3 && /^Remove from this photograph exactly the following/.test(prompts.steps[0]) && prompts.steps[0].indexOf(prompts.people) > 0 && /^Replace ONLY the sky in this photograph with:/.test(prompts.steps[1]) && prompts.steps[1].indexOf(prompts.sunset) > 0 && prompts.steps[1].indexOf(prompts.skyKeep) > 0 && /^Upscale and enhance this photograph:/.test(prompts.steps[2]) && prompts.steps[2].indexOf(prompts.crisp) > 0 && prompts.steps[2].indexOf(prompts.upKeep) > 0 && prompts.steps.every(s => s.endsWith(prompts.guard)) &&
      !/EXTRA WISHES/.test(prompts.stepsWish[0]) && !/EXTRA WISHES/.test(prompts.stepsWish[1]) && /EXTRA WISHES: warm and soft/.test(prompts.stepsWish[2]) && prompts.notRecipe === null && prompts.notPreset === null &&
      /^Change ONLY the hair and\/or the makeup/.test(prompts.hair) && /^Reshape the body of the person/.test(prompts.body) && prompts.body.indexOf(prompts.bodyReal) > 0 && /^Replace ONLY the sky/.test(prompts.sky),
      { words: prompts.words.slice(0, 140), marked: prompts.wordsMarked.slice(0, 90), steps: (prompts.steps || []).map(s => s.slice(0, 60)) });

    const tiles = await page.evaluate(async () => {
      /* B2's type-the-words guard left the Describe tab open; a tool keeps the tab it was left on, so go back to Templates first */
      IMAGINE.state.tab = "tpl"; IMAGINE.openTool("batch"); await new Promise(r => setTimeout(r, 60));
      const tl = [...document.querySelectorAll('#imTpls .im-tpl:not(.im-ref)')];
      const tf = document.querySelector('#imTpls .im-tpl[data-preset="travelFix"]'); tf.click(); await new Promise(r => setTimeout(r, 60));
      return { n: tl.length, subs: tl.map(t => (t.querySelector(".im-tpl-sub") || {}).textContent || ""), noBar: !document.getElementById("imMarkBar"), hint: document.querySelector("#pgImagine .im-tplhint").textContent, picked: IMAGINE.state.preset.batch };
    });
    report("B4) Batch Imagine's eight recipe tiles each carry their step line (three tool names joined with →) in the page's language, the tool shows no Mark bar, and picking Travel Photo Fix names it",
      tiles.n === 8 && tiles.subs.every(s => s.split(" → ").length === 3) && tiles.noBar && tiles.picked === "travelFix" && /✓/.test(tiles.hint) && Object.values(presetOf("batch", "travelFix").name).some(n => tiles.hint.indexOf(n) >= 0), tiles);

    const flow = await page.evaluate(async () => {
      state.rhKey = "rh-test-key-value-placeholder"; window.__spyGallery(); window.__reqs.length = 0; window.__ups.length = 0;
      const origBytes = atob(IMAGINE.state.photos[0].dataUrl.split(",")[1]).length, outBytes = atob(window.__outB64).length;
      const want = IMAGINE.steps("batch", "travelFix", "");
      document.getElementById("imApply").click();
      const t0 = Date.now(); while (Date.now() - t0 < 12000 && (IMAGINE.state.busy || !IMAGINE.state.photos[0].out)) await new Promise(r => setTimeout(r, 40));
      const p = IMAGINE.state.photos[0], sent = window.__reqs.map(r => (r.body && r.body.prompt) || "");
      return { n: window.__reqs.length, same: sent.length === want.length && sent.every((s, i) => s === want[i]), ups: window.__ups.slice(), origBytes, outBytes, out: !!(p.out && p.out.b64), preset: p.out && p.out.preset, tool: p.out && p.out.tool, busy: IMAGINE.state.busy, cmp: !!document.querySelector(".im-cmp-top"), gal: window.__gal.length, snip: window.__gal[0] && window.__gal[0].snip, status: document.getElementById("imStatus").textContent };
    });
    report("B5) a mocked Apply on the Travel Photo Fix recipe sends THREE submits in order whose prompts are exactly the recipe's step prompts, uploads the original once and then the previous step's output twice (the tiny mock PNG, not the photo), lands the last result on the Before | After compare under the recipe's name and saves ONE take to the Gallery naming the recipe",
      flow.n === 3 && flow.same && flow.ups.length === 3 && Math.abs(flow.ups[0] - flow.origBytes) <= 3 && flow.ups[1] === flow.outBytes && flow.ups[2] === flow.outBytes && flow.ups[1] !== flow.ups[0] && flow.out && flow.preset === "travelFix" && flow.tool === "batch" && !flow.busy && flow.cmp && flow.gal === 1 && Object.values(presetOf("batch", "travelFix").name).some(n => String(flow.snip).indexOf(n) >= 0) && /✓/.test(flow.status),
      { n: flow.n, same: flow.same, ups: flow.ups, origBytes: flow.origBytes, outBytes: flow.outBytes, out: flow.out, preset: flow.preset, gal: flow.gal, snip: flow.snip, status: flow.status });

    const typedFlow = await page.evaluate(async () => {
      window.__reqs.length = 0; window.__ups.length = 0;
      IMAGINE.openTool("textedit"); await new Promise(r => setTimeout(r, 60));
      IMAGINE.state.preset.textedit = "newWords"; IMAGINE.state.desc.textedit = "HNK STUDIO"; IMAGINE.render(); await new Promise(r => setTimeout(r, 40));
      const want = IMAGINE.prompt("textedit", "newWords", "HNK STUDIO", false);
      document.getElementById("imApply").click();
      const t0 = Date.now(); while (Date.now() - t0 < 8000 && IMAGINE.state.busy) await new Promise(r => setTimeout(r, 40));
      const req = window.__reqs[0] || {}, p = IMAGINE.state.photos[0];
      return { n: window.__reqs.length, prompt: (req.body && req.body.prompt) || "", same: ((req.body && req.body.prompt) || "") === want, quoted: /"HNK STUDIO"/.test((req.body && req.body.prompt) || ""), out: !!(p.out && p.out.b64), preset: p.out && p.out.preset };
    });
    report("B6) a mocked Apply on ✎ New Words with the words typed sends ONE submit whose prompt is the typed-words prompt (the words in quotes) and lands the result under the template's name",
      typedFlow.n === 1 && typedFlow.same && typedFlow.quoted && typedFlow.out && typedFlow.preset === "newWords", { n: typedFlow.n, same: typedFlow.same, head: typedFlow.prompt.slice(0, 120), out: typedFlow.out });

    report("B7) no page error while W4 was driven", errs.length === 0, errs);
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
