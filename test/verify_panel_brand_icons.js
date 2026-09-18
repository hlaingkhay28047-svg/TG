/* verify_panel_brand_icons.js — 6.108.0 / panel 6.179.0
   THE CCX'S OWN LOGO: the plugin-list icon and the panel tab icon.

   WHY THIS FILE EXISTS. The owner asked how the plugin logo is made. Answering
   it meant opening the ones we ship, and two were wrong — and nothing in 249
   tests could have told us:

     panel/icons/dark.png   md5 798793d3189046f90f07aae8158cd47f
     panel/icons/light.png  md5 798793d3189046f90f07aae8158cd47f

   One file under two names. panel/manifest.json declares one icon for the
   darkest / dark / medium themes and another for lightest / light, and both
   entries pointed at the same bytes, so a student on a light Photoshop got the
   dark-theme icon and the theme split bought nothing at all. The second defect
   was what those bytes were: a photograph shrunk to 23 px, which reads as a
   grey smudge rather than a mark.

   Neither is the kind of thing anyone notices on purpose. An icon that is
   merely WRONG still draws, so the panel looks like it works; and the file that
   is wrong is the very first thing a student sees, in the Plugins list, before
   they have opened anything. That is exactly the shape of defect a test is for.

   WHAT THIS PINS, and why each one would have caught something:

     A  the manifest still declares the family it claims to — two plugin-list
        sizes and a dark/light tab pair over all six Photoshop themes, every
        path a .png. (6.63.0 proved UXP paints `fill` and ignores `stroke`, so
        an SVG icon arrives as a black silhouette. A path that ends in .svg is
        a defect, not a preference.)
     B  every declared file is ON DISK, at EXACTLY the declared pixel size, with
        an alpha channel, and @2x is exactly double. A missing or mis-sized icon
        is invisible in CI and obvious in Photoshop.
     C  dark and light are DIFFERENT PICTURES. This is the 6.108.0 defect, and
        it is the one check here that cannot be satisfied by accident.
     D  the builder is the source of truth and the PNGs are not stale: the
        geometry lives in tools/build_panel_brand_icons.js, is drawn without a
        font (so a CI runner with no Arial Black renders what a laptop does),
        and `--dry` finds nothing left to draw.
     E  the release.

   Usage: node test/verify_panel_brand_icons.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const ICONS = path.join(ROOT, "panel", "icons");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "panel", "manifest.json"), "utf8"));
const BUILDER_PATH = path.join(ROOT, "tools", "build_panel_brand_icons.js");
const BUILDER_SRC = fs.readFileSync(BUILDER_PATH, "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const RELEASE = JSON.parse(fs.readFileSync(path.join(ROOT, "panel", "release-manifest.json"), "utf8"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) failures++;
}

/* ---- a PNG's own header, read rather than trusted ---- */
function png(file) {
  const p = path.join(ICONS, file);
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length < 33 || b.toString("latin1", 1, 4) !== "PNG") return null;
  return {
    bytes: b.length,
    md5: crypto.createHash("md5").update(b).digest("hex"),
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    depth: b[24],
    colour: b[25]           /* 4 = grey+alpha, 6 = RGBA */
  };
}
function twoX(name) { return name.replace(/\.png$/, "@2x.png"); }

/* ---- the manifest's own declarations ---- */
const TOP = MANIFEST.icons || [];
const PANEL_EP = (MANIFEST.entrypoints || []).find(e => e.type === "panel") || {};
const TAB = PANEL_EP.icons || [];
const THEMES = ["darkest", "dark", "medium", "lightest", "light", "all"];

/* ================= A) the manifest declares the family it claims ============ */
report("A1) the plugin-list family is two sizes — a 24 pt slot and a 48 pt slot — each drawn at 1x and 2x, for every Photoshop theme",
  TOP.length === 2 &&
  TOP.every(i => i.species && i.species.indexOf("pluginList") >= 0) &&
  TOP.every(i => Array.isArray(i.scale) && i.scale.join(",") === "1,2") &&
  TOP.every(i => THEMES.every(t => i.theme.indexOf(t) >= 0)) &&
  TOP.some(i => i.width === 24 && i.height === 24) &&
  TOP.some(i => i.width === 48 && i.height === 48),
  TOP);

report("A2) the panel tab declares TWO icons — one for the dark themes and one for the light ones — because Photoshop's chrome is not one colour",
  TAB.length === 2 &&
  TAB.every(i => i.species && i.species.indexOf("chrome") >= 0) &&
  TAB.every(i => i.width === 23 && i.height === 23) &&
  TAB.every(i => Array.isArray(i.scale) && i.scale.join(",") === "1,2") &&
  TAB.some(i => ["darkest", "dark", "medium"].every(t => i.theme.indexOf(t) >= 0)) &&
  TAB.some(i => ["lightest", "light"].every(t => i.theme.indexOf(t) >= 0)) &&
  /* and the two lists do not overlap, or Photoshop is told two things for one theme */
  (() => {
    const seen = {};
    for (const i of TAB) for (const t of i.theme) { if (seen[t]) return false; seen[t] = 1; }
    return true;
  })(),
  TAB);

report("A3) every declared icon is a .png — 6.63.0 proved UXP paints `fill` and ignores `stroke`, so an SVG icon arrives as a black silhouette",
  TOP.concat(TAB).every(i => /\.png$/.test(i.path)),
  TOP.concat(TAB).map(i => i.path));

