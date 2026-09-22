/* verify_album_layout.js — 6.107.0 / panel 6.178.0
   THE ALBUM PAGE, TIDY AND ADJUSTABLE.

   The owner, with three photographs of the live Album page at 6.106.0:
   "မသပ်ရပ်ဘူး professional မဆန်ဘူး ui ux က နောက်ပြီး အရှင်ချိန်လို့ရအောင်လုပ်ပေးပါ
   ဖုန်းကွန်ပျုတာ photoshop မှာ" — it is untidy and unprofessional, and make it
   adjustable, on a phone, a computer and in Photoshop. Asked which of the two
   readings of "အရှင်ချိန်" they meant, they answered "နှစ်ခုလုံး" — both: the layout
   must follow the width, AND the album's page size must be freely set.

   WHAT WAS ACTUALLY WRONG, MEASURED BEFORE ANY OF THIS WAS WRITTEN. A Playwright
   walk over pgAlbum at 340 px (the Photoshop panel's column), 430 px (a phone) and
   1280 px (a monitor) found:

     · nine occasion chips falling 4 / 4 / 1, in a single grid of three different
       heights (61 px where the name fitted one line, 76 px where it wrapped)
     · seven size-group chips over four rows as 1 / 2 / 2 / 2
     · five size chips as 2 / 2 / 1, twelve pairing chips as 3 / 3 / 3 / 2 / 1,
       thirteen template chips as 1 / 2 / 4 / 4 / 2
     · four page buttons 160, 85, 111 and 132 px wide, breaking 3 + 1
     · five export buttons 133 / 133 / 188 / 133 / 133 on a panel and
       543 / 543 / 188 / 543 / 543 on a monitor, in one undifferentiated block
     · a line under the template rail reading "L ပုံစံ · f3i · အလိုအလျောက်" — the
       identifier this build happens to use for a template, printed to a student
     · the occasion's note repeating the whole size line the size card prints one
       card lower, edge to edge
     · a words card 1,465 px tall on a 340 px panel: seven rows of 141 px, each
       giving 92 px of a 306 px column to a label

   WHY THE FIX IS IN SCRIPT AND NOT IN THE STYLESHEET. Every one of those ragged
   rows is a flex-wrap over items of their own natural widths. A grid and a
   breakpoint would fix them on the web — and would do nothing in the Photoshop
   panel this module was written to be lifted into, which draws no CSS grid,
   carries no @media rule in panel/index.html at all, and reads every
   getBoundingClientRect as zero. So the width is measured by the module (albWidth,
   over the 6.79.0 ruler race) and the column count is written onto each rail as
   .alb-c2 … .alb-c9. Even columns by construction, one class doing one thing on
   all three surfaces.

   AND THE SIZE IS THE STUDENT'S. A free size existed before this wave but was
   hidden behind a seventh group chip called "Custom", opened at 12 × 36 inches
   whatever was on screen, and offered four bare number boxes. It is now always on
   the card, seeds from the size being looked at the moment it is touched, and is
   both things the owner asked for: a number you type and a rail you drag — with a
   ratio lock, a swap, the unit and the DPI, and bounds derived from SIDE_MAX
   rather than guessed (sixty inches is allowed at 300 DPI and refused at 600,
   because that is 36,000 px on a side).

   WHAT THIS TEST MEASURES. C2 is the heart of it: for every rail on the page at
   every one of the three widths, every cell the same width and every cell in a row
   the same height. That is a statement about the rendered page, not about the
   source, and it is the thing the owner photographed the absence of. */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const WN = require("./lib/whats-new.js");
