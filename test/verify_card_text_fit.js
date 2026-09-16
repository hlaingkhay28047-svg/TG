/* verify_card_text_fit.js — 6.96.4 / panel 6.167.4
   A CARD NEVER PAINTS OUTSIDE ITSELF.

   THE DEFECT the owner photographed on 6.167.3, one wave after the cards came back:
   every Smart Workflow card drew its description straight out of the card — a line of
   words below the card's own border, sliced by the row beneath it — with no ellipsis
   anywhere and no "Open" pill on the card at all.

   THE CAUSE. Marking a cut is not the same as making one. The clamp was two rules that
   only ever worked together:

       .wfmini .s { max-height: 6.75em; overflow: hidden }   (the renderer hides the rest)
       ellMark()                                            (and we mark what it hid)

   ellMark asks the only honest question there is — scrollHeight against clientHeight —
   and Photoshop's renderer answered that nothing was hidden, because nothing was: it
   laid the box out at its ceiling and painted the whole sentence anyway. So the marker
   correctly stayed away, the words ran past the frame, and everything the flow put after
   that box — the "Open" pill — was pushed outside the card. In Chromium the renderer
   does hide the rest, which is why every walk and every test had agreed with itself.

   THE FIX: the measurement now has two answers instead of one.
     · the renderer hid the rest        → mark it, exactly as before, or
     · the renderer hid nothing AND the box is over its own ceiling
                                        → cut the WORDS, at a space, until the box fits,
                                          and put the marker on that.
   A box we ask to hide its overflow may decline. A string that is already short enough
   cannot. ELL_FULL keeps the whole sentence so a second pass never cuts a cut string
   twice, and every call site now names its line budget (3 for a card, 5 for an Imagine
   summary) so the ceiling is known even where this renderer reports no max-height.

   THE PROOF is B2. The walk pins each card's frame at the height the ceiling implied —
   Photoshop's did not grow — then withdraws the clipping and runs the marker again.
   With 6.167.3's marker that leg reports descriptions past the frame, pills outside
   their cards and not one ellipsis: the owner's photograph. With this one it reports
   none of the three, and the cards that really are cut still say so. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));

/* Photoshop's renderer, as the photograph describes it: the box keeps its place in the
   flow and paints its whole sentence anyway. No !important on the ceiling — the point is
   that nothing here is hidden, not that a rule was overridden. */
const NO_CLIP = ".wfmini .s { overflow: visible !important; max-height: none !important; }";

/* 6.167.3's marker, verbatim: it marks what the renderer hid, and does nothing else. */
const OLD_MARK = function () {
  window.HNK.ellMark = function (root, sel) {
    try {
      var list = (root || document).querySelectorAll(sel);
      Array.prototype.forEach.call(list, function (n) {
        try {
          var o = n.querySelector(".ell"); if (o && o.parentNode) o.parentNode.removeChild(o);
          var lh = parseFloat(getComputedStyle(n).lineHeight) || 16;
          if (n.scrollHeight - n.clientHeight > lh / 2) {
            var e = document.createElement("span"); e.className = "ell"; e.textContent = "…"; n.appendChild(e);
          }
        } catch (e) { }
      });
    } catch (e) { }
  };
};

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };

/* ================= A) the rule, in the source ================= */
function sourcePins() {
  report("A1) the panel's marker cuts the words when the renderer hid nothing — the ceiling, the whole sentence kept, the cut at a space",
    /const ELL_FULL = new WeakMap\(\);/.test(MAIN) &&
    /function ellCeil\(n, lines\) \{/.test(MAIN) &&
    /const ceil = \(mh > 0 && isFinite\(mh\)\) \? mh : \(lines > 0 \? lines \* lh : 0\);/.test(MAIN) &&
    /\} else if \(m\.ceil > 0 && n\.clientHeight > m\.ceil \+ m\.lh \/ 2\) \{/.test(MAIN) &&
    /if \(sp > 12\) s = s\.slice\(0, sp\);/.test(MAIN),
    { weakmap: /ELL_FULL = new WeakMap/.test(MAIN), ceil: /function ellCeil/.test(MAIN) });

  report("A2) and it still marks, first, whatever the renderer really did hide — half a line, never a pixel",
    /if \(n\.scrollHeight - n\.clientHeight > m\.lh \/ 2\) \{\s*\n\s*cut = true;/.test(MAIN) &&
    /const full = ELL_FULL\.has\(n\) \? ELL_FULL\.get\(n\) : \(n\.textContent \|\| ""\);/.test(MAIN) &&
    /ELL_FULL\.set\(n, full\);/.test(MAIN), null);

  report("A3) the web app carries the identical rule, so both surfaces cut the same sentence at the same word",
    /var ELL_FULL=new WeakMap\(\);/.test(APP) &&
    /function ellCeil\(n, lines\)\{/.test(APP) &&
    /else if\(m\.ceil>0 && n\.clientHeight>m\.ceil\+m\.lh\/2\)\{/.test(APP) &&
    /if\(sp>12\) t=t\.slice\(0,sp\);/.test(APP), null);

  const appBudget = (APP.match(/ellMark\((?:wfHost|tg\.g), "\.wfmini \.s", 3\)/g) || []).length;
  report("A4) every call site names its line budget, so the ceiling is known even where this renderer reports no max-height",
    appBudget >= 5 && /H\.ellMark\(root, "\.im-card-sum", 5\)/.test(APP) &&
    /ellMark: function\(root, sel, lines\)\{ ellMark\(root, sel, lines\); \}/.test(APP) &&
    /ellMark: function \(root, sel, lines\) \{ ellMark\(root, sel, lines\); \}/.test(MAIN) &&
    (SCREEN.match(/em\((?:g|root), "\.wfmini \.s", 3\)/g) || []).length === 2,
    { appBudget, screen: (SCREEN.match(/em\((?:g|root), "\.wfmini \.s", 3\)/g) || []).length });

  report("A5) the stylesheet still states the ceiling it always stated — the cut is a second answer, not a replacement",
    /\.wfmini \.s \{ position: relative; display: block; margin-top: 4px; margin-bottom: 4px; max-height: 6\.75em;/.test(read("panel/styles.css")),
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
    for (const mode of ["shipped", "old-marker"]) {
      /* 6.169.0 — this walk used to run at 400px, where the grid was two columns at
         every width and a 148px card cut most of its summaries. The responsive ladder
         makes 400px ONE column: a 304px card, and none of the nine summaries reaches
         its three-line ceiling, so there is nothing for the clamp to do and nothing to
         measure. 460px is the first two-column step (178px cards, 3 of the 9 cut), which
         is the shape this file exists for — a card narrow enough that its words do not
         fit. The card, the clamp and the marker are all unchanged; only the width at
         which they are exercised moved. */
      const ctx = await browser.newContext({ viewport: { width: 460, height: 1100 } });
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
      await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
        : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.addInitScript(UXP_STUB);
      await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
      await page.waitForTimeout(2200);
      await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
      await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
      await page.waitForTimeout(1600);

      const measure = () => page.evaluate(() => {
        const pg = document.getElementById("pageAiTools");
        const cards = [].slice.call(pg.querySelectorAll(".wfmini")).filter(c => c.getBoundingClientRect().height > 0);
        let sPastCard = 0, worstPx = 0, pillOutside = 0, pillMissing = 0, marked = 0;
        for (const c of cards) {
          const cr = c.getBoundingClientRect(), s = c.querySelector(".s"), go = c.querySelector(".go");
          if (s) {
            const past = Math.round(s.getBoundingClientRect().bottom - cr.bottom);
            if (past > 0.6) { sPastCard++; if (past > worstPx) worstPx = past; }
            if (s.querySelector(".ell")) marked++;
          }
          if (!go) pillMissing++;
          else if (go.getBoundingClientRect().bottom > cr.bottom + 0.6) pillOutside++;
        }
        return { cards: cards.length, sPastCard, worstPx, pillOutside, pillMissing, marked };
      });
      out[mode] = { clean: await measure() };

      /* the frame this renderer sized from the ceiling — pin it, because Photoshop's did not grow */
      await page.evaluate(() => {
        const pg = document.getElementById("pageAiTools");
        [].slice.call(pg.querySelectorAll(".wfmini")).forEach(c => {
          const h = c.getBoundingClientRect().height; if (h > 0) c.style.height = Math.round(h) + "px";
        });
      });
      if (mode === "old-marker") await page.evaluate(OLD_MARK);
      await page.addStyleTag({ content: NO_CLIP });
      await page.evaluate(() => {
        const em = window.HNK && window.HNK.ellMark;
        if (em) em(document.getElementById("pageAiTools"), ".wfmini .s", 3);
      });
      await page.waitForTimeout(400);
      out[mode].hurt = await measure();
      out[mode].errs = errs;
      await ctx.close();
    }
  } finally { server.close(); }

  const s = out["shipped"], o = out["old-marker"];
  report("B1) with a renderer that clips, nothing changed: the cards hold their text, the pill is on every one of them, and the cut ones say so",
    s.clean.cards > 4 && s.clean.sPastCard === 0 && s.clean.pillOutside === 0 &&
    s.clean.pillMissing === 0 && s.clean.marked > 0, s.clean);
  /* 6.169.0 — what leaves the card first depends on how far the sentence overruns. On the
     148px card this walk used to measure (two columns at 400px, before the responsive
     ladder) the summary was two lines over and the SENTENCE itself painted below the
     border. On the 178px card of the first two-column step it is one line over, which is
     less than the pill's own height plus its margin, so the sentence stays inside and the
     PILL is the thing pushed out. Both are the same defect — content painting outside its
     frame — so the check asks for either, and still demands that the shipped path shows
     neither, on the same nine cards, in the same run. */
  report("B2) THE PHOTOSHOP CASE: the frame pinned and the clipping withdrawn — 6.167.3's marker lets the card's content out of its frame (the sentence, or the pill it pushes), this one does not",
    (o.hurt.sPastCard > 0 || o.hurt.pillOutside > 0) && o.hurt.marked === 0 &&
    s.hurt.sPastCard === 0 && s.hurt.pillOutside === 0 && s.hurt.pillMissing === 0,
    { oldMarker: o.hurt, shipped: s.hurt });
  report("B3) and the cut is honest — the cards it shortened are the cards it marked, and it marked nothing it left whole",
    s.hurt.marked > 0 && s.hurt.marked <= s.hurt.cards && s.hurt.cards === s.clean.cards,
    { marked: s.hurt.marked, cards: s.hurt.cards });
  report("B4) neither leg threw", s.errs.length === 0 && o.errs.length === 0,
    { shipped: s.errs.slice(0, 3), oldMarker: o.errs.slice(0, 3) });
}

/* ================= C) the web app, walked ================= */
async function appWalk(browser) {
  /* 420px — a phone, and the width at which these descriptions really do run past three lines */
  withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) { } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const out = await page.evaluate(async () => {
    try { document.body.classList.remove("wall"); } catch (e) { }
    switchPage("pgWf"); await new Promise(x => setTimeout(x, 1400));
    const heads = [].slice.call(document.querySelectorAll("#pgWf .grp:not(.open) .grp-h"));
    heads.forEach(h => h.click());
    await new Promise(x => setTimeout(x, 1200));
    const cards = [].slice.call(document.querySelectorAll("#pgWf .wfmini")).filter(c => c.getBoundingClientRect().height > 0);
    let past = 0, marked = 0, pillMissing = 0, overCeil = 0;
    for (const c of cards) {
      const cr = c.getBoundingClientRect(), s = c.querySelector(".s"), go = c.querySelector(".go");
      if (s) {
        if (s.getBoundingClientRect().bottom > cr.bottom + 0.6) past++;
        if (s.querySelector(".ell")) marked++;
        const lh = parseFloat(getComputedStyle(s).lineHeight) || 16;
        if (s.clientHeight > 3 * lh + lh / 2) overCeil++;
      }
      if (!go) pillMissing++;
    }
    return { cards: cards.length, past, marked, pillMissing, overCeil };
  });
  await ctx.close();
  report("C1) the web app's own cards: every description inside its card, the pill on every one, and the cut ones marked",
    out.cards > 100 && out.past === 0 && out.pillMissing === 0 && out.overCeil === 0 && out.marked > 20,
    out);
  report("C2) and the app threw nothing", errs.length === 0, errs.slice(0, 3));
}

/* ================= C2) the wizard's slots carry their number ================= */
async function slotNumbers(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  let seen = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 1200 } });
    const page = await ctx.newPage();
    await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(1500);
    seen = await page.evaluate(async () => {
      const cards = [].slice.call(document.querySelectorAll("#pageAiTools .wfmini"));
      const out = [];
      for (const c of cards.slice(0, 8)) {
        c.click(); await new Promise(x => setTimeout(x, 300));
        out.push([].slice.call(document.querySelectorAll("#pageAiTools .hnk-req-label")).map(n => (n.textContent || "").trim()));
        try { switchPage("wf"); } catch (e) { }
        await new Promise(x => setTimeout(x, 300));
      }
      return out;
    });
    await ctx.close();
  } finally { server.close(); }
  const flat = seen.filter(a => a.length);
  const numbered = flat.every(a => a.every((t, i) => t.indexOf("IMAGE " + (i + 1) + " \u2014 ") === 0));
  const twoSlot = flat.some(a => a.length >= 2);
  const noDouble = flat.every(a => a.every(t => !/\(IMAGE\s*\d+\)\s*$/i.test(t)));
  report("C3) the panel names every wizard slot by its number, exactly as the app does — IMAGE 1, IMAGE 2, required first then optional, and the number said once",
    flat.length >= 4 && numbered && twoSlot && noDouble,
    { cards: flat.length, numbered, twoSlot, noDouble, sample: flat.slice(0, 3) });
  report("C4) and the panel's source builds that name in one place, from the app's own order",
    /function slotNo\(inp\) \{/.test(SCREEN) && /function slotLabel\(inp\) \{/.test(SCREEN) &&
    /var all = \(state\.requiredInputs \|\| \[\]\)\.concat\(state\.optionalInputs \|\| \[\]\);/.test(SCREEN) &&
    SCREEN.indexOf('return "IMAGE " + n + " \\u2014 " + lbl;') > 0 &&
    /var lbl = slotLabel\(inp\);/.test(SCREEN) &&
    APP.indexOf('"IMAGE "+(i+1)+" \u2014 "+inp.label') > 0, null);
}

/* ================= D) the release ================= */
function releasePins() {
  const appVer = JSON.parse(read("docs/app/version.json")).v;
  const panVer = MANIFEST.version;
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("D1) the wave ships in lockstep — web " + appVer + ", panel " + panVer + ", this test in the CI sweep, the landing count at 236 or more",
    /^6\.9[6-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.16[7-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    pv.v === panVer && pv.latest_version === panVer &&
    new RegExp('PANEL_VERSION = "' + panVer.replace(/\./g, "\\.") + '"').test(MAIN) &&
    CI.indexOf("node test/verify_card_text_fit.js") > 0 && count >= 236,
    { appVer, panVer, pv: pv.v, count, ci: CI.indexOf("node test/verify_card_text_fit.js") > 0 });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); await appWalk(browser); await slotNumbers(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
