/* verify_panel_grp_body.js — 6.96.3 / panel 6.167.3
   EVERY SMART WORKFLOW CARD IS ON SCREEN IN PHOTOSHOP.

   THE DEFECT the owner photographed on 6.167.2: the panel's Workflows page drew its
   fourteen category headers and not one of the 194 Smart Workflow cards. The catalog
   opens "Face & Portrait" by default and the panel wrote the class for it — the header
   even carried the open caret — yet the body stayed blank, and tapping a header changed
   nothing a student could see.

   THE CAUSE, and the file's own contract says it. panel/src/ui/screens/workflow-tools-screen.js
   opens with "UXP notes: the group body is shown/hidden by style.display". It was not.
   The body's visibility had come to rest on one cascade override —

       .grp-b { display: none }                       (the base rule)
       .apg .app-grp.open .grp-b { display: block }   (the override that must beat it)

   — and in Photoshop's renderer that override never won, so every group on every page
   stayed shut whatever its class said. In Chromium it wins, which is why no test and no
   local walk had ever seen it: the harness and the web app agreed with each other and
   both disagreed with the host the panel actually runs in.

   THE FIX: the class still goes on (the caret, the frame, the reset), but what shows a
   group body is now an inline display, which no renderer can decline —
     · workflow-tools-screen.group(): body.style.display at build AND in setOpen(), with
       openNow as the state instead of a className read (6.122.0: className is null in UXP),
     · main.js grpShow() at all eight sites that write the group class (Account auth · plan ·
       panel · devices, the static groups, Freeform's Advanced),
     · main.js grpSyncAll() on every page switch, so a group built by any screen, at any
       time, is made to agree with its own class.

   THE PROOF is B3: the walk withdraws the cascade override exactly as the Photoshop
   renderer withdrew it, and the cards must still be on screen. Run against the 6.167.2
   tree that leg reports 0 visible cards; against this one it reports every card of the
   open category, and the tap still opens and closes. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const MAIN = read("panel/main.js");
const PCSS = read("panel/styles.css");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));

/* the cascade override, withdrawn the way the Photoshop renderer withdraws it: no
   !important anywhere, so an inline display still wins — which is the whole point */
const NO_CASCADE = ".apg .app-grp.open .grp-b { display: none; } .grp-b { display: none; }";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };

