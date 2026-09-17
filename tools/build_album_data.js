#!/usr/bin/env node
"use strict";
/* ============================================================================
   tools/build_album_data.js — docs/app/data/album.js (window.HNK_ALBUM)

   THE ALBUM PAGE'S TABLES, one generator so the geometry is computed and not
   typed. The owner asked for album pages that take one to six photos, carry
   text, offer professional fonts, cover prewedding / solo / family / baby /
   kid / newborn / events, and change size freely
   ("ပုံတေွ ၁၂၃၄၅၆ ပုံကို ထည့်ပြီး album Pages လုပ်ချင်တယ် … size အစုံ
   ကြိုက်သလိုပြောင်းလဲလို့ရတာ").

   WHY A GENERATOR AND NOT A HAND-WRITTEN TABLE. Seventy-odd layouts is
   seventy-odd × four numbers per cell; one transposed digit is a photo that
   sits a millimetre off its neighbour on a printed spread and nothing in a
   test would catch it. Every layout here is declared as a SHAPE — a pane
   split, a grid, a mosaic of rows — and the cell rectangles are computed from
   it with one gutter constant. The shapes are readable; the arithmetic is the
   machine's.

   EVERY RECTANGLE IS A FRACTION of the page's safe area (0..1, x/y/w/h), never
   a pixel and never a millimetre. That is what makes "size အစုံ
   ကြိုက်သလိုပြောင်းလဲလို့ရတာ" true: a layout laid out for 12×36 inches is the
   same four fractions at 10×30, at A4, at 4:5 for Instagram, or at whatever
   width × height the studio types in. Nothing is re-drawn when the size
   changes — the safe area is recomputed and the same fractions are multiplied
   through it.

   The safe area itself is the page minus bleed and minus the gutter guard:
   3 mm of bleed on every outer edge and 5 mm clear of the binding on a spread
   are the print shop's numbers, not ours.

   Usage: node tools/build_album_data.js
   test/verify_album_pages.js re-runs this and fails on drift. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "app", "data", "album.js");

/* The gap between two neighbouring photos, as a fraction of the safe area.
   One constant for every layout: a page whose gaps differ cell by cell reads
   as a mistake even when nobody can say which gap is wrong. */
const G = 0.014;

/* ---------------------------------------------------------------------------
   SHAPES — each returns a list of {x,y,w,h} rectangles in 0..1.
   --------------------------------------------------------------------------- */

/* the whole safe area, one photo, no gap (a full-bleed page) */
function full() { return [{ x: 0, y: 0, w: 1, h: 1 }]; }

/* one photo with an even margin all round */
function inset(m) { return [{ x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m }]; }

/* one photo as a horizontal band — the cinematic strip Vietnamese studios set
   across a 12×36 spread, with air above and below for a line of text */
function band(y, h) { return [{ x: 0, y: y, w: 1, h: h }]; }

/* PANES: split the area along `dir`, then split each pane across it.
   parts = [{f, split}] — f is the pane's share of the run, split how many
   equal cells it holds across. This one shape covers halves, 60/40, a big
   photo beside a stack of small ones, and every strip. */
function panes(dir, parts) {
  const row = dir === "row";
  const total = parts.reduce((s, p) => s + p.f, 0);
  const gapsAlong = parts.length - 1;
  const runAvail = 1 - gapsAlong * G;
  const out = [];
  let at = 0;
  parts.forEach(function (p) {
    const run = runAvail * (p.f / total);
    const n = p.split || 1;
    const crossAvail = 1 - (n - 1) * G;
    for (let i = 0; i < n; i++) {
      const cross = crossAvail / n;
      const crossAt = i * (cross + G);
      out.push(row
        ? { x: at, y: crossAt, w: run, h: cross }
        : { x: crossAt, y: at, w: cross, h: run });
    }
    at += run + G;
  });
  return out;
}

/* a regular c × r grid, row-major */
function grid(c, r) {
  const cw = (1 - (c - 1) * G) / c, ch = (1 - (r - 1) * G) / r;
  const out = [];
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
    out.push({ x: i * (cw + G), y: j * (ch + G), w: cw, h: ch });
  }
  return out;
}

/* MOSAIC: rows of unequal height, each cut into columns of unequal width.
   rows = [{ h:<share>, cols:[<share>, …] }] — the magazine layouts. */
function mosaic(rows) {
  const hTotal = rows.reduce((s, r) => s + r.h, 0);
  const hAvail = 1 - (rows.length - 1) * G;
  const out = [];
  let y = 0;
  rows.forEach(function (r) {
    const rh = hAvail * (r.h / hTotal);
    const wTotal = r.cols.reduce((s, c) => s + c, 0);
    const wAvail = 1 - (r.cols.length - 1) * G;
    let x = 0;
    r.cols.forEach(function (c) {
      const cw = wAvail * (c / wTotal);
      out.push({ x: x, y: y, w: cw, h: rh });
      x += cw + G;
    });
    y += rh + G;
  });
  return out;
}

/* ONE BIG PHOTO beside a small grid of the rest — the layout every album
   software calls "hero + thumbnails" and the one a five- or six-photo spread
   wants most often. `side` says which edge the big photo takes. */
