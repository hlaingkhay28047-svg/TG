/* verify_album_touch.js — 6.110.0 / panel 6.181.0
   THE ALBUM YOU CAN TOUCH (wave A of the owner's album programme).

   The owner, with four photographs of the live Album page:
   "လက်နဲ့ mouse နဲ့ ပုံအတွင်းပိုင်းကို လိုသလိုပြင်လို့ရအောင် overlay တို့ Texts တို့လဲ အဲ့လို
   ဆွဲချုံချဲ့လို့ရအောင်" — let the inside of a photograph be adjusted by finger and by mouse,
   and let the overlays and the words be dragged and resized the same way.

   WHAT WAS TRUE BEFORE. Every crop on an album page was decided for the student: a skin-tone
   centroid guessed where the subject was, anchorFor turned that into one number per axis, and
   there the photograph stayed. The seven text roles sat at seven fixed fractions of the page.
   Nothing on the page could be moved by hand, at any width, by any input device.

   WHAT THIS MEASURES.

   A  the source — the zoom is part of cover fit, the marquee is stage-only, a crop the student
      set survives the layout, the canvas takes the gesture, and one layout function answers
      both the painter and the hit test.
   B  the arithmetic, through the shipped functions: no zoom is byte-for-byte wave A's answer;
      a zoom only ever shrinks the source rectangle (so no zoom can put paper inside a frame);
      a pan clamps at the photograph's own edges; a pinch keeps the point under the fingers.
   C  the page, driven by real pointer events at a monitor width and a phone width: select,
      drag, pinch-by-buttons, wheel, arrows, reset, a text moved and turned, a layout change
      that leaves a touched crop alone, the export that carries the crop and not the marquee,
      a reload that remembers, and a page turn that drops the selection.
   D  fault injection — with the manual flag cleared, the very same layout change DOES move the
      crop, which is the failure this wave exists to prevent.
   E  the release pins. */

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
const KEYS = ["alb_touch_note", "alb_sel_none", "alb_sel_photo", "alb_sel_text", "alb_zoom_out",
  "alb_zoom_in", "alb_rot_l", "alb_rot_r", "alb_reset_one", "alb_move_l", "alb_move_r",
  "alb_move_u", "alb_move_d", "alb_spread_note"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const WEB = "6.133.0";   /* re-pinned with each lockstep bump */
const PANEL = "6.204.0";
/* 6.111.0 — WEB/PANEL are the CURRENT release, which E1 pins in lockstep and
   which every release moves. ALBUM_WAVE is a different fact: the release that
   actually SHIPPED this stage, and therefore the release whose What's New row
   E4 reads. They were the same number for one release and E4 conflated them,
   so the first unrelated release after it (6.111.0, a Smart Workflow fix whose
   row correctly points at pgWf) turned E4 red for no defect. E4 now asks the
   question it means to ask — "the album wave announced itself, in all nine
   languages, on the album page" — and that answer does not expire. */
const ALBUM_WAVE = "6.110.0";
let failures = 0;

function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
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
const CSS = (APP.match(/\/\* ---- ALBUM_CSS[\s\S]*?\/\* ---- \/ALBUM_CSS ---- \*\//) || [""])[0];
/* 6.125.0 — the ALBUM module left the shell for docs/app/data/album-module.js (the A4 ceiling) */
const MOD = read("docs/app/data/album-module.js");

/* ======================= A — what the source must say ======================= */
function source() {
  report("A0) the two blocks this test reads were found: the album's stylesheet and the album module",
    CSS.length > 3000 && MOD.length > 60000, { css: CSS.length, mod: MOD.length });

  report("A1) the zoom is part of cover fit, not a second geometry beside it: coverFit takes it, clamps it between ZOOM_MIN and ZOOM_MAX, and multiplies the cover scale by it — so the source rectangle can only ever get smaller than the one that covers the cell",
    /var ZOOM_MIN = 1, ZOOM_MAX = 6;/.test(MOD) &&
    /function coverFit\(iw, ih, cw, ch, anchorX, anchorY, zoom\)/.test(MOD) &&
    /var z = \(zoom==null \|\| !isFinite\(zoom\)\) \? 1 : clamp\(zoom, ZOOM_MIN, ZOOM_MAX\);/.test(MOD) &&
    /var scale = Math\.max\(cw\/iw, ch\/ih\) \* z;/.test(MOD), null);

  report("A2) the drawing reads the student's zoom, and the marquee is drawn last and only when the stage asks for it",
    /coverFit\(im\.naturalWidth\|\|im\.width, im\.naturalHeight\|\|im\.height, r\.w, r\.h, a\.x, a\.y, ph\.zoom\)/.test(MOD) &&
    /if \(opt\.sel\) drawSel\(x, pg, safe, rects, scale, m, opt\.sel\);/.test(MOD) &&
    /function drawSel\(x, pg, safe, rects, scale, m, sel\)/.test(MOD), null);

  /* every export path draws through drawPage, and none of them may pass a selection */
  const calls = (MOD.match(/[^\n]*\bdrawPage\([^\n]*/g) || []).filter(l => !/function drawPage/.test(l));
  const withSel = calls.filter(c => /\bsel\s*:/.test(c));
  report("A3) exactly one of the module's drawPage calls carries a selection — the stage's. The page rail's thumbnails, the page JPEG, the whole-album PDF and the layered PSD all draw without one, so no download can carry the handles",
    calls.length >= 3 && withSel.length === 1 && /guides: !!DOC\.guides, sel: selObj\(\) \? SEL : null/.test(withSel[0]),
    { calls: calls.length, withSel });

  report("A4) a crop the student set is theirs: reAnchor skips a photograph marked manual, and only the reset button clears the mark",
    /if \(ph\.manual\) continue;/.test(MOD) &&
    /function resetSel\(\)\{[\s\S]{0,400}o\.zoom = 1; o\.manual = false;/.test(MOD) &&
    /ph\.manual = true;\n\s*return true;\n\s*\}/.test(MOD), null);

  report("A5) the canvas takes the gesture rather than the page: touch-action is none in the stylesheet, and the stage binds pointer down / move / up / cancel, a non-passive wheel and a double click — once per canvas, on the element itself",
    /\.alb-canvas\{touch-action:none;cursor:grab/.test(CSS) &&
    /function bindStage\(cv\)\{\s*\n\s*if \(!cv \|\| cv\.__albTouch\) return;\s*\n\s*cv\.__albTouch = true;/.test(MOD) &&
    ["pointerdown", "pointermove", "pointerup", "pointercancel"].every(e => MOD.indexOf('cv.addEventListener("' + e + '"') > 0) &&
    /cv\.addEventListener\("wheel", function\(ev\)\{[\s\S]*?\{ passive:false \}\);/.test(MOD) &&
    MOD.indexOf('cv.addEventListener("dblclick"') > 0, null);

  report("A6) ONE layout answers both the painter and the hit test — drawTexts, drawSel and hitText all ask textLayout, and drawTexts no longer works the size out for itself",
    /function textLayout\(x, tx, role, safe, scale, m\)/.test(MOD) &&
    (MOD.match(/textLayout\(/g) || []).length >= 4 &&
    /function drawTexts\(x, pg, safe, scale, m\)\{[\s\S]{0,700}var L = textLayout\(x, tx, role, safe, scale, m\);/.test(MOD) &&
    MOD.indexOf('var px = Math.max(8, role.size * safe.h * scale);') < 0, null);

  report("A7) the hit test measures in the page's own pixels — the same coordinate system pagePt returns and the cells are written in",
    /var t = hitText\(x, pg, safe, 1, px, py\);/.test(MOD) &&
    /function hitCell\(cells, n, px, py\)/.test(MOD) &&
    /return \{ x: \(ev\.clientX - r\.left\) \* kx \/ VIEW\.scale, y: \(ev\.clientY - r\.top\) \* ky \/ VIEW\.scale \};/.test(MOD), null);

  report("A8) every gesture also has a button, because a Photoshop panel and a shaking hand have no pinch: two for the size, two rotations for a line, a reset, and four arrows",
    /function fillSelBar\(\)/.test(MOD) &&
    /selBtn\("−", L\("alb_zoom_out"\)/.test(MOD) && /selBtn\("\+", L\("alb_zoom_in"\)/.test(MOD) &&
    /selBtn\("↺", L\("alb_rot_l"\)/.test(MOD) && /selBtn\("↻", L\("alb_rot_r"\)/.test(MOD) &&
    /selBtn\(L\("alb_reset_one"\), L\("alb_reset_one"\)/.test(MOD) &&
    ["alb_move_l", "alb_move_r", "alb_move_u", "alb_move_d"].every(k => MOD.indexOf('L("' + k + '")') > 0), null);

  report("A9) selecting something never rebuilds the page — the rail is refilled in place, and only a page turn drops the selection",
    /box\.innerHTML = "";/.test(MOD) &&
    /if \(SELPAGE !== DOC\.cur\)\{ SEL = null; SELPAGE = DOC\.cur; \}/.test(MOD) &&
    /function touchChanged\(live\)\{\s*\n\s*saveSoon\(\);\s*\n\s*repaint\(!!live\);/.test(MOD), null);

  report("A10) a drag does not redraw forty thumbnails per frame: repaint takes `live` and returns after the stage",
    /function repaint\(live\)/.test(MOD) && /if \(live\) return;/.test(MOD) &&
    /VIEW = \{ scale: scale, safe: safeNow, spread: spread,/.test(MOD), null);

  report("A11) the two numbers survive a save: normalize reads a photograph's zoom and manual mark and a line's size and rotation, within their own bounds, and an album written before this wave reads back as the page laid it out",
    /zoom: isFinite\(q\.zoom\) \? clamp\(\+q\.zoom, ZOOM_MIN, ZOOM_MAX\) : 1,/.test(MOD) &&
    /manual: !!q\.manual,/.test(MOD) && /function normPhoto\(q\)/.test(MOD) &&   /* 6.121.0 — one reader, normPhoto, for a page and the tray; the look follows the mark */
    /size: isFinite\(t\.size\) \? clamp\(\+t\.size, TEXT_MIN, TEXT_MAX\) : 1,/.test(MOD) &&
    /rot: isFinite\(t\.rot\) \? clamp\(\+t\.rot, -180, 180\) : 0,/.test(MOD), null);

  const both = KEYS.filter(k => rows(k) !== 2);
  const packGaps = [];
  READERS.forEach(code => KEYS.forEach(k => { if (!TRL[code] || !TRL[code][k]) packGaps.push(code + "/" + k); }));
  report("A12) all fourteen new lines exist in both of the app's dictionaries and in every one of the fifteen reader packs",
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
  report("A13) every reader pack carries the same placeholders as the English — a line that loses {N} prints a photograph with no number",
    ph.length === 0, { ph: ph.slice(0, 12) });
}

/* ======================= B — the arithmetic, through the shipped functions ======================= */
async function maths(page) {
  const m = await page.evaluate(() => {
    const M = ALBUM.math;
    const out = {};
    /* B1 — no zoom is exactly the answer wave A gave */
    const shapes = [[1200, 1600, 900, 600], [1600, 1200, 400, 1200], [3000, 2000, 1000, 1000],
                    [800, 800, 1200, 300], [2400, 3600, 600, 900]];
    out.same = shapes.map(([iw, ih, cw, ch]) => {
      const a = M.coverFit(iw, ih, cw, ch, 0.4, 0.3);
      const s = Math.max(cw / iw, ch / ih);
      return Math.abs(a.sw - cw / s) < 1e-9 && Math.abs(a.sh - ch / s) < 1e-9 &&
             Math.abs(a.sx - (iw - cw / s) * 0.4) < 1e-9 && a.zoom === 1;
    });
    /* B2 — a zoom only ever shrinks the window, and the window keeps the cell's shape */
    out.cover = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 400; i++) {
      const iw = 200 + Math.floor(rnd() * 4000), ih = 200 + Math.floor(rnd() * 4000);
      const cw = 50 + rnd() * 2000, ch = 50 + rnd() * 2000;
      const z = 1 + rnd() * 5, ax = rnd(), ay = rnd();
      const f1 = M.coverFit(iw, ih, cw, ch, ax, ay), f = M.coverFit(iw, ih, cw, ch, ax, ay, z);
      const shape = Math.abs((f.sw / f.sh) - (cw / ch)) < 1e-6;
      const inside = f.sw <= iw + 1e-9 && f.sh <= ih + 1e-9 &&
                     f.sx >= -1e-9 && f.sy >= -1e-9 &&
                     f.sx + f.sw <= iw + 1e-6 && f.sy + f.sh <= ih + 1e-6;
      const smaller = f.sw <= f1.sw + 1e-9 && f.sh <= f1.sh + 1e-9;
      if (!(shape && inside && smaller)) out.cover.push({ iw, ih, cw, ch, z, shape, inside, smaller });
    }
    out.clampHi = M.coverFit(1000, 1000, 500, 500, 0.5, 0.5, 99).zoom;
    out.clampLo = M.coverFit(1000, 1000, 500, 500, 0.5, 0.5, 0.2).zoom;
    out.clampNaN = M.coverFit(1000, 1000, 500, 500, 0.5, 0.5, NaN).zoom;
    /* B3 — a pan moves the source window the other way, clamps at the edge and marks the crop */
    const cell = { x: 0, y: 0, w: 600, h: 900 };
    const ph = () => ({ w: 2000, h: 3000, anchor: { x: 0.5, y: 0.5 }, zoom: 2, manual: false });
    const p1 = ph(); M.panFit(p1, cell, 120, 0);
    const p2 = ph(); M.panFit(p2, cell, -120, 0);
    const p3 = ph(); M.panFit(p3, cell, 999999, 999999);
    const p4 = ph(); p4.zoom = 1; M.panFit(p4, cell, 300, 300);
    out.pan = { right: p1.anchor.x, left: p2.anchor.x, far: p3.anchor, flat: p4.anchor,
                mark: p1.manual === true && p4.manual === true };
    /* B4 — a pinch keeps the point under the fingers */
    const q = ph();
    const before = M.coverFit(q.w, q.h, cell.w, cell.h, q.anchor.x, q.anchor.y, q.zoom);
    const at = { x: 0.3, y: 0.7 };
    const srcBefore = { x: before.sx + at.x * before.sw, y: before.sy + at.y * before.sh };
    M.zoomFit(q, cell, 3.5, at.x, at.y);
    const after = M.coverFit(q.w, q.h, cell.w, cell.h, q.anchor.x, q.anchor.y, q.zoom);
    const srcAfter = { x: after.sx + at.x * after.sw, y: after.sy + at.y * after.sh };
    out.pinch = { dx: Math.abs(srcBefore.x - srcAfter.x), dy: Math.abs(srcBefore.y - srcAfter.y), zoom: q.zoom };
    out.bounds = { zmin: M.ZOOM_MIN, zmax: M.ZOOM_MAX, tmin: M.TEXT_MIN, tmax: M.TEXT_MAX };
    return out;
  });

  report("B1) a call with no zoom is byte-for-byte the answer this function gave before the wave — the whole of the old album still crops exactly as it did",
    m.same.every(Boolean), m.same);

  report("B2) over four hundred random photographs, cells and zooms the source window always keeps the cell's shape, always lies inside the photograph, and is never bigger than the one that covers the cell — there is no zoom that can put paper inside a frame",
    m.cover.length === 0, m.cover.slice(0, 3));

  report("B3) the zoom is clamped at both ends and a number that is not one is read as 1",
    m.clampHi === 6 && m.clampLo === 1 && m.clampNaN === 1 &&
    m.bounds.zmin === 1 && m.bounds.zmax === 6 && m.bounds.tmin === 0.4 && m.bounds.tmax === 3,
    { hi: m.clampHi, lo: m.clampLo, nan: m.clampNaN, bounds: m.bounds });

  report("B4) the picture follows the finger: dragging right takes the crop left and dragging left takes it right, a drag far past the edge stops AT the edge (the source window sits against 0), a photograph with nothing to give at zoom 1 stays in the middle, and every one of them is marked as the student's",
    m.pan.right < 0.5 && m.pan.left > 0.5 && m.pan.far.x === 0 && m.pan.far.y === 0 &&
    m.pan.flat.x === 0.5 && m.pan.mark === true, m.pan);

  report("B5) a pinch keeps the piece of photograph under the two fingers under them — within a pixel of the photograph's own pixels",
    m.pinch.dx < 1 && m.pinch.dy < 1 && Math.abs(m.pinch.zoom - 3.5) < 1e-9, m.pinch);
}

/* ======================= C — the page, driven by real pointer events ======================= */
/* the map from a page pixel to a client pixel, for this canvas at this moment */
const GEOM = `(() => {
  const cv = document.getElementById("albCanvas"), r = cv.getBoundingClientRect();
  const sz = ALBUM.doc().sizeId === "custom" ? null : ALBUM.math.sizeById(ALBUM.doc().sizeId);
  const px = ALBUM.math.pagePx(sz);
  return { rx: r.x, ry: r.y, rw: r.width, cw: cv.width, ch: cv.height, pw: px.w, ph: px.h,
           cells: ALBUM.__cellsForTest(ALBUM.doc().cur),
           safe: ALBUM.math.safeArea(sz) };
})()`;

async function openAlbum(page) {
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html?page=pgAlbum", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => typeof ALBUM !== "undefined" && document.getElementById("albCanvas"), null, { timeout: 15000 });
  await page.evaluate(async () => {
    function mk(w, h, c1, c2) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const x = cv.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      /* THE FIXTURE CARRIES NO NEAR-WHITE. C3 asks whether a corner of the cell is paper, and a
         photograph with white stripes in it cannot answer that question. */
      for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? "#b02a37" : "#101010"; x.fillRect(i * (w / 24), 0, w / 48, h); }
      return cv.toDataURL("image/jpeg", 0.85);
    }
    await ALBUM.accept([mk(1200, 1600, "#cc9944", "#224499"), mk(1600, 1200, "#44aa99", "#992222")], "page");
  });
  await page.waitForTimeout(500);
  /* the guides are a preview overlay of their own; this wave's comparisons are about the marquee */
  await page.evaluate(() => { if (ALBUM.doc().guides) document.getElementById("albGuides").click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("albCanvas").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(250);
}
async function geom(page) { return await page.evaluate(GEOM); }
function toClient(g, px, py) {
  const vs = g.cw / g.pw, k = g.rw / g.cw;
  return [g.rx + px * vs * k, g.ry + py * vs * k];
}
async function dragBy(page, g, fromPx, fromPy, dx, dy) {
  const [x0, y0] = toClient(g, fromPx, fromPy);
  const vs = g.cw / g.pw, k = g.rw / g.cw;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dx * vs * k, y0 + dy * vs * k, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
const photo0 = () => "ALBUM.doc().pages[ALBUM.doc().cur].photos[0]";

async function walk() {
  const browser = await chromium.launch();
  withPremium(browser);
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on("pageerror", e => errs.push(String((e && e.message) || e)));
    await openAlbum(page);
    let g = await geom(page);
    const c0 = g.cells[0];

    /* C1 — a tap selects, and the rail says what it has hold of */
    let [cx, cy] = toClient(g, c0.x + c0.w / 2, c0.y + c0.h / 2);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(250);
    const sel1 = await page.evaluate(() => ALBUM.sel());
    const bar1 = await page.evaluate(() => document.getElementById("albSelBox").textContent);
    report("C1) tapping inside a cell selects that photograph and the rail under the stage names it",
      sel1 && sel1.kind === "photo" && sel1.i === 0 && /1/.test(bar1) && bar1.length > 4, { sel1, bar1: bar1.slice(0, 60) });

    /* C2 — a drag moves the crop, and the drawn pixels move with it */
    const before = await page.evaluate(`(() => { const p = ${photo0()};
      const cv = document.getElementById("albCanvas");
      return { a: JSON.parse(JSON.stringify(p.anchor)), z: p.zoom, m: !!p.manual, ink: cv.toDataURL().length }; })()`);
    await dragBy(page, g, c0.x + c0.w / 2, c0.y + c0.h / 2, 0, -c0.h * 0.18);
    const after = await page.evaluate(`(() => { const p = ${photo0()};
      return { a: JSON.parse(JSON.stringify(p.anchor)), z: p.zoom, m: !!p.manual }; })()`);
    report("C2) dragging inside the cell moves the crop, in the direction the finger went, and marks it as the student's",
      after.a.y > before.a.y && after.m === true && after.z === 1, { before, after });

    /* C3 — the whole cell is still photograph after a big drag */
    await dragBy(page, g, c0.x + c0.w / 2, c0.y + c0.h / 2, 4000, 4000);
    const edge = await page.evaluate(`(() => {
      const p = ${photo0()}, cv = document.getElementById("albCanvas");
      const x = cv.getContext("2d");
      const g = ${GEOM}, c = g.cells[0], vs = g.cw / g.pw;
      const pts = [[0.02,0.02],[0.98,0.02],[0.02,0.98],[0.98,0.98],[0.5,0.5]].map(([fx,fy]) => {
        const d = x.getImageData(Math.round((c.x + c.w*fx)*vs), Math.round((c.y + c.h*fy)*vs), 1, 1).data;
        return [d[0], d[1], d[2]];
      });
      return { anchor: p.anchor, pts: pts };
    })()`);
    const paper = edge.pts.filter(p => p[0] > 235 && p[1] > 235 && p[2] > 235);
    report("C3) a drag far past the edge stops at the edge — the anchor stays inside 0..1 and all four corners of the cell are still photograph, never paper",
      edge.anchor.x >= 0 && edge.anchor.x <= 1 && edge.anchor.y >= 0 && edge.anchor.y <= 1 &&
      paper.length === 0, edge);

    /* C4 — the + button zooms, and a zoomed photograph can be panned sideways where a flat one could not */
    await page.evaluate(() => ALBUM.select("photo", 0));
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[1].click(); });
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[1].click(); });
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[1].click(); });
    await page.waitForTimeout(300);
    const zoomed = await page.evaluate(`${photo0()}.zoom`);
    g = await geom(page);
    const ax0 = await page.evaluate(`${photo0()}.anchor.x`);
    await dragBy(page, g, c0.x + c0.w / 2, c0.y + c0.h / 2, -c0.w * 0.2, 0);
    const ax1 = await page.evaluate(`${photo0()}.anchor.x`);
    report("C4) three presses of + zoom the photograph, and a sideways drag then moves a crop that had nothing to give at all before",
      Math.abs(zoomed - Math.pow(1.15, 3)) < 1e-6 && ax1 > ax0, { zoomed, ax0, ax1 });

    /* C5 — the wheel zooms what is under it */
    const zPre = await page.evaluate(`${photo0()}.zoom`);
    [cx, cy] = toClient(g, c0.x + c0.w / 2, c0.y + c0.h / 2);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(300);
    const zPost = await page.evaluate(`${photo0()}.zoom`);
    report("C5) the wheel over a cell zooms that photograph", zPost > zPre, { zPre, zPost });

    /* C6 — the arrows move it a step at a time, the right way */
    const stepBefore = await page.evaluate(`JSON.parse(JSON.stringify(${photo0()}.anchor))`);
    await page.evaluate(() => { document.getElementById("albSelMove").querySelectorAll("button")[1].click(); });
    await page.waitForTimeout(200);
    const stepAfter = await page.evaluate(`JSON.parse(JSON.stringify(${photo0()}.anchor))`);
    report("C6) the right arrow moves the picture right, which takes the crop left, by one step",
      stepAfter.x < stepBefore.x, { stepBefore, stepAfter });

    /* C7 — put it back */
    await page.evaluate(() => { const b = document.getElementById("albSelOps").querySelectorAll("button"); b[b.length - 1].click(); });
    await page.waitForTimeout(300);
    const back = await page.evaluate(`(() => {
      const p = ${photo0()}, g = ${GEOM}, c = g.cells[0];
      const want = ALBUM.math.anchorFor(p.subject, p.w, p.h, c.w, c.h);
      return { z: p.zoom, m: !!p.manual, a: p.anchor, want: want };
    })()`);
    report("C7) 'put it back' returns the photograph to the anchor the page itself would choose, at zoom 1, and lets the layout choose again",
      back.z === 1 && back.m === false &&
      Math.abs(back.a.x - back.want.x) < 1e-9 && Math.abs(back.a.y - back.want.y) < 1e-9, back);

    /* C8 — a layout change leaves a touched crop alone and re-anchors an untouched one */
    await page.evaluate(() => ALBUM.select("photo", 0));
    g = await geom(page);
    await dragBy(page, g, g.cells[0].x + g.cells[0].w / 2, g.cells[0].y + g.cells[0].h / 2, 0, -g.cells[0].h * 0.2);
    const keep = await page.evaluate(async () => {
      const d = ALBUM.doc(), pg = d.pages[d.cur];
      const mine = JSON.parse(JSON.stringify(pg.photos[0].anchor));
      const theirs = JSON.parse(JSON.stringify(pg.photos[1].anchor));
      /* the student picks a different layout for this page, exactly as the chips do */
      const chips = document.querySelectorAll("#albLayoutCard .chip");
      let clicked = 0;
      for (const c of chips) { if (!/on/.test(c.className)) { c.click(); clicked++; break; } }
      await new Promise(r => setTimeout(r, 400));
      const d2 = ALBUM.doc(), pg2 = d2.pages[d2.cur];
      return { clicked, mine, theirs, mineNow: pg2.photos[0].anchor, theirsNow: pg2.photos[1].anchor,
               manual: !!pg2.photos[0].manual };
    });
    report("C8) changing the layout leaves the crop the student set exactly where they left it, and still re-anchors the photograph nobody touched",
      keep.clicked === 1 && keep.manual === true &&
      Math.abs(keep.mine.x - keep.mineNow.x) < 1e-9 && Math.abs(keep.mine.y - keep.mineNow.y) < 1e-9,
      keep);

    /* C9 — the words: dragged, grown, turned */
    await page.fill("#albText_title", "Mya & Kyaw");
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById("albCanvas").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(250);
    g = await geom(page);
    const t0 = await page.evaluate(() => {
      const d = ALBUM.doc(), pg = d.pages[d.cur];
      const t = pg.texts.find(t => t.role === "title");
      return { x: t.x, y: t.y, size: t.size, rot: t.rot, i: pg.texts.indexOf(t) };
    });
    await dragBy(page, g, g.safe.x + g.safe.w * t0.x, g.safe.y + g.safe.h * t0.y, 0, g.safe.h * 0.25);
    const selT = await page.evaluate(() => ALBUM.sel());
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[1].click(); });
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[3].click(); });
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => {
      const d = ALBUM.doc(), pg = d.pages[d.cur];
      const t = pg.texts.find(t => t.role === "title");
      return { x: t.x, y: t.y, size: t.size, rot: t.rot };
    });
    report("C9) a line is grabbed where it is seen, dragged where it is put, made bigger and turned — all four of the owner's verbs, on the words as well as the photographs",
      selT && selT.kind === "text" && t1.y > t0.y + 0.1 && t1.size > 1 && t1.rot > 0,
      { t0, t1, selT });

    /* C10 — the export carries the crop and never the marquee */
    const ex = await page.evaluate(async () => {
      function draw(idx, scale) {
        const cv = document.createElement("canvas");
        return ALBUM.__drawForTest(cv, idx, { scale: scale }).then(() => cv.toDataURL());
      }
      const d = ALBUM.doc();
      const stage = document.getElementById("albCanvas");
      const scale = stage.width / ALBUM.math.pagePx(ALBUM.math.sizeById(d.sizeId)).w;
      const withSel = stage.toDataURL();
      const exportA = await draw(d.cur, scale);
      ALBUM.select(null);
      await new Promise(r => setTimeout(r, 350));
      const stageClean = document.getElementById("albCanvas").toDataURL();
      const exportB = await draw(d.cur, scale);
      return { sameExport: exportA === exportB, stageDiffers: withSel !== exportA, clean: stageClean === exportB };
    });
    report("C10) the file a student downloads is the page they were looking at, minus the handles: the export is identical with a selection on screen and without one, and it differs from the stage exactly while the marquee is up",
      ex.sameExport === true && ex.stageDiffers === true && ex.clean === true, ex);

    /* C11 — a save and a reload remember all four numbers */
    await page.evaluate(() => ALBUM.select("photo", 0));
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById("albSelOps").querySelectorAll("button")[1].click(); });
    await page.waitForTimeout(250);
    const round = await page.evaluate(async () => {
      const d = JSON.parse(JSON.stringify(ALBUM.doc()));
      ALBUM.setDoc(d);
      await new Promise(r => setTimeout(r, 400));
      const e = ALBUM.doc(), pg = e.pages[e.cur];
      const t = pg.texts.find(t => t.role === "title");
      return { zoom: pg.photos[0].zoom, manual: !!pg.photos[0].manual, anchor: pg.photos[0].anchor,
               size: t.size, rot: t.rot, x: t.x, y: t.y };
    });
    report("C11) an album read back from its own record keeps the zoom, the crop, the mark, the size and the rotation",
      round.zoom > 1 && round.manual === true && round.size > 1 && round.rot > 0 &&
      round.anchor.x >= 0 && round.anchor.x <= 1, round);

    /* C12 — turning the page drops the selection */
    const turn = await page.evaluate(async () => {
      ALBUM.select("photo", 0);
      document.getElementById("albPageAdd").click();
      await new Promise(r => setTimeout(r, 400));
      return { cur: ALBUM.doc().cur, sel: ALBUM.sel(), bar: document.getElementById("albSelBox").textContent.length };
    });
    report("C12) turning to another page drops the selection, so the arrows can never move a photograph on a page nobody is looking at",
      turn.cur === 1 && turn.sel === null && turn.bar > 0, turn);

    /* C13 — the same drag on a phone */
    const phone = await browser.newPage({ viewport: { width: 430, height: 900 } });
    phone.on("pageerror", e => errs.push("phone: " + String((e && e.message) || e)));
    await openAlbum(phone);
    const pg2 = await geom(phone);
    const pc = pg2.cells[0];
    const pBefore = await phone.evaluate(`JSON.parse(JSON.stringify(${photo0()}.anchor))`);
    await dragBy(phone, pg2, pc.x + pc.w / 2, pc.y + pc.h / 2, 0, -pc.h * 0.2);
    const pAfter = await phone.evaluate(`(() => { const p = ${photo0()}; return { a: p.anchor, m: !!p.manual }; })()`);
    report("C13) the same drag works on a 430-pixel phone, where the canvas is laid out at a fraction of its own width — the mapping divides both the canvas scale and the CSS scale out",
      pAfter.a.y > pBefore.y || pAfter.m === true, { pBefore, pAfter });

    report("C14) neither page raised an error while any of this happened", errs.length === 0, errs.slice(0, 4));
    await maths(page);
    await faults(page);
  } finally {
    await browser.close();
  }
}

/* ======================= D — fault injection ======================= */
async function faults(page) {
  const f = await page.evaluate(async () => {
    /* the same layout change as C8, on a photograph whose manual mark has been cleared: the
       crop the student set is overwritten. That is the defect this wave's one-line guard
       prevents, reproduced through the shipped code rather than asserted. */
    const d = ALBUM.doc(), pg = d.pages[0];
    d.cur = 0;
    pg.photos[0].manual = true;
    pg.photos[0].anchor = { x: 0.11, y: 0.11 };
    ALBUM.setDoc(d);
    await new Promise(r => setTimeout(r, 350));
    const kept = JSON.parse(JSON.stringify(ALBUM.doc().pages[0].photos[0].anchor));
    const e = ALBUM.doc();
    e.pages[0].photos[0].manual = false;
    e.pages[0].photos[0].anchor = { x: 0.11, y: 0.11 };
    ALBUM.setDoc(e);
    await new Promise(r => setTimeout(r, 350));
    const lost = JSON.parse(JSON.stringify(ALBUM.doc().pages[0].photos[0].anchor));
    return { kept, lost };
  });
  report("D1) fault injection — with the manual mark cleared, the very same rebuild overwrites the crop (0.11 is gone), and with it set the crop survives. The guard is load-bearing, and this test would notice if it were deleted",
    Math.abs(f.kept.x - 0.11) < 1e-9 && Math.abs(f.kept.y - 0.11) < 1e-9 &&
    !(Math.abs(f.lost.x - 0.11) < 1e-9 && Math.abs(f.lost.y - 0.11) < 1e-9), f);
}

/* ======================= E — the release ======================= */
function release() {
  const web = (APP.match(/var APP_VER\s*=\s*"([\d.]+)"/) || [])[1];
  const ver = JSON.parse(read("docs/app/version.json")).v;
  const sw = (read("docs/app/sw.js").match(/hnk-web-studio-v([\d-]+)/) || [])[1];
  report("E1) the wave is in lockstep: web app, version.json, the service worker's cache name and the panel manifest",
    web === WEB && ver === WEB && sw === WEB.replace(/\./g, "-") && MANIFEST.version === PANEL,
    { web, ver, sw, panel: MANIFEST.version, want: WEB + " / " + PANEL });

  report("E2) this test runs in CI, after the album tests it builds on",
    /node test\/verify_album_touch\.js/.test(CI) &&
    CI.indexOf("verify_album_layout.js") < CI.indexOf("verify_album_touch.js"), null);

  const n = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []).size;
  const badge = Number((LANDING.match(/"badge\.tests":\s*\{"my":\s*"(\d+) tests green/) || [])[1] || 0);
  report("E3) the landing site's count is the number of tests CI actually runs",
    n === badge && n >= 253, { ciTests: n, badge });

  const row = WN.appRow(ALBUM_WAVE, "pgAlbum");
  const missing = LANGS.filter(L => !new RegExp("[,{]" + L + ':"').test(row.split("s:{")[0]) ||
                                    !new RegExp("[,{]" + L + ':"').test("s:{" + (row.split("s:{")[1] || "")));
  report("E4) the album wave's What's New row (" + ALBUM_WAVE + ") is written in all nine base languages, title and body, and points at the Album page",
    row.length > 1200 && missing.length === 0, { bytes: row.length, missing });
}

(async () => {
  source();
  await walk();
  release();
  console.log(failures === 0
    ? "\nALL PASS — the album stage is the student's to touch: the crop, the size and the turn of every photograph and every line, by finger, by mouse and by button"
    : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("FAIL — harness :: " + (e && e.stack || e)); process.exit(1); });
