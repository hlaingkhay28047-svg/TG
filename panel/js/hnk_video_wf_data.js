/* ============================================================
   HNK video-workflow catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own VID_CITIES / VID_ID / VID_KEEP /
   VID_CUT / VID_SETUP_V / VID_WF block (docs/app/index.html), copied
   verbatim so Media Lab ▸ Video offers the SAME 33 cards, the SAME prompts
   and the SAME model/resolution/duration setup the app offers, and never
   invents one. Regenerate by re-lifting that block when the app changes it.

   ONE deliberate difference, and it is in this header rather than in the
   lifted body: the app evaluates L9() at load, because its language is
   already known by the time this array is defined. In the panel these
   modules load BEFORE main.js, so a label resolved here would freeze to
   English forever. L9 is therefore the IDENTITY function here — label,
   summary and hint stay as their nine-language maps — and API.tr() resolves
   them at render time against the live language. Nothing in the lifted text
   changes; only when it is read.
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

var VID_CITIES=[
  { k:"bangkok", en:"Bangkok",   loc:"曼谷",
    my:"ဘန်ကောက်",
    fit:"a pale blush-pink chiffon sundress, a woven straw sun hat, tan leather sandals, a small shoulder bag with sunglasses hooked on the strap, an ice cream in one hand" },
  { k:"seoul",   en:"Seoul",     loc:"서울",
    my:"ဆိုးလ်",
    fit:"a blue and white striped knit top, a soft dotted midi skirt, a small red shoulder bag and red flat shoes" },
  { k:"tokyo",   en:"Tokyo",     loc:"東京",
    my:"တိုကျို",
    fit:"a crisp white blouse, a pleated black midi skirt, a slim black shoulder bag and black mary-jane shoes" },
  { k:"dali",    en:"Dali",      loc:"大理",
    my:"တာလီ",
    fit:"a layered beige tiered boho dress, a large slouchy suede shoulder bag and brown suede boots" },
  { k:"yangon",  en:"Yangon",    loc:"ရန်ကုန်",
    my:"ရန်ကုန်",
    fit:"a Myanmar htamein longyi in a finely woven pattern with a fitted lace aingyi blouse, a light shawl over one shoulder and low heeled slippers" },
  { k:"bagan",   en:"Bagan",     loc:"ပုဂံ",
    my:"ပုဂံ",
    fit:"a flowing terracotta linen dress with a wide-brimmed sun hat, a woven shoulder bag and flat sandals" },
  { k:"singapore",en:"Singapore",loc:"新加坡",
    my:"စင်္ကာပူ",
    fit:"a tailored cream linen shirt-dress with a slim belt, white sneakers and a structured tote bag" },
  { k:"hanoi",   en:"Hanoi",     loc:"Hà Nội",
    my:"ဟနွိုင်း",
    fit:"a white ao dai over soft wide trousers, a conical straw hat carried in one hand and flat sandals" }
];
var vidWfCity = VID_CITIES[0].k;
var vidWfActive = null;

function vidCityDef(k){
  for(var i=0;i<VID_CITIES.length;i++) if(VID_CITIES[i].k===k) return VID_CITIES[i];
  return VID_CITIES[0];
}

/* Every prompt below closes on the same sentences. Identity is the one
   instruction an image-to-video model drops first, and a stray caption burned
   into a delivered clip is unfixable, so both are stated in every workflow
   rather than assumed once at the top.

   v4.87 — SPLIT, because the single clause contradicted its own callers. It
   asserted "the dress, the light and the setting stay as they are" and was
   appended to Boarding Pass, whose entire job is to change her outfit as she
   passes through the card. A prompt that asks for a wardrobe change and then
   forbids one in the next sentence is a prompt the model resolves by coin
   flip. VID_ID carries only what is true of EVERY workflow — identity, one
   take, no captions. VID_HOLD adds the freeze for the workflows that really
   do hold the scene still, and the transformation workflows use VID_ID alone.
   Found while adding the five video workflows below, all of which transform
   the scene and would have inherited the same contradiction. */
var VID_ID = " Her face, bone structure, hair, makeup and identity stay exactly as the reference photograph from the first frame to the last. One continuous take, smooth steady motion, no camera shake, no text or captions anywhere in the frame beyond any lettering this shot explicitly calls for.";
var VID_KEEP = " Her face, bone structure, hair, makeup and identity stay exactly as the reference photograph from the first frame to the last, and the dress, the light and the setting stay as they are. One continuous take, smooth steady motion, no cuts, no camera shake, no text or captions anywhere in the frame.";

/* v4.94 — and a THIRD tail, for the same reason the second one exists.
   The owner sent ten makeup-look clips and asked for workflows that cut fast,
   the way those clips do. Both existing tails forbid exactly that: VID_KEEP
   says "no cuts" outright, and VID_ID says "one continuous take". Appending
   either to a prompt whose whole body is a six-shot cut list is the same
   coin-flip contradiction that was found in v4.87 — a request in the body,
   its refusal in the tail. VID_CUT keeps the one clause that is true of every
   workflow in this shelf (identity is locked) and replaces the continuity
   clause with its opposite: cut hard, hold each shot still, change across the
   cut rather than by morphing inside a shot. The makeup-only sentence is the
   other half of the lock — on a beauty edit the model's temptation is to
   "improve" the face between shots, and that is the one change that would
   make the clip useless to a studio. */
var VID_CUT = " Her face, bone structure and identity stay exactly as the reference photograph in every shot — the makeup is the only thing that changes on her, and it changes only where the shot says so. Cut hard on the beat: every shot is locked off and holds still, the change happens across the cut and never as a slow morph inside a shot, and no shot dissolves into the next. Real cosmetic texture — powder sits, cream moves, gloss stays wet, and no text or captions anywhere in the frame.";

/* v6.15.0 — a FOURTH tail, for the four reference-video cards. Their bodies are
   cut lists of a whole scene (twelve hidden-camera cuts, a four-shot reveal, a
   six-pose dance) in which the wardrobe, the hair and the place all belong to
   the card, and the men in two of the owner's clips make "Her face" wrong.
   VID_ID forbids cuts, VID_KEEP freezes the scene, VID_CUT says only the makeup
   may change — so a fourth clause: identity locked to the student's photograph,
   cuts allowed, everything else the shots' own. */
var VID_REF = " Their face, bone structure and identity stay exactly as the reference photograph in every cut — it is the face from that photograph in this video, never another person's — while the styling, wardrobe and setting follow the shots above. Cut hard between shots, no dissolves, and no text or captions anywhere in the frame, no watermarks.";

/* Omni Flash is not a taste call. It is the only registered video model with
   aspect control (these are vertical shots) and a 2048-char prompt ceiling;
   RH Video G is aspect:false with promptMax 800, and rhV2SubmitVideo clips at
   submit, so that pairing would fail silently with a prompt cut mid-sentence. */
var VID_SETUP_V = { model:"gemini-omni-video", res:"1080p", dur:"10", aspect:"9:16" };