function bigGrid(fBig, c, r, side) {
  const runAvail = 1 - G;
  const bw = runAvail * fBig, gw = runAvail * (1 - fBig);
  const gx = side === "left" ? gw + G : 0;
  const bx = side === "left" ? 0 : gw + G;
  const cw = (gw - (c - 1) * G) / c, ch = (1 - (r - 1) * G) / r;
  const out = [{ x: bx, y: 0, w: bw, h: 1 }];
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
    out.push({ x: gx + i * (cw + G), y: j * (ch + G), w: cw, h: ch });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   TEXT SLOTS — where a line of type sits on the page.

   role is what the line IS, not how it looks: the look comes from the font
   pairing the studio picked. A template names its slots; the studio fills the
   ones it wants and leaves the rest empty (an empty slot draws nothing).
   --------------------------------------------------------------------------- */
const T = {
  /* A centred block under a photo. The height is whatever is left below y,
     never a fixed 0.12: a caption band that runs off the bottom of the safe
     area is type printed into the bleed, which the trimmer cuts off. */
  underCentre: function (y) { return [{ x: 0.12, y: y, w: 0.76, h: Math.min(0.12, 1 - y), role: "title", align: "center" }]; },
  /* the classic title + names + date stack on an opener */
  opener: function () {
    return [
      { x: 0.14, y: 0.36, w: 0.72, h: 0.14, role: "title", align: "center" },
      { x: 0.14, y: 0.52, w: 0.72, h: 0.09, role: "names", align: "center" },
      { x: 0.14, y: 0.63, w: 0.72, h: 0.06, role: "date", align: "center" }
    ];
  },
  /* a column of type beside a photo */
  sideCol: function (x, w) {
    return [
      { x: x, y: 0.30, w: w, h: 0.13, role: "title", align: "left" },
      { x: x, y: 0.45, w: w, h: 0.22, role: "quote", align: "left" },
      { x: x, y: 0.70, w: w, h: 0.06, role: "date", align: "left" }
    ];
  },
  /* one small caption in a corner */
  caption: function (x, y, w, align) { return [{ x: x, y: y, w: w, h: 0.06, role: "caption", align: align || "left" }]; },
  /* a page number at the foot */
  folio: function () { return [{ x: 0.42, y: 0.95, w: 0.16, h: 0.05, role: "folio", align: "center" }]; }
};

/* ---------------------------------------------------------------------------
   THE TEMPLATES

   fam  — the family name, translated once for the whole family
   n    — how many photos the layout holds (1..6)
   cells / texts — computed above
   spread — "safe" if the layout leaves the binding clear (nothing crosses the
            centre band), "cross" if a photo deliberately runs across it.
            The auto-flow will not put a face in a crossing cell.
   --------------------------------------------------------------------------- */
function tpl(id, fam, n, cells, texts, spread) {
  return { id: id, fam: fam, n: n, cells: cells, texts: texts || [], spread: spread || "safe" };
}

const TEMPLATES = [
  /* ---- ONE PHOTO (10) — the focal page every spread is built around ---- */
  tpl("f1a", "fullbleed", 1, full(), [], "cross"),
  tpl("f1b", "fullbleed", 1, full(), T.caption(0.06, 0.88, 0.40, "left"), "cross"),
  tpl("f1c", "hero", 1, inset(0.08), [], "safe"),
  tpl("f1d", "hero", 1, inset(0.12), T.underCentre(0.86), "safe"),
  tpl("f1e", "pano", 1, band(0.16, 0.60), T.underCentre(0.80), "cross"),
  tpl("f1f", "pano", 1, band(0.08, 0.84), [], "cross"),
  tpl("f1g", "sidetext", 1, panes("row", [{ f: 62, split: 1 }, { f: 38, split: 0 }]).slice(0, 1), T.sideCol(0.66, 0.28), "safe"),
  tpl("f1h", "sidetext", 1, [{ x: 0.38, y: 0, w: 0.62, h: 1 }], T.sideCol(0.04, 0.28), "safe"),
  tpl("f1i", "opener", 1, [{ x: 0.22, y: 0.04, w: 0.56, h: 0.30 }], T.opener(), "safe"),
  tpl("f1j", "quarter", 1, [{ x: 0.30, y: 0.14, w: 0.40, h: 0.60 }], T.underCentre(0.80), "safe"),

  /* ---- TWO PHOTOS (12) ---- */
  tpl("f2a", "split", 2, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }]), [], "safe"),
  tpl("f2b", "split", 2, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }]), T.caption(0.04, 0.92, 0.42, "left"), "safe"),
  tpl("f2c", "sixty", 2, panes("row", [{ f: 62, split: 1 }, { f: 38, split: 1 }]), [], "safe"),
  tpl("f2d", "sixty", 2, panes("row", [{ f: 38, split: 1 }, { f: 62, split: 1 }]), [], "safe"),
  tpl("f2e", "stack", 2, panes("col", [{ f: 1, split: 1 }, { f: 1, split: 1 }]), [], "cross"),
  tpl("f2f", "stack", 2, panes("col", [{ f: 62, split: 1 }, { f: 38, split: 1 }]), [], "cross"),
  tpl("f2g", "bigsmall", 2, [{ x: 0, y: 0, w: 0.70, h: 1 }, { x: 0.72, y: 0.24, w: 0.28, h: 0.52 }], [], "safe"),
  tpl("f2h", "bigsmall", 2, [{ x: 0.30, y: 0, w: 0.70, h: 1 }, { x: 0, y: 0.24, w: 0.28, h: 0.52 }], [], "safe"),
  tpl("f2i", "duo", 2, [{ x: 0.06, y: 0.10, w: 0.42, h: 0.70 }, { x: 0.52, y: 0.20, w: 0.42, h: 0.70 }], [], "safe"),
  tpl("f2j", "duotext", 2, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }]).map(function (c) { return { x: c.x, y: 0, w: c.w, h: 0.80 }; }), T.underCentre(0.85), "safe"),
  tpl("f2k", "wings", 2, [{ x: 0, y: 0.12, w: 0.36, h: 0.76 }, { x: 0.64, y: 0.12, w: 0.36, h: 0.76 }], T.sideCol(0.40, 0.20), "safe"),
  tpl("f2l", "overlap", 2, [{ x: 0, y: 0, w: 0.64, h: 0.78 }, { x: 0.40, y: 0.30, w: 0.60, h: 0.70 }], [], "safe"),

  /* ---- THREE PHOTOS (12) ---- */
  tpl("f3a", "onetwo", 3, panes("row", [{ f: 62, split: 1 }, { f: 38, split: 2 }]), [], "safe"),
  tpl("f3b", "onetwo", 3, panes("row", [{ f: 38, split: 2 }, { f: 62, split: 1 }]), [], "safe"),
  tpl("f3c", "onetwo", 3, panes("col", [{ f: 62, split: 1 }, { f: 38, split: 2 }]), [], "cross"),
  tpl("f3d", "onetwo", 3, panes("col", [{ f: 38, split: 2 }, { f: 62, split: 1 }]), [], "cross"),
  tpl("f3e", "trio", 3, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]), [], "safe"),
  tpl("f3f", "trio", 3, panes("col", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]), [], "cross"),
  tpl("f3g", "trio", 3, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]).map(function (c, i) { return { x: c.x, y: i === 1 ? 0.08 : 0, w: c.w, h: 0.84 }; }), T.underCentre(0.90), "safe"),
  tpl("f3h", "lshape", 3, mosaic([{ h: 62, cols: [62, 38] }, { h: 38, cols: [1] }]), [], "safe"),
  tpl("f3i", "lshape", 3, mosaic([{ h: 38, cols: [1] }, { h: 62, cols: [38, 62] }]), [], "safe"),
  tpl("f3j", "mag", 3, mosaic([{ h: 58, cols: [1] }, { h: 42, cols: [1, 1] }]), [], "cross"),
  tpl("f3k", "mag", 3, mosaic([{ h: 42, cols: [1, 1] }, { h: 58, cols: [1] }]), [], "cross"),
  tpl("f3l", "triotext", 3, panes("row", [{ f: 34, split: 2 }, { f: 66, split: 1 }]), T.caption(0.36, 0.92, 0.60, "right"), "safe"),

  /* ---- FOUR PHOTOS (13) ---- */
  tpl("f4a", "quad", 4, grid(2, 2), [], "safe"),
  tpl("f4b", "quad", 4, grid(4, 1), [], "safe"),
  tpl("f4c", "quad", 4, grid(1, 4), [], "cross"),
  tpl("f4d", "onethree", 4, panes("row", [{ f: 60, split: 1 }, { f: 40, split: 3 }]), [], "safe"),
  tpl("f4e", "onethree", 4, panes("row", [{ f: 40, split: 3 }, { f: 60, split: 1 }]), [], "safe"),
  tpl("f4f", "onethree", 4, panes("col", [{ f: 60, split: 1 }, { f: 40, split: 3 }]), [], "cross"),
  tpl("f4g", "bandtop", 4, mosaic([{ h: 52, cols: [1] }, { h: 48, cols: [1, 1, 1] }]), [], "cross"),
  tpl("f4h", "bandtop", 4, mosaic([{ h: 48, cols: [1, 1, 1] }, { h: 52, cols: [1] }]), [], "cross"),
  tpl("f4i", "mosaic", 4, mosaic([{ h: 55, cols: [58, 42] }, { h: 45, cols: [42, 58] }]), [], "safe"),
  tpl("f4j", "mosaic", 4, mosaic([{ h: 45, cols: [42, 58] }, { h: 55, cols: [58, 42] }]), [], "safe"),
  tpl("f4k", "quadtext", 4, grid(2, 2).map(function (c) { return { x: c.x, y: c.y * 0.86, w: c.w, h: c.h * 0.86 }; }), T.underCentre(0.90), "safe"),
  tpl("f4l", "filmstrip", 4, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]).map(function (c) { return { x: c.x, y: 0.18, w: c.w, h: 0.64 }; }), T.underCentre(0.86), "safe"),
  tpl("f4m", "cornerbig", 4, mosaic([{ h: 64, cols: [66, 34] }, { h: 36, cols: [1, 1] }]), [], "safe"),

  /* ---- FIVE PHOTOS (12) ---- */
  tpl("f5a", "onefour", 5, panes("row", [{ f: 58, split: 1 }, { f: 42, split: 4 }]), [], "safe"),
  tpl("f5b", "onefour", 5, panes("row", [{ f: 42, split: 4 }, { f: 58, split: 1 }]), [], "safe"),
  tpl("f5c", "onefour", 5, bigGrid(0.58, 2, 2, "left"), [], "safe"),
  tpl("f5d", "mag5", 5, mosaic([{ h: 56, cols: [62, 38] }, { h: 44, cols: [1, 1, 1] }]), [], "safe"),
  tpl("f5e", "mag5", 5, mosaic([{ h: 44, cols: [1, 1, 1] }, { h: 56, cols: [38, 62] }]), [], "safe"),
  tpl("f5f", "strip5", 5, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]), [], "safe"),
  tpl("f5g", "strip5", 5, panes("row", [{ f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }, { f: 1, split: 1 }]).map(function (c) { return { x: c.x, y: 0.20, w: c.w, h: 0.60 }; }), T.underCentre(0.84), "safe"),
  tpl("f5h", "mosaic5", 5, mosaic([{ h: 50, cols: [1, 1] }, { h: 50, cols: [1, 1, 1] }]), [], "safe"),
  tpl("f5i", "mosaic5", 5, mosaic([{ h: 50, cols: [1, 1, 1] }, { h: 50, cols: [1, 1] }]), [], "safe"),
  tpl("f5j", "tallpair", 5, panes("row", [{ f: 34, split: 2 }, { f: 32, split: 1 }, { f: 34, split: 2 }]), [], "safe"),
  tpl("f5k", "bandfour", 5, mosaic([{ h: 55, cols: [1] }, { h: 45, cols: [1, 1, 1, 1] }]), [], "cross"),
  tpl("f5l", "bandfour", 5, mosaic([{ h: 45, cols: [1, 1, 1, 1] }, { h: 55, cols: [1] }]), [], "cross"),

  /* ---- SIX PHOTOS (13) ---- */
  tpl("f6a", "six", 6, grid(3, 2), [], "safe"),
  tpl("f6b", "six", 6, grid(2, 3), [], "safe"),
  tpl("f6c", "six", 6, grid(6, 1), [], "safe"),
  tpl("f6d", "onefive", 6, panes("row", [{ f: 56, split: 1 }, { f: 44, split: 5 }]), [], "safe"),
  tpl("f6e", "onefive", 6, panes("row", [{ f: 44, split: 5 }, { f: 56, split: 1 }]), [], "safe"),
  tpl("f6f", "story6", 6, mosaic([{ h: 50, cols: [58, 42] }, { h: 50, cols: [1, 1, 1, 1] }]), [], "safe"),
  tpl("f6g", "story6", 6, mosaic([{ h: 50, cols: [1, 1, 1, 1] }, { h: 50, cols: [42, 58] }]), [], "safe"),
  tpl("f6h", "contact", 6, grid(3, 2).map(function (c) { return { x: c.x, y: c.y * 0.88, w: c.w, h: c.h * 0.88 }; }), T.underCentre(0.91), "safe"),
  tpl("f6i", "mosaic6", 6, mosaic([{ h: 34, cols: [1, 1] }, { h: 32, cols: [1, 1] }, { h: 34, cols: [1, 1] }]), [], "safe"),
  tpl("f6j", "mosaic6", 6, mosaic([{ h: 60, cols: [40, 30, 30] }, { h: 40, cols: [30, 30, 40] }]), [], "safe"),
  tpl("f6k", "tri2", 6, panes("row", [{ f: 1, split: 2 }, { f: 1, split: 2 }, { f: 1, split: 2 }]), [], "safe"),
  tpl("f6l", "bandfive", 6, mosaic([{ h: 52, cols: [1] }, { h: 48, cols: [1, 1, 1, 1, 1] }]), [], "cross"),
  tpl("f6m", "monthgrid", 6, grid(3, 2).map(function (c) { return { x: c.x, y: c.y * 0.90, w: c.w, h: c.h * 0.84 }; }),
    grid(3, 2).map(function (c) { return { x: c.x, y: c.y * 0.90 + c.h * 0.85, w: c.w, h: 0.05, role: "caption", align: "center" }; }), "safe")
];

