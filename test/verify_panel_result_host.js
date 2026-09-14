/* verify_panel_result_host.js — 6.81.0 / panel 6.152.0
   THE FIVE PHOTOGRAPHS OF 6.151.0 — the result host, named by the panel itself.

   6.80.0 put RunningHub's upload storage (*.xiaoyaoyou.com) into the UXP
   manifest and taught every refusal to say where it stopped and what the
   host said. The owner's first photograph of 6.151.0 is that sentence doing
   its job, word for word:

     "… · ရလဒ်ဆွဲယူနေသည် · Permission denied to the url
      rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com
      Manifest entry not found."

   Uploads go to xiaoyaoyou (the same panel's Network row read "files ok
   (403)"); finished pictures come back from Tencent Cloud COS. A paid task
   reached SUCCESS (balance 23.41 → 23.38) and the download was refused by
   the panel's own allowlist.

   What this test pins:
     1. The manifest allows *.myqcloud.com and the cos.ap-hongkong family;
        PERMISSIONS.md carries the photograph's host as the evidence. (A1)
     2. The normalizer names the platform's refusal: "host-blocked", never
        "network", with a nine-language line (rh_err_host_blocked). (A2, B1)
     3. The adapter end to end: a download refused with the UXP sentence is
        host-blocked · DOWNLOADING_RESULT · the host. (B2)
     4. In the panel, through the real transport, the strip prints the
        nine-language host-blocked line, the stage word and the host. (C1)
     5. The SELF-TEST Network row probes RunningHub · uploads · results; the
        result host throwing the UXP sentence reads "results BLOCKED — …" with
        the full host and the red mark. (A2, C2)
     6. CI step, landing count, What's New row. (A3)

   Fault-injected while writing: the two manifest lines removed fails A1;
   the host-blocked branch removed turns B1/B2/C1 into "network"; the reason
   cap back at 80 characters cuts the host in C2. */
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
const UPLOAD_HOST = "rh-hk-images-switch.xiaoyaoyou.com";
const RESULT_HOST = "rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com";
const UXP_REFUSAL = "Permission denied to the url " + RESULT_HOST + " Manifest entry not found.";

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const NORM = read("panel/src/providers/runninghub-error-normalizer.js");
const MANIFEST = JSON.parse(read("panel/manifest.json"));
const PERMS = read("panel/PERMISSIONS.md");
const APP = read("docs/app/index.html");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

function sourcePins() {
  const domains = (MANIFEST.requiredPermissions && MANIFEST.requiredPermissions.network && MANIFEST.requiredPermissions.network.domains) || [];
  report("A1) the manifest allows the result storage (https://*.myqcloud.com and https://*.cos.ap-hongkong.myqcloud.com) beside the upload storage and RunningHub, still no \"all\"; PERMISSIONS.md carries the photograph's host and the UXP sentence as the evidence",
    domains.includes("https://*.myqcloud.com") && domains.includes("https://*.cos.ap-hongkong.myqcloud.com") && domains.includes("https://*.xiaoyaoyou.com") && domains.includes("https://*.runninghub.ai") && !domains.includes("all")
    && PERMS.indexOf(RESULT_HOST) !== -1 && /Manifest entry not\s+found/.test(PERMS), domains);
  const a2 = {
    branch: NORM.includes('if (msg.indexOf("manifest entry not found") !== -1 || msg.indexOf("permission denied to the url") !== -1) {'),
    code: NORM.includes('code: "host-blocked"'), first: NORM.indexOf('code: "host-blocked"') < NORM.indexOf('code: "invalid-key"'),
    i18n: (MAIN.match(/^    rh_err_host_blocked: /mg) || []).length,
    probes: MAIN.includes('{ id: "uploads", url: "https://' + UPLOAD_HOST + '/", method: "GET" }') && MAIN.includes('{ id: "results", url: "https://' + RESULT_HOST + '/", method: "GET" }'),
    running: MAIN.includes('"checking RunningHub \\u00b7 uploads \\u00b7 results\\u2026"'), cap: MAIN.includes('.trim().slice(0, 140)')
  };
  report("A2) the normalizer's host-blocked branch stands first, rh_err_host_blocked in nine languages, the Network row probes RunningHub · uploads · results and keeps 140 characters of a refusal (the COS host alone is 52)",
    a2.branch && a2.code && a2.first && a2.i18n === 9 && a2.probes && a2.running && a2.cap, a2);
  const ciIdx = CI.indexOf("node test/verify_panel_result_host.js"), prevIdx = CI.indexOf("node test/verify_panel_generate_reach.js");
  const landingTests = parseInt((/data-count="tests">(\d+)</.exec(LANDING) || [])[1] || "0", 10);
  report("A3) CI runs this test right after verify_panel_generate_reach, the landing claims at least the 216 tests this wave reached, the What's New row 6.81.0 exists on both surfaces",
    ciIdx > prevIdx && prevIdx > 0 && landingTests >= 216 && /v:"6\.81\.0", kind:"page", ref:"pgWf"/.test(APP) && /v:"6\.81\.0"/.test(WHATS), { ciIdx, prevIdx, landingTests });
}

