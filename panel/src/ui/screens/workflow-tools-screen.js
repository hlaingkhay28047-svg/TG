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
  /* v6.83.0 — the wizard's own Results card: which result is on view, whether
     the Before | After compare is open and where its divider sits, whether the
     Advanced prompt box is open, and the earlier runs read back from the
     gallery folder on request. Session state, reset when a workflow is chosen. */
  var unsubResults = null, resSel = null, cmpOpen = false, cmpPos = 50, advOpen = false, optsOpen = false, earlier = [], earlierLoaded = false;

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
  /* 6.164.0 — the selection row on a region workflow (Selection Edit) */
  var L_SEL_CHECK = { my: "Selection စစ်မယ်", en: "Check selection", shn: "ၵူတ်ႇထတ်း selection", kac: "Selection jep u", th: "ตรวจการเลือก", zh: "检查选区", vi: "Kiểm tra vùng chọn", id: "Periksa seleksi", ms: "Semak pilihan" };
  var L_SEL_CHECKING = { my: "Selection စစ်နေသည်...", en: "Checking the selection...", shn: "တိုၵ်ႉၵူတ်ႇထတ်း selection...", kac: "Selection jep nga ai...", th: "กำลังตรวจการเลือก...", zh: "正在检查选区...", vi: "Đang kiểm tra vùng chọn...", id: "Memeriksa seleksi...", ms: "Menyemak pilihan..." };
  var L_SEL_OK = { my: "Selection ရှိပြီ ✓ {w} × {h} px — ဒီနေရာပဲ ပြောင်းမယ်", en: "Selection ready ✓ {w} × {h} px — only this area changes", shn: "Selection မီးယဝ်ႉ ✓ {w} × {h} px — လႅၵ်ႈတီႈၼႆႉၵူၺ်း", kac: "Selection nga sai ✓ {w} × {h} px — ndai shara sha galai na", th: "มีการเลือกแล้ว ✓ {w} × {h} px — เปลี่ยนแค่บริเวณนี้", zh: "已有选区 ✓ {w} × {h} px — 只改这一块", vi: "Đã có vùng chọn ✓ {w} × {h} px — chỉ vùng này đổi", id: "Seleksi siap ✓ {w} × {h} px — hanya area ini berubah", ms: "Pilihan sedia ✓ {w} × {h} px — hanya kawasan ini berubah" };
  var L_SEL_NONE = { my: "Selection မရှိသေးပါ — Photoshop မှာ Rectangle tool နဲ့ ဆွဲရွေးပြီး ထပ်စစ်ပါ", en: "No selection yet — drag a Rectangle-tool selection in Photoshop, then check again", shn: "ပႆႇမီး selection — ၸႂ်ႉ Rectangle tool ၼႂ်း Photoshop သေ ၵူတ်ႇထတ်းထႅင်ႈ", kac: "Selection n nga shi ai — Photoshop kaw Rectangle tool hte lata nna bai jep u", th: "ยังไม่มีการเลือก — ลากเลือกด้วย Rectangle tool ใน Photoshop แล้วตรวจอีกครั้ง", zh: "还没有选区 — 在 Photoshop 用矩形选框工具框选后再检查", vi: "Chưa có vùng chọn — kéo chọn bằng Rectangle tool trong Photoshop rồi kiểm tra lại", id: "Belum ada seleksi — seleksi dengan Rectangle tool di Photoshop lalu periksa lagi", ms: "Belum ada pilihan — pilih dengan Rectangle tool dalam Photoshop, kemudian semak semula" };
  var L_SEL_NOHOST = { my: "Photoshop နဲ့ မချိတ်ရသေးပါ — GENERATE နှိပ်တဲ့အချိန် selection ကို ဖတ်မယ်", en: "Photoshop is not connected — the selection is read when you press GENERATE", shn: "ပႆႇတိတ်းၸပ်း Photoshop — တေလူ selection မိူဝ်ႈၼဵၵ်း GENERATE", kac: "Photoshop hte n matut shi ai — GENERATE dip yang selection hpe hti na", th: "ยังไม่ได้เชื่อม Photoshop — จะอ่านการเลือกตอนกด GENERATE", zh: "未连接 Photoshop — 按 GENERATE 时再读取选区", vi: "Chưa kết nối Photoshop — vùng chọn được đọc khi bấm GENERATE", id: "Photoshop belum terhubung — seleksi dibaca saat menekan GENERATE", ms: "Photoshop belum disambung — pilihan dibaca apabila menekan GENERATE" };
  /* 6.168.0 — the Selection card's own lines: where the rectangle sits, the read
     of its pixels, and the two words that open and close a long description. */
  var L_SEL_POS = { my: "x {x} \u00b7 y {y} \u00b7 \u1015\u102f\u1036 {W}\u00d7{H}", en: "x {x} \u00b7 y {y} \u00b7 photo {W}\u00d7{H}", shn: "x {x} \u00b7 y {y} \u00b7 \u1075\u1075\u1088\u1017 {W}\u00d7{H}", kac: "x {x} \u00b7 y {y} \u00b7 sumla {W}\u00d7{H}", th: "x {x} \u00b7 y {y} \u00b7 \u0e20\u0e32\u0e1e {W}\u00d7{H}", zh: "x {x} \u00b7 y {y} \u00b7 \u56fe\u50cf {W}\u00d7{H}", vi: "x {x} \u00b7 y {y} \u00b7 \u1ea3nh {W}\u00d7{H}", id: "x {x} \u00b7 y {y} \u00b7 foto {W}\u00d7{H}", ms: "x {x} \u00b7 y {y} \u00b7 foto {W}\u00d7{H}" };
  var L_SEL_READ = { my: "\u101b\u103d\u1031\u1038\u1011\u102c\u1038\u1010\u1032\u1037 pixel \u1010\u103d\u1031 \u1016\u1010\u103a\u1014\u1031\u101e\u100a\u103a...", en: "Reading the selected pixels...", shn: "\u1075\u1076\u1030 pixel \u1011\u102d\u1010\u103a\u1015\u103c\u1031\u102c\u1037...", kac: "Lata da ai pixel ni hpe hti nga ai...", th: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e1e\u0e34\u0e01\u0e40\u0e0b\u0e25\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01...", zh: "\u6b63\u5728\u8bfb\u53d6\u9009\u533a\u50cf\u7d20...", vi: "\u0110ang \u0111\u1ecdc pixel v\u00f9ng ch\u1ecdn...", id: "Membaca piksel yang dipilih...", ms: "Membaca piksel yang dipilih..." };
  var L_SEL_PIX = { my: "\u1012\u102b\u1000 \u1015\u102d\u102f\u1037\u1019\u101a\u1037\u103a pixel \u1010\u103d\u1031", en: "These are the pixels that will be sent", shn: "\u1076\u1031\u1038\u1015\u1031\u102c\u1037 pixel \u1011\u1031\u1038\u1014\u1080", kac: "Ndai ni gaw sa na pixel ni re", th: "\u0e19\u0e35\u0e48\u0e04\u0e37\u0e2d\u0e1e\u0e34\u0e01\u0e40\u0e0b\u0e25\u0e17\u0e35\u0e48\u0e08\u0e30\u0e2a\u0e48\u0e07", zh: "\u8fd9\u5c31\u662f\u5c06\u8981\u53d1\u9001\u7684\u50cf\u7d20", vi: "\u0110\u00e2y l\u00e0 c\u00e1c pixel s\u1ebd \u0111\u01b0\u1ee3c g\u1eedi", id: "Inilah piksel yang akan dikirim", ms: "Inilah piksel yang akan dihantar" };
  var L_MORE = { my: "\u1015\u102d\u102f\u1016\u1010\u103a\u101b\u1014\u103a", en: "More", shn: "\u101c\u1030\u1011\u1032\u1037", kac: "Grau hti u", th: "\u0e2d\u0e48\u0e32\u0e19\u0e15\u0e48\u0e2d", zh: "\u5c55\u5f00", vi: "Xem th\u00eam", id: "Selengkapnya", ms: "Lagi" };
  var L_LESS = { my: "\u1001\u103b\u102f\u1036\u1037\u101b\u1014\u103a", en: "Less", shn: "\u101b\u1088\u1015", kac: "Hkum u", th: "\u0e22\u0e48\u0e2d", zh: "\u6536\u8d77", vi: "Thu g\u1ecdn", id: "Ringkas", ms: "Ringkas" };
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

  /* v6.83.0 — the wizard's Advanced prompt box and its Results card, the
     app's wizard strings where the app has them (step 3's Advanced header,
     step 4's Saved / Run again / Open in Edit / results-board lines). */
  var L_ADV = { my: "prompt ပြင်ချင်ရင် (မပြင်လည်းရ)", en: "edit the prompt (optional)", shn: "သင်ၶႂ်ႈမႄး prompt (ဢမ်ႇမႄးၵေႃႈလႆႈ)", kac: "prompt hpe galai mai ai (n galai yang mung mai)", th: "แก้ไข prompt (ไม่บังคับ)", zh: "编辑 prompt (可选)", vi: "chỉnh sửa prompt (không bắt buộc)", id: "edit prompt (opsional)", ms: "sunting prompt (pilihan)" };
  var L_PROMPT_RESET = { my: "မူလ prompt ပြန်ထား", en: "Reset to the workflow's prompt", shn: "ၶိုၼ်းၸႂ်ႉ prompt မူလ", kac: "Workflow a prompt hpe bai jahkrat", th: "กลับไปใช้ prompt เดิมของ Workflow", zh: "恢复工作流原 prompt", vi: "Trả lại prompt gốc của workflow", id: "Kembalikan prompt asli workflow", ms: "Kembalikan prompt asal aliran kerja" };
  var L_PROMPT_EDITED = { my: "ပြင်ထားတဲ့ prompt ကို ပို့မယ် ✎", en: "Your edited prompt will be sent ✎", shn: "တေသူင်ႇ prompt ဢၼ်မႄးဝႆႉ ✎", kac: "Galai da ai prompt hpe shagun na ✎", th: "จะส่ง prompt ที่คุณแก้ไข ✎", zh: "将发送你编辑后的 prompt ✎", vi: "Sẽ gửi prompt bạn đã sửa ✎", id: "Prompt hasil edit Anda yang dikirim ✎", ms: "Prompt yang anda sunting akan dihantar ✎" };
  var L_PROMPT_LIVE = { my: "Workflow ရဲ့ prompt အတိုင်း ပို့မယ်", en: "The workflow's own prompt will be sent", shn: "တေသူင်ႇ prompt ၶွင် workflow", kac: "Workflow a prompt hpe shagun na", th: "จะส่ง prompt ของ Workflow เอง", zh: "将发送工作流自身的 prompt", vi: "Sẽ gửi prompt của chính workflow", id: "Prompt milik workflow yang dikirim", ms: "Prompt aliran kerja sendiri akan dihantar" };
  var L_RESULTS = { my: "ရလဒ်တွေ", en: "Results", shn: "ၽွၼ်းလႆႈ", kac: "Lachyum ni", th: "ผลลัพธ์", zh: "结果", vi: "Kết quả", id: "Hasil", ms: "Hasil" };
  var L_RES_EMPTY = { my: "ရလဒ်တွေ ဒီမှာ ပေါ်မယ် — GENERATE နှိပ်ပြီးရင် Before | After နဲ့ ပြန်ကြည့်လို့ရတယ်", en: "Your results will appear here — after GENERATE you can compare Before | After", shn: "ၽွၼ်းလႆႈတေဢွၵ်ႇတီႈၼႆႈ — ၼဵၵ်း GENERATE ယဝ်ႉ တူၺ်း Before | After လႆႈ", kac: "Lachyum ni ndai kaw pru wa na — GENERATE dip ngut yang Before | After hte shingdaw yu mai ai", th: "ผลลัพธ์จะแสดงตรงนี้ — หลังกด GENERATE เทียบ Before | After ได้", zh: "结果会显示在这里 — 点 GENERATE 后可对比 Before | After", vi: "Kết quả sẽ hiện ở đây — sau GENERATE bạn có thể so Before | After", id: "Hasil akan muncul di sini — setelah GENERATE Anda bisa membandingkan Before | After", ms: "Hasil akan muncul di sini — selepas GENERATE anda boleh banding Before | After" };
  var L_SAVED = { my: "Gallery ထဲ အလိုအလျောက် သိမ်းပြီးပါပြီ ✓", en: "Saved to your Gallery automatically ✓", shn: "သိမ်းၶဝ်ႈၼႂ်း Gallery ႁင်းၵူၺ်းယဝ်ႉ ✓", kac: "Gallery hta shi hkrai makoi da sai ✓", th: "บันทึกลง Gallery ให้อัตโนมัติแล้ว ✓", zh: "已自动保存到 Gallery ✓", vi: "Đã tự động lưu vào Gallery ✓", id: "Otomatis tersimpan ke Gallery ✓", ms: "Disimpan ke Gallery secara automatik ✓" };
  var L_PLACE_AGAIN = { my: "Photoshop ထဲ ထပ်ထည့်မယ်", en: "Place into Photoshop again", shn: "သႂ်ႇၶဝ်ႈ Photoshop ထႅင်ႈ", kac: "Photoshop hta bai bang u", th: "วางลง Photoshop อีกครั้ง", zh: "再次放入 Photoshop", vi: "Đặt vào Photoshop lần nữa", id: "Tempatkan ke Photoshop lagi", ms: "Letak ke Photoshop sekali lagi" };
  var L_RUN_AGAIN = { my: "ထပ်ထုတ်မယ်", en: "Run again", shn: "ထုတ်ႇထႅင်ႈ", kac: "Bai shaw u", th: "สร้างอีกครั้ง", zh: "再生成一次", vi: "Chạy lại", id: "Jalankan lagi", ms: "Jana lagi" };
  var L_USE_AS_IN = { my: "IMAGE 1 အနေနဲ့ ဆက်သုံးမယ်", en: "Use as IMAGE 1", shn: "ၸႂ်ႉပဵၼ် IMAGE 1", kac: "IMAGE 1 hku lang u", th: "ใช้เป็น IMAGE 1", zh: "作为 IMAGE 1 继续", vi: "Dùng làm IMAGE 1", id: "Pakai sebagai IMAGE 1", ms: "Guna sebagai IMAGE 1" };
  var L_USED_AS_IN = { my: "ရလဒ်ကို IMAGE 1 ထဲ ထည့်ပြီးပါပြီ", en: "The result is now IMAGE 1", shn: "ၽွၼ်းလႆႈပဵၼ် IMAGE 1 ယဝ်ႉ", kac: "Lachyum gaw IMAGE 1 rai sai", th: "ผลลัพธ์กลายเป็น IMAGE 1 แล้ว", zh: "结果已放入 IMAGE 1", vi: "Kết quả đã trở thành IMAGE 1", id: "Hasil kini menjadi IMAGE 1", ms: "Hasil kini menjadi IMAGE 1" };
  var L_OPEN_EDIT = { my: "Edit မှာ ဖွင့်မယ်", en: "Open in Edit", shn: "ပိုတ်ႇတီႈ Edit", kac: "Edit kaw hpaw u", th: "เปิดใน Edit", zh: "在 Edit 中打开", vi: "Mở trong Edit", id: "Buka di Edit", ms: "Buka dalam Edit" };
  var L_REMOVE = { my: "ဖျက်မယ်", en: "Remove", shn: "မွတ်ႇပႅတ်ႈ", kac: "Sa kau u", th: "ลบ", zh: "删除", vi: "Xóa", id: "Hapus", ms: "Buang" };
  var L_BOARD = { my: "ဒီ workflow ရဲ့ ရလဒ်တွေ — အကုန် ဒီမှာ ပြန်ကြည့်လို့ရတယ်", en: "Results from this workflow — every run stays here", shn: "ၽွၼ်းလႆႈ workflow ၼႆႉ — တင်းမူတ်း ၶိုၼ်းတူၺ်းလႆႈတီႈၼႆႈ", kac: "Ndai workflow na result ni — yawng ndai kaw bai yu lu ai", th: "ผลลัพธ์ของเวิร์กโฟลว์นี้ — ทุกครั้งดูย้อนได้ที่นี่", zh: "这个工作流的全部结果 — 每次生成都留在这里", vi: "Kết quả của workflow này — mọi lần chạy đều còn ở đây", id: "Hasil workflow ini — semua tetap di sini", ms: "Hasil aliran kerja ini — semuanya kekal di sini" };
  var L_EARLIER = { my: "Gallery ထဲက အရင်ရလဒ်တွေ ဖွင့်မယ် ({n})", en: "Load earlier results from Gallery ({n})", shn: "ပိုတ်ႇၽွၼ်းလႆႈၵဝ်ႇတီႈ Gallery ({n})", kac: "Gallery na moi na lachyum ni hpaw u ({n})", th: "โหลดผลลัพธ์ก่อนหน้าจาก Gallery ({n})", zh: "载入 Gallery 中的早期结果（{n}）", vi: "Mở kết quả cũ từ Gallery ({n})", id: "Muat hasil lama dari Gallery ({n})", ms: "Muat hasil lama dari Gallery ({n})" };
  var L_SELECTION = { my: "Selection", en: "Selection", shn: "Selection", kac: "Selection", th: "Selection", zh: "选区", vi: "Vùng chọn", id: "Seleksi", ms: "Pilihan" };
  var L_HIST_ALL = { my: "History အကုန် ကြည့်မယ် →", en: "All history →", shn: "History တင်းမူတ်း →", kac: "History yawng →", th: "History ทั้งหมด →", zh: "全部 History →", vi: "Toàn bộ History →", id: "Semua History →", ms: "Semua History →" };

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
    /* 6.167.3 — THE CARDS THE OWNER PHOTOGRAPHED AS MISSING. This file's own UXP note at the top says
       it: "the group body is shown/hidden by style.display". It was not — the body's visibility had come
       to rest on `.apg .app-grp.open .grp-b { display: block }` alone, a cascade override of the plain
       `.grp-b { display: none }`, and in Photoshop that override never won: every group on the Workflows
       page stayed shut, the catalog's own open category included, so all 194 Smart Workflow cards were
       invisible in the panel while the web app drew them. The class still goes on for the caret and the
       border, but what shows the body is an inline display, which no renderer can decline.
       openNow is the truth, never a className read (6.122.0: className is null in UXP). */
    var openNow = !!open;
    body.style.display = openNow ? "block" : "none";
    function isOpen() { return openNow; }
    function setOpen(on) {
      openNow = !!on;
      g.className = on ? "grp app-grp open" : "grp app-grp";
      body.style.display = on ? "block" : "none";
      /* 6.167.0 — a closed .grp-b is display:none and every card in it measures 0, so the clamp marker
         cannot see what was cut until the group opens. Both the header tap and the search filter come
         through here. */
      if (on) { try { var em = globalThis.HNK && globalThis.HNK.ellMark; if (em) em(g, ".wfmini .s", 3); } catch (e) { } }
    }
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
    resSel = null; cmpOpen = false; advOpen = false; optsOpen = false; earlier = []; earlierLoaded = false;   /* v6.83.0 */
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
    wstate.setInput(state, inp.key, { source: slot.source, role: inp.role, ref: slot.ref, valid: slot.valid, reason: slot.reason, detail: slot.detail,
      /* v6.84.0 — the picture's size and, for the Active layer, its name: the tick says what landed */
      width: slot.width || 0, height: slot.height || 0, name: slot.name || "" });
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
        /* v6.84.0 — the Active layer's tick names the layer and its size, so a
           student who pressed "+ Layer" sees WHICH layer Photoshop handed over
           (the owner asked whether the slots really work with the Active layer:
           the slot now answers on its own). Other sources keep the plain tick. */
        var im0 = inp.image || {};
        var tickText = "\u2713";
        if (okk && im0.source === "active-layer") {
          var nm = String(im0.name || "").trim();
          if (nm.length > 22) nm = nm.slice(0, 21) + "\u2026";
          tickText += (nm ? " " + nm : "") + ((im0.width > 0 && im0.height > 0) ? " \u00b7 " + im0.width + "\u00d7" + im0.height : "");
        }
        mark.textContent = okk ? tickText : (failReason || "Missing");
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
    /* v6.83.0 — the Advanced box follows the inputs (a scene preset, a typed request) until the student edits it */
    try { paintPromptLive(); } catch (e) { }
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

  /* 6.168.0 — the marker, reached the way every other call site reaches it. */
  function ellFit(root, sel, lines) {
    try { var f = globalThis.HNK && globalThis.HNK.ellMark; if (f) f(root, sel, lines); } catch (e) { }
  }

  /* 6.168.0 — A REFUSAL THAT NAMES ITSELF. The owner photographed Selection Edit
     refusing 1191×1191 and 1208×1208 on a 16-bit RAW and accepting 3040×3040
     minutes later, with one sentence for all three: "Could not read the selected
     pixels — try again." captureRegion now answers { error, bounds, mode } instead
     of nothing, so the sentence carries the reason, the rectangle and the
     document's own mode — the three facts the next photograph would otherwise
     have had to guess at. */
  function capFail(cap, b) {
    var msg = dom.t("ai_wf_capture_fail", "Could not read the selected pixels \u2014 try again.");
    var bits = [];
    try {
      if (cap && cap.error) bits.push(String(cap.error).slice(0, 140));
      var w = (cap && cap.bounds && cap.bounds.width) || (b && b.width) || 0;
      var h = (cap && cap.bounds && cap.bounds.height) || (b && b.height) || 0;
      if (w > 0 && h > 0) bits.push(Math.round(w) + "\u00d7" + Math.round(h) + " px");
      if (cap && cap.mode) bits.push(String(cap.mode));
    } catch (e) { }
    return bits.length ? msg + " \u2014 " + bits.join(" \u00b7 ") : msg;
  }

  /* ---- 6.168.0 — THE SELECTION, SHOWN. ------------------------------------
     The owner asked three things of Selection Edit in one message: it works
     sometimes and not others, the page is too long, and "selection ဘယ်နားမှတ်
     ထားလဲ ပြလို့ရလား" — can you show me where the selection is.

     This card answers the first and the third, and shortens the page by being
     one block where there were four (the heading, the tick row, the instruction
     paragraph and the Selection row all said one thing). It draws a map of the
     document with the marked rectangle on it — explicit pixels, because a UXP
     box may decline to resolve a percentage — says where that rectangle sits,
     and gives Check a second job: read the pixels there and show them. A
     capture that is going to fail now fails HERE, before the money, naming its
     reason; one that works shows the student exactly what will be sent. */
  function selectionCard(inp) {
    /* it wears hnk-req-block as well as its own class: this card IS the region
       workflow's required-image block, and every walk that counts those blocks
       has to keep finding it. */
    var card = dom.el(doc, "div", { class: "hnk-req-block hnk-sel-card", id: "hnkWfSelCard" });
    var mark = dom.el(doc, "span", { class: "hnk-req-mark ok", text: "\u2713" });
    nodes["req_" + inp.key] = mark;
    card.appendChild(dom.el(doc, "div", { class: "hnk-req-row" }, [
      dom.el(doc, "span", { class: "hnk-req-label", text: slotLabel(inp) }), mark
    ]));

    var body = dom.el(doc, "div", { class: "hnk-sel-body" });
    var map = dom.el(doc, "div", { class: "hnk-sel-map", id: "hnkWfSelMap" });
    var page = dom.el(doc, "div", { class: "hnk-sel-page", id: "hnkWfSelPage" });
    var rect = dom.el(doc, "div", { class: "hnk-sel-rect", id: "hnkWfSelRect" });
    page.appendChild(rect); map.appendChild(page);
    map.style.display = "none";
    var side = dom.el(doc, "div", { class: "hnk-sel-side" });
    var selTxt = dom.el(doc, "span", { class: "hnk-sel-txt", id: "hnkWfSelState", text: l9(L_SEL_CHECKING) });
    var selNum = dom.el(doc, "span", { class: "hnk-sel-num", id: "hnkWfSelNum" });
    side.appendChild(selTxt); side.appendChild(selNum);
    body.appendChild(map); body.appendChild(side);
    card.appendChild(body);

    var shot = dom.el(doc, "div", { class: "hnk-sel-shot", id: "hnkWfSelShot" });
    var shotIm = doc.createElement("img"); shotIm.className = "hnk-sel-thumb"; shotIm.alt = "";
    var shotCap = dom.el(doc, "div", { class: "hnk-sel-cap", id: "hnkWfSelShotCap" });
    shot.appendChild(shotIm); shot.appendChild(shotCap);
    shot.style.display = "none";
    card.appendChild(shot);

    var selBtn = dom.el(doc, "button", { class: "hnk-btn hnk-sel-check", id: "hnkWfSelCheck", text: l9(L_SEL_CHECK) });
    card.appendChild(selBtn);

    nodes.selRow = card; nodes.selTxt = selTxt;
    /* doGenerate's own capture paints this card too — the pixels it read are the
       pixels that went, so the card shows those rather than a second guess */
    nodes.selShow = function (ref, via) {
      try {
        if (!/^data:image\//.test(String(ref || ""))) return;
        shotIm.src = ref; shot.style.display = "";
        shotCap.textContent = l9(L_SEL_PIX) + (via ? " \u00b7 " + via : "");
      } catch (e) { }
    };

    function paintMap(b) {
      var cs = null;
      try { cs = (deps.host && deps.host.canvasSize) ? deps.host.canvasSize() : null; } catch (e) { cs = null; }
      var W = (cs && cs.width > 0) ? cs.width : 0, H = (cs && cs.height > 0) ? cs.height : 0;
      if (!b || !(W > 0 && H > 0)) { map.style.display = "none"; selNum.textContent = ""; return; }
      map.style.display = "";
      var k = Math.min(104 / W, 78 / H);
      var pw = Math.max(16, Math.round(W * k)), ph = Math.max(16, Math.round(H * k));
      page.style.width = pw + "px"; page.style.height = ph + "px";
      var rw = Math.max(3, Math.min(pw, Math.round(b.width * k))), rh = Math.max(3, Math.min(ph, Math.round(b.height * k)));
      rect.style.width = rw + "px"; rect.style.height = rh + "px";
      rect.style.left = Math.max(0, Math.min(pw - rw, Math.round(b.x * k))) + "px";
      rect.style.top = Math.max(0, Math.min(ph - rh, Math.round(b.y * k))) + "px";
      selNum.textContent = l9(L_SEL_POS).replace("{x}", String(b.x)).replace("{y}", String(b.y))
        .replace("{W}", String(W)).replace("{H}", String(H));
    }
    function sayOk(b) {
      card.className = "hnk-req-block hnk-sel-card ok";
      selTxt.textContent = l9(L_SEL_OK).replace("{w}", String(b.width)).replace("{h}", String(b.height));
    }
    var selCheck = function (readPixels) {
      if (!(deps.host && deps.host.getSelectionBounds)) {
        card.className = "hnk-req-block hnk-sel-card"; selTxt.textContent = l9(L_SEL_NOHOST);
        selNum.textContent = ""; map.style.display = "none"; return;
      }
      card.className = "hnk-req-block hnk-sel-card"; selTxt.textContent = l9(L_SEL_CHECKING); selNum.textContent = "";
      var done = function (b) {
        if (!(b && b.width > 0 && b.height > 0)) {
          card.className = "hnk-req-block hnk-sel-card none"; selTxt.textContent = l9(L_SEL_NONE);
          selNum.textContent = ""; map.style.display = "none"; shot.style.display = "none";
          return;
        }
        sayOk(b); paintMap(b);
        if (!readPixels || !deps.host.captureRegion) return;
        selTxt.textContent = l9(L_SEL_READ);
        var bad = function (cap) {
          shot.style.display = "none";
          card.className = "hnk-req-block hnk-sel-card none";
          selTxt.textContent = capFail(cap, b);
        };
        try {
          Promise.resolve(deps.host.captureRegion(b)).then(function (cap) {
            if (cap && cap.ref) { sayOk(b); nodes.selShow(cap.ref, cap.via || ""); }
            else bad(cap);
          }, function (e) { bad({ error: (e && e.message) || String(e) }); });
        } catch (e2) { bad({ error: (e2 && e2.message) || String(e2) }); }
      };
      try { Promise.resolve(deps.host.getSelectionBounds()).then(done, function () { done(null); }); }
      catch (e) { done(null); }
    };
    dom.on(selBtn, "click", function () { selCheck(true); });
    selCheck(false);
    return card;
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
      try { renderResults(); } catch (e) { }   /* v6.83.0 — the History rows carry the run at once */
    };
    /* v6.36.0 — Selection Edit: capture the live rectangular selection as
       the subject at Generate time. The result is placed back at these exact
       bounds with a layer mask cut from the same rectangle, so pixels
       outside the selection are untouched by construction. */
    if (wf && wf.region && deps.host && deps.host.getSelectionBounds) {
      var rb = null;
      Promise.resolve(deps.host.getSelectionBounds()).then(function (b) {
        rb = b;
        if (!b) { hint(dom.t("ai_wf_select_first", "Make a rectangular selection in Photoshop first, then press GENERATE.")); return; }
        return Promise.resolve(deps.host.captureRegion(b)).then(function (cap) {
          /* 6.168.0 — the refusal carries captureRegion's own reason, the rectangle
             it was asked for and the document's mode (capFail), in place of one
             sentence that fitted every failure equally badly. */
          if (!cap || !cap.ref) { hint(capFail(cap, b)); return; }
          if (state.requiredInputs[0]) state.requiredInputs[0].image = { source: "selection", role: state.requiredInputs[0].role, ref: cap.ref, valid: true,
            width: cap.width || b.width, height: cap.height || b.height };
          state.regionBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
          /* v6.84.0 — the slot shows the pixels that were just read, before the run */
          try { refresh(); } catch (eR) { }
          try { if (nodes.selShow) nodes.selShow(cap.ref, cap.via || ""); } catch (eS) { }
          fire();
        });
      }).catch(function (e) { hint(capFail({ error: (e && e.message) || String(e) }, rb)); });
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
    dom.on(back, "click", function () { unsubscribeResults(); wstate.reset(state); renderList(); });
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
    /* Click 1 — explanation + expected result.
       6.168.0 — THREE LINES AND A "MORE". The owner photographed Selection Edit
       and said the page was too long to hold ("ui ux \u1000 \u101b\u103e\u100a\u103a\u101c\u103d\u1014\u103a\u1038\u1010\u101a\u103a"). This
       paragraph is the tallest block above the fold and is read once; it now
       opens to three lines with the rest one tap away. The cut is the marker's
       own word-cut (6.167.4), so it is a real cut in Photoshop too, and the
       whole sentence is kept here so "More" can put it back. */
    var descTxt = dom.t(registry.explanationKey(wf.id), wf.explanation);
    var desc = dom.el(doc, "div", { class: "hnk-wf-desc hnk-wf-about is-clamp", id: "hnkWfDesc", text: descTxt });
    root.appendChild(desc);
    var descMore = dom.el(doc, "button", { class: "hnk-btn hnk-wf-more", id: "hnkWfDescMore", text: l9(L_MORE) });
    root.appendChild(descMore);
    var descOpen = false;
    var paintDesc = function () {
      desc.textContent = descTxt;
      desc.className = "hnk-wf-desc hnk-wf-about" + (descOpen ? "" : " is-clamp");
      if (!descOpen) ellFit(root, ".hnk-wf-about", 3);
      /* a paragraph that fitted was never cut, so it gets no "More" to press */
      descMore.style.display = (descOpen || desc.querySelector(".ell")) ? "" : "none";
      descMore.textContent = l9(descOpen ? L_LESS : L_MORE);
    };
    dom.on(descMore, "click", function () { descOpen = !descOpen; paintDesc(); });
    paintDesc();

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
        var row = dom.el(doc, "div", { class: "hnk-wf-field" + (f.type === "text" ? " is-text" : "") });   /* 6.164.0 — a typed line is a column */
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
          if (f.max) ti.setAttribute("maxlength", String(f.max));   /* 6.164.0 — the same ceiling the app's wizard sets */
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

    /* 6.168.0 — a region workflow has ONE required image and it IS the selection,
       so the "Required Images" heading, the tick row under it, the instruction
       paragraph and the Selection row all said one thing four times. One card
       says it once, with a picture (selectionCard). */
    if (!wf.region) root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_req_images", "Required Images") }));
    var reqWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
    state.requiredInputs.forEach(function (inp) {
      /* v6.36.0 — a region workflow's photo comes from the live rectangular
         selection at Generate time: no source buttons, just the slot. */
      if (wf.region && inp.image && inp.image.source === "selection") reqWrap.appendChild(selectionCard(inp));
      else reqWrap.appendChild(inputRow(inp));
    });
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
    /* v6.83.0 — the app's step-3 "Advanced — edit the prompt (optional)" */
    renderAdvanced(root, wf);
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

    /* 6.168.2 — the run strip (queued -> uploading -> generating -> downloading ->
       placing, then the green "it is in the group as a Layer + Mask" sentence) lands
       HERE, right under the button that starts it. It used to be appended to the
       mount root, which is the bottom of the page, below the Results card and the
       History link — the owner: "put it next to the Generate button, it is pointless
       down there, I have to scroll all the way down to look at it". The strip is
       display:none until a run starts, so an idle page is not a pixel taller. */
    root.appendChild(dom.el(doc, "div", { class: "hnk-run-here", id: "hnkRunHere" }));

    /* v6.83.0 — Results · Before | After · History, under GENERATE where the
       result lands (the owner's photographs: "Done." and nothing to look at) */
    nodes.results = dom.el(doc, "div", { class: "hnk-wf-results", id: "hnkWfResults" });
    root.appendChild(nodes.results);
    renderResults();
    subscribeResults(wf.id);

    refresh();
  }

  /* ---- v6.83.0 — THE ADVANCED PROMPT BOX. The app's wizard shows the whole
     prompt it will send in a collapsible textarea (step 3); the panel sent
     its compiled prompt unseen. The box shows the live compiled text —
     protected prompt, design fields, USER REQUEST, SCENE PRESET — and the
     moment the student changes it, their text is what the compiler sends
     (state.promptOverride). Reset returns to the live prompt. ---- */
  function livePrompt() {
    try {
      var c = compiler.compile(Object.assign({}, state, { promptOverride: "" }));
      return (c && c.compiledPrompt) || "";
    } catch (e) { return ""; }
  }
  function paintPromptState() {
    if (!nodes.promptState) return;
    var edited = !!(state.promptOverride && String(state.promptOverride).trim());
    nodes.promptState.textContent = edited ? l9(L_PROMPT_EDITED) : l9(L_PROMPT_LIVE);
    nodes.promptState.className = "hnk-wf-prompt-state" + (edited ? " edited" : "");
    if (nodes.promptReset) nodes.promptReset.style.display = edited ? "" : "none";
  }
  function paintPromptLive() {
    var ta = nodes.promptTa;
    if (!ta) return;
    if (!(state.promptOverride && String(state.promptOverride).trim())) {
      var live = livePrompt(), focused = false;
      try { focused = doc.activeElement === ta; } catch (e) { }
      if (!focused && ta.value !== live) ta.value = live;
    }
    paintPromptState();
  }
  function renderAdvanced(root, wf) {
    var head = dom.el(doc, "button", { class: "hnk-btn hnk-wf-adv-h", id: "hnkWfAdvH", text: "\u2699 Advanced \u2014 " + l9(L_ADV) });
    var body = dom.el(doc, "div", { class: "hnk-wf-adv-b" + (advOpen ? " on" : ""), id: "hnkWfAdvB" });
    body.appendChild(dom.el(doc, "p", { class: "mut", text: dom.t("wiz_promptnote", "The workflow's protected prompt is pre-filled \u2014 add anything extra (e.g. what background/text you want) at the top.") }));
    var ta = dom.el(doc, "textarea", { class: "hnk-inp hnk-wf-prompt", id: "hnkWfPrompt" });
    ta.value = (state.promptOverride && String(state.promptOverride).trim()) ? state.promptOverride : livePrompt();
    dom.on(ta, "input", function () {
      var v = ta.value;
      if (v === livePrompt()) wstate.setPromptOverride(state, "");
      else wstate.setPromptOverride(state, v);
      paintPromptState();
    });
    body.appendChild(ta);
    var row = dom.el(doc, "div", { class: "hnk-wf-prompt-row" });
    var reset = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfPromptReset", text: "\u21BA " + l9(L_PROMPT_RESET) });
    dom.on(reset, "click", function () { wstate.setPromptOverride(state, ""); ta.value = livePrompt(); paintPromptState(); });
    var st = dom.el(doc, "span", { class: "hnk-wf-prompt-state", id: "hnkWfPromptState" });
    row.appendChild(reset); row.appendChild(st);
    body.appendChild(row);
    dom.on(head, "click", function () {
      advOpen = !advOpen;
      body.className = "hnk-wf-adv-b" + (advOpen ? " on" : "");
      if (advOpen) paintPromptLive();
    });
    nodes.promptTa = ta; nodes.promptState = st; nodes.promptReset = reset;
    root.appendChild(head); root.appendChild(body);
    paintPromptState();
  }

  /* ---- v6.83.0 — RESULTS · BEFORE | AFTER · HISTORY. HNK.wfResults holds
     every result of the session (bootstrap records them as they land); the
     card shows the chosen one — newest by default — with the actions a
     student needs next: compare with IMAGE 1, place it again, run again,
     chain it as IMAGE 1, open it in Edit (Freeform), remove it; a board of
     this workflow's runs (plus earlier ones from the gallery folder, on
     request); and the sanitized History rows of this workflow. ---- */
  function wr() { return (globalThis.HNK && globalThis.HNK.wfResults) || null; }
  function bootHandle() { return (globalThis.HNK && globalThis.HNK.aiToolsBoot) || null; }
  function subscribeResults(wfId) {
    unsubscribeResults();
    var w = wr(); if (!w) return;
    unsubResults = w.subscribe(function () {
      if (state.workflowId !== wfId || !nodes.results) return;
      resSel = null;   /* a new result is the one to look at */
      renderResults();
    });
  }
  function unsubscribeResults() { if (unsubResults) { try { unsubResults(); } catch (e) { } unsubResults = null; } }
  function fmtTime(ts) {
    try { var d = new Date(ts); var h = d.getHours(), m = d.getMinutes(); return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; } catch (e) { return ""; }
  }
  function setCmp(v) {
    var pct = Math.max(0, Math.min(100, Number(v) || 0));
    cmpPos = pct;
    if (nodes.cmpTop) nodes.cmpTop.style.width = pct + "%";
    if (nodes.cmpLine) nodes.cmpLine.style.left = pct + "%";
    /* the Before picture stays the full box width inside a box pct% wide:
       100/pct of its frame — 6.78.0's Imagine rule; UXP has no ruler to hand
       it a pixel width */
    if (nodes.cmpBefore) nodes.cmpBefore.style.width = (pct > 0 ? (10000 / pct) : 100) + "%";
  }
  function renderResults() {
    var host = nodes.results; if (!host) return;
    var wf = registry.get(state.workflowId); if (!wf) return;
    dom.clear(host);
    var w = wr();
    var all = w ? w.list(wf.id) : [];
    var sel = null, i;
    if (resSel) {
      for (i = 0; i < all.length; i++) if (all[i].id === resSel) sel = all[i];
      if (!sel) for (i = 0; i < earlier.length; i++) if (earlier[i].id === resSel) sel = earlier[i];
    }
    if (!sel) sel = all[0] || null;
    host.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: l9(L_RESULTS) }));
    nodes.cmpTop = nodes.cmpLine = nodes.cmpBefore = null;
    if (!sel) {
      host.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc", id: "hnkWfResultsEmpty", text: l9(L_RES_EMPTY) }));
    } else {
      var im = doc.createElement("img");
      im.className = "hnk-wf-result-img"; im.id = "hnkWfResultImg"; im.alt = wf.title + " \u2014 result"; im.src = sel.after;
      host.appendChild(im);
      var mdl = sel.model ? (modelRegistry.getModel(sel.model) || { displayName: sel.model }).displayName : "";
      /* v6.84.0 — a Selection Edit result names its rectangle */
      var rb = sel.regionBounds;
      var meta = [sel.timeLabel || (sel.ts ? fmtTime(sel.ts) : ""), mdl, sel.size ? String(sel.size).toUpperCase() : "", sel.ratio,
        rb ? (l9(L_SELECTION) + " " + rb.width + "\u00d7" + rb.height) : "", sel.promptEdited ? "\u270E" : ""].filter(Boolean).join(" \u00b7 ");
      if (meta) host.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc", id: "hnkWfResultMeta", text: meta }));
      if (!sel.fromGallery) host.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc", id: "hnkWfResultSaved", text: l9(L_SAVED) }));
      var acts = dom.el(doc, "div", { class: "hnk-wf-res-acts", id: "hnkWfResActs" });
      var hasBefore = !!sel.before;
      if (hasBefore) {
        var cmpB = dom.el(doc, "button", { class: "hnk-btn" + (cmpOpen ? " on" : ""), id: "hnkWfCmpBtn", text: "Before/After" });
        dom.on(cmpB, "click", function () { cmpOpen = !cmpOpen; renderResults(); });
        acts.appendChild(cmpB);
      }
      var place = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfPlaceAgain", text: l9(L_PLACE_AGAIN) });
      dom.on(place, "click", function () { var h = bootHandle(); if (h && h.placeResult) h.placeResult(sel.after, wf.id, sel.model, sel.regionBounds || null); });
      acts.appendChild(place);
      var again = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfRunAgain", text: l9(L_RUN_AGAIN) });
      dom.on(again, "click", function () { doGenerate(); });
      acts.appendChild(again);
      if (state.requiredInputs && state.requiredInputs[0] && !wf.region) {
        var use = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfUseAsInput", text: l9(L_USE_AS_IN) });
        dom.on(use, "click", function () {
          var slot0 = state.requiredInputs[0];
          wstate.setInput(state, slot0.key, { source: "result", role: slot0.role, ref: sel.after, valid: true });
          refresh();
          toast(l9(L_USED_AS_IN), "ok");
        });
        acts.appendChild(use);
      }
      var edit = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfToFreeform", text: l9(L_OPEN_EDIT) });
      dom.on(edit, "click", function () { var f = globalThis.HNK && globalThis.HNK.wfToFreeform; if (f) f(sel.before, sel.after); });
      acts.appendChild(edit);
      if (!sel.fromGallery) {
        var del = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfResultDel", text: "\u2715 " + l9(L_REMOVE) });
        dom.on(del, "click", function () { if (w) w.remove(sel.id); });   /* the subscription repaints */
        acts.appendChild(del);
      }
      host.appendChild(acts);
      if (hasBefore && cmpOpen) {
        var wrap = dom.el(doc, "div", { class: "hnk-wf-cmp", id: "hnkWfCmpWrap" });
        var box = dom.el(doc, "div", { class: "cmp", id: "hnkWfCmpBox" });
        var after = doc.createElement("img"); after.id = "hnkWfImgAfter"; after.alt = "after"; after.src = sel.after;
        var top = dom.el(doc, "div", { class: "cmp-top", id: "hnkWfCmpTop" });
        var before = doc.createElement("img"); before.id = "hnkWfImgBefore"; before.alt = "before"; before.src = sel.before;
        top.appendChild(before);
        var line = dom.el(doc, "div", { class: "cmp-line", id: "hnkWfCmpLine" });
        box.appendChild(after); box.appendChild(top); box.appendChild(line);
        wrap.appendChild(box);
        var range = dom.el(doc, "input", { id: "hnkWfCmpRange", attrs: { type: "range", min: "0", max: "100", value: String(cmpPos) } });
        dom.on(range, "input", function () { setCmp(range.value); });
        dom.on(range, "change", function () { setCmp(range.value); });
        wrap.appendChild(range);
        wrap.appendChild(dom.el(doc, "div", { class: "hnk-wf-cmp-tags" }, [
          dom.el(doc, "span", { id: "hnkWfCmpTagBefore", text: "\u2190 Before (" + (sel.inputSource === "selection" || sel.regionBounds ? l9(L_SELECTION) : "IMAGE 1") + ")" }),
          dom.el(doc, "span", { text: "After \u2192" })]));
        nodes.cmpTop = top; nodes.cmpLine = line; nodes.cmpBefore = before;
        host.appendChild(wrap);
        setCmp(cmpPos);
      }
    }
    /* the board: this workflow's runs this session, then the earlier ones read from the gallery folder */
    var items = all.concat(earlier);
    if (items.length > 1) {
      host.appendChild(dom.el(doc, "div", { class: "subh", text: l9(L_BOARD) }));
      var board = dom.el(doc, "div", { class: "hnk-wf-board", id: "hnkWfBoard" });
      items.slice(0, 24).forEach(function (e, idx) {
        var th = dom.el(doc, "div", { class: "hnk-wf-board-th" + (sel && e.id === sel.id ? " on" : ""), attrs: { role: "button", tabindex: "0", "data-id": e.id } });
        if ((idx + 1) % 3 === 0) th.style.marginRight = "0";
        var ti = doc.createElement("img"); ti.alt = ""; ti.src = e.after; th.appendChild(ti);
        dom.on(th, "click", function () { resSel = e.id; renderResults(); });
        board.appendChild(th);
      });
      host.appendChild(board);
    }
    renderEarlierDoor(host, wf, all);
    renderWfHistory(host, wf);
  }
  /* the gallery folder keeps every result across restarts (6.46.0); the door
     lists this workflow's files and reads at most twelve, only when asked —
     a result is a multi-megabyte PNG. Files the session already shows are
     skipped by their timestamp. */
  function renderEarlierDoor(host, wf, sessionList) {
    var gs = globalThis.HNK && globalThis.HNK.galleryStore;
    if (!gs || !gs.listFor || earlierLoaded) return;
    var door = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfEarlier", text: l9(L_EARLIER).replace("{n}", "\u2026") });
    door.style.display = "none";
    host.appendChild(door);
    var oldest = 0;
    (sessionList || []).forEach(function (e) { if (e.ts && (!oldest || e.ts < oldest)) oldest = e.ts; });
    Promise.resolve(gs.listFor(wf.id)).then(function (files) {
      files = (files || []).filter(function (f) {
        var m = /-(\d+)\.[a-z0-9]+$/i.exec(String(f && f.name || ""));
        return !(oldest && m && Number(m[1]) >= oldest - 5000);
      });
      if (!files.length || state.workflowId !== wf.id) return;
      door.textContent = l9(L_EARLIER).replace("{n}", String(files.length));
      door.style.display = "";
      dom.on(door, "click", function () {
        door.className = "hnk-btn is-busy";
        Promise.all(files.slice(0, 12).map(function (f) {
          return Promise.resolve(gs.readDataUrl(f.name)).then(function (ref) {
            return ref ? { id: "g:" + f.name, after: ref, before: "", fromGallery: true, ts: 0, timeLabel: "", model: "", ratio: "", size: "", name: f.name } : null;
          });
        })).then(function (list) { earlier = list.filter(Boolean); earlierLoaded = true; renderResults(); });
      });
    }).catch(function () { });
  }
  function renderWfHistory(host, wf) {
    var h = bootHandle(); var svc = h && h.services && h.services.history;
    var rows = [];
    try { rows = (svc ? svc.list() : []).filter(function (e) { return e && e.mode === "smart-workflow" && e.workflowId === wf.id; }); } catch (e) { rows = []; }
    host.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_history", "History") }));
    var wrap = dom.el(doc, "div", { class: "hnk-wf-hist", id: "hnkWfHistory" });
    if (!rows.length) wrap.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc", id: "hnkWfHistoryEmpty", text: dom.t("ai_no_gen", "No generations yet.") }));
    rows.slice(0, 8).forEach(function (e, i) {
      var card = dom.el(doc, "div", { class: "hnk-hist", id: "hnkWfHist_" + i });
      card.appendChild(dom.el(doc, "div", { class: "hnk-hist-meta", text: [e.timeLabel, e.modelName, e.size, e.ratio].filter(Boolean).join(" \u00b7 ") || e.badge || "WORKFLOW" }));
      var acts = dom.el(doc, "div", { class: "hnk-hist-actions" });
      var rr = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfHistRerun_" + i, text: dom.t("ai_rerun", "Re-run") });
      dom.on(rr, "click", function () { doGenerate(); });
      acts.appendChild(rr); card.appendChild(acts); wrap.appendChild(card);
    });
    if (rows.length) {
      var allB = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfHistAll", text: l9(L_HIST_ALL) });
      dom.on(allB, "click", function () { var app = globalThis.HNK && globalThis.HNK.aiToolsApp; if (app && app.navigate) app.navigate("history"); });
      wrap.appendChild(allB);
    }
    host.appendChild(wrap);
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
    /* 6.168.0 — THE FOUR PICKERS FOLD. Model, Ratio, Count and Size are four full
       rows — the tallest block on a page the owner photographed as too long — and
       on most runs a student changes none of them. The header now carries what
       they are SET TO, so nothing is hidden from the eye, only from the scroll,
       and one tap opens the rows exactly as they were. */
    var optsHead = dom.el(doc, "button", { class: "hnk-btn hnk-wf-opts-h", id: "hnkWfOptsH" });
    var box = dom.el(doc, "div", { class: "hnk-wf-opts" + (optsOpen ? " on" : ""), id: "hnkWfOpts" });
    root.appendChild(optsHead);

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
      paintOptsHead();
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
    function optsSummary() {
      var parts = [];
      try {
        /* the picker's own row reads "Auto — the workflow's choice"; a header is
           not the place for the whole sentence */
        parts.push(mp.sel.value ? String((mp.sel.options[mp.sel.selectedIndex] || {}).text || "")
          : dom.t("qual_auto", "Auto"));
        if (rp.sel.value) parts.push(String(rp.sel.value));
        if (sp.sel.value) parts.push(String(sp.sel.value).toUpperCase());
        var n = parseInt(cp.sel.value, 10) || 1;
        if (n > 1) parts.push("\u00d7" + n);
      } catch (e) { }
      return parts.join(" \u00b7 ");
    }
    function paintOptsHead() {
      var sum = optsSummary();
      optsHead.textContent = dom.t("wf_opts", "Model \u00b7 Ratio \u00b7 Count \u00b7 Size") + (sum ? " \u2014 " + sum : "");
    }
    nodes.optsHead = paintOptsHead;
    dom.on(optsHead, "click", function () {
      optsOpen = !optsOpen;
      box.className = "hnk-wf-opts" + (optsOpen ? " on" : "");
      /* the rail measures what it paints, and a closed box measures nothing */
      if (optsOpen) { try { paintRail(); } catch (e) { } }
    });
    /* the rail paints by id, so the box is in the document first */
    fillForModel(modelId);
    paintOptsHead();
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

  /* 6.167.4 — THE NUMBER THE PROMPTS SPEAK. The web app names every wizard slot
     "IMAGE 1 \u2014 Your Photo (Subject)", "IMAGE 2 \u2014 New Background"; the panel
     named them by their words alone. Every prompt in the catalog refers to its inputs
     BY NUMBER \u2014 "IMAGE 2 \u1000 \u1019\u103b\u1000\u103a\u1014\u103e\u102c" \u2014 so a student reading the card had no way to tell
     which box a sentence meant, and the owner read the second slot as missing.
     The order is the app's own: required first, then optional. */
  function slotNo(inp) {
    try {
      var all = (state.requiredInputs || []).concat(state.optionalInputs || []);
      for (var i = 0; i < all.length; i++) if (all[i] === inp || (all[i] && inp && all[i].key === inp.key)) return i + 1;
    } catch (e) { }
    return 0;
  }
  function slotLabel(inp) {
    var lbl = dom.t(registry.inputLabelKey(inp.label) || "", inp.label);
    var n = slotNo(inp);
    if (!n) return lbl;
    /* a few catalog labels already carry their own "(IMAGE 1)" — say the number once */
    lbl = lbl.replace(/\s*\(IMAGE\s*\d+\)\s*$/i, "");
    return "IMAGE " + n + " \u2014 " + lbl;
  }

  function inputRow(inp) {
    var mark = dom.el(doc, "span", { class: "hnk-req-mark miss", text: dom.t("ai_missing", "Missing") });
    nodes["req_" + inp.key] = mark;
    var lbl = slotLabel(inp);
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
    /* 6.167.0 — the clamp marker (main.js ellMark, the app's own 6.96.0 pass): a card description that
       overflows its three-line ceiling ends in "…" instead of simply stopping. Runs after the grid is in
       the page, because nothing measures before it is mounted. */
    try {
      var em = globalThis.HNK && globalThis.HNK.ellMark;
      if (em) em(root, ".wfmini .s", 3);
    } catch (e) { }
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
