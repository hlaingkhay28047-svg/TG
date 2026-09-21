/* verify_album_wave_g.js — 6.122.0 / panel 6.193.0
   SMART ALBUM, WAVE G: ORNAMENTS, OVERLAYS, THE SHELF, THE QUALITY CHIP, AND THE ALBUM PAGE IN PHOTOSHOP.

   Wave F closed the designer; the owner's "ဆက်လုပ်ပါ — Wave G" asked for the four things it left open:
   - PNG ORNAMENTS: twenty-four masks in six families (corners · dividers · frames · botanic · shapes ·
     tape), drawn once by tools/build_album_ornaments.js into docs/app/lib/album/orn/ and recorded
     (sha256 · bytes · w · h) in lib/album/ornaments.json. One tap drops one on the page; it drags, scales
     on the wheel, wears one of five tints, flips, duplicates, dies to Delete and comes back with undo.
     Every mark is a FRACTION of the safe area (ornBox), like every other mark on this page.
   - PAGE OVERLAYS: grain · vignette · light leak · dust · paper at three strengths, one page or every
     page, drawn on the stage's pixels and carried into the JPG, the PDF and the PSD as "Overlay (flat)".
   - THE SHELF: up to twenty-four albums, each its own record under the host's store (docKey), with a
     thumbnail and its page / photo counts; new · rename · duplicate · delete; the legacy single record
     becomes the first shelf entry.
   - PHOTO QUALITY: Standard 2,400 px or Print 4,000 px on the long edge — the host's readFiles asks
     ALBUM.photoMax() so the print check tells the truth about a 36-inch spread.
   - THE PANEL: the whole module lifted into the Photoshop panel (tools/build_panel_album.js →
     panel/js/hnk_album.js, byte for byte, with the album JSON and the alb_* words inlined), albumHost in
     main.js doing the six host things the Photoshop way, the module's native selects dressed as the
     panel's .hsl pickers, and one panel-only door: "Open in Photoshop" for the layered PSD.
   - SHELL HEADROOM: TR_X · TR_NEW · TR_L14 followed the three 6.121.0 dictionaries into data/trmore.js
     (sections x · new · l14), so the shell stays under its A4 ceiling.

   A) source pins   B) the arithmetic through ALBUM.math   C) the walk on a 390px phone   D) the fifty-seven
   lines in nine languages + the fifteen packs   E) release pins   F) the panel's Album page over the parity
   harness and an in-memory data folder */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, p))).digest("hex");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PIDX = read("panel/index.html");
const PCSS = read("panel/styles.css");
const PALB = read("panel/js/hnk_album.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const SWEEP = read("test/sweep_v477_upgrades.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALBUM = A.readAlbum();
const TRM = A.readTrMore();
const L14 = TRM.l14 || {};
const ORNLIB = require(path.join(ROOT, "tools", "lib", "album_ornaments.js"));
const BUILDER = require(path.join(ROOT, "tools", "build_album_ornaments.js"));
const LIFTER = require(path.join(ROOT, "tools", "build_panel_album.js"));
const RECORD = JSON.parse(read("docs/app/lib/album/ornaments.json"));
const MOD = (APP.match(/var ALBUM = \(function\(\)\{[\s\S]*?\n\}\)\(\);/) || [""])[0];
const CSS = (APP.match(/\/\* ---- ALBUM_CSS[\s\S]*?\/\* ---- \/ALBUM_CSS ---- \*\//) || [""])[0];
const CSS_DECL = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const L7 = LANGS.slice(2);
const PACKS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const VER = "6.122.0", PVER = "6.193.0";
const KEYS = ["alb_shelf_h", "alb_shelf_new", "alb_shelf_dup", "alb_shelf_ren", "alb_shelf_del",
  "alb_shelf_del_q", "alb_shelf_meta", "alb_shelf_untitled", "alb_shelf_opened", "alb_shelf_note",
  "alb_shelf_save", "alb_shelf_name", "alb_shelf_renamed", "alb_shelf_made", "alb_shelf_deleted",
  "alb_shelf_full", "alb_qual_h", "alb_qual_std", "alb_qual_print", "alb_qual_note", "alb_orn_h",
  "alb_orn_all", "alb_orn_fam_corner", "alb_orn_fam_divider", "alb_orn_fam_frame",
  "alb_orn_fam_botanic", "alb_orn_fam_shape", "alb_orn_fam_tape", "alb_orn_note", "alb_orn_added",
  "alb_orn_full", "alb_sel_orn", "alb_tint", "alb_tint_gold", "alb_tint_white", "alb_tint_ink",
  "alb_tint_rose", "alb_tint_sage", "alb_flip", "alb_dup", "alb_remove_orn", "alb_ovl_h",
  "alb_ovl_none", "alb_ovl_grain", "alb_ovl_vignette", "alb_ovl_leak", "alb_ovl_dust",
  "alb_ovl_paper", "alb_ovl_light", "alb_ovl_medium", "alb_ovl_strong", "alb_ovl_all",
  "alb_ovl_all_done", "alb_ovl_note", "alb_open_ps", "alb_open_ps_done", "alb_open_ps_fail"];
/* the my/en rows live in the shell's TR_PH table (evaluated — the values carry quotes and <em>) */
const TRPH = (() => { const i = APP.indexOf("\nvar TR_PH={"), j = APP.indexOf("\n};", i); return new Function("return " + APP.slice(i + 1, j + 3).replace(/^var TR_PH=/, "").replace(/;$/, ""))(); })();
const CARDS = "albShelfCard,albOccCard,albSizeCard,albPagesCard,albStageCard,albPhotosCard,albLayoutCard,albDesignCard,albOrnCard,albTextCard,albExportCard,albCheckCard";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail === undefined ? null : detail).slice(0, 700)));
  if (!ok) failures++;
}

