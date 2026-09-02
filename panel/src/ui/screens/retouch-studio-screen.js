/* ============================================================
   HNK — Retouch A / Retouch B STUDIO, the web app's own build code
   running inside Photoshop.

   THE PROBLEM THIS SOLVES. The owner's instruction is that a student sees
   the same pages in the panel as on the web — "ui ux pages function features
   ကွက်တိ", nothing extra, nothing missing, nothing out of place. The app's
   two studio suites are 375 controls across 34 collapsible groups, sixteen
   one-tap presets, saved recipes, an 880-image style pack and a prompt
   composer that turns every slider into one sentence. Re-typing that by hand
   would drift the day it shipped.

   So it is not re-typed. tools/build_panel_studio_suites.js slices the app's
   own builders out of docs/app/index.html into panel/js/hnk_studio_suites.js
   (verified by test/verify_panel_studio_sync.js), and THIS file is the
   runtime those slices run on: the `H` object below is every function the
   app's code reaches for, re-implemented against UXP's DOM subset.

   WHAT UXP CANNOT DO, AND WHAT THE PANEL DOES INSTEAD
     · No <canvas>. The app's live preview, histogram, tile thumbnails and
       2-up export are canvas work — in Photoshop the DOCUMENT is the preview,
       so the stage is not drawn at all. Preset tiles use the app's own
       photographs (icons/looks/*.jpg, the same files it serves).
     · No inline <svg>. Every icon is a pre-tinted file; because an <img> has
       no currentColor, an icon that must change colour with its container
       ships as one <img> per tint and the stylesheet shows the right one.
     · No <input type=color>. Colour wells become tap-through swatch rows.
     · No FileReader / <input type=file>. Photos come from the panel's own
       picker (the shared PHOTO slot) and logos from Photoshop's file dialog.
   Everything else — every label in every language, every group, every chip,
   every prompt fragment — is the app's, byte for byte.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var g = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined" ? window : {});
var suites = _CJS ? require("../../../js/hnk_studio_suites.js") : (g.HNK && g.HNK.studioSuites);

/* main.js publishes the panel's own state, toast, generate and picker as
   HNK.studioHost; it loads AFTER this file, so the bridge is resolved lazily
   at mount time and never at definition time. */
function bridge() { return (g.HNK && g.HNK.studioHost) || null; }
function doc() { return (typeof document !== "undefined") ? document : null; }
function $(id) { var d = doc(); return d && d.getElementById ? d.getElementById(id) : null; }

var API = null;        /* what suites.build(H) returned */
var builtLang = null;  /* the language the current build was made in */
var mountedPage = "";

/* ---------------------------------------------------------------- shims */
/* UXP's element prototype is a subset; the app's slider rows use these two. */
function shim() {
  try {
    var E = (typeof Element !== "undefined") ? Element.prototype : null;
    if (!E) return;
    if (!E.insertAdjacentElement) {
      E.insertAdjacentElement = function (pos, node) {
        if (pos === "afterend") { if (this.parentNode) this.parentNode.insertBefore(node, this.nextSibling); }
        else if (pos === "beforebegin") { if (this.parentNode) this.parentNode.insertBefore(node, this); }
        else if (pos === "afterbegin") this.insertBefore(node, this.firstChild);
        else this.appendChild(node);
        return node;
      };
    }
  } catch (e) { /* a stub document in tests has no Element */ }
}

/* ------------------------------------------------------------- icons */
/* One <img> per tint the icon's contexts need; styles.css shows exactly one.
   Group-header titles are gold, chips are cream and turn ink on the gold
   active pill, and the two counters in the generate bar are muted. */
