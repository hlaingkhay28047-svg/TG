/* verify_album_fonts.js — 6.104.0 / panel 6.175.0
   ALBUM PAGES, WAVE B: THE TYPE.

   The owner, after wave A shipped: "ဒီထက်ပိုကောင်းပိုစုံတာရှိရင် အသေးစိတ်ရှာပြီး ထပ်
   update upgrade ပေးပါ".

   WHAT WAVE A LEFT UNDONE. It gave the Album page seven text roles — title, subtitle,
   names, date, quote, caption, page number — and drew every one of them in Georgia,
   at one weight, in near-black. A photo book is a typographic object before it is
   anything else, so that is not seven roles; it is one caption repeated seven times.

   WHAT THIS WAVE SHIPS, and what this file is the teeth of:

     1. TWENTY FAMILIES, every one SIL Open Font Licence 1.1, as the upstream woff2
        subsets under docs/app/lib/fonts/ — 42 files, ~0.93 MB, each recorded in
        tools/album-fonts.json with its subset, weight, byte count and SHA-256, and
        each attributed in docs/app/lib/fonts/OFL.md, which is what the licence asks
        of anyone who redistributes a face. Section A re-runs the verifier: if a file
        on disk is not the file that was recorded, this test is red.

     2. TWELVE PAIRINGS over them, because "pick two of twenty" is a design decision
        the student is not being taught here and "pick the mood" is one they can make.

     3. THE BURMESE RULE. A Latin display face has no Burmese glyphs, and this
        studio's students write in Burmese, Shan and Mon. Every family's stack ends
        at a family that can set them, so "Ko Ko & Ma Ma · မင်္ဂလာပါ" comes out with
        the Latin in Playfair Display and the Burmese in Padauk, on one line, at one
        size. C4 proves the two faces really both load for that one line.

   TWO THINGS THIS FILE EXISTS TO STOP FROM COMING BACK, both found by measuring
   rather than by reading:

     THE APP-WIDE REPAINT. The web app's own UI stack already reads
     `"Segoe UI","Myanmar Text","Noto Sans Myanmar","Pyidaungsu",system-ui`. Declaring
     these faces under their true family names therefore fetched all four Noto Sans
     Myanmar files before the Album page had even been opened, and quietly re-set every
     Burmese line in the studio. Each face is now declared under a document-local CSS
     handle ("HNK Album Playfair Display"), which is a handle and not a rename: the
     binary is upstream's byte for byte, the real name is recorded and is what the
     student's picker shows. C1 measures that opening the app fetches no face at all.

     THE FALLBACKS FETCHED FOR NOTHING. document.fonts.load() over a whole stack loads
     every family in it that can render the text, so an all-Latin title pulled Padauk's
     and Noto Sans Thai's Latin subsets too. The loader now asks for the picked family
     always and a fallback only when the line really carries that script. C2 measures it.

   AND ONE DEFECT OF WAVE A'S OWN, fixed here: typing in the TEXT card called
   onDocChange(), which empties #albRoot and rebuilds every card — so each keystroke
   replaced the very input being typed into and the caret went with it. C5 types a
   whole sentence and insists the focus is still in the field at the end.

   Usage: node test/verify_album_fonts.js   (serve docs/app on PORT, default 8931) */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const SW = read("docs/app/sw.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const FONTS = require(path.join(ROOT, "tools", "build_album_fonts.js"));
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALBUM = A.readAlbum();
const RECORD = JSON.parse(read("tools/album-fonts.json"));
const OFL = read("docs/app/lib/fonts/OFL.md");

const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}

