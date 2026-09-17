/* v6.91.0 — THE DATA LEFT THE SHELL.
 *
 * docs/app/index.html was 5.8 MB (1.58 MB gzipped) and the service worker
 * serves the shell network-first, so every release re-sent the whole file —
 * including the Library catalog (1.18 MB) and the studio tables (136 KB) that
 * sat inline as <script type="application/json"> blocks and had not changed
 * in months, and a What's New table of 123 rows of which the Home strip ever
 * draws the three newest unread.
 *
 * Now: data/libwf.js and data/hnkdata.js are loaded by <script src> with a
 * content tag in the query (the file's SHA-256, written by
 * tools/build_app_data.js), cached cache-first by full URL in the service
 * worker's own DATA_CACHE that a shell release does not wipe; the What's New
 * table keeps the releases since 6.80.0 and the rest is the archive record
 * (data/whats-new-archive.json) that nothing loads; the panel lifts the live
 * table only. This file pins all of it: the files and tags, the service worker
 * in a VM, the cut, the shell's byte ceilings, and a real boot.
 *
 * v6.92.0 — data/imagine.js (the Imagine tables) joined the shell's script
 * tags, and the eighteen native language packs became data/trl-<code>.js that
 * the shell loads one at a time (test/verify_lang_packs.js walks the loader);
 * the ceilings dropped with them.
 *
 * Usage: PORT=8931 node test/verify_app_data_files.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const A = require("../tools/lib/app-data.js");

const ROOT = A.ROOT;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const SW = read("docs/app/sw.js");
const PANEL_WN = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const CUT = [6, 80, 0];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const ver = (v) => String(v).split(".").map(Number);
const cmp = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; };

/* ---------------- A. the data files and the shell ---------------- */
const libwf = A.readLibWf(), hnk = A.readHnkData();
const tagLib = A.contentTag("libwf"), tagData = A.contentTag("hnkdata");
const srcLib = APP.match(/<script src="data\/libwf\.js\?v=([0-9a-f]+)"><\/script>/);
const srcData = APP.match(/<script src="data\/hnkdata\.js\?v=([0-9a-f]+)"><\/script>/);
const tagIm = A.contentTag("imagine"), srcIm = APP.match(/<script src="data\/imagine\.js\?v=([0-9a-f]+)"><\/script>/);
report("A1) data/libwf.js and data/hnkdata.js are one window.X= assignment around valid JSON — the Library catalog (items, featured, collections, workflows) and the studio tables (counts)",
  Array.isArray(libwf.items) && libwf.items.length > 1000 && Array.isArray(libwf.workflows) && libwf.featured.length > 0 &&
  hnk && hnk.counts && typeof hnk.counts.presets === "number" &&
  /^window\.HNK_LIBWF=\{/.test(A.wrapperText("libwf")) && /^window\.HNK_DATA=\{/.test(A.wrapperText("hnkdata")),
  { items: libwf.items && libwf.items.length, counts: hnk && hnk.counts });
report("A2) the shell loads the three by <script src=\"data/…?v=<content tag>\"> (libwf, hnkdata, imagine) and the tags are each file's own SHA-256 today",
  !!srcLib && !!srcData && !!srcIm && srcLib[1] === tagLib && srcData[1] === tagData && srcIm[1] === tagIm && /^[0-9a-f]{12}$/.test(tagLib),
  { shell: [srcLib && srcLib[1], srcData && srcData[1], srcIm && srcIm[1]], files: [tagLib, tagData, tagIm] });
const mainAt = APP.indexOf("var D = window.HNK_DATA;");
const loaderAt = APP.indexOf("window.HNK_TRL_TAGS=");
report("A3) the inline blocks are gone, the three data scripts and the pack loader sit before the app's script, and D / LW / IMAGINE_DATA / TR_L are the loaded globals",
  APP.indexOf('<script id="hnkData"') < 0 && APP.indexOf('<script id="hnkLibWf"') < 0 && APP.indexOf("\nvar TR_L={") < 0 && APP.indexOf("TR_PANEL_L") < 0 &&
  mainAt > 0 && APP.indexOf("var LW = window.HNK_LIBWF;") > 0 && srcLib.index < mainAt && srcData.index < mainAt && srcIm.index < loaderAt && loaderAt < mainAt &&
  APP.split("var IMAGINE_DATA = window.HNK_IMAGINE;").length === 2 && APP.indexOf("var TR_L = window.HNK_TRL;") > loaderAt &&
  APP.indexOf('getElementById("hnkData")') < 0 && APP.indexOf('getElementById("hnkLibWf")') < 0, { mainAt, loaderAt, im: srcIm && srcIm.index });
const rawBytes = Buffer.byteLength(APP, "utf8"), gzBytes = zlib.gzipSync(Buffer.from(APP, "utf8"), { level: 6 }).length;
/* 6.102.0 — the gzip ceiling moves from 1.05 MB to 1.1 MB, and it is worth saying
   exactly why rather than quietly nudging it. This ceiling was set in 6.92.0 the
   moment the DATA left the shell, and what it exists to catch is the data coming
   back inline — a regression that would put hundreds of kilobytes back in one
   step. A new PAGE's code is not that: the ALBUM module is ~35 KB of source, its
   tables are a file (data/album.js, pinned by A1–A3 and D2 like every other), and
   the raw ceiling is untouched at 3.3 MB with 24 KB of headroom left, so it still
   binds. Moving this number is a decision about how much page code the shell may
   carry; it is not a way around the rule the file is named for. */
report("A4) the shell stays under its ceilings — 3.3 MB raw, 1.1 MB gzipped (5.8 MB / 1.58 MB before the data left; 3.78 MB / 1.16 MB before the packs and the Imagine tables followed in 6.92.0)",
  rawBytes <= 3300000 && gzBytes <= 1100000, { rawBytes, gzBytes });
const before = APP;
const run = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_app_data.js")], { encoding: "utf8" });
report("A5) tools/build_app_data.js is idempotent on a built tree — it validates, reports the tags and leaves index.html unchanged",
  run.status === 0 && /index\.html unchanged/.test(run.stdout) && read("docs/app/index.html") === before, { status: run.status, out: (run.stdout || "").slice(-200) });
const im = A.readImagine();
report("A6) data/imagine.js is one window.HNK_IMAGINE= assignment around the Imagine tables (tools, ui, models, frame) — the same JSON the panel lifter inlines",
  /^window\.HNK_IMAGINE=\{/.test(A.wrapperText("imagine")) && Array.isArray(im.tools) && im.tools.length >= 22 && im.ui && im.models && im.frame &&
  read("panel/js/hnk_imagine.js").indexOf("var IMAGINE_DATA = " + A.imagineText() + ";") >= 0, { tools: im.tools && im.tools.length });
const packs = A.readTrl();
report("A7) the eighteen native packs are each one fixed-head assignment around a dictionary, and the shell's loader table names every one under its own tag",
  A.TRL_CODES.length === 18 && A.TRL_CODES.every((c) => Object.keys(packs[c]).length >= 200 && new RegExp("^window\\.HNK_TRL=window\\.HNK_TRL\\|\\|\\{\\};window\\.HNK_TRL\\." + c + "=\\{").test(A.wrapperText("trl-" + c))) &&
  APP.indexOf(A.trlTagsLine()) > 0, { codes: A.TRL_CODES.length, sizes: A.TRL_CODES.map((c) => c + ":" + Object.keys(packs[c]).length).join(" ") });

/* ---------------- B. the service worker, in a VM ---------------- */
function swBox() {
  const handlers = {}, stores = {}, log = { fetch: [] };
  const keyOf = (r) => typeof r === "string" ? r : r.url;
  function mkCache() {
    const m = new Map();
    return {
      match: (r) => Promise.resolve(m.get(keyOf(r))),
      put: (r, res) => { m.set(keyOf(r), res); return Promise.resolve(); },
      keys: () => Promise.resolve([...m.keys()].map((u) => ({ url: u }))),
      delete: (r) => Promise.resolve(m.delete(keyOf(r))),
      add: () => Promise.resolve(), addAll: () => Promise.resolve(), _m: m
    };
  }
  const caches = {
    open: (n) => Promise.resolve(stores[n] || (stores[n] = mkCache())),
    keys: () => Promise.resolve(Object.keys(stores)),
    delete: (n) => { const had = !!stores[n]; delete stores[n]; return Promise.resolve(had); },
    match: () => Promise.resolve(undefined)
  };
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: () => Promise.resolve() }, location: { origin: "https://hnkaistudio.com" } };
  const ctx = {
    self, caches, location: self.location, URL, Promise, console, setTimeout, clearTimeout,
    fetch: (r) => { log.fetch.push(keyOf(r)); return Promise.resolve({ ok: true, status: 200, url: keyOf(r), clone() { return this; } }); },
    Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; this.ok = this.status < 400; } clone() { return this; } },
    Request: class { constructor(u) { this.url = u; this.method = "GET"; } }
  };
  ctx.globalThis = ctx; ctx.self.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(SW, ctx, { filename: "sw.js" });
  async function go(url) { let out = null; const e = { request: { url, method: "GET" }, respondWith(p) { out = p; } }; handlers.fetch(e); const r = out ? await out : null; await new Promise((res) => setTimeout(res, 5)); return r; }
  return { handlers, stores, log, go, caches };
}
const swSrc = { cache: /var DATA_CACHE = "hnk-data-v1";/.test(SW), re: /var DATA_RE = \/\\\/data\\\/\[A-Za-z0-9_-\]\+\\\.js\$\/;/.test(SW),
  branchFirst: SW.indexOf("DATA_RE.test(url.pathname)") > 0 && SW.indexOf("DATA_RE.test(url.pathname)") < SW.indexOf('var isLib = url.pathname.indexOf("/lib/")'),
  kept: /k !== CACHE && k !== LIB_CACHE && k !== DATA_CACHE/.test(SW), cap: /var DATA_MAX_ENTRIES = 24;/.test(SW) };
