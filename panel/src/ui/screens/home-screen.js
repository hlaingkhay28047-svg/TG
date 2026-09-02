/* ============================================================
   HNK AI Tools — Home screen controller

   v6.51.0 — THIS IS THE WEB APP'S HOME, box for box.

   The owner compared the two surfaces page by page and reported the panel
   still did not match. A machine walk of both at 388px agreed: the app's
   Home (#pgDash) is a dashboard — greeting hero, a destinations card, the
   COST & BALANCE strip when there is spend to show, six two-up picture cards
   at 188x207.5, a Library teaser strip, the inventory statline and the
   Photoshop-panel band. v6.49.0 had the sections; this pass has the pixels:
   the greeting is the app's renderDashGreet (nine-language clock split, the
   member's name, the local weekday · time · city line, the plan pill), the
   badges are the app's SVG glyphs rather than text, the buttons carry the
   app's icon rows, and every box was measured against the app's own dump
   until only data-driven differences remained.

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

/* The web app's own asset host for the Library plates. The panel ships
   metadata, never the 1850 plates — the same contract the Library's compact
   cards already follow. The six dashboard arts and the three greeting plates
   ARE bundled (icons/dash, icons/banners): Home must draw offline. */
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
   the same surface (the app's page id is named beside it). `ic` is the app's
   sprite symbol; the panel draws it from icons/ui/<ic>-cream.svg because a
   UXP <img> paints where an inline <svg><use> does not. */
var DASH_CARDS = [
  { page: "retouch", app: "pgRetouch", ic: "i-gem", img: "icons/dash/retouch.jpg",
    lbl: { my: "အသားအရေပြင်မယ်", en: "Retouch", shn: "မႄးၽိဝ်ၼိူဝ်ႉ", kac: "Retouch", th: "รีทัช", zh: "修图", vi: "Sửa ảnh", id: "Retouch", ms: "Retouch" } },
  { page: "wf", app: "pgWf", ic: "i-brain", img: "icons/dash/scene.jpg",
    lbl: { my: "နောက်ခံ·ဝတ်စုံပြောင်းမယ်", en: "Change Scene", shn: "လႅၵ်ႈပိုၼ်ႉလင်·ၶူဝ်းၼုင်ႈ", kac: "Scene galai u", th: "เปลี่ยนฉาก", zh: "更换场景", vi: "Đổi bối cảnh", id: "Ganti latar", ms: "Tukar latar" } },
  { page: "prompt", app: "pgCreate", ic: "i-pen", img: "icons/dash/describe.jpg",
    lbl: { my: "စကားနဲ့ပြင်မယ်", en: "Describe an Edit", shn: "လၢတ်ႈသေမႄး", kac: "Ga hte tsun nna galai u", th: "บอกสิ่งที่จะแก้", zh: "用文字描述修改", vi: "Mô tả chỉnh sửa", id: "Jelaskan editan", ms: "Terangkan suntingan" } },
  { page: "create", app: "MEDIA", ic: "i-clapper", img: "icons/dash/medialab.jpg",
    lbl: { my: "ဗီဒီယို·Text→Image", en: "Media Lab", shn: "ဝီးတီးဢူဝ်း·Text→Image", kac: "Media Lab", th: "มีเดียแล็บ", zh: "媒体实验室", vi: "Media Lab", id: "Media Lab", ms: "Media Lab" } },
  { page: "path", app: "pgPath", ic: "i-stack", img: "icons/dash/path.jpg",
    lbl: { my: "အစုလိုက် ပြင်မယ်", en: "Batch Retouch", shn: "မႄးလၢႆလၢႆၶႅပ်း", kac: "Sumla law law retouch", th: "รีทัชเป็นชุด", zh: "批量修图", vi: "Sửa hàng loạt", id: "Retouch massal", ms: "Retouch pukal" } },
  { page: "gallery", app: "pgGallery", ic: "i-gallery", img: "icons/dash/gallery.jpg",
    lbl: { my: "ရလဒ်တွေ ကြည့်မယ်", en: "My Gallery", shn: "တူၺ်းၽွၼ်းလႆႈ", kac: "Lachyum ni yu u", th: "แกลเลอรีของฉัน", zh: "我的图库", vi: "Bộ sưu tập", id: "Galeri saya", ms: "Galeri saya" } }
];

/* The app's renderDashGreet tables, verbatim: three clock bands, nine
   languages each, plus the Burmese names of the cities the timezone list
   can name. */
var L_GREET_MORNING = { my: "မင်္ဂလာနံနက်ခင်းပါ", en: "Good morning", shn: "မႂ်ႇသုင်ၵၢင်ၼႂ်ၶႃႈ", kac: "Jahpawt manap kaja u ga", th: "สวัสดีตอนเช้า", zh: "早上好", vi: "Chào buổi sáng", id: "Selamat pagi", ms: "Selamat pagi" };
var L_GREET_AFTERNOON = { my: "မင်္ဂလာနေ့လယ်ခင်းပါ", en: "Good afternoon", shn: "မႂ်ႇသုင်ဝၢႆးဝၼ်းၶႃႈ", kac: "Shani kaang kaja u ga", th: "สวัสดีตอนบ่าย", zh: "下午好", vi: "Chào buổi chiều", id: "Selamat siang", ms: "Selamat tengah hari" };
var L_GREET_EVENING = { my: "မင်္ဂလာညနေခင်းပါ", en: "Good evening", shn: "မႂ်ႇသုင်ၵၢင်ၶမ်ႈၶႃႈ", kac: "Shana maga kaja u ga", th: "สวัสดีตอนเย็น", zh: "晚上好", vi: "Chào buổi tối", id: "Selamat malam", ms: "Selamat petang" };
var CITY_MY = { "Yangon": "ရန်ကုန်", "Rangoon": "ရန်ကုန်", "Bangkok": "ဘန်ကောက်", "Singapore": "စင်္ကာပူ", "Kuala Lumpur": "ကွာလာလမ်ပူ", "Jakarta": "ဂျာကာတာ", "Ho Chi Minh": "ဟိုချီမင်း", "Saigon": "ဟိုချီမင်း", "Shanghai": "ရှန်ဟိုင်း", "Hong Kong": "ဟောင်ကောင်", "Tokyo": "တိုကျို", "Seoul": "ဆိုးလ်", "Taipei": "ထိုင်ပေ", "Dubai": "ဒူဘိုင်း", "London": "လန်ဒန်", "Phnom Penh": "ဖနွမ်းပင်", "Vientiane": "ဗီယင်ကျန်း", "Dhaka": "ဒါကာ", "Kolkata": "ကိုလကတ္တား", "Sydney": "ဆစ်ဒနီ", "Los Angeles": "လော့စ်အိန်ဂျယ်လိစ်", "New York": "နယူးယောက်" };

var L_LIB_H2 = { my: "Library ထဲက Look များ", en: "Looks from the Library", shn: "Look ၼႂ်း Library", kac: "Library kaw na look ni", th: "ลุคจาก Library", zh: "来自 Library 的风格", vi: "Các look từ Library", id: "Gaya dari Library", ms: "Gaya dari Library" };
var L_LIB_MORE = { my: "နောက်ထပ်ကြည့်မယ်", en: "View More", shn: "တူၺ်းထႅင်ႈ", kac: "Grau yu u", th: "ดูเพิ่มเติม", zh: "查看更多", vi: "Xem thêm", id: "Lihat lainnya", ms: "Lihat lagi" };
var L_PROMO_P = { my: "Photoshop ထဲမှာလည်း — Layer + Mask နဲ့ ပြန်လာမယ်၊ မူရင်းပုံ မပျက်ဘူး။", en: "Also in Photoshop — results come back as Layer + Mask, your original stays untouched.", shn: "ၼႂ်း Photoshop ၵေႃႈ — ၽွၼ်းလႆႈပွၵ်ႈမႃးပဵၼ် Layer + Mask၊ ၶႅပ်းႁၢင်ႈမူႇလဢမ်ႇလု။", kac: "Photoshop hta mung — result gaw Layer + Mask hku bai wa ai, na a shawng sumla n hten ai.", th: "ใน Photoshop ก็ได้ — ผลลัพธ์กลับมาเป็น Layer + Mask ต้นฉบับไม่ถูกแตะต้อง", zh: "Photoshop 中同样可用 — 结果以 Layer + Mask 返回，原图不受影响。", vi: "Cũng có trong Photoshop — kết quả trả về dạng Layer + Mask, ảnh gốc không bị ảnh hưởng.", id: "Juga di Photoshop — hasil kembali sebagai Layer + Mask, foto asli tetap utuh.", ms: "Juga dalam Photoshop — hasil kembali sebagai Layer + Mask, foto asal kekal." };
var L_PROMO_GO = { my: "Panel ရယူမယ်", en: "Get the Panel", shn: "ဢဝ် Panel", kac: "Panel la u", th: "รับ Panel", zh: "获取 Panel", vi: "Tải Panel", id: "Dapatkan Panel", ms: "Dapatkan Panel" };

/* The app's setIcnText(): an icon and a label on one baseline row. main.js
   owns the panel's own copy, but this screen can render before main.js has
   loaded, so the row is built here from the same two parts — an <img> of
   the sprite symbol (icons/ui/<name>-<tint>.svg) and the text. `after`
   mirrors the app's {after:true}: label first, arrow last. */
function iconRow(doc, name, tint, text, after) {
  var row = dom.el(doc, "div", { class: "btn-in" });
  var im = doc.createElement("img");
  im.className = after ? "ic-s ic-after" : "ic-s";
  im.alt = "";
  im.src = "icons/ui/" + name + "-" + tint + ".svg";
  var tx = doc.createTextNode(text);
  if (after) { row.appendChild(tx); row.appendChild(im); }
  else { row.appendChild(im); row.appendChild(tx); }
  return row;
}

/* What the app's Home reads off the session: the member's name, the plan
   pill and the spend strip. The panel keeps those in main.js, reached over
   HNK.panelNav.dash(); before it exists (or signed out) Home greets plainly,
   exactly as the app does for a visitor. */
function dashInfo() {
  var d = { name: "", planLine: "", money: null };
  try {
    var nav = globalThis.HNK && globalThis.HNK.panelNav;
    var got = (nav && typeof nav.dash === "function") ? nav.dash() : null;
    if (got) {
      d.name = got.name ? String(got.name) : "";
      d.planLine = got.planLine ? String(got.planLine) : "";
      d.money = got.money || null;
    }
  } catch (e) { }
  return d;
}

/* The app's second greeting line — "Tuesday, September 1 · 4:45 PM · Yangon"
   in the app's locale for the language, the city being the last segment of
   the IANA zone (Burmese readers see the Burmese name when one is known). */
function greetSub() {
  var dt = "";
  try {
    var L = lang();
    var loc = L === "my" ? "my-MM" : L === "zh" ? "zh-CN" : L;
    var now = new Date();
    var day = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(now);
    var clock = new Intl.DateTimeFormat(loc, { hour: "numeric", minute: "2-digit" }).format(now);
    var city = "";
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      var seg = tz.split("/");
      city = (seg[seg.length - 1] || "").replace(/_/g, " ");
      if (L === "my" && CITY_MY[city]) city = CITY_MY[city];
    } catch (e2) { city = ""; }
    dt = day + " · " + clock + (city ? " · " + city : "");
  } catch (e) {
    try { dt = new Date().toISOString().slice(0, 10); } catch (e3) { dt = ""; }
  }
  return dt;
}