var TINTS = {};
function tintTable() {
  if (TINTS.__done) return TINTS;
  TINTS.__done = true;
  var counts = (suites && suites.DATA && suites.DATA.counts) || [];
  for (var i = 0; i < counts.length; i++) {
    var n = counts[i].icon;
    if (n) TINTS[n] = ["cream", "gold"];
  }
  /* the two symbols that head a group AND sit inside a chip */
  TINTS["i-drop"] = ["cream", "gold", "ink"];
  TINTS["i-brush"] = ["cream", "gold", "ink"];
  /* muted: the live/AI tally the generate bar prints */
  TINTS["i-eye"] = ["cream", "gold", "muted"];
  TINTS["i-bolt"] = ["cream", "ink", "muted"];
  return TINTS;
}
var TINT_LETTER = { cream: "i2c", gold: "i2g", ink: "i2k", muted: "i2m" };
function icn(name, cls) {
  var c = cls || "ic-s";
  /* a class that fixes the colour outright needs one file, not a set */
  if (c.indexOf("ic-car") >= 0) return '<img class="' + c + '" src="icons/ui/' + name + '-gold.svg">';
  if (c.indexOf("ic-xl") >= 0) return '<img class="' + c + '" src="icons/ui/' + name + '-muted.svg">';
  if (c.indexOf("ic-h2") >= 0) return '<img class="' + c + '" src="icons/ui/' + name + '-gold.svg">';
  var tints = tintTable()[name] || ["cream", "ink"];
  var out = "";
  for (var i = 0; i < tints.length; i++) {
    out += '<img class="' + c + " " + TINT_LETTER[tints[i]] + '" src="icons/ui/' + name + "-" + tints[i] + '.svg">';
  }
  return out;
}
function escH(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}
var ICN_LEAD = /^(?:[←-⇿☀-➿⬀-⯿〰■-◿⭐️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF])+\s*/;
function stripIcn(s) { return String(s == null ? "" : s).replace(ICN_LEAD, ""); }
function setIcnText(elm, name, text, opts) {
  opts = opts || {};
  var txt = escH(stripIcn(text));
  elm.innerHTML = opts.after ? txt + " " + icn(name, opts.cls) : icn(name, opts.cls) + " " + txt;
}

/* --------------------------------------------------------------- el() */
/* The app's el(tag, cls, txt). "button" becomes a div for the same reason
   every other panel screen does it: Adobe paints its own widget over a real
   <button>, flattening children and dropping the Burmese font. */
