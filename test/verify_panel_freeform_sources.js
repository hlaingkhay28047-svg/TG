/* verify_panel_freeform_sources.js — 6.82.0 / panel 6.153.0
   THE EIGHT PHOTOGRAPHS OF 6.152.0 — every source on a Freeform slot, the
   frame the student gave us, and a web picture that always arrives.

   The owner wrote: "Freeform မှာ active layer နဲ့ chose file choose web chose
   library မရဘူး … Result ကလဲ … မူလ subjet frame composition မရဘူး". Three
   root causes:

     1. The Freeform IMG-slot sheet (ffSrcSheet) was the last photo sheet
        still built as a fixed <div>. Photoshop lays a fixed box out as an
        ordinary block at the end of the page (6.78.0's photographs), so a
        tap on IMG 1…4 opened nothing a student could see. It is a <dialog>
        through photoSheet now, with Layer · File · Paste · Web · Library ·
        the last result.
     2. "Web" could only ever reach the hosts the UXP manifest names;
        Photoshop refuses every other host ("Permission denied to the url
        <host> Manifest entry not found."). The studio's own API now fetches
        the picture for a signed-in member (GET /v1/image?url=…) behind an
        SSRF guard, and both the classic loader and the host's fetchImageUrl
        fall back to it.
     3. On Auto, the default branch (Nano Banana 2 — the Reference Scenes
        route) sent NO aspectRatio, so the server chose its own frame and
        "keep image 1 subject frame and composition" had no frame to keep.
        Every endpoint whose Auto used to send nothing now measures IMAGE 1
        (ratio-fit.js on both surfaces), and the wizard's route line says so
        ("auto → 2:3") before GENERATE.

   Also: the wizard's Library button OPENS the Library and takes the look
   back (HNK.libTarget / HNK.wfSlotFill) instead of a "pick one first" hint;
   Enter in the wizard's link field loads.

   Fault-injected while writing: ffSrcSheet back on a <div> fails A1/C1;
   the API door removed from fetchWebImage fails C3; needsMeasuredRatio's
   default branch removed fails A3/B3/B4; the private-address check removed
   fails B1/B2. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");

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
const LANGS = ["en", "my", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const UXP_REFUSAL = (host) => "Permission denied to the url " + host + " Manifest entry not found.";

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const RATIO = read("panel/src/providers/ratio-fit.js");
const HOST = read("panel/src/photoshop/photoshop-host.js");
const WF = read("panel/src/ui/screens/workflow-tools-screen.js");
const V1 = read("server/lib/v1.js");
const PROXY = read("server/lib/image-proxy.js");
const PERMS = read("panel/PERMISSIONS.md");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

/* a real 90×160 RGB PNG, built here so the measured ratio is 9:16 */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngRGB(w, h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 3, 0x80); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const TALL = pngRGB(90, 160);
const TALL_B64 = TALL.toString("base64");
const TALL_URL = "data:image/png;base64," + TALL_B64;

