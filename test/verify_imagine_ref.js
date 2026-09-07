/* Imagine 6.31.0 — the Reference Card. Every tool's template grid opens with one empty card: drop a picture you like into it and
 * the tool copies ITS OWN aspect of that picture onto your photo — Lighting its light, Weather its season, Surface its ground,
 * Portrait Scene its scene, Outfit its clothes, Background its place, Product its studio look, Architecture its style, ID Photo its
 * background + outfit, Describe its overall look, Color Tone its grade + skin. The reference rides as IMAGE 2 beside the photo
 * (IMAGE 1) in one call, so the model must take two pictures (Nano Banana Pro, Qwen …). Pinned here:
 *   A) the data: a refPrompt naming IMAGE 1 / IMAGE 2 and a nine-language refHint on every tool, the UI strings; the module's tile,
 *      selection ("__ref"), two-picture generate and model guard, lifted to the panel byte for byte; both hosts (the app's own
 *      imRefFile input, pickWire(btn, onFiles, inputId), maxImages, the two-picture call; the panel's second inlineData); the
 *      What's New row; the CI step; the lane's pictures on Qwen 3.0 Pro / Wan 2.7 Pro (the owner's rule for the card art).
 *   B) in the browser: the card sits first and empty, a picture fills it and selects it, the prompt the page would send is the
 *      tool's transfer line inside its frame, ✕ empties it again.
 * Usage: PORT=8931 node test/verify_imagine_ref.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_MAIN = fs.readFileSync(path.join(ROOT, "panel/main.js"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel/js/hnk_imagine.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const lifter = require("../tools/build_panel_imagine.js");
const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
const DATA = (() => { const a = mod.indexOf("var IMAGINE_DATA = ") + "var IMAGINE_DATA = ".length, b = mod.indexOf(";\nvar IMAGINE = (function(){", a); return new Function("return " + mod.slice(a, b))(); })();
const JOBS = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/imagine_art_jobs.json"), "utf8")).jobs;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = o => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].length > 0);

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ---------------- A) data, module, hosts, lane ---------------- */
const badRef = DATA.tools.filter(t => !(typeof t.refPrompt === "string" && t.refPrompt.length >= 120 && /IMAGE 1/.test(t.refPrompt) && /IMAGE 2/.test(t.refPrompt) && /Copy only|stay exactly|never appear/.test(t.refPrompt) && all9(t.refHint)));
report("A1) every tool carries a refPrompt that names IMAGE 1 (the photo) and IMAGE 2 (the reference) and says what to copy and what to leave, plus a nine-language refHint; the UI strings exist in nine languages",
  DATA.tools.length >= 11 && !badRef.length && ["ref_card", "ref_add", "ref_replace", "ref_remove", "err_ref_model"].every(k => all9(DATA.ui[k])) && DATA.ui.ref_card.en === "Reference Card",
  { tools: DATA.tools.length, bad: badRef.map(t => t.id), ui: Object.keys(DATA.ui).filter(k => /^ref_|err_ref/.test(k)) });

const aspects = { lighting: /LIGHTING/, portrait: /SCENE/, surface: /SURFACE/, weather: /WEATHER and SEASON/, describe: /LOOK/, architecture: /ARCHITECTURAL STYLE/, idphoto: /ID photograph/, product: /STUDIO LOOK/, productbg: /BACKDROP/, background: /BACKGROUND/, outfit: /OUTFIT/, colortone: /COLOUR TONE and SKIN FINISH/ };
report("A2) each tool's transfer line copies its OWN aspect — light, scene, surface, weather + season, look, architectural style, ID background + outfit, studio look, backdrop, background, outfit, tone + skin",
  DATA.tools.every(t => aspects[t.id] && aspects[t.id].test(t.refPrompt)), DATA.tools.filter(t => !(aspects[t.id] && aspects[t.id].test(t.refPrompt))).map(t => t.id));

const MOD_BITS = ['function refTile(tool, sel)', 'data-preset","__ref"', 'H.pickWire(tl, function(items){ setRefFiles(tool.id, items); }, "imRefFile")', 'H.pickWire(sw, function(items){ setRefFiles(tool.id, items); }, "imRefFile")',
  'if(ref && H.maxImages && H.maxImages(curModelId()) < 2){ H.toast(t("err_ref_model"),"warn"); return null; }', 'refDataUrl: g.ref ? g.ref.dataUrl : null', 'if(ref){ core = tool.refPrompt; if(desc) core += " EXTRA WISHES: " + desc; }', 'setRef:setRef, clearRef:clearRef,', 'grid.appendChild(refTile(tool, sel));'];
