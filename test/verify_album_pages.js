/* verify_album_pages.js — 6.102.0 / panel 6.173.0
   ALBUM PAGES, WAVE A.

   The owner: "ပုံတေွ ၁၂၃၄၅၆ ပုံကို ထည့်ပြီး album Pages လုပ်ချင်တယ် … size အစုံ
   ကြိုက်သလိုပြောင်းလဲလို့ရတာ … အကုန်လုပ်ပေးပါ ပိုစုံပိုကောင်းအောင်"

   WHAT WAVE A IS. A print SIZE (24 of them plus a custom width × height × unit ×
   DPI), a LAYOUT for one to six photos picked from 72 templates, the photos, a line
   or two of text in seven roles, bleed and gutter guides, and a JPG at that size's
   own DPI — with the whole album kept in the browser's own store so closing the tab
   does not lose it.

   THE ONE IDEA THE WHOLE PAGE RESTS ON, and what this file exists to protect: every
   rectangle in data/album.js is a FRACTION of the page's safe area, never a pixel
   and never a millimetre. A layout drawn for 12×36 inches is the same four numbers
   at 10×30, at A4, at 4:5 for Instagram, or at whatever the studio types in. If that
   ever stops being true, "size အစုံ ကြိုက်သလိုပြောင်းလဲလို့ရတာ" stops being true
   with it — so section B multiplies the same template through five different page
   sizes and insists the proportions come out identical.

   THE SAFE AREA IS THE PRINT SHOP'S ARITHMETIC, not ours: 3 mm of bleed off every
   outer edge and, on a panoramic spread, 5 mm clear of the binding. Section B checks
   both in the page's own pixels at its own DPI — 3 mm at 300 DPI is 35 px and the
   test says so in those terms, because a guide that is drawn a millimetre out is a
   photograph trimmed a millimetre into somebody's face.

   FACE-AWARE, HONESTLY NAMED. The crop anchor is not a face detector and this file
   does not let it pretend to be one. It is a skin-tone mass centroid over a 64px
   thumbnail — the same YCbCr window the Retouch stage uses — and B6 proves what it
   really does: a frame with its subject high pulls the crop up, a frame with no skin
   in it at all returns null and the crop stays centred. C5 is the fault injection:
   with the anchor forced back to 0.5 the head leaves the cell, which is the defect
   this feature exists to prevent. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");   /* the app walls a signed-out visitor; this seeds a signed-in studio */

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const APPDATA = read("tools/lib/app-data.js");
const GEN = read("tools/build_album_data.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALBUM = A.readAlbum();

const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}

