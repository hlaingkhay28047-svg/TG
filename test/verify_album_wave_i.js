/* verify_album_wave_i.js — 6.125.0 / panel 6.196.0
   SMART ALBUM, WAVE I: THE TEMPLATE LIBRARY, THE ONE-DIALOG BUILD, THE STANDEES, THE MOCKUP,
   THE SHEET BACKGROUND, THE MARKS AND THE LOGO.

   The owner's two SS Album recordings and a screenshot of its library asked for three things:
   load a folder of ready-made PSD templates ONCE, make standees and mockups in a few clicks,
   and file everything in a library that filters, searches and remembers. This wave answers all
   three and goes past them:

   - THE LIBRARY: one .psd, a whole folder, or a library JSON. Every file is read in the browser
     (no server, no upload): its frames, its text slots, its background and foreground pictures and
     a thumbnail. Each record is filed under a group guessed from the file's own name, and the
     shelf filters by group, orientation, photo count and star, searches by name, holds a trash
     that restores, and exports itself to one file that another computer can read back.
   - THE BUILD: the couple, the date and the venue typed once; a group; how many sheets and how
     many photos a sheet — and the whole album is laid from the studio's own templates, seven
     honest steps printed as it goes (gather · faces · order · plan · pick · lay · check).
   - STANDEES: four upright print sizes in centimetres at 150 dpi and twelve designs that ship
     before a single PSD is imported.
   - THE MOCKUP: a third stage view — the open spread as a book on a table, or the standee upright
     on its base.
   - THE SHEET: a background photograph behind the frames (blur · brightness · colour · zoom · tint),
     eight date blocks, eight monograms, the studio's own logo, twelve text styles, and an export
     that saves every sheet into a folder or one ZIP.

   A) the tables and the source   B) the app walk on a 390px phone, over REAL .psd files built here
   C) the panel's lifted copy   D) the 146 lines in nine languages + the fifteen packs + the Tai
   registration   E) release pins */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const agPsd = require("ag-psd");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const SWEEP = read("test/sweep_v477_upgrades.js");
const PALB = read("panel/js/hnk_album.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALB = A.readAlbum();
const TRM = A.readTrMore();
const L14 = TRM.l14 || {};
const WI = require(path.join(ROOT, "tools", "lib", "album_wave_i.js"));
const GEN = require(path.join(ROOT, "tools", "build_album_data.js"));
/* 6.125.0 — the ALBUM module left the shell for docs/app/data/album-module.js (the A4 ceiling) */
const MOD = read("docs/app/data/album-module.js");
const VER = "6.127.0", PVER = "6.198.0";
const L7 = ["shn", "kac", "th", "zh", "vi", "id", "ms"];
const PACKS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
/* every line this wave added, as the module asks for it */
const KEYS = require(path.join(ROOT, "test", "lib", "album_wave_i_keys.js"));

let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name); }
  else { fail++; console.log("FAIL — " + name + (detail === undefined ? "" : "  :: " + JSON.stringify(detail).slice(0, 700))); }
}