report("A3) the module draws the Reference Card first in the grid, picks through its own input (imRefFile), selects it as \"__ref\", refuses a one-picture model, builds the prompt from refPrompt and sends the reference as IMAGE 2 — and the panel lift carries the same bytes",
  MOD_BITS.every(b => mod.indexOf(b) >= 0) && MOD_BITS.every(b => PANEL_JS.indexOf(b) >= 0) && /\.im-tpl\.im-ref \.im-tpl-im\{border:1\.5px dashed/.test(APP),
  { app: MOD_BITS.filter(b => mod.indexOf(b) < 0), panel: MOD_BITS.filter(b => PANEL_JS.indexOf(b) < 0) });

report("A4) the app host: a second hidden input (imRefFile, single), pickWire(btn, onFiles, inputId) wiring nativePick to that input, maxImages(id) from the model def, and rhGenerateOne with [photo, reference] when a reference rides",
  /<input type="file" id="imRefFile" accept="image\/\*" style="display:none" aria-hidden="true" tabindex="-1">/.test(APP) &&
  /pickWire: function\(btn, onFiles, inputId\)\{[\s\S]*?var mir=\$\(inputId\|\|"imFile"\);[\s\S]*?nativePick\(btn, inputId\|\|"imFile"\);/.test(APP) &&
  /maxImages: function\(id\)\{ var m=rhModelDef\(id\); if\(!m\) return 0; if\(m\.maxImages\) return m\.maxImages;/.test(APP) &&
  /rhGenerateOne\(state\.rhKey, cfg\.apiPath, o\.prompt, "", o\.refDataUrl \? \[o\.dataUrl, o\.refDataUrl\] : \[o\.dataUrl\], rhV2Resolution\(o\.size\), cfg/.test(APP), "app host contract");
report("A5) the panel host: maxImages(id) from ffModelById and a second inlineData part when a reference rides",
  /maxImages: function \(id\) \{ const m = ffModelById\(id\); if \(!m\) return 0; if \(m\.maxImages\) return m\.maxImages;/.test(PANEL_MAIN) &&
  /if \(o\.refDataUrl\) \{ const r2 = \/\^data:\(\[\^;\]\+\);base64,\(\.\*\)\$\/\.exec\(o\.refDataUrl\); if \(r2\) parts\.push\(\{ inlineData: \{ mimeType: r2\[1\], data: r2\[2\] \} \}\); \}/.test(PANEL_MAIN), "panel host contract");

const wn = (APP.match(/\{ v:"6\.31\.0", kind:"page", ref:"pgImagine",[\s\S]*?\} \},\n/) || [""])[0];
report("A6) WHATS_NEW carries the 6.31.0 Imagine row (Reference Card) with a title and a line in all nine languages, and CI runs this test",
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Reference Card/.test(wn) && /PORT=8931 node test\/verify_imagine_ref\.js/.test(CI), { row: wn.slice(0, 120), ci: /verify_imagine_ref/.test(CI) });

const stills = JOBS.filter(j => !/image-to-video$/.test(j.apiPath));
report("A7) the lane's pictures are on Qwen 3.0 Pro image-edit (every picture that starts from a picture) and Wan 2.7 Pro text-to-image (the object bases) — both apiPaths in the app's catalog, no invented endpoint; thumbnails ask for 2:3 at 2k",
  stills.length > 100 && stills.every(j => j.apiPath === "alibaba/qwen-image-3.0-pro/image-edit" || j.apiPath === "alibaba/wan-2.7/text-to-image-pro") &&
  stills.filter(j => j.baseFrom).every(j => j.ratio === "2:3" && j.resolution === "2k") &&
  APP.indexOf('apiPath:"alibaba/qwen-image-3.0-pro/image-edit"') >= 0 && APP.indexOf('apiPath:"alibaba/wan-2.7/text-to-image-pro"') >= 0 &&
  /alibaba\\\/qwen-image/.test(fs.readFileSync(path.join(ROOT, "tools/rh_art_gen.js"), "utf8")),
  { apis: [...new Set(stills.map(j => j.apiPath))], n: stills.length });

/* ---------------- B) the page ---------------- */
(async () => {
  const browser = await chromium.launch(); withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.removeItem("hnk_ws_imagine_v1"); });
    await page.goto("http://127.0.0.1:" + PORT + "/index.html?page=pgImagine", { waitUntil: "load" });
    await page.waitForSelector("#pgImagine .im-card", { timeout: 15000 });
    await page.waitForTimeout(400);
    const B = await page.evaluate(async () => {
      const F = IMAGINE_DATA.frame, T = Object.fromEntries(IMAGINE_DATA.tools.map(t => [t.id, t]));
      const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const out = {};
      IMAGINE.openTool("lighting"); await new Promise(r => setTimeout(r, 150));
      const first = document.querySelector("#imTpls .im-tpl");
      out.firstIsRef = !!first && first.classList.contains("im-ref") && first.getAttribute("data-preset") === "__ref" && !first.classList.contains("has");
      out.emptyText = first ? (first.querySelector(".im-ref-add") || {}).textContent : "";
      out.wantAdd = IMAGINE_DATA.ui.ref_add[document.documentElement.lang] || IMAGINE_DATA.ui.ref_add.en;
      out.tiles = document.querySelectorAll("#imTpls .im-tpl").length;
      out.hint = first ? (first.querySelector(".im-tpl-sub") || {}).textContent : "";
      out.wantHint = T.lighting.refHint[document.documentElement.lang] || T.lighting.refHint.en;
      out.hasInput = !!document.getElementById("imRefFile") && !document.getElementById("imRefFile").multiple;
      /* a picture drops in: the card fills, is selected, and the prompt the page would send is the tool's transfer line inside its frame */
      IMAGINE.setRef("lighting", png, "ref.png"); await new Promise(r => setTimeout(r, 150));
      const f2 = document.querySelector("#imTpls .im-tpl.im-ref");
      out.filled = !!f2 && f2.classList.contains("has") && f2.classList.contains("on") && !!f2.querySelector("img") && f2.querySelector("img").getAttribute("src") === png && !!f2.querySelector(".im-ref-x") && !!f2.querySelector(".im-ref-sw");
      out.selected = IMAGINE.state.preset.lighting === "__ref";
      out.hintLine = (document.querySelector("#pgImagine .im-tplhint") || {}).textContent || "";
      out.wantHintLine = "✓ " + (IMAGINE_DATA.ui.ref_card[document.documentElement.lang] || IMAGINE_DATA.ui.ref_card.en);
      const pl = IMAGINE.prompt("lighting", "__ref", "");
      out.promptOk = pl.indexOf(T.lighting.refPrompt) === 0 && pl.indexOf(F.keep) > 0 && pl.indexOf(F.real) > 0 && pl.indexOf(F.avoid) > 0 && pl.indexOf(F.guard) > 0 && /IMAGE 2/.test(pl);
      const po = IMAGINE.prompt("outfit", "__ref", "make it red");
      out.outfitOk = po.indexOf(T.outfit.refPrompt) === 0 && po.indexOf("EXTRA WISHES: make it red") > 0 && po.indexOf(T.outfit.keep) > 0 && po.indexOf(F.keep) < 0;
      /* a plain tap on the filled card toggles the selection; ✕ empties it */
      f2.click(); await new Promise(r => setTimeout(r, 120));
      out.toggledOff = IMAGINE.state.preset.lighting === "" && !!IMAGINE.state.ref.lighting;
      document.querySelector("#imTpls .im-tpl.im-ref").click(); await new Promise(r => setTimeout(r, 120));
      out.toggledOn = IMAGINE.state.preset.lighting === "__ref";
      document.querySelector("#imTpls .im-tpl.im-ref .im-ref-x").click(); await new Promise(r => setTimeout(r, 150));
      const f3 = document.querySelector("#imTpls .im-tpl.im-ref");
      out.cleared = !!f3 && !f3.classList.contains("has") && !IMAGINE.state.ref.lighting && IMAGINE.state.preset.lighting === "";
      /* the reference is never written to the device */
      out.notSaved = !/refDataUrl|"ref":/.test(localStorage.getItem("hnk_ws_imagine_v1") || "");
      /* the model guard */
      out.models = IMAGINE.data.models.map(m => m.id);
      IMAGINE.goHub(); await new Promise(r => setTimeout(r, 120));
      return out;
    });
    report("B1) the Reference Card sits first in the grid, empty and dashed, with the add text and the tool's hint in the page's language; the app carries the single-file imRefFile input",
      B.firstIsRef && B.emptyText === B.wantAdd && B.hint === B.wantHint && B.tiles === 13 && B.hasInput, B);
    report("B2) a picture fills the card, selects it (✓ Reference Card), shows ✕ and ↻, and the prompt the page would send is the tool's transfer line (IMAGE 1 / IMAGE 2) inside its frame — Outfit keeps its own lock and takes extra wishes",
      B.filled && B.selected && B.hintLine === B.wantHintLine && B.promptOk && B.outfitOk, B);
    report("B3) a tap toggles the selection, ✕ empties the card, and nothing of the reference is written to the device",
      B.toggledOff && B.toggledOn && B.cleared && B.notSaved, B);
    report("B4) no page error", errs.length === 0, errs.slice(0, 3));
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed — the Reference Card sits on every Imagine tool and rides as IMAGE 2 on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
