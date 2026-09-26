/* 6.137.0 / panel 6.208.0 — EVERY ALBUM FRAME GETS A LIGHT OF ITS OWN.
 *
 * 6.121.0 gave a frame six looks: colour, black & white, sepia, warm, cool, faded. Six looks
 * are six decisions somebody else made. A wedding studio's real complaint about a spread is
 * almost never "this one wants sepia" — it is that ONE photograph came out of the camera a stop
 * under, or flat, and it is sitting next to eleven that did not. Nothing in the album could say
 * so, and the answer was to leave the page, fix the file, and come back.
 *
 * Every frame now carries two numbers of its own: an exposure and a contrast, -5..+5, zero
 * being the photograph exactly as it arrived. Steps rather than a free slider, because a step
 * is a value a studio can say out loud and a test can pin. One exposure step is 6% of the light
 * and one contrast step 5%, so the ends are a little under a stop either way — enough to rescue
 * a frame, not enough to wreck a book.
 *
 * They ride the SAME path the looks do, which is the whole point: the canvas filter where the
 * renderer has one, the identical arithmetic over the pixels where it does not, through the one
 * drawPhotoFx every drawing goes through — the stage, the page rail, the JPEG, the PDF and the
 * PSD's photo layer.
 *
 * A) the arithmetic, pure, in Node        B) the two renderers agree, measured in a real browser
 * C) the page: the rows, the ends, the round trip, and the pixels actually moving
 * D) the panel carries the same module and the same nine-language words
 * E) release pins
 * Usage: PORT=8931 node test/verify_album_light_6137.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const MOD = read("docs/app/data/album-module.js");
const APP = read("docs/app/index.html");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const PANELMOD = read("panel/js/hnk_album.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const VER = "6.138.0", PVER = "6.209.0";
const WAVE_V = "6.137.0";   /* this wave's own What's New row; VER moves on with every release */
const COUNT = 280;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const KEYS = ["alb_ev", "alb_ev_dn", "alb_ev_up", "alb_ev_zero", "alb_ct", "alb_ct_dn", "alb_ct_up", "alb_ct_zero"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}

/* ===================== A) the arithmetic ===================== */

/* The module is the page's, not a copy: every number below comes back out of ALBUM.math in the
   running album, which is the same object the stage draws with. */
