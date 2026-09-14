/* ============================================================
   HNK AI Tools — Workflow Tools screen (staged Smart-Workflow buttons)
   Spec §15 + self-contained staged-button rule.

   Per-button staged interaction:
     Click 1  select  -> show the workflow's explanation + required images.
     Click 2  Prepare -> load the protected prompt, validate, highlight missing
                         slots; green "ready" when every required input is valid.
     Next     GENERATE (enabled only when ready).
   Direct Generate mode (global toggle) skips Prepare: once inputs are valid,
   GENERATE is available immediately.

   The protection (subject/identity/pose locks, negatives, reference-transfer
   rules) is inside the workflow, not the UI — this screen shows no separate
   guard/lock/QC controls.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* v6.27.0 — webapp-parity art cards (same treatment as the home screen):
   each workflow shows its own bundled catalog card whole, as an <img> at
   its intrinsic 3:2 — the repo's proven UXP-safe image fit.
   v6.107.0 — the bytes now arrive through HNK.remoteArt (fetch → data: URL).
   In the owner's Photoshop a remote <img src> drew nothing AND fired no error,
   so the removal below never ran and the card kept an empty box; a fetch
   fails out loud, and the Library has painted data: URLs here since 6.47.1. */
function artLoader() {
  return _CJS ? require("../remote-art") : (globalThis.HNK && globalThis.HNK.remoteArt);
}
function setArt(im, url, onFail) {
  var ra = artLoader();
  if (ra) ra.paint(im, url, onFail);
  else { im.onerror = onFail || null; im.src = url; }
}
function hnkArtCard(doc, visual) {
  if (!visual) return null;
  var art = doc.createElement("div");
  art.className = "hnk-cardart";
  var im = doc.createElement("img");
  im.alt = "";
  setArt(im, visual, function () {
    try { art.parentNode && art.parentNode.removeChild(art); } catch (e) { }
  });
  art.appendChild(im);
  return art;
}


var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var registry = _CJS ? require("../../workflows/workflow-registry") : globalThis.HNK.workflowRegistry;
var wstate = _CJS ? require("../../workflows/workflow-state") : globalThis.HNK.workflowState;
var validator = _CJS ? require("../../workflows/workflow-validator") : globalThis.HNK.workflowValidator;
var compiler = _CJS ? require("../../workflows/workflow-request-compiler") : globalThis.HNK.workflowRequestCompiler;
var modelRegistry = _CJS ? require("../../models/model-registry") : globalThis.HNK.modelRegistry;
var imageImport = _CJS ? require("../../photoshop/image-import-service") : (globalThis.HNK && globalThis.HNK.imageImportService);

