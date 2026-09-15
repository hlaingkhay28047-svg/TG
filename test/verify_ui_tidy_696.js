/* verify_ui_tidy_696.js — 6.96.0 / panel 6.167.0
   THE HERO BANNER AND THE CARDS, TIDIED — the owner's four photographs.

   "Smartworkflow pages hero banner နဲ့ card ui ux ကို သပ်ရပ်အောင်လုပ်ပေးပါ
    နောက်ပြီး Imagine page ရဲ့ card ui ux ကို သပ်ရပ်အောင်လုပ်ပေးပါ
    ပြထားတဲ့ ui ux တွေကို သေချာ ညှိပေးပါ သပ်ရပ်အောင်"

   Nothing here was guessed. Every number below was measured on the live page
   before the change was written:

     1. THE WORKFLOW CARD'S DESCRIPTION. At 420px, over all 194 cards, the
        two-line ceiling cut 138 of them. The web app at least drew a
        -webkit-line-clamp ellipsis; UXP draws none, so in Photoshop a card
        simply stopped mid-sentence. The ceiling is three lines (6.75em at
        line-height 2.25) on BOTH surfaces, with the same mechanism — no
        line-clamp anywhere — and what is still long ends in one marker both
        surfaces append the same way (ellMark → span.ell).
     2. THE MARKER IS MEASURED, NOT COUNTED. A box is "cut" only when at
        least HALF A LINE of it is hidden: Burmese stacked diacritics draw a
        few pixels past their line box, so a box that holds its text exactly
        still reports scrollHeight 73 against clientHeight 69. A one-pixel
        test put "…" on nine Imagine cards that were not cut at all.
     3. A CLOSED GROUP MEASURES NOTHING. .grp-b is display:none while the
        group is shut, so every card inside it reports 0 and the marker can
        learn nothing. The app re-marks on the way up from a .grp-h tap (the
        host listens once — grp() is lifted into the panel's studio suites
        and may not call a page-level helper) and after every search pass;
        the panel's group.setOpen(true) re-marks its own body.
     4. THE HERO KICKER. .hero-strip caps every child at 76% — 295px of the
        388px banner — and "NO INSTALL · PANEL DATA · RUNNINGHUB AI" wants
        382px at .28em, so it broke with "RUNNINGHUB AI" alone on line two.
        Measured: 263px with no tracking, ~+1 char-width per .01em. The
        kicker takes the whole banner at .12em (314px) and steps down under
        390px (9.6px / .10em → 269px) — one line from a 320px Photoshop
        panel up to a monitor.
     5. THE PAGE-HERO TEXT. .ph-kick and .ph-head had NO max-width on either
        surface: 354px of headline ran straight across the model's face.
        Both are capped at 72%, the same discipline .hero-strip already had.
     6. THE IMAGINE CARDS. The summary ceiling was two lines (3em at 1.5) and
        all 22 cards were cut; it is five lines now (7.5em), and 17 of the 22
        end on their own word at 420px. The card's floor drops 150px → 132px
        so a narrow Photoshop panel still gets two columns. In the panel the
        card's own .mut wins the cascade and draws 12px/1.7, so 7.5em came to
        90px against a 20.4px line — four lines and a sliver of a fifth; the
        panel states the ceiling against its own line instead (5 × 1.7 =
        8.5em, whatever the text size).
     7. THE HUB HEADING. UXP wrapped the h2's flex row and left the wand icon
        alone above the title; the row is told not to wrap.

   Fault-injected while writing: the half-line tolerance back to "+1" fails
   B3/C3 (nine Imagine cards wear a marker they did not earn); the delegated
   host listener removed fails B2 (150 of 160 cut cards unmarked once the
   groups are opened); the panel's 8.5em removed fails C4 (the ceiling is
   4.4 lines); the kicker's media rule removed fails C2 at 320px. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const PCSS = read("panel/styles.css");
const PMAIN = read("panel/main.js");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const PIMAGINE = read("panel/js/hnk_imagine.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); return (i < 0 || j < 0) ? "" : s.slice(i, j); };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* the walk's own reading of "cut": the same half-line rule the shipped helper uses */
const TALLY = `(sel) => {
  const list = Array.prototype.slice.call(document.querySelectorAll(sel)).filter(n => n.clientHeight > 0);
  let cut = 0, marked = 0, mismatch = 0;
  list.forEach(n => {
    const lh = parseFloat(getComputedStyle(n).lineHeight) || 16;
    const isCut = n.scrollHeight - n.clientHeight > lh / 2;
    const has = !!n.querySelector(".ell");
    if (isCut) cut++; if (has) marked++; if (isCut !== has) mismatch++;
  });
  return { n: list.length, cut, marked, mismatch };
}`;

