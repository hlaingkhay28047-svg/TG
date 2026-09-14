/* verify_panel_generate_reach.js — 6.80.0 / panel 6.151.0
   THE SIXTEEN PHOTOGRAPHS OF 6.150.0 — "RunningHub Enterprise ကို မရောက်ပါ".

   The owner pressed GENERATE in the Reference Scenes wizard and the panel
   answered, in Burmese, that RunningHub could not be reached — under a Setup
   card that had just verified the key against RunningHub and read the
   balance. So the host that failed was not RunningHub. Every finished
   picture (and every uploaded reference) is a URL on RunningHub's file
   storage, *.xiaoyaoyou.com — the probe lane's own upload answer names
   rh-hk-images-switch.xiaoyaoyou.com — and a UXP plugin may fetch only the
   hosts its manifest lists. The panel submitted, paid, polled to SUCCESS and
   was then refused the download; the TypeError read as "network".

   What this test pins:
     1. The manifest allows *.xiaoyaoyou.com, PERMISSIONS.md says why. (A1)
     2. The transport's three budgets — 60 s JSON, 60 s + bytes/20 KB/s for an
        upload (cap 8 min), 3 min for a binary download — and that ITS timer
        throws code "timeout" while the caller's Stop throws "cancelled" and
        any other failure keeps its message and learns the host. (A2, B1–B4)
     3. The normalizer: a task RunningHub marked FAILED is "task-failed" with
        the server's reason, never "network"; a bare status 0 is network only
        when nothing else names the failure; every refusal carries why().
        (A3, C1–C4)
     4. The adapter records the failing stage; end to end with a fake
        transport a blocked download is network · DOWNLOADING_RESULT · host,
        a FAILED poll is task-failed · PROCESSING · reason. (A4, C5, C6)
     5. In the panel, through the REAL transport and the real fetch, the
        strip prints the nine-language line + the stage + the host; a
        licence refusal on the same path is printed, not swallowed. (A5, D1, D2)
     6. The SELF-TEST Network row: both hosts probed, "files BLOCKED" and a
        red mark when the storage host throws. (A6, E1, E2)
     7. The Imagine brush where every ruler reads 0: the stage takes an
        explicit width, the range under it moves that width, offsetX over it
        lands the stroke. (A7, F1–F3)
     8. CI step, landing count, What's New row. (A8, A9)

   Fault-injected while writing: the manifest line removed fails A1 and E2's
   sentence is what the owner would see; `(status === 0 && !code)` reverted
   to `status === 0` fails C1/C6; `n.stage` dropped fails C5/D1;
   `imStageW()` returning 0 fails F1. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

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
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const STORAGE_HOST = "rh-hk-images-switch.xiaoyaoyou.com";           /* uploads */
const RESULT_HOST = "rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com";   /* finished pictures (Tencent COS) — 6.81.0 */

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const HTTPJS = read("panel/src/providers/runninghub-http.js");
const NORM = read("panel/src/providers/runninghub-error-normalizer.js");
const ADAPTER = read("panel/src/providers/runninghub-enterprise-adapter.js");
const BOOT = read("panel/src/app/bootstrap.js");
const MANIFEST = JSON.parse(read("panel/manifest.json"));
const PERMS = read("panel/PERMISSIONS.md");
const APP = read("docs/app/index.html");
const IMAGINE_PANEL = read("panel/js/hnk_imagine.js");
const PANEL_CSS = read("panel/styles.css");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

