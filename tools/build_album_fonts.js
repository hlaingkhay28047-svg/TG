#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   tools/build_album_fonts.js — the Album page's type, and the record of it.

   WHY A FONT PIPELINE AT ALL. Wave A gave the Album page seven text roles and
   drew every one of them in Georgia — one face, at one weight, for a title, a
   couple's names and a page number alike. A photo book is a typographic object
   before it is anything else, and a studio that hands a student one serif has
   not given them an album; it has given them a caption.

   WHAT SHIPS. Twenty families, every one of them SIL Open Font Licence 1.1, as
   woff2 under docs/app/lib/fonts/ — the exact binaries Google's own pipeline
   subsets and serves, taken from the @fontsource packages rather than re-cut
   here, so the bytes a student downloads are bytes an upstream project signed
   off. Each family ships the subsets it is FOR and no others: a Latin display
   face ships `latin`, Padauk ships `latin` + `myanmar`, Noto Serif Myanmar
   ships `myanmar` alone. Forty-two files, ~0.9 MB in total, and a browser
   fetches exactly the ones a picked family and a typed sentence need, because
   every face carries its upstream unicode-range.

   THE MYANMAR RULE, which is the whole reason the four regional families are
   in the list. This studio's students write in Burmese, Shan and Mon, and a
   Latin display face has no Burmese glyphs at all. So every family's stack
   ends in the families that do: a title set in Playfair Display renders its
   Latin in Playfair and its Burmese in Padauk, on one line, at one size, with
   no student ever asked to know that. `fb` below is that chain, per family.

   WHAT THIS FILE IS THE SOURCE OF. FAMILIES and PAIRS are read by
   tools/build_album_data.js, which folds them into window.HNK_ALBUM — so the
   app's font list and the files on disk can never disagree without this file
   changing. The generated record (tools/album-fonts.json) carries each file's
   subset, weight, byte count and SHA-256, and docs/app/lib/fonts/OFL.md
   carries each family's licence, attribution, upstream and version, which is
   what the OFL asks of anyone who redistributes a face.

   TWO MODES:
     node tools/build_album_fonts.js --from <dir>   copy + record + write OFL.md
         <dir> is a node_modules/@fontsource tree holding the packages below.
     node tools/build_album_fonts.js                VERIFY — every recorded file
         is on disk with the recorded size and hash. This is the mode CI and
         test/verify_album_fonts.js run; it needs no network and no npm.
   --------------------------------------------------------------------------- */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "app", "lib", "fonts");
const RECORD = path.join(ROOT, "tools", "album-fonts.json");
const OFL_MD = path.join(OUT_DIR, "OFL.md");
/* THE LICENCE ITSELF, not a link to it. OFL 1.1 clause 2 says every copy of the
   Font Software must be distributed WITH this licence; a URL in a markdown file is
   attribution, not the licence. Every upstream package ships the same body after its
   own copyright line, so the text is lifted verbatim from one of them (they are
   compared to each other on every build — see build()). */
const OFL_TXT = path.join(OUT_DIR, "OFL-1.1.txt");
const OFL_HEAD = "SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007";

/* ---------------------------------------------------------------------------
   THE TWENTY. `kind` is what the face is for and what the picker groups by;
   `script` is the writing system it was cut for; `fb` is the fallback chain
   after it, by id, and it is authored rather than derived because the right
   answer differs per face: a Burmese serif wants a Latin serif behind it, not
   a Latin sans, and Padauk must not list itself.
   --------------------------------------------------------------------------- */
