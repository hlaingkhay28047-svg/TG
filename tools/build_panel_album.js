#!/usr/bin/env node
"use strict";
/* Build panel/js/hnk_album.js + the Album rules in panel/styles.css + panel/icons/album/ from the
   web app — the Album page (6.102.0 wave A … 6.122.0 wave G) is ONE module that runs on both
   surfaces, exactly as Imagine is (tools/build_panel_imagine.js, whose shape this file keeps).

   docs/app/data/album-module.js carries the module between two comment markers, ALBUM_MODULE and
   /ALBUM_MODULE (the ALBUM UI: the shelf, the occasion · size · pages · stage · photos · layout ·
   design · ornaments · text · export · print-check cards, the design engine, the JPG / PDF / PSD
   writers), reading its tables from data/album.js (window.HNK_ALBUM) and its words from the host
   (H.t / H.pick9). The panel gets the block byte for byte with two things inlined where the app
   loads them by <script src>: the album JSON, and the app's alb_* strings in the studio's nine
   languages (the my/en row from the shell's TR_PH table, the seven-language row from
   data/trmore.js — 6.122.0 moved TR_L14 there), hung on globalThis.HNK.albumStrings for the
   panel's host adapter (main.js albumHost). Its CSS is the app's block between the ALBUM_CSS
   markers with the app's colour tokens renamed to the panel's and the page id renamed; the
   ornament masks and the page overlays are copied so the two surfaces draw the same pictures.

   Idempotent: running it on a clean tree changes nothing (the pre-commit check relies on that).
   Usage: node tools/build_panel_album.js
   test/verify_album_wave_g.js re-runs this and fails on drift. */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs", "app", "index.html");
const OUT_JS = path.join(ROOT, "panel", "js", "hnk_album.js");
const OUT_CSS = path.join(ROOT, "panel", "styles.css");
const ART_SRC = path.join(ROOT, "docs", "app", "lib", "album");
const ART_DST = path.join(ROOT, "panel", "icons", "album");

const M0 = "/* ---- ALBUM_MODULE ---- */", M1 = "/* ---- /ALBUM_MODULE ---- */";
/* the CSS block opens with a dated header, so its start marker is the prefix the header keeps */
const C0 = "/* ---- ALBUM_CSS", C1 = "/* ---- /ALBUM_CSS ---- */";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

const { between, panelCss: imaginePanelCss } = require("./build_panel_imagine.js");
const { uxpSafeCss } = require("./lib/uxp_safe_css.js");
const { uxpSafeCode } = require("./lib/uxp_safe_text.js");
const A = require("./lib/app-data.js");

/* the app's tokens → the panel's names for the same values (panel/styles.css :root, v6.51) */
const TOKENS = [["var(--gold-hi)", "var(--accent-h)"], ["var(--gold)", "var(--accent)"], ["var(--cream)", "var(--text)"], ["var(--ink)", "var(--bg)"]];
function panelCss(appCss) {
  let s = appCss;
  TOKENS.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
  s = s.split("#pgAlbum").join("#pageAlbum");
  return uxpSafeCss(s, "build_panel_album (the ALBUM_CSS block lifted from docs/app/index.html)");
}

/* the app's words for the page: every alb_* key and the hero's ph_album, in all nine languages.
   The my/en row is the shell's TR_PH table (evaluated, never regex-parsed — the values carry
   quotes, braces and <em>); the seven-language row is data/trmore.js's l14 section. */