function el(tag, cls, txt) {
  var d = doc();
  var isBtn = (tag === "button");
  var e = d.createElement(isBtn ? "div" : tag);
  if (isBtn && e.setAttribute) { e.setAttribute("role", "button"); e.setAttribute("tabindex", "0"); }
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

/* ------------------------------------------------------------ i18n */
function lang() {
  try {
    var b = g.HNK && g.HNK.i18n;
    return (b && typeof b.lang === "function") ? b.lang() : "my";
  } catch (e) { return "my"; }
}
/* the app's own LANG_FB chain, captured by the build tool with the strings it
   resolves — never a hand-copied second table that could drift from it */
function fbTable() { return (suites && suites.DATA && suites.DATA.LANG_FB) || {}; }
function langFallback(lg) { return fbTable()[lg] || "en"; }
function L9(o) {
  var lg = lang();
  if (o[lg] !== undefined) return o[lg];
  var fb = fbTable()[lg];
  if (fb && o[fb] !== undefined) return o[fb];
  return o.en !== undefined ? o.en : o.my;
}

/* --------------------------------------------------- panel-side state */
function hstate() { var b = bridge(); return b ? b.state() : {}; }
function saveState() { var b = bridge(); if (b && b.saveState) b.saveState(); }
function toast(msg, kind) { var b = bridge(); if (b && b.toast) b.toast(msg, kind); }
function switchPage(id) { var b = bridge(); if (b && b.switchPage) b.switchPage(id); }
function curPage() { var b = bridge(); return b && b.curPage ? b.curPage() : ""; }

/* Photoshop has no window.prompt — and no synchronous dialog at all. The
   app's two prompts both name a recipe, so the call returns the suggested
   name (the app then carries on with it) while the panel's own dialog opens
   behind it; whatever the student types is applied to that recipe when they
   confirm. Nothing is lost either way: cancel leaves the suggested name. */
function promptText(msg, def) {
  var b = bridge();
  var old = def == null ? "" : String(def);
  if (b && b.askText) {
    b.askText(String(msg || ""), old, function (val) {
      if (val == null) return;
      renameRecipeByName(old, val);
    });
  }
  return old;
}
function renameRecipeByName(oldName, val) {
  if (!API) return;
  var name = String(val).slice(0, 24);
  if (!name) return;
  var a = API.stRecipes();
  for (var i = 0; i < a.length; i++) {
    if (a[i].name === oldName) { a[i].name = name; API.stRecipesSave(a); API.stRenderRecipes(); return; }
  }
  /* Save recipe asks for the name BEFORE it stores the card, so the answer
     belongs to the newest one */
  if (a.length) { a[a.length - 1].name = name; API.stRecipesSave(a); API.stRenderRecipes(); }
}

function unreadableImgMsg() {
  return L9({ my: "ဒီပုံကို ဖတ်လို့မရပါ — တခြားပုံတစ်ပုံ စမ်းကြည့်ပါ", en: "That image could not be read — try another file" });
}

/* ------------------------------------------------- replaced renderers */

/* Colour wells: UXP has no <input type=color>, so each well is a row of the
   app's own preset colours plus an "unset" state, carrying the same id, the
   same class and the same get/set contract the studio code expects. */
var SWATCHES = ["#f7e7d8", "#e8c39e", "#c9927a", "#c04858", "#8d3b4a", "#7a5c3e", "#3a2a18",
  "#2e3a24", "#4a5560", "#0f4a5a", "#7a86b8", "#f4d488", "#ffb46a", "#e8eef2"];
function stColorInp(o) {
  var wrap = el("div", "st-sws");
  wrap.id = o.id;
  function paint() {
    var cur = o.get();
    var kids = wrap.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i], v = k.getAttribute ? k.getAttribute("data-hex") : null;
      if (!k.className) continue;
      var on = (v === "" && !cur) || (cur && v && String(cur).toLowerCase() === v);
      k.className = "st-sw" + (v === "" ? " off" : "") + (on ? " on" : "");
    }
  }
  var none = el("button", "st-sw off");
  none.setAttribute("data-hex", "");
  none.title = L9({ my: "မသတ်မှတ်", en: "Not set" });
  none.onclick = function () { o.set(null); paint(); };
  wrap.appendChild(none);
  SWATCHES.forEach(function (hex) {
    var b = el("button", "st-sw");
    b.setAttribute("data-hex", hex);
    b.style.background = hex;
    b.title = (o.label || "") + " " + hex;
    b.onclick = function () { o.set(hex); paint(); };
    wrap.appendChild(b);
  });
  paint();
  if (API && API.ST) API.ST.refreshFns.push(paint);
  return wrap;
}

/* Preset / recipe / style tiles. The app draws each tile on a canvas; the
   panel shows the same artwork as an <img> inside a fixed 76x96 window
   (no object-fit in UXP, so the image is width-fitted and the window crops,
   biased upward exactly as stDrawLookArt does). */
function tile(src, cls) {
  var w = el("span", "st-tile" + (cls ? " " + cls : ""));
  if (src) {
    var im = doc().createElement("img");
    im.className = "st-tile-im";
    im.src = src;
    im.alt = "";
    w.appendChild(im);
  }
  return w;
}
function gradeTile(gd) {
  /* the app's no-photo branch: a vertical strip of the grade's own colours */
  var w = el("span", "st-tile");
  var stops = [gd.hi || "#f4d488"];
  if (gd.mid) stops.push(gd.mid);
  stops.push(gd.sh || "#131826");
  w.style.background = "linear-gradient(180deg," + stops.join(",") + ")";
  return w;
}

