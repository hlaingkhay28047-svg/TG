/* v6.4.0 — leaving the app must not throw work away.
 *
 * THE OWNER'S REPORT, in two screenshots two minutes apart. In the first they
 * had picked a clip and a face on Media Lab → VIDEO TOOLS; the page showed
 * them as two lines of text — "a3bcf6d20aad715d6fb758c956692870.mp4" and
 * "Screenshot_2026-09-03-16-37-18-40_ae33….jpg" — which say nothing about
 * whether the right take and the right person were about to be sent. In the
 * second, taken after leaving and coming back, both were simply GONE and the
 * page was asking for a video again.
 *
 * Then, in their own words: "Generate လုပ်ထားရင် အပြင်ထွက်ပြီး ပြန်ဝင်နေရင်လဲ
 * ဆက်လုပ်နေပါ Results ထွက်တဲ့အထိ။ Result နဲ့ history တွေကို မဖျက်ပဲ ထားပေးပါ။"
 *
 * THREE SEPARATE FAILURES SAT BEHIND THAT, and this file pins each one:
 *
 *   A) the picked clip and the picked face were named, never shown;
 *   B) a Video Tools result lived only in one <video> element — no history,
 *      nothing saved, nothing to come back to. Worse, a job RECOVERED after a
 *      tab kill fell through to the image branch and was filed in the Gallery
 *      as a still, so a paid clip came back as a broken picture;
 *   C) the job book was read ONCE, at boot. RunningHub charges at SUBMIT and
 *      keeps rendering server-side, so a student who came back two minutes
 *      early found their paid job still "held" and had to leave and return
 *      again before anything looked at it.
 *
 * Usage: PORT=8931 node test/verify_generate_continuity.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) failures++;
}

/* a real 32-byte MP4 header and a 1px GIF: enough for the DOM to treat these
   as media without shipping a fixture file for a test about state */
const TINY_MP4 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";
const TINY_GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