function strings(app) {
  const i = app.indexOf("\nvar TR_PH={"); if (i < 0) throw new Error("build_panel_album: the shell carries no TR_PH table");
  const j = app.indexOf("\n};", i); if (j < 0) throw new Error("build_panel_album: TR_PH never closes");
  const base = new Function("return " + app.slice(i + 1, j + 3).replace(/^var TR_PH=/, "").replace(/;$/, ""))();
  const l14 = A.readTrMore().l14 || {};
  const out = {};
  Object.keys(base).forEach(function (k) {
    if (!/^alb_/.test(k) && k !== "ph_album") return;
    const e = {}; LANGS.forEach(function (l) { e[l] = (base[k] && base[k][l]) || (l14[k] && l14[k][l]) || ""; });
    const gaps = LANGS.filter(function (l) { return typeof e[l] !== "string" || !e[l]; });
    if (gaps.length) throw new Error("build_panel_album: " + k + " lacks " + gaps.join(" ") + " — the panel speaks nine languages, so the web app writes all nine first");
    out[k] = e;
  });
  return out;
}
let DRY = false;   /* build({ dry: true }) only reports what differs — the test's drift check */
function writeIfChanged(file, content) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (cur && cur.equals(buf)) return false;
  if (DRY) return true;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return true;
}
function build(opts) {
  DRY = !!(opts && opts.dry);
  const app = fs.readFileSync(APP, "utf8");
  /* 6.125.0 — the module left the shell for docs/app/data/album-module.js (the A4 ceiling);
     its two markers travelled with it, so this lift is the same text it always was. */
  const modFile = require("./lib/app-data.js").wrapperText("albummod");
  const DATA_LINE = "var ALBUM_DATA = window.HNK_ALBUM;";
  const mod0 = between(modFile, M0, M1, "module");
  if (mod0.split(DATA_LINE).length !== 2) throw new Error("build_panel_album: the ALBUM module must read its tables with exactly one `" + DATA_LINE + "`");
  const mod = mod0.replace(DATA_LINE, "var ALBUM_DATA = " + A.albumText() + ";");
  const S = strings(app);
  /* every word the module asks its host for by name must be in the table it is shipped with;
     the keys built by concatenation ("alb_" + kind) are covered because every alb_* key is lifted */
  const asked = []; mod.replace(/\bL\("([a-z0-9_]+)"\)/g, function (m, k) { asked.push(k); return m; });   /* a literal key; "alb_x_" + kind is a prefix, covered above */
  const unknown = asked.filter(function (k) { return !S[k]; });
  if (unknown.length) throw new Error("build_panel_album: the module asks for " + unknown.join(", ") + " and the shell's TR_PH table has no such row");
  const js = "/* GENERATED by tools/build_panel_album.js from docs/app/index.html — do not edit by hand.\n" +
    "   The web app's Album module (6.102.0 wave A … 6.122.0 wave G), byte for byte: ALBUM_DATA (sizes,\n" +
    "   templates, occasions, fonts, designs, ornaments and overlays — inlined from docs/app/data/album.js,\n" +
    "   which the web app loads by <script src>) and the ALBUM UI. main.js hands it the panel's host adapter\n" +
    "   (albumHost) and a root element; the app's alb_* words in nine languages ride along as\n" +
    "   HNK.albumStrings for that adapter. Nothing here knows it is inside Photoshop. */\n" +
    mod + "\n" +
    "globalThis.HNK = globalThis.HNK || {};\n" +
    "globalThis.HNK.album = ALBUM;\n" +
    "globalThis.HNK.albumData = ALBUM_DATA;\n" +
    "globalThis.HNK.albumStrings = " + JSON.stringify(S) + ";\n";
  const changed = [];
  if (writeIfChanged(OUT_JS, uxpSafeCode(js, "build_panel_album (the ALBUM module lifted from docs/app/index.html)"))) changed.push("panel/js/hnk_album.js");
  /* CSS: replace the block between the markers, or append it once */
  const css = panelCss(between(app, C0, C1, "css"));
  let cur = fs.readFileSync(OUT_CSS, "utf8");
  let next;
  if (cur.indexOf(C0) >= 0) next = cur.replace(between(cur, C0, C1, "panel css"), css);
  else next = cur.replace(/\s*$/, "\n\n") + css + "\n";
  if (next !== cur) { if (!DRY) fs.writeFileSync(OUT_CSS, next); changed.push("panel/styles.css"); }
  /* art: the ornament masks (orn/) and the page overlays (ovl/) */
  const copy = function (src, dst) {
    if (!fs.existsSync(src)) return;
    fs.readdirSync(src).forEach(function (f) {
      const s = path.join(src, f);
      if (fs.statSync(s).isDirectory()) return;
      if (!/\.(jpe?g|png|webp)$/i.test(f)) return;
      if (writeIfChanged(path.join(dst, f), fs.readFileSync(s))) changed.push(path.relative(ROOT, path.join(dst, f)));
    });
  };
  copy(path.join(ART_SRC, "orn"), path.join(ART_DST, "orn"));
  copy(path.join(ART_SRC, "ovl"), path.join(ART_DST, "ovl"));
  return { changed: changed, moduleBytes: mod.length, cssBytes: css.length, keys: Object.keys(S).length, js: js, css: css, strings: S };
}
module.exports = { build, between, panelCss, strings, M0, M1, C0, C1, LANGS };
if (require.main === module) {
  const r = build();
  console.log("build_panel_album: module " + r.moduleBytes + " bytes, css " + r.cssBytes + " bytes, " + r.keys + " strings; " + (r.changed.length ? "wrote " + r.changed.join(", ") : "nothing changed"));
}
