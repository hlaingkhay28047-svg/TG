/* v6.108.0 — THE CCX'S OWN LOGO: the plugin-list icon and the panel tab icon.

   THE OWNER ASKED HOW THESE ARE MADE. Answering it meant looking at the ones
   we ship, and two of them were wrong:

     panel/icons/dark.png  md5 798793d3189046f90f07aae8158cd47f
     panel/icons/light.png md5 798793d3189046f90f07aae8158cd47f

   The same file. The manifest declares one icon for the darkest/dark/medium
   themes and another for lightest/light, and both entries pointed at the same
   bytes — so a student on a light Photoshop got the dark-theme icon and the
   whole theme split bought nothing. The second defect is what those bytes ARE:
   a photograph, shrunk to 23 px, where it reads as a grey smudge.

   MEASURED, NOT DECLARED. Three marks were drawn and looked at, at the real
   sizes, on a dark panel and on a light one:

     tile + HNK at 24 px   -> the border eats the box, the wordmark is mush
     tile + HNK at 48/96   -> reads
     HNK alone at 23 px    -> thin and cramped
     one H at 23 px        -> reads cleanly, and still at 46
     gold on a light panel -> too weak to see

   So the family is size-specific, which is what an icon family is for:

     plugin.png     24  |  plugin@2x.png     48  -> tile + a single H
     plugin-48.png  48  |  plugin-48@2x.png  96  -> tile + HNK
     dark.png       23  |  dark@2x.png       46  -> H in gold  (darkest/dark/medium)
     light.png      23  |  light@2x.png      46  -> H in ink   (lightest/light)

   Photoshop picks the SLOT by the point size its UI wants and then the FILE by
   the display's scale, so the 24 pt slot may show a simpler mark than the 48 pt
   slot without either looking wrong: they are never on screen together.

   NO FONT. The letterforms are geometry — rectangles and two diagonals — so
   this file draws the same picture on a machine with Arial Black and on a CI
   runner with neither. A font would have made the bytes depend on what happens
   to be installed, and panel/package.sh pins the CCX digest.

   DETERMINISTIC for the same reason: fixed viewport, deviceScaleFactor 1,
   transparent background, and the bytes are written only when they change.

   THE STAMP COVERS BOTH ENDS. It records this file's digest AND each PNG's
   own, because either alone leaves a hole: the builder's digest alone lets a
   hand-painted PNG of the right size sit there looking current (the fault
   injection that found this), and the PNGs' digests alone would not notice the
   geometry moving. With both, `--dry` reports stale when the geometry changed,
   when a file is missing, and when a file is not the one this builder drew —
   and test/verify_panel_brand_icons.js fails on any of the three.

   Regenerate with `node tools/build_panel_brand_icons.js`. */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "panel", "icons");
const STAMP = path.join(OUT, ".brand-stamp.json");

/* the brand's own gold, from the app's --gold-hi / --gold, and an ink dark
   enough to read on Photoshop's lightest theme */
const GOLD_LO = "#fff3cf";
const GOLD    = "#e8bf63";
const GOLD_HI = "#b77816";
const INK     = "#2b2118";
const TILE    = "#141416";

/* ---- the letterforms, in a 30 x 40 cell each ---- */
function glyphs(T) {
  const W = 30, H = 40, GAP = 6;
  const barTop = (H - T) / 2;
  const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
  const poly = (pts) => "M" + pts.map((p) => p.join(" ")).join("L") + "z";
  const H_ = [rect(0, 0, T, H), rect(W - T, 0, T, H), rect(T, barTop, W - 2 * T, T)].join("");
  const N_ = [rect(0, 0, T, H), rect(W - T, 0, T, H),
    poly([[T, 0], [T + T * 0.9, 0], [W - T, H - T * 0.2], [W - T, H],
          [W - T - T * 0.9, H], [T, T * 0.2]])].join("");
  const K_ = [rect(0, 0, T, H),
    poly([[T, barTop + T * 0.5], [W - T * 0.7, 0], [W, 0], [W, T * 0.55], [T + T * 0.2, barTop + T * 0.9]]),
    poly([[T, barTop + T * 0.1], [T + T * 0.2, barTop + T * 0.5], [W, H - T * 0.55], [W, H], [W - T * 0.7, H]])].join("");
  return { W, H, GAP, H_, N_, K_ };
}

/* the three letters in a row */
function wordmark(fill) {
  const g = glyphs(9);
  const total = 3 * g.W + 2 * g.GAP;
  const svg = [g.H_, g.N_, g.K_]
    .map((d, i) => `<path d="${d}" fill="${fill}" transform="translate(${i * (g.W + g.GAP)} 0)"/>`)
    .join("");
  return { total, height: g.H, svg };
}