/* ===================== the fixtures: real .psd files, written here ===================== */
function fill(w, h, rgb) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { d[i*4] = rgb[0]; d[i*4+1] = rgb[1]; d[i*4+2] = rgb[2]; d[i*4+3] = 255; } return { width: w, height: h, data: d }; }
function textLayer(name, txt, x, y, size, font) {
  return { name, top: y, left: x, bottom: y + Math.round(size * 1.3), right: x + Math.round(txt.length * size * 0.55),
    text: { text: txt, style: { font: { name: font }, fontSize: size, fillColor: { r: 27, g: 27, b: 31 } }, paragraphStyle: { justification: "center" } } };
}
function rect(name, x, y, w, h, rgb) { return { name, top: y, left: x, bottom: y + h, right: x + w, imageData: fill(w, h, rgb) }; }
function res(dpi) { return { resolutionInfo: { horizontalResolution: dpi, horizontalResolutionUnit: "PPI", widthUnit: "Inches", verticalResolution: dpi, verticalResolutionUnit: "PPI", heightUnit: "Inches" } }; }
function b64(psd) { return Buffer.from(agPsd.writePsd(psd, { generateThumbnail: false })).toString("base64"); }
function fixtures() {
  /* 1) a wedding sheet the recordings' studio would ship: three named frames, four lines, 300 dpi */
  const W = 2000, H = 3000;
  const wedding = { width: W, height: H, imageResources: res(300), children: [
    { name: "Background", top: 0, left: 0, bottom: H, right: W, imageData: fill(W, H, [246, 241, 231]) },
    { name: "Photos", children: [rect("Photo 1", 200, 300, 1600, 1200, [120, 130, 140]), rect("ảnh 2", 200, 1600, 760, 700, [110, 120, 130]), rect("khung 3", 1040, 1600, 760, 700, [100, 110, 120])] },
    rect("Gold frame", 160, 260, 1680, 40, [201, 162, 39]),
    textLayer("Title", "SAVE THE DATE", 700, 100, 80, "Montserrat"),
    textLayer("Tên cô dâu chú rể", "Tên cô dâu & Tên chú rể", 400, 2420, 110, "Great Vibes"),
    textLayer("Ngày", "20.10.2026", 800, 2640, 60, "Lato"),
    textLayer("Venue", "SS STUDIO · PHOTO · DESIGN · PRINT", 500, 2800, 36, "Montserrat")] };
  /* 2) a standee: upright, 150 dpi, one frame, the welcome line, the names and the date */
  const standee = { width: 600, height: 2000, imageResources: res(150), children: [
    { name: "nền", top: 0, left: 0, bottom: 2000, right: 600, imageData: fill(600, 2000, [255, 255, 255]) },
    rect("Photo", 40, 200, 520, 900, [120, 130, 140]),
    textLayer("Welcome", "WELCOME TO THE WEDDING OF", 60, 60, 26, "Montserrat"),
    textLayer("Names", "TEN CO DAU & TEN CHU RE", 60, 1200, 44, "Playfair Display"),
    textLayer("Date", "20.10.2026", 200, 1320, 30, "Lato")] };
  /* 3) a flat landscape spread — no named frames at all, one line of type */
  const W3 = 3000, H3 = 1500, flat = fill(W3, H3, [255, 255, 255]);
  [[100, 100, 1300, 1300], [1500, 100, 1400, 600], [1500, 800, 1400, 600]].forEach(function (b) {
    for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) { const i = (y * W3 + x) * 4; flat.data[i] = 200; flat.data[i+1] = 200; flat.data[i+2] = 205; }
  });
  const spread = { width: W3, height: H3, imageResources: res(300), children: [
    { name: "Layer 1", top: 0, left: 0, bottom: H3, right: W3, imageData: flat },
    textLayer("caption", "our wedding day", 1200, 1400, 40, "Cormorant")] };
  return { "wedding_two.psd": b64(wedding), "standee_welcome.psd": b64(standee), "spread_flat.psd": b64(spread),
           "not_a_psd.psd": Buffer.from("hello, this is not a photoshop file").toString("base64") };
}

