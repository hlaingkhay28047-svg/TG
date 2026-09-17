#!/usr/bin/env node
/* ============================================================================
   verify_wf_card_fit.js — THE SMART WORKFLOW CARDS FIT, IN ANY RENDERER (6.171.0)

   WHY THIS TEST EXISTS, AND WHY THE SIX BEFORE IT DID NOT CATCH THIS.

   The owner photographed the Workflows page in Photoshop six versions running
   (6.96.0, 6.96.2, 6.96.3, 6.96.4, 6.98.0, 6.98.1) and each time said it was
   still not tidy. Every one of those waves adjusted the stylesheet, and every
   test we owned agreed the page was fine — because every test measured THE BOX
   A RENDERER DREW, and Chromium draws it correctly. The defect only existed in
   Adobe UXP, which honours neither `max-height` + `overflow:hidden` nor
   `-webkit-line-clamp`, so it painted every word of a sentence the browser had
   quietly hidden. Measured over the real 194 cards at a 230px panel: 101 cards
   ran past their own box, the worst by 181px, and the page's card heights
   spread 235px where the browser showed 54.

   So this test does not measure a box. IT MEASURES THE WORDS.

     For every card, with the clamp removed, the title's ink must fit two lines
     and the summary's three.

   A page that satisfies that is tidy in Chromium, in UXP, and in whatever
   replaces either, because nothing is being asked to hide. That contract is
   engine-independent by construction, which is the whole point.

   Six separate faults were found by measuring, and each has a section here:
     A  the panel never called ellMark on .wfmini at all — the app called it in
        five places, the panel in none, and the panel is the surface that needs it
     B  ellMark's cutting branch was guarded by `clientHeight > ceil`, which a
        clamping renderer makes false forever, so the words were never cut
     C  `max-height` is a request UXP declines → an explicit `height` instead
     D  the title's ellipsis marker was in flow and added the line it prevented
     E  the group count pill had no nowrap and stacked two glyphs at 230px
     F  the clamp ran on grids still detached from the document, where every
        measurement is 0 and the no-op is silent

   AND ONE MORE, from the same session's photograph of the Gallery: a CSS rule
   written for the pick box's one thumbnail was a DESCENDANT selector, so it
   also sized every button's icon at 96 × 120 (section G). It is the same
   mistake in a different place — a rule meant for a picture catching something
   that is not one — so it is measured here, across all sixteen panel pages.

   Usage: node test/verify_wf_card_fit.js      (the app server must be on 8931)
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const WFS = fs.readFileSync(path.join(PANEL, "src", "ui", "screens", "workflow-tools-screen.js"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const APP_PORT = process.env.PORT || 8931;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/* the panel widths a docked Adobe panel really takes, narrowest first — the
   owner's own photographs are at the narrow end, which is where it broke */
const PANEL_WIDTHS = [230, 300, 420, 700, 1100];
const APP_WIDTHS = [360, 768, 1440];

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS  " + name); return; }
  failures++;
  console.log("FAIL  " + name);
  if (detail !== undefined) console.log("      " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
}
/* comments explain the defects by name, so a naive scan finds the prose and
   calls the bug fixed — every source pin reads code with the comments gone */
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1"); }
const MAIN_C = code(MAIN), WFS_C = code(WFS), APP_C = code(APP), CSS_C = code(CSS);

