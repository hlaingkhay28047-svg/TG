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
  /* v5.92.0 points at the Workflows page, not at a Look Set card: 5.91.0
     already claims the first card of the Look Sets category, and two unread
     entries cannot both be the first card of one category (verify_whats_new
     E2). The news is a change to every set's switches, so the shelf is the
     honest destination anyway. */
  { v:"5.92.0", kind:"page", ref:"pgWf",
    t:{my:"ခလုတ်ပိတ်ရင် ဘာဖြစ်မလဲ ရှင်းပါပြီ",en:"Every switch now says what OFF means",shn:"ပိၵ်ႉသေ ပဵၼ်သင် ၸႅင်ႈလႅင်းယဝ်ႉ",kac:"Switch pat yang hpa byin na chye sai",th:"ปิดสวิตช์แล้วเกิดอะไร ชัดเจนแล้ว",zh:"每个开关都说明了关闭时的效果",vi:"Mỗi công tắc giờ nói rõ TẮT nghĩa là gì",id:"Setiap sakelar kini menjelaskan arti MATI",ms:"Setiap suis kini menyatakan maksud MATI"},
    s:{my:"Look Set မှာ ဝတ်စုံ+မိတ်ကပ် ပိတ်ရင် ကိုယ့်အဝတ်အစား အတိအကျ ကျန်မယ် — prompt ရှည်ရင်လည်း model တိုင်းက အလုပ်အဓိကကို အရင်ရပါပြီ",en:"Turn Wardrobe+makeup off on a Look Set and your own outfit stays exactly as shot — and on models that cut long prompts, the task now arrives first",shn:"ပိၵ်ႉၶူဝ်းၼုင်ႈ+မဵၵ်ႉၶၢပ်ႈ ၼႂ်း Look Set သေ ၶူဝ်းၼုင်ႈတူဝ်ၵဝ်ႇ ၵိုတ်းဝႆႉမိူၼ်ၵဝ်ႇ — model ဢၼ်တတ်ႉ prompt ၵေႃႈ လႆႈၵၢၼ်ၼႃႈဢွၼ်တၢင်း",kac:"Look Set hta Palawng+makeup pat yang na palawng nan hte raw nga na — prompt kadun ai model ni mung bungli hpe shawng la na",th:"ปิดชุดและแต่งหน้าใน Look Set แล้วชุดของคุณจะคงเดิมทุกอย่าง — และโมเดลที่ตัด prompt ยาวจะได้รับงานหลักก่อน",zh:"在造型套装中关闭服装与妆容，你自己的穿着将原样保留 — 会截断长提示词的模型现在也会先收到任务本身",vi:"Tắt Trang phục+trang điểm trong Look Set thì trang phục của bạn giữ nguyên như ảnh chụp — và các model cắt prompt dài giờ nhận phần việc chính trước",id:"Matikan Busana+riasan di Look Set dan pakaianmu tetap persis seperti difoto — dan model yang memotong prompt panjang kini menerima tugas utamanya lebih dulu",ms:"Matikan Busana+solekan dalam Look Set dan pakaian anda kekal seperti difoto — dan model yang memotong prompt panjang kini menerima tugas utama dahulu"} },
  { v:"5.91.0", kind:"wf", ref:"look-golden-grecian",
    t:{my:"Look Set ကတ်အသစ် ၁၃ ခု",en:"Thirteen new Look Sets",shn:"ၸုမ်းလင်ႇသဵၼ်ႈမႂ်ႇ 13",kac:"Look Set nnan 13",th:"13 เซ็ตลุคใหม่",zh:"13 组全新造型套装",vi:"13 bộ Look Set mới",id:"13 Look Set baru",ms:"13 Look Set baharu"},
    s:{my:"နောက်ခံအရောင်၊ အလင်း၊ အရောင်ချိန်၊ ဝတ်စုံ အတိအကျ တစ်ပုံစံတည်း — ပုံ ၁၀၀ လုပ်လည်း တစ်ရိုက်တည်းလို။ ဝတ်စုံ+မိတ်ကပ် နဲ့ အသားရောင် ခလုတ် သီးသန့်ပါတယ်",en:"Backdrop, light, grade and wardrobe fixed on every photo, so a hundred frames read as one shoot — with their own wardrobe+makeup and skin-tone switches",shn:"သီလင်၊ ၾႆး၊ လၢႆးသီ၊ ၶူဝ်းၼုင်ႈ မိူၼ်ၵၼ်ၵူႊၶႅပ်း",kac:"Shakum, nhtoi, grade, palawng yawng maren",th:"ฉาก แสง เกรดสี และชุด เหมือนกันทุกภาพ",zh:"背景、布光、调色与服装每张一致",vi:"Phông, ánh sáng, màu và trang phục giống nhau mọi ảnh",id:"Latar, cahaya, grading dan busana sama di setiap foto",ms:"Latar, cahaya, gred dan busana sama pada setiap foto"} },
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
