/* v5.90.0 / v6.61.0 — AN INPUT SLOT SHOWS THE WHOLE PHOTOGRAPH.
 *
 * WHY. The owner looked at the image slots and asked the exact right
 * question: is the picture coming out cropped? It was. Every slot that holds
 * a photo the STUDENT supplied drew it with object-fit:cover inside a square
 * or near-square box, so a 9:16 full-length shot lost the head and the shoes
 * and a 16:9 group shot lost both ends — silently, with no way to tell from
 * the slot that anything was missing.
 *
 * That is the one preview where a crop is not a style choice. The slot exists
 * so a studio can confirm "this is the right photograph, framed the way I
 * meant" BEFORE the credit is spent; a preview that trims cannot answer it,
 * and the студent finds out only after paying.
 *
 * So this measures rather than reads: a deliberately extreme photo goes into
 * each slot, and the RENDERED image's aspect ratio must equal the source's.
 * Any cover-style fill changes that ratio to the box's, and fails here.
 *
 * Usage: PORT=8931 node test/verify_slot_whole_photo.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
/* v5.90.0 — without a session the app opens on the login wall and the slots
   under test are never built, so the measurement would silently measure
   nothing. Same seed every other app sweep uses. */
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 420)));
  if (!ok) failures++;
}

/* a 6x15 PNG — 2:5, as extreme as a full-length portrait and small enough to
   inline. Any square-ish slot that "covers" it throws three fifths away.
   (Its predecessor here was a hand-written byte string that Chromium refused
   to decode; the measurement then read "not reachable" and the checks below
   passed while proving nothing. Generated properly now, and a slot that
   cannot be measured is a FAILURE rather than a skip.) */
const TALL = "iVBORw0KGgoAAAANSUhEUgAAAAYAAAAPCAIAAABIoSnXAAAAG0lEQVR42mPQCFiAhhiIEzoRsAANESk0dGwEAELyePETwWqhAAAAAElFTkSuQmCC";

/* the measurement: how the browser actually painted it inside its box */
const MEASURE = async function (sel) {
  const im = document.querySelector(sel);
  if (!im) return { found: false, sel: sel, why: "no such element" };
  /* a slot preview is a data: URL assigned moments ago — reading naturalWidth
     before the decode lands measures nothing and, worse, would let a real
     crop pass as "not reachable". Wait for it. */
  for (let i = 0; i < 60 && !im.naturalWidth; i++) await new Promise(r => setTimeout(r, 50));
  if (!im.naturalWidth) return { found: false, sel: sel, why: "never decoded" };
  const cs = getComputedStyle(im);
  const box = im.getBoundingClientRect();
  const srcA = im.naturalWidth / im.naturalHeight;
  const boxA = box.width / box.height;
  /* under contain the painted picture keeps srcA; under cover it takes boxA.
     Rather than trust the keyword, work out what fraction of the source is
     actually on screen — that is the number the studio cares about. */
  const visW = cs.objectFit === "contain" ? 1 : (srcA > boxA ? boxA / srcA : 1);
  const visH = cs.objectFit === "contain" ? 1 : (srcA > boxA ? 1 : srcA / boxA);
  return { found: true, sel: sel, fit: cs.objectFit,
    srcA: +srcA.toFixed(3), boxA: +boxA.toFixed(3),
    visible: +(visW * visH * 100).toFixed(1) };
};

(async () => {
  /* =================== the web app =================== */
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);

    const web = await page.evaluate(async ({ tall, measureSrc }) => {
      const measure = eval("(" + measureSrc + ")");
      state.refs[0] = { mime: "image/png", b64: tall };
      renderRefs();
      switchPage("pgCreate");
      await new Promise(r => setTimeout(r, 250));
      const out = { refs: await measure(".ref.filled img"), strip: await measure("#refStrip .rs.filled img") };
      /* and the wizard's own slot, where a Smart Workflow's photos go in */
      try { window.openWorkflowById("region-edit"); } catch (e) { }
      await new Promise(r => setTimeout(r, 250));
      const nav = document.querySelectorAll(".wiz.on .wiz-nav .btn");
      if (nav.length) nav[nav.length - 1].click();
      await new Promise(r => setTimeout(r, 250));
      out.wslot = await measure(".wslot.filled .th img");
      const wx = document.querySelector(".wiz.on .wiz-x"); if (wx) wx.click();
      return out;
    }, { tall: TALL, measureSrc: MEASURE.toString() });

    [["the three IMAGE slots", web.refs],
     ["the compact reference strip", web.strip],
     ["the wizard's own photo slot", web.wslot]].forEach(([label, m]) => {
      /* a check that cannot see its subject proves nothing; saying so out loud
         is the difference between a test and a decoration. */
      report("web app — " + label + " shows the whole photograph, not a crop of it",
        m.found && m.visible >= 99.5, m);
    });
    report("web app — no page error while the slots were measured", errs.length === 0, errs.slice(0, 3));

    /* =================== the panel =================== */
    const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
      ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
      ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".woff2": "font/woff2" };
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const abs = path.resolve(PANEL, rel);
      if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store" });
      res.end(fs.readFileSync(abs));
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    const p2 = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const perrs = [];
    p2.on("pageerror", e => perrs.push(String(e).slice(0, 200)));
    await p2.route("**/*", r => {
      if (r.request().url().indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif",
          body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await p2.addInitScript(UXP_STUB);
    await p2.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await p2.waitForTimeout(2200);
    await p2.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
      catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });

    const panel = await p2.evaluate(async ({ tall, measureSrc }) => {
      const measure = eval("(" + measureSrc + ")");
      try { switchPage("wf"); } catch (e) { }
      await new Promise(r => setTimeout(r, 700));
      /* open the first card that asks for a photo, and hand its slot one */
      const card = document.querySelector(".wfmini");
      if (card) card.click();
      await new Promise(r => setTimeout(r, 200));
      const add = document.querySelector("[id^='hnkWfAdd_']");
      if (!add) return { found: false, why: "no slot drawn" };
      const key = add.id.replace("hnkWfAdd_", "");
      const thumb = document.getElementById("hnkWfThumb_" + key);
      if (!thumb) return { found: false, why: "no thumb element" };
      const im = thumb.querySelector("img");
      im.src = "data:image/png;base64," + tall;
      thumb.style.display = "";
      await new Promise(r => setTimeout(r, 250));
      return await measure("#hnkWfThumb_" + key + " img");
    }, { tall: TALL, measureSrc: MEASURE.toString() });

    if (!panel.found) report("panel — the workflow slot preview could not be reached", false, panel);
    else report("panel — the workflow slot preview shows the whole photograph too",
      panel.visible >= 99.5, panel);
    report("panel — no page error while the slot was measured", perrs.length === 0, perrs.slice(0, 3));

    await new Promise(r => server.close(r));
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — a slot is hiding part of the photograph the studio is about to pay to edit.`
    : "\nAll checks passed — every input slot shows the whole frame, on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