function sourcePins() {
  const domains = (MANIFEST.requiredPermissions && MANIFEST.requiredPermissions.network && MANIFEST.requiredPermissions.network.domains) || [];
  report("A1) the manifest allows RunningHub's upload storage (https://*.xiaoyaoyou.com) and its result storage (https://*.myqcloud.com + the cos.ap-hongkong family) beside *.runninghub.ai, still no \"all\", and PERMISSIONS.md names both hosts and the reason",
    domains.includes("https://*.xiaoyaoyou.com") && domains.includes("https://*.myqcloud.com") && domains.includes("https://*.cos.ap-hongkong.myqcloud.com")
    && domains.includes("https://*.runninghub.ai") && !domains.includes("all")
    && /xiaoyaoyou/.test(PERMS) && /rh-hk-images-switch\.xiaoyaoyou\.com/.test(PERMS) && /rh-hk-images-1252422369\.cos\.ap-hongkong\.myqcloud\.com/.test(PERMS), domains);
  const a2 = {
    up: /var UPLOAD_MAX_TIMEOUT_MS = 480000;/.test(HTTPJS), dl: /var DOWNLOAD_TIMEOUT_MS = 180000;/.test(HTTPJS), rate: /var UPLOAD_BYTES_PER_MS = 20;/.test(HTTPJS),
    budget: /function budgetFor\(req, opts\)/.test(HTTPJS), timeout: HTTPJS.includes('{ code: "timeout", kind: kind, host: host }'),
    cancelled: HTTPJS.includes('{ code: "cancelled", kind: kind, host: host }'), api: /budgetFor: budgetFor, hostOf: _hostOf, kindOf: _kindOf/.test(HTTPJS)
  };
  report("A2) runninghub-http.js: three budgets (60 s json · 60 s + bytes at 20 KB/s capped 480 s upload · 180 s download), its own timer throws code timeout, a caller abort throws cancelled, budgetFor/hostOf/kindOf exported",
    Object.values(a2).every(Boolean), a2);
  const a3 = { failed: /if \(code === "failed"\) \{/.test(NORM), tf: NORM.includes('code: "task-failed"'), zero: NORM.includes("(status === 0 && !code)"),
    why: /why: why/.test(NORM), detail: /out\.detail = w;/.test(NORM), fields: /bb\.failReason \|\| bb\.reason \|\| bb\.errorMessage/.test(NORM) };
  report("A3) the normalizer: a FAILED task is task-failed with the body's failReason/reason/errorMessage, status 0 is network only without a code, why() exported and every refusal carries detail",
    Object.values(a3).every(Boolean), a3);
  report("A4) the adapter records the failing sub-machine stage on the error (lastSub)",
    /var lastSub = null;/.test(ADAPTER) && /var sub = machine\.create\(\); lastSub = sub;/.test(ADAPTER) && /n\.stage = \(lastSub && lastSub\.stage\) \|\| m\.stage;/.test(ADAPTER));
  const a5 = { word: /function stageWord\(stage\)/.test(BOOT), extra: BOOT.includes('line += " \\u00b7 " + extra;'),
    lic: BOOT.includes('e.code === "license-required" || /^HNKERR:err_license:/.test(String(e.message || ""))'), handle: BOOT.includes("globalThis.HNK.aiToolsBoot = handle") };
  report("A5) bootstrap.js: the strip line carries the stage word and the detail after the localized sentence; runViaProvider catches (licence refusal kept verbatim); the boot handle is published",
    Object.values(a5).every(Boolean), a5);
  const a6 = { keys: (MAIN.match(/^    rh_err_task_failed: /mg) || []).length, row: MAIN.includes("rows.push(hnkNetProbeRow());"), probe: /function hnkNetProbeStart\(force\)/.test(MAIN),
    hosts: MAIN.includes('url: "https://www.runninghub.ai/openapi/v2/query"') && MAIN.includes('url: "https://' + STORAGE_HOST + '/"') && MAIN.includes('url: "https://' + RESULT_HOST + '/"'),
    stage: /function rhStageWord\(stage\)/.test(MAIN), why: MAIN.includes('((e && e.why) ? " \\u00b7 " + e.why : "")'), /* 6.84.0 — the Layer capture probe re-arms on the same button, between the Network probe and the repaint */
    run: /hnkNetProbeStart\(true\); \} catch \(eN\) \{ \}( try \{ hnkLayerProbeStart\(true\); \} catch \(eL\) \{ \})? renderSelfTest\(\);/.test(MAIN) };
  report("A6) main.js: rh_err_task_failed in nine languages, the SELF-TEST Network row over RunningHub · uploads · results (probe re-armed by Run again), the classic status line prints the stage and reason (e.why)",
    a6.keys === 9 && a6.row && a6.probe && a6.hosts && a6.stage && a6.why && a6.run, a6);
  const imPins = (src) => src.includes('el("input","im-stagerange")') && /function imStageW\(\)\{ return S\.stageW>0 \? S\.stageW : IM_STAGE_W; \}/.test(src)
    && src.includes("desc:S.desc, stageW:S.stageW })") && src.includes("if(!(vw>0)) return imStageW();") && src.includes('wrap.style.width=imStageW()+"px"; srng.style.display="";');
  report("A7) the Imagine module (app, and lifted to the panel byte for byte here): a stored stage width, the range under the brush stage, imStageWidth falls back to it, the CSS on both surfaces",
    imPins(APP) && imPins(IMAGINE_PANEL) && /\.im-stagerange\{display:block;width:100%;box-sizing:border-box;margin:6px 0 0\}/.test(APP) && /\.im-stagerange\{/.test(PANEL_CSS), { app: imPins(APP), panel: imPins(IMAGINE_PANEL) });
  const ciIdx = CI.indexOf("node test/verify_panel_generate_reach.js"), prevIdx = CI.indexOf("node test/verify_panel_uxp_dialogs.js");
  const landingTests = parseInt((/data-count="tests">(\d+)</.exec(LANDING) || [])[1] || "0", 10);
  report("A8) CI runs this test right after verify_panel_uxp_dialogs, and the landing claims at least the 215 tests this wave reached",
    ciIdx > prevIdx && prevIdx > 0 && landingTests >= 215, { ciIdx, prevIdx, landingTests });
  report("A9) the What's New row 6.80.0 exists in the app and in the panel's lifted table",
    /v:"6\.80\.0", kind:"page", ref:"pgWf"/.test(APP) && /v:"6\.80\.0"/.test(WHATS));
}

async function transportInNode() {
  const H = require(path.join(PANEL, "src/providers/runninghub-http.js"));
  const realFetch = global.fetch;
  const upload = (bytes) => ({ method: "POST", url: "https://www.runninghub.ai/openapi/v2/media/upload/binary", body: { multipart: true, file: { fieldName: "file", name: "hnk_0.jpg", dataUrl: "data:image/jpeg;base64," + "A".repeat(Math.round(bytes / 0.75)) } } });
  const b1 = { json: H.budgetFor({ method: "POST", url: "https://www.runninghub.ai/openapi/v2/query", body: "{}" }), dl: H.budgetFor({ method: "GET", url: "https://x/y.png", binary: true }),
    up4: H.budgetFor(upload(4e6)), up14: H.budgetFor(upload(14e6)), flat: H.budgetFor({ binary: true }, { timeoutMs: 20 }), kind: H.kindOf(upload(1)), host: H.hostOf("https://" + STORAGE_HOST + "/a/b.png?x=1") };
  report("B1) budgets: json 60 000 · download 180 000 · a 4 MB upload 260 000 (±2 ms of rounding) · a 14 MB upload capped at 480 000 · an explicit timeoutMs stays flat; kindOf/hostOf read the request",
    b1.json === 60000 && b1.dl === 180000 && Math.abs(b1.up4 - 260000) <= 2 && b1.up14 === 480000 && b1.flat === 20 && b1.kind === "upload" && b1.host === STORAGE_HOST, b1);
  try {
    /* a fetch that never answers but honours the abort signal, as the platform's does */
    global.fetch = (url, init) => new Promise((res, rej) => { init.signal.addEventListener("abort", () => rej(Object.assign(new Error("The user aborted a request."), { name: "AbortError" }))); });
    let e2 = null;
    try { await H.create({ timeoutMs: 30 })({ method: "GET", url: "https://" + STORAGE_HOST + "/out/a.png", binary: true }); } catch (e) { e2 = e; }
    report("B2) when the transport's OWN timer fires the throw is code timeout, names the kind and the host — never a bare AbortError",
      !!e2 && e2.code === "timeout" && /download/.test(e2.message) && e2.host === STORAGE_HOST && e2.kind === "download", e2 && { code: e2.code, message: e2.message, host: e2.host });
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10);
    let e3 = null;
    try { await H.create()({ method: "POST", url: "https://www.runninghub.ai/openapi/v2/query", body: "{}", signal: ac.signal }); } catch (e) { e3 = e; }
    report("B3) the caller's own Stop comes back as code cancelled (the adapter's cancel branch), not as a timeout or a dead line",
      !!e3 && e3.code === "cancelled" && e3.kind === "json", e3 && { code: e3.code, message: e3.message });
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    let e4 = null;
    try { await H.create()(upload(12)); } catch (e) { e4 = e; }
    report("B4) any other failure keeps its own message and learns the kind and the host it was talking to",
      !!e4 && e4.message === "Failed to fetch" && e4.kind === "upload" && e4.host === "www.runninghub.ai" && !e4.code, e4 && { message: e4.message, kind: e4.kind, host: e4.host });
  } finally { global.fetch = realFetch; }
}

