/* v6.63.0 / panel 6.134.0 — THE PANEL'S ICONS ARE RASTERS, AND STAY RASTERS.

   THE PROOF THIS FILE PROTECTS. panel 6.133.0's SELF-TEST card put two icons
   side by side at the size the panel draws them, and the owner photographed
   Photoshop 27.10.0's answer:

     icons/ui/i-home-muted.svg      -> a SOLID BLACK house
     icons/ui/i-star-fill-gold.svg  -> a correct GOLD star

   The two files differ in exactly one way. The star's colour is a `fill`
   written ON THE PATH. The house's colour is a `stroke`, INHERITED from the
   parent <svg>, and its paths carry no fill of their own. So Adobe's renderer
   paints fill, ignores stroke, and does not inherit `fill="none"` — a path
   with no fill falls back to the default, which is black.

   263 of the panel's 276 icons are stroke-drawn. That one fact is the whole of
   the owner's "icons တွေ အမဲဖြစ်နေတယ်", and it survived five waves of
   diagnostics because nothing had ever drawn a stroke icon beside a fill icon
   and asked which one arrived.

   tools/build_panel_icon_png.js now compiles every icon to a PNG at 3x, and
   the panel points at the PNG. The same photograph reports
   "Pictures 247 ok · 0 failed": this renderer draws raster images without
   exception. The SVGs stay as the source — the web app runs in Chromium and
   never had the problem.

   WHAT CAN GO WRONG LATER, and therefore what is checked here:
     · an icon is added and nobody runs the compiler  -> missing PNG
     · an SVG is edited and nobody runs the compiler  -> stale PNG
     · a new screen is written with a .svg src        -> black icon, again
     · the compiler stops being deterministic         -> the CCX digest moves
       under panel/package.sh and the release contract breaks

   Each of those is a check below. None of them is a matter of opinion. */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const ICONS = path.join(PANEL, "icons", "ui");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 600)));
  if (!ok) failures++;
}

const svgs = fs.readdirSync(ICONS).filter((f) => f.endsWith(".svg")).sort();
const pngs = new Set(fs.readdirSync(ICONS).filter((f) => f.endsWith(".png")));

/* ------------------------------------------------- A. every icon is compiled */

const missing = svgs.filter((f) => !pngs.has(f.replace(/\.svg$/, ".png")));
report("A1) every icon SVG has a PNG beside it (" + svgs.length + " icons)",
  missing.length === 0, { missing: missing.slice(0, 10) });

const orphan = [...pngs].filter((f) => !svgs.includes(f.replace(/\.png$/, ".svg")));
report("A2) no PNG outlives the SVG it was compiled from",
  orphan.length === 0, { orphan: orphan.slice(0, 10) });

/* the stamp is how the compiler knows what is current; a PNG whose source
   digest moved is stale, and a stale icon is a wrong picture that nothing
   else in this suite would notice */
const stampPath = path.join(ICONS, ".png-stamp.json");
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, "utf8")) : null;
const stale = [];
for (const f of svgs) {
  const d = crypto.createHash("sha256").update(fs.readFileSync(path.join(ICONS, f))).digest("hex").slice(0, 16);
  if (!stamp || stamp[f] !== d) stale.push(f);
}
report("A3) no PNG is stale — every SVG's digest matches the stamp the compiler wrote",
  !!stamp && stale.length === 0, { hasStamp: !!stamp, stale: stale.slice(0, 10) });

/* --------------------------------------- B. nothing in the panel asks for SVG */

function panelFiles() {
  const out = [path.join(PANEL, "index.html"), path.join(PANEL, "main.js")];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(path.join(PANEL, "src"));
  walk(path.join(PANEL, "js"));
  return out;
}

const svgRefs = [];
for (const f of panelFiles()) {
  const src = fs.readFileSync(f, "utf8");
  /* the comments explain WHY the .svg path was abandoned, so they must not
     count — the same discipline the UXP-SAFE gate uses */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const hits = code.match(/icons\/ui\/[A-Za-z0-9_-]*\.svg/g) || [];
  /* the SELF-TEST probe deliberately loads one SVG to report what this
     renderer does with it — that is evidence, not a dependency */
  const allowed = f.endsWith("panel-selftest.js") ? 1 : 0;
  if (hits.length > allowed) svgRefs.push({ file: path.relative(ROOT, f), hits: hits.slice(0, 4) });
}
report("B1) no panel surface draws an icon from a .svg — UXP would paint it black",
  svgRefs.length === 0, svgRefs.slice(0, 6));