const FAMILIES = [
  { id: "playfair",    pkg: "playfair-display",   kind: "serif",   script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "cormorant",   pkg: "cormorant-garamond", kind: "serif",   script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "cinzel",      pkg: "cinzel",             kind: "display", script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "baskerville", pkg: "libre-baskerville",  kind: "serif",   script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "garamond",    pkg: "eb-garamond",        kind: "serif",   script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "lora",        pkg: "lora",               kind: "serif",   script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "marcellus",   pkg: "marcellus",          kind: "display", script: "latin", subsets: ["latin"], weights: [400],      fb: ["padauk", "notothai"] },
  { id: "italiana",    pkg: "italiana",           kind: "display", script: "latin", subsets: ["latin"], weights: [400],      fb: ["padauk", "notothai"] },
  { id: "greatvibes",  pkg: "great-vibes",        kind: "script",  script: "latin", subsets: ["latin"], weights: [400],      fb: ["padauk", "notothai"] },
  { id: "parisienne",  pkg: "parisienne",         kind: "script",  script: "latin", subsets: ["latin"], weights: [400],      fb: ["padauk", "notothai"] },
  { id: "montserrat",  pkg: "montserrat",         kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "raleway",     pkg: "raleway",            kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "lato",        pkg: "lato",               kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "jost",        pkg: "jost",               kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "josefin",     pkg: "josefin-sans",       kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "inter",       pkg: "inter",              kind: "sans",    script: "latin", subsets: ["latin"], weights: [400, 700], fb: ["padauk", "notothai"] },
  /* the regional four. notomy and padauk carry their own Latin, so nothing is
     listed in front of it; notoserifmy is Burmese only and borrows EB Garamond
     for the Latin a date or a surname brings with it. */
  { id: "notomy",      pkg: "noto-sans-myanmar",  kind: "sans",    script: "my",    subsets: ["latin", "myanmar"], weights: [400, 700], fb: ["padauk", "notothai"] },
  { id: "notoserifmy", pkg: "noto-serif-myanmar", kind: "serif",   script: "my",    subsets: ["myanmar"],          weights: [400, 700], fb: ["garamond", "padauk", "notothai"] },
  { id: "padauk",      pkg: "padauk",             kind: "sans",    script: "my",    subsets: ["latin", "myanmar"], weights: [400, 700], fb: ["notothai"] },
  { id: "notothai",    pkg: "noto-sans-thai",     kind: "sans",    script: "th",    subsets: ["latin", "thai"],    weights: [400, 700], fb: ["padauk"] }
];

/* the generic the browser is left with when no shipped face has the glyph */
const GENERIC = { serif: "Georgia, serif", display: "Georgia, serif", script: "cursive", sans: "\"Helvetica Neue\", Arial, sans-serif" };

/* THE CSS HANDLE, AND WHY IT IS NOT THE FONT'S NAME. A @font-face rule claims a
   font-family string for the whole document, and the web app's own UI stack already
   reads `"Segoe UI","Myanmar Text","Noto Sans Myanmar","Pyidaungsu",system-ui`. Declaring
   these faces under their true names therefore did something this wave never asked for:
   measured on a real boot, the app fetched all four Noto Sans Myanmar files before the
   Album page was even opened, and every Burmese line in the studio — Home, Setup, the
   Smart Workflow cards — silently changed the face it was set in.

   A page's print type must not repaint the rest of the app. So every face is declared
   under a prefixed handle, which is a CSS identifier local to this document and nothing
   else. It is NOT a claim of authorship and NOT a renamed font: the file is the upstream
   binary byte for byte, OFL.md and tools/album-fonts.json record each face's real family
   name, upstream package, version and attribution, and the student's own picker shows the
   real name — "Playfair Display", never the handle. */
const CSS_PREFIX = "HNK Album ";
function cssName(name) { return CSS_PREFIX + name; }

/* ---------------------------------------------------------------------------
   THE TWELVE PAIRINGS — a face for the display lines (title · subtitle · names)
   and a face for the quiet ones (date · quote · caption · page number). This is
   the control a student actually wants: not "pick two of twenty", which is a
   design decision they are not being taught here, but "pick the mood".
   --------------------------------------------------------------------------- */