function create(deps) {
  var doc = deps.document;
  var state = deps.state || wstate.defaultState();
  var root = null;
  var nodes = {};

  function directMode() { return !!(deps.directGenerate && deps.directGenerate()); }

  /* v6.49.0 — THE APP'S WORKFLOWS PAGE, COMPONENT FOR COMPONENT.

     The owner walked both surfaces and reported the panel still did not
     match; the machine walk agreed in numbers. The app's Workflows page is a
     search field over collapsible category groups of TWO-UP 173px cards
     (.wfgrid > .wfmini: art, photo-count badge, title, summary, "open"); the
     panel drew one 380px art card per row down a single column with a
     "Workflow Tools" heading and a Direct Generate toggle the app has no
     equivalent for. Same 143 workflows, same nine categories, same order —
     the app's own layout for them, and the toggle moved to Setup where the
     app keeps its settings.

     UXP notes: the group body is shown/hidden by style.display (this
     renderer has no :checked or details/summary), the grid is flexbox at 48%
     (no grid-template), and every card is a div carrying role=button —
     dom.el maps "button" for exactly that reason. */
  var L_OPEN = { my: "ဖွင့်မယ်", en: "Wizard", shn: "ပိုတ်ႇ", kac: "Hpaw u", th: "เปิด", zh: "打开", vi: "Mở", id: "Buka", ms: "Buka" };
  var L_NEED0 = { my: "ပုံမလို", en: "No photo", shn: "ဢမ်ႇလူဝ်ႇၶႅပ်း", kac: "Sumla n ra", th: "ไม่ต้องใช้รูป", zh: "无需照片", vi: "Không cần ảnh", id: "Tanpa foto", ms: "Tanpa foto" };
  var L_NEED1 = { my: "၁ ပုံ", en: "1 photo", shn: "1 ၶႅပ်း", kac: "Sumla 1", th: "1 รูป", zh: "1 张", vi: "1 ảnh", id: "1 foto", ms: "1 foto" };
  var L_NEED2 = { my: "၂ ပုံ + Ref", en: "2 photos", shn: "2 ၶႅပ်း", kac: "Sumla 2", th: "2 รูป", zh: "2 张", vi: "2 ảnh", id: "2 foto", ms: "2 foto" };
  var L_SEARCH = { my: "Workflow ရှာရန် — veil, retouch, relight…", en: "Search Workflow — veil, retouch, relight…", shn: "သွၵ်ႈႁႃ Workflow — veil, retouch, relight…", kac: "Workflow tam u — veil, retouch, relight…", th: "ค้นหา Workflow — veil, retouch, relight…", zh: "搜索 Workflow — veil、retouch、relight…", vi: "Tìm Workflow — veil, retouch, relight…", id: "Cari Workflow — veil, retouch, relight…", ms: "Cari Workflow — veil, retouch, relight…" };
  var L_UNIT = { my: " ခု", en: "", shn: "", kac: "", th: "", zh: " 个", vi: "", id: "", ms: "" };

  /* v6.51.0 — the rest of the app's Workflows page, string for string: the
     hero strip over the card, favourites/recents, the per-group reset, the
     batch shortcut into Path, the "n found" line and the empty state. The
     kick line is the app's literal in every locale. */
  var L_KICK = "No Install · Panel Data · RunningHub AI";
  var L_HERO = { my: "Photoshop panel ထဲက <em>One-Tap တွေ</em> browser ရောက်လာပြီ", en: "The panel's <em>One-Taps</em>, now in your browser", shn: "One-Tap ၶွင် Photoshop panel ႁွတ်ႈမႃး ၼႂ်း browser ယဝ်ႉ", kac: "Photoshop panel a One-Tap ni gaw browser hta du sai", th: "One-Tap จากแผง Photoshop มาอยู่ในเบราว์เซอร์แล้ว", zh: "Photoshop 面板的 One-Tap 功能，现已进入浏览器", vi: "One-Tap của bảng Photoshop nay đã có trên trình duyệt", id: "One-Tap dari panel Photoshop kini hadir di browser", ms: "One-Tap panel Photoshop kini di pelayar anda" };
  var L_NOTE = { my: "Card နှိပ်ရင် wizard ပွင့်မယ် — Guide → Images → Generate · သင် setup လုပ်ထားတဲ့ AI engine (RunningHub Enterprise) နဲ့ အလုပ်လုပ်တယ်", en: "Tap any card to open its wizard — Guide → Images → Generate · runs on your configured AI engines (RunningHub Enterprise)", shn: "ၼဵၵ်း card ဢၼ်လႂ်သေဢမ်ႇဝႃႈ wizard တေပိုတ်ႇ — Guide → Images → Generate · ႁဵတ်းၵၢၼ်လူၺ်ႈ AI engine ဢၼ်ၸဝ်ႈၵဝ်ႇ setup ဝႆႉ (RunningHub Enterprise)", kac: "Card langai mi dip yang wizard hpaw na — Guide → Images → Generate · nang setup da ai AI engine (RunningHub Enterprise) hte galaw ai", th: "แตะการ์ดใดก็ได้เพื่อเปิด wizard — Guide → Images → Generate · ทำงานบน AI engine ที่คุณตั้งค่าไว้ (RunningHub Enterprise)", zh: "点击任意卡片即可打开向导 — Guide → Images → Generate · 由你配置的 AI engine 驱动（RunningHub Enterprise）", vi: "Chạm vào card bất kỳ để mở wizard — Guide → Images → Generate · chạy trên engine AI bạn đã cấu hình (RunningHub Enterprise)", id: "Ketuk kartu mana pun untuk membuka wizard-nya — Guide → Images → Generate · berjalan dengan engine AI yang Anda konfigurasi (RunningHub Enterprise)", ms: "Ketik mana-mana kad untuk membuka wizard — Guide → Images → Generate · berjalan pada enjin AI yang anda konfigurasikan (RunningHub Enterprise)" };
  var L_FAV_HINT = { my: "ကတ်ပေါ်က ★ ကို နှိပ်ပြီး အကြိုက်ဆုံး workflow တွေ ဒီမှာ စုထားနိုင်တယ်", en: "Tap ★ on a card to pin your favorite workflows here", shn: "ၼဵၵ်း ★ ၼိူဝ်ၵၢတ်ႈသေ သိမ်း workflow ဢၼ်လႆႈၸႂ်တီႈၼႆႈ", kac: "Card ntsa na ★ hpe dip nna ra ai workflow ni ndai kaw da u", th: "แตะ ★ บนการ์ดเพื่อปักหมุดเวิร์กโฟลว์โปรดไว้ที่นี่", zh: "点按卡片上的 ★ 把常用工作流固定在这里", vi: "Chạm ★ trên thẻ để ghim workflow yêu thích tại đây", id: "Ketuk ★ pada kartu untuk menyematkan workflow favorit di sini", ms: "Ketik ★ pada kad untuk semat aliran kerja kegemaran di sini" };
  var L_FAVS = { my: "အကြိုက်ဆုံးများ", en: "Favorites", shn: "ဢၼ်လႆႈၸႂ်", kac: "Ra dik ai ni", th: "รายการโปรด", zh: "收藏", vi: "Yêu thích", id: "Favorit", ms: "Kegemaran" };
  var L_RECENT = { my: "မကြာခင်သုံးခဲ့", en: "Recent", shn: "ဢၼ်ၸႂ်ႉလိုၼ်းသုတ်း", kac: "Ya sha lang ai", th: "ล่าสุด", zh: "最近", vi: "Gần đây", id: "Terbaru", ms: "Terkini" };
  var L_ALL = { my: "အားလုံး", en: "All", shn: "တင်းသဵင်ႈ", kac: "Yawng", th: "ทั้งหมด", zh: "全部", vi: "Tất cả", id: "Semua", ms: "Semua" };
  var L_FAVORITE = { my: "အကြိုက်", en: "Favorite", shn: "ဢၼ်လႆႈၸႂ်", kac: "Ra sharawng ai", th: "รายการโปรด", zh: "收藏", vi: "Yêu thích", id: "Favorit", ms: "Kegemaran" };
  var L_BATCH = { my: "ပုံအများနဲ့ လုပ်မယ်", en: "Run on many photos", shn: "ႁဵတ်းလူၺ်ႈၶႅပ်းႁၢင်ႈၼမ်", kac: "Sumla law law hte galaw u", th: "ใช้กับรูปหลายรูป", zh: "批量处理多张照片", vi: "Chạy trên nhiều ảnh", id: "Jalankan pada banyak foto", ms: "Jalankan pada banyak foto" };
  var L_RESET = { my: "ဒီအပိုင်းကို မူလအတိုင်း ပြန်ထား", en: "Reset this section" };
  var L_RESET_OK = { my: "ဒီအပိုင်း မူလအတိုင်း ပြန်ရောက်ပြီ", en: "Section reset" };
  var L_EMPTY = { my: "ဒီစကားလုံးနဲ့ workflow ဘာမှ မတွေ့ပါ — တခြားစကားလုံးနဲ့ ရှာကြည့်ပါ", en: "No workflows match that — try a different search", shn: "ဢမ်ႇႁၼ် workflow သင် — ၸၢမ်းသွၵ်ႈတူၺ်းၶေႃႈၵႂၢမ်းတၢင်ႇဢၼ်", kac: "Workflow n mu ai — ga langai bai tam yu u", th: "ไม่พบเวิร์กโฟลว์ — ลองค้นหาคำอื่น", zh: "没有匹配的工作流 — 试试其他关键词", vi: "Không tìm thấy workflow — hãy thử từ khóa khác", id: "Tidak ada workflow yang cocok — coba kata kunci lain", ms: "Tiada aliran kerja sepadan — cuba kata carian lain" };
  var L_CLEAR = { my: "ရှာဖွေမှု ရှင်းမယ်", en: "Clear search", shn: "လၢင်ႉၶေႃႈသွၵ်ႈ", kac: "Tam ai hpe sausan u", th: "ล้างการค้นหา", zh: "清除搜索", vi: "Xóa tìm kiếm", id: "Hapus pencarian", ms: "Kosongkan carian" };
  function foundLabel(n) {
    return l9({ my: n + " ခု တွေ့သည်", en: n + " found", shn: "ႁၼ် " + n + " ဢၼ်", kac: n + " mu ai", th: "พบ " + n + " รายการ", zh: "找到 " + n + " 个", vi: "Tìm thấy " + n, id: n + " ditemukan", ms: n + " dijumpai" });
  }
  /* the app's HNK_MY_ALIAS: a Burmese search word also matches its English
     catalog words (the catalog's ids and summaries are English) */
  var MY_ALIAS = [["ဆံပင်", "hair"], ["နောက်ခံ", "background"], ["မိတ်ကပ်", "makeup"], ["ဝတ်စုံ", "dress outfit gown"], ["အလင်း", "light lighting relight"], ["မျက်နှာ", "face"], ["မင်္ဂလာ", "wedding"], ["ပန်း", "flower floral"], ["သတို့သမီး", "bride wedding"], ["ကလေး", "child baby"], ["ဓာတ်ပုံဟောင်း", "restore vintage"], ["အသားအရေ", "skin retouch"], ["ရေ", "water"], ["ကောင်းကင်", "sky"], ["လိုဂို", "logo text"], ["ပုံတူ", "pose"], ["မွေးနေ့", "birthday"], ["ဘွဲ့", "graduation"], ["ရိုးရာ", "traditional heritage"], ["စတူဒီယို", "studio"]];
  /* the app's Wedding Suite sub-group chip labels (English in every locale) */
  var WG_NAMES = { trail: "Flower Trail", veil: "Veil", gown: "Gown Train", petal: "Petal Rain", extra: "Extra" };

  function _lang() {
    try {
      var b = globalThis.HNK && globalThis.HNK.i18n;
      return (b && typeof b.lang === "function") ? b.lang() : "en";
    } catch (e) { return "en"; }
  }
  function l9(m) { var k = _lang(); return (m && m[k] != null) ? m[k] : (m && m.en) || ""; }

  /* the app's icn(): a sprite symbol; the panel draws the same symbol from
     icons/ui/<name>-<tint>.png as an <img> (UXP has no <svg><use>, and since
     6.63.0 no .svg either — this renderer draws a stroke icon as a black
     silhouette; v6.64.0 caught these two, which build the path by
     concatenation and so slipped past the raster gate's literal match) */
  function icon(name, cls, w) {
    var im = doc.createElement("img");
    im.className = cls || "ic-s";
    im.alt = "";
    im.src = "icons/ui/" + name + ".png";
    if (w) { im.style.width = w + "px"; im.style.height = w + "px"; }
    return im;
  }

  /* the app's favourites / recents lists, same keys, same shapes (JSON arrays
     of workflow ids); UXP may deny localStorage, so a memory copy stands in */
  var K_FAVS = "hnk_ws_wf_favs", K_RECENT = "hnk_ws_wf_recent";
  /* v6.61.0 — the same lifted WHAT'S NEW list the Home strip reads, so a card
     the student has not opened yet wears the gold NEW ribbon here too and
     comes first in its category. Reading the record is enough; Home owns the
     writing, and opening the card below marks it read. */
  var whatsNew = _CJS ? require("../../../js/hnk_whats_new.js")
    : (globalThis.HNK && globalThis.HNK.whatsNew);
  function nwSeenIds() {
    var out = {};
    if (!whatsNew || !whatsNew.LIST) return out;
    var seen = readList(whatsNew.SEEN_KEY);
    whatsNew.LIST.forEach(function (e) {
      if (e.kind === "wf" && seen.indexOf(whatsNew.key(e)) < 0) out[e.ref] = e;
    });
    return out;
  }
  var _mem = {};
  function readList(key) {
    try {
      var raw = globalThis.localStorage.getItem(key);
      if (raw != null) { var v = JSON.parse(raw); if (Array.isArray(v)) return v; }
    } catch (e) { }
    return Array.isArray(_mem[key]) ? _mem[key].slice() : [];
  }
  function writeList(key, list) {
    _mem[key] = list.slice();
    try { globalThis.localStorage.setItem(key, JSON.stringify(list)); } catch (e) { }
  }
  function favList() { return readList(K_FAVS); }
  function favSave(l) { writeList(K_FAVS, l); }
  function recentList() { return readList(K_RECENT); }
  function recentPush(id) {
    var l = recentList().filter(function (x) { return x !== id; });
    l.unshift(id);
    writeList(K_RECENT, l.slice(0, 6));
  }

  /* every card built this render, so the search field can filter them all */
  var wfIndex = [];
  var favHost = null;

  function needLabel(wf) {
    var n = (wf.requiredInputs || []).length;
    return n === 0 ? l9(L_NEED0) : n === 1 ? l9(L_NEED1) : l9(L_NEED2);
  }

  function toast(msg, kind) {
    try {
      var nav = globalThis.HNK && globalThis.HNK.panelNav;
      if (nav && typeof nav.toast === "function") nav.toast(msg, kind);
    } catch (e) { }
  }

  /* app .hero-strip.hero-mini: the page's picture strip with the kick line
     and the two-tone headline pinned to its foot. The scrim is baked into
     the JPEG (UXP has no ::after). */
  function heroMini() {
    var hero = dom.el(doc, "div", { class: "hero-mini", id: "hnkWfHero" });
    var art = dom.el(doc, "div", { class: "hero-art" });
    var im = doc.createElement("img");
    im.alt = ""; im.src = "icons/banners/hero-wf.jpg";
    art.appendChild(im);
    hero.appendChild(art);
    hero.appendChild(dom.el(doc, "div", { class: "kick", text: L_KICK }));
    var h1 = dom.el(doc, "div", { class: "h1" });
    var parts = l9(L_HERO).split(/<\/?em>/);
    parts.forEach(function (p, i) {
      if (!p) return;
      if (i % 2) h1.appendChild(dom.el(doc, "span", { class: "em", text: p }));
      else h1.appendChild(doc.createTextNode(p));
    });
    hero.appendChild(h1);
    return hero;
  }

  /* app cardVisual() + the two corner buttons + the photo-count pill */
  function miniCard(wf, grp, catTitle) {
    var m = dom.el(doc, "button", { class: "wfmini", id: "hnkWf_" + wf.id, attrs: { "data-wg": wf.wedGroup || "" } });
    var box = dom.el(doc, "div", { class: "wfv" });
    if (wf.visual) {
      var im = doc.createElement("img");
      /* eager: nothing drives a lazy load in this renderer, and a card that
         waits for a scroll event that never arrives stays black (v6.47.1) */
      im.loading = "eager";
      im.alt = wf.title || "";
      setArt(im, wf.visual, function () { try { box.className = "wfv wfv-noart"; box.removeChild(im); } catch (e) { } });
      box.appendChild(im);
    } else box.className = "wfv wfv-noart";
    if (wf.badge) {
      var bdg = dom.el(doc, "span", { class: "bdg" });
      bdg.appendChild(icon(wf.badge + "-cream", ""));
      box.appendChild(bdg);
    }
    var _nwNew = nwSeenIds();
    if (_nwNew[wf.id]) m.className = "wfmini is-new";
    m.appendChild(box);

    /* ★ favourite toggle (app .fav): top-right, 44px hit box */
    var favs = favList();
    var isFav = favs.indexOf(wf.id) >= 0;
    var fav = dom.el(doc, "button", { class: isFav ? "fav on" : "fav", attrs: { "aria-label": l9(L_FAVORITE), "aria-pressed": isFav ? "true" : "false" } });
    var favIn = dom.el(doc, "span");
    var favIc = icon(isFav ? "i-star-fill-hi" : "i-star-fill-muted", "");
    favIn.appendChild(favIc);
    fav.appendChild(favIn);
    dom.on(fav, "click", function (ev) {
      try { ev.stopPropagation(); } catch (e) { }
      var l = favList();
      var i = l.indexOf(wf.id);
      if (i >= 0) l.splice(i, 1); else l.unshift(wf.id);
      favSave(l);
      var on = i < 0;
      fav.className = on ? "fav on" : "fav";
      fav.setAttribute("aria-pressed", on ? "true" : "false");
      favIc.src = "icons/ui/" + (on ? "i-star-fill-hi" : "i-star-fill-muted") + ".png";
      renderFavRecent();
    });
    m.appendChild(fav);

    /* batch shortcut (app .wfbatch): only workflows that take a photo can
       run over many photos on the Path page */
    if ((wf.requiredInputs || []).length) {
      var bt = dom.el(doc, "button", { class: "wfbatch", attrs: { "aria-label": l9(L_BATCH), title: l9(L_BATCH) } });
      var btIn = dom.el(doc, "span");
      btIn.appendChild(icon("i-stack-muted", ""));
      bt.appendChild(btIn);
      dom.on(bt, "click", function (ev) {
        try { ev.stopPropagation(); } catch (e) { }
        try {
          var nav = globalThis.HNK && globalThis.HNK.panelNav;
          if (nav && typeof nav.useWorkflow === "function") nav.useWorkflow(wf.id);
        } catch (e) { }
      });
      m.appendChild(bt);
    }
    box.appendChild(dom.el(doc, "span", { class: "wf-need", text: needLabel(wf) }));
    /* v6.61.0 — the gold NEW ribbon, inside the visual like the photo-count
       pill so it tracks the art rather than the card box, and appended AFTER
       that pill because that is the order the app builds them in: this page
       is measured string-for-string against the app's. */
    if (_nwNew[wf.id]) box.appendChild(dom.el(doc, "span", { class: "wf-new", text: "NEW" }));

    m.appendChild(dom.el(doc, "div", { class: "t", text: wf.title }));
    /* the app prints the catalog summary as written (one string for every
       language), so the card does too — the translated wf_sum_* text stays
       with the wizard */
    var summary = wf.cardSummary || wf.summary || "";
    if (summary) m.appendChild(dom.el(doc, "div", { class: "s", text: summary }));
    var go = dom.el(doc, "div", { class: "go" });
    go.appendChild(icon("i-caret-hi"));
    /* the app's " " between sprite and label is the .go .ic-s right margin */
    go.appendChild(doc.createTextNode(l9(L_OPEN)));
    m.appendChild(go);
    dom.on(m, "click", function () { select(wf.id); });
    wfIndex.push({ el: m, grp: grp, q: (wf.title + " " + (summary || wf.summary || "") + " " + wf.id + " " + (catTitle || "") + " " + (wf.wedGroup || "")).toLowerCase() });
    return m;
  }

  /* the app's grp(): caret · icon+title · count · section-reset, over a body
     the .open class shows (the same .app-grp the other pages use) */
  function group(title, count, open, ic) {
    var g = dom.el(doc, "div", { class: open ? "grp app-grp open" : "grp app-grp" });
    var car = dom.el(doc, "span", { class: "car" });
    car.appendChild(icon("i-caret-gold", "ic-car"));
    var lbl = dom.el(doc, "span", { class: "grp-lbl" });
    if (ic) lbl.appendChild(icon(ic + "-cream"));
    lbl.appendChild(doc.createTextNode(title));
    var cnt = dom.el(doc, "span", { class: "cnt", text: count + l9(L_UNIT) });
    cnt.setAttribute("data-base", count + l9(L_UNIT));
    var sact = dom.el(doc, "span", { class: "st-sact" });
    var sa = dom.el(doc, "span", { class: "sa", attrs: { role: "button", tabindex: "0", title: l9(L_RESET) } });
    sa.appendChild(icon("i-reset-muted", ""));
    sact.appendChild(sa);
    var head = dom.el(doc, "button", { class: "grp-h" }, [car, lbl, cnt, sact]);
    var body = dom.el(doc, "div", { class: "grp-b" });
    function isOpen() { return g.className.indexOf(" open") >= 0; }
    function setOpen(on) { g.className = on ? "grp app-grp open" : "grp app-grp"; }
    dom.on(head, "click", function () { setOpen(!isOpen()); });
    /* app stResetSection(): put every chip row in this body back on its
       first ("All") chip, then say so */
    dom.on(sa, "click", function (ev) {
      try { ev.stopPropagation(); } catch (e) { }
      var rows = body.querySelectorAll(".chips");
      for (var i = 0; i < rows.length; i++) {
        var first = rows[i].firstChild;
        if (first && first.className.indexOf("on") < 0 && typeof first.click === "function") first.click();
      }
      toast(l9(L_RESET_OK), "ok");
    });
    g.appendChild(head);
    g.appendChild(body);
    return { g: g, b: body, cnt: cnt, isOpen: isOpen, setOpen: setOpen };
  }

  /* the app's grid is CSS grid with an 8px gap; the panel's flex-wrap twin
     carries the gap as margins, so after any card is hidden or shown the
     first row loses its top margin and every right-hand card its right
     margin. A full-width card sits alone on its row. */
  function layoutGrid(gd) {
    var col = 0, row = 0;
    for (var n = gd.firstChild; n; n = n.nextSibling) {
      if (!n.className || n.style.display === "none") continue;
      var span2 = n.className.indexOf("wf-span2") >= 0;
      var cls = n.className.replace(/ wf-top| wf-r/g, "");
      if (span2) { if (col) { row++; col = 0; } if (row === 0) cls += " wf-top"; row++; col = 0; }
      else {
        if (row === 0) cls += " wf-top";
        if (col === 1) cls += " wf-r";
        col++;
        if (col === 2) { col = 0; row++; }
      }
      n.className = cls;
    }
  }

  /* the app's renderFavRecent(): a chip row per non-empty list, or the
     "tap ★" hint when both are empty */
  function renderFavRecent() {
    if (!favHost) return;
    dom.clear(favHost);
    var any = false;
    [[favList(), "i-star-fill-muted", l9(L_FAVS)], [recentList(), "i-clock-muted", l9(L_RECENT)]].forEach(function (pair) {
      var ids = pair[0].filter(function (id) { return !!registry.get(id); });
      if (!ids.length) return;
      any = true;
      var sh = dom.el(doc, "div", { class: "subh" });
      sh.appendChild(icon(pair[1]));
      sh.appendChild(doc.createTextNode(" " + pair[2]));
      favHost.appendChild(sh);
      var chips = dom.el(doc, "div", { class: "chips" });
      ids.forEach(function (id) {
        var wf = registry.get(id);
        var ch = dom.el(doc, "button", { class: "chip" });
        if (wf.visual) {
          var th = dom.el(doc, "span", { class: "chip-th" });
          var im = doc.createElement("img");
          im.alt = ""; im.loading = "eager";
          /* the favourites chip thumbnail — the same licensed host, so the same
             loader; a remote <img> here would be blank in Photoshop exactly as
             the cards were, and just as silently */
          setArt(im, wf.visual, function () { try { ch.removeChild(th); } catch (e) { } });
          th.appendChild(im);
          ch.appendChild(th);
        }
        ch.appendChild(doc.createTextNode(wf.title));
        dom.on(ch, "click", function () { select(id); });
        chips.appendChild(ch);
      });
      favHost.appendChild(chips);
    });
    if (!any) favHost.appendChild(dom.el(doc, "div", { class: "mut", text: l9(L_FAV_HINT) }));
  }

  function renderList() {
    dom.clear(root);
    wfIndex = [];
    /* the app's Workflows page owns its own margins (hero, then card): the
       root's 10px frame and its gaps would double them */
    try {
      var pr = root.parentNode;
      if (pr && String(pr.className).indexOf("hnk-root-wf") < 0) pr.className += " hnk-root-wf";
    } catch (e) { }

    var cats = (registry.categories && registry.categories()) || [];
    var total = 0;
    cats.forEach(function (c) { total += c.ids.length; });
    if (!total) total = registry.list().length;

    root.appendChild(heroMini());

    var card = dom.el(doc, "div", { class: "card" });
    /* the app prints this heading in English in every locale (#wfPageH2),
       so it is the app's literal, not a lookup into the panel's table */
    var h2 = dom.el(doc, "h2");
    h2.appendChild(icon("i-brain-gold", "ic-h2"));
    h2.appendChild(doc.createTextNode("SMART WORKFLOW — " + total + l9(L_UNIT)));
    card.appendChild(h2);

    /* the app's search field, in the app's place: above the groups */
    var srow = dom.el(doc, "div", { class: "row" });
    var search = doc.createElement("input");
    search.type = "text";
    search.className = "inp grow";
    search.id = "hnkWfSearch";
    search.placeholder = l9(L_SEARCH);
    srow.appendChild(search);
    card.appendChild(srow);
    var countLine = dom.el(doc, "div", { class: "mut", id: "hnkWfCount" });
    countLine.style.display = "none";
    card.appendChild(countLine);

    /* the app's category quick-jump rail */
    var rail = dom.el(doc, "div", { class: "chips wfjump", id: "hnkWfJump" });
    var groups = [];

    favHost = dom.el(doc, "div", { id: "hnkWfFavHost" });
    var host = dom.el(doc, "div", { id: "hnkWfHost" });

    if (cats.length) {
      cats.forEach(function (c, ci) {
        var g = group(c.category, c.ids.length, !!c.open, c.icon);
        if (c.desc) g.b.appendChild(dom.el(doc, "p", { class: "mut", text: c.desc }));
        var gd = dom.el(doc, "div", { class: "wfgrid" });
        var made = 0, wgs = {}, wgOrder = [];
        var cards = [];
        /* v6.62.0 — an unread NEW card comes FIRST in its own category, the
           same sort the app applies. Sorting the rendered order (not the
           registry) keeps every other consumer identical, and keeps this page
           string-for-string equal to the app's, which is what the parity
           test measures. */
        var _nwFirst = nwSeenIds();
        var _ordered = c.ids.slice().sort(function (a, b) {
          return (_nwFirst[b] ? 1 : 0) - (_nwFirst[a] ? 1 : 0);
        });
        _ordered.forEach(function (id) {
          var wf = registry.get(id);
          if (!wf) return;
          if (wf.wedGroup) { if (!wgs[wf.wedGroup]) { wgs[wf.wedGroup] = 0; wgOrder.push(wf.wedGroup); } wgs[wf.wedGroup]++; }
          var m = miniCard(wf, g, c.category);
          cards.push(m);
          gd.appendChild(m);
          made++;
        });
        /* the app's Wedding Suite sub-group chips: All + one per group */
        if (wgOrder.length > 1) {
          var chips = dom.el(doc, "div", { class: "chips" });
          var wgBtns = [];
          function wgApply(key, btn) {
            wgBtns.forEach(function (ch) { ch.className = "chip" + (ch === btn ? " on" : ""); });
            cards.forEach(function (m) { m.style.display = (!key || m.getAttribute("data-wg") === key) ? "" : "none"; });
            layoutGrid(gd);
          }
          var allBtn = dom.el(doc, "button", { class: "chip on", text: l9(L_ALL) + " (" + made + ")" });
          dom.on(allBtn, "click", function () { wgApply("", allBtn); });
          chips.appendChild(allBtn); wgBtns.push(allBtn);
          wgOrder.forEach(function (k) {
            var b = dom.el(doc, "button", { class: "chip", text: (WG_NAMES[k] || k) + " (" + wgs[k] + ")" });
            dom.on(b, "click", function () { wgApply(k, b); });
            chips.appendChild(b); wgBtns.push(b);
          });
          g.b.appendChild(chips);
        }
        /* the app widens the last card of an odd group to fill the row */
        if (made % 2 === 1 && gd.lastChild && gd.lastChild.className)
          gd.lastChild.className = gd.lastChild.className + " wf-span2";
        layoutGrid(gd);
        g.b.appendChild(gd);
        host.appendChild(g.g);
        groups.push(g);
        var chip = dom.el(doc, "button", { class: "chip", text: c.category + " " + c.ids.length });
        dom.on(chip, "click", function () {
          if (!g.isOpen()) g.setOpen(true);
          try { if (g.g.scrollIntoView) g.g.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { }
        });
        rail.appendChild(chip);
      });
    } else {
      var gd2 = dom.el(doc, "div", { class: "wfgrid" });
      registry.list().forEach(function (wf) { gd2.appendChild(miniCard(wf, null, "")); });
      layoutGrid(gd2);
      host.appendChild(gd2);
    }

    /* v6.62.0 — and the rail's first stop is the new work, as on the app.
       It exists only while there IS new work: an empty "NEW 0" chip would be
       worse than no chip, and would also break parity in the other direction. */
    (function () {
      var ids = nwSeenIds();
      var live = Object.keys(ids).filter(function (id) { return !!registry.get(id); });
      if (!live.length) return;
      var b = dom.el(doc, "button", { class: "chip on", id: "hnkWfJumpNew", text: "\u2726 NEW " + live.length });
      dom.on(b, "click", function () {
        var first = doc.getElementById("hnkWf_" + live[0]);
        if (first) { try { first.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { } }
      });
      if (rail.firstChild) rail.insertBefore(b, rail.firstChild); else rail.appendChild(b);
    })();

    if (rail.childNodes.length) card.appendChild(rail);
    card.appendChild(favHost);
    renderFavRecent();
    card.appendChild(host);

    /* app #wfEmpty: shown only when a query matches nothing */
    var empty = dom.el(doc, "div", { class: "empty-state", id: "hnkWfEmpty" });
    var eic = dom.el(doc, "div", { class: "ic" });
    eic.appendChild(icon("i-search-xl", "ic-xl"));
    empty.appendChild(eic);
    empty.appendChild(dom.el(doc, "p", { class: "mut", text: l9(L_EMPTY) }));
    var clr = dom.el(doc, "button", { class: "btn", text: l9(L_CLEAR) });
    dom.on(clr, "click", function () { search.value = ""; applyFilter(); try { search.focus(); } catch (e) { } });
    empty.appendChild(clr);
    host.appendChild(empty);
    var note = dom.el(doc, "div", { class: "mut wf-note", id: "hnkWfNote", text: l9(L_NOTE) });
    host.appendChild(note);

    /* the app's wfApplyFilter(): every plain word must match, or any alias
       word may; groups with a hit open, the rest hide; the count line and
       the empty state follow; clearing restores what the user had open */
    var openSnap = null;
    function expandQuery(q) {
      var out = q;
      MY_ALIAS.forEach(function (p) { if (q.indexOf(p[0]) >= 0) out += " " + p[1]; });
      return out;
    }
    function applyFilter() {
      var q = String(search.value || "").trim().toLowerCase();
      var toks = q ? expandQuery(q).split(/\s+/).filter(Boolean) : [];
      var plain = q.split(/\s+/).filter(Boolean);
      var nHits = 0;
      for (var i = 0; i < wfIndex.length; i++) {
        var it = wfIndex[i];
        var hit = !q || plain.every(function (tk) { return it.q.indexOf(tk) >= 0; }) ||
          toks.some(function (tk) { return plain.indexOf(tk) < 0 && it.q.indexOf(tk) >= 0; });
        it.el.style.display = hit ? "" : "none";
        if (hit) nHits++;
      }
      countLine.style.display = q ? "" : "none";
      if (q) countLine.textContent = foundLabel(nHits);
      if (q && !openSnap) openSnap = groups.map(function (g) { return g.isOpen(); });
      var anyMatch = false;
      groups.forEach(function (g, gi) {
        var gd = g.b.querySelector(".wfgrid");
        if (q) {
          var vis = 0;
          for (var n = gd ? gd.firstChild : null; n; n = n.nextSibling) if (n.className && n.style.display !== "none") vis++;
          if (vis) anyMatch = true;
          g.g.style.display = vis ? "" : "none";
          g.setOpen(!!vis);
          g.cnt.textContent = String(vis) + l9(L_UNIT);
        } else {
          g.g.style.display = "";
          g.setOpen(openSnap ? !!openSnap[gi] : gi === 0);
          g.cnt.textContent = g.cnt.getAttribute("data-base") || "";
        }
        if (gd) layoutGrid(gd);
      });
      if (!q) openSnap = null;
      empty.className = (q && !anyMatch) ? "empty-state on" : "empty-state";
      /* no group left above the note → no group margin above it either */
      note.className = "mut wf-note" + ((q && !anyMatch) ? " wf-note-tight" : "");
    }
    var timer = null;
    dom.on(search, "input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyFilter, 120);
    });
    dom.on(search, "keydown", function (ev) {
      if (ev.key === "Escape") { search.value = ""; applyFilter(); }
      else if (ev.key === "Enter") {
        if (timer) clearTimeout(timer);
        applyFilter();
        for (var i = 0; i < wfIndex.length; i++) {
          if (wfIndex[i].el.style.display !== "none") { wfIndex[i].el.click(); break; }
        }
      }
    });

    root.appendChild(card);
  }

  function select(workflowId) {
    recentPush(workflowId);
    wstate.selectWorkflow(state, workflowId);       // Click 1
    if (directMode()) wstate.prepare(state);        // Direct: skip staging
    renderSelected();
  }

  /* v6.27.0 — owner requirement: EVERY image slot offers the same four
     sources the classic tabs do (Active Layer · File · Web Link · Library).
     One applier so all four sources land in the slot identically. */
  function applySlot(inp, slot) {
    /* v6.68.0 — carry the DETAIL too. reasonMessage prints Photoshop's own
       words in brackets after a capture-failed, and this rebuild was dropping
       them: 6.138.0's photograph shows the bare sentence with nothing after
       it, which is exactly the message the panel is supposed to have stopped
       giving. */
    wstate.setInput(state, inp.key, { source: slot.source, role: inp.role, ref: slot.ref, valid: slot.valid, reason: slot.reason, detail: slot.detail });
    refresh();
  }

  function addImage(inp) {
    if (deps.host && imageImport) {
      var res = imageImport.fromActiveLayer(deps.host);
      if (res && typeof res.then === "function") res.then(function (slot) { applySlot(inp, slot); });
      else applySlot(inp, res);
    } else {
      wstate.setInput(state, inp.key, { source: "file", role: inp.role, ref: deps.stubRef || ("ref_" + inp.key), valid: true });
      refresh();
    }
  }

  function addFromFile(inp) {
    if (!(deps.host && deps.host.pickImageFile && imageImport)) {
      // stub hosts (tests) have no OS picker — behave like the stub add
      wstate.setInput(state, inp.key, { source: "file", role: inp.role, ref: deps.stubRef || ("ref_" + inp.key), valid: true });
      refresh();
      return;
    }
    Promise.resolve(deps.host.pickImageFile()).then(function (file) {
      if (!file) return; // user cancelled the picker — not an error
      return Promise.resolve(imageImport.fromFile(deps.host, file)).then(function (slot) { applySlot(inp, slot); });
    }).catch(function () { applySlot(inp, { source: "file", ref: null, valid: false, reason: "unreadable" }); });
  }

  function addFromWeb(inp, url) {
    if (!imageImport) return;
    var res = imageImport.fromWebLink(deps.host, url);
    if (res && typeof res.then === "function") res.then(function (slot) { applySlot(inp, slot); });
    else applySlot(inp, res);
  }

  /* v6.59.0 — the fifth source, and the one the service had implemented all
     along. image-import-service has carried fromPaste since the first spec
     (§5 names Active Layer · File · Paste · Web Link), photoshop-host now
     really reads the clipboard, and no screen ever offered the button — so a
     studio who had just copied a picture had to save it to disk first. When
     the host cannot read the clipboard the slot says exactly that and
     nothing else changes. */
  function addFromPaste(inp) {
    if (!imageImport) return;
    var res = imageImport.fromPaste(deps.host);
    if (res && typeof res.then === "function") res.then(function (slot) { applySlot(inp, slot); });
    else applySlot(inp, res);
  }

  function refresh() {
    if (!state.workflowId) return;
    var ev = validator.evaluate(state);
    (state.requiredInputs || []).forEach(function (inp) {
      var mark = nodes["req_" + inp.key];
      if (mark) {
        var okk = !!(inp.image && inp.image.ref);
        // v6.19: a failed capture (no-active-layer, unreadable file, ...)
        // used to look identical to "never touched this slot" — both said
        // "Missing". Show the specific reason when there was an actual
        // failed attempt.
        var failReason = (!okk && inp.image && inp.image.reason && imageImport) ? imageImport.reasonMessage(dom, inp.image.reason, inp.image.detail) : "";
        mark.textContent = okk ? "✓" : (failReason || "Missing");
        mark.className = "hnk-req-mark " + (okk ? "ok" : "miss");
      }
      /* v6.59.0 — SHOW THE PHOTO THAT LANDED.
         The slot used to answer with a tick and nothing else, so a studio
         who had just pasted a web link could not see WHICH picture arrived —
         and a link is exactly the source where the wrong picture is easy to
         get. Every source hands the slot a data: URL (layer capture, file
         read, clipboard, fetched link, Library pick), so the slot can simply
         show it. A picture that will not decode removes itself and leaves
         the tick, rather than sitting there as a broken box. */
      var thumb = nodes["thumb_" + inp.key];
      if (thumb) {
        var ref = (inp.image && inp.image.ref) || "";
        var show = /^data:image\//.test(String(ref));
        /* v6.109.0 — the tile itself never hides now; its two faces swap. */
        var emptyEl = nodes["empty_" + inp.key];
        if (thumb.firstChild) thumb.firstChild.style.display = show ? "" : "none";
        var clearEl = doc.getElementById("hnkWfClear_" + inp.key);
        if (clearEl) clearEl.style.display = show ? "" : "none";
        if (emptyEl) emptyEl.style.display = show ? "none" : "";
        if (show && thumb.firstChild && thumb.firstChild.src !== ref) thumb.firstChild.src = ref;
      }
    });
    /* v6.82.0 — the route line follows the photograph: Auto's measured shape */
    try { var rl = doc.getElementById("hnkWfRouteLine"), wfNow = registry.get(state.workflowId); if (rl && wfNow) rl.textContent = routeLine(wfNow); } catch (e) { }
    var ready = ev.ready;
    var canGenerate = ready && (state.prepared || directMode());
    if (nodes.prepareBtn) {
      var showPrepare = !state.prepared && !directMode();
      nodes.prepareBtn.style.display = showPrepare ? "" : "none";
    }
    if (nodes.generate) {
      nodes.generate.style.display = (state.prepared || directMode()) ? "" : "none";
      dom.setDisabled(nodes.generate, !canGenerate);
    }
    if (nodes.readyMsg) {
      nodes.readyMsg.className = "hnk-status " + (canGenerate ? "ok" : "");
      /* v6.78.0 — three lines that spoke English in a Burmese panel (photographs 5–7) */
      nodes.readyMsg.textContent = canGenerate ? dom.t("wf_ready_generate", "All required inputs are ready \u2014 press GENERATE.")
        : (state.prepared || directMode())
          ? (ev.reasons[0] ? ev.reasons[0].message : dom.t("wf_add_required", "Add the required images."))
          : dom.t("wf_press_prepare", "Press Prepare to load this workflow and check your images.");
    }
    return ev;
  }

  function doGenerate() {
    if (!state.prepared) wstate.prepare(state); // Direct mode assembles now
    var wf = registry.get(state.workflowId);
    var hint = function (msg) { if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = msg; } };
    /* v6.36.0 — a required design field (Selection Edit's request box) must
       carry text before anything is sent. */
    var missingField = ((wf && wf.fields) || []).some(function (f) {
      return f.required && !String((state.fieldVals && state.fieldVals[f.key]) || "").trim();
    });
    if (missingField) { hint(dom.t("ai_wf_field_req", "Type your request first — the request box cannot be empty.")); return; }
    var ev = validator.evaluate(state);
    if (!ev.ready) { refresh(); return; }
    var fire = function () {
      var request = compiler.compile(state);
      if (deps.onGenerate) deps.onGenerate(request);
    };
    /* v6.36.0 — Selection Edit: capture the live rectangular selection as
       the subject at Generate time. The result is placed back at these exact
       bounds with a layer mask cut from the same rectangle, so pixels
       outside the selection are untouched by construction. */
    if (wf && wf.region && deps.host && deps.host.getSelectionBounds) {
      Promise.resolve(deps.host.getSelectionBounds()).then(function (b) {
        if (!b) { hint(dom.t("ai_wf_select_first", "Make a rectangular selection in Photoshop first, then press GENERATE.")); return; }
        return Promise.resolve(deps.host.captureRegion(b)).then(function (cap) {
          if (!cap || !cap.ref) { hint(dom.t("ai_wf_capture_fail", "Could not read the selected pixels — try again.")); return; }
          if (state.requiredInputs[0]) state.requiredInputs[0].image = { source: "selection", role: state.requiredInputs[0].role, ref: cap.ref, valid: true };
          state.regionBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
          fire();
        });
      }).catch(function () { hint(dom.t("ai_wf_capture_fail", "Could not read the selected pixels — try again.")); });
      return;
    }
    fire();
  }

  function renderSelected() {
    var wf = registry.get(state.workflowId);
    dom.clear(root);
    /* back inside the root's framed layout for the wizard */
    try {
      var pr = root.parentNode;
      if (pr) pr.className = String(pr.className).replace(/ ?hnk-root-wf/g, "");
    } catch (e) { }
    var back = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfBack", text: "\u2190 " + dom.t("ai_wf_tools", "Workflow Tools") });
    dom.on(back, "click", function () { wstate.reset(state); renderList(); });
    root.appendChild(back);

    root.appendChild(dom.el(doc, "div", { class: "hnk-h-title", text: wf.title }));
    /* Signature visual hero for the selected workflow.

       v6.64.0 — AS AN <img> THROUGH remoteArt, NOT A CSS BACKGROUND. The
       owner photographed the Reference Scenes detail on panel 6.134.0: an
       empty gold-bordered rectangle where the picture belongs, with the
       SAME workflow's card drawn correctly in the grid one tap earlier.
       Both facts are right. The grid goes through hnkArtCard -> setArt ->
       HNK.remoteArt, which 6.107.0 introduced because this renderer will
       not load a remote https picture and does not even raise an error
       when it fails; the detail hero assigned the licensed host's URL
       straight into background-image, which no fetch can rescue. remoteArt
       has carried a paintBg() for exactly this since 6.107.0 and nothing
       ever called it — so the hero now takes the same <img> path the grid
       card takes, byte for byte, rather than a second path that has to be
       right on its own. */
    if (wf.visual) {
      var hero = dom.el(doc, "div", { class: "hnk-wf-hero" });
      var heroIm = doc.createElement("img");
      heroIm.alt = "";
      setArt(heroIm, wf.visual, function () {
        try { hero.parentNode && hero.parentNode.removeChild(hero); } catch (e) { }
      });
      hero.appendChild(heroIm);
      root.appendChild(hero);
    }
    // What this workflow protects / uses — meaning at a glance
    var chips = dom.el(doc, "div", { class: "hnk-wf-chips" }, [
      wf.humanSubject ? dom.el(doc, "span", { class: "hnk-wf-chip protect", text: dom.t("ai_identity_lock", "Identity Lock") }) : null,
      wf.referenceTransfer ? dom.el(doc, "span", { class: "hnk-wf-chip", text: dom.t("ai_ref_transfer", "Reference Transfer") }) : null,
      dom.el(doc, "span", { class: "hnk-wf-chip", text: (modelRegistry.getModel(wf.route.modelId) || { displayName: wf.route.modelId }).displayName })
    ]);
    root.appendChild(chips);
    // Click 1 — explanation + expected result
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc",
      text: dom.t(registry.explanationKey(wf.id), wf.explanation) }));

    // v6.35.0 — the workflow's own design controls: poster text, backdrop
    // colour swatches + hex, and one ON/OFF switch per enhancement. The
    // values live on the workflow state and resolve into the prompt at
    // generation time (workflow-request-compiler).
    if (wf.fields && wf.fields.length) {
      var langCode = "en";
      try { langCode = (globalThis.HNK && globalThis.HNK.i18n && globalThis.HNK.i18n.lang && globalThis.HNK.i18n.lang()) || "en"; } catch (e) { }
      var fl = function (lbl) { return (lbl && (lbl[langCode] || lbl.en)) || ""; };
      state.fieldVals = state.fieldVals || {};
      var fwrap = dom.el(doc, "div", { class: "hnk-wf-fields" });
      wf.fields.forEach(function (f) {
        if (state.fieldVals[f.key] === undefined) state.fieldVals[f.key] = f.type === "toggle" ? f.default !== false : (f.default || "");
        var row = dom.el(doc, "div", { class: "hnk-wf-field" });
        row.appendChild(dom.el(doc, "span", { class: "hnk-wf-field-l", text: fl(f.label) || f.key }));
        if (f.type === "toggle") {
          var tb = dom.el(doc, "button", { class: "hnk-btn hnk-wf-sw" + (state.fieldVals[f.key] ? " on" : ""), text: state.fieldVals[f.key] ? "ON" : "OFF" });
          dom.on(tb, "click", function () {
            wstate.setField(state, f.key, !state.fieldVals[f.key]);
            tb.textContent = state.fieldVals[f.key] ? "ON" : "OFF";
            tb.className = "hnk-btn hnk-wf-sw" + (state.fieldVals[f.key] ? " on" : "");
          });
          row.appendChild(tb);
        } else if (f.type === "text") {
          var ti = dom.el(doc, "input", { class: "hnk-input hnk-wf-text" });
          ti.setAttribute("type", "text");
          if (f.ph) ti.setAttribute("placeholder", f.ph);
          ti.value = state.fieldVals[f.key] || "";
          dom.on(ti, "input", function () { wstate.setField(state, f.key, ti.value); });
          row.appendChild(ti);
        } else if (f.type === "color") {
          var sww = dom.el(doc, "div", { class: "hnk-wf-swatches" });
          var hexInp = dom.el(doc, "input", { class: "hnk-input hnk-wf-hex" });
          hexInp.setAttribute("type", "text");
          hexInp.value = state.fieldVals[f.key] || f.default || "";
          dom.on(hexInp, "input", function () { wstate.setField(state, f.key, hexInp.value); });
          (f.swatches || []).forEach(function (swc) {
            var sb = dom.el(doc, "button", { class: "hnk-wf-swatch" });
            sb.style.background = swc;
            sb.setAttribute("aria-label", swc);
            dom.on(sb, "click", function () { wstate.setField(state, f.key, swc); hexInp.value = swc; });
            sww.appendChild(sb);
          });
          sww.appendChild(hexInp);
          row.appendChild(sww);
        }
        fwrap.appendChild(row);
      });
      root.appendChild(fwrap);
    }

    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_req_images", "Required Images") }));
    var reqWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
    state.requiredInputs.forEach(function (inp) {
      /* v6.36.0 — a region workflow's photo comes from the live rectangular
         selection at Generate time: no source buttons, just the slot. */
      if (wf.region && inp.image && inp.image.source === "selection") {
        var mark = dom.el(doc, "span", { class: "hnk-req-mark ok", text: "✓" });
        nodes["req_" + inp.key] = mark;
        reqWrap.appendChild(dom.el(doc, "div", { class: "hnk-req-block" }, [
          dom.el(doc, "div", { class: "hnk-req-row" }, [
            dom.el(doc, "span", { class: "hnk-req-label", text: dom.t(registry.inputLabelKey(inp.label) || "", inp.label) }), mark
          ])
        ]));
      } else {
        reqWrap.appendChild(inputRow(inp));
      }
    });
    if (wf.region) {
      reqWrap.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc",
        text: dom.t("ai_region_hint", "Drag a Rectangle-tool selection over the area to change, type your request above, then press GENERATE. Only the selected area changes — every pixel outside it stays identical.") }));
    }
    root.appendChild(reqWrap);
    if (state.optionalInputs.length) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_opt_images", "Optional Images") }));
      var optWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
      state.optionalInputs.forEach(function (inp) { optWrap.appendChild(inputRow(inp)); });
      root.appendChild(optWrap);
    }

    /* Optional typed instruction for workflows whose prompts act on a user
       request (the web app's guides all expect typed input for these). */
    var INSTRUCTION_WFS = { "object-edit": 1, "text-logo": 1, "water-edit": 1, "bg-replace": 1 };
    if (INSTRUCTION_WFS[wf.id]) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_your_request", "Your Request (optional)") }));
      var uTxt = dom.el(doc, "textarea", { class: "hnk-inp hnk-wf-usertext", id: "hnkWfUserText",
        placeholder: dom.t("ai_your_request_ph", "e.g. remove the chair on the left / write HNK STUDIO in gold serif") });
      uTxt.value = state.userText || "";
      dom.on(uTxt, "input", function () { wstate.setUserText(state, uTxt.value); });
      root.appendChild(uTxt);
    }

    renderGenOpts(root, wf);
    var route = state.resolvedRoute || wf.route;
    var m = modelRegistry.getModel(route.modelId);
    var out = state.output || {};
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-route", id: "hnkWfRouteLine", text: routeLine(wf) }));

    // Click 2 — Prepare
    nodes.prepareBtn = dom.el(doc, "button", { class: "hnk-btn hnk-prepare", id: "hnkWfPrepare", text: dom.t("ai_prepare", "Prepare (load & check)") });
    dom.on(nodes.prepareBtn, "click", function () { wstate.prepare(state); refresh(); });
    root.appendChild(nodes.prepareBtn);

    nodes.readyMsg = dom.el(doc, "div", { class: "hnk-status", id: "hnkWfStatus" });
    root.appendChild(nodes.readyMsg);

    // Click 3 — Generate
    nodes.generate = dom.el(doc, "button", { class: "hnk-btn hnk-generate", id: "hnkWfGenerate", text: dom.t("btn_generate", "GENERATE") });
    dom.on(nodes.generate, "click", doGenerate);
    root.appendChild(nodes.generate);

    refresh();
  }

  /* v6.79.0 — MODEL · RATIO · COUNT · SIZE, PICKABLE. The app's wizard clones
     the Create card's four selects into its last step (buildWizGenRow) and
     writes each change back; the panel printed them as a sentence. These are
     the panel's own .hsl pickers — a button that opens the panel's list
     (main.js hslPick) over a parked select, the visual ratio rail the
     Freeform card has — fed by HNK.genOpts (Freeform's lists) and written to
     both places: the workflow state the compiler reads (resolvedRoute,
     output.ratio / size / variants) and Freeform itself, so the two cards
     never disagree, exactly as the app's clones and their originals. */
  function genOptsBridge() { var g = (typeof globalThis !== "undefined") ? globalThis : {}; return g.HNK && g.HNK.genOpts; }
  function hslPicker(id, ctx, glyph) {
    var wrap = dom.el(doc, "div", { class: "hsl", id: id + "Hsl" });
    var btn = dom.el(doc, "button", { class: "hsl-btn", id: id + "Btn" });
    var tile = dom.el(doc, "span", { class: "hsl-tile t-plain" });
    var im = doc.createElement("img"); im.className = "hsl-glyph-img"; im.alt = ""; im.src = "icons/ui/" + glyph + ".png";
    tile.appendChild(im); btn.appendChild(tile);
    var lab = dom.el(doc, "span", { class: "hsl-lab" }, [
      dom.el(doc, "span", { class: "hsl-ctx", text: ctx }),
      dom.el(doc, "span", { class: "hsl-val", id: id + "Val", text: "" })
    ]);
    btn.appendChild(lab);
    var car = doc.createElement("img"); car.className = "hsl-caret"; car.alt = ""; car.src = "icons/ui/hsl-caret-gold.png";
    btn.appendChild(car);
    var sel = dom.el(doc, "select", { class: "inp", id: id });
    wrap.appendChild(btn); wrap.appendChild(sel);
    return { wrap: wrap, sel: sel, val: lab.lastChild, btn: btn };
  }
  function fillSel(sel, items, cur) {
    dom.clear(sel);
    var found = false;
    items.forEach(function (it) {
      var o = doc.createElement("option"); o.value = it.v; o.textContent = it.label;
      if (it.v === cur) { o.selected = true; found = true; }
      sel.appendChild(o);
    });
    if (!found && items.length) { sel.selectedIndex = 0; }
    return sel.value;
  }
  function paintVal(p) { var o = p.sel.options[p.sel.selectedIndex]; p.val.textContent = o ? String(o.textContent || "") : "\u2014"; }
  function normRatio(r) { r = String(r || ""); return (r === "auto" || r === "source") ? "" : r; }
  function renderGenOpts(root, wf) {
    var go = genOptsBridge();
    if (!go) return;
    var cur = go.current();
    var out = state.output || {};
    var route = state.resolvedRoute || wf.route || {};
    var chosen = (route && route.auto === false && route.modelId) ? route.modelId : "";
    var modelId = chosen || cur.model;
    var box = dom.el(doc, "div", { class: "hnk-wf-opts", id: "hnkWfOpts" });
    box.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("wf_opts", "Model \u00b7 Ratio \u00b7 Count \u00b7 Size") }));

    /* Model — "Auto" is the workflow's own route; a name is a pick that also becomes Freeform's model */
    var mp = hslPicker("wfModel", "Model", "brand-banana");
    mp.wrap.className = "hsl hsl-span2";
    var models = [{ v: "", label: dom.t("wf_model_auto", "Auto \u2014 the workflow's choice") }].concat(go.models().map(function (m) { return { v: m.id, label: m.label }; }));
    fillSel(mp.sel, models, chosen); paintVal(mp);
    var row1 = dom.el(doc, "div", { class: "arow gen-opts" }, [mp.wrap]);
    box.appendChild(row1);

    /* Ratio — the parked select + the visual rail the Freeform card has */
    var rp = hslPicker("wfRatio", "Ratio", "hsl-size");
    rp.wrap.className = "hsl hsl-span2";
    var rail = dom.el(doc, "div", { class: "ratio-rail", id: "wfRatioRail" });
    /* Count · Size */
    var cp = hslPicker("wfCount", "Count", "hsl-count");
    var sp = hslPicker("wfSize", "Size", "hsl-size");
    var row2 = dom.el(doc, "div", { class: "arow gen-opts" }, [cp.wrap, sp.wrap]);

    var g = (typeof globalThis !== "undefined") ? globalThis : {};
    function paintRail() {
      if (typeof g.paintRatioRail === "function") {
        try { g.paintRatioRail("wfRatioRail", "wfRatio", function (v) { rp.sel.value = v; onRatio(); }); } catch (e) { }
        rp.wrap.style.display = "none"; rail.style.display = rp.sel.options.length ? "flex" : "none";
      } else { rp.wrap.style.display = rp.sel.options.length ? "" : "none"; rail.style.display = "none"; }
    }
    function fillForModel(id) {
      var ratios = go.ratios(id), sizes = go.sizes(id), counts = go.counts(id);
      var wantR = normRatio(out.ratio != null ? out.ratio : cur.ratio);
      var r = fillSel(rp.sel, ratios.map(function (v) { return { v: v, label: v || "Ratio: Auto" }; }), wantR);
      var wantS = String(out.size || cur.size || "").toUpperCase();
      var sz = fillSel(sp.sel, sizes.map(function (v) { return { v: v, label: v || "Size: Auto" }; }), wantS === "2K" && sizes.indexOf("2K") < 0 ? "" : wantS);
      var wantC = String(out.variants || cur.count || 1);
      var c = fillSel(cp.sel, counts.map(function (n) { return { v: String(n), label: "\u00d7" + n }; }), wantC);
      cp.wrap.style.display = counts.length > 1 ? "" : "none";
      sp.wrap.style.display = sizes.length ? "" : "none";
      paintVal(rp); paintVal(sp); paintVal(cp); paintRail();
      return { ratio: r, size: sz, count: c };
    }
    function apply() {
      var ratio = rp.sel.value || "", size = sp.sel.value || "", count = parseInt(cp.sel.value, 10) || 1;
      wstate.setOutput(state, { ratio: ratio || "auto", size: size ? size.toLowerCase() : "2k", variants: count });
      try { go.set({ model: mp.sel.value || null, ratio: ratio, count: count, size: size }); } catch (e) { }
      out = state.output || {};
      var line = doc.getElementById("hnkWfRouteLine");
      if (line) line.textContent = routeLine(wf);
    }
    function onModel() {
      var v = mp.sel.value;
      state.resolvedRoute = v ? { modelId: v, auto: false } : (wf.route ? Object.assign({}, wf.route) : null);
      paintVal(mp);
      fillForModel(v || cur.model);
      apply();
    }
    function onRatio() { paintVal(rp); paintRail(); apply(); }
    dom.on(mp.sel, "change", onModel);
    dom.on(rp.sel, "change", onRatio);
    dom.on(cp.sel, "change", function () { paintVal(cp); apply(); });
    dom.on(sp.sel, "change", function () { paintVal(sp); apply(); });
    box.appendChild(rp.wrap); box.appendChild(rail); box.appendChild(row2);
    root.appendChild(box);
    /* the rail paints by id, so the box is in the document first */
    fillForModel(modelId);
    /* the prefs the wizard shows are the prefs it will send */
    wstate.setOutput(state, { ratio: rp.sel.value || "auto", size: sp.sel.value ? sp.sel.value.toLowerCase() : (out.size || "2k"), variants: parseInt(cp.sel.value, 10) || 1 });
  }
  /* v6.82.0 — WHAT AUTO WILL SEND. On Auto the adapter measures the first
     photograph and sends its nearest documented ratio (ratio-fit.js, the
     6.152.0 Reference Scenes result had lost IMAGE 1's frame because Auto
     sent nothing). The line reads it the same way, so the student sees the
     frame lock — "auto → 2:3" — before pressing GENERATE. */
  function measuredAuto(route) {
    var g = (typeof globalThis !== "undefined") ? globalThis : {};
    var rf = g.HNK && g.HNK.ratioFit, rc = g.HNK && g.HNK.runninghubConfig;
    if (!rf || !rc || !route) return "";
    var first = (state.requiredInputs || []).concat(state.optionalInputs || [])
      .map(function (i) { return i.image && i.image.ref; })
      .filter(function (r) { return /^data:image\//.test(String(r || "")); })[0];
    if (!first) return "";
    try {
      var mc = rc.modelConfig(rc.resolve(), route.modelId) || {};
      if (!rf.needsMeasuredRatio(mc, "")) return "";
      var wh = rf.measureDataUrl(first);
      return wh ? (rf.nearestRatio(wh.w, wh.h) || "") : "";
    } catch (e) { return ""; }
  }
  function routeLine(wf) {
    var route = state.resolvedRoute || wf.route;
    var m = modelRegistry.getModel(route.modelId);
    var out = state.output || {};
    var r = normRatio(out.ratio);
    if (!r) { var mr = measuredAuto(route); r = mr ? "auto \u2192 " + mr : "auto"; }
    return dom.t("ai_model_lbl", "Model") + ": " + (route.auto ? dom.t("qual_auto", "Auto") + " \u00B7 " : "") + (m ? m.displayName : route.modelId) +
      "   \u00b7   Output: " + String(out.size || "2k").toUpperCase() + " \u00b7 " + r + (out.variants > 1 ? " \u00b7 \u00d7" + out.variants : "");
  }

  function addFromLibrary(inp) {
    var g = (typeof globalThis !== "undefined") ? globalThis : {};
    var getPick = g.HNK && g.HNK.getLibraryPickDataUrl;
    var hint = function (msg) { if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = msg; } };
    /* v6.82.0 — THE DOOR, NOT A HINT. "Library" used to answer "pick a
       photo from the Presets tab first" and stay where it was; the owner's
       6.152.0 photographs read that as "choose library မရဘူး". With nothing
       picked yet the slot now OPENS the Library (HNK.libTarget, installed by
       main.js) and remembers which slot asked; the Library's IMAGE button
       hands the look straight back to it (HNK.wfSlotFill) and returns here. */
    var openLib = function () {
      var lt = g.HNK && g.HNK.libTarget;
      if (lt && typeof lt.request === "function") {
        var all = (state.requiredInputs || []).concat(state.optionalInputs || []);
        var idx = 0; for (var i = 0; i < all.length; i++) if (all[i].key === inp.key) idx = i;
        lt.request(inp.key, idx); return true;
      }
      return false;
    };
    if (!getPick) { if (!openLib()) hint(dom.t("ai_lib_bridge_off", "Library bridge unavailable on this host.")); return; }
    getPick().then(function (res) {
      if (!res || !res.dataUrl) { if (!openLib()) hint(dom.t("ai_lib_pick_first", "Pick a photo from the Presets tab \u2192 Visual Library first.")); return; }
      wstate.setInput(state, inp.key, { source: "library", role: inp.role, ref: res.dataUrl, valid: true });
      refresh();
    }).catch(function () { hint(dom.t("ai_lib_load_fail", "Library image could not be loaded.")); });
  }
  /* v6.82.0 — the Library's way back into a wizard slot: {mime,b64} or a
     data URL lands in the slot named by key. Installed on every create() so
     the live screen's state is the one written. */
  function fillSlot(key, cap) {
    var all = (state.requiredInputs || []).concat(state.optionalInputs || []);
    var inp = null; for (var i = 0; i < all.length; i++) if (all[i].key === key) inp = all[i];
    if (!inp || !cap) return false;
    var ref = cap.ref || cap.dataUrl || (cap.b64 ? "data:" + (cap.mime || "image/jpeg") + ";base64," + cap.b64 : "");
    if (!/^data:image\//.test(String(ref))) return false;
    wstate.setInput(state, key, { source: "library", role: inp.role, ref: ref, valid: true });
    try { refresh(); } catch (e) { }
    return true;
  }
  try {
    var gSlot = (typeof globalThis !== "undefined") ? globalThis : null;
    if (gSlot) { gSlot.HNK = gSlot.HNK || {}; gSlot.HNK.wfSlotFill = fillSlot; }
  } catch (e) { }

  /* v6.76.0 — the Library's scene looks under a scene or background slot:
     one tap loads the full plate into the slot (through remoteArt, the path
     every remote picture in this panel takes) and remembers which look it
     was, so the request compiler can name it to the model. */
  function markSceneTile(strip, id) {
    var kids = strip.children || [];
    for (var i = 0; i < kids.length; i++) {
      var on = !!(kids[i].getAttribute && kids[i].getAttribute("data-id") === id);
      kids[i].className = "hnk-scene-tile" + (on ? " on" : "");
    }
  }
  function pickScenePreset(inp, it, strip) {
    var url = plateUrl("full", it.id), ra = artLoader();
    if (!url || !ra || typeof ra.load !== "function" || strip._busy) return;
    strip._busy = true;
    if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = dom.t("wf_scene_loading", "Loading the scene…"); }
    ra.load(url).then(function (dataUrl) {
      wstate.setInput(state, inp.key, { source: "preset", role: inp.role, ref: dataUrl, valid: true,
        preset: { id: it.id, title: it.t, group: it.g || "" } });
      markSceneTile(strip, it.id);
      refresh();
    }, function () {
      if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = dom.t("wf_scene_fail", "Couldn't load this Library scene — check your internet."); }
    }).then(function () { strip._busy = false; });
  }
  function sceneStrip(inp) {
    var items = scenePresetList(libItems());
    if (!items.length || !plateUrl("ui", items[0].id)) return null;
    var strip = dom.el(doc, "div", { class: "hnk-scene-strip", id: "hnkWfScene_" + inp.key });
    items.forEach(function (it) {
      var im = doc.createElement("img"); im.alt = "";
      setArt(im, plateUrl("ui", it.id));
      var tile = dom.el(doc, "div", { class: "hnk-scene-tile", attrs: { role: "button", tabindex: "0", "data-id": it.id, title: it.t } },
        [im, dom.el(doc, "span", { class: "hnk-scene-t", text: it.t })]);
      dom.on(tile, "click", function () { pickScenePreset(inp, it, strip); });
      strip.appendChild(tile);
    });
    var cur = inp.image && inp.image.preset && inp.image.preset.id;
    if (cur) markSceneTile(strip, cur);
    return dom.el(doc, "div", { class: "hnk-scene" }, [
      dom.el(doc, "div", { class: "hnk-scene-h", text: dom.t("wf_scene_presets", "Scene presets from the Library — one tap") }),
      strip
    ]);
  }

  function inputRow(inp) {
    var mark = dom.el(doc, "span", { class: "hnk-req-mark miss", text: dom.t("ai_missing", "Missing") });
    nodes["req_" + inp.key] = mark;
    var lbl = dom.t(registry.inputLabelKey(inp.label) || "", inp.label);
    /* All four sources, matching the classic tabs' reference slots. The
       Layer button keeps the historic hnkWfAdd_ id (audit + muscle memory). */
    var add = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfAdd_" + inp.key, text: dom.t("btn_ref_layer", "+ Layer") });
    dom.on(add, "click", function () { addImage(inp); });
    var fileB = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfFile_" + inp.key, text: dom.t("btn_ref_file", "File") });
    dom.on(fileB, "click", function () { addFromFile(inp); });
    var pasteB = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfPaste_" + inp.key, text: dom.t("btn_ref_paste", "Paste") });
    dom.on(pasteB, "click", function () { addFromPaste(inp); });
    var webB = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfWeb_" + inp.key, text: dom.t("btn_ref_web", "Web") });
    var lib = dom.el(doc, "button", { class: "hnk-btn hnk-req-add hnk-req-lib", id: "hnkWfLib_" + inp.key, text: "\u2726 " + dom.t("ai_library", "Library") });
    dom.on(lib, "click", function () { addFromLibrary(inp); });

    /* Web Link entry row \u2014 hidden until its Web button is pressed. */
    var urlInp = dom.el(doc, "input", { class: "hnk-inp hnk-url-inp", id: "hnkWfUrl_" + inp.key,
      attrs: { type: "text", placeholder: dom.t("url_ph", "https://... image link") } });
    var urlGo = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfUrlGo_" + inp.key, text: dom.t("btn_load", "Load") });
    var urlRow = dom.el(doc, "div", { class: "hnk-url-row", id: "hnkWfUrlRow_" + inp.key }, [urlInp, urlGo]);
    urlRow.style.display = "none";
    dom.on(webB, "click", function () {
      var open = urlRow.style.display === "none";
      urlRow.style.display = open ? "" : "none";
      if (open) { try { urlInp.focus(); } catch (e) {} }
    });
    dom.on(urlGo, "click", function () {
      addFromWeb(inp, urlInp.value);
      urlRow.style.display = "none";
    });
    /* v6.82.0 — Enter in the link field is the Load button */
    dom.on(urlInp, "keydown", function (ev) {
      if (ev && ev.key === "Enter") { addFromWeb(inp, urlInp.value); urlRow.style.display = "none"; }
    });

    /* v6.59.0 — the slot's own preview; refresh() fills and hides it. A
       clear button beside it, because a wrong picture must be as easy to
       take out as it was to put in. */
    var thumbImg = doc.createElement("img");
    thumbImg.alt = "";
    thumbImg.onerror = function () { try { thumb.style.display = "none"; } catch (e) { } };
    var clear = dom.el(doc, "button", { class: "hnk-btn hnk-req-clear", id: "hnkWfClear_" + inp.key, text: "✕" });
    dom.on(clear, "click", function () {
      wstate.setInput(state, inp.key, { source: "", role: inp.role, ref: null, valid: false });
      refresh();
    });
    /* v6.109.0 — AN EMPTY SLOT IS STILL A SLOT. Until now this tile appeared
       only once a picture had landed, so a workflow that wanted two photographs
       opened as a label, the word "Missing" and a row of buttons: the owner read
       that, correctly, as "the Smart Workflow has no image slots" — Freeform
       shows IMG 1…IMG 4 as boxes you can see and press before anything is in
       them, and this screen showed nothing at all. The tile is now always on
       screen: an empty frame with a + while the slot is waiting, the photograph
       itself once one arrives. Pressing the empty frame takes the open
       Photoshop layer, the same thing its + Layer button does, so the shortest
       path in the panel is also the most obvious one. */
    var emptyPlus = dom.el(doc, "span", { class: "hnk-req-plus", text: "+" });
    var emptyTxt = dom.el(doc, "span", { class: "hnk-req-empty-t", text: dom.t("btn_ref_layer", "+ Layer") });
    var empty = dom.el(doc, "div", { class: "hnk-req-empty", id: "hnkWfEmpty_" + inp.key,
      attrs: { role: "button", tabindex: "0" } }, [emptyPlus, emptyTxt]);
    dom.on(empty, "click", function () { addImage(inp); });
    var thumb = dom.el(doc, "div", { class: "hnk-req-thumb", id: "hnkWfThumb_" + inp.key }, [thumbImg, clear, empty]);
    nodes["thumb_" + inp.key] = thumb;
    nodes["empty_" + inp.key] = empty;

    /* v6.75.0 — the label gets a line of its own. Beside five buttons it was
       squeezed to a sliver: the owner's photograph showed "မျက်နှာ / လူ
       reference" broken over three lines with the ✓ floating beside the
       middle one. Name first, then the row of sources. */
    var scene = isSceneInput(inp) ? sceneStrip(inp) : null;
    return dom.el(doc, "div", { class: "hnk-req-block" }, [
      dom.el(doc, "div", { class: "hnk-req-head" }, [
        dom.el(doc, "span", { class: "hnk-req-label", text: lbl }), mark
      ]),
      dom.el(doc, "div", { class: "hnk-req-row" }, [add, fileB, pasteB, webB, lib]),
      urlRow,
      thumb
    ].concat(scene ? [scene] : []));
  }

  function render(mountRoot) {
    root = mountRoot;
    if (state.workflowId) renderSelected(); else renderList();
    return root;
  }

  return { render: render, refresh: refresh, select: select, getState: function () { return state; } };
}

