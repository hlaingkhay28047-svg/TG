#!/usr/bin/env node
"use strict";
/* Build panel/js/hnk_studio_suites.js — the web app's Retouch A / Retouch B
   studio builders, extracted VERBATIM from docs/app/index.html.

   The Photoshop panel must show exactly the app's studio pages: the same
   groups, the same controls in the same order, the same labels in every
   language, the same presets, recipes, style pack and prompt composition.
   Hand-copying five thousand lines guarantees drift, so this tool slices the
   app's own source by anchors (function / statement starts, never fixed line
   numbers), applies a small set of mechanical rewrites for the UXP runtime,
   captures the data the slices read at runtime (D.retouch, presets, TR
   strings, live control counts) with Playwright, and emits one module:

       (function(){ … function build(H){ <prelude>; <slices>; return API; } … })();

   `H` is the panel's runtime layer (panel/src/ui/screens/retouch-studio-
   screen.js): UXP-safe el()/icn()/$() and the pixel pipeline stubs. Anything
   the slices call that neither they nor H define is a build error — the
   free-call check at the end refuses to emit a file that would throw a
   ReferenceError in Photoshop.

   Usage: node tools/build_panel_studio_suites.js [--report] [--no-capture]
   Requires docs/app served at http://127.0.0.1:${PORT||8931}/ for the
   capture step. test/verify_panel_studio_sync.js re-runs the same extraction
   and fails when the committed file no longer matches the app. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "docs", "app", "index.html");
const OUT = path.join(ROOT, "panel", "js", "hnk_studio_suites.js");
const PORT = process.env.PORT || 8931;

/* ---------------------------------------------------------------- slicing */

function readLines() { return fs.readFileSync(SRC, "utf8").split("\n"); }

function findLine(L, re, from) {
  for (let i = from || 0; i < L.length; i++) if (re.test(L[i])) return i;
  throw new Error("anchor not found: " + re);
}
/* a top-level block in the app closes on a bare `}` / `})();` / `};` / `];`
   line at column 0 — the file's style is consistent enough to lean on, and
   every slice boundary is echoed by --report so a drift is visible. */
function blockEnd(L, start, closer) {
  const re = closer === "iife" ? /^\}\)\(\);\s*$/ : closer === "stmt" ? /^[\]\}];\s*$/ : /^\}\s*$/;
  if (closer === "fn" && /\{.*\}\s*$/.test(L[start]) && depth(L[start]) === 0) return start; /* one-liner */
  for (let i = start + 1; i < L.length; i++) if (re.test(L[i])) return i;
  throw new Error("block end not found after line " + (start + 1));
}
function depth(line) { let d = 0; for (const ch of line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "")) { if (ch === "{") d++; else if (ch === "}") d--; } return d; }

/* SLICES — in emission order. `start` matches the first line; `end` is one of
   {fn|iife|stmt|line} (inclusive closer) or {until: regex} (exclusive). */
