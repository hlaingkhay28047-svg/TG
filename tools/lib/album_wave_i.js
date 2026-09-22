"use strict";
/* ============================================================================
   tools/lib/album_wave_i.js — THE TEMPLATE LIBRARY, THE STANDEES AND THE MARKS
   (6.125.0, Smart Album wave I)

   The owner's two SS Album recordings and a screenshot of its library: a studio
   loads a whole folder of its own PSD templates ONCE, files them into groups
   (Prewedding · PSC · Ăn hỏi · Standee 60×200 / 80×200 · Baby · Kỷ yếu · Gia đình),
   filters them by orientation, photo count and star, and then builds a forty-six
   sheet album or a standee from a group in one dialog — bride, groom, date and
   venue typed once and set on every sheet. The tables here are what that needs
   that is DATA rather than code: the standee print sizes, twelve standee designs
   the studio ships before a single PSD is imported, the words those designs set,
   the mark families (date blocks · monograms) the page can wear, twelve text
   styles, the library's default groups and its limits. Every rectangle is a
   FRACTION of the safe area, as every album table before it. */

function L(my, en, shn, kac, th, zh, vi, id, ms) {
  return { my: my, en: en, shn: shn, kac: kac, th: th, zh: zh, vi: vi, id: id, ms: ms };
}

/* ---------------------------------------------------------------------------
   STANDEE SIZES. A standee is a single upright sheet on an X-banner or a roll-up
   stand; 60×200 and 80×200 cm are what the recording's library files its thirty
   templates under, and 60×160 / 80×180 are the two other stands every print shop
   in the region stocks. Large-format print runs at 150 dpi — a 300 dpi 80×200 would
   be 4,724 × 11,811 × 2 = 220 megapixels of canvas that no phone, and few laptops,
   will draw; 150 is what the shops actually rip at.
   --------------------------------------------------------------------------- */
const STANDEE_SIZES = [
  { id: "st60x200", group: "standee", w: 60, h: 200, unit: "cm", dpi: 150 },
  { id: "st80x200", group: "standee", w: 80, h: 200, unit: "cm", dpi: 150 },
  { id: "st60x160", group: "standee", w: 60, h: 160, unit: "cm", dpi: 150 },
  { id: "st80x180", group: "standee", w: 80, h: 180, unit: "cm", dpi: 150 }
];
const STANDEE_GROUP = { id: "standee", label: L("Standee (ဒေါင်လိုက် ပိုစတာ)", "Standee", "Standee", "Standee", "สแตนดี้", "展架 (Standee)", "Standee", "Standee", "Standee") };

/* ---------------------------------------------------------------------------
   THE WORDS A STANDEE SETS. Roles: `title` carries the welcome line, `names` the
   couple ("{B} & {G}" — the design fills both from the album's own info), `date`
   the event date, `caption` the venue, `subtitle` a second line ("SAVE THE DATE").
   --------------------------------------------------------------------------- */