/* the family names, once each, in the studio's nine languages */
const FAMS = {
  fullbleed: { my: "အပြည့်", en: "Full bleed", shn: "တဵမ်", kac: "Hkum", th: "เต็มหน้า", zh: "满版", vi: "Tràn lề", id: "Penuh", ms: "Penuh" },
  hero: { my: "ဇာတ်လိုက်ပုံ", en: "Hero", shn: "ႁၢင်ႈယႂ်ႇ", kac: "Sumla kaba", th: "ภาพเด่น", zh: "主图", vi: "Ảnh chính", id: "Foto utama", ms: "Foto utama" },
  pano: { my: "ကျယ်ပြန့်", en: "Panorama", shn: "ၵႂၢင်ႈ", kac: "Galu", th: "พาโนรามา", zh: "全景", vi: "Toàn cảnh", id: "Panorama", ms: "Panorama" },
  sidetext: { my: "ဘေးစာ", en: "Side text", shn: "လိၵ်ႈၶၢင်ႈ", kac: "Makau laika", th: "ข้อความข้าง", zh: "侧边文字", vi: "Chữ bên cạnh", id: "Teks samping", ms: "Teks sisi" },
  opener: { my: "အဖွင့်", en: "Opener", shn: "ၼႃႈႁႅၵ်ႈ", kac: "Hpang shawng", th: "หน้าเปิด", zh: "开篇", vi: "Trang mở", id: "Pembuka", ms: "Pembuka" },
  quarter: { my: "လေးပုံတစ်ပုံ", en: "Quarter", shn: "သီႇပုၼ်ႈ", kac: "Daw mali", th: "หนึ่งในสี่", zh: "四分之一", vi: "Một phần tư", id: "Seperempat", ms: "Suku" },
  split: { my: "ခွဲ ၅၀/၅၀", en: "Split 50/50", shn: "ၽႄ 50/50", kac: "Garan 50/50", th: "แบ่ง 50/50", zh: "对半", vi: "Chia đôi", id: "Bagi dua", ms: "Bahagi dua" },
  sixty: { my: "ခွဲ ၆၀/၄၀", en: "Split 60/40", shn: "ၽႄ 60/40", kac: "Garan 60/40", th: "แบ่ง 60/40", zh: "六四分", vi: "Chia 60/40", id: "Bagi 60/40", ms: "Bahagi 60/40" },
  stack: { my: "အထပ်", en: "Stacked", shn: "သွၼ်ႉ", kac: "Jasup", th: "ซ้อนบนล่าง", zh: "上下", vi: "Xếp chồng", id: "Bertumpuk", ms: "Bertindan" },
  bigsmall: { my: "ကြီး + သေး", en: "Big + small", shn: "ယႂ်ႇ + လဵၵ်ႉ", kac: "Kaba + kachyi", th: "ใหญ่ + เล็ก", zh: "大+小", vi: "Lớn + nhỏ", id: "Besar + kecil", ms: "Besar + kecil" },
  duo: { my: "နှစ်ပုံ", en: "Duo", shn: "သွင်ႁၢင်ႈ", kac: "Lahkawng", th: "คู่", zh: "双图", vi: "Cặp đôi", id: "Duo", ms: "Duo" },
  duotext: { my: "နှစ်ပုံ + စာ", en: "Duo + text", shn: "သွင် + လိၵ်ႈ", kac: "Lahkawng + laika", th: "คู่ + ข้อความ", zh: "双图+文字", vi: "Cặp + chữ", id: "Duo + teks", ms: "Duo + teks" },
  wings: { my: "နှစ်ဖက်", en: "Wings", shn: "သွင်ၾၢႆႇ", kac: "Lahkawng maga", th: "สองข้าง", zh: "两翼", vi: "Hai bên", id: "Dua sisi", ms: "Dua sisi" },
  overlap: { my: "ထပ်နေ", en: "Overlap", shn: "သွၼ်ႉၵၼ်", kac: "Jasup da", th: "เหลื่อมกัน", zh: "叠加", vi: "Chồng lấn", id: "Tumpang tindih", ms: "Bertindih" },
  onetwo: { my: "၁ + ၂", en: "One + two", shn: "1 + 2", kac: "1 + 2", th: "1 + 2", zh: "一加二", vi: "1 + 2", id: "1 + 2", ms: "1 + 2" },
  trio: { my: "သုံးပုံ", en: "Trio", shn: "သၢမ်ႁၢင်ႈ", kac: "Masum", th: "สามภาพ", zh: "三图", vi: "Bộ ba", id: "Trio", ms: "Trio" },
  triotext: { my: "သုံးပုံ + စာ", en: "Trio + text", shn: "သၢမ် + လိၵ်ႈ", kac: "Masum + laika", th: "สาม + ข้อความ", zh: "三图+文字", vi: "Bộ ba + chữ", id: "Trio + teks", ms: "Trio + teks" },
  lshape: { my: "L ပုံစံ", en: "L shape", shn: "ႁၢင်ႈ L", kac: "L hkum", th: "รูปตัว L", zh: "L 形", vi: "Hình chữ L", id: "Bentuk L", ms: "Bentuk L" },
  mag: { my: "မဂ္ဂဇင်း", en: "Magazine", shn: "မႅၵ်ႇၸိၼ်း", kac: "Laika buk", th: "นิตยสาร", zh: "杂志", vi: "Tạp chí", id: "Majalah", ms: "Majalah" },
  quad: { my: "လေးပုံ", en: "Four up", shn: "သီႇႁၢင်ႈ", kac: "Mali", th: "สี่ภาพ", zh: "四图", vi: "Bốn ảnh", id: "Empat foto", ms: "Empat foto" },
  quadtext: { my: "လေးပုံ + စာ", en: "Four + text", shn: "သီႇ + လိၵ်ႈ", kac: "Mali + laika", th: "สี่ + ข้อความ", zh: "四图+文字", vi: "Bốn + chữ", id: "Empat + teks", ms: "Empat + teks" },
  onethree: { my: "၁ + ၃", en: "One + three", shn: "1 + 3", kac: "1 + 3", th: "1 + 3", zh: "一加三", vi: "1 + 3", id: "1 + 3", ms: "1 + 3" },
  bandtop: { my: "အပေါ်တန်း", en: "Band + row", shn: "သဵၼ်ႈ + ထႅဝ်", kac: "Band + ding", th: "แถบ + แถว", zh: "横幅+一排", vi: "Dải + hàng", id: "Pita + baris", ms: "Jalur + baris" },
  mosaic: { my: "မိုဇိုင်း", en: "Mosaic", shn: "မူဝ်ႊသႄႊ", kac: "Mosaic", th: "โมเสก", zh: "马赛克", vi: "Khảm", id: "Mozaik", ms: "Mozek" },
  filmstrip: { my: "ဖလင်တန်း", en: "Film strip", shn: "သဵၼ်ႈၾိင်ႈ", kac: "Film ding", th: "แถบฟิล์ม", zh: "胶片条", vi: "Dải phim", id: "Strip film", ms: "Jalur filem" },
  cornerbig: { my: "ထောင့်ကြီး", en: "Corner big", shn: "မုမ်ယႂ်ႇ", kac: "Jut kaba", th: "มุมใหญ่", zh: "大角图", vi: "Góc lớn", id: "Sudut besar", ms: "Sudut besar" },
  onefour: { my: "၁ + ၄", en: "One + four", shn: "1 + 4", kac: "1 + 4", th: "1 + 4", zh: "一加四", vi: "1 + 4", id: "1 + 4", ms: "1 + 4" },
  mag5: { my: "မဂ္ဂဇင်း ၅", en: "Magazine 5", shn: "မႅၵ်ႇၸိၼ်း 5", kac: "Laika buk 5", th: "นิตยสาร 5", zh: "杂志五图", vi: "Tạp chí 5", id: "Majalah 5", ms: "Majalah 5" },
  strip5: { my: "တန်း ၅", en: "Strip of five", shn: "သဵၼ်ႈ 5", kac: "Ding manga", th: "แถว 5", zh: "五联", vi: "Dải 5", id: "Strip 5", ms: "Jalur 5" },
  mosaic5: { my: "မိုဇိုင်း ၅", en: "Mosaic 5", shn: "မူဝ်ႊသႄႊ 5", kac: "Mosaic 5", th: "โมเสก 5", zh: "五图马赛克", vi: "Khảm 5", id: "Mozaik 5", ms: "Mozek 5" },
  tallpair: { my: "ဒေါင်တွဲ", en: "Tall pairs", shn: "တင်ႈၵႃႈ", kac: "Galu lahkawng", th: "คู่แนวตั้ง", zh: "竖对", vi: "Cặp dọc", id: "Pasangan tegak", ms: "Pasangan tegak" },
  bandfour: { my: "တန်း + ၄", en: "Band + four", shn: "သဵၼ်ႈ + 4", kac: "Band + mali", th: "แถบ + 4", zh: "横幅+四图", vi: "Dải + 4", id: "Pita + 4", ms: "Jalur + 4" },
  six: { my: "ခြောက်ပုံ", en: "Six up", shn: "ႁူၵ်းႁၢင်ႈ", kac: "Kru", th: "หกภาพ", zh: "六图", vi: "Sáu ảnh", id: "Enam foto", ms: "Enam foto" },
  onefive: { my: "၁ + ၅", en: "One + five", shn: "1 + 5", kac: "1 + 5", th: "1 + 5", zh: "一加五", vi: "1 + 5", id: "1 + 5", ms: "1 + 5" },
  story6: { my: "ဇာတ်လမ်း ၆", en: "Story six", shn: "လွင်ႈ 6", kac: "Maumwi kru", th: "เรื่องราว 6", zh: "六图故事", vi: "Câu chuyện 6", id: "Cerita 6", ms: "Cerita 6" },
  contact: { my: "ချပ်တိုက်", en: "Contact sheet", shn: "ၽႅၼ်ႇႁၢင်ႈ", kac: "Sumla shara", th: "แผ่นรวม", zh: "小样页", vi: "Bảng ảnh", id: "Lembar kontak", ms: "Helaian kontak" },
  mosaic6: { my: "မိုဇိုင်း ၆", en: "Mosaic 6", shn: "မူဝ်ႊသႄႊ 6", kac: "Mosaic 6", th: "โมเสก 6", zh: "六图马赛克", vi: "Khảm 6", id: "Mozaik 6", ms: "Mozek 6" },
  tri2: { my: "၃ × ၂", en: "Three by two", shn: "3 × 2", kac: "3 × 2", th: "3 × 2", zh: "三乘二", vi: "3 × 2", id: "3 × 2", ms: "3 × 2" },
  bandfive: { my: "တန်း + ၅", en: "Band + five", shn: "သဵၼ်ႈ + 5", kac: "Band + manga", th: "แถบ + 5", zh: "横幅+五图", vi: "Dải + 5", id: "Pita + 5", ms: "Jalur + 5" },
  monthgrid: { my: "လအလိုက်", en: "Month grid", shn: "လိူၼ်လႂ်", kac: "Shata shagu", th: "ตารางเดือน", zh: "月份格", vi: "Lưới tháng", id: "Kisi bulan", ms: "Grid bulan" }
};

