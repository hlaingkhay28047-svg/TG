/* verify_panel_selection_results.js — 6.84.0 / panel 6.155.0
   SELECTION EDIT RESULTS, AND THE ACTIVE LAYER CHECKED.

   The owner asked two things of 6.154.0: "Selection Edit မှာလဲ Results
   Before/After ထည့်ပေးပါ" and "ccx မှာ image slots Active နဲ့ အလုပ်လုပ်တာလား
   စစ်ပေးပါ".

     1. A Selection Edit (region-edit) result joins the wizard's Results card
        with the selected pixels as Before. The record carries the rectangle
        it was cut from (regionBounds) and that it came from a selection
        (inputSource), so the compare tag says "Selection", the line names
        Selection W×H, and "Place into Photoshop again" lands at the exact
        selection under a mask — never fitted to the page.
     2. The Active-layer read. The Smart Workflow slots read it through
        photoshop-host.captureActiveLayer (four getPixels shapes, then a
        flattened saved copy); Freeform / the classic slots / Retouch / Path
        read it through main.js captureLayerB64, one shape, which refused a
        layer group or a CMYK/Lab document. captureLayerB64 now falls back to
        the host's routes; a non-RGB document asks imaging for RGB pixels
        first; the slot's tick names the layer and its size; and Setup's
        SELF-TEST gets a "Layer capture" row that runs the very capture the
        slots use and prints name · size · route · ms, or the exact refusal.

   Fault-injected while writing: regionBounds dropped from the record fails
   A1/C1; placeResult's region argument removed fails A2/C2; the tick text
   reverted to "✓" fails C3; the captureLayerB64 fallback removed fails A4/C4;
   the SELF-TEST row removed fails A5/C5. */
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

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const BOOT = read("panel/src/app/bootstrap.js");
const WFRES = read("panel/src/app/wf-results.js");
const HOST = read("panel/src/photoshop/photoshop-host.js");
const IMPORT = read("panel/src/photoshop/image-import-service.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

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
function pngRGB(w, h, shade) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 3, shade); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const URL_A = "data:image/png;base64," + pngRGB(40, 60, 0x40).toString("base64");
const URL_B = "data:image/png;base64," + pngRGB(40, 60, 0x80).toString("base64");
const REGION = { x: 10, y: 20, width: 40, height: 60 };

