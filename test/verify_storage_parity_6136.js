/* 6.136.0 / panel 6.207.0 — THE WEB APP SAYS WHAT IT IS KEEPING, AND THE PANEL STOPS SAYING IT TWICE.
 *
 * 6.135.0 answered the owner's "make the histories deletable so the machine stops getting heavy"
 * on the Photoshop panel: Setup ▸ Storage, one row per store, the measured size beside its name,
 * a Delete at the end of the row. It shipped on ONE surface, and the reason given at the time —
 * "a browser has no data folder" — was true of folders and wrong about storage. A phone running
 * the web app keeps exactly as much:
 *
 *   results   IndexedDB "gal", every record that is not a video (the picture and its thumbnail)
 *   videos    IndexedDB "gal", kind:"video" (the file's own bytes, plus the poster)
 *   albums    IndexedDB "kv", one record per album — a Print album carries its photographs at
 *             4,000 px as data URLs, and the shelf holds 24 of them
 *   settings  the HNK_LS_KEYS localStorage records
 *
 * and all the app said about it was one line under DATA & BACKUP: a settings total, a Gallery
 * count, and whatever navigator.storage.estimate() felt like reporting. That is enough to worry
 * a studio and not enough to act on. So this wave gives the app the panel's card, word for word,
 * measured over its own stores — and deletes that old line from BOTH surfaces, because two
 * readings of the same disk, one of them coarser, only makes a studio wonder which to believe.
 * DATA & BACKUP keeps what only it does: Export and Restore.
 *
 * The one row that stays the plugin's alone is scratch files — a plugin writing to disk is a
 * plugin thing and a browser has none. It carries data-panel-only, so the parity walk skips the
 * whole row rather than the two Setup pages being excused line by line.
 *
 * A) source pins   B) the app walked over seeded stores: measured, armed, deleted, ★ survived
 * C) the panel walked: an em dash while it counts, never a claim about the host
 * D) release pins
 * Usage: PORT=8931 node test/verify_storage_parity_6136.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js"), INDEX = read("panel/index.html");
const PARITY = read("test/verify_panel_page_parity.js");
const HARNESS = read("test/lib/panel-parity-harness.js");
const ST = require("../panel/src/app/panel-storage.js");
const VER = "6.137.0", PVER = "6.208.0";
const WAVE_V = "6.136.0";   /* this wave's own What's New row; VER moves on with every release */
const COUNT = 279;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const SHARED = ["h2", "note", "results", "videos", "albums", "settings", "total", "files", "del", "armed", "refresh", "kept", "none", "freed"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".woff2": "font/woff2", ".ico": "image/x-icon" };

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}
/* lift an object literal out of a source file by balancing its braces, so the two dictionaries
   are compared as data rather than as text that happens to look similar */
function literal(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return null;
  const j = src.indexOf("{", i);
  let d = 0, k = j;
  for (; k < src.length; k++) { const c = src[k]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { k++; break; } } }
  return eval("(" + src.slice(j, k) + ")");   /* our own source, read from disk in a test process */
}

/* ===================== A) source pins ===================== */

const STORE_L = literal(MAIN, "const STORE_L = {");
const STORE_W = literal(APP, "var STORE_W = {");

report("A1) the web app carries the same card, on its own Setup page and in the panel's place in the run of cards: after Settings, before the install instructions",
  has(APP, '<section class="card" id="cardStorage">') &&
  APP.indexOf('id="cardStorage"') > APP.indexOf('id="cardPrefs"') &&
  APP.indexOf('id="cardStorage"') < APP.indexOf('id="platH2"') &&
  ["storeH2", "storeNote", "storeTotalL", "storeTotalV", "storeKeptNote", "btnStoreRefresh", "stStore"].every((id) => has(APP, 'id="' + id + '"')) &&
  ["results", "videos", "albums", "settings"].every((k) => has(APP, 'id="storeL_' + k + '"') && has(APP, 'id="storeV_' + k + '"')),
  { card: has(APP, 'id="cardStorage"') });