const PAIRS = [
  { id: "classic",   t: "playfair",    b: "lato",       label: { my: "ဂန္ထဝင်", en: "Classic", shn: "ပိုၼ်ႉထၢၼ်", kac: "Moi ai", th: "คลาสสิก", zh: "经典", vi: "Cổ điển", id: "Klasik", ms: "Klasik" } },
  { id: "wedding",   t: "greatvibes",  b: "cormorant",  label: { my: "မင်္ဂလာ", en: "Wedding", shn: "ၵိၼ်ႇလဵင်ႉ", kac: "Hkungran", th: "งานแต่ง", zh: "婚礼", vi: "Đám cưới", id: "Pernikahan", ms: "Perkahwinan" } },
  { id: "roman",     t: "cinzel",      b: "garamond",   label: { my: "ရောမ", en: "Roman", shn: "ရူဝ်ႇမၼ်ႇ", kac: "Roman", th: "โรมัน", zh: "罗马", vi: "La Mã", id: "Romawi", ms: "Rom" } },
  { id: "editorial", t: "baskerville", b: "inter",      label: { my: "မဂ္ဂဇင်း", en: "Editorial", shn: "မႅၵ်ႇၸိၼ်း", kac: "Laika buk", th: "นิตยสาร", zh: "杂志", vi: "Tạp chí", id: "Majalah", ms: "Majalah" } },
  { id: "modern",    t: "montserrat",  b: "lato",       label: { my: "ခေတ်မီ", en: "Modern", shn: "ၵေႃႇမႂ်ႇ", kac: "Nambat nnan", th: "สมัยใหม่", zh: "现代", vi: "Hiện đại", id: "Modern", ms: "Moden" } },
  { id: "soft",      t: "parisienne",  b: "raleway",    label: { my: "နူးညံ့", en: "Soft", shn: "ဢွၼ်ႇဢွၼ်ႇ", kac: "Hpraw nem", th: "นุ่มนวล", zh: "柔和", vi: "Nhẹ nhàng", id: "Lembut", ms: "Lembut" } },
  { id: "fashion",   t: "italiana",    b: "jost",       label: { my: "ဖက်ရှင်", en: "Fashion", shn: "ၾႅတ်ႊသျိၼ်ႊ", kac: "Fashion", th: "แฟชั่น", zh: "时尚", vi: "Thời trang", id: "Mode", ms: "Fesyen" } },
  { id: "heritage",  t: "marcellus",   b: "garamond",   label: { my: "အမွေအနှစ်", en: "Heritage", shn: "ၶူဝ်းၵဝ်ႇ", kac: "Sut gan", th: "มรดก", zh: "传承", vi: "Di sản", id: "Warisan", ms: "Warisan" } },
  { id: "deco",      t: "josefin",     b: "lora",       label: { my: "ဒက်ကို", en: "Deco", shn: "တႅၵ်ႇၶူဝ်ႇ", kac: "Deco", th: "เดโค", zh: "装饰", vi: "Deco", id: "Deko", ms: "Deko" } },
  { id: "quiet",     t: "lora",        b: "raleway",    label: { my: "ငြိမ်သက်", en: "Quiet book", shn: "ယဵၼ်ယဵၼ်", kac: "Zim ai", th: "เรียบง่าย", zh: "静谧", vi: "Tĩnh lặng", id: "Tenang", ms: "Tenang" } },
  { id: "myclean",   t: "notomy",      b: "padauk",     label: { my: "မြန်မာ သန့်", en: "Myanmar clean", shn: "မၢၼ်ႈ သႂ်", kac: "Myen san", th: "พม่าเรียบ", zh: "缅文清爽", vi: "Miến sạch", id: "Myanmar bersih", ms: "Myanmar bersih" } },
  { id: "myserif",   t: "notoserifmy", b: "notomy",     label: { my: "မြန်မာ ဆရစ်", en: "Myanmar serif", shn: "မၢၼ်ႈ သႄႇရိတ်ႉ", kac: "Myen serif", th: "พม่าเซอริฟ", zh: "缅文衬线", vi: "Miến serif", id: "Myanmar serif", ms: "Myanmar serif" } }
];

/* which side of a pairing each text role is set in */
const ROLE_SIDE = { title: "t", subtitle: "t", names: "t", date: "b", quote: "b", caption: "b", folio: "b" };

