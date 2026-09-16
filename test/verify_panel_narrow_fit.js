/* verify_panel_narrow_fit.js — 6.96.2 / panel 6.167.2
   NOTHING IN THE PANEL IS DRAWN WHERE PHOTOSHOP WILL CUT IT.

   6.96.1 fixed one banner that hung 404px off the right edge of a 368px page.
   The same question, asked of every element on every page, found three more —
   so the question itself is the test now.

   THE SCAN walks all sixteen panel routes at 320px and at 400px (the narrow
   and the ordinary Photoshop panel) and asks two things of every visible box:

     · does it reach past its page's right edge? A box inside a rail that
       really scrolls sideways is allowed to — the walk climbs to the page and
       skips anything whose ancestor is a scroller with room to scroll. Nothing
       else may spill, because the host clips it and the student never learns
       the box was there.
     · is its own content cut sideways (scrollWidth past clientWidth while
       overflow-x is hidden)? Three places do this ON PURPOSE and are named in
       ALLOWED below, each with the reason. Anything else is a defect.

   WHAT IT FOUND, all measured before a rule was written:

     1. THE RETOUCH PAGE'S MAIN ACTION. "V2 RETOUCH — စပြင်မယ်" wants 171px.
        #btnV2Start is flex:1 in a row whose other button takes 159px, so at a
        320px panel it was 85px wide and drew "V2 R…" — the one button that
        starts the page's work, unreadable. .btn carries white-space:nowrap +
        overflow:hidden + text-overflow:ellipsis, and .apg .btn re-states it
        later; the web app's .btn sets no white-space at all, so there the same
        label simply takes a second line. Two things had to change together:
        the label may wrap (white-space:normal), and the button may no longer
        shrink below its own content — overflow:hidden forces a flex item's
        automatic minimum size to zero, so overflow:visible is what actually
        lets min-width:auto mean min-content. The row already carries
        flex-wrap:wrap, so the main action now takes a line of its own: 246px
        at a 320px panel, and every pixel of the label is on it.
     2. THE STUDIO GROUP HEADERS. .stpg #stMuCard .grp-h > span made every
        child flex:0 0 auto, the title included, so a long section name kept
        its full intrinsic width and pushed the badge, the reset and the count
        off the page: "လက်ညှိုးပြင် (Heal & Brush)" made 314px of content in a
        252px header and its "7 ခု" count landed at x=348 with the page ending
        at 304. Four groups across Retouch A and Retouch B. The web app has no
        such bug because it gives its title flex:1;min-width:0 through
        `#stMuCard .grp-h>span:nth-of-type(1)` — UXP has no :nth-of-type and
        this stylesheet is class-and-id only, so the title had no name to be
        addressed by. It carries .grp-t now (in the app's own grp(), which the
        panel lifts) and takes the same rule.
     3. THE LOOK TILES. .stpg .pcard span was written for the caption under a
        card, but the look tile is a <span> in the same .pcard, so it took the
        2px side padding: a 76px picture in a 76px box with 4px of padding has
        a 72px content column and lost 4px off its right edge, on all eight.
     4. AND EVERY OTHER BUTTON LABEL, which the CI runner found before any
        student did. .btn said white-space:nowrap, so a label was ellipsised
        the moment its button was a few pixels short — and how short depends on
        the host's fonts. On this machine "Before/After ၂ ကွက်တွဲ ထုတ်မယ်"
        (#stExp2Up, Retouch A and B) fitted its 252px button exactly; on the CI
        runner's fonts it was 3px over and cut. The web app's .btn has never
        said nowrap: there the label takes a second line. The panel's does the
        same now, with overflow:hidden kept as the backstop, so a label can
        grow downwards but never sideways past its button.

   Fault-injected while writing: undo any one of the three rules and B1/B2 name
   the element, the page and the width; A1–A3 fail on the source. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PCSS = read("panel/styles.css");
const APP = read("docs/app/index.html");
const SUITES = read("panel/js/hnk_studio_suites.js");
const LIFTER = read("tools/build_panel_studio_suites.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));

/* The three boxes that cut their own content on purpose. Each is allowed by
   class, at every width, with the reason it is not a defect. */
const ALLOWED = {
  "im-cmp-top": "the Imagine card's BEFORE layer is clipped to the slider's position — the cut IS the control",
  "s": "the Smart Workflow / V→V card description's three-line ceiling (6.96.0); every cut one carries its own span.ell marker",
  "hsl-val": "the picker's chosen value declares text-overflow:ellipsis, so a long model name ends in a marker rather than stopping mid-word",
  /* #pageAiTools .dash-card .art is an aspect-ratio frame — height:0 with a
     percentage padding-top, its picture and its badge both absolutely placed
     and clipped to it on purpose. There is no text in it to lose, and what
     little its own scrollWidth reports past the frame is the absolutely placed
     badge, which is where the design puts it. */
  "art": "the dashboard card's aspect-ratio picture frame: art and badge are absolutely placed and clipped to the frame by design, and it holds no text"
};

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };

/* ================= A) the three rules, in the source ================= */
function sourcePins() {
  report("A1) no button label is cut: .btn wraps like the web app's, in both places the panel states it — and neither place still says nowrap",
    /white-space: normal;\n  overflow: hidden;\n  text-overflow: clip;/.test(PCSS) &&
    /min-height: 44px; box-sizing: border-box; white-space: normal; overflow: hidden; text-overflow: clip; \}/.test(PCSS) &&
    !/\.btn[^{]*\{[^}]*white-space: nowrap/.test(PCSS),
    { base: /white-space: normal;\n  overflow: hidden;/.test(PCSS), apg: /box-sizing: border-box; white-space: normal;/.test(PCSS) });

  report("A1b) and a row's MAIN action may also take a line of its own — it never shrinks below its own words, which needs overflow:visible because overflow:hidden zeroes a flex item's automatic minimum size",
    /\.btn\.grow \{ white-space: normal; text-overflow: clip; line-height: 1\.25; min-width: auto; overflow: visible; \}/.test(PCSS) &&
    /\.apg \.btn\.grow, #genDock \.btn\.grow \{ white-space: normal; text-overflow: clip; line-height: 1\.25; min-width: auto; overflow: visible; \}/.test(PCSS),
    { unscoped: /\.btn\.grow \{ white-space: normal/.test(PCSS), scoped: /\.apg \.btn\.grow/.test(PCSS) });

  report("A2) the studio group title has a name and is the child allowed to give way, so the count is never pushed off the panel",
    /\.stpg #stMuCard \.grp-h \.grp-t, \.stpg #stEvCard \.grp-h \.grp-t \{ flex: 0 1 auto; min-width: 0; \}/.test(PCSS) &&
    /\.stpg #stMuCard \.grp-h > span, \.stpg #stEvCard \.grp-h > span \{ flex: 0 0 auto; \}/.test(PCSS),
    null);

  report("A3) that name is the web app's own — grp() builds the title as .grp-t in the app, the lifter emits the same class into the panel's copy, and the lifted module carries it",
    /var ttl=el\("span","grp-t"\);/.test(APP) &&
    /repl: \['  var ttl=el\("span","grp-t"\);'/.test(LIFTER) &&
    /var ttl=el\("span","grp-t"\);/.test(SUITES),
    { app: /var ttl=el\("span","grp-t"\)/.test(APP), lifter: /"grp-t"/.test(LIFTER), lifted: /var ttl=el\("span","grp-t"\)/.test(SUITES) });

  report("A4) the look tile is a picture frame, not a caption — the caption rule's side padding is taken back off it",
    /\.stpg \.pcard \.st-tile \{ padding: 0; min-height: 0; \}/.test(PCSS) &&
    /\.stpg \.pcard span \{[\s\S]{0,140}padding: 3px 2px;/.test(PCSS),
    null);

  report("A5) the app still gives its own title the same room, by the selector UXP cannot use — this is the rule the panel is matching, not inventing",
    /#stMuCard \.grp-h>span:nth-of-type\(1\),#stEvCard \.grp-h>span:nth-of-type\(1\)\{order:2;flex:1;min-width:0\}/.test(APP) &&
    /\.grp-h \.cnt\{margin-left:auto/.test(APP), null);
}

/* ================= B) every page, both widths, measured ================= */
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
  for (const W of [320, 400]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    const routes = await page.evaluate(() => PAGES.map(p => [p.key, p.page]));
    const spill = [], cut = [];
    let pagesSeen = 0;
    for (const [key, pid] of routes) {
      await page.evaluate(k => { try { switchPage(k); } catch (e) {} }, key);
      await page.waitForTimeout(600);
      const r = await page.evaluate((args) => {
        const [pid, key] = args;
        const pg = document.getElementById(pid);
        if (!pg) return { key, missing: true };
        const pb = pg.getBoundingClientRect();
        const over = [], cutt = [];
        const name = e => {
          let s = e.tagName.toLowerCase();
          if (e.id) s += "#" + e.id;
          const cn = typeof e.className === "string" ? e.className : "";
          if (cn) s += "." + cn.trim().split(/\s+/).slice(0, 3).join(".");
          return s;
        };
        const all = pg.querySelectorAll("*");
        for (let i = 0; i < all.length; i++) {
          const e = all[i], cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const b = e.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          /* a rail that really scrolls sideways is allowed to run past the page */
          let scroller = null;
          for (let a = e.parentElement; a && a !== pg.parentElement; a = a.parentElement) {
            const acs = getComputedStyle(a);
            if ((acs.overflowX === "auto" || acs.overflowX === "scroll") && a.scrollWidth - a.clientWidth > 2) { scroller = true; break; }
          }
          const sp = Math.round(b.right - pb.right);
          if (sp > 1 && !scroller) over.push({ key, sel: name(e), spill: sp, w: Math.round(b.width), page: Math.round(pb.width) });
          if (e.scrollWidth - e.clientWidth > 2 && cs.overflowX === "hidden" && e.clientWidth > 0) {
            const cls = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/);
            cutt.push({ key, sel: name(e), by: e.scrollWidth - e.clientWidth, box: e.clientWidth, cls });
          }
        }
        return { key, over, cut: cutt };
      }, [pid, key]);
      if (r.missing) continue;
      pagesSeen++;
      r.over.forEach(x => spill.push(x));
      r.cut.forEach(x => cut.push(x));
    }
    /* the three measured boxes, by name */
    await page.evaluate(() => { try { switchPage("retouch"); } catch (e) {} });
    await page.waitForTimeout(600);
    const btn = await page.evaluate(() => {
      const b = document.getElementById("btnV2Start");
      if (!b) return null;
      const cs = getComputedStyle(b);
      return { box: b.clientWidth, content: b.scrollWidth, ws: cs.whiteSpace, ov: cs.overflow, txt: (b.textContent || "").trim() };
    });
    await page.evaluate(() => { try { switchPage("meitu"); } catch (e) {} });
    await page.waitForTimeout(800);
    const studio = await page.evaluate(() => {
      const pg = document.getElementById("pageMeitu"), pb = pg.getBoundingClientRect();
      const counts = [], tiles = [];
      pg.querySelectorAll(".grp-h .cnt").forEach(c => {
        const cs = getComputedStyle(c); if (cs.display === "none") return;
        const b = c.getBoundingClientRect();
        counts.push({ txt: (c.textContent || "").trim(), outside: Math.round(b.right - pb.right) });
      });
      pg.querySelectorAll(".st-tile").forEach(t => {
        const cs = getComputedStyle(t); if (cs.display === "none") return;
        tiles.push({ over: t.scrollWidth - t.clientWidth, pad: cs.paddingLeft });
      });
      const ttl = pg.querySelector(".grp-h .grp-t");
      return { counts, tiles, titled: !!ttl, titleFlex: ttl ? getComputedStyle(ttl).flexShrink : null };
    });
    out[W] = { spill, cut, errs, pagesSeen, btn, studio };
    await ctx.close();
  }
  server.close();

  for (const W of [320, 400]) {
    const o = out[W];
    report("B1) at a " + W + "px panel, all " + o.pagesSeen + " pages: not one box is drawn past its page's right edge, where Photoshop would cut it (a rail that really scrolls is exempt)",
      o.spill.length === 0, o.spill.slice(0, 6));

    const bad = o.cut.filter(c => !c.cls.some(k => Object.prototype.hasOwnProperty.call(ALLOWED, k)));
    report("B2) at " + W + "px, every box that cuts its own content sideways is one of the three that do it on purpose — nothing else",
      bad.length === 0, bad.slice(0, 6));

    report("B3) at " + W + "px the Retouch page's main action shows the whole of \"" + (o.btn && o.btn.txt) + "\" — it wraps and it never shrinks below its own words",
      !!o.btn && o.btn.content - o.btn.box <= 2 && o.btn.ws === "normal" && o.btn.ov === "visible",
      o.btn);

    report("B4) at " + W + "px every Retouch A group count is inside the panel, and the title is the child that gives way",
      o.studio.counts.length > 0 && o.studio.counts.every(c => c.outside <= 0) && o.studio.titled && o.studio.titleFlex === "1",
      { worst: o.studio.counts.slice().sort((a, b) => b.outside - a.outside)[0], titled: o.studio.titled, shrink: o.studio.titleFlex });

    report("B5) at " + W + "px every look tile holds its whole picture — the caption's padding is off it",
      o.studio.tiles.length > 0 && o.studio.tiles.every(t => t.over <= 0 && t.pad === "0px"),
      { n: o.studio.tiles.length, worst: o.studio.tiles.slice().sort((a, b) => b.over - a.over)[0] });

    report("B6) no page error at " + W + "px", o.errs.length === 0, o.errs.slice(0, 4));
  }
}

/* ================= C) the release ================= */
function releasePins() {
  const appVer = JSON.parse(read("docs/app/version.json")).v;
  const panVer = MANIFEST.version;
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("C1) the wave ships in lockstep — web " + appVer + ", panel " + panVer + " across the manifest, panel-version.json and PANEL_VERSION, with this test in the CI sweep and the landing count at 234 or more",
    /^6\.9[6-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.16[7-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    pv.v === panVer && pv.latest_version === panVer &&
    new RegExp('PANEL_VERSION = "' + panVer.replace(/\./g, "\\.") + '"').test(read("panel/main.js")) &&
    CI.indexOf("node test/verify_panel_narrow_fit.js") > 0 && count >= 234,
    { appVer, panVer, pv: pv.v, count, ci: CI.indexOf("node test/verify_panel_narrow_fit.js") > 0 });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
