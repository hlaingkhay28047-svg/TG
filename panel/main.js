/* ============================================================
   HNK Photoshop Ai Panel (Students) V1 — main.js
   HNK Studio · Myanmar · RunningHub Enterprise (openapi/v2 — the one engine, v6.26.0)
   UXP-SAFE: no localStorage, no element.dataset, no textarea,
   guarded window.*, flexbox-only CSS, native textarea prompt (runtime capacity self-test).
   ============================================================ */
"use strict";

const ps = require("photoshop");
const app = ps.app;
const psCore = ps.core;
const imaging = ps.imaging;
const batchPlay = ps.action.batchPlay;
const constants = ps.constants;
const uxp = require("uxp");
const fsp = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;
const shell = (uxp && uxp.shell) ? uxp.shell : null; /* openPath (folder in Finder/Explorer); may be null on old hosts */

/* ---------------- Constants ---------------- */
/* v6.26.0 — the Gemini API constants left with that provider; the one
   engine's base URL and paths live in src/providers/runninghub-config.js. */
const MAX_PROMPT = 20000;
const SETTINGS_FILE = "hnk_students_settings.json";
const RATIOS = [
  { id: "1:1", v: 1 }, { id: "4:5", v: 0.8 }, { id: "5:4", v: 1.25 },
  { id: "3:4", v: 0.75 }, { id: "4:3", v: 4 / 3 }, { id: "2:3", v: 2 / 3 },
  { id: "3:2", v: 1.5 }, { id: "9:16", v: 9 / 16 }, { id: "16:9", v: 16 / 9 },
  { id: "21:9", v: 21 / 9 }
];

/* ---------------- Logger (in-memory ring buffer + console mirror) ----------------
   Every caught error, warning and diagnostic funnels through hlog/hwarn/herr, so
   the panel can show a live log and the student can copy it for a bug report. The
   buffer is capped so a long session never grows without bound. */
const HNK_LOG = [];
const LOG_CAP = 200;
/* v6.107.1 — WHERE it threw. Every Error carries a stack in UXP's V8 as in a
   browser, but the log kept only the message, so a "wire-fail: video" line named
   the stage and nothing else. The first frame that names a script file is
   appended as " @ file:line" — the one detail the Setup self-test card needs to
   turn a photograph of it into a line of code. */
function errWhere(e) {
  try {
    const s = String((e && e.stack) || "");
    const m = /([\w.-]+\.js):(\d+)(?::(\d+))?/.exec(s);
    return m ? " @ " + m[1] + ":" + m[2] : "";
  } catch (x) { return ""; }
}
function pushLog(level, argv) {
  let msg = "";
  try {
    msg = Array.prototype.map.call(argv, function (a) {
      if (a instanceof Error) return (a.message || String(a)) + errWhere(a);
      if (a && typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(" ");
  } catch (e) { msg = String(argv); }
  let ts = "";
  try { ts = new Date().toISOString().slice(11, 19); } catch (e) { ts = ""; }
  HNK_LOG.push({ ts: ts, level: level, msg: msg });
  if (HNK_LOG.length > LOG_CAP) HNK_LOG.splice(0, HNK_LOG.length - LOG_CAP);
  try {
    if (typeof console !== "undefined") {
      if (level === "ERR" && console.error) console.error("[HNK]", msg);
      else if (level === "WARN" && console.warn) console.warn("[HNK]", msg);
      else if (console.log) console.log("[HNK]", msg);
    }
  } catch (e) { }
  try { if (typeof renderLog === "function") renderLog(); } catch (e) { }
  return msg;
}
function hlog() { return pushLog("INFO", arguments); }
function hwarn() { return pushLog("WARN", arguments); }
function herr() { return pushLog("ERR", arguments); }
/* v6.65.0 — AND THE MODULES CAN REACH IT NOW.

   panel/src/photoshop/photoshop-host.js has logged its failures through
   `globalThis.HNK.herr` since 6.19. That function has never existed. Every
   host error for four months — a failed layer capture, a failed place, a
   failed group — fell through to console.error, which nobody in Photoshop can
   read, and the SELF-TEST card went on reporting "Panel log: clean".

   That is exactly why the owner's 6.135.0 photographs show a green Panel log
   beside a slot refusing to read a document that was plainly open. The log was
   not clean; it was disconnected. Three lines, published before anything else
   runs, and the card can see what the host sees. */
globalThis.HNK = globalThis.HNK || {};
globalThis.HNK.herr = function () { return pushLog("ERR", arguments); };
globalThis.HNK.hwarn = function () { return pushLog("WARN", arguments); };
globalThis.HNK.hlog = function () { return pushLog("INFO", arguments); };

/* ---------------- State ---------------- */
const state = {
  /* v6.75.0 — the What's New rows this member has dismissed. The panel has no
     localStorage (UXP), so the strip forgot every dismissal at relaunch and
     the owner's Home opened on "(105)" unread every time. Kept in the settings
     file like everything else the panel remembers. */
  nwSeen: [],
  /* v6.22.0 account gate. Only the refresh token is kept -- the access
     token is short-lived and re-minted every launch. accProfile/accSeenAt
     are what the offline grace window reads. */
  accRefresh: "", accUid: "", accEmail: "", accProfile: null,
  accSeenAt: 0, accDevId: "", accAvatar: "",
  /* v6.73.0 — WHOSE answer accProfile/accSeenAt are. Without these two the
     record would outlive the account that earned it: gateSaveSess overwrites
     accUid when a different member signs in on the same machine, and the old
     member's entitlement would still be sitting in accProfile. */
  accSeenUid: "", accSeenDev: "",
  rhKey: "", lang: "my", theme: "dark", model: "auto", size: "1K", ratio: "auto",
  autoPlace: true, refs: [null, null],
  beforeB64: null, beforeMime: "image/jpeg",
  resultB64: null, resultMime: "image/png",
  busy: false, keyShown: false, previewRatio: 0.75, rt: null,
  /* v6.56.0 — Retouch Pro's strength. The app opens on 100% and both of its
     strength rows (one-tap and sliders) render that chip already chosen; the
     panel had no such field at all, so `v === state.rtStrength` was never true
     and a student met two rows of 60 / 90 / 100 with nothing selected — no way
     to tell what strength the next retouch would actually run at. */
  rtStrength: 100,
  promptCap: MAX_PROMPT, page: "aitools", keep: { frame: true, pose: true, face: true, expr: false, hair: false, dress: false, skin: false, light: false, color: false, bg: false, subject: false },
  pendingBtn: null, busyBtnEl: null, busyBtnTxt: null,
  history: [],
  histSel: -1, lastAction: "Prompt",
  /* v6.56.0 — the app's Text to Image opens on AUTO, letting the model pick
     the shape; the panel opened on 1:1, so a student's first generation came
     back square when the web's would not have. The string test cannot see
     this — the two pages carry the same chips, only a different one wears
     the "on" class. */
  cRatio: "auto", cVariations: 1, cGallery: [], cSel: 0, /* v6.53.0 — Text to Image picks its own model, like the app's page */
  t2iModel: "", t2iSize: "",
  cRefs: [null, null, null, null], cResultB64: null, cMime: "image/png", cBeforeB64: null,
  genCount: 0, lastUserText: "", lastFinalPrompt: "",
  realOn: true, realDir: "auto", banText: true,
  saveDirH: null,
  /* Reference Image Library (user-selected folder + persistent token) */
  libToken: "", libFolderName: "", libNativePath: "", libImgCount: 0, libLastScan: 0,
  refTokens: {}, /* stable-slot-id -> persistent file token */
  /* v6.51.0 — Freeform = the app's pgCreate. subj is the explicit IMAGE 1
     (null = the open Photoshop document, as before); rhModel / ffRatio /
     ffSize / ffCount are the app's own Model / Ratio / Size / Count selects
     ("" = Auto, exactly the values the app persists). */
  subj: null, rhModel: "nano-banana-2", ffRatio: "", ffSize: "", ffCount: 1,
  /* the app's per-slot role sentences (null = defaults: IMAGE 1 subject,
     IMAGE 2/3 style ref) and the slot a Library pick should land in. */
  imgRoles: null, libTargetSlot: null, wfLibTarget: null, vidRefs: [],   /* v6.21.0 — face references behind the base three */
  /* the app's Setup state: per-model RunningHub apiPath/quality overrides
     + active model (hnk_rh_cfg), the spend ledger (hnk_rh_spend), the last
     balance check (hnk_rh_bal) and the currency RunningHub last reported. */
  rhCfg: { models: {}, activeModel: "" }, spend: null, rhBal: null, rhLastCur: ""
};
const REFRESHERS = [];

/* ---------------- Freeform = the web app's pgCreate (v6.51.0) ----------------
   The app's RunningHub model list, in the app's order, with the app's own
   labels and per-model ratio/size behaviour (kind). Every id is a deployment
   the enterprise adapter already knows (runninghub-config.js models) — the
   panel never invents an apiPath, it only lists what exists. */
const FREEFORM_MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2", kind: "" },
  { id: "rh-image-g2-off", label: "GPT Image 2 (Official)", kind: "" },
  { id: "rh-image-g2", label: "GPT Image 2 (Low-cost)", kind: "" },
  { id: "rh-image-x-off", label: "Grok Imagine — Edit (Official)", kind: "xedit" },
  { id: "nano-banana-pro-off", label: "Nano Banana Pro (Official)", kind: "" },
  { id: "nano-banana-pro", label: "Nano Banana Pro", kind: "" },
  { id: "qwen-image-2", label: "Qwen Image 2", kind: "sizeParam" },
  { id: "qwen-image-2-pro", label: "Qwen Image 2 Pro", kind: "sizeParam" },
  { id: "flux-2-dev-edit", label: "Flux 2 Dev — Edit", kind: "fluxedit" },
  { id: "wan-image-edit", label: "Wan Image Edit", kind: "whParam" },
  { id: "wan-image-edit-pro", label: "Wan Image Edit Pro", kind: "whParam" },
  { id: "upscale-pro", label: "Upscale Pro", kind: "upscale" },
  { id: "seedream-v4", label: "Seedream v4", kind: "seedream" },
  { id: "seedream-v4-5", label: "Seedream v4.5", kind: "seedream" },
  { id: "rh-imagine-quality-edit", label: "Grok Imagine — Quality Edit", kind: "imagine" },
  { id: "z-image-turbo", label: "Z-Image Turbo", kind: "zimage" },
  { id: "z-image-turbo-lora", label: "Z-Image Turbo — Edit LoRA", kind: "node" },
  { id: "upscale-transparent", label: "Upscale Transparent", kind: "upscale-transparent" },
  { id: "seedream-v5-lite", label: "Seedream v5 Lite", kind: "sd5lite" },
  { id: "seedream-v5-pro", label: "Seedream v5 Pro", kind: "sd5pro" },
  { id: "dola-seedream-5-pro", label: "Dola Seedream 5.0 Pro", kind: "sd5pro" },
  { id: "grok-image-i2i", label: "Grok 4.2 Image (Low-cost)", kind: "grokimg" },
  { id: "qwen-image-3", label: "Qwen Image 3.0", kind: "sizeParam" },
  { id: "qwen-image-3-pro", label: "Qwen Image 3.0 Pro", kind: "sizeParam" },
  { id: "wan-25-image", label: "Wan 2.5 Preview — Edit", kind: "wan25" },
  { id: "nano-banana-v1-off", label: "Nano Banana v1 (Official)", kind: "nanov1" },
  { id: "nano-banana-v1", label: "Nano Banana v1 (Low-cost)", kind: "nanov1" },
  { id: "nano-banana-2-off", label: "Nano Banana 2 (Official)", kind: "" },
  { id: "nano-banana-2-lite-off", label: "Nano Banana 2 Lite (Official)", kind: "ratioOnly" },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite (Low-cost)", kind: "ratioOnly" },
  { id: "nano-banana-pro-ultra", label: "Nano Banana Pro Ultra 8K", kind: "" },
  { id: "gpt-image-15-off", label: "GPT Image 1.5 (Official)", kind: "gpt15" },
  { id: "jimeng-46", label: "Jimeng 4.6", kind: "bare" },
  { id: "sd5-layers", label: "Seedream 5 — Layer Split", kind: "sdlayer" },
  { id: "topaz-gp-standard", label: "Topaz Gigapixel Standard", kind: "upscale-transparent" },
  { id: "topaz-gp-lowres", label: "Topaz Gigapixel Low-Res", kind: "upscale-transparent" },
  { id: "topaz-gp-text", label: "Topaz Gigapixel Text", kind: "upscale-transparent" },
  { id: "topaz-gp-hifi", label: "Topaz Gigapixel HiFi", kind: "upscale-transparent" },
  { id: "topaz-gp-art", label: "Topaz Gigapixel Art", kind: "upscale-transparent" },
  { id: "topaz-up-faces", label: "Topaz Detail Faces", kind: "upscale-transparent" },
  { id: "topaz-up-hifi3", label: "Topaz High Fidelity 3", kind: "upscale-transparent" },
  { id: "flux-2-dev-edit-plain", label: "Flux 2 Dev — Edit (no LoRA)", kind: "node" },
  { id: "flux-klein-9b-edit", label: "Flux Klein 9B — Edit", kind: "node" },
  { id: "flux-klein-4b-edit", label: "Flux Klein 4B — Edit", kind: "node" },
  { id: "flux-klein-4b-edit-lora", label: "Flux Klein 4B — Edit LoRA", kind: "node" },
  { id: "flux-kontext-lora", label: "Flux Kontext — Edit LoRA", kind: "node" },
  { id: "qwen-edit-2511", label: "Qwen Edit 2511", kind: "node" },
  { id: "qwen-edit-2511-lora", label: "Qwen Edit 2511 — LoRA", kind: "node" },
  { id: "wan-22-image", label: "Wan 2.2 — Edit", kind: "node" }
];
function ffModelById(id) {
  for (let i = 0; i < FREEFORM_MODELS.length; i++) if (FREEFORM_MODELS[i].id === id) return FREEFORM_MODELS[i];
  return null;
}
function ffModel() { return ffModelById(state.rhModel) || FREEFORM_MODELS[0]; }
function ffIsUpscale(m) { return m.kind === "upscale" || m.kind === "upscale-transparent"; }
function ffModelLabel(m) { return m.label + (ffIsUpscale(m) ? " · Upscale" : ""); }
/* The app's rhNarrowRatioOptionsFor: which ratios a model accepts ("" = Auto). */
const FF_RATIO_DEFAULT = ["", "1:1", "3:4", "4:3", "4:5", "9:16", "16:9", "2:3", "3:2"];
const FF_NO_RATIO = { xedit: 1, grokimg: 1, bare: 1, sd5lite: 1, sd5pro: 1, sdlayer: 1 };
const FF_NO_SIZE = { zimage: 1, fluxedit: 1, xedit: 1, node: 1, grokimg: 1, wan25: 1, nanov1: 1, ratioOnly: 1, gpt15: 1, bare: 1 };
function ffRatioOptionsFor(m) {
  if (m.kind === "zimage") return ["3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"];
  if (m.kind === "imagine") return ["", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
  if (m.kind === "sizeParam") return ["", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"];
  if (m.kind === "whParam") return ["", "1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "2:3", "3:2"];
  if (m.kind === "fluxedit") return ["", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"];
  return FF_RATIO_DEFAULT.slice();
}
function ffHasRatio(m) { return !FF_NO_RATIO[m.kind] && !ffIsUpscale(m); }
function ffHasSize(m) { return !FF_NO_SIZE[m.kind] && !ffIsUpscale(m); }
/* The app's brand tile for the model button (renderBtn / brandOf + IC): the
   tile class and the 15px brand glyph, shipped as icons/ui/brand-<key>.png
   because UXP draws no inline <svg>. */
function ffModelBrand(label) {
  const s = String(label || "").toLowerCase();
  if (s.indexOf("nano banana") >= 0) return ["t-banana", "banana"];
  if (s.indexOf("gpt") >= 0) return ["t-openai", "openai"];
  if (s.indexOf("qwen") >= 0) return ["t-qwen", "qwen"];
  if (s.indexOf("flux") >= 0 || s.indexOf("klein") >= 0 || s.indexOf("kontext") >= 0) return ["t-flux", "flux"];
  if (s.indexOf("wan") >= 0) return ["t-wan", "wan"];
  if (s.indexOf("upscale") >= 0 || s.indexOf("topaz") >= 0) return ["t-gold", "up"];
  if (s.indexOf("seedream") >= 0 || s.indexOf("jimeng") >= 0) return ["t-rh", "seed"];
  if (s.indexOf("z-image") >= 0) return ["t-plain", "zimg"];
  if (s.indexOf("grok") >= 0) return ["t-plain", "grokx"];
  return ["t-gold", "spark"];
}
function ffModelTile(label) { return ffModelBrand(label)[0]; }
/* the app's sprite icons (svg.ic-s) as pre-tinted <img> files.

   v6.63.0 — .png, NOT .svg, AND THE OWNER'S PHOTOGRAPH IS WHY. panel 6.133.0's
   SELF-TEST card put a stroke-drawn icon beside a fill-drawn one at the size
   the panel uses them, and Photoshop 27.10.0 drew the stroke one as a SOLID
   BLACK house and the fill one as a correct gold star. Adobe's renderer paints
   `fill` and ignores `stroke`, and it does not inherit `fill="none"` from the
   parent <svg> — so a path with no fill of its own falls back to black.
   263 of the panel's 276 icons are stroke-drawn. That is the whole of
   "icons တွေ အမဲဖြစ်နေတယ်", and it had outlived five waves of guessing.

   tools/build_panel_icon_png.js compiles every icon to a PNG at 3x. The same
   photograph reports "Pictures 247 ok · 0 failed": this renderer draws raster
   images without exception, so a PNG cannot fail the way the SVG did. The SVGs
   stay in the tree as the source — the web app runs in Chromium and never had
   the problem. */
function ffIcon(name, tint, cls) {
  const im = document.createElement("img");
  im.className = cls || "ic-s";
  im.src = "icons/ui/" + name + "-" + (tint || "cream") + ".png";
  im.alt = "";
  return im;
}
/* app setIcnText: icon then text into any element. The app's <button> is
   inline flow, so when a label wraps its sprite rides the FIRST line
   (vertical-align -.18em); a flex button would centre the icon beside the
   whole two-line block instead. Buttons therefore get one inner row the
   button centres as a whole, with the icon baseline-aligned inside it. */
/* app ICN_LEAD / stripIcn: a label that opens with an emoji ("🔄 Retry") loses
   it when a sprite icon stands in front — the sprite IS the glyph. */
const ICN_LEAD = /^(?:[\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF\u3030\u25A0-\u25FF\u2B50\uFE0F\u200D]|[\uD83C-\uD83E][\uDC00-\uDFFF])+\s*/;
function stripIcn(s) { return String(s == null ? "" : s).replace(ICN_LEAD, ""); }
/* v6.58.1 — AN <img> IN THIS DOCUMENT WITH NO src RAISES A LOAD ERROR.
   The owner's Photoshop self-test on 6.127.0 photographed eight of them: seven
   gallery thumbnails, which are created and appended and only get their src
   when galThumb resolves, and #resultImg, which refreshCompare strips with
   removeAttribute("src") whenever there is no result yet. A browser treats
   both as inert; this renderer treats them as a picture it was asked for and
   could not fetch. So the panel never leaves an <img> without one — an empty
   slot carries a 1x1 transparent GIF instead, which always decodes, draws
   nothing, and costs no request. Set it, never remove the attribute.
   v6.58.2 — and a src BUILT out of state that may be absent is the same empty
   <img> by another road: "data:image/png;base64," + undefined is not a
   picture. Every such expression falls back to this. */
const IMG_BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
/* v6.77.0 — CAN THIS RENDERER PLAY A CLIP AT ALL? The Video page's result box
   and its recent-takes strip are <video> elements, and a <video> that cannot
   decode draws a black plate and nothing else — a finished, paid-for clip
   photographed as an empty box. A renderer that plays video answers
   canPlayType; one that only knows the tag name (UXP) has no such method. When
   the answer is no, the result card says the clip is ready and points at
   Download / Open, and each take in the strip is a numbered tile. */
const VIDEO_OK = (function () {
  try { const v = document.createElement("video"); return !!(v && typeof v.canPlayType === "function" && v.canPlayType("video/mp4") !== ""); }
  catch (e) { return false; }
})();
/* …EXCEPT ON A <video>, which cannot decode a GIF and says so. vtThumbFor
   serves both an <img> and a <video> through the same id, and handing the
   video the blank picture traded eight image errors for one video error —
   caught by this file's own D9 before it ever reached Photoshop. So the
   difference is stated once, here, rather than remembered at each call site:
   a picture slot gets the placeholder, a video slot really does lose the
   attribute. This is the only place in the panel that removes a src. */
/* v6.58.2 — AND THE THIRD ROAD TO AN EMPTY <img>: a src BUILT out of state.
   "data:image/png;base64," + undefined is a string, so nothing throws and
   nothing reads as missing — it is simply not a picture, and this renderer
   reports it exactly like the other two. Every data: URL the panel assembles
   goes through here, so the payload is checked once instead of at each call
   site, and verify_panel_renderer_safety can say "no .src = \"data:\" anywhere"
   and mean it. */
function dataSrc(el, mime, b64) {
  if (!el) return;
  try { el.src = b64 ? ("data:" + (mime || "image/png") + ";base64," + b64) : IMG_BLANK; }
  catch (e) { }
}
function clearSrc(el) {
  if (!el) return;
  try {
    if (String(el.tagName || "").toUpperCase() === "VIDEO") el.removeAttribute("src");
    else el.src = IMG_BLANK;
  } catch (e) { }
}
/* v6.53.0 — UXP ANSWERS null, NOT "", FOR AN ELEMENT WITH NO class ATTRIBUTE.
   The owner's Photoshop self-test found this the expensive way: four Setup
   wirings dead and one button label blank, every one of them the same throw at
   the single line that read className without checking. Each of the four paints
   an accordion title of exactly one shape — <span id="..."> with an id and no
   class, inside <div class="grp-h"> — and setup:statics threw at platPS seven
   lines before it would have labelled btnCheckUpdate. One null, six red rows.
   Every className read goes through here now, so the next element that ships
   without a class cannot repeat it. */
function clsOf(el) { return (el && el.className != null) ? String(el.className) : ""; }
/* 6.168.0 — AN ACCORDION BODY IS SHOWN BY AN INLINE DISPLAY, NEVER BY THE CASCADE ALONE.
   Every .grp app-grp on this panel put its body's visibility on one stylesheet override
   (`.apg .app-grp.open .grp-b { display: block }` beating `.grp-b { display: none }`), and in
   Photoshop that override did not win: the Workflows page opened its first category, wrote the
   class, and still drew no card — all 194 Smart Workflow cards invisible in the panel while the
   web app drew them (the owner's photographs of 6.167.2). The class stays for the caret and the
   frame; what actually shows the body is this. */
function grpShow(g, on) {
  try {
    if (!g || !g.querySelector) return;
    const b = g.querySelector(".grp-b");
    if (b && b.style) b.style.display = on ? "block" : "none";
  } catch (e) { }
}
/* every group the panel has on screen, whoever built it (the static markup, a screen module, a
   re-render): its body's inline display is made to agree with its own class. Cheap — a handful of
   elements per page — and it is what makes a group built anywhere obey the same rule. */
function grpSyncAll(root) {
  try {
    const list = (root || document).querySelectorAll(".grp.app-grp");
    for (let i = 0; i < list.length; i++) grpShow(list[i], clsOf(list[i]).indexOf(" open") >= 0);
  } catch (e) { }
}
/* 6.167.0 — ONE CLAMP MARKER FOR BOTH SURFACES (the app's ellMark, 6.96.0). A card's description is cut
   at a line ceiling; UXP draws no -webkit-line-clamp, so until now it was cut with nothing to show for it.
   The marker is appended only where the ink really overflows its box — measured through scrollHeight, the
   reading the SELF-TEST's own scrollTop row proves this renderer answers — and silently skipped when the
   host reports nothing, so a renderer that cannot measure simply looks as it did before. */
/* 6.167.4 — THE OWNER'S SECOND PHOTOGRAPH OF THE CARDS. They were back, and their descriptions ran
   straight out of them: a line of words below the card's own border, no ellipsis anywhere, and no
   "Open" pill at all. Marking a cut is not the same as making one. This renderer laid the box out at
   its ceiling and painted the rest of the sentence anyway, so scrollHeight equalled clientHeight, the
   marker correctly stayed away — there was nothing hidden to mark — and everything the flow put after
   that box, the pill included, was pushed outside the card.

   A box we ask to hide its overflow may decline. A string that is already short enough cannot. So the
   measurement now has two answers, not one: the renderer hid the rest (mark it, as before), or the
   renderer hid nothing and the box is taller than its own ceiling — and then the WORDS are cut, at a
   space, until the box fits, and the marker goes on that. Every pass starts from the whole sentence
   again (ELL_FULL), so a second pass can never cut a cut string twice. */
/* 6.171.0 — THE CLAMP IS MEASURED WITH THE CLAMP OFF.

   The owner photographed the Workflows page six versions running and said it
   was still not tidy. This time it was measured rather than adjusted, and the
   numbers named two mistakes, both of them in here.

   ONE. This function had two branches and, in a browser, only the first could
   ever run. `scrollHeight - clientHeight` is the overflow a renderer HID: a
   renderer that honours max-height + overflow:hidden reports it, the marker
   goes on, and the sentence itself stays whole in the DOM. The second branch —
   the one that actually CUTS the words — was guarded by `clientHeight > ceil`,
   which in Chromium is never true, because Chromium had already clamped
   clientHeight to the ceiling. So the web app never cut a sentence; it only hid
   one. Adobe UXP honours neither half of that pair, so the panel inherited the
   uncut string and painted every word of it. Measured over the real 194 cards
   at a 230px panel: 101 of them ran past their own box, the worst by 181px, and
   the page's card heights spread 235px where the browser showed 54.

   TWO. The two engines therefore held DIFFERENT text — the one thing the parity
   walk exists to catch — and it could not see it: both DOMs carried the same
   full sentence and only the pixels differed.

   The fix is to stop asking the renderer what it hid and start asking what the
   text NEEDS. The box is unclamped for the measurement, scrollHeight then
   reports the sentence's true height in BOTH engines, the words are cut to the
   line budget the caller names, and the clamp goes back. Chromium and UXP now
   cut at the same character, so the marker tells the truth on both surfaces and
   the parity is a fact instead of a coincidence. */
const ELL_FULL = new WeakMap();
/* 6.103.0 — A COMPUTED VALUE IS NOT ALWAYS A PIXEL LENGTH, and this is where
   that assumption was hiding.

   ellCeil read getComputedStyle().lineHeight straight through parseFloat and
   treated the number as pixels. The Smart Workflow card's summary is authored
   `line-height: 2.25` with no unit. Chromium resolves that before it answers —
   measured here, an 11.5px summary comes back "25.875px" — so three lines is
   77.6px and the cut lands where the box ends. A renderer that answers with the
   AUTHORED value instead hands back "2.25"; parseFloat reads 2.25, the ceiling
   becomes 6.75px, and every summary is cut to nothing. Where the clamp has not
   run on a grid yet, the whole sentence paints past a card that reserved
   exactly three lines for it. Both are in the owner's 6.173.0 photographs: an
   empty description area on most cards, and a sentence sliced between two cards
   on the narrow panel.

   6.167.4 already taught the cut to run where the renderer declines
   overflow:hidden. What it never questioned is HOW MUCH to cut. So resolve the
   four forms a length arrives in — px, a bare multiplier, em/rem, and `normal`
   — against the element's own font size. Nothing changes in Chromium, where
   every one of them already arrives as px. */
function ellLenPx(v, fs) {
  const s = String(v == null ? "" : v).trim();
  if (!s || s === "none" || s === "auto" || s === "normal") return 0;
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return 0;
  if (/px$/.test(s)) return n;
  if (/r?em$/.test(s)) return n * fs;
  if (/^[0-9]*\.?[0-9]+$/.test(s)) return n * fs;   /* line-height: 2.25 */
  return 0;   /* %, vh, ch — not ours to guess from here */
}
function ellCeil(n, lines) {
  const cs = getComputedStyle(n);
  let fs = parseFloat(cs.fontSize);
  if (!(fs > 0) || !isFinite(fs)) fs = 12;
  let lh = ellLenPx(cs.lineHeight, fs);
  if (!(lh > 0)) lh = fs * 1.2;   /* `normal`, or a unit this reader declines */
  /* the caller's line budget is the contract; a declared ceiling is only the
     fallback for an older call site that passes no line count */
  let ceil = lines > 0 ? lines * lh : 0;
  if (!(ceil > 0)) ceil = ellLenPx(cs.maxHeight, fs) || ellLenPx(cs.height, fs);
  return { lh: lh, ceil: ceil };
}
function ellMark(root, sel, lines) {
  try {
    const list = (root || document).querySelectorAll(sel);
    Array.prototype.forEach.call(list, function (n) {
      try {
        const old = n.querySelector(".ell");
        if (old && old.parentNode) old.parentNode.removeChild(old);
        const full = ELL_FULL.has(n) ? ELL_FULL.get(n) : (n.textContent || "");
        ELL_FULL.set(n, full);
        if (n.textContent !== full) n.textContent = full;
        /* 6.171.0 — AND THE WHOLE SENTENCE STAYS READABLE FROM THE ELEMENT.
           The cut is width-dependent: the app walk and the panel walk open their
           surfaces at different widths, so the same sentence legitimately cuts at
           a different character on each. The parity walk already declared the "…"
           marker out of scope for exactly that reason; the cut text needs the same
           treatment, so the original is kept here for it to read. It is also what
           a screen reader and a tooltip should have. */
        try { n.setAttribute("data-full", full); } catch (e) { }
        const m = ellCeil(n, lines);
        if (!(m.ceil > 0)) return;
        /* unclamp: height, max-height, overflow AND the -webkit-line-clamp the
           web app's copy of this rule uses. Each of them hides the very overflow
           this measurement needs to read. All of it is put back below. */
        const sv = { h: n.style.height, mh: n.style.maxHeight, ov: n.style.overflow, dp: n.style.display, lc: n.style.webkitLineClamp };
        n.style.height = "auto"; n.style.maxHeight = "none"; n.style.overflow = "visible";
        let dpNow = sv.dp; try { dpNow = dpNow || getComputedStyle(n).display; } catch (e) { }
        if (String(dpNow || "").indexOf("box") >= 0) n.style.display = "block";
        try { n.style.webkitLineClamp = "unset"; } catch (e) { }
        let cut = false;
        /* half a line, never a pixel: Burmese stacked diacritics draw past their line box, so a box that
           holds its text exactly still reports a few pixels of overflow (the app measured 73 against 69) */
        if (n.scrollHeight > m.ceil + m.lh / 2) {
          let lo = 0, hi = full.length;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            n.textContent = full.slice(0, mid);
            if (n.scrollHeight <= m.ceil + m.lh / 2) lo = mid; else hi = mid - 1;
          }
          let s = full.slice(0, lo);
          const sp = s.lastIndexOf(" ");
          if (sp > 12) s = s.slice(0, sp);   /* end on a whole word when there is one to end on */
          n.textContent = s.replace(/[\s…,.;:—-]+$/, "");
          cut = n.textContent.length < full.length;
        }
        n.style.height = sv.h; n.style.maxHeight = sv.mh; n.style.overflow = sv.ov; n.style.display = sv.dp;
        try { n.style.webkitLineClamp = sv.lc; } catch (e) { }
        if (cut) {
          const e = document.createElement("span");
          e.className = "ell"; e.textContent = "…";
          n.appendChild(e);
        }
      } catch (e) { }
    });
  } catch (e) { }
}
/* the Workflows screen is its own module and had no way to reach this — which
   is exactly why it never clamped a single card (6.171.0) */
globalThis.HNK = globalThis.HNK || {};
globalThis.HNK.ellMark = ellMark;
function setIcnText(el, name, tint, text, cls) {
  if (!el) return;
  el.textContent = "";
  let host = el;
  if (el.classList && el.classList.contains("btn")) {
    host = document.createElement("div");
    host.className = "btn-in";
    el.appendChild(host);
  }
  host.appendChild(ffIcon(name, tint, cls));
  host.appendChild(document.createTextNode(stripIcn(text)));
  /* buttons and accordion titles are the labels that may wrap (see fitBtnIn) */
  const pn = el.parentNode;
  if (host !== el || (pn && pn.classList && pn.classList.contains("grp-h"))) {
    host.__icn = host.firstChild; host.__txt = host.lastChild.nodeValue;
    host.__base = clsOf(host).replace(/\s*\bicn-wrap\b/g, "");
    fitBtnInLater(host);
  }
}
/* v6.51.0 — the inner row fills the button the moment its label wraps, which
   drags the icon to the left edge and centres the second line beside the
   icon rather than under the button. The app's inline flow centres
   icon + line one together, then each further line on its own. Where the
   host lays text out in line boxes we can read (Range.getClientRects), split
   the label at the first line break into that exact shape; elsewhere the
   single row stays. Measured after layout, so a hidden page is left pending
   and switchPage() fits it once the page is on screen. */
function fitBtnIn(host) {
  if (!host || !host.__icn || host.__txt == null) return;
  const txt = host.__txt;
  host.textContent = "";
  host.className = host.__base;
  host.appendChild(host.__icn);
  const tn = document.createTextNode(txt);
  host.appendChild(tn);
  if (!document.createRange || !host.getClientRects || !host.getClientRects().length) return;
  let rg, rects;
  try {
    rg = document.createRange(); rg.selectNodeContents(tn);
    rects = rg.getClientRects ? rg.getClientRects() : null;
  } catch (e) { return; }
  let lines = 0;
  for (let i = 0; rects && i < rects.length; i++) if (rects[i].width > 0.5) lines++;
  if (lines < 2) return;
  /* v6.107.0 — only split when the measurement is CREDIBLE. Range.getClientRects
     is meant to answer with line boxes, but a renderer that answers with one box
     per glyph makes every label look like it wraps, and the cut loop below then
     ends line one after a single character — the shape of the overlapping Home
     text in the owner's Photoshop. Real line boxes are few; one per character is
     not a wrap, it is a different contract, and the single row is left alone. */
  if (lines > Math.max(3, txt.length / 4)) return;
  /* the first offset whose range already spans two line boxes ends line one */
  let cut = 0;
  for (let k = 1; k <= txt.length; k++) {
    rg.setStart(tn, 0); rg.setEnd(tn, k);
    const rr = rg.getClientRects(); let n = 0;
    for (let i = 0; i < rr.length; i++) if (rr[i].width > 0.5) n++;
    if (n > 1) { cut = k - 1; break; }
  }
  if (cut <= 0 || cut >= txt.length) return;
  const l1 = txt.slice(0, cut).replace(/\s+$/, ""), rest = txt.slice(cut).replace(/^\s+/, "");
  if (!l1 || !rest) return;
  host.textContent = "";
  host.className = (host.__base ? host.__base + " " : "") + "icn-wrap";
  const row = document.createElement("div"); row.className = "icn-l1";
  row.appendChild(host.__icn);
  row.appendChild(document.createTextNode(l1));
  const more = document.createElement("div"); more.className = "icn-rest";
  more.textContent = rest;
  host.appendChild(row); host.appendChild(more);
}
function fitBtnInLater(host) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fitBtnIn(host));
  else setTimeout(() => fitBtnIn(host), 0);
}
function fitBtnInAll(root) {
  if (!root || !root.querySelectorAll) return;
  const list = root.querySelectorAll(".btn .btn-in, .grp-h span");
  for (let i = 0; i < list.length; i++) if (list[i].__icn) fitBtnIn(list[i]);
}
function fitBtnInAllLater(root) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fitBtnInAll(root));
  else setTimeout(() => fitBtnInAll(root), 0);
}

/* The app's own runtime copy for this page, verbatim in its nine languages;
   resolved late (REFRESHERS) so a language switch repaints it. The shared
   I18N packs stay untouched — these strings live only on this page. */
const FF_L = {
  note: { my: "Generate မှာ သုံးမယ့်ပုံတွေ — နှိပ်ပြီး ပြောင်းလို့ရတယ်", en: "Images used by Generate — tap to change", shn: "ၶႅပ်းႁၢင်ႈဢၼ် Generate တေၸႂ်ႉ — ၼဵၵ်းသေ လႅၵ်ႈလႆႈ", kac: "Generate hta lang na sumla ni — dip nna galai mai ai", th: "ภาพที่ Generate จะใช้ — แตะเพื่อเปลี่ยน", zh: "Generate 使用的图片 — 点按可更换", vi: "Ảnh sẽ dùng cho Generate — chạm để thay đổi", id: "Gambar yang dipakai Generate — ketuk untuk mengganti", ms: "Imej yang digunakan oleh Generate — ketik untuk tukar" },
  refsClear: { my: "ပုံအားလုံး ဖယ်မယ်", en: "Clear all images", shn: "လၢင်ႉၶႅပ်းႁၢင်ႈတင်းမူတ်း", kac: "Sumla yawng hpe sausan u", th: "ล้างรูปทั้งหมด", zh: "清除所有图片", vi: "Xóa tất cả ảnh", id: "Hapus semua gambar", ms: "Kosongkan semua imej" },
  cleared: { my: "ပုံ ၃ ကွက်လုံး ရှင်းလိုက်ပါပြီ", en: "All image slots cleared", shn: "လၢင်ႉၶႅပ်းႁၢင်ႈတင်းမူတ်းယဝ်ႉ", kac: "Sumla slot yawng sausan sai", th: "ล้างช่องรูปทั้งหมดแล้ว", zh: "已清除所有图片槽", vi: "Đã xóa tất cả ô ảnh", id: "Semua slot gambar dihapus", ms: "Semua slot imej dikosongkan" },
  promptCopy: { my: "Prompt ကူးမယ်", en: "Copy prompt", shn: "ၶူတ်ႉ prompt", kac: "Prompt hpe kaw u", th: "คัดลอก prompt", zh: "复制 prompt", vi: "Sao chép prompt", id: "Salin prompt", ms: "Salin prompt" },
  copyErr: { my: "ကူး၍မရပါ — စာကို ကိုယ်တိုင်ရွေးပြီး ကူးပါ", en: "Couldn't copy — select the text manually", shn: "ၶူတ်ႉဢမ်ႇလႆႈ", kac: "N mai kaw ai", th: "คัดลอกไม่ได้", zh: "无法复制", vi: "Không thể sao chép", id: "Tidak dapat menyalin", ms: "Tidak dapat menyalin" },
  promptPh: { my: "One-Tap နှိပ်ရင် ဒီမှာ prompt အလိုအလျောက် ရောက်လာမယ် — ကိုယ်တိုင်လည်း English/မြန်မာလို ရေးလို့ရတယ်…", en: "Tap any one-tap and the prompt lands here — or write your own in English/Burmese…", shn: "ၼဵၵ်း One-Tap သေ prompt တေမႃးတီႈၼႆႈ — တႅမ်ႈႁင်းၵူၺ်းၵေႃႈလႆႈ…", kac: "One-Tap dip yang prompt ndai kaw du na — nang nan ka mung mai ai…", th: "แตะ One-Tap แล้ว prompt จะมาที่นี่ — พิมพ์เองก็ได้…", zh: "点按任意 One-Tap，prompt 会出现在这里 — 也可以自己输入…", vi: "Chạm One-Tap và prompt sẽ hiện ở đây — hoặc tự viết…", id: "Ketuk One-Tap dan prompt muncul di sini — atau tulis sendiri…", ms: "Ketik One-Tap dan prompt muncul di sini — atau tulis sendiri…" },
  resultH2: { my: "ရလဒ်", en: "Result", shn: "ၽွၼ်းလႆႈ", kac: "Lachyum", th: "ผลลัพธ์", zh: "结果", vi: "Kết quả", id: "Hasil", ms: "Hasil" },
  toRef: { my: "↺ IMAGE 1 အဖြစ်သုံး", en: "↺ Use as IMAGE 1", shn: "↺ ႁဵတ်း IMAGE 1", kac: "↺ IMAGE 1 hku lang", th: "↺ ใช้เป็น IMAGE 1", zh: "↺ 设为 IMAGE 1", vi: "↺ Dùng làm IMAGE 1", id: "↺ Jadikan IMAGE 1", ms: "↺ Jadikan IMAGE 1" },
  toRefSt: { my: "ရလဒ်ကို IMAGE 1 ထဲ ထည့်ပြီး ✓ — ဆက် edit လို့ရပြီ", en: "Result added to IMAGE 1 ✓ — ready to keep editing", shn: "သႂ်ႇၽွၼ်းလႆႈၶဝ်ႈ IMAGE 1 ယဝ်ႉ ✓ — ႁပ်ႉၸႂ်ႉ edit ၵႂႃႇလႆႈယဝ်ႉ", kac: "Lachyum hpe IMAGE 1 kaw jaw sai ✓ — edit galoi mung mai ai", th: "เพิ่มผลลัพธ์ลง IMAGE 1 แล้ว ✓ — พร้อมแก้ไขต่อ", zh: "结果已添加到 IMAGE 1 ✓ — 可以继续编辑", vi: "Đã thêm kết quả vào IMAGE 1 ✓ — sẵn sàng chỉnh sửa tiếp", id: "Hasil ditambahkan ke IMAGE 1 ✓ — siap untuk terus mengedit", ms: "Hasil ditambah ke IMAGE 1 ✓ — sedia untuk terus mengedit" },
  cmpNeed: { my: "နှိုင်းဖို့ IMAGE 1 (မူရင်းပုံ) လိုတယ်", en: "Need IMAGE 1 (the original photo) to compare", shn: "လူဝ်ႇ IMAGE 1 (ၶႅပ်းႁၢင်ႈမူႇလ) တႃႇတဵင်ႇတူၺ်း", kac: "Nsen chyai na IMAGE 1 (dip sumla) ra ai", th: "ต้องมี IMAGE 1 (รูปต้นฉบับ) เพื่อเปรียบเทียบ", zh: "需要 IMAGE 1（原图）才能比较", vi: "Cần IMAGE 1 (ảnh gốc) để so sánh", id: "Perlu IMAGE 1 (foto asli) untuk membandingkan", ms: "Perlu IMAGE 1 (foto asal) untuk membandingkan" },
  adv: { my: "Advanced — အသေးစိတ် ရွေးချယ်မှု", en: "Advanced", shn: "Advanced — လွင်ႈလိူၵ်ႈႁူဝ်ယွႆႈ", kac: "Advanced — lata lam ni", th: "ขั้นสูง", zh: "高级选项", vi: "Nâng cao", id: "Lanjutan", ms: "Lanjutan" },
  remove: { my: "ပုံ ဖျက်", en: "Remove image", shn: "ဢဝ်ၶႅပ်းႁၢင်ႈဢွၵ်ႇ", kac: "Sumla shamat kau", th: "ลบรูปภาพ", zh: "移除图片", vi: "Xóa ảnh", id: "Hapus gambar", ms: "Buang imej" },
  retouch: { my: "ဒီပုံကို Retouch လုပ်မယ်", en: "Retouch this", shn: "Retouch ႁဵတ်းဢၼ်ၼႆႉ", kac: "Ndai hpe retouch galaw u", th: "รีทัชรูปนี้", zh: "修饰这张", vi: "Retouch ảnh này", id: "Retouch foto ini", ms: "Retouch foto ini" },
  path: { my: "Path batch ထဲ ထည့်မယ်", en: "Add to Path batch", shn: "သႂ်ႇၶဝ်ႈ Path batch", kac: "Path batch de bang u", th: "เพิ่มเข้าชุด Path", zh: "添加到 Path 批处理", vi: "Thêm vào lô Path", id: "Tambah ke batch Path", ms: "Tambah ke kumpulan Path" },
  engine: { my: "Model စာရင်း/api စီမံရန် — Setup ဖွင့်မယ်", en: "Manage models/api — open Setup", shn: "ၸတ်းၵၢၼ် model — ပိုတ်ႇ Setup", kac: "Model ni hpe up hkang — Setup hpaw u", th: "จัดการโมเดล — เปิด Setup", zh: "管理模型 — 打开 Setup", vi: "Quản lý model — mở Setup", id: "Kelola model — buka Setup", ms: "Urus model — buka Setup" },
  /* v6.107.2 — the source sheet speaks all nine languages now. It used to
     carry Burmese and English only, which was survivable while one page
     opened it; it is now the door on every image slot in the panel, and a
     Shan or Kachin student meeting "Where from?" in English at the moment
     they add their photo is the one place that must not be half-translated. */
  where: { my: "ဘယ်ကယူမလဲ", en: "Where from?", shn: "ဢဝ်တီႈလႂ်?", kac: "Gara kaw na?", th: "เอามาจากไหน?", zh: "从哪里获取？", vi: "Lấy từ đâu?", id: "Ambil dari mana?", ms: "Ambil dari mana?" },
  srcLayer: { my: "Photoshop layer ကယူမယ်", en: "Use the selected Photoshop layer", shn: "ၸႂ်ႉ Photoshop layer ဢၼ်လိူၵ်ႈဝႆႉ", kac: "Photoshop layer lata da ai hpe lang u", th: "ใช้เลเยอร์ Photoshop ที่เลือกไว้", zh: "使用选中的 Photoshop 图层", vi: "Dùng layer Photoshop đang chọn", id: "Pakai layer Photoshop yang dipilih", ms: "Guna lapisan Photoshop yang dipilih" },
  srcFile: { my: "ဒီစက်ထဲက ဖိုင် ရွေးမယ်", en: "Upload from this device", shn: "ဢဝ်ၶႅပ်းႁၢင်ႈ ၼႂ်းၶိူင်ႈၼႆႉ", kac: "Ndai jak kaw na sumla la u", th: "อัปโหลดจากเครื่องนี้", zh: "从本机上传", vi: "Tải lên từ máy này", id: "Unggah dari perangkat ini", ms: "Muat naik dari peranti ini" },
  srcLib: { my: "Library look ထဲက ယူမယ်", en: "Pick a Library look", shn: "လိူၵ်ႈ Library look", kac: "Library look langai lata u", th: "เลือกลุคจาก Library", zh: "从 Library 选择", vi: "Chọn look từ Library", id: "Pilih look dari Library", ms: "Pilih look dari Library" },
  srcLast: { my: "နောက်ဆုံးရလဒ်ကို သုံးမယ်", en: "Use the last result", shn: "ၸႂ်ႉၽွၼ်းလႆႈလိုၼ်းသုတ်း", kac: "Lachyum hpang jahtum hpe lang u", th: "ใช้ผลลัพธ์ล่าสุด", zh: "使用最近的结果", vi: "Dùng kết quả gần nhất", id: "Pakai hasil terakhir", ms: "Guna hasil terakhir" },
  /* v6.82.0 — the Freeform slot sheet gains the wizard's two other sources.
     Paste reads a copied picture, or a copied image address; Web asks for
     an address and fetches it (through the studio's API when Photoshop
     refuses the host). */
  srcPaste: { my: "Copy ထားတဲ့ ပုံ / link ကို paste မယ်", en: "Paste a copied picture or link", shn: "Paste ႁၢင်ႈ / link ဢၼ် copy ဝႆႉ", kac: "Copy da ai sumla / link hpe paste u", th: "วางรูปหรือลิงก์ที่คัดลอกไว้", zh: "粘贴已复制的图片或链接", vi: "Dán ảnh hoặc link đã sao chép", id: "Tempel gambar atau tautan yang disalin", ms: "Tampal gambar atau pautan yang disalin" },
  srcWeb: { my: "Web link ကနေ ယူမယ်", en: "From a web link", shn: "ဢဝ်တီႈ web link", kac: "Web link kaw na la u", th: "จากลิงก์เว็บ", zh: "来自网页链接", vi: "Từ một link web", id: "Dari tautan web", ms: "Daripada pautan web" },
  pasteOk: { my: "Paste လုပ်ထားတဲ့ ပုံ → IMAGE {n} ✓", en: "Pasted picture → IMAGE {n} ✓", shn: "ႁၢင်ႈဢၼ် paste → IMAGE {n} ✓", kac: "Paste da ai sumla → IMAGE {n} ✓", th: "รูปที่วาง → IMAGE {n} ✓", zh: "粘贴的图片 → IMAGE {n} ✓", vi: "Ảnh đã dán → IMAGE {n} ✓", id: "Gambar tertempel → IMAGE {n} ✓", ms: "Gambar ditampal → IMAGE {n} ✓" },
  pasteNone: { my: "Clipboard ထဲ ပုံ (သို့) ပုံ link မရှိပါ — ပုံတစ်ပုံ (သို့) ပုံရဲ့ address ကို အရင် copy လုပ်ပါ", en: "The clipboard holds no picture or image link — copy a picture, or an image address, first", shn: "ၼႂ်း clipboard ဢမ်ႇမီးႁၢင်ႈ / link — copy ႁၢင်ႈ ဢမ်ႇၼၼ် address ႁၢင်ႈ ဢွၼ်တၢင်း", kac: "Clipboard hta sumla / sumla link n nga ai — sumla (sh) sumla address hpe shawng copy u", th: "คลิปบอร์ดไม่มีรูปหรือลิงก์รูป — คัดลอกรูปหรือที่อยู่รูปก่อน", zh: "剪贴板里没有图片或图片链接 — 请先复制一张图片或图片地址", vi: "Clipboard không có ảnh hay link ảnh — hãy sao chép một ảnh hoặc địa chỉ ảnh trước", id: "Papan klip tidak berisi gambar atau tautan gambar — salin gambar atau alamat gambarnya dulu", ms: "Papan keratan tiada gambar atau pautan gambar — salin gambar atau alamat gambar dahulu" },
  resultTo: { my: "ရလဒ် → IMAGE {n} ✓", en: "Result → IMAGE {n} ✓" },
  min: { my: " မိနစ်", en: " min", shn: " မိၼိတ်ႉ", kac: " minit", th: " นาที", zh: " 分钟", vi: " phút", id: " mnt", ms: " min" },
  credits: { my: " · RH credit သုံးမယ်", en: " · uses RH credits", shn: " · ၸႂ်ႉ RH credit", kac: " · RH credit lang na", th: " · ใช้เครดิต RH", zh: " · 消耗 RH 额度", vi: " · dùng credit RH", id: " · pakai kredit RH", ms: " · guna kredit RH" },
  addonsNone: { my: "ဘာမှ မဖွင့်ရသေး — မဖွင့်လည်း ရတယ်", en: "Nothing enabled — that’s fine too" },
  modelSet: { my: "RunningHub model → {m} ✓ — ဒီ model နဲ့ generate လုပ်ပါမယ်", en: "RunningHub model → {m} ✓ — generates will use this model" },
  chainH: { my: "ရလဒ်ကို ဆက်ပြင်မယ်", en: "Continue editing this result", shn: "သိုပ်ႇမႄးထတ်း ၽွၼ်းလႆႈၼႆႉ", kac: "Ndai pru sumla hpe matut galaw", th: "แก้ไขผลลัพธ์นี้ต่อ", zh: "继续编辑此结果", vi: "Tiếp tục chỉnh sửa kết quả này", id: "Lanjutkan mengedit hasil ini", ms: "Terus sunting hasil ini" },
  /* the app's Generate run feedback (btnGen.onclick): ticker, Stop, Retry,
     the card's own done / stopped / timed-out lines */
  spinGen: { my: "တိုက်ရိုက် ထုတ်နေပါတယ် — စက္ကန့် ၂၀-၆၀ လောက် စောင့်ပါ…", en: "Generating — allow 20-60 seconds…", shn: "တိုၵ်ႉႁဵတ်းယူႇ — ပႂ်ႉ 20-60 ဝိၼၢထီး…", kac: "Galaw nga ai — 20-60 second la u…", th: "กำลังสร้าง — รอ 20-60 วินาที…", zh: "正在生成 — 请等待 20-60 秒…", vi: "Đang tạo — chờ 20-60 giây…", id: "Sedang membuat — tunggu 20-60 detik…", ms: "Sedang menjana — tunggu 20-60 saat…" },
  retry: { my: "ပြန်စမ်းမယ်", en: "Retry", shn: "ၸၢမ်းတူၺ်းၶိုၼ်း", kac: "Bai chyam yu", th: "ลองใหม่", zh: "重试", vi: "Thử lại", id: "Coba lagi", ms: "Cuba semula" },
  stop: { my: "ရပ်မယ်", en: "Stop", shn: "ၵိုတ်း", kac: "Hkring u", th: "หยุด", zh: "停止", vi: "Dừng", id: "Berhenti", ms: "Berhenti" },
  stopped: { my: "ရပ်လိုက်ပါပြီ", en: "Stopped", shn: "ၵိုတ်းယဝ်ႉ", kac: "Hkring sai", th: "หยุดแล้ว", zh: "已停止", vi: "Đã dừng", id: "Dihentikan", ms: "Dihentikan" },
  timedOut: { my: "အချိန်ကုန်သွားပါပြီ — ပြန်စမ်းကြည့်ပါ", en: "Timed out — try again", shn: "ၶၢဝ်းယၢမ်းမူတ်းယဝ်ႉ — ၸၢမ်းၶိုၼ်း", kac: "Aten htum mat sai — bai chyam u", th: "หมดเวลา — ลองใหม่อีกครั้ง", zh: "已超时 — 请重试", vi: "Hết thời gian chờ — thử lại", id: "Waktu habis — coba lagi", ms: "Tamat masa — cuba lagi" },
  done: { my: "ပြီးပါပြီ ✓", en: "Done ✓", shn: "ယဝ်ႉယဝ်ႈ ✓", kac: "Ngut sai ✓", th: "เสร็จแล้ว ✓", zh: "完成 ✓", vi: "Xong ✓", id: "Selesai ✓", ms: "Siap ✓" },
  needAny: { my: "Prompt ဒါမှမဟုတ် ပုံ တစ်ခုခု ထည့်ပါ", en: "Add a prompt or an image first", shn: "သႂ်ႇ prompt ဢမ်ႇၼၼ် ၶႅပ်းႁၢင်ႈ", kac: "Prompt (sh) sumla langai bang u", th: "ใส่ prompt หรือรูปภาพก่อน", zh: "请先添加 prompt 或图片", vi: "Thêm prompt hoặc ảnh trước", id: "Tambahkan prompt atau gambar dulu", ms: "Tambah prompt atau imej dahulu" },
  needKey: { my: "RunningHub key/model setup မလုပ်ရသေးပါ — Setup မှာ ဖြည့်ပါ", en: "RunningHub key/model isn't set up yet — configure it in Setup", shn: "RunningHub key/model ပႆႇလႆႈ setup — ၾၢႆႇ Setup ၵႂႃႇဖြည့်ပါ", kac: "RunningHub key/model n setup ai shi — Setup kaw galaw u", th: "ยังไม่ได้ตั้งค่า RunningHub key/model — ตั้งค่าใน Setup", zh: "尚未设置 RunningHub key/model — 请在 Setup 中配置", vi: "Chưa thiết lập RunningHub key/model — cấu hình trong Setup", id: "RunningHub key/model belum disiapkan — atur di Setup", ms: "RunningHub key/model belum disediakan — konfigurasi dalam Setup" },
  noImage: { my: "ပုံမထွက်လာပါ — prompt ပြောင်းပြီး ပြန်စမ်းပါ", en: "No image came back — try changing the prompt and retry", shn: "ဢမ်ႇမီးၶႅပ်းႁၢင်ႈဢွၵ်ႇမႃး — ၸၢမ်းလႅၵ်ႈ prompt ၶိုၼ်းၸၢမ်း", kac: "Sumla n pru wa ai — prompt hpe galai nna bai chyam u", th: "ไม่มีรูปออกมา — ลองเปลี่ยน prompt แล้วลองใหม่", zh: "没有生成图片 — 请更改 prompt 后重试", vi: "Không có ảnh trả về — thử thay đổi prompt rồi thử lại", id: "Tidak ada gambar yang dihasilkan — coba ubah prompt dan coba lagi", ms: "Tiada imej dihasilkan — cuba tukar prompt dan cuba lagi" }
};
function ff9(m) {
  if (!m) return "";
  const l = state.lang;
  return m[l] || m[LANG_FB[l]] || m.en || m.my || "";
}

/* Setup page strings — the web app's own Setup copy in the panel's nine languages
   (harvested from docs/app/index.html; the panel's I18N table stays untouched). */
const SETUP_L = {
  ph_home:{"my":"တစ်ခါချိန်ညှိရုံနဲ့ <em>အမြဲအဆင်သင့်</em> ဖြစ်နေမယ်","en":"Set up once — <em>ready whenever you are</em>","shn":"Setup ပွၵ်ႈလဵဝ် — <em>ၶႂ်ႈၸႂ်ႉမိူဝ်ႈလႂ်ၵေႃႈ ႁၢင်ႈႁႅၼ်းဝႆႉယဝ်ႉ</em>","kac":"Kalang sha setup galaw u — <em>galoi raitim hkyen da sai</em>","th":"ตั้งค่าครั้งเดียว — <em>พร้อมใช้ทุกเมื่อ</em>","zh":"设置一次 — <em>随时待命</em>","vi":"Thiết lập một lần — <em>sẵn sàng bất cứ lúc nào</em>","id":"Atur sekali — <em>siap kapan saja</em>","ms":"Sedia sekali sahaja — <em>sedia bila-bila masa</em>"},
  ready_h:{"my":"အသင့်ဖြစ်မှု အခြေအနေ","en":"READINESS","shn":"ငဝ်းလၢႆးႁၢင်ႈႁႅၼ်း","kac":"Jin ai lam","th":"สถานะความพร้อม","zh":"就绪状态","vi":"Trạng thái sẵn sàng","id":"Status kesiapan","ms":"Status kesediaan"},
  ready_ok:{"my":"အသင့် ✓","en":"Ready ✓","shn":"ႁၢင်ႈႁႅၼ်းယဝ်ႉ ✓","kac":"Jin sai ✓","th":"พร้อม ✓","zh":"就绪 ✓","vi":"Sẵn sàng ✓","id":"Siap ✓","ms":"Sedia ✓"},
  ready_no:{"my":"မထည့်ရသေး","en":"Not set","shn":"ပႆႇသႂ်ႇ","kac":"Rai n bang shi","th":"ยังไม่ตั้งค่า","zh":"未设置","vi":"Chưa đặt","id":"Belum diatur","ms":"Belum ditetapkan"},
  ready_acc:{"my":"အကောင့်","en":"Account","shn":"Account","kac":"Account","th":"บัญชี","zh":"账号","vi":"Tài khoản","id":"Akun","ms":"Akaun"},
  ready_out:{"my":"မဝင်ရသေး","en":"Logged out","shn":"ပႆႇၶဝ်ႈ","kac":"Rai n shang shi","th":"ยังไม่เข้าสู่ระบบ","zh":"未登录","vi":"Chưa đăng nhập","id":"Belum masuk","ms":"Belum log masuk"},
  days_short:{"my":" ရက်","en":"d","shn":" ဝၼ်း","kac":" ya","th":" วัน","zh":" 天","vi":" ngày","id":" hari","ms":" hari"},
  acc_h2:{"my":"အကောင့်","en":"ACCOUNT","shn":"ဢၶွင်ႉ","kac":"ACCOUNT","th":"บัญชี","zh":"账户","vi":"TÀI KHOẢN","id":"AKUN","ms":"AKAUN"},
  acc_plan_h:{"my":"အသုံးပြုခွင့် အခြေအနေ","en":"PLAN","shn":"ငဝ်းလၢႆးၸႂ်ႉတိုဝ်း","kac":"PACKAGE","th":"แพ็กเกจ","zh":"套餐状态","vi":"GÓI","id":"PAKET","ms":"PELAN"},
  acc_panel_h:{"my":"Photoshop Panel","en":"Photoshop Panel","shn":"Photoshop Panel","kac":"Photoshop Panel","th":"Photoshop Panel","zh":"Photoshop Panel","vi":"Photoshop Panel","id":"Photoshop Panel","ms":"Photoshop Panel"},
  dev_h:{"my":"ကျွန်ုပ်၏ စက်များ","en":"MY DEVICES","shn":"ၶိူင်ႈၸႂ်ႉၶွင်ၵဝ်","kac":"NGAI A DEVICE NI","th":"อุปกรณ์ของฉัน","zh":"我的设备","vi":"THIẾT BỊ CỦA TÔI","id":"PERANGKAT SAYA","ms":"PERANTI SAYA"},
  aw_en:{"my":"Welcome to <b>HNK AI Studio</b>","en":"Welcome to <b>HNK AI Studio</b>","shn":"Welcome to <b>HNK AI Studio</b>","kac":"Welcome to <b>HNK AI Studio</b>","th":"Welcome to <b>HNK AI Studio</b>","zh":"Welcome to <b>HNK AI Studio</b>","vi":"Welcome to <b>HNK AI Studio</b>","id":"Welcome to <b>HNK AI Studio</b>","ms":"Welcome to <b>HNK AI Studio</b>"},
  aw_back:{"my":"ပြန်လာတာ ကြိုဆိုပါတယ် — {N}","en":"Welcome back, {N}","shn":"ႁပ်ႉတွၼ်ႈၶိုၼ်း — {N}","kac":"Bai wa ai hpe hkap tau ga ai — {N}","th":"ยินดีต้อนรับกลับ — {N}","zh":"欢迎回来 — {N}","vi":"Chào mừng trở lại — {N}","id":"Selamat datang kembali — {N}","ms":"Selamat kembali — {N}"},
  aw_sub:{"my":"မင်္ဂလာပါ — သင့် AI ဓာတ်ပုံစတူဒီယိုက ကြိုဆိုနေပါတယ်","en":"Your AI photo studio awaits","shn":"မႂ်ႇသုင်ၶႃႈ — ႁွင်ႈထၢႆႇႁၢင်ႈ AI ၶွင်ၸဝ်ႈပႂ်ႉႁပ်ႉယူႇ","kac":"Shakram ga ai — na a AI sumla studio gaw la taw nga ai","th":"สวัสดี — สตูดิโอภาพ AI ของคุณพร้อมแล้ว","zh":"您好 — 您的 AI 照片工作室已就绪","vi":"Xin chào — studio ảnh AI của bạn đã sẵn sàng","id":"Halo — studio foto AI Anda telah siap","ms":"Selamat datang — studio foto AI anda sedia"},
  acc_name:{"my":"အမည်","en":"Name","shn":"ၸိုဝ်ႈ","kac":"Mying","th":"ชื่อ","zh":"姓名","vi":"Tên","id":"Nama","ms":"Nama"},
  acc_email:{"my":"အီးမေးလ်","en":"Email","shn":"ဢီးမေးလ်","kac":"Email","th":"อีเมล","zh":"邮箱","vi":"Email","id":"Email","ms":"E-mel"},
  acc_member_since:{"my":"အဖွဲ့ဝင် ဖြစ်သည့်နေ့ — {D}","en":"Member since {D}","shn":"ပဵၼ်လုၵ်ႈၸုမ်းမႃး — {D}","kac":"Amyu masha byin ai shani — {D}","th":"เป็นสมาชิกตั้งแต่ {D}","zh":"注册于 {D}","vi":"Thành viên từ {D}","id":"Anggota sejak {D}","ms":"Ahli sejak {D}"},
  ava_change:{"my":"ပရိုဖိုင်ပုံ ပြောင်းမယ်","en":"Change profile photo","shn":"လႅၵ်ႈႁၢင်ႈ Profile","kac":"Profile sumla galai u","th":"เปลี่ยนรูปโปรไฟล์","zh":"更换头像","vi":"Đổi ảnh đại diện","id":"Ganti foto profil","ms":"Tukar foto profil"},
  ava_remove:{"my":"ပုံဖြုတ်မယ်","en":"Remove photo","shn":"ထွၼ်ႁၢင်ႈ","kac":"Sumla shaw kau u","th":"ลบรูป","zh":"移除头像","vi":"Xóa ảnh","id":"Hapus foto","ms":"Buang foto"},
  ava_saved:{"my":"ပရိုဖိုင်ပုံ သိမ်းပြီးပါပြီ","en":"Profile photo saved","shn":"သိမ်းႁၢင်ႈယဝ်ႉ","kac":"Sumla makoi da sai","th":"บันทึกรูปแล้ว","zh":"头像已保存","vi":"Đã lưu ảnh","id":"Foto tersimpan","ms":"Foto disimpan"},
  ava_removed:{"my":"ပုံဖြုတ်ပြီးပါပြီ","en":"Photo removed","shn":"ထွၼ်ႁၢင်ႈယဝ်ႉ","kac":"Sumla shaw kau sai","th":"ลบรูปแล้ว","zh":"头像已移除","vi":"Đã xóa ảnh","id":"Foto dihapus","ms":"Foto dibuang"},
  ava_fail:{"my":"ပုံကို သုံးလို့မရပါ — တခြားပုံတစ်ပုံ စမ်းကြည့်ပါ","en":"That image could not be used — try another one","shn":"ဢမ်ႇၸႂ်ႉႁၢင်ႈၼႆႉလႆႈ — ၶိုၼ်းလိူၵ်ႈထႅင်ႈ","kac":"Ndai sumla n mai lang ai — kaga langai chyam yu u","th":"ใช้รูปนี้ไม่ได้ — ลองรูปอื่น","zh":"无法使用该图片 — 请换一张","vi":"Không dùng được ảnh này — thử ảnh khác","id":"Gambar tidak bisa dipakai — coba yang lain","ms":"Imej tidak boleh digunakan — cuba yang lain"},
  acc_btn_logout:{"my":"ထွက်မယ်","en":"Log out","shn":"ဢွၵ်ႇ","kac":"Pru u","th":"ออกจากระบบ","zh":"退出登录","vi":"Đăng xuất","id":"Keluar","ms":"Log keluar"},
  acc_change_pass_h:{"my":"စကားဝှက် ပြောင်းရန်","en":"Change password","shn":"လႅၵ်ႈၶေႃႈလပ်ႉ","kac":"Password galai","th":"เปลี่ยนรหัสผ่าน","zh":"更改密码","vi":"Đổi mật khẩu","id":"Ubah kata sandi","ms":"Tukar kata laluan"},
  acc_pass_new:{"my":"စကားဝှက် အသစ်","en":"New password","shn":"ၶေႃႈလပ်ႉမႂ်ႇ","kac":"Password namsan","th":"รหัสผ่านใหม่","zh":"新密码","vi":"Mật khẩu mới","id":"Kata sandi baru","ms":"Kata laluan baharu"},
  btn_show:{"my":"ပြ","en":"Show","shn":"ၼႄ","kac":"Madun","th":"แสดง","zh":"显示","vi":"Hiện","id":"Lihat","ms":"Papar"},
  acc_pass_short:{"my":"စကားဝှက် အနည်းဆုံး စာလုံး ၆ လုံး လိုပါတယ်","en":"Password must be at least 6 characters","shn":"ၶေႃႈလပ်ႉ တေလႆႈမီးတူဝ်လိၵ်ႈ 6 တူဝ်ၶိုၼ်ႈၼိူဝ်","kac":"Password gaw laika 6 hte grau ra ai","th":"รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร","zh":"密码至少需要 6 个字符","vi":"Mật khẩu phải có ít nhất 6 ký tự","id":"Kata sandi minimal 6 karakter","ms":"Kata laluan mesti sekurang-kurangnya 6 aksara"},
  acc_pass_changed:{"my":"စကားဝှက် ပြောင်းပြီးပါပြီ ✓","en":"Password changed ✓","shn":"လႅၵ်ႈၶေႃႈလပ်ႉယဝ်ႉ ✓","kac":"Password galai ngut sai ✓","th":"เปลี่ยนรหัสผ่านแล้ว ✓","zh":"密码已更改 ✓","vi":"Đã đổi mật khẩu ✓","id":"Kata sandi diubah ✓","ms":"Kata laluan telah ditukar ✓"},
  acc_plan_free:{"my":"Premium မဝယ်ရသေးပါ","en":"No Premium yet","shn":"ပႆႇလႆႈသိုဝ်ႉ Premium","kac":"Premium n mari shi ai","th":"ยังไม่มี Premium","zh":"尚未购买 Premium","vi":"Chưa có Premium","id":"Belum ada Premium","ms":"Belum ada Premium"},
  acc_plan_expired:{"my":"Premium သက်တမ်း ကုန်သွားပါပြီ — အောက်မှာ ပြန်လည် သက်တမ်းတိုးနိုင်ပါတယ်","en":"Premium has expired — you can renew below","shn":"Premium မူတ်းယဝ်ႉ — တေႃႇသိုပ်ႇလႆႈတီႈတႂ်ႈၼႆႉ","kac":"Premium htum sai — npu kaw bai matut la lu ai","th":"Premium หมดอายุแล้ว — ต่ออายุได้ด้านล่าง","zh":"Premium 已到期 — 可在下方续费","vi":"Premium đã hết hạn — bạn có thể gia hạn bên dưới","id":"Premium sudah berakhir — perpanjang di bawah","ms":"Premium telah tamat — anda boleh perbaharui di bawah"},
  acc_plan_soon:{"my":"Premium သက်တမ်း {N} ရက်အတွင်း ကုန်ပါတော့မယ် — ကြိုတင် သက်တမ်းတိုးထားပါ","en":"Premium expires in {N} days — renew now","shn":"Premium တေမူတ်းၼႂ်း {N} ဝၼ်း — တေႃႇသိုပ်ႇဝႆႉၵွၼ်ႇ","kac":"Premium gaw {N} ya hta htum na — ya matut la u","th":"Premium จะหมดอายุใน {N} วัน — ต่ออายุตอนนี้","zh":"Premium 将在 {N} 天后到期 — 请提前续费","vi":"Premium hết hạn sau {N} ngày — gia hạn ngay","id":"Premium berakhir dalam {N} hari — perpanjang sekarang","ms":"Premium tamat dalam {N} hari — perbaharui sekarang"},
  acc_plan_active:{"my":"Premium သုံးနေဆဲ — {N} ရက် ကျန်ပါသေးတယ်","en":"Premium active — {N} days left","shn":"Premium ၸႂ်ႉယူႇ — ၵိုတ်း {N} ဝၼ်း","kac":"Premium galaw nga ai — {N} ya ngam ai","th":"Premium ใช้งานอยู่ — เหลือ {N} วัน","zh":"Premium 使用中 — 剩余 {N} 天","vi":"Premium đang hoạt động — còn {N} ngày","id":"Premium aktif — sisa {N} hari","ms":"Premium aktif — tinggal {N} hari"},
  acc_plan_until:{"my":"{D} ထိ","en":"Until {D}","shn":"တေႃႇထိုင် {D}","kac":"{D} du hkra","th":"ถึง {D}","zh":"有效期至 {D}","vi":"Đến {D}","id":"Sampai {D}","ms":"Sehingga {D}"},
  acc_pending:{"my":"သင့် account ကို HNK က စစ်ဆေးနေပါသည်။ ခွင့်ပြုပြီးပါက ဤနေရာတွင် ပြပါမည်။","en":"HNK is reviewing your account. Once it is approved this is where it will show.","shn":"HNK တိုၵ်ႉတူၺ်း account ၸဝ်ႈၵဝ်ႇယူႇ။ ပေႃးၶႂၢင်းပၼ်ယဝ်ႉ တေၼႄတီႈၼႆႈ။","kac":"HNK nang a account hpe yu nga ai. Hkap la ngut jang ndai kaw madun na.","th":"HNK กำลังตรวจสอบบัญชีของคุณ เมื่ออนุมัติแล้วจะแสดงที่นี่","zh":"HNK 正在审核你的账户。通过后会显示在这里。","vi":"HNK đang xét duyệt tài khoản của bạn. Sau khi được duyệt sẽ hiển thị ở đây.","id":"HNK sedang meninjau akun Anda. Setelah disetujui akan tampil di sini.","ms":"HNK sedang menyemak akaun anda. Setelah diluluskan ia akan dipaparkan di sini."},
  acc_unreachable:{"my":"အကောင့် server နဲ့ ချိတ်ဆက်လို့ မရသေးပါ — app ကတော့ ပုံမှန် သုံးလို့ရပါတယ်","en":"Can't reach the account service right now — the app still works as normal","shn":"ၵပ်းသိုပ်ႇ server ဢၶွင်ႉ ဢမ်ႇလႆႈ — app တႄႉ ၸႂ်ႉလႆႈပဵၼ်ပိူင်ၵဝ်ႇ","kac":"Account server hte n hkrum lu ai — app gaw mi na zawn galaw lu ai","th":"เชื่อมต่อบริการบัญชีไม่ได้ตอนนี้ — แอปยังใช้งานได้ตามปกติ","zh":"暂时连不上账户服务 — 应用仍可正常使用","vi":"Hiện chưa kết nối được dịch vụ tài khoản — ứng dụng vẫn dùng bình thường","id":"Layanan akun belum bisa dihubungi — aplikasi tetap berjalan normal","ms":"Perkhidmatan akaun tidak dapat dihubungi — apl masih berfungsi seperti biasa"},
  acc_offline:{"my":"အင်တာနက် မရှိပါ — နောက်ဆုံး သိထားတဲ့ အခြေအနေကို ပြထားပါတယ်","en":"Offline — showing your last known status","shn":"ဢမ်ႇမီးဢိၼ်ႇထႃႇၼႅတ်ႉ — ၼႄဝႆႉငဝ်းလၢႆးလိုၼ်းသုတ်း","kac":"Internet n nga ai — hpang jahtum chye da ai lam hpe madun ai","th":"ออฟไลน์ — แสดงสถานะล่าสุดที่ทราบ","zh":"离线 — 显示上次已知的状态","vi":"Ngoại tuyến — hiển thị trạng thái đã biết gần nhất","id":"Offline — menampilkan status terakhir yang diketahui","ms":"Luar talian — memaparkan status terakhir yang diketahui"},
  acc_panel_p:{"my":"Premium plan သက်တမ်းရှိကြောင်း စစ်ပြီးပါပြီ။ Photoshop 24.2+ အတွက် Panel ကို ဒီမှာရယူနိုင်ပါတယ်။","en":"Your active Premium plan is verified. Get the Panel for Photoshop 24.2+ here.","shn":"ၵူတ်ႇထတ်း Premium plan ဢၼ်တိုၵ်ႉၸႂ်ႉလႆႈယဝ်ႉ။ ဢဝ် Panel တႃႇ Photoshop 24.2+ တီႈၼႆႈ။","kac":"Active Premium plan hpe chyeju dum sai. Photoshop 24.2+ a matu Panel hpe ndai kaw la lu ai.","th":"ตรวจสอบแผน Premium ที่ใช้งานอยู่แล้ว รับ Panel สำหรับ Photoshop 24.2+ ได้ที่นี่","zh":"有效的 Premium 套餐已验证。可在此获取适用于 Photoshop 24.2+ 的 Panel。","vi":"Gói Premium đang hoạt động đã được xác minh. Nhận Panel cho Photoshop 24.2+ tại đây.","id":"Paket Premium aktif Anda telah diverifikasi. Dapatkan Panel untuk Photoshop 24.2+ di sini.","ms":"Pelan Premium aktif anda telah disahkan. Dapatkan Panel untuk Photoshop 24.2+ di sini."},
  acc_panel_btn:{"my":"Panel ccx ရယူမယ်","en":"Download Panel ccx","shn":"ဢဝ် Panel ccx","kac":"Panel ccx la u","th":"ดาวน์โหลด Panel ccx","zh":"下载 Panel ccx","vi":"Tải Panel ccx","id":"Unduh Panel ccx","ms":"Muat turun Panel ccx"},
  acc_panel_dl:{"my":"Panel ccx v{V} ရယူမယ်","en":"Download Panel ccx v{V}","shn":"ဢဝ် Panel ccx v{V}","kac":"Panel ccx v{V} la u","th":"ดาวน์โหลด Panel ccx v{V}","zh":"下载 Panel ccx v{V}","vi":"Tải Panel ccx v{V}","id":"Unduh Panel ccx v{V}","ms":"Muat turun Panel ccx v{V}"},
  dev_count:{"my":"စက် {M} လုံးအနက် {N} လုံး သုံးထားပါတယ်","en":"{N} of {M} devices used","shn":"ၸႂ်ႉဝႆႉ {N} လုၵ်ႈ ၼႂ်းၶိူင်ႈ {M} လုၵ်ႈ","kac":"Device {M} kaw na {N} lang da sai","th":"ใช้ไปแล้ว {N} จาก {M} อุปกรณ์","zh":"已使用 {M} 台中的 {N} 台设备","vi":"Đã dùng {N} trong {M} thiết bị","id":"{N} dari {M} perangkat terpakai","ms":"{N} daripada {M} peranti digunakan"},
  dev_none:{"my":"စက် တစ်လုံးမှ မမှတ်ပုံတင်ရသေးပါ","en":"No devices registered yet","shn":"ပႆႇမီးၶိူင်ႈဢၼ်ႁဵတ်းမၢႆၾၢင်ဝႆႉ","kac":"Device langai mung n mahtai da shi ai","th":"ยังไม่มีอุปกรณ์ที่ลงทะเบียน","zh":"尚未注册任何设备","vi":"Chưa có thiết bị nào được đăng ký","id":"Belum ada perangkat terdaftar","ms":"Belum ada peranti didaftarkan"},
  dev_this:{"my":"ဒီစက်","en":"This device","shn":"ၶိူင်ႈဢၼ်ၼႆႉ","kac":"Ndai device","th":"อุปกรณ์นี้","zh":"当前设备","vi":"Thiết bị này","id":"Perangkat ini","ms":"Peranti ini"},
  dev_limit:{"my":"စက် ကန့်သတ်ချက် ပြည့်နေပါပြီ — သင့်အကောင့်မှာ စက် {M} လုံးပဲ သုံးခွင့် ရှိပါတယ်။ အောက်က စာရင်းထဲက မသုံးတော့တဲ့ စက်တစ်လုံးကို ဖယ်ရှားပါ၊ ဒါမှမဟုတ် စက် ထပ်တိုးဖို့ ဝယ်ပါ","en":"Device limit reached — your account allows {M} devices. Remove an old device from the list below, or buy an extra device slot.","shn":"ၶိူင်ႈတဵမ်ယဝ်ႉ — ဢၶွင်ႉသူ ၸႂ်ႉလႆႈၶိူင်ႈ {M} လုၵ်ႈၵူၺ်း။ ဢဝ်ၶိူင်ႈၵဝ်ႇဢၼ်ဢမ်ႇၸႂ်ႉယဝ်ႉ ၼႂ်းသဵၼ်ႈမၢႆတႂ်ႈၼႆႉဢွၵ်ႇ ဢမ်ႇၼၼ် သိုဝ်ႉၶိူင်ႈထႅမ်ထႅင်ႈ။","kac":"Device tup sai — na a account gaw device {M} sha lang lu ai. Npu na list kaw na device dingga langai hpe shale kau u, n rai yang device shara langai mari u.","th":"ถึงขีดจำกัดอุปกรณ์แล้ว — บัญชีของคุณใช้ได้ {M} เครื่อง นำเครื่องเก่าออกจากรายการด้านล่าง หรือซื้อสล็อตอุปกรณ์เพิ่ม","zh":"设备数量已满 — 你的账户最多 {M} 台设备。请在下方列表移除旧设备，或购买额外设备名额。","vi":"Đã đạt giới hạn thiết bị — tài khoản của bạn cho phép {M} thiết bị. Hãy gỡ một thiết bị cũ trong danh sách bên dưới, hoặc mua thêm một suất thiết bị.","id":"Batas perangkat tercapai — akun Anda mengizinkan {M} perangkat. Hapus perangkat lama dari daftar di bawah, atau beli slot perangkat tambahan.","ms":"Had peranti telah dicapai — akaun anda membenarkan {M} peranti. Buang peranti lama daripada senarai di bawah, atau beli slot peranti tambahan."},
  rh_opt:{"my":"(ချန်ထားလို့ရ)","en":"(optional)","shn":"(ဢမ်ႇထၢင်ႇၵေႃႈလႆႈ)","kac":"(n ra ai)","th":"(ไม่บังคับ)","zh":"（可选）","vi":"(tùy chọn)","id":"(opsional)","ms":"(pilihan)"},
  rh_intro:{"my":"RunningHub Enterprise-Shared key ကို paste ပြီး Save & Verify နှိပ်ရုံပါပဲ — Nano Banana 2 က key ချက်ချင်း အလိုအလျောက် အသုံးပြုလို့ရပါပြီ (webappId/node id ထည့်စရာမလိုပါ)။ Model တခြားများ ဆက်ချိတ်ချင်ရင် endpoint path ကို RunningHub API docs ကနေ ကူးထည့်ရုံပါပဲ — ဒီစက်ထဲမှာပဲ သိမ်းထားမှာပါ၊ RunningHub ကိုပဲ တိုက်ရိုက် ပို့ပြီး တခြား server ကို မပို့ပါ။","en":"Paste your RunningHub Enterprise-Shared key and tap Save & Verify — Nano Banana 2 works instantly with just the key (no webappId/node id needed). To add other models, paste the endpoint path from RunningHub's API docs. Everything stays on this device and is sent straight to RunningHub, never through any other server.","shn":"Paste RunningHub Enterprise-Shared key သေ ၼဵၵ်း Save & Verify ၵူၺ်း — Nano Banana 2 ၸႂ်ႉလႆႈၵမ်းလဵဝ်လူၺ်ႈ key ဢၼ်လဵဝ် (ဢမ်ႇလူဝ်ႇ webappId/node id)။ ၶႂ်ႈသႂ်ႇ model တၢင်ႇဢၼ်ၼႆ ၶႅတ်ႉ endpoint path တီႈ RunningHub API docs သေမႃးပလၢတ်ႈ။ ၵူႈလွင်ႈသိမ်းဝႆႉၼႂ်းၶိူင်ႈၼႆႉၵူၺ်း — သူင်ႇၵမ်းသိုဝ်ႈထိုင် RunningHub၊ ဢမ်ႇလတ်းၽၢၼ်ႇ server တၢင်ႇဢၼ်။","kac":"Na a RunningHub Enterprise-Shared key hpe paste nna Save & Verify dip u — Nano Banana 2 gaw key sha hte kalang ta galaw mai ai (webappId/node id n ra ai). Kaga model bang mayu yang RunningHub API docs kaw na endpoint path hpe copy paste u. Yawng gaw ndai machine hta sha rawng nga ai — RunningHub de ding hkra shagun ai, kaga server langai mi hku mung n lai ai.","th":"วางคีย์ RunningHub Enterprise-Shared แล้วกด Save & Verify — Nano Banana 2 ใช้งานได้ทันทีด้วย key อย่างเดียว (ไม่ต้องใส่ webappId/node id) หากต้องการเพิ่มโมเดลอื่น ให้คัดลอก endpoint path จากเอกสาร API ของ RunningHub มาวาง ทุกอย่างเก็บอยู่ในเครื่องนี้เท่านั้นและส่งตรงถึง RunningHub ไม่ผ่านเซิร์ฟเวอร์อื่นใด","zh":"粘贴 RunningHub Enterprise-Shared key 并点击 Save & Verify — Nano Banana 2 只需 key 即可立即使用（无需 webappId/node id）。要接入其他模型，从 RunningHub API 文档复制 endpoint path 粘贴即可。一切只保存在本设备上，并直接发送给 RunningHub，绝不经过其他任何服务器。","vi":"Dán RunningHub Enterprise-Shared key và bấm Save & Verify — Nano Banana 2 hoạt động ngay chỉ với key (không cần webappId/node id). Muốn thêm model khác, dán endpoint path từ tài liệu API của RunningHub. Mọi thứ chỉ nằm trên thiết bị này và gửi thẳng tới RunningHub, không bao giờ qua máy chủ nào khác.","id":"Tempel RunningHub Enterprise-Shared key lalu tekan Save & Verify — Nano Banana 2 langsung berfungsi hanya dengan key (tanpa webappId/node id). Untuk menambah model lain, tempel endpoint path dari dokumen API RunningHub. Semuanya hanya tersimpan di perangkat ini dan dikirim langsung ke RunningHub, tidak pernah lewat server lain mana pun.","ms":"Tampal RunningHub Enterprise-Shared key dan tekan Save & Verify — Nano Banana 2 terus berfungsi hanya dengan key (tiada webappId/node id diperlukan). Untuk menambah model lain, tampal laluan endpoint dari dokumen API RunningHub. Semuanya kekal pada peranti ini dan dihantar terus ke RunningHub, tidak melalui mana-mana pelayan lain."},
  rh_save_verify:{"my":"Save & Verify","en":"Save & Verify","shn":"Save & Verify","kac":"Save & Verify","th":"บันทึกและยืนยัน","zh":"保存并验证","vi":"Lưu & Xác minh","id":"Simpan & Verifikasi","ms":"Simpan & Sahkan"},
  rh_enter_key:{"my":"key ထည့်ပါ","en":"Enter a key","shn":"သႂ်ႇ key","kac":"key jaw u","th":"กรอก key","zh":"请输入 key","vi":"Nhập key","id":"Masukkan key","ms":"Masukkan key"},
  rh_checking:{"my":"စစ်နေတယ်…","en":"Checking…","shn":"တွပ်ႇထၢမ်ဝႆႉ…","kac":"Yu chyam nga ai…","th":"กำลังตรวจสอบ…","zh":"检查中…","vi":"Đang kiểm tra…","id":"Memeriksa…","ms":"Menyemak…"},
  rh_verified:{"my":"Key အလုပ်လုပ်ပါတယ် ✓","en":"Key verified ✓","shn":"Key ၸႂ်ႉလႆႈ ✓","kac":"Key teng ai ✓","th":"Key ใช้งานได้ ✓","zh":"Key 已验证 ✓","vi":"Key hợp lệ ✓","id":"Key terverifikasi ✓","ms":"Key disahkan ✓"},
  rh_neterr:{"my":"Network error — ပြန်စမ်းပါ","en":"Network error — try again","shn":"Network error — ၸၢမ်းၶိုၼ်း","kac":"Network error — bai chyam u","th":"Network error — ลองใหม่","zh":"网络错误 — 请重试","vi":"Lỗi mạng — thử lại","id":"Error jaringan — coba lagi","ms":"Ralat rangkaian — cuba lagi"},
  rh_badkey:{"my":"RunningHub key မှားနေပါတယ် — Setup မှာ ပြန်စစ်ပါ","en":"RunningHub key is invalid — recheck it in Setup","shn":"RunningHub key ၽိတ်းယူႇ — ၾၢႆႇ Setup ၵႂႃႇပွင်ႇတူၺ်း","kac":"RunningHub key n teng ai — Setup kaw bai yu chyam u","th":"RunningHub key ไม่ถูกต้อง — ตรวจสอบใน Setup","zh":"RunningHub key 无效 — 请在 Setup 中重新检查","vi":"RunningHub key không hợp lệ — kiểm tra lại trong Setup","id":"RunningHub key tidak valid — periksa lagi di Setup","ms":"RunningHub key tidak sah — semak semula dalam Setup"},
  rh_err:{"my":"RunningHub error — ပြန်စမ်းကြည့်ပါ ({S})","en":"RunningHub error — try again ({S})","shn":"RunningHub error — ၸၢမ်းၶိုၼ်း ({S})","kac":"RunningHub error — bai chyam u ({S})","th":"RunningHub error — ลองใหม่ ({S})","zh":"RunningHub 错误 — 请重试 ({S})","vi":"Lỗi RunningHub — thử lại ({S})","id":"Error RunningHub — coba lagi ({S})","ms":"Ralat RunningHub — cuba lagi ({S})"},
  rh_adv:{"my":"Model ချိန်ညှိမှု (Advanced)","en":"Model Config (Advanced)","shn":"Model Config (Advanced)","kac":"Model Config (Advanced)","th":"ตั้งค่าโมเดล (ขั้นสูง)","zh":"模型配置（高级）","vi":"Cấu hình model (Nâng cao)","id":"Konfigurasi model (Lanjutan)","ms":"Konfigurasi model (Lanjutan)"},
  rh_sample:{"my":"Endpoint path ကို RunningHub API docs (model page ရဲ့ \"Endpoint:\" line) ကနေ copy ပြီး ဒီမှာ paste ပါ — ✓ ပါတဲ့ model တွေက built-in ဖြစ်လို့ ဘာမှ ဖြည့်စရာမလိုပါ။","en":"Copy the endpoint path from RunningHub's API docs (the \"Endpoint:\" line on the model's page) and paste it here — models marked ✓ already have a built-in default, nothing to fill in.","shn":"ၶႅတ်ႉ endpoint path တီႈ RunningHub API docs (ထႅဝ် \"Endpoint:\" ၼိူဝ်ၼႃႈ model) သေ ပလၢတ်ႈတီႈၼႆႈ — model ဢၼ်မီး ✓ ၼၼ်ႉ မီး built-in ဝႆႉယဝ်ႉ ဢမ်ႇလူဝ်ႇတႅမ်ႈသင်ထႅင်ႈ။","kac":"RunningHub API docs (model page a \"Endpoint:\" hteng) kaw na endpoint path hpe copy nna ndai kaw paste u — ✓ lawm ai model ni gaw built-in nga sai majaw hpa n ra ai.","th":"คัดลอก endpoint path จากเอกสาร API ของ RunningHub (บรรทัด \"Endpoint:\" บนหน้าโมเดล) มาวางที่นี่ — โมเดลที่มี ✓ มีค่าเริ่มต้นในตัวแล้ว ไม่ต้องกรอกอะไรเพิ่ม","zh":"从 RunningHub API 文档（模型页面的 \"Endpoint:\" 一行）复制端点路径粘贴到这里 — 带 ✓ 的模型已有内置默认值，无需填写。","vi":"Sao chép endpoint path từ tài liệu API của RunningHub (dòng \"Endpoint:\" trên trang model) và dán vào đây — model có dấu ✓ đã có sẵn mặc định, không cần điền gì.","id":"Salin endpoint path dari dokumen API RunningHub (baris \"Endpoint:\" di halaman model) dan tempel di sini — model bertanda ✓ sudah punya bawaan, tidak perlu diisi.","ms":"Salin laluan endpoint dari dokumen API RunningHub (baris \"Endpoint:\" pada halaman model) dan tampal di sini — model bertanda ✓ sudah ada lalai terbina, tiada apa perlu diisi."},
  rh_save_model:{"my":"ဒီ Model ကို Save","en":"Save this model","shn":"Save Model ၼႆႉ","kac":"Ndai model hpe Save","th":"บันทึกโมเดลนี้","zh":"保存该模型","vi":"Lưu model này","id":"Simpan model ini","ms":"Simpan model ini"},
  rh_none:{"my":"model တစ်ခုမှ configure မရသေးပါ","en":"No models configured yet","shn":"model တစ်ခုမွ ဢမ်ႇပႆႇ configure","kac":"Model langai mung n configure shi shi ai","th":"ยังไม่มีการตั้งค่าโมเดลใด","zh":"尚未配置任何模型","vi":"Chưa cấu hình model nào","id":"Belum ada model yang dikonfigurasi","ms":"Belum ada model dikonfigurasi"},
  rh_chip_title:{"my":"Generate မှာ ဒီ model သုံးဖို့ နှိပ်ပါ","en":"Tap to use this model for Generate","shn":"ၼဵၵ်းသေ ၸႂ်ႉ model ၼႆႉ","kac":"Generate hta ndai model hpe lang na dip u","th":"แตะเพื่อใช้โมเดลนี้ตอน Generate","zh":"点击以在生成时使用此模型","vi":"Chạm để dùng model này khi Generate","id":"Ketuk untuk memakai model ini saat Generate","ms":"Ketik untuk guna model ini semasa Generate"},
  rh_ep_req:{"my":"endpoint path ဖြည့်ပါ","en":"Endpoint path is required","shn":"လူဝ်ႇ endpoint path","kac":"endpoint path ra ai","th":"ต้องกรอก endpoint path","zh":"需要 endpoint path","vi":"Cần endpoint path","id":"endpoint path wajib diisi","ms":"laluan endpoint diperlukan"},
  rh_saved:{"my":"Save ပြီးပါပြီ ✓","en":"Saved ✓","shn":"Save ယဝ်ႉ ✓","kac":"Save byin sai ✓","th":"บันทึกแล้ว ✓","zh":"已保存 ✓","vi":"Đã lưu ✓","id":"Tersimpan ✓","ms":"Disimpan ✓"},
  rh_remove:{"my":"Key ဖျက်မယ်","en":"Remove key","shn":"မွတ်ႇ key","kac":"Key shamat u","th":"ลบคีย์","zh":"移除密钥","vi":"Xóa khóa","id":"Hapus kunci","ms":"Buang kunci"},
  rh_remove_confirm:{"my":"ဒီ key ကို browser ထဲက ဖျက်မယ် — သေချာလား?","en":"Remove this key from the browser?","shn":"မွတ်ႇ key ၼႆႉ?","kac":"Ndai key hpe shamat na?","th":"ลบคีย์นี้?","zh":"移除此密钥？","vi":"Xóa khóa này?","id":"Hapus kunci ini?","ms":"Buang kunci ini?"},
  rh_q_none:{"my":"quality: မထည့် (default)","en":"quality: none (default)","shn":"quality: ဢမ်ႇသႂ်ႇ (default)","kac":"quality: n bang (default)","th":"quality: ไม่ใส่ (ค่าเริ่มต้น)","zh":"quality: 不设置（默认）","vi":"quality: không đặt (mặc định)","id":"quality: tidak diatur (default)","ms":"quality: tiada (lalai)"},
  rh_key_ph:{"my":"RunningHub Enterprise-Shared Key","en":"RunningHub Enterprise-Shared Key","shn":"RunningHub Enterprise-Shared Key","kac":"RunningHub Enterprise-Shared Key","th":"RunningHub Enterprise-Shared Key","zh":"RunningHub Enterprise-Shared Key","vi":"RunningHub Enterprise-Shared Key","id":"RunningHub Enterprise-Shared Key","ms":"RunningHub Enterprise-Shared Key"},
  rh_path_ph:{"my":"rhart-image-n-g31-flash/image-to-image","en":"rhart-image-n-g31-flash/image-to-image","shn":"rhart-image-n-g31-flash/image-to-image","kac":"rhart-image-n-g31-flash/image-to-image","th":"rhart-image-n-g31-flash/image-to-image","zh":"rhart-image-n-g31-flash/image-to-image","vi":"rhart-image-n-g31-flash/image-to-image","id":"rhart-image-n-g31-flash/image-to-image","ms":"rhart-image-n-g31-flash/image-to-image"},
  rh_q_low:{"my":"quality: low","en":"quality: low","shn":"quality: low","kac":"quality: low","th":"quality: low","zh":"quality: low","vi":"quality: low","id":"quality: low","ms":"quality: low"},
  rh_q_medium:{"my":"quality: medium","en":"quality: medium","shn":"quality: medium","kac":"quality: medium","th":"quality: medium","zh":"quality: medium","vi":"quality: medium","id":"quality: medium","ms":"quality: medium"},
  rh_q_high:{"my":"quality: high","en":"quality: high","shn":"quality: high","kac":"quality: high","th":"quality: high","zh":"quality: high","vi":"quality: high","id":"quality: high","ms":"quality: high"},
  st_key_noconn:{"my":"ချိတ်ဆက်မရ — internet စစ်ပါ","en":"Couldn't connect — check your internet","shn":"ၽိတ်းၽၢတ်ႇဢမ်ႇလႆႈ — တွပ်ႇထၢမ် internet တူၺ်း","kac":"N grau connect — internet yu chyam u","th":"เชื่อมต่อไม่ได้ — ตรวจสอบอินเทอร์เน็ต","zh":"无法连接 — 请检查网络","vi":"Không thể kết nối — kiểm tra internet","id":"Tidak dapat terhubung — periksa internet Anda","ms":"Tidak dapat berhubung — semak internet anda"},
  money_h:{"my":"ကုန်ကျစရိတ်နှင့် လက်ကျန်ငွေ","en":"COST & BALANCE","shn":"ၵႃႈၸႂ်ႉၸၢႆႇ လႄႈ ငိုၼ်းလိူဝ်","kac":"Manu hte ngun ngam","th":"ค่าใช้จ่ายและยอดคงเหลือ","zh":"花费与余额","vi":"CHI PHÍ & SỐ DƯ","id":"BIAYA & SALDO","ms":"KOS & BAKI"},
  money_intro:{"my":"GENERATE တစ်ခါလုပ်တိုင်း RunningHub က ဖြတ်တဲ့ ငွေအမှန်ကို မှတ်ထားပါတယ် — ခန့်မှန်းချက် မဟုတ်ပါ။ လက်ကျန်ငွေကတော့ RunningHub အကောင့်ကနေ တိုက်ရိုက် ဆွဲယူတာပါ။","en":"Every GENERATE is booked at the amount RunningHub actually charged — not an estimate. The balance is read straight from your RunningHub account.","shn":"GENERATE ၵူႈပွၵ်ႈ RunningHub ဢဝ်ငိုၼ်းၵႃႈႁိုဝ် မၢႆဝႆႉတႄႉတႄႉ — ဢမ်ႇၸႂ်ႈလၢမ်း","kac":"GENERATE langai mi hpe RunningHub la ai gumhpraw teng teng hpe mahkrum da ai — myit yu ai n re","th":"ทุกครั้งที่ GENERATE จะบันทึกยอดที่ RunningHub เก็บจริง ไม่ใช่ค่าประมาณ ยอดคงเหลืออ่านจากบัญชี RunningHub โดยตรง","zh":"每次 GENERATE 都按 RunningHub 实际扣费记账，不是估算。余额直接从你的 RunningHub 账户读取。","vi":"Mỗi lần GENERATE được ghi sổ theo số tiền RunningHub thực sự thu — không phải ước tính. Số dư đọc thẳng từ tài khoản RunningHub.","id":"Setiap GENERATE dicatat sebesar yang benar-benar ditagih RunningHub — bukan perkiraan. Saldo dibaca langsung dari akun RunningHub Anda.","ms":"Setiap GENERATE direkod pada jumlah yang RunningHub benar-benar caj — bukan anggaran. Baki dibaca terus daripada akaun RunningHub anda."},
  money_bal:{"my":"လက်ကျန်","en":"Balance","shn":"ငိုၼ်းလိူဝ်","kac":"Ngam ai","th":"คงเหลือ","zh":"余额","vi":"Số dư","id":"Saldo","ms":"Baki"},
  money_today:{"my":"ဒီနေ့ ကုန်","en":"Spent today","shn":"မိူဝ်ႈၼႆႉ ၸႂ်ႉ","kac":"Dai ni jaw ai","th":"ใช้วันนี้","zh":"今日花费","vi":"Chi hôm nay","id":"Terpakai hari ini","ms":"Belanja hari ini"},
  money_month:{"my":"ဒီလ ကုန်","en":"Spent this month","shn":"လိူၼ်ၼႆႉ ၸႂ်ႉ","kac":"Dai shata jaw ai","th":"ใช้เดือนนี้","zh":"本月花费","vi":"Chi tháng này","id":"Terpakai bulan ini","ms":"Belanja bulan ini"},
  money_runs:{"my":"GENERATE အကြိမ်","en":"Generates","shn":"GENERATE ပွၵ်ႈ","kac":"Generate lang","th":"จำนวนครั้ง","zh":"生成次数","vi":"Lượt tạo","id":"Jumlah generate","ms":"Bilangan generate"},
  money_refresh:{"my":"လက်ကျန်ငွေ စစ်မယ်","en":"Check balance","shn":"တူၺ်းငိုၼ်းလိူဝ်","kac":"Ngun ngam yu na","th":"ตรวจยอดคงเหลือ","zh":"查询余额","vi":"Kiểm tra số dư","id":"Cek saldo","ms":"Semak baki"},
  money_runs_t:{"my":"GENERATE တစ်ခုချင်းစီရဲ့ ကုန်ကျစရိတ်","en":"What each GENERATE cost","shn":"GENERATE ၽႂ်မၼ်း ၵႃႈႁိုဝ်","kac":"Generate langai hpra manu","th":"ค่าใช้จ่ายของแต่ละครั้ง","zh":"每次生成的花费","vi":"Chi phí từng lần tạo","id":"Biaya tiap generate","ms":"Kos setiap generate"},
  money_never:{"my":"မစစ်ရသေးပါ","en":"never checked","shn":"ပႆႇလႆႈတူၺ်း","kac":"n yu shi ai","th":"ยังไม่เคยตรวจ","zh":"尚未查询","vi":"chưa kiểm tra","id":"belum dicek","ms":"belum disemak"},
  money_checked:{"my":"နောက်ဆုံးစစ်ချိန် — {T}","en":"last checked {T}","shn":"တူၺ်းလိုၼ်းသုတ်း — {T}","kac":"hpang jahtum yu ai {T}","th":"ตรวจล่าสุด {T}","zh":"最近查询 {T}","vi":"kiểm tra lần cuối {T}","id":"terakhir dicek {T}","ms":"disemak {T}"},
  money_queue:{"my":"အလုပ်လုပ်နေဆဲ {R} · စောင့်နေ {Q} · တစ်ပြိုင်နက် {L}","en":"{R} running · {Q} queued · limit {L}","shn":"ႁဵတ်းယူႇ {R} · ပႂ်ႉ {Q} · ႁူမ်ႈ {L}","kac":"{R} galaw nga · {Q} la nga · limit {L}","th":"กำลังทำ {R} · รอคิว {Q} · จำกัด {L}","zh":"运行中 {R} · 排队 {Q} · 并发上限 {L}","vi":"{R} đang chạy · {Q} chờ · giới hạn {L}","id":"{R} berjalan · {Q} antre · batas {L}","ms":"{R} berjalan · {Q} beratur · had {L}"},
  money_fail:{"my":"လက်ကျန်ငွေ မဆွဲယူနိုင်ပါ — အောက်က မှတ်တမ်းကတော့ မှန်နေဆဲပါ။ RunningHub ပြန်ဖြေတဲ့ အကြောင်းရင်း —","en":"Could not read the balance — the ledger below is still exact. RunningHub answered:","shn":"ဢမ်ႇလႆႈငိုၼ်းလိူဝ် — မၢႆတွင်းတႂ်ႈၼႆႉ ထုၵ်ႇမႅၼ်ႈယူႇ။ RunningHub တွပ်ႇဝႃႈ —","kac":"Ngun ngam n la lu — npu na mahkrum gaw teng nga ai. RunningHub tsun ai gaw:","th":"อ่านยอดคงเหลือไม่ได้ — บันทึกด้านล่างยังแม่นยำ RunningHub ตอบว่า:","zh":"无法读取余额 — 下方的账本仍然准确。RunningHub 的回应：","vi":"Không đọc được số dư — sổ chi bên dưới vẫn chính xác. RunningHub trả lời:","id":"Saldo tidak terbaca — buku di bawah tetap akurat. RunningHub menjawab:","ms":"Baki tidak dapat dibaca — lejar di bawah tetap tepat. RunningHub menjawab:"},
  money_nokey:{"my":"RunningHub key ထည့်ပြီးမှ လက်ကျန်ငွေ စစ်လို့ရပါမယ်။","en":"Save a RunningHub key first, then the balance can be read.","shn":"သႂ်ႇ RunningHub key ဢွၼ်တၢင်း ၸင်ႇတူၺ်းငိုၼ်းလိူဝ်လႆႈ","kac":"RunningHub key bang ngut jang ngun ngam yu lu na","th":"บันทึกคีย์ RunningHub ก่อน จึงจะอ่านยอดคงเหลือได้","zh":"先保存 RunningHub 密钥，才能查询余额。","vi":"Lưu khóa RunningHub trước thì mới đọc được số dư.","id":"Simpan kunci RunningHub dulu, baru saldo bisa dibaca.","ms":"Simpan kunci RunningHub dahulu, barulah baki boleh dibaca."},
  money_empty:{"my":"RunningHub GENERATE မလုပ်ရသေးပါ — တစ်ခါလုပ်တာနဲ့ ဒီမှာ ကုန်ကျစရိတ် ပေါ်လာပါမယ်။","en":"No RunningHub GENERATE yet — the first one will show its cost here.","shn":"ပႆႇလႆႈ GENERATE — ပွၵ်ႈဢွၼ်တၢင်း တေပေႃႇတီႈၼႆႈ","kac":"GENERATE n galaw shi ai — langai galaw jang ndai kaw pru na","th":"ยังไม่มี GENERATE — ครั้งแรกจะแสดงค่าใช้จ่ายที่นี่","zh":"还没有 RunningHub 生成 — 第一次的花费会显示在这里。","vi":"Chưa có lần GENERATE nào — lần đầu sẽ hiện chi phí ở đây.","id":"Belum ada GENERATE — yang pertama akan tampil biayanya di sini.","ms":"Belum ada GENERATE — yang pertama akan papar kosnya di sini."},
  money_unknown:{"my":"ကုန်ကျစရိတ် မပြပါ","en":"cost not reported","shn":"ဢမ်ႇပွင်ႇၵႃႈ","kac":"manu n tsun ai","th":"ไม่ได้แจ้งค่าใช้จ่าย","zh":"未报告费用","vi":"không báo chi phí","id":"biaya tidak dilaporkan","ms":"kos tidak dilaporkan"},
  money_trim:{"my":"အဟောင်း {N} ခုကို စာရင်းချုပ်ထဲ ပေါင်းထားပါတယ်","en":"{N} older runs folded into the lifetime total","shn":"ဢၼ်ၵဝ်ႇ {N} ႁူမ်ႈဝႆႉၼႂ်းသဵၼ်ႈ","kac":"{N} ba ai ni gaw lifetime hta bang da sai","th":"รวมงานเก่า {N} รายการไว้ในยอดสะสมแล้ว","zh":"较早的 {N} 次已并入累计总额","vi":"{N} lượt cũ đã gộp vào tổng tích lũy","id":"{N} run lama digabung ke total seumur hidup","ms":"{N} larian lama digabung ke jumlah keseluruhan"},
  money_all_short:{"my":"စုစုပေါင်း ကုန်ကျ","en":"Total charged","shn":"ႁူမ်ႈၸႂ်ႉ","kac":"yawng jaw ai","th":"รวมที่เก็บจริง","zh":"实际扣费合计","vi":"Tổng đã tính phí","id":"Total ditagih","ms":"Jumlah dicaj"},
  money_unrep:{"my":"အထဲက {N} ကြိမ်အတွက် RunningHub က ကုန်ကျစရိတ် မပြခဲ့ပါ","en":"{N} of these were run without RunningHub reporting a cost","shn":"ၼႂ်း {N} ပွၵ်ႈ RunningHub ဢမ်ႇပွင်ႇၵႃႈ","kac":"{N} lang gaw RunningHub manu n tsun ai","th":"ในจำนวนนี้ {N} ครั้ง RunningHub ไม่ได้แจ้งค่าใช้จ่าย","zh":"其中 {N} 次 RunningHub 未报告费用","vi":"{N} lượt trong số này RunningHub không báo chi phí","id":"{N} di antaranya tidak dilaporkan biayanya oleh RunningHub","ms":"{N} daripadanya tidak dilaporkan kosnya oleh RunningHub"},
  money_bymodel:{"my":"Model အလိုက်","en":"By model","shn":"ၸွမ်း Model","kac":"Model hte maren","th":"ตามโมเดล","zh":"按模型","vi":"Theo model","id":"Per model","ms":"Ikut model"},
  money_recent:{"my":"နောက်ဆုံး {N} ကြိမ်","en":"Last {N} runs","shn":"{N} ပွၵ်ႈလိုၼ်းသုတ်း","kac":"hpang jahtum {N} lang","th":"{N} ครั้งล่าสุด","zh":"最近 {N} 次","vi":"{N} lượt gần nhất","id":"{N} run terakhir","ms":"{N} larian terakhir"},
  money_more:{"my":"နောက်ထပ် {N} ကြိမ် — CSV မှာ အကုန်ပါပါတယ်","en":"{N} more — the CSV has every row","shn":"ထႅင်ႈ {N} ပွၵ်ႈ — CSV မီးၵူႈဢၼ်","kac":"{N} lang ngam — CSV hta yawng nga ai","th":"อีก {N} ครั้ง — ไฟล์ CSV มีครบทุกแถว","zh":"还有 {N} 次 — CSV 包含全部记录","vi":"còn {N} lượt — tệp CSV có đủ mọi dòng","id":"{N} lagi — CSV memuat semua baris","ms":"{N} lagi — CSV mengandungi semua baris"},
  money_csv:{"my":"CSV ထုတ်မယ်","en":"Export CSV","shn":"ဢွၵ်ႇ CSV","kac":"CSV shapraw","th":"ส่งออก CSV","zh":"导出 CSV","vi":"Xuất CSV","id":"Ekspor CSV","ms":"Eksport CSV"},
  money_clear:{"my":"မှတ်တမ်း ရှင်းမယ်","en":"Clear ledger","shn":"လၢင်ႉမၢႆတွင်း","kac":"Mahkrum kasin","th":"ล้างบันทึก","zh":"清空账本","vi":"Xóa sổ chi","id":"Hapus buku","ms":"Kosongkan lejar"},
  money_cleared:{"my":"မှတ်တမ်း ရှင်းပြီးပါပြီ","en":"Ledger cleared","shn":"လၢင်ႉမၢႆတွင်းယဝ်ႉ","kac":"Mahkrum kasin ngut sai","th":"ล้างบันทึกแล้ว","zh":"账本已清空","vi":"Đã xóa sổ chi","id":"Buku dihapus","ms":"Lejar dikosongkan"},
  money_all:{"my":"စုစုပေါင်း {N} ကြိမ် · {C}","en":"{N} runs all time · {C}","shn":"ႁူမ်ႈ {N} ပွၵ်ႈ · {C}","kac":"yawng {N} lang · {C}","th":"ทั้งหมด {N} ครั้ง · {C}","zh":"累计 {N} 次 · {C}","vi":"tổng {N} lượt · {C}","id":"total {N} run · {C}","ms":"jumlah {N} larian · {C}"},
  cost_ran:{"my":"ဒီ GENERATE က {C} ကုန်သွားပါတယ်","en":"That GENERATE cost {C}","shn":"GENERATE ၼႆႉ ၸႂ်ႉ {C}","kac":"Ndai GENERATE gaw {C} jaw sai","th":"GENERATE นี้ใช้ไป {C}","zh":"这次生成花费 {C}","vi":"Lần tạo này tốn {C}","id":"GENERATE itu memakan {C}","ms":"GENERATE itu memakan {C}"},
  cost_free_any:{"my":"အခမဲ့","en":"free","shn":"လၢႆလၢႆ","kac":"manu n ra","th":"ฟรี","zh":"免费","vi":"miễn phí","id":"gratis","ms":"percuma"},
  job_age_now:{"my":"ခုနလေးတင်","en":"just now","shn":"မိူဝ်ႈလဵဝ်","kac":"ya sha","th":"เมื่อครู่","zh":"刚刚","vi":"vừa xong","id":"barusan","ms":"sebentar tadi"},
  job_age_min:{"my":"{N} မိနစ်က","en":"{N} min ago","shn":"{N} မိၼိတ်ႉ ပူၼ်ႉမႃး","kac":"{N} minute yang","th":"{N} นาทีที่แล้ว","zh":"{N} 分钟前","vi":"{N} phút trước","id":"{N} mnt lalu","ms":"{N} min lalu"},
  job_age_hr:{"my":"{N} နာရီက","en":"{N} h ago","shn":"{N} ၸူဝ်ႈမူင်း ပူၼ်ႉမႃး","kac":"{N} ten yang","th":"{N} ชม.ที่แล้ว","zh":"{N} 小时前","vi":"{N} giờ trước","id":"{N} jam lalu","ms":"{N} jam lalu"},
  data_h:{"my":"DATA သိမ်းဆည်းမှု","en":"DATA & BACKUP","shn":"DATA လႄႈ BACKUP","kac":"DATA hte BACKUP","th":"ข้อมูลและสำรอง","zh":"数据与备份","vi":"Dữ liệu & sao lưu","id":"Data & cadangan","ms":"Data & sandaran"},
  data_export:{"my":"Backup ထုတ်မယ်","en":"Export backup","shn":"ဢွၵ်ႇ backup","kac":"Backup shapraw u","th":"ส่งออกสำรอง","zh":"导出备份","vi":"Xuất bản sao lưu","id":"Ekspor cadangan","ms":"Eksport sandaran"},
  data_import:{"my":"Backup ပြန်သွင်းမယ်","en":"Restore backup","shn":"သႂ်ႇၶိုၼ်း backup","kac":"Backup bai bang u","th":"กู้คืนสำรอง","zh":"恢复备份","vi":"Khôi phục sao lưu","id":"Pulihkan cadangan","ms":"Pulihkan sandaran"},
  data_exported:{"my":"Backup ဖိုင် ထုတ်ပြီးပါပြီ ✓ — ဖိုင်ကို လုံခြုံတဲ့နေရာမှာ သိမ်းထားပါ","en":"Backup exported ✓ — keep the file somewhere safe","shn":"ဢွၵ်ႇ backup ယဝ်ႉ ✓","kac":"Backup shapraw ngut sai ✓","th":"ส่งออกสำรองแล้ว ✓","zh":"备份已导出 ✓","vi":"Đã xuất bản sao lưu ✓","id":"Cadangan diekspor ✓","ms":"Sandaran dieksport ✓"},
  data_notbk:{"my":"ဒီဖိုင်က HNK backup ဖိုင် မဟုတ်ပါ","en":"That file is not an HNK backup","shn":"ၾၢႆႇၼႆႉ ဢမ်ႇၸႂ်ႈ HNK backup","kac":"Ndai file gaw HNK backup n re","th":"ไฟล์นี้ไม่ใช่สำรองของ HNK","zh":"该文件不是 HNK 备份","vi":"Tệp này không phải bản sao lưu HNK","id":"File itu bukan cadangan HNK","ms":"Fail itu bukan sandaran HNK"},
  data_nothing:{"my":"ဖိုင်ထဲမှာ ပြန်သွင်းစရာ မတွေ့ပါ","en":"Nothing restorable in that file","shn":"ဢမ်ႇမီးသင်တႃႇသႂ်ႇၶိုၼ်း","kac":"Bai bang na n nga ai","th":"ไม่มีอะไรให้กู้คืน","zh":"文件中没有可恢复内容","vi":"Không có gì để khôi phục","id":"Tidak ada yang bisa dipulihkan","ms":"Tiada apa untuk dipulihkan"},
  data_confirm:{"my":"Backup ထဲက setting {N} ခုကို ဒီ browser ထဲ ထည့်မယ် — လက်ရှိတန်ဖိုးတွေ အစားထိုးခံရမယ်။ ဆက်မလား?","en":"Restore {N} settings from the backup? Current values will be replaced.","shn":"သႂ်ႇၶိုၼ်း setting {N} ဢၼ်? ဢၼ်မီးယူႇတေထုၵ်ႇတႅၼ်း","kac":"Backup na setting {N} hpe bai bang na? Ya na ni hpe galai kau na","th":"กู้คืน {N} การตั้งค่า? ค่าปัจจุบันจะถูกแทนที่","zh":"恢复 {N} 项设置？当前值将被替换","vi":"Khôi phục {N} cài đặt? Giá trị hiện tại sẽ bị thay thế","id":"Pulihkan {N} pengaturan? Nilai saat ini akan diganti","ms":"Pulihkan {N} tetapan? Nilai semasa akan diganti"},
  data_total:{"my":"Setting စုစုပေါင်း","en":"Settings total","shn":"Setting တင်းမူတ်း","kac":"Setting yawng","th":"การตั้งค่ารวม","zh":"设置总量","vi":"Tổng cài đặt","id":"Total pengaturan","ms":"Jumlah tetapan"},
  data_photos:{"my":" ပုံ","en":" photos","shn":" ၶႅပ်း","kac":" sumla","th":" รูป","zh":" 张","vi":" ảnh","id":" foto","ms":" foto"},
  data_store:{"my":"plugin သိုလှောင်မှု","en":"plugin storage","shn":"သိုၵ်းၶေႃႈမုၼ်း plugin","kac":"plugin storage","th":"พื้นที่ปลั๊กอิน","zh":"插件存储","vi":"bộ nhớ plugin","id":"penyimpanan plugin","ms":"storan plugin"},
  plat_h2:{"my":"ဘယ်စက်မှာမဆို သုံးလို့ရတယ်","en":"Works on every device","shn":"ၸႂ်ႉလႆႈၼိူဝ်ၶိူင်ႈၵူႈဢၼ်","kac":"Jak shagu hta lang mai ai","th":"ใช้งานได้ทุกอุปกรณ์","zh":"任何设备都能用","vi":"Dùng được trên mọi thiết bị","id":"Berfungsi di semua perangkat","ms":"Berfungsi pada setiap peranti"},
  plat_p1:{"my":"Chrome နဲ့ဖွင့် → menu (⋮) → “Add to Home screen” / “Install app” → app icon နဲ့ တစ်ချက်နှိပ်ဖွင့်လို့ရပြီ။","en":"Open in Chrome → menu (⋮) → “Add to Home screen” / “Install app” → launch from an app icon.","shn":"ပိုတ်ႇလူၺ်ႈ Chrome → menu (⋮) → “Add to Home screen” / “Install app” → ၼဵၵ်း app icon သေ ပိုတ်ႇလႆႈၵမ်းလဵဝ်။","kac":"Chrome hte hpaw u → menu (⋮) → “Add to Home screen” / “Install app” → app icon kaw na hpaw mai sai.","th":"เปิดใน Chrome → เมนู (⋮) → “Add to Home screen” / “Install app” → เปิดใช้จากไอคอนแอปได้เลย.","zh":"用 Chrome 打开 → 菜单 (⋮) → “Add to Home screen” / “Install app” → 之后即可从 app 图标启动。","vi":"Mở bằng Chrome → menu (⋮) → “Add to Home screen” / “Install app” → khởi chạy từ icon ứng dụng.","id":"Buka di Chrome → menu (⋮) → “Add to Home screen” / “Install app” → luncurkan dari ikon aplikasi.","ms":"Buka dalam Chrome → menu (⋮) → “Add to Home screen” / “Install app” → lancarkan dari ikon app."},
  plat_p2:{"my":"Safari နဲ့ဖွင့် → Share (⬆︎) ခလုတ် → “Add to Home Screen” → home screen မှာ HNK icon ပေါ်လာမယ်။","en":"Open in Safari → Share (⬆︎) → “Add to Home Screen” → the HNK icon appears on your home screen.","shn":"ပိုတ်ႇလူၺ်ႈ Safari → ၼဵၵ်း Share (⬆︎) → “Add to Home Screen” → HNK icon တေဢွၵ်ႇမႃးၼိူဝ် home screen မႂ်း။","kac":"Safari hte hpaw u → Share (⬆︎) → “Add to Home Screen” → na a home screen kaw HNK icon pru wa na.","th":"เปิดใน Safari → Share (⬆︎) → “Add to Home Screen” → ไอคอน HNK จะปรากฏบนหน้าจอโฮมของคุณ.","zh":"用 Safari 打开 → Share (⬆︎) → “Add to Home Screen” → HNK 图标就会出现在主屏幕上。","vi":"Mở bằng Safari → Share (⬆︎) → “Add to Home Screen” → icon HNK xuất hiện trên màn hình chính.","id":"Buka di Safari → Share (⬆︎) → “Add to Home Screen” → ikon HNK muncul di home screen Anda.","ms":"Buka dalam Safari → Share (⬆︎) → “Add to Home Screen” → ikon HNK muncul pada skrin utama anda."},
  plat_p3:{"my":"Chrome / Edge မှာ address bar ညာဘက်က install (⊕) icon နှိပ်ရင် desktop app လို သီးသန့် window နဲ့ ပွင့်မယ်။","en":"In Chrome / Edge, click the install (⊕) icon in the address bar to run it as a desktop app.","shn":"ၼႂ်း Chrome / Edge ၼဵၵ်း install (⊕) icon ၽၢႆႇၶႂႃ address bar သေ ပိုတ်ႇလႆႈမိူၼ် desktop app ၼႂ်း window ႁင်းၶေႃ။","kac":"Chrome / Edge hta address bar na install (⊕) icon dip yang desktop app zawn window langai hte hpaw na.","th":"ใน Chrome / Edge คลิกไอคอน install (⊕) ในแถบที่อยู่เพื่อใช้งานเป็นแอปเดสก์ท็อป.","zh":"在 Chrome / Edge 中，点击地址栏右侧的 install (⊕) 图标，即可作为桌面 app 运行。","vi":"Trong Chrome / Edge, bấm icon install (⊕) trên thanh địa chỉ để chạy như ứng dụng desktop.","id":"Di Chrome / Edge, klik ikon install (⊕) di address bar untuk menjalankannya sebagai aplikasi desktop.","ms":"Dalam Chrome / Edge, klik ikon install (⊕) pada bar alamat untuk menjalankannya sebagai app desktop."},
  plat_p4:{"my":"CCX ဖိုင် download → double-click → Creative Cloud က install ပေးမယ် → Photoshop ထဲ Plugins → HNK Ai Panel။ RunningHub Enterprise engine · Layer တိုက်ရိုက်ထည့် · Retouch slider 50 အပြည့် — panel မှာသာ ရတယ်။","en":"Download the CCX → double-click → Creative Cloud installs it → Photoshop → Plugins → HNK Ai Panel. RunningHub Enterprise engine · direct layer placement · full 50-slider retouch — panel only.","shn":"Download ၾၢႆႇ CCX → double-click → Creative Cloud တေ install ပၼ် → ၼႂ်း Photoshop → Plugins → HNK Ai Panel။ RunningHub Enterprise engine · သႂ်ႇ Layer ၵမ်းသိုဝ်ႈ · Retouch slider 50 တဵမ်တဵမ် — လႆႈတီႈ panel ၵူၺ်း။","kac":"CCX download la → double-click → Creative Cloud install ya na → Photoshop → Plugins → HNK Ai Panel. RunningHub Enterprise engine · layer kaw direct bang · retouch slider 50 hpring tsup — panel kaw sha lu ai.","th":"ดาวน์โหลด CCX → ดับเบิลคลิก → Creative Cloud จะติดตั้งให้ → Photoshop → Plugins → HNK Ai Panel. เอนจิน RunningHub Enterprise · วาง layer ตรงเข้าไฟล์ · รีทัชครบ 50 slider — มีเฉพาะใน panel.","zh":"下载 CCX → 双击 → Creative Cloud 自动安装 → Photoshop → Plugins → HNK Ai Panel。RunningHub Enterprise engine · 图层直接置入 · 完整 50 滑杆精修 — 仅 panel 提供。","vi":"Tải file CCX → double-click → Creative Cloud sẽ cài đặt → Photoshop → Plugins → HNK Ai Panel. Engine RunningHub Enterprise · đặt layer trực tiếp · đủ 50 slider retouch — chỉ có trên panel.","id":"Download CCX → klik dua kali → Creative Cloud menginstalnya → Photoshop → Plugins → HNK Ai Panel. Engine RunningHub Enterprise · penempatan layer langsung · retouch 50 slider penuh — hanya di panel.","ms":"Muat turun CCX → klik dua kali → Creative Cloud memasangnya → Photoshop → Plugins → HNK Ai Panel. Enjin RunningHub Enterprise · peletakan layer terus · retouch 50-slider penuh — panel sahaja."},
  plat_ps:{"my":"Photoshop (Windows / Mac) — အင်္ဂါရပ် အပြည့်ဆုံး","en":"Photoshop (Windows / Mac) — fullest feature set","shn":"Photoshop (Windows / Mac) — feature တဵမ်ထူၼ်ႈသုတ်း","kac":"Photoshop (Windows / Mac) — feature hpring tsup dik","th":"Photoshop (Windows / Mac) — ฟีเจอร์ครบที่สุด","zh":"Photoshop (Windows / Mac) — 功能最全","vi":"Photoshop (Windows / Mac) — bộ tính năng đầy đủ nhất","id":"Photoshop (Windows / Mac) — fitur paling lengkap","ms":"Photoshop (Windows / Mac) — set ciri paling lengkap"},
  site_link:{"my":"Website ကြည့်ရန်","en":"View website","shn":"တူၺ်း Website","kac":"Website yu u","th":"ดูเว็บไซต์","zh":"查看网站","vi":"Xem website","id":"Lihat website","ms":"Lihat laman web"},
  share_h2:{"my":"မိတ်ဆွေတွေကို ဝေမျှရန်","en":"Share with friends","shn":"ၽႄႈပၼ်ဢူၺ်းၵေႃႉ","kac":"Manang ni hpe garan u","th":"แชร์ให้เพื่อน","zh":"分享给朋友","vi":"Chia sẻ với bạn bè","id":"Bagikan ke teman","ms":"Kongsi dengan rakan"},
  share_p:{"my":"Link ကို Messenger / Telegram / Viber ဘယ်မှာပို့ပို့ — HNK logo နဲ့ preview card လှလှလေး ပေါ်ပြီး နှိပ်လိုက်တာနဲ့ ဒီ app ထဲ တန်းရောက်မယ်။","en":"Paste the link anywhere — Messenger, Telegram, Viber — a beautiful HNK preview card appears, and one tap opens this app.","shn":"သူင်ႇ link တီႈလႂ်ၵေႃႈလႆႈ — preview card ႁၢင်ႈလီ တေဢွၵ်ႇမႃး၊ ၼဵၵ်းၺႃး ၶဝ်ႈ app ၵမ်းလဵဝ်","kac":"Link hpe gara kaw tim shagun u — preview card tsawm ai pru na, dip yang app hta shang na","th":"วางลิงก์ที่ไหนก็ได้ — จะขึ้นการ์ดพรีวิวสวย ๆ แตะแล้วเข้าแอปทันที","zh":"把链接粘贴到任何地方 — 会显示精美的预览卡片，点一下即可打开应用","vi":"Dán link ở bất cứ đâu — thẻ xem trước đẹp sẽ hiện ra, chạm là mở app","id":"Tempel tautan di mana saja — kartu pratinjau cantik muncul, sekali ketuk langsung buka","ms":"Tampal pautan di mana-mana — kad pratonton cantik muncul, satu ketikan terus buka"},
  share_btn:{"my":"Share Link","en":"Share Link","shn":"ၽႄႈ Link","kac":"Link garan","th":"แชร์ลิงก์","zh":"分享链接","vi":"Chia sẻ link","id":"Bagikan tautan","ms":"Kongsi pautan"},
  copy_btn:{"my":"Link ကူးယူ","en":"Copy Link","shn":"ၶူတ်ႉ Link","kac":"Link copy","th":"คัดลอกลิงก์","zh":"复制链接","vi":"Sao chép link","id":"Salin tautan","ms":"Salin pautan"},
  st_share_copied:{"my":"Link ကူးပြီး ✓ — ကြိုက်တဲ့နေရာ paste လုပ်ပို့ပါ","en":"Link copied ✓ — paste it wherever you like","shn":"ၶူတ်ႉ Link ယဝ်ႉ ✓ — paste တီႈလႂ်ၵေႃႈလႆႈ","kac":"Link copy sai ✓ — gara kaw mi paste bang u","th":"คัดลอกลิงก์แล้ว ✓ — วางที่ไหนก็ได้ตามใจ","zh":"链接已复制 ✓ — 可粘贴到任何地方","vi":"Đã sao chép link ✓ — dán ở bất cứ đâu bạn muốn","id":"Tautan disalin ✓ — tempel di mana saja","ms":"Pautan disalin ✓ — tampal di mana-mana"},
  about_h:{"my":"APP နဲ့ UPDATE","en":"APP & UPDATES","shn":"APP လႄႈ UPDATE","kac":"APP hte UPDATE","th":"แอปและอัปเดต","zh":"应用与更新","vi":"Ứng dụng & cập nhật","id":"Aplikasi & pembaruan","ms":"Aplikasi & kemas kini"},
  about_check:{"my":"Update စစ်မယ်","en":"Check for updates","shn":"ၶူၼ်ႉတူၺ်း update","kac":"Update sagawn u","th":"ตรวจหาอัปเดต","zh":"检查更新","vi":"Kiểm tra cập nhật","id":"Periksa pembaruan","ms":"Semak kemas kini"},
  about_cache:{"my":"Cache ရှင်း + ပြန်စမယ်","en":"Clear cache + restart","shn":"လၢင်ႉ cache + တႄႇၶိုၼ်း","kac":"Cache sausan nna bai hpang u","th":"ล้างแคช + เริ่มใหม่","zh":"清缓存并重启","vi":"Xóa cache + khởi động lại","id":"Bersihkan cache + mulai ulang","ms":"Kosongkan cache + mula semula"},
  about_checking:{"my":"စစ်နေသည်…","en":"Checking…","shn":"တိုၵ်ႉၶူၼ်ႉ…","kac":"Sagawn nga…","th":"กำลังตรวจ…","zh":"检查中…","vi":"Đang kiểm tra…","id":"Memeriksa…","ms":"Menyemak…"},
  about_new:{"my":"Version အသစ် v{V} ရှိတယ် — ဆွဲယူနေသည်…","en":"New version v{V} found — updating…","shn":"မီး version မႂ်ႇ v{V} — တိုၵ်ႉၸၼ်…","kac":"Version namsan v{V} nga ai — la nga…","th":"พบเวอร์ชันใหม่ v{V} — กำลังอัปเดต…","zh":"发现新版本 v{V} — 正在更新…","vi":"Có phiên bản mới v{V} — đang cập nhật…","id":"Versi baru v{V} ditemukan — memperbarui…","ms":"Versi baharu v{V} dijumpai — mengemas kini…"},
  about_uptodate:{"my":"နောက်ဆုံး version ဖြစ်နေပါပြီ ✓ (v{V})","en":"You are up to date ✓ (v{V})","shn":"ပဵၼ် version လိုၼ်းသုတ်းယဝ်ႉ ✓","kac":"Version hpang jahtum rai sai ✓","th":"เป็นเวอร์ชันล่าสุดแล้ว ✓","zh":"已是最新版本 ✓","vi":"Bạn đang dùng bản mới nhất ✓","id":"Sudah versi terbaru ✓","ms":"Sudah versi terkini ✓"},
  about_cache_confirm:{"my":"App cache အကုန်ရှင်းပြီး ပြန်စမယ် — Library ပုံတွေ ပြန်ဆွဲယူရမှာမို့ နည်းနည်းကြာနိုင်တယ်။ ဆက်မလား?","en":"Clear ALL app caches and restart? Library images will re-download, which can take a moment.","shn":"လၢင်ႉ cache တင်းမူတ်းသေ တႄႇၶိုၼ်း?","kac":"Cache yawng sausan nna bai hpang na?","th":"ล้างแคชทั้งหมดแล้วเริ่มใหม่?","zh":"清除全部缓存并重启？","vi":"Xóa toàn bộ cache và khởi động lại?","id":"Bersihkan semua cache dan mulai ulang?","ms":"Kosongkan semua cache dan mula semula?"},
  about_privacy:{"my":"ကိုယ်ရေးအချက်အလက် မူဝါဒ","en":"Privacy Policy","shn":"Privacy Policy","kac":"Privacy Policy","th":"นโยบายความเป็นส่วนตัว","zh":"隐私政策","vi":"Chính sách bảo mật","id":"Kebijakan Privasi","ms":"Dasar Privasi"},
  about_terms:{"my":"စည်းကမ်းချက်များ","en":"Terms of Service","shn":"Terms of Service","kac":"Terms of Service","th":"ข้อกำหนดการให้บริการ","zh":"服务条款","vi":"Điều khoản dịch vụ","id":"Ketentuan Layanan","ms":"Terma Perkhidmatan"},
  about_contact:{"my":"ဆက်သွယ်ရန်","en":"Contact","shn":"Contact","kac":"Contact","th":"ติดต่อ","zh":"联系我们","vi":"Liên hệ","id":"Kontak","ms":"Hubungi"}
};
/* the app's own lookup for Setup copy: SETUP_L[k] in the current language */
function sl(k) { const m = SETUP_L[k]; return m ? (ff9(m) || k) : k; }
/* app el(tag, cls, text) */
function sEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
/* app setSt(id, msg, kind): a card's own .status line */
function stSet(id, msg, kind) {
  const e = $(id);
  if (!e) return;
  e.textContent = msg == null ? "" : String(msg);
  e.className = "status" + (kind ? " " + kind : "");
}

/* ---------------- i18n (Myanmar + English, full parity) ---------------- */
/*I18N_START*/
const I18N = {
  /* ---- English (en) — 587 keys, complete ---- */
  en: {
    rh_err_network: "Could not reach RunningHub Enterprise \u2014 the line is down. Check your internet connection and try again.",
    rh_err_task_failed: "The RunningHub task failed \u2014 try a different prompt or photo.",
    rh_err_host_blocked: "Photoshop refused this host \u2014 the panel\u2019s manifest does not allow it. Install the newest panel build.",
    rh_err_timeout: "The generation took too long \u2014 RunningHub did not answer in time. Try again, or reduce the size or number of variants.",
    rh_err_rate_limited: "RunningHub Enterprise is busy right now \u2014 wait a moment and try again.",
    rh_err_invalid_key: "RunningHub refused the key \u2014 check it under Setup \u25b8 RunningHub Enterprise.",
    wf_exp_bg_replace: "Replaces the background behind your subject. Your person, pose, edges and lighting stay exactly the same \u2014 only what is behind them changes.",
    wf_exp_reference_transfer: "Takes a reference photo's whole scene (but NOT the people in it) and places YOUR subject into it \u2014 keeping your subject's identity, pose and framing, and matching the scene's light and perspective.",
    wf_exp_master_bgfg_replace: "The strictest subject-in-scene replacement: completely removes the person from your reference scene, naturally reconstructs the hidden background and foreground, then places your exact subject into that spot \u2014 identity, pose, proportions, hairstyle, outfit, skin and lighting locked from your photo, while the reference supplies only the scene, camera and depth.",
    wf_exp_subject_face: "Blends a referenced subject or face onto your base image seamlessly, keeping the base composition intact.",
    wf_exp_retouch: "Gives a natural retouch to skin, hair and tone. Your identity, features and expression are kept \u2014 no plastic skin, no face change.",
    wf_exp_upscale: "Upscales your image while restoring fine natural detail in skin, hair and fabric. Identity, pose, composition and colors stay exactly the same \u2014 no plastic smoothing.",
    wf_exp_object_edit: "Removes, replaces or adds objects using a controlled local edit. Everything you don't touch stays the same.",
    wf_exp_water_edit: "Adds or edits water, reflections and wet surfaces so they look physically natural, keeping your subject intact.",
    wf_exp_text_logo: "Adds or edits clean, legible text or a logo on the image while keeping the composition.",
    job_needkey: "Add your RunningHub key in Setup first",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    /* v6.47.0 — the member's own profile photo, set from Setup. The five
       strings the web app already ships for this are lifted verbatim so the
       two surfaces read alike; ava_working is the panel's own, because
       Photoshop has to open the picture and that is not instant the way the
       website's canvas is. */
    ava_change: "Change profile photo",
    ava_remove: "Remove photo",
    ava_saved: "Profile photo saved",
    ava_removed: "Photo removed",
    ava_fail: "That image could not be used — try another one",
    ava_working: "Preparing the photo…",
    /* v6.48.0 — the update fetches itself. What the button can and cannot
       do is stated on the card, not left for the customer to discover. */
    upd_web: "Opening the Web App — get the Panel from Account → Photoshop Panel there.",
    money_intro: "Every GENERATE is booked at the amount RunningHub actually charged — not an estimate. The balance is read straight from your RunningHub account.",
    money_bal: "Balance",
    money_refresh: "Check balance",
    money_nokey: "Save a RunningHub key first, then the balance can be read.",
    money_fail: "Could not read the balance — the ledger below is still exact. RunningHub answered:",
    money_never: "never checked",
    gate_sub_login: "Sign in with your HNK account to use this panel.",
    gate_email_ph: "Email",
    gate_pass_ph: "Password",
    gate_signin: "Log in",
    gate_checking: "Checking your plan…",
    gate_need: "Enter your email and password.",
    gate_bad: "Wrong email or password.",
    gate_wait: "Too many sign-in attempts — this is not a wrong password. Wait about 5 minutes and try again.",
    gate_busy: "The server is busy right now — wait a few seconds and press Log in again.",
    gate_offline: "No internet — your plan could not be checked. Connect, then press Check again.",
    gate_grace_gen: "Generating needs the internet. The panel is open on its last licence check, but this step has to reach the server.",
    gate_grace_tag: "not confirmed",
    gate_locked: "One payment covers both — the joining fee and the monthly fee open the web app AND this Photoshop panel. Buy or renew on the website, then press Check again.",
    gate_buy: "Open the website",
    gate_retry: "Check again",
    gate_signout: "Sign out",
    gate_days: "{D} days left",
    gate_grace: "No internet — the panel opened on the last licence check that got through. Connect to keep working past it.",
    gate_open_fail: "Could not open the browser. Address: {U}",
    gate_forgot: "Forgot password?",
    gate_session_ended: "Your session has ended — sign in again.",
    gate_acct_off: "This account is closed (suspended, banned or rejected) — ask your teacher.",
    gate_confirm: "This address is not confirmed yet — open the email we sent.",
    gate_gone: "This account no longer exists — ask your teacher.",
    gate_server: "The server had a problem — wait a moment and press Log in again.",
    gate_service_down: "The licence service cannot be reached — check your internet, then press Check again.",
    gate_no_lease: "The licence server returned no valid panel lease — press Check again.",
    gate_sent_as: "Sent as {E} · {N} characters",
    btn_show: "Show",
    btn_save: "Save",
    st_need_key: "Enter your RunningHub Enterprise key first",
    qual_auto: "Auto",
    btn_clear: "Clear",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "File",
    btn_ref_web: "Web",
    st_ref_layer_added: "Layer added as reference \u2713",
    st_photo_layer_added: "Layer added as the photo \u2713",
    st_ref_file_added: "File added as reference \u2713",
    st_importing: "Importing file",
    url_ph: "https://\u2026 image address or Pinterest pin link",
    btn_load: "Load",
    btn_cancel: "Cancel",
    btn_ok: "OK",
    wiz_promptnote: "The workflow's protected prompt is pre-filled — add anything extra (e.g. what background/text you want) at the top.",
    st_url_loading: "Downloading web image",
    st_ref_web_added: "Web image added as reference \u2713",
    st_url_bad: "Could not load an image from this URL \u2014 copy the image address and try again",
    no_layer: "No layer selected",
    st_web_import: "Imported to Photoshop as a layer \u2713",
    st_folder_ok: "Export folder set \u2713",
    st_exported: "Exported \u2713",
    st_export_fail: "Export failed \u2014 check the folder",
    st_img_bad: "Image data failed the integrity check \u2014 re-add the photo",
    st_auto_comp: "Auto Composite: IMAGE 1 subject \u2192 reference scene",
    create_ph: "Describe the image you want \u2014 e.g. a photorealistic portrait of a woman in a red dress standing in a garden at golden hour\u2026",
    btn_create_ps: "\u2b07 Send to Photoshop",
    btn_to_ref: "\u21ba Use as Ref 1",
    st_to_ref: "Result loaded into Ref 1 \u2713",
    cr_restyle: "\u267b Restyle result",
    cr_gal_empty: "No results yet \u2014 tap Generate.",
    cr_gal_have: "result(s) \u00b7 tap a thumbnail to preview / act on it",
    cr_save: "\u2b07 Save PNG",
    cr_need_result: "Generate an image first",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Scene presets from the Library \u2014 one tap",
    wf_scene_loading: "Loading the scene\u2026",
    wf_scene_fail: "Couldn\u2019t load this Library scene \u2014 check your internet.",
    vid_no_inline: "Clip {n} is ready — this Photoshop panel cannot play video. Download or Open plays it in your computer\u2019s player.",
    pick_title: "Choose",
    pick_search: "Search\u2026",
    pick_none: "Nothing matches",
    wf_ready_generate: "All required inputs are ready \u2014 press GENERATE.",
    wf_add_required: "Add the required images.",
    wf_press_prepare: "Press Prepare to load this workflow and check your images.",
    wf_opts: "Model \u00b7 Ratio \u00b7 Count \u00b7 Size",
    wf_model_auto: "Auto \u2014 the workflow's choice",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "Set at least one retouch slider or color first",
    cap_warn: "Photoshop limits this prompt box to:",
    btn_generate: "GENERATE",
    st_ready: "Ready",
    st_capture: "Capturing document",
    st_gen: "Generating\u2026",
    st_place: "Placing into Photoshop\u2026",
    st_placed_masked: "Placed as Layer + Mask group \u2014 original untouched \u2713",
    st_placed_plain: "Placed as a plain layer (mask/group unavailable on this host)",
    stage_queued: "Queued",
    stage_uploading: "Uploading",
    stage_generating: "Generating",
    stage_downloading: "Downloading",
    stage_placing: "Placing",
    st_done: "Done \u2713",
    st_err: "Error",
    st_no_doc: "No active document \u2014 open a photo first",
    st_no_prompt: "Prompt is empty",
    st_new_doc: "Result opened as a new document \u2713",
    ai_wb_match: "Match White Balance to the photo",
    wb_matched: "White balance matched ({n}%)",
    wb_already: "White balance already matched ({n}%)",
    before: "BEFORE",
    after: "AFTER",
    btn_place: "Place to Photoshop",
    st_saved: "Saved \u2713",
    lib_choose_msg: "Choose your HNK Reference Image Library folder.",
    lib_unsupported: "Unsupported image type",
    lib_restore_fail: "Reference could not be restored",
    on: "ON",
    off: "OFF",
    ai_settings_defaults: "AI Tools \u2014 Defaults",
    ai_key_lives_in_setup: "The RunningHub Enterprise key is managed on the Setup tab \u2014 saved once, used everywhere.",
    ai_history: "History",
    ai_no_gen: "No generations yet.",
    ai_videos: "Videos",
    ai_open: "Open",
    ai_rerun: "Re-run",
    ai_reuse: "Reuse",
    ai_clear_hist: "Clear history",
    ai_images: "IMAGES",
    ai_add_ref: "+ Add Reference Image",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "Describe what you want...",
    ai_model_output: "MODEL & OUTPUT",
    ai_model_note: "AI Tools has its own model/size settings, separate from the classic panel's Setup and Create tabs.",
    ai_auto_model: "Auto Model",
    ai_wf_tools: "Workflow Tools",
    ai_direct_gen: "Direct Generate",
    ai_identity_lock: "Identity Lock",
    ai_ref_transfer: "Reference Transfer",
    ai_req_images: "Required Images",
    ai_opt_images: "Optional Images",
    ai_model_lbl: "Model",
    ai_prepare: "Prepare (load & check)",
    ai_lib_bridge_off: "Library bridge unavailable on this host.",
    ai_lib_pick_first: "Pick a photo from the Presets tab \u2192 Visual Library first.",
    ai_lib_load_fail: "Library image could not be loaded.",
    ai_missing: "Missing",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 add a model endpoint (Advanced \u2014 optional)",
    ai_rh_note: "Built-in models already work with the key above \u2014 nothing to do. If a model shows \"not connected\" (its endpoint path isn't confirmed yet), copy the path from RunningHub's API docs and paste it here.",
    ai_rh_save: "Save this model's endpoint",
    ai_test_conn: "Test connection",
    ai_add_layers: "Add Results as New Layers",
    ai_done: "Done.",
    ai_result_ready: "Result ready.",
    ai_ready_nolayer: "Result ready (add-as-layer is off in Settings).",
    ai_place_failed: "Generated, but could not place into Photoshop.",
    ai_place_failed_fix: "Open a document, then re-run from History.",
    ai_placed_masked: "Placed into the \u201c{name}\u201d group as Layer + Mask \u2014 your original is untouched.",
    ai_placed_group: "Placed into the \u201c{name}\u201d group as a new layer (mask unavailable on this host).",
    ai_placed_plain: "Placed as a new layer (group/mask unavailable on this host).",
    ai_start_fail: "AI Tools failed to start",
    wfin_subject: "Your Photo (Subject)",
    wfin_new_bg: "New Background (optional)",
    wfin_ref_scene: "Reference Scene",
    wfin_style_ref: "Style Reference (optional)",
    wfin_target_scene: "Target Scene with Person",
    wfin_base: "Base Image",
    wfin_face_ref: "Face / Subject Reference",
    wfin_portrait: "Portrait",
    wfin_image: "Image",
    wfin_object_ref: "Object Reference (optional)",
    wfin_logo_ref: "Logo Reference (optional)",
  },
  /* ---- Burmese (my) — 587 keys, complete ---- */
  my: {
    rh_err_network: "RunningHub Enterprise ကို မရောက်ပါ — အင်တာနက် ပြတ်နေပါတယ်။ ချိတ်ဆက်မှုကို စစ်ပြီး ပြန်ကြိုးစားပါ။",
    rh_err_task_failed: "RunningHub task မအောင်မြင်ပါ — prompt ပြောင်းပြီး ပြန်စမ်းပါ",
    rh_err_host_blocked: "Photoshop က ဒီ host ကို ခွင့်မပြုပါ — panel manifest ထဲ မပါလို့ပါ။ Panel အသစ်ဆုံး ထည့်ပါ။",
    rh_err_timeout: "ပုံထုတ်တာ ကြာလွန်းပါတယ် — RunningHub က အချိန်မီ မဖြေပါ။ ပြန်ကြိုးစားပါ (သို့) အရွယ်အစား / အရေအတွက် လျှော့ပါ။",
    rh_err_rate_limited: "RunningHub Enterprise အလုပ်များနေပါတယ် — ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ။",
    rh_err_invalid_key: "RunningHub က key ကို လက်မခံပါ — Setup ▸ RunningHub Enterprise မှာ key ပြန်စစ်ပါ။",
    wf_exp_bg_replace: "\u101c\u1030\u1014\u1031\u102c\u1000\u103a\u1000 \u1014\u1031\u102c\u1000\u103a\u1001\u1036\u1000\u102d\u102f \u1021\u1005\u102c\u1038\u1011\u102d\u102f\u1038\u1015\u1031\u1038\u1010\u101a\u103a\u104b \u101c\u1030\u104a \u1000\u102d\u102f\u101a\u103a\u101f\u1014\u103a\u104a \u1021\u1014\u102c\u1038\u101e\u1010\u103a\u1014\u1032\u1037 \u1021\u101c\u1004\u103a\u1038\u1000 \u1021\u1010\u102d\u1021\u1000\u103b \u1019\u1015\u103c\u1031\u102c\u1004\u103a\u1038\u1018\u1032 \u1014\u1031\u102c\u1000\u103a\u1000\u103d\u101a\u103a\u1000\u1015\u1032 \u1015\u103c\u1031\u102c\u1004\u103a\u1038\u101e\u103d\u102c\u1038\u1019\u101a\u103a\u104b",
    wf_exp_reference_transfer: "Reference \u1015\u102f\u1036\u101b\u1032\u1037 scene \u1010\u1005\u103a\u1001\u102f\u101c\u102f\u1036\u1038\u1000\u102d\u102f \u101a\u1030\u1010\u101a\u103a (\u1012\u102b\u1015\u1031\u1019\u101a\u1037\u103a \u1021\u1011\u1032\u1000 \u101c\u1030\u1010\u103d\u1031\u1000\u102d\u102f \u1019\u101a\u1030\u1018\u1030\u1038)\u104a \u1015\u103c\u102e\u1038\u101b\u1004\u103a \u101e\u1004\u1037\u103a\u101c\u1030\u1000\u102d\u102f \u1011\u100a\u1037\u103a\u1015\u1031\u1038\u1010\u101a\u103a \u2014 \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u104a \u1000\u102d\u102f\u101a\u103a\u101f\u1014\u103a\u1014\u1032\u1037 frame \u1000\u102d\u102f \u1011\u102d\u1014\u103a\u1038\u1015\u103c\u102e\u1038 scene \u101b\u1032\u1037 \u1021\u101c\u1004\u103a\u1038\u1014\u1032\u1037 \u101b\u103e\u102f\u1011\u1031\u102c\u1004\u1037\u103a\u1000\u102d\u102f \u1000\u102d\u102f\u1000\u103a\u100a\u102e\u1021\u1031\u102c\u1004\u103a \u101c\u102f\u1015\u103a\u1015\u1031\u1038\u1010\u101a\u103a\u104b",
    wf_exp_master_bgfg_replace: "\u1021\u1010\u102d\u1000\u103b\u1006\u102f\u1036\u1038 subject-in-scene \u1021\u1005\u102c\u1038\u1011\u102d\u102f\u1038\u1019\u103e\u102f \u2014 reference scene \u1011\u1032\u1000 \u101c\u1030\u1000\u102d\u102f \u101c\u102f\u1036\u1038\u101d\u1016\u101a\u103a\u101b\u103e\u102c\u1038\u104a \u1000\u103d\u101a\u103a\u1014\u1031\u1010\u1032\u1037 \u1014\u1031\u102c\u1000\u103a\u1001\u1036\u1014\u1032\u1037 \u101b\u103e\u1031\u1037\u1001\u1036\u1000\u102d\u102f \u101e\u1018\u102c\u101d\u1000\u103b\u1000\u103b \u1015\u103c\u1014\u103a\u1010\u100a\u103a\u1006\u1031\u102c\u1000\u103a\u104a \u1015\u103c\u102e\u1038\u101b\u1004\u103a \u101e\u1004\u1037\u103a\u101c\u1030\u1000\u102d\u102f \u1021\u1032\u1012\u102e\u1014\u1031\u101b\u102c\u1019\u103e\u102c \u1021\u1010\u102d\u1021\u1000\u103b \u1011\u100a\u1037\u103a\u1015\u1031\u1038\u1010\u101a\u103a \u2014 \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u104a \u1000\u102d\u102f\u101a\u103a\u101f\u1014\u103a\u104a \u1021\u1001\u103b\u102d\u102f\u1038\u1021\u1005\u102c\u1038\u104a \u1006\u1036\u1015\u1004\u103a\u104a \u101d\u1010\u103a\u1005\u102f\u1036\u104a \u1021\u101e\u102c\u1038\u1021\u101b\u1031\u1014\u1032\u1037 \u1021\u101c\u1004\u103a\u1038\u1000 \u101e\u1004\u1037\u103a\u1015\u102f\u1036\u1000\u1014\u1031 \u101c\u1031\u102c\u1037\u1001\u103a\u1001\u103b\u1011\u102c\u1038\u1015\u103c\u102e\u1038 reference \u1000\u1010\u1031\u102c\u1037 scene\u104a \u1000\u1004\u103a\u1019\u101b\u102c\u1014\u1032\u1037 \u1021\u1014\u1000\u103a\u1000\u102d\u102f\u1015\u1032 \u1015\u1031\u1038\u1010\u101a\u103a\u104b",
    wf_exp_subject_face: "Reference \u1011\u1032\u1000 \u101c\u1030 (\u101e\u102d\u102f\u1037) \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u1000\u102d\u102f \u101e\u1004\u1037\u103a base \u1015\u102f\u1036\u1015\u1031\u102b\u103a \u1001\u103b\u1031\u102c\u1019\u103d\u1031\u1037\u1005\u103d\u102c \u1015\u1031\u102b\u1004\u103a\u1038\u1005\u1015\u103a\u1015\u1031\u1038\u1015\u103c\u102e\u1038 base \u101b\u1032\u1037 \u1016\u103d\u1032\u1037\u1005\u100a\u103a\u1038\u1015\u102f\u1036\u1000\u102d\u102f \u1019\u1011\u102d\u1001\u102d\u102f\u1000\u103a\u1005\u1031\u1015\u102b\u104b",
    wf_exp_retouch: "\u1021\u101e\u102c\u1038\u1021\u101b\u1031\u104a \u1006\u1036\u1015\u1004\u103a\u1014\u1032\u1037 \u1021\u101b\u1031\u102c\u1004\u103a\u1000\u102d\u102f \u101e\u1018\u102c\u101d\u1000\u103b\u1000\u103b \u1019\u103d\u1019\u103a\u1038\u1019\u1036\u1015\u1031\u1038\u1010\u101a\u103a\u104b \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u104a \u1021\u1004\u103a\u1039\u1002\u102b\u101b\u1015\u103a\u1014\u1032\u1037 \u1021\u1019\u1030\u1021\u101b\u102c\u1000 \u1021\u1010\u102d\u102f\u1004\u103a\u1038\u101b\u103e\u102d\u1014\u1031\u1019\u101a\u103a \u2014 \u1021\u101e\u102c\u1038\u1015\u101c\u1015\u103a\u1005\u1010\u1005\u103a \u1019\u1016\u103c\u1005\u103a\u104a \u1019\u103b\u1000\u103a\u1014\u103e\u102c \u1019\u1015\u103c\u1031\u102c\u1004\u103a\u1038\u104b",
    wf_exp_upscale: "\u1015\u102f\u1036\u1000\u102d\u102f \u1001\u103b\u1032\u1037\u1015\u1031\u1038\u101b\u1004\u103a\u1038 \u1021\u101e\u102c\u1038\u1021\u101b\u1031\u104a \u1006\u1036\u1015\u1004\u103a\u1014\u1032\u1037 \u1021\u1011\u100a\u103a\u101b\u1032\u1037 \u101e\u1018\u102c\u101d \u1021\u101e\u1031\u1038\u1005\u102d\u1010\u103a\u1000\u102d\u102f \u1015\u103c\u1014\u103a\u1016\u1031\u102c\u103a\u1015\u1031\u1038\u1010\u101a\u103a\u104b \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u104a \u1000\u102d\u102f\u101a\u103a\u101f\u1014\u103a\u104a \u1016\u103d\u1032\u1037\u1005\u100a\u103a\u1038\u1015\u102f\u1036\u1014\u1032\u1037 \u1021\u101b\u1031\u102c\u1004\u103a\u1010\u103d\u1031 \u1021\u1010\u102d\u1021\u1000\u103b \u1019\u1015\u103c\u1031\u102c\u1004\u103a\u1038 \u2014 \u1015\u101c\u1015\u103a\u1005\u1010\u1005\u103a\u1006\u1014\u103a\u1010\u1032\u1037 \u1001\u103b\u1031\u102c\u1019\u103d\u1031\u1037\u1019\u103e\u102f \u1019\u101b\u103e\u102d\u104b",
    wf_exp_object_edit: "\u1011\u102d\u1014\u103a\u1038\u1001\u103b\u102f\u1015\u103a\u1011\u102c\u1038\u1010\u1032\u1037 \u1014\u1031\u101b\u102c\u101c\u102d\u102f\u1000\u103a \u1015\u103c\u1004\u103a\u1006\u1004\u103a\u1019\u103e\u102f\u1014\u1032\u1037 \u1021\u101b\u102c\u101d\u1010\u1039\u1011\u102f\u1010\u103d\u1031\u1000\u102d\u102f \u1016\u101a\u103a\u104a \u101c\u1032 (\u101e\u102d\u102f\u1037) \u1011\u100a\u1037\u103a\u1015\u1031\u1038\u1010\u101a\u103a\u104b \u1019\u1011\u102d\u1010\u1032\u1037 \u1021\u101b\u102c\u1021\u102c\u1038\u101c\u102f\u1036\u1038 \u1021\u1010\u102d\u102f\u1004\u103a\u1038\u101b\u103e\u102d\u1014\u1031\u1019\u101a\u103a\u104b",
    wf_exp_water_edit: "\u101b\u1031\u104a \u101b\u1031\u102c\u1004\u103a\u1015\u103c\u1014\u103a\u101f\u1015\u103a\u1019\u103e\u102f\u1014\u1032\u1037 \u1005\u102d\u102f\u1005\u103d\u1010\u103a\u1010\u1032\u1037 \u1019\u103b\u1000\u103a\u1014\u103e\u102c\u1015\u103c\u1004\u103a\u1010\u103d\u1031\u1000\u102d\u102f \u101b\u1030\u1015\u1017\u1031\u1012\u1021\u101b \u101e\u1018\u102c\u101d\u1000\u103b\u1021\u1031\u102c\u1004\u103a \u1011\u100a\u1037\u103a/\u1015\u103c\u1004\u103a\u1015\u1031\u1038\u1015\u103c\u102e\u1038 \u101e\u1004\u1037\u103a\u101c\u1030\u1000\u102d\u102f \u1019\u1011\u102d\u1001\u102d\u102f\u1000\u103a\u1005\u1031\u1015\u102b\u104b",
    wf_exp_text_logo: "\u1015\u102f\u1036\u1015\u1031\u102b\u103a\u1019\u103e\u102c \u101e\u1014\u1037\u103a\u101b\u103e\u1004\u103a\u1038\u1015\u103c\u102e\u1038 \u1016\u1010\u103a\u101b\u101c\u103d\u101a\u103a\u1010\u1032\u1037 \u1005\u102c\u101e\u102c\u1038 (\u101e\u102d\u102f\u1037) logo \u1000\u102d\u102f \u1011\u100a\u1037\u103a/\u1015\u103c\u1004\u103a\u1015\u1031\u1038\u1015\u103c\u102e\u1038 \u1016\u103d\u1032\u1037\u1005\u100a\u103a\u1038\u1015\u102f\u1036\u1000\u102d\u102f \u1011\u102d\u1014\u103a\u1038\u1011\u102c\u1038\u1015\u102b\u1010\u101a\u103a\u104b",
    job_needkey: "RunningHub key ကို Setup မှာ အရင်ထည့်ပါ",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "ပရိုဖိုင်ပုံ ပြောင်းမယ်",
    ava_remove: "ပုံဖြုတ်မယ်",
    ava_saved: "ပရိုဖိုင်ပုံ သိမ်းပြီးပါပြီ",
    ava_removed: "ပုံဖြုတ်ပြီးပါပြီ",
    ava_fail: "ပုံကို သုံးလို့မရပါ — တခြားပုံတစ်ပုံ စမ်းကြည့်ပါ",
    ava_working: "ပုံ ပြင်ဆင်နေပါတယ်…",
    upd_web: "Web App ဖွင့်ပေးနေပါတယ် — Panel ကို Account → Photoshop Panel မှာ ယူပါ။",
    money_intro: "GENERATE တစ်ခါလုပ်တိုင်း RunningHub က ဖြတ်တဲ့ ငွေအမှန်ကို မှတ်ထားပါတယ် — ခန့်မှန်းချက် မဟုတ်ပါ။ လက်ကျန်ငွေကတော့ RunningHub အကောင့်ကနေ တိုက်ရိုက် ဆွဲယူတာပါ။",
    money_bal: "လက်ကျန်",
    money_refresh: "လက်ကျန်ငွေ စစ်မယ်",
    money_nokey: "RunningHub key ထည့်ပြီးမှ လက်ကျန်ငွေ စစ်လို့ရပါမယ်။",
    money_fail: "လက်ကျန်ငွေ မဆွဲယူနိုင်ပါ — အောက်က မှတ်တမ်းကတော့ မှန်နေဆဲပါ။ RunningHub ပြန်ဖြေတဲ့ အကြောင်းရင်း —",
    money_never: "မစစ်ရသေးပါ",
    gate_sub_login: "ဒီ panel ကို သုံးရန် သင့် HNK အကောင့်နဲ့ ဝင်ပါ။",
    gate_email_ph: "အီးမေးလ်",
    gate_pass_ph: "စကားဝှက်",
    gate_signin: "အကောင့် ဝင်ရန်",
    gate_checking: "သင့် plan ကို စစ်ဆေးနေပါတယ်…",
    gate_need: "အီးမေးလ်နဲ့ စကားဝှက် ထည့်ပါ။",
    gate_bad: "အီးမေးလ် ဒါမှမဟုတ် စကားဝှက် မှားနေပါတယ်။",
    gate_wait: "ဝင်ဖို့ ကြိုးစားတာ များနေပါပြီ — စကားဝှက် မှားလို့ မဟုတ်ပါ။ ၅ မိနစ်လောက် စောင့်ပြီး ပြန်ကြိုးစားပါ။",
    gate_busy: "server အလုပ်များနေပါတယ် — စက္ကန့်အနည်းငယ် စောင့်ပြီး ပြန်နှိပ်ပါ။",
    gate_offline: "အင်တာနက် မရှိပါ — plan ကို စစ်လို့ မရပါ။ ချိတ်ဆက်ပြီး ပြန်စစ်ပါ။",
    gate_grace_gen: "ပုံထုတ်ဖို့ အင်တာနက် လိုပါတယ်။ Panel ကို နောက်ဆုံးအဖြေနဲ့ ဖွင့်ထားပေမဲ့ ဒီအဆင့်က server ကို ရောက်ရပါမယ်။",
    gate_grace_tag: "အတည်မပြုရသေး",
    gate_locked: "တစ်ကြိမ်ပေးရင် နှစ်ခုလုံး ရပါတယ် — ဝင်ကြေးနဲ့ လစဉ်ကြေးဟာ web app နဲ့ ဒီ Photoshop panel နှစ်ခုလုံးအတွက် ဖြစ်ပါတယ်။ website မှာ ဝယ်ပါ ဒါမှမဟုတ် သက်တမ်းတိုးပြီး ပြန်စစ်ပါ။",
    gate_buy: "website ဖွင့်ရန်",
    gate_retry: "ပြန်စစ်ရန်",
    gate_signout: "ထွက်ရန်",
    gate_days: "{D} ရက် ကျန်",
    gate_grace: "အင်တာနက် မရှိပါ — နောက်ဆုံး စစ်လို့ရခဲ့တဲ့ အဖြေနဲ့ panel ကို ဖွင့်ထားပါတယ်။ ဆက်သုံးဖို့ အင်တာနက် ချိတ်ပါ။",
    gate_open_fail: "browser ဖွင့်လို့ မရပါ။ လိပ်စာ — {U}",
    gate_forgot: "စကားဝှက် မေ့နေလား?",
    gate_session_ended: "သင့် session ကုန်သွားပါပြီ — ပြန်ဝင်ပါ။ (စကားဝှက် မှားလို့ မဟုတ်ပါ)",
    gate_acct_off: "ဒီအကောင့်ကို ပိတ်ထားပါတယ် — ဆရာ့ကို ဆက်သွယ်ပါ။",
    gate_confirm: "အီးမေးလ်ကို အတည်မပြုရသေးပါ — ပို့ထားတဲ့ စာကို ဖွင့်ပါ။",
    gate_gone: "ဒီအကောင့် မရှိတော့ပါ — ဆရာ့ကို ဆက်သွယ်ပါ။",
    gate_server: "server မှာ ပြဿနာ ဖြစ်နေပါတယ် — ခဏနေပြီး ပြန်နှိပ်ပါ။ (စကားဝှက် မှားလို့ မဟုတ်ပါ)",
    gate_service_down: "လိုင်စင် server ကို မဆက်သွယ်နိုင်ပါ — အင်တာနက် စစ်ပြီး ပြန်စစ်ရန် နှိပ်ပါ။",
    gate_no_lease: "server က panel lease မှန်မှန် မပြန်ပါ — ပြန်စစ်ရန် နှိပ်ပါ။",
    gate_sent_as: "ပို့လိုက်တာ — {E} · {N} လုံး",
    btn_show: "\u1015\u103c",
    btn_save: "Save \u101e\u102d\u1019\u103a\u1038\u1019\u101a\u103a",
    st_need_key: "RunningHub Enterprise Key \u1021\u101b\u1004\u103a\u1011\u100a\u103a\u1015\u102b",
    qual_auto: "\u1021\u1031\u102c\u103a\u1010\u102d\u102f",
    btn_clear: "\u1016\u103b\u1000\u103a",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "\u1016\u102d\u102f\u1004\u103a",
    btn_ref_web: "Web",
    st_ref_layer_added: "Layer \u1000\u102d\u102f reference \u1021\u1016\u103c\u1005\u103a\u1011\u100a\u103a\u1015\u103c\u102e\u1038 \u2713",
    st_photo_layer_added: "Layer ကို ပုံအဖြစ် ထည့်ပြီ ✓",
    st_ref_file_added: "File \u1000\u102d\u102f reference \u1021\u1016\u103c\u1005\u103a\u1011\u100a\u103a\u1015\u103c\u102e\u1038 \u2713",
    st_importing: "File \u1016\u103d\u1004\u103a\u1037\u1014\u1031\u101e\u100a\u103a",
    url_ph: "https://\u2026 \u1015\u102f\u1036\u101c\u102d\u1015\u103a\u1005\u102c \u101e\u102d\u102f\u1037 Pinterest pin link",
    btn_load: "\u101a\u1030\u1019\u101a\u103a",
    btn_cancel: "\u1019\u101c\u102f\u1015\u103a\u1010\u1031\u102c\u1037",
    btn_ok: "အိုကေ",
    wiz_promptnote: "Workflow ရဲ့ protected prompt အသင့်ပါပြီးသား — ထပ်ဖြည့်ချင်တာ (ဥပမာ ဘယ်လိုနောက်ခံ/စာသား) အပေါ်ဆုံးမှာ ရေးထည့်လို့ရတယ်",
    st_url_loading: "Web \u1015\u102f\u1036 \u1006\u103d\u1032\u101a\u1030\u1014\u1031\u101e\u100a\u103a",
    st_ref_web_added: "Web \u1015\u102f\u1036\u1000\u102d\u102f reference \u1021\u1016\u103c\u1005\u103a\u1011\u100a\u103a\u1015\u103c\u102e\u1038 \u2713",
    st_url_bad: "\u1012\u102e URL \u1000\u1014\u1031 \u1015\u102f\u1036\u1019\u101b\u1015\u102b \u2014 \u1015\u102f\u1036\u1015\u1031\u102b\u103a Copy image address \u1014\u1032\u1037 \u1015\u103c\u1014\u103a\u1005\u1019\u103a\u1038\u1015\u102b",
    no_layer: "Layer \u101b\u103d\u1031\u1038\u1011\u102c\u1038\u1001\u103c\u1004\u103a\u1038\u1019\u101b\u103e\u102d\u1015\u102b",
    st_web_import: "Photoshop \u1011\u1032 layer \u1021\u1016\u103c\u1005\u103a \u101d\u1004\u103a\u1015\u103c\u102e\u1038 \u2713",
    st_folder_ok: "Export folder \u101b\u103d\u1031\u1038\u1015\u103c\u102e\u1038 \u2713",
    st_exported: "Export \u1015\u103c\u102e\u1038 \u2713",
    st_export_fail: "Export \u1019\u1021\u1031\u102c\u1004\u103a \u2014 folder \u1005\u1005\u103a\u1015\u102b",
    st_img_bad: "\u1015\u102f\u1036 data \u1005\u1005\u103a\u1006\u1031\u1038\u1019\u1021\u1031\u102c\u1004\u103a \u2014 \u1015\u102f\u1036\u1000\u102d\u102f \u1015\u103c\u1014\u103a\u1011\u100a\u1037\u103a\u1015\u102b",
    st_auto_comp: "Auto Composite: \u1015\u1004\u103a\u1010\u102d\u102f\u1004\u103a (IMAGE 1) \u2192 reference scene \u1011\u1032\u101e\u103d\u1004\u103a\u1038\u1014\u1031\u101e\u100a\u103a",
    create_ph: "\u1018\u101a\u103a\u101c\u102d\u102f \u1015\u102f\u1036\u1019\u103b\u102d\u102f\u1038 \u101c\u102d\u102f\u1001\u103b\u1004\u103a\u101c\u1032 \u1016\u1031\u102c\u103a\u1015\u103c\u1015\u102b \u2014 \u1025\u1015\u1019\u102c: a photorealistic portrait of a woman in a red dress standing in a garden at golden hour\u2026",
    btn_create_ps: "\u2b07 Photoshop \u1011\u1032\u1015\u102d\u102f\u1037",
    btn_to_ref: "\u21ba Ref 1 \u1021\u1016\u103c\u1005\u103a\u101e\u102f\u1036\u1038",
    st_to_ref: "\u101b\u101c\u1012\u103a\u1000\u102d\u102f Ref 1 \u1011\u1032\u1011\u100a\u1037\u103a\u1015\u103c\u102e\u1038 \u2713",
    cr_restyle: "\u267b \u101b\u101c\u1012\u103a\u1000\u102d\u102f Restyle",
    cr_gal_empty: "\u101b\u101c\u1012\u103a\u1019\u101b\u103e\u102d\u101e\u1031\u1038\u1015\u102b \u2014 Generate \u1014\u103e\u102d\u1015\u103a\u1015\u102b\u104b",
    cr_gal_have: "\u1001\u102f \u101b\u101c\u1012\u103a \u00b7 thumbnail \u1014\u103e\u102d\u1015\u103a\u1015\u103c\u102e\u1038 \u1000\u103c\u100a\u1037\u103a/\u1021\u101e\u102f\u1036\u1038\u1015\u103c\u102f\u1015\u102b",
    cr_save: "\u2b07 PNG \u101e\u102d\u1019\u103a\u1038",
    cr_need_result: "\u1021\u101b\u1004\u103a \u1015\u102f\u1036\u1010\u1005\u103a\u1015\u102f\u1036 Generate \u101c\u102f\u1015\u103a\u1015\u102b",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Library ထဲက Scene Preset — တစ်ချက်နှိပ်ရုံ",
    wf_scene_loading: "Scene ယူနေသည်…",
    wf_scene_fail: "Library ပုံ မယူနိုင်ပါ — အင်တာနက် စစ်ပါ",
    vid_no_inline: "ဗီဒီယို {n} အဆင်သင့်ပါ — Photoshop panel ထဲမှာ ဗီဒီယို ဖွင့်ကြည့်လို့ မရပါ။ Download သို့မဟုတ် Open နှိပ်ရင် ကွန်ပျူတာရဲ့ player နဲ့ ဖွင့်ပေးပါမယ်။",
    pick_title: "ရွေးပါ",
    pick_search: "ရှာရန်…",
    pick_none: "မတွေ့ပါ",
    wf_ready_generate: "လိုအပ်တဲ့ ပုံတွေ အဆင်သင့်ပါ — GENERATE နှိပ်ပါ။",
    wf_add_required: "လိုအပ်တဲ့ ပုံတွေ ထည့်ပါ။",
    wf_press_prepare: "ဒီ workflow ကို ဖွင့်ပြီး ပုံတွေ စစ်ဖို့ ပြင်ဆင် ခလုတ် နှိပ်ပါ။",
    wf_opts: "Model \u00b7 Ratio \u00b7 \u1021\u101b\u1031\u1021\u1010\u103d\u1000\u103a \u00b7 Size",
    wf_model_auto: "Auto \u2014 workflow \u101b\u1032\u1037 \u101b\u103d\u1031\u1038\u1001\u103b\u101a\u103a\u1019\u103e\u102f",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "Retouch slider / \u1021\u101b\u1031\u102c\u1004\u103a \u1010\u1005\u103a\u1001\u102f\u1021\u101b\u1004\u103a\u101b\u103d\u1031\u1038\u1015\u102b",
    cap_warn: "Prompt box \u1000\u102d\u102f Photoshop \u1000 \u1000\u1014\u1037\u103a\u101e\u1010\u103a\u1011\u102c\u1038:",
    btn_generate: "GENERATE",
    st_ready: "\u1021\u101e\u1004\u103a\u1037\u1016\u103c\u1005\u103a\u1015\u102b\u1015\u103c\u102e",
    st_capture: "Document \u1000\u102d\u102f \u1016\u1019\u103a\u1038\u101a\u1030\u1014\u1031\u101e\u100a\u103a",
    st_gen: "Generate \u101c\u102f\u1015\u103a\u1014\u1031\u101e\u100a\u103a\u2026",
    st_place: "Photoshop \u1011\u1032 \u1011\u100a\u103a\u1014\u1031\u101e\u100a\u103a\u2026",
    st_placed_masked: "Layer + Mask group \u1014\u1032\u1037 \u1011\u100a\u103a\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e \u2014 \u1019\u1030\u101b\u1004\u103a\u1038\u1015\u102f\u1036 \u1019\u1015\u103b\u1000\u103a\u1015\u102b \u2713",
    st_placed_plain: "\u101b\u102d\u102f\u1038\u101b\u102d\u102f\u1038 layer \u1021\u1016\u103c\u1005\u103a \u1011\u100a\u103a\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e (\u1012\u102e host \u1019\u103e\u102c mask/group \u1019\u101b\u1014\u102d\u102f\u1004\u103a\u1015\u102b)",
    stage_queued: "\u1010\u1014\u103a\u1038\u1005\u102e\u1014\u1031\u101e\u100a\u103a",
    stage_uploading: "\u1015\u102f\u1036\u1010\u1004\u103a\u1014\u1031\u101e\u100a\u103a",
    stage_generating: "\u1016\u1014\u103a\u1010\u102e\u1038\u1014\u1031\u101e\u100a\u103a",
    stage_downloading: "\u101b\u101c\u1012\u103a\u1006\u103d\u1032\u101a\u1030\u1014\u1031\u101e\u100a\u103a",
    stage_placing: "Photoshop \u1011\u1032 \u1011\u100a\u103a\u1014\u1031\u101e\u100a\u103a",
    st_done: "\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e \u2713",
    st_err: "Error",
    st_no_doc: "Document \u1016\u103d\u1004\u103a\u1037\u1011\u102c\u1038\u1001\u103c\u1004\u103a\u1038\u1019\u101b\u103e\u102d\u1015\u102b \u2014 \u1015\u102f\u1036\u1021\u101b\u1004\u103a\u1016\u103d\u1004\u103a\u1037\u1015\u102b",
    st_no_prompt: "Prompt \u1019\u101b\u1031\u1038\u101b\u101e\u1031\u1038\u1015\u102b",
    st_new_doc: "\u101b\u101c\u1012\u103a\u1000\u102d\u102f document \u1021\u101e\u1005\u103a\u1021\u1016\u103c\u1005\u103a \u1016\u103d\u1004\u103a\u1037\u1015\u103c\u102e\u1038 \u2713",
    ai_wb_match: "WB (\u1021\u101b\u1031\u102c\u1004\u103a\u1021\u101c\u1004\u103a\u1038) \u1000\u102d\u102f \u1019\u1030\u101b\u1004\u103a\u1038\u1015\u102f\u1036\u1014\u1032\u1037 \u1000\u102d\u102f\u1000\u103a\u1021\u1031\u102c\u1004\u103a \u100a\u103e\u102d",
    wb_matched: "WB (\u1021\u101b\u1031\u102c\u1004\u103a\u1021\u101c\u1004\u103a\u1038) \u1000\u102d\u102f\u1000\u103a\u100a\u102e\u1021\u1031\u102c\u1004\u103a \u100a\u103e\u102d\u1015\u103c\u102e\u1038 ({n}%)",
    wb_already: "WB \u1000\u102d\u102f\u1000\u103a\u100a\u102e\u1014\u1031\u1015\u103c\u102e\u1038\u101e\u102c\u1038 ({n}%)",
    before: "BEFORE",
    after: "AFTER",
    btn_place: "Photoshop \u1011\u1032\u1011\u100a\u103a",
    st_saved: "Save \u1015\u103c\u102e\u1038 \u2713",
    lib_choose_msg: "\u101e\u1004\u103a\u1037 HNK Reference \u1015\u102f\u1036 Library folder \u1000\u102d\u102f \u101b\u103d\u1031\u1038\u1015\u102b\u104b",
    lib_unsupported: "\u1019\u1015\u1036\u1037\u1015\u102d\u102f\u1038\u101e\u1031\u102c \u1015\u102f\u1036\u1021\u1019\u103b\u102d\u102f\u1038\u1021\u1005\u102c\u1038",
    lib_restore_fail: "Reference \u1000\u102d\u102f \u1015\u103c\u1014\u103a\u1019\u101b\u1014\u102d\u102f\u1004\u103a\u1015\u102b",
    on: "\u1016\u103d\u1004\u1037\u103a",
    off: "\u1015\u102d\u1010\u103a",
    ai_settings_defaults: "AI Tools \u2014 \u1019\u1030\u101e\u1031 Setting \u1019\u103b\u102c\u1038",
    ai_key_lives_in_setup: "RunningHub Enterprise key \u1000\u102d\u102f Setup tab \u1019\u103e\u102c \u1010\u1005\u103a\u1001\u102b\u1011\u100a\u1037\u103a\u101b\u102f\u1036\u1015\u102b \u2014 \u1014\u1031\u101b\u102c\u1010\u102d\u102f\u1004\u103a\u1038\u1019\u103e\u102c \u1021\u101c\u102d\u102f\u1021\u101c\u103b\u1031\u102c\u1000\u103a \u101e\u102f\u1036\u1038\u1015\u102b\u1019\u101a\u103a\u104b",
    ai_history: "\u1019\u103e\u1010\u103a\u1010\u1019\u103a\u1038",
    ai_no_gen: "\u1016\u1014\u103a\u1010\u102e\u1038\u1011\u102c\u1038\u1010\u102c \u1019\u101b\u103e\u102d\u101e\u1031\u1038\u1015\u102b\u104b",
    ai_videos: "ဗီဒီယိုများ",
    ai_open: "ဖွင့်",
    ai_rerun: "\u1015\u103c\u1014\u103a\u101c\u102f\u1015\u103a",
    ai_reuse: "\u1015\u103c\u1014\u103a\u101e\u102f\u1036\u1038",
    ai_clear_hist: "\u1019\u103e\u1010\u103a\u1010\u1019\u103a\u1038 \u101b\u103e\u1004\u103a\u1038\u101c\u1004\u103a\u1038",
    ai_images: "\u1015\u102f\u1036\u1019\u103b\u102c\u1038",
    ai_add_ref: "+ Reference \u1015\u102f\u1036 \u1011\u100a\u1037\u103a",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "\u1018\u102c\u101c\u102d\u102f\u1001\u103b\u1004\u103a\u101c\u1032 \u101b\u1031\u1038\u1015\u102b\u2026",
    ai_model_output: "MODEL \u1014\u103e\u1004\u1037\u103a OUTPUT",
    ai_model_note: "AI Tools \u1019\u103e\u102c \u1000\u102d\u102f\u101a\u103a\u1015\u102d\u102f\u1004\u103a model/size setting \u101b\u103e\u102d\u1015\u102b\u1010\u101a\u103a \u2014 Setup \u1014\u1032\u1037 Create tab \u1010\u103d\u1031\u1014\u1032\u1037 \u101e\u102e\u1038\u1001\u103c\u102c\u1038\u1015\u102b\u104b",
    ai_auto_model: "Model \u1021\u101c\u102d\u102f\u1021\u101c\u103b\u1031\u102c\u1000\u103a",
    ai_wf_tools: "Workflow \u1000\u102d\u101b\u102d\u101a\u102c\u1019\u103b\u102c\u1038",
    ai_direct_gen: "\u1010\u102d\u102f\u1000\u103a\u101b\u102d\u102f\u1000\u103a \u1016\u1014\u103a\u1010\u102e\u1038",
    ai_identity_lock: "\u1019\u103b\u1000\u103a\u1014\u103e\u102c \u101c\u1031\u102c\u1037\u1001\u103a",
    ai_ref_transfer: "Reference \u1000\u1030\u1038\u101a\u1030",
    ai_req_images: "\u101c\u102d\u102f\u1021\u1015\u103a\u101e\u1031\u102c \u1015\u102f\u1036\u1019\u103b\u102c\u1038",
    ai_opt_images: "\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b\u101e\u1031\u102c \u1015\u102f\u1036\u1019\u103b\u102c\u1038",
    ai_model_lbl: "Model",
    ai_prepare: "\u1015\u103c\u1004\u103a\u1006\u1004\u103a (\u1016\u103d\u1004\u1037\u103a\u1015\u103c\u102e\u1038 \u1005\u1005\u103a)",
    ai_lib_bridge_off: "\u1012\u102e host \u1019\u103e\u102c Library \u1001\u103b\u102d\u1010\u103a\u1006\u1000\u103a\u1019\u103e\u102f \u1019\u101b\u1014\u102d\u102f\u1004\u103a\u1015\u102b\u104b",
    ai_lib_pick_first: "Presets tab \u2192 Visual Library \u1000\u1014\u1031 \u1015\u102f\u1036\u1010\u1005\u103a\u1015\u102f\u1036 \u1021\u101b\u1004\u103a\u101b\u103d\u1031\u1038\u1015\u102b\u104b",
    ai_lib_load_fail: "Library \u1015\u102f\u1036\u1000\u102d\u102f \u1019\u1016\u103d\u1004\u1037\u103a\u1014\u102d\u102f\u1004\u103a\u1015\u102b\u104b",
    ai_missing: "\u1019\u101b\u103e\u102d\u101e\u1031\u1038",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 model endpoint \u1011\u100a\u1037\u103a\u101b\u1014\u103a (Advanced \u2014 \u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b)",
    ai_rh_note: "\u1015\u102b\u1015\u103c\u102e\u1038\u101e\u102c\u1038 model \u1010\u103d\u1031\u1000 \u1021\u1015\u1031\u102b\u103a\u1000 key \u1014\u1032\u1037 \u1021\u101c\u102f\u1015\u103a\u101c\u102f\u1015\u103a\u1015\u102b\u1015\u103c\u102e \u2014 \u1018\u102c\u1019\u103e\u101c\u102f\u1015\u103a\u1005\u101b\u102c \u1019\u101c\u102d\u102f\u1015\u102b\u104b model \u1010\u1005\u103a\u1001\u102f\u1000 \"not connected\" \u1015\u103c\u1014\u1031\u101b\u1004\u103a (endpoint path \u1019\u101e\u1031\u1001\u103b\u102c\u101e\u1031\u1038\u101c\u102d\u102f\u1037) RunningHub API docs \u1000\u1014\u1031 path \u1000\u102d\u102f \u1000\u1030\u1038\u1015\u103c\u102e\u1038 \u1012\u102e\u1019\u103e\u102c \u1011\u100a\u1037\u103a\u1015\u102b\u104b",
    ai_rh_save: "\u1012\u102e model \u101b\u1032\u1037 endpoint \u101e\u102d\u1019\u103a\u1038",
    ai_test_conn: "\u1001\u103b\u102d\u1010\u103a\u1006\u1000\u103a\u1019\u103e\u102f \u1005\u1005\u103a",
    ai_add_layers: "\u101b\u101c\u1012\u103a\u1000\u102d\u102f Layer \u1021\u101e\u1005\u103a\u1021\u1016\u103c\u1005\u103a \u1011\u100a\u1037\u103a",
    ai_done: "\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e\u104b",
    ai_result_ready: "\u101b\u101c\u1012\u103a \u1021\u101e\u1004\u1037\u103a\u1016\u103c\u1005\u103a\u1015\u102b\u1015\u103c\u102e\u104b",
    ai_ready_nolayer: "\u101b\u101c\u1012\u103a \u1021\u101e\u1004\u1037\u103a\u1016\u103c\u1005\u103a\u1015\u102b\u1015\u103c\u102e (Layer \u1021\u1016\u103c\u1005\u103a\u1011\u100a\u1037\u103a\u1001\u103c\u1004\u103a\u1038\u1000\u102d\u102f Settings \u1019\u103e\u102c \u1015\u102d\u1010\u103a\u1011\u102c\u1038\u1015\u102b\u1010\u101a\u103a)\u104b",
    ai_place_failed: "\u1016\u1014\u103a\u1010\u102e\u1038\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e\u104a \u1012\u102b\u1015\u1031\u1019\u101a\u1037\u103a Photoshop \u1011\u1032 \u1011\u100a\u1037\u103a\u104d \u1019\u101b\u1015\u102b\u104b",
    ai_place_failed_fix: "Document \u1010\u1005\u103a\u1001\u102f \u1016\u103d\u1004\u1037\u103a\u1015\u103c\u102e\u1038 History \u1000\u1014\u1031 \u1015\u103c\u1014\u103a\u101c\u102f\u1015\u103a\u1015\u102b\u104b",
    ai_placed_masked: "\u201c{name}\u201d group \u1011\u1032 Layer + Mask \u1021\u1016\u103c\u1005\u103a \u1011\u100a\u1037\u103a\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e \u2014 \u1019\u1030\u101b\u1004\u103a\u1038\u1015\u102f\u1036 \u1019\u1015\u103b\u1000\u103a\u1015\u102b\u104b",
    ai_placed_group: "\u201c{name}\u201d group \u1011\u1032 Layer \u1021\u101e\u1005\u103a\u1021\u1016\u103c\u1005\u103a \u1011\u100a\u1037\u103a\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e (\u1012\u102e host \u1019\u103e\u102c mask \u1019\u101b\u1014\u102d\u102f\u1004\u103a\u1015\u102b)\u104b",
    ai_placed_plain: "Layer \u1021\u101e\u1005\u103a\u1021\u1016\u103c\u1005\u103a \u1011\u100a\u1037\u103a\u1015\u103c\u102e\u1038\u1015\u102b\u1015\u103c\u102e (\u1012\u102e host \u1019\u103e\u102c group/mask \u1019\u101b\u1014\u102d\u102f\u1004\u103a\u1015\u102b)\u104b",
    ai_start_fail: "AI Tools \u1005\u1010\u1004\u103a\u104d \u1019\u101b\u1015\u102b",
    wfin_subject: "\u101e\u1004\u1037\u103a\u1015\u102f\u1036 (\u101c\u1030)",
    wfin_new_bg: "\u1014\u1031\u102c\u1000\u103a\u1001\u1036\u1021\u101e\u1005\u103a (\u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b)",
    wfin_ref_scene: "Reference scene",
    wfin_style_ref: "Style reference (\u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b)",
    wfin_target_scene: "\u101c\u1030\u1015\u102b\u101e\u1031\u102c target scene",
    wfin_base: "Base \u1015\u102f\u1036",
    wfin_face_ref: "\u1019\u103b\u1000\u103a\u1014\u103e\u102c / \u101c\u1030 reference",
    wfin_portrait: "\u101c\u1030\u1015\u102f\u1036",
    wfin_image: "\u1015\u102f\u1036",
    wfin_object_ref: "\u1021\u101b\u102c\u101d\u1010\u1039\u1011\u102f reference (\u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b)",
    wfin_logo_ref: "Logo reference (\u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b)",
  },
  /* ---- Shan (Tai Long) (shn) — 587 keys, complete ---- */
  shn: {
    rh_err_network: "ထိုင် RunningHub Enterprise ဢမ်ႇလႆႈ — ဢိၼ်ႇထႃႇၼႅတ်ႉၶၢတ်ႇ။ ၵူတ်ႇထတ်းလႅင်းသေ ၶိုၼ်းၸၢမ်း။",
    rh_err_task_failed: "RunningHub task ဢမ်ႇသေၽွင်ႈ — ၸၢမ်းလႅၵ်ႈ prompt",
    rh_err_host_blocked: "Photoshop ဢမ်ႇပၼ် host ၼႆႉ — ဢမ်ႇမီးၼႂ်း manifest panel။ သႂ်ႇ panel မႂ်ႇသုတ်း။",
    rh_err_timeout: "ႁဵတ်းႁၢင်ႈႁိုင်ပူၼ်ႉ — RunningHub ဢမ်ႇတွပ်ႇတၼ်း။ ၶိုၼ်းၸၢမ်း ဢမ်ႇၼၼ် လူတ်းယွမ်း ၶၼၢတ်ႈ / ၸမ်ႉ။",
    rh_err_rate_limited: "RunningHub Enterprise ယုင်ႈယူႇ — ပႂ်ႉၵမ်းၼိုင်ႈသေ ၶိုၼ်းၸၢမ်း။",
    rh_err_invalid_key: "RunningHub ဢမ်ႇႁပ်ႉ key — ၵူတ်ႇထတ်းတီႈ Setup ▸ RunningHub Enterprise။",
    wf_exp_bg_replace: "\u101c\u1085\u1075\u103a\u1088\u1015\u107c\u103a\u107d\u1062\u1086\u1087\u101c\u1004\u103a \u1022\u107c\u103a\u101a\u1030\u1087\u1010\u1062\u1004\u103a\u1038\u101c\u1004\u103a\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u104b \u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038, \u1078\u1083\u1087\u1010\u1083\u1087, \u1081\u102d\u1019\u103a\u1038\u1076\u103d\u1015\u103a\u1087 \u101c\u1084\u1088 \u107e\u1086\u1038 \u1022\u1019\u103a\u1087\u101c\u1085\u1075\u103a\u1088\u101e\u1004\u103a \u2014 \u101c\u1085\u1075\u103a\u1088\u1022\u107c\u103a\u101a\u1030\u1087\u1010\u1062\u1004\u103a\u1038\u101c\u1004\u103a\u1075\u1030\u107a\u103a\u1038\u104b",
    wf_exp_reference_transfer: "\u1022\u101d\u103a scene \u1010\u1004\u103a\u1038\u101e\u1035\u1004\u103a\u1088\u1076\u103d\u1004\u103a\u1076\u1085\u1015\u103a\u1038 reference (\u1075\u1030\u107a\u103a\u1038\u1075\u1083\u1088 \u1022\u1019\u103a\u1087\u1022\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u107c\u1082\u103a\u1038\u107c\u107c\u103a\u1089) \u101e\u1031 \u101e\u1082\u103a\u1087\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087\u1076\u101d\u103a\u1088 \u2014 \u101d\u1086\u1089\u107c\u1083\u1088\u1010\u1083, \u1078\u1083\u1087\u1010\u1083\u1087 \u101c\u1084\u1088 \u1076\u103d\u1015\u103a\u1087, \u1081\u1035\u1010\u103a\u1038\u1081\u1082\u103a\u1088\u1076\u101d\u103a\u1088\u1075\u107c\u103a\u1010\u1004\u103a\u1038\u107e\u1086\u1038\u101c\u1084\u1088\u1019\u102f\u1019\u103a\u1076\u103d\u1004\u103a scene\u104b",
    wf_exp_master_bgfg_replace: "\u101c\u103d\u1004\u103a\u1088\u101c\u1085\u1075\u103a\u1088\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u107c\u1082\u103a\u1038 scene \u1022\u107c\u103a\u1076\u1035\u1004\u103a\u1088\u101e\u102f\u1010\u103a\u1038 \u2014 \u1022\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u107c\u1082\u103a\u1038 scene reference \u1022\u103d\u1075\u103a\u1087\u1019\u1030\u1010\u103a\u1038, \u101e\u1062\u1004\u103a\u1088\u107d\u1062\u1086\u1087\u101c\u1004\u103a\u101c\u1084\u1088\u107d\u1062\u1086\u1087\u107c\u1083\u1088\u1022\u107c\u103a\u1019\u1030\u1075\u103a\u1038\u101d\u1086\u1089\u1076\u102d\u102f\u107c\u103a\u1038\u1081\u1082\u103a\u1088\u1019\u102d\u1030\u107c\u103a\u101e\u107d\u1083\u1087\u101d, \u101a\u101d\u103a\u1089\u101e\u1031 \u101e\u1082\u103a\u1087\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087\u1010\u102e\u1088\u107c\u107c\u103a\u1088\u1010\u1085\u1010\u103a\u1088\u1010\u1085\u1010\u103a\u1088 \u2014 \u107c\u1083\u1088\u1010\u1083, \u1078\u1083\u1087\u1010\u1083\u1087, \u1076\u107c\u1062\u1010\u103a\u1088, \u1076\u1030\u107c\u103a\u1081\u1030\u101d\u103a, \u1076\u1030\u101d\u103a\u1038\u107c\u102f\u1004\u103a\u1088, \u107d\u102d\u101d\u103a\u107c\u1004\u103a \u101c\u1084\u1088 \u107e\u1086\u1038 \u101c\u103d\u1075\u103a\u1089\u1022\u101d\u103a\u1010\u102e\u1088\u1076\u1085\u1015\u103a\u1038\u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087, reference \u1015\u107c\u103a\u1076\u102d\u102f\u107c\u103a\u1038 scene, \u1075\u103d\u1004\u103a\u1088\u1011\u1062\u1086\u1087 \u101c\u1084\u1088 \u101c\u103d\u1004\u103a\u1088\u101c\u102d\u102f\u1075\u103a\u1089\u1075\u1030\u107a\u103a\u1038\u104b",
    wf_exp_subject_face: "\u1022\u101d\u103a\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038 \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u107c\u1083\u1088\u1010\u1083\u107c\u1082\u103a\u1038 reference \u1081\u1030\u1019\u103a\u1088\u1076\u101d\u103a\u1088\u107c\u102d\u1030\u101d\u103a\u1076\u1085\u1015\u103a\u1038 base \u1081\u1082\u103a\u1088\u1019\u1030\u107c\u103a\u1038, \u101c\u103d\u1004\u103a\u1088\u1078\u1010\u103a\u1038 base \u1022\u1019\u103a\u1087\u101c\u102f\u1010\u103a\u1088\u104b",
    wf_exp_retouch: "\u1019\u1084\u1038\u107d\u102d\u101d\u103a\u107c\u1004\u103a, \u1076\u1030\u107c\u103a\u1081\u1030\u101d\u103a \u101c\u1084\u1088 \u101e\u102e \u1081\u1082\u103a\u1088\u101c\u102e\u1078\u103d\u1019\u103a\u1038\u101e\u107d\u1083\u1087\u101d\u104b \u107c\u1083\u1088\u1010\u1083, \u1081\u1062\u1004\u103a\u1088 \u101c\u1084\u1088 \u101c\u103d\u1004\u103a\u1088\u107c\u1084\u1078\u1082\u103a \u101d\u1086\u1089\u1078\u102d\u1030\u1004\u103a\u1089\u1075\u101d\u103a\u1087 \u2014 \u107d\u102d\u101d\u103a\u107c\u1004\u103a\u1022\u1019\u103a\u1087\u1015\u1035\u107c\u103a\u1015\u101c\u1083\u1087\u101e\u1010\u102d\u1075\u103a\u1089, \u107c\u1083\u1088\u1010\u1083\u1022\u1019\u103a\u1087\u101c\u1085\u1075\u103a\u1088\u104b",
    wf_exp_upscale: "\u1081\u1035\u1010\u103a\u1038\u1081\u1082\u103a\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u101a\u1082\u103a\u1087 \u1015\u1083\u1038\u1010\u1004\u103a\u1038\u1019\u1084\u1038\u1081\u1030\u101d\u103a\u101a\u103d\u1086\u1088\u1076\u103d\u1004\u103a\u107d\u102d\u101d\u103a\u107c\u1004\u103a, \u1076\u1030\u107c\u103a\u1081\u1030\u101d\u103a \u101c\u1084\u1088 \u107d\u1083\u1088 \u1076\u102d\u102f\u107c\u103a\u1038\u1081\u1082\u103a\u1088\u1019\u102d\u1030\u107c\u103a\u101e\u107d\u1083\u1087\u101d\u104b \u107c\u1083\u1088\u1010\u1083, \u1078\u1083\u1087\u1010\u1083\u1087, \u101c\u103d\u1004\u103a\u1088\u1078\u1010\u103a\u1038 \u101c\u1084\u1088 \u101e\u102e \u1022\u1019\u103a\u1087\u101c\u1085\u1075\u103a\u1088\u101e\u1004\u103a \u2014 \u1022\u1019\u103a\u1087\u1019\u1030\u107c\u103a\u1038\u1015\u1035\u107c\u103a\u1015\u101c\u1083\u1087\u101e\u1010\u102d\u1075\u103a\u1089\u104b",
    wf_exp_object_edit: "\u1022\u101d\u103a\u1022\u103d\u1075\u103a\u1087, \u101c\u1085\u1075\u103a\u1088 \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u101e\u1082\u103a\u1087\u1076\u1030\u101d\u103a\u1038\u1076\u103d\u1004\u103a \u101c\u1030\u107a\u103a\u1088\u101c\u103d\u1004\u103a\u1088\u1019\u1084\u1038\u1010\u102e\u1088\u101c\u1035\u101d\u103a\u1022\u107c\u103a\u1075\u102f\u1019\u103a\u1038\u101d\u1086\u1089\u104b \u1022\u107c\u103a\u1022\u1019\u103a\u1087\u1010\u102d\u102f\u1075\u103a\u1038 \u1010\u1004\u103a\u1038\u101e\u1035\u1004\u103a\u1088\u101d\u1086\u1089\u1078\u102d\u1030\u1004\u103a\u1089\u1075\u101d\u103a\u1087\u104b",
    wf_exp_water_edit: "\u101e\u1082\u103a\u1087 \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u1019\u1084\u1038\u107c\u1019\u103a\u1089, \u1004\u101d\u1083\u1087\u107c\u1019\u103a\u1089 \u101c\u1084\u1088 \u107c\u1083\u1088\u101c\u102d\u107c\u103a\u1022\u107c\u103a\u1015\u1035\u107c\u103a\u107c\u1019\u103a\u1089 \u1081\u1082\u103a\u1088\u1019\u102d\u1030\u107c\u103a\u1010\u1084\u1089, \u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038\u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087\u1022\u1019\u103a\u1087\u101c\u102f\u1010\u103a\u1088\u104b",
    wf_exp_text_logo: "\u101e\u1082\u103a\u1087 \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u1019\u1084\u1038\u101c\u102d\u1075\u103a\u1088 \u1022\u1019\u103a\u1087\u107c\u107c\u103a logo \u1022\u107c\u103a\u1019\u1030\u1010\u103a\u1038\u101e\u1082\u103a\u101c\u1030\u101c\u1086\u1088\u1004\u1062\u1086\u1088 \u107c\u102d\u1030\u101d\u103a\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088, \u101c\u103d\u1004\u103a\u1088\u1078\u1010\u103a\u1038\u101d\u1086\u1089\u1075\u101d\u103a\u1087\u104b",
    ai_key_lives_in_setup: "RunningHub Enterprise key ၸတ်းၵၢၼ်တီႈ Setup tab — သိမ်းၼိုင်ႈပွၵ်ႈ၊ ၸႂ်ႉလႆႈၵူႈတီႈ။",
    ai_settings_defaults: "AI Tools — ၵႃႈတင်ႈဝႆႉ",
    job_needkey: "သႂ်ႇ RunningHub key တီႈ Setup ဢွၼ်တၢင်း",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "လႅၵ်ႈႁၢင်ႈ Profile",
    ava_remove: "ထွၼ်ႁၢင်ႈ",
    ava_saved: "သိမ်းႁၢင်ႈယဝ်ႉ",
    ava_removed: "ထွၼ်ႁၢင်ႈယဝ်ႉ",
    ava_fail: "ဢမ်ႇၸႂ်ႉႁၢင်ႈၼႆႉလႆႈ — ၶိုၼ်းလိူၵ်ႈထႅင်ႈ",
    ava_working: "ႁၢင်ႈႁႅၼ်းႁၢင်ႈဝႆႉ…",
    upd_web: "ပိုတ်ႇ Web App — ဢဝ် Panel တီႈ Account → Photoshop Panel။",
    money_intro: "GENERATE ၵူႈပွၵ်ႈ RunningHub ဢဝ်ငိုၼ်းၵႃႈႁိုဝ် မၢႆဝႆႉတႄႉတႄႉ — ဢမ်ႇၸႂ်ႈလၢမ်း",
    money_bal: "ငိုၼ်းလိူဝ်",
    money_refresh: "တူၺ်းငိုၼ်းလိူဝ်",
    money_nokey: "သႂ်ႇ RunningHub key ဢွၼ်တၢင်း ၸင်ႇတူၺ်းငိုၼ်းလိူဝ်လႆႈ",
    money_fail: "ဢမ်ႇလႆႈငိုၼ်းလိူဝ် — မၢႆတွင်းတႂ်ႈၼႆႉ ထုၵ်ႇမႅၼ်ႈယူႇ။ RunningHub တွပ်ႇဝႃႈ —",
    money_never: "ပႆႇလႆႈတူၺ်း",
    gate_sub_login: "ၶဝ်ႈဢၶွင်ႉ HNK သူ ဢွၼ်တၢင်း သေ ၸႂ်ႉ panel ဢၼ်ၼႆႉ။",
    gate_email_ph: "ဢီးမေးလ်",
    gate_pass_ph: "ၶေႃႈလပ်ႉ",
    gate_signin: "ၶဝ်ႈဢၶွင်ႉ",
    gate_checking: "တိုၵ်ႉၵူတ်ႇထတ်းငဝ်းလၢႆးသူ…",
    gate_need: "သႂ်ႇ ဢီးမေးလ် လႄႈ ၶေႃႈလပ်ႉ",
    gate_bad: "ဢီးမေးလ် ဢမ်ႇၼၼ် ၶေႃႈလပ်ႉ ဢမ်ႇထုၵ်ႇ",
    gate_wait: "ၶဝ်ႈၸႂ်ႉတိုဝ်း ၼမ်ပူၼ်ႉ — ဢမ်ႇၸႂ်ႈၶေႃႈလပ်ႉၽိတ်း။ ပႂ်ႉ 5 မိၼိတ်ႉသေ ႁဵတ်းထႅင်ႈ။",
    gate_busy: "ၶိူင်ႈမေႃႈ ၵၢၼ်ၼမ်ဝႆႉ — ပႂ်ႉၵမ်းလဵဝ်သေ ၼဵၵ်းထႅင်ႈ။",
    gate_offline: "ဢမ်ႇမီးဢိၼ်ႇထႃႇၼႅတ်ႉ — ၵူတ်ႇထတ်းငဝ်းလၢႆးဢမ်ႇလႆႈ။ ၵပ်းသိုပ်ႇသေ ၵူတ်ႇထတ်းၶိုၼ်း။",
    gate_grace_gen: "ႁဵတ်းႁၢင်ႈလူဝ်ႇဢိၼ်ႇထႃႇၼႅတ်ႉ။ Panel ပိုတ်ႇလူၺ်ႈၶေႃႈတွပ်ႇလိုၼ်းသုတ်းသေတႃႉ ၶၵ်ႉတွၼ်ႈၼႆႉလူဝ်ႇထိုင် server။",
    gate_grace_tag: "ပႆႇယိုၼ်ယၼ်",
    gate_locked: "သိုဝ်ႉပွၵ်ႈလဵဝ် လႆႈသွင်ဢၼ် — ၵႃႈၶဝ်ႈ လႄႈ ၵႃႈလိူၼ် ပိုတ်ႇပၼ် web app လႄႈ Photoshop panel ဢၼ်ၼႆႉ သွင်ဢၼ်။ သိုဝ်ႉ ဢမ်ႇၼၼ် တေႃႇသိုပ်ႇ တီႈ website သေ ၵူတ်ႇထတ်းၶိုၼ်း။",
    gate_buy: "ပိုတ်ႇ website",
    gate_retry: "ၵူတ်ႇထတ်းၶိုၼ်း",
    gate_signout: "ဢွၵ်ႇ",
    gate_days: "ၵိုတ်း {D} ဝၼ်း",
    gate_grace: "ဢမ်ႇမီးဢိၼ်ႇထႃႇၼႅတ်ႉ — ပိုတ်ႇ panel လူၺ်ႈၶေႃႈတွပ်ႇလိုၼ်းသုတ်းဢၼ်လႆႈမႃး။ ၶႂ်ႈသိုပ်ႇၸႂ်ႉ ၵပ်းသိုပ်ႇဢိၼ်ႇထႃႇၼႅတ်ႉ။",
    gate_open_fail: "ပိုတ်ႇ browser ဢမ်ႇလႆႈ။ လိင်ႉ — {U}",
    gate_forgot: "လိုမ်းၶေႃႈလပ်ႉႁႃႉ?",
    gate_session_ended: "ငဝ်းလၢႆးၶဝ်ႈသူ သဵင်ႈယဝ်ႉ — ၶဝ်ႈၶိုၼ်း။",
    gate_acct_off: "ဢၶွင်ႉၼႆႉ ထုၵ်ႇပိၵ်ႉဝႆႉ — ၵပ်းသိုပ်ႇ ၶူးသွၼ်။",
    gate_confirm: "ဢီးမေးလ် ဢမ်ႇပႆႇယိုၼ်ယၼ် — ပိုတ်ႇလိၵ်ႈ ဢၼ်သူင်ႇဝႆႉ။",
    gate_gone: "ဢၶွင်ႉၼႆႉ ဢမ်ႇမီးယဝ်ႉ — ၵပ်းသိုပ်ႇ ၶူးသွၼ်။",
    gate_server: "ၶိူင်ႈမေႃႈ မီးပၼ်ႁႃ — ပႂ်ႉၵမ်းလဵဝ်သေ ၼဵၵ်းထႅင်ႈ။",
    gate_service_down: "ၵပ်းသိုပ်ႇ license server ဢမ်ႇလႆႈ — ၵူတ်ႇထတ်း ဢိၼ်ႇထႃႇၼႅတ်ႉသေ ၼဵၵ်းၶိုၼ်း။",
    gate_no_lease: "server ဢမ်ႇပၼ် panel lease — ၼဵၵ်းၵူတ်ႇထတ်းၶိုၼ်း။",
    gate_sent_as: "သူင်ႇ — {E} · {N} တူဝ်",
    btn_show: "\u107c\u1084",
    btn_save: "\u101e\u102d\u1019\u103a\u1038",
    st_need_key: "\u101e\u1082\u103a\u1087 RunningHub Enterprise key \u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038",
    qual_auto: "\u1081\u1004\u103a\u1038\u1075\u1030\u107a\u103a\u1038",
    btn_clear: "\u1019\u103d\u1010\u103a\u1087",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "\u107e\u1062\u1086\u1087",
    btn_ref_web: "Web",
    st_ref_layer_added: "\u101e\u1082\u103a\u1087 layer \u1015\u1035\u107c\u103a reference \u101a\u101d\u103a\u1089 \u2713",
    st_photo_layer_added: "သႂ်ႇ layer ပဵၼ်ႁၢင်ႈယဝ်ႉ ✓",
    st_ref_file_added: "\u101e\u1082\u103a\u1087\u107e\u1062\u1086\u1087 \u1015\u1035\u107c\u103a reference \u101a\u101d\u103a\u1089 \u2713",
    st_importing: "\u1010\u102d\u102f\u1075\u103a\u1089\u1076\u101d\u103a\u1088\u107e\u1062\u1086\u1087",
    url_ph: "https://\u2026 \u1022\u103d\u1004\u103a\u1088\u1010\u102e\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 \u1022\u1019\u103a\u1087\u107c\u107c\u103a link Pinterest",
    btn_load: "\u101c\u1030\u1010\u103a\u1087",
    btn_cancel: "\u1075\u102d\u102f\u1010\u103a\u1038",
    btn_ok: "OK",
    wiz_promptnote: "Protected prompt ၶွင် Workflow မီးဝႆႉယဝ်ႉ — ဢၼ်ၶႂ်ႈထႅမ် (ဥပမႃႇ ပိုၼ်ႉလင်/တူဝ်လိၵ်ႈ) တႅမ်ႈသႂ်ႇတီႈၼိူဝ်သုတ်းလႆႈ",
    st_url_loading: "\u1010\u102d\u102f\u1075\u103a\u1089\u1022\u101d\u103a\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1010\u102e\u1088 web",
    st_ref_web_added: "\u101e\u1082\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 web \u1015\u1035\u107c\u103a reference \u101a\u101d\u103a\u1089 \u2713",
    st_url_bad: "\u1022\u101d\u103a\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1010\u102e\u1088 URL \u107c\u1086\u1089\u1022\u1019\u103a\u1087\u101c\u1086\u1088 \u2014 \u1075\u1031\u1083\u1087\u1022\u103d\u1004\u103a\u1088\u1010\u102e\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u101e\u1031 \u1078\u1062\u1019\u103a\u1038\u1076\u102d\u102f\u107c\u103a\u1038",
    no_layer: "\u1015\u1086\u1087\u101c\u102d\u1030\u1075\u103a\u1088 layer",
    st_web_import: "\u1076\u101d\u103a\u1088 Photoshop \u1015\u1035\u107c\u103a layer \u101a\u101d\u103a\u1089 \u2713",
    st_folder_ok: "\u1019\u1075\u103a\u1038 folder export \u101a\u101d\u103a\u1089 \u2713",
    st_exported: "Export \u101a\u101d\u103a\u1089 \u2713",
    st_export_fail: "Export \u1022\u1019\u103a\u1087\u1015\u1035\u107c\u103a \u2014 \u1010\u1030\u107a\u103a\u1038 folder",
    st_img_bad: "\u1076\u1031\u1083\u1088\u1019\u102f\u107c\u103a\u1038\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 \u1022\u1019\u103a\u1087\u107d\u1062\u107c\u103a\u1087\u101c\u103d\u1004\u103a\u1088\u1010\u1085\u1010\u103a\u1088 \u2014 \u101e\u1082\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1076\u102d\u102f\u107c\u103a\u1038",
    st_auto_comp: "\u107d\u103d\u1019\u103a\u1089\u1081\u1004\u103a\u1038\u1075\u1030\u107a\u103a\u1038: \u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038 IMAGE 1 \u2192 scene reference",
    create_ph: "\u1010\u1085\u1019\u103a\u1088\u101d\u1083\u1088\u101c\u103d\u1004\u103a\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1022\u107c\u103a\u101c\u1030\u101d\u103a\u1087",
    btn_create_ps: "\u2b07 \u101e\u1030\u1004\u103a\u1087\u1011\u102d\u102f\u1004\u103a Photoshop",
    btn_to_ref: "\u21ba \u1078\u1082\u103a\u1089\u1015\u1035\u107c\u103a Ref 1",
    st_to_ref: "\u101e\u1082\u103a\u1087\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088\u1076\u101d\u103a\u1088 Ref 1 \u101a\u101d\u103a\u1089 \u2713",
    cr_restyle: "\u267b \u101c\u1085\u1075\u103a\u1088 style \u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088",
    cr_gal_empty: "\u1015\u1086\u1087\u1019\u102e\u1038\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088 \u2014 \u107c\u1035\u1075\u103a\u1038 Generate\u104b",
    cr_gal_have: "\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088 \u00b7 \u107c\u1035\u1075\u103a\u1038\u1076\u1085\u1015\u103a\u1038\u1022\u103d\u107c\u103a\u1087\u101e\u1031 \u1010\u1030\u107a\u103a\u1038 / \u1081\u1035\u1010\u103a\u1038\u101e\u1004\u103a",
    cr_save: "\u2b07 \u101e\u102d\u1019\u103a\u1038 PNG",
    cr_need_result: "\u101e\u1062\u1004\u103a\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Scene preset တီႈ Library — ၼဵၵ်းၵမ်းလဵဝ်",
    wf_scene_loading: "တိုၵ်ႉဢဝ် scene…",
    wf_scene_fail: "ဢဝ်ႁၢင်ႈ Library ဢမ်ႇလႆႈ — ၵူတ်ႇထတ်း internet",
    vid_no_inline: "ဝီးတီးဢူဝ်ႉ {n} ႁၢင်ႈႁႅၼ်းယဝ်ႉ — Photoshop panel ၼႆႉ ပိုတ်ႇတူၺ်းဝီးတီးဢူဝ်ႉ ဢမ်ႇလႆႈ။ Download ဢမ်ႇၼၼ် Open ၼဵၵ်းသေ player ၶွမ်း ပိုတ်ႇပၼ်။",
    pick_title: "လိူၵ်ႈ",
    pick_search: "သွၵ်ႈႁႃ…",
    pick_none: "ဢမ်ႇႁၼ်",
    wf_ready_generate: "ႁၢင်ႈဢၼ်လူဝ်ႇ ႁၢင်ႈႁႅၼ်းယဝ်ႉ — ၼဵၵ်း GENERATE။",
    wf_add_required: "သႂ်ႇႁၢင်ႈဢၼ်လူဝ်ႇ။",
    wf_press_prepare: "ၼဵၵ်း ႁၢင်ႈႁႅၼ်း သေ ပိုတ်ႇ workflow ၼႆႉလႄႈ ၵူတ်ႇထတ်းႁၢင်ႈ။",
    wf_opts: "Model \u00b7 Ratio \u00b7 \u1010\u1031\u1080\u1015\u1030\u1076\u1010\u102d\u1060 \u00b7 Size",
    wf_model_auto: "Auto \u2014 workflow \u101c\u102d\u1030\u1075\u1076\u1088\u1096",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "\u1019\u1084\u1038 slider \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u101e\u102e retouch \u1022\u107c\u103a\u107c\u102d\u102f\u1004\u103a\u1088\u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038",
    cap_warn: "Photoshop \u1081\u1062\u1019\u103a\u1088\u1081\u103d\u1004\u103a\u1088 prompt \u107c\u1086\u1089\u1010\u102e\u1088:",
    btn_generate: "GENERATE",
    st_ready: "\u1081\u1062\u1004\u103a\u1088\u1081\u1085\u107c\u103a\u1038\u101a\u101d\u103a\u1089",
    st_capture: "\u1010\u102d\u102f\u1075\u103a\u1089\u1022\u101d\u103a document",
    st_gen: "\u1010\u102d\u102f\u1075\u103a\u1089\u101e\u1062\u1004\u103a\u1088\u2026",
    st_place: "\u1010\u102d\u102f\u1075\u103a\u1089\u101e\u1082\u103a\u1087\u1076\u101d\u103a\u1088 Photoshop\u2026",
    st_placed_masked: "\u101e\u1082\u103a\u1087\u1015\u1035\u107c\u103a group Layer + Mask \u101a\u101d\u103a\u1089 \u2014 \u1076\u1085\u1015\u103a\u1038\u1015\u102d\u1030\u1004\u103a\u1087\u1022\u1019\u103a\u1087\u101c\u102f\u1010\u103a\u1088 \u2713",
    st_placed_plain: "\u101e\u1082\u103a\u1087\u1015\u1035\u107c\u103a layer \u1019\u102d\u1030\u101d\u103a\u1088 (\u107c\u102d\u1030\u101d\u103a host \u107c\u1086\u1089 mask/group \u1022\u1019\u103a\u1087\u101c\u1086\u1088)",
    stage_queued: "\u1015\u1082\u103a\u1089\u1011\u1085\u101d\u103a",
    stage_uploading: "\u1010\u1062\u1004\u103a\u1087\u1076\u102d\u102f\u107c\u103a\u1088",
    stage_generating: "\u1010\u102d\u102f\u1075\u103a\u1089\u101e\u1062\u1004\u103a\u1088",
    stage_downloading: "\u1022\u101d\u103a\u101c\u1030\u1004\u103a\u1038",
    stage_placing: "\u1010\u102d\u102f\u1075\u103a\u1089\u101e\u1082\u103a\u1087",
    st_done: "\u101a\u101d\u103a\u1089\u1010\u1030\u101d\u103a\u1088 \u2713",
    st_err: "\u107d\u102d\u1010\u103a\u1038",
    st_no_doc: "\u1022\u1019\u103a\u1087\u1019\u102e\u1038 document \u1015\u102d\u102f\u1010\u103a\u1087\u101d\u1086\u1089 \u2014 \u1015\u102d\u102f\u1010\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038",
    st_no_prompt: "Prompt \u1015\u101d\u103a\u1087\u101d\u1086\u1089",
    st_new_doc: "\u1015\u102d\u102f\u1010\u103a\u1087\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088\u1015\u1035\u107c\u103a document \u1019\u1082\u103a\u1087\u101a\u101d\u103a\u1089 \u2713",
    ai_wb_match: "\u1081\u1035\u1010\u103a\u1038\u1081\u1082\u103a\u1088 WB \u1019\u102d\u1030\u107c\u103a\u1081\u1062\u1004\u103a\u1088\u1078\u101d\u103a\u1088",
    wb_matched: "\u1081\u1035\u1010\u103a\u1038\u1081\u1082\u103a\u1088 WB \u1019\u102d\u1030\u107c\u103a\u1075\u107c\u103a\u101a\u101d\u103a\u1089 ({n}%)",
    wb_already: "WB \u1019\u102d\u1030\u107c\u103a\u1075\u107c\u103a\u101a\u1030\u1087\u101a\u101d\u103a\u1089 ({n}%)",
    before: "\u1075\u1030\u1088\u1015\u103d\u1075\u103a\u1088",
    after: "\u101d\u1062\u1086\u1038\u101c\u1004\u103a",
    btn_place: "\u101e\u1082\u103a\u1087\u1076\u101d\u103a\u1088 Photoshop",
    st_saved: "\u101e\u102d\u1019\u103a\u1038\u101a\u101d\u103a\u1089 \u2713",
    lib_choose_msg: "\u101c\u102d\u1030\u1075\u103a\u1088 folder Library \u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 Reference \u1076\u103d\u1004\u103a HNK \u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087\u104b",
    lib_unsupported: "\u1081\u1062\u1004\u103a\u1088\u1019\u1035\u101d\u103a\u1038\u107c\u1086\u1089\u1078\u1082\u103a\u1089\u1022\u1019\u103a\u1087\u101c\u1086\u1088",
    lib_restore_fail: "\u1019\u1084\u1038 reference \u1076\u102d\u102f\u107c\u103a\u1038\u1022\u1019\u103a\u1087\u101c\u1086\u1088",
    on: "\u1015\u102d\u102f\u1010\u103a\u1087",
    off: "\u1015\u102d\u1075\u103a\u1089",
    ai_history: "\u1019\u1062\u1086\u1010\u103d\u1004\u103a\u1038",
    ai_no_gen: "\u1015\u1086\u1087\u1019\u102e\u1038\u1022\u107c\u103a\u101e\u1062\u1004\u103a\u1088\u101d\u1086\u1089\u104b",
    ai_videos: "ဝီဒီရူဝ်ႈ",
    ai_open: "ပိုတ်ႇ",
    ai_rerun: "\u1081\u1035\u1010\u103a\u1038\u1076\u102d\u102f\u107c\u103a\u1038",
    ai_reuse: "\u1078\u1082\u103a\u1089\u1076\u102d\u102f\u107c\u103a\u1038",
    ai_clear_hist: "\u1019\u103d\u1010\u103a\u1087\u1019\u1062\u1086\u1010\u103d\u1004\u103a\u1038",
    ai_images: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088",
    ai_add_ref: "+ \u101e\u1082\u103a\u1087\u1076\u1085\u1015\u103a\u1038 Reference",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "\u1010\u1085\u1019\u103a\u1088\u101d\u1083\u1088 \u1076\u1082\u103a\u1088\u101c\u1086\u1088\u101e\u1004\u103a\u2026",
    ai_model_output: "MODEL \u101c\u1084\u1088 OUTPUT",
    ai_model_note: "AI Tools \u1019\u102e\u1038 model/size setting \u1081\u1004\u103a\u1038\u1076\u1031\u1083 \u2014 \u1022\u1019\u103a\u1087\u1078\u1082\u103a\u1088\u1022\u107c\u103a\u101c\u1035\u101d\u103a\u1075\u107c\u103a\u1010\u1004\u103a\u1038 Setup \u101c\u1084\u1088 Create tab\u104b",
    ai_auto_model: "Model \u1081\u1004\u103a\u1038\u1075\u1030\u107a\u103a\u1038",
    ai_wf_tools: "\u1076\u102d\u1030\u1004\u103a\u1088\u1019\u102d\u102f\u101d\u103a\u1038 Workflow",
    ai_direct_gen: "\u101e\u1062\u1004\u103a\u1088\u101e\u102d\u102f\u101d\u103a\u1088\u101e\u102d\u102f\u101d\u103a\u1088",
    ai_identity_lock: "\u101c\u103d\u1075\u103a\u1089\u107c\u1083\u1088\u1010\u1083",
    ai_ref_transfer: "\u1015\u102d\u107c\u103a\u1087 Reference",
    ai_req_images: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1022\u107c\u103a\u101c\u1030\u101d\u103a\u1087",
    ai_opt_images: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088",
    ai_model_lbl: "Model",
    ai_prepare: "\u1081\u1062\u1004\u103a\u1088\u1081\u1085\u107c\u103a\u1038 (\u1015\u102d\u102f\u1010\u103a\u1087\u101e\u1031 \u1010\u1085\u1010\u103a\u1088)",
    ai_lib_bridge_off: "\u107c\u102d\u1030\u101d\u103a host \u107c\u1086\u1089 Library \u1022\u1019\u103a\u1087\u1075\u1015\u103a\u1038\u101e\u102d\u102f\u1015\u103a\u1087\u101c\u1086\u1088\u104b",
    ai_lib_pick_first: "\u101c\u102d\u1030\u1075\u103a\u1088\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1010\u102e\u1088 Presets tab \u2192 Visual Library \u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038\u104b",
    ai_lib_load_fail: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 Library \u1015\u102d\u102f\u1010\u103a\u1087\u1022\u1019\u103a\u1087\u101c\u1086\u1088\u104b",
    ai_missing: "\u1015\u1086\u1087\u1019\u102e\u1038",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 \u101e\u1082\u103a\u1087 model endpoint (Advanced \u2014 \u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088)",
    ai_rh_note: "Model \u1022\u107c\u103a\u1015\u1083\u1038\u1019\u1083\u1038\u1078\u102d\u102f\u1004\u103a \u1078\u1082\u103a\u1089\u1010\u1004\u103a\u1038 key \u107c\u102d\u1030\u101d\u103a\u107c\u1086\u1089\u101c\u1086\u1088\u101a\u101d\u103a\u1089 \u2014 \u1022\u1019\u103a\u1087\u101c\u1030\u101d\u103a\u1087\u1081\u1035\u1010\u103a\u1038\u101e\u1004\u103a\u104b Model \u101c\u1082\u103a\u107c\u1084\u101d\u1083\u1088 \"not connected\" (endpoint path \u1015\u1086\u1087\u1010\u1085\u1010\u103a\u1088) \u1078\u102d\u102f\u1004\u103a \u1022\u101d\u103a path \u1010\u102e\u1088 RunningHub API docs \u101e\u1031 \u101e\u1082\u103a\u1087\u1010\u102e\u1088\u107c\u1086\u1088\u104b",
    ai_rh_save: "\u101e\u102d\u1019\u103a\u1038 endpoint \u1076\u103d\u1004\u103a model \u107c\u1086\u1089",
    ai_test_conn: "\u1010\u1085\u1010\u103a\u1088\u101c\u103d\u1004\u103a\u1088\u1075\u1015\u103a\u1038\u101e\u102d\u102f\u1015\u103a\u1087",
    ai_add_layers: "\u101e\u1082\u103a\u1087\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088\u1015\u1035\u107c\u103a Layer \u1019\u1082\u103a\u1087",
    ai_done: "\u101a\u101d\u103a\u1089\u1010\u1030\u101d\u103a\u1088\u104b",
    ai_result_ready: "\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088 \u1081\u1062\u1004\u103a\u1088\u1081\u1085\u107c\u103a\u1038\u101a\u101d\u103a\u1089\u104b",
    ai_ready_nolayer: "\u107d\u103d\u107c\u103a\u1038\u101c\u1086\u1088 \u1081\u1062\u1004\u103a\u1088\u1081\u1085\u107c\u103a\u1038\u101a\u101d\u103a\u1089 (\u101e\u1082\u103a\u1087\u1015\u1035\u107c\u103a Layer \u107c\u107c\u103a\u1089 \u1015\u102d\u1075\u103a\u1089\u101d\u1086\u1089\u1010\u102e\u1088 Settings)\u104b",
    ai_place_failed: "\u101e\u1062\u1004\u103a\u1088\u101a\u101d\u103a\u1089 \u1075\u1030\u107a\u103a\u1038\u1075\u1083\u1088 \u101e\u1082\u103a\u1087\u1076\u101d\u103a\u1088 Photoshop \u1022\u1019\u103a\u1087\u101c\u1086\u1088\u104b",
    ai_place_failed_fix: "\u1015\u102d\u102f\u1010\u103a\u1087 Document \u1022\u107c\u103a\u107c\u102d\u102f\u1004\u103a\u1088\u101e\u1031 \u1081\u1035\u1010\u103a\u1038\u1076\u102d\u102f\u107c\u103a\u1038\u1010\u102e\u1088 History\u104b",
    ai_placed_masked: "\u101e\u1082\u103a\u1087\u1076\u101d\u103a\u1088\u107c\u1082\u103a\u1038 group \u201c{name}\u201d \u1015\u1035\u107c\u103a Layer + Mask \u101a\u101d\u103a\u1089 \u2014 \u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1015\u102d\u1030\u1004\u103a\u1087 \u1022\u1019\u103a\u1087\u101c\u102f\u1010\u103a\u1088\u104b",
    ai_placed_group: "\u101e\u1082\u103a\u1087\u1076\u101d\u103a\u1088\u107c\u1082\u103a\u1038 group \u201c{name}\u201d \u1015\u1035\u107c\u103a Layer \u1019\u1082\u103a\u1087\u101a\u101d\u103a\u1089 (\u107c\u102d\u1030\u101d\u103a host \u107c\u1086\u1089 mask \u1022\u1019\u103a\u1087\u101c\u1086\u1088)\u104b",
    ai_placed_plain: "\u101e\u1082\u103a\u1087\u1015\u1035\u107c\u103a Layer \u1019\u1082\u103a\u1087\u101a\u101d\u103a\u1089 (\u107c\u102d\u1030\u101d\u103a host \u107c\u1086\u1089 group/mask \u1022\u1019\u103a\u1087\u101c\u1086\u1088)\u104b",
    ai_start_fail: "AI Tools \u1010\u1084\u1087\u1022\u1019\u103a\u1087\u101c\u1086\u1088",
    wfin_subject: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1078\u101d\u103a\u1088\u1075\u101d\u103a\u1087 (\u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038)",
    wfin_new_bg: "\u107d\u1062\u1086\u1087\u101c\u1004\u103a\u1019\u1082\u103a\u1087 (\u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088)",
    wfin_ref_scene: "Scene Reference",
    wfin_style_ref: "Style Reference (\u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088)",
    wfin_target_scene: "Scene \u1022\u107c\u103a\u1019\u102e\u1038\u1075\u1030\u107c\u103a\u1038",
    wfin_base: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 Base",
    wfin_face_ref: "Reference \u107c\u1083\u1088\u1010\u1083 / \u1010\u1030\u101d\u103a\u1075\u1030\u107c\u103a\u1038",
    wfin_portrait: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1075\u1030\u107c\u103a\u1038",
    wfin_image: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088",
    wfin_object_ref: "Reference \u1076\u1030\u101d\u103a\u1038\u1076\u103d\u1004\u103a (\u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088)",
    wfin_logo_ref: "Reference Logo (\u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088)",
  },
  /* ---- Jinghpaw (Kachin) (kac) — 587 keys, complete ---- */
  kac: {
    rh_err_network: "RunningHub Enterprise de n du lu ai — internet hten nga ai. Internet hpe yu nna bai chyam yu u.",
    rh_err_task_failed: "RunningHub task n byin ai — prompt shing nrai sumla galai kau nna bai chyam u",
    rh_err_host_blocked: "Photoshop gaw ndai host hpe n hkap la ai — panel manifest hta n rawng ai. Panel nnan htum bang u.",
    rh_err_timeout: "Sumla shapraw na na ai — RunningHub aten hta n htai ai. Bai chyam yu u, n rai yang kaba / nsen hpe yawm u.",
    rh_err_rate_limited: "RunningHub Enterprise bungli law nga ai — jahkring la nna bai chyam yu u.",
    rh_err_invalid_key: "RunningHub gaw key hpe n hkap la ai — Setup ▸ RunningHub Enterprise hta bai yu u.",
    wf_exp_bg_replace: "Na a masha a hpang maga hpe galai ya ai. Masha, pose, makau hte nhtoi gaw n galai ai \u2014 hpang maga sha galai ai.",
    wf_exp_reference_transfer: "Reference sumla a scene yawng hpe la ai (raitim shi kaw na masha ni gaw n la ai), nna NA a masha hpe dai kaw bang ya ai \u2014 myi man, pose hte frame jang da nna, scene a nhtoi hte ang hpe maren shatai ai.",
    wf_exp_master_bgfg_replace: "Scene kata masha galai ai lam kaw grau ngang dik ai: reference scene kaw na masha hpe hpring tsup shamat kau nna, makoi taw ai hpang maga hte shawng maga hpe sha-sha re bai galaw, dai hpang na a masha hpe dai shara kaw teng sha bang ya ai \u2014 myi man, pose, kaba kaji, kara, palawng, hpyi hte nhtoi gaw na a sumla kaw na lock da ai, reference gaw scene, camera hte sung ai lam sha jaw ai.",
    wf_exp_subject_face: "Reference kaw na masha shing nrai myi man hpe na a base sumla kaw sha-sha re jawm bang ya nna, base a hkum gaw n hkra ai.",
    wf_exp_retouch: "Hpyi, kara hte nsam hpe sha-sha re shatsawm ya ai. Na a myi man, hkum hte myit madun gaw jang da ai \u2014 hpyi plastic n byin, myi man n galai ai.",
    wf_exp_upscale: "Na a sumla hpe kaba shatai nna hpyi, kara hte palawng a sha-sha re atsawm lam ni hpe bai shapraw ya ai. Myi man, pose, hkum hte nsam gaw n galai ai \u2014 plastic zawn hpraw shatai ai n nga.",
    wf_exp_object_edit: "Shara mi kaw sha jaw ai lam hte rai ni hpe shamat, galai shing nrai bang ya ai. N hkra ai lam ni gaw yawng dai hku sha nga ai.",
    wf_exp_water_edit: "Hka, hka kaw dan ai lam hte madi ai shara ni hpe teng sha zawn byin hkra bang shing nrai jaw ya ai, na a masha gaw n hkra ai.",
    wf_exp_text_logo: "Sumla ntsa kaw san seng nna hti mai ai laika shing nrai logo hpe bang shing nrai jaw ya nna, hkum gaw jang da ai.",
    ai_key_lives_in_setup: "RunningHub Enterprise key hpe Setup tab kaw hkrang ai — kalang mi mahkai, shara shagu jailang.",
    ai_settings_defaults: "AI Tools — Default ni",
    job_needkey: "RunningHub key hpe Setup kaw shawng bang u",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "Profile sumla galai u",
    ava_remove: "Sumla shaw kau u",
    ava_saved: "Sumla makoi da sai",
    ava_removed: "Sumla shaw kau sai",
    ava_fail: "Ndai sumla n mai lang ai — kaga langai chyam yu u",
    ava_working: "Sumla hkyen nga ai…",
    upd_web: "Web App hpaw nga ai — Panel hpe Account → Photoshop Panel kaw la u.",
    money_intro: "GENERATE langai mi hpe RunningHub la ai gumhpraw teng teng hpe mahkrum da ai — myit yu ai n re",
    money_bal: "Ngam ai",
    money_refresh: "Ngun ngam yu na",
    money_nokey: "RunningHub key bang ngut jang ngun ngam yu lu na",
    money_fail: "Ngun ngam n la lu — npu na mahkrum gaw teng nga ai. RunningHub tsun ai gaw:",
    money_never: "n yu shi ai",
    gate_sub_login: "Ndai panel hpe lang na matu na a HNK account hte shang u.",
    gate_email_ph: "Email",
    gate_pass_ph: "Password",
    gate_signin: "Account shang u",
    gate_checking: "Na a plan hpe sawn yu nga ai…",
    gate_need: "Na a email hte password bang u.",
    gate_bad: "Email sh'ning password n hkrak ai",
    gate_wait: "Shang na matu grai law sai — password shut ai n re. Minute 5 daram la nna bai shakut u.",
    gate_busy: "Server bungli law taw ai — sekan kachyi la nna bai dip u.",
    gate_offline: "Internet n nga ai — plan hpe sawn yu n lu ai. Internet hkrum nna bai sawn yu u.",
    gate_grace_gen: "Sumla shapraw na matu internet ra ai. Panel gaw hpang jahtum na lam hte hpaw da tim, ndai lakang gaw server de du ra ai.",
    gate_grace_tag: "n masat shi ai",
    gate_locked: "Langai mari yang lahkawng lu ai — shawng mari hte shata shagu jarik gaw web app hte ndai Photoshop panel lahkawng hpe hpaw ya ai. Website kaw mari u n rai yang matut la nna, bai sawn yu u.",
    gate_buy: "Website hpaw u",
    gate_retry: "Bai sawn yu u",
    gate_signout: "Pru u",
    gate_days: "{D} ya ngam ai",
    gate_grace: "Internet n nga ai — panel gaw hpang jahtum lu san yu ai lam hte hpaw da ai. Matut galaw na matu internet hkrum u.",
    gate_open_fail: "Browser hpaw n lu ai. Address: {U}",
    gate_forgot: "Password malap kau sai i?",
    gate_session_ended: "Na a session htum sai — bai shang u.",
    gate_acct_off: "Ndai account hpe pat da ai — sara hpe san u.",
    gate_confirm: "Ndai email hpe n sha dat shi ai — anhte sa dat ai laika hpe hpaw u.",
    gate_gone: "Ndai account n nga sai — sara hpe san u.",
    gate_server: "Server hta jam jau nga ai — kachyi mi la nna bai dip u.",
    gate_service_down: "License server hte matut n lu ai — internet hpe yu nna bai dip u.",
    gate_no_lease: "Server panel lease n jaw ai — bai dip u.",
    gate_sent_as: "Sa dat ai — {E} · {N} letter",
    btn_show: "Madun",
    btn_save: "Makoi da",
    st_need_key: "Na a RunningHub Enterprise key hpe shawng bang u",
    qual_auto: "Shi hkrai",
    btn_clear: "Kasat kau",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "Laika daw",
    btn_ref_web: "Web",
    st_ref_layer_added: "Layer hpe reference hku bang sai \u2713",
    st_photo_layer_added: "Layer hpe sumla hku bang sai ✓",
    st_ref_file_added: "Laika daw hpe reference hku bang sai \u2713",
    st_importing: "Laika daw shang la nga ai",
    url_ph: "https://\u2026 sumla shara shing nrai Pinterest pin link",
    btn_load: "La",
    btn_cancel: "Hkring",
    btn_ok: "OK",
    wiz_promptnote: "Workflow a protected prompt gaw jahkrat da sai — jat mayu ai (ga shadawn hpang lam/laika) ntsa dik kaw ka bang mai ai",
    st_url_loading: "Web sumla hpe la nga ai",
    st_ref_web_added: "Web sumla hpe reference hku bang sai \u2713",
    st_url_bad: "Ndai URL kaw na sumla n lu la ai \u2014 sumla shara hpe copy nna bai chyam u",
    no_layer: "Layer n lata shi ai",
    st_web_import: "Photoshop kaw layer hku shang sai \u2713",
    st_folder_ok: "Export folder masat sai \u2713",
    st_exported: "Export ngut sai \u2713",
    st_export_fail: "Export n byin ai \u2014 folder hpe yu u",
    st_img_bad: "Sumla data gaw sawn yu ai lam n lai ai \u2014 sumla bai bang u",
    st_auto_comp: "Shi hkrai composite: IMAGE 1 masha \u2192 reference scene",
    create_ph: "Sumla n gara hku ra ai ni tsun dan u",
    btn_create_ps: "\u2b07 Photoshop de shagun",
    btn_to_ref: "\u21ba Ref 1 hku lang",
    st_to_ref: "Pru ai hpe Ref 1 kaw bang sai \u2713",
    cr_restyle: "\u267b Pru ai a style galai",
    cr_gal_empty: "Pru ai n nga shi ai \u2014 Generate dip u.",
    cr_gal_have: "pru ai \u00b7 sumla kachyi dip nna yu / galaw u",
    cr_save: "\u2b07 PNG makoi",
    cr_need_result: "Sumla langai shawng galaw u",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Library kaw na Scene preset — kalang dip u",
    wf_scene_loading: "Scene la nga ai…",
    wf_scene_fail: "Library sumla n la lu ai — internet yu u",
    vid_no_inline: "Video {n} hkrum sai — ndai Photoshop panel hta video n mai yu ai. Download (n)rai Open dip yang computer player hte pyaw ya na.",
    pick_title: "Lata u",
    pick_search: "Tam u…",
    pick_none: "N mu ai",
    wf_ready_generate: "Ra ai sumla ni hkrum sai — GENERATE dip u.",
    wf_add_required: "Ra ai sumla ni bang u.",
    wf_press_prepare: "Ndai workflow hpaw nna sumla ni jep na matu Prepare dip u.",
    wf_opts: "Model \u00b7 Ratio \u00b7 Hkum \u00b7 Size",
    wf_model_auto: "Auto \u2014 workflow a lata ai",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "Retouch slider shing nrai nsam langai mi shawng masat u",
    cap_warn: "Photoshop gaw ndai prompt kahtawng hpe ndai daram sha jaw ai:",
    btn_generate: "GENERATE",
    st_ready: "Hkyen sai",
    st_capture: "Document la nga ai",
    st_gen: "Galaw nga ai\u2026",
    st_place: "Photoshop kaw bang nga ai\u2026",
    st_placed_masked: "Layer + Mask group hku bang sai \u2014 shawng na sumla n hkra ai \u2713",
    st_placed_plain: "Layer hkum sha hku bang sai (ndai host kaw mask/group n lu ai)",
    stage_queued: "La nga ai",
    stage_uploading: "Tsun dat nga ai",
    stage_generating: "Galaw nga ai",
    stage_downloading: "La nga ai",
    stage_placing: "Bang nga ai",
    st_done: "Ngut sai \u2713",
    st_err: "Shut ai",
    st_no_doc: "Hpaw da ai document n nga ai \u2014 sumla shawng hpaw u",
    st_no_prompt: "Prompt kaw hpa n nga ai",
    st_new_doc: "Pru ai hpe document nnan hku hpaw sai \u2713",
    ai_wb_match: "White balance hpe sumla hte bung hkra galaw",
    wb_matched: "White balance bai jahkrak da sai ({n}%)",
    wb_already: "White balance hkrak taw nga sai ({n}%)",
    before: "SHAWNG",
    after: "HPANG",
    btn_place: "Photoshop kaw bang",
    st_saved: "Makoi da sai \u2713",
    lib_choose_msg: "Na a HNK Reference sumla Library folder hpe lata u.",
    lib_unsupported: "Ndai sumla amyu n lu lang ai",
    lib_restore_fail: "Reference bai la n lu ai",
    on: "HPAW",
    off: "PAT",
    ai_history: "Labau",
    ai_no_gen: "Galaw da ai n nga shi ai.",
    ai_videos: "Video ni",
    ai_open: "Hpaw",
    ai_rerun: "Bai galaw",
    ai_reuse: "Bai lang",
    ai_clear_hist: "Labau kasat kau",
    ai_images: "SUMLA NI",
    ai_add_ref: "+ Reference sumla bang",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "Hpa ra ai hpe tsun dan u\u2026",
    ai_model_output: "MODEL HTE OUTPUT",
    ai_model_note: "AI Tools gaw shi a model/size setting nga ai \u2014 Setup hte Create tab ni hte n bung ai.",
    ai_auto_model: "Model shi hkrai",
    ai_wf_tools: "Workflow arung arai",
    ai_direct_gen: "Ding di generate",
    ai_identity_lock: "Myi man lock",
    ai_ref_transfer: "Reference htawt ya",
    ai_req_images: "Ra ai sumla ni",
    ai_opt_images: "Bang mung mai ai sumla",
    ai_model_lbl: "Model",
    ai_prepare: "Hkyen (hpaw nna sawn)",
    ai_lib_bridge_off: "Ndai host kaw Library bridge n lu ai.",
    ai_lib_pick_first: "Presets tab \u2192 Visual Library kaw na sumla langai shawng lata u.",
    ai_lib_load_fail: "Library sumla hpe n hpaw lu ai.",
    ai_missing: "N nga shi ai",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 model endpoint bang (Advanced \u2014 n bang mung mai)",
    ai_rh_note: "Nlung ai model ni gaw ntsa na key hte galaw sai \u2014 hpa galaw ra ai n nga. Model langai \"not connected\" madun yang (endpoint path teng sha n chye shi ai), RunningHub API docs kaw na path hpe la nna ndai kaw bang u.",
    ai_rh_save: "Ndai model a endpoint makoi",
    ai_test_conn: "Matut lam sawn yu",
    ai_add_layers: "Pru ai lam hpe Layer nnan hku bang",
    ai_done: "Ngut sai.",
    ai_result_ready: "Pru ai lam hkyen sai.",
    ai_ready_nolayer: "Pru ai lam hkyen sai (Layer hku bang ai lam gaw Settings kaw pat da ai).",
    ai_place_failed: "Galaw ngut sai, raitim Photoshop kaw n lu bang ai.",
    ai_place_failed_fix: "Document langai hpaw nna History kaw na bai galaw u.",
    ai_placed_masked: "\u201c{name}\u201d group kaw Layer + Mask hku bang ngut sai \u2014 nang a shawng na sumla n hkra ai.",
    ai_placed_group: "\u201c{name}\u201d group kaw Layer nnan hku bang ngut sai (ndai host kaw mask n lu ai).",
    ai_placed_plain: "Layer nnan hku bang ngut sai (ndai host kaw group/mask n lu ai).",
    ai_start_fail: "AI Tools n hpang lu ai",
    wfin_subject: "Na a sumla (masha)",
    wfin_new_bg: "Hpang maga nnan (n bang mung mai)",
    wfin_ref_scene: "Reference scene",
    wfin_style_ref: "Style reference (n bang mung mai)",
    wfin_target_scene: "Masha lawm ai target scene",
    wfin_base: "Base sumla",
    wfin_face_ref: "Myi man / masha reference",
    wfin_portrait: "Masha sumla",
    wfin_image: "Sumla",
    wfin_object_ref: "Rai reference (n bang mung mai)",
    wfin_logo_ref: "Logo reference (n bang mung mai)",
  },
  /* ---- Thai (th) — 587 keys, complete ---- */
  th: {
    rh_err_network: "เชื่อมต่อ RunningHub Enterprise ไม่ได้ — อินเทอร์เน็ตขาด ตรวจสอบการเชื่อมต่อแล้วลองใหม่",
    rh_err_task_failed: "งาน RunningHub ล้มเหลว — ลองเปลี่ยน prompt หรือรูป",
    rh_err_host_blocked: "Photoshop ปฏิเสธโฮสต์นี้ — ไม่อยู่ใน manifest ของแผง ติดตั้งแผงเวอร์ชันล่าสุด",
    rh_err_timeout: "สร้างภาพนานเกินไป — RunningHub ไม่ตอบทันเวลา ลองใหม่ หรือลดขนาด / จำนวนภาพ",
    rh_err_rate_limited: "RunningHub Enterprise กำลังยุ่ง — รอสักครู่แล้วลองใหม่",
    rh_err_invalid_key: "RunningHub ไม่รับคีย์นี้ — ตรวจสอบที่ Setup ▸ RunningHub Enterprise",
    wf_exp_bg_replace: "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e14\u0e49\u0e32\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a \u0e15\u0e31\u0e27\u0e04\u0e19 \u0e17\u0e48\u0e32\u0e17\u0e32\u0e07 \u0e02\u0e2d\u0e1a\u0e20\u0e32\u0e1e \u0e41\u0e25\u0e30\u0e41\u0e2a\u0e07\u0e22\u0e31\u0e07\u0e04\u0e07\u0e40\u0e14\u0e34\u0e21\u0e17\u0e38\u0e01\u0e2d\u0e22\u0e48\u0e32\u0e07 \u2014 \u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e14\u0e49\u0e32\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
    wf_exp_reference_transfer: "\u0e19\u0e33\u0e09\u0e32\u0e01\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14\u0e02\u0e2d\u0e07\u0e20\u0e32\u0e1e reference \u0e21\u0e32\u0e43\u0e0a\u0e49 (\u0e41\u0e15\u0e48\u0e44\u0e21\u0e48\u0e40\u0e2d\u0e32\u0e04\u0e19\u0e43\u0e19\u0e20\u0e32\u0e1e) \u0e41\u0e25\u0e49\u0e27\u0e27\u0e32\u0e07\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e25\u0e07\u0e44\u0e1b \u2014 \u0e04\u0e07\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 \u0e17\u0e48\u0e32\u0e17\u0e32\u0e07 \u0e41\u0e25\u0e30\u0e40\u0e1f\u0e23\u0e21\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e44\u0e27\u0e49 \u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e1b\u0e23\u0e31\u0e1a\u0e43\u0e2b\u0e49\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e1a\u0e41\u0e2a\u0e07\u0e41\u0e25\u0e30\u0e21\u0e38\u0e21\u0e21\u0e2d\u0e07\u0e02\u0e2d\u0e07\u0e09\u0e32\u0e01",
    wf_exp_master_bgfg_replace: "\u0e01\u0e32\u0e23\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a\u0e43\u0e19\u0e09\u0e32\u0e01\u0e17\u0e35\u0e48\u0e40\u0e02\u0e49\u0e21\u0e07\u0e27\u0e14\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14: \u0e25\u0e1a\u0e04\u0e19\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e09\u0e32\u0e01 reference \u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14 \u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e41\u0e25\u0e30\u0e09\u0e32\u0e01\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01\u0e1a\u0e31\u0e07\u0e02\u0e36\u0e49\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e40\u0e1b\u0e47\u0e19\u0e18\u0e23\u0e23\u0e21\u0e0a\u0e32\u0e15\u0e34 \u0e41\u0e25\u0e49\u0e27\u0e27\u0e32\u0e07\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e25\u0e07\u0e15\u0e23\u0e07\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e19\u0e31\u0e49\u0e19\u0e1e\u0e2d\u0e14\u0e35 \u2014 \u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 \u0e17\u0e48\u0e32\u0e17\u0e32\u0e07 \u0e2a\u0e31\u0e14\u0e2a\u0e48\u0e27\u0e19 \u0e17\u0e23\u0e07\u0e1c\u0e21 \u0e40\u0e2a\u0e37\u0e49\u0e2d\u0e1c\u0e49\u0e32 \u0e1c\u0e34\u0e27 \u0e41\u0e25\u0e30\u0e41\u0e2a\u0e07 \u0e16\u0e39\u0e01\u0e25\u0e47\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e20\u0e32\u0e1e\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13 \u0e2a\u0e48\u0e27\u0e19 reference \u0e43\u0e2b\u0e49\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e09\u0e32\u0e01 \u0e21\u0e38\u0e21\u0e01\u0e25\u0e49\u0e2d\u0e07 \u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e25\u0e36\u0e01\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
    wf_exp_subject_face: "\u0e1c\u0e2a\u0e32\u0e19\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a\u0e2b\u0e23\u0e37\u0e2d\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e32\u0e01 reference \u0e25\u0e07\u0e1a\u0e19\u0e20\u0e32\u0e1e base \u0e2d\u0e22\u0e48\u0e32\u0e07\u0e41\u0e19\u0e1a\u0e40\u0e19\u0e35\u0e22\u0e19 \u0e42\u0e14\u0e22\u0e04\u0e07\u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e02\u0e2d\u0e07\u0e20\u0e32\u0e1e base \u0e44\u0e27\u0e49",
    wf_exp_retouch: "\u0e23\u0e35\u0e17\u0e31\u0e0a\u0e1c\u0e34\u0e27 \u0e1c\u0e21 \u0e41\u0e25\u0e30\u0e42\u0e17\u0e19\u0e2a\u0e35\u0e43\u0e2b\u0e49\u0e14\u0e39\u0e40\u0e1b\u0e47\u0e19\u0e18\u0e23\u0e23\u0e21\u0e0a\u0e32\u0e15\u0e34 \u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 \u0e40\u0e2d\u0e01\u0e25\u0e31\u0e01\u0e29\u0e13\u0e4c \u0e41\u0e25\u0e30\u0e2a\u0e35\u0e2b\u0e19\u0e49\u0e32\u0e22\u0e31\u0e07\u0e04\u0e07\u0e40\u0e14\u0e34\u0e21 \u2014 \u0e1c\u0e34\u0e27\u0e44\u0e21\u0e48\u0e1e\u0e25\u0e32\u0e2a\u0e15\u0e34\u0e01 \u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e21\u0e48\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19",
    wf_exp_upscale: "\u0e02\u0e22\u0e32\u0e22\u0e20\u0e32\u0e1e\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e01\u0e39\u0e49\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e18\u0e23\u0e23\u0e21\u0e0a\u0e32\u0e15\u0e34\u0e02\u0e2d\u0e07\u0e1c\u0e34\u0e27 \u0e1c\u0e21 \u0e41\u0e25\u0e30\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e1c\u0e49\u0e32\u0e01\u0e25\u0e31\u0e1a\u0e21\u0e32 \u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 \u0e17\u0e48\u0e32\u0e17\u0e32\u0e07 \u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a \u0e41\u0e25\u0e30\u0e2a\u0e35\u0e22\u0e31\u0e07\u0e04\u0e07\u0e40\u0e14\u0e34\u0e21\u0e17\u0e38\u0e01\u0e2d\u0e22\u0e48\u0e32\u0e07 \u2014 \u0e44\u0e21\u0e48\u0e21\u0e35\u0e01\u0e32\u0e23\u0e40\u0e01\u0e25\u0e35\u0e48\u0e22\u0e08\u0e19\u0e14\u0e39\u0e1e\u0e25\u0e32\u0e2a\u0e15\u0e34\u0e01",
    wf_exp_object_edit: "\u0e25\u0e1a \u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19 \u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e49\u0e27\u0e22\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e44\u0e02\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e08\u0e38\u0e14\u0e17\u0e35\u0e48\u0e04\u0e27\u0e1a\u0e04\u0e38\u0e21\u0e44\u0e14\u0e49 \u0e17\u0e38\u0e01\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e41\u0e15\u0e30\u0e22\u0e31\u0e07\u0e04\u0e07\u0e40\u0e14\u0e34\u0e21",
    wf_exp_water_edit: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e2b\u0e23\u0e37\u0e2d\u0e41\u0e01\u0e49\u0e44\u0e02\u0e19\u0e49\u0e33 \u0e40\u0e07\u0e32\u0e2a\u0e30\u0e17\u0e49\u0e2d\u0e19 \u0e41\u0e25\u0e30\u0e1e\u0e37\u0e49\u0e19\u0e1c\u0e34\u0e27\u0e40\u0e1b\u0e35\u0e22\u0e01\u0e43\u0e2b\u0e49\u0e14\u0e39\u0e2a\u0e21\u0e08\u0e23\u0e34\u0e07\u0e15\u0e32\u0e21\u0e1f\u0e34\u0e2a\u0e34\u0e01\u0e2a\u0e4c \u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
    wf_exp_text_logo: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e2b\u0e23\u0e37\u0e2d\u0e41\u0e01\u0e49\u0e44\u0e02\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2b\u0e23\u0e37\u0e2d\u0e42\u0e25\u0e42\u0e01\u0e49\u0e17\u0e35\u0e48\u0e2a\u0e30\u0e2d\u0e32\u0e14\u0e41\u0e25\u0e30\u0e2d\u0e48\u0e32\u0e19\u0e07\u0e48\u0e32\u0e22\u0e1a\u0e19\u0e20\u0e32\u0e1e \u0e42\u0e14\u0e22\u0e22\u0e31\u0e07\u0e04\u0e07\u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e40\u0e14\u0e34\u0e21",
    ai_key_lives_in_setup: "คีย์ RunningHub Enterprise จัดการที่แท็บ Setup — บันทึกครั้งเดียว ใช้ได้ทุกที่",
    ai_settings_defaults: "AI Tools — ค่าเริ่มต้น",
    job_needkey: "เพิ่มคีย์ RunningHub ใน Setup ก่อน",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "เปลี่ยนรูปโปรไฟล์",
    ava_remove: "ลบรูป",
    ava_saved: "บันทึกรูปแล้ว",
    ava_removed: "ลบรูปแล้ว",
    ava_fail: "ใช้รูปนี้ไม่ได้ — ลองรูปอื่น",
    ava_working: "กำลังเตรียมรูป…",
    upd_web: "กำลังเปิด Web App — รับ Panel ได้ที่ Account → Photoshop Panel",
    money_intro: "ทุกครั้งที่ GENERATE จะบันทึกยอดที่ RunningHub เก็บจริง ไม่ใช่ค่าประมาณ ยอดคงเหลืออ่านจากบัญชี RunningHub โดยตรง",
    money_bal: "คงเหลือ",
    money_refresh: "ตรวจยอดคงเหลือ",
    money_nokey: "บันทึกคีย์ RunningHub ก่อน จึงจะอ่านยอดคงเหลือได้",
    money_fail: "อ่านยอดคงเหลือไม่ได้ — บันทึกด้านล่างยังแม่นยำ RunningHub ตอบว่า:",
    money_never: "ยังไม่เคยตรวจ",
    gate_sub_login: "เข้าสู่ระบบด้วยบัญชี HNK ของคุณเพื่อใช้แผงนี้",
    gate_email_ph: "อีเมล",
    gate_pass_ph: "รหัสผ่าน",
    gate_signin: "เข้าสู่ระบบ",
    gate_checking: "กำลังตรวจสอบแพ็กเกจของคุณ…",
    gate_need: "กรอกอีเมลและรหัสผ่าน",
    gate_bad: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    gate_wait: "พยายามเข้าสู่ระบบบ่อยเกินไป — ไม่ใช่รหัสผ่านผิด รอประมาณ 5 นาทีแล้วลองใหม่",
    gate_busy: "เซิร์ฟเวอร์กำลังไม่ว่าง — รอสักครู่แล้วกดเข้าสู่ระบบอีกครั้ง",
    gate_offline: "ไม่มีอินเทอร์เน็ต — ตรวจสอบแพ็กเกจไม่ได้ เชื่อมต่อแล้วกดตรวจสอบอีกครั้ง",
    gate_grace_gen: "การสร้างภาพต้องใช้อินเทอร์เน็ต แผงเปิดอยู่ด้วยผลตรวจครั้งล่าสุด แต่ขั้นตอนนี้ต้องถึงเซิร์ฟเวอร์",
    gate_grace_tag: "ยังไม่ยืนยัน",
    gate_locked: "จ่ายครั้งเดียวได้ทั้งสอง — ค่าแรกเข้าและค่ารายเดือนเปิดใช้ทั้งเว็บแอปและแผง Photoshop นี้ ซื้อหรือต่ออายุบนเว็บไซต์ แล้วกดตรวจสอบอีกครั้ง",
    gate_buy: "เปิดเว็บไซต์",
    gate_retry: "ตรวจสอบอีกครั้ง",
    gate_signout: "ออกจากระบบ",
    gate_days: "เหลือ {D} วัน",
    gate_grace: "ไม่มีอินเทอร์เน็ต — แผงเปิดด้วยผลตรวจสิทธิ์ครั้งล่าสุดที่ผ่านเข้ามา เชื่อมต่อเพื่อใช้งานต่อ",
    gate_open_fail: "เปิดเบราว์เซอร์ไม่ได้ ที่อยู่: {U}",
    gate_forgot: "ลืมรหัสผ่าน?",
    gate_session_ended: "เซสชันหมดอายุแล้ว — เข้าสู่ระบบอีกครั้ง",
    gate_acct_off: "บัญชีนี้ถูกปิด — ติดต่อครูผู้สอน",
    gate_confirm: "อีเมลนี้ยังไม่ได้ยืนยัน — เปิดอีเมลที่เราส่งให้",
    gate_gone: "ไม่มีบัญชีนี้แล้ว — ติดต่อครูผู้สอน",
    gate_server: "เซิร์ฟเวอร์มีปัญหา — รอสักครู่แล้วลองใหม่",
    gate_service_down: "ติดต่อเซิร์ฟเวอร์ลิขสิทธิ์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วกดตรวจอีกครั้ง",
    gate_no_lease: "เซิร์ฟเวอร์ไม่ได้ให้สิทธิ์ใช้งานแผง — กดตรวจอีกครั้ง",
    gate_sent_as: "ส่งเป็น {E} · {N} ตัวอักษร",
    btn_show: "\u0e41\u0e2a\u0e14\u0e07",
    btn_save: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01",
    st_need_key: "\u0e43\u0e2a\u0e48 RunningHub Enterprise key \u0e01\u0e48\u0e2d\u0e19",
    qual_auto: "\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34",
    btn_clear: "\u0e25\u0e49\u0e32\u0e07",
    btn_ref_layer: "+ \u0e40\u0e25\u0e40\u0e22\u0e2d\u0e23\u0e4c",
    btn_ref_file: "\u0e44\u0e1f\u0e25\u0e4c",
    btn_ref_web: "\u0e40\u0e27\u0e47\u0e1a",
    st_ref_layer_added: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e25\u0e40\u0e22\u0e2d\u0e23\u0e4c\u0e40\u0e1b\u0e47\u0e19\u0e20\u0e32\u0e1e\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_photo_layer_added: "เพิ่มเลเยอร์เป็นรูปแล้ว ✓",
    st_ref_file_added: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e1b\u0e47\u0e19\u0e20\u0e32\u0e1e\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_importing: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32\u0e44\u0e1f\u0e25\u0e4c",
    url_ph: "https://\u2026 \u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e20\u0e32\u0e1e \u0e2b\u0e23\u0e37\u0e2d\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e1e\u0e34\u0e19 Pinterest",
    btn_load: "\u0e42\u0e2b\u0e25\u0e14",
    btn_cancel: "\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01",
    btn_ok: "ตกลง",
    wiz_promptnote: "prompt ที่ป้องกันของ Workflow ใส่ไว้ให้แล้ว — เพิ่มสิ่งที่ต้องการ (เช่น พื้นหลัง/ข้อความ) ไว้ด้านบนสุดได้",
    st_url_loading: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e20\u0e32\u0e1e\u0e08\u0e32\u0e01\u0e40\u0e27\u0e47\u0e1a",
    st_ref_web_added: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e20\u0e32\u0e1e\u0e40\u0e27\u0e47\u0e1a\u0e40\u0e1b\u0e47\u0e19\u0e20\u0e32\u0e1e\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_url_bad: "\u0e42\u0e2b\u0e25\u0e14\u0e20\u0e32\u0e1e\u0e08\u0e32\u0e01 URL \u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u2014 \u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e02\u0e2d\u0e07\u0e20\u0e32\u0e1e\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48",
    no_layer: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e40\u0e25\u0e40\u0e22\u0e2d\u0e23\u0e4c",
    st_web_import: "\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48 Photoshop \u0e40\u0e1b\u0e47\u0e19\u0e40\u0e25\u0e40\u0e22\u0e2d\u0e23\u0e4c\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_folder_ok: "\u0e15\u0e31\u0e49\u0e07\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_exported: "\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27 \u2713",
    st_export_fail: "\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01\u0e25\u0e49\u0e21\u0e40\u0e2b\u0e25\u0e27 \u2014 \u0e15\u0e23\u0e27\u0e08\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c",
    st_img_bad: "\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e20\u0e32\u0e1e\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19\u0e01\u0e32\u0e23\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a \u2014 \u0e40\u0e1e\u0e34\u0e48\u0e21\u0e20\u0e32\u0e1e\u0e43\u0e2b\u0e21\u0e48",
    st_auto_comp: "\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34: \u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a IMAGE 1 \u2192 \u0e09\u0e32\u0e01\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07",
    create_ph: "\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23",
    btn_create_ps: "\u2b07 \u0e2a\u0e48\u0e07\u0e44\u0e1b Photoshop",
    btn_to_ref: "\u21ba \u0e43\u0e0a\u0e49\u0e40\u0e1b\u0e47\u0e19 Ref 1",
    st_to_ref: "\u0e42\u0e2b\u0e25\u0e14\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e25\u0e07 Ref 1 \u0e41\u0e25\u0e49\u0e27 \u2713",
    cr_restyle: "\u267b \u0e23\u0e35\u0e2a\u0e44\u0e15\u0e25\u0e4c",
    cr_gal_empty: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c \u2014 \u0e41\u0e15\u0e30\u0e2a\u0e23\u0e49\u0e32\u0e07",
    cr_gal_have: "\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c \u00b7 \u0e41\u0e15\u0e30\u0e23\u0e39\u0e1b\u0e22\u0e48\u0e2d\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e14\u0e39 / \u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23",
    cr_save: "\u2b07 \u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01 PNG",
    cr_need_result: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e20\u0e32\u0e1e\u0e01\u0e48\u0e2d\u0e19",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "พรีเซ็ตฉากจาก Library — แตะครั้งเดียว",
    wf_scene_loading: "กำลังโหลดฉาก…",
    wf_scene_fail: "โหลดฉากจาก Library ไม่ได้ — ตรวจสอบอินเทอร์เน็ต",
    vid_no_inline: "คลิป {n} พร้อมแล้ว — แผง Photoshop นี้เล่นวิดีโอไม่ได้ กด Download หรือ Open เพื่อเปิดด้วยโปรแกรมเล่นวิดีโอของเครื่อง",
    pick_title: "เลือก",
    pick_search: "ค้นหา…",
    pick_none: "ไม่พบ",
    wf_ready_generate: "รูปที่ต้องใช้พร้อมแล้ว — กด GENERATE",
    wf_add_required: "เพิ่มรูปที่ต้องใช้",
    wf_press_prepare: "กด Prepare เพื่อโหลด workflow นี้และตรวจรูปของคุณ",
    wf_opts: "Model \u00b7 Ratio \u00b7 \u0e08\u0e33\u0e19\u0e27\u0e19 \u00b7 Size",
    wf_model_auto: "Auto \u2014 \u0e15\u0e32\u0e21\u0e17\u0e35\u0e48 workflow \u0e40\u0e25\u0e37\u0e2d\u0e01",
    ro_faceRep: "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32",
    ro_faceSwap: "\u0e2a\u0e25\u0e31\u0e1a\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32",
    ro_bgRep: "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07",
    ro_bgSwap: "\u0e2a\u0e25\u0e31\u0e1a\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07",
    ro_fgRep: "\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e09\u0e32\u0e01\u0e2b\u0e19\u0e49\u0e32",
    ro_subSwap: "\u0e2a\u0e25\u0e31\u0e1a\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a",
    ro_lcRef: "\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e41\u0e2a\u0e07&\u0e2a\u0e35",
    ro_lcCopy: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e41\u0e2a\u0e07&\u0e2a\u0e35",
    ro_dressRef: "\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e0a\u0e38\u0e14",
    ro_dressRep: "\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e38\u0e14",
    ro_mkCopy: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e40\u0e21\u0e04\u0e2d\u0e31\u0e1e",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "\u0e15\u0e31\u0e49\u0e07\u0e2a\u0e44\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e23\u0e35\u0e17\u0e31\u0e0a\u0e2b\u0e23\u0e37\u0e2d\u0e2a\u0e35\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e19\u0e49\u0e2d\u0e22\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e01\u0e48\u0e2d\u0e19",
    cap_warn: "Photoshop \u0e08\u0e33\u0e01\u0e31\u0e14\u0e0a\u0e48\u0e2d\u0e07\u0e1e\u0e23\u0e2d\u0e21\u0e15\u0e4c\u0e19\u0e35\u0e49\u0e17\u0e35\u0e48:",
    btn_generate: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e20\u0e32\u0e1e",
    st_ready: "\u0e1e\u0e23\u0e49\u0e2d\u0e21",
    st_capture: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e08\u0e31\u0e1a\u0e20\u0e32\u0e1e\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
    st_gen: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u2026",
    st_place: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e27\u0e32\u0e07\u0e25\u0e07 Photoshop\u2026",
    st_placed_masked: "\u0e27\u0e32\u0e07\u0e40\u0e1b\u0e47\u0e19\u0e01\u0e25\u0e38\u0e48\u0e21 Layer + Mask \u0e41\u0e25\u0e49\u0e27 \u2014 \u0e20\u0e32\u0e1e\u0e15\u0e49\u0e19\u0e09\u0e1a\u0e31\u0e1a\u0e44\u0e21\u0e48\u0e16\u0e39\u0e01\u0e41\u0e15\u0e30 \u2713",
    st_placed_plain: "\u0e27\u0e32\u0e07\u0e40\u0e1b\u0e47\u0e19\u0e40\u0e25\u0e40\u0e22\u0e2d\u0e23\u0e4c\u0e18\u0e23\u0e23\u0e21\u0e14\u0e32 (\u0e42\u0e2e\u0e2a\u0e15\u0e4c\u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a mask/group)",
    stage_queued: "\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e04\u0e34\u0e27",
    stage_uploading: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2d\u0e31\u0e1b\u0e42\u0e2b\u0e25\u0e14",
    stage_generating: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07",
    stage_downloading: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14",
    stage_placing: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e27\u0e32\u0e07\u0e25\u0e07 Photoshop",
    st_done: "\u0e40\u0e2a\u0e23\u0e47\u0e08 \u2713",
    st_err: "\u0e02\u0e49\u0e2d\u0e1c\u0e34\u0e14\u0e1e\u0e25\u0e32\u0e14",
    st_no_doc: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e17\u0e35\u0e48\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19 \u2014 \u0e40\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e1e\u0e01\u0e48\u0e2d\u0e19",
    st_no_prompt: "\u0e1e\u0e23\u0e2d\u0e21\u0e15\u0e4c\u0e27\u0e48\u0e32\u0e07",
    st_new_doc: "\u0e40\u0e1b\u0e34\u0e14\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e40\u0e1b\u0e47\u0e19\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e43\u0e2b\u0e21\u0e48\u0e41\u0e25\u0e49\u0e27 \u2713",
    ai_wb_match: "\u0e1b\u0e23\u0e31\u0e1a\u0e44\u0e27\u0e15\u0e4c\u0e1a\u0e32\u0e25\u0e32\u0e19\u0e0b\u0e4c\u0e43\u0e2b\u0e49\u0e15\u0e23\u0e07\u0e01\u0e31\u0e1a\u0e20\u0e32\u0e1e\u0e15\u0e49\u0e19\u0e09\u0e1a\u0e31\u0e1a",
    wb_matched: "\u0e1b\u0e23\u0e31\u0e1a\u0e44\u0e27\u0e15\u0e4c\u0e1a\u0e32\u0e25\u0e32\u0e19\u0e0b\u0e4c\u0e43\u0e2b\u0e49\u0e15\u0e23\u0e07\u0e41\u0e25\u0e49\u0e27 ({n}%)",
    wb_already: "\u0e44\u0e27\u0e15\u0e4c\u0e1a\u0e32\u0e25\u0e32\u0e19\u0e0b\u0e4c\u0e15\u0e23\u0e07\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27 ({n}%)",
    before: "\u0e01\u0e48\u0e2d\u0e19",
    after: "\u0e2b\u0e25\u0e31\u0e07",
    btn_place: "\u0e27\u0e32\u0e07\u0e25\u0e07 Photoshop",
    st_saved: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e41\u0e25\u0e49\u0e27 \u2713",
    lib_choose_msg: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e04\u0e25\u0e31\u0e07\u0e20\u0e32\u0e1e\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07 HNK \u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
    lib_unsupported: "\u0e0a\u0e19\u0e34\u0e14\u0e20\u0e32\u0e1e\u0e44\u0e21\u0e48\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a",
    lib_restore_fail: "\u0e01\u0e39\u0e49\u0e04\u0e37\u0e19\u0e20\u0e32\u0e1e\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49",
    on: "\u0e40\u0e1b\u0e34\u0e14",
    off: "\u0e1b\u0e34\u0e14",
    ai_history: "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34",
    ai_no_gen: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e1c\u0e25\u0e07\u0e32\u0e19",
    ai_videos: "วิดีโอ",
    ai_open: "เปิด",
    ai_rerun: "\u0e23\u0e31\u0e19\u0e43\u0e2b\u0e21\u0e48",
    ai_reuse: "\u0e43\u0e0a\u0e49\u0e0b\u0e49\u0e33",
    ai_clear_hist: "\u0e25\u0e49\u0e32\u0e07\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34",
    ai_images: "\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e",
    ai_add_ref: "+ \u0e40\u0e1e\u0e34\u0e48\u0e21\u0e20\u0e32\u0e1e Reference",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e04\u0e38\u0e13\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u2026",
    ai_model_output: "MODEL \u0e41\u0e25\u0e30 OUTPUT",
    ai_model_note: "AI Tools \u0e21\u0e35\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32 model/size \u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07 \u0e41\u0e22\u0e01\u0e08\u0e32\u0e01\u0e41\u0e17\u0e47\u0e1a Setup \u0e41\u0e25\u0e30 Create",
    ai_auto_model: "\u0e40\u0e25\u0e37\u0e2d\u0e01 Model \u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34",
    ai_wf_tools: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e21\u0e37\u0e2d Workflow",
    ai_direct_gen: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e17\u0e31\u0e19\u0e17\u0e35",
    ai_identity_lock: "\u0e25\u0e47\u0e2d\u0e01\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32",
    ai_ref_transfer: "\u0e16\u0e48\u0e32\u0e22\u0e17\u0e2d\u0e14 Reference",
    ai_req_images: "\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e43\u0e0a\u0e49",
    ai_opt_images: "\u0e20\u0e32\u0e1e\u0e40\u0e2a\u0e23\u0e34\u0e21 (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
    ai_model_lbl: "Model",
    ai_prepare: "\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21 (\u0e42\u0e2b\u0e25\u0e14\u0e41\u0e25\u0e30\u0e15\u0e23\u0e27\u0e08)",
    ai_lib_bridge_off: "\u0e42\u0e2e\u0e2a\u0e15\u0e4c\u0e19\u0e35\u0e49\u0e43\u0e0a\u0e49 Library \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49",
    ai_lib_pick_first: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e20\u0e32\u0e1e\u0e08\u0e32\u0e01\u0e41\u0e17\u0e47\u0e1a Presets \u2192 Visual Library \u0e01\u0e48\u0e2d\u0e19",
    ai_lib_load_fail: "\u0e42\u0e2b\u0e25\u0e14\u0e20\u0e32\u0e1e\u0e08\u0e32\u0e01 Library \u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08",
    ai_missing: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 \u0e40\u0e1e\u0e34\u0e48\u0e21 model endpoint (\u0e02\u0e31\u0e49\u0e19\u0e2a\u0e39\u0e07 \u2014 \u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
    ai_rh_note: "\u0e42\u0e21\u0e40\u0e14\u0e25\u0e17\u0e35\u0e48\u0e21\u0e35\u0e21\u0e32\u0e43\u0e2b\u0e49\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49\u0e14\u0e49\u0e27\u0e22\u0e04\u0e35\u0e22\u0e4c\u0e14\u0e49\u0e32\u0e19\u0e1a\u0e19\u0e41\u0e25\u0e49\u0e27 \u2014 \u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23 \u0e2b\u0e32\u0e01\u0e42\u0e21\u0e40\u0e14\u0e25\u0e43\u0e14\u0e02\u0e36\u0e49\u0e19\u0e27\u0e48\u0e32 \"not connected\" (\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19 endpoint path) \u0e43\u0e2b\u0e49\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01 path \u0e08\u0e32\u0e01 API docs \u0e02\u0e2d\u0e07 RunningHub \u0e21\u0e32\u0e27\u0e32\u0e07\u0e17\u0e35\u0e48\u0e19\u0e35\u0e48",
    ai_rh_save: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01 endpoint \u0e02\u0e2d\u0e07\u0e42\u0e21\u0e40\u0e14\u0e25\u0e19\u0e35\u0e49",
    ai_test_conn: "\u0e17\u0e14\u0e2a\u0e2d\u0e1a\u0e01\u0e32\u0e23\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d",
    ai_add_layers: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e40\u0e1b\u0e47\u0e19 Layer \u0e43\u0e2b\u0e21\u0e48",
    ai_done: "\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27",
    ai_result_ready: "\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e41\u0e25\u0e49\u0e27",
    ai_ready_nolayer: "\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e41\u0e25\u0e49\u0e27 (\u0e01\u0e32\u0e23\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e1b\u0e47\u0e19 Layer \u0e16\u0e39\u0e01\u0e1b\u0e34\u0e14\u0e44\u0e27\u0e49\u0e43\u0e19 Settings)",
    ai_place_failed: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27 \u0e41\u0e15\u0e48\u0e27\u0e32\u0e07\u0e25\u0e07\u0e43\u0e19 Photoshop \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49",
    ai_place_failed_fix: "\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e01\u0e48\u0e2d\u0e19 \u0e41\u0e25\u0e49\u0e27\u0e23\u0e31\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e08\u0e32\u0e01 History",
    ai_placed_masked: "\u0e27\u0e32\u0e07\u0e25\u0e07\u0e43\u0e19\u0e01\u0e25\u0e38\u0e48\u0e21 \u201c{name}\u201d \u0e40\u0e1b\u0e47\u0e19 Layer + Mask \u0e41\u0e25\u0e49\u0e27 \u2014 \u0e20\u0e32\u0e1e\u0e15\u0e49\u0e19\u0e09\u0e1a\u0e31\u0e1a\u0e44\u0e21\u0e48\u0e16\u0e39\u0e01\u0e41\u0e01\u0e49\u0e44\u0e02",
    ai_placed_group: "\u0e27\u0e32\u0e07\u0e25\u0e07\u0e43\u0e19\u0e01\u0e25\u0e38\u0e48\u0e21 \u201c{name}\u201d \u0e40\u0e1b\u0e47\u0e19 Layer \u0e43\u0e2b\u0e21\u0e48\u0e41\u0e25\u0e49\u0e27 (\u0e42\u0e2e\u0e2a\u0e15\u0e4c\u0e19\u0e35\u0e49\u0e43\u0e0a\u0e49 mask \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49)",
    ai_placed_plain: "\u0e27\u0e32\u0e07\u0e40\u0e1b\u0e47\u0e19 Layer \u0e43\u0e2b\u0e21\u0e48\u0e41\u0e25\u0e49\u0e27 (\u0e42\u0e2e\u0e2a\u0e15\u0e4c\u0e19\u0e35\u0e49\u0e43\u0e0a\u0e49 group/mask \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49)",
    ai_start_fail: "\u0e40\u0e23\u0e34\u0e48\u0e21 AI Tools \u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08",
    wfin_subject: "\u0e20\u0e32\u0e1e\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13 (\u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a)",
    wfin_new_bg: "\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e43\u0e2b\u0e21\u0e48 (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
    wfin_ref_scene: "\u0e09\u0e32\u0e01 reference",
    wfin_style_ref: "Style reference (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
    wfin_target_scene: "\u0e09\u0e32\u0e01\u0e40\u0e1b\u0e49\u0e32\u0e2b\u0e21\u0e32\u0e22\u0e17\u0e35\u0e48\u0e21\u0e35\u0e04\u0e19",
    wfin_base: "\u0e20\u0e32\u0e1e base",
    wfin_face_ref: "reference \u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 / \u0e15\u0e31\u0e27\u0e41\u0e1a\u0e1a",
    wfin_portrait: "\u0e20\u0e32\u0e1e\u0e1a\u0e38\u0e04\u0e04\u0e25",
    wfin_image: "\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e",
    wfin_object_ref: "reference \u0e27\u0e31\u0e15\u0e16\u0e38 (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
    wfin_logo_ref: "reference \u0e42\u0e25\u0e42\u0e01\u0e49 (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)",
  },
  /* ---- Chinese (Simplified) (zh) — 587 keys, complete ---- */
  zh: {
    rh_err_network: "无法连接 RunningHub Enterprise — 网络已断开。请检查网络连接后重试。",
    rh_err_task_failed: "RunningHub 任务失败 — 请更换 prompt 或图片",
    rh_err_host_blocked: "Photoshop 拒绝了此主机 — 面板 manifest 未允许。请安装最新面板。",
    rh_err_timeout: "生成耗时过长 — RunningHub 未及时响应。请重试，或减小尺寸 / 数量。",
    rh_err_rate_limited: "RunningHub Enterprise 正忙 — 请稍候再试。",
    rh_err_invalid_key: "RunningHub 拒绝了该 key — 请到 Setup ▸ RunningHub Enterprise 检查。",
    wf_exp_bg_replace: "\u66ff\u6362\u4e3b\u4f53\u8eab\u540e\u7684\u80cc\u666f\u3002\u4eba\u7269\u3001\u59ff\u52bf\u3001\u8fb9\u7f18\u548c\u5149\u7ebf\u5b8c\u5168\u4fdd\u6301\u4e0d\u53d8 \u2014 \u53ea\u6709\u8eab\u540e\u7684\u5185\u5bb9\u6539\u53d8\u3002",
    wf_exp_reference_transfer: "\u53d6\u7528 reference \u7167\u7247\u7684\u6574\u4e2a\u573a\u666f\uff08\u4f46\u4e0d\u53d6\u5176\u4e2d\u7684\u4eba\u7269\uff09\uff0c\u628a\u4f60\u7684\u4e3b\u4f53\u653e\u8fdb\u53bb \u2014 \u4fdd\u7559\u4e3b\u4f53\u7684\u8eab\u4efd\u3001\u59ff\u52bf\u4e0e\u6784\u56fe\uff0c\u5e76\u5339\u914d\u573a\u666f\u7684\u5149\u7ebf\u548c\u900f\u89c6\u3002",
    wf_exp_master_bgfg_replace: "\u6700\u4e25\u683c\u7684\u573a\u666f\u6362\u4eba\uff1a\u628a reference \u573a\u666f\u4e2d\u7684\u4eba\u7269\u5f7b\u5e95\u79fb\u9664\uff0c\u81ea\u7136\u91cd\u5efa\u88ab\u906e\u6321\u7684\u80cc\u666f\u4e0e\u524d\u666f\uff0c\u518d\u628a\u4f60\u7684\u4e3b\u4f53\u7cbe\u786e\u653e\u5165\u90a3\u4e2a\u4f4d\u7f6e \u2014 \u8eab\u4efd\u3001\u59ff\u52bf\u3001\u6bd4\u4f8b\u3001\u53d1\u578b\u3001\u670d\u88c5\u3001\u80a4\u8d28\u4e0e\u5149\u7ebf\u5168\u90e8\u9501\u5b9a\u81ea\u4f60\u7684\u7167\u7247\uff0creference \u53ea\u63d0\u4f9b\u573a\u666f\u3001\u673a\u4f4d\u4e0e\u666f\u6df1\u3002",
    wf_exp_subject_face: "\u628a reference \u4e2d\u7684\u4e3b\u4f53\u6216\u8138\u81ea\u7136\u878d\u5408\u5230\u4f60\u7684 base \u56fe\u4e0a\uff0c\u540c\u65f6\u4fdd\u6301 base \u7684\u6784\u56fe\u4e0d\u53d8\u3002",
    wf_exp_retouch: "\u5bf9\u808c\u80a4\u3001\u5934\u53d1\u4e0e\u8272\u8c03\u505a\u81ea\u7136\u7cbe\u4fee\u3002\u8eab\u4efd\u3001\u4e94\u5b98\u4e0e\u8868\u60c5\u90fd\u4fdd\u7559 \u2014 \u4e0d\u4f1a\u6709\u5851\u6599\u611f\u808c\u80a4\uff0c\u4e5f\u4e0d\u6539\u8138\u3002",
    wf_exp_upscale: "\u5728\u653e\u5927\u7684\u540c\u65f6\u6062\u590d\u808c\u80a4\u3001\u5934\u53d1\u4e0e\u7ec7\u7269\u7684\u81ea\u7136\u7ec6\u8282\u3002\u8eab\u4efd\u3001\u59ff\u52bf\u3001\u6784\u56fe\u4e0e\u8272\u5f69\u5b8c\u5168\u4e0d\u53d8 \u2014 \u4e0d\u505a\u5851\u6599\u611f\u78e8\u76ae\u3002",
    wf_exp_object_edit: "\u4ee5\u53ef\u63a7\u7684\u5c40\u90e8\u7f16\u8f91\u79fb\u9664\u3001\u66ff\u6362\u6216\u6dfb\u52a0\u7269\u4ef6\u3002\u4f60\u6ca1\u6709\u52a8\u5230\u7684\u90e8\u5206\u4e00\u5f8b\u4fdd\u6301\u539f\u6837\u3002",
    wf_exp_water_edit: "\u6dfb\u52a0\u6216\u8c03\u6574\u6c34\u4f53\u3001\u5012\u5f71\u4e0e\u6e7f\u6da6\u8868\u9762\uff0c\u4f7f\u5176\u7b26\u5408\u7269\u7406\u76f4\u89c9\uff0c\u540c\u65f6\u4e0d\u5f71\u54cd\u4f60\u7684\u4e3b\u4f53\u3002",
    wf_exp_text_logo: "\u5728\u56fe\u4e0a\u6dfb\u52a0\u6216\u4fee\u6539\u5e72\u51c0\u6613\u8bfb\u7684\u6587\u5b57\u6216 logo\uff0c\u540c\u65f6\u4fdd\u6301\u539f\u6709\u6784\u56fe\u3002",
    ai_key_lives_in_setup: "RunningHub Enterprise key 在 Setup 标签页管理 — 保存一次，处处可用。",
    ai_settings_defaults: "AI Tools — 默认值",
    job_needkey: "请先在 Setup 中添加 RunningHub key",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "更换头像",
    ava_remove: "移除头像",
    ava_saved: "头像已保存",
    ava_removed: "头像已移除",
    ava_fail: "无法使用该图片 — 请换一张",
    ava_working: "正在处理图片…",
    upd_web: "正在打开 Web App — 请在 Account → Photoshop Panel 处获取面板。",
    money_intro: "每次 GENERATE 都按 RunningHub 实际扣费记账，不是估算。余额直接从你的 RunningHub 账户读取。",
    money_bal: "余额",
    money_refresh: "查询余额",
    money_nokey: "先保存 RunningHub 密钥，才能查询余额。",
    money_fail: "无法读取余额 — 下方的账本仍然准确。RunningHub 的回应：",
    money_never: "尚未查询",
    gate_sub_login: "请用你的 HNK 账户登录后使用本面板。",
    gate_email_ph: "邮箱",
    gate_pass_ph: "密码",
    gate_signin: "登录",
    gate_checking: "正在检查你的套餐…",
    gate_need: "请输入邮箱和密码。",
    gate_bad: "邮箱或密码不正确。",
    gate_wait: "登录尝试次数过多 — 并不是密码错误。请等待约 5 分钟后再试。",
    gate_busy: "服务器正忙 — 请稍候几秒后再次点击登录。",
    gate_offline: "没有网络 — 无法检查你的套餐。请联网后再次检查。",
    gate_grace_gen: "生成需要网络。面板虽以上一次授权检查打开，但这一步必须连上服务器。",
    gate_grace_tag: "未确认",
    gate_locked: "一次付费，两个都能用 — 入会费和月费同时开通网页应用和这个 Photoshop 面板。请在网站上购买或续费，然后再次检查。",
    gate_buy: "打开网站",
    gate_retry: "再次检查",
    gate_signout: "退出登录",
    gate_days: "剩余 {D} 天",
    gate_grace: "没有网络 — 面板是用上一次成功的授权检查结果打开的。请联网以继续使用。",
    gate_open_fail: "无法打开浏览器。网址：{U}",
    gate_forgot: "忘记密码？",
    gate_session_ended: "登录状态已过期 — 请重新登录。",
    gate_acct_off: "该账户已被关闭 — 请联系老师。",
    gate_confirm: "该邮箱尚未验证 — 请打开我们发送的邮件。",
    gate_gone: "该账户已不存在 — 请联系老师。",
    gate_server: "服务器出现问题 — 请稍候再试。",
    gate_service_down: "无法连接授权服务器 — 请检查网络后再次点击检查。",
    gate_no_lease: "服务器未返回有效的面板授权 — 请再次点击检查。",
    gate_sent_as: "已发送 {E} · {N} 个字符",
    btn_show: "\u663e\u793a",
    btn_save: "\u4fdd\u5b58",
    st_need_key: "\u8bf7\u5148\u8f93\u5165 RunningHub Enterprise \u5bc6\u94a5",
    qual_auto: "\u81ea\u52a8",
    btn_clear: "\u6e05\u9664",
    btn_ref_layer: "+ \u56fe\u5c42",
    btn_ref_file: "\u6587\u4ef6",
    btn_ref_web: "\u7f51\u9875",
    st_ref_layer_added: "\u56fe\u5c42\u5df2\u6dfb\u52a0\u4e3a\u53c2\u8003\u56fe \u2713",
    st_photo_layer_added: "图层已添加为照片 ✓",
    st_ref_file_added: "\u6587\u4ef6\u5df2\u6dfb\u52a0\u4e3a\u53c2\u8003\u56fe \u2713",
    st_importing: "\u6b63\u5728\u5bfc\u5165\u6587\u4ef6",
    url_ph: "https://\u2026 \u56fe\u7247\u5730\u5740\u6216 Pinterest \u94fe\u63a5",
    btn_load: "\u52a0\u8f7d",
    btn_cancel: "\u53d6\u6d88",
    btn_ok: "确定",
    wiz_promptnote: "Workflow 的受保护 prompt 已预先填好 — 想补充的内容（如背景/文字）可写在最上方",
    st_url_loading: "\u6b63\u5728\u4e0b\u8f7d\u7f51\u7edc\u56fe\u7247",
    st_ref_web_added: "\u7f51\u7edc\u56fe\u7247\u5df2\u6dfb\u52a0\u4e3a\u53c2\u8003\u56fe \u2713",
    st_url_bad: "\u65e0\u6cd5\u4ece\u8be5 URL \u8f7d\u5165\u56fe\u7247 \u2014 \u8bf7\u590d\u5236\u56fe\u7247\u5730\u5740\u540e\u91cd\u8bd5",
    no_layer: "\u672a\u9009\u62e9\u56fe\u5c42",
    st_web_import: "\u5df2\u4f5c\u4e3a\u56fe\u5c42\u5bfc\u5165 Photoshop \u2713",
    st_folder_ok: "\u5df2\u8bbe\u7f6e\u5bfc\u51fa\u6587\u4ef6\u5939 \u2713",
    st_exported: "\u5df2\u5bfc\u51fa \u2713",
    st_export_fail: "\u5bfc\u51fa\u5931\u8d25 \u2014 \u8bf7\u68c0\u67e5\u6587\u4ef6\u5939",
    st_img_bad: "\u56fe\u7247\u6570\u636e\u672a\u901a\u8fc7\u5b8c\u6574\u6027\u68c0\u67e5 \u2014 \u8bf7\u91cd\u65b0\u6dfb\u52a0\u7167\u7247",
    st_auto_comp: "\u81ea\u52a8\u5408\u6210\uff1aIMAGE 1 \u4e3b\u4f53 \u2192 \u53c2\u8003\u573a\u666f",
    create_ph: "\u63cf\u8ff0\u4f60\u60f3\u8981\u7684\u56fe\u7247",
    btn_create_ps: "\u2b07 \u53d1\u9001\u5230 Photoshop",
    btn_to_ref: "\u21ba \u7528\u4f5c Ref 1",
    st_to_ref: "\u7ed3\u679c\u5df2\u8f7d\u5165 Ref 1 \u2713",
    cr_restyle: "\u267b \u91cd\u5851\u98ce\u683c",
    cr_gal_empty: "\u6682\u65e0\u7ed3\u679c \u2014 \u70b9\u6309\u751f\u6210\u3002",
    cr_gal_have: "\u4e2a\u7ed3\u679c \u00b7 \u70b9\u7f29\u7565\u56fe\u9884\u89c8 / \u64cd\u4f5c",
    cr_save: "\u2b07 \u4fdd\u5b58 PNG",
    cr_need_result: "\u8bf7\u5148\u751f\u6210\u56fe\u7247",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "来自 Library 的场景预设 — 一键",
    wf_scene_loading: "正在加载场景…",
    wf_scene_fail: "无法加载此 Library 场景 — 请检查网络",
    vid_no_inline: "第 {n} 段视频已完成 — 此 Photoshop 面板无法播放视频。点 Download 或 Open 用电脑的播放器打开。",
    pick_title: "选择",
    pick_search: "搜索…",
    pick_none: "没有匹配项",
    wf_ready_generate: "所需图片已就绪 — 点 GENERATE。",
    wf_add_required: "请添加所需图片。",
    wf_press_prepare: "点 Prepare 载入此工作流并检查图片。",
    wf_opts: "\u6a21\u578b \u00b7 \u6bd4\u4f8b \u00b7 \u6570\u91cf \u00b7 \u5c3a\u5bf8",
    wf_model_auto: "\u81ea\u52a8 \u2014 \u7531 workflow \u9009\u62e9",
    ro_faceRep: "\u66ff\u6362\u9762\u90e8",
    ro_faceSwap: "\u6362\u8138",
    ro_bgRep: "\u66ff\u6362\u80cc\u666f",
    ro_bgSwap: "\u4ea4\u6362\u80cc\u666f",
    ro_fgRep: "\u66ff\u6362\u524d\u666f",
    ro_subSwap: "\u66ff\u6362\u4e3b\u4f53",
    ro_lcRef: "\u5149\u8272\u53c2\u8003",
    ro_lcCopy: "\u5149\u8272\u590d\u5236",
    ro_dressRef: "\u670d\u88c5\u53c2\u8003",
    ro_dressRep: "\u66ff\u6362\u670d\u88c5",
    ro_mkCopy: "\u590d\u5236\u5986\u5bb9",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "\u8bf7\u5148\u8bbe\u7f6e\u81f3\u5c11\u4e00\u4e2a\u4fee\u9970\u6ed1\u5757\u6216\u989c\u8272",
    cap_warn: "Photoshop \u5c06\u6b64\u63d0\u793a\u6846\u9650\u5236\u4e3a\uff1a",
    btn_generate: "\u751f\u6210",
    st_ready: "\u5c31\u7eea",
    st_capture: "\u6b63\u5728\u6355\u83b7\u6587\u6863",
    st_gen: "\u751f\u6210\u4e2d\u2026",
    st_place: "\u6b63\u5728\u653e\u5165 Photoshop\u2026",
    st_placed_masked: "\u5df2\u4f5c\u4e3a Layer + Mask \u7ec4\u653e\u5165 \u2014 \u539f\u56fe\u672a\u88ab\u6539\u52a8 \u2713",
    st_placed_plain: "\u5df2\u4f5c\u4e3a\u666e\u901a\u56fe\u5c42\u653e\u5165\uff08\u6b64\u4e3b\u673a\u4e0d\u652f\u6301\u8499\u7248/\u7f16\u7ec4\uff09",
    stage_queued: "\u6392\u961f\u4e2d",
    stage_uploading: "\u4e0a\u4f20\u4e2d",
    stage_generating: "\u751f\u6210\u4e2d",
    stage_downloading: "\u4e0b\u8f7d\u4e2d",
    stage_placing: "\u6b63\u5728\u653e\u5165 Photoshop",
    st_done: "\u5b8c\u6210 \u2713",
    st_err: "\u9519\u8bef",
    st_no_doc: "\u6ca1\u6709\u6d3b\u52a8\u6587\u6863 \u2014 \u8bf7\u5148\u6253\u5f00\u7167\u7247",
    st_no_prompt: "\u63d0\u793a\u8bcd\u4e3a\u7a7a",
    st_new_doc: "\u7ed3\u679c\u5df2\u4f5c\u4e3a\u65b0\u6587\u6863\u6253\u5f00 \u2713",
    ai_wb_match: "\u767d\u5e73\u8861\u4e0e\u539f\u56fe\u5bf9\u9f50",
    wb_matched: "\u767d\u5e73\u8861\u5df2\u5bf9\u9f50\uff08{n}%\uff09",
    wb_already: "\u767d\u5e73\u8861\u672c\u6765\u5c31\u4e00\u81f4\uff08{n}%\uff09",
    before: "\u524d",
    after: "\u540e",
    btn_place: "\u653e\u5165 Photoshop",
    st_saved: "\u5df2\u4fdd\u5b58 \u2713",
    lib_choose_msg: "\u9009\u62e9\u4f60\u7684 HNK \u53c2\u8003\u56fe\u5e93\u6587\u4ef6\u5939\u3002",
    lib_unsupported: "\u4e0d\u652f\u6301\u7684\u56fe\u7247\u7c7b\u578b",
    lib_restore_fail: "\u65e0\u6cd5\u6062\u590d\u53c2\u8003\u56fe",
    on: "\u5f00",
    off: "\u5173",
    ai_history: "\u5386\u53f2\u8bb0\u5f55",
    ai_no_gen: "\u8fd8\u6ca1\u6709\u751f\u6210\u8bb0\u5f55\u3002",
    ai_videos: "视频",
    ai_open: "打开",
    ai_rerun: "\u91cd\u65b0\u8fd0\u884c",
    ai_reuse: "\u518d\u6b21\u4f7f\u7528",
    ai_clear_hist: "\u6e05\u9664\u5386\u53f2\u8bb0\u5f55",
    ai_images: "\u56fe\u7247",
    ai_add_ref: "+ \u6dfb\u52a0 Reference \u56fe\u7247",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "\u63cf\u8ff0\u4f60\u60f3\u8981\u7684\u6548\u679c\u2026",
    ai_model_output: "MODEL \u4e0e OUTPUT",
    ai_model_note: "AI Tools \u6709\u81ea\u5df1\u7684 model/size \u8bbe\u7f6e\uff0c\u4e0e Setup \u548c Create \u6807\u7b7e\u9875\u76f8\u4e92\u72ec\u7acb\u3002",
    ai_auto_model: "\u81ea\u52a8\u9009\u62e9 Model",
    ai_wf_tools: "Workflow \u5de5\u5177",
    ai_direct_gen: "\u76f4\u63a5\u751f\u6210",
    ai_identity_lock: "\u9501\u5b9a\u4eba\u7269\u8eab\u4efd",
    ai_ref_transfer: "Reference \u8fc1\u79fb",
    ai_req_images: "\u5fc5\u9700\u7684\u56fe\u7247",
    ai_opt_images: "\u53ef\u9009\u56fe\u7247",
    ai_model_lbl: "Model",
    ai_prepare: "\u51c6\u5907\uff08\u8f7d\u5165\u5e76\u68c0\u67e5\uff09",
    ai_lib_bridge_off: "\u6b64 host \u65e0\u6cd5\u8fde\u63a5 Library\u3002",
    ai_lib_pick_first: "\u8bf7\u5148\u5728 Presets \u6807\u7b7e\u9875 \u2192 Visual Library \u4e2d\u9009\u4e00\u5f20\u56fe\u7247\u3002",
    ai_lib_load_fail: "\u65e0\u6cd5\u8f7d\u5165 Library \u56fe\u7247\u3002",
    ai_missing: "\u7f3a\u5c11",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 \u6dfb\u52a0 model endpoint\uff08\u9ad8\u7ea7 \u2014 \u53ef\u9009\uff09",
    ai_rh_note: "\u5185\u7f6e model \u5df2\u53ef\u7528\u4e0a\u65b9\u7684 key \u8fd0\u884c\uff0c\u65e0\u9700\u8bbe\u7f6e\u3002\u82e5\u67d0\u4e2a model \u663e\u793a \"not connected\"\uff08\u5176 endpoint path \u5c1a\u672a\u786e\u8ba4\uff09\uff0c\u8bf7\u4ece RunningHub \u7684 API \u6587\u6863\u590d\u5236 path \u5e76\u7c98\u8d34\u5230\u8fd9\u91cc\u3002",
    ai_rh_save: "\u4fdd\u5b58\u6b64 model \u7684 endpoint",
    ai_test_conn: "\u6d4b\u8bd5\u8fde\u63a5",
    ai_add_layers: "\u5c06\u7ed3\u679c\u6dfb\u52a0\u4e3a\u65b0 Layer",
    ai_done: "\u5b8c\u6210\u3002",
    ai_result_ready: "\u7ed3\u679c\u5df2\u5c31\u7eea\u3002",
    ai_ready_nolayer: "\u7ed3\u679c\u5df2\u5c31\u7eea\uff08Settings \u4e2d\u5df2\u5173\u95ed\u201c\u6dfb\u52a0\u4e3a Layer\u201d\uff09\u3002",
    ai_place_failed: "\u5df2\u751f\u6210\uff0c\u4f46\u65e0\u6cd5\u7f6e\u5165 Photoshop\u3002",
    ai_place_failed_fix: "\u8bf7\u5148\u6253\u5f00\u4e00\u4e2a\u6587\u6863\uff0c\u518d\u4ece History \u91cd\u65b0\u8fd0\u884c\u3002",
    ai_placed_masked: "\u5df2\u4f5c\u4e3a Layer + Mask \u7f6e\u5165 \u201c{name}\u201d \u7ec4 \u2014 \u539f\u56fe\u672a\u88ab\u6539\u52a8\u3002",
    ai_placed_group: "\u5df2\u4f5c\u4e3a\u65b0 Layer \u7f6e\u5165 \u201c{name}\u201d \u7ec4\uff08\u6b64 host \u4e0d\u652f\u6301 mask\uff09\u3002",
    ai_placed_plain: "\u5df2\u4f5c\u4e3a\u65b0 Layer \u7f6e\u5165\uff08\u6b64 host \u4e0d\u652f\u6301 group/mask\uff09\u3002",
    ai_start_fail: "AI Tools \u542f\u52a8\u5931\u8d25",
    wfin_subject: "\u4f60\u7684\u7167\u7247\uff08\u4e3b\u4f53\uff09",
    wfin_new_bg: "\u65b0\u80cc\u666f\uff08\u53ef\u9009\uff09",
    wfin_ref_scene: "Reference \u573a\u666f",
    wfin_style_ref: "Style reference\uff08\u53ef\u9009\uff09",
    wfin_target_scene: "\u542b\u4eba\u7269\u7684\u76ee\u6807\u573a\u666f",
    wfin_base: "Base \u56fe",
    wfin_face_ref: "\u8138\u90e8\uff0f\u4e3b\u4f53 reference",
    wfin_portrait: "\u4eba\u50cf",
    wfin_image: "\u56fe\u7247",
    wfin_object_ref: "\u7269\u4ef6 reference\uff08\u53ef\u9009\uff09",
    wfin_logo_ref: "Logo reference\uff08\u53ef\u9009\uff09",
  },
  /* ---- Vietnamese (vi) — 587 keys, complete ---- */
  vi: {
    rh_err_network: "Không kết nối được RunningHub Enterprise — mất mạng. Kiểm tra kết nối rồi thử lại.",
    rh_err_task_failed: "Tác vụ RunningHub thất bại — thử prompt hoặc ảnh khác",
    rh_err_host_blocked: "Photoshop từ chối host này — manifest của panel không cho phép. Hãy cài panel mới nhất.",
    rh_err_timeout: "Tạo ảnh quá lâu — RunningHub không trả lời kịp. Thử lại, hoặc giảm kích thước / số lượng.",
    rh_err_rate_limited: "RunningHub Enterprise đang bận — đợi một lát rồi thử lại.",
    rh_err_invalid_key: "RunningHub từ chối key — kiểm tra tại Setup ▸ RunningHub Enterprise.",
    wf_exp_bg_replace: "Thay n\u1ec1n ph\u00eda sau ch\u1ee7 th\u1ec3. Con ng\u01b0\u1eddi, d\u00e1ng, vi\u1ec1n v\u00e0 \u00e1nh s\u00e1ng gi\u1eef nguy\u00ean ho\u00e0n to\u00e0n \u2014 ch\u1ec9 ph\u1ea7n ph\u00eda sau thay \u0111\u1ed5i.",
    wf_exp_reference_transfer: "L\u1ea5y to\u00e0n b\u1ed9 c\u1ea3nh c\u1ee7a \u1ea3nh reference (nh\u01b0ng KH\u00d4NG l\u1ea5y ng\u01b0\u1eddi trong \u0111\u00f3) v\u00e0 \u0111\u1eb7t ch\u1ee7 th\u1ec3 C\u1ee6A B\u1ea0N v\u00e0o \u2014 gi\u1eef nguy\u00ean nh\u1eadn d\u1ea1ng, d\u00e1ng v\u00e0 khung h\u00ecnh, \u0111\u1ed3ng th\u1eddi kh\u1edbp \u00e1nh s\u00e1ng v\u00e0 ph\u1ed1i c\u1ea3nh c\u1ee7a c\u1ea3nh.",
    wf_exp_master_bgfg_replace: "Ki\u1ec3u thay ch\u1ee7 th\u1ec3 trong c\u1ea3nh nghi\u00eam ng\u1eb7t nh\u1ea5t: x\u00f3a ho\u00e0n to\u00e0n ng\u01b0\u1eddi kh\u1ecfi c\u1ea3nh reference, d\u1ef1ng l\u1ea1i t\u1ef1 nhi\u00ean ph\u1ea7n n\u1ec1n v\u00e0 ti\u1ec1n c\u1ea3nh b\u1ecb che, r\u1ed3i \u0111\u1eb7t \u0111\u00fang ch\u1ee7 th\u1ec3 c\u1ee7a b\u1ea1n v\u00e0o \u0111\u00fang ch\u1ed7 \u0111\u00f3 \u2014 nh\u1eadn d\u1ea1ng, d\u00e1ng, t\u1ec9 l\u1ec7, ki\u1ec3u t\u00f3c, trang ph\u1ee5c, da v\u00e0 \u00e1nh s\u00e1ng \u0111\u1ec1u kh\u00f3a theo \u1ea3nh c\u1ee7a b\u1ea1n, c\u00f2n reference ch\u1ec9 cung c\u1ea5p c\u1ea3nh, g\u00f3c m\u00e1y v\u00e0 chi\u1ec1u s\u00e2u.",
    wf_exp_subject_face: "H\u00f2a tr\u1ed9n ch\u1ee7 th\u1ec3 ho\u1eb7c khu\u00f4n m\u1eb7t t\u1eeb reference l\u00ean \u1ea3nh base m\u1ed9t c\u00e1ch li\u1ec1n m\u1ea1ch, gi\u1eef nguy\u00ean b\u1ed1 c\u1ee5c c\u1ee7a \u1ea3nh base.",
    wf_exp_retouch: "Tinh ch\u1ec9nh t\u1ef1 nhi\u00ean cho da, t\u00f3c v\u00e0 t\u00f4ng m\u00e0u. Nh\u1eadn d\u1ea1ng, \u0111\u01b0\u1eddng n\u00e9t v\u00e0 bi\u1ec3u c\u1ea3m \u0111\u01b0\u1ee3c gi\u1eef nguy\u00ean \u2014 kh\u00f4ng da nh\u1ef1a, kh\u00f4ng \u0111\u1ed5i m\u1eb7t.",
    wf_exp_upscale: "Ph\u00f3ng to \u1ea3nh \u0111\u1ed3ng th\u1eddi ph\u1ee5c h\u1ed3i chi ti\u1ebft t\u1ef1 nhi\u00ean \u1edf da, t\u00f3c v\u00e0 v\u1ea3i. Nh\u1eadn d\u1ea1ng, d\u00e1ng, b\u1ed1 c\u1ee5c v\u00e0 m\u00e0u s\u1eafc gi\u1eef nguy\u00ean ho\u00e0n to\u00e0n \u2014 kh\u00f4ng l\u00e0m m\u1ecbn ki\u1ec3u nh\u1ef1a.",
    wf_exp_object_edit: "X\u00f3a, thay ho\u1eb7c th\u00eam v\u1eadt th\u1ec3 b\u1eb1ng m\u1ed9t ch\u1ec9nh s\u1eeda c\u1ee5c b\u1ed9 c\u00f3 ki\u1ec3m so\u00e1t. M\u1ecdi th\u1ee9 b\u1ea1n kh\u00f4ng \u0111\u1ee5ng t\u1edbi \u0111\u1ec1u gi\u1eef nguy\u00ean.",
    wf_exp_water_edit: "Th\u00eam ho\u1eb7c ch\u1ec9nh n\u01b0\u1edbc, ph\u1ea3n chi\u1ebfu v\u00e0 b\u1ec1 m\u1eb7t \u01b0\u1edbt sao cho tr\u00f4ng \u0111\u00fang v\u1eadt l\u00fd, \u0111\u1ed3ng th\u1eddi gi\u1eef nguy\u00ean ch\u1ee7 th\u1ec3 c\u1ee7a b\u1ea1n.",
    wf_exp_text_logo: "Th\u00eam ho\u1eb7c s\u1eeda ch\u1eef hay logo s\u1ea1ch, d\u1ec5 \u0111\u1ecdc tr\u00ean \u1ea3nh m\u00e0 v\u1eabn gi\u1eef nguy\u00ean b\u1ed1 c\u1ee5c.",
    ai_key_lives_in_setup: "Key RunningHub Enterprise được quản lý ở tab Setup — lưu một lần, dùng mọi nơi.",
    ai_settings_defaults: "AI Tools — Mặc định",
    job_needkey: "Thêm key RunningHub trong Setup trước",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "Đổi ảnh đại diện",
    ava_remove: "Xóa ảnh",
    ava_saved: "Đã lưu ảnh",
    ava_removed: "Đã xóa ảnh",
    ava_fail: "Không dùng được ảnh này — thử ảnh khác",
    ava_working: "Đang xử lý ảnh…",
    upd_web: "Đang mở Web App — tải Panel tại Account → Photoshop Panel.",
    money_intro: "Mỗi lần GENERATE được ghi sổ theo số tiền RunningHub thực sự thu — không phải ước tính. Số dư đọc thẳng từ tài khoản RunningHub.",
    money_bal: "Số dư",
    money_refresh: "Kiểm tra số dư",
    money_nokey: "Lưu khóa RunningHub trước thì mới đọc được số dư.",
    money_fail: "Không đọc được số dư — sổ chi bên dưới vẫn chính xác. RunningHub trả lời:",
    money_never: "chưa kiểm tra",
    gate_sub_login: "Đăng nhập bằng tài khoản HNK của bạn để dùng bảng này.",
    gate_email_ph: "Email",
    gate_pass_ph: "Mật khẩu",
    gate_signin: "Đăng nhập",
    gate_checking: "Đang kiểm tra gói của bạn…",
    gate_need: "Nhập email và mật khẩu.",
    gate_bad: "Email hoặc mật khẩu không đúng.",
    gate_wait: "Đăng nhập quá nhiều lần — không phải sai mật khẩu. Hãy đợi khoảng 5 phút rồi thử lại.",
    gate_busy: "Máy chủ đang bận — đợi vài giây rồi nhấn Đăng nhập lại.",
    gate_offline: "Không có mạng — không kiểm tra được gói. Hãy kết nối rồi kiểm tra lại.",
    gate_grace_gen: "Tạo ảnh cần mạng. Bảng đang mở bằng lần kiểm tra gần nhất, nhưng bước này phải tới được máy chủ.",
    gate_grace_tag: "chưa xác nhận",
    gate_locked: "Một lần thanh toán dùng được cả hai — phí gia nhập và phí hàng tháng mở cả ứng dụng web VÀ bảng Photoshop này. Hãy mua hoặc gia hạn trên website, rồi bấm kiểm tra lại.",
    gate_buy: "Mở website",
    gate_retry: "Kiểm tra lại",
    gate_signout: "Đăng xuất",
    gate_days: "còn {D} ngày",
    gate_grace: "Không có mạng — bảng mở bằng kết quả kiểm tra bản quyền gần nhất nhận được. Hãy kết nối để dùng tiếp.",
    gate_open_fail: "Không mở được trình duyệt. Địa chỉ: {U}",
    gate_forgot: "Quên mật khẩu?",
    gate_session_ended: "Phiên đăng nhập đã hết — hãy đăng nhập lại.",
    gate_acct_off: "Tài khoản này đã bị khoá — hãy liên hệ giáo viên.",
    gate_confirm: "Địa chỉ này chưa được xác nhận — hãy mở email chúng tôi đã gửi.",
    gate_gone: "Tài khoản này không còn tồn tại — hãy liên hệ giáo viên.",
    gate_server: "Máy chủ gặp sự cố — hãy chờ một lát rồi thử lại.",
    gate_service_down: "Không kết nối được máy chủ bản quyền — kiểm tra mạng rồi bấm Kiểm tra lại.",
    gate_no_lease: "Máy chủ không cấp quyền dùng bảng — bấm Kiểm tra lại.",
    gate_sent_as: "Đã gửi {E} · {N} ký tự",
    btn_show: "Hi\u1ec7n",
    btn_save: "L\u01b0u",
    st_need_key: "H\u00e3y nh\u1eadp RunningHub Enterprise key tr\u01b0\u1edbc",
    qual_auto: "T\u1ef1 \u0111\u1ed9ng",
    btn_clear: "X\u00f3a",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "T\u1ec7p",
    btn_ref_web: "Web",
    st_ref_layer_added: "\u0110\u00e3 th\u00eam layer l\u00e0m tham chi\u1ebfu \u2713",
    st_photo_layer_added: "Đã thêm layer làm ảnh ✓",
    st_ref_file_added: "\u0110\u00e3 th\u00eam t\u1ec7p l\u00e0m tham chi\u1ebfu \u2713",
    st_importing: "\u0110ang nh\u1eadp t\u1ec7p",
    url_ph: "https://\u2026 \u0111\u1ecba ch\u1ec9 \u1ea3nh ho\u1eb7c link ghim Pinterest",
    btn_load: "T\u1ea3i",
    btn_cancel: "H\u1ee7y",
    btn_ok: "OK",
    wiz_promptnote: "Prompt bảo vệ của workflow đã được điền sẵn — thêm điều bạn muốn (ví dụ nền/chữ) ở đầu",
    st_url_loading: "\u0110ang t\u1ea3i \u1ea3nh t\u1eeb web",
    st_ref_web_added: "\u0110\u00e3 th\u00eam \u1ea3nh web l\u00e0m tham chi\u1ebfu \u2713",
    st_url_bad: "Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c \u1ea3nh t\u1eeb URL n\u00e0y \u2014 h\u00e3y copy \u0111\u1ecba ch\u1ec9 \u1ea3nh r\u1ed3i th\u1eed l\u1ea1i",
    no_layer: "Ch\u01b0a ch\u1ecdn layer n\u00e0o",
    st_web_import: "\u0110\u00e3 nh\u1eadp v\u00e0o Photoshop th\u00e0nh layer \u2713",
    st_folder_ok: "\u0110\u00e3 \u0111\u1eb7t th\u01b0 m\u1ee5c xu\u1ea5t \u2713",
    st_exported: "\u0110\u00e3 xu\u1ea5t \u2713",
    st_export_fail: "Xu\u1ea5t th\u1ea5t b\u1ea1i \u2014 ki\u1ec3m tra l\u1ea1i th\u01b0 m\u1ee5c",
    st_img_bad: "D\u1eef li\u1ec7u \u1ea3nh kh\u00f4ng qua \u0111\u01b0\u1ee3c ki\u1ec3m tra to\u00e0n v\u1eb9n \u2014 h\u00e3y th\u00eam l\u1ea1i \u1ea3nh",
    st_auto_comp: "Gh\u00e9p t\u1ef1 \u0111\u1ed9ng: ch\u1ee7 th\u1ec3 IMAGE 1 \u2192 c\u1ea3nh tham chi\u1ebfu",
    create_ph: "M\u00f4 t\u1ea3 b\u1ee9c \u1ea3nh b\u1ea1n mu\u1ed1n",
    btn_create_ps: "\u2b07 G\u1eedi sang Photoshop",
    btn_to_ref: "\u21ba D\u00f9ng l\u00e0m Ref 1",
    st_to_ref: "\u0110\u00e3 n\u1ea1p k\u1ebft qu\u1ea3 v\u00e0o Ref 1 \u2713",
    cr_restyle: "\u267b \u0110\u1ed5i style k\u1ebft qu\u1ea3",
    cr_gal_empty: "Ch\u01b0a c\u00f3 k\u1ebft qu\u1ea3 \u2014 h\u00e3y b\u1ea5m Generate.",
    cr_gal_have: "k\u1ebft qu\u1ea3 \u00b7 ch\u1ea1m v\u00e0o \u1ea3nh nh\u1ecf \u0111\u1ec3 xem / thao t\u00e1c",
    cr_save: "\u2b07 L\u01b0u PNG",
    cr_need_result: "H\u00e3y t\u1ea1o m\u1ed9t \u1ea3nh tr\u01b0\u1edbc",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Preset cảnh từ Library — một chạm",
    wf_scene_loading: "Đang tải cảnh…",
    wf_scene_fail: "Không tải được cảnh từ Library — kiểm tra mạng",
    vid_no_inline: "Clip {n} đã sẵn sàng — bảng Photoshop này không phát được video. Bấm Download hoặc Open để mở bằng trình phát trên máy.",
    pick_title: "Chọn",
    pick_search: "Tìm…",
    pick_none: "Không có kết quả",
    wf_ready_generate: "Ảnh cần thiết đã sẵn sàng — bấm GENERATE.",
    wf_add_required: "Thêm các ảnh cần thiết.",
    wf_press_prepare: "Bấm Prepare để nạp workflow này và kiểm tra ảnh.",
    wf_opts: "Model \u00b7 Ratio \u00b7 S\u1ed1 l\u01b0\u1ee3ng \u00b7 Size",
    wf_model_auto: "Auto \u2014 workflow t\u1ef1 ch\u1ecdn",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "H\u00e3y ch\u1ec9nh \u00edt nh\u1ea5t m\u1ed9t slider ho\u1eb7c m\u00e0u retouch tr\u01b0\u1edbc",
    cap_warn: "Photoshop gi\u1edbi h\u1ea1n \u00f4 prompt n\u00e0y \u1edf:",
    btn_generate: "GENERATE",
    st_ready: "S\u1eb5n s\u00e0ng",
    st_capture: "\u0110ang l\u1ea5y t\u00e0i li\u1ec7u",
    st_gen: "\u0110ang t\u1ea1o\u2026",
    st_place: "\u0110ang \u0111\u1eb7t v\u00e0o Photoshop\u2026",
    st_placed_masked: "\u0110\u00e3 \u0111\u1eb7t th\u00e0nh nh\u00f3m Layer + Mask \u2014 \u1ea3nh g\u1ed1c nguy\u00ean v\u1eb9n \u2713",
    st_placed_plain: "\u0110\u00e3 \u0111\u1eb7t th\u00e0nh layer th\u01b0\u1eddng (host n\u00e0y kh\u00f4ng h\u1ed7 tr\u1ee3 mask/group)",
    stage_queued: "\u0110ang ch\u1edd",
    stage_uploading: "\u0110ang t\u1ea3i l\u00ean",
    stage_generating: "\u0110ang t\u1ea1o",
    stage_downloading: "\u0110ang t\u1ea3i v\u1ec1",
    stage_placing: "\u0110ang \u0111\u1eb7t",
    st_done: "Xong \u2713",
    st_err: "L\u1ed7i",
    st_no_doc: "Kh\u00f4ng c\u00f3 t\u00e0i li\u1ec7u \u0111ang m\u1edf \u2014 h\u00e3y m\u1edf m\u1ed9t \u1ea3nh tr\u01b0\u1edbc",
    st_no_prompt: "Prompt \u0111ang tr\u1ed1ng",
    st_new_doc: "K\u1ebft qu\u1ea3 \u0111\u00e3 m\u1edf th\u00e0nh t\u00e0i li\u1ec7u m\u1edbi \u2713",
    ai_wb_match: "Kh\u1edbp c\u00e2n b\u1eb1ng tr\u1eafng v\u1edbi \u1ea3nh g\u1ed1c",
    wb_matched: "\u0110\u00e3 kh\u1edbp c\u00e2n b\u1eb1ng tr\u1eafng ({n}%)",
    wb_already: "C\u00e2n b\u1eb1ng tr\u1eafng v\u1ed1n \u0111\u00e3 kh\u1edbp ({n}%)",
    before: "TR\u01af\u1edaC",
    after: "SAU",
    btn_place: "\u0110\u1eb7t v\u00e0o Photoshop",
    st_saved: "\u0110\u00e3 l\u01b0u \u2713",
    lib_choose_msg: "H\u00e3y ch\u1ecdn th\u01b0 m\u1ee5c Th\u01b0 vi\u1ec7n \u1ea3nh tham chi\u1ebfu HNK c\u1ee7a b\u1ea1n.",
    lib_unsupported: "\u0110\u1ecbnh d\u1ea1ng \u1ea3nh kh\u00f4ng h\u1ed7 tr\u1ee3",
    lib_restore_fail: "Kh\u00f4ng kh\u00f4i ph\u1ee5c \u0111\u01b0\u1ee3c \u1ea3nh tham chi\u1ebfu",
    on: "B\u1eacT",
    off: "T\u1eaeT",
    ai_history: "L\u1ecbch s\u1eed",
    ai_no_gen: "Ch\u01b0a c\u00f3 k\u1ebft qu\u1ea3 n\u00e0o.",
    ai_videos: "Video",
    ai_open: "Mở",
    ai_rerun: "Ch\u1ea1y l\u1ea1i",
    ai_reuse: "D\u00f9ng l\u1ea1i",
    ai_clear_hist: "X\u00f3a l\u1ecbch s\u1eed",
    ai_images: "H\u00ccNH \u1ea2NH",
    ai_add_ref: "+ Th\u00eam \u1ea3nh Reference",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "M\u00f4 t\u1ea3 \u0111i\u1ec1u b\u1ea1n mu\u1ed1n\u2026",
    ai_model_output: "MODEL & OUTPUT",
    ai_model_note: "AI Tools c\u00f3 c\u00e0i \u0111\u1eb7t model/size ri\u00eang, t\u00e1ch bi\u1ec7t v\u1edbi tab Setup v\u00e0 Create.",
    ai_auto_model: "Model t\u1ef1 \u0111\u1ed9ng",
    ai_wf_tools: "C\u00f4ng c\u1ee5 Workflow",
    ai_direct_gen: "T\u1ea1o tr\u1ef1c ti\u1ebfp",
    ai_identity_lock: "Kh\u00f3a nh\u1eadn d\u1ea1ng",
    ai_ref_transfer: "Chuy\u1ec3n Reference",
    ai_req_images: "\u1ea2nh b\u1eaft bu\u1ed9c",
    ai_opt_images: "\u1ea2nh t\u00f9y ch\u1ecdn",
    ai_model_lbl: "Model",
    ai_prepare: "Chu\u1ea9n b\u1ecb (t\u1ea3i & ki\u1ec3m tra)",
    ai_lib_bridge_off: "Host n\u00e0y kh\u00f4ng d\u00f9ng \u0111\u01b0\u1ee3c Library.",
    ai_lib_pick_first: "H\u00e3y ch\u1ecdn \u1ea3nh \u1edf tab Presets \u2192 Visual Library tr\u01b0\u1edbc.",
    ai_lib_load_fail: "Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c \u1ea3nh t\u1eeb Library.",
    ai_missing: "C\u00f2n thi\u1ebfu",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 th\u00eam model endpoint (N\u00e2ng cao \u2014 t\u00f9y ch\u1ecdn)",
    ai_rh_note: "C\u00e1c model t\u00edch h\u1ee3p \u0111\u00e3 ch\u1ea1y \u0111\u01b0\u1ee3c v\u1edbi key \u1edf tr\u00ean \u2014 kh\u00f4ng c\u1ea7n l\u00e0m g\u00ec. N\u1ebfu m\u1ed9t model hi\u1ec7n \"not connected\" (endpoint path ch\u01b0a \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn), h\u00e3y sao ch\u00e9p path t\u1eeb t\u00e0i li\u1ec7u API c\u1ee7a RunningHub v\u00e0 d\u00e1n v\u00e0o \u0111\u00e2y.",
    ai_rh_save: "L\u01b0u endpoint c\u1ee7a model n\u00e0y",
    ai_test_conn: "Ki\u1ec3m tra k\u1ebft n\u1ed1i",
    ai_add_layers: "Th\u00eam k\u1ebft qu\u1ea3 th\u00e0nh Layer m\u1edbi",
    ai_done: "Xong.",
    ai_result_ready: "K\u1ebft qu\u1ea3 \u0111\u00e3 s\u1eb5n s\u00e0ng.",
    ai_ready_nolayer: "K\u1ebft qu\u1ea3 \u0111\u00e3 s\u1eb5n s\u00e0ng (t\u00f9y ch\u1ecdn th\u00eam th\u00e0nh Layer \u0111ang t\u1eaft trong Settings).",
    ai_place_failed: "\u0110\u00e3 t\u1ea1o xong, nh\u01b0ng kh\u00f4ng \u0111\u1eb7t \u0111\u01b0\u1ee3c v\u00e0o Photoshop.",
    ai_place_failed_fix: "H\u00e3y m\u1edf m\u1ed9t t\u00e0i li\u1ec7u, r\u1ed3i ch\u1ea1y l\u1ea1i t\u1eeb History.",
    ai_placed_masked: "\u0110\u00e3 \u0111\u1eb7t v\u00e0o nh\u00f3m \u201c{name}\u201d d\u01b0\u1edbi d\u1ea1ng Layer + Mask \u2014 \u1ea3nh g\u1ed1c kh\u00f4ng b\u1ecb \u0111\u1ee5ng t\u1edbi.",
    ai_placed_group: "\u0110\u00e3 \u0111\u1eb7t v\u00e0o nh\u00f3m \u201c{name}\u201d d\u01b0\u1edbi d\u1ea1ng Layer m\u1edbi (host n\u00e0y kh\u00f4ng h\u1ed7 tr\u1ee3 mask).",
    ai_placed_plain: "\u0110\u00e3 \u0111\u1eb7t th\u00e0nh Layer m\u1edbi (host n\u00e0y kh\u00f4ng h\u1ed7 tr\u1ee3 group/mask).",
    ai_start_fail: "AI Tools kh\u00f4ng kh\u1edfi \u0111\u1ed9ng \u0111\u01b0\u1ee3c",
    wfin_subject: "\u1ea2nh c\u1ee7a b\u1ea1n (ch\u1ee7 th\u1ec3)",
    wfin_new_bg: "N\u1ec1n m\u1edbi (t\u00f9y ch\u1ecdn)",
    wfin_ref_scene: "C\u1ea3nh reference",
    wfin_style_ref: "Style reference (t\u00f9y ch\u1ecdn)",
    wfin_target_scene: "C\u1ea3nh \u0111\u00edch c\u00f3 ng\u01b0\u1eddi",
    wfin_base: "\u1ea2nh base",
    wfin_face_ref: "Reference khu\u00f4n m\u1eb7t / ch\u1ee7 th\u1ec3",
    wfin_portrait: "\u1ea2nh ch\u00e2n dung",
    wfin_image: "H\u00ecnh \u1ea3nh",
    wfin_object_ref: "Reference v\u1eadt th\u1ec3 (t\u00f9y ch\u1ecdn)",
    wfin_logo_ref: "Reference logo (t\u00f9y ch\u1ecdn)",
  },
  /* ---- Indonesian (id) — 587 keys, complete ---- */
  id: {
    rh_err_network: "Tidak dapat menjangkau RunningHub Enterprise — koneksi terputus. Periksa internet lalu coba lagi.",
    rh_err_task_failed: "Tugas RunningHub gagal — coba prompt/foto lain",
    rh_err_host_blocked: "Photoshop menolak host ini — manifest panel tidak mengizinkannya. Pasang panel terbaru.",
    rh_err_timeout: "Pembuatan terlalu lama — RunningHub tidak menjawab tepat waktu. Coba lagi, atau kurangi ukuran / jumlah.",
    rh_err_rate_limited: "RunningHub Enterprise sedang sibuk — tunggu sebentar lalu coba lagi.",
    rh_err_invalid_key: "RunningHub menolak key — periksa di Setup ▸ RunningHub Enterprise.",
    wf_exp_bg_replace: "Mengganti latar di belakang subjek. Orang, pose, tepi, dan pencahayaan tetap persis sama \u2014 hanya bagian di belakangnya yang berubah.",
    wf_exp_reference_transfer: "Mengambil seluruh adegan foto reference (tetapi BUKAN orang di dalamnya) lalu menempatkan subjek ANDA ke sana \u2014 menjaga identitas, pose, dan bingkai subjek, serta menyelaraskan cahaya dan perspektif adegan.",
    wf_exp_master_bgfg_replace: "Penggantian subjek dalam adegan yang paling ketat: menghapus orang dari adegan reference sepenuhnya, merekonstruksi latar dan latar depan yang tertutup secara alami, lalu menempatkan subjek Anda persis di titik itu \u2014 identitas, pose, proporsi, gaya rambut, busana, kulit, dan pencahayaan dikunci dari foto Anda, sedangkan reference hanya menyediakan adegan, sudut kamera, dan kedalaman.",
    wf_exp_subject_face: "Memadukan subjek atau wajah dari reference ke gambar base secara mulus, dengan komposisi base tetap utuh.",
    wf_exp_retouch: "Memberi retouch alami pada kulit, rambut, dan tona. Identitas, fitur, dan ekspresi tetap dipertahankan \u2014 tanpa kulit plastik, tanpa perubahan wajah.",
    wf_exp_upscale: "Memperbesar gambar sekaligus memulihkan detail alami pada kulit, rambut, dan kain. Identitas, pose, komposisi, dan warna tetap persis sama \u2014 tanpa penghalusan plastik.",
    wf_exp_object_edit: "Menghapus, mengganti, atau menambah objek lewat edit lokal yang terkontrol. Semua yang tidak Anda sentuh tetap sama.",
    wf_exp_water_edit: "Menambah atau mengedit air, pantulan, dan permukaan basah agar tampak wajar secara fisik, tanpa mengubah subjek Anda.",
    wf_exp_text_logo: "Menambah atau mengedit teks atau logo yang bersih dan mudah dibaca pada gambar, dengan komposisi tetap terjaga.",
    ai_key_lives_in_setup: "Key RunningHub Enterprise dikelola di tab Setup — simpan sekali, dipakai di mana saja.",
    ai_settings_defaults: "AI Tools — Bawaan",
    job_needkey: "Tambahkan key RunningHub di Setup dulu",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "Ganti foto profil",
    ava_remove: "Hapus foto",
    ava_saved: "Foto tersimpan",
    ava_removed: "Foto dihapus",
    ava_fail: "Gambar tidak bisa dipakai — coba yang lain",
    ava_working: "Menyiapkan foto…",
    upd_web: "Membuka Web App — ambil Panel di Account → Photoshop Panel.",
    money_intro: "Setiap GENERATE dicatat sebesar yang benar-benar ditagih RunningHub — bukan perkiraan. Saldo dibaca langsung dari akun RunningHub Anda.",
    money_bal: "Saldo",
    money_refresh: "Cek saldo",
    money_nokey: "Simpan kunci RunningHub dulu, baru saldo bisa dibaca.",
    money_fail: "Saldo tidak terbaca — buku di bawah tetap akurat. RunningHub menjawab:",
    money_never: "belum dicek",
    gate_sub_login: "Masuk dengan akun HNK Anda untuk memakai panel ini.",
    gate_email_ph: "Email",
    gate_pass_ph: "Kata sandi",
    gate_signin: "Masuk",
    gate_checking: "Memeriksa paket Anda…",
    gate_need: "Masukkan email dan kata sandi.",
    gate_bad: "Email atau kata sandi salah.",
    gate_wait: "Terlalu banyak percobaan masuk — ini bukan kata sandi salah. Tunggu sekitar 5 menit lalu coba lagi.",
    gate_busy: "Server sedang sibuk — tunggu beberapa detik lalu tekan Masuk lagi.",
    gate_offline: "Tidak ada internet — paket tidak bisa diperiksa. Sambungkan lalu periksa lagi.",
    gate_grace_gen: "Membuat gambar butuh internet. Panel terbuka dengan pemeriksaan terakhir, tetapi langkah ini harus mencapai server.",
    gate_grace_tag: "belum dikonfirmasi",
    gate_locked: "Satu pembayaran untuk keduanya — biaya pendaftaran dan biaya bulanan membuka aplikasi web DAN panel Photoshop ini. Beli atau perpanjang di website, lalu periksa lagi.",
    gate_buy: "Buka website",
    gate_retry: "Periksa lagi",
    gate_signout: "Keluar",
    gate_days: "sisa {D} hari",
    gate_grace: "Tidak ada internet — panel dibuka dengan hasil pemeriksaan lisensi terakhir yang sampai. Sambungkan untuk terus bekerja.",
    gate_open_fail: "Tidak bisa membuka browser. Alamat: {U}",
    gate_forgot: "Lupa kata sandi?",
    gate_session_ended: "Sesi Anda berakhir — masuk lagi.",
    gate_acct_off: "Akun ini ditutup — hubungi guru.",
    gate_confirm: "Alamat ini belum dikonfirmasi — buka email yang kami kirim.",
    gate_gone: "Akun ini sudah tidak ada — hubungi guru.",
    gate_server: "Server bermasalah — tunggu sebentar lalu coba lagi.",
    gate_service_down: "Tidak dapat menghubungi server lisensi — periksa internet lalu tekan Periksa lagi.",
    gate_no_lease: "Server tidak memberi lisensi panel — tekan Periksa lagi.",
    gate_sent_as: "Dikirim sebagai {E} · {N} karakter",
    btn_show: "Tampilkan",
    btn_save: "Simpan",
    st_need_key: "Masukkan RunningHub Enterprise key Anda dulu",
    qual_auto: "Otomatis",
    btn_clear: "Bersihkan",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "Berkas",
    btn_ref_web: "Web",
    st_ref_layer_added: "Layer ditambahkan sebagai referensi \u2713",
    st_photo_layer_added: "Layer ditambahkan sebagai foto ✓",
    st_ref_file_added: "Berkas ditambahkan sebagai referensi \u2713",
    st_importing: "Mengimpor berkas",
    url_ph: "https://\u2026 alamat gambar atau tautan pin Pinterest",
    btn_load: "Muat",
    btn_cancel: "Batal",
    btn_ok: "OK",
    wiz_promptnote: "Prompt terlindungi workflow sudah terisi — tambahkan yang Anda mau (mis. latar/teks) di bagian atas",
    st_url_loading: "Mengunduh gambar dari web",
    st_ref_web_added: "Gambar web ditambahkan sebagai referensi \u2713",
    st_url_bad: "Gagal memuat gambar dari URL ini \u2014 salin alamat gambarnya lalu coba lagi",
    no_layer: "Belum ada layer yang dipilih",
    st_web_import: "Diimpor ke Photoshop sebagai layer \u2713",
    st_folder_ok: "Folder ekspor ditetapkan \u2713",
    st_exported: "Terekspor \u2713",
    st_export_fail: "Ekspor gagal \u2014 periksa foldernya",
    st_img_bad: "Data gambar gagal pemeriksaan integritas \u2014 tambahkan ulang fotonya",
    st_auto_comp: "Komposit Otomatis: subjek IMAGE 1 \u2192 adegan referensi",
    create_ph: "Jelaskan gambar yang Anda inginkan",
    btn_create_ps: "\u2b07 Kirim ke Photoshop",
    btn_to_ref: "\u21ba Pakai sebagai Ref 1",
    st_to_ref: "Hasil dimuat ke Ref 1 \u2713",
    cr_restyle: "\u267b Ubah gaya hasil",
    cr_gal_empty: "Belum ada hasil \u2014 ketuk Generate.",
    cr_gal_have: "hasil \u00b7 ketuk gambar kecil untuk melihat / mengolah",
    cr_save: "\u2b07 Simpan PNG",
    cr_need_result: "Buat gambar dulu",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Preset adegan dari Library — satu ketuk",
    wf_scene_loading: "Memuat adegan…",
    wf_scene_fail: "Tidak bisa memuat adegan Library — periksa internet",
    vid_no_inline: "Klip {n} sudah siap — panel Photoshop ini tidak bisa memutar video. Tekan Download atau Open untuk membukanya di pemutar komputer.",
    pick_title: "Pilih",
    pick_search: "Cari…",
    pick_none: "Tidak ada yang cocok",
    wf_ready_generate: "Gambar yang diperlukan sudah siap — tekan GENERATE.",
    wf_add_required: "Tambahkan gambar yang diperlukan.",
    wf_press_prepare: "Tekan Prepare untuk memuat workflow ini dan memeriksa gambar.",
    wf_opts: "Model \u00b7 Ratio \u00b7 Jumlah \u00b7 Size",
    wf_model_auto: "Auto \u2014 pilihan workflow",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "Atur minimal satu slider atau warna retouch dulu",
    cap_warn: "Photoshop membatasi kotak prompt ini pada:",
    btn_generate: "GENERATE",
    st_ready: "Siap",
    st_capture: "Mengambil dokumen",
    st_gen: "Membuat\u2026",
    st_place: "Menempatkan ke Photoshop\u2026",
    st_placed_masked: "Ditempatkan sebagai grup Layer + Mask \u2014 aslinya tidak tersentuh \u2713",
    st_placed_plain: "Ditempatkan sebagai layer biasa (mask/group tidak tersedia di host ini)",
    stage_queued: "Antre",
    stage_uploading: "Mengunggah",
    stage_generating: "Membuat",
    stage_downloading: "Mengunduh",
    stage_placing: "Menempatkan",
    st_done: "Selesai \u2713",
    st_err: "Kesalahan",
    st_no_doc: "Tidak ada dokumen aktif \u2014 buka foto dulu",
    st_no_prompt: "Prompt masih kosong",
    st_new_doc: "Hasil dibuka sebagai dokumen baru \u2713",
    ai_wb_match: "Samakan white balance dengan foto asli",
    wb_matched: "White balance disamakan ({n}%)",
    wb_already: "White balance sudah sama ({n}%)",
    before: "SEBELUM",
    after: "SESUDAH",
    btn_place: "Tempatkan ke Photoshop",
    st_saved: "Tersimpan \u2713",
    lib_choose_msg: "Pilih folder Pustaka Gambar Referensi HNK Anda.",
    lib_unsupported: "Jenis gambar tidak didukung",
    lib_restore_fail: "Referensi tidak dapat dipulihkan",
    on: "AKTIF",
    off: "MATI",
    ai_history: "Riwayat",
    ai_no_gen: "Belum ada hasil.",
    ai_videos: "Video",
    ai_open: "Buka",
    ai_rerun: "Jalankan Ulang",
    ai_reuse: "Pakai Lagi",
    ai_clear_hist: "Hapus riwayat",
    ai_images: "GAMBAR",
    ai_add_ref: "+ Tambah gambar Reference",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "Jelaskan yang Anda inginkan\u2026",
    ai_model_output: "MODEL & OUTPUT",
    ai_model_note: "AI Tools punya pengaturan model/size sendiri, terpisah dari tab Setup dan Create.",
    ai_auto_model: "Model Otomatis",
    ai_wf_tools: "Alat Workflow",
    ai_direct_gen: "Buat Langsung",
    ai_identity_lock: "Kunci Identitas",
    ai_ref_transfer: "Transfer Reference",
    ai_req_images: "Gambar Wajib",
    ai_opt_images: "Gambar Opsional",
    ai_model_lbl: "Model",
    ai_prepare: "Siapkan (muat & periksa)",
    ai_lib_bridge_off: "Library tidak tersedia di host ini.",
    ai_lib_pick_first: "Pilih foto dari tab Presets \u2192 Visual Library dulu.",
    ai_lib_load_fail: "Gambar Library gagal dimuat.",
    ai_missing: "Belum ada",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 tambah model endpoint (Lanjutan \u2014 opsional)",
    ai_rh_note: "Model bawaan sudah berjalan dengan key di atas \u2014 tidak perlu diatur. Jika sebuah model menampilkan \"not connected\" (endpoint path-nya belum dipastikan), salin path dari dokumentasi API RunningHub lalu tempel di sini.",
    ai_rh_save: "Simpan endpoint model ini",
    ai_test_conn: "Uji koneksi",
    ai_add_layers: "Tambahkan hasil sebagai Layer baru",
    ai_done: "Selesai.",
    ai_result_ready: "Hasil siap.",
    ai_ready_nolayer: "Hasil siap (opsi tambah sebagai Layer nonaktif di Settings).",
    ai_place_failed: "Berhasil dibuat, tetapi gagal ditempatkan ke Photoshop.",
    ai_place_failed_fix: "Buka sebuah dokumen, lalu jalankan ulang dari History.",
    ai_placed_masked: "Ditempatkan ke grup \u201c{name}\u201d sebagai Layer + Mask \u2014 gambar asli tidak diubah.",
    ai_placed_group: "Ditempatkan ke grup \u201c{name}\u201d sebagai Layer baru (mask tidak tersedia di host ini).",
    ai_placed_plain: "Ditempatkan sebagai Layer baru (group/mask tidak tersedia di host ini).",
    ai_start_fail: "AI Tools gagal dijalankan",
    wfin_subject: "Foto Anda (subjek)",
    wfin_new_bg: "Latar baru (opsional)",
    wfin_ref_scene: "Adegan reference",
    wfin_style_ref: "Style reference (opsional)",
    wfin_target_scene: "Adegan target yang ada orangnya",
    wfin_base: "Gambar base",
    wfin_face_ref: "Reference wajah / subjek",
    wfin_portrait: "Foto potret",
    wfin_image: "Gambar",
    wfin_object_ref: "Reference objek (opsional)",
    wfin_logo_ref: "Reference logo (opsional)",
  },
  /* ---- Malay (ms) — 587 keys, complete ---- */
  ms: {
    rh_err_network: "Tidak dapat mencapai RunningHub Enterprise — talian terputus. Semak internet dan cuba lagi.",
    rh_err_task_failed: "Tugas RunningHub gagal — cuba prompt/foto lain",
    rh_err_host_blocked: "Photoshop menolak hos ini — manifest panel tidak membenarkannya. Pasang panel terkini.",
    rh_err_timeout: "Penjanaan terlalu lama — RunningHub tidak menjawab tepat pada masanya. Cuba lagi, atau kurangkan saiz / bilangan.",
    rh_err_rate_limited: "RunningHub Enterprise sibuk sekarang — tunggu sebentar dan cuba lagi.",
    rh_err_invalid_key: "RunningHub menolak key — semak di Setup ▸ RunningHub Enterprise.",
    wf_exp_bg_replace: "Menggantikan latar di belakang subjek. Orang, pose, tepi dan pencahayaan kekal sama \u2014 hanya bahagian di belakangnya berubah.",
    wf_exp_reference_transfer: "Mengambil keseluruhan adegan foto reference (tetapi BUKAN orang di dalamnya) dan meletakkan subjek ANDA ke dalamnya \u2014 mengekalkan identiti, pose dan bingkai subjek, serta memadankan cahaya dan perspektif adegan.",
    wf_exp_master_bgfg_replace: "Penggantian subjek dalam adegan yang paling ketat: membuang orang dari adegan reference sepenuhnya, membina semula latar dan latar depan yang terlindung secara semula jadi, kemudian meletakkan subjek anda tepat di tempat itu \u2014 identiti, pose, perkadaran, gaya rambut, pakaian, kulit dan pencahayaan dikunci dari foto anda, manakala reference hanya membekalkan adegan, sudut kamera dan kedalaman.",
    wf_exp_subject_face: "Menggabungkan subjek atau wajah dari reference ke imej base dengan lancar, sambil mengekalkan komposisi base.",
    wf_exp_retouch: "Memberikan retouch semula jadi pada kulit, rambut dan tona. Identiti, ciri wajah dan ekspresi dikekalkan \u2014 tiada kulit plastik, tiada perubahan wajah.",
    wf_exp_upscale: "Membesarkan imej sambil memulihkan perincian semula jadi pada kulit, rambut dan kain. Identiti, pose, komposisi dan warna kekal sama \u2014 tiada pelicinan plastik.",
    wf_exp_object_edit: "Membuang, mengganti atau menambah objek melalui suntingan setempat yang terkawal. Segala yang anda tidak sentuh kekal sama.",
    wf_exp_water_edit: "Menambah atau menyunting air, pantulan dan permukaan basah supaya kelihatan wajar dari segi fizikal, tanpa mengubah subjek anda.",
    wf_exp_text_logo: "Menambah atau menyunting teks atau logo yang bersih dan mudah dibaca pada imej, sambil mengekalkan komposisi.",
    ai_key_lives_in_setup: "Kunci RunningHub Enterprise diurus di tab Setup — simpan sekali, digunakan di mana-mana.",
    ai_settings_defaults: "AI Tools — Lalai",
    job_needkey: "Tambah kunci RunningHub di Setup dahulu",
    /* v6.46.0 — Setup follows the web app's own cards; these are the
       app's own strings, lifted verbatim so both surfaces read alike. */
    ava_change: "Tukar foto profil",
    ava_remove: "Buang foto",
    ava_saved: "Foto disimpan",
    ava_removed: "Foto dibuang",
    ava_fail: "Imej tidak boleh digunakan — cuba yang lain",
    ava_working: "Menyediakan foto…",
    upd_web: "Membuka Web App — dapatkan Panel di Account → Photoshop Panel.",
    money_intro: "Setiap GENERATE direkod pada jumlah yang RunningHub benar-benar caj — bukan anggaran. Baki dibaca terus daripada akaun RunningHub anda.",
    money_bal: "Baki",
    money_refresh: "Semak baki",
    money_nokey: "Simpan kunci RunningHub dahulu, barulah baki boleh dibaca.",
    money_fail: "Baki tidak dapat dibaca — lejar di bawah tetap tepat. RunningHub menjawab:",
    money_never: "belum disemak",
    gate_sub_login: "Log masuk dengan akaun HNK anda untuk menggunakan panel ini.",
    gate_email_ph: "E-mel",
    gate_pass_ph: "Kata laluan",
    gate_signin: "Log masuk",
    gate_checking: "Menyemak pelan anda…",
    gate_need: "Masukkan e-mel dan kata laluan.",
    gate_bad: "E-mel atau kata laluan salah.",
    gate_wait: "Terlalu banyak cubaan log masuk — ini bukan kata laluan salah. Tunggu kira-kira 5 minit dan cuba lagi.",
    gate_busy: "Pelayan sedang sibuk — tunggu beberapa saat dan tekan Log masuk lagi.",
    gate_offline: "Tiada internet — pelan tidak dapat disemak. Sambung, kemudian semak semula.",
    gate_grace_gen: "Menjana imej memerlukan internet. Panel terbuka dengan semakan terakhir, tetapi langkah ini mesti sampai ke pelayan.",
    gate_grace_tag: "belum disahkan",
    gate_locked: "Satu bayaran untuk kedua-duanya — yuran masuk dan yuran bulanan membuka apl web DAN panel Photoshop ini. Beli atau perbaharui di laman web, kemudian semak semula.",
    gate_buy: "Buka laman web",
    gate_retry: "Semak semula",
    gate_signout: "Log keluar",
    gate_days: "tinggal {D} hari",
    gate_grace: "Tiada internet — panel dibuka dengan semakan lesen terakhir yang sampai. Sambung untuk terus bekerja.",
    gate_open_fail: "Tidak dapat membuka pelayar. Alamat: {U}",
    gate_forgot: "Lupa kata laluan?",
    gate_session_ended: "Sesi anda tamat — log masuk semula.",
    gate_acct_off: "Akaun ini ditutup — hubungi guru.",
    gate_confirm: "Alamat ini belum disahkan — buka e-mel yang kami hantar.",
    gate_gone: "Akaun ini sudah tiada — hubungi guru.",
    gate_server: "Pelayan bermasalah — tunggu sebentar dan cuba lagi.",
    gate_service_down: "Tidak dapat menghubungi pelayan lesen — semak internet dan tekan Semak semula.",
    gate_no_lease: "Pelayan tidak memberi lesen panel — tekan Semak semula.",
    gate_sent_as: "Dihantar sebagai {E} · {N} aksara",
    btn_show: "Papar",
    btn_save: "Simpan",
    st_need_key: "Masukkan RunningHub Enterprise key anda dahulu",
    qual_auto: "Automatik",
    btn_clear: "Kosongkan",
    btn_ref_layer: "+ Layer",
    btn_ref_file: "Fail",
    btn_ref_web: "Web",
    st_ref_layer_added: "Layer ditambah sebagai rujukan \u2713",
    st_photo_layer_added: "Layer ditambah sebagai gambar ✓",
    st_ref_file_added: "Fail ditambah sebagai rujukan \u2713",
    st_importing: "Mengimport fail",
    url_ph: "https://\u2026 alamat imej atau pautan pin Pinterest",
    btn_load: "Muat",
    btn_cancel: "Batal",
    btn_ok: "OK",
    wiz_promptnote: "Prompt terlindung aliran kerja sudah diisi — tambah apa yang anda mahu (cth. latar/teks) di bahagian atas",
    st_url_loading: "Memuat turun imej web",
    st_ref_web_added: "Imej web ditambah sebagai rujukan \u2713",
    st_url_bad: "Tidak dapat memuatkan imej dari URL ini \u2014 salin alamat imej dan cuba lagi",
    no_layer: "Tiada layer dipilih",
    st_web_import: "Diimport ke Photoshop sebagai layer \u2713",
    st_folder_ok: "Folder eksport ditetapkan \u2713",
    st_exported: "Dieksport \u2713",
    st_export_fail: "Eksport gagal \u2014 periksa foldernya",
    st_img_bad: "Data imej gagal pemeriksaan integriti \u2014 tambah semula fotonya",
    st_auto_comp: "Komposit Automatik: subjek IMAGE 1 \u2192 adegan rujukan",
    create_ph: "Terangkan imej yang anda mahu",
    btn_create_ps: "\u2b07 Hantar ke Photoshop",
    btn_to_ref: "\u21ba Guna sebagai Ref 1",
    st_to_ref: "Hasil dimuat ke Ref 1 \u2713",
    cr_restyle: "\u267b Ubah gaya hasil",
    cr_gal_empty: "Belum ada hasil \u2014 ketik Generate.",
    cr_gal_have: "hasil \u00b7 ketik imej kecil untuk lihat / bertindak",
    cr_save: "\u2b07 Simpan PNG",
    cr_need_result: "Jana satu imej dahulu",
    /* v6.75.0 — a RunningHub refusal in the panel's own language (bootstrap.js status) */
    /* v6.76.0 — the Library scene presets under a Smart Workflow scene slot */
    wf_scene_presets: "Preset adegan dari Library — satu ketik",
    wf_scene_loading: "Memuatkan adegan…",
    wf_scene_fail: "Tidak dapat memuatkan adegan Library — semak internet",
    vid_no_inline: "Klip {n} sudah siap — panel Photoshop ini tidak boleh memainkan video. Tekan Download atau Open untuk membukanya dengan pemain komputer.",
    pick_title: "Pilih",
    pick_search: "Cari…",
    pick_none: "Tiada padanan",
    wf_ready_generate: "Gambar yang diperlukan sudah sedia — tekan GENERATE.",
    wf_add_required: "Tambah gambar yang diperlukan.",
    wf_press_prepare: "Tekan Prepare untuk memuatkan workflow ini dan menyemak gambar.",
    wf_opts: "Model \u00b7 Ratio \u00b7 Bilangan \u00b7 Size",
    wf_model_auto: "Auto \u2014 pilihan workflow",
    ro_faceRep: "Face Replace",
    ro_faceSwap: "Face Swap",
    ro_bgRep: "BG Replace",
    ro_bgSwap: "BG Swap",
    ro_fgRep: "FG Replace",
    ro_subSwap: "Subject Swap",
    ro_lcRef: "L&C Reference",
    ro_lcCopy: "L&C Copy-Paste",
    ro_dressRef: "Dress Reference",
    ro_dressRep: "Dress Replace",
    ro_mkCopy: "Makeup Copy",
    ro_matchBtn: "\u2605 MASTER MATCH",
    rt_none: "Tetapkan sekurang-kurangnya satu slider atau warna retouch dahulu",
    cap_warn: "Photoshop mengehadkan kotak prompt ini kepada:",
    btn_generate: "GENERATE",
    st_ready: "Sedia",
    st_capture: "Mengambil dokumen",
    st_gen: "Menjana\u2026",
    st_place: "Meletakkan ke Photoshop\u2026",
    st_placed_masked: "Diletakkan sebagai kumpulan Layer + Mask \u2014 asal tidak disentuh \u2713",
    st_placed_plain: "Diletakkan sebagai layer biasa (mask/group tiada pada host ini)",
    stage_queued: "Menunggu",
    stage_uploading: "Memuat naik",
    stage_generating: "Menjana",
    stage_downloading: "Memuat turun",
    stage_placing: "Meletakkan",
    st_done: "Selesai \u2713",
    st_err: "Ralat",
    st_no_doc: "Tiada dokumen aktif \u2014 buka foto dahulu",
    st_no_prompt: "Prompt masih kosong",
    st_new_doc: "Hasil dibuka sebagai dokumen baharu \u2713",
    ai_wb_match: "Selaraskan white balance dengan foto asal",
    wb_matched: "White balance diselaraskan ({n}%)",
    wb_already: "White balance sudah sama ({n}%)",
    before: "SEBELUM",
    after: "SELEPAS",
    btn_place: "Letak ke Photoshop",
    st_saved: "Disimpan \u2713",
    lib_choose_msg: "Pilih folder Pustaka Imej Rujukan HNK anda.",
    lib_unsupported: "Jenis imej tidak disokong",
    lib_restore_fail: "Rujukan tidak dapat dipulihkan",
    on: "HIDUP",
    off: "MATI",
    ai_history: "Sejarah",
    ai_no_gen: "Belum ada hasil.",
    ai_videos: "Video",
    ai_open: "Buka",
    ai_rerun: "Jalan Semula",
    ai_reuse: "Guna Semula",
    ai_clear_hist: "Kosongkan sejarah",
    ai_images: "IMEJ",
    ai_add_ref: "+ Tambah imej Reference",
    ai_prompt: "PROMPT",
    ai_prompt_ph: "Terangkan apa yang anda mahu\u2026",
    ai_model_output: "MODEL & OUTPUT",
    ai_model_note: "AI Tools ada tetapan model/size sendiri, berasingan daripada tab Setup dan Create.",
    ai_auto_model: "Model Automatik",
    ai_wf_tools: "Alat Workflow",
    ai_direct_gen: "Jana Terus",
    ai_identity_lock: "Kunci Identiti",
    ai_ref_transfer: "Pindah Reference",
    ai_req_images: "Imej Diperlukan",
    ai_opt_images: "Imej Pilihan",
    ai_model_lbl: "Model",
    ai_prepare: "Sedia (muat & semak)",
    ai_lib_bridge_off: "Library tidak tersedia pada host ini.",
    ai_lib_pick_first: "Pilih foto dari tab Presets \u2192 Visual Library dahulu.",
    ai_lib_load_fail: "Imej Library gagal dimuatkan.",
    ai_missing: "Belum ada",
    ai_library: "Library",
    ai_rh_sec: "RunningHub \u2014 tambah model endpoint (Lanjutan \u2014 pilihan)",
    ai_rh_note: "Model terbina dalam sudah berfungsi dengan key di atas \u2014 tiada apa perlu dibuat. Jika sesuatu model memaparkan \"not connected\" (endpoint path belum disahkan), salin path dari dokumentasi API RunningHub dan tampal di sini.",
    ai_rh_save: "Simpan endpoint model ini",
    ai_test_conn: "Uji sambungan",
    ai_add_layers: "Tambah hasil sebagai Layer baharu",
    ai_done: "Selesai.",
    ai_result_ready: "Hasil sedia.",
    ai_ready_nolayer: "Hasil sedia (pilihan tambah sebagai Layer dimatikan dalam Settings).",
    ai_place_failed: "Berjaya dijana, tetapi gagal diletakkan ke Photoshop.",
    ai_place_failed_fix: "Buka satu dokumen, kemudian jalankan semula dari History.",
    ai_placed_masked: "Diletakkan ke dalam kumpulan \u201c{name}\u201d sebagai Layer + Mask \u2014 imej asal tidak disentuh.",
    ai_placed_group: "Diletakkan ke dalam kumpulan \u201c{name}\u201d sebagai Layer baharu (mask tiada pada host ini).",
    ai_placed_plain: "Diletakkan sebagai Layer baharu (group/mask tiada pada host ini).",
    ai_start_fail: "AI Tools gagal dimulakan",
    wfin_subject: "Foto anda (subjek)",
    wfin_new_bg: "Latar baharu (pilihan)",
    wfin_ref_scene: "Adegan reference",
    wfin_style_ref: "Style reference (pilihan)",
    wfin_target_scene: "Adegan sasaran yang ada orang",
    wfin_base: "Imej base",
    wfin_face_ref: "Reference wajah / subjek",
    wfin_portrait: "Foto potret",
    wfin_image: "Imej",
    wfin_object_ref: "Reference objek (pilihan)",
    wfin_logo_ref: "Reference logo (pilihan)",
  }
};
/*I18N_END*/

/* Supported UI languages. `code` matches an I18N table; `label` is the short chip
   shown in the header picker; `native` is the endonym used in the dropdown. Any
   key missing from a language falls back to English via t(). */
/* v6.10: one version source, painted into the header, plus a once-a-day
   update probe against the site so studios stop running stale builds. The
   probe is fail-silent: offline hosts and blocked networks just skip it. */
const PANEL_VERSION = "6.178.0";
const PANEL_VERSION_URL = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/download/panel-version.json";
function panelVerNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return false;
}
function paintPanelVersion(doc) {
  try {
    const el = (doc || document).getElementById("brandVer");
    if (el) el.textContent = "v" + PANEL_VERSION;
  } catch (e) {}
}
let _updChecked = false;
async function checkPanelUpdate(doc) {
  try {
    /* one probe per panel launch — no persistence needed, and a studio that
       leaves Photoshop open for days still gets a fresh probe next launch */
    if (_updChecked) return;
    _updChecked = true;
    const r = await hnkFetch(PANEL_VERSION_URL, { cache: "no-store" }, 15000);
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.v && panelVerNewer(j.v, PANEL_VERSION)) {
      _updLatest = String(j.v);
      try { renderAbout(); } catch (e) { }
      const el = (doc || document).getElementById("brandVer");
      if (el) {
        el.textContent = "v" + PANEL_VERSION + " → v" + j.v + " ရနိုင်ပြီ";
        el.style.color = "#f4d488";
        el.title = "Panel update available — download the new CCX from the HNK site";
      }
    }
  } catch (e) {}
}

/* ==========================================================================
   v6.22.0 — ACCOUNT GATE

   Until this release the panel was the hole in the paywall. The web app has
   been behind a joining fee plus a monthly fee since v5.31.0; anyone who
   found the .ccx got the whole panel free, forever. One HNK account now opens
   BOTH products, and one payment buys the pair — the joining fee and the
   monthly fee are for the web app AND this panel together, not one each.

   SELLING HAPPENS ON THE WEBSITE. The panel never takes money, never shows a
   QR, never uploads a slip. It signs in, reads the plan the website sold, and
   sends people to the buy screen when there is nothing to read. There is one
   price list and it lives in app_settings, which is why no amount is written
   into this file: a number hardcoded here would go stale the day the owner
   changes it in the dashboard.

   SECURITY BOUNDARY. The overlay is only the visible part of the gate. The
   authoritative decision is made by the HNK API from live account, license,
   permission, session, device and version state. The official panel obtains a
   short lease at launch/focus and revalidates before every provider operation.
   A CCX remains inspectable client code, so a determined attacker can patch a
   local copy; the server-side checks protect the supported package and every
   HNK-controlled capability without putting a server secret in this archive.

   FAIL-CLOSED. The overlay ships VISIBLE in index.html and JavaScript is what
   takes it down. A parse error, a thrown exception, a missing element, an
   offline API, or a revoked lease leaves the panel locked rather than open.
   ========================================================================== */
const GATE_API_URL = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/api";
/* v6.102.2 — the website button opens the official public origin (5.50.3 made hnkaistudio.com the one address
   students know); the DigitalOcean default host is the API's address, not the studio's. */
const GATE_BUY_URL = "https://hnkaistudio.com/app/";
const GATE_TIMEOUT = 20000;
const GATE_DAY = 86400000;
const GATE_LEASE_REFRESH_MS = 180000;

const gateS = {
  sess: null, entitlement: null, lease: "", leaseExp: 0, devId: "",
  enrolled: false, busy: false, view: "", run: 0, updateRequired: false,
  timer: null,
  /* v6.43.0 — consecutive validates that never reached the server, and the
     earliest moment the automatic beat may try again. See gateHeartbeat. */
  netFails: 0, nextBeat: 0,
  /* v6.73.0 — the panel is open on a remembered verdict rather than a live
     lease. Never true at the same time as a valid lease; see gateGraceOpen. */
  graceOpen: false,
  /* the app's acc.prof / acc.devices / profOffline — the profiles row, the
     enrolled devices list and "the profiles read failed" for the Setup card. */
  prof: null, devices: [], profOffline: false
};

/* Every gateCheck takes a ticket. It is reachable from boot, from the Retry
   button and from sign-in, each of which awaits two network round trips, and a
   measured failure had two runs interleaving: a slow boot check for the
   account already on disk finished AFTER a different account had signed in,
   and quietly restored the first account's session over the second's. A run
   whose ticket is no longer the current one writes nothing and paints
   nothing. */
function gateStale(ticket) { return ticket !== gateS.run; }

function gateEl(id) { try { return document.getElementById(id); } catch (e) { return null; } }
/* v6.25.1 — PLAIN textContent, NOTHING ELSE. The 6.25.0 attempt wrapped
   button labels in a span, and on real Photoshop the whole gate rendered
   half-empty: UXP's button widget does not reliably accept element children,
   and one throw mid-gateTexts() left password, Sign in and the language
   labels unset. Label visibility is handled purely with styles now (see
   gateApplyWidgetStyles below), so this helper can never take the gate down. */
function gateTxt(id, s) { const el = gateEl(id); if (el) el.textContent = s || ""; }
function gateT(k) { try { return t(k); } catch (e) { return k; } }
/* v6.102.3 — the line is a banner while it has text and takes no room while
   empty: two single-class states (no compound selector, per the UXP cascade
   rule this gate follows). textContent first, so a class that fails to apply
   still leaves the message readable. */
function gateErr(s) {
  gateTxt("gateErr", s);
  const el = gateEl("gateErr");
  if (el) { try { el.className = s ? "gate-err-on" : "gate-err"; } catch (e) { } }
}

function gateHeaders(tok, json) {
  const h = { "Accept": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
/* hnkFetch carries the timeout and retry. There is deliberately no cached
   authorization fallback: an unreachable license service is fail-closed. */
async function gateReq(path, opts, tok) {
  const o = Object.assign({}, opts || {});
  o.headers = Object.assign({}, gateHeaders(tok, !!o.body), o.headers || {});
  return await hnkFetch(GATE_API_URL + path, o, GATE_TIMEOUT);
}

function gateUuid() {
  let s = "";
  for (let i = 0; i < 32; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
  return s.slice(0, 8) + "-" + s.slice(8, 12) + "-4" + s.slice(13, 16) +
         "-a" + s.slice(17, 20) + "-" + s.slice(20, 32);
}
function gateDevLabel() {
  let plat = "";
  try { plat = (typeof navigator !== "undefined" && navigator.platform) ? String(navigator.platform) : ""; }
  catch (e) { }
  return ("Photoshop panel" + (plat ? " · " + plat : "")).slice(0, 60);
}

/* Only the refresh token is persisted. The access token is short-lived and
   re-minted at every launch, so writing it to disk would buy nothing and
   leave one more credential lying in the data folder. */
function gateSaveSess(j) {
  if (!j || !j.access_token) return false;
  const u = (j.user && typeof j.user === "object") ? j.user : j;
  const uid = (u && u.id) || (gateS.sess && gateS.sess.uid) || "";
  if (!uid) return false;
  gateS.sess = {
    access: j.access_token,
    refresh: j.refresh_token || (gateS.sess && gateS.sess.refresh) || "",
    uid: uid,
    email: (u && u.email) || (gateS.sess && gateS.sess.email) || ""
  };
  state.accRefresh = gateS.sess.refresh;
  state.accUid = gateS.sess.uid;
  state.accEmail = gateS.sess.email;
  saveSettings();
  return true;
}
function gateForget() {
  gateS.sess = null; gateS.entitlement = null; gateS.lease = "";
  gateS.leaseExp = 0; gateS.enrolled = false; gateS.updateRequired = false;
  gateS.prof = null; gateS.devices = []; gateS.profOffline = false;
  _accSessSeen = false;
  gatePaintPlan();
  state.accRefresh = ""; state.accUid = ""; state.accEmail = "";
  state.accProfile = null; state.accSeenAt = 0;
  state.accSeenUid = ""; state.accSeenDev = ""; gateS.graceOpen = false;
  state.accAvatar = "";           /* v6.27.0 — the photo leaves with the session */
  saveSettings();
  try { gatePaintAvatar(); } catch (e) { }
  /* the Setup ACCOUNT card follows: signed-out welcome, auth group open */
  try { accRender(); accRenderDevices(); renderSetupStatus(); accOpenGrp("accGrpAuth"); } catch (e) { }
}

/* Refresh-token rotation happens at the unified backend. A network failure is
   not proof that the credential is dead, so it is retained for the next retry;
   it still never grants access because the panel remains locked without a
   freshly validated lease. */
async function gateRefresh(ticket) {
  if (!gateS.sess || !gateS.sess.refresh) return "dead";
  /* v6.31.0 — one refresh at a time. Boot, the heartbeat and a focus event
     can all want a refresh in the same instant; racing two rotations used
     to spend the same token twice and misread the second answer as a dead
     session. Everyone awaits the single in-flight call instead. (The
     server now also accepts the immediately-previous token once, so even
     a lost reply no longer strands the stored credential.) */
  if (gateS.refreshing) return gateS.refreshing;
  gateS.refreshing = (async () => {
    try {
      const r = await gateReq("/auth/v1/token?grant_type=refresh_token",
        { method: "POST", body: JSON.stringify({ refresh_token: gateS.sess.refresh }) }, null);
      /* the answer to a question nobody is waiting for is not written to disk */
      if (ticket !== undefined && gateStale(ticket)) return "stale";
      if (r.ok) {
        const j = await r.json();
        return gateSaveSess(j) ? true : "dead";
      }
      if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 422) return "dead";
      return "offline";
    } catch (e) { return "offline"; }
  })();
  try { return await gateS.refreshing; }
  finally { gateS.refreshing = null; }
}

/* Three outcomes, and the difference between them is the whole point:

     dead      the session is gone (401, after a refresh that just succeeded)
     offline   the server did not ANSWER -- unreachable, or any non-2xx that
               is not a 401. Routing a 500 here rather than shrugging matters:
               the first version of this fell through to the cached profile on
               a 5xx, so a server erroring forever granted PERMANENT access off
               a stale cache, outside the grace window and outside every time
               bound in this file. Now it gets the bounded window like any
               other outage.
     answered  a real 200. `prof` may be null, and null is a definitive "there
               is no such profile" -- which must CLEAR the cache, not leave the
               last good one standing. */

/* Mirrors the web app's isPremium() field for field. BOTH fields, because the
   server extends plan_expires_at on approval but never sweeps plan_status back
   to "none" when a plan lapses -- a status-only check grants Premium forever. */
function gatePremium(p) {
  if (!p) return false;
  if (p.plan_status !== "active") return false;
  if (!p.plan_expires_at) return false;
  const exp = Date.parse(p.plan_expires_at);
  if (isNaN(exp)) return false;
  return exp > Date.now();
}
function gateDaysLeft(p) {
  if (!p || !p.plan_expires_at) return 0;
  const ms = Date.parse(p.plan_expires_at) - Date.now();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.ceil(ms / GATE_DAY));
}
/* ==========================================================================
   v6.73.0 — THE COLD-BOOT GRACE, AND EXACTLY WHAT IT DOES NOT GRANT.

   6.70.0 gave the WEB APP a six-hour grace: a boot on a dead line starts from
   the last verified verdict instead of the wall. The owner asked (2026-09-12)
   for the panel to have it too, and the panel's gate is a different mechanism,
   so this is deliberately a SMALLER grant than the web app's, not an equal one.

   WHAT OPENS. The overlay, and nothing behind it that needs a server. The
   panel's real authorization is gateRequireLease, the choke point every
   provider operation crosses, and it still demands a live lease from
   gateValidate — this code never writes gateS.lease and never can. So during
   the grace a retoucher keeps Retouch A/B, the whole GPU preview, the Imagine
   template browser and the Setup card, and a Generate is refused.

   THAT REFUSAL COSTS NOTHING, which is the argument for the whole design: a
   generate calls RunningHub. It could not succeed offline whatever this gate
   decided. The only thing an offline grace can buy is the LOCAL work, and the
   local work is exactly what it buys.

   THE BOUNDS, each one a way for this to answer no:
     - only a verified 2xx validate ever writes the record. Every refusal the
       server actually sent deletes it, so a suspended account, a revoked seat
       or a blocked build is dead the moment the panel reaches the server once;
     - the six hours run from the SUCCESS, not from boot, so staying offline
       cannot extend anything — a machine dark for seven hours boots to the wall;
     - the record carries the account and the installation it was earned by and
       is ignored for any other, and it is left out of the backup file;
     - the plan's own expiry still rules. No readable expiry, or one that has
       passed, is no grace — gatePremium's own comment says why a status-only
       check grants Premium forever;
     - a clock moved backwards is refused rather than trusted;
     - and updateRequired is never graced: a build the server blocked stays
       blocked.

   NOT THE RETIRED PATH. A seven-day offline grace once existed and was removed;
   retiredOfflineDaysLeft/retiredOfflineEligible just below are its tombstones,
   dead code kept as a record of what the policy used to be. This is six hours,
   not seven days, and it opens the overlay rather than the lease.
   ========================================================================== */
const GATE_GRACE_MS = 6 * 3600000;      /* the web app's UNIFIED_GRACE_MS exactly */

/* The expiry the stored entitlement carries, read the way gatePaintPlan reads
   it — the validate body may nest the licence or may not. */
function gateGraceExpiry(p) {
  const lic = (p && (p.license || p)) || {};
  const raw = lic.expires_at || lic.plan_expires_at || null;
  const t = raw ? Date.parse(raw) : NaN;
  return isNaN(t) ? 0 : t;
}
/* Milliseconds of grace left, or 0 for every reason there is to refuse. */
function gateGraceLeft() {
  if (gateS.updateRequired) return 0;
  if (!gateS.sess || !gateS.sess.uid) return 0;
  const p = state.accProfile;
  if (!p || typeof p !== "object") return 0;
  if (!state.accSeenUid || state.accSeenUid !== gateS.sess.uid) return 0;
  if (!state.accSeenDev || state.accSeenDev !== gateS.devId) return 0;
  const seen = Number(state.accSeenAt) || 0, now = Date.now();
  if (seen <= 0 || seen > now + 60000) return 0;        /* the clock moved */
  const left = GATE_GRACE_MS - (now - seen);
  if (left <= 0) return 0;
  const exp = gateGraceExpiry(p);
  if (!exp || exp <= now) return 0;                     /* the plan's own date wins */
  return left;
}
/* Written only where the server actually said yes. The disk write is throttled
   to a minute because gateRequireLease validates before EVERY provider
   operation and this is a file on the student's disk; a timestamp up to a
   minute stale only ever SHORTENS the grace, which is the safe direction. */
function gateGraceRemember() {
  try {
    if (!gateS.sess || !gateS.sess.uid || !gateS.entitlement) return;
    const now = Date.now();
    const moved = state.accSeenUid !== gateS.sess.uid || state.accSeenDev !== gateS.devId;
    if (!moved && now - (Number(state.accSeenAt) || 0) < 60000) return;
    state.accSeenAt = now;
    state.accSeenUid = gateS.sess.uid;
    state.accSeenDev = gateS.devId;
    saveSettings();
  } catch (e) { }
}
/* A refusal the server actually sent must not be survivable by relaunching
   Photoshop, so every one of them comes through here. */
function gateGraceForget() {
  try {
    gateS.graceOpen = false;
    state.accProfile = null; state.accSeenAt = 0;
    state.accSeenUid = ""; state.accSeenDev = "";
    saveSettings();
  } catch (e) { }
}
/* Open the panel on the remembered verdict. Returns false when there is
   nothing to open on, and the caller locks exactly as it did before. */
function gateGraceOpen() {
  if (gateGraceLeft() <= 0) return false;
  gateS.graceOpen = true;
  gateS.entitlement = state.accProfile;
  gateUnlock();
  try { gatePaintPlan(); } catch (e) { }
  try { homeRefresh(); } catch (e) { }
  try { setStatus(gateT("gate_grace"), "err"); } catch (e) { }
  return true;
}

/* ---------------- views ---------------- */
/* Every string on the card, and nothing else. Safe to call at any time. */
function gateTexts() {
  const busy = (gateS.view === "checking");
  gateTxt("gateSub", busy ? gateT("gate_checking")
                   : (gateS.view === "locked") ? "" : gateT("gate_sub_login"));
  /* The locked explainer only when actually locked: the div itself now stays
     in the layout in every state (v6.26.1), so the text must be state-driven
     or the login screen would open with an alarming "access" paragraph. */
  /* v6.31.0 — welcome-back: while the remembered session re-validates, the
     card greets the member by the address it remembers instead of sitting
     silent next to an empty login form. */
  gateTxt("gateLockedMsg",
    (gateS.view === "locked") ? gateT("gate_locked") :
    (gateS.view === "checking" && gateS.sess && gateS.sess.email)
      ? ("\ud83d\udc4b " + gateS.sess.email + " — " + gateT("gate_checking")) : "");
  gateTxt("gateSignIn", gateT("gate_signin"));
  gateTxt("gateBuy", gateT("gate_buy"));
  gateTxt("gateRetry", gateT("gate_retry"));
  gateTxt("gateSignOut", gateT("gate_signout"));
  /* v6.102.3 — the field names moved from placeholder to a label above each
     field (they stay readable once the student has typed); the placeholders
     now show the shape of what goes in. The kicker names the surface and the
     version from PANEL_VERSION, so no version is ever typed into index.html. */
  gateTxt("gateEmailLbl", gateT("gate_email_ph"));
  gateTxt("gatePassLbl", gateT("gate_pass_ph"));
  const em = gateEl("gateEmail"), pw = gateEl("gatePass");
  if (em) em.placeholder = "name@example.com";
  if (pw) pw.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  gateTxt("gateForgot", gateT("gate_forgot"));
  gateTxt("gateKicker", "Photoshop Panel \u00b7 v" + PANEL_VERSION);
}
function gateShow(view) {
  gateS.view = view;
  const g = gateEl("hnkGate"); if (g) g.classList.remove("off");
  /* display, driven from JavaScript. The draft this replaces hid .app with a
     CSS rule, `#hnkGate:not(.off) ~ .app{visibility:hidden;pointer-events:none}`,
     and three of its four pieces are things this codebase will not vouch for:
     styles.css's own header says "UXP-SAFE: ... no pointer-events" and
     main.js:11216 repeats it in prose ("UXP has NO pointer-events:none"), while
     `:not()` and the `~` combinator appear zero times in the panel's 860-line
     stylesheet. (visibility itself is fine -- Adobe documents it as supported
     since UXP v3.0 -- but it was carried by a selector that is not.) Chromium,
     which the test drives, supports all four, so the assertions were green for
     a wall that may not have covered anything. display:none set from JS is what
     the other 28 show/hide sites in this file already use. */
  const appEl = gateEl("app"); if (appEl) appEl.style.display = "none";
  /* v6.26.1 — the whole card stays visible in every state (owner request):
     hiding the login and locked groups made the "checking" interim look like
     a broken dialog with one orphan input. State now changes only the
     message strings (gateTexts) and the busy dimming (gateBusy); handlers
     that must not run mid-check already guard on gateS.busy. */
  const login = gateEl("gateLogin"), locked = gateEl("gateLocked");
  if (login) login.className = "";
  if (locked) locked.className = "";
  gateTexts();
  /* v6.47.0 — emphasis follows the view: gold on "Open website" only where it
     is the way out. gateS.view is already set above, so this reads the new
     state, not the one being left. */
  try { gatePaintPrimary(); } catch (e) { }
  if (view !== "checking") gateBusy(false);
}
function gateBusy(on) {
  gateS.busy = !!on;
  const mark = function (id, extra) {
    const el = gateEl(id);
    if (!el) return;
    el.disabled = !!on;
    el.className = (on ? "gate-b gate-busy" : "gate-b") + (extra ? " " + extra : "");
  };
  mark("gateSignIn", "");
  mark("gateBuy", "");
  mark("gateRetry", "gate-b2");
  mark("gateSignOut", "gate-b2");
}
function gateUnlock() {
  const g = gateEl("hnkGate"); if (g) g.classList.add("off");
  const appEl = gateEl("app"); if (appEl) appEl.style.display = "";
  gateS.view = "open";
  gatePaintPlan();
}
/* v6.27.0 — UI/UX parity with the web app's account circle: the member's
   profile photo (saved on the website, 256px square center-crop, bounded by
   profiles_avatar_chk) fills the gate's identity square; the HNK mark stays
   the fallback. The panel only DISPLAYS it — changing the photo lives in
   the web app's account card. Same shape bounds as the web app, re-checked
   here because a settings file is user-editable disk. */
const GATE_AVA_MAX = 98304;
const GATE_AVA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function gateAvaOk(a) {
  return typeof a === "string" && a.length <= GATE_AVA_MAX && GATE_AVA_RE.test(a);
}
function gatePaintAvatar() {
  const img = gateEl("gateLogoImg"), txt = gateEl("gateLogoTxt");
  const a = gateAvaOk(state.accAvatar) ? state.accAvatar : "";
  if (img) {
    if (a) { img.src = a; img.style.display = "block"; }
    else { clearSrc(img); img.style.display = "none"; }
  }
  if (txt) txt.style.display = a ? "none" : "";
}
/* The app's own profiles read (acc.prof): name, email, member-since, plan,
   allowed devices and the photo all ride on one row. profOffline is what the
   ACCOUNT card shows when the read failed (the app's acc_offline line). */
async function gateProfileRefresh() {
  try {
    if (!gateS.sess || !gateS.sess.uid || !gateS.sess.access) return;
    const r = await gateReq("/rest/v1/profiles?select=*&id=eq." +
      encodeURIComponent(gateS.sess.uid) + "&limit=1", { method: "GET" }, gateS.sess.access);
    gateS.profOffline = !r.ok;
    if (r.ok) {
      const rows = await r.json().catch(function () { return null; });
      const row = rows && rows[0] ? rows[0] : null;
      if (row) gateS.prof = row;
      if (row) homeRefresh();   /* the greeting can now use the member's name */
      const a = row ? row.avatar : "";
      const next = gateAvaOk(a) ? a : "";
      if (next !== state.accAvatar) {
        state.accAvatar = next;
        saveSettings();
        gatePaintAvatar();
      }
    }
  } catch (e) { gateS.profOffline = true; }
  try { accRender(); renderSetupStatus(); gatePaintPlan(); } catch (e) { }
}

/* ---------------- v6.47.0 CHOOSING the profile photo ----------------
   The website has let a member save a photo since 5.49.0 and this panel has
   SHOWN it since 6.27.0 — but a customer whose Photoshop is the only place
   they ever open the studio had no way to set one, and the teacher's member
   list showed them as a grey initial forever. Setup > ACCOUNT now picks it.

   The picture travels the website's own road: the same 256px SQUARE centre
   crop, the same public.profiles.avatar column, the same PATCH under the
   member's own session — so RLS still says "your row only", the schema's
   profiles_avatar_chk still bounds what lands, and ONE photo serves the gate
   square, the website's account card and the admin console alike.

   Photoshop does the imaging, because UXP is not a browser: there is no
   canvas to draw a downscale on. The file is opened, its centre square read
   straight out of imaging.getPixels at the target size, and the document
   closed again — the open/capture/close the reference importer has used
   since v1, with sourceBounds doing the crop instead of a second pass.

   Three sides, not one: encodeImageData picks its own JPEG quality, so a
   busy 256px crop can still land over the 96KB the column accepts. Rather
   than guess at an encoder option this renderer may not take, the capture
   steps down until the result fits, and says so plainly if none of them
   does. */
const AVA_SIDES = [256, 192, 160];

async function avaCaptureSquare(entry, side) {
  let out = "";
  await psCore.executeAsModal(async function () {
    const doc = await app.open(entry);
    let px = null;
    try {
      const dw = Number(doc.width), dh = Number(doc.height);
      const sq = Math.max(1, Math.min(dw, dh));
      const left = Math.max(0, Math.round((dw - sq) / 2));
      const top = Math.max(0, Math.round((dh - sq) / 2));
      px = await imaging.getPixels({
        documentID: doc.id, componentSize: 8, applyAlpha: true,
        sourceBounds: { left: left, top: top, right: left + sq, bottom: top + sq },
        targetSize: { width: side, height: side }
      });
      out = await encodeCaptureB64(px.imageData);
    } finally {
      /* always, even when encoding throws: an unclosed temporary document is
         invisible to the customer and holds native pixel memory. */
      try { if (px && px.imageData && px.imageData.dispose) px.imageData.dispose(); } catch (de) { }
      try { await doc.closeWithoutSaving(); } catch (ce) { }
    }
  }, { commandName: "HNK Profile Photo" });
  return out;
}

/* The ACCOUNT card's square. Same rule as the gate's: the photo when there is
   a valid one, the HNK mark otherwise — and the remove button exists only
   when there is something to remove. */
function avaPaint() {
  /* the Setup ACCOUNT card's hero (the app's accAvaRender) owns the photo now */
  try { accAvaRender(); } catch (e) { }
}

/* One writer for both buttons: "" removes, a data URL sets. */
async function avaSave(url) {
  if (!gateS.sess || !gateS.sess.uid || !gateS.sess.access) return;
  const r = await gateReq("/rest/v1/profiles?id=eq." + encodeURIComponent(gateS.sess.uid),
    { method: "PATCH", body: JSON.stringify({ avatar: url }) }, gateS.sess.access);
  if (!r.ok) throw new Error("HTTP " + r.status);
  state.accAvatar = url;
  if (gateS.prof) gateS.prof.avatar = url;
  saveSettings();
  gatePaintAvatar();
  avaPaint();
  stSet("stAva", sl(url ? "ava_saved" : "ava_removed"), "ok");
}

async function avaPick() {
  if (!gateS.sess || !gateS.sess.uid || !gateS.sess.access) return;
  let entry = null;
  try { entry = await pickAnyFile(); } catch (e) { return; }
  if (!entry) return;                       /* the customer cancelled */
  stSet("stAva", t("ava_working"), "");
  try {
    let url = "";
    for (let i = 0; i < AVA_SIDES.length; i++) {
      const b64 = await avaCaptureSquare(entry, AVA_SIDES[i]);
      const candidate = b64 ? ("data:image/jpeg;base64," + b64) : "";
      if (gateAvaOk(candidate)) { url = candidate; break; }
    }
    if (!url) { stSet("stAva", sl("ava_fail"), "err"); return; }
    await avaSave(url);
  } catch (e) { stSet("stAva", friendlyErr(e), "err"); }
}

async function avaDrop() {
  try { await avaSave(""); }
  catch (e) { stSet("stAva", friendlyErr(e), "err"); }
}

/* The header chip is derived only from the live entitlement response. */
function gatePaintPlan() {
  const ent = gateS.entitlement || {};
  const lic = ent.license || ent;
  const d = Math.max(
    gateDaysLeft({ plan_expires_at: lic.expires_at || lic.plan_expires_at || null }),
    gateDaysLeft(gateS.prof));
  gatePaintAccDot(d);
  const el = gateEl("brandPlan"); if (!el) return;
  if (!d) { el.textContent = ""; return; }
  /* v6.73.0 — while the panel is open on a remembered verdict the header says
     so, every frame it paints: the number is the last one the server confirmed,
     not one this launch was told. */
  el.textContent = gateT("gate_days").replace("{D}", String(d)) +
    (gateS.graceOpen ? " \u00b7 " + gateT("gate_grace_tag") : "");
  el.style.color = (gateS.graceOpen || d <= 7) ? "#f4d488" : "";
}
/* v6.51.0 — the app's accChipRender: the header gear carries a 9px state dot.
   Signed out: none. Signed in without an active plan: a hollow gold ring
   (acc-in). Active plan: filled gold (acc-pro), red-ringed when it expires
   within seven days (acc-soon). The dot is a real span here (UXP has no
   ::after); the gear's own "on" (Setup open) is left as switchPage set it. */
function gatePaintAccDot(days) {
  const g = gateEl("btnGearSetup"); if (!g) return;
  const on = /\bon\b/.test(clsOf(g));
  let cls = "nav-gear" + (on ? " on" : "");
  if (gateS.sess) {
    const premium = days > 0 || gatePremium(gateS.prof);
    cls += premium ? (days <= 7 ? " acc-soon" : " acc-pro") : " acc-in";
  }
  if (clsOf(g) !== cls) g.className = cls;
}

/* ---------------- flow ---------------- */
/* The backend owns the shared Computer slot. Signing in registers this
   installation directly; a refusal is authoritative and keeps the overlay
   up (only an admin Reset Computer frees the slot for another machine). */
async function gateRegisterDevice() {
  try {
    /* 2026-08-30 owner instruction: the pairing-code step is gone — signing
       in registers this computer directly. The server still allows only ONE
       active panel installation per account (a second machine is refused
       until the admin uses Reset Computer), which is the control that
       actually mattered. */
    const r = await gateReq("/v1/devices/enroll", {
      method: "POST",
      body: JSON.stringify({
        installation_id: gateS.devId,
        device_type: "computer",
        channel: "panel",
        label: gateDevLabel()
      })
    }, gateS.sess.access);
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) return { ok: false, status: r.status, body: j };
    gateS.enrolled = true;
    return { ok: true, body: j };
  } catch (e) {
    return { ok: false, status: 0, body: { message: gateT("gate_service_down") } };
  }
}

/* v6.31.0 — a student in real Photoshop hit the generic "Device could not be
   registered" with no way to tell WHY (owner screenshot, 2026-08-30). The
   backend sends the specific reason in the response's `error` field
   (fail() in server/index.js serializes ApiError.code there); the gate
   now maps each device-slot reason to actionable Burmese guidance. The
   same day the owner removed the pairing-code step entirely, so only the
   slot reasons remain. */
const GATE_REASON_MY = {
  panel_slot_occupied: "ဒီအကောင့်မှာ Photoshop panel တစ်ခု ချိတ်ပြီးသားပါ — hnkaistudio.com ကို ဖွင့်ပြီး Account မှာ “Computer နေရာ ပြန်လွှတ်မယ်” ကို နှိပ်ပါ (၇ ရက်တစ်ကြိမ်)၊ ပြီးရင် ဒီစက်နဲ့ ပြန်ဝင်ပါ",
  computer_slot_occupied: "ဒီအကောင့်ရဲ့ computer နေရာ ပြည့်နေပါတယ် — hnkaistudio.com ကို ဖွင့်ပြီး Account မှာ “Computer နေရာ ပြန်လွှတ်မယ်” ကို နှိပ်ပါ (၇ ရက်တစ်ကြိမ်)",
  device_mismatch: "ဒီစက်က ဒီအကောင့်နဲ့ ချိတ်ထားတာ မဟုတ်ပါ — ဆရာ့ကို ပြောပြီး Reset Computer လုပ်ခိုင်းပါ",
  /* v6.44.0 — the two refusals that used to arrive as a raw PostgreSQL
     SQLSTATE. device_installations_active_hash_uniq is global — one live row
     per installation hash across every account — so a machine another student
     still holds cannot be registered here, and until now the panel called that
     panel_slot_occupied, which sent them to an admin who would find their own
     seats empty. */
  device_registered_elsewhere: "ဒီစက်ကို တခြားအကောင့်တစ်ခုက မှတ်ပုံတင်ထားပါတယ် — စက်တစ်လုံးကို အကောင့်တစ်ခုတည်းသာ ရပါတယ်။ အရင်အကောင့်နဲ့ hnkaistudio.com မှာ ဝင်ပြီး Account ▸ စက်များ မှာ ဖြုတ်ပါ၊ ဒါမှမဟုတ် ဆရာ့ကို ပြောပါ",
  installation_id_conflict: "ဒီစက်ရဲ့ မှတ်ပုံတင်နံပါတ် Web App နဲ့ ထပ်နေပါတယ် — ဆရာ့ကို ပြောပြီး ရှင်းခိုင်းပါ",
  /* v6.47.0 — the server refuses a build it has no release row for, which is
     right: an unpublished .ccx must not be trusted. But it said only "Access
     denied", and the owner met exactly that on a fresh build minutes after
     installing it (2026-09-01) with no way to tell it from an expired plan or
     a taken computer slot. Name the real cause: nothing is wrong with the
     account, this copy simply is not published yet. */
  version_blocked: "ဒီ panel ဗားရှင်းကို server မှာ မထုတ်ပြန်ရသေးပါ — အကောင့်နဲ့ မသက်ဆိုင်ပါ။ ဆရာ့ကို ပြောပြီး ဒီဗားရှင်းကို ထုတ်ပြန်ခိုင်းပါ ဒါမှမဟုတ် website ကနေ တရားဝင်ဗားရှင်းကို ပြန်သွင်းပါ",
  invalid_version: "ဒီ panel ဗားရှင်းကို server က မသိပါ — website ကနေ တရားဝင်ဗားရှင်းကို ပြန်သွင်းပါ",
  /* v6.102.4 — the other NINE verdicts this server sends reached the card as its
     English "Access denied" (server/lib/authorization.js REASONS; fail() puts the
     reason in `error`). A locked panel now always names its own cause. */
  update_required: "ဒီ panel ဗားရှင်း အဟောင်း ဖြစ်နေပါပြီ — website ကနေ အသစ်ကို ယူပြီး ပြန်သွင်းပါ (Update Required)",
  pending: "အကောင့်ကို ဆရာက အတည် မပြုရသေးပါ — အတည်ပြုပြီးမှ panel ဝင်လို့ ရပါမယ်",
  not_active: "အကောင့် အသုံးပြုခွင့် မဖွင့်ရသေးပါ — ဆရာ့ကို ဆက်သွယ်ပါ",
  suspended: "အကောင့်ကို ခဏ ရပ်ဆိုင်းထားပါတယ် — ဆရာ့ကို ဆက်သွယ်ပါ",
  banned: "အကောင့်ကို ပိတ်ထားပါတယ် — ဆရာ့ကို ဆက်သွယ်ပါ",
  rejected: "အကောင့်ကို ငြင်းပယ်ထားပါတယ် — ဆရာ့ကို ဆက်သွယ်ပါ",
  license_missing: "လိုင်စင် မရှိသေးပါ — website မှာ ဝယ်ပြီး ပြန်စစ်ပါ",
  license_revoked: "လိုင်စင်ကို ရုပ်သိမ်းထားပါတယ် — ဆရာ့ကို ဆက်သွယ်ပါ",
  license_not_started: "လိုင်စင် စတင်ရက် မရောက်သေးပါ — ရက်ရောက်မှ ဝင်လို့ ရပါမယ်",
  license_expired: "လိုင်စင် သက်တမ်း ကုန်သွားပါပြီ — website မှာ သက်တမ်းတိုးပြီး ပြန်စစ်ပါ",
  panel_disabled: "ဒီအကောင့်အတွက် Photoshop Panel ခွင့် မဖွင့်ထားပါ — ဆရာ့ကို ဖွင့်ပေးဖို့ ပြောပါ",
  web_disabled: "ဒီအကောင့်အတွက် Web App ခွင့် မဖွင့်ထားပါ — ဆရာ့ကို ပြောပါ",
  download_disabled: "ဒီအကောင့်အတွက် Panel download ခွင့် မဖွင့်ထားပါ — ဆရာ့ကို ပြောပါ",
  device_required: "ဒီ computer ကို အကောင့်နဲ့ ချိတ်ရဦးမယ် — \"ပြန်စစ်ရန်\" နှိပ်ပါ"
};
function gateResponseMessage(j, status) {
  if (status === 426 || (j && j.code === "UPDATE_REQUIRED")) return GATE_REASON_MY.update_required;
  const reason = j && (j.error || j.code);
  if (reason && GATE_REASON_MY[reason]) return GATE_REASON_MY[reason];
  return String((j && (j.message || j.msg || j.error)) ||
    (status ? (gateT("gate_server") + " (HTTP " + status + ")") : gateT("gate_service_down")));
}

function gateLeaseExpiry(j) {
  const raw = j && (j.lease_expires_at || (j.lease && j.lease.expires_at));
  const parsed = raw ? Date.parse(raw) : NaN;
  if (!isNaN(parsed)) return parsed;
  const ttl = Number(j && (j.lease_expires_in || (j.lease && j.lease.expires_in)));
  return isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 1000 : 0;
}

function gateLeaseValid() {
  return !!gateS.lease && gateS.leaseExp > Date.now() + 10000 && !gateS.updateRequired;
}

async function gateValidate(force) {
  if (!gateS.sess || !gateS.sess.access || !gateS.enrolled) return false;
  if (!force && gateLeaseValid()) return true;
  try {
    let r = await gateReq("/v1/panel/validate", {
      method: "POST",
      body: JSON.stringify({ installation_id: gateS.devId, panel_version: PANEL_VERSION })
    }, gateS.sess.access);
    if (r.status === 401 && gateS.sess.refresh) {
      const refreshed = await gateRefresh();
      if (refreshed === true) {
        r = await gateReq("/v1/panel/validate", {
          method: "POST",
          body: JSON.stringify({ installation_id: gateS.devId, panel_version: PANEL_VERSION })
        }, gateS.sess.access);
      }
    }
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok || j.ok === false) {
      gateS.lease = ""; gateS.leaseExp = 0;
      gateS.updateRequired = r.status === 426 || j.code === "UPDATE_REQUIRED";
      /* v6.73.0 — the server ANSWERED, and the answer was no. That is the one
         thing the offline grace must never survive: relaunching Photoshop
         after a suspension, a revoked seat or a blocked build must not reopen
         the panel, so the remembered verdict is deleted here. */
      gateGraceForget();
      gateShow("locked"); gateErr(gateResponseMessage(j, r.status));
      return false;
    }
    const lease = j.lease_token || (j.lease && j.lease.token) || "";
    const expires = gateLeaseExpiry(j);
    if (!lease || !expires || expires <= Date.now()) {
      gateS.lease = ""; gateS.leaseExp = 0;
      gateGraceForget();      /* the server answered and issued nothing */
      gateShow("locked"); gateErr(gateT("gate_no_lease"));
      return false;
    }
    gateS.lease = lease;
    gateS.leaseExp = expires;
    /* v6.75.0 — a validate just landed, so the line is back: every picture a
       dead line took (126 on the owner's card, still "failed" after the
       Wi-Fi returned) is asked for again, without a relaunch. */
    try { if (globalThis.HNK && globalThis.HNK.remoteArt && globalThis.HNK.remoteArt.retryFailed) globalThis.HNK.remoteArt.retryFailed(true); } catch (eRa) { }
    gateS.entitlement = j.entitlement || j;
    state.accProfile = gateS.entitlement;
    gateS.updateRequired = false;
    /* v6.73.0 — the only place a verdict is remembered, and it is reached only
       after a 2xx that carried a real lease. gateS.graceOpen clears here
       because the panel is now open on the live answer, not the stored one. */
    gateS.graceOpen = false;
    gateGraceRemember();
    gateErr(""); gateUnlock();
    homeRefresh();            /* the plan line can now be named */
    gateS.netFails = 0;
    return true;
  } catch (e) {
    /* v6.43.0 — A LEASE THE SERVER ALREADY ISSUED SURVIVES A LOST CONNECTION.

       These three lines used to run for every failure alike, and only one of
       the two kinds of failure is a decision: the branch above, where the
       server answered and the answer was no, and this one, where nothing came
       back at all. Deleting the lease here made the panel treat a Wi-Fi dropout
       exactly as it treats a revoked licence — locked, "the licence service
       cannot be reached", and every protected operation refused through
       gateRequireLease.

       In Photoshop that was constant rather than occasional. gateHeartbeat is
       bound to window "focus" as well as to its interval, and a retoucher
       clicks between the canvas and the panel dozens of times a minute, so on
       the owner's connection (2026-09-09: "အင်တာနက်ကမကောင်းဘူး ခနခနကျတယ်") the
       panel re-validated, timed out, and locked itself again and again in the
       middle of the work.

       A lease is precisely the server's statement that this panel may work
       until leaseExp without asking again, so while it is still live we honour
       it and say nothing. Once it has actually run out we do lock — but with
       gate_offline, which says the internet could not be reached, instead of
       gate_service_down, which blames a server nobody has heard from. */
    gateS.netFails = (gateS.netFails || 0) + 1;
    if (gateLeaseValid()) return true;
    gateS.lease = ""; gateS.leaseExp = 0;
    /* v6.73.0 — and once the lease HAS run out, the last verified verdict is
       what answers, for up to six hours from the moment the server gave it.
       This returns false either way: the caller asked whether there is a live
       lease and there is not, so gateRequireLease still refuses every provider
       operation. What changes is only whether the overlay comes down. */
    if (gateGraceOpen()) return false;
    gateShow("locked"); gateErr(gateT("gate_offline"));
    return false;
  }
}

/* Called from the single provider choke point. Force means every protected
   operation obtains a live server verdict even when the heartbeat lease has
   time remaining. */
async function gateRequireLease() {
  const ok = await gateValidate(true);
  if (!ok) {
    /* v6.73.0 — the choke point is UNCHANGED: no live lease, no provider
       operation, grace or no grace. Only the sentence changes, because while
       the grace holds the panel open the reason this step cannot run is the
       connection and not the licence. */
    if (gateS.graceOpen) throw new Error("HNKERR:err_license:" + gateT("gate_grace_gen"));
    throw new Error("HNKERR:err_license:Panel authorization required");
  }
  return gateS.lease;
}
try {
  globalThis.HNK = globalThis.HNK || {};
  globalThis.HNK.panelAuth = { requireLease: gateRequireLease, isValid: gateLeaseValid };
} catch (e) { }

async function gateCheck() {
  const ticket = ++gateS.run;
  /* v6.43.0 — a check the student asked for is never held back by the backoff
     the automatic beat has built up, and it re-bases the beat from here. */
  gateS.nextBeat = 0;
  if (!gateS.sess || !gateS.sess.refresh) { gateShow("login"); return; }
  gateShow("checking");
  gateBusy(true);
  const rf = await gateRefresh(ticket);
  if (gateStale(ticket)) return;
  if (rf !== true) {
    /* v6.102.4 — THE MESSAGE IN THE OWNER'S PHOTOGRAPH. This path runs at launch,
       against the session remembered on disk, before anybody has typed anything —
       and it said "Wrong email or password". A remembered session that the server
       has rotated away, revoked or expired is not a wrong password, and telling a
       student it is sends them to change a password that was always correct. */
    if (rf === "dead") gateForget();
    /* v6.73.0 — THE FIRST OF THE TWO COLD-BOOT DOORS, and the one that shuts
       first: on a dead line the refresh never lands, so gateValidate below is
       never even reached. "dead" is the server answering that the credential
       is gone — never graced. Anything else here is the line, not a verdict. */
    if (rf !== "dead" && gateGraceOpen()) { gateBusy(false); return; }
    gateShow(rf === "dead" ? "login" : "locked");
    gateErr(gateT(rf === "dead" ? "gate_session_ended" : "gate_service_down"));
    return;
  }
  /* v6.27.0 — the profiles row (photo, name, plan, device limit) rides
     alongside the device/entitlement round-trip: fire-and-forget, so a slow
     or missing profiles row can never delay or fail the authorization path. */
  gateProfileRefresh();
  const device = await gateRegisterDevice();
  if (gateStale(ticket)) return;
  if (!device.ok) {
    gateShow("locked"); gateErr(gateResponseMessage(device.body, device.status));
    return;
  }
  await gateValidate(true);
  /* the Setup ACCOUNT card repaints from the fresh entitlement */
  try { accAfterAuth(); accRender(); accRenderDevices(); renderSetupStatus(); } catch (e) { }
  gateBusy(false);
}

/* v6.102.4 — WHICH refusal this is. Until now everything that was not 429 or 503 —
   a suspended account (403), an unconfirmed address (400 email_not_confirmed), a
   deleted account (404), every 5xx — was shown as "Wrong email or password", so the
   one screen a student can act on lied about four different causes. The web app's
   accFriendly has always read these codes (server/lib/auth.js); the panel now reads
   the same ones and says the same things. Only a real credential refusal keeps
   gate_bad. */
function gateSignInKey(status, body) {
  let code = "";
  try {
    const b = body && typeof body === "object" ? body : {};
    code = String(b.error_code || b.code || b.error || b.message || b.msg || "");
  } catch (e) { code = ""; }
  if (status === 429 || /rate_limited|Too many/i.test(code)) return "gate_wait";
  if (status === 503 || /auth_busy/i.test(code)) return "gate_busy";
  if (status === 403 || /^account_|Account is /i.test(code)) return "gate_acct_off";
  if (/email_not_confirmed|Email not confirmed/i.test(code)) return "gate_confirm";
  if (status === 404 || /not_found|User not found/i.test(code)) return "gate_gone";
  if (status >= 500 || status === 0) return "gate_server";
  if (status === 400 || status === 401 || status === 422) return "gate_bad";
  return "gate_server";
}
/* The address exactly as it left the panel, and how many characters the password
   field held — never the password itself. An invisible character in a pasted
   address, or a keystroke the UXP field silently dropped, is visible here and
   nowhere else. */
function gateSentAs(email, pw) {
  return gateT("gate_sent_as").replace("{E}", String(email || ""))
    .replace("{N}", String(String(pw || "").length));
}
/* v6.102.2 — " (HTTP 400 · invalid_grant)": the status and the server's code field, nothing else
   from the body, so the line stays short and never echoes a credential. */
function gateHttpNote(status, body) {
  let code = "";
  try {
    const b = body && typeof body === "object" ? body : {};
    code = String(b.error_code || b.code || b.error || "").slice(0, 40);
  } catch (e) { code = ""; }
  return " (HTTP " + status + (code && !/^\d+$/.test(code) ? " · " + code : "") + ")";
}
async function gateSignIn() {
  if (gateS.busy) return;
  /* v6.102.4 — an address never contains whitespace, and a pasted one arrives
     carrying it: a trailing space, a non-breaking space out of a chat message, a
     zero-width character out of a web page. Each one made the server answer
     "Invalid login credentials" for a perfectly correct address. */
  const em = ((gateEl("gateEmail") || {}).value || "")
    .replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]+/g, "");
  const pw = (gateEl("gatePass") || {}).value || "";
  if (!em || !pw) { gateErr(gateT("gate_need")); return; }
  gateBusy(true); gateErr("");
  try {
    const r = await gateReq("/auth/v1/token?grant_type=password",
      { method: "POST", hnkNoRetry: true,
        body: JSON.stringify({ email: em, password: pw, client_kind: "panel" }) }, null);
    /* v6.64.0 — every failed sign-in used to read "Wrong email or password",
       including the two that are not about the password at all. A student
       locked out by the failed-login limiter was told their password was
       wrong, so they tried more passwords — which extends the lockout — and
       some reset a password that had never been wrong. The web app's
       accFriendly() has always mapped these; the panel now reads the same
       codes (server/lib/auth.js) and says the same three things. */
    if (!r.ok) {
      let body = null;
      try { body = await r.clone().json(); } catch (e) { }
      const key = gateSignInKey(r.status, body);
      /* v6.102.2 — the refusal names the HTTP status and the server's own code (owner, 2026-09-08:
         the panel said "wrong email or password" while the same password opened the web app on the
         same computer, and nothing on screen said what the server had really answered). The web
         app's accFriendly reads the same fields; a support screenshot now carries the real reason.
         v6.102.4 — and when the server really did refuse the credential, the line also carries the
         address as it was sent and the length of what was typed, so a stray character is visible. */
      gateErr(gateT(key) + gateHttpNote(r.status, body) +
        (key === "gate_bad" ? " · " + gateSentAs(em, pw) : ""));
      gateBusy(false); return;
    }
    const j = await r.json();
    if (!gateSaveSess(j)) { gateErr(gateT("gate_server") + gateHttpNote(r.status, { code: "no_session_in_reply" })); gateBusy(false); return; }
    const p = gateEl("gatePass"); if (p) p.value = "";
    gateS.run++;                 /* whatever was in flight is about another account */
    await gateCheck();
  } catch (e) {
    gateErr(gateT("gate_offline"));
    gateBusy(false);
  }
}

async function gateOpenSite() {
  try {
    if (shell && shell.openExternal) { await shell.openExternal(GATE_BUY_URL); return; }
  } catch (e) { }
  try {
    if (typeof require === "function") {
      const u = require("uxp");
      if (u && u.shell && u.shell.openExternal) { await u.shell.openExternal(GATE_BUY_URL); return; }
    }
  } catch (e) { }
  /* Last resort: the address itself, on screen, and in the clipboard if the
     host allows it. Telling somebody "could not open the browser" and nothing
     else leaves them stuck on the one screen that has no way forward. */
  /* navigator.clipboard, exactly as copyLog and the library path-copy in this
     same file already do it. require("uxp").clipboard is not a thing -- the
     uxp module has no clipboard export, so the draft that reached for it threw
     and swallowed, leaving the locked screen's last way out doing nothing. */
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(GATE_BUY_URL);
    else if (navigator.clipboard && navigator.clipboard.setContent) await navigator.clipboard.setContent({ "text/plain": GATE_BUY_URL });
  } catch (e) { }
  gateErr(gateT("gate_open_fail").replace("{U}", GATE_BUY_URL));
}

/* v6.25.1 — INLINE STYLES, because they are the one layer of the cascade
   every UXP build honors on its button widgets. The 6.24 screenshots showed
   the secondary buttons as blank dark rectangles: the box rendered, the
   stylesheet's multi-class color override did not. Nothing here can throw
   the gate down — every assignment is guarded, and a style that fails to
   apply simply leaves the stylesheet's own attempt in place. */
function gateApplyWidgetStyles() {
  const paint = function (id, styles) {
    const el = gateEl(id);
    if (!el || !el.style) return;
    for (const key in styles) { try { el.style[key] = styles[key]; } catch (e) { } }
  };
  paint("gateSignIn", { backgroundColor: "#e7c470", backgroundImage: "none", color: "#161b22", border: "1px solid #c79a3c", fontWeight: "700" });
  /* gateBuy is deliberately absent here — gatePaintPrimary below owns it,
     because its emphasis depends on the view and this function runs once. */
  /* v6.102.3 — the forgot link rides the password label's row, right-aligned, in the muted gold */
  paint("gateForgot", { backgroundColor: "transparent", color: "#d4b46a", border: "none", fontSize: "11px", fontWeight: "600", textAlign: "right", marginTop: "0", cursor: "pointer" });
  paint("gateRetry", { backgroundColor: "#1c2530", backgroundImage: "none", color: "#e6edf3", border: "1px solid #45536b", fontWeight: "600" });
  paint("gateSignOut", { backgroundColor: "#1c2530", backgroundImage: "none", color: "#e6edf3", border: "1px solid #45536b", fontWeight: "600" });
  /* v6.47.0 — THE WHOLE BOX, not just its colours. The owner's Photoshop
     screenshot showed the two fields wearing UXP's own text-widget chrome —
     a thick light inset frame with square corners — sitting inside a card
     whose every other control is a soft dark rounded slab. The stylesheet
     asked for the rounded slab and the widget ignored it; colour alone came
     through because colour was all this function set. Radius, padding, type
     size and the two frames the widget draws for itself (box-shadow inset,
     focus outline) are now stated here too, on the one layer of the cascade
     every UXP build honours. A property this renderer refuses simply leaves
     the stylesheet's own attempt standing — the paint() helper swallows it. */
  const field = {
    backgroundColor: "#0d1014", color: "#e6edf3", border: "1px solid #45536b",
    borderRadius: "10px", padding: "11px 12px", fontSize: "13px",
    boxShadow: "none", outline: "none"
  };
  paint("gateEmail", field);
  paint("gatePass", field);
  paint("gatePassEye", { backgroundColor: "#1c2530", backgroundImage: "none", color: "#e6edf3", border: "1px solid #45536b", borderRadius: "10px", boxShadow: "none", outline: "none", cursor: "pointer" });
  paint("gateLang", { backgroundColor: "#0d1014", color: "#e6edf3", border: "1px solid #45536b", borderRadius: "8px", boxShadow: "none", outline: "none" });
  gatePaintPrimary();
}

/* v6.47.0 — ONE gold button at a time. "Open website" is the way out of a
   locked account, so it is the primary action there; on the login card it is
   a side door next to Sign In, and painting both gold left the owner's
   screenshot with two identical slabs and no answer to "which one finishes
   this?". Called from gateApplyWidgetStyles (first paint) and from gateShow
   (every view change), so the card never carries the previous view's
   emphasis. */
function gatePaintPrimary() {
  const el = gateEl("gateBuy");
  if (!el || !el.style) return;
  const locked = (typeof gateS !== "undefined" && gateS.view === "locked");
  const s = locked
    ? { backgroundColor: "#e7c470", backgroundImage: "none", color: "#161b22", border: "1px solid #c79a3c", fontWeight: "700" }
    : { backgroundColor: "#1c2530", backgroundImage: "none", color: "#e6edf3", border: "1px solid #45536b", fontWeight: "600" };
  for (const key in s) { try { el.style[key] = s[key]; } catch (e) { } }
}

/* Reachable in every state since v6.26.1 — never mid-check: a sign-out
   under a running gateCheck would race the check's session. Shared by the
   gate card's own button and the Setup ACCOUNT card's "Sign out". */
async function gateSignOut() {
  if (gateS.busy) return;
  const sess = gateS.sess;
  try {
    if (sess && sess.access) await gateReq("/auth/v1/logout", {
      method: "POST", body: JSON.stringify({ refresh_token: sess.refresh || "" })
    }, sess.access);
  } catch (e) { }
  gateForget(); gateShow("login"); gateErr("");
}

function gateWire() {
  gateApplyWidgetStyles();
  const on = function (id, fn) {
    const el = gateEl(id);
    if (el && el.addEventListener) el.addEventListener("click", fn);
  };
  on("gateSignIn", function () { gateSignIn(); });
  on("gateRetry", function () { if (!gateS.busy) gateCheck(); });
  on("gateBuy", function () { gateOpenSite(); });
  /* the reset flow lives on the website's login card — the gate only links */
  on("gateForgot", function () { gateOpenSite(); });
  on("gateSignOut", function () { gateSignOut(); });
  const pw = gateEl("gatePass");
  if (pw && pw.addEventListener) {
    pw.addEventListener("keydown", function (ev) {
      if (ev && (ev.key === "Enter" || ev.keyCode === 13)) { ev.preventDefault(); gateSignIn(); }
    });
  }
  /* v6.102.3 — a focus ring the field can actually show: gateApplyWidgetStyles
     paints the frame inline (the one layer UXP honours), which would outrank
     the stylesheet's :focus colour, so the gold frame is painted from the
     focus event itself and the grey one put back on blur. */
  const ring = function (id) {
    const f = gateEl(id);
    if (!f || !f.addEventListener) return;
    f.addEventListener("focus", function () { try { f.style.borderColor = "#c79a3c"; } catch (e) { } });
    f.addEventListener("blur", function () { try { f.style.borderColor = "#45536b"; } catch (e) { } });
  };
  ring("gateEmail"); ring("gatePass");
  /* v6.27.1 — owner's in-Photoshop acceptance: UXP paints type="password"
     with NO visible dots on some hosts (the keystrokes register, the field
     just looks empty). The eye flips the field to plain text and back — the
     exact input.type toggle the Setup key field has shipped with since v1,
     so it is proven on this host class. */
  const eye = gateEl("gatePassEye");
  if (eye && eye.addEventListener && pw) {
    const flip = function () {
      const showing = pw.type !== "password";
      try { pw.type = showing ? "password" : "text"; } catch (e) { }
      try { eye.setAttribute("aria-pressed", showing ? "false" : "true"); } catch (e) { }
      try { pw.focus(); } catch (e) { }
    };
    eye.addEventListener("click", flip);
    eye.addEventListener("keydown", function (ev) {
      if (ev && (ev.key === "Enter" || ev.key === " " || ev.keyCode === 13)) { ev.preventDefault(); flip(); }
    });
  }
  /* The language picker lives in the header, which is behind this overlay. A
     first-run Burmese or Shan customer would otherwise have to read an English
     login screen to reach the control that makes it Burmese. */
  const sl = gateEl("gateLang");
  if (sl) {
    /* fillSelect, not innerHTML and not a hand-rolled loop: it is this panel's
       own helper and it sets BOTH o.text and o.textContent, which is a UXP
       workaround the rest of the file has needed since v1. */
    try {
      fillSelect(sl, LANGS.map(function (l) { return { v: l.code, label: langOptionLabel(l) }; }));
      sl.value = state.lang;
    } catch (e) { }
    if (sl.addEventListener) sl.addEventListener("change", function () {
      state.lang = (LANG_CODES.indexOf(sl.value) >= 0) ? sl.value : "en";
      saveSettings();
      try { applyI18n(); } catch (e) { }
      const other = gateEl("selLang"); if (other) other.value = state.lang;
      /* gateTexts, NOT gateShow: gateShow(view) also clears the busy flag, and
         the one moment this handler is reachable mid-flight is while a check is
         running -- so re-rendering through gateShow re-enabled Sign In under a
         check already in progress, and a second run could finish against the
         first one's session. Only the strings change here. */
      gateTexts();
    });
  }
}

/* v6.43.0 — the beat has a floor, and the floor grows while the line is bad.
   GATE_LEASE_REFRESH_MS was the interval only; the "focus" binding below had no
   interval at all, so in Photoshop the beat was effectively "every time the
   student clicks the panel". That is a validate POST per click, each one able
   to hang for the request timeout on a weak connection. Now every caller —
   interval, focus, visibilitychange — passes through the same gate: at most one
   check per GATE_LEASE_REFRESH_MS, doubling up to GATE_BEAT_MAX_MS after
   consecutive network failures, and back to normal on the first one that
   lands. A validate that the student asks for by pressing Check still goes
   straight out; this only governs the automatic ones. */
const GATE_BEAT_MAX_MS = 900000;
function gateBeatMs() {
  const f = gateS.netFails || 0;
  if (!f) return GATE_LEASE_REFRESH_MS;
  return Math.min(GATE_BEAT_MAX_MS, GATE_LEASE_REFRESH_MS * Math.pow(2, Math.min(f, 4)));
}
function gateHeartbeat() {
  if (!gateS.sess || gateS.busy || gateS.view === "login") return;
  const now = Date.now();
  if (now < (gateS.nextBeat || 0)) return;
  gateS.nextBeat = now + gateBeatMs();
  gateValidate(true).catch(function () { });
}

async function gateBoot() {
  try {
    gateS.devId = state.accDevId || "";
    if (!gateS.devId) { gateS.devId = gateUuid(); state.accDevId = gateS.devId; saveSettings(); }
    if (state.accRefresh && state.accUid) {
      gateS.sess = { access: "", refresh: state.accRefresh, uid: state.accUid,
                     email: state.accEmail || "" };
    }
    gateWire();
    gatePaintAvatar();   /* v6.27.0 — the cached photo greets before any network */
    gateShow(gateS.sess ? "checking" : "login");
    await gateCheck();
    if (!gateS.timer && typeof setInterval === "function") {
      gateS.timer = setInterval(gateHeartbeat, GATE_LEASE_REFRESH_MS);
    }
    try {
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("focus", gateHeartbeat);
      }
      if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) gateHeartbeat();
        });
      }
    } catch (e) { }
  } catch (e) {
    herr("gate:", e);
    try { gateShow("login"); } catch (e2) { }
  }
}

const LANGS = [
  { code: "en", label: "EN", native: "English" },
  { code: "my", label: "MY", native: "မြန်မာ" },
  { code: "shn", label: "SHN", native: "တႆး" },
  { code: "kac", label: "KAC", native: "Jinghpaw" },
  { code: "th", label: "TH", native: "ไทย" },
  { code: "zh", label: "ZH", native: "中文" },
  { code: "vi", label: "VI", native: "Tiếng Việt" },
  { code: "id", label: "ID", native: "Indonesia" },
  { code: "ms", label: "MS", native: "Melayu" },
  /* v6.34.0 — the picker offers only languages the PANEL really renders
     (owner instruction: show what truly exists). Measured against the
     ~560-key I18N table: the nine core languages are complete, and hi/bn/
     ta/te carry ~500-key native packs — they stay. The ten Myanmar-ethnic
     rows had ZERO native panel text (pure Burmese-fallback shells) and the
     other v6.11 starter packs cover only ~22 keys (4%) — all retired from
     the picker until reviewed packs land; their pack data and LANG_FB
     entries stay dormant so restoring one is a one-line change. A stored
     retired code is dropped by the existing LANG_CODES guards on settings
     restore, so those installs simply return to the default language. */
  { code: "hi", label: "HI", native: "हिन्दी" },
  { code: "bn", label: "BN", native: "বাংলা" },
  { code: "ta", label: "TA", native: "தமிழ்" },
  { code: "te", label: "TE", native: "తెలుగు" }
];
const LANG_CODES = LANGS.map(function (l) { return l.code; });
/* v6.25 — the dropdown showed endonyms only, and UXP's fixed font stack has
   no glyphs for several of these scripts on a stock Windows Photoshop: the
   owner's screenshot showed rows of tofu boxes no one could pick a language
   from. Each non-Latin endonym now carries a Latin gloss, so every row is
   readable even where its own script is not; endonyms that already include a
   Latin name are left alone. */
const LANG_GLOSS = {
  my: "Myanmar", shn: "Shan", th: "Thai", zh: "Chinese", mnw: "Mon",
  rki: "Rakhine", ksw: "Karen", kyu: "Kayah", cnh: "Chin", blk: "Pa-O",
  pll: "Ta'ang", khb: "Tai Lue", ahk: "Akha", lhu: "Lahu", lis: "Lisu",
  hi: "Hindi", bn: "Bangla", ta: "Tamil", te: "Telugu", mr: "Marathi",
  gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", ur: "Urdu",
  ne: "Nepali", lo: "Lao", km: "Khmer", ja: "Japanese", ko: "Korean"
};
function langOptionLabel(l) {
  /* ASCII parentheses, not a middle dot: the glyph set UXP's select popup
     draws with is narrow, and a label must never depend on it. Defensive
     because a thrown label would empty the whole dropdown.

     v6.47.0 — THE GLOSS LEADS. v6.25 put the endonym first and appended the
     ASCII gloss for scripts UXP's select font cannot draw. On the owner's
     Photoshop the Burmese row then rendered as a bare " (Myanmar)": the
     glyphs did not paint at all, so the one row a Burmese customer needs
     opened with a hole where its name should be. Latin first means every row
     reads on every host, and the endonym still follows for the builds that
     do draw it. */
  try {
    const gloss = LANG_GLOSS[l.code];
    if (!gloss || String(l.native).indexOf(gloss) >= 0) return l.native;
    /* THE GLOSS ALONE. A gloss exists for exactly one reason: this row's
       endonym is in a script the host may not be able to draw. Keeping the
       endonym after it was a hedge, and the owner's screenshot showed what
       the hedge costs — "Myanmar ()", a name followed by an empty pair of
       brackets where the glyphs failed to paint. If we needed a gloss, the
       gloss IS the label; a row a customer cannot read is worse than one
       written in the alphabet everybody here already reads. */
    return gloss;
  } catch (e) { return l.native; }
}
/* Which full I18N table an extended code reads when its starter pack misses:
   Myanmar ethnic -> Burmese, Tai Lue -> Shan, Lao -> Thai (closest readable),
   everything else -> English. */
const LANG_FB = { kyu: "my", ksw: "my", cnh: "my", mnw: "my", rki: "my", ahk: "my", lhu: "my", lis: "my", blk: "my", pll: "my", khb: "shn",
  hi: "en", bn: "en", ta: "en", te: "en", mr: "en", gu: "en", kn: "en", ml: "en", pa: "en", ur: "en",
  ne: "en", lo: "th", km: "en", ja: "en", ko: "en" };
/* v6.11 — native STARTER PACKS: the short, always-on-screen chrome (tabs,
   GENERATE, key statuses, common buttons) in each language's own script.
   Long-form text falls through LANG_FB. Same honest posture as the web app:
   Myanmar ethnic languages ship no guessed text. */
const I18N_L = {
bn:{btn_show:"দেখান",btn_save:"সংরক্ষণ",st_need_key:"আগে RunningHub Enterprise key দিন",qual_auto:"অটো",btn_clear:"মুছুন",btn_ref_layer:"+ লেয়ার",btn_ref_file:"ফাইল",btn_ref_web:"ওয়েব",st_ref_layer_added:"লেয়ার রেফারেন্স হিসেবে যোগ হয়েছে ✓",st_ref_file_added:"ফাইল রেফারেন্স হিসেবে যোগ হয়েছে ✓",st_importing:"ফাইল ইমপোর্ট হচ্ছে",url_ph:"https://… ছবির ঠিকানা বা Pinterest পিন লিংক",btn_load:"লোড",btn_cancel:"বাতিল",st_url_loading:"ওয়েব ছবি ডাউনলোড হচ্ছে",st_ref_web_added:"ওয়েব ছবি রেফারেন্স হিসেবে যোগ হয়েছে ✓",st_url_bad:"এই URL থেকে ছবি লোড করা যায়নি — ছবির ঠিকানা কপি করে আবার চেষ্টা করুন",no_layer:"কোনো লেয়ার নির্বাচিত নেই",st_web_import:"লেয়ার হিসেবে Photoshop-এ ইমপোর্ট হয়েছে ✓",st_folder_ok:"এক্সপোর্ট ফোল্ডার সেট হয়েছে ✓",st_exported:"এক্সপোর্ট হয়েছে ✓",st_export_fail:"এক্সপোর্ট ব্যর্থ — ফোল্ডারটি পরীক্ষা করুন",st_img_bad:"ছবির ডেটা ইন্টিগ্রিটি চেক-এ ব্যর্থ — ছবিটি আবার যোগ করুন",st_auto_comp:"অটো কম্পোজিট: IMAGE 1 সাবজেক্ট → রেফারেন্স দৃশ্য",tab_create: "Create",create_ph:"যে ছবিটি তৈরি করতে চান তা বর্ণনা করুন…",btn_create_ps:"⬇ Photoshop-এ পাঠান",btn_to_ref:"↺ Ref 1 হিসেবে ব্যবহার করুন",st_to_ref:"ফলাফল Ref 1-এ লোড হয়েছে ✓",cr_restyle:"♻ ফলাফল রিস্টাইল করুন",cr_gal_empty:"এখনও কোনো ফলাফল নেই — Generate ট্যাপ করুন।",cr_gal_have:"টি ফলাফল · প্রিভিউ / কাজ করতে থাম্বনেইলে ট্যাপ করুন",cr_save:"⬇ PNG সংরক্ষণ করুন",cr_need_result:"প্রথমে একটি ছবি জেনারেট করুন",ro_faceRep:"ফেস রিপ্লেস",ro_faceSwap:"ফেস সোয়াপ",ro_bgRep:"BG রিপ্লেস",ro_bgSwap:"BG সোয়াপ",ro_fgRep:"FG রিপ্লেস",ro_subSwap:"সাবজেক্ট বদল",ro_lcRef:"L&C রেফারেন্স",ro_lcCopy:"L&C কপি-পেস্ট",ro_dressRef:"পোশাক রেফারেন্স",ro_dressRep:"পোশাক বদল",ro_mkCopy:"মেকআপ কপি",ro_matchBtn:"★ মাস্টার ম্যাচ",rt_none:"আগে অন্তত একটি রিটাচ স্লাইডার বা রং সেট করুন",tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",cap_warn:"Photoshop এই prompt বক্সের সীমা:",btn_generate:"তৈরি করুন",st_ready:"প্রস্তুত",st_capture:"ডকুমেন্ট ক্যাপচার হচ্ছে",st_gen:"জেনারেট হচ্ছে…",st_place:"Photoshop-এ বসানো হচ্ছে…",st_placed_masked:"লেয়ার + মাস্ক গ্রুপ হিসেবে বসানো হয়েছে — মূল ছবি অক্ষত ✓",st_placed_plain:"সাধারণ লেয়ার হিসেবে বসানো হয়েছে (এই হোস্টে মাস্ক/গ্রুপ পাওয়া যায় না)",stage_queued:"সারিতে আছে",stage_uploading:"আপলোড হচ্ছে",stage_generating:"জেনারেট হচ্ছে",stage_downloading:"ডাউনলোড হচ্ছে",stage_placing:"বসানো হচ্ছে",st_done:"হয়ে গেছে ✓",st_err:"ত্রুটি",st_no_doc:"কোনো সক্রিয় ডকুমেন্ট নেই — আগে একটি ছবি খুলুন",st_no_prompt:"Prompt খালি",st_new_doc:"ফলাফল নতুন ডকুমেন্ট হিসেবে খোলা হয়েছে ✓",before:"আগে",after:"পরে",btn_place:"Photoshop-এ বসান",st_saved:"সেভ হয়েছে ✓",lib_choose_msg:"আপনার HNK রেফারেন্স ইমেজ লাইব্রেরি ফোল্ডারটি বেছে নিন।",lib_unsupported:"অসমর্থিত ছবির ধরন",lib_restore_fail:"রেফারেন্স পুনরুদ্ধার করা যায়নি",on:"চালু",off:"বন্ধ"},
gu:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"બનાવો",st_ready:"તૈયાર",st_done:"થઈ ગયું ✓",st_need_key:"પહેલા RunningHub Enterprise key નાખો",btn_show:"બતાવો",btn_save:"સાચવો",btn_clear:"કાઢી નાખો",btn_cancel:"રદ કરો",btn_load:"લોડ"},
hi:{btn_show:"दिखाएँ",btn_save:"सहेजें",st_need_key:"पहले RunningHub Enterprise key डालें",qual_auto:"ऑटो",btn_clear:"हटाएँ",btn_ref_layer:"+ लेयर",btn_ref_file:"फ़ाइल",btn_ref_web:"वेब",st_ref_layer_added:"लेयर संदर्भ के रूप में जुड़ गई ✓",st_ref_file_added:"फ़ाइल संदर्भ के रूप में जुड़ गई ✓",st_importing:"फ़ाइल इंपोर्ट हो रही है",url_ph:"https://… इमेज का पता या Pinterest पिन लिंक",btn_load:"लोड करें",btn_cancel:"रद्द करें",st_url_loading:"वेब इमेज डाउनलोड हो रही है",st_ref_web_added:"वेब इमेज संदर्भ के रूप में जुड़ गई ✓",st_url_bad:"इस URL से इमेज लोड नहीं हो सकी — इमेज का पता कॉपी करके फिर से आज़माएँ",no_layer:"कोई लेयर चयनित नहीं है",st_web_import:"Photoshop में लेयर के रूप में इंपोर्ट हो गया ✓",st_folder_ok:"एक्सपोर्ट फ़ोल्डर सेट हो गया ✓",st_exported:"एक्सपोर्ट हो गया ✓",st_export_fail:"एक्सपोर्ट विफल — फ़ोल्डर जाँचें",st_img_bad:"इमेज डेटा इंटीग्रिटी जाँच में विफल रहा — फोटो दोबारा जोड़ें",st_auto_comp:"ऑटो कंपोज़िट: IMAGE 1 सब्जेक्ट → रेफ़रेंस सीन",tab_create: "Create",create_ph:"जो इमेज बनाना चाहते हैं उसका वर्णन करें…",btn_create_ps:"⬇ Photoshop में भेजें",btn_to_ref:"↺ Ref 1 के रूप में इस्तेमाल करें",st_to_ref:"परिणाम Ref 1 में लोड हो गया ✓",cr_restyle:"♻ परिणाम को नया स्टाइल दें",cr_gal_empty:"अभी कोई परिणाम नहीं — Generate टैप करें।",cr_gal_have:"परिणाम · प्रीव्यू / कार्रवाई के लिए थंबनेल टैप करें",cr_save:"⬇ PNG सेव करें",cr_need_result:"पहले कोई इमेज जनरेट करें",ro_faceRep:"फेस रिप्लेस",ro_faceSwap:"फेस स्वैप",ro_bgRep:"BG रिप्लेस",ro_bgSwap:"BG स्वैप",ro_fgRep:"FG रिप्लेस",ro_subSwap:"सब्जेक्ट स्वैप",ro_lcRef:"L&C रेफ़रेंस",ro_lcCopy:"L&C कॉपी-पेस्ट",ro_dressRef:"ड्रेस रेफ़रेंस",ro_dressRep:"ड्रेस रिप्लेस",ro_mkCopy:"मेकअप कॉपी",ro_matchBtn:"★ मास्टर मैच",rt_none:"पहले कम से कम एक रीटच स्लाइडर या रंग सेट करें",tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",cap_warn:"Photoshop इस prompt बॉक्स की सीमा रखता है:",btn_generate:"बनाएँ",st_ready:"तैयार",st_capture:"दस्तावेज़ कैप्चर हो रहा है",st_gen:"जनरेट हो रहा है…",st_place:"Photoshop में रखा जा रहा है…",st_placed_masked:"लेयर + मास्क ग्रुप के रूप में रखा गया — मूल छवि ज्यों की त्यों ✓",st_placed_plain:"सादी लेयर के रूप में रखा गया (इस होस्ट पर मास्क/ग्रुप उपलब्ध नहीं)",stage_queued:"कतार में",stage_uploading:"अपलोड हो रहा है",stage_generating:"जनरेट हो रहा है",stage_downloading:"डाउनलोड हो रहा है",stage_placing:"रखा जा रहा है",st_done:"हो गया ✓",st_err:"त्रुटि",st_no_doc:"कोई सक्रिय दस्तावेज़ नहीं — पहले कोई फ़ोटो खोलें",st_no_prompt:"Prompt खाली है",st_new_doc:"परिणाम नए दस्तावेज़ के रूप में खुल गया ✓",before:"पहले",after:"बाद",btn_place:"Photoshop में रखें",st_saved:"सहेजा गया ✓",lib_choose_msg:"अपना HNK रेफ़रेंस इमेज लाइब्रेरी फ़ोल्डर चुनें।",lib_unsupported:"असमर्थित इमेज प्रकार",lib_restore_fail:"रेफ़रेंस पुनर्स्थापित नहीं हो सका",on:"चालू",off:"बंद"},
ja:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"生成",st_ready:"準備完了",st_done:"完了 ✓",st_need_key:"先に RunningHub Enterprise key を入力してください",btn_show:"表示",btn_save:"保存",btn_clear:"クリア",btn_cancel:"キャンセル",btn_load:"読み込み"},
km:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"បង្កើត",st_ready:"រួចរាល់",st_done:"រួចរាល់ហើយ ✓",st_need_key:"សូមបញ្ចូល RunningHub Enterprise key ជាមុន",btn_show:"បង្ហាញ",btn_save:"រក្សាទុក",btn_clear:"លុប",btn_cancel:"បោះបង់",btn_load:"ផ្ទុក"},
kn:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"ರಚಿಸಿ",st_ready:"ಸಿದ್ಧ",st_done:"ಮುಗಿದಿದೆ ✓",st_need_key:"ಮೊದಲು RunningHub Enterprise key ಹಾಕಿ",btn_show:"ತೋರಿಸಿ",btn_save:"ಉಳಿಸಿ",btn_clear:"ಅಳಿಸಿ",btn_cancel:"ರದ್ದು",btn_load:"ಲೋಡ್"},
ko:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"생성",st_ready:"준비 완료",st_done:"완료 ✓",st_need_key:"먼저 RunningHub Enterprise key를 입력하세요",btn_show:"보기",btn_save:"저장",btn_clear:"지우기",btn_cancel:"취소",btn_load:"불러오기"},
lo:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"ສ້າງພາບ",st_ready:"ພ້ອມ",st_done:"ສຳເລັດ ✓",st_need_key:"ກະລຸນາໃສ່ RunningHub Enterprise key ກ່ອນ",btn_show:"ສະແດງ",btn_save:"ບັນທຶກ",btn_clear:"ລຶບ",btn_cancel:"ຍົກເລີກ",btn_load:"ໂຫຼດ"},
ml:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"സൃഷ്ടിക്കുക",st_ready:"തയ്യാർ",st_done:"കഴിഞ്ഞു ✓",st_need_key:"ആദ്യം RunningHub Enterprise key ചേർക്കുക",btn_show:"കാണിക്കുക",btn_save:"സേവ്",btn_clear:"മായ്ക്കുക",btn_cancel:"റദ്ദാക്കുക",btn_load:"ലോഡ്"},
mr:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"तयार करा",st_ready:"तयार",st_done:"झाले ✓",st_need_key:"आधी RunningHub Enterprise key टाका",btn_show:"दाखवा",btn_save:"जतन करा",btn_clear:"काढा",btn_cancel:"रद्द",btn_load:"लोड"},
ne:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"बनाउनुहोस्",st_ready:"तयार",st_done:"भयो ✓",st_need_key:"पहिले RunningHub Enterprise key राख्नुहोस्",btn_show:"देखाउनुहोस्",btn_save:"सेभ",btn_clear:"हटाउनुहोस्",btn_cancel:"रद्द",btn_load:"लोड"},
pa:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"ਬਣਾਓ",st_ready:"ਤਿਆਰ",st_done:"ਹੋ ਗਿਆ ✓",st_need_key:"ਪਹਿਲਾਂ RunningHub Enterprise key ਪਾਓ",btn_show:"ਦਿਖਾਓ",btn_save:"ਸੰਭਾਲੋ",btn_clear:"ਹਟਾਓ",btn_cancel:"ਰੱਦ ਕਰੋ",btn_load:"ਲੋਡ"},
ta:{btn_show:"காட்டு",btn_save:"சேமி",st_need_key:"முதலில் RunningHub Enterprise key சேர்க்கவும்",qual_auto:"ஆட்டோ",btn_clear:"அழி",btn_ref_layer:"+ லேயர்",btn_ref_file:"கோப்பு",btn_ref_web:"வெப்",st_ref_layer_added:"லேயர் ரெஃபரன்ஸாகச் சேர்க்கப்பட்டது ✓",st_ref_file_added:"கோப்பு ரெஃபரன்ஸாகச் சேர்க்கப்பட்டது ✓",st_importing:"கோப்பு இறக்குமதியாகிறது",url_ph:"https://… படத்தின் முகவரி அல்லது Pinterest pin இணைப்பு",btn_load:"ஏற்று",btn_cancel:"ரத்து",st_url_loading:"வெப் படம் பதிவிறக்கப்படுகிறது",st_ref_web_added:"வெப் படம் ரெஃபரன்ஸாகச் சேர்க்கப்பட்டது ✓",st_url_bad:"இந்த URL-இலிருந்து படத்தை ஏற்ற முடியவில்லை — படத்தின் முகவரியை நகலெடுத்து மீண்டும் முயற்சிக்கவும்",no_layer:"லேயர் எதுவும் தேர்ந்தெடுக்கப்படவில்லை",st_web_import:"Photoshop-இல் லேயராக இறக்குமதி செய்யப்பட்டது ✓",st_folder_ok:"ஏற்றுமதி கோப்புறை அமைக்கப்பட்டது ✓",st_exported:"ஏற்றுமதி செய்யப்பட்டது ✓",st_export_fail:"ஏற்றுமதி தோல்வி — கோப்புறையைச் சரிபார்க்கவும்",st_img_bad:"படத் தரவு ஒருமைப்பாடு சரிபார்ப்பில் தோல்வி — புகைப்படத்தை மீண்டும் சேர்க்கவும்",st_auto_comp:"தானியங்கு காம்போசிட்: IMAGE 1 சப்ஜெக்ட் → ரெஃபரன்ஸ் காட்சி",tab_create: "Create",create_ph:"உருவாக்க விரும்பும் படத்தை விவரிக்கவும்…",btn_create_ps:"⬇ Photoshop-க்கு அனுப்பு",btn_to_ref:"↺ Ref 1 ஆகப் பயன்படுத்து",st_to_ref:"முடிவு Ref 1-இல் ஏற்றப்பட்டது ✓",cr_restyle:"♻ முடிவை மறுஸ்டைல் செய்",cr_gal_empty:"இன்னும் முடிவுகள் இல்லை — Generate-ஐத் தட்டவும்.",cr_gal_have:"முடிவு(கள்) · முன்னோட்டம் காண / செயல்படுத்த ஒரு சிறுபடத்தைத் தட்டவும்",cr_save:"⬇ PNG சேமி",cr_need_result:"முதலில் ஒரு படத்தை உருவாக்கவும்",ro_faceRep:"முக மாற்றீடு",ro_faceSwap:"முக ஸ்வாப்",ro_bgRep:"BG மாற்றீடு",ro_bgSwap:"BG ஸ்வாப்",ro_fgRep:"FG மாற்றீடு",ro_subSwap:"நபர் மாற்றம்",ro_lcRef:"L&C ரெஃபரன்ஸ்",ro_lcCopy:"L&C காப்பி-பேஸ்ட்",ro_dressRef:"உடை ரெஃபரன்ஸ்",ro_dressRep:"உடை மாற்றம்",ro_mkCopy:"மேக்கப் காப்பி",ro_matchBtn:"★ மாஸ்டர் மேட்ச்",rt_none:"முதலில் ஏதேனும் ஒரு ரீடச் ஸ்லைடரையோ நிறத்தையோ அமைக்கவும்",tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",cap_warn:"இந்த prompt பெட்டிக்கான Photoshop வரம்பு:",btn_generate:"உருவாக்கு",st_ready:"தயார்",st_capture:"ஆவணம் எடுக்கப்படுகிறது",st_gen:"உருவாக்கப்படுகிறது…",st_place:"Photoshop-இல் வைக்கப்படுகிறது…",st_placed_masked:"லேயர் + மாஸ்க் குழுவாக வைக்கப்பட்டது — அசல் அப்படியே உள்ளது ✓",st_placed_plain:"சாதாரண லேயராக வைக்கப்பட்டது (இந்த ஹோஸ்டில் மாஸ்க்/குழு கிடைக்கவில்லை)",stage_queued:"வரிசையில்",stage_uploading:"பதிவேற்றம்",stage_generating:"உருவாக்கம்",stage_downloading:"பதிவிறக்கம்",stage_placing:"வைத்தல்",st_done:"முடிந்தது ✓",st_err:"பிழை",st_no_doc:"செயலில் உள்ள ஆவணம் இல்லை — முதலில் ஒரு புகைப்படத்தைத் திறக்கவும்",st_no_prompt:"Prompt காலியாக உள்ளது",st_new_doc:"முடிவு புதிய ஆவணமாகத் திறக்கப்பட்டது ✓",before:"முன்",after:"பின்",btn_place:"Photoshop-இல் வை",st_saved:"சேமிக்கப்பட்டது ✓",lib_choose_msg:"உங்கள் HNK ரெஃபரன்ஸ் பட லைப்ரரி கோப்புறையைத் தேர்வுசெய்யவும்.",lib_unsupported:"ஆதரிக்கப்படாத பட வகை",lib_restore_fail:"ரெஃபரன்ஸை மீட்டெடுக்க முடியவில்லை",on:"ஆன்",off:"ஆஃப்"},
te:{btn_show:"చూపించు",btn_save:"సేవ్",st_need_key:"ముందుగా RunningHub Enterprise key ఇవ్వండి",qual_auto:"ఆటో",btn_clear:"తొలగించు",btn_ref_layer:"+ లేయర్",btn_ref_file:"ఫైల్",btn_ref_web:"వెబ్",st_ref_layer_added:"లేయర్ రిఫరెన్స్‌గా జోడించబడింది ✓",st_ref_file_added:"ఫైల్ రిఫరెన్స్‌గా జోడించబడింది ✓",st_importing:"ఫైల్ దిగుమతి అవుతోంది",url_ph:"https://… చిత్ర చిరునామా లేదా Pinterest పిన్ లింక్",btn_load:"లోడ్",btn_cancel:"రద్దు",st_url_loading:"వెబ్ చిత్రం డౌన్‌లోడ్ అవుతోంది",st_ref_web_added:"వెబ్ చిత్రం రిఫరెన్స్‌గా జోడించబడింది ✓",st_url_bad:"ఈ URL నుండి చిత్రం లోడ్ కాలేదు — చిత్ర చిరునామాను కాపీ చేసి మళ్లీ ప్రయత్నించండి",no_layer:"ఏ లేయర్ ఎంపిక కాలేదు",st_web_import:"Photoshopలోకి లేయర్‌గా దిగుమతి అయింది ✓",st_folder_ok:"ఎక్స్‌పోర్ట్ ఫోల్డర్ సెట్ అయింది ✓",st_exported:"ఎక్స్‌పోర్ట్ అయింది ✓",st_export_fail:"ఎక్స్‌పోర్ట్ విఫలమైంది — ఫోల్డర్‌ను తనిఖీ చేయండి",st_img_bad:"చిత్ర డేటా సమగ్రత తనిఖీలో విఫలమైంది — ఫోటోను మళ్లీ జోడించండి",st_auto_comp:"ఆటో కాంపోజిట్: IMAGE 1 సబ్జెక్ట్ → రిఫరెన్స్ సీన్",tab_create: "Create",create_ph:"మీరు సృష్టించాలనుకునే చిత్రాన్ని వివరించండి…",btn_create_ps:"⬇ Photoshop కు పంపు",btn_to_ref:"↺ Ref 1 గా వాడు",st_to_ref:"ఫలితం Ref 1 లోకి లోడ్ అయింది ✓",cr_restyle:"♻ ఫలితాన్ని రీస్టైల్ చేయి",cr_gal_empty:"ఇంకా ఫలితాలు లేవు — Generate నొక్కండి.",cr_gal_have:"ఫలితం(లు) · ప్రివ్యూ / చర్య కోసం థంబ్‌నెయిల్ నొక్కండి",cr_save:"⬇ PNG సేవ్ చేయి",cr_need_result:"ముందుగా ఒక చిత్రాన్ని జనరేట్ చేయండి",ro_faceRep:"ఫేస్ రీప్లేస్",ro_faceSwap:"ఫేస్ స్వాప్",ro_bgRep:"BG రీప్లేస్",ro_bgSwap:"BG స్వాప్",ro_fgRep:"FG రీప్లేస్",ro_subSwap:"సబ్జెక్ట్ స్వాప్",ro_lcRef:"L&C రిఫరెన్స్",ro_lcCopy:"L&C కాపీ-పేస్ట్",ro_dressRef:"డ్రెస్ రిఫరెన్స్",ro_dressRep:"డ్రెస్ రీప్లేస్",ro_mkCopy:"మేకప్ కాపీ",ro_matchBtn:"★ మాస్టర్ మ్యాచ్",rt_none:"ముందుగా కనీసం ఒక రీటచ్ స్లయిడర్ లేదా రంగు సెట్ చేయండి",tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",cap_warn:"Photoshop ఈ prompt బాక్స్ పరిమితి:",btn_generate:"సృష్టించు",st_ready:"సిద్ధం",st_capture:"డాక్యుమెంట్ క్యాప్చర్ అవుతోంది",st_gen:"జనరేట్ అవుతోంది…",st_place:"Photoshopలో ప్లేస్ అవుతోంది…",st_placed_masked:"లేయర్ + మాస్క్ గ్రూప్‌గా ప్లేస్ అయింది — ఒరిజినల్‌కు ఎలాంటి మార్పు లేదు ✓",st_placed_plain:"సాధారణ లేయర్‌గా ప్లేస్ అయింది (ఈ హోస్ట్‌లో మాస్క్/గ్రూప్ అందుబాటులో లేదు)",stage_queued:"క్యూలో ఉంది",stage_uploading:"అప్‌లోడ్ అవుతోంది",stage_generating:"జనరేట్ అవుతోంది",stage_downloading:"డౌన్‌లోడ్ అవుతోంది",stage_placing:"ప్లేస్ అవుతోంది",st_done:"పూర్తయింది ✓",st_err:"లోపం",st_no_doc:"యాక్టివ్ డాక్యుమెంట్ లేదు — ముందుగా ఒక ఫోటో తెరవండి",st_no_prompt:"Prompt ఖాళీగా ఉంది",st_new_doc:"ఫలితం కొత్త డాక్యుమెంట్‌గా తెరుచుకుంది ✓",before:"ముందు",after:"తర్వాత",btn_place:"Photoshopలో ప్లేస్ చేయండి",st_saved:"సేవ్ అయింది ✓",lib_choose_msg:"మీ HNK రిఫరెన్స్ ఇమేజ్ లైబ్రరీ ఫోల్డర్‌ను ఎంచుకోండి.",lib_unsupported:"మద్దతు లేని ఇమేజ్ రకం",lib_restore_fail:"రిఫరెన్స్‌ను పునరుద్ధరించడం సాధ్యపడలేదు",on:"ఆన్",off:"ఆఫ్"},
ur:{tab_setup: "Setup",tab_prompt: "Edit",tab_presets: "Library",tab_retouch: "Retouch",tab_aitools: "Home",tab_create: "Create",btn_generate:"بنائیں",st_ready:"تیار",st_done:"ہو گیا ✓",st_need_key:"پہلے RunningHub Enterprise key ڈالیں",btn_show:"دکھائیں",btn_save:"محفوظ کریں",btn_clear:"صاف کریں",btn_cancel:"منسوخ",btn_load:"لوڈ"}
};

function t(k) {
  /* full table first (the nine complete languages), then the native starter
     pack, then the fallback language's full table, then English */
  const L = I18N[state.lang];
  if (L && Object.prototype.hasOwnProperty.call(L, k)) return L[k];
  const nx = I18N_L[state.lang];
  if (nx && Object.prototype.hasOwnProperty.call(nx, k)) return nx[k];
  const fb = LANG_FB[state.lang];
  if (fb && I18N[fb] && Object.prototype.hasOwnProperty.call(I18N[fb], k)) return I18N[fb][k];
  if (Object.prototype.hasOwnProperty.call(I18N.en, k)) return I18N.en[k];
  return k;
}

function applyI18n() {
  const nodes = document.querySelectorAll("[data-i18n]");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const k = el.getAttribute("data-i18n");
    el.textContent = t(k);
  }
  const phs = document.querySelectorAll("[data-i18n-ph]");
  for (let i = 0; i < phs.length; i++) {
    const el = phs[i];
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
  }
  const sel = $("selLang");
  if (sel && sel.value !== state.lang) sel.value = state.lang;
  try { langPaintHsl(); } catch (e) { }
  for (let i = 0; i < REFRESHERS.length; i++) { try { REFRESHERS[i](); } catch (e) { } }
}

/* ---------------- i18n bridge for the AI Tools sub-app ----------------
   The src/ modules load BEFORE main.js (UXP shared-global <script> order),
   so they cannot capture I18N at definition time. Publishing the lookup on
   globalThis.HNK lets dom.t(key, englishFallback) resolve lazily at render
   time — one dictionary, one active language, two UIs. */
(function publishI18nBridge() {
  try {
    const g = (typeof globalThis !== "undefined") ? globalThis : null;
    if (!g) return;
    g.HNK = g.HNK || {};
    g.HNK.i18n = {
      t: function (k) { return t(k); },
      table: I18N,
      langs: LANGS,
      codes: LANG_CODES,
      lang: function () { return state.lang; },
      /* v6.159.0 — a nine-language dict in the panel's language, the hand-dict fallback chain (Tutorials screen) */
      pick: function (m) { return ff9(m); }
    };
    /* v6.75.0 — the What's New "seen" list, for the Home screen module: UXP
       has no localStorage, so the panel's settings file is where dismissals
       live. get() hands a copy; set() re-bounds and writes the file. */
    g.HNK.seenStore = {
      get: function () { return Array.isArray(state.nwSeen) ? state.nwSeen.slice() : []; },
      set: function (list) {
        state.nwSeen = Array.isArray(list) ? list.filter(function (k) { return typeof k === "string" && k.length < 80; }).slice(0, 200) : [];
        try { saveSettings(); } catch (e) { }
      }
    };
    /* v6.28.1 — ONE key home (owner: "don't duplicate"). The AI Tools stack
       persists to hnk_ai_tools.json while Setup saves the Enterprise key to
       hnk_students_settings.json — two files, so a key saved in Setup never
       reached Free Generate and the Settings pill grew its own key field.
       This bridge makes Setup the single source of truth: the AI Tools
       settings service falls back to it whenever its own key is empty. */
    /* v6.46.0 — the gallery store writes binary files and must not carry its
       own base64 decoder; this is main.js's, already used by every save. */
    g.HNK.b64ToBuf = b64ToBuf;
    /* v6.83.0 — and its inverse, so the gallery store can read a saved
       result back for the Smart Workflow wizard's results board. */
    g.HNK.bufToB64 = bufToB64;
  g.HNK.openTake = takesOpenP;   /* v6.87.0 — History ▸ Videos ▸ Open */
    /* v6.159.1 — the Smart Workflow wizard's runs reach COST & BALANCE: bootstrap hands the adapter's usage here */
    g.HNK.spendBook = function (usage, meta) { try { rhBookUsage(usage, meta); } catch (e) { } };
  /* 6.166.0 — text size (AI Tools ▸ Settings): S · M · L as a body class the stylesheet reads; remembered in the
     settings file. The Home screen's recent strip and the Gallery tools are published beside it. */
  g.HNK.textSize = {
    get: function () { return state.tsize === "s" || state.tsize === "l" ? state.tsize : "m"; },
    set: function (v) { return tsizeSetP(v); }
  };
  g.HNK.homeRecent = { list: homeRecentListP, open: homeRecentOpen, title: function () { return ff9(GAL_L.recent); } };
  g.HNK.dropTarget = dropTargetBridge();
  g.HNK.ellMark = ellMark;   /* 6.167.0 — the screens' clamp marker */
    /* v6.83.0 — "Open in Edit" on the wizard's result card: IMAGE 1 becomes
       Freeform's Before and the result its After, entered into Freeform's own
       results history, so everything Freeform does with a result (compare,
       save, place, chain into IMG 1, Retouch, Path) works on a workflow's. */
    g.HNK.wfToFreeform = function (beforeRef, afterRef) {
      const parse = function (ref) {
        const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(ref || ""));
        return m ? { mime: m[1].toLowerCase(), b64: m[2] } : null;
      };
      const a = parse(afterRef); if (!a) return false;
      const b = parse(beforeRef);
      state.resultB64 = a.b64; state.resultMime = a.mime;
      state.beforeB64 = b ? b.b64 : null; state.beforeMime = b ? b.mime : null;
      try {
        pushHistory({ after: a.b64, afterMime: a.mime, before: state.beforeB64, beforeMime: state.beforeMime,
          userText: "", finalPrompt: "", action: "workflow", ts: Date.now(), ratio: state.previewRatio });
      } catch (e) { }
      try { refreshCompare(); } catch (e) { }
      try { switchPage("prompt"); } catch (e) { }
      return true;
    };
    g.HNK.studioKey = function () { return (state && state.rhKey) || ""; };
    /* A key Setup has SAVED is the studio's working key (the classic stack
       keeps no separate verified flag — Test Key only gates the save), so a
       bridged key counts as verified: Free Generate must not nag the user
       to re-verify a key that already runs the classic tabs. */
    g.HNK.studioKeyVerified = function () { return !!(state && state.rhKey); };
    /* v6.49.0 — the AI Tools screens are the app's Home and Workflows now,
       and the app's Home routes to OTHER PAGES: its six picture cards open
       Retouch, Workflows, Freeform, Media Lab, Path and Gallery (its
       "Photoshop Panel download" button went in 6.102.1 — one download
       place, the Account card's Panel group). Those live in main.js, so
       the sub-app reaches them through this bridge rather than
       reaching into the module scope. */
    g.HNK.panelNav = {
      switchPage: function (key) { try { switchPage(key); saveSettings(); } catch (e) { } },
      getUpdate: function () { try { return panelGetUpdate(); } catch (e) { } },
      /* v6.51.0 — the app's Home greets the signed-in member by name with the
         plan pill, and shows the COST & BALANCE strip once a run or a balance
         check exists (renderDashGreet / renderDashMoney). The session, the
         profile and the spend ledger live here, so the screen asks. */
      dash: function () {
        const out = { name: "", planLine: "", money: null };
        try {
          const sess = gateS.sess, prof = gateS.prof;
          if (sess) {
            out.name = (prof && prof.name) ? String(prof.name) : String(sess.email || "").split("@")[0];
            if (prof) out.planLine = accPlanLineText();
          }
        } catch (e) { }
        try {
          const r = spendRollup(), b = balLoad();
          if (r.all.n || b) {
            out.money = {
              h: sl("money_h"),
              balL: sl("money_bal"), todayL: sl("money_today"), runsL: sl("money_runs"),
              bal: balText(b, true),
              today: r.today.n ? fmtMoney(r.today.money, r.cur) : "—",
              runs: String(r.today.n),
              note: b
                ? [balText(b), sl("money_checked").replace("{T}", agoText(b.ts))].join(" · ")
                : sl("money_all").replace("{N}", String(r.all.n)).replace("{C}", fmtMoney(r.all.money, r.cur))
            };
          }
        } catch (e) { }
        return out;
      },
      /* v6.51.0 — the app's card-corner batch button (_ptUseWorkflow): pick
         the workflow on the Path page and go there; and the app's toast, so
         the Workflows page's "Section reset" reads the same way. */
      useWorkflow: function (id) {
        try {
          if (!ptSetWorkflow(String(id || ""))) return;
          switchPage("path");
          const el = $("ptWfBox");
          if (el && el.scrollIntoView) setTimeout(() => { try { el.scrollIntoView({ block: "center" }); } catch (e) { } }, 60);
        } catch (e) { }
      },
      toast: function (msg, kind) { try { setStatus(msg, kind); } catch (e) { } }
    };
    /* v6.51.0 — RETOUCH A / RETOUCH B STUDIO BRIDGE.
       js/hnk_studio_suites.js carries the web app's own studio builders and
       src/ui/screens/retouch-studio-screen.js runs them on UXP's DOM. Those
       files never reach into main.js's scope; everything they need from the
       panel — the shared state object, the photo slot, the file dialogs, the
       status line — arrives through here. */
    g.HNK.studioHost = {
      state: function () { return state; },
      saveState: function () { try { saveSettings(); } catch (e) { } },
      toast: function (msg, kind) { try { setStatus(msg, kind); } catch (e) { } },
      switchPage: function (id) { try { switchPage(studioPageKey(id)); saveSettings(); } catch (e) { } },
      /* the studio compares this with its own page ids, so answer in its
         language, not the panel's (see studioPageId) */
      curPage: function () { return studioPageId(state.page || ""); },
      /* a function, not a value: this bridge is published before APP_URL's
         own const is evaluated, and a TDZ throw here would silently cost the
         whole studio its host */
      assetBase: function () { return APP_URL; },
      /* the app's batch hand-off: pick the workflow on the Path page */
      ptSetWorkflow: function (id) { try { g.HNK.panelNav.useWorkflow(id); } catch (e) { } },
      rhIsConfigured: function (id) { try { return rhIsConfigured(id); } catch (e) { return false; } },
      /* the app names the model a run will actually use; the panel's own
         Freeform model selection is that model here */
      rhEngineLabel: function () { try { const m = ffModel(); return m ? "RunningHub · " + ffModelLabel(m) : ""; } catch (e) { return ""; } },
      /* Photoshop has no window.prompt; this is the panel's own one-field
         dialog, in the same card shape as setupConfirm's */
      askText: function (msg, def, cb) { studioAskText(msg, def).then(function (v) { cb && cb(v); }); },
      /* the studio's PHOTO slot IS the panel's subject slot */
      /* v6.79.0 — the owner's 15th and 16th photographs: this tap opened a
         Windows "Select Folder" dialog. refLibBrowseInto asks for the
         reference LIBRARY folder first when none is set, and Retouch's photo
         is not a library pick: it is the open layer, or one file. The same
         sheet every other slot opens (Layer · File), through the panel's own
         capture paths. */
      pickPhoto: function () { try { stPickInto("subject-reference", "PHOTO"); } catch (e) { } },
      /* 6.164.0 — the card's ↻: read the active layer again, straight into the PHOTO slot */
      pickLayer: function () { try { refLayerInto("subject-reference"); } catch (e) { } },
      pickRef: function () { try { stPickInto("reference-2", "REF"); } catch (e) { } },
      clearPhoto: function () {
        try {
          state.refs[0] = null;
          renderRefs();
          const sc = g.HNK.studioScreen; if (sc) sc.renderPicker();
          saveSettings();
        } catch (e) { }
      },
      /* an 880-pack style becomes the reference image, fetched from the same
         catalog the web app serves */
      loadRefFromUrl: async function (url, cb) {
        try {
          setStatus(t("st_importing"));
          const got = await fetchWebImage(url);
          const b64 = bufToB64(got.buf);
          if (!imgMagicOk(b64)) { setStatus(t("st_img_bad") + " (Ref)", "err"); cb && cb(false); return; }
          state.refs[1] = { b64: b64, mime: got.mime || "image/jpeg", label: urlLabel(url) };
          renderRefs();
          setStatus(t("st_ref_file_added"), "ok");
          cb && cb(true);
        } catch (e) { herr("studio ref url:", e); cb && cb(false); }
      },
      /* the studio watermark logo: Photoshop's own file dialog, then the
         data URL the app's watermark code stores */
      pickLogo: async function (cb) {
        try {
          const file = await fsp.getFileForOpening({ allowMultiple: false, types: REF_LIB_TYPES });
          if (!file) return;
          const cap = await refCaptureEntry(file);
          if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad"), "err"); return; }
          cb && cb("data:" + (cap.mime || "image/png") + ";base64," + cap.b64);
        } catch (e) { herr("studio logo:", e); setStatus(t("st_img_bad"), "err"); }
      }
    };
  } catch (e) { }
})();

/* v6.51.0 — one run for the app's three retouch pages: the sentence is the
   app's (its own prompt composer), the run is the panel's. */
function studioRun(btn, which) {
  const sc = globalThis.HNK && globalThis.HNK.studioScreen;
  const api = sc && sc.api && sc.api();
  if (!api) { setStatus(t("st_err"), "err"); return; }
  if (!state.refs[0]) { setStatus(api.RS_NEED_PHOTO, "err"); return; }
  let prompt = "";
  try {
    prompt = which === "v2" ? api.v2BuildPrompt()
      : which === "rs" ? api.buildRetouch()
        : api.stComposePrompt();
  } catch (e) { herr("retouch prompt:", e); }
  prompt = String(prompt || "").trim();
  if (!prompt) { setStatus(t("rt_none"), "err"); return; }
  setBusyBtn(btn);
  runGenerate(prompt, true, ["skin", "subject"], false, { action: "Retouch", realDir: "edit" });
}

/* The studio's own switchPage("pgMeitu") style ids, mapped to panel keys —
   and, since v6.56.0, back again. ONE table, read both ways: a second
   hand-written map is exactly how the two directions drift apart. */
const STUDIO_PAGE_IDS = { pgMeitu: "meitu", pgEvoto: "evoto", pgRetouch: "retouch", pgPath: "path", pgCreate: "create", pgLib: "presets", pgGallery: "gallery" };
function studioPageKey(id) {
  return STUDIO_PAGE_IDS[id] || id;
}
/* v6.56.0 — the sliced studio code asks "which page am I on?" and compares the
   answer with its OWN ids ("pgMeitu"), because in the web app that is what the
   page is called. The panel answered with its own key ("meitu"), so the
   comparison could never be true: the RETOUCH A / RETOUCH B tab never wore the
   "on" class (the student could not see which suite they were in), a jump-bar
   chip for a group already on screen re-navigated to the page it was already
   on, and the feature search counted every match as "over on the other suite"
   and jumped away from the results it had just found. The string tests could
   not see any of it — the two surfaces carry the same chips, only a different
   one wears the class. */
function studioPageId(key) {
  const ids = Object.keys(STUDIO_PAGE_IDS);
  for (let i = 0; i < ids.length; i++) { if (STUDIO_PAGE_IDS[ids[i]] === key) return ids[i]; }
  return key;
}

/* Re-render the mounted AI Tools sub-app whenever the language changes, so
   its screens repaint in the new language exactly like the classic tabs. */
REFRESHERS.push(function () {
  try {
    const app = globalThis.HNK && globalThis.HNK.aiToolsApp;
    if (app && typeof app.mount === "function") app.mount();
  } catch (e) { }
});

/* ---------------- v6.50.0 — the page heroes ----------------
   Every page opens on the web app's own hero: the app's own plate (baked at
   the app's own crop with the app's own readability scrim, since UXP has
   neither object-fit nor gradient overlays), the app's English kick line and
   the app's headline. These are the app's ph_* maps carried verbatim as data
   — <em> included, which the painter renders as a real <em> node so the
   accent phrase reads gold exactly as it does in the browser. They live here
   rather than in the panel's I18N table so the ~20 translation packs keep
   their pinned key sets — the same rule the Home dashboard's copy follows. */
const PAGE_HERO_HEADS = {
  phHome: { my: "တစ်ခါချိန်ညှိရုံနဲ့ <em>အမြဲအဆင်သင့်</em> ဖြစ်နေမယ်", en: "Set up once — <em>ready whenever you are</em>",
    shn: "Setup ပွၵ်ႈလဵဝ် — <em>ၶႂ်ႈၸႂ်ႉမိူဝ်ႈလႂ်ၵေႃႈ ႁၢင်ႈႁႅၼ်းဝႆႉယဝ်ႉ</em>", kac: "Kalang sha setup galaw u — <em>galoi raitim hkyen da sai</em>",
    th: "ตั้งค่าครั้งเดียว — <em>พร้อมใช้ทุกเมื่อ</em>", zh: "设置一次 — <em>随时待命</em>",
    vi: "Thiết lập một lần — <em>sẵn sàng bất cứ lúc nào</em>", id: "Atur sekali — <em>siap kapan saja</em>",
    ms: "Sedia sekali sahaja — <em>sedia bila-bila masa</em>" },
  phCreate: { my: "စိတ်ကူးထဲက မြင်ကွင်းတိုင်းကို <em>လွတ်လပ်စွာ</em> ဖန်တီးပါ", en: "Bring every scene you imagine to life — <em>your way</em>",
    shn: "ႁဵတ်းႁႂ်ႈမူႇၶႅပ်းဢၼ်ၼႂ်းၸႂ်ၸဝ်ႈၵဝ်ႇ ပဵၼ်တႄႉမႃး — <em>ၸွမ်းၸႂ်ၸဝ်ႈၵဝ်ႇ</em>", kac: "Na myit hta mu ai lam shagu hpe asak jaw u — <em>na a lam hku</em>",
    th: "เนรมิตทุกฉากที่คุณจินตนาการ — <em>ในแบบของคุณ</em>", zh: "把你想象的每个场景变为现实 — <em>随心所欲</em>",
    vi: "Biến mọi khung cảnh bạn tưởng tượng thành hiện thực — <em>theo cách của bạn</em>", id: "Wujudkan setiap adegan yang Anda bayangkan — <em>dengan cara Anda</em>",
    ms: "Hidupkan setiap adegan yang anda bayangkan — <em>mengikut cara anda</em>" },
  phImagine: {"my": "ပုံထည့် · template ရွေး · <em>တစ်ချက်နှိပ်</em> — prompt မလို", "en": "Add a photo · pick a template · <em>one tap</em> — no prompt", "shn": "သႂ်ႇၶႅပ်း · လိူၵ်ႈ template · <em>ၼဵၵ်းပွၵ်ႈလဵဝ်</em>", "kac": "Sumla bang · template lata · <em>kalang dip</em>", "th": "เพิ่มรูป · เลือกเทมเพลต · <em>แตะครั้งเดียว</em> — ไม่ต้องพรอมต์", "zh": "添加照片 · 选择模板 · <em>一键</em>——无需提示词", "vi": "Thêm ảnh · chọn mẫu · <em>một chạm</em> — không cần prompt", "id": "Tambah foto · pilih templat · <em>sekali ketuk</em> — tanpa prompt", "ms": "Tambah foto · pilih templat · <em>sekali ketik</em> — tanpa prompt"},
  phMeitu: { my: "Retouch A ပုံစံ ၁၆၃ မျိုး — <em>Live Preview</em> နဲ့ တစ်ချက်ချင်း မြင်ရမယ်", en: "163 Retouch A controls, every one of them on <em>live preview</em>",
    shn: "Retouch A 163 ဢၼ် — ပႃး <em>live preview</em> ၵူႈဢၼ်", kac: "Retouch A 163 hpe — yawng <em>live preview</em> hte",
    th: "ปรับแต่ง Retouch A 163 รายการ พร้อม<em>พรีวิวสด</em>ทุกตัว", zh: "163 项 Retouch A 调整，每一项都有<em>实时预览</em>",
    vi: "163 tùy chỉnh Retouch A, tất cả đều có <em>xem trước trực tiếp</em>", id: "163 kontrol Retouch A, semuanya dengan <em>pratinjau langsung</em>",
    ms: "163 kawalan Retouch A, semuanya dengan <em>pratonton langsung</em>" },
  phEvoto: { my: "Retouch B Pro ၂၁၃ မျိုး — အသားအရေနဲ့ အလင်း <em>အသေးစိတ်</em> ချိန်ညှိ", en: "213 Retouch B Pro controls for skin and light, tuned <em>in detail</em>",
    shn: "Retouch B Pro 213 ဢၼ် — ၽိဝ်ၼိူဝ်ႉလႄႈ ဢၼ်လႅင်း <em>ဢၼ်လဵၵ်ႉ</em>", kac: "Retouch B Pro 213 hpe — hpyi hte htoi <em>ginsup</em> galaw",
    th: "Retouch B Pro 213 รายการ ปรับผิวและแสง<em>อย่างละเอียด</em>", zh: "213 项 Retouch B Pro 控制，肤质与光线<em>精细</em>调校",
    vi: "213 tùy chỉnh Retouch B Pro cho da và ánh sáng, <em>chi tiết</em>", id: "213 kontrol Retouch B Pro untuk kulit dan cahaya, <em>terperinci</em>",
    ms: "213 kawalan Retouch B Pro untuk kulit dan cahaya, <em>terperinci</em>" },
  phRetouch: { my: "မူရင်းအလှ မပျက်စေဘဲ <em>ချောမွေ့ကြည်လင်</em> စေမယ်", en: "Flawless retouching that <em>stays natural</em>",
    shn: "မႄးၶႅပ်းႁၢင်ႈႁႂ်ႈႁၢင်ႈလီ သေ <em>တိုၵ်ႉပဵၼ်သၽႃႇဝ</em>", kac: "<em>Sha-sha re nga ai</em> tsawm htap ai retouch",
    th: "รีทัชไร้ที่ติแต่<em>ยังดูเป็นธรรมชาติ</em>", zh: "无瑕精修，<em>依然自然</em>",
    vi: "Chỉnh sửa hoàn hảo mà <em>vẫn tự nhiên</em>", id: "Retouch sempurna yang <em>tetap alami</em>",
    ms: "Sentuhan sempurna yang <em>kekal semula jadi</em>" },
  phT2i: { my: "စာသားတစ်ကြောင်းကနေ <em>ပရော်ဖက်ရှင်နယ်ပုံ</em> ဖြစ်လာမယ်", en: "One line of text becomes a <em>professional image</em>",
    shn: "လိၵ်ႈထႅဝ်လဵဝ် လႅၵ်ႈပဵၼ် <em>ၶႅပ်းႁၢင်ႈၸၼ်ႉၶိုၵ်ႉ</em>", kac: "Laika hteng langai sha <em>professional sumla</em> byin wa ai",
    th: "ข้อความบรรทัดเดียวกลายเป็น<em>ภาพระดับมืออาชีพ</em>", zh: "一行文字变成<em>专业级图像</em>",
    vi: "Một dòng chữ trở thành <em>bức ảnh chuyên nghiệp</em>", id: "Satu baris teks menjadi <em>gambar profesional</em>",
    ms: "Satu baris teks menjadi <em>imej profesional</em>" },
  phVideo: { my: "ဓာတ်ပုံတွေကို <em>အသက်ဝင်</em> လှုပ်ရှားစေမယ်", en: "Your photos <em>come alive</em> in motion",
    shn: "ၶႅပ်းႁၢင်ႈၸဝ်ႈၵဝ်ႇ တူင်ႉၼိုင် <em>မီးသၢႆၸႂ်မႃး</em>", kac: "Na a sumla ni shamu shamawt hte <em>asak rawng wa</em> ai",
    th: "ภาพถ่ายของคุณ<em>มีชีวิต</em>ด้วยการเคลื่อนไหว", zh: "让你的照片在动态中<em>活起来</em>",
    vi: "Ảnh của bạn <em>sống động</em> trong chuyển động", id: "Foto Anda <em>menjadi hidup</em> dalam gerakan",
    ms: "Foto anda <em>hidup</em> dalam gerakan" },
  phVideoUp: { my: "ဗီဒီယိုအရည်အသွေး <em>နှစ်ဆမြှင့်</em> — ပိုကြည် ပိုပြတ်သား", en: "<em>Double</em> your video quality — sharper, cleaner",
    shn: "ယုၵ်ႉၼမ်ႉၸၼ်ႉဝီးတီးဢူဝ်း <em>သွင်ပုၼ်ႈ</em> — ၸႅင်ႈလိူဝ် သႅၼ်ႈလိူဝ်", kac: "Video a atsam hpe <em>lahkawng lang</em> jat u — grau san, grau seng ai",
    th: "ยกระดับคุณภาพวิดีโอ<em>สองเท่า</em> — คมชัดยิ่งขึ้น", zh: "视频画质<em>翻倍</em> — 更锐利、更干净",
    vi: "<em>Nhân đôi</em> chất lượng video — sắc nét hơn, sạch hơn", id: "<em>Gandakan</em> kualitas video — lebih tajam, lebih bersih",
    ms: "<em>Gandakan</em> kualiti video — lebih tajam, lebih bersih" },
  /* v6.73.0 — the app's ph_v2v, word for word */
  phV2V: { my: "ဗီဒီယိုထဲ <em>ကိုယ့်ဇာတ်ကောင်</em> — ကင်မရာနဲ့ နောက်ခံ အတိုင်း", en: "<em>Your character</em> inside the clip — camera and scene unchanged",
    shn: "<em>တူဝ်ၸဝ်ႈၵဝ်ႇ</em> ၼႂ်းဝီးတီးဢူဝ်း — ၵႄႇမရႃႇလႄႈႁွင်ႈလင် ဢမ်ႇလႅၵ်ႈ", kac: "Video hta <em>nang a masha</em> — camera hte shara n galai ai",
    th: "<em>ตัวละครของคุณ</em>ในคลิป — กล้องและฉากคงเดิม", zh: "片中换成<em>你的角色</em> — 镜头与场景不变",
    vi: "<em>Nhân vật của bạn</em> trong clip — máy quay và bối cảnh giữ nguyên", id: "<em>Karakter Anda</em> di dalam klip — kamera dan latar tetap",
    ms: "<em>Watak anda</em> dalam klip — kamera dan latar kekal" },
  phLib: { my: "Look ၁၈၅၀ မျိုးထဲက ကြိုက်တာ <em>ရွေးလိုက်ရုံ</em> — ချက်ချင်းစနိုင်", en: "1850 curated looks — <em>pick one</em> and start instantly",
    shn: "Look 1850 မဵဝ်း လိူၵ်ႈဝႆႉပၼ် — <em>လိူၵ်ႈဢၼ်ၼိုင်ႈ</em> သေ တႄႇလႆႈၵမ်းလဵဝ်", kac: "Lata da ai look 1850 — <em>langai lata la</em> nna kalang ta hpang u",
    th: "1850 ลุคคัดสรร — <em>เลือกหนึ่ง</em>แล้วเริ่มได้ทันที", zh: "1850 款精选风格 — <em>选一款</em>立即开始",
    vi: "1850 phong cách tuyển chọn — <em>chọn một</em> và bắt đầu ngay", id: "1850 gaya pilihan — <em>pilih satu</em> dan mulai seketika",
    ms: "1850 gaya pilihan — <em>pilih satu</em> dan mula serta-merta" },
  phGallery: { my: "ဖန်တီးခဲ့သမျှ အမှတ်တရတွေ <em>ဒီမှာအမြဲ</em> စုစည်းထား", en: "Every creation you make, <em>saved right here</em>",
    shn: "ၵူႈဢၼ်ဢၼ်ၸဝ်ႈၵဝ်ႇသၢင်ႈ <em>သိမ်းဝႆႉတီႈၼႆႈ</em>", kac: "Na galaw da ai shagu, <em>ndai kaw makoi da ai</em>",
    th: "ทุกผลงานที่คุณสร้าง <em>บันทึกไว้ที่นี่</em>", zh: "你的每一件作品，<em>都保存在这里</em>",
    vi: "Mọi tác phẩm bạn tạo, <em>được lưu ngay tại đây</em>", id: "Setiap karya yang Anda buat, <em>tersimpan di sini</em>",
    ms: "Setiap hasil ciptaan anda, <em>disimpan di sini</em>" },
  phPath: { my: "ဓာတ်ပုံအားလုံးကို Look တစ်ခုတည်းနဲ့ <em>တစ်ပြိုင်နက်</em> ပြင်မယ်", en: "One look, applied to your whole album — <em>all at once</em>",
    shn: "Look ဢၼ်လဵဝ် ၸႂ်ႉတင်းမူႇၶႅပ်းႁၢင်ႈ — <em>ၵမ်းလဵဝ်တင်းသဵင်ႈ</em>", kac: "Look langai sha, na a sumla yawng hta — <em>kalang ta yawng</em>",
    th: "ลุคเดียว ใช้กับทั้งอัลบั้ม — <em>พร้อมกันทั้งหมด</em>", zh: "一个风格，套用整本相册 — <em>一次全部完成</em>",
    vi: "Một look, áp cho cả album — <em>tất cả cùng lúc</em>", id: "Satu look untuk seluruh album — <em>sekaligus</em>",
    ms: "Satu look untuk seluruh album — <em>serentak</em>" },
  t2iIntro: { my: "Prompt တစ်ခုတည်းနဲ့ ပုံအသစ် ထုတ်ပေးမယ် — reference ပုံ မလိုပါ။ RunningHub Enterprise key လိုအပ်ပါတယ်။",
    en: "Generate a brand-new image from just a text prompt — no reference photo needed. Needs your RunningHub Enterprise key.",
    shn: "ႁဵတ်းၶႅပ်းႁၢင်ႈမႂ်ႇတီႈ prompt ၵူၺ်း — ဢမ်ႇလူဝ်ႇ reference ၶႅပ်းႁၢင်ႈ",
    kac: "Prompt sha hte lam de sumla nngai galaw ai — reference sumla n ra ai",
    th: "สร้างภาพใหม่จากข้อความอย่างเดียว — ไม่ต้องใช้รูปอ้างอิง", zh: "仅凭文字提示词生成全新图片 — 不需要参考图片",
    vi: "Tạo ảnh hoàn toàn mới chỉ từ một prompt văn bản — không cần ảnh tham chiếu",
    id: "Buat gambar baru hanya dari prompt teks — tidak perlu foto referensi",
    ms: "Jana imej baharu hanya daripada prompt teks — tidak perlu foto rujukan" }
};
/* The app's ph_* strings mark one accent phrase with <em>; render it as a
   real <em> child (gold) and everything else as text nodes. */
function paintHeroHead(el, str) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
  const parts = String(str || "").split(/<\/?em>/);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (i % 2 === 1) { const em = document.createElement("em"); em.textContent = parts[i]; el.appendChild(em); }
    else el.appendChild(document.createTextNode(parts[i]));
  }
}
/* The panel's one Retouch page stands in for the app's Retouch A, Retouch B
   and Retouch pages, so its hero follows the pill: the app's plate, kick and
   headline for whichever of the three is open. */
/* v6.51.0 — Retouch A and Retouch B are the app's own pages now (each with
   its own hero in the markup), so this one only dresses Retouch Pro. */
function paintRetouchHero() {
  const head = $("phRetouch"), m = PAGE_HERO_HEADS.phRetouch;
  if (head && m) paintHeroHead(head, m[state.lang] || m.en);
}
function paintPageHeroHeads() {
  for (const id in PAGE_HERO_HEADS) {
    const el = $(id);
    if (!el) continue;
    const m = PAGE_HERO_HEADS[id];
    paintHeroHead(el, m[state.lang] || m.en);
  }
  paintRetouchHero();
}
REFRESHERS.push(paintPageHeroHeads);

/* ---------------- Theme wheel (v6.35.0: dark, light + the owner's seven
   LEARN-DESIGN palettes; unknown stored values fall back to dark) ---------------- */
var PANEL_THEMES = ["dark", "light", "olive", "ember", "limelight", "mustard", "royal", "electric", "porcelain"];
function applyTheme() {
  const th = (PANEL_THEMES.indexOf(state.theme) >= 0) ? state.theme : "dark";
  const root = document.getElementById("app") || (document.body || null);
  if (root && root.setAttribute) root.setAttribute("data-theme", th);
  try { if (document.documentElement && document.documentElement.setAttribute) document.documentElement.setAttribute("data-theme", th); } catch (e) { }
}

/* ============================================================
   SETUP — the web app's pgHome, in Photoshop (v6.51.0)

   The owner asked for the panel's Setup to be the app's Setup: the same
   cards in the same order, the same rows, the same buttons, the same words,
   nothing extra. So this is the app's own Setup code — renderSetupStatus,
   the account card (acc*), the RunningHub key + per-model endpoint card
   (rh*), the spend ledger and balance (spend* and money*), backup, platforms,
   share and about — ported line for line. What differs is only what UXP
   forces: `state`/the settings file where the app has localStorage,
   `<dialog>` where it has window.confirm, the UXP shell where it has
   window.open, div controls where it has <button>. Row rendering for the
   other pages (renderRows) stays as it was. */
/* v6.74.0 — A FIFTH LEVEL, AND WHY "!" WAS THE WRONG ONE FOR EIGHT ROWS.
   The owner photographed the SELF-TEST card twice in one day and asked for
   everything to be checked — because eight rows say "!" on every run of every
   build, and "!" means something is wrong. Nothing was: those rows are the
   probes this renderer CANNOT answer (no layout geometry, computed style an
   echo, no Range.getClientRects), settled since 6.137.0 and written down
   every time. A warning that fires forever is a warning nobody can read, and
   it hides the day a real one appears among them.
   `host` is "the host cannot answer this — expected", drawn muted, and it is
   earned only by the answers that MEAN that (unmeasurable, unavailable, echo,
   every ruler at zero). A wrong answer — content-box measured, a glyph
   missing, one box per character — is still "!" exactly as before. */
const DIAG_ICON = { ok: "✓", warn: "!", err: "×", pend: "•", host: "~" };
/* v6.46.0 — one row renderer for every Setup card, because the web app's
   Setup is a column of status rows and nothing else. It used to serve only
   the diagnostics card; READINESS, ACCOUNT, COST & BALANCE, DATA & BACKUP
   and APP & UPDATES are the same shape, so they share it. A row may name its
   label by i18n key (`key`) or carry it literally (`label`). */
function renderRows(hostId, rows) {
  const box = $(hostId);
  if (!box) return;
  while (box.firstChild) box.removeChild(box.firstChild);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = document.createElement("div"); row.className = "diagrow";
    const ic = document.createElement("div"); ic.className = "diag-ic " + (r.level || "pend");
    ic.textContent = DIAG_ICON[r.level] || DIAG_ICON.pend;
    const nm = document.createElement("div"); nm.className = "diag-nm";
    nm.textContent = r.key ? t(r.key) : (r.label || "");
    const st = document.createElement("div"); st.className = "diag-st";
    /* v6.132.0 — a row may SHOW pictures instead of describing them. No script
       in this renderer can read back what colour an <img> painted, and the one
       question the owner's photograph can answer instantly is whether a
       stroke-drawn icon and a fill-drawn icon come out the same. So the card
       draws one of each, side by side, and the camera is the instrument. */
    if (r.icons && r.icons.length) {
      for (let k = 0; k < r.icons.length; k++) {
        const sw = document.createElement("img");
        sw.className = "diag-sw"; sw.alt = "";
        sw.src = r.icons[k];
        st.appendChild(sw);
      }
      if (r.detail) {
        const cap = document.createElement("span"); cap.className = "diag-swcap";
        cap.textContent = r.detail; st.appendChild(cap);
      }
    } else if (r.chars && r.chars.length) {
      /* v6.64.0 — a row may show CHARACTERS at a size a camera can resolve.
         No script can read back what a renderer painted, and the glyph probe
         two rows above is arithmetic on advance widths; this is the picture
         that checks it. A box here must appear in the "glyphs" list, and the
         codepoints are printed underneath in the same order, so the
         photograph identifies each one without counting. */
      const strip = document.createElement("div");
      strip.className = r.big ? "diag-glyphs diag-big" : "diag-glyphs";
      for (let k = 0; k < r.chars.length; k++) {
        const cell = document.createElement("span");
        cell.className = "diag-gl";
        cell.textContent = r.chars[k];
        strip.appendChild(cell);
      }
      st.appendChild(strip);
      const cap = document.createElement("div"); cap.className = "diag-swcap";
      cap.textContent = r.detail || ""; st.appendChild(cap);
    } else st.textContent = r.detail || "";
    row.appendChild(ic); row.appendChild(nm); row.appendChild(st);
    box.appendChild(row);
  }
}

const APP_URL = "https://hnkaistudio.com/app/";
const PROV_NAME = { rh: "RunningHub" };
const ACC_GRPS = ["accGrpAuth", "accGrpPlan", "accGrpPanel", "accGrpDev"];
/* the app's one-shot "first session seen → open the plan group" latch */
let _accSessSeen = false;

/* ---------- UXP stand-ins for the browser pieces the app leans on ---------- */
/* window.open → the UXP shell (gateOpenSite's exact ladder), clipboard last. */
async function openUrl(u) {
  u = String(u || "");
  if (!u) return;
  try {
    if (shell && shell.openExternal) { await shell.openExternal(u); return; }
  } catch (e) { }
  try {
    if (typeof require === "function") {
      const x = require("uxp");
      if (x && x.shell && x.shell.openExternal) { await x.shell.openExternal(u); return; }
    }
  } catch (e) { }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(u);
    else if (navigator.clipboard && navigator.clipboard.setContent) await navigator.clipboard.setContent({ "text/plain": u });
  } catch (e) { }
}
/* window.confirm → a modal <dialog> with the app's two-button row. UXP has no
   window.confirm; its <dialog>.showModal() resolves with the close value. */
/* v6.51.0 — the studio's one text question (a recipe's name), asked the way
   setupConfirm asks a yes/no: a <dialog> wearing the app's card, since UXP
   has neither window.prompt nor any synchronous dialog. Resolves to null on
   cancel, so a caller can tell "left alone" from "typed nothing". */
function studioAskText(msg, def) {
  return new Promise(function (resolve) {
    let done = false, dlg = null, inp = null;
    const fin = function (v) {
      if (done) return;
      done = true;
      try { if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg); } catch (e) { }
      resolve(v);
    };
    try {
      dlg = document.createElement("dialog");
      dlg.className = "hnk-dlg";
      const body = document.createElement("div"); body.className = "hnk-dlg-body";
      const p = document.createElement("p"); p.className = "hnk-dlg-msg"; p.textContent = String(msg || "");
      inp = document.createElement("input");
      inp.type = "text"; inp.className = "inp"; inp.value = String(def == null ? "" : def);
      const row = document.createElement("div"); row.className = "hnk-dlg-row";
      const no = document.createElement("div"); no.className = "btn"; no.setAttribute("role", "button"); no.setAttribute("tabindex", "0"); no.textContent = t("btn_cancel");
      const ok = document.createElement("div"); ok.className = "btn btn-gold"; ok.setAttribute("role", "button"); ok.setAttribute("tabindex", "0"); ok.textContent = t("btn_ok");
      no.addEventListener("click", function () { try { dlg.close("cancel"); } catch (e) { } fin(null); });
      ok.addEventListener("click", function () { const v = inp.value; try { dlg.close("ok"); } catch (e) { } fin(v); });
      inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { const v = inp.value; try { dlg.close("ok"); } catch (e) { } fin(v); } });
      row.appendChild(no); row.appendChild(ok);
      body.appendChild(p); body.appendChild(inp); body.appendChild(row);
      dlg.appendChild(body);
      dlg.addEventListener("cancel", function () { fin(null); });
      document.body.appendChild(dlg);
      const r = hnkShowDialog(dlg, { title: "", width: 300, height: 210 });
      if (r && r.then) r.then(function (v) { fin(v === "ok" ? inp.value : null); }, function () { fin(null); });
      try { inp.focus(); } catch (e) { }
    } catch (e) { herr("studio prompt:", e); fin(null); }
  });
}

/* ============================================================
   v6.78.0 — THE PICKER THAT OPENS IN PHOTOSHOP.

   Twenty-one pickers (the Freeform, Video, VidUp, V→V, Talk and Text→Image
   model / size / duration / count / option selects, Setup's model and
   quality, and the header's language) were each a native <select> made
   transparent and laid over a styled button. A browser opens the select's
   dropdown on the tap; Photoshop's renderer opens nothing, and the owner's
   6.148.0 photographs say so in two words: no model, no language.

   The select stays — every reader and writer in the panel goes through it —
   but it leaves the hit path (styles.css .hsl .inp) and the button does the
   work: one listener at the document catches a tap on any .hsl-btn, finds
   the wrapper's select, and opens a <dialog> list of its options (the
   disabled rows the video picker uses as family headers stay headers; past
   eight rows a search field filters). Choosing a row sets selectedIndex and
   fires the same input + change events the native dropdown would have, so
   every existing handler repaints exactly as before. */
/* v6.79.0 — HOW A DIALOG GETS ITS SIZE IN PHOTOSHOP. The owner's 6th and
   14th photographs of 6.149.0: the Model list and the photo sheet both opened
   as a strip eighty pixels wide, a scrollbar and a sliver of each row. UXP
   sizes a dialog from its CONTENT's explicit dimensions — width on the
   <dialog> itself, and the background painted on it, are the host's to
   ignore — so the first child carries the width in px, the background and
   the colour, and showModal is handed the same size (UXP's option; a browser
   takes no argument and ignores it). One helper, used by every dialog the
   panel opens: the pickers, the photo sheet, the confirm, the text prompt. */
function hnkShowDialog(dlg, opts) {
  opts = opts || {};
  const w = Math.max(200, opts.width || 320), h = Math.max(120, opts.height || 240);
  try {
    const body = dlg.firstElementChild || dlg.firstChild;
    if (body && body.style) { body.style.width = w + "px"; body.style.boxSizing = "border-box"; }
  } catch (e) { }
  const o = { title: String(opts.title || ""), resize: "none", size: { width: w + 20, height: h } };
  try { if (typeof dlg.uxpShowModal === "function") return dlg.uxpShowModal(o); } catch (e) { }
  try { if (typeof dlg.showModal === "function") return dlg.showModal(o); } catch (e) { }
  try { dlg.setAttribute("open", ""); } catch (e2) { }
  return null;
}
let hslPickDlg = null;
function hslClosest(el, cls) {
  let n = el;
  for (let i = 0; n && i < 12; i++) {
    try { if (n.classList && n.classList.contains(cls)) return n; } catch (e) { }
    n = n.parentNode;
  }
  return null;
}
function hslPickClose() {
  const d = hslPickDlg; hslPickDlg = null;
  if (!d) return;
  try { if (typeof d.close === "function" && d.open) d.close(); } catch (e) { }
  try { if (d.parentNode) d.parentNode.removeChild(d); } catch (e) { }
}
function hslPick(sel, title) {
  if (!sel || !sel.options) return null;
  hslPickClose();
  const dlg = document.createElement("dialog"); dlg.className = "hnk-dlg hnk-pick"; dlg.id = "hnkPick";
  const body = document.createElement("div"); body.className = "hnk-dlg-body";
  const h = document.createElement("p"); h.className = "hnk-dlg-msg"; h.textContent = String(title || t("pick_title"));
  body.appendChild(h);
  const opts = Array.prototype.slice.call(sel.options);
  const rows = [];
  let q = null;
  if (opts.length > 8) {
    q = document.createElement("input"); q.type = "text"; q.className = "inp hnk-pick-q";
    q.setAttribute("placeholder", t("pick_search"));
    body.appendChild(q);
  }
  const list = document.createElement("div"); list.className = "hnk-pick-list";
  const none = document.createElement("div"); none.className = "hnk-pick-none hide"; none.textContent = t("pick_none");
  const choose = function (i) {
    try { sel.selectedIndex = i; } catch (e) { }
    try { if (sel.options[i]) sel.value = sel.options[i].value; } catch (e) { }
    hslPickClose();
    try { sel.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { }
    try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { }
  };
  opts.forEach(function (o, i) {
    const label = String(o.textContent || o.label || o.value || "");
    if (o.disabled) {
      const g = document.createElement("div"); g.className = "hnk-pick-grp";
      g.textContent = label.replace(/^\u2014\s*|\s*\u2014$/g, "");
      list.appendChild(g); rows.push({ el: g, grp: true, text: label.toLowerCase() });
      return;
    }
    const r = document.createElement("div"); r.className = "hnk-pick-row" + (i === sel.selectedIndex ? " on" : "");
    r.setAttribute("role", "button"); r.setAttribute("tabindex", "0"); r.setAttribute("data-i", String(i));
    r.textContent = label;
    r.addEventListener("click", function () { choose(i); });
    r.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(i); } });
    list.appendChild(r); rows.push({ el: r, grp: false, text: label.toLowerCase() });
  });
  list.appendChild(none);
  body.appendChild(list);
  if (q) {
    q.addEventListener("input", function () {
      const needle = String(q.value || "").trim().toLowerCase();
      let shown = 0, lastGrp = null;
      rows.forEach(function (r) {
        if (r.grp) { r.el.className = "hnk-pick-grp" + (needle ? " hide" : ""); lastGrp = r; return; }
        const hit = !needle || r.text.indexOf(needle) >= 0;
        r.el.className = "hnk-pick-row" + (r.el.getAttribute("data-i") === String(sel.selectedIndex) ? " on" : "") + (hit ? "" : " hide");
        if (hit) { shown++; if (lastGrp && needle) lastGrp.el.className = "hnk-pick-grp"; }
      });
      none.className = "hnk-pick-none" + (shown ? " hide" : "");
    });
  }
  const row = document.createElement("div"); row.className = "hnk-dlg-row";
  const no = document.createElement("div"); no.className = "btn"; no.setAttribute("role", "button"); no.setAttribute("tabindex", "0"); no.textContent = t("btn_cancel");
  no.addEventListener("click", function () { hslPickClose(); });
  row.appendChild(no); body.appendChild(row);
  dlg.appendChild(body);
  dlg.addEventListener("cancel", function () { hslPickClose(); });
  dlg.addEventListener("click", function (ev) { if (ev.target === dlg) hslPickClose(); });
  document.body.appendChild(dlg);
  hslPickDlg = dlg;
  /* the list's height is explicit too: rows are 38px, headers 26px, and the
     list stops at 380px and scrolls — a max-height the host cannot resolve
     from an unmeasured column is a column with no height at all */
  let nRows = 0, nGrp = 0;
  rows.forEach(function (r) { if (r.grp) nGrp++; else nRows++; });
  const listH = Math.min(380, nRows * 38 + nGrp * 26 + 2);
  list.style.height = listH + "px";
  hnkShowDialog(dlg, { title: h.textContent, width: 320, height: 118 + (q ? 46 : 0) + listH });
  try { if (q) q.focus(); } catch (e) { }
  return dlg;
}
function hslPickFor(btn) {
  const wrap = hslClosest(btn, "hsl");
  if (!wrap) return null;
  const sel = wrap.querySelector ? wrap.querySelector("select") : null;
  if (!sel) return null;
  const ctx = wrap.querySelector(".hsl-ctx");
  let title = ctx ? String(ctx.textContent || "").trim() : "";
  if (!title) { try { title = sel.getAttribute("aria-label") || sel.getAttribute("title") || ""; } catch (e) { title = ""; } }
  return hslPick(sel, title);
}
function bindHslPickers() {
  document.addEventListener("click", function (ev) {
    const t0 = ev.target || ev.srcElement;
    if (!t0) return;
    if (hslClosest(t0, "hnk-pick")) return;            /* a tap inside the list */
    const btn = hslClosest(t0, "hsl-btn");
    if (!btn) return;
    try { ev.preventDefault(); } catch (e) { }
    hslPickFor(btn);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const btn = hslClosest(ev.target, "hsl-btn");
    if (btn) { try { ev.preventDefault(); } catch (e) { } hslPickFor(btn); }
  });
  globalThis.HNK = globalThis.HNK || {};
  globalThis.HNK.hslPicker = {
    open: function (selOrId, title) { const sel = typeof selOrId === "string" ? $(selOrId) : selOrId; return hslPick(sel, title); },
    openFor: hslPickFor,
    close: hslPickClose,
    isOpen: function () { return !!hslPickDlg; },
    dialog: function () { return hslPickDlg; }
  };
}

function setupConfirm(msg) {
  return new Promise(function (resolve) {
    let done = false, dlg = null;
    const fin = function (v) {
      if (done) return;
      done = true;
      try { if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg); } catch (e) { }
      resolve(!!v);
    };
    try {
      dlg = document.createElement("dialog");
      dlg.className = "hnk-dlg";
      const body = document.createElement("div"); body.className = "hnk-dlg-body";
      const p = document.createElement("p"); p.className = "hnk-dlg-msg"; p.textContent = String(msg || "");
      const row = document.createElement("div"); row.className = "hnk-dlg-row";
      const no = document.createElement("div"); no.className = "btn"; no.setAttribute("role", "button"); no.setAttribute("tabindex", "0"); no.textContent = t("btn_cancel");
      const ok = document.createElement("div"); ok.className = "btn btn-gold"; ok.setAttribute("role", "button"); ok.setAttribute("tabindex", "0"); ok.textContent = "OK";
      no.addEventListener("click", function () { try { dlg.close("cancel"); } catch (e) { } fin(false); });
      ok.addEventListener("click", function () { try { dlg.close("ok"); } catch (e) { } fin(true); });
      row.appendChild(no); row.appendChild(ok);
      body.appendChild(p); body.appendChild(row);
      dlg.appendChild(body);
      dlg.addEventListener("close", function () { fin(dlg.returnValue === "ok"); });
      dlg.addEventListener("cancel", function () { fin(false); });
      document.body.appendChild(dlg);
      const r = hnkShowDialog(dlg, { title: "", width: 300, height: 170 });
      if (r && r.then) r.then(function (v) { fin(v === "ok"); }, function () { fin(false); });
    } catch (e) {
      try { if (typeof confirm === "function") { fin(confirm(String(msg || ""))); return; } } catch (e2) { }
      fin(false);
    }
  });
}
/* the app's wireKeyReveal: eye button flips a password field, aria-pressed follows */
function wireKeyReveal(btnId, inputId) {
  const b = $(btnId), k = $(inputId);
  if (!b || !k) return;
  const paint = function () {
    b.setAttribute("aria-pressed", k.type === "text" ? "true" : "false");
    if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", sl("btn_show"));
  };
  b.onclick = function () { k.type = (k.type === "password") ? "text" : "password"; paint(); };
  paint();
}
/* the app's accNum: Burmese digits in Burmese */
function accNum(n) {
  const s = String(n);
  if (state.lang !== "my") return s;
  const d = "၀၁၂၃၄၅၆၇၈၉";
  return s.replace(/[0-9]/g, function (c) { return d.charAt(+c); });
}
function accFmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(state.lang === "my" ? "my-MM" : state.lang, { year: "numeric", month: "short", day: "numeric" });
  } catch (e) { return String(iso || "").slice(0, 10); }
}

/* ---------------- RunningHub config (the app's hnk_rh_cfg) ---------------- */
function rhCfg() {
  if (!state.rhCfg || typeof state.rhCfg !== "object") state.rhCfg = { models: {}, activeModel: "" };
  if (!state.rhCfg.models || typeof state.rhCfg.models !== "object") state.rhCfg.models = {};
  if (typeof state.rhCfg.activeModel !== "string") state.rhCfg.activeModel = "";
  return state.rhCfg;
}
function rhSaveCfg(c) {
  state.rhCfg = c;
  if (c.activeModel && ffModelById(c.activeModel)) state.rhModel = c.activeModel;
  saveSettings();
  try { ffPaintModelBtn(); ffFillRatio(); ffPaintAdvanced(); } catch (e) { }
}
function rhDefaultModels() {
  try {
    const cfg = globalThis.HNK && globalThis.HNK.runninghubConfig;
    const d = cfg && cfg.defaults ? cfg.defaults() : null;
    return (d && d.models) ? d.models : {};
  } catch (e) { return {}; }
}
function rhModelDef(id) { return ffModelById(id); }
function rhDefaultApiPath(id) {
  const d = rhDefaultModels()[id];
  return (d && d.apiPath) ? String(d.apiPath) : "";
}
function rhEffectiveApiPath(id) {
  const mc = rhCfg().models[id];
  if (mc && mc.apiPath) return String(mc.apiPath);
  return rhDefaultApiPath(id);
}
function rhEffectiveQuality(id) {
  const mc = rhCfg().models[id];
  if (mc && typeof mc.quality === "string") return mc.quality;
  const d = rhDefaultModels()[id];
  return (d && typeof d.quality === "string") ? d.quality : "";
}
function rhIsConfigured(id) { return !!rhEffectiveApiPath(id); }
function rhAnyConfigured() {
  for (let i = 0; i < FREEFORM_MODELS.length; i++) if (rhIsConfigured(FREEFORM_MODELS[i].id)) return true;
  return false;
}
/* the adapter's configOverride: only the studio's own overrides, quality only when set */
function rhConfigOverride() {
  const out = { models: {} };
  const ms = rhCfg().models;
  for (const id in ms) {
    const mc = ms[id];
    if (!mc || !mc.apiPath) continue;
    const o = { apiPath: String(mc.apiPath) };
    if (mc.quality) o.quality = String(mc.quality);
    out.models[id] = o;
  }
  return out;
}
async function rhVerifyKey(k) {
  const adapter = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.runninghubAdapter) || null;
  const transport = rhTransport();
  if (!adapter || !transport || !adapter.verifyKey) throw new Error("HNKERR:err_generic:RunningHub engine failed to load - reload the panel");
  const res = await adapter.verifyKey({ transport: transport, apiKey: k, configOverride: rhConfigOverride() }, k);
  if (res && res.ok) return { ok: true };
  return { ok: false, code: res && res.error && res.error.code, status: res && res.error && res.error.status };
}
function rhFriendly(e) {
  const st = e && e.status;
  if (st === 401 || st === 403 || (e && e.code === "invalid-key")) return sl("rh_badkey");
  return sl("rh_err").replace("{S}", String(st || "?"));
}
/* v6.69.0 — WHY THE BALANCE COULD NOT BE READ.
   COST & BALANCE used to print one sentence and nothing else, and that
   sentence blamed a browser. In Photoshop there is no browser to blame, and
   the owner's 6.139.0 photograph has "Key works" in green two cards above:
   the SAME host answered the key check moments earlier. So the refusal now
   carries what RunningHub actually said — its HTTP status, its own code, its
   message — or, when nothing reached it at all, the transport's reason. The
   same discipline 6.68.0 gave "+ Layer": a refusal that cannot name a cause
   is a refusal nobody can fix. */
function rhWhy(e) {
  if (!e) return "";
  const bits = [];
  if (e.status) bits.push("HTTP " + e.status);
  const b = (e.body && typeof e.body === "object") ? e.body : null;
  let code = "";
  if (e.code !== undefined && e.code !== null && e.code !== "") code = e.code;
  else if (b && b.code !== undefined && b.code !== null && b.code !== "") code = b.code;
  if (code !== "") bits.push("code " + code);
  const msg = String(e.msg || (b && (b.msg || b.message)) || "").trim();
  if (msg) bits.push(msg.slice(0, 120));
  if (!bits.length) {
    const raw = String((e && e.message) || e);
    const hm = /^HNKERR:[a-z_]+:([\s\S]*)$/.exec(raw);
    bits.push(String(hm ? hm[1] : raw).slice(0, 120));
  }
  return bits.join(" \u00b7 ");
}

/* ---------------- RunningHub usage → spend ledger (the app's hnk_rh_spend) ---------------- */
function rhUnwrap(j) {
  if (!j || typeof j !== "object") return {};
  if (("code" in j) && j.data && typeof j.data === "object") return j.data;
  return j;
}
function rhNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function rhUsageOne(u) {
  if (!u || typeof u !== "object") return null;
  if (!("consumeMoney" in u) && !("consumeCoins" in u) && !("thirdPartyConsumeMoney" in u)) return null;
  return {
    money: rhNum(u.consumeMoney) + rhNum(u.thirdPartyConsumeMoney),
    coins: rhNum(u.consumeCoins),
    secs: rhNum(u.taskCostTime),
    has: true
  };
}
function rhUsageOf(j) {
  const d = rhUnwrap(j);
  const list = Array.isArray(d.taskUsageList) ? d.taskUsageList : [];
  const out = { money: 0, coins: 0, secs: 0, has: false, parts: 0 };
  const seen = {};
  for (let i = 0; i < list.length; i++) {
    const rec = list[i] || {};
    const id = String(rec.taskId || "");
    if (id && seen[id]) continue;
    if (id) seen[id] = 1;
    const u = rhUsageOne(rec);
    if (!u) continue;
    out.money += u.money; out.coins += u.coins; out.secs = Math.max(out.secs, u.secs);
    out.has = true; out.parts++;
  }
  const selfId = String(d.taskId || "");
  const own = rhUsageOne(d.usage);
  if (own && !(selfId && seen[selfId])) {
    out.money += own.money; out.coins += own.coins; out.secs = Math.max(out.secs, own.secs);
    out.has = true; out.parts++;
  }
  return out;
}
async function rhAccountStatus(apiKey) {
  const r = await hnkFetch("https://www.runninghub.ai/uc/openapi/accountStatus", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({ apiKey: apiKey })
  }, 25000);
  const j = await r.json().catch(function () { return null; });
  if (!r.ok) { const e = new Error("account-failed"); e.status = r.status; e.body = j; throw e; }
  if (j && ("code" in j) && Number(j.code) !== 0) {
    const e2 = new Error("account-rejected"); e2.code = j.code; e2.msg = j.msg || j.message; throw e2;
  }
  const d = rhUnwrap(j);
  if (d.currency) state.rhLastCur = String(d.currency);
  return {
    money: d.remainMoney != null ? rhNum(d.remainMoney) : null,
    coins: d.remainCoins != null ? rhNum(d.remainCoins) : null,
    currency: String(d.currency || ""),
    apiType: String(d.apiType || ""),
    running: rhNum(d.currentTaskCounts),
    ts: Date.now()
  };
}
async function rhQueueStatus(apiKey) {
  const r = await hnkFetch("https://www.runninghub.ai/openapi/v2/queue/status", {
    method: "GET",
    headers: { "Authorization": "Bearer " + apiKey }
  }, 25000);
  const j = await r.json().catch(function () { return null; });
  if (!r.ok) { const e = new Error("queue-failed"); e.status = r.status; e.body = j; throw e; }
  if (j && ("code" in j) && Number(j.code) !== 0) {
    const e2 = new Error("queue-rejected"); e2.code = j.code; e2.msg = j.msg || j.message; throw e2;
  }
  const d = rhUnwrap(j);
  return {
    keyType: String(d.apiKeyType || ""),
    limit: rhNum(d.concurrentLimit),
    running: rhNum(d.runningCount),
    queued: rhNum(d.queuedCount),
    total: rhNum(d.totalCurrentTasks)
  };
}
function spendLoad() {
  const o = (state.spend && typeof state.spend === "object") ? state.spend : {};
  return {
    rows: Array.isArray(o.rows) ? o.rows : [],
    old: (o.old && typeof o.old === "object") ? o.old : { n: 0, money: 0, coins: 0 },
    cur: String(o.cur || "")
  };
}
function spendSave(b) { state.spend = b; saveSettings(); }
function spendAdd(taskId, meta, u) {
  const b = spendLoad();
  const id = String(taskId || "");
  if (id) for (let i = 0; i < b.rows.length; i++) if (b.rows[i] && b.rows[i].id === id) return;
  b.rows.push({
    id: id, ts: Date.now(),
    k: (meta && meta.kind) || "image",
    m: String((meta && meta.label) || "").slice(0, 60),
    p: (meta && meta.prov) || "rh",
    money: u && u.has ? +(u.money.toFixed(6)) : 0,
    coins: u && u.has ? +(u.coins.toFixed(4)) : 0,
    secs: u ? Math.round(u.secs) : 0,
    has: u && u.has ? 1 : 0
  });
  if (u && u.has && !b.cur && state.rhLastCur) b.cur = state.rhLastCur;
  while (b.rows.length > 400) {
    const drop = b.rows.shift();
    b.old.n++; b.old.money += drop.money || 0; b.old.coins += drop.coins || 0;
  }
  spendSave(b);
  try { renderSpend(); } catch (e) { }
}
function spendRollup() {
  const b = spendLoad();
  const now = Date.now();
  const td = new Date(); td.setHours(0, 0, 0, 0); const todayStart = td.getTime();
  const md = new Date(); md.setDate(1); md.setHours(0, 0, 0, 0); const monthStart = md.getTime();
  const z = function () { return { n: 0, money: 0, coins: 0, secs: 0, unknown: 0 }; };
  const out = { today: z(), week: z(), month: z(), all: z(), byModel: {}, byProv: {}, rows: b.rows.slice().reverse(), cur: b.cur || state.rhLastCur };
  for (let i = 0; i < b.rows.length; i++) {
    const r = b.rows[i];
    const put = function (a) { a.n++; a.money += r.money || 0; a.coins += r.coins || 0; a.secs += r.secs || 0; if (!r.has) a.unknown++; };
    put(out.all);
    if (r.ts >= todayStart) put(out.today);
    if (r.ts >= now - 7 * 86400000) put(out.week);
    if (r.ts >= monthStart) put(out.month);
    const mk = r.m || "?";
    if (!out.byModel[mk]) out.byModel[mk] = z();
    put(out.byModel[mk]);
    const pk = r.p || "rh";
    if (!out.byProv[pk]) out.byProv[pk] = z();
    put(out.byProv[pk]);
  }
  out.all.n += b.old.n || 0; out.all.money += b.old.money || 0; out.all.coins += b.old.coins || 0;
  out.trimmed = b.old.n || 0;
  return out;
}
function spendClear() {
  spendSave({ rows: [], old: { n: 0, money: 0, coins: 0 }, cur: "" });
  try { renderSpend(); } catch (e) { }
}
function fmtMoney(v, cur) {
  const n = Number(v) || 0;
  let s;
  if (n === 0) s = "0";
  else if (n < 0.1) s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  else s = n.toFixed(2);
  return cur ? (s + " " + cur) : s;
}
/* a finished RunningHub task books its own cost; the status bar names it */
function rhBookSpend(taskId, meta, finalJson) {
  const u = rhUsageOf(finalJson);
  spendAdd(taskId, meta, u);
  if (!u.has) return;
  const cur = spendLoad().cur || state.rhLastCur || "";
  const bits = [];
  if (u.money > 0) bits.push(fmtMoney(u.money, cur));
  if (u.coins > 0) bits.push(Math.round(u.coins) + " RH");
  if (bits.length) setStatus(sl("cost_ran").replace("{C}", bits.join(" · ")), "ok");
}
/* the adapters hand back usage:[{taskId, final}] — one booking per task */
function rhBookUsage(usage, meta) {
  if (!Array.isArray(usage)) return;
  for (let i = 0; i < usage.length; i++) {
    const e = usage[i];
    if (!e) continue;
    try { rhBookSpend(e.taskId, meta, e.final); } catch (err) { }
  }
}

/* ---------------- COST & BALANCE (the app's cardMoney) ---------------- */
function balLoad() { return (state.rhBal && typeof state.rhBal === "object") ? state.rhBal : null; }
function balSave(b) { state.rhBal = b; saveSettings(); homeRefresh(); }
function agoText(ts) {
  if (!ts) return sl("money_never");
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return sl("job_age_now");
  if (m < 60) return sl("job_age_min").replace("{N}", String(m));
  return sl("job_age_hr").replace("{N}", String(Math.round(m / 60)));
}
function balText(b, big) {
  if (!b) return "—";
  const money = (b.money != null) ? fmtMoney(b.money, b.currency || "") : "";
  const coins = (b.coins != null) ? (Math.round(b.coins) + " RH") : "";
  if (big) return money || coins || "—";
  return [money, coins].filter(Boolean).join(" · ") || "—";
}
function renderSpendProv(r) {
  const host = $("moneyProv");
  if (!host) return;
  host.textContent = "";
  const keys = Object.keys(r.byProv);
  if (!keys.length) return;
  keys.sort(function (a, b) { return (a === "rh" ? -1 : 1) - (b === "rh" ? -1 : 1); });
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], a = r.byProv[k];
    const box = sEl("div", "acc-sub");
    box.appendChild(sEl("div", "subh", PROV_NAME[k] || k));
    const kv = sEl("div", "acc-kv");
    kv.appendChild(sEl("span", "k", sl("money_runs")));
    kv.appendChild(sEl("span", "v", String(a.n)));
    box.appendChild(kv);
    if (k === "rh") {
      const kv2 = sEl("div", "acc-kv");
      kv2.appendChild(sEl("span", "k", sl("money_all_short")));
      kv2.appendChild(sEl("span", "v", fmtMoney(a.money, r.cur)));
      box.appendChild(kv2);
    }
    if (a.unknown) box.appendChild(sEl("p", "mut", sl("money_unrep").replace("{N}", String(a.unknown))));
    host.appendChild(box);
  }
}
function renderSpend() {
  const r = spendRollup(), b = balLoad();
  setIcnText($("moneyH2"), "i-bolt", "gold", sl("money_h"));
  const intro = $("moneyIntro"); if (intro) intro.textContent = sl("money_intro");
  const bl = $("moneyBalL"); if (bl) bl.textContent = sl("money_bal");
  const tl = $("moneyTodayL"); if (tl) tl.textContent = sl("money_today");
  const ml = $("moneyMonthL"); if (ml) ml.textContent = sl("money_month");
  const bal = $("moneyBal"); if (bal) bal.textContent = balText(b, true);
  const today = $("moneyToday"); if (today) today.textContent = r.today.n ? fmtMoney(r.today.money, r.cur) : "—";
  const month = $("moneyMonth"); if (month) month.textContent = r.month.n ? fmtMoney(r.month.money, r.cur) : "—";
  const bR = $("btnMoneyRefresh"); if (bR) bR.textContent = sl("money_refresh");
  const bC = $("btnMoneyCsv"); if (bC) bC.textContent = sl("money_csv");
  const bX = $("btnMoneyClear"); if (bX) bX.textContent = sl("money_clear");
  setIcnText($("moneyRunsT"), "i-stack", "cream", sl("money_runs_t"));
  const meta = [];
  if (b && b.coins != null && b.money != null) meta.push(balText(b));
  meta.push(b ? sl("money_checked").replace("{T}", agoText(b.ts)) : sl("money_never"));
  if (b && b.queue) meta.push(sl("money_queue").replace("{R}", String(b.queue.running)).replace("{Q}", String(b.queue.queued)).replace("{L}", String(b.queue.limit || "—")));
  if (b && b.apiType) meta.push(b.apiType);
  meta.push(sl("money_all").replace("{N}", String(r.all.n)).replace("{C}", fmtMoney(r.all.money, r.cur)));
  if (r.trimmed) meta.push(sl("money_trim").replace("{N}", String(r.trimmed)));
  const mm = $("moneyMeta"); if (mm) mm.textContent = meta.join(" · ");
  renderSpendProv(r);
  const bm = $("moneyByModel");
  if (bm) {
    bm.textContent = "";
    const keys = Object.keys(r.byModel).sort(function (a, c) { return r.byModel[c].money - r.byModel[a].money; });
    if (keys.length) {
      bm.appendChild(sEl("div", "subh", sl("money_bymodel")));
      for (let i = 0; i < Math.min(8, keys.length); i++) {
        const a = r.byModel[keys[i]];
        const kv = sEl("div", "acc-kv");
        kv.appendChild(sEl("span", "k", keys[i]));
        kv.appendChild(sEl("span", "v", a.n + "× · " + fmtMoney(a.money, r.cur)));
        bm.appendChild(kv);
      }
    }
  }
  const runs = $("moneyRuns");
  if (!runs) return;
  runs.textContent = "";
  if (!r.rows.length) { runs.appendChild(sEl("p", "mut", sl("money_empty"))); return; }
  const SHOW = 20;
  const shown = r.rows.slice(0, SHOW);
  runs.appendChild(sEl("div", "subh", sl("money_recent").replace("{N}", String(shown.length))));
  const pad = function (n) { return (n < 10 ? "0" : "") + n; };
  for (let i = 0; i < shown.length; i++) {
    const row = shown[i];
    const d = new Date(row.ts);
    const kv = sEl("div", "acc-kv");
    kv.appendChild(sEl("span", "k", pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "  " + (row.m || "—")));
    let v;
    if (!row.has) v = sl("money_unknown");
    else v = [row.money > 0 ? fmtMoney(row.money, r.cur) : "", row.coins > 0 ? (Math.round(row.coins) + " RH") : ""].filter(Boolean).join(" · ") || sl("cost_free_any");
    kv.appendChild(sEl("span", "v", v));
    runs.appendChild(kv);
  }
  if (r.rows.length > SHOW) runs.appendChild(sEl("p", "mut", sl("money_more").replace("{N}", String(r.rows.length - SHOW))));
}
async function moneyRefresh() {
  const key = (state.rhKey || "").trim();
  if (!key) { stSet("stMoney", sl("money_nokey"), "err"); return false; }
  const btn = $("btnMoneyRefresh");
  btnOff(btn, true);
  stSet("stMoney", "");
  let ok = false;
  /* v6.69.0 — the queue is asked on its own, BEFORE the balance can end the
     attempt. It answers a different endpoint and it names the key's type,
     which is the first thing worth knowing when a balance read is refused:
     a key that cannot see an account balance is not a broken key. */
  let q = null, qWhy = "";
  try { q = await rhQueueStatus(key); } catch (e0) { q = null; qWhy = rhWhy(e0); }
  try {
    const a = await rhAccountStatus(key);
    balSave({ money: a.money, coins: a.coins, currency: a.currency, apiType: a.apiType, ts: a.ts, queue: q });
    ok = true;
  } catch (e) {
    const bits = [rhWhy(e)];
    if (q && q.keyType) bits.push("key " + q.keyType);
    else if (qWhy) bits.push("queue: " + qWhy);
    stSet("stMoney", sl("money_fail") + " \u00b7 " + bits.filter(Boolean).join(" \u00b7 "), "err");
  }
  btnOff(btn, false);
  renderSpend();
  return ok;
}
async function moneyCsv() {
  const r = spendRollup();
  const lines = ["when,model,kind,money,coins,seconds,reported,currency"];
  const rows = r.rows.slice().reverse();
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i];
    lines.push([new Date(x.ts).toISOString(), '"' + String(x.m || "").replace(/"/g, '""') + '"', x.k || "",
      x.money || 0, x.coins || 0, x.secs || 0, x.has ? "yes" : "no", r.cur || ""].join(","));
  }
  try {
    const f = await fsp.getFileForSaving("hnk-runninghub-spend.csv", { types: ["csv"] });
    if (!f) return;
    await f.write(lines.join("\n"), { format: formats.utf8 });
  } catch (e) { stSet("stMoney", friendlyErr(e), "err"); }
}

/* ---------------- ACCOUNT (the app's cardAccount) ---------------- */
function accCollapseGrp(id) {
  const g = $(id);
  if (!g) return;
  const hide = g.classList.contains("hide");
  g.className = "grp app-grp" + (hide ? " hide" : "");
  grpShow(g, false);
  const h = $(id + "H");
  if (h) h.setAttribute("aria-expanded", "false");
}
function accOpenGrp(id) {
  const g = $(id);
  if (!g || g.classList.contains("hide")) return;
  for (let i = 0; i < ACC_GRPS.length; i++) if (ACC_GRPS[i] !== id) accCollapseGrp(ACC_GRPS[i]);
  g.className = "grp app-grp open";
  const h = $(id + "H");
  if (h) h.setAttribute("aria-expanded", "true");
  grpShow(g, true);
  accOnGrpOpen(id);
}
function accOnGrpOpen(id) {
  if (id === "accGrpDev" && gateS.sess) accLoadDevices();
}
function accPlanLineText() {
  const p = gateS.prof;
  if (!p || p.plan_status !== "active") return sl("acc_plan_free").split(" — ")[0];
  const days = gateDaysLeft(p);
  if (days <= 0) return sl("acc_plan_expired").split(" — ")[0];
  return "Premium · " + accNum(days) + sl("days_short");
}
function accAvaRender() {
  const sess = gateS.sess;
  const a = sess ? (gateAvaOk(state.accAvatar) ? state.accAvatar : "") : "";
  const img = $("accAvaImg"), brand = $("accAvaBrand");
  if (img && brand) {
    if (a) { img.src = a; img.style.display = ""; brand.style.display = "none"; }
    else { clearSrc(img); img.style.display = "none"; brand.style.display = ""; }
  }
  const plus = $("accAvaPlus"); if (plus) plus.style.display = sess ? "" : "none";
  const drop = $("btnAvaDrop"); if (drop) drop.style.display = a ? "" : "none";
  const sub = $("awSub");
  if (sub) {
    if (sess) {
      const prof = gateS.prof || {};
      const nm = String((prof.name || prof.email || sess.email || state.accEmail) || "").split("@")[0] || "✦";
      sub.textContent = sl("aw_back").replace("{N}", nm);
    } else sub.textContent = sl("aw_sub");
  }
}
function unifiedCanDownload() {
  const data = gateS.entitlement;
  if (!data || typeof data !== "object") return false;
  const account = data.account || {};
  const license = data.license || {};
  const permissions = data.permissions || {};
  const devices = data.devices || {};
  const allowed = data.allowed;
  if (String(account.effective_status || account.status || "pending").toLowerCase() !== "active") return false;
  if (!(license.active === true || license.status === "active")) return false;
  if (permissions.ccx_download !== true) return false;
  if (!devices.computer) return false;
  if (allowed === false) return false;
  if (allowed && typeof allowed === "object" && allowed.ccx_download === false) return false;
  return true;
}
function accRenderPlan() {
  const p = gateS.prof;
  const sess = gateS.sess;
  const days = gateDaysLeft(p);
  const active = !!(p && p.plan_status === "active");
  const line = $("accPlanLine"), until = $("accPlanUntil"), pending = $("accPending"), off = $("accPlanOffline");
  if (pending) pending.style.display = "none";
  if (line) {
    line.className = "acc-plan-line";
    if (!active) {
      setIcnText(line, "i-key", "cream", sl("acc_plan_free"));
      if (until) until.textContent = "";
      if (pending && sess) { pending.textContent = sl("acc_pending"); pending.style.display = ""; }
    } else if (days === 0) {
      line.className = "acc-plan-line err";
      setIcnText(line, "i-warn", "err", sl("acc_plan_expired"));
      if (until) until.textContent = "";
    } else if (days <= 7) {
      line.className = "acc-plan-line gold";
      setIcnText(line, "i-warn", "hi", sl("acc_plan_soon").replace("{N}", accNum(days)));
      if (until) until.textContent = sl("acc_plan_until").replace("{D}", accFmtDate(p.plan_expires_at));
    } else {
      line.className = "acc-plan-line gold";
      setIcnText(line, "i-gem", "hi", sl("acc_plan_active").replace("{N}", accNum(days)));
      if (until) until.textContent = sl("acc_plan_until").replace("{D}", accFmtDate(p.plan_expires_at));
    }
  }
  if (off) {
    const showOff = !!sess && !!gateS.profOffline;
    off.textContent = sl("acc_offline");
    off.style.display = showOff ? "" : "none";
  }
  /* the app's unifiedRender repaints the download button from the fresh
     entitlement — the label quotes panel.latest_version once it has arrived */
  try { accPanelBtnLabel(); } catch (e) { }
}
function accRender() {
  const sess = gateS.sess;
  const inn = !!sess;
  const accIn = $("accIn"); if (accIn) accIn.style.display = inn ? "" : "none";
  const plan = $("accGrpPlan");
  if (plan) {
    const wasOpen = plan.classList.contains("open");
    plan.className = "grp app-grp" + (inn ? "" : " hide") + (inn && wasOpen ? " open" : "");
    grpShow(plan, inn && wasOpen);
    const h = $("accGrpPlanH"); if (h) h.setAttribute("aria-expanded", inn && wasOpen ? "true" : "false");
  }
  const pg = $("accGrpPanel");
  if (pg) {
    const showPanel = inn && unifiedCanDownload();
    const wasOpen = pg.classList.contains("open");
    pg.className = "grp app-grp" + (showPanel ? "" : " hide") + (showPanel && wasOpen ? " open" : "");
    grpShow(pg, showPanel && wasOpen);
    const h = $("accGrpPanelH"); if (h) h.setAttribute("aria-expanded", showPanel && wasOpen ? "true" : "false");
  }
  if (inn) {
    const p = gateS.prof || {};
    const n = $("accInfoName"); if (n) n.textContent = String(p.name || "");
    const e = $("accInfoEmail"); if (e) e.textContent = String(p.email || sess.email || state.accEmail || "");
    const s = $("accInfoSince"); if (s) s.textContent = p.created_at ? sl("acc_member_since").replace("{D}", accFmtDate(p.created_at)) : "";
  } else {
    stSet("stAva", "");
    stSet("stAccDev", "");
    const lim = $("devLimitTxt"); if (lim) lim.style.display = "none";
  }
  accAvaRender();
  accRenderPlan();
}
function accRenderDevices() {
  const host = $("devList");
  if (!host) return;
  host.textContent = "";
  const sess = gateS.sess;
  const prof = gateS.prof;
  const list = gateS.devices || [];
  const mx = prof ? prof.allowed_devices : null;
  const cntKnown = !!(sess && prof && prof.allowed_devices != null);
  const cnt = $("devCount");
  if (cnt) {
    cnt.textContent = cntKnown ? sl("dev_count").replace("{N}", accNum(list.length)).replace("{M}", accNum(mx)) : "";
    cnt.style.display = cntKnown ? "" : "none";
  }
  const empty = $("devEmpty");
  if (empty) { empty.textContent = sl("dev_none"); empty.style.display = list.length ? "none" : ""; }
  const me = sess ? (gateS.devId || state.accDevId) : null;
  for (let i = 0; i < list.length; i++) {
    const d = list[i] || {};
    const lbl = String(d.label || d.device_id || "");
    const li = document.createElement("li");
    const ic = document.createElement("span");
    ic.appendChild(ffIcon(/Android|iPhone|iPad/i.test(lbl) ? "i-phone" : "i-laptop", "cream"));
    li.appendChild(ic);
    const nm = sEl("span", "dv-lbl", lbl.slice(0, 40));
    nm.title = lbl;
    li.appendChild(nm);
    const isMe = me && d.device_id === me;
    li.appendChild(sEl("span", "dv-me", isMe ? sl("dev_this") : "Admin reset only"));
    host.appendChild(li);
  }
}
async function accLoadDevices() {
  const sess = gateS.sess;
  if (!sess || !sess.access || !sess.uid) return;
  try {
    const r = await gateReq("/rest/v1/devices?select=*&user_id=eq." + encodeURIComponent(sess.uid) + "&order=created_at.desc", { method: "GET" }, sess.access);
    if (!r.ok) { stSet("stDev", sl("acc_unreachable"), "err"); return; }
    const rows = await r.json().catch(function () { return null; });
    gateS.devices = Array.isArray(rows) ? rows : [];
    stSet("stDev", "");
    accRenderDevices();
  } catch (e) {
    stSet("stDev", sl("acc_offline"), "err");
  }
}
async function accChangePass() {
  const inp = $("accPassNew");
  const pw = inp ? String(inp.value || "") : "";
  if (pw.length < 6) { stSet("stAccPass", sl("acc_pass_short"), "err"); return; }
  const sess = gateS.sess;
  if (!sess || !sess.access) return;
  const btn = $("btnAccPass");
  btnOff(btn, true);
  try {
    const r = await gateReq("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: pw }) }, sess.access);
    const j = await r.json().catch(function () { return null; });
    if (!r.ok) throw new Error(gateResponseMessage(j, r.status));
    if (j && j.access_token) gateSaveSess(j);
    if (inp) inp.value = "";
    stSet("stAccPass", sl("acc_pass_changed"), "ok");
  } catch (e) {
    stSet("stAccPass", friendlyErr(e), "err");
  } finally {
    btnOff(btn, false);
  }
}
function accPanelBtnLabel() {
  const b = $("accPanelDownload");
  if (!b) return;
  const ent = gateS.entitlement || {};
  const v = (ent.panel && ent.panel.latest_version) || "";
  const label = sl("acc_panel_dl");
  setIcnText(b, "i-download", "ink", v ? label.replace("{V}", v) : label.replace(/\s*v\{V\}/, "").replace("{V}", ""));
}
function accApplyLang() {
  setIcnText($("accH2"), "i-key", "gold", sl("acc_h2"), "ic-h2");
  setIcnText($("accGrpAuthT"), "i-key", "cream", sl("acc_h2"));
  setIcnText($("accGrpPlanT"), "i-gem", "cream", sl("acc_plan_h"));
  setIcnText($("accGrpPanelT"), "i-palette", "cream", sl("acc_panel_h"));
  setIcnText($("accGrpDevT"), "i-phone", "cream", sl("dev_h"));
  const pw = $("accPassNew"); if (pw) pw.placeholder = sl("acc_pass_new");
  const sh = $("btnShowAccPassNew"); if (sh) sh.textContent = sl("btn_show");
  const ln = $("accLblName"); if (ln) ln.textContent = sl("acc_name");
  const le = $("accLblEmail"); if (le) le.textContent = sl("acc_email");
  const pk = $("btnAvaPick"); if (pk) pk.textContent = sl("ava_change");
  const dr = $("btnAvaDrop"); if (dr) dr.textContent = sl("ava_remove");
  const av = $("accAva"); if (av) av.setAttribute("aria-label", sl("ava_change"));
  accAvaRender();
  setIcnText($("btnAccLogout"), "i-close", "cream", sl("acc_btn_logout"));
  const ph = $("accPassH"); if (ph) ph.textContent = sl("acc_change_pass_h");
  setIcnText($("btnAccPass"), "i-check", "cream", sl("acc_change_pass_h"));
  const pp = $("accPanelP"); if (pp) pp.textContent = sl("acc_panel_p");
  accPanelBtnLabel();
  accRender();
  accRenderDevices();
}
function accWire() {
  wireKeyReveal("btnShowAccPassNew", "accPassNew");
  const lo = $("btnAccLogout"); if (lo) lo.addEventListener("click", function () { gateSignOut(); });
  const cp = $("btnAccPass"); if (cp) cp.addEventListener("click", function () { accChangePass(); });
  const pk = $("btnAvaPick"); if (pk) pk.addEventListener("click", function () { avaPick(); });
  const av = $("accAva"); if (av) av.addEventListener("click", function () { if (gateS.sess) avaPick(); });
  const dr = $("btnAvaDrop"); if (dr) dr.addEventListener("click", function () { avaDrop(); });
  const dl = $("accPanelDownload"); if (dl) dl.addEventListener("click", function () { panelGetUpdate(); });
  for (let i = 0; i < ACC_GRPS.length; i++) {
    (function (id) {
      const h = $(id + "H");
      if (!h) return;
      h.addEventListener("click", function () {
        const g = $(id);
        if (!g) return;
        if (g.classList.contains("open")) accCollapseGrp(id); else accOpenGrp(id);
      });
    })(ACC_GRPS[i]);
  }
}
function accBoot() {
  accCollapseGrp("accGrpPanel");
  accCollapseGrp("accGrpDev");
  const sess = gateS.sess || !!state.accRefresh;
  const auth = $("accGrpAuth");
  if (sess) accCollapseGrp("accGrpAuth");
  else if (auth) { auth.className = "grp app-grp open"; const h = $("accGrpAuthH"); if (h) h.setAttribute("aria-expanded", "true"); }
  if (!sess && auth) grpShow(auth, true);
  accRender();
  accRenderDevices();
  if (sess) {
    const plan = $("accGrpPlan");
    if (plan) { plan.className = "grp app-grp open"; const h = $("accGrpPlanH"); if (h) h.setAttribute("aria-expanded", "true"); }
    if (plan) grpShow(plan, true);
  }
}
function accAfterAuth() {
  if (_accSessSeen || !gateS.sess) return;
  _accSessSeen = true;
  accCollapseGrp("accGrpAuth");
  accOpenGrp("accGrpPlan");
}

/* ---------------- READINESS (the app's cardSetupStatus) ---------------- */
function setupJump(cardId) {
  const c = $(cardId);
  if (!c) return;
  try { if (c.scrollIntoView) c.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { }
}
function renderSetupStatus() {
  const h2 = $("setupStatusH2");
  if (h2) setIcnText(h2, "i-bolt", "gold", sl("ready_h"), "ic-h2");
  const host = $("setupStatusRows");
  if (!host) return;
  host.textContent = "";
  const sess = gateS.sess;
  const cfg = rhCfg();
  const am = (state.rhKey && cfg.activeModel) ? rhModelDef(cfg.activeModel) : null;
  const txt = function (id) { const e = $(id); return e ? String(e.textContent || "").replace(/^\s*/, "") : ""; };
  const rows = [
    ["RunningHub", !!(state.rhKey && rhAnyConfigured()), "cardRh", am ? am.label : ""],
    [sl("ready_acc"), !!sess, "cardAccount", (sess && gateS.prof) ? accPlanLineText() : "", sl("ready_out")],
    [txt("moneyH2"), null, "cardMoney"],
    [txt("dataH2"), null, "cardData"],
    [txt("aboutH2"), null, "cardAbout"]
  ];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const row = document.createElement("div");
    row.className = "acc-kv";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.style.width = "100%"; row.style.cursor = "pointer"; row.style.background = "none";
    row.style.border = "0"; row.style.font = "inherit"; row.style.textAlign = "left";
    row.appendChild(sEl("span", "k", r[0]));
    const v = sEl("span", "v");
    if (r[1] === null) { v.textContent = "›"; v.style.color = "#a8a394"; }
    else {
      v.textContent = (r[3] ? r[3] + " · " : "") + (r[1] ? sl("ready_ok") : (r[4] || sl("ready_no")));
      v.style.color = r[1] ? "#f4d488" : "#a8a394";
    }
    row.appendChild(v);
    (function (target) { row.addEventListener("click", function () { setupJump(target); }); })(r[2]);
    host.appendChild(row);
  }
}

/* ---------------- RUNNINGHUB ENTERPRISE (the app's cardRh) ---------------- */
function rhPaintModelBtn() {
  const sel = $("rhModelSel");
  if (!sel) return;
  const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
  const label = opt ? String(opt.textContent || "") : "";
  const v = $("rhModelVal"); if (v) v.textContent = label;
  const brand = ffModelBrand(label);
  const tile = $("rhModelTile"); if (tile) tile.className = "hsl-tile " + brand[0];
  const gl = $("rhModelGlyph"); if (gl) gl.src = "icons/ui/brand-" + brand[1] + ".png";
}
function rhPaintQualityBtn() {
  const sel = $("rhQuality");
  if (!sel) return;
  const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
  const label = opt ? String(opt.textContent || "").replace(/^quality:\s+/, "") : "";
  const v = $("rhQualityVal"); if (v) v.textContent = label;
}
function rhFillModelSel() {
  const sel = $("rhModelSel");
  if (!sel) return;
  const keep = sel.value || rhCfg().activeModel || state.rhModel || "";
  sel.textContent = "";
  for (let i = 0; i < FREEFORM_MODELS.length; i++) {
    const m = FREEFORM_MODELS[i];
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.label + (rhDefaultApiPath(m.id) ? " ✓" : "");
    sel.appendChild(o);
  }
  if (keep && ffModelById(keep)) sel.value = keep;
}
function rhLoadFormFor(id) {
  const ap = $("rhApiPath"); if (ap) ap.value = rhEffectiveApiPath(id);
  const q = $("rhQuality"); if (q) q.value = rhEffectiveQuality(id);
}
function rhRenderConfiguredList() {
  const host = $("rhConfiguredList");
  if (!host) return;
  const cfg = rhCfg();
  const configured = FREEFORM_MODELS.filter(function (m) { return rhIsConfigured(m.id); });
  if (!configured.length) { host.textContent = sl("rh_none"); return; }
  host.textContent = "";
  for (let i = 0; i < configured.length; i++) {
    const m = configured[i];
    const active = cfg.activeModel === m.id;
    const c = document.createElement("span");
    c.className = "chip" + (active ? " on" : "");
    if (active) { c.appendChild(ffIcon("i-star-fill", "ink")); c.appendChild(document.createTextNode(" " + m.label)); }
    else c.textContent = m.label;
    c.style.cursor = "pointer";
    c.title = sl("rh_chip_title");
    c.setAttribute("role", "button"); c.setAttribute("tabindex", "0");
    (function (id) {
      c.addEventListener("click", function () {
        const cc = rhCfg();
        cc.activeModel = id;
        rhSaveCfg(cc);
        rhRenderConfiguredList();
        renderSetupStatus();
      });
    })(m.id);
    host.appendChild(c);
  }
}
function rhApplyLang() {
  const tag = $("rhOptTag"); if (tag) tag.textContent = sl("rh_opt");
  const intro = $("rhIntro"); if (intro) intro.textContent = sl("rh_intro");
  const key = $("rhKey"); if (key) key.placeholder = sl("rh_key_ph");
  const sh = $("btnShowRhKey");
  if (sh) { sh.textContent = ""; sh.appendChild(ffIcon("i-eye", "cream")); sh.setAttribute("aria-label", sl("btn_show")); }
  const sv = $("btnSaveRhKey"); if (sv) sv.textContent = sl("rh_save_verify");
  const del = $("stRhKeyDel"); if (del) { del.textContent = sl("rh_remove"); del.style.display = state.rhKey ? "" : "none"; }
  setIcnText($("rhAdvT"), "i-gear", "cream", sl("rh_adv"));
  const note = $("rhSampleNote"); if (note) note.textContent = sl("rh_sample");
  const ap = $("rhApiPath"); if (ap) ap.placeholder = sl("rh_path_ph");
  const q = $("rhQuality");
  if (q && q.options && q.options.length >= 4) {
    q.options[0].textContent = sl("rh_q_none");
    q.options[1].textContent = sl("rh_q_low");
    q.options[2].textContent = sl("rh_q_medium");
    q.options[3].textContent = sl("rh_q_high");
  }
  const bs = $("btnRhSaveModel"); if (bs) bs.textContent = sl("rh_save_model");
  rhPaintModelBtn();
  rhPaintQualityBtn();
  rhRenderConfiguredList();
}
async function rhSaveKey() {
  const inp = $("rhKey"), btn = $("btnSaveRhKey");
  const k = inp ? String(inp.value || "").trim() : "";
  if (!k) { stSet("stRhKey", sl("rh_enter_key"), "err"); return; }
  if (btnIsOff(btn)) return;
  btnOff(btn, true);
  stSet("stRhKey", sl("rh_checking"), "");
  try {
    const res = await rhVerifyKey(k);
    if (res.ok) {
      state.rhKey = k;
      saveSettings();
      stSet("stRhKey", sl("rh_verified"), "ok");
    } else {
      stSet("stRhKey", rhFriendly(res), "err");
    }
  } catch (e) {
    stSet("stRhKey", sl("rh_neterr"), "err");
  }
  btnOff(btn, false);
  const del = $("stRhKeyDel"); if (del) del.style.display = state.rhKey ? "" : "none";
  renderSetupStatus();
  if (state.rhKey) moneyRefresh();
}
async function rhRemoveKey() {
  const ok = await setupConfirm(sl("rh_remove_confirm"));
  if (!ok) return;
  state.rhKey = "";
  saveSettings();
  const inp = $("rhKey"); if (inp) inp.value = "";
  stSet("stRhKey", "");
  const del = $("stRhKeyDel"); if (del) del.style.display = "none";
  renderSetupStatus();
}
function rhSaveModel() {
  const sel = $("rhModelSel");
  const id = sel ? sel.value : "";
  if (!id) return;
  const ap = $("rhApiPath");
  const apiPath = ap ? String(ap.value || "").trim().replace(/^\/+/, "").replace(/^openapi\/v2\//, "") : "";
  if (!apiPath) { stSet("stRhModel", sl("rh_ep_req"), "err"); return; }
  const c = rhCfg();
  const q = $("rhQuality");
  c.models[id] = { apiPath: apiPath, quality: q ? String(q.value || "") : "" };
  if (!c.activeModel) c.activeModel = id;
  rhSaveCfg(c);
  stSet("stRhModel", sl("rh_saved"), "ok");
  rhRenderConfiguredList();
  renderSetupStatus();
}

/* ---------------- DATA & BACKUP (the app's cardData) ---------------- */
/* v6.73.0 — accSeenUid/accSeenDev join the list for the reason the others are
   on it: a backup file is carried to another machine, and an authorization
   record that travelled with it would be an authorization record for a machine
   the server never saw. */
const BACKUP_SKIP = { accRefresh: 1, accUid: 1, accEmail: 1, accProfile: 1, accSeenAt: 1, accDevId: 1, accAvatar: 1,
  accSeenUid: 1, accSeenDev: 1 };
async function settingsFileText() {
  try {
    const folder = await fsp.getDataFolder();
    const f = await folder.getEntry(SETTINGS_FILE);
    if (!f) return "";
    return String(await f.read({ format: formats.utf8 }) || "");
  } catch (e) { return ""; }
}
/* the app's line is settings total · Gallery count · storage used; here the
   third figure is what the plugin's data folder holds (settings + kept files) */
async function refreshDataStore() {
  const el = $("dataStore");
  if (!el) return;
  const txt = await settingsFileText();
  const bytes = txt.length;
  const size = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  const files = (typeof GAL !== "undefined" && GAL && Array.isArray(GAL.files)) ? GAL.files : [];
  const line = sl("data_total") + ": " + size + " · Gallery: " + files.length + sl("data_photos");
  el.textContent = line;
  let used = bytes;
  for (let i = 0; i < files.length; i++) {
    try {
      const f = files[i];
      const m = (f && typeof f.getMetadata === "function") ? await f.getMetadata() : null;
      used += Number((m && m.size) || (f && f.size) || 0) || 0;
    } catch (e) { }
  }
  el.textContent = line + " · " + sl("data_store") + ": " + (used / 1048576).toFixed(1) + " MB";
}
function backupFilter(o) {
  const out = {};
  for (const k in o) { if (!BACKUP_SKIP[k]) out[k] = o[k]; }
  return out;
}
async function exportData() {
  try {
    const txt = await settingsFileText();
    let o = {};
    try { o = txt ? JSON.parse(txt) : {}; } catch (e) { o = {}; }
    if (!o || typeof o !== "object") o = {};
    const ts = new Date().toISOString();
    const data = {};
    data[SETTINGS_FILE] = JSON.stringify(backupFilter(o));
    const out = { hnk_backup: 1, app: "hnk-web-studio", ver: PANEL_VERSION, ts: ts, data: data };
    const f = await fsp.getFileForSaving("hnk-backup-" + ts.slice(0, 10) + ".json", { types: ["json"] });
    if (!f) return;
    await f.write(JSON.stringify(out), { format: formats.utf8 });
    stSet("stData", sl("data_exported"), "ok");
  } catch (e) { stSet("stData", friendlyErr(e), "err"); }
}
async function pickBackupFile() {
  try { return await fsp.getFileForOpening({ allowMultiple: false, types: ["json"] }); }
  catch (e) { return await pickAnyFile(); }
}
async function importData() {
  try {
    const f = await pickBackupFile();
    if (!f) return;
    const txt = await f.read({ format: formats.utf8 });
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j || j.hnk_backup !== 1 || !j.data || typeof j.data !== "object") { stSet("stData", sl("data_notbk"), "err"); return; }
    const keys = Object.keys(j.data).filter(function (k) { return typeof j.data[k] === "string"; });
    if (!keys.length) { stSet("stData", sl("data_nothing"), "err"); return; }
    const ok = await setupConfirm(sl("data_confirm").replace("{N}", String(keys.length)));
    if (!ok) return;
    let incoming = {};
    for (let i = 0; i < keys.length; i++) {
      try {
        const v = JSON.parse(j.data[keys[i]]);
        if (v && typeof v === "object") incoming = Object.assign(incoming, backupFilter(v));
      } catch (e) { }
    }
    const curTxt = await settingsFileText();
    let cur = {};
    try { cur = curTxt ? JSON.parse(curTxt) : {}; } catch (e) { cur = {}; }
    if (!cur || typeof cur !== "object") cur = {};
    const merged = Object.assign(cur, incoming);
    const folder = await fsp.getDataFolder();
    const out = await folder.createFile(SETTINGS_FILE, { overwrite: true });
    await out.write(JSON.stringify(merged), { format: formats.utf8 });
    await loadSettings();
    try { applyI18n(); } catch (e) { }
    try { bindSetupRefresh(); } catch (e) { }
    stSet("stData", t("st_saved"), "ok");
  } catch (e) { stSet("stData", friendlyErr(e), "err"); }
}

/* ---------------- APP & UPDATES (the app's cardAbout) ---------------- */
/* v6.48.0 — the version the last check found, "" while none is known. */
let _updLatest = "";

function renderAbout() {
  const v = $("aboutVer");
  if (v) v.textContent = "v" + PANEL_VERSION;
  if (_updLatest) stSet("stAbout", sl("about_new").replace("{V}", _updLatest), "ok");
}
async function aboutCheckUpdate() {
  const btn = $("btnCheckUpdate");
  if (btnIsOff(btn)) return;
  btnOff(btn, true);
  stSet("stAbout", sl("about_checking"), "");
  try {
    const r = await hnkFetch(PANEL_VERSION_URL, { cache: "no-store" }, 15000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j && j.v && panelVerNewer(String(j.v), PANEL_VERSION)) {
      _updLatest = String(j.v);
      stSet("stAbout", sl("about_new").replace("{V}", _updLatest), "ok");
    } else {
      stSet("stAbout", sl("about_uptodate").replace("{V}", PANEL_VERSION), "ok");
    }
  } catch (e) {
    stSet("stAbout", sl("st_key_noconn"), "err");
  } finally {
    btnOff(btn, false);
  }
}
async function aboutHardRefresh() {
  const ok = await setupConfirm(sl("about_cache_confirm"));
  if (!ok) return;
  _updChecked = false;
  try { checkPanelUpdate(document); } catch (e) { }
  try { if (typeof location !== "undefined" && location && typeof location.reload === "function") location.reload(); } catch (e) { }
}

/* v6.97.0 — THE WEB APP IS THE ONLY DOWNLOAD DOOR (owner decision). Up to
   6.96.0 this button asked the unified API for the file itself and, when the
   API refused the panel session, fell back to opening the web app. The API
   has issued the one-time, five-minute delivery to a signed-in WEB session
   only since v6.51.0 (server/lib/v1.js: "A web session is required"), so the
   first half of that ladder could never succeed and only made a second door
   to explain. Now the button IS the second half: it opens the web app on the
   account card's Panel group (the ?panel=download intent the website's old
   /download/ route also forwards to), where the studio signs in, the plan and
   the registered computer are checked and the temporary delivery is created —
   exactly as before, in the one place that does it. Nothing about the
   download rules changed: no new endpoint, no new permission. */
async function panelGetUpdate() {
  const btn = $("accPanelDownload");
  if (btnIsOff(btn)) return;
  btnOff(btn, true);
  try {
    stSet("stAcc", sl("upd_web"), "");
    await openUrl(APP_URL + "?panel=download");
  } catch (e) {
    stSet("stAcc", friendlyErr(e), "err");
  } finally {
    btnOff(btn, false);
  }
}

/* ---------------- SELF-TEST (v6.107.0) ----------------
   The panel reporting on itself, because nothing else could.

   6.106.0 in the owner's Photoshop: blank workflow card art, an empty video
   model picker, labels missing their text. The identical build driven in a
   browser with UXP's require/uxp/photoshop stubbed walks all fourteen pages
   with ZERO page errors, 188 video models, 37 video tools, 194 workflows and
   every picker face painted — so the failures live in the renderer and a
   browser cannot see them. Screenshots of a blank box carry no cause.

   These rows do. Everything below is read at the moment the card is drawn,
   from the running panel: which modules answered, how long each list is, what
   the renderer's own answers are to three probes, how the remote pictures
   actually went, and the first errors with their file and line. It is one
   photograph, and it is the difference between a fix and a guess. */
const ST_L = {
  h:      { my: "SELF-TEST", en: "SELF-TEST", shn: "SELF-TEST", kac: "SELF-TEST", th: "SELF-TEST", zh: "自检", vi: "SELF-TEST", id: "SELF-TEST", ms: "SELF-TEST" },
  note:   { my: "တစ်ခုခု မှားနေရင် ဒီ card ကို ဓာတ်ပုံရိုက်ပြီး ပို့ပါ — ဘာကျန်နေလဲ ချက်ချင်းသိရမယ်", en: "If something looks wrong, photograph this card and send it — it names what is missing", shn: "သင်ႇသင်ႇၽိတ်းၸိုင် ထၢႆႇၶႅပ်း card ၼႆႉသေ သူင်ႇမႃး", kac: "Shut ai lam nga yang ndai card hpe sumla la nna jaw u", th: "ถ้ามีอะไรผิดปกติ ถ่ายรูปการ์ดนี้แล้วส่งมา", zh: "如果哪里不对，拍下这张卡片发来", vi: "Nếu có gì sai, chụp thẻ này và gửi đi", id: "Jika ada yang salah, foto kartu ini dan kirimkan", ms: "Jika ada yang tidak kena, ambil gambar kad ini dan hantar" },
  run:    { my: "ပြန်စစ်မယ်", en: "Run again", shn: "ၵူတ်ႇထတ်းထႅင်ႈ", kac: "Bai yu u", th: "ตรวจอีกครั้ง", zh: "重新检查", vi: "Kiểm tra lại", id: "Periksa lagi", ms: "Semak semula" },
  copy:   { my: "စာသား ကူးမယ်", en: "Copy as text", shn: "ၶူတ်ႉပဵၼ်တူဝ်လိၵ်ႈ", kac: "Laika hku kaw u", th: "คัดลอกเป็นข้อความ", zh: "复制为文本", vi: "Sao chép dạng văn bản", id: "Salin sebagai teks", ms: "Salin sebagai teks" },
  copied: { my: "ကူးပြီးပါပြီ — chat ထဲ paste လုပ်ပြီး ပို့လိုက်ပါ", en: "Copied — paste it into chat", shn: "ၶူတ်ႉယဝ်ႉ", kac: "Kaw sai", th: "คัดลอกแล้ว", zh: "已复制", vi: "Đã sao chép", id: "Tersalin", ms: "Disalin" },
  copyErr:{ my: "ကူး၍မရပါ — ဓာတ်ပုံရိုက်ပြီး ပို့ပါ", en: "Couldn't copy — send a photo instead", shn: "ၶူတ်ႉဢမ်ႇလႆႈ", kac: "N mai kaw ai", th: "คัดลอกไม่ได้", zh: "无法复制", vi: "Không sao chép được", id: "Tidak dapat menyalin", ms: "Tidak dapat menyalin" },
  legend: { my: "~ = ဒီ renderer က မတိုင်းနိုင်တာ (UXP ကန့်သတ်ချက်) — ပြဿနာ မဟုတ်ပါ။ ! = ကြည့်ရမယ့်အရာ", en: "~ = this renderer cannot measure it (a UXP limit) — not a fault. ! = needs a look", shn: "~ = renderer ၼႆႉတႅၵ်ႈဢမ်ႇလႆႈ (UXP) — ဢမ်ႇၸႂ်ႈၽိတ်း။ ! = လူဝ်ႇတူၺ်း", kac: "~ = ndai renderer n hkyen lu ai (UXP) — shut ai n re. ! = yu ra ai", th: "~ = เรนเดอเรอร์นี้วัดไม่ได้ (ข้อจำกัด UXP) — ไม่ใช่ข้อผิดพลาด ! = ต้องดู", zh: "~ = 此渲染器无法测量（UXP 限制）— 不是故障。! = 需要查看", vi: "~ = renderer này không đo được (giới hạn UXP) — không phải lỗi. ! = cần xem", id: "~ = renderer ini tidak bisa mengukurnya (batas UXP) — bukan kesalahan. ! = perlu dilihat", ms: "~ = renderer ini tidak dapat mengukurnya (had UXP) — bukan kesilapan. ! = perlu dilihat" },
  clean:  { my: "အားလုံး ကောင်းပါတယ်", en: "Everything answered", shn: "ၶဝ်ႈၸႂ်တင်းမူတ်း", kac: "Yawng hkrak ai", th: "ทุกอย่างปกติ", zh: "一切正常", vi: "Mọi thứ đều ổn", id: "Semua baik", ms: "Semua baik" }
};
/* every row: [label, value, level]. Absent or zero where something is expected
   is what makes a row red — the card is useless if it flatters the panel. */
function selfTestRows() {
  try { return selfTestRowsInner(); }
  catch (e) {
    /* v6.107.1 — the card is a DIAGNOSTIC. It reads a dozen things the panel
       may or may not have, on a renderer this code cannot test, and 6.107.0
       shipped it as a bare call inside setupApplyStatics — which is on the
       boot path. If any one of those reads threw, the panel died before the
       sign-in card was ever painted, and the student saw a form with no
       labels and a button that did nothing. A tool for finding faults must
       not be able to cause one. */
    return [{ label: "Panel", detail: "v" + PANEL_VERSION, level: "ok" },
      { label: "Self-test", detail: (e && e.message) || "failed", level: "err" }];
  }
}
function selfTestRowsInner() {
  const H = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK : {};
  const rows = [];
  const lvl = function (ok) { return ok ? "ok" : "err"; };
  const count = function (v) {
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  };

  rows.push({ label: "Panel", detail: "v" + PANEL_VERSION, level: "ok" });
  /* v6.74.0 — THE LICENCE ROW. 6.73.0 gave the panel a six-hour cold-boot
     grace, and the one photograph that can prove it is this card with the
     line dead — which is the photograph the owner takes. So the card says
     which of the three states the gate is in, from the same fields the gate
     itself decides on: a live lease and how long it has, the grace and how
     long IT has, or locked. The grace is "!" on purpose: the panel is open
     on a remembered answer, and that is worth a look. */
  try {
    let lic = "", licLvl = "warn";
    if (!gateS.sess) { lic = "signed out"; }
    else if (gateLeaseValid()) {
      lic = "live lease · " + Math.max(0, Math.round((gateS.leaseExp - Date.now()) / 1000)) + "s left";
      licLvl = "ok";
    } else if (gateS.graceOpen) {
      const ms = gateGraceLeft(), hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000);
      lic = "offline · last verdict · " + hh + "h " + mm + "m left";
    } else { lic = "locked"; }
    rows.push({ label: "Licence", detail: lic, level: licLvl });
  } catch (eLic) { rows.push({ label: "Licence", detail: String(eLic).slice(0, 80), level: "err" }); }
  /* the host's own version — the acceptance record needs exactly this and it
     has been one message away for weeks */
  /* v6.107.1 — uxp.host, not app.version. The owner's first SELF-TEST photograph
     read "Photoshop  win32": app.version came back empty and only os.platform()
     survived, so the one number the acceptance record has been waiting weeks for
     was still missing from the card built to fetch it. UXP publishes the host it
     is running inside as require("uxp").host = { name, version, uiLocale };
     app.version stays as the fallback, and the platform is appended either way. */
  let host = "";
  try {
    const h = uxp && uxp.host;
    if (h && h.version) host = String(h.name || "Photoshop") + " " + String(h.version);
  } catch (e) { host = ""; }
  if (!host) { try { host = String((app && app.version) || ""); } catch (e) { host = ""; } }
  try {
    const osm = require("os");
    if (osm && typeof osm.platform === "function") host += (host ? " · " : "") + osm.platform();
  } catch (e) { }
  rows.push({ label: "Photoshop", detail: host || "—", level: /\d/.test(host) ? "ok" : "warn" });

  /* --- what this renderer does, measured, not assumed --- */
  const st = H.selfTest || null;
  const caps = st && typeof st.capabilities === "function" ? st.capabilities() : {};
  rows.push({ label: "optgroup", detail: caps.optgroup === undefined ? "—" : (caps.optgroup ? "flattens" : "NOT read"),
    level: caps.optgroup === undefined ? "pend" : (caps.optgroup ? "ok" : "warn") });
  /* v6.107.1 — -1 is the catch branch: the probe could not run at all, which is
     a DIFFERENT answer from "one box per glyph" and the card said the wrong one.
     The owner's Photoshop reports -1, so Range.getClientRects is simply not
     available there — which is exactly why fitBtnIn must not trust it. */
  rows.push({ label: "line boxes", detail: caps.rangeRects === undefined ? "—" :
    (caps.rangeRects < 0 ? "unavailable"
      : caps.rangeLineBoxes ? "yes (" + caps.rangeRects + ")" : "per glyph (" + caps.rangeRects + ")"),
    level: caps.rangeRects === undefined ? "pend" : caps.rangeRects < 0 ? "host" : (caps.rangeLineBoxes ? "ok" : "warn") });
  /* v6.63.0 — the PNG is the one that matters now: every icon in the panel is
     one. The SVG row stays beside it because the pair is the whole story of
     this wave, and because "svg no · png yes" is what the fix looks like. */
  rows.push({ label: "icon (png)", detail: caps.iconPng || "—",
    level: caps.iconPng === "yes" ? "ok" : (caps.iconPng === "no" ? "err" : "pend") });
  rows.push({ label: "SVG in img", detail: caps.svgImg || "—",
    level: caps.svgImg === "yes" ? "ok" : (caps.svgImg === "no" ? "warn" : "pend") });
  /* v6.132.0 — THE BLACK ICONS, ASKED AS A PICTURE.
     259 of the panel's 276 icons are drawn with STROKE on fill="none"; the
     other 17 (the brand marks) are drawn with FILL. If this renderer honours
     fill and ignores stroke it paints the stroke-only ones as their default
     fill — black — which is exactly what the owner photographed, and would
     leave the brand marks correct. One of each, at the size the panel uses
     them, settles it in one photograph. */
  /* v6.63.0 — THIS ROW IS THE PROOF, AND IT IS NOW THE FIX TOO. On 6.133.0 it
     showed a stroke-drawn SVG and a fill-drawn SVG side by side and Photoshop
     drew the first as a solid black house. Both pictures are PNGs now, so on
     this build the house must come back as a thin grey outline. If it is still
     black, the raster path is not the answer either and the next wave learns
     that from one photograph instead of five. */
  rows.push({ label: "stroke vs fill", level: "pend",
    icons: ["icons/ui/i-home-muted.png", "icons/ui/i-star-fill-gold.png"],
    detail: "\u2190 outline \u00b7 fill \u2192 (both png)" });
  /* v6.132.0 — can a picker be set at all? Twenty <select> carry the model,
     language, ratio, count and size pickers. */
  rows.push({ label: "select set", detail: caps.selectSet || "—",
    level: caps.selectSet === "yes" ? "ok" : (caps.selectSet === "no" ? "err" : "pend") });
  /* v6.132.0 — DOES A TAP ARRIVE? Wiring says every handler bound; the owner
     says nothing responds. This counts clicks at the document in the capture
     phase, so it sees them before any handler could. Tap five things, then
     read this row: a count means the events arrive and the fault is in the
     handler or the widget; a zero means they never arrive at all. */
  try {
    const tp = (st && typeof st.taps === "function") ? st.taps() : null;
    rows.push({ label: "Taps", detail: tp ? (tp.count + (tp.last ? " \u00b7 " + tp.last : "")) : "—",
      level: tp && tp.count > 0 ? "ok" : "pend" });
  } catch (eT) { rows.push({ label: "Taps", detail: String(eT), level: "err" }); }
  /* v6.77.0 — THE THREE QUESTIONS BEHIND THE CONTROLS THAT DID NOTHING.
     Storage: is the Web Storage the lifted code writes to real, shimmed onto
     the settings folder, or missing. Pointer: does a pointer event carry
     offsetX/offsetY (the only way left to put a brush stroke on a picture in
     a renderer with no geometry). Viewport: does window.innerWidth read, the
     one width the pointer fallback divides by. */
  try {
    const lsI = globalThis.HNK && globalThis.HNK.localStore;
    rows.push({ label: "Storage",
      detail: !lsI ? "\u2014" : (lsI.shimmed
        ? ("settings-folder shim (" + lsI.backend + ") \u00b7 " + lsI.keys() + " keys \u00b7 native " + (lsI.nativeOk ? "yes" : "no") + (lsI.installed ? "" : " \u00b7 NOT INSTALLED"))
        : "native localStorage"),
      level: !lsI ? "pend" : (lsI.installed ? "ok" : "err") });
    const tp2 = (st && typeof st.taps === "function") ? st.taps() : null;
    rows.push({ label: "Pointer",
      detail: (tp2 && tp2.offset) ? (tp2.offset + (tp2.offsetOf ? " \u00b7 " + tp2.offsetOf : "")) : "tap anything, then Run again",
      level: (tp2 && tp2.offset) ? (tp2.offset === "no offsetX" ? "host" : "ok") : "pend" });
    const vw = (typeof window !== "undefined" && window.innerWidth) || 0, vh = (typeof window !== "undefined" && window.innerHeight) || 0;
    rows.push({ label: "Viewport", detail: vw + "\u00d7" + vh + " (innerWidth)", level: vw > 0 ? "ok" : "host" });
    /* v6.79.0 — innerWidth read 0 on the owner's 9th photograph, and every
       width fallback the Imagine brush and sliders had was built on it. Five
       other rulers, each printed: whichever answers is the one to build on. */
    const wp = hnkWidthProbes();
    rows.push({ label: "width probes", detail: wp.detail, level: wp.best > 0 ? "ok" : "host" });
    /* v6.80.0 — RunningHub and its file storage, each reached or not (see hnkNetProbeStart) */
    rows.push(hnkNetProbeRow());
    /* v6.84.0 — the Active-layer read every image slot uses, on the open document (see hnkLayerProbeStart) */
    rows.push(hnkLayerProbeRow());
    /* 6.165.0 — the folder every finished take is written to: found, written, read back (see hnkSaveProbeStart) */
    rows.push(hnkSaveProbeRow());
    /* 6.166.0 — drag & drop: bound targets, the last file that arrived, or the refusal */
    rows.push(hnkDropRow());
    /* 6.171.0 — the place every result ends in, run for real on a 2×2 picture and undone
       (see hnkPlaceProbeStart). It sits AFTER Drag & drop, not between it and Save folder:
       verify_convenience_695 A7 pins those two as neighbours, and that ordering is the
       contract, not an accident. */
    rows.push(hnkPlaceProbeRow());
    /* v6.86.0 — whether <video> decodes here at all. Photoshop's does not,
       which is why every video page shows numbered tiles and Download /
       Open Direct Link / Open the folder instead of a player (6.77.0). */
    rows.push({ label: "Video player",
      detail: VIDEO_OK ? "plays MP4 inline" : "no inline player \u2014 Download / Open Direct Link / Open the folder play the clip",
      level: VIDEO_OK ? "ok" : "host" });
    /* the student scrolled down to press Run: a positive reading here means
       scroll positions reach script (page-restore, the jump chips) */
    const pgS = $("pages");
    rows.push({ label: "scrollTop", detail: pgS ? String(pgS.scrollTop) : "\u2014", level: (pgS && pgS.scrollTop > 0) ? "ok" : "pend" });
  } catch (eS) { rows.push({ label: "Storage", detail: String(eS), level: "err" }); }
  /* v6.132.0 — the Photoshop side, read straight rather than inferred from a
     failed action. "No document/layer selected" is the panel's own refusal;
     these two rows say whether it was right. */
  try {
    const dcc = (typeof app !== "undefined" && app) ? app.activeDocument : null;
    rows.push({ label: "Document", detail: dcc ? (String(dcc.name || "?") + " \u00b7 " + dcc.width + "\u00d7" + dcc.height) : "none",
      level: dcc ? "ok" : "warn" });
    let ln = null;
    try { ln = dcc ? dcc.activeLayers : null; } catch (eL) { ln = null; }
    rows.push({ label: "Active layer",
      detail: !dcc ? "\u2014" : (ln && ln.length ? (ln.length + " \u00b7 " + String(ln[0].name || "?")) : "none selected"),
      level: (ln && ln.length) ? "ok" : "warn" });
  } catch (eD) {
    rows.push({ label: "Document", detail: String(eD).slice(0, 90), level: "err" });
  }
  /* v6.132.0 — "the panel is far too long" is a measurement */
  if (caps.viewW) {
    rows.push({ label: "Panel size", detail: caps.viewW + "\u00d7" + caps.viewH + " \u00b7 content " + caps.docH,
      level: (caps.docH && caps.viewH && caps.docH > caps.viewH * 6) ? "warn" : "ok" });
  }

  /* --- v6.62.0: the stylesheet's four assumptions, measured in the renderer.
     styles.css calls itself UXP-SAFE and names what UXP cannot do; the audit
     behind this wave found it breaking its own list forty-five times. The
     list is now obeyed AND enforced by test/verify_panel_uxp_safe.js, so a
     "NO" on any row below no longer costs the panel anything -- it is here
     because the one rule this wave did not convert (object-fit, nine thumbs
     across Gallery, Path, the wizard and Video Tools) should be converted on
     a measurement rather than on a third round of belief. --- */
  /* v6.66.0 — every one of the four geometry rows came back "unmeasurable" on
     6.136.0, which is this panel's honest word for an all-zero rect and not a
     fact about the box. Three of those questions never needed geometry:
     box-sizing, position and gap are COMPUTED values, resolved by the cascade
     before layout, and getComputedStyle hands them over. So each row now
     carries both answers — what was measured, and what the cascade computed —
     and neither can be mistaken for the other. */
  const cssRow = function (label, val, good, computed) {
    const measured = val === undefined ? "\u2014" : String(val);
    const gotIt = val !== undefined && val === good;
    const useC = !gotIt && computed && computed !== "?" && computed !== "";
    rows.push({ label: label,
      detail: useC ? (measured + "  \u00b7  computed " + computed) : measured,
      /* v6.74.0 — "unmeasurable" is the host declining to answer, not a wrong
         answer; a measured value that is simply not the good one stays "!" */
      level: val === undefined ? "pend" : gotIt ? "ok" : (val === "unmeasurable" ? "host" : "warn") });
  };
  cssRow("box-sizing", caps.cssBox, "border-box", caps.cssBoxC);
  cssRow("flex gap", caps.cssGap, "yes", caps.cssGapC);
  cssRow("calc()", caps.cssCalc, "yes", caps.cssCalcC);
  cssRow("position:fixed", caps.cssFixed, "yes", caps.cssFixedC);
  cssRow("object-fit", caps.cssObjectFit, "kept");
  cssRow("background-size", caps.cssBgSize, "kept");
  /* the bake-off: one 100px box, five rulers. The row that shows a 100 names
     the instrument this renderer actually answers on. */
  if (caps.rulers) {
    /* v6.66.1 — the 100px in that row is not a measurement. calc() came back
       as its own unresolved text, so getComputedStyle is echoing what was set
       rather than reporting what was drawn. Say so on the row itself. */
    /* v6.74.0 — four rulers all at zero is "no ruler here", the settled
       answer; a ruler that reads SOMETHING other than 100 is still "!" */
    const zeroRulers = (String(caps.rulers).match(/\b(rect|client|scroll|offset) 0\b/g) || []).length === 4;
    rows.push({ label: "rulers (100px box)", detail: String(caps.rulers),
      level: zeroRulers ? "host" : "warn" });
    if (caps.cssEcho) {
      rows.push({ label: "\u21b3 computed is", detail: String(caps.cssEcho),
        level: caps.cssEcho === "resolved" ? "ok" : (/^echo/.test(String(caps.cssEcho)) ? "host" : "warn") });
    }
  }
  /* v6.66.1 — do the pages still carry the classes 300-odd rules hang off? */
  if (caps.scopeOk) {
    rows.push({ label: "page scope", level: caps.scopeOk === "yes" ? "ok" : "warn",
      detail: caps.scopeOk === "yes" ? ("yes \u00b7 " + (caps.scopeAttr || ""))
        : (String(caps.scopeOk) + " \u00b7 attr " + (caps.scopeAttr || "?")
           + " \u00b7 prop " + (caps.scopeProp || "?")) });
  }

  /* --- v6.64.0: THE BLACK SQUARES, MEASURED AND THEN DRAWN.

     The owner photographed black rounded boxes in UI text on Retouch A,
     Retouch B, Path and Recipes — and, in the same photographs, → ← and ✓
     drawn correctly. A box like that is .notdef, the glyph a font shows for
     a character it does not have, so the question is which characters this
     renderer is missing, and the answer is a number: every missing
     character has .notdef's advance width, and U+E0FF (private use, mapped
     by nothing) supplies that width to compare against.

     Two rows, because a measurement nobody can check is another belief:
       · glyphs      — the verdict, as hex codepoints, always ASCII-safe
       · symbols 1-3 — the characters themselves, drawn large. Whatever is
                       a box in the photograph must appear in the list above
                       it, and if it does not, the ruler is what is wrong. */
  const gMiss = caps.glyphMiss;
  rows.push({ label: "glyphs",
    detail: gMiss === undefined ? "—"
      : (gMiss === "none" ? "all " + (caps.glyphList ? caps.glyphList.length : "") + " present"
        : (gMiss === "unmeasurable" || gMiss === "indistinguishable" || gMiss === "?") ? gMiss
          : (caps.glyphN || "") + " missing: " + gMiss),
    level: gMiss === undefined ? "pend" : gMiss === "none" ? "ok"
      : (gMiss === "unmeasurable" || gMiss === "indistinguishable") ? "host" : "warn" });
  /* v6.75.0 — "notdef -1 · n -1" is the ruler with no reading, the host's
     silence again; it wore a ✓ on the owner's card. Only a measured width is ok. */
  if (caps.glyphRef) rows.push({ label: "glyph ruler", detail: caps.glyphRef,
    level: /(^|\s)-1(\s|$)/.test(String(caps.glyphRef)) ? "host" : "ok" });
  /* v6.66.0 — three cells, four times the size: the guaranteed .notdef first,
     then the two the strip kept printing as a coloured square.
     v6.66.1 — AND IT ANSWERED. Cell 1 draws an empty outlined box; cells 2
     and 3 draw a white arrow and white circular arrows on a blue plate. They
     are nothing alike. Both glyphs are PRESENT, and calling them .notdef from
     the 15px strip was my mistake. The row stays as the panel's one working
     glyph instrument — no ruler needed, just a control beside the question. */
  if (caps.glyphTrio && caps.glyphTrio.length === 3) {
    rows.push({ label: "notdef / 27A1 / 1F504", level: "pend", big: true,
      chars: caps.glyphTrio,
      detail: "cell 1 is the control \u2014 nothing maps E0FF. 6.137.0: cells 2 and 3 DRAW." });
  }
  const glist = caps.glyphList || [];
  for (let gi = 0, part = 1; gi < glist.length; gi += 12, part++) {
    const chunk = glist.slice(gi, gi + 12);
    rows.push({ label: "symbols " + part, level: "pend",
      chars: chunk,
      detail: chunk.map(function (c) { return c.codePointAt(0).toString(16).toUpperCase(); }).join(" ") });
  }

  /* --- the lists the pages are built from --- */
  const V = H.runninghubVideo || null;
  const nVid = V ? V.models().length : 0;
  const nTool = V ? V.tools().length : 0;
  const nTalk = (V && V.talkModels) ? V.talkModels().length : 0;
  const nWf = (H.workflowRegistry && typeof H.workflowRegistry.list === "function") ? H.workflowRegistry.list().length : 0;
  const nT2i = count(H.t2iModels);
  const nLib = (H.LIB_WF && H.LIB_WF.items) ? H.LIB_WF.items.length : 0;
  rows.push({ label: "Video model",   detail: String(nVid),  level: lvl(nVid > 0) });
  rows.push({ label: "Video tool",    detail: String(nTool), level: lvl(nTool > 0) });
  rows.push({ label: "Talk model",    detail: String(nTalk), level: lvl(nTalk > 0) });
  rows.push({ label: "Smart Workflow", detail: String(nWf),  level: lvl(nWf > 0) });
  rows.push({ label: "Text→Img",      detail: String(nT2i),  level: lvl(nT2i > 0) });
  rows.push({ label: "Library",       detail: String(nLib),  level: lvl(nLib > 0) });

  /* --- the pictures, which is where 6.106.0 went wrong --- */
  const ra = H.remoteArt || null;
  if (ra) {
    const s = ra.stats();
    rows.push({ label: "Pictures", detail: s.ok + " ok · " + s.failed + " failed · " + s.pending + " waiting",
      level: s.failed > 0 ? "warn" : (s.ok > 0 ? "ok" : "pend") });
    if (s.lastError) rows.push({ label: "Last picture", detail: s.lastError, level: "err" });
  } else {
    rows.push({ label: "Pictures", detail: "loader absent", level: "err" });
  }

  /* --- v6.107.1: what the panel WIRED, and what it caught ---
     The owner's second photograph: Media Lab ▸ Video with its labels unpainted,
     its shelf empty and its three picker faces blank — under a card that said
     "Errors: none". Both were true. The card heard only UNCAUGHT errors; the
     panel's own safe() had caught the throw, logged it and moved on, and the
     four pages bound after it were simply never bound. Nothing safe() catches
     is invisible any more: the stage, the message and the line. */
  const wnames = Object.keys(WIRED);
  const wfail = wnames.filter(function (k) { return WIRED[k] !== "ok"; });
  rows.push({ label: "Wiring", detail: (wnames.length - wfail.length) + " ok · " + wfail.length + " failed",
    level: wfail.length ? "err" : (wnames.length ? "ok" : "pend") });
  for (let i = 0; i < wfail.length && i < 6; i++)
    rows.push({ label: "✗ " + wfail[i], detail: String(WIRED[wfail[i]]).slice(0, 120), level: "err" });

  /* the page the owner photographed, as the DOM holds it right now: the
     picker's option count, whether its face carries a name, how many shelf
     cards were built. A data count of 188 says nothing about any of these. */
  const vm = $("vidModel"), vface = $("vidModelVal"), vshelf = $("vidWfRow");
  const vOpts = (vm && vm.options) ? vm.options.length : 0;
  const vFace = vface ? String(vface.textContent || "").trim() : "";
  const vCards = vshelf ? vshelf.children.length : 0;
  rows.push({ label: "Video page", detail: vOpts + " opt · face " + (vFace && vFace !== "—" ? "✓" : "—") + " · " + vCards + " cards",
    level: (vOpts > 0 && vFace && vFace !== "—" && vCards > 0) ? "ok" : "err" });

  /* labels that only JavaScript writes, one per page that has gone blank on
     a real Photoshop: each must carry text once the panel has booted */
  const MUST = [["vidWfIntro", "Video"], ["btnTkGen", "Talk"], ["btnCheckUpdate", "Setup"], ["galDl", "Gallery"], ["btnPtRun", "Path"]];
  const blank = [];
  for (let i = 0; i < MUST.length; i++) {
    const el = $(MUST[i][0]);
    if (el && !String(el.textContent || "").trim()) blank.push(MUST[i][1] + " #" + MUST[i][0]);
  }
  rows.push({ label: "Labels", detail: blank.length ? blank.join(", ") : MUST.length + "/" + MUST.length + " ✓", level: blank.length ? "err" : "ok" });

  /* --- and anything that threw --- */
  const errs = st && typeof st.errors === "function" ? st.errors() : [];
  /* v6.75.0 — the collector keeps twelve and COUNTS the rest: "Errors 12" on
     the owner's card was the cap, not the number. */
  const errTotal = (st && typeof st.errorCount === "function") ? st.errorCount() : errs.length;
  rows.push({ label: "Errors",
    detail: errTotal ? (String(errTotal) + (errTotal > errs.length ? " · " + errs.length + " kept" : "")) : ff9(ST_L.clean),
    level: errTotal ? "err" : "ok" });
  for (let i = 0; i < errs.length && i < 6; i++) {
    const e = errs[i];
    /* an event with no file still has a line and a kind — say both rather than "error" twice */
    const where = e.file ? (e.file + (e.line ? ":" + e.line : "")) : (e.line ? e.kind + " · line " + e.line : e.kind);
    rows.push({ label: where, detail: e.message + (e.count > 1 ? " ×" + e.count : ""), level: "err" });
  }
  /* the panel's own log, ERR and WARN only, the wire-fail lines left out
     because the Wiring rows above already carry them with their stage name */
  const bad = [];
  for (let i = 0; i < HNK_LOG.length; i++) {
    const e = HNK_LOG[i];
    if ((e.level === "ERR" || e.level === "WARN") && String(e.msg).indexOf("wire-fail:") !== 0) bad.push(e);
  }
  rows.push({ label: "Panel log", detail: bad.length ? bad.length + " · " + HNK_LOG.length : ff9(ST_L.clean), level: bad.length ? "warn" : "ok" });
  for (let i = 0; i < bad.length && i < 6; i++)
    rows.push({ label: bad[i].level + " " + bad[i].ts, detail: String(bad[i].msg).slice(0, 120), level: bad[i].level === "ERR" ? "err" : "warn" });
  return rows;
}
function renderSelfTest() {
  try { renderSelfTestInner(); } catch (e) { try { hwarn("selftest:", e); } catch (e2) { } }
}
function renderSelfTestInner() {
  const h = $("selfTestH2");
  if (h) {
    /* the heading keeps its gold icon; only the words are replaced */
    while (h.childNodes.length > 1) h.removeChild(h.lastChild);
    h.appendChild(document.createTextNode(ff9(ST_L.h)));
  }
  const note = $("selfTestNote"); if (note) note.textContent = ff9(ST_L.note);
  /* v6.74.0 — the legend for the two marks a photograph has to tell apart */
  const legend = $("selfTestLegend"); if (legend) legend.textContent = ff9(ST_L.legend);
  setIcnText($("btnSelfTest"), "i-retry", "cream", ff9(ST_L.run));
  setIcnText($("btnSelfTestCopy"), "i-doc", "cream", ff9(ST_L.copy));
  renderRows("selfTestRows", selfTestRows());
}
function selfTestText() {
  const rows = selfTestRows();
  const out = ["HNK panel self-test"];
  for (let i = 0; i < rows.length; i++) out.push(rows[i].label + ": " + rows[i].detail);
  return out.join("\n");
}
async function selfTestCopy() {
  const txt = selfTestText();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt);
    else if (navigator.clipboard && navigator.clipboard.setContent) await navigator.clipboard.setContent({ "text/plain": txt });
    else throw new Error("no clipboard");
    stSet("stSelfTest", ff9(ST_L.copied), "ok");
  } catch (e) {
    stSet("stSelfTest", ff9(ST_L.copyErr), "err");
  }
}

/* ---------------- PLATFORMS · SHARE · ABOUT statics ---------------- */
function setupApplyStatics() {
  try { renderPrefsP(); } catch (e) { }   /* 6.166.0 — SETTINGS card */
  const platH2 = $("platH2"); if (platH2) platH2.textContent = sl("plat_h2");
  const p1 = $("platP1"); if (p1) p1.textContent = sl("plat_p1");
  const p2 = $("platP2"); if (p2) p2.textContent = sl("plat_p2");
  const p3 = $("platP3"); if (p3) p3.textContent = sl("plat_p3");
  const p4 = $("platP4"); if (p4) p4.textContent = sl("plat_p4");
  setIcnText($("platPS"), "i-palette", "cream", sl("plat_ps"));
  const site = $("siteLink"); if (site) site.textContent = sl("site_link");
  const sh2 = $("shareH2"); if (sh2) sh2.textContent = sl("share_h2");
  const sp = $("shareP"); if (sp) sp.textContent = sl("share_p");
  setIcnText($("btnShare"), "i-external", "cream", sl("share_btn"));
  setIcnText($("btnCopyLink"), "i-link", "cream", sl("copy_btn"));
  setIcnText($("aboutH2"), "i-bell", "gold", sl("about_h"), "ic-h2");
  setIcnText($("btnCheckUpdate"), "i-bell", "ink", sl("about_check"));
  setIcnText($("btnHardRefresh"), "i-restore", "cream", sl("about_cache"));
  const pr = $("aboutPrivacy"); if (pr) pr.textContent = sl("about_privacy");
  const tm = $("aboutTerms"); if (tm) tm.textContent = sl("about_terms");
  const ch = $("aboutContactH"); if (ch) ch.textContent = sl("about_contact");
  /* v6.107.1 — GUARDED AT THE CALL SITE TOO. setupApplyStatics runs from
     bindSetupRefresh on the boot path, so anything that throws here takes the
     rest of the panel's startup with it. Read fresh on every repaint (a stale
     self-test is worse than none), but never at the cost of the panel. */
  try { renderSelfTest(); } catch (e) { try { hwarn("selftest:", e); } catch (e2) { } }
  setIcnText($("dataH2"), "i-stack", "gold", sl("data_h"), "ic-h2");
  setIcnText($("btnExportData"), "i-download", "cream", sl("data_export"));
  setIcnText($("btnImportData"), "i-restore", "cream", sl("data_import"));
}
async function shareCopy() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(APP_URL);
    else if (navigator.clipboard && navigator.clipboard.setContent) await navigator.clipboard.setContent({ "text/plain": APP_URL });
    else throw new Error("no clipboard");
    stSet("stShare", sl("st_share_copied"), "ok");
  } catch (e) {
    stSet("stShare", APP_URL, "ok");
  }
}
/* a plain open/close group header (Advanced, Runs, the platform groups) */
function wireStaticGrp(grpId, hdrId) {
  const g = $(grpId), h = $(hdrId || (grpId + "H"));
  if (!g || !h) return;
  h.addEventListener("click", function () {
    const open = g.classList.contains("open");
    g.className = "grp app-grp" + (open ? "" : " open");
    h.setAttribute("aria-expanded", open ? "false" : "true");
    grpShow(g, !open);
  });
}
/* everything a language switch or a settings reload must repaint */
/* v6.107.1 — each repaint stands alone (see bindDiag): the card that cannot
   paint is the only card that stays unpainted, and the self-test names it. */
function bindSetupRefresh() {
  safe("setup:account-lang", accApplyLang);
  const key = $("rhKey"); if (key && key.value !== (state.rhKey || "")) key.value = state.rhKey || "";
  safe("setup:rh-models", rhFillModelSel);
  safe("setup:rh-lang", rhApplyLang);
  safe("setup:spend", renderSpend);
  safe("setup:statics", setupApplyStatics);
  safe("setup:about", renderAbout);
  safe("setup:readiness", renderSetupStatus);
  safe("setup:datastore", function () { refreshDataStore(); });
}
function bindSetup() {
  /* account */
  safe("setup:account", function () { accWire(); accBoot(); });
  /* RunningHub key + endpoints */
  safe("setup:runninghub", function () {
    const key = $("rhKey"); if (key) key.value = state.rhKey || "";
    wireKeyReveal("btnShowRhKey", "rhKey");
    const sv = $("btnSaveRhKey"); if (sv) sv.addEventListener("click", function () { rhSaveKey(); });
    if (key) key.addEventListener("keydown", function (e) { if (e && e.key === "Enter") rhSaveKey(); });
    const del = $("stRhKeyDel"); if (del) del.addEventListener("click", function () { rhRemoveKey(); });
    rhFillModelSel();
    const sel = $("rhModelSel");
    if (sel) {
      rhLoadFormFor(sel.value);
      sel.addEventListener("change", function () { rhLoadFormFor(sel.value); rhPaintModelBtn(); });
    }
    const q = $("rhQuality"); if (q) q.addEventListener("change", function () { rhPaintQualityBtn(); });
    const bs = $("btnRhSaveModel"); if (bs) bs.addEventListener("click", function () { rhSaveModel(); });
    wireStaticGrp("rhGrpAdvanced", "rhAdvH");
  });
  /* cost & balance */
  safe("setup:money", function () {
    const bR = $("btnMoneyRefresh"); if (bR) bR.addEventListener("click", function () { moneyRefresh(); });
    const bC = $("btnMoneyCsv"); if (bC) bC.addEventListener("click", function () { moneyCsv(); });
    const bX = $("btnMoneyClear");
    if (bX) bX.addEventListener("click", async function () {
      const ok = await setupConfirm(sl("money_clear") + "?");
      if (!ok) return;
      spendClear();
      stSet("stMoney", sl("money_cleared"), "ok");
    });
    wireStaticGrp("moneyGrpRuns", "moneyRunsH");
  });
  /* data & backup */
  safe("setup:data", function () {
    const ex = $("btnExportData"); if (ex) ex.addEventListener("click", function () { exportData(); });
    const im = $("btnImportData"); if (im) im.addEventListener("click", function () { importData(); });
  });
  /* 6.166.0 — text size S · M · L */
  safe("setup:prefs", function () {
    [["prefsTsizeS", "s"], ["prefsTsizeM", "m"], ["prefsTsizeL2", "l"]].forEach(function (r) {
      const b = $(r[0]); if (b) ffPressable(b, function () { tsizeSetP(r[1]); });
    });
  });
  /* platforms · share · about */
  safe("setup:about-wire", function () {
    wireStaticGrp("platGrpAndroid"); wireStaticGrp("platGrpIos"); wireStaticGrp("platGrpDesktop"); wireStaticGrp("platGrpPs");
    const site = $("siteLink"); if (site) site.addEventListener("click", function () { openUrl("https://hnkaistudio.com/"); });
    const shr = $("btnShare"); if (shr) shr.addEventListener("click", function () { shareCopy(); });
    const cpy = $("btnCopyLink"); if (cpy) cpy.addEventListener("click", function () { shareCopy(); });
    const cu = $("btnCheckUpdate"); if (cu) cu.addEventListener("click", function () { aboutCheckUpdate(); });
    const hr = $("btnHardRefresh"); if (hr) hr.addEventListener("click", function () { aboutHardRefresh(); });
    const stb = $("btnSelfTest"); if (stb) stb.addEventListener("click", function () { try { hnkNetProbeStart(true); } catch (eN) { } try { hnkSaveProbeStart(true); } catch (eSv) { } try { hnkLayerProbeStart(true); } catch (eL) { } try { hnkPlaceProbeStart(true); } catch (eP) { } renderSelfTest(); });
    const stc = $("btnSelfTestCopy"); if (stc) stc.addEventListener("click", function () { selfTestCopy(); });
    const about = $("cardAbout");
    if (about) {
      const links = about.querySelectorAll("[data-href]");
      for (let i = 0; i < links.length; i++) {
        (function (el) {
          el.addEventListener("click", function () { openUrl(el.getAttribute("data-href")); });
        })(links[i]);
      }
    }
  });
  /* first paint + the language-switch repaint */
  bindSetupRefresh();
  REFRESHERS.push(function () { try { bindSetupRefresh(); } catch (e) { } });
  /* the app's boot balance check: at most once an hour, only with a key */
  setTimeout(function () {
    try {
      if (!state.rhKey) return;
      const b = balLoad();
      if (b && Date.now() - (b.ts || 0) < 3600000) return;
      moneyRefresh();
    } catch (e) { }
  }, 2600);
}


/* ============================================================
   PATH — the web app's BATCH LOOKS page, in Photoshop (v6.54.0)

   The panel used to answer "batch" with a five-button runner of its own
   design: pick files, pick a workflow from a <select>, pick a folder, Run.
   The web app answers it with a studio page — twelve looks on a rail, a
   strength dial, a speed/quality tier, an Effects accordion whose every
   control is stamped "AI", and a prompt preview that shows, before a single
   call is spent, exactly what a hundred photos are about to be asked. A
   student who learned the batch on the web found none of that here.

   This is that page. The looks, the effects, the tiers, the nine-language
   copy and the prompt composition are LIFTED from the running app into
   js/hnk_path_looks.js (tools/build_panel_path_looks.js; pinned by
   test/verify_panel_path_looks.js), so a look renamed on the web is renamed
   here, and ptBuildPrompt below composes the app's own sentences in the
   app's own order.

   Three deliberate differences, each because Photoshop is not a browser:
     · photos arrive through UXP's multi-file dialog, not a file input, and
       the free CSS preview is not painted over a thumbnail — UXP's renderer
       does not honour a filter on an <img>, so a promise of "this is what
       the grade looks like" would be a lie. The thumbnail shows the photo.
     · Studio mode sends the Studio prompt but cannot pre-bake the local
       grade: stApplyRecipeTo draws on a <canvas>, and UXP has none.
     · the app's SAVE card offers ZIP / numbered download / contact sheet.
       A plugin writes files, so it offers the folder they are written to.
   ============================================================ */
const PTD = (globalThis.HNK && globalThis.HNK.pathLooks) || null;
const PT_MAX = (PTD && PTD.max) || 100;
const PT_SRC_STUDIO = "@studio";
const PT = { photos: [], out: null, busy: false, stop: false, ref: null, seq: 0 };
const ptMulti = { on: false, ids: {} };

/* the lifted copy, in whichever of the nine languages is showing */
function ptT(k) { return (PTD && PTD.tr[k]) ? ff9(PTD.tr[k]) : ""; }
function ptI(k) { return (PTD && PTD.inline[k]) ? ff9(PTD.inline[k]) : ""; }
function ptS(k) { return (PTD && PTD.src[k]) ? ff9(PTD.src[k]) : ""; }
function ptLooks() { return (PTD && PTD.looks) || []; }
function ptLookById(id) {
  const L = ptLooks();
  for (let i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
  return L[0] || null;
}
function ptDef() { return (PTD && PTD.def) || { look: "", tier: "fast", strength: 100, fx: {}, custom: "", wf: "" }; }
function ptState() {
  if (!state.pt) {
    const d = ptDef();
    state.pt = { look: d.look, tier: d.tier, strength: d.strength, custom: d.custom, wf: d.wf,
      fx: { blur: d.fx.blur, fg: d.fx.fg, sync: d.fx.sync, proLight: d.fx.proLight, frame: d.fx.frame } };
  }
  if (!state.pt.fx) state.pt.fx = { blur: "off", fg: "off", sync: false, proLight: true, frame: "off" };
  return state.pt;
}
function ptLookOf(photo) {
  const id = (photo && photo.lookOverride) || ptState().look;
  return ptLookById(id) || ptLookById(ptDef().look);
}

/* ---- which of the three sources the batch is pointed at ----
   One field carries all three, exactly as the app's does: "" is a look,
   "@studio" is the Retouch A/Retouch B suite as it stands, anything else is
   a Smart Workflow id resolved against the LIVE registry — so a saved id for
   a card that no longer exists degrades to look mode instead of sending an
   empty prompt to a hundred photos. */
function ptWfActive() {
  const id = ptState().wf;
  if (!id || id === PT_SRC_STUDIO) return null;
  let reg = null;
  try { reg = globalThis.HNK && globalThis.HNK.workflowRegistry; } catch (e) { }
  const wf = (reg && reg.get) ? reg.get(id) : null;
  if (!wf) return null;
  const req = wf.requiredInputs || [], opt = wf.optionalInputs || [];
  return { id: wf.id, title: wf.title || wf.id, cardImg: wf.visual || "",
    sum: wf.cardSummary || wf.summary || "", reqN: req.length, opt: opt, def: wf };
}
function ptSrcMode() {
  if (ptState().wf === PT_SRC_STUDIO) return "studio";
  return ptWfActive() ? "wf" : "look";
}
function ptSetWorkflow(id) {
  if (PT.busy) { setStatus(ff9(PT_BUSY_L), "err"); return false; }
  ptState().wf = id || "";
  if (id) PT.photos.forEach(function (p) { p.lookOverride = null; });
  ptSync();
  return true;
}
/* the two labels the app has no place for: a browser downloads results, a
   plugin writes them, so the studio has to be able to say where. Same
   sentence the VidUp page uses for the same control. */
const PT_OUT_L = { my: "သိမ်းမယ့် folder ရွေးရန်", en: "Choose the save folder", shn: "လိူၵ်ႈ folder တႃႇသိမ်း", kac: "Makoi na folder lata u", th: "เลือกโฟลเดอร์ที่จะบันทึก", zh: "选择保存文件夹", vi: "Chọn thư mục lưu", id: "Pilih folder simpan", ms: "Pilih folder simpan" };
const PT_SAVEALL_L = { my: "ရလဒ်အားလုံး folder ထဲ သိမ်းမယ်", en: "Save every result to the folder", shn: "သိမ်းၽွၼ်းလႆႈတင်းသဵင်ႈ တီႈ folder", kac: "Ngut ai yawng hpe folder kaw makoi u", th: "บันทึกผลลัพธ์ทั้งหมดลงโฟลเดอร์", zh: "把所有结果保存到文件夹", vi: "Lưu mọi kết quả vào thư mục", id: "Simpan semua hasil ke folder", ms: "Simpan semua hasil ke folder" };
const PT_BUSY_L = { my: "Batch လုပ်နေဆဲပါ — ရပ်ပြီးမှ source ပြောင်းပါ", en: "A batch is running — stop it before changing the source", shn: "Batch ႁဵတ်းယူႇ — ၵိုတ်းသေ လႅၵ်ႈ source", kac: "Batch shakut nga ai — jahkring nna galai u", th: "กำลังรันชุดอยู่ — หยุดก่อนเปลี่ยนแหล่ง", zh: "批处理进行中 — 请先停止再更换来源", vi: "Đang chạy lô — hãy dừng trước khi đổi nguồn", id: "Batch sedang berjalan — hentikan sebelum mengganti sumber", ms: "Kumpulan sedang berjalan — hentikan sebelum menukar sumber" };
/* a finished photo is finished FOR THE SOURCE THAT MADE IT — re-pointing the
   album leaves the results downloadable and only re-queues what the NEW
   source has not produced */
function ptSrcKey() {
  const m = ptSrcMode();
  return m === "wf" ? ("wf:" + (ptState().wf || "")) : m;
}
function ptPending() {
  const k = ptSrcKey();
  return PT.photos.filter(function (p) { return p.status !== "done" || p.doneSrc !== k; });
}

/* The Studio half of the batch. state.st is the SAME object the suite writes
   (main.js owns it; js/hnk_studio_suites.js edits it through studioHost), so
   these read what the Retouch A / Retouch B page is set to right now.
   ptStudioLocal is the app's question — "is there a local grade to carry?" —
   answered against the base keys the panel persists. The app also BAKES that
   grade onto every photo before the prompt goes out; stApplyRecipeTo draws on
   a <canvas> and UXP has none, so the panel sends the untouched photo with
   the Studio prompt and says so here rather than pretending otherwise. */
function ptStudioPend() { return (state.st && state.st.pend) ? state.st.pend : []; }
function ptStudioLocal() {
  const A = (globalThis.HNK && globalThis.HNK.studioScreen && globalThis.HNK.studioScreen.api()) || null;
  if (!A || !state.st || !state.st.t1 || !state.st.t2) return false;
  try {
    const d1 = A.stDefT1(), d2 = A.stDefT2();
    for (const k in d1) if ((state.st.t1[k] || 0) !== d1[k]) return true;
    for (const k in d2) { if (k === "finish") continue; if ((state.st.t2[k] || 0) !== 0) return true; }
    if (state.st.t2.finish && state.st.t2.finishV) return true;
    if (A.stPipeVals && A.stPipeDirty) return !!A.stPipeDirty();
  } catch (e) { }
  return false;
}

/* ---- the app's look strength: one dial scales the whole grade ---- */
function ptStrength() { const s = +(ptState().strength || 100); return (s >= 25 && s <= 150) ? s : 100; }
function ptStrengthWord() {
  const s = ptStrength();
  return s <= 60 ? "apply the look subtly, at reduced intensity"
    : s < 90 ? "apply the look gently, below full strength"
      : s <= 110 ? "apply the look at its natural strength"
        : "apply the look boldly, pushed past its natural strength";
}
/* the app's ptBuildPrompt, sentence for sentence — whatever this returns is
   exactly what #ptPromptPreview shows and exactly what a photo sends */
function ptBuildPrompt(photo) {
  if (!PTD) return "";
  const mode = ptSrcMode(), pt = ptState();
  if (mode === "studio") {
    const S = (globalThis.HNK && globalThis.HNK.studioScreen) || null;
    let sp = "";
    try { sp = (S && S.prompt) ? (S.prompt() || "") : ""; } catch (e) { sp = ""; }
    const scu = (pt.custom || "").trim();
    if (!sp) return scu;
    return scu ? (sp + "\n\n" + scu) : sp;
  }
  const wf = ptWfActive();
  if (wf) {
    let base = "";
    try {
      const reg = globalThis.HNK && globalThis.HNK.workflowRegistry;
      const c = (reg && reg.compile) ? reg.compile(wf.def, {}) : null;
      base = (c && (c.prompt || c.text)) || wf.def.hiddenPrompt || "";
    } catch (e) { base = wf.def.hiddenPrompt || ""; }
    const wcu = (pt.custom || "").trim();
    return wcu ? (base + "\n\n" + wcu) : base;
  }
  const look = ptLookOf(photo), fx = pt.fx, F = PTD.fx, out = [];
  if (!look) return "";
  out.push("Professional batch wedding-photo relight/regrade of IMAGE 1 — apply the '" + look.name.en + "' look.");
  out.push(look.ai);
  if (ptStrength() !== 100) out.push("Strength " + ptStrength() + "% — " + ptStrengthWord() + ".");
  if (fx.blur !== "off") out.push(ptFrag(F.blur, fx.blur));
  if (fx.fg !== "off") out.push(ptFrag(F.fg, fx.fg));
  if (fx.frame !== "off") out.push(ptFrag(F.frame, fx.frame));
  if (fx.sync) out.push(F.sync.frag);
  if (fx.proLight) out.push(F.proLight.frag);
  if (PT.ref) out.push(PTD.refFrag);
  const cu = (pt.custom || "").trim();
  if (cu) out.push(cu);
  out.push(PTD.preserve);
  return out.filter(function (x) { return !!x; }).join("\n\n");
}
function ptFrag(fx, v) {
  if (!fx) return "";
  for (let i = 0; i < fx.opts.length; i++) if (fx.opts[i].v === v) return fx.opts[i].frag || "";
  return "";
}

/* ---- counts / the run button's own arithmetic ---- */
function ptCounts() {
  const c = { total: PT.photos.length, done: 0, error: 0, queued: 0, running: 0 };
  PT.photos.forEach(function (p) { c[p.status] = (c[p.status] || 0) + 1; });
  return c;
}
function ptRenderCount() {
  const c = ptCounts(), bits = [ptT("pt_n").replace("{N}", String(c.total))];
  if (c.done) bits.push(ptT("pt_done_n").replace("{N}", String(c.done)));
  if (c.error) bits.push(ptT("pt_err_n").replace("{N}", String(c.error)));
  const cnt = $("ptCount"); if (cnt) cnt.textContent = bits.join(" · ");
  const em = $("ptEmpty"); if (em) em.style.display = c.total ? "none" : "";
  const rc = $("ptRunCard"); if (rc) rc.style.display = c.total ? "" : "none";
  const oc = $("ptOutCard"); if (oc) oc.style.display = c.total ? "" : "none";
  setIcnText($("btnPtRun"), "i-stack", "ink", ptT("pt_run") + " (" + String(ptPending().length) + ")");
  const re = $("btnPtRetryErr");
  if (re) {
    re.style.display = c.error ? "" : "none";
    if (c.error) setIcnText(re, "i-retry", "cream", ptT("pt_retry") + " (" + String(c.error) + ")");
  }
}

/* ---- the album ---- */
function ptRenderGrid() {
  const host = $("ptGrid"); if (!host) return;
  host.textContent = "";
  PT.photos.forEach(function (p, i) {
    const b = document.createElement("div");
    b.className = "pt-th"; b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    const im = document.createElement("img");
    if (p.status === "done" && p.outB64) dataSrc(im, p.outMime, p.outB64);
    else im.src = p.srcDataUrl || IMG_BLANK;
    im.alt = "";
    b.appendChild(im);
    const idx = document.createElement("span"); idx.className = "pt-idx"; idx.textContent = String(i + 1);
    b.appendChild(idx);
    const badge = document.createElement("span"); badge.className = "pt-badge " + p.status;
    if (p.status === "done") badge.appendChild(ffIcon("i-check", "ink"));
    else if (p.status === "error") badge.appendChild(ffIcon("i-warn", "err"));
    else badge.textContent = "·";
    b.appendChild(badge);
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
    b.appendChild(nm);
    if (ptMulti.on) {
      if (ptMulti.ids[p.id]) b.className += " on";
      b.addEventListener("click", function () {
        if (ptMulti.ids[p.id]) delete ptMulti.ids[p.id]; else ptMulti.ids[p.id] = 1;
        ptRenderGrid();
      });
    } else {
      b.addEventListener("click", function () { ptPhotoMenu(i); });
    }
    host.appendChild(b);
  });
  ptRenderMultiBar();
  ptRenderCount();
}
/* the app's per-photo sheet is a modal over a live compare slider; the panel
   answers the same three questions the sheet exists for — put THIS one back
   in the queue, give it its own look, take it out of the album — from the
   thumbnail itself, because a UXP panel is 420px wide and a full-screen
   modal over it hides the album it is talking about. */
function ptPhotoMenu(i) {
  const p = PT.photos[i]; if (!p || PT.busy) return;
  if (p.status === "done" || p.status === "error") { p.status = "queued"; p.doneSrc = ""; ptSync(); return; }
  if (ptSrcMode() === "look") { p.lookOverride = ptState().look; ptRenderGrid();
    setStatus(ptS("look") + " ✓", "ok"); return; }
  ptRenderGrid();
}
function ptMultiSel() { return PT.photos.filter(function (p) { return ptMulti.ids[p.id]; }); }
function ptRenderMultiBar() {
  const host = $("ptMultiBar"); if (!host) return;
  host.textContent = "";
  if (!PT.photos.length) { ptMulti.on = false; ptMulti.ids = {}; return; }
  const n = ptMultiSel().length;
  function chip(icon, label, fn) {
    const b = document.createElement("div");
    b.className = "chip"; b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    setIcnText(b, icon, "cream", label);
    b.addEventListener("click", fn);
    host.appendChild(b);
    return b;
  }
  const tg = chip("i-stack", ptMulti.on
    ? ff9({ my: "ရွေးနေသည် — ပိတ်မယ် (" + n + ")", en: "Selecting — done (" + n + ")" })
    : ff9({ my: "အများရွေးမယ်", en: "Select multiple" }),
    function () { ptMulti.on = !ptMulti.on; if (!ptMulti.on) ptMulti.ids = {}; ptRenderGrid(); });
  if (ptMulti.on) tg.className = "chip on";
  if (!ptMulti.on || !n) return;
  chip("i-bolt", ff9({ my: "ရွေးထားတာ Run", en: "Run selected" }) + " (" + n + ")",
    function () { if (!PT.busy) ptRunAll(ptMultiSel()); });
  const doneSel = ptMultiSel().filter(function (p) { return p.status === "done" && p.outB64; });
  if (doneSel.length) chip("i-download", ff9({ my: "Folder ထဲ သိမ်းမယ်", en: "Save to folder" }) + " (" + doneSel.length + ")",
    function () { ptSaveTo(doneSel); });
  chip("i-close", ff9({ my: "ဖယ်မယ်", en: "Remove" }) + " (" + n + ")", function () {
    if (PT.busy) return;
    const removed = ptMultiSel().length;
    PT.photos = PT.photos.filter(function (p) { return !ptMulti.ids[p.id]; });
    ptMulti.ids = {};
    ptSync();
    setStatus(ff9({ my: removed + " ပုံ ဖယ်လိုက်ပါပြီ", en: "Removed " + removed + " photo" + (removed > 1 ? "s" : "") }), "ok");
  });
  if (ptSrcMode() !== "look") return;
  chip("i-palette", ff9({ my: "လက်ရှိ look တပ်မယ်", en: "Apply current look" }), function () {
    ptMultiSel().forEach(function (p) { p.lookOverride = ptState().look; });
    ptRenderGrid();
    setStatus(ff9({ my: "ရွေးထားတဲ့ပုံတွေမှာ look တပ်ပြီး ✓", en: "Look applied to the selected photos ✓" }), "ok");
  });
}

/* ---- the look rail: the app's twelve .pcard tiles, its own chip art ---- */
function ptRenderRail() {
  const host = $("ptLookRail"); if (!host) return;
  host.textContent = "";
  const cur = ptState().look;
  ptLooks().forEach(function (look) {
    const c = document.createElement("div");
    c.className = "pcard" + (cur === look.id ? " on" : "");
    c.setAttribute("role", "button"); c.setAttribute("tabindex", "0");
    const wr = document.createElement("div"); wr.className = "pth";
    const im = document.createElement("img");
    im.src = "icons/lookchips/" + look.id + ".jpg"; im.alt = "";
    wr.appendChild(im);
    c.appendChild(wr);
    const sp = document.createElement("span"); sp.textContent = ff9(look.name);
    c.appendChild(sp);
    c.title = ff9(look.name);
    c.addEventListener("click", function () { ptState().look = look.id; ptSync(); });
    host.appendChild(c);
  });
  /* the app's rule: a look that carries its own hint says it; the rest fall
     back to the page's own line about what the free preview does and does not
     promise. Silence here would have left ten of the twelve looks noteless. */
  const note = $("ptLookNote");
  const look = ptLookById(cur);
  if (note) note.textContent = (look && look.hint) ? ff9(look.hint) : ptT("pt_look_note");
}

/* ---- the source switch: Studio look | Smart Workflow | Retouch A/B ---- */
function ptRenderSrc() {
  const host = $("ptSrcChips"); if (!host) return;
  const mode = ptSrcMode(), wf = ptWfActive();
  host.textContent = "";
  [["look", "look", "i-palette"], ["wf", "wf", "i-brain"], ["studio", "studio", "i-sliders"]].forEach(function (o) {
    const b = document.createElement("div");
    b.className = "chip" + (o[0] === mode ? " on" : "");
    b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    setIcnText(b, o[2], o[0] === mode ? "ink" : "cream", ptS(o[1]));
    b.addEventListener("click", function () {
      if (PT.busy || o[0] === mode) return;
      if (o[0] === "look") { ptSetWorkflow(""); return; }
      if (o[0] === "studio") { ptSetWorkflow(PT_SRC_STUDIO); return; }
      ptOpenWfPick();
    });
    host.appendChild(b);
  });
  const show = function (id, on) { const e = $(id); if (e) e.style.display = on ? "" : "none"; };
  show("ptWfBox", mode === "wf");
  show("ptStBox", mode === "studio");
  show("ptLookBox", mode === "look");
  show("ptFxLookOnly", mode === "look");
  /* who owns IMAGE 2 in each mode: in Studio mode it is Studio's own style
     reference, and a workflow that declares only IMAGE 1 has no second slot
     at all, so the backdrop picker steps aside rather than offering a photo
     the run would drop */
  const refBox = $("ptRefBox");
  if (refBox) refBox.style.display = (mode === "look" || (mode === "wf" && wf && (wf.reqN + wf.opt.length) >= 2)) ? "" : "none";
  const wfn = $("ptWfNote"); if (wfn) wfn.textContent = ptS("note");
  setIcnText($("btnPtWfPick"), "i-brain", "ink", wf ? ptS("change") : ptS("pick"));
  show("btnPtWfClear", !!wf);
  setIcnText($("btnPtWfClear"), "i-close", "cream", ptS("clear"));
  show("ptWfSel", !!wf);
  if (wf) {
    const art = $("ptWfSelArt");
    if (art) { if (wf.cardImg) { art.src = wf.cardImg; art.style.display = ""; } else { clearSrc(art); art.style.display = "none"; } }
    const ti = $("ptWfSelTitle"); if (ti) ti.textContent = wf.title;
    const su = $("ptWfSelSum"); if (su) su.textContent = wf.sum || "";
    const nd = $("ptWfSelNeed");
    if (nd) nd.textContent = wf.reqN >= 2
      ? (ptS("need2") + (PT.ref ? "" : " — " + ptS("need2missing")))
      : ptS("need1");
  }
  /* Studio mode: what the suite is set to right now */
  const stn = $("ptStNote"); if (stn) stn.textContent = ptS("stnote");
  const pend = ptStudioPend();
  const stt = $("ptStTitle");
  if (stt) stt.textContent = pend.length ? ptS("stready").replace("{N}", String(pend.length)) : ptS("stempty");
  const bits = pend.map(function (e) { return e.label || e.key || String(e); });
  if (ptStudioLocal()) bits.unshift(ptS("stlocal"));
  const stl = $("ptStList");
  if (stl) stl.textContent = bits.length ? bits.join(" · ") : "";
  setIcnText($("btnPtStOpen"), "i-sliders", "cream", ptS("stopen"));

  /* the page renames itself around the source that is actually driving it —
     the app's own rule: a heading that reads LOOK over a Smart Workflow run
     is the page contradicting itself at a glance */
  const headWord = mode === "wf" ? ptS("wf") : mode === "studio" ? ptS("studio") : "LOOK";
  const h2 = $("ptLookH2");
  if (h2) {
    h2.textContent = "";
    h2.appendChild(ffIcon("i-palette", "hi", "ic-h2"));
    h2.appendChild(document.createTextNode(headWord));
  }
  const fn2 = $("ptFreeNote");
  if (fn2) fn2.textContent = mode === "look" ? ptT("pt_free_note") : ptS("nofree");
  const hero = $("phPath");
  if (hero) {
    if (mode === "look") paintHeroHead(hero, ff9(PAGE_HERO_HEADS.phPath));
    else paintHeroHead(hero, ptS("hero2a") + " <em>" + headWord + "</em> " + ptS("hero2b"));
  }
  const kick = document.querySelector("#pagePath .ph-kick");
  if (kick) kick.textContent = mode === "look" ? "BATCH LOOKS" : (mode === "wf" ? "BATCH WORKFLOW" : "BATCH STUDIO");
  const intro = $("ptIntro");
  if (intro) intro.textContent = mode === "look"
    ? ptT("pt_intro").replace("{N}", String(PT_MAX))
    : ptS("intro2").replace("{N}", String(PT_MAX)).replace("{S}", headWord);
  /* in workflow mode the reference slot stops being the optional backdrop and
     becomes that workflow's own IMAGE 2, so it wears that workflow's label */
  const rl = $("ptLbRef"), rn = $("ptRefNote");
  if (rl && rn) {
    const req = (wf && wf.def && wf.def.requiredInputs) || [];
    let lb = ptT("pt_ref");
    if (wf && wf.reqN >= 2) { lb = "IMAGE 2 — " + ((req[1] && req[1].label) || ""); rn.textContent = ptS("need2"); }
    else if (wf && wf.opt.length) { lb = "IMAGE 2 — " + (wf.opt[0].label || ""); rn.textContent = ptT("pt_ref_note"); }
    else rn.textContent = ptT("pt_ref_note");
    rl.textContent = lb;
    const pill = document.createElement("span"); pill.className = "pt-ai"; pill.textContent = "AI";
    rl.appendChild(pill);
  }
}
/* the app opens a sheet of workflow cards; the panel already HAS that sheet —
   it is the Workflows page — so the pick hands off there and the card's own
   batch button (HNK.panelNav.useWorkflow) hands back. */
function ptOpenWfPick() {
  switchPage("wf");
  setStatus(ptS("pick"), "ok");
}

/* ---- strength / tier / effects chips ---- */
function ptRenderChips() {
  if (!PTD) return;
  const pt = ptState(), fx = pt.fx, F = PTD.fx;
  function chipRow(hostId, def, cur, set) {
    const host = $(hostId); if (!host) return;
    host.textContent = "";
    def.opts.forEach(function (o) {
      const b = document.createElement("div");
      b.className = "chip" + (cur === o.v ? " on" : "");
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      b.textContent = ff9(o.label);
      b.addEventListener("click", function () { set(o.v); });
      host.appendChild(b);
    });
  }
  const sh = $("ptStrengthChips");
  if (sh) {
    sh.textContent = "";
    [50, 75, 100, 125].forEach(function (s) {
      const b = document.createElement("div");
      b.className = "chip" + (ptStrength() === s ? " on" : "");
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      b.textContent = s + "%";
      b.addEventListener("click", function () { pt.strength = s; ptSync(); });
      sh.appendChild(b);
    });
  }
  chipRow("ptBlurChips", F.blur, fx.blur, function (v) { fx.blur = v; ptSync(); });
  chipRow("ptFgChips", F.fg, fx.fg, function (v) { fx.fg = v; ptSync(); });
  chipRow("ptFrameChips", F.frame, fx.frame, function (v) { fx.frame = v; ptSync(); });
  const fn = $("ptFrameNote"); if (fn) fn.style.display = fx.frame === "off" ? "none" : "";
  const tog = $("ptToggleChips");
  if (tog) {
    tog.textContent = "";
    [F.sync, F.proLight].forEach(function (f) {
      const b = document.createElement("div");
      b.className = "chip" + (fx[f.key] ? " on" : "");
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      setIcnText(b, fx[f.key] ? "i-check" : "i-close", fx[f.key] ? "ink" : "cream", ff9(f.label));
      b.addEventListener("click", function () { fx[f.key] = !fx[f.key]; ptSync(); });
      tog.appendChild(b);
    });
  }
  const hdOk = !!(state.rhKey && rhIsConfigured("upscale-pro"));
  const ts = $("ptTierChips");
  if (ts) {
    ts.textContent = "";
    (PTD.tiers || []).forEach(function (q) {
      const b = document.createElement("div");
      b.className = "chip" + (pt.tier === q.v ? " on" : "") + (q.v === "hd" && !hdOk ? " off" : "");
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      setIcnText(b, q.icon, pt.tier === q.v ? "ink" : "cream", ff9(q.label));
      b.addEventListener("click", function () {
        if (q.v === "hd" && !hdOk) { setStatus(ptI("hdHint"), "err"); return; }
        pt.tier = q.v; ptSync();
      });
      ts.appendChild(b);
    });
  }
  const hh = $("ptHdHint"); if (hh) hh.style.display = hdOk ? "none" : "";
  /* the app's engine honesty line: name the model a batch run will use */
  const pen = $("ptEngineNote");
  if (pen) {
    let pl = "";
    try { const m = ffModel(); pl = m ? ("RunningHub · " + ffModelLabel(m)) : ""; } catch (e) { pl = ""; }
    pen.style.display = pl ? "" : "none";
    if (pl) pen.textContent = "Engine: " + pl + ptI("engineNote");
  }
  const rc = $("btnPtRefClear"); if (rc) rc.style.display = PT.ref ? "" : "none";
  const rt = $("ptRefThumb");
  if (rt) {
    if (PT.ref) { dataSrc(rt, PT.ref.mime, PT.ref.b64); rt.style.display = ""; }
    else { clearSrc(rt); rt.style.display = "none"; }
  }
}
/* The app's ptSync() calls saveState(), which writes a string to localStorage;
   the panel's saveSettings() writes a FILE. ptSync runs on every keystroke in
   the custom-prompt box, so the write is coalesced — the renders stay
   immediate, the settings file is written once the typing stops. */
let _ptSaveT = 0;
function ptSaveSoon() {
  if (_ptSaveT) clearTimeout(_ptSaveT);
  _ptSaveT = setTimeout(function () { _ptSaveT = 0; try { saveSettings(); } catch (e) { } }, 450);
}
function ptSync() {
  ptSaveSoon();
  ptRenderSrc();
  ptRenderRail();
  ptRenderChips();
  ptRenderGrid();
  const pv = $("ptPromptPreview"); if (pv) pv.textContent = ptBuildPrompt(null);
}

/* ---- the panel's own ingest: UXP's multi-file dialog ---- */
/* v6.107.2 — the batch can start from the open layer.
   A studio retouching one photograph in Photoshop had to export it to disk
   before the Batch page would take it; the sheet offers the layer first and
   the multi-file picker exactly as before. */
function ptAdd() {
  if (PT.busy) return;
  photoSheet(ptT("pt_add") || ff9(FF_L.where), {
    onLayer: async function () {
      if (PT.photos.length >= PT_MAX) return;
      const e = await layerPhotoCapture();
      if (!e) return;
      PT.photos.push({ id: "p" + (++PT.seq), name: e.name,
        srcDataUrl: e._url, status: "queued", lookOverride: null, outB64: null, outMime: "", doneSrc: "", file: null });
      ptSync();
      setStatus(ptT("pt_n").replace("{N}", String(PT.photos.length)), "ok");
    },
    onFile: ptAddFiles
  });
}
async function ptAddFiles() {
  if (PT.busy) return;
  try {
    const uxp = require("uxp");
    const picked = await uxp.storage.localFileSystem.getFileForOpening({
      allowMultiple: true, types: ["jpg", "jpeg", "png", "webp"]
    });
    const arr = picked ? (Array.isArray(picked) ? picked : [picked]) : [];
    if (!arr.length) return;
    let added = 0;
    for (let i = 0; i < arr.length; i++) {
      if (PT.photos.length >= PT_MAX) break;
      const f = arr[i];
      const du = await fileToDataUrl(f);
      if (!du) continue;
      PT.photos.push({ id: "p" + (++PT.seq), name: String(f.name || ("photo-" + PT.seq)),
        srcDataUrl: du, status: "queued", lookOverride: null, outB64: null, outMime: "", doneSrc: "", file: f });
      added++;
    }
    ptSync();
    if (added) setStatus(ptT("pt_n").replace("{N}", String(PT.photos.length)), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function ptPickRef() {
  try {
    const uxp = require("uxp");
    const f = await uxp.storage.localFileSystem.getFileForOpening({ types: ["jpg", "jpeg", "png", "webp"] });
    if (!f) return;
    const buf = await f.read({ format: uxp.storage.formats.binary });
    PT.ref = { b64: bufToB64(buf), mime: extToMime(f.name) };
    ptSync();
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function ptPickOut() {
  try {
    const uxp = require("uxp");
    const f = await uxp.storage.localFileSystem.getFolder();
    if (f) PT.out = f;
    ptPaintOut();
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
function ptPaintOut() {
  const n = $("ptOutName");
  if (n) n.textContent = PT.out ? (PT.out.name || "—") : "—";
}
/* write finished results into the studio's folder */
async function ptSaveTo(list) {
  if (!PT.out) { await ptPickOut(); if (!PT.out) return; }
  const uxp = require("uxp");
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.outB64) continue;
    try {
      const ext = (p.outMime === "image/png") ? "png" : "jpg";
      const name = String(p.name).replace(/\.[^.]+$/, "") + "_hnk." + ext;
      const f = await PT.out.createFile(name, { overwrite: true });
      await f.write(b64ToBuf(p.outB64), { format: uxp.storage.formats.binary });
      n++;
    } catch (e) { }
  }
  setStatus(n + " · " + ff9({ my: "သိမ်းပြီး", en: "saved" }), n ? "ok" : "err");
}

/* ---- the run: one call per photo, the app's own prompt each time ----

   The tier is not decoration. In the app it forces three things onto the
   call — quality, size, and for HD a second RunningHub pass — so a panel
   that drew the chips and ignored them would be charging for Fast while the
   page said HD. Same three settings here, on the panel's own controls, put
   back afterwards so Freeform looks untouched: exactly the app's rule that
   the borrowed selects are restored in `finally`. */
function ptTierSize() { return ptState().tier === "fast" ? "" : "2K"; }
function ptHdOn() {
  return ptState().tier === "hd" && !!state.rhKey && rhIsConfigured("upscale-pro");
}
/* the app's ptCostOk: an HD run issues TWO calls a photo, and quoting one
   number for a run that spends double is the lie this confirm exists to
   prevent. window.confirm does not exist in UXP — the panel's own dialog. */
const PT_COST_ASK = 8;
async function ptCostOk(n) {
  if (n < PT_COST_ASK) return true;
  const hd = ptHdOn(), calls = hd ? n * 2 : n, per = hd ? "2" : "1";
  const wf = ptWfActive();
  const what = wf ? wf.title
    : ptSrcMode() === "studio" ? ptS("studio")
      : ff9((ptLookById(ptState().look) || {}).name || {});
  return await setupConfirm(ff9({
    my: "ဓာတ်ပုံ " + n + " ပုံကို \u201c" + what + "\u201d နဲ့ ထုတ်ပါမယ်။\n\nပုံတစ်ပုံ = API ခေါ်ဆိုမှု " + per + " ကြိမ်" + (hd ? " (HD upscale ပါ)" : "") + " — စုစုပေါင်း " + calls + " ကြိမ် ကုန်ကျပါမယ်။ ဆက်လုပ်မလား?",
    en: "About to run " + n + " photos through \u201c" + what + "\u201d.\n\nOne photo = " + per + " API call" + (hd ? "s (the HD upscale is the second)" : "") + ", so this run costs " + calls + " calls. Continue?"
  }));
}
async function ptRunAll(subset) {
  if (PT.busy) return;
  const list = (subset && subset.length) ? subset : ptPending();
  if (!list.length) { setStatus(ptT("pt_empty").replace("{N}", String(PT_MAX)), "err"); return; }
  if (ptSrcMode() === "studio" && !ptStudioPend().length) { setStatus(ptS("stneed"), "err"); return; }
  if (!(await ptCostOk(list.length))) return;
  PT.busy = true; PT.stop = false;
  const stop = $("btnPtStop"); if (stop) { stop.style.display = ""; setIcnText(stop, "i-close", "cream", ptT("pt_stop")); }
  const sn = $("ptStopNote"); if (sn) { sn.style.display = ""; sn.textContent = ptT("pt_stop_note"); }
  const prog = $("ptProg"); if (prog) prog.style.display = "";
  const log = $("ptLog"); if (log) log.textContent = "";
  const key = ptSrcKey(), hd = ptHdOn(), size = ptTierSize();
  /* the two shared controls this run borrows, restored in the finally below */
  const svModel = state.model, svCount = state.ffCount;
  state.model = (ptState().tier === "fast") ? state.model : "pro";
  state.ffCount = 1;                     /* deterministic per photo, and honest cost */
  let done = 0, fail = 0;
  try {
  for (let i = 0; i < list.length && !PT.stop; i++) {
    const p = list[i];
    p.status = "running"; ptRenderGrid();
    stSet("stPtGen", ptT("pt_n").replace("{N}", String(i + 1) + "/" + list.length), "run");
    try {
      const prompt = ptBuildPrompt(p);
      const parts = [{ text: prompt }];
      const m = /^data:([^;]+);base64,(.*)$/.exec(p.srcDataUrl || "");
      if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
      if (PT.ref) parts.push({ inlineData: { mimeType: PT.ref.mime, data: PT.ref.b64 } });
      /* ratio is deliberately left empty: a batch look pass never reframes */
      const img = await callImageAPI(null, parts, { size: size });
      if (!img || !img.b64) throw new Error("no result");
      let outB64 = img.b64, outMime = img.mime || "image/png";
      /* the HD tier chases the result with the upscale deployment, exactly as
         the app's ptHdFinish does — and if that second call fails the FIRST
         result is kept rather than the photo being marked failed */
      if (hd) {
        try {
          const up = await callImageAPI("upscale-pro", [{ text: "" }, { inlineData: { mimeType: outMime, data: outB64 } }], {});
          if (up && up.b64) { outB64 = up.b64; outMime = up.mime || outMime; }
        } catch (e) { if (log) log.textContent = p.name + " — HD " + friendlyErr(e) + "\n" + log.textContent; }
      }
      p.outB64 = outB64; p.outMime = outMime;
      p.status = "done"; p.doneSrc = key;
      done++;
      try {
        const gs = globalThis.HNK && globalThis.HNK.galleryStore;
        if (gs) await gs.save(p.outB64, p.outMime === "image/png" ? "png" : "jpg", "path");
      } catch (e) { }
      if (PT.out) await ptSaveTo([p]);
      if (log) log.textContent = p.name + " ✓\n" + log.textContent;
    } catch (e) {
      p.status = "error"; fail++;
      if (log) log.textContent = p.name + " ✗ " + friendlyErr(e) + "\n" + log.textContent;
    }
    const pi = $("ptProgI");
    if (pi) pi.style.width = Math.round(((i + 1) / list.length) * 100) + "%";
    ptRenderGrid();
  }
  } finally { state.model = svModel; state.ffCount = svCount; }
  PT.busy = false;
  if (stop) stop.style.display = "none";
  if (sn) sn.style.display = "none";
  if (prog) prog.style.display = "none";
  ptSync();
  stSet("stPtGen", ptT("pt_done_n").replace("{N}", String(done)) + (fail ? " · " + fail : ""), fail ? "err" : "ok");
}

/* ---- static labels: the app's own paint block, key for key ---- */
function ptPaintLabels() {
  if (!PTD) return;
  const pt = ptState();
  const set = function (id, txt) { const e = $(id); if (e) e.textContent = txt; };
  set("ptIntro", ptT("pt_intro").replace("{N}", String(PT_MAX)));
  set("ptFreeNote", ptT("pt_free_note"));
  setIcnText($("btnPtAdd"), "i-camera", "ink", ptT("pt_add"));
  setIcnText($("btnPtClear"), "i-trash", "cream", ptT("pt_clear"));
  set("ptEmpty", ptT("pt_empty").replace("{N}", String(PT_MAX)));
  set("ptLbTier", ptT("pt_tier"));
  set("ptHdHint", ptI("hdHint"));
  set("ptLbFx", ptT("pt_fx"));
  set("ptFxNote", ptT("pt_fx_note"));
  /* the "AI" pill marks every control that acts only on the AI run */
  [["ptLbBlur", "pt_blur"], ["ptLbFg", "pt_fg"], ["ptLbFrame", "pt_frame"],
   ["ptLbExtras", "pt_extras"], ["ptLbRef", "pt_ref"], ["ptLbCustom", "pt_custom"]].forEach(function (pr) {
    const e = $(pr[0]); if (!e) return;
    e.textContent = ptT(pr[1]);
    const pill = document.createElement("span"); pill.className = "pt-ai"; pill.textContent = "AI";
    e.appendChild(pill);
  });
  set("ptFrameNote", ptT("pt_frame_note"));
  set("ptRefNote", ptT("pt_ref_note"));
  set("ptLbStrength", ptI("strength"));
  setIcnText($("btnPtRef"), "i-frame", "cream", ptT("pt_ref_pick"));
  setIcnText($("btnPtRefClear"), "i-close", "cream", ptT("pt_ref_clear"));
  setIcnText($("btnPtFromStudio"), "i-save", "cream", ptI("fromStudio"));
  const cu = $("ptCustom");
  if (cu) { cu.placeholder = ptT("pt_custom_ph"); if (cu.value !== (pt.custom || "")) cu.value = pt.custom || ""; }
  set("ptLbPrompt", ptT("pt_prompt"));
  set("ptOutNote", ptT("pt_out_note"));
  setIcnText($("btnPtOut"), "i-folder", "ink", ff9(PT_OUT_L));
  setIcnText($("btnPtSaveAll"), "i-download", "cream", ff9(PT_SAVEALL_L));
  ptPaintOut();
}

function bindPath() {
  if (!$("ptSrcChips")) return;
  /* v6.77.0 — the crawl that walked every control found these two headers
     with no handler on either surface of the panel: the Effects group and the
     Prompt-preview group drew a caret, took the tap, and never opened, so the
     look-only effects and the written prompt were unreachable on Path. */
  wireStaticGrp("ptGrpFx", "ptFxH");
  wireStaticGrp("ptGrpPrompt", "ptPromptH");
  const add = $("btnPtAdd"); if (add) add.addEventListener("click", ptAdd);
  const em = $("ptEmpty"); if (em) em.addEventListener("click", ptAdd);
  const clr = $("btnPtClear");
  if (clr) clr.addEventListener("click", function () {
    if (PT.busy) return;
    PT.photos = []; ptMulti.on = false; ptMulti.ids = {};
    ptSync();
  });
  const fs = $("btnPtFromStudio");
  if (fs) fs.addEventListener("click", function () {
    if (!ptSetWorkflow(PT_SRC_STUDIO)) return;
    setStatus(ptS("stnote"), "ok");
  });
  const wp = $("btnPtWfPick"); if (wp) wp.addEventListener("click", ptOpenWfPick);
  const wc = $("btnPtWfClear"); if (wc) wc.addEventListener("click", function () { ptSetWorkflow(""); });
  const so = $("btnPtStOpen"); if (so) so.addEventListener("click", function () { switchPage("meitu"); });
  const rf = $("btnPtRef"); if (rf) rf.addEventListener("click", ptPickRef);
  const rc = $("btnPtRefClear"); if (rc) rc.addEventListener("click", function () { PT.ref = null; ptSync(); });
  const cu = $("ptCustom");
  if (cu) cu.addEventListener("input", function () { ptState().custom = cu.value || ""; ptSync(); });
  const run = $("btnPtRun"); if (run) run.addEventListener("click", function () { ptRunAll(null); });
  const re = $("btnPtRetryErr");
  if (re) re.addEventListener("click", function () {
    PT.photos.forEach(function (p) { if (p.status === "error") { p.status = "queued"; p.doneSrc = ""; } });
    ptRunAll(null);
  });
  const stop = $("btnPtStop"); if (stop) stop.addEventListener("click", function () { PT.stop = true; });
  const out = $("btnPtOut"); if (out) out.addEventListener("click", ptPickOut);
  const sa = $("btnPtSaveAll");
  if (sa) sa.addEventListener("click", function () {
    ptSaveTo(PT.photos.filter(function (p) { return p.status === "done" && p.outB64; }));
  });
  ptPaintLabels();
  ptSync();
  REFRESHERS.push(function () { try { ptPaintLabels(); ptSync(); } catch (e) { } });
}
/* ============================================================
   MEDIA LAB — Video and VidUp (v6.46.0)

   The app's Media Lab holds three pages; the panel held one. These are the
   other two, driven by the app's own doc-verified catalog (183 endpoints,
   lifted verbatim into panel/js/hnk_video_models.js) through the panel's own
   upload / submit / poll / download services. A finished video is written as
   a file into a folder the studio picks — a panel cannot hand a browser a
   download, and a video is not a layer.
   ============================================================ */
/* v6.51.0 \u2014 the Video page is the app's pgVideo card for card: the run state
   is the app's (vidHist / vidHistSel, a spinner with its own clock and abort),
   the photo comes from the same three IMG slots Freeform reads, and the
   result stays a link the studio downloads to a folder of its choice. */
const VU = { video: null, out: null, busy: false, rows: [] };
const vidRun = { tick: 0, anim: 0, abort: null, t0: 0, busy: false, dl: false, base: "" };
let vidHist = [];
let vidHistSel = 0;

/* the app's vidModelDef(): an unknown value falls back to the first model */
function vidDef() {
  const sel = $("vidModel");
  const V = (globalThis.HNK && globalThis.HNK.runninghubVideo) || null;
  if (!V) return null;
  return (sel && V.get(sel.value)) || (V.models()[0] || null);
}
function fillSel(el, values, current) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
  (values || []).forEach(function (v) {
    el.appendChild(mkOption(String(v), String(v)));
  });
  if (current) { try { el.value = current; } catch (e) { } }
  el.style.display = (values && values.length) ? "" : "none";
}

/* The app's own runtime copy for this page, its nine languages verbatim
   (docs/app/index.html, the L9 maps around the video generate flow). */
const VID_L = {
  intro: { my: "\u101b\u103e\u102d\u1015\u103c\u102e\u1038\u101e\u102c\u1038 \u1015\u102f\u1036\u1000\u1014\u1031 \u101b\u103d\u1031\u1037\u101c\u103b\u102c\u1038\u1014\u1031\u1010\u1032\u1037 \u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1006\u1031\u102c\u1000\u103a\u1015\u1031\u1038\u1019\u101a\u103a \u2014 RunningHub Enterprise key \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a\u104b", en: "Turn an existing photo into a moving video \u2014 needs your RunningHub Enterprise key.", shn: "\u1081\u1035\u1010\u103a\u1038\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u1015\u1035\u107c\u103a\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088 \u2014 \u101c\u1030\u101d\u103a\u1087 RunningHub Enterprise key", kac: "Nga ai sumla hpe video ni hku galai ai \u2014 RunningHub Enterprise key ra ai", th: "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e23\u0e39\u0e1b\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e2b\u0e49\u0e40\u0e1b\u0e47\u0e19\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e40\u0e04\u0e25\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e2b\u0e27 \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35 RunningHub Enterprise key", zh: "\u628a\u73b0\u6709\u7167\u7247\u53d8\u6210\u52a8\u6001\u89c6\u9891 \u2014 \u9700\u8981\u4f60\u7684 RunningHub Enterprise key", vi: "Bi\u1ebfn \u1ea3nh c\u00f3 s\u1eb5n th\u00e0nh video chuy\u1ec3n \u0111\u1ed9ng \u2014 c\u1ea7n key RunningHub Enterprise", id: "Ubah foto yang ada menjadi video bergerak \u2014 perlu RunningHub Enterprise key", ms: "Tukar foto sedia ada kepada video bergerak \u2014 perlukan RunningHub Enterprise key" },
  wfIntro: { my: "\u1000\u1010\u103a\u1010\u1005\u103a\u1001\u103b\u1000\u103a\u1014\u103e\u102d\u1015\u103a\u101b\u102f\u1036\u1014\u1032\u1037 prompt\u104a model\u104a \u1021\u101b\u103d\u101a\u103a\u1021\u1005\u102c\u1038\u104a \u1000\u103c\u102c\u1001\u103b\u102d\u1014\u103a \u1021\u1000\u102f\u1014\u103a \u1001\u103b\u102d\u1014\u103a\u1015\u1031\u1038\u1019\u101a\u103a\u104b", en: "One tap on a card fills the prompt and sets the model, size and duration for you.", shn: "\u107c\u1035\u1075\u103a\u1038\u1075\u1062\u1010\u103a\u1088\u1022\u107c\u103a\u107c\u102d\u102f\u1004\u103a\u1088 \u2014 prompt \u101c\u1084\u1088 model, \u1081\u1062\u1004\u103a\u1088, \u1076\u1062\u101d\u103a\u1038\u101a\u1062\u1019\u103a\u1038 \u1010\u1004\u103a\u1038\u101e\u1035\u1004\u103a\u1088\u104b", kac: "Card langai mi hkan \u2014 prompt, model, hkum hte ten yawng jaw ya ai.", th: "\u0e41\u0e15\u0e30\u0e01\u0e32\u0e23\u0e4c\u0e14\u0e04\u0e23\u0e31\u0e49\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27 \u0e40\u0e15\u0e34\u0e21 prompt \u0e41\u0e25\u0e30\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e42\u0e21\u0e40\u0e14\u0e25 \u0e02\u0e19\u0e32\u0e14 \u0e23\u0e30\u0e22\u0e30\u0e40\u0e27\u0e25\u0e32\u0e43\u0e2b\u0e49\u0e40\u0e25\u0e22", zh: "\u70b9\u4e00\u4e0b\u5361\u7247\u5373\u53ef\u586b\u5165 prompt \u5e76\u8bbe\u7f6e\u6a21\u578b\u3001\u5c3a\u5bf8\u4e0e\u65f6\u957f", vi: "M\u1ed9t ch\u1ea1m v\u00e0o th\u1ebb s\u1ebd \u0111i\u1ec1n prompt v\u00e0 \u0111\u1eb7t model, k\u00edch th\u01b0\u1edbc, th\u1eddi l\u01b0\u1ee3ng", id: "Sekali tap kartu mengisi prompt dan mengatur model, ukuran, durasi", ms: "Satu ketikan pada kad mengisi prompt dan menetapkan model, saiz, tempoh" },
  cityH: { my: "\u1001\u101b\u102e\u1038\u1005\u1009\u103a \u101b\u103d\u1031\u1038\u1015\u102b", en: "Destination", shn: "\u101c\u102d\u1030\u1075\u103a\u1088\u1019\u102d\u1030\u1004\u103a\u1038", kac: "Sa na shara", th: "\u0e08\u0e38\u0e14\u0e2b\u0e21\u0e32\u0e22\u0e1b\u0e25\u0e32\u0e22\u0e17\u0e32\u0e07", zh: "\u76ee\u7684\u5730", vi: "\u0110i\u1ec3m \u0111\u1ebfn", id: "Tujuan", ms: "Destinasi" },
  introHint: { my: "\u1000\u1010\u103a\u1010\u1005\u103a\u1001\u102f \u101b\u103d\u1031\u1038\u1015\u102b \u2014 \u1012\u102b\u1019\u103e\u1019\u101f\u102f\u1010\u103a \u1021\u1031\u102c\u1000\u103a\u1019\u103e\u102c \u1000\u102d\u102f\u101a\u103a\u1010\u102d\u102f\u1004\u103a \u101b\u1031\u1038\u1015\u102b\u104b", en: "Pick a card \u2014 or write your own prompt below.", shn: "\u101c\u102d\u1030\u1075\u103a\u1088\u1075\u1062\u1010\u103a\u1088\u1022\u107c\u103a\u107c\u102d\u102f\u1004\u103a\u1088 \u2014 \u1022\u1019\u103a\u1087\u107c\u107c\u103a \u1010\u1085\u1019\u103a\u1088\u1081\u1004\u103a\u1038\u1075\u1030\u107a\u103a\u1038\u104b", kac: "Card langai lata u \u2014 nrai npu de nang tsun u.", th: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e01\u0e32\u0e23\u0e4c\u0e14\u0e2a\u0e31\u0e01\u0e43\u0e1a \u2014 \u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e02\u0e35\u0e22\u0e19 prompt \u0e40\u0e2d\u0e07\u0e14\u0e49\u0e32\u0e19\u0e25\u0e48\u0e32\u0e07", zh: "\u9009\u62e9\u4e00\u5f20\u5361\u7247 \u2014 \u6216\u5728\u4e0b\u65b9\u81ea\u884c\u8f93\u5165", vi: "Ch\u1ecdn m\u1ed9t th\u1ebb \u2014 ho\u1eb7c t\u1ef1 vi\u1ebft prompt b\u00ean d\u01b0\u1edbi", id: "Pilih kartu \u2014 atau tulis prompt sendiri di bawah", ms: "Pilih kad \u2014 atau tulis prompt sendiri di bawah" },
  promptPh: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f\u1011\u1032\u1019\u103e\u102c \u1018\u102c\u1016\u103c\u1005\u103a\u1005\u1031\u1001\u103b\u1004\u103a\u101c\u1032 \u101b\u1031\u1038\u1015\u102b \u2014 \u1025\u1015\u1019\u102c: subject slowly turns and smiles, camera slowly pushes in\u2026", en: "Describe what should happen in the video \u2014 e.g. subject slowly turns and smiles, camera slowly pushes in\u2026", shn: "\u1010\u1085\u1019\u103a\u1088\u101d\u1083\u1088\u101e\u1004\u103a\u1010\u1031\u1015\u1035\u107c\u103a\u107c\u1082\u103a\u1038\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088", kac: "Video kata gaw n gara hku byin na ni tsun dan u", th: "\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e27\u0e48\u0e32\u0e08\u0e30\u0e40\u0e01\u0e34\u0e14\u0e2d\u0e30\u0e44\u0e23\u0e02\u0e36\u0e49\u0e19\u0e43\u0e19\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d", zh: "\u63cf\u8ff0\u89c6\u9891\u4e2d\u5e94\u8be5\u53d1\u751f\u7684\u4e8b\u60c5", vi: "M\u00f4 t\u1ea3 \u0111i\u1ec1u s\u1ebd x\u1ea3y ra trong video", id: "Jelaskan apa yang harus terjadi di video", ms: "Terangkan apa yang patut berlaku dalam video" },
  spin: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1011\u102f\u1010\u103a\u1014\u1031\u1015\u102b\u1010\u101a\u103a \u2014 \u1019\u102d\u1014\u1005\u103a\u1021\u1014\u100a\u103a\u1038\u1004\u101a\u103a \u1005\u1031\u102c\u1004\u1037\u103a\u1015\u102b\u2026", en: "Generating video \u2014 allow a few minutes\u2026", shn: "\u1081\u1035\u1010\u103a\u1038\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u101a\u1030\u1087 \u2014 \u1076\u103d\u1086\u1010\u103d\u1004\u103a\u1075\u1019\u103a\u1088\u107d\u103d\u1004\u103a\u1088", kac: "Video galaw nga ai \u2014 mizan langai nga chyam sit u", th: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d \u2014 \u0e23\u0e2d\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48", zh: "\u6b63\u5728\u751f\u6210\u89c6\u9891 \u2014 \u8bf7\u7a0d\u5019\u51e0\u5206\u949f", vi: "\u0110ang t\u1ea1o video \u2014 vui l\u00f2ng ch\u1edd v\u00e0i ph\u00fat", id: "Membuat video \u2014 tunggu beberapa menit", ms: "Menjana video \u2014 tunggu beberapa minit" },
  retry: { my: "\ud83d\udd01 \u1015\u103c\u1014\u103a\u1005\u1019\u103a\u1038", en: "\ud83d\udd01 Retry", shn: "\ud83d\udd01 \u1078\u1062\u1019\u103a\u1038\u1076\u102d\u102f\u107c\u103a\u1038", kac: "\ud83d\udd01 Bai chyam", th: "\ud83d\udd01 \u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48", zh: "\ud83d\udd01 \u91cd\u8bd5", vi: "\ud83d\udd01 Th\u1eed l\u1ea1i", id: "\ud83d\udd01 Coba lagi", ms: "\ud83d\udd01 Cuba lagi" },
  resultH2: { my: "\u101b\u101c\u1012\u103a (\u1017\u102e\u1012\u102e\u101a\u102d\u102f)", en: "Result (video)", shn: "\u101c\u103d\u1004\u103a\u1088\u1022\u103d\u1075\u103a\u1087\u1019\u1083\u1038 (\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088)", kac: "Ah kyu (video)", th: "\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c (\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d)", zh: "\u7ed3\u679c\uff08\u89c6\u9891\uff09", vi: "K\u1ebft qu\u1ea3 (video)", id: "Hasil (video)", ms: "Hasil (video)" },
  expire: { my: "\u26a0 \u1012\u102e link \u1000 \u1042\u1044 \u1014\u102c\u101b\u102e\u1015\u1032 \u1021\u101c\u102f\u1015\u103a\u101c\u102f\u1015\u103a\u1015\u102b\u1010\u101a\u103a \u2014 download \u1001\u103b\u1000\u103a\u1001\u103b\u1004\u103a\u1038 \u101c\u102f\u1015\u103a\u1011\u102c\u1038\u1015\u102b\u104b Page \u1015\u103c\u1014\u103a reload \u101c\u102f\u1015\u103a\u101b\u1004\u103a \u1012\u102e\u101b\u101c\u1012\u103a \u1015\u103b\u1031\u102c\u1000\u103a\u101e\u103d\u102c\u1038\u1019\u101a\u103a (\u1016\u102d\u102f\u1004\u103a\u1021\u101b\u103d\u101a\u103a\u1021\u1005\u102c\u1038 \u1000\u103c\u102e\u1038\u101c\u102d\u102f\u1037 Gallery \u1011\u1032 \u1019\u101e\u102d\u1019\u103a\u1038\u1015\u102b)\u104b", en: "\u26a0 This link only works for 24 hours \u2014 download it right away. Reloading the page will lose this result (not saved to Gallery \u2014 the file is too large).", shn: "\u26a0 Link \u107c\u1086\u1089 \u1078\u1082\u103a\u1089\u101c\u1086\u1088 24 \u1078\u1030\u101d\u103a\u1088\u1019\u103d\u1004\u103a\u1038\u1075\u1030\u107a\u103a\u1038 \u2014 download \u101d\u1086\u1089\u101c\u1084\u1088\u101c\u102e", kac: "\u26a0 Ndai link gaw 24 hour sha byin ai \u2014 hpang de download nna da u", th: "\u26a0 \u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49\u0e41\u0e04\u0e48 24 \u0e0a\u0e31\u0e48\u0e27\u0e42\u0e21\u0e07 \u2014 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e17\u0e31\u0e19\u0e17\u0e35", zh: "\u26a0 \u6b64\u94fe\u63a5\u4ec5 24 \u5c0f\u65f6\u6709\u6548 \u2014 \u8bf7\u7acb\u5373\u4e0b\u8f7d\u3002\u5237\u65b0\u9875\u9762\u4f1a\u4e22\u5931\u8be5\u7ed3\u679c\uff08\u6587\u4ef6\u8fc7\u5927\u672a\u4fdd\u5b58\u5230 Gallery\uff09\u3002", vi: "\u26a0 Li\u00ean k\u1ebft n\u00e0y ch\u1ec9 ho\u1ea1t \u0111\u1ed9ng trong 24 gi\u1edd \u2014 h\u00e3y t\u1ea3i xu\u1ed1ng ngay. T\u1ea3i l\u1ea1i trang s\u1ebd m\u1ea5t k\u1ebft qu\u1ea3 n\u00e0y (kh\u00f4ng l\u01b0u v\u00e0o Gallery v\u00ec file qu\u00e1 l\u1edbn).", id: "\u26a0 Tautan ini hanya berfungsi 24 jam \u2014 unduh segera. Memuat ulang halaman akan menghilangkan hasil ini (tidak disimpan ke Gallery karena ukuran file terlalu besar).", ms: "\u26a0 Pautan ini hanya berfungsi 24 jam \u2014 muat turun segera. Memuat semula halaman akan kehilangan hasil ini (tidak disimpan ke Gallery kerana saiz fail terlalu besar)." },
  dl: { my: "\u2b07 Download", en: "\u2b07 Download", shn: "\u2b07 Download", kac: "\u2b07 Download", th: "\u2b07 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14", zh: "\u2b07 \u4e0b\u8f7d", vi: "\u2b07 T\u1ea3i xu\u1ed1ng", id: "\u2b07 Unduh", ms: "\u2b07 Muat turun" },
  dlBusy: { my: "\u2b07 Download \u101c\u102f\u1015\u103a\u1014\u1031\u1010\u101a\u103a\u2026", en: "\u2b07 Downloading\u2026", shn: "\u2b07 Download \u101d\u1086\u1089\u101a\u1030\u1087\u2026", kac: "\u2b07 Download nga ai\u2026", th: "\u2b07 \u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u2026", zh: "\u2b07 \u4e0b\u8f7d\u4e2d\u2026", vi: "\u2b07 \u0110ang t\u1ea3i\u2026", id: "\u2b07 Mengunduh\u2026", ms: "\u2b07 Memuat turun\u2026" },
  open: { my: "\u2197 Direct Link \u1016\u103d\u1004\u1037\u103a", en: "\u2197 Open direct link", shn: "\u2197 \u1015\u102d\u102f\u1010\u103a\u1087 Direct Link", kac: "\u2197 Direct Link hpaw", th: "\u2197 \u0e40\u0e1b\u0e34\u0e14\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07", zh: "\u2197 \u6253\u5f00\u539f\u59cb\u94fe\u63a5", vi: "\u2197 M\u1edf li\u00ean k\u1ebft tr\u1ef1c ti\u1ebfp", id: "\u2197 Buka tautan langsung", ms: "\u2197 Buka pautan terus" },
  histH: { my: "\u101c\u1010\u103a\u1010\u101c\u1031\u102c \u1011\u102f\u1010\u103a\u1001\u1032\u1037\u1010\u1032\u1037 \u1017\u102e\u1012\u102e\u101a\u102d\u102f\u1019\u103b\u102c\u1038 (session \u1021\u1010\u103d\u1004\u103a\u1038\u1015\u1032)", en: "Recent videos (this session only)", shn: "\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u1022\u107c\u103a\u1081\u1035\u1010\u103a\u1038\u101d\u1086\u1089\u1019\u102d\u1030\u101d\u103a\u1088\u101c\u1035\u101d\u103a", kac: "Video ni na galaw da ai (session sha)", th: "\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14 (\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e40\u0e0b\u0e2a\u0e0a\u0e31\u0e19\u0e19\u0e35\u0e49)", zh: "\u6700\u8fd1\u751f\u6210\u7684\u89c6\u9891\uff08\u4ec5\u672c\u6b21\u4f1a\u8bdd\uff09", vi: "Video g\u1ea7n \u0111\u00e2y (ch\u1ec9 trong phi\u00ean n\u00e0y)", id: "Video terbaru (hanya sesi ini)", ms: "Video terkini (sesi ini sahaja)" },
  needKey: { my: "RunningHub key setup \u1019\u101c\u102f\u1015\u103a\u101b\u101e\u1031\u1038\u1015\u102b \u2014 Setup \u1019\u103e\u102c \u1016\u103c\u100a\u1037\u103a\u1015\u102b", en: "RunningHub key isn't set up yet \u2014 add it in Setup", shn: "RunningHub key \u1015\u1086\u1087\u101c\u1086\u1088 setup \u2014 \u107e\u1062\u1086\u1087 Setup \u1075\u1082\u1083\u1087\u1016\u103c\u100a\u1037\u103a\u1015\u102b", kac: "RunningHub key n setup ai shi \u2014 Setup kaw galaw u", th: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32 RunningHub key \u2014 \u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e43\u0e19 Setup", zh: "\u5c1a\u672a\u8bbe\u7f6e RunningHub key \u2014 \u8bf7\u5728 Setup \u4e2d\u914d\u7f6e", vi: "Ch\u01b0a thi\u1ebft l\u1eadp RunningHub key \u2014 c\u1ea5u h\u00ecnh trong Setup", id: "RunningHub key belum disiapkan \u2014 atur di Setup", ms: "RunningHub key belum disediakan \u2014 konfigurasi dalam Setup" },
  oddTwo: { my: "\u1015\u102f\u1036 \u1042 \u1015\u102f\u1036 \u1019\u101b\u1015\u102b \u2014 \u1041 \u1015\u102f\u1036 (\u101e\u102d\u102f\u1037) \u1043 \u1015\u102f\u1036 \u1011\u100a\u1037\u103a\u1015\u102b", en: "2 images isn't supported \u2014 use 1 or 3", shn: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 2 \u1022\u1019\u103a\u1087\u101c\u1086\u1088 \u2014 \u1078\u1082\u103a\u1089 1 \u1022\u1019\u103a\u1087\u107c\u107c\u103a 3", kac: "Sumla 2 n mai byin ai \u2014 1 nrai 3 lang u", th: "\u0e43\u0e0a\u0e49 2 \u0e23\u0e39\u0e1b\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u2014 \u0e43\u0e0a\u0e49 1 \u0e2b\u0e23\u0e37\u0e2d 3 \u0e23\u0e39\u0e1b", zh: "\u4e0d\u652f\u6301 2 \u5f20\u56fe\u7247 \u2014 \u8bf7\u7528 1 \u5f20\u6216 3 \u5f20", vi: "Kh\u00f4ng h\u1ed7 tr\u1ee3 2 \u1ea3nh \u2014 d\u00f9ng 1 ho\u1eb7c 3 \u1ea3nh", id: "2 gambar tidak didukung \u2014 gunakan 1 atau 3", ms: "2 imej tidak disokong \u2014 guna 1 atau 3" },
  needPrompt: { my: "Prompt \u101b\u1031\u1038\u1015\u102b \u2014 \u1017\u102e\u1012\u102e\u101a\u102d\u102f\u1011\u1032\u1019\u103e\u102c \u1018\u102c\u1016\u103c\u1005\u103a\u1005\u1031\u1001\u103b\u1004\u103a\u101c\u1032 \u1016\u1031\u102c\u103a\u1015\u103c\u1015\u102b", en: "Write a prompt describing what should happen in the video", shn: "\u1010\u1085\u1019\u103a\u1088 prompt \u101d\u1083\u1088\u101e\u1004\u103a\u1010\u1031\u1015\u1035\u107c\u103a", kac: "Video kata n gara hku byin na tsun dan prompt ka jaw u", th: "\u0e40\u0e02\u0e35\u0e22\u0e19 prompt \u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e08\u0e30\u0e40\u0e01\u0e34\u0e14\u0e02\u0e36\u0e49\u0e19\u0e43\u0e19\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d", zh: "\u8bf7\u5199\u4e00\u4e2a prompt \u63cf\u8ff0\u89c6\u9891\u4e2d\u5e94\u8be5\u53d1\u751f\u7684\u4e8b\u60c5", vi: "Vi\u1ebft prompt m\u00f4 t\u1ea3 \u0111i\u1ec1u s\u1ebd x\u1ea3y ra trong video", id: "Tulis prompt yang menjelaskan apa yang terjadi di video", ms: "Tulis prompt yang menerangkan apa yang berlaku dalam video" },
  noVideo: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1019\u1011\u103d\u1000\u103a\u101c\u102c\u1015\u102b \u2014 \u1015\u103c\u1014\u103a\u1005\u1019\u103a\u1038\u1015\u102b", en: "No video was returned \u2014 try again", shn: "\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u1022\u1019\u103a\u1087\u1022\u103d\u1075\u103a\u1087\u1019\u1083\u1038 \u2014 \u1078\u1062\u1019\u103a\u1038\u1076\u102d\u102f\u107c\u103a\u1038", kac: "Video n pru wa ai \u2014 bai chyam u", th: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e2a\u0e48\u0e07\u0e01\u0e25\u0e31\u0e1a\u0e21\u0e32 \u2014 \u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48", zh: "\u672a\u8fd4\u56de\u89c6\u9891 \u2014 \u8bf7\u91cd\u8bd5", vi: "Kh\u00f4ng c\u00f3 video tr\u1ea3 v\u1ec1 \u2014 th\u1eed l\u1ea1i", id: "Tidak ada video dikembalikan \u2014 coba lagi", ms: "Tiada video dikembalikan \u2014 cuba lagi" },
  dlFail: { my: "Download \u1019\u1021\u1031\u102c\u1004\u103a\u1019\u103c\u1004\u103a\u1015\u102b \u2014 Direct Link \u1000\u102d\u102f \u1014\u103e\u102d\u1015\u103a\u1015\u103c\u102e\u1038 manual download \u101c\u102f\u1015\u103a\u1000\u103c\u100a\u1037\u103a\u1015\u102b", en: "Download failed \u2014 try the Direct Link button to save it manually", shn: "Download \u1022\u1019\u103a\u1087\u101e\u1031\u107d\u103d\u1004\u103a\u1088 \u2014 \u1078\u1062\u1019\u103a\u1038\u107c\u1035\u1075\u103a\u1038 Direct Link", kac: "Download n byin ai \u2014 Direct Link dip nna chyam u", th: "\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e25\u0e49\u0e21\u0e40\u0e2b\u0e25\u0e27 \u2014 \u0e25\u0e2d\u0e07\u0e43\u0e0a\u0e49\u0e1b\u0e38\u0e48\u0e21 Direct Link", zh: "\u4e0b\u8f7d\u5931\u8d25 \u2014 \u8bf7\u5c1d\u8bd5\u70b9\u51fb\u201c\u76f4\u63a5\u94fe\u63a5\u201d\u6309\u94ae\u624b\u52a8\u4fdd\u5b58", vi: "T\u1ea3i xu\u1ed1ng th\u1ea5t b\u1ea1i \u2014 th\u1eed n\u00fat Direct Link \u0111\u1ec3 l\u01b0u th\u1ee7 c\u00f4ng", id: "Unduh gagal \u2014 coba tombol Direct Link untuk menyimpan manual", ms: "Muat turun gagal \u2014 cuba butang Direct Link untuk simpan secara manual" },
  clipped: { my: "Prompt \u101b\u103e\u100a\u103a\u101c\u103d\u1014\u103a\u1038\u101c\u102d\u102f\u1037 \u1012\u102e model \u1014\u1032\u1037 \u1016\u103c\u1010\u103a\u1010\u1031\u102c\u1000\u103a\u1001\u1036\u101b\u1019\u101a\u103a", en: "Prompt is longer than this model accepts and would be clipped" }
};
/* the app's needMin(n) \u2014 a count baked into the sentence */
function vidNeedMin(n) {
  return ff9({ my: "\u1015\u102f\u1036 \u1021\u1014\u100a\u103a\u1038\u1006\u102f\u1036\u1038 " + n + " \u1015\u102f\u1036 \u1011\u100a\u1037\u103a\u1015\u102b", en: "Add at least " + n + " reference image" + (n > 1 ? "s" : ""), shn: "\u1011\u1062\u1086\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 " + n + " \u1022\u1019\u103a\u1087\u101a\u103d\u1019\u103a\u1038", kac: "Sumla " + n + " n law law bang u", th: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e23\u0e39\u0e1b\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e19\u0e49\u0e2d\u0e22 " + n + " \u0e23\u0e39\u0e1b", zh: "\u81f3\u5c11\u6dfb\u52a0 " + n + " \u5f20\u53c2\u8003\u56fe\u7247", vi: "Th\u00eam \u00edt nh\u1ea5t " + n + " \u1ea3nh tham chi\u1ebfu", id: "Tambahkan minimal " + n + " gambar referensi", ms: "Tambah sekurang-kurangnya " + n + " imej rujukan" });
}
/* the app's need-note under the pickers: what this model wants for images */
/* v6.97.2 — the app's RH_DOWN_NOTE / rhDownLabel / rhFirstUpModel, verbatim in meaning: a
   model flagged down:"rh-301" in the lifted catalog stays listed but greyed, a stored pick of
   one falls back to the first model that answers, and generate refuses (see the DOWN note in
   panel/js/hnk_video_models.js). */
const RH_DOWN_NOTE = { my: "RunningHub ဘက် ပြဿနာ — ခေတ္တ မရသေးပါ", en: "RunningHub-side issue — temporarily unavailable", shn: "ပၼ်ႁႃ ၽၢႆႇ RunningHub — ယင်းပႆႇလႆႈ", kac: "RunningHub maga a mahkak — ya lang n lu shi", th: "ปัญหาฝั่ง RunningHub — ใช้ไม่ได้ชั่วคราว", zh: "RunningHub 侧问题 — 暂不可用", vi: "Sự cố phía RunningHub — tạm không dùng được", id: "Masalah di sisi RunningHub — sementara tidak tersedia", ms: "Masalah di pihak RunningHub — buat sementara tidak tersedia" };
function vidDownLabel(m) { return (m.label || m.id) + " \u2014 " + ff9(RH_DOWN_NOTE); }
function vidFirstUp() {
  const V = (globalThis.HNK && globalThis.HNK.runninghubVideo) || null;
  const list = V ? V.models() : [];
  for (let i = 0; i < list.length; i++) if (!list[i].down) return list[i];
  return list[0] || null;
}
/* v6.107.1 — MARK AN OPTION UNSELECTABLE WITHOUT DEPENDING ON option.disabled.

   The evidence points here. Of the panel's twenty pickers, `option.disabled`
   is written in exactly three places and all three belong to the video model
   picker: the family header rows, the greyed down models here, and the same
   two inside vidFillModels. Text→Img and Freeform — the two pickers the owner
   confirmed FULL on the same Photoshop that showed this one empty — never
   touch it. The down-model line has been there since 6.97.2, so it predates
   6.106.0, where the picker was already empty.

   That is the same shape of argument that found the remote <img>: the one
   structural thing the broken surface does that every working surface does
   not. And the panel has met a hostile `disabled` setter before — btnOff has
   wrapped it in a try/catch for that reason.

   So the property is attempted, never depended on: the attribute and a data
   flag carry the same meaning, and optIsOff reads whichever survived. If this
   renderer refuses the property, the picker still fills with all 188 models
   and only the grey is lost; if it refuses all three, the header rows become
   selectable rows that read "— Family (n) —" and vidPaintOptions falls back
   to a real model. Neither failure is an empty box. */
function optOff(o) {
  if (!o) return;
  try { o.disabled = true; } catch (e) { }
  try { if (o.setAttribute) o.setAttribute("disabled", "disabled"); } catch (e) { }
  try { if (o.setAttribute) o.setAttribute("data-off", "1"); } catch (e) { }
}
function optIsOff(o) {
  if (!o) return false;
  try { if (o.disabled) return true; } catch (e) { }
  try { if (o.getAttribute && o.getAttribute("data-off")) return true; } catch (e) { }
  return false;
}
function vidPaintDownOptions(sel) {
  const V = (globalThis.HNK && globalThis.HNK.runninghubVideo) || null;
  if (!sel || !V) return;
  for (let i = 0; i < sel.options.length; i++) {
    const o = sel.options[i], d = V.get(o.value);
    if (d && d.down) { optOff(o); const lab = vidDownLabel(d); o.text = lab; o.textContent = lab; o.setAttribute("data-down", d.down); }
  }
}
function vidNeedNote(m) {
  if (!m) return "";
  const min = m.minImages || 0, max = (m.maxImages == null) ? 1 : m.maxImages;
  if (max === 0) return ff9({ my: "\u1015\u102f\u1036 \u1019\u101c\u102d\u102f\u1015\u102b \u2014 prompt \u1010\u1005\u103a\u1001\u102f\u1010\u100a\u103a\u1038\u1014\u1032\u1037 \u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1011\u102f\u1010\u103a\u1015\u1031\u1038\u1015\u102b\u1010\u101a\u103a", en: "No image needed \u2014 this model generates from the prompt alone", shn: "\u1022\u1019\u103a\u1087\u101c\u1030\u101d\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 \u2014 prompt \u1022\u107c\u103a\u101c\u1035\u101d\u103a\u1075\u1031\u1083\u1088\u101c\u1086\u1088", kac: "Sumla n ra ai \u2014 prompt hte sha video galaw ya ai", th: "\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e43\u0e0a\u0e49\u0e23\u0e39\u0e1b \u2014 \u0e42\u0e21\u0e40\u0e14\u0e25\u0e19\u0e35\u0e49\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e08\u0e32\u0e01 prompt \u0e2d\u0e22\u0e48\u0e32\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27", zh: "\u65e0\u9700\u56fe\u7247 \u2014 \u8be5\u6a21\u578b\u4ec5\u51ed prompt \u751f\u6210\u89c6\u9891", vi: "Kh\u00f4ng c\u1ea7n \u1ea3nh \u2014 m\u00f4 h\u00ecnh n\u00e0y t\u1ea1o video ch\u1ec9 t\u1eeb prompt", id: "Tidak perlu gambar \u2014 model ini membuat video dari prompt saja", ms: "Tiada imej diperlukan \u2014 model ini menjana daripada prompt sahaja" });
  if (min === 0) return ff9({ my: "\u1015\u102f\u1036 \u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b \u1019\u1011\u100a\u1037\u103a\u101c\u100a\u103a\u1038\u101b \u2014 \u1021\u1019\u103b\u102c\u1038\u1006\u102f\u1036\u1038 " + max + " \u1015\u102f\u1036", en: "Images are optional \u2014 up to " + max, shn: "\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088 \u1022\u1019\u103a\u1087\u101e\u1082\u103a\u1087\u1075\u1031\u1083\u1088\u101c\u1086\u1088 \u2014 \u1011\u102d\u102f\u1004\u103a " + max, kac: "Sumla bang yang mai, n bang yang mai \u2014 " + max + " du hkra", th: "\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a \u2014 \u0e2a\u0e39\u0e07\u0e2a\u0e38\u0e14 " + max + " \u0e23\u0e39\u0e1b", zh: "\u56fe\u7247\u53ef\u9009 \u2014 \u6700\u591a " + max + " \u5f20", vi: "\u1ea2nh l\u00e0 t\u00f9y ch\u1ecdn \u2014 t\u1ed1i \u0111a " + max, id: "Gambar opsional \u2014 hingga " + max, ms: "Imej pilihan \u2014 sehingga " + max });
  if (min === max) return ff9({ my: "\u1015\u102f\u1036 " + min + " \u1015\u102f\u1036 \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a", en: "Needs " + min + " reference image" + (min > 1 ? "s" : ""), shn: "\u101c\u1030\u101d\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 " + min + " \u1022\u107c\u103a", kac: "Sumla " + min + " ra ai", th: "\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e39\u0e1b\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07 " + min + " \u0e23\u0e39\u0e1b", zh: "\u9700\u8981 " + min + " \u5f20\u53c2\u8003\u56fe\u7247", vi: "C\u1ea7n " + min + " \u1ea3nh tham chi\u1ebfu", id: "Butuh " + min + " gambar referensi", ms: "Perlukan " + min + " imej rujukan" });
  if (m.oddOnly) return ff9({ my: "\u1015\u102f\u1036 \u1041 \u1015\u102f\u1036 (\u101e\u102d\u102f\u1037) \u1043 \u1015\u102f\u1036 \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a \u2014 \u1042 \u1015\u102f\u1036 \u1019\u101b\u1015\u102b", en: "Needs 1 or 3 reference images \u2014 2 is not supported", shn: "\u101c\u1030\u101d\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 1 \u1022\u1019\u103a\u1087\u107c\u107c\u103a 3 \u2014 2 \u1022\u1019\u103a\u1087\u101c\u1086\u1088", kac: "Sumla sumla 1 nrai 3 ra ai \u2014 2 gaw n mai byin ai", th: "\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e39\u0e1b\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07 1 \u0e2b\u0e23\u0e37\u0e2d 3 \u0e23\u0e39\u0e1b \u2014 \u0e43\u0e0a\u0e49 2 \u0e23\u0e39\u0e1b\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49", zh: "\u9700\u8981 1 \u5f20\u6216 3 \u5f20\u53c2\u8003\u56fe\u7247 \u2014 \u4e0d\u652f\u6301 2 \u5f20", vi: "C\u1ea7n 1 ho\u1eb7c 3 \u1ea3nh tham chi\u1ebfu \u2014 kh\u00f4ng h\u1ed7 tr\u1ee3 2 \u1ea3nh", id: "Butuh 1 atau 3 gambar referensi \u2014 2 gambar tidak didukung", ms: "Perlukan 1 atau 3 imej rujukan \u2014 2 imej tidak disokong" });
  return ff9({ my: "\u1015\u102f\u1036 " + min + "-" + max + " \u1015\u102f\u1036 \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a", en: "Needs " + min + "-" + max + " reference images", shn: "\u101c\u1030\u101d\u103a\u1087\u1076\u1085\u1015\u103a\u1038\u1081\u1062\u1004\u103a\u1088 " + min + "-" + max, kac: "Sumla " + min + "-" + max + " ra ai", th: "\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e39\u0e1b\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07 " + min + "-" + max + " \u0e23\u0e39\u0e1b", zh: "\u9700\u8981 " + min + "-" + max + " \u5f20\u53c2\u8003\u56fe\u7247", vi: "C\u1ea7n " + min + "-" + max + " \u1ea3nh tham chi\u1ebfu", id: "Butuh " + min + "-" + max + " gambar referensi", ms: "Perlukan " + min + "-" + max + " imej rujukan" });
}

/* The app's brandOf(v, label) \u2192 IC tile, verbatim in order, for the 183-model
   video picker (the Freeform table above only knows the image models). */
function vidBrandOf(v, label) {
  const s = (String(v || "") + " " + String(label || "")).toLowerCase();
  const T = { gemini: "t-gemini", openai: "t-openai", rh: "t-rh", banana: "t-banana", qwen: "t-qwen", flux: "t-flux",
    wan: "t-wan", seed: "t-rh", up: "t-gold", spark: "t-gold" };
  let ic = "spark";
  if (/nano[- ]?banana/.test(s)) ic = "banana";
  else if (/gemini|^auto |model: auto/.test(s) || v === "auto") ic = "gemini";
  else if (/sora/.test(s)) ic = "openai";
  else if (/gpt|openai|dall/.test(s)) ic = "openai";
  else if (/qwen/.test(s)) ic = "qwen";
  else if (/kling/.test(s)) ic = "kling";
  else if (/vidu/.test(s)) ic = "vidu";
  else if (/veo/.test(s)) ic = "veo";
  else if (/minimax|hailuo/.test(s)) ic = "hailuo";
  else if (/pixverse/.test(s)) ic = "pixverse";
  else if (/\bltx/.test(s)) ic = "ltx";
  else if (/skyreels/.test(s)) ic = "skyreels";
  else if (/happyhorse|happy horse/.test(s)) ic = "horse";
  else if (/higgsfield/.test(s)) ic = "higgs";
  else if (/dreamactor/.test(s)) ic = "seed";
  else if (/volc/.test(s)) ic = "volc";
  else if (/flux/.test(s)) ic = "flux";
  else if (/^wan|wan[- ]image|wan[- ]2/.test(s)) ic = "wan";
  else if (/upscale|topaz/.test(s)) ic = "up";
  else if (/seedance/.test(s)) ic = "seed";
  else if (/seedream/.test(s)) ic = "seed";
  else if (/z-image/.test(s)) ic = "zimg";
  else if (/midjourney|youchuan/.test(s)) ic = "mj";
  else if (/grok/.test(s)) ic = "grokx";
  else if (/jimeng/.test(s)) ic = "seed";
  else if (/klein|krea|kontext|f-dev/.test(s)) ic = "flux";
  else if (/rh[- ]|rhart|imagine/.test(s)) ic = "rh";
  return { ic: ic, cls: T[ic] || "t-plain" };
}
/* the app's hueOf: a stable hue per family name for the letter tile */
function vidHueOf(s) {
  let h = 0;
  s = String(s || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
/* the app groups the picker by family; the family rides data-fam so the tile
   beside the picker can brand it without walking back up the DOM */
function vidFamOf(opt) {
  if (!opt) return "HNK";
  const p = opt.parentElement;
  const og = (p && p.tagName === "OPTGROUP") ? (p.label || "") : "";
  return (og || opt.getAttribute("data-fam") || "HNK").replace(/\s*\(\d+\)\s*$/, "");
}
/* v6.107.0 — FLAT, with a disabled header row per family.

   This was the panel's ONLY picker whose <option>s all sat inside an
   <optgroup>: measured on 6.106.0, #vidModel held 41 groups and ZERO direct
   option children, while all nineteen other selects hold their options
   directly. It is also the one picker the owner photographed empty in
   Photoshop. The old guard asked `typeof HTMLOptGroupElement !== "undefined"`,
   which only says the constructor exists — never that this renderer's
   <select> walks INTO a group for its options. Chromium flattens (the walk
   reads 188 options); a renderer that reads only its direct children reads
   none, and draws an empty box.

   A disabled "— Family (n) —" option carries the same grouping in any
   renderer, costs one row per family, and cannot be chosen. The family still
   rides data-fam, so vidFamOf and the brand tile are unchanged. */
function vidFillModels(sel, list) {
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  const fams = [], byFam = {};
  list.forEach(function (m) {
    const f = m.fam || "HNK";
    if (!byFam[f]) { byFam[f] = []; fams.push(f); }
    byFam[f].push(m);
  });
  fams.forEach(function (f) {
    const lab = f + " (" + byFam[f].length + ")";
    const head = mkOption("", "— " + lab + " —");
    optOff(head);                              /* v6.107.1 — never depends on option.disabled */
    head.setAttribute("data-fam-head", "1");
    sel.appendChild(head);
    byFam[f].forEach(function (m) {
      const o = mkOption(m.id, m.down ? vidDownLabel(m) : (m.label || m.id));
      if (m.down) { optOff(o); o.setAttribute("data-down", m.down); }   /* v6.97.2 — greyed, still listed */
      o.setAttribute("data-fam", lab);
      sel.appendChild(o);
    });
  });
  /* a header row is disabled but is still option 0, so a renderer that selects
     the first option would leave the picker showing "— Family (n) —" and the
     value empty. Land on the first real model instead. */
  if (!sel.value) { const first = vidFirstSelectable(sel); if (first) { try { sel.value = first; } catch (e) { } } }
}
function vidFirstSelectable(sel) {
  const opts = sel.options || [];
  /* v6.107.1 — optIsOff, not .disabled: on a renderer that refused the
     property the header rows carry only the attribute, and a picker that
     landed on "— Family (n) —" would submit an empty model id. */
  for (let i = 0; i < opts.length; i++) if (!optIsOff(opts[i]) && opts[i].value) return opts[i].value;
  return "";
}
/* app iconFor(selVidModel): a brand tile when the family has one, else the
   family's initial on a hue the family name hashes to */
function vidPaintModelBtn() {
  const sel = $("vidModel");
  if (!sel) return;
  const opt = (sel.options && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex] : null;
  const label = opt ? String(opt.textContent || "") : "\u2014";
  const fam = vidFamOf(opt);
  const v = $("vidModelVal"); if (v) v.textContent = label;
  const tile = $("vidModelTile"), gl = $("vidModelGlyph");
  if (!tile) return;
  const b = vidBrandOf(sel.value, fam + " " + label);
  let mono = tile.querySelector(".hsl-mono");
  if (b.ic !== "spark") {
    tile.className = "hsl-tile " + b.cls;
    tile.style.background = "";
    if (gl) { gl.style.display = ""; gl.src = "icons/ui/brand-" + b.ic + ".png"; }
    if (mono) tile.removeChild(mono);
  } else {
    const hue = vidHueOf(fam);
    tile.className = "hsl-tile";
    tile.style.background = "radial-gradient(120% 120% at 20% 15%, hsl(" + hue + ", 38%, 26%) 0%, hsl(" + hue + ", 42%, 15%) 70%)";
    if (gl) gl.style.display = "none";
    if (!mono) { mono = document.createElement("span"); mono.className = "hsl-mono"; tile.appendChild(mono); }
    mono.textContent = fam.charAt(0).toUpperCase();
    mono.style.color = "hsl(" + hue + ", 72%, 68%)";
  }
}
/* app syncVis: a picker whose select is hidden hides with it */
function vidPaintHsl() {
  ffPaintHslVal("vidRes", "vidResVal");
  ffPaintHslVal("vidDur", "vidDurVal");
  [["vidRes", "vidResHsl"], ["vidDur", "vidDurHsl"]].forEach(function (p) {
    const sel = $(p[0]), w = $(p[1]);
    if (sel && w) w.className = "hsl" + (sel.style.display === "none" ? " hsl-off" : "");
  });
}
/* v6.56.0 — the Video page's ratio rail, the app's own control. The value
   lives on the hidden #vidAspect the submit already reads, so a tap here is
   the same pick the dropdown used to make — only now the student can see the
   shape of the shot they are asking for. Nothing to persist: the panel's
   Video page restores its model, resolution and duration from the shot card,
   not from settings, and the ratio follows them. */
function vidPaintRail() {
  paintRatioRail("vidRatioRail", "vidAspect", function () { vidPaintRail(); });
}

/* the app's updateVidModelUI: the model owns the Res / Duration / Ratio
   lists, the prompt cap and the image note */
function vidPaintOptions() {
  /* v6.97.2 — a stored pick of a greyed model falls back to the first model that answers */
  const sel0 = $("vidModel"), V0 = (globalThis.HNK && globalThis.HNK.runninghubVideo) || null;
  const raw = (sel0 && V0) ? V0.get(sel0.value) : null;
  if (raw && raw.down) { const up = vidFirstUp(); if (up) { sel0.value = up.id; try { setStatus((raw.label || raw.id) + " \u2014 " + ff9(RH_DOWN_NOTE) + " \u2192 " + (up.label || up.id), "err"); } catch (e) { } } }
  vidPaintDownOptions(sel0);
  const m = vidDef();
  const res = $("vidRes"), dur = $("vidDur"), asp = $("vidAspect");
  if (res) {
    const prior = res.value;
    const list = (m && m.resolutions) || [];
    while (res.firstChild) res.removeChild(res.firstChild);
    list.forEach(function (r) { res.appendChild(mkOption(String(r), "Res: " + r)); });
    if (list.indexOf(prior) >= 0) res.value = prior;
    res.style.display = list.length ? "" : "none";
  }
  if (dur) {
    const prior = dur.value;
    const list = ((m && m.durations) || []).map(String);
    while (dur.firstChild) dur.removeChild(dur.firstChild);
    list.forEach(function (d) { dur.appendChild(mkOption(d, (d === "-1" || d === "auto") ? "Auto" : d + "s")); });
    if (list.indexOf(prior) >= 0) dur.value = prior;
    dur.style.display = list.length ? "" : "none";
  }
  if (asp) {
    if (m && m.aspects && m.aspects.length) {
      const prior = asp.value;
      while (asp.firstChild) asp.removeChild(asp.firstChild);
      m.aspects.forEach(function (a) { asp.appendChild(mkOption(String(a), String(a))); });
      if (m.aspects.indexOf(prior) >= 0) asp.value = prior;
    }
    asp.style.display = (m && m.aspect) ? "" : "none";
    /* v6.56.0 — the rail is the visible control (the select is .rr-native, as
       in the app), and it comes and goes with the model's own aspect support */
    const vrail = $("vidRatioRail");
    if (vrail) vrail.style.display = (m && m.aspect) ? "flex" : "none";
    vidPaintRail();
  }
  const box = $("vidPromptP");
  if (box) { try { box.maxLength = (m && m.promptMax) || 800; } catch (e) { } }
  vidPaintModelBtn();
  vidPaintHsl();
  /* the prompt cap belongs to the model, so the counter follows the picker */
  try { vidPaintPromptCount(); } catch (e) { }
  const note = $("vidNeedNote"); if (note) note.textContent = vidNeedNote(m);
}

/* ============================================================
   v6.50.0 — THE APP'S VIDEO WORKFLOW SHELF, on the panel's Video page.

   The web app opens Media Lab ▸ Video on 29 ready-made shots — Boarding Pass
   Travel, Dress Spin, Veil in the Wind, the ten makeup fast-cuts — because
   asking a studio to invent a ten-second shot description from an empty box
   is the one page in the app that used to do that. The panel had the empty
   box and nothing else. These are the app's own cards, its own art and its
   own prompts (panel/js/hnk_video_wf_data.js, lifted verbatim), rendered
   with the same .wfgrid/.wfmini component the Workflows page uses.

   A tap writes the prompt AND the model, resolution, duration and aspect the
   card was authored for — model first, because painting the model rebuilds
   the resolution and duration lists and would wipe a value written before it.
   ============================================================ */
const VID_ART_BASE = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/app/";
/* v6.107.0 — every remote picture goes through HNK.remoteArt (fetch → data:
   URL), the path the Library has used on this renderer since 6.47.1. The
   owner's 6.106.0 Photoshop drew the two cards whose art ships inside the
   plugin and left every remote one as an empty box — and fired NO error, so
   the im.onerror fallbacks below never ran. A fetch fails out loud, so the
   fallback finally happens and the Setup self-test can count it. */
function vidArtSrc(w) {
  const W = globalThis.HNK && globalThis.HNK.videoToolWorkflows;
  return VID_ART_BASE + ((W && typeof W.libArt === "function") ? W.libArt(w.art) : w.art);
}
function pnlArt(im, url, onFail) {
  const ra = globalThis.HNK && globalThis.HNK.remoteArt;
  if (ra) ra.paint(im, url, onFail);
  else { im.onerror = onFail || null; im.src = url; }
}
/* the app's own three card labels for this shelf, its nine-language maps
   carried verbatim (the panel's I18N table stays untouched) */
/* v6.21.0 — the badge follows the card's model, as the app's does: an array image
   field with room for more says "1–N photos"; a single frame says "1 photo". */
function vwRefMax(id) {
  const ms = (globalThis.HNK && globalThis.HNK.videoModels) || [];
  const m = ms.find(function (x) { return x.id === id; }); const ip = (m && m.imageParam) || "";
  return (/Urls$|Images$|keyframes/.test(ip) && ((m && m.maxImages) | 0) > 1) ? m.maxImages : 1;
}
function vwNeedFor(w) {
  const id = (w && w.setup && w.setup.model) || ((vidDef() || {}).id) || "";   /* the panel's page select is vidModel */
  const mx = vwRefMax(id);
  return mx > 1 ? vwL({ my: "၁–" + accNum(mx) + " ပုံ", en: "1–" + mx + " photos", shn: "1–" + mx + " ၶႅပ်း", kac: "Sumla 1–" + mx, th: "1–" + mx + " รูป", zh: "1–" + mx + " 张", vi: "1–" + mx + " ảnh", id: "1–" + mx + " foto", ms: "1–" + mx + " foto" }) : vwL(VW_NEED);
}
/* v6.21.0 — the app's REF_BASE / vidRefMax / vidSlotsShown on the panel's own slots:
   IMG 1 = state.subj, IMG 2/3 = state.refs, IMG 4+ = state.vidRefs. */
const VREF_BASE = 3;
const FACE_L = { my: "မျက်နှာ", en: "face", shn: "ၼႃႈ", kac: "myi man", th: "ใบหน้า", zh: "人脸", vi: "mặt", id: "wajah", ms: "wajah" };
function vidRefMaxP() { const m = vidDef(); return vwRefMax((m && m.id) || ""); }
function vidSlotsShownP(mx) { /* the base three, then the filled extras plus one empty */
  const ex = state.vidRefs || []; let last = -1; for (let k = 0; k < ex.length; k++) if (ex[k]) last = k;
  return Math.min(mx, VREF_BASE + last + 2);
}
/* v6.26.0 — the app's ffRefMax / ffSlotsShown / ffAllRefs: Freeform's reference slots follow the IMAGE model's
   MEASURED photo capacity (runninghub-config maxImages, from the probe lane). Single-image kinds stay at one; a
   node graph with an ordered image list takes exactly that many; the extras are the same IMG 4+ state.vidRefs. */
function ffRefMaxP(m) {
  m = m || rhDefaultModels()[state.rhModel] || null; if (!m) return VREF_BASE;
  const k = m.kind || "", ip = m.imageParam || "imageUrls";
  if (ip === "image" || ip === "imageUrl" || k === "fluxedit" || k === "zimage" || k === "grokimg" || k === "sdlayer" || k === "upscale" || k === "upscale-transparent" || (k === "node" && !(m.node && m.node.images))) return 1;
  if (k === "node" && m.node && m.node.images) return m.node.images.length;
  return (m.maxImages | 0) > 0 ? m.maxImages : VREF_BASE;
}
function ffSlotsShownP(mx) { const ex = state.vidRefs || []; let last = -1; for (let k = 0; k < ex.length; k++) if (ex[k]) last = k; return Math.max(Math.min(mx, VREF_BASE + last + 2), VREF_BASE); }
function ffExtraRefs() { const out = []; const mx = ffRefMaxP(); for (let k = VREF_BASE; k < mx; k++) { const r = ffSlotGet(k); if (r) out.push(r); } return out; }
function ffCapLabelP(m) { const mx = ffRefMaxP(m); let nx = String(mx); try { nx = accNum(mx); } catch (e0) { } return mx > 1 ? vwL({ my: "ပုံ " + nx + " ပုံအထိ", en: "up to " + mx + " photos", shn: "ထိုင် " + mx + " ၶႅပ်း", kac: "Sumla " + mx + " du hkra", th: "สูงสุด " + mx + " รูป", zh: "最多 " + mx + " 张", vi: "tối đa " + mx + " ảnh", id: "hingga " + mx + " foto", ms: "hingga " + mx + " foto" }) : vwL({ my: "ပုံ ၁ ပုံ", en: "1 photo", shn: "1 ၶႅပ်း", kac: "Sumla 1", th: "1 รูป", zh: "1 张", vi: "1 ảnh", id: "1 foto", ms: "1 foto" }); }
const VW_NEED = { my: "၁ ပုံ", en: "1 photo", shn: "1 ၶႅပ်း", kac: "Sumla 1", th: "1 รูป", zh: "1 张", vi: "1 ảnh", id: "1 foto", ms: "1 foto" };
const VW_USE = { my: "သုံးမယ်", en: "Use this", shn: "ၸႂ်ႉဢၼ်ၼႆႉ", kac: "Ndai lang u", th: "ใช้อันนี้", zh: "使用", vi: "Dùng cái này", id: "Pakai ini", ms: "Guna ini" };
const VW_SEL = { my: "ရွေးပြီး", en: "Selected", shn: "လိူၵ်ႈယဝ်ႉ", kac: "Lata da sai", th: "เลือกแล้ว", zh: "已选择", vi: "Đã chọn", id: "Terpilih", ms: "Dipilih" };
function vwL(m) { return (m && m[state.lang] != null) ? m[state.lang] : ((m && m.en) || ""); }
let vidWfActive = null;
let vidWfCity = null;

function vidWfPack() { return (globalThis.HNK && globalThis.HNK.videoWorkflows) || null; }

function vidWfApply(w) {
  const P = vidWfPack();
  if (!P || !w) return;
  vidWfActive = w.key;
  const setup = w.setup || {};
  const sm = $("vidModel");
  if (setup.model && sm) { try { sm.value = setup.model; } catch (e) { } vidPaintOptions(); renderRefs(); }   /* v6.21.0 — the strip follows the card's model */
  if (setup.res) { const e = $("vidRes"); if (e) { try { e.value = setup.res; } catch (x) { } } }
  if (setup.dur) { const e = $("vidDur"); if (e) { try { e.value = String(setup.dur); } catch (x) { } } }
  if (setup.aspect) { const e = $("vidAspect"); if (e) { try { e.value = setup.aspect; } catch (x) { } } }
  /* the card wrote the value straight onto the select, so the rail has to be
     told — the app nudges its own rail with a change event for the same
     reason (mlApply). Without this the chosen shape stays unlit. */
  vidPaintRail();
  vidPaintHsl();
  const box = $("vidPromptP");
  if (box) {
    box.value = w.cities ? w.text(P.cityDef(vidWfCity)) : w.text();
    vidPaintPromptCount();
  }
  renderVidWf();
  const m = vidDef();
  if (box && m && box.value.length > (m.promptMax || 800)) {
    /* the submit path clips silently — the app says so here instead */
    setStatus(ff9(VID_L.clipped), "err");
  }
  setStatus(stripIcn(P.tr(w.label)) + " ✓", "ok");
}

function vidPaintPromptCount() {
  const box = $("vidPromptP"), out = $("vidPromptCount");
  if (!box || !out) return;
  const d = vidDef();
  const max = (d && d.promptMax) || 800;
  const n = (box.value || "").length;
  out.textContent = n + " / " + max;
}

/* the app's vidWfCard: .wfmini > .wfv (img + .wf-need), .t, .s, .go — the
   card survives its photograph going missing (the art is the nicety, the
   workflow is the product) */
function vidWfCard(w) {
  const P = vidWfPack();
  const m = mkBtn("wfmini" + (vidWfActive === w.key ? " on" : ""));
  const v = document.createElement("div");
  v.className = "wfv";
  const im = document.createElement("img");
  im.loading = "eager";
  im.alt = P ? stripIcn(P.tr(w.label)) : "";
  /* v6.7.4 — a replaced picture carries its own revision, so neither the
     panel's HTTP cache nor a proxy can serve last month's card */
  pnlArt(im, vidArtSrc(w), function () {
    v.className = "wfv wfv-noart";
    try { v.removeChild(im); } catch (e) { }
  });
  v.appendChild(im);
  const need = document.createElement("span");
  need.className = "wf-need";
  need.textContent = vwNeedFor(w);   /* v6.21.0 */
  v.appendChild(need);
  m.appendChild(v);
  const ti = document.createElement("div"); ti.className = "t"; ti.textContent = P ? stripIcn(P.tr(w.label)) : ""; m.appendChild(ti);
  const su = document.createElement("div"); su.className = "s"; su.textContent = P ? stripIcn(P.tr(w.summary)) : ""; m.appendChild(su);
  const go = document.createElement("div"); go.className = "go";
  go.appendChild(ffIcon("i-caret", "hi"));
  go.appendChild(document.createTextNode(vwL(vidWfActive === w.key ? VW_SEL : VW_USE)));
  m.appendChild(go);
  /* v6.14.0 — the tap applies the card to the page AND opens its step-by-step wizard */
  m.addEventListener("click", function () { vidWfApply(w); openVWiz("i2v", w); });
  return m;
}

function renderVidWf() {
  const host = $("vidWfRow");
  const P = vidWfPack();
  if (!host || !P) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  P.WF.forEach(function (w) { host.appendChild(vidWfCard(w)); });
  /* the app widens the last card of an odd shelf so the grid has no hole */
  if (P.WF.length % 2 === 1 && host.lastChild && clsOf(host.lastChild))
    host.lastChild.className = clsOf(host.lastChild) + " wf-span2";

  const w = vidWfActive ? P.byKey(vidWfActive) : null;
  const opts = $("vidWfOpts");
  if (opts) opts.style.display = (w && w.cities) ? "block" : "none";
  const hint = $("vidWfHint");
  if (hint) hint.textContent = w ? stripIcn(P.tr(w.hint)) : ff9(VID_L.introHint);
  const head = $("vidWfCityH");
  if (head) head.textContent = ff9(VID_L.cityH);
  const crow = $("vidWfCityRow");
  if (crow) {
    while (crow.firstChild) crow.removeChild(crow.firstChild);
    if (w && w.cities) {
      P.CITIES.forEach(function (ct) {
        const b = mkBtn("chip" + (vidWfCity === ct.k ? " on" : ""));
        b.textContent = (state.lang === "my" ? ct.my : ct.en) + " · " + ct.loc;
        b.addEventListener("click", function () {
          vidWfCity = ct.k;
          /* re-compose rather than string-patch: the city appears in three
             different places in the prompt */
          const cur = P.byKey(vidWfActive);
          const box = $("vidPromptP");
          if (cur && cur.cities && box) { box.value = cur.text(ct); vidPaintPromptCount(); }
          renderVidWf();
        });
        crow.appendChild(b);
      });
    }
  }
}

/* the app's own copy for both halves of the VidUp page (its L9 blocks) */
const VU_L = {
  intro: { my: "\u101b\u103e\u102d\u1015\u103c\u102e\u1038\u101e\u102c\u1038 \u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1016\u102d\u102f\u1004\u103a\u1000\u102d\u102f resolution \u1019\u103c\u103e\u1004\u1037\u103a\u1015\u1031\u1038\u1019\u101a\u103a \u2014 RunningHub Enterprise key \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a\u104b",
    en: "Upscale an existing video file to a higher resolution \u2014 needs your RunningHub Enterprise key.",
    shn: "\u1081\u1035\u1010\u103a\u1038\u1081\u1082\u103a\u1088\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u1022\u107c\u103a\u1019\u102e\u1038\u101a\u1030\u1087 resolution \u101e\u102f\u1004\u103a\u1076\u102d\u102f\u107c\u103a\u1088 \u2014 \u101c\u1030\u101d\u103a\u1087 RunningHub Enterprise key",
    kac: "Video nga ai hpe resolution grau na ni galaw ai \u2014 RunningHub Enterprise key ra ai",
    th: "\u0e2d\u0e31\u0e1b\u0e2a\u0e40\u0e01\u0e25\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e2b\u0e49\u0e21\u0e35\u0e04\u0e27\u0e32\u0e21\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e2a\u0e39\u0e07\u0e02\u0e36\u0e49\u0e19 \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35 RunningHub Enterprise key",
    zh: "\u628a\u73b0\u6709\u89c6\u9891\u63d0\u5347\u5230\u66f4\u9ad8\u5206\u8fa8\u7387 \u2014 \u9700\u8981\u4f60\u7684 RunningHub Enterprise key",
    vi: "N\u00e2ng c\u1ea5p \u0111\u1ed9 ph\u00e2n gi\u1ea3i c\u1ee7a video c\u00f3 s\u1eb5n \u2014 c\u1ea7n key RunningHub Enterprise",
    id: "Tingkatkan resolusi video yang ada \u2014 perlu RunningHub Enterprise key",
    ms: "Tingkatkan resolusi video sedia ada \u2014 perlukan RunningHub Enterprise key" },
  pick: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1016\u102d\u102f\u1004\u103a \u101b\u103d\u1031\u1038\u101b\u1014\u103a (MP4)", en: "Pick a video file (MP4)", shn: "\u1011\u1062\u1086\u1087\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088 (MP4)",
    kac: "Video langai tawn shangun (MP4)", th: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d (MP4)", zh: "\u9009\u62e9\u89c6\u9891\u6587\u4ef6\uff08MP4\uff09",
    vi: "Ch\u1ecdn t\u1ec7p video (MP4)", id: "Pilih file video (MP4)", ms: "Pilih fail video (MP4)" },
  format: { my: "MP4 \u1016\u102d\u102f\u1004\u103a\u1015\u1032 \u101b\u1015\u102b\u1010\u101a\u103a \u2014 iPhone \u101b\u1032\u1037 .mov \u101c\u102d\u102f\u1019\u103b\u102d\u102f\u1038 \u1010\u1001\u103c\u102c\u1038 format \u1006\u102d\u102f\u101b\u1004\u103a \u1021\u101b\u1004\u103a MP4 \u1015\u103c\u1031\u102c\u1004\u103a\u1038\u1015\u1031\u1038\u1015\u102b",
    en: "MP4 only \u2014 other formats (like an iPhone's .mov) need converting to MP4 first",
    shn: "\u101c\u1086\u1088\u101e\u1019\u103a\u1089 MP4 \u1075\u1030\u107a\u103a\u1038 \u2014 format \u1022\u107c\u103a\u107d\u102d\u1010\u103a\u1038\u1075\u107c\u103a (iPhone .mov \u1078\u102d\u1030\u101d\u103a\u1038\u107c\u1086\u1089) \u101c\u1030\u101d\u103a\u1087\u101c\u1085\u1075\u103a\u1088\u1015\u1035\u107c\u103a MP4 \u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038",
    kac: "MP4 sha ra ai \u2014 iPhone .mov nga ai zawn re gaw MP4 hku shawng galai ra ai",
    th: "\u0e23\u0e31\u0e1a\u0e40\u0e09\u0e1e\u0e32\u0e30 MP4 \u2014 \u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e2d\u0e37\u0e48\u0e19 (\u0e40\u0e0a\u0e48\u0e19 .mov \u0e02\u0e2d\u0e07 iPhone) \u0e15\u0e49\u0e2d\u0e07\u0e41\u0e1b\u0e25\u0e07\u0e40\u0e1b\u0e47\u0e19 MP4 \u0e01\u0e48\u0e2d\u0e19",
    zh: "\u4ec5\u652f\u6301 MP4 \u2014 \u5176\u4ed6\u683c\u5f0f\uff08\u5982 iPhone \u7684 .mov\uff09\u9700\u8981\u5148\u8f6c\u6362\u4e3a MP4",
    vi: "Ch\u1ec9 h\u1ed7 tr\u1ee3 MP4 \u2014 \u0111\u1ecbnh d\u1ea1ng kh\u00e1c (nh\u01b0 .mov c\u1ee7a iPhone) c\u1ea7n chuy\u1ec3n sang MP4 tr\u01b0\u1edbc",
    id: "Hanya MP4 \u2014 format lain (seperti .mov iPhone) perlu dikonversi ke MP4 dulu",
    ms: "MP4 sahaja \u2014 format lain (seperti .mov iPhone) perlu ditukar ke MP4 dahulu" },
  need: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1016\u102d\u102f\u1004\u103a \u1010\u1005\u103a\u1001\u102f \u101b\u103d\u1031\u1038\u101b\u1015\u102b\u1019\u101a\u103a", en: "You'll need to pick a video file",
    shn: "\u101c\u1030\u101d\u103a\u1087\u1011\u1062\u1086\u1087\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038", kac: "Video langai tawn shangun ra ai",
    th: "\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e01\u0e48\u0e2d\u0e19", zh: "\u9700\u8981\u5148\u9009\u62e9\u4e00\u4e2a\u89c6\u9891\u6587\u4ef6", vi: "B\u1ea1n c\u1ea7n ch\u1ecdn m\u1ed9t t\u1ec7p video",
    id: "Anda perlu memilih file video", ms: "Anda perlu pilih fail video" },
  /* the panel's own line: Photoshop writes the finished clip to disk */
  out: { my: "\u101e\u102d\u1019\u103a\u1038\u1019\u101a\u1037\u103a folder \u101b\u103d\u1031\u1038\u101b\u1014\u103a", en: "Choose the save folder", shn: "\u101c\u102d\u1030\u1075\u103a\u1088 folder \u101e\u102d\u1019\u103a\u1038",
    kac: "Save folder lata u", th: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01", zh: "\u9009\u62e9\u4fdd\u5b58\u6587\u4ef6\u5939",
    vi: "Ch\u1ecdn th\u01b0 m\u1ee5c l\u01b0u", id: "Pilih folder simpan", ms: "Pilih folder simpan" },
  needOut: { my: "\u101e\u102d\u1019\u103a\u1038\u1019\u101a\u1037\u103a folder \u1010\u1005\u103a\u1001\u102f \u101b\u103d\u1031\u1038\u101b\u1015\u102b\u1019\u101a\u103a", en: "You'll need to choose a save folder",
    shn: "\u101c\u1030\u101d\u103a\u1087\u101c\u102d\u1030\u1075\u103a\u1088 folder \u101e\u102d\u1019\u103a\u1038\u1022\u103d\u107c\u103a\u1010\u1062\u1004\u103a\u1038", kac: "Save folder langai lata ra ai",
    th: "\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e01\u0e48\u0e2d\u0e19", zh: "\u9700\u8981\u5148\u9009\u62e9\u4fdd\u5b58\u6587\u4ef6\u5939",
    vi: "B\u1ea1n c\u1ea7n ch\u1ecdn th\u01b0 m\u1ee5c l\u01b0u", id: "Anda perlu memilih folder simpan", ms: "Anda perlu pilih folder simpan" },
  /* v6.86.0 — the result box: the app's own three strings (vuResultH2, vuHistH, btnVuOpen — its arrow glyph is the panel's sprite) */
  resultH2: {my:"ရလဒ် (ဗီဒီယို)",en:"Result (video)",shn:"လွင်ႈဢွၵ်ႇမႃး (ဝီဒီရူဝ်ႈ)",kac:"Ah kyu (video)",th:"ผลลัพธ์ (วิดีโอ)",zh:"结果（视频）",vi:"Kết quả (video)",id:"Hasil (video)",ms:"Hasil (video)"},
  histH: {my:"လတ်တလော resolution မြှင့်ခဲ့တဲ့ ဗီဒီယိုများ (session အတွင်းပဲ)",en:"Recently upscaled videos (this session only)",shn:"ဝီဒီရူဝ်ႈဢၼ်ႁဵတ်း resolution သုင်ၶိုၼ်ႈဝႆႉမိူဝ်ႈလဵဝ်",kac:"Video resolution grau na ni galaw da ai (session sha)",th:"วิดีโออัปสเกลล่าสุด (เฉพาะเซสชันนี้)",zh:"最近提升分辨率的视频（仅本次会话）",vi:"Video vừa nâng cấp gần đây (chỉ trong phiên này)",id:"Video yang baru ditingkatkan (hanya sesi ini)",ms:"Video yang baru ditingkatkan (sesi ini sahaja)"},
  openLink: {my:"Direct Link ဖွင့်",en:"Open direct link",shn:"ပိုတ်ႇ Direct Link",kac:"Direct Link hpaw",th:"เปิดลิงก์โดยตรง",zh:"打开原始链接",vi:"Mở liên kết trực tiếp",id:"Buka tautan langsung",ms:"Buka pautan terus"}
};
const VT_L = {
  /* v6.4.0 — this surface's reference-photo slot: the app's own two strings
     for the button and for the warning when a tool demands a photograph the
     student has not picked yet (docs/app/index.html btnVtImgPick and the
     imageReq branch of updateVtModelUI). */
  pickImg: {my:"ပုံ ထည့်မယ်",en:"Add reference photo",shn:"သႂ်ႇၶႅပ်းႁၢင်ႈ",kac:"Sumla bang u",th:"เพิ่มรูปอ้างอิง",zh:"添加参考图片",vi:"Thêm ảnh tham chiếu",id:"Tambah foto referensi",ms:"Tambah foto rujukan"},
  needImg: {my:"ဒီ tool အတွက် ပုံ တစ်ပုံလည်း လိုပါတယ်",en:"This tool also needs a reference photo",shn:"Tool ၼႆႉလူဝ်ႇၶႅပ်းႁၢင်ႈထႅင်ႈ",kac:"Ndai tool gaw sumla mung ra ai",th:"เครื่องมือนี้ต้องใช้รูปอ้างอิงด้วย",zh:"此工具还需要一张参考图片",vi:"Công cụ này cũng cần một ảnh tham chiếu",id:"Alat ini juga butuh foto referensi",ms:"Alat ini juga perlukan foto rujukan"},
  /* v6.72.0 — the Video Smart Workflow deck's own two lines, the app's
     words exactly (docs/app/index.html #vtWfIntro and VT_WF_INTRO_HINT).
     Every other string the deck shows — label, summary, hint, the badge
     and the request itself — travels inside the lifted catalog. */
  wfIntro: {my:"ကတ်တစ်ချက် နှိပ်ရုံနဲ့ tool ရွေးပေးပြီး prompt ရေးပေးမယ်။ ပြီးရင် အောက်မှာ ဗီဒီယိုနဲ့ ပုံ တင်ပါ။",en:"One tap picks the tool and writes the request. Then upload your clip and your photo below.",shn:"ၼဵၵ်းၵၢတ်ႈဢၼ်ၼိုင်ႈ — တေလိူၵ်ႈ tool လႄႈတႅမ်ႈ prompt ပၼ်",kac:"Card langai mi hkan — tool lata nna prompt ka ya ai",th:"แตะการ์ดครั้งเดียว ระบบเลือกเครื่องมือและเขียน prompt ให้ แล้วอัปโหลดคลิปกับรูปด้านล่าง",zh:"点一下卡片即可选好工具并写好 prompt，然后在下方上传视频与照片",vi:"Một chạm chọn công cụ và viết prompt. Sau đó tải clip và ảnh lên bên dưới",id:"Sekali tap memilih alat dan menulis prompt. Lalu unggah klip dan foto di bawah",ms:"Satu ketikan memilih alat dan menulis prompt. Kemudian muat naik klip dan foto di bawah"},
  wfIntroHint: {my:"ကတ်တစ်ခု ရွေးပါ — ဒါမှမဟုတ် အောက်မှာ tool ကို ကိုယ်တိုင် ရွေးပါ။",en:"Pick a card — or choose a tool yourself below.",shn:"လိူၵ်ႈၵၢတ်ႈဢၼ်ၼိုင်ႈ — ဢမ်ႇၼၼ် လိူၵ်ႈ tool ႁင်းၵူၺ်း",kac:"Card langai lata u — nrai npu de tool nang lata u",th:"เลือกการ์ดสักใบ — หรือเลือกเครื่องมือเองด้านล่าง",zh:"选择一张卡片 — 或在下方自行选择工具",vi:"Chọn một thẻ — hoặc tự chọn công cụ bên dưới",id:"Pilih kartu — atau pilih alat sendiri di bawah",ms:"Pilih kad — atau pilih alat sendiri di bawah"},
  intro: { my: "\u101b\u103e\u102d\u1015\u103c\u102e\u1038\u101e\u102c\u1038 \u1017\u102e\u1012\u102e\u101a\u102d\u102f\u1000\u102d\u102f \u1015\u103c\u1004\u103a\u1019\u101a\u103a/\u1006\u1000\u103a\u1019\u101a\u103a/\u101e\u1014\u1037\u103a\u1019\u101a\u103a \u2014 model \u1010\u1005\u103a\u1001\u102f\u101b\u103d\u1031\u1038\u1015\u103c\u102e\u1038 \u1017\u102e\u1012\u102e\u101a\u102d\u102f\u1016\u102d\u102f\u1004\u103a \u1010\u1004\u103a\u1015\u102b\u104b RunningHub Enterprise key \u101c\u102d\u102f\u1021\u1015\u103a\u1015\u102b\u1010\u101a\u103a\u104b",
    en: "Edit, extend or clean an existing video \u2014 pick a tool, upload the clip. Needs your RunningHub Enterprise key.",
    shn: "\u1019\u1084\u1038\u1076\u102d\u102f\u107c\u103a\u1038/\u101e\u102d\u102f\u1015\u103a\u1087/\u101e\u102f\u1075\u103a\u1088\u101e\u1085\u1004\u103a\u1087 \u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088\u1022\u107c\u103a\u1019\u102e\u1038\u101a\u1030\u1087",
    kac: "Video nga ai hpe galaw/madung/san seng \u2014 tool langai lata nna video bang u",
    th: "\u0e41\u0e01\u0e49\u0e44\u0e02 \u0e15\u0e48\u0e2d \u0e2b\u0e23\u0e37\u0e2d\u0e1b\u0e23\u0e31\u0e1a\u0e1b\u0e23\u0e38\u0e07\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2d\u0e22\u0e39\u0e48 \u2014 \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e21\u0e37\u0e2d\u0e41\u0e25\u0e49\u0e27\u0e2d\u0e31\u0e1b\u0e42\u0e2b\u0e25\u0e14\u0e04\u0e25\u0e34\u0e1b",
    zh: "\u7f16\u8f91\u3001\u5ef6\u957f\u6216\u4fee\u590d\u73b0\u6709\u89c6\u9891 \u2014 \u9009\u62e9\u5de5\u5177\u5e76\u4e0a\u4f20\u89c6\u9891",
    vi: "Ch\u1ec9nh s\u1eeda, k\u00e9o d\u00e0i ho\u1eb7c l\u00e0m s\u1ea1ch video c\u00f3 s\u1eb5n \u2014 ch\u1ecdn c\u00f4ng c\u1ee5 r\u1ed3i t\u1ea3i video l\u00ean",
    id: "Edit, perpanjang, atau bersihkan video yang ada \u2014 pilih alat lalu unggah klip",
    ms: "Edit, panjangkan atau bersihkan video sedia ada \u2014 pilih alat dan muat naik klip" },
  pick: { my: "\u1017\u102e\u1012\u102e\u101a\u102d\u102f \u1016\u102d\u102f\u1004\u103a \u101b\u103d\u1031\u1038\u1019\u101a\u103a (MP4)", en: "Pick a video file (MP4)", shn: "\u1011\u1062\u1086\u1087\u107e\u1062\u1086\u1087\u101d\u102e\u1012\u102e\u101b\u1030\u101d\u103a\u1088 (MP4)",
    kac: "Video file lata u (MP4)", th: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d (MP4)", zh: "\u9009\u62e9\u89c6\u9891\u6587\u4ef6 (MP4)",
    vi: "Ch\u1ecdn t\u1ec7p video (MP4)", id: "Pilih file video (MP4)", ms: "Pilih fail video (MP4)" },
  /* the app's own words for this box. The panel had said the same thing in
     different Burmese, Shan, Kachin and Vietnamese — a difference no
     string-count test could see, because both surfaces have exactly one
     placeholder here and a placeholder is an attribute, not a text node. */
  /* v6.6.3 — said before the money moves, not after the endpoint refuses */
  container: {my:"ဒီ tool က {L} ဖိုင်ပဲ ရပါတယ်",en:"This tool takes {L} only",shn:"Tool ၼႆႉ လႆႈ {L} ၵူၺ်း",kac:"Ndai tool gaw {L} sha la ai",th:"เครื่องมือนี้รับเฉพาะ {L}",zh:"此工具仅支持 {L}",vi:"Công cụ này chỉ nhận {L}",id:"Alat ini hanya menerima {L}",ms:"Alat ini hanya menerima {L}"},
  promptPh: { my: "Prompt (\u1011\u100a\u1037\u103a\u1001\u103b\u1004\u103a\u1019\u103e\u1011\u100a\u1037\u103a)", en: "Prompt (optional)", shn: "Prompt (\u101e\u1004\u103a\u1121\u101c\u1088\u1088\u1037\u1088)",
    kac: "Prompt (nkau)", th: "Prompt (\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a)", zh: "Prompt\uff08\u53ef\u9009\uff09",
    vi: "Prompt (t\u00f9y ch\u1ecdn)", id: "Prompt (opsional)", ms: "Prompt (pilihan)" },
  /* v6.85.0 — the result box this page never had: the app's own three
     strings (docs/app/index.html vtResultH2, btnVtOpen, vtHistH) and the
     panel's one line about the file it wrote, which a browser has no need of. */
  resultH2: {my:"ရလဒ် (ဗီဒီယို)",en:"Result (video)",shn:"လွင်ႈဢွၵ်ႇမႃး (ဝီဒီရူဝ်ႈ)",kac:"Ah kyu (video)",th:"ผลลัพธ์ (วิดีโอ)",zh:"结果（视频）",vi:"Kết quả (video)",id:"Hasil (video)",ms:"Hasil (video)"},
  openLink: {my:"Direct Link ဖွင့်မယ်",en:"Open Direct Link",shn:"ပိုတ်ႇ Direct Link",kac:"Direct Link hpaw u",th:"เปิดลิงก์ตรง",zh:"打开直链",vi:"Mở liên kết trực tiếp",id:"Buka tautan langsung",ms:"Buka pautan terus"},
  histH: {my:"ဒီစာမျက်နှာက ထုတ်ခဲ့တဲ့ ဗီဒီယိုများ — ကိုယ်တိုင် မဖျက်မချင်း ကျန်နေပါမယ်",en:"Videos this page made — they stay until you delete them",shn:"ဝီဒီရူဝ်ႈဢၼ်ႁဵတ်းဝႆႉ — တေမီးၵႂႃႇတေႃႇထိုင်ၸဝ်ႈၵဝ်ႇလုပ်ႇ",kac:"Ndai shara galaw da ai video ni — nang mat kau ai laning du hkra naw nga na",th:"วิดีโอที่หน้านี้สร้างไว้ — อยู่จนกว่าคุณจะลบเอง",zh:"此页面生成的视频 — 在你亲自删除前都会保留",vi:"Video trang này đã tạo — vẫn còn cho tới khi bạn tự xoá",id:"Video yang dibuat halaman ini — tetap ada sampai Anda menghapusnya",ms:"Video yang dibuat halaman ini — kekal sehingga anda memadamnya"},
  savedTo: {my:"{F} အနေနဲ့ သိမ်းပြီးပါပြီ",en:"Saved as {F}",shn:"သိမ်းဝႆႉပဵၼ် {F}",kac:"{F} hku tawn da sai",th:"บันทึกเป็น {F} แล้ว",zh:"已保存为 {F}",vi:"Đã lưu thành {F}",id:"Tersimpan sebagai {F}",ms:"Disimpan sebagai {F}"},
  /* v6.86.0 — the folder the clip was written to, on every page's result box (the wizard's word, lifted) */
  openFolder: {my:"Folder ဖွင့်မယ်",en:"Open the folder",shn:"ပိုတ်ႇ folder",kac:"Folder hpaw u",th:"เปิดโฟลเดอร์",zh:"打开文件夹",vi:"Mở thư mục",id:"Buka folder",ms:"Buka folder"}
};

/* the app paints the file it holds and, when something is still missing, one
   warned line saying which \u2014 the panel's own save folder joins that line */
function renderVu() {
  const fn = $("vuFileName");
  if (fn) fn.textContent = VU.video ? VU.video.name : "";
  const on = $("vuOutName");
  if (on) on.textContent = VU.out ? (VU.out.name || "") : "";
  const need = $("vuNeedNote");
  if (need) {
    if (!VU.video) setIcnText(need, "i-warn", "hi", ff9(VU_L.need));
    else if (!VU.out) setIcnText(need, "i-warn", "hi", ff9(VU_L.needOut));
    else need.textContent = "";
  }
  const row = VU.rows && VU.rows[0];
  if (row) stSet("stVuGen", row.label + (row.detail ? " \u00b7 " + row.detail : ""), row.level === "err" ? "err" : row.level === "ok" ? "ok" : "");
}
function vuPaintLabels() {
  try { vidSendPaintP(); } catch (e) { }   /* 6.165.0 — the send row's words */
  const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
  set("vuIntro", ff9(VU_L.intro));
  set("vuFormatNote", ff9(VU_L.format));
  setIcnText($("btnVuPickP"), "i-clapper", "cream", ff9(VU_L.pick));
  setIcnText($("btnVuSave"), "i-folder", "cream", ff9(VU_L.out));
  set("vtIntro", ff9(VT_L.intro));
  setIcnText($("btnVtPick"), "i-clapper", "cream", ff9(VT_L.pick));
  setIcnText($("btnVtImgPick"), "i-frame", "cream", ff9(VT_L.pickImg));
  setIcnText($("btnVtSave"), "i-folder", "cream", ff9(VU_L.out));
  const pb = $("vtPrompt"); if (pb) pb.placeholder = ff9(VT_L.promptPh);
  /* v6.85.0 — the result box */
  set("vtResultH2", ff9(VT_L.resultH2));
  if (!vtDl.busy) setIcnText($("btnVtDl"), "i-download", "ink", ff9(VID_L.dl));
  setIcnText($("btnVtOpen"), "i-external", "cream", ff9(VT_L.openLink));
  set("vtHistH", ff9(VT_L.histH));
  setIcnText($("btnVtFolder"), "i-folder", "cream", ff9(VT_L.openFolder));   /* v6.86.0 */
  try { vtClearSyncP(); } catch (e) { }
  /* v6.86.0 — the Talking Photo and Video Upscale result boxes */
  try { tkTakes.labels(); vuTakes.labels(); } catch (e) { }
  renderVu(); renderVt(); renderVtWf();
}

/* ============================================================
   v6.50.0 — VIDEO TOOLS, where the app keeps them: the lower half of the
   VidUp page. Twenty-seven doc-verified endpoints that take an existing
   video — edit, extend, denoise, frame interpolation, subtitle erase, Topaz.
   The panel had none of them. Each tool's own option enums (and the Topaz
   width/height preset) come from its descriptor, exactly as the app builds
   them; nothing here authors an endpoint or a parameter.
   ============================================================ */
const VT = { video: null, img: null, out: null, busy: false, rows: [] };
function vtDef() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const sel = $("vtModel");
  return (V && V.getTool && sel) ? V.getTool(sel.value) : null;
}
/* v6.4.0 — the two picked files, SHOWN. A UXP file is a host-filesystem
   entry, not a browser File, so the bytes have to be read before anything can
   be drawn; both reads are cached on the entry so repainting the card does
   not re-read the disk. */
function vtThumbFor(entry, id, nameId, metaId, wrapId, isVideo) {
  const wrap = $(wrapId), el = $(id);
  if (!wrap || !el) return;
  if (!entry) {
    wrap.style.display = "none";
    if ($(nameId)) $(nameId).textContent = "";
    if ($(metaId)) $(metaId).textContent = "";
    clearSrc(el);
    return;
  }
  wrap.style.display = "";
  if ($(nameId)) $(nameId).textContent = entry.name || "";
  /* v6.77.0 — a <video> this renderer cannot play is hidden; the name and
     size lines beside it still say which clip was picked */
  if (isVideo && el.tagName === "VIDEO") { try { el.style.display = VIDEO_OK ? "" : "none"; } catch (e) { } }
  if (entry._url) {
    if (el.getAttribute("src") !== entry._url) el.setAttribute("src", entry._url);
    if ($(metaId) && !$(metaId).textContent) $(metaId).textContent = entry._size || "";
    return;
  }
  if (entry._reading) return;
  entry._reading = true;
  fileToDataUrl(entry).then(function (u) {
    entry._url = u;
    /* base64 is 4 characters per 3 bytes — near enough for a size line */
    const b64 = String(u).split(",")[1] || "";
    const bytes = Math.floor(b64.length * 3 / 4);
    entry._size = bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB"
      : bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : bytes + " B";
    entry._reading = false;
    renderVt();
    if (isVideo && el.tagName === "VIDEO") el.onloadedmetadata = function () {
      if ($(metaId) && isFinite(el.duration))
        $(metaId).textContent = Math.round(el.duration) + "s · " + entry._size;
    };
  }).catch(function () { entry._reading = false; });
}
/* the three slot names, word-for-word the web app's */
const SLOT_L = {
  video: {my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ ၁",kac:"Video 1",th:"วิดีโอ 1",zh:"视频 1",vi:"1 video",id:"1 video",ms:"1 video"},
  photo: {my:"ပုံ ၁",en:"1 photo",shn:"ၶႅပ်းႁၢင်ႈ ၁",kac:"Sumla 1",th:"รูป 1",zh:"图片 1",vi:"1 ảnh",id:"1 foto",ms:"1 foto"},
  audio: {my:"အသံ ၁",en:"1 recording",shn:"သဵင် ၁",kac:"Nsen 1",th:"เสียง 1",zh:"录音 1",vi:"1 bản ghi",id:"1 rekaman",ms:"1 rakaman"}
};
/* ---- v6.7.3 SLOT CHIPS — the web app's, in the panel ----
   The V→V deck names what a card needs ("1 video", "1 video + 1 face photo")
   and students read it. The pages that TAKE the files said nothing: the photo
   button was simply hidden for tools that do not use one, so nobody learned
   some tools want a photo at all, and Talking Photo asked for a picture and a
   recording with two identical buttons. Dim and dashed while the slot is
   empty, gold once it holds something, and tapping one opens that picker. */
function slotChips(hostId, slots) {
  const h = $(hostId); if (!h) return;
  while (h.firstChild) h.removeChild(h.firstChild);
  slots.forEach(function (sl) {
    const b = document.createElement("div");
    b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    b.className = "slotchip" + (sl.filled ? " on" : "") + (sl.optional ? " opt" : "");
    b.setAttribute("aria-pressed", sl.filled ? "true" : "false");
    b.appendChild(ffIcon(sl.filled ? "i-check" : sl.ic, sl.filled ? "gold" : "cream", "ic-s"));
    b.appendChild(document.createTextNode(sl.label));
    if (sl.pick) b.addEventListener("click", function () { try { sl.pick(); } catch (e) { } });
    h.appendChild(b);
  });
}
function renderVtSlotChips() {
  const d = vtDef();
  const slots = [{ ic: "i-clapper", label: ff9(SLOT_L.video), filled: !!VT.video,
    pick: function () { const b = $("btnVtPick"); if (b) b.click(); } }];
  if (d && d.imageParam) slots.push({ ic: "i-camera", label: ff9(SLOT_L.photo), filled: !!VT.img,
    pick: function () { const b = $("btnVtImgPick"); if (b) b.click(); } });
  slotChips("vtSlotChips", slots);
}
function renderTkSlotChips() {
  slotChips("tkSlotChips", [
    { ic: "i-camera", label: ff9(SLOT_L.photo), filled: !!TK.img,
      pick: function () { const b = $("btnTkImgPick"); if (b) b.click(); } },
    { ic: "i-mic", label: ff9(SLOT_L.audio), filled: !!TK.aud,
      pick: function () { const b = $("btnTkAudPick"); if (b) b.click(); } }
  ]);
}
function renderVt() {
  try { renderVtSlotChips(); } catch (e) { }
  try { if (typeof vwizRepaint === "function") vwizRepaint(); } catch (e) { }   /* v6.14.0 — the video wizard repaints with the slots */
  const d = vtDef();
  vtThumbFor(VT.video, "vtFileThumb", "vtFileName", "vtFileMeta", "vtFilePrev", true);
  /* the photo button follows the tool, exactly as the app's does */
  const ib = $("btnVtImgPick");
  if (ib) ib.style.display = (d && d.imageParam) ? "" : "none";
  if (d && !d.imageParam) VT.img = null;
  vtThumbFor((d && d.imageParam) ? VT.img : null, "vtImgThumb", "vtImgName", "vtImgMeta", "vtImgPrev", false);
  const on = $("vtOutName");
  if (on) on.textContent = VT.out ? (VT.out.name || "") : "";
  /* v6.64.0 — this used to write the app's text verbatim, ⚠ and all, because
     "the two pages read the same either way". They do not in Photoshop: the
     app runs in Chromium, where U+26A0 draws, and the panel runs in a shell
     whose UI font answers with a black box. It carries the same sprite its
     twin above (vuNeedNote) has always carried. */
  const need = $("vtNeedNote");
  if (need) {
    if (!VT.video) setIcnText(need, "i-warn", "hi", ff9(VU_L.need));
    else if (d && d.imageParam && d.imageReq && !VT.img) setIcnText(need, "i-warn", "hi", ff9(VT_L.needImg));
    else if (!VT.out) setIcnText(need, "i-warn", "hi", ff9(VU_L.needOut));
    else need.textContent = "";
  }
  const row = VT.rows && VT.rows[0];
  if (row) stSet("stVtGen", row.label + (row.detail ? " · " + row.detail : ""), row.level === "err" ? "err" : row.level === "ok" ? "ok" : "");
  vuPaintHsl();
}
/* ============================================================
   v6.72.0 — VIDEO SMART WORKFLOW, the app's deck box for box. The tools
   above already carried every endpoint needed to put a student's own
   character into a clip they like; what the page asked of them was to know
   that, to find the right one among thirty-one raw endpoint labels, and
   then to write the paragraph that keeps the camera, the motion and the
   background from being rewritten along with the person.

   The cards, their nine-language copy and — the part that matters — the
   written request itself are the app's own, lifted into
   js/hnk_video_tool_wf.js by tools/build_panel_video_tool_wf.js. Nothing
   here authors a prompt or names an endpoint.

   ONE difference from the app, and it is a capability difference rather
   than a choice: the app measures the picked clip and warns when it runs
   past the endpoint's documented ten seconds. The panel takes its video as
   a file the host hands it, not as a data URL a <video> element can read,
   so it cannot measure — every card therefore keeps its hint on screen,
   and the hint names the ceiling in words.
   ============================================================ */
let vtWfActive = null;
function vtWfPack() { return (globalThis.HNK && globalThis.HNK.videoToolWorkflows) || null; }

function vtWfApply(w) {
  const P = vtWfPack();
  if (!P || !w) return;
  vtWfActive = w.key;
  /* the tool first: vtPaintOptions() rebuilds the prompt box and the option
     selects off the chosen tool, so a request written before the switch would
     be shown in a box the rebuild then hides */
  const sel = $("vtModel");
  if (sel) { try { sel.value = w.model; } catch (e) { } }
  vtPaintOptions();
  /* v6.3.0 — three cards write no request at all: their endpoints (Topaz
     Starlight, the subtitle eraser, DreamActor v2) have no prompt field, so
     there is nothing to say. Writing an empty string over what the student
     typed would be a silent deletion, and calling w.text() on a card that
     has none would throw before the card ever applied. */
  const box = $("vtPrompt");
  if (box && w.text) box.value = w.text();
  /* and the option defaults the card promises — the very values vtRun reads */
  if (w.opts) ["vtOpt", "vtOpt2"].forEach(function (id) {
    const s = $(id);
    if (!s || s.style.display === "none") return;
    const k = s.getAttribute("data-key");
    if (k && w.opts[k] !== undefined) { try { s.value = String(w.opts[k]); } catch (e) { } }
  });
  renderVtWf();
  vuPaintHsl();
  setStatus(stripIcn(P.tr(w.label)) + " ✓", "ok");
}

function vtWfCard(w) {
  const P = vtWfPack();
  const m = mkBtn("wfmini" + (vtWfActive === w.key ? " on" : ""));
  const v = document.createElement("div");
  v.className = "wfv";
  const im = document.createElement("img");
  im.loading = "eager";
  im.alt = P ? stripIcn(P.tr(w.label)) : "";
  /* v6.7.4 — a replaced picture carries its own revision, so neither the
     panel's HTTP cache nor a proxy can serve last month's card */
  pnlArt(im, vidArtSrc(w), function () {
    v.className = "wfv wfv-noart";
    try { v.removeChild(im); } catch (e) { }
  });
  v.appendChild(im);
  const need = document.createElement("span");
  need.className = "wf-need";
  need.textContent = P ? stripIcn(P.tr(w.need)) : "";
  v.appendChild(need);
  m.appendChild(v);
  const ti = document.createElement("div"); ti.className = "t"; ti.textContent = P ? stripIcn(P.tr(w.label)) : ""; m.appendChild(ti);
  const su = document.createElement("div"); su.className = "s"; su.textContent = P ? stripIcn(P.tr(w.summary)) : ""; m.appendChild(su);
  const go = document.createElement("div"); go.className = "go";
  go.appendChild(ffIcon("i-caret", "hi"));
  go.appendChild(document.createTextNode(vwL(vtWfActive === w.key ? VW_SEL : VW_USE)));
  m.appendChild(go);
  /* v6.14.0 — the tap applies the card to the page AND opens its step-by-step wizard */
  m.addEventListener("click", function () { vtWfApply(w); openVWiz("v2v", w); });
  return m;
}

function renderVtWf() {
  const host = $("vtWfRow");
  const P = vtWfPack();
  if (!host || !P) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  P.WF.forEach(function (w) { host.appendChild(vtWfCard(w)); });
  if (P.WF.length % 2 === 1 && host.lastChild && clsOf(host.lastChild))
    host.lastChild.className = clsOf(host.lastChild) + " wf-span2";
  const w = vtWfActive ? P.byKey(vtWfActive) : null;
  const hint = $("vtWfHint");
  if (hint) hint.textContent = w ? stripIcn(P.tr(w.hint)) : ff9(VT_L.wfIntroHint);
  const intro = $("vtWfIntro");
  if (intro) intro.textContent = ff9(VT_L.wfIntro);
}

/* ---------- v6.14.0 — THE VIDEO WIZARD, the app's step-by-step over both decks ----------
   1 Guide · 2 Inputs · 3 Generate · 4 Result, on the same four dots the app
   draws, with the app's own words (js/hnk_video_wizard.js, lifted). Like the
   app's it owns no state: the card's apply() has already written the request,
   the tool and the options into the page, the pickers are the page's own
   buttons, and Generate presses the page's own run. The one panel-only slot
   is the SAVE FOLDER a video tool needs before it can write its result. */
const vwiz = { kind: "", w: null, step: 1, token: 0, busy: false, result: null, error: "", tick: null, sel: 0 };
function vwizPack() { return (globalThis.HNK && globalThis.HNK.videoWizard) || null; }
function vwizL(k) { const P = vwizPack(); return P ? P.tr(P.L[k] || { en: k }) : k; }
function vwizClock(ts) { const d = new Date(ts || Date.now()); const p2 = function (x) { return (x < 10 ? "0" : "") + x; }; return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
function vwizNeed() {
  if (vwiz.kind === "i2v") return vwNeedFor(vwiz.w);   /* v6.21.0 */
  const P = vtWfPack(); return (P && vwiz.w && vwiz.w.need) ? stripIcn(P.tr(vwiz.w.need)) : "";
}
/* the app's vwizPhotoReq: the tool demands the photograph, or the card's badge promised it (photo:true) */
function vwizPhotoReq() { const d = vtDef(); return !!(d && d.imageParam && (d.imageReq || (vwiz.w && vwiz.w.photo))); }
function vwizInputsOk() {
  if (vwiz.kind === "i2v") return !!ffSlotGet(0);
  if (!VT.video) return false;
  if (vwizPhotoReq() && !VT.img) return false;
  if (!VT.out) return false;
  return true;
}
function vwizPageText() { const b = $(vwiz.kind === "i2v" ? "vidPromptP" : "vtPrompt"); return (b && b.value) || ""; }
/* v6.85.0 — THE WIZARD IS A CARD IN THE PAGE, NOT A FIXED SHEET OVER IT. It
   was a position:fixed <div> appended to <body>: Photoshop's renderer lays a
   fixed box out as an ordinary block at the end of the document (the 6.78.0
   photo sheet and the 6.82.0 Freeform sheet were the same defect), so in the
   real host a card tap put the wizard a whole page below the fold, if
   anywhere. It now renders inside the page that was tapped — the Video page
   for an image→video card, the V→V page for a video→video card — as that
   page's first child, with the page's own cards hidden until the wizard
   closes and restored exactly as they were. A photo sheet opened from a slot
   is a <dialog> above it, never a second overlay. */
function vwizPageEl() { return $(vwiz.kind === "v2v" ? "pageV2V" : "pageVideo"); }
function vwizHost() {
  let sh = $("vwizSheet");
  const pg = vwizPageEl();
  if (sh && pg && sh.parentNode !== pg) { try { sh.parentNode.removeChild(sh); } catch (e) { } sh = null; }
  if (!sh) {
    sh = document.createElement("div"); sh.id = "vwizSheet"; sh.className = "vwiz-sheet";
    const inn = document.createElement("div"); inn.className = "wiz-in"; inn.id = "vwizIn"; sh.appendChild(inn);
    if (pg) pg.insertBefore(sh, pg.firstChild); else document.body.appendChild(sh);
  }
  return sh;
}
let vwizHidden = [];
function vwizHidePage(sh) {
  vwizShowPage();
  const pg = sh && sh.parentNode; if (!pg) return;
  for (let i = 0; i < pg.children.length; i++) {
    const c = pg.children[i]; if (c === sh) continue;
    vwizHidden.push({ el: c, prev: c.style.display });
    c.style.display = "none";
  }
}
function vwizShowPage() {
  vwizHidden.forEach(function (h) { try { h.el.style.display = h.prev || ""; } catch (e) { } });
  vwizHidden = [];
}
function vwizScrollTop() { try { const p = $("pages"); if (p) p.scrollTop = 0; } catch (e) { } }
function openVWiz(kind, w) {
  vwiz.kind = kind; vwiz.w = w; vwiz.step = 1; vwiz.sel = 0; vwiz.token++; vwiz.busy = false; vwiz.result = null; vwiz.error = "";
  if (vwiz.tick) { clearInterval(vwiz.tick); vwiz.tick = null; }
  const sh = vwizHost(); sh.style.display = "";
  vwizHidePage(sh);
  renderVWiz(); vwizScrollTop();
}
function closeVWiz() {
  vwiz.token++; vwiz.busy = false;
  if (vwiz.tick) { clearInterval(vwiz.tick); vwiz.tick = null; }
  vwizShowPage();
  const sh = $("vwizSheet"); if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
}
function vwizOpen() { const sh = $("vwizSheet"); return !!(sh && sh.parentNode); }
function vwizRepaint() { if (vwizOpen() && vwiz.w) renderVWiz(); }
function vwizSlot(filled, thumb, name, req, onPick, onClear) {
  const slot = document.createElement("div"); slot.className = "wslot" + (filled ? " filled" : "");
  const th = document.createElement("div"); th.className = "th";
  if (filled && thumb) th.appendChild(thumb); else th.textContent = filled ? "✓" : "+";
  slot.appendChild(th);
  const col = document.createElement("div");
  const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = name; col.appendChild(nm);
  const rq = document.createElement("div"); rq.className = "rq" + (req ? "" : " opt"); rq.textContent = req ? vwizL("req") : vwizL("opt"); col.appendChild(rq);
  slot.appendChild(col);
  const act = document.createElement("div"); act.className = "act";
  const pick = mkBtn("btn", ""); setIcnText(pick, "i-folder", "cream", filled ? vwizL("replace") : name.indexOf(vwizL("slotVideo")) === 0 ? vwizL("pickVideo") : vwizL("pickPhoto"));
  ffPressable(pick, onPick); act.appendChild(pick);
  if (filled && onClear) { const clr = mkBtn("btn", ""); setIcnText(clr, "i-close", "cream", vwizL("clear")); ffPressable(clr, onClear); act.appendChild(clr); }
  slot.appendChild(act);
  return slot;
}
function renderVWiz() {
  const P = vwizPack(), w = vwiz.w; if (!P || !w) return;
  const deckP = vwiz.kind === "i2v" ? vidWfPack() : vtWfPack();
  const host = $("vwizIn"); if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  const el = function (cls, text) { const d = document.createElement("div"); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const top = el("wiz-top");
  const ttl = el("ttl"); ttl.appendChild(ffIcon("i-clapper", "hi")); ttl.appendChild(document.createTextNode(" " + (deckP ? stripIcn(deckP.tr(w.label)) : ""))); top.appendChild(ttl);
  const x = mkBtn("wiz-x", ""); x.appendChild(ffIcon("i-close", "cream")); x.setAttribute("aria-label", vwizL("close")); ffPressable(x, closeVWiz); top.appendChild(x);
  host.appendChild(top);
  const dots = el("wiz-dots");
  P.DOTS.forEach(function (d, i) {
    const dd = el("wiz-dot" + (i + 1 === vwiz.step ? " on" : (i + 1 < vwiz.step ? " done" : "")));
    const dc = el("c"); if (i + 1 < vwiz.step) dc.appendChild(ffIcon("i-check", "gold")); else dc.textContent = String(i + 1); dd.appendChild(dc);
    dd.appendChild(el("l", d)); dots.appendChild(dd);
  });
  host.appendChild(dots);
  const body = el("wiz-body"); body.id = "vwizBody";
  const nav = el("wiz-nav");
  const goStep = function (n) { vwiz.step = n; renderVWiz(); vwizScrollTop(); };
  const d = vtDef();
  if (vwiz.step === 1) {
    if (vwizInputsOk()) { const fast = mkBtn("btn wiz-fast", ""); setIcnText(fast, "i-bolt", "cream", vwizL("fast")); ffPressable(fast, function () { goStep(3); }); body.appendChild(fast); }
    const im = document.createElement("img"); im.className = "wiz-visual";
    pnlArt(im, vidArtSrc(w), function () { if (im.parentNode) im.parentNode.removeChild(im); });
    body.appendChild(im);
    const s = el("s", deckP ? stripIcn(deckP.tr(w.summary)) : ""); s.style.margin = "10px 0 2px"; body.appendChild(s);
    const needRow = el("mut", ""); setIcnText(needRow, "i-camera", "cream", vwizNeed()); body.appendChild(needRow);
    P.steps(vwiz.kind).forEach(function (line, i) {
      const row = el("wf-step"); const n = document.createElement("span"); n.className = "n"; n.textContent = String(i + 1); row.appendChild(n);
      const tx = document.createElement("span"); tx.textContent = line.replace("{N}", vwizNeed()); row.appendChild(tx); body.appendChild(row);
    });
    if (w.hint) body.appendChild(el("mut", deckP ? stripIcn(deckP.tr(w.hint)) : ""));
    const start = mkBtn("btn btn-gold", ""); setIcnText(start, "i-caret", "ink", vwizL("start")); ffPressable(start, function () { goStep(2); }); nav.appendChild(start);
  }
  if (vwiz.step === 2) {
    if (vwiz.kind === "i2v") {
      const r = ffSlotGet(0);
      body.appendChild(vwizSlot(!!r, r ? ffThumb(r) : null, "IMAGE 1 — " + vwizL("slotPhoto"), true,
        function () { ffSrcSheet(0); }, function () { ffSlotSet(0, null); renderVWiz(); }));
      /* v6.21.0 — face-reference slots up to the card's image capacity: the filled ones plus one empty */
      const vmx = vwRefMax((w.setup && w.setup.model) || ((vidDef() || {}).id) || ""); let vlast = 0;
      for (let q0 = 1; q0 < vmx; q0++) if (ffSlotGet(q0)) vlast = q0;
      const vshown = Math.min(vmx, vlast + 2);
      for (let q = 1; q < vshown; q++) {
        (function (q) {
          const rq = ffSlotGet(q);
          body.appendChild(vwizSlot(!!rq, rq ? ffThumb(rq) : null, "IMAGE " + (q + 1) + " — " + vwizL("slotFace"), false,
            function () { ffSrcSheet(q); }, function () { ffSlotSet(q, null); renderVWiz(); }));
        })(q);
      }
    } else {
      const vname = VT.video ? (VT.video.name || "video") : "";
      const vt = VT.video ? el("mut", vname) : null;
      body.appendChild(vwizSlot(!!VT.video, vt, vwizL("slotVideo") + (vname ? " · " + vname : ""), true,
        function () { const b = $("btnVtPick"); if (b) b.click(); }, function () { VT.video = null; renderVt(); renderVWiz(); }));
      if (d && d.imageParam) {
        body.appendChild(vwizSlot(!!VT.img, VT.img ? ffThumb(VT.img) : null, vwizL("slotRef"), vwizPhotoReq(),
          function () { const b = $("btnVtImgPick"); if (b) b.click(); }, function () { VT.img = null; renderVt(); renderVWiz(); }));
      }
      /* the panel writes its result to disk, so the folder is an input here */
      body.appendChild(vwizSlot(!!VT.out, VT.out ? el("mut", VT.out.name || "") : null, ff9(VU_L.out), true,
        function () { const b = $("btnVtSave"); if (b) b.click(); }, null));
    }
    if (!vwizInputsOk()) { const rw = el("mut", ""); setIcnText(rw, "i-warn", "hi", vwizL("needInputs")); body.appendChild(rw); }
    const back = mkBtn("btn", ""); setIcnText(back, "i-caret", "cream", vwizL("back")); ffPressable(back, function () { goStep(1); });
    const next = mkBtn("btn btn-gold" + (vwizInputsOk() ? "" : " dis"), ""); setIcnText(next, "i-caret", "ink", vwizL("next"));
    ffPressable(next, function () { if (vwizInputsOk()) goStep(3); });
    nav.appendChild(back); nav.appendChild(next);
  }
  if (vwiz.step === 3) {
    body.appendChild(el("", vwizL("ready")));
    const txt = vwizPageText();
    const pageBox = $(vwiz.kind === "i2v" ? "vidPromptP" : "vtPrompt");
    if (vwiz.kind === "v2v" && d && !d.prompt) body.appendChild(el("mut", vwizL("noPrompt")));
    else {
      const g = el("grp"); const gh = mkBtn("grp-h", ""); gh.textContent = vwizL("viewPrompt") + " · " + txt.length;
      ffPressable(gh, function () { g.className = clsOf(g).indexOf("open") >= 0 ? "grp" : "grp open"; });
      const gb = el("grp-b"); const ta = document.createElement("textarea"); ta.className = "inp"; ta.rows = 6; ta.value = txt;
      ta.addEventListener("input", function () { if (pageBox) { pageBox.value = ta.value; if (vwiz.kind === "i2v") vidPaintPromptCount(); } });
      gb.appendChild(ta); g.appendChild(gh); g.appendChild(gb); body.appendChild(g);
    }
    const row = el("wizrow");
    const ids = vwiz.kind === "i2v" ? ["vidModel", "vidRes", "vidDur", "vidAspect"] : ["vtOpt", "vtOpt2"];
    const buildRow = function () {
      while (row.firstChild) row.removeChild(row.firstChild);
      if (vwiz.kind === "v2v" && d) { const tl = el("mut", vwizL("toolLine") + ": " + d.label); tl.style.flexBasis = "100%"; row.appendChild(tl); }
      ids.forEach(function (id) {
        const mainSel = $(id); if (!mainSel || mainSel.style.display === "none") return;
        const c = mainSel.cloneNode(true); c.id = "vwiz_" + id; c.className = "inp"; c.value = mainSel.value;
        c.addEventListener("change", function () {
          mainSel.value = c.value;
          try { mainSel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { }
          if (vwiz.kind === "i2v") { try { vidPaintOptions(); vidPaintRail(); vidPaintHsl(); } catch (e) { } } else { try { vuPaintHsl(); } catch (e) { } }
          buildRow();
        });
        row.appendChild(c);
      });
    };
    buildRow(); body.appendChild(row);
    body.appendChild(el("mut", vwizL("engine").replace("{C}", String(vwizPageText().length))));
    const back3 = mkBtn("btn", ""); setIcnText(back3, "i-caret", "cream", vwizL("back")); ffPressable(back3, function () { goStep(2); });
    const gen = mkBtn("btn btn-gold gen", ""); gen.id = "vwizGen"; setIcnText(gen, "i-clapper", "ink", vwizL("gen")); ffPressable(gen, runVWizGenerate);
    nav.appendChild(back3); nav.appendChild(gen);
  }
  if (vwiz.step === 4) {
    if (vwiz.busy) {
      body.appendChild(el("", vwizL("running")));
      const sp = el("mut", ""); sp.id = "vwizSpin"; sp.textContent = vwizSpinLine(); body.appendChild(sp);
    } else if (vwiz.result) {
      vwizResultCard(body, nav, el, goStep);   /* v6.85.0 */
    } else {
      body.appendChild(el("mut warn", vwizL("failed")));
      if (vwiz.error) body.appendChild(el("mut", vwiz.error));
      const b4 = mkBtn("btn", ""); setIcnText(b4, "i-caret", "cream", vwizL("back")); ffPressable(b4, function () { goStep(3); }); nav.appendChild(b4);
    }
  }
  host.appendChild(body); host.appendChild(nav);
}
/* v6.85.0 — THE RESULT STEP, ON A RENDERER THAT MAY NOT PLAY VIDEO. The
   page's history is the source of truth (vidHist / vtHist; vwiz.sel picks the
   take, 0 = the one just made). Where <video> decodes (VIDEO_OK) the take
   plays here; in Photoshop it does not, so the step says so in the student's
   language (vid_no_inline), draws the takes as numbered tiles, and puts the
   two things that DO work on top: Download (the bytes into a folder they pick)
   and the direct link (the system browser plays it). A video→video take was
   already written to the folder the student chose — the line names the file
   and "Open the folder" shows it. Before 6.85.0 an image→video result here
   was a raw <video> (black in Photoshop) and a video→video result was a text
   row, "hnk-videotool-….mp4 · saved", with no way to see, open or re-save
   the clip. Every earlier take of this page sits in a strip; a tap switches
   the wizard AND the page's own selection, so Download and the link always
   mean the clip on screen. */
function vwizHistList() { return vwiz.kind === "i2v" ? vidHist : vtHist; }
function vwizResultCard(body, nav, el, goStep) {
  const hl = vwizHistList();
  if (vwiz.sel >= hl.length) vwiz.sel = 0;
  const cur = hl[vwiz.sel] || vwiz.result || {};
  body.appendChild(el("", vwizL("done")));
  /* where it came from: the page's own slot */
  const from = el("wiz-from");
  if (vwiz.kind === "i2v") {
    const r0 = ffSlotGet(0);
    if (r0) { const th = el("th"); th.appendChild(ffThumb(r0)); from.appendChild(th); from.appendChild(el("nm", vwizL("from"))); }
  } else if (VT.video) {
    from.appendChild(el("nm", vwizL("fromClip") + " \u00b7 " + (VT.video.name || "video")));
  }
  if (from.firstChild) body.appendChild(from);
  /* the take itself: a player where one decodes, the honest line where not */
  if (VIDEO_OK && cur.url) {
    const v = document.createElement("video"); v.controls = true; v.src = cur.url; v.className = "wiz-clip"; body.appendChild(v);
  } else {
    const note = el("mut vid-noinline", t("vid_no_inline").replace("{n}", String(vwiz.sel + 1))); note.id = "vwizNoInline"; body.appendChild(note);
  }
  const meta = [];
  if (cur.resolution) meta.push(String(cur.resolution));
  if (cur.duration) meta.push(/^\d+$/.test(String(cur.duration)) ? cur.duration + "s" : String(cur.duration));
  if (vwiz.kind === "v2v" && cur.tool) meta.push(String(cur.tool));
  if (cur.ts) meta.push(vwizClock(cur.ts));
  if (meta.length) body.appendChild(el("mut wiz-meta", meta.join(" \u00b7 ")));
  if (vwiz.kind === "v2v" && cur.name) {
    const sv = el("mut wiz-saved", vwizL("savedTo").replace("{F}", (cur.folder ? cur.folder + "/" : "") + cur.name)); sv.id = "vwizSaved"; body.appendChild(sv);
  }
  /* the takes strip: every take this page made, the shown one marked */
  if (hl.length > 1 || !VIDEO_OK) {
    if (hl.length > 1) body.appendChild(el("mut wiz-takes-h", vwizL("takes")));
    const strip = el("hist wiz-takes"); strip.id = "vwizTakes";
    hl.forEach(function (e, i) {
      let tile;
      if (VIDEO_OK && e.url) { tile = document.createElement("video"); tile.src = e.url; tile.muted = true; tile.preload = "metadata"; tile.className = i === vwiz.sel ? "sel" : ""; }
      else { tile = el("hvt" + (i === vwiz.sel ? " sel" : ""), "MP4 " + (i + 1)); }
      ffPressable(tile, function () {
        vwiz.sel = i;
        if (vwiz.kind === "i2v") { vidHistSel = i; try { showVidResult(); } catch (e2) { } }
        else { vtHistSel = i; try { showVtResult(false); } catch (e2) { } }
        renderVWiz();
      });
      strip.appendChild(tile);
    });
    body.appendChild(strip);
  }
  /* what works on every renderer: the file and the link */
  const nav1 = el("wiz-nav wiz-nav-acts");
  const dl = mkBtn("btn btn-gold", ""); dl.id = "vwizDl"; setIcnText(dl, "i-download", "ink", vwizL("download"));
  ffPressable(dl, function () { if (vwiz.kind === "i2v") { vidHistSel = vwiz.sel; vidDownload(); } else { vtHistSel = vwiz.sel; vtDownload(); } });
  nav1.appendChild(dl);
  if (cur.url) { const lk = mkBtn("btn", ""); lk.id = "vwizOpenLink"; setIcnText(lk, "i-external", "cream", vwizL("openLink")); ffPressable(lk, function () { openUrl(cur.url); }); nav1.appendChild(lk); }
  if (vwiz.kind === "v2v" && cur.folderPath) { const fo = mkBtn("btn", ""); fo.id = "vwizOpenFolder"; setIcnText(fo, "i-folder", "cream", vwizL("openFolder")); ffPressable(fo, function () { vtOpenFolder(cur.folderPath); }); nav1.appendChild(fo); }
  body.appendChild(nav1);
  /* 6.165.0 — the clip goes on to the next tool from here too; the wizard closes so the page it lands on is visible */
  const sendRow = el("wiz-nav wiz-nav-acts vid-send"); sendRow.id = "vwizSendRow";
  [["vwizSendUp", "up", "i-rocket", "sendUp"], ["vwizSendV2v", "v2v", "i-clapper", "sendV2v"], ["vwizSendTalk", "talk", "i-frame", "grabTalk"], ["vwizSendImg1", "img1", "i-restore", "grabImg1"]].forEach(function (r) {
    if (VID_SEND_FRAME[r[1]] && !VIDEO_OK) return;   /* 6.166.0 — no frame without a player */
    const sb = mkBtn("btn", ""); sb.id = r[0]; setIcnText(sb, r[2], "cream", vwizL(r[3]));
    ffPressable(sb, function () { vidSendTo(r[1], cur, vwiz.kind === "i2v" ? "video" : "videotool", true); });
    sendRow.appendChild(sb);
  });
  body.appendChild(sendRow);
  const again = mkBtn("btn", ""); setIcnText(again, "i-retry", "cream", vwizL("again")); ffPressable(again, function () { vwiz.result = null; goStep(2); });
  const onp = mkBtn("btn", ""); setIcnText(onp, "i-caret", "cream", vwizL("onPage"));
  ffPressable(onp, function () { const k = vwiz.kind; closeVWiz(); const bx = $(k === "i2v" ? "vidResultBox" : "vtResultBox"); if (bx) { try { bx.scrollIntoView({ behavior: "smooth" }); } catch (e3) { } } });
  nav.appendChild(again); nav.appendChild(onp);
}
/* the page's own progress line, read rather than re-implemented: the Video
   page paints #vidSpinTxt, the tools page paints its VT.rows */
function vwizSpinLine() {
  if (vwiz.kind === "i2v") { const t = $("vidSpinTxt"); return (t && t.textContent) || ""; }
  const r = VT.rows && VT.rows[0]; return r ? ((r.label || "") + (r.detail ? " · " + r.detail : "")) : "";
}
async function runVWizGenerate() {
  if (vwiz.busy || !vwizInputsOk()) return;
  const token = vwiz.token, kind = vwiz.kind;
  /* a missing key sends the student to Setup (vidGenerate switches the page) — get out of the way first */
  if (kind === "i2v" && !state.rhKey) { closeVWiz(); try { await vidGenerate(); } catch (e) { } return; }
  vwiz.step = 4; vwiz.busy = true; vwiz.result = null; vwiz.error = ""; renderVWiz();
  vwiz.tick = setInterval(function () { const s = $("vwizSpin"); if (s) s.textContent = vwizSpinLine(); }, 1000);
  if (kind === "i2v") {
    const before = vidHist[0];
    try { await vidGenerate(); } catch (e) { }
    if (vwiz.tick) { clearInterval(vwiz.tick); vwiz.tick = null; }
    if (token !== vwiz.token) return;
    vwiz.busy = false;
    if (vidHist[0] !== before) { vwiz.result = vidHist[0]; vwiz.sel = 0; }
    else { const st = $("stVidGen"); vwiz.error = (st && st.textContent) || ""; }
  } else {
    const beforeT = vtHist[0];
    try { await vtRun(); } catch (e) { }
    if (vwiz.tick) { clearInterval(vwiz.tick); vwiz.tick = null; }
    if (token !== vwiz.token) return;
    vwiz.busy = false;
    /* v6.85.0 — the run's record is the take vtRun pushed, exactly as the Video deck reads vidHist */
    if (vtHist[0] !== beforeT) { vwiz.result = vtHist[0]; vwiz.sel = 0; }
    else { const st = $("stVtGen"); vwiz.error = (st && st.textContent) || ((VT.rows[0] && VT.rows[0].detail) || ""); }
  }
  renderVWiz();
}

/* the styled buttons over the three native selects on this page, and the
   app's syncVis: a picker whose select is hidden hides with it */
function vuPaintHsl() {
  ffPaintHslVal("vuRes", "vuResVal");
  ffPaintHslVal("vtModel", "vtModelVal");
  /* v6.3.0 — both option pickers, each hiding with its own select and each
     wearing its own tool-supplied key as the little context word */
  [["vtOpt", "vtOptVal", "vtOptHsl", "vtOptCtx"],
   ["vtOpt2", "vtOpt2Val", "vtOpt2Hsl", "vtOpt2Ctx"]].forEach(function (q) {
    ffPaintHslVal(q[0], q[1]);
    const sel = $(q[0]), w = $(q[2]);
    if (sel && w) w.className = "hsl" + (sel.style.display === "none" ? " hsl-off" : "");
    const ctx = $(q[3]);
    if (ctx && sel) {
      const key = sel.getAttribute("data-key") || "";
      if (key) ctx.textContent = key.replace(/([A-Z])/g, " $1").toLowerCase();
    }
  });
}
/* the tool's option selects — their real enums, their documented defaults,
   or the Topaz resolution preset when the endpoint carries one. v6.3.0: two
   slots, the app's own shape, because Wan 2.7 Extend documents two. */
function vtPaintOptions() {
  const d = vtDef();
  const pr = $("vtPrompt");
  if (pr) pr.style.display = (d && d.prompt) ? "block" : "none";
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const defs = [];
  if (d && d.whPreset && V && V.VT_WH) defs.push({ key: "whPreset", values: Object.keys(V.VT_WH), def: "720p" });
  (d && d.options || []).forEach(function (o) { defs.push(o); });
  ["vtOpt", "vtOpt2"].forEach(function (id, idx) {
    const sel = $(id);
    if (!sel) return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    const o = defs[idx];
    if (!o) { sel.removeAttribute("data-key"); sel.style.display = "none"; return; }
    o.values.forEach(function (v) {
      sel.appendChild(mkOption(String(v), o.key.replace(/([A-Z])/g, " $1").toLowerCase() + ": " + v));
    });
    try { sel.value = String(o.def); } catch (e) { }
    sel.setAttribute("data-key", o.key);
    sel.style.display = "";
  });
  renderVt();
}
async function vtRun() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const d = vtDef();
  if (VT.busy || !V || !d) return;
  if (!state.rhKey) { setStatus(t("job_needkey"), "err"); return; }
  if (!VT.video) { setStatus("Pick a video first", "err"); return; }
  if (!VT.out) { setStatus("Choose a save folder first", "err"); return; }
  const promptText = ($("vtPrompt") && $("vtPrompt").value || "").trim();
  if (d.prompt === "req" && !promptText) { setStatus("This tool needs a prompt", "err"); return; }
  const optVals = {};
  ["vtOpt", "vtOpt2"].forEach(function (id) {
    const sel = $(id);
    if (sel && sel.style.display !== "none" && sel.getAttribute("data-key"))
      optVals[sel.getAttribute("data-key")] = sel.value;
  });
  VT.busy = true; VT.rows = [{ label: "Working", level: "pend", detail: "uploading" }]; renderVt();
  try {
    const ref = VT.video._url || await fileToDataUrl(VT.video);
    /* v6.4.0 — and the reference photograph, when the tool takes one. This
       list was hard-coded empty, so every card whose endpoint REQUIRES an
       image failed on this surface with the endpoint's own error. */
    const imgs = (d.imageParam && VT.img) ? [VT.img._url || await fileToDataUrl(VT.img)] : [];
    if (d.imageParam && d.imageReq && !imgs.length) {
      setStatus(ff9(VT_L.needImg), "err"); VT.busy = false; renderVt(); return;
    }
    const res = await V.runTool(videoEnv(), d, ref, imgs, promptText, optVals, function (stage, info) {
      VT.rows = [{ label: "Working", level: "pend",
        detail: stage + (info && info.elapsedMs ? " " + Math.round(info.elapsedMs / 1000) + "s" : "") }];
      renderVt();
    });
    if (!res.ok || !res.results.length) throw new Error((res.error && res.error.message) || "no video");
    try { rhBookUsage(res.usage, { kind: "video", label: d.label || d.id, prov: "rh" }); } catch (e) { }
    const name = "hnk-videotool-" + Date.now() + ".mp4";
    await saveResultFile(VT.out, name, res.results[0].ref);
    /* v6.85.0 — the take is recorded like the Video page's (vtHist), so the
       wizard's Result step, the page's result box and its strip can show,
       re-save and re-open it; the row below stays the page's status line */
    vtHist.unshift({ url: res.results[0].url || "", ref: res.results[0].ref, name: name, folder: VT.out.name || "", folderPath: VT.out.nativePath || "",
      tool: d.label || d.id, prompt: promptText.slice(0, 120), ts: Date.now() });
    while (vtHist.length > 12) vtHist.pop();
    vtHistSel = 0;
    try { showVtResult(); } catch (eS) { }
    takesRecordP("v2v", vtHist[0]);   /* v6.87.0 — kept across reloads */
    VT.rows = [{ label: name, level: "ok", detail: "saved" }];
    setStatus(t("st_done") || "Done", "ok");
  } catch (e) {
    VT.rows = [{ label: "Failed", level: "err", detail: (e && e.message) ? String(e.message).slice(0, 48) : "failed" }];
    setStatus(friendlyErr(e), "err");
  }
  VT.busy = false; renderVt();
}


/* ============================================================
   v6.75.1 — TALKING PHOTO, the app's pgTalk box for box.

   Two published endpoints, two prices, three fields. The catalog is LIFTED
   from the app (js/hnk_talk_models.js, built by
   tools/build_panel_talk_models.js) and the request body comes from that
   module's own builder, so this surface cannot send a different request —
   or quote a different price — from the one the app sends and quotes.

   NO TEXT-TO-SPEECH HERE EITHER, and for the app's reason: RunningHub
   documents three voice ids for its speech endpoint and does not boost
   Burmese, so a voice picker would offer voices that cannot read our
   students' own language. A recording works in every language.
   ============================================================ */
const TK = { img: null, aud: null, out: null, busy: false, rows: [] };
const TK_L = {
  intro: {my:"ပုံတစ်ပုံနဲ့ အသံဖိုင်တစ်ခု ထည့်ပါ — ပုံထဲက လူက အဲ့ဒီအသံအတိုင်း စကားပြောပေးပါမယ်။ ကိုယ်တိုင် အသံသွင်းထားတာ အကောင်းဆုံး — ဘာသာစကား အားလုံး ရပါတယ်။",en:"Add a photo and an audio file — the person in the photo will speak it. Your own recording works best, and works in every language.",shn:"သႂ်ႇၶႅပ်းႁၢင်ႈ 1 လႄႈ ၾၢႆႇသဵင် 1 — ၵူၼ်းၼႂ်းၶႅပ်းတေလၢတ်ႈၸွမ်းသဵင်ၼၼ်ႉ",kac:"Sumla langai hte nsen file langai bang u — sumla hta na masha gaw dai nsen hte ga shaga na re",th:"เพิ่มรูปและไฟล์เสียง — คนในรูปจะพูดตามเสียงนั้น เสียงที่คุณอัดเองใช้ได้ทุกภาษา",zh:"添加一张照片和一个音频文件 — 照片里的人就会说出这段话。用你自己录的声音效果最好，任何语言都可以。",vi:"Thêm một ảnh và một tệp âm thanh — người trong ảnh sẽ nói theo. Bản ghi của chính bạn là tốt nhất, dùng được mọi ngôn ngữ.",id:"Tambahkan foto dan file audio — orang di foto akan mengucapkannya. Rekaman Anda sendiri paling bagus dan berlaku untuk semua bahasa.",ms:"Tambah foto dan fail audio — orang dalam foto akan menuturkannya. Rakaman anda sendiri paling baik, untuk semua bahasa."},
  pickImg: {my:"ပုံ ရွေးမယ်",en:"Choose a photo",shn:"လိူၵ်ႈၶႅပ်းႁၢင်ႈ",kac:"Sumla lata u",th:"เลือกรูป",zh:"选择照片",vi:"Chọn ảnh",id:"Pilih foto",ms:"Pilih foto"},
  pickAud: {my:"အသံဖိုင် ရွေးမယ်",en:"Choose an audio file",shn:"လိူၵ်ႈၾၢႆႇသဵင်",kac:"Nsen file lata u",th:"เลือกไฟล์เสียง",zh:"选择音频文件",vi:"Chọn tệp âm thanh",id:"Pilih file audio",ms:"Pilih fail audio"},
  run: {my:"စကားပြောခိုင်းမယ်",en:"Make it talk",shn:"ႁဵတ်းႁႂ်ႈလၢတ်ႈ",kac:"Ga shaga shangun u",th:"ทำให้พูด",zh:"让它说话",vi:"Cho ảnh nói",id:"Buat berbicara",ms:"Buatkan ia bercakap"},
  need: {my:"လိုအပ်တာ — ပုံ ၁ ပုံ (မျက်နှာ ရှင်းရှင်း၊ ရှေ့တည့်တည့်) နဲ့ အသံဖိုင် ၁ ခု (MP3/M4A/WAV)။",en:"Needs one photo (a clear, front-on face) and one audio file (MP3/M4A/WAV).",shn:"လူဝ်ႇ — ၶႅပ်းႁၢင်ႈ 1 လႄႈ ၾၢႆႇသဵင် 1",kac:"Ra ai — sumla 1 hte nsen file 1",th:"ต้องใช้รูป 1 รูป (หน้าชัด หันตรง) และไฟล์เสียง 1 ไฟล์ (MP3/M4A/WAV)",zh:"需要一张照片（正面清晰的脸）和一个音频文件（MP3/M4A/WAV）",vi:"Cần một ảnh (mặt rõ, chính diện) và một tệp âm thanh (MP3/M4A/WAV)",id:"Perlu satu foto (wajah jelas, menghadap depan) dan satu file audio (MP3/M4A/WAV)",ms:"Perlu satu foto (wajah jelas, menghadap depan) dan satu fail audio (MP3/M4A/WAV)"},
  needImg: {my:"ပုံ တစ်ပုံ ထည့်ပါ",en:"Add a photo first",shn:"သႂ်ႇၶႅပ်းႁၢင်ႈဢွၼ်တၢင်း",kac:"Sumla langai bang u",th:"เพิ่มรูปก่อน",zh:"请先添加照片",vi:"Thêm ảnh trước",id:"Tambahkan foto dulu",ms:"Tambah foto dahulu"},
  needAud: {my:"အသံဖိုင် ထည့်ပါ",en:"Add an audio file",shn:"သႂ်ႇၾၢႆႇသဵင်",kac:"Nsen file bang u",th:"เพิ่มไฟล์เสียง",zh:"请添加音频文件",vi:"Thêm tệp âm thanh",id:"Tambahkan file audio",ms:"Tambah fail audio"},
  price: {my:"{L} — တစ်စက္ကန့် ¥{P}။ အသံ ရှည်လေ ဈေး များလေ။ RunningHub က Generate နှိပ်တဲ့အချိန်မှာ ငွေဖြတ်ပါတယ်။",en:"{L} — ¥{P} per second. The longer the audio, the more it costs. RunningHub charges the moment you press Generate.",shn:"{L} — ¥{P} ဢၼ်ၼိုင်ႈၸဵၵ်ႇ။ သဵင်ယၢဝ်း ၵႃႈၼမ်။",kac:"{L} — sekan langai ¥{P}. Nsen galu yang manga grau law.",th:"{L} — ¥{P} ต่อวินาที ยิ่งเสียงยาวยิ่งแพง คิดเงินตอนกด Generate",zh:"{L} — 每秒 ¥{P}。音频越长费用越高，按下生成时即扣费。",vi:"{L} — ¥{P} mỗi giây. Âm thanh càng dài càng tốn. Trừ tiền ngay khi bấm Generate.",id:"{L} — ¥{P} per detik. Makin panjang audio makin mahal. Ditagih saat menekan Generate.",ms:"{L} — ¥{P} sesaat. Makin panjang audio makin mahal. Dicaj sebaik anda tekan Generate."},
  /* v6.86.0 — the result box: the app's own two strings (tkResultH2, tkHistH) */
  resultH2: {my:"ရလဒ်",en:"Result",shn:"ၽွၼ်းလႆႈ",kac:"Ah kyu",th:"ผลลัพธ์",zh:"结果",vi:"Kết quả",id:"Hasil",ms:"Hasil"},
  histH: {my:"အရင် လုပ်ထားတာတွေ",en:"Earlier takes",shn:"ဢၼ်ႁဵတ်းဝႆႉၸဵမ်မိူဝ်ႈၵွၼ်ႇ",kac:"Moi galaw da ai ni",th:"งานก่อนหน้า",zh:"之前的成片",vi:"Các lần trước",id:"Hasil sebelumnya",ms:"Hasil terdahulu"},
  promptPh: {my:"မဖြည့်လည်း ရပါတယ် — ဥပမာ: ကင်မရာကို ကြည့်ပြီး သဘာဝကျကျ ပြုံးပါ",en:"Optional — e.g. looking at the camera, a natural friendly smile",shn:"ဢမ်ႇသႂ်ႇၵေႃႈလႆႈ",kac:"Bang ra ai n rai",th:"ไม่ใส่ก็ได้ — เช่น มองกล้อง ยิ้มอย่างเป็นธรรมชาติ",zh:"可留空 — 例如：看着镜头，自然微笑",vi:"Không bắt buộc — ví dụ: nhìn vào máy quay, mỉm cười tự nhiên",id:"Opsional — mis. menatap kamera, senyum alami",ms:"Pilihan — cth. memandang kamera, senyuman semula jadi"}
};
function tkDef() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const sel = $("tkModel");
  return (V && V.getTalk && sel) ? V.getTalk(sel.value) : null;
}
function tkFillModels() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const sel = $("tkModel");
  if (!sel || !V || !V.talkModels) return;
  if (sel.options.length) return;
  V.talkModels().forEach(function (m) {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.label + " — ¥" + m.cny.toFixed(2) + "/s";
    sel.appendChild(o);
  });
}
function renderTk() {
  try { renderTkSlotChips(); } catch (e) { }
  const d = tkDef();
  vtThumbFor(TK.img, "tkImgThumb", "tkImgName", "tkImgMeta", "tkImgPrev", false);
  /* the recording has no thumbnail to draw — the strip shows its name and
     size, and the gold chip stands in for the picture */
  const ap = $("tkAudPrev");
  if (ap) {
    if (TK.aud) {
      ap.style.display = "";
      if ($("tkAudName")) $("tkAudName").textContent = TK.aud.name || "";
      if ($("tkAudMeta") && TK.aud._size) $("tkAudMeta").textContent = TK.aud._size;
      if (!TK.aud._url && !TK.aud._reading) {
        TK.aud._reading = true;
        fileToDataUrl(TK.aud).then(function (u) {
          TK.aud._url = u;
          const b64 = String(u).split(",")[1] || "";
          const bytes = Math.floor(b64.length * 3 / 4);
          TK.aud._size = bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB"
            : bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : bytes + " B";
          TK.aud._reading = false; renderTk();
        }).catch(function () { TK.aud._reading = false; });
      }
    } else {
      ap.style.display = "none";
      if ($("tkAudName")) $("tkAudName").textContent = "";
      if ($("tkAudMeta")) $("tkAudMeta").textContent = "";
    }
  }
  const on = $("tkOutName");
  if (on) on.textContent = TK.out ? (TK.out.name || "") : "";
  const pn = $("tkPriceNote");
  if (pn && d) pn.textContent = ff9(TK_L.price).replace(/\{L\}/g, d.label).replace(/\{P\}/g, d.cny.toFixed(2));
  const need = $("tkNeedNote");
  if (need) {
    /* the app states the requirement here and leaves it stated; this line
       says the same thing in the same place, and only the panel's own extra
       requirement — a folder to write the file into, which a browser does
       not need — ever replaces it. Which half is missing is said on the
       button press, where the student is looking. */
    if (TK.img && TK.aud && !TK.out) setIcnText(need, "i-warn", "hi", ff9(VU_L.needOut));
    else need.textContent = ff9(TK_L.need);
  }
  const row = TK.rows && TK.rows[0];
  if (row) stSet("stTkGen", row.label + (row.detail ? " · " + row.detail : ""), row.level === "err" ? "err" : row.level === "ok" ? "ok" : "");
  /* the picker reads exactly what the app's <option> reads — label AND
     price. Showing the tier without its rate here would mean the two
     surfaces quote differently on the one page where the cost is the whole
     decision. */
  const hv = $("tkModelVal");
  if (hv && d) hv.textContent = d.label + " — ¥" + d.cny.toFixed(2) + "/s";
}
function tkPaintLabels() {
  try { vidSendPaintP(); } catch (e) { }   /* 6.165.0 — the send row's words */
  const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
  set("tkIntro", ff9(TK_L.intro));
  setIcnText($("btnTkImgPick"), "i-frame", "cream", ff9(TK_L.pickImg));
  setIcnText($("btnTkAudPick"), "i-clapper", "cream", ff9(TK_L.pickAud));
  setIcnText($("btnTkSave"), "i-folder", "cream", ff9(VU_L.out));
  setIcnText($("btnTkGen"), "i-clapper", "hi", ff9(TK_L.run));
  const pb = $("tkPrompt"); if (pb) pb.placeholder = ff9(TK_L.promptPh);
  renderTk();
}
async function tkRun() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const d = tkDef();
  if (TK.busy || !V || !d) return;
  if (!state.rhKey) { setStatus(t("job_needkey"), "err"); return; }
  if (!TK.img) { setStatus(ff9(TK_L.needImg), "err"); return; }
  if (!TK.aud) { setStatus(ff9(TK_L.needAud), "err"); return; }
  if (!TK.out) { setStatus("Choose a save folder first", "err"); return; }
  const promptText = ($("tkPrompt") && $("tkPrompt").value || "").trim();
  TK.busy = true; TK.rows = [{ label: "Working", level: "pend", detail: "uploading" }]; renderTk();
  try {
    const imgRef = TK.img._url || await fileToDataUrl(TK.img);
    const audRef = TK.aud._url || await fileToDataUrl(TK.aud);
    const res = await V.runTalk(videoEnv(), d, imgRef, audRef, promptText, function (stage, info) {
      TK.rows = [{ label: "Working", level: "pend",
        detail: stage + (info && info.elapsedMs ? " " + Math.round(info.elapsedMs / 1000) + "s" : "") }];
      renderTk();
    });
    if (!res.ok || !res.results.length) throw new Error((res.error && res.error.message) || "no video");
    try { rhBookUsage(res.usage, { kind: "video", label: d.label || d.id, prov: "rh" }); } catch (e) { }
    const name = "hnk-talking-photo-" + Date.now() + ".mp4";
    await saveResultFile(TK.out, name, res.results[0].ref);
    /* v6.86.0 — the take joins the page's result box (see mkTakes) */
    tkTakes.record({ url: res.results[0].url || "", ref: res.results[0].ref, name: name, folder: TK.out.name || "", folderPath: TK.out.nativePath || "",
      tool: d.label || d.id, prompt: promptText.slice(0, 120), ts: Date.now() });
    TK.rows = [{ label: name, level: "ok", detail: "saved" }];
    setStatus(t("st_done") || "Done", "ok");
  } catch (e) {
    TK.rows = [{ label: "Failed", level: "err", detail: (e && e.message) ? String(e.message).slice(0, 48) : "failed" }];
    setStatus(friendlyErr(e), "err");
  }
  TK.busy = false; renderTk();
}
function bindTalk() {
  tkFillModels();
  const sel = $("tkModel");
  if (sel) sel.addEventListener("change", renderTk);
  const ip = $("btnTkImgPick");
  /* v6.107.2 — the photograph that will speak can be the open layer */
  if (ip) ip.addEventListener("click", function () {
    photoSheet(ff9(TK_L.pickImg), {
      onLayer: async function () {
        const e = await layerPhotoCapture();
        if (e) { TK.img = e; renderTk(); setStatus(t("st_ref_layer_added"), "ok"); }
      },
      onFile: async function () {
        try { const f = await pickFile(["jpg", "jpeg", "png", "webp"]); if (f) TK.img = f; renderTk(); }
        catch (e) { setStatus(friendlyErr(e), "err"); }
      },
      onLast: function () {
        TK.img = layerPhotoEntry({ b64: state.resultB64, mime: state.resultMime || "image/png", label: "result" });
        renderTk();
      }
    });
  });
  const ap = $("btnTkAudPick");
  if (ap) ap.addEventListener("click", async function () {
    try { const f = await pickFile(["mp3", "m4a", "wav", "aac", "ogg"]); if (f) TK.aud = f; renderTk(); }
    catch (e) { setStatus(friendlyErr(e), "err"); }
  });
  const ic = $("btnTkImgClear");
  if (ic) ic.addEventListener("click", function () { TK.img = null; renderTk(); });
  const ac = $("btnTkAudClear");
  if (ac) ac.addEventListener("click", function () { TK.aud = null; renderTk(); });
  const sv = $("btnTkSave");
  if (sv) sv.addEventListener("click", async function () {
    try { const f = await pickFolder(); if (f) TK.out = f; renderTk(); }
    catch (e) { setStatus(friendlyErr(e), "err"); }
  });
  const rn = $("btnTkGen"); if (rn) rn.addEventListener("click", tkRun);
  tkTakes.bind();   /* v6.86.0 — the result box's controls */
  vidSendBindP();   /* 6.165.0 */
  tkPaintLabels();
  REFRESHERS.push(function () { try { tkPaintLabels(); } catch (e) { hwarn("talk:", e); } });
}

async function pickFile(types) {
  const uxp = require("uxp");
  return uxp.storage.localFileSystem.getFileForOpening({ types: types });
}
async function pickFolder() {
  const uxp = require("uxp");
  return uxp.storage.localFileSystem.getFolder();
}
/* 6.166.0 — text size: a class on <body>; className is rebuilt as a string (UXP once handed back a null className) */
function applyTextSize() {
  const b = document.body; if (!b) return;
  const v = state.tsize === "s" || state.tsize === "l" ? state.tsize : "m";
  const rest = String(b.className || "").split(/\s+/).filter(function (c) { return c && !/^tsize-/.test(c); });
  if (v !== "m") rest.push("tsize-" + v);
  b.className = rest.join(" ");
}
/* 6.166.0 — SETUP ▸ SETTINGS, the app's PREFS_W word for word. Text size only: the app's second row is a browser
   Notification switch, and UXP has no notification of any kind — a switch that could never do anything is not
   offered here, and the parity walk names those lines app-only for that reason. */
const PREFS_L = {
  h2: { my: "ပြင်ဆင်ချက်", en: "SETTINGS", shn: "ၶိူင်ႈမၢႆ", kac: "Setting ni", th: "การตั้งค่า", zh: "设置", vi: "CÀI ĐẶT", id: "PENGATURAN", ms: "TETAPAN" },
  tsize: { my: "စာလုံး အရွယ်", en: "Text size", shn: "တူဝ်လိၵ်ႈ", kac: "Laika kaba", th: "ขนาดตัวอักษร", zh: "文字大小", vi: "Cỡ chữ", id: "Ukuran teks", ms: "Saiz teks" },
  s: { my: "သေး", en: "Small", shn: "လဵၵ်ႉ", kac: "Kaji", th: "เล็ก", zh: "小", vi: "Nhỏ", id: "Kecil", ms: "Kecil" },
  m: { my: "ပုံမှန်", en: "Normal", shn: "ပၵ်းၵဝ်ႇ", kac: "Pyaw", th: "ปกติ", zh: "标准", vi: "Thường", id: "Normal", ms: "Biasa" },
  l: { my: "ကြီး", en: "Large", shn: "ယႂ်ႇ", kac: "Kaba", th: "ใหญ่", zh: "大", vi: "Lớn", id: "Besar", ms: "Besar" }
};
function tsizeSetP(v) {
  state.tsize = (v === "s" || v === "l") ? v : "m";
  applyTextSize();
  try { saveSettings(); } catch (e) { }
  try { renderPrefsP(); } catch (e) { }
  return state.tsize;
}
function renderPrefsP() {
  const h = $("prefsH2"); if (!h) return;
  setIcnText(h, "i-gear", "gold", ff9(PREFS_L.h2), "ic-h2");
  const lb = $("prefsTsizeL"); if (lb) lb.textContent = ff9(PREFS_L.tsize);
  const cur = state.tsize === "s" || state.tsize === "l" ? state.tsize : "m";
  [["prefsTsizeS", "s"], ["prefsTsizeM", "m"], ["prefsTsizeL2", "l"]].forEach(function (r) {
    const b = $(r[0]); if (!b) return;
    b.textContent = ff9(PREFS_L[r[1]]); b.className = "chip" + (cur === r[1] ? " on" : "");
  });
}
/* 6.166.0 — one reader for a UXP entry (read) and a DOM File (arrayBuffer / FileReader): a file dropped onto the
   panel from the OS arrives as whichever shape the host gives it */
async function entryReadBinary(f) {
  const uxp = require("uxp");
  if (f && typeof f.read === "function") return f.read({ format: uxp.storage.formats.binary });
  if (f && typeof f.arrayBuffer === "function") return f.arrayBuffer();
  if (f && typeof FileReader !== "undefined") return new Promise(function (res, rej) { const rd = new FileReader(); rd.onload = function () { res(rd.result); }; rd.onerror = function () { rej(new Error("read failed")); }; rd.readAsArrayBuffer(f); });
  throw new Error("unreadable file");
}
/* 6.166.0 — DRAG & DROP onto every picker. A file dragged from Explorer / Finder onto a slot's Pick control lands
   in that slot exactly as the picker would put it. The SELF-TEST "Drag & drop" row says how many targets are bound
   and names the last file that arrived — or the refusal — because whether Photoshop's renderer delivers OS drops
   into a UXP panel is a thing only the real host can prove (acceptance pending). */
const DROP = { bound: 0, dyn: [], last: null, err: null };
/* the screens that bind their own drop target (the Freeform slot strip) report through this bridge, so the SELF-TEST
   row counts them once and names their last file too */
function dropTargetBridge() {
  return {
    bound: function (name) { name = String(name || "screen"); if (DROP.dyn.indexOf(name) < 0) DROP.dyn.push(name); },
    got: function (f) { DROP.last = { name: (f && f.name) || "file", bytes: (f && f.size) || 0, at: Date.now() }; DROP.err = null; try { renderSelfTest(); } catch (x) { } },
    failed: function (err) { DROP.err = String((err && err.message) || err || "drop failed").slice(0, 120); try { renderSelfTest(); } catch (x) { } }
  };
}
function dropFileOf(e) {
  const dt = e && e.dataTransfer; if (!dt) return null;
  if (dt.files && dt.files.length) return dt.files[0];
  if (dt.items && dt.items.length) { for (let i = 0; i < dt.items.length; i++) { try { const f = dt.items[i].getAsFile && dt.items[i].getAsFile(); if (f) return f; } catch (e2) { } } }
  return null;
}
function dropBind(el, onFile) {
  if (!el || el.__hnkDrop) return; el.__hnkDrop = true; DROP.bound++;
  const on = function () { el.className = String(el.className || "").replace(/\s*\bdrop-on\b/g, "") + " drop-on"; };
  const off = function () { el.className = String(el.className || "").replace(/\s*\bdrop-on\b/g, ""); };
  ["dragenter", "dragover"].forEach(function (ev) { el.addEventListener(ev, function (e) { try { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch (x) { } on(); }); });
  el.addEventListener("dragleave", off);
  el.addEventListener("drop", async function (e) {
    try { e.preventDefault(); e.stopPropagation(); } catch (x) { }
    off();
    const f = dropFileOf(e);
    if (!f) { DROP.err = "drop carried no file"; try { renderSelfTest(); } catch (x) { } return; }
    try { await onFile(f); DROP.last = { name: f.name || "file", bytes: f.size || 0, at: Date.now() }; DROP.err = null; }
    catch (err) { DROP.err = String((err && err.message) || err).slice(0, 120); setStatus(friendlyErr(err), "err"); }
    try { renderSelfTest(); } catch (x) { }
  });
}
function bindDrops() {
  dropBind($("btnTkImgPick"), async function (f) { TK.img = f; renderTk(); setStatus(t("st_ref_file_added"), "ok"); });
  dropBind($("btnTkAudPick"), async function (f) { TK.aud = f; renderTk(); });
  dropBind($("btnVtPick"), async function (f) { VT.video = f; renderVt(); });
  dropBind($("btnVtImgPick"), async function (f) { VT.img = f; renderVt(); });
  dropBind($("btnVuPickP"), async function (f) { VU.video = f; renderVu(); });
  dropBind($("stPicker"), async function (f) {
    const slot = refSlotById("subject-reference"); if (!slot) return;
    const cap = await refCaptureEntry(f); if (!cap || !imgMagicOk(cap.b64)) throw new Error("HNKERR:err_img:unreadable");
    slot.assign(cap); setStatus(t("st_ref_file_added"), "ok");
  });
}
function hnkDropRow() {
  const kb = DROP.last ? Math.round((DROP.last.bytes || 0) / 1024) : 0;
  const n = DROP.bound + DROP.dyn.length;
  if (!DROP.bound) return { label: "Drag & drop", detail: "no targets bound", level: "err" };
  if (DROP.err) return { label: "Drag & drop", detail: "REFUSED \u2014 " + DROP.err, level: "err" };
  if (DROP.last) return { label: "Drag & drop", detail: n + " targets \u00b7 last file " + DROP.last.name + " \u00b7 " + kb + " KB", level: "ok" };
  return { label: "Drag & drop", detail: n + " targets bound \u00b7 no file dropped yet", level: "pend" };
}
/* 6.166.0 — one frame of a clip as a JPEG data URL (the app's vidGrabFrame); only where <video> decodes (VIDEO_OK) */
function vidGrabFrameP(ref) {
  return new Promise(function (res, rej) {
    if (!VIDEO_OK) { rej(new Error("no-player")); return; }
    const v = document.createElement("video"); let done = false;
    const fin = function (err, val) { if (done) return; done = true; clearTimeout(tm); try { v.pause(); clearSrc(v); v.load(); } catch (e) { } if (err) rej(err); else res(val); };
    const tm = setTimeout(function () { fin(new Error("frame-timeout")); }, 15000);
    v.muted = true; v.preload = "auto";
    v.onerror = function () { fin(new Error("frame-decode")); };
    v.onloadeddata = function () { try { v.currentTime = Math.min(0.5, Math.max(0, (v.duration || 1) / 2)); } catch (e) { fin(new Error("frame-seek")); } };
    v.onseeked = function () {
      try {
        const w = v.videoWidth, h = v.videoHeight; if (!w || !h) throw new Error("frame-empty");
        const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(v, 0, 0, w, h);
        const mm = /^data:([^;]+);base64,(.+)$/.exec(c.toDataURL("image/jpeg", 0.92)); if (!mm) throw new Error("frame-encode");
        fin(null, { mime: mm[1], b64: mm[2], w: w, h: h });
      } catch (e) { fin(e); }
    };
    v.src = ref;
  });
}
async function fileToDataUrl(f) {
  const buf = await entryReadBinary(f);
  return "data:" + ((f && f.type && /^(image|video|audio)\//.test(f.type)) ? f.type : extToMime(f.name)) + ";base64," + bufToB64(buf);
}
async function saveResultFile(folder, name, ref) {
  const uxp = require("uxp");
  const b64 = String(ref || "").indexOf("data:") === 0 ? String(ref).split(",")[1] : String(ref || "");
  if (!b64) throw new Error("empty result");
  const f = await folder.createFile(name, { overwrite: true });
  await f.write(b64ToBuf(b64), { format: uxp.storage.formats.binary });
  return name;
}
function videoEnv() {
  return { transport: (globalThis.HNK && globalThis.HNK.runninghubHttp && globalThis.HNK.runninghubHttp.create)
    ? globalThis.HNK.runninghubHttp.create() : null, apiKey: state.rhKey, configOverride: rhConfigOverride() };
}
/* ============================================================
   v6.51.0 — THE APP'S VIDEO GENERATE FLOW, control for control.

   The page used to be a file picker, a save-folder picker and a row list;
   the app has none of those. Its Video page reads the same three IMG slots
   Generate reads, runs with the gold GENERATE VIDEO button, the ring-and-bar
   spinner, Cancel, a status line and Retry, and shows the result in a card
   with a 24-hour note, Download, Direct Link and a six-deep session history.
   That is what this is. Download writes to a folder the studio picks (a
   plugin cannot hand the browser a blob), Direct Link opens the RunningHub
   URL in the system browser — the same two outcomes by the only routes UXP
   has. Nothing else is added.
   ============================================================ */
/* the app's refs.filter(Boolean): the three IMG slots, empties dropped */
function vidRefs() {
  const out = [];
  for (let i = 0; i < 3; i++) { const r = ffSlotGet(i); if (r) out.push(r); }
  /* v6.21.0 — the face references behind the base three, up to the model's image capacity */
  const mx = vidRefMaxP();
  for (let k = VREF_BASE; k < mx; k++) { const r = ffSlotGet(k); if (r) out.push(r); }
  return out;
}
/* the app's rhFriendly branches this flow can reach */
const VID_ERR_L = {
  cancelled: { my: "ရပ်လိုက်ပါပြီ", en: "Cancelled", shn: "ၵိုတ်းယဝ်ႉ", kac: "Hkum tawn kau sai", th: "ยกเลิกแล้ว", zh: "已取消", vi: "Đã hủy", id: "Dibatalkan", ms: "Dibatalkan" },
  timeout: { my: "RunningHub timeout ဖြစ်သွားပါတယ် — ပြန်စမ်းကြည့်ပါ", en: "RunningHub timed out — try again", shn: "RunningHub timeout ဝႆႉ — ၸၢမ်းၶိုၼ်း", kac: "RunningHub timeout byin mat sai — bai chyam u", th: "RunningHub หมดเวลา — ลองใหม่อีกครั้ง", zh: "RunningHub 超时 — 请重试", vi: "RunningHub hết thời gian chờ — thử lại", id: "RunningHub timeout — coba lagi", ms: "RunningHub timeout — cuba lagi" }
};
function vidCancelled(e, sig) {
  return (sig && sig.aborted) || (e && e.code === "cancelled") ||
    /abort/i.test(((e && e.name) || "") + " " + ((e && e.message) || ""));
}
function vidErrMsg(e, sig) {
  if (vidCancelled(e, sig)) return ff9(VID_ERR_L.cancelled);
  if (e && e.code === "timeout") return ff9(VID_ERR_L.timeout);
  return friendlyErr(e);
}
/* the app's stage line: "Generating video … · UPLOADING 1/2 · 12s" */
function vidSpinLine(status) {
  const secs = Math.round((Date.now() - vidRun.t0) / 1000);
  return vidRun.base + (status ? " · " + status : "") + " · " + secs + "s";
}
function vidRunStopTimers() {
  if (vidRun.tick) { clearInterval(vidRun.tick); vidRun.tick = 0; }
  if (vidRun.anim) { clearInterval(vidRun.anim); vidRun.anim = 0; }
}
/* the app's showVidResult(): the card opens on the selected entry and the
   history strip is rebuilt with the selected thumb ringed gold */
function showVidResult() {
  const out = vidHist[vidHistSel];
  const box = $("vidResultBox");
  if (!out || !box) return;
  box.className = "card result-box on";
  const vid = $("vidResultVideo");
  if (vid) {
    try {
      if (VIDEO_OK) { vid.style.display = ""; vid.src = out.url; }
      else { vid.style.display = "none"; clearSrc(vid); }
    } catch (e) { }
  }
  /* v6.77.0 — no player here: say the clip is ready and where it plays */
  try {
    let note = $("vidNoInline");
    if (!VIDEO_OK) {
      if (!note) { note = document.createElement("div"); note.id = "vidNoInline"; note.className = "mut vid-noinline"; if (vid && vid.parentNode) vid.parentNode.appendChild(note); else box.appendChild(note); }
      note.textContent = t("vid_no_inline").replace("{n}", String(vidHistSel + 1));
      note.style.display = "";
    } else if (note) note.style.display = "none";
  } catch (e) { }
  const fo = $("btnVidFolder"); if (fo) fo.style.display = out.galleryFile ? "" : "none";   /* v6.87.0 — the gallery copy's folder */
  const h = $("vidHist");
  if (h) {
    while (h.firstChild) h.removeChild(h.firstChild);
    vidHist.forEach(function (e, i) {
      let v;
      if (VIDEO_OK) {
        v = document.createElement("video");
        v.src = e.url; v.muted = true; v.preload = "metadata"; v.playsInline = true;
        v.className = i === vidHistSel ? "sel" : "";
      } else {
        v = document.createElement("div");
        v.className = "hvt" + (i === vidHistSel ? " sel" : "");
        v.textContent = "MP4 " + (i + 1);
      }
      ffPressable(v, function () { vidHistSel = i; showVidResult(); });
      vidItemP(h, v, i);
    });
    vidClearSyncP();
  }
  try { box.scrollIntoView({ behavior: "smooth" }); } catch (e) { }
}
async function vidGenerate() {
  if (vidRun.busy) return;
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const m = vidDef();
  if (!V || !m) return;
  if (m.down) { setStatus((m.label || m.id) + " \u2014 " + ff9(RH_DOWN_NOTE), "err"); return; }   /* v6.97.2 — greyed models never submit */
  if (!state.rhKey) {
    switchPage("setup");
    const mk = ff9(VID_L.needKey);
    stSet("stRhKey", mk, "err"); setStatus(mk, "err");
    return;
  }
  const refs = vidRefs();
  const minImages = m.minImages || 0;
  if (refs.length < minImages) { stSet("stVidGen", vidNeedMin(minImages), "err"); return; }
  if (m.oddOnly && refs.length === 2) { stSet("stVidGen", ff9(VID_L.oddTwo), "err"); return; }
  const box = $("vidPromptP");
  const text = ((box && box.value) || "").trim();
  if (!text) { stSet("stVidGen", ff9(VID_L.needPrompt), "err"); return; }
  const maxImages = (m.maxImages == null) ? refs.length : m.maxImages;
  const refDataUrls = refs.slice(0, maxImages).map(function (r) { return "data:" + r.mime + ";base64," + r.b64; });
  const resolution = ($("vidRes") && $("vidRes").value) || "";
  const duration = ($("vidDur") && $("vidDur").value) || "";
  const aspectRatio = m.aspect ? (($("vidAspect") && $("vidAspect").value) || "") : "";

  const btn = $("btnVidRun");
  vidRun.busy = true; vidRun.t0 = Date.now(); vidRun.base = ff9(VID_L.spin);
  vidRun.abort = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const sig = vidRun.abort ? vidRun.abort.signal : null;
  if (btn && btn.classList) btn.classList.add("working");
  const sp = ffSpinEnsure("vidSpin");
  if (sp) sp.className = "spin on";
  stSet("stVidGen", "");
  const rb = $("btnVidRetry"); if (rb) rb.style.display = "none";
  const cb = $("btnVidCancel");
  if (cb) { setIcnText(cb, "i-close", "cream", t("btn_cancel")); cb.style.display = ""; }
  let stage = "";
  const paint = function () { const tx = $("vidSpinTxt"); if (tx) tx.textContent = vidSpinLine(stage); };
  vidRunStopTimers();
  vidRun.tick = setInterval(paint, 1000);
  vidRun.anim = setInterval(function () { spinFrame(sp, vidRun.t0); }, 50);
  paint(); spinFrame(sp, vidRun.t0);
  try {
    const res = await V.generate(Object.assign(videoEnv(), { signal: sig }), {
      def: m, prompt: text, imageRefs: refDataUrls,
      resolution: resolution, duration: duration, aspectRatio: aspectRatio
    }, function (st, info) {
      stage = st + (st === "UPLOADING" && info && info.total ? " " + info.current + "/" + info.total : "");
      paint();
    });
    if (!res.ok) throw Object.assign(new Error((res.error && res.error.message) || "video failed"), { code: (res.error && res.error.code) || "" });
    const outs = res.results || [];
    if (!outs.length) {
      stSet("stVidGen", ff9(VID_L.noVideo), "err");
      if (rb) rb.style.display = "";
    } else {
      try { rhBookUsage(res.usage, { kind: "video", label: m.label || m.id, prov: "rh" }); } catch (e) { }
      vidHist.unshift({ url: outs[0].url, ref: outs[0].ref, prompt: text.slice(0, 120), resolution: resolution, duration: duration, ts: Date.now() });
      while (vidHist.length > 12) vidHist.pop();
      vidHistSel = 0;
      showVidResult();
      /* v6.87.0 — kept across reloads; the folder button comes on once the copy is written */
      takesRecordP("video", vidHist[0]).then(function () { const fo = $("btnVidFolder"); if (fo && vidHist[vidHistSel] && vidHist[vidHistSel].galleryFile) fo.style.display = ""; });
      stSet("stVidGen", t("st_done"), "ok");
    }
  } catch (e) {
    const cancelled = vidCancelled(e, sig);
    stSet("stVidGen", vidErrMsg(e, sig), cancelled ? "ok" : "err");
    if (!cancelled && rb) rb.style.display = "";
  }
  vidRunStopTimers();
  vidRun.abort = null; vidRun.busy = false;
  if (cb) cb.style.display = "none";
  if (btn && btn.classList) btn.classList.remove("working");
  if (sp) sp.className = "spin";
  const tx = $("vidSpinTxt"); if (tx) tx.textContent = vidRun.base;
}
/* the app's Download: the same "hnk-video-<res>-<yyyymmdd>.mp4" name, written
   into a folder the studio picks */
async function vidDownload() {
  const out = vidHist[vidHistSel];
  const btn = $("btnVidDl");
  if (!out || !btn || vidRun.dl) return;
  vidRun.dl = true;
  setIcnText(btn, "i-download", "ink", ff9(VID_L.dlBusy));
  try {
    const folder = await pickFolder();
    if (folder) {
      const d = new Date(); const p2 = function (x) { return (x < 10 ? "0" : "") + x; };
      const stamp = "" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
      await saveResultFile(folder, "hnk-video-" + (out.resolution || "") + "-" + stamp + ".mp4", await takesRefP(out));
      setStatus(t("st_done"), "ok");
    }
  } catch (e) {
    setStatus(ff9(VID_L.dlFail), "err");
  }
  vidRun.dl = false;
  setIcnText(btn, "i-download", "ink", ff9(VID_L.dl));
}
/* the app's <a href=out.url target=_blank>: the system browser opens it */
function vidOpen() {
  const out = vidHist[vidHistSel];
  if (!out || !out.url) return;
  try { require("uxp").shell.openExternal(out.url); }
  catch (e) { setStatus(friendlyErr(e), "err"); }
}
/* ============================================================
   v6.85.0 — THE V→V PAGE'S RESULT BOX, the app's vtResultBox box for box.
   The panel wrote a video→video take to disk and said "saved" on the status
   line — and that was all: no player, no strip, no way back to the clip. The
   take now lands in vtHist like the Video page's in vidHist: it plays where
   <video> decodes and is named where it does not (vid_no_inline), Download
   writes the saved bytes to a folder picked now, the direct link opens in the
   system browser, "Open the folder" shows the file, and the strip keeps every
   take (✕ per take, Clear) until the student removes it.
   ============================================================ */
let vtHist = [];
let vtHistSel = 0;
function showVtResult(scroll) {
  const out = vtHist[vtHistSel];
  const box = $("vtResultBox");
  if (!out || !box) return;
  box.className = "card result-box on";
  const vid = $("vtResultVideo");
  if (vid) {
    try {
      if (VIDEO_OK && out.url) { vid.style.display = ""; vid.src = out.url; }
      else { vid.style.display = "none"; clearSrc(vid); }
    } catch (e) { }
  }
  const note = $("vtNoInline");
  if (note) {
    if (!VIDEO_OK) { note.textContent = t("vid_no_inline").replace("{n}", String(vtHistSel + 1)); note.style.display = ""; }
    else note.style.display = "none";
  }
  const sv = $("vtSavedLine");
  if (sv) sv.textContent = ff9(VT_L.savedTo).replace("{F}", (out.folder ? out.folder + "/" : "") + (out.name || ""));
  const op = $("btnVtOpen"); if (op) op.style.display = out.url ? "" : "none";
  const fo = $("btnVtFolder"); if (fo) fo.style.display = out.folderPath ? "" : "none";   /* v6.86.0 */
  const h = $("vtHist");
  if (h) {
    while (h.firstChild) h.removeChild(h.firstChild);
    vtHist.forEach(function (e, i) {
      let v;
      if (VIDEO_OK && e.url) { v = document.createElement("video"); v.src = e.url; v.muted = true; v.preload = "metadata"; v.className = i === vtHistSel ? "sel" : ""; }
      else { v = document.createElement("div"); v.className = "hvt" + (i === vtHistSel ? " sel" : ""); v.textContent = "MP4 " + (i + 1); }
      ffPressable(v, function () { vtHistSel = i; showVtResult(false); });
      vtItemP(h, v, i);
    });
    vtClearSyncP();
  }
  if (scroll !== false) { try { box.scrollIntoView({ behavior: "smooth" }); } catch (e) { } }
}
function vtItemP(h, v, i) {
  const d = document.createElement("div"); d.className = "hitem"; d.appendChild(v);
  d.appendChild(histXBtn(function () { vtRemoveP(i); })); h.appendChild(d);
}
function vtRemoveP(i) {
  if (!vtHist[i]) return;
  takesForgetP(vtHist.splice(i, 1)[0]);   /* v6.87.0 */
  if (!vtHist.length) { vtClearP(false); setStatus(ff9(HIST_L.done), "ok"); return; }
  if (vtHistSel > i) vtHistSel--; if (vtHistSel >= vtHist.length) vtHistSel = vtHist.length - 1;
  showVtResult(false); setStatus(ff9(HIST_L.done), "ok");
}
function vtClearP(say) {
  vtHist = []; vtHistSel = 0; takesClearP("v2v");
  const h = $("vtHist"); if (h) while (h.firstChild) h.removeChild(h.firstChild);
  const box = $("vtResultBox"); if (box) box.className = "card result-box";
  vtClearSyncP();
  if (say !== false) setStatus(ff9(HIST_L.cleared), "ok");
}
function vtClearSyncP() {
  const b = $("vtHistClear"); if (!b) return;
  b.style.display = vtHist.length ? "" : "none"; b.textContent = ff9(HIST_L.clear);
  b.onclick = function () { vtClearP(true); };
}
/* Download again = the saved bytes, written to a folder the student picks now */
const vtDl = { busy: false };
async function vtDownload() {
  const out = vtHist[vtHistSel];
  const btn = $("btnVtDl");
  if (!out || vtDl.busy) return;
  vtDl.busy = true;
  if (btn) setIcnText(btn, "i-download", "ink", ff9(VID_L.dlBusy));
  try {
    const folder = await pickFolder();
    if (folder) { await saveResultFile(folder, out.name || ("hnk-videotool-" + Date.now() + ".mp4"), await takesRefP(out)); setStatus(t("st_done"), "ok"); }
  } catch (e) { setStatus(ff9(VID_L.dlFail), "err"); }
  vtDl.busy = false;
  if (btn) setIcnText(btn, "i-download", "ink", ff9(VID_L.dl));
}
function vtOpen() { const out = vtHist[vtHistSel]; if (out && out.url) openUrl(out.url); }
/* the folder the take was written to, in Finder / Explorer (shell.openPath; older hosts have none — the path is then said on the status line) */
async function vtOpenFolder(p) {
  const np = String(p || "");
  if (!np) return;
  try { if (shell && shell.openPath) { await shell.openPath(np, "Open the folder this video was saved to."); return; } } catch (e) { }
  try { const x = require("uxp"); if (x && x.shell && x.shell.openPath) { await x.shell.openPath(np, "Open the folder this video was saved to."); return; } } catch (e) { }
  setStatus(np, "ok");
}
/* ============================================================
   v6.86.0 — ONE RESULT BOX FOR EVERY PAGE THAT WRITES A CLIP. Talking Photo
   and Video Upscale ended exactly where V→V did before 6.85.0: one status
   row, "hnk-….mp4 · saved", and nothing a student could see, open or save
   again. mkTakes(pre) gives a page the app's result box, box for box, from
   its ids alone: the take plays where <video> decodes and is named where it
   does not (vid_no_inline), the saved-file line, Download again into a
   folder picked now, the direct link where the app has one, Open the folder,
   a strip with ✕ per take and Clear. tk = Talking Photo, vu = Video Upscale.
   ============================================================ */
function mkTakes(pre, L, page) {
  const Pre = pre.charAt(0).toUpperCase() + pre.slice(1);
  const id = function (s) { return pre + s; };
  const T = { list: [], sel: 0, dl: false };
  T.record = function (e) { T.list.unshift(e); while (T.list.length > 12) T.list.pop(); T.sel = 0; try { T.show(); } catch (x) { } takesRecordP(page, e); };
  T.show = function (scroll) {
    const out = T.list[T.sel]; const box = $(id("ResultBox")); if (!out || !box) return;
    box.className = "card result-box on";
    const vid = $(id("ResultVideo"));
    if (vid) { try { if (VIDEO_OK && out.url) { vid.style.display = ""; vid.src = out.url; } else { vid.style.display = "none"; clearSrc(vid); } } catch (e) { } }
    const note = $(id("NoInline"));
    if (note) { if (!VIDEO_OK) { note.textContent = t("vid_no_inline").replace("{n}", String(T.sel + 1)); note.style.display = ""; } else note.style.display = "none"; }
    const sv = $(id("SavedLine")); if (sv) sv.textContent = ff9(VT_L.savedTo).replace("{F}", (out.folder ? out.folder + "/" : "") + (out.name || ""));
    const op = $("btn" + Pre + "Open"); if (op) op.style.display = out.url ? "" : "none";
    const fo = $("btn" + Pre + "Folder"); if (fo) fo.style.display = out.folderPath ? "" : "none";
    const h = $(id("Hist"));
    if (h) {
      while (h.firstChild) h.removeChild(h.firstChild);
      T.list.forEach(function (e, i) {
        let v;
        if (VIDEO_OK && e.url) { v = document.createElement("video"); v.src = e.url; v.muted = true; v.preload = "metadata"; v.className = i === T.sel ? "sel" : ""; }
        else { v = document.createElement("div"); v.className = "hvt" + (i === T.sel ? " sel" : ""); v.textContent = "MP4 " + (i + 1); }
        ffPressable(v, function () { T.sel = i; T.show(false); });
        const d = document.createElement("div"); d.className = "hitem"; d.appendChild(v);
        d.appendChild(histXBtn(function () { T.remove(i); })); h.appendChild(d);
      });
      T.syncClear();
    }
    if (scroll !== false) { try { box.scrollIntoView({ behavior: "smooth" }); } catch (e) { } }
  };
  T.remove = function (i) {
    if (!T.list[i]) return;
    takesForgetP(T.list.splice(i, 1)[0]);
    if (!T.list.length) { T.clear(false); setStatus(ff9(HIST_L.done), "ok"); return; }
    if (T.sel > i) T.sel--; if (T.sel >= T.list.length) T.sel = T.list.length - 1;
    T.show(false); setStatus(ff9(HIST_L.done), "ok");
  };
  T.clear = function (say) {
    T.list = []; T.sel = 0; takesClearP(page);
    const h = $(id("Hist")); if (h) while (h.firstChild) h.removeChild(h.firstChild);
    const box = $(id("ResultBox")); if (box) box.className = "card result-box";
    T.syncClear();
    if (say !== false) setStatus(ff9(HIST_L.cleared), "ok");
  };
  T.syncClear = function () {
    const b = $(id("HistClear")); if (!b) return;
    b.style.display = T.list.length ? "" : "none"; b.textContent = ff9(HIST_L.clear);
    b.onclick = function () { T.clear(true); };
  };
  T.download = async function () {
    const out = T.list[T.sel]; const btn = $("btn" + Pre + "Dl");
    if (!out || T.dl) return;
    T.dl = true;
    if (btn) setIcnText(btn, "i-download", "ink", ff9(VID_L.dlBusy));
    try {
      const folder = await pickFolder();
      if (folder) { await saveResultFile(folder, out.name || ("hnk-" + pre + "-" + Date.now() + ".mp4"), await takesRefP(out)); setStatus(t("st_done"), "ok"); }
    } catch (e) { setStatus(ff9(VID_L.dlFail), "err"); }
    T.dl = false;
    if (btn) setIcnText(btn, "i-download", "ink", ff9(VID_L.dl));
  };
  T.open = function () { const out = T.list[T.sel]; if (out && out.url) openUrl(out.url); };
  T.folder = function () { const out = T.list[T.sel]; if (out && out.folderPath) vtOpenFolder(out.folderPath); };
  T.labels = function () {
    const set = function (i2, txt) { const el = $(i2); if (el) el.textContent = txt; };
    set(id("ResultH2"), ff9(L.resultH2)); set(id("HistH"), ff9(L.histH));
    if (!T.dl) setIcnText($("btn" + Pre + "Dl"), "i-download", "ink", ff9(VID_L.dl));
    if (L.openLink) setIcnText($("btn" + Pre + "Open"), "i-external", "cream", ff9(L.openLink));
    setIcnText($("btn" + Pre + "Folder"), "i-folder", "cream", ff9(VT_L.openFolder));
    T.syncClear();
  };
  T.bind = function () {
    const b1 = $("btn" + Pre + "Dl"); if (b1) b1.addEventListener("click", T.download);
    const b2 = $("btn" + Pre + "Open"); if (b2) b2.addEventListener("click", T.open);
    const b3 = $("btn" + Pre + "Folder"); if (b3) b3.addEventListener("click", T.folder);
  };
  return T;
}
const tkTakes = mkTakes("tk", TK_L, "talk");
const vuTakes = mkTakes("vu", VU_L, "upscale");

/* 6.165.0 — ONE TAP, THE NEXT TOOL (the app's vidSendTo, on this surface). A finished clip used to leave the
   panel the long way round: Download, find the file, open Video Upscale or Video Tools, Pick, find it again. Every
   video result box — Video, Video Upscale, Video Tools, Talking Photo and the video wizard's Result — now carries
   "Send to Upscale" and "Send to Video Tools": the take's bytes (this session's, or the gallery copy the takes store
   kept) become that page's picked clip — the same {name, _url} shape the pickers leave, which vtRun already reads
   and vuRun now reads too — and the page opens. Upscale offers only Video Tools. The words are the app's own,
   lifted in the video-wizard pack (VWIZ_L sendUp · sendV2v · sendBusy · sentTo · sendFail). */
const VID_SEND_PAGE = { up: "vidup", v2v: "v2v", talk: "talk", img1: "prompt" };
const VID_SEND_NAME = { up: "Video Upscale", v2v: "Video Tools", talk: "Talking Photo", img1: "IMAGE 1" };
const VID_SEND_FRAME = { talk: true, img1: true };   /* 6.166.0 — a still from the clip, only where <video> decodes */
async function vidSendTo(target, out, from, closeWiz) {
  if (!out || !VID_SEND_PAGE[target]) return false;
  setStatus(vwizL("sendBusy"), "");
  try {
    const ref = await takesRefP(out);
    if (VID_SEND_FRAME[target]) {
      let fr;
      try { fr = await vidGrabFrameP(ref); } catch (eF) { setStatus(vwizL("grabFail"), "err"); return false; }
      const pbase = "hnk-" + (from || "clip") + "-" + Date.now();   /* layerPhotoEntry adds the .jpg */
      if (target === "talk") { TK.img = layerPhotoEntry({ b64: fr.b64, mime: fr.mime, label: pbase }); try { renderTk(); } catch (e) { } }
      else { state.refs[0] = { b64: fr.b64, mime: fr.mime, label: pbase + ".jpg" }; try { renderRefs(); } catch (e) { } }
      if (closeWiz) { try { closeVWiz(); } catch (e) { } }
      switchPage(VID_SEND_PAGE[target]);
      setStatus(vwizL("sentTo").replace("{P}", VID_SEND_NAME[target]), "ok");
      return true;
    }
    const kb = Math.round(String(ref).length * 3 / 4 / 1024);
    const clip = { name: "hnk-" + (from || "clip") + "-" + Date.now() + ".mp4", _url: ref,
      _size: kb > 1024 ? (Math.round(kb / 102.4) / 10) + " MB" : kb + " KB", _sentFrom: from || "" };
    if (target === "up") { VU.video = clip; try { renderVu(); } catch (e) { } }
    else { VT.video = clip; try { renderVt(); } catch (e) { } }
    if (closeWiz) { try { closeVWiz(); } catch (e) { } }
    switchPage(VID_SEND_PAGE[target]);
    setStatus(vwizL("sentTo").replace("{P}", VID_SEND_NAME[target]), "ok");
    return true;
  } catch (e) { setStatus(vwizL("sendFail"), "err"); return false; }
}
/* the seven static buttons: which take each one sends, and where */
const VID_SEND_BTNS = [
  ["btnVidSendUp", "up", "video", function () { return vidHist[vidHistSel]; }],
  ["btnVidSendV2v", "v2v", "video", function () { return vidHist[vidHistSel]; }],
  ["btnVtSendUp", "up", "videotool", function () { return vtHist[vtHistSel]; }],
  ["btnVtSendV2v", "v2v", "videotool", function () { return vtHist[vtHistSel]; }],
  ["btnTkSendUp", "up", "talk", function () { return tkTakes.list[tkTakes.sel]; }],
  ["btnTkSendV2v", "v2v", "talk", function () { return tkTakes.list[tkTakes.sel]; }],
  ["btnVuSendV2v", "v2v", "upscale", function () { return vuTakes.list[vuTakes.sel]; }],
  /* 6.166.0 — a frame of the clip → Talking Photo's face / Freeform's IMAGE 1 (hidden where no <video> decodes) */
  ["btnVidSendTalk", "talk", "video", function () { return vidHist[vidHistSel]; }],
  ["btnVidSendImg1", "img1", "video", function () { return vidHist[vidHistSel]; }],
  ["btnVtSendTalk", "talk", "videotool", function () { return vtHist[vtHistSel]; }],
  ["btnVtSendImg1", "img1", "videotool", function () { return vtHist[vtHistSel]; }],
  ["btnTkSendTalk", "talk", "talk", function () { return tkTakes.list[tkTakes.sel]; }],
  ["btnTkSendImg1", "img1", "talk", function () { return tkTakes.list[tkTakes.sel]; }],
  ["btnVuSendTalk", "talk", "upscale", function () { return vuTakes.list[vuTakes.sel]; }],
  ["btnVuSendImg1", "img1", "upscale", function () { return vuTakes.list[vuTakes.sel]; }]
];
const VID_SEND_ICON = { up: "i-rocket", v2v: "i-clapper", talk: "i-frame", img1: "i-restore" };
const VID_SEND_KEY = { up: "sendUp", v2v: "sendV2v", talk: "grabTalk", img1: "grabImg1" };
let vidSendBound = false;
function vidSendBindP() {
  if (vidSendBound) return; vidSendBound = true;
  VID_SEND_BTNS.forEach(function (row) {
    const b = $(row[0]); if (!b) return;
    ffPressable(b, function () { const out = row[3](); if (out) vidSendTo(row[1], out, row[2], false); });
  });
}
function vidSendPaintP() {
  VID_SEND_BTNS.forEach(function (row) {
    const b = $(row[0]); if (!b) return;
    setIcnText(b, VID_SEND_ICON[row[1]], "cream", vwizL(VID_SEND_KEY[row[1]]));
    if (VID_SEND_FRAME[row[1]]) b.style.display = VIDEO_OK ? "" : "none";
  });
}

/* ============================================================
   v6.87.0 — THE TAKES SURVIVE A RELOAD. Every finished take on the four
   video pages goes through the takes store (src/app/takes-store.js): a copy
   of the bytes in the gallery folder and a record in the index. At boot the
   store is read back and each page's strip is painted from it; Download
   again reads the copy when the in-memory bytes are gone; ✕ and Clear drop
   the copy with the record; the Gallery page lists the copies as tiles and
   History lists the takes under "Videos".
   ============================================================ */
function takesStoreP() { return (globalThis.HNK && globalThis.HNK.takesStore) || null; }
const TAKE_PAGE_KEY = { video: "video", v2v: "v2v", talk: "talk", upscale: "vidup" };
async function takesRecordP(page, live) {
  const ts = takesStoreP(); if (!ts || !live) return null;
  try {
    const rec = await ts.record({ page: page, url: live.url, ref: live.ref, name: live.name, folder: live.folder, folderPath: live.folderPath,
      tool: live.tool, resolution: live.resolution, duration: live.duration, prompt: live.prompt, ts: live.ts });
    live.id = rec.id; live.galleryFile = rec.galleryFile;
    return rec;
  } catch (e) { hwarn("takes:", e); return null; }
}
function takesForgetP(live) { const ts = takesStoreP(); if (ts && live && live.id) { ts.remove(live.id).catch(function () { }); } }
function takesClearP(page) { const ts = takesStoreP(); if (ts) { ts.clear(page).catch(function () { }); } }
function takesForgetFileP(name) { const ts = takesStoreP(); if (ts && /\.mp4$/i.test(String(name || ""))) { ts.forgetFile(name).catch(function () { }); } }
/* the bytes for Download again: this session's, or the gallery copy */
async function takesRefP(out) {
  if (out && out.ref) return out.ref;
  const ts = takesStoreP();
  if (ts && out && out.galleryFile) { const u = await ts.readDataUrl(out); if (u) return u; }
  throw new Error("no saved copy");
}
async function takesOpenGalleryP() {
  const ts = takesStoreP(); if (!ts) return;
  try { const p = await ts.galleryPath(); if (p) await vtOpenFolder(p); } catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function takesRestoreP() {
  const ts = takesStoreP(); if (!ts) return;
  let all = [];
  try { all = await ts.load(); } catch (e) { hwarn("takes:", e); return; }
  if (!all.length) return;
  const by = function (p) { return all.filter(function (e) { return e.page === p; }).map(function (e) { return Object.assign({}, e); }); };
  vidHist = by("video"); vidHistSel = 0; if (vidHist.length) { try { showVidResult(); } catch (e) { } }
  vtHist = by("v2v"); vtHistSel = 0; if (vtHist.length) { try { showVtResult(false); } catch (e) { } }
  tkTakes.list = by("talk"); tkTakes.sel = 0; if (tkTakes.list.length) { try { tkTakes.show(false); } catch (e) { } }
  vuTakes.list = by("upscale"); vuTakes.sel = 0; if (vuTakes.list.length) { try { vuTakes.show(false); } catch (e) { } }
}
/* History ▸ Videos ▸ Open: the page, with that take selected */
function takesOpenP(id) {
  const ts = takesStoreP(); if (!ts) return false;
  const e = ts.list().filter(function (x) { return x.id === id; })[0]; if (!e) return false;
  const key = TAKE_PAGE_KEY[e.page]; if (!key) return false;
  switchPage(key);
  const pick = function (list, show, setSel) {
    for (let i = 0; i < list.length; i++) { if (list[i].id === id) { setSel(i); try { show(); } catch (x) { } return; } }
  };
  if (e.page === "video") pick(vidHist, showVidResult, function (i) { vidHistSel = i; });
  else if (e.page === "v2v") pick(vtHist, function () { showVtResult(true); }, function (i) { vtHistSel = i; });
  else if (e.page === "talk") pick(tkTakes.list, function () { tkTakes.show(true); }, function (i) { tkTakes.sel = i; });
  else pick(vuTakes.list, function () { vuTakes.show(true); }, function (i) { vuTakes.sel = i; });
  return true;
}
/* the app's label pass for this page, re-run on every language switch */
function vidPaintLabels() {
  try { vidSendPaintP(); } catch (e) { }   /* 6.165.0 — the send row's words */
  const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
  set("vidIntro", ff9(VID_L.intro));
  set("vidWfIntro", ff9(VID_L.wfIntro));
  const box = $("vidPromptP"); if (box) box.placeholder = ff9(VID_L.promptPh);
  set("vidResultH2", ff9(VID_L.resultH2));
  setIcnText($("vidExpireNote"), "i-warn", "hi", ff9(VID_L.expire));
  set("vidHistH", ff9(VID_L.histH));
  if (!vidRun.dl) setIcnText($("btnVidDl"), "i-download", "ink", ff9(VID_L.dl));
  setIcnText($("btnVidOpen"), "i-external", "cream", ff9(VID_L.open));
  setIcnText($("btnVidFolder"), "i-folder", "cream", ff9(VT_L.openFolder));   /* v6.87.0 */
  setIcnText($("btnVidRetry"), "i-retry", "cream", ff9(VID_L.retry));
  setIcnText($("btnVidCancel"), "i-close", "cream", t("btn_cancel"));
  const sp = ffSpinEnsure("vidSpin");
  if (sp && !vidRun.busy) { vidRun.base = ff9(VID_L.spin); const tx = $("vidSpinTxt"); if (tx) tx.textContent = vidRun.base; }
}
async function vuRun() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  if (VU.busy || !V) return;
  if (!state.rhKey) { setStatus(t("job_needkey"), "err"); return; }
  if (!VU.video) { setStatus("Pick a video first", "err"); return; }
  if (!VU.out) { setStatus("Choose a save folder first", "err"); return; }
  VU.busy = true; VU.rows = [{ label: "Working", level: "pend", detail: "uploading" }]; renderVu();
  try {
    const ref = VU.video._url || await fileToDataUrl(VU.video);   /* 6.165.0 — a clip sent on from a result box carries its bytes */
    const res = await V.upscale(videoEnv(), ref, ($("vuRes") && $("vuRes").value) || "1080p",
      function (stage, info) {
        VU.rows = [{ label: "Working", level: "pend",
          detail: stage + (info && info.elapsedMs ? " " + Math.round(info.elapsedMs / 1000) + "s" : "") }];
        renderVu();
      });
    if (!res.ok || !res.results.length) throw new Error((res.error && res.error.message) || "no video");
    try { rhBookUsage(res.usage, { kind: "video", label: "Video Upscale", prov: "rh" }); } catch (e) { }
    const name = "hnk-upscaled-" + Date.now() + ".mp4";
    await saveResultFile(VU.out, name, res.results[0].ref);
    /* v6.86.0 — the take joins the page's result box (see mkTakes) */
    vuTakes.record({ url: res.results[0].url || "", ref: res.results[0].ref, name: name, folder: VU.out.name || "", folderPath: VU.out.nativePath || "",
      tool: "Video Upscale", resolution: ($("vuRes") && $("vuRes").value) || "", ts: Date.now() });
    VU.rows = [{ label: name, level: "ok", detail: "saved" }];
    setStatus(t("st_done") || "Done", "ok");
  } catch (e) {
    VU.rows = [{ label: "Failed", level: "err", detail: (e && e.message) ? String(e.message).slice(0, 48) : "failed" }];
    setStatus(friendlyErr(e), "err");
  }
  VU.busy = false; renderVu();
}
/* ============================================================
   GALLERY — everything the panel has made (v6.52.0)

   The app's Library holds Reference and Gallery, and its Gallery is every
   result it has ever produced, with select / save / delete / clear. Results
   are written to the panel's own gallery folder (gallery-store.js), and this
   is the app's Gallery over that folder.

   v6.52.0 — the page IS the app's now: the note with its live count, the
   bulk bar, the plate grid, the picked result with its own actions, the
   empty state, and every label in the app's own nine languages. Two honest
   differences, both forced by Photoshop: a plugin cannot hand a browser a
   zip, so "save selected" writes the chosen files into a folder the studio
   picks; and the panel keeps its results as files, so the counter reads the
   panel's own cap rather than the browser's 60.
   ============================================================ */
const GAL = { files: [], sel: {}, selMode: false, pick: null, thumbs: {}, keep: {}, clearArm: 0, q: "", kind: "all", sort: "new", shown: [] };
const GAL_KEEP_FILE = "_keep.json";

/* the app's own copy for this page, lifted from its tr table and its L9
   blocks so a student reads the same sentence on both surfaces */
const GAL_L = {
  /* 6.166.0 — the Gallery tools, the app's GAL_W word for word */
  search: { my: "ရလဒ်ထဲ ရှာမယ် — prompt · workflow · ရက်စွဲ", en: "Search results — prompt · workflow · date", shn: "သွၵ်ႈႁႃၽွၼ်းလႆႈ — prompt · workflow · ဝၼ်း", kac: "Result tam u — prompt · workflow · shani", th: "ค้นหาผลลัพธ์ — prompt · workflow · วันที่", zh: "搜索结果 — 提示词 · 工作流 · 日期", vi: "Tìm kết quả — prompt · workflow · ngày", id: "Cari hasil — prompt · workflow · tanggal", ms: "Cari hasil — prompt · workflow · tarikh" },
  kAll: { my: "အားလုံး", en: "All", shn: "တင်းမူတ်း", kac: "Yawng", th: "ทั้งหมด", zh: "全部", vi: "Tất cả", id: "Semua", ms: "Semua" },
  kImg: { my: "ပုံများ", en: "Photos", shn: "ၶႅပ်းႁၢင်ႈ", kac: "Sumla ni", th: "รูปภาพ", zh: "图片", vi: "Ảnh", id: "Foto", ms: "Foto" },
  kVid: { my: "ဗီဒီယိုများ", en: "Videos", shn: "ဝီးတီးဢူဝ်ႊ", kac: "Video ni", th: "วิดีโอ", zh: "视频", vi: "Video", id: "Video", ms: "Video" },
  kKeep: { my: "★ သိမ်းထား", en: "★ Starred", shn: "★ မၢႆဝႆႉ", kac: "★ Tawn da ai", th: "★ ติดดาว", zh: "★ 已加星", vi: "★ Đã gắn sao", id: "★ Berbintang", ms: "★ Berbintang" },
  sNew: { my: "အသစ်ဆုံး အရင်", en: "Newest first", shn: "မႂ်ႇသုတ်းဢွၼ်တၢင်း", kac: "Nnan htum shawng", th: "ใหม่ล่าสุดก่อน", zh: "最新优先", vi: "Mới nhất trước", id: "Terbaru dulu", ms: "Terbaru dahulu" },
  sBig: { my: "ဖိုင် အကြီးဆုံး အရင်", en: "Largest first", shn: "ယႂ်ႇသုတ်းဢွၼ်တၢင်း", kac: "Kaba htum shawng", th: "ไฟล์ใหญ่สุดก่อน", zh: "最大优先", vi: "Lớn nhất trước", id: "Terbesar dulu", ms: "Terbesar dahulu" },
  sOld: { my: "အဟောင်းဆုံး အရင်", en: "Oldest first", shn: "ၵဝ်ႇသုတ်းဢွၼ်တၢင်း", kac: "Dingsa htum shawng", th: "เก่าสุดก่อน", zh: "最早优先", vi: "Cũ nhất trước", id: "Terlama dulu", ms: "Terlama dahulu" },
  count: { my: "{N} / {M} ပြထား", en: "{N} of {M} shown", shn: "ၼႄ {N} / {M}", kac: "{N} / {M} madun ai", th: "แสดง {N} จาก {M}", zh: "显示 {N} / {M}", vi: "Hiện {N} / {M}", id: "Menampilkan {N} dari {M}", ms: "Menunjukkan {N} daripada {M}" },
  none: { my: "ကိုက်တဲ့ ရလဒ် မရှိပါ — ရှာစာ ဒါမှမဟုတ် filter ပြောင်းကြည့်ပါ", en: "Nothing matches — change the search or the filter", shn: "ဢမ်ႇမီးဢၼ်မႅၼ်ႈ — လႅၵ်ႈသွၵ်ႈႁႃ ဢမ်ႇၼၼ် filter", kac: "Hkrak ai n nga ai — tam ai ga (sh) filter galai u", th: "ไม่มีรายการที่ตรง — ลองเปลี่ยนคำค้นหรือตัวกรอง", zh: "没有匹配项 — 换个搜索词或筛选", vi: "Không có kết quả khớp — đổi từ khóa hoặc bộ lọc", id: "Tidak ada yang cocok — ubah pencarian atau filter", ms: "Tiada yang sepadan — tukar carian atau penapis" },
  recent: { my: "နောက်ဆုံး ရလဒ်များ", en: "Recent results", shn: "ၽွၼ်းလႆႈလိုၼ်းသုတ်း", kac: "Hpang jahtum result ni", th: "ผลลัพธ์ล่าสุด", zh: "最近的结果", vi: "Kết quả gần đây", id: "Hasil terbaru", ms: "Hasil terkini" },
  note: { my: "ထုတ်ပြီးသမျှ ရလဒ်တွေ ဒီမှာ အလိုအလျောက် စုသိမ်းထားတယ် (ဖုန်းထဲမှာပဲ) — reload လုပ်လည်း မပျောက်ဘူး။",
    en: "Every result is saved here automatically (on this device only) — it survives reloads.",
    shn: "ၽွၼ်းလႆႈတင်းသဵင်ႈ သိမ်းဝႆႉတီႈၼႆႈ (ၼႂ်းၶိူင်ႈၼႆႉၵူၺ်း) — reload ၵေႃႈ ဢမ်ႇႁၢႆ",
    kac: "Lachyum yawng ndai kaw da ai (ndai jak hta sha) — reload tim n mat ai",
    th: "ผลลัพธ์ทุกภาพถูกเก็บที่นี่อัตโนมัติ (ในเครื่องนี้) — รีโหลดก็ไม่หาย",
    zh: "所有生成结果自动保存在这里（仅本设备）— 刷新也不会丢失",
    vi: "Mọi kết quả tự lưu ở đây (chỉ trên máy này) — tải lại vẫn còn",
    id: "Semua hasil tersimpan otomatis di sini (di perangkat ini) — reload tidak hilang",
    ms: "Semua hasil disimpan automatik di sini (pada peranti ini) — reload tidak hilang" },
  empty: { my: "ရလဒ် မရှိသေးပါ — Generate လုပ်ပြီးရင် ဒီမှာ ရောက်လာမယ်။",
    en: "Nothing yet — results will appear here after you Generate.",
    shn: "ပႆႇမီးၽွၼ်းလႆႈ — Generate ယဝ်ႉ တေမႃးၼႄတီႈၼႆႈ",
    kac: "Lachyum rai n nga shi ai — Generate ngut yang ndai kaw du na",
    th: "ยังไม่มีผลลัพธ์ — หลัง Generate จะมาแสดงที่นี่",
    zh: "暂无结果 — 生成后会显示在这里",
    vi: "Chưa có kết quả — sau khi Generate sẽ hiện ở đây",
    id: "Belum ada hasil — setelah Generate akan muncul di sini",
    ms: "Belum ada hasil — selepas Generate akan muncul di sini" },
  emptyGo: { my: "Workflow ကနေ စမယ်", en: "Start from Workflow", shn: "တႄႇတီႈ Workflow",
    kac: "Workflow kaw na hpang", th: "เริ่มจาก Workflow", zh: "从 Workflow 开始",
    vi: "Bắt đầu từ Workflow", id: "Mulai dari Workflow", ms: "Mula dari Workflow" },
  selOff: { my: "အများရွေးမယ်", en: "Select multiple", shn: "လိူၵ်ႈလၢႆဢၼ်", kac: "Law law lata u",
    th: "เลือกหลายรูป", zh: "多选", vi: "Chọn nhiều", id: "Pilih banyak", ms: "Pilih banyak" },
  selOn: { my: "ရွေးနေသည် — ပိတ်မယ်", en: "Selecting — done", shn: "တိုၵ်ႉလိူၵ်ႈ — သေယဝ်ႉ",
    kac: "Lata nga — ngut sai", th: "กำลังเลือก — เสร็จ", zh: "选择中 — 完成",
    vi: "Đang chọn — xong", id: "Memilih — selesai", ms: "Memilih — selesai" },
  remove: { my: "ဒီပုံ ဖယ်ထုတ်မယ်", en: "Remove from batch", shn: "ဢဝ်ဢွၵ်ႇပႅတ်ႈ", kac: "Batch kaw na shamat",
    th: "เอาออกจากชุด", zh: "从批次移除", vi: "Bỏ khỏi lô", id: "Keluarkan dari batch", ms: "Buang dari kelompok" },
  clear: { my: "Gallery အကုန်ရှင်းမယ်", en: "Clear Gallery", shn: "လၢင်ႉ Gallery တင်းမူတ်း",
    kac: "Gallery yawng shakau u", th: "ล้าง Gallery", zh: "清空 Gallery",
    vi: "Xoá sạch Gallery", id: "Bersihkan Gallery", ms: "Kosongkan Gallery" },
  clearArmed: { my: "သေချာလား? — ထပ်နှိပ်ရင် အကုန်ဖျက်မယ်", en: "Sure? Tap again to delete all",
    shn: "တႄႉႁိုဝ်? — ၼဵၵ်းထႅင်ႈသေ မွတ်ႇတင်းမူတ်း", kac: "Teng nga ai i? — bai dip yang yawng shakau na",
    th: "แน่ใจไหม? แตะอีกครั้งเพื่อลบทั้งหมด", zh: "确定吗？再点一次全部删除",
    vi: "Chắc chưa? Chạm lần nữa để xoá hết", id: "Yakin? Ketuk lagi untuk hapus semua",
    ms: "Pasti? Ketik lagi untuk padam semua" },
  keep: { my: "★ သိမ်းထား", en: "★ Protect", shn: "★ ႁၵ်ႉသႃ", kac: "★ Makawp", th: "★ ปกป้อง",
    zh: "★ 保护", vi: "★ Bảo vệ", id: "★ Lindungi", ms: "★ Lindungi" },
  kept: { my: "★ သိမ်းထားပြီး", en: "★ Protected", shn: "★ ႁၵ်ႉသႃဝႆႉ", kac: "★ Makawp da sai",
    th: "★ ปกป้องแล้ว", zh: "★ 已保护", vi: "★ Đã bảo vệ", id: "★ Dilindungi", ms: "★ Dilindungi" },
  keptOn: { my: "ဒီပုံကို ★ ထားပြီး — နေရာလွတ်ဖို့ ဘယ်တော့မှ မဖျက်တော့ပါ",
    en: "Starred — this result will never be removed to make room",
    shn: "မီး ★ ယဝ်ႉ — တေဢမ်ႇမွတ်ႇသေပွၵ်ႈ", kac: "★ tawn sai — shara lu na matu galoi mung n shamat sana",
    th: "ติดดาวแล้ว — จะไม่ถูกลบเพื่อให้มีที่ว่าง", zh: "已加星 — 不会为腾出空间而移除",
    vi: "Đã gắn sao — sẽ không bị xoá để lấy chỗ", id: "Diberi bintang — tidak akan dihapus demi ruang",
    ms: "Dibintangkan — tidak akan dipadam untuk ruang" },
  del: { my: "ဖျက်", en: "Delete", shn: "မွတ်ႇ", kac: "Shamat", th: "ลบ", zh: "删除",
    vi: "Xóa", id: "Hapus", ms: "Padam" },
  pickNone: { my: "ပုံတစ်ပုံ ရွေးပါ", en: "Pick a result first", shn: "လိူၵ်ႈၶႅပ်းၼိုင်ႈ",
    kac: "Sumla langai lata u", th: "เลือกภาพก่อน", zh: "先选一张", vi: "Hãy chọn một ảnh",
    id: "Pilih hasil dulu", ms: "Pilih hasil dahulu" }
};

/* the panel's own keep list, a file beside the pictures — the app keeps the
   same flag on its IndexedDB record */
async function galKeepFolder() {
  const uxp = require("uxp");
  const data = await uxp.storage.localFileSystem.getDataFolder();
  return data.getEntry("gallery");
}
async function galKeepLoad() {
  try {
    const uxp = require("uxp");
    const gdir = await galKeepFolder();
    const f = await gdir.getEntry(GAL_KEEP_FILE);
    const o = JSON.parse(await f.read({ format: uxp.storage.formats.utf8 }));
    GAL.keep = (o && typeof o === "object") ? o : {};
  } catch (e) { GAL.keep = {}; }
}
async function galKeepSave() {
  try {
    const uxp = require("uxp");
    const gdir = await galKeepFolder();
    const f = await gdir.createFile(GAL_KEEP_FILE, { overwrite: true });
    await f.write(JSON.stringify(GAL.keep), { format: uxp.storage.formats.utf8 });
  } catch (e) { }
}


function galSelCount() { let n = 0; for (const k in GAL.sel) n++; return n; }

/* the app's galBulkRefresh: the chip says which mode it is in, and the two
   bulk buttons appear only with a selection, each carrying its count */
function galBulkRefresh() {
  const m = $("galSelMode");
  if (m) {
    m.className = "chip" + (GAL.selMode ? " on" : "");
    setIcnText(m, "i-stack", GAL.selMode ? "ink" : "cream", ff9(GAL.selMode ? GAL_L.selOn : GAL_L.selOff));
  }
  const n = galSelCount();
  const z = $("galZipSel"), dl = $("galDelSel");
  if (z) { z.style.display = (GAL.selMode && n) ? "" : "none"; setIcnText(z, "i-download", "cream", t("btn_save") + " (" + n + ")"); }
  if (dl) { dl.style.display = (GAL.selMode && n) ? "" : "none"; setIcnText(dl, "i-trash", "cream", ff9(GAL_L.remove) + " (" + n + ")"); }
  galClearSync();
}
/* the app's two-tap clear: the second tap inside four seconds is the one
   that deletes, and a starred result survives it */
function galClearSync() {
  const b = $("galClearAll"); if (!b) return;
  const armed = Date.now() - GAL.clearArm < 4000;
  b.className = "btn" + (armed ? " btn-gold" : "");
  setIcnText(b, "i-trash", armed ? "ink" : "cream", ff9(armed ? GAL_L.clearArmed : GAL_L.clear));
}

/* v6.87.0 — a video take's copy: no thumbnail is read (Photoshop decodes no video; the file is megabytes), the tile names its page and time */
function galIsVideo(name) { return /\.mp4$/i.test(String(name || "")); }
function galVideoLabel(name) {
  const ts = takesStoreP();
  const e = ts ? ts.list().filter(function (x) { return x.galleryFile === name; })[0] : null;
  const pageOf = function (p) { return ({ video: "Video", v2v: "V\u2192V", talk: "Talking Photo", upscale: "Upscale" })[p] || p; };
  if (e) return pageOf(e.page) + " \u00b7 " + vwizClock(e.ts);
  const mm = /^([a-z0-9]+)-(\d+)\.mp4$/i.exec(String(name || ""));
  return mm ? pageOf(mm[1]) + " \u00b7 " + vwizClock(parseInt(mm[2], 10)) : "MP4";
}
async function galThumb(f) {
  if (galIsVideo(f.name)) return "";
  if (GAL.thumbs[f.name]) return GAL.thumbs[f.name];
  try {
    const url = await fileToDataUrl(f);
    GAL.thumbs[f.name] = url;
    return url;
  } catch (e) { return ""; }
}

function renderGal() {
  const grid = $("galGrid");
  const note = $("galNote");
  /* v6.59.0 — a count, not a countdown: the store no longer deletes anything
     to make room, so there is no ceiling to report a distance from. */
  if (note) note.textContent = ff9(GAL_L.note) + " · " + GAL.files.length;
  const empty = $("galEmpty");
  /* 6.166.0 — the view: search · kind · sort over the same files (nothing moved or deleted) */
  const shown = galApplyView(GAL.files); GAL.shown = shown; galToolsPaint();
  const cnt = $("galCount");
  if (cnt) cnt.textContent = GAL.files.length ? (ff9(GAL_L.count).replace("{N}", String(shown.length)).replace("{M}", String(GAL.files.length)) + (shown.length ? "" : " · " + ff9(GAL_L.none))) : "";
  if (empty) empty.className = "empty-state" + (GAL.files.length ? "" : " on");
  if (GAL.pick && !GAL.files.some(function (f) { return f.name === GAL.pick; })) GAL.pick = null;
  const pickBox = $("galPick");
  if (pickBox) pickBox.style.display = GAL.pick ? "" : "none";
  galBulkRefresh();
  if (!grid) return;
  grid.innerHTML = "";
  shown.forEach(function (f) {
    const onTap = function () {
      if (GAL.selMode) {
        if (GAL.sel[f.name]) delete GAL.sel[f.name]; else GAL.sel[f.name] = true;
        renderGal();
        return;
      }
      GAL.pick = f.name;
      galPaintPick();
      renderGal();
    };
    if (galIsVideo(f.name)) {   /* v6.87.0 */
      const tile = document.createElement("div");
      tile.className = "gal-vid" + (((GAL.selMode && GAL.sel[f.name]) || GAL.pick === f.name) ? " sel" : "");
      const t1 = document.createElement("div"); t1.textContent = "MP4"; tile.appendChild(t1);
      const t2 = document.createElement("div"); t2.className = "gal-vid-n"; t2.textContent = galVideoLabel(f.name); tile.appendChild(t2);
      ffPressable(tile, onTap);
      grid.appendChild(tile);
      return;
    }
    const im = document.createElement("img");
    im.alt = f.name;
    im.className = ((GAL.selMode && GAL.sel[f.name]) || GAL.pick === f.name) ? "sel" : "";
    /* v6.58.1 — the thumbnail enters the document long before galThumb answers,
       and this renderer raises a load error for every <img> it finds without a
       src. Seven gallery items, seven errors on the owner's card. */
    im.src = IMG_BLANK;
    galThumb(f).then(function (url) { if (url) im.src = url; });
    im.addEventListener("click", onTap);
    grid.appendChild(im);
  });
}

/* 6.166.0 — GALLERY TOOLS (the app's galApplyView): the search matches the file name and a video's page label,
   the kind is photo / video / starred, the sort reads the timestamp every stored name carries (page-<ts>.mp4,
   hnk-<ts>.png) — newest, oldest, or the biggest file where the entry knows its size */
function galStamp(name) { const mm = /(\d{10,13})/.exec(String(name || "")); return mm ? parseInt(mm[1], 10) : 0; }
function galApplyView(files) {
  const q = String(GAL.q || "").trim().toLowerCase();
  let out = files.filter(function (f) {
    const vid = galIsVideo(f.name);
    if (GAL.kind === "image" && vid) return false;
    if (GAL.kind === "video" && !vid) return false;
    if (GAL.kind === "keep" && !GAL.keep[f.name]) return false;
    if (!q) return true;
    const label = vid ? galVideoLabel(f.name) : "";
    return (String(f.name || "") + " " + label).toLowerCase().indexOf(q) >= 0;
  });
  if (GAL.sort === "old") out.sort(function (a, b) { return galStamp(a.name) - galStamp(b.name); });
  else if (GAL.sort === "big") out.sort(function (a, b) { return (b.size || 0) - (a.size || 0); });
  else out.sort(function (a, b) { return galStamp(b.name) - galStamp(a.name); });
  return out;
}
function galToolsPaint() {
  const sIn = $("galSearch"); if (sIn) sIn.placeholder = ff9(GAL_L.search);
  /* the app's two <select>s — here behind the panel's own .hsl picker (a native select never opens in Photoshop) */
  const fill = function (id, valId, rows, cur) {
    const sel = $(id); if (!sel) return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    let label = "";
    rows.forEach(function (r) {
      const o = document.createElement("option"); o.value = r[0]; o.textContent = ff9(r[1]); sel.appendChild(o);
      if (r[0] === cur) label = o.textContent;
    });
    sel.value = cur;
    const v = $(valId); if (v) v.textContent = label;
  };
  fill("galKind", "galKindVal", [["all", GAL_L.kAll], ["image", GAL_L.kImg], ["video", GAL_L.kVid], ["keep", GAL_L.kKeep]], GAL.kind);
  fill("galSort", "galSortVal", [["new", GAL_L.sNew], ["old", GAL_L.sOld], ["big", GAL_L.sBig]], GAL.sort);
}
function bindGalleryTools() {
  const sIn = $("galSearch"); let tm = null;
  if (sIn) sIn.addEventListener("input", function () { GAL.q = sIn.value; clearTimeout(tm); tm = setTimeout(renderGal, 160); });
  const k = $("galKind"); if (k) k.addEventListener("change", function () { GAL.kind = k.value; renderGal(); });
  const so = $("galSort"); if (so) so.addEventListener("change", function () { GAL.sort = so.value; renderGal(); });
}
/* 6.166.0 — HOME: the app's recent-results strip. The Home screen (home-screen.js) asks for the newest six
   stored results and paints them; a tap opens the Gallery on that one. */
function homeRecentListP(n) {
  const gs = globalThis.HNK && globalThis.HNK.galleryStore;
  if (!gs) return Promise.resolve([]);
  return gs.list().then(function (all) {
    const files = all.filter(function (f) { return f.name !== GAL_KEEP_FILE; }).sort(function (a, b) { return galStamp(b.name) - galStamp(a.name); }).slice(0, n || 6);
    return Promise.all(files.map(function (f) {
      const vid = galIsVideo(f.name);
      return (vid ? Promise.resolve(null) : galThumb(f).catch(function () { return null; })).then(function (url) {
        return { name: f.name, video: vid, thumb: url || null, label: vid ? galVideoLabel(f.name) : f.name };
      });
    }));
  }).catch(function () { return []; });
}
function homeRecentOpen(name) { GAL.pick = name; switchPage("gallery"); try { galPaintPick(); renderGal(); } catch (e) { } }
function galPickFile() {
  for (let i = 0; i < GAL.files.length; i++) if (GAL.files[i].name === GAL.pick) return GAL.files[i];
  return null;
}
function galPaintPick() {
  const f = galPickFile();
  const box = $("galPick");
  if (!f) { if (box) box.style.display = "none"; return; }
  if (box) box.style.display = "";
  const im = $("galPickImg");
  const isVid = galIsVideo(f.name);   /* v6.87.0 — a video: no picture, its page + time, Open the folder, no IMAGE slots */
  if (im) { im.style.display = isVid ? "none" : ""; if (isVid) im.src = IMG_BLANK; }
  if (!isVid) galThumb(f).then(function (url) { if (im && url) im.src = url; });
  const info = $("galPickInfo");
  if (info) info.textContent = isVid ? (galVideoLabel(f.name) + " \u00b7 " + f.name) : f.name;
  const s1 = $("galToImg1"), s2 = $("galToImg2"), fo = $("galOpenFolder");
  if (s1) s1.style.display = isVid ? "none" : "";
  if (s2) s2.style.display = isVid ? "none" : "";
  if (fo) { fo.style.display = isVid ? "" : "none"; setIcnText(fo, "i-folder", "cream", ff9(VT_L.openFolder)); }
  const keep = $("galKeep");
  if (keep) {
    keep.className = "btn" + (GAL.keep[f.name] ? " btn-gold" : "");
    setIcnText(keep, GAL.keep[f.name] ? "i-star-fill" : "i-star", GAL.keep[f.name] ? "ink" : "cream",
      ff9(GAL.keep[f.name] ? GAL_L.kept : GAL_L.keep));
  }
}

async function galRefresh() {
  const gs = globalThis.HNK && globalThis.HNK.galleryStore;
  const all = gs ? await gs.list() : [];
  GAL.files = all.filter(function (f) { return f.name !== GAL_KEEP_FILE; });
  const live = {};
  GAL.files.forEach(function (f) { if (GAL.sel[f.name]) live[f.name] = true; });
  GAL.sel = live;
  await galKeepLoad();
  renderGal();
  galPaintPick();
}

async function galSaveFiles(files) {
  const uxp = require("uxp");
  const out = await uxp.storage.localFileSystem.getFolder();
  if (!out) return 0;
  let n = 0;
  for (let i = 0; i < files.length; i++) {
    const buf = await files[i].read({ format: uxp.storage.formats.binary });
    const dst = await out.createFile(files[i].name, { overwrite: true });
    await dst.write(buf, { format: uxp.storage.formats.binary });
    n++;
  }
  return n;
}
async function galSaveSelected() {
  const picked = GAL.files.filter(function (f) { return GAL.sel[f.name]; });
  if (!picked.length) { setStatus(ff9(GAL_L.pickNone), "err"); return; }
  try { setStatus(await galSaveFiles(picked) + " · " + t("btn_save"), "ok"); }
  catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function galDeleteSelected() {
  const gs = globalThis.HNK && globalThis.HNK.galleryStore;
  const names = Object.keys(GAL.sel);
  if (!gs || !names.length) { setStatus(ff9(GAL_L.pickNone), "err"); return; }
  for (let i = 0; i < names.length; i++) { await gs.remove(names[i]); delete GAL.keep[names[i]]; delete GAL.thumbs[names[i]]; takesForgetFileP(names[i]); }
  GAL.sel = {};
  await galKeepSave();
  await galRefresh();
  setStatus(names.length + " · " + ff9(GAL_L.del), "ok");
}

/* the picked result's own row — the app's five actions, in its order */
async function galSavePick() {
  const f = galPickFile();
  if (!f) { setStatus(ff9(GAL_L.pickNone), "err"); return; }
  try { if (await galSaveFiles([f])) setStatus(t("btn_save"), "ok"); }
  catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function galToSlot(idx) {
  const f = galPickFile();
  if (!f || galIsVideo(f.name)) { setStatus(ff9(GAL_L.pickNone), "err"); return; }
  try {
    const url = await galThumb(f);
    if (!url) throw new Error("unreadable");
    state.refs[idx] = { b64: String(url).split(",")[1], mime: extToMime(f.name), label: f.name };
    renderRefs();
    setStatus("IMAGE " + (idx + 1), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function galToggleKeep() {
  const f = galPickFile();
  if (!f) return;
  if (GAL.keep[f.name]) delete GAL.keep[f.name]; else GAL.keep[f.name] = 1;
  await galKeepSave();
  galPaintPick();
  if (GAL.keep[f.name]) setStatus(ff9(GAL_L.keptOn), "ok");
}
async function galDeletePick() {
  const f = galPickFile();
  const gs = globalThis.HNK && globalThis.HNK.galleryStore;
  if (!f || !gs) return;
  await gs.remove(f.name);
  delete GAL.keep[f.name];
  delete GAL.thumbs[f.name];
  takesForgetFileP(f.name);   /* v6.87.0 */
  GAL.pick = null;
  await galKeepSave();
  await galRefresh();
}

function bindGallery() {
  const sel = $("galSelMode");
  if (sel) sel.addEventListener("click", function () {
    GAL.selMode = !GAL.selMode; if (!GAL.selMode) GAL.sel = {};
    renderGal();
  });
  const sv = $("galZipSel"); if (sv) sv.addEventListener("click", galSaveSelected);
  const dl = $("galDelSel"); if (dl) dl.addEventListener("click", galDeleteSelected);
  bindGalleryTools();   /* 6.166.0 */
  const cl = $("galClearAll");
  if (cl) cl.addEventListener("click", async function () {
    if (Date.now() - GAL.clearArm >= 4000) {
      GAL.clearArm = Date.now(); galClearSync();
      setTimeout(galClearSync, 4200);
      return;
    }
    GAL.clearArm = 0;
    const gs = globalThis.HNK && globalThis.HNK.galleryStore;
    let dropped = 0, kept = 0;
    if (gs) {
      for (let i = 0; i < GAL.files.length; i++) {
        const n = GAL.files[i].name;
        if (GAL.keep[n]) { kept++; continue; }
        await gs.remove(n); dropped++; takesForgetFileP(n);
      }
    }
    GAL.sel = {}; GAL.pick = null; GAL.thumbs = {};
    await galRefresh();
    setStatus(dropped + " · " + ff9(GAL_L.del) + (kept ? " — ★ " + kept : ""), "ok");
  });
  const go = $("galEmptyGo");
  if (go) go.addEventListener("click", function () { switchPage("wf"); saveSettings(); });
  const dlp = $("galDl"); if (dlp) dlp.addEventListener("click", galSavePick);
  const i1 = $("galToImg1"); if (i1) i1.addEventListener("click", function () { galToSlot(0); });
  const i2 = $("galToImg2"); if (i2) i2.addEventListener("click", function () { galToSlot(1); });
  const kp = $("galKeep"); if (kp) kp.addEventListener("click", galToggleKeep);
  const gof = $("galOpenFolder"); if (gof) gof.addEventListener("click", function () { takesOpenGalleryP(); });   /* v6.87.0 */
  const dp = $("galDel"); if (dp) dp.addEventListener("click", galDeletePick);
  galPaintLabels();
  REFRESHERS.push(function () { try { galPaintLabels(); } catch (e) { hwarn("gallery:", e); } });
  galRefresh();
}
/* the app's label pass for this page, re-run on every language switch */
function galPaintLabels() {
  const emptyTxt = $("galEmptyTxt"); if (emptyTxt) emptyTxt.textContent = ff9(GAL_L.empty);
  setIcnText($("galEmptyGo"), "i-brain", "ink", ff9(GAL_L.emptyGo));
  setIcnText($("galDl"), "i-download", "ink", t("btn_save"));
  setIcnText($("galToImg1"), "i-restore", "cream", "IMAGE 1");
  setIcnText($("galToImg2"), "i-restore", "cream", "IMAGE 2");
  setIcnText($("galDel"), "i-trash", "cream", ff9(GAL_L.del));
  const note = $("galNote");
  if (note) note.textContent = ff9(GAL_L.note) + " · " + GAL.files.length;
  galBulkRefresh();
  galPaintPick();
}

/* v6.107.1 — IN STAGES, each guarded. The owner's Photoshop showed this page
   with its labels unpainted (#vidWfIntro empty), its shelf empty and its three
   picker faces blank: everything after the first throw. Which statement threw
   is what the self-test card now reports; and whichever it is, the stages
   after it paint anyway. */
function bindVideo() {
  const V = globalThis.HNK && globalThis.HNK.runninghubVideo;
  const sel = $("vidModel");
  safe("video:models", function () {
    if (sel && V) {
      /* v6.51.0 — the app's family-grouped picker, painted onto the IC tile */
      vidFillModels(sel, V.models());
      sel.addEventListener("change", vidPaintOptions);
      sel.addEventListener("change", function () { renderRefs(); });   /* v6.21.0 — the strip's slot count follows the model */
    }
  });
  /* the app's five video buttons: generate, cancel, retry, download, open */
  safe("video:buttons", function () {
    const run = $("btnVidRun"); if (run) run.addEventListener("click", vidGenerate);
    const cancel = $("btnVidCancel");
    if (cancel) cancel.addEventListener("click", function () { if (vidRun.abort) vidRun.abort.abort(); });
    const retry = $("btnVidRetry");
    if (retry) retry.addEventListener("click", function () {
      if (vidRun.busy) return;
      retry.style.display = "none";
      vidGenerate();
    });
    const dl = $("btnVidDl"); if (dl) dl.addEventListener("click", vidDownload);
    const open = $("btnVidOpen"); if (open) open.addEventListener("click", vidOpen);
    const vfo = $("btnVidFolder"); if (vfo) vfo.addEventListener("click", function () { takesOpenGalleryP(); });   /* v6.87.0 */
    vidSendBindP();   /* 6.165.0 — the send rows on all four result boxes */
    const box = $("vidPromptP");
    if (box) box.addEventListener("input", vidPaintPromptCount);
  });
  /* the app's nine-language copy, repainted on every language change */
  safe("video:labels", vidPaintLabels);
  safe("video:shelf", renderVidWf);
  REFRESHERS.push(function () {
    try { vidPaintLabels(); } catch (e) { hwarn("video:", e); }
    try { vidPaintOptions(); } catch (e) { hwarn("video:", e); }
    try { renderVidWf(); } catch (e) { hwarn("video:", e); }
  });

  /* the app labels these 720p / 1080p / 2K / 4K; the values stay the
     endpoint's own lowercase tiers */
  safe("vidup:models", function () {
    const vuSel = $("vuRes");
    if (vuSel) {
      const tiers = (V && V.upscaleResolutions) || ["1080p"];
      while (vuSel.firstChild) vuSel.removeChild(vuSel.firstChild);
      tiers.forEach(function (v) { vuSel.appendChild(mkOption(String(v), String(v).replace(/k$/, "K"))); });
      try { vuSel.value = "1080p"; } catch (e) { }
      vuSel.addEventListener("change", vuPaintHsl);
    }
  });
  safe("vidup:buttons", function () {
    const vp = $("btnVuPickP");
    if (vp) vp.addEventListener("click", async function () {
      /* v6.6.3 — the upscaler is one of the MP4-only endpoints. The app has
         always refused a .mov here and said so; the panel offered one and let
         the student find out after the submit had been charged. It asks the
         same lifted table the video-tool picker does, so the two surfaces
         cannot disagree about what this one endpoint takes. */
      try {
        const VC = globalThis.HNK && globalThis.HNK.videoContainers;
        const ap = (V && V.upscaleApiPath) || "rhart-video/video-upscaler";
        const types = VC ? VC.containers(ap) : ["mp4"];
        const f = await pickFile(types);
        if (f && VC && !VC.accepts(ap, f.name)) { setStatus(ff9(VU_L.format), "err"); return; }
        if (f) VU.video = f;
        renderVu();
      }
      catch (e) { setStatus(friendlyErr(e), "err"); }
    });
    const vs = $("btnVuSave");
    if (vs) vs.addEventListener("click", async function () {
      try { const f = await pickFolder(); if (f) VU.out = f; renderVu(); }
      catch (e) { setStatus(friendlyErr(e), "err"); }
    });
    const vr = $("btnVuRun"); if (vr) vr.addEventListener("click", vuRun);
    vuTakes.bind();   /* v6.86.0 — the result box's controls */
    vidSendBindP();   /* 6.165.0 */
  });

  /* v6.50.0 — VIDEO TOOLS */
  safe("v2v:models", function () {
    const vtSel = $("vtModel");
    if (vtSel && V && V.tools) {
      const tl = V.tools();
      while (vtSel.firstChild) vtSel.removeChild(vtSel.firstChild);
      for (let i = 0; i < tl.length; i++) vtSel.appendChild(mkOption(tl[i].id, tl[i].label || tl[i].id));
      vtSel.addEventListener("change", vtPaintOptions);
    }
    /* the styled label over each option select is painted from the select's own
       change, exactly as the app does it — without this a student picks 4K and
       goes on reading 1080p */
    ["vtOpt", "vtOpt2"].forEach(function (id) {
      const s = $(id);
      if (s) s.addEventListener("change", vuPaintHsl);
    });
  });
  safe("v2v:buttons", function () {
    const vtp = $("btnVtPick");
    if (vtp) vtp.addEventListener("click", async function () {
      /* v6.6.3 — ASK THE TOOL, do not offer everything. This picker used to
         hand mp4/mov/webm to every endpoint, so a student could choose an
         iPhone .mov for one of the twenty-three video tools that document MP4
         only — and find out after the submit had already been charged. The
         containers come from the app's own lifted table now, per endpoint. */
      try {
        const d = vtDef();
        const VC = globalThis.HNK && globalThis.HNK.videoContainers;
        const types = (VC && d && d.apiPath) ? VC.containers(d.apiPath) : ["mp4"];
        const f = await pickFile(types);
        if (f && VC && d && d.apiPath && !VC.accepts(d.apiPath, f.name)) {
          setStatus(ff9(VT_L.container).replace("{L}", types.join("/").toUpperCase()), "err");
          return;
        }
        if (f) VT.video = f;
        renderVt();
      }
      catch (e) { setStatus(friendlyErr(e), "err"); }
    });
    const vti = $("btnVtImgPick");
    /* v6.107.2 — the tool's reference photo can be the open layer */
    if (vti) vti.addEventListener("click", function () {
      photoSheet(ff9(VT_L.pickImg), {
        onLayer: async function () {
          const e = await layerPhotoCapture();
          if (e) { VT.img = e; renderVt(); setStatus(t("st_ref_layer_added"), "ok"); }
        },
        onFile: async function () {
          try { const f = await pickFile(["jpg", "jpeg", "png", "webp"]); if (f) VT.img = f; renderVt(); }
          catch (e) { setStatus(friendlyErr(e), "err"); }
        },
        onLast: function () {
          VT.img = layerPhotoEntry({ b64: state.resultB64, mime: state.resultMime || "image/png", label: "result" });
          renderVt();
        }
      });
    });
    const vfc = $("btnVtFileClear");
    if (vfc) vfc.addEventListener("click", function () { VT.video = null; renderVt(); });
    const vic = $("btnVtImgClear");
    if (vic) vic.addEventListener("click", function () { VT.img = null; renderVt(); });
    const vts = $("btnVtSave");
    if (vts) vts.addEventListener("click", async function () {
      try { const f = await pickFolder(); if (f) VT.out = f; renderVt(); }
      catch (e) { setStatus(friendlyErr(e), "err"); }
    });
    const vtr = $("btnVtRun"); if (vtr) vtr.addEventListener("click", vtRun);
    /* v6.85.0 — the result box's two controls */
    const vtd = $("btnVtDl"); if (vtd) vtd.addEventListener("click", vtDownload);
    const vto = $("btnVtOpen"); if (vto) vto.addEventListener("click", vtOpen);
    const vtf = $("btnVtFolder"); if (vtf) vtf.addEventListener("click", function () { const o = vtHist[vtHistSel]; if (o && o.folderPath) vtOpenFolder(o.folderPath); });   /* v6.86.0 */
  });

  /* the app's nine-language copy for both halves of this page */
  safe("vidup:labels", vuPaintLabels);
  REFRESHERS.push(function () { try { vuPaintLabels(); } catch (e) { hwarn("vidup:", e); } });

  safe("video:paint", vidPaintOptions);
  safe("vidup:paint", renderVu);
  safe("v2v:paint", vtPaintOptions);
}

function bindDiag() {
  /* v6.107.1 — ONE GUARD PER PAGE. These five ran as a single unguarded
     sequence inside safe("diag"): a throw anywhere in bindSetup skipped the
     Path, Video, Gallery AND Talk binds, so the owner's Photoshop showed the
     Video page's model list empty, its faces blank, its shelf empty, Talk's
     button without a label and Setup's Version buttons bare — five symptoms of
     one line, and the line itself never named. Each page now fails alone, and
     the self-test card names which one. */
  safe("drops", bindDrops);   /* 6.166.0 — drag & drop onto every picker (static elements; bound before the pages) */
  safe("setup", bindSetup);
  safe("path", bindPath);
  safe("video", bindVideo);
  safe("gallery", bindGallery);
  safe("talk", bindTalk);
}

/* ============================================================
   Reference Image Library — one user-selected folder, remembered
   via a persistent token, feeding a universal Browse button on every
   reference slot. UXP-safe: user picks the folder once (getFolder),
   we keep a persistent token (never a hard-coded path, never the
   read-only plugin package), and reopen the native picker inside it.
   ============================================================ */
const REF_LIB_TYPES = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "psd"];
const REF_LIB_DIRECT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const REF_SCAN_MAX = 5000;   /* safety cap so a huge library never hangs the panel */
const REF_SCAN_DEPTH = 4;    /* recurse a few subfolder levels (Backgrounds/Faces/…) */

/* Every physical reference slot, with a stable id, a nominal role, its Browse
   button id, and how a chosen image is assigned — so one controller serves them
   all and an image can never land in the wrong slot. */
const REF_SLOTS = [
  { id: "freeform-image-1", role: "subject", btn: null, assign: function (cap) { state.subj = cap; renderRefs(); } }, /* v6.51.0 — Freeform IMG 1 */
  { id: "subject-reference", role: "subject", btn: "refLib0", assign: function (cap) { state.refs[0] = cap; renderRefs(); } },
  { id: "reference-2", role: "reference", btn: "refLib1", assign: function (cap) { state.refs[1] = cap; renderRefs(); } },
  { id: "create-reference-1", role: "create", btn: "cRefLib0", assign: function (cap) { state.cRefs[0] = cap; paintCreateRefs(); } },
  { id: "create-reference-2", role: "create", btn: "cRefLib1", assign: function (cap) { state.cRefs[1] = cap; paintCreateRefs(); } },
  { id: "create-reference-3", role: "create", btn: "cRefLib2", assign: function (cap) { state.cRefs[2] = cap; paintCreateRefs(); } },
  { id: "create-reference-4", role: "create", btn: "cRefLib3", assign: function (cap) { state.cRefs[3] = cap; paintCreateRefs(); } }
];
function refSlotById(id) {
  for (let i = 0; i < REF_SLOTS.length; i++) if (REF_SLOTS[i].id === id) return REF_SLOTS[i];
  return null;
}
function refExtOf(name) {
  const nm = String(name || "");
  return (nm.indexOf(".") >= 0 ? nm.split(".").pop() : "").toLowerCase();
}
function refIsDirect(ext) { return !!REF_LIB_DIRECT[ext]; }
function refNativePath(folder) {
  try { if (fsp && fsp.getNativePath && folder) { const p = fsp.getNativePath(folder); if (p) return String(p); } } catch (e) { }
  return (folder && folder.nativePath) ? String(folder.nativePath) : "";
}

/* Read a chosen file entry into the pipeline's {b64,mime,label} — direct-decode
   jpg/png/webp, route tif/psd through Photoshop. Rejects unsupported types. */
async function refCaptureEntry(f) {
  const name = (f && f.name) ? f.name : "file";
  const ext = refExtOf(name);
  if (REF_LIB_TYPES.indexOf(ext) < 0) throw new Error("HNKERR:err_unsupported:" + ext);
  if (REF_LIB_DIRECT[ext]) {
    const buf = await entryReadBinary(f);   /* 6.166.0 — a dropped DOM File reads too */
    if (buf && buf.byteLength === 0) throw new Error("HNKERR:err_img:empty file");
    return { b64: bufToB64(buf), mime: REF_LIB_DIRECT[ext], label: name };
  }
  return captureFileViaPS(f, name, 1536);
}

async function refLibChooseFolder() {
  let folder = null;
  try { folder = await fsp.getFolder(); } catch (e) { hwarn("lib getFolder:", e); }
  if (!folder) return null;
  try { state.libToken = await fsp.createPersistentToken(folder); }
  catch (e) { hwarn("lib token:", e); state.libToken = ""; }
  state.libFolderName = folder.name || "";
  state.libNativePath = refNativePath(folder);
  hlog("lib folder selected:", state.libFolderName);
  await refLibScan(folder);
  saveSettings();
  return folder;
}

async function refLibGetFolder() {
  if (!state.libToken) return null;
  try {
    const folder = await fsp.getEntryForPersistentToken(state.libToken);
    return folder || null;
  } catch (e) {
    hwarn("lib token restore failed:", e);
    refLibHandleExpired();
    return null;
  }
}

function refLibHandleExpired() {
  state.libToken = ""; state.libImgCount = 0;
  hwarn("lib folder access lost — reselect required");
  saveSettings();
}

/* Count supported images recursively, yielding often so a large library never
   freezes Photoshop, and stopping at a hard cap. */
async function refLibCountImages(folder, depth, acc) {
  if (depth > REF_SCAN_DEPTH || acc.count >= REF_SCAN_MAX) return;
  let entries = [];
  try { entries = await folder.getEntries(); } catch (e) { hwarn("lib scan entries:", e); return; }
  for (let i = 0; i < entries.length; i++) {
    if (acc.count >= REF_SCAN_MAX) { acc.capped = true; return; }
    const en = entries[i];
    if (en && (en.isFolder || en.isDirectory)) {
      await refLibCountImages(en, depth + 1, acc);
    } else if (en) {
      if (REF_LIB_TYPES.indexOf(refExtOf(en.name)) >= 0) acc.count++;
    }
    if ((i & 63) === 0) await sleep(0);
  }
}
async function refLibScan(folder) {
  const acc = { count: 0, capped: false };
  hlog("lib scan started");
  try { await refLibCountImages(folder, 0, acc); } catch (e) { hwarn("lib scan:", e); }
  state.libImgCount = acc.count;
  state.libLastScan = Date.now();
  hlog("lib scan finished:", acc.count, acc.capped ? "(capped)" : "");
  return acc;
}

/* THE universal Browse: first use asks for the library folder then continues
   automatically; afterwards the picker opens inside the saved folder. A chosen
   image is assigned only to the requesting slot; a cancel leaves the slot as-is. */
/* v6.79.0 — a slot filled from one file, with no library folder in the way */
async function refFileInto(slotId) {
  if (state.busy) return;
  const slot = refSlotById(slotId);
  if (!slot) return;
  try {
    setStatus(t("st_importing"));
    let file = null;
    try { file = await fsp.getFileForOpening({ allowMultiple: false, types: REF_LIB_TYPES }); } catch (e) { file = null; }
    if (!file) { setStatus(t("st_ready")); return; }
    const cap = await refCaptureEntry(file);
    if (!cap || !imgMagicOk(cap.b64)) { setStatus(t("st_img_bad"), "err"); return; }
    slot.assign(cap);
    setStatus(t("st_ref_file_added"), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
/* v6.79.0 — a slot filled from the active layer */
async function refLayerInto(slotId) {
  const slot = refSlotById(slotId);
  if (!slot) return;
  const e = await layerPhotoCapture();
  if (!e) return;
  slot.assign({ b64: e.b64, mime: e.mime, label: e.name });
  setStatus(t(slotId === "subject-reference" ? "st_photo_layer_added" : "st_ref_layer_added"), "ok");
}
function stPickInto(slotId, title) {
  photoSheet(title, {
    onLayer: function () { refLayerInto(slotId); },
    onFile: function () { refFileInto(slotId); }
  });
}
async function refLibBrowseInto(slotId) {
  if (state.busy) return;
  const slot = refSlotById(slotId);
  if (!slot) { hwarn("lib unknown slot:", slotId); return; }
  try {
    let folder = await refLibGetFolder();
    if (!folder) {
      setStatus(t("lib_choose_msg"));
      folder = await refLibChooseFolder();
      if (!folder) { setStatus(t("st_ready")); return; }
    }
    setStatus(t("st_importing"));
    let file = null;
    try {
      file = await fsp.getFileForOpening({ initialLocation: folder, allowMultiple: false, types: REF_LIB_TYPES });
    } catch (e) {
      hwarn("lib picker initialLocation:", e);
      file = await fsp.getFileForOpening({ allowMultiple: false, types: REF_LIB_TYPES });
    }
    if (!file) { setStatus(t("st_ready")); return; } /* cancelled → keep existing image */
    hlog("lib browse opened:", slotId);
    const cap = await refCaptureEntry(file);
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad") + " (Ref)", "err"); return; }
    slot.assign(cap);
    /* persist a per-slot token for restore (direct formats only — PSD/TIFF would
       need Photoshop reopened at startup, so those are re-picked each session) */
    const ext = refExtOf(file.name);
    if (refIsDirect(ext)) {
      try { const tok = await fsp.createPersistentToken(file); if (tok) { state.refTokens[slotId] = tok; saveSettings(); } }
      catch (e) { hwarn("lib slot token:", e); }
    } else if (state.refTokens[slotId]) { delete state.refTokens[slotId]; saveSettings(); }
    hlog("lib image selected:", slotId, cap.label);
    setStatus(t("st_ref_file_added"), "ok");
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e));
    if (/err_unsupported/.test(msg)) { herr("lib unsupported:", msg); setStatus(t("lib_unsupported"), "err"); return; }
    herr("lib browse:", msg);
    setStatus(friendlyErr(e), "err");
  }
}

function refLibForgetSlot(slotId) {
  if (state.refTokens && state.refTokens[slotId]) { delete state.refTokens[slotId]; saveSettings(); hlog("lib slot cleared:", slotId); }
}

/* Restore direct-format slot images after a reload/restart. Fire-and-forget so it
   never blocks init; a moved/deleted/renamed file just clears its own slot token. */
async function refLibRestoreSlots() {
  const ids = Object.keys(state.refTokens || {});
  for (let i = 0; i < ids.length; i++) {
    const slotId = ids[i], slot = refSlotById(slotId), tok = state.refTokens[slotId];
    if (!slot || !tok) continue;
    try {
      const file = await fsp.getEntryForPersistentToken(tok);
      if (!file) throw new Error("missing");
      if (!refIsDirect(refExtOf(file.name))) continue; /* skip PS-capture formats at startup */
      const cap = await refCaptureEntry(file);
      if (!imgMagicOk(cap.b64)) throw new Error("bad image");
      slot.assign(cap);
      hlog("lib slot restored:", slotId);
    } catch (e) {
      hwarn("lib slot restore failed:", slotId, e);
      delete state.refTokens[slotId]; saveSettings();
      setStatus(t("lib_restore_fail"), "err"); /* non-blocking: only this slot is cleared */
    }
  }
}

/* ---------------- Select options (JS-built: UXP cannot localize <option> via data-i18n) ---------------- */

/* v6.47.1 — ONE builder for every option, because o.textContent alone is not
   enough on this renderer. fillSelect has set BOTH o.text and o.textContent
   since v1 and its callers' comments say why; five hand-rolled loops grew up
   beside it setting only textContent, and the owner's Photoshop drew exactly
   what that produces: the Path workflow picker and the Library category
   picker as empty grey boxes with no label at all. */
function mkOption(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.text = label;
  o.textContent = label;
  return o;
}

function fillSelect(sel, items) {
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  for (let i = 0; i < items.length; i++) {
    const o = document.createElement("option");
    o.value = items[i].v;
    o.text = items[i].label;
    o.textContent = items[i].label;
    sel.appendChild(o);
  }
}

/* ---------------- Small helpers ---------------- */
function $(id) { return document.getElementById(id); }

const B64T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function imgDimsFromB64(b64, mime) {
  try {
    const u = new Uint8Array(b64ToBuf(b64));
    if (u.length > 24 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) {
      const w = (u[16] << 24) | (u[17] << 16) | (u[18] << 8) | u[19];
      const h = (u[20] << 24) | (u[21] << 16) | (u[22] << 8) | u[23];
      if (w > 0 && h > 0) return { w: w, h: h };
    }
    if (u.length > 4 && u[0] === 0xFF && u[1] === 0xD8) {
      let i = 2;
      while (i + 9 < u.length) {
        if (u[i] !== 0xFF) { i++; continue; }
        const tp = u[i + 1];
        if (tp === 0xC0 || tp === 0xC1 || tp === 0xC2) {
          const h = (u[i + 5] << 8) | u[i + 6];
          const w = (u[i + 7] << 8) | u[i + 8];
          if (w > 0 && h > 0) return { w: w, h: h };
          return null;
        }
        if (tp === 0xD8 || (tp >= 0xD0 && tp <= 0xD7) || tp === 0x01) { i += 2; continue; }
        const seg = (u[i + 2] << 8) | u[i + 3];
        if (seg < 2) return null;
        i += 2 + seg;
      }
    }
  } catch (e) { }
  return null;
}

function bufToB64(buf) {
  const b = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const a = b[i];
    const c = i + 1 < b.length ? b[i + 1] : 0;
    const d = i + 2 < b.length ? b[i + 2] : 0;
    out += B64T[a >> 2];
    out += B64T[((a & 3) << 4) | (c >> 4)];
    out += (i + 1 < b.length) ? B64T[((c & 15) << 2) | (d >> 6)] : "=";
    out += (i + 2 < b.length) ? B64T[d & 63] : "=";
  }
  return out;
}

var _B64MAP = null;
function b64ToBuf(b64) {
  if (!_B64MAP) { _B64MAP = {}; for (let i = 0; i < 64; i++) _B64MAP[B64T[i]] = i; }
  const map = _B64MAP;
  const s = String(b64).replace(/[^A-Za-z0-9+/]/g, "");
  const len = s.length;
  const rem = len % 4;
  const outLen = (len >> 2) * 3 + (rem === 2 ? 1 : (rem === 3 ? 2 : 0));
  const out = new Uint8Array(outLen);
  let o = 0;
  let i = 0;
  while (i + 3 < len) {
    const n = (map[s[i]] << 18) | (map[s[i + 1]] << 12) | (map[s[i + 2]] << 6) | map[s[i + 3]];
    out[o++] = (n >> 16) & 255; out[o++] = (n >> 8) & 255; out[o++] = n & 255;
    i += 4;
  }
  if (rem === 2) {
    const n = (map[s[i]] << 18) | (map[s[i + 1]] << 12);
    out[o++] = (n >> 16) & 255;
  } else if (rem === 3) {
    const n = (map[s[i]] << 18) | (map[s[i + 1]] << 12) | (map[s[i + 2]] << 6);
    out[o++] = (n >> 16) & 255; out[o++] = (n >> 8) & 255;
  }
  return out.buffer;
}

/* ---------------- Status / loading ---------------- */
let dotsTimer = null;
/* v6.47.0 — a div control has no .disabled, so "off" is a class, and the
   handlers below ask before they act. Sliders and selects are still native
   widgets and still take the real property, which is why this sets both. */
/* v6.47.0 — every control this panel builds at runtime is a div too, for the
   same reason the 215 in index.html are: UXP's button widget paints its own
   grey chrome over our stylesheet and draws labels in a font with no Burmese
   glyphs. Same events, same classes, our paint. */
function mkBtn(className, text) {
  const b = document.createElement("div");
  b.setAttribute("role", "button");
  b.setAttribute("tabindex", "0");
  if (className) b.className = className;
  if (text !== undefined) b.textContent = text;
  return b;
}

/* ============================================================
   v6.62.0 — A DISABLED CONTROL IS DISABLED BY JAVASCRIPT, NOT BY CSS.

   Until this wave the panel had three ways of saying "you cannot press this"
   and none of them held in Photoshop:
     · `pointer-events:none` on .im-acts .btn.is-off -- UXP implements no
       pointer-events at all (styles.css has said so in its own header since
       v5, main.js repeats it in prose at the gate), so the rule painted the
       control at 45% and left it fully pressable.
     · el.disabled = true (btnOff) -- every "button" in this panel is a DIV
       (src/ui/dom.js turns <button> into one because UXP's button widget
       drops our labels), and a div has no disabled behaviour in any engine.
     · aria-disabled="true" -- a screen-reader hint. Nothing enforces it.
   Only three of the twelve call sites re-checked before acting, so on the
   owner's Photoshop "Apply" fired a second time mid-run and "Undo mark" ran
   with nothing to undo. The guard below is the enforcement, in the capture
   phase, before any handler: one place, both engines, no CSS involved. */
function hasCls(node, name) {
  const c = " " + clsOf(node).replace(/\s+/g, " ") + " ";
  return c.indexOf(" " + name + " ") >= 0;
}
function offAncestor(node) {
  let n = node, hops = 0;
  while (n && n.nodeType === 1 && hops++ < 14) {
    if (hasCls(n, "is-off") || hasCls(n, "is-disabled")) return n;
    try { if (n.getAttribute && n.getAttribute("aria-disabled") === "true") return n; } catch (e) { }
    try { if (n.disabled === true) return n; } catch (e) { }
    n = n.parentNode;
  }
  return null;
}
function bindOffGuard(doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d || !d.addEventListener) return false;
  const swallow = function (ev) {
    try {
      const tgt = ev && (ev.target || ev.srcElement);
      if (!tgt || !offAncestor(tgt)) return;
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      else if (ev.stopPropagation) ev.stopPropagation();
      if (ev.preventDefault && ev.cancelable !== false) ev.preventDefault();
    } catch (e) { /* a guard must never be the reason a tap is lost */ }
  };
  d.addEventListener("click", swallow, true);
  d.addEventListener("keydown", function (ev) {
    const k = ev && ev.key;
    if (k !== "Enter" && k !== " " && k !== "Spacebar") return;
    swallow(ev);
  }, true);
  return true;
}

function btnOff(el, on) {
  if (!el) return;
  try { el.disabled = !!on; } catch (e) { }
  try { if (el.classList) { if (on) el.classList.add("is-off"); else el.classList.remove("is-off"); } } catch (e) { }
}
function btnIsOff(el) {
  try { return !!(el && el.classList && el.classList.contains("is-off")); } catch (e) { return false; }
}

function setStatus(msg, kind) {
  const s = $("status");
  if (!s) return;
  s.textContent = msg || "";
  s.className = "status" + (kind ? " " + kind : "");
  try { toastPaint(msg, kind); } catch (e) { }
}
/* v6.51.0 — the app has no status bar: a message is its toast(), a gold-edged
   panel-2 card floating 86px above the tab bar for 2.6 s. #status still holds
   the text (every caller and test reads it); the toast around it is its face.
   Quiet states ("ready", empty) hide it; a busy message stays up while the
   dots run (startBusy → endBusy) and the message that ends the run gets the
   app's 2.6 s like any other. */
let toastTimer = null;
function toastPaint(msg, kind) {
  const tb = $("toast"); if (!tb) return;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  let idle = !msg;
  if (!idle) { try { idle = msg === t("st_ready"); } catch (e) { idle = false; } }
  if (idle) { tb.className = "toast"; return; }
  tb.className = "toast on" + ((kind === "ok" || kind === "err") ? " " + kind : "");
  if (!state.busy) toastArm();
}
function toastArm() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastTimer = null;
    const tb = $("toast"); if (tb) tb.className = "toast";
  }, 2600);
}
function stopDots() { if (dotsTimer) { clearInterval(dotsTimer); dotsTimer = null; } }
function setBusyBtn(el) { state.pendingBtn = el || null; }

/* ---------------- v6.9.0 staged progress strip (blueprint §5 "Results are
   real"): queued → uploading → generating → downloading → placing. Rendered
   above the status bar; localized (Burmese-first), no emoji. Hidden when no
   generation is running. ---------------- */
const STAGE_STEPS = ["queued", "uploading", "generating", "downloading", "placing"];
/* literal i18n keys (kept literal so the [32]/[47] i18n integrity audits see them) */
const STAGE_KEYS = {
  queued: "stage_queued", uploading: "stage_uploading", generating: "stage_generating",
  downloading: "stage_downloading", placing: "stage_placing"
};
function setStage(step) {
  const el = $("hnkStrip");
  if (!el) return;
  const idx = STAGE_STEPS.indexOf(step);
  if (!step || idx < 0) { el.className = "hstrip"; el.innerHTML = ""; return; }
  el.innerHTML = "";
  for (let i = 0; i < STAGE_STEPS.length; i++) {
    const s = document.createElement("span");
    s.className = "hstep" + (i < idx ? " done" : (i === idx ? " on" : ""));
    s.textContent = t(STAGE_KEYS[STAGE_STEPS[i]]);
    el.appendChild(s);
  }
  el.className = "hstrip on";
}
/* busy-key → strip step, so every classic generate path gets staged feedback
   without touching each call site. Keys not in the map hide the strip. */
const BUSY_STAGE = { st_capture: "queued", st_gen: "generating", st_place: "placing", st_web_fetch: "downloading" };

/* Production fetch: hard timeout so a stalled request never hangs the panel,
   plus a single retry with backoff on a network drop or 5xx. */
async function hnkFetch(url, opts, timeoutMs) {
  const tmo = timeoutMs || 90000;
  const attempt = async function () {
    let ctrl = null, timer = null;
    try {
      if (typeof AbortController !== "undefined") {
        ctrl = new AbortController();
        timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { } }, tmo);
      }
      const o = Object.assign({}, opts || {});
      /* our own flag, never a fetch init member — UXP's fetch is not a browser's
         and an unknown key is not worth finding out about in production */
      try { delete o.hnkNoRetry; } catch (e) { }
      if (ctrl) o.signal = ctrl.signal;
      const res = await fetch(url, o);
      if (timer) clearTimeout(timer);
      return res;
    } catch (e) {
      if (timer) clearTimeout(timer);
      const msg = (e && e.message ? e.message : String(e));
      if (/abort/i.test(msg)) throw new Error("HNKERR:err_timeout:request timed out");
      throw new Error("HNKERR:err_net:" + msg);
    }
  };
  /* v6.108.2 — SOME CALLS MUST NOT BE SENT TWICE. The retry below exists for
     a dropped picture fetch; sending a sign-in twice is a different thing
     entirely. The server allows five REJECTED passwords per account and
     computer in fifteen minutes (server/lib/auth.js FAILED_LOGIN_LIMIT), and
     every attempt that reaches it is counted whether or not our own retry
     asked for it. One 5xx or one dropped connection therefore charged the
     student TWO of their five, and three presses could lock an account whose
     password was never wrong. The owner met exactly that: HTTP 429 on a
     correct password, at the first press. Callers that change state — the
     sign-in POST above all — pass hnkNoRetry and are sent once, and once only. */
  const once = !!(opts && opts.hnkNoRetry);
  try {
    const r = await attempt();
    if (!once && r && r.status >= 500 && r.status < 600) {
      await sleep(1200);
      return await attempt();
    }
    return r;
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e));
    if (!once && /err_net:/.test(msg)) { await sleep(1200); return await attempt(); }
    throw e;
  }
}

function startBusy(msgKey) {
  state.busy = true;
  if (state.pendingBtn && !state.busyBtnEl) {
    state.busyBtnEl = state.pendingBtn;
    state.busyBtnTxt = state.busyBtnEl.textContent;
  }
  const g = $("btnGenerate"); btnOff(g, true);
  stopDots();
  let n = 0;
  try { setStage(BUSY_STAGE[msgKey] || null); } catch (e) { }
  setStatus(t(msgKey));
  dotsTimer = setInterval(function () {
    n = (n + 1) % 4;
    const s = $("status");
    if (s) s.textContent = t(msgKey) + " " + new Array(n + 1).join(".");
    if (state.busyBtnEl) {
      let bt = "";
      for (let bi = 0; bi < 1 + (n % 3); bi++) bt += "\u2022 ";
      state.busyBtnEl.textContent = bt.trim();
    }
  }, 350);
}
function endBusy() {
  state.busy = false;
  if (state.busyBtnEl) {
    state.busyBtnEl.textContent = state.busyBtnTxt || "";
  }
  state.busyBtnEl = null;
  state.busyBtnTxt = null;
  state.pendingBtn = null;
  const g = $("btnGenerate"); btnOff(g, false);
  stopDots();
  try { setStage(null); } catch (e) { }
  /* a run that ends without a closing message must not leave its progress
     toast up forever — give whatever is showing the app's 2.6 s */
  try { const tb = $("toast"); if (tb && /\bon\b/.test(clsOf(tb))) toastArm(); } catch (e) { }
}

/* ---------------- Settings persistence (file-backed JSON) ---------------- */
async function saveSettings() {
  try {
    const folder = await fsp.getDataFolder();
    const f = await folder.createFile(SETTINGS_FILE, { overwrite: true });
    /* v4.16: de-duplicated — every persisted field appears exactly once. */
    const o = {
      rhKey: state.rhKey, lang: state.lang, theme: state.theme, model: state.model,
      tsize: state.tsize || "m",   /* 6.166.0 — text size */
      size: state.size, ratio: state.ratio,
      autoPlace: state.autoPlace,
      rt: state.rt, rtStrength: state.rtStrength, page: state.page,
      /* the studio's own slider/chip values — the app's state.st, saved and
         restored through the app's own tolerant reader (state.stSaved) */
      st: (state.st ? { t1: state.st.t1, t2: state.st.t2, v: state.st.v, geo: state.st.geo, preset: state.st.preset, target: state.st.target } : null),
      keep: state.keep,
      cRatio: state.cRatio, cVariations: state.cVariations,
      t2iModel: state.t2iModel, t2iSize: state.t2iSize,
      /* v6.54.0 — the Path page's own settings (the app's state.pt): the look,
         the tier, the strength dial, the effects and the source it is pointed at */
      pt: state.pt || null,
      libToken: state.libToken, libFolderName: state.libFolderName, libNativePath: state.libNativePath,
      refTokens: state.refTokens,
      accRefresh: state.accRefresh, accUid: state.accUid, accEmail: state.accEmail,
      accProfile: state.accProfile, accSeenAt: state.accSeenAt, accDevId: state.accDevId,
      accSeenUid: state.accSeenUid, accSeenDev: state.accSeenDev,
      accAvatar: state.accAvatar,
      rhModel: state.rhModel, ffRatio: state.ffRatio, ffSize: state.ffSize, ffCount: state.ffCount,
      rhCfg: state.rhCfg, spend: state.spend, rhBal: state.rhBal, rhLastCur: state.rhLastCur,
      nwSeen: Array.isArray(state.nwSeen) ? state.nwSeen.slice(0, 200) : []
    };
    await f.write(JSON.stringify(o), { format: formats.utf8 });
  } catch (e) { hwarn("saveSettings:", e); }
}

async function loadSettings() {
  try {
    const folder = await fsp.getDataFolder();
    const f = await folder.getEntry(SETTINGS_FILE);
    if (!f) return;
    const txt = await f.read({ format: formats.utf8 });
    const o = JSON.parse(txt);
    if (o && typeof o === "object") {
      if (typeof o.rhKey === "string") state.rhKey = o.rhKey;
      if (o.tsize === "s" || o.tsize === "l") { state.tsize = o.tsize; try { applyTextSize(); } catch (eT) { } }
      /* v6.26.0 — legacy Gemini/OpenAI keys are PURGED, never restored: the
         next saveSettings() writes a file without them (web app 5.50.0 rule). */
      if (typeof o.apiKey === "string" || typeof o.oaiKey === "string") {
        /* rewrite the settings file WITHOUT the retired providers' keys */
        setTimeout(function () { try { saveSettings(); } catch (e) { } }, 0);
      }
      if (typeof o.accRefresh === "string") state.accRefresh = o.accRefresh;
      /* v6.75.0 — dismissed What's New rows; strings only, re-bounded (disk is user-editable) */
      if (Array.isArray(o.nwSeen)) state.nwSeen = o.nwSeen.filter(function (k) { return typeof k === "string" && k.length < 80; }).slice(0, 200);
      if (typeof o.accUid === "string") state.accUid = o.accUid;
      if (typeof o.accEmail === "string") state.accEmail = o.accEmail;
      if (o.accProfile && typeof o.accProfile === "object") state.accProfile = o.accProfile;
      if (typeof o.accSeenAt === "number" && isFinite(o.accSeenAt)) state.accSeenAt = o.accSeenAt;
      if (typeof o.accSeenUid === "string") state.accSeenUid = o.accSeenUid;
      if (typeof o.accSeenDev === "string") state.accSeenDev = o.accSeenDev;
      if (typeof o.accDevId === "string") state.accDevId = o.accDevId;
      /* v6.27.0 — the cached profile photo: re-bounded on load because the
         settings file is user-editable disk, not a trusted store. */
      if (typeof o.accAvatar === "string" && gateAvaOk(o.accAvatar)) state.accAvatar = o.accAvatar;
      if (typeof o.lang === "string" && LANG_CODES.indexOf(o.lang) >= 0) state.lang = o.lang;
      if (o.theme === "dark" || o.theme === "light") state.theme = o.theme;
      if (o.model === "auto" || o.model === "flash" || o.model === "pro") state.model = o.model;
      if (o.size === "1K" || o.size === "2K" || o.size === "4K") state.size = o.size;
      if (typeof o.ratio === "string") state.ratio = o.ratio;
      /* v6.51.0 — Freeform's app-parity selects, validated against the catalog. */
      if (typeof o.rhModel === "string" && ffModelById(o.rhModel)) state.rhModel = o.rhModel;
      if (typeof o.ffRatio === "string" && /^(|\d{1,2}:\d{1,2})$/.test(o.ffRatio)) state.ffRatio = o.ffRatio;
      if (o.ffSize === "" || o.ffSize === "1K" || o.ffSize === "2K" || o.ffSize === "4K" || o.ffSize === "8K") state.ffSize = o.ffSize;   /* v6.26.0 — 8K */
      if (o.ffCount === 1 || o.ffCount === 2 || o.ffCount === 4) state.ffCount = o.ffCount;
      /* v6.51.0 — Setup's RunningHub endpoint config, spend ledger and last balance
         (the app keeps these in localStorage). Re-bounded on load: disk is user-editable. */
      if (o.rhCfg && typeof o.rhCfg === "object") {
        const c = { models: {}, activeModel: "" };
        if (o.rhCfg.models && typeof o.rhCfg.models === "object") {
          for (const mk in o.rhCfg.models) {
            const mv = o.rhCfg.models[mk];
            if (!mv || typeof mv !== "object") continue;
            const row = {};
            if (typeof mv.apiPath === "string") row.apiPath = mv.apiPath.slice(0, 200);
            if (typeof mv.quality === "string") row.quality = mv.quality.slice(0, 40);
            c.models[String(mk).slice(0, 80)] = row;
          }
        }
        if (typeof o.rhCfg.activeModel === "string") c.activeModel = o.rhCfg.activeModel.slice(0, 80);
        state.rhCfg = c;
      }
      if (o.spend && typeof o.spend === "object" && !Array.isArray(o.spend)) {
        state.spend = {
          rows: Array.isArray(o.spend.rows) ? o.spend.rows.filter(function (r) { return r && typeof r === "object"; }).slice(-400) : [],
          old: (o.spend.old && typeof o.spend.old === "object") ? o.spend.old : { n: 0, money: 0, coins: 0 },
          cur: typeof o.spend.cur === "string" ? o.spend.cur.slice(0, 12) : ""
        };
      }
      if (o.rhBal && typeof o.rhBal === "object") state.rhBal = o.rhBal;
      if (typeof o.rhLastCur === "string") state.rhLastCur = o.rhLastCur.slice(0, 12);
      if (typeof o.autoPlace === "boolean") state.autoPlace = o.autoPlace;
      if (typeof o.page === "string") state.page = o.page;
      if (o.keep && typeof o.keep === "object") {
        for (const kk in state.keep) { if (typeof o.keep[kk] === "boolean") state.keep[kk] = o.keep[kk]; }
      } else {
        /* migrate legacy toggles */
        if (typeof o.faceLock === "boolean") { state.keep.face = o.faceLock; state.keep.pose = o.faceLock; }
        if (typeof o.frameLock === "boolean") state.keep.frame = o.frameLock;
      }
      if (typeof o.cRatio === "string") state.cRatio = o.cRatio;
      if (o.rtStrength === 60 || o.rtStrength === 90 || o.rtStrength === 100) state.rtStrength = o.rtStrength;
      if (typeof o.t2iModel === "string") state.t2iModel = o.t2iModel;
      if (typeof o.t2iSize === "string") state.t2iSize = o.t2iSize;
      /* v6.54.0 — the Path page, restored the app's tolerant way: every field
         is checked on its own, so a settings file written by an older panel
         (or one whose look was later retired) still opens on a working page. */
      if (o.pt && typeof o.pt === "object") {
        const d = ptDef(), q = state.pt = { look: d.look, tier: d.tier, strength: d.strength, custom: d.custom, wf: d.wf,
          fx: { blur: d.fx.blur, fg: d.fx.fg, sync: d.fx.sync, proLight: d.fx.proLight, frame: d.fx.frame } };
        if (typeof o.pt.look === "string" && ptLookById(o.pt.look) && ptLookById(o.pt.look).id === o.pt.look) q.look = o.pt.look;
        if (typeof o.pt.tier === "string") q.tier = o.pt.tier;
        if (typeof o.pt.strength === "number") q.strength = o.pt.strength;
        if (typeof o.pt.custom === "string") q.custom = o.pt.custom;
        if (typeof o.pt.wf === "string") q.wf = o.pt.wf;
        if (o.pt.fx && typeof o.pt.fx === "object") {
          ["blur", "fg", "frame"].forEach(function (k) { if (typeof o.pt.fx[k] === "string") q.fx[k] = o.pt.fx[k]; });
          ["sync", "proLight"].forEach(function (k) { if (typeof o.pt.fx[k] === "boolean") q.fx[k] = o.pt.fx[k]; });
        }
      }
      if (typeof o.cVariations === "number") state.cVariations = Math.max(1, Math.min(4, o.cVariations));
      if (typeof o.libToken === "string") state.libToken = o.libToken;
      if (typeof o.libFolderName === "string") state.libFolderName = o.libFolderName;
      if (typeof o.libNativePath === "string") state.libNativePath = o.libNativePath;
      if (o.refTokens && typeof o.refTokens === "object") {
        state.refTokens = {};
        for (const rk in o.refTokens) { if (typeof o.refTokens[rk] === "string") state.refTokens[rk] = o.refTokens[rk]; }
      }
      /* handed to the studio module's own restore, which validates every
         key against its defaults before it touches a control */
      if (o.st && typeof o.st === "object") state.stSaved = o.st;
      if (o.rt && typeof o.rt === "object") {
        for (const k in RT_DEFAULT) {
          if (typeof RT_DEFAULT[k] === "number" && typeof o.rt[k] === "number") state.rt[k] = Math.round(o.rt[k]);
          if (RT_DEFAULT[k] === null && (typeof o.rt[k] === "string" || o.rt[k] === null)) state.rt[k] = o.rt[k];
        }
      }
    }
  } catch (e) { /* first run: file not there yet */ }
}

/* ---------------- Photoshop capture ---------------- */
/* AUDIT-FIX #5: encodeImageData only accepts RGB. getPixels returns the document's
   NATIVE mode, so a Grayscale / CMYK / Lab document used to throw a raw UXP error and
   dead-end Generate. Expand grayscale to RGB (like the selection-mask path) and fail
   fast with a localized "convert to RGB" message for CMYK/Lab. The caller's finally
   still disposes the source imageData; this only disposes its own temp buffer. */
async function encodeCaptureB64(imageData) {
  const cs = imageData.colorSpace;
  const comp = imageData.components || 0;
  /* Fast path: already RGB / RGBA. */
  if (cs === "RGB" || (!cs && comp >= 3)) {
    return await imaging.encodeImageData({ imageData: imageData, base64: true });
  }
  /* Grayscale (1-2 channels): expand to interleaved RGB. */
  if (cs === "Grayscale" || comp < 3) {
    const raw = await imageData.getData();
    const g = (raw instanceof Uint8Array) ? raw : new Uint8Array(raw);
    const w = imageData.width, h = imageData.height;
    const step = comp > 1 ? comp : 1; /* skip the alpha channel of grayscale+alpha */
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; j + 2 < rgb.length && i < g.length; i += step, j += 3) {
      const v = g[i]; rgb[j] = v; rgb[j + 1] = v; rgb[j + 2] = v;
    }
    let rgbId = null;
    try {
      rgbId = await imaging.createImageDataFromBuffer(rgb, {
        width: w, height: h, components: 3, colorSpace: "RGB", componentSize: 8, chunky: true
      });
      return await imaging.encodeImageData({ imageData: rgbId, base64: true });
    } finally {
      try { if (rgbId && rgbId.dispose) rgbId.dispose(); } catch (de) { }
    }
  }
  /* CMYK / Lab / Duotone / Multichannel — encodeImageData cannot handle these. */
  throw new Error("HNKERR:err_mode:" + (cs || "non-RGB"));
}

async function captureDocumentB64(maxSide) {
  let out = null;
  await psCore.executeAsModal(async function () {
    const doc = app.activeDocument;
    if (!doc) throw new Error(t("st_no_doc"));
    const dw = Number(doc.width), dh = Number(doc.height);
    const cap = maxSide || 2048;
    const sc = Math.min(1, cap / Math.max(dw, dh));
    const req = { documentID: doc.id, componentSize: 8, applyAlpha: true };
    if (sc < 1) req.targetSize = { width: Math.max(1, Math.round(dw * sc)) };
    const px = await imaging.getPixels(req);
    try {
      const w = px.imageData.width, h = px.imageData.height;
      const b64 = await encodeCaptureB64(px.imageData);
      out = { b64: b64, mime: "image/jpeg", label: "Document", w: w, h: h };
    } finally {
      /* always release native pixel memory, even if encoding throws (no leak) */
      if (px && px.imageData && px.imageData.dispose) px.imageData.dispose();
    }
  }, { commandName: "HNK Capture Document" });
  return out;
}

/* v6.84.0 — EVERY "Active layer" BUTTON GETS THE SAME PICTURE. The Freeform
   IMG tiles, the classic reference slots, Retouch A/B and the Path page all
   read the layer through this one getPixels shape; the Smart Workflow slots
   read it through photoshop-host's captureActiveLayer, which walks four
   getPixels shapes and a flattened saved copy. A layer group, a CMYK or Lab
   document, a machine whose imaging refuses one shape: the wizard got the
   picture and Freeform got a red line. When the single route refuses, the
   host's routes run; only when they refuse too does the original refusal
   reach the student, with the host's reasons appended. */
async function captureLayerB64(maxSide) {
  try { return await captureLayerB64Direct(maxSide); }
  catch (e) {
    const H = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK : {};
    const host = H.photoshopHost;
    if (!(host && typeof host.captureActiveLayer === "function")) throw e;
    let r = null;
    try { r = await host.captureActiveLayer(); } catch (e2) { throw e; }
    if (r === null) throw e;                                   /* no document — the original words stand */
    if (!r || !r.ref) throw new Error(String((e && e.message) || e) + " | " + String((r && r.error) || "no picture"));
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(r.ref));
    if (!m) throw e;
    try { hwarn("layer capture: direct route refused (" + String((e && e.message) || e).slice(0, 120) + "), host route " + (r.via || "?") + " answered"); } catch (eW) { }
    return { b64: m[2], mime: m[1].toLowerCase(), label: "Layer: " + String(r.name || ""), w: r.width || 0, h: r.height || 0, via: r.via || "" };
  }
}
async function captureLayerB64Direct(maxSide) {
  let out = null;
  await psCore.executeAsModal(async function () {
    const doc = app.activeDocument;
    if (!doc) throw new Error(t("st_no_doc"));
    const ls = doc.activeLayers;
    if (!ls || !ls.length) throw new Error(t("no_layer"));
    const lyr = ls[0];
    const b = lyr.bounds;
    const lw = Math.max(1, Number(b.right) - Number(b.left));
    const lh = Math.max(1, Number(b.bottom) - Number(b.top));
    const cap = maxSide || 1536;
    const sc = Math.min(1, cap / Math.max(lw, lh));
    const req = { documentID: doc.id, layerID: lyr.id, componentSize: 8, applyAlpha: true };
    if (sc < 1) req.targetSize = { width: Math.max(1, Math.round(lw * sc)) };
    const px = await imaging.getPixels(req);
    try {
      const w = px.imageData.width, h = px.imageData.height;
      const b64 = await encodeCaptureB64(px.imageData);
      out = { b64: b64, mime: "image/jpeg", label: "Layer: " + lyr.name, w: w, h: h };
    } finally {
      if (px && px.imageData && px.imageData.dispose) px.imageData.dispose();
    }
  }, { commandName: "HNK Capture Layer" });
  return out;
}

/* Open any Photoshop-readable file entry, capture composite, close. */
async function captureFileViaPS(entry, label, maxSide) {
  let cap = null;
  await psCore.executeAsModal(async function () {
    const doc = await app.open(entry);
    /* try/finally: the temporary doc must ALWAYS be closed and pixel memory
       released, even if getPixels/encodeImageData throws — otherwise every
       failed import leaks an invisible open document and native memory. */
    let px = null;
    try {
      const dw = Number(doc.width), dh = Number(doc.height);
      const capSide = maxSide || 1536;
      const sc = Math.min(1, capSide / Math.max(dw, dh));
      const req = { documentID: doc.id, componentSize: 8, applyAlpha: true };
      if (sc < 1) req.targetSize = { width: Math.max(1, Math.round(dw * sc)) };
      px = await imaging.getPixels(req);
      const b64 = await encodeCaptureB64(px.imageData);
      cap = { b64: b64, mime: "image/jpeg", label: label };
    } finally {
      try { if (px && px.imageData && px.imageData.dispose) px.imageData.dispose(); } catch (de) { }
      try { await doc.closeWithoutSaving(); } catch (ce) { }
    }
  }, { commandName: "HNK Import Reference" });
  return cap;
}

/* Choose any file. Direct-read common formats; everything else
   (PSD/TIFF/HEIC/RAW/...) is opened in Photoshop, captured, then closed. */
async function pickAnyFile() {
  try {
    return await fsp.getFileForOpening({ allowMultiple: false });
  } catch (e) {
    return await fsp.getFileForOpening({
      allowMultiple: false,
      types: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "psd", "psb",
        "heic", "heif", "avif", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2"]
    });
  }
}

async function pickReferenceFile() {
  const f = await pickAnyFile();
  if (!f) return null;
  const name = f.name || "file";
  const ext = (name.indexOf(".") >= 0 ? name.split(".").pop() : "").toLowerCase();
  /* AUDIT-FIX #8: only the MIME types the upload path accepts may be read directly.
     gif/bmp are NOT in DIRECT_UPLOAD_MIME, so they must fall through to
     captureFileViaPS (which re-encodes to JPEG) instead of poisoning the next
     Generate with an unsupported-MIME 400 / a misleading "corrupt image" error. */
  const direct = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp"
  };
  if (direct[ext]) {
    const buf = await f.read({ format: formats.binary });
    return { b64: bufToB64(buf), mime: direct[ext], label: name };
  }
  return captureFileViaPS(f, name, 1536);
}

/* ---------------- Web / URL references (Chrome, Pinterest) ---------------- */
const DIRECT_UPLOAD_MIME = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
const EXT_BY_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/bmp": "bmp", "image/avif": "avif",
  "image/heic": "heic", "image/heif": "heif", "image/tiff": "tif"
};

function normalizeUrl(u) {
  let s = String(u || "").trim();
  if (!s) return "";
  if (/^\/\//.test(s)) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s;
}

function decodeHtmlAmp(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"');
}

function extractImageUrl(html) {
  const pats = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /https:\/\/i\.pinimg\.com\/[A-Za-z0-9_\-\/.]+\.(?:jpg|jpeg|png|webp)/i
  ];
  for (let i = 0; i < pats.length; i++) {
    const m = html.match(pats[i]);
    if (m) {
      let u = decodeHtmlAmp(m[1] || m[0]);
      if (/^\/\//.test(u)) u = "https:" + u;
      if (/^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
}

function extFromUrl(u) {
  const m = String(u).toLowerCase().match(/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)(\?|#|$)/);
  if (!m) return null;
  if (m[1] === "jpeg") return "jpg";
  if (m[1] === "tiff") return "tif";
  return m[1];
}

async function fetchWebImage(url, depth) {
  if (/^blob:/i.test(url)) throw new Error("HNKERR:st_web_blob:blob url");
  const dm = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
  if (dm) {
    return { buf: b64ToBuf(dm[2]), mime: dm[1].toLowerCase() };
  }
  let res;
  try {
    /* hnkNoRetry: a manifest refusal is the same the second time; the API
       attempt below keeps the wrapper's one retry for a genuinely dropped line */
    res = await hnkFetch(url, {
      method: "GET", hnkNoRetry: true,
      headers: { "Accept": "image/jpeg,image/png,image/webp,image/*;q=0.9,*/*;q=0.8" }
    }, 60000);
  } catch (e) {
    /* v6.82.0 — Photoshop refused the host (the UXP manifest names only the
       studio's and RunningHub's hosts — "Permission denied to the url …
       Manifest entry not found", the owner's 6.152.0 photographs) or the
       line to it is dead: the studio's own API fetches the picture. */
    return fetchWebImageViaApi(url);
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const ct = String((res.headers && res.headers.get) ? (res.headers.get("content-type") || "") : "").toLowerCase();
  if (ct.indexOf("text/html") >= 0) {
    if ((depth || 0) >= 2) throw new Error(t("st_url_bad"));
    const html = await res.text();
    const img = extractImageUrl(html);
    if (!img) throw new Error(t("st_url_bad"));
    return fetchWebImage(img, (depth || 0) + 1);
  }
  const buf = await res.arrayBuffer();
  if (!buf || !buf.byteLength) throw new Error(t("st_url_bad"));
  if (buf.byteLength > 40 * 1024 * 1024) throw new Error("File too large");
  let mime = ct.split(";")[0].trim();
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    const e = extFromUrl(url);
    if (e) {
      for (const k in EXT_BY_MIME) { if (EXT_BY_MIME[k] === e) { mime = k; break; } }
    }
  }
  return { buf: buf, mime: mime, url: url };
}

/* v6.82.0 — GET /v1/image?url=… on the studio API: signed-in members only,
   image bodies only (the server refuses a page with 415 and a private host
   with 403 — see server/lib/image-proxy.js). The member's bearer rides
   along; the API's host is in the manifest, so this door is never shut. */
async function fetchWebImageViaApi(url) {
  const tok = gateS.sess && gateS.sess.access;
  const res = await hnkFetch(GATE_API_URL + "/v1/image?url=" + encodeURIComponent(url),
    { method: "GET", headers: gateHeaders(tok, false) }, 60000);
  if (!res.ok) {
    let why = "";
    try { const j = await res.json(); why = String((j && (j.msg || j.message || j.error)) || ""); } catch (e) { }
    throw new Error("HTTP " + res.status + (why ? " \u00b7 " + why : ""));
  }
  const ct = String((res.headers && res.headers.get) ? (res.headers.get("content-type") || "") : "").toLowerCase();
  const buf = await res.arrayBuffer();
  if (!buf || !buf.byteLength) throw new Error(t("st_url_bad"));
  return { buf: buf, mime: ct.split(";")[0].trim() || "image/jpeg", url: url };
}
try {
  globalThis.HNK = globalThis.HNK || {};
  /* the host's fetchImageUrl (the wizard's Web button) falls back to this */
  globalThis.HNK.webImageFallback = async function (url) {
    const got = await fetchWebImageViaApi(url);
    return { ref: "data:" + got.mime + ";base64," + bufToB64(got.buf), width: 0, height: 0 };
  };
} catch (e) { }

function urlLabel(u) {
  try {
    const clean = String(u).split("#")[0].split("?")[0];
    const seg = clean.split("/").pop();
    return "Web: " + (seg && seg.length ? seg.slice(0, 40) : "image");
  } catch (e) { return "Web: image"; }
}

/* Shared web-URL → reference loader. Both the Studio (state.refs) and Create
   (state.cRefs) slots run the identical fetch/convert/verify pipeline — only
   the temp-file prefix and the assign/repaint/close hooks differ. */
async function loadUrlIntoAnySlot(rawUrl, cfg) {
  const url = normalizeUrl(rawUrl);
  if (!url) { setStatus(t("st_url_bad"), "err"); return; }
  startBusy("st_url_loading");
  try {
    const got = await fetchWebImage(url, 0);
    let ref = null;
    const small = got.buf.byteLength <= 6 * 1024 * 1024;
    if (DIRECT_UPLOAD_MIME[got.mime] && small) {
      ref = { b64: bufToB64(got.buf), mime: got.mime, label: urlLabel(got.url) };
    } else {
      /* convert / downscale through Photoshop (avif, heic, gif, bmp, tif, oversized) */
      const ext = EXT_BY_MIME[got.mime] || extFromUrl(got.url);
      if (!ext) throw new Error(t("st_url_bad"));
      const folder = await fsp.getDataFolder();
      const tmp = await folder.createFile(cfg.tmpPrefix + Date.now() + "." + ext, { overwrite: true });
      await tmp.write(got.buf, { format: formats.binary });
      ref = await captureFileViaPS(tmp, urlLabel(got.url), 1536);
    }
    if (!imgMagicOk(ref.b64)) { endBusy(); setStatus(t("st_img_bad") + " (Ref)", "err"); return; } /* AUDIT-FIX #4: endBusy before return so the panel never sticks busy */
    cfg.assign(ref); /* check 1/3: ref verified */
    cfg.repaint();
    cfg.close();
    endBusy();
    setStatus(t("st_ref_web_added"), "ok");
  } catch (e) {
    endBusy();
    setStatus(t("st_err") + ": " + (e && e.message ? e.message : e), "err");
  }
}

async function readClipboardText() {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      if (navigator.clipboard.readText) {
        const s = await navigator.clipboard.readText();
        if (s) return s;
      }
      if (navigator.clipboard.getContent) {
        const c = await navigator.clipboard.getContent();
        if (c && c["text/plain"]) return c["text/plain"];
      }
    }
  } catch (e) { hwarn("clipboard:", e); }
  return "";
}

/* ---------------- Reference slots ----------------
   v6.51.0 — Freeform's PROMPT card carries the web app's three-slot refstrip
   (IMG 1 / IMG 2 / IMG 3). IMG 1 is state.subj (null = the open Photoshop
   document, the panel's native base); IMG 2/3 are state.refs[0]/[1], the
   reference slots every preset already reads. */
const FF_SLOT_IDS = ["freeform-image-1", "subject-reference", "reference-2"];
function ffSlotGet(i) { if (i >= 3) return (state.vidRefs || [])[i - 3] || null; return i === 0 ? state.subj : state.refs[i - 1]; }   /* v6.21.0 — IMG 4+ are the face references */
function ffSlotSet(i, cap) {
  if (i >= 3) { state.vidRefs = state.vidRefs || []; state.vidRefs[i - 3] = cap; }   /* v6.21.0 */
  else if (i === 0) state.subj = cap; else state.refs[i - 1] = cap;
  if (!cap && FF_SLOT_IDS[i]) refLibForgetSlot(FF_SLOT_IDS[i]);
  state.imgRoles = null; /* the app resets the roles on every slot write */
  renderRefs();
}
/* The app's REF_ROLES, verbatim: what each slot tells the model to be. */
const REF_ROLES = [
  { k: "subject", sent: "MAIN SUBJECT (keep this person's identity exactly)", label: { my: "Subject", en: "Subject" } },
  { k: "style", sent: "REFERENCE ONLY (style/scene, not identity)", label: { my: "Style ref", en: "Style ref" } },
  { k: "person", sent: "SECOND PERSON — include this person in the result and keep their identity exactly", label: { my: "လူ (identity ထိန်း)", en: "Person — identity" } },
  { k: "sketch", sent: "POSE / LAYOUT SKETCH — GEOMETRY ONLY. Read this image ONLY for pose, limb and head placement, where the subject sits inside the frame, subject scale and camera framing. Do NOT reproduce its lines, strokes, greyscale, paper, flatness or any drawn mark, and do NOT treat anything drawn in it as a person to include. The final result is a PHOTOGRAPH, never a drawing, sketch or illustration. Where the sketch's proportions are anatomically impossible, correct them to natural human proportions — the sketch sets pose and placement, not anatomy.", label: { my: "ပုံကြမ်း — ဟန်/နေရာ", en: "Sketch — pose" } }
];
function refRoleIdx(i) {
  const cur = state.imgRoles && state.imgRoles[i];
  if (!cur) return i === 0 ? 0 : 1;
  for (let r = 0; r < REF_ROLES.length; r++) { if (REF_ROLES[r].sent === cur) return r; }
  return -1;
}
const REF_L = {
  wizRole: { my: "Wizard role", en: "Wizard role" },
  roleTip: { my: "ဒီပုံရဲ့ အခန်းကဏ္ဍ — နှိပ်ပြီး ပြောင်းပါ", en: "This photo's role — tap to cycle" },
  libHint: { my: "ပုံရွေးပြီး IMAGE ခလုတ်နှိပ်ပါ — IMAGE {n} ထဲ ဝင်ပါမယ်", en: "Pick an image, then tap an IMAGE button — it fills IMAGE {n}" }
};
/* What js/hnk_library_compact_cards.js (the app's pgLib) needs from the
   panel: language, toast, the slot writer, the Library-target handshake. */
globalThis.HNK = globalThis.HNK || {};
/* v6.82.0 — a wizard slot asks for the Library: remember the slot (its key
   for the way back, its index so the Library's IMAGE button names the right
   number) and open the Presets page. */
globalThis.HNK.libTarget = {
  request: function (key, index) {
    state.wfLibTarget = String(key || "");
    state.libTargetSlot = (index | 0) || 0;
    switchPage("presets");
    setStatus(ff9(REF_L.libHint).replace("{n}", String(((index | 0) || 0) + 1)), "ok");
  }
};
globalThis.HNK.libBridge = {
  lang: function () { return state.lang; },
  fb: function (l) { return LANG_FB[l]; },
  status: function (msg, kind) { setStatus(msg, kind); },
  toSlot: function (slot, cap) {
    /* v6.82.0 — a Smart Workflow slot opened the Library (HNK.libTarget):
       the look goes back to that slot and the panel returns to the wizard. */
    if (state.wfLibTarget) {
      const key = state.wfLibTarget; state.wfLibTarget = null;
      let ok = false;
      try { ok = !!(globalThis.HNK.wfSlotFill && globalThis.HNK.wfSlotFill(key, cap)); } catch (e) { ok = false; }
      if (ok) { switchPage("wf"); setStatus("Library \u2192 " + (cap && cap.label ? cap.label + " \u2192 " : "") + key + " \u2713", "ok"); return; }
    }
    ffSlotSet(slot, cap);
  },
  takeTargetSlot: function () {
    const t = typeof state.libTargetSlot === "number" ? state.libTargetSlot : null;
    state.libTargetSlot = null;
    return t;
  },
  b64: function (buf) { return bufToB64(buf); },
  magicOk: function (b64) { return imgMagicOk(b64); }
};
/* v6.107.2 — TWO SHAPES OF PICTURE, one thumbnail.
   The reference slots hold a capture, {mime, b64}. The Talk and Video-tool
   photo slots hold whatever their picker produced: a UXP file entry, which
   carries a data: URL on _url once it has been read and has no mime/b64 at
   all. The video wizard called this with the latter (ffThumb(VT.img)) and so
   painted url("data:undefined;base64,undefined") — an empty box where the
   student had just put their photo. Both shapes draw now. */
function ffThumb(r) {
  const im = document.createElement("div");
  im.className = "im";
  const url = (r && r.b64) ? ("data:" + (r.mime || "image/png") + ";base64," + r.b64)
    : (r && r._url) ? r._url : "";
  if (url) im.style.backgroundImage = 'url("' + url + '")';
  return im;
}
function ffPressable(node, fn) {
  node.setAttribute("role", "button"); node.setAttribute("tabindex", "0");
  node.addEventListener("click", function (ev) { ev.stopPropagation(); fn(ev); });
  node.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); ev.stopPropagation(); fn(ev); }
  });
}
function renderRefs() {
  /* v6.51.0 — the app's one refstrip, painted on Freeform and Video alike */
  try { if (typeof vwizRepaint === "function") vwizRepaint(); } catch (e) { }   /* v6.14.0 — the video wizard repaints with the slots */
  /* v6.164.0 — THE RETOUCH PHOTO CARD REPAINTS WITH THE SLOT. Retouch A / B
     draw the shared PHOTO slot through the studio screen's own picker
     (#stPicker), not through the refstrips below; every route that fills
     the slot — the Layer · File sheet, the library, a URL — ended here and
     repainted only the strips, so on Retouch A the layer was captured, the
     status line said so, and the card still read "Add a photo" until the
     page was left and re-entered. Only clearPhoto remembered the picker. */
  try { const sc = globalThis.HNK && globalThis.HNK.studioScreen; if (sc && typeof sc.renderPicker === "function") sc.renderPicker(); } catch (e) { }
  ["refStrip", "vidRefStrip"].forEach(function (hostId) {
    const host = $(hostId);
    if (!host) return;
    host.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const r = ffSlotGet(i);
      const d = document.createElement("div");
      d.className = "rs" + (r ? " filled" : "");
      if (r) {
        d.appendChild(ffThumb(r));
        const x = document.createElement("div");
        x.className = "rsx"; x.textContent = "×"; x.setAttribute("aria-label", ff9(FF_L.remove));
        (function (slot) { ffPressable(x, function () { ffSlotSet(slot, null); }); })(i);
        d.appendChild(x);
      } else d.appendChild(document.createTextNode("+"));
      const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = "IMG " + (i + 1);
      d.appendChild(tag);
      (function (slot) { d.addEventListener("click", function () { ffSrcSheet(slot); }); })(i);
      host.appendChild(d);
    }
    /* v6.26.0 — the CREATE strip grows with the IMAGE model: reference slots up to its measured photo capacity */
    if (hostId === "refStrip") {
      const fmx = ffRefMaxP(), fshown = ffSlotsShownP(fmx);
      for (let k = VREF_BASE; k < fshown; k++) {
        const r = ffSlotGet(k);
        const d = document.createElement("div");
        d.className = "rs rs-face rs-ref" + (r ? " filled" : "");
        if (r) {
          d.appendChild(ffThumb(r));
          const x = document.createElement("div");
          x.className = "rsx"; x.textContent = "×"; x.setAttribute("aria-label", ff9(FF_L.remove));
          (function (slot) { ffPressable(x, function () { ffSlotSet(slot, null); }); })(k);
          d.appendChild(x);
        } else d.appendChild(document.createTextNode("+"));
        const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = "IMG " + (k + 1);
        d.appendChild(tag);
        (function (slot) { d.addEventListener("click", function () { ffSrcSheet(slot); }); })(k);
        host.appendChild(d);
      }
    }
    /* v6.21.0 — the VIDEO strip grows with the model: face-reference slots up to its image capacity */
    if (hostId === "vidRefStrip") {
      const mx = vidRefMaxP(), shown = vidSlotsShownP(mx);
      for (let k = VREF_BASE; k < shown; k++) {
        const r = ffSlotGet(k);
        const d = document.createElement("div");
        d.className = "rs rs-face" + (r ? " filled" : "");
        if (r) {
          d.appendChild(ffThumb(r));
          const x = document.createElement("div");
          x.className = "rsx"; x.textContent = "×"; x.setAttribute("aria-label", ff9(FF_L.remove));
          (function (slot) { ffPressable(x, function () { ffSlotSet(slot, null); }); })(k);
          d.appendChild(x);
        } else d.appendChild(document.createTextNode("+"));
        const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = "IMG " + (k + 1) + " · " + ff9(FACE_L);
        d.appendChild(tag);
        (function (slot) { d.addEventListener("click", function () { ffSrcSheet(slot); }); })(k);
        host.appendChild(d);
      }
    }
    const note = document.createElement("div"); note.className = "note"; note.textContent = ff9(FF_L.note);
    host.appendChild(note);
    if (hostId === "refStrip") { const cm = ffModel(); const cap = document.createElement("div"); cap.className = "note cap"; cap.textContent = cm.label + " · " + ffCapLabelP(); host.appendChild(cap); } /* v6.26.0 — what this model takes */
  });
  /* the Library page's IMAGES card — the app's renderRefs, slot for slot */
  const refs = $("refs");
  if (refs) {
    refs.innerHTML = "";
    for (let i = 0; i < ffSlotsShownP(ffRefMaxP()); i++) {   /* v6.26.0 — the grid grows with the image model */
      const r = ffSlotGet(i);
      const d = document.createElement("div");
      d.className = "ref" + (r ? " filled" : "");
      if (r) {
        d.appendChild(ffThumb(r));
        const x = document.createElement("div");
        x.className = "x"; x.setAttribute("aria-label", ff9(FF_L.remove));
        x.appendChild(ffIcon("i-close", "cream"));
        (function (slot) { ffPressable(x, function () { ffSlotSet(slot, null); }); })(i);
        d.appendChild(x);
        const ri = refRoleIdx(i);
        const role = document.createElement("div");
        role.className = "chip refrole" + (ri !== (i === 0 ? 0 : 1) ? " on" : "");
        role.textContent = ri >= 0 ? ff9(REF_ROLES[ri].label) : ff9(REF_L.wizRole);
        role.title = ff9(REF_L.roleTip);
        (function (slot, cur) {
          ffPressable(role, function () {
            const next = REF_ROLES[(cur + 1 + REF_ROLES.length) % REF_ROLES.length];
            if (!state.imgRoles) {
              state.imgRoles = [];
              for (let k = 0; k < 3; k++) state.imgRoles.push(REF_ROLES[k === 0 ? 0 : 1].sent);
            }
            state.imgRoles[slot] = next.sent;
            renderRefs();
          });
        })(i, ri);
        d.appendChild(role);
      } else {
        const add = document.createElement("div");
        add.className = "add"; add.textContent = "+";
        add.title = i === 0 ? "IMAGE 1 — ပင်မ Subject" : "IMAGE " + (i + 1) + " — Reference";
        (function (slot) { ffPressable(add, function () { ffSrcSheet(slot); }); })(i);
        d.appendChild(add);
      }
      const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = "IMG " + (i + 1);
      d.appendChild(tag);
      refs.appendChild(d);
    }
  }
}

/* The app's refSrcSheet: an empty slot asks where the image comes from. The
   panel's sources are Photoshop's — the selected layer, a file, a Library
   look, the last result. */
function ffSheetClose() {
  const old = $("ffSheet");
  if (!old) return;
  try { if (typeof old.close === "function" && old.open) old.close(); } catch (e) { }
  if (old.parentNode) old.parentNode.removeChild(old);
}

/* ============================================================
   v6.107.2 — THE ACTIVE LAYER, ON EVERY IMAGE SLOT.

   The panel runs inside Photoshop, where the student's photo is almost never
   a file on disk — it is the layer already open in front of them. The
   reference slots have known that since 6.27.0: tapping one opens a sheet
   whose first line is "Use the selected Photoshop layer".

   Four image inputs never got that sheet and went straight to a file picker,
   so in those places the open document was unreachable and the student had to
   export a JPEG first, inside Photoshop, to give Photoshop a photo:

     · TALK          the photograph that will speak      (btnTkImgPick)
     · VIDEO → VIDEO the reference photo for the tool     (btnVtImgPick)
     · Edit ▸ IMAGINE the photo every template works on   (imagineHost.pickWire)
     · Batch (Path)   the photos of a batch run           (ptAdd)

   photoSheet is the same door for all of them. It takes callbacks rather than
   a slot index (ffSrcSheet writes ff slots; these four each keep their photo
   somewhere else), and it offers the file path each surface already had, so
   nothing that worked before changes.
   ============================================================ */
function photoSheet(title, opts) {
  ffSheetClose();
  /* v6.78.0 — a <dialog>, not a fixed overlay: Photoshop lays a fixed box
     out as an ordinary block at the end of the page (the owner's 9th
     photograph), a dialog opens where the tap was on every renderer. Same id,
     same card, same buttons. */
  const bd = document.createElement("dialog"); bd.id = "ffSheet"; bd.className = "ff-sheet";
  const card = document.createElement("div"); card.className = "card";
  const h = document.createElement("div"); h.className = "subh";
  /* v6.75.1 — a caller with no name of its own (Imagine's add-photo) passed
     the question as the title and the sheet read "Where from? — Where from?"
     in the owner's screenshot. One question, once. */
  const where = ff9(FF_L.where);
  h.textContent = (title && title !== where) ? title + " — " + where : where;
  card.appendChild(h);
  function opt(label, fn) {
    if (!fn) return;
    const b = document.createElement("div");
    b.className = "btn"; b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    b.textContent = label;
    b.addEventListener("click", function () { ffSheetClose(); fn(); });
    card.appendChild(b);
  }
  opt(ff9(FF_L.srcLayer), opts.onLayer);
  opt(ff9(FF_L.srcFile), opts.onFile);
  /* v6.82.0 — a caller's own rows (Freeform: Paste · Web · Library) sit
     between File and the last result; every other caller passes none. */
  (opts.extra || []).forEach(function (x) { if (x && x.label && typeof x.fn === "function") opt(x.label, x.fn); });
  if (opts.onLast && state.resultB64) opt(ff9(FF_L.srcLast), opts.onLast);
  const cancel = document.createElement("div");
  cancel.className = "btn ff-sheet-cancel"; cancel.setAttribute("role", "button"); cancel.setAttribute("tabindex", "0");
  cancel.textContent = t("btn_cancel");
  cancel.addEventListener("click", function () { ffSheetClose(); });
  card.appendChild(cancel);
  bd.addEventListener("click", function (ev) { if (ev.target === bd) ffSheetClose(); });
  bd.addEventListener("cancel", function () { ffSheetClose(); });
  bd.appendChild(card);
  document.body.appendChild(bd);
  const nBtn = card.querySelectorAll(".btn").length;
  hnkShowDialog(bd, { title: h.textContent, width: 300, height: 74 + nBtn * 52 });
}

/* A captured layer, in every shape the panel's photo slots read: {mime, b64}
   for ffThumb, _url for vtThumbFor and for the submit paths (which do
   `entry._url || await fileToDataUrl(entry)` — with _url already set, the
   file reader they would otherwise reach for is never called, which is the
   point: there is no file). */
function layerPhotoEntry(cap) {
  const mime = cap.mime || "image/png";
  const b64 = cap.b64 || "";
  const bytes = Math.floor(b64.length * 3 / 4);
  return {
    name: (cap.label || "layer") + (mime === "image/png" ? ".png" : ".jpg"),
    mime: mime, b64: b64,
    _url: "data:" + mime + ";base64," + b64,
    _size: bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB"
      : bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : bytes + " B",
    _fromLayer: true
  };
}
/* captures the active layer and hands back a slot entry, or null with the
   reason already on the status line */
async function layerPhotoCapture() {
  if (state.busy) return null;
  try {
    const cap = await captureLayerB64(1536);
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad"), "err"); return null; }
    return layerPhotoEntry(cap);
  } catch (e) { setStatus(friendlyErr(e), "err"); return null; }
}
/* v6.82.0 — THE FREEFORM SLOT SHEET IS A DIALOG. This was the one photo
   sheet still built as a fixed <div> after 6.78.0 moved the others to
   <dialog>: Photoshop lays a fixed box out as an ordinary block at the end
   of the page, so on the Freeform page an IMG tile did nothing a student
   could see — the owner's 6.152.0 photographs: "active layer နဲ့ chose file
   choose web chose library မရဘူး". It now goes through photoSheet (the same
   dialog the other four callers open) and carries every source the wizard
   slots have: Layer · File · Paste · Web · Library · the last result. */
function ffSrcSheet(slot) {
  const n = String(slot + 1);
  photoSheet("IMAGE " + n, {
    onLayer: function () { ffSlotFromLayer(slot); },
    onFile: function () { ffSlotFromFile(slot); },
    extra: [
      { label: ff9(FF_L.srcPaste), fn: function () { ffSlotFromPaste(slot); } },
      { label: ff9(FF_L.srcWeb), fn: function () { ffSlotFromWeb(slot); } },
      { label: ff9(FF_L.srcLib), fn: function () {
        state.libTargetSlot = slot;
        switchPage("presets");
        setStatus(ff9(REF_L.libHint).replace("{n}", n), "ok");
      } }
    ],
    onLast: state.resultB64 ? function () {
      ffSlotSet(slot, { b64: state.resultB64, mime: state.resultMime || "image/png", label: "result" });
      setStatus(ff9(FF_L.resultTo).replace("{n}", n), "ok");
    } : null
  });
}
async function ffSlotFromLayer(slot) {
  if (state.busy) return;
  try {
    const cap = await captureLayerB64(1536);
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad") + " (IMAGE " + (slot + 1) + ")", "err"); return; }
    ffSlotSet(slot, cap);
    setStatus(t("st_ref_layer_added"), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
async function ffSlotFromFile(slot) {
  if (state.busy) return;
  try {
    setStatus(t("st_importing"));
    const cap = await pickReferenceFile();
    if (!cap) { setStatus(t("st_ready")); return; }
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad") + " (IMAGE " + (slot + 1) + ")", "err"); return; }
    ffSlotSet(slot, cap);
    setStatus(t("st_ref_file_added"), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}
/* v6.82.0 — a web address into a Freeform slot: the same loader the classic
   reference slots used (page links unwrapped to their picture, odd formats
   converted through Photoshop), and when Photoshop refuses the picture's
   host the studio's API fetches it (fetchWebImage). The address is asked
   for in the panel's own prompt dialog, pre-filled from the clipboard when
   a link is already there. */
function ffSlotWebCfg(slot) {
  return {
    tmpPrefix: "hnk_ff_web_",
    assign: function (ref) { ffSlotSet(slot, ref); },
    repaint: renderRefs,
    close: function () { }
  };
}
function looksLikeLink(s) { return /^https?:\/\/\S+$/i.test(String(s || "").trim()); }
async function ffSlotFromWeb(slot) {
  if (state.busy) return;
  let def = "";
  try { const c = await readClipboardText(); if (looksLikeLink(c)) def = String(c).trim(); } catch (e) { }
  const url = await studioAskText(t("url_ph"), def);
  if (url == null || !String(url).trim()) { setStatus(t("st_ready")); return; }
  await loadUrlIntoAnySlot(String(url).trim(), ffSlotWebCfg(slot));
}
/* v6.82.0 — Paste: a copied picture first (the host reads the clipboard's
   image, where the host can), else a copied image address, else the
   nine-language "copy a picture first" line. */
async function ffSlotFromPaste(slot) {
  if (state.busy) return;
  const n = String(slot + 1);
  try {
    setStatus(t("st_importing"));
    const host = globalThis.HNK && globalThis.HNK.photoshopHost;
    let img = null;
    try { if (host && typeof host.readClipboardImage === "function") img = await host.readClipboardImage(); } catch (e) { img = null; }
    if (img && img.ref) {
      const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(img.ref));
      if (m && imgMagicOk(m[2])) {
        ffSlotSet(slot, { b64: m[2], mime: m[1].toLowerCase(), label: "clipboard" });
        setStatus(ff9(FF_L.pasteOk).replace("{n}", n), "ok");
        return;
      }
    }
    const txt = await readClipboardText();
    if (looksLikeLink(txt)) { await loadUrlIntoAnySlot(String(txt).trim(), ffSlotWebCfg(slot)); return; }
    setStatus(ff9(FF_L.pasteNone), "err");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}

/* ---------------- Prompt box (native textarea, capacity self-tested) ---------------- */
function getPromptText() {
  const el = $("promptBox");
  return (el && typeof el.value === "string") ? el.value : "";
}

/* v6.26.0 — the Gemini live-translate bridge left with its provider. A
   Burmese prompt now sends exactly as written (the RunningHub models accept
   it; English simply steers them better), mirroring the web app. */
function promptCap() { return state.promptCap || MAX_PROMPT; }

/* Force the textarea look via inline styles — immune to UXP selector gaps. */

/* Measure the REAL textarea capacity on this machine (guards any UXP cap). */
function detectPromptCap(el) {
  try {
    const probe = new Array(MAX_PROMPT + 1).join("x");
    el.value = probe;
    const got = (el.value || "").length;
    el.value = "";
    state.promptCap = (got >= MAX_PROMPT) ? MAX_PROMPT : Math.max(1, got);
    if (state.promptCap < MAX_PROMPT) {
      setStatus(t("cap_warn") + " " + state.promptCap, "err");
    }
  } catch (e) { state.promptCap = MAX_PROMPT; }
}

function onPromptInput() {
  const el = $("promptBox");
  const cap = promptCap();
  if (el && el.value.length > cap) el.value = el.value.slice(0, cap);
}

/* ---------------- KEEP ORIGINAL locks (user checkboxes, per-generation) ---------------- */
const KEEP_LOCKS = {
  frame: "Keep the exact original framing and composition of IMAGE 1 - same crop, camera angle, perspective, subject position and scale. Do not zoom, re-crop or rotate.",
  pose: "Keep the exact original body pose, gesture and hand positions of the IMAGE 1 subject.",
  face: "Keep the exact original face identity of the IMAGE 1 subject - same eyes, nose, mouth, eyebrows and face shape. No face swap; the person must remain 100% the same person.",
  expr: "Keep the original facial expression unchanged.",
  hair: "Keep the original hairstyle, hair length and hair color.",
  dress: "Keep the original dress / outfit exactly as it is.",
  skin: "Keep the original skin tone and natural skin texture.",
  light: "Keep the original lighting: direction, mood and intensity.",
  color: "Keep the original color grade and white balance.",
  bg: "Keep the original background completely unchanged.",
  subject: "Keep the ENTIRE IMAGE 1 subject untouched - face, body, pose, outfit and hair."
};
const KEEP_ORDER = ["subject", "face", "expr", "pose", "frame", "hair", "dress", "skin", "light", "color", "bg"];

function keepText(suppress) {
  const sup = suppress || [];
  const L = [];
  for (let i = 0; i < KEEP_ORDER.length; i++) {
    const k = KEEP_ORDER[i];
    if (state.keep[k] && sup.indexOf(k) < 0) L.push("- " + KEEP_LOCKS[k]);
  }
  if (!L.length) return "";
  return "KEEP ORIGINAL (locked by the user):\n" + L.join("\n");
}

/* ---------------- Cleanup checkboxes (combine with every Generate) ---------------- */

/* NOTE (v4.19): the old "Reference AI Tools / Styling" grid duplicated the
   Reference Ops Pro card. The duplicate presets (refBG->roBgRep, scene->roBgSwap,
   skinMakeup/fullMakeup->roMkCopy, lightColor->roLcCopy, dress->roDressRep) were
   removed; the unique ones (fgProps, textLogo, style, fgbglc, hair, access, pose)
   were moved into Reference Ops Pro. Reference Ops Pro is now the one system. */

const REF_GUARD_CANVAS = "CANVAS RULE: IMAGE 2's scene becomes the stage - remove every person originally in it; the IMAGE 1 subject(s) stand in that scene, integrated with its perspective, scale, lighting and color. Never invent people.";

const REF_GUARD_STYLE = "STYLE SOURCE RULE: copy ONLY the attributes this tool names from the reference person, adapted onto the IMAGE 1 subject. Never copy the reference person's face, identity or body, never add them as a person, and never return the reference image itself.";

const REF_GUARD_FACE = "FACE SOURCE RULE: the reference supplies ONLY the facial identity (plus makeup or hairstyle when this tool says so) for the matching IMAGE 1 person. Never add the reference person as an extra person.";

const REF_GUARD_SUBJECT = "SUBJECT SOURCE RULE: the reference supplies the PERSON to place into IMAGE 1's unchanged scene, replacing only the matching person at the same position, scale and pose slot, relit to the scene.";

const REF_GUARD = "STRICT REFERENCE RULE: references supply only what the TASK names. If a reference contains people, ignore and exclude them completely. The result contains exactly the IMAGE 1 subject(s) - same faces, same count - and is built on IMAGE 1; never return or recreate a reference image.";

/* ---------------- CAMERA PRO & QUALITY ENGINE (v2.9) ---------------- */

const HNK_CORE = "GUARD (HNK edit rule): change ONLY what the TASK asks - every other pixel of IMAGE 1 stays identical: same face identity, eyes, teeth, expression, pose, body shape, hair, clothing, framing, background content, lighting and color, unless the TASK explicitly changes them. Anything added or changed must integrate physically into the photo: correct light direction with grounded contact shadows, clean strand-level edges with no halo or cutout look, matched white balance and color, correct perspective, true real-world scale and depth of field, real skin pores and fabric texture with no plastic smoothing. Never produce extra or deformed fingers, limbs or faces, warped anatomy, crossed or dead eyes, melted hair or color banding. The final image must read as one untouched professional photograph in 8K ultra-realistic HD.";

/* AUDIT-FIX #3: scope the ban to UNREQUESTED text only, so it no longer contradicts
   features that legitimately add text (Text/Logo overlay, Birthday hero number,
   Caption). Text-adding operations additionally drop it entirely via buildGuard's
   allowText bypass below. */
const HNK_TEXT_BAN = "Do not add watermarks, signatures, or any text that was not part of the request.";

const REAL_DIR = {
  auto: "Integrate every change in whichever direction preserves the subject best.",
  scene: "The subject's original lighting, exposure and color are the master - never alter them; adapt any new or changed background/foreground to match the subject.",
  subject: "The scene's lighting and color are the master - relight and regrade the subject to sit naturally in it; only light and color on the subject may change, never identity, features, expression or pose.",
  edit: "This TASK intentionally changes lighting, color or finish - apply that change as ONE consistent new exposure across the whole frame, never as a pasted-on local effect."
};

/* If the user's typed prompt contains pasted system layers (a copied Final Prompt,
   guards, locks, KEEP block, ROLE MAP, old suffix), strip them so nothing rides twice. */
function sanitizeExternal(p) {
  if (!p) return p || "";
  let t = String(p);
  const exact = [HNK_CORE, HNK_TEXT_BAN,
    REAL_DIR.auto, REAL_DIR.scene, REAL_DIR.subject, REAL_DIR.edit,
    WED_LOCK, WED_QUALITY, RELIGHT_GUARD, SCENE_GUARD, SCENE_FIT, SCENE_ADAPT_ON, SCENE_ADAPT_OFF,
    REF_GUARD, REF_GUARD_STYLE, REF_GUARD_FACE, REF_GUARD_SUBJECT, REF_GUARD_CANVAS,
    "8K Ultra Realistic HD Resolution photo"];
  for (let i = 0; i < exact.length; i++) {
    const x = exact[i];
    if (x && t.indexOf(x) >= 0) t = t.split(x).join(" ");
  }
  t = t.replace(/---\s*IMAGE ROLES\s*---[\s\S]*?(\n\s*\n|$)/g, "\n");
  t = t.replace(/^\s*GUARD \(HNK edit rule\):?/gm, "");
  t = t.replace(/^TASK:\s*/gm, "");
  t = t.replace(/KEEP ORIGINAL \(locked by the user\):[^\n]*(?:\n- [^\n]*)*/g, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3}/g, "\n\n");
  return t.trim();
}

/* v4.6: empty Generate + reference(s) = automatic subject-into-scene composite.
   Scene = the LAST filled ref; any other ref is auto-ignored by the strict reference rule. */
function autoCompositeText() {
  const sceneNo = state.refs[1] ? (state.refs[0] ? 3 : 2) : (state.refs[0] ? 2 : 0);
  if (!sceneNo) return "";
  return "AUTO COMPOSITE: place the IMAGE 1 subject into the scene from IMAGE " + sceneNo + ". " +
    "Use the subject exactly as in IMAGE 1 - same face identity (eyes, nose, mouth), hair, body and face pose, dress and true scale. " +
    "Use IMAGE " + sceneNo + " only as the environment - remove every person originally in it - and build the composition naturally around the subject.";
}

function buildGuard(dir, allowText) {
  /* AUDIT-FIX #3: a text-adding operation (allowText) fully drops the no-text clause
     so the model is never told "add the logo" and "never add text" at once. */
  const ban = (state.banText && !allowText) ? " " + HNK_TEXT_BAN : "";
  return HNK_CORE + ban + " " + (REAL_DIR[dir || state.realDir] || REAL_DIR.auto);
}

function effRealDir(opDir) {
  if (opDir === "edit") return "edit";
  if (state.realDir === "auto" && opDir) return opDir;
  return state.realDir;
}


/* ---------------- Prompt-hygiene strings the old Freeform cards left behind (sanitizeExternal strips them from a pasted prompt) ---------------- */
const WED_LOCK = "WEDDING LOCK: while cleaning, extending or adding, the gown's DESIGN - cut, lace, patterns, details - stays exactly as shot.";

const WED_QUALITY = "Luxury editorial wedding finish, 85mm lens look.";


/* v6.160.0 — the Pipeline Chain Builder (v3.0) lost its card when the panel's pages became the app's own
   (6.51.0); its code stayed behind and still called buildRetouchPrompt, deleted in that same wave. The
   static free-identifier scan (test/verify_no_undeclared_identifiers.js) found the call; the dead code is gone. */

/* ---------------- REFERENCE OPS PRO (v2.10) ---------------- */

/* Who is kept when only the SCENE changes (solo / couple / family). */


/* v6.170.0 — THE THREE-TAP LEARN CYCLE IS GONE; GENERATE RUNS ON THE FIRST TAP.
   From v3.1 to 6.169.1 a tap on GENERATE (Freeform), APPLY (Retouch A / B) or
   the Studio run did not run: the first tap armed the button yellow and opened
   a guide box, the second turned it blue and printed the prompt, and only the
   third — green — generated. The owner photographed it in Photoshop and asked
   for it to go ("Freeform မှာ ဒီလို ၁၂၃ ပြီးမှ Generate လုပ်တဲ့ဟာက မထည့်သင့်ပါဘူး
   အလုပ်ရှုပ်ပါတယ်"). It was panel-only — the web app's GENERATE has always run on
   one tap — so the gate was also the last parity break on those four buttons.
   Removed with it: state.learnMode / armedKey / armedEl / armTimer / armStage,
   HNK.learnMode and its saved setting, the Settings switch (#hnkSetLearn), the
   guide box (#guideBox) with guidePlace / showGuide / showPromptStage / dualT /
   guideFor / GEN_GUIDES / arm classes / disarm, and the ten strings that only
   described the cycle. Each of the four buttons now calls its run directly,
   behind the same state.busy guard armGate opened with. */

/* ---------------- Final prompt builder ---------------- */

function buildFinalPrompt(userText, meta, suppress) {
  let p = (userText || "").trim();
  if (p && p.indexOf("GUARD (HNK edit rule)") !== 0) p = "TASK:\n" + p;
  const head = [];
  if (meta.length) {
    head.push("--- IMAGE ROLES ---");
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      const own = state.imgRoles && typeof m.slot === "number" ? state.imgRoles[m.slot] : "";
      if (own) {
        head.push("IMAGE " + (i + 1) + " = " + own);
      } else if (m.role === "base") {
        head.push("IMAGE " + (i + 1) + " = MAIN SUBJECT: the base photo from the active Photoshop document layer. This is the hero subject. Apply all edits to this image and keep this person.");
      } else {
        head.push("IMAGE " + (i + 1) + " = REFERENCE (" + (m.label || "reference") + ") - use it only for this role.");
      }
    }
    head.push("");
  }
  const lines = [];
  let hasBase = false;
  for (let i = 0; i < meta.length; i++) { if (meta[i].role === "base") hasBase = true; }
  if (hasBase) {
    const kt = keepText(suppress);
    if (kt) { lines.push(""); lines.push(kt); }
  }
  return (head.length ? head.join("\n") + "\n" : "") + p + lines.join("\n");
}

/* ---------------- Ratio / model resolution ---------------- */
function nearestRatio(v) {
  let best = RATIOS[0], bd = Infinity;
  for (let i = 0; i < RATIOS.length; i++) {
    const d = Math.abs(Math.log(RATIOS[i].v / v));
    if (d < bd) { bd = d; best = RATIOS[i]; }
  }
  return best.id;
}

function resolveRatio(base) {
  /* v6.51.0 — the Freeform ratio rail (state.ffRatio, "" = Auto) is the
     app's ratio control; the Setup ratio select is only its fallback. */
  if (state.ffRatio) return state.ffRatio;
  if (state.ratio && state.ratio !== "auto") return state.ratio;
  if (base && base.w && base.h) return nearestRatio(base.w / base.h);
  return "1:1";
}

/* ---------------- RunningHub Enterprise engine (v6.26.0) ----------------
   OWNER DECISION: the panel runs on RunningHub Enterprise shared models
   alone — the Gemini and OpenAI engines, and the Gemini text bridge
   (improve/translate/describe), left with their providers. Mirrors the web
   app's 5.50.0 change. The generate choke point below routes every image
   call through the SAME adapter stack the AI Tools tab already ships
   (HNK.runninghubAdapter → upload → submit → poll → download), so the two
   halves of the panel can never drift onto different engines. */
const RH_QUALITY_LINE = "QUALITY: ultra-detailed professional finish \u2014 crisp micro-detail in skin, hair and fabric, clean edges, accurate materials, no artifacts.";

/* parts (the panel's internal prompt shape) -> joined prompt + image refs */
function partsToPromptImages(parts) {
  const texts = [];
  const refs = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].text) texts.push(parts[i].text);
    else if (parts[i].inlineData) {
      const d = parts[i].inlineData;
      refs.push("data:" + (d.mimeType || "image/png") + ";base64," + d.data);
    }
  }
  return { prompt: texts.join("\n"), refs: refs };
}

let _rhTransport = null;
function rhTransport() {
  if (_rhTransport) return _rhTransport;
  const http = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.runninghubHttp) || null;
  _rhTransport = (http && http.create) ? http.create() : null;
  return _rhTransport;
}

function friendlyErr(e) {
  const m = e && e.message ? e.message : String(e);
  const hm = /^HNKERR:([a-z_]+):/.exec(m);
  /* v6.80.0 — the adapter's stage and one-line reason (e.why, set by rhErrToHnk)
     follow the translated sentence; a refusal that cannot name a cause is a
     refusal nobody can fix */
  if (hm && I18N.en[hm[1]]) return t(hm[1]) + ((e && e.why) ? " \u00b7 " + e.why : "");
  /* AUDIT-FIX #10: strip any internal HNKERR:code: prefix from the fallback so a
     raw token (e.g. err_generic / err_img) never leaks into the status bar. */
  return t("st_err") + ": " + m.replace(/^HNKERR:[a-z_]+:/, "");
}

/* adapter error -> the panel's HNKERR:<i18n-key>: convention friendlyErr reads */
function rhErrToHnk(err) {
  const code = (err && err.code) || "";
  const msg = [err && err.title, err && err.message].filter(Boolean).join(" ") ||
    (err && err.bullets && err.bullets.join(" \u00b7 ")) || "RunningHub error";
  let er;
  if (code === "invalid-key") er = new Error("HNKERR:err_key:" + msg);
  else if (code === "timeout") er = new Error("HNKERR:err_net:" + msg);
  else if (code === "quota" || code === "rate-limited") er = new Error("HNKERR:err_quota:" + msg);
  else er = new Error("HNKERR:err_generic:" + msg);
  er.code = code; /* the app's Freeform card names a `timeout` by its own line */
  /* v6.80.0 — where it stopped and what the host said (adapter error.stage / error.detail) */
  const why = [err && err.stage ? rhStageWord(err.stage) : "", err && err.detail].filter(Boolean).join(" \u00b7 ");
  if (why) er.why = why;
  return er;
}
function rhStageWord(stage) {
  const k = { UPLOADING: "stage_uploading", SUBMITTING: "stage_generating", PROCESSING: "stage_generating", DOWNLOADING_RESULT: "stage_downloading" }[stage];
  return k ? t(k) : String(stage || "").toLowerCase().replace(/_/g, " ");
}

/* the app's Count select: upscale models always run one take */
function ffReqCount() {
  return ffIsUpscale(ffModel()) ? 1 : (state.ffCount || 1);
}

/* single choke point: every image generation in the classic panel runs on
   RunningHub Enterprise. `model` (the old Gemini id) is ignored — v6.51.0:
   the Freeform Model select (state.rhModel, the app's 49-model list) picks
   the registry model, the ratio rail / Advanced Size + Count shape the
   output exactly as the web app's pgCreate does, and every returned take is
   handed back (first one + `extra`) so history shows ×2 / ×4 runs. The
   Setup "pro" tier still appends the app's quality line. */
/* the lifted text-to-image shelf, in the shape callImageAPI's model def
   needs: an id the provider config knows, and the ratio/size flags the
   request builder reads from that config rather than from here. */
function t2iModelDefFor(id) {
  const all = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.t2iModels) || [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) {
      return { id: all[i].id, label: all[i].label, kind: "t2i",
        ratios: all[i].ratios || all[i].uiRatios || [] };
    }
  }
  return null;
}
async function callImageAPI(model, parts, imageConfig, signal) {
  await gateRequireLease();
  const adapter = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.runninghubAdapter) || null;
  const transport = rhTransport();
  if (!adapter || !transport) throw new Error("HNKERR:err_generic:RunningHub engine failed to load - reload the panel");
  const key = (state.rhKey || "").trim();
  if (!key) throw new Error("HNKERR:err_key:RunningHub Enterprise key missing");
  const m = partsToPromptImages(parts);
  /* v6.53.0 — the caller may name the model (Text to Image picks its own from
     the app's shelf); everything else keeps Freeform's. */
  const fm = (model && (ffModelById(model) || t2iModelDefFor(model))) || ffModel();
  const pro = state.model === "pro";
  let prompt = m.prompt.slice(0, MAX_PROMPT);
  if (pro) prompt += "\n" + RH_QUALITY_LINE;
  /* v6.53.0 — a caller may carry its own size tier (Text to Image has its
     own Size picker); Freeform's stays the default. */
  const size = ffHasSize(fm)
    ? (((imageConfig && imageConfig.size) || state.ffSize || ""))
    : "";
  const ratio = ffHasRatio(fm) ? ((imageConfig && imageConfig.aspectRatio) || "") : "";
  const count = ffReqCount();
  /* app v4.28: one AbortController per dispatch \u2014 the card's Stop kills the
     in-flight provider calls instead of waiting them out */
  const res = await adapter.generate(
    { transport: transport, apiKey: key, configOverride: rhConfigOverride() },
    { model: fm.id, prompt: prompt,
      images: m.refs.map(function (r) { return { ref: r }; }),
      output: { ratio: ratio, size: size }, requestCount: count },
    { onStage: function (stage, info) {
        if (stage === "UPLOADING" && info && info.total) setStatus(t("st_gen") + " \u00b7 " + (info.current || 0) + "/" + info.total);
      },
      signal: signal || undefined }
  );
  if (!res || !res.ok) {
    if (res && res.cancelled) { const ce = new Error("HNKERR:err_generic:cancelled"); ce.code = "cancelled"; throw ce; }
    throw rhErrToHnk(res && res.error);
  }
  try { rhBookUsage(res.usage, { kind: "image", label: fm.label, prov: "rh" }); } catch (e) { }
  const takes = [];
  const list = (res.results || []);
  for (let i = 0; i < list.length; i++) {
    const pm = /^data:([^;]+);base64,(.*)$/.exec(String((list[i] && list[i].ref) || ""));
    if (pm) takes.push({ b64: pm[2], mime: pm[1] || "image/png" });
  }
  if (!takes.length) throw new Error("HNKERR:err_generic:RunningHub returned no image");
  const first = takes[0];
  first.extra = takes.slice(1);
  return first;
}

/* ---------------- Studio Lighting AI (3D diagram + relight) ---------------- */


const RELIGHT_GUARD = "RELIGHT RULE: Change ONLY the lighting, shadows, highlights and the resulting color response - follow the light diagram exactly.";

/* ---- 3D diagram (top view, div-based: UXP-safe) ---- */

/* ---------------- Image -> Prompt (Scene Builder) ---------------- */

/* v6.26.0 — Scene EXTRACT (Gemini vision → text) left with its provider.
   Scene GENERATE below is an image job and runs on RunningHub as before. */
const SCENE_FIT = "SCENE FIT (AUTO): Build the described scene AROUND the IMAGE 1 subject following IMAGE 1's framing, composition, camera distance and camera angle exactly. Whatever the shot type - close-up, half-body, full-body or wide - re-project the scene naturally for that viewpoint: correct perspective and camera-lens proportions, believable depth of field, foreground and background elements placed and scaled to IMAGE 1's viewpoint, lighting direction and color kept consistent across the frame. The result must look photographed in-camera from IMAGE 1's exact camera position.";
const SCENE_ADAPT_ON = "Re-light and color-grade the IMAGE 1 subject so they naturally match the new scene's lighting direction, intensity and color palette.";
const SCENE_ADAPT_OFF = "Keep the IMAGE 1 subject's original lighting and colors untouched; blend the scene around them believably.";
const SCENE_GUARD = "SCENE BUILD RULE: the final image contains only the IMAGE 1 subject(s) - build the described scene around them; never add people.";

/* v6.26.0 — extractScenePrompt (Gemini vision → scene text) left with its
   provider; the sceneGenerate image job below is untouched. */

/* ---------------- Reference auto-clean (remove people from Ref1) ---------------- */
function imgMagicOk(b64) {
  if (!b64 || b64.length < 24) return false;
  return b64.indexOf("iVBOR") === 0 || b64.indexOf("/9j/") === 0 || b64.indexOf("UklGR") === 0 || b64.indexOf("R0lGOD") === 0;
}

/* v4.5: references are READ-ONLY inputs - never regenerated or overwritten.
   People-exclusion is handled purely by the reference guards in the prompt. */

/* v6.46.0 — THE WEB AI MINI BROWSER IS GONE (owner: take out what the web
   app does not have). It was a whole second browser living inside a
   Photoshop panel — an allow-list, an address bar, size presets, a
   postMessage image bridge and three global import buttons — none of which
   the web app has or needs. Importing a picture is still there where the
   app puts it: on each reference slot, which offers Library, Layer, File
   and Web. importImageToPS() stays; it is what the Create page uses to put
   a finished result back into the document. */
async function importImageToPS(b64, mime, label) {
  try {
    startBusy("st_place");
    state.resultB64 = b64;
    state.resultMime = mime || "image/png";
    state.lastAction = label || "Web";
    const dm = imgDimsFromB64(b64, state.resultMime);
    if (dm) state.previewRatio = dm.h / dm.w;
    pushHistory({
      after: b64, afterMime: state.resultMime,
      before: state.beforeB64, beforeMime: state.beforeMime,
      userText: "", finalPrompt: "(imported from Web AI)",
      action: state.lastAction, ts: Date.now(), ratio: state.previewRatio
    });
    refreshCompare();
    await placeResultToPS();
    endBusy();
    setStatus(t("st_web_import"), "ok");
  } catch (e) {
    endBusy();
    setStatus(t("st_err") + ": " + (e && e.message ? e.message : e), "err");
  }
}

/* ---------------- Selection mask capture (v2.4) ---------------- */
async function captureSelectionMask() {
  let out = null;
  await psCore.executeAsModal(async function () {
    let sel = null, rgbId = null;
    try {
      sel = await imaging.getSelection({
        documentID: app.activeDocument.id,
        targetSize: { width: 1024 },
        componentSize: 8
      });
      if (!sel || !sel.imageData) return;
      const id = sel.imageData;
      let encTarget = id;
      /* getSelection returns a SINGLE-channel (grayscale) mask, but
         encodeImageData expects an RGB image — passing the mask straight in
         throws, which is why selection-area edits used to silently no-op.
         Expand the 1-channel mask to interleaved RGB first. */
      if (id.components && id.components < 3) {
        const raw = await id.getData();
        const g = (raw instanceof Uint8Array) ? raw : new Uint8Array(raw);
        const w = id.width, h = id.height;
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0, j = 0; i < g.length && j + 2 < rgb.length; i++, j += 3) {
          const v = g[i]; rgb[j] = v; rgb[j + 1] = v; rgb[j + 2] = v;
        }
        rgbId = await imaging.createImageDataFromBuffer(rgb, {
          width: w, height: h, components: 3, colorSpace: "RGB", componentSize: 8, chunky: true
        });
        encTarget = rgbId;
      }
      const enc = await imaging.encodeImageData({ imageData: encTarget, base64: true });
      /* RGB (no alpha) encodes to JPEG; only accept a byte-verified image */
      if (enc && imgMagicOk(enc)) out = { b64: enc, mime: (enc.indexOf("iVBOR") === 0 ? "image/png" : "image/jpeg") };
    } finally {
      try { if (rgbId && rgbId.dispose) rgbId.dispose(); } catch (de) { }
      try { if (sel && sel.imageData && sel.imageData.dispose) sel.imageData.dispose(); } catch (se) { }
    }
  }, { commandName: "HNK Selection Mask" });
  return out;
}

/* ---------------- Results History (v2.4) ---------------- */
const HIST_MAX = 30;

function pushHistory(entry) {
  state.history.unshift(entry);
  while (state.history.length > HIST_MAX) state.history.pop();
  state.histSel = 0;
  renderHistory();
}

/* Recent Prompts dropdown (Studio prompt card): first option is the label,
   each entry restores its full prompt text into the box. */

/* v6.51.0 \u2014 the app's result-card history strip: one 64px thumbnail per
   take, the shown one gold-bordered (`.hist img.sel`), tap = show it. */
/* v6.20.0 — ✕ per take and Clear on the two result strips, as the web app's
   (the app's HIST_L strings, so the parity walk reads the same words). The
   panel's strips are session memory, so the ✕ removes from the strip only. */
const HIST_L = {
  clear:  {my:"History ရှင်းမယ်",en:"Clear history",shn:"လၢင်ႉ History",kac:"History shakau u",th:"ล้างประวัติ",zh:"清空历史",vi:"Xoá lịch sử",id:"Bersihkan riwayat",ms:"Bersihkan sejarah"},
  cleared:{my:"History ရှင်းပြီးပါပြီ",en:"History cleared",shn:"လၢင်ႉ History ယဝ်ႉ",kac:"History shakau sai",th:"ล้าง History แล้ว",zh:"已清空 History",vi:"Đã xoá History",id:"History dibersihkan",ms:"History dibersihkan"},
  del:    {my:"ဒီရလဒ်ကို ဖျက်",en:"Delete this result",shn:"မွတ်ႇဢၼ်ၼႆႉ",kac:"Ndai hpe shamat",th:"ลบผลลัพธ์นี้",zh:"删除此结果",vi:"Xoá kết quả này",id:"Hapus hasil ini",ms:"Padam hasil ini"},
  toPs:   {my:"Photoshop ထဲ layer အဖြစ် ထည့်",en:"Place into Photoshop as a layer",shn:"သႂ်ႇၶဝ်ႈ Photoshop ပဵၼ် layer",kac:"Photoshop kaw layer hku bang u",th:"วางลง Photoshop เป็นเลเยอร์",zh:"作为图层放入 Photoshop",vi:"Đặt vào Photoshop thành lớp",id:"Tempatkan ke Photoshop sebagai layer",ms:"Letak ke Photoshop sebagai lapisan"},
  allToPs:{my:"အားလုံး → PS",en:"All → PS",shn:"တင်းသဵင်ႈ → PS",kac:"Yawng → PS",th:"ทั้งหมด → PS",zh:"全部 → PS",vi:"Tất cả → PS",id:"Semua → PS",ms:"Semua → PS"},
  placedAll:{my:"Photoshop ထဲ {N} ပုံ ထည့်ပြီးပါပြီ ✓",en:"{N} placed into Photoshop ✓",shn:"သႂ်ႇၶဝ်ႈ Photoshop {N} ဢၼ် ✓",kac:"Photoshop kaw {N} bang sai ✓",th:"วางลง Photoshop {N} ภาพแล้ว ✓",zh:"已放入 Photoshop {N} 张 ✓",vi:"Đã đặt {N} ảnh vào Photoshop ✓",id:"{N} ditempatkan ke Photoshop ✓",ms:"{N} diletak ke Photoshop ✓"},
  placed: {my:"Photoshop ထဲ ထည့်ပြီးပါပြီ ✓",en:"Placed into Photoshop ✓",shn:"သႂ်ႇၶဝ်ႈ Photoshop ယဝ်ႉ ✓",kac:"Photoshop kaw bang sai ✓",th:"วางลง Photoshop แล้ว ✓",zh:"已放入 Photoshop ✓",vi:"Đã đặt vào Photoshop ✓",id:"Sudah ditempatkan ke Photoshop ✓",ms:"Telah diletak ke Photoshop ✓"},
  done:   {my:"History က ဖယ်ပြီးပါပြီ",en:"Removed from History",shn:"ဢဝ်ဢွၵ်ႇ History ယဝ်ႉ",kac:"History kaw na shamat sai",th:"ลบออกจากประวัติแล้ว",zh:"已从历史中移除",vi:"Đã gỡ khỏi Lịch sử",id:"Dihapus dari Riwayat",ms:"Dibuang daripada Sejarah"}
};
function histXBtn(onRemove) {
  /* a div, never a <button>: the panel owns every control (verify_panel_gate Q) */
  const x = document.createElement("div"); x.className = "hx"; x.textContent = "✕";
  x.setAttribute("aria-label", ff9(HIST_L.del));
  ffPressable(x, function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); onRemove(); });
  return x;
}
/* v6.109.0 — EVERY TAKE HAS A WAY BACK INTO PHOTOSHOP. The strip could delete
   a take and select it, and the only Place button on the page acted on whatever
   was selected — so sending the third take back meant selecting it first and
   then hunting for a button somewhere else, and in a batch there was no way at
   all (the auto-place path skips state.batch on purpose: a hundred layers is
   not a kindness). The take now carries its own door. It selects itself first,
   so what lands in the document is the picture the student is looking at. */
function histPsBtn(onPlace) {
  const p = document.createElement("div"); p.className = "hps"; p.textContent = "PS";
  p.setAttribute("aria-label", ff9(HIST_L.toPs));
  ffPressable(p, function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); onPlace(); });
  return p;
}
async function histPlaceP(idx) {
  const e = state.history[idx];
  if (!e || !e.after || state.busy) return;
  selectHistory(idx);
  try { setStage("placing"); } catch (e0) { }
  setStatus(t("st_place"));
  try {
    const r = await placeResultToPS();
    try { setStage(null); } catch (e1) { }
    if (r) setStatus(ff9(HIST_L.placed), "ok");
  } catch (err) {
    try { setStage(null); } catch (e2) { }
    setStatus(friendlyErr(err), "err");
  }
}
function histItemP(host, im, idx) {
  const d = document.createElement("div"); d.className = "hitem"; d.appendChild(im);
  d.appendChild(histPsBtn(function () { histPlaceP(idx); }));
  d.appendChild(histXBtn(function () { histRemoveP(idx); })); host.appendChild(d);
}
function histRemoveP(idx) {
  if (!state.history[idx]) return;
  state.history.splice(idx, 1);
  if (!state.history.length) { histClearP(false); setStatus(ff9(HIST_L.done), "ok"); return; }
  let s = state.histSel; if (s > idx) s--; if (s >= state.history.length) s = state.history.length - 1; if (s < 0) s = 0;
  selectHistory(s); setStatus(ff9(HIST_L.done), "ok");
}
function histClearP(say) {
  state.history = []; state.histSel = -1; state.resultB64 = null; state.resultMime = null;
  const rb = $("resultBox"); if (rb) rb.className = clsOf(rb).replace(/ ?\bon\b/, "");
  try { refreshCompare(); } catch (e) { }
  renderHistory();
  if (say !== false) setStatus(ff9(HIST_L.cleared), "ok");
}
/* v6.109.0 — AND ALL OF THEM AT ONCE. A Path run of a hundred photographs
   leaves a hundred takes in this strip and, until 6.109.0, no way to put any of
   them into the open document (auto-place skips a batch on purpose). One take
   at a time is the PS pill above; this is the other half, for the studio that
   wants the whole run stacked in one document to compare or to flatten. It
   places them in strip order through the same proven path, says where it is
   while it works, and stops at the first refusal rather than pressing on
   silently. It only appears when there is more than one take. */
async function histPlaceAllP() {
  if (state.busy || state.history.length < 2) return;
  const n = state.history.length;
  const keep = state.histSel;
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (!state.history[i] || !state.history[i].after) continue;
    setStatus(t("st_place") + " " + (i + 1) + "/" + n);
    selectHistory(i);
    try {
      const r = await placeResultToPS();
      if (!r) break;
      done++;
    } catch (err) {
      setStatus(friendlyErr(err), "err");
      break;
    }
  }
  if (keep >= 0 && keep < state.history.length) selectHistory(keep);
  setStatus(ff9(HIST_L.placedAll).replace("{N}", String(done)), done === n ? "ok" : "err");
}
function histPlaceAllSyncP() {
  const b = $("histPlaceAll"); if (!b) return;
  b.style.display = state.history.length > 1 ? "" : "none";
  b.textContent = ff9(HIST_L.allToPs);
  b.onclick = function () { histPlaceAllP(); };
}
function histClearSyncP() {
  const b = $("histClear"); if (!b) return;
  b.style.display = state.history.length ? "" : "none"; b.textContent = ff9(HIST_L.clear);
  b.onclick = function () { histClearP(true); };
}
function vidItemP(h, v, i) {
  const d = document.createElement("div"); d.className = "hitem"; d.appendChild(v);
  d.appendChild(histXBtn(function () { vidRemoveP(i); })); h.appendChild(d);
}
function vidRemoveP(i) {
  if (!vidHist[i]) return;
  takesForgetP(vidHist.splice(i, 1)[0]);   /* v6.87.0 */
  if (!vidHist.length) { vidClearP(false); setStatus(ff9(HIST_L.done), "ok"); return; }
  if (vidHistSel > i) vidHistSel--; if (vidHistSel >= vidHist.length) vidHistSel = vidHist.length - 1;
  showVidResult(); setStatus(ff9(HIST_L.done), "ok");
}
function vidClearP(say) {
  vidHist = []; vidHistSel = 0; takesClearP("video");
  const h = $("vidHist"); if (h) while (h.firstChild) h.removeChild(h.firstChild);
  const box = $("vidResultBox"); if (box) box.className = "card result-box";
  vidClearSyncP();
  if (say !== false) setStatus(ff9(HIST_L.cleared), "ok");
}
function vidClearSyncP() {
  const b = $("vidHistClear"); if (!b) return;
  b.style.display = vidHist.length ? "" : "none"; b.textContent = ff9(HIST_L.clear);
  b.onclick = function () { vidClearP(true); };
}
function renderHistory() {
  const host = $("hist");
  if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  for (let i = 0; i < state.history.length; i++) {
    (function (idx) {
      const e = state.history[idx];
      if (!e || !e.after) return;
      const im = document.createElement("img");
      dataSrc(im, e.afterMime, e.after);
      im.alt = "result " + (idx + 1);
      im.className = state.histSel === idx ? "sel" : "";
      im.addEventListener("click", function () { selectHistory(idx); });
      histItemP(host, im, idx);
    })(i);
  }
  histClearSyncP();
  histPlaceAllSyncP();
}

function selectHistory(idx) {
  const e = state.history[idx];
  if (!e) return;
  state.histSel = idx;
  if (e.ratio) state.previewRatio = e.ratio;
  state.resultB64 = e.after; state.resultMime = e.afterMime;
  state.beforeB64 = e.before; state.beforeMime = e.beforeMime;
  refreshCompare();
  renderHistory();
}

/* ---------------- Batch Mode (v2.4) ---------------- */
function extToMime(n) {
  n = (n || "").toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/* ---------------- Generate pipeline ---------------- */
/* ================= FREEFORM RUN FEEDBACK (app: btnGen.onclick) =================
   The web app's GENERATE keeps its label while it works — the button glows
   (.gen.working), the card's own #spin shows a gold ring, the ticker
   "<spin_gen> · <secs>s · <done>/<count>" and a sweeping bar, a Stop button
   aborts the in-flight provider calls, and after a failure a Retry button
   appears; done / stopped / timed-out lines land in the card's #stGen.
   UXP has no CSS animation, so the ring and the bar move on a JS interval
   from the same clock the ticker reads (0.8s per turn, 1.3s ease-in-out
   sweep — the app's spinring / spinbar keyframes). The shell's bottom
   status bar keeps its own line; that shell is a later parity wave. */
const ffRun = { tick: 0, anim: 0, abort: null, t0: 0, count: 1, done: 0 };
/* every .spin.on in the app wears the same ring + sweep (its ::before /
   ::after); the Video page's #vidSpin shares this builder with #spin */
function ffSpinEnsure(id) {
  id = id || "spin";
  const sp = $(id);
  if (!sp) return null;
  if (!sp.firstChild) {
    const row = document.createElement("div"); row.className = "spin-row";
    const ring = document.createElement("img"); ring.className = "spin-ring"; ring.src = "icons/ui/spin-ring.png"; ring.alt = "";
    const txt = document.createElement("span"); txt.className = "spin-txt"; txt.id = id + "Txt";
    row.appendChild(ring); row.appendChild(txt);
    const bar = document.createElement("div"); bar.className = "spin-bar";
    const run = document.createElement("div"); run.className = "spin-bar-in";
    bar.appendChild(run);
    sp.appendChild(row); sp.appendChild(bar);
  }
  return sp;
}
function ffSpinText() {
  const secs = Math.round((Date.now() - ffRun.t0) / 1000);
  return ff9(FF_L.spinGen) + " · " + secs + "s" + (ffRun.count > 1 ? " · " + ffRun.done + "/" + ffRun.count : "");
}
function ffSpinIdleText() {
  const sp = ffSpinEnsure(), tx = $("spinTxt");
  if (sp && tx && !ffRun.tick) tx.textContent = ff9(FF_L.spinGen);
}
function ffRunStopTimers() {
  if (ffRun.tick) { clearInterval(ffRun.tick); ffRun.tick = 0; }
  if (ffRun.anim) { clearInterval(ffRun.anim); ffRun.anim = 0; }
}
function ffRunFrame() { spinFrame($("spin"), ffRun.t0); }
function spinFrame(sp, t0) {
  if (!sp) return;
  const ring = sp.querySelector(".spin-ring"), bar = sp.querySelector(".spin-bar"), run = sp.querySelector(".spin-bar-in");
  const el = Date.now() - t0;
  if (ring) ring.style.transform = "rotate(" + Math.round((el % 800) / 800 * 360) + "deg)";
  if (bar && run) {
    /* spinbar 1.3s ease-in-out: background-size 250% with background-position
       200% → -100% is, modulo the repeating tile, one 2.5-wide gradient whose
       left edge slides from -0.5 to -1.0 track widths (crest 75% → 25%) */
    /* v6.77.0 — a percentage of the track, not a measured width: Photoshop
       hands script no geometry (rect 0), so the measured version stood still
       there while the ring turned. margin-left in % is relative to the
       containing block's width, which is exactly the track. */
    const e = ffEaseInOut((el % 1300) / 1300);
    run.style.marginLeft = Math.round((-0.5 - 0.5 * e) * 1000) / 10 + "%";
  }
}
/* CSS ease-in-out = cubic-bezier(.42,0,.58,1): solve x(t)=p for t, return y(t) */
function ffEaseInOut(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const bez = function (a, b, t) { const u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; };
  let lo = 0, hi = 1, t = p;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bez(0.42, 0.58, t) < p) lo = t; else hi = t;
  }
  return bez(0, 1, t);
}
function ffRunStart(count) {
  ffRun.count = count || 1; ffRun.done = 0; ffRun.t0 = Date.now();
  ffRun.abort = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const g = $("btnGenerate"); if (g && g.classList) g.classList.add("working");
  const sp = ffSpinEnsure();
  if (sp) { sp.className = "spin on"; const tx = $("spinTxt"); if (tx) tx.textContent = ffSpinText(); }
  stSet("stGen", "");
  const rb = $("btnRetry"); if (rb) rb.style.display = "none";
  const sb = $("btnGenStop"); if (sb) sb.style.display = "";
  ffRunStopTimers();
  ffRun.tick = setInterval(function () { const tx = $("spinTxt"); if (tx) tx.textContent = ffSpinText(); }, 1000);
  ffRun.anim = setInterval(ffRunFrame, 50);
  ffRunFrame();
  try { stickyGenSchedule(); } catch (e) { }
  return ffRun.abort ? ffRun.abort.signal : null;
}
function ffRunEnd() {
  ffRunStopTimers();
  ffRun.abort = null;
  const g = $("btnGenerate"); if (g && g.classList) g.classList.remove("working");
  const sp = $("spin"); if (sp) sp.className = "spin";
  const sb = $("btnGenStop"); if (sb) sb.style.display = "none";
  ffSpinIdleText();
  try { stickyGenSchedule(); } catch (e) { }
}
function ffRunOk(n, count) {
  stSet("stGen", ff9(FF_L.done) + " (" + n + "/" + count + ")", "ok");
}
/* the app's catch: a tapped Stop is "Stopped", the provider ceiling is
   "Timed out", an empty result its own line, anything else the error text */
function ffRunErrMsg(e, sig) {
  const stopped = (sig && sig.aborted) || (e && e.code === "cancelled") ||
    /abort/i.test(((e && e.name) || "") + " " + ((e && e.message) || ""));
  if (stopped) return ff9(FF_L.stopped);
  if (e && e.code === "timeout") return ff9(FF_L.timedOut);
  if (/returned no image/i.test((e && e.message) || "")) return ff9(FF_L.noImage);
  return friendlyErr(e);
}
function ffRunErr(msg) {
  stSet("stGen", msg, "err");
  const rb = $("btnRetry"); if (rb) rb.style.display = "";
}
function ffGeneratePress() {
  const g0 = $("btnGenerate");
  if (!g0) return;
  if (state.busy) return;   /* never start a second run on top of one */
  /* the label stays put while the run feeds back through the card (no busy dots) */
  setBusyBtn(null);
  runGenerate(null, false, [], false, { action: "Prompt", ffCard: true });
}
function bindFreeformRun() {
  ffSpinEnsure();
  const g = $("btnGenerate");
  if (g) g.addEventListener("click", ffGeneratePress);
  const rb = $("btnRetry");
  if (rb) rb.addEventListener("click", function () { rb.style.display = "none"; ffGeneratePress(); });
  const sb = $("btnGenStop");
  if (sb) sb.addEventListener("click", function () { if (ffRun.abort) { try { ffRun.abort.abort(); } catch (e) { } } });
}

async function runGenerate(extraPresetText, skipRefClean, unkeep, noRefs, opts) {
  const op = opts || {};
  if (op.action) state.lastAction = op.action;
  if (state.busy) return;
  const key = (state.rhKey || "").trim();
  if (!key) {
    /* the app's Freeform card sends you to Setup with the line under the key field */
    if (op.ffCard) { switchPage("setup"); stSet("stRhKey", ff9(FF_L.needKey), "err"); return; }
    setStatus(t("st_need_key"), "err"); return;
  }
  /* AUDIT-FIX #1: clear any prior result up front so a failed generation can never
     be mistaken for success. batch/pipeline callers snapshot op.base BEFORE calling
     us, so clearing here is safe and makes state.resultB64 a true per-run signal. */
  state.resultB64 = null;
  state.resultMime = null;

  const boxTxt = getPromptText().trim();
  /* v4.5: a preset IS the task - the typed box only drives plain Generate */
  let userText = extraPresetText ? extraPresetText : sanitizeExternal(boxTxt);
  if (!userText && !noRefs && (state.refs[0] || state.refs[1])) {
    const ac = autoCompositeText();
    if (ac) {
      userText = ac + "\n" + REF_GUARD_CANVAS;
      if (!op.realDir) op.realDir = "subject";
      unkeep = ["bg", "frame", "light", "color"];
      setStatus(t("st_auto_comp"));
    }
  }
  /* AUDIT-FIX #3: allow requested text when the preset adds it (op.allowText) or a
     caption is turned on, so the no-text guard doesn't silently defeat the feature. */
  const allowText = !!op.allowText;
  if (state.realOn) userText = (userText ? userText + "\n\n" : "") + buildGuard(effRealDir(op.realDir), allowText);
  const hasRef = !noRefs && !!(state.subj || state.refs[0] || state.refs[1] || ffExtraRefs().length);   /* v6.26.0 — IMG 4+ count too */
  if (!userText && !hasRef) {
    if (op.ffCard) { stSet("stGen", ff9(FF_L.needAny), "err"); return; }
    setStatus(t("st_no_prompt"), "err"); return;
  }

  const ffCount = op.ffCard ? ffReqCount() : 1;
  const ffSig = op.ffCard ? ffRunStart(ffCount) : null;
  startBusy("st_capture");
  try {
    /* pre-clean Ref1 so no reference person can ever leak into the result */
    let base = null;
    if (op.base) {
      base = op.base;
      state.beforeB64 = base.b64;
      state.beforeMime = base.mime || "image/jpeg";
      if (base.w && base.h) state.previewRatio = base.h / base.w;
    } else if (state.subj && state.subj.b64) {
      /* v6.51.0 — the app's IMAGE 1 slot is the main subject when filled;
         the open document is only the fallback for an empty slot. */
      base = state.subj;
      state.beforeB64 = base.b64;
      state.beforeMime = base.mime || "image/jpeg";
      if (base.w && base.h) state.previewRatio = base.h / base.w;
    } else if (app.activeDocument) {
      base = await captureDocumentB64(2048);
      state.beforeB64 = base.b64;
      state.beforeMime = base.mime;
      if (base.w && base.h) state.previewRatio = base.h / base.w;
    } else {
      state.beforeB64 = null;
    }

    /* Selection Area Edit: if a PS selection exists, send it as an edit mask */
    let selMask = null;
    if (base && !op.base) {
      try { selMask = await captureSelectionMask(); } catch (se) { selMask = null; }
    }
    if (selMask) {
      userText = (userText ? userText + "\n" : "") +
        "SELECTION RULE: An EDIT MASK image is attached. Edit ONLY the areas that are WHITE in the mask; every BLACK area must stay pixel-identical to IMAGE 1.";
    }

    const meta = [];
    const parts = [];
    if (base) meta.push({ role: "base", slot: 0 });
    for (let i = 0; i < 2; i++) { if (!noRefs && state.refs[i]) meta.push({ role: "ref", label: state.refs[i].label, slot: i + 1 }); }
    if (!noRefs) ffExtraRefs().forEach(function (r, x) { meta.push({ role: "ref", label: r.label, slot: 3 + x }); });   /* v6.26.0 */

    const finalPrompt = buildFinalPrompt(userText, meta, unkeep || []);
    state.lastUserText = userText;
    state.lastFinalPrompt = finalPrompt;
    parts.push({ text: finalPrompt });
    let imgNo = 1;
    if (base) {
      parts.push({ text: "IMAGE " + imgNo + " \u2014 MAIN SUBJECT (edit this image):" });
      parts.push({ inlineData: { mimeType: base.mime, data: base.b64 } });
      imgNo++;
    }
    for (let i = 0; i < 2; i++) {
      const r = noRefs ? null : state.refs[i];
      if (r) {
        parts.push({ text: "IMAGE " + imgNo + " \u2014 REFERENCE ONLY (do not output this image or its people):" });
        parts.push({ inlineData: { mimeType: r.mime, data: r.b64 } });
        imgNo++;
      }
    }
    /* v6.26.0 — IMG 4+ up to the image model's measured capacity ride along as further references */
    if (!noRefs) { const xs = ffExtraRefs(); for (let x = 0; x < xs.length; x++) { parts.push({ text: "IMAGE " + imgNo + " \u2014 REFERENCE ONLY (do not output this image or its people):" }); parts.push({ inlineData: { mimeType: xs[x].mime, data: xs[x].b64 } }); imgNo++; } }
    if (selMask) {
      parts.push({ text: "EDIT MASK for IMAGE 1 \u2014 edit only the WHITE areas, keep every BLACK area unchanged:" });
      parts.push({ inlineData: { mimeType: selMask.mime, data: selMask.b64 } });
    }

    const model = null; /* v6.26.0 — the tier (state.model) shapes the call inside callImageAPI */
    const imageConfig = {};
    const ratio = resolveRatio(base);
    if (ratio) imageConfig.aspectRatio = ratio;
    /* v6.159.1 — the Gemini-era "Pro image size" comparison stood here until the owner's photograph: MODEL_PRO_IMG left with
       that engine in 6.26.0 and a ReferenceError on this line ended EVERY Freeform run since. model is null on this path;
       callImageAPI shapes the size by tier (state.model / state.size), so nothing is lost. */

    startBusy("st_gen");
    const img = await callImageAPI(model, parts, imageConfig, ffSig);
    if (!imgMagicOk(img.b64)) throw new Error("HNKERR:st_img_bad:api result"); /* check 2/3 */
    state.resultB64 = img.b64;
    state.resultMime = img.mime || "image/png";
    /* v6.51.0 — ×2 / ×4 runs: every extra take lands in the history strip
       behind the first one, exactly as the app's result card shows them. */
    const extra = (img.extra || []).slice().reverse();
    let ffTakes = 1;
    for (let x = 0; x < extra.length; x++) {
      if (!imgMagicOk(extra[x].b64)) continue;
      ffTakes++;
      pushHistory({
        after: extra[x].b64, afterMime: extra[x].mime || "image/png",
        before: state.beforeB64, beforeMime: state.beforeMime,
        userText: userText, finalPrompt: finalPrompt,
        action: state.lastAction, ts: Date.now(), ratio: state.previewRatio
      });
    }
    pushHistory({
      after: img.b64, afterMime: state.resultMime,
      before: state.beforeB64, beforeMime: state.beforeMime,
      userText: userText, finalPrompt: finalPrompt,
      action: state.lastAction, ts: Date.now(), ratio: state.previewRatio
    });
    refreshCompare();


    if (state.autoPlace && !op.noPlace) {
      stopDots();
      try { setStage("placing"); } catch (e0) { }
      setStatus(t("st_place"));
      await placeResultToPS();
    }
    endBusy();
    if (op.ffCard) { ffRunEnd(); ffRunOk(ffTakes, ffCount); }
    setStatus(t("st_done") + " \u00B7 " + provTag(), "ok");
  } catch (e) {
    endBusy();
    if (op.ffCard) {
      const fm = ffRunErrMsg(e, ffSig);
      ffRunEnd(); ffRunErr(fm);
      setStatus(fm, "err");
      return;
    }
    setStatus(friendlyErr(e), "err");
  }
}

/* ---------------- Auto-Export (v3.9) ---------------- */
function provTag() {
  /* v6.51.0 — the app's provenance line names the model that ran */
  return "RunningHub \u00B7 " + ffModelLabel(ffModel());
}

function tsStamp() {
  const d = new Date();
  const p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

async function pickSaveFolder() {
  let f = null;
  try { f = await fsp.getFolder(); } catch (e) { setStatus(friendlyErr(e), "err"); }
  if (!f) return false;
  state.saveDirH = f;
  setStatus(t("st_folder_ok"), "ok");
  return true;
}

/* ---------------- Place / Save result ---------------- */
async function writeResultTemp() {
  const folder = await fsp.getDataFolder();
  const ext = state.resultMime === "image/jpeg" ? "jpg" : "png";
  /* AUDIT-FIX #11: reuse ONE fixed filename per extension (overwrite) instead of a
     Date.now()-stamped name, so the plugin data folder can't grow unbounded with
     stale hnk_result_* files over the plugin's lifetime. */
  const file = await folder.createFile("hnk_result." + ext, { overwrite: true });
  await file.write(b64ToBuf(state.resultB64), { format: formats.binary });
  return file;
}

/* v6.9.0 non-destructive masked-group standard (blueprint \u00A73.4-note / \u00A75):
   the placed result lands INSIDE a group "HNK \u2014 <feature>" with a white
   reveal-all layer mask; the original stays untouched beneath. Group naming +
   the batchPlay mask/select descriptors come from the ONE shared helper
   (src/photoshop/masked-place-service.js) so this path and the AI Tools host
   path can never drift apart. Feature-detected: if grouping/masking is
   unavailable the layer stays plain and the status says so honestly.
   Returns { placed, masked, grouped } for honest status lines. */
async function placeResultToPS() {
  if (!state.resultB64) return;
  if (!imgMagicOk(state.resultB64)) { setStatus(t("st_img_bad") + " (Place)", "err"); return; } /* check 3/3 */
  const file = await writeResultTemp();
  if (!app.activeDocument) {
    await psCore.executeAsModal(async function () {
      await app.open(file);
    }, { commandName: "HNK Open Result" });
    setStatus(t("st_new_doc"), "ok");
    /* fresh document \u2014 nothing beneath to protect, no group/mask needed */
    return { placed: true, masked: false, grouped: false, newDoc: true };
  }
  const token = fsp.createSessionToken(file);
  const out = { placed: false, masked: false, grouped: false };
  /* shared masked-group helper (loaded before main.js in index.html);
     guarded so a missing module degrades to the plain-layer behavior */
  const mps = (typeof globalThis !== "undefined" && globalThis.HNK && globalThis.HNK.maskedPlaceService)
    ? globalThis.HNK.maskedPlaceService : null;
  await psCore.executeAsModal(async function () {
    await batchPlay([{
      _obj: "placeEvent",
      ID: 1,
      "null": { _path: token, _kind: "local" },
      freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
      _options: { dialogOptions: "dontDisplay" }
    }], {});
    const doc = app.activeDocument;
    const ls = doc.activeLayers;
    const lyr = ls && ls.length ? ls[0] : null;
    if (lyr) {
      out.placed = true;
      try {
        state.genCount++;
        lyr.name = "HNK \u00B7 " + (state.lastAction || "Result") + " \u00B7 " + (state.genCount < 10 ? "0" : "") + state.genCount;
        const dw = Number(doc.width), dh = Number(doc.height);
        let b = lyr.bounds;
        const lw = Number(b.right) - Number(b.left);
        const lh = Number(b.bottom) - Number(b.top);
        if (lw > 0 && lh > 0) {
          const s = Math.max(dw / lw, dh / lh) * 100;
          if (Math.abs(s - 100) > 0.5) {
            await lyr.scale(s, s, constants.AnchorPosition.MIDDLECENTER);
          }
          b = lyr.bounds;
          const cx = (Number(b.left) + Number(b.right)) / 2;
          const cy = (Number(b.top) + Number(b.bottom)) / 2;
          const dx = dw / 2 - cx, dy = dh / 2 - cy;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) await lyr.translate(dx, dy);
        }
      } catch (e) { hwarn("fit:", e); }
      /* ---- masked-group standard (feature-detected, degrade gracefully) ---- */
      if (mps) {
        try {
          const grp = await doc.createLayerGroup({ name: mps.groupNameFor(state.lastAction || "Result") });
          await lyr.move(grp, constants.ElementPlacement.PLACEINSIDE);
          out.grouped = true;
        } catch (eG) { hwarn("place group:", eG); }
        try {
          /* re-select the result layer (the move can leave the group active),
             then add the white reveal-all mask \u2014 shared descriptors */
          await batchPlay([mps.selectLayerDescriptor(lyr.id), mps.maskDescriptor()], {});
          out.masked = true;
        } catch (eM) { hwarn("place mask:", eM); }
      }
    }
  }, { commandName: "HNK Place Result" });
  return out;
}

async function saveResultAs() {
  if (!state.resultB64 || state.busy) return;
  try {
    const ext = state.resultMime === "image/jpeg" ? "jpg" : "png";
    const f = await fsp.getFileForSaving("HNK_Result." + ext, { types: [ext] });
    if (!f) return;
    await f.write(b64ToBuf(state.resultB64), { format: formats.binary });
    setStatus(t("st_saved"), "ok");
  } catch (e) {
    setStatus(t("st_err") + ": " + (e && e.message ? e.message : e), "err");
  }
}

/* ---------------- Before / After compare ----------------
   v6.51.0 — the app's result card (docs/app showResult / refreshCmp /
   cmpLayout): the card appears only once a result exists, the compare box
   is a percent-split overlay driven by a range input, the take history is a
   row of thumbnails under it. */
function refreshCompare() {
  const hasB = !!state.beforeB64, hasA = !!state.resultB64;
  const box = $("resultBox");
  if (box) box.className = "card result-box" + (hasA ? " on" : "");
  const ri = $("resultImg");
  if (ri) {
    if (hasA) dataSrc(ri, state.resultMime, state.resultB64);
    else clearSrc(ri);
  }
  const iB = $("imgBefore"), iA = $("imgAfter");
  if (iB) {
    if (hasB) { iB.onload = function () { fitCompareBox(); }; dataSrc(iB, state.beforeMime, state.beforeB64); }
    else clearSrc(iB);
  }
  if (iA) {
    if (hasA) {
      iA.onload = function () {
        if (iA.naturalWidth) state.previewRatio = iA.naturalHeight / iA.naturalWidth;
        fitCompareBox();
      };
      dataSrc(iA, state.resultMime, state.resultB64);
    } else clearSrc(iA);
  }
  const prov = $("resProv");
  if (prov) { prov.textContent = hasA ? provTag() : ""; prov.style.display = hasA ? "block" : "none"; }
  const cw = $("cmpWrap");
  if (cw && !(hasA && hasB)) { cw.style.display = "none"; const cb = $("btnCmp"); if (cb) cb.className = "btn"; }
  btnOff($("btnPlace"), !hasA);
  btnOff($("btnSaveAs"), !hasA);
  btnOff($("btnResultToRef"), !hasA);
  ffHandoffRow();
  renderHistory();
  if (hasA) { try { switchPage("prompt"); } catch (e) { } }
  fitCompareBox();
}

function fitCompareBox() {
  const box = $("cmpBox");
  if (!box) return;
  const w = box.clientWidth;
  if (!w) return;
  const iB = $("imgBefore");
  if (iB) iB.style.width = w + "px";
  const r = $("cmpRange");
  updateCmpPos(r ? r.value : 50);
}

function updateCmpPos(v) {
  const pct = Math.max(0, Math.min(100, Number(v) || 0));
  const top = $("cmpTop"), line = $("cmpLine");
  if (top) top.style.width = pct + "%";
  if (line) line.style.left = pct + "%";
}

/* the app's hand-off chips under the result (stHandoffRow): Retouch this,
   Add to Path batch. Studio and Share are the browser's own — a UXP panel
   has neither. */
function ffHandoffRow() {
  const host = $("handoffCreate");
  if (!host) return;
  host.innerHTML = "";
  if (!state.resultB64) return;
  const mime = state.resultMime || "image/png", b64 = state.resultB64;
  function chip(label, fn) {
    const b = document.createElement("div");
    b.className = "chip"; b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
    b.textContent = label;
    b.addEventListener("click", fn);
    host.appendChild(b);
  }
  chip(ff9(FF_L.retouch), function () {
    state.subj = { b64: b64, mime: mime, label: "result" };
    renderRefs();
    switchPage("retouch");
  });
  chip(ff9(FF_L.path), function () {
    const ext = mime === "image/jpeg" ? "jpg" : "png";
    PT.photos.push({ id: "p" + (++PT.seq), name: "hnk-result-" + tsStamp() + "." + ext,
      srcDataUrl: "data:" + mime + ";base64," + b64, status: "queued",
      lookOverride: null, outB64: null, outMime: "", doneSrc: "", file: null });
    try { ptSync(); } catch (e) { }
    switchPage("path");
  });
}

/* the app's "continue editing this result" chain: five workflow chips that
   open the workflow with the result already in its first image slot */
const FF_CHAIN = [["retouch", "i-sparkle", "Retouch"], ["upscale", "i-search", "Upscale"], ["bg-replace", "i-frame", "BG Replace"],
  ["gown-perfect", "i-dress", "Gown Perfect"], ["bridal-decor", "i-flower", "Decor"]];
function ffChainTo(id) {
  const e = state.history[state.histSel];
  const b64 = e ? e.after : state.resultB64, mime = e ? e.afterMime : state.resultMime;
  switchPage("wf");
  let ws = null;
  try { const aiApp = globalThis.HNK && globalThis.HNK.aiToolsApp; ws = aiApp && aiApp.workflowScreen ? aiApp.workflowScreen() : null; } catch (er) { ws = null; }
  if (!ws) return;
  ws.select(id);
  if (!b64) return;
  try {
    const st = ws.getState();
    const inp = st && st.requiredInputs && st.requiredInputs[0];
    const wst = globalThis.HNK && globalThis.HNK.workflowState;
    if (inp && wst && wst.setInput) {
      wst.setInput(st, inp.key, { source: "library", role: inp.role, ref: "data:" + (mime || "image/png") + ";base64," + b64, valid: true });
      ws.refresh();
    }
  } catch (e) { hwarn("chain:", e); }
}
function ffBuildChainRow() {
  const host = $("chainRow");
  if (!host) return;
  host.innerHTML = "";
  for (let i = 0; i < FF_CHAIN.length; i++) {
    (function (p) {
      const b = document.createElement("div");
      b.className = "chip"; b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      setIcnText(b, p[1], "cream", p[2]);
      b.addEventListener("click", function () { ffChainTo(p[0]); });
      host.appendChild(b);
    })(FF_CHAIN[i]);
  }
}

/* ================= IMAGINE PAGE (6.29.0 wave — the app's pgImagine) =================
   The page is DRAWN by js/hnk_imagine.js, the app's own IMAGINE module lifted verbatim
   (tools/build_panel_imagine.js); this is the panel's side of its host contract — the
   same six things the web app hands it, done the Photoshop way: ff9 strings, <img>
   icons, icons/imagine assets, the UXP file dialog (refCaptureEntry handles PSD/TIFF),
   callImageAPI on the chosen model, the panel's gallery store, and Export = place the
   result into the document (plus the auto-save folder when one is set). */
let imagineReady = false;
function imagineHost() {
  return {
    t9: function (m) { return ff9(m); },
    ellMark: function (root, sel, lines) { ellMark(root, sel, lines); },   /* 6.167.0 — the app's clamp marker, drawn here too; 6.167.4 carries the line budget */
    icon: function (name) { return ffIcon(name, "cream"); },
    button: function (cls) { return mkBtn(cls); },
    asset: function (kind, file) { return (kind === "thumb" ? "icons/imagine/th/" : "icons/imagine/") + file; },
    /* v6.107.2 — Imagine's photo can be the open layer.
       The Imagine module is shared with the web app and must stay identical
       on both; a browser has no Photoshop layer, so the choice belongs here,
       in the panel's own host adapter, where it costs the module nothing. */
    pickWire: function (btn, onFiles, kind) {
      const fromFiles = async function () {
        try {
          const picked = await fsp.getFileForOpening({ allowMultiple: true, types: REF_LIB_TYPES });
          const arr = picked ? (Array.isArray(picked) ? picked : [picked]) : [];
          const out = [];
          for (let i = 0; i < arr.length; i++) {
            try {
              const e = await refCaptureEntry(arr[i]);
              if (e && e.b64) out.push({ dataUrl: "data:" + (e.mime || "image/jpeg") + ";base64," + e.b64, name: e.label || arr[i].name || "" });
            } catch (e) { setStatus(friendlyErr(e), "err"); }
          }
          if (out.length) onFiles(out);
        } catch (e) { setStatus(friendlyErr(e), "err"); }
      };
      btn.addEventListener("click", function () {
        photoSheet(ff9(FF_L.where), {
          onLayer: async function () {
            const e = await layerPhotoCapture();
            /* v6.75.1 — the module says which slot asked (its third argument, "imRefFile"
               for the Reference Card); the photo itself is not a reference, and the
               owner's screenshot said it was */
            if (e) { onFiles([{ dataUrl: e._url, name: e.name }]); setStatus(t(kind === "imRefFile" ? "st_ref_layer_added" : "st_photo_layer_added"), "ok"); }
          },
          onFile: fromFiles
        });
      });
    },
    /* v6.79.0 — the module asks its host for a width before it asks the
       viewport; the panel answers with whichever ruler works here */
    stageWidth: function (el) {
      const wp = hnkWidthProbes(); if (!(wp.best > 0)) return 0;
      let n = el, pad = 0, guard = 0;
      while (n && n.nodeType === 1 && guard++ < 40) {
        let cs = null; try { cs = getComputedStyle(n); } catch (e) { cs = null; }
        if (cs) ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth", "marginLeft", "marginRight"].forEach(function (k) { const v = parseFloat(cs[k]); if (isFinite(v)) pad += v; });
        if (n === document.body) break;
        n = n.parentNode;
      }
      return Math.max(80, wp.best - pad);
    },
    hasModel: function (id) { return !!ffModelById(id); },
    /* 6.31.0 — how many pictures the model takes in one call: a Reference Card needs two (the photo + the reference) */
    maxImages: function (id) { const m = ffModelById(id); if (!m) return 0; if (m.maxImages) return m.maxImages; if (m.node && m.node.images && m.node.images.length) return m.node.images.length; return (m.imageParam === "image" || m.imageParam === "imageUrl") ? 1 : 10; },
    sizeTiers: function (id) { const m = ffModelById(id); if (!m || !ffHasSize(m)) return null; return t2iSizeTiers(m) || ["1k", "2k", "4k"]; },
    hasKey: function () { return !!(state.rhKey || "").trim(); },
    gotoSetup: function () { switchPage("setup"); },
    generate: async function (o) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(o.dataUrl || "");
      const parts = [{ text: o.prompt }, { inlineData: { mimeType: m ? m[1] : "image/jpeg", data: m ? m[2] : "" } }];
      /* 6.31.0 — the Reference Card rides as IMAGE 2 beside the photo (IMAGE 1) */
      if (o.refDataUrl) { const r2 = /^data:([^;]+);base64,(.*)$/.exec(o.refDataUrl); if (r2) parts.push({ inlineData: { mimeType: r2[1], data: r2[2] } }); }
      /* one photo in, one photo out — Freeform's take count does not apply here */
      const svCount = state.ffCount; state.ffCount = 1;
      try {
        const r = await callImageAPI(o.modelId, parts, { size: String(o.size || "").toUpperCase() }, o.signal);
        return r ? { b64: r.b64, mime: r.mime || "image/png" } : null;
      } finally { state.ffCount = svCount; }
    },
    friendly: function (e) { return friendlyErr(e); },
    saveGallery: async function (out) {
      const gs = globalThis.HNK && globalThis.HNK.galleryStore;
      if (gs) await gs.save(out.b64, out.mime === "image/jpeg" ? "jpg" : "png", "imagine");
    },
    exportOut: async function (out) {
      state.resultB64 = out.b64; state.resultMime = out.mime || "image/png"; state.lastAction = "Imagine";
      await placeResultToPS();
    },
    toast: function (msg, kind) { setStatus(msg, kind === "ok" ? "ok" : kind === "err" ? "err" : ""); },
    scrollTop: function () { const pg = $("pages"); if (pg) pg.scrollTop = 0; }
  };
}
function imagineEnter() {
  const im = globalThis.HNK && globalThis.HNK.imagine;
  if (!im) return;
  const head = $("phImagine"), m = PAGE_HERO_HEADS.phImagine;
  if (head && m) paintHeroHead(head, m[state.lang] || m[LANG_FB[state.lang]] || m.en);
  if (!imagineReady) { im.init(imagineHost(), $("imRoot")); imagineReady = true; }
  else im.onEnter();
  /* v6.75.0 — THE BLANK FIRST OPEN. The module's init() draws only when its
     root "is visible", judged by getClientRects().length — and this renderer
     answers that with an empty list for every element (SELF-TEST: line boxes
     unavailable, every ruler zero). So in Photoshop the first entry painted
     the hero head and nothing under it, and only the second entry, through
     onEnter, drew the hub. The owner photographed both states. The page is
     being entered, so it is drawn: if init declined, render now. The module
     itself stays byte-identical to the app's. */
  try { if (typeof im.drawn === "function" && !im.drawn() && typeof im.render === "function") im.render(); }
  catch (eDraw) { hwarn("imagine:draw", eDraw); }
}
/* a language change repaints the page the way the app's reload would */
REFRESHERS.push(function () { try { if (imagineReady) imagineEnter(); } catch (e) { } });

/* ================= FREEFORM PAGE (v6.51.0 — the app's pgCreate) =================
   The GENERATE card: the app's 49 RunningHub image models behind the brand
   picker, the visual ratio rail, Advanced count/size, the add-on summary and
   the ETA line. The native selects stay the single source of truth, exactly
   as in the app; the rail only mirrors options → chips and writes taps back. */
function ffFmtSecs(s) { return s >= 120 ? Math.round(s / 60) + ff9(FF_L.min) : s + "s"; }
function ffPaintEta() {
  const el = $("genEta");
  if (!el) return;
  const n = Math.max(1, state.ffCount || 1);
  el.textContent = "≈ " + ffFmtSecs(60) + "–" + ffFmtSecs(180 * n) + ff9(FF_L.credits);
}
function ffPaintModelBtn() {
  const m = ffModel();
  const label = ffModelLabel(m);
  const sel = $("ffModel"); if (sel) sel.value = m.id;
  const v = $("ffModelVal"); if (v) v.textContent = label;
  const brand = ffModelBrand(label);
  const tile = $("ffModelTile"); if (tile) tile.className = "hsl-tile " + brand[0];
  const gl = $("ffModelGlyph"); if (gl) gl.src = "icons/ui/brand-" + brand[1] + ".png";
}
function ffFillRatio() {
  const sel = $("ffRatio");
  if (!sel) return;
  const m = ffModel();
  const opts = ffRatioOptionsFor(m);
  if (opts.indexOf(state.ffRatio) < 0) state.ffRatio = opts[0];
  fillSelect(sel, opts.map(function (v) { return { v: v, label: v ? v : "Ratio: Auto" }; }));
  sel.value = state.ffRatio;
  const show = ffHasRatio(m);
  sel.style.display = "none"; /* the rail is the visible ratio control (app .rr-native) */
  const rail = $("ffRatioRail");
  if (rail) rail.style.display = show ? "flex" : "none";
  ffPaintRail();
}
/* ============================================================
   v6.56.0 — THE RATIO RAIL, ONCE.

   The web app has exactly one of these (ratioRailAttach), attached to its
   three ratio selects: Freeform, Text to Image and Video. The panel had two
   hand-copied builders — one for Freeform, one for Text to Image — and none
   at all for Video, so on the Video page a student got the raw dropdown the
   app retired, and no shaped box to read the shot's shape from. Three copies
   is how a fourth page ends up different again, so there is one builder now
   and the three rails are three calls to it.
   ============================================================ */
function paintRatioRail(railId, selId, pick) {
  const rail = $(railId), sel = $(selId);
  if (!rail || !sel) return;
  while (rail.firstChild) rail.removeChild(rail.firstChild);
  for (let i = 0; i < sel.options.length; i++) {
    (function (o) {
      const v = o.value, m = /^(\d+):(\d+)$/.exec(v);
      const b = document.createElement("div");
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
      b.className = "rchip" + (m ? "" : " auto") + (v === sel.value ? " on" : "");
      const ic = document.createElement("i");
      const MX = 20; let w = 15, h = 15;
      if (m) {
        const rw = +m[1], rh = +m[2];
        if (rw >= rh) { w = MX; h = Math.max(7, Math.round(MX * rh / rw)); }
        else { h = MX; w = Math.max(7, Math.round(MX * rw / rh)); }
      }
      ic.style.width = w + "px"; ic.style.height = h + "px";
      /* the app's own "A" in the dashed box, so Auto reads as a choice and
         not as an empty slot */
      if (!m) ic.textContent = "A";
      b.appendChild(ic);
      const sp = document.createElement("span"); sp.textContent = v || "Auto";
      b.appendChild(sp);
      b.addEventListener("click", function () { sel.value = v; pick(v); });
      rail.appendChild(b);
    })(sel.options[i]);
  }
}
function ffPaintRail() {
  paintRatioRail("ffRatioRail", "ffRatio", function (v) {
    state.ffRatio = v; ffPaintRail(); saveSettings();
  });
}
/* app renderBtn: the picker shows the chosen option's text; a "Word: value"
   label splits into the context word (already static in the markup) and the
   value, so "Size: Auto" reads Size / Auto while "2K (Pro)" stays whole */
function ffPaintHslVal(selId, valId) {
  const sel = $(selId), v = $(valId);
  if (!sel || !v) return;
  const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
  const raw = opt ? String(opt.textContent || "") : "—";
  const m = /^([A-Za-z][A-Za-z ]{1,11}):\s+(.*)$/.exec(raw);
  v.textContent = m ? m[2] : raw;
}
function ffPaintCountBtn() { ffPaintHslVal("ffCount", "ffCountVal"); }
function ffPaintSizeBtn() { ffPaintHslVal("ffSize", "ffSizeVal"); }
/* v6.26.0 — the app's rhNarrowSizeOptionsFor: a model that publishes its own resolution list (runninghub-config
   `resolutions`, e.g. Nano Banana Pro Ultra 4k/8k) offers exactly those tiers; every other model the stock four. */
const FF_SIZE_STOCK = [{ v: "", label: "Size: Auto" }, { v: "1K", label: "1K" }, { v: "2K", label: "2K (Pro)" }, { v: "4K", label: "4K (Pro)" }];
function ffNarrowSize(m) {
  const ss = $("ffSize"); if (!ss) return;
  const mc = rhDefaultModels()[(m && m.id) || ""] || {};
  const list = (mc.resolutions && mc.resolutions.length) ? mc.resolutions : null;
  const want = list ? [{ v: "", label: "Size: Auto" }].concat(list.map(function (r) { const u = String(r).toUpperCase(); return { v: u, label: u }; })) : FF_SIZE_STOCK;
  const cur = Array.prototype.map.call(ss.options, function (o) { return o.value; }).join("|"), nxt = want.map(function (o) { return o.v; }).join("|");
  if (cur !== nxt) fillSelect(ss, want);
  if (!want.some(function (o) { return o.v === state.ffSize; })) state.ffSize = "";
}
function ffPaintAdvanced() {
  const m = ffModel();
  const sc = $("ffCount"), ss = $("ffSize");
  ffNarrowSize(m);   /* v6.26.0 — only the tiers this model honours */
  /* the app hides the select and its .hsl wrapper follows (syncVis); here the
     wrapper is the thing shown or hidden */
  const wc = $("ffCountHsl") || sc, ws = $("ffSizeHsl") || ss;
  if (ffIsUpscale(m)) state.ffCount = 1;
  if (sc) { sc.value = String(state.ffCount || 1); wc.style.display = ffIsUpscale(m) ? "none" : ""; }
  if (ss) { ss.value = ffHasSize(m) ? (state.ffSize || "") : ""; ws.style.display = ffHasSize(m) ? "" : "none"; }
  ffPaintCountBtn();
  ffPaintSizeBtn();
  ffPaintEta();
}
/* v6.79.0 — THE WIZARD'S GENERATE OPTIONS ARE FREEFORM'S. The web app's
   Smart Workflow wizard clones the Create card's model · ratio · count · size
   selects into its last step and writes every change back (buildWizGenRow);
   the panel's wizard printed a read-only "Model: Auto · Nano Banana 2 ·
   Output: 2K · auto" line, and the owner asked for the four to be pickable.
   This is the bridge the AI Tools screen reads and writes: the same 49
   models, the same per-model ratio and size lists, the same count, and a
   set() that repaints Freeform so the two never disagree. */
globalThis.HNK = globalThis.HNK || {};
globalThis.HNK.genOpts = {
  models: function () { return FREEFORM_MODELS.map(function (m) { return { id: m.id, label: ffModelLabel(m), upscale: ffIsUpscale(m) }; }); },
  current: function () {
    const m = ffModel();
    return { model: m.id, ratio: ffHasRatio(m) ? (state.ffRatio || "") : "", count: ffIsUpscale(m) ? 1 : (state.ffCount || 1), size: ffHasSize(m) ? (state.ffSize || "") : "" };
  },
  ratios: function (id) { const m = ffModelById(id) || ffModel(); return ffHasRatio(m) ? ffRatioOptionsFor(m).slice() : []; },
  sizes: function (id) {
    const m = ffModelById(id) || ffModel();
    if (!ffHasSize(m)) return [];
    const mc = rhDefaultModels()[m.id] || {};
    const list = (mc.resolutions && mc.resolutions.length) ? mc.resolutions : null;
    return list ? [""].concat(list.map(function (r) { return String(r).toUpperCase(); })) : FF_SIZE_STOCK.map(function (o) { return o.v; });
  },
  counts: function (id) { const m = ffModelById(id) || ffModel(); return ffIsUpscale(m) ? [1] : [1, 2, 4]; },
  hasRatio: function (id) { const m = ffModelById(id); return !!(m && ffHasRatio(m)); },
  hasSize: function (id) { const m = ffModelById(id); return !!(m && ffHasSize(m)); },
  set: function (o) {
    o = o || {};
    if (o.model && ffModelById(o.model)) state.rhModel = o.model;
    if (o.ratio != null) state.ffRatio = String(o.ratio);
    if (o.count != null) state.ffCount = Math.max(1, Math.min(4, parseInt(o.count, 10) || 1));
    if (o.size != null) state.ffSize = String(o.size);
    try { ffPaintModelBtn(); ffFillRatio(); ffPaintRail(); ffPaintAdvanced(); } catch (e) { hwarn("genOpts.set:", e); }
    try { saveSettings(); } catch (e2) { }
    return this.current();
  }
};
function ffOnModelChange(id) {
  const m = ffModelById(id) || FREEFORM_MODELS[0];
  state.rhModel = m.id;
  try { renderRefs(); } catch (e0) { } /* v6.26.0 — the slots follow the model */
  rhCfg().activeModel = m.id;
  ffPaintModelBtn();
  ffFillRatio();
  ffPaintAdvanced();
  try { rhRenderConfiguredList(); renderSetupStatus(); } catch (e) { }
  saveSettings();
  setStatus(ff9(FF_L.modelSet).replace("{m}", ffModelLabel(m)), "ok");
}
function ffPaintLabels() {
  const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
  setIcnText($("btnRefsClear"), "i-trash", "cream", ff9(FF_L.refsClear));
  setIcnText($("btnPromptCopy"), "i-doc", "cream", ff9(FF_L.promptCopy));
  set("genEngine", ff9(FF_L.engine));
  set("genAdvLbl", ff9(FF_L.adv));
  set("addonSummaryCreate", ff9(FF_L.addonsNone));
  set("resultH2", ff9(FF_L.resultH2));
  set("btnPlace", t("btn_place"));
  setIcnText($("btnResultToRef"), "i-restore", "cream", ff9(FF_L.toRef));
  setIcnText($("chainH"), "i-arrow", "muted", ff9(FF_L.chainH));
  setIcnText($("btnGenStop"), "i-close", "cream", ff9(FF_L.stop));
  setIcnText($("btnRetry"), "i-retry", "cream", ff9(FF_L.retry));
  ffSpinIdleText();
  const pb = $("promptBox"); if (pb) pb.placeholder = ff9(FF_L.promptPh);
  ffPaintEta();
}
function bindFreeform() {
  const sm = $("ffModel");
  if (sm) {
    fillSelect(sm, FREEFORM_MODELS.map(function (m) { return { v: m.id, label: "Model: " + ffModelLabel(m) }; }));
    sm.addEventListener("change", function () { ffOnModelChange(sm.value); });
  }
  const sr = $("ffRatio");
  if (sr) sr.addEventListener("change", function () { state.ffRatio = sr.value; ffPaintRail(); saveSettings(); });
  const sc = $("ffCount");
  if (sc) {
    fillSelect(sc, [{ v: "1", label: "×1" }, { v: "2", label: "×2" }, { v: "4", label: "×4" }]);
    sc.addEventListener("change", function () { state.ffCount = Number(sc.value) || 1; ffPaintCountBtn(); ffPaintEta(); saveSettings(); });
  }
  const ss = $("ffSize");
  if (ss) {
    fillSelect(ss, [{ v: "", label: "Size: Auto" }, { v: "1K", label: "1K" }, { v: "2K", label: "2K (Pro)" }, { v: "4K", label: "4K (Pro)" }]);
    ss.addEventListener("change", function () { state.ffSize = ss.value; ffPaintSizeBtn(); saveSettings(); });
  }
  const adv = $("genAdvH"), grp = $("genGrpAdvanced");
  if (adv && grp) adv.addEventListener("click", function () {
    grp.className = clsOf(grp).indexOf(" open") >= 0 ? "grp app-grp" : "grp app-grp open";
    grpShow(grp, clsOf(grp).indexOf(" open") >= 0);
  });
  const eng = $("genEngine");
  if (eng) eng.addEventListener("click", function () { switchPage("setup"); saveSettings(); });
  const ad = $("addonSummaryCreate");
  if (ad) ad.addEventListener("click", function () { switchPage("retouch"); saveSettings(); });
  const rc = $("btnRefsClear");
  if (rc) rc.addEventListener("click", function () {
    if (!state.subj && !state.refs[0] && !state.refs[1]) return;
    state.subj = null; state.refs[0] = null; state.refs[1] = null; state.imgRoles = null;
    for (let i = 0; i < FF_SLOT_IDS.length; i++) { try { refLibForgetSlot(FF_SLOT_IDS[i]); } catch (e) { } }
    renderRefs();
    setStatus(ff9(FF_L.cleared), "ok");
  });
  const pc = $("btnPromptCopy");
  if (pc) pc.addEventListener("click", function () {
    const v = getPromptText().trim();
    if (!v) return;
    const done = function () { setStatus("✓", "ok"); };
    const fail = function () { setStatus(ff9(FF_L.copyErr), "err"); };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(done, fail);
      } else if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.setContent) {
        Promise.resolve(navigator.clipboard.setContent({ "text/plain": v })).then(done, fail);
      } else fail();
    } catch (e) { fail(); }
  });
  const cmp = $("btnCmp"), cw = $("cmpWrap");
  if (cmp && cw) cmp.addEventListener("click", function () {
    if (!state.resultB64) return;
    if (!state.beforeB64) { setStatus(ff9(FF_L.cmpNeed), "err"); return; }
    const open = cw.style.display === "none";
    cw.style.display = open ? "block" : "none";
    cmp.className = "btn" + (open ? " active" : "");
    if (open) fitCompareBox();
  });
  const rg = $("cmpRange");
  if (rg) rg.addEventListener("input", function () { updateCmpPos(rg.value); });
  ffBuildChainRow();
  ffPaintModelBtn();
  ffFillRatio();
  ffPaintAdvanced();
  ffPaintLabels();
  REFRESHERS.push(function () {
    try { ffPaintModelBtn(); ffFillRatio(); ffPaintAdvanced(); ffPaintLabels(); } catch (e) { hwarn("freeform:", e); }
    try { renderRefs(); if (globalThis.HNK && globalThis.HNK.lib) globalThis.HNK.lib.repaint(); } catch (e) { hwarn("library:", e); }
  });
  stickyGenBind();
}

/* ================= STICKY GENERATE (app: position:sticky) =================
   The web app pins GENERATE with `position:sticky; bottom:calc(76px + safe-area)`
   — 8.4px above its 67.6px tab bar — so the call to action never leaves the
   screen while its card is in view. UXP has no sticky, so this reproduces the
   same rule by hand: while the button's natural spot is below the fold it is
   lifted into #genDock (absolute inside .app, above the scroller) at the line
   the app would pin it to, capped — like sticky — at its card's content top;
   once the natural spot scrolls up past that line the button goes back into
   the card. A same-height .gen-ph holds the card's layout meanwhile.
   Listed per page so the other sticky gens (Retouch, Video, VidUp, T2I) can
   join as their pages reach parity. */
const STICKY_GENS = [
  { page: "prompt", btn: "btnGenerate" },
  /* the studio's generate bar is one shared node that moves between the two
     suite pages, so both list the same button id */
  { page: "meitu", btn: "btnStGen" },
  { page: "evoto", btn: "btnStGen" }
];
const STICKY_GAP = 8.4;
const stickyS = { ph: {}, raf: 0 };
function stickyGenNatural(btn) {
  const ph = stickyS.ph[btn.id];
  return (ph && ph.parentNode) ? ph : btn;
}
function stickyGenUndock(btn) {
  const ph = stickyS.ph[btn.id];
  if (!ph || !ph.parentNode) return;
  ph.parentNode.insertBefore(btn, ph);
  ph.parentNode.removeChild(ph);
  const dock = $("genDock");
  if (dock && !dock.firstChild) dock.className = "gen-dock";
}
function stickyGenDock(btn, ref, top, left, width) {
  const dock = $("genDock");
  if (!dock) return;
  if (ref === btn) {
    /* first lift: leave a placeholder of the button's margin box behind */
    let ph = stickyS.ph[btn.id];
    if (!ph) { ph = document.createElement("div"); ph.className = "gen-ph"; stickyS.ph[btn.id] = ph; }
    const cs = getComputedStyle(btn);
    ph.style.height = btn.getBoundingClientRect().height + "px";
    ph.style.marginTop = cs.marginTop;
    btn.parentNode.insertBefore(ph, btn);
    dock.appendChild(btn);
  }
  dock.style.top = top + "px";
  dock.style.left = left + "px";
  dock.style.width = width + "px";
  dock.className = "gen-dock on";
}
function stickyGenUpdate() {
  stickyS.raf = 0;
  const app = document.querySelector(".app"), pages = $("pages"), bot = document.querySelector(".botbar");
  if (!app || !pages || !bot) return;
  const ar = app.getBoundingClientRect(), br = bot.getBoundingClientRect(), pr = pages.getBoundingClientRect();
  const line = Math.min(br.top, pr.bottom) - STICKY_GAP;
  for (let i = 0; i < STICKY_GENS.length; i++) {
    const sg = STICKY_GENS[i], btn = $(sg.btn);
    if (!btn) continue;
    const ref = stickyGenNatural(btn);
    const card = ref.closest ? ref.closest(".card") : null;
    const pageEl = ref.closest ? ref.closest(".page") : null;
    const shown = pageEl && clsOf(pageEl).indexOf(" on") >= 0 && btn.style.display !== "none";
    if (!shown || !card) { stickyGenUndock(btn); continue; }
    const nr = ref.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const h = ref === btn ? nr.height : parseFloat(ref.style.height) || nr.height;
    const ccs = getComputedStyle(card), bcs = getComputedStyle(btn);
    const cap = cr.top + (parseFloat(ccs.paddingTop) || 0) + (parseFloat(bcs.marginTop) || 0);
    const want = Math.max(line - h, cap);
    if (nr.top > want + 0.5) stickyGenDock(btn, ref, want - ar.top, nr.left - ar.left, nr.width);
    else stickyGenUndock(btn);
  }
}
function stickyGenSchedule() {
  if (stickyS.raf) return;
  stickyS.raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame(stickyGenUpdate) : setTimeout(stickyGenUpdate, 16);
}
function stickyGenBind() {
  const pages = $("pages");
  if (!pages || !$("genDock")) return;
  pages.addEventListener("scroll", stickyGenSchedule);
  window.addEventListener("resize", stickyGenSchedule);
  /* group toggles, model changes and result cards move the natural spot;
     settle after the tap and again after the app-timed transitions */
  pages.addEventListener("click", function () { stickyGenSchedule(); setTimeout(stickyGenSchedule, 360); });
  pages.addEventListener("change", function () { setTimeout(stickyGenSchedule, 0); });
  REFRESHERS.push(function () { setTimeout(stickyGenSchedule, 0); });
  setTimeout(stickyGenSchedule, 0);
  fabTopBind(pages);
}

/* ================= JUMP-TO-TOP (app: .fab-top / #btnTop) =================
   The web app shows its "↑" once window.scrollY passes 1200 (the Library is
   26 "load more" taps deep) and scrolls smoothly back to 0. Here .pages is the
   scroller; a page switch resets its scrollTop, so the button hides then too. */
function fabTopPaint() {
  const b = $("btnTop"), pages = $("pages");
  if (!b || !pages) return;
  const on = pages.scrollTop > 1200;
  const cls = "fab-top" + (on ? " on" : "");
  if (clsOf(b) !== cls) b.className = cls;
}
function fabTopBind(pages) {
  const b = $("btnTop");
  if (!b || !pages) return;
  let tick = false;
  pages.addEventListener("scroll", function () {
    if (tick) return;
    tick = true;
    const fr = function () { tick = false; fabTopPaint(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fr); else setTimeout(fr, 16);
  });
  const go = function () {
    let smooth = false;
    try {
      if (typeof pages.scrollTo === "function") { pages.scrollTo({ top: 0, behavior: "smooth" }); smooth = true; }
    } catch (e) { smooth = false; }
    if (!smooth) pages.scrollTop = 0;
    setTimeout(fabTopPaint, 0);
  };
  b.addEventListener("click", go);
  b.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); go(); }
  });
  fabTopPaint();
}

/* ================= CREATE MODE (standalone) =================
   Pure prompt(+own refs) -> new image. Never touches the active document,
   presets, chains, cleanup, keeps, camera or the edit Guard. */
const CREATE_FINISH = "Photorealistic professional photograph: correct anatomy and hands, natural skin texture, coherent lighting and shadows, 8K ultra-realistic HD detail, no watermarks or unintended text.";

function getCreateText() {
  const el = $("cPromptBox");
  return (el && typeof el.value === "string") ? el.value : "";
}

function buildCreateParts(p) {
  const parts = [];
  let n = 1;
  for (let i = 0; i < 4; i++) {
    const r = state.cRefs[i];
    if (!r) continue;
    parts.push({ text: "REFERENCE " + n + " (" + (r.label || "reference") + ") - use from it only what the prompt asks:" });
    parts.push({ inlineData: { mimeType: r.mime, data: r.b64 } });
    n++;
  }
  parts.push({ text: "CREATE MODE - generate a brand-new photograph purely from this description (there is no source document):\n" + p + "\n" + CREATE_FINISH });
  return parts;
}

/* Visual reference thumbnails (mirrors the Prompt-tab reference UX so Create
   has the same professional in-flow: Layer / File / Web per slot, with a live
   thumbnail + clear). */
function paintCreateRefs() {
  for (let i = 0; i < 4; i++) {
    const r = state.cRefs[i];
    const img = $("cRefImg" + i), ph = $("cRefPh" + i);
    const lb = $("cRefLb" + i), x = $("cRefX" + i);
    if (!img || !ph) continue;
    if (r) {
      img.style.backgroundImage = 'url("data:' + r.mime + ";base64," + r.b64 + '")';
      img.style.display = "block";
      ph.style.display = "none";
      if (lb) lb.textContent = r.label || "";
      if (x) x.style.display = "flex";
    } else {
      img.style.backgroundImage = "";
      img.style.display = "none";
      ph.style.display = "flex";
      if (lb) lb.textContent = "";
      if (x) x.style.display = "none";
    }
  }
}

async function pickCreateRef(i) {
  if (state.busy) return;
  try {
    setStatus(t("st_importing"));
    const cap = await pickReferenceFile();
    if (!cap) { setStatus(t("st_ready")); return; }
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad") + " (Ref)", "err"); return; }
    state.cRefs[i] = cap;
    paintCreateRefs();
    setStatus(t("st_ref_file_added"), "ok");
  } catch (e) { setStatus(friendlyErr(e), "err"); }
}

async function addCreateLayerRef(i) {
  if (state.busy) return;
  try {
    const cap = await captureLayerB64(1536);
    if (!imgMagicOk(cap.b64)) { setStatus(t("st_img_bad") + " (Ref)", "err"); return; }
    state.cRefs[i] = cap;
    paintCreateRefs();
    setStatus(t("st_ref_layer_added"), "ok");
  } catch (e) {
    const friendlyMsg = friendlyErr(e);
    const lb = $("cRefLb" + i); if (lb) lb.textContent = "! " + friendlyMsg.slice(0, 48);
    setStatus(friendlyMsg, "err");
  }
}

/* v6.51.0 — the app's Text to Image names no engine above its GENERATE, so
   neither does the panel; the line is gone from the markup and this keeps
   its remaining callers null-safe. */

function updateCCmpPos(v) {
  const box = $("cCmpBox");
  const w = box ? box.clientWidth : 0;
  const px = Math.round(w * Number(v) / 100);
  const tp = $("cCmpTop"), ln = $("cCmpLine");
  if (tp) tp.style.width = px + "px";
  if (ln) ln.style.left = Math.max(0, px - 1) + "px";
}

/* Aspect for the Create compare box: the real result's ratio when we have one,
   else the chosen Create ratio (so the empty box already previews at size). */
function createAspect() {
  if (state.cResultB64) {
    try { const d = imgDimsFromB64(state.cResultB64, state.cMime); if (d && d.w) return d.h / d.w; } catch (e) { }
  }
  const p = String(state.cRatio || "1:1").split(":");
  const a = Number(p[0]), b = Number(p[1]);
  return (a && b) ? (b / a) : 1;
}

/* the app's result card exists only once there is a result to show */
function paintCreateResultBox() {
  const box = $("cResultBox");
  if (box) box.className = "card result-box" + (state.cResultB64 ? " on" : "");
}

function refreshCreateCompare() {
  paintCreateResultBox();
  const iA = $("cImgAfter"), iB = $("cImgBefore"), box = $("cCmpBox");
  if (!iA || !box) return;
  if (state.cResultB64) dataSrc(iA, state.cMime, state.cResultB64);
  if (iB && state.cBeforeB64) dataSrc(iB, state.cMime, state.cBeforeB64);
  const w = box.clientWidth;
  if (w) {
    /* professional, aspect-aware size (matches the Output tab) with a generous
       floor so the preview is never a thin strip */
    const h = Math.max(340, Math.min(Math.round(w * createAspect()), 900));
    box.style.height = h + "px";
    if (iA) iA.style.width = w + "px";
    if (iB) iB.style.width = w + "px";
  }
  const sl = $("cCmpSlider");
  const hasResult = !!state.cResultB64;
  if (sl) sl.disabled = !hasResult;
  const psBtn = $("btnCreateToPS"), saveBtn = $("btnCreateSave"), refBtn = $("btnCreateToRef");
  btnOff(psBtn, !hasResult);
  btnOff(saveBtn, !hasResult);
  btnOff(refBtn, !hasResult);
  updateCCmpPos(sl ? sl.value : 50);
}

async function createGenerate(restyle) {
  if (state.busy) return;
  const p = sanitizeExternal(getCreateText()).trim();
  if (restyle && !state.cResultB64) { setStatus(t("cr_need_result"), "err"); return; }
  if (!p && !restyle) { setStatus(t("st_no_prompt"), "err"); return; }
  const n = Math.max(1, Math.min(4, state.cVariations || 1));
  startBusy("st_gen");
  try {
    /* "auto" means the model picks — send no aspect, exactly as the app does */
    const cr = state.cRatio || "1:1";
    const cfg = (cr === "auto") ? {} : { aspectRatio: cr };
    if (state.t2iSize) cfg.size = state.t2iSize;
    /* Snapshot the sources ONCE so every variation is an INDEPENDENT rendition.
       (Before: the loop reassigned cResultB64 each pass, so restyle variation 2
       restyled variation 1 \u2014 a compounding chain, not a distinct alternative.
       That is the "image 2 looks the same / missing" defect for OpenAI edits.) */
    const restyleBase = restyle ? state.cResultB64 : null;
    const restyleMime = state.cMime;
    const preRun = state.cResultB64;
    let firstNew = null;
    for (let i = 0; i < n; i++) {
      const parts = (restyle && restyleBase)
        ? [{ text: "Restyle this exact image as instructed - keep its subject and composition, change only what the prompt asks:" },
           { inlineData: { mimeType: restyleMime, data: restyleBase } },
           { text: (p || "enhance quality and lighting") + "\n" + CREATE_FINISH }]
        : buildCreateParts(p);
      /* v6.53.0 — a plain run uses the model this page picked; a restyle is
         an EDIT (it sends the previous result), which a text-to-image
         endpoint cannot take, so that path keeps the edit model. */
      const img = await callImageAPI(restyle ? null : (state.t2iModel || null), parts, cfg);
      if (!imgMagicOk(img.b64)) throw new Error("HNKERR:st_img_bad:create result");
      if (i === 0) firstNew = img.b64;
      state.cResultB64 = img.b64;
      state.cMime = img.mime || "image/png";
      state.cGallery.unshift({ b64: img.b64, mime: state.cMime });
      if (state.cGallery.length > 8) state.cGallery.pop();
      state.cSel = 0;
      if (i === 0) { refreshCreateCompare(); paintCGallery(); }
    }
    /* Before/After pairs the pre-run image (or, on a first-ever run, the first
       new result) against the newest \u2014 never a mid-loop mutation. */
    state.cBeforeB64 = restyle ? (restyleBase || firstNew) : (preRun || firstNew);
    state.cSel = 0;
    refreshCreateCompare();
    paintCGallery();
    endBusy();
    setStatus(t("st_done") + " \u00D7" + n + " \u00B7 " + provTag(), "ok");
  } catch (e) {
    endBusy();
    setStatus(friendlyErr(e), "err");
  }
}

function paintCGallery() {
  const g = $("cGallery");
  const info = $("cGalInfo");
  if (info) info.textContent = state.cGallery.length
    ? (state.cGallery.length + " " + t("cr_gal_have"))
    : t("cr_gal_empty");
  if (!g) return;
  g.innerHTML = "";
  for (let i = 0; i < state.cGallery.length; i++) {
    (function (item, idx) {
      const im = document.createElement("img");
      im.className = "gthumb" + (idx === state.cSel ? " sel" : "");
      dataSrc(im, item.mime, item.b64);
      im.addEventListener("click", function () {
        state.cSel = idx;
        state.cResultB64 = item.b64; state.cMime = item.mime;
        refreshCreateCompare();
        paintCGallery();
      });
      g.appendChild(im);
    })(state.cGallery[i], i);
  }
}

/* Save the currently-selected Create result to disk (picks a folder once). */
async function saveCreateResult() {
  if (!state.cResultB64) { setStatus(t("cr_need_result"), "err"); return; }
  if (!imgMagicOk(state.cResultB64)) { setStatus(t("st_img_bad") + " (Save)", "err"); return; }
  try {
    if (!state.saveDirH) {
      const ok2 = await pickSaveFolder();
      if (!ok2) return;
    }
    const ext = state.cMime === "image/jpeg" ? "jpg" : "png";
    const nm = "HNK_" + tsStamp() + "_Create." + ext;
    const f = await state.saveDirH.createFile(nm, { overwrite: true });
    await f.write(b64ToBuf(state.cResultB64), { format: formats.binary });
    setStatus(t("st_exported") + " " + nm, "ok");
  } catch (e) {
    setStatus(t("st_export_fail"), "err");
  }
}

/* v6.50.0 — the app's own eight, in the app's order (Auto first, then the
   seven ratios its .rchip strip offers). The panel offered five and no Auto,
   so a studio that wanted 2:3 or "let the model decide" could not ask. */
/* v6.51.0 — the app's Text to Image ratio set, exactly: Auto plus the seven
   its #selT2IRatio offers. The panel carried 4:5 (which that page does not
   offer) and was missing 3:2. */

/* v6.26.0 — the Create tab's AI Improve/Describe (Gemini text) left with
   their provider. */

/* ============================================================
   TEXT TO IMAGE — the app's own model shelf (v6.53.0)

   The page had no model choice at all: every run used whatever model
   Freeform happened to be set to, which is neither what the app does nor
   what a student picking "Midjourney v8.1 — Artistic" expects. The list,
   its order, its labels and each model's ratio and size choices are the
   app's own RH_T2I_MODELS, lifted into js/hnk_t2i_models.js by
   tools/build_panel_t2i_models.js — nothing here authors an endpoint.
   ============================================================ */
function t2iModels() {
  const g = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.t2iModels : null;
  return (g && g.length) ? g : [];
}
function t2iDef() {
  const all = t2iModels();
  for (let i = 0; i < all.length; i++) if (all[i].id === state.t2iModel) return all[i];
  return all[0] || null;
}
/* the app's updateT2IModelUI: a model without its own ratio list still gets
   a picker, from whichever size table drives it (uiRatios, lifted) */
function t2iRatioList(m) {
  if (!m) return [];
  return m.ratios || m.uiRatios || [];
}
/* the app offers only the size tiers a model actually honours — a pick that
   would be silently ignored or clamped is worse than no pick */
function t2iSizeTiers(m) {
  if (!m) return null;
  if (m.resolutionField) return m.resolutionEnum || ["1k", "2k", "4k"];
  if (m.whField) return ["1k", "2k", "4k"];
  if (m.sizeField && m.sizeMap !== "wan25" && m.sizeMap !== "gpt15") return ["1k", "2k"];
  return null;
}
function t2iFillModels() {
  const sel = $("t2iModel");
  if (!sel) return;
  const all = t2iModels();
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  for (let i = 0; i < all.length; i++) sel.appendChild(mkOption(all[i].id, all[i].label));
  if (!state.t2iModel || !all.some(function (m) { return m.id === state.t2iModel; })) {
    state.t2iModel = all.length ? all[0].id : "";
  }
  try { sel.value = state.t2iModel; } catch (e) { }
}
function t2iPaintOptions() {
  const m = t2iDef();
  const sel = $("t2iModel");
  if (sel && sel.value !== state.t2iModel) { try { sel.value = state.t2iModel; } catch (e) { } }
  /* the ratio rail is the visible control; its native select carries the value */
  const rsel = $("t2iRatio");
  const ratios = t2iRatioList(m);
  if (rsel) {
    while (rsel.firstChild) rsel.removeChild(rsel.firstChild);
    rsel.appendChild(mkOption("", "Ratio: Auto"));
    ratios.forEach(function (r) { rsel.appendChild(mkOption(r, r)); });
    const want = state.cRatio === "auto" ? "" : (state.cRatio || "");
    rsel.value = (want && ratios.indexOf(want) >= 0) ? want : "";
    state.cRatio = rsel.value || "auto";
  }
  const rail = $("t2iRatioRail");
  if (rail) rail.style.display = ratios.length ? "flex" : "none";
  t2iPaintRail();
  /* size tiers, and the picker hides with them (the app's syncVis) */
  const tiers = t2iSizeTiers(m);
  const zsel = $("t2iRes"), zhsl = $("t2iResHsl");
  if (zsel) {
    while (zsel.firstChild) zsel.removeChild(zsel.firstChild);
    zsel.appendChild(mkOption("", "Size: Auto"));
    (tiers || []).forEach(function (v) { zsel.appendChild(mkOption(v.toUpperCase(), v.toUpperCase())); });
    const keep = state.t2iSize || "";
    zsel.value = (keep && (tiers || []).some(function (v) { return v.toUpperCase() === keep; })) ? keep : "";
    state.t2iSize = zsel.value;
  }
  if (zhsl) zhsl.style.display = tiers ? "" : "none";
  /* the model's own prompt cap, and the count that reads it */
  const box = $("cPromptBox");
  const cap = (m && m.promptMax) || 20000;
  if (box) box.setAttribute("maxlength", String(cap));
  t2iPaintCount();
  t2iPaintModelTile();
  ffPaintHslVal("t2iModel", "t2iModelVal");
  ffPaintHslVal("t2iRes", "t2iResVal");
}
function t2iPaintCount() {
  const box = $("cPromptBox"), out = $("cPromptCount");
  if (!out) return;
  const m = t2iDef();
  out.textContent = ((box && box.value) || "").length + " / " + ((m && m.promptMax) || 20000);
}
/* the app's brand tile for the picked model */
function t2iPaintModelTile() {
  const m = t2iDef();
  const tile = $("t2iModelTile"), gl = $("t2iModelGlyph");
  if (!tile || !m) return;
  const brand = ffModelBrand(m.label);
  tile.className = "hsl-tile " + brand[0];
  if (gl) gl.setAttribute("src", "icons/ui/brand-" + brand[1] + ".png");
}
/* the app's .rchip rail: a shaped box per ratio, "A" for Auto */
function t2iPaintRail() {
  paintRatioRail("t2iRatioRail", "t2iRatio", function (v) {
    state.cRatio = v || "auto"; t2iPaintRail(); saveSettings();
  });
}

function bindCreate() {
  /* the app's Model picker drives the ratio rail, the size tiers and the
     prompt cap — all three follow whichever model is chosen */
  t2iFillModels();
  const msel = $("t2iModel");
  if (msel) msel.addEventListener("change", function () {
    state.t2iModel = msel.value;
    t2iPaintOptions();
    saveSettings();
  });
  const zsel = $("t2iRes");
  if (zsel) zsel.addEventListener("change", function () {
    state.t2iSize = zsel.value;
    ffPaintHslVal("t2iRes", "t2iResVal");
    saveSettings();
  });
  t2iPaintOptions();
  REFRESHERS.push(function () { try { t2iPaintOptions(); } catch (e) { hwarn("t2i:", e); } });
  const vmap = [1, 2, 3, 4];
  const paintV = function () {
    for (let i = 0; i < vmap.length; i++) {
      const b = $("cVar" + vmap[i]);
      if (b) b.className = "segb" + (state.cVariations === vmap[i] ? " on" : "");
    }
  };
  for (let i = 0; i < vmap.length; i++) {
    (function (v) {
      const b = $("cVar" + v);
      if (b) b.addEventListener("click", function () { state.cVariations = v; paintV(); saveSettings(); });
    })(vmap[i]);
  }
  paintV();
  paintCGallery();
  const rs = $("btnCreateRestyle");
  if (rs) rs.addEventListener("click", function () { createGenerate(true); });
  const g = $("btnCreateGen");
  if (g) g.addEventListener("click", function () { createGenerate(false); });
  /* v6.50.0 — the app's character count under the Text-to-Image prompt */
  const cp = $("cPromptBox");
  if (cp) {
    const paintCount = t2iPaintCount;
    cp.addEventListener("input", paintCount);
    REFRESHERS.push(paintCount);
    paintCount();
  }
  for (let i = 0; i < 4; i++) {
    (function (idx) {
      const ly = $("cRefLayer" + idx);
      if (ly) ly.addEventListener("click", function () { addCreateLayerRef(idx); });
      const fl = $("cRefFile" + idx);
      if (fl) fl.addEventListener("click", function () { pickCreateRef(idx); });
      const x = $("cRefX" + idx);
      if (x) x.addEventListener("click", function () { state.cRefs[idx] = null; refLibForgetSlot("create-reference-" + (idx + 1)); paintCreateRefs(); });
    })(i);
  }
  const sl = $("cCmpSlider");
  if (sl) sl.addEventListener("input", function () { updateCCmpPos(sl.value); });
  const ur = $("btnCreateToRef");
  if (ur) ur.addEventListener("click", function () {
    if (!state.cResultB64) { setStatus(t("cr_need_result"), "err"); return; }
    state.cRefs[0] = { b64: state.cResultB64, mime: state.cMime, label: "Result \u21BA" };
    paintCreateRefs();
    setStatus(t("st_to_ref"), "ok");
  });
  const tp = $("btnCreateToPS");
  if (tp) tp.addEventListener("click", function () {
    if (!state.cResultB64) { setStatus(t("cr_need_result"), "err"); return; }
    importImageToPS(state.cResultB64, state.cMime, "Create");
  });
  const sv = $("btnCreateSave");
  if (sv) sv.addEventListener("click", function () { saveCreateResult(); });
  paintCreateRefs();
}

/* v6.51.0 — the RunningHub key UI is Setup's (rhSaveKey / rhRemoveKey). */

function bindProvider() {
  /* v6.26.0 — one engine: the provider segment and the OpenAI key UI left
     with their providers; the brand line simply names RunningHub. */
  const bp = $("brandProv");
  if (bp) bp.textContent = "RunningHub";
  REFRESHERS.push(function () {
    try { const b2 = $("brandProv"); if (b2) b2.textContent = "RunningHub"; } catch (e) { }
  });
}

/* v6.26.0 — Improve Prompt (Gemini text) left with its provider. */

/* ---------------- UI wiring ---------------- */

/* v6.51.0 — the app's own accordion: .grp gains and loses `open`, and the
   caret is the icon file the app rotates, not a text glyph. bindGroup below
   is the panel's older pattern (inline display + ▸/▾) and stays for the
   cards that have not been rebuilt from the app yet. */
function bindAppGroup(grpId, headId) {
  const g = $(grpId), h = $(headId);
  if (!g || !h) return;
  h.addEventListener("click", function () {
    g.className = /\bopen\b/.test(clsOf(g))
      ? clsOf(g).replace(/\s*\bopen\b/g, "")
      : (g.className + " open");
  });
}

function paintSizeSeg() {
  const ids = { "1K": "size1K", "2K": "size2K", "4K": "size4K" };
  for (const k in ids) {
    const b = $(ids[k]);
    if (b) b.className = "segb" + (state.size === k ? " on" : "");
  }
}

function bindSizeSeg() {
  const map = [["size1K", "1K"], ["size2K", "2K"], ["size4K", "4K"]];
  for (let i = 0; i < map.length; i++) {
    (function (id, val) {
      const b = $(id);
      if (!b) return; /* null-guard: never let one missing chip abort wiring */
      b.addEventListener("click", function () {
        state.size = val;
        paintSizeSeg();
        saveSettings();
      });
    })(map[i][0], map[i][1]);
  }
  paintSizeSeg();
}

/* v6.26.0 — the OpenAI quality segment left with its provider. */

/* ---------------- Retouch Pro (v1.4) ---------------- */
const RT_DEFAULT = {
  smooth: 0, acne: 0, spots: 0, wrinkle: 0, tone: 0, glow: 0,
  reshape: 0, lash: 0, brow: 0, lipSmooth: 0, lipColor: null, lipName: null,
  lens: null, lensName: null, hairStray: 0, hairSmooth: 0, hairShine: 0,
  dressSmooth: 0, dressEdge: 0, dressWrinkle: 0, dressTexture: 0,
  bgSmooth: 0, bgColor: null, bgName: null, bgRecolor: 0,
  teeth: 0, eyeWhite: 0,
  faceSlim: 0, jaw: 0, chin: 0, noseSize: 0, eyeSize: 0, lipFull: 0,
  waist: 0, bodySlim: 0, shoulder: 0, hip: 0, legLen: 0, armSlim: 0,
  dressFit: 0, dressClean: 0, dressColorPure: 0,
  bust: 0, butt: 0, thigh: 0, calf: 0, neck: 0, fingers: 0,
  browStyle: null, lashStyle: null, contourStyle: null, blushColor: null, blushName: null,
  bodySmooth: 0, bodyBlemish: 0, bodyTone: 0, bodyGlow: 0, bodyHairRm: 0,
  hairVolume: 0, hairGloss: 0, hairFill: 0,
  petalColor: null, petalName: null
};
state.rt = JSON.parse(JSON.stringify(RT_DEFAULT));

/* ---------------- Tab pages (web-view style) ---------------- */
/* v6.46.0 — THE WEB APP'S OWN NAVIGATION, ADOPTED WHOLE.
   The app's bottom bar carries five WORK groups — Home, Workflows, Edit,
   Media Lab, Library — each group's pages appear as second-level pills, and
   Setup is not on the bar at all: it lives behind the header gear. The panel
   had six flat tabs including Setup, plus a SECOND navigation inside Home
   (Freeform / Workflows / History / Settings) that repeated the tabs beneath
   it; two navigations saying overlapping things is exactly what made the
   panel harder to teach than the app it mirrors.

   Every page KEY below is unchanged, so every switchPage() call elsewhere in
   this file still lands where it always did — only how you navigate there
   follows the app now. Group labels are the app's own English words, which
   the app keeps English in every locale. */
const GROUPS = [
  { key: "home",  tab: "tabAiTools" },
  { key: "wf",    tab: "tabWf" },
  { key: "edit",  tab: "tabPrompt" },
  { key: "media", tab: "tabCreate" },
  { key: "lib",   tab: "tabPresets" }
];
const PAGES = [
  { key: "setup",   page: "pageSetup",   group: null },
  { key: "aitools", page: "pageAiTools", group: "home" },
  { key: "wf",      page: "pageAiTools", group: "wf" },
  { key: "prompt",  page: "pagePrompt",  group: "edit",  sub: "Freeform",  ic: "i-pen" },
  /* 6.29.0 wave — the app's pgImagine: one-tap AI tools, drawn by the app's own IMAGINE module (js/hnk_imagine.js) */
  { key: "imagine", page: "pageImagine", group: "edit",  sub: "Imagine",   ic: "i-wand" },
  /* the app's Edit group is Freeform · Retouch A · Retouch B · Retouch · Path.
     v6.51.0 — Retouch A and Retouch B are now the app's OWN studio pages
     (its two suites, 375 controls, built by the app's own code — see
     js/hnk_studio_suites.js), not presets on the Retouch page. */
  { key: "meitu",   page: "pageMeitu",   group: "edit",  sub: "Retouch A", ic: "i-makeup" },
  { key: "evoto",   page: "pageEvoto",   group: "edit",  sub: "Retouch B", ic: "i-target" },
  { key: "retouch", page: "pageRetouch", group: "edit",  sub: "Retouch",   ic: "i-gem" },
  { key: "path",    page: "pagePath",    group: "edit",  sub: "Path",      ic: "i-stack" },
  { key: "create",  page: "pageCreate",  group: "media", sub: "Text\u2192Img", ic: "i-doc" },
  { key: "video",   page: "pageVideo",   group: "media", sub: "Video",     ic: "i-clapper" },
  { key: "vidup",   page: "pageVideoUp", group: "media", sub: "VidUp",     ic: "i-rocket" },
  /* v6.73.0 — the app's new pgV2V: every tool that takes a video in and gives
     a video back, with the smart cards over them. VidUp keeps Upscale. */
  { key: "v2v",     page: "pageV2V",     group: "media", sub: "V\u2192V",   ic: "i-shuffle" },
  /* v6.75.1 — the app's new pgTalk: a photo, a recording, and the person in
     the photo speaks. The only page on either surface with an audio slot. */
  { key: "talk",    page: "pageTalk",    group: "media", sub: "Talk",      ic: "i-clapper" },
  { key: "presets", page: "pagePresets", group: "lib",   sub: "Reference", ic: "i-books" },
  /* the app's Library holds Reference and Gallery; the panel's own generation
     history is that gallery of results. Its select / zip / delete actions
     follow in the next wave — the shape of the navigation is the app's now. */
  { key: "gallery", page: "pageGallery", group: "lib",   sub: "Gallery",   ic: "i-gallery" }
];
function pageEntry(key) {
  for (let i = 0; i < PAGES.length; i++) if (PAGES[i].key === key) return PAGES[i];
  return null;
}
/* v6.51.0 — shell glyphs are <img> files (an inline <svg> does not draw in
   Photoshop, seen in 6.47.0), one file per tint; a state change is a src swap.
   Only touches the attribute when it differs, so a repaint never reloads.
   v6.64.0 — and the file is a .png. Every tab in the shell rail was still
   built out of the stroke SVG the 6.63.0 wave replaced everywhere it could
   see; it could not see this one, because the path is concatenated. */
function shellPaintIcon(host, cls, name, tint) {
  if (!host) return;
  const img = host.querySelector("." + cls);
  if (!img) return;
  const want = "icons/ui/" + name + "-" + tint + ".png";
  if (img.getAttribute("src") !== want) img.setAttribute("src", want);
}
/* the app's header language button: a round glyph carrying the language's
   first letter and the language's own native name beside it (glyph(label) in
   the app = the first code point of the label). The <select> beneath stays the
   real control; this is only its face. */
/* v6.161.0 — the language rows. populateSelects() filled this select beside two
   Freeform selects (model, ratio) whose markup left in 6.51.0; the language
   half is the header picker's only source of rows, so it keeps its own function. */
function populateLangSelect() {
  const sl = $("selLang");
  if (sl && !sl.firstChild) {
    for (let i = 0; i < LANGS.length; i++) {
      const o = document.createElement("option");
      o.value = LANGS[i].code;
      o.text = langOptionLabel(LANGS[i]);
      o.textContent = langOptionLabel(LANGS[i]);
      sl.appendChild(o);
    }
  }
  if (sl) sl.value = state.lang;
  try { langPaintHsl(); } catch (e) { }
}
REFRESHERS.push(function () { try { populateLangSelect(); } catch (e) { hwarn("lang select:", e); } });

function langPaintHsl() {
  const gl = $("langGlyph"), val = $("langVal");
  if (!gl && !val) return;
  let l = null;
  for (let i = 0; i < LANGS.length; i++) if (LANGS[i].code === state.lang) l = LANGS[i];
  const native = String((l && (l.native || l.label)) || state.lang || "").trim();
  const chars = Array.from(native);
  if (gl) gl.textContent = chars.length ? chars[0] : "";
  if (val) val.textContent = native;
}
/* The app shows its second level only where there is a second level to show. */
function renderSubtabs(activeKey) {
  const host = $("subtabs");
  if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  const entry = pageEntry(activeKey);
  const group = entry ? entry.group : null;
  const subs = [];
  for (let i = 0; i < PAGES.length; i++) {
    if (group && PAGES[i].group === group && PAGES[i].sub) subs.push(PAGES[i]);
  }
  if (subs.length < 2) { host.className = "subtabbar"; subFadePaint(); return; }
  host.className = "subtabbar on";
  let activeBtn = null;
  for (let i = 0; i < subs.length; i++) {
    (function (sub) {
      const b = mkBtn();
      const on = sub.key === activeKey;
      b.className = "subtab" + (on ? " on" : "");
      /* the app's icn(meta[1]) before the label: muted on the pill, ink on gold */
      if (sub.ic) b.appendChild(ffIcon(sub.ic, on ? "ink" : "muted"));
      b.appendChild(document.createTextNode(sub.sub));
      b.addEventListener("click", function () { switchPage(sub.key); saveSettings(); });
      host.appendChild(b);
      if (on) activeBtn = b;
    })(subs[i]);
  }
  /* the app's updateSubtabFade on scroll, and its scrollIntoView of the
     active pill so a wide group never leaves the chosen page off-screen */
  if (!host.getAttribute("data-fade")) {
    host.setAttribute("data-fade", "1");
    host.addEventListener("scroll", subFadePaint);
  }
  subFadePaint();
  setTimeout(subFadePaint, 0);
  if (activeBtn && activeBtn.scrollIntoView) {
    try { activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); } catch (e) { }
  }
}
/* v6.51.0 — the app's subtabbar fade-l / fade-r: a 28px ink fade over an
   edge that still has pills beyond it. Same thresholds as the app. */
function subFadePaint() {
  const host = $("subtabs"), fl = $("subfadeL"), fr = $("subfadeR");
  if (!host || !fl || !fr) return;
  const on = /\bon\b/.test(clsOf(host));
  const atStart = host.scrollLeft <= 1;
  const atEnd = host.scrollLeft + host.clientWidth >= host.scrollWidth - 1;
  fl.className = "subfade subfade-l" + (on && !atStart ? " on" : "");
  fr.className = "subfade subfade-r" + (on && !atEnd ? " on" : "");
}

/* the app's scrollMem: each page keeps its own scroll position across
   switches (window.scrollY there, .pages.scrollTop here) */
const scrollMem = {};
/* v6.66.1 — each page's scope classes, read from the markup once (see below) */
/* v6.78.0 — THE SCOPES ARE OURS TO KNOW, NOT THE RENDERER'S TO REPORT. 6.66.1
   read each page's class attribute once and cached it; the owner's 12th and
   13th photographs of 6.148.0 are what a bad first read looks like — Imagine's
   hero and card art at natural size past the panel's edge, Retouch A's target
   chips stacked full-width and its ✕ and "မူရင်း" fallen under the photo, both
   h2 icons on a line of their own — every .apg / .stpg rule gone from those two
   pages and only those two. The markup is index.html, which we wrote: the
   table below IS that markup (test/verify_panel_pickers.js keeps them equal),
   and nothing is asked of the element any more. */
const PAGE_SCOPE_STPG = { pageMeitu: 1, pageEvoto: 1, pageRetouch: 1, stDock: 1 };
function pageScope(pageId) { return " apg" + (PAGE_SCOPE_STPG[pageId] ? " stpg" : ""); }
function switchPage(key) {
  if (key !== "presets" && key !== "wf") state.wfLibTarget = null;   /* v6.82.0 */
  let found = false;
  for (let i = 0; i < PAGES.length; i++) { if (PAGES[i].key === key) found = true; }
  if (!found) key = "aitools";
  const pagesEl = $("pages");
  if (pagesEl && state.page) scrollMem[state.page] = pagesEl.scrollTop;
  state.page = key;
  const active = pageEntry(key);
  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i], pe = $(p.page);
    /* two keys share pageAiTools (Home and Workflows), so paint by PAGE */
    if (pe) {
      /* v6.51.0 — a rebuilt page keeps its scope classes (.apg app-parity,
         .stpg the studio suites); only .on toggles. v6.78.0 — from the table
         above, never from a class read (see PAGE_SCOPE_STPG). */
      const scope = pageScope(p.page);
      pe.className = "page" + scope + (active && p.page === active.page ? " on" : "");
    }
  }
  for (let i = 0; i < GROUPS.length; i++) {
    const te = $(GROUPS[i].tab);
    if (!te) continue;
    const on = !!(active && GROUPS[i].key === active.group);
    te.className = "tabb" + (on ? " on" : "");
    /* v6.51.0 — the tab glyph is an <img> file (inline <svg> does not draw in
       Photoshop); the app's muted→gold stroke change is a file swap here */
    const ic = te.querySelector(".tabic");
    if (ic) shellPaintIcon(te, "tabic", "i-" + ic.getAttribute("data-ic"), on ? "hi" : "muted");
  }
  /* Setup is outside the groups — the header gear is its "active tab" (the
     app's showPage); its file swaps cream → gold-hi the way the app recolours */
  const gear = $("btnGearSetup");
  if (gear) {
    const onSetup = key === "setup";
    gear.className = clsOf(gear).replace(/\s*\bon\b/g, "") + (onSetup ? " on" : "");
    shellPaintIcon(gear, "nav-gear-ic", "i-gear", onSetup ? "hi" : "cream");
  }
  renderSubtabs(key);
  if (key === "gallery") { try { galRefresh(); } catch (e) { } }
  if (active && active.page === "pageRetouch") { try { paintRetouchHero(); } catch (e) { } }
  /* v6.51.0 — the studio's control block lives once and moves to the suite
     page being shown (the app's stMountSuite), so the photo and the queue
     survive a switch between Retouch A and Retouch B. */
  try {
    const sc = globalThis.HNK && globalThis.HNK.studioScreen;
    if (sc) { if (key === "meitu" || key === "evoto" || key === "retouch") sc.mount(key); else sc.unmount(); }
  } catch (e) { }
  if (active && active.preset) {
    const pb = $(active.preset);
    if (pb && pb.click) { try { pb.click(); } catch (e) { } }
  }
  const pg = $("pages");
  if (pg) pg.scrollTop = scrollMem[key] || 0;
  try { fabTopPaint(); } catch (e) { }
  /* wrapped button labels can only be measured once the page is on screen */
  if (active) { const ape = $(active.page); if (ape) fitBtnInAllLater(ape); }
  /* and a group body is shown by its own inline display, never by the cascade alone (6.168.0) */
  if (active) { const ape3 = $(active.page); if (ape3) grpSyncAll(ape3); }
  if (key === "prompt") { try { fitCompareBox(); } catch (e) { } }
  if (key === "presets") { try { if (globalThis.HNK && globalThis.HNK.lib) globalThis.HNK.lib.layout(); } catch (e) { } }
  if (key === "create") { try { refreshCreateCompare(); } catch (e) { } }
  /* v6.27.0 — the bottom Home tab always returns to the cards home, like
     the web app; the AI Tools stack's own "Home" pill left with this. */
  if (key === "aitools" || key === "wf") {
    /* Home returns to the cards home; Workflows is its own top tab now, the
       way the app has always had it, instead of a pill inside Home. The
       Workflows screen draws the app's hero strip itself (v6.51.0). */
    const want = key === "wf" ? "workflow-tools" : "home";
    try {
      const aiApp = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.aiToolsApp : null;
      if (aiApp && aiApp.current && aiApp.current() !== want) aiApp.navigate(want);
    } catch (e) { }
  }
  if (key === "imagine") { try { imagineEnter(); } catch (e) { hwarn("imagine:", e); } }   /* 6.29.0 wave — paints the hub / tool view on entry */
  /* v6.75.0 — a page switch is a cheap moment to re-ask for pictures a dead line took (throttled inside) */
  try { const ra = globalThis.HNK && globalThis.HNK.remoteArt; if (ra && ra.retryFailed) ra.retryFailed(false); } catch (e) { }
  /* v6.51.0 — Setup repaints its readiness rows and the data-store line on entry, like the app's showPage */
  /* v6.80.0 — the Network row's two probes start when the Setup page is
     opened (and on Run again), never on the boot path: renderSelfTest also
     runs from setupApplyStatics at boot, and a probe there would reach out
     to RunningHub on every panel start. The row re-paints when they answer. */
  if (key === "setup") { try { renderSetupStatus(); refreshDataStore(); hnkNetProbeStart(false); hnkLayerProbeStart(false); hnkSaveProbeStart(false); hnkPlaceProbeStart(false); renderSelfTest(); } catch (e) { } }
  /* the sticky GENERATE follows the page that owns it */
  try { stickyGenSchedule(); setTimeout(stickyGenSchedule, 50); } catch (e) { }
}

/* v6.55.0 — HOME'S THREE LATE ARRIVALS. The app's Home greets the member by
   name, names the plan and shows the spend strip; all three come from the
   network — the profiles row, the entitlement and the balance reading — and
   all three land AFTER Home has painted. The panel opens ON Home, so
   switchPage's guard ("navigate only if we are not already there") never
   re-entered it: a student saw the pre-profile fallback, their own email
   local-part, with no plan pill and no spend strip, until they left the page
   and came back. Whoever resolves one of the three calls this. */
function homeRefresh() {
  try {
    if (state.page !== "aitools") return;
    const aiApp = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.aiToolsApp : null;
    if (aiApp && aiApp.current && aiApp.current() === "home" && aiApp.navigate) aiApp.navigate("home");
  } catch (e) { }
}

function bindTabs() {
  for (let i = 0; i < GROUPS.length; i++) {
    (function (g) {
      const te = $(g.tab);
      if (!te) return;
      te.addEventListener("click", function () {
        /* a group opens on its first page, like the app */
        let first = null;
        for (let j = 0; j < PAGES.length && !first; j++) if (PAGES[j].group === g.key) first = PAGES[j];
        switchPage(first ? first.key : "aitools");
        saveSettings();
      });
    })(GROUPS[i]);
  }
  const gear = $("btnGearSetup");
  if (gear) gear.addEventListener("click", function () { switchPage("setup"); saveSettings(); });
}


/* v6.107.1 — every wiring stage leaves a record: "ok", or the message and the
   line that stopped it. safe() has always swallowed a throw so that one page
   could not take the panel down; what it swallowed was never shown anywhere a
   student could see. The owner's Photoshop showed an empty Video page under a
   self-test card that said "Errors: none" — both true at once, because the
   card heard only uncaught errors and this function had caught the one that
   mattered. The card now reads WIRED. A failure is sticky: a later refresh
   that succeeds does not erase the first boot's answer. */
const WIRED = {};
function safe(name, fn) {
  try { fn(); if (!WIRED[name]) WIRED[name] = "ok"; }
  catch (e) {
    WIRED[name] = ((e && e.message) || String(e)) + errWhere(e);
    herr("wire-fail:", name, e);
  }
}

function installGlobalSafetyNet() {
  const handler = function (reason) {
    try {
      if (state.busy) endBusy();
      const msg = (reason && reason.message) ? reason.message : String(reason || "error");
      herr("uncaught:", msg);
      setStatus(friendlyErr(new Error(msg)), "err");
    } catch (e) { }
  };
  try {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("unhandledrejection", function (ev) {
        handler(ev && ev.reason);
        if (ev && ev.preventDefault) ev.preventDefault();
      });
      window.addEventListener("error", function (ev) {
        handler(ev && (ev.error || ev.message));
      });
    }
  } catch (e) { }
}

/* v6.77.0 — the storage shim reads its file once at load; the first render
   waits for it the way it waits for the settings, so nothing lifted from the
   web app reads an empty store at boot. A browser resolves at once. */
/* v6.79.0 — every ruler that could still give the panel's width when the
   viewport reads 0: outerWidth, visualViewport, screen, and a media-query
   binary search (matchMedia needs no layout read — the engine answers whether
   the panel is at least N px wide, and fifteen questions pin N to a pixel).
   The search is self-checking: a host that answers "yes" to 20000px or "no"
   to 1px is not measuring anything and is skipped. */
function hnkMatchMediaWidth() {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
    if (!window.matchMedia("(min-width: 1px)").matches || window.matchMedia("(min-width: 20000px)").matches) return 0;
    let lo = 1, hi = 20000;
    for (let i = 0; i < 16 && hi - lo > 1; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (window.matchMedia("(min-width: " + mid + "px)").matches) lo = mid; else hi = mid;
    }
    return lo;
  } catch (e) { return 0; }
}
function hnkWidthProbes() {
  const W = (typeof window !== "undefined") ? window : {};
  const n = function (v) { v = Number(v); return isFinite(v) && v > 0 ? Math.round(v) : 0; };
  const inner = n(W.innerWidth), outer = n(W.outerWidth);
  let vv = 0; try { vv = n(W.visualViewport && W.visualViewport.width); } catch (e) { vv = 0; }
  let scr = 0; try { scr = n(W.screen && W.screen.width); } catch (e) { scr = 0; }
  const mm = hnkMatchMediaWidth();
  const best = inner || outer || vv || mm || 0;
  return { inner: inner, outer: outer, vv: vv, screen: scr, mm: mm, best: best,
    detail: "inner " + inner + " \u00b7 outer " + outer + " \u00b7 vv " + vv + " \u00b7 mm " + mm + " \u00b7 screen " + scr };
}
/* v6.80.0 — CAN THIS PANEL REACH THE TWO HOSTS A GENERATE NEEDS? The owner's
   photograph of 6.150.0 read "cannot reach RunningHub" under a Setup card
   that had just verified the key against the same RunningHub — so the host
   that failed was not RunningHub. Every reference upload and every finished
   picture lives on RunningHub's file storage (*.xiaoyaoyou.com — the probe
   lane's own upload answer names rh-hk-images-switch), and a UXP plugin
   may fetch only the hosts its manifest lists. Two reachability probes, no
   key, eight seconds each: an answer of ANY status means the host is
   allowed and up; a throw names what stood in the way. The row re-paints
   itself when both have answered. */
const RH_NET_PROBES = [
  { id: "RunningHub", url: "https://www.runninghub.ai/openapi/v2/query", method: "POST", body: "{}" },
  /* v6.81.0 — TWO STORAGE HOSTS, NOT ONE. The 6.151.0 photograph's Network row
     read "files ok (403)" for xiaoyaoyou while the same panel's GENERATE was
     refused "Permission denied to the url rh-hk-images-1252422369.cos.
     ap-hongkong.myqcloud.com Manifest entry not found": uploads go to
     xiaoyaoyou, finished pictures come back from Tencent COS. Both probed,
     each named for what it carries. */
  { id: "uploads", url: "https://rh-hk-images-switch.xiaoyaoyou.com/", method: "GET" },
  { id: "results", url: "https://rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com/", method: "GET" }
];
let netProbe = { state: "idle", at: 0, rows: [] };
function hnkNetProbeStart(force) {
  const now = Date.now();
  if (netProbe.state === "running") return;
  if (!force && netProbe.state === "done" && now - netProbe.at < 15000) return;
  if (typeof fetch !== "function") { netProbe = { state: "done", at: now, rows: [{ id: "fetch", ok: false, why: "no fetch" }] }; return; }
  netProbe = { state: "running", at: now, rows: [] };
  const one = function (p) {
    return new Promise(function (resolve) {
      let ctl = null; try { ctl = new AbortController(); } catch (e) { ctl = null; }
      const tm = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) { } }, 8000);
      const t0 = Date.now();
      let pr;
      try {
        pr = fetch(p.url, { method: p.method || "GET", headers: p.body ? { "Content-Type": "application/json" } : {},
          body: p.body || undefined, signal: ctl ? ctl.signal : undefined });
      } catch (e) { pr = Promise.reject(e); }
      Promise.resolve(pr).then(function (r) {
        clearTimeout(tm);
        resolve({ id: p.id, ok: true, status: (r && r.status) || 0, ms: Date.now() - t0 });
      }, function (e) {
        clearTimeout(tm);
        const aborted = !!(ctl && ctl.signal && ctl.signal.aborted);
        resolve({ id: p.id, ok: false, why: aborted ? "no answer in 8s" : String((e && e.message) || e).replace(/https?:\/\/\S+/g, "").trim().slice(0, 140), ms: Date.now() - t0 });
      });
    });
  };
  Promise.all(RH_NET_PROBES.map(one)).then(function (rows) {
    netProbe = { state: "done", at: Date.now(), rows: rows };
    try { renderSelfTest(); } catch (e) { }
  });
}
/* v6.84.0 — SELF-TEST "Layer capture". The owner asked whether the image
   slots really work with the Active layer inside the CCX. The panel can
   answer that itself: this runs the very capture every slot uses
   (photoshop-host.captureActiveLayer — four getPixels shapes, then a
   flattened saved copy) on the open document when Setup is opened (throttled)
   and on Run again, and prints the layer's name, the size, the route that
   answered and the time — or the exact refusal, which is what a photograph
   of the card then carries. Never on the boot path; never while a job runs. */
let layerProbe = { state: "idle", at: 0, res: null };
function hnkLayerProbeStart(force) {
  const now = Date.now();
  if (layerProbe.state === "running") return;
  if (!force && layerProbe.state === "done" && now - layerProbe.at < 60000) return;
  if (!hostIsPhotoshop()) { layerProbe = { state: "done", at: now, res: { level: "host", detail: "not Photoshop \u2014 no layer to read" } }; return; }
  const H = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK : {};
  const host = H.photoshopHost;
  if (!(host && typeof host.captureActiveLayer === "function")) {
    layerProbe = { state: "done", at: now, res: { level: "err", detail: "photoshop-host has no captureActiveLayer" } }; return;
  }
  if (state && state.busy) { layerProbe = { state: "done", at: now, res: { level: "pend", detail: "a job is running \u2014 Run again when it ends" } }; return; }
  layerProbe = { state: "running", at: now, res: null };
  const t0 = Date.now();
  Promise.resolve().then(function () { return host.captureActiveLayer(); }).then(function (r) {
    const ms = Date.now() - t0;
    let res;
    if (r === null) res = { level: "host", detail: "no document open \u2014 open a photo, select its layer, then Run again" };
    else if (r && r.error) res = { level: "err", detail: "REFUSED \u2014 " + String(r.error).slice(0, 140) + " (" + ms + "ms)" };
    else if (r && r.ref) {
      const kb = Math.round(String(r.ref).length * 3 / 4 / 1024);
      res = { level: "ok", detail: (r.name ? "\u201C" + String(r.name).slice(0, 24) + "\u201D \u00b7 " : "") + (r.width || 0) + "\u00d7" + (r.height || 0) +
        (r.mode && !/rgb/i.test(String(r.mode)) ? " \u00b7 " + String(r.mode).replace(/ColorMode$/i, "") : "") + " \u00b7 via " + (r.via || "?") + " \u00b7 " + ms + "ms \u00b7 " + kb + " KB" };
    } else res = { level: "err", detail: "empty answer from the capture" };
    layerProbe = { state: "done", at: Date.now(), res: res };
    try { renderSelfTest(); } catch (e) { }
  }, function (e) {
    layerProbe = { state: "done", at: Date.now(), res: { level: "err", detail: "threw \u2014 " + String((e && e.message) || e).slice(0, 140) } };
    try { renderSelfTest(); } catch (e2) { }
  });
}
/* 6.165.0 — SELF-TEST "Save folder". Every finished take is copied into the plugin's data folder (the takes store)
   and Download writes into the folder the student picks; when either write fails the symptom is a clip that plays once
   and is gone. This row asks the host for the data folder, writes a one-line probe file, reads it back and deletes
   it, and prints the folder's path, "writable", the count of saved takes and the time — or the exact refusal. A folder
   with no native path (a browser walk, a shim) is reported as such and never written to. Throttled like the Layer row;
   Run again forces it. */
let saveProbe = { state: "idle", at: 0, res: null };
function hnkSaveProbeStart(force) {
  const now = Date.now();
  if (saveProbe.state === "running") return;
  if (!force && saveProbe.state === "done" && now - saveProbe.at < 60000) return;
  saveProbe = { state: "running", at: now, res: null };
  const t0 = Date.now();
  (async function () {
    let uxp = null;
    try { uxp = (globalThis.HNK && globalThis.HNK.__uxpForTests) || require("uxp"); } catch (e) { uxp = null; }
    const lfs = uxp && uxp.storage && uxp.storage.localFileSystem;
    if (!lfs || typeof lfs.getDataFolder !== "function") return { level: "host", detail: "no data folder on this host" };
    const folder = await lfs.getDataFolder();
    if (!folder) return { level: "err", detail: "getDataFolder answered nothing" };
    const ts = takesStoreP();
    let takes = 0, gal = "";
    try { takes = ts ? ts.list().length : 0; } catch (e) { }
    try { gal = ts ? ((await ts.galleryPath()) || "") : ""; } catch (e) { }
    const path = folder.nativePath || gal || "";
    if (!folder.nativePath) return { level: "host", detail: (path || "data folder") + " \u00b7 no native path \u2014 not written to \u00b7 " + takes + " saved take" + (takes === 1 ? "" : "s") };
    const name = "hnk-selftest-" + Date.now() + ".txt";
    const f = await folder.createFile(name, { overwrite: true });
    await f.write("hnk", { format: uxp.storage.formats.utf8 });
    const back = await f.read({ format: uxp.storage.formats.utf8 });
    try { if (typeof f.delete === "function") await f.delete(); } catch (e) { }
    if (String(back) !== "hnk") return { level: "err", detail: path + " \u00b7 wrote but read back \u201C" + String(back).slice(0, 12) + "\u201D" };
    return { level: "ok", detail: path + " \u00b7 writable \u00b7 " + takes + " saved take" + (takes === 1 ? "" : "s") + " \u00b7 " + (Date.now() - t0) + "ms" };
  })().then(function (res) { saveProbe = { state: "done", at: Date.now(), res: res }; try { renderSelfTest(); } catch (e) { } },
    function (e) { saveProbe = { state: "done", at: Date.now(), res: { level: "err", detail: "REFUSED \u2014 " + String((e && e.message) || e).slice(0, 140) } }; try { renderSelfTest(); } catch (e2) { } });
}
/* 6.171.0 — SELF-TEST "Place into Photoshop". The owner photographed a Smart
   Workflow run that finished and then refused: "Generated, but could not place
   into Photoshop · place-failed", with a document open in the Layers panel,
   after earlier runs in the same session had placed fine. Until 6.171.0 that
   sentence was the whole of what the panel knew — the place path returned a
   bare null from six different branches and the strip printed its own fallback
   word. It now carries a reason, and this row proves the whole path WITHOUT a
   paid run: it writes a 2×2 picture through the same photoshop-host.placeAsLayer
   every result goes through, into the open document, and then deletes the layer
   it just made. What it prints is the outcome and the time, or the exact
   refusal — the one line a photograph of this card can carry back.
   Throttled like the other host rows; "Run again" forces it; never at boot, and
   never when no document is open (there would be nothing to place into and
   opening one is not this row's business). */
let placeProbe = { state: "idle", at: 0, res: null };
/* a 2×2 opaque PNG — the smallest honest picture to hand Photoshop */
const PLACE_PROBE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO4st78ynpzBggFADLaBuk2gZvtAAAAAElFTkSuQmCC";
function hnkPlaceProbeStart(force) {
  const now = Date.now();
  if (placeProbe.state === "running") return;
  if (!force && placeProbe.state === "done" && now - placeProbe.at < 60000) return;
  if (!hostIsPhotoshop()) { placeProbe = { state: "done", at: now, res: { level: "host", detail: "not Photoshop — nothing to place into" } }; return; }
  const H = (typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK : {};
  const host = H.photoshopHost;
  if (!host || typeof host.placeAsLayer !== "function") { placeProbe = { state: "done", at: now, res: { level: "err", detail: "the place path is not loaded" } }; return; }
  placeProbe = { state: "running", at: now, res: null };
  const t0 = Date.now();
  (async function () {
    let ps = null;
    try { ps = require("photoshop"); } catch (e) { ps = null; }
    let docs = 0;
    try { docs = (ps && ps.app && ps.app.documents && ps.app.documents.length) || 0; } catch (e) { docs = 0; }
    if (!docs) return { level: "warn", detail: "no document open — open one and run again" };
    const out = await host.placeAsLayer({ ref: PLACE_PROBE_PNG, name: "HNK · self-test", bounds: null, group: null, mask: false });
    if (!out || out.ok === false) return { level: "err", detail: "REFUSED — " + (((out && out.reason) || "no reason given")) };
    /* put the document back the way it was found */
    let undone = "layer left — delete it yourself";
    try {
      await ps.core.executeAsModal(async function () {
        const d = ps.app.activeDocument;
        const ls = d.activeLayers;
        const l = ls && ls.length ? ls[0] : null;
        if (l && typeof l.delete === "function") { await l.delete(); }
      }, { commandName: "HNK: remove self-test layer" });
      undone = "removed again";
    } catch (eU) { undone = "left behind — " + String((eU && eU.message) || eU).slice(0, 60); }
    return { level: "ok", detail: "placed · " + undone + " · " + (Date.now() - t0) + "ms" };
  })().then(function (res) { placeProbe = { state: "done", at: Date.now(), res: res }; try { renderSelfTest(); } catch (e) { } },
    function (e) { placeProbe = { state: "done", at: Date.now(), res: { level: "err", detail: "THREW — " + String((e && e.message) || e).slice(0, 140) } }; try { renderSelfTest(); } catch (e2) { } });
}
function hnkPlaceProbeRow() {
  if (placeProbe.state === "idle") return { label: "Place into Photoshop", detail: "—", level: "pend" };
  if (placeProbe.state === "running") return { label: "Place into Photoshop", detail: "placing a test picture…", level: "pend" };
  return { label: "Place into Photoshop", detail: (placeProbe.res && placeProbe.res.detail) || "—", level: (placeProbe.res && placeProbe.res.level) || "pend" };
}
function hnkSaveProbeRow() {
  if (saveProbe.state === "idle") return { label: "Save folder", detail: "\u2014", level: "pend" };
  if (saveProbe.state === "running") return { label: "Save folder", detail: "writing a probe file\u2026", level: "pend" };
  return { label: "Save folder", detail: (saveProbe.res && saveProbe.res.detail) || "\u2014", level: (saveProbe.res && saveProbe.res.level) || "pend" };
}
function hnkLayerProbeRow() {
  if (layerProbe.state === "idle") return { label: "Layer capture", detail: "\u2014", level: "pend" };
  if (layerProbe.state === "running") return { label: "Layer capture", detail: "reading the active layer\u2026", level: "pend" };
  return { label: "Layer capture", detail: (layerProbe.res && layerProbe.res.detail) || "\u2014", level: (layerProbe.res && layerProbe.res.level) || "pend" };
}
function hnkNetProbeRow() {
  if (netProbe.state === "idle") return { label: "Network", detail: "\u2014", level: "pend" };
  if (netProbe.state === "running") return { label: "Network", detail: "checking RunningHub \u00b7 uploads \u00b7 results\u2026", level: "pend" };
  const bits = [], bad = [];
  netProbe.rows.forEach(function (r) {
    if (r.ok) bits.push(r.id + " ok (" + (r.status || "?") + " \u00b7 " + r.ms + "ms)");
    else { bits.push(r.id + " BLOCKED \u2014 " + (r.why || "?")); bad.push(r); }
  });
  const allBad = netProbe.rows.length && bad.length === netProbe.rows.length;
  return { label: "Network", detail: bits.join(" \u00b7 "), level: !bad.length ? "ok" : (allBad ? "warn" : "err") };
}
function hostIsPhotoshop() {
  try { const m = require("photoshop"); if (m && m.app && typeof m.app.version === "string" && m.app.version) return true; } catch (e) { }
  try { const u = require("uxp"); if (u && u.host && typeof u.host.name === "string" && /photoshop/i.test(u.host.name)) return true; } catch (e2) { }
  return false;
}
function lsReady() {
  try {
    const l = globalThis.HNK && globalThis.HNK.localStore;
    return (l && l.ready && typeof l.ready.then === "function") ? l.ready.then(function () { }, function () { }) : Promise.resolve();
  } catch (e) { return Promise.resolve(); }
}
function init() {
  installGlobalSafetyNet();
  safe("off-guard", function () { bindOffGuard(document); });
  safe("pickers", function () { bindHslPickers(); });
  /* v6.79.0 — the SELF-TEST on 6.149.0 read "Storage · native localStorage":
     the real host was not recognised when the shim's script ran (its only
     signal was require("photoshop").app.version), so the forty-one call
     sites were writing to a storage the owner's own photographs had shown
     forgetting everything. The shim now takes the host from two signals, and
     main.js — which knows the host for certain by now — adopts it here if
     the first script missed, carrying every key written so far across. */
  safe("storage-adopt", function () {
    const ls = globalThis.HNK && globalThis.HNK.localStore;
    if (ls && !ls.shimmed && typeof ls.adopt === "function" && hostIsPhotoshop()) ls.adopt();
  });
  Promise.all([loadSettings(), lsReady()]).then(function () {
    /* first: the wall comes down only if the plan says so */
    safe("gate", function () { gateBoot(); });
    safe("apply-settings", function () {
      /* v6.51.0 — the key field and the legacy model/ratio selects are Setup's
         and Freeform's own (rhKey / ffModelSel); only the size segment remains here. */
      paintSizeSeg();
    });
    safe("i18n", function () { applyTheme(); populateLangSelect(); applyI18n(); });
    safe("version", function () { paintPanelVersion(); checkPanelUpdate(); });
    safe("page-restore", function () { switchPage(state.page || "aitools"); });
    safe("takes-restore", function () { takesRestoreP(); });   /* v6.87.0 — the video strips come back */
    safe("meta", function () { renderRefs(); refreshCompare(); });
    safe("reflib-restore", function () { try { refLibRestoreSlots(); } catch (e) { hwarn("lib restore:", e); } });
    safe("ready", function () { setStatus(t("st_ready")); });
  });

  /* language + theme */
  safe("lang", function () {
    const sl = $("selLang");
    if (sl) sl.addEventListener("change", function () {
      const v = sl.value;
      state.lang = (LANG_CODES.indexOf(v) >= 0) ? v : "en";
      applyI18n();
      saveSettings();
      setStatus(t("st_ready"));
    });
  });

  /* size segment (the API key UI is Setup's; model + ratio are Freeform's) */
  safe("model", function () { bindSizeSeg(); });

  /* prompt — UXP has NO pointer-events:none; click anywhere focuses + places caret */
  safe("prompt", function () {
    /* v6.51.0 — the Freeform prompt box is sized by the app's own CSS
       (#promptBox min-height 110px); stylePromptBox's 140px inline sizing is
       kept only for the legacy boxes below. */
    const pb = $("promptBox");
    if (pb) {
      detectPromptCap(pb);
      pb.addEventListener("input", onPromptInput);
    }
  });

  safe("freeform", bindFreeform);

  /* tab pages */
  safe("tabs", function () {
    bindTabs();
    switchPage(state.page || "aitools");
  });


  /* v6.51.0 — RETOUCH PRO is the web app's pgRetouch now: the V2 hero, its
     Advanced accordion and the Manual One-Tap / Sliders panes are all built
     by the app's own code (js/hnk_studio_suites.js). What stays here is the
     panel's half — the two accordions' open/close and the two runs, which go
     through the licence gate into the panel's own generate. */
  safe("retouch", function () {
    bindAppGroup("v2GrpAdvanced", "v2AdvH");
    bindAppGroup("rsGrpManual", "rsManualH");
    const start = $("btnV2Start");
    if (start) {
      start.addEventListener("click", function () {
        if (state.busy) return;
        studioRun(start, "v2");
      });
    }
    const rsGen = $("btnRsGen");
    if (rsGen) {
      rsGen.addEventListener("click", function () {
        if (state.busy) return;
        studioRun(rsGen, "rs");
      });
    }
  });

  /* v6.51.0 — RETOUCH A / RETOUCH B STUDIO. The bar's label, its queue chips
     and the sentence it sends are all the web app's own (the studio module
     composes the prompt from the same sliders the app reads); this binding is
     only the panel's half: the licence gate, the busy button and the run. */
  safe("studio", function () {
    /* the app's builders capture their strings at build time (var LANG) —
       which is exactly what makes the labels identical to the web page — so a
       language change rebuilds the studio rather than patching it */
    REFRESHERS.push(function () {
      try {
        const sc = globalThis.HNK && globalThis.HNK.studioScreen;
        if (sc && sc.api && sc.api()) sc.rebuild();
      } catch (e) { herr("studio relang:", e); }
    });
    const gen = $("btnStGen");
    if (gen) {
      gen.addEventListener("click", function () {
        if (state.busy) return;
        const sc = globalThis.HNK && globalThis.HNK.studioScreen;
        const api = sc && sc.api && sc.api();
        if (!api) { setStatus(t("st_err"), "err"); return; }
        if (!state.refs[0]) { setStatus(api.RS_NEED_PHOTO, "err"); return; }
        const prompt = String(sc.prompt() || "").trim();
        if (!prompt) { setStatus(api.RS_NEED_PHOTO, "err"); return; }
        setBusyBtn(gen);
        runGenerate(prompt, true, ["skin", "subject"], false, { action: "Retouch", realDir: "edit" });
      });
    }
    /* the app saves the current look as a recipe from this button */
    const sr = $("stSaveRecipe");
    if (sr) {
      sr.addEventListener("click", function () {
        const sc = globalThis.HNK && globalThis.HNK.studioScreen;
        const api = sc && sc.api && sc.api();
        if (api) { try { api.stSaveRecipe(); } catch (e) { herr("studio recipe:", e); } }
      });
    }
  });

  safe("create", bindCreate);
  safe("provider", bindProvider);
  safe("diag", bindDiag);

  safe("generate", function () {
    /* v6.51.0 — GENERATE, Stop and Retry feed back through the Freeform card
       exactly as the app's btnGen / btnGenStop / btnRetry do */
    bindFreeformRun();
  });

  /* compare + output */
  safe("compare", function () {
    /* v6.51.0 \u2014 the slider (#cmpRange) is wired in bindFreeform; "Use as
       IMAGE 1" fills the app's first slot (state.subj), as the web app does. */
    const r2r = $("btnResultToRef");
    if (r2r) r2r.addEventListener("click", function () {
      if (!state.resultB64) return;
      state.subj = { b64: state.resultB64, mime: state.resultMime || "image/png", label: "result" };
      renderRefs();
      setStatus(ff9(FF_L.toRefSt), "ok");
    });
    const bpl = $("btnPlace");
    if (bpl) bpl.addEventListener("click", function () {
      if (state.busy || !state.resultB64) return;
      try { setStage("placing"); } catch (e0) { }
      setStatus(t("st_place"));
      placeResultToPS().then(function (r) {
        try { setStage(null); } catch (e1) { }
        /* r undefined = an early guard already set its own status line */
        if (!r) return;
        /* honest outcome: masked group vs plain layer (v6.9.0 standard) */
        if (r.placed && r.masked && r.grouped) setStatus(t("st_placed_masked"), "ok");
        else if (r.placed && !r.newDoc) setStatus(t("st_placed_plain"), "ok");
        else setStatus(t("st_done"), "ok");
      })
        .catch(function (e) { try { setStage(null); } catch (e2) { } setStatus(t("st_err") + ": " + (e && e.message ? e.message : e), "err"); });
    });
    const bsa = $("btnSaveAs");
    if (bsa) bsa.addEventListener("click", saveResultAs);
  });

  /* resize (guarded window.*) */
  safe("resize", function () {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", fitCompareBox);
    }
  });
}

init();