/* ---------------------------------------------------------------- A. source */
function sourcePins() {
  console.log("\n--- A. the six faults, pinned in the source ---");

  report("A1) the panel's Workflows screen clamps its own cards (it called ellMark nowhere before 6.171.0)",
    /function wfClamp\s*\(/.test(WFS_C) && /em\(gd, "\.wfmini \.t", 2\)/.test(WFS_C) && /em\(gd, "\.wfmini \.s", 3\)/.test(WFS_C),
    { wfClamp: /function wfClamp\s*\(/.test(WFS_C), t: /\.wfmini \.t", 2/.test(WFS_C), s: /\.wfmini \.s", 3/.test(WFS_C) });

  report("A2) it clamps at all three moments the cards can change: the grid is laid out, a group opens, and the page is finally in the document",
    /wfClamp\(gd\);/.test(WFS_C) && /if \(on\) \{ wfClamp\(g\); \}/.test(WFS_C) && /groups\.forEach\(function \(g\) \{ if \(g\.isOpen\(\)\) wfClamp\(/.test(WFS_C));

  report("A3) wfClamp REFUSES to measure a grid that is detached or has no height — a zero reading is not a pass, it is a silent no-op that never runs again",
    /ownerDocument\.body\.contains\(gd\)/.test(WFS_C) && /getBoundingClientRect\(\)\.height > 0/.test(WFS_C));

  /* B — the cutting branch. Both copies of ellMark must measure UNCLAMPED. */
  [["panel/main.js", MAIN_C], ["docs/app/index.html", APP_C]].forEach(function (p) {
    const src = p[1];
    const unclamps = /style\.maxHeight\s*=\s*"none"/.test(src) && /style\.overflow\s*=\s*"visible"/.test(src) && /style\.height\s*=\s*"auto"/.test(src);
    const noClientCut = !/clientHeight\s*<=\s*m\.ceil/.test(src) && !/n\.clientHeight\s*>\s*m\.ceil/.test(src);
    const scrollCut = /n\.scrollHeight\s*>\s*m\.ceil\s*\+\s*m\.lh\s*\/\s*2/.test(src);
    report("A4) " + p[0] + ": ellMark measures with the clamp OFF and cuts on scrollHeight — never on clientHeight, which a clamping renderer pins to the ceiling forever",
      unclamps && noClientCut && scrollCut, { unclamps: unclamps, noClientHeightCut: noClientCut, cutsOnScrollHeight: scrollCut });
    report("A5) " + p[0] + ": and it puts every one of those declarations back",
      /style\.height\s*=\s*sv\.h/.test(src) && /style\.maxHeight\s*=\s*sv\.mh/.test(src) && /style\.overflow\s*=\s*sv\.ov/.test(src) && /webkitLineClamp\s*=\s*sv\.lc/.test(src));
  });

  report("A6) ellMark is published on HNK — the Workflows screen is its own module and had no other way to reach it",
    /globalThis\.HNK\.ellMark\s*=\s*ellMark/.test(MAIN_C));

  /* C — an explicit height, not a ceiling, on both surfaces */
  report("A7) panel: .wfmini .t and .s state a height; neither asks for a max-height the renderer may decline",
    /\.wfmini \.t \{[^}]*height: 4\.5em/.test(CSS_C) && !/\.wfmini \.t \{[^}]*max-height/.test(CSS_C)
    && /\.wfmini \.s \{[^}]*height: 6\.75em/.test(CSS_C) && !/\.wfmini \.s \{[^}]*max-height/.test(CSS_C));
  report("A8) web app: the same two heights, so a card is the same shape on both surfaces",
    /\.wfmini \.t\{[^}]*height:4\.5em/.test(APP_C) && !/\.wfmini \.t\{[^}]*max-height/.test(APP_C)
    && /\.wfmini \.s\{[^}]*height:6\.75em/.test(APP_C) && !/\.wfmini \.s\{[^}]*max-height/.test(APP_C));

  /* D — the title's marker is out of the flow on both surfaces */
  report("A9) the TITLE's ellipsis is positioned, on both surfaces — in the flow it added the very line it was there to prevent",
    /\.wfmini \.t \.ell,\s*\.wfmini \.s \.ell/.test(CSS_C) && /\.wfmini \.t \.ell,\.wfmini \.s \.ell/.test(APP_C)
    && /\.wfmini \.t \{[^}]*position: relative/.test(CSS_C) && /\.wfmini \.t\{position:relative/.test(APP_C));

  /* E — the count pill */
  report("A10) the group count never wraps and never shrinks (it stacked two glyphs into 9.8px × 48px at a 230px panel)",
    /#pageAiTools \.grp-h \.cnt \{[^}]*white-space: nowrap/.test(CSS_C) && /#pageAiTools \.grp-h \.cnt \{[^}]*flex: 0 0 auto/.test(CSS_C));

  report("A11) the app clamps the title beside the summary at every call site (it clamped only the summary before)",
    APP_C.split('ellMark(wfHost, ".wfmini .t", 2)').length - 1 >= 4
    && APP_C.split('ellMark(wfHost, ".wfmini .s", 3)').length - 1 >= 4);
}

/* -------------------------------------------------------- the shared reading */
/* the ink each box NEEDS, with nothing hiding it — the only number both
   engines agree on, and the one this whole test is built from */
const IN_PAGE_MEASURE = `(function(scope){
  function ink(n){
    if(!n) return {v:0,lh:16};
    var sv={h:n.style.height,mh:n.style.maxHeight,ov:n.style.overflow,dp:n.style.display,lc:n.style.webkitLineClamp};
    n.style.height="auto"; n.style.maxHeight="none"; n.style.overflow="visible";
    if(String(getComputedStyle(n).display).indexOf("box")>=0) n.style.display="block";
    try{ n.style.webkitLineClamp="unset"; }catch(e){}
    var v=n.scrollHeight, lh=parseFloat(getComputedStyle(n).lineHeight)||16;
    n.style.height=sv.h; n.style.maxHeight=sv.mh; n.style.overflow=sv.ov; n.style.display=sv.dp;
    try{ n.style.webkitLineClamp=sv.lc; }catch(e){}
    return {v:v,lh:lh};
  }
  var out={cards:[],heads:[]};
  document.querySelectorAll(scope+" .wfmini").forEach(function(c){
    var t=c.querySelector(".t"), s=c.querySelector(".s");
    var r=c.getBoundingClientRect(); if(!(r.height>0)) return;
    var ti=ink(t), si=ink(s);
    out.cards.push({ h:Math.round(r.height*10)/10, y:Math.round(r.y*10)/10, x:Math.round(r.x*10)/10,
      tOver:Math.round(ti.v-2*ti.lh), sOver:Math.round(si.v-3*si.lh), tLh:ti.lh, sLh:si.lh,
      ell:!!(t&&t.querySelector(".ell"))||!!(s&&s.querySelector(".ell")),
      title:(t&&(t.textContent||"").replace(/\\u2026$/,"").trim().slice(0,32))||"" });
  });
  document.querySelectorAll(scope+" .grp-h").forEach(function(h){
    var cnt=h.querySelector(".cnt");
    out.heads.push({ h:Math.round(h.getBoundingClientRect().height), cntH:cnt?Math.round(cnt.getBoundingClientRect().height):0 });
  });
  return out;
})`;

function judge(m) {
  const tOver = m.cards.filter(c => c.tOver > c.tLh / 2);
  const sOver = m.cards.filter(c => c.sOver > c.sLh / 2);
  const worst = Math.max(0, ...m.cards.map(c => Math.max(c.tOver, c.sOver)));
  return { n: m.cards.length, tOver: tOver.length, sOver: sOver.length, worst: worst,
    cut: m.cards.filter(c => c.ell).length,
    firstBad: (tOver[0] || sOver[0] || {}).title || "",
    maxCnt: Math.max(0, ...m.heads.map(h => h.cntH)),
    maxHead: Math.max(0, ...m.heads.map(h => h.h)) };
}

/* ---------------------------------------------------------------- B. panel */
async function panelWalk(browser) {
  console.log("\n--- B. the panel, at the widths a docked Adobe panel really takes ---");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    for (const W of PANEL_WIDTHS) {
      const page = await browser.newPage({ viewport: { width: W, height: 900 } });
      await page.route("**/*", route => {
        const u = route.request().url();
        if (u.indexOf("127.0.0.1") >= 0) return route.continue();
        if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      });
      await page.addInitScript(UXP_STUB);
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name"); } catch (e) { return false; } }, null, { timeout: 25000 });
      await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
      await page.waitForTimeout(1200);
      /* open every group THE WAY A STUDENT DOES — by tapping its header. Writing
         the open class directly skips the product's own setOpen and measures a
         page nobody can reach; the first draft of this test did exactly that and
         reported a pass while the real page was still broken. */
      await page.evaluate(() => {
        document.querySelectorAll("#pageAiTools .grp").forEach(g => {
          try { const b = g.querySelector(".grp-b"), h = g.querySelector(".grp-h");
            if (b && h && b.style.display !== "block") h.click(); } catch (e) { }
        });
      });
      await page.waitForTimeout(1200);
      const j = judge(await page.evaluate(IN_PAGE_MEASURE + '("#pageAiTools")'));
      report(`B${PANEL_WIDTHS.indexOf(W) + 1}) ${W}px: all ${j.n} cards' words fit — title 2 lines, summary 3 — with every clamp removed`,
        j.n > 150 && j.tOver === 0 && j.sOver === 0, j);
      if (W === 230) {
        report("B6) 230px: the page really did need cutting — a run that cuts nothing is a run that measured nothing",
          j.cut > 50, { cut: j.cut, of: j.n });
        report("B7) 230px: the group count stands on one line (it stacked to 48px and drove the header from 44px to 112px)",
          j.maxCnt > 0 && j.maxCnt <= 30, { countPillHeight: j.maxCnt, header: j.maxHead });
      }
      await page.close();
    }
  } finally { server.close(); }
}

/* ------------------------------------------------------------------ C. app */
async function appWalk(browser) {
  console.log("\n--- C. the web app, the same contract (both surfaces must cut the same words) ---");
  for (const W of APP_WIDTHS) {
    const page = await browser.newPage({ viewport: { width: W, height: 900 } });
    await page.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { try { switchPage("pgWf"); } catch (e) { } });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.querySelectorAll("#pgWf .grp").forEach(g => { try { if (String(g.className).indexOf("open") < 0) { const h = g.querySelector(".grp-h"); if (h) h.click(); } } catch (e) { } });
    });
    await page.waitForTimeout(900);
    const j = judge(await page.evaluate(IN_PAGE_MEASURE + '("#pgWf")'));
    report(`C${APP_WIDTHS.indexOf(W) + 1}) app ${W}px: all ${j.n} cards' words fit the same two/three line budget`,
      j.n > 150 && j.tOver === 0 && j.sOver === 0, j);
    await page.close();
  }
}

/* ------------------------------------------------------- D. fault injection */
/* A test that cannot fail is not evidence. Put the old rule back in the page
   and the measurement must go red — otherwise it is measuring nothing. */
async function faultInjection(browser) {
  console.log("\n--- D. fault injection: restore the old max-height and the test must go red ---");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const page = await browser.newPage({ viewport: { width: 230, height: 900 } });
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    /* break ellMark before the page boots: it marks, as the old rule did, but
       never cuts — exactly the state 6.170.0 shipped in */
    await page.addInitScript(UXP_STUB);
    await page.addInitScript(`(function(){
      var iv = setInterval(function(){
        if (globalThis.HNK && globalThis.HNK.ellMark) { globalThis.HNK.ellMark = function(){}; clearInterval(iv); }
      }, 5);
      setTimeout(function(){ clearInterval(iv); }, 8000);
    })()`);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name"); } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.querySelectorAll("#pageAiTools .grp").forEach(g => {
        try { const b = g.querySelector(".grp-b"), h = g.querySelector(".grp-h");
          if (b && h && b.style.display !== "block") h.click(); } catch (e) { }
      });
    });
    await page.waitForTimeout(1200);
    const j = judge(await page.evaluate(IN_PAGE_MEASURE + '("#pageAiTools")'));
    report("D1) with the clamp disabled the very same measurement goes red — the contract has teeth",
      j.n > 150 && (j.tOver + j.sOver) > 20 && j.worst > 40, j);
    await page.close();
  } finally { server.close(); }
}

