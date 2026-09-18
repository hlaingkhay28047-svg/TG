/* verify_card_text_fit.js — 6.96.4 / panel 6.167.4
   A CARD NEVER PAINTS OUTSIDE ITSELF.

   THE DEFECT the owner photographed on 6.167.3, one wave after the cards came back:
   every Smart Workflow card drew its description straight out of the card — a line of
   words below the card's own border, sliced by the row beneath it — with no ellipsis
   anywhere and no "Open" pill on the card at all.

   THE CAUSE. Marking a cut is not the same as making one. The clamp was two rules that
   only ever worked together:

       .wfmini .s { max-height: 5.85em; overflow: hidden }   (the renderer hides the rest)
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
/* 6.171.0 — `height: auto` joins the withdrawal. When this harness was written the
   ceiling was `max-height`, so releasing that plus `overflow` let the box grow and the
   6.167.3 marker's failure show. 6.100.0 measured Photoshop and found that max-height is
   a request UXP declines, and states the ceiling as an explicit `height` instead — which
   this line did not release, so BOTH legs reported a tidy page and the contrast the proof
   rests on quietly disappeared. Release the frame the stylesheet actually uses. */
const NO_CLIP = ".wfmini .s { overflow: visible !important; max-height: none !important; height: auto !important; }";

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
  /* 6.171.0 — THE CUT IS NO LONGER THE SECOND ANSWER, IT IS THE ONLY ONE.
     6.96.4 cut the words only where the renderer had hidden nothing, and asked
     `clientHeight` — the height the renderer chose. Measuring the owner's real panel at
     230px showed why that was not enough: 101 of 194 cards still painted past their box,
     because a clamping renderer reports a tidy clientHeight whether or not it clipped, so
     the second branch was unreachable exactly where it was needed. The marker now removes
     every clamp, reads the ink the words truly need (scrollHeight with height / max-height
     / overflow / -webkit-line-clamp all released), cuts to the budget and restores what it
     borrowed. The line budget also wins over max-height in the ceiling, because UXP reports
     no max-height at all and the budget is the one number both renderers agree on.
     verify_wf_card_fit measures the result on both surfaces at nine widths. */
  report("A1) the panel's marker measures the ink with every clamp withdrawn and cuts the words to the budget — the whole sentence kept, the cut at a space",
    /const ELL_FULL = new WeakMap\(\);/.test(MAIN) &&
    /function ellCeil\(n, lines\) \{/.test(MAIN) &&
    /let ceil = lines > 0 \? lines \* lh : 0;/.test(MAIN) &&
    /ceil = ellLenPx\(cs\.maxHeight, fs\) \|\| ellLenPx\(cs\.height, fs\);/.test(MAIN) &&
    /n\.style\.height = "auto"; n\.style\.maxHeight = "none"; n\.style\.overflow = "visible";/.test(MAIN) &&
    /if \(n\.scrollHeight > m\.ceil \+ m\.lh \/ 2\) \{/.test(MAIN) &&
    /if \(sp > 12\) s = s\.slice\(0, sp\);/.test(MAIN),
    { weakmap: /ELL_FULL = new WeakMap/.test(MAIN), ceil: /function ellCeil/.test(MAIN) });

  /* The half-line tolerance is the part of 6.96.4 that was always right and is kept
     verbatim: Burmese ink overhangs its line box, so a box over its ceiling by a pixel is
     not a box with a word missing. Nothing is cut for a pixel, on either surface. And the
     whole sentence is still kept on the element, so a second pass never cuts a cut string
     twice and the original can always be read back. */
  report("A2) it cuts only past half a line — never a pixel — and the whole sentence is kept and readable from the element",
    /if \(n\.scrollHeight > m\.ceil \+ m\.lh \/ 2\) \{/.test(MAIN) && !/m\.ceil \+ 1\b/.test(MAIN) &&
    /const full = ELL_FULL\.has\(n\) \? ELL_FULL\.get\(n\) : \(n\.textContent \|\| ""\);/.test(MAIN) &&
    /ELL_FULL\.set\(n, full\);/.test(MAIN) &&
    /n\.setAttribute\("data-full", full\);/.test(MAIN) && /n\.setAttribute\("data-full", full\);/.test(APP), null);

  report("A3) the web app carries the identical rule, so both surfaces cut the same sentence at the same word for the same box",
    /var ELL_FULL=new WeakMap\(\);/.test(APP) &&
    /function ellCeil\(n, lines\)\{/.test(APP) &&
    /var cs=getComputedStyle\(n\), fs=parseFloat\(cs\.fontSize\);/.test(APP) &&
    /var lh=ellLenPx\(cs\.lineHeight, fs\);/.test(APP) &&
    /n\.style\.height="auto"; n\.style\.maxHeight="none"; n\.style\.overflow="visible";/.test(APP) &&
    /if\(n\.scrollHeight>m\.ceil\+m\.lh\/2\)\{/.test(APP) &&
    /if\(sp>12\) t=t\.slice\(0,sp\);/.test(APP), null);

  const appBudget = (APP.match(/ellMark\((?:wfHost|tg\.g), "\.wfmini \.s", 3\)/g) || []).length;
  const appTitle = (APP.match(/ellMark\((?:wfHost|tg\.g), "\.wfmini \.t", 2\)/g) || []).length;
  /* 6.171.0 — the TITLE has a budget too. It was never marked at all before this wave, and
     an unmarked two-line title is one of the six reasons a card ran past its box. Every
     summary call site now has a title call site beside it, on both surfaces. */
  report("A4) every call site names its line budget — summary 3, title 2, Imagine 5 — so the ceiling is known even where this renderer reports no max-height",
    appBudget >= 5 && appTitle === appBudget && /H\.ellMark\(root, "\.im-card-sum", 5\)/.test(APP) &&
    /ellMark: function\(root, sel, lines\)\{ ellMark\(root, sel, lines\); \}/.test(APP) &&
    /ellMark: function \(root, sel, lines\) \{ ellMark\(root, sel, lines\); \}/.test(MAIN) &&
    /em\(gd, "\.wfmini \.t", 2\);/.test(SCREEN) && /em\(gd, "\.wfmini \.s", 3\);/.test(SCREEN),
    { appBudget, appTitle, screenT: /em\(gd, "\.wfmini \.t", 2\);/.test(SCREEN) });

  /* 6.171.0 — THE CEILING IS STATED AS A HEIGHT, NOT A MAX-HEIGHT. That is the change this
     wave measured its way to: `max-height` + `overflow:hidden` does not clip in Adobe UXP,
     so the stylesheet asked for a ceiling the renderer never applied. An explicit `height`
     is honoured, and with the words cut to the same budget the box is full, not clipped. */
  report("A5) the stylesheet states the ceiling as an explicit height — max-height is a request this renderer declines",
    /\.wfmini \.s \{ position: relative; display: block; margin-top: 3px; margin-bottom: 3px; height: 5\.85em;/.test(read("panel/styles.css")) &&
    /\.wfmini \.t \{ position: relative; display: block; margin-top: 3px; height: 3\.8em;/.test(read("panel/styles.css")) &&
    /\.wfmini \.s\{[^}]*height:5\.85em/.test(APP) && /\.wfmini \.t\{[^}]*height:3\.8em/.test(APP),
    null);

  /* 6.103.0 — AND THE CEILING IS COUNTED IN PIXELS, whatever the renderer answers with.
     ellCeil read getComputedStyle().lineHeight straight through parseFloat and treated the
     number as pixels. The card summary is authored `line-height: 1.95`, with no unit.
     Chromium resolves that before it answers — an 11.5px summary comes back "25.875px" —
     so three lines is 77.6px and the cut lands where the box ends. A renderer that answers
     with the AUTHORED value hands back "1.95"; parseFloat reads 1.95, the ceiling becomes
     6.75px, and the cut takes the whole sentence. E1 below runs exactly that renderer. */
  report("A6) both surfaces resolve a length before they trust it — px, a bare multiplier, em/rem and normal, against the element's own font size",
    /function ellLenPx\(v, fs\) \{/.test(MAIN) && /function ellLenPx\(v, fs\)\{/.test(APP) &&
    /if \(\/px\$\/\.test\(s\)\) return n;/.test(MAIN) && /if\(\/px\$\/\.test\(s\)\) return n;/.test(APP) &&
    /if \(\/r\?em\$\/\.test\(s\)\) return n \* fs;/.test(MAIN) && /if\(\/r\?em\$\/\.test\(s\)\) return n\*fs;/.test(APP) &&
    /return n \* fs;   \/\* line-height: 2\.25 \*\//.test(MAIN) &&
    /if \(!\(lh > 0\)\) lh = fs \* 1\.2;/.test(MAIN) && /if\(!\(lh>0\)\) lh=fs\*1\.2;/.test(APP) &&
    /s === "normal"/.test(MAIN) && /s==="normal"/.test(APP),
    { panel: /function ellLenPx/.test(MAIN), app: /function ellLenPx/.test(APP) });

  /* And the floor under the cut: a card that somehow still holds one line too many loses
     that line at its own border instead of painting it between two cards. */
  report("A7) the card clips its own content — whatever the cut does, nothing paints outside the frame",
    /\.wfmini \{[^}]*overflow: hidden;/.test(read("panel/styles.css")), null);
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
        /* 6.171.0 — and the words themselves, against the budget they were given. With the
           clipping withdrawn a box is exactly as tall as its ink, so this reads the ink. */
        let sOverBudget = 0, worstLines = 0;
        for (const c of cards) {
          const cr = c.getBoundingClientRect(), s = c.querySelector(".s"), go = c.querySelector(".go");
          if (s) {
            const past = Math.round(s.getBoundingClientRect().bottom - cr.bottom);
            if (past > 0.6) { sPastCard++; if (past > worstPx) worstPx = past; }
            if (s.querySelector(".ell")) marked++;
            const lh = parseFloat(getComputedStyle(s).lineHeight) || 16;
            const lines = s.getBoundingClientRect().height / lh;
            if (lines > 3.5) { sOverBudget++; if (lines > worstLines) worstLines = Math.round(lines * 10) / 10; }
          }
          if (!go) pillMissing++;
          else if (go.getBoundingClientRect().bottom > cr.bottom + 0.6) pillOutside++;
        }
        return { cards: cards.length, sPastCard, worstPx, pillOutside, pillMissing, marked, sOverBudget, worstLines };
      });
      out[mode] = { clean: await measure() };

      /* the frame this renderer sized from the ceiling — pin it, because Photoshop's did not grow */
      await page.evaluate(() => {
        const pg = document.getElementById("pageAiTools");
        [].slice.call(pg.querySelectorAll(".wfmini")).forEach(c => {
          const h = c.getBoundingClientRect().height; if (h > 0) c.style.height = Math.round(h) + "px";
        });
      });
      if (mode === "old-marker") {
        /* 6.171.0 — GIVE THE OLD MARKER THE SENTENCE IT WAS WRITTEN FOR.
           In 6.96.4 the shipped marker only ever ADDED a "…" in this renderer, so the words
           were still whole when this leg started and withdrawing the clipping let them out.
           6.100.0's marker really cuts, so by now the overrun has already been removed and
           the old marker would be handed a sentence that cannot overflow anything — both
           legs would report a tidy page and the proof would quietly prove nothing. The whole
           sentence is on the element (data-full, the same record the parity walk reads), so
           put it back first: a full sentence, a pinned frame, a renderer that does not clip,
           and 6.167.3's marker — the owner's photograph, reconstructed exactly. */
        await page.evaluate(() => {
          [].slice.call(document.querySelectorAll("#pageAiTools .wfmini .s")).forEach((n) => {
            const full = n.getAttribute("data-full");
            if (full) n.textContent = full;
          });
        });
        await page.evaluate(OLD_MARK);
      }
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
     PILL is the thing pushed out.

     6.171.0 — AND IT IS MEASURED ON THE WORDS NOW, NOT ONLY ON THE FRAME. Since every card
     in a row became the same height (6.100.0), the shortest card in a row carries slack:
     its summary can run a line over and still not reach the card's own border, so "past the
     frame" stopped being able to see the defect here even when it is present. The defect was
     never really about the border — it is a sentence painting more lines than it was given —
     so that is what this now asks, against the budget the call site named (3 lines, half a
     line of tolerance for Burmese ink). The frame checks stay exactly as they were: the
     shipped path must still show nothing outside any card, and no pill missing. */
  report("B2) THE PHOTOSHOP CASE: the frame pinned and the clipping withdrawn — 6.167.3's marker leaves sentences over their line budget (and lets a card's content out of its frame where the row has no slack), this one does neither",
    o.hurt.sOverBudget > 0 && o.hurt.marked === 0 &&
    s.hurt.sOverBudget === 0 &&
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

/* ================= E) the renderer that answers with the authored value =================

   THE DEFECT the owner photographed on 6.173.0: most Smart Workflow cards showed an empty
   description area where three lines had been reserved, and on the narrow panel one card's
   sentence was painted between two cards, sliced. Two symptoms, one cause — the cut was
   being made against a ceiling of 6.75 pixels.

   This leg installs that renderer. getComputedStyle is replaced, for the measured element
   only, with one that answers the AUTHORED values — `line-height: 1.95`, `height: 5.85em`
   — the way a renderer that does not resolve before it answers would. The page's own
   ellMark then runs. With this wave's ellCeil the cut lands on three real lines; with the
   old one it would have landed on 6.75px, which E2 states as the number it is. */
async function authoredUnits(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const LONG = "Retouch B-style professional beauty retouch that keeps the identity of the face "
      + "exactly as it was and cleans only the skin, the light and the colour of the whole frame, "
      + "which is a sentence long enough to need more than three lines in a card this narrow.";
    const host = document.createElement("div");
    host.className = "wfgrid"; host.style.width = "330px";
    const card = document.createElement("div"); card.className = "wfmini";
    const s = document.createElement("span"); s.className = "s"; s.textContent = LONG;
    card.appendChild(s); host.appendChild(card); document.body.appendChild(host);

    const real = window.getComputedStyle.bind(window);
    const realLh = parseFloat(real(s).lineHeight);          /* what Chromium resolves it to */
    const realFs = parseFloat(real(s).fontSize);
    /* the renderer under test: the authored strings, unresolved */
    /* 6.112.0 — the fixture follows the stylesheet, because its whole point is
       to answer with what the stylesheet AUTHORS. The summary is now
       `line-height: 1.95; height: 5.85em`; the defect being modelled — a
       renderer that hands back the unresolved value, so parseFloat reads it as
       pixels — is unchanged, and E2 below still states what that would cost. */
    const AUTHORED = { lineHeight: "1.95", fontSize: "11.5px", height: "5.85em", maxHeight: "none" };
    window.getComputedStyle = function (el, pe) {
      const cs = real(el, pe);
      if (el !== s) return cs;
      return { lineHeight: AUTHORED.lineHeight, fontSize: AUTHORED.fontSize,
               height: AUTHORED.height, maxHeight: AUTHORED.maxHeight,
               display: cs.display, webkitLineClamp: cs.webkitLineClamp };
    };
    let cut = "", threw = "";
    try { ellMark(host, ".wfmini .s", 3); cut = (s.textContent || "").replace(/\u2026$/, ""); }
    catch (e) { threw = String(e).slice(0, 160); }
    finally { window.getComputedStyle = real; }

    /* how many real lines the kept words actually need, measured with the clamp withdrawn */
    const sv = { h: s.style.height, ov: s.style.overflow };
    s.style.height = "auto"; s.style.overflow = "visible";
    const inkH = s.scrollHeight;
    s.style.height = sv.h; s.style.overflow = sv.ov;

    const marked = !!card.querySelector(".ell");
    const cardB = card.getBoundingClientRect(), sB = s.getBoundingClientRect();
    host.parentNode.removeChild(host);
    return { cut: cut.length, full: LONG.length, marked, threw, inkH, realLh, realFs,
             linesUsed: realLh > 0 ? Math.round(inkH / realLh) : -1,
             oldCeil: 3 * (parseFloat(AUTHORED.lineHeight) || 16),
             newCeil: 3 * (parseFloat(AUTHORED.lineHeight) * realFs),
             outside: Math.round(sB.bottom - cardB.bottom) };
  });
  report("E1) a renderer that answers with the authored value still gets a cut on three real lines — words kept, marked, and inside the card",
    !r.threw && r.cut > 40 && r.cut < r.full && r.marked === true &&
    r.linesUsed > 0 && r.linesUsed <= 3 && r.outside <= 1, r);
  /* the control, stated rather than assumed: the old reading of the same answer is a
     ceiling of 6.75px — smaller than ONE line of this text — so it could only ever cut
     the sentence away entirely. That is the empty description area in the photographs. */
  report("E2) and the old reading of that same answer is a ceiling under a single line — which is why it emptied the box",
    r.oldCeil < r.realLh && Math.abs(r.newCeil - 3 * r.realLh) < 1.5,
    { oldCeil: r.oldCeil, oneRealLine: r.realLh, newCeil: r.newCeil });
  report("E3) and the page threw nothing while the renderer was swapped", errs.length === 0, errs.slice(0, 3));
  await page.close();
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); await appWalk(browser); await slotNumbers(browser); await authoredUnits(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