const TRL = A.readTrl();
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const READERS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const KEYS = ["alb_size_preset", "alb_size_own", "alb_size_own_note", "alb_size_big",
  "alb_size_max", "alb_swap", "alb_lock", "alb_layout_pick", "alb_layout_of",
  "alb_layout_yours", "alb_out_this", "alb_out_album"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const WEB = "6.107.0";
const PANEL = "6.178.0";
/* the three widths the owner named, in the order they were measured */
const WIDTHS = [["Photoshop panel", 340], ["phone", 430], ["computer", 1280]];
let failures = 0;

function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
/* every block in the app that declares this i18n key, whichever of the two
   dictionaries it lives in (one carries {my,en}, the other the seven others) */
/* 6.122.0 — the seven-language rows (TR_L14) live in data/trmore.js, section l14, since wave G's shelf +
   ornaments pushed the shell over its A4 ceiling; the my/en row still stands in the shell, so a key's
   "two rows" are one in the shell and one in trmore.js */
const L14 = A.readTrMore().l14 || {}, L7 = ["shn", "kac", "th", "zh", "vi", "id", "ms"];
const l14Row = (e) => !!e && L7.every((l) => typeof e[l] === "string" && e[l].length > 0);
const l14Text = (e) => l14Row(e) ? "{" + L7.map((l) => l + ':"' + e[l] + '"').join(",") + "}\n" : "";
function rows(key) {
  const re = new RegExp("[\\n,{]\\s*" + key + ":\\{", "g");
  return (APP.match(re) || []).length + (l14Row(L14[key]) ? 1 : 0);
}
/* the ALBUM_CSS block, and the ALBUM module, on their own */
const CSS = (APP.match(/\/\* ---- ALBUM_CSS[\s\S]*?\/\* ---- \/ALBUM_CSS ---- \*\//) || [""])[0];
/* the block's DECLARATIONS, with its comments taken out: the header comment explains at
   length that the Photoshop panel honours no @media rule, and a scan for "@media" that
   reads the explanation finds the word it was written to forbid. */
const CSSRULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
/* 6.125.0 — the ALBUM module left the shell for docs/app/data/album-module.js (the A4 ceiling) */
const MOD = read("docs/app/data/album-module.js");

/* ======================= A — what the source must say ======================= */
function source() {
  report("A0) the two blocks this test reads were found: the album's stylesheet and the album module itself",
    CSS.length > 3000 && MOD.length > 60000, { css: CSS.length, mod: MOD.length });

  const cols = [2, 3, 4, 5, 6, 7, 8, 9].filter(n => CSS.indexOf(".alb-c" + n + " .alb-cell{width:") >= 0);
  report("A1) the column system is eight declared widths (.alb-c2 … .alb-c9) over one cell rule, and the cell carries the gutter so the control can fill it",
    cols.length === 8 &&
    /\.alb-grid\{display:flex;flex-wrap:wrap;align-items:stretch/.test(CSS) &&
    /\.alb-cell\{box-sizing:border-box;display:flex;width:100%/.test(CSS) &&
    /\.alb-cell>button,\.alb-cell>div,\.alb-cell>label,\.alb-cell>span\{width:100%/.test(CSS), { cols });   /* 6.122.0 — typed children; the panel's renderer forbids `*` */

  report("A2) NOTHING in the album's stylesheet is a CSS grid or a media query — the Photoshop panel draws no grid and panel/index.html carries no @media rule at all, so either would be tidy on a phone and ragged in Photoshop",
    CSSRULES.indexOf("display:grid") < 0 && CSSRULES.indexOf("grid-template") < 0 &&
    CSSRULES.indexOf("@media") < 0 &&
    (read("panel/index.html").match(/@media/g) || []).length === 0, {
      grid: CSSRULES.indexOf("display:grid"), media: CSSRULES.indexOf("@media"),
      panelMedia: (read("panel/index.html").match(/@media/g) || []).length });

  report("A3) the width is raced for, not assumed: the album root's own clientWidth, then the host's ruler, then innerWidth · outerWidth · the visual viewport · a matchMedia binary search, and only then the panel's own 340",
    /function albViewportW\(\)/.test(MOD) &&
    /window\.outerWidth/.test(MOD) && /visualViewport/.test(MOD) &&
    /matchMedia\("\(min-width: "\+mid\+"px\)"\)/.test(MOD) &&
    /var ALB_FALLBACK_W = 340;/.test(MOD) &&
    /function albWidth\(\)\{[\s\S]{0,200}el\.clientWidth > 0\) return el\.clientWidth;/.test(MOD) &&
    /H\.stageWidth === "function"/.test(MOD), null);

  report("A4) whole rows where the count allows: evenCols takes the cap the width earns and returns the largest divisor at or below it, which is why nine occasions are three rows of three and not the 4 / 4 / 1 the owner photographed",
    /function evenCols\(n, cap\)/.test(MOD) && /function albCap\(kind, w\)/.test(MOD) &&
    /function albCols\(kind, n, w\)\{ return evenCols\(n, albCap\(kind, \(w > 0\) \? w : albWidth\(\)\)\); \}/.test(MOD) &&
    /function grid\(kind, items, w\)/.test(MOD) &&
    /"alb-grid alb-c" \+ albCols\(kind, items\.length, w\)/.test(MOD), null);

  report("A5) one measurement per render, and a resize only rebuilds when it crosses a column boundary — render() replaces every node, so a one-pixel window drag must not take the caret out of a caption being typed",
    /BUCKET = widthBucket\(albWidth\(\)\);/.test(MOD) &&
    /function widthBucket\(w\)/.test(MOD) &&
    /if \(widthBucket\(albWidth\(\)\) === BUCKET\) \{ repaint\(\); return; \}/.test(MOD) &&
    /if \(!RESIZE_BOUND && typeof window !== "undefined"/.test(MOD) &&
    /addEventListener\("resize", onResize, false\); RESIZE_BOUND = true;/.test(MOD), null);

  report("A6) the template identifier is gone from the student's line — what is printed is the family's name, how many photographs the layout holds and whether the page chose it or they did",
    MOD.indexOf('pick9(D.fams[tpl.fam] || {}) + " · " + tpl.id') < 0 &&
    /L\("alb_layout_of"\)\.replace\("\{N\}", String\(tpl\.cells\.length\)\)/.test(MOD) &&
    /pg\.auto \? L\("alb_auto"\) : L\("alb_layout_yours"\)/.test(MOD), null);

  report("A7) the occasion's note no longer repeats the size line the size card prints one card lower, and the size card's own line no longer repeats the headline above it",
    /note\.textContent = pick9\(cur\.note\) \+ \(pr \? \(" \\u00b7 " \+ pick9\(pr\.label\)\) : ""\);/.test(MOD) &&
    /function sizeLine\(sz, px\)\{[\s\S]{0,160}if \(sz\.unit !== "px"\) parts\.push/.test(MOD), null);

  report("A8) the free size is bounded by arithmetic, not by a guess: a side ceiling, a megapixel warning, a span per unit, and a ceiling per unit derived from the two",
    /var SIDE_MAX = 24000;/.test(MOD) && /var MP_WARN  = 120;/.test(MOD) &&
    /var UNIT_SPAN = \{ "in":/.test(MOD) &&
    /function unitToPx\(v, unit, dpi\)/.test(MOD) && /function pxToUnit\(px, unit, dpi\)/.test(MOD) &&
    /function unitMax\(unit, dpi\)/.test(MOD) && /function sizeWarning\(px\)/.test(MOD), null);

  report("A9) touching the free size copies in the size on screen first, so dragging moves the page the student is looking at rather than the 12 × 36 panorama the old Custom group opened with",
    /function seedCustom\(\)\{[\s\S]{0,400}var sz = curSize\(\)[\s\S]{0,200}DOC\.sizeId = "custom";/.test(MOD) &&
    /\[au, bb\], w\)/.test(MOD), null);

  report("A10) Custom is no longer one of the size groups — it is the block under them, always on the card",
    /if \(g\.id === "custom"\) return;/.test(MOD) &&
    MOD.indexOf('if (id === "custom"){ DOC.sizeId = "custom"; }') < 0, null);

  report("A11) a stored custom size is read back against its own unit's bounds — wave A clamped every one of them to 1..120, which silently turned a 2048 px page into a 120 px one the moment the control could ask for pixels",
    /var csp = UNIT_SPAN\[cu\] \|\| UNIT_SPAN\["in"\], clim = unitMax\(cu, cd\);/.test(MOD) &&
    MOD.indexOf("clamp(+d.custom.w||12,1,120)") < 0, null);

  const both = KEYS.filter(k => rows(k) !== 2);
  const packGaps = [];
  READERS.forEach(code => KEYS.forEach(k => { if (!TRL[code] || !TRL[code][k]) packGaps.push(code + "/" + k); }));
  report("A12) all twelve new lines exist in both of the app's dictionaries and in every one of the fifteen reader packs",
    both.length === 0 && packGaps.length === 0, { both, packGaps: packGaps.slice(0, 12) });

  const ph = [];
  KEYS.forEach(k => {
    const en = (APP.match(new RegExp("[\\n,{]\\s*" + k + ':\\{my:"[^"]*",en:"([^"]*)"')) || [])[1] || "";
    const want = (en.match(/\{[A-Z]\}/g) || []).sort().join(",");
    READERS.forEach(code => {
      const got = ((TRL[code] || {})[k] || "").match(/\{[A-Z]\}/g) || [];
      if (got.sort().join(",") !== want) ph.push(code + "/" + k);
    });
  });
  report("A13) every reader pack carries the same placeholders as the English for each of the twelve — a line that loses {N} or {W} prints a sentence with a hole in it",
    ph.length === 0, { ph: ph.slice(0, 12) });
}

/* ======================= B — the arithmetic, through the shipped functions ======================= */
async function maths(page) {
  const m = await page.evaluate(() => {
    const M = ALBUM.math;
    return {
      nine4: M.evenCols(9, 4), nine9: M.evenCols(9, 9), nine6: M.evenCols(9, 6),
      twelve6: M.evenCols(12, 6), twelve4: M.evenCols(12, 4), seven4: M.evenCols(7, 4),
      one: M.evenCols(1, 4), zero: M.evenCols(0, 4),
      capOcc: [340, 430, 700, 1280].map(w => M.albCap("occ", w)),
      capSize: [340, 430, 700, 1280].map(w => M.albCap("size", w)),
      capBtn: [340, 430, 700, 1280].map(w => M.albCap("btn", w)),
      bucket: [339, 340, 379, 380, 559, 560, 819, 820, 1280].map(M.widthBucket),
      inPx: M.unitToPx(8, "in", 300), cmPx: Math.round(M.unitToPx(10, "cm", 300)),
      mmPx: Math.round(M.unitToPx(100, "mm", 300)), pxPx: M.unitToPx(2048, "px", 72),
      round: ["in", "cm", "mm", "px"].map(u => {
        const px = M.unitToPx(12, u, 300);
        return Math.abs(M.pxToUnit(px, u, 300) - 12) < 1e-9;
      }),
      max300: M.unitMax("in", 300), max600: M.unitMax("in", 600), maxMm72: M.unitMax("mm", 72),
      warnNone: M.sizeWarning({ w: 2400, h: 3600, dpi: 300 }),
      warnBig: M.sizeWarning({ w: 20000, h: 19000, dpi: 300 }),
      warnMax: M.sizeWarning({ w: 30000, h: 1000, dpi: 300 })
    };
  });

  report("B1) nine occasions at a cap of four is three tidy rows of three; at nine it is one row of nine; a prime count falls back to the cap it earned",
    m.nine4 === 3 && m.nine9 === 9 && m.nine6 === 3 && m.twelve6 === 6 && m.twelve4 === 4 &&
    m.seven4 === 4 && m.one === 1 && m.zero === 1, m);

  report("B2) every rail's cap grows with the width and never shrinks — a wider window can only ever earn more columns",
    [m.capOcc, m.capSize, m.capBtn].every(a => a.every((v, i) => i === 0 || v >= a[i - 1])) &&
    m.capOcc[0] === 4 && m.capOcc[3] === 9 && m.capSize[0] === 2 && m.capBtn[0] === 2 && m.capBtn[3] === 4,
    { occ: m.capOcc, size: m.capSize, btn: m.capBtn });

  report("B3) the four width buckets break exactly at 380, 560 and 820, so a resize inside one of them never replaces the page",
    JSON.stringify(m.bucket) === JSON.stringify([0, 0, 0, 1, 1, 2, 2, 3, 3]), m.bucket);

  report("B4) the unit arithmetic is exact in both directions for all four units — 8 in at 300 DPI is 2400 px, 10 cm is 1181, 100 mm is 1181, and a pixel size is itself",
    m.inPx === 2400 && m.cmPx === 1181 && m.mmPx === 1181 && m.pxPx === 2048 &&
    m.round.every(Boolean), m);

  report("B5) the ceiling per unit is derived, not declared: sixty inches is allowed at 300 DPI and refused at 600, because the same page is 18,000 px on one and 36,000 on the other",
    m.max300 === 60 && m.max600 === 40 && m.maxMm72 === 1500, m);

  report("B6) a page inside the bounds says nothing, a 380-megapixel page says so in the student's own language, and a side past the ceiling says which ceiling",
    m.warnNone === "" && /380/.test(m.warnBig) && m.warnBig.length > 20 &&
    /24000/.test(m.warnMax), { none: m.warnNone, big: m.warnBig, max: m.warnMax });
}

/* ======================= C — the rendered page, at all three widths ======================= */
/* WHAT A RAIL MUST BE. Not only "every cell the same width" — a rail that fell back to one
   full-width cell per row satisfies that trivially, which is exactly what the first draft of
   this check let through when the column class was deleted to test it. So the rendered rows
   are tied to the DECLARED column count: the rail must carry an .alb-cN class, its cells must
   sit in ceil(n / N) rows, every row but the last must hold exactly N of them, and every cell
   in a row must be one width and one height. Returns the offenders. */
const RAIL_PROBE = `(() => {
  const bad = [];
  const rails = document.querySelectorAll("#albRoot .alb-grid");
  document.querySelectorAll("#albRoot .alb-grid").forEach(rail => {
    const cells = [...rail.children].filter(c => c.getBoundingClientRect().width > 0);
    if (cells.length < 2) return;
    const id = (rail.id || rail.className);
    const m = String(rail.className || "").match(/\\balb-c(\\d)\\b/);
    if (!m) { bad.push({ rail: id, kind: "no-column-class", cls: String(rail.className || "") }); return; }
    const cols = Number(m[1]);
    const w0 = Math.round(cells[0].getBoundingClientRect().width);
    cells.forEach((c, i) => {
      const w = Math.round(c.getBoundingClientRect().width);
      if (Math.abs(w - w0) > 1) bad.push({ rail: id, kind: "width", i, w, w0 });
    });
    const byTop = {};
    cells.forEach(c => {
      const r = c.getBoundingClientRect(), t = Math.round(r.top);
      (byTop[t] = byTop[t] || []).push(Math.round(r.height));
    });
    const tops = Object.keys(byTop).map(Number).sort((a, b) => a - b);
    const want = Math.ceil(cells.length / cols);
    if (tops.length !== want) bad.push({ rail: id, kind: "rows", cols, n: cells.length, rows: tops.length, want });
    tops.forEach((t, i) => {
      const hs = byTop[t];
      if (Math.max(...hs) - Math.min(...hs) > 1) bad.push({ rail: id, kind: "height", top: t, hs });
      const expect = (i < tops.length - 1) ? cols : (cells.length - cols * (tops.length - 1));
      if (hs.length !== expect) bad.push({ rail: id, kind: "per-row", cols, row: i, got: hs.length, expect });
    });
  });
  return { rails: rails.length, bad: bad };
})()`;

async function walkWidth(browser, label, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 940 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__albShot = function (w, h, a, b) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, a); g.addColorStop(1, b);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.9);
    };
  });
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    await ALBUM.accept([window.__albShot(800, 600, "#22304f", "#e9dcc4"),
                        window.__albShot(600, 800, "#3b2a2a", "#f0e6d8"),
                        window.__albShot(700, 700, "#1e3b2e", "#dfeade")], "page");
  });
  await page.waitForTimeout(800);

  const probe = await page.evaluate(RAIL_PROBE);
  report("C1/" + label + " (" + width + "px) — the page is built out of rails, and every one of them is even columns: a declared column count, ceil(n / N) rows, N cells in every row but the last, one width throughout and one height per row",
    probe.rails >= 8 && probe.bad.length === 0, { rails: probe.rails, bad: probe.bad.slice(0, 8) });

  const over = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("#albRoot section.card").forEach(card => {
      if (card.scrollWidth > card.clientWidth + 1) out.push({ card: card.id, sw: card.scrollWidth, cw: card.clientWidth });
      /* a .hsl picker parks its native <select> inside itself at opacity 0 (the 6.78.0 rule —
         Photoshop never opens one), so the wrapper's scrollWidth counts text nobody can see */
      card.querySelectorAll("button, .chip, h2, p, input, span").forEach(el => {
        if (el.closest(".hsl")) return;
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
          out.push({ card: card.id, el: el.id || el.className, sw: el.scrollWidth, cw: el.clientWidth,
                     txt: (el.textContent || "").trim().slice(0, 30) });
      });
    });
    return out;
  });
  report("C2/" + label + " — no card and no label on the page paints outside its own box",
    over.length === 0, over.slice(0, 8));

  const lines = await page.evaluate(() => ({
    layout: (document.getElementById("albLayoutNote") || {}).textContent || "",
    occ: (document.getElementById("albOccNote") || {}).textContent || "",
    size: (document.getElementById("albSizeNote") || {}).textContent || "",
    val: (document.getElementById("albSizeVal") || {}).textContent || "",
    tplIds: [...document.querySelectorAll("#albTpls [id^=albTpl_]")].map(b => b.id.replace("albTpl_", ""))
  }));
  report("C3/" + label + " — the layout line names the family and the count and no longer prints the template identifier the owner photographed",
    lines.layout.length > 4 &&
    lines.tplIds.length > 0 &&
    !lines.tplIds.some(id => lines.layout.indexOf(id) >= 0), lines);
  report("C4/" + label + " — the occasion's note is the occasion's own two facts, and the size is said once: a headline, then everything the size decides that is not the size itself",
    lines.occ.indexOf("DPI") < 0 && lines.occ.indexOf(lines.val) < 0 &&
    /\d/.test(lines.val) && /DPI/.test(lines.size) &&
    lines.size.indexOf(lines.val) < 0, lines);

  const groups = await page.evaluate(() => {
    const w = id => [...document.querySelectorAll("#" + id + " button")].map(b => Math.round(b.getBoundingClientRect().width));
    return { one: w("albOutOne"), all: w("albOutAll"), pages: w("albPageOps"),
             subs: [...document.querySelectorAll("#albExportCard .subh")].map(p => (p.textContent || "").trim()) };
  });
  /* 6.125.0 — the card names a third group first: the file type, its quality and the three switches.
     The five buttons and their two groups are unchanged. */
  report("C5/" + label + " — the five export buttons are two named groups (what this page makes, what the whole album makes) under the file-type group, and every button inside a group is one width",
    groups.subs.length === 3 && groups.subs.every(t => t.length > 0) &&
    groups.one.length === 3 && groups.all.length === 2 && groups.pages.length === 4 &&
    new Set(groups.one).size === 1 && new Set(groups.all).size === 1 && new Set(groups.pages).size === 1,
    groups);

  report("C6/" + label + " — nothing threw while the page was built at this width",
    errs.length === 0, errs);
  await ctx.close();
}

