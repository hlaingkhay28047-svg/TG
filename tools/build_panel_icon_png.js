/* v6.63.0 — RASTERISE THE PANEL'S ICONS, BECAUSE UXP DOES NOT DRAW A STROKE.

   THE PROOF, PHOTOGRAPHED. panel 6.133.0's SELF-TEST card put two icons side
   by side at the size the panel uses them, and the owner's Photoshop 27.10.0
   answered:

     icons/ui/i-home-muted.svg   -> a SOLID BLACK house
     icons/ui/i-star-fill-gold.svg -> a correct GOLD star

   The only difference between those two files is where the paint lives:

     i-home-muted   <svg fill="none" stroke="#a8a394" ...><path d="..."/>
                    -- the colour is a STROKE, and it is INHERITED from <svg>
     i-star-fill-gold  <path fill="#d9a441" stroke="none" d="..."/>
                    -- the colour is a FILL, written ON THE PATH

   So Adobe's renderer paints `fill` and ignores `stroke`, and it does not take
   `fill="none"` from the parent <svg> either: with no fill of its own the path
   falls back to the default, which is black. A stroke-drawn outline therefore
   arrives as a filled silhouette in the wrong colour — a black house where a
   thin grey outline belongs.

   263 of the panel's 276 icons are drawn that way. That is the whole of the
   owner's "icons တွေ အမဲဖြစ်နေတယ်", and it had survived five waves of guessing
   because no diagnostic had ever put a stroke icon and a fill icon next to each
   other and asked which one drew.

   WHY A RASTER AND NOT A CLEVERER SVG. Two repairs were available. Moving the
   presentation attributes off <svg> and onto each <path> is cheap and might be
   enough — but "might" is what the last five waves were made of, and it would
   cost another install-and-photograph round trip to find out. Converting each
   stroke to an outlined fill is a geometry problem with a wrong answer for
   every rounded join. A PNG cannot fail: the same renderer, in the same
   photograph, reports "Pictures 247 ok · 0 failed" — raster images draw.

   So the panel ships PNGs and keeps the SVGs (the web app runs in Chromium and
   is unaffected). The SVG remains the source; this file is the compiler.

   DETERMINISTIC, because panel/package.sh's CCX digest is pinned and a build
   that differs byte for byte between runs would break the release contract:
   fixed device scale, fixed viewport, transparent background, and the bytes
   are only written when they actually change.

   Regenerate with `node tools/build_panel_icon_png.js`;
   test/verify_panel_icon_raster.js fails when a PNG is missing, stale, or
   when a panel surface still points at a .svg. */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "panel", "icons", "ui");

/* 3x of the largest size the panel draws an icon at (24px) — crisp on a
   HiDPI Photoshop panel, and still about a kilobyte apiece. */
const SCALE = 3;
const BOX = 24;

function listSvg() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
}

/* the PNG a given SVG compiles to, and the stamp that says it is current */
function pngName(svg) { return svg.replace(/\.svg$/, ".png"); }
function stampFile() { return path.join(SRC, ".png-stamp.json"); }

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16); }

async function build(opts) {
  const dry = !!(opts && opts.dry);
  const files = listSvg();
  const stampPath = stampFile();
  const prev = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, "utf8")) : {};
  const next = {};
  const changed = [];

  /* what still needs drawing: a source whose digest moved, or a PNG that is
     not on disk at all */
  const todo = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f));
    const d = sha(src);
    next[f] = d;
    const outPath = path.join(SRC, pngName(f));
    if (prev[f] !== d || !fs.existsSync(outPath)) todo.push({ f, src, out: outPath });
  }

  if (todo.length && !dry) {
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: BOX, height: BOX },
      deviceScaleFactor: SCALE,
    });
    for (const job of todo) {
      /* the SVG is drawn at the panel's own box size, on nothing. No CSS of
         ours touches it: what Chromium paints here is exactly what the SVG
         says, which is the picture Photoshop was supposed to show. */
      const b64 = job.src.toString("base64");
      await page.setContent(
        '<style>html,body{margin:0;padding:0;background:transparent}' +
        'img{display:block;width:' + BOX + 'px;height:' + BOX + 'px}</style>' +
        '<img src="data:image/svg+xml;base64,' + b64 + '">'
      );
      await page.waitForFunction(() => {
        const im = document.querySelector("img");
        return !!(im && im.complete);
      });
      const buf = await page.screenshot({ omitBackground: true });
      const cur = fs.existsSync(job.out) ? fs.readFileSync(job.out) : null;
      if (!cur || !cur.equals(buf)) {
        fs.writeFileSync(job.out, buf);
        changed.push(path.relative(ROOT, job.out));
      }
    }
    await browser.close();
  } else if (todo.length && dry) {
    for (const job of todo) changed.push(path.relative(ROOT, job.out));
  }

  /* a PNG whose SVG is gone must go too, or the panel ships a picture with no
     source and the raster test cannot tell stale from deliberate */
  const want = new Set(files.map(pngName));
  for (const f of fs.readdirSync(SRC)) {
    if (f.endsWith(".png") && !want.has(f)) {
      if (!dry) fs.unlinkSync(path.join(SRC, f));
      changed.push("removed " + f);
    }
  }

  if (!dry) fs.writeFileSync(stampPath, JSON.stringify(next, null, 0) + "\n");
  return { total: files.length, drew: todo.length, changed: changed };
}

module.exports = { build, listSvg, pngName, SCALE, BOX };

if (require.main === module) {
  build({ dry: process.argv.includes("--dry") }).then(function (r) {
    console.log("build_panel_icon_png: " + r.total + " icons, " + r.drew + " redrawn, " +
      r.changed.length + " file(s) changed");
    process.exit(0);
  }, function (e) {
    console.error("build_panel_icon_png FAILED:", e && e.message ? e.message : e);
    process.exit(1);
  });
}