(function () {
  const bad = [];
  SHARED.forEach((k) => {
    if (!STORE_L || !STORE_W || !STORE_L[k] || !STORE_W[k]) { bad.push(k + ":missing"); return; }
    LANGS.forEach((g) => { if (STORE_L[k][g] !== STORE_W[k][g]) bad.push(k + "." + g); });
  });
  report("A2) every word the two cards share is the SAME word in all nine languages — the h2, the note, the five row names, the total, \"files\", Delete, its armed question, Refresh, the ★ note, and the two answers a delete can give",
    bad.length === 0 && SHARED.length === 14, bad.slice(0, 8));
})();

report("A3) the note names the DEVICE, not the panel, because the same sentence now runs on a phone — and the only line still listed as the plugin's in the parity walk is the OS-temp broom",
  STORE_L && !/Panel/.test(STORE_L.note.en) && !/folder/.test(STORE_L.note.en) &&
  /setup: \[\s*\n\s*"နေရာ ရှင်းမယ်"/.test(PARITY) &&
  (PARITY.match(/setup: \[[\s\S]*?\]/) || [""])[0].split('"').length === 3,
  { note: STORE_L && STORE_L.note.en });

report("A4) the scratch-files row is skipped by the walk rather than excused word by word: it carries data-panel-only, and the harness drops any subtree that does",
  /id="storeRow_temps" data-panel-only="scratch-files"/.test(INDEX) &&
  has(HARNESS, "data-panel-only") &&
  !/"ယာယီ ဖိုင်များ"/.test(PARITY),
  { marked: /data-panel-only="scratch-files"/.test(INDEX) });

report("A5) refreshDataStore is gone from BOTH surfaces — no function, no call, no #dataStore to write into — and DATA & BACKUP keeps only the two things that are its own",
  !/function refreshDataStore/.test(APP) && !/function refreshDataStore/.test(MAIN) &&
  !/refreshDataStore\(\)/.test(APP) && !/refreshDataStore\(\)/.test(MAIN) &&
  !has(APP, 'id="dataStore"') && !has(INDEX, 'id="dataStore"') &&
  has(APP, 'id="btnExportData"') && has(APP, 'id="btnImportData"') &&
  has(INDEX, 'id="btnExportData"') && has(INDEX, 'id="btnImportData"'),
  { appFn: /function refreshDataStore/.test(APP), panelFn: /function refreshDataStore/.test(MAIN),
    appDiv: has(APP, 'id="dataStore"'), panelDiv: has(INDEX, 'id="dataStore"') });

report("A6) the app opens Setup by counting its stores, and the panel still does — neither one counts at boot, because a card nobody has opened is not worth walking a disk for",
  /id==="pgHome" && typeof renderSetupStatus==="function"\){ renderSetupStatus\(\); if\(typeof storeReadW==="function"\) storeReadW\(\); \}/.test(APP) &&
  has(MAIN, "renderSetupStatus(); storeMeasureP();") &&
  has(APP, "function wireStorageCard(){") && has(APP, "  wireStorageCard();"));

/* ===================== B) the app walked ===================== */

/* 2 results (one of them ★), 1 video, 2 album records + the shelf index, sized so that every
   row's reading is a number this test can name out loud */
const SEED = `(async () => {
  const d = await galDb();
  await new Promise((res) => { const tx = d.transaction(["gal","kv"],"readwrite");
    tx.objectStore("gal").clear(); tx.objectStore("kv").clear(); tx.oncomplete = res; tx.onabort = res; });
  await new Promise((res) => { const tx = d.transaction("gal","readwrite"), st = tx.objectStore("gal");
    st.add({ kind:"image", mime:"image/png", b64:"A".repeat(400000), thumb:"A".repeat(4000), ts:1, page:"pgEdit" });
    st.add({ kind:"image", mime:"image/png", b64:"A".repeat(200000), thumb:"A".repeat(4000), ts:2, page:"pgEdit", keep:1 });
    st.add({ kind:"video", mime:"video/mp4", blob:new Blob([new Uint8Array(900000)]), thumb:"A".repeat(4000), ts:3, page:"pgVideo" });
    tx.oncomplete = res; tx.onabort = res; });
  await new Promise((res) => { const tx = d.transaction("kv","readwrite"), st = tx.objectStore("kv");
    st.put({ p:"x".repeat(699992) }, "hnk_album_doc_v1:wedding");
    st.put({ p:"x".repeat(99992) }, "hnk_album_doc_v1:studio");
    st.put([{ id:"wedding" },{ id:"studio" }], "hnk_album_shelf_v1");
    tx.oncomplete = res; tx.onabort = res; });
})()`;