/* ---------------------------------------------------------------------------
   SIZES

   Inches and a DPI for anything that gets printed; raw pixels for the screen
   sizes, where a DPI is meaningless. 12×36 leads the list because it is what
   the Vietnamese and South-East Asian studios quote by default.
   --------------------------------------------------------------------------- */
function inSize(id, group, w, h) { return { id: id, group: group, w: w, h: h, unit: "in", dpi: 300 }; }
function pxSize(id, group, w, h) { return { id: id, group: group, w: w, h: h, unit: "px", dpi: 72 }; }

const SIZES = [
  /* panoramic flush-mount spreads — the industry default across Vietnam, India and Myanmar */
  inSize("12x36", "spread", 36, 12),
  inSize("12x30", "spread", 30, 12),
  inSize("10x30", "spread", 30, 10),
  inSize("10x24", "spread", 24, 10),
  inSize("8x24", "spread", 24, 8),
  /* square flush-mount — the western wedding book */
  inSize("12x12", "square", 12, 12),
  inSize("10x10", "square", 10, 10),
  inSize("8x8", "square", 8, 8),
  inSize("6x6", "square", 6, 6),
  /* upright magazine */
  inSize("11x14", "portrait", 11, 14),
  inSize("8x12", "portrait", 8, 12),
  inSize("85x11", "portrait", 8.5, 11),
  inSize("6x9", "portrait", 6, 9),
  /* landscape book */
  inSize("14x11", "landscape", 14, 11),
  inSize("12x8", "landscape", 12, 8),
  inSize("11x85", "landscape", 11, 8.5),
  /* ISO paper, both ways round */
  inSize("a4l", "paper", 11.69, 8.27),
  inSize("a4p", "paper", 8.27, 11.69),
  inSize("a3l", "paper", 16.54, 11.69),
  inSize("a3p", "paper", 11.69, 16.54),
  /* the screen — an album nobody prints is still an album */
  pxSize("sq", "social", 2048, 2048),
  pxSize("p45", "social", 2048, 2560),
  pxSize("story", "social", 1440, 2560),
  pxSize("wide", "social", 2560, 1440)
];