const STANDEE_WORDS = {
  welcome: L("မင်္ဂလာပွဲသို့ ကြိုဆိုပါသည်", "Welcome to the wedding of", "ႁပ်ႉတွၼ်ႈ ပွႆးမင်ႇၵလႃႇ", "Hkungran poi de kabu hkap tau ga", "ยินดีต้อนรับสู่งานแต่งงานของ", "欢迎来到婚礼", "Chào mừng đến lễ cưới của", "Selamat datang di pernikahan", "Selamat datang ke majlis perkahwinan"),
  save: L("ရက်စွဲ မှတ်ထားပါ", "Save the date", "မၢႆဝၼ်းထီႉဝႆႉ", "Shani hpe matsing da u", "จองวันนี้ไว้", "敬请预留", "Hãy nhớ ngày này", "Simpan tanggalnya", "Simpan tarikhnya"),
  ourday: L("ကျွန်ုပ်တို့၏ မင်္ဂလာနေ့", "Our wedding day", "ဝၼ်းမင်ႇၵလႃႇႁဝ်း", "Anhte a hkungran shani", "วันแต่งงานของเรา", "我们的婚礼日", "Ngày cưới của chúng tôi", "Hari pernikahan kami", "Hari perkahwinan kami"),
  playing: L("ကျွန်ုပ်တို့ သီချင်း ဖွင့်နေသည်", "Now playing our song", "တိုၵ်ႉပိုတ်ႇၽဵင်းႁဝ်း", "Anhte a mahkawn dum nga ai", "กำลังเล่นเพลงของเรา", "正在播放我们的歌", "Đang phát bài hát của chúng tôi", "Sedang memutar lagu kami", "Kini dimainkan lagu kami"),
  happy: L("မင်္ဂလာပါ", "Happy wedding", "မင်ႇၵလႃႇ", "Hkungran kabu gara", "สุขสันต์วันแต่งงาน", "新婚快乐", "Chúc mừng hạnh phúc", "Selamat menempuh hidup baru", "Selamat pengantin baru"),
  join: L("အတူ ဆင်နွှဲကြပါစို့", "Join us to celebrate", "မႃးႁူမ်ႈမူၼ်ႈသိူဝ်းၸွမ်း", "Anhte hte rau kabu ga", "มาร่วมฉลองกับเรา", "与我们一同庆祝", "Cùng chung vui với chúng tôi", "Rayakan bersama kami", "Raikan bersama kami"),
  forever: L("ထာဝရက ယနေ့ စတင်သည်", "Forever starts today", "ၵူႈမိူဝ်ႈ တႄႇမိူဝ်ႈၼႆႉ", "Galoi mung gaw dai ni kaw na hpang", "นิรันดร์เริ่มต้นวันนี้", "永远，从今天开始", "Mãi mãi bắt đầu từ hôm nay", "Selamanya dimulai hari ini", "Selamanya bermula hari ini"),
  and: L("&", "&", "&", "&", "&", "&", "&", "&", "&")
};

/* ---------------------------------------------------------------------------
   TWELVE STANDEE DESIGNS. cells are photo frames, texts are the slots the words
   land in (role · word key · align); `word` names a STANDEE_WORDS key for a title
   or subtitle slot, and the module fills names · date · caption from the album's
   own info. The fractions are of a tall safe area (0.3–0.45 wide for its height),
   so one design fits every standee size in the table.
   --------------------------------------------------------------------------- */
