/* v6.77.0 / panel 6.148.0 — THE CONTROLS PHOTOSHOP COULD NOT HONOUR.

   The owner asked: "UI ရှိပြီး အလုပ်မလုပ်တာ ရှိလား — is there anything in the
   panel that draws but does nothing?" A crawl tapped 2,400-odd controls on all
   sixteen panel pages and cross-read the facts the owner's Photoshop
   photographs had already proven (no localStorage: 6.145.0; no geometry, rect ·
   client · scroll · offset all 0: 6.137.0; no <video>). Five things came out,
   and this file pins every one of them:

     1. Web Storage where the host has none — src/app/uxp-local-storage.js.
        Forty-one lifted call sites (recipes, the watermark logo, Styles 880
        favourites, Library ★, Smart Workflow favourites, Imagine's photos)
        wrote to localStorage in silence. The shim installs ONLY when the host's
        storage does not round-trip a value, over hnk_local_storage.json.
     2. The Imagine brush and the two Before|After sliders read a zero rect and
        bailed. imNorm / imDragX now fall back to the pointer's own offsetX/Y
        and to the width the cascade echoes (window.innerWidth less each
        ancestor's padding/border/margin); the brush canvas takes the photo's
        natural size when no ruler answers.
     3. The Video page's result was a black <video> box; without a player it
        now says the clip is ready (Download / Open) and each take is a tile.
     4. Path's Effects and Prompt-preview headers had no handler on either side.
     5. A Styles 880 catalog that is not a list threw on every tap.

   Fault-injected while writing: dropping the shim <script> fails A1; restoring
   the old getBoundingClientRect brush fails C1; VIDEO_OK forced true fails D1;
   removing wireStaticGrp("ptGrpFx") fails E1; removing the Array.isArray guard
   fails F1. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/* ============================ A. SOURCE PINS ============================ */