const SIZE_GROUPS = [
  { id: "spread", label: { my: "ကျယ်ပြန့် (flush-mount)", en: "Panoramic spread", shn: "ၵႂၢင်ႈ", kac: "Galu ai", th: "สเปรดพาโนรามา", zh: "全景跨页", vi: "Trang đôi toàn cảnh", id: "Bentang panorama", ms: "Bentang panorama" } },
  { id: "square", label: { my: "လေးထောင့်", en: "Square", shn: "ၸဵင်ႇသီႇ", kac: "Malut", th: "สี่เหลี่ยมจัตุรัส", zh: "正方形", vi: "Vuông", id: "Persegi", ms: "Persegi" } },
  { id: "portrait", label: { my: "ဒေါင်လိုက်", en: "Upright", shn: "တင်ႈ", kac: "Tsap ai", th: "แนวตั้ง", zh: "竖版", vi: "Dọc", id: "Tegak", ms: "Tegak" } },
  { id: "landscape", label: { my: "အလျားလိုက်", en: "Landscape", shn: "ၼွၼ်း", kac: "Galeng ai", th: "แนวนอน", zh: "横版", vi: "Ngang", id: "Mendatar", ms: "Mendatar" } },
  { id: "paper", label: { my: "စက္ကူ (A4 · A3)", en: "Paper (A4 · A3)", shn: "ၸေႈ (A4 · A3)", kac: "Laika (A4 · A3)", th: "กระดาษ (A4 · A3)", zh: "纸张 (A4 · A3)", vi: "Giấy (A4 · A3)", id: "Kertas (A4 · A3)", ms: "Kertas (A4 · A3)" } },
  { id: "social", label: { my: "ဖုန်း / social", en: "Screen & social", shn: "ၾူၼ်း", kac: "Screen", th: "หน้าจอ / โซเชียล", zh: "屏幕 / 社交", vi: "Màn hình / mạng xã hội", id: "Layar / sosial", ms: "Skrin / sosial" } },
  { id: "custom", label: { my: "ကိုယ်ပိုင်", en: "Custom", shn: "ႁင်းၵူၺ်း", kac: "Tinang", th: "กำหนดเอง", zh: "自定义", vi: "Tùy chỉnh", id: "Khusus", ms: "Tersuai" } }
];

