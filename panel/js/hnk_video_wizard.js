/* ============================================================
   HNK video wizard words — LIFTED, do not edit by hand.
   Source of truth: the web app's own VWIZ_DATA block (docs/app/index.html),
   copied verbatim by tools/build_panel_video_wizard.js so the panel's
   step-by-step video wizard reads exactly what the app's reads.
   ============================================================ */
(function () {
"use strict";

function _lang() {
  try {
    var b = globalThis.HNK && globalThis.HNK.i18n;
    return (b && typeof b.lang === "function") ? b.lang() : "en";
  } catch (e) { return "en"; }
}
function tr(m) {
  if (m == null) return "";
  if (typeof m === "string") return m;
  var k = _lang();
  return (m[k] != null) ? m[k] : (m.en != null ? m.en : "");
}

/* ---- VWIZ_DATA ---- v6.14.0 — the step-by-step video wizard's words.
   Owner: "make the image-to-video and video-to-video workflows step by step,
   1 2 3 4, with guides, like the image Smart Workflow cards, so students find
   them easy". Every line a student reads in the wizard lives here, in the nine
   languages, and tools/build_panel_video_wizard.js lifts this block into
   panel/js/hnk_video_wizard.js verbatim — the panel never retypes a word. */
var VWIZ_DOTS=["Guide","Inputs","Generate","Result"];
var VWIZ_L={
  start:{my:"စလိုက်မယ်",en:"Start",shn:"တႄႇ",kac:"Hpang u",th:"เริ่ม",zh:"开始",vi:"Bắt đầu",id:"Mulai",ms:"Mula"},
  next:{my:"ရှေ့ဆက်",en:"Next",shn:"သိုပ်ႇ",kac:"Matut",th:"ถัดไป",zh:"下一步",vi:"Tiếp",id:"Lanjut",ms:"Seterusnya"},
  back:{my:"နောက်ပြန်",en:"Back",shn:"ၶိုၼ်း",kac:"Hpang de",th:"ย้อนกลับ",zh:"上一步",vi:"Quay lại",id:"Kembali",ms:"Kembali"},
  close:{my:"ပိတ်မယ်",en:"Close",shn:"ႁပ်း",kac:"Pat u",th:"ปิด",zh:"关闭",vi:"Đóng",id:"Tutup",ms:"Tutup"},
  gen:{my:"GENERATE — ဗီဒီယို ထုတ်မယ်",en:"GENERATE — make the video",shn:"GENERATE — ႁဵတ်းဝီဒီရူဝ်ႈ",kac:"GENERATE — video galaw u",th:"GENERATE — สร้างวิดีโอ",zh:"GENERATE — 生成视频",vi:"GENERATE — tạo video",id:"GENERATE — buat video",ms:"GENERATE — jana video"},
  pickPhoto:{my:"ပုံ ရွေးမယ်",en:"Pick a photo",shn:"လိူၵ်ႈၶႅပ်း",kac:"Sumla lata u",th:"เลือกรูป",zh:"选择照片",vi:"Chọn ảnh",id:"Pilih foto",ms:"Pilih foto"},
  pickVideo:{my:"ဗီဒီယို ရွေးမယ်",en:"Pick a video",shn:"လိူၵ်ႈဝီဒီရူဝ်ႈ",kac:"Video lata u",th:"เลือกวิดีโอ",zh:"选择视频",vi:"Chọn video",id:"Pilih video",ms:"Pilih video"},
  replace:{my:"ပြောင်းမယ်",en:"Replace",shn:"လႅၵ်ႈ",kac:"Galai u",th:"เปลี่ยน",zh:"更换",vi:"Thay",id:"Ganti",ms:"Tukar"},
  clear:{my:"ဖယ်မယ်",en:"Remove",shn:"ဢဝ်ဢွၵ်ႇ",kac:"Shaw kau",th:"ลบออก",zh:"移除",vi:"Bỏ",id:"Hapus",ms:"Buang"},
  req:{my:"လိုအပ်",en:"Required",shn:"လူဝ်ႇ",kac:"Ra ai",th:"จำเป็น",zh:"必需",vi:"Bắt buộc",id:"Wajib",ms:"Wajib"},
  opt:{my:"ထည့်ချင်မှ ထည့်",en:"Optional",shn:"သင်ႇလႆႈ",kac:"Nkau",th:"ไม่บังคับ",zh:"可选",vi:"Tuỳ chọn",id:"Opsional",ms:"Pilihan"},
  slotPhoto:{my:"ကိုယ့်ပုံ",en:"Your photo",shn:"ၶႅပ်းၸဝ်ႈၵဝ်ႇ",kac:"Na a sumla",th:"รูปของคุณ",zh:"你的照片",vi:"Ảnh của bạn",id:"Fotomu",ms:"Foto anda"},
  slotVideo:{my:"ကိုယ့်ဗီဒီယို",en:"Your video",shn:"ဝီဒီရူဝ်ႈၸဝ်ႈၵဝ်ႇ",kac:"Na a video",th:"วิดีโอของคุณ",zh:"你的视频",vi:"Video của bạn",id:"Videomu",ms:"Video anda"},
  slotRef:{my:"ကိုးကားပုံ (မျက်နှာ/ဇာတ်ကောင်)",en:"Reference photo (face / character)",shn:"ၶႅပ်းဢိင် (ၼႃႈ)",kac:"Reference sumla (myiman)",th:"รูปอ้างอิง (หน้า/ตัวละคร)",zh:"参考照片（面部/角色）",vi:"Ảnh tham chiếu (mặt / nhân vật)",id:"Foto referensi (wajah / karakter)",ms:"Foto rujukan (wajah / watak)"},
  needInputs:{my:"⚠ လိုအပ်တဲ့ ဖိုင်တွေ အရင် ထည့်ပါ",en:"⚠ Add the required files first",shn:"⚠ သႂ်ႇၾၢႆႇဢၼ်လူဝ်ႇ ဢွၼ်တၢင်း",kac:"⚠ Ra ai file ni hpe shawng bang u",th:"⚠ ใส่ไฟล์ที่จำเป็นก่อน",zh:"⚠ 请先添加必需的文件",vi:"⚠ Thêm các tệp bắt buộc trước",id:"⚠ Tambahkan file wajib dulu",ms:"⚠ Tambah fail yang wajib dahulu"},
  ready:{my:"အသင့်ပါပြီ — အောက်က ခလုတ်ကို နှိပ်ပါ",en:"Ready — press the button below",shn:"ႁၢင်ႈႁႅၼ်းယဝ်ႉ — ၼဵၵ်းပုမ်တႂ်ႈၼႆႉ",kac:"Hkyen da sai — npu na button dip u",th:"พร้อมแล้ว — กดปุ่มด้านล่าง",zh:"准备好了 — 按下面的按钮",vi:"Sẵn sàng — nhấn nút bên dưới",id:"Siap — tekan tombol di bawah",ms:"Sedia — tekan butang di bawah"},
  viewPrompt:{my:"Prompt အပြည့် ကြည့်မယ်",en:"View the full request",shn:"တူၺ်း prompt တင်းမူတ်း",kac:"Prompt yawng yu u",th:"ดูคำขอฉบับเต็ม",zh:"查看完整请求",vi:"Xem toàn bộ yêu cầu",id:"Lihat permintaan lengkap",ms:"Lihat permintaan penuh"},
  noPrompt:{my:"ဒီကတ်က prompt မလိုပါ — tool က သူ့အလုပ် တစ်ခုတည်း လုပ်ပေးမယ်",en:"This card needs no request — the tool does its one job",shn:"ၵၢတ်ႈၼႆႉ ဢမ်ႇလူဝ်ႇ prompt",kac:"Ndai card gaw prompt n ra ai",th:"การ์ดนี้ไม่ต้องใช้ prompt — เครื่องมือทำงานของมันอย่างเดียว",zh:"这张卡不需要 prompt — 工具只做它那一件事",vi:"Thẻ này không cần prompt — công cụ chỉ làm một việc của nó",id:"Kartu ini tak perlu prompt — alatnya melakukan satu tugasnya",ms:"Kad ini tidak perlu prompt — alat melakukan satu tugasnya"},
  toolLine:{my:"Tool",en:"Tool",shn:"Tool",kac:"Tool",th:"เครื่องมือ",zh:"工具",vi:"Công cụ",id:"Alat",ms:"Alat"},
  running:{my:"ထုတ်နေပါတယ် — ဒီစာမျက်နှာကို ဖွင့်ထားပါ",en:"Generating — keep this page open",shn:"တိုၵ်ႉႁဵတ်းယူႇ — ပိုတ်ႇၼႃႈလိၵ်ႈဝႆႉ",kac:"Galaw taw nga ai — ndai page hpaw da u",th:"กำลังสร้าง — เปิดหน้านี้ไว้",zh:"正在生成 — 请保持此页打开",vi:"Đang tạo — giữ trang này mở",id:"Sedang dibuat — biarkan halaman ini terbuka",ms:"Sedang dijana — biarkan halaman ini terbuka"},
  done:{my:"ပြီးပါပြီ — ကိုယ့်ဗီဒီယိုပါ",en:"Done — here is your video",shn:"ယဝ်ႉယဝ်ႈ — ဝီဒီရူဝ်ႈၸဝ်ႈၵဝ်ႇ",kac:"Ngut sai — na a video",th:"เสร็จแล้ว — นี่คือวิดีโอของคุณ",zh:"完成 — 这是你的视频",vi:"Xong — đây là video của bạn",id:"Selesai — ini videomu",ms:"Selesai — inilah video anda"},
  failed:{my:"မထွက်လာပါ — အောက်က အကြောင်းပြချက် ကြည့်ပြီး ပြန်စမ်းပါ",en:"Nothing came back — read the note below and try again",shn:"ဢမ်ႇမီးလွင်ႈဢွၵ်ႇမႃး — ၶိုၼ်းၸၢမ်း",kac:"Hpa n pru wa ai — bai chyam yu u",th:"ไม่มีผลลัพธ์ — อ่านข้อความด้านล่างแล้วลองอีกครั้ง",zh:"没有结果 — 查看下方说明后重试",vi:"Không có kết quả — đọc ghi chú bên dưới rồi thử lại",id:"Tidak ada hasil — baca catatan di bawah lalu coba lagi",ms:"Tiada hasil — baca nota di bawah dan cuba lagi"},
  download:{my:"Download",en:"Download",shn:"Download",kac:"Download",th:"ดาวน์โหลด",zh:"下载",vi:"Tải về",id:"Unduh",ms:"Muat turun"},
  again:{my:"နောက်တစ်ခု ထုတ်မယ်",en:"Make another",shn:"ႁဵတ်းထႅင်ႈဢၼ်ၼိုင်ႈ",kac:"Langai bai galaw u",th:"ทำอีกอัน",zh:"再做一个",vi:"Làm cái khác",id:"Buat lagi",ms:"Buat lagi"},
  onPage:{my:"စာမျက်နှာပေါ်မှာ ကြည့်မယ်",en:"See it on the page",shn:"တူၺ်းၼိူဝ်ၼႃႈလိၵ်ႈ",kac:"Page ntsa yu u",th:"ดูบนหน้า",zh:"在页面上查看",vi:"Xem trên trang",id:"Lihat di halaman",ms:"Lihat pada halaman"},
  fast:{my:"ဖိုင်တွေ ရှိပြီးသား — Generate ကို တန်းသွားမယ်",en:"Files already in place — skip to Generate",shn:"ၾၢႆႇမီးယဝ်ႉ — ၵႂႃႇ Generate",kac:"File ni nga sai — Generate de rai u",th:"มีไฟล์แล้ว — ข้ามไป Generate",zh:"文件已就位 — 直接到 Generate",vi:"Đã có tệp — chuyển thẳng tới Generate",id:"File sudah ada — langsung ke Generate",ms:"Fail sudah ada — terus ke Generate"},
  engine:{my:"RunningHub engine · card ရဲ့ prompt {C} လုံး",en:"RunningHub engine · the card's request, {C} chars",shn:"RunningHub engine · prompt {C} တူဝ်",kac:"RunningHub engine · prompt {C} chars",th:"เอนจิน RunningHub · คำขอของการ์ด {C} ตัวอักษร",zh:"RunningHub 引擎 · 卡片请求 {C} 字",vi:"Engine RunningHub · yêu cầu của thẻ {C} ký tự",id:"Engine RunningHub · permintaan kartu {C} karakter",ms:"Enjin RunningHub · permintaan kad {C} aksara"}
};
/* the four guide lines, per deck; {N} is the card's own need badge */
var VWIZ_STEPS={
  i2v:{
    my:["ပုံ ၁ ပုံ တင်ပါ — {N}","ကတ်က prompt၊ model၊ အရွယ်၊ ကြာချိန် အကုန် ချထားပေးပြီ — ပြင်ချင်ရင် ပြင်လို့ရတယ်","GENERATE နှိပ်ပါ — ဗီဒီယို ထွက်လာဖို့ ၁–၃ မိနစ် ကြာမယ်","ရလဒ်ကို ကြည့်၊ Download လုပ် — Gallery ထဲမှာလည်း သိမ်းပေးထားမယ်"],
    en:["Add one photo — {N}","The card has set the request, model, size and length — change them if you like","Press GENERATE — the video takes one to three minutes","Watch it and download it — it is kept in your Gallery too"],
    shn:["သႂ်ႇၶႅပ်း 1 — {N}","ၵၢတ်ႈ ႁၢင်ႈႁႅၼ်း prompt၊ model၊ တၢင်းယႂ်ႇ၊ ၶၢဝ်းယၢမ်း ယဝ်ႉ","ၼဵၵ်း GENERATE — 1–3 မိၼိတ်ႉ","တူၺ်းလႄႈ download — မီးၼႂ်း Gallery ၵေႃႈ"],
    kac:["Sumla 1 bang u — {N}","Card gaw prompt, model, kaba, aten yawng hkyen da sai — galai mayu yang galai u","GENERATE dip u — video 1–3 minit la ai","Yu nna download u — Gallery hta mung tawn da ai"],
    th:["ใส่รูป 1 รูป — {N}","การ์ดตั้งคำขอ โมเดล ขนาด และความยาวให้แล้ว — แก้ได้ตามใจ","กด GENERATE — วิดีโอใช้เวลา 1–3 นาที","ดูและดาวน์โหลด — เก็บไว้ในแกลเลอรีด้วย"],
    zh:["添加一张照片 — {N}","卡片已设好请求、模型、尺寸和时长 — 想改也可以改","按 GENERATE — 视频需要 1–3 分钟","观看并下载 — 也会保存在你的图库里"],
    vi:["Thêm một ảnh — {N}","Thẻ đã đặt yêu cầu, model, kích cỡ và độ dài — đổi nếu bạn muốn","Nhấn GENERATE — video mất 1–3 phút","Xem và tải về — cũng được lưu trong Gallery của bạn"],
    id:["Tambahkan satu foto — {N}","Kartu sudah mengatur permintaan, model, ukuran dan durasi — ubah kalau mau","Tekan GENERATE — video butuh 1–3 menit","Tonton dan unduh — tersimpan juga di Galerimu"],
    ms:["Tambah satu foto — {N}","Kad telah menetapkan permintaan, model, saiz dan tempoh — ubah jika mahu","Tekan GENERATE — video mengambil 1–3 minit","Tonton dan muat turun — turut disimpan dalam Galeri anda"]
  },
  v2v:{
    my:["{N} တင်ပါ","ကတ်က tool ရွေးပြီး prompt ရေးပေးပြီ — option တွေ ပြင်လို့ရတယ်","GENERATE နှိပ်ပါ — ဗီဒီယို ထွက်လာဖို့ ၂–၅ မိနစ် ကြာမယ်","ရလဒ်ကို ကြည့်၊ Download လုပ် — Gallery ထဲမှာလည်း သိမ်းပေးထားမယ်"],
    en:["Add {N}","The card has picked the tool and written the request — change the options if you like","Press GENERATE — the clip takes two to five minutes","Watch it and download it — it is kept in your Gallery too"],
    shn:["သႂ်ႇ {N}","ၵၢတ်ႈ လိူၵ်ႈ tool လႄႈတႅမ်ႈ prompt ယဝ်ႉ","ၼဵၵ်း GENERATE — 2–5 မိၼိတ်ႉ","တူၺ်းလႄႈ download — မီးၼႂ်း Gallery ၵေႃႈ"],
    kac:["{N} bang u","Card gaw tool lata nna prompt ka da sai — option ni galai mayu yang galai u","GENERATE dip u — video 2–5 minit la ai","Yu nna download u — Gallery hta mung tawn da ai"],
    th:["ใส่ {N}","การ์ดเลือกเครื่องมือและเขียนคำขอให้แล้ว — แก้ตัวเลือกได้ตามใจ","กด GENERATE — คลิปใช้เวลา 2–5 นาที","ดูและดาวน์โหลด — เก็บไว้ในแกลเลอรีด้วย"],
    zh:["添加 {N}","卡片已选好工具并写好请求 — 想改选项也可以","按 GENERATE — 视频需要 2–5 分钟","观看并下载 — 也会保存在你的图库里"],
    vi:["Thêm {N}","Thẻ đã chọn công cụ và viết yêu cầu — đổi tuỳ chọn nếu bạn muốn","Nhấn GENERATE — clip mất 2–5 phút","Xem và tải về — cũng được lưu trong Gallery của bạn"],
    id:["Tambahkan {N}","Kartu sudah memilih alat dan menulis permintaan — ubah opsinya kalau mau","Tekan GENERATE — klip butuh 2–5 menit","Tonton dan unduh — tersimpan juga di Galerimu"],
    ms:["Tambah {N}","Kad telah memilih alat dan menulis permintaan — ubah pilihan jika mahu","Tekan GENERATE — klip mengambil 2–5 minit","Tonton dan muat turun — turut disimpan dalam Galeri anda"]
  }
};
/* ---- /VWIZ_DATA ---- */

var API = { DOTS: VWIZ_DOTS, L: VWIZ_L, STEPS: VWIZ_STEPS, tr: tr, lang: _lang,
  steps: function (kind) { var s = VWIZ_STEPS[kind] || {}; return s[_lang()] || s.en || []; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoWizard = API; }
})();
