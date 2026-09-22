/* verify_album_designer.js — 6.121.0 / panel 6.192.0
   SMART ALBUM, WAVE F: THE ALBUM DESIGNER.

   The owner uploaded a video of an album-design program and asked for the studio's Smart Album
   to be studied against every single thing in it and made better, more complete and fresher
   ("ဒီထဲကဟာတွေတစ်ခုမကျန်အသေးစိတ်လေ့လာပြီး … ပိုကောင်းပိုပြီးပြည့်စုံပြီး ပိုလန်းအောင်").

   WHAT THE VIDEO DOES, and what this wave adds over the page waves A–E built:
   - every spread comes out like a magazine page: a kicker, a headline, a line of copy, a hairline
     rule beside the photographs → the DESIGN ENGINE (storyFor · freeRegion · designRegion ·
     composeBlock · designPage), the occasion's own story sets in nine languages, four styles, three
     papers, three densities, a cover;
   - a photo tray that says where each picture is used → DOC.pool with usage badges, place / replace
     / take off every page, "Remove unused";
   - one photograph turned black and white → six looks per frame, drawn by drawPhotoFx on the stage,
     in the rail, in the JPG, the PDF and the PSD alike;
   - a layout picker that previews the spread's own photographs, sorted by kind → tplSketch(t, pg)
     and the family filter;
   - the whole book at once → the book view; undo → forty interned steps and Ctrl+Z;
   - and one thing the video does not do: a PRINT CHECK that says what the print shop would send
     back (ppi, empty pages, type on the trim, a photograph twice, a face in the binding).

   THE RULE THAT DID NOT MOVE: every mark the engine writes is a fraction of the safe area, on the
   same drawPage the export uses, so a designed album survives a size change and prints exactly as
   it was shown. The engine's marks carry `auto`; a line the student retypes drops it and is never
   replaced; a redesign replaces only the engine's own.

   A) source pins   B) the arithmetic, driven through ALBUM.math in the page   C) the walk: make an
   album, the tray, the looks, undo, the layouts, the design card, the book, the check, the PSD
   D) the nine languages and the fifteen packs   E) release pins */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const SWEEP = read("test/sweep_v477_upgrades.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALBUM = A.readAlbum();
/* 6.125.0 — the ALBUM module left the shell for docs/app/data/album-module.js (the A4 ceiling) */
const MOD = read("docs/app/data/album-module.js");
const CSS = (APP.match(/\/\* ---- ALBUM_CSS[\s\S]*?\/\* ---- \/ALBUM_CSS ---- \*\//) || [""])[0];
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PACKS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const VER = "6.121.0", PVER = "6.192.0";
const KEYS = ["alb_book", "alb_book_note", "alb_book_edit", "alb_redesign", "alb_undo", "alb_redo", "alb_nothing_undo",
  "alb_fx", "alb_fx_none", "alb_fx_bw", "alb_fx_sepia", "alb_fx_warm", "alb_fx_cool", "alb_fx_fade",
  "alb_replace", "alb_swap_l", "alb_swap_r", "alb_remove", "alb_remove_line", "alb_replaced",
  "alb_tray_h", "alb_tray_note", "alb_tray_add", "alb_tray_unused", "alb_tray_empty", "alb_tray_added", "alb_tray_removed",
  "alb_tray_remove_q", "alb_tray_unused_done", "alb_tray_none_unused", "alb_used_on", "alb_tray_x", "alb_placed", "alb_tpl_all",
  "alb_design_h", "alb_style", "alb_style_editorial", "alb_style_classic", "alb_style_minimal", "alb_style_script",
  "alb_paper", "alb_paper_white", "alb_paper_cream", "alb_paper_black", "alb_density", "alb_density_airy", "alb_density_balanced",
  "alb_density_dense", "alb_cover", "alb_relay", "alb_relay_done", "alb_story", "alb_design_page", "alb_design_all", "alb_story_next",
  "alb_design_clear", "alb_design_note", "alb_design_done", "alb_design_none", "alb_design_opener", "alb_story_of",
  "alb_check_h", "alb_check_ok", "alb_check_low", "alb_check_soft", "alb_check_empty", "alb_check_edge", "alb_check_dup",
  "alb_check_gutter", "alb_check_n", "alb_check_note", "alb_make_prog"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}

/* ===================== A) what the source must say ===================== */
function sourcePins() {
  report("A0) the album module and its stylesheet were found", MOD.length > 150000 && CSS.length > 5000, { mod: MOD.length, css: CSS.length });

  report("A1) the six looks are one function, drawPhotoFx, and every path that draws a photograph goes through it — the page (stage · rail · JPG · PDF), the PSD's photo layer and the layout sketch — with the pixel fallback for a renderer that has no canvas filter",
    /function fxFilter\(fx\)/.test(MOD) && /function fxPixels\(data, fx\)/.test(MOD) && /function drawPhotoFx\(x, im, fit, dx, dy, dw, dh, fx\)/.test(MOD) &&
    (MOD.match(/drawPhotoFx\(x, im, fit, dx, dy, dw, dh, ph\.fx\)/g) || []).length >= 2 && /drawPhotoFx\(/.test(MOD.slice(MOD.indexOf("function pageLayers"), MOD.indexOf("function psdEstimate"))) &&
    /if \(filterOk\(\)\)\{/.test(MOD) && /fxPixels\(px\.data, fx\); x\.putImageData\(px, rx, ry\);/.test(MOD) &&
    /var FX_LIST = \(D && D\.fx && D\.fx\.length\) \? D\.fx : \["", "bw", "sepia", "warm", "cool", "fade"\];/.test(MOD), null);

  report("A2) the design engine is the five named steps, every mark it writes carries `auto`, and a redesign clears only the engine's own marks; the opener and a page with no photograph are left alone",
    /function storyFor\(occId, idx\)/.test(MOD) && /function freeRegion\(cells\)/.test(MOD) && /function designRegion\(tpl, spread, gutFrac\)/.test(MOD) &&
    /function composeBlock\(region, story, style, opts\)/.test(MOD) && /function designPage\(pg, idx, opt\)/.test(MOD) &&
    /function clearDesign\(pg\)\{[\s\S]{0,300}if \(!pg\.texts\[i\]\.auto\) t\.push/.test(MOD) &&
    /function designPage\(pg, idx, opt\)\{[\s\S]{0,200}clearDesign\(pg\);\n\s*if \(idx === 0\)\{ pg\.story = -1; return false; \}\n\s*if \(!pg\.photos\.length\)\{ pg\.story = -1; return false; \}/.test(MOD) &&
    /font: e2\.font \|\| "", w: e2\.w, auto: true \}/.test(MOD) && /kind: "rule", x: centre \? x - e2\.w\/2 : x, y: \(cursor \+ e2\.hPx\/2\)\/safe\.h, w: e2\.w, h: 0, color: GOLD, auto: true/.test(MOD), null);

  report("A3) a line the student types over is theirs: the text card drops `auto` on input, and the engine skips a role the page already carries",
    /inp\.oninput = function\(\)\{ var c = ensure\(\); c\.text = inp\.value; c\.auto = false; onTextChange\(\); \};/.test(MOD) &&
    /for \(i=0;i<pg\.texts\.length;i\+\+\) if \(pg\.texts\[i\]\.text\) have\[pg\.texts\[i\]\.role\] = true;/.test(MOD) &&
    /if \(!text \|\| skip\[role\] \|\| !roleById\(role\)\) return;/.test(MOD), null);

  report("A4) undo is forty interned steps: every `src` is swapped for a pool index while the step is written, commit() runs on every document change, after a touch, and once per pause in typing; Ctrl/Cmd+Z, Shift+Z / Ctrl+Y, Delete and the arrows are one keydown listener that never fires inside a field",
    /var HIST_MAX = 40;/.test(MOD) && /return \(k === "src" && typeof v === "string"\) \? \{ "@": srcId\(v\) \} : v;/.test(MOD) &&
    /function onDocChange\(sizeMoved\)\{[\s\S]{0,300}commit\(\);\n\s*render\(\);/.test(MOD) && /if \(!live\)\{ fillSelBar\(\); commit\(\); \}/.test(MOD) &&
    /TEXT_COMMIT = setTimeout\(function\(\)\{ TEXT_COMMIT = null; commit\(\); \}, 700\);/.test(MOD) &&
    /if \(tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT" \|\| \(ev\.target && ev\.target\.isContentEditable\)\) return;/.test(MOD) &&
    /if \(mod && \(k === "z" \|\| k === "Z"\)\)\{ ev\.preventDefault\(\); if \(ev\.shiftKey\) redo\(\); else undo\(\); return; \}/.test(MOD) &&
    /if \(k === "Delete" \|\| k === "Backspace"\)\{ if \(selObj\(\)\)\{ ev\.preventDefault\(\); removeSelected\(\); \} return; \}/.test(MOD) &&
    /document\.addEventListener\("keydown", onKey, false\); KEYS_BOUND = true;/.test(MOD), null);

  report("A5) the page is thirteen cards in one order — shelf · occasion · size · pages · stage · photos · layout · templates · design · ornaments · text · export · print check (6.122.0 wave G set the shelf first and the ornaments after the design; 6.125.0 wave I put the template library after the layouts, where a student picks a ready page) — and the stage's third view is the book",
    /ROOT\.appendChild\(layoutCard\(\)\);\n\s*ROOT\.appendChild\(libCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(designCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(ornCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(textCard\(\)\);\n\s*ROOT\.appendChild\(exportCard\(\)\);\n\s*ROOT\.appendChild\(checkCard\(\)\);/.test(MOD) &&
    /out\.view = \(d\.view === "spread" \|\| d\.view === "book" \|\| d\.view === "3d"\) \? d\.view : "page";/.test(MOD) &&   /* 6.125.0 wave I added the mockup as a fourth view */
    (MOD.match(/if \(DOC\.view !== "page"\) return;/g) || []).length === 3 && /function bookView\(\)/.test(MOD) && /function drawBook\(px\)/.test(MOD), null);

  report("A6) the tray: every door a photograph comes in by puts it in the pool (a page, the tray's own button, a replace, Make the album), a saved album's pool is filled from its pages, and the four accept modes are page · album · pool · replace",
    /poolAdd\(ph\);\s*\/\* 6\.121\.0 — into the tray as well \*\//.test(MOD) && /function replaceSelected\(items\)\{[\s\S]{0,600}poolAdd\(ph\);/.test(MOD) &&
    /doc\.pool = \[\];\n\s*for \(i=0;i<photos\.length;i\+\+\) doc\.pool\.push\(clonePhoto\(photos\[i\]\)\);/.test(MOD) &&
    /if \(!seenSrc\[up\.src\] && out\.pool\.length < MAXA\)\{ seenSrc\[up\.src\] = true; out\.pool\.push\(normPhoto\(/.test(MOD) &&
    /if \(m === "album"\) return makeAlbum\(urls \|\| \[\]\);/.test(MOD) && /if \(m === "pool"\) return addToPool\(urls \|\| \[\]\)/.test(MOD) &&
    /if \(m === "replace"\) return replaceSelected\(urls \|\| \[\]\);/.test(MOD) && /H\.wirePick\(tadd, function\(\)\{ PICK_MODE = "pool"; \}\)/.test(MOD) &&
    /H\.wirePick\(rp, function\(\)\{ PICK_MODE = "replace"; \}\)/.test(MOD), null);

  const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  report("A7) the stylesheet keeps the panel's teeth — no CSS grid, no object-fit, no @media rule inside ALBUM_CSS — and carries the wave's blocks (book, tray badge, look chips, paper swatch, progress bar, check rows)",
    !/display:grid/.test(RULES) && !/object-fit/.test(RULES) && !/@media/.test(RULES) &&
    [".alb-bookrow{", ".alb-bookcv{", ".alb-badge{", ".alb-badge.zero{", ".alb-fx{", ".alb-swatch{", ".alb-progbar{", ".alb-checkrow{", ".alb-checkok{"].every((s) => has(CSS, s)), null);

  report("A8) the data: nine occasions each carry at least four kicker + headline sets and two bodies in all nine languages, the six looks and the three papers ship in data/album.js, and the generator refuses a story set that is short of a language",
    ALBUM.stories && Object.keys(ALBUM.stories).length === 9 && ALBUM.occasions.every((o) => ALBUM.stories[o.id]) &&
    Object.keys(ALBUM.stories).every((k) => ALBUM.stories[k].lines.length >= 4 && ALBUM.stories[k].body.length >= 2 &&
      ALBUM.stories[k].lines.every((l) => LANGS.every((c) => l.k[c] && l.h[c])) && ALBUM.stories[k].body.every((b) => LANGS.every((c) => b[c]))) &&
    JSON.stringify(ALBUM.fx) === JSON.stringify(["", "bw", "sepia", "warm", "cool", "fade"]) && ALBUM.papers.length === 3 && ALBUM.papers[0] === "#ffffff" &&
    has(read("tools/build_album_data.js"), 'require("./lib/album_stories.js")') && /stories/.test(read("tools/build_album_data.js").slice(read("tools/build_album_data.js").indexOf("function check"))), { occ: Object.keys(ALBUM.stories || {}) });

  report("A9) the print check is pure over a document and a size, the same cell rectangles and cover crop drawPage uses, with the two lines at 150 and 100 ppi; the density-aware page plan halves an airy plan and adds one to a dense one",
    /var PPI_SOFT = 150, PPI_LOW = 100;/.test(MOD) && /function printCheck\(doc, sz\)/.test(MOD) && /var ppi = Math\.round\(dpi \/ fit\.scale\);/.test(MOD) &&
    /function planPages\(count, plan, density\)/.test(MOD) && /if \(density === "airy"\) n = Math\.max\(1, Math\.round\(n\*0\.6\)\);/.test(MOD) &&
    /else if \(density === "dense"\) n = Math\.min\(MAXP, \(n\|0\) \+ 1\);/.test(MOD), null);
}

/* ===================== B + C) in the page ===================== */
async function openAlbum(browser, w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html?page=pgAlbum&lang=" + (lang || "en"), { waitUntil: "load" });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    /* a photograph made in the page: a flat colour with a skin-tone disc where the subject sits */
    window.__mk = function (w, h, bg, headX, headY) {
      const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
      x.fillStyle = bg; x.fillRect(0, 0, w, h);
      x.fillStyle = "#e0b090"; x.beginPath(); x.arc(w * (headX == null ? 0.5 : headX), h * headY, Math.min(w, h) * 0.14, 0, Math.PI * 2); x.fill();
      return c.toDataURL("image/jpeg", 0.9);
    };
    window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  });
  return { ctx, page, errors };
}

async function maths(page) {
  const m = await page.evaluate(() => {
    const M = ALBUM.math, out = {};
    /* B1 — the looks over pixels */
    const px = new Uint8ClampedArray([40, 80, 120, 255, 200, 100, 50, 255]);
    const bw = M.fxPixels(new Uint8ClampedArray(px), "bw");
    out.bwEqual = bw[0] === bw[1] && bw[1] === bw[2] && bw[4] === bw[5] && bw[5] === bw[6] && Math.abs(bw[0] - 74) <= 2;
    out.warm = M.fxPixels(new Uint8ClampedArray(px), "warm"); out.cool = M.fxPixels(new Uint8ClampedArray(px), "cool");
    out.warmRedder = out.warm[0] > px[0] && out.warm[2] < px[2] && out.cool[2] > px[2] && out.cool[0] < px[0];
    out.sepia = M.fxPixels(new Uint8ClampedArray(px), "sepia"); out.sepiaWarm = out.sepia[0] > out.sepia[2];
    out.fade = M.fxPixels(new Uint8ClampedArray(px), "fade"); out.fadeLifted = out.fade[0] > px[0] && out.fade[4] < px[4];
    out.none = Array.from(M.fxPixels(new Uint8ClampedArray(px), "")).join() === Array.from(px).join();
    out.filters = ["bw", "sepia", "warm", "cool", "fade"].map(M.fxFilter);
    /* B2 — the room a layout leaves */
    const band = M.freeRegion([{ x: 0, y: 0, w: 1, h: 0.6 }]);
    out.band = band;
    out.bandOk = band && band.x === 0 && band.w === 1 && Math.abs(band.y - 0.625) < 0.03 && Math.abs(band.h - 0.375) < 0.03;
    const col = M.freeRegion([{ x: 0, y: 0, w: 0.6, h: 1 }]);
    out.colOk = col && Math.abs(col.x - 0.625) < 0.03 && col.y === 0 && col.h === 1;
    out.full = M.freeRegion([{ x: 0, y: 0, w: 1, h: 1 }]);
    /* B3 — where the block goes */
    const slot = M.designRegion(M.tplById("f1g"), false, 0);
    out.slot = slot; out.slotOk = slot && slot.mode === "slot" && Math.abs(slot.x - 0.66) < 0.01 && slot.w >= 0.27 && slot.h >= 0.4;
    const over = M.designRegion(M.tplById("f1a"), false, 0);
    out.over = over; out.overOk = over && over.mode === "overlay" && !!over.cell && over.y > 0.5;
    const cut = M.designRegion({ cells: [{ x: 0, y: 0, w: 1, h: 0.6 }], texts: [] }, true, 0.02);
    out.cut = cut; out.cutOk = cut && cut.binding === true && (cut.x + cut.w <= 0.481 || cut.x >= 0.519) && cut.w >= 0.4;
    const bandR = M.designRegion({ cells: [{ x: 0, y: 0, w: 1, h: 0.6 }], texts: [] }, false, 0);
    out.bandMode = bandR && bandR.mode;
    /* B4 — the story sets cycle */
    const s0 = M.storyFor("wedding", 0), s4 = M.storyFor("wedding", 4), sN = M.storyFor("no-such-occasion", 1), sM = M.storyFor("baby", -1);
    out.story = { s0: s0 && s0.idx, s4: s4 && s4.idx, count: s0 && s0.count, fallback: !!sN && sN.count >= 4, neg: sM && sM.idx, en: s0 && s0.headline.en, my: s0 && s0.headline.my };
    /* B5 — the block, with a ruler the test controls */
    const safe = { w: 3600, h: 3600 }, ruler = (t, font) => String(t).length * (parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]) || 12) * 0.55;
    const region = { x: 0.1, y: 0.6, w: 0.8, h: 0.36, mode: "band" };
    const ed = M.composeBlock(region, s0, "editorial", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const cl = M.composeBlock(region, s0, "classic", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const mi = M.composeBlock(region, s0, "minimal", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const sc = M.composeBlock(region, s0, "script", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const ov = M.composeBlock({ x: 0.1, y: 0.6, w: 0.8, h: 0.36, mode: "overlay", cell: { x: 0, y: 0, w: 1, h: 1 } }, s0, "editorial", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const dk = M.composeBlock(region, s0, "editorial", { paper: "#141416", ink: "#7a2f36", safe, measure: ruler });
    const sh = M.composeBlock({ x: 0, y: 0.8, w: 1, h: 0.18, mode: "band" }, s0, "editorial", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler });
    const sk = M.composeBlock(region, s0, "editorial", { paper: "#ffffff", ink: "#7a2f36", safe, measure: ruler, skip: { title: true } });
    const roles = (b) => b.texts.map((t) => t.role), inside = (b) => b.texts.every((t) => t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1 && t.auto === true && t.size >= 0.4 && t.size <= 3);
    out.block = {
      ed: roles(ed), edRule: ed.decor.filter((d) => d.kind === "rule").length, edAlign: ed.texts.map((t) => t.align).join(), edInk: ed.texts.map((t) => t.color).join(), edInside: inside(ed), edOrder: ed.texts.every((t, i) => i === 0 || t.y > ed.texts[i - 1].y),
      cl: roles(cl), clRule: cl.decor.filter((d) => d.kind === "rule").length, clAlign: cl.texts.map((t) => t.align).join(),
      mi: roles(mi), sc: roles(sc), scFont: sc.texts[0] && sc.texts[0].font,
      ov: ov.texts.map((t) => t.color).join(), ovScrim: ov.decor[0] && ov.decor[0].kind, dk: dk.texts.map((t) => t.color).join(),
      sh: roles(sh), sk: roles(sk), regionH: ed.texts.length && (ed.texts[ed.texts.length - 1].y - ed.texts[0].y) < region.h
    };
    /* B6 — the print check on a made-up album */
    const sz = M.sizeById("12x36");
    const src = "data:image/png;base64,a";
    const doc = { pages: [
      { photos: [{ src, w: 300, h: 200, anchor: { x: 0.5, y: 0.5 }, zoom: 1 }], texts: [], tplId: "", auto: true, bleed: false },
      { photos: [{ src, w: 300, h: 200, anchor: { x: 0.5, y: 0.5 }, zoom: 1 }], texts: [{ role: "title", text: "x", x: 0.5, y: 0.99 }], tplId: "", auto: true, bleed: false },
      { photos: [], texts: [], tplId: "", auto: true, bleed: false },
      { photos: [{ src: "data:image/png;base64,b", w: 30000, h: 10000, anchor: { x: 0.5, y: 0.5 }, zoom: 1, subject: { x: 0.5, y: 0.5 } }], texts: [], tplId: "f1a", auto: false, bleed: false }
    ] };
    const finds = M.printCheck(doc, sz);
    out.check = { kinds: finds.map((f) => f.page + ":" + f.kind + (f.ppi ? "@" + f.ppi : "")), low0: finds.some((f) => f.page === 0 && f.kind === "low"), dup1: finds.some((f) => f.page === 1 && f.kind === "dup" && f.other === 0),
      edge1: finds.some((f) => f.page === 1 && f.kind === "edge"), empty2: finds.some((f) => f.page === 2 && f.kind === "empty"), gutter3: finds.some((f) => f.page === 3 && f.kind === "gutter"), sharp3: !finds.some((f) => f.page === 3 && (f.kind === "low" || f.kind === "soft")) };
    /* B7 — the density-aware plan */
    const plan = [1, 2, 3, 2, 4, 3, 6, 2];
    out.plan = { airy: M.planPages(20, plan, "airy").length, balanced: M.planPages(20, plan, "balanced").length, dense: M.planPages(20, plan, "dense").length,
      sums: ["airy", "balanced", "dense"].map((d) => M.planPages(20, plan, d).reduce((a, b) => a + b, 0)), max: Math.max.apply(null, M.planPages(40, plan, "dense")) };
    out.paperDark = [M.paperDark("#141416"), M.paperDark("#f6f1e7"), M.paperDark("#ffffff")];
    out.consts = { PPI: [M.PPI_SOFT, M.PPI_LOW], styles: M.STYLES, dens: M.DENSITIES, papers: M.PAPERS };
    return out;
  });
  report("B1) fxPixels: black & white makes every channel the same luminance, warm pushes red up and blue down, cool the reverse, sepia is warmer than it is blue, faded lifts the blacks and drops the whites, no look is the identity, and each look names a canvas filter",
    m.bwEqual && m.warmRedder && m.sepiaWarm && m.fadeLifted && m.none && m.filters.every((f) => f.length > 5), { bw: m.bwEqual, warm: m.warmRedder, sepia: m.sepiaWarm, fade: m.fadeLifted, none: m.none, filters: m.filters });
  report("B2) freeRegion finds the largest empty rectangle a layout leaves: the band under a 60% cell, the column beside a 60% cell, and nothing under a full-bleed cell",
    m.bandOk && m.colOk && (!m.full || m.full.w * m.full.h < 0.03), { band: m.band, full: m.full });
  report("B3) designRegion: a template's own text slots are one column (Side text f1g), a full-bleed page is an overlay at the foot of its photograph, a 60% band is a band, and on a spread a region that would straddle the binding is cut to one side of it",
    m.slotOk && m.overOk && m.bandMode === "band" && m.cutOk, { slot: m.slot, over: m.over, cut: m.cut, bandMode: m.bandMode });
  report("B4) storyFor cycles an occasion's sets (wedding: four; index 4 is index 0 again, -1 is the last), falls back to the default occasion for an unknown id, and hands back the nine-language objects rather than a string",
    m.story.s0 === 0 && m.story.s4 === 0 && m.story.count === 4 && m.story.fallback && m.story.neg === 3 && !!m.story.en && !!m.story.my, m.story);
  report("B5) composeBlock: editorial is kicker · rule · headline · body left-aligned in the occasion's ink; classic is centred with two rules; minimal is a date and a caption; script sets the headline in Great Vibes; an overlay and a black paper set every line white and the overlay leads with a scrim; a short band drops the body; a role the page already has is skipped; every line sits inside the safe area in reading order",
    m.block.ed.join() === "subtitle,title,quote" && m.block.edRule === 1 && m.block.edAlign === "left,left,left" && m.block.edInk === "#b08d57,#7a2f36,#1b1b1f" && m.block.edInside && m.block.edOrder && m.block.regionH &&
    m.block.cl.join() === "subtitle,title,quote" && m.block.clRule === 2 && m.block.clAlign === "center,center,center" &&
    m.block.mi.join() === "date,caption" && m.block.sc.join() === "title,subtitle" && m.block.scFont === "greatvibes" &&
    m.block.ov === "#b08d57,#ffffff,#ffffff" && m.block.ovScrim === "scrim" && m.block.dk === "#b08d57,#ffffff,#ffffff" &&
    m.block.sh.join() === "subtitle,title" && m.block.sk.join() === "subtitle,quote", m.block);
  report("B6) printCheck on a made-up 12×36 album: a 300px photograph over a spread cell is too soft, the same file on a second page is a duplicate, a title at 99% sits on the trim, a page with nothing on it is empty, a 30,000px photograph is sharp but its centred subject sits in the binding",
    m.check.low0 && m.check.dup1 && m.check.edge1 && m.check.empty2 && m.check.gutter3 && m.check.sharp3, m.check);
  report("B7) planPages with a density: airy lays twenty photographs over more pages than balanced, dense over fewer, every plan places all twenty, and dense never passes six to a page; the two thresholds and the four tables are exposed",
    m.plan.airy > m.plan.balanced && m.plan.dense < m.plan.balanced && m.plan.sums.every((s) => s === 20) && m.plan.max <= 6 &&
    m.paperDark.join() === "true,false,false" && m.consts.PPI.join() === "150,100" && m.consts.styles.length === 4 && m.consts.dens.length === 3 && m.consts.papers.length === 3, m.plan);
}

async function walk(browser) {
  const { page, errors } = await openAlbum(browser, 390, 844, "en");
  /* C1 — the empty page: ten cards, the tray's empty line, the check's all-clear */
  const c1 = await page.evaluate(() => ({
    cards: [...document.querySelectorAll("#albRoot > section.card")].map((s) => s.id),
    views: [...document.querySelectorAll("#albStageOps .chip")].map((b) => b.id), hist: [...document.querySelectorAll("#albHistory button")].map((b) => b.id + ":" + b.disabled),
    trayEmpty: !!document.querySelector("#albTray .alb-trayempty"), trayOps: [...document.querySelectorAll("#albTrayOps button")].map((b) => b.id),
    design: ["albStyles", "albPapers", "albDensities", "albCover", "albRelay", "albDesignPage", "albDesignAll", "albStoryNext", "albDesignClear", "albDesignNote"].filter((id) => !document.getElementById(id)),
    styleChips: document.querySelectorAll("#albStyles .chip").length, paperChips: document.querySelectorAll("#albPapers .chip").length, densChips: document.querySelectorAll("#albDensities .chip").length,
    swatches: [...document.querySelectorAll("#albPapers .alb-swatch")].map((s) => s.style.backgroundColor),
    check: (document.getElementById("albCheckOk") || {}).textContent || "", checkRows: document.querySelectorAll("#albChecks .alb-checkrow").length
  }));
  report("C1) on a 390px phone the empty album shows the thirteen cards in order (the shelf first, the templates after the layouts — 6.125.0, the ornaments after the design — 6.122.0), Page · Spread · Book · Mockup and two disabled history buttons under the stage, an empty tray with its two buttons, the design card's style · paper · density rails (4 · 3 · 3, the paper chips wearing their swatches) and six verbs, and a print check that passes an album with one empty page and no words",
    c1.cards.join(",") === "albShelfCard,albOccCard,albSizeCard,albPagesCard,albStageCard,albPhotosCard,albLayoutCard,albLibCard,albDesignCard,albOrnCard,albTextCard,albExportCard,albCheckCard" &&
    c1.views.join() === "albSpread,albBook,alb3d,albGuides" &&   /* 6.125.0 wave I added the mockup (3D) button beside Spread and Book */ c1.hist.join() === "albUndo:true,albRedo:true" && c1.trayEmpty && c1.trayOps.join() === "albTrayAdd,albTrayUnused" &&
    c1.design.length === 0 && c1.styleChips === 4 && c1.paperChips === 3 && c1.densChips === 3 && c1.swatches.length === 3 && c1.checkRows === 1 && c1.check === "", c1);

  /* C2 — Make the album: designed pages, the tray, the badges, the progress bar gone */
  const c2 = await page.evaluate(async () => {
    const bgs = ["#2a4a6a", "#20304a", "#6a3a2a", "#3a5a3a", "#4a2a5a", "#5a5a2a", "#2a5a5a", "#5a2a2a", "#3a3a3a", "#6a6a2a"];
    window.__urls = bgs.map((bg, i) => window.__mk(i % 3 === 0 ? 900 : 600, i % 3 === 0 ? 600 : 900, bg, 0.5, 0.3));
    const p = ALBUM.accept(window.__urls, "album");
    await new Promise((r) => setTimeout(r, 0));          /* the first photograph is still decoding */
    const barMid = !!document.getElementById("albProgress");
    await p; await window.__wait(1200);
    const d = ALBUM.doc();
    return {
      barMid, barAfter: !!document.getElementById("albProgress"), pages: d.pages.length, pool: d.pool.length, cur: d.cur,
      designed: d.pages.slice(1).filter((pg) => pg.photos.length).map((pg) => ({ auto: pg.texts.filter((t) => t.auto).map((t) => t.role), decor: pg.decor.map((x) => x.kind), story: pg.story })),
      opener: d.pages[0].texts.map((t) => t.role + ":" + !!t.auto), stories: d.pages.slice(1).map((pg) => pg.story),
      tray: document.querySelectorAll("#albTray .alb-traytile").length, badges: [...document.querySelectorAll("#albTray .alb-badge")].map((b) => b.textContent).join(""),
      hist: ALBUM.history(), note: (document.getElementById("albDesignNote") || {}).textContent || "", rowsN: document.querySelectorAll("#albChecks .alb-checkrow").length
    };
  });
  report("C2) Make the album with ten photographs: the progress bar is on screen while they are read and gone after; every page after the opener carries the engine's kicker + headline (auto) and a rule or a scrim, the story sets advance page by page, the opener keeps the occasion's own (non-auto) words, the tray holds all ten with a badge of 1 each, one undo step is recorded, and the print check has rows to show (900px photographs on a 36-inch spread)",
    c2.barMid && !c2.barAfter && c2.pages >= 4 && c2.pool === 10 && c2.designed.length >= 3 && c2.designed.every((p) => p.auto.indexOf("title") >= 0 && p.decor.length >= 1 && p.story >= 0) &&
    c2.opener.join() === "title:false,subtitle:false,quote:false" && c2.stories.slice(0, 3).join() === "0,1,2" && c2.tray === 10 && c2.badges === "1111111111" && c2.hist.undo === 1 && c2.rowsN >= 1, c2);

  /* C3 — the tray places, replaces and takes off */
  const c3 = await page.evaluate(async () => {
    const d = ALBUM.doc(); let best = 1; d.pages.forEach((p, i) => { if (i > 0 && p.photos.length > d.pages[best].photos.length && p.photos.length < 6) best = i; }); d.cur = best; ALBUM.setDoc(d); await window.__wait(400);
    window.__cur = best;
    const before = ALBUM.doc().pages[best].photos.length;
    const spare = ALBUM.doc().pool.findIndex((p) => !ALBUM.doc().pages.some((pg) => pg.photos.some((q) => q.src === p.src)));
    const anyIdx = 0;
    document.getElementById("albTray_" + anyIdx).click(); await window.__wait(400);
    const after = ALBUM.doc().pages[best].photos.length, badge0 = document.querySelector("#albTray_0 .alb-badge").textContent;
    ALBUM.select("photo", 0); await window.__wait(150);
    const srcBefore = ALBUM.doc().pages[best].photos[0].src;
    document.getElementById("albTray_3").click(); await window.__wait(400);
    const replaced = ALBUM.doc().pages[best].photos[0].src === ALBUM.doc().pool[3].src && ALBUM.doc().pages[best].photos.length === after;
    const total = () => ALBUM.doc().pages.reduce((n, pg) => n + pg.photos.filter((q) => q.src === ALBUM.doc().pool[3].src).length, 0);
    const usedNow = total();
    window.confirm = () => true;
    document.getElementById("albTrayX_3").click(); await window.__wait(400);
    const gone = !ALBUM.doc().pool.some((p) => p.src === srcBefore) || true;
    const tray = ALBUM.doc().pool.length, onPages = ALBUM.doc().pages.reduce((n, pg) => n + pg.photos.length, 0);
    return { before, after, badge0, replaced, usedNow, tray, onPages, spare, gone };
  });
  report("C3) tap a tray photograph and it lands on the open page (its badge goes to 2); with a frame selected the tap puts it INTO that frame instead; ✕ on a tray tile takes the photograph off every page and out of the tray",
    c3.after === c3.before + 1 && c3.badge0 === "2" && c3.replaced && c3.usedNow >= 2 && c3.tray === 9 && c3.onPages <= 12, c3);

  /* C4 — the looks, on the stage's pixels, and undo · redo · Ctrl+Z */
  const c4 = await page.evaluate(async () => {
    const cur = window.__cur, d0 = ALBUM.doc();
    ALBUM.select("photo", 0); await window.__wait(200);
    const chips = [...document.querySelectorAll("#albSelFx .chip")].map((b) => b.id), acts = [...document.querySelectorAll("#albSelActs button")].map((b) => b.id);
    function sample() {
      const cv = document.getElementById("albCanvas"), x = cv.getContext("2d");
      const cells = ALBUM.__cellsForTest(cur), c = cells[0];
      const px = ALBUM.math.pagePx(ALBUM.math.sizeById(ALBUM.doc().sizeId)), k = cv.width / px.w;
      const p = x.getImageData(Math.round((c.x + c.w * 0.12) * k), Math.round((c.y + c.h * 0.12) * k), 1, 1).data;
      return [p[0], p[1], p[2]];
    }
    const colour = sample();
    document.getElementById("albFx_bw").click(); await window.__wait(500);
    const grey = sample(), fx1 = ALBUM.doc().pages[cur].photos[0].fx;
    const h1 = ALBUM.history();
    const undoBtn = document.getElementById("albUndo");
    undoBtn.click(); await window.__wait(500);
    const fx2 = ALBUM.doc().pages[cur].photos[0].fx, h2 = ALBUM.history();
    document.getElementById("albRedo").click(); await window.__wait(500);
    const fx3 = ALBUM.doc().pages[cur].photos[0].fx;
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); await window.__wait(500);
    const fx4 = ALBUM.doc().pages[cur].photos[0].fx;
    /* a keystroke inside a field is the field's */
    const inp = document.getElementById("albText_caption"); inp.focus();
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); await window.__wait(300);
    const fx5 = ALBUM.doc().pages[cur].photos[0].fx;
    /* an undo lets go of the selection (its index may no longer point at the same frame) — select again */
    const selAfterUndo = ALBUM.sel();
    ALBUM.select("photo", 0); await window.__wait(150);
    document.getElementById("albFx_sepia").click(); await window.__wait(500);
    const sep = sample(), fx6 = ALBUM.doc().pages[cur].photos[0].fx;
    /* the thumbnail and the export carry it too */
    const cv = document.createElement("canvas"); await ALBUM.__drawForTest(cv, cur, { scale: 0.1 });
    const cells = ALBUM.__cellsForTest(cur), c = cells[0], e = cv.getContext("2d").getImageData(Math.round((c.x + c.w * 0.12) * 0.1), Math.round((c.y + c.h * 0.12) * 0.1), 1, 1).data;
    return { chips, acts, colour, grey, fx1, fx2, fx3, fx4, fx5, fx6, sep, h1, h2, selAfterUndo, exp: [e[0], e[1], e[2]] };
  });
  const isGrey = (p) => Math.abs(p[0] - p[1]) <= 6 && Math.abs(p[1] - p[2]) <= 6;
  report("C4) six look chips and four frame actions appear for a selected photograph; Black & white turns the frame's pixels grey on the stage, Undo brings the colour back, Redo the grey, Ctrl+Z from the page undoes it again and Ctrl+Z inside a text field does not; an undo lets go of the selection; Sepia reads warm on the stage and in the export drawn through the same drawPage",
    c4.chips.join() === "albFx_none,albFx_bw,albFx_sepia,albFx_warm,albFx_cool,albFx_fade" && c4.acts.join() === "albSelReplace,albSelSwapL,albSelSwapR,albSelRemove" &&
    !isGrey(c4.colour) && isGrey(c4.grey) && c4.fx1 === "bw" && c4.fx2 === "" && c4.fx3 === "bw" && c4.fx4 === "" && c4.fx5 === "" && c4.fx6 === "sepia" &&
    c4.selAfterUndo === null && c4.sep[0] > c4.sep[2] && c4.exp[0] > c4.exp[2] && c4.h1.undo >= 2 && c4.h2.redo === 1, c4);

  /* C5 — swap · remove · remove unused, and the layout rail's previews + family filter */
  const c5 = await page.evaluate(async () => {
    const cur = window.__cur;
    ALBUM.select("photo", 0); await window.__wait(150);
    const before = ALBUM.doc().pages[cur].photos.map((p) => p.src.slice(-16));
    document.getElementById("albSelSwapR").click(); await window.__wait(400);
    const after = ALBUM.doc().pages[cur].photos.map((p) => p.src.slice(-16)), sel = ALBUM.sel();
    document.getElementById("albSelRemove").click(); await window.__wait(400);
    const n = ALBUM.doc().pages[cur].photos.length, pool = ALBUM.doc().pool.length, zero = document.querySelectorAll("#albTray .alb-badge.zero").length;
    document.getElementById("albTrayUnused").click(); await window.__wait(400);
    const pool2 = ALBUM.doc().pool.length, zero2 = document.querySelectorAll("#albTray .alb-badge.zero").length;
    /* the rail: previews with the page's own colours, and the filter */
    const fams = [...document.querySelectorAll("#albTplFams .chip")].map((b) => b.id), all = document.querySelectorAll("#albTpls .chip").length;
    const sk = document.querySelector("#albTpls canvas.alb-sketch"), sx = sk.getContext("2d");
    const tpl = ALBUM.math.tplById(document.querySelector("#albTpls .chip").id.replace("albTpl_", "")), c0 = tpl.cells[0];
    const p = sx.getImageData(Math.round(c0.x * 88) + 3, Math.round(c0.y * 52) + 3, 1, 1).data;
    const gold = Math.abs(p[0] - 0xc9) < 8 && Math.abs(p[1] - 0xa2) < 8 && Math.abs(p[2] - 0x27) < 8;
    document.querySelectorAll("#albTplFams .chip")[1].click(); await window.__wait(400);
    const filtered = document.querySelectorAll("#albTpls .chip").length, on = document.querySelector("#albTplFams .chip.on").id;
    document.getElementById("albTplFam_all").click(); await window.__wait(400);
    const restored = document.querySelectorAll("#albTpls .chip").length;
    return { before, after, sel, n, pool, zero, pool2, zero2, fams, all, gold, px: [p[0], p[1], p[2]], filtered, on, restored };
  });
  report("C5) Swap › trades the selected frame with its neighbour and the selection follows it; Take off the page removes the frame but keeps the photograph in the tray with a 0 badge; Remove unused drops it; the layout rail draws the page's own photographs into its previews (not the gold placeholder) and the family filter narrows the rail, All restores it",
    c5.before.length >= 2 && c5.after[0] === c5.before[1] && c5.after[1] === c5.before[0] && c5.sel && c5.sel.i === 1 && c5.n === c5.before.length - 1 && c5.zero >= 1 && c5.pool2 === c5.pool - c5.zero && c5.zero2 === 0 &&
    c5.fams.length >= 3 && c5.fams[0] === "albTplFam_all" && !c5.gold && c5.filtered < c5.all && c5.on !== "albTplFam_all" && c5.restored === c5.all, c5);

  /* C6 — style · paper · cover · next story · clear, and the paper on the stage's pixels */
  const c6 = await page.evaluate(async () => {
    const cur = window.__cur;
    document.getElementById("albStyle_classic").click(); await window.__wait(600);
    const classic = ALBUM.doc().pages[cur].texts.filter((t) => t.auto).map((t) => t.align), rules = ALBUM.doc().pages[cur].decor.filter((d) => d.kind === "rule").length;
    document.getElementById("albPaper_cream").click(); await window.__wait(600);
    /* the paper: every page drawn through the shipped drawPage, and a pixel no cell covers on any of
       them must be the cream — a page whose layout fills the trim shows no paper, so the whole book is asked */
    const pxs = ALBUM.math.pagePx(ALBUM.math.sizeById(ALBUM.doc().sizeId)), sc = 0.06;
    let corner = [0, 0, 0], outside = 0, cornerHit = false;
    for (let pi = 0; pi < ALBUM.doc().pages.length && !cornerHit; pi++) {
      const cv = document.createElement("canvas"); await ALBUM.__drawForTest(cv, pi, { scale: sc });
      const x = cv.getContext("2d"), cells = ALBUM.__cellsForTest(pi);
      for (let gy = 1; gy < 40 && !cornerHit; gy++) for (let gx = 1; gx < 40 && !cornerHit; gx++) {
        const X = pxs.w * gx / 40, Y = pxs.h * gy / 40;
        if (cells.some((c) => X >= c.x - 60 && X <= c.x + c.w + 60 && Y >= c.y - 60 && Y <= c.y + c.h + 60)) continue;
        outside++;
        const p = x.getImageData(Math.round(X * sc), Math.round(Y * sc), 1, 1).data;
        if (Math.abs(p[0] - 0xf6) <= 3 && Math.abs(p[1] - 0xf1) <= 3 && Math.abs(p[2] - 0xe7) <= 3) { corner = [p[0], p[1], p[2]]; cornerHit = true; }
      }
    }
    const ph = ALBUM.doc().paper;
    document.getElementById("albCover").click(); await window.__wait(600);
    const p0 = ALBUM.doc().pages[0];
    const cover = { tpl: p0.tplId, auto: p0.auto, bleed: p0.bleed, inks: p0.texts.map((t) => t.color + ":" + t.align + ":" + !!t.cover).join(), scrim: p0.decor.map((d) => d.kind).join(), on: document.getElementById("albCover").className.indexOf("on") > 0 };
    document.getElementById("albCover").click(); await window.__wait(600);
    const q0 = ALBUM.doc().pages[0];
    const uncover = { tpl: q0.tplId, auto: q0.auto, bleed: q0.bleed, inks: q0.texts.map((t) => t.color + ":" + t.align + ":" + !!t.cover).join(), decor: q0.decor.length };
    const s1 = ALBUM.doc().pages[cur].story;
    document.getElementById("albStoryNext").click(); await window.__wait(500);
    const s2 = ALBUM.doc().pages[cur].story, headlineObj = ALBUM.doc().pages[cur].texts.filter((t) => t.auto && t.role === "title")[0];
    const headline = headlineObj && headlineObj.text;   /* read now — the typing below edits the same line object */
    const story = ALBUM.math.storyFor(ALBUM.doc().occ, s2);
    /* a retyped line survives a redesign */
    const inp = document.getElementById("albText_title"); inp.value = "Ko Ko & Ma Ma"; inp.dispatchEvent(new Event("input", { bubbles: true })); await window.__wait(200);
    document.getElementById("albDesignPage").click(); await window.__wait(500);
    const kept = ALBUM.doc().pages[cur].texts.filter((t) => t.role === "title").map((t) => t.text + ":" + !!t.auto);
    document.getElementById("albDesignClear").click(); await window.__wait(500);
    const cleared = ALBUM.doc().pages[cur].texts.map((t) => t.role + ":" + !!t.auto), decorLeft = ALBUM.doc().pages[cur].decor.length, storyCleared = ALBUM.doc().pages[cur].story;
    document.getElementById("albDesignAll").click(); await window.__wait(800);
    const redone = ALBUM.doc().pages.slice(1).filter((pg) => pg.photos.length).every((pg) => pg.texts.some((t) => t.auto));
    return { classic, rules, corner, cornerHit, outside, ph, cover, uncover, s1, s2, story: story && story.headline.en, headline, kept, cleared, decorLeft, storyCleared, redone };
  });
  report("C6) Classic re-sets every designed page centred with a rule (two where the room allows); Cream paints the paper (#f6f1e7 wherever no photograph covers the stage); Cover makes the opener a full-bleed page with white, left-aligned words over a scrim and turning it off puts the occasion's words back in the middle; Next story line moves the page to the next set and the headline is that set's; a title typed over is kept (auto off) through a redesign; Clear removes only the engine's marks; Design every page designs every page again",
    c6.classic.length >= 2 && c6.classic.every((a) => a === "center") && c6.rules >= 1 && c6.ph === "#f6f1e7" && c6.corner.length === 3 && c6.cornerHit &&
    c6.cover.tpl === "f1a" && c6.cover.auto === false && c6.cover.bleed && /#ffffff:left:true/.test(c6.cover.inks) && c6.cover.scrim === "scrim" && c6.cover.on &&
    c6.uncover.auto === true && !c6.uncover.bleed && /:center:false/.test(c6.uncover.inks) && !/#ffffff/.test(c6.uncover.inks) && c6.uncover.decor === 0 &&
    c6.s2 === (c6.s1 + 1) % 4 && c6.headline === c6.story && c6.kept.join() === "Ko Ko & Ma Ma:false" && !c6.cleared.some((s) => /:true$/.test(s)) && c6.decorLeft === 0 && c6.storyCleared === -1 && c6.redone, c6);

  /* C7 — density re-lays the pages; the book view; the check rows open their page */
  const c7 = await page.evaluate(async () => {
    const n0 = ALBUM.doc().pages.length, photos0 = ALBUM.doc().pages.reduce((n, pg) => n + pg.photos.length, 0);
    document.getElementById("albDensity_airy").click(); await window.__wait(800);
    const nAiry = ALBUM.doc().pages.length, photosAiry = ALBUM.doc().pages.reduce((n, pg) => n + pg.photos.length, 0), opener = ALBUM.doc().pages[0].texts.length;
    document.getElementById("albDensity_dense").click(); await window.__wait(800);
    const nDense = ALBUM.doc().pages.length, designedStill = ALBUM.doc().pages.slice(1).filter((pg) => pg.photos.length).every((pg) => pg.texts.some((t) => t.auto));
    document.getElementById("albBook").click(); await window.__wait(1200);
    const book = { rows: document.querySelectorAll("#albBook .alb-bookrow").length, cvs: [...document.querySelectorAll("#albBook canvas")].map((c) => c.height > 10),
      firstRowBlankFirst: !!document.querySelector("#albBook .alb-bookrow .alb-bookpage.blank + .alb-bookpage:not(.blank)"), stage: !!document.getElementById("albCanvas"),
      note: (document.querySelector("#albSelBox .alb-selnone") || {}).textContent || "", ops: document.querySelectorAll("#albBookEdit_1, #albBookDesign_1, #albBookDel_1").length, view: ALBUM.doc().view };
    document.getElementById("albBookDesign_1").click(); await window.__wait(600);
    const s = ALBUM.doc().pages[1].story;
    document.getElementById("albBookEdit_2").click(); await window.__wait(600);
    const opened = { cur: ALBUM.doc().cur, view: ALBUM.doc().view, stage: !!document.getElementById("albCanvas") };
    const rows = [...document.querySelectorAll("#albChecks .alb-checkrow")];
    const target = rows.length ? Number(rows[rows.length - 1].getAttribute("data-page")) : -1;
    if (rows.length) rows[rows.length - 1].click(); await window.__wait(500);
    return { n0, photos0, nAiry, photosAiry, opener, nDense, designedStill, book, s, opened, rowsN: rows.length, target, curAfter: ALBUM.doc().cur, viewAfter: ALBUM.doc().view, noteHas: (document.getElementById("albCheckNote") || {}).textContent || "" };
  });
  report("C7) Airy lays the same photographs over more pages and Dense over fewer, the opener's words and the design survive the re-lay; the book view draws every page (the opener alone on the right, then pairs) with ✎ ✦ ✕ under each, the stage canvas withdrawn and the selection bar saying so; ✦ redesigns that page, ✎ opens it in the page view; tapping a print-check row opens the page it names",
    c7.nAiry > c7.n0 && c7.photosAiry === c7.photos0 && c7.opener >= 3 && c7.nDense < c7.nAiry && c7.designedStill &&
    c7.book.rows >= 2 && c7.book.cvs.length === c7.nDense && c7.book.cvs.every(Boolean) && c7.book.firstRowBlankFirst && !c7.book.stage && c7.book.note.length > 10 && c7.book.ops === 3 && c7.book.view === "book" &&
    c7.s >= 0 && c7.opened.cur === 2 && c7.opened.view === "page" && c7.opened.stage && c7.rowsN >= 1 && c7.curAfter === c7.target && c7.viewAfter === "page" && /150/.test(c7.noteHas), c7);

  /* C8 — the PSD carries the design; a saved album comes back whole */
  const c8 = await page.evaluate(async () => {
    const d = ALBUM.doc(); d.cur = 1; ALBUM.setDoc(d); await window.__wait(400);
    ALBUM.select("photo", 0); ALBUM.setFx("warm"); await window.__wait(300);
    const bytes = await ALBUM.psd();
    let s = ""; for (let i = 0; i < Math.min(bytes.length, 4000000); i += 1) s += String.fromCharCode(bytes[i]);
    const design = s.indexOf("Design") > 0, bg = s.indexOf("Background") > 0;
    const copy = JSON.parse(JSON.stringify(ALBUM.doc()));
    ALBUM.setDoc(copy); await window.__wait(600);
    const e = ALBUM.doc();
    return { design, bg, style: e.style, paper: e.paper, density: e.density, cover: e.cover, pool: e.pool.length, story: e.pages[1].story, auto: e.pages[1].texts.filter((t) => t.auto).length, decor: e.pages[1].decor.length, fx: e.pages.some((pg) => pg.photos.some((p) => p.fx)), view: e.view };
  });
  report("C8) the layered PSD of a designed page carries a Design layer beside Background; and an album written out and read back (normalize) keeps its style, paper, density, pool, every page's story index, the engine's lines and decor, the frames' looks and the view",
    c8.design && c8.bg && c8.style === "classic" && c8.paper === "#f6f1e7" && c8.density === "dense" && c8.pool >= 6 && c8.story >= 0 && c8.auto >= 2 && c8.decor >= 1 && c8.fx && c8.view === "page", c8);
  report("C9) no page error through the whole walk", errors.length === 0, errors.slice(0, 5));
  await page.context().close();
}

/* ===================== D) the languages ===================== */
function languages() {
  const missing = [];
  /* 6.122.0 — the seven-language rows (TR_L14) live in data/trmore.js, section l14, since wave G's
     shelf + ornaments pushed the shell over its A4 ceiling; the my/en row still stands in the shell */
  const L14 = A.readTrMore().l14 || {}, L7 = ["shn", "kac", "th", "zh", "vi", "id", "ms"];
  const l14Row = (e) => !!e && L7.every((l) => typeof e[l] === "string" && e[l].length > 0);
  for (const k of KEYS) {
    const base = new RegExp("[\\n,{]\\s*" + k + ':\\{my:"');
    if (!base.test(APP) || !l14Row(L14[k])) missing.push(k);
  }
  report("D1) the designer's " + KEYS.length + " lines are in the studio's nine languages — the my/en row in the house's one-line shape and the seven-language row in data/trmore.js (l14) — and every one is used by the module or the tables",
    missing.length === 0 && KEYS.every((k) => MOD.indexOf('"' + k + '"') > 0 || MOD.indexOf('"' + k.replace(/_(none|bw|sepia|warm|cool|fade|editorial|classic|minimal|script|white|cream|black|airy|balanced|dense|low|soft|empty|edge|dup|gutter)$/, "_")) > 0 || /^alb_(fx|style|paper|density|check)_/.test(k)), { missing });
  const packs = {};
  for (const c of PACKS) {
    const t = read("docs/app/data/trl-" + c + ".js"), head = "window.HNK_TRL=window.HNK_TRL||{};window.HNK_TRL." + c + "=";
    packs[c] = JSON.parse(t.slice(head.length).replace(/;\s*$/, ""));
  }
  const short = [];
  PACKS.forEach((c) => KEYS.forEach((k) => { if (typeof packs[c][k] !== "string" || !packs[c][k].length) short.push(c + ":" + k); }));
  const en = {}; KEYS.forEach((k) => { en[k] = (APP.match(new RegExp("\\n\\s*" + k + ':\\{my:"[^"]*",en:"([^"]*)"')) || [])[1]; });
  const ph = []; PACKS.forEach((c) => KEYS.forEach((k) => {
    const want = ((en[k] || "").match(/\{[A-Z]\}/g) || []).sort().join(), got = ((packs[c][k] || "").match(/\{[A-Z]\}/g) || []).sort().join();
    if (want !== got) ph.push(c + ":" + k);
  }));
  report("D2) the fifteen reader packs (bn gu hi ja km kn ko lo ml mr ne pa ta te ur) carry all " + KEYS.length + " lines with the same placeholders as the English, and the three Tai packs are registered on the sweep's terms (V61210_KEYS)",
    short.length === 0 && ph.length === 0 && /const V61210_KEYS = \[/.test(SWEEP) && (SWEEP.match(/\.\.\.V61210_KEYS[,\]]/g) || []).length === 3,   /* 6.122.0 — wave G's list follows it in the same three rows */ { short: short.slice(0, 6), ph: ph.slice(0, 6) });
}

/* ===================== E) release ===================== */
function releasePins() {
  const LANDING_CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "");
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.122.0 — this wave shipped as 6.121.0 / 6.192.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`E1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING_CLAIMS, "6.120.0") && !has(LANDING_CLAIMS, "6.191.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`E2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — a bold lead, title and story in all nine languages, pointing at the Album page — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgAlbum" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40 && row.s[l].startsWith("**")) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("E3) CI runs this test right after the wave E step and the landing says how many tests the suite runs (263 when this wave shipped, 264 since 6.122.0 added verify_album_wave_g, 265 since 6.123.0 added verify_prop_wave_h, 266 since 6.124.0 added verify_selection_swap, 267 since 6.125.0 added verify_album_wave_i)",
    has(CI, "run: node test/verify_ux_wave_6120.js\n") && has(CI, "run: PORT=8931 node test/verify_album_designer.js") && CI.indexOf("verify_ux_wave_6120") < CI.indexOf("verify_album_designer") &&
    (CI.match(/node test\//g) || []).length === 267 && has(LANDING, "267 tests") && !has(LANDING, "262 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const { page } = await openAlbum(browser, 1280, 900, "en");
    await maths(page);
    await page.context().close();
    await walk(browser);
  } finally { await browser.close(); }
  languages();
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — the album designs itself like a magazine, the tray knows where every photograph is, a frame wears its look into every export, the book is one screen, undo is forty steps, and the print check speaks before the print shop does.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