async function appWalk(browser) {
  const PORT = process.env.PORT || 8931;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.storeReadW === "function" && typeof window.galDb === "function", null, { timeout: 25000 });

  const b1 = await page.evaluate(`(async () => {
    await ${SEED};
    switchPage("pgHome");
    await storeReadW();
    const val = (id) => (document.getElementById(id) || {}).textContent || "";
    return { card: !!document.getElementById("cardStorage"),
      results: val("storeV_results"), videos: val("storeV_videos"), albums: val("storeV_albums"),
      settings: val("storeV_settings"), total: val("storeTotalV"),
      h2: val("storeH2"), note: val("storeNote"), kept: val("storeKeptNote"),
      refresh: val("btnStoreRefresh"),
      sum: ["results","videos","albums","settings"].reduce(function(a,k){ return a + STOREW.last[k].bytes; }, 0),
      totalBytes: STOREW.last.total.bytes, totalN: STOREW.last.total.n };
  })()`);
  report("B1) Setup ▸ Storage, walked in the real web app over real stores: two results at 445 KB, one clip at 882 KB, two album records at 781 KB, the settings beside them, and a total that is their sum",
    b1.card && /^2 .+ · 445 KB$/.test(b1.results) && /^1 .+ · 882 KB$/.test(b1.videos) &&
    /^2 .+ · 781 KB$/.test(b1.albums) && /^\d+ .+ · (0|\d+(\.\d)? (B|KB|MB))$/.test(b1.settings) &&
    /^\d+ .+ · 2\.\d MB$/.test(b1.total) && b1.totalBytes === b1.sum && b1.totalN >= 5 &&
    b1.h2.length > 0 && b1.note.length > 0 && b1.kept.length > 0 && b1.refresh.length > 0, b1);

  const b2 = await page.evaluate(`(async () => {
    const b = document.getElementById("storeB_results");
    const before = b.textContent;
    b.click(); await new Promise((r) => setTimeout(r, 250));
    const armed = b.textContent, gold = /btn-gold/.test(b.className || "");
    b.click(); await new Promise((r) => setTimeout(r, 1200));
    const val = (id) => (document.getElementById(id) || {}).textContent || "";
    return { before: before, armed: armed, gold: gold, results: val("storeV_results"),
      videos: val("storeV_videos"), status: val("stStore"), word: b.textContent };
  })()`);
  report("B2) Delete is the panel's own two-press arm — the first press changes the word and lights the button, the second empties the row, keeps the ★ take and says how much came back; the clip beside it is untouched",
    b2.armed !== b2.before && b2.armed.length > 0 && b2.gold === true &&
    /^1 .+ · 149 KB$/.test(b2.results) && /^1 .+ · 882 KB$/.test(b2.videos) &&
    /★/.test(b2.status) && b2.word === b2.before, b2);

  const b3 = await page.evaluate(`(async () => {
    const b = document.getElementById("storeB_albums");
    b.click(); await new Promise((r) => setTimeout(r, 250));
    b.click(); await new Promise((r) => setTimeout(r, 1200));
    const d = await galDb();
    const keys = await new Promise((res) => { const q = d.transaction("kv").objectStore("kv").getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    return { albums: (document.getElementById("storeV_albums") || {}).textContent || "", keys: keys.map(String) };
  })()`);
  report("B3) deleting the albums row takes the album records AND the shelf that lists them — a shelf of rows that open nothing is worse than an empty shelf",
    /^0 /.test(b3.albums) && b3.keys.filter((k) => /^hnk_album_doc_v1:/.test(k)).length === 0 &&
    b3.keys.indexOf("hnk_album_shelf_v1") < 0, b3);

  const b4 = await page.evaluate(() => ({
    hasRow: !!document.getElementById("storeV_settings"),
    hasBtn: !!document.getElementById("storeB_settings"),
    btns: ["results", "videos", "albums"].filter((k) => !!document.getElementById("storeB_" + k)).length,
    temps: !!document.getElementById("storeRow_temps")
  }));
  report("B4) the settings row is measured and shown but carries no Delete — it holds the key and the sign-in — while the other three all do, and the plugin's scratch row is not on this page at all",
    b4.hasRow && !b4.hasBtn && b4.btns === 3 && !b4.temps, b4);

  const b5 = await page.evaluate(`(async () => {
    STOREW.last = null; renderStorageW();
    const dash = (document.getElementById("storeTotalV") || {}).textContent || "";
    STOREW.last = { ok:false, err:"no store" }; renderStorageW();
    const claim = (document.getElementById("storeTotalV") || {}).textContent || "";
    await storeReadW();
    return { dash: dash, claim: claim, back: (document.getElementById("storeTotalV") || {}).textContent || "" };
  })()`);
  report("B5) while the count is still running the total reads an em dash, exactly like its rows; \"this browser gives the app no store\" is said only once a measure has come back empty-handed",
    b5.dash === "—" && b5.claim.length > 2 && b5.claim !== "—" &&
    /·/.test(b5.back), b5);

  report("B6) the app's sizes are the panel's sizes: the same four readings, byte for byte",
    ST.fmt(0) === "0" && ST.fmt(512) === "512 B" && ST.fmt(2048) === "2 KB" && ST.fmt(3145728) === "3.0 MB" &&
    (await page.evaluate(() => [storeFmtW(0), storeFmtW(512), storeFmtW(2048), storeFmtW(3145728)].join("|"))) === "0|512 B|2 KB|3.0 MB");

  await ctx.close();
}