async function providerInNode() {
  const N = require(path.join(PANEL, "src/providers/runninghub-error-normalizer.js"));
  const A = require(path.join(PANEL, "src/providers/runninghub-enterprise-adapter.js"));
  const H = require(path.join(PANEL, "src/providers/runninghub-http.js"));
  const c1 = N.normalize({ code: "failed", status: 0, body: { taskId: "t", status: "FAILED", failReason: "content policy" } });
  report("C1) a task RunningHub marked FAILED (status 0) is task-failed with the server's reason as its bullet and in its detail — not \"network\"",
    c1.code === "task-failed" && c1.bullets[0] === "content policy" && /content policy/.test(c1.detail) && /failed/.test(c1.title.toLowerCase()), c1);
  const c2 = N.normalize(Object.assign(new TypeError("Failed to fetch https://" + STORAGE_HOST + "/output/z.png?sig=1"), { host: STORAGE_HOST, kind: "download" }));
  report("C2) a platform TypeError is network, and the detail cuts every URL down to its host (the path never shows)",
    c2.code === "network" && c2.detail.indexOf(STORAGE_HOST) !== -1 && c2.detail.indexOf("/output/") === -1 && c2.detail.indexOf("sig=") === -1, c2);
  const c3 = N.normalize({ code: "timeout", message: "timeout after 180s (download · " + STORAGE_HOST + ")" });
  const c4 = N.normalize({ status: 0, code: "20", name: "AbortError", message: "The user aborted a request." });
  const c4b = N.normalize({ status: 0, message: "Network request failed" });
  report("C3/C4) the transport's timeout is timeout; a status-0 error that carries a code is no longer called a dead line, a status-0 error with no code still is",
    c3.code === "timeout" && /180s/.test(c3.detail) && c4.code !== "network" && c4b.code === "network", { c3: c3.code, c4: c4.code, c4b: c4b.code });
  report("C4b) why() reads HTTP status (never a plain 200), the code, the body's words and the host, joined with middle dots",
    N.why({ status: 400, code: "submit-failed", body: { msg: "bad param" }, host: "www.runninghub.ai" }) === "HTTP 400 · code submit-failed · bad param · www.runninghub.ai"
    && N.why({ status: 200, body: { code: 1007 } }) === "1007" && N.why(null) === "", N.why({ status: 400, code: "submit-failed", body: { msg: "bad param" }, host: "www.runninghub.ai" }));

  let mode = "blocked"; const calls = [];
  const transport = async (req) => {
    calls.push((req.binary ? "GET " : "POST ") + req.url);
    const u = req.url;
    if (u.indexOf("/media/upload/binary") >= 0) return { ok: true, status: 200, json: async () => ({ code: 0, data: { download_url: "https://" + STORAGE_HOST + "/input/openapi/a.jpg" } }) };
    if (u.indexOf("/openapi/v2/query") >= 0) return { ok: true, status: 200, json: async () => (mode === "fail"
      ? { taskId: "t-1", status: "FAILED", failReason: "content policy" }
      : { taskId: "t-1", status: "SUCCESS", results: [{ url: "https://" + RESULT_HOST + "/output/z.png" }] }) };
    if (req.binary) throw Object.assign(new TypeError("Failed to fetch"), { host: H.hostOf(u), kind: "download" });
    return { ok: true, status: 200, json: async () => ({ taskId: "t-1" }) };
  };
  const request = () => ({ mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", prompt: "the same person in the reference scene",
    images: [{ ref: "data:image/png;base64," + PIXEL.toString("base64") }], output: { ratio: "auto", size: "2k", variants: 1 }, requestCount: 1 });
  const stages = [];
  const r5 = await A.generate({ transport, apiKey: "k", sleep: async () => { }, now: () => Date.now() }, request(), { onStage: (s) => stages.push(s) });
  report("C5) end to end on a fake transport: upload → submit → query SUCCESS → the download throws → ok:false · network · stage DOWNLOADING_RESULT · the result host in the detail (the task was paid for and the picture refused)",
    !r5.ok && r5.error.code === "network" && r5.error.stage === "DOWNLOADING_RESULT" && r5.error.detail.indexOf(RESULT_HOST) !== -1
    && calls[0].indexOf("upload/binary") !== -1 && /rhart|nano|openapi\/v2\//.test(calls[1]) && calls[2].indexOf("/query") !== -1 && calls[3].indexOf("GET https://" + RESULT_HOST + "/output/z.png") === 0,
    { ok: r5.ok, error: r5.error, calls });
  mode = "fail"; calls.length = 0;
  const r6 = await A.generate({ transport, apiKey: "k", sleep: async () => { }, now: () => Date.now() }, request(), {});
  report("C6) a poll that comes back FAILED: ok:false · task-failed · stage PROCESSING · the server's reason, and nothing was downloaded",
    !r6.ok && r6.error.code === "task-failed" && r6.error.stage === "PROCESSING" && r6.error.bullets[0] === "content policy" && !calls.some(c => c.indexOf("GET ") === 0), { error: r6.error, calls });
}

