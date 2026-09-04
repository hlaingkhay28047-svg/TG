/* v6.56.1 — EVERY PICTURE THE PANEL ASKS FOR ACTUALLY PAINTS.
 *
 * WHY THIS FILE EXISTS. A .ccx cannot carry a hundred megabytes of card
 * photographs, so the panel's art lives on the web app's own host and the
 * plugin fetches it: 134 Smart Workflow cards, 29 video shot cards, the
 * Library's 1850 plates. The web app loads those same files from its own
 * folder with a relative path, which is why the two surfaces can look
 * identical in a string test and different on screen — the app's picture is
 * a path that cannot rot, the panel's is a URL that can.
 *
 * Nothing checked the panel's side. The gap was not theoretical: RETOUCH B's
 * suite tab called for i-target-cream.svg, which had never been drawn. Every
 * icon is emitted as one <img> per tint with the stylesheet revealing exactly
 * one, so the missing file was invisible until 6.56.0 lit that tab up — and
 * even then it was a silent 404, not an error anyone could see. The icon
 * symbols reach icn() as DATA (a group's icon field, a tab's argument), so no
 * grep for a string literal finds them; only running the panel does.
 *
 * So this runs it, and holds three things:
 *
 *   A. the UXP manifest still grants the hosts the panel loads art from.
 *      Photoshop allows a plugin's network by manifest, not by CORS headers;
 *      drop a host here and every card in the panel goes blank in the field
 *      while every other test stays green.
 *   B. every URL the panel requests from that host exists in docs/app — the
 *      folder that IS deployed, and whose bytes the release lane hashes.
 *   C. no visible <img> on any of the thirteen pages failed to paint.
 *
 * The art is served from docs/app on the panel's own origin: same bytes as
 * production, and no browser CORS rule that Photoshop would not apply.
 *
 * Usage: node test/verify_panel_art.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP_DIR = path.join(ROOT, "docs", "app");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 600)));
  if (!ok) failures++;
}

/* the two hosts the panel names for the web app's asset tree */
const ASSET_HOSTS = ["https://hnkaistudio.com", "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app"];

/* ---- A. the manifest still grants those hosts ---- */
const manifest = JSON.parse(fs.readFileSync(path.join(PANEL, "manifest.json"), "utf8"));
const domains = ((manifest.requiredPermissions || {}).network || {}).domains || [];
ASSET_HOSTS.forEach(function (h) {
  report("the UXP manifest grants the panel " + h,
    domains.indexOf(h) >= 0,
    "requiredPermissions.network.domains does not list it — Photoshop would block every card, and no browser test would notice");
});

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

/* the thirteen pages, by the panel's own key */
const PAGES = ["aitools", "setup", "wf", "prompt", "meitu", "evoto", "retouch",
  "path", "create", "video", "vidup", "v2v", "presets", "gallery"];

/* Only what the student can SEE. getComputedStyle on a child of a
   display:none parent still reports the child's own display, so rects are the
   test: a box that is not laid out has none. An <img> has painted when it is
   complete with a natural width — a 404 leaves it complete and zero. */
const BROKEN = `(function(){
  function vis(e){ var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return e.getClientRects().length > 0; }
  var out = [];
  document.querySelectorAll("img").forEach(function (e) {
    if (!vis(e)) return;
    var src = e.getAttribute("src");
    if (!src) return;
    if (!(e.complete && e.naturalWidth > 0)) out.push(src);
  });
  return out;
})`;

/* the scroll ancestors of the open page, opened, so what is below the fold is
   laid out and its pictures are really asked for */
const FLATTEN = () => {
  let n = document.querySelector(".page.on");
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    if (/auto|scroll|hidden/.test(cs.overflowY) || /auto|scroll|hidden/.test(cs.overflowX)) {
      n.style.overflow = "visible"; n.style.height = "auto"; n.style.maxHeight = "none";
    }
    n = n.parentElement;
  }
  document.documentElement.style.height = "auto";
  document.body.style.height = "auto";
};

(async () => {
  const { chromium } = require("playwright-core");
  /* the panel's own files, plus the web app's asset tree under /__app/ — the
     panel's ORIGIN, so the Library's cross-origin plate fetches are not
     refused by a rule Photoshop does not apply */
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    let base = PANEL;
    if (rel.indexOf("__app/") === 0) { base = APP_DIR; rel = rel.slice(6); }
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const notInApp = [];
  let servedFromApp = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      for (const host of ASSET_HOSTS) {
        if (u.indexOf(host + "/app/") === 0) {
          const rel = decodeURIComponent(u.slice((host + "/app/").length).split("?")[0]);
          const abs = path.resolve(APP_DIR, rel);
          if (abs.startsWith(APP_DIR + path.sep) && fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) {
            servedFromApp++;
            return route.fulfill({ status: 200,
              contentType: MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
              body: fs.readFileSync(abs) });
          }
          if (notInApp.indexOf(rel) < 0) notInApp.push(rel);
          return route.fulfill({ status: 404, body: "" });
        }
      }
      /* anything else the panel reaches for is not art; answer it flatly */
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    /* the Library's plates are fetched, not <img>-loaded (UXP has no
       object-fit, so they are painted as background-image data URLs), and a
       fetch never reaches page.route — UXP_STUB owns window.fetch. Point that
       one host at the same tree, on this origin. */
    await page.addInitScript(`(function(){
      var stub = window.fetch;
      var BASES = ${JSON.stringify(ASSET_HOSTS.map(h => h + "/app/"))};
      window.fetch = function(url, init){
        var u = String(url);
        for (var i = 0; i < BASES.length; i++) {
          if (u.indexOf(BASES[i]) === 0) { u = "http://127.0.0.1:${port}/__app/" + u.slice(BASES[i].length); break; }
        }
        return stub(u, init);
      };
    })();`);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try {
        const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash();
        return !!(d && d.name === "Student Name");
      } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => {
      throw new Error("the panel never reached the signed-in state — check the UXP_STUB fetch answers");
    });

    const broken = {};
    for (const key of PAGES) {
      await page.evaluate(k => { try { switchPage(k); } catch (e) { } }, key);
      await page.waitForTimeout(900);
      await page.evaluate(FLATTEN);
      await page.waitForTimeout(1100);
      const list = await page.evaluate(`${BROKEN}()`, null);
      if (list.length) broken[key] = list;
    }

    report("every asset URL the panel asks for exists in docs/app (the deployed tree)",
      notInApp.length === 0,
      notInApp.length + " missing: " + notInApp.slice(0, 6).join(", "));
    report("the panel really did load its art from that tree", servedFromApp > 100,
      servedFromApp + " asset requests served — expected the card decks and the shot art");
    const pages = Object.keys(broken);
    report("no visible picture on any of the thirteen pages failed to paint",
      pages.length === 0,
      pages.map(function (k) { return k + ": " + broken[k].slice(0, 3).join(", "); }).join(" | "));
    report("no page raises an error while it builds", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — a picture the panel shows a student is not there. Draw the missing file (every icon ships one file per tint), fix the path, or restore the manifest's network grant.`
    : "\nAll checks passed — every picture the panel asks for is in the deployed tree, and every one of them paints.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
