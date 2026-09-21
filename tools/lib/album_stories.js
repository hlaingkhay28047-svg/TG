"use strict";
/* ============================================================================
   tools/lib/album_stories.js — THE STORY LINES (6.121.0, Smart Album wave F)

   The owner's reference video: an album designer whose generated spreads read
   like a magazine — a small tracked kicker, a large serif headline ("WHO IS
   SHE?", "WHERE THE LAND IS UNTAMED", "A Good Day for It"), a line of body copy
   and a hairline rule, on cream paper beside the photographs. Wave C gave every
   occasion three STARTER words for its opener; nothing after the opener carried
   a word, so a forty-photograph album was thirty-nine pages of pictures and one
   page of type.

   These are the lines the pages after the opener open on. Four headline sets an
   occasion (kicker + headline) and two sentences of body copy, cycled page by
   page by the design engine in the ALBUM module, in the student's own language.
   Every one of them is a STARTER: the student is expected to type over it under
   TEXT, and the design keeps their words.

   Written in the studio's nine base languages, as every other album table is.
   Shan and Kachin are kept short and built from the vocabulary the occasion
   tables already use, on the same terms wave C wrote them. */

function L(my, en, shn, kac, th, zh, vi, id, ms) {
  return { my: my, en: en, shn: shn, kac: kac, th: th, zh: zh, vi: vi, id: id, ms: ms };
}
/* one headline set: k = the kicker (set small, tracked, in caps), h = the headline */
function S(k, h) { return { k: k, h: h }; }

