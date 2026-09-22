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
/* 6.104.0 wave B — the type. FONTS owns the twenty families, the twelve pairings
   and the role→side map, because it also owns the bytes under docs/app/lib/fonts/;
   folding its tables in here rather than re-typing them is what makes it impossible
   for the app to offer a face whose woff2 is not on disk (dataTables() verifies the
   record against the folder before it hands anything back). */
const FONTS = require("./build_album_fonts.js");
/* 6.121.0 wave F — the story lines: four headline sets and two body sentences an occasion, in
   nine languages, that the design engine sets on the pages after the opener. In their own
   file because they are prose, not geometry, and read best kept apart from the shapes. */
const { STORIES } = require("./lib/album_stories.js");
/* 6.122.0 wave G — the ornament and overlay catalogue (the PNG masks themselves are drawn by
   tools/build_album_ornaments.js and pinned by docs/app/lib/album/ornaments.json) */
const ORN = require("./lib/album_ornaments.js");
/* 6.125.0 wave I — the standee sizes and designs, the marks, the text styles and the template
   library's groups and limits (the owner's SS Album recordings), in their own file for the same
   reason the stories are: they are tables, and they read best kept apart from the shapes. */
const WI = require("./lib/album_wave_i.js");

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
  /* 6.102.0 — the column starts after whichever photo is actually to its left.
     This read `gw + G` for both, so with the big photo on the LEFT the column of
     small ones began at the GRID's own width (0.414) while the big photo ran to
     0.572 — every "big left" template printed its small photos over the big one.
     A layout whose cells overlap is not a layout, and on a printed spread it is a
     photograph with another photograph on top of it. */
  const gx = side === "left" ? bw + G : 0;
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
].concat(WI.STANDEE_SIZES);   /* 6.125.0 wave I — the four standee sheets, in cm at 150 dpi */