/* ---------------- A. source pins ---------------- */
function sourcePins() {
  report("A1) a wf-results entry carries the rectangle it was cut from (regionBounds, dropped when empty) and the input's source; bootstrap records both from the request (request.regionBounds, images[0].source)",
    /regionBounds: \(r\.regionBounds && r\.regionBounds\.width > 0 && r\.regionBounds\.height > 0\)/.test(WFRES) && /inputSource: String\(r\.inputSource \|\| ""\)/.test(WFRES) &&
    /regionBounds: request\.regionBounds \|\| null, inputSource: firstSrc,/.test(BOOT) && /var firstSrc = \(request\.images && request\.images\[0\] && request\.images\[0\]\.source\) \|\| "";/.test(BOOT), null);
  report("A2) placeResult takes the region and hands it to the masked placement (never null for a Selection Edit result); the card passes the entry's region on Place again",
    /async function placeResult\(ref, workflowId, modelId, regionBounds\)/.test(BOOT) &&
    /regionBounds: \(regionBounds && regionBounds\.width > 0 && regionBounds\.height > 0\) \? regionBounds : null/.test(BOOT) &&
    /h\.placeResult\(sel\.after, wf\.id, sel\.model, sel\.regionBounds \|\| null\)/.test(SCREEN), null);
  const sel = /var L_SELECTION = \{([^\n]*)\};/.exec(SCREEN);
  report("A3) the compare tag says Selection for a region result (id hnkWfCmpTagBefore, IMAGE 1 otherwise), the line names Selection W×H, and the word is in nine languages",
    !!sel && LANGS.every(l => new RegExp("(^\\s*|[,{]\\s*)" + l + ': "').test(sel[1])) &&
    /id: "hnkWfCmpTagBefore", text: "\\u2190 Before \(" \+ \(sel\.inputSource === "selection" \|\| sel\.regionBounds \? l9\(L_SELECTION\) : "IMAGE 1"\) \+ "\)"/.test(SCREEN) &&
    /rb \? \(l9\(L_SELECTION\) \+ " " \+ rb\.width \+ "\\u00d7" \+ rb\.height\) : ""/.test(SCREEN), { sel: !!sel });
  report("A4) the Active layer: the host asks imaging for RGB pixels first on a non-RGB document (captureActiveLayer and captureRegion) and returns the layer's name; the import service keeps the name; the wizard stores width/height/name on the slot and the tick names the layer and its size; main.js captureLayerB64 falls back to the host's routes",
    /* 6.168.0 — the resample size is `fit`, not `cap`: _capSize answers only above the
       2048 cap, and a region under it needs a resample route too (that gap is the whole
       of "Selection Edit works sometimes"). verify_selection_shown owns that rule. */
    /var nonRgb = !!mode && !\/rgb\/i\.test\(mode\);/.test(HOST) && /reqs\.push\(\{ layerID: id, targetSize: fit, colorSpace: "RGB" \}\)/.test(HOST) && /reqs\.push\(\{ sourceBounds: sb, targetSize: fit, colorSpace: "RGB" \}\)/.test(HOST) &&
    /got\.name = String\(layer\.name \|\| ""\); got\.mode = mode;/.test(HOST) && /name: res\.name \? String\(res\.name\) : ""/.test(IMPORT) &&
    /width: slot\.width \|\| 0, height: slot\.height \|\| 0, name: slot\.name \|\| ""/.test(SCREEN) && /if \(okk && im0\.source === "active-layer"\)/.test(SCREEN) &&
    /async function captureLayerB64\(maxSide\) \{\s*try \{ return await captureLayerB64Direct\(maxSide\); \}/.test(MAIN) && /async function captureLayerB64Direct\(maxSide\)/.test(MAIN) &&
    /r = await host\.captureActiveLayer\(\);/.test(MAIN) && /if \(r === null\) throw e;/.test(MAIN), null);
  report("A5) SELF-TEST carries a \"Layer capture\" row: started on Setup entry (throttled) and on Run again, never at boot; it runs the host's captureActiveLayer and prints name · size · route · ms, REFUSED with the reason, or the host mark without a document",
    /let layerProbe = \{ state: "idle", at: 0, res: null \};/.test(MAIN) && /function hnkLayerProbeStart\(force\)/.test(MAIN) && /function hnkLayerProbeRow\(\)/.test(MAIN) &&
    /rows\.push\(hnkLayerProbeRow\(\)\);/.test(MAIN) && /hnkNetProbeStart\(false\); hnkLayerProbeStart\(false\);( hnkSaveProbeStart\(false\);)?( hnkPlaceProbeStart\(false\);)? renderSelfTest\(\);/.test(MAIN) /* 6.165.0 Save folder, 6.171.0 Place into Photoshop start here too */ &&
    /try \{ hnkLayerProbeStart\(true\); \} catch \(eL\) \{ \}/.test(MAIN) && /label: "Layer capture"/.test(MAIN) &&
    /detail: "REFUSED \\u2014 " \+ String\(r\.error\)\.slice\(0, 140\)/.test(MAIN) && /"no document open \\u2014 open a photo, select its layer, then Run again"/.test(MAIN) &&
    !/hnkLayerProbeStart\(\)[^\n]*setupApplyStatics/.test(MAIN), null);
  const wn = (APP.match(/\{ v:"6\.84\.0", kind:"page", ref:"pgWf",[\s\S]*?\} \},\n/) || [""])[0];
  const wnP = (WHATS.match(/\{ v:"6\.84\.0", kind:"page", ref:"pgWf",[\s\S]*?\} \},\n/) || [""])[0];
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A6) CI runs this test right after verify_panel_wf_results; the landing counts at least 219 tests; What's New carries the 6.84.0 page row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_selection_results.js") > CI.indexOf("node test/verify_panel_wf_results.js") && tests >= 219 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Selection Edit/.test(wn) && /Layer capture/.test(wn) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });
}