(async () => {
  /* ---- A) read off the source: the pieces exist and are wired ---- */
  report("A) the result of a Video Tools run is saved, under its own page",
    /galleryAddVideo\([^)]*\{\s*page:\s*"pgV2V"/.test(APP.replace(/\s+/g, " ")),
    "no galleryAddVideo call files a take under pgV2V");
  report("A2) the page reads its own takes back when it opens",
    /if\s*\(\s*id\s*===\s*"pgV2V"\s*\)\s*return\s+resRestoreV2V\(\)/.test(APP) &&
    APP.indexOf("function resRestoreV2V()") >= 0,
    "resRestorePage does not route pgV2V to a restore");
  /* the recovery branch is the one that was silently wrong, so it is checked
     by NAME rather than by "some branch exists" */
  report("A3) a recovered job knows a Video Tools run returns a clip, not a picture",
    /else if\s*\(\s*job\.kind\s*===\s*"video-tool"\s*\)/.test(APP),
    "rhJobClaim still has no video-tool branch — a recovered clip is filed as a still");
  report("A4) the job book is watched, not read once at boot",
    APP.indexOf("function rhJobsWatch()") >= 0 &&
    /visibilitychange[\s\S]{0,400}rhJobsSweepOnce/.test(APP),
    "no watcher, or coming back to the tab does not re-check the book");
  /* the guard that keeps a live poll and the watcher from filing the same
     result twice — the bug the watcher would otherwise introduce */
  report("A5) a job this session is already polling is never claimed underneath it",
    APP.indexOf("_jobsLive") >= 0 && /if\s*\(_jobsLive\[jobs\[i\]\.taskId\]\)\s*continue/.test(APP),
    "the watcher would double-file a result the page is still awaiting");
  /* and nothing this wave adds may quietly cap what a studio keeps */
  report("A6) the takes this page keeps are not trimmed behind the student's back",
    !/state\.vtHist\.length\s*>\s*\d/.test(APP),
    "something trims vtHist — the owner asked for these to stay until deleted");

  /* ---- B) and it behaves that way in a browser ---- */
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2400);

    const B = await page.evaluate(arg => {
      const out = {};
      const D = id => document.getElementById(id);
      out.beforePick = { v: D("vtFilePrev").style.display, i: D("vtImgPrev").style.display };
      state.vtFile = { mime: "video/mp4", b64: arg.mp4, name: "my-take.mp4" };
      state.vtImg = { mime: "image/gif", b64: arg.gif, name: "her-face.jpg" };
      D("btnVtImgPick").style.display = "";
      renderVtPicks();
      out.afterPick = {
        vShown: D("vtFilePrev").style.display !== "none",
        iShown: D("vtImgPrev").style.display !== "none",
        vSrc: (D("vtFileThumb").getAttribute("src") || "").slice(0, 22),
        iSrc: (D("vtImgThumb").getAttribute("src") || "").slice(0, 22),
        vName: D("vtFileName").textContent,
        iName: D("vtImgName").textContent,
        vMeta: D("vtFileMeta").textContent
      };
      D("btnVtFileClear").click();
      D("btnVtImgClear").click();
      out.afterClear = {
        v: D("vtFilePrev").style.display, i: D("vtImgPrev").style.display,
        cleared: state.vtFile === null && state.vtImg === null
      };
      return out;
    }, { mp4: TINY_MP4, gif: TINY_GIF });

    report("B) nothing is shown while nothing is picked",
      B.beforePick.v === "none" && B.beforePick.i === "none", B.beforePick);
    report("B2) a picked clip and a picked face are SHOWN, with their names beside them",
      B.afterPick.vShown && B.afterPick.iShown &&
      B.afterPick.vSrc === "data:video/mp4;base64," &&
      B.afterPick.iSrc === "data:image/gif;base64," &&
      B.afterPick.vName === "my-take.mp4" && B.afterPick.iName === "her-face.jpg",
      B.afterPick);
    report("B3) each slot says how big what it holds is",
      /\d/.test(B.afterPick.vMeta || ""), B.afterPick.vMeta);
    report("B4) the × on each slot puts it back to nothing picked",
      B.afterClear.v === "none" && B.afterClear.i === "none" && B.afterClear.cleared,
      B.afterClear);

    /* --- the picked files survive being put away and taken out again --- */
    const C = await page.evaluate(arg => {
      state.vtFile = { mime: "video/mp4", b64: arg.mp4, name: "kept.mp4" };
      state.vtImg = { mime: "image/gif", b64: arg.gif, name: "kept.jpg" };
      wipSave();
      return new Promise(res => setTimeout(() => kvGet("wip").then(w => res({
        hasVideo: !!(w && w.vtFile && w.vtFile.b64),
        hasImage: !!(w && w.vtImg && w.vtImg.b64),
        vName: w && w.vtFile && w.vtFile.name,
        iName: w && w.vtImg && w.vtImg.name
      })).catch(e => res({ err: String(e) })), 300));
    }, { mp4: TINY_MP4, gif: TINY_GIF });
    report("C) leaving the app writes the picked clip and face into the snapshot",
      C.hasVideo && C.hasImage && C.vName === "kept.mp4" && C.iName === "kept.jpg", C);

    /* a clip too large to keep is named, not silently dropped */
    const C2 = await page.evaluate(() => {
      const big = "A".repeat(WIP_VIDEO_MAX_B64 + 8);
      state.vtFile = { mime: "video/mp4", b64: big, name: "huge.mp4" };
      state.vtImg = null;
      wipSave();
      return new Promise(res => setTimeout(() => kvGet("wip").then(w => res({
        kept: !!(w && w.vtFile && w.vtFile.b64),
        tooBig: !!(w && w.vtFile && w.vtFile.tooBig),
        name: w && w.vtFile && w.vtFile.name
      })).catch(e => res({ err: String(e) })), 300));
    });
    report("C2) a clip too large to keep is remembered BY NAME rather than dropped in silence",
      C2.kept === false && C2.tooBig === true && C2.name === "huge.mp4", C2);

    /* --- a take saved under pgV2V comes back when the page opens --- */
    const D = await page.evaluate(arg => {
      const bytes = Uint8Array.from(atob(arg.mp4), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "video/mp4" });
      return galDb().then(db => new Promise(res => {
        const tx = db.transaction("gal", "readwrite");
        tx.objectStore("gal").add({ kind: "video", blob: blob, mime: "video/mp4", thumb: "",
          prompt: "a take from before", ts: Date.now(), page: "pgV2V", res: "", dur: "",
          srcUrl: "", keep: 0, b64: "", before: null, prov: "", wf: "" });
        tx.oncomplete = () => res(1); tx.onerror = () => res(0); tx.onabort = () => res(0);
      })).then(() => {
        state.vtHist = []; state.vtHistSel = -1;
        try { delete _resRestored["pgV2V"]; } catch (e) { }
        resRestorePage("pgV2V");
        return new Promise(res => setTimeout(() => res({
          takes: state.vtHist.length,
          prompt: (state.vtHist[0] || {}).prompt,
          hasBlob: !!(state.vtHist[0] || {}).blob,
          strip: document.querySelectorAll("#vtHist video").length,
          boxOn: /\bon\b/.test(document.getElementById("vtResultBox").className)
        }), 700));
      });
    }, { mp4: TINY_MP4 });
    report("D) a take saved earlier is on the page again when it opens, with its bytes",
      D.takes >= 1 && D.hasBlob === true && D.prompt === "a take from before", D);
    report("D2) and it is drawn in the strip, in the result box the student can see",
      D.strip >= 1 && D.boxOn === true, D);

    /* --- a submitted job outlives the page that submitted it --- */
    const E = await page.evaluate(() => {
      rhJobOpen("hnk-test-task-1", { kind: "video-tool", label: "kling-video-o3-pro/video-edit", prompt: "a paid run" });
      return { held: rhJobsLoad().map(j => j.taskId + "/" + j.kind), live: !!_jobsLive["hnk-test-task-1"] };
    });
    report("E) a submitted job is written to the book, with the kind of result to expect",
      E.held.indexOf("hnk-test-task-1/video-tool") >= 0 && E.live === true, E);

    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2400);
    const F = await page.evaluate(() => ({
      held: rhJobsLoad().map(j => j.taskId + "/" + j.kind),
      live: !!_jobsLive["hnk-test-task-1"],
      watcher: typeof rhJobsWatch === "function"
    }));
    report("F) it is still on the book after the tab is reclaimed — the paid run is not lost",
      F.held.indexOf("hnk-test-task-1/video-tool") >= 0, F);
    report("F2) and nothing claims to be polling it any more, so the watcher takes it over",
      F.live === false && F.watcher === true, F);

    await page.evaluate(() => { try { rhJobClose("hnk-test-task-1"); } catch (e) { } });
    report("G) no page error through any of it", errs.length === 0, errs.slice(0, 3));
  } finally {
    await browser.close();
  }

  /* ---- H) the panel, which had a WORSE version of the same problem ----
     Its Video Tools card had no reference-photograph slot at all, and its run
     passed a hard-coded empty image list — so the three cards whose endpoints
     REQUIRE a photograph (both character cards and the thirty-second one)
     advertised themselves in the panel's deck and could never work there. */
  const PANEL_MAIN = fs.readFileSync(path.join(ROOT, "panel", "main.js"), "utf8");
  const PANEL_HTML = fs.readFileSync(path.join(ROOT, "panel", "index.html"), "utf8");
  report("H) the panel has the reference-photo slot its cards need",
    PANEL_HTML.indexOf('id="btnVtImgPick"') >= 0 && PANEL_HTML.indexOf('id="vtImgPrev"') >= 0,
    "no photo picker on the panel's Video Tools card");
  report("H2) and it actually sends the photograph rather than an empty list",
    !/runTool\(videoEnv\(\), d, ref, \[\]/.test(PANEL_MAIN) &&
    /runTool\(videoEnv\(\), d, ref, imgs/.test(PANEL_MAIN),
    "the panel still hard-codes an empty image list");
  report("H3) the panel shows the picked clip and face too, not just their names",
    PANEL_HTML.indexOf('id="vtFilePrev"') >= 0 && PANEL_HTML.indexOf('id="vtFileThumb"') >= 0 &&
    PANEL_MAIN.indexOf("function vtThumbFor(") >= 0,
    "no preview strip on the panel");

  const http = require("http");
  const { UXP_STUB } = require("./lib/panel-parity-harness.js");
  const PANEL = path.join(ROOT, "panel");
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
    ".mp4": "video/mp4", ".woff2": "font/woff2" };
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
  const pport = server.address().port;
  const pb = await chromium.launch();
  try {
    const pp = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const perrs = [];
    pp.on("pageerror", e => perrs.push(String(e).slice(0, 240)));
    await pp.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif",
          body: Buffer.from(TINY_GIF, "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await pp.addInitScript(UXP_STUB);
    await pp.goto("http://127.0.0.1:" + pport + "/index.html", { waitUntil: "load" });
    await pp.waitForTimeout(2200);
    await pp.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
      catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });

    const H = await pp.evaluate(() => {
      try { switchPage("v2v"); } catch (e) { }
      const out = {};
      const D = id => document.getElementById(id);
      out.slots = ["vtFilePrev", "vtImgPrev", "btnVtImgPick", "btnVtFileClear", "btnVtImgClear"]
        .map(id => id + ":" + !!D(id));
      out.hiddenAtRest = D("vtFilePrev").style.display === "none" && D("vtImgPrev").style.display === "none";
      out.imgBtnLabel = (D("btnVtImgPick").textContent || "").trim();
      /* the photo button must follow the TOOL: a card whose endpoint takes no
         photograph must not offer one */
      const withImg = document.querySelectorAll("#vtWfRow .wfmini")[0];
      if (withImg) withImg.click();
      out.afterCharCard = D("btnVtImgPick").style.display !== "none";
      const P = window.HNK && window.HNK.videoToolWorkflows;
      const noImg = (P.WF || []).findIndex(w => w.key === "vtEraseSub");
      const c2 = document.querySelectorAll("#vtWfRow .wfmini")[noImg];
      if (c2) c2.click();
      out.afterNoImgCard = D("btnVtImgPick").style.display !== "none";
      return out;
    });
    report("H4) the panel's V→V page draws both slots, empty until something is picked",
      H.slots.every(s => s.endsWith(":true")) && H.hiddenAtRest === true, H);
    report("H5) the photo button is offered by a card that needs a photo and withheld by one that does not",
      H.afterCharCard === true && H.afterNoImgCard === false,
      { needsPhoto: H.afterCharCard, doesNot: H.afterNoImgCard });
    report("H6) the panel's photo button is labelled in the student's language",
      H.imgBtnLabel.length > 2, H.imgBtnLabel);
    report("H7) no page error while the panel drew any of it", perrs.length === 0, perrs.slice(0, 3));
  } finally {
    await pb.close();
    await new Promise(r => server.close(r));
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — work would still be lost by leaving the app.`
    : "\nAll checks passed — what was picked is shown, what was made is kept, and a paid run is still watched after the tab dies.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