async function inNode() {
  const N = require(path.join(PANEL, "src/providers/runninghub-error-normalizer.js"));
  const A = require(path.join(PANEL, "src/providers/runninghub-enterprise-adapter.js"));
  const b1 = N.normalize(new TypeError(UXP_REFUSAL));
  report("B1) the UXP sentence, word for word, is host-blocked — not network — with the full host in its detail",
    b1.code === "host-blocked" && b1.detail.indexOf(RESULT_HOST) !== -1 && /manifest/i.test(b1.title), b1);
  const b1b = N.normalize({ status: 0, message: "Failed to fetch" });
  report("B1b) a plain dead line is still network", b1b.code === "network", b1b);
  const calls = [];
  const transport = async (req) => {
    calls.push((req.binary ? "GET " : "POST ") + req.url);
    const u = req.url;
    if (u.indexOf("/media/upload/binary") >= 0) return { ok: true, status: 200, json: async () => ({ code: 0, data: { download_url: "https://" + UPLOAD_HOST + "/input/openapi/a.jpg" } }) };
    if (u.indexOf("/openapi/v2/query") >= 0) return { ok: true, status: 200, json: async () => ({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://" + RESULT_HOST + "/output/z.png" }] }) };
    if (req.binary) throw Object.assign(new TypeError(UXP_REFUSAL), { host: RESULT_HOST, kind: "download" });
    return { ok: true, status: 200, json: async () => ({ taskId: "t-1" }) };
  };
  const r = await A.generate({ transport, apiKey: "k", sleep: async () => { }, now: () => Date.now() },
    { mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", prompt: "the same person in the reference scene",
      images: [{ ref: "data:image/png;base64," + PIXEL.toString("base64") }], output: { ratio: "auto", size: "2k", variants: 1 }, requestCount: 1 }, {});
  report("B2) end to end: upload → submit → SUCCESS → the download refused by the platform → ok:false · host-blocked · DOWNLOADING_RESULT · the COS host — the picture was paid for and the panel's own manifest stood in the way",
    !r.ok && r.error.code === "host-blocked" && r.error.stage === "DOWNLOADING_RESULT" && r.error.detail.indexOf(RESULT_HOST) !== -1 && calls[3] === "GET https://" + RESULT_HOST + "/output/z.png", { error: r.error, calls });
}

async function main() {
  sourcePins();
  await inNode();
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
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 220)));
  try {
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (/\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(u)) return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(500);
    const netRow = () => page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#selfTestRows .diagrow")).map(r => ({ nm: r.querySelector(".diag-nm").textContent, st: r.querySelector(".diag-st").textContent, lvl: r.querySelector(".diag-ic").className }));
      return rows.find(r => r.nm === "Network") || { missing: true, rows: rows.length };
    });
    /* C2a — three probes, all answering */
    await page.evaluate(() => switchPage("setup"));
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#selfTestRows .diagrow")).some(r => r.querySelector(".diag-nm").textContent === "Network" && /results ok/.test(r.querySelector(".diag-st").textContent)), null, { timeout: 8000 }).catch(() => { });
    const c2a = await netRow();
    report("C2a) the Network row reads \"RunningHub ok · uploads ok · results ok\" with the green mark when all three answer",
      !c2a.missing && /RunningHub ok \(200/.test(c2a.st) && /uploads ok \(200/.test(c2a.st) && /results ok \(200/.test(c2a.st) && /\bok\b/.test(c2a.lvl), c2a);
    /* C1 — the real transport, the result host refused with the platform's own sentence */
    await page.evaluate(() => switchPage("aitools"));
    const c1 = await page.evaluate(async (args) => {
      const prev = window.fetch;
      const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
      window.fetch = function (url, init) {
        url = String(url);
        if (url.indexOf("myqcloud.com") >= 0) return Promise.reject(new TypeError(args.refusal));
        if (url.indexOf("/media/upload/binary") >= 0) return json({ code: 0, data: { download_url: "https://" + args.up + "/input/openapi/a.jpg" } });
        if (url.indexOf("/openapi/v2/query") >= 0) return json({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://" + args.res + "/output/z.png" }] });
        if (url.indexOf("runninghub.ai/openapi/v2/") >= 0) return json({ taskId: "t-1" });
        return prev(url, init);
      };
      const r = await HNK.aiToolsBoot.runViaProvider({ mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", prompt: "the same person in the reference scene",
        images: [{ ref: args.png }], output: { ratio: "auto", size: "2k", variants: 1 }, requestCount: 1 });
      const msg = document.getElementById("hnkProgressMsg"); const strip = document.querySelector("#hnkAiToolsRoot .hnk-progress");
      return { ok: r.ok, code: r.error && r.error.code, stage: r.error && r.error.stage, line: msg ? msg.textContent : null, cls: strip ? strip.className : null,
        loc: HNK.i18n.t("rh_err_host_blocked"), stageWord: HNK.i18n.t("stage_downloading") };
    }, { refusal: UXP_REFUSAL, up: UPLOAD_HOST, res: RESULT_HOST, png: PNG1 });
    report("C1) in the panel, through the real transport: the platform's refusal of the result host → the strip is red and prints the nine-language host-blocked line, then the stage word, then the COS host",
      c1.ok === false && c1.code === "host-blocked" && c1.stage === "DOWNLOADING_RESULT" && !!c1.line && c1.line.indexOf(c1.loc) === 0 && c1.line.indexOf(c1.stageWord) > 0 && c1.line.indexOf(RESULT_HOST) > 0 && /\berr\b/.test(c1.cls || "") && c1.loc !== "rh_err_host_blocked", c1);
    /* C2b — Run again with the result host refused */
    await page.evaluate(() => switchPage("setup"));
    await page.click("#btnSelfTest");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#selfTestRows .diagrow")).some(r => r.querySelector(".diag-nm").textContent === "Network" && /BLOCKED/.test(r.querySelector(".diag-st").textContent)), null, { timeout: 8000 }).catch(() => { });
    const c2b = await netRow();
    report("C2b) Run again with the result host refused: \"RunningHub ok · uploads ok · results BLOCKED — Permission denied to the url <the full COS host> Manifest entry not found.\" with the red mark",
      !c2b.missing && /RunningHub ok \(200/.test(c2b.st) && /uploads ok \(200/.test(c2b.st) && c2b.st.indexOf("results BLOCKED — " + UXP_REFUSAL) !== -1 && /\berr\b/.test(c2b.lvl), c2b);
    report("C) no page error on the way", errs.length === 0, errs);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