function stRenderPresetCards() {
  if (!API) return;
  [["muPresetRow", API.ST_PRESETS_MU], ["evPresetRow", API.ST_PRESETS_EV]].forEach(function (pair) {
    var host = $(pair[0]); if (!host) return;
    host.innerHTML = "";
    pair[1].forEach(function (p) {
      var b = el("button", "pcard" + (hstate().st && hstate().st.preset === p.key ? " on" : ""));
      b.appendChild(tile("icons/looks/look-" + p.key + ".jpg"));
      b.appendChild(el("span", null, L9({ my: p.my, en: p.en })));
      b.title = L9({ my: p.my, en: p.en });
      b.onclick = function () { API.stApplyPreset(p); };
      host.appendChild(b);
    });
  });
  if (API && API.stRenderRecipes) API.stRenderRecipes();
}

/* the recipe card's thumbnail. The app renders the saved look on the
   customer's own photo through the pixel pipeline; with no canvas the panel
   shows the app's own no-photo tile — its gradient, with the save glyph. */
function recipeTile() {
  var w = el("span", "st-tile rc");
  var im = doc().createElement("img");
  im.className = "st-tile-ic";
  im.src = "icons/ui/i-save-gold.svg";
  im.alt = "";
  w.appendChild(im);
  return w;
}

/* PHOTO slot — the panel's shared subject slot (state.refs[0]), rendered in
   the app's own .ref markup so the box measures the same. */
function renderStPicker() {
  var host = $("stPicker"); if (!host) return;
  host.innerHTML = "";
  var st = hstate();
  var ref = st.refs && st.refs[0];
  var d = el("div", "ref" + (ref ? " filled" : " stbig"));
  if (ref) {
    var im = doc().createElement("img");
    im.src = "data:" + ref.mime + ";base64," + ref.b64; im.alt = "before";
    d.appendChild(im);
    var x = el("button", "x");
    x.innerHTML = icn("i-close");
    x.setAttribute("aria-label", L9({ my: "ပုံဖယ်မယ်", en: "Remove image" }));
    x.onclick = function (ev) {
      ev.stopPropagation();
      var b = bridge(); if (b && b.clearPhoto) b.clearPhoto();
      renderStPicker();
    };
    d.appendChild(x);
  } else {
    var add = el("button", "add");
    var cam = el("span");
    cam.innerHTML = icn("i-camera", "ic-xl");
    add.appendChild(cam);
    /* the app's own line, word for word — the panel's picker is what the
       student taps instead of the browser's file dialog */
    add.appendChild(el("span", null, L9({
      my: "ပုံထည့်ပါ — Live preview စတင်ရန်",
      en: "Add a photo to start the live preview"
    })));
    add.title = API ? API.RS_NEED_PHOTO : "";
    add.onclick = function () { var b = bridge(); if (b && b.pickPhoto) b.pickPhoto(); };
    d.appendChild(add);
  }
  d.appendChild(el("span", "tag", L9({ my: "မူရင်း", en: "Before" })));
  host.appendChild(d);
  var tg = $("stTarget"); if (tg) tg.style.display = ref ? "" : "none";
}
function renderRefs() { renderStPicker(); }

/* ------------------------------------------------- 880 style pack */
/* The app builds a contact sheet on a canvas and hands the whole multi-pick
   selection to the model. UXP has no canvas, so the panel sends the FIRST
   picked reference image itself — fetched from the same catalog the app
   serves — into the reference slot. */