/* ---------------------------------------------------------------------------
   TEXT ROLES — what a line is for. Size is a fraction of the page's SHORT
   edge, so a title keeps its proportion at every album size.
   --------------------------------------------------------------------------- */
const ROLES = [
  { id: "title", size: 0.075, weight: 700, track: 0.02, caps: false, label: { my: "ခေါင်းစဉ်", en: "Title", shn: "ႁူဝ်ၶေႃႈ", kac: "Baw", th: "หัวเรื่อง", zh: "标题", vi: "Tiêu đề", id: "Judul", ms: "Tajuk" } },
  { id: "subtitle", size: 0.042, weight: 400, track: 0.08, caps: true, label: { my: "ခေါင်းစဉ်ခွဲ", en: "Subtitle", shn: "ႁူဝ်ၶေႃႈလဵၵ်ႉ", kac: "Baw kachyi", th: "หัวเรื่องรอง", zh: "副标题", vi: "Phụ đề", id: "Subjudul", ms: "Subtajuk" } },
  { id: "names", size: 0.055, weight: 400, track: 0.04, caps: false, label: { my: "နာမည်", en: "Names", shn: "ၸိုဝ်ႈ", kac: "Mying", th: "ชื่อ", zh: "姓名", vi: "Tên", id: "Nama", ms: "Nama" } },
  { id: "date", size: 0.030, weight: 400, track: 0.12, caps: true, label: { my: "ရက်စွဲ", en: "Date", shn: "ဝၼ်းထီႉ", kac: "Shani", th: "วันที่", zh: "日期", vi: "Ngày", id: "Tanggal", ms: "Tarikh" } },
  { id: "quote", size: 0.034, weight: 400, track: 0.01, caps: false, label: { my: "ကိုးကား", en: "Quote", shn: "ၶေႃႈဢၢင်ႈ", kac: "Ga shaga", th: "คำคม", zh: "引言", vi: "Trích dẫn", id: "Kutipan", ms: "Petikan" } },
  { id: "caption", size: 0.024, weight: 400, track: 0.06, caps: false, label: { my: "ခေါင်းစဉ်ငယ်", en: "Caption", shn: "ၶေႃႈမၢႆတွင်း", kac: "Ga kachyi", th: "คำบรรยาย", zh: "说明", vi: "Chú thích", id: "Keterangan", ms: "Keterangan" } },
  { id: "folio", size: 0.020, weight: 400, track: 0.10, caps: false, label: { my: "စာမျက်နှာ", en: "Page number", shn: "ၼႃႈလိၵ်ႈ", kac: "Laika shara", th: "เลขหน้า", zh: "页码", vi: "Số trang", id: "Nomor halaman", ms: "Nombor halaman" } }
];