/* ------------------------------------------- G. no icon is sized by a picture rule */
/* The owner photographed the Gallery pick box: every button's icon drawn at
   96 × 120 ("အရမ်းကြီးနေတယ်"). The cause was `#pageGallery .lib-pick img` — a
   rule for the box's one thumbnail, written as a descendant selector, so it
   also caught the <img class="ic-s"> inside each of the six buttons.
   A panel icon sits on a line of text or inside a button and is never larger
   than about 26px; ic-xl is the one deliberate exception at 32px. So: walk
   every page and refuse any other reading. */
const ICON_CEILING = 26;
const ICON_ROUTES = ["setup", "aitools", "wf", "prompt", "imagine", "meitu", "evoto", "retouch",
  "path", "create", "video", "vidup", "v2v", "talk", "presets", "gallery"];
const ICON_PROBE = `(function(){
  function R(e){var r=e.getBoundingClientRect();return {w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10};}
  var out=[];
  document.querySelectorAll('img').forEach(function(im){
    var c=String(im.className||"");
    if(c.indexOf("ic-")<0) return;
    if(c.indexOf("ic-xl")>=0) return;            /* the one deliberate 32px icon */
    var r=R(im); if(!(r.w>0&&r.h>0)) return;
    if(r.w<=${ICON_CEILING} && r.h<=${ICON_CEILING}) return;
    var p=im.parentNode, chain=[];
    for(var i=0;i<5 && p && p.nodeType===1;i++){ chain.push("."+String(p.className||p.tagName).split(" ")[0]); p=p.parentNode; }
    out.push({ cls:c, r:r, chain:chain.join(" < ") });
  });
  return out;
})()`;

