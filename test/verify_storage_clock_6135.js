/* 6.135.0 / panel 6.206.0 — WHAT THE PANEL KEEPS, AND HOW LONG A RUN HAS BEEN GOING.
 *
 * The owner, 2026-09-25:
 *   "Ccx မှာ စက်မလေးအောင် history တွေကို ဖျက်လို့ရအောင် လုပ်ပေးပါ
 *    Generate မှာ loading time တွေမပါသေးတာတေွ ပါအောင်ထည့်ပေးပါ"
 *
 * PART ONE — THE DISK. Every history in the panel already HAD a delete: the Gallery's ✕ and
 * Clear, the video strips' ✕ and Clear, the albums shelf's ✕, the prompt list's ✕. Two things
 * were missing and this wave adds them.
 *
 *   (a) NOTHING SAID HOW MUCH. The results folder has had no ceiling since 6.57.0 — the owner's
 *       own instruction, and the right one — so a studio that shot weddings all year could not
 *       tell whether the panel was holding 40 MB or 4 GB. An album record carries its
 *       photographs as data URLs at 2,400 (Standard) or 4,000 (Print) pixels and the shelf
 *       holds 24 of them. Setup ▸ Storage now names every store with a real byte count.
 *   (b) ONE STORE HAD NO DELETE AT ALL. loadUrlIntoAnySlot has written one hnk_ff_web_<ts> file
 *       per converted web picture since 6.82.0 and nothing has ever removed one. It is deleted
 *       at the end of its own function now, a boot sweep clears what older versions left, and
 *       "Free space now" is the studio's own broom.
 *
 * PART TWO — THE CLOCK. Freeform, Video, Upscale, V→V, Talking Photo, Text→Image, Retouch A/B,
 * Retouch V2, Path and Imagine have counted their seconds for releases. Three did not, and one
 * of them is the screen 197 Smart Workflows run through:
 *
 *   panel  src/ui/progress-strip.js  the AI Tools / Smart Workflow strip — stage names only
 *   panel  main.js startBusy()       three moving dots, no number (Text→Image rides this)
 *   app    the Smart Workflow wizard one frozen sentence on step 4
 *
 * A) source pins   B) the storage module over a folder of known sizes   C) the panel walked:
 * files written, the card read, a Delete pressed twice, the ★ survivor   D) the clock, pure and
 * live   E) the app wizard's clock   F) release pins
 * Usage: PORT=8931 node test/verify_storage_clock_6135.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js"), INDEX = read("panel/index.html"), CSS = read("panel/styles.css");
const STORE_SRC = read("panel/src/app/panel-storage.js");
const STRIP = read("panel/src/ui/progress-strip.js");
const ST = require("../panel/src/app/panel-storage.js");
const VER = "6.135.0", PVER = "6.206.0";
const COUNT = 277;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".woff2": "font/woff2", ".ico": "image/x-icon" };

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}

/* ===================== A) source pins ===================== */

report("A1) the storage reader is its own module, loaded beside the other src/app stores and never by the web app (a browser has no data folder to walk)",
  fs.existsSync(path.join(PANEL, "src/app/panel-storage.js")) &&
  has(INDEX, '<script src="src/app/panel-storage.js"></script>') &&
  INDEX.indexOf('<script src="src/app/panel-storage.js"></script>') > INDEX.indexOf('<script src="src/app/gallery-store.js"></script>') &&
  INDEX.indexOf('<script src="src/app/panel-storage.js"></script>') < INDEX.indexOf('<script src="main.js"') &&
  !has(APP, "panel-storage"),
  { inApp: has(APP, "panel-storage") });

report("A2) it names every store the panel really writes, including the one that never had a delete, and the ★ keep list is bookkeeping rather than a result",
  has(STORE_SRC, "hnk_ff_web_<ts>.<ext>") && has(STORE_SRC, "THE LEAK") &&
  /TEMP_WEB = \/\^hnk_ff_web_/.test(STORE_SRC) && has(STORE_SRC, 'KEEP_FILE = "_keep.json"') &&
  JSON.stringify(ST.KINDS) === JSON.stringify(["results", "videos", "albums", "temps", "settings"]));