const INDEX = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const SHIM = fs.readFileSync(path.join(PANEL, "src/app/uxp-local-storage.js"), "utf8");
const HOME = fs.readFileSync(path.join(PANEL, "src/ui/screens/home-screen.js"), "utf8");
const SELFTEST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const IMAGINE_PANEL = fs.readFileSync(path.join(PANEL, "js/hnk_imagine.js"), "utf8");
const SUITES = fs.readFileSync(path.join(PANEL, "js/hnk_studio_suites.js"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");

const iShim = INDEX.indexOf('<script src="src/app/uxp-local-storage.js"></script>');
const iFirst = INDEX.indexOf("<script src=");
report("A1) the storage shim is the FIRST script the panel loads, ahead of the self-test hooks",
  iShim > 0 && iShim === iFirst && iShim < INDEX.indexOf('<script src="src/app/panel-selftest.js">'),
  { iShim, iFirst });

/* the shim in Node: absent storage, a fake UXP data folder, the file read once and merged UNDER
   what the session already wrote, write-behind, and the browser's own quota shape */
(function () {
  function fakeUxp(seedText) {
    const files = {}; if (seedText != null) files["hnk_local_storage.json"] = seedText;
    const log = { writes: 0 };
    const folder = {
      getEntry: (n) => (n in files) ? Promise.resolve({ read: () => Promise.resolve(files[n]) }) : Promise.reject(new Error("ENOENT")),
      createFile: (n) => Promise.resolve({ write: (t) => { files[n] = String(t); log.writes++; return Promise.resolve(); } })
    };
    return { uxp: { storage: { localFileSystem: { getDataFolder: () => Promise.resolve(folder) } } }, files, log };
  }
  function run(seedText, withNative, realHost) {
    const G = {}; G.globalThis = G; G.window = G;
    if (withNative) { const m = {}; G.localStorage = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, get length() { return Object.keys(m).length; } }; }
    const fx = fakeUxp(seedText);
    G.require = (n) => n === "uxp" ? fx.uxp : (n === "photoshop" ? { app: realHost ? { version: "26.0.0" } : {} } : {});
    vm.runInNewContext(SHIM, Object.assign(G, { setTimeout, clearTimeout, Promise, Error, Object, String, JSON, Math, parseFloat, isFinite }));
    return { G, fx };
  }
  const t1 = run('{"old":"kept","both":"file"}', false);
  const ls = t1.G.localStorage;
  ls.setItem("both", "memory"); ls.setItem("k", "v");
  const early = ls.getItem("old");
  return t1.G.HNK.localStore.ready.then(async () => {
    report("A2) shim installs when storage is absent, reads the file once and merges it UNDER the session's own writes",
      t1.G.HNK.localStore.shimmed === true && t1.G.HNK.localStore.installed === true && t1.G.HNK.localStore.backend === "file"
      && early === null && ls.getItem("old") === "kept" && ls.getItem("both") === "memory" && ls.getItem("k") === "v"
      && ls.length === 3 && ls.key(0) === "both" && ls.key(1) === "k" && ls.key(2) === "old",
      { early, old: ls.getItem("old"), both: ls.getItem("both"), len: ls.length, keys: [ls.key(0), ls.key(1), ls.key(2)], st: t1.G.HNK.localStore });
    await new Promise(r => setTimeout(r, 260));
    let parsed = null; try { parsed = JSON.parse(t1.fx.files["hnk_local_storage.json"]); } catch (e) { }
    ls.removeItem("k");
    await new Promise(r => setTimeout(r, 260));
    let after = null; try { after = JSON.parse(t1.fx.files["hnk_local_storage.json"]); } catch (e) { }
    report("A3) the file is written behind the session (once per burst) and removeItem reaches it",
      parsed && parsed.k === "v" && parsed.old === "kept" && parsed.both === "memory" && after && !("k" in after) && t1.fx.log.writes >= 2,
      { parsed, after, writes: t1.fx.log.writes });
    let quota = null; try { ls.setItem("big", "x".repeat(4000001)); } catch (e) { quota = e; }
    report("A4) a value past the cap is refused the way a browser refuses it (QuotaExceededError), and nothing is stored",
      quota && quota.name === "QuotaExceededError" && ls.getItem("big") === null, { name: quota && quota.name });
    const t2 = run(null, true);
    report("A5) a host whose own localStorage round-trips keeps it: the shim stays out (a browser, and the Chromium the tests drive)",
      t2.G.HNK.localStore.shimmed === false && t2.G.HNK.localStore.backend === "native" && typeof t2.G.localStorage.getItem === "function"
      && t2.G.localStorage.getItem("__hnk_ls_probe__") === null, t2.G.HNK.localStore);
    /* the real Photoshop host (its API carries a version string): the shim stands in even when native
       storage answers, because a storage wiped at relaunch answers the probe just the same */
    const t3 = run(null, true, true);
    report("A5b) in the real Photoshop host the shim takes over regardless, and remembers that native storage answered",
      t3.G.HNK.localStore.shimmed === true && t3.G.HNK.localStore.nativeOk === true && t3.G.HNK.localStore.backend === "file"
      && t3.G.localStorage === t3.G.HNK.localStore.storage, t3.G.HNK.localStore);
  });
})().then(() => main()).catch(e => { console.error(e); process.exit(1); });

function sourcePins() {
  report("A6) the What's New strip keeps the settings file under the shim (nothing a student dismissed comes back)",
    /shim && shim\.shimmed\) return null;/.test(HOME), {});
  report("A7) main.js waits for the shim's file with the settings, so lifted code never reads an empty store at boot",
    MAIN.indexOf("Promise.all([loadSettings(), lsReady()])") > 0 && MAIN.indexOf("function lsReady()") > 0, {});
  report("A8) the self-test records the pointer's offsetX/Y at the document (pointerdown + mousedown, capture) and reports it",
    SELFTEST.indexOf('document.addEventListener("pointerdown", offsetHook, true);') > 0
    && SELFTEST.indexOf('document.addEventListener("mousedown", offsetHook, true);') > 0
    && SELFTEST.indexOf("offset: lastOffset, offsetOf: lastOffsetEl") > 0, {});
  const rowLabels = ["Storage", "Pointer", "Viewport", "scrollTop"].filter(l => MAIN.indexOf('label: "' + l + '"') < 0);
  report("A9) SELF-TEST carries the Storage · Pointer · Viewport · scrollTop rows", rowLabels.length === 0, { missing: rowLabels });
  const spin = MAIN.slice(MAIN.indexOf("const ring = sp.querySelector(\".spin-ring\")"), MAIN.indexOf("function ffEaseInOut"));
  report("A10) the spinner runner moves by a percentage of its track, not a measured width (rect 0 in Photoshop stood it still)",
    spin.indexOf('+ "%";') > 0 && spin.indexOf("getBoundingClientRect") < 0, { spin: spin.slice(0, 300) });
  report("A11) VIDEO_OK asks canPlayType; the result box, the note and the numbered tiles branch on it",
    /const VIDEO_OK = \(function \(\) \{[\s\S]{0,300}canPlayType\("video\/mp4"\)/.test(MAIN)
    && MAIN.indexOf('if (VIDEO_OK) { vid.style.display = ""; vid.src = out.url; }') > 0
    && MAIN.indexOf('note.textContent = t("vid_no_inline").replace("{n}", String(vidHistSel + 1));') > 0
    && MAIN.indexOf('v.className = "hvt" + (i === vidHistSel ? " sel" : "");') > 0
    && MAIN.indexOf('if (isVideo && el.tagName === "VIDEO") { try { el.style.display = VIDEO_OK ? "" : "none"; }') > 0, {});
  report("A12) vid_no_inline speaks all nine panel languages", (MAIN.match(/^    vid_no_inline: "/gm) || []).length === 9,
    { n: (MAIN.match(/^    vid_no_inline: "/gm) || []).length });
  report("A13) the Path page's Effects and Prompt-preview headers are wired through wireStaticGrp",
    MAIN.indexOf('wireStaticGrp("ptGrpFx", "ptFxH");') > 0 && MAIN.indexOf('wireStaticGrp("ptGrpPrompt", "ptPromptH");') > 0, {});
  report("A14) the take tile and the note have UXP-safe rules (no gap, no object-fit, no pseudo-element)",
    /\.apg \.hist \.hvt \{/.test(CSS) && /\.apg \.vid-noinline \{/.test(CSS)
    && !/\.hvt[^{]*\{[^}]*(gap|object-fit)/.test(CSS) && !/\.hvt::/.test(CSS), {});
  const M0 = "/* ---- IMAGINE_MODULE ---- */", M1 = "/* ---- /IMAGINE_MODULE ---- */";
  const appMod = APP.slice(APP.indexOf(M0), APP.indexOf(M1));
  const pins = ["function imStageWidth(el){", "function imNorm(el, ev){", "function imDragX(el, ev, startPct, downX){",
    "var at=function(ev){ return imNorm(cv, ev); };",
    "var at=function(ev){ var v=imDragX(art, ev, drag ? drag.p : split, drag ? drag.x : 0); if(v===null) return; setHub(v); };",
    "var at=function(ev){ var v=imDragX(cmp, ev, drag ? drag.p : S.split, drag ? drag.x : 0); if(v===null) return; setSplit(Math.round(v)); };",
    "if(nw>0 && nh>0) cv.__imAspect=nw/nh;", "strokes:function(i){"];
  const missApp = pins.filter(p => appMod.indexOf(p) < 0), missPanel = pins.filter(p => IMAGINE_PANEL.indexOf(p) < 0);
  const oldAt = "var r=cv.getBoundingClientRect(); if(!r.width||!r.height) return null;";
  report("A15) the Imagine module (app block and the panel's lifted copy) maps pointers through imNorm / imDragX, never a bare rect",
    missApp.length === 0 && missPanel.length === 0 && appMod.indexOf(oldAt) < 0 && IMAGINE_PANEL.indexOf(oldAt) < 0
    && appMod.indexOf("var r=art.getBoundingClientRect()") < 0 && appMod.indexOf("var r=cmp.getBoundingClientRect()") < 0,
    { missApp, missPanel });
  const guard = 'if(!Array.isArray(a)) throw new Error("styles880 catalog is not a list");';
  report("A16) the Styles 880 loader refuses a catalog that is not a list, on both surfaces", APP.indexOf(guard) > 0 && SUITES.indexOf(guard) > 0, {});
  report("A17) CI runs this file", CI.indexOf("node test/verify_panel_dead_controls.js") > 0, {});
}

/* ============================ THE PANEL IN CHROMIUM ============================ */
const LS_HOST = `(function(){
  /* a host like Photoshop's: window.localStorage is not usable ... */
  Object.defineProperty(window, "localStorage", { configurable: true, get: function () { throw new Error("SecurityError: localStorage is not available"); } });
})();`;
/* ... and the plugin data folder answers for hnk_local_storage.json — routed to one in-memory file that
   the test can read, seed and count writes on; every other name still goes to the harness stub */
const LS_FOLDER = `(function(){
  var orig = window.require;
  window.__lsFile = { text: (window.__LS_SEED == null ? null : window.__LS_SEED), writes: 0 };
  window.require = function (n) {
    var m = orig(n); if (n !== "uxp") return m;
    var lfs = m.storage.localFileSystem, origGet = lfs.getDataFolder;
    var file = { read: function () { return Promise.resolve(window.__lsFile.text || ""); },
                 write: function (t) { window.__lsFile.text = String(t); window.__lsFile.writes++; return Promise.resolve(); } };
    var lfs2 = Object.assign({}, lfs, { getDataFolder: async function () {
      var f = await origGet();
      return { getEntry: function (name) { if (name === "hnk_local_storage.json") return window.__lsFile.text == null ? Promise.reject(new Error("ENOENT")) : Promise.resolve(file); return f.getEntry(name); },
               createFile: function (name, o) { if (name === "hnk_local_storage.json") return Promise.resolve(file); return f.createFile(name, o); },
               getEntries: function () { return f.getEntries(); } };
    } });
    return Object.assign({}, m, { storage: Object.assign({}, m.storage, { localFileSystem: lfs2 }) });
  };
})();`;
const NO_VIDEO = `(function(){ try { delete HTMLMediaElement.prototype.canPlayType; } catch (e) {} })();`;
/* Photoshop's renderer hands script no geometry: every rect, client, offset and scroll size reads 0.
   Chromium's own hit-test still fills ev.offsetX/Y, exactly as the fallback assumes of the host. */
const NO_GEOMETRY = `(function(){
  window.__realRect = Element.prototype.getBoundingClientRect;
  var zero = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: function () { return this; } };
  Element.prototype.getBoundingClientRect = function () { return zero; };
  Element.prototype.getClientRects = function () { return []; };
  ["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"].forEach(function (k) { Object.defineProperty(Element.prototype, k, { configurable: true, get: function () { return 0; } }); });
  ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop"].forEach(function (k) { Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: function () { return 0; } }); });
})();`;

async function main() {
  sourcePins();
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  async function boot(o) {
    o = o || {};
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 220)));
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    for (const s of (o.pre || [])) await page.addInitScript(s);
    await page.addInitScript(UXP_STUB);
    for (const s of (o.post || [])) await page.addInitScript(s);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(500);
    return { page, errs };
  }
  try {
    /* ---------------- B. the shim, end to end, in a host with no storage ---------------- */
    const B = await boot({ pre: [LS_HOST], post: [LS_FOLDER] });
    const b1 = await B.page.evaluate(() => {
      const st = window.HNK.localStore;
      let rt = null; try { localStorage.setItem("hnk_probe_k", "v"); rt = localStorage.getItem("hnk_probe_k"); } catch (e) { rt = "threw " + e; }
      return { shimmed: st.shimmed, installed: st.installed, backend: st.backend, rt, keys: st.keys() };
    });
    report("B1) in a host whose localStorage throws, the shim is installed over the data folder and round-trips a value",
      b1.shimmed === true && b1.installed === true && b1.backend === "file" && b1.rt === "v", b1);
    await B.page.evaluate(() => { try { switchPage("meitu"); } catch (e) { } });
    await B.page.waitForTimeout(600);
    const b2 = await B.page.evaluate(() => {
      const tg = document.getElementById("stWmTgl"), st = window.HNK.studio;
      if (!tg || !st) return { noToggle: !tg, noStudio: !st };
      const on = () => /\bon\b/.test(tg.className);
      /* the control case: with no logo the toggle refuses, exactly as before */
      tg.click();
      const refused = { on: on(), wmOn: st.wmOn(), logo: st.wmGetLogo() };
      /* the same thing H.pickLogo does after the file dialog: keep the logo in Web Storage */
      localStorage.setItem("hnk_wm_logo", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
      tg.click();
      return { refused, after: { on: on(), wmOn: st.wmOn(), logo: String(st.wmGetLogo() || "").slice(0, 14) } };
    });
    report("B2) Retouch A's watermark: with no logo \"Stamp logo\" refuses; a logo kept in the shim switches it on (it used to refuse \"Add a logo image first\" forever)",
      !b2.noToggle && !b2.noStudio && b2.refused.on === false && b2.refused.wmOn === false && b2.refused.logo === null
      && b2.after.on === true && b2.after.wmOn === true && b2.after.logo === "data:image/png", b2);
    await B.page.waitForTimeout(500);
    const b3 = await B.page.evaluate(() => { let p = null; try { p = JSON.parse(window.__lsFile.text); } catch (e) { } return { writes: window.__lsFile.writes, hasLogo: !!(p && typeof p.hnk_wm_logo === "string" && p.hnk_wm_logo.indexOf("data:image/png") === 0), hasProbe: !!(p && p.hnk_probe_k === "v"), n: p ? Object.keys(p).length : -1 }; });
    report("B3) the writes reach hnk_local_storage.json in the plugin's data folder", b3.writes >= 1 && b3.hasLogo && b3.hasProbe, b3);
    const b6 = await B.page.evaluate(() => { const rows = selfTestRows(); const f = (l) => rows.find(r => r.label === l); return { storage: f("Storage"), pointer: f("Pointer"), viewport: f("Viewport"), scroll: f("scrollTop") }; });
    report("B4) SELF-TEST names the shim on its Storage row (and that native storage answered no), and carries Pointer, Viewport and scrollTop rows",
      b6.storage && /settings-folder shim \(file\) \u00b7 \d+ keys \u00b7 native no/.test(b6.storage.detail) && b6.storage.level === "ok"
      && b6.pointer && b6.viewport && /^420×760 \(innerWidth\)$/.test(b6.viewport.detail) && b6.viewport.level === "ok" && b6.scroll, b6);
    const seed = await B.page.evaluate(() => window.__lsFile.text);
    await B.page.close();
    /* a relaunch: the file is there before the panel is, and the panel reads it back */
    const B2 = await boot({ pre: [LS_HOST, "window.__LS_SEED = " + JSON.stringify(seed) + ";"], post: [LS_FOLDER] });
    const b5 = await B2.page.evaluate(async () => { await window.HNK.localStore.ready; return { logo: String(localStorage.getItem("hnk_wm_logo") || "").slice(0, 14), probe: localStorage.getItem("hnk_probe_k"), keys: window.HNK.localStore.keys() }; });
    report("B5) after a relaunch the shim reads the file back: the logo and the probe key are still there",
      b5.logo === "data:image/png" && b5.probe === "v" && b5.keys >= 2, b5);
    report("B6) no page error in the storage-less host", B.errs.length === 0 && B2.errs.length === 0, { b: B.errs, b2: B2.errs });
    await B2.page.close();

    /* ---------------- C. the Imagine brush and the hub slider with no geometry ---------------- */
    async function strokeTest(page, label, zero) {
      if (zero) await page.evaluate(NO_GEOMETRY);
      const r = await page.evaluate(async () => {
        const IM = window.HNK.imagine;
        switchPage("imagine");
        IM.openTool("objremove");
        /* a 200×300 photo drawn here, so its natural size is known to the module */
        const c = document.createElement("canvas"); c.width = 200; c.height = 300;
        const x = c.getContext("2d"); x.fillStyle = "#3a5a7a"; x.fillRect(0, 0, 200, 300);
        IM.addPhotos([{ dataUrl: c.toDataURL("image/png"), name: "t.png" }]);
        IM.mark(true);
        await new Promise(res => setTimeout(res, 350));
        const cv = document.getElementById("imMarkCv");
        if (!cv) return { noCanvas: true };
        const real = window.__realRect ? window.__realRect.call(cv) : cv.getBoundingClientRect();
        const at = (fx, fy) => ({ bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: "mouse",
          clientX: real.left + real.width * fx, clientY: real.top + real.height * fy });
        cv.dispatchEvent(new PointerEvent("pointerdown", at(0.2, 0.3)));
        cv.dispatchEvent(new PointerEvent("pointermove", at(0.4, 0.3)));
        cv.dispatchEvent(new PointerEvent("pointermove", at(0.6, 0.3)));
        cv.dispatchEvent(new PointerEvent("pointerup", at(0.6, 0.3)));
        await new Promise(res => setTimeout(res, 60));
        const st = IM.strokes();
        const pix = (function () { try { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; } catch (e) { return -1; } })();
        return { buf: [cv.width, cv.height], real: [Math.round(real.width), Math.round(real.height)], strokes: st.length, pts: st.length ? st[0].pts : [], painted: pix };
      });
      const p = r.pts || [];
      const ok = !r.noCanvas && r.strokes === 1 && p.length >= 2
        && Math.abs(p[0][0] - 0.2) < 0.08 && Math.abs(p[0][1] - 0.3) < 0.08
        && Math.abs(p[p.length - 1][0] - 0.6) < 0.08 && Math.abs(p[p.length - 1][1] - 0.3) < 0.08
        && r.painted > 50 && r.buf[0] > 0 && r.buf[1] > 0;
      report(label, ok, r);
      return r;
    }
    const C0 = await boot();
    await strokeTest(C0.page, "C0) with a ruler (a browser) the brush maps a stroke through the rect, as before", false);
    await C0.page.close();
    const C = await boot();
    const c1 = await strokeTest(C.page, "C1) with NO geometry (rect · client · offset all 0) the brush still lands the stroke where the pointer went, off its own offsetX/Y", true);
    report("C2) and the brush canvas takes the photo's natural size when no ruler answers (200×300), so the strokes are drawn",
      c1.buf && c1.buf[0] === 200 && c1.buf[1] === 300, c1);
    const c3 = await C.page.evaluate(async () => {
      const IM = window.HNK.imagine; IM.goHub(); await new Promise(res => setTimeout(res, 300));
      const art = document.querySelector(".im-hubcmp"); if (!art) return { noArt: true };
      const card = art.closest(".im-card"); const id = (card && card.getAttribute("data-id")) || null;
      const real = window.__realRect.call(art);
      const ev = (dx) => ({ bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 2, isPrimary: true, pointerType: "mouse", clientX: real.left + real.width / 2 + dx, clientY: real.top + real.height / 2 });
      const before = Object.assign({}, IM.hubSplit());
      art.dispatchEvent(new PointerEvent("pointerdown", ev(0)));
      art.dispatchEvent(new PointerEvent("pointermove", ev(35)));
      art.dispatchEvent(new PointerEvent("pointermove", ev(70)));
      art.dispatchEvent(new PointerEvent("pointerup", ev(70)));
      await new Promise(res => setTimeout(res, 250));
      const after = IM.hubSplit();
      const keys = Object.keys(after);
      const k = keys.find(kk => after[kk] !== before[kk]) || keys[0] || null;
      return { key: k, before: k ? before[k] : null, after: k ? after[k] : null, width: Math.round(real.width), stillHub: !!document.querySelector(".im-hub"), toolOpen: !!document.getElementById("imMarkBar") };
    });
    const expected = c3.width ? 50 + 70 / c3.width * 100 : 0;
    report("C3) the hub card's Before|After slider drags by the pointer's travel when no rect answers (and a drag is not a tap)",
      !c3.noArt && typeof c3.after === "number" && Math.abs(c3.after - expected) < 8 && c3.stillHub && !c3.toolOpen, Object.assign({ expected: Math.round(expected) }, c3));
    report("C4) no page error under the no-geometry host", C.errs.length === 0 && C0.errs.length === 0, { c: C.errs, c0: C0.errs });
    await C.page.close();

    /* ---------------- D. the Video page without a player ---------------- */
    const D = await boot({ pre: [NO_VIDEO] });
    const d1 = await D.page.evaluate(() => {
      switchPage("video");
      vidHist.length = 0; vidHist.push({ url: "https://example.test/take1.mp4" }, { url: "https://example.test/take2.mp4" }); vidHistSel = 1;
      showVidResult();
      const vid = document.getElementById("vidResultVideo"), note = document.getElementById("vidNoInline");
      const tiles = Array.from(document.querySelectorAll("#vidHist .hvt")).map(e => ({ t: e.textContent, sel: /\bsel\b/.test(e.className) }));
      return { videoOk: VIDEO_OK, hidden: vid ? vid.style.display : "no video", hasSrc: vid ? !!vid.getAttribute("src") : null, note: note ? note.textContent : "", noteShown: note ? note.style.display : "none", tiles, videos: document.querySelectorAll("#vidHist video").length, box: document.getElementById("vidResultBox").className };
    });
    report("D1) with no player the result box hides the <video>, says clip 2 is ready (Download / Open) and draws numbered take tiles with the selection",
      d1.videoOk === false && d1.hidden === "none" && !d1.hasSrc && /2/.test(d1.note) && d1.note.length > 20 && d1.noteShown === ""
      && d1.tiles.length === 2 && d1.tiles[0].t === "MP4 1" && d1.tiles[1].t === "MP4 2" && d1.tiles[1].sel && !d1.tiles[0].sel && d1.videos === 0 && /\bon\b/.test(d1.box), d1);
    const d2 = await D.page.evaluate(() => { const tiles = document.querySelectorAll("#vidHist .hvt"); tiles[0].click(); return { sel0: /\bsel\b/.test(tiles[0].className), note: document.getElementById("vidNoInline").textContent }; });
    /* ffPressable answers on pointer events; a plain click may not select — accept either as long as the strip re-renders */
    const d2b = await D.page.evaluate(() => { const t = document.querySelectorAll("#vidHist .hvt")[0]; const o = { bubbles: true, cancelable: true, button: 0, pointerId: 3, isPrimary: true, clientX: 5, clientY: 5 }; t.dispatchEvent(new PointerEvent("pointerdown", o)); t.dispatchEvent(new PointerEvent("pointerup", o)); t.click(); return { sel0: /\bsel\b/.test(document.querySelectorAll("#vidHist .hvt")[0].className), note: document.getElementById("vidNoInline").textContent }; });
    report("D2) a take tile still selects its take, and the note follows (clip 1)", (d2.sel0 || d2b.sel0) && /1/.test(d2b.note), { d2, d2b });
    report("D3) no page error without a player", D.errs.length === 0, D.errs);
    await D.page.close();
    const D2 = await boot();
    const d4 = await D2.page.evaluate(() => { switchPage("video"); vidHist.length = 0; vidHist.push({ url: "https://example.test/take1.mp4" }); vidHistSel = 0; showVidResult(); const vid = document.getElementById("vidResultVideo"); const note = document.getElementById("vidNoInline"); return { videoOk: VIDEO_OK, shown: vid.style.display, src: vid.getAttribute("src"), videos: document.querySelectorAll("#vidHist video").length, tiles: document.querySelectorAll("#vidHist .hvt").length, note: note ? note.style.display : "absent" }; });
    report("D4) with a player (a browser) the <video> plays the clip and the strip is <video> tiles, as before",
      d4.videoOk === true && d4.shown === "" && d4.src === "https://example.test/take1.mp4" && d4.videos === 1 && d4.tiles === 0 && (d4.note === "absent" || d4.note === "none"), d4);

    /* ---------------- E. the Path page's two headers ---------------- */
    const e1 = await D2.page.evaluate(() => {
      switchPage("path");
      const out = {};
      [["ptFxH", "ptGrpFx"], ["ptPromptH", "ptGrpPrompt"]].forEach(([h, g]) => {
        const H = document.getElementById(h), G = document.getElementById(g);
        if (!H || !G) { out[h] = "missing"; return; }
        const c0 = /\bopen\b/.test(G.className); H.click(); const c1 = /\bopen\b/.test(G.className); H.click(); const c2 = /\bopen\b/.test(G.className);
        out[h] = { c0, c1, c2, aria: H.getAttribute("aria-expanded") };
      });
      return out;
    });
    report("E1) Path's Effects and Prompt-preview headers open and close their groups (they had no handler at all)",
      e1.ptFxH !== "missing" && e1.ptPromptH !== "missing" && e1.ptFxH.c0 === false && e1.ptFxH.c1 === true && e1.ptFxH.c2 === false
      && e1.ptPromptH.c0 === false && e1.ptPromptH.c1 === true && e1.ptPromptH.c2 === false, e1);

    /* ---------------- F. a Styles 880 catalog that is not a list ---------------- */
    const f1 = await D2.page.evaluate(async () => {
      switchPage("meitu");
      const st = window.HNK.studio; if (!st) return { threw: "no HNK.studio" };
      try { st.st880Load(); } catch (e) { return { threw: String(e) }; }
      await new Promise(res => setTimeout(res, 400));
      return { list: st.ST880.list, loading: st.ST880.loading };
    });
    report("F1) a catalog answer that is not a list ({} from the harness) is refused as a failed load — no stored object, nothing thrown on the next tap",
      !f1.threw && f1.list === null && f1.loading === false, f1);
    report("F2) no page error on the normal host (the crawl used to log \"ST880.list.filter is not a function\" nine times)",
      D2.errs.length === 0 && !D2.errs.some(e => /filter is not a function/.test(e)), D2.errs);
    await D2.page.close();
  } finally {
    await browser.close(); server.close();
  }
  console.log("\n" + (failures === 0 ? "PASS — every control the panel draws in Photoshop now does what it says" : "FAIL (" + failures + ")"));
  process.exit(failures ? 1 : 0);
}