/* ---- helpers -------------------------------------------------------------- */
function famById(id) { return FAMILIES.filter(f => f.id === id)[0] || null; }
function outName(fam, subset, weight) { return fam.id + "-" + subset + "-" + weight + ".woff2"; }
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/* the CSS font-family list a canvas or a DOM node is given for this family */
function stackOf(fam) {
  const names = [cssName(fam.name || fam.id)];
  (fam.fb || []).forEach(id => { const o = famById(id); if (o && o.name) names.push(cssName(o.name)); });
  return names.map(n => '"' + n + '"').join(", ") + ", " + (GENERIC[fam.kind] || GENERIC.sans);
}

/* ---- build (--from) ------------------------------------------------------- */
function build(from) {
  if (!from || !fs.existsSync(from)) throw new Error("--from must name a node_modules/@fontsource directory that exists: " + from);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  /* THE RANGE POOL, and why it is not one range per subset name. The first cut
     of this file assumed "myanmar" meant one unicode-range and refused to build
     when two packages disagreed — which was the right refusal and the wrong
     model. A subset's range is the intersection of Google's subset definition
     with THAT FACE'S OWN COVERAGE, so Padauk's `myanmar` and Noto Serif
     Myanmar's `myanmar` are genuinely different sets and a face must be
     declared with its own. The pool keys by the range STRING, so identical
     ranges still cost one entry and every face points at the truth. */
  const ranges = {};
  const byText = {};
  let rn = 0;
  function rangeId(text) {
    if (byText[text]) return byText[text];
    const id = "u" + (++rn);
    byText[text] = id; ranges[id] = text;
    return id;
  }
  const fams = [];
  FAMILIES.forEach(fam => {
    const pkg = path.join(from, fam.pkg);
    if (!fs.existsSync(pkg)) throw new Error(fam.id + ": @fontsource/" + fam.pkg + " is not in " + from);
    const meta = JSON.parse(fs.readFileSync(path.join(pkg, "metadata.json"), "utf8"));
    const uni = JSON.parse(fs.readFileSync(path.join(pkg, "unicode.json"), "utf8"));
    if (!meta.license || meta.license.type !== "OFL-1.1") throw new Error(fam.id + ": licence is " + (meta.license && meta.license.type) + ", not OFL-1.1 — this pipeline ships OFL faces only");
    const files = [];
    fam.subsets.forEach(subset => {
      if (!uni[subset]) throw new Error(fam.id + ": upstream has no " + subset + " subset");
      const rid = rangeId(uni[subset]);
      fam.weights.forEach(weight => {
        const src = path.join(pkg, "files", fam.pkg + "-" + subset + "-" + weight + "-normal.woff2");
        if (!fs.existsSync(src)) throw new Error(fam.id + ": upstream has no " + subset + " " + weight + " woff2");
        const buf = fs.readFileSync(src);
        fs.writeFileSync(path.join(OUT_DIR, outName(fam, subset, weight)), buf);
        files.push({ s: subset, w: weight, r: rid, f: outName(fam, subset, weight), bytes: buf.length, sha256: sha256(buf) });
      });
    });
    fams.push({ id: fam.id, name: meta.family, pkg: fam.pkg, kind: fam.kind, script: fam.script,
                weights: fam.weights.slice(), fb: (fam.fb || []).slice(), files: files,
                upstream: { version: meta.version, source: meta.source, license: meta.license.type, url: meta.license.url,
                            attribution: String(meta.license.attribution || "").replace(/\s+/g, " ").trim() } });
  });
  /* the licence body, lifted from the packages and checked to be one and the same */
  let body = null;
  FAMILIES.forEach(fam => {
    const lic = fs.readFileSync(path.join(from, fam.pkg, "LICENSE"), "utf8");
    const at = lic.indexOf(OFL_HEAD);
    if (at < 0) throw new Error(fam.id + ": its LICENSE does not carry the OFL 1.1 text");
    const text = lic.slice(at).replace(/\r\n/g, "\n").trim() + "\n";
    if (body === null) body = text;
    else if (body !== text) throw new Error(fam.id + ": its copy of the OFL 1.1 text differs from the others — ship them separately rather than pretending they are one");
  });
  fs.writeFileSync(OFL_TXT, body);

  const record = { v: 1, dir: "docs/app/lib/fonts", ranges: ranges, families: fams };
  fs.writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
  fs.writeFileSync(OFL_MD, oflText(record));
  return record;
}