const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
report("B2) the one dynamic icon builder asks for .png",
  /im\.src = "icons\/ui\/" \+ name \+ "-" \+ \(tint \|\| "cream"\) \+ "\.png";/.test(MAIN), null);

const LIBCARDS = fs.readFileSync(path.join(PANEL, "js", "hnk_library_compact_cards.js"), "utf8");
report("B3) the library card builder asks for .png too",
  /'icons\/ui\/' \+ name \+ '-' \+ tint \+ '\.png'/.test(LIBCARDS), null);

/* the studio suites file is GENERATED: fixing the output without fixing the
   generator means the next lift puts the .svg back, which is exactly how the
   pointer-events rules came back in 6.62.0 */
const SUITEGEN = fs.readFileSync(path.join(ROOT, "tools", "build_panel_studio_suites.js"), "utf8");
report("B4) the studio-suites GENERATOR emits .png, so a re-lift cannot undo this",
  (SUITEGEN.match(/icons\/ui\/[A-Za-z0-9_-]*\.png/g) || []).length >= 3 &&
  (SUITEGEN.match(/icons\/ui\/[A-Za-z0-9_-]*\.svg/g) || []).length === 0, null);

/* ------------------------------------------ C. every referenced file is there */

const wanted = new Set();
for (const f of panelFiles().concat([path.join(PANEL, "index.html")])) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.match(/icons\/ui\/[A-Za-z0-9_-]*\.png/g) || []) wanted.add(m.split("/").pop());
}
const absent = [...wanted].filter((f) => !pngs.has(f));
report("C1) every icon the panel names by hand exists on disk (" + wanted.size + " named)",
  absent.length === 0, { absent: absent.slice(0, 10) });

/* ------------------------------------------------- D. the compiler is honest */

const GEN = fs.readFileSync(path.join(ROOT, "tools", "build_panel_icon_png.js"), "utf8");
report("D1) the compiler is deterministic by construction — fixed scale, fixed box, transparent",
  /deviceScaleFactor: SCALE/.test(GEN) && /omitBackground: true/.test(GEN) &&
  /viewport: \{ width: BOX, height: BOX \}/.test(GEN), null);
report("D2) it writes only what changed, so a no-op run leaves the CCX digest alone",
  /if \(!cur \|\| !cur\.equals\(buf\)\)/.test(GEN), null);

/* ------------------------------------------------------ E. the card reports it */

const SELFTEST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
report("E1) the SELF-TEST card measures whether the PNG loads (caps.iconPng)",
  /caps\.iconPng\b/.test(SELFTEST) && /caps\.iconPng\b/.test(MAIN), null);
report("E2) the picture probe judges on onload, never on naturalWidth — that read \"no\" while an SVG was visibly drawing",
  /im\.onload = function \(\) \{ done\("yes"\); \}/.test(SELFTEST) &&
  !/naturalWidth/.test(SELFTEST.replace(/\/\*[\s\S]*?\*\//g, "")), null);
report("E3) the stroke-vs-fill row shows the shipped PNGs, so one photograph still settles it",
  /icons: \["icons\/ui\/i-home-muted\.png", "icons\/ui\/i-star-fill-gold\.png"\]/.test(MAIN), null);

/* the three geometric probes that answered 0px / 0 / NO on 6.133.0 did so
   because offsetWidth and offsetLeft return 0 in UXP, not because the CSS
   failed. getBoundingClientRect is the only ruler that worked. */
const SELFTEST_CODE = SELFTEST.replace(/\/\*[\s\S]*?\*\//g, "");
report("E4) no probe measures with offsetWidth/offsetLeft again — UXP answers 0 and the reading is worthless",
  !/offsetWidth|offsetLeft/.test(SELFTEST_CODE) &&
  /getBoundingClientRect/.test(SELFTEST_CODE), null);

const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
report("E5) CI runs this test", CI.includes("node test/verify_panel_icon_raster.js"), null);

console.log(failures
  ? "\nFAIL (" + failures + ")"
  : "\nPASS — every panel icon ships as a raster the renderer is known to draw, and nothing can quietly point back at a stroke");
process.exit(failures ? 1 : 0);
