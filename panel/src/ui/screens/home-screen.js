/* ============================================================
   HNK AI Tools — Home screen controller

   v6.49.0 — THIS IS THE WEB APP'S HOME, not a panel invention.

   The owner compared the two surfaces page by page and reported the panel
   still did not match. A machine walk of both at 420px agreed: the app's
   Home (#pgDash) is a dashboard — greeting hero, a destinations card, six
   two-up picture cards at 188x208, a Library teaser strip, the inventory
   statline and the Photoshop-panel band — while the panel's Home was the
   AI-Tools stack's own home: nine 380x330 art cards and a LEARNING list the
   app keeps on a separate page.

   Every section below is the app's, in the app's order, with the app's own
   nine-language copy carried over verbatim (l9() mirrors the app's L9: the
   four panel-only languages fall back to English exactly as the app does for
   any locale outside its nine). The panel's I18N table is untouched — new
   dashboard strings live here as data, so the ~20 translation packs keep
   their pinned key sets.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;

/* The web app's own asset host. The panel ships metadata, never plates —
   the same contract the Library's compact cards already follow. */
var APP_ASSETS = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/app/lib/";

/* The app's L9(): pick the active language, fall back to English. */
function lang() {
  try {
    var b = globalThis.HNK && globalThis.HNK.i18n;
    return (b && typeof b.lang === "function") ? b.lang() : "en";
  } catch (e) { return "en"; }
}
function l9(m) {
  var k = lang();
  return (m && m[k]) ? m[k] : (m && m.en) ? m.en : "";
}

/* The app's six dashboard destinations, in the app's order, with the app's
   art, badge glyph and label maps. `page` is the panel page key that holds
   the same surface (the app's page id is named beside it). */
var DASH_CARDS = [
  { page: "retouch", app: "pgRetouch", ic: "◆", img: "dash/retouch.jpg",
    lbl: { my: "အသားအရေပြင်မယ်", en: "Retouch", shn: "မႄးၽိဝ်ၼိူဝ်ႉ", kac: "Retouch", th: "รีทัช", zh: "修图", vi: "Sửa ảnh", id: "Retouch", ms: "Retouch" } },
  { page: "wf", app: "pgWf", ic: "✦", img: "dash/scene.jpg",
    lbl: { my: "နောက်ခံ·ဝတ်စုံပြောင်းမယ်", en: "Change Scene", shn: "လႅၵ်ႈပိုၼ်ႉလင်·ၶူဝ်းၼုင်ႈ", kac: "Scene galai u", th: "เปลี่ยนฉาก", zh: "更换场景", vi: "Đổi bối cảnh", id: "Ganti latar", ms: "Tukar latar" } },
  { page: "prompt", app: "pgCreate", ic: "✎", img: "dash/describe.jpg",
    lbl: { my: "စကားနဲ့ပြင်မယ်", en: "Describe an Edit", shn: "လၢတ်ႈသေမႄး", kac: "Ga hte tsun nna galai u", th: "บอกสิ่งที่จะแก้", zh: "用文字描述修改", vi: "Mô tả chỉnh sửa", id: "Jelaskan editan", ms: "Terangkan suntingan" } },
  { page: "create", app: "MEDIA", ic: "▶", img: "dash/medialab.jpg",
    lbl: { my: "ဗီဒီယို·Text→Image", en: "Media Lab", shn: "ဝီးတီးဢူဝ်း·Text→Image", kac: "Media Lab", th: "มีเดียแล็บ", zh: "媒体实验室", vi: "Media Lab", id: "Media Lab", ms: "Media Lab" } },
  { page: "path", app: "pgPath", ic: "≡", img: "dash/path.jpg",
    lbl: { my: "အစုလိုက် ပြင်မယ်", en: "Batch Retouch", shn: "မႄးလၢႆလၢႆၶႅပ်း", kac: "Sumla law law retouch", th: "รีทัชเป็นชุด", zh: "批量修图", vi: "Sửa hàng loạt", id: "Retouch massal", ms: "Retouch pukal" } },
  { page: "gallery", app: "pgGallery", ic: "▦", img: "dash/gallery.jpg",
    lbl: { my: "ရလဒ်တွေ ကြည့်မယ်", en: "My Gallery", shn: "တူၺ်းၽွၼ်းလႆႈ", kac: "Lachyum ni yu u", th: "แกลเลอรีของฉัน", zh: "我的图库", vi: "Bộ sưu tập", id: "Galeri saya", ms: "Galeri saya" } }
];