/* ===================== A) the tables and the source ===================== */
function tables() {
  report("A1) the album data file is v5 and carries the wave I tables — four standee sizes in cm at 150 dpi, their group, twelve designs, the words they set, two mark families of eight, twelve text styles, the library's groups and limits",
    ALB.v === 5 && ALB.sizes.filter((s) => s.group === "standee").length === 4 &&
    ALB.sizes.filter((s) => s.group === "standee").every((s) => s.unit === "cm" && s.dpi === 150 && s.h > s.w) &&
    ALB.sizeGroups.some((g) => g.id === "standee") && ALB.standees.length === 12 &&
    Object.keys(ALB.standeeWords).length >= 5 && ALB.marks.date.length === 8 && ALB.marks.mono.length === 8 &&
    ALB.textStyles.length === 12 && ALB.libGroups.length >= 7 && ALB.lib && ALB.lib.max >= 100 && ALB.lib.maxPhotos >= 6,
    { v: ALB.v, standees: ALB.standees.length, sizes: ALB.sizes.filter((s) => s.group === "standee").map((s) => s.id), marks: [ALB.marks.date.length, ALB.marks.mono.length], styles: ALB.textStyles.length, groups: ALB.libGroups.length });

  let cells = 0, texts = 0, outside = 0, overlap = 0;
  ALB.standees.forEach((d) => {
    cells += d.cells.length; texts += d.texts.length;
    d.cells.concat(d.texts).forEach((b) => { if (b.x < -1e-9 || b.y < -1e-9 || b.x + b.w > 1 + 1e-9 || b.y + b.h > 1 + 1e-9) outside++; });
    d.cells.forEach((a, i) => d.cells.forEach((b, j) => { if (i < j && a.x < b.x + b.w - 1e-9 && a.x + a.w > b.x + 1e-9 && a.y < b.y + b.h - 1e-9 && a.y + a.h > b.y + 1e-9) overlap++; }));
  });
  report("A2) every standee design is a fraction of the safe area: no box outside it, no two frames overlapping, every design carries the couple's names",
    outside === 0 && overlap === 0 && cells >= 12 && texts >= 36 && ALB.standees.every((d) => d.texts.some((t) => t.role === "names")),
    { outside, overlap, cells, texts });

  let threw = null;
  try { GEN.build({ dry: true }); } catch (e) { threw = String(e && e.message || e); }
  report("A3) the generator's own checks run over the wave I tables and pass (ids, roles, faces, sizes, the library's limits)", threw === null, { threw });

  const need = ["libCard(", "libItems(", "libRec(", "libTpl(", "psdTemplate(", "importPsd:", "importLibraryJson:",
    "libExport(", "libDelete(", "libSetTrash(", "libAssign(", "guessGroup(", "buildBox(", "buildAlbum(", "aiStep(",
    "applyInfo(", "draw3d(", "view3dOps(", "drawSheetBg(", "bgSection(", "drawMark(", "drawLogo(", "marksSection(",
    "applyTextStyle(", "issuesBar(", "fixSheet(", "pageMax(", "decorOk(", "decorBox(", "decorLabel("];
  const missing = need.filter((n) => !has(MOD, n));
  report("A4) the module carries the wave I engine — the library, the PSD reader, the build, the mockup, the sheet background, the marks, the logo, the text styles and the issues bar", missing.length === 0, { missing });

  report("A5) a page records the template it is laid from and its own background, and the document carries the couple and the logo",
    has(MOD, 'lib:"", bg:null') && has(MOD, 'info:{ bride:"", groom:"", date:"", venue:"" }, logo:""') && has(MOD, "var lt = libTpl(pg); if (lt) return lt;"),
    { lib: has(MOD, 'lib:"", bg:null'), info: has(MOD, 'info:{ bride:"", groom:"", date:"", venue:"" }, logo:""') });

  report("A6) the standee sizes read in centimetres, and the library's own ceilings are the ones the module was written against",
    WI.STANDEE_SIZES.length === 4 && WI.LIB.max === ALB.lib.max && WI.LIB.maxPhotos === ALB.lib.maxPhotos &&
    has(read("tools/build_album_data.js"), 'require("./lib/album_wave_i.js")'),
    { max: ALB.lib.max, maxPhotos: ALB.lib.maxPhotos });
}