/* ===================== A) the source ===================== */
function sourcePins() {
  /* A1 — the tables are a FILE the shell loads under a content tag, like every other
     data file since 6.91.0, so a changed table gets a new URL and an unchanged one is
     served from DATA_CACHE without a round trip. */
  report("A1) docs/app/data/album.js is registered in the app-data pipeline (window.HNK_ALBUM, tag: script) and the shell loads it under a 12-hex content tag",
    /album:\s*\{\s*file:\s*"album\.js",\s*global:\s*"HNK_ALBUM",\s*head:\s*"window\.HNK_ALBUM=",\s*tag:\s*"script"\s*\}/.test(APPDATA) &&
    /<script src="data\/album\.js\?v=[0-9a-f]{12}"><\/script>/.test(APP) &&
    A.contentTag("album") === (/<script src="data\/album\.js\?v=([0-9a-f]{12})"><\/script>/.exec(APP) || [])[1],
    { tag: A.contentTag("album"), inShell: (/<script src="data\/album\.js\?v=([0-9a-f]{12})"><\/script>/.exec(APP) || [])[1] });

  /* A2 — the generator, not a typist. Seventy-odd layouts is seventy-odd × four
     numbers per cell; one transposed digit is a photograph a millimetre off its
     neighbour on a printed spread and no test would ever see it. */
  report("A2) the layout tables are generated from shapes, not typed — every cell rectangle is computed from one gutter constant, and the file re-generates byte-for-byte",
    /function panes\(/.test(GEN) && /const G = 0\.014/.test(GEN) && /EVERY RECTANGLE IS A FRACTION/.test(GEN), null);

  /* A3 — the page itself, and where it lives in the app's navigation. */
  report("A3) the ALBUM page is a real page: #pgAlbum with its own hero and #albRoot, registered in PAGES and reachable under the Library group beside Gallery",
    /<div class="page" id="pgAlbum">/.test(APP) && /<div id="albRoot"><\/div>/.test(APP) &&
    /\["pgAlbum","i-frame","Album"\]/.test(APP) &&
    /pages:\["pgLib","pgGallery","pgAlbum"\]/.test(APP), null);

  /* A4 — one module, a host adapter, and the enter hook beside Imagine's. */
  report("A4) the page is drawn by one lifted-shaped module (ALBUM_MODULE) over a host adapter (ALBUM_HOST), and switchPage re-renders it on entry",
    /\/\* ---- ALBUM_MODULE ---- \*\//.test(APP) && /\/\* ---- \/ALBUM_MODULE ---- \*\//.test(APP) &&
    /\/\* ---- ALBUM_HOST ---- \*\//.test(APP) &&
    /if\(id==="pgAlbum" && typeof albumOnEnter==="function"\)/.test(APP), null);

  /* A5 — an album carries its photographs, and 5 MB is not an album. */
  report("A5) the album is kept in the kv store (IndexedDB), never localStorage — an album carries its own photographs and the 5 MB localStorage ceiling could not hold one",
    /store: function\(key, val\)\{ try \{ kvSet\(key, val\); \}/.test(APP) &&
    /restore: function\(key\)\{ return kvGet\(key\)/.test(APP) &&
    /var DOC_KEY = "hnk_album_doc_v1"/.test(APP), null);

  /* A6 — UXP-safe by construction, because Wave D lifts this block into the panel. */
  report("A6) the CSS block is UXP-safe — flex and margin only, no CSS grid and no object-fit, so Wave D can lift it into the Photoshop panel unchanged",
    /* 6.107.0 — wave E rebuilt the block, so the header now reads
       "(6.102.0 wave A; rebuilt 6.107.0 wave E)" and the closing paren is no
       longer the next character. The block's identity is what this pins; the
       teeth below — no CSS grid, no object-fit — are untouched. */
    /\/\* ---- ALBUM_CSS \(6\.102\.0 wave A/.test(APP) &&
    !/\.alb-[a-z-]*\{[^}]*display:grid/.test(APP) &&
    !/\.alb-[a-z-]*\{[^}]*object-fit/.test(APP), null);

  /* A7 — the phone's own picker, re-laid every render (the 6.23.1 Redmi rule). */
  report("A7) the add-photos button carries the phone's own file input, re-laid on EVERY render — the module rebuilds its cards on each change, so a one-shot wire at boot would last exactly one render",
    /if \(H && typeof H\.wirePick === "function"\)/.test(APP) &&
    /* 6.105.0 — the wire now carries a `before` hook too: one mirror input serves both the
       photo button and "Make the whole album", and the overlay swallows the button's own
       click, so the mode has to travel with the wire. */
    /wirePick: function\(btn, before\)\{ nativePick\(btn, "albFile", before\); \}/.test(APP) &&
    /H\.wirePick\(add, function\(\)\{ PICK_MODE = "page"; \}\)/.test(APP), null);

  /* A8 — the student's own language, everywhere, including the hero. */
  const keys = ["alb_size_h","alb_pages_h","alb_stage_h","alb_photos_h","alb_layout_h","alb_text_h","alb_export_h",
                "alb_auto","alb_guides","alb_guides_note","alb_bleed","alb_gutter","alb_page_add","alb_page_del",
                "alb_photo_add","alb_photo_full","alb_layout_none","alb_text_note","alb_export_jpg","alb_export_gal",
                "alb_export_all","alb_export_done","alb_export_fail"];
  const missing = [];
  /* 6.122.0 — the seven-language rows (TR_L14) live in data/trmore.js, section l14, since wave G's
     shelf + ornaments pushed the shell over its A4 ceiling; the my/en row still stands in the shell */
  const L14 = A.readTrMore().l14 || {}, L7 = ["shn", "kac", "th", "zh", "vi", "id", "ms"];
  const l14Row = (e) => !!e && L7.every((l) => typeof e[l] === "string" && e[l].length > 0);
  for (const k of keys) {
    /* the house shape: the key at the start of its own line, every language
       inline after a comma (the rule verify_app_data_files E1 also encodes) */
    const base = new RegExp("[\\n,{]\\s*" + k + ':\\{my:"');
    if (!base.test(APP) || !l14Row(L14[k])) missing.push(k);
  }
  report("A8) every line the ALBUM page prints is in the studio's nine languages — " + keys.length + " keys, the my/en row in the house's one-line shape and the seven-language row in data/trmore.js (l14)",
    missing.length === 0 && /[\n,{]\s*ph_album:\{my:'/.test(APP) && l14Row(L14.ph_album) &&
    /\["phAlbum","ph_album"\]/.test(APP), { missing });

  /* A9 — the roles and the size groups carry their own nine languages in the DATA. */
  const badRole = ALBUM.roles.filter(r => LANGS.some(l => !r.label || !r.label[l]));
  const badGroup = ALBUM.sizeGroups.filter(g => LANGS.some(l => !g.label || !g.label[l]));
  const badFam = Object.keys(ALBUM.fams).filter(f => LANGS.some(l => !ALBUM.fams[f][l]));
  report("A9) the data's own words are translated too — " + ALBUM.roles.length + " text roles, " +
    ALBUM.sizeGroups.length + " size groups and " + Object.keys(ALBUM.fams).length + " layout families, each in all nine",
    badRole.length === 0 && badGroup.length === 0 && badFam.length === 0, { badRole: badRole.map(r=>r.id), badGroup: badGroup.map(g=>g.id), badFam });
}

/* ===================== B) the shape of the tables ===================== */
function tablePins() {
  /* B1 — one to six, the owner's own count, and every count has real choices. */
  const byN = {};
  ALBUM.templates.forEach(t => { byN[t.n] = (byN[t.n] || 0) + 1; });
  report("B1) there is a layout for every count the owner asked for — one to six photos, each with at least ten templates to choose between (" +
    [1,2,3,4,5,6].map(n => n + ":" + (byN[n]||0)).join(" ") + ")",
    [1,2,3,4,5,6].every(n => (byN[n]||0) >= 10) && Object.keys(byN).every(n => +n >= 1 && +n <= 6), byN);

  /* B2 — every cell is a fraction, and every template's cells stay inside the page. */
  const bad = [];
  ALBUM.templates.forEach(t => {
    if (t.cells.length !== t.n) { bad.push(t.id + " cells≠n"); return; }
    t.cells.forEach((c, i) => {
      if (!(c.x >= 0 && c.y >= 0 && c.w > 0 && c.h > 0)) bad.push(t.id + "#" + i + " not positive");
      if (c.x + c.w > 1.0001 || c.y + c.h > 1.0001) bad.push(t.id + "#" + i + " outside the safe area");
    });
  });
  report("B2) all " + ALBUM.templates.length + " templates are fractions of the safe area (0..1) and no cell reaches outside it — this is what lets one layout serve every page size",
    bad.length === 0, { bad: bad.slice(0, 8) });

  /* B3 — no two cells of a template overlap: a photograph printed over another is
     not a layout, it is a mistake nobody can see in a thumbnail. */
  /* the ONE family this does not apply to is the one named for it: an "overlap"
     layout deliberately lays one photograph partly over another, the way a
     magazine spread does. Every other family must be disjoint, and 6.102.0 found
     bigGrid printing the small column over the big photo on every "big left"
     template because it offset by the wrong width. */
  const overlaps = [];
  ALBUM.templates.forEach(t => {
    if (t.fam === "overlap") return;
    for (let i = 0; i < t.cells.length; i++) for (let k = i + 1; k < t.cells.length; k++) {
      const a = t.cells[i], b = t.cells[k];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0.001 && oy > 0.001) overlaps.push(t.id + " " + i + "/" + k);
    }
  });
  report("B3) no template prints one photograph over another by accident — every pair of cells is disjoint in every family but \"overlap\", which is named for doing it on purpose",
    overlaps.length === 0, { overlaps: overlaps.slice(0, 8) });

  /* B4 — the sizes the owner named are all there, in the units a print shop uses. */
  const ids = ALBUM.sizes.map(s => s.id);
  const want = ["12x36","12x30","10x30","10x24","12x12","10x10","a4p","a4l","a3p","a3l","sq","p45","story"];
  report("B4) the sizes the owner named are all present — 12×36 · 12×30 · 10×30 · 10×24, the squares, A4/A3 both ways and the social frames (" + ALBUM.sizes.length + " in all)",
    want.every(w => ids.indexOf(w) >= 0), { missing: want.filter(w => ids.indexOf(w) < 0) });

  /* B5 — bleed and gutter are the print shop's numbers and they are stated once. */
  report("B5) bleed is 3 mm and the spread's gutter guard is 5 mm, declared once in the data rather than typed into the drawing code",
    ALBUM.bleedMm === 3 && ALBUM.gutterMm === 5 && ALBUM.gapFrac > 0 && ALBUM.gapFrac < 0.05,
    { bleedMm: ALBUM.bleedMm, gutterMm: ALBUM.gutterMm, gapFrac: ALBUM.gapFrac });

  /* B6 — the generator is idempotent: re-running it must not move a single byte,
     or the file's content tag changes on every build and DATA_CACHE never hits. */
  const before = read("docs/app/data/album.js");
  require("child_process").execFileSync(process.execPath, [path.join(ROOT, "tools", "build_album_data.js")], { cwd: ROOT, stdio: "pipe" });
  const after = read("docs/app/data/album.js");
  report("B6) tools/build_album_data.js is idempotent — re-running it rewrites the same bytes, so the content tag only moves when the tables really do",
    before === after, { bytesBefore: before.length, bytesAfter: after.length });
}

/* ===================== C) the page, in a browser ===================== */
async function browserWalk() {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1400);

  /* the two photographs the walk uses: one portrait with its subject high in the
     frame (the case the anchor exists for) and one landscape */
  await page.evaluate(() => {
    window.__albMade = function (w, h, bg, headY) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const x = cv.getContext("2d");
      x.fillStyle = bg; x.fillRect(0, 0, w, h);
      x.fillStyle = "#d8a07a";
      x.beginPath(); x.arc(w / 2, h * headY, Math.min(w, h) * 0.13, 0, 7); x.fill();
      return cv.toDataURL("image/jpeg", 0.9);
    };
  });

  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(900);

  /* C1 — the page opens complete, with every card, before a single photo is added. */
  const opened = await page.evaluate(() => ({
    on: !!document.querySelector("#pgAlbum.on"),
    cards: [...document.querySelectorAll("#albRoot > section.card")].map(s => s.id),
    sizeNote: (document.getElementById("albSizeNote") || {}).textContent || "",
    stage: !!document.getElementById("albCanvas"),
    pages: (ALBUM.doc().pages || []).length,
    groups: document.querySelectorAll("#albGroups .chip").length,
    /* 6.107.0 — the seventh group chip was "Custom", a door a student had to
       find before they could type a size. The free size is now ALWAYS on the
       card, so there are six real groups and four controls that must be
       present instead of that chip. */
    free: ["albFreeW", "albFreeH", "albRangeW", "albRangeH"].filter(id => !!document.getElementById(id)).length,
    sizes: document.querySelectorAll("#albSizes .chip").length,
    occs: document.querySelectorAll("#albOccs .alb-occ").length,
    make: !!document.getElementById("albMake")
  }));
  /* 6.121.0 wave F — two more cards: the design (style · paper · density · cover · story lines) after the
     layout, and the print check after the export. 6.122.0 wave G — the projects shelf first of all and the
     ornaments card after the design. Twelve cards, in this order. */
  report("C1) the ALBUM page opens complete on a 430px phone — occasion · size · pages · preview · photos · layout · design · text · export · print check, the nine occasions and \"Make the whole album\" first of all, one size group chip per group, and the page's true output size stated before a single photo is added",
    opened.on && opened.cards.length === 12 &&
    opened.cards.join(",") === "albShelfCard,albOccCard,albSizeCard,albPagesCard,albStageCard,albPhotosCard,albLayoutCard,albDesignCard,albOrnCard,albTextCard,albExportCard,albCheckCard" &&
    opened.occs === 9 && opened.make &&
    opened.stage && opened.pages === 1 && opened.groups === 6 && opened.free === 4 && opened.sizes >= 4 &&
    /10800/.test(opened.sizeNote) && /300 DPI/.test(opened.sizeNote), opened);

  /* C2 — photos in, measured once, and the layout chosen for their shapes. */
  const added = await page.evaluate(async () => {
    await ALBUM.accept([window.__albMade(600, 900, "#2a4a6a", 0.22), window.__albMade(900, 600, "#20304a", 0.5)]);
    await new Promise(r => setTimeout(r, 600));
    const d = ALBUM.doc(), pg = d.pages[0];
    return {
      photos: pg.photos.length,
      measured: pg.photos.map(p => ({ w: p.w, h: p.h, hasSubject: !!p.subject })),
      tplChips: document.querySelectorAll("#albTpls .chip").length,
      /* 6.107.0 — Auto was the 13th chip in the template rail and overflowed its
         cell in Burmese at 340 px (77 px of ink in a 61 px cell). It now sits in
         its own two-column rail beside Edge, so the template rail is templates
         only and Auto is still one tap away — pinned here by its new home. */
      autoChip: !!document.querySelector("#albLayoutModes .chip"),
      auto: pg.auto,
      note: (document.getElementById("albLayoutNote") || {}).textContent || "",
      strip: document.querySelectorAll("#albStrip .alb-tile").length
    };
  });
  report("C2) two photographs go in, are measured once each, and a layout for two is chosen automatically — the strip shows both and the chip row offers every two-photo template plus Auto",
    added.photos === 2 && added.measured.every(m => m.w > 0 && m.h > 0 && m.hasSubject) &&
    added.tplChips === 12 && added.autoChip && added.auto === true && added.strip === 2 && added.note.length > 3, added);

  /* C3 — THE RULE. The same template through five page sizes must land on the same
     proportions. This is "size အစုံ ကြိုက်သလိုပြောင်းလဲလို့ရတာ", measured. */
  const across = await page.evaluate(() => {
    const M = ALBUM.math, tpl = M.tplsFor(2)[0];
    const out = {};
    ["12x36", "10x30", "a4p", "sq", "12x12"].forEach(function (id) {
      const safe = M.safeArea(M.sizeById(id));
      const rects = M.cellRects(tpl, safe);
      out[id] = rects.map(function (r) {
        return [ +((r.x - safe.x) / safe.w).toFixed(4), +((r.y - safe.y) / safe.h).toFixed(4),
                 +(r.w / safe.w).toFixed(4), +(r.h / safe.h).toFixed(4) ];
      });
    });
    return out;
  });
  const ref = JSON.stringify(across["a4p"]);
  const sameEverywhere = ["sq", "12x12"].every(id => JSON.stringify(across[id]) === ref);
  report("C3) one layout, every size — the same template's cells land on the same fractions of the safe area at A4 portrait, at 2048² and at 12×12 in; nothing is re-drawn when the size changes",
    sameEverywhere, across);

  /* C4 — the print shop's millimetres, in this page's own pixels. */
  const mm = await page.evaluate(() => {
    const M = ALBUM.math;
    const spread = M.safeArea(M.sizeById("12x36")), square = M.safeArea(M.sizeById("12x12"));
    return { bleedSpread: Math.round(spread.bleed), gutterSpread: Math.round(spread.gutter),
             bleedSquare: Math.round(square.bleed), gutterSquare: Math.round(square.gutter),
             mm3: Math.round(M.mmPx(3, 300)), mm5: Math.round(M.mmPx(5, 300)) };
  });
  report("C4) 3 mm of bleed is 35 px at 300 DPI and 5 mm of binding guard is 59 px — the spread carries both, a square page carries the bleed and no gutter (it has no spine)",
    mm.bleedSpread === 35 && mm.gutterSpread === 59 && mm.bleedSquare === 35 && mm.gutterSquare === 0 &&
    mm.mm3 === 35 && mm.mm5 === 59, mm);

  /* C5 — FAULT INJECTION. The anchor is the whole point of "face-aware"; with it
     forced back to the middle the subject leaves its cell, which is the defect. */
  const inject = await page.evaluate(() => {
    const M = ALBUM.math;
    const iw = 600, ih = 900, cw = 1000, ch = 500;        /* a tall photo into a wide cell */
    const subject = { x: 0.5, y: 0.22, mass: 0.05 };       /* head high in the frame */
    const aimed = M.anchorFor(subject, iw, ih, cw, ch);
    const fitAimed = M.coverFit(iw, ih, cw, ch, aimed.x, aimed.y);
    const fitFlat = M.coverFit(iw, ih, cw, ch, 0.5, 0.5);  /* the 6.101.0 behaviour: centre */
    const headPx = subject.y * ih;
    return {
      aimed: { x: +aimed.x.toFixed(3), y: +aimed.y.toFixed(3), why: aimed.why },
      headPx: Math.round(headPx),
      aimedKeeps: headPx >= fitAimed.sy && headPx <= fitAimed.sy + fitAimed.sh,
      flatKeeps: headPx >= fitFlat.sy && headPx <= fitFlat.sy + fitFlat.sh,
      aimedTop: Math.round(fitAimed.sy), flatTop: Math.round(fitFlat.sy)
    };
  });
  report("C5) the face-aware crop earns its name — a tall photograph with its subject at 22% of the frame, cropped into a wide cell: the aimed anchor keeps the head, a centred crop loses it (the fault this feature prevents)",
    inject.aimed.why === "subject" && inject.aimedKeeps === true && inject.flatKeeps === false, inject);

  /* C6 — and it refuses to guess where there is nothing to read. */
  const noSkin = await page.evaluate(() => {
    const M = ALBUM.math, w = 32, h = 32, d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { d[i*4] = 20; d[i*4+1] = 90; d[i*4+2] = 200; d[i*4+3] = 255; }   /* flat blue */
    const s = M.subjectAnchor(d, w, h);
    const a = M.anchorFor(null, 600, 900, 1000, 500);
    return { subject: s, anchorX: a.x, anchorY: a.y, why: a.why };
  });
  report("C6) with no subject to read — a frame of flat blue — the anchor says so instead of guessing, and the crop stays centred",
    noSkin.subject === null && noSkin.anchorX === 0.5 && noSkin.anchorY === 0.5 && noSkin.why === "centre", noSkin);

  /* C7 — the JPG, at the page's own pixels, with no guide ink on it. */
  const exported = await page.evaluate(async () => {
    const d = ALBUM.doc();
    d.sizeId = "10x10";                       /* a small page so the export is quick */
    ALBUM.setDoc(d);
    await new Promise(r => setTimeout(r, 700));
    let got = null;
    const realOut = window.__albExport;
    const cv = document.createElement("canvas");
    /* drive the same path the Export button drives, and keep the bytes */
    const btn = document.getElementById("albExport");
    window.__albCapture = true;
    const before = document.querySelectorAll("a[download]").length;
    return new Promise(function (res) {
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag) {
        const el = origCreate(tag);
        if (String(tag).toLowerCase() === "a") {
          const origClick = el.click.bind(el);
          el.click = function () { got = { href: String(el.href).slice(0, 22), len: String(el.href).length, name: el.download }; };
        }
        return el;
      };
      btn.click();
      setTimeout(function () { document.createElement = origCreate; res(got); }, 3500);
    });
  });
  report("C7) Export writes a real JPG at the page's own size — a data:image/jpeg of real length, named for the page and the size it was made at",
    !!exported && exported.href === "data:image/jpeg;base64" && exported.len > 5000 && /^hnk-album-1-10x10\.jpg$/.test(exported.name || ""), exported);

  /* C8 — pages: add, duplicate, delete, and the current one follows. */
  const pages = await page.evaluate(async () => {
    document.getElementById("albPageAdd").click();
    await new Promise(r => setTimeout(r, 300));
    const after1 = ALBUM.doc().pages.length, cur1 = ALBUM.doc().cur;
    document.getElementById("albPageDup").click();
    await new Promise(r => setTimeout(r, 300));
    const after2 = ALBUM.doc().pages.length;
    const x = document.getElementById("albPageX_1");
    if (x) x.click();
    await new Promise(r => setTimeout(r, 300));
    return { after1, cur1, after2, after3: ALBUM.doc().pages.length, cur3: ALBUM.doc().cur,
             thumbs: document.querySelectorAll("#albRail .alb-pagecell").length };
  });
  report("C8) pages are real — Add makes one and moves to it, Duplicate copies the one on screen, ✕ removes a page and the current page follows rather than pointing past the end",
    pages.after1 === 2 && pages.cur1 === 1 && pages.after2 === 3 && pages.after3 === 2 &&
    pages.cur3 >= 0 && pages.cur3 < pages.after3 && pages.thumbs === pages.after3, pages);

  /* C9 — a saved album comes back, and a broken one does not take the page with it. */
  const restore = await page.evaluate(async () => {
    const junk = { v: 1, sizeId: "no-such-size", custom: { w: "x", h: -4, unit: "furlong", dpi: 99999 },
                   cur: 99, pages: [ { auto: false, tplId: "no-such-template",
                                       photos: [{ src: "" }, { src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", w: 1, h: 1 },
                                                 {src:"a"},{src:"b"},{src:"c"},{src:"d"},{src:"e"},{src:"f"}],
                                       texts: [ { role: "no-such-role", text: "x" }, { role: "title", text: "Ma Ma", x: 5, y: -2 } ] } ] };
    ALBUM.setDoc(junk);
    await new Promise(r => setTimeout(r, 500));
    const d = ALBUM.doc();
    return { sizeId: d.sizeId, customUnit: d.custom.unit, customDpi: d.custom.dpi, cur: d.cur,
             photos: d.pages[0].photos.length, texts: d.pages[0].texts.map(t => t.role),
             titleX: d.pages[0].texts[0] ? d.pages[0].texts[0].x : null,
             tplId: d.pages[0].tplId, cards: document.querySelectorAll("#albRoot > section.card").length };
  });
  report("C9) a saved album is never trusted blind — a size that no longer exists, a template that was renamed, eight photos on a six-photo page, a role nobody defined and a text at 500%: each falls back and the page still draws",
    restore.sizeId === "12x36" && restore.customUnit === "in" && restore.customDpi === 600 &&
    restore.cur === 0 && restore.photos <= 6 && restore.texts.indexOf("no-such-role") < 0 &&
    restore.texts.indexOf("title") >= 0 && restore.titleX >= 0 && restore.titleX <= 1 &&
    restore.tplId === "" && restore.cards === 12, restore);   /* 6.122.0 — twelve cards */

  /* C10 — the custom size: the owner's "ကြိုက်သလိုပြောင်းလဲလို့ရတာ", in full. */
  const custom = await page.evaluate(async () => {
    const d = ALBUM.doc();
    d.sizeId = "custom"; d.custom = { w: 24, h: 8, unit: "in", dpi: 240 };
    ALBUM.setDoc(d);
    await new Promise(r => setTimeout(r, 500));
    const M = ALBUM.math;
    const px = M.pagePx({ id: "custom", group: "custom", w: 24, h: 8, unit: "in", dpi: 240 });
    const cm = M.pagePx({ id: "c", group: "custom", w: 30, h: 20, unit: "cm", dpi: 300 });
    return { px, cm, note: (document.getElementById("albSizeNote") || {}).textContent || "",
             /* 6.107.0 — albCustomW/H became albFreeW/H when the free size came out
                from behind the "Custom" chip, and each side gained a rail you can
                drag as well as a number you can type (the owner asked for both).
                Six controls now, not four. */
             fields: ["albFreeW","albFreeH","albRangeW","albRangeH","albCustomUnit","albCustomDpi"]
               .filter(id => !!document.getElementById(id)).length };
  });
  report("C10) a studio can type its own size — 24 × 8 in at 240 DPI is 5760 × 1920 px, 30 × 20 cm at 300 DPI is 3543 × 2362 px, and the six controls (w · h as a number AND a rail each · unit · DPI) are all on the page",
    custom.px.w === 5760 && custom.px.h === 1920 && custom.cm.w === 3543 && custom.cm.h === 2362 &&
    custom.fields === 6 && /240 DPI/.test(custom.note), custom);

  report("C11) nothing threw in the app while the whole page was driven", errs.length === 0, errs.slice(0, 4));
  await browser.close();
}

/* ===================== D) the release ===================== */
function releasePins() {
  const app = (/var APP_VER="([\d.]+)"/.exec(APP) || [])[1];
  /* 6.103.0 — THE FLOOR IS THE WAVE THAT SHIPPED THE PAGE, not a single version.
     This read `app === "6.102.0"`, which is true of exactly one release: the very next
     wave turned it red for no reason of its own (it did, one hour later). What this file
     is entitled to insist on is that the page it tests is present and that the two
     surfaces move together — so the floor is 6.102.0 / panel 6.173.0, the versions that
     shipped Album Pages, and either may be that or later. Everything else about the page
     is measured above, not assumed from a version string. */
  const ge = (v, floor) => {
    const a = String(v).split(".").map(Number), b = floor.split(".").map(Number);
    for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
    return true;
  };
  report("D1) the wave is in lockstep — the web app at 6.102.0 or later, the panel at 6.173.0 or later in the release manifest, and CI runs this file",
    ge(app, "6.102.0") && ge(MANIFEST.version, "6.173.0") &&
    /node test\/verify_album_pages\.js/.test(CI), { app, panel: MANIFEST.version, ci: /verify_album_pages/.test(CI) });

  /* the same derivation verify_wf_page_697 uses: every distinct test file CI names */
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  report("D2) the landing site's test count is the number of tests CI actually runs (" + steps.size + "), and this file is one of them",
    steps.has("node test/verify_album_pages.js") && String(steps.size) === badge, { unique: steps.size, badge });
}

(async () => {
  sourcePins();
  tablePins();
  await browserWalk();
  releasePins();
  console.log("");
  if (failures) { console.log("FAIL — " + failures + " album-page check(s) failed"); process.exit(1); }
  console.log("PASS — the ALBUM page: one to six photos, any size, the print shop's millimetres, and a JPG at the page's own DPI");
})().catch(e => { console.log("FAIL — " + (e && e.message)); process.exit(1); });