var L_LIB_H2 = { my: "Library ထဲက Look များ", en: "Looks from the Library", shn: "Look ၼႂ်း Library", kac: "Library kaw na look ni", th: "ลุคจาก Library", zh: "来自 Library 的风格", vi: "Các look từ Library", id: "Gaya dari Library", ms: "Gaya dari Library" };
var L_LIB_MORE = { my: "နောက်ထပ်ကြည့်မယ်", en: "View More", shn: "တူၺ်းထႅင်ႈ", kac: "Grau yu u", th: "ดูเพิ่มเติม", zh: "查看更多", vi: "Xem thêm", id: "Lihat lainnya", ms: "Lihat lagi" };
var L_PROMO_P = { my: "Photoshop ထဲမှာလည်း — Layer + Mask နဲ့ ပြန်လာမယ်၊ မူရင်းပုံ မပျက်ဘူး။", en: "Also in Photoshop — results come back as Layer + Mask, your original stays untouched.", shn: "ၼႂ်း Photoshop ၵေႃႈ — ၽွၼ်းလႆႈပွၵ်ႈမႃးပဵၼ် Layer + Mask၊ ၶႅပ်းႁၢင်ႈမူႇလဢမ်ႇလု။", kac: "Photoshop hta mung — result gaw Layer + Mask hku bai wa ai, na a shawng sumla n hten ai.", th: "ใน Photoshop ก็ได้ — ผลลัพธ์กลับมาเป็น Layer + Mask ต้นฉบับไม่ถูกแตะต้อง", zh: "Photoshop 中同样可用 — 结果以 Layer + Mask 返回，原图不受影响。", vi: "Cũng có trong Photoshop — kết quả trả về dạng Layer + Mask, ảnh gốc không bị ảnh hưởng.", id: "Juga di Photoshop — hasil kembali sebagai Layer + Mask, foto asli tetap utuh.", ms: "Juga dalam Photoshop — hasil kembali sebagai Layer + Mask, foto asal kekal." };
var L_PROMO_GO = { my: "Panel ရယူမယ်", en: "Get the Panel", shn: "ဢဝ် Panel", kac: "Panel la u", th: "รับ Panel", zh: "获取 Panel", vi: "Tải Panel", id: "Dapatkan Panel", ms: "Dapatkan Panel" };