/* ---------------------------------------------------------------------------
   THE RHYTHM — how many photos each spread gets when the auto-flow lays an
   album out. The research behind this wave is unambiguous: two to four photos
   a spread is what reads as expensive, and every spread wants one photo that
   is clearly the subject. So the cycle opens on a single full page and never
   runs two crowded spreads back to back.
   --------------------------------------------------------------------------- */
const RHYTHM = [1, 3, 2, 4, 1, 2, 5, 3, 1, 4, 2, 6, 1, 3, 2, 4];

const DATA = {
  v: 1,
  bleedMm: 3,
  gutterMm: 5,
  gapFrac: G,
  sizes: SIZES,
  sizeGroups: SIZE_GROUPS,
  fams: FAMS,
  templates: TEMPLATES,
  roles: ROLES,
  rhythm: RHYTHM
};

/* ---- checks the generator runs on itself ------------------------------- */
function check() {
  const ids = {};
  DATA.templates.forEach(function (t) {
    if (ids[t.id]) throw new Error("duplicate template id " + t.id);
    ids[t.id] = 1;
    if (!FAMS[t.fam]) throw new Error(t.id + ": no family name for " + t.fam);
    if (t.cells.length !== t.n) throw new Error(t.id + ": n=" + t.n + " but " + t.cells.length + " cells");
    t.cells.concat(t.texts).forEach(function (c, i) {
      ["x", "y", "w", "h"].forEach(function (k) {
        if (typeof c[k] !== "number" || !isFinite(c[k])) throw new Error(t.id + " cell " + i + ": " + k + " is not a number");
      });
      if (c.w <= 0 || c.h <= 0) throw new Error(t.id + " cell " + i + ": zero or negative size");
      /* a rectangle may touch an edge but never leave the safe area */
      if (c.x < -1e-9 || c.y < -1e-9 || c.x + c.w > 1 + 1e-9 || c.y + c.h > 1 + 1e-9) {
        throw new Error(t.id + " cell " + i + ": outside the safe area (" + [c.x, c.y, c.w, c.h].join(",") + ")");
      }
    });
    t.texts.forEach(function (s) {
      if (!ROLES.some(function (r) { return r.id === s.role; })) throw new Error(t.id + ": unknown text role " + s.role);
    });
  });
  for (let n = 1; n <= 6; n++) {
    const have = DATA.templates.filter(function (t) { return t.n === n; }).length;
    if (have < 10) throw new Error("only " + have + " templates hold " + n + " photo(s); every count needs at least ten");
  }
  const sizeIds = {};
  DATA.sizes.forEach(function (s) {
    if (sizeIds[s.id]) throw new Error("duplicate size id " + s.id);
    sizeIds[s.id] = 1;
    if (!(s.w > 0 && s.h > 0)) throw new Error(s.id + ": bad dimensions");
    if (!SIZE_GROUPS.some(function (g) { return g.id === s.group; })) throw new Error(s.id + ": unknown group " + s.group);
  });
  const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
  function nine(o, what) { LANGS.forEach(function (l) { if (!o || typeof o[l] !== "string" || !o[l]) throw new Error(what + ": missing " + l); }); }
  Object.keys(FAMS).forEach(function (k) { nine(FAMS[k], "family " + k); });
  SIZE_GROUPS.forEach(function (g) { nine(g.label, "size group " + g.id); });
  ROLES.forEach(function (r) { nine(r.label, "role " + r.id); });
  /* a family nobody uses is a translation nobody reads */
  Object.keys(FAMS).forEach(function (k) {
    if (!DATA.templates.some(function (t) { return t.fam === k; })) throw new Error("family " + k + " is named but no template uses it");
  });
}

function round(o) {
  return JSON.parse(JSON.stringify(o, function (k, v) {
    return (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;
  }));
}

function build(opts) {
  check();
  const text = "window.HNK_ALBUM=" + JSON.stringify(round(DATA)) + ";\n";
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
  const changed = cur !== text;
  if (changed && !(opts && opts.dry)) fs.writeFileSync(OUT, text);
  return { changed: changed, bytes: text.length, templates: DATA.templates.length, sizes: DATA.sizes.length, text: text, data: round(DATA) };
}

module.exports = { build, DATA, G, panes, grid, mosaic, bigGrid, full, inset, band };

if (require.main === module) {
  const r = build();
  console.log("build_album_data: " + r.templates + " templates, " + r.sizes + " sizes, " + r.bytes + " bytes — " + (r.changed ? "wrote docs/app/data/album.js" : "nothing changed"));
}