/* ================= B) the files are real, and the size they claim ========== */
const DECLARED = TOP.concat(TAB).map(i => ({
  file: path.basename(i.path), w: i.width, h: i.height
}));

DECLARED.forEach((d, n) => {
  const one = png(d.file), two = png(twoX(d.file));
  report("B" + (n + 1) + ") " + d.file + " is on disk at exactly " + d.w + "x" + d.h +
    ", with an alpha channel, and " + twoX(d.file) + " is exactly double",
    !!one && !!two &&
    one.width === d.w && one.height === d.h &&
    two.width === d.w * 2 && two.height === d.h * 2 &&
    (one.colour === 6 || one.colour === 4) && (two.colour === 6 || two.colour === 4),
    { one: one, two: two, want: d });
});

report("B5) the manifest names no icon that is missing from panel/icons/, and every icon it names is inside the folder the CCX packs",
  TOP.concat(TAB).every(i => /^icons\//.test(i.path) && fs.existsSync(path.join(ROOT, "panel", i.path))),
  TOP.concat(TAB).map(i => i.path));

/* ================= C) dark and light are different pictures =============== */
/* THE 6.108.0 DEFECT. Until this release both theme entries pointed at byte-
   identical files (md5 798793d3…), so the light-theme declaration was dead
   weight: a student on a light Photoshop got the dark icon. Bytes, not names. */
const dark = png("dark.png"), light = png("light.png");
const dark2 = png("dark@2x.png"), light2 = png("light@2x.png");
report("C1) the dark-theme tab icon and the light-theme one are DIFFERENT PICTURES — the 6.108.0 defect was two names over one file (md5 798793d3…)",
  !!dark && !!light && dark.md5 !== light.md5 && !!dark2 && !!light2 && dark2.md5 !== light2.md5,
  { dark: dark && dark.md5.slice(0, 12), light: light && light.md5.slice(0, 12),
    dark2: dark2 && dark2.md5.slice(0, 12), light2: light2 && light2.md5.slice(0, 12) });

report("C2) the 24 pt plugin slot and the 48 pt slot are allowed to differ, and do — the smaller one carries the simpler mark, which is what an icon family is for",
  png("plugin.png") && png("plugin-48.png") &&
  png("plugin.png").md5 !== png("plugin-48.png").md5 &&
  png("plugin@2x.png").md5 !== png("plugin-48.png").md5,
  { p24: png("plugin.png").md5.slice(0, 12), p48: png("plugin-48.png").md5.slice(0, 12) });

/* ================= D) the builder is the source, and is current =========== */
report("D1) the geometry lives in tools/build_panel_brand_icons.js and every file the manifest names is drawn by it",
  DECLARED.every(d => BUILDER_SRC.indexOf('"' + d.file + '"') > 0) &&
  DECLARED.every(d => BUILDER_SRC.indexOf('"' + twoX(d.file) + '"') > 0),
  DECLARED.map(d => d.file));

report("D2) the letterforms are geometry, not type — no font-family and no <text>, so a CI runner with no Arial Black draws what a laptop draws",
  BUILDER_SRC.indexOf("font-family") < 0 && BUILDER_SRC.indexOf("<text") < 0 &&
  /rectangles and two diagonals/.test(BUILDER_SRC),
  { fontFamily: BUILDER_SRC.indexOf("font-family"), text: BUILDER_SRC.indexOf("<text") });

report("D3) the render is deterministic — a fixed viewport, deviceScaleFactor 1, a transparent background, and bytes written only when they change",
  /deviceScaleFactor: 1/.test(BUILDER_SRC) &&
  /omitBackground: true/.test(BUILDER_SRC) &&
  /cur\.equals\(buf\)/.test(BUILDER_SRC),
  null);

(async () => {
  const B = require(BUILDER_PATH);
  const dry = await B.build({ dry: true });
  report("D4) the shipped PNGs are not stale — the stamp covers the geometry AND each file's own bytes, so a moved outline, a missing file and a hand-repainted one all report stale, and today none of them do",
    dry.changed.length === 0, dry);

  const stamp = fs.existsSync(B.STAMP) ? JSON.parse(fs.readFileSync(B.STAMP, "utf8")) : {};
  report("D5) the stamp records this builder's digest and every icon's, so a PNG painted by hand at the right size cannot pass as current (the fault injection that found the first stamp too weak)",
    stamp.geom === B.selfDigest() &&
    !!stamp.files &&
    B.FILES.every(f => stamp.files[f.name] === B.fileDigest(f.name)),
    { geom: stamp.geom, want: B.selfDigest(),
      mismatch: B.FILES.filter(f => !stamp.files || stamp.files[f.name] !== B.fileDigest(f.name)).map(f => f.name) });

  /* ================= E) the release ================= */
  const appVer = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "app", "version.json"), "utf8")).v;
  const panVer = RELEASE.version;
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("E1) the release is in lockstep, CI runs this file, and the landing site counts it",
    /^6\.10[8-9]\.\d+$|^6\.1[1-9]\d\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.179\.\d+$|^6\.1[89]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    MANIFEST.version === panVer &&
    /node test\/verify_panel_brand_icons\.js/.test(CI) && count >= 250,
    { appVer, panVer, manifest: MANIFEST.version, count });

  console.log(failures ? "\nFAIL — " + failures + " check(s)" :
    "\nALL PASS — the plugin list and the panel tab both carry the HNK mark, and the two themes are two pictures");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