/* ---------------- B. in Node ---------------- */
function inNode() {
  const wr = require(path.join(PANEL, "src/app/wf-results.js"));
  const e1 = wr.record({ workflowId: "region-edit", before: URL_A, after: URL_B, regionBounds: REGION, inputSource: "selection" });
  const e2 = wr.record({ workflowId: "x", after: URL_B, regionBounds: { x: 0, y: 0, width: 0, height: 0 } });
  const e3 = wr.record({ workflowId: "x", after: URL_B });
  report("B1) the store keeps a real rectangle as numbers, drops an empty one, and remembers the selection source",
    JSON.stringify(e1.regionBounds) === JSON.stringify(REGION) && e1.inputSource === "selection" && e2.regionBounds === null && e3.regionBounds === null && e3.inputSource === "", { e1: e1.regionBounds, e2: e2.regionBounds });
  wr.clear();
  const imp = require(path.join(PANEL, "src/photoshop/image-import-service.js"));
  const okSlot = imp.fromActiveLayer({ captureActiveLayer: () => ({ ref: URL_B, width: 40, height: 60, name: "Bride retouch", via: "getPixels" }) });
  const noDoc = imp.fromActiveLayer({ captureActiveLayer: () => null });
  const refused = imp.fromActiveLayer({ captureActiveLayer: () => ({ error: "getPixels 1/4: no pixels | saved copy: refused" }) });
  report("B2) the import service hands the slot the layer's name and size on success, no-active-layer without a document, and capture-failed with the host's reasons",
    okSlot.valid && okSlot.name === "Bride retouch" && okSlot.width === 40 && okSlot.height === 60 && okSlot.source === "active-layer" &&
    noDoc.valid === false && noDoc.reason === "no-active-layer" && refused.valid === false && refused.reason === "capture-failed" && /saved copy: refused/.test(refused.detail), { okSlot, noDoc, refused });
  const mp = require(path.join(PANEL, "src/photoshop/masked-place-service.js"));
  const calls = [];
  const host = { placeAsLayer: async (o) => { calls.push(o); return { masked: true, id: 1 }; }, createGroup: async () => ({ id: 9 }), supportsLayerMask: () => true };
  return mp.placeResults({ host, results: [{ ref: URL_B }], feature: "Selection Edit", modelId: "", canvas: { width: 1000, height: 800 }, timeLabel: "", regionBounds: REGION }).then(r => {
    report("B3) the masked placement puts a region result at the region's own bounds with the mask cut to the selection",
      r.ok && calls.length === 1 && JSON.stringify(calls[0].bounds) === JSON.stringify(REGION) && calls[0].maskSelection === true && calls[0].mask === true, { r: r.outcome, bounds: calls[0] && calls[0].bounds, ms: calls[0] && calls[0].maskSelection });
  });
}

