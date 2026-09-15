/* verify_ui_wave_693.js — 6.93.0 / panel 6.164.0
   THE OWNER'S UI/UX WAVE: the Smart Workflow card tidied, the Imagine page
   re-cut, the Retouch A/B Active-layer defect fixed, Selection Edit upgraded.

   The owner asked four things of 6.92.0: "Smart workflow page ui ux card ကို
   သပ်ရပ်အောင် update upgrade လုပ်ပေးပါ · imagine page ကို လဲ ui ux update
   upgrade လုပ်ပေးပါ · Retouch A B V2 pages တွေကို active layer ရမရစစ်ပေးပါ
   ပေါ်မပေါ်စစ်ပေးပြီး update upgrade လုပ်ပေးပါ · select area smart workflow
   ကိုလဲ update upgrade လုပ်ပေးပါ".

     1. THE CARD. Twin 26px glass discs at the art's top-right (favourite +
        batch — batch used to sit top-LEFT over the art's own "IMAGE 1"
        label), a 22px photo-count pill bottom-left and a 22px route disc
        bottom-right, a right-aligned Wizard pill, and a 2:1 art on the odd
        last card that spans the row. CSS only, on both surfaces.
     2. IMAGINE. Two hub cards to a row on a phone (150px floor — twenty-two
        cards used to stand in one 14,000px column), three at 700px, four at
        1100px; a tool rail of twenty-two chips under the tool title so a
        student moves between tools without the hub; Model · Size drawn in
        the stage card right above Apply; no lone "+" tile above an empty
        stage. Where Photoshop reads every rect as 0, the hub-card slider's
        fallback width is the row's share (imDragWidth), not the column —
        two cards to a row would otherwise halve the finger's speed.
     3. RETOUCH A/B. In the panel the Active layer was captured but the PHOTO
        card never repainted: main.js renderRefs painted the classic slots and
        the wizard, never the studio picker (only clearPhoto did). renderRefs
        now repaints HNK.studioScreen.renderPicker(); a layer photo names its
        layer ("Layer · name") and carries a ↻ that captures the layer again.
     4. SELECTION EDIT. On the web the marquee is drawn by hand on step 2
        (pointer drag over IMAGE 1, a dashed gold frame, the size in px), the
        crop alone is sent, and the result is pasted back into the untouched
        full photograph; the crop's gallery record gives way to the composite.
        In the panel the request line is a full-width framed field (it was a
        bare native input at half width — .hnk-input had no rule), and a
        Selection row asks Photoshop for the live rectangle when the workflow
        opens and on every Check (W × H px, or "none yet").

   Fault-injected while writing: the renderRefs repaint line removed fails
   A4/C1; imDragWidth reverted to the column width fails verify_panel_dead_controls
   C3; the crop swap removed fails B5 (the upload is the whole photo); the
   paste-back removed fails B5 (the result is the model's crop, not 600×400). */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const PCSS = read("panel/styles.css");