/* ===================== A) the faces, and the record of them ===================== */
function faces() {
  const v = FONTS.verify();
  report("A1) every one of the forty-two woff2 files on disk is the file the record names — same byte count, same SHA-256, a real wOF2 header, and nothing in the folder the table does not name",
    v.ok, v.problems);

  const fams = RECORD.families;
  const files = fams.reduce((n, f) => n + f.files.length, 0);
  const bytes = fams.reduce((n, f) => n + f.files.reduce((m, x) => m + x.bytes, 0), 0);
  report("A2) twenty families · forty-two files · under 1.2 MB in total, which is what makes it safe to serve them from /lib/ where nothing is ever revalidated",
    fams.length === 20 && files === 42 && bytes > 700000 && bytes < 1200000,
    { families: fams.length, files, bytes });

  report("A3) every family is OFL-1.1 and carries its upstream package, version and attribution — the licence's own condition for redistributing a face",
    fams.every(f => f.upstream.license === "OFL-1.1" && /^v?\d/.test(String(f.upstream.version)) &&
      String(f.upstream.attribution).length > 20 && /github\.com/.test(String(f.upstream.source))),
    fams.filter(f => f.upstream.license !== "OFL-1.1" || !f.upstream.attribution).map(f => f.id));

  report("A4) docs/app/lib/fonts/OFL.md ships beside them and names every family, its real name, its handle and its files",
    /SIL Open Font Licence 1\.1/.test(OFL) &&
    fams.every(f => OFL.indexOf("## " + f.name) >= 0 && OFL.indexOf(FONTS.CSS_PREFIX + f.name) >= 0 &&
                    f.files.every(x => OFL.indexOf(x.f) >= 0)),
    fams.filter(f => OFL.indexOf("## " + f.name) < 0).map(f => f.id));

  /* clause 2 of the licence, not a link to the licence */
  const oflTxt = fs.existsSync(FONTS.OFL_TXT) ? fs.readFileSync(FONTS.OFL_TXT, "utf8") : "";
  report("A5) the OFL 1.1 text itself travels with the fonts — clause 2 asks for the licence, and a URL in a markdown file is attribution rather than the licence",
    oflTxt.indexOf(FONTS.OFL_HEAD) === 0 && /PERMISSION & CONDITIONS/.test(oflTxt) &&
    /TERMINATION/.test(oflTxt) && oflTxt.length > 3500 && /OFL-1\.1\.txt/.test(OFL),
    { bytes: oflTxt.length });

  /* the pipeline must refuse a face nobody checked the licence of */
  const stray = path.join(FONTS.OUT_DIR, "__stray-test.woff2");
  let refused = false, said = "";
  try {
    fs.writeFileSync(stray, Buffer.from("wOF2not-a-font"));
    const r = FONTS.verify();
    refused = !r.ok; said = (r.problems || []).join(" ");
  } finally { try { fs.unlinkSync(stray); } catch (e) {} }
  report("A6) fault injection — an unrecorded woff2 dropped into the folder makes the verifier red, because a face nobody checked the licence of must never ship silently",
    refused && /__stray-test/.test(said), { refused, said: said.slice(0, 200) });

  /* and a changed byte must not pass */
  const first = RECORD.families[0].files[0];
  const p = path.join(FONTS.OUT_DIR, first.f);
  const keep = fs.readFileSync(p);
  let caught = false, why = "";
  try {
    const bad = Buffer.from(keep); bad[bad.length - 1] = bad[bad.length - 1] ^ 0xff;
    fs.writeFileSync(p, bad);
    const r = FONTS.verify();
    caught = !r.ok; why = (r.problems || []).join(" ");
  } finally { fs.writeFileSync(p, keep); }
  report("A7) fault injection — one flipped byte in one face is caught by its SHA-256, so the record is a real record and not a filename list",
    caught && new RegExp(first.f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(why), { caught, why: why.slice(0, 200) });

  report("A8) the verifier needs no network and no npm — it reads the folder and the record, which is what lets CI run it on a clean checkout",
    /function verify\(\)/.test(read("tools/build_album_fonts.js")) &&
    !/require\(["']https?/.test(read("tools/build_album_fonts.js")) &&
    /--from/.test(read("tools/build_album_fonts.js")), null);
}

/* ===================== B) the table the app reads ===================== */
function tables() {
  const F = ALBUM.fonts, P = ALBUM.pairs;
  report("B1) window.HNK_ALBUM carries the type: twenty fonts, twelve pairings, the unicode-ranges, the role→side map, the folder and a default pairing that exists",
    F && F.length === 20 && P && P.length === 12 && ALBUM.ranges && Object.keys(ALBUM.ranges).length >= 3 &&
    ALBUM.roleSide && ALBUM.fontDir === "lib/fonts/" && P.some(p => p.id === ALBUM.defPair),
    { fonts: F && F.length, pairs: P && P.length, ranges: ALBUM.ranges && Object.keys(ALBUM.ranges).length, defPair: ALBUM.defPair });

  report("B2) every font names a real family, a document-local CSS handle that carries that real name, at least one file, and a weight 400 the renderer never has to synthesise",
    F.every(f => f.name && f.css === FONTS.CSS_PREFIX + f.name && f.files.length > 0 && f.w.indexOf(400) >= 0 &&
      f.files.every(x => ALBUM.ranges[x.r] && f.w.indexOf(x.w) >= 0)),
    F.filter(f => f.css !== FONTS.CSS_PREFIX + f.name).map(f => f.id));

  report("B3) every font's file list is exactly the files the record holds for it, so the app can never offer a family whose bytes are not on disk",
    F.every(f => {
      const r = RECORD.families.filter(x => x.id === f.id)[0];
      return r && r.files.length === f.files.length && f.files.every(x => r.files.some(y => y.f === x.f && y.w === x.w && y.s === x.s));
    }), null);

  report("B4) THE BURMESE RULE — every Latin family's stack falls through to a family that can set Burmese, and no family falls back to itself",
    F.every(f => f.script === "my" || (f.fb || []).some(id => (F.filter(o => o.id === id)[0] || {}).script === "my")) &&
    F.every(f => (f.fb || []).indexOf(f.id) < 0) &&
    F.filter(f => f.script === "my").length >= 3,
    F.filter(f => f.script !== "my" && !(f.fb || []).some(id => (F.filter(o => o.id === id)[0] || {}).script === "my")).map(f => f.id));

  report("B5) every stack opens with its own handle and then names only handles this studio ships, before the device's own generic",
    F.every(f => f.stack.indexOf('"' + f.css + '"') === 0 &&
      (f.stack.match(/"HNK Album [^"]+"/g) || []).every(q => F.some(o => '"' + o.css + '"' === q))), null);

  report("B6) the twelve pairings name real fonts on both sides, are labelled in all nine languages, and at least two of them set Burmese in BOTH faces — the students write in it",
    P.every(p => F.some(f => f.id === p.t) && F.some(f => f.id === p.b) && LANGS.every(l => typeof p.label[l] === "string" && p.label[l])) &&
    P.filter(p => (F.filter(f => f.id === p.t)[0] || {}).script === "my" && (F.filter(f => f.id === p.b)[0] || {}).script === "my").length >= 2,
    P.filter(p => !LANGS.every(l => p.label[l])).map(p => p.id));

  report("B7) every one of the seven text roles knows which side of a pairing it is set in, and the map names nothing that is not a role",
    ALBUM.roles.every(r => ALBUM.roleSide[r.id] === "t" || ALBUM.roleSide[r.id] === "b") &&
    Object.keys(ALBUM.roleSide).every(k => ALBUM.roles.some(r => r.id === k)) &&
    Object.keys(ALBUM.roleSide).length === 7,
    ALBUM.roles.filter(r => !ALBUM.roleSide[r.id]).map(r => r.id));

  /* the generator refuses a broken table rather than shipping one */
  let threw = "";
  try {
    const gen = require(path.join(ROOT, "tools", "build_album_data.js"));
    const keep = gen.DATA.pairs[0].t;
    gen.DATA.pairs[0].t = "no-such-font";
    try { gen.build({ dry: true }); } catch (e) { threw = String(e.message); }
    gen.DATA.pairs[0].t = keep;
    gen.build({ dry: true });                       /* and it builds again once repaired */
  } catch (e) { threw = threw || ("harness: " + e.message); }
  report("B8) fault injection — a pairing that names a font this studio does not ship stops the generator, so a blank line on a printed page cannot reach data/album.js",
    /no-such-font/.test(threw), { threw: threw.slice(0, 200) });

  report("B9) the nine new strings are in the app's two tables in all nine languages, each key at the start of its own line",
    ["alb_pair", "alb_pair_note", "alb_font", "alb_font_auto", "alb_font_count", "alb_ink", "alb_font_my", "alb_font_busy", "alb_font_fail"]
      .every(k => (APP.match(new RegExp("[\\n,{]\\s*" + k + ":\\{", "g")) || []).length === 2), null);

  const TRL = A.readTrl();
  const readers = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
  const KEYS = ["alb_pair", "alb_pair_note", "alb_font", "alb_font_auto", "alb_font_count", "alb_ink", "alb_font_my", "alb_font_busy", "alb_font_fail"];
  report("B10) the fifteen packs with a reader carry all nine, with {N} and {P} intact where the English has them",
    readers.every(c => KEYS.every(k => typeof TRL[c][k] === "string" && TRL[c][k])) &&
    readers.every(c => /\{N\}/.test(TRL[c].alb_font_count) && /\{P\}/.test(TRL[c].alb_font_count)),
    readers.filter(c => !KEYS.every(k => TRL[c][k])));

  report("B11) the three Tai packs are registered in sweep_v477's PENDING with the reason written down, rather than filled with Shan text a Tai Le reader cannot read",
    /V61040_KEYS/.test(read("test/sweep_v477_upgrades.js")) &&
    /* the row may name later waves after it — 6.105.0 appends V61050_KEYS — so this
       matches the entry rather than the end of the list, which every wave moves */
    (read("test/sweep_v477_upgrades.js").match(/\.\.\.V61040_KEYS[,\]]/g) || []).length === 3, null);
}

/* ===================== C) the page, in a browser ===================== */
async function browserWalk() {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  const errs = [];
  const got = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  page.on("request", r => { if (/\/lib\/fonts\//.test(r.url())) got.push(r.url().split("/").pop()); });

  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  /* C1 — the app's own UI is untouched. This is the regression that sent the whole
     wave back to the drawing board: with the true family names declared, booting the
     app fetched four Noto Sans Myanmar files and re-set every Burmese line in it. */
  const atBoot = got.slice();
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(1000);
  const onOpen = got.slice();
  report("C1) booting the studio and opening the Album page fetches NO typeface at all — the album's type is declared under handles nothing else in the app names, so no other page changes the face it is set in",
    atBoot.length === 0 && onOpen.length === 0, { atBoot, onOpen });

  const opened = await page.evaluate(() => {
    const st = document.getElementById("albFontFaces");
    return {
      faces: st ? (st.textContent.match(/@font-face/g) || []).length : -1,
      handles: st ? /font-family:"HNK Album /.test(st.textContent) : false,
      ranges: st ? (st.textContent.match(/unicode-range:/g) || []).length : -1,
      swap: st ? (st.textContent.match(/font-display:swap/g) || []).length : -1,
      pairChips: document.querySelectorAll("#albPairs .chip").length,
      onChips: document.querySelectorAll("#albPairs .chip.on").length,
      selects: document.querySelectorAll(".alb-fontsel").length,
      opts: (document.getElementById("albFont_title") || { options: [] }).options.length,
      firstOpt: ((document.getElementById("albFont_title") || { options: [] }).options[1] || {}).textContent || "",
      inks: document.querySelectorAll(".alb-ink").length,
      note: (document.getElementById("albPairNote") || {}).textContent || ""
    };
  });
  report("C2) the TEXT card opens with the twelve pairings (one of them on), a face picker per role carrying Auto plus all twenty under their REAL names, six inks per role, and a line that states the counts",
    opened.faces === 42 && opened.handles && opened.ranges === 42 && opened.swap === 42 &&
    opened.pairChips === 12 && opened.onChips === 1 && opened.selects === 7 &&
    opened.opts === 21 && /^[A-Z]/.test(opened.firstOpt) && !/HNK Album/.test(opened.firstOpt) &&
    opened.inks === 42 && /20/.test(opened.note) && /12/.test(opened.note), opened);

  /* a photo, so the stage has something to draw the words over */
  await page.evaluate(async () => {
    const cv = document.createElement("canvas"); cv.width = 600; cv.height = 900;
    const x = cv.getContext("2d"); x.fillStyle = "#2a4a6a"; x.fillRect(0, 0, 600, 900);
    await ALBUM.accept([cv.toDataURL("image/jpeg", 0.9)]);
    await new Promise(r => setTimeout(r, 500));
  });

  /* C3 — an all-Latin title pulls ONE face. */
  const latin = await page.evaluate(async () => {
    const inp = document.getElementById("albText_title");
    inp.focus(); inp.value = "Ko Ko and Ma Ma";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1000));
    return { text: (ALBUM.doc().pages[0].texts[0] || {}).text, focus: document.activeElement && document.activeElement.id };
  });
  const afterLatin = got.slice();
  report("C3) an all-Latin title fetches the picked family and nothing else — the fallbacks are not downloaded for a line that will never need them",
    afterLatin.length === 1 && /^playfair-latin-700/.test(afterLatin[0]) && latin.text === "Ko Ko and Ma Ma",
    { afterLatin, latin });

  /* C4 — THE BURMESE RULE, on one line. */
  const mixed = await page.evaluate(async () => {
    const inp = document.getElementById("albText_title");
    inp.focus(); inp.value = "Ko Ko and Ma Ma မင်္ဂလာပါ";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1400));
    const loaded = [];
    document.fonts.forEach(f => { if (f.status === "loaded") loaded.push(f.family); });
    return { loaded: [...new Set(loaded)] };
  });
  const afterMixed = got.slice();
  report("C4) THE BURMESE RULE — one title in Latin and Burmese loads the Latin display face AND a Burmese face, so the line is set in both rather than printed with empty boxes",
    mixed.loaded.indexOf("HNK Album Playfair Display") >= 0 &&
    mixed.loaded.some(n => /Padauk|Noto Sans Myanmar|Noto Serif Myanmar/.test(n)) &&
    afterMixed.some(f => /^padauk-myanmar/.test(f)) &&
    !afterMixed.some(f => /^notothai/.test(f)),
    { loaded: mixed.loaded, afterMixed });

  /* C5 — WAVE A'S OWN DEFECT: typing rebuilt the card and took the caret with it. */
  const typing = await page.evaluate(async () => {
    const inp = document.getElementById("albText_names");
    inp.focus();
    const before = document.activeElement === inp;
    for (const ch of "Ma Ma") { inp.value += ch; inp.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 30)); }
    await new Promise(r => setTimeout(r, 400));
    const el = document.getElementById("albText_names");
    return { before, sameNode: el === inp, focused: document.activeElement === el,
             value: el.value, stored: (ALBUM.doc().pages[0].texts.filter(t => t.role === "names")[0] || {}).text };
  });
  report("C5) typing a name keeps the caret in the field — the words redraw the canvas and nothing in the page is rebuilt, which is what wave A got wrong (every keystroke replaced the input being typed into)",
    typing.before && typing.sameNode && typing.focused && typing.value === "Ma Ma" && typing.stored === "Ma Ma", typing);

  /* C6 — the pairing really changes what is drawn, and the per-line override beats it. */
  const swap = await page.evaluate(async () => {
    function snap() {
      const c = document.getElementById("albCanvas"), x = c.getContext("2d");
      const d = x.getImageData(0, 0, c.width, Math.min(c.height, 420)).data;
      let s = 0; for (let i = 0; i < d.length; i += 37) s = (s * 31 + d[i]) >>> 0;
      return s;
    }
    await new Promise(r => setTimeout(r, 700));
    const a = snap();
    const chips = [...document.querySelectorAll("#albPairs .chip")];
    chips[1].click();                                    /* the wedding script pairing */
    await new Promise(r => setTimeout(r, 1500));
    const b = snap(), pair = ALBUM.doc().pair;
    const sel = document.getElementById("albFont_title");
    sel.value = "cinzel"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    const c = snap(), own = (ALBUM.doc().pages[0].texts[0] || {}).font;
    return { a, b, c, pair, own };
  });
  report("C6) a pairing changes the page it is applied to, and a face picked for one line beats the pairing for that line only",
    swap.a !== swap.b && swap.b !== swap.c && swap.pair !== "classic" && swap.own === "cinzel", swap);

  /* C7 — the ink. A caption in black on a night portrait is a caption nobody reads. */
  const ink = await page.evaluate(async () => {
    function white() {
      const c = document.getElementById("albCanvas"), x = c.getContext("2d");
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) n++;
      return n;
    }
    const before = white();
    const b = document.querySelector('#albTextCard .alb-textrow .alb-ink[data-ink="#ffffff"]');
    b.click();
    await new Promise(r => setTimeout(r, 1200));
    const after = white();
    return { before, after, stored: (ALBUM.doc().pages[0].texts[0] || {}).color,
             on: !!document.querySelector('#albTextCard .alb-ink[data-ink="#ffffff"].on') };
  });
  report("C7) the ink is a real control — switching the title to white ink puts measurably more white on the page and is remembered on the line",
    ink.stored === "#ffffff" && ink.on && ink.after > ink.before, ink);

  /* C8 — the album survives the tab closing, with its type. */
  const kept = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 900));
    return { pair: ALBUM.doc().pair, font: (ALBUM.doc().pages[0].texts[0] || {}).font };
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(1200);
  const back = await page.evaluate(() => {
    const d = ALBUM.doc();
    return { pair: d.pair, font: (d.pages[0].texts[0] || {}).font, color: (d.pages[0].texts[0] || {}).color,
             chipOn: (document.querySelector("#albPairs .chip.on") || {}).textContent || "",
             selVal: (document.getElementById("albFont_title") || {}).value };
  });
  report("C8) the pairing, the picked face and the ink survive closing the tab — they are part of the album, not of the session",
    back.pair === kept.pair && back.font === kept.font && back.color === "#ffffff" &&
    back.selVal === kept.font && !!back.chipOn, { kept, back });

  /* C9 — a saved album from wave A still opens. Wave A stored tx.font as a CSS stack. */
  const migrated = await page.evaluate(async () => {
    ALBUM.setDoc({ v: 1, sizeId: "12x36", guides: true, cur: 0, pair: "no-such-pairing",
      pages: [{ auto: true, tplId: "", photos: [], texts: [{ role: "title", text: "Wave A", font: "Georgia, serif", color: "rgb(1,2,3)" }] }] });
    await new Promise(r => setTimeout(r, 900));
    const d = ALBUM.doc(), t = d.pages[0].texts[0];
    return { pair: d.pair, font: t.font, color: t.color, text: t.text };
  });
  report("C9) an album saved by wave A opens with better type rather than a broken page — a stack string is not a font id, an unknown pairing falls back to the default, and a colour that is not a hex is refused",
    migrated.pair === ALBUM.defPair && migrated.font === "" && migrated.color === "#1b1b1f" && migrated.text === "Wave A", migrated);

  report("C10) nothing threw anywhere in the walk",
    errs.length === 0, errs);

  await browser.close();
}