/* ================= A) the source ================= */
function sourcePins() {
  report("A1) the web app clamps .wfmini .s at three lines with max-height (6.75em at line-height 2.25) and no -webkit-line-clamp, and .ell is an absolutely-placed marker on the card's own background, shared with .im-card-sum",
    /\.wfmini \.s\{position:relative;font-size:11\.5px;color:var\(--muted\);line-height:2\.25;max-height:6\.75em;overflow:hidden;overflow-wrap:anywhere\}/.test(APP) &&
    !/\.wfmini \.s\{[^}]*-webkit-line-clamp/.test(APP) &&
    /\.wfmini \.s \.ell,\.im-card-sum \.ell\{position:absolute;right:0;bottom:0;padding-left:12px;background:var\(--panel-2\);color:var\(--muted\);font-weight:700\}/.test(APP), null);

  const helper = between(APP, "function ellMark(root, sel){", "\nfunction escH(");
  report("A2) ellMark: it removes any earlier marker, reads the element's own line-height and calls a box cut only when more than half a line is hidden — never a single pixel (Burmese ink overhangs its line box), and every step is inside a try that leaves the card untouched when the renderer measures nothing",
    helper.indexOf('var old=n.querySelector(".ell"); if(old) old.remove();') > 0 &&
    /var lh=parseFloat\(getComputedStyle\(n\)\.lineHeight\)\|\|16;/.test(helper) &&
    /if\(n\.scrollHeight-n\.clientHeight>lh\/2\)\{ var e=document\.createElement\("span"\); e\.className="ell"; e\.textContent="\\u2026"; n\.appendChild\(e\); \}/.test(helper) &&
    !/clientHeight\+1/.test(helper) && (helper.match(/catch\(e\)\{\}/g) || []).length >= 2, { len: helper.length });

  report("A3) the app runs the marker where the cards can be measured: once the grid is in the document, once per .grp-h tap on the way up through the host (bound a single time), after every search pass, and from both quick-jump chips",
    APP.indexOf('  ellMark(wfHost, ".wfmini .s");\n  if(!wfHost.__ellBound){') > 0 &&
    /wfHost\.__ellBound=1;/.test(APP) && /String\(t\.className\)\.indexOf\("grp-h"\)>=0/.test(APP) &&
    APP.indexOf('    ellMark(wfHost, ".wfmini .s");   /* 6.96.0 — the filter opens and closes groups; the marker follows */') > 0 &&
    APP.indexOf('if(tg.g.className.indexOf("open")<0){ tg.g.className="grp open"; ellMark(tg.g, ".wfmini .s"); }') > 0 &&
    APP.indexOf('        ellMark(wfHost, ".wfmini .s");\n        if(first) first.scrollIntoView({behavior:"smooth", block:"center"});') > 0, null);

  const mod = between(APP, "/* ---- IMAGINE_MODULE ---- */", "/* ---- /IMAGINE_MODULE ---- */");
  report("A4) the Imagine hub marks its own summaries through the host (so the panel runs its own copy), and the host publishes ellMark",
    /try\{ if\(H\.ellMark\) H\.ellMark\(root, "\.im-card-sum"\); \}catch\(e\)\{\}/.test(mod) &&
    /ellMark: function\(root, sel\)\{ ellMark\(root, sel\); \},/.test(APP) &&
    PIMAGINE.indexOf('if(H.ellMark) H.ellMark(root, ".im-card-sum");') > 0, null);

  report("A5) the app hero kicker takes the whole banner at .12em and steps down under 390px; .ph-kick and .ph-head are capped at 72% so a headline never runs across the model",
    /\.hero-mini \.kick\{padding:10px 6px 0 0;font-size:\.68rem;letter-spacing:\.12em;max-width:100%\}/.test(APP) &&
    /@media \(max-width:389px\)\{\.hero-mini \.kick\{font-size:\.6rem;letter-spacing:\.10em\}\}/.test(APP) &&
    /\.page-hero \.ph-kick\{position:relative;z-index:2;max-width:72%;/.test(APP) &&
    /\.page-hero \.ph-head\{position:relative;z-index:2;max-width:72%;/.test(APP), null);

  const css = between(APP, "/* ---- IMAGINE_CSS ---- */", "/* ---- /IMAGINE_CSS ---- */");
  report("A6) the Imagine card: a 132px floor (two columns in a narrow Photoshop panel) and a five-line summary ceiling (7.5em at line-height 1.5), relative so the marker can sit in its corner",
    /\.im-card\{flex:1 1 40%;min-width:132px;margin:5px;/.test(css) &&
    /\.im-card-sum\{position:relative;margin:4px 0 8px;font-size:11\.5px;line-height:1\.5;max-height:7\.5em;overflow:hidden;flex:1 1 auto\}/.test(css), null);

  report("A7) the panel stylesheet carries the same clamps and the same kicker, plus the two rules only this renderer needs: the hub heading's row never wraps, and the summary ceiling is stated against the panel's own 1.7 line (5 × 1.7 = 8.5em) because .mut wins the cascade here",
    /\.wfmini \.s \{ position: relative; display: block; margin-top: 4px; margin-bottom: 4px; max-height: 6\.75em;/.test(PCSS) &&
    /\.wfmini \.s \.ell, \.im-card-sum \.ell \{ position: absolute; right: 0; bottom: 0; padding-left: 12px;/.test(PCSS) &&
    /#pageAiTools \.hero-mini \.kick \{ position: relative; max-width: 100%; margin: 0 0 1px; padding: 10px 6px 0 0;/.test(PCSS) &&
    /letter-spacing: \.12em; text-transform: uppercase; color: var\(--accent\); line-height: 1\.7;/.test(PCSS) &&
    /@media \(max-width:389px\)\{ #pageAiTools \.hero-mini \.kick \{ font-size: 9\.6px; letter-spacing: \.10em; \} \}/.test(PCSS) &&
    /\.ph-kick \{\n  max-width: 72%;/.test(PCSS) && /\.ph-head \{\n  max-width: 72%;/.test(PCSS) &&
    /#pageImagine \.im-hub h2 \{ flex-wrap: nowrap; align-items: flex-start; \}/.test(PCSS) &&
    /#pageImagine \.im-hub h2 \.ic-s \{ flex: 0 0 auto; margin-top: 2px; \}/.test(PCSS) &&
    /#pageImagine \.im-card-sum \{ line-height: 1\.7; max-height: 8\.5em; \}/.test(PCSS) &&
    PCSS.indexOf(".im-card{flex:1 1 40%;min-width:132px;margin:5px;") > 0 &&
    PCSS.indexOf(".im-card-sum{position:relative;margin:4px 0 8px;font-size:11.5px;line-height:1.5;max-height:7.5em;") > 0 &&
    PCSS.indexOf("#pageImagine .im-card-sum { line-height: 1.7; max-height: 8.5em; }") < PCSS.indexOf("/* ---- IMAGINE_CSS ---- */"), null);

  const pHelper = between(PMAIN, "function ellMark(root, sel) {", "\nfunction setIcnText(");
  report("A8) the panel's own ellMark is the app's rule in this renderer's dialect (Array.prototype.forEach over the NodeList, removeChild, the same half-line tolerance), published as HNK.ellMark and offered to the Imagine module through imagineHost",
    /Array\.prototype\.forEach\.call\(list, function \(n\) \{/.test(pHelper) &&
    /const lh = parseFloat\(getComputedStyle\(n\)\.lineHeight\) \|\| 16;/.test(pHelper) &&
    /if \(n\.scrollHeight - n\.clientHeight > lh \/ 2\) \{/.test(pHelper) && !/clientHeight \+ 1/.test(pHelper) &&
    /g\.HNK\.ellMark = ellMark;/.test(PMAIN) && /ellMark: function \(root, sel\) \{ ellMark\(root, sel\); \},/.test(PMAIN), { len: pHelper.length });

  report("A9) the panel's Workflows screen marks after it renders and again whenever a group opens — setOpen is the single door the header tap and the search filter both come through",
    /var em = globalThis\.HNK && globalThis\.HNK\.ellMark;\n      if \(em\) em\(root, "\.wfmini \.s"\);/.test(SCREEN) &&
    /function setOpen\(on\) \{\n      g\.className = on \? "grp app-grp open" : "grp app-grp";/.test(SCREEN) &&
    /if \(on\) \{ try \{ var em = globalThis\.HNK && globalThis\.HNK\.ellMark; if \(em\) em\(g, "\.wfmini \.s"\); \} catch \(e\) \{ \} \}/.test(SCREEN), null);
}

/* ================= B) the web app ================= */
async function appWalk(browser) {
  const out = {};
  for (const W of [320, 420]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) { } });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    out[W] = await page.evaluate(async (tallySrc) => {
      const tally = eval("(" + tallySrc + ")");
      const r = {};
      try { document.body.classList.remove("wall"); } catch (e) { }
      switchPage("pgWf"); await new Promise(x => setTimeout(x, 1300));
      const hero = document.querySelector("#pgWf .hero-mini"), kick = hero.querySelector(".kick");
      const kb = kick.getBoundingClientRect(), lh = parseFloat(getComputedStyle(kick).lineHeight);
      const padTop = parseFloat(getComputedStyle(kick).paddingTop);
      r.kick = { lines: Math.round((kb.height - padTop) / lh), w: Math.round(kb.width), heroW: Math.round(hero.getBoundingClientRect().width), txt: kick.textContent.trim() };
      r.atRender = tally("#pgWf .wfmini .s");
      /* open every group the way a student does — one tap on its header */
      const heads = Array.prototype.slice.call(document.querySelectorAll("#pgWf .grp:not(.open) .grp-h"));
      r.tapped = heads.length;
      heads.forEach(h => h.click());
      await new Promise(x => setTimeout(x, 700));
      r.allOpen = tally("#pgWf .wfmini .s");
      r.ceiling = (function () { const s = document.querySelector("#pgWf .wfmini .s"); const cs = getComputedStyle(s); return Math.round(parseFloat(cs.maxHeight) / parseFloat(cs.lineHeight) * 100) / 100; })();
      /* and through the search filter, which opens and closes groups of its own accord */
      const inp = document.getElementById("wfSearch"); inp.value = "a"; inp.oninput();
      await new Promise(x => setTimeout(x, 400));
      r.filtered = tally("#pgWf .wfmini .s");
      inp.value = ""; inp.oninput(); await new Promise(x => setTimeout(x, 400));
      r.cleared = tally("#pgWf .wfmini .s");
      /* Imagine */
      switchPage("pgImagine"); try { IMAGINE.goHub(); } catch (e) { }
      await new Promise(x => setTimeout(x, 1500));
      r.imSum = tally("#pgImagine .im-card-sum");
      const sum = document.querySelector("#pgImagine .im-card-sum");
      r.imCeiling = Math.round(parseFloat(getComputedStyle(sum).maxHeight) / parseFloat(getComputedStyle(sum).lineHeight) * 100) / 100;
      const cards = Array.prototype.slice.call(document.querySelectorAll("#pgImagine .im-card"));
      const rows = {}; cards.forEach(c => { const y = Math.round(c.getBoundingClientRect().top); rows[y] = (rows[y] || 0) + 1; });
      r.imCards = { n: cards.length, perRow: Object.keys(rows).map(k => rows[k])[0], w: Math.round(cards[0].getBoundingClientRect().width) };
      const ph = document.querySelector("#pgImagine .page-hero"), head = ph.querySelector(".ph-head");
      r.phHead = { w: Math.round(head.getBoundingClientRect().width), hero: Math.round(ph.getBoundingClientRect().width) };
      const h2 = document.querySelector("#pgImagine .im-hub h2"), icn = h2.querySelector(".ic-s");
      r.h2Icon = Math.round(icn.getBoundingClientRect().top - h2.getBoundingClientRect().top);
      return r;
    }, TALLY);
    out[W].errs = errs;
    await ctx.close();
  }
  const a = out[420], b = out[320];
  report("B1) the Workflows hero kicker is ONE line at 420px and still one line at 320px — it uses the whole banner, not 76% of it",
    a.kick.lines === 1 && b.kick.lines === 1 && a.kick.w > a.kick.heroW * 0.9 && /runninghub ai$/i.test(a.kick.txt), { a: a.kick, b: b.kick });
  report("B2) every workflow description that is really cut ends in the marker and no other one does — at first render, after every group is opened by its own header tap, through a search and back again",
    a.atRender.mismatch === 0 && a.allOpen.mismatch === 0 && a.filtered.mismatch === 0 && a.cleared.mismatch === 0 &&
    b.allOpen.mismatch === 0 && b.filtered.mismatch === 0 &&
    a.tapped >= 8 && a.allOpen.n > 150 && a.allOpen.marked > 20, { a, b: { tapped: b.tapped, allOpen: b.allOpen } });
  report("B3) the ceiling is three whole lines, and at 420px 136 of the 194 descriptions now end on their own word (the two-line ceiling cut 138 of them)",
    Math.abs(a.ceiling - 3) < 0.05 && a.allOpen.n === 194 && a.allOpen.cut <= 70 && a.allOpen.n - a.allOpen.cut >= 130, { ceiling: a.ceiling, cut: a.allOpen.cut });
  report("B4) the Imagine summary is a five-line ceiling with the same honest marker, the cards keep two to a row at 420px and the page-hero headline stays inside 72% of the banner, with the hub heading's icon on line one",
    Math.abs(a.imCeiling - 5) < 0.05 && a.imSum.n === 22 && a.imSum.mismatch === 0 && b.imSum.mismatch === 0 &&
    a.imSum.cut <= 8 && a.imCards.perRow === 2 && a.phHead.w <= a.phHead.hero * 0.74 && b.phHead.w <= b.phHead.hero * 0.74 &&
    a.h2Icon < 8 && b.h2Icon < 8, { a: { imCeiling: a.imCeiling, imSum: a.imSum, cards: a.imCards, ph: a.phHead, h2: a.h2Icon }, b: { imSum: b.imSum, ph: b.phHead } });
  report("B5) no page error on either width", a.errs.length === 0 && b.errs.length === 0, { a: a.errs, b: b.errs });
}

/* ================= C) the Photoshop panel ================= */
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
      : (r.request().resourceType() === "image"
        ? r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") })
        : r.fulfill({ status: 200, contentType: "application/json", body: "{}" })));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    out[W] = await page.evaluate(async (tallySrc) => {
      const tally = eval("(" + tallySrc + ")");
      const r = {};
      switchPage("wf"); await new Promise(x => setTimeout(x, 1500));
      const hero = document.querySelector("#pageAiTools .hero-mini"), kick = hero.querySelector(".kick");
      const kb = kick.getBoundingClientRect(), lh = parseFloat(getComputedStyle(kick).lineHeight), pt = parseFloat(getComputedStyle(kick).paddingTop);
      r.kick = { lines: Math.round((kb.height - pt) / lh), w: Math.round(kb.width), heroW: Math.round(hero.getBoundingClientRect().width), fs: getComputedStyle(kick).fontSize };
      r.atRender = tally("#pageAiTools .wfmini .s");
      const heads = Array.prototype.slice.call(document.querySelectorAll("#pageAiTools .grp:not(.open) .grp-h"));
      r.tapped = heads.length; heads.forEach(h => h.click());
      await new Promise(x => setTimeout(x, 800));
      r.allOpen = tally("#pageAiTools .wfmini .s");
      const s = document.querySelector("#pageAiTools .wfmini .s");
      r.ceiling = Math.round(parseFloat(getComputedStyle(s).maxHeight) / parseFloat(getComputedStyle(s).lineHeight) * 100) / 100;
      switchPage("imagine"); await new Promise(x => setTimeout(x, 2000));
      r.imSum = tally("#pageImagine .im-card-sum");
      const sum = document.querySelector("#pageImagine .im-card-sum");
      r.imCeiling = Math.round(parseFloat(getComputedStyle(sum).maxHeight) / parseFloat(getComputedStyle(sum).lineHeight) * 100) / 100;
      const cards = Array.prototype.slice.call(document.querySelectorAll("#pageImagine .im-card"));
      const rows = {}; cards.forEach(c => { const y = Math.round(c.getBoundingClientRect().top); rows[y] = (rows[y] || 0) + 1; });
      r.imCards = { n: cards.length, perRow: Object.keys(rows).map(k => rows[k])[0], w: Math.round(cards[0].getBoundingClientRect().width) };
      const ph = document.querySelector("#pageImagine .page-hero"), head = ph && ph.querySelector(".ph-head");
      r.phHead = head ? { w: Math.round(head.getBoundingClientRect().width), hero: Math.round(ph.getBoundingClientRect().width) } : null;
      const h2 = document.querySelector("#pageImagine .im-hub h2"), icn = h2 && h2.querySelector(".ic-s");
      r.h2Icon = icn ? Math.round(icn.getBoundingClientRect().top - h2.getBoundingClientRect().top) : null;
      return r;
    }, TALLY);
    out[W].errs = errs;
    await ctx.close();
  }
  server.close();
  const a = out[400], b = out[320];
  report("C1) the panel's Workflows hero kicker is one line at a 400px panel AND at a 320px one (the step-down rule earns the narrow case)",
    a.kick.lines === 1 && b.kick.lines === 1 && a.kick.fs === "10.88px" && b.kick.fs === "9.6px", { a: a.kick, b: b.kick });
  report("C2) three whole lines in the panel too, and the marker is exact: every cut description marked, no uncut one marked, at render and after every group is tapped open",
    Math.abs(a.ceiling - 3) < 0.05 && a.atRender.mismatch === 0 && a.allOpen.mismatch === 0 &&
    b.atRender.mismatch === 0 && b.allOpen.mismatch === 0 && a.tapped >= 8 && a.allOpen.n === 194, { a, b: { tapped: b.tapped, allOpen: b.allOpen } });
  report("C3) the Imagine summary ceiling is five WHOLE lines in the panel — 8.5em against this renderer's own 1.7 line, not the app's 7.5em against a 1.5 it never uses",
    Math.abs(a.imCeiling - 5) < 0.05 && Math.abs(b.imCeiling - 5) < 0.05 && a.imSum.n === 22 && a.imSum.mismatch === 0 && b.imSum.mismatch === 0, { a: { ceil: a.imCeiling, sum: a.imSum }, b: { ceil: b.imCeiling, sum: b.imSum } });
  report("C4) the 132px floor gives a 400px Photoshop panel two Imagine columns (150px gave it one), the page-hero headline stays inside 72%, and the hub heading's wand is on line one",
    a.imCards.perRow === 2 && a.imCards.n === 22 && b.imCards.n === 22 &&
    a.phHead && a.phHead.w <= a.phHead.hero * 0.74 && b.phHead.w <= b.phHead.hero * 0.74 &&
    a.h2Icon !== null && a.h2Icon < 8 && b.h2Icon < 8, { a: { cards: a.imCards, ph: a.phHead, h2: a.h2Icon }, b: { cards: b.imCards, ph: b.phHead, h2: b.h2Icon } });
  report("C5) no panel error on either width", a.errs.length === 0 && b.errs.length === 0, { a: a.errs, b: b.errs });
}

/* ================= D) the release ================= */
/* 6.96.1 — these pins read the wave's own version out of the tree instead of
   naming 6.96.0, so a later wave that bumps in lockstep still proves lockstep
   (verify_ui_wave_693 D1 established the pattern). What is pinned is the
   AGREEMENT between the seven places and the What's New row, not one number. */
function releasePins() {
  const appVer = JSON.parse(read("docs/app/version.json")).v;
  const panVer = MANIFEST.version;
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("D1) the wave ships in lockstep: web " + appVer + ", panel " + panVer + " in the manifest, panel-version.json and the panel's own PANEL_VERSION, the test in the CI sweep and the landing count at 232 or more",
    /^6\.9[6-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.16[7-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    new RegExp('var APP_VER *= *"' + appVer.replace(/\./g, "\\.") + '"').test(APP) &&
    pv.v === panVer && pv.latest_version === panVer &&
    new RegExp('PANEL_VERSION = "' + panVer.replace(/\./g, "\\.") + '"').test(PMAIN) &&
    CI.indexOf("node test/verify_ui_tidy_696.js") > 0 &&
    count >= 232, { appVer, panVer, pv: pv.v, count,
      app: (APP.match(/var APP_VER *= *"([^"]+)"/) || [])[1],
      ci: CI.indexOf("node test/verify_ui_tidy_696.js") > 0 });
  const head = 'var WHATS_NEW = [\n  { v:"' + appVer + '"';
  const i = APP.indexOf(head);
  const row = i < 0 ? "" : APP.slice(i, APP.indexOf('{ v:"', i + head.length));
  report("D2) the newest What's New row is this wave's own version and speaks all nine languages",
    row.length > 100 && LANGS.every(l => new RegExp('\\b' + l + ':"').test(row)), { v: appVer, len: row.length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch(); withPremium(browser);
  try { await appWalk(browser); await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
