/* ============================================================
   HNK video-smart-workflow deck — LIFTED, do not edit by hand.
   Source of truth: the web app's own VT_KEEP / VT_FINISH / VT_CLIP_WARN /
   VT_WF block (docs/app/index.html), copied verbatim by
   tools/build_panel_video_tool_wf.js so Media Lab ▸ VidUp offers the SAME
   two cards, the SAME written request and the SAME documented clip ceiling
   the app offers, and never invents an endpoint.

   L9 is the IDENTITY function here: these modules load before main.js, so a
   label resolved at load would freeze to English. API.tr() resolves the
   nine-language maps at render time, exactly as hnk_video_wf_data.js does.
   ============================================================ */
(function () {
"use strict";

function L9(m) { return m; }   /* see the header: resolve late, not at load */

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

var VT_KEEP = "KEEP EXACTLY AS FILMED: the camera angle, the camera movement, the framing, the crop and the aspect ratio; every action, gesture and step, on the same timing; the background, the set, the props and every other person in it; the lighting, the colour grade and the original sound.";
var VT_FINISH = "FINISH: the same person in every frame from the first to the last, holding through every turn and every fast movement, with no flicker at the jaw or the hairline, no seam, no warping, and the clip stays its original length and its original speed.";
var VT_WF = [
  { key:"vtCharSwap", art:"lib/vid/vt-charSwap.jpg", model:"kling-video-o3-pro-video-edit", maxSecs:10,
    need:L9({my:"ဗီဒီယို ၁ + ပုံ ၁",en:"1 video + 1 photo",shn:"ဝီဒီရူဝ်ႈ 1 + ၶႅပ်း 1",kac:"Video 1 + sumla 1",th:"วิดีโอ 1 + รูป 1",zh:"1 段视频 + 1 张照片",vi:"1 video + 1 ảnh",id:"1 video + 1 foto",ms:"1 video + 1 foto"}),
    label:L9({my:"ဗီဒီယိုထဲ ကိုယ့်ဇာတ်ကောင် ထည့်မယ်",en:"Your character in any video",shn:"သႂ်ႇတူဝ်ၸဝ်ႈၵဝ်ႇၶဝ်ႈၼႂ်းဝီဒီရူဝ်ႈ",kac:"Video hta nang a masha bang u",th:"ใส่ตัวละครของคุณลงในวิดีโอ",zh:"把你的角色放进任意视频",vi:"Đưa nhân vật của bạn vào video",id:"Masukkan karakter Anda ke video",ms:"Masukkan watak anda ke dalam video"}),
    summary:L9({my:"ကြိုက်တဲ့ ဗီဒီယိုထဲက လူကို ကိုယ့်ပုံနဲ့ အစားထိုး — ကင်မရာ၊ လှုပ်ရှားမှု၊ နောက်ခံ အတိုင်း",en:"Swap the person in any clip for the one in your photo — camera, motion and scene unchanged",shn:"လႅၵ်ႈၵူၼ်းၼႂ်းဝီဒီရူဝ်ႈပဵၼ်ၶႅပ်းႁၢင်ႈၸဝ်ႈၵဝ်ႇ — ၵႄႇမရႃႇလႄႈႁွင်ႈလင် ဢမ်ႇလႅၵ်ႈ",kac:"Video hta na masha hpe nang a sumla hte galai — camera, shamu ai hte shara n galai ai",th:"แทนคนในคลิปด้วยคนในรูปของคุณ — กล้อง การเคลื่อนไหว และฉากคงเดิม",zh:"把片中的人换成你照片里的人 — 镜头、动作与场景不变",vi:"Thay người trong clip bằng người trong ảnh của bạn — máy quay, chuyển động và bối cảnh giữ nguyên",id:"Ganti orang dalam klip dengan orang di foto Anda — kamera, gerakan, dan latar tetap",ms:"Ganti orang dalam klip dengan orang dalam foto anda — kamera, gerakan dan latar kekal"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) နဲ့ ကိုယ့်ဇာတ်ကောင်ရဲ့ ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်ပြီး တစ်ကိုယ်လုံး ပါရင် အကောင်းဆုံး။",en:"One MP4 (up to 10s) and one photo of your character — face clear, full body if you have it.",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ) လႄႈ ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈၸႅင်ႈလီ",kac:"MP4 langai (10s du hkra) hte sumla 1 — myiman san seng ai",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) และรูปตัวละครของคุณ 1 รูป — ใบหน้าชัด เต็มตัวยิ่งดี",zh:"一个 MP4（不超过 10 秒）和一张你的角色照片 — 面部清晰，有全身照更好",vi:"Một MP4 (tối đa 10 giây) và một ảnh nhân vật của bạn — mặt rõ, có toàn thân càng tốt",id:"Satu MP4 (maks 10 detik) dan satu foto karakter Anda — wajah jelas, seluruh badan lebih baik",ms:"Satu MP4 (maks 10 saat) dan satu foto watak anda — wajah jelas, seluruh badan lebih baik"}),
    text:function(){
      return "Replace the main person in this video with the person in the reference photograph.\n"
       + "IDENTITY: the face, the facial structure, the skin tone, the hair colour and the hair length all come from the reference photograph, and they are the same in every frame.\n"
       + "BODY: match the build in the reference photograph only where the body is visible — the pose, the movement and every contact with the scene stay exactly as in the source video.\n"
       + "WARDROBE: the clothes stay the ones worn in the source video.\n"
       + VT_KEEP + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a different camera move, a re-crop, a changed background, a changed outfit, a face that drifts between shots, extra fingers or limbs, a slowed or sped-up result, a watermark or a caption.";
    } },

  { key:"vtFaceSwap", art:"lib/vid/vt-faceSwap.jpg", model:"kling-video-o3-pro-video-edit", maxSecs:10,
    need:L9({my:"ဗီဒီယို ၁ + မျက်နှာပုံ ၁",en:"1 video + 1 face photo",shn:"ဝီဒီရူဝ်ႈ 1 + ၶႅပ်းၼႃႈ 1",kac:"Video 1 + myiman sumla 1",th:"วิดีโอ 1 + รูปหน้า 1",zh:"1 段视频 + 1 张面部照",vi:"1 video + 1 ảnh mặt",id:"1 video + 1 foto wajah",ms:"1 video + 1 foto wajah"}),
    label:L9({my:"မျက်နှာပဲ လဲမယ်",en:"Face only",shn:"လႅၵ်ႈၼႃႈၵူၺ်း",kac:"Myiman sha galai u",th:"เปลี่ยนเฉพาะใบหน้า",zh:"只换脸",vi:"Chỉ thay khuôn mặt",id:"Ganti wajah saja",ms:"Tukar wajah sahaja"}),
    summary:L9({my:"ဗီဒီယိုထဲက လူရဲ့ မျက်နှာကိုပဲ လဲ — ဆံပင်၊ ကိုယ်လုံး၊ အဝတ်အစား အတိုင်း",en:"Change only the face in the clip — hair, body and clothes stay as filmed",shn:"လႅၵ်ႈၼႃႈၵူၺ်း — ၽိူၼ်းၶူဝ်းလႄႈတူဝ်ၶိင်း ဢမ်ႇလႅၵ်ႈ",kac:"Video hta na myiman sha galai — kara, hkum hte palawng n galai ai",th:"เปลี่ยนแค่ใบหน้าในคลิป — ผม ลำตัว และเสื้อผ้าคงเดิม",zh:"只替换片中的脸 — 头发、身形与服装保持原样",vi:"Chỉ đổi khuôn mặt trong clip — tóc, dáng người và trang phục giữ nguyên",id:"Hanya ganti wajah dalam klip — rambut, tubuh, dan pakaian tetap",ms:"Tukar wajah sahaja dalam klip — rambut, badan dan pakaian kekal"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) နဲ့ မျက်နှာ ကြည်လင်တဲ့ ပုံ ၁ ပုံ — ရှေ့တည့်တည့် ကြည့်ထားတဲ့ပုံ အကောင်းဆုံး။",en:"One MP4 (up to 10s) and one clear face photo — front-on works best.",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ) လႄႈ ၶႅပ်းၼႃႈၸႅင်ႈလီ 1",kac:"MP4 langai (10s du hkra) hte myiman san seng ai sumla 1",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) และรูปใบหน้าชัด 1 รูป — หันหน้าตรงดีที่สุด",zh:"一个 MP4（不超过 10 秒）和一张清晰的正面照最好",vi:"Một MP4 (tối đa 10 giây) và một ảnh mặt rõ — chụp chính diện là tốt nhất",id:"Satu MP4 (maks 10 detik) dan satu foto wajah yang jelas — menghadap depan paling baik",ms:"Satu MP4 (maks 10 saat) dan satu foto wajah yang jelas — menghadap depan paling baik"}),
    text:function(){
      return "Replace ONLY the face of the main person in this video with the face in the reference photograph.\n"
       + "FACE: the features, the face shape, the eyes, the nose, the mouth and the skin tone of the reference photograph, blended into the head already in the video so the tone matches the neck, the ears and the hands in every frame.\n"
       + "KEEP THE REST OF THE PERSON: the hairstyle and the hair colour already in the video, the body, the hands and the clothes are untouched.\n"
       + VT_KEEP + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: changing the hair, the body or the clothes, a different camera move, a re-crop, a face that slides off the head, a mask edge or a blurred patch where the face is, a changed length or speed, a watermark or a caption.";
    } }
];
var VT_CLIP_WARN = L9({my:"⚠ ဒီ ဗီဒီယိုက {S} စက္ကန့် ရှိတယ် — ဒီကတ်ရဲ့ tool က {M} စက္ကန့်ထက် ပိုတာ လက်မခံဘူး။ ဖြတ်ပြီး ပြန်တင်ပါ။",en:"⚠ This clip is {S}s — the tool this card picks takes at most {M}s. Trim it and upload again.",shn:"⚠ ဝီဒီရူဝ်ႈၼႆႉ {S} ၸဵၵ်ႇ — tool ၼႆႉႁပ်ႉလႆႈ {M} ၸဵၵ်ႇၵူၺ်း",kac:"⚠ Ndai video gaw {S}s re — ndai tool gaw {M}s sha hkam la ai",th:"⚠ คลิปนี้ยาว {S} วินาที — เครื่องมือของการ์ดนี้รับได้สูงสุด {M} วินาที ตัดแล้วอัปโหลดใหม่",zh:"⚠ 这段视频 {S} 秒 — 此卡片使用的工具最多接受 {M} 秒，请剪短后重新上传",vi:"⚠ Clip này dài {S}s — công cụ của thẻ này chỉ nhận tối đa {M}s. Hãy cắt ngắn rồi tải lên lại",id:"⚠ Klip ini {S} detik — alat kartu ini menerima maksimal {M} detik. Potong lalu unggah lagi",ms:"⚠ Klip ini {S} saat — alat kad ini menerima maksimum {M} saat. Potong dan muat naik semula"});

var API = { WF: VT_WF, KEEP: VT_KEEP, FINISH: VT_FINISH, CLIP_WARN: VT_CLIP_WARN, tr: tr,
  byKey: function (k) { for (var i = 0; i < VT_WF.length; i++) if (VT_WF[i].key === k) return VT_WF[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoToolWorkflows = API; }
})();