/* ===================== A) the source ===================== */
function sourcePins() {
  const fams = ALBUM.ornFamilies.map((f) => (typeof f === "string" ? f : f.id));
  report("A1) data/album.js is v4 and carries the wave: twenty-four ornaments in six families (corner · divider · frame · botanic · shape · tape), each with an aspect and a default box; five overlays at three strengths; five tints; the art folder",
    ALBUM.v === 4 && ALBUM.orn.length === 24 && fams.join() === "corner,divider,frame,botanic,shape,tape" &&
    ALBUM.orn.every((o) => o.id && fams.indexOf(o.fam) >= 0 && o.ar > 0 && o.def && o.def.w > 0 && !!RECORD.files["orn/" + o.id + ".png"]) &&
    ALBUM.ovl.map((o) => o.id).join() === "grain,vignette,leak,dust,paper" && ALBUM.ovl.every((o) => !!RECORD.files["ovl/" + o.id + ".png"]) &&
    ALBUM.ovlAmounts.join() === "light,medium,strong" && Object.keys(ALBUM.tints).join() === "gold,white,ink,rose,sage" && ALBUM.ornDir === "lib/album/" &&
    ORNLIB.ORNAMENTS.length === 24 && ORNLIB.OVERLAYS.length === 5,
    { v: ALBUM.v, orn: ALBUM.orn.length, fams, ovl: ALBUM.ovl.map((o) => o.id), amts: ALBUM.ovlAmounts, tints: Object.keys(ALBUM.tints) });

  const files = Object.keys(RECORD.files);
  const bad = files.filter((f) => {
    const r = RECORD.files[f], p = "docs/app/lib/album/" + f, q = "panel/icons/album/" + f;
    if (!fs.existsSync(path.join(ROOT, p)) || !fs.existsSync(path.join(ROOT, q))) return true;
    const s = sha(p);
    return s !== r.sha256 || fs.statSync(path.join(ROOT, p)).size !== r.bytes || !(r.w > 0 && r.h > 0) || sha(q) !== s;
  });
  report("A2) ornaments.json records all twenty-nine files (24 masks + 5 overlays) by sha256 · bytes · width · height, every one is on disk under docs/app/lib/album/ exactly as recorded, and the panel carries the same bytes under icons/album/",
    files.length === 29 && files.filter((f) => /^orn\//.test(f)).length === 24 && files.filter((f) => /^ovl\//.test(f)).length === 5 && bad.length === 0 && RECORD.long === 512,
    { files: files.length, bad: bad.slice(0, 5), long: RECORD.long });

  const recipeMiss = ALBUM.orn.filter((o) => !new RegExp("\\b" + o.id + "\\b").test(String(BUILDER.RECIPES))).map((o) => o.id);
  const textureMiss = ALBUM.ovl.filter((o) => !new RegExp("\\b" + o.id + "\\b").test(String(BUILDER.TEXTURES))).map((o) => o.id);
  report("A3) the generator draws exactly the catalogue: its recipe source names every ornament id and its texture source every overlay id (both evaluated inside Chromium), the record it writes is lib/album/ornaments.json, and it carries a --check mode",
    typeof BUILDER.RECIPES === "string" && typeof BUILDER.TEXTURES === "string" && recipeMiss.length === 0 && textureMiss.length === 0 &&
    /ornaments\.json$/.test(BUILDER.RECORD) && has(read("tools/build_album_ornaments.js"), '"--check"'), { recipeMiss, textureMiss });

  report("A4) the module: assetSrc asks the host first, ornBox is a fraction box (0.03–1.5 wide, height from the safe area's ratio and the mask's aspect), hitOrn walks the decor from the top, the shelf normaliser and its keys, the quality table, the confirm promise, the overlay layer in the PSD, a page's overlay field, and the twelve cards in order",
    /function assetSrc\(kind, file\)\{[\s\S]{0,60}typeof H\.asset === "function"/.test(MOD) &&
    /var ORN_W_MIN = 0\.03, ORN_W_MAX = 1\.5/.test(MOD) && /function ornBox\(d, safe\)\{/.test(MOD) && /var h = w \* \(safe\.w \/ safe\.h\) \/ ar;/.test(MOD) &&
    /function hitOrn\(pg, safe, px, py\)\{/.test(MOD) && /for \(i=list\.length-1;i>=0;i--\)\{/.test(MOD) &&
    /function normShelf\(sh\)\{/.test(MOD) && /var SHELF_KEY = "hnk_album_shelf_v1", SHELF = null, SHELF_MAX = 24, SHELF_NAME_MAX = 40;/.test(MOD) && /function docKey\(id\)/.test(MOD) &&
    /var PHOTO_MAX = \{ std: 2400, print: 4000 \}, QUALITY_KEY = "hnk_album_quality_v1", QUALITY = "std";/.test(MOD) &&
    /return Promise\.resolve\(H\.confirm\(msg\)\)\.then\(function\(v\)\{ return !!v; \}\)/.test(MOD) &&
    /name: "Overlay \(flat\)"/.test(MOD) && /paintPageSync\(x, pg, idx, safe, 1, 0\)/.test(MOD) &&
    /bleed:false, decor:\[\], story:-1, overlay:null \}; \}/.test(MOD) &&
    /ROOT\.appendChild\(shelfCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(occasionCard\(\)\);\n\s*ROOT\.appendChild\(sizeCard\(\)\);\n\s*ROOT\.appendChild\(pagesCard\(\)\);\n\s*ROOT\.appendChild\(stageCard\(\)\);\n\s*ROOT\.appendChild\(photosCard\(\)\);\n\s*ROOT\.appendChild\(layoutCard\(\)\);\n\s*ROOT\.appendChild\(designCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(ornCard\(\)\);[^\n]*\n\s*ROOT\.appendChild\(textCard\(\)\);\n\s*ROOT\.appendChild\(exportCard\(\)\);\n\s*ROOT\.appendChild\(checkCard\(\)\);/.test(MOD) &&
    /if \(H && typeof H\.openInPs === "function"\)\{/.test(MOD) && /ops\.id = "albOpenPs"/.test(MOD) &&
    /var ver = \(typeof APP_VER === "string"\) \? APP_VER : \(\(typeof PANEL_VERSION === "string"\) \? PANEL_VERSION : ""\);/.test(MOD) &&
    /ALBUM\.photoMax\(\) : 2400;/.test(APP) && /remove: function\(key\)\{ try \{ kvSet\(key, null\); \} catch\(e\)\{\} \}/.test(APP), null);

  report("A5) the block's CSS carries the shelf, the ornament tiles and the tint chips, names its cell children by tag (never `*`, which the panel's renderer forbids), and still draws no grid, no @media, no sticky and no pointer-events",
    /\.alb-shelftile/.test(CSS) && /\.alb-orntile/.test(CSS) && /\.alb-tintchip/.test(CSS) && /\.alb-shelf\{/.test(CSS) &&
    has(CSS, ".alb-cell>button,.alb-cell>div,.alb-cell>label,.alb-cell>span{") && has(CSS, ".alb-opts>select,.alb-opts>input,.alb-opts>label,.alb-opts>div,.alb-opts>button,.alb-opts>span{") &&
    !/>\*\{/.test(CSS_DECL) && !/display\s*:\s*grid/.test(CSS_DECL) && !/@media/.test(CSS_DECL) && !/position\s*:\s*sticky/.test(CSS_DECL) && !/pointer-events/.test(CSS_DECL), null);

  const dry = LIFTER.build({ dry: true });
  const sIdx = PALB.indexOf("globalThis.HNK.albumStrings = ");
  let S = null; try { S = JSON.parse(PALB.slice(sIdx + "globalThis.HNK.albumStrings = ".length, PALB.lastIndexOf(";"))); } catch (e) { S = null; }
  const lifted = LIFTER.strings(APP);
  report("A6) the lifter is idempotent and its output is the app's block byte for byte with the album JSON and the words inlined: hnk_album.js opens with the generated header, reads `var ALBUM_DATA = {…}` (never window.HNK_ALBUM), hangs ALBUM on HNK.album, and ships HNK.albumStrings with every alb_* key in all nine languages — and names its version through typeof, never the app's global",
    dry.changed.length === 0 && PALB.indexOf("/* GENERATED by tools/build_panel_album.js") === 0 && has(PALB, "var ALBUM_DATA = {") && !/window\.HNK_ALBUM/.test(PALB.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    has(PALB, "globalThis.HNK.album = ALBUM;") && has(PALB, "globalThis.HNK.albumData = ALBUM_DATA;") && !!S && Object.keys(S).length === Object.keys(lifted).length &&
    KEYS.every((k) => S[k] && LANGS.every((l) => typeof S[k][l] === "string" && S[k][l].length > 0)) && S.ph_album && LANGS.every((l) => S.ph_album[l]) &&
    (PALB.replace(/\/\*[\s\S]*?\*\//g, "").match(/APP_VER/g) || []).length === 2 && has(PALB, 'typeof APP_VER === "string"'),
    { changed: dry.changed, keys: S && Object.keys(S).length, lifted: Object.keys(lifted).length, appVer: (PALB.replace(/\/\*[\s\S]*?\*\//g, "").match(/APP_VER/g) || []).length });

  const appHead = (APP.match(/<p class="ph-head" id="phAlbum">(.*?)<\/p>/) || [])[1];
  const panelHead = (PIDX.match(/<p class="ph-head" id="phAlbum">(.*?)<\/p>/) || [])[1];
  const phLine = (MAIN.match(/\n  phAlbum: (\{.*?\}),/) || [])[1];
  let ph = null; try { ph = JSON.parse(phLine); } catch (e) { ph = null; }
  const phOk = !!ph && LANGS.every((l) => ph[l] === (TRPH.ph_album[l] || L14.ph_album[l]));
  const hostMembers = ["t", "pick9", "pickFiles", "wirePick", "confirm", "store", "restore", "remove", "saveGallery", "exportFile", "exportOut", "openInPs", "stageWidth", "asset", "toast"];
  const hostSrc = MAIN.slice(MAIN.indexOf("function albumHost()"), MAIN.indexOf("function albumEnter()"));
  report("A7) the panel: #pageAlbum after the Gallery with the app's banner, kicker and headline, #albRoot, js/hnk_album.js loaded after Imagine; main.js registers Library ▸ Album (i-frame), paints phAlbum from the app's nine-language row, enters the page through albumEnter, carries every host member, keeps album records in an album/ folder reachable through the test hook, and dresses the module's native selects as .hsl pickers",
    has(PIDX, '<div class="page apg" id="pageAlbum">') && has(PIDX, 'src="icons/banners/banner-fairy-forest.jpg"') && has(PIDX, '<div class="ph-kick">Album Pages</div>') &&
    !!appHead && appHead === panelHead && has(PIDX, '<div id="albRoot"></div>') && has(PIDX, '<script src="js/hnk_imagine.js"></script>\n<script src="js/hnk_album.js"></script>') &&
    /\{ key: "album",\s+page: "pageAlbum",\s+group: "lib",\s+sub: "Album",\s+ic: "i-frame" \}/.test(MAIN) && has(MAIN, 'if (key === "album") { try { albumEnter(); } catch (e) { hwarn("album:", e); } }') &&
    phOk && hostMembers.every((m) => new RegExp("\\n    " + m + ": (async )?function").test(hostSrc)) &&
    has(MAIN, 'const ALBUM_DIR = "album";') && has(MAIN, "function albumFs()") && has(MAIN, "globalThis.HNK.__uxpForTests") && has(MAIN, "function albumHslify(root)") && has(MAIN, "function albumHslWrap(sel)") &&
    has(MAIN, "REFRESHERS.push(function () { try { if (albumReady) albumEnter(); } catch (e) { } });") &&
    fs.existsSync(path.join(PANEL, "icons/ui/i-frame-muted.png")) && fs.existsSync(path.join(PANEL, "icons/ui/i-frame-hi.png")) &&
    PCSS.indexOf("/* ---- ALBUM_CSS") > PCSS.indexOf("/* ---- IMAGINE_CSS ---- */") && has(PCSS, "/* ---- /ALBUM_CSS ---- */") && has(PCSS, ".alb-shelftile") && has(PCSS, ".alb-orntile") && !has(PCSS, "#pgAlbum"),
    { appHead, panelHead, phOk, members: hostMembers.filter((m) => !new RegExp("\\n    " + m + ": (async )?function").test(hostSrc)) });

  report("A8) the tests that know every panel page know this one: the parity walk's row + its one panel-only line (Open in Photoshop), the banner walk (fifteen heroes), the glyph pass on the new lifter, the renderer-safety page list, the dictionary rule for a module that reads through L()",
    has(read("test/verify_panel_page_parity.js"), '{ key: "album", panelKey: "album", appKey: "pgAlbum", panelRoot: "#pageAlbum", appRoot: "#pgAlbum", label: "Album" }') &&
    has(read("test/verify_panel_page_parity.js"), '  album: [\n    "' + TRPH.alb_open_ps.my + '"\n  ],') &&
    has(read("test/verify_panel_hero_banners.js"), '["album", "pageAlbum"]') && has(read("test/verify_panel_hero_banners.js"), "heroes === 15") &&
    /"imagine", "tutorials", "album"\]/.test(read("test/verify_panel_glyphs.js")) && /"gallery", "album", "setup"\]/.test(read("test/verify_panel_renderer_safety.js")) &&
    has(read("test/verify_panel_dead_lookups.js"), 'const OWN_L = { "panel/js/hnk_album.js": 1 };'), null);

  const raw = Buffer.byteLength(APP);
  report("A9) shell headroom: TR_X (42 keys) · TR_NEW (12) · TR_L14 (238+) live in data/trmore.js as x · new · l14, the shell reads them with the same merge lines, its seven-language readers moved with them, and the file stays under the 3.20 MB ceiling",
    Object.keys(TRM.x || {}).length === 42 && Object.keys(TRM.new || {}).length === 12 && Object.keys(L14).length >= 238 &&
    has(APP, "var TR_X = (window.HNK_TRMORE || {}).x || {};") && has(APP, 'var TR_NEW = (window.HNK_TRMORE || {})["new"] || {};') && has(APP, "var TR_L14 = (window.HNK_TRMORE || {}).l14 || {};") &&
    has(APP, "Object.keys(TR_X).forEach(function(k){ if(TR[k]) Object.keys(TR_X[k]).forEach(function(l){ TR[k][l]=TR_X[k][l]; }); });") &&
    has(APP, "Object.keys(TR_L14).forEach(function(k){ var t7=TR_L14[k]; TR[k]=TR[k]||{}; Object.keys(t7).forEach(function(lg){ TR[k][lg]=t7[lg]; }); });") &&
    raw < 3200000 && has(read("tools/lib/app-data.js"), "TR_L14 (x · new · l14) followed in 6.122.0"),
    { x: Object.keys(TRM.x || {}).length, nw: Object.keys(TRM.new || {}).length, l14: Object.keys(L14).length, raw });
}

/* ===================== the app page ===================== */
async function openAlbum(browser, w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html?page=pgAlbum&lang=" + (lang || "en"), { waitUntil: "load" });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__mk = function (w, h, bg, headY) {
      const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
      x.fillStyle = bg; x.fillRect(0, 0, w, h);
      x.fillStyle = "#e0b090"; x.beginPath(); x.arc(w / 2, h * (headY == null ? 0.3 : headY), Math.min(w, h) * 0.14, 0, Math.PI * 2); x.fill();
      return c.toDataURL("image/jpeg", 0.85);
    };
    window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  });
  return { ctx, page, errors };
}

/* ===================== B) the arithmetic ===================== */
async function maths(page) {
  const b1 = await page.evaluate(() => {
    const M = ALBUM.math, safe = M.safeArea(M.sizeById("12x36"));
    const c1 = M.ornById("c1"), d1 = M.ornById("d1");
    const tiny = M.ornBox({ id: "c1", x: 0.2, y: 0.3, w: 0.001 }, safe), huge = M.ornBox({ id: "c1", w: 9 }, safe);
    const mid = M.ornBox({ id: "d1", x: 0.5, y: 0.5, w: 0.5, rot: 90, flip: 1 }, safe);
    return { ratio: safe.w / safe.h, c1ar: c1.ar, d1ar: d1.ar, tiny, huge, mid,
      midH: 0.5 * (safe.w / safe.h) / d1.ar, unknown: M.ornBox({ id: "nope", w: 0.2 }, safe).h, none: M.ornById("nope") };
  });
  report("B1) ornBox: the width is clamped to 0.03–1.5 of the safe area, the height follows the safe area's ratio and the mask's aspect (a 6:1 divider at half the width), the angle is read in degrees and kept in radians, flip is a boolean, and an unknown id draws square",
    b1.tiny.w === 0.03 && b1.huge.w === 1.5 && b1.tiny.x === 0.2 && b1.tiny.y === 0.3 &&
    Math.abs(b1.mid.h - b1.midH) < 1e-9 && Math.abs(b1.mid.rot - Math.PI / 2) < 1e-9 && b1.mid.flip === true && b1.tiny.flip === false &&
    Math.abs(b1.unknown - 0.2 * b1.ratio) < 1e-9 && b1.none === null && b1.d1ar > b1.c1ar, b1);

  const b2 = await page.evaluate(() => {
    const M = ALBUM.math, safe = M.safeArea(M.sizeById("12x36"));
    const pg = { decor: [{ kind: "orn", id: "c1", x: 0.25, y: 0.5, w: 0.1 }, { kind: "rule", x: 0.5, y: 0.5 }, { kind: "orn", id: "t1", x: 0.75, y: 0.5, w: 0.3, rot: 90 }] };
    const at = (fx, fy) => M.hitOrn(pg, safe, safe.x + safe.w * fx, safe.y + safe.h * fy);
    const b = M.ornBox(pg.decor[2], safe);
    return { first: at(0.25, 0.5), second: at(0.75, 0.5), miss: at(0.5, 0.05), rotated: at(0.75, 0.5 + b.w * 0.45), rule: pg.decor[1].kind, outside: at(-0.2, -0.2) };
  });
  report("B2) hitOrn: the topmost ornament under the point wins, a rule is never hit, a rotated tape is hit inside its turned box, and a point off every ornament answers -1",
    b2.first === 0 && b2.second === 2 && b2.miss === -1 && b2.rotated === 2 && b2.outside === -1, b2);

  const b3 = await page.evaluate(() => {
    const M = ALBUM.math;
    const junk = { v: 9, cur: "abc123", items: [{ id: "abc123", name: "x".repeat(80), pages: 0, photos: -3, thumb: "javascript:alert(1)" }, { id: "BAD ID" }, null, { id: "ok9", name: "Fine", pages: 3, photos: 7, thumb: "data:image/jpeg;base64,AAAA", updated: 5 }] };
    for (let i = 0; i < 40; i++) junk.items.push({ id: "z" + (100 + i), pages: 1 });
    const out = M.normShelf(junk), none = M.normShelf(null), str = M.normShelf({ cur: 7 });
    return { n: out.items.length, cur: out.cur, name0: out.items[0].name.length, pages0: out.items[0].pages, photos0: out.items[0].photos, thumb0: out.items[0].thumb, ok: out.items[1], noneN: none.items.length, noneCur: none.cur, strCur: str.cur, v: out.v };
  });
  report("B3) normShelf: never more than twenty-four entries, ids only [a-z0-9]{3,24}, names cut at forty, pages at least one, photos never negative, a thumbnail only if it is a data: image, cur only if it is a string",
    b3.n === 24 && b3.cur === "abc123" && b3.name0 === 40 && b3.pages0 === 1 && b3.photos0 === 0 && b3.thumb0 === "" &&
    b3.ok.id === "ok9" && b3.ok.name === "Fine" && b3.ok.pages === 3 && b3.ok.photos === 7 && b3.ok.thumb.indexOf("data:image/") === 0 && b3.ok.updated === 5 &&
    b3.noneN === 0 && b3.noneCur === "" && b3.strCur === "" && b3.v === 1, b3);

  const b4 = await page.evaluate(() => {
    const M = ALBUM.math, T = window.HNK_ALBUM.tints;
    return { rose: M.tintHex("rose") === T.rose, hex: M.tintHex("#ABCdef"), bad: M.tintHex("#12"), unknown: M.tintHex("nope") === T.gold, gold: M.tintHex("gold") === T.gold, ovl: M.ovlById("vignette") && M.ovlById("vignette").id, noOvl: M.ovlById("nope") };
  });
  report("B4) tintHex names the five tints, passes a six-digit hex through and falls back to gold; ovlById answers the five overlays and nothing else",
    b4.rose && b4.hex === "#ABCdef" && b4.bad !== "#12" && b4.unknown && b4.gold && b4.ovl === "vignette" && b4.noOvl === null, b4);
}

/* ===================== C) the walk ===================== */
async function walk(browser) {
  const { page, errors } = await openAlbum(browser, 390, 844, "en");
  const c1 = await page.evaluate(() => ({
    cards: [...document.querySelectorAll("#albRoot > section.card")].map((s) => s.id),
    tiles: document.querySelectorAll("#albShelf .alb-shelftile").length, ops: ["albShelfNew", "albShelfDup", "albShelfRen", "albShelfDel"].filter((id) => !document.getElementById(id)),
    qual: [...document.querySelectorAll("#albQuality .chip")].map((c) => c.id + (c.classList.contains("on") ? "*" : "")),
    fams: document.querySelectorAll("#albOrnFams .chip").length, orn: document.querySelectorAll("#albOrns .alb-orntile").length,
    ornSrc: (document.querySelector("#albOrn_c1 img") || {}).getAttribute ? document.querySelector("#albOrn_c1 img").getAttribute("src") : null,
    ovl: [...document.querySelectorAll("#albOvls .chip")].map((c) => c.id), amts: document.querySelectorAll("#albOvlAmts .chip").length, all: !!document.getElementById("albOvlAll"),
    openPs: !!document.getElementById("albOpenPs"), max: ALBUM.photoMax(), q: ALBUM.quality(), albums: ALBUM.albums().items.length
  }));
  report("C1) the empty page on a 390px phone: the twelve cards in order (the shelf first, the ornaments after the design), one album on the shelf with its four buttons, Standard chosen at 2,400 px, seven family chips over twenty-four ornament tiles drawn from lib/album/orn, six overlay chips (the three strengths appear once an overlay is chosen) and Apply to every page, and no Open in Photoshop door in a browser",
    c1.cards.join() === CARDS && c1.tiles === 1 && c1.ops.length === 0 && c1.qual.join() === "albQual_std*,albQual_print" && c1.fams === 7 && c1.orn === 24 &&
    c1.ornSrc === "lib/album/orn/c1.png" && c1.ovl.join() === "albOvl_none,albOvl_grain,albOvl_vignette,albOvl_leak,albOvl_dust,albOvl_paper" && c1.amts === 0 && c1.all &&
    !c1.openPs && c1.max === 2400 && c1.q === "std" && c1.albums === 1, c1);

  const c2 = await page.evaluate(async () => {
    const bgs = ["#2a4a6a", "#20304a", "#6a3a2a", "#3a5a3a", "#4a2a5a", "#5a5a2a"];
    const urls = bgs.map((bg, i) => window.__mk(i % 3 === 0 ? 900 : 600, i % 3 === 0 ? 600 : 900, bg));
    await ALBUM.accept(urls, "album"); await window.__wait(1500);
    const sh = ALBUM.albums(), it = sh.items[0];
    return { pages: ALBUM.doc().pages.length, items: sh.items.length, cur: sh.cur === it.id, itPages: it.pages, itPhotos: it.photos, pool: ALBUM.doc().pool.length };
  });
  report("C2) Make the album with six photographs: the pages are laid, and the shelf's entry counts them — its page count is the album's, its photo count the tray's",
    c2.pages >= 2 && c2.items === 1 && c2.cur && c2.itPages === c2.pages && c2.itPhotos === 6 && c2.pool === 6, c2);

  const c3 = await page.evaluate(async () => {
    const first = ALBUM.albums().cur, firstPages = ALBUM.doc().pages.length;
    ALBUM.newAlbum(); await window.__wait(300);
    const afterNew = { items: ALBUM.albums().items.length, cur: ALBUM.albums().cur, pages: ALBUM.doc().pages.length, photos: ALBUM.doc().pool.length };
    ALBUM.renameAlbum("Kyaw & Su"); await window.__wait(200);
    const name = document.querySelector("#albShelf .alb-shelftile.on .alb-shelfname").textContent;
    await ALBUM.openAlbum(first); await window.__wait(600);
    const opened = { cur: ALBUM.albums().cur, pages: ALBUM.doc().pages.length };
    ALBUM.duplicateAlbum(); await window.__wait(400);
    const dup = ALBUM.albums(), copy = dup.items.find((i) => i.id === dup.cur);
    await ALBUM.deleteAlbum(); await window.__wait(600);
    const afterDel = ALBUM.albums();
    await ALBUM.openAlbum(first); await window.__wait(400);
    ALBUM.setDoc(ALBUM.doc()); await window.__wait(2400);           /* a save draws the thumbnail 1.5 s later */
    const thumb = (ALBUM.albums().items.find((i) => i.id === first) || {}).thumb === true &&
      /^data:image\//.test((document.querySelector("#albShelf .alb-shelftile.on img.alb-tileimg") || {}).getAttribute ? document.querySelector("#albShelf .alb-shelftile.on img.alb-tileimg").getAttribute("src") : "");
    return { first, firstPages, afterNew, name, opened, dupN: dup.items.length, copyPages: copy && copy.pages, copyIsNew: copy && copy.id !== first, afterDelN: afterDel.items.length, afterDelCur: afterDel.cur, names: afterDel.items.map((i) => i.name), thumb };
  });
  report("C3) the shelf: New opens a blank second album (one page, no photographs) and moves the pointer, Rename writes the tile's name, opening the first brings its pages back, Duplicate makes a third with the same page count, Delete (confirmed) takes it away and opens a neighbour, and a saved album grows a thumbnail",
    c3.afterNew.items === 2 && c3.afterNew.cur !== c3.first && c3.afterNew.pages === 1 && c3.afterNew.photos === 0 && c3.name === "Kyaw & Su" &&
    c3.opened.cur === c3.first && c3.opened.pages === c3.firstPages && c3.dupN === 3 && c3.copyPages === c3.firstPages && c3.copyIsNew &&
    c3.afterDelN === 2 && c3.afterDelCur && c3.names.indexOf("Kyaw & Su") >= 0 && c3.thumb, c3);

  const c4 = await page.evaluate(async () => {
    await ALBUM.openAlbum(ALBUM.albums().items.find((i) => i.name !== "Kyaw & Su").id); await window.__wait(500);
    const d = ALBUM.doc(); d.cur = 1; ALBUM.setDoc(d); await window.__wait(300);
    const all = document.querySelectorAll("#albOrns .alb-orntile").length;
    document.getElementById("albOrnFam_corner").click(); await window.__wait(200);
    const corner = document.querySelectorAll("#albOrns .alb-orntile").length, famOn = (document.querySelector("#albOrnFams .chip.on") || {}).id;
    const n0 = ALBUM.doc().pages[1].decor.length;
    document.getElementById("albOrn_c1").click(); await window.__wait(400);
    const sel1 = ALBUM.sel(), orns1 = ALBUM.doc().pages[1].decor.filter((x) => x.kind === "orn").map((x) => x.id), n1 = ALBUM.doc().pages[1].decor.length;
    const bar = [...document.querySelectorAll("#albSelBox button")].map((b) => b.id).filter(Boolean);
    ALBUM.setTint("rose"); ALBUM.flip(); ALBUM.duplicate(); await window.__wait(300);
    const decor2 = ALBUM.doc().pages[1].decor, orns2 = decor2.filter((x) => x.kind === "orn"), sel2 = ALBUM.sel();
    return { all, corner, famOn, sel1, n0, n1, orns1, bar, n2: orns2.length, second: { tint: orns2[1].tint, flip: !!orns2[1].flip, id: orns2[1].id, moved: orns2[1].x !== orns2[0].x || orns2[1].y !== orns2[0].y }, firstTint: orns2[0].tint, firstFlip: !!orns2[0].flip, sel2, last: decor2.length - 1 };
  });
  report("C4) ornaments: the Corners chip narrows twenty-four tiles to four, one tap on c1 puts it on the page above the engine's rules and selects it, the selection bar offers the five tints · Flip · Duplicate · Remove, Rose tints it, Flip mirrors it, and Duplicate makes a second copy beside it that takes the selection",
    c4.all === 24 && c4.corner === 4 && c4.famOn === "albOrnFam_corner" && c4.sel1 && c4.sel1.kind === "decor" && c4.sel1.i === c4.n0 && c4.n1 === c4.n0 + 1 && c4.orns1.join() === "c1" &&
    ["albTint_gold", "albTint_white", "albTint_ink", "albTint_rose", "albTint_sage", "albSelFlip", "albSelDup", "albSelRemove"].every((id) => c4.bar.indexOf(id) >= 0) &&
    c4.n2 === 2 && c4.firstTint === "rose" && c4.firstFlip && c4.second.tint === "rose" && c4.second.flip && c4.second.id === "c1" && c4.second.moved && c4.sel2 && c4.sel2.i === c4.last, c4);

  const c5 = await page.evaluate(async () => {
    const cv = document.getElementById("albCanvas"), sz = ALBUM.math.sizeById(ALBUM.doc().sizeId), sf = ALBUM.math.safeArea(sz), px = ALBUM.math.pagePx(sz);
    const i = ALBUM.sel().i, d = ALBUM.doc().pages[1].decor[i];
    const rect = cv.getBoundingClientRect(), k = rect.width / px.w;
    const cx = rect.left + (sf.x + sf.w * d.x) * k, cy = rect.top + (sf.y + sf.h * d.y) * k;
    const x0 = d.x, w0 = d.w;
    cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, pointerId: 1, bubbles: true }));
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: cx + 30, clientY: cy + 10, pointerId: 1, bubbles: true }));
    cv.dispatchEvent(new PointerEvent("pointerup", { clientX: cx + 30, clientY: cy + 10, pointerId: 1, bubbles: true }));
    await window.__wait(300);
    const j = ALBUM.sel().i, x1 = ALBUM.doc().pages[1].decor[j].x;
    cv.dispatchEvent(new WheelEvent("wheel", { clientX: cx + 30, clientY: cy + 10, deltaY: -100, bubbles: true, cancelable: true }));
    await window.__wait(200);
    const w1 = ALBUM.doc().pages[1].decor[j].w;
    ALBUM.undo(); await window.__wait(200);
    const w2 = ALBUM.doc().pages[1].decor[j].w;
    return { x0, x1, w0, w1, w2, sameOrn: i === j };
  });
  report("C5) touch: a pointer drag moves the selected ornament to the right, a wheel over it scales it up, and undo takes the scale back",
    c5.sameOrn && c5.x1 > c5.x0 && c5.w1 > c5.w0 && Math.abs(c5.w2 - c5.w0) < 1e-9, c5);

  const c6 = await page.evaluate(async () => {
    const cv = document.getElementById("albCanvas"), x = cv.getContext("2d"), px = ALBUM.math.pagePx(ALBUM.math.sizeById(ALBUM.doc().sizeId));
    const samp = () => { const id = x.getImageData(Math.round(cv.width * 0.5), Math.round(cv.height * 0.1), 1, 1).data; return [id[0], id[1], id[2]]; };
    await ALBUM.__drawForTest(cv, 1, { scale: cv.width / px.w }); const before = samp();
    ALBUM.setOverlay("vignette", "strong"); await window.__wait(400);
    await ALBUM.__drawForTest(cv, 1, { scale: cv.width / px.w }); const after = samp();
    const ov = ALBUM.doc().pages[1].overlay;
    const chips = [...document.querySelectorAll("#albOvlAmts .chip")].map((c) => c.id + (c.classList.contains("on") ? "*" : ""));
    const ovlOn = (document.querySelector("#albOvls .chip.on") || {}).id;
    ALBUM.overlayAll(); await window.__wait(300);
    const everyPage = ALBUM.doc().pages.map((p) => (p.overlay ? p.overlay.id + "/" + p.overlay.amount : "-"));
    return { before, after, ov, chips, ovlOn, everyPage };
  });
  report("C6) overlays: a strong vignette changes the stage's pixels, the page records id + strength, the Vignette and Strong chips light, and Apply to every page writes the same overlay onto every page",
    c6.before.join() !== c6.after.join() && c6.ov && c6.ov.id === "vignette" && c6.ov.amount === "strong" && c6.chips.indexOf("albOvlAmt_strong*") >= 0 &&
    c6.ovlOn === "albOvl_vignette" && c6.everyPage.length >= 2 && c6.everyPage.every((p) => p === "vignette/strong"), c6);

  const c7 = await page.evaluate(async () => {
    const q0 = [ALBUM.quality(), ALBUM.photoMax()];
    document.getElementById("albQual_print").click(); await window.__wait(300);
    return { q0, q1: [ALBUM.quality(), ALBUM.photoMax(), document.getElementById("albQual_print").classList.contains("on"), document.getElementById("albQual_std").classList.contains("on")] };
  });
  report("C7) Photo quality: Standard is 2,400 px on the long edge until the Print chip is tapped, then 4,000 px and the chip lights",
    c7.q0.join() === "std,2400" && c7.q1[0] === "print" && c7.q1[1] === 4000 && c7.q1[2] === true && c7.q1[3] === false, c7);

  const c8 = await page.evaluate(async () => {
    const n0 = ALBUM.doc().pages[1].decor.filter((d) => d.kind === "orn").length;
    ALBUM.select("decor", 1); await window.__wait(100);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); await window.__wait(200);
    const n1 = ALBUM.doc().pages[1].decor.filter((d) => d.kind === "orn").length;
    const reach = ["#albShelf .alb-shelftile", "#albOrns .alb-orntile", "#albQuality .chip", "#albOvls .chip", "#albOvlAmts .chip", "#albOrnFams .chip"].map((s) => {
      const els = [...document.querySelectorAll(s)]; const h = els.map((e) => e.getBoundingClientRect().height); return { s, n: els.length, min: Math.min.apply(null, h) };
    });
    return { n0, n1, reach };
  });
  report("C8) Delete removes the selected ornament, and every new control on the page (shelf tiles, ornament tiles, family / quality / overlay / strength chips) stands at least 40px tall on a phone — the wave D reach rule",
    c8.n0 === 2 && c8.n1 === 1 && c8.reach.every((r) => r.n > 0 && r.min >= 40), c8);

  const c9 = await page.evaluate(async () => {
    const bytes = await ALBUM.psd();
    const txt = new TextDecoder("latin1").decode(bytes.subarray(0, 6000));
    return { bytes: bytes.length, overlay: txt.indexOf("Overlay (flat)") >= 0, design: txt.indexOf("Design") >= 0, bg: txt.indexOf("Background") >= 0 };
  });
  report("C9) the layered PSD of the overlaid page carries an \"Overlay (flat)\" layer above the Design layer and the Background",
    c9.bytes > 100000 && c9.overlay && c9.design && c9.bg, c9);

  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(2200);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} }); await page.waitForTimeout(900);
  const c10 = await page.evaluate(() => {
    const sh = ALBUM.albums();
    return { items: sh.items.length, names: sh.items.map((i) => i.name), pages: ALBUM.doc().pages.length, decor: ALBUM.doc().pages[1].decor.filter((d) => d.kind === "orn").map((d) => d.id + ":" + d.tint), overlay: ALBUM.doc().pages[1].overlay, q: ALBUM.quality(), tiles: document.querySelectorAll("#albShelf .alb-shelftile").length };
  });
  report("C10) a reload brings everything back from the store: both albums on the shelf with their names, the open album's pages, the rose c1 on page two, the strong vignette, and Print quality",
    c10.items === 2 && c10.names.indexOf("Kyaw & Su") >= 0 && c10.pages >= 2 && c10.decor.join() === "c1:rose" && c10.overlay && c10.overlay.id === "vignette" && c10.overlay.amount === "strong" && c10.q === "print" && c10.tiles === 2, c10);
  report("C11) no page error through the whole walk", errors.length === 0, errors.slice(0, 5));
  await page.context().close();
}

/* ===================== D) the languages ===================== */
function languages() {
  const missing = [];
  KEYS.forEach((k) => {
    const b = TRPH[k];
    if (!b || typeof b.my !== "string" || !b.my || typeof b.en !== "string" || !b.en) missing.push(k + "/base");
    L7.forEach((l) => { if (!L14[k] || typeof L14[k][l] !== "string" || !L14[k][l]) missing.push(k + "/" + l); });
  });
  const used = KEYS.filter((k) => MOD.indexOf('"' + k + '"') > 0 || MOD.indexOf('"' + k.replace(/_(gold|white|ink|rose|sage|corner|divider|frame|botanic|shape|tape|grain|vignette|leak|dust|paper|light|medium|strong|std|print|none)$/, "_") + '"') > 0);
  report("D1) the fifty-seven new lines are in the studio's nine languages — the my/en row in the shell's TR_PH table, the seven-language row in data/trmore.js — and every one is used by the module, by name or by its prefix",
    KEYS.length === 57 && missing.length === 0 && used.length === KEYS.length, { missing: missing.slice(0, 8), unused: KEYS.filter((k) => used.indexOf(k) < 0) });

  const TRL = A.readTrl();
  const short = [], ph = [];
  PACKS.forEach((c) => KEYS.forEach((k) => {
    const v = TRL[c] && TRL[c][k];
    if (typeof v !== "string" || !v) { short.push(c + ":" + k); return; }
    const want = (TRPH[k].en.match(/\{[A-Z]\}/g) || []).sort().join(), got = (v.match(/\{[A-Z]\}/g) || []).sort().join();
    if (want !== got) ph.push(c + ":" + k);
  }));
  report("D2) the fifteen reader packs carry all fifty-seven with the English placeholders intact, and the sweep registers the wave (V61220_KEYS) in its three pending rows",
    short.length === 0 && ph.length === 0 && /const V61220_KEYS = \[/.test(SWEEP) && (SWEEP.match(/\.\.\.V61220_KEYS\]/g) || []).length === 3, { short: short.slice(0, 6), ph: ph.slice(0, 6) });
}

/* ===================== E) release ===================== */
function releasePins() {
  const LANDING_CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "");
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  report(`E1) ${VER} / panel ${PVER} in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json, the download footer, the landing's badges`,
    has(APP, `var APP_VER="${VER}";`) && has(read("docs/app/version.json"), `"v":"${VER}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v6-122-0";') &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) && has(MAIN, `const PANEL_VERSION = "${PVER}";`) && has(read("panel/manifest.json"), `"version": "${PVER}"`) &&
    manifest.version === PVER && manifest.artifact_file === `HNK_Ai_Panel_v${PVER}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === PVER && pv.latest_version === PVER && has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`) &&
    has(LANDING, VER) && has(LANDING, PVER) && !has(LANDING_CLAIMS, "6.121.0") && !has(LANDING_CLAIMS, "6.192.0"), { manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows[0];
  report(`E2) the What's New strip leads with the ${VER} row — a bold lead, title and story in all nine languages, pointing at the Album page — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgAlbum" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40 && row.s[l].startsWith("**")) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("E3) CI runs this test right after the album designer and the landing says how many tests the suite runs (264 when this wave shipped, 265 since 6.123.0 added verify_prop_wave_h)",
    has(CI, "run: PORT=8931 node test/verify_album_designer.js\n") && has(CI, "run: PORT=8931 node test/verify_album_wave_g.js") && CI.indexOf("verify_album_designer") < CI.indexOf("verify_album_wave_g") &&
    (CI.match(/node test\//g) || []).length === 265 && has(LANDING, "265 tests") && !has(LANDING, "263 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

/* ===================== F) the panel ===================== */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const errs = [];
  async function boot(W, seed) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(W + ": " + String(e).slice(0, 200)));
    await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;" +
      (seed ? " window.__seed = " + JSON.stringify(seed) + "; (async function(){ var alb = await window.__fx.root.createFolder('album'); for (var n in window.__seed) { var f = await alb.createFile(n); await f.write(window.__seed[n]); } })();" : ""));
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => switchPage("album")); await page.waitForTimeout(1500);
    return { ctx, page };
  }
  const { page } = await boot(400, null);
  const f1 = await page.evaluate(() => {
    const S = HNK.albumStrings;
    return {
      on: document.getElementById("pageAlbum").className, cards: [...document.querySelectorAll("#albRoot > section.card")].map((s) => s.id),
      kick: document.querySelector("#pageAlbum .ph-kick").textContent, head: document.getElementById("phAlbum").textContent,
      shelfH: (document.querySelector("#albShelfCard h2") || {}).textContent, shelfWord: S.alb_shelf_h.my,
      openPs: (document.getElementById("albOpenPs") || {}).textContent, openWord: S.alb_open_ps.my,
      orn: document.querySelectorAll("#albOrns .alb-orntile").length, ornSrc: document.querySelector("#albOrn_c1 img").getAttribute("src"),
      hslN: document.querySelectorAll("#albRoot .hsl .hsl-val").length, unitWrapped: !!document.querySelector("#albRoot .hsl select#albCustomUnit"),
      unitLabel: (document.querySelector("#albRoot .hsl.hsl-for-albCustomUnit .hsl-val") || {}).textContent, subtab: [...document.querySelectorAll("#subtabs .subtab")].map((b) => b.textContent.trim())
    };
  });
  const appHeadText = (TRPH.ph_album.my || "").replace(/<\/?em>/g, "");
  report("F1) in the panel the Album page opens under Library ▸ Album with the app's kicker and Burmese headline, the same twelve cards, the shelf's heading and the Open in Photoshop door from HNK.albumStrings, twenty-four ornament tiles from icons/album/orn, and the module's native selects dressed as .hsl pickers (the unit picker reads \"in\")",
    /\bon\b/.test(f1.on) && f1.cards.join() === CARDS && f1.kick === "Album Pages" && f1.head === appHeadText &&
    typeof f1.shelfH === "string" && f1.shelfH.indexOf(f1.shelfWord) === 0 && f1.openPs === f1.openWord && f1.orn === 24 && f1.ornSrc === "icons/album/orn/c1.png" &&
    f1.hslN >= 1 && f1.unitWrapped && f1.unitLabel === "in" && f1.subtab.indexOf("Album") >= 0, f1);

  const f2 = await page.evaluate(async () => {
    const mk = (w, h, bg) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h); return c.toDataURL("image/jpeg", 0.85); };
    HNK.album.accept([mk(900, 600, "#2a4a6a"), mk(600, 900, "#6a3a2a")], "page");
    await new Promise((r) => setTimeout(r, 1500));
    const photos = HNK.album.doc().pages[0].photos.length;
    document.getElementById("albOrn_c1").click(); await new Promise((r) => setTimeout(r, 400));
    const decor = HNK.album.doc().pages[0].decor.map((d) => d.kind + ":" + d.id);
    document.getElementById("albQual_print").click(); await new Promise((r) => setTimeout(r, 300));
    const photoMax = HNK.album.photoMax();
    HNK.album.renameAlbum("Panel Kyaw"); await new Promise((r) => setTimeout(r, 900));
    const name = document.querySelector("#albShelf .alb-shelftile.on .alb-shelfname").textContent;
    const alb = window.__fx.root._ents.get("album");
    const files = alb ? Array.from(alb._ents.keys()) : [];
    const dump = {}; if (alb) for (const [n, f] of alb._ents) dump[n] = await f.read({ format: "utf8" });
    return { photos, decor, photoMax, name, files, dump };
  });
  report("F2) two photographs from the host land on the page, an ornament tile puts c1 on it, the Print chip raises the long edge to 4,000 px, a rename reaches the tile — and every record is a JSON file in the plugin's album/ folder (the shelf, the album, the quality)",
    f2.photos === 2 && f2.decor.join() === "orn:c1" && f2.photoMax === 4000 && f2.name === "Panel Kyaw" &&
    f2.files.indexOf("hnk_album_shelf_v1.json") >= 0 && f2.files.indexOf("hnk_album_quality_v1.json") >= 0 && f2.files.some((f) => /^hnk_album_doc_v1_[a-z0-9]+\.json$/.test(f)) && f2.files.length === 3, { photos: f2.photos, decor: f2.decor, photoMax: f2.photoMax, name: f2.name, files: f2.files });
  await page.context().close();

  const { page: p2 } = await boot(320, f2.dump);
  const f3 = await p2.evaluate(() => ({
    name: (document.querySelector("#albShelf .alb-shelftile.on .alb-shelfname") || {}).textContent, photos: HNK.album.doc().pages[0].photos.length,
    decor: HNK.album.doc().pages[0].decor.filter((d) => d.kind === "orn").length, q: HNK.album.quality(), photoMax: HNK.album.photoMax(),
    cards: document.querySelectorAll("#albRoot > section.card").length, scrollW: document.documentElement.scrollWidth, rootW: document.getElementById("albRoot").getBoundingClientRect().width
  }));
  report("F3) a relaunch over the same data folder brings the album back — its name, its two photographs, the ornament and Print quality — and at 320px the page holds its width with no horizontal scroll",
    f3.name === "Panel Kyaw" && f3.photos === 2 && f3.decor === 1 && f3.q === "print" && f3.photoMax === 4000 && f3.cards === 12 && f3.scrollW <= 320 && f3.rootW > 200, f3);
  await p2.context().close();
  report("F4) no panel error on either width", errs.length === 0, errs.slice(0, 5));
  server.close();
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const { page } = await openAlbum(browser, 1280, 900, "en");
    await maths(page);
    await page.context().close();
    await walk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  languages();
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — twenty-four ornaments and five overlays reach every export, the shelf keeps twenty-four albums, Print quality tells the truth, and the Album page runs inside Photoshop on the same module.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