function C(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
function S(role, y, h, opt) { const o = { x: 0.08, y: y, w: 0.84, h: h, role: role, align: "center" }; if (opt) Object.keys(opt).forEach(function (k) { o[k] = opt[k]; }); return o; }
function sd(id, n, cells, texts, look) { return { id: id, n: n, cells: cells, texts: texts, look: look || "editorial" }; }

const STANDEES = [
  sd("sd_hero", 1, [C(0, 0, 1, 0.62)],
    [S("title", 0.67, 0.05, { word: "welcome" }), S("names", 0.73, 0.08), S("date", 0.83, 0.04), S("caption", 0.88, 0.04)], "classic"),
  sd("sd_save", 1, [C(0.08, 0.14, 0.84, 0.56)],
    [S("subtitle", 0.06, 0.05, { word: "save" }), S("names", 0.74, 0.08), S("date", 0.84, 0.04), S("caption", 0.89, 0.04)], "minimal"),
  sd("sd_stack2", 2, [C(0.06, 0.04, 0.88, 0.40), C(0.06, 0.46, 0.88, 0.40)],
    [S("names", 0.88, 0.07), S("date", 0.95, 0.04)], "editorial"),
  sd("sd_bigtwo", 3, [C(0, 0, 1, 0.54), C(0, 0.56, 0.49, 0.20), C(0.51, 0.56, 0.49, 0.20)],
    [S("title", 0.79, 0.05, { word: "welcome" }), S("names", 0.85, 0.08), S("date", 0.94, 0.04)], "classic"),
  sd("sd_between", 2, [C(0.05, 0.04, 0.90, 0.36), C(0.05, 0.58, 0.90, 0.36)],
    [S("title", 0.43, 0.04, { word: "ourday" }), S("names", 0.47, 0.07), S("date", 0.53, 0.04)], "script"),
  sd("sd_grid4", 4, [C(0.05, 0.05, 0.44, 0.24), C(0.51, 0.05, 0.44, 0.24), C(0.05, 0.31, 0.44, 0.24), C(0.51, 0.31, 0.44, 0.24)],
    [S("names", 0.62, 0.08), S("date", 0.71, 0.04), S("quote", 0.77, 0.06, { word: "join" }), S("caption", 0.85, 0.04)], "editorial"),
  sd("sd_trio", 3, [C(0.06, 0.03, 0.88, 0.28), C(0.06, 0.33, 0.88, 0.28), C(0.06, 0.63, 0.88, 0.28)],
    [S("names", 0.93, 0.06, { align: "center" })], "minimal"),
  sd("sd_ourday", 1, [C(0, 0.20, 1, 0.60)],
    [S("subtitle", 0.05, 0.04, { word: "ourday" }), S("names", 0.10, 0.08), S("date", 0.84, 0.04), S("caption", 0.89, 0.04)], "classic"),
  sd("sd_playing", 1, [C(0.08, 0.08, 0.84, 0.48)],
    [S("quote", 0.62, 0.05, { word: "playing" }), S("names", 0.69, 0.08), S("date", 0.79, 0.04), S("subtitle", 0.86, 0.04, { word: "forever" })], "editorial"),
  sd("sd_welcome", 1, [C(0.10, 0.12, 0.80, 0.50)],
    [S("title", 0.05, 0.05, { word: "welcome" }), S("names", 0.66, 0.09), S("date", 0.76, 0.04), S("quote", 0.82, 0.05, { word: "happy" })], "script"),
  sd("sd_five", 5, [C(0, 0, 1, 0.40), C(0.05, 0.42, 0.44, 0.15), C(0.51, 0.42, 0.44, 0.15), C(0.05, 0.59, 0.44, 0.15), C(0.51, 0.59, 0.44, 0.15)],
    [S("names", 0.79, 0.08), S("date", 0.88, 0.04), S("caption", 0.93, 0.04)], "editorial"),
  sd("sd_names", 1, [C(0.16, 0.30, 0.68, 0.46)],
    [S("names", 0.10, 0.10), S("date", 0.21, 0.04), S("subtitle", 0.26, 0.03, { word: "save" }), S("caption", 0.82, 0.04)], "minimal")
];

/* ---------------------------------------------------------------------------
   THE MARKS — two families of drawn decor the page can wear beside the ornaments
   of wave G: a DATE BLOCK set from the album's event date (eight ways of writing
   one date, the calendar page among them, as the recording's "Thời gian" group
   does) and a MONOGRAM set from the couple's initials ("Ký tên"). Drawn on the
   canvas by the module; these are the style ids and the order the card offers.
   --------------------------------------------------------------------------- */
const MARKS = {
  date: ["stack", "dots", "calendar", "roman", "ring", "script", "tag", "split"],
  mono: ["circle", "diamond", "amp", "laurel", "seal", "line", "stamp", "script"]
};

/* ---------------------------------------------------------------------------
   TWELVE TEXT STYLES — a role, a face and a size, one tap each (the recording's
   "Chữ" group). Every face is one of the twenty the studio ships; the chip shows
   the role's own word set in that face, so no new label is needed.
   --------------------------------------------------------------------------- */
const TEXT_STYLES = [
  { id: "scriptnames", role: "names", font: "greatvibes", size: 1.35 },
  { id: "serifhead", role: "title", font: "playfair", size: 1.15 },
  { id: "capskick", role: "subtitle", font: "montserrat", size: 0.9 },
  { id: "romantitle", role: "title", font: "cinzel", size: 1.0 },
  { id: "italicquote", role: "quote", font: "cormorant", size: 1.1 },
  { id: "cleanname", role: "names", font: "jost", size: 1.1 },
  { id: "bigdate", role: "date", font: "lato", size: 1.5 },
  { id: "tinycap", role: "caption", font: "inter", size: 0.9 },
  { id: "deconame", role: "names", font: "parisienne", size: 1.3 },
  { id: "editorialhead", role: "title", font: "italiana", size: 1.2 },
  { id: "mytitle", role: "title", font: "notoserifmy", size: 1.0 },
  { id: "myscript", role: "names", font: "padauk", size: 1.2 }
];

/* ---------------------------------------------------------------------------
   THE LIBRARY'S DEFAULT GROUPS — the recording's shelf, in the studio's words. A
   group that is also an occasion takes the occasion's own nine-language name (occ);
   the three that are not carry their own.
   --------------------------------------------------------------------------- */
/* `match` is what an imported file's own name is read against, in this order, to guess the group
   it belongs in — the words a studio actually types, in the languages this studio's students type
   them in. It lives here beside the group so the module names no group in its code. */
const LIB_GROUPS = [
  { id: "prewed", occ: "prewed", match: "pre[\\s_-]?wed|prewedding|engage(?!.*ring)|cưới|cuoi" },
  { id: "wedding", occ: "wedding", match: "wedding|wed\\b|hôn|marri|မင်္ဂလာ|မင်ႇၵလႃႇ" },
  { id: "engage", label: L("စေ့စပ်ပွဲ", "Engagement", "ပွႆးၶႅၵ်ႇ", "Num shalai poi", "งานหมั้น", "订婚", "Ăn hỏi", "Pertunangan", "Pertunangan"), match: "engag|hỏi|hoi\\b|betroth|ဆွေ့" },
  { id: "baby", occ: "baby", match: "baby|newborn|kid|child|bé|be\\b|ကလေး" },
  { id: "yearbook", label: L("ကျောင်းအမှတ်တရ", "Yearbook", "ပပ်ႉမၢႆတွင်းႁူင်းႁဵၼ်း", "Jawng shani laika buk", "หนังสือรุ่น", "毕业纪念册", "Kỷ yếu", "Buku tahunan", "Buku tahunan"), match: "year\\s*book|yearbook|kỷ yếu|ky yeu|school|grad|class" },
  { id: "family", occ: "family", match: "family|gia đình|gia dinh|မိသားစု" },
  { id: "standee", label: L("Standee", "Standee", "Standee", "Standee", "สแตนดี้", "展架", "Standee", "Standee", "Standee"), match: "standee|stand[\\s_-]?ee|banner|welcome|poster" }
];

/* the library's limits and the words the PSD reader matches a layer's name against */
const LIB = {
  max: 400,                    /* templates the library keeps */
  preview: 1600,               /* px on the long edge of a template's flattened background */
  thumb: 320,                  /* px on the long edge of its tile */
  maxPhotos: 8,                /* frames one imported template may hold (a page laid from one may take eight) */
  fileMax: 400 * 1024 * 1024,  /* bytes: a .psd past this is refused with its size named */
  photoWords: ["photo", "ảnh", "anh", "khung", "frame", "img", "image", "pic", "hình", "hinh", "placeholder", "mask", "foto", "ပုံ"],
  textWords: ["text", "chữ", "chu", "title", "name", "tên", "ten", "date", "ngày", "ngay", "caption", "စာ"]
};

module.exports = { STANDEE_SIZES, STANDEE_GROUP, STANDEE_WORDS, STANDEES, MARKS, TEXT_STYLES, LIB_GROUPS, LIB };