/* deps: { document, onNavigate(screenId), onPage(pageKey), onGetUpdate(), onWorkflow(workflowId) } */
function render(root, deps) {
  var doc = deps.document;
  dom.clear(root);
  var info = dashInfo();

  /* ---- 1. the greeting hero (the app's .dash-greet / renderDashGreet) ----
     Same clock split (morning <11 / afternoon <16 / evening) with the same
     three arts, bundled beside the page banners so the art and the words
     always agree — online or off. The app darkens the plate with a ::before
     gradient; UXP has no pseudo-elements, so the scrim is a real child. */
  var h = new Date().getHours();
  var art = h < 11 ? "morning" : h < 16 ? "afternoon" : "evening";
  var g = h < 11 ? L_GREET_MORNING : h < 16 ? L_GREET_AFTERNOON : L_GREET_EVENING;
  var greet = dom.el(doc, "div", { class: "dash-greet", id: "dashGreet" });
  greet.style.backgroundImage = 'url("icons/banners/hero-greet-' + art + '.jpg")';
  greet.appendChild(dom.el(doc, "div", { class: art === "evening" ? "greet-scrim evening" : "greet-scrim" }));
  var hi = l9(g) + (info.name ? " — " + info.name.slice(0, 24) : "");
  greet.appendChild(dom.el(doc, "div", { class: "hi", text: hi }));
  var dt = greetSub();
  if (dt) greet.appendChild(dom.el(doc, "div", { class: "sub", text: dt }));
  if (info.planLine) greet.appendChild(dom.el(doc, "span", { class: "pill", text: info.planLine }));
  root.appendChild(greet);

  /* ---- 2. the destinations card (the app's "Student Web App") ----
     The app prints this heading and its four buttons in English in every
     locale, so they are copied as written. "Photoshop Panel download" is the
     app's route to the .ccx; inside the panel that is the in-panel update
     fetch of the same release feeds, so it points there. */
  var destCard = dom.el(doc, "div", { class: "card" });
  destCard.appendChild(dom.el(doc, "h2", { text: "Student Web App" }));
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

  /* ---- 3. COST & BALANCE (the app's #dashMoney / renderDashMoney) ----
     Shown once a run or a balance check exists — a studio that never touches
     RunningHub never sees an empty money card, exactly like the app. */
  if (info.money) {
    var m = info.money;
    var money = dom.el(doc, "div", { class: "card", id: "dashMoney" });
    var mh2 = dom.el(doc, "h2", { id: "dashMoneyH2" });
    var mic = doc.createElement("img");
    mic.className = "ic-s"; mic.alt = ""; mic.src = "icons/ui/i-bolt-gold.svg";
    mh2.appendChild(mic);
    mh2.appendChild(doc.createTextNode(m.h || ""));
    money.appendChild(mh2);
    var ms = dom.el(doc, "div", { class: "statline money-stat" });
    [[m.bal, m.balL], [m.today, m.todayL], [m.runs, m.runsL]].forEach(function (pair) {
      ms.appendChild(dom.el(doc, "div", {}, [
        dom.el(doc, "b", { text: pair[0] == null ? "—" : String(pair[0]) }),
        dom.el(doc, "span", { text: pair[1] || "" })
      ]));
    });
    money.appendChild(ms);
    money.appendChild(dom.el(doc, "div", { class: "mut", text: m.note || "" }));
    root.appendChild(money);
  }

  /* ---- 4. the six destination cards, two to a row (the app's .dash-grid) ---- */
  var grid = dom.el(doc, "div", { class: "dash-grid", id: "dashGrid" });
  DASH_CARDS.forEach(function (c) {
    var artBox = dom.el(doc, "div", { class: "art" });
    var im = doc.createElement("img");
    /* eager: nothing in this renderer ever drives a lazy load, and a card
       that waits for a scroll event that never fires stays black (v6.47.1) */
    im.loading = "eager";
    im.alt = "";
    /* the app's onerror: the art keeps its gradient, the broken image goes */
    im.onerror = function () {
      try { artBox.className = "art dash-noart"; } catch (e) { }
      try { artBox.removeChild(im); } catch (e) { }
    };
    im.src = c.img;
    artBox.appendChild(im);
    var bdg = dom.el(doc, "div", { class: "bdg" });
    var bic = doc.createElement("img");
    bic.className = "ic-m"; bic.alt = ""; bic.src = "icons/ui/" + c.ic + "-cream.svg";
    bdg.appendChild(bic);
    artBox.appendChild(bdg);
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

  /* ---- 5. the Library teaser strip (the app's dashLibStrip) ----
     The app's featured ids, each resolved against the catalog and skipped
     when it names nothing — same list, same order, first ten. */
  var libCard = dom.el(doc, "div", { class: "card" });
  libCard.appendChild(dom.el(doc, "h2", { id: "dashLibH2", text: l9(L_LIB_H2) }));
  var strip = dom.el(doc, "div", { class: "dash-strip", id: "dashLibStrip" });
  var LW = null;
  try { LW = (typeof window !== "undefined" && window.HNK_LIB_WF) || globalThis.HNK_LIB_WF || null; } catch (e) { LW = null; }
  var items = (LW && LW.items) || [];
  var featured = (LW && LW.featured) ? LW.featured.slice(0, 10) : [];
  featured.forEach(function (fid) {
    var it = null;
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].id === fid) { it = items[i]; break; }
    if (!it) return;
    var im2 = doc.createElement("img");
    im2.loading = "eager";
    im2.alt = it.t || "";
    im2.src = APP_ASSETS + "ui/" + fid + ".jpg";
    strip.appendChild(im2);
  });
  libCard.appendChild(strip);
  var moreRow = dom.el(doc, "div", { class: "row" });
  var more = dom.el(doc, "button", { class: "btn", id: "dashLibMore" });
  more.appendChild(iconRow(doc, "i-arrow", "cream", l9(L_LIB_MORE), true));
  dom.on(more, "click", function () { if (deps.onPage) deps.onPage("presets"); });
  moreRow.appendChild(more);
  libCard.appendChild(moreRow);
  root.appendChild(libCard);

  /* ---- 6. the inventory statline (the app's .dash-stat) ----
     The app prints these five labels in English in every locale; the last
     two are links into Retouch A and Retouch B, as the app's are. */
  var stats = dom.el(doc, "div", { class: "statline dash-stat" });
  function stat(n, label, pageKey) {
    var cell = pageKey
      ? dom.el(doc, "button", { class: "dash-stat-link" })
      : dom.el(doc, "div", {});
    cell.appendChild(dom.el(doc, "b", { text: String(n) }));
    cell.appendChild(dom.el(doc, "span", { text: label }));
    if (pageKey) dom.on(cell, "click", function () { if (deps.onPage) deps.onPage(pageKey); });
    stats.appendChild(cell);
  }
  var wfCount = 143, libCount = 1850;
  try {
    var reg = globalThis.HNK && globalThis.HNK.workflowRegistry;
    if (reg && reg.list) wfCount = reg.list().length;
  } catch (e) { }
  try { if (items.length) libCount = items.length; } catch (e) { }
  stat(150, "One-Tap Workflows");
  stat(libCount, "Visual Library");
  stat(wfCount, "Smart Workflow");
  stat(162, "Retouch A Controls", "meitu");
  stat(213, "Retouch B Pro", "evoto");
  root.appendChild(stats);

  /* ---- 7. the Photoshop-panel band (the app's .dash-promo) ----
     Dismissible, like the app's: the app remembers the ✕ in localStorage,
     which UXP does not reliably provide, so the panel remembers it in the
     AI Tools settings file it already writes. The button sits in a flex row
     because the app's is inline-flex (shrink-wrapped) and UXP has no inline
     boxes — the row is invisible, the button's box is the app's. */
  var promoHidden = false;
  try {
    var sv = globalThis.HNK && globalThis.HNK.aiToolsSettings;
    promoHidden = !!(sv && sv.get && sv.get().promoHidden);
  } catch (e) { }
  if (!promoHidden) {
    var promo = dom.el(doc, "div", { class: "card dash-promo", id: "dashPromo" });
    promo.appendChild(dom.el(doc, "h2", { id: "dashPromoH2", text: "Photoshop Panel" }));
    promo.appendChild(dom.el(doc, "p", { id: "dashPromoP", text: l9(L_PROMO_P) }));
    var goRow = dom.el(doc, "div", { class: "btn-row" });
    var go = dom.el(doc, "button", { class: "btn", id: "dashPromoGo" });
    go.appendChild(iconRow(doc, "i-arrow", "cream", l9(L_PROMO_GO), false));
    dom.on(go, "click", function () { if (deps.onGetUpdate) deps.onGetUpdate(); });
    goRow.appendChild(go);
    promo.appendChild(goRow);
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