const SLICES = [
  { name: "ST + defaults + state.st + RT_BYKEY + sv helpers", start: /^var ST = \{/, until: /^function stRecomputeGhosts\(/ },
  { name: "stRecomputeGhosts", start: /^function stRecomputeGhosts\(/, end: "fn" },
  { name: "_stNudgeT + stNeedPhotoNudge", start: /^var _stNudgeT=0;/, until: /^function stT1Changed\(/ },
  { name: "stCurveVals", start: /^function stCurveVals\(/, end: "fn" },
  { name: "stHexRgb + ST_HSL_BANDS", start: /^function stHexRgb\(/, until: /^function stPipeVals\(/ },
  { name: "stPipeVals + stPipeDirty + stGeoActive", start: /^function stPipeVals\(/, until: /^function stGeoActive\(/, includeUntil: true },
  { name: "stIsDirty", start: /^function stIsDirty\(/, end: "fn" },
  { name: "stFaceNoteRefresh", start: /^function stFaceNoteRefresh\(/, end: "fn" },
  { name: "WF_BATCH_L", start: /^var WF_BATCH_L=\{/, end: "line" },
  { name: "stResetSection + grp + tapChip", start: /^function stResetSection\(/, until: /^function applyTap\(/ },
  { name: "stFeat registry … stRenderPend", start: /^function stFeat\(/, until: /^\/\* ---- v4\.58: quote the GENERATE/ },
  { name: "ST_HELP … factories … helpers … buildMeitu … buildEvoto", start: /^var ST_HELP = \{\}/, until: /^\/\* ================= v4\.45 — HNK 880 STYLE REFERENCE PACK/ },
  { name: "ST880 pack + build880Groups + ev_evoto", start: /^var ST880=\{/, until: /^\/\* ---- retouch-target chips/ },
  { name: "stTargetChips + stTargetPhrase", start: /^function stTargetChips\(/, until: /^\/\* ---- v4\.45 watermark core/ },
  { name: "wmGetLogo + wmOn", start: /^var WM_LOGO_LS=/, until: /^function wmStamp\(/ },
  { name: "export options IIFE", startBefore: /^  var host=\$\("stExpOpts"\); if\(!host\) return;/, end: "iife" },
  { name: "presets + stApplyPreset + stPresetT1Full", start: /^var ST_PRESETS_MU=\[/, until: /^\/\* A neutral, un-retouched beauty headshot/ },
  { name: "stT2Fragments + stUsesRefActive + stComposePrompt", start: /^function stT2Fragments\(/, until: /^\/\* ---------- v4\.56: show what was actually detected/ },
  { name: "stSuiteOf", start: /^function stSuiteOf\(/, end: "fn" },
  { name: "recipes (store, save, pin, apply, render)", start: /^var ST_RECIPE_LS=/, until: /^\/\* The suite badges used to be 31 hand-typed integers/ },
  { name: "control-count loop + static notes", start: /^ST_MEITU_COUNT=0; ST_EVOTO_COUNT=0;/, until: /^\$\("stHold"\)\.innerHTML=/ },
  { name: "recipe bar + preset subheads + clear-AI + HD finish + target chips",
    start: /^\$\("stRecipeNote"\)\.textContent=/, until: /^\/\* ---- sticky stage chrome/ },
  /* ---- RETOUCH PRO (the app's pgRetouch: V2 hero + manual one-tap/sliders) ---- */
  { name: "RT chip rows (Sliders pane)", start: /^var RT_LABEL_OVERRIDE = \{/, until: /^\/\* ---------- Retouch Studio: one-tap presets/ },
  { name: "RS presets, bundles, picker, mode + strength chips", start: /^var RS_NEW_PRESETS = \[/, until: /^function rsSyncGenControls\(/ },
  { name: "V2 defaults + state.v2 + house presets", start: /^var V2_DEF=\{/, until: /^function v2SetBusy\(/ },
  { name: "Retouch Pro static labels + first render", start: /^\$\("rsIntro"\)\.textContent = L9\(/, until: /^\/\* ================= HNK V2 RETOUCH/ },
  { name: "v2Sync + renderV2Hero", start: /^function v2Sync\(\)\{/, until: /^\/\* v5\.50\.0 — the tier runners used to force a Gemini model/ },
  { name: "V2 static labels + range wiring", start: /^\$\("v2LbStrength"\)\.textContent=L9\(/, until: /^\/\* ============ v4\.29|^\/\* =+ /, },
  { name: "jump bar IIFE", startBefore: /^  var tabs=\$\("stSuiteTabs"\); if\(!tabs\) return;/, end: "iife" }
];

function cutSlices(L) {
  const out = [];
  for (const s of SLICES) {
    let a;
    if (s.startBefore) a = findLine(L, s.startBefore) - 1;
    else a = findLine(L, s.start);
    let b;
    if (s.until) { b = findLine(L, s.until, a + 1) - 1; if (s.includeUntil) b += 1; }
    else if (s.end === "line") b = a;
    else b = blockEnd(L, a, s.end);
    let text = L.slice(a, b + 1);
    while (text.length && !text[text.length - 1].trim()) text.pop();
    out.push({ name: s.name, from: a + 1, to: b + 1, text: text.join("\n") });
  }
  return out;
}

/* ------------------------------------------------------------- rewrites */

/* Inline <svg> literals the app writes through innerHTML. UXP has no inline
   SVG, so each known literal becomes the matching icon file; an unknown one
   is a build error — never silently drop a glyph. */
const SVG_MAP = [
  { has: 'd="M3 12a9 9 0 1 0 3-6.7"', img: '<img class="icn ic-sa" src="icons/ui/st-reset-muted.svg">' },
  { has: 'class="st-tgi"', img: '<img class="icn st-tgi" src="icons/ui/st-target-gold.svg">' },
  { has: 'd="M6 18 18 6"', img: '<img class="st-thph" src="icons/ui/st-thumb-ph-muted.svg">' }
];

/* functions the runtime layer replaces (canvas / File API / DOM-query bound) */
const REPLACED = ["stColorInp", "st880BuildSheet", "st880ApplyRef"];

/* Line ranges inside the sliced builders that reach for the live stage or a
   canvas. Each is cut between two exact anchor lines and replaced by one
   line that hands the job to the runtime layer; a missing anchor fails the
   build so an upstream edit never silently strands a range. */
const RANGE_REWRITES = [
  { name: "hsl-pick-stage-tap",
    from: '  $("stCanvas").addEventListener("pointerdown",function(ev){',
    to: "  }, true);",
    repl: "  /* panel: no live stage — picking the HSL band by tapping the photo is not offered */" },
  { name: "grade-card-canvas",
    from: "      var gdpr=stTileDPR(), GW=ST_TILE_W*gdpr, GH=ST_TILE_H*gdpr;",
    to: "      b.appendChild(cv);",
    repl: "      b.appendChild(H.gradeTile(g));" },
  { name: "slider-row-order",
    from: "  row.appendChild(inp); row.appendChild(val);",
    to: "  row.appendChild(inp); row.appendChild(val);",
    /* the app puts the track on its own line with `order:5` over a DOM that
       has it second; with no `order` in UXP the value has to be appended
       before the track or the track's 100% basis eats the label's line */
    repl: "  row.appendChild(val); row.appendChild(inp);" },
  { name: "group-header-order",
    from: '  var car=el("span","car"); car.innerHTML=icn("i-caret","ic-car"); h.appendChild(car);',
    to: "  h.appendChild(ttl);",
    /* the app orders this header with CSS `order` (title 2, badge 3, reset 4,
       count 5, caret 9) over a DOM that starts with the caret. UXP has no
       `order`, so the panel builds the header in the app's VISUAL order and
       the boxes land where the web page puts them. */
    repl: ['  var ttl=el("span");',
      '  if(icon){ ttl.innerHTML=icn(icon)+" "+escH(stripIcn(title)); } else { ttl.textContent=stripIcn(title); }',
      '  h.appendChild(ttl);',
      '  var car=el("span","car"); car.innerHTML=icn("i-caret","ic-car"); h.appendChild(car);'].join("\n") },
  { name: "recipe-tile-canvas",
    from: "    var dpr=stTileDPR(), CW=ST_TILE_W*dpr, CH=ST_TILE_H*dpr;",
    to: "    b.appendChild(cv);",
    repl: "    b.appendChild(H.recipeTile(r));" },
  { name: "wm-logo-file-input",
    from: '  var wmInput=document.createElement("input");',
    to: "  wmRow.appendChild(wmPick); wmRow.appendChild(wmInput);",
    /* keep the app's own success toast verbatim; the file dialog and the
       512px downscale move to the runtime layer (UXP storage, no canvas) */
    repl: function (removed) {
      const toastLine = removed.find(function (l) { return /^\s*toast\(L9\(\{my:"Logo /.test(l); });
      if (!toastLine) throw new Error("wm-logo-file-input: success toast line not found");
      return ["  wmPick.onclick=function(){ H.pickLogo(function(dataUrl){",
        "    try{ localStorage.setItem(WM_LOGO_LS,dataUrl); }catch(e){}",
        "    svSet(\"st_wm_on\",true); wmTglPaint();",
        toastLine,
        "  }); };",
        "  wmRow.appendChild(wmPick);"].join("\n");
    } }
];

/* app functions parked on window that the module keeps as closure vars */
const WINDOW_FNS = ["stRenderGradeCards", "stRenderExportNote", "stSyncSuiteChips"];

function applyRanges(body) {
  const lines = body.split("\n");
  /* an anchor is an exact line, or a /regex/ when the line is too long or too
     full of dictionary text to quote */
  function find(anchor, from) {
    if (typeof anchor === "string") return lines.indexOf(anchor, from || 0);
    for (let i = from || 0; i < lines.length; i++) if (anchor.test(lines[i])) return i;
    return -1;
  }
  RANGE_REWRITES.forEach(function (r) {
    const a = find(r.from);
    if (a < 0) throw new Error("range anchor not found: " + r.name + " (from)");
    /* to === from marks a one-line range */
    let b = (r.to === r.from) ? a : find(r.to, a + 1);
    if (b < 0) throw new Error("range anchor not found: " + r.name + " (to)");
    const removed = lines.slice(a, b + 1);
    lines.splice(a, b - a + 1, typeof r.repl === "function" ? r.repl(removed) : r.repl);
  });
  return lines.join("\n");
}

function rewrite(text) {
  let s = text;
  s = s.replace(/<svg\b[^]*?<\/svg>/g, function (m) {
    const hit = SVG_MAP.find(function (e) { return m.indexOf(e.has) >= 0; });
    if (!hit) throw new Error("unknown inline <svg> literal in a slice:\n" + m.slice(0, 200));
    return hit.img;
  });
  REPLACED.forEach(function (fn) {
    const re = new RegExp("^function " + fn + "\\(", "m");
    if (!re.test(s)) return;
    s = s.replace(re, "function " + fn + "_app(");
  });
  s = s.replace(/"lib\/styles880\//g, 'ST_ASSET_BASE+"lib/styles880/');
  s = s.replace(/\bcurPage\b/g, "H.curPage()");
  s = s.replace(/\bwindow\.prompt\(/g, "H.promptText(");
  /* the app opens the browser's shared file input; the panel opens its own
     picker (the subject slot, or the reference slot for a style photo) */
  s = s.replace(/state\.pickSlot="stx"; \$\("filePick"\)\.click\(\);/g, 'H.pickRef();');
  s = s.replace(/state\.pickSlot=0; \$\("filePick"\)\.click\(\);/g, "H.pickPhoto();");
  /* dataset is one of the DOM niceties UXP does not carry; the same four
     reads and writes go through attributes instead (assignments first, or
     the read rule would eat their left-hand side) */
  s = s.replace(/\b([A-Za-z_$][\w$]*)\.dataset\.([\w$]+)\s*=(?!=)\s*([^;]+);/g,
    '$1.setAttribute("data-$2", $3);');
  s = s.replace(/\b([A-Za-z_$][\w$]*)\.dataset\.([\w$]+)/g,
    '($1.getAttribute("data-$2")||"")');
  /* the app parks late-bound studio functions on window so sibling
     builders can reach them; inside the module they are plain closure vars
     the prelude declares (see WINDOW_FNS) */
  s = s.replace(/\bwindow\.(st[A-Z][\w$]*)\b/g, "$1");
  s = s.replace(/\bstT1Changed\(\)\{ if\(!ST\.srcBitmap\)/g, "stT1Changed(){ if(!ST.srcBitmap)"); /* no-op guard for grep */
  return s;
}

/* Names the slices may reach that live outside them — every one must be
   supplied by the prelude below (from H or as a stub). The free-call check
   walks each `name(` call in the emitted body and demands a definition. */
const PRELUDE_NAMES = [
  /* app core */ "$", "D", "L9", "LANG", "el", "escH", "icn", "stripIcn", "setIcnText", "state", "saveState", "toast", "t", "switchPage", "byKey",
  "PT_MAX", "PT_SRC_STUDIO", "ptSetWorkflow", "ST_SUITE_PAGE", "ST_ASSET_BASE", "unreadableImgMsg", "renderRefs",
  /* panel replacements */ "stColorInp", "st880BuildSheet", "st880ApplyRef", "stCountControls", "stRenderPresetCards", "renderStPicker", "stRenderThumbs", "stLookArt",
  /* pixel pipeline / stage — no live preview in the panel, so these settle to no-ops */
  "stT1Changed", "stT2Changed", "stPipeChanged", "stGeoChanged", "stRenderSettle", "stComputeWb", "stNoiseNote", "stSkinAnalyze", "stAutoEnhance",
  "stDrawHistogram", "stRunPipeline", "stQuoteCost", "stFaceGated", "stMountSuite", "stExportDims", "stExport2Up", "stSyncFromRef",
  "stDropFull", "wmStamp", "stUiSoon", "stShowZones", "rhIsConfigured", "gate", "stFullSnap", "stUndoBtns",
  /* Retouch Pro */ "buildRetouch", "renderAddonSummary", "rhEngineLabel", "rsRunOnetap", "setSt", "rsDoGenerate", "rsShowResult", "v2SetBusy", "stUndoTick", "stCssFilter", "stEffT1", "stEffT2", "stUiSave", "stHold", "stZonesBtn"
];

/* --------------------------------------------------------------- capture */

async function capture(slicesText) {
  const { chromium } = require("playwright-core");
  const tKeys = uniq(Array.from(slicesText.matchAll(/\bt\("([a-z0-9_]+)"\)/g)).map(function (m) { return m[1]; }));
  const byKeys = uniq(Array.from(slicesText.matchAll(/\bbyKey\.([a-zA-Z0-9_]+)\b/g)).map(function (m) { return m[1]; }));
  const dPaths = uniq(Array.from(slicesText.matchAll(/\bD\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/g)).map(function (m) { return m[1]; }));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    page.on("pageerror", function (e) { errs.push(String(e).slice(0, 200)); });
    await page.addInitScript(`try{ localStorage.setItem("hnk_seen_splash","1"); localStorage.setItem("hnk_ws_onboarded","1"); localStorage.setItem("hnk_rh_apikey","TEST_RH_KEY"); }catch(e){}`);
    await page.addInitScript(`(function(){
      var UID="77777777-8888-4999-aaaa-bbbbbbbbbbbb";
      var exp=new Date(Date.now()+30*86400000).toISOString();
      var prof={id:UID,name:"Student Name",email:"student@example.com",created_at:"2026-01-15T10:00:00Z",
        plan_status:"active",plan_expires_at:exp,allowed_devices:2,is_admin:false,avatar:null};
      try{ localStorage.setItem("hnk_acc_sess_v1",JSON.stringify({access:"a",refresh:"r",exp:Math.floor(Date.now()/1000)+7200,uid:UID,email:"student@example.com"}));
           localStorage.setItem("hnk_acc_profile_v1",JSON.stringify(prof)); }catch(e){}
      var realFetch=window.fetch.bind(window);
      function json(b,s){ return Promise.resolve(new Response(JSON.stringify(b),{status:s||200,headers:{"Content-Type":"application/json"}})); }
      window.fetch=function(url,init){ url=String(url);
        if(url.indexOf("127.0.0.1")>=0 && url.indexOf("/api/")<0) return realFetch(url,init);
        if(url.indexOf("/rest/v1/profiles")>=0) return json(prof);
        if(url.indexOf("/v1/me/entitlement")>=0) return json({account:{status:"active"},license:{active:true,status:"active",expires_at:exp},
          permissions:{web_app:true,ccx_download:true,photoshop_panel:true,panel:true},
          devices:{computer:{label:"Windows PC",device_name:"Windows PC"}},panel:{latest_version:"6.50.0"}});
        if(url.indexOf("runninghub.ai")>=0) return json({code:0,data:{}});
        return json({},200);
      };
    })();`);
    await page.route("**/*", function (route) {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image")
        return route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    await page.evaluate(function () {
      try { document.body.classList.remove("wall"); } catch (e) {}
      window.scrollTo = function () {}; Element.prototype.scrollIntoView = function () {};
      try { switchPage("pgMeitu"); } catch (e) {}
    });
    await page.waitForTimeout(800);
    /* open every Style Looks group so the lazy catalog groups report their real count */
    await page.evaluate(function () {
      document.querySelectorAll("#muHost .grp, #evHost .grp").forEach(function (g) {
        var h = g.querySelector(".grp-h .cnt");
        if (h && /…/.test(h.textContent)) g.querySelector(".grp-h").click();
      });
    });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(function (arg) {
      var out = {};
      out.langs = Object.keys(TR_L).concat(Object.keys(LANG_FB), ["my", "en"]).filter(function (c, i, a) { return a.indexOf(c) === i; }).sort();
      out.tr = {};
      var keep = LANG;
      arg.tKeys.forEach(function (k) { out.tr[k] = {}; });
      out.langs.forEach(function (lg) { LANG = lg; arg.tKeys.forEach(function (k) { out.tr[k][lg] = t(k); }); });
      LANG = keep;
      out.D = {}; out.Dskip = [];
      function plain(v) { var j; try { j = JSON.stringify(v); } catch (e) { return undefined; } return j === undefined ? undefined : JSON.parse(j); }
      /* `D.presets.filter(...)` names a method, not a subtree — capture the
         longest prefix that is actually data so the slice still finds it */
      arg.dPaths = arg.dPaths.map(function (p) {
        var parts = p.split("."), cur = D, keep = [];
        for (var i = 0; i < parts.length; i++) {
          if (cur == null || typeof cur[parts[i]] === "function") break;
          cur = cur[parts[i]]; keep.push(parts[i]);
        }
        return keep.join(".") || p;
      }).filter(function (p, i, a) { return p && a.indexOf(p) === i; });
      arg.dPaths.forEach(function (p) {
        var parts = p.split("."), cur = D, tgt = out.D;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) { out.Dskip.push(p + " (nothing at " + parts.slice(0, i).join(".") + ")"); return; }
          cur = cur[parts[i]];
          if (i === parts.length - 1) {
            var v = plain(cur === undefined ? null : cur);
            if (v === undefined) { out.Dskip.push(p + " (not JSON — " + typeof cur + ")"); return; }
            tgt[parts[i]] = v;
          } else { tgt[parts[i]] = tgt[parts[i]] || {}; tgt = tgt[parts[i]]; }
        }
      });
      out.byKey = {};
      arg.byKeys.forEach(function (k) { out.byKey[k] = byKey[k] ? JSON.parse(JSON.stringify(byKey[k])) : null; });
      out.PT_MAX = PT_MAX; out.PT_SRC_STUDIO = PT_SRC_STUDIO;
      /* the app's own fallback chain, so the panel resolves a dialect exactly
         as the web page does rather than from a hand-copied table */
      out.LANG_FB = JSON.parse(JSON.stringify(LANG_FB));
      out.ST_SUITE_PAGE = ST_SUITE_PAGE;
      out.counts = ST.groups.map(function (g) {
        var c = g.el.querySelector(".grp-h .cnt");
        return { host: g.host, title: g.title, icon: g.icon, n: stCountControls(g.el), cnt: c ? c.textContent : "" };
      });
      out.ST_MEITU_COUNT = ST_MEITU_COUNT; out.ST_EVOTO_COUNT = ST_EVOTO_COUNT;
      out.unit = out.tr.unit;
      return out;
    }, { tKeys: tKeys, byKeys: byKeys, dPaths: dPaths });
    if (data.Dskip && data.Dskip.length) console.error("  note — D paths not captured as data:\n    " + data.Dskip.join("\n    "));
    if (errs.length) throw new Error("app page errors during capture: " + errs.join(" | "));
    /* the two 880 groups count their own controls after the catalog loads;
       a "…" left in any header means the capture ran too early */
    data.counts.forEach(function (c) { if (/…/.test(c.cnt)) throw new Error("group still loading during capture: " + c.title); });
    return data;
  } finally { await browser.close(); }
}

function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

/* ---------------------------------------------------------------- emit */

function prelude() {
  return [
    "  var $=H.$, D=H.D, L9=H.L9, LANG=H.lang(), el=H.el, escH=H.escH, icn=H.icn, stripIcn=H.stripIcn, setIcnText=H.setIcnText;",
    "  var state=H.state, saveState=H.saveState, toast=H.toast, switchPage=H.switchPage, byKey=H.byKey;",
    "  var PT_MAX=DATA.PT_MAX, PT_SRC_STUDIO=DATA.PT_SRC_STUDIO, ptSetWorkflow=H.ptSetWorkflow, ST_SUITE_PAGE=DATA.ST_SUITE_PAGE;",
    "  var ST_ASSET_BASE=H.assetBase, unreadableImgMsg=H.unreadableImgMsg, renderRefs=H.renderRefs;",
    "  function t(k){ var e=DATA.tr[k]; if(!e) return k; var v=e[LANG]; if(v===undefined) v=e[H.langFallback(LANG)]; if(v===undefined) v=e.en!==undefined?e.en:e.my; return v===undefined?k:v; }",
    "  /* panel replacements for canvas / File API / DOM-query bound app functions */",
    "  var stColorInp=H.stColorInp, st880BuildSheet=H.st880BuildSheet, st880ApplyRef=H.st880ApplyRef, stCountControls=H.stCountControls;",
    "  var stRenderPresetCards=H.stRenderPresetCards, renderStPicker=H.renderStPicker, stRenderThumbs=H.stRenderThumbs, stLookArt=H.stLookArt;",
    "  /* the pixel pipeline / stage has no home in Photoshop's panel (the",
    "     document IS the preview) — every hook the builders call settles to a",
    "     no-op, and the sliders keep their values for the prompt composer */",
    "  function noop(){}",
    "  var stT1Changed=H.stT1Changed||noop, stT2Changed=H.stT2Changed||noop, stPipeChanged=noop, stGeoChanged=noop, stRenderSettle=noop;",
    "  var stComputeWb=H.stComputeWb||noop, stNoiseNote=H.stNoiseNote||noop, stSkinAnalyze=H.stSkinAnalyze||noop, stAutoEnhance=H.stAutoEnhance||noop;",
    "  var stDrawHistogram=noop, stRunPipeline=noop, stQuoteCost=H.stQuoteCost||noop;",
    "  var " + WINDOW_FNS.map(function (n) { return n + "=null"; }).join(", ") + ";",
    "  function stFaceGated(){ return false; }",
    "  var stMountSuite=H.stMountSuite||noop, stExportDims=H.stExportDims||function(){ return null; }, stExport2Up=H.stExport2Up||noop;",
    "  var stShowZones=H.stShowZones||noop;",
    "  /* the panel gates at its own GENERATE button (armGate), and it knows",
    "     from Setup whether the upscale deployment is configured */",
    "  var rhIsConfigured=H.rhIsConfigured||function(){ return false; }, gate=function(){ return true; };",
    "  var stFullSnap=function(){ return null; }, stUndoBtns=noop;",
    "  /* ---- Retouch Pro: the prompt the slider chips compose is the app's own;",
    "     the run itself is the panel's (Photoshop document in, layer out). ---- */",
    "  function buildRetouch(){",
    "    var L=[];",
    "    D.retouch.sliders.forEach(function(s){ if(state.rt[s.key]) L.push(rtLine(s)); });",
    "    if(!L.length) return \"\";",
    "    return (D.retouch.header||\"PROFESSIONAL RETOUCH INSTRUCTIONS (studio quality, photorealistic):\")+\"\\n\"+L.join(\"\\n\");",
    "  }",
    "  var renderAddonSummary=noop, setSt=noop, rsShowResult=noop, v2SetBusy=noop;",
    "  var rhEngineLabel=H.rhEngineLabel||function(){ return \"\"; };",
    "  var rsRunOnetap=H.rsRunOnetap||noop, rsDoGenerate=H.rsDoGenerate||function(){ return Promise.resolve(false); };",
    "  var stSyncFromRef=H.stSyncFromRef||noop, stDropFull=noop, wmStamp=H.wmStamp||function(cv,cb){ cb&&cb(cv); }, stUiSoon=noop, stUndoTick=noop;",
    "  var stCssFilter=function(){ return \"none\"; }, stEffT1=function(){ return state.st.t1; }, stEffT2=function(){ return state.st.t2; };",
    "  var stZonesBtn=null;",
    "  if(H.beforeBuild) H.beforeBuild();"
  ].join("\n");
}

function exportsBlock() {
  return [
    "  return {",
    "    ST:ST, grp:grp, tapChip:tapChip, stResetSection:stResetSection,",
    "    stFeat:stFeat, stSync:stSync, stFeatReset:stFeatReset, stRenderPend:stRenderPend, stRefreshDots:stRefreshDots, stLiveCount:stLiveCount,",
    "    stRecomputeGhosts:stRecomputeGhosts, stRefreshUI:stRefreshUI, stIsDirty:stIsDirty, stNeedPhotoNudge:stNeedPhotoNudge,",
    "    svGet:svGet, svSet:svSet, stSaveSoon:stSaveSoon, stDefT1:stDefT1, stDefT2:stDefT2, stDefGeo:stDefGeo, stClamp:stClamp,",
    "    stSlider:stSlider, stChips:stChips, stToggle:stToggle, stCtlRow:stCtlRow, stSub:stSub, stNote:stNote,",
    "    stT2Fragments:stT2Fragments, stComposePrompt:stComposePrompt, stUsesRefActive:stUsesRefActive, stTargetPhrase:stTargetPhrase, stTargetChips:stTargetChips,",
    "    stSuiteOf:stSuiteOf, stApplyPreset:stApplyPreset, stSnapshot:stSnapshot, stPresetT1Full:stPresetT1Full, ST_PRESETS_MU:ST_PRESETS_MU, ST_PRESETS_EV:ST_PRESETS_EV,",
    "    stRecipes:stRecipes, stRecipesSave:stRecipesSave, stSaveRecipe:stSaveRecipe, stRenderRecipes:stRenderRecipes, stPinRecipe:stPinRecipe, stPinnedRecipeIdx:stPinnedRecipeIdx, stApplyRecipe:stApplyRecipe,",
    "    st880Load:st880Load, st880Sel:st880Sel, st880Pick:st880Pick, st880Name:st880Name, st880Refresh:st880Refresh, st880Clear:st880Clear, ST880:ST880,",
    "    stLine:stLine, stLineSigned:stLineSigned, RT_BYKEY:RT_BYKEY, stPipeVals:stPipeVals, stCurveVals:stCurveVals,",
    "    stSyncSuiteChips:(typeof stSyncSuiteChips===\"function\"?stSyncSuiteChips:null), wmOn:wmOn, wmGetLogo:wmGetLogo,",
    "    buildRetouch:buildRetouch, rtLine:rtLine, rtLabel:rtLabel, renderRtChips:renderRtChips,",
    "    v2BuildPrompt:v2BuildPrompt, renderV2Hero:renderV2Hero, v2Sync:v2Sync, renderRsPicker:renderRsPicker,",
    "    renderRsPresetGrid:renderRsPresetGrid, renderRsBundleGrid:renderRsBundleGrid, renderRsStrengthChips:renderRsStrengthChips,",
    "    rsSetMode:rsSetMode, rsPresetText:rsPresetText, RS_ONETAP_KEYS:RS_ONETAP_KEYS,",
    "    RS_NEED_PHOTO:RS_NEED_PHOTO, WF_BATCH_L:WF_BATCH_L, ST_TILE_W:ST_TILE_W, ST_TILE_H:ST_TILE_H, stTileDPR:stTileDPR,",
    "    ST_MEITU_COUNT:ST_MEITU_COUNT, ST_EVOTO_COUNT:ST_EVOTO_COUNT, t:t",
    "  };"
  ].join("\n");
}

function emit(slices, data, meta) {
  const body = applyRanges(slices.map(function (s) {
    return "  /* ===== app " + s.from + "–" + s.to + ": " + s.name + " ===== */\n" + rewrite(s.text);
  }).join("\n\n"));
  const head = [
    "/* GENERATED by tools/build_panel_studio_suites.js from docs/app/index.html — do not edit.",
    "   The web app's Retouch A / Retouch B studio, verbatim: groups, controls,",
    "   labels, presets, recipes, the 880-style pack and the prompt composer.",
    "   Regenerate with `node tools/build_panel_studio_suites.js`; the sync test",
    "   test/verify_panel_studio_sync.js fails when this file drifts from the app.",
    "   Sloppy mode on purpose: the app's own code is sloppy-mode and relies on",
    "   function hoisting across its slices. */",
    "(function(){",
    "var _CJS=(typeof module!==\"undefined\"&&module.exports);",
    "var DATA=" + JSON.stringify(data) + ";",
    "var META=" + JSON.stringify(meta) + ";",
    "function build(H){",
    prelude(),
    "",
    body,
    "",
    exportsBlock(),
    "}",
    "var API={build:build, DATA:DATA, META:META};",
    "if(_CJS) module.exports=API; else { globalThis.HNK=globalThis.HNK||{}; globalThis.HNK.studioSuites=API; }",
    "})();",
    ""
  ].join("\n");
  return head;
}

/* ------------------------------------------------------ validation */

const JS_KEYWORDS = new Set(("if else for while do switch case return function var let const new typeof instanceof in of try catch finally throw " +
  "break continue delete void this null true false undefined await async class extends super yield with default").split(" "));

function freeCalls(bodyText, preludeNames) {
  /* every `ident(` that is neither declared in the body nor supplied by the
     prelude — property calls (`.x(`) and keywords excluded */
  const clean = bodyText.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""')
    /* regex literals in argument position — `.replace(/\b60(?=%)/g` is not a call to b60 */
    .replace(/([(,=:]\s*)\/(?:\\.|[^\/\n*])+?\/[gimsuy]*/g, '$1""');
  const defined = new Set(preludeNames);
  for (const m of clean.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
  for (const m of clean.matchAll(/\b(?:var|let|const)\s+([^;=\n]+)/g)) {
    m[1].split(",").forEach(function (p) { const n = p.trim().split(/\s|=/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n); });
  }
  for (const m of clean.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*function\b/g)) defined.add(m[1]);
  for (const m of clean.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)) m[1].split(",").forEach(function (p) { p = p.trim(); if (p) defined.add(p); });
  for (const m of clean.matchAll(/\(([A-Za-z_$][\w$,\s]*)\)\s*=>/g)) m[1].split(",").forEach(function (p) { p = p.trim(); if (p) defined.add(p); });
  const GLOBALS = new Set("Math JSON Object Array String Number Boolean Date parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame Promise Error Response fetch localStorage document window navigator console encodeURIComponent decodeURIComponent FileReader Image Blob URL Path2D Uint8ClampedArray Uint8Array Float32Array Int32Array Uint32Array ImageData OffscreenCanvas Worker performance alert confirm getComputedStyle escape unescape RegExp Symbol Map Set WeakMap Reflect Proxy structuredClone queueMicrotask atob btoa TextEncoder TextDecoder".split(" "));
  for (const m of clean.matchAll(/catch\s*\(\s*([\w$]+)\s*\)/g)) defined.add(m[1]);
  for (const m of clean.matchAll(/for\s*\(\s*(?:var\s+)?([\w$]+)\s+(?:in|of)\b/g)) defined.add(m[1]);
  /* Calls only. A bare read of an undefined name (`RT_LABEL_OVERRIDE[k]`) is
     just as fatal, but a regex cannot tell one from a destructured local
     without a parser — test/verify_panel_studio_sync.js catches that class by
     BUILDING the module in a browser and failing on the first page error. */
  const free = new Set();
  for (const m of clean.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = m[2];
    if (JS_KEYWORDS.has(n) || GLOBALS.has(n) || defined.has(n)) continue;
    free.add(n);
  }
  return Array.from(free).sort();
}

function banned(bodyText) {
  /* DOM APIs UXP does not offer. The panel runtime replaces the functions
     that need them; a slice reaching for one is a slicing mistake. */
  const hits = [];
  const re = /\b(createElement\("canvas"\)|getContext\(|new Image\(|new FileReader\(|new Path2D\(|createImageBitmap\(|<svg\b|type="color"|\.animate\()/g;
  const lines = bodyText.split("\n");
  let cur = "";
  lines.forEach(function (l, i) {
    const f = /^function ([\w$]+)\(/.exec(l);
    if (f) cur = f[1];
    /* a `_app`-renamed function is dead weight the runtime layer shadows —
       what it reaches for never runs in the panel */
    if (re.test(l) && !/_app$/.test(cur)) hits.push((i + 1) + " [" + cur + "]: " + l.trim().slice(0, 140));
    re.lastIndex = 0;
  });
  return hits;
}

/* ------------------------------------------------------------- main */

async function generate(opts) {
  opts = opts || {};
  const L = readLines();
  const slices = cutSlices(L);
  const joined = slices.map(function (s) { return s.text; }).join("\n");
  const body = applyRanges(slices.map(function (s) { return rewrite(s.text); }).join("\n"));
  if (process.env.DUMP_BODY) fs.writeFileSync(process.env.DUMP_BODY, body);
  const problems = banned(body);
  if (problems.length) throw new Error("slices reach for browser-only APIs the panel cannot run:\n" + problems.join("\n"));
  const preludeNames = PRELUDE_NAMES.concat(WINDOW_FNS, ["noop", "H", "DATA", "META"]);
  const free = freeCalls(body, preludeNames);
  if (free.length) throw new Error("slices call functions nothing defines: " + free.join(", "));
  const data = opts.capture === false ? (opts.data || null) : await capture(joined);
  const meta = { source: "docs/app/index.html", slices: slices.map(function (s) { return { name: s.name, from: s.from, to: s.to, lines: s.to - s.from + 1 }; }) };
  return { slices: slices, body: body, data: data, meta: meta, text: data ? emit(slices, data, meta) : null };
}

if (require.main === module) {
  (async function () {
    const report = process.argv.indexOf("--report") >= 0;
    const noCapture = process.argv.indexOf("--no-capture") >= 0;
    const r = await generate({ capture: !noCapture });
    if (report) {
      r.slices.forEach(function (s) {
        const first = s.text.split("\n")[0].slice(0, 100), last = s.text.split("\n").slice(-1)[0].slice(0, 100);
        console.log(`${String(s.from).padStart(6)}–${String(s.to).padEnd(6)} ${s.name}\n        ┌ ${first}\n        └ ${last}`);
      });
      if (r.data) console.log("data:", JSON.stringify({ langs: r.data.langs.length, tr: Object.keys(r.data.tr), byKey: Object.keys(r.data.byKey), D: Object.keys(r.data.D), counts: r.data.counts.length, mu: r.data.ST_MEITU_COUNT, ev: r.data.ST_EVOTO_COUNT }));
    }
    if (noCapture) { console.log("slices OK (" + r.slices.length + "), no file written without capture"); return; }
    fs.writeFileSync(OUT, r.text);
    console.log("wrote " + path.relative(ROOT, OUT) + " — " + r.text.split("\n").length + " lines, " + r.slices.length + " slices, " + r.data.counts.length + " groups (A " + r.data.ST_MEITU_COUNT + " / B " + r.data.ST_EVOTO_COUNT + " controls)");
  })().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
}

module.exports = { generate: generate, SLICES: SLICES, OUT: OUT };
