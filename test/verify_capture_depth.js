/* verify_capture_depth.js — 6.97.1 / panel 6.168.1
   COMPONENTSIZE IS THE BIT DEPTH — THE SELECTION CAPTURE ITSELF.

   6.168.0 gave the refusal its reason. The owner photographed the reason, and it
   disproved the fix that shipped with it:

       Could not read the selected pixels — try again. — Error: getPixels 1/2: encode
       Only 8 bit image data can be encoded as jpeg | getPixels 2/2: encode Only 8 bit
       image data can be encoded as jp · 4036×4036 px · RGBColorMode

   on DSCF1266.RAF, 4160×6240, with the Selection card showing x 174 · y 685. 4036 is
   ABOVE the 2048 cap, so route 1 carried targetSize 2048×2048 — and refused with the
   same sentence as the plain route behind it. 6.168.0 had claimed that a targetSize
   makes Photoshop resample and that a resample is 8 bits. It does not. targetSize
   bounds the pixel COUNT; the imaging API's own depth parameter is componentSize
   (8 / 16 / 32), and a 16-bit document stays 16-bit at every size until it is asked
   for 8. The same photographs show captureActiveLayer getting through on that document
   only "via saved-copy · 1773ms · 3561 KB" — every getPixels route it had refused too.

   THREE CHANGES, and the test carries each one:
     · componentSize: 8 is asked FIRST on every route, in captureRegion and in
       captureActiveLayer; the depth-silent routes stay behind them for a host that
       rejects the parameter (A1, B1, B2, B6);
     · captureRegion gets a tail that never touches ps.imaging, the way a layer capture
       already had one: Photoshop duplicates the document merged, the DUPLICATE is
       cropped to the marked rectangle, Photoshop writes the JPEG and the panel reads
       the bytes back. The open file is never the crop target — the duplicate has to
       become the active document, with an id of its own, or the route refuses before
       it crops anything (A2, B3, B4);
     · the reasons are collected by SENTENCE, not by route. Six routes refusing for the
       same reason spent the student's 140 characters saying it six times (A3, B5). */
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
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the rule, in the source ================= */
function sourcePins() {
  report("A1) the depth is asked for FIRST — componentSize: 8 leads every route list in captureRegion and in captureActiveLayer, and the depth-silent routes stay behind them",
    /reqs\.push\(\{ sourceBounds: sb, targetSize: fit, componentSize: 8 \}\);\s*\n\s*reqs\.push\(\{ sourceBounds: sb, componentSize: 8 \}\);/.test(HOST) &&
    /if \(id != null\) reqs\.push\(\{ layerID: id, targetSize: fit, componentSize: 8 \}\);\s*\n\s*reqs\.push\(\{ targetSize: fit, componentSize: 8 \}\);/.test(HOST) &&
    /reqs\.push\(\{ sourceBounds: sb, targetSize: fit, componentSize: 8, colorSpace: "RGB" \}\)/.test(HOST) &&
    /reqs\.push\(\{ layerID: id, targetSize: fit, componentSize: 8, colorSpace: "RGB" \}\)/.test(HOST) &&
    HOST.indexOf('reqs.push({ sourceBounds: sb, componentSize: 8 });') < HOST.indexOf('reqs.push({ sourceBounds: sb, targetSize: fit });') &&
    /componentSize is the depth/.test(HOST), null);

  report("A2) the region gets a tail of its own: the DUPLICATE is cropped, never the open document — no new id, no crop — and it is closed without saving whatever happened",
    /async function _viaCroppedCopy\(ps, uxp, bounds\) \{/.test(HOST) &&
    /_obj: "duplicate"/.test(HOST) && /merged: true/.test(HOST) &&
    /if \(!dup \|\| dup\.id == null \|\| dup\.id === origId\) throw new Error\(/.test(HOST) &&
    /_obj: "crop"/.test(HOST) && /got\.via = "cropped-copy";/.test(HOST) &&
    /\} finally \{[\s\S]{0,400}_obj: "close",\s*\n\s*saving: \{ _enum: "yesNo", _value: "no" \}/.test(HOST) &&
    /return _viaCroppedCopy\(ps, uxp, bounds\);/.test(HOST) &&
    /_captureRoutes\(ps, uxp, reqs, w, h, true\)/.test(HOST), null);

  report("A3) a reason is kept once, with the routes that gave it — not once per route",
    /var keep = function \(label, msg\) \{/.test(HOST) &&
    /for \(var j = 0; j < why\.length; j\+\+\) if \(why\[j\]\.msg === msg\) \{ why\[j\]\.at\.push\(label\); return; \}/.test(HOST) &&
    /keep\("getPixels " \+ \(i \+ 1\) \+ "\/" \+ reqs\.length, _emsg\(e\)\);/.test(HOST) &&
    /keep\("saved copy", _emsg\(e2\)\);/.test(HOST) &&
    /lines\.push\(why\[k\]\.at\.join\(" \+ "\) \+ ": " \+ why\[k\]\.msg\);/.test(HOST), null);
}

/* ================= B) the host, run ================= */
/* The owner's document: 4160×6240, RGBColorMode, 16 bits per component. getPixels hands
   back the document's own depth unless the ask names componentSize, and the JPEG encoder
   refuses anything that is not 8-bit — the encoder's own sentence, verbatim. */
function fakePS(rec, opt) {
  opt = opt || {};
  const doc = { id: 7, mode: opt.mode || "RGBColorMode", width: 4160, height: 6240,
    activeLayers: [{ id: 3, name: "Background" }] };
  const state = { active: doc };
  return {
    app: { documents: [doc], get activeDocument() { return state.active; } },
    core: { executeAsModal: async function (fn) { return await fn(); } },
    constants: {},
    action: {
      batchPlay: async function (cmds) {
        for (const c of cmds) {
          rec.play.push(c._obj);
          if (c._obj === "duplicate" && !opt.duplicateFails) state.active = { id: 99, width: 4036, height: 4036 };
          if (c._obj === "crop") rec.crop = c.to;
          if (c._obj === "close") { rec.closedId = c._target && c._target[0] && c._target[0]._id; state.active = doc; }
        }
        return [];
      }
    },
    imaging: {
      getPixels: async function (req) {
        rec.asked.push(req);
        if (opt.imagingDead) throw new Error("imaging is not available here");
        /* neverEight: a host that takes componentSize and ignores it — every route
           then fails with the one sentence the owner photographed */
        return { imageData: { width: 10, height: 10, depth: (opt.neverEight ? 16 : req.componentSize || 16), dispose: function () { } } };
      },
      encodeImageData: async function (o) {
        if (o.imageData.depth !== 8) throw new Error("Only 8 bit image data can be encoded as jpeg");
        return "QUJD";
      }
    }
  };
}
/* a temporary folder Photoshop can write its JPEG into */
function fakeUXP(rec) {
  const file = { name: "hnk_capture.jpg", read: async () => new Uint8Array([255, 216, 255, 217]).buffer };
  return { storage: {
    formats: { utf8: "utf8", binary: "binary" },
    localFileSystem: {
      getTemporaryFolder: async () => ({ createFile: async (n, o) => { rec.wrote = n + (o && o.overwrite ? " (overwrite)" : ""); return file; } }),
      createSessionToken: () => "tok"
    } } };
}
function loadHost(ps, uxp) {
  const sandbox = {
    module: { exports: {} }, console: console, Promise: Promise, Math: Math, Buffer: Buffer,
    Number: Number, String: String, Error: Error, Uint8Array: Uint8Array, JSON: JSON, Date: Date,
    RegExp: RegExp, Object: Object, Array: Array, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    require: function (n) {
      if (n === "photoshop") return ps;
      /* uxp === false is a host with no storage at all: the tail route cannot run,
         so the refusal is the getPixels reasons and nothing else */
      if (n === "uxp" && uxp === false) throw new Error("no uxp here");
      if (n === "uxp") return uxp || { storage: { localFileSystem: {}, formats: { utf8: "utf8", binary: "binary" } } };
      throw new Error("no module " + n);
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(HOST, sandbox, { filename: "photoshop-host.js" });
  return sandbox.module.exports;
}
const REGION = { x: 174, y: 685, width: 4036, height: 4036 };

async function hostRun() {
  /* B1 — the region, on the owner's document */
  let rec = { asked: [], play: [] };
  let got = await loadHost(fakePS(rec), fakeUXP(rec)).captureRegion(REGION);
  const first = rec.asked[0] || {};
  report("B1) THE SELECTION IS READ: on a 16-bit document the first ask names componentSize 8 and it is the one that answers — the bounded shape that 6.168.0 photographed refusing is still there, behind it",
    !!(got && got.ref) && first.componentSize === 8 && !!first.targetSize && !!first.sourceBounds &&
    rec.asked.length === 1 && /^getPixels 1\/\d+$/.test(got.via || ""), { via: got && got.via, first, n: rec.asked.length, err: got && got.error });

  /* B2 — the layer, on the same document (the photograph's "via saved-copy") */
  rec = { asked: [], play: [] };
  const lay = await loadHost(fakePS(rec), fakeUXP(rec)).captureActiveLayer();
  report("B2) and so is the active layer — the route that only the flattened save could answer on 6.168.0 is answered by imaging now, with the layer's name kept",
    !!(lay && lay.ref) && (rec.asked[0] || {}).componentSize === 8 && lay.name === "Background" &&
    rec.play.indexOf("save") < 0, { via: lay && lay.via, name: lay && lay.name, play: rec.play });

  /* B3 — imaging refuses everything: the region's own saved copy */
  rec = { asked: [], play: [] };
  got = await loadHost(fakePS(rec, { imagingDead: true }), fakeUXP(rec)).captureRegion(REGION);
  report("B3) when imaging refuses every route the region is still read — the document is duplicated MERGED, the duplicate is cropped to the marked rectangle, Photoshop writes the JPEG and the duplicate is closed; the answer is the rectangle's own size",
    !!(got && got.ref) && got.via === "cropped-copy" && got.width === 4036 && got.height === 4036 &&
    rec.play.join(",") === "duplicate,crop,save,close" && rec.closedId === 99 &&
    rec.crop && rec.crop.left._value === 174 && rec.crop.top._value === 685 &&
    rec.crop.right._value === 4210 && rec.crop.bottom._value === 4721 &&
    /^data:image\/jpeg;base64,/.test(got.ref), { via: got && got.via, play: rec.play, crop: rec.crop, err: got && got.error });

  /* B4 — the open document is never the crop target */
  rec = { asked: [], play: [] };
  got = await loadHost(fakePS(rec, { imagingDead: true, duplicateFails: true }), fakeUXP(rec)).captureRegion(REGION);
  report("B4) THE OPEN FILE IS NEVER CROPPED: where the duplicate does not become a new document of its own the route refuses before it crops anything, and the refusal says so",
    rec.play.join(",") === "duplicate" && !(got && got.ref) &&
    /saved copy: the duplicate never became/.test((got && got.error) || ""), { play: rec.play, err: got && got.error });

  /* B5 — one sentence, once. A host that accepts componentSize and ignores it refuses
     all four routes with the encoder's own line; _emsg keeps 140 characters. */
  const err = (got && got.error) || "";
  const enc = (await loadHost(fakePS({ asked: [], play: [] }, { neverEight: true }), false).captureRegion(REGION)).error || "";
  report("B5) a reason is said ONCE, naming every route that gave it — four routes refusing for the same reason no longer spend the whole 140 characters saying it four times",
    /^getPixels 1\/4 \+ getPixels 2\/4 \+ getPixels 3\/4 \+ getPixels 4\/4: encode Only 8 bit image data can be encoded as jpeg$/.test(enc) &&
    enc.indexOf("Only 8 bit") === enc.lastIndexOf("Only 8 bit") && enc.length < 140 &&
    err.split("imaging is not available here").length === 2, { enc, encLen: enc.length, err });

  /* B6 — a CMYK document still asks for RGB first, now with the depth */
  rec = { asked: [], play: [] };
  await loadHost(fakePS(rec, { mode: "CMYKColorMode" }), fakeUXP(rec)).captureRegion(REGION);
  report("B6) a non-RGB document still asks for RGB pixels first — with the depth named in the same breath",
    (rec.asked[0] || {}).colorSpace === "RGB" && (rec.asked[0] || {}).componentSize === 8, { first: rec.asked[0] });
}

/* ================= C) the panel ================= */
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
      host.canvasSize = () => ({ width: 4160, height: 6240 });
      host.getSelectionBounds = async () => ({ x: 174, y: 685, width: 4036, height: 4036 });
      host.captureRegion = async () => ({ ref: PIX, width: 4036, height: 4036, via: "cropped-copy" });
      wfs.select("region-edit"); await new Promise((r) => setTimeout(r, 900));
      const id = (x) => document.getElementById(x);
      const o = {};
      id("hnkWfSelCheck").click(); await new Promise((r) => setTimeout(r, 400));
      o.ok = { cls: id("hnkWfSelCard").className, cap: id("hnkWfSelShotCap").textContent,
        shown: getComputedStyle(id("hnkWfSelShot")).display, state: id("hnkWfSelState").textContent };

      host.captureRegion = async () => ({
        error: "getPixels 1/4 + getPixels 2/4 + getPixels 3/4 + getPixels 4/4: encode Only 8 bit image data can be encoded as jpeg",
        bounds: { width: 4036, height: 4036 }, mode: "RGBColorMode" });
      id("hnkWfSelCheck").click(); await new Promise((r) => setTimeout(r, 400));
      o.fail = { cls: id("hnkWfSelCard").className, txt: id("hnkWfSelState").textContent };
      host.getSelectionBounds = orig.g; host.captureRegion = orig.c; host.canvasSize = orig.s;
      return o;
    });

    report("C1) the card names the route that answered — a cropped copy says so under the picture it read",
      / ok$/.test(out.ok.cls) && /cropped-copy/.test(out.ok.cap) && out.ok.shown !== "none" &&
      /4036 × 4036 px/.test(out.ok.state), out.ok);
    report("C2) and a refusal still reads as one sentence: the reason, the rectangle and the document's mode, inside the 140 characters the card keeps for it",
      / none$/.test(out.fail.cls) && /Only 8 bit image data/.test(out.fail.txt) &&
      out.fail.txt.indexOf("Only 8 bit") === out.fail.txt.lastIndexOf("Only 8 bit") &&
      /4036×4036 px/.test(out.fail.txt) && /RGBColorMode/.test(out.fail.txt), out.fail);
    report("C3) nothing threw while all of that ran", errs.length === 0, errs.slice(0, 4));
  } finally {
    await page.close(); await ctx.close(); server.close();
  }
}

/* ================= D) the release ================= */
function releasePins() {
  const app = (read("docs/app/index.html").match(/var APP_VER="([\d.]+)";/) || [])[1];
  const pan = (read("panel/main.js").match(/PANEL_VERSION *= *"([\d.]+)"/) || [])[1];
  const esc = (v) => String(v).replace(/\./g, "\\.");
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  report("D1) the wave ships in lockstep and the suite carries this file, counted on the landing page",
    !!app && !!pan && MANIFEST.version === pan &&
    new RegExp('"version": *"' + esc(pan) + '"').test(read("panel/manifest.json")) &&
    new RegExp('"v":"' + esc(app) + '"').test(read("docs/app/version.json")) &&
    steps.has("node test/verify_capture_depth.js") &&
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