function oflText(rec) {
  const total = rec.families.reduce((n, f) => n + f.files.reduce((m, x) => m + x.bytes, 0), 0);
  const head = [
    "# The Album page's typefaces",
    "",
    "Every face in this folder is licensed under the **SIL Open Font Licence 1.1**",
    "(<https://openfontlicense.org>). They are redistributed here unmodified, as the",
    "woff2 subsets the upstream @fontsource packages publish, and this file is the",
    "attribution the licence asks for. None of them is sold, and none of them is",
    "the HNK Create Studio brand — a student picks one for their own album page.",
    "",
    "Regenerate with `node tools/build_album_fonts.js --from <node_modules/@fontsource>`;",
    "verify what is on disk with `node tools/build_album_fonts.js`. The machine-readable",
    "record — every file's subset, weight, byte count and SHA-256 — is `tools/album-fonts.json`.",
    "",
    "The licence itself travels with the fonts, as clause 2 requires: **[OFL-1.1.txt](OFL-1.1.txt)**,",
    "lifted verbatim from the upstream packages (the build refuses if their copies differ).",
    "",
    "" + rec.families.length + " families · " + rec.families.reduce((n, f) => n + f.files.length, 0) + " files · " + total + " bytes",
    ""
  ];
  rec.families.forEach(f => {
    head.push("## " + f.name);
    head.push("");
    head.push("- id `" + f.id + "` · " + f.kind + " · " + f.script + " · weights " + f.weights.join(", "));
    head.push("- declared in the app under the CSS handle `" + CSS_PREFIX + f.name + "` — a document-local identifier that keeps the Album page's type off the rest of the studio's UI. The file is the upstream binary unmodified; the family's real name is **" + f.name + "**, which is what the student's own picker shows.");
    head.push("- upstream: `@fontsource/" + f.pkg + "` " + f.upstream.version + " from " + f.upstream.source);
    head.push("- licence: " + f.upstream.license + " — " + f.upstream.url);
    head.push("- " + f.upstream.attribution);
    head.push("- files: " + f.files.map(x => "`" + x.f + "` (" + x.bytes + " B)").join(", "));
    head.push("");
  });
  return head.join("\n");
}