/* ===================== B) the walk, on a 390px phone ===================== */
async function walk() {
  const browser = withPremium(await chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  try {
    await page.goto(BASE + "/index.html?page=pgAlbum&lang=en", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__mk = function (w, h, bg) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = "#e0b090"; x.beginPath(); x.arc(w / 2, h * 0.3, Math.min(w, h) * 0.14, 0, Math.PI * 2); x.fill(); return c.toDataURL("image/jpeg", 0.85); };
      window.__entry = function (name, s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return { name, size: u8.length, path: "fx/" + name, read: () => Promise.resolve(u8.buffer) }; };
      window.__files = [];
      const oc = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (b) { window.__files.push(b); return oc(b); };
      HTMLAnchorElement.prototype.click = function () { if (this.download && /^data:/.test(this.href)) window.__files.push({ name: this.download, dataUrl: this.href }); };
    });

    const b1 = await page.evaluate(() => ({
      card: !!document.getElementById("albLibCard"), h2: (document.querySelector("#albLibCard h2") || {}).textContent || "",
      groups: [...document.querySelectorAll("#albLibGroups .chip")].map((c) => c.id),
      doors: [...document.querySelectorAll("#albLibDoors button")].map((b) => b.id),
      tiles: document.querySelectorAll("#albLibTiles .alb-libtile").length,
      builtin: ALBUM.library().items.length, stage: [...document.querySelectorAll("#albStageOps .chip")].map((c) => c.id),
      issues: !!document.getElementById("albIssues"), marks: document.querySelectorAll("#albMarks_date .alb-marktile").length + "+" + document.querySelectorAll("#albMarks_mono .alb-marktile").length,
      logo: !!document.getElementById("albLogoPick"), bg: !!document.getElementById("albBgStrip")
    }));
    report("B1) the Album page opens with the library card (twelve standee designs already on the shelf), its group chips, its three doors, the mockup chip, the issues bar, sixteen marks and the logo row",
      b1.card && /TEMPLATE LIBRARY/.test(b1.h2) && b1.builtin === 12 && b1.tiles === 12 &&
      b1.groups.indexOf("albLibGroup_standee") >= 0 && b1.doors.join() === "albLibImport,albLibImportDir,albBuildOpen" &&
      b1.stage.indexOf("alb3d") >= 0 && b1.issues && b1.marks === "8+8" && b1.logo && b1.bg, b1);

    const fx = fixtures();
    const b2 = await page.evaluate(async (fx) => {
      const n = await ALBUM.importPsd(Object.keys(fx).map((k) => window.__entry(k, fx[k])));
      await window.__wait(400);
      const lib = ALBUM.library(), got = lib.items.filter((i) => !i.builtin);
      const recs = {};
      got.forEach((it) => { const r = ALBUM.template(it.id); recs[it.name] = r && { w: r.w, h: r.h, dpi: r.dpi, frames: r.frames.length, roles: r.texts.map((t) => t.role), bg: r.bg.length > 0, thumb: r.thumb.length > 0, fonts: r.fonts.length }; });
      return { n, rows: got.map((i) => [i.name, i.group, i.orient, i.n]), recs, skipped: (lib.view.last && lib.view.last.skipped || []).map((s) => s.name), tiles: document.querySelectorAll("#albLibTiles .alb-libtile").length };
    }, fx);
    const wed = b2.recs["wedding two"], sd = b2.recs["standee welcome"], flat = b2.recs["spread flat"];
    report("B2) three real .psd files are read in the browser — the wedding sheet's three frames and four lines (its Vietnamese layer names included), the standee's upright frame, the flat spread's grey placeholders — and the file that is not a PSD is refused by name",
      b2.n === 3 && b2.tiles === 15 && wed && wed.frames === 3 && wed.w === 2000 && wed.h === 3000 && wed.dpi === 300 &&
      wed.roles.join() === "subtitle,names,date,caption" && wed.bg && wed.thumb && wed.fonts >= 3 &&
      sd && sd.frames === 1 && sd.dpi === 150 && flat && b2.skipped.join() === "not a psd", b2);

    report("B3) each template is filed under the group its own file name names, and its orientation and photo count are measured, not guessed",
      JSON.stringify(b2.rows) === JSON.stringify([["wedding two", "wedding", "port", 3], ["standee welcome", "standee", "port", 1], ["spread flat", "", "land", 0]]), b2.rows);

    const b4 = await page.evaluate(async () => {
      const bgs = ["#2a4a6a", "#20304a", "#6a3a2a", "#3a5a3a", "#4a2a5a", "#5a5a2a"];
      await ALBUM.accept(bgs.map((b, i) => window.__mk(i % 3 === 0 ? 900 : 600, i % 3 === 0 ? 600 : 900, b)), "pool");
      await window.__wait(1200);
      ALBUM.info({ bride: "Su Su", groom: "Kyaw Kyaw", date: "20.10.2026", venue: "Novotel Yangon" });
      const wed = ALBUM.library().items.find((i) => i.name === "wedding two");
      ALBUM.applyTemplate(wed.id); await window.__wait(800);
      const pg = ALBUM.doc().pages[ALBUM.doc().cur], cells = ALBUM.__cellsForTest(ALBUM.doc().cur);
      return { lib: pg.lib === wed.id, photos: pg.photos.length, cells: cells.length, texts: pg.texts.map((t) => t.role + ":" + t.text),
               fromLine: (document.getElementById("albLayoutLib") || {}).textContent || "", photosH: (document.querySelector("#albPhotosCard h2") || {}).textContent || "" };
    });
    report("B4) applying an imported template lays the page from ITS frames and fills its slots with the couple, the date and the venue typed once",
      b4.lib && b4.cells === 3 && b4.photos === 3 && b4.texts.join(" · ") === "subtitle:SAVE THE DATE · names:Su Su & Kyaw Kyaw · date:20.10.2026 · caption:Novotel Yangon" &&
      /wedding two/.test(b4.fromLine) && /3 \/ 8/.test(b4.photosH), b4);

    const b5 = await page.evaluate(async () => {
      const n = await ALBUM.build({ method: "group", group: "*", sheets: 3, min: 1, max: 3, pair: true, order: true, outside: true, studio: true, rnd: () => 0.1 });
      await window.__wait(500);
      const d = ALBUM.doc(), ai = ALBUM.ai();
      return { n, pages: d.pages.map((p) => ({ lib: !!p.lib, photos: p.photos.length })), steps: ai && ai.steps.map((s) => s.k + ":" + s.state), notes: ai && ai.steps.map((s) => s.note), done: ai && ai.done,
               log: [...document.querySelectorAll("#albAiLog .alb-ailine")].length };
    });
    report("B5) one dialog builds the whole album from the library and the studio's own layouts, and prints seven honest steps as it goes",
      b5.n === 3 && b5.pages.length === 3 && b5.pages.every((p) => p.photos > 0) &&
      b5.steps.join() === "gather:ok,faces:ok,order:ok,plan:ok,pick:ok,lay:ok,check:warn" && b5.done && b5.log === 7 &&
      b5.notes.every((t) => t && !/^alb_/.test(t)), b5);

    const b6 = await page.evaluate(async () => {
      ALBUM.view("3d"); await window.__wait(900);
      const cv = document.getElementById("albCanvas3d"), x = cv && cv.getContext("2d");
      const px = x && Array.from(x.getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data);
      const turned = ALBUM.turn(1); await window.__wait(500);
      const ops = [...document.querySelectorAll("#alb3dOps button")].map((b) => b.id);
      const note = (document.getElementById("alb3dNote") || {}).textContent || "";
      ALBUM.view("page"); await window.__wait(400);
      return { px, turned, ops, note, painted: !!(px && (px[0] + px[1] + px[2]) > 30) };
    });
    report("B6) the mockup view paints the open book on a table, turns its pages and says what it is showing",
      b6.painted && b6.turned && b6.ops.join() === "alb3dPrev,alb3dNext" && b6.note.length > 10 && !/^alb_/.test(b6.note), b6);

    const b7 = await page.evaluate(async () => {
      const d = ALBUM.doc();
      await ALBUM.sheetBg(d.pool[1].src); await window.__wait(700);
      const before = Array.from(document.getElementById("albCanvas").getContext("2d").getImageData(4, 4, 1, 1).data);
      ALBUM.sheetBgSet("color", "gold"); ALBUM.sheetBgSet("mode", "bottom"); await window.__wait(400);
      const ui = { blur: !!document.getElementById("albBgBlur"), bright: !!document.getElementById("albBgBright"), sat: !!document.getElementById("albBgSat"),
                   zoom: !!document.getElementById("albBgZoom"), tints: document.querySelectorAll("#albBgTints .chip").length,
                   modes: document.querySelectorAll("#albBgModes .chip").length, amt: !!document.getElementById("albBgAmt") };
      const bg = ALBUM.doc().pages[ALBUM.doc().cur].bg;
      return { before, ui, tint: bg && bg.tint, src: !!(bg && bg.src) };
    });
    report("B7) a photograph sits behind the frames with its own blur, brightness, colour, zoom and tint — and the tint's three modes and amount appear the moment a colour is picked",
      b7.src && b7.ui.blur && b7.ui.bright && b7.ui.sat && b7.ui.zoom && b7.ui.tints === 7 && b7.ui.modes === 3 && b7.ui.amt &&
      b7.tint && b7.tint.color === "gold" && b7.tint.mode === "bottom" && (b7.before[0] + b7.before[1] + b7.before[2]) > 30, b7);

    const b8 = await page.evaluate(async () => {
      ALBUM.addMark("date", "stack"); ALBUM.addMark("mono", "circle"); await window.__wait(400);
      const sel = ALBUM.sel(), name = (document.querySelector("#albSelBox .alb-selname") || {}).textContent || "";
      const bar = [...document.querySelectorAll("#albSelBox button")].map((b) => b.id).filter(Boolean);
      const logoOk = await ALBUM.setLogo(window.__mk(400, 200, "#ffffff")); ALBUM.addLogo(); await window.__wait(400);
      const decor = ALBUM.doc().pages[ALBUM.doc().cur].decor.map((x) => x.kind + (x.style ? ":" + x.style : ""));
      const logoBar = [...document.querySelectorAll("#albSelBox button")].map((b) => b.id).filter(Boolean);
      ALBUM.duplicate(); await window.__wait(200);
      const n = ALBUM.doc().pages[ALBUM.doc().cur].decor.length;
      return { sel, name, bar, logoOk, decor, logoBar, n };
    });
    report("B8) a date block, a monogram and the studio's logo land on the sheet as their own marks — the mark takes the tints, the logo keeps its colours, and neither of them offers the mask's mirror",
      b8.decor.join() === "mark:stack,mark:circle,logo" && b8.logoOk && /Monogram/.test(b8.name) &&
      b8.bar.indexOf("albTint_gold") >= 0 && b8.bar.indexOf("albSelFlip") < 0 &&
      b8.logoBar.indexOf("albTint_gold") < 0 && b8.logoBar.join() === "albSelDup,albSelRemove" && b8.n === 4, b8);

    const b9 = await page.evaluate(async () => {
      /* the build laid three sheets; the lines live on the one laid from a template — turn to it */
      let guard = 0;
      while (!ALBUM.doc().pages[ALBUM.doc().cur].texts.length && guard++ < 8) { ALBUM.turn(-1); await window.__wait(250); }
      const pg = ALBUM.doc().pages[ALBUM.doc().cur];
      let ts = null;
      if (pg.texts.length) { ALBUM.select("text", 0); await window.__wait(200); ALBUM.textStyle("scriptnames"); await window.__wait(300);
        ts = { font: pg.texts[0].font, size: pg.texts[0].size, style: pg.texts[0].style, chips: document.querySelectorAll("#albSelStyles .chip").length }; }
      const issues = ALBUM.issues().length, fixed = ALBUM.fixSheet();
      const label = (document.querySelector("#albIssues .alb-sheetlab") || {}).textContent || "";
      return { ts, issues, fixed, label };
    });
    report("B9) a line of type takes one of twelve styles in a tap, and the issues bar names the sheet and fixes what it can",
      b9.ts && b9.ts.chips === 12 && b9.ts.style === "scriptnames" && /Sheet \d+ of \d+/.test(b9.label) && b9.fixed >= 0, b9);

    const b10 = await page.evaluate(async () => {
      ALBUM.exportPrefs("fmt", "jpg"); ALBUM.exportPrefs("q", 80); ALBUM.exportPrefs("zip", true); ALBUM.exportPrefs("num", true);
      window.__files = [];
      await ALBUM.exportAlbum(); await window.__wait(900);
      const zb = window.__files.find((f) => f && f.type === "application/zip");
      let zip = null;
      if (zb) { const u = new Uint8Array(await zb.arrayBuffer()), dv = new DataView(u.buffer);
        zip = { size: u.length, sig: dv.getUint32(0, true).toString(16), eocd: dv.getUint32(u.length - 22, true).toString(16), count: dv.getUint16(u.length - 12, true) }; }
      window.__files = [];
      await ALBUM.exportLibrary(); await window.__wait(700);
      const jb = window.__files.find((f) => f && f.type === "application/json");
      let json = null, round = null;
      if (jb) { const txt = await jb.text(); json = JSON.parse(txt);
        const before = ALBUM.library().items.length;
        const n = await ALBUM.importLibraryJson([{ name: "lib.json", size: txt.length, read: () => Promise.resolve(new TextEncoder().encode(txt).buffer) }]);
        await window.__wait(400); round = { n, before, after: ALBUM.library().items.length }; }
      return { zip, json: json && { items: json.items.length, records: json.records.length, v: json.v }, round };
    });
    report("B10) every sheet leaves as one ZIP the browser wrote itself, and the library saves to one file another computer reads back",
      b10.zip && b10.zip.sig === "4034b50" && b10.zip.eocd === "6054b50" && b10.zip.count === 3 && b10.zip.size > 10000 &&
      b10.json && b10.json.items === 3 && b10.json.records === 3 && b10.json.v === VER &&
      b10.round && b10.round.n > 0 && b10.round.after > b10.round.before, b10);

    const b11 = await page.evaluate(async () => {
      const wed = ALBUM.library().items.find((i) => i.name === "wedding two");
      ALBUM.trash([wed.id, "sd_hero"], true); await window.__wait(300);
      const inTrash = ALBUM.library().items.filter((i) => i.trash).length;
      ALBUM.libraryView("trash", true); await window.__wait(300);
      const tiles = document.querySelectorAll("#albLibTiles .alb-libtile").length;
      ALBUM.trash(["sd_hero"], false);
      const del = ALBUM.deleteTemplates([wed.id]); await window.__wait(300);
      ALBUM.libraryView("trash", false); await window.__wait(200);
      const ids = ALBUM.library().items.map((i) => i.id);
      const doc = ALBUM.doc(), copy = JSON.parse(JSON.stringify(doc));
      ALBUM.setDoc(copy); await window.__wait(700);
      const d2 = ALBUM.doc(), cur = doc.cur;
      const same = { lib: d2.pages.map((p) => p.lib).join() === doc.pages.map((p) => p.lib).join(),
                     bg: !!d2.pages[cur].bg === !!doc.pages[cur].bg, decor: d2.pages[cur].decor.length === doc.pages[cur].decor.length,
                     info: JSON.stringify(d2.info) === JSON.stringify(doc.info), logo: d2.logo === doc.logo,
                     style: d2.pages[cur].texts.map((t) => t.style).join() === doc.pages[cur].texts.map((t) => t.style).join() };
      return { inTrash, tiles, del, gone: ids.indexOf(wed.id) < 0, same };
    });
    report("B11) the trash holds what was thrown away until it is restored or deleted for good, and a reopened album still carries its templates, its background, its marks, the couple, the logo and its text styles",
      b11.inTrash === 2 && b11.tiles === 2 && b11.del === 1 && b11.gone &&
      Object.keys(b11.same).every((k) => b11.same[k]), b11);

    report("B12) the whole walk ran without one page error", errors.length === 0, errors.slice(0, 4));
  } finally { await ctx.close(); await browser.close(); }
}

