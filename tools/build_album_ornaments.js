#!/usr/bin/env node
"use strict";
/* tools/build_album_ornaments.js — 6.122.0 wave G: draw the album's ornament masks and page
   overlays. Every ornament in tools/lib/album_ornaments.js is drawn by a recipe below into a
   white-on-transparent PNG (512 px on the long edge) under docs/app/lib/album/orn/, and every
   overlay into a 1200 × 800 texture under docs/app/lib/album/ovl/. The drawing is deterministic
   (a seeded generator where a recipe scatters anything), so a rebuild on a clean tree changes
   nothing; docs/app/lib/album/ornaments.json records each file's SHA-256 and
   test/verify_album_wave_g.js fails on drift. Runs Chromium through Playwright, like the
   screenshot lanes.  Usage: node tools/build_album_ornaments.js [--check] */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "docs", "app", "lib", "album");
const ORN_DIR = path.join(LIB, "orn"), OVL_DIR = path.join(LIB, "ovl");
const RECORD = path.join(LIB, "ornaments.json");
const T = require("./lib/album_ornaments.js");

/* THE RECIPES run inside the page: (ctx, W, H, rnd) with the mask already transparent and the
   ink set to white. Coordinates are the file's pixels. `rnd` is the seeded generator. */
const RECIPES = `({
  _leaf: function(x, cx, cy, len, wid, ang){ x.save(); x.translate(cx, cy); x.rotate(ang); x.beginPath();
    x.moveTo(0, 0); x.quadraticCurveTo(len*0.5, -wid, len, 0); x.quadraticCurveTo(len*0.5, wid, 0, 0); x.fill(); x.restore(); },
  _stem: function(x, pts, lw){ x.lineWidth = lw; x.lineCap = "round"; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (var i=1;i<pts.length;i++) x.lineTo(pts[i][0], pts[i][1]); x.stroke(); },
  c1: function(x, W, H){ var s = W; x.lineWidth = s*0.028; x.lineCap = "round";
    x.beginPath(); x.moveTo(s*0.06, s*0.06); x.bezierCurveTo(s*0.5, s*0.02, s*0.72, s*0.18, s*0.94, s*0.08); x.stroke();
    x.beginPath(); x.moveTo(s*0.06, s*0.06); x.bezierCurveTo(s*0.02, s*0.5, s*0.18, s*0.72, s*0.08, s*0.94); x.stroke();
    x.lineWidth = s*0.02;
    x.beginPath(); x.moveTo(s*0.2, s*0.2); x.bezierCurveTo(s*0.4, s*0.16, s*0.5, s*0.26, s*0.6, s*0.2); x.stroke();
    x.beginPath(); x.moveTo(s*0.2, s*0.2); x.bezierCurveTo(s*0.16, s*0.4, s*0.26, s*0.5, s*0.2, s*0.6); x.stroke();
    this._leaf(x, s*0.94, s*0.08, s*0.12, s*0.035, -0.5); this._leaf(x, s*0.08, s*0.94, s*0.12, s*0.035, Math.PI/2+0.5);
    this._leaf(x, s*0.6, s*0.2, s*0.09, s*0.028, -0.4); this._leaf(x, s*0.2, s*0.6, s*0.09, s*0.028, Math.PI/2+0.4);
    x.beginPath(); x.arc(s*0.06, s*0.06, s*0.035, 0, Math.PI*2); x.fill(); },
  c2: function(x, W, H){ var s = W; x.lineWidth = s*0.026;
    x.beginPath(); x.moveTo(s*0.95, s*0.08); x.lineTo(s*0.08, s*0.08); x.lineTo(s*0.08, s*0.95); x.stroke();
    x.lineWidth = s*0.012; x.beginPath(); x.moveTo(s*0.95, s*0.17); x.lineTo(s*0.17, s*0.17); x.lineTo(s*0.17, s*0.95); x.stroke();
    x.fillRect(s*0.04, s*0.04, s*0.09, s*0.09); },
  c3: function(x, W, H){ var s = W; this._stem(x, [[s*0.95, s*0.09],[s*0.09, s*0.09],[s*0.09, s*0.95]], s*0.02);
    var i; for (i=0;i<4;i++){ var t = s*(0.24 + i*0.18); this._leaf(x, t, s*0.09, s*0.13, s*0.045, -Math.PI/3); this._leaf(x, t, s*0.09, s*0.13, s*0.045, Math.PI/3);
      this._leaf(x, s*0.09, t, s*0.13, s*0.045, Math.PI/6); this._leaf(x, s*0.09, t, s*0.13, s*0.045, Math.PI*5/6); } },
  c4: function(x, W, H){ var s = W, i; x.lineWidth = s*0.018; x.lineCap = "round";
    for (i=0;i<=6;i++){ var a = i*Math.PI/12; x.beginPath(); x.moveTo(s*0.08, s*0.08); x.lineTo(s*0.08 + Math.cos(a)*s*0.6, s*0.08 + Math.sin(a)*s*0.6); x.stroke(); }
    x.lineWidth = s*0.03; x.beginPath(); x.arc(s*0.08, s*0.08, s*0.72, 0, Math.PI/2); x.stroke();
    x.lineWidth = s*0.014; x.beginPath(); x.arc(s*0.08, s*0.08, s*0.84, 0, Math.PI/2); x.stroke(); },
  d1: function(x, W, H){ x.lineWidth = H*0.06; x.lineCap = "round";
    x.beginPath(); x.moveTo(W*0.04, H*0.5); x.lineTo(W*0.44, H*0.5); x.moveTo(W*0.56, H*0.5); x.lineTo(W*0.96, H*0.5); x.stroke();
    x.beginPath(); x.moveTo(W*0.5, H*0.12); x.lineTo(W*0.5+H*0.38, H*0.5); x.lineTo(W*0.5, H*0.88); x.lineTo(W*0.5-H*0.38, H*0.5); x.closePath(); x.fill();
    x.beginPath(); x.arc(W*0.04, H*0.5, H*0.09, 0, Math.PI*2); x.arc(W*0.96, H*0.5, H*0.09, 0, Math.PI*2); x.fill(); },
  d2: function(x, W, H){ x.lineWidth = H*0.06; x.lineCap = "round";
    x.beginPath(); x.moveTo(W*0.04, H*0.5); x.bezierCurveTo(W*0.18, H*0.1, W*0.3, H*0.9, W*0.42, H*0.5); x.stroke();
    x.beginPath(); x.moveTo(W*0.96, H*0.5); x.bezierCurveTo(W*0.82, H*0.1, W*0.7, H*0.9, W*0.58, H*0.5); x.stroke();
    x.lineWidth = H*0.07; x.beginPath(); x.arc(W*0.5, H*0.5, H*0.2, 0, Math.PI*2); x.stroke(); },
  d3: function(x, W, H){ var i, n = 9; for (i=0;i<n;i++){ var t = 0.05 + i*0.9/(n-1); if (Math.abs(t-0.5) < 0.09) continue;
      x.beginPath(); x.arc(W*t, H*0.5, H*0.1, 0, Math.PI*2); x.fill(); }
    x.lineWidth = H*0.07; x.beginPath(); x.arc(W*0.5, H*0.5, H*0.3, 0, Math.PI*2); x.stroke();
    x.beginPath(); x.arc(W*0.5, H*0.5, H*0.08, 0, Math.PI*2); x.fill(); },
  d4: function(x, W, H){ x.lineWidth = H*0.05; x.lineCap = "round";
    x.beginPath(); x.moveTo(W*0.04, H*0.5); x.lineTo(W*0.96, H*0.5); x.stroke();
    var i; for (i=0;i<4;i++){ var tl = W*(0.47 - i*0.055), tr = W*(0.53 + i*0.055), len = H*0.36 - i*H*0.03;
      this._leaf(x, tl, H*0.5, len, H*0.1, Math.PI*0.72); this._leaf(x, tl, H*0.5, len, H*0.1, -Math.PI*0.72);
      this._leaf(x, tr, H*0.5, len, H*0.1, Math.PI*0.28); this._leaf(x, tr, H*0.5, len, H*0.1, -Math.PI*0.28); }
    x.beginPath(); x.arc(W*0.5, H*0.5, H*0.09, 0, Math.PI*2); x.fill(); },
  f1: function(x, W, H){ x.lineWidth = W*0.012; x.strokeRect(W*0.02, H*0.03, W*0.96, H*0.94);
    x.lineWidth = W*0.005; x.strokeRect(W*0.045, H*0.07, W*0.91, H*0.86); },
  f2: function(x, W, H){ var r = W*0.06; x.lineWidth = W*0.009; x.beginPath();
    x.moveTo(W*0.03+r, H*0.045); x.lineTo(W*0.97-r, H*0.045); x.quadraticCurveTo(W*0.97, H*0.045, W*0.97, H*0.045+r);
    x.lineTo(W*0.97, H*0.955-r); x.quadraticCurveTo(W*0.97, H*0.955, W*0.97-r, H*0.955); x.lineTo(W*0.03+r, H*0.955);
    x.quadraticCurveTo(W*0.03, H*0.955, W*0.03, H*0.955-r); x.lineTo(W*0.03, H*0.045+r); x.quadraticCurveTo(W*0.03, H*0.045, W*0.03+r, H*0.045); x.closePath(); x.stroke(); },
  f3: function(x, W, H){ x.lineWidth = W*0.01; x.setLineDash([W*0.03, W*0.018]); x.lineCap = "round"; x.strokeRect(W*0.03, H*0.045, W*0.94, H*0.91); x.setLineDash([]); },
  f4: function(x, W, H){ var L = W*0.16, lw = W*0.012; x.lineWidth = lw; x.lineCap = "square";
    function br(ax, ay, dx, dy){ x.beginPath(); x.moveTo(ax + dx*L, ay); x.lineTo(ax, ay); x.lineTo(ax, ay + dy*L); x.stroke(); }
    br(W*0.03, H*0.045, 1, 1); br(W*0.97, H*0.045, -1, 1); br(W*0.03, H*0.955, 1, -1); br(W*0.97, H*0.955, -1, -1); },
  b1: function(x, W, H){ this._stem(x, [[W*0.55, H*0.97],[W*0.5, H*0.7],[W*0.42, H*0.4],[W*0.5, H*0.06]], W*0.03);
    var i; for (i=0;i<7;i++){ var t = 0.14 + i*0.12, px = W*(0.5 - 0.03*Math.sin(i)), py = H*t, r = W*0.13 - i*W*0.006;
      x.beginPath(); x.arc(px + (i%2 ? -1 : 1)*W*0.16, py, r, 0, Math.PI*2); x.fill(); } },
  b2: function(x, W, H){ this._stem(x, [[W*0.5, H*0.97],[W*0.48, H*0.5],[W*0.55, H*0.05]], W*0.028);
    var i; for (i=0;i<8;i++){ var t = 0.1 + i*0.11; this._leaf(x, W*0.5, H*t, W*0.36, W*0.08, (i%2 ? -1 : 1)*Math.PI/3 + (i%2 ? Math.PI : 0)); } },
  b3: function(x, W, H){ this._stem(x, [[W*0.5, H*0.97],[W*0.5, H*0.05]], W*0.025);
    var i; for (i=0;i<12;i++){ var t = 0.08 + i*0.075, len = W*0.4*(1 - i*0.04); x.lineWidth = W*0.02; x.lineCap = "round";
      x.beginPath(); x.moveTo(W*0.5, H*t); x.lineTo(W*0.5 - len, H*t - len*0.35); x.moveTo(W*0.5, H*t); x.lineTo(W*0.5 + len, H*t - len*0.35); x.stroke();
      this._leaf(x, W*0.5 - len, H*t - len*0.35, W*0.1, W*0.03, Math.PI + 0.35); this._leaf(x, W*0.5 + len, H*t - len*0.35, W*0.1, W*0.03, -0.35); } },
  b4: function(x, W, H){ this._stem(x, [[W*0.5, H*0.97],[W*0.5, H*0.3]], W*0.025); this._stem(x, [[W*0.5, H*0.75],[W*0.2, H*0.45]], W*0.02); this._stem(x, [[W*0.5, H*0.6],[W*0.8, H*0.36]], W*0.02);
    var pts = [[0.5, 0.18],[0.2, 0.4],[0.8, 0.31]], i, k; for (i=0;i<pts.length;i++){ for (k=0;k<6;k++){ var a = k*Math.PI/3;
      x.beginPath(); x.arc(W*pts[i][0] + Math.cos(a)*W*0.09, H*pts[i][1] + Math.sin(a)*W*0.09, W*0.055, 0, Math.PI*2); x.fill(); }
      x.beginPath(); x.arc(W*pts[i][0], H*pts[i][1], W*0.04, 0, Math.PI*2); x.fill(); }
    this._leaf(x, W*0.5, H*0.88, W*0.3, W*0.07, Math.PI*1.2); this._leaf(x, W*0.5, H*0.92, W*0.3, W*0.07, -Math.PI*0.2); },
  s1: function(x, W, H){ var s = W; x.beginPath(); x.moveTo(s*0.5, s*0.9);
    x.bezierCurveTo(s*0.1, s*0.62, s*0.02, s*0.32, s*0.26, s*0.16); x.bezierCurveTo(s*0.4, s*0.08, s*0.5, s*0.18, s*0.5, s*0.3);
    x.bezierCurveTo(s*0.5, s*0.18, s*0.6, s*0.08, s*0.74, s*0.16); x.bezierCurveTo(s*0.98, s*0.32, s*0.9, s*0.62, s*0.5, s*0.9); x.closePath(); x.fill(); },
  s2: function(x, W, H){ x.lineWidth = H*0.07; x.beginPath(); x.arc(W*0.38, H*0.5, H*0.36, 0, Math.PI*2); x.stroke();
    x.beginPath(); x.arc(W*0.62, H*0.5, H*0.36, 0, Math.PI*2); x.stroke(); },
  s3: function(x, W, H){ var s = W, i; x.lineWidth = s*0.03; x.lineCap = "round";
    for (i=0;i<12;i++){ var a = i*Math.PI/6, r0 = (i%2 ? s*0.24 : s*0.18), r1 = (i%2 ? s*0.46 : s*0.36);
      x.beginPath(); x.moveTo(s*0.5 + Math.cos(a)*r0, s*0.5 + Math.sin(a)*r0); x.lineTo(s*0.5 + Math.cos(a)*r1, s*0.5 + Math.sin(a)*r1); x.stroke(); }
    x.beginPath(); x.arc(s*0.5, s*0.5, s*0.08, 0, Math.PI*2); x.fill(); },
  s4: function(x, W, H, rnd){ var i; for (i=0;i<42;i++){ var px = W*(0.04 + rnd()*0.92), py = H*(0.06 + rnd()*0.88), r = H*(0.025 + rnd()*0.045), k = rnd();
      x.save(); x.translate(px, py); x.rotate(rnd()*Math.PI); x.beginPath();
      if (k < 0.5) x.arc(0, 0, r, 0, Math.PI*2); else x.rect(-r, -r*0.45, r*2, r*0.9); x.fill(); x.restore(); } },
  t1: function(x, W, H, rnd){ var i, n = 9; x.beginPath(); x.moveTo(W*0.03, H*0.08);
    for (i=1;i<=n;i++) x.lineTo(W*0.03 + (i%2 ? W*0.02 : 0), H*(0.08 + i*0.84/n)); x.lineTo(W*0.03, H*0.92); x.lineTo(W*0.97, H*0.92);
    for (i=n;i>=1;i--) x.lineTo(W*0.97 - (i%2 ? W*0.02 : 0), H*(0.08 + i*0.84/n)); x.lineTo(W*0.97, H*0.08); x.closePath(); x.fill();
    x.globalCompositeOperation = "destination-out"; x.globalAlpha = 0.18; for (i=0;i<5;i++){ x.fillRect(W*(0.12 + i*0.18), H*0.08, W*0.05, H*0.84); }
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; },
  t2: function(x, W, H){ var r = H*0.18; x.lineWidth = H*0.05; x.beginPath();
    x.moveTo(W*0.03+r, H*0.06); x.lineTo(W*0.97-r, H*0.06); x.quadraticCurveTo(W*0.97, H*0.06, W*0.97, H*0.06+r); x.lineTo(W*0.97, H*0.94-r);
    x.quadraticCurveTo(W*0.97, H*0.94, W*0.97-r, H*0.94); x.lineTo(W*0.03+r, H*0.94); x.quadraticCurveTo(W*0.03, H*0.94, W*0.03, H*0.94-r);
    x.lineTo(W*0.03, H*0.06+r); x.quadraticCurveTo(W*0.03, H*0.06, W*0.03+r, H*0.06); x.closePath(); x.stroke();
    x.lineWidth = H*0.02; x.strokeRect(W*0.08, H*0.17, W*0.84, H*0.66); },
  t3: function(x, W, H){ var s = W, i, n = 24; x.beginPath();
    for (i=0;i<n;i++){ var a0 = i*Math.PI*2/n, a1 = (i+0.5)*Math.PI*2/n, r0 = s*0.46, r1 = s*0.41;
      x.lineTo(s*0.5 + Math.cos(a0)*r0, s*0.5 + Math.sin(a0)*r0); x.lineTo(s*0.5 + Math.cos(a1)*r1, s*0.5 + Math.sin(a1)*r1); }
    x.closePath(); x.fill();
    x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(s*0.5, s*0.5, s*0.34, 0, Math.PI*2); x.fill();
    x.globalCompositeOperation = "source-over"; x.lineWidth = s*0.02; x.beginPath(); x.arc(s*0.5, s*0.5, s*0.28, 0, Math.PI*2); x.stroke(); },
  t4: function(x, W, H){ x.beginPath(); x.moveTo(W*0.14, H*0.22); x.lineTo(W*0.86, H*0.22); x.lineTo(W*0.86, H*0.78); x.lineTo(W*0.14, H*0.78); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(W*0.02, H*0.32); x.lineTo(W*0.2, H*0.32); x.lineTo(W*0.2, H*0.9); x.lineTo(W*0.02, H*0.9); x.lineTo(W*0.08, H*0.61); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(W*0.98, H*0.32); x.lineTo(W*0.8, H*0.32); x.lineTo(W*0.8, H*0.9); x.lineTo(W*0.98, H*0.9); x.lineTo(W*0.92, H*0.61); x.closePath(); x.fill();
    x.globalCompositeOperation = "destination-out"; x.beginPath(); x.moveTo(W*0.14, H*0.78); x.lineTo(W*0.2, H*0.78); x.lineTo(W*0.2, H*0.86); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(W*0.86, H*0.78); x.lineTo(W*0.8, H*0.78); x.lineTo(W*0.8, H*0.86); x.closePath(); x.fill(); x.globalCompositeOperation = "source-over"; }
})`;
/* the five textures: what each pixel of a 1200 × 800 file should hold, drawn for the blend the
   catalogue names (grey is neutral under overlay, white under multiply, black under screen) */
