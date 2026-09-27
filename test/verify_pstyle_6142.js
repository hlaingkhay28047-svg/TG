/* 6.142.0 / panel 6.213.0 — PORTRAIT STYLE: the studio flow from the owner's video, as a page on both surfaces.
 *
 * THE VIDEO. A Vietnamese studio, a tethered camera, a tablet. The customer and the photographer pick a
 * reference photo they like (a birthday set with blue balloons, from a Xiaohongshu post); the child is
 * photographed against a plain wall; the app is given the photo and the reference; a minute later the
 * tablet shows the child in the reference's outfit, background, props and light — the same face. Then a
 * compare slider, side by side, three photos, result only; download; print; create again; a new photo;
 * every attempt of the session kept as a version.
 *
 * THE PAGE. Edit ▸ Style (pgPStyle / pagePStyle): three steps drawn by ONE module on both surfaces
 * (the Imagine pattern — PSTYLE_MODULE in docs/app/index.html, lifted verbatim into panel/js/hnk_pstyle.js
 * by tools/build_panel_pstyle.js, each surface handing in a host adapter). 01 Your photo: a file, the
 * camera (web), the Gallery (web), the recent photos. 02 Style: your own reference first, the recent
 * references, the studio's own looks in six groups (the Imagine tools' templates on the brand model), a
 * caption, six toggles for what comes across (the face is never a choice — the identity lock is in the
 * frame), model · size · count. 03 Result: four compare modes, the version list, Saved to the Gallery,
 * Download (Place into Photoshop on the panel), Print (web), Create again, New photo, the hand-off chips.
 * Generation goes through the studio's own image-edit engines with the photo first and the reference
 * second — never a new endpoint.
 *
 * A) the source on both surfaces and the lift in sync   B) the web app driven with a mocked RunningHub:
 * the three steps, the reference grid, the toggles and the prompt, the run, the compare modes, the
 * versions, Download, Stop, the recent photos, the camera   C) the panel boots the same module
 * D) What's New   E) release pins
 * Usage: PORT=8931 node test/verify_pstyle_6142.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");
const lifter = require("../tools/build_panel_pstyle.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PANEL_HTML = read("panel/index.html");
const PANEL_JS = read("panel/js/hnk_pstyle.js");
const PARITY = read("test/verify_panel_page_parity.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.146.0", PVER = "6.217.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.142.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 288;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PHOTO = fs.readFileSync(path.join(ROOT, "tools", "art_ref", "hnk-model.jpg")).toString("base64");

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 700)));
  if (!ok) failures++;
}

/* ---------------- A) the source ---------------- */
function partA() {
  const D = A.readPstyle();
  const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
  const css = lifter.between(APP, lifter.C0, lifter.C1, "css");
  report("A1) the page is registered after Imagine on both surfaces, the Edit roster carries it (7 pages), the shell loads data/pstyle.js by content tag, and the parity walk reads it",
    /\["pgImagine","i-wand","Imagine"\],[^\n]*\n\s*\["pgPStyle","i-compare","Style"\]/.test(APP) &&
    /pages:\["pgCreate","pgImagine","pgPStyle","pgMeitu","pgEvoto","pgRetouch","pgPath"\]/.test(APP) &&
    /<div class="page" id="pgPStyle">/.test(APP) && /<div id="psRoot"><\/div>/.test(APP) &&
    /<input type="file" id="psFile" accept="image\/\*" style="display:none" aria-hidden="true" tabindex="-1">/.test(APP) &&
    /<input type="file" id="psRefFile" accept="image\/\*" style="display:none" aria-hidden="true" tabindex="-1">/.test(APP) &&
    new RegExp('<script src="data/pstyle\\.js\\?v=' + A.contentTag("pstyle") + '"></script>').test(APP) &&
    has(APP, 'if(id==="pgPStyle" && typeof pstyleOnEnter==="function"){ try{ pstyleOnEnter(); }catch(e){} }') &&
    has(MAIN, '{ key: "pstyle",  page: "pagePStyle",  group: "edit",  sub: "Style",     ic: "i-compare" },') &&
    has(MAIN, 'if (key === "pstyle") { try { pstyleEnter(); } catch (e) { hwarn("pstyle:", e); } }') &&
    has(PANEL_HTML, '<div class="page apg" id="pagePStyle">') && has(PANEL_HTML, '<script src="js/hnk_pstyle.js"></script>') &&
    has(PARITY, 'appKey: "pgPStyle", panelRoot: "#pagePStyle", appRoot: "#pgPStyle"'));

  report("A2) the module reads its tables from data/pstyle.js, hangs itself on window.HNK.pstyle, and the panel's copy is the lift of today's source (byte for byte, tables inlined) — nothing to write",
    has(mod, "var PSTYLE_DATA = window.HNK_PSTYLE;") && has(mod, "var PSTYLE = (function(){") && has(mod, "window.HNK.pstyle=PSTYLE;") &&
    has(PANEL_JS, "var PSTYLE_DATA = " + A.pstyleText() + ";") && has(PANEL_JS, "globalThis.HNK.pstyle = PSTYLE;") &&
    lifter.build({ dry: true }).changed.length === 0, { drift: lifter.build({ dry: true }).changed });

  report("A3) the words: " + Object.keys(D.ui).length + " ui strings and six group names in all nine base languages; six toggles with an ON and an OFF line; the frame carries the roles, the task, the identity lock, the realism, the avoid list and the guard",
    Object.keys(D.ui).length >= 60 && Object.keys(D.ui).every((k) => all9(D.ui[k])) && D.groups.length === 13 && D.groups.every((g) => all9(g.name)) &&
    D.opts.length === 6 && D.opts.every((o) => o.id && typeof o.def === "boolean" && o.on && o.off) &&
    ["roles", "task", "keep", "real", "avoid", "guard"].every((k) => typeof D.frame[k] === "string" && D.frame[k].length > 20) &&
    has(D.frame.roles, "IMAGE 1 = MAIN SUBJECT") && has(D.frame.roles, "IMAGE 2 = STYLE REFERENCE") && has(D.frame.keep, "IDENTITY LOCK"),
    { missing: Object.keys(D.ui).filter((k) => !all9(D.ui[k])) });

  const rh = APP.slice(APP.indexOf("var RH_MODELS"), APP.indexOf("var RH_MODELS") + 40000);
  report("A4) every engine the page offers exists in the app's RH_MODELS and every group points at an Imagine tool whose thumbnails ship on both surfaces — no invented endpoint, no missing picture",
    D.models.length >= 6 && D.models.every((id) => new RegExp('id:"' + id + '"').test(rh)) &&
    D.groups.every((g) => { if (g.sets) return g.sets.length >= 6 && g.sets.every((s) => fs.existsSync(path.join(ROOT, "docs/app/lib/wf/pstyle/th", s.thumb)) && fs.existsSync(path.join(PANEL, "icons/pstyle/th", s.thumb))); const im = A.readImagine(); const t = im.tools.find((x) => x.id === g.tool); return !!t && t.presets.length >= 8 && t.presets.every((p) => fs.existsSync(path.join(ROOT, "docs/app/lib/wf/imagine/th", t.id + "-" + p.id + ".jpg")) && fs.existsSync(path.join(PANEL, "icons/imagine/th", t.id + "-" + p.id + ".jpg"))); }),
    { models: D.models.filter((id) => !new RegExp('id:"' + id + '"').test(rh)) });

  report("A5) the hosts: the web app's brings the camera (getUserMedia), the Gallery picker, the browser's print dialog, IndexedDB for the recent photos and references, and the hand-off chips; the panel's brings the layer/file sheet and Place into Photoshop, no camera, no print",
    has(APP, "PSTYLE.init(host, $(\"psRoot\"));") && has(APP, "navigator.mediaDevices.getUserMedia({ video:vc, audio:false })") && has(APP, "deviceId:{ exact:deviceId }") && has(APP, "camera: camera,") &&
    has(APP, "printOut: printOut,") && has(APP, 'kvGet("hnk_ps_recent_v1")') && has(APP, 'kvGet("hnk_ps_refs_v1")') && has(APP, 'stHandoffRow(hostEl.id, out.mime, out.b64, "portrait-style")') &&
    has(APP, 'page:"pgPStyle"') &&
    has(MAIN, "function pstyleHost() {") && has(MAIN, "function pstyleEnter() {") && has(MAIN, "state.lastAction = \"Portrait Style\";") &&
    has(MAIN, "REFRESHERS.push(function () { try { if (pstyleReady) pstyleEnter(); } catch (e) { } });") &&
    !has(MAIN.slice(MAIN.indexOf("function pstyleHost() {"), MAIN.indexOf("function pstyleEnter() {")), "camera:") &&
    !has(MAIN.slice(MAIN.indexOf("function pstyleHost() {"), MAIN.indexOf("function pstyleEnter() {")), "printOut:"));

  report("A6) the lifted CSS draws on UXP: no grid, no gap, no pointer-events inside the PSTYLE_CSS block; the panel's copy carries the renamed page id and tokens",
    !/display:\s*grid/.test(css) && !/\bgap:/.test(css) && !/pointer-events/.test(css) &&
    has(read("panel/styles.css"), "#pagePStyle .ps-steps{") && !has(read("panel/styles.css").slice(read("panel/styles.css").indexOf(lifter.C0), read("panel/styles.css").indexOf(lifter.C1)), "var(--gold)"));
}