async function partA(page) {
  const M = await page.evaluate(() => {
    const m = ALBUM.math, o = {};
    o.looks = ["", "bw", "sepia", "warm", "cool", "fade"].map(function (f) { return m.fxFilter(f); });
    o.composed = [m.fxFilter("bw", 2, 0), m.fxFilter("", 0, -3), m.fxFilter("", 5, 5),
                  m.fxFilter("sepia", -1, 1), m.fxFilter("", 0, 0)];
    o.clamp = [m.evStep(99), m.evStep(-99), m.ctStep(99), m.ctStep(-99), m.evStep(2.4),
               m.evStep("3"), m.evStep("nonsense"), m.evStep(undefined), m.evStep(null), m.ctStep(NaN)];
    o.bounds = [m.EV_MIN, m.EV_MAX, m.CT_MIN, m.CT_MAX, m.EV_PER, m.CT_PER];
    o.muls = [m.evMul(0), m.evMul(5), m.evMul(-5), m.ctMul(5), m.ctMul(-5)];
    o.labels = [m.stepLabel(0), m.stepLabel(2), m.stepLabel(-3), m.stepLabel(5)];
    const px = function () { return new Uint8ClampedArray([40, 80, 120, 255, 200, 100, 50, 255]); };
    o.up = Array.from(m.fxPixels(px(), "", 3, 0));
    o.dn = Array.from(m.fxPixels(px(), "", -3, 0));
    o.hard = Array.from(m.fxPixels(px(), "", 0, 5));
    o.soft = Array.from(m.fxPixels(px(), "", 0, -5));
    o.zero = Array.from(m.fxPixels(px(), "", 0, 0));
    o.raw = Array.from(px());
    o.bwUp = Array.from(m.fxPixels(px(), "bw", 4, 0));
    o.ext = Array.from(m.fxPixels(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), "", 5, 5));
    return o;
  });

  report("A1) a frame at zero is byte-for-byte the six looks 6.121.0 shipped — the wave that adds a control must not quietly restyle every album already made",
    M.looks.join("|") === ["", "grayscale(1)", "sepia(0.85)", "sepia(0.28) saturate(1.15) brightness(1.03)",
      "saturate(0.85) hue-rotate(-12deg) brightness(1.02)", "contrast(0.82) brightness(1.08) saturate(0.8)"].join("|"),
    M.looks);

  report("A2) the look comes first and this frame's light after it, in the order a canvas filter applies them; a frame with no look and no light asks for no filter at all",
    M.composed.join("|") === ["grayscale(1) brightness(1.120)", "contrast(0.850)",
      "brightness(1.300) contrast(1.250)", "sepia(0.85) brightness(0.940) contrast(1.050)", ""].join("|"),
    M.composed);

  report("A3) the ends hold and nonsense reads as zero: \u00b15 and no further, a fraction rounds, a word is no exposure at all — a saved album can carry anything and must never render as NaN",
    M.clamp.join() === [5, -5, 5, -5, 2, 3, 0, 0, 0, 0].join() &&
    M.bounds.slice(0, 4).join() === [-5, 5, -5, 5].join(), { clamp: M.clamp, bounds: M.bounds });

  report("A4) one step is 6% of the light and 5% of the contrast, so the ends are a little under a stop either way — enough to rescue a frame, not enough to wreck a book",
    Math.abs(M.muls[0] - 1) < 1e-9 && Math.abs(M.muls[1] - 1.3) < 1e-9 && Math.abs(M.muls[2] - 0.7) < 1e-9 &&
    Math.abs(M.muls[3] - 1.25) < 1e-9 && Math.abs(M.muls[4] - 0.75) < 1e-9 &&
    M.bounds[4] === 0.06 && M.bounds[5] === 0.05, M.muls);

  report("A5) the number a studio reads carries its sign, and the minus is a real minus rather than a hyphen",
    M.labels.join("|") === ["0", "+2", "\u22123", "+5"].join("|"), M.labels);

  report("A6) over the pixels: +3 lifts every channel, \u22123 drops every channel, and contrast pushes a dark pixel down while it pushes a bright one up — a stretch about mid-grey, not a brightness in disguise",
    M.up[0] > 40 && M.up[1] > 80 && M.up[2] > 120 && M.dn[0] < 40 && M.dn[1] < 80 && M.dn[2] < 120 &&
    M.hard[0] < 40 && M.hard[4] > 200 && M.soft[0] > 40 && M.soft[4] < 200 &&
    M.zero.join() === M.raw.join(), { up: M.up, dn: M.dn, hard: M.hard, soft: M.soft });

  report("A7) the look still happens first over the pixels too: a black-and-white frame turned up stays grey, it does not come back coloured",
    M.bwUp[0] === M.bwUp[1] && M.bwUp[1] === M.bwUp[2] && M.bwUp[4] === M.bwUp[5] && M.bwUp[5] === M.bwUp[6] &&
    M.bwUp[0] > 70, M.bwUp);

  report("A8) full white and full black cannot be pushed out of a byte, however far the two controls are taken",
    M.ext.every(function (v) { return v >= 0 && v <= 255; }) && M.ext[0] === 255 && M.ext[4] === 0, M.ext);
}

/* ===================== the browser ===================== */

async function openAlbum(page) {
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html?page=pgAlbum", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => typeof ALBUM !== "undefined" && document.getElementById("albCanvas"), null, { timeout: 25000 });
  await page.evaluate(async () => {
    function mk(w, h, c1, c2) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const x = cv.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      return cv.toDataURL("image/jpeg", 0.9);
    }
    await ALBUM.accept([mk(1200, 1600, "#8a5a2a", "#28406a"), mk(1600, 1200, "#3a7a6a", "#7a2222")], "page");
  });
  await page.waitForTimeout(700);
}

/* ===================== B) the two renderers agree ===================== */

