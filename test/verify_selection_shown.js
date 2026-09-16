/* verify_selection_shown.js — 6.97.0 / panel 6.168.0, corrected in 6.97.1
   SELECTION EDIT: THE REFUSAL NAMES ITSELF, THE MARKED AREA IS SHOWN, THE PAGE IS SHORTER.

   THE OWNER'S MESSAGE, in one line: "Selection မှာ တစ်ခါတစ်လေရပြီးတစ်ခါတစ်လေမရဘူး နောက်ပြီး
   ui ux က ရှည်လွန်းတယ် နောက်ပြီး selection ဘယ်နားမှတ်ထားလဲ ပြလို့ရလား" — it works sometimes and not
   others, the page is too long, and can you show me where the selection is. Five photographs
   came with it: Selection Edit on DSCF1288.RAF at 66.7%, RGB/16, refusing 1191×1191 and
   1208×1208 with "Could not read the selected pixels — try again.", and going through minutes
   later at 3040×3040.

   THE DEPTH IS THE CAUSE — and 6.168.0 guessed the wrong half of it. This file shipped with
   the claim that a targetSize makes Photoshop resample and that a resample is 8 bits, so the
   rectangles under the 2048 cap were the ones with no way through. The owner's photograph of
   6.168.0's own refusal disproved it: a 4036×4036 rectangle — ABOVE the cap, so route 1 did
   carry targetSize 2048×2048 — failed with "Only 8 bit image data can be encoded as jpeg",
   the same sentence as the plain route behind it.

   So targetSize bounds the pixel COUNT and nothing else. A 16-bit document hands back 16-bit
   pixels at every size, and the imaging API's own depth parameter is componentSize (8/16/32).
   6.97.1 asks for 8-bit components first on every route and verify_capture_depth owns that
   rule; B here keeps the two facts this file's own subject rests on — 6.168.0's list cannot
   read the owner's document at any size, and the shipped list can.

   AND WHEN IT STILL FAILS, IT SAYS WHY. captureRegion now answers { error, bounds, mode }, the
   routes say which of them answered, and capFail puts the reason, the rectangle and the
   document's mode in the sentence the student reads.

   WHERE THE SELECTION IS: the Selection card draws the document as a box with the marked
   rectangle on it — explicit pixels, because a UXP box may decline to resolve a percentage —
   says where it sits, and gives Check a second job: read those pixels and show them. A capture
   that would fail now fails BEFORE the money.

   SHORTER: that one card replaces four blocks (the Required Images heading, the tick row, the
   instruction paragraph and the Selection row), the workflow's paragraph opens at three lines
   with a More, and the four output pickers fold behind a header that says what they are set
   to. C5 measures it. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const HOST = read("panel/src/photoshop/photoshop-host.js");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const PCSS = read("panel/styles.css");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the rule, in the source ================= */