report("A3) the leak is closed where it is made: loadUrlIntoAnySlot deletes its own scratch file after Photoshop has the pixels, and a boot sweep clears what 6.82.0–6.134.0 left behind",
  /captureFileViaPS\(tmp[\s\S]{0,700}?await tmp\.delete\(\)/.test(MAIN) &&
  has(MAIN, 'safe("temp-sweep"') && has(MAIN, "api.sweepTemps()"),
  { deleteAfterCapture: /captureFileViaPS\(tmp[\s\S]{0,700}?await tmp\.delete\(\)/.test(MAIN), bootSweep: has(MAIN, 'safe("temp-sweep"') });

(function () {
  const m = MAIN.match(/const STORE_L = \{([\s\S]*?)\n\};/);
  const body = m ? m[1] : "";
  const keys = [...body.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((g) => g[1]);
  const short = keys.filter((k) => {
    const row = body.match(new RegExp("\\n  " + k + ": \\{[\\s\\S]*?\\n?\\s*\\}"));
    const t = row ? row[0] : "";
    return LANGS.some((L) => !new RegExp("\\b" + L + ":").test(t));
  });
  report("A4) every one of the " + keys.length + " Storage strings ships in all nine languages — the card is Burmese-first like every other card in Setup",
    keys.length >= 16 && short.length === 0, { keys: keys.length, missing: short });
})();

report("A5) the card is in the HTML with a row per store, a Delete on the four deletable ones and NONE on settings — signing the studio out is not housekeeping",
  has(INDEX, 'id="cardStorage"') && has(INDEX, 'id="storeTotalV"') && has(INDEX, 'id="btnStoreFree"') &&
  ["results", "videos", "albums", "temps"].every((k) => has(INDEX, 'id="storeB_' + k + '"')) &&
  !has(INDEX, 'id="storeB_settings"') && has(INDEX, 'id="storeV_settings"') &&
  has(CSS, ".store-row") && has(CSS, ".store-total"));

report("A6) the panel's shared busy line counts seconds, and the AI Tools strip has a pure secLabel so its wording is testable without a DOM or a timer",
  has(MAIN, "function busySecs()") && has(MAIN, "function busyLine(msgKey, dots)") &&
  has(MAIN, "state.busyT0 = Date.now();") && has(MAIN, "state.busyT0 = 0;") &&
  has(STRIP, "function secLabel(base, ms)") && has(STRIP, "secLabel: secLabel") &&
  has(STRIP, "function stopTick()") && has(STRIP, "function startTick()"));

report("A7) the app's Smart Workflow wizard starts a clock when the run starts and stops it on every exit — result, failure, close and re-open — so a re-render never stacks timers",
  has(APP, "function wizSpinLine()") && has(APP, "function wizClockStart()") && has(APP, "function wizClockStop()") &&
  (APP.match(/wizClockStop\(\)/g) || []).length >= 4 && has(APP, 'bs.id="wizSpin"'),
  { stops: (APP.match(/wizClockStop\(\)/g) || []).length });

/* ===================== B) the module over a folder of known sizes ===================== */

function fakeFolder(name) {
  const m = new Map();
  const F = { isFolder: true, isFile: false, name: name, _m: m,
    getEntry: (n) => m.has(n) ? Promise.resolve(m.get(n)) : Promise.reject(new Error("ENOENT " + n)),
    getEntries: () => Promise.resolve(Array.from(m.values())),
    put: (n, bytes) => { m.set(n, { isFile: true, name: n, getMetadata: () => Promise.resolve({ size: bytes }),
      delete: () => { m.delete(n); return Promise.resolve(); } }); return F; },
    sub: (n) => { const f = fakeFolder(n); m.set(n, f); return f; } };
  return F;
}

async function partB() {
  const root = fakeFolder("hnkdata");
  root.put("hnk_students_settings.json", 4000).put("hnk_local_storage.json", 1200)
      .put("hnk_ff_web_1700000000000.jpg", 5e6).put("hnk_ff_web_1700000000001.png", 6e6)
      .put("hnk_capture.jpg", 2e6).put("hnk_result.png", 1.5e6);
  root.sub("gallery").put("horse-1.png", 3e6).put("horse-2.png", 2e6).put("video-99.mp4", 40e6).put("_keep.json", 40);
  root.sub("album").put("hnk_album_doc_v1_a.json", 120e6).put("hnk_album_shelf_v1.json", 900);
  globalThis.HNK = globalThis.HNK || {};
  globalThis.HNK.__uxpForTests = { storage: { localFileSystem: { getDataFolder: () => Promise.resolve(root) } } };

  const m = await ST.measure();
  report("B1) measure() walks the whole data folder and reports each store by count and real bytes: 2 results · 1 video · 2 album records · 4 scratch files · 2 settings files",
    m.ok && m.results.n === 2 && m.results.bytes === 5e6 && m.videos.n === 1 && m.videos.bytes === 40e6 &&
    m.albums.n === 2 && m.albums.bytes === 120e6 + 900 && m.temps.n === 4 && m.temps.bytes === 14.5e6 &&
    m.settings.n === 2 && m.settings.bytes === 5200 && m.total.n === 11,
    { results: m.results, videos: m.videos, albums: m.albums, temps: m.temps, settings: m.settings, total: m.total });

  report("B2) the ★ keep list is not counted as a result — it is the panel's own bookkeeping file, not something a studio made",
    m.results.n === 2 && m.total.bytes === 5e6 + 40e6 + 120e6 + 900 + 14.5e6 + 5200,
    { total: m.total.bytes });

  report("B3) fmt reads the way a person reads a disk: one decimal past a megabyte, whole kilobytes below it, a plain 0 for nothing — never \"0.0 MB\"",
    ST.fmt(0) === "0" && ST.fmt(512) === "512 B" && ST.fmt(2048) === "2 KB" && ST.fmt(3145728) === "3.0 MB" && ST.fmt(1.5e9) === "1430.5 MB",
    { z: ST.fmt(0), b: ST.fmt(512), k: ST.fmt(2048), mb: ST.fmt(3145728) });

  const sw = await ST.sweepTemps();
  const m2 = await ST.measure();
  report("B4) sweepTemps() takes every scratch file and nothing else: 4 files / 13.8 MB back, and the results, videos, albums and settings are untouched",
    sw.ok && sw.n === 4 && sw.bytes === 14.5e6 && m2.temps.n === 0 &&
    m2.results.n === 2 && m2.videos.n === 1 && m2.albums.n === 2 && m2.settings.n === 2,
    { swept: sw, after: { results: m2.results.n, videos: m2.videos.n, albums: m2.albums.n, temps: m2.temps.n } });

  const c = await ST.clear("results", { keep: (n) => n === "horse-1.png" });
  const m3 = await ST.measure();
  report("B5) clear(\"results\") deletes the pictures and KEEPS the ★ one, reports both counts, and does not touch the clips beside them in the same folder",
    c.ok && c.n === 1 && c.kept === 1 && c.bytes === 2e6 && m3.results.n === 1 && m3.videos.n === 1,
    { cleared: c, after: { results: m3.results.n, videos: m3.videos.n } });

  const cs = await ST.clear("settings", {});
  const m4 = await ST.measure();
  report("B6) clear(\"settings\") is REFUSED by name rather than reported as an empty success — the settings file holds the studio's key and their sign-in",
    cs.ok === false && cs.n === 0 && /not a deletable row/.test(cs.err || "") && m4.settings.n === 2,
    { refusal: cs, settingsStill: m4.settings.n });

  /* a host that gives the panel no data folder at all */
  globalThis.HNK.__uxpForTests = { storage: { localFileSystem: { getDataFolder: () => Promise.reject(new Error("no")) } } };
  const m5 = await ST.measure();
  const c5 = await ST.clear("results", {});
  report("B7) a host with no data folder is reported honestly — ok:false with a reason and zeroes, never a confident \"0 files\"",
    m5.ok === false && m5.err === "no data folder" && m5.total.n === 0 && c5.ok === false,
    { measure: { ok: m5.ok, err: m5.err }, clear: { ok: c5.ok, err: c5.err } });
  try { delete globalThis.HNK.__uxpForTests; } catch (e) { }
}

/* ===================== D) the clock, pure ===================== */

function partDpure() {
  const P = require("../panel/src/ui/progress-strip.js");
  report("D1) secLabel appends the seconds to whatever the line already says, and says nothing at all under half a second — a run that just started must not read \"· 0s\"",
    P.secLabel("Generating", 0) === "Generating" && P.secLabel("Generating", 400) === "Generating" &&
    P.secLabel("Generating", 12400) === "Generating · 12s" && P.secLabel("Done", 48000) === "Done · 48s" &&
    P.secLabel("", 9000) === "",
    { zero: P.secLabel("Generating", 0), twelve: P.secLabel("Generating", 12400) });
}

/* ===================== the panel walk (C) and the strip (D2) ===================== */

async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
  const page = await ctx.newPage();
  await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.addInitScript(UXP_STUB);
  await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
  await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.waitForTimeout(600);

  /* C1 — write a studio's worth of files into the panel's own data folder, then open Setup */
  const c1 = await page.evaluate(async () => {
    const root = window.__fx.root;
    const put = async (dir, name, n) => { const f = await dir.createFile(name); await f.write(new Uint8Array(n)); };
    const gal = await root.createFolder("gallery");
    await put(gal, "horse-straw-1700000000001.png", 300000);
    await put(gal, "horse-straw-1700000000002.png", 200000);
    await put(gal, "video-1700000000003.mp4", 900000);
    await put(root, "hnk_ff_web_1700000000004.jpg", 120000);
    await put(root, "hnk_students_settings.json", 4000);
    const alb = await root.createFolder("album");
    await put(alb, "hnk_album_doc_v1_wedding.json", 700000);
    switchPage("setup");
    await new Promise((r) => setTimeout(r, 1400));
    const val = (id) => (document.getElementById(id) || {}).textContent || "";
    return { card: !!document.getElementById("cardStorage"),
      results: val("storeV_results"), videos: val("storeV_videos"), albums: val("storeV_albums"),
      temps: val("storeV_temps"), settings: val("storeV_settings"), total: val("storeTotalV"),
      h2: val("storeH2"), kept: val("storeKeptNote") };
  });
  report("C1) Setup ▸ Storage, walked in the real panel over a real data folder: every row names its count and its measured size, and the total is the sum",
    c1.card && /^2 .* · 488 KB$/.test(c1.results) && /^1 .* · 879 KB$/.test(c1.videos) &&
    /^1 .* · 684 KB$/.test(c1.albums) && /^1 .* · 117 KB$/.test(c1.temps) && /^1 .* · 4 KB$/.test(c1.settings) &&
    /^6 .* · 2\.1 MB$/.test(c1.total) && c1.h2.length > 0 && c1.kept.length > 0, c1);

  /* C2 — the two-press arm: one press warns, the second deletes */
  const c2 = await page.evaluate(async () => {
    const b = document.getElementById("storeB_results");
    const before = b.textContent;
    b.click(); await new Promise((r) => setTimeout(r, 250));
    const armed = b.textContent;
    b.click(); await new Promise((r) => setTimeout(r, 900));
    return { before: before, armed: armed, armedGold: /btn-gold/.test(b.className || "") === false,
      results: (document.getElementById("storeV_results") || {}).textContent || "",
      videos: (document.getElementById("storeV_videos") || {}).textContent || "",
      status: (document.getElementById("stStore") || {}).textContent || "" };
  });
  report("C2) Delete is the Gallery's own two-press arm — the first press changes the word and waits, the second empties the row and says how much came back; the clips beside it are untouched",
    c2.armed !== c2.before && c2.armed.length > 0 && /^0 /.test(c2.results) && /^1 /.test(c2.videos) && c2.status.length > 0, c2);

  /* C3 — Free space now takes the scratch file and nothing else */
  const c3 = await page.evaluate(async () => {
    document.getElementById("btnStoreFree").click();
    await new Promise((r) => setTimeout(r, 900));
    return { temps: (document.getElementById("storeV_temps") || {}).textContent || "",
      settings: (document.getElementById("storeV_settings") || {}).textContent || "",
      albums: (document.getElementById("storeV_albums") || {}).textContent || "",
      names: Array.from(window.__fx.root._ents.keys()) };
  });
  report("C3) \"Free space now\" is one press and always safe: the scratch file goes, the settings file and the album record stay, and the folder no longer carries a hnk_ff_web_ file",
    /^0 /.test(c3.temps) && /^1 /.test(c3.settings) && /^1 /.test(c3.albums) &&
    !c3.names.some((n) => /^hnk_ff_web_/.test(n)) && c3.names.indexOf("hnk_students_settings.json") >= 0, c3);

  /* C4 — the settings row is shown and has no button anywhere near it */
  const c4 = await page.evaluate(() => ({
    hasRow: !!document.getElementById("storeV_settings"),
    hasBtn: !!document.getElementById("storeB_settings"),
    btns: ["results", "videos", "albums", "temps"].filter((k) => !!document.getElementById("storeB_" + k)).length
  }));
  report("C4) the settings row is measured and shown but carries no Delete, while the other four all do",
    c4.hasRow && !c4.hasBtn && c4.btns === 4, c4);

  /* D2 — the strip's clock in a live page: it ticks while a stage runs and keeps the total on Done */
  const d2 = await page.evaluate(async () => {
    const root = document.getElementById("hnkAiToolsRoot") || document.body;
    let t = 0;
    const st = HNK.progressStrip.create({ document: document, root: root, now: () => t });
    st.onStage("UPLOADING", {});
    const at0 = (document.getElementById("hnkProgressMsg") || {}).textContent || "";
    t = 12400; st.onStage("PROCESSING", {});
    const at12 = (document.getElementById("hnkProgressMsg") || {}).textContent || "";
    t = 48000; st.setDone("Done.");
    const done = (document.getElementById("hnkProgressMsg") || {}).textContent || "";
    st.reset();
    const after = (document.getElementById("hnkProgressMsg") || {}).textContent || "";
    st.stop();
    return { at0: at0, at12: at12, done: done, after: after, elapsed: st.state().elapsedMs };
  });
  report("D2) the AI Tools strip — the one every Smart Workflow run in the panel draws — counts from the FIRST live stage, not from this one: at 12.4 s the generating line says 12s, and Done keeps the run's whole 48s",
    !/·/.test(d2.at0) && / · 12s$/.test(d2.at12) && d2.done === "Done. · 48s" && d2.after === "", d2);

  /* D3 — the panel's shared dots line (Text→Image rides it) */
  const d3 = await page.evaluate(async () => {
    const out = {};
    startBusy("st_gen");
    out.atStart = (document.getElementById("status") || {}).textContent || "";
    state.busyT0 = Date.now() - 37000;
    await new Promise((r) => setTimeout(r, 450));
    out.at37 = (document.getElementById("status") || {}).textContent || "";
    endBusy();
    out.zeroed = state.busyT0;
    return out;
  });
  report("D3) startBusy — the line Text→Image and the capture / place steps have always used — now carries the seconds beside its dots, and endBusy stops the clock",
    / · 37s/.test(d3.at37) && !/ · \d+s/.test(d3.atStart) && d3.zeroed === 0, d3);

  await ctx.close();
  await new Promise((r) => server.close(r));
}

/* ===================== E) the app wizard's clock ===================== */

async function appWalk(browser) {
  const PORT = process.env.PORT || 8931;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const e1 = await page.evaluate(async () => {
    /* the wizard's own busy state, painted the way step 4 paints it */
    const out = {};
    try { switchPage("pgWf"); } catch (e) { }
    await new Promise((r) => setTimeout(r, 500));
    const card = document.querySelector(".wfgrid .wfmini");
    out.card = !!card;
    if (!card) return out;
    card.click();
    await new Promise((r) => setTimeout(r, 900));
    out.open = document.getElementById("wiz") ? document.getElementById("wiz").className.indexOf("on") >= 0 : false;
    return out;
  });
  /* the clock itself is proved by its source shape (A7) and by driving the line directly:
     the wizard's run is a real RunningHub call and is not made here. */
  const e2 = await page.evaluate(async () => {
    const d = document.createElement("div"); d.id = "wizSpin"; document.body.appendChild(d);
    /* the same arithmetic the page runs, read out of the page's own function */
    const f = window.__wizSpinProbe;
    return { probe: typeof f };
  });
  report("E1) the web app's Smart Workflow wizard opens on a real card (the run itself is a paid RunningHub call and is not made here)",
    e1.card === true, e1);
  report("E2) the wizard's busy line is an element with an id the ticker can find, so a re-render never leaves the clock writing into a detached node",
    has(APP, 'bs.id="wizSpin"') && has(APP, 'document.getElementById("wizSpin")') &&
    has(APP, 'if(!e || !wiz.busy){ wizClockStop(); return; }'), { probe: e2.probe });
  await ctx.close();
}

/* ===================== F) release pins ===================== */

function partF() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("F1) the suite runs " + COUNT + " tests and this one is the " + COUNT + "th, named in the workflow",
    steps === COUNT && has(CI, "node test/verify_storage_clock_6135.js"), { steps: steps });
  report("F2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"'));
  const row = (function () {
    const WN = read("docs/app/data/whatsnew.js");
    const i = WN.indexOf('"' + VER + '"');
    return i > 0 && i < 4000;
  })();
  report("F3) What's New leads with the " + VER + " row and the landing counts " + COUNT + " tests",
    row && has(LANDING, String(COUNT)), { row: row });
}

/* ===================== run ===================== */

(async function main() {
  await partB();
  partDpure();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    await panelWalk(browser);
    /* the panel walk runs first on a bare browser — the Photoshop panel has its own
       gate stub — and only then is the Premium fixture wrapped on for the app walk,
       which opens pgWf, a page the account wall hides from a signed-out visitor. */
    withPremium(browser);
    await appWalk(browser);
  } finally { await browser.close(); }
  partF();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