/* ===================== C) the panel's lifted copy ===================== */
function panel() {
  const need = ["libCard(", "psdTemplate(", "importPsd:", "buildAlbum(", "draw3d(", "drawMark(", "drawLogo(", "applyTextStyle("];
  const missing = need.filter((n) => !has(PALB, n));
  report("C1) the panel's Album module is the app's, wave I included — the library, the PSD reader, the build, the mockup, the marks and the text styles", missing.length === 0 && PALB.length > 100000, { missing, bytes: PALB.length });

  const strings = KEYS.filter((k) => !has(PALB, '"' + k + '"'));
  report("C2) the panel carries the wave I words with it (no network, no app to ask)", strings.length === 0, { missing: strings.slice(0, 8) });

  const doors = ["pickPsd:", "pickPsdFolder:", "pickJson:", "saveMany:"];
  const noDoor = doors.filter((d) => !has(MAIN, d));
  report("C3) the Photoshop host opens the library's doors the Photoshop way — one or several .psd, a whole folder, a library JSON, and a folder to save many files into",
    noDoor.length === 0 && has(MAIN, "albumFolderEntries") && has(MAIN, "albumSaveMany") && has(MAIN, "allowMultiple: true"), { noDoor });

  /* UXP-safe: the panel's copy may not reach for a folder dialog behind the student's back */
  report("C4) every door the panel opens is asked for by a tap — the module never picks a file on its own",
    !/setTimeout\([^)]*pickPsd/.test(PALB) && !/setInterval\([^)]*pick/.test(PALB), {});
}

