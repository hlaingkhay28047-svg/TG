/* ============================================================
   HNK "what's new" list — LIFTED, do not edit by hand.
   Source of truth: the web app's own WHATS_NEW table
   (docs/app/index.html), copied verbatim so a student is told the
   same thing in Photoshop as on their phone, in the same words and
   the same nine languages. test/verify_panel_whats_new.js pins this
   file to the app's, entry for entry.
   ============================================================ */
(function () {
"use strict";
var WHATS_NEW = [
  { v:"5.90.0", kind:"page", ref:"pgWf",
    t:{my:"အသစ်ထွက်တာတွေ ချက်ချင်းသိရပါပြီ",en:"You'll see what's new, straight away",shn:"တေႁၼ်ၶိူင်ႈမႂ်ႇတင်းသဵင်ႈ",kac:"Nnan ai ni hpe mu na",th:"เห็นของใหม่ได้ทันที",zh:"新功能一眼就看到",vi:"Thấy ngay cái mới",id:"Langsung lihat yang baru",ms:"Terus nampak yang baharu"},
    s:{my:"ကတ်အသစ်တွေမှာ ရွှေရောင် NEW တံဆိပ် တပ်ထားပြီး အပေါ်ဆုံးမှာ ပြပါတယ် — နှိပ်ပြီး ချက်ချင်းစမ်းလို့ရပါတယ်",en:"New cards wear a gold NEW mark and sit at the top of their group — tap to try one now",shn:"ၶႅပ်းမႂ်ႇမီးမၢႆ NEW သီၶမ်း",kac:"Nnan ai card ni gold NEW lam tsun",th:"การ์ดใหม่มีป้าย NEW สีทองและอยู่บนสุด",zh:"新卡片带金色 NEW 标记并排在最前",vi:"Thẻ mới có nhãn NEW vàng và nằm trên cùng",id:"Kartu baru bertanda NEW emas dan ada di paling atas",ms:"Kad baharu bertanda NEW emas di bahagian atas"} },
  { v:"5.89.0", kind:"page", ref:"pgVideo",
    t:{my:"Video model အသစ် ၁၂ ခု",en:"Twelve new video models",shn:"ဝီးတီးဢူဝ်း model မႂ်ႇ 12",kac:"Video model nnan 12",th:"โมเดลวิดีโอใหม่ 12 ตัว",zh:"12 个新视频模型",vi:"12 mô hình video mới",id:"12 model video baru",ms:"12 model video baharu"},
    s:{my:"MiniMax H3 Max, H3 Context-IR (အသံပါ), Gemini Omni 1.1 Flash နဲ့ 768P ကို 2K ပြန်ထုတ်တဲ့ tool တွေ",en:"MiniMax H3 Max, H3 Context-IR (with sound), Gemini Omni 1.1 Flash, and 768P→2K regeneration tools",shn:"MiniMax H3 Max, Context-IR, Gemini Omni 1.1",kac:"MiniMax H3 Max, Context-IR, Gemini Omni 1.1",th:"MiniMax H3 Max, Context-IR (มีเสียง), Gemini Omni 1.1",zh:"MiniMax H3 Max、Context-IR（带声音）、Gemini Omni 1.1",vi:"MiniMax H3 Max, Context-IR (có tiếng), Gemini Omni 1.1",id:"MiniMax H3 Max, Context-IR (bersuara), Gemini Omni 1.1",ms:"MiniMax H3 Max, Context-IR (berbunyi), Gemini Omni 1.1"} },
  { v:"5.87.0", kind:"wf", ref:"studio-look-copy",
    t:{my:"Studio Look Copy",en:"Studio Look Copy",shn:"Studio Look Copy",kac:"Studio Look Copy",th:"Studio Look Copy",zh:"Studio Look Copy",vi:"Studio Look Copy",id:"Studio Look Copy",ms:"Studio Look Copy"},
    s:{my:"နမူနာပုံတစ်ပုံရဲ့ အရောင်၊ အလင်း၊ အသားရေ၊ scene အကုန်လုံးကို ကိုယ့်ပုံဆီ ကူးယူပေးတယ် — ပုံရာနဲ့ချီ တစ်ပုံစံတည်း",en:"Copies one reference photo's whole scene, colour, light and skin into your photo — the same look across a hundred frames",shn:"လၢႆးသီ လႄႈ ၾႆး ၶွင်ၶႅပ်းၼမူႇ",kac:"Reference sumla a nsam hte nhtoi",th:"คัดลอกโทนสี แสง ผิว ทั้งฉากจากรูปอ้างอิง",zh:"把参考照片的场景、色彩、光线和肤质整套复制到你的照片",vi:"Sao chép toàn bộ bối cảnh, màu, ánh sáng và da từ ảnh mẫu",id:"Menyalin seluruh suasana, warna, cahaya dan kulit dari foto acuan",ms:"Menyalin seluruh suasana, warna, cahaya dan kulit dari foto rujukan"} },
  { v:"5.86.0", kind:"page", ref:"pgGallery",
    t:{my:"ရလဒ်တွေ အလိုအလျောက် သိမ်းထားပြီ",en:"Your results are kept automatically",shn:"ၽွၼ်းလႆႈ လႆႈသိမ်းဝႆႉ",kac:"Nan a lam ni hpe makawp",th:"ผลงานถูกเก็บอัตโนมัติ",zh:"生成结果会自动保存",vi:"Kết quả được lưu tự động",id:"Hasil tersimpan otomatis",ms:"Hasil disimpan automatik"},
    s:{my:"Tab ပိတ်သွားရင်တောင် ရလဒ်တွေ Gallery ထဲမှာ ကျန်နေမယ် — ကိုယ်တိုင်ဖျက်မှ ပျောက်မယ်",en:"Close the tab and the results are still in your Gallery — they go only when you delete them",shn:"ပိၵ်း tab သေတႃႉ ၽွၼ်းလႆႈယင်းမီး",kac:"Tab la kau tim Gallery hta naw nga",th:"ปิดแท็บแล้วผลงานยังอยู่ในแกลเลอรี",zh:"关掉分页，结果仍在图库里",vi:"Đóng tab, kết quả vẫn còn trong Thư viện",id:"Tutup tab, hasil tetap ada di Galeri",ms:"Tutup tab, hasil kekal dalam Galeri"} }
];

var API = { LIST: WHATS_NEW,
  key: function (e) { return e.v + "|" + e.ref; },
  /* the panel keeps its own read-record: the same student on the same
     machine, but UXP storage is not the browser's localStorage, so a card
     read on the phone stays new in Photoshop and vice versa. That is the
     honest behaviour — neither surface can see the other's storage. */
  SEEN_KEY: "hnk_new_seen" };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.whatsNew = API; }
})();