/* no ruler of any kind — the owner's 6.150.0 SELF-TEST: inner 0 · outer 0 · vv 0 · mm 0 */
const NO_RULER = `(function () {
  Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  Element.prototype.getClientRects = function () { return []; };
  ["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"].forEach(function (k) { Object.defineProperty(Element.prototype, k, { configurable: true, get: function () { return 0; } }); });
  ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop"].forEach(function (k) { Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: function () { return 0; } }); });
  Object.defineProperty(window, "innerWidth", { configurable: true, get: function () { return 0; } });
  Object.defineProperty(window, "outerWidth", { configurable: true, get: function () { return 0; } });
  try { Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return null; } }); } catch (e) { }
  window.matchMedia = function () { return { matches: false }; };
})();`;

async function main() {
  sourcePins();
  await transportInNode();
  await providerInNode();
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
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (/\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(u)) return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    for (const s of (o.pre || [])) await page.addInitScript(s);
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(500);
    return { page, errs };
  }
  const netRow = (page) => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#selfTestRows .diagrow")).map(r => ({ nm: r.querySelector(".diag-nm").textContent, st: r.querySelector(".diag-st").textContent, lvl: r.querySelector(".diag-ic").className }));
    return rows.find(r => r.nm === "Network") || { missing: true, rows: rows.length };
  });
  try {
    const B = await boot();
    /* ---------------- E1. the Network row, both hosts answering ---------------- */
    await B.page.evaluate(() => switchPage("setup"));
    await B.page.waitForFunction(() => Array.from(document.querySelectorAll("#selfTestRows .diagrow")).some(r => r.querySelector(".diag-nm").textContent === "Network" && /results ok/.test(r.querySelector(".diag-st").textContent)), null, { timeout: 8000 }).catch(() => { });
    const e1 = await netRow(B.page);
    report("E1) the SELF-TEST Network row probes RunningHub, the upload host and the result host and, with all three answering, reads \"RunningHub ok · uploads ok · results ok\" with the green mark",
      !e1.missing && /RunningHub ok \(200/.test(e1.st) && /uploads ok \(200/.test(e1.st) && /results ok \(200/.test(e1.st) && /\bok\b/.test(e1.lvl), e1);

    /* ---------------- D1. the real transport, the storage host refused ---------------- */
    await B.page.evaluate(() => switchPage("aitools"));
    const d1 = await B.page.evaluate(async (png) => {
      const prev = window.fetch; window.__prevFetch = prev;
      const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
      window.__rhCalls = [];
      window.fetch = function (url, init) {
        url = String(url); window.__rhCalls.push(((init && init.method) || "GET") + " " + url);
        if (url.indexOf("myqcloud.com") >= 0) return Promise.reject(new TypeError("Failed to fetch"));
        if (url.indexOf("/media/upload/binary") >= 0) return json({ code: 0, data: { download_url: "https://rh-hk-images-switch.xiaoyaoyou.com/input/openapi/a.jpg" } });
        if (url.indexOf("/openapi/v2/query") >= 0) return json({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com/output/z.png" }] });
        if (url.indexOf("runninghub.ai/openapi/v2/") >= 0) return json({ taskId: "t-1" });
        return prev(url, init);
      };
      const res = await HNK.aiToolsBoot.runViaProvider({ mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", prompt: "the same person in the reference scene",
        images: [{ ref: png }], output: { ratio: "auto", size: "2k", variants: 1 }, requestCount: 1 });
      const msg = document.getElementById("hnkProgressMsg"); const strip = document.querySelector("#hnkAiToolsRoot .hnk-progress");
      return { ok: res.ok, code: res.error && res.error.code, stage: res.error && res.error.stage, detail: res.error && res.error.detail, line: msg ? msg.textContent : null, cls: strip ? strip.className : null,
        loc: HNK.i18n.t("rh_err_network"), stageWord: HNK.i18n.t("stage_downloading"), calls: window.__rhCalls.filter(u => /runninghub|xiaoyaoyou|myqcloud/.test(u)) };
    }, PNG1);
    report("D1) in the panel, through the real transport and the real fetch: upload · submit · query SUCCESS · the result host refused → the strip is red and prints the panel's own nine-language line, then the stage word, then the host",
      d1.ok === false && d1.code === "network" && d1.stage === "DOWNLOADING_RESULT" && !!d1.line && d1.line.indexOf(d1.loc) === 0 && d1.line.indexOf(d1.stageWord) > 0 && d1.line.indexOf(RESULT_HOST) > 0
      && /\berr\b/.test(d1.cls || "") && d1.calls.length === 4 && d1.calls[3] === "GET https://" + RESULT_HOST + "/output/z.png", d1);
    /* ---------------- D2. a licence refusal on the same path is printed ---------------- */
    const d2 = await B.page.evaluate(async (png) => {
      const keep = HNK.panelAuth.requireLease;
      HNK.panelAuth.requireLease = function () { return Promise.reject(new Error("HNKERR:err_license:Panel authorization required")); };
      let res = null, threw = null;
      try { res = await HNK.aiToolsBoot.runViaProvider({ mode: "free", model: "nano-banana-2", prompt: "x", images: [{ ref: png }], output: { ratio: "auto", size: "2k", variants: 1 }, requestCount: 1 }); } catch (e) { threw = String(e); }
      HNK.panelAuth.requireLease = keep;
      const msg = document.getElementById("hnkProgressMsg");
      return { threw, ok: res && res.ok, code: res && res.error && res.error.code, line: msg ? msg.textContent : null };
    }, PNG1);
    report("D2) a licence refusal on the same path no longer escapes the promise: ok:false · code license · the gate's own sentence on the strip",
      !d2.threw && d2.ok === false && d2.code === "license" && /Panel authorization required/.test(d2.line || ""), d2);

    /* ---------------- E2. the Network row with the storage host refused ---------------- */
    await B.page.evaluate(() => switchPage("setup"));
    await B.page.click("#btnSelfTest");
    await B.page.waitForFunction(() => Array.from(document.querySelectorAll("#selfTestRows .diagrow")).some(r => r.querySelector(".diag-nm").textContent === "Network" && /BLOCKED/.test(r.querySelector(".diag-st").textContent)), null, { timeout: 8000 }).catch(() => { });
    const e2 = await netRow(B.page);
    report("E2) Run again with the result host throwing: the row reads \"RunningHub ok · uploads ok · results BLOCKED — Failed to fetch\" with the red mark — the one photograph that names a manifest gap",
      !e2.missing && /RunningHub ok \(200/.test(e2.st) && /uploads ok \(200/.test(e2.st) && /results BLOCKED — Failed to fetch/.test(e2.st) && /\berr\b/.test(e2.lvl), e2);
    report("D/E) no page error on the way", B.errs.length === 0, B.errs);
    await B.page.close();

    /* ---------------- F. the Imagine brush where every ruler reads 0 ---------------- */
    const F = await boot({ pre: [NO_RULER] });
    const f = await F.page.evaluate(async () => {
      const IM = window.HNK.imagine;
      switchPage("imagine");
      IM.openTool("objremove");
      const c = document.createElement("canvas"); c.width = 200; c.height = 300;
      const x = c.getContext("2d"); x.fillStyle = "#3a5a7a"; x.fillRect(0, 0, 200, 300);
      IM.addPhotos([{ dataUrl: c.toDataURL("image/png"), name: "t.png" }]);
      IM.mark(true);
      await new Promise(res => setTimeout(res, 450));
      const cv = document.getElementById("imMarkCv"), wrap = document.getElementById("imMarkWrap"), rng = document.getElementById("imStageW");
      if (!cv || !wrap || !rng) return { missing: { cv: !cv, wrap: !wrap, rng: !rng } };
      const stroke = (ox, oy) => {
        const mk = (type) => { const ev = new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: "mouse" });
          Object.defineProperty(ev, "offsetX", { value: ox }); Object.defineProperty(ev, "offsetY", { value: oy }); return ev; };
        cv.dispatchEvent(mk("pointerdown")); cv.dispatchEvent(mk("pointerup"));
      };
      const out = { probes: hnkWidthProbes().best, viewportW: IM.viewportW(), wrapW: wrap.style.width, rngShown: rng.style.display !== "none", rngVal: rng.value, stageWidth: IM.stageWidth(cv), aspect: cv.__imAspect, buf: [cv.width, cv.height] };
      stroke(170, 255); await new Promise(res => setTimeout(res, 60));
      out.pts1 = IM.strokes().length ? IM.strokes()[0].pts[0] : null;
      rng.value = "400"; rng.dispatchEvent(new Event("input", { bubbles: true }));
      out.wrapW2 = wrap.style.width; out.stageW2 = IM.state.stageW; out.stageWidth2 = IM.stageWidth(cv);
      stroke(200, 300); await new Promise(res => setTimeout(res, 60));
      out.pts2 = IM.strokes().length > 1 ? IM.strokes()[1].pts[0] : null;
      return out;
    });
    const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 0.02;
    report("F1) with every ruler 0 (probes 0, viewportW 0) the brush stage takes an explicit 340px width, the range under it is shown at 340, stageWidth answers 340, the buffer is the photo's own 200×300",
      !f.missing && f.probes === 0 && f.viewportW === 0 && f.wrapW === "340px" && f.rngShown && f.rngVal === "340" && f.stageWidth === 340 && near(f.aspect, 200 / 300) && f.buf[0] === 200 && f.buf[1] === 300, f);
    report("F2) a pointer at offsetX 170 · offsetY 255 lands the stroke at (0.5, 0.5) — offsetX over the explicit width, the height from the photo's aspect",
      !!f.pts1 && near(f.pts1[0], 0.5) && near(f.pts1[1], 0.5), f.pts1);
    report("F3) moving the range to 400 sets the stage width (state 400, wrap 400px, stageWidth 400) and a pointer at offsetX 200 · offsetY 300 still lands at (0.5, 0.5)",
      f.wrapW2 === "400px" && f.stageW2 === 400 && f.stageWidth2 === 400 && !!f.pts2 && near(f.pts2[0], 0.5) && near(f.pts2[1], 0.5), f);
    report("F) no page error on the way", F.errs.length === 0, F.errs);
    await F.page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