/* ===================== D) the nine languages and the fifteen packs ===================== */
function languages() {
  const shell = [], seven = [];
  KEYS.forEach((k) => {
    if (!new RegExp("[\\n,{]\\s*" + k + ':\\{my:"').test(APP)) shell.push(k);
    const row = L14[k];
    if (!row || !L7.every((l) => typeof row[l] === "string" && row[l].length)) seven.push(k);
  });
  report("D1) all " + KEYS.length + " wave I lines are in the studio's nine languages — my/en in the shell's one-line shape, the other seven in data/trmore.js (l14)",
    shell.length === 0 && seven.length === 0, { shell: shell.slice(0, 6), seven: seven.slice(0, 6) });

  const packs = {}, short = [], ph = [];
  PACKS.forEach((c) => {
    const t = read("docs/app/data/trl-" + c + ".js"), head = "window.HNK_TRL=window.HNK_TRL||{};window.HNK_TRL." + c + "=";
    packs[c] = JSON.parse(t.slice(head.length).replace(/;\s*$/, ""));
  });
  const en = {};
  KEYS.forEach((k) => { en[k] = (APP.match(new RegExp("\\n\\s*" + k + ':\\{my:"[^"]*",en:"([^"]*)"')) || [])[1] || ""; });
  PACKS.forEach((c) => KEYS.forEach((k) => {
    if (typeof packs[c][k] !== "string" || !packs[c][k].length) short.push(c + ":" + k);
    const want = (en[k].match(/\{[A-Z]\}/g) || []).sort().join(), got = ((packs[c][k] || "").match(/\{[A-Z]\}/g) || []).sort().join();
    if (want !== got) ph.push(c + ":" + k);
  }));
  report("D2) the fifteen reader packs carry every wave I line with the same placeholders as the English", short.length === 0 && ph.length === 0, { short: short.slice(0, 6), ph: ph.slice(0, 6) });

  report("D3) the three Tai packs are registered on the sweep's own terms (V61250_KEYS in all three rows), so nothing is quietly left in English",
    /const V61250_KEYS = \[/.test(SWEEP) && (SWEEP.match(/\.\.\.V61250_KEYS[,\]]/g) || []).length === 3 &&
    KEYS.every((k) => has(SWEEP, '"' + k + '"')), { rows: (SWEEP.match(/\.\.\.V61250_KEYS[,\]]/g) || []).length });

  const used = KEYS.filter((k) => !has(MOD, '"' + k + '"'));
  const dynamic = used.filter((k) => !/^alb_(ai|bg_m|build_m|info|lib_or|mark|lib_why)_/.test(k));
  report("D4) every line is one the module really asks for — by name, or through one of its own families (alb_ai_ · alb_bg_m_ · alb_build_m_ · alb_info_ · alb_lib_or_ · alb_mark_ · alb_lib_why_)",
    dynamic.length === 0, { dynamic: dynamic.slice(0, 8) });
}