/* the free size, driven exactly as a student would drive it */
async function freeSize(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(600);

  const fire = (id, v, ev) => page.evaluate(([i, val, e]) => {
    const el = document.getElementById(i); el.value = val;
    el.dispatchEvent(new Event(e, { bubbles: true }));
  }, [id, v, ev]);
  const doc = () => page.evaluate(() => ({ id: ALBUM.doc().sizeId, c: ALBUM.doc().custom,
    lock: !!ALBUM.doc().lockRatio, val: (document.getElementById("albSizeVal") || {}).textContent }));

  await page.evaluate(() => {
    [...document.querySelectorAll("#albGroups .chip")].find(c => /Upright/i.test(c.textContent)).click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    [...document.querySelectorAll("#albSizes .chip")].find(x => x.textContent.trim() === "8 × 12 in").click();
  });
  await page.waitForTimeout(250);
  const preset = await doc();

  await fire("albFreeW", "10", "input");
  await page.waitForTimeout(300);
  const typed = await doc();
  report("C7) typing a width switches to the free size AND seeds it from the preset on screen — the old Custom group opened at 12 × 36 whatever the student was looking at",
    preset.id === "8x12" && typed.id === "custom" &&
    typed.c.w === 10 && typed.c.h === 12 && typed.c.unit === "in" && typed.c.dpi === 300,
    { preset, typed });

  await fire("albRangeH", "20", "input");
  await page.waitForTimeout(300);
  const dragged = await doc();
  report("C8) the height rail drags the page, and the headline follows it — the owner asked for both a number to type and a rail to drag",
    dragged.c.h === 20 && /10 × 20 in/.test(dragged.val), dragged);

  await page.evaluate(() => document.getElementById("albLock").click());
  await page.waitForTimeout(250);
  await fire("albRangeW", "5", "input");
  await page.waitForTimeout(300);
  const locked = await doc();
  report("C9) with the lock on, dragging one side takes the other with it at the same proportion — 10 × 20 halved is 5 × 10, not 5 × 20",
    locked.lock === true && locked.c.w === 5 && locked.c.h === 10, locked);

  await page.evaluate(() => document.getElementById("albLock").click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById("albSwap").click());
  await page.waitForTimeout(300);
  const swapped = await doc();
  report("C10) the swap turns the page on its side and nothing else",
    swapped.c.w === 10 && swapped.c.h === 5 && swapped.c.unit === "in", swapped);

  const before = await page.evaluate(() => { const c = ALBUM.doc().custom;
    return ALBUM.math.pagePx({ w: c.w, h: c.h, unit: c.unit, dpi: c.dpi }); });
  await fire("albCustomUnit", "cm", "change");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const c = ALBUM.doc().custom;
    return { c, px: ALBUM.math.pagePx({ w: c.w, h: c.h, unit: c.unit, dpi: c.dpi }) }; });
  report("C11) changing the unit does not change the page — eight inches asked for in centimetres is 20.32 cm, and the pixels the printer gets are exactly the ones they were",
    after.c.unit === "cm" && after.px.w === before.w && after.px.h === before.h &&
    after.c.w !== 10, { before, after });

  await fire("albCustomUnit", "px", "change");
  await page.waitForTimeout(300);
  await fire("albFreeW", "99999", "input");
  await page.waitForTimeout(300);
  await fire("albFreeH", "19000", "input");
  await page.waitForTimeout(300);
  const huge = await page.evaluate(() => ({ c: ALBUM.doc().custom,
    warn: (document.getElementById("albSizeWarn") || {}).textContent || "",
    canvas: (() => { const v = document.getElementById("albCanvas"); return { w: v.width, h: v.height }; })() }));
  report("C12) a page nobody's machine could finish is clamped where it is asked for, and the card says so before forty of them are laid out — rather than a browser running out of canvas half way through a PDF",
    huge.c.w === 20000 && huge.c.h === 19000 && /380/.test(huge.warn) && huge.warn.length > 20 &&
    huge.canvas.w > 0 && huge.canvas.h > 0, huge);

  report("C13) nothing threw while the free size was typed, dragged, locked, swapped, re-united and pushed past its ceiling",
    errs.length === 0, errs);
  await ctx.close();
}

