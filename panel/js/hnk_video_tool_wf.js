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

var VT_KEEP = "KEEP EXACTLY AS FILMED: the camera angle, the camera movement, the framing, the crop and the aspect ratio; every action, gesture and step, on the same timing; the background, the set, the props and every other person in it; the lighting and the colour grade.";
var VT_SOUND = " The original sound is kept as it was recorded.";
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
       + VT_KEEP + VT_SOUND + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a different camera move, a re-crop, a changed background, a changed outfit, a face that drifts between shots, extra fingers or limbs, a slowed or sped-up result, a watermark or a caption.";
    } },

  { key:"vtFaceSwap", art:"lib/vid/vt-faceSwap.jpg", model:"kling-video-o3-pro-video-edit", maxSecs:10,
    need:L9({my:"ဗီဒီယို ၁ + မျက်နှာပုံ ၁",en:"1 video + 1 face photo",shn:"ဝီဒီရူဝ်ႈ 1 + ၶႅပ်းၼႃႈ 1",kac:"Video 1 + myiman sumla 1",th:"วิดีโอ 1 + รูปหน้า 1",zh:"1 段视频 + 1 张面部照",vi:"1 video + 1 ảnh mặt",id:"1 video + 1 foto wajah",ms:"1 video + 1 foto wajah"}),
    label:L9({my:"မျက်နှာပဲ လဲမယ်",en:"Face only",shn:"လႅၵ်ႈၼႃႈၵူၺ်း",kac:"Myiman sha galai u",th:"เปลี่ยนเฉพาะใบหน้า",zh:"只换脸",vi:"Chỉ thay khuôn mặt",id:"Ganti wajah saja",ms:"Tukar wajah sahaja"}),
    /* v6.6.0 — SAID HONESTLY. The request below asks for the face alone and
       says so twice, but the endpoint sometimes brings the hair across with
       it. That is the model's behaviour, not a setting, and RunningHub
       publishes no face-only endpoint to point this card at instead. A
       student who reads "hair stays" and watches it change has been misled
       by us, so the card now says what may happen and names the card to use
       when changing the hair is the intention. */
    summary:L9({my:"ဗီဒီယိုထဲက လူရဲ့ မျက်နှာကို လဲ — ကိုယ်လုံးနဲ့ အဝတ်အစား အတိုင်း။ ဆံပင် မပြောင်းဖို့ ခိုင်းထားပေမဲ့ တစ်ခါတလေ ပါသွားတတ်ပါတယ် — ဆံပင်ပါ အတူ ပြောင်းချင်ရင် \"မျက်နှာ + ဆံပင်\" ကတ်ကို သုံးပါ။",en:"Change the face in the clip — body and clothes stay as filmed. It asks the tool to leave the hair alone, but the hair sometimes comes across too; use the \"Face and hair\" card when you mean to change it.",shn:"လႅၵ်ႈၼႃႈ — တူဝ်ၶိင်းလႄႈၶူဝ်း ဢမ်ႇလႅၵ်ႈ။ ၽိူၼ်းၶူဝ်း တင်းၵမ်ႈၽွင်ႈ လႅၵ်ႈပႃးလႆႈ",kac:"Video hta na myiman galai — hkum hte palawng n galai. Kara mung lawan lawan pawt wa lu ai",th:"เปลี่ยนใบหน้าในคลิป — ลำตัวและเสื้อผ้าคงเดิม สั่งให้คงผมไว้ แต่บางครั้งผมก็เปลี่ยนตามมาด้วย ถ้าตั้งใจเปลี่ยนผมด้วยให้ใช้การ์ด \"เปลี่ยนใบหน้าและผม\"",zh:"替换片中的脸 — 身形与服装保持原样。已要求保留原发型，但有时头发也会跟着换；想连发型一起换请用\"换脸连发型\"那张卡。",vi:"Đổi khuôn mặt trong clip — dáng người và trang phục giữ nguyên. Đã yêu cầu giữ nguyên tóc, nhưng đôi khi tóc cũng đổi theo; nếu bạn muốn đổi tóc hãy dùng thẻ \"Thay khuôn mặt và tóc\".",id:"Ganti wajah dalam klip — tubuh dan pakaian tetap. Alat diminta membiarkan rambut, tetapi kadang rambut ikut berubah; gunakan kartu \"Ganti wajah dan rambut\" bila memang ingin menggantinya.",ms:"Tukar wajah dalam klip — badan dan pakaian kekal. Alat diminta membiarkan rambut, tetapi kadangkala rambut turut bertukar; guna kad \"Tukar wajah dan rambut\" jika anda memang mahu menukarnya."}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) နဲ့ မျက်နှာ ကြည်လင်တဲ့ ပုံ ၁ ပုံ — ရှေ့တည့်တည့် ကြည့်ထားတဲ့ပုံ အကောင်းဆုံး။",en:"One MP4 (up to 10s) and one clear face photo — front-on works best.",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ) လႄႈ ၶႅပ်းၼႃႈၸႅင်ႈလီ 1",kac:"MP4 langai (10s du hkra) hte myiman san seng ai sumla 1",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) และรูปใบหน้าชัด 1 รูป — หันหน้าตรงดีที่สุด",zh:"一个 MP4（不超过 10 秒）和一张清晰的正面照最好",vi:"Một MP4 (tối đa 10 giây) và một ảnh mặt rõ — chụp chính diện là tốt nhất",id:"Satu MP4 (maks 10 detik) dan satu foto wajah yang jelas — menghadap depan paling baik",ms:"Satu MP4 (maks 10 saat) dan satu foto wajah yang jelas — menghadap depan paling baik"}),
    text:function(){
      return "Replace ONLY the face of the main person in this video with the face in the reference photograph.\n"
       + "FACE: the features, the face shape, the eyes, the nose, the mouth and the skin tone of the reference photograph, blended into the head already in the video so the tone matches the neck, the ears and the hands in every frame.\n"
       + "KEEP THE REST OF THE PERSON: the hairstyle and the hair colour already in the video, the body, the hands and the clothes are untouched.\n"
       + VT_KEEP + VT_SOUND + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: changing the hair, the body or the clothes, a different camera move, a re-crop, a face that slides off the head, a mask edge or a blurred patch where the face is, a changed length or speed, a watermark or a caption.";
    } },

  /* v6.6.0 — THE CARD THE RENDER TAUGHT US TO WRITE.
     vtFaceSwap above says "hair, body and clothes stay as filmed", and its
     prompt asks for that twice — once in KEEP THE REST OF THE PERSON, again
     in AVOID. The endpoint changed the hair anyway, and the card art shows
     it doing so. RunningHub publishes no face-only endpoint (checked against
     its own registry), so there is nothing to point a stricter card at.
     Rather than reword a card students already use, this one names the
     result honestly: the head — face AND hair — becomes the person in the
     photograph, and everything below the neck stays as filmed. Same
     endpoint, different promise, and the promise is the one that comes true. */
  { key:"vtHeadSwap", art:"lib/vid/vt-headswap.jpg", model:"kling-video-o3-pro-video-edit", maxSecs:10,
    need:L9({my:"ဗီဒီယို ၁ + မျက်နှာပုံ ၁",en:"1 video + 1 face photo",shn:"ဝီဒီရူဝ်ႈ 1 + ၶႅပ်းၼႃႈ 1",kac:"Video 1 + myiman sumla 1",th:"วิดีโอ 1 + รูปหน้า 1",zh:"1 段视频 + 1 张面部照",vi:"1 video + 1 ảnh mặt",id:"1 video + 1 foto wajah",ms:"1 video + 1 foto wajah"}),
    label:L9({my:"မျက်နှာ + ဆံပင် လဲမယ်",en:"Face and hair",shn:"လႅၵ်ႈၼႃႈလႄႈၽိူၼ်း",kac:"Myiman hte kara galai",th:"เปลี่ยนใบหน้าและผม",zh:"换脸连发型",vi:"Thay khuôn mặt và tóc",id:"Ganti wajah dan rambut",ms:"Tukar wajah dan rambut"}),
    summary:L9({my:"ပုံထဲက လူရဲ့ မျက်နှာနဲ့ ဆံပင် နှစ်ခုလုံး ယူ — ကိုယ်လုံး၊ အဝတ်အစား၊ နေရာ အတိုင်း",en:"Takes both the face and the hair from your photo — body, clothes and scene stay as filmed",shn:"ဢဝ်ၼႃႈလႄႈၽိူၼ်းၶူဝ်း — တူဝ်ၶိင်းလႄႈတီႈ ဢမ်ႇလႅၵ်ႈ",kac:"Myiman hte kara yawng la — hkum, palawng hte shara n galai",th:"เอาทั้งใบหน้าและทรงผมจากรูปของคุณ — ลำตัว เสื้อผ้า และฉากคงเดิม",zh:"脸和发型都取自你的照片 — 身形、服装与场景保持原样",vi:"Lấy cả khuôn mặt lẫn mái tóc từ ảnh của bạn — dáng người, trang phục và bối cảnh giữ nguyên",id:"Mengambil wajah sekaligus rambut dari foto Anda — tubuh, pakaian, dan latar tetap",ms:"Mengambil wajah dan rambut daripada foto anda — badan, pakaian dan latar kekal"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) နဲ့ ဆံပင်ပါ မြင်ရတဲ့ ပုံ ၁ ပုံ — ရှေ့တည့်တည့် အကောင်းဆုံး။",en:"One MP4 (up to 10s) and one photo where the hair is visible too — front-on works best.",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ) လႄႈ ၶႅပ်းဢၼ်ႁၼ်ၽိူၼ်းၶူဝ်းပႃး",kac:"MP4 langai (10s du hkra) hte kara mung mu ai sumla 1",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) และรูปที่เห็นทรงผมด้วย — หันหน้าตรงดีที่สุด",zh:"一个 MP4（不超过 10 秒）和一张能看到发型的照片，正面最好",vi:"Một MP4 (tối đa 10 giây) và một ảnh thấy rõ cả mái tóc — chụp chính diện là tốt nhất",id:"Satu MP4 (maks 10 detik) dan satu foto yang rambutnya juga terlihat — menghadap depan paling baik",ms:"Satu MP4 (maks 10 saat) dan satu foto yang rambutnya turut kelihatan — menghadap depan paling baik"}),
    text:function(){
      return "Replace the HEAD of the main person in this video with the head in the reference photograph.\n"
       + "HEAD: the face, the face shape, the eyes, the nose, the mouth, the skin tone AND the hairstyle and hair colour of the reference photograph, sitting naturally on the neck already in the video so the tone matches the neck, the ears and the hands in every frame.\n"
       + "KEEP EVERYTHING BELOW THE NECK: the body, the shoulders, the hands and the clothes are untouched, and so are the set, the light and the background.\n"
       + VT_KEEP + VT_SOUND + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: changing the body, the clothes or the background, a different camera move, a re-crop, a head that slides off the neck, a mask edge or a blurred collar, a changed length or speed, a watermark or a caption.";
    } },

  { key:"vtAnime", art:"lib/vid/vt-anime.jpg", model:"gemini-omni-11-video-edit", maxSecs:10, opts:{"resolution": "1080p"},
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"ကာတွန်း / Anime ပုံစံ",en:"Anime restyle",shn:"ႁၢင်ႈၶႃႉတုၼ်း",kac:"Anime hku bai ka",th:"เปลี่ยนเป็นสไตล์อนิเมะ",zh:"改成动漫风格",vi:"Vẽ lại thành anime",id:"Gaya anime",ms:"Gaya anime"}),
    summary:L9({my:"ဗီဒီယိုကို လက်ဆွဲကာတွန်းပုံစံ ပြန်ဆွဲ — လှုပ်ရှားမှုနဲ့ ကင်မရာ အတိုင်း",en:"Redraw the clip as hand-drawn 2D anime — the motion and the camera stay",shn:"ႁဵတ်းႁၢင်ႈၶႃႉတုၼ်း — တူင်ႉၼိုင်လႄႈၵႄႇမရႃႇ ဢမ်ႇလႅၵ်ႈ",kac:"Video hpe anime hku bai ka — shamu ai hte camera n galai",th:"วาดคลิปใหม่เป็นอนิเมะ 2D — การเคลื่อนไหวและกล้องคงเดิม",zh:"把片子重画成手绘 2D 动漫 — 动作与镜头不变",vi:"Vẽ lại clip thành anime 2D — chuyển động và máy quay giữ nguyên",id:"Gambar ulang klip jadi anime 2D — gerakan dan kamera tetap",ms:"Lukis semula klip jadi anime 2D — gerakan dan kamera kekal"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) — ပုံ မလိုပါ",en:"One MP4 (up to 10s) — no photo needed",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ)",kac:"MP4 langai (10s du hkra)",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) — ไม่ต้องใช้รูป",zh:"一个 MP4（不超过 10 秒）— 不需要照片",vi:"Một MP4 (tối đa 10 giây) — không cần ảnh",id:"Satu MP4 (maks 10 detik) — tanpa foto",ms:"Satu MP4 (maks 10 saat) — tanpa foto"}),
    text:function(){
      return "Redraw this video as hand-drawn 2D anime, keeping everything that happens in it.\nLOOK: clean cel shading with flat colour fills, crisp ink outlines, backgrounds simplified into painted anime plates in the same palette as the footage, soft highlights in the hair and the eyes.\nPEOPLE: everyone in the shot is drawn in this style — the same hair, the same clothes, the same person doing the same thing.\n"
       + VT_KEEP + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a different camera move, a re-crop, a changed background, a changed outfit, extra characters, photographic skin texture left under the drawing, a slowed or sped-up result, a watermark or a caption.";
    } },

  { key:"vtFilmLook", art:"lib/vid/vt-filmlook.jpg", model:"gemini-omni-11-video-edit", maxSecs:10, opts:{"resolution": "1080p"},
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"ရုပ်ရှင် အရောင် (Film look)",en:"Film look grade",shn:"သီႁၢင်ႈငဝ်း (Film)",kac:"Sumla nsam (Film)",th:"เกรดสีแบบภาพยนตร์",zh:"电影感调色",vi:"Màu điện ảnh",id:"Grade sinematik",ms:"Gred sinematik"}),
    summary:L9({my:"ရိုက်ထားတာကို ရုပ်ရှင်လို အရောင်ချိန် — ဖြစ်ပျက်နေတာ ဘာမှ မပြောင်း",en:"Grade the footage like a feature film — nothing that happens changes",shn:"ႁဵတ်းသီမိူၼ်ငဝ်းတူင်ႉ — လွင်ႈပဵၼ် ဢမ်ႇလႅၵ်ႈ",kac:"Film zawn nsam jaw — byin ai lam n galai",th:"เกรดสีให้เหมือนหนัง — สิ่งที่เกิดขึ้นไม่เปลี่ยน",zh:"像电影一样调色 — 画面里发生的事完全不变",vi:"Chỉnh màu như phim — nội dung không đổi",id:"Grade seperti film — yang terjadi tak berubah",ms:"Gred seperti filem — apa yang berlaku tidak berubah"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) — ပုံ မလိုပါ",en:"One MP4 (up to 10s) — no photo needed",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ)",kac:"MP4 langai (10s du hkra)",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) — ไม่ต้องใช้รูป",zh:"一个 MP4（不超过 10 秒）— 不需要照片",vi:"Một MP4 (tối đa 10 giây) — không cần ảnh",id:"Satu MP4 (maks 10 detik) — tanpa foto",ms:"Satu MP4 (maks 10 saat) — tanpa foto"}),
    text:function(){
      return "Grade this video like a feature film without changing anything that happens in it.\nLOOK: filmic contrast with deep shadows that keep their detail and highlights that roll off gently, warm skin against cooler shadows, a faint halation on the brightest edges, fine natural film grain, and a soft falloff at the corners of the frame.\nSKIN: complexions stay the ones filmed — the grade warms the light, never the person.\n"
       + VT_KEEP + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a different camera move, a re-crop, a changed background, a changed outfit, crushed blacks, a colour cast on the skin, a face that drifts between shots, a slowed or sped-up result, a watermark or a caption.";
    } },

  { key:"vtHeritage", art:"lib/vid/vt-heritage.jpg", model:"gemini-omni-11-video-edit", maxSecs:10, opts:{"resolution": "1080p"},
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"မြန်မာ့ရိုးရာ အရောင်",en:"Myanmar heritage grade",shn:"သီႁိတ်ႉႁွႆးမၢၼ်ႈ",kac:"Myen htunghking nsam",th:"โทนมรดกเมียนมา",zh:"缅甸传统色调",vi:"Sắc màu di sản Myanmar",id:"Grade warisan Myanmar",ms:"Gred warisan Myanmar"}),
    summary:L9({my:"ရွှေရောင်နေဝင်ချိန် ကျွန်း/ယွန်း အရောင်စဉ် — မင်္ဂလာဗီဒီယိုတွေအတွက်",en:"Late golden hour in teak and lacquer — made for wedding footage",shn:"သီၶမ်းယဵၼ်ႈ — တႃႇငဝ်းမင်ႇၵလႃႇ",kac:"Ja nsam hte teak — hkungran video matu",th:"โทนทองยามเย็นแบบไม้สักและเครื่องเขิน — สำหรับวิดีโองานแต่ง",zh:"金色黄昏的柚木与漆器色调 — 为婚礼影片而作",vi:"Sắc vàng hoàng hôn của gỗ tếch và sơn mài — dành cho video cưới",id:"Warna emas senja kayu jati dan lak — untuk video pernikahan",ms:"Warna emas senja kayu jati dan lakuer — untuk video perkahwinan"}),
    hint:L9({my:"MP4 တစ်ခု (၁၀ စက္ကန့်အထိ) — ပုံ မလိုပါ",en:"One MP4 (up to 10s) — no photo needed",shn:"MP4 ဢၼ်ၼိုင်ႈ (10 ၸဵၵ်ႇ)",kac:"MP4 langai (10s du hkra)",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 10 วินาที) — ไม่ต้องใช้รูป",zh:"一个 MP4（不超过 10 秒）— 不需要照片",vi:"Một MP4 (tối đa 10 giây) — không cần ảnh",id:"Satu MP4 (maks 10 detik) — tanpa foto",ms:"Satu MP4 (maks 10 saat) — tanpa foto"}),
    text:function(){
      return "Grade this video as a warm Myanmar heritage film without changing anything that happens in it.\nLOOK: late golden-hour warmth, a teak-and-lacquer palette of deep browns, amber and soft gold, gentle haze in the depth, highlights kept creamy rather than white, and a quiet film-like grain.\nSKIN: complexions stay the ones filmed — the grade warms the light, never the person.\n"
       + VT_KEEP + "\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a different camera move, a re-crop, a changed background, a changed outfit, an orange cast on the skin, blown highlights, a face that drifts between shots, a slowed or sped-up result, a watermark or a caption.";
    } },

  /* v6.4.0 — the duration wan-2.7 takes is the TOTAL the result runs, not the
     seconds added: the endpoint refuses outright with "first_clip duration
     cannot exceed the requested N seconds" when the clip is longer than it.
     Asking for five on a card named "make it longer" was therefore wrong twice
     — semantically, because five is not longer than most clips a student
     brings, and practically, because a 5.04-second clip failed the call. Ten
     is the default now, and clipUnder makes the app measure the picked clip
     against whatever the student chooses instead of finding out at submit. */
  { key:"vtExtend", art:"lib/vid/vt-extend.jpg", model:"wan-2-7-video-extend", opts:{"resolution": "1080P", "duration": "10"}, clipUnder:"duration",
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"ဗီဒီယို ဆက်ရှည်မယ်",en:"Make the clip longer",shn:"သိုပ်ႇဝီဒီရူဝ်ႈ",kac:"Video galu shatawt",th:"ต่อคลิปให้ยาวขึ้น",zh:"把片子接长",vi:"Kéo dài clip",id:"Perpanjang klip",ms:"Panjangkan klip"}),
    summary:L9({my:"နောက်ဆုံး frame ကနေ ဆက်သွား — လူ၊ နေရာ၊ အလင်း အတိုင်း (၁၅ စက္ကန့်အထိ ထွက်)",en:"Carries on from the last frame — same person, place and light (output up to 15s)",shn:"သိုပ်ႇတီႈသုတ်း — ၵူၼ်း၊ တီႈ၊ ၾႆး ဢမ်ႇလႅၵ်ႈ",kac:"Hpang jahtum frame kaw na matut — masha, shara, htoi n galai",th:"เล่นต่อจากเฟรมสุดท้าย — คนเดิม ที่เดิม แสงเดิม (ยาวได้ถึง 15 วินาที)",zh:"从最后一帧继续 — 人、场景、光线不变（最长 15 秒）",vi:"Tiếp tục từ khung hình cuối — vẫn người đó, nơi đó, ánh sáng đó (tối đa 15 giây)",id:"Lanjut dari frame terakhir — orang, tempat, dan cahaya sama (hingga 15 detik)",ms:"Sambung dari bingkai terakhir — orang, tempat dan cahaya sama (sehingga 15 saat)"}),
    hint:L9({my:"MP4 တစ်ခု — အောက်က duration က ပြီးလို့ ထွက်မယ့် ဗီဒီယို စုစုပေါင်း အရှည်ပါ၊ ကိုယ့်ဗီဒီယိုထက် ပိုရှည်တာ ရွေးပါ",en:"One MP4 — the duration below is the TOTAL length of the result, so pick one longer than your clip",shn:"MP4 ဢၼ်ၼိုင်ႈ — duration တီႈတႂ်ႈ ပဵၼ်ၶၢဝ်းယၢဝ်းတင်းသဵင်ႈ၊ လိူၵ်ႈဢၼ်ယၢဝ်းလိူဝ်ဝီဒီရူဝ်ႈၸဝ်ႈၵဝ်ႇ",kac:"MP4 langai — npu na duration gaw ah kyu a galu ting re, na a video hta grau galu ai lata u",th:"MP4 หนึ่งไฟล์ — duration ด้านล่างคือความยาวรวมของผลลัพธ์ ให้เลือกยาวกว่าคลิปของคุณ",zh:"一个 MP4 — 下面的 duration 是成片的总长度，请选比你的视频更长的数值",vi:"Một MP4 — duration bên dưới là TỔNG độ dài của kết quả, hãy chọn dài hơn clip của bạn",id:"Satu MP4 — duration di bawah adalah TOTAL panjang hasilnya, pilih yang lebih panjang dari klip Anda",ms:"Satu MP4 — duration di bawah ialah JUMLAH panjang hasilnya, pilih yang lebih panjang daripada klip anda"}),
    text:function(){
      return "Continue this video from its final frame.\nCARRY ON: the same person, the same wardrobe, the same set and the same light; the action that was under way keeps going at the same pace, and the camera keeps the move it was already making.\nJOIN: the first new frame follows the last filmed frame with no cut, no jump and no change of exposure or colour.\n"
       + VT_FINISH + "\n\n"
       + "AVOID: a new person, a new location, a cut, a camera move that was not already happening, a change of outfit or of light, a slowed or sped-up result, a watermark or a caption.";
    } },

  { key:"vtRestore4K", art:"lib/vid/vt-restore.jpg", model:"topazlabs-video-starlight", opts:{"model": "slp-2.5", "whPreset": "1080p"},
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"ဟောင်းတဲ့ဗီဒီယို ရှင်းအောင်",en:"Restore an old clip",shn:"မႄးဝီဒီရူဝ်ႈၵဝ်ႇ",kac:"Video dingsa bai galaw",th:"กู้คลิปเก่าให้คมชัด",zh:"修复老旧视频",vi:"Phục hồi clip cũ",id:"Pulihkan klip lama",ms:"Pulihkan klip lama"}),
    summary:L9({my:"မှုန်ဝါးနေတဲ့ ဗီဒီယိုဟောင်းကို ကြည်လင်ပြီး ကြီးအောင် — prompt မလို",en:"A soft, old clip made sharp and larger — no prompt at all",shn:"ဝီဒီရူဝ်ႈၵဝ်ႇ ႁႂ်ႈၸႅင်ႈလႄႈယႂ်ႇ — ဢမ်ႇလူဝ်ႇ prompt",kac:"Video dingsa hpe san seng nna kaba — prompt n ra",th:"คลิปเก่ามัวๆ ให้คมและใหญ่ขึ้น — ไม่ต้องใช้ prompt",zh:"把模糊的老片修清晰、放大 — 完全不需要 prompt",vi:"Clip cũ mờ thành nét và lớn hơn — không cần prompt",id:"Klip lama yang buram jadi tajam dan besar — tanpa prompt",ms:"Klip lama yang kabur jadi tajam dan besar — tanpa gesaan"}),
    hint:L9({my:"MP4 တစ်ခု — prompt မလိုပါ",en:"One MP4 — no prompt needed",shn:"MP4 ဢၼ်ၼိုင်ႈ — ဢမ်ႇလူဝ်ႇ prompt",kac:"MP4 langai — prompt n ra ai",th:"MP4 หนึ่งไฟล์ — ไม่ต้องใช้ prompt",zh:"一个 MP4 — 不需要 prompt",vi:"Một MP4 — không cần prompt",id:"Satu MP4 — tanpa prompt",ms:"Satu MP4 — tanpa gesaan"}) },

  { key:"vtEraseSub", art:"lib/vid/vt-erasesub.jpg", model:"volc-subtitle-erase-pro-video",
    need:L9({my:"ဗီဒီယို ၁",en:"1 video",shn:"ဝီဒီရူဝ်ႈ 1",kac:"Video 1",th:"วิดีโอ 1",zh:"1 段视频",vi:"1 video",id:"1 video",ms:"1 video"}),
    label:L9({my:"စာတန်းထိုး ဖျက်မယ်",en:"Erase burnt-in subtitles",shn:"လုပ်ႇလိၵ်ႈၼိူဝ်ငဝ်း",kac:"Video ntsa na laika mat kau",th:"ลบซับไตเติลที่ฝังในภาพ",zh:"擦掉硬字幕",vi:"Xoá phụ đề cháy hình",id:"Hapus subtitle yang menyatu",ms:"Padam sarikata terbakar"}),
    summary:L9({my:"ဗီဒီယိုပေါ်က စာတန်းထိုး/watermark ကို ဖျက် — ကျန်တာ မထိ",en:"Takes the burnt-in subtitle or watermark off and leaves the rest alone",shn:"လုပ်ႇလိၵ်ႈ/watermark — ဢၼ်ၵိုတ်း ဢမ်ႇတုမ်ႉ",kac:"Laika hte watermark mat kau — ngam ai n hkra",th:"ลบซับหรือวอเตอร์มาร์กออก โดยไม่แตะส่วนอื่น",zh:"去掉画面上的硬字幕或水印，其余不动",vi:"Xoá phụ đề hoặc watermark cháy hình, phần còn lại giữ nguyên",id:"Menghapus subtitle atau watermark yang menyatu, sisanya utuh",ms:"Membuang sarikata atau tera air yang terbakar, selebihnya kekal"}),
    hint:L9({my:"MP4 တစ်ခု — prompt မလိုပါ",en:"One MP4 — no prompt needed",shn:"MP4 ဢၼ်ၼိုင်ႈ — ဢမ်ႇလူဝ်ႇ prompt",kac:"MP4 langai — prompt n ra ai",th:"MP4 หนึ่งไฟล์ — ไม่ต้องใช้ prompt",zh:"一个 MP4 — 不需要 prompt",vi:"Một MP4 — không cần prompt",id:"Satu MP4 — tanpa prompt",ms:"Satu MP4 — tanpa gesaan"}) },

  { key:"vtChar30", art:"lib/vid/vt-char30.jpg", model:"dreamactor-v2", maxSecs:30,
    need:L9({my:"ဗီဒီယို ၁ + ပုံ ၁",en:"1 video + 1 photo",shn:"ဝီဒီရူဝ်ႈ 1 + ၶႅပ်း 1",kac:"Video 1 + sumla 1",th:"วิดีโอ 1 + รูป 1",zh:"1 段视频 + 1 张照片",vi:"1 video + 1 ảnh",id:"1 video + 1 foto",ms:"1 video + 1 foto"}),
    label:L9({my:"ဇာတ်ကောင် ထည့်မယ် (၃၀ စက္ကန့်)",en:"Your character, up to 30 seconds",shn:"သႂ်ႇတူဝ်ၸဝ်ႈၵဝ်ႇ (30 ၸဵၵ်ႇ)",kac:"Nang a masha (30s du hkra)",th:"ใส่ตัวละครของคุณ (ถึง 30 วินาที)",zh:"放入你的角色（最长 30 秒）",vi:"Nhân vật của bạn (tối đa 30 giây)",id:"Karakter Anda (hingga 30 detik)",ms:"Watak anda (sehingga 30 saat)"}),
    summary:L9({my:"ရှည်တဲ့ဗီဒီယိုအတွက် — ဗီဒီယိုရဲ့ လှုပ်ရှားမှုကို ကိုယ့်ပုံထဲက လူက ပြန်ကပြ",en:"For longer clips — the person in your photo performs the video's motion",shn:"တႃႇငဝ်းယၢဝ်း — ၵူၼ်းၼႂ်းၶႅပ်းႁၢင်ႈ ႁဵတ်းၸွမ်း",kac:"Video galu ai matu — na a sumla na masha shamu na",th:"สำหรับคลิปยาว — คนในรูปของคุณจะขยับตามคลิป",zh:"适合较长的片子 — 你照片里的人来演片中的动作",vi:"Cho clip dài hơn — người trong ảnh của bạn diễn lại chuyển động của clip",id:"Untuk klip lebih panjang — orang di foto Anda menirukan gerakan klip",ms:"Untuk klip lebih panjang — orang dalam foto anda melakukan gerakan klip"}),
    hint:L9({my:"MP4 တစ်ခု (၃၀ စက္ကန့်အထိ) နဲ့ တစ်ကိုယ်လုံး မြင်ရတဲ့ ပုံ ၁ ပုံ",en:"One MP4 (up to 30s) and one full-body photo",shn:"MP4 (30 ၸဵၵ်ႇ) လႄႈ ၶႅပ်းတဵမ်တူဝ် 1",kac:"MP4 (30s du hkra) hte hkum ting sumla 1",th:"MP4 หนึ่งไฟล์ (ไม่เกิน 30 วินาที) และรูปเต็มตัว 1 รูป",zh:"一个 MP4（不超过 30 秒）和一张全身照",vi:"Một MP4 (tối đa 30 giây) và một ảnh toàn thân",id:"Satu MP4 (maks 30 detik) dan satu foto seluruh badan",ms:"Satu MP4 (maks 30 saat) dan satu foto seluruh badan"}) }
];
var VT_CLIP_WARN = L9({my:"⚠ ဒီ ဗီဒီယိုက {S} စက္ကန့် ရှိတယ် — ဒီကတ်ရဲ့ tool က {M} စက္ကန့်ထက် ပိုတာ လက်မခံဘူး။ ဖြတ်ပြီး ပြန်တင်ပါ။",en:"⚠ This clip is {S}s — the tool this card picks takes at most {M}s. Trim it and upload again.",shn:"⚠ ဝီဒီရူဝ်ႈၼႆႉ {S} ၸဵၵ်ႇ — tool ၼႆႉႁပ်ႉလႆႈ {M} ၸဵၵ်ႇၵူၺ်း",kac:"⚠ Ndai video gaw {S}s re — ndai tool gaw {M}s sha hkam la ai",th:"⚠ คลิปนี้ยาว {S} วินาที — เครื่องมือของการ์ดนี้รับได้สูงสุด {M} วินาที ตัดแล้วอัปโหลดใหม่",zh:"⚠ 这段视频 {S} 秒 — 此卡片使用的工具最多接受 {M} 秒，请剪短后重新上传",vi:"⚠ Clip này dài {S}s — công cụ của thẻ này chỉ nhận tối đa {M}s. Hãy cắt ngắn rồi tải lên lại",id:"⚠ Klip ini {S} detik — alat kartu ini menerima maksimal {M} detik. Potong lalu unggah lagi",ms:"⚠ Klip ini {S} saat — alat kad ini menerima maksimum {M} saat. Potong dan muat naik semula"});

