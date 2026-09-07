/* Imagine W2 (6.30.0) — seven more one-tap tools on the W1 shell: Describe Edit, Architecture, ID Photo, Product Enhance,
 * Product Background, Background Replace, Outfit Change. An eighth, Color Tone + Skin (twenty-eight preset cards, five swatches
 * and a mood line per tile), is built but held back until the owner chooses its pictures; when IMAGINE_DATA carries it, the
 * checks marked HAS_CT run too. Same module, same hub, same tool view — what is NEW and pinned here:
 *   A) the roster (the W1 four + the W2 tools, every template counted, nine languages), the icons on BOTH surfaces, and each tool's own KEEP / AVOID
 *      line where the shared identity lock would forbid the very thing the tool does (Outfit changes clothes; Product and
 *      Architecture have no person) — with the no-studio-gear rule on every line; the lane's jobs; the brand-model art;
 *      the What's New row; the CI step.
 *   B) in the browser: the prompt the page would send honours those lines, the hub shows every card, the new tools open.
 * verify_imagine_w1.js keeps the shared behaviour (hub compare, tiles, mocked Apply, cache rule for the W1 files).
 *
 * Usage: PORT=8931 node test/verify_imagine_w2.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");   /* Imagine sits behind the studio's sign-in: a guest is sent back to Home */

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel/js/hnk_imagine.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const lifter = require("../tools/build_panel_imagine.js");
const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
const DATA = (() => { const a = mod.indexOf("var IMAGINE_DATA = ") + "var IMAGINE_DATA = ".length, b = mod.indexOf(";\nvar IMAGINE = (function(){", a); return new Function("return " + mod.slice(a, b))(); })();
const JOBS = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs_w2.json"), "utf8")).jobs;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = o => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].length > 0);
const HAS_CT = DATA.tools.some(t => t.id === "colortone");   /* Color Tone + Skin: held back until the owner picks its pictures */
const W2 = { describe: 12, architecture: 15, idphoto: 12, product: 12, productbg: 15, background: 15, outfit: 15 }; if (HAS_CT) W2.colortone = 28;
const ORDER = ["lighting", "portrait", "surface", "weather"].concat(Object.keys(W2));
const NW2 = Object.keys(W2).length, THUMBS = Object.values(W2).reduce((a, b) => a + b, 0), TOTAL = 54 + THUMBS, WORD = { 11: "eleven", 12: "twelve" }[ORDER.length];
const PERSON = ["describe", "idphoto", "background", "outfit"].concat(HAS_CT ? ["colortone"] : []), OBJECT = ["architecture", "product", "productbg"];
const GEAR = /NO STUDIO GEAR IN THE FRAME/;
const ART = path.join(ROOT, "docs/app/lib/wf/imagine"), PART = path.join(ROOT, "panel/icons/imagine");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
function jpegSize(file) {
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); }
  return null;
}
const byId = Object.fromEntries(DATA.tools.map(t => [t.id, t]));

/* ---------------- A) the source, both surfaces ---------------- */
report("A1) the roster is the W1 four followed by the " + NW2 + " W2 tools, " + TOTAL + " templates, every name and summary in nine languages, {P} in every base prompt",
  DATA.tools.map(t => t.id).join(",") === ORDER.join(",") && Object.keys(W2).every(id => byId[id] && byId[id].presets.length === W2[id]) &&
  DATA.tools.reduce((n, t) => n + t.presets.length, 0) === TOTAL &&
  Object.keys(W2).every(id => all9(byId[id].name) && all9(byId[id].sum) && /\{P\}/.test(byId[id].basePrompt) && byId[id].presets.every(p => all9(p.name) && p.p.length > 30) && new Set(byId[id].presets.map(p => p.id)).size === byId[id].presets.length),
  { ids: DATA.tools.map(t => t.id), counts: DATA.tools.map(t => t.presets.length) });

const icons = Object.keys(W2).map(id => ({ id, ic: byId[id].ic, app: new RegExp('<symbol id="' + byId[id].ic + '"').test(APP), panel: fs.existsSync(path.join(ROOT, "panel/icons/ui", byId[id].ic + "-cream.svg")) }));
report("A2) every W2 tool's icon exists in the app's sprite AND as the panel's icons/ui/<name>-cream.svg (i-home joined the panel for Architecture)",
  icons.every(i => i.app && i.panel), icons.filter(i => !(i.app && i.panel)));