function grabFn(src, re) { const m = re.exec(src); return m ? m[0].replace(/\r/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim() : ""; }

function sourcePins() {
  const sheet = /function ffSrcSheet\(slot\) \{[\s\S]*?\n\}/.exec(MAIN);
  const body = sheet ? sheet[0] : "";
  report("A1) ffSrcSheet opens the Freeform slot through photoSheet (a <dialog>) with Paste · Web · Library between File and the last result — no fixed <div> is built any more; photoSheet accepts the extra rows",
    !!body && /photoSheet\("IMAGE " \+ n, \{/.test(body) && /onLayer: function \(\) \{ ffSlotFromLayer\(slot\); \}/.test(body) && /onFile: function \(\) \{ ffSlotFromFile\(slot\); \}/.test(body)
    && /ff9\(FF_L\.srcPaste\), fn: function \(\) \{ ffSlotFromPaste\(slot\); \}/.test(body) && /ff9\(FF_L\.srcWeb\), fn: function \(\) \{ ffSlotFromWeb\(slot\); \}/.test(body)
    && /ff9\(FF_L\.srcLib\)/.test(body) && /switchPage\("presets"\)/.test(body) && /onLast: state\.resultB64 \?/.test(body)
    && !/createElement\("div"\); bd\.id = "ffSheet"/.test(body)
    && MAIN.includes('(opts.extra || []).forEach(function (x) { if (x && x.label && typeof x.fn === "function") opt(x.label, x.fn); });')
    && MAIN.indexOf("opt(ff9(FF_L.srcFile), opts.onFile);") < MAIN.indexOf("(opts.extra || []).forEach(") && MAIN.indexOf("(opts.extra || []).forEach(") < MAIN.indexOf("if (opts.onLast && state.resultB64) opt(ff9(FF_L.srcLast), opts.onLast);"),
    { hasSheet: !!body, head: body.slice(0, 200) });
  const bad = [];
  ["srcPaste", "srcWeb", "pasteOk", "pasteNone"].forEach(function (k) {
    const m = new RegExp("\\n  " + k + ": \\{([^\\n]*?)\\},?\\n").exec(MAIN);
    if (!m) { bad.push(k + ": not found"); return; }
    const missing = LANGS.filter(function (l) { return !new RegExp("(?:^|[{, ])" + l + ':\\s*"').test(m[1]); });
    if (missing.length) bad.push(k + ": " + missing.join(","));
  });
  report("A2) the sheet's two new rows and Paste's two lines speak all nine languages (FF_L.srcPaste · srcWeb · pasteOk · pasteNone)", bad.length === 0, bad);
  const panelRule = grabFn(RATIO, /function needsMeasuredRatio\(cfg, ratio\)\{[\s\S]*?\n\}/).replace("needsMeasuredRatio", "X");
  const appRule = grabFn(APP, /function rhNeedsMeasuredRatio\(cfg, ratio\)\{[\s\S]*?\n\}/).replace("rhNeedsMeasuredRatio", "X");
  report("A3) the Auto-ratio rule is the same function on both surfaces (comments aside) and names the default branch, imagine · wan25 · gpt15 · ratioOnly, sizeParam / whParam, never t2i, never a picked ratio",
    panelRule.length > 100 && panelRule === appRule && /k==="" \|\| k==="imagine" \|\| k==="wan25" \|\| k==="gpt15" \|\| k==="ratioOnly"/.test(panelRule)
    && /if\(cfg\.sizeParam \|\| cfg\.whParam\) return true;/.test(panelRule) && /if\(ratio && ratio!=="auto" && ratio!=="source"\) return false;/.test(panelRule) && /cfg\.kind==="t2i"/.test(panelRule),
    { panel: panelRule.slice(0, 300), app: appRule.slice(0, 300) });
  const routeIdx = V1.indexOf('if (pathname==="/v1/image"&&method==="GET")'), identIdx = V1.indexOf("requireIdentity(identity);");
  report("A4) GET /v1/image?url= is served by image-proxy.js AFTER requireIdentity (members only), with the SSRF guard (every resolved address public, the request pinned to it, three redirects, image/* only, 25 MB), and PERMISSIONS.md records the door",
    routeIdx > identIdx && identIdx > 0 && V1.includes('const imageProxy = require("./image-proxy");') && V1.includes("imageProxy.fetchImage(input.params.get(\"url\"))")
    && PROXY.includes("function isPrivateAddress(ip)") && PROXY.includes("async function resolvePublic(hostname, lookup)") && PROXY.includes("lookup: (host, o, cb) =>") && PROXY.includes("const MAX_REDIRECTS = 3;")
    && PROXY.includes("const MAX_BYTES = 25 * 1024 * 1024;") && PROXY.includes('if (ct.indexOf("image/") !== 0)') && /net\.isIP\(host\)/.test(PROXY)
    && /GET \/v1\/image\?url=/.test(PERMS) && /never gains `"all"`/.test(PERMS), { routeIdx, identIdx });
  report("A5) the wizard: the route line reads Auto's measured shape (\"auto → r\") through HNK.ratioFit over the model config and repaints on every refresh; Library opens the Library (HNK.libTarget.request) and HNK.wfSlotFill takes the look back; Enter in the link field loads",
    WF.includes("function measuredAuto(route)") && WF.includes('r = mr ? "auto \\u2192 " + mr : "auto"') && WF.includes("rf.needsMeasuredRatio(mc, \"\")") && WF.includes("if (rl && wfNow) rl.textContent = routeLine(wfNow);")
    && WF.includes("lt.request(inp.key, idx); return true;") && WF.includes("gSlot.HNK.wfSlotFill = fillSlot;") && WF.includes('if (ev && ev.key === "Enter") { addFromWeb(inp, urlInp.value); urlRow.style.display = "none"; }'),
    {});
  report("A6) the web door: fetchWebImage falls back to fetchWebImageViaApi (GET /v1/image with the member's bearer, the direct try sent once) and installs HNK.webImageFallback; the host's fetchImageUrl tries the direct door then the fallback",
    MAIN.includes("return fetchWebImageViaApi(url);") && MAIN.includes('GATE_API_URL + "/v1/image?url=" + encodeURIComponent(url)') && MAIN.includes("{ method: \"GET\", headers: gateHeaders(tok, false) }, 60000)")
    && MAIN.includes("globalThis.HNK.webImageFallback = async function (url) {") && MAIN.includes("method: \"GET\", hnkNoRetry: true,")
    && HOST.includes("globalThis.HNK.webImageFallback : null") && HOST.indexOf("var direct = null;") < HOST.indexOf("if (direct) return direct;"),
    {});
  const ciIdx = CI.indexOf("node test/verify_panel_freeform_sources.js"), prevIdx = CI.indexOf("node test/verify_panel_result_host.js");
  const landingTests = parseInt((/data-count="tests">(\d+)</.exec(LANDING) || [])[1] || "0", 10);
  report("A7) CI runs this test right after verify_panel_result_host, the landing claims at least the 217 tests this wave reached, the What's New row 6.82.0 exists on both surfaces",
    ciIdx > prevIdx && prevIdx > 0 && landingTests >= 217 && /v:"6\.82\.0", kind:"page", ref:"pgWf"/.test(APP) && /v:"6\.82\.0"/.test(WHATS), { ciIdx, prevIdx, landingTests });
}

/* a fake http.request: the test decides what each hop answers */
function fakeRequest(answers) {
  const calls = [];
  return {
    calls,
    request: (opts, cb) => {
      calls.push({ hostname: opts.hostname, path: opts.path, lookup: typeof opts.lookup });
      const a = answers[opts.hostname + opts.path] || answers["*"];
      const handlers = {};
      const req = { on: (ev, fn) => { handlers[ev] = fn; return req; }, end: () => {
        setTimeout(() => {
          if (a.error) { handlers.error && handlers.error(new Error(a.error)); return; }
          const rh = {}; const res = { statusCode: a.status, headers: a.headers || {}, resume: () => { }, on: (ev, fn) => { rh[ev] = fn; return res; } };
          cb(res);
          setTimeout(() => {
            if (a.body) { const parts = a.chunks || [a.body]; for (const p of parts) { if (rh.data) rh.data(p); } }
            if (rh.end) rh.end();
          }, 0);
        }, 0);
      }, destroy: () => { } };
      return req;
    }
  };
}

async function inNode() {
  const P = require(path.join(ROOT, "server/lib/image-proxy.js"));
  const priv = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "::ffff:10.0.0.1", "fd00::1", "fe80::1", "64:ff9b::1"];
  const pub = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "151.101.1.69", "2606:4700::1111"];
  const b1 = { privWrong: priv.filter(a => !P.isPrivateAddress(a)), pubWrong: pub.filter(a => P.isPrivateAddress(a)), refused: {} };
  for (const u of ["file:///etc/passwd", "ftp://a.com/x", "http://user:pw@a.com/x", "http://localhost/x", "http://127.0.0.1/x", "http://[::1]/x", "http://intranet/x", "http://box.local/x", "http://a.com:22/x", "not a url"]) {
    try { P.parseTarget(u); b1.refused[u] = "ACCEPTED"; } catch (e) { b1.refused[u] = e.status + " " + e.code; }
  }
  const accepted = Object.values(b1.refused).filter(v => v === "ACCEPTED");
  report("B1) the guard: every loopback / RFC 1918 / link-local / CGNAT / multicast / v6-local / v4-mapped address is private, public ones are not; file:, ftp:, credentials, localhost, a bare or .local name, an IP literal and a stray port are refused before any lookup",
    b1.privWrong.length === 0 && b1.pubWrong.length === 0 && accepted.length === 0 && b1.refused["http://127.0.0.1/x"] === "403 address_refused" && b1.refused["http://user:pw@a.com/x"] === "400 invalid_url", b1);

  const lookups = { "pics.example": [{ address: "151.101.1.69", family: 4 }], "cdn.example": [{ address: "104.16.1.1", family: 4 }, { address: "2001:4860::8888", family: 6 }],
    "evil.example": [{ address: "151.101.1.69", family: 4 }, { address: "10.0.0.5", family: 4 }], "meta.example": [{ address: "169.254.169.254", family: 4 }] };
  const lookup = async (h) => { if (!lookups[h]) throw new Error("ENOTFOUND"); return lookups[h]; };
  const big = Buffer.alloc(P.MAX_BYTES + 1, 1);
  const fake = fakeRequest({
    "pics.example/tall.png": { status: 200, headers: { "content-type": "image/png" }, body: TALL },
    "pics.example/page.html": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from("<html>") },
    "pics.example/huge.jpg": { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(P.MAX_BYTES + 1) }, body: Buffer.from("x") },
    "pics.example/lying.jpg": { status: 200, headers: { "content-type": "image/jpeg" }, body: big, chunks: [big.subarray(0, 1000), big.subarray(1000)] },
    "pics.example/go": { status: 302, headers: { location: "https://cdn.example/real.webp" } },
    "cdn.example/real.webp": { status: 200, headers: { "content-type": "image/webp" }, body: Buffer.from("RIFFwebp") },
    "pics.example/tometa": { status: 301, headers: { location: "http://meta.example/latest/meta-data/" } },
    "pics.example/loop": { status: 302, headers: { location: "https://pics.example/loop" } },
    "pics.example/missing.png": { status: 404, headers: {} },
    "*": { status: 500, headers: {} }
  });
  const deps = { lookup, request: fake.request };
  const go = async (u) => { try { const r = await P.fetchImage(u, deps); return { ok: true, ct: r.contentType, len: r.bytes.length }; } catch (e) { return { ok: false, status: e.status, code: e.code, msg: e.message }; } };
  const b2 = {
    happy: await go("https://pics.example/tall.png"),
    html: await go("https://pics.example/page.html"),
    declared: await go("https://pics.example/huge.jpg"),
    lying: await go("https://pics.example/lying.jpg"),
    redirect: await go("https://pics.example/go"),
    toMeta: await go("https://pics.example/tometa"),
    loop: await go("https://pics.example/loop"),
    missing: await go("https://pics.example/missing.png"),
    mixed: await go("https://evil.example/a.png"),
    unknown: await go("https://nowhere.example/a.png"),
    pinned: fake.calls.every(c => c.lookup === "function")
  };
  report("B2) fetchImage end to end with a fake resolver and transport: the picture comes back with its type; an HTML page is 415 not_image; a declared or actual body past 25 MB is 413; a redirect is followed to another public host; a redirect to the cloud metadata address is 403; a loop stops at three hops; a 404 is 502; a name with ONE private address among public ones is refused; an unknown name is 502; every connection carried a pinned lookup",
    b2.happy.ok && b2.happy.ct === "image/png" && b2.happy.len === TALL.length && b2.html.code === "not_image" && b2.html.status === 415 && b2.declared.code === "too_large" && b2.lying.code === "too_large"
    && b2.redirect.ok && b2.redirect.ct === "image/webp" && b2.toMeta.code === "address_refused" && b2.loop.code === "fetch_failed" && /redirects too many/.test(b2.loop.msg) && b2.missing.status === 502
    && b2.mixed.code === "address_refused" && b2.unknown.code === "fetch_failed" && b2.pinned, b2);

  require(path.join(PANEL, "src/providers/ratio-fit.js"));
  const rf = globalThis.HNK.ratioFit;
  const cfgNB2 = { apiPath: "rhart-image-n-g31-flash/image-to-image", maxImages: 10 };
  const b3 = { nb2Auto: rf.resolve(cfgNB2, "auto", TALL_URL), nb2Empty: rf.resolve(cfgNB2, "", TALL_URL), nb2Picked: rf.resolve(cfgNB2, "4:5", TALL_URL), gpt: rf.resolve({ kind: "gpt15" }, "", TALL_URL),
    nanov1: rf.resolve({ kind: "nanov1", ratioEnum: ["1:1"] }, "auto", TALL_URL), flux: rf.resolve({ kind: "fluxedit" }, "", TALL_URL), t2i: rf.resolve({ kind: "t2i", sizeParam: "size" }, "", undefined), noImage: rf.resolve(cfgNB2, "", undefined) };
  report("B3) ratio-fit resolves a 90×160 IMAGE 1 on Auto to 9:16 for the Reference Scenes route (nano-banana-2, no kind) and for GPT Image 1.5; leaves a picked 4:5, the documented autos (nanov1, fluxedit), text-to-image and a missing photograph untouched",
    b3.nb2Auto === "9:16" && b3.nb2Empty === "9:16" && b3.nb2Picked === "4:5" && b3.gpt === "9:16" && b3.nanov1 === "auto" && b3.flux === "" && b3.t2i === "" && b3.noImage === "", b3);

  const A = require(path.join(PANEL, "src/providers/runninghub-enterprise-adapter.js"));
  const submits = [];
  const transport = async (req) => {
    const u = req.url;
    if (u.indexOf("/media/upload/binary") >= 0) return { ok: true, status: 200, json: async () => ({ code: 0, data: { download_url: "https://rh-hk-images-switch.xiaoyaoyou.com/input/openapi/a.png" } }) };
    if (u.indexOf("/openapi/v2/query") >= 0) return { ok: true, status: 200, json: async () => ({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com/output/z.png" }] }) };
    if (req.binary) return { ok: true, status: 200, dataUrl: TALL_URL, text: async () => TALL_URL };
    submits.push(JSON.parse(req.body || "{}"));
    return { ok: true, status: 200, json: async () => ({ taskId: "t-1" }) };
  };
  const run = (ratio) => A.generate({ transport, apiKey: "k", sleep: async () => { }, now: () => Date.now() },
    { mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", prompt: "Reference scenes from image 2 keep image 1 subject frame and composition",
      images: [{ ref: TALL_URL }, { ref: TALL_URL }], output: { ratio, size: "2k", variants: 1 }, requestCount: 1 }, {});
  const rAuto = await run("auto"); const rPick = await run("4:5");
  report("B4) the adapter end to end on the Reference Scenes route: with Ratio on Auto the submitted body carries aspectRatio 9:16 — IMAGE 1's own shape — where 6.152.0 sent none; a picked 4:5 goes through as 4:5",
    rAuto.ok && submits[0] && submits[0].aspectRatio === "9:16" && rPick.ok && submits[1] && submits[1].aspectRatio === "4:5", { ok: rAuto.ok, err: rAuto.error, bodies: submits });
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
    await page.waitForTimeout(400);
    /* the doors this test walks through: the layer capture, the clipboard, the two fetch doors */
    await page.evaluate((args) => {
      window.__calls = [];
      window.captureLayerB64 = async function () { return { b64: args.b64, mime: "image/png", label: "layer" }; };
      window.__clip = { image: null, text: "" };
      const clip = { read: async () => { if (!window.__clip.image) throw new Error("no image"); return [{ types: ["image/png"], getType: async () => new Blob([Uint8Array.from(atob(window.__clip.image), c => c.charCodeAt(0))], { type: "image/png" }) }]; },
        readText: async () => window.__clip.text, writeText: async () => { } };
      try { Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true }); } catch (e) { navigator.clipboard.read = clip.read; navigator.clipboard.readText = clip.readText; }
      const prev = window.fetch;
      window.fetch = function (url, init) {
        url = String(url);
        window.__calls.push({ url: url.slice(0, 160), auth: init && init.headers && (init.headers.Authorization || init.headers.authorization) || "" });
        if (url.indexOf("/v1/image?url=") >= 0) {
          const bytes = Uint8Array.from(atob(args.b64), c => c.charCodeAt(0));
          return Promise.resolve(new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }));
        }
        if (url.indexOf("pics.example") >= 0) return Promise.reject(new TypeError(args.refusal));
        return prev(url, init);
      };
    }, { b64: TALL_B64, refusal: UXP_REFUSAL("pics.example") });

    /* ---- C1: the sheet is a dialog with every source ---- */
    await page.evaluate(() => switchPage("aitools"));
    await page.waitForTimeout(200);
    const c1 = await page.evaluate(() => {
      const tile = document.querySelector("#refStrip .rs");
      if (!tile) return { noTile: true };
      tile.click();
      const d = document.getElementById("ffSheet");
      return { tag: d && d.tagName, open: !!(d && d.open), cls: d && d.className, title: d && d.querySelector(".subh") && d.querySelector(".subh").textContent,
        rows: d ? Array.from(d.querySelectorAll(".btn")).map(b => b.textContent) : [], want: [ff9(FF_L.srcLayer), ff9(FF_L.srcFile), ff9(FF_L.srcPaste), ff9(FF_L.srcWeb), ff9(FF_L.srcLib), t("btn_cancel")] };
    });
    report("C1) a tap on IMG 1 opens <dialog id=ffSheet class=ff-sheet> (open), titled IMAGE 1 — Where from?, with Layer · File · Paste · Web · Library · Cancel in that order and no last-result row before any result exists",
      c1.tag === "DIALOG" && c1.open && /ff-sheet/.test(c1.cls) && /^IMAGE 1 /.test(c1.title || "") && JSON.stringify(c1.rows) === JSON.stringify(c1.want) && c1.rows.length === 6, c1);

    /* ---- C2: Layer ---- */
    const c2 = await page.evaluate(async () => {
      const d = document.getElementById("ffSheet");
      d.querySelectorAll(".btn")[0].click();
      await new Promise(r => setTimeout(r, 150));
      return { closed: !document.getElementById("ffSheet"), subj: !!(state.subj && state.subj.b64), mime: state.subj && state.subj.mime, status: document.getElementById("status") ? document.getElementById("status").textContent : "", want: t("st_ref_layer_added") };
    });
    report("C2) Layer: the selected layer lands in IMAGE 1 and the status line says so", c2.closed && c2.subj && c2.mime === "image/png" && c2.status.indexOf(c2.want) === 0, c2);

    /* ---- C3: Web — the host refused by Photoshop, the picture fetched by the API ---- */
    await page.evaluate(() => { window.__calls = []; document.querySelectorAll("#refStrip .rs")[1].click(); document.getElementById("ffSheet").querySelectorAll(".btn")[3].click(); });
    await page.waitForSelector("dialog.hnk-dlg input.inp", { timeout: 5000 });
    await page.evaluate(() => { const dlg = document.querySelector("dialog.hnk-dlg"); dlg.querySelector("input.inp").value = "https://pics.example/tall.png"; dlg.querySelector(".btn-gold").click(); });
    await page.waitForFunction(() => !!(state.refs[0] && state.refs[0].b64) || /HTTP|error|Error/.test((document.getElementById("status") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => { });
    const c3 = await page.evaluate((b64) => ({ filled: !!(state.refs[0] && state.refs[0].b64), same: !!(state.refs[0] && state.refs[0].b64 === b64), mime: state.refs[0] && state.refs[0].mime,
      status: (document.getElementById("status") || {}).textContent, want: t("st_ref_web_added"), calls: window.__calls, busy: state.busy }), TALL_B64);
    const direct = c3.calls.find(c => c.url.indexOf("pics.example/tall.png") === 0 || c.url.indexOf("https://pics.example/tall.png") === 0);
    const viaApi = c3.calls.find(c => c.url.indexOf("/api/v1/image?url=https%3A%2F%2Fpics.example%2Ftall.png") > 0);
    report("C3) Web: the address is asked for in the panel's own prompt dialog; the picture's host is refused by Photoshop (the UXP sentence), so the studio's API fetches it with the member's bearer, and the picture lands in IMAGE 2 with the web-added status",
      c3.filled && c3.same && c3.mime === "image/png" && c3.status.indexOf(c3.want) === 0 && !!direct && !!viaApi && viaApi.auth === "Bearer a" && !c3.busy, c3);

    /* ---- C4: Paste — a copied picture ---- */
    await page.evaluate((b64) => { window.__clip.image = b64; window.__clip.text = ""; document.querySelectorAll("#refStrip .rs")[2].click(); document.getElementById("ffSheet").querySelectorAll(".btn")[2].click(); }, TALL_B64);
    await page.waitForFunction(() => !!(state.refs[1] && state.refs[1].b64), null, { timeout: 8000 }).catch(() => { });
    const c4 = await page.evaluate((b64) => ({ filled: !!(state.refs[1] && state.refs[1].b64 === b64), label: state.refs[1] && state.refs[1].label, status: (document.getElementById("status") || {}).textContent, want: ff9(FF_L.pasteOk).replace("{n}", "3") }), TALL_B64);
    report("C4) Paste with a copied picture: the clipboard image lands in IMAGE 3 and the status names it", c4.filled && c4.label === "clipboard" && c4.status === c4.want, c4);

    /* ---- C5: Paste — a copied image address, through the API door; then an empty clipboard ---- */
    await page.evaluate(() => { ffSlotSet(0, null); window.__clip.image = null; window.__clip.text = "https://pics.example/tall.png"; window.__calls = []; document.querySelectorAll("#refStrip .rs")[0].click(); document.getElementById("ffSheet").querySelectorAll(".btn")[2].click(); });
    await page.waitForFunction(() => !!(state.subj && state.subj.b64), null, { timeout: 15000 }).catch(() => { });
    const c5 = await page.evaluate(async () => {
      const a = { filled: !!(state.subj && state.subj.b64), status: (document.getElementById("status") || {}).textContent, want: t("st_ref_web_added"), viaApi: window.__calls.some(c => c.url.indexOf("/api/v1/image?url=") > 0) };
      window.__clip.text = "just some words";
      ffSlotSet(0, null);
      document.querySelectorAll("#refStrip .rs")[0].click(); document.getElementById("ffSheet").querySelectorAll(".btn")[2].click();
      await new Promise(r => setTimeout(r, 300));
      a.emptyStatus = (document.getElementById("status") || {}).textContent; a.emptyWant = ff9(FF_L.pasteNone); a.stillEmpty = !state.subj;
      return a;
    });
    report("C5) Paste with a copied image address: the link is fetched through the API and lands in IMAGE 1; a clipboard holding neither a picture nor a link gets the nine-language \"copy a picture first\" line and the slot stays empty",
      c5.filled && c5.status.indexOf(c5.want) === 0 && c5.viaApi && c5.emptyStatus === c5.emptyWant && c5.stillEmpty, c5);

    /* ---- C6: Library ---- */
    const c6 = await page.evaluate(() => { document.querySelectorAll("#refStrip .rs")[1].click(); document.getElementById("ffSheet").querySelectorAll(".btn")[4].click(); return { page: state.page, target: state.libTargetSlot }; });
    report("C6) Library: the Presets page opens with IMAGE 2 remembered as the target", c6.page === "presets" && c6.target === 1, c6);

    /* ---- C7: the wizard — auto → measured, and the Library door ---- */
    await page.evaluate(async () => { state.libTargetSlot = null; switchPage("wf"); await new Promise(r => setTimeout(r, 600)); document.getElementById("hnkWf_reference-scenes").click(); });
    await page.waitForTimeout(400);
    const c7 = await page.evaluate(async (b64) => {
      const ctrl = HNK.aiToolsApp.controller().workflow;
      const keys = ctrl.requiredInputs.map(i => i.key);
      const before = document.getElementById("hnkWfRouteLine").textContent;
      const ok1 = HNK.wfSlotFill(keys[0], { mime: "image/png", b64 });
      await new Promise(r => setTimeout(r, 100));
      const after = document.getElementById("hnkWfRouteLine").textContent;
      /* the Library door on the second slot */
      HNK.lastLibraryPick = null;
      document.getElementById("hnkWfLib_" + keys[1]).click();
      await new Promise(r => setTimeout(r, 300));
      const opened = { page: state.page, wfTarget: state.wfLibTarget, idx: state.libTargetSlot };
      /* the Library's IMAGE button hands the look back */
      HNK.libBridge.toSlot(HNK.libBridge.takeTargetSlot(), { mime: "image/png", b64, label: "Golden Hour" });
      await new Promise(r => setTimeout(r, 300));
      const wf2 = HNK.aiToolsApp.controller().workflow;
      const slot2 = wf2.requiredInputs.find(i => i.key === keys[1]);
      return { keys, before, after, ok1, opened, back: state.page, slot2ref: slot2 && slot2.image && String(slot2.image.ref).slice(0, 21), slot2src: slot2 && slot2.image && slot2.image.source, cleared: state.wfLibTarget, subjKept: !!(wf2.requiredInputs[0].image && wf2.requiredInputs[0].image.ref) };
    }, TALL_B64);
    report("C7) the Reference Scenes wizard: the route line reads \"auto\" while the slots are empty and \"auto → 9:16\" once the 90×160 subject is in; Library on the scene slot opens the Presets page remembering that slot (key + IMAGE 2), and the Library's IMAGE button hands the look straight back into it and returns to the wizard",
      c7.keys.length >= 2 && /\bauto\b/.test(c7.before) && !/auto →/.test(c7.before) && c7.ok1 && /auto → 9:16/.test(c7.after)
      && c7.opened.page === "presets" && c7.opened.wfTarget === c7.keys[1] && c7.opened.idx === 1 && c7.back === "wf" && c7.slot2ref === "data:image/png;base64" && c7.slot2src === "library" && c7.cleared === null && c7.subjKept, c7);

    /* ---- C8: the host's own Web door (the wizard's Web button) ---- */
    const c8 = await page.evaluate(async () => { window.__calls = []; const r = await HNK.photoshopHost.fetchImageUrl("https://pics.example/tall.png"); return { ref: r && String(r.ref).slice(0, 21), viaApi: window.__calls.some(c => c.url.indexOf("/api/v1/image?url=") > 0 && c.auth === "Bearer a") }; });
    report("C8) HNK.photoshopHost.fetchImageUrl (the wizard's Web button): the direct door refused, the API door delivers the picture as a data URL", c8.ref === "data:image/png;base64" && c8.viaApi, c8);

    report("C) no page error on the way", errs.length === 0, errs);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