/* ===================== E) release pins ===================== */
function release() {
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const ver = JSON.parse(read("docs/app/version.json"));
  report(`E1) the lockstep pins name ${VER} / panel ${PVER} on every surface`,
    has(APP, 'var APP_VER="' + VER + '"') && ver.v === VER && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(read("server/index.js"), 'const API_VERSION = "' + VER + '"') && has(MAIN, 'const PANEL_VERSION = "' + PVER + '"') &&
    JSON.parse(read("panel/manifest.json")).version === PVER && manifest.version === PVER &&
    manifest.artifact_file === "HNK_Ai_Panel_v" + PVER + ".ccx" && pv.v === PVER && pv.latest_version === PVER,
    { app: ver.v, panel: manifest.version });

  const wn = JSON.parse(read("docs/app/data/whatsnew.js").replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  /* 6.127.0 — the wave shipped as 6.125.0 and led the strip that day; every release
     since adds a row above it, so the row is found by its own version and the window
     widens by one rather than the row being re-dated */
  const WAVE_V = "6.125.0";
  const row = wn.find((r) => r.v === WAVE_V);
  report(`E2) the What's New strip carries the ${WAVE_V} row, in all nine languages, pointing at the Album page (it led the strip when this wave shipped; the 6.126.0 and 6.127.0 rows sit above it now)`,
    !!row && wn.indexOf(row) <= 2 && row.ref === "pgAlbum" &&
    ["my", "en"].concat(L7).every((l) => typeof row.t[l] === "string" && row.t[l].length > 10 && typeof row.s[l] === "string" && row.s[l].length > 80),
    { v: row && row.v, ref: row && row.ref });

  const steps = (CI.match(/node test\/[a-zA-Z0-9_]+\.js/g) || []).length;
  report("E3) the sweep runs this test and the landing says how many tests it runs (267 when this wave shipped, 268 since 6.127.0 added verify_skin_age_guard)",
    has(CI, "node test/verify_album_wave_i.js") && steps === 268 && has(LANDING, "268 tests") && !/\b266 tests\b/.test(LANDING),
    { steps });
}

(async () => {
  tables();
  await walk();
  panel();
  languages();
  release();
  console.log((fail ? "FAIL" : "PASS") + " — verify_album_wave_i: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAIL — the test itself threw :: " + (e && e.stack || e)); process.exit(1); });