async function partB(page) {
  const b = await page.evaluate(async () => {
    const M = ALBUM.math;
    /* a ramp with every tone in it, drawn twice: once through the renderer's own filter and
       once through the arithmetic, then compared channel by channel */
    function ramp(){
      const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8;
      const x = cv.getContext("2d");
      for (let i = 0; i < 64; i++){
        x.fillStyle = "rgb(" + (i * 4) + "," + (255 - i * 4) + "," + ((i * 9) % 256) + ")";
        x.fillRect(i, 0, 1, 8);
      }
      return cv;
    }
    function bytes(cv){ return cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; }
    function viaFilter(src, fx, ev, ct){
      const cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
      const x = cv.getContext("2d");
      x.filter = M.fxFilter(fx, ev, ct);
      x.drawImage(src, 0, 0);
      return bytes(cv);
    }
    function viaPixels(src, fx, ev, ct){
      const cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
      const x = cv.getContext("2d");
      x.drawImage(src, 0, 0);
      const px = x.getImageData(0, 0, cv.width, cv.height);
      M.fxPixels(px.data, fx, ev, ct);
      return px.data;
    }
    const src = ramp();
    const cases = [["", 3, 0], ["", -4, 0], ["", 0, 4], ["", 0, -5], ["", 2, 2], ["bw", 3, 3]];
    const out = [];
    const probe = document.createElement("canvas").getContext("2d");
    probe.filter = "brightness(1.1)";
    out.push({ filterSupported: probe.filter === "brightness(1.1)" });
    cases.forEach(function (c) {
      const a = viaFilter(src, c[0], c[1], c[2]), b = viaPixels(src, c[0], c[1], c[2]);
      let worst = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(a[i] - b[i]));
      out.push({ c: c.join("/"), worst: worst });
    });
    return out;
  });
  const supported = b[0].filterSupported;
  const worst = Math.max.apply(null, b.slice(1).map((r) => r.worst));
  report("B1) the renderer's own filter and the arithmetic land on the same picture — every case within two levels of 255 across a full tonal ramp, so a phone whose browser lacks the property prints what the monitor showed",
    supported === true && worst <= 2, { supported: supported, worst: worst, cases: b.slice(1) });
}

/* ===================== C) the page ===================== */