/* deps: { document, onNavigate(screenId), onWorkflow(workflowId) } */
function render(root, deps) {
  var doc = deps.document;
  dom.clear(root);

  /* ---- 1. the greeting hero (the app's .dash-greet) ----
     Same clock split as the app's renderDashGreet (morning <11 /
     afternoon <16 / evening) with the same three arts, bundled beside the
     page banners so the art and the words always agree — online or off. */
  var h = new Date().getHours();
  var art = h < 11 ? "morning" : h < 16 ? "afternoon" : "evening";
  var greet = h < 11 ? dom.t("ai_greet_morning", "Good morning")
    : h < 16 ? dom.t("ai_greet_afternoon", "Good afternoon")
    : dom.t("ai_greet_evening", "Good evening");
  var hero = dom.el(doc, "div", { class: "hnk-greet", id: "hnkGreet" });
  hero.style.backgroundImage = 'url("icons/banners/hero-greet-' + art + '.jpg")';
  hero.appendChild(dom.el(doc, "div", { class: "hnk-greet-hi", text: greet }));
  /* the app's second line is "Tuesday, September 1 · 4:45 PM" — weekday and
     date, then the clock, joined by the same middle dot */
  var dt = "";
  try { dt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date()); }
  catch (e) { try { dt = new Date().toDateString(); } catch (e2) { dt = ""; } }
  var clock = "";
  try { clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date()); }
  catch (e) { clock = ""; }
  var sub = dt + (dt && clock ? " · " : "") + clock;
  if (sub) hero.appendChild(dom.el(doc, "div", { class: "hnk-greet-sub", text: sub }));
  root.appendChild(hero);

  /* ---- 2. the destinations card (the app's "Student Web App") ----
     The app prints this heading and its four buttons in English in every
     locale, so they are copied as written. "Photoshop Panel download" is the
     app's route to the .ccx; inside the panel that is the in-panel update
     fetch the same release feeds, so it points there. */
  var destCard = dom.el(doc, "div", { class: "card" });
  destCard.appendChild(dom.el(doc, "h2", { text: dom.t("ai_dash_dest", "Student Web App") }));
  var acts = dom.el(doc, "div", { class: "unified-actions" });
  function destBtn(label, cls, fn) {
    var b = dom.el(doc, "button", { class: cls, text: label });
    dom.on(b, "click", fn);
    acts.appendChild(b);
  }
  destBtn("AI Tools", "btn btn-gold", function () { if (deps.onPage) deps.onPage("wf"); });
  destBtn("Account & license", "btn", function () { if (deps.onPage) deps.onPage("setup"); });
  destBtn("Tutorials", "btn", function () { if (deps.onNavigate) deps.onNavigate("tutorials"); });
  destBtn("Photoshop Panel download", "btn", function () { if (deps.onGetUpdate) deps.onGetUpdate(); });
  destCard.appendChild(acts);
  root.appendChild(destCard);

  /* ---- 3. the six destination cards, two to a row (the app's .dash-grid) ---- */
  var grid = dom.el(doc, "div", { class: "dash-grid" });
  DASH_CARDS.forEach(function (c) {
    var artBox = dom.el(doc, "div", { class: "art" });
    var im = doc.createElement("img");
    /* eager: nothing in this renderer ever drives a lazy load, and a card
       that waits for a scroll event that never fires stays black (v6.47.1) */
    im.loading = "eager";
    im.alt = "";
    im.onerror = function () { try { artBox.removeChild(im); } catch (e) { } };
    im.src = APP_ASSETS + c.img;
    artBox.appendChild(im);
    artBox.appendChild(dom.el(doc, "div", { class: "bdg", text: c.ic }));
    var card = dom.el(doc, "button", { class: "dash-card", id: "hnkDash_" + c.page }, [
      artBox,
      dom.el(doc, "div", { class: "lbl", text: l9(c.lbl) }),
      /* the app's sub-line is a translation aid: Burmese readers get the
         English term, everyone else gets English too — except English
         readers, who get the Burmese as local flavour */
      dom.el(doc, "div", { class: "sub", text: lang() === "en" ? c.lbl.my : c.lbl.en })
    ]);
    dom.on(card, "click", function () { if (deps.onPage) deps.onPage(c.page); });
    grid.appendChild(card);
  });
  root.appendChild(grid);

  /* ---- 4. the Library teaser strip (the app's dashLibStrip) ---- */
  var libCard = dom.el(doc, "div", { class: "card" });
  libCard.appendChild(dom.el(doc, "h2", { text: l9(L_LIB_H2) }));
  var strip = dom.el(doc, "div", { class: "dash-strip" });
  var featured = [];
  try {
    var LW = (typeof window !== "undefined" && window.HNK_LIBRARY_INDEX) || globalThis.HNK_LIBRARY_INDEX || null;
    if (LW && LW.featuredIds) featured = LW.featuredIds.slice(0, 10);
  } catch (e) { featured = []; }
  featured.forEach(function (fid) {
    var im2 = doc.createElement("img");
    im2.loading = "eager";
    im2.alt = "";
    im2.onerror = function () { try { strip.removeChild(im2); } catch (e) { } };
    im2.src = APP_ASSETS + "ui/" + fid + ".jpg";
    strip.appendChild(im2);
  });
  libCard.appendChild(strip);
  var moreRow = dom.el(doc, "div", { class: "row last" });
  var more = dom.el(doc, "button", { class: "btn", text: l9(L_LIB_MORE) });
  dom.on(more, "click", function () { if (deps.onPage) deps.onPage("presets"); });
  moreRow.appendChild(more);
  libCard.appendChild(moreRow);
  root.appendChild(libCard);

  /* ---- 5. the inventory statline (the app's .dash-stat) ----
     The app prints these five labels in English in every locale. */
  var stats = dom.el(doc, "div", { class: "statline dash-stat" });
  function stat(n, label) {
    stats.appendChild(dom.el(doc, "div", {}, [
      dom.el(doc, "b", { text: String(n) }),
      dom.el(doc, "span", { text: label })
    ]));
  }
  var wfCount = 143, libCount = 1850;
  try {
    var reg = globalThis.HNK && globalThis.HNK.workflowRegistry;
    if (reg && reg.list) wfCount = reg.list().length;
  } catch (e) { }
  try {
    var LC = (typeof window !== "undefined" && window.HNK_LIBRARY_INDEX) || globalThis.HNK_LIBRARY_INDEX;
    if (LC && LC.sourceRecords) libCount = LC.sourceRecords;
  } catch (e) { }
  stat(150, "One-Tap Workflows");
  stat(libCount, "Visual Library");
  stat(wfCount, "Smart Workflow");
  stat(162, "Retouch A Controls");
  stat(213, "Retouch B Pro");
  root.appendChild(stats);

  /* ---- 6. the Photoshop-panel band (the app's .dash-promo) ----
     Dismissible, like the app's: the app remembers the ✕ in localStorage,
     which UXP does not reliably provide, so the panel remembers it in the
     AI Tools settings file it already writes. */
  var promoHidden = false;
  try {
    var sv = globalThis.HNK && globalThis.HNK.aiToolsSettings;
    promoHidden = !!(sv && sv.get && sv.get().promoHidden);
  } catch (e) { }
  if (!promoHidden) {
    var promo = dom.el(doc, "div", { class: "card dash-promo" });
    promo.appendChild(dom.el(doc, "h2", { text: "Photoshop Panel" }));
    promo.appendChild(dom.el(doc, "p", { text: l9(L_PROMO_P) }));
    var go = dom.el(doc, "button", { class: "btn", text: l9(L_PROMO_GO) });
    dom.on(go, "click", function () { if (deps.onGetUpdate) deps.onGetUpdate(); });
    promo.appendChild(go);
    var x = dom.el(doc, "button", { class: "chip promo-x", text: "✕", attrs: { "aria-label": "Dismiss" } });
    dom.on(x, "click", function () {
      try {
        var sv2 = globalThis.HNK && globalThis.HNK.aiToolsSettings;
        if (sv2 && sv2.set) sv2.set({ promoHidden: true });
      } catch (e) { }
      try { root.removeChild(promo); } catch (e) { }
    });
    promo.appendChild(x);
    root.appendChild(promo);
  }

  return root;
}

var API = { render: render, DASH_CARDS: DASH_CARDS };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.homeScreen = API; }
})();
