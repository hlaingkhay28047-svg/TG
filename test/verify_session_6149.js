/* 6.149.0 / panel 6.220.0 — THE CUSTOMER.
 *
 * A studio shoots one customer at a time: twenty to fifty frames, their results, then the next customer. Until now the
 * Gallery kept every result in one long roll and the doors knew nothing of whose shot it was. This wave gives both
 * surfaces the customer:
 *  · every result saved to the Gallery carries the customer's number (SESSION.id on the web; sessions.json in the
 *    panel's data folder beside its gallery folder), so the Gallery's kind list gains "This customer" and their shots
 *    and results stand in one place;
 *  · a customer bar above the Gallery — Customer #n · N photos, New customer, Share this customer's photos (the phone's
 *    share sheet with every result as a stamped file — the web alone), Save this customer's photos (a ZIP on the web,
 *    a folder in the panel);
 *  · the same line and New customer under every door — Retouch A / B, Retouch Pro, Path, Imagine — on both surfaces;
 *    a tap starts the next customer everywhere at once.
 *
 * A) the source on both surfaces and the lifts in sync   B) the web app: the doors' line, results carrying the number,
 * the Gallery's view and bar, New customer, Save all (the ZIP) and Share all (the files), the number kept across a
 * reload   C) the panel: the same words, the store's sessions.json, the bar, Save all, New customer   D) What's New
 * E) release pins
 * Usage: PORT=8931 node test/verify_session_6149.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");
const WN = require("./lib/whats-new.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PANEL_IM = read("panel/js/hnk_imagine.js");
const STORE = read("panel/src/app/gallery-store.js");
const PCSS = read("panel/styles.css");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.150.0", PVER = "6.221.0";
const WAVE_V = "6.149.0", PREV_V = "6.148.0";   /* on the WAVE_V line so the bump routine leaves both alone */
const COUNT = 292;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const LINE = (n, N) => "ဖောက်သည် #" + n + " · ပုံ " + N + " ပုံ";
const NEW = "ဖောက်သည် အသစ်", FILTER = "ဒီ ဖောက်သည်", SHARE = "ဒီ ဖောက်သည် အကုန် ရှယ်", SAVE = "ဒီ ဖောက်သည် အကုန် သိမ်း";

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 900)));
  if (!ok) failures++;
}
const slice = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? "" : s.slice(i, s.indexOf(b, i)); };