function sourcePins() {
  report("A1) a bounded route is ALWAYS offered — captureRegion and captureActiveLayer fall back to the region's own size when _capSize declines, and the unbounded route stays behind it",
    /var fit = cap \|\| \{ width: Math\.max\(1, Math\.round\(bounds\.width\)\), height: Math\.max\(1, Math\.round\(bounds\.height\)\) \};/.test(HOST) &&
    /reqs\.push\(\{ sourceBounds: sb, targetSize: fit \}\);\s*\n\s*reqs\.push\(\{ sourceBounds: sb \}\);/.test(HOST) &&
    /var fit = cap \|\| \{ width: Math\.max\(1, Math\.round\(Number\(w\) \|\| 0\)\), height: Math\.max\(1, Math\.round\(Number\(h\) \|\| 0\)\) \};/.test(HOST) &&
    /var CAP_MAX = 2048;/.test(HOST), null);

  report("A2) a refusal carries its facts — the routes say which one answered, and captureRegion's catch returns the reason, the rectangle and the document's own mode (read outside the modal, so a throw cannot lose it)",
    /if \(got\) got\.via = "getPixels " \+ \(i \+ 1\) \+ "\/" \+ reqs\.length;/.test(HOST) &&
    /* 6.97.1 — the reasons are collected by SENTENCE now (six routes refusing for the same
       reason filled the student's 140 characters six times); verify_capture_depth owns that. */
    /keep\("getPixels " \+ \(i \+ 1\) \+ "\/" \+ reqs\.length, _emsg\(e\)\);/.test(HOST) &&
    /return \{ error: _emsg\(e\), bounds: \{ width: bounds\.width, height: bounds\.height \}, mode: mode \|\| "\?" \};/.test(HOST) &&
    HOST.indexOf('var mode = "";\n  try { mode = String((ps.app.activeDocument && ps.app.activeDocument.mode) || ""); }') > 0, null);

  report("A3) the screen says it out loud — capFail joins the reason, the rectangle and the mode onto ai_wf_capture_fail, and BOTH of doGenerate's refusal paths go through it",
    /function capFail\(cap, b\) \{/.test(SCREEN) &&
    /if \(cap && cap\.error\) bits\.push\(String\(cap\.error\)\.slice\(0, 140\)\);/.test(SCREEN) &&
    /if \(cap && cap\.mode\) bits\.push\(String\(cap\.mode\)\);/.test(SCREEN) &&
    /if \(!cap \|\| !cap\.ref\) \{ hint\(capFail\(cap, b\)\); return; \}/.test(SCREEN) &&
    /\}\)\.catch\(function \(e\) \{ hint\(capFail\(\{ error: \(e && e\.message\) \|\| String\(e\) \}, rb\)\); \}\);/.test(SCREEN) &&
    !/ai_wf_capture_fail", "Could not read the selected pixels[^"]*"\)\); return; \}/.test(SCREEN), null);

  report("A4) the Selection card: the map (document box + marked rectangle), the numbers, the pixels Check read, and its own tick — with L_SEL_POS · L_SEL_READ · L_SEL_PIX · L_MORE · L_LESS in all nine languages",
    /function selectionCard\(inp\) \{/.test(SCREEN) &&
    ['hnkWfSelCard', 'hnkWfSelMap', 'hnkWfSelPage', 'hnkWfSelRect', 'hnkWfSelNum', 'hnkWfSelShot', 'hnkWfSelCheck', 'hnkWfSelState']
      .every((id) => SCREEN.indexOf('id: "' + id + '"') >= 0) &&
    /class: "hnk-req-block hnk-sel-card", id: "hnkWfSelCard"/.test(SCREEN) &&
    /var k = Math\.min\(104 \/ W, 78 \/ H\);/.test(SCREEN) &&
    /rect\.style\.left = Math\.max\(0, Math\.min\(pw - rw, Math\.round\(b\.x \* k\)\)\) \+ "px";/.test(SCREEN) &&
    /Promise\.resolve\(deps\.host\.captureRegion\(b\)\)\.then\(function \(cap\) \{/.test(SCREEN) &&
    /selTxt\.textContent = capFail\(cap, b\);/.test(SCREEN) &&
    ["L_SEL_POS", "L_SEL_READ", "L_SEL_PIX", "L_MORE", "L_LESS"].every((k) => {
      const line = (SCREEN.match(new RegExp("var " + k + " = \\{[^\\n]*")) || [""])[0];
      return LANGS.every((l) => new RegExp("\\b" + l + ': "').test(line));
    }), null);

  report("A5) shorter by construction — a region workflow draws no Required Images heading, the paragraph opens clamped with a More beside it, and the four pickers are a fold whose header carries what they are set to",
    /if \(!wf\.region\) root\.appendChild\(dom\.el\(doc, "div", \{ class: "hnk-sec", text: dom\.t\("ai_req_images"/.test(SCREEN) &&
    /if \(wf\.region && inp\.image && inp\.image\.source === "selection"\) reqWrap\.appendChild\(selectionCard\(inp\)\);/.test(SCREEN) &&
    /class: "hnk-wf-desc hnk-wf-about is-clamp", id: "hnkWfDesc"/.test(SCREEN) &&
    /if \(!descOpen\) ellFit\(root, "\.hnk-wf-about", 3\);/.test(SCREEN) &&
    /descMore\.style\.display = \(descOpen \|\| desc\.querySelector\("\.ell"\)\) \? "" : "none";/.test(SCREEN) &&
    /id: "hnkWfOptsH"/.test(SCREEN) && /function optsSummary\(\) \{/.test(SCREEN) &&
    /\.hnk-wf-opts \{ display: none; margin: 8px 0 10px; \}/.test(PCSS) &&
    /\.hnk-wf-opts\.on \{ display: block; \}/.test(PCSS) &&
    /\.hnk-wf-about\.is-clamp \{ max-height: 4\.6em; overflow: hidden; \}/.test(PCSS) &&
    /\.hnk-sel-page \{ position: relative; width: 104px; height: 78px;/.test(PCSS) &&
    !/\.hnk-sel-(card|page|rect|body|map|side)[^}]*\bgap:/.test(PCSS), null);
}

/* ================= B) the host, run — the owner's document ================= */
/* A fake Photoshop that behaves the way the owner's 16-bit RAW behaves: getPixels hands
   back the DOCUMENT's own depth unless the ask names componentSize, and the JPEG encoder
   refuses anything that is not 8-bit. A targetSize changes how many pixels come back and
   nothing else — which is exactly what the photograph of 6.168.0's refusal proved. */
function fakePhotoshop(rec) {
  return {
    app: { documents: [{}], activeDocument: { id: 7, mode: "RGBColorMode", width: 4160, height: 6240 } },
    core: { executeAsModal: async function (fn) { return await fn(); } },
    action: { batchPlay: async function () { return []; } },
    constants: {},
    imaging: {
      getPixels: async function (req) {
        rec.asked.push((req.componentSize === 8 ? "8bit" : "asis") + (req.targetSize ? "+fit" : ""));
        return { imageData: { width: 10, height: 10, depth: req.componentSize || 16, dispose: function () { } } };
      },
      encodeImageData: async function (o) {
        if (o.imageData.depth !== 8) throw new Error("Only 8 bit image data can be encoded as jpeg");
        return "QUJD";
      }
    }
  };
}
function loadHost(ps) {
  const sandbox = {
    module: { exports: {} }, console: console, Promise: Promise, Math: Math, Buffer: Buffer,
    Number: Number, String: String, Error: Error, Uint8Array: Uint8Array, JSON: JSON, Date: Date,
    RegExp: RegExp, Object: Object, Array: Array, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    require: function (n) {
      if (n === "photoshop") return ps;
      if (n === "uxp") return { storage: { localFileSystem: {}, formats: { utf8: "utf8", binary: "binary" } } };
      throw new Error("no module " + n);
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(HOST, sandbox, { filename: "photoshop-host.js" });
  return sandbox.module.exports;
}
/* 6.168.0's list, verbatim — a bounded ask and a plain one, neither of them naming a depth.
   This is the list the owner photographed refusing 4036×4036. */
async function oldRoutes(ps, bounds) {
  const CAP = 2048, m = Math.max(bounds.width, bounds.height);
  const cap = m > CAP ? { width: Math.round(bounds.width * CAP / m), height: Math.round(bounds.height * CAP / m) } : null;
  const sb = { left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height };
  const fit = cap || { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  const reqs = [{ sourceBounds: sb, targetSize: fit }];
  reqs.push({ sourceBounds: sb });
  for (const r of reqs) {
    try {
      const pix = await ps.imaging.getPixels(r);
      return { ref: "data:image/jpeg;base64," + await ps.imaging.encodeImageData({ imageData: pix.imageData, base64: true }) };
    } catch (e) { /* the next route, or none */ }
  }
  return null;
}
async function hostRun() {
  const RECTS = [
    { name: "1191×1191", b: { x: 1200, y: 900, width: 1191, height: 1191 } },
    { name: "1208×1208", b: { x: 1000, y: 700, width: 1208, height: 1208 } },
    { name: "4036×4036", b: { x: 174, y: 685, width: 4036, height: 4036 } }
  ];
  const old = {}, now = {};
  for (const r of RECTS) {
    const rec = { asked: [] };
    old[r.name] = !!(await oldRoutes(fakePhotoshop(rec), r.b));
  }
  let via = "", mode = "", err = "", bnds = null;
  for (const r of RECTS) {
    const rec = { asked: [] };
    const api = loadHost(fakePhotoshop(rec));
    const got = await api.captureRegion(r.b);
    now[r.name] = { ok: !!(got && got.ref), asked: rec.asked.join(","), via: (got && got.via) || "" };
    if (r.name === "4036×4036") via = now[r.name].via;
  }
  /* and a Photoshop that refuses every route: the answer must still carry the facts */
  const dead = loadHost({
    app: { documents: [{}], activeDocument: { mode: "CMYK", width: 100, height: 100 } },
    core: { executeAsModal: async function (fn) { return await fn(); } },
    action: { batchPlay: async function () { return []; } }, constants: {},
    imaging: { getPixels: async function () { throw new Error("imaging is not available here"); }, encodeImageData: async function () { return ""; } }
  });
  const ref = await dead.captureRegion({ x: 0, y: 0, width: 640, height: 480 });
  err = (ref && ref.error) || ""; mode = (ref && ref.mode) || ""; bnds = ref && ref.bounds;

  report("B1) THE PHOTOGRAPH, REPRODUCED: 6.168.0's route list cannot read this document at ANY size — 4036×4036 carried a targetSize and refused with the encoder's own sentence, which is what the owner photographed",
    old["1191×1191"] === false && old["1208×1208"] === false && old["4036×4036"] === false, old);
  report("B2) and with this one every rectangle is read, because the depth is asked for before anything else",
    now["1191×1191"].ok && now["1208×1208"].ok && now["4036×4036"].ok &&
    now["1191×1191"].asked.indexOf("8bit") === 0 && now["4036×4036"].asked.indexOf("8bit") === 0, now);
  report("B3) a success says which route answered, so a refusal and a success are read against the same list",
    /^getPixels \d+\/\d+$/.test(via), { via });
  report("B4) a host that refuses every route answers with the reason, the rectangle and the document's mode — never with nothing",
    /imaging is not available here/.test(err) && mode === "CMYK" && bnds && bnds.width === 640 && bnds.height === 480,
    { err, mode, bnds });
}

/* ================= C) the panel, walked ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  try {
    await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(1400);

    const out = await page.evaluate(async () => {
      const PIX = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
      const wfs = HNK.aiToolsApp.workflowScreen();
      const host = HNK.photoshopHost;
      const orig = { g: host.getSelectionBounds, c: host.captureRegion, s: host.canvasSize };
      host.canvasSize = () => ({ width: 6240, height: 4160 });
      host.getSelectionBounds = async () => ({ x: 1560, y: 1040, width: 1191, height: 1191 });
      host.captureRegion = async () => ({ ref: PIX, width: 1191, height: 1191, via: "getPixels 1/2" });
      wfs.select("region-edit"); await new Promise((r) => setTimeout(r, 900));
      const o = {};
      const id = (x) => document.getElementById(x);
      o.card = !!id("hnkWfSelCard");
      o.heading = Array.from(document.querySelectorAll("#hnkAiToolsRoot .hnk-sec")).map((e) => e.textContent).join("|");
      o.tallBefore = Math.round(document.querySelector("#hnkAiToolsRoot .hnk-screen").getBoundingClientRect().height);

      /* the map, on Check */
      id("hnkWfSelCheck").click(); await new Promise((r) => setTimeout(r, 400));
      const pg = id("hnkWfSelPage"), rc = id("hnkWfSelRect");
      const pr = pg.getBoundingClientRect(), rr = rc.getBoundingClientRect();
      o.map = { pw: Math.round(pr.width), ph: Math.round(pr.height), rw: Math.round(rr.width), rh: Math.round(rr.height),
        dx: Math.round(rr.left - pr.left), dy: Math.round(rr.top - pr.top), shown: getComputedStyle(id("hnkWfSelMap")).display };
      o.num = id("hnkWfSelNum").textContent;
      o.state = id("hnkWfSelState").textContent;
      o.cls = id("hnkWfSelCard").className;
      o.shot = { shown: getComputedStyle(id("hnkWfSelShot")).display, src: (id("hnkWfSelShot").querySelector("img") || {}).src || "",
        cap: id("hnkWfSelShotCap").textContent };

      /* a capture that refuses: the sentence carries the reason, the rectangle and the mode */
      host.captureRegion = async () => ({ error: "Cannot encode 16-bit data as JPEG", bounds: { width: 1191, height: 1191 }, mode: "RGB16" });
      id("hnkWfSelCheck").click(); await new Promise((r) => setTimeout(r, 400));
      o.fail = { cls: id("hnkWfSelCard").className, txt: id("hnkWfSelState").textContent, shot: getComputedStyle(id("hnkWfSelShot")).display };

      /* no rectangle at all */
      host.getSelectionBounds = async () => null;
      id("hnkWfSelCheck").click(); await new Promise((r) => setTimeout(r, 300));
      o.none = { cls: id("hnkWfSelCard").className, txt: id("hnkWfSelState").textContent, map: getComputedStyle(id("hnkWfSelMap")).display };

      /* the paragraph and the fold */
      o.desc = { clamped: /is-clamp/.test(id("hnkWfDesc").className), ell: !!id("hnkWfDesc").querySelector(".ell"),
        h: Math.round(id("hnkWfDesc").getBoundingClientRect().height), more: id("hnkWfDescMore").textContent };
      o.opts = { head: id("hnkWfOptsH").textContent, closed: Math.round(id("hnkWfOpts").getBoundingClientRect().height) };
      id("hnkWfOptsH").click(); await new Promise((r) => setTimeout(r, 250));
      o.opts.open = Math.round(id("hnkWfOpts").getBoundingClientRect().height);
      o.opts.rail = document.querySelectorAll("#wfRatioRail .rchip").length;
      id("hnkWfOptsH").click(); await new Promise((r) => setTimeout(r, 200));
      id("hnkWfDescMore").click(); await new Promise((r) => setTimeout(r, 250));
      o.descOpen = { clamped: /is-clamp/.test(id("hnkWfDesc").className), h: Math.round(id("hnkWfDesc").getBoundingClientRect().height),
        ell: !!id("hnkWfDesc").querySelector(".ell"), less: id("hnkWfDescMore").textContent };
      id("hnkWfDescMore").click(); await new Promise((r) => setTimeout(r, 250));
      o.tall = Math.round(document.querySelector("#hnkAiToolsRoot .hnk-screen").getBoundingClientRect().height);

      /* a workflow with no region draws no card and keeps its heading */
      id("hnkWfBack").click(); await new Promise((r) => setTimeout(r, 300));
      wfs.select("upscale"); await new Promise((r) => setTimeout(r, 500));
      o.plain = { card: !!id("hnkWfSelCard"), heading: Array.from(document.querySelectorAll("#hnkAiToolsRoot .hnk-sec")).map((e) => e.textContent).join("|") };
      id("hnkWfBack").click(); await new Promise((r) => setTimeout(r, 200));
      host.getSelectionBounds = orig.g; host.captureRegion = orig.c; host.canvasSize = orig.s;
      return o;
    });

    /* 6240 × 4160 into a 104 × 78 frame: k = 104/6240 = 0.016667, so the page is
       104 × 69 and a 1191 px rectangle at (1560, 1040) is 20 × 20 at (26, 17). */
    const m = out.map;
    report("C1) WHERE THE SELECTION IS: the card draws the document to scale (104 × 69 for a 6240 × 4160 page) with the marked rectangle on it at the right size and the right place, and says x · y · the page's own size",
      out.card && m.shown !== "none" && m.pw === 104 && Math.abs(m.ph - 69) <= 1 &&
      Math.abs(m.rw - 20) <= 1 && Math.abs(m.rh - 20) <= 1 && Math.abs(m.dx - 26) <= 1 && Math.abs(m.dy - 17) <= 1 &&
      /1560/.test(out.num) && /1040/.test(out.num) && /6240/.test(out.num) && /4160/.test(out.num), { m, num: out.num });
    report("C2) and Check reads those pixels BEFORE the money: the card turns green, shows the picture it read and names the route that answered",
      / ok$/.test(out.cls) && /1191 × 1191 px/.test(out.state) && out.shot.shown !== "none" &&
      /^data:image\/jpeg/.test(out.shot.src) && /getPixels 1\/2/.test(out.shot.cap), { cls: out.cls, state: out.state, shot: out.shot });
    report("C3) a refusal names itself — the reason, the rectangle and the document's mode, in the line the student reads; and no stale picture is left behind",
      / none$/.test(out.fail.cls) && /Cannot encode 16-bit data as JPEG/.test(out.fail.txt) &&
      /1191×1191 px/.test(out.fail.txt) && /RGB16/.test(out.fail.txt) && out.fail.shot === "none" &&
      / none$/.test(out.none.cls) && out.none.map === "none", { fail: out.fail, none: out.none });
    report("C4) the paragraph opens at three lines with a cut it marks, More opens the whole of it and closes it again; the four pickers are shut until their header is tapped and the rail is painted when they open",
      out.desc.clamped && out.desc.ell && out.desc.h <= 60 &&
      !out.descOpen.clamped && out.descOpen.h > out.desc.h && !out.descOpen.ell &&
      out.descOpen.less !== out.desc.more &&
      out.opts.closed === 0 && out.opts.open > 120 && out.opts.rail > 3 &&
      /—/.test(out.opts.head), { desc: out.desc, descOpen: out.descOpen, opts: out.opts });
    report("C5) SHORTER: a region workflow carries no Required Images heading (a plain workflow still does, and draws no card), and the whole page fits well under the 1,117 px it measured on 6.167.4",
      out.heading.indexOf("Required") < 0 && !/လိုအပ်သော/.test(out.heading) &&
      out.plain.card === false && out.plain.heading.length > 0 &&
      out.tall > 0 && out.tall < 1000, { heading: out.heading, plain: out.plain, tall: out.tall, before: out.tallBefore });
    report("C6) nothing threw while all of that ran", errs.length === 0, errs.slice(0, 4));
  } finally {
    await page.close(); await ctx.close(); server.close();
  }
}

/* ================= D) the release ================= */
function releasePins() {
  /* 6.97.1 — the pin is the AGREEMENT, not the number: a frozen literal here only ever
     means the next wave edits this file to say a different frozen literal. */
  const app = (read("docs/app/index.html").match(/var APP_VER="([\d.]+)";/) || [])[1];
  const pan = (read("panel/main.js").match(/PANEL_VERSION *= *"([\d.]+)"/) || [])[1];
  const esc = (v) => String(v).replace(/\./g, "\\.");
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  report("D1) the wave ships in lockstep — the app, its version.json, the panel, the panel manifest and the release manifest all name the same two versions — and the suite carries this file, counted on the landing page",
    !!app && !!pan && MANIFEST.version === pan &&
    new RegExp('"version": *"' + esc(pan) + '"').test(read("panel/manifest.json")) &&
    new RegExp('"v":"' + esc(app) + '"').test(read("docs/app/version.json")) &&
    steps.has("node test/verify_selection_shown.js") &&
    String(steps.size) === badge, { app, pan, manifest: MANIFEST.version, steps: steps.size, badge });
}

(async () => {
  sourcePins();
  await hostRun();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures === 0 ? "ALL PASS" : failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