/* ---------------- B) the web app ---------------- */
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
  Object.defineProperty(window, "__spyGallery", { value: function(){ if (_ga) return; _ga = window.galleryAdd; window.galleryAdd = function(out, snip, meta){ window.__gal.push({ mime: out.mime, snip: snip, page: meta && meta.page, before: !!(meta && meta.before) }); return Promise.resolve(); }; } });
  window.__dl = []; HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
  window.__printed = 0;
})();`;

async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.addInitScript(MOCK);
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; switchPage("pgPStyle"); });
  await page.waitForTimeout(500);

  const b1 = await page.evaluate(() => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    return { page: curPage, steps: qa("#psRoot .ps-step").map((b) => b.querySelector(".ps-step-t").textContent), on: (q("#psRoot .ps-step.on .ps-step-n") || {}).textContent,
      add: !!q("#psAdd"), cam: !!q("#psCam"), gal: !!q("#psGal"), hint: !!q("#psRoot .ps-hint"), tip: (q("#psRoot .ps-tip") || {}).textContent, next: !!q("#psNext1"), kick: q("#pgPStyle .ph-kick").textContent, sub: [...document.querySelectorAll("#subtabbar .subtab")].map((s) => s.textContent.trim()) };
  });
  report("B1) Edit ▸ Style opens on step 01 of three (Your photo · Style · Result) with Add a photo, Take a photo and From the Gallery, the hint, the studio tip and no Next yet; the Edit sub-tabs carry it",
    b1.page === "pgPStyle" && b1.steps.length === 3 && b1.steps[0] === "သင့်ပုံ" && b1.steps[1] === "ပုံစံ" && b1.steps[2] === "ရလဒ်" && b1.on === "01" &&
    b1.add && b1.cam && b1.gal && b1.hint && b1.tip.length > 20 && !b1.next && b1.kick === "Portrait Style" && b1.sub.indexOf("Style") >= 0, b1);

  const b2 = await page.evaluate(async (b64) => {
    PSTYLE.setPhoto({ dataUrl: "data:image/jpeg;base64," + b64, name: "kid.jpg" });
    await new Promise((r) => setTimeout(r, 300));
    const q = (s) => document.querySelector(s);
    const out = { preview: !!q("#psRoot .ps-photo img"), next: !!q("#psNext1"), change: !!q("#psChange"), step: PSTYLE.state.step, w: PSTYLE.state.photo.w, h: PSTYLE.state.photo.h };
    q("#psNext1").click(); await new Promise((r) => setTimeout(r, 200));
    out.step2 = PSTYLE.state.step; out.on = (q("#psRoot .ps-step.on .ps-step-n") || {}).textContent;
    out.own = !!q("#psAddRef"); out.groups = [...document.querySelectorAll("#psRoot .ps-groups .chip")].map((c) => c.getAttribute("data-group"));
    out.cards = document.querySelectorAll("#psGrid .ps-card").length; out.thumb = (q("#psGrid .ps-card img") || {}).getAttribute("src");
    out.opts = [...document.querySelectorAll("#psRoot .ps-opt input")].map((i) => i.id.replace("psOpt_", "") + "=" + i.checked);
    out.lock = !!q("#psRoot .ps-opt-lock"); out.model = q("#psModel") && q("#psModel").getAttribute("aria-label"); out.size = q("#psSize") && q("#psSize").getAttribute("aria-label");
    out.genOff = q("#psGen").classList.contains("is-off"); out.recentKv = await kvGet("hnk_ps_recent_v1");
    return out;
  }, PHOTO);
  report("B2) a photo goes on step 01 (preview, Change photo, Next) and is remembered in IndexedDB; Next opens step 02: your own reference first, thirteen groups (seven occasions of the studio's own sets, six building blocks), a grid of the studio's looks with thumbnails, six toggles at their defaults (hair off), the face lock, named Model and Size selects, Create disabled until a reference is chosen",
    b2.preview && b2.next && b2.change && b2.step === 1 && b2.w === 520 && b2.h === 600 && b2.step2 === 2 && b2.on === "02" && b2.own &&
    b2.groups.join() === "birthday,graduation,wedding,myanmar,family,corporate,festive,scene,outfit,light,hair,tone,id" && b2.cards >= 6 && /lib\/wf\/pstyle\/th\/birthday-/.test(b2.thumb || "") &&
    b2.opts.join() === "pose=true,outfit=true,bg=true,props=true,light=true,hair=false" && b2.lock && b2.model && b2.size && b2.genOff &&
    Array.isArray(b2.recentKv) && b2.recentKv.length === 1, b2);

  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    q('#psRoot .ps-groups .chip[data-group="outfit"]').click(); await new Promise((r) => setTimeout(r, 120));
    const out = { outfitCards: document.querySelectorAll("#psGrid .ps-card").length, outfitThumb: (q("#psGrid .ps-card img") || {}).getAttribute("src") };
    const first = q("#psGrid .ps-card"); first.click(); await new Promise((r) => setTimeout(r, 120));
    out.picked = PSTYLE.state.ref && PSTYLE.state.ref.kind; out.pickedId = PSTYLE.state.ref && PSTYLE.state.ref.id; out.onCard = !!q("#psGrid .ps-card.on"); out.genOn = !q("#psGen").classList.contains("is-off");
    q("#psOpt_hair").click(); await new Promise((r) => setTimeout(r, 60));
    q("#psCaption").value = "blue balloons and a cake"; q("#psCaption").dispatchEvent(new Event("input", { bubbles: true }));
    const pr = PSTYLE.prompt();
    out.prompt = pr;
    out.promptOk = pr.indexOf("IMAGE 1 = MAIN SUBJECT") === 0 && pr.indexOf("REFERENCE DESCRIPTION:") > 0 && pr.indexOf("ABOUT THE REFERENCE (from the studio): blue balloons and a cake") > 0 &&
      pr.indexOf("HAIR AND MAKEUP: give the person the hairstyle") > 0 && pr.indexOf("POSE: keep the person's own pose") > 0 && pr.indexOf("IDENTITY LOCK") > 0 && pr.indexOf("TASK GUARD") > 0;
    return out;
  });
  report("B3) the Outfits group draws its own cards; a tap picks the look (the card lights, Create wakes); the prompt starts with the two image roles, carries the look's description, the studio's caption, every toggle's line (hair ON after the tap), the identity lock and the guard",
    b3.outfitCards >= 12 && /imagine\/th\/outfit-/.test(b3.outfitThumb || "") && b3.picked === "set" && /^outfit:/.test(b3.pickedId || "") && b3.onCard && b3.genOn && b3.promptOk, { picked: b3.pickedId, prompt: (b3.prompt || "").slice(0, 300) });

  const b4 = await page.evaluate(async () => {
    window.__spyGallery();
    const q = (s) => document.querySelector(s);
    q("#psGen").click();
    const t0 = Date.now(); while (Date.now() - t0 < 12000 && (PSTYLE.state.busy || !PSTYLE.state.versions.length)) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 200));
    const req = window.__reqs[0] || {};
    const out = { step: PSTYLE.state.step, on: (q("#psRoot .ps-step.on .ps-step-n") || {}).textContent, versions: PSTYLE.state.versions.length, title: (q("#psRoot .ps-h2") || {}).textContent,
      sent: window.__reqs.length, url: req.url, images: (req.body && (req.body.imageUrls || req.body.images || req.body.image_urls) || []).length, prompt: (req.body && req.body.prompt) || "",
      modes: [...document.querySelectorAll("#psRoot .ps-cmp .chip")].map((c) => c.getAttribute("data-cmp")), slider: !!q("#psStage .ps-cmpbox[role=slider]"), tags: [...document.querySelectorAll("#psStage .ps-tag")].map((t) => t.textContent),
      gal: window.__gal, meta: (q("#psRoot .ps-meta") || {}).textContent, saved: !!q("#psRoot .ps-saved"), dl: !!q("#psDl"), print: !!q("#psPrint"), regen: !!q("#psRegen"), nw: !!q("#psNew"), handoff: document.querySelectorAll("#psHandoff .chip").length, verRows: document.querySelectorAll("#psVersions .ps-ver").length };
    PSTYLE.setCmp("side"); await new Promise((r) => setTimeout(r, 60)); out.side = document.querySelectorAll("#psStage .ps-pane").length;
    PSTYLE.setCmp("three"); await new Promise((r) => setTimeout(r, 60)); out.three = document.querySelectorAll("#psStage .ps-pane").length; out.threeTags = [...document.querySelectorAll("#psStage .ps-tag")].map((t) => t.textContent);
    PSTYLE.setCmp("result"); await new Promise((r) => setTimeout(r, 60)); out.result = document.querySelectorAll("#psStage .ps-pane").length;
    PSTYLE.setCmp("slider"); await new Promise((r) => setTimeout(r, 60));
    q("#psDl").click(); out.dl1 = window.__dl[0];
    return out;
  });
  report("B4) Create runs one call through the studio's RunningHub path with the photo AND the reference and the composed prompt; step 03 says Your photo is done; the slider stage (a keyboard slider), four modes (side by side = 2 panes, three photos = original · reference · result, result only = 1), the Gallery record with the original as its Before, the size line, Download named hnk-portrait-style-…, Print, Create again, New photo, the hand-off chips and one version row",
    b4.step === 3 && b4.on === "03" && b4.versions === 1 && b4.title === "သင့်ပုံ ပြီးပါပြီ" && b4.sent === 1 && /runninghub\.ai\/openapi\/v2\//.test(b4.url || "") && b4.images === 2 &&
    has(b4.prompt, "IMAGE 2 = STYLE REFERENCE") && b4.modes.join() === "slider,side,three,result" && b4.slider && b4.tags.length === 2 &&
    b4.gal.length === 1 && b4.gal[0].page === "pgPStyle" && b4.gal[0].before && /^Portrait Style · /.test(b4.gal[0].snip) &&
    b4.saved && b4.dl && b4.print && b4.regen && b4.nw && b4.handoff >= 3 && b4.verRows === 1 && b4.side === 2 && b4.three === 3 && b4.threeTags.join() === "မူရင်း,Reference,ရလဒ်" && b4.result === 1 &&
    /^hnk-portrait-style-\d{8}-\d{6}\.png$/.test(b4.dl1 || ""), Object.assign({}, b4, { prompt: (b4.prompt || "").slice(0, 60), url: (b4.url || "").slice(0, 80) }));

  const b5 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    q("#psRegen").click();
    const t0 = Date.now(); while (Date.now() - t0 < 12000 && (PSTYLE.state.busy || PSTYLE.state.versions.length < 2)) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
    const rows = [...document.querySelectorAll("#psVersions .ps-ver")];
    const out = { versions: PSTYLE.state.versions.length, rows: rows.length, first: rows[0] && rows[0].querySelector("b").textContent, firstOn: rows[0] && rows[0].classList.contains("on"), cur: PSTYLE.state.cur };
    rows[1].click(); await new Promise((r) => setTimeout(r, 80)); out.curAfter = PSTYLE.state.cur; out.secondOn = document.querySelectorAll("#psVersions .ps-ver")[1].classList.contains("on");
    window.__hang = true; q("#psRegen").click(); await new Promise((r) => setTimeout(r, 400));
    out.busy = PSTYLE.state.busy; out.stopBtn = !!q("#psStop"); q("#psStop").click(); await new Promise((r) => setTimeout(r, 300));
    out.stopped = !PSTYLE.state.busy && (q("#psStatus") || {}).textContent === "ရပ်လိုက်ပါပြီ"; window.__hang = false;
    q("#psNew").click(); await new Promise((r) => setTimeout(r, 150));
    out.step = PSTYLE.state.step; out.photo = !!PSTYLE.state.photo; out.recent = document.querySelectorAll("#psRecent .ps-th").length;
    q("#psRecent .ps-th").click(); await new Promise((r) => setTimeout(r, 200)); out.back = !!PSTYLE.state.photo && !!q("#psNext1");
    return out;
  });
  report("B5) Create again adds Version 2 at the top of the list and shows it; a tap on an older row shows that one; a hanging call is Stopped by the button; New photo returns to an empty step 01 with the recent strip, and one tap on it brings the photo back",
    b5.versions === 2 && b5.rows === 2 && b5.first === "Version 2" && b5.firstOn && b5.cur === 0 && b5.curAfter === 1 && b5.secondOn && b5.busy && b5.stopBtn && b5.stopped &&
    b5.step === 1 && !b5.photo && b5.recent === 1 && b5.back, b5);

  const b6 = await page.evaluate(async (b64) => {
    const q = (s) => document.querySelector(s);
    PSTYLE.setStep(2); await new Promise((r) => setTimeout(r, 100));
    PSTYLE.setOwnRef({ dataUrl: "data:image/jpeg;base64," + b64, name: "pinterest.jpg" }); await new Promise((r) => setTimeout(r, 200));
    const out = { own: !!q("#psRoot .ps-own.on .ps-own-im"), kind: PSTYLE.state.ref && PSTYLE.state.ref.kind, refs: await kvGet("hnk_ps_refs_v1"), recentRefs: document.querySelectorAll("#psRecentRefs .ps-th").length, noSetCard: !q("#psGrid .ps-card.on") };
    const pr = PSTYLE.prompt(); out.noDesc = pr.indexOf("REFERENCE DESCRIPTION:") < 0;
    q("#psRoot .ps-own-x").click(); await new Promise((r) => setTimeout(r, 100)); out.cleared = !PSTYLE.state.ref && !!q("#psAddRef");
    return out;
  }, PHOTO);
  report("B6) your own reference: the photo goes on the first card, is remembered among the recent references, un-lights any studio look, sends no description line, and Remove clears it",
    b6.own && b6.kind === "own" && Array.isArray(b6.refs) && b6.refs.length === 1 && b6.recentRefs === 1 && b6.noSetCard && b6.noDesc && b6.cleared, b6);

  /* the camera: Chromium's fake device gives a moving test pattern; the sheet, Snap, the photo */
  const b7 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    PSTYLE.setStep(1); await new Promise((r) => setTimeout(r, 100));
    PSTYLE.state.photo = null; PSTYLE.render(); await new Promise((r) => setTimeout(r, 100));
    q("#psCam").click();
    const t0 = Date.now(); while (Date.now() - t0 < 6000 && !(q("#psCamSheet video") && q("#psCamSheet video").videoWidth > 0)) await new Promise((r) => setTimeout(r, 50));
    const out = { sheet: !!q("#psCamSheet"), video: !!q("#psCamSheet video"), vw: q("#psCamSheet video") ? q("#psCamSheet video").videoWidth : 0, snap: !!q("#psSnap"), flip: !!q("#psFlip"), cancel: !!q("#psCamCancel") };
    if (out.vw > 0) { q("#psSnap").click(); await new Promise((r) => setTimeout(r, 400)); }
    out.gone = !q("#psCamSheet"); out.photo = !!(PSTYLE.state.photo && /^data:image\/jpeg;base64,/.test(PSTYLE.state.photo.dataUrl)); out.name = PSTYLE.state.photo && PSTYLE.state.photo.name; out.next = !!q("#psNext1");
    return out;
  });
  report("B7) Take a photo opens the camera sheet (live view, Snap, Flip, Cancel); Snap closes it and puts the JPEG on step 01 as camera-….jpg with Next",
    b7.sheet && b7.video && b7.vw > 0 && b7.snap && b7.flip && b7.cancel && b7.gone && b7.photo && /^camera-\d+\.jpg$/.test(b7.name || "") && b7.next, b7);

  report("B8) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) the panel ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
async function partC(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const pp = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = []; pp.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pp.route("**/*", (r) => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await pp.addInitScript(UXP_STUB);
    await pp.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await pp.waitForTimeout(2500);
    const c1 = await pp.evaluate(async (b64) => {
      switchPage("pstyle"); await new Promise((r) => setTimeout(r, 300));
      const q = (s) => document.querySelector(s);
      const out = { page: state.page, on: !!q("#pagePStyle.on"), steps: document.querySelectorAll("#pagePStyle .ps-steps .ps-step").length, add: !!q("#psAdd"), cam: !!q("#psCam"), gal: !!q("#psGal"), kick: q("#pagePStyle .ph-kick").textContent };
      const ps = globalThis.HNK.pstyle; ps.setPhoto({ dataUrl: "data:image/jpeg;base64," + b64, name: "layer" }); await new Promise((r) => setTimeout(r, 200));
      q("#psNext1").click(); await new Promise((r) => setTimeout(r, 200));
      out.step = ps.state.step; out.cards = document.querySelectorAll("#psGrid .ps-card").length; out.thumb = (q("#psGrid .ps-card img") || {}).getAttribute("src");
      out.model = q("#psModel") && q("#psModel").getAttribute("aria-label"); out.own = !!q("#psAddRef"); out.opts = document.querySelectorAll("#pagePStyle .ps-opt input").length;
      q("#psGrid .ps-card").click(); await new Promise((r) => setTimeout(r, 100)); out.picked = ps.state.ref && ps.state.ref.kind; out.prompt = ps.prompt().indexOf("IMAGE 1 = MAIN SUBJECT") === 0;
      return out;
    }, PHOTO);
    report("C1) the panel boots the same module on Edit ▸ Style: three steps, Add a photo through the layer/file sheet, no camera and no Gallery button, the same grid of looks from icons/imagine/th, the six toggles, the named Model select, the same prompt",
      c1.page === "pstyle" && c1.on && c1.steps === 3 && c1.add && !c1.cam && !c1.gal && c1.kick === "Portrait Style" && c1.step === 2 && c1.cards >= 6 && /^icons\/pstyle\/th\/birthday-/.test(c1.thumb || "") && c1.model && c1.own && c1.opts === 6 && c1.picked === "set" && c1.prompt, c1);
    report("C2) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgPStyle");
  report("D1) What's New carries the " + WAVE_V + " row for the new page in nine languages, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgPStyle") === WN.panelRow(WAVE_V, "pgPStyle") && WN.appRow(WAVE_V, "pgPStyle").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the named-controls check it follows",
    steps === COUNT && has(CI, "node test/verify_pstyle_6142.js") && CI.indexOf("verify_pstyle_6142.js") > CI.indexOf("verify_named_controls_6141.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

(async function main() {
  partA();
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    withPremium(browser);
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