const SIZE_GROUPS = [
  { id: "spread", label: { my: "ကျယ်ပြန့် (flush-mount)", en: "Panoramic spread", shn: "ၵႂၢင်ႈ", kac: "Galu ai", th: "สเปรดพาโนรามา", zh: "全景跨页", vi: "Trang đôi toàn cảnh", id: "Bentang panorama", ms: "Bentang panorama" } },
  { id: "square", label: { my: "လေးထောင့်", en: "Square", shn: "ၸဵင်ႇသီႇ", kac: "Malut", th: "สี่เหลี่ยมจัตุรัส", zh: "正方形", vi: "Vuông", id: "Persegi", ms: "Persegi" } },
  { id: "portrait", label: { my: "ဒေါင်လိုက်", en: "Upright", shn: "တင်ႈ", kac: "Tsap ai", th: "แนวตั้ง", zh: "竖版", vi: "Dọc", id: "Tegak", ms: "Tegak" } },
  { id: "landscape", label: { my: "အလျားလိုက်", en: "Landscape", shn: "ၼွၼ်း", kac: "Galeng ai", th: "แนวนอน", zh: "横版", vi: "Ngang", id: "Mendatar", ms: "Mendatar" } },
  { id: "paper", label: { my: "စက္ကူ (A4 · A3)", en: "Paper (A4 · A3)", shn: "ၸေႈ (A4 · A3)", kac: "Laika (A4 · A3)", th: "กระดาษ (A4 · A3)", zh: "纸张 (A4 · A3)", vi: "Giấy (A4 · A3)", id: "Kertas (A4 · A3)", ms: "Kertas (A4 · A3)" } },
  WI.STANDEE_GROUP,   /* 6.125.0 wave I — the upright standee, before the screen sizes */
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


/* ---------------------------------------------------------------------------
   THE INKS — the colour a printed line is actually set in. Six, not a colour
   wheel: near-black for paper, white for a line laid over a dark photograph,
   and four the studio's own albums use. A page that offers only black puts the
   caption on a night portrait where nobody can read it.

   They live here rather than in the app (where wave B wrote them) because an
   occasion below names one of them as its default, and a default nothing ships
   is a page whose words come out in a colour the picker cannot show.
   --------------------------------------------------------------------------- */
const INKS = ["#1b1b1f", "#ffffff", "#6b6b73", "#8a6a3b", "#b08d57", "#7a2f36"];

/* ---------------------------------------------------------------------------
   THE OCCASIONS (6.105.0 wave C)

   Wave A gave a student one page at a time and wave B gave that page its type.
   What neither gave is the thing a studio is actually paid for: an ALBUM —
   forty photographs off a card, in an order, on pages that do not all look the
   same, opening on a title in the student's own language.

   An occasion is the whole recipe for one: a pairing and an ink from wave B, a
   print size, starter words, and a PLAN — how many photographs each page takes,
   in order, cycling. The plan is the part that reads as expensive. The research
   is unambiguous and the RHYTHM comment above says it: two to four photographs
   a page, one clear subject on each, never two crowded pages in a row. A wedding
   plan is fuller than a newborn plan because a wedding day is fuller than a
   newborn morning, and that is a decision about photography, not about code.

   The starter words are STARTERS. Every one is a line the student is expected
   to type over — they are here so a page opens with something set in the album's
   own face, in the language the student reads, instead of an empty box that
   tells them nothing about what the page will look like.
   --------------------------------------------------------------------------- */
function occ(id, pair, ink, size, plan, name, note, words) {
  return { id: id, pair: pair, ink: ink, size: size, plan: plan, name: name, note: note, words: words };
}

const OCCASIONS = [
  occ("prewed", "wedding", "#1b1b1f", "12x36", [2, 1, 3, 2, 4, 1, 2, 3],
    { my: "မင်္ဂလာမတိုင်မီ", en: "Pre-wedding", shn: "ဢွၼ်ၼႃႈမင်ႇၵလႃႇ", kac: "Hkungran shawng", th: "พรีเวดดิ้ง", zh: "婚纱照", vi: "Chụp ảnh cưới", id: "Pra-nikah", ms: "Pra-perkahwinan" },
    { my: "နှစ်ယောက်တည်း ဇာတ်လမ်းတစ်ပုဒ်", en: "Two people, one story", shn: "သွင်ၵေႃႉ လွင်ႈလဵဝ်", kac: "Masha lahkawng, maumwi langai", th: "สองคน หนึ่งเรื่องราว", zh: "两个人，一个故事", vi: "Hai người, một câu chuyện", id: "Dua orang, satu cerita", ms: "Dua orang, satu cerita" },
    {
      title: { my: "ကျွန်ုပ်တို့၏ အချစ်ဇာတ်လမ်း", en: "Our Love Story", shn: "လွင်ႈႁၵ်ႉႁဝ်း", kac: "Anhte a tsawra maumwi", th: "เรื่องราวความรักของเรา", zh: "我们的爱情故事", vi: "Chuyện tình của chúng tôi", id: "Kisah Cinta Kami", ms: "Kisah Cinta Kami" },
      subtitle: { my: "မင်္ဂလာမတိုင်မီ", en: "PRE-WEDDING", shn: "ဢွၼ်ၼႃႈမင်ႇၵလႃႇ", kac: "Hkungran shawng", th: "พรีเวดดิ้ง", zh: "婚纱照", vi: "Trước ngày cưới", id: "Pra-nikah", ms: "Pra-perkahwinan" },
      quote: { my: "စတင်ခဲ့သော နေ့မှစ၍", en: "From the day it began", shn: "တႄႇမိူဝ်ႈဝၼ်းၼၼ်ႉမႃး", kac: "Hpang shawng na shani kaw na", th: "ตั้งแต่วันที่เริ่มต้น", zh: "从开始的那一天起", vi: "Từ ngày bắt đầu", id: "Sejak hari itu dimulai", ms: "Sejak hari ia bermula" }
    }),

  occ("wedding", "classic", "#1b1b1f", "12x36", [1, 2, 3, 2, 4, 3, 6, 2],
    { my: "မင်္ဂလာနေ့", en: "Wedding day", shn: "ဝၼ်းမင်ႇၵလႃႇ", kac: "Hkungran shani", th: "วันแต่งงาน", zh: "婚礼当天", vi: "Ngày cưới", id: "Hari pernikahan", ms: "Hari perkahwinan" },
    { my: "တစ်နေ့တာ အစအဆုံး", en: "One day, beginning to end", shn: "ဝၼ်းလဵဝ် တႄႇတေႃႇသုတ်း", kac: "Shani langai, hpang shawng kaw na htum ten", th: "หนึ่งวัน ตั้งแต่ต้นจนจบ", zh: "一整天，从头到尾", vi: "Một ngày, từ đầu đến cuối", id: "Satu hari, dari awal sampai akhir", ms: "Satu hari, dari mula hingga akhir" },
    {
      title: { my: "မင်္ဂလာပါ", en: "The Wedding", shn: "မင်ႇၵလႃႇ", kac: "Hkungran", th: "งานแต่งงาน", zh: "婚礼", vi: "Lễ Cưới", id: "Pernikahan", ms: "Perkahwinan" },
      subtitle: { my: "မင်္ဂလာနေ့", en: "WEDDING DAY", shn: "ဝၼ်းမင်ႇၵလႃႇ", kac: "Hkungran shani", th: "วันแต่งงาน", zh: "婚礼当天", vi: "Ngày cưới", id: "Hari pernikahan", ms: "Hari perkahwinan" },
      quote: { my: "ယနေ့မှစ၍ အစဉ်အမြဲ", en: "From today, always", shn: "တႄႇဝၼ်းမိူဝ်ႈၼႆႉ ၵူႈမိူဝ်ႈ", kac: "Dai ni kaw na, galoi mung", th: "จากวันนี้ ตลอดไป", zh: "从今天起，直到永远", vi: "Từ hôm nay, mãi mãi", id: "Mulai hari ini, selamanya", ms: "Mulai hari ini, selamanya" }
    }),

  occ("solo", "editorial", "#1b1b1f", "8x12", [1, 1, 2, 3, 1, 2, 4, 1],
    { my: "တစ်ကိုယ်တော် ပုံတွဲ", en: "Portrait", shn: "ႁၢင်ႈၵေႃႉလဵဝ်", kac: "Masha langai a sumla", th: "ภาพบุคคล", zh: "个人写真", vi: "Ảnh cá nhân", id: "Potret", ms: "Potret" },
    { my: "လူတစ်ယောက်၊ အလင်းတစ်မျိုး", en: "One person, one light", shn: "ၵေႃႉလဵဝ် ဢွင်ႈလဵဝ်", kac: "Masha langai, nhtoi langai", th: "หนึ่งคน หนึ่งแสง", zh: "一个人，一种光", vi: "Một người, một thứ ánh sáng", id: "Satu orang, satu cahaya", ms: "Satu orang, satu cahaya" },
    {
      title: { my: "ပုံရိပ်", en: "Portrait", shn: "ႁၢင်ႈ", kac: "Sumla", th: "ภาพบุคคล", zh: "写真", vi: "Chân dung", id: "Potret", ms: "Potret" },
      subtitle: { my: "တစ်ကိုယ်တော်", en: "A PORTRAIT SESSION", shn: "ၵေႃႉလဵဝ်", kac: "Masha langai", th: "เซสชันภาพบุคคล", zh: "个人写真", vi: "Buổi chụp cá nhân", id: "Sesi potret", ms: "Sesi potret" },
      quote: { my: "မိမိကိုယ်မိမိ", en: "Just as you are", shn: "မိူၼ်ၼင်ႇတူဝ်ၸဝ်ႈၵဝ်ႇ", kac: "Nang nga ai hte maren", th: "เป็นตัวคุณเอง", zh: "就是你本来的样子", vi: "Đúng như bạn vốn là", id: "Apa adanya dirimu", ms: "Seperti dirimu sendiri" }
    }),

  occ("family", "heritage", "#1b1b1f", "12x12", [1, 3, 2, 4, 2, 6, 3, 2],
    { my: "မိသားစု", en: "Family", shn: "ပီႈၼွင်ႉ", kac: "Dinghku", th: "ครอบครัว", zh: "全家福", vi: "Gia đình", id: "Keluarga", ms: "Keluarga" },
    { my: "အားလုံး တစ်နေရာတည်းမှာ", en: "Everyone in one place", shn: "ၵူႈၵေႃႉ တီႈလဵဝ်ၵၼ်", kac: "Yawng langai shara hta", th: "ทุกคนอยู่ในที่เดียวกัน", zh: "所有人都在一起", vi: "Tất cả ở cùng một nơi", id: "Semua di satu tempat", ms: "Semua di satu tempat" },
    {
      title: { my: "ကျွန်ုပ်တို့၏ မိသားစု", en: "Our Family", shn: "ပီႈၼွင်ႉႁဝ်း", kac: "Anhte a dinghku", th: "ครอบครัวของเรา", zh: "我们的家", vi: "Gia Đình Chúng Ta", id: "Keluarga Kami", ms: "Keluarga Kami" },
      subtitle: { my: "မိသားစု ပုံတွဲ", en: "FAMILY ALBUM", shn: "ပပ်ႉႁၢင်ႈပီႈၼွင်ႉ", kac: "Dinghku laika buk", th: "อัลบั้มครอบครัว", zh: "家庭相册", vi: "Album gia đình", id: "Album keluarga", ms: "Album keluarga" },
      quote: { my: "အိမ်ဆိုတာ လူတွေပါ", en: "Home is the people", shn: "ႁိူၼ်းၼႆႉ ပဵၼ်ၵူၼ်း", kac: "Nta gaw masha ni re", th: "บ้านคือผู้คน", zh: "家就是家人", vi: "Nhà là những con người", id: "Rumah adalah orang-orangnya", ms: "Rumah ialah orangnya" }
    }),

  occ("baby", "soft", "#6b6b73", "10x10", [1, 2, 4, 1, 3, 2, 4, 2],
    { my: "ကလေးငယ်", en: "Baby", shn: "လုၵ်ႈဢွၼ်ႇ", kac: "Ma kasha", th: "เบบี้", zh: "宝宝", vi: "Em bé", id: "Bayi", ms: "Bayi" },
    { my: "ပထမဆုံး တစ်နှစ်", en: "The first year", shn: "ပီႁႅၵ်ႈ", kac: "Shawng nnan a laning", th: "ปีแรก", zh: "第一年", vi: "Năm đầu tiên", id: "Tahun pertama", ms: "Tahun pertama" },
    {
      title: { my: "ပထမဆုံး တစ်နှစ်", en: "The First Year", shn: "ပီႁႅၵ်ႈ", kac: "Shawng nnan a laning", th: "ปีแรก", zh: "第一年", vi: "Năm Đầu Tiên", id: "Tahun Pertama", ms: "Tahun Pertama" },
      subtitle: { my: "ကလေးငယ် ပုံတွဲ", en: "BABY ALBUM", shn: "ပပ်ႉႁၢင်ႈလုၵ်ႈဢွၼ်ႇ", kac: "Ma kasha laika buk", th: "อัลบั้มเบบี้", zh: "宝宝相册", vi: "Album em bé", id: "Album bayi", ms: "Album bayi" },
      quote: { my: "နေ့တိုင်း အသစ်တစ်ခု", en: "Something new every day", shn: "ၵူႈဝၼ်း မီးလွင်ႈမႂ်ႇ", kac: "Shani shagu nnan langai", th: "ทุกวันมีสิ่งใหม่", zh: "每天都有新变化", vi: "Mỗi ngày một điều mới", id: "Sesuatu yang baru setiap hari", ms: "Sesuatu yang baharu setiap hari" }
    }),

  occ("newborn", "quiet", "#6b6b73", "10x10", [1, 1, 2, 3, 1, 2, 3, 1],
    { my: "မွေးကင်းစ", en: "Newborn", shn: "လုၵ်ႈဢွၼ်ႇၵိူတ်ႇမႂ်ႇ", kac: "Ma shangai nnan", th: "ทารกแรกเกิด", zh: "新生儿", vi: "Trẻ sơ sinh", id: "Bayi baru lahir", ms: "Bayi baharu lahir" },
    { my: "ပထမဆုံး ရက်သတ္တပတ်", en: "The first days", shn: "ဝၼ်းႁႅၵ်ႈ", kac: "Shawng nnan a shani ni", th: "วันแรก ๆ", zh: "最初的日子", vi: "Những ngày đầu tiên", id: "Hari-hari pertama", ms: "Hari-hari pertama" },
    {
      title: { my: "ကြိုဆိုပါတယ်", en: "Welcome", shn: "ႁပ်ႉတွၼ်ႈ", kac: "Kabu hkap tau ga", th: "ยินดีต้อนรับ", zh: "欢迎来到这个世界", vi: "Chào Con", id: "Selamat Datang", ms: "Selamat Datang" },
      subtitle: { my: "မွေးကင်းစ", en: "NEWBORN", shn: "ၵိူတ်ႇမႂ်ႇ", kac: "Shangai nnan", th: "แรกเกิด", zh: "新生", vi: "Sơ sinh", id: "Baru lahir", ms: "Baharu lahir" },
      quote: { my: "သေးငယ်၍ တိတ်ဆိတ်သော", en: "Small and quiet", shn: "လဵၵ်ႉလႄႈ ႁိမ်း", kac: "Kachyi nna ngwi pyaw ai", th: "เล็กและเงียบ", zh: "小小的，安安静静的", vi: "Nhỏ bé và yên bình", id: "Kecil dan tenang", ms: "Kecil dan tenang" }
    }),

  occ("kid", "modern", "#1b1b1f", "11x85", [4, 2, 5, 3, 6, 2, 4, 3],
    { my: "ကလေးများ", en: "Kids", shn: "လုၵ်ႈဢွၼ်ႇ", kac: "Ma ni", th: "เด็ก ๆ", zh: "儿童", vi: "Trẻ em", id: "Anak-anak", ms: "Kanak-kanak" },
    { my: "တစ်ခဏမှ မငြိမ်", en: "Never still for a second", shn: "ဢမ်ႇယူႇၼိမ်သေဝၼ်း", kac: "Ndai ten hta n hkring ai", th: "ไม่เคยอยู่นิ่ง", zh: "一刻也停不下来", vi: "Không lúc nào chịu ngồi yên", id: "Tak pernah diam sedetik pun", ms: "Tak pernah duduk diam" },
    {
      title: { my: "ကစားရတဲ့ နေ့ရက်တွေ", en: "Days of Play", shn: "ဝၼ်းလဵၼ်ႈ", kac: "Gasup ai shani ni", th: "วันแห่งการเล่น", zh: "玩耍的日子", vi: "Những Ngày Rong Chơi", id: "Hari-hari Bermain", ms: "Hari-hari Bermain" },
      subtitle: { my: "ကလေးများ", en: "KIDS", shn: "လုၵ်ႈဢွၼ်ႇ", kac: "Ma ni", th: "เด็ก ๆ", zh: "儿童", vi: "Trẻ em", id: "Anak-anak", ms: "Kanak-kanak" },
      quote: { my: "ရယ်မောသံ တစ်မျက်နှာစာ", en: "A page of laughing", shn: "ၼႃႈလိၵ်ႈသဵင်ႁဵၼ်း", kac: "Mani ai laika shara langai", th: "หน้าที่เต็มไปด้วยเสียงหัวเราะ", zh: "一整页的笑声", vi: "Một trang đầy tiếng cười", id: "Satu halaman penuh tawa", ms: "Satu halaman penuh ketawa" }
    }),

  occ("birthday", "deco", "#8a6a3b", "12x12", [1, 4, 3, 6, 2, 5, 3, 4],
    { my: "မွေးနေ့", en: "Birthday", shn: "ဝၼ်းၵိူတ်ႇ", kac: "Shangai shani", th: "วันเกิด", zh: "生日", vi: "Sinh nhật", id: "Ulang tahun", ms: "Hari jadi" },
    { my: "တစ်နှစ်တစ်ခါ", en: "Once a year", shn: "ပီလႂ်ပွၵ်ႈ", kac: "Laning mi hta lang mi", th: "ปีละครั้ง", zh: "一年一次", vi: "Mỗi năm một lần", id: "Setahun sekali", ms: "Setahun sekali" },
    {
      title: { my: "မွေးနေ့ မင်္ဂလာပါ", en: "Happy Birthday", shn: "ဝၼ်းၵိူတ်ႇမီးမင်ႇၵလႃႇ", kac: "Shangai shani kabu gara", th: "สุขสันต์วันเกิด", zh: "生日快乐", vi: "Chúc Mừng Sinh Nhật", id: "Selamat Ulang Tahun", ms: "Selamat Hari Jadi" },
      subtitle: { my: "မွေးနေ့ပွဲ", en: "BIRTHDAY", shn: "ပွႆးဝၼ်းၵိူတ်ႇ", kac: "Shangai shani poi", th: "งานวันเกิด", zh: "生日派对", vi: "Tiệc sinh nhật", id: "Pesta ulang tahun", ms: "Pesta hari jadi" },
      quote: { my: "ဆန္ဒတစ်ခု ပြုပါ", en: "Make a wish", shn: "ဢဝ်ၵၢင်ၸႂ်သေ", kac: "Myit mada langai galaw u", th: "ขอพรสักข้อ", zh: "许个愿吧", vi: "Ước một điều", id: "Buatlah permohonan", ms: "Buatlah satu hajat" }
    }),

  occ("event", "roman", "#1b1b1f", "11x85", [6, 4, 2, 5, 3, 6, 4, 5],
    { my: "ပွဲအခမ်းအနား", en: "Events", shn: "ပွႆး", kac: "Poi", th: "งานอีเวนต์", zh: "活动", vi: "Sự kiện", id: "Acara", ms: "Acara" },
    { my: "တစ်ညလုံး၊ လူတိုင်း", en: "The whole night, everyone", shn: "တင်းၶိုၼ်း ၵူႈၵေႃႉ", kac: "Shana ting, yawng", th: "ทั้งคืน ทุกคน", zh: "整个晚上，每一个人", vi: "Cả buổi tối, tất cả mọi người", id: "Semalam penuh, semua orang", ms: "Sepanjang malam, semua orang" },
    {
      title: { my: "ပွဲတော်", en: "The Event", shn: "ပွႆး", kac: "Poi", th: "งาน", zh: "活动纪实", vi: "Sự Kiện", id: "Acara", ms: "Acara" },
      subtitle: { my: "ပွဲအခမ်းအနား", en: "EVENT COVERAGE", shn: "ၵဵပ်းႁၢင်ႈပွႆး", kac: "Poi a sumla", th: "บันทึกงาน", zh: "活动记录", vi: "Ghi hình sự kiện", id: "Liputan acara", ms: "Liputan acara" },
      quote: { my: "ကျင်းပခဲ့သော ည", en: "The night it happened", shn: "ၶိုၼ်းၼၼ်ႉ", kac: "Byin ai shana", th: "คืนที่มันเกิดขึ้น", zh: "那个夜晚", vi: "Đêm ấy", id: "Malam itu terjadi", ms: "Malam ia berlaku" }
    })
];

const TYPE = FONTS.dataTables();

const DATA = {
  v: 5,
  bleedMm: 3,
  gutterMm: 5,
  gapFrac: G,
  sizes: SIZES,
  sizeGroups: SIZE_GROUPS,
  fams: FAMS,
  templates: TEMPLATES,
  roles: ROLES,
  rhythm: RHYTHM,
  /* wave B */
  fonts: TYPE.fonts,
  pairs: TYPE.pairs,
  ranges: TYPE.ranges,
  roleSide: TYPE.roleSide,
  fontDir: "lib/fonts/",
  defPair: "classic",
  inks: INKS,
  /* wave C */
  occasions: OCCASIONS,
  defOcc: "wedding",
  maxAlbum: 40,
  /* wave F */
  stories: STORIES,
  /* the six looks a photograph may wear inside its frame; the module maps each to a filter
     and to the same arithmetic over pixels where the renderer has no filter of its own */
  fx: ["", "bw", "sepia", "warm", "cool", "fade"],
  /* the three papers a page may be printed on — white, the cream the reference album
     designer sets its spreads on, and black for a dark book */
  papers: ["#ffffff", "#f6f1e7", "#141416"],
  /* wave G — twenty-four ornaments in six families (alpha masks the module tints), five page
     overlays with the blend each is laid on with and the three strengths the chips offer, and
     the five tints an ornament may wear */
  orn: ORN.catalogue().orn,
  ornFamilies: ORN.catalogue().ornFamilies,
  ovl: ORN.catalogue().ovl,
  ovlAmounts: ORN.catalogue().ovlAmounts,
  tints: ORN.catalogue().tints,
  ornDir: "lib/album/",
  /* wave I — the template library: twelve standee designs and the words they set, the two mark
     families (date blocks · monograms), twelve text styles, the default groups and the limits */
  standees: WI.STANDEES,
  standeeWords: WI.STANDEE_WORDS,
  marks: WI.MARKS,
  textStyles: WI.TEXT_STYLES,
  libGroups: WI.LIB_GROUPS,
  lib: WI.LIB
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

  /* ---- wave B: the type ------------------------------------------------- */
  const fontIds = {};
  DATA.fonts.forEach(function (f) {
    if (fontIds[f.id]) throw new Error("duplicate font id " + f.id);
    fontIds[f.id] = f;
    if (!f.name || !f.css || !f.stack || f.stack.indexOf('"' + f.css + '"') !== 0) throw new Error(f.id + ": the stack must open with its own CSS handle");
    if (f.css.indexOf(f.name) < 0) throw new Error(f.id + ": the handle must carry the family's real name");
    if (!f.files.length) throw new Error(f.id + ": no files");
    f.files.forEach(function (x) {
      if (!DATA.ranges[x.r]) throw new Error(f.id + ": " + x.f + " names a unicode-range that is not in the table");
      if (f.w.indexOf(x.w) < 0) throw new Error(f.id + ": " + x.f + " is a weight this family does not declare");
    });
    /* every weight a role can ask for must exist, or the browser synthesises it:
       400 is the floor and 700 is optional, and drawText() clamps to what is here */
    if (f.w.indexOf(400) < 0) throw new Error(f.id + ": every family must ship 400");
  });
  DATA.pairs.forEach(function (p) {
    if (!fontIds[p.t]) throw new Error("pairing " + p.id + ": unknown title font " + p.t);
    if (!fontIds[p.b]) throw new Error("pairing " + p.id + ": unknown body font " + p.b);
    nine(p.label, "pairing " + p.id);
  });
  if (!DATA.pairs.some(function (p) { return p.id === DATA.defPair; })) throw new Error("defPair " + DATA.defPair + " is not one of the pairings");
  /* A FALLBACK CHAIN THAT NAMES A FAMILY WE DO NOT SHIP is a blank line on a
     printed page — the one failure mode this whole wave exists to prevent. The
     chain is read by id (fb) rather than by parsing the stack, because the tail
     of every stack is a CSS generic ("Helvetica Neue", Georgia, cursive …) that
     the device supplies and this studio must not claim to ship. */
  DATA.fonts.forEach(function (f) {
    let at = 0;
    (f.fb || []).forEach(function (id) {
      const o = fontIds[id];
      if (!o) throw new Error(f.id + ": its fallback chain names " + id + ", which this studio does not ship");
      if (o.id === f.id) throw new Error(f.id + ": a family may not fall back to itself");
      const k = f.stack.indexOf('"' + o.css + '"');
      if (k < 0) throw new Error(f.id + ": " + o.name + " is in the chain but not in the stack");
      if (k < at) throw new Error(f.id + ": the stack does not keep the chain's order at " + o.name);
      at = k;
    });
    /* a Latin face must be able to set Burmese, or a Burmese title set in it
       prints as empty boxes — every chain ends at a Myanmar face */
    if (f.script !== "my" && !(f.fb || []).some(function (id) { return fontIds[id] && fontIds[id].script === "my"; })) {
      throw new Error(f.id + ": nothing in its chain can set Burmese");
    }
  });
  /* every role must know which side of a pairing it is set in */
  ROLES.forEach(function (r) { if (DATA.roleSide[r.id] !== "t" && DATA.roleSide[r.id] !== "b") throw new Error("role " + r.id + ": no side in roleSide"); });
  Object.keys(DATA.roleSide).forEach(function (k) { if (!ROLES.some(function (r) { return r.id === k; })) throw new Error("roleSide names " + k + ", which is not a role"); });
  /* at least one pairing must be able to set Burmese: this studio's students
     write in it, and a wave of twenty Latin faces that cannot would be a joke */
  const myPair = DATA.pairs.filter(function (p) { return fontIds[p.t].script === "my" && fontIds[p.b].script === "my"; });
  if (myPair.length < 2) throw new Error("only " + myPair.length + " pairing(s) set Burmese in both faces; the students write in it");

  /* ---- wave C: the occasions --------------------------------------------- */
  const HEX = /^#[0-9a-f]{6}$/;
  INKS.forEach(function (c) { if (!HEX.test(c)) throw new Error("ink " + c + " is not a six-digit hex colour"); });
  if (new Set(INKS).size !== INKS.length) throw new Error("the ink row repeats a colour");
  const occIds = {};
  DATA.occasions.forEach(function (o) {
    if (occIds[o.id]) throw new Error("duplicate occasion id " + o.id);
    occIds[o.id] = 1;
    nine(o.name, "occasion " + o.id + " name");
    nine(o.note, "occasion " + o.id + " note");
    ["title", "subtitle", "quote"].forEach(function (r) {
      if (!ROLES.some(function (x) { return x.id === r; })) throw new Error("occasion words name role " + r + ", which is not a role");
      nine(o.words[r], "occasion " + o.id + " " + r);
    });
    /* every default an occasion names must be something the studio actually ships:
       a pairing whose two faces are on disk, an ink the picker can show, and a size
       the picker can select. A default that is not offered is a page the student
       cannot get back to once they touch the control. */
    if (!DATA.pairs.some(function (p) { return p.id === o.pair; })) throw new Error(o.id + ": pairing " + o.pair + " is not shipped");
    if (INKS.indexOf(o.ink) < 0) throw new Error(o.id + ": ink " + o.ink + " is not one the picker offers");
    if (!sizeIds[o.size]) throw new Error(o.id + ": size " + o.size + " is not a size");
    if (!o.plan.length) throw new Error(o.id + ": an occasion with no plan lays out no album");
    o.plan.forEach(function (n) {
      if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error(o.id + ": a page of " + n + " photo(s) — the templates hold one to six");
    });
    /* a plan that never rests is a plan that prints a contact sheet: at least one
       page in the cycle carries two photographs or fewer. */
    if (!o.plan.some(function (n) { return n <= 2; })) throw new Error(o.id + ": every page in the plan is crowded; one must rest at two photographs or fewer");
  });
  if (DATA.occasions.length < 9) throw new Error("only " + DATA.occasions.length + " occasions; the owner asked for prewedding, solo, family, baby, kid, newborn and events at the least");
  if (!occIds[DATA.defOcc]) throw new Error("defOcc names " + DATA.defOcc + ", which is not an occasion");
  if (!(DATA.maxAlbum >= 12 && DATA.maxAlbum <= 200)) throw new Error("maxAlbum " + DATA.maxAlbum + " is outside what one stored album can carry");
  /* the owner named seven kinds of session by hand; none of them may quietly vanish */
  ["prewed", "solo", "family", "baby", "kid", "newborn", "event"].forEach(function (id) {
    if (!occIds[id]) throw new Error("the owner asked for " + id + " and no occasion carries that id");
  });
  /* ---- wave F: the story lines ------------------------------------------- */
  DATA.occasions.forEach(function (o) {
    const st = DATA.stories[o.id];
    if (!st) throw new Error("occasion " + o.id + " has no story lines");
    if (!(st.lines && st.lines.length >= 4)) throw new Error("occasion " + o.id + ": fewer than four headline sets");
    st.lines.forEach(function (ln, i) { nine(ln.k, o.id + " story " + i + " kicker"); nine(ln.h, o.id + " story " + i + " headline"); });
    if (!(st.body && st.body.length >= 2)) throw new Error("occasion " + o.id + ": fewer than two body lines");
    st.body.forEach(function (b, i) { nine(b, o.id + " body " + i); });
  });
  Object.keys(DATA.stories).forEach(function (id) {
    if (!DATA.occasions.some(function (o) { return o.id === id; })) throw new Error("stories name " + id + ", which is not an occasion");
  });
  if (DATA.fx[0] !== "" || new Set(DATA.fx).size !== DATA.fx.length) throw new Error("the effect row must open with none and repeat nothing");
  DATA.papers.forEach(function (c) { if (!HEX.test(c)) throw new Error("paper " + c + " is not a six-digit hex colour"); });
  if (DATA.papers[0] !== "#ffffff") throw new Error("the first paper must be white — the paper every album before wave F was printed on");
  /* ---- wave G: the ornaments and overlays ----------------------------------- */
  const ornIds = {}, famSeen = {};
  const LIBDIR = path.join(__dirname, "..", "docs", "app", "lib", "album");
  const REC = JSON.parse(fs.readFileSync(path.join(LIBDIR, "ornaments.json"), "utf8"));
  if (DATA.orn.length !== 24) throw new Error("the catalogue carries " + DATA.orn.length + " ornaments, not twenty-four");
  DATA.orn.forEach(function (o) {
    if (!/^[a-z][0-9]$/.test(o.id) || ornIds[o.id]) throw new Error("ornament id " + o.id + " is malformed or repeated");
    ornIds[o.id] = true;
    if (DATA.ornFamilies.indexOf(o.fam) < 0) throw new Error("ornament " + o.id + " names an unknown family " + o.fam);
    famSeen[o.fam] = (famSeen[o.fam] || 0) + 1;
    if (!(o.ar > 0) || !(o.def && o.def.w > 0 && o.def.w <= 1 && o.def.x >= 0 && o.def.x <= 1 && o.def.y >= 0 && o.def.y <= 1)) throw new Error("ornament " + o.id + ": bad aspect or default place");
    if (!fs.existsSync(path.join(LIBDIR, "orn", o.id + ".png"))) throw new Error("ornament " + o.id + " has no mask under docs/app/lib/album/orn");
    if (!REC.files["orn/" + o.id + ".png"]) throw new Error("ornament " + o.id + " is not in ornaments.json");
  });
  DATA.ornFamilies.forEach(function (f) { if (famSeen[f] !== 4) throw new Error("family " + f + " carries " + (famSeen[f] || 0) + " ornaments, not four"); });
  const ovlIds = {};
  DATA.ovl.forEach(function (o) {
    if (ovlIds[o.id]) throw new Error("overlay " + o.id + " repeated"); ovlIds[o.id] = true;
    if (["multiply", "screen", "overlay"].indexOf(o.blend) < 0) throw new Error("overlay " + o.id + " names a blend the module does not draw");
    DATA.ovlAmounts.forEach(function (a) { if (!(o.amounts[a] > 0 && o.amounts[a] <= 1)) throw new Error("overlay " + o.id + " amount " + a + " out of range"); });
    if (!fs.existsSync(path.join(LIBDIR, "ovl", o.id + ".png"))) throw new Error("overlay " + o.id + " has no texture under docs/app/lib/album/ovl");
  });
  Object.keys(DATA.tints).forEach(function (k) { if (!HEX.test(DATA.tints[k])) throw new Error("tint " + k + " is not a six-digit hex colour"); });
  if (DATA.tints.gold !== "#b08d57") throw new Error("the gold tint must be the studio's gold");
  /* ---- wave I: the standees, the marks, the text styles, the library ------- */
  const sdIds = {};
  if (DATA.standees.length !== 12) throw new Error("twelve standee designs, not " + DATA.standees.length);
  DATA.standees.forEach(function (d) {
    if (!/^sd_[a-z0-9]+$/.test(d.id) || sdIds[d.id]) throw new Error("standee id " + d.id + " is malformed or repeated");
    sdIds[d.id] = true;
    if (d.cells.length !== d.n || d.n < 1 || d.n > WI.LIB.maxPhotos) throw new Error(d.id + ": n=" + d.n + " but " + d.cells.length + " cells");
    if (["editorial", "classic", "minimal", "script"].indexOf(d.look) < 0) throw new Error(d.id + ": unknown look " + d.look);
    d.cells.concat(d.texts).forEach(function (c, i) {
      ["x", "y", "w", "h"].forEach(function (k) { if (typeof c[k] !== "number" || !isFinite(c[k])) throw new Error(d.id + " box " + i + ": " + k + " is not a number"); });
      if (c.w <= 0 || c.h <= 0 || c.x < -1e-9 || c.y < -1e-9 || c.x + c.w > 1 + 1e-9 || c.y + c.h > 1 + 1e-9) throw new Error(d.id + " box " + i + ": outside the safe area");
    });
    /* no two frames overlap and no slot sits on a frame: a standee is read from across a room */
    d.cells.forEach(function (a, i) { d.cells.forEach(function (b, j) {
      if (i < j && a.x < b.x + b.w - 1e-9 && a.x + a.w > b.x + 1e-9 && a.y < b.y + b.h - 1e-9 && a.y + a.h > b.y + 1e-9) throw new Error(d.id + ": frames " + i + " and " + j + " overlap");
    }); });
    if (!d.texts.some(function (t) { return t.role === "names"; })) throw new Error(d.id + ": a standee always carries the couple's names");
    d.texts.forEach(function (t) {
      if (!ROLES.some(function (r) { return r.id === t.role; })) throw new Error(d.id + ": unknown text role " + t.role);
      if (t.word && !DATA.standeeWords[t.word]) throw new Error(d.id + ": names a word " + t.word + " the table does not carry");
      d.cells.forEach(function (c, i) { if (t.x < c.x + c.w - 1e-9 && t.x + t.w > c.x + 1e-9 && t.y < c.y + c.h - 1e-9 && t.y + t.h > c.y + 1e-9) throw new Error(d.id + ": slot " + t.role + " sits on frame " + i); });
    });
  });
  Object.keys(DATA.standeeWords).forEach(function (k) { nine(DATA.standeeWords[k], "standee word " + k); });
  ["welcome", "save", "ourday", "playing", "and"].forEach(function (k) { if (!DATA.standeeWords[k]) throw new Error("standee words lack " + k); });
  ["date", "mono"].forEach(function (f) {
    if (!(DATA.marks[f] && DATA.marks[f].length === 8)) throw new Error("mark family " + f + " must offer eight styles");
    if (new Set(DATA.marks[f]).size !== 8) throw new Error("mark family " + f + " repeats a style");
  });
  if (DATA.textStyles.length !== 12) throw new Error("twelve text styles, not " + DATA.textStyles.length);
  const tsIds = {};
  DATA.textStyles.forEach(function (t) {
    if (tsIds[t.id]) throw new Error("text style " + t.id + " repeated"); tsIds[t.id] = true;
    if (!ROLES.some(function (r) { return r.id === t.role; })) throw new Error("text style " + t.id + ": unknown role " + t.role);
    if (!fontIds[t.font]) throw new Error("text style " + t.id + ": " + t.font + " is not a face this studio ships");
    if (!(t.size >= 0.4 && t.size <= 3)) throw new Error("text style " + t.id + ": size outside the line's own bounds");
  });
  const grpIds = {};
  DATA.libGroups.forEach(function (g) {
    if (grpIds[g.id]) throw new Error("library group " + g.id + " repeated"); grpIds[g.id] = true;
    if (g.occ) { if (!occIds[g.occ]) throw new Error("library group " + g.id + " names occasion " + g.occ + ", which is not one"); }
    else nine(g.label, "library group " + g.id);
  });
  if (!grpIds.standee) throw new Error("the library must offer a Standee group");
  /* 6.125.0 — every group carries the words an imported file's own name is read against, and every
     one of them compiles: the module reads these instead of naming a group in its code. */
  DATA.libGroups.forEach(function (g) {
    if (typeof g.match !== "string" || g.match.length < 3) throw new Error("library group " + g.id + " has no name-words");
    try { new RegExp(g.match, "i"); } catch (e) { throw new Error("library group " + g.id + " name-words do not compile: " + e.message); }
  });
  if (!(DATA.lib.max >= 100 && DATA.lib.max <= 2000)) throw new Error("lib.max " + DATA.lib.max + " is outside what one store can carry");
  if (!(DATA.lib.preview >= 800 && DATA.lib.preview <= 4000 && DATA.lib.thumb >= 160 && DATA.lib.thumb < DATA.lib.preview)) throw new Error("lib preview/thumb sizes are out of order");
  if (!(DATA.lib.maxPhotos >= 6 && DATA.lib.maxPhotos <= 12)) throw new Error("lib.maxPhotos " + DATA.lib.maxPhotos);
  if (!(DATA.lib.photoWords.length >= 6 && DATA.lib.textWords.length >= 4)) throw new Error("the PSD reader needs its layer-name words");
  DATA.sizes.filter(function (s) { return s.group === "standee"; }).forEach(function (s) {
    if (s.unit !== "cm" || s.dpi !== 150 || !(s.h > s.w)) throw new Error("standee size " + s.id + " must be an upright cm sheet at 150 dpi");
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