/* ===================== D) the release ===================== */
function release() {
  const app = (APP.match(/var APP_VER="([\d.]+)"/) || [])[1] || "";
  const ge = (v, floor) => {
    const a = String(v).split(".").map(Number), b = floor.split(".").map(Number);
    for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
    return true;
  };
  report("D1) the wave is in lockstep — the web app at 6.104.0 or later, the panel at 6.175.0 or later, and CI runs this file",
    ge(app, "6.104.0") && ge(MANIFEST.version, "6.175.0") && /node test\/verify_album_fonts\.js/.test(CI),
    { app, panel: MANIFEST.version });

  const n = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []).size;
  const badge = Number((LANDING.match(/"badge\.tests":\s*\{"my":\s*"(\d+) tests green/) || [])[1] || 0);
  report("D2) the landing site states the true number of tests CI runs",
    n === badge && n >= 246, { ciTests: n, badge });

  report("D3) the faces ride the /lib/ cache deliberately, and sw.js says why — a typeface is the one asset a student must never wait for twice",
    /lib\/fonts\//.test(SW) && /cache-first/i.test(SW) && !/LIB_PURGES[\s\S]{0,400}fonts/.test(SW), null);

  report("D4) the app never hard-codes a family name — every face reaches the canvas through the data table, so the picker, the CSS and the files can only move together",
    /f\.css \+ '";font-style:normal/.test(APP) && /function ensureFaces\(\)/.test(APP) &&
    /function fontForText\(tx\)/.test(APP) && /function weightFor\(font, role\)/.test(APP) &&
    /function fontsReady\(pg\)/.test(APP) &&
    /return fontsReady\(pg\)\.then\(function\(\)\{/.test(APP), null);
}

(async () => {
  faces();
  tables();
  await browserWalk();
  release();
  console.log(failures === 0 ? "\nALL PASS — the Album page's type, its licences and its files" : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("FAIL — harness :: " + (e && e.stack || e)); process.exit(1); });