function st880BuildSheet(recs, cb) {
  if (!recs || !recs.length) { cb(null); return; }
  cb(null);
}
function st880ApplyRef(sel) {
  var b = bridge();
  var keys = sel ? Object.keys(sel) : [];
  if (!keys.length || !b || !b.loadRefFromUrl) return;
  var first = sel[keys[0]];
  var rec = first && (first.rec || first);
  if (!rec || !rec.url) return;
  b.loadRefFromUrl(assetBase() + rec.url, function (ok) {
    if (!ok) toast(unreadableImgMsg(), "err");
  });
  if (keys.length > 1) {
    toast(L9({
      my: "Photoshop panel မှာ ပထမရွေးထားတဲ့ style တစ်ခုကိုပဲ ပုံအဖြစ် ပို့ပါတယ်",
      en: "The Photoshop panel sends only the first picked style as the reference image"
    }), "ok");
  }
}

/* The control tally each group header prints. The app counts live DOM inputs;
   the panel takes the number the build tool measured in the app itself, so a
   header can never disagree with the web page it mirrors. */
function stCountControls(gEl) {
  var counts = (suites && suites.DATA && suites.DATA.counts) || [];
  var i = gEl && gEl._stG;
  if (typeof i === "number" && counts[i]) return counts[i].n;
  return 0;
}

/* ---------------------------------------------------- pipeline stubs */
function noop() { }
function stExportDims() { return null; }
/* the app's denoise note only speaks when it has measured a photo's chroma
   noise; with no pixel pipeline here it stays what the app shows before a
   photo arrives — an empty, hidden line that holds no space */
function stNoiseNote() {
  var p = el("p", "mut");
  p.style.display = "none";
  return p;
}
function stShowZones() {
  toast(L9({
    my: "Zone ပြတာက web app မှာသာ ရပါတယ် — panel မှာ Photoshop document ကိုယ်တိုင်က preview ဖြစ်ပါတယ်",
    en: "Zone preview is web-app only — in the panel your Photoshop document is the preview"
  }), "ok");
}
function stExport2Up() {
  toast(L9({
    my: "Before/After ၂ ကွက်တွဲ ထုတ်တာက web app မှာ လုပ်ပါ — panel မှာ layer အဖြစ် ရလဒ်ကို ထည့်ပေးပါတယ်",
    en: "Export the 2-up on the web app — the panel puts the result into your document as a layer"
  }), "ok");
}
function pickLogo(cb) {
  var b = bridge();
  if (b && b.pickLogo) { b.pickLogo(cb); return; }
  toast(unreadableImgMsg(), "err");
}

/* ------------------------------------------------------------- H */
function makeH() {
  return {
    /* D and byKey are the APP's own tables, captured by the build tool with
       the slices that read them — never the panel's near-equivalents. */
    $: $, D: (suites && suites.DATA && suites.DATA.D) || {}, L9: L9, lang: lang, langFallback: langFallback,
    el: el, escH: escH, icn: icn, stripIcn: stripIcn, setIcnText: setIcnText,
    state: hstate(), saveState: saveState, toast: toast, switchPage: switchPage, curPage: curPage,
    byKey: (suites && suites.DATA && suites.DATA.byKey) || {},
    ptSetWorkflow: (bridge() && bridge().ptSetWorkflow) || noop,
    assetBase: assetBase(), unreadableImgMsg: unreadableImgMsg, renderRefs: renderRefs,
    promptText: promptText,
    stColorInp: stColorInp, st880BuildSheet: st880BuildSheet, st880ApplyRef: st880ApplyRef,
    stCountControls: stCountControls, stRenderPresetCards: stRenderPresetCards,
    renderStPicker: renderStPicker, recipeTile: recipeTile,
    stRenderThumbs: noop, stLookArt: function () { return null; },
    gradeTile: gradeTile, pickLogo: pickLogo,
    stShowZones: stShowZones, stExportDims: stExportDims, stExport2Up: stExport2Up,
    stNoiseNote: stNoiseNote,
    stSyncFromRef: noop, stMountSuite: noop, stQuoteCost: noop,
    /* HD Finish only exists when Setup has the upscale deployment */
    rhIsConfigured: function (id) { var b = bridge(); return !!(b && b.rhIsConfigured && b.rhIsConfigured(id)); },
    beforeBuild: null
  };
}
function assetBase() {
  var b = bridge();
  return (b && b.assetBase) || "https://hnkaistudio.com/app/";
}