const frame = Object.keys(W2).map(id => { const t = byId[id]; return { id, keep: !!t.keep, avoid: !!t.avoid, gear: GEAR.test(t.avoid || DATA.frame.avoid) }; });
report("A3) each tool's frame line: Describe, Architecture, ID Photo, both Product tools and Outfit" + (HAS_CT ? " and Color Tone (TONE LOCK)" : "") + " carry their own KEEP + AVOID (Outfit's lock frees only the clothing and forbids revealing dress, Product's is a PRODUCT LOCK, Architecture's a STRUCTURE LOCK, ID Photo keeps the hairline, Describe changes only what was asked); Background rides the shared lock; every AVOID line ends with the no-studio-gear rule",
  frame.filter(f => f.id !== "background").every(f => f.keep && f.avoid) && !byId.background.keep && !byId.background.avoid && frame.every(f => f.gear) &&
  /only the clothing/.test(byId.outfit.keep) && /revealing or inappropriate clothing/.test(byId.outfit.avoid) &&
  /PRODUCT LOCK/.test(byId.product.keep) && /PRODUCT LOCK/.test(byId.productbg.keep) && /STRUCTURE LOCK/.test(byId.architecture.keep) &&
  /hairline/.test(byId.idphoto.keep) && /change only what the edit describes/.test(byId.describe.keep) && (!HAS_CT || (/TONE LOCK/.test(byId.colortone.keep) && /change ONLY the colour grade/.test(byId.colortone.keep) && /plastic or waxy skin/.test(byId.colortone.avoid))) &&
  /\(tool\.keep \|\| D\.frame\.keep\)/.test(mod) && /\(tool\.avoid \|\| D\.frame\.avoid\)/.test(mod) &&
  /\(tool\.keep \|\| D\.frame\.keep\)/.test(PANEL_JS) && PANEL_JS.indexOf('"id":"outfit"') >= 0, frame);

const bases = JOBS.filter(j => /^base-/.test(j.name)), thumbs = JOBS.filter(j => /^th-/.test(j.name));
const badBase = bases.filter(j => { const id = j.name.slice(5); return PERSON.indexOf(id) >= 0 ? !(Array.isArray(j.refs) && j.refs.length === 2 && /\/edit$/.test(j.apiPath)) : OBJECT.indexOf(id) >= 0 ? !(!j.refs && /text-to-image$/.test(j.apiPath) && !/reference/i.test(j.prompt)) : true; });
const badThumb = thumbs.filter(j => { const id = j.name.split("-")[1], t = byId[id]; return !t || j.baseFrom !== "base-" + id || !GEAR.test(j.prompt) || (t.keep && j.prompt.indexOf(t.keep) < 0) || (t.avoid && j.prompt.indexOf(t.avoid) < 0) || (!t.keep && j.prompt.indexOf(DATA.frame.keep) < 0); });
report("A4) the lane's W2 jobs: " + NW2 + " bases — the person tools as identity edits from the two brand-model references, the three object tools as text-to-image with no reference — and " + THUMBS + " thumbnails that build on their base and end with their tool's own frame lines and the gear rule",
  bases.length === NW2 && thumbs.length === THUMBS && !badBase.length && !badThumb.length, { badBase: badBase.map(j => j.name), badThumb: badThumb.slice(0, 5).map(j => j.name) });

const shapes = Object.keys(W2).map(id => { const t = byId[id]; const b = fs.existsSync(path.join(ART, t.before)) && jpegSize(path.join(ART, t.before)), a = fs.existsSync(path.join(ART, t.after)) && jpegSize(path.join(ART, t.after));
  const th = t.presets.map(p => { const f = path.join(ART, "th/" + id + "-" + p.id + ".jpg"); const s = fs.existsSync(f) && jpegSize(f); return s && Math.abs(s.w / s.h - 2 / 3) < 0.01 && s.w >= 400 && fs.existsSync(path.join(PART, "th/" + id + "-" + p.id + ".jpg")) && fs.readFileSync(f).equals(fs.readFileSync(path.join(PART, "th/" + id + "-" + p.id + ".jpg"))); });
  return { id, cards: !!(b && a && b.w === a.w && b.h === a.h && Math.abs(b.w / b.h - 2 / 3) < 0.01 && b.w >= 600), panelCards: fs.existsSync(path.join(PART, t.before)) && fs.existsSync(path.join(PART, t.after)) && fs.readFileSync(path.join(ART, t.before)).equals(fs.readFileSync(path.join(PART, t.before))), thumbs: th.filter(Boolean).length, want: t.presets.length }; });
report("A5) the " + NW2 + " card pairs are 2:3 at one size (≥600 wide) and the " + THUMBS + " thumbnails whole 2:3 pictures ≥400 wide, with the panel carrying the same bytes",
  shapes.every(s => s.cards && s.panelCards && s.thumbs === s.want), shapes.filter(s => !(s.cards && s.panelCards && s.thumbs === s.want)));