/* ---------------- C. in the panel ---------------- */
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

    /* ---- C1: Selection Edit end to end — the marquee, the request, GENERATE, the record, the card ---- */
    await page.evaluate(() => switchPage("wf"));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("hnkWf_region-edit").click());
    await page.waitForTimeout(300);
    const c1 = await page.evaluate(async ([a, b, region]) => {
      const host = HNK.photoshopHost;
      window.__cap = [];
      host.getSelectionBounds = async () => region;
      host.captureRegion = async (bnd) => { window.__cap.push(bnd); return { ref: a, width: bnd.width, height: bnd.height, via: "getPixels" }; };
      const st = HNK.aiToolsApp.controller().workflow;
      const slotMark = document.querySelectorAll(".hnk-req-mark")[0] && document.querySelectorAll(".hnk-req-mark")[0].textContent;
      const field = document.querySelector("#hnkAiToolsRoot .hnk-wf-text");
      if (field) { field.value = "make the wall white"; field.dispatchEvent(new Event("input", { bubbles: true })); }
      const prev = window.fetch;
      const json = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }));
      window.fetch = function (url, init) {
        url = String(url);
        if (url.indexOf("myqcloud.com") >= 0) { const bytes = Uint8Array.from(atob(b.split(",")[1]), ch => ch.charCodeAt(0)); return Promise.resolve(new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } })); }
        if (url.indexOf("/media/upload/binary") >= 0) return json({ code: 0, data: { download_url: "https://rh-hk-images-switch.xiaoyaoyou.com/input/openapi/a.jpg" } });
        if (url.indexOf("/openapi/v2/query") >= 0) return json({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com/output/z.png" }] });
        if (url.indexOf("runninghub.ai/openapi/v2/") >= 0) return json({ taskId: "t-1" });
        return prev(url, init);
      };
      /* the staged button: Prepare loads the prompt and opens GENERATE (the
         capture-phase guard swallows a click on a disabled control) */
      const prep = document.getElementById("hnkWfPrepare");
      if (prep && prep.style.display !== "none") prep.click();
      await new Promise(r => setTimeout(r, 100));
      const gen = document.getElementById("hnkWfGenerate");
      const genState = { shown: gen.style.display !== "none", disabled: /is-disabled/.test(gen.className) };
      gen.click();
      await new Promise(r => setTimeout(r, 300));
      try { await HNK.aiToolsBoot.lastRun(); } catch (e) { }
      await new Promise(r => setTimeout(r, 200));
      window.fetch = prev;
      const e = HNK.wfResults.latest("region-edit");
      const im = document.getElementById("hnkWfResultImg");
      return { slotMark, field: !!field, genState, captured: window.__cap, n: HNK.wfResults.list("region-edit").length,
        before: e && e.before === a, after: e && /^data:image\/png;base64,/.test(e.after), region: e && e.regionBounds, source: e && e.inputSource,
        stateRegion: st.regionBounds, onCard: !!im && !!e && im.src === e.after, meta: (document.getElementById("hnkWfResultMeta") || {}).textContent,
        cmp: !!document.getElementById("hnkWfCmpBtn"), useAs: !!document.getElementById("hnkWfUseAsInput"), place: !!document.getElementById("hnkWfPlaceAgain"),
        slotMarkAfter: document.querySelectorAll(".hnk-req-mark")[0] && document.querySelectorAll(".hnk-req-mark")[0].textContent };
    }, [URL_A, URL_B, REGION]);
    report("C1) Selection Edit: the slot is ticked by the live marquee, the request typed, GENERATE reads the selection's pixels and runs — the result is recorded with the selected pixels as Before, the rectangle and the selection source, it is on the card with Selection 40×60 in its line, Before/After and Place again offered and Use as IMAGE 1 (rightly) not",
      c1.slotMark === "✓" && c1.field && c1.genState.shown && !c1.genState.disabled && c1.captured.length === 1 && JSON.stringify(c1.captured[0]) === JSON.stringify(REGION) && c1.n === 1 && c1.before && c1.after &&
      JSON.stringify(c1.region) === JSON.stringify(REGION) && c1.source === "selection" && JSON.stringify(c1.stateRegion) === JSON.stringify(REGION) && c1.onCard && /40×60/.test(c1.meta || "") &&
      c1.cmp && !c1.useAs && c1.place, c1);

    /* ---- C2: the compare says Selection; Place again lands at the rectangle under a mask ---- */
    const c2 = await page.evaluate(async ([a, region]) => {
      const cb = document.getElementById("hnkWfCmpBtn");
      if (!cb) return { tag: null, placed: [], noCard: true };
      cb.click();
      const tag = (document.getElementById("hnkWfCmpTagBefore") || {}).textContent;
      const bef = (document.getElementById("hnkWfImgBefore") || {}).src;
      const host = HNK.photoshopHost;
      window.__placed = [];
      host.placeAsLayer = async (o) => { window.__placed.push({ bounds: o.bounds, mask: o.mask, maskSelection: o.maskSelection, ref: String(o.ref).slice(0, 22) }); return { masked: true, id: 1 }; };
      host.createGroup = async (n) => ({ id: 9, name: n });
      host.supportsLayerMask = () => true;
      host.canvasSize = () => ({ width: 1000, height: 800 });
      const pa = document.getElementById("hnkWfPlaceAgain");
      if (pa) pa.click();
      for (let i = 0; i < 40 && !window.__placed.length; i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 150));
      const msg = document.getElementById("hnkProgressMsg");
      return { tag, befIsSelection: bef === a, placed: window.__placed, strip: msg ? msg.textContent : null, done: HNK.i18n.t("ai_done") };
    }, [URL_A, REGION]);
    report("C2) Before/After opens with the selected pixels under the divider and the tag \"← Before (Selection)\"; Place into Photoshop again places the result at the selection's exact bounds with the mask cut to it and the strip says Done",
      /^← Before \(/.test(c2.tag || "") && !/IMAGE 1/.test(c2.tag || "") && c2.befIsSelection && c2.placed.length === 1 && JSON.stringify(c2.placed[0].bounds) === JSON.stringify(REGION) &&
      c2.placed[0].maskSelection === true && c2.placed[0].mask === true && /^data:image\/png/.test(c2.placed[0].ref) && !!c2.strip && c2.strip.indexOf(c2.done) === 0, c2);

    /* ---- C3: the Active-layer tick names the layer and its size ---- */
    const c3 = await page.evaluate(async ([b]) => {
      const back = document.getElementById("hnkWfBack");
      if (back) back.click(); else { switchPage("wf"); }
      await new Promise(r => setTimeout(r, 200));
      document.getElementById("hnkWf_reference-scenes").click();
      await new Promise(r => setTimeout(r, 300));
      const host = HNK.photoshopHost;
      host.captureActiveLayer = async () => ({ ref: b, width: 40, height: 60, name: "Bride retouch v2", via: "getPixels" });
      document.getElementById("hnkWfAdd_img1").click();
      for (let i = 0; i < 40 && !/Bride/.test(document.querySelectorAll(".hnk-req-mark")[0].textContent); i++) await new Promise(r => setTimeout(r, 50));
      const mark1 = document.querySelectorAll(".hnk-req-mark")[0].textContent;
      const st = HNK.aiToolsApp.controller().workflow;
      const img1 = st.requiredInputs[0].image;
      /* a long name is shortened, never wrapped */
      host.captureActiveLayer = async () => ({ ref: b, width: 1536, height: 2048, name: "A very long layer name that goes on and on", via: "saved-copy" });
      document.getElementById("hnkWfAdd_img2").click();
      for (let i = 0; i < 40 && !/very/.test(document.querySelectorAll(".hnk-req-mark")[1].textContent); i++) await new Promise(r => setTimeout(r, 50));
      const mark2 = document.querySelectorAll(".hnk-req-mark")[1].textContent;
      /* a refusal keeps the reason on the slot */
      host.captureActiveLayer = async () => ({ error: "getPixels 1/4: layer is a group | saved copy: refused" });
      document.getElementById("hnkWfClear_img2").click();
      document.getElementById("hnkWfAdd_img2").click();
      for (let i = 0; i < 40 && !/group/.test(document.querySelectorAll(".hnk-req-mark")[1].textContent); i++) await new Promise(r => setTimeout(r, 50));
      const mark3 = document.querySelectorAll(".hnk-req-mark")[1].textContent;
      const req = HNK.workflowRequestCompiler.compile(st);
      return { mark1, img1: { source: img1.source, name: img1.name, w: img1.width, h: img1.height }, mark2, mark3, reqSource: req.images[0] && req.images[0].source, thumb: (document.querySelector("#hnkWfThumb_img1 img") || {}).src === b };
    }, [URL_B]);
    report("C3) \"+ Layer\" on a slot: the tick reads \"✓ Bride retouch v2 · 40×60\" (the layer Photoshop handed over, at its size), a long name is shortened with an ellipsis, a refusal prints Photoshop's reasons on the slot, the request carries source active-layer and the thumbnail shows the picture",
      c3.mark1 === "✓ Bride retouch v2 · 40×60" && c3.img1.source === "active-layer" && c3.img1.name === "Bride retouch v2" && c3.img1.w === 40 && c3.img1.h === 60 &&
      /^(\u2713|✓) A very long layer nam(\u2026|…) (\u00b7|·) 1536(\u00d7|×)2048$/.test(c3.mark2) && /layer is a group \| saved copy: refused/.test(c3.mark3) && c3.reqSource === "active-layer" && c3.thumb, c3);

    /* ---- C4: Freeform's Layer button falls back to the host's routes ---- */
    const c4 = await page.evaluate(async ([b]) => {
      switchPage("aitools");
      await new Promise(r => setTimeout(r, 150));
      const host = HNK.photoshopHost;
      window.captureLayerB64Direct = async () => { throw new Error("getPixels: the layer is a group"); };
      host.captureActiveLayer = async () => ({ ref: b, width: 40, height: 60, name: "Bride retouch v2", via: "saved-copy" });
      state.subj = null;
      await ffSlotFromLayer(0);
      const got = state.subj && { b64: state.subj.b64 === b.split(",")[1], mime: state.subj.mime, label: state.subj.label, via: state.subj.via };
      const okStatus = (document.getElementById("status") || {}).textContent;
      /* the host refuses too: the student reads both reasons */
      host.captureActiveLayer = async () => ({ error: "imaging refused every shape" });
      state.subj = null;
      await ffSlotFromLayer(0);
      const bothStatus = (document.getElementById("status") || {}).textContent;
      /* no document: the original words, nothing appended */
      host.captureActiveLayer = async () => null;
      await ffSlotFromLayer(0);
      const noneStatus = (document.getElementById("status") || {}).textContent;
      return { got, okStatus, okWant: t("st_ref_layer_added"), bothStatus, noneStatus, subjAfter: !!state.subj };
    }, [URL_B]);
    report("C4) Freeform's Layer button: when the single getPixels route refuses, the host's routes answer and IMG 1 gets the picture (label \"Layer: …\", the route kept); when the host refuses too the status carries both reasons; without a document the original refusal stands alone",
      !!c4.got && c4.got.b64 && c4.got.mime === "image/png" && c4.got.label === "Layer: Bride retouch v2" && c4.got.via === "saved-copy" && c4.okStatus === c4.okWant &&
      /the layer is a group/.test(c4.bothStatus || "") && /imaging refused every shape/.test(c4.bothStatus || "") && /the layer is a group/.test(c4.noneStatus || "") && !/\|/.test(c4.noneStatus || "") && !c4.subjAfter, c4);

    /* ---- C5: the SELF-TEST "Layer capture" row ---- */
    const rowOf = () => page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#selfTestRows .diagrow")).map(r => ({ nm: r.querySelector(".diag-nm").textContent, st: r.querySelector(".diag-st").textContent, lvl: r.querySelector(".diag-ic").className }));
      const i = rows.findIndex(r => r.nm === "Layer capture"), n = rows.findIndex(r => r.nm === "Network");
      return Object.assign({ idx: i, netIdx: n, total: rows.length }, rows[i] || { missing: true });
    });
    await page.evaluate(() => switchPage("setup"));
    await page.waitForTimeout(400);
    const c5a = await rowOf();
    report("C5) Setup's SELF-TEST carries the \"Layer capture\" row right after Network; outside Photoshop it reads the host mark (~) \"not Photoshop\" — never a red row for a place with no layers",
      !c5a.missing && c5a.idx === c5a.netIdx + 1 && /host/.test(c5a.lvl) && /not Photoshop/.test(c5a.st), c5a);
    const c5b = await page.evaluate(async ([b]) => {
      window.hostIsPhotoshop = () => true;
      HNK.photoshopHost.captureActiveLayer = async () => ({ ref: b, width: 1200, height: 1800, name: "Bride retouch v2", via: "getPixels", mode: "CMYKColorMode" });
      document.getElementById("btnSelfTest").click();
      await new Promise(r => setTimeout(r, 250));
      const rows = () => Array.from(document.querySelectorAll("#selfTestRows .diagrow")).map(r => ({ nm: r.querySelector(".diag-nm").textContent, st: r.querySelector(".diag-st").textContent, lvl: r.querySelector(".diag-ic").className }));
      const ok = rows().find(r => r.nm === "Layer capture");
      HNK.photoshopHost.captureActiveLayer = async () => ({ error: "getPixels 1/4: no pixels | saved copy: refused" });
      document.getElementById("btnSelfTest").click();
      await new Promise(r => setTimeout(r, 250));
      const bad = rows().find(r => r.nm === "Layer capture");
      HNK.photoshopHost.captureActiveLayer = async () => null;
      document.getElementById("btnSelfTest").click();
      await new Promise(r => setTimeout(r, 250));
      const none = rows().find(r => r.nm === "Layer capture");
      return { ok, bad, none };
    }, [URL_B]);
    report("C6) Run again runs the capture: a layer that answers prints “Bride retouch v2” · 1200×1800 · CMYK · via getPixels · ms · KB (ok); a refusal prints REFUSED with Photoshop's reasons (err); no document reads the host mark with what to do",
      !!c5b.ok && /ok/.test(c5b.ok.lvl) && /“Bride retouch v2” · 1200×1800 · CMYK · via getPixels · \d+ms · \d+ KB/.test(c5b.ok.st) &&
      !!c5b.bad && /err/.test(c5b.bad.lvl) && /^REFUSED — getPixels 1\/4: no pixels \| saved copy: refused \(\d+ms\)$/.test(c5b.bad.st) &&
      !!c5b.none && /host/.test(c5b.none.lvl) && /no document open/.test(c5b.none.st) && /Run again/.test(c5b.none.st), c5b);

    report("C7) nothing threw in the panel while all of that ran", errs.length === 0, errs);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