/* one bold H, filling its own box — the mark that survives 23 px */
function singleH(fill) {
  const T = 22, x0 = 14, x1 = 86, y0 = 12, y1 = 88;
  const barTop = (y0 + y1 - T) / 2;
  return `<path fill="${fill}" d="M${x0} ${y0}h${T}v${y1 - y0}h${-T}z` +
         `M${x1 - T} ${y0}h${T}v${y1 - y0}h${-T}z` +
         `M${x0 + T} ${barTop}h${x1 - T - x0 - T}v${T}h${-(x1 - T - x0 - T)}z"/>`;
}

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="${GOLD_LO}"/><stop offset=".45" stop-color="${GOLD}"/>` +
  `<stop offset="1" stop-color="${GOLD_HI}"/></linearGradient></defs>`;

/* the plugin-list tile: a dark rounded square with the brand's gold hairline */
function tile(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${GRAD}` +
    `<rect x="3" y="3" width="94" height="94" rx="22" fill="${TILE}"/>` +
    `<rect x="3" y="3" width="94" height="94" rx="22" fill="none" stroke="url(#g)" stroke-width="5"/>` +
    inner + `</svg>`;
}
function tileWord() {
  const w = wordmark("url(#g)");
  const pad = 16, s = (100 - pad * 2) / w.total, y = (100 - w.height * s) / 2;
  return tile(`<g transform="translate(${pad} ${y}) scale(${s})">${w.svg}</g>`);
}
function tileH() {
  return tile(`<g transform="translate(50 50) scale(.62) translate(-50 -50)">${singleH("url(#g)")}</g>`);
}
function glyphOnly(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${GRAD}${singleH(fill)}</svg>`;
}

/* every file the manifest names, with the size it declares */
const FILES = [
  { name: "plugin.png",        px: 24, svg: tileH },
  { name: "plugin@2x.png",     px: 48, svg: tileH },
  { name: "plugin-48.png",     px: 48, svg: tileWord },
  { name: "plugin-48@2x.png",  px: 96, svg: tileWord },
  { name: "dark.png",          px: 23, svg: () => glyphOnly("url(#g)") },
  { name: "dark@2x.png",       px: 46, svg: () => glyphOnly("url(#g)") },
  { name: "light.png",         px: 23, svg: () => glyphOnly(INK) },
  { name: "light@2x.png",      px: 46, svg: () => glyphOnly(INK) }
];

function selfDigest() {
  return crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex").slice(0, 16);
}
function fileDigest(name) {
  const p = path.join(OUT, name);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);
}

/* what is not the picture this builder drew: the geometry moved, the file is
   gone, or the bytes on disk are not the ones we stamped */
function staleList(prev, want) {
  const files = (prev && prev.files) || {};
  return FILES.filter(function (f) {
    if (prev.geom !== want) return true;
    const d = fileDigest(f.name);
    return d === null || files[f.name] !== d;
  });
}

async function build(opts) {
  const dry = !!(opts && opts.dry);
  const want = selfDigest();
  const prev = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, "utf8")) : {};
  const stale = staleList(prev, want);
  const changed = [];

  if (stale.length && !dry) {
    const browser = await chromium.launch();
    for (const f of FILES) {
      const page = await browser.newPage({
        viewport: { width: f.px, height: f.px }, deviceScaleFactor: 1
      });
      await page.setContent(
        "<style>html,body{margin:0;padding:0;background:transparent}" +
        "svg{display:block;width:" + f.px + "px;height:" + f.px + "px}</style>" + f.svg()
      );
      const buf = await page.screenshot({ omitBackground: true });
      const out = path.join(OUT, f.name);
      const cur = fs.existsSync(out) ? fs.readFileSync(out) : null;
      if (!cur || !cur.equals(buf)) { fs.writeFileSync(out, buf); changed.push("panel/icons/" + f.name); }
      await page.close();
    }
    await browser.close();
  } else if (stale.length && dry) {
    for (const f of stale) changed.push("panel/icons/" + f.name);
  }

  if (!dry) {
    const files = {};
    FILES.forEach(function (f) { files[f.name] = fileDigest(f.name); });
    fs.writeFileSync(STAMP, JSON.stringify({ geom: want, files: files }, null, 0) + "\n");
  }
  return { total: FILES.length, stale: stale.length, changed: changed };
}

module.exports = { build, FILES, selfDigest, fileDigest, staleList, STAMP, OUT };

if (require.main === module) {
  build({ dry: process.argv.includes("--dry") }).then(function (r) {
    console.log("build_panel_brand_icons: " + r.total + " icons, " + r.stale +
      " stale, " + r.changed.length + " file(s) written");
    r.changed.forEach(function (c) { console.log("  " + c); });
    process.exit(0);
  }, function (e) {
    console.error("build_panel_brand_icons FAILED:", e && e.message ? e.message : e);
    process.exit(1);
  });
}