/* ================= A) the rule, in the source ================= */
function sourcePins() {
  report("A1) the Workflows accordion shows its body with an inline display, at build and on every toggle",
    /var openNow = !!open;/.test(SCREEN) &&
    /body\.style\.display = openNow \? "block" : "none";/.test(SCREEN) &&
    /function setOpen\(on\) \{\s*\n\s*openNow = !!on;[\s\S]{0,200}body\.style\.display = on \? "block" : "none";/.test(SCREEN),
    { build: /body\.style\.display = openNow/.test(SCREEN), toggle: /body\.style\.display = on \?/.test(SCREEN) });

  report("A2) and its open state is a value of its own, never a className read — className is null in UXP (6.122.0)",
    /function isOpen\(\) \{ return openNow; \}/.test(SCREEN) &&
    !/g\.className\.indexOf/.test(SCREEN),
    { isOpen: /return openNow/.test(SCREEN), classRead: /g\.className\.indexOf/.test(SCREEN) });

  const shows = (MAIN.match(/grpShow\(/g) || []).length;
  report("A3) every place in main.js that writes a group's class also sets its body's display — eight sites, one helper",
    /function grpShow\(g, on\) \{/.test(MAIN) && shows >= 9 &&
    /grpShow\(g, false\);/.test(MAIN) && /grpShow\(g, true\);/.test(MAIN) &&
    /if \(plan\) grpShow\(plan, true\);/.test(MAIN) && /if \(!sess && auth\) grpShow\(auth, true\);/.test(MAIN),
    { shows });

  report("A4) and a group built anywhere is brought into line on every page switch",
    /function grpSyncAll\(root\) \{/.test(MAIN) &&
    /if \(active\) \{ const ape3 = \$\(active\.page\); if \(ape3\) grpSyncAll\(ape3\); \}/.test(MAIN),
    null);

  report("A5) the stylesheet still says what it said — the class is the look, not the switch",
    /\.apg \.app-grp\.open \.grp-b \{ display: block; \}/.test(PCSS) && /\.grp-b \{[^}]*display: none;/.test(PCSS),
    null);
}

/* ================= B) the panel, walked ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const out = {};
  try {
    for (const mode of ["normal", "no-cascade"]) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 1000 } });
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
      await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
        : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.addInitScript(UXP_STUB);
      await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
      await page.waitForTimeout(2200);
      await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
      if (mode === "no-cascade") await page.addStyleTag({ content: NO_CASCADE });
      await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
      await page.waitForTimeout(1200);

      const snap = () => page.evaluate(() => {
        const pg = document.getElementById("pageAiTools");
        const cards = [].slice.call(pg.querySelectorAll(".wfmini"));
        const on = cards.filter(c => { const b = c.getBoundingClientRect(); return getComputedStyle(c).display !== "none" && b.height > 0; });
        const groups = [].slice.call(pg.querySelectorAll(".grp.app-grp")).filter(g => g.querySelectorAll(".wfmini").length);
        const g0 = groups[0], b0 = g0 && g0.querySelector(".grp-b");
        /* every group's inline display must agree with its own class */
        let disagree = 0;
        groups.forEach(g => {
          const b = g.querySelector(".grp-b"); if (!b) return;
          const open = String(g.className || "").indexOf(" open") >= 0;
          if (b.style.display !== (open ? "block" : "none")) disagree++;
        });
        return { cards: cards.length, visible: on.length, groups: groups.length, disagree,
          cls: g0 ? String(g0.className) : null, inline: b0 ? b0.style.display : null,
          computed: b0 ? getComputedStyle(b0).display : null };
      });
      const tap = () => page.evaluate(() => {
        const pg = document.getElementById("pageAiTools");
        const g = [].slice.call(pg.querySelectorAll(".grp.app-grp")).filter(x => x.querySelectorAll(".wfmini").length)[0];
        g.querySelector(".grp-h").click();
      });
      const boot = await snap();
      await tap(); await page.waitForTimeout(350); const closed = await snap();
      await tap(); await page.waitForTimeout(350); const reopened = await snap();
      out[mode] = { boot, closed, reopened, errs };
      await ctx.close();
    }
  } finally { server.close(); }

  const n = out["normal"], k = out["no-cascade"];
  report("B1) the Workflows page opens with the catalog's own category open and its cards on screen",
    n.boot.cards > 100 && n.boot.visible > 0 && n.boot.inline === "block" && n.boot.computed === "block",
    n.boot);
  report("B2) the header tap closes the group and opens it again — the cards follow both ways",
    n.closed.visible === 0 && n.closed.inline === "none" &&
    n.reopened.visible === n.boot.visible && n.reopened.inline === "block",
    { closed: n.closed, reopened: n.reopened });
  report("B3) THE PHOTOSHOP CASE: with the cascade override withdrawn, every card of the open category is still drawn and the tap still works",
    k.boot.visible === n.boot.visible && k.boot.visible > 0 &&
    k.closed.visible === 0 && k.reopened.visible === n.boot.visible,
    { boot: k.boot, closed: k.closed, reopened: k.reopened });
  report("B4) and every group on the page, open or shut, has a body whose inline display agrees with its own class",
    n.boot.disagree === 0 && k.boot.disagree === 0 && n.boot.groups >= 10,
    { normal: n.boot.disagree, noCascade: k.boot.disagree, groups: n.boot.groups });
  report("B5) the page threw nothing on either leg",
    n.errs.length === 0 && k.errs.length === 0, { normal: n.errs.slice(0, 3), noCascade: k.errs.slice(0, 3) });
}

/* ================= C) the release ================= */
function releasePins() {
  const appVer = JSON.parse(read("docs/app/version.json")).v;
  const panVer = MANIFEST.version;
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("C1) the wave ships in lockstep — web " + appVer + ", panel " + panVer + " across the manifest, panel-version.json and PANEL_VERSION, with this test in the CI sweep and the landing count at 235 or more",
    /^6\.9[6-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.16[7-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    pv.v === panVer && pv.latest_version === panVer &&
    new RegExp('PANEL_VERSION = "' + panVer.replace(/\./g, "\\.") + '"').test(MAIN) &&
    CI.indexOf("node test/verify_panel_grp_body.js") > 0 && count >= 235,
    { appVer, panVer, pv: pv.v, count, ci: CI.indexOf("node test/verify_panel_grp_body.js") > 0 });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