/* ---- verify (no arguments) ------------------------------------------------ */
function verify() {
  if (!fs.existsSync(RECORD)) return { ok: false, problems: ["tools/album-fonts.json is missing — run with --from"] };
  const rec = JSON.parse(fs.readFileSync(RECORD, "utf8"));
  const problems = [];
  const seen = {};
  if (rec.families.length !== FAMILIES.length) problems.push("the record holds " + rec.families.length + " families, the table names " + FAMILIES.length);
  FAMILIES.forEach(fam => {
    const r = rec.families.filter(x => x.id === fam.id)[0];
    if (!r) { problems.push(fam.id + ": not in the record"); return; }
    if (r.upstream.license !== "OFL-1.1") problems.push(fam.id + ": recorded licence is " + r.upstream.license);
    const want = [];
    fam.subsets.forEach(s => fam.weights.forEach(w => want.push(outName(fam, s, w))));
    want.forEach(name => {
      const row = r.files.filter(x => x.f === name)[0];
      if (!row) { problems.push(fam.id + ": " + name + " is not in the record"); return; }
      seen[name] = 1;
      const p = path.join(OUT_DIR, name);
      if (!fs.existsSync(p)) { problems.push(name + ": recorded but not on disk"); return; }
      const buf = fs.readFileSync(p);
      if (buf.length !== row.bytes) problems.push(name + ": " + buf.length + " bytes on disk, " + row.bytes + " recorded");
      else if (sha256(buf) !== row.sha256) problems.push(name + ": the bytes on disk are not the bytes recorded");
      if (buf.slice(0, 4).toString("latin1") !== "wOF2") problems.push(name + ": not a woff2 file");
    });
    r.files.forEach(row => { if (!row.r || !rec.ranges[row.r]) problems.push(row.f + ": its unicode-range is not in the record"); });
  });
  /* nothing may sit in the folder that the table does not name — a stray face is
     a face nobody checked the licence of */
  fs.readdirSync(OUT_DIR).filter(n => /\.woff2$/.test(n)).forEach(n => { if (!seen[n]) problems.push(n + ": on disk but the table does not name it"); });
  if (!fs.existsSync(OFL_MD)) problems.push("docs/app/lib/fonts/OFL.md is missing — the licence record must ship with the faces");
  if (!fs.existsSync(OFL_TXT)) problems.push("docs/app/lib/fonts/OFL-1.1.txt is missing — OFL 1.1 clause 2 requires the licence itself to travel with the fonts");
  else if (fs.readFileSync(OFL_TXT, "utf8").indexOf(OFL_HEAD) !== 0) problems.push("docs/app/lib/fonts/OFL-1.1.txt is not the OFL 1.1 text");
  return { ok: problems.length === 0, problems: problems, record: rec };
}

/* the table the album data file folds in, built from the record so the app can
   never list a family whose bytes are not on disk */
function dataTables() {
  const v = verify();
  if (!v.ok) throw new Error("album fonts: " + v.problems.join("; "));
  const rec = v.record;
  const byId = {};
  rec.families.forEach(f => { byId[f.id] = f; });
  const fonts = FAMILIES.map(fam => {
    const r = byId[fam.id];
    const withName = Object.assign({}, fam, { name: r.name });
    return { id: fam.id, name: r.name, css: cssName(r.name), kind: fam.kind, script: fam.script, w: fam.weights.slice(),
             fb: (fam.fb || []).slice(),
             stack: stackOf(Object.assign({}, withName)),
             files: r.files.map(x => ({ s: x.s, w: x.w, r: x.r, f: x.f })) };
  });
  return { fonts: fonts, pairs: PAIRS.map(p => ({ id: p.id, t: p.t, b: p.b, label: p.label })),
           ranges: rec.ranges, roleSide: ROLE_SIDE };
}

/* stackOf needs every family to know its own name before any stack is built */
(function nameThem() {
  if (!fs.existsSync(RECORD)) return;
  try {
    const rec = JSON.parse(fs.readFileSync(RECORD, "utf8"));
    rec.families.forEach(r => { const f = famById(r.id); if (f) f.name = r.name; });
  } catch (e) { /* the record is rebuilt by --from; verify() reports it missing */ }
})();

module.exports = { FAMILIES, PAIRS, ROLE_SIDE, GENERIC, CSS_PREFIX, cssName, OFL_TXT, OFL_HEAD, build, verify, dataTables, stackOf, famById, outName, OUT_DIR, RECORD };

if (require.main === module) {
  const i = process.argv.indexOf("--from");
  if (i > 0) {
    const rec = build(process.argv[i + 1]);
    const files = rec.families.reduce((n, f) => n + f.files.length, 0);
    const bytes = rec.families.reduce((n, f) => n + f.files.reduce((m, x) => m + x.bytes, 0), 0);
    console.log("build_album_fonts: " + rec.families.length + " families, " + files + " files, " + bytes + " bytes — wrote docs/app/lib/fonts/ + tools/album-fonts.json + OFL.md");
  } else {
    const v = verify();
    if (!v.ok) { v.problems.forEach(p => console.log("FAIL — " + p)); process.exit(1); }
    const files = v.record.families.reduce((n, f) => n + f.files.length, 0);
    console.log("build_album_fonts: verified " + v.record.families.length + " families, " + files + " files — every byte matches the record");
  }
}