var VID_WF=[
  { key:"boardingPass", art:"lib/vid/vw-boardingPass.jpg", cities:true, setup:VID_SETUP_V,
    label:L9({my:"လေယာဉ်လက်မှတ် ခရီးသွား",en:"Boarding Pass Travel",shn:"ၶႅပ်းၶိုၼ်ႈႁိူဝ်းမိၼ် ဢႅဝ်ႇလႄႇ",kac:"Boarding Pass Bu Hkawm",th:"บอร์ดดิ้งพาสท่องเที่ยว",zh:"登机牌旅行",vi:"Vé máy bay du lịch",id:"Boarding Pass Travel",ms:"Boarding Pass Travel"}),
    summary:L9({my:"လမ်းလျှောက်ရင်း လေယာဉ်လက်မှတ်ကြီးကို ဖြတ်ဝင် — ထွက်လာတော့ အဲဒီမြို့ရဲ့ ဝတ်စုံ",en:"She walks through a giant boarding pass and comes out dressed for that city",shn:"ယၢင်ႈၶဝ်ႈၼႂ်းၶႅပ်းၶိုၼ်ႈႁိူဝ်းမိၼ် — ဢွၵ်ႇမႃးၸွမ်းၶူဝ်းမိူင်းၼၼ်ႉ",kac:"Boarding pass kaba hpe lai nna dai mare a palawng hte pru wa ai",th:"เดินผ่านบอร์ดดิ้งพาสยักษ์ แล้วออกมาในชุดของเมืองนั้น",zh:"穿过巨大的登机牌，走出来就是那座城市的穿搭",vi:"Bước qua tấm vé khổng lồ và bước ra trong trang phục của thành phố đó",id:"Berjalan menembus boarding pass raksasa dan keluar dengan busana kota itu",ms:"Berjalan menembusi boarding pass gergasi dan keluar dengan busana bandar itu"}),
    text:function(c){
      return "Ten seconds, one continuous take, three beats. Full-body cinematic fashion-transition video, vertical 9:16, on a pure seamless white studio background with a soft contact shadow under the feet. "
       + "BEAT 1 (0-3s): the woman from the reference photo walks steadily from left to right across the empty white frame in a natural relaxed walk cycle, arms swinging, filmed at eye level with a locked-off camera, in casual travel clothes with a small backpack. "
       + "BEAT 2 (3-6s): a very large airline BOARDING PASS slides in from the right edge and settles upright in the centre, filling most of the frame height like a tall vertical panel. It is a clean modern pass: pale card stock, a coloured stub down the right side beside a small aeroplane glyph, a barcode top and bottom, and printed fields NAME, FLT, GATE, SEAT, TIME, FROM, TO, CLS. The destination "
       + c.en.toUpperCase() + " is set large across the card in outlined display type with " + c.loc + " above it, and the FROM field reads YANGON. "
       + "BEAT 3 (6-10s): the pass behaves as a portal. As she reaches its left edge she passes BEHIND the card and is revealed inside it already transformed, now dressed head to toe in " + c.fit + ". She keeps walking at the same speed inside the boarding-pass frame and exits its right edge."
       + VID_ID + " The only lettering in the shot is the printing on the boarding pass itself. Clean commercial e-commerce lookbook finish.";
    },
    hint:L9({my:"ပုံ ၁ ပုံ (တစ်ကိုယ်လုံး၊ မတ်တပ် သို့ လမ်းလျှောက်) တင်ပါ။ မြို့တစ်မြို့ကို ၁၀ စက္ကန့် တစ်ခုစီ ထုတ်ပြီး နောက်ပိုင်း ဆက်ချိတ်ပါ။",en:"Load 1 full-body photo (standing or mid-stride). One 10s clip per city — generate each, then join them.",shn:"တၢင်ႇၶႅပ်းႁၢင်ႈ 1 ဢၼ် (တူဝ်တဵမ်)။ မိူင်းၼိုင်ႈ 10 ၸႅၵ်ႉ ၼိုင်ႈဢၼ်။",kac:"Sumla 1 (hkum ting) bang u. Mare langai 10s langai galaw nna hkan matut u.",th:"ใส่รูปเต็มตัว 1 รูป — 1 คลิป 10 วิ ต่อ 1 เมือง แล้วนำมาต่อกัน",zh:"上传 1 张全身照 — 每座城市一段 10 秒，生成后再拼接",vi:"Tải 1 ảnh toàn thân — mỗi thành phố một clip 10 giây, tạo xong rồi ghép lại",id:"Unggah 1 foto seluruh badan — satu klip 10 detik per kota, lalu gabungkan",ms:"Muat naik 1 foto seluruh badan — satu klip 10 saat setiap bandar, kemudian gabungkan"}) },

  { key:"dressSpin", art:"lib/vid/vw-dressSpin.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဝတ်စုံ လှည့်ပြ",en:"Dress Spin",shn:"ဝိင်ႇၼႄၶူဝ်းၼုင်ႈ",kac:"Palawng Wai Madun",th:"หมุนโชว์ชุด",zh:"婚纱旋转",vi:"Xoay váy",id:"Putaran Gaun",ms:"Putaran Gaun"}),
    summary:L9({my:"သတို့သမီး တစ်ပတ်လှည့် — စကတ်က ဝိုင်းပြီး ဖြန့်တက်လာမယ်",en:"The bride turns once and the skirt flares out in a full circle",shn:"ဝိင်ႇၼိုင်ႈပွၵ်ႈ — သွင်ႇၶူဝ်းၽႄႈဢွၵ်ႇ",kac:"Numsha langai mi wai nna palawng krung hkra pru wa ai",th:"เจ้าสาวหมุนหนึ่งรอบ กระโปรงบานเป็นวงกลม",zh:"新娘转一圈，裙摆完整绽开",vi:"Cô dâu xoay một vòng, chân váy bung tròn",id:"Pengantin berputar sekali, rok mengembang penuh",ms:"Pengantin berpusing sekali, skirt mengembang penuh"}),
    text:function(){
      return "Ten seconds, one continuous take, vertical 9:16, built from the reference photograph. Across those ten seconds the bride turns smoothly on the spot through one continuous 360-degree twirl. Her ball-gown skirt lifts and flares outward with the turn, the tulle layers separating and then settling back down, the hem sweeping through the light. Her upper body stays tall and controlled, her head follows a beat behind the turn the way a trained dancer's does, and she comes to rest facing the camera exactly as she began. The camera is locked off at chest height. Real human speed — one unhurried revolution across the clip, with natural fabric weight and a little motion blur only at the fastest edge of the hem."
       + VID_KEEP;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ စကတ် အောက်ခြေအထိ ပါရမယ်။",en:"1 photo — full length, the whole skirt inside the frame.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ်၊ ႁၢင်ႈၶူဝ်းတင်းသဵင်ႈ",kac:"Sumla 1 — hkum ting, palawng ningpawt du hkra",th:"1 รูป — เต็มตัว เห็นกระโปรงทั้งชุด",zh:"1 张全身照 — 裙摆完整入镜",vi:"1 ảnh toàn thân — trọn chân váy trong khung",id:"1 foto seluruh badan — seluruh rok masuk frame",ms:"1 foto seluruh badan — seluruh skirt dalam bingkai"}) },

  { key:"veilWind", art:"lib/vid/vw-veilWind.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဝတ်ရုံ လေထဲ လွင့်",en:"Veil in the Wind",shn:"ၽႃႈၶလုမ်ႇ လူမ်းပတ်ႉ",kac:"Veil Nbung Hta",th:"ผ้าคลุมพลิ้วลม",zh:"头纱随风",vi:"Voan bay trong gió",id:"Kerudung Tertiup Angin",ms:"Tudung Ditiup Angin"}),
    summary:L9({my:"ဝတ်ရုံနဲ့ ဆံပင်ပဲ လှုပ်မယ် — သူမက ငြိမ်ငြိမ်",en:"Only the veil and hair move — she stays perfectly still",shn:"ၽႃႈလႄႈၶူၼ်ႁူဝ်ၵူၺ်းလူင်ႉ — မၼ်းၼၢင်းယူႇၼိမ်",kac:"Veil hte kara sha shamu ai — shi gaw zim sha",th:"ขยับแค่ผ้าคลุมกับผม — ตัวเธอนิ่ง",zh:"只有头纱与发丝在动，人保持静止",vi:"Chỉ voan và tóc chuyển động — cô ấy đứng yên",id:"Hanya kerudung dan rambut yang bergerak — dia diam",ms:"Hanya tudung dan rambut bergerak — dia diam"}),
    text:function(){
      return "Ten seconds, one continuous take, vertical 9:16, built from the reference photograph. For the whole ten seconds a steady warm breeze lifts her cathedral veil so the tulle rises and streams sideways in slow layered waves, translucent where the backlight passes through it, and a few loose strands of hair lift and fall with it. She herself stays still — chin lifted, shoulders settled, eyes calm — so the veil, the hair and the light moving through them are the only motion in the shot. The camera drifts a few centimetres to one side across the whole clip for a touch of parallax, nothing more. Golden-hour backlight, gentle lens flare at the edge, dust motes catching the sun."
       + VID_KEEP;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ဝတ်ရုံ (သို့) ဆံပင် ရှည်ရှည် မြင်ရတဲ့ပုံ အကောင်းဆုံး။",en:"1 photo — works best when a veil or long hair is clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — မီးၽႃႈၶလုမ်ႇ ဢမ်ႇၼၼ် ၶူၼ်ႁူဝ်ယၢဝ်း",kac:"Sumla 1 — veil nrai kara galu mu ai gaw grau kaja",th:"1 รูป — ได้ผลดีที่สุดเมื่อเห็นผ้าคลุมหรือผมยาวชัด",zh:"1 张照片 — 头纱或长发清晰时效果最好",vi:"1 ảnh — đẹp nhất khi thấy rõ voan hoặc tóc dài",id:"1 foto — paling bagus bila kerudung atau rambut panjang terlihat",ms:"1 foto — terbaik bila tudung atau rambut panjang jelas"}) },

  { key:"portraitLive", art:"lib/vid/vw-portraitLive.jpg", setup:VID_SETUP_V,
    label:L9({my:"ပုံတူ အသက်ဝင်",en:"Portrait Comes Alive",shn:"ၶႅပ်းႁၢင်ႈပဵၼ်တူဝ်",kac:"Sumla Asak Rawng",th:"ภาพนิ่งมีชีวิต",zh:"照片活起来",vi:"Ảnh sống dậy",id:"Potret Hidup",ms:"Potret Hidup"}),
    summary:L9({my:"မျက်တောင်ခတ်၊ အသက်ရှူ၊ ပြုံးလိုက် — အနည်းငယ်ပဲ လှုပ်မယ်",en:"A blink, a breath, the start of a smile — the smallest possible motion",shn:"ဢဝ်တႃႇလိပ်း၊ ထူၺ်ႈၸႂ်၊ ယုမ်ႉ — လူင်ႉဢေႇဢေႇ",kac:"Myi dip, nsa la, mani hpang — kachyi sha shamu ai",th:"กะพริบตา หายใจ เริ่มยิ้ม — ขยับน้อยที่สุด",zh:"眨眼、呼吸、笑意初起 — 最克制的动态",vi:"Chớp mắt, hít thở, chớm cười — chuyển động tối thiểu",id:"Berkedip, bernapas, mulai tersenyum — gerak seminimal mungkin",ms:"Berkelip, bernafas, mula senyum — gerakan seminimum mungkin"}),
    text:function(){
      return "Ten seconds, one continuous take, vertical 9:16, built from the reference photograph, holding a single quiet close portrait for the whole duration. The still frame comes to life with the smallest motion that reads as alive: her chest rises and falls once with a slow breath, she blinks twice at natural unhurried intervals, the corner of her mouth lifts into the very beginning of a smile and settles again, her eyes stay on the camera throughout, and one loose strand of hair moves a little. Nothing else changes — the framing, the light, the background and her pose are held exactly. No head turn, no zoom, no drift. The restraint is the point: it should read as a photograph that simply happens to be breathing."
       + VID_KEEP;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်စွာ မြင်ရတဲ့ portrait။",en:"1 photo — a portrait with the face clearly visible and in focus.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈလီ",kac:"Sumla 1 — myi man tsawm hkra mu ai",th:"1 รูป — ภาพบุคคลที่เห็นหน้าชัด",zh:"1 张照片 — 面部清晰的人像",vi:"1 ảnh — chân dung thấy rõ khuôn mặt",id:"1 foto — potret dengan wajah terlihat jelas",ms:"1 foto — potret dengan wajah jelas"}) },

  { key:"pushIn", art:"lib/vid/vw-pushIn.jpg", setup:VID_SETUP_V,
    label:L9({my:"ကင်မရာ တဖြည်းဖြည်း ချဉ်းကပ်",en:"Cinematic Push-In",shn:"ၵွင်ႈထၢႆႇ ၸမ်ၶဝ်ႈ",kac:"Camera Ni Wa",th:"กล้องดันเข้าหา",zh:"电影感推近",vi:"Máy quay đẩy tới",id:"Push-In Sinematik",ms:"Push-In Sinematik"}),
    summary:L9({my:"အဝေးကနေ တဖြည်းဖြည်း နီးလာတဲ့ ရုပ်ရှင်ဆန်တဲ့ ရွေ့လျားမှု",en:"One slow continuous dolly move from wide to close",shn:"လူင်ႉၸမ်ၶဝ်ႈ ဢွၼ်ႇလူႉလူႉ",kac:"Galu kaw nna zim zim ni wa ai",th:"ดอลลี่เข้าอย่างช้าและต่อเนื่อง",zh:"由远及近的一镜推进",vi:"Một cú dolly chậm từ xa vào gần",id:"Satu gerakan dolly lambat dari lebar ke dekat",ms:"Satu gerakan dolly perlahan dari luas ke dekat"}),
    text:function(){
      return "Ten seconds, one continuous take, vertical 9:16, built from the reference photograph. Across the full ten seconds the camera pushes slowly and continuously toward her in one unbroken dolly move, starting on the wide frame of the photograph and finishing on a medium frame at roughly chest height. The perspective compresses the way a real lens does as it closes — foreground elements drift out past the edges of the frame, the background flattens and softens, the depth of field grows shallower and settles on her eyes. The move is even from the first frame to the last with no acceleration, no stop and no shake. She stays still apart from a slow breath and one natural blink."
       + VID_KEEP;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ဘေးဘက် နေရာလွတ် ကျယ်ကျယ် ပါတဲ့ပုံ အကောင်းဆုံး။",en:"1 photo — works best with room around the subject to push into.",shn:"ၶႅပ်းႁၢင်ႈ 1 — မီးတီႈလွတ်ႈႁိမ်းႁွမ်း ၸင်ႇလီ",kac:"Sumla 1 — makau kaw shara nga yang grau kaja",th:"1 รูป — ได้ผลดีเมื่อมีพื้นที่รอบตัวแบบ",zh:"1 张照片 — 主体周围留白越多越好",vi:"1 ảnh — tốt nhất khi quanh chủ thể còn khoảng trống",id:"1 foto — paling bagus bila ada ruang di sekitar subjek",ms:"1 foto — terbaik bila ada ruang sekeliling subjek"}) },

  /* v4.81 — this shipped as "Couple Walk-Away" against a card showing a
     couple posed FACING the camera. The card audits this repo has already run
     (concept accuracy, then BEFORE/AFTER pose consistency) both exist because
     a card that promises a different shot than the workflow delivers is worse
     than no card. The Library has no walking-away couple plate, so the
     WORKFLOW moved to match the photograph rather than the other way round —
     and subtle motion on a posed couple is the more useful clip anyway. */
  { key:"couplePose", art:"lib/vid/vw-couplePose.jpg", setup:VID_SETUP_V,
    label:L9({my:"စုံတွဲ ပုံတူ အသက်ဝင်",en:"Couple Portrait Motion",shn:"ၶႅပ်းႁၢင်ႈၵူႈၶူႈ ပဵၼ်တူဝ်",kac:"Num la lahkawng a sumla asak rawng",th:"ภาพคู่รักมีชีวิต",zh:"双人合影动起来",vi:"Ảnh đôi chuyển động",id:"Potret Pasangan Bergerak",ms:"Potret Pasangan Bergerak"}),
    summary:L9({my:"စုံတွဲပုံကို အသက်သွင်း — အသက်ရှူ၊ မျက်လုံးချင်းဆုံ၊ ပြုံးလိုက်",en:"A posed couple photo starts breathing, glancing and smiling",shn:"ၶႅပ်းႁၢင်ႈၵူႈၶူႈ ပဵၼ်တူဝ် — ထူၺ်ႈၸႂ်၊ တူၺ်းၵၼ်၊ ယုမ်ႉ",kac:"Num la lahkawng a sumla nsa la, yu hkat, mani wa ai",th:"ภาพคู่ที่โพสไว้เริ่มหายใจ มองกัน และยิ้ม",zh:"合影开始呼吸、对视、微笑",vi:"Ảnh đôi bắt đầu thở, nhìn nhau và mỉm cười",id:"Foto pasangan mulai bernapas, saling menatap, tersenyum",ms:"Foto pasangan mula bernafas, berpandangan, tersenyum"}),
    text:function(){
      return "Ten seconds, one continuous take, vertical 9:16, built from the reference photograph of the couple, holding their pose exactly for the whole duration. The still frame comes to life with small, believable motion: both of them breathe, he turns his head a few degrees toward her and settles, she blinks and the corner of her mouth lifts into a real smile, her shoulder relaxes a little against him, and a loose strand of her hair moves. His hand stays where it is. Neither of them changes position, steps, or turns away — the framing, the light, the flowers and the background are held exactly as photographed. The camera does not move. The restraint is the point: it should read as the photograph they already love, quietly breathing."
       + VID_KEEP;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — စုံတွဲ နှစ်ယောက်လုံး မျက်နှာ ကြည်လင်စွာ ပါရမယ်။",en:"1 photo — both faces clearly visible in the frame.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈသွင်ၵေႃႉၸႅင်ႈလီ",kac:"Sumla 1 — masha lahkawng a myi man tsawm hkra mu ra ai",th:"1 รูป — เห็นหน้าทั้งสองคนชัด",zh:"1 张照片 — 两人的脸都要清晰",vi:"1 ảnh — thấy rõ khuôn mặt cả hai",id:"1 foto — kedua wajah terlihat jelas",ms:"1 foto — kedua-dua wajah jelas kelihatan"}) }
,

  /* ---- v4.87: five workflows, one per clip the owner sent ----
     Every one was read off the decoded frames. They all TRANSFORM the scene,
     so they close on VID_ID (identity + one take + no stray captions) rather
     than VID_KEEP, whose "the setting stays as it is" would fight the effect.
     Card art is three real frames from each clip, so the card cannot promise
     a different shot than the workflow delivers. */

  { key:"tinyPlanet", art:"lib/vid/vw-tinyPlanet.jpg", setup:VID_SETUP_V,
    label:L9({my:"မြို့ကို လုံးလေးဖြစ်အောင် (၃၆၀ Tiny Planet)",en:"Tiny Planet Skyline",shn:"မိူင်းပဵၼ်လုၵ်ႈမူၼ်း (360)",kac:"Mare hpe hkumdin byin (360)",th:"เมืองม้วนเป็นดาวเคราะห์จิ๋ว (360)",zh:"小行星城市 360",vi:"Hành tinh nhỏ 360",id:"Tiny Planet 360",ms:"Tiny Planet 360"}),
    summary:L9({my:"မြင်မတ်ကင်မရာ အပေါ်တက် — မြို့တစ်မြို့လုံး လုံးလေးဖြစ်ပြီး ပြန်ဖြန့်",en:"The camera lifts away and the whole city curls into a little planet, then unfurls",shn:"ၵွင်ႈထၢႆႇၶိုၼ်ႈ — မိူင်းမူၼ်းပဵၼ်လုၵ်ႈ သေ ၽႄႈၶိုၼ်း",kac:"Camera lung wa nna mare yawng hkumdin byin nna bai hpaw wa ai",th:"กล้องลอยขึ้น เมืองทั้งเมืองม้วนเป็นดาวจิ๋ว แล้วคลี่ออก",zh:"镜头升起，整座城市卷成小行星再展开",vi:"Máy quay bay lên, cả thành phố cuộn thành hành tinh nhỏ rồi mở ra",id:"Kamera naik, seluruh kota menggulung jadi planet kecil lalu terbuka",ms:"Kamera naik, seluruh bandar bergulung jadi planet kecil lalu terbuka"}),
    text:function(){
      return "Ten seconds, one continuous 360 pole-cam shot in the little-planet look, vertical 9:16, no cuts. "
       + "BEAT 1 (0-3s): the person from the reference photograph stands alone in the middle of a wide sunlit city plaza, dead centre of frame, head tilted back looking straight up into the lens, arms out to the sides. The extreme fisheye bows the paving and the horizon into a circle around her. "
       + "BEAT 2 (3-7s): the invisible pole rises steadily and the world reprojects with it — the plaza, the trees and the whole skyline of glass towers curl inward until the city has become a small round planet floating in frame with her standing tiny at its pole, bright cyan sky and a hard sun flare filling the space around the sphere. "
       + "BEAT 3 (7-10s): the projection inverts and the same towers unfold outward into a rabbit-hole tunnel running from the frame edges down to a vanishing point behind her, and she raises both hands into a small heart above her head. "
       + "She is locked dead centre and upright the whole way, unchanged in size. Bright midday sun, crisp glass and concrete."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — အပေါ်ကို မော့ကြည့်နေတဲ့ မျက်နှာ ပါရင် အကောင်းဆုံး။",en:"1 photo — best when the face is looking slightly up toward the camera.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ငိူင်ႉၼႃႈၶိုၼ်ႈၼိူဝ် ၸင်ႇလီ",kac:"Sumla 1 — myi man lung de yu yang grau kaja",th:"1 รูป — ได้ผลดีเมื่อหน้าเงยขึ้นเล็กน้อย",zh:"1 张照片 — 脸略微仰起效果最好",vi:"1 ảnh — đẹp nhất khi mặt hơi ngước lên",id:"1 foto — paling bagus bila wajah sedikit mendongak",ms:"1 foto — terbaik bila wajah sedikit mendongak"}) },

  { key:"bottleLook", art:"lib/vid/vw-bottleLook.jpg", setup:VID_SETUP_V,
    label:L9({my:"ပုလင်းပုံ ဝတ်စုံပြ (အစိမ်း ကြော်ငြာ)",en:"Bottle Cut-Out Lookbook",shn:"လုၵ်ႈၶုၺ်ႈ ၼႄၶူဝ်း (ၶဵဝ်)",kac:"Bottle hkum lookbook (tsit)",th:"ลุคบุ๊กทรงขวด (โฆษณาเขียว)",zh:"瓶型剪影穿搭（绿色广告）",vi:"Lookbook khung chai (quảng cáo xanh)",id:"Lookbook Siluet Botol (hijau)",ms:"Lookbook Siluet Botol (hijau)"}),
    summary:L9({my:"အစိမ်းနောက်ခံပေါ် ပုလင်းပုံ အဖြူထဲမှာ ဝတ်စုံလဲပြ — ပစ္စည်းတွေ လေထဲပျံ",en:"Outfit changes inside a giant white bottle cut-out on flat green, props floating around her",shn:"ၼိူဝ်ပိုၼ်ႉၶဵဝ် ၼႂ်းလုၵ်ႈၶုၺ်ႈၶၢဝ် လႅၵ်ႈၶူဝ်း — ၶူဝ်းၶွင်ပိဝ်",kac:"Tsit hpang kaw bottle hpraw hta palawng galai — arung ni pyen ai",th:"เปลี่ยนลุคในซิลูเอทขวดสีขาวบนพื้นเขียว พร็อพลอยรอบตัว",zh:"绿底白色瓶型剪影里换装，道具漂浮环绕",vi:"Đổi đồ trong khung chai trắng trên nền xanh, đạo cụ bay quanh",id:"Ganti outfit dalam siluet botol putih di latar hijau, properti melayang",ms:"Tukar pakaian dalam silueт botol putih di latar hijau, prop melayang"}),
    text:function(){
      return "Ten seconds, vertical 9:16 commercial on a flat saturated grass-green background, three styled beats of about three seconds each. "
       + "Throughout: a tall white silhouette in the exact shape of a soda bottle — narrow neck and cap, shoulders, straight body — stands centre frame like a window cut out of the green, and the person from the reference photograph is inside it, lit bright and clean so she reads as a cut-out sticker. Bold flat green Chinese characters sit large in the corners of the green field behind the bottle. "
       + "BEAT 1 (0-3s): she stands relaxed in a knit tee and visor holding a slim green glass soda bottle, and takes an easy sip. "
       + "BEAT 2 (3-6.5s): hard snap, and her outfit changes head to toe — a cropped shirt with a wrap skirt and white sneakers — into a new pose, mid-stride inside the bottle shape. "
       + "BEAT 3 (6.5-10s): hard snap again to denim dungarees over a striped tee, caught mid-jump. "
       + "On every beat a few small green-and-white props float and rotate slowly around her against the green — a compact camera, a bucket hat, sneakers, a mesh tote. Punchy commercial timing, hard clean edges, even shadowless light on her, high-saturation colour."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ နောက်ခံ ရှင်းရှင်း အကောင်းဆုံး။",en:"1 photo — full body, a plain background works best.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ်၊ လင်မိူၼ်ႁၢင်ႈလွင်ႈ",kac:"Sumla 1 — hkum ting, hpang san seng ai grau kaja",th:"1 รูป — เต็มตัว พื้นหลังเรียบดีที่สุด",zh:"1 张全身照 — 背景越简洁越好",vi:"1 ảnh toàn thân — nền trơn là tốt nhất",id:"1 foto seluruh badan — latar polos paling bagus",ms:"1 foto seluruh badan — latar polos paling bagus"}) },

  { key:"phonePortal", art:"lib/vid/vw-phonePortal.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဖုန်းထဲ ဝင်သွား (ရထားတွဲ)",en:"Phone Portal Subway",shn:"ၶဝ်ႈၼႂ်းၾူင်း (ရူတ်ႉၾႆး)",kac:"Phone hta shang wa (mari sanit)",th:"ทะลุเข้าไปในมือถือ (รถไฟใต้ดิน)",zh:"走进手机（地铁车厢）",vi:"Bước vào điện thoại (tàu điện)",id:"Masuk ke Dalam Ponsel (kereta)",ms:"Masuk ke Dalam Telefon (kereta)"}),
    summary:L9({my:"ရထားတွဲထဲ ဖုန်းကြီးပေါ်လာ — သူမ ဖုန်းထဲရောက်ပြီး လက်က မျက်နှာပြင်ကနေ ထွက်လာ",en:"A giant phone appears in the carriage, she ends up inside the screen and a hand pushes back out of it",shn:"ၼႂ်းရူတ်ႉ ၾူင်းလူင်ဢွၵ်ႇမႃး — မၼ်းၼၢင်းၶဝ်ႈၼႂ်း သေ မိုဝ်းဢွၵ်ႇမႃး",kac:"Sanit hta phone kaba pru wa — shi phone hta shang nna lata pru wa ai",th:"มือถือยักษ์โผล่ในตู้รถไฟ เธอเข้าไปอยู่ในจอ แล้วมือทะลุออกมา",zh:"车厢里出现巨型手机，她进入屏幕，手再从屏幕伸出",vi:"Điện thoại khổng lồ xuất hiện trong toa, cô vào trong màn hình rồi bàn tay thò ra",id:"Ponsel raksasa muncul di gerbong, dia masuk ke layar lalu tangan menembus keluar",ms:"Telefon gergasi muncul dalam gerabak, dia masuk ke skrin lalu tangan menembusi keluar"}),
    text:function(){
      return "Ten seconds, vertical 9:16, one continuous move inside a modern metro carriage shot down the centre aisle with a wide lens, three beats. "
       + "BEAT 1 (0-3s): bright and clean. The person from the reference photograph, in a soft pink lounge set, dances loosely down the empty aisle, turning and reaching, the camera following her. "
       + "BEAT 2 (3-6s): a giant smartphone — slim titanium body, triple camera island, as tall as she is — swings into the carriage and tumbles slowly end over end through the air past her, and the carriage light drops away to a deep moody blue-black as it passes. "
       + "BEAT 3 (6-10s): the phone settles upright in the centre of the aisle and its screen lights up, and she is now INSIDE the screen in a sleek black bodysuit, looking out through the glass. She presses one hand to the inside of the display and it comes THROUGH — pushing out of the glowing screen into the real carriage in forced perspective, palm wide open and fingers splayed enormous toward the lens, her small figure still visible behind the glass. "
       + "Cool cinematic grade, real hand-held weight in the opening, hard specular highlights on the phone body."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ မတ်တပ်ပုံ အကောင်းဆုံး။",en:"1 photo — full body, standing, works best.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ် ၸုၵ်းယူႇ",kac:"Sumla 1 — hkum ting, tsap nga ai",th:"1 รูป — เต็มตัว ท่ายืน ดีที่สุด",zh:"1 张全身站姿照效果最好",vi:"1 ảnh toàn thân, tư thế đứng là tốt nhất",id:"1 foto seluruh badan, berdiri, paling bagus",ms:"1 foto seluruh badan, berdiri, paling bagus"}) },

  { key:"cnyTiger", art:"lib/vid/vw-cnyTiger.jpg", setup:VID_SETUP_V,
    label:L9({my:"နှစ်သစ်ကူး ကျားပိုစတာ",en:"New Year Tiger Poster",shn:"ပီႇမႂ်ႇ ပိုတ်ႇသတႃႇသိူဝ်",kac:"Ningnan Sharaw Poster",th:"โปสเตอร์เสือตรุษจีน",zh:"新春虎年海报",vi:"Poster hổ Tết",id:"Poster Macan Tahun Baru",ms:"Poster Harimau Tahun Baru"}),
    summary:L9({my:"နှစ်သစ်ကူး စာလိပ်ရေးနေရာက အနီရောင် ကျားပိုစတာ အဖြစ် ပြောင်း",en:"Writing red New Year couplets turns into a red poster with a tiger rising behind her",shn:"တႅမ်ႈလိၵ်ႈပီႇမႂ်ႇ သေ ပဵၼ်ပိုတ်ႇသတႃႇလႅင် မီးသိူဝ်",kac:"Ningnan laika ka nna sharaw hte hkyeng poster byin wa ai",th:"เขียนคำอวยพรแดง แล้วกลายเป็นโปสเตอร์แดงมีเสืออยู่ข้างหลัง",zh:"写春联转场成红底虎年海报",vi:"Viết câu đối đỏ rồi hóa thành poster đỏ có hổ phía sau",id:"Menulis kaligrafi merah lalu jadi poster merah dengan macan",ms:"Menulis kaligrafi merah lalu jadi poster merah dengan harimau"}),
    text:function(){
      return "Ten seconds, vertical 9:16 in two acts, one camera locked off at chest height over a table top. "
       + "ACT ONE (0-5s), quiet and real: the person from the reference photograph sits at a wooden table in a dim old courtyard corridor, stone columns falling out of focus behind her in cool grey-green light. She wears a heavy checked padded jacket over a high pale collar, her dark hair in a blunt fringe. Long strips of bright red couplet paper lie in front of her and she works on them calmly — smoothing a strip flat, setting it straight — eyes down on her hands. "
       + "THE TURN (at 5s): on one beat the whole frame floods to deep saturated festival red. "
       + "ACT TWO (5-10s), graphic and bold: she is now in a red-and-white traditional New Year outfit with a red collar wrap and red tassels in her hair, hands resting on the same red couplets, looking straight down the lens with a small confident smile. The head and shoulders of a large tiger rise directly behind her, its face just above and behind her head, striped orange fur catching the light. Four huge black Chinese calligraphy characters sit in the corners of the red field and small white sparkles drift through the air. "
       + "Rich lacquer red, deep blacks in the calligraphy, warm rim light on her hair and the tiger fur. The lettering in the shot is the New Year calligraphy and the couplets."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ခါးအထက် မျက်နှာ ကြည်လင်စွာ ပါရမယ်။",en:"1 photo — waist up, face clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၶိုၼ်ႈၼိူဝ်ဢႅဝ်၊ ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — n-gup ntsa, myi man mu ra ai",th:"1 รูป — ครึ่งตัวบน เห็นหน้าชัด",zh:"1 张照片 — 半身，面部清晰",vi:"1 ảnh — nửa người trên, thấy rõ mặt",id:"1 foto — separuh badan, wajah jelas",ms:"1 foto — separuh badan, wajah jelas"}) },

  { key:"specSheet", art:"lib/vid/vw-specSheet.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဝတ်စုံ Spec Sheet (Look ၄ မျိုး)",en:"Model Spec-Sheet Lookbook",shn:"Spec Sheet ၶူဝ်းၼုင်ႈ (Look 4)",kac:"Palawng spec sheet (Look 4)",th:"ลุคบุ๊กสเปกชีต (4 ลุค)",zh:"模特参数表穿搭（4 套）",vi:"Lookbook bảng thông số (4 look)",id:"Lookbook Spec Sheet (4 look)",ms:"Lookbook Spec Sheet (4 look)"}),
    summary:L9({my:"အတိုင်းအတာ မှတ်စုတွေနဲ့ ရှေ့/ဘေး/နောက် သုံးမြင်ကွင်း — Look တစ်ခုပြီး တစ်ခု",en:"Front, side and back in one row with measurement callouts — one styled Look after another",shn:"ၼႃႈ/ၶၢင်ႈ/လင် သၢမ်ၽၢႆႇ မီးၶေႃႈမၢႆ — Look ဢၼ်ၼိုင်ႈသေဢၼ်ၼိုင်ႈ",kac:"Shawng/makau/hpang masum, shingra masat hte — Look langai hpang langai",th:"หน้า ข้าง หลัง เรียงแถวพร้อมตัวเลขสัดส่วน — ทีละลุค",zh:"正面、侧面、背面三视图配尺寸标注 — 一套接一套",vi:"Trước, ngang, sau cùng hàng kèm số đo — từng look một",id:"Depan, samping, belakang satu baris dengan ukuran — look demi look",ms:"Depan, sisi, belakang satu baris dengan ukuran — look demi look"}),
    text:function(){
      return "Ten seconds, vertical 9:16 fashion lookbook on a clean off-white paper backdrop, shot flat and straight on with a locked-off camera and even shadowless light, three beats. "
       + "BEAT 1 (0-3s): the person from the reference photograph stands alone in a plain white tee and black shorts with white socks and flat shoes, and thin technical annotation lines draw themselves onto the frame around her like a garment spec sheet — slim rules with small serif labels reading Shoulders, Bust, Waist, Hips, Height, Leg Length, a weight in kilograms and a Unit: cm note in the corner. "
       + "BEAT 2 (3-6.5s): the frame divides into a row of three of her side by side — the same person in the same outfit seen FRONT, SIDE and BACK, evenly spaced and aligned on one baseline — with a small clean label reading Look 1 low on the left and a short row of flat colour swatch chips beside it. "
       + "BEAT 3 (6.5-10s): the row holds its three-up layout and snaps to Look 2 — a striped raglan over floral shorts with a blue beanie and white sneakers — its own label and its own swatch chips, fine measurement rules still along the edges. "
       + "Neutral true colour, crisp fabric texture, catalogue-clean finish. The only lettering is the spec-sheet annotation and the Look labels."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ ရှေ့တည့်တည့် မတ်တပ်ပုံ အကောင်းဆုံး။",en:"1 photo — full body, standing straight to camera works best.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ်၊ ၸုၵ်းၼႃႈတေႃႇ",kac:"Sumla 1 — hkum ting, shawng de tsap ai",th:"1 รูป — เต็มตัว ยืนตรงหน้ากล้อง ดีที่สุด",zh:"1 张全身照 — 正面站立效果最好",vi:"1 ảnh toàn thân — đứng thẳng hướng máy là tốt nhất",id:"1 foto seluruh badan — berdiri lurus ke kamera",ms:"1 foto seluruh badan — berdiri lurus ke kamera"}) }
,

  /* ---- v4.89: eight more, from the owner's second batch ----
     The ninth clip he sent is the Boarding Pass concept already shipped above
     as `boardingPass`; it is not duplicated here. */

  { key:"makeupSwipe", art:"lib/vid/vw-makeupSwipe.jpg", setup:VID_SETUP_V,
    label:L9({my:"မိတ်ကပ် ရွေးချယ်ခြင်း (App)",en:"Makeup Swipe App",shn:"လိူၵ်ႈ make-up (App)",kac:"Makeup lata (App)",th:"แอปปัดเลือกเมคอัพ",zh:"妆容滑动挑选 App",vi:"App vuốt chọn trang điểm",id:"Aplikasi Geser Makeup",ms:"Aplikasi Leret Solekan"}),
    summary:L9({my:"ဖုန်း app ထဲက မိတ်ကပ်ကို ♥ နှိပ်လိုက်ရင် ဘောင်ထဲက သူမ ပြောင်းသွား",en:"Tap the heart in the phone app and the look lands on her in the frame",shn:"ဢဝ်ၸႂ်ႁၵ်ႉ ♥ သေ ႁၢင်ႈၼႂ်းၶွပ်ႇလႅၵ်ႈ",kac:"Phone app kaw ♥ hpe dip yang shi galai wa ai",th:"กดหัวใจในแอป แล้วลุคเปลี่ยนบนตัวเธอในกรอบ",zh:"在手机 App 里点心形，画框里的她就换好妆",vi:"Chạm tim trong app, layout trên khung đổi ngay",id:"Ketuk hati di app, riasan langsung menempel",ms:"Ketik hati dalam app, solekan terus melekat"}),
    text:function(){
      return "Ten seconds, vertical 9:16 commercial in a clean white tiled bathroom, two beats. "
       + "Throughout: the person from the reference photograph stands inside a slim chrome-framed wall mirror mounted on the tile, seen head to waist, and a hand holds a modern smartphone up into the foreground filling the right of the frame, running a beauty app with a small wordmark at the top. "
       + "BEAT 1 (0-5s): she is in soft pink loungewear with a padded headband, hair pushed back, bare-faced. The phone card shows her own face wearing a finished makeup look, labelled MAKEUP 02 with a small timer chip beneath it, and two round buttons sit below the card — a cross on the left, a heart on the right. The thumb moves to the heart. "
       + "BEAT 2 (5-10s): the thumb taps. The card fills with a large black heart, and in the same beat the woman in the mirror changes — the finished makeup from the card is now on her face, her hair falls sleek instead of pushed back, and her top has become a sharp black one. She turns her head slowly to check the result in the glass. "
       + "Crisp white tile, cool even daylight, glossy product-commercial finish."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်စွာ ပါတဲ့ ခါးအထက်ပုံ။",en:"1 photo — waist up with the face clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — myi man mu ai",th:"1 รูป — ครึ่งตัวบน เห็นหน้าชัด",zh:"1 张半身照，面部清晰",vi:"1 ảnh nửa người, thấy rõ mặt",id:"1 foto separuh badan, wajah jelas",ms:"1 foto separuh badan, wajah jelas"}) },

  { key:"trafficType", art:"lib/vid/vw-trafficType.jpg", setup:VID_SETUP_V,
    label:L9({my:"မီးပွိုင့် စာလုံးကြီး ဝတ်စုံပြ",en:"Traffic Light Type Lookbook",shn:"တူဝ်လိၵ်ႈယႂ်ႇ မီးၽႆး ၼႄၶူဝ်း",kac:"Traffic light laika kaba lookbook",th:"ลุคบุ๊กไฟจราจรตัวอักษรยักษ์",zh:"红绿灯巨型字体穿搭",vi:"Lookbook chữ lớn đèn giao thông",id:"Lookbook Tipografi Lampu Lalu Lintas",ms:"Lookbook Tipografi Lampu Isyarat"}),
    summary:L9({my:"WALK / ALERT / STOP စာလုံးကြီးရှေ့မှာ မီးရောင်လိုက် ဝတ်စုံလဲ",en:"Outfit changes in front of giant WALK, ALERT and STOP type, one per signal colour",shn:"ၼႃႈတူဝ်လိၵ်ႈယႂ်ႇ WALK/ALERT/STOP လႅၵ်ႈၶူဝ်းၸွမ်းသီမီး",kac:"WALK/ALERT/STOP laika kaba shawng kaw palawng galai",th:"เปลี่ยนลุคหน้าตัวอักษรยักษ์ WALK ALERT STOP ตามสีไฟ",zh:"在巨大的 WALK / ALERT / STOP 字体前按灯色换装",vi:"Đổi đồ trước chữ WALK / ALERT / STOP theo màu đèn",id:"Ganti outfit di depan tipografi WALK/ALERT/STOP sesuai warna lampu",ms:"Tukar pakaian di depan tipografi WALK/ALERT/STOP ikut warna lampu"}),
    text:function(){
      return "Ten seconds, vertical 9:16 graphic fashion video in editorial poster style on a flat white background, three beats of about three seconds. "
       + "Throughout: the person from the reference photograph is centre frame, cut out cleanly against the white with a small slab of grey pavement under her feet, and one enormous word fills the whole frame behind her in a heavy condensed sans-serif with rough letterpress texture, with a black three-lamp traffic signal at the right edge and exactly one lamp lit. "
       + "BEAT 1 (0-3.5s): WALK in deep green, green lamp lit, and she strides across the frame in profile mid-step in a white top with green layers and trainers. "
       + "BEAT 2 (3.5-6.5s): hard snap to ALERT in warm yellow, amber lamp lit, and she jogs through in a yellow-toned summer set with a straw hat and a bunch of yellow flowers. "
       + "BEAT 3 (6.5-10s): hard snap to STOP in deep red, red lamp lit, and she halts square to camera, hand on hip, in white with a red scarf and red flats. "
       + "She passes in front of the letters and the letters pass behind her, so she is always readable against them. Flat poster colour, hard clean cut-out edges, a little print grain."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ နောက်ခံ ရှင်းရင် ပိုကောင်း။",en:"1 photo — full body, a plain background helps.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ်",kac:"Sumla 1 — hkum ting",th:"1 รูป — เต็มตัว พื้นหลังเรียบจะดี",zh:"1 张全身照，背景简洁更好",vi:"1 ảnh toàn thân, nền trơn thì tốt",id:"1 foto seluruh badan, latar polos lebih baik",ms:"1 foto seluruh badan, latar polos lebih baik"}) },

  { key:"bossFight", art:"lib/vid/vw-bossFight.jpg", setup:VID_SETUP_V,
    label:L9({my:"နေ့စဉ်ဘဝ Boss Fight",en:"Daily Boss Fight",shn:"Boss Fight ဝၼ်းၼိုင်ႈ",kac:"Shani shagu Boss Fight",th:"บอสไฟท์ประจำวัน",zh:"每日 Boss 战",vi:"Boss Fight mỗi ngày",id:"Boss Fight Harian",ms:"Boss Fight Harian"}),
    summary:L9({my:"အိပ်ရာထ → လက်အိတ်စွပ် → အမှောင်ရိပ်ကြီးနဲ့ တိုက် → အနားယူ",en:"Wake up, glove up, fight a giant shadow with a health bar, then rest",shn:"တိုၼ်ႇ → သႂ်ႇမိုဝ်း → တိုၵ်းငဝ်းလူင် → လိုဝ်ႈ",kac:"Rawt → lata bang → hkum shada kaba hte gasat → hkring",th:"ตื่นนอน สวมนวม สู้กับเงายักษ์พร้อมหลอดพลัง แล้วพักผ่อน",zh:"起床、戴上拳套、与带血条的巨影对战，然后休息",vi:"Thức dậy, đeo găng, đấu với bóng khổng lồ có thanh máu, rồi nghỉ",id:"Bangun, pakai sarung tinju, lawan bayangan raksasa berdarah, lalu istirahat",ms:"Bangun, pakai sarung tinju, lawan bayang gergasi berdarah, lalu rehat"}),
    text:function(){
      return "Ten seconds, vertical 9:16 cinematic short, three beats. This is the fight, not the whole day — it opens already in the arena. "
       + "BEAT 1 (0-3s): a dark grey seamless void. The person from the reference photograph stands in a charcoal sweatshirt with white boxing hand-wraps taped around her fists, raises her guard to either side of her face and looks straight down the lens with a level, unafraid expression. "
       + "BEAT 2 (3-6s): she throws two clean straight punches at the camera, the wraps snapping past the lens, her shoulders rotating properly behind each one. "
       + "BEAT 3 (6-10s): the camera pulls back fast into a wide shot of the same void filled with low rolling fog. A colossal matte-black creature the size of a building looms in the upper half, her small figure far below it with her back to camera, coat moving in the draught. A slim game-style health bar labelled Reality sits across the top of the frame with a few notches lit, and it drains as she walks forward toward the thing. "
       + "Cool desaturated grade, real weight to the fog and the fabric, deep blacks."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်စွာ ပါတဲ့ တစ်ကိုယ်လုံး သို့ ခါးအထက်။",en:"1 photo — full body or waist up with the face clear.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — myi man mu ai",th:"1 รูป — เต็มตัวหรือครึ่งตัว เห็นหน้าชัด",zh:"1 张全身或半身照，面部清晰",vi:"1 ảnh toàn thân hoặc nửa người, rõ mặt",id:"1 foto seluruh atau separuh badan, wajah jelas",ms:"1 foto seluruh atau separuh badan, wajah jelas"}) },

  { key:"getReady", art:"lib/vid/vw-getReady.jpg", setup:VID_SETUP_V,
    label:L9({my:"မနက်ခင်း ပြင်ဆင်ခြင်း (အနီခန်း)",en:"Get Ready With Me · Red Room",shn:"ႁၢင်ႈႁႅၼ်းၵၢင်ၼႂ် (ႁွင်ႈလႅင်)",kac:"Jahpawt hkyen (hkyeng gawk)",th:"แต่งตัวไปด้วยกัน ห้องแดง",zh:"和我一起准备 · 红色衣帽间",vi:"Chuẩn bị cùng tôi · phòng đỏ",id:"Get Ready With Me · Ruang Merah",ms:"Get Ready With Me · Bilik Merah"}),
    summary:L9({my:"နာရီမြည် → အသားအရေ → မိတ်ကပ် → နောက်ဆုံး look အထိ တစ်ဆက်တည်း",en:"Alarm to finished look in one continuous get-ready sequence",shn:"မွင်းမူင်း → ၽိဝ်ၼိူဝ်ႉ → make-up → look လိုၼ်းသုတ်း",kac:"Alarm → hpyi → makeup → hpang jahtum look",th:"ตั้งแต่นาฬิกาปลุกจนถึงลุคสำเร็จในซีนเดียว",zh:"从闹钟响到完成造型，一镜到底",vi:"Từ chuông báo đến look hoàn chỉnh trong một mạch",id:"Dari alarm sampai look jadi dalam satu rangkaian",ms:"Dari penggera sampai look siap dalam satu rangkaian"}),
    text:function(){
      return "Ten seconds, vertical 9:16 get-ready-with-me video, shot as if on a phone propped in front of her and filling the frame, three beats. Her framing and the camera never move. "
       + "Throughout: the person from the reference photograph sits facing camera in a walk-in wardrobe whose rails are packed with red and black clothing, red boots and bags on the shelves behind her, all lit in a deep saturated red glow. "
       + "BEAT 1 (0-3s): a phone lock-screen clock reading 07:10 with a small alarm toggle sits over the top of the picture. She is in a plain cream sweatshirt, hair flat, no makeup, rubbing her eyes and checking her watch. "
       + "BEAT 2 (3-6.5s): quick cuts on the beat, same framing — she presses a cushion sponge across her face, draws on a lip tint with her mouth relaxed, and brushes her fringe into shape with a round brush. "
       + "BEAT 3 (6.5-10s): she shakes out a red garment toward the lens and lands on the finished look — sharp dark bob, defined brows, deep berry lip, a sheer red-and-black patterned top with fine chain necklaces — holding a confident still pose straight at camera. "
       + "Saturated red ambience, punchy vlog cuts, real cosmetic textures."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ရှေ့တည့်တည့် မျက်နှာပုံ။",en:"1 photo — facing the camera, face clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈတေႃႇ",kac:"Sumla 1 — shawng de yu ai",th:"1 รูป — หันหน้าเข้ากล้อง",zh:"1 张正面照",vi:"1 ảnh chính diện",id:"1 foto menghadap kamera",ms:"1 foto menghadap kamera"}) },

  { key:"wonderland", art:"lib/vid/vw-wonderland.jpg", setup:VID_SETUP_V,
    label:L9({my:"အံ့ဖွယ်ကမ္ဘာ (Gothic Alice)",en:"Gothic Wonderland",shn:"မိူင်းလီၸႂ် (Gothic Alice)",kac:"Mau shadu ga (Gothic Alice)",th:"วันเดอร์แลนด์โกธิค",zh:"哥特爱丽丝仙境",vi:"Xứ thần tiên Gothic",id:"Wonderland Gothic",ms:"Wonderland Gothic"}),
    summary:L9({my:"ဖဲချပ်လွင့် → ပန်းမျက်နှာကြက် → မှန်ဘောင် → နာရီဥမင် → နန်းတော်",en:"Flying cards, a rose ceiling, an ornate mirror, a clock tunnel and a marble hall",shn:"ၽႃႈလဵၼ်ႈပိဝ် → မွၵ်ႇ → ႁွင်ႈမၢၼ်ႈ → မူင်း → ႁေႃ",kac:"Card pyen → nampan → mirror → na-ri lam → hkawhkam",th:"ไพ่ปลิว เพดานกุหลาบ กระจกวิจิตร อุโมงค์นาฬิกา และโถงหินอ่อน",zh:"飞舞纸牌、玫瑰天花、华丽镜框、时钟隧道与大理石厅",vi:"Bài bay, trần hoa hồng, gương chạm trổ, đường hầm đồng hồ và sảnh đá",id:"Kartu beterbangan, langit-langit mawar, cermin ukir, terowongan jam, aula marmer",ms:"Kad berterbangan, siling mawar, cermin ukir, terowong jam, dewan marmar"}),
    text:function(){
      return "Ten seconds, vertical 9:16 gothic Alice-in-Wonderland fantasy, one continuous flight through three spaces. "
       + "Throughout: the person from the reference photograph wears a black-and-white gothic lolita dress — a wide bell skirt with vertical stripes, a stiff white collar, puffed sleeves — with black-and-white striped stockings, buckled shoes and a small crown of white rabbit ears, and she stays centred and facing camera. "
       + "BEAT 1 (0-3.5s): a tall arched hall with a black-and-white chequerboard marble floor running away behind her, playing cards streaming through the air past her in swirling arcs while she stands with her arms lifted. "
       + "BEAT 2 (3.5-7s): the camera falls through a tunnel of hundreds of pocket watches and turning brass gears with tiny blue butterflies among them, her figure carried down through the middle of it. "
       + "BEAT 3 (7-10s): it lands back in the marble hall, wider now, with white rabbits bounding across the chequerboard toward her as she stands calm at the centre. "
       + "Desaturated silver-and-ivory palette with deep blacks, ornate baroque detail, dreamlike but photographic."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်စွာ ပါရမယ်။",en:"1 photo — the face clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — myi man mu ai",th:"1 รูป — เห็นหน้าชัด",zh:"1 张照片，面部清晰",vi:"1 ảnh, thấy rõ mặt",id:"1 foto, wajah jelas",ms:"1 foto, wajah jelas"}) },

  { key:"receiptLook", art:"lib/vid/vw-receiptLook.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဘောက်ချာ ဝတ်စုံပြ",en:"Receipt Lookbook",shn:"ၽိုၼ်ငိုၼ်း ၼႄၶူဝ်း",kac:"Receipt lookbook",th:"ลุคบุ๊กใบเสร็จ",zh:"小票穿搭",vi:"Lookbook hóa đơn",id:"Lookbook Struk",ms:"Lookbook Resit"}),
    summary:L9({my:"ဆိုင်တစ်ဆိုင်ချင်းရဲ့ ဘောက်ချာကြီးရှေ့မှာ အဲဒီအရောင်နဲ့ ဝတ်စုံပြ",en:"She poses against a giant café receipt, dressed in that brand's colours",shn:"ၼႃႈၽိုၼ်ငိုၼ်းယႂ်ႇ ၼုင်ႈသီႁၢၼ်ႉၼၼ်ႉ",kac:"Receipt kaba shawng kaw dai shop a color hte",th:"โพสหน้าใบเสร็จร้านยักษ์ ในชุดสีของแบรนด์นั้น",zh:"在巨型咖啡小票前，穿该品牌配色的造型",vi:"Tạo dáng trước hóa đơn khổng lồ, mặc màu của thương hiệu đó",id:"Berpose di depan struk raksasa, berbusana warna brand itu",ms:"Berposing di depan resit gergasi, berpakaian warna jenama itu"}),
    text:function(){
      return "Ten seconds, vertical 9:16 commercial lookbook on a flat off-white background, three beats. "
       + "BEAT 1 (0-2.5s): the person from the reference photograph stands centre frame in a long cream apron over brown trousers holding a floor squeegee, with a small oval wooden sign hanging in front of her reading CLOSED. She flips it and it now reads OPEN. "
       + "BEAT 2 (2.5-6s): a single enormous printed cafe receipt fills the frame behind her, standing upright like a tall paper banner with a serrated top edge, a shop logo and name across the top and columns of small itemised lines, quantities and prices running down it with a big order number near the bottom. She is composited in front of it, cut out cleanly, mid-stride with a drink cup in one hand, in a navy-and-black barista set. "
       + "BEAT 3 (6-10s): hard snap to a second receipt with a different shop logo and a different colour, and her outfit changes to match it — a powder-blue mandarin-collar dress with an apron — caught mid-jump. "
       + "Small brand-coloured props tumble slowly in the space around her. Crisp paper texture on the receipts, flat even studio light on her, clean cut-out edges. The only lettering is the printing on the receipts and the shop sign."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — တစ်ကိုယ်လုံး၊ မတ်တပ်ပုံ။",en:"1 photo — full body, standing.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တူဝ်တဵမ်",kac:"Sumla 1 — hkum ting",th:"1 รูป — เต็มตัว ท่ายืน",zh:"1 张全身站姿照",vi:"1 ảnh toàn thân, đứng",id:"1 foto seluruh badan, berdiri",ms:"1 foto seluruh badan, berdiri"}) },

  { key:"sparkNight", art:"lib/vid/vw-sparkNight.jpg", setup:VID_SETUP_V,
    label:L9({my:"ညမီးပွင့် ပုံတူ",en:"Sparkler Night Portrait",shn:"ၽႆးမွၵ်ႇ ၵၢင်ၶိုၼ်း",kac:"Shana wan pan sumla",th:"ภาพพลุประกายกลางคืน",zh:"夜色烟花人像",vi:"Chân dung pháo hoa đêm",id:"Potret Kembang Api Malam",ms:"Potret Bunga Api Malam"}),
    summary:L9({my:"မှောင်ထဲ မီးပွင့်တွေကြားမှာ နူးညံ့တဲ့ ညပုံတူ",en:"A soft night portrait among cold-spark fountains and warm bokeh",shn:"ၼႂ်းမိုတ်ႈ မီးမွၵ်ႇ — ၶႅပ်းႁၢင်ႈၵၢင်ၶိုၼ်းဢွၼ်ႇ",kac:"Nsin hta wan pan lapran — shana sumla",th:"ภาพบุคคลกลางคืนนุ่มนวลท่ามกลางน้ำพุประกายไฟ",zh:"夜色中冷焰火与暖散景里的柔美人像",vi:"Chân dung đêm dịu giữa pháo lạnh và bokeh ấm",id:"Potret malam lembut di antara air mancur kembang api",ms:"Potret malam lembut antara pancutan bunga api"}),
    text:function(){
      return "Ten seconds, vertical 9:16 cinematic night portrait, filmed almost entirely in the dark, one slow continuous take. "
       + "Throughout: the person from the reference photograph stands outdoors at night in a simple pale slip dress with thin straps, hair loose, holding a lit sparkler in one raised hand. Several cold-spark fountains on the ground throw tall silent plumes of white-gold sparks straight upward, and the air fills with drifting points of light falling out of focus into big soft round bokeh across the whole frame. "
       + "BEAT 1 (0-4s): she turns her face toward the sparks so the light rakes across her cheek and collarbone, and lifts the sparkler to watch it. "
       + "BEAT 2 (4-7s): she brings her hands together in front of her chest, the sparkler light catching her fingers and the front of the dress. "
       + "BEAT 3 (7-10s): she turns away so she reads as a soft silhouette against the glow, her hair lifting with the movement. "
       + "The camera drifts a few centimetres to one side across the whole clip for parallax and nothing more. Deep black background with only the sparks lighting her, warm gold on the skin against the cool night, heavy shallow depth of field, faint haze catching the light."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ခါးအထက်ပုံ အကောင်းဆုံး။",en:"1 photo — waist up works best.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၶိုၼ်ႈၼိူဝ်ဢႅဝ်",kac:"Sumla 1 — n-gup ntsa",th:"1 รูป — ครึ่งตัวบนดีที่สุด",zh:"1 张半身照效果最好",vi:"1 ảnh nửa người là tốt nhất",id:"1 foto separuh badan paling bagus",ms:"1 foto separuh badan paling bagus"}) },

  { key:"stageIdol", art:"lib/vid/vw-stageIdol.jpg", setup:VID_SETUP_V,
    label:L9({my:"Filter ကနေ ဇာတ်ခုံပေါ်",en:"Filter to Stage",shn:"တီႈ Filter ၶိုၼ်ႈၼိူဝ်ၶူင်ႇ",kac:"Filter kaw nna stage de",th:"จากฟิลเตอร์สู่เวที",zh:"从滤镜走上舞台",vi:"Từ filter lên sân khấu",id:"Dari Filter ke Panggung",ms:"Dari Filter ke Pentas"}),
    summary:L9({my:"ဖုန်း filter ရွေးနေရာက ဇာတ်ခုံမီးရောင်အောက် idol အဖြစ် ပြောင်း",en:"Swiping phone filters cuts to her on a concert stage with a microphone",shn:"လိူၵ်ႈ filter သေ ၶိုၼ်ႈၶူင်ႇ idol",kac:"Filter lata nna stage de idol byin",th:"ปัดเลือกฟิลเตอร์แล้วตัดไปบนเวทีคอนเสิร์ต",zh:"滑动滤镜后切到演唱会舞台",vi:"Vuốt filter rồi cắt lên sân khấu",id:"Menggeser filter lalu potong ke panggung konser",ms:"Meleret filter lalu potong ke pentas konsert"}),
    text:function(){
      return "Ten seconds, vertical 9:16 in two halves joined by one hard cut at the four-second mark. "
       + "FIRST HALF (0-4s), ordinary and handheld: the person from the reference photograph stands in a plain room in a simple shirt, filmed on a phone in an editing app. A translucent filter tray sits across the bottom third of the screen with a row of small square thumbnail swatches and a tick button at the right, and the whole picture shifts tone as the thumbnails scroll past — warm, olive, cool grey — while she waits and moves a little. "
       + "HARD CUT (at 4s). "
       + "SECOND HALF (4-10s): she is on a real concert stage under coloured spotlights in an idol costume — a black-and-pink checked puff-sleeve top, a black corset belt, a layered skirt, fingerless gloves, a choker, her hair in high twin tails with a small bow. She strikes a sharp performance pose with one hand at her temple, then steps to a chrome vintage microphone on a stand and sings into it, confetti falling, red velvet curtain and stage haze behind her. A slim speed-ramp control bar sits low in the frame with small markers along it. "
       + "Concert lighting with strong coloured rims and lens flares, high energy."
       + VID_ID;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်စွာ ပါတဲ့ ခါးအထက် သို့ တစ်ကိုယ်လုံး။",en:"1 photo — waist up or full body with the face clear.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — myi man mu ai",th:"1 รูป — ครึ่งตัวหรือเต็มตัว เห็นหน้าชัด",zh:"1 张半身或全身照，面部清晰",vi:"1 ảnh nửa người hoặc toàn thân, rõ mặt",id:"1 foto separuh atau seluruh badan, wajah jelas",ms:"1 foto separuh atau seluruh badan, wajah jelas"}) },

  /* v4.94 — ten makeup-look workflows, read off ten clips the owner sent with
     the brief "fast, sharp, cut like these, professional". Every clip was
     decoded frame by frame (Chromium here has no H.264, so imageio_ffmpeg
     again) and the LOOK in each was identified before a word was written: the
     glass skin under a chandelier, the crystal tears, the oxblood lip, and so
     on. The prompts are cut lists, not descriptions — four to six locked-off
     shots with their in and out points, because that is what "edit cut" means
     and because a beat sheet is the part of the prompt that survives the
     model's truncation. They close on VID_CUT, never VID_ID or VID_KEEP; see
     the note above the constant. Card art is two real frames of each clip,
     cropped away from the burnt-in platform watermark. */

  { key:"mkGlassSkin", art:"lib/vid/vw-mkGlassSkin.jpg", setup:VID_SETUP_V,
    label:L9({my:"ဖန်သားအလား အသားအရေ (Douyin)",en:"Douyin Glass Skin",shn:"ၽိဝ်ၼိူဝ်ႉမိူၼ်ၵႅဝ်ႈ (Douyin)",kac:"Hkyen zawn hpyi (Douyin)",th:"ผิวกระจกสไตล์โต่วอิน",zh:"抖音玻璃肌",vi:"Da glass skin Douyin",id:"Glass Skin Douyin",ms:"Glass Skin Douyin"}),
    summary:L9({my:"အသားအရေ စိုပြေတောက်ပ + ငွေရောင် လက်ဝတ်ရတနာ မျက်ခွံ — ဖြတ်တောက်မြန်",en:"Wet reflective skin and silver glitter lids, cut fast under a chandelier",shn:"ၽိဝ်ၼိူဝ်ႉၸိုမ်း လႄႈ တႃႇငိုၼ်း — တတ်းဝႆး",kac:"Hpyi tsawm nna gumhpraw glitter myi — lawan ai cut",th:"ผิวฉ่ำสะท้อนแสงกับเปลือกตากลิตเตอร์เงิน ตัดเร็ว",zh:"水光肌配银色闪粉眼妆，快切剪辑",vi:"Da căng bóng và mắt nhũ bạc, cắt nhanh",id:"Kulit basah memantul dan kelopak glitter perak, potongan cepat",ms:"Kulit basah memantul dan kelopak glitter perak, potongan pantas"}),
    text:function(){
      return "Ten seconds, vertical 9:16 Douyin beauty edit, six shots, hard cut on every beat, no dissolves. "
       + "Throughout: the person from the reference photograph under a crystal chandelier, hair swept into a high ponytail, wearing a mirror-sequin bodice that throws shards of light. "
       + "SHOT 1 (0-1.5s): tight on the bare cheek, skin matte and unlit. "
       + "SHOT 2 (1.5-3s): a fingertip presses a pearl-white cream along the cheekbone and the surface turns wet and reflective. "
       + "SHOT 3 (3-4.5s): macro on one closed lid as silver-white glitter is packed on with a flat brush and catches a hard specular ping. "
       + "SHOT 4 (4.5-6.5s): eyes open straight to lens, tiny star and diamond decals set along the outer eye, glossy nude-brown lip, the whole face lacquered. "
       + "SHOT 5 (6.5-8.5s): she tips her chin and the chandelier drags moving light across the sequins. "
       + "SHOT 6 (8.5-10s): locked hero frame, dead centre, chin level, holding still. "
       + "Cool white key with a warm chandelier fill, extreme specular highlights on skin, crisp sequin sparkle, clean commercial grade."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ ကြည်လင်ပြီး ရှေ့တည့်တည့်ကြည့်ထားတဲ့ပုံ။",en:"1 photo — face clear and looking toward the camera.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈၸႅင်ႈ",kac:"Sumla 1 — myi man tsawm hkra mu ai",th:"1 รูป — เห็นหน้าชัด มองกล้อง",zh:"1 张正面清晰的照片",vi:"1 ảnh — rõ mặt, nhìn về ống kính",id:"1 foto — wajah jelas menghadap kamera",ms:"1 foto — wajah jelas menghadap kamera"}) },

  { key:"mkGemTear", art:"lib/vid/vw-mkGemTear.jpg", setup:VID_SETUP_V,
    label:L9({my:"ကျောက်မျက် မျက်ရည်",en:"Crystal Tear Gems",shn:"ၼမ်ႉတႃႇ ၵႅဝ်ႈ",kac:"Lung seng myi prwi",th:"หยดน้ำตาคริสตัล",zh:"水晶泪钻",vi:"Giọt lệ pha lê",id:"Air Mata Kristal",ms:"Air Mata Kristal"}),
    summary:L9({my:"မျက်လုံးအောက်က ကျောက်မျက်တွေ မျက်ရည်လို စီထား — ငွေရောင် ဖက်ရှင်",en:"Rhinestones set under the eye like a frozen tear, silver runway finish",shn:"ႁိၼ်ၵႅဝ်ႈတႂ်ႈတႃႇ မိူၼ်ၼမ်ႉတႃႇ — သီငိုၼ်း",kac:"Myi npu kaw lung seng myi prwi zawn — gumhpraw fashion",th:"คริสตัลใต้ตาเหมือนหยดน้ำตา ลุครันเวย์สีเงิน",zh:"眼下水钻如凝结的泪，银色秀场妆",vi:"Đá đính dưới mắt như giọt lệ đông, tông bạc sàn diễn",id:"Kristal di bawah mata seperti air mata beku, nuansa perak",ms:"Kristal di bawah mata seperti air mata beku, nada perak"}),
    text:function(){
      return "Ten seconds, vertical 9:16 fashion-week beauty film, five shots, cut hard on the beat. "
       + "Throughout: the person from the reference photograph with her hair drawn into a tall sculpted knot dusted with silver spray, against a soft studio grey. "
       + "SHOT 1 (0-2s): three-quarter profile, skin clean, a hand entering frame to pin the knot. "
       + "SHOT 2 (2-4s): macro on the under-eye as tweezers set the first clear rhinestone against the skin. "
       + "SHOT 3 (4-6s): a line of graduated crystals now runs from the inner corner down the cheek like a frozen tear, silver-grey shadow smoked across the socket. "
       + "SHOT 4 (6-8s): she looks down and the stones catch the key one after another as the lashes lower. "
       + "SHOT 5 (8-10s): square to camera, a beaded ivory bodice on her shoulders, wet-glitter lip, holding the hero pose. "
       + "Silver and pearl palette, high-contrast beauty key, real refraction inside every stone."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာနဲ့ မျက်လုံးအောက် ကြည်လင်စွာ မြင်ရတဲ့ပုံ။",en:"1 photo — the face and the under-eye area clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၼႃႈလႄႈတႂ်ႈတႃႇၸႅင်ႈ",kac:"Sumla 1 — myi man hte myi npu mu ai",th:"1 รูป — เห็นหน้าและใต้ตาชัด",zh:"1 张照片 — 面部与眼下清晰",vi:"1 ảnh — rõ mặt và vùng dưới mắt",id:"1 foto — wajah dan area bawah mata terlihat jelas",ms:"1 foto — wajah dan kawasan bawah mata jelas"}) },

  { key:"mkDouyinRed", art:"lib/vid/vw-mkDouyinRed.jpg", setup:VID_SETUP_V,
    label:L9({my:"နှုတ်ခမ်းနီ ရင့်ရင့် (တရုတ်)",en:"Deep Red Lip · Douyin",shn:"သီပၢၵ်ႇလႅင်ၶဵမ်",kac:"Ncup ahkyeng katsi",th:"ปากแดงเข้มสไตล์จีน",zh:"抖音正红唇",vi:"Môi đỏ trầm Douyin",id:"Bibir Merah Pekat Douyin",ms:"Bibir Merah Pekat Douyin"}),
    summary:L9({my:"မတ်ခမ်းနီ ရင့်ရင့် + အနက် eyeliner — နှင်းဆီပွင့်နဲ့ ကျောက်စိမ်းလက်ကောက်",en:"Matte oxblood lip and a sharp wing, with rose petals and a jade bangle",shn:"သီပၢၵ်ႇလႅင်ၶဵမ် လႄႈ တႃႇလမ် — မွၵ်ႇလႄႈၵွင်ႈယူၺ်",kac:"Ncup ahkyeng katsi hte myi tsawm — nampan hte jade",th:"ปากแดงเข้มแมตต์กับอายไลเนอร์คม กลีบกุหลาบและกำไลหยก",zh:"哑光正红唇配利落眼线，玫瑰花瓣与玉镯",vi:"Môi đỏ lì và mắt kẻ sắc, cánh hồng và vòng ngọc",id:"Bibir merah matte dan eyeliner tajam, kelopak mawar dan gelang giok",ms:"Bibir merah matte dan eyeliner tajam, kelopak mawar dan gelang jed"}),
    text:function(){
      return "Ten seconds, vertical 9:16 Chinese-social beauty cut, five shots, hard cuts throughout. "
       + "Throughout: the person from the reference photograph in a cream sleeveless top, a jade bangle on her wrist, dark red rose petals scattered at the edge of frame. "
       + "SHOT 1 (0-2s): close on the mouth, bare, as an oxblood lipstick is drawn on in two strokes and blotted flat. "
       + "SHOT 2 (2-4s): eyes only, a fine black wing pulled out past the outer corner and a warm brown wash blended above it. "
       + "SHOT 3 (4-6s): full face to lens, wispy fringe strands falling loose over the brow, the matte red now the only colour in the picture. "
       + "SHOT 4 (6-8s): she lifts a hand to her jaw so the jade and her long pale nails come into frame beside the red. "
       + "SHOT 5 (8-10s): she turns a few degrees with a rose held near her cheek, petals almost touching the lip. "
       + "Warm ivory background, one soft key, deep saturated red against neutral skin, film-clean grade."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — နှုတ်ခမ်း ကြည်လင်စွာ ပါတဲ့ မျက်နှာပုံ။",en:"1 photo — a face shot with the mouth clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်သီပၢၵ်ႇၸႅင်ႈ",kac:"Sumla 1 — ncup mu ai",th:"1 รูป — เห็นริมฝีปากชัด",zh:"1 张照片 — 唇部清晰",vi:"1 ảnh — thấy rõ đôi môi",id:"1 foto — bibir terlihat jelas",ms:"1 foto — bibir jelas kelihatan"}) },

  { key:"mkGlossPop", art:"lib/vid/vw-mkGlossPop.jpg", setup:VID_SETUP_V,
    label:L9({my:"ကြေးရောင် တောက်ပ + Gloss",en:"Bronze Glow & Gloss",shn:"သီတွင်း လႄႈ Gloss",kac:"Bronze htoi hte gloss",th:"ผิวบรอนซ์ฉ่ำกับลิปกลอส",zh:"古铜光泽与唇釉",vi:"Da nâu ánh và son bóng",id:"Kilau Bronze & Gloss",ms:"Kilau Bronze & Gloss"}),
    summary:L9({my:"ကြေးရောင် ပါးရိုး + နှုတ်ခမ်း တောက်ပြောင် — ကြော်ငြာဆန်ဆန်",en:"Terracotta cheekbones and a mirror-wet lip, commercial finish",shn:"ၵႅမ်ႈသီတွင်း လႄႈ သီပၢၵ်ႇပိူင်း",kac:"Bronze pyi hte ncup tsawm",th:"โหนกแก้วสีดินเผาและปากฉ่ำเงา สไตล์โฆษณา",zh:"陶土色颧骨与镜面唇釉，广告质感",vi:"Gò má nâu đất và môi bóng gương, chất quảng cáo",id:"Tulang pipi terakota dan bibir basah, nuansa iklan",ms:"Tulang pipi terakota dan bibir basah, gaya iklan"}),
    text:function(){
      return "Ten seconds, vertical 9:16 glossy commercial beauty spot, four shots, snapping between them. "
       + "Throughout: the person from the reference photograph, brown waves swept back off the face, large pearl-cluster earrings, lit against a bright white wall. "
       + "SHOT 1 (0-2.5s): half-face macro, terracotta bronzer swept along the cheekbone with a fan brush until the skin reads sunlit. "
       + "SHOT 2 (2.5-5s): a liquid-gloss wand comes in from below and paints the lower lip, the surface going wet and mirror-bright, one thread of gloss lifting as the wand leaves. "
       + "SHOT 3 (5-7.5s): eyes to camera, warm smoky brown packed into the socket, honey highlight down the nose bridge and across the top of the cheek. "
       + "SHOT 4 (7.5-10s): she settles into the hero frame, lips slightly parted, the pearls swinging once and stopping. "
       + "Bright airy key, warm bronze-and-honey palette, heavy wet specular on the lip, glossy magazine finish."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ခါးအထက် သို့ မျက်နှာအနီးကပ်ပုံ။",en:"1 photo — waist up or a close face shot.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၶိုၼ်ႈၼိူဝ်ဢႅဝ်",kac:"Sumla 1 — n-gup ntsa",th:"1 รูป — ครึ่งตัวบนหรือใบหน้าใกล้",zh:"1 张半身或面部特写",vi:"1 ảnh nửa người hoặc cận mặt",id:"1 foto separuh badan atau close-up wajah",ms:"1 foto separuh badan atau close-up wajah"}) },

  { key:"mkPorcelain", art:"lib/vid/vw-mkPorcelain.jpg", setup:VID_SETUP_V,
    label:L9({my:"ကြွေထည် အသားအရေ (အအေး)",en:"Cold Porcelain",shn:"ၽိဝ်ၼိူဝ်ႉမိူၼ်ထူၺ်",kac:"Katsi ai porcelain",th:"ผิวพอร์ซเลนโทนเย็น",zh:"冷调瓷肌",vi:"Da sứ tông lạnh",id:"Porselen Dingin",ms:"Porselin Sejuk"}),
    summary:L9({my:"အအေးဓာတ် ဖြူဖွေးတဲ့ အသားအရေ + နံရံပေါ်က အရိပ်ထင်ရှား",en:"Cool flat porcelain skin against a hard shadow on a green-grey wall",shn:"ၽိဝ်ၼိူဝ်ႉၶၢဝ်ၶႅမ် လႄႈ ငဝ်းၼိူဝ်ၽႃ",kac:"Katsi ai hpraw hpyi hte shingnip",th:"ผิวพอร์ซเลนเรียบโทนเย็น กับเงาคมบนผนังเขียวเทา",zh:"冷调平滑瓷肌，配灰绿墙上的硬影",vi:"Da sứ phẳng tông lạnh trên nền tường xám xanh có bóng gắt",id:"Kulit porselen datar dingin dengan bayangan tajam di dinding",ms:"Kulit porselin rata sejuk dengan bayang tajam di dinding"}),
    text:function(){
      return "Ten seconds, vertical 9:16 editorial beauty study, four shots, cut clean between them. "
       + "Throughout: the person from the reference photograph against a grey-green painted wall, dark hair slicked flat to the skull, one oversized pearl at the ear, a single hard source throwing a crisp shadow of her profile onto the wall behind. "
       + "SHOT 1 (0-2.5s): profile to the left, the shadow edge razor sharp beside her. "
       + "SHOT 2 (2.5-5s): macro on the cheek as a cool porcelain base is pressed in and the skin flattens to an even matte with no warmth in it at all. "
       + "SHOT 3 (5-7.5s): three-quarter turn, a muted rosewood stain patted into the centre of the lip and blurred outward, brows brushed straight up. "
       + "SHOT 4 (7.5-10s): she faces the lens square, chin level, expression neutral, the pearl carrying the one highlight in the frame. "
       + "Cold desaturated grade, single hard key, deep controlled shadow, sculptural and still."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — နောက်ခံ ရှင်းရှင်း၊ မျက်နှာ ကြည်လင်တဲ့ပုံ။",en:"1 photo — plain background, face clearly visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — လင်ႁၢင်ႈမူတ်း",kac:"Sumla 1 — hpang de san seng ai",th:"1 รูป — ฉากหลังเรียบ เห็นหน้าชัด",zh:"1 张照片 — 背景干净，面部清晰",vi:"1 ảnh — nền trơn, rõ mặt",id:"1 foto — latar polos, wajah jelas",ms:"1 foto — latar kosong, wajah jelas"}) },

  { key:"mkPinkBridal", art:"lib/vid/vw-mkPinkBridal.jpg", setup:VID_SETUP_V,
    label:L9({my:"ပန်းရောင်နူးညံ့ မင်္ဂလာမိတ်ကပ်",en:"Soft Pink Bridal",shn:"မိတ်ႇၵၢပ်ႈသီလႅင်ဢွၼ်ႇ",kac:"Pink hpring num hkungran",th:"เมกอัพเจ้าสาวชมพูนุ่ม",zh:"柔粉新娘妆",vi:"Trang điểm cô dâu hồng dịu",id:"Pengantin Pink Lembut",ms:"Pengantin Pink Lembut"}),
    summary:L9({my:"ပါးရေးပန်းရောင် + ပန်းရောင် gloss — မင်္ဂလာဆောင် မိတ်ကပ် အဆင့်ဆင့်",en:"Pink blush and rose gloss, the bridal look built step by step",shn:"ၵႅမ်ႈသီလႅင် လႄႈ gloss — မိတ်ႇၵၢပ်ႈႁဵတ်းလွႆးလွႆး",kac:"Pink pyi hte gloss — hkungran makeup lakang lakang",th:"ปัดแก้มชมพูและกลอสโรส สร้างลุคเจ้าสาวทีละขั้น",zh:"粉色腮红与玫瑰唇釉，一步步完成新娘妆",vi:"Má hồng và son bóng hồng, dựng look cô dâu từng bước",id:"Perona pink dan gloss mawar, look pengantin bertahap",ms:"Perona pink dan gloss mawar, look pengantin berperingkat"}),
    text:function(){
      return "Ten seconds, vertical 9:16 bridal-makeup reel, five shots, quick cuts on the beat. "
       + "Throughout: the person from the reference photograph in a white lace corset, long chestnut waves brushed over one shoulder, in front of a cream drape. "
       + "SHOT 1 (0-2s): an open blush palette is held beside her face and a full brush is loaded from the pale pink pan. "
       + "SHOT 2 (2-4s): the brush sweeps that pink high across the cheek and out toward the temple in two passes. "
       + "SHOT 3 (4-6s): macro on the eye, a pink-champagne shimmer patted onto the centre of the lid, the lower lash line softened with the same tone. "
       + "SHOT 4 (6-8s): a rose gloss is pressed onto the lips and they press together once. "
       + "SHOT 5 (8-10s): she lifts her chin to the lens for the finished bridal frame, the waves falling back into place. "
       + "Soft diffused window key, warm ivory and rose palette, delicate and clean, wedding-magazine finish."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ခါးအထက်၊ ဆံပင် မြင်ရရင် ပိုကောင်း။",en:"1 photo — waist up, better when the hair is visible.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၶူၼ်ႁူဝ်ၸင်ႇလီ",kac:"Sumla 1 — kara mu yang grau kaja",th:"1 รูป — ครึ่งตัวบน เห็นผมยิ่งดี",zh:"1 张半身照，露出头发更好",vi:"1 ảnh nửa người, thấy tóc thì tốt hơn",id:"1 foto separuh badan, lebih bagus bila rambut terlihat",ms:"1 foto separuh badan, lebih baik bila rambut kelihatan"}) },

  { key:"mkDollBlush", art:"lib/vid/vw-mkDollBlush.jpg", setup:VID_SETUP_V,
    label:L9({my:"အရုပ်ပုံစံ ပါးရဲရဲ",en:"Doll Blush",shn:"ၵႅမ်ႈလႅင် မိူၼ်တုၵ်ႉတႃ",kac:"Doll zawn pyi ahkyeng",th:"ปัดแก้มสไตล์ตุ๊กตา",zh:"娃娃感重腮红",vi:"Má hồng búp bê",id:"Blush Boneka",ms:"Blush Patung"}),
    summary:L9({my:"နှာခေါင်းဖြတ်ပြီး မျက်လုံးအောက် ပန်းရောင်ရဲရဲ — ပုလဲကြိုးနဲ့",en:"Heavy pink across the nose and under both eyes, pearl chains in the hair",shn:"သီလႅင်ႁၢဝ်ႈ ၼိူဝ်လင်ႁူဝ်ၶိူင်ႇ — မီးသၢႆမုၵ်ႈ",kac:"Ladi hte myi npu kaw pink kaba — pearl chain",th:"ชมพูเข้มพาดจมูกและใต้ตา พร้อมสร้อยไข่มุกบนผม",zh:"浓粉横扫鼻梁与眼下，发间缀珍珠链",vi:"Hồng đậm vắt qua mũi và dưới mắt, dây ngọc trên tóc",id:"Pink pekat melintang hidung dan bawah mata, rantai mutiara",ms:"Pink pekat melintang hidung dan bawah mata, rantai mutiara"}),
    text:function(){
      return "Ten seconds, vertical 9:16 doll-makeup edit, six fast shots. "
       + "Throughout: the person from the reference photograph with strands of pearl chain draped across the top of her hair and a red ribbon flower tied at her throat. "
       + "SHOT 1 (0-1.5s): macro on the bare nose bridge. "
       + "SHOT 2 (1.5-3s): a small tapered brush stipples strong rose pink straight across the bridge of the nose and out under both eyes in one wide band. "
       + "SHOT 3 (3-4.5s): the same pink is carried up onto the lid and the brow bone so the whole eye area flushes. "
       + "SHOT 4 (4.5-6.5s): tight on the eyes, lower lashes drawn in one at a time, the flush now heavy enough to read as a doll. "
       + "SHOT 5 (6.5-8.5s): a sheer red gloss on a full round lip shape. "
       + "SHOT 6 (8.5-10s): she looks up into the lens wide-eyed and holds, the pearls swaying to a stop. "
       + "Warm pink-dominant grade, soft frontal key, high-flush finish."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်နှာ အနီးကပ်၊ ရှေ့တည့်တည့်။",en:"1 photo — a close face shot, facing forward.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈတေႃႇ ၸမ်ၸမ်",kac:"Sumla 1 — myi man ni hkra shawng de",th:"1 รูป — ใบหน้าใกล้ หันตรง",zh:"1 张正面面部特写",vi:"1 ảnh cận mặt, chính diện",id:"1 foto close-up wajah menghadap depan",ms:"1 foto close-up wajah menghadap depan"}) },

  { key:"mkSculptBrush", art:"lib/vid/vw-mkSculptBrush.jpg", setup:VID_SETUP_V,
    label:L9({my:"ပါးရိုးဖော် + အရောင်ကူး",en:"Sculpt & Gradient",shn:"ႁဵတ်းလုပ်ႇၵႅမ်ႈ လႄႈ လၢႆးသီ",kac:"Pyi nra shakya hte gradient",th:"เก็บโครงหน้าและไล่สี",zh:"修容与渐层腮红",vi:"Tạo khối và má tán chuyển",id:"Sculpt & Gradasi",ms:"Sculpt & Gradasi"}),
    summary:L9({my:"ပါးရိုးအောက် တစ်ချက်ဆွဲ ပြီး အနားမပေါ်အောင် ဖျော့သွား",en:"One clean line of shade under the cheekbone, faded out to no visible edge",shn:"လၢႆးမိုတ်ႈတႂ်ႈလုပ်ႇၵႅမ်ႈ သေ ႁဵတ်းႁႂ်ႈဢမ်ႇႁၼ်ႁိမ်း",kac:"Pyi nra npu kaw shingnip langai, htum ai shara nmu",th:"ลากเงาใต้โหนกแก้วหนึ่งเส้นแล้วเกลี่ยจนไร้ขอบ",zh:"颧骨下一道阴影，晕开到看不见边界",vi:"Một đường tối dưới gò má, tán đến khi không còn viền",id:"Satu garis bayangan di bawah tulang pipi, dibaurkan tanpa tepi",ms:"Satu garis bayang bawah tulang pipi, dibaur tanpa tepi"}),
    text:function(){
      return "Ten seconds, vertical 9:16 technique-led beauty cut, four shots, hard cut each time. "
       + "Throughout: the person from the reference photograph on a plain warm-grey backdrop, hair scraped back into a low bun, one small round stud at the ear. "
       + "SHOT 1 (0-2.5s): three-quarter profile, a wide angled brush laid flat under the cheekbone and drawn back toward the ear, carving one clean line of shade. "
       + "SHOT 2 (2.5-5s): the brush lifts to the top of the cheek and lays a coral flush that fades outward with no visible edge anywhere. "
       + "SHOT 3 (5-7.5s): macro on the eye, a warm brown pencil smudged into the lash roots and pulled slightly long, nothing above the crease. "
       + "SHOT 4 (7.5-10s): she turns square to the lens and the sculpting reads as bone rather than as makeup. "
       + "Neutral grey-and-coral palette, big soft key from the front, matte-to-glow skin, quiet technical polish."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ဘေးတိုက်လေး လှည့်ထားတဲ့ မျက်နှာပုံ အကောင်းဆုံး။",en:"1 photo — a slightly angled face shot works best.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ဝိင်ႇၶွင်ႈၼိုင်ႈၸင်ႇလီ",kac:"Sumla 1 — kachyi mi wai da ai gaw grau kaja",th:"1 รูป — หน้าเอียงเล็กน้อยดีที่สุด",zh:"1 张略侧脸的照片效果最好",vi:"1 ảnh mặt hơi nghiêng là tốt nhất",id:"1 foto wajah sedikit menyamping paling bagus",ms:"1 foto wajah sedikit menyerong paling baik"}) },

  { key:"mkEyeMacro", art:"lib/vid/vw-mkEyeMacro.jpg", setup:VID_SETUP_V,
    label:L9({my:"မျက်ခွံ အနီးကပ် (ရွှေလက်မှုန့်)",en:"Glitter Eye Macro",shn:"တႃႇၸမ်ၸမ် (ၶမ်းလိုၵ်ႉ)",kac:"Myi ni hkra macro (ja glitter)",th:"มาโครดวงตากลิตเตอร์",zh:"眼妆微距·金闪",vi:"Macro mắt nhũ kim",id:"Makro Mata Glitter",ms:"Makro Mata Glitter"}),
    summary:L9({my:"မျက်လုံးတစ်လုံးတည်း ဖရိမ်အပြည့် — ခရမ်းရောင်နဲ့ ရွှေရောင် လက်မှုန့်",en:"One eye filling the frame — plum shadow and copper-gold glitter",shn:"တႃႇလုၵ်ႈလဵဝ်တဵမ်ႁၢင်ႈ — သီမူင်ႈလႄႈၶမ်း",kac:"Myi langai sha frame hpring — plum hte ja glitter",th:"ดวงตาเดียวเต็มเฟรม เงาม่วงพลัมกับกลิตเตอร์ทองแดง",zh:"单眼满屏 — 梅子色眼影与铜金闪粉",vi:"Một mắt đầy khung — mắt mận và nhũ đồng vàng",id:"Satu mata memenuhi frame — plum dan glitter tembaga",ms:"Satu mata memenuhi bingkai — plum dan glitter tembaga"}),
    text:function(){
      return "Ten seconds, vertical 9:16 eye-makeup macro film, five shots, cut tight. "
       + "Throughout: the person from the reference photograph shot almost entirely in extreme close-up, one eye filling the frame. "
       + "SHOT 1 (0-2s): the bare lid, lashes long and separated, skin readable in fine detail. "
       + "SHOT 2 (2-4s): a plum-mauve shadow is pressed into the outer socket with a small dome brush and pulled up toward the tail of the brow. "
       + "SHOT 3 (4-6s): a flat brush tamps copper-gold glitter across the mobile lid and into the inner corner, individual flecks firing as she blinks. "
       + "SHOT 4 (6-8s): the lower lash line is smoked with the same plum and a fine dark liner is set inside the waterline. "
       + "SHOT 5 (8-10s): one pull back to the whole face, hair slicked, both eyes matching, holding the finished look. "
       + "Warm skin tones against plum and copper, hard macro key, real glitter refraction, shallow focus riding the lashes."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — မျက်လုံး ကြည်လင်ပြီး focus ဝင်တဲ့ပုံ။",en:"1 photo — eyes sharp and in focus.",shn:"ၶႅပ်းႁၢင်ႈ 1 — တႃႇၸႅင်ႈလီ",kac:"Sumla 1 — myi san seng ai",th:"1 รูป — ดวงตาคมชัด",zh:"1 张眼部清晰对焦的照片",vi:"1 ảnh — mắt nét và đúng nét",id:"1 foto — mata tajam dan fokus",ms:"1 foto — mata tajam dan fokus"}) },

  { key:"mkNoirSlip", art:"lib/vid/vw-mkNoirSlip.jpg", setup:VID_SETUP_V,
    label:L9({my:"အနက်ရောင် ဆင်မြန်း (Noir)",en:"Black Slip Noir",shn:"ၶူဝ်းလမ် (Noir)",kac:"Nsam palawng (Noir)",th:"ลุคดำนัวร์",zh:"黑色吊带·冷调",vi:"Đen tuyền Noir",id:"Noir Slip Hitam",ms:"Noir Slip Hitam"}),
    summary:L9({my:"အနက်ရောင် ဝတ်စုံ + စိန်လည်ဆွဲ — မီးအေးအေးနဲ့ ရိုးရှင်းခမ်းနား",en:"A black square-neck slip and a diamond line necklace, quiet and expensive",shn:"ၶူဝ်းလမ် လႄႈ သၢႆၶေႃးၽိင်း — ငၢႆႈလႄႈလီ",kac:"Nsam palawng hte seng nhpye — zim nna manu dan",th:"เดรสคอเหลี่ยมสีดำกับสร้อยเพชรเส้นเล็ก เรียบหรู",zh:"黑色方领吊带配细钻项链，安静而高级",vi:"Váy hai dây cổ vuông đen và vòng kim cương mảnh, sang lặng",id:"Slip hitam kerah kotak dan kalung berlian tipis, tenang dan mewah",ms:"Slip hitam kolar kotak dan rantai berlian nipis, tenang dan mewah"}),
    text:function(){
      return "Ten seconds, vertical 9:16 noir beauty edit, five locked shots, straight cuts between them. "
       + "Throughout: the person from the reference photograph against a rough cream plaster wall, hair pulled into a low centre-parted bun, a slim diamond line necklace at the collarbone, a black square-neck slip on the shoulders. "
       + "SHOT 1 (0-2s): shoulders square, bare skin, one palm resting along the jaw, the plaster texture readable behind her. "
       + "SHOT 2 (2-4s): macro across the upper lash line as a felt-tip liner extends far past the outer corner and flicks upward at the very tip. "
       + "SHOT 3 (4-6s): the mouth in profile, a cool mauve-brown stain worked into the centre and feathered outward until it sits flat and velvety. "
       + "SHOT 4 (6-8s): she releases the hand and rolls the near shoulder forward so every stone in the necklace fires in sequence. "
       + "SHOT 5 (8-10s): a held final frame, eyes level to the lens, nothing in motion except the light travelling over the diamonds. "
       + "Warm neutral grade with deep falloff into shadow, one soft source from camera left, black and cream only, restrained luxury finish."
       + VID_CUT;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ပခုံးထိ မြင်ရတဲ့ ခါးအထက်ပုံ။",en:"1 photo — waist up with the shoulders in frame.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ႁၼ်ၸိူဝ်ႉမႃႇ",kac:"Sumla 1 — sinlum du hkra mu ai",th:"1 รูป — ครึ่งตัวบน เห็นไหล่",zh:"1 张半身照，含肩部",vi:"1 ảnh nửa người, thấy vai",id:"1 foto separuh badan dengan bahu terlihat",ms:"1 foto separuh badan dengan bahu kelihatan"}) },

  /* v6.15.0 — FOUR CARDS FROM FOUR REFERENCE VIDEOS. The owner sent four
     clips, each with "make this video's smart workflow exactly, 100% the same,
     and add it as a new image→video card", then "so that my own face is the
     one in it". Two clips showed their Seedance 2.5 prompt on screen (a triad
     boss and a lonely VIP, fifteen seconds in twelve hidden-camera cuts): those
     prompts are transcribed word for word, CapCut's @person mention becoming the
     person in the reference photograph. Two showed no text (a cosplay reveal
     under a misty stone arch, a Dunhuang flying-apsara dance): their prompts are
     the shot lists read off the frames, cut by cut, with the clips' own lengths
     and aspects. All four ride the Seedance 2.5 reference model, the one endpoint
     in the catalog that takes a reference photograph AND runs to fifteen seconds
     in 16:9 — so each card carries its OWN setup instead of VID_SETUP_V. They
     close on VID_REF: identity locked, cuts allowed, hair and wardrobe free. */
  { key:"triadBoss", art:"lib/vid/vw-triadBoss.jpg", setup:{ model:"seedance-2-5-global-token-mmv", res:"1080p", dur:"15", aspect:"16:9" },
    label:L9({my:"မာဖီးယား ဘော့စ် (Paparazzi)",en:"Triad Boss Paparazzi",shn:"ႁူဝ်ၼႃႈမႃႇၾီးယႃး (Paparazzi)",kac:"Mafia boss (Paparazzi)",th:"บอสมาเฟีย (ปาปารัซซี่)",zh:"黑帮大佬·偷拍",vi:"Trùm mafia (Paparazzi)",id:"Bos Mafia (Paparazzi)",ms:"Bos Mafia (Paparazzi)"}),
    summary:L9({my:"ကိုယ့်မျက်နှာနဲ့ မြေအောက်ဘော့စ် — မီးခိုးငွေ့နဲ့ ဝီစကီခွက်တွေကြားက ခိုးရိုက် ၁၂ ချက်ဖြတ်၊ ၁၅ စက္ကန့် neon noir",en:"Your face as an underworld boss — 15 seconds, 12 hidden-camera cuts through smoke and whiskey glasses",shn:"ၼႃႈၸဝ်ႈၵဝ်ႇ ပဵၼ်ႁူဝ်ၼႃႈမႃႇၾီးယႃး — 15 ၸႅၵ်ႉ၊ 12 cut၊ ၵႂၼ်းၾႆးလႄႈၵွၵ်းဝီႇသၵီႇ",kac:"Nang a myi man hte ga npu boss — 15 sekan, 12 cut, wan hkut hte whisky gawk lapran",th:"ใบหน้าคุณเป็นบอสใต้ดิน — 15 วินาที 12 คัทกล้องซ่อนผ่านควันและแก้ววิสกี้",zh:"你的脸成为地下大佬 — 15 秒、12 个偷拍镜头穿过烟雾与威士忌杯",vi:"Mặt bạn thành trùm thế giới ngầm — 15 giây, 12 cú cắt máy giấu qua khói và ly whisky",id:"Wajahmu jadi bos dunia bawah — 15 detik, 12 potongan kamera tersembunyi lewat asap dan gelas wiski",ms:"Wajah anda sebagai bos dunia bawah — 15 saat, 12 potongan kamera tersembunyi menerusi asap dan gelas wiski"}),
    text:function(){
      return "A 15-second hyper-kinetic cinematic candid paparazzi video of a tense underground triad boss confrontation, seamlessly structured with exactly 12 rapid rhythmic cuts. "
       + "The central focus is a breathtakingly attractive, badass mafia boss (the person in the reference photograph) with flawless glass skin. "
       + "The boss wears either a sleek tailored black dress shirt (if male) or a seductive, slightly unbuttoned loose white silk shirt (if female). "
       + "Strictly medium shots and extreme close-ups only, absolutely NO full-body shots. "
       + "The subject radiates dangerous aura, engaged in a cold standoff with an unseen rival, entirely unaware of the camera, looking away with an arrogant, stoic expression, never making direct eye contact with the lens. "
       + "Every single cut strictly uses heavy blurry foreground framing (silhouettes of intimidating bodyguards' shoulders, glowing whiskey glasses, or rising smoke) to create a highly voyeuristic, hidden-camera depth. "
       + "[0s-4s] Cut 1-3: Low-angle OTS tracking past a rival's blurry shoulder; the person takes a slow drag from a glowing cigarette, the ember illuminating their flawless jawline. "
       + "[4s-9s] Cut 4-7: Fast whip-pans behind a bodyguard; the person exhales a thick, cinematic cloud of smoke forward, leaning in slightly with a dangerous, mocking smirk. "
       + "[9s-12s] Cut 8-10: Sudden anamorphic crash zooms pushing past blurry glasses on the table; the person slams a heavy silver lighter onto the table, maintaining an intimidating, dominant aura. "
       + "[12s-15s] Cut 11-12: Rapid orbital push-in framed through thick foreground smoke; the person leans back arrogantly into a dark leather sofa (waist-up only), projecting absolute underworld supremacy. "
       + "Dynamic motion blur, gritty neon noir color grading, high contrast cinematic lighting, 8k photorealistic masterpiece."
       + VID_REF;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ကိုယ့်မျက်နှာ ကြည်ကြည်လင်လင် ပါတဲ့ ခါးအထက်ပုံ။ ဗီဒီယိုထဲမှာ ပေါ်မယ့် မျက်နှာက ဒီပုံထဲက မျက်နှာပါ။",en:"1 photo — your own face, clear, waist up. The face in the video is the face in this photo.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈၸဝ်ႈၵဝ်ႇ ၸႅင်ႈလီ၊ ၼႂ်းဝီဒီရူဝ်ႈ ပဵၼ်ၼႃႈဢၼ်ၼႆႉ",kac:"Sumla 1 — nang a myi man san seng ai; video hta pru wa ai myi man gaw ndai sumla na myi man re",th:"1 รูป — ใบหน้าของคุณเอง ชัด ครึ่งตัวบน ใบหน้าในวิดีโอคือใบหน้าในรูปนี้",zh:"1 张照片 — 你自己的脸，清晰，半身。视频里出现的就是这张脸",vi:"1 ảnh — chính mặt bạn, rõ, nửa người. Khuôn mặt trong video là khuôn mặt trong ảnh này",id:"1 foto — wajahmu sendiri, jelas, separuh badan. Wajah di video adalah wajah di foto ini",ms:"1 foto — wajah anda sendiri, jelas, separuh badan. Wajah dalam video ialah wajah dalam foto ini"}) },

  { key:"vipNight", art:"lib/vid/vw-vipNight.jpg", setup:{ model:"seedance-2-5-global-token-mmv", res:"1080p", dur:"15", aspect:"16:9" },
    label:L9({my:"တစ်ယောက်တည်း VIP (Neon Night)",en:"Lonely VIP Neon Night",shn:"VIP ၵေႃႉလဵဝ် (Neon Night)",kac:"VIP langai sha (Neon Night)",th:"VIP เดียวดาย (Neon Night)",zh:"孤独 VIP·霓虹夜",vi:"VIP cô đơn (Neon Night)",id:"VIP Sendiri (Neon Night)",ms:"VIP Sendirian (Neon Night)"}),
    summary:L9({my:"ကိုယ့်မျက်နှာနဲ့ — လူသူမရှိတဲ့ neon nightclub ထဲ တစ်ယောက်တည်း၊ ၁၂ ချက်ဖြတ် ၁၅ စက္ကန့် ခိုးရိုက်ဗီဒီယို",en:"Your face as a melancholic VIP alone in an empty neon nightclub — 15 seconds, 12 hidden-camera cuts",shn:"ၼႃႈၸဝ်ႈၵဝ်ႇ ပဵၼ် VIP ၵေႃႉလဵဝ် ၼႂ်း nightclub neon — 15 ၸႅၵ်ႉ၊ 12 cut",kac:"Nang a myi man hte VIP langai sha neon nightclub hta — 15 sekan, 12 cut",th:"ใบหน้าคุณเป็น VIP เดียวดายในไนต์คลับนีออนที่ว่างเปล่า — 15 วินาที 12 คัทกล้องซ่อน",zh:"你的脸成为空荡霓虹夜店里独坐的 VIP — 15 秒、12 个偷拍镜头",vi:"Mặt bạn thành VIP u sầu ngồi một mình trong hộp đêm neon trống — 15 giây, 12 cú cắt máy giấu",id:"Wajahmu jadi VIP melankolis sendirian di kelab neon kosong — 15 detik, 12 potongan kamera tersembunyi",ms:"Wajah anda sebagai VIP sayu bersendirian di kelab neon kosong — 15 saat, 12 potongan kamera tersembunyi"}),
    text:function(){
      return "A 15-second hyper-kinetic cinematic candid paparazzi video inside an empty, moody, ultra-luxurious neon-lit nightclub, seamlessly structured with exactly 12 rapid rhythmic cuts. "
       + "The sole focus is a breathtakingly attractive, melancholic VIP (the person in the reference photograph) radiating immense aura and quiet, lonely elegance. "
       + "The subject wears a premium high-fashion outfit (either a crisp unbuttoned white Korean-style dress shirt or a sexy, sophisticated high-slit silk dress). "
       + "The subject looks deeply lost in thought, entirely unaware of the camera, looking away with a cold, stoic, and profoundly moody expression, never making eye contact. "
       + "Every single cut strictly uses blurry foreground framing (silhouettes of empty bar chairs, crystal glass edges, or indoor palm leaves) to create a highly voyeuristic, hidden-camera depth. "
       + "[0s-4s] Cut 1-3: Low-angle tracking through blurred luxury liquor bottles; the person takes a slow, elegant sip of a glowing drink, eyes heavy with unspoken thoughts. "
       + "[4s-9s] Cut 4-7: Fast whip-pans behind a blurry column; the person is sitting alone on a plush leather VIP sofa, bathed in sweeping dark blue and purple neon light, displaying a flawless jawline. "
       + "[9s-12s] Cut 8-10: Sudden anamorphic crash zooms; the person exhales a cloud of cinematic smoke, their face completely stoic but deeply melancholic. "
       + "[12s-15s] Cut 11-12: Rapid orbital push-in past an empty glass; the person runs a hand slowly through their hair, looking out into the void, dynamic motion blur, high-contrast dark neon noir color grading, 8k photorealistic masterpiece."
       + VID_REF;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ကိုယ့်မျက်နှာ ကြည်ကြည်လင်လင် ပါတဲ့ ခါးအထက်ပုံ။ ဗီဒီယိုထဲမှာ ပေါ်မယ့် မျက်နှာက ဒီပုံထဲက မျက်နှာပါ။",en:"1 photo — your own face, clear, waist up. The face in the video is the face in this photo.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈၸဝ်ႈၵဝ်ႇ ၸႅင်ႈလီ၊ ၼႂ်းဝီဒီရူဝ်ႈ ပဵၼ်ၼႃႈဢၼ်ၼႆႉ",kac:"Sumla 1 — nang a myi man san seng ai; video hta pru wa ai myi man gaw ndai sumla na myi man re",th:"1 รูป — ใบหน้าของคุณเอง ชัด ครึ่งตัวบน ใบหน้าในวิดีโอคือใบหน้าในรูปนี้",zh:"1 张照片 — 你自己的脸，清晰，半身。视频里出现的就是这张脸",vi:"1 ảnh — chính mặt bạn, rõ, nửa người. Khuôn mặt trong video là khuôn mặt trong ảnh này",id:"1 foto — wajahmu sendiri, jelas, separuh badan. Wajah di video adalah wajah di foto ini",ms:"1 foto — wajah anda sendiri, jelas, separuh badan. Wajah dalam video ialah wajah dalam foto ini"}) },

  { key:"mistArch", art:"lib/vid/vw-mistArch.jpg", setup:{ model:"seedance-2-5-global-token-mmv", res:"1080p", dur:"8", aspect:"16:9" },
    label:L9({my:"မြူထူ ကျောက်တံတား (Cosplay)",en:"Misty Bridge Reveal",shn:"ၶူဝ်ႁိၼ်ၼႂ်းမွၵ်ႇ (Cosplay)",kac:"Nlung mahkrai (Cosplay)",th:"สะพานหินในหมอก (Cosplay)",zh:"雾中石桥·亮相",vi:"Cầu đá trong sương (Cosplay)",id:"Jembatan Berkabut (Cosplay)",ms:"Jambatan Berkabus (Cosplay)"}),
    summary:L9({my:"ကိုယ့်မျက်နှာနဲ့ — မြူထူတဲ့ ရှေးဟောင်း ရေမြို့ ကျောက်ခုံးတံတားအောက်က ဂိမ်းဇာတ်ကောင် cosplay ၈ စက္ကန့်၊ ၄ ချက်ဖြတ်",en:"Your face in a game-costume cosplay reveal under a misty ancient water-town arch — 8 seconds, 4 cuts",shn:"ၼႃႈၸဝ်ႈၵဝ်ႇ ၼႂ်း cosplay တႂ်ႈၶူဝ်ႁိၼ်ၼႂ်းမွၵ်ႇ — 8 ၸႅၵ်ႉ၊ 4 cut",kac:"Nang a myi man hte game cosplay, hpun hkut nlung mahkrai npu — 8 sekan, 4 cut",th:"ใบหน้าคุณในคอสเพลย์ตัวละครเกม ใต้สะพานหินเมืองน้ำโบราณในหมอก — 8 วินาที 4 คัท",zh:"你的脸出演雾中古镇石拱下的游戏角色 cosplay 亮相 — 8 秒、4 个镜头",vi:"Mặt bạn trong màn cosplay nhân vật game dưới vòm cầu đá cổ trấn mờ sương — 8 giây, 4 cú cắt",id:"Wajahmu dalam cosplay tokoh game di bawah lengkung jembatan batu kota air berkabut — 8 detik, 4 potongan",ms:"Wajah anda dalam cosplay watak permainan di bawah gerbang jambatan batu pekan air berkabus — 8 saat, 4 potongan"}),
    text:function(){
      return "An 8-second cinematic cosplay reveal, widescreen 16:9, in a fog-drowned ancient Chinese water town at dawn — an old grey stone arch bridge over a still canal, whitewashed houses with dark tiled roofs dissolving into pale blue-grey mist, cool desaturated palette. "
       + "The person in the reference photograph is the cosplayer: their own face, styled in a fantasy game-character costume — a long wavy platinum-blonde wig with a large ornate gold-and-blue filigree hairpiece and a long hair stick, a fitted white-and-gold high-collar qipao gown with a high slit, black opera gloves, long royal-blue tassels and red knotted cords, gold filigree at the collar, amber-gold contact lenses. "
       + "Four cuts. "
       + "Cut 1 (0-2s): a wide shot from inside the dark stone arch, the figure standing small and centred in the bright misty opening at the far end, then walking slowly toward the camera and raising one gloved hand to the hairpiece, the arch a black silhouette framing the shot. "
       + "Cut 2 (2-3.5s): a close-up of the face, eyes closed, then the eyes slowly open and lift to the lens, the hair and tassels moving in a light breeze. "
       + "Cut 3 (3.5-5.5s): a medium profile shot on the worn stone steps beside the canal with the arch bridge behind, the head turning over the shoulder toward the camera, the slit of the gown and the blue tassels swaying. "
       + "Cut 4 (5.5-8s): a tight close-up, the face filling the frame, a soft knowing smile growing into direct eye contact, the ornaments swinging and the hair blowing. "
       + "Slow graceful motion, soft volumetric fog, shallow depth of field, cool cinematic grade with the gold and blue of the costume as the only warm accents, 8k photorealistic."
       + VID_REF;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ကိုယ့်မျက်နှာ ကြည်ကြည်လင်လင်။ ဆံပင်၊ ဝတ်စုံ၊ နောက်ခံက ကတ်က ပေးမယ်၊ မျက်နှာက ကိုယ့်မျက်နှာအတိုင်း။",en:"1 photo — your own face, clear. The card supplies the hair, costume and place; the face stays yours.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈၸဝ်ႈၵဝ်ႇ ၸႅင်ႈလီ၊ ၶူဝ်းလႄႈၽူမ်ၵၢတ်ႈပၼ်၊ ၼႃႈပဵၼ်ၼႃႈၸဝ်ႈၵဝ်ႇ",kac:"Sumla 1 — nang a myi man san seng ai; kara, palawng hte shara card jaw ai, myi man gaw nang a re",th:"1 รูป — ใบหน้าของคุณเอง ชัด การ์ดจัดผม ชุด และฉากให้ ใบหน้ายังเป็นของคุณ",zh:"1 张照片 — 你自己的脸，清晰。发型、服装和场景由卡片提供，脸还是你的",vi:"1 ảnh — chính mặt bạn, rõ. Thẻ lo tóc, trang phục và bối cảnh; khuôn mặt vẫn là của bạn",id:"1 foto — wajahmu sendiri, jelas. Kartu menyediakan rambut, kostum dan tempat; wajah tetap milikmu",ms:"1 foto — wajah anda sendiri, jelas. Kad menyediakan rambut, kostum dan tempat; wajah tetap milik anda"}) },

  { key:"apsaraDance", art:"lib/vid/vw-apsaraDance.jpg", setup:{ model:"seedance-2-5-global-token-mmv", res:"1080p", dur:"9", aspect:"9:16" },
    label:L9({my:"ပျံသန်းသူ နတ်သမီး (Dunhuang)",en:"Flying Apsara Dance",shn:"ၼၢင်းၽီမိၼ် (Dunhuang)",kac:"Lamu nat shayi (Dunhuang)",th:"นางฟ้าเหินฟ้า (ตุนหวง)",zh:"敦煌飞天舞",vi:"Vũ nữ Phi Thiên (Đôn Hoàng)",id:"Tari Apsara Terbang (Dunhuang)",ms:"Tari Apsara Terbang (Dunhuang)"}),
    summary:L9({my:"ကိုယ့်မျက်နှာနဲ့ — Dunhuang နံရံပန်းချီရှေ့ ပိုးဖဲကြိုးပျံလွှား နတ်သမီးအက ၆ ပုံစံ၊ ၉ စက္ကန့် ဒေါင်လိုက်",en:"Your face as a Dunhuang flying apsara — six poses from the lotus to the reverse pipa before the mural, 9 seconds vertical",shn:"ၼႃႈၸဝ်ႈၵဝ်ႇ ပဵၼ်ၼၢင်းၽီမိၼ် Dunhuang — 6 ႁၢင်ႈ၊ 9 ၸႅၵ်ႉ၊ ႁၢင်ႈတင်ႈ",kac:"Nang a myi man hte Dunhuang lamu nat shayi — 6 pose, 9 sekan, tsaw ai frame",th:"ใบหน้าคุณเป็นนางฟ้าเหินฟ้าตุนหวง — หกท่าจากดอกบัวถึงพิณผีผาสะพายหลัง หน้าจิตรกรรมฝาผนัง 9 วินาทีแนวตั้ง",zh:"你的脸成为敦煌飞天 — 壁画前从持莲到反弹琵琶六个姿态，9 秒竖屏",vi:"Mặt bạn thành Phi Thiên Đôn Hoàng — sáu thế từ hoa sen đến đàn tì bà ngược trước bích họa, 9 giây dọc",id:"Wajahmu jadi apsara terbang Dunhuang — enam pose dari lotus sampai pipa terbalik di depan mural, 9 detik vertikal",ms:"Wajah anda sebagai apsara terbang Dunhuang — enam pose dari lotus hingga pipa terbalik di hadapan mural, 9 saat menegak"}),
    text:function(){
      return "A 9-second photorealistic dance film, vertical 9:16, of a Dunhuang flying apsara before a cave-mural wall — muted ochre, sage green and dusty rose, a large round faded mandala and faint painted flying figures — under warm directional cinematic light with a soft glow and subtle haze. "
       + "The person in the reference photograph is the dancer: their own face, styled with long dark hair in a high sculpted double-loop bun with a silver filigree crown and dangling silver-and-pearl tassels, a cream-and-jade strapless brocade bandeau top with a curling cloud pattern, a matching low draped skirt, long translucent mint-green and ivory gauze ribbons floating from the arms, layered pearl chains, bronze arm cuffs and bracelets, bare midriff and bare feet. "
       + "Six cuts. "
       + "Cut 1 (0-1.5s): seated on a dark stone, holding a pink lotus blossom at chest height and gazing down at it, the head slightly tilted. "
       + "Cut 2 (1.5-3.5s): standing with the back three-quarters to the camera, glancing back over the shoulder into the lens, hair and ribbons drifting. "
       + "Cut 3 (3.5-4.5s): dancing, one arm arched over the head, eyes closed, the ribbons swirling. "
       + "Cut 4 (4.5-6s): kneeling on the stone with both hands folded at the chest, eyes closed in serene prayer, the lotus resting by the knee. "
       + "Cut 5 (6-7s): the raised-arm dance pose again, ribbons flying wide. "
       + "Cut 6 (7-9s): the reverse-pipa pose — standing on one bare foot atop the stone, the other leg lifted, a pipa lute held behind the shoulder, the face turned upward, ribbons streaming. "
       + "Slow graceful motion, gauze catching the light, soft warm cinematic grade, 8k photorealistic."
       + VID_REF;
    },
    hint:L9({my:"ပုံ ၁ ပုံ — ကိုယ့်မျက်နှာ ကြည်ကြည်လင်လင်။ ဆံပင်၊ ဝတ်စုံ၊ နောက်ခံက ကတ်က ပေးမယ်၊ မျက်နှာက ကိုယ့်မျက်နှာအတိုင်း။",en:"1 photo — your own face, clear. The card supplies the hair, costume and place; the face stays yours.",shn:"ၶႅပ်းႁၢင်ႈ 1 — ၼႃႈၸဝ်ႈၵဝ်ႇ ၸႅင်ႈလီ၊ ၶူဝ်းလႄႈၽူမ်ၵၢတ်ႈပၼ်၊ ၼႃႈပဵၼ်ၼႃႈၸဝ်ႈၵဝ်ႇ",kac:"Sumla 1 — nang a myi man san seng ai; kara, palawng hte shara card jaw ai, myi man gaw nang a re",th:"1 รูป — ใบหน้าของคุณเอง ชัด การ์ดจัดผม ชุด และฉากให้ ใบหน้ายังเป็นของคุณ",zh:"1 张照片 — 你自己的脸，清晰。发型、服装和场景由卡片提供，脸还是你的",vi:"1 ảnh — chính mặt bạn, rõ. Thẻ lo tóc, trang phục và bối cảnh; khuôn mặt vẫn là của bạn",id:"1 foto — wajahmu sendiri, jelas. Kartu menyediakan rambut, kostum dan tempat; wajah tetap milikmu",ms:"1 foto — wajah anda sendiri, jelas. Kad menyediakan rambut, kostum dan tempat; wajah tetap milik anda"}) }
];

var API = { CITIES: VID_CITIES, WF: VID_WF, SETUP_V: VID_SETUP_V, tr: tr,
  cityDef: vidCityDef,
  byKey: function (k) { for (var i = 0; i < VID_WF.length; i++) if (VID_WF[i].key === k) return VID_WF[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoWorkflows = API; }
})();
