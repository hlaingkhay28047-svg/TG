/* verify_wf_responsive.js — 6.98.0 / panel 6.169.0
   THE SMART WORKFLOW PAGES, TIDY AND RESPONSIVE.

   The owner, with twelve photographs: "Smartworkflow pages ui ux က ဒီလို မသပ်ရပ်ဘူး
   responsive မဖြစ်နေဘူး သပ်ရပ်အောင်သေချာအသေးစိတ်လုပ်ပေးပါ" — the Smart Workflow pages'
   UI/UX is untidy like this, it is not responsive, please make it tidy, carefully and
   in detail.

   MEASURED FIRST, ON THE PANEL, AT 260 / 300 / 360 / 420 / 700 / 1100 / 1400px. The grid
   came back TWO COLUMNS AT EVERY ONE OF THEM. It could not do anything else: the column
   count was written down twice, as `width: calc(50% - 4px)` in styles.css and as a
   `col === 2` counter in workflow-tools-screen.js, and neither reads the panel's width.
   What that looked like at the two ends:

     300px  card  98 x 243, picture  76 x 51 — two 26px corner discs and a 22px badge
                  over 79% of it, the title broken across two lines, the summary cut
     1400px card 648 x 530, picture 626 x 417, one line of title under it — and the odd
                  card that fills its own row measured 1304 x 967

   THE FIX PUTS THE COUNT IN ONE PLACE AND MAKES IT THE PANEL'S OWN WIDTH. Each card is a
   flex item with a percentage BASIS and flex-grow 1: the basis decides how many fit and
   the growth makes them fill the row exactly, so no calc() is needed (UXP resolves none)
   and nothing has to be recomputed when a filter hides a card. 100% is one column, 44%
   two, 30% three, 22% four, 17% five, stepping at 460 / 700 / 1100 / 1500px. From three
   columns up each card also carries a max-width ceiling, because a group whose count is
   not a multiple of the column count ends on a SHORT row and flex-grow would blow those
   cards up to full width — calc() for the browser, a plain percentage in front of it for
   UXP. (At one and two columns there is no short row: one column is always full, and at
   two the odd card is the spanning one.)

   manifest.json bounds the panel at 300px to 2000px and prefers 340 docked, 360 floating,
   so the one-column card is what a docked Photoshop panel actually shows — the same card
   the owner approved in 6.168.2, 304 x 326 with a 282 x 188 picture instead of 148 x 250
   with a 126 x 84 one — and five columns is the widest case that can exist.

   THE BANNER HAD THE SAME DISEASE ONE ELEMENT UP. hero-wf.jpg is 772 x 248 (3.11:1) and
   this renderer has no object-fit, so the <img> is stretched into whatever box it is
   given. A flat 126px floor is about right at 400px of panel (2.9:1) and a disaster at
   1400 (10.9:1) or 2000 (15:1). The floor now steps with the panel, and at 300px — the
   narrowest the manifest allows — the kicker drops to 8.6px so it stays on two lines
   instead of pushing the banner off its floor.

   THE WEB APP got the same two ends: one column under 380px (measured there as a 108px
   card with a cut summary) and the three-column step moved down from 1024px to 700px
   (a 768px tablet was drawing 328px cards two to a row). The 360 / 390 / 412 phones and
   the 1024 / 1440 / 1800 desktop layers are deliberately untouched — sweep_v492_gridfit
   and verify_desktop_fill C measure those.

   A) the panel's rules   B) the app's rules   C) the panel measured across its whole
   range, with the old rule injected to prove this file would have caught the photographs
   D) the filter still leaves one odd card   E) the banner   F) the release. */
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
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const PMAN = JSON.parse(read("panel/manifest.json"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the panel's rules ================= */
function panelPins() {
  report("A1) the card is a flex item with a percentage basis and no width of its own — the 'two columns' that used to be written into calc(50% - 4px) is gone",
    /\.wfmini \{[^}]*flex: 1 1 100%;[^}]*min-width: 0;/.test(PCSS) &&
    !/\.wfmini \{[^}]*width: calc\(50% - 4px\)/.test(PCSS) &&
    !/\.wfmini:nth-child\(2n\)/.test(PCSS) &&
    !/\.wfmini:nth-child\(-n\+2\)/.test(PCSS), null);

  report("A2) the gaps are margins against a negative container, so the grid still sits flush in its card and the last row costs nothing below it",
    /\.wfgrid \{[^}]*margin: 6px -4px -8px;/.test(PCSS) &&
    /\.wfmini \{[^}]*margin: 0 4px 8px;/.test(PCSS), null);

  const steps = ["460px){ .wfmini { flex: 1 1 44%; }", "700px){ .wfmini, .wfmini.wf-span2 { flex: 1 1 30%;",
                 "1100px){ .wfmini, .wfmini.wf-span2 { flex: 1 1 22%;", "1500px){ .wfmini, .wfmini.wf-span2 { flex: 1 1 17%;"];
  report("A3) one column, then 44 / 30 / 22 / 17 per cent at 460 / 700 / 1100 / 1500px — the ladder is four media queries and nothing else decides it",
    steps.every((t) => PCSS.indexOf("@media (min-width:" + t) > 0), { missing: steps.filter((t) => PCSS.indexOf("@media (min-width:" + t) < 0) });

  /* the UXP idiom: the fallback percentage is declared BEFORE the calc, because UXP
     resolves no calc() and keeps the last value it understood */
  const caps = [["32%", "33.3333% - 8px"], ["24.2%", "25% - 8px"], ["19.4%", "20% - 8px"]];
  report("A4) from three columns up a short last row cannot stretch: a calc ceiling for the browser, with a plain-percentage fallback in front of it for UXP",
    caps.every(([pct, c]) => new RegExp("max-width: " + pct.replace("%", "%") + "; max-width: calc\\(" + c.replace(/[.()%]/g, (m) => "\\" + m) + "\\);").test(PCSS)),
    { caps: caps.map(([p]) => p + ": " + (PCSS.indexOf("max-width: " + p + "; max-width: calc(") > 0)) });

  report("A5) the four #pageAiTools overrides that each restated 'two columns' are gone — no .wf-top, no .wf-r, no hard 100% span",
    !/#pageAiTools \.wfmini\.wf-top/.test(PCSS) && !/#pageAiTools \.wfmini\.wf-r /.test(PCSS) &&
    !/#pageAiTools \.wfmini\.wf-span2 \{ width: 100%/.test(PCSS) &&
    !/#pageAiTools \.wfmini \{ margin: 8px 8px 0 0; \}/.test(PCSS), null);

  report("A6) layoutGrid no longer counts columns — the word column, .wf-top and .wf-r are gone from the screen, and all it does is recompute the odd card from the cards still on screen",
    !/col === 2/.test(SCREEN) && !/wf-top/.test(SCREEN) && !/wf-r"/.test(SCREEN) &&
    /function layoutGrid\(gd\) \{/.test(SCREEN) &&
    /if \(vis\.length % 2 === 1\) vis\[vis\.length - 1\]\.className \+= " wf-span2";/.test(SCREEN) &&
    !/if \(made % 2 === 1/.test(SCREEN), null);

  report("A7) the banner's floor steps with the panel, and the reason is written where the rule is: hero-wf.jpg is 3.11:1 and this renderer stretches it",
    ["520px){ #pageAiTools .hero-mini { min-height: 160px", "700px){ #pageAiTools .hero-mini { min-height: 215px",
     "950px){ #pageAiTools .hero-mini { min-height: 295px", "1200px){ #pageAiTools .hero-mini { min-height: 375px",
     "1500px){ #pageAiTools .hero-mini { min-height: 470px", "1900px){ #pageAiTools .hero-mini { min-height: 600px"]
      .every((t) => PCSS.indexOf("@media (min-width:" + t) > 0) &&
    /THE BANNER KEEPS ITS SHAPE/.test(PCSS) &&
    !/#pageAiTools \.hero-art img \{[^}]*object-fit/.test(PCSS) &&
    /@media \(max-width:319px\)\{ #pageAiTools \.hero-mini \.kick \{ font-size: 8\.6px/.test(PCSS), null);

  report("A8) the ladder is bounded by the panel itself — manifest.json still allows 300px to 2000px and prefers 340 docked",
    PMAN.entrypoints[0].minimumSize.width === 300 && PMAN.entrypoints[0].maximumSize.width === 2000 &&
    PMAN.entrypoints[0].preferredDockedSize.width === 340,
    { min: PMAN.entrypoints[0].minimumSize, max: PMAN.entrypoints[0].maximumSize });
}

/* ================= B) the app's rules ================= */
function appPins() {
  report("B1) the app gets one column under 380px and three from 700px, both with the minmax(0,1fr) floor sweep_v492_gridfit taught",
    /@media\(max-width:379px\)\{\s*\.wfgrid\{grid-template-columns:minmax\(0,1fr\)\}/.test(APP) &&
    /@media\(min-width:700px\)\{\s*\.wfgrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/.test(APP), null);

  report("B2) the odd card is not a different shape where every card already fills the row, and stops spanning once three fit",
    /@media\(max-width:379px\)\{[\s\S]{0,400}?\.wfmini\.wf-span2 \.wfv\{aspect-ratio:3\/2\}/.test(APP) &&
    /@media\(min-width:700px\)\{[\s\S]{0,400}?\.wfgrid \.wf-span2\{grid-column:auto\}/.test(APP), null);

  report("B3) the phone and the desktop layers this wave does not own are untouched: two columns is still the base rule, 1024 / 1440 / 1800 still carry three, four and five",
    /\.wfgrid\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);gap:8px;margin-top:6px\}/.test(APP) &&
    /@media\(min-width:1024px\)\{[\s\S]*?\.wfgrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/.test(APP) &&
    /repeat\(4,minmax\(0,1fr\)\)/.test(APP) && /repeat\(5,minmax\(0,1fr\)\)/.test(APP), null);
}

/* ================= the panel, booted ================= */
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

async function openPanel(browser, server, width, openHeads) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
    : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.addInitScript(UXP_STUB);
  await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash().name); } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
  await page.waitForTimeout(1500);
  await page.evaluate(async (n) => {
    const heads = Array.from(document.querySelectorAll(".app-grp > button, .grp-h, button.grp"));
    for (const h of heads.slice(0, n)) { try { h.click(); } catch (e) { } await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 900));
  }, openHeads === undefined ? 2 : openHeads);
  return { ctx, page, errs };
}

/* one grid, described: how many cards share its first row, how wide they are, whether
   any row is narrower than the first (a stretched or a starved row), and the art ratio */
const GRID_SHAPE = () => {
  const grid = document.querySelector("#pageAiTools .wfgrid");
  if (!grid) return { cards: 0 };
  const R = (el) => el.getBoundingClientRect();
  const cards = Array.from(grid.children).filter((c) => R(c).width > 4 && R(c).height > 4);
  if (!cards.length) return { cards: 0 };
  const plain = cards.filter((c) => String(c.className || "").indexOf("wf-span2") < 0);
  const rows = {};
  cards.forEach((c) => { const t = Math.round(R(c).top); const k = Object.keys(rows).find((x) => Math.abs(+x - t) < 6) || t; (rows[k] = rows[k] || []).push(c); });
  const rowKeys = Object.keys(rows);
  const widths = plain.map((c) => Math.round(R(c).width));
  const gw = Math.round(R(grid).width);
  const arts = cards.map((c) => c.querySelector(".wfv")).filter(Boolean).map((a) => R(a)).filter((r) => r.width > 8 && r.height > 8);
  return {
    cards: cards.length,
    perRow: rows[rowKeys[0]].length,
    rowCounts: rowKeys.map((k) => rows[k].length),
    cardW: widths[0] || 0,
    widthSpread: widths.length ? Math.max.apply(null, widths) - Math.min.apply(null, widths) : 0,
    gridW: gw,
    /* the grid overhangs its card by 4px on each side and every card carries a 4px
       margin, so a FULL row ends exactly 4px inside the grid's right edge. rowOver is
       how far the worst row runs past that line (never above 0), firstRowShort how far
       the first — always full — row falls behind it. */
    rowOver: Math.max.apply(null, rowKeys.map((k) => Math.round(Math.max.apply(null, rows[k].map((c) => R(c).right)) - (R(grid).right - 4)))),
    firstRowShort: Math.round((R(grid).right - 4) - Math.max.apply(null, rows[rowKeys[0]].map((c) => R(c).right))),
    artOff: arts.filter((r) => Math.abs(r.width / r.height - 1.5) > 0.03).length,
    docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
  };
};

/* ================= C) the panel, measured across its whole range ================= */
async function panelWalk(browser, server) {
  /* 300 is manifest minimumSize, 340 preferredDockedSize, 2000 maximumSize */
  const want = { 300: 1, 340: 1, 460: 2, 700: 3, 1100: 4, 1500: 5, 2000: 5 };
  const seen = {}; const errs = [];
  for (const w of Object.keys(want).map(Number)) {
    const s = await openPanel(browser, server, w);
    seen[w] = await s.page.evaluate(GRID_SHAPE);
    errs.push.apply(errs, s.errs);
    await s.page.close(); await s.ctx.close();
  }
  const rows = Object.keys(want).map((w) => w + ": " + seen[w].perRow + " x " + seen[w].cardW);

  report("C1) THE PHOTOGRAPHS, ANSWERED: the grid is one column at 300 and 340px (what a docked Photoshop panel is), two at 460, three at 700, four at 1100 and five at 1500 and 2000",
    Object.keys(want).every((w) => seen[w].cards > 2 && seen[w].perRow === want[w]), { rows, want });

  report("C2) a docked panel's card is the big one the owner approved in 6.168.2, not the 98px one of the photograph — at 300 and 340px one card fills the row, over 190px wide",
    seen[300].cardW >= 190 && seen[340].cardW >= 230 &&
    seen[300].gridW - seen[300].cardW === 8 && seen[340].gridW - seen[340].cardW === 8,
    { at300: seen[300].cardW, at340: seen[340].cardW, grid300: seen[300].gridW, grid340: seen[340].gridW });

  report("C3) NO ROW STRETCHES AND NONE RUNS OVER: within a group every plain card is exactly the same width whatever row it is on (a short last row keeps the card size instead of blowing up to fill), the first row fills the grid, and nothing paints past it",
    Object.keys(want).every((w) => seen[w].widthSpread <= 2 && seen[w].rowOver <= 0 && seen[w].rowOver >= -2 && seen[w].firstRowShort <= 2 && seen[w].firstRowShort >= -1),
    Object.keys(want).map((w) => w + ": spread " + seen[w].widthSpread + " over " + seen[w].rowOver + " short " + seen[w].firstRowShort));

  report("C4) every picture box is still 3:2 at every width — the 6.168.2 fix survives the new ladder — and the page never scrolls sideways",
    Object.keys(want).every((w) => seen[w].artOff === 0 && !seen[w].docOverflow),
    Object.keys(want).map((w) => w + ": off " + seen[w].artOff + " overflow " + seen[w].docOverflow));

  report("C5) nothing threw at any width", errs.length === 0, errs.slice(0, 4));
  return seen;
}

/* ================= C6) the fault, injected ================= */
async function faultWalk(browser, server) {
  const s = await openPanel(browser, server, 340);
  const out = await s.page.evaluate(async () => {
    const R = (el) => el.getBoundingClientRect();
    const grid = document.querySelector("#pageAiTools .wfgrid");
    const card = Array.from(grid.children).find((c) => R(c).width > 4 && String(c.className || "").indexOf("wf-span2") < 0);
    const before = Math.round(R(card).width);
    const st = document.createElement("style");
    /* 6.168.2's rule, put back verbatim */
    st.textContent = ".wfgrid { margin: 6px 0 0 !important; }\n" +
      ".wfmini { flex: none !important; width: calc(50% - 4px) !important; margin: 8px 8px 0 0 !important; max-width: none !important; }\n" +
      ".wfmini:nth-child(2n) { margin-right: 0 !important; }\n" +
      ".wfmini.wf-span2 { width: 100% !important; }";
    document.head.appendChild(st);
    await new Promise((r) => setTimeout(r, 400));
    const after = Math.round(R(card).width);
    const cards = Array.from(grid.children).filter((c) => R(c).width > 4);
    const top = Math.round(R(cards[0]).top);
    const perRow = cards.filter((c) => Math.abs(Math.round(R(c).top) - top) < 6).length;
    st.parentNode.removeChild(st);
    return { before, after, perRow };
  });
  await s.page.close(); await s.ctx.close();
  report("C6) FAULT INJECTED: with the old calc(50% - 4px) rule put back, the same docked panel falls to two columns and the card loses half its width — this file would have caught the owner's photograph",
    out.before >= 230 && out.perRow === 2 && out.after < out.before * 0.6, out);
}

/* ================= D) the filter still leaves exactly one odd card ================= */
async function filterWalk(browser, server) {
  const s = await openPanel(browser, server, 460, 0);   /* two columns, and only the group the page opens by itself */
  const out = await s.page.evaluate(async () => {
    const R = (el) => el.getBoundingClientRect();
    /* every grid on screen: how many cards it is showing, how many of them span, whether
       the spanning one is the last VISIBLE card and really does fill its row — and
       whether it is the grid's own last child, which is the only card 6.168.2 could
       ever have marked (it assigned the class once, at build time). */
    const shape = () => Array.from(document.querySelectorAll("#pageAiTools .wfgrid")).map((g) => {
      const vis = Array.from(g.children).filter((c) => R(c).width > 4 && c.style.display !== "none");
      if (!vis.length) return null;
      const sp = vis.filter((c) => String(c.className || "").indexOf("wf-span2") >= 0);
      return { n: vis.length, spans: sp.length,
        last: sp.length === 1 ? (sp[0] === vis[vis.length - 1]) : null,
        /* the grid overhangs by 4px each side, so a card that fills the row is 8px narrower than it */
        full: sp.length === 1 ? (Math.abs(Math.round(R(sp[0]).width) - (Math.round(R(g).width) - 8)) <= 1) : null,
        moved: sp.length === 1 ? (sp[0] !== g.lastElementChild) : (g.lastElementChild ? String(g.lastElementChild.className || "").indexOf("wf-span2") < 0 : null) };
    }).filter(Boolean);
    const input = document.getElementById("hnkWfSearch");
    if (!input) return { no: true };
    const type = async (v) => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 900)); };
    const before = shape();
    await type("portrait");
    const filtered = shape();
    await type("");
    return { before, filtered, back: shape() };
  });
  const errs = s.errs.slice();
  await s.page.close(); await s.ctx.close();

  const ok = (list) => Array.isArray(list) && list.length > 0 &&
    list.every((g) => (g.n % 2 === 1 ? (g.spans === 1 && g.last === true && g.full === true) : g.spans === 0));
  const f = out.filtered || [];
  report("D1) THE ODD CARD FOLLOWS THE FILTER: before a search, during it and after clearing it, every group on screen with an odd number of visible cards ends in exactly one spanning card that fills its row, and every even group has none",
    !out.no && ok(out.before) && ok(f) && ok(out.back),
    { before: (out.before || []).slice(0, 6), filtered: f.slice(0, 6), back: (out.back || []).slice(0, 6) });

  report("D2) and the search really does reshuffle it — \"portrait\" leaves several groups with both odd and even counts, and in at least one of them the spanning card is NOT the grid's last child, which is the only card the build-time rule could ever mark",
    f.length >= 3 && f.some((g) => g.n % 2 === 1) && f.some((g) => g.n % 2 === 0) && f.some((g) => g.moved === true),
    { groups: f.map((g) => g.n + (g.spans ? "s" : "") + (g.moved ? "*" : "")) });

  report("D3) nothing threw while the filter ran", errs.length === 0, errs.slice(0, 4));
}

/* ================= E) the banner ================= */
async function heroWalk(browser, server) {
  const RATIO = 772 / 248;   /* panel/icons/banners/hero-wf.jpg, measured off the file */
  const at = {}; const errs = [];
  for (const w of [520, 700, 950, 1200, 1500, 1900, 2000]) {
    const s = await openPanel(browser, server, w);
    at[w] = await s.page.evaluate(() => {
      const h = document.querySelector("#pageAiTools .hero-mini");
      if (!h) return null;
      const r = h.getBoundingClientRect();
      const k = document.querySelector("#pageAiTools .hero-mini .kick");
      return { w: Math.round(r.width), h: Math.round(r.height),
        kickLines: k ? Math.round(k.getBoundingClientRect().height / parseFloat(getComputedStyle(k).lineHeight)) : null };
    });
    errs.push.apply(errs, s.errs);
    await s.page.close(); await s.ctx.close();
  }
  const ratios = Object.keys(at).map((w) => +(at[w].w / at[w].h).toFixed(2));
  report("E1) the banner keeps the plate's shape as the panel grows: every step starts at 3.11:1 and none of them runs past 4.4:1 — it was 10.9:1 at 1400 and 15:1 at 2000",
    ratios.every((r) => r >= RATIO - 0.15 && r <= 4.4),
    Object.keys(at).map((w) => w + ": " + at[w].w + "x" + at[w].h + " = " + +(at[w].w / at[w].h).toFixed(2)));

  /* the narrow end: at the manifest's own minimum the kicker stays on two lines */
  const s = await openPanel(browser, server, 300);
  const narrow = await s.page.evaluate(async () => {
    const h = document.querySelector("#pageAiTools .hero-mini");
    const k = document.querySelector("#pageAiTools .hero-mini .kick");
    const rd = () => ({ fs: getComputedStyle(k).fontSize, lines: Math.round(k.getBoundingClientRect().height / parseFloat(getComputedStyle(k).lineHeight)), h: Math.round(h.getBoundingClientRect().height) });
    const now = rd();
    const st = document.createElement("style");
    st.textContent = "@media (max-width:319px){ #pageAiTools .hero-mini .kick { font-size: 9.6px !important; letter-spacing: .10em !important; } }";
    document.head.appendChild(st);
    await new Promise((r) => setTimeout(r, 300));
    const old = rd();
    st.parentNode.removeChild(st);
    return { now, old };
  });
  await s.page.close(); await s.ctx.close();
  report("E2) FAULT INJECTED at 300px, the narrowest panel manifest.json allows: 8.6px keeps the kicker on two lines and the banner on its 126px floor, 9.6px breaks it over three and pushes the floor up",
    narrow.now.lines === 2 && narrow.now.h === 126 && narrow.old.lines === 3 && narrow.old.h > 126, narrow);
  report("E3) nothing threw while the banner was measured", errs.length === 0, errs.slice(0, 4));
}

/* ================= F) the release ================= */
function releasePins() {
  const app = (read("docs/app/index.html").match(/var APP_VER="([\d.]+)";/) || [])[1];
  const pan = (read("panel/main.js").match(/PANEL_VERSION *= *"([\d.]+)"/) || [])[1];
  const esc = (v) => String(v).replace(/\./g, "\\.");
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  report("F1) the wave ships in lockstep and the suite carries this file, counted on the landing page",
    !!app && !!pan && MANIFEST.version === pan &&
    new RegExp('"version": *"' + esc(pan) + '"').test(read("panel/manifest.json")) &&
    new RegExp('"v":"' + esc(app) + '"').test(read("docs/app/version.json")) &&
    steps.has("node test/verify_wf_responsive.js") &&
    String(steps.size) === badge, { app, pan, manifest: MANIFEST.version, steps: steps.size, badge });
}

(async () => {
  panelPins();
  appPins();
  const server = await serve();
  const browser = await chromium.launch();
  try {
    await panelWalk(browser, server);
    await faultWalk(browser, server);
    await filterWalk(browser, server);
    await heroWalk(browser, server);
  } finally { await browser.close(); server.close(); }
  releasePins();
  console.log(failures === 0 ? "ALL PASS" : failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