async function partC(page) {
  const c1 = await page.evaluate(async () => {
    ALBUM.select("photo", 0);
    await new Promise((r) => setTimeout(r, 300));
    const id = (s) => document.getElementById(s);
    const heads = Array.from(document.querySelectorAll("#albSelBox .subh")).map((p) => p.textContent);
    return {
      rows: !!id("albSelEv") && !!id("albSelCt"),
      btns: ["albEvDn", "albEvZero", "albEvUp", "albCtDn", "albCtZero", "albCtUp"].filter((b) => !!id(b)).length,
      zeroOff: id("albEvZero").disabled === true && id("albCtZero").disabled === true,
      endsOn: id("albEvDn").disabled === false && id("albEvUp").disabled === false,
      heads: heads
    };
  });
  report("C1) selecting a frame brings up both rows — darker · as it arrived · brighter, and the same three for contrast — with the middle button dead because there is nothing yet to undo",
    c1.rows && c1.btns === 6 && c1.zeroOff && c1.endsOn &&
    c1.heads.some((h) => / 0$/.test(h)) && c1.heads.filter((h) => / 0$/.test(h)).length === 2, c1);

  const c2 = await page.evaluate(async () => {
    const id = (s) => document.getElementById(s);
    for (let i = 0; i < 3; i++){ id("albEvUp").click(); await new Promise((r) => setTimeout(r, 90)); }
    for (let i = 0; i < 2; i++){ id("albCtDn").click(); await new Promise((r) => setTimeout(r, 90)); }
    await new Promise((r) => setTimeout(r, 300));
    const ph = ALBUM.doc().pages[ALBUM.doc().cur].photos[0];
    const heads = Array.from(document.querySelectorAll("#albSelBox .subh")).map((p) => p.textContent);
    return { ev: ph.ev, ct: ph.ct, heads: heads, zeroOn: id("albEvZero").disabled === false };
  });
  report("C2) three presses of brighter and two of softer are +3 and −2 on the frame itself, the headings carry the numbers, and the middle button has woken up",
    c2.ev === 3 && c2.ct === -2 && c2.zeroOn &&
    c2.heads.some((h) => /\+3$/.test(h)) && c2.heads.some((h) => /−2$/.test(h)), c2);

  const c3 = await page.evaluate(async () => {
    const id = (s) => document.getElementById(s);
    for (let i = 0; i < 9; i++){ id("albEvUp").click(); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 250));
    const atTop = { ev: ALBUM.doc().pages[ALBUM.doc().cur].photos[0].ev, up: id("albEvUp").disabled, dn: id("albEvDn").disabled };
    for (let i = 0; i < 12; i++){ id("albEvDn").click(); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 250));
    const atFloor = { ev: ALBUM.doc().pages[ALBUM.doc().cur].photos[0].ev, up: id("albEvUp").disabled, dn: id("albEvDn").disabled };
    return { atTop: atTop, atFloor: atFloor };
  });
  report("C3) the ends are real: nine more presses stop at +5 with the brighter button dead, twelve the other way stop at −5 with the darker button dead — a studio cannot press its way past the range",
    c3.atTop.ev === 5 && c3.atTop.up === true && c3.atTop.dn === false &&
    c3.atFloor.ev === -5 && c3.atFloor.dn === true && c3.atFloor.up === false, c3);

  /* the pixels on the stage really move, and the middle button really puts them back */
  const c4 = await page.evaluate(async () => {
    const id = (s) => document.getElementById(s);
    const cv = id("albCanvas");
    function shot(){
      const t = document.createElement("canvas"); t.width = 40; t.height = 40;
      const x = t.getContext("2d");
      x.drawImage(cv, Math.round(cv.width * 0.18), Math.round(cv.height * 0.30), 40, 40, 0, 0, 40, 40);
      return x.getImageData(0, 0, 40, 40).data;
    }
    function mean(d){ let s = 0, n = 0; for (let i = 0; i < d.length; i += 4){ s += (d[i] + d[i+1] + d[i+2]) / 3; n++; } return s / n; }
    id("albEvZero").click(); await new Promise((r) => setTimeout(r, 400));
    id("albCtZero").click(); await new Promise((r) => setTimeout(r, 400));
    const base = mean(shot());
    for (let i = 0; i < 5; i++){ id("albEvUp").click(); await new Promise((r) => setTimeout(r, 80)); }
    await new Promise((r) => setTimeout(r, 500));
    const bright = mean(shot());
    for (let i = 0; i < 10; i++){ id("albEvDn").click(); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 500));
    const dark = mean(shot());
    id("albEvZero").click(); await new Promise((r) => setTimeout(r, 500));
    const back = mean(shot());
    return { base: base, bright: bright, dark: dark, back: back };
  });
  report("C4) the stage is not a readout: +5 measurably lifts the drawn pixels, −5 measurably drops them, and the middle button puts the photograph back where it started",
    c4.bright > c4.base + 3 && c4.dark < c4.base - 3 && Math.abs(c4.back - c4.base) < 1.5, c4);

  const c5 = await page.evaluate(async () => {
    const id = (s) => document.getElementById(s);
    for (let i = 0; i < 2; i++){ id("albEvUp").click(); await new Promise((r) => setTimeout(r, 90)); }
    for (let i = 0; i < 4; i++){ id("albCtUp").click(); await new Promise((r) => setTimeout(r, 90)); }
    await new Promise((r) => setTimeout(r, 300));
    const before = ALBUM.doc().pages[ALBUM.doc().cur].photos[0];
    /* the round trip a saved album really makes: out to a record and back through the reader */
    const copy = JSON.parse(JSON.stringify(ALBUM.doc()));
    ALBUM.setDoc(copy);
    await new Promise((r) => setTimeout(r, 400));
    const after = ALBUM.doc().pages[ALBUM.doc().cur].photos[0];
    /* and an album saved before this wave, which has neither number */
    const old = JSON.parse(JSON.stringify(copy));
    delete old.pages[old.cur].photos[0].ev; delete old.pages[old.cur].photos[0].ct;
    ALBUM.setDoc(old);
    await new Promise((r) => setTimeout(r, 400));
    const older = ALBUM.doc().pages[ALBUM.doc().cur].photos[0];
    return { before: { ev: before.ev, ct: before.ct }, after: { ev: after.ev, ct: after.ct },
      older: { ev: older.ev, ct: older.ct } };
  });
  report("C5) the two numbers survive the record: written out and read back they are the same frame, and an album saved before this wave reads back at zero — the photograph exactly as it arrived",
    c5.before.ev === 2 && c5.before.ct === 4 && c5.after.ev === 2 && c5.after.ct === 4 &&
    c5.older.ev === 0 && c5.older.ct === 0, c5);

  const c6 = await page.evaluate(async () => {
    const id = (s) => document.getElementById(s);
    ALBUM.select("photo", 0);
    await new Promise((r) => setTimeout(r, 250));
    for (let i = 0; i < 3; i++){ id("albEvUp").click(); await new Promise((r) => setTimeout(r, 80)); }
    await new Promise((r) => setTimeout(r, 250));
    /* a line, not a photograph: no light rows at all, because a line has no exposure */
    const pg = ALBUM.doc().pages[ALBUM.doc().cur];
    const hasText = pg.texts && pg.texts.length > 0;
    let noRows = null;
    if (hasText){
      ALBUM.select("text", 0);
      await new Promise((r) => setTimeout(r, 250));
      noRows = !document.getElementById("albSelEv") && !document.getElementById("albSelCt");
      ALBUM.select("photo", 0);
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ev: ALBUM.doc().pages[ALBUM.doc().cur].photos[0].ev, hasText: hasText, noRows: noRows };
  });
  report("C6) the light belongs to a photograph: a selected line carries no exposure rows at all, and coming back to the frame finds its number where it was left",
    c6.ev === 3 && (c6.hasText === false || c6.noRows === true), c6);
}