const TEXTURES = `({
  grain: function(x, W, H, rnd){ var im = x.createImageData(W, H), d = im.data, i;
    for (i=0;i<d.length;i+=4){ var v = 128 + Math.round((rnd() - 0.5) * 92); d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255; } x.putImageData(im, 0, 0); },
  vignette: function(x, W, H){ x.fillStyle = "#ffffff"; x.fillRect(0,0,W,H);
    var g = x.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.72);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.92)"); x.fillStyle = g; x.fillRect(0,0,W,H); },
  leak: function(x, W, H){ x.fillStyle = "#000000"; x.fillRect(0,0,W,H);
    var g = x.createLinearGradient(0, H, W, 0); g.addColorStop(0, "rgba(255,120,40,0)"); g.addColorStop(0.55, "rgba(255,120,40,0)");
    g.addColorStop(0.78, "rgba(255,150,60,0.75)"); g.addColorStop(0.92, "rgba(255,210,120,0.95)"); g.addColorStop(1, "rgba(255,240,200,1)");
    x.fillStyle = g; x.fillRect(0,0,W,H);
    var g2 = x.createRadialGradient(W*0.1, H*0.15, 0, W*0.1, H*0.15, W*0.35); g2.addColorStop(0, "rgba(255,90,60,0.55)"); g2.addColorStop(1, "rgba(255,90,60,0)");
    x.fillStyle = g2; x.fillRect(0,0,W,H); },
  dust: function(x, W, H, rnd){ x.fillStyle = "#000000"; x.fillRect(0,0,W,H); x.fillStyle = "#ffffff"; var i;
    for (i=0;i<900;i++){ var r = 0.4 + rnd()*1.6; x.globalAlpha = 0.25 + rnd()*0.75; x.beginPath(); x.arc(rnd()*W, rnd()*H, r, 0, Math.PI*2); x.fill(); }
    x.strokeStyle = "#ffffff"; for (i=0;i<14;i++){ x.globalAlpha = 0.2 + rnd()*0.5; x.lineWidth = 0.6 + rnd()*1.2; var sx = rnd()*W, sy = rnd()*H, ln = 40 + rnd()*260, a = rnd()*Math.PI;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a)*ln, sy + Math.sin(a)*ln); x.stroke(); } x.globalAlpha = 1; },
  paper: function(x, W, H, rnd){ var im = x.createImageData(W, H), d = im.data, i, px;
    for (i=0;i<d.length;i+=4){ px = (i/4) % W; var v = 236 + Math.round(rnd()*19) - (((px + Math.floor(i/4/W)) % 7 === 0) ? 6 : 0); d[i] = v; d[i+1] = v - 2; d[i+2] = v - 6; d[i+3] = 255; }
    x.putImageData(im, 0, 0); x.strokeStyle = "rgba(180,170,150,0.18)"; x.lineWidth = 1; for (i=0;i<260;i++){ var sx = rnd()*W, sy = rnd()*H, ln = 10 + rnd()*60, a = rnd()*Math.PI;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a)*ln, sy + Math.sin(a)*ln); x.stroke(); } }
})`;
const DRAW_SRC = `
  function seeded(n){ var s = n >>> 0; return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function draw(kind, id, W, H, seed){
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    x.fillStyle = "#ffffff"; x.strokeStyle = "#ffffff"; x.lineJoin = "round";
    var R = (kind === "orn") ? (${RECIPES}) : (${TEXTURES});
    R[id].call(R, x, W, H, seeded(seed));
    return cv.toDataURL("image/png");
  }`;

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
async function build(opts) {
  const check = !!(opts && opts.check);
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate("(function(){" + DRAW_SRC + "; window.__draw = draw; })()");
  const record = { v: 1, long: T.ORN_LONG, overlay: [T.OVL_W, T.OVL_H], files: {} };
  const changed = [];
  async function one(kind, id, W, H, seed, dir) {
    const url = await page.evaluate(([k, i, w, h, s]) => window.__draw(k, i, w, h, s), [kind, id, W, H, seed]);
    const buf = Buffer.from(url.split(",")[1], "base64");
    const file = path.join(dir, id + ".png");
    const rel = path.relative(LIB, file).split(path.sep).join("/");
    record.files[rel] = { sha256: sha(buf), bytes: buf.length, w: W, h: H };
    const cur = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!cur || !cur.equals(buf)) { changed.push(rel); if (!check) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, buf); } }
  }
  let seed = 7;
  for (const o of T.ORNAMENTS) {
    const W = o.ar >= 1 ? T.ORN_LONG : Math.round(T.ORN_LONG * o.ar);
    const H = o.ar >= 1 ? Math.round(T.ORN_LONG / o.ar) : T.ORN_LONG;
    await one("orn", o.id, W, H, seed++, ORN_DIR);
  }
  for (const o of T.OVERLAYS) await one("ovl", o.id, (o.size && o.size[0]) || T.OVL_W, (o.size && o.size[1]) || T.OVL_H, seed++, OVL_DIR);
  await browser.close();
  const text = JSON.stringify(record, null, 2) + "\n";
  const curRec = fs.existsSync(RECORD) ? fs.readFileSync(RECORD, "utf8") : "";
  if (curRec !== text) { changed.push("ornaments.json"); if (!check) fs.writeFileSync(RECORD, text); }
  return { changed, record };
}
module.exports = { build, ORN_DIR, OVL_DIR, RECORD, RECIPES, TEXTURES };
if (require.main === module) {
  const check = process.argv.indexOf("--check") >= 0;
  build({ check }).then(function (r) {
    console.log((check ? "would change " : "wrote ") + r.changed.length + " file(s)" + (r.changed.length ? ": " + r.changed.join(", ") : ""));
    if (check && r.changed.length) process.exit(1);
  }).catch(function (e) { console.error(e); process.exit(1); });
}