/* 6.30.0 — Color Tone + Skin: twenty-eight preset cards, each with five hex swatches and a nine-language mood line; every template
   prompt names its TONE, SKIN, LIGHT, MOOD and PALETTE; the base prompt asks for the one signature skin finish; the tile draws the
   swatch dots + mood line on both surfaces; the lane's base is a deliberately ungraded capture */
if (HAS_CT) {
const CT = byId.colortone, HEX = /^#[0-9A-F]{6}$/;
const ctBad = CT.presets.filter(p => !(Array.isArray(p.sw) && p.sw.length === 5 && p.sw.every(c => HEX.test(c)) && all9(p.sub) && /TONE:/.test(p.p) && /SKIN:/.test(p.p) && /LIGHT:/.test(p.p) && /MOOD:/.test(p.p) && /PALETTE/.test(p.p) && p.sw.every(c => p.p.indexOf(c) >= 0)));
const ctBase = JOBS.find(j => j.name === "base-colortone");
report("A7) Color Tone + Skin: 28 preset cards — five hex swatches each (named again in the prompt), a mood line in nine languages, TONE / SKIN / LIGHT / MOOD / PALETTE in every template; the base prompt carries the one signature skin finish and the lane's base is an ungraded flat capture; the tile code draws the swatches + mood line in the module on both surfaces and the app styles them",
  CT.presets.length === 28 && !ctBad.length && CT.ic === "i-palette" && CT.cardPreset === undefined && /signature skin finish/.test(CT.basePrompt) && /never plastic, waxy or a white mask/.test(CT.basePrompt) &&
  !!ctBase && /UNGRADED/.test(ctBase.prompt) && /flat low-contrast tonal curve/.test(ctBase.prompt) &&
  /im-tpl-sw/.test(mod) && /im-tpl-sub/.test(mod) && /im-tpl-sw/.test(PANEL_JS) && /\.im-tpl-sw span\{display:block;width:10px;height:10px;border-radius:50%/.test(APP) && /\.im-tpl-sub\{font-size:10px/.test(APP) &&
  DATA.tools.filter(t => t.id !== "colortone").every(t => t.presets.every(p => !p.sw && !p.sub)),
  { n: CT.presets.length, bad: ctBad.slice(0, 3).map(p => p.id), base: !!ctBase });
} else console.log("INFO — A7) Color Tone + Skin is held back (owner decision on its pictures pending): no colortone tool, no swatch presets expected");

const wn = (APP.match(/\{ v:"6\.30\.0", kind:"page", ref:"pgImagine",[\s\S]*?\} \},\n/) || [""])[0];
report("A6) WHATS_NEW carries the 6.30.0 Imagine row with a title and a line in all nine languages, and CI runs this test",
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Imagine W2/.test(wn) && /PORT=8931 node test\/verify_imagine_w2\.js/.test(CI), { row: wn.slice(0, 120), ci: /verify_imagine_w2/.test(CI) });

/* ---------------- B) the page ---------------- */
(async () => {
  const browser = await chromium.launch(); withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
    await page.goto("http://127.0.0.1:" + PORT + "/index.html?page=pgImagine", { waitUntil: "load" });
    await page.waitForSelector("#pgImagine .im-card", { timeout: 15000 });   /* the hub is drawn when the page opens; wait for it, not for a clock */
    await page.waitForTimeout(400);
    const B = await page.evaluate(async () => {
      const F = IMAGINE_DATA.frame, T = Object.fromEntries(IMAGINE_DATA.tools.map(t => [t.id, t]));
      const out = { cards: [...document.querySelectorAll("#pgImagine .im-card")].map(c => c.getAttribute("data-tool")) };
      const po = IMAGINE.prompt("outfit", "aoDai", ""), pp = IMAGINE.prompt("product", "darkLuxury", ""), pb = IMAGINE.prompt("background", "cafe", ""), pd = IMAGINE.prompt("describe", "", "make the sky pink"), pa = IMAGINE.prompt("architecture", "nightLights", "");
      out.outfit = po.indexOf(T.outfit.keep) >= 0 && po.indexOf(F.keep) < 0 && po.indexOf(T.outfit.avoid) >= 0 && po.indexOf(F.avoid) < 0 && /ao dai/i.test(po) && /NO STUDIO GEAR/.test(po);
      out.product = pp.indexOf(T.product.keep) >= 0 && pp.indexOf(F.keep) < 0 && /PRODUCT LOCK/.test(pp) && /REALISM/.test(pp) && /TASK GUARD/.test(pp);
      out.background = pb.indexOf(F.keep) >= 0 && pb.indexOf(F.avoid) >= 0;
      out.describe = pd.indexOf(T.describe.keep) >= 0 && /make the sky pink/.test(pd) && pd.indexOf(F.keep) < 0;
      out.architecture = /STRUCTURE LOCK/.test(pa) && pa.indexOf(F.keep) < 0;
      IMAGINE.openTool("outfit"); await new Promise(r => setTimeout(r, 120));
      out.outfitTiles = document.querySelectorAll("#imTpls .im-tpl").length;
      const img = document.querySelector('#imTpls .im-tpl[data-preset="aoDai"] .im-tpl-im img'); out.aoDaiSrc = img ? img.getAttribute("src") : "";
      out.title = document.querySelector(".im-tooltitle").textContent.trim(); out.wantTitle = T.outfit.name[LANG] || T.outfit.name.en;
      IMAGINE.goHub(); await new Promise(r => setTimeout(r, 80));
      IMAGINE.openTool("architecture"); await new Promise(r => setTimeout(r, 120));
      out.archTiles = document.querySelectorAll("#imTpls .im-tpl").length;
      IMAGINE.goHub(); await new Promise(r => setTimeout(r, 80));
      if (T.colortone) {
      IMAGINE.openTool("colortone"); await new Promise(r => setTimeout(r, 120));
      out.ctTiles = document.querySelectorAll("#imTpls .im-tpl").length;
      const ft = document.querySelector('#imTpls .im-tpl[data-preset="rusticBlueGrace"]');
      out.ctDots = ft ? Array.from(ft.querySelectorAll(".im-tpl-sw span")).map(d => getComputedStyle(d).backgroundColor) : [];
      out.ctSub = ft ? (ft.querySelector(".im-tpl-sub") || {}).textContent : ""; out.ctWantSub = T.colortone.presets[0].sub[LANG] || T.colortone.presets[0].sub.en;
      out.ctSubPx = ft ? parseFloat(getComputedStyle(ft.querySelector(".im-tpl-sub")).fontSize) : 0;
      out.ctSrc = ft ? ft.querySelector(".im-tpl-im img").getAttribute("src") : "";
      const pct = IMAGINE.prompt("colortone", "violetPorcelain", "");
      out.ctPrompt = /'Violet Porcelain'/.test(pct) && /TONE LOCK/.test(pct) && pct.indexOf(F.keep) < 0 && /signature skin finish/.test(pct) && /NO STUDIO GEAR/.test(pct);
      IMAGINE.goHub(); await new Promise(r => setTimeout(r, 80));
      }
      const oc = document.querySelector('#pgImagine .im-card[data-tool="outfit"]');
      out.outfitCard = !!oc && /card-outfit-after\.jpg$/.test(oc.querySelector(".im-hubcmp img.im-base").getAttribute("src")) && /card-outfit-before\.jpg$/.test(oc.querySelector(".im-hubcmp img.im-orig").getAttribute("src"));
      return out;
    });
    report("B1) the hub shows the " + WORD + " cards in roster order and the Outfit card is its own Before | After pair (first versions: plain URLs, no ?v=)",
      B.cards.join(",") === ORDER.join(",") && B.outfitCard, B);
    report("B2) the prompt the page would send honours the tool's own lines — Outfit: its clothing-only lock and its AVOID (no shared identity lock), Product: PRODUCT LOCK, Architecture: STRUCTURE LOCK, Describe (your own words, no template): its lock — while Background keeps the shared frame",
      B.outfit && B.product && B.background && B.describe && B.architecture, B);
    report("B3) Outfit opens with 15 tiles (Ao Dai's tile is its own thumbnail), Architecture with 15, the tool title in the page's language",
      B.outfitTiles === 15 && /\/th\/outfit-aoDai\.jpg$/.test(B.aoDaiSrc) && B.archTiles === 15 && B.title === B.wantTitle, B);
    if (HAS_CT) report("B5) Color Tone + Skin opens with 28 preset cards: the first tile shows its own thumbnail, five painted swatch dots (#1F2F4A first) and the mood line in the page's language at 10px; the prompt for Violet Porcelain names the look under the TONE LOCK, the signature skin finish and the gear rule",
      B.ctTiles === 28 && /\/th\/colortone-rusticBlueGrace\.jpg$/.test(B.ctSrc) && B.ctDots.length === 5 && B.ctDots[0] === "rgb(31, 47, 74)" && B.ctSub === B.ctWantSub && Math.abs(B.ctSubPx - 10) < 0.6 && B.ctPrompt,
      { tiles: B.ctTiles, dots: B.ctDots, sub: B.ctSub, want: B.ctWantSub, px: B.ctSubPx, src: B.ctSrc, prompt: B.ctPrompt });
    report("B4) no page error", errs.length === 0, errs.slice(0, 3));
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed — Imagine W2's " + NW2 + " tools sit on the W1 shell with their own frame lines, on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