/* ---- v6.76.0 — LIBRARY SCENE PRESETS: the rule that picks the Library's
   scene looks, byte for byte the app's (docs/app/index.html scenePresetList);
   test/verify_scene_presets.js holds the two lists equal. ---- */
function scenePresetList(items){
  /* the Library's scene looks, one order on both surfaces: indoor sets first,
     then scene & set, the background snoot, the outdoor fashion frames, and
     the birthday concepts last; a look counts once even when it sits in two
     lists. Family Scene / Outdoor, collection Background. */
  var ORDER={"Indoor Set":0,"Scene & Set":1,"Background Snoot":2,"Outdoor & Fashion":3,"Birthday Concept":4};
  var out=[], seen={};
  for(var i=0;i<(items||[]).length;i++){
    var it=items[i]; if(!it||!it.id||seen[it.id]) continue;
    if(it.f==="Scene"||it.f==="Outdoor"||it.c==="Background"){ seen[it.id]=1; out.push({it:it,i:i}); }
  }
  out.sort(function(a,b){ var oa=ORDER[a.it.g]==null?9:ORDER[a.it.g], ob=ORDER[b.it.g]==null?9:ORDER[b.it.g]; return oa-ob || a.i-b.i; });
  return out.slice(0,96).map(function(o){ return o.it; });
}
function isSceneLabel(label){ return /scene|background/i.test(String(label||"")); }
function isSceneInput(inp) {
  return !!inp && inp.role !== "main" && (inp.role === "background" || isSceneLabel(inp.label));
}
function libItems() {
  try {
    var d = _CJS ? require("../../../js/hnk_library_compact_data.js") : (globalThis.HNK && globalThis.HNK.LIB_WF);
    return (d && d.items) || [];
  } catch (e) { return []; }
}
function plateUrl(tier, id) {
  var H = (typeof globalThis !== "undefined" && globalThis.HNK) || {};
  return (typeof H.libPlateUrl === "function") ? H.libPlateUrl(tier, id) : "";
}

var API = { create: create, scenePresetList: scenePresetList, isSceneInput: isSceneInput,
  scenePresetIds: function () { return scenePresetList(libItems()).map(function (it) { return it.id; }); } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowToolsScreen = API; }
})();