/* ------------------------------------------------------------- build */
function build() {
  if (!suites || typeof suites.build !== "function") return null;
  shim();
  API = suites.build(makeH());
  builtLang = lang();
  g.HNK = g.HNK || {};
  g.HNK.studio = API;
  renderStPicker();
  stRenderPresetCards();
  return API;
}

/* The app moves ONE shared control block between the two suite pages so the
   loaded photo and every listener survive the switch; the panel does the
   same, and shows only the card that belongs to the page. */
var SUITE_CARD = { pageMeitu: "stMuCard", pageEvoto: "stEvCard" };
function mount(pageKey) {
  var pageId = (pageKey === "evoto") ? "pageEvoto" : "pageMeitu";
  if (!API && !build()) return;
  if (builtLang !== lang()) rebuild();
  var page = $(pageId), dock = $("stDock"), cols = $("stCols");
  if (!page || !dock || !cols) return;
  var mnt = page.querySelector ? page.querySelector(".st-mount") : null;
  if (mnt && cols.parentNode !== mnt) mnt.appendChild(cols);
  var colR = $("stColR"), keepId = SUITE_CARD[pageId];
  Object.keys(SUITE_CARD).forEach(function (k) {
    var card = $(SUITE_CARD[k]); if (!card) return;
    if (SUITE_CARD[k] === keepId) {
      if (colR && card.parentNode !== colR) colR.insertBefore(card, $("stResultBox"));
    } else if (card.parentNode !== dock) { dock.appendChild(card); }
  });
  mountedPage = pageId;
  takeResultCard();
  renderStPicker();
  if (API && API.stRenderPend) { try { API.stRenderPend(); } catch (e) { } }
  if (API && API.stSyncSuiteChips) { try { API.stSyncSuiteChips(); } catch (e) { } }
}

/* The panel has ONE result card (#resultBox, with Photoshop's Place and Save
   As); the app gives each page its own. Borrowing the card puts a studio
   result on the page that made it, and it goes home the moment the student
   leaves — Freeform must never open without its result card. */
var resultHome = null;
function takeResultCard() {
  var box = $("resultBox"), slot = $("stResultSlot");
  if (!box || !slot) return;
  if (!resultHome) resultHome = box.parentNode;
  if (box.parentNode !== slot) slot.appendChild(box);
}
function giveResultCard() {
  var box = $("resultBox");
  if (box && resultHome && box.parentNode !== resultHome) resultHome.appendChild(box);
}
function unmount() {
  giveResultCard();
  mountedPage = "";
}

/* A language switch rebuilds the whole studio: the app's builders capture
   their strings at build time (var LANG), which is exactly what makes the
   labels identical to the web page — so the cure is a fresh build, not a
   patch-up pass. Slider values live in state.st and survive it. */
function rebuild() {
  var cols = $("stCols"); if (!cols) return;
  ["muHost", "evHost", "stSuiteTabs", "stGroupChips", "stPendChips", "stExpOpts",
    "muPresetRow", "evPresetRow", "stRecipeRow", "stGradeCards"].forEach(function (id) {
      var n = $(id); if (n) n.innerHTML = "";
    });
  API = null;
  build();
  if (mountedPage) mount(mountedPage === "pageEvoto" ? "evoto" : "meitu");
}

var SCREEN = {
  mount: mount,
  unmount: unmount,
  rebuild: rebuild,
  api: function () { return API; },
  /* the panel's Generate bar asks for the same sentence the web app sends */
  prompt: function () { return API ? API.stComposePrompt() : ""; },
  renderPicker: renderStPicker
};

if (_CJS) module.exports = SCREEN;
else { g.HNK = g.HNK || {}; g.HNK.studioScreen = SCREEN; }
})();