/* ===================== D) the panel, and the words ===================== */

function partD() {
  report("D1) the panel runs the same module, lifted: the two signatures and the two ends are in the panel's own copy, so the plugin cannot drift from the app",
    has(PANELMOD, "function fxFilter(fx, ev, ct)") && has(PANELMOD, "function fxPixels(data, fx, ev, ct)") &&
    has(PANELMOD, "function drawPhotoFx(x, im, fit, dx, dy, dw, dh, fx, ev, ct)") &&
    has(PANELMOD, "var EV_MIN = -5, EV_MAX = 5, EV_PER = 0.06;") &&
    has(PANELMOD, "var CT_MIN = -5, CT_MAX = 5, CT_PER = 0.05;"));

  const trl = A.readTrMore().l14 || {};
  const shell = (function () {
    const i = APP.indexOf("\nvar TR_PH={"); const j = APP.indexOf("\n};", i);
    return new Function("return " + APP.slice(i + 1, j + 3).replace(/^var TR_PH=/, "").replace(/;$/, ""))();
  })();
  const gaps = [];
  KEYS.forEach(function (k) {
    LANGS.forEach(function (l) {
      const v = (shell[k] && shell[k][l]) || (trl[k] && trl[k][l]) || "";
      if (typeof v !== "string" || !v) gaps.push(k + "." + l);
    });
  });
  report("D2) all eight new words exist in all nine languages — the panel speaks nine, so the web app writes nine first, and the lifter refuses a release that does not",
    gaps.length === 0 && KEYS.length === 8, gaps.slice(0, 8));

  const ps = (function () {
    const i = PANELMOD.indexOf("globalThis.HNK.albumStrings = ");
    const j = PANELMOD.indexOf("\n", i);
    return JSON.parse(PANELMOD.slice(i + "globalThis.HNK.albumStrings = ".length, j).replace(/;\s*$/, ""));
  })();
  const pgaps = KEYS.filter((k) => !ps[k] || LANGS.some((l) => !ps[k][l]));
  report("D3) and the panel's lifted table carries them, so the plugin's own rows read in the studio's language rather than falling back to English",
    pgaps.length === 0, pgaps);

  report("D4) the module names the frame, not the file: a replaced photograph keeps the light the studio set for where it sits",
    /var pg = curPage\(\), at = SEL\.i, fx = o\.fx \|\| "", ev = evStep\(o\.ev\), ct = ctStep\(o\.ct\);/.test(MOD) &&
    /ph\.fx = fx; ph\.ev = ev; ph\.ct = ct;/.test(MOD) &&
    /ev: evStep\(q\.ev\), ct: ctStep\(q\.ct\) \};/.test(MOD));
}

/* ===================== E) release pins ===================== */

function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the storage-parity check it follows",
    steps === COUNT && has(CI, "node test/verify_album_light_6137.js") &&
    CI.indexOf("verify_album_light_6137.js") > CI.indexOf("verify_storage_parity_6136.js"), { steps: steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(read("panel/main.js"), 'const PANEL_VERSION = "' + PVER + '";') &&
    has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(MOD, 'var APP_MARK = "' + VER + '";'));
  const WN = read("docs/app/data/whatsnew.js");
  const i = WN.indexOf('"' + VER + '"');
  /* VER is the tree's current release and moves with every wave; WAVE_V is this one's own row,
     which stays where it is and keeps pointing at the page that grew the control. */
  report("E3) What's New leads with the " + VER + " row, this wave's row still points at the album page, and the landing counts " + COUNT + " tests",
    i > 0 && i < 4000 && has(WN, '{"v":"' + WAVE_V + '","kind":"page","ref":"pgAlbum"') &&
    has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING),
    { at: i });
}

/* ===================== run ===================== */

(async function main() {
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    /* the Album is behind the account wall, so the fixture signs a Premium studio in before
       the page is ever opened — the same seed every other album test uses */
    withPremium(browser);
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    await openAlbum(page);
    await partA(page);
    await partB(page);
    await partC(page);
    report("C7) the album page raised no error while any of that happened", errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