/* ===================== C) the panel walked ===================== */

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

  const c1 = await page.evaluate(async () => {
    switchPage("setup");
    await new Promise((r) => setTimeout(r, 1200));
    const read = () => (document.getElementById("storeTotalV") || {}).textContent || "";
    STORE.last = null; renderStorageP();
    const dash = read();
    STORE.last = { ok: false }; renderStorageP();
    const claim = read();
    await storeMeasureP();
    return { dash: dash, claim: claim, back: read(),
      noteHasPanel: /Panel/.test((document.getElementById("storeNote") || {}).textContent || "") };
  });
  report("C1) the panel does the same: an em dash while it is still counting, the \"no data folder\" sentence only after a measure has actually said so, and a note that no longer says \"this Panel\"",
    c1.dash === "—" && c1.claim.length > 2 && c1.claim !== "—" && /·/.test(c1.back) &&
    c1.noteHasPanel === false, c1);

  await ctx.close();
  await new Promise((r) => server.close(r));
}

/* ===================== D) release pins ===================== */

function partD() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("D1) the suite runs " + COUNT + " tests and this one is the " + COUNT + "th, named in the workflow right after the storage-and-clock check it follows on from",
    steps === COUNT && has(CI, "node test/verify_storage_parity_6136.js") &&
    CI.indexOf("verify_storage_parity_6136.js") > CI.indexOf("verify_storage_clock_6135.js"), { steps: steps });
  report("D2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"'));
  const WN = read("docs/app/data/whatsnew.js");
  const i = WN.indexOf('"' + VER + '"');
  /* VER is the tree's current release and moves with every wave; WAVE_V is this one's own row,
     which stays where it is and keeps pointing at the page that grew the card. */
  const j = WN.indexOf('{"v":"' + WAVE_V + '","kind":"page","ref":"pgHome"');
  report("D3) What's New leads with the " + VER + " row, this wave's row still points at the page that grew the card, and the landing counts " + COUNT + " tests",
    i > 0 && i < 4000 && j > 0 &&
    has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING),
    { at: i, wave: j });
}

/* ===================== run ===================== */

(async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    await panelWalk(browser);
    await appWalk(browser);
  } finally { await browser.close(); }
  partD();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