/* v6.7.4 — a picture replaced under its own name gets a NEW URL, so no cache
   anywhere can serve the old bytes for it. Lifted with the deck because the
   deck is what names the files. */
var LIB_ART_REV = {
  /* 6.10.0 — the ten Video Smart Workflow cards re-arted as one set (third cut) */
  "lib/vid/vt-charSwap.jpg": 3, "lib/vid/vt-faceSwap.jpg": 3, "lib/vid/vt-anime.jpg": 3,
  "lib/vid/vt-filmlook.jpg": 3, "lib/vid/vt-heritage.jpg": 3, "lib/vid/vt-extend.jpg": 3,
  "lib/vid/vt-restore.jpg": 3, "lib/vid/vt-erasesub.jpg": 3, "lib/vid/vt-char30.jpg": 3,
  "lib/vid/vt-headswap.jpg": 2,
  "lib/wf/cards5/look-golden-grecian.jpg": 2, "lib/wf/cards5/studio-look-copy.jpg": 2
};
function libArt(p){
  var k=String(p||"").replace(/^\.?\//, "").split("?")[0];
  var r=LIB_ART_REV[k];
  return r ? (p + (p.indexOf("?")>=0 ? "&" : "?") + "v=" + r) : p;
}
var API = { WF: VT_WF, KEEP: VT_KEEP, FINISH: VT_FINISH, CLIP_WARN: VT_CLIP_WARN, tr: tr, libArt: libArt,
  byKey: function (k) { for (var i = 0; i < VT_WF.length; i++) if (VT_WF[i].key === k) return VT_WF[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoToolWorkflows = API; }
})();