const PMAIN = read("panel/main.js");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const RSCREEN = read("panel/src/ui/screens/retouch-studio-screen.js");
const PIMAGINE = read("panel/js/hnk_imagine.js");
const PWN = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); return (i < 0 || j < 0) ? "" : s.slice(i, j); };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the source ================= */
function sourcePins() {
  const cardCss = between(APP, "6.93.0 — THE CARD, TIDIED", "/* v5.0 — \"run this over the whole shoot\"");
  report("A1) the app card: twin 26px discs (favourite + batch) at the art's top-right, the batch disc 34px in from the right, a 22px count pill and a 22px route disc at the bottom edge, a right-aligned Wizard pill, a 2:1 art on the row-spanning card (3:2 again in the three-column grid)",
    /\.wfmini \.fav>span,\.wfmini \.wfbatch>span\{width:26px;height:26px;border-radius:50%/.test(cardCss) &&
    APP.indexOf(".wfmini .wfbatch{left:auto;right:34px;justify-content:flex-end}") > APP.indexOf(".wfmini .wfbatch{position:absolute;top:0;left:0;") &&   /* after the v5.0 corner rule, so the cascade lets it win */
    /\.wfv \.bdg\{[^}]*border-radius:999px;width:22px;height:22px/.test(APP) && /\.wfv \.wf-need\{top:auto;bottom:6px;left:6px;height:22px;line-height:20px/.test(APP) &&
    /\.wfmini \.go\{[^}]*align-self:flex-end;display:inline-flex[^}]*border-radius:999px/.test(APP) && APP.indexOf(".wfmini.wf-span2 .wfv{aspect-ratio:2/1}") > 0 && APP.indexOf(".wfmini.wf-span2 .wfv{aspect-ratio:3/2}") > 0 &&
    /\.wf-need,\.wfv \.wf-need\{font-size:11px\}/.test(APP), { len: cardCss.length });
  report("A2) the panel card carries the same rules in styles.css — 26px discs, the batch disc at right:34px, the 22px pill, the Wizard pill, a 50% padding-top (2:1) on the row-spanning art; no flex gap, no grid, no aspect-ratio (UXP draws none of them)",
    /#pageAiTools \.wfmini \.wfbatch \{ left: auto; right: 34px; justify-content: flex-end; \}/.test(PCSS) && /#pageAiTools \.wfmini \.fav > span, #pageAiTools \.wfmini \.wfbatch > span \{[^}]*width: 26px; height: 26px/.test(PCSS) &&
    /\.wfmini \.wf-need \{ position: absolute; left: 6px; bottom: 6px; height: 22px/.test(PCSS) && PCSS.indexOf(".wfmini.wf-span2 .wfv { padding-top: 50%; }") > 0 &&
    !/wf-span2 \.wfv \{[^}]*aspect-ratio/.test(PCSS), null);
  const mod = between(APP, "/* ---- IMAGINE_MODULE ---- */", "/* ---- /IMAGINE_MODULE ---- */");
  const css = between(APP, "/* ---- IMAGINE_CSS ---- */", "/* ---- /IMAGINE_CSS ---- */");
  const railAt = mod.indexOf('var rail = el("div","im-rail"); rail.id="imRail"; root.appendChild(rail);');
  const modelAt = mod.indexOf("card.appendChild(modelRow(tool));"), actsAt = mod.indexOf('var acts = el("div","im-acts"); card.appendChild(acts);');
  report("A3) the Imagine module: a tool rail under the tool title (one chip per tool, the open one .on, a tap opens that tool), Model · Size drawn by the stage card right before the actions (modelRow), no lone + above an empty stage, the row-aware fallback width (imHubCols 2/3/4 · imDragWidth) used by the slider",
    railAt > 0 && /btn\("chip im-railchip"\+\(tl\.id===tool\.id\?" on":""\), H\.t9\(tl\.name\), tl\.ic\)/.test(mod) && /ch\.onclick=function\(\)\{ if\(tl\.id!==tool\.id\) openTool\(tl\.id\); \};/.test(mod) &&
    modelAt > 0 && actsAt > modelAt && actsAt - modelAt < 120 && /function modelRow\(tool\)\{/.test(mod) && !/\/\* model \+ size \*\/\s*var row = el\("div","im-msrow"\); card\.appendChild\(row\);/.test(mod) &&
    /if\(S\.photos\.length && S\.photos\.length < MAX_PHOTOS\)\{/.test(mod) && /function imHubCols\(vw\)\{ return vw>=1100 \? 4 : vw>=700 \? 3 : 2; \}/.test(mod) &&
    /function imDragWidth\(el\)\{/.test(mod) && /var w=imDragWidth\(el\); if\(!\(w>0\)\) return null;/.test(mod) && /return Math\.max\(60, \(alone\+12-cols\*10\)\/cols-2\);/.test(mod),
    { railAt, modelAt, actsAt });
  report("A3b) the Imagine CSS: hub cards at a 150px floor (two to a phone row), three at 700px, four at 1100px, a compact body, a stacking foot, the rail as a sideways-scrolling row with margins (no gap), Model · Size above Apply; the panel's lifted copy carries the same rules and the same module lines",
    /\.im-card\{flex:1 1 40%;min-width:150px;margin:5px;/.test(css) && /@media \(min-width:700px\)\{\.im-card\{flex:1 1 28%;min-width:0;max-width:calc\(33\.333% - 10px\)\}\}/.test(css) && /@media \(min-width:1100px\)\{\.im-card\{flex:1 1 20%/.test(css) &&
    /\.im-rail\{display:flex;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;/.test(css) && /\.im-rail \.chip\{flex:none;margin-right:6px;cursor:pointer;white-space:nowrap\}/.test(css) && !/\.im-rail\{[^}]*\bgap:/.test(css) &&
    /\.im-card-foot\{display:flex;flex-wrap:wrap;/.test(css) && /\.im-card-sum\{margin:4px 0 8px;font-size:11\.5px;line-height:1\.5;max-height:3em;overflow:hidden/.test(css) && /\.im-msrow\{display:flex;flex-wrap:wrap;margin:0 -4px 10px\}/.test(css) &&
    PIMAGINE.indexOf('var rail = el("div","im-rail"); rail.id="imRail";') > 0 && PIMAGINE.indexOf("card.appendChild(modelRow(tool));") > 0 && PIMAGINE.indexOf("function imDragWidth(el){") > 0 &&
    PCSS.indexOf(".im-rail{display:flex;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;") > 0 && PCSS.indexOf(".im-card{flex:1 1 40%;min-width:150px;margin:5px;") > 0, null);
  const rr = between(PMAIN, "function renderRefs()", "\nfunction ");
  report("A4) the Retouch repaint: main.js renderRefs repaints HNK.studioScreen.renderPicker() (the PHOTO card used to keep its empty state after a layer capture); the studio bridge offers pickLayer; the picker names a layer photo (\"Layer · name\") and draws a ↻ (icons/ui/i-reset-muted.png — the only tint that file ships) that captures the layer again; the two rules sit in styles.css",
    /sc\.renderPicker\(\)/.test(rr) && /globalThis\.HNK\.studioScreen/.test(rr) && /pickLayer: function \(\) \{ try \{ refLayerInto\("subject-reference"\); \} catch \(e\) \{ \} \},/.test(PMAIN) &&
    /var fromLayer = \/\^Layer:\/\.test\(String\(ref\.label \|\| ""\)\);/.test(RSCREEN) && /var re = el\("button", "x re"\);/.test(RSCREEN) && RSCREEN.indexOf('<img class="ic-s" alt="" src="icons/ui/i-reset-muted.png">') > 0 && !/icn\("i-reset-muted"\)/.test(RSCREEN) &&
    /if \(b && b\.pickLayer\) b\.pickLayer\(\);/.test(RSCREEN) && /el\("span", "tag src", "Layer · " \+ String\(ref\.label\)\.replace\(\/\^Layer:\\s\*\/, ""\)/.test(RSCREEN) &&
    PCSS.indexOf(".stpg #stPicker .ref .x.re { right: 32px; }") > 0 && /\.stpg #stPicker \.ref \.tag\.src \{ left: auto; right: 4px;/.test(PCSS) && fs.existsSync(path.join(PANEL, "icons/ui/i-reset-muted.png")), null);
  const wiz = between(APP, "async function runWizGenerate(){", "/* v6.19.0 — OUTFIT BOARD.");
  report("A5) Selection Edit on the web: openWizard forgets the rectangle per open, _wizRegion reads it, step 2 draws wizRegionPicker for region-edit, a required text field is the whole row, runWizGenerate crops IMAGE 1 to the rectangle before the run and pastes the result back after (the crop's gallery record replaced by the composite, IMAGE 1 restored)",
    /wiz\.region=null; \/\* 6\.93\.0/.test(APP) && /window\._wizRegion=function\(r\)\{ if\(arguments\.length\)\{ wiz\.region=r\|\|null; \} return wiz\.region; \};/.test(APP) &&
    /if\(w\.id==="region-edit" && state\.refs\[0\] && state\.refs\[0\]\.b64\) body\.appendChild\(wizRegionPicker\(state\.refs\[0\]\)\);/.test(APP) && /\+\(f\.required\?" wiz-field-req":""\)/.test(APP) &&
    /var rgn=\(w\.id==="region-edit" && wiz\.region && state\.refs\[0\] && state\.refs\[0\]\.b64\) \? wiz\.region : null, rgnFull=null;/.test(wiz) && /var rgCrop=await wizRegionCrop\(state\.refs\[0\], rgn\);/.test(wiz) &&
    /if\(rgnFull\)\{ state\.refs\[0\]=rgnFull; try\{ renderRefs\(\); \}catch\(eRR\)\{\} \}/.test(wiz) && /rgComp=await wizRegionPaste\(rgnFull, rgOut, rgn\)/.test(wiz) && /if\(rgOut\._id\) galleryDel\(rgOut\._id, function\(\)\{\}\);/.test(wiz) &&
    /function wizRegionPicker\(ref\)\{/.test(APP) && /async function wizRegionCrop\(ref, r\)\{/.test(APP) && /async function wizRegionPaste\(full, out, r\)\{/.test(APP) && /\.wiz-region-rect\{position:absolute;border:2px dashed var\(--gold\)/.test(APP) &&
    /\.wiz-field-req\{flex-direction:column;align-items:stretch/.test(APP) && LANGS.every(l => new RegExp('title:\\{[^}]*\\b' + l + ':"').test(between(APP, "function wizRegionL(k){", "return L9(L[k]);"))), null);
  const selRow = between(SCREEN, "6.164.0 — THE SELECTION, CHECKED BEFORE THE MONEY", "dom.on(selBtn, \"click\", selCheck);");
  report("A6) Selection Edit in the panel: a text field is a column (.is-text) with the app's maxlength, .hnk-input finally has a rule, and a region workflow draws the Selection row (#hnkWfSelRow · #hnkWfSelState · #hnkWfSelCheck) that reads host.getSelectionBounds on open and on Check — ok / none / no-host in nine languages",
    /class: "hnk-wf-field" \+ \(f\.type === "text" \? " is-text" : ""\)/.test(SCREEN) && /if \(f\.max\) ti\.setAttribute\("maxlength", String\(f\.max\)\);/.test(SCREEN) &&
    /id: "hnkWfSelRow"/.test(selRow) && /id: "hnkWfSelState"/.test(selRow) && /id: "hnkWfSelCheck"/.test(selRow) && /deps\.host\.getSelectionBounds\(\)/.test(selRow) && /selRow\.className = "hnk-sel-row ok"/.test(selRow) && /selRow\.className = "hnk-sel-row none"/.test(selRow) &&
    ["L_SEL_CHECK", "L_SEL_CHECKING", "L_SEL_OK", "L_SEL_NONE", "L_SEL_NOHOST"].every(k => { const line = (SCREEN.match(new RegExp("var " + k + " = \\{[^\\n]*")) || [""])[0]; return LANGS.every(l => new RegExp("\\b" + l + ': "').test(line)); }) &&
    /L_SEL_OK = \{[^\n]*\{w\} × \{h\} px/.test(SCREEN) && /\.hnk-input \{ min-height: 42px;/.test(PCSS) && /\.hnk-wf-field\.is-text \{ flex-direction: column; align-items: stretch; \}/.test(PCSS) && /\.hnk-sel-row \{ display: flex; flex-direction: row;/.test(PCSS) && !/\.hnk-sel-row \{[^}]*\bgap:/.test(PCSS), null);
}

/* ================= B) the web app ================= */
async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_ws_lang", "en"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) { } switchPage("pgWf"); window.scrollTo(0, 0); }); await page.waitForTimeout(900);
  const card = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#pgWf .wfgrid .wfmini")); const c = cards.find(x => x.querySelector(".wf-need") && x.querySelector(".wfbatch")) || cards[0];
    const R = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const art = R(c.querySelector(".wfv")), fav = R(c.querySelector(".fav>span")), bat = R(c.querySelector(".wfbatch>span")), bdg = c.querySelector(".bdg") && R(c.querySelector(".bdg")), need = R(c.querySelector(".wf-need")), go = R(c.querySelector(".go")), cr = R(c);
    const span = cards.find(x => x.classList.contains("wf-span2")); const sv = span && R(span.querySelector(".wfv"));
    return { n: cards.length, fav: [Math.round(fav.w), Math.round(fav.h)], bat: [Math.round(bat.w), Math.round(bat.h)], batRightOfArtEdge: Math.round(art.r - bat.r), batLeftOfFav: bat.r <= fav.l + 1, sameTop: Math.abs(fav.t - bat.t) < 2,
      bdg: bdg && [Math.round(bdg.w), Math.round(bdg.h)], needH: Math.round(need.h), needBottom: Math.round(art.b - need.b), goH: Math.round(go.h), goRight: Math.round(cr.r - go.r), goRadius: getComputedStyle(c.querySelector(".go")).borderRadius,
      span: !!span, spanRatio: sv && Math.round(sv.w / sv.h * 100) / 100 };
  });
  report("B1) at 390px a Smart Workflow card wears twin 26px discs at the art's top-right (batch right of centre and left of the favourite, same row, both inside the art), a 22px count pill and a 22px route disc at the bottom edge, a right-aligned Wizard pill (≤ 28px tall, radius 999px), and the row-spanning card's art is 2:1",
    card.n > 100 && card.fav[0] === 26 && card.fav[1] === 26 && card.bat[0] === 26 && card.bat[1] === 26 && card.batRightOfArtEdge >= 30 && card.batRightOfArtEdge <= 40 && card.batLeftOfFav && card.sameTop && card.bdg && card.bdg[0] === 22 && card.bdg[1] === 22 &&
    card.needH === 22 && card.needBottom >= 4 && card.needBottom <= 8 && card.goH <= 28 && card.goRight >= 8 && card.goRight <= 14 && /999px/.test(card.goRadius) && card.span && Math.abs(card.spanRatio - 2) < 0.06, card);
  /* Imagine hub + tool */
  await page.evaluate(() => { switchPage("pgImagine"); try { IMAGINE.goHub(); } catch (e) { } window.scrollTo(0, 0); }); await page.waitForTimeout(800);
  const hub = await page.evaluate(() => { const cards = Array.from(document.querySelectorAll("#pgImagine .im-card")); const r0 = cards[0].getBoundingClientRect(), r1 = cards[1].getBoundingClientRect();
    const chip = cards[0].querySelector(".im-tplcount").getBoundingClientRect(); return { n: cards.length, w0: Math.round(r0.width), sameRow: Math.abs(r0.top - r1.top) < 2, hubH: document.querySelector("#pgImagine .im-hub").scrollHeight, chipOneLine: chip.height < 30 }; });
  report("B2) the Imagine hub at 390px: twenty-two cards two to a row (each under 200px), the whole hub under 6,000px (it was 14,000), the count chip on one line", hub.n === 22 && hub.w0 < 200 && hub.sameRow && hub.hubH < 6000 && hub.chipOneLine, hub);
  const tool = await page.evaluate(async () => { IMAGINE.openTool("lighting"); await new Promise(r => setTimeout(r, 300));
    const rail = document.getElementById("imRail"), stage = document.querySelector(".im-stage"), ms = document.getElementById("imModel"), row = ms && ms.closest(".im-msrow");
    const out = { rail: !!rail, chips: rail && rail.querySelectorAll(".chip").length, on: rail && (rail.querySelector(".chip.on") || {}).getAttribute("data-tool"), msInStage: !!(ms && stage && stage.contains(ms)), msBeforeActs: !!(row && row.nextElementSibling && row.nextElementSibling.className === "im-acts"), imAdd: !!document.getElementById("imAdd"), imAddBig: !!document.getElementById("imAddBig"), scrolls: rail && rail.scrollWidth > rail.clientWidth };
    document.querySelector('#imRail .chip[data-tool="weather"]').click(); await new Promise(r => setTimeout(r, 300));
    out.switched = IMAGINE.state.tool; out.onAfter = (document.querySelector("#imRail .chip.on") || {}).getAttribute("data-tool"); out.title = document.querySelector(".im-tooltitle").textContent.trim();
    const c = document.createElement("canvas"); c.width = 40; c.height = 60; c.getContext("2d").fillRect(0, 0, 40, 60);
    IMAGINE.addPhotos([{ dataUrl: c.toDataURL("image/png"), name: "a.png" }]); await new Promise(r => setTimeout(r, 120));
    out.imAddWithPhoto = !!document.getElementById("imAdd"); out.strip = document.querySelectorAll("#imStrip .im-th:not(.im-add)").length;
    IMAGINE.clearAll && IMAGINE.clearAll(); return out; });
  report("B3) the tool view: a rail of twenty-two chips that scrolls sideways with the open tool lit, a tap on Weather switches the tool and the light, #imModel sits in the stage card with its row immediately before the actions, an empty stage shows the big Add box and no lone + (the + returns once a photo is in)",
    tool.rail && tool.chips === 22 && tool.on === "lighting" && tool.msInStage && tool.msBeforeActs && !tool.imAdd && tool.imAddBig && tool.scrolls && tool.switched === "weather" && tool.onAfter === "weather" && /Weather/.test(tool.title) && tool.imAddWithPhoto && tool.strip === 1, tool);
  /* the marquee helpers, unit-tested on tiny canvases */
  const unit = await page.evaluate(async () => {
    const mk = (w, h, fill) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = fill; x.fillRect(0, 0, w, h); const u = c.toDataURL("image/png"); return { mime: "image/png", b64: u.slice(u.indexOf(",") + 1) }; };
    const full = mk(40, 20, "#0000ff"), out = mk(6, 6, "#00ff00");
    const crop = await window._wizRegionCrop(full, { x: 0.5, y: 0.5, w: 0.25, h: 0.5 });
    const r = { x: 0.5, y: 0.5, w: 0.25, h: 0.5, px: crop.px };
    const comp = await window._wizRegionPaste(full, out, r);
    const px = await new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext("2d"); x.drawImage(im, 0, 0); const g = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data).slice(0, 3).join(","); res({ W: c.width, H: c.height, inside: g(25, 15), outside: g(5, 5) }); }; im.src = "data:" + comp.mime + ";base64," + comp.b64; });
    const tiny = await window._wizRegionCrop(full, { x: 0.9, y: 0.9, w: 0.05, h: 0.05 });
    return { cropPx: crop.px, cropMime: crop.mime, px, compMime: comp.mime, tiny };
  });
  report("B4) wizRegionCrop cuts the rectangle in pixels (a 40×20 photo at x .5 y .5 w .25 h .5 → 10×10 at 20,10) and refuses one under 8px; wizRegionPaste sets the result into the untouched full photo (inside green, outside the original blue, the full 40×20 size, PNG kept as PNG)",
    unit.cropPx && unit.cropPx.x === 20 && unit.cropPx.y === 10 && unit.cropPx.w === 10 && unit.cropPx.h === 10 && unit.cropPx.W === 40 && unit.cropPx.H === 20 && unit.cropMime === "image/jpeg" && unit.px.W === 40 && unit.px.H === 20 && unit.px.inside === "0,255,0" && unit.px.outside === "0,0,255" && unit.compMime === "image/png" && unit.tiny === null, unit);
  /* the wizard, end to end */
  await page.evaluate(() => { IMAGINE.goHub(); switchPage("pgWf"); window.scrollTo(0, 0); }); await page.waitForTimeout(400);
  const fullBytes = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400; const x = c.getContext("2d"); x.fillStyle = "#3a5a8a"; x.fillRect(0, 0, 600, 400); x.fillStyle = "#e8d2b0"; x.beginPath(); x.arc(300, 200, 90, 0, 6.3); x.fill(); x.fillStyle = "#c0392b"; x.fillRect(420, 260, 120, 90);
    const u = c.toDataURL("image/jpeg", 0.9); state.refs[0] = { mime: "image/jpeg", b64: u.slice(u.indexOf(",") + 1), label: "t" }; renderRefs(); window.openWorkflowById("region-edit"); return Math.round(state.refs[0].b64.length * 0.75); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const nav = document.querySelectorAll(".wiz.on .wiz-nav .btn"); nav[nav.length - 1].click(); }); await page.waitForTimeout(500);
  const step2 = await page.evaluate(async () => {
    const out = { region: !!document.getElementById("wizRegion"), note0: (document.getElementById("wizRegionNote") || {}).textContent, clear0: (document.getElementById("wizRegionClear") || {}).style.display, wslot: !!document.querySelector(".wslot.filled .th img"), r0: window._wizRegion() };
    const pane = document.getElementById("wizRegionBox"), img = pane.querySelector("img"); await new Promise(r => { if (img.complete) r(); else img.onload = r; });
    const b = img.getBoundingClientRect(); const ev = (type, fx, fy) => pane.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 7, isPrimary: true, pointerType: "touch", clientX: b.left + b.width * fx, clientY: b.top + b.height * fy }));
    ev("pointerdown", 0.6, 0.55); ev("pointermove", 0.7, 0.7); ev("pointermove", 0.95, 0.92); ev("pointerup", 0.95, 0.92); await new Promise(r => setTimeout(r, 80));
    out.r1 = window._wizRegion(); out.note1 = document.getElementById("wizRegionNote").textContent; out.rect = document.getElementById("wizRegionRect").style.display; out.rectLeft = document.getElementById("wizRegionRect").style.left; out.clear1 = document.getElementById("wizRegionClear").style.display;
    /* a tap that barely moves is not a selection */
    ev("pointerdown", 0.2, 0.2); ev("pointermove", 0.21, 0.21); ev("pointerup", 0.21, 0.21); await new Promise(r => setTimeout(r, 40)); out.r2 = window._wizRegion();
    document.getElementById("wizRegionClear").click(); await new Promise(r => setTimeout(r, 40)); out.r3 = window._wizRegion(); out.note3 = document.getElementById("wizRegionNote").textContent;
    ev("pointerdown", 0.6, 0.55); ev("pointermove", 0.95, 0.92); ev("pointerup", 0.95, 0.92); await new Promise(r => setTimeout(r, 40)); out.r4 = window._wizRegion();
    return out;
  });
  const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 0.02;
  report("B5a) step 2 draws the marquee box under IMAGE 1 (the slot's photo still whole): nothing drawn → \"whole photo\" note and no Clear; a drag from (.6,.55) to (.95,.92) sets the rectangle, the dashed frame at left 60%, the note \"Selected ✓ 210 × 148 px\", Clear shown; a 1% nudge is not a selection; Clear forgets it; a second drag sets it again",
    step2.region && /whole photo/.test(step2.note0) && step2.clear0 === "none" && step2.wslot && step2.r0 === null && step2.r1 && near(step2.r1.x, 0.6) && near(step2.r1.y, 0.55) && near(step2.r1.w, 0.35) && near(step2.r1.h, 0.37) &&
    /Selected ✓ 210 × 148 px/.test(step2.note1) && step2.rect === "" && /^60/.test(step2.rectLeft) && step2.clear1 === "" && step2.r2 && near(step2.r2.x, 0.6) && step2.r3 === null && /whole photo/.test(step2.note3) && step2.r4 && near(step2.r4.w, 0.35), step2);
  await page.evaluate(() => { const nav = document.querySelectorAll(".wiz.on .wiz-nav .btn"); nav[nav.length - 1].click(); }); await page.waitForTimeout(400);
  const gen = await page.evaluate(async (fullBytes) => {
    const f = document.querySelector(".wiz-field-req .inp"); const fr = f.getBoundingClientRect(), box = document.querySelector(".wiz-fields").getBoundingClientRect();
    const out = { fieldFull: fr.width >= box.width * 0.95, genOff: !!document.querySelector(".wiz.on .wiz-nav .btn-gold").disabled };
    window.__sent = []; window.__ups = []; const realFetch = window.fetch;
    const RES = (() => { const c = document.createElement("canvas"); c.width = 210; c.height = 148; const x = c.getContext("2d"); x.fillStyle = "#00ff55"; x.fillRect(0, 0, 210, 148); return c.toDataURL("image/png"); })();
    window.fetch = async function (u, o) { const url = String(u);
      if (url.indexOf("mock.runninghub.test") >= 0) { const bin = atob(RES.split(",")[1]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }); }
      if (url.indexOf("www.runninghub.ai") < 0) return realFetch(u, o);
      if (url.indexOf("/media/upload/binary") >= 0) { try { const b = o && o.body; let n = 0; if (b && b.get) { const ff = b.get("file"); n = ff && ff.size; } else if (b && b.size) n = b.size; window.__ups.push(n); } catch (e) { window.__ups.push(-1); } return new Response(JSON.stringify({ code: 0, message: "success", data: { download_url: "https://mock.runninghub.test/up.png", fileName: "openapi/up.png" } }), { status: 200 }); }
      if (url.indexOf("/openapi/v2/query") >= 0) return new Response(JSON.stringify({ taskId: "t1", status: "SUCCESS", results: [{ url: "https://mock.runninghub.test/out.png", nodeId: "2", outputType: "png" }] }), { status: 200 });
      if (url.indexOf("/openapi/v2/") < 0 || url.indexOf("/price-preview/") >= 0) return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 });
      window.__sent.push((o && o.body) ? String(o.body) : ""); return new Response(JSON.stringify({ taskId: "t1", status: "RUNNING" }), { status: 200 }); };
    state.rhKey = "test-key";
    f.value = "make the red box green"; f.dispatchEvent(new Event("input", { bubbles: true }));
    out.genOn = !document.querySelector(".wiz.on .wiz-nav .btn-gold").disabled;
    document.querySelector(".wiz.on .wiz-nav .btn-gold").click();
    const t0 = Date.now(); while (Date.now() - t0 < 15000 && window._wizBusy) await new Promise(r => setTimeout(r, 60));
    await new Promise(r => setTimeout(r, 500));
    const res = state.hist[0];
    const px = await new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext("2d"); x.drawImage(im, 0, 0); const g = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data).slice(0, 3); r({ W: c.width, H: c.height, inside: g(500, 340), outside: g(60, 60), face: g(300, 200) }); }; im.src = "data:" + res.mime + ";base64," + res.b64; });
    const gal = await new Promise(r => galListWf("region-edit", 5).then(l => r(l.length)));
    return Object.assign(out, { sent: window.__sent.length, ups: window.__ups, fullBytes, px, region: res.region, refs0: state.refs[0] && state.refs[0].label, shown: !!document.querySelector(".wiz-result"), gal, prompt: (window.__sent[0] || "").indexOf("make the red box green") >= 0 });
  }, fullBytes);
  const close = (a, b) => Math.abs(a - b) <= 6;
  report("B5b) step 3's request line is the whole row and gates GENERATE; a mocked run sends ONE submit carrying the words and uploads the crop (a fraction of the full photo's bytes), and the result is the composite: 600×400, the model's green inside the rectangle, the original blue and the face outside; state.hist[0] carries the pixel rectangle, IMAGE 1 is the full photo again, one gallery record for the workflow",
    gen.fieldFull && gen.genOff && gen.genOn && gen.sent === 1 && gen.prompt && gen.ups.length === 1 && gen.ups[0] > 200 && gen.ups[0] < gen.fullBytes * 0.5 && gen.px.W === 600 && gen.px.H === 400 &&
    close(gen.px.inside[1], 255) && close(gen.px.inside[0], 0) && close(gen.px.outside[2], 138) && close(gen.px.outside[0], 58) && close(gen.px.face[0], 232) && gen.region && gen.region.x === 360 && gen.region.y === 220 && gen.region.w === 210 && gen.region.h === 148 &&
    gen.refs0 === "t" && gen.shown && gen.gal === 1, gen);
  report("B6) no page error in the web app while all of that ran", errs.length === 0, errs);
  await ctx.close();
}

/* ================= C) the panel ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60; const g = cv.getContext("2d"); g.fillStyle = "#c98a5b"; g.fillRect(0, 0, 40, 60);
      const b64 = cv.toDataURL("image/jpeg", 0.9).split(",")[1]; window.__capCalls = 0;
      window.captureLayerB64Direct = async function () { window.__capCalls++; return { b64: b64, mime: "image/jpeg", label: "Layer: Bride retouch v2", w: 40, h: 60 }; }; });
    const c1 = {};
    for (const key of ["meitu", "evoto"]) {
      await page.evaluate((k) => { try { switchPage(k); } catch (e) { } }, key); await page.waitForTimeout(900);
      c1[key] = await page.evaluate(async () => {
        const p = document.getElementById("stPicker"); const before = { add: !!p.querySelector(".add"), filled: !!p.querySelector(".ref.filled img") };
        p.querySelector(".add").click(); await new Promise(r => setTimeout(r, 250));
        const sheet = document.getElementById("ffSheet"); const first = sheet && sheet.querySelector(".btn"); const label = first && first.textContent.trim(); first && first.click(); await new Promise(r => setTimeout(r, 800));
        const after = { filled: !!p.querySelector(".ref.filled img"), re: !!p.querySelector(".x.re"), reSrc: ((p.querySelector(".x.re img") || {}).getAttribute && p.querySelector(".x.re img").getAttribute("src")) || "", tag: (p.querySelector(".tag.src") || {}).textContent, caps: window.__capCalls, status: (document.getElementById("status") || {}).textContent };
        p.querySelector(".x.re").click(); await new Promise(r => setTimeout(r, 800));
        const again = { caps: window.__capCalls, filled: !!p.querySelector(".ref.filled img") };
        /* a file photo names no layer and draws no ↻ */
        state.refs[0] = { mime: "image/jpeg", b64: state.refs[0].b64, label: "bride.jpg" }; renderRefs(); await new Promise(r => setTimeout(r, 100));
        const file = { filled: !!p.querySelector(".ref.filled img"), re: !!p.querySelector(".x.re"), tag: !!p.querySelector(".tag.src") };
        /* the repaint really goes through renderRefs → the studio picker */
        let n = 0; const sc = HNK.studioScreen, orig = sc.renderPicker; sc.renderPicker = function () { n++; return orig.apply(this, arguments); }; renderRefs(); sc.renderPicker = orig;
        state.refs[0] = null; renderRefs(); await new Promise(r => setTimeout(r, 100));
        return { before, label, after, again, file, repaints: n, emptyAgain: !!p.querySelector(".add") };
      });
    }
    const okKey = (r) => r.before.add && !r.before.filled && /layer/i.test(r.label || "") && r.after.filled && r.after.re && /icons\/ui\/i-reset-muted\.png$/.test(r.after.reSrc) && r.after.tag === "Layer · Bride retouch v2" && r.after.caps >= 1 && r.again.caps === r.after.caps + 1 && r.again.filled && r.file.filled && !r.file.re && !r.file.tag && r.repaints === 1 && r.emptyAgain;
    report("C1) Retouch A and Retouch B: the PHOTO card starts empty, the photo sheet's first door is the Photoshop layer, and after the capture the card SHOWS the layer picture (the 6.163.0 defect: captured, never painted) with the \"Layer · Bride retouch v2\" caption and a ↻ that captures again (+1 call, still filled); a file photo draws neither; renderRefs repaints the studio picker exactly once; clearing empties the card",
      okKey(c1.meitu) && okKey(c1.evoto), c1);
    /* Imagine in the panel */
    await page.evaluate(() => { try { switchPage("imagine"); } catch (e) { } }); await page.waitForTimeout(900);
    const c2 = await page.evaluate(async () => { HNK.imagine.goHub(); await new Promise(r => setTimeout(r, 300));
      const cards = Array.from(document.querySelectorAll("#pageImagine .im-card")); const r0 = cards[0].getBoundingClientRect(), r1 = cards[1].getBoundingClientRect();
      const out = { n: cards.length, w0: Math.round(r0.width), sameRow: Math.abs(r0.top - r1.top) < 2 };
      HNK.imagine.openTool("lighting"); await new Promise(r => setTimeout(r, 400));
      const rail = document.querySelector("#pageImagine #imRail"), stage = document.querySelector("#pageImagine .im-stage"), ms = document.querySelector("#pageImagine #imModel");
      Object.assign(out, { rail: !!rail, chips: rail && rail.querySelectorAll(".chip").length, on: rail && (rail.querySelector(".chip.on") || {}).getAttribute("data-tool"), msInStage: !!(ms && stage && stage.contains(ms)), imAdd: !!document.querySelector("#pageImagine #imAdd"), imAddBig: !!document.querySelector("#pageImagine #imAddBig"), nativeBtn: document.querySelectorAll("#pageImagine #imRail button").length });
      document.querySelector('#pageImagine #imRail .chip[data-tool="weather"]').click(); await new Promise(r => setTimeout(r, 300));
      out.switched = HNK.imagine.state.tool; out.onAfter = (document.querySelector("#pageImagine #imRail .chip.on") || {}).getAttribute("data-tool"); HNK.imagine.goHub(); return out; });
    report("C2) the panel's Imagine: two hub cards to a row at 380px, the rail's twenty-two chips as div buttons (no native <button>) with the open tool lit and a tap switching it, Model in the stage card, no lone + above the empty stage",
      c2.n === 22 && c2.w0 < 200 && c2.sameRow && c2.rail && c2.chips === 22 && c2.on === "lighting" && c2.msInStage && !c2.imAdd && c2.imAddBig && c2.nativeBtn === 0 && c2.switched === "weather" && c2.onAfter === "weather", c2);
    /* the Smart Workflow card in the panel */
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } }); await page.waitForTimeout(1200);
    const c3 = await page.evaluate(() => { const cards = Array.from(document.querySelectorAll("#pageAiTools .wfmini")); const c = cards.find(x => x.querySelector(".wf-need") && x.querySelector(".wfbatch")) || cards[0];
      const R = (el) => el.getBoundingClientRect(); const fav = R(c.querySelector(".fav > span")), bat = R(c.querySelector(".wfbatch > span")), art = R(c.querySelector(".wfv")), need = R(c.querySelector(".wf-need")), bdg = c.querySelector(".bdg") && R(c.querySelector(".bdg"));
      const span = cards.find(x => /\bwf-span2\b/.test(String(x.className || ""))); const sv = span && R(span.querySelector(".wfv"));
      return { n: cards.length, fav: [Math.round(fav.width), Math.round(fav.height)], bat: [Math.round(bat.width), Math.round(bat.height)], batIn: Math.round(art.right - bat.right), sameTop: Math.abs(fav.top - bat.top) < 2, needH: Math.round(need.height), bdg: bdg && [Math.round(bdg.width), Math.round(bdg.height)], spanRatio: sv && Math.round(sv.width / sv.height * 100) / 100 }; });
    report("C3) the panel's Smart Workflow card wears the same tidy: twin 26px discs on one row at the top-right (batch 30–40px in from the art's edge), a 22px count pill, a 22px route disc, a 2:1 art on the row-spanning card",
      c3.n > 100 && c3.fav[0] === 26 && c3.fav[1] === 26 && c3.bat[0] === 26 && c3.bat[1] === 26 && c3.batIn >= 30 && c3.batIn <= 40 && c3.sameTop && c3.needH === 22 && c3.bdg && c3.bdg[0] === 22 && c3.spanRatio && Math.abs(c3.spanRatio - 2) < 0.06, c3);
    /* Selection Edit in the panel */
    const c4 = await page.evaluate(async () => {
      HNK.aiToolsApp.workflowScreen().select("region-edit"); await new Promise(r => setTimeout(r, 700));
      const f = document.querySelector("#hnkAiToolsRoot .hnk-wf-text"); const fr = f.getBoundingClientRect(), box = document.querySelector("#hnkAiToolsRoot .hnk-wf-fields").getBoundingClientRect();
      const out = { isText: !!f.closest(".hnk-wf-field.is-text"), fieldFull: fr.width >= box.width * 0.95, maxlen: f.getAttribute("maxlength"), styled: getComputedStyle(f).borderRadius, row: !!document.getElementById("hnkWfSelRow"), check: !!document.getElementById("hnkWfSelCheck") };
      const host = HNK.photoshopHost, orig = host.getSelectionBounds;
      host.getSelectionBounds = async () => null; document.getElementById("hnkWfSelCheck").click(); await new Promise(r => setTimeout(r, 200));
      out.none = { cls: document.getElementById("hnkWfSelRow").className, txt: document.getElementById("hnkWfSelState").textContent };
      host.getSelectionBounds = async () => ({ x: 120, y: 80, width: 640, height: 420 }); document.getElementById("hnkWfSelCheck").click(); await new Promise(r => setTimeout(r, 200));
      out.ok = { cls: document.getElementById("hnkWfSelRow").className, txt: document.getElementById("hnkWfSelState").textContent };
      host.getSelectionBounds = async () => { throw new Error("no document"); }; document.getElementById("hnkWfSelCheck").click(); await new Promise(r => setTimeout(r, 200));
      out.thrown = { cls: document.getElementById("hnkWfSelRow").className };
      host.getSelectionBounds = orig;
      /* the row is drawn again, fresh, when the workflow is reopened; a plain workflow draws none */
      document.getElementById("hnkWfBack").click(); await new Promise(r => setTimeout(r, 300));
      HNK.aiToolsApp.workflowScreen().select("upscale"); await new Promise(r => setTimeout(r, 400)); out.plainRow = !!document.getElementById("hnkWfSelRow");
      document.getElementById("hnkWfBack").click(); await new Promise(r => setTimeout(r, 200));
      return out; });
    report("C4) the panel's Selection Edit: the request line is a full-width framed field (column layout, radius, maxlength 200) and the Selection row reads Photoshop on Check — none yet (an amber row), 640 × 420 px ✓ (a green row), a throwing host counts as none; a workflow without a region draws no row",
      c4.isText && c4.fieldFull && c4.maxlen === "200" && /9px/.test(c4.styled) && c4.row && c4.check && c4.none.cls === "hnk-sel-row none" && /Selection/.test(c4.none.txt) && c4.ok.cls === "hnk-sel-row ok" && /640 × 420 px/.test(c4.ok.txt) && c4.thrown.cls === "hnk-sel-row none" && !c4.plainRow, c4);
    report("C5) nothing threw in the panel while all of that ran", errs.length === 0, errs);
  } finally {
    await page.close(); server.close();
  }
}

/* ================= D) the release ================= */
function releasePins() {
  const ver = JSON.parse(read("docs/app/version.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json")), rm = JSON.parse(read("panel/release-manifest.json"));
  const appVer = ver.v, panVer = rm.version;
  report("D1) the release: app " + appVer + " / panel " + panVer + " agree across version.json, APP_VER, docs/download/panel-version.json (v + latest_version) and the release manifest; CI runs this test; the landing counts at least 229 tests; What's New carries the " + appVer + " row on the app and the panel",
    /^6\.9[3-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) && APP.indexOf('APP_VER="' + appVer + '"') > 0 && pv.v === panVer && pv.latest_version === panVer && /^6\.16[4-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    /node test\/verify_ui_wave_693\.js/.test(CI) && (parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10) >= 229) && APP.indexOf('{ v:"' + appVer + '"') > 0 && PWN.indexOf('{ v:"' + appVer + '"') >= 0, { appVer, panVer, pv: pv.v });
}

(async () => {
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try {
    await appWalk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — the card is tidy, Imagine is two to a row with a rail, the Retouch card shows the layer, and Selection Edit changes only the area on both surfaces");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