async function iconWalk(browser) {
  console.log("\n--- G. no icon anywhere is sized by a rule meant for a picture ---");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name"); } catch (e) { return false; } }, null, { timeout: 25000 });
    const found = [];
    for (const route of ICON_ROUTES) {
      await page.evaluate(r => { try { switchPage(r); } catch (e) { } }, route);
      await page.waitForTimeout(600);
      /* show what hides behind a flag, so its icons are laid out and measurable */
      await page.evaluate(() => {
        ["galPick", "libPick"].forEach(function (id) { var x = document.getElementById(id); if (x) x.style.display = "flex"; });
        document.querySelectorAll(".grp").forEach(function (g) { try { var b = g.querySelector(".grp-b"); if (b) b.style.display = "block"; } catch (e) { } });
      });
      await page.waitForTimeout(400);
      const bad = await page.evaluate(ICON_PROBE);
      bad.forEach(x => found.push(route + ": " + x.r.w + "×" + x.r.h + " " + x.cls + " in " + x.chain));
    }
    report(`G1) every icon on all ${ICON_ROUTES.length} panel pages is ${ICON_CEILING}px or smaller (the Gallery pick box drew them at 96×120)`,
      found.length === 0, found.slice(0, 6));
    /* and the rule that caused it is a child combinator now, not a descendant */
    report("G2) the Gallery pick box sizes only its own direct-child thumbnail",
      /#pageGallery \.lib-pick > img \{/.test(CSS_C) && !/#pageGallery \.lib-pick img \{/.test(CSS_C));
    await page.close();
  } finally { server.close(); }
}

/* -------------------------------------------------------------- E. release */
function releasePins() {
  console.log("\n--- E. release ---");
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
  report("E1) the CI sweep runs this test", wf.indexOf("verify_wf_card_fit.js") >= 0);
}

(async () => {
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try {
    await panelWalk(browser);
    await appWalk(browser);
    await faultInjection(browser);
    await iconWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures
    ? `\n${failures} FAILED`
    : "\nALL PASS — the words fit the box on both surfaces and no icon is sized by a rule meant for a picture; measured, not adjusted.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", (e && e.stack) || e); process.exit(1); });