/* the page follows the window across a column boundary, and only across one */
async function reflow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 940 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(600);
  const klass = () => page.evaluate(() => (document.getElementById("albOccs") || {}).className || "");
  const wide = await klass();
  await page.setViewportSize({ width: 360, height: 940 });
  await page.waitForTimeout(500);
  const narrow = await klass();
  const probe = await page.evaluate(RAIL_PROBE);
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.waitForTimeout(500);
  const back = await klass();
  report("C14) the page follows the window: the occasion rail is a different column count on a monitor and on a phone, it comes back when the window does, and every rail is still even columns after the reflow",
    wide !== narrow && wide === back && /alb-c\d/.test(wide) && /alb-c\d/.test(narrow) &&
    probe.rails >= 8 && probe.bad.length === 0, { wide, narrow, back, rails: probe.rails, bad: probe.bad.slice(0, 4) });
  await ctx.close();
}

async function browserWalk() {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  withPremium(browser);
  try {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(900);
    await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
    await page.waitForTimeout(400);
    await maths(page);
    await ctx.close();
    for (const [label, width] of WIDTHS) await walkWidth(browser, label, width);
    await freeSize(browser);
    await reflow(browser);
  } finally { await browser.close(); }
}

/* ======================= D — the release ======================= */
function release() {
  const web = JSON.parse(read("docs/app/version.json")).v;
  /* 6.108.0 — THIS WAS A FROZEN PAIR WEARING A LOCKSTEP NAME. It read
     `web === WEB && MANIFEST.version === PANEL` against the two literals this
     wave happened to ship, so it said nothing about the two moving together and
     went red on the very next release — the same mistake verify_album_output
     carried until 6.107.0 rewrote it, repeated here one file away. What it
     should say is that the app is what version.json says, that the panel is
     what its own manifest says, and that both are at or past the pair this wave
     shipped. */
  const cmp = (a, b) => {
    const x = String(a).split("."), y = String(b).split(".");
    for (let i = 0; i < 3; i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; }
    return 0;
  };
  report("D1) the web app and the panel move together — each is what its own file declares, and both are at or past the 6.107.0 / 6.178.0 this wave shipped",
    web === JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "app", "version.json"), "utf8")).v &&
    cmp(web, WEB) >= 0 && cmp(MANIFEST.version, PANEL) >= 0,
    { web, panel: MANIFEST.version, floor: WEB + " / " + PANEL });

  report("D2) this test runs in CI, after the album tests it builds on",
    /node test\/verify_album_layout\.js/.test(CI) &&
    CI.indexOf("verify_album_output.js") < CI.indexOf("verify_album_layout.js"), null);

  const n = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []).size;
  const badge = Number((LANDING.match(/"badge\.tests":\s*\{"my":\s*"(\d+) tests green/) || [])[1] || 0);
  report("D3) the landing site's count is the number of tests CI actually runs",
    n === badge && n >= 249, { ciTests: n, badge });

  const row = WN.appRow("6.107.0", "pgAlbum");
  const missing = LANGS.filter(L => !new RegExp("[,{]" + L + ':"').test(row.split("s:{")[0]) ||
                                    !new RegExp("[,{]" + L + ':"').test("s:{" + (row.split("s:{")[1] || "")));
  report("D4) the What's New row for this release is written in all nine base languages, title and body, and points at the Album page",
    row.length > 1200 && missing.length === 0, { bytes: row.length, missing });
}

(async () => {
  source();
  await browserWalk();
  release();
  console.log(failures === 0 ? "\nALL PASS — the album page is even columns on a panel, a phone and a monitor, and its size is the student's to set" : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("FAIL — harness :: " + (e && e.stack || e)); process.exit(1); });