/* ---------------- A) the source ---------------- */
function partA() {
  const P = A.readPstyle(), I = A.readImagine();
  const galW = slice(APP, "var GAL_W={", "function galItemText(it){"), galL = slice(MAIN, "const GAL_L = {", "let SESSION_P");
  report("A1) the words: the customer's line, New customer and the started toast in nine languages in Portrait Style's table and, word for word, in Imagine's (the doors read either); the Gallery's seven words on the web and the panel's six (no Share there)",
    ["cust_line", "cust_new", "cust_started"].every((k) => all9(P.ui[k]) && all9(I.ui[k]) && LANGS.every((l) => P.ui[k][l] === I.ui[k][l])) &&
    P.ui.cust_line.my === "ဖောက်သည် #{n} · ပုံ {N} ပုံ" && P.ui.cust_new.my === NEW && has(P.ui.cust_started.my, "ဖောက်သည် #{n} စပြီ") &&
    ["kSess:", "sessLine:", "sessNew:", "sessStarted:", "sessShare:", "sessSave:", "sessNone:"].every((k) => has(galW, k)) && has(galW, JSON.stringify(FILTER)) && has(galW, JSON.stringify(SHARE)) && has(galW, JSON.stringify(SAVE)) &&
    ["kSess:", "sessLine:", "sessNew:", "sessStarted:", "sessSave:", "sessNone:"].every((k) => has(galL, k)) && !has(galL, "sessShare:") && has(galL, JSON.stringify(SAVE)),
    { galW: galW.length, galL: galL.length });
  report("A2) the web app: the customer (hnk_session_v1: id · n · started · c), sessionSave / sessionBump / sessionNew and HNK_SESSION; every Gallery record — image and video — carries session:SESSION.id and bumps the count; the index reads it back; the view knows the kind and the kind list offers it",
    has(APP, 'var SESSION=(function(){ var s=null; try{ s=JSON.parse(localStorage.getItem("hnk_session_v1")||"null"); }') && has(APP, "s={ id:Date.now(), n:1, started:Date.now(), c:0 };") &&
    has(APP, "function sessionSave(){") && has(APP, "function sessionBump(){ SESSION.c=(SESSION.c||0)+1; sessionSave();") && has(APP, "function sessionNew(){") && has(APP, "SESSION={ id:Date.now(), n:(SESSION.n||0)+1, started:Date.now(), c:0 };") &&
    has(APP, 'galView.kind="session";') && has(APP, 'toast(L9(GAL_W.sessStarted).replace("{n}", String(SESSION.n)),"ok");') &&
    has(APP, "window.HNK_SESSION={ get:function(){ return SESSION; }, next:sessionNew, count:galCountSession, bump:sessionBump };") &&
    has(APP, 'kind:"image", page:page, before:before||null, session:SESSION.id });') && has(APP, 'prov:"", wf:"", session:SESSION.id };') && (APP.match(/\n\s+sessionBump\(\);/g) || []).length === 2 &&
    has(APP, 'kind:v.kind||"image", page:v.page||"", session:v.session||0,') && has(APP, 'if(galView.kind==="session" && it.session!==SESSION.id) return false;') &&
    has(APP, '["keep",GAL_W.kKeep],["session",GAL_W.kSess]], galView.kind);'));
  report("A3) the Gallery's customer bar and its two actions: painted with the grid above the selection bar, the count put back to the store's truth, New customer, Share only where the browser can share files, Save through the one ZIP builder the selection uses too; Share stamps each plate and falls back to the ZIP",
    has(APP, "galSessionBar(all);   /* 6.149.0 */") && has(APP, "function galSessionBar(all){") && has(APP, 'bulk.parentNode.insertBefore(bar, bulk);') &&
    has(APP, "if(SESSION.c!==mine.length){ SESSION.c=mine.length; sessionSave();") && has(APP, 'nb.id="galNewCust";') && has(APP, "if(navigator.share){") && has(APP, 'sh.id="galShareSess";') && has(APP, 'sv.id="galSaveSess";') &&
    has(APP, 'sv.onclick=function(){ galZipItems(mine, "hnk-customer-"+SESSION.n); };') && has(APP, 'else if(galView.kind==="session"){') && has(APP, 'bar.appendChild(el("span","mut gal-sess-none", L9(GAL_W.sessNone)));') &&
    has(APP, "async function galZipItems(items, base){") && has(APP, '$("galZipSel").onclick=function(){') && has(APP, 'galZipItems(items, "hnk-gal");') &&
    has(APP, "async function galShareItems(items){") && has(APP, 'wmStampDataUrl("data:"+rec.mime+";base64,"+rec.b64, rec.mime, 92, res);') &&
    has(APP, "if(navigator.share && navigator.canShare && navigator.canShare({ files:files })){") && has(APP, 'return galZipItems(items, "hnk-customer-"+SESSION.n);'));
  report("A4) every door: the customer's line (the count read at once, no store round-trip) and New customer under the switch; camDoors(repaint) repaints them all; Imagine's row through its host (session / sessionNext on both hosts), lifted to the panel byte for byte",
    has(APP, 'var sl=el("span","mut cam-sess-t", L9(U.cust_line).replace("{n}", String(SESSION.n)).replace("{N}", String(SESSION.c||0))); sl.id="camSess_"+key;') &&
    has(APP, 'nc.id="camNewCust_"+key;') && has(APP, "function camDoors(repaint){") && has(APP, "if(repaint || !s.firstChild) camDoor(s);") &&
    has(APP, "if(H.session && D.ui.cust_line && D.ui.cust_new){") && has(PANEL_IM, "if(H.session && D.ui.cust_line && D.ui.cust_new){") &&
    has(APP, 'sl.id="imSess";') && has(PANEL_IM, 'sl.id="imSess";') && has(APP, 'nc.id="imNewCust"; nc.onclick=function(){ if(H.sessionNext) H.sessionNext(); render(); };') && has(PANEL_IM, 'nc.id="imNewCust"; nc.onclick=function(){ if(H.sessionNext) H.sessionNext(); render(); };') &&
    has(APP, "session: function(){ return window.HNK_SESSION ? HNK_SESSION.get() : null; },") && has(APP, "sessionNext: function(){ if(window.HNK_SESSION) HNK_SESSION.next(); },") &&
    has(MAIN, "session: function () { return SESSION_P; },") && has(MAIN, "sessionNext: function () { return sessionNewP(); },") &&
    has(APP, ".im-sess{display:flex;flex-direction:row;align-items:center;") && has(PCSS, ".im-sess{display:flex;flex-direction:row;align-items:center;") &&
    slice(APP, "/* ---- IMAGINE_CSS ---- */", "/* ---- /IMAGINE_CSS ---- */").indexOf(".im-sess{") > 0 && slice(PCSS, "/* ---- IMAGINE_CSS ---- */", "/* ---- /IMAGINE_CSS ---- */").indexOf(".im-sess{") > 0);
  report("A5) the panel: SESSION_P in the same hnk_session_v1, sessionSaveP / sessionBumpP / sessionNewP, HNK.session · sessionNext · sessionBump; the Gallery's session kind and option, the bar (Save through galSaveFiles, no share), the doors' line; the store's sessions.json in the data folder beside the gallery folder — written on every save (then the bump), read onto every entry, the gallery folder itself holding photographs alone",
    has(MAIN, 'let SESSION_P = (function () { let s = null; try { s = JSON.parse(localStorage.getItem("hnk_session_v1") || "null"); }') && has(MAIN, "function sessionSaveP() {") &&
    has(MAIN, "function sessionBumpP() { SESSION_P.c = (SESSION_P.c || 0) + 1; sessionSaveP();") && has(MAIN, "function sessionNewP() {") &&
    has(MAIN, "globalThis.HNK.session = function () { return SESSION_P; }; globalThis.HNK.sessionNext = function () { return sessionNewP(); }; globalThis.HNK.sessionBump = sessionBumpP;") &&
    has(MAIN, 'if (GAL.kind === "session" && (f.session || 0) !== SESSION_P.id) return false;') && has(MAIN, '["keep", GAL_L.kKeep], ["session", GAL_L.kSess]], GAL.kind);') &&
    has(MAIN, "galSessionBarP();   /* 6.220.0 */") && has(MAIN, "function galSessionBarP() {") && has(MAIN, 'nb.id = "galNewCust";') && has(MAIN, 'sv.id = "galSaveSess";') && has(MAIN, "await galSaveFiles(mine)") && !has(MAIN, "galShareSess") &&
    has(MAIN, 'sl.id = "camSess_" + key; sl.textContent = ff9(U.cust_line).replace("{n}", String(SESSION_P.n)).replace("{N}", String(SESSION_P.c || 0));') && has(MAIN, 'nc.id = "camNewCust_" + key;') &&
    has(STORE, 'var SESS_FILE = "sessions.json";') && has(STORE, "async function _sessDir() {") && has(STORE, "async function _sessRead(dir) {") && has(STORE, "async function _sessTag(dir, name) {") && has(STORE, "await _sessTag(dir, name);") &&
    has(STORE, "var root = await _sessDir();") && has(STORE, "var f = await root.createFile(SESS_FILE, { overwrite: true });") &&
    has(STORE, 'if (typeof globalThis.HNK.sessionBump === "function") globalThis.HNK.sessionBump();') &&
    has(STORE, "var idx = await _sessRead(await _sessDir());") && has(STORE, "files.forEach(function (f) { try { f.session = idx[f.name] || 0; } catch (e) { } });"));
  report("A6) the CSS on both surfaces (the door's row, the Gallery's bar, its empty line — no gap in the panel's), and the two parity walks: the number and the count are the device's on both sides; the web-only Share chip is named",
    has(APP, ".cam-sess{align-items:center;gap:8px;margin-top:4px}") && has(APP, ".gal-sess{align-items:center;gap:8px;margin:6px 0 8px 0}") && has(APP, ".gal-sess-none{") &&
    has(PCSS, ".cam-sess{display:flex;flex-direction:row;align-items:center;margin-top:4px}") && has(PCSS, ".gal-sess{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;margin:6px 0 8px 0}") && has(PCSS, ".gal-sess-none{") &&
    !/\.(cam|gal)-sess[^{]*\{[^}]*gap:/.test(PCSS) &&
    has(read("test/verify_panel_page_parity.js"), '[/(ဖောက်သည် #)\\d+( · ပုံ )\\d+( ပုံ)/g, "$1N$2N$3"],') && has(read("test/verify_panel_page_parity.js"), 'gallery: ["' + SHARE + '"],') &&
    has(read("test/verify_panel_studio_sync.js"), 'const desess = (s) => String(s).replace(/(ဖောက်သည် #)\\d+( · ပုံ )\\d+( ပုံ)/g, "$1N$2N$3");'));
}

/* ---------------- B) the web app ---------------- */
async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => {
    try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {}
    /* a phone that can share files: the bar draws Share all and hands it the files */
    window.__shared = [];
    try { navigator.canShare = function () { return true; }; navigator.share = async function (d) { window.__shared.push({ n: (d.files || []).length, names: (d.files || []).map((f) => f.name), types: (d.files || []).map((f) => f.type), title: d.title || "" }); }; } catch (e) {}
  });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; });

  /* B1 — a fresh device: customer #1 with nothing yet, on every door */
  const b1 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    const out = { s: HNK_SESSION.get(), saved: JSON.parse(localStorage.getItem("hnk_session_v1") || "null") };
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 700)); out.studio = [tx(q("#stPicker #camSess_studio")), tx(q("#stPicker #camNewCust_studio"))];
    switchPage("pgRetouch"); await new Promise((r) => setTimeout(r, 500)); out.retouch = [tx(q("#rsPicker #camSess_retouch")), tx(q("#rsPicker #camNewCust_retouch"))];
    switchPage("pgPath"); await new Promise((r) => setTimeout(r, 400)); out.path = [tx(q("#ptCamDoor #camSess_path")), tx(q("#ptCamDoor #camNewCust_path"))];
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 400)); IMAGINE.openTool("lighting"); await new Promise((r) => setTimeout(r, 300)); out.imagine = [tx(q("#imSess")), tx(q("#imNewCust"))];
    return out;
  });
  report("B1) a fresh device is on customer #1 with no photos (kept in hnk_session_v1), and every door — Retouch A, Retouch Pro, Path, Imagine — says so under its switch with New customer beside it",
    b1.s && b1.s.n === 1 && b1.s.c === 0 && typeof b1.s.id === "number" && b1.saved && b1.saved.n === 1 &&
    [b1.studio, b1.retouch, b1.path, b1.imagine].every((d) => d[0] === LINE(1, 0) && d[1] === NEW), b1);

  /* B2 — two results land: each carries the customer, the doors count them, the Gallery offers the customer's view and bar */
  const b2 = await page.evaluate(async (png) => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 500));
    await galleryAdd({ mime: "image/png", b64: png }, "studio local edit", { page: "pgMeitu" });
    await galleryAdd({ mime: "image/png", b64: png }, "Portrait Style · classic", { page: "pgPStyle" });
    await new Promise((r) => setTimeout(r, 300));
    const out = { c: HNK_SESSION.get().c, door: tx(q("#stPicker #camSess_studio")) };
    out.recs = await galDb().then((d) => new Promise((res) => { const rows = []; const rq = d.transaction("gal").objectStore("gal").openCursor(); rq.onsuccess = (ev) => { const c = ev.target.result; if (!c) { res(rows); return; } rows.push(c.value.session); c.continue(); }; rq.onerror = () => res(rows); }));
    out.same = out.recs.length === 2 && out.recs.every((s) => s === HNK_SESSION.get().id);
    switchPage("pgGallery"); await new Promise((r) => setTimeout(r, 900));
    const opt = q('#galKind option[value="session"]'); out.opt = opt && opt.textContent;
    out.bar = { txt: tx(q("#galSessTxt")), newc: tx(q("#galNewCust")), share: tx(q("#galShareSess")), save: tx(q("#galSaveSess")), above: q("#galSessBar") && q("#galSessBar").nextElementSibling && q("#galSessBar").nextElementSibling.id, none: !!q("#galSessBar .gal-sess-none") };
    galView.kind = "session"; renderGallery(); await new Promise((r) => setTimeout(r, 700)); out.shownSess = (window._galShown || []).length; out.all = (window._galItems || []).length;
    return out;
  }, PNG_B64);
  report("B2) two results saved to the Gallery carry customer #1's number; the door's line counts two at once; the Gallery's kind list offers This customer, and the bar above the selection bar reads the line with New customer, Share all (this browser shares files) and Save all; the customer's view shows both",
    b2.c === 2 && b2.door === LINE(1, 2) && b2.same && b2.opt === FILTER && b2.bar.txt === LINE(1, 2) && b2.bar.newc === NEW && b2.bar.share === SHARE && b2.bar.save === SAVE && b2.bar.above === "galBulkBar" && !b2.bar.none &&
    b2.shownSess === 2 && b2.all === 2, b2);

  /* B3 — New customer from the Gallery: #2, nothing yet, the toast, the empty line; the first customer's results stay in All; the doors follow */
  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    window.__toasts = []; const realToast = toast; window.toast = function (m, k) { window.__toasts.push([m, k]); return realToast.apply(this, arguments); };
    const id1 = HNK_SESSION.get().id;
    q("#galNewCust").click(); await new Promise((r) => setTimeout(r, 900));
    const s = HNK_SESSION.get();
    const out = { n: s.n, c: s.c, newId: s.id !== id1, kind: galView.kind, sel: q("#galKind").value, toast: (window.__toasts[0] || [])[0], shown: (window._galShown || []).length, txt: tx(q("#galSessTxt")), none: tx(q("#galSessBar .gal-sess-none")), save: !!q("#galSaveSess"), share: !!q("#galShareSess") };
    galView.kind = "all"; renderGallery(); await new Promise((r) => setTimeout(r, 700)); out.allShown = (window._galShown || []).length;
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 500)); out.door = tx(q("#stPicker #camSess_studio"));
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 400)); IMAGINE.openTool("lighting"); await new Promise((r) => setTimeout(r, 300)); out.imDoor = tx(q("#imSess"));
    return out;
  });
  report("B3) New customer in the Gallery: customer #2 with a new number and no photos, the view switches to This customer (empty, with its line), the toast says #2 started, no Save / Share yet; All still holds the first customer's two; the Studio's and Imagine's doors say #2",
    b3.n === 2 && b3.c === 0 && b3.newId && b3.kind === "session" && b3.sel === "session" && has(String(b3.toast), "ဖောက်သည် #2 စပြီ") && b3.shown === 0 && b3.txt === LINE(2, 0) && b3.none.length > 20 && !b3.save && !b3.share &&
    b3.allShown === 2 && b3.door === LINE(2, 0) && b3.imDoor === LINE(2, 0), b3);

  /* B4 — customer #2's one result: Save all is a ZIP named for the customer; Share all hands the phone the stamped files */
  const b4 = await page.evaluate(async (png) => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    await galleryAdd({ mime: "image/png", b64: png }, "v2 retouch hd finish", { page: "pgRetouch" });
    switchPage("pgGallery"); galView.kind = "session"; renderGallery(); await new Promise((r) => setTimeout(r, 900));
    const out = { txt: tx(q("#galSessTxt")), shown: (window._galShown || []).length };
    window.__saved = []; window.ptSaveBlob = function (b, name) { window.__saved.push([name, b && b.size]); };
    q("#galSaveSess").click(); let t0 = Date.now(); while (Date.now() - t0 < 6000 && !window.__saved.length) await new Promise((r) => setTimeout(r, 60));
    out.saved = window.__saved[0];
    q("#galShareSess").click(); t0 = Date.now(); while (Date.now() - t0 < 8000 && !window.__shared.length) await new Promise((r) => setTimeout(r, 60));
    out.shared = window.__shared[0];
    return out;
  }, PNG_B64);
  report("B4) customer #2's result: the bar counts one and the view shows it; Save all hands the browser a ZIP named hnk-customer-2-…; Share all hands the phone's share sheet one stamped PNG named hnk-customer-2-1.png under the customer's line",
    b4.txt === LINE(2, 1) && b4.shown === 1 && !!b4.saved && /^hnk-customer-2-\d{8}\.zip$/.test(b4.saved[0]) && b4.saved[1] > 100 &&
    !!b4.shared && b4.shared.n === 1 && b4.shared.names[0] === "hnk-customer-2-1.png" && b4.shared.types[0] === "image/png" && b4.shared.title === "HNK · " + LINE(2, 1), b4);

  /* B5 — the customer survives a reload */
  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
  const b5 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    try { document.body.classList.remove("wall"); } catch (e) {}
    const s = HNK_SESSION.get(); switchPage("pgPath"); await new Promise((r) => setTimeout(r, 500));
    return { n: s.n, c: s.c, door: tx(q("#ptCamDoor #camSess_path")) };
  });
  report("B5) after a reload the device is still on customer #2 with their one photo, and Path's door says so", b5.n === 2 && b5.c === 1 && b5.door === LINE(2, 1), b5);
  report("B6) no page error on the way", errs.length === 0, errs);
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
    await pp.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
    await pp.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await pp.waitForTimeout(2500);
    const c1 = await pp.evaluate(async () => {
      const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
      const out = { s: globalThis.HNK.session() };
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 700)); out.studio = [tx(q("#stPicker #camSess_studio")), tx(q("#stPicker #camNewCust_studio"))];
      switchPage("retouch"); await new Promise((r) => setTimeout(r, 600)); out.retouch = [tx(q("#rsPicker #camSess_retouch")), tx(q("#rsPicker #camNewCust_retouch"))];
      switchPage("path"); await new Promise((r) => setTimeout(r, 500)); out.path = [tx(q("#ptCamDoor #camSess_path")), tx(q("#ptCamDoor #camNewCust_path"))];
      switchPage("imagine"); await new Promise((r) => setTimeout(r, 400)); globalThis.HNK.imagine.openTool("lighting"); await new Promise((r) => setTimeout(r, 300)); out.imagine = [tx(q("#imSess")), tx(q("#imNewCust"))];
      return out;
    });
    report("C1) the panel: customer #1 with no photos, the same line and New customer under Retouch A / Retouch Pro / Path's doors and in Imagine's row",
      c1.s && c1.s.n === 1 && c1.s.c === 0 && [c1.studio, c1.retouch, c1.path, c1.imagine].every((d) => d[0] === LINE(1, 0) && d[1] === NEW), c1);

    /* C2 — the store: a saved result is named in sessions.json beside the files, list() carries it, the door counts it */
    const c2 = await pp.evaluate(async (png) => {
      const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 500));
      const gs = globalThis.HNK.galleryStore; const name = await gs.save(png, "png", "pstyle"); await new Promise((r) => setTimeout(r, 200));
      const list = await gs.list(); const mine = list.filter((f) => f.name === name);
      const idxF = await window.__fx.root.getEntry("sessions.json"); const idx = JSON.parse(await idxF.read({ format: "utf8" }));
      const folder = await (await window.__fx.root.getEntry("gallery")).getEntries(); const inFolder = folder.map((e) => e.name);
      return { name, listed: list.map((f) => f.name), inFolder, sess: mine[0] && mine[0].session, id: globalThis.HNK.session().id, c: globalThis.HNK.session().c, idx, door: tx(q("#stPicker #camSess_studio")) };
    }, PNG_B64);
    report("C2) the store names the saved file's customer in the data folder's sessions.json — the gallery folder holds the photograph alone — list() carries it as .session; the count is one and the Studio's door says so at once",
      /^pstyle-\d+\.png$/.test(String(c2.name)) && c2.listed.length === 1 && c2.listed[0] === c2.name && c2.inFolder.length === 1 && c2.inFolder[0] === c2.name && c2.sess === c2.id && c2.c === 1 && c2.idx && c2.idx[c2.name] === c2.id && c2.door === LINE(1, 1), c2);

    /* C3 — the Gallery: the bar, Save all to a folder, New customer */
    const c3 = await pp.evaluate(async () => {
      const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
      switchPage("gallery"); await new Promise((r) => setTimeout(r, 900));
      const opt = q('#galKind option[value="session"]');
      const out = { opt: opt && opt.textContent, txt: tx(q("#galSessTxt")), newc: tx(q("#galNewCust")), save: tx(q("#galSaveSess")), share: !!q("#galShareSess"), above: q("#galSessBar") && q("#galSessBar").nextElementSibling && q("#galSessBar").nextElementSibling.id };
      window.__psaved = [];
      require("uxp").storage.localFileSystem.getFolder = async () => ({ name: "Customer 1", createFile: async (n) => ({ write: async () => { window.__psaved.push(n); } }) });
      q("#galSaveSess").click(); let t0 = Date.now(); while (Date.now() - t0 < 6000 && !window.__psaved.length) await new Promise((r) => setTimeout(r, 60));
      await new Promise((r) => setTimeout(r, 200)); out.saved = window.__psaved.slice(); out.status = tx(q("#status")) || tx(q("#statusLine")) || tx(q(".status"));
      const id1 = globalThis.HNK.session().id;
      q("#galNewCust").click(); await new Promise((r) => setTimeout(r, 900));
      const s = globalThis.HNK.session();
      out.n = s.n; out.c = s.c; out.newId = s.id !== id1; out.kind = GAL.kind; out.kindVal = tx(q("#galKindVal")); out.txt2 = tx(q("#galSessTxt")); out.none = tx(q("#galSessBar .gal-sess-none")); out.save2 = !!q("#galSaveSess"); out.shown = document.querySelectorAll("#galGrid .gal-it, #galGrid .gal-card, #galGrid > *").length;
      GAL.kind = "all"; renderGal(); await new Promise((r) => setTimeout(r, 500)); out.allShown = GAL.files.length;
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 500)); out.door = tx(q("#stPicker #camSess_studio"));
      return out;
    });
    report("C3) the panel's Gallery: This customer in the kind list, the bar above the selection bar with the line, New customer and Save all (no Share in Photoshop); Save all writes the customer's one file into the chosen folder; New customer → #2, no photos, the view on This customer (empty, with its line), the door says #2; All still holds the file",
      c3.opt === FILTER && c3.txt === LINE(1, 1) && c3.newc === NEW && c3.save === SAVE && !c3.share && c3.above === "galBulkBar" &&
      c3.saved.length === 1 && /^pstyle-\d+\.png$/.test(c3.saved[0]) &&
      c3.n === 2 && c3.c === 0 && c3.newId && c3.kind === "session" && c3.kindVal === FILTER && c3.txt2 === LINE(2, 0) && c3.none.length > 20 && !c3.save2 && c3.allShown === 1 && c3.door === LINE(2, 0), c3);
    report("C4) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgGallery");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages, the panel says the same, and the " + PREV_V + " row is still there",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgGallery") === WN.panelRow(WAVE_V, "pgGallery") && WN.appRow(WAVE_V, "pgGallery").length > 200 && !!WN.find(WN.appRows(), PREV_V, "pgMeitu"),
    { row: !!row, same: !!row && WN.appRow(WAVE_V, "pgGallery") === WN.panelRow(WAVE_V, "pgGallery"), len: row ? WN.appRow(WAVE_V, "pgGallery").length : 0 });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the auto-run doors check it follows",
    steps === COUNT && has(CI, "node test/verify_session_6149.js") && CI.indexOf("verify_session_6149.js") > CI.indexOf("verify_auto_doors_6148.js"), { steps });
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
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