const STORIES = {
  prewed: {
    lines: [
      S(L("အခန်း ၁", "Chapter one", "တွၼ်ႈ ၁", "Daw langai", "บทที่หนึ่ง", "第一章", "Chương một", "Bab satu", "Bab satu"),
        L("နှလုံးသားနှစ်ခု၊ လမ်းတစ်ခု", "Two Hearts, One Road", "ႁူဝ်ၸႂ်သွင် တၢင်းလဵဝ်", "Myit lahkawng, lam langai", "สองหัวใจ หนึ่งเส้นทาง", "两颗心，一条路", "Hai Trái Tim, Một Con Đường", "Dua Hati, Satu Jalan", "Dua Hati, Satu Jalan")),
      S(L("ရွှေရောင်နာရီ", "Golden hour", "ၶိင်ႇၶမ်း", "Ja aten", "โกลเด้นอาวร์", "黄金时刻", "Giờ vàng", "Jam emas", "Waktu keemasan"),
        L("အလင်းက ကျွန်ုပ်တို့ကို ရှာတွေ့ရာ", "Where the Light Found Us", "တီႈၽႃႉႁႃႁၼ်ႁဝ်း", "Nhtoi gaw anhte hpe mu ai shara", "ที่ซึ่งแสงพบเรา", "光找到我们的地方", "Nơi Ánh Sáng Tìm Thấy Chúng Ta", "Tempat Cahaya Menemukan Kami", "Tempat Cahaya Menemui Kami")),
      S(L("တိတ်ဆိတ်သော ကတိ", "A quiet promise", "ၵႂၢမ်းမၼ်ႈ ၼိမ်", "Ngwi pyaw ai ga sadi", "คำสัญญาอันเงียบงัน", "静静的承诺", "Một lời hứa lặng lẽ", "Janji yang tenang", "Janji yang tenang"),
        L("ကတိသစ္စာ မဆိုမီ", "Before the Vows", "ဢွၼ်ၼႃႈ ၵႂၢမ်းမၼ်ႈ", "Ga sadi n jaw shi yang", "ก่อนคำสาบาน", "誓言之前", "Trước Lời Thề", "Sebelum Janji Suci", "Sebelum Ikrar")),
      S(L("ကျွန်ုပ်တို့ နှစ်ယောက်", "The two of us", "ႁဝ်းသွင်ၵေႃႉ", "Anhte lahkawng", "เราสองคน", "我们两个", "Hai chúng ta", "Kami berdua", "Kami berdua"),
        L("ကျွန်ုပ်တို့ပဲ၊ အမြဲ", "Just Us, Always", "ႁဝ်းၵူၺ်း ၵူႈမိူဝ်ႈ", "Anhte sha, galoi mung", "แค่เรา เสมอไป", "只有我们，永远", "Chỉ Hai Ta, Mãi Mãi", "Hanya Kita, Selamanya", "Hanya Kita, Selamanya"))
    ],
    body: [
      L("တစ်ချက်ကြည့်မိရာက စ၍ သေးငယ်ပြီး ခိုင်မာသော အခိုက်အတန့်တွေနဲ့ တစ်သက်တာ ဖြစ်လာခဲ့သော ဇာတ်လမ်း။",
        "A story that began with a glance and grew into a lifetime of small, certain moments.",
        "လွင်ႈလဵဝ် တႄႇတီႈတႃတူၺ်း သေ ပဵၼ်မႃး ၶၢဝ်းယၢမ်းဢွၼ်ႇ ၸိူဝ်းမၼ်ႈၸႂ် တင်းသၢႆၸႂ်။",
        "Yu dat ai kaw na hpang wa nna, kachyi tim teng ai ten ni hte prat ting byin wa ai maumwi.",
        "เรื่องราวที่เริ่มจากสายตาแวบหนึ่ง แล้วเติบโตเป็นชั่วชีวิตของช่วงเวลาเล็ก ๆ ที่แน่นอน",
        "从一次对视开始，长成了一生中细小而确定的时刻。",
        "Một câu chuyện bắt đầu từ một ánh nhìn và lớn thành cả đời những khoảnh khắc nhỏ bé, chắc chắn.",
        "Kisah yang bermula dari sekilas pandang dan tumbuh menjadi seumur hidup momen-momen kecil yang pasti.",
        "Kisah yang bermula dengan satu pandangan dan membesar menjadi seumur hidup detik-detik kecil yang pasti."),
      L("ဒီပုံတိုင်းကို ကမ္ဘာမနိုးမီ နာရီ၊ ကျွန်ုပ်တို့ နှစ်ယောက်တည်းရှိသော အချိန်မှာ ရိုက်ခဲ့သည်။",
        "Every frame here was made in the hour before the world woke up, when it was only the two of us.",
        "ႁၢင်ႈၵူႈႁၢင်ႈၼႆႉ ထၢႆႇမိူဝ်ႈ ဢွၼ်ၼႃႈလူၵ်ႈတိုၼ်ႇ မိူဝ်ႈမီးႁဝ်းသွင်ၵေႃႉၵူၺ်း။",
        "Ndai sumla yawng gaw mungkan n dum shi ai aten, anhte lahkawng sha nga ai shaloi la ai re.",
        "ทุกภาพในนี้ถ่ายในชั่วโมงก่อนโลกจะตื่น ตอนที่มีเพียงเราสองคน",
        "这里的每一帧，都摄于世界醒来前的那一小时，只有我们两个人。",
        "Mỗi khung hình ở đây được chụp trong giờ trước khi thế giới thức giấc, khi chỉ có hai chúng ta.",
        "Setiap bingkai di sini dibuat pada jam sebelum dunia terbangun, saat hanya ada kami berdua.",
        "Setiap bingkai di sini dirakam pada jam sebelum dunia terjaga, ketika hanya ada kami berdua.")
    ]
  },
  wedding: {
    lines: [
      S(L("နံနက်ခင်း", "The morning", "ၵၢင်ၼႂ်", "Jahpawt", "ยามเช้า", "清晨", "Buổi sáng", "Pagi hari", "Pagi hari"),
        L("အဆင်သင့် ပြင်ဆင်ခြင်း", "Getting Ready", "ႁၢင်ႈႁႅၼ်း", "Hkyen lajang ai", "เตรียมตัว", "准备", "Chuẩn Bị", "Bersiap-siap", "Bersiap Sedia")),
      S(L("မင်္ဂလာအခမ်းအနား", "The ceremony", "ပွႆးမင်ႇၵလႃႇ", "Hkungran poi", "พิธี", "仪式", "Lễ cưới", "Upacara", "Upacara"),
        L("ကတိပေးပါသည်", "I Do", "ႁဝ်းႁပ်ႉ", "Ngai ra ai", "ฉันยินดี", "我愿意", "Em Đồng Ý", "Saya Bersedia", "Saya Sudi")),
      S(L("ပွဲ", "The celebration", "ပွႆး", "Poi", "งานฉลอง", "庆典", "Tiệc mừng", "Perayaan", "Perayaan"),
        L("လူတိုင်း လာခဲ့သည်", "Everyone Came", "ၵူႈၵေႃႉ မႃး", "Yawng sa wa ai", "ทุกคนมากันหมด", "所有人都来了", "Mọi Người Đều Đến", "Semua Datang", "Semua Datang")),
      S(L("ပထမဆုံး အက", "The first dance", "ၵႃႈ ပွၵ်ႈႁႅၵ်ႈ", "Shawng nnan ka ai", "เต้นรำครั้งแรก", "第一支舞", "Điệu nhảy đầu tiên", "Tarian pertama", "Tarian pertama"),
        L("မီးရောင်အောက်မှာ", "Under the Lights", "တႂ်ႈၽႃႉၾႆး", "Nhtoi npu hta", "ใต้แสงไฟ", "灯光之下", "Dưới Ánh Đèn", "Di Bawah Cahaya", "Di Bawah Cahaya"))
    ],
    body: [
      L("တစ်နှစ်လုံး စီစဉ်ခဲ့ပြီး တစ်ခဏတည်းနဲ့ ကုန်သွားသော တစ်နေ့တာ — ခံစားရသလို အတိအကျ ဒီမှာ သိမ်းထားသည်။",
        "One day, planned for a year and over in a heartbeat — kept here exactly as it felt.",
        "ဝၼ်းလဵဝ် ႁၢင်ႈႁႅၼ်းမႃးတင်းပီ သေ ယဝ်ႉၵႂႃႇ ၽွင်းလဵဝ် — မီးဝႆႉတီႈၼႆႈ မိူၼ်ၼင်ႇႁဝ်းႁူႉ။",
        "Shani langai, laning mi hkyen da nna myit sun mi hta htum ai — hkam sha ai hte maren ndai hta da ai.",
        "หนึ่งวันที่วางแผนมาทั้งปี และผ่านไปในพริบตา — เก็บไว้ที่นี่ตรงตามที่รู้สึก",
        "筹备了一年的一天，转瞬即逝——原原本本地留在这里。",
        "Một ngày được chuẩn bị cả năm và trôi qua trong một nhịp tim — giữ lại ở đây đúng như đã cảm nhận.",
        "Satu hari, direncanakan setahun dan berlalu dalam sekejap — disimpan di sini persis seperti rasanya.",
        "Satu hari, dirancang setahun dan berakhir sekelip mata — disimpan di sini tepat seperti yang dirasai."),
      L("လာခဲ့သောသူများ၊ ဆိုခဲ့သော ကတိသစ္စာ၊ နှင့် မဆုံးခဲ့သော အက။",
        "The people who came, the vows that were spoken, and the dance that never quite ended.",
        "ၵူၼ်းၸိူဝ်းမႃး ၵႂၢမ်းမၼ်ႈၸိူဝ်းလၢတ်ႈ လႄႈ ၵႃႈဢၼ်ဢမ်ႇယဝ်ႉ။",
        "Sa wa ai masha ni, tsun ai ga sadi ni, hte n htum ai ka poi.",
        "ผู้คนที่มา คำสาบานที่เอื้อนเอ่ย และการเต้นรำที่ไม่เคยจบลงจริง ๆ",
        "来的人，说出的誓言，和那支始终没有真正结束的舞。",
        "Những người đã đến, những lời thề đã nói, và điệu nhảy chưa bao giờ thực sự kết thúc.",
        "Orang-orang yang datang, janji yang diucapkan, dan tarian yang tak pernah benar-benar usai.",
        "Mereka yang hadir, ikrar yang dilafazkan, dan tarian yang tidak pernah benar-benar berakhir.")
    ]
  },
  solo: {
    lines: [
      S(L("ပုံရိပ်", "Portrait", "ႁၢင်ႈ", "Sumla", "ภาพบุคคล", "写真", "Chân dung", "Potret", "Potret"),
        L("ကျွန်ုပ်ဆိုတာ ဒီလိုပဲ", "Just As I Am", "မိူၼ်ၼင်ႇၵဝ်ပဵၼ်", "Ngai nga ai hte maren", "เป็นอย่างที่ฉันเป็น", "就是我本来的样子", "Đúng Như Tôi Vốn Là", "Apa Adanya Diriku", "Seadanya Diriku")),
      S(L("အလင်းထဲမှာ", "In the light", "ၼႂ်းၽႃႉ", "Nhtoi hta", "ในแสง", "光之中", "Trong ánh sáng", "Dalam cahaya", "Dalam cahaya"),
        L("ကောင်းသော နေ့တစ်နေ့", "A Good Day for It", "ဝၼ်းလီ", "Kaja ai shani langai", "วันดี ๆ สำหรับสิ่งนี้", "美好的一天", "Một Ngày Đẹp", "Hari yang Baik", "Hari yang Baik")),
      S(L("မဂ္ဂဇင်း", "Editorial", "မႅၵ်ႇၸိၼ်း", "Laika buk", "นิตยสาร", "杂志", "Tạp chí", "Majalah", "Majalah"),
        L("ပိုမြင့်မားစွာ ရပ်ခြင်း", "Standing Taller", "ၸုၵ်းသုင်", "Grau nna tsap ai", "ยืนตัวตรงขึ้น", "站得更高", "Đứng Thẳng Hơn", "Berdiri Lebih Tegak", "Berdiri Lebih Tegak")),
      S(L("အနီးကပ်", "Close", "ႁိမ်း", "Ni ai", "ใกล้ชิด", "近景", "Cận cảnh", "Dekat", "Dekat"),
        L("တိတ်ဆိတ်သော အကြည့်", "The Quiet Look", "တႃတူၺ်း ၼိမ်", "Ngwi pyaw ai yu ai", "สายตาที่เงียบสงบ", "静默的凝视", "Ánh Nhìn Lặng Lẽ", "Tatapan yang Tenang", "Pandangan yang Tenang"))
    ],
    body: [
      L("လူတစ်ယောက်၊ အလင်းတစ်မျိုး၊ နှင့် ကင်မရာ ပြန်ကြည့်နေချိန် ငြိမ်ငြိမ်ရပ်နိုင်သော ယုံကြည်မှု။",
        "One person, one light, and the confidence to stand still while the camera looked back.",
        "ၵေႃႉလဵဝ် ၽႃႉလဵဝ် လႄႈ ၸႂ်မၼ်ႈ ၸုၵ်းၼိမ် မိူဝ်ႈၵွင်ႈထၢႆႇ တူၺ်းၶိုၼ်း။",
        "Masha langai, nhtoi langai, hte camera bai yu ai shaloi ngwi nga lu ai myit kam.",
        "หนึ่งคน หนึ่งแสง และความมั่นใจที่จะยืนนิ่งขณะกล้องมองกลับมา",
        "一个人，一种光，以及镜头回望时依然站定的自信。",
        "Một người, một thứ ánh sáng, và sự tự tin đứng yên khi máy ảnh nhìn lại.",
        "Satu orang, satu cahaya, dan keyakinan untuk berdiri diam saat kamera menatap balik.",
        "Satu orang, satu cahaya, dan keyakinan untuk berdiri tegak ketika kamera membalas pandangan."),
      L("ဝတ်စုံမဟုတ်၊ လူအုပ်မဟုတ် — သာမန် ညနေခင်းတစ်ခုမှာ ရှိသလို မျက်နှာတစ်ခုသာ။",
        "No costume, no crowd — just a face the way it is on an ordinary afternoon.",
        "ဢမ်ႇမီးၶူဝ်းၼုင်ႈ ဢမ်ႇမီးၵူၼ်းၼမ် — ၼႃႈလဵဝ် မိူၼ်ၼင်ႇဝၼ်းဝႆး ယူဝ်း။",
        "Palawng n nga, masha n law — nang hkring ai shana maga na myi man langai sha.",
        "ไม่มีเครื่องแต่งกาย ไม่มีฝูงชน — มีแค่ใบหน้าอย่างที่เป็นในบ่ายวันธรรมดา",
        "没有戏服，没有人群——只是一张寻常午后本来的脸。",
        "Không trang phục, không đám đông — chỉ một khuôn mặt đúng như nó trong một buổi chiều bình thường.",
        "Tanpa kostum, tanpa kerumunan — hanya sebuah wajah apa adanya di suatu sore biasa.",
        "Tanpa kostum, tanpa orang ramai — hanya sebuah wajah seadanya pada suatu petang biasa.")
    ]
  },
  family: {
    lines: [
      S(L("အိမ်", "Home", "ႁိူၼ်း", "Nta", "บ้าน", "家", "Nhà", "Rumah", "Rumah"),
        L("ဘောင်တစ်ခုထဲမှာ လူတိုင်း", "Everyone in One Frame", "ၵူႈၵေႃႉ ၼႂ်းႁၢင်ႈလဵဝ်", "Sumla langai hta yawng", "ทุกคนในเฟรมเดียว", "所有人在一帧里", "Mọi Người Trong Một Khung Hình", "Semua dalam Satu Bingkai", "Semua dalam Satu Bingkai")),
      S(L("မျိုးဆက်များ", "Generations", "ၸုပ်ႈၵူၼ်း", "Prat ni", "รุ่นสู่รุ่น", "世代", "Các thế hệ", "Generasi", "Generasi"),
        L("ကျွန်ုပ်တို့ လာခဲ့သောနေရာ", "Where We Come From", "တီႈႁဝ်းလုၵ်ႉမႃး", "Anhte lawm ai shara", "ที่ที่เรามาจาก", "我们来自哪里", "Nơi Chúng Ta Bắt Đầu", "Dari Mana Kami Berasal", "Dari Mana Kami Datang")),
      S(L("အတူတကွ", "Together", "ၸွမ်းၵၼ်", "Rau", "ด้วยกัน", "在一起", "Cùng nhau", "Bersama", "Bersama"),
        L("တနင်္ဂနွေ စားပွဲ", "The Sunday Table", "ၽိူၼ်ဝၼ်းတိတ်ႉ", "Nawmi shani na saboi", "โต๊ะอาหารวันอาทิตย์", "周日的餐桌", "Bàn Ăn Chủ Nhật", "Meja Hari Minggu", "Meja Hari Ahad")),
      S(L("ကလေးငယ်များ", "Little ones", "လုၵ်ႈဢွၼ်ႇ", "Ma kasha ni", "เด็กเล็ก ๆ", "小家伙们", "Bọn trẻ", "Si kecil", "Si kecil"),
        L("အရမ်းမြန်မြန် ကြီးလာ", "Growing Too Fast", "ယႂ်ႇမႃးဝႆး", "Grai lawan kaba wa ai", "โตเร็วเกินไป", "长得太快", "Lớn Nhanh Quá", "Tumbuh Terlalu Cepat", "Membesar Terlalu Cepat"))
    ],
    body: [
      L("အခန်းတစ်ခုထဲမှာ မျိုးဆက်သုံးဆက်၊ နှင့် သူတို့တိုင်းထဲက ဆင့်ကမ်းလာသော အပြုံးတစ်ခုတည်း။",
        "Three generations in one room, and the same smile passed down every one of them.",
        "သၢမ်ၸုပ်ႈ ၼႂ်းႁွင်ႈလဵဝ် လႄႈ ယုမ်ႉလဵဝ် သိုပ်ႇမႃး ၵူႈၵေႃႉ။",
        "Prat masum gawk langai hta, hte dai mani ai gaw shanhte yawng hta lai wa ai.",
        "สามรุ่นในห้องเดียว และรอยยิ้มเดียวกันที่ส่งต่อมาถึงทุกคน",
        "三代人在一间屋里，同一个微笑传给了每一个人。",
        "Ba thế hệ trong một căn phòng, và cùng một nụ cười truyền qua từng người.",
        "Tiga generasi dalam satu ruangan, dan senyum yang sama diwariskan pada setiap mereka.",
        "Tiga generasi dalam satu ruang, dan senyuman yang sama diwarisi setiap seorang."),
      L("အိမ်ဆိုတာ အိမ်ဆောင်မဟုတ်။ ၎င်းကို ပြည့်စေသော လူများနှင့် သူတို့ဖန်တီးသော အသံများ။",
        "Home is not the house. It is the people who fill it and the noise they make.",
        "ႁိူၼ်း ဢမ်ႇၸႂ်ႈတိူၵ်ႈ။ ပဵၼ်ၵူၼ်းၸိူဝ်းယူႇၼႂ်း လႄႈ သဵင်ၶဝ်။",
        "Nta ngu ai gaw nta hpun n re. Dai kaw nga ai masha ni hte shanhte a nsen re.",
        "บ้านไม่ใช่ตัวอาคาร แต่คือผู้คนที่เติมเต็มมันและเสียงที่พวกเขาสร้างขึ้น",
        "家不是房子。家是填满它的人，和他们发出的声响。",
        "Nhà không phải là ngôi nhà. Là những người lấp đầy nó và tiếng ồn họ tạo ra.",
        "Rumah bukanlah bangunannya. Rumah adalah orang-orang yang mengisinya dan keriuhan yang mereka buat.",
        "Rumah bukan bangunannya. Ia adalah orang yang memenuhinya dan bunyi yang mereka cipta.")
    ]
  },
  baby: {
    lines: [
      S(L("ပထမလ", "Month one", "လိူၼ်ႁႅၵ်ႈ", "Shata langai", "เดือนแรก", "第一个月", "Tháng đầu", "Bulan pertama", "Bulan pertama"),
        L("မင်္ဂလာပါ ကလေးငယ်", "Hello, Little One", "မႂ်ႇသုင် လုၵ်ႈဢွၼ်ႇ", "Kaja i, ma kasha", "สวัสดี เจ้าตัวเล็ก", "你好，小宝贝", "Chào Con, Bé Yêu", "Halo, Si Kecil", "Helo, Si Kecil")),
      S(L("ပထမဆုံးများ", "Firsts", "ပွၵ်ႈႁႅၵ်ႈ", "Shawng nnan ni", "ครั้งแรก", "第一次", "Những lần đầu", "Yang pertama", "Yang pertama"),
        L("ပထမဆုံး အပြုံး", "The First Smile", "ယုမ်ႉ ပွၵ်ႈႁႅၵ်ႈ", "Shawng nnan mani ai", "รอยยิ้มแรก", "第一个微笑", "Nụ Cười Đầu Tiên", "Senyum Pertama", "Senyuman Pertama")),
      S(L("သေးငယ်သော အရာများ", "Small things", "ၶူဝ်းဢွၼ်ႇ", "Kachyi ai rai ni", "สิ่งเล็ก ๆ", "小小的事", "Những điều nhỏ", "Hal-hal kecil", "Perkara kecil"),
        L("လက်ကလေးများ", "Tiny Hands", "မိုဝ်းဢွၼ်ႇ", "Kachyi ai lata ni", "มือน้อย ๆ", "小小的手", "Đôi Tay Bé Xíu", "Tangan Kecil", "Tangan Kecil")),
      S(L("ဆယ့်နှစ်လ", "Twelve months", "သိပ်းသွင်လိူၼ်", "Shata shi lahkawng", "สิบสองเดือน", "十二个月", "Mười hai tháng", "Dua belas bulan", "Dua belas bulan"),
        L("တစ်နှစ်ပြည့်", "One Whole Year", "တဵမ်ပီ", "Laning mi hkum", "หนึ่งปีเต็ม", "整整一年", "Tròn Một Năm", "Satu Tahun Penuh", "Setahun Genap"))
    ],
    body: [
      L("ပတ်တိုင်း အသစ်တစ်ခု — အသံတစ်ခု၊ လက်ဆန့်တစ်ခု၊ ဘယ်သူမှ မကြားဖူးသော ရယ်သံတစ်ခု။",
        "Every week something new: a sound, a reach, a laugh nobody had heard before.",
        "ၵူႈဝူင်ႈ မီးလွင်ႈမႂ်ႇ — သဵင်လဵဝ် ယိုၼ်ႈမိုဝ်း ႁူဝ်ၶူဝ် ဢၼ်ဢမ်ႇမီးၽႂ်ငိၼ်း။",
        "Bat shagu nnan ai langai: nsen langai, lata shachyen ai, kadai mung n na ga ai mani ai.",
        "ทุกสัปดาห์มีสิ่งใหม่ เสียงหนึ่ง การเอื้อมมือ เสียงหัวเราะที่ไม่มีใครเคยได้ยิน",
        "每一周都有新东西：一个声音，一次伸手，一声从没人听过的笑。",
        "Mỗi tuần một điều mới: một tiếng, một cái vươn tay, một tiếng cười chưa ai từng nghe.",
        "Setiap minggu ada yang baru: sebuah suara, sebuah jangkauan, sebuah tawa yang belum pernah didengar siapa pun.",
        "Setiap minggu ada yang baharu: satu bunyi, satu capaian, satu tawa yang belum pernah didengar siapa pun."),
      L("အရာအားလုံးကို ပြောင်းလဲစေသော နှစ်၊ ပုံသေးသေး တစ်ပုံစီနဲ့ သိမ်းဆည်းထား။",
        "The year that changed everything, kept one small photograph at a time.",
        "ပီဢၼ်လႅၵ်ႈလၢႆႈၵူႈလွင်ႈ မီးဝႆႉ ႁၢင်ႈဢွၼ်ႇ ပွၵ်ႈလဵဝ် ႁၢင်ႈလဵဝ်။",
        "Yawng hpe galai shai ai laning, kachyi ai sumla langai hpang langai da ai.",
        "ปีที่เปลี่ยนทุกสิ่ง เก็บไว้ทีละภาพเล็ก ๆ",
        "改变一切的一年，用一张张小照片留了下来。",
        "Năm đã thay đổi mọi thứ, được giữ lại từng tấm ảnh nhỏ một.",
        "Tahun yang mengubah segalanya, disimpan satu foto kecil demi satu.",
        "Tahun yang mengubah segalanya, disimpan satu gambar kecil pada satu masa.")
    ]
  },
  newborn: {
    lines: [
      S(L("ပထမနေ့", "Day one", "ဝၼ်းႁႅၵ်ႈ", "Shani langai", "วันแรก", "第一天", "Ngày đầu", "Hari pertama", "Hari pertama"),
        L("အိမ်သို့ ကြိုဆိုပါသည်", "Welcome Home", "ႁပ်ႉတွၼ်ႈ ႁွတ်ႈႁိူၼ်း", "Nta de kabu hkap tau", "ยินดีต้อนรับกลับบ้าน", "欢迎回家", "Chào Mừng Về Nhà", "Selamat Datang di Rumah", "Selamat Pulang")),
      S(L("အိပ်ပျော်နေ", "Asleep", "ၼွၼ်း", "Yup nga ai", "หลับใหล", "睡着了", "Đang ngủ", "Tertidur", "Tertidur"),
        L("သေးငယ်၍ တိတ်ဆိတ်", "Small and Quiet", "လဵၵ်ႉလႄႈ ၼိမ်", "Kachyi nna ngwi pyaw ai", "เล็กและเงียบ", "小小的，安安静静", "Nhỏ Bé Và Yên Bình", "Kecil dan Tenang", "Kecil dan Tenang")),
      S(L("ပွေ့ထား", "Held", "ၵမ်ႉဝႆႉ", "Ahpum da ai", "อุ้มไว้", "抱着", "Trong vòng tay", "Dalam gendongan", "Dalam dakapan"),
        L("ဒီလက်မောင်းများထဲ လုံခြုံ", "Safe in These Arms", "လွတ်ၽေး ၼႂ်းၶႅၼ်ၼႆႉ", "Ndai lata hta shim lum ai", "ปลอดภัยในอ้อมแขนนี้", "在这双臂弯里安然", "An Toàn Trong Vòng Tay Này", "Aman dalam Pelukan Ini", "Selamat dalam Dakapan Ini")),
      S(L("အသေးစိတ်", "Details", "လွင်ႈဢွၼ်ႇ", "Kachyi ai lam ni", "รายละเอียด", "细节", "Chi tiết", "Detail", "Perincian"),
        L("လက်ချောင်းကလေး ဆယ်ချောင်း", "Ten Tiny Fingers", "ၼိဝ်ႉမိုဝ်းဢွၼ်ႇ သိပ်း", "Kachyi ai lata yung shi", "นิ้วน้อย ๆ สิบนิ้ว", "十个小手指", "Mười Ngón Tay Bé Xíu", "Sepuluh Jari Kecil", "Sepuluh Jari Kecil"))
    ],
    body: [
      L("ပထမဆုံးရက်များသည် နို့တိုက်ခြင်း၊ အိပ်ခြင်းနှင့် အံ့ဩစွာ ငေးကြည့်ခြင်းတို့၏ တိတ်ဆိတ်မှုထဲ ကုန်ဆုံးသွားသည်။",
        "The first days pass in a hush of feeding, sleeping and staring in wonder.",
        "ဝၼ်းႁႅၵ်ႈၸိူဝ်းၼၼ်ႉ ပူၼ်ႉၵႂႃႇ ၼႂ်းလွင်ႈၼိမ် ၵိၼ်ၼူမ်း ၼွၼ်း လႄႈ တူၺ်း ဢၢမ်း။",
        "Shawng nnan a shani ni gaw jaw sha ai, yup ai hte mau nna yu ai ngwi pyaw ai hta lai mat wa ai.",
        "วันแรก ๆ ผ่านไปในความเงียบของการป้อนนม การหลับ และการจ้องมองด้วยความอัศจรรย์",
        "最初的日子在喂奶、睡觉和惊奇凝望的静谧中悄悄过去。",
        "Những ngày đầu trôi qua trong sự tĩnh lặng của cho ăn, ngủ và ngắm nhìn đầy ngỡ ngàng.",
        "Hari-hari pertama berlalu dalam keheningan menyusui, tidur, dan menatap penuh takjub.",
        "Hari-hari pertama berlalu dalam kesenyapan menyusu, tidur dan merenung penuh kagum."),
      L("ကမ္ဘာ မဆူညံမီ၊ ကျွန်ုပ်တို့ ရှာတွေ့နိုင်သော အနူးညံ့ဆုံး အလင်းထဲမှာ ရိုက်ခဲ့သည်။",
        "Photographed in the softest light we could find, before the world got loud.",
        "ထၢႆႇၼႂ်းၽႃႉဢုၼ်ႇသုတ်း ဢၼ်ႁဝ်းႁႃလႆႈ ဢွၼ်ၼႃႈလူၵ်ႈ သဵင်လင်။",
        "Mungkan n ngoi shi yang, anhte tam lu ai grau nyem ai nhtoi hta la ai.",
        "ถ่ายในแสงที่นุ่มที่สุดที่เราหาได้ ก่อนที่โลกจะเสียงดัง",
        "在世界变得喧闹之前，用我们能找到的最柔和的光拍下。",
        "Chụp trong thứ ánh sáng dịu nhất chúng tôi tìm được, trước khi thế giới trở nên ồn ào.",
        "Dipotret dalam cahaya paling lembut yang bisa kami temukan, sebelum dunia menjadi riuh.",
        "Dirakam dalam cahaya paling lembut yang dapat kami temui, sebelum dunia menjadi bingit.")
    ]
  },
  kid: {
    lines: [
      S(L("ကစားခြင်း", "Play", "လဵၼ်ႈ", "Gasup ai", "การเล่น", "玩耍", "Vui chơi", "Bermain", "Bermain"),
        L("ဘယ်တော့မှ မငြိမ်", "Never Sitting Still", "ဢမ်ႇယူႇၼိမ်", "Galoi mung n hkring ai", "ไม่เคยอยู่นิ่ง", "一刻也坐不住", "Không Lúc Nào Ngồi Yên", "Tak Pernah Diam", "Tak Pernah Duduk Diam")),
      S(L("အပြင်ဘက်", "Outdoors", "ၼွၵ်ႈ", "Shinggan", "กลางแจ้ง", "户外", "Ngoài trời", "Luar rumah", "Luar rumah"),
        L("မြေက ရိုင်းစိုင်းရာ", "Where the Land Is Untamed", "တီႈလိၼ်ထိူၼ်ႇ", "Ga gaw n nawn ai shara", "ที่ที่แผ่นดินยังไม่ถูกทำให้เชื่อง", "大地未驯之处", "Nơi Đất Trời Còn Hoang Dã", "Tempat Alam Masih Liar", "Tempat Bumi Masih Liar")),
      S(L("စိတ်ကူးယဉ်", "Imagination", "ၸႂ်ၶႂ်ႈ", "Myit sawn ai", "จินตนาการ", "想象", "Trí tưởng tượng", "Imajinasi", "Imaginasi"),
        L("အိမ်ထဲမှာ ကမ္ဘာတစ်ခုလုံး", "A Whole World Indoors", "လူၵ်ႈတင်းလူၵ်ႈ ၼႂ်းႁိူၼ်း", "Nta kata hta mungkan ting", "โลกทั้งใบในบ้าน", "屋子里的整个世界", "Cả Một Thế Giới Trong Nhà", "Seluruh Dunia di Dalam Rumah", "Seluruh Dunia di Dalam Rumah")),
      S(L("အချစ်ဆုံး သူငယ်ချင်း", "Best friends", "ဢူၺ်းၵေႃႉ", "Manang kaja", "เพื่อนรัก", "最好的朋友", "Bạn thân", "Sahabat", "Sahabat"),
        L("ပရိယာယ်ဖော်များ", "Partners in Mischief", "ၵေႃႉလဵၼ်ႈၸွမ်း", "Rau gasup ai manang ni", "คู่หูซุกซน", "调皮搭档", "Cặp Đôi Nghịch Ngợm", "Rekan Berulah", "Rakan Nakal"))
    ],
    body: [
      L("ရွှံ့ပေသော ဒူး၊ ကျွတ်သွားသော သွား၊ နှင့် သူတို့မရောက်မီ ကြိုရောက်လာသော ရယ်သံ။",
        "Muddy knees, missing teeth and a laugh that arrives before they do.",
        "ႁူဝ်ၶဝ်ႇ ၼမ်ႉၵူမ်ႇ ၶဵဝ်ႈလူႉ လႄႈ ႁူဝ်ၶူဝ် ဢၼ်မႃးဢွၼ်ၼႃႈၶဝ်။",
        "Hkumbi hta hka nsam, wa n nga ai, hte shanhte du shawng mani ai nsen.",
        "หัวเข่าเปื้อนโคลน ฟันหลอ และเสียงหัวเราะที่มาถึงก่อนตัวเสมอ",
        "泥巴膝盖、掉了的门牙，和总是先于人到的笑声。",
        "Đầu gối lấm bùn, răng sún và tiếng cười luôn đến trước bọn trẻ.",
        "Lutut berlumpur, gigi ompong, dan tawa yang tiba lebih dulu dari mereka.",
        "Lutut berlumpur, gigi rongak dan tawa yang tiba sebelum mereka."),
      L("ကလေးဘဝက မစောင့်ဘူး။ ဒါတွေက အမြန်ဆုံး ကုန်သွားတဲ့ နေ့ရက်တွေ။",
        "Childhood does not wait. These are the days that go by fastest of all.",
        "ပၢၼ်လုၵ်ႈဢွၼ်ႇ ဢမ်ႇပႂ်ႉ။ ၸိူဝ်းၼႆႉ ပဵၼ်ဝၼ်း ဢၼ်ပူၼ်ႉဝႆးသုတ်း။",
        "Ma prat gaw n la nga ai. Ndai ni gaw grau lawan lai mat wa ai shani ni re.",
        "วัยเด็กไม่รอใคร นี่คือวันที่ผ่านไปเร็วที่สุด",
        "童年不等人。这些是过得最快的日子。",
        "Tuổi thơ không chờ đợi. Đây là những ngày trôi qua nhanh nhất.",
        "Masa kecil tidak menunggu. Inilah hari-hari yang berlalu paling cepat.",
        "Zaman kanak-kanak tidak menunggu. Inilah hari-hari yang paling pantas berlalu.")
    ]
  },
  birthday: {
    lines: [
      S(L("ပါတီ", "The party", "ပွႆး", "Poi", "งานเลี้ยง", "派对", "Tiệc", "Pesta", "Parti"),
        L("ဆန္ဒတစ်ခု ပြုပါ", "Make a Wish", "ဢဝ်ၵၢင်ၸႂ်", "Myit mada langai galaw u", "ขอพรสักข้อ", "许个愿", "Ước Một Điều", "Buat Permohonan", "Buat Satu Hajat")),
      S(L("ကိတ်မုန့်", "The cake", "ၶဝ်ႈမုၼ်း", "Muk", "เค้ก", "蛋糕", "Bánh", "Kue", "Kek"),
        L("ဖယောင်းတိုင် တစ်တိုင်ထပ်", "One More Candle", "တဵၼ်း ထႅင်ႈလဵမ်း", "Wan langai bai jat", "เทียนอีกหนึ่งเล่ม", "再多一根蜡烛", "Thêm Một Ngọn Nến", "Satu Lilin Lagi", "Satu Lagi Lilin")),
      S(L("သူငယ်ချင်းများ", "Friends", "ဢူၺ်းၵေႃႉ", "Manang ni", "เพื่อน ๆ", "朋友们", "Bạn bè", "Teman-teman", "Rakan-rakan"),
        L("အကောင်းဆုံး လူများ အားလုံး", "All the Best People", "ၵူၼ်းလီ ၵူႈၵေႃႉ", "Kaja dik ai masha ni yawng", "คนดี ๆ ทั้งหมด", "最好的人都在", "Những Người Tuyệt Nhất", "Semua Orang Terbaik", "Semua Orang Terbaik")),
      S(L("လက်ဆောင်များ", "Presents", "ၶူဝ်းတွၼ်ႈ", "Kumhpa ni", "ของขวัญ", "礼物", "Quà", "Hadiah", "Hadiah"),
        L("အံ့ဩစရာ!", "Surprise!", "ဢၢမ်း!", "Mau ai!", "เซอร์ไพรส์!", "惊喜！", "Bất Ngờ!", "Kejutan!", "Kejutan!"))
    ],
    body: [
      L("ပူဖောင်းများ၊ ဖယောင်းတိုင်များ၊ နှင့် ဒီအတွက်ပဲ လာခဲ့သော လူများ ပြည့်နေသော အခန်း။",
        "Balloons, candles and a room full of people who came just for this.",
        "ပူမ်လူမ် တဵၼ်း လႄႈ ႁွင်ႈတဵမ်ၵူၼ်း ဢၼ်မႃးၵွပ်ႈလွင်ႈၼႆႉ။",
        "Baloon ni, wan ni, hte ndai a matu sha sa wa ai masha ni hpring ai gawk.",
        "ลูกโป่ง เทียน และห้องที่เต็มไปด้วยคนที่มาเพื่อสิ่งนี้",
        "气球、蜡烛，和一屋子专为此而来的人。",
        "Bóng bay, nến và một căn phòng đầy những người đến chỉ vì điều này.",
        "Balon, lilin, dan ruangan penuh orang yang datang hanya untuk ini.",
        "Belon, lilin dan sebuah bilik penuh dengan orang yang hadir hanya untuk ini."),
      L("နောက်တစ်နှစ်၊ နောက်ဆန္ဒတစ်ခု — ဖယောင်းတိုင် မငြိမ်းမီ တစ်ခုချင်း ဒီမှာ ဖမ်းယူထား။",
        "Another year, another wish — and every one of them caught here before the candles went out.",
        "ထႅင်ႈပီ ထႅင်ႈၵၢင်ၸႂ် — ၵူႈလွင်ႈ မီးဝႆႉတီႈၼႆႈ ဢွၼ်ၼႃႈ တဵၼ်းမွတ်ႇ။",
        "Laning langai bai, myit mada langai bai — wan ni n si shi yang yawng hpe ndai hta rim da ai.",
        "อีกหนึ่งปี อีกหนึ่งคำอธิษฐาน — ทุกอย่างถูกเก็บไว้ที่นี่ก่อนเทียนจะดับ",
        "又一年，又一个愿望——都在蜡烛熄灭前留在了这里。",
        "Thêm một năm, thêm một điều ước — tất cả được giữ lại ở đây trước khi nến tắt.",
        "Satu tahun lagi, satu permohonan lagi — dan semuanya tertangkap di sini sebelum lilin padam.",
        "Setahun lagi, satu hajat lagi — dan semuanya dirakam di sini sebelum lilin terpadam.")
    ]
  },
  event: {
    lines: [
      S(L("ည", "The night", "ၶိုၼ်း", "Shana", "ค่ำคืน", "夜晚", "Đêm", "Malam", "Malam"),
        L("တံခါး ဖွင့်", "Doors Open", "ၽၵ်းတူ ပိုတ်ႇ", "Chyinghka hpaw ai", "เปิดประตู", "开门迎客", "Mở Cửa", "Pintu Dibuka", "Pintu Dibuka")),
      S(L("စင်ပေါ်မှာ", "On stage", "ၼိူဝ်ၶဵင်ႇ", "Stage ntsa", "บนเวที", "舞台上", "Trên sân khấu", "Di panggung", "Di pentas"),
        L("ပွဲ၏ အဓိက", "The Main Event", "လွင်ႈယႂ်ႇ", "Poi kaba", "รายการหลัก", "重头戏", "Sự Kiện Chính", "Acara Utama", "Acara Utama")),
      S(L("ပရိသတ်", "The crowd", "ၵူၼ်းၼမ်", "Masha law law", "ผู้ชม", "人群", "Đám đông", "Kerumunan", "Orang ramai"),
        L("လူတိုင်း လာခဲ့သည်", "Everyone Came", "ၵူႈၵေႃႉ မႃး", "Yawng sa wa ai", "ทุกคนมากันหมด", "所有人都来了", "Mọi Người Đều Đến", "Semua Datang", "Semua Datang")),
      S(L("နောက်ကျချိန်", "After hours", "ၵၢင်ၶိုၼ်း", "Shana lai yang", "หลังงาน", "散场之后", "Sau giờ", "Larut malam", "Lewat malam"),
        L("မီးလင်းလာသည်အထိ", "Until the Lights Came Up", "တေႃႇထိုင် ၽႃႉၾႆးလႅင်း", "Nhtoi bai htoi wa ai du hkra", "จนไฟสว่างขึ้น", "直到灯光亮起", "Cho Đến Khi Đèn Sáng", "Sampai Lampu Menyala", "Hingga Lampu Menyala"))
    ],
    body: [
      L("ပထမဆုံး ဧည့်သည်မှ နောက်ဆုံး သီချင်းအထိ — တစ်ညလုံး၊ လူတိုင်း၊ ဖြစ်ပျက်ခဲ့သလို အတိအကျ။",
        "From the first guest to the last song: the whole night, everyone, exactly as it happened.",
        "တႄႇၶႅၵ်ႇၵေႃႉႁႅၵ်ႈ တေႃႇၽဵင်းလိုၼ်းသုတ်း — တင်းၶိုၼ်း ၵူႈၵေႃႉ မိူၼ်ၼင်ႇပဵၼ်။",
        "Shawng nnan na manam kaw na hpang jahtum na mahkawn du hkra: shana ting, yawng, byin ai hte maren.",
        "จากแขกคนแรกถึงเพลงสุดท้าย ทั้งคืน ทุกคน ตรงตามที่เกิดขึ้น",
        "从第一位来宾到最后一首歌：整个夜晚，每一个人，一切如实。",
        "Từ vị khách đầu tiên đến bài hát cuối cùng: cả đêm, mọi người, đúng như đã diễn ra.",
        "Dari tamu pertama sampai lagu terakhir: sepanjang malam, semua orang, persis seperti yang terjadi.",
        "Dari tetamu pertama hingga lagu terakhir: sepanjang malam, semua orang, tepat seperti yang berlaku."),
      L("မိန့်ခွန်းများ၊ လက်ခုပ်သံများ၊ နှင့် ဘယ်သူမှ မစီစဉ်ခဲ့သော အကြားက တိတ်ဆိတ်သော အခိုက်အတန့်များ။",
        "Speeches, applause and the quiet moments between them that nobody planned.",
        "ၵႂၢမ်းလၢတ်ႈ သဵင်တွပ်ႇမိုဝ်း လႄႈ ၶၢဝ်းၼိမ် ၼႂ်းၵႄႈ ဢၼ်ဢမ်ႇမီးၽႂ်ႁၢင်ႈႁႅၼ်း။",
        "Ga shaga ai ni, lata kabaw ai, hte kadai mung n hkyen da ai lapran na ngwi pyaw ai aten ni.",
        "สุนทรพจน์ เสียงปรบมือ และช่วงเวลาเงียบ ๆ ระหว่างนั้นที่ไม่มีใครวางแผน",
        "致辞、掌声，以及其间没人计划过的安静片刻。",
        "Những bài phát biểu, tràng vỗ tay và những khoảnh khắc lặng lẽ giữa chúng mà không ai lên kế hoạch.",
        "Pidato, tepuk tangan, dan momen-momen tenang di antaranya yang tak seorang pun rencanakan.",
        "Ucapan, tepukan dan detik-detik sunyi di antaranya yang tidak dirancang oleh siapa pun.")
    ]
  }
};

module.exports = { STORIES };