report("B1) sw.js declares DATA_CACHE (hnk-data-v1), matches /data/<name>.js, routes it before the library branch, keeps the cache on activate and caps it at 24 entries",
  Object.values(swSrc).every(Boolean), swSrc);
(async () => {
  const O = "https://hnkaistudio.com";
  const b = swBox();
  const d1 = O + "/app/data/libwf.js?v=" + tagLib;
  await b.go(d1); const n1 = b.log.fetch.length;
  await b.go(d1); const n2 = b.log.fetch.length;
  const inData = b.stores["hnk-data-v1"] && b.stores["hnk-data-v1"]._m.has(d1);
  report("B2) a tagged data URL is fetched once and answered from DATA_CACHE from then on — the second request never reaches the network",
    n1 === 1 && n2 === 1 && !!inData, { n1, n2, inData: !!inData });
  const plain = O + "/app/data/libwf.js";
  await b.go(plain); await b.go(plain);
  const plainInData = b.stores["hnk-data-v1"]._m.has(plain);
  report("B3) an untagged data URL is not the data branch's — it goes the shell's network-first way every time and never enters DATA_CACHE",
    b.log.fetch.filter((u) => u === plain).length === 2 && !plainInData, { fetched: b.log.fetch.filter((u) => u === plain).length, plainInData });
  const shell = O + "/app/index.html";
  await b.go(shell); await b.go(shell);
  report("B4) the shell itself stays network-first — two requests, two network fetches",
    b.log.fetch.filter((u) => u === shell).length === 2, { fetched: b.log.fetch.filter((u) => u === shell).length });
  for (let i = 0; i < 30; i++) await b.go(O + "/app/data/hnkdata.js?v=" + ("00000000000" + i.toString(16)).slice(-12));
  const size = b.stores["hnk-data-v1"]._m.size;
  report("B5) old tags do not pile up — after thirty distinct tags the data cache holds at most 24 entries, the oldest gone first",
    size <= 24 && size >= 20, { size });
  const c = swBox();
  const CACHE = (SW.match(/var CACHE = "([^"]+)";/) || [])[1];
  await c.caches.open(CACHE); await c.caches.open("hnk-lib-v1"); await c.caches.open("hnk-data-v1"); await c.caches.open("hnk-web-studio-v0-0-1");
  let wait = null; c.handlers.activate({ waitUntil(p) { wait = p; } }); await wait;
  const left = Object.keys(c.stores).sort();
  report("B6) activation deletes the previous shell cache and keeps the shell, the library and the data caches",
    left.join() === [CACHE, "hnk-data-v1", "hnk-lib-v1"].sort().join(), { left });

  /* ---------------- C. What's New: the cut and the archive record ---------------- */
  const open = "var WHATS_NEW = [\n"; const a0 = APP.indexOf(open); const b0 = APP.indexOf("\n];", a0);
  const inline = new Function("return [" + APP.slice(a0 + open.length, b0) + "]")();
  const archive = A.readWhatsNewArchive();
  const appVer = APP.match(/var APP_VER="([^"]+)"/)[1];
  const keys = (rows) => rows.map((e) => e.v + "|" + e.kind + "|" + e.ref);
  const overlap = keys(inline).filter((k) => keys(archive).indexOf(k) >= 0);
  const nineOk = (rows) => rows.every((e) => e.t && e.s && LANGS.every((l) => typeof e.t[l] === "string" && e.t[l] && typeof e.s[l] === "string" && e.s[l]));
  const inlineOk = inline.every((e) => cmp(ver(e.v), CUT) >= 0), archOk = archive.every((e) => cmp(ver(e.v), CUT) < 0);
  const newestFirst = (rows) => rows.every((e, i) => i === 0 || cmp(ver(rows[i - 1].v), ver(e.v)) >= 0);
  report("C1) the live table holds only releases since 6.80.0 (newest first, the newest naming APP_VER) and the archive record only releases before it — no row on both sides, " + (inline.length + archive.length) + " rows in all, every one with a title and a line in nine languages",
    inline.length >= 10 && inlineOk && archOk && overlap.length === 0 && inline[0].v === appVer && newestFirst(inline) && newestFirst(archive) &&
    inline.length + archive.length >= 123 && nineOk(inline) && nineOk(archive),
    { inline: inline.length, archive: archive.length, overlap, first: inline[0] && inline[0].v, appVer });
  const panelRows = (PANEL_WN.match(/\{ v:"/g) || []).length;
  report("C2) the panel lifts the live table only (" + panelRows + " rows) and nothing in the app loads the archive — it is a record, not a download",
    panelRows === inline.length && !/whats-new-archive\.json/.test(APP.replace(/\/\*[\s\S]*?\*\//g, "")) && !/whats-new-archive/.test(PANEL_WN),
    { panelRows, inline: inline.length });

  /* ---------------- D. a real boot ---------------- */
  const { chromium } = require("playwright-core");
  const PORT = process.env.PORT || 8931;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [], reqs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  page.on("request", (r) => { const u = r.url(); if (u.indexOf("/data/") >= 0) reqs.push(u.slice(u.indexOf("/data/"))); });
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const boot = await page.evaluate(() => ({
    lw: typeof LW === "object" && LW.items.length, lwGlobal: window.HNK_LIBWF === LW, d: typeof D === "object" && D === window.HNK_DATA && !!D.counts,
    inlineGone: !document.getElementById("hnkLibWf") && !document.getElementById("hnkData"),
    libTotal: (document.getElementById("libTotal") || {}).textContent || null, rows: WHATS_NEW.length, strip: !!document.getElementById("dashNew"),
    im: typeof IMAGINE_DATA === "object" && IMAGINE_DATA === window.HNK_IMAGINE && IMAGINE_DATA.tools.length, trl: TR_L === window.HNK_TRL && Object.keys(TR_L).length
  }));
  await browser.close();
  report("D1) the app boots from the data files — LW, D and IMAGINE_DATA are the loaded globals, the catalog is whole, the strip is drawn, TR_L is the loader's (empty) object on a Burmese boot, and no page error",
    boot.lw === libwf.items.length && boot.lwGlobal && boot.d && boot.inlineGone && boot.strip && boot.im === im.tools.length && boot.trl === 0 && errs.length === 0, { boot, errs: errs.slice(0, 3) });
  /* 6.102.0 — four files now: the ALBUM page's sizes, layout templates and text
     roles joined the three in data/album.js, under a content tag like the rest. */
  const tagAlb = A.contentTag("album");
  report("D2) the shell asked for each of the four data files exactly once, under its content tag, and for no language pack",
    reqs.filter((u) => u === "/data/libwf.js?v=" + tagLib).length === 1 && reqs.filter((u) => u === "/data/hnkdata.js?v=" + tagData).length === 1 &&
    reqs.filter((u) => u === "/data/imagine.js?v=" + tagIm).length === 1 &&
    reqs.filter((u) => u === "/data/album.js?v=" + tagAlb).length === 1 && reqs.length === 4, { reqs });

  /* ---------------- E. release pins ---------------- */
  const wn = APP.slice(a0, b0);
  const inlineWn = wn.indexOf('{ v:"' + appVer + '"') >= 0 && LANGS.every((l) => (wn.slice(0, wn.indexOf("\n  { v:", 20) > 0 ? wn.indexOf("\n  { v:", 20) : wn.length).match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2);
  report("E1) CI runs this test right after verify_panel_dead_lookups; the landing counts at least 227 tests; What's New carries the " + appVer + " row in nine languages on the app and the panel",
    /verify_panel_dead_lookups\.js\n      - name: [^\n]*\n        run: PORT=8931 node test\/verify_app_data_files\.js/.test(CI) &&
    (parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10) >= 227) && inlineWn && PANEL_WN.indexOf('{ v:"' + appVer + '"') >= 0, null);

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — the data left the shell, tagged and cached; the strip keeps what is new and the record keeps the rest.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
