/* verify_album_output.js — 6.106.0 / panel 6.177.0
   ALBUM PAGES, WAVE D: THE ALBUM LEAVES THE STUDIO.

   The owner, standing: "ဒီထက်ပိုကောင်းပိုစုံတာရှိရင် အသေးစိတ်ရှာပြီး ထပ် update
   upgrade ပေးပါ". Waves A, B and C built an album. None of them could hand it to
   anybody: the page came out as a JPEG, which is the right pixels inside a file no
   print shop accepts as artwork and no retoucher can open and change.

   WHAT THIS WAVE ADDS, AND WHY EACH PIECE IS HERE.

     1. A PAGE THAT REACHES THE PAPER'S EDGE. Every photograph until now was laid
        out over the SAFE AREA — the trim inset by the bleed — so nothing could
        reach the edge of the page, and the template family literally named "Full
        bleed" stopped three millimetres short of it. A page marked `bleed` is laid
        out over the trim GROWN by that bleed instead: the picture runs past the cut
        and the guillotine goes through it. Words never move; type that bleeds is
        type that gets cut off. B5 and C2 measure the rectangle; C3 proves the
        photograph really is drawn outside the trim.

     2. ONE PRINT-READY PDF OF THE WHOLE ALBUM. MediaBox = trim + bleed + the room
        the marks need, a real TrimBox and BleedBox, and eight crop marks starting
        OUTSIDE the bleed so they never print on the artwork. C6 parses the file
        that comes out — every box arithmetic, every mark, the cross-reference table
        pointing at real objects — rather than trusting the writer that made it.

        AND THE PHOTOGRAPHS ARE NOT RE-ENCODED. The renderer's own JPEG bytes go
        into the file as a /DCTDecode stream. C7 takes the same page's JPEG from the
        canvas and insists the bytes inside the PDF are byte-for-byte those bytes: a
        PDF writer that decodes and re-encodes throws away a generation of quality
        for nothing, and nothing but a comparison catches it.

     3. THE OPEN PAGE AS A LAYERED .PSD. A white base, one layer per photograph, one
        per line of type, PackBits-compressed, with the resolution block so Photoshop
        opens it at the right DPI. C8 reads the file back with ag-psd — an
        implementation that owes nothing to this one — and checks the size, the layer
        names, their rectangles and their actual pixels. A PSD writer checked by its
        own reader proves only that it is self-consistent.

        C8 also carries a defect this wave found and fixed: the layer rectangles were
        floored and ceiled outward, which left a one-pixel transparent seam down every
        join between two cells — a hairline of nothing in the middle of a printed
        page. The rectangles are rounded now and the photograph is drawn to fill
        exactly them, so C8 reads the corner of the third layer and insists it is
        opaque.

     4. THE SPREAD, THE SHUFFLE, THE CLOSING PAGE. An album is read two pages at a
        time; the shuffle re-deals every photograph into the same page counts and can
        never lose one (B2 drives it a thousand times); the closing page signs the
        work with the studio's name in the album's own face.

   AND ONE REGRESSION PIN THAT COST THIS WAVE AN HOUR. `alb_bleed` already existed:
   it is the WORD "bleed", printed beside the millimetres in the size line. The first
   cut of this wave added a second `alb_bleed` for the new switch, and because the
   last definition in an object literal wins, the size line would have shipped reading
   "Photos to the edge 3 mm". A6 insists the two keys are separate and that the old
   one still says what it always said. */

"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const WN = require("./lib/whats-new.js");
const ALBUM = A.readAlbum();
const TRL = A.readTrl();

const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const READERS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const KEYS = ["alb_edge", "alb_edge_note", "alb_spread", "alb_shuffle", "alb_shuffle_done",
              "alb_close_add", "alb_out_pdf", "alb_out_psd", "alb_out_sheet",
              "alb_psd_big", "alb_psd_no", "alb_pdf_done"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const WEB = "6.106.0";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}

/* every block in the app that declares this i18n key, whichever of the two
   dictionaries it lives in (one carries {my,en}, the other the seven others) */
function rows(key) {
  const re = new RegExp("[\\n,{]\\s*" + key + ":\\{", "g");
  let m, out = "";
  while ((m = re.exec(APP))) {
    let i = m.index + m[0].length - 1, depth = 0;
    for (; i < APP.length; i++) {
      out += APP[i];
      if (APP[i] === "{") depth++;
      else if (APP[i] === "}") { depth--; if (!depth) break; }
    }
    out += "\n";
  }
  return out;
}

/* ============================ A) what the source says ============================ */
function source() {
  report("A1) the layout rectangle exists and is the ONLY thing that decides where photographs go — drawPage and reAnchor both lay cells out over it, and drawTexts is still handed the safe area so words can never bleed",
    /function layoutRect\(safe, pg\)\{/.test(APP.replace(/\s+/g, " ").replace(/function layoutRect\(safe, pg\) \{/, "function layoutRect(safe, pg){")) ||
    /function layoutRect\(safe, pg\)\s*\{/.test(APP), null);

  const dp = (APP.match(/function drawPage\(cv, pg, idx, opt\)\{[\s\S]{0,2600}/) || [""])[0];
  report("A2) drawPage takes the bleed as an option, grows the canvas by it on both axes, lays the cells out over layoutRect and shifts every one of them by the same margin",
    /var m = opt\.bleed \? safe\.bleed : 0;/.test(APP) &&
    /Math\.round\(\(safe\.page\.w \+ 2\*m\)\*scale\)/.test(APP) &&
    /Math\.round\(\(safe\.page\.h \+ 2\*m\)\*scale\)/.test(APP) &&
    /var lay = layoutRect\(safe, pg\);/.test(APP) &&
    /var tpl = pageTpl\(pg, idx\), rects = cellRects\(tpl, lay\);/.test(APP) &&
    /var dx = \(r\.x\+m\)\*scale, dy = \(r\.y\+m\)\*scale/.test(APP) &&
    /drawTexts\(x, pg, safe, scale, m\);/.test(APP), { found: dp.length });

  report("A3) reAnchor scores every page's crop against that page's OWN layout rectangle — a bleeding page's cells are a different shape, so a crop chosen against the safe area is the wrong crop",
    /var rects = cellRects\(tpl, layoutRect\(safe, pg\)\), i;/.test(APP), null);

  report("A4) the PDF writer names the three boxes a press operator reads, embeds the renderer's own JPEG bytes as /DCTDecode, writes a cross-reference table and ends at %%EOF — and nowhere decodes an image",
    /\/MediaBox \[0 0 " \+ nPdf\(sheetW\)/.test(APP) &&
    /\/BleedBox \[" \+ nPdf\(O-g\)/.test(APP) &&
    /\/TrimBox \[" \+ nPdf\(L\)/.test(APP) &&
    /\/Filter \/DCTDecode \/Length " \+ sh\.jpeg\.length/.test(APP) &&
    /startxref/.test(APP) && /%%EOF/.test(APP) &&
    !/createImageBitmap[\s\S]{0,200}pdfOfShots/.test(APP), null);

  report("A5) the PSD writer is a real 8BPS file — the header, the resolution block so Photoshop opens it at the page's own DPI, PackBits on every channel, and the flattened composite a reader without layer support shows",
    /u8s\("8BPS"\), be16\(1\), new Uint8Array\(6\)/.test(APP) &&
    /be16\(1005\)/.test(APP) &&
    /function packRow\(src, n, bag\)/.test(APP) &&
    /cnt\[k\+\+\] = 0; cnt\[k\+\+\] = 1;/.test(APP) &&
    /u8s\("8BIMnorm"\)/.test(APP), null);

  report("A6) alb_bleed is still the WORD bleed beside the millimetres, and the new switch is its own key — the first cut of this wave declared alb_bleed twice, and the last declaration in an object literal wins",
    (APP.match(/\n  alb_bleed:\{/g) || []).length === 2 &&      /* one row per dictionary */
    (APP.match(/\n  alb_edge:\{/g) || []).length === 2 &&
    /alb_bleed:\{my:"အနားပို",en:"bleed"\}/.test(APP) &&
    /parts\.push\(L\("alb_bleed"\) \+ " " \+ D\.bleedMm \+ " mm"\)/.test(APP) &&
    /L\("alb_edge"\)\); bb\.id = "albBleed"/.test(APP),
    { albBleed: (APP.match(/\n  alb_bleed:\{/g) || []).length, albEdge: (APP.match(/\n  alb_edge:\{/g) || []).length });

  const missing = [];
  KEYS.forEach(k => {
    const blk = rows(k);
    LANGS.forEach(L => { if (!new RegExp("[,{]" + L + ':"').test(blk)) missing.push(k + "/" + L); });
    READERS.forEach(c => { if (!TRL[c] || typeof TRL[c][k] !== "string" || !TRL[c][k]) missing.push(k + "/" + c); });
  });
  report("A7) all twelve new lines are written in the nine base languages (across BOTH dictionaries) and in all fifteen reader packs — a key that only reaches {my,en} renders English to a Shan student",
    missing.length === 0, missing.slice(0, 20));

  const ph = [];
  KEYS.forEach(k => {
    const en = (rows(k).match(/[,{]en:"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
    const want = (en.match(/\{[A-Z]\}/g) || []).sort().join(",");
    LANGS.concat(READERS).forEach(L => {
      const v = READERS.indexOf(L) >= 0 ? TRL[L][k]
              : (rows(k).match(new RegExp("[,{]" + L + ':"((?:[^"\\\\]|\\\\.)*)"')) || [])[1];
      if (v == null) return;
      const got = (v.match(/\{[A-Z]\}/g) || []).sort().join(",");
      if (got !== want) ph.push(k + "/" + L + " " + got + " != " + want);
    });
  });
  report("A8) every translation carries the same placeholders as its English — {W} {H} {N} {M} are substituted by position, and a line that drops one prints a brace at a student",
    ph.length === 0, ph.slice(0, 12));

  report("A9) the host can be handed bytes rather than a data: URL, and a host that cannot still gets one — a forty-page print file is tens of megabytes, and a base64 string of one is held twice",
    /exportFile: function\(bytes, name, mime\)\{/.test(APP) &&
    /URL\.createObjectURL\(new Blob\(\[bytes\]/.test(APP) &&
    /function sendFile\(bytes, name, mime\)\{/.test(APP) &&
    /if \(H && typeof H\.exportFile === "function"\) return H\.exportFile\(bytes, name, mime\);/.test(APP) &&
    /return H\.exportOut\("data:" \+ mime \+ ";base64," \+ btoa\(bin\), name\);/.test(APP), null);

  report("A10) the export card carries the print file and the layered file, and says the sheet size, the page count and what the PSD will weigh before anything is pressed",
    /albOutPdf/.test(APP) && /albOutPsd/.test(APP) && /albOutNote/.test(APP) &&
    /L\("alb_out_sheet"\)/.test(APP) && /psdEstimate\(curPage\(\), DOC\.cur\)/.test(APP), null);

  report("A11) the document remembers what wave D added and a saved album from before it still opens — the page's bleed and the stage's view both fall back rather than throwing",
    /return \{ v:4, sizeId:"12x36"/.test(APP) &&
    /view:"page"/.test(APP) &&
    /bleed:false, decor:\[\], story:-1 \}; \}/.test(APP) &&   /* 6.121.0 — a page also carries the engine's decor and its story index */
    /out\.view = \(d\.view === "spread" \|\| d\.view === "book"\) \? d\.view : "page";/.test(APP) &&   /* 6.121.0 — the book is the third view */
    /pg\.bleed = !!p\.bleed;/.test(APP), null);
}

/* ===================== B) the arithmetic, with no browser in it ===================== */
/* Everything here is driven through the page's own API.math, so what is measured is
   the shipped function and not a copy of it written for the test. */
async function maths(page) {
  const b1 = await page.evaluate(() => {
    const M = ALBUM.math, out = [];
    for (let n = 1; n <= 12; n++) { const s = []; for (let i = 0; i < n; i++) s.push(M.spreadOf(i, n)); out.push(s); }
    return out;
  });
  let spreadOk = true, why = null;
  b1.forEach((s, k) => {
    const n = k + 1;
    if (JSON.stringify(s[0]) !== JSON.stringify([null, 0])) { spreadOk = false; why = "page one is not alone on the right at n=" + n; }
    for (let i = 0; i < n; i++) {
      const p = s[i];
      if (i > 0 && p.indexOf(i) < 0) { spreadOk = false; why = "page " + i + " is not in its own spread at n=" + n; }
      if (p[0] != null && p[1] != null && p[1] !== p[0] + 1) { spreadOk = false; why = "a spread that is not two consecutive pages at n=" + n; }
      if (p[0] != null && p[0] % 2 === 0) { spreadOk = false; why = "an even-indexed page on the left at n=" + n; }
    }
  });
  report("B1) the spread is the one a bound book actually falls open at — page one alone on the right, then 2–3, 4–5, and a last page alone on the left when the count runs out; checked for every album length from one page to twelve",
    spreadOk, why);

  const b2 = await page.evaluate(() => {
    const M = ALBUM.math;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let bad = null, moved = 0;
    for (let t = 0; t < 1000 && !bad; t++) {
      const n = 1 + (t % 40), counts = [], list = [];
      let left = n, i = 0;
      while (left > 0) { const k = Math.min(left, 1 + (i % 6)); counts.push(k); left -= k; i++; }
      for (let k = 0; k < n; k++) list.push(k);
      const out = M.dealOut(list, counts, rnd);
      if (out.length !== counts.length) { bad = "page count changed"; break; }
      for (let k = 0; k < counts.length; k++) if (out[k].length !== counts[k]) bad = "page " + k + " holds " + out[k].length + " not " + counts[k];
      const flat = out.reduce((a, b) => a.concat(b), []).sort((a, b) => a - b);
      if (flat.length !== n) bad = "photographs lost or duplicated";
      for (let k = 0; k < n; k++) if (flat[k] !== k) bad = "photograph " + k + " is gone";
      if (out.reduce((a, b) => a.concat(b), []).some((v, k) => v !== k)) moved++;
    }
    return { bad, moved };
  });
  report("B2) the shuffle deals every photograph again into exactly the same page counts and can never lose, duplicate or strand one — a thousand deals over albums of one to forty photographs, and the order really does move",
    b2.bad === null && b2.moved > 900, b2);

  const b3 = await page.evaluate(() => {
    const M = ALBUM.math;
    return [0, 1, 10, 100, 1000, 0.5, 10.5, 100.25, 1479.6850393700787, 0.0001]
      .map(v => M.nPdf(v));
  });
  report("B3) the PDF's numbers survive being written — 100 stays 100 and is not stripped to 1 by a greedy trailing-zero cut, and nothing ever comes out in exponent notation",
    JSON.stringify(b3) === JSON.stringify(["0", "1", "10", "100", "1000", "0.5", "10.5", "100.25", "1479.685", "0"]), b3);

  const b4 = await page.evaluate(() => {
    /* PackBits, encoded by the shipped writer and decoded here by the rule the format
       states rather than by its own inverse */
    const M = ALBUM.math;
    const cases = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let t = 0; t < 60; t++) {
      const n = 1 + Math.floor(rnd() * 600), a = new Uint8Array(n);
      for (let i = 0; i < n; i++) a[i] = (rnd() < 0.6) ? (t & 255) : Math.floor(rnd() * 256);
      cases.push(a);
    }
    cases.push(new Uint8Array(400));                          /* all one value: the longest runs */
    const bag = { a: new Uint8Array(1 << 16), n: 0,
                  need(k){ if(this.n+k>this.a.length){ let c=this.a.length; while(c<this.n+k)c*=2; const b=new Uint8Array(c); b.set(this.a.subarray(0,this.n)); this.a=b; } },
                  byte(v){ this.need(1); this.a[this.n++]=v&255; },
                  put(s,o,n){ this.need(n); this.a.set(s.subarray(o,o+n), this.n); this.n+=n; } };
    let bad = null, packed = 0, raw = 0;
    for (const a of cases) {
      const at = bag.n, len = M.packRow(a, a.length, bag);
      const enc = bag.a.subarray(at, at + len);
      const out = [];
      let i = 0;
      while (i < enc.length) {
        const h = enc[i++];
        if (h < 128) { for (let k = 0; k <= h; k++) out.push(enc[i++]); }
        else if (h > 128) { const v = enc[i++]; for (let k = 0; k < 257 - h; k++) out.push(v); }
      }
      if (out.length !== a.length) { bad = "length " + out.length + " != " + a.length; break; }
      for (let k = 0; k < a.length; k++) if (out[k] !== a[k]) { bad = "byte " + k; break; }
      raw += a.length; packed += len;
    }
    return { bad, raw, packed };
  });
  report("B4) every PackBits row the PSD writer produces decodes, by the format's own rule, back to exactly the bytes it was given — sixty random rows plus one of four hundred identical bytes, which the run coding must actually shrink",
    b4.bad === null && b4.packed < b4.raw, b4);

  const b5 = await page.evaluate(() => {
    const M = ALBUM.math;
    const safe = { x: 30, y: 30, w: 940, h: 1440, page: { w: 1000, h: 1500 }, bleed: 30, gutter: 0 };
    const off = M.layoutRect(safe, { bleed: false }), on = M.layoutRect(safe, { bleed: true });
    return { off: [off.x, off.y, off.w, off.h], on: [on.x, on.y, on.w, on.h],
             gut: M.layoutRect({ ...safe, gutter: 12 }, { bleed: true }).gutter };
  });
  report("B5) a page that does not bleed is laid out over the safe area exactly as it always was, and a page that does is laid out over the TRIM grown by the bleed on all four sides — the gutter a flush-mount spread loses is carried across either way",
    JSON.stringify(b5.off) === JSON.stringify([30, 30, 940, 1440]) &&
    JSON.stringify(b5.on) === JSON.stringify([-30, -30, 1060, 1560]) && b5.gut === 12, b5);
}

/* ============================ C) the page, in a browser ============================ */
async function browserWalk() {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 430, height: 930 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e.message).slice(0, 220)));
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__albShot = function (w, h, a, b) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, a); g.addColorStop(1, b);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = "#c9a227";
      x.beginPath(); x.arc(w * 0.5, h * 0.35, Math.min(w, h) * 0.2, 0, 7); x.fill();
      return c.toDataURL("image/jpeg", 0.9);
    };
  });
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(700);

  await maths(page);

  /* a small page so the whole walk stays inside a runner's memory, three photographs
     on it and two lines of type — the album a student would actually be looking at */
  const set = await page.evaluate(async () => {
    const d0 = ALBUM.doc(); d0.sizeId = "story"; ALBUM.setDoc(d0);     /* 1440 × 2560 at 72 DPI */
    await ALBUM.accept([window.__albShot(800, 600, "#22304f", "#e9dcc4"),
                        window.__albShot(600, 800, "#3b2a2a", "#f0e6d8"),
                        window.__albShot(700, 700, "#1e3b2e", "#dfeade")], "page");
    const d = ALBUM.doc();
    d.pages[0].texts = [
      { role: "title", text: "Ko Ko and Ma Ma", x: 0.5, y: 0.5, align: "center", color: "#7a2f36", font: "" },
      { role: "caption", text: "Yangon 2026", x: 0.5, y: 0.62, align: "center", color: "#1b1b1f", font: "" }];
    ALBUM.setDoc(d);
    return { size: ALBUM.doc().sizeId, photos: ALBUM.doc().pages[0].photos.length,
             texts: ALBUM.doc().pages[0].texts.length, v: ALBUM.doc().v };
  });
  report("C1) the walk is set up on a real album page — the size the student picked, three photographs measured in, two lines of type, and the document at wave D's own version",
    set.size === "story" && set.photos === 3 && set.texts === 2 && set.v === 4, set);

  const ui = await page.evaluate(() => ({
    edge: (document.getElementById("albBleed") || {}).textContent || "",
    note: (document.getElementById("albBleedNote") || {}).textContent || "",
    spread: (document.getElementById("albSpread") || {}).textContent || "",
    shuffle: (document.getElementById("albShuffle") || {}).textContent || "",
    close: (document.getElementById("albPageClose") || {}).textContent || "",
    pdf: (document.getElementById("albOutPdf") || {}).textContent || "",
    psd: (document.getElementById("albOutPsd") || {}).textContent || "",
    sheet: (document.getElementById("albOutNote") || {}).textContent || ""
  }));
  report("C2) every one of wave D's controls is on the page and none of them is an empty box — the switch and its warning, the spread, the shuffle, the closing page, and the two files with the sheet they will make",
    Object.keys(ui).every(k => ui[k].trim().length > 2) &&
    /mm/.test(ui.sheet) && /MB/.test(ui.sheet) && /[0-9]/.test(ui.sheet), ui);

  /* C3 — the switch really moves the geometry, and the photograph is really outside the trim. */
  const c3 = await page.evaluate(() => {
    const M = ALBUM.math, d = ALBUM.doc(), sz = M.sizeById(d.sizeId), px = M.pagePx(sz);
    const before = M.layoutRect({ x: 0, y: 0, w: 0, h: 0, page: px, bleed: 1, gutter: 0 }, d.pages[0]);
    document.getElementById("albBleed").click();
    const after = ALBUM.doc().pages[0].bleed;
    const on = document.querySelectorAll("#albBleed.on").length;
    /* what the page is now laid out over, measured through the shipped functions */
    const rects = ALBUM.__cellsForTest(0);
    return { was: !!before.bleed && false, now: after, chipOn: on, px: px,
             minX: Math.min(...rects.map(r => r.x)), minY: Math.min(...rects.map(r => r.y)),
             maxX: Math.max(...rects.map(r => r.x + r.w)), maxY: Math.max(...rects.map(r => r.y + r.h)) };
  });
  report("C3) one tap marks the page, and its photographs are then laid out PAST the trim on every side — before wave D nothing on an album page could reach the paper's edge at all",
    c3.now === true && c3.chipOn === 1 &&
    c3.minX < 0 && c3.minY < 0 && c3.maxX > c3.px.w && c3.maxY > c3.px.h, c3);

  /* C4 — the picture really is drawn outside the trim, in pixels. */
  const c4 = await page.evaluate(async () => {
    const d = ALBUM.doc();
    const cv = document.createElement("canvas");
    const plain = document.createElement("canvas");
    await ALBUM.__drawForTest(cv, 0, { scale: 1, guides: false, bleed: true });
    await ALBUM.__drawForTest(plain, 0, { scale: 1, guides: false, bleed: false });
    const x = cv.getContext("2d");
    const corner = Array.from(x.getImageData(2, 2, 1, 1).data);
    return { bled: [cv.width, cv.height], trim: [plain.width, plain.height], corner };
  });
  report("C4) the print canvas is bigger than the page by exactly the bleed on each side, and the corner of that extra margin carries photograph rather than paper — which is the only thing that lets a guillotine cut through a picture",
    c4.bled[0] > c4.trim[0] && c4.bled[1] > c4.trim[1] &&
    (c4.bled[0] - c4.trim[0]) === (c4.bled[1] - c4.trim[1]) &&
    !(c4.corner[0] > 250 && c4.corner[1] > 250 && c4.corner[2] > 250), c4);

  /* C5 — the spread. */
  const c5 = await page.evaluate(async () => {
    const d = ALBUM.doc();
    d.pages.push(JSON.parse(JSON.stringify(d.pages[0])));
    d.pages.push(JSON.parse(JSON.stringify(d.pages[0])));
    d.view = "page"; d.cur = 1; ALBUM.setDoc(d);
    await new Promise(r => setTimeout(r, 450));          /* the stage repaints on a timer */
    const a = document.getElementById("albCanvas");
    const one = a.width / a.height;
    document.getElementById("albSpread").click();
    await new Promise(r => setTimeout(r, 450));
    const b = document.getElementById("albCanvas");
    const two = b.width / b.height;
    /* THE FOLD, measured against the same pixel without it. The band is a wash of black down
       the centre line, so the only honest comparison is the left page's own last column drawn
       on its own at the same scale: same artwork, same place, one of them shadowed. */
    const x = b.getContext("2d");
    const W = b.width / 2, y = Math.floor(b.height / 2);
    const solo = document.createElement("canvas");
    await ALBUM.__drawForTest(solo, 1, { scale: b.height / 2560, guides: !!ALBUM.doc().guides });
    const sx = solo.getContext("2d");
    const onFold = Array.from(x.getImageData(Math.floor(W) - 1, y, 1, 1).data);
    const plain = Array.from(sx.getImageData(Math.min(solo.width - 1, Math.floor(W) - 1), y, 1, 1).data);
    return { view: ALBUM.doc().view, one, two, pages: ALBUM.doc().pages.length,
             box: [b.width, b.height], onFold, plain };
  });
  report("C5) the Spread chip turns the stage into the two pages that face each other — the same box now holds a shape twice as wide as it is deep for the page it replaced, with the fold drawn down the middle where the binding will be",
    c5.view === "spread" && c5.pages === 3 &&
    Math.abs(c5.two - c5.one * 2) < 0.06 &&
    c5.onFold[0] < c5.plain[0] && c5.onFold[1] < c5.plain[1] && c5.onFold[2] < c5.plain[2], c5);

  /* C6 — the shuffle, on the real album. */
  const c6 = await page.evaluate(() => {
    const before = ALBUM.doc().pages.map(p => p.photos.map(q => q.src.slice(-24)));
    const d = ALBUM.doc(); d.view = "page"; ALBUM.setDoc(d);
    document.getElementById("albShuffle").click();
    const after = ALBUM.doc().pages.map(p => p.photos.map(q => q.src.slice(-24)));
    const flat = a => a.reduce((x, y) => x.concat(y), []).slice().sort();
    return { counts: [before.map(p => p.length), after.map(p => p.length)],
             same: JSON.stringify(flat(before)) === JSON.stringify(flat(after)) };
  });
  report("C6) the shuffle on a real three-page album keeps every page's photograph count and every photograph — the layouts and the words do not move, only which picture sits in which cell",
    JSON.stringify(c6.counts[0]) === JSON.stringify(c6.counts[1]) && c6.same, c6);

  /* C7 — the closing page. */
  const c7 = await page.evaluate(() => {
    const n0 = ALBUM.doc().pages.length;
    document.getElementById("albPageClose").click();
    const d = ALBUM.doc(), last = d.pages[d.pages.length - 1];
    return { added: d.pages.length - n0, photos: last.photos.length,
             texts: last.texts.map(t => ({ role: t.role, text: t.text, color: t.color })),
             tpl: last.tplId, auto: last.auto, cur: d.cur === d.pages.length - 1 };
  });
  report("C7) the closing page signs the album — no photograph on it, the studio's name set as the title in the occasion's own ink and the occasion's line under it, and the page opens straight away",
    c7.added === 1 && c7.photos === 0 && c7.texts.length === 2 &&
    c7.texts[0].text === "HNK Create Studio" && c7.texts[0].role === "title" &&
    /^#[0-9a-f]{6}$/i.test(c7.texts[0].color) && c7.auto === false && c7.cur, c7);

  /* ---- C8 / C9: the print file, parsed ---- */
  const pdfB64 = await page.evaluate(async () => {
    let cap = null;
    const real = URL.createObjectURL;
    URL.createObjectURL = function (b) { cap = b; return real.call(URL, b); };
    await ALBUM.pdf();
    URL.createObjectURL = real;
    const buf = new Uint8Array(await cap.arrayBuffer());
    let s = "", CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
    return btoa(s);
  });
  const pdf = Buffer.from(pdfB64, "base64");
  const txt = pdf.toString("latin1");
  const nPages = await page.evaluate(() => ALBUM.doc().pages.length);
  const boxes = {
    media: (txt.match(/\/MediaBox \[([^\]]*)\]/) || [])[1],
    bleed: (txt.match(/\/BleedBox \[([^\]]*)\]/) || [])[1],
    trim: (txt.match(/\/TrimBox \[([^\]]*)\]/) || [])[1]
  };
  const geo = await page.evaluate(() => {
    const M = ALBUM.math, sz = M.sizeById(ALBUM.doc().sizeId), px = M.pagePx(sz);
    const per = 72 / px.dpi, bleedPt = M.mmPx(3, px.dpi) * per, markPt = (4 / 25.4) * 72;
    return { w: px.w * per, h: px.h * per, bleedPt, markPt, dpi: px.dpi };
  });
  const num = s => (s || "").split(/\s+/).map(Number);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const O = geo.bleedPt + geo.markPt;
  const m = num(boxes.media), tb = num(boxes.trim), bb = num(boxes.bleed);
  report("C8) the PDF's three boxes are the arithmetic a press needs — MediaBox is the trim plus the bleed plus the room the marks take, TrimBox is the finished page, and BleedBox is the trim grown by exactly the bleed",
    /^%PDF-1\.4/.test(txt) && /%%EOF\s*$/.test(txt) &&
    near(m[2], geo.w + 2 * O) && near(m[3], geo.h + 2 * O) &&
    near(tb[0], O) && near(tb[1], O) && near(tb[2], O + geo.w) && near(tb[3], O + geo.h) &&
    near(bb[0], O - geo.bleedPt) && near(bb[2], O + geo.w + geo.bleedPt),
    { boxes, geo, O });

  const marks = (txt.match(/ l S/g) || []).length;
  const dct = (txt.match(/\/DCTDecode/g) || []).length;
  const typePage = (txt.match(/\/Type \/Page[^s]/g) || []).length;
  /* every cross-reference offset must land on its own object header */
  const startx = Number((/startxref\s+(\d+)/.exec(txt) || [])[1]);
  const xrefRows = (txt.slice(startx).match(/^(\d{10}) 00000 n $/gm) || []).map(r => Number(r.slice(0, 10)));
  const xrefOk = xrefRows.length > 0 && xrefRows.every((off, i) => /^\d+ 0 obj/.test(txt.slice(off, off + 12)));
  report("C9) every page in the album is in the file once, with its eight crop marks and one image, and the cross-reference table points at real objects — a table whose offsets are wrong opens as a damaged file in every reader there is",
    typePage === nPages && marks === nPages * 8 && dct === nPages &&
    /^xref\n0 /m.test(txt.slice(startx)) && xrefOk && xrefRows.length === 3 + nPages * 3,
    { nPages, typePage, marks, dct, startx, rows: xrefRows.length, xrefOk });

  /* C10 — the photographs are not re-encoded. */
  const c10 = await page.evaluate(async () => {
    const cv = document.createElement("canvas");
    await ALBUM.__drawForTest(cv, 0, { scale: 1, guides: false, bleed: true });
    const url = cv.toDataURL("image/jpeg", 0.92);
    return url.slice(url.indexOf(",") + 1);
  });
  const shot = Buffer.from(c10, "base64");
  const first = txt.indexOf("/DCTDecode");
  const sAt = txt.indexOf("stream\n", first) + 7;
  const eAt = txt.indexOf("\nendstream", sAt);
  const inPdf = pdf.slice(sAt, eAt);
  report("C10) the JPEG inside the PDF is byte-for-byte the one the renderer made — a writer that decodes and re-encodes a photograph on the way in throws away a generation of quality, and only a comparison finds it",
    inPdf.length === shot.length && inPdf.equals(shot),
    { inPdf: inPdf.length, fromCanvas: shot.length,
      head: inPdf.slice(0, 4).toString("hex"), headWant: shot.slice(0, 4).toString("hex") });

  /* ---- C11 / C12: the layered file, read back by somebody else's parser ---- */
  const psdB64 = await page.evaluate(async () => {
    const d = ALBUM.doc(); d.cur = 0; ALBUM.setDoc(d);
    const by = await ALBUM.psd();
    let s = "", CH = 0x8000;
    for (let i = 0; i < by.length; i += CH) s += String.fromCharCode.apply(null, by.subarray(i, i + CH));
    return btoa(s);
  });
  const psd = Buffer.from(psdB64, "base64");
  let ag = null, agErr = null;
  try {
    const agpsd = require("ag-psd");
    /* ag-psd builds its ImageData through a canvas, and Node has none; the pixels are
       all this test wants, so it is handed a plain ImageData maker and never a canvas. */
    agpsd.initializeCanvas(() => { throw new Error("no canvas"); },
      (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
    ag = agpsd.readPsd(psd.buffer.slice(psd.byteOffset, psd.byteOffset + psd.length),
      { useImageData: true, skipCompositeImageData: false });
  } catch (e) { agErr = String(e && e.message || e); }

  const want = await page.evaluate(() => {
    const M = ALBUM.math, px = M.pagePx(M.sizeById(ALBUM.doc().sizeId));
    return { w: px.w, h: px.h, dpi: px.dpi };
  });
  const names = ag ? ag.children.map(c => c.name) : [];
  const px00 = (c) => c && c.imageData ? Array.from(c.imageData.data.slice(0, 4)) : null;
  const bg = ag && ag.children[0], p3 = ag && ag.children[3], title = ag && ag.children[4];
  report("C11) ag-psd — a PSD reader that owes nothing to the writer above — opens the file and finds the page at its own size with every layer this album has: a white base, one per photograph, one per line of type, each named and each with its own rectangle",
    !!ag && ag.width === want.w && ag.height === want.h &&
    names.length === 6 &&
    JSON.stringify(names) === JSON.stringify(["Background", "Photo 1", "Photo 2", "Photo 3", "Title", "Caption"]) &&
    ag.children.every(c => c.right > c.left && c.bottom > c.top && c.imageData &&
                           c.imageData.width === c.right - c.left && c.imageData.height === c.bottom - c.top),
    { agErr, names, w: ag && ag.width, h: ag && ag.height, bytes: psd.length });

  const bgpx = px00(bg), p3px = px00(p3), tpx = px00(title);
  report("C12) and the pixels are right where they should be — the base is opaque white, the THIRD photograph's own corner is opaque (the rectangles were floored and ceiled outward before this wave, which left a one-pixel transparent seam down every join between two cells), the type layer's corner is empty, and the flattened composite carries the title's ink at the title's own place",
    !!ag && JSON.stringify(bgpx) === JSON.stringify([255, 255, 255, 255]) &&
    !!p3px && p3px[3] === 255 && !!tpx && tpx[3] === 0 &&
    !!ag.imageData && ag.imageData.width === want.w,
    { bgpx, p3px, tpx, composite: ag && ag.imageData ? [ag.imageData.width, ag.imageData.height] : null });

  const resAt = psd.indexOf(Buffer.from("8BIM")) ;
  const resId = resAt >= 0 ? psd.readUInt16BE(resAt + 4) : 0;
  const hres = resAt >= 0 ? psd.readUInt32BE(resAt + 12) >>> 16 : 0;   /* 8BIM + id + empty pascal name + u32 size */
  report("C13) the file states its own resolution, so Photoshop opens the page at the size it is meant to print at rather than guessing 72 DPI",
    resId === 1005 && hres === want.dpi, { resId, hres, want: want.dpi });

  /* C14 — the ceilings, which are the honest half of offering a layered file at all. */
  const c14 = await page.evaluate(async () => {
    const said = [];
    const realToast = window.toast;
    window.toast = function (m, k) { said.push([String(m), k || ""]); };
    const realConfirm = window.confirm;
    let asked = 0;
    window.confirm = function (m) { asked++; said.push(["CONFIRM:" + m, ""]); return false; };
    const d = ALBUM.doc(); d.sizeId = "12x36"; ALBUM.setDoc(d);       /* ~274 MB layered */
    const refused = await ALBUM.__psdButton();
    const big = ALBUM.doc();
    big.sizeId = "a3p"; ALBUM.setDoc(big);                            /* ~123 MB: over the soft ceiling only */
    const held = await ALBUM.__psdButton();
    window.toast = realToast; window.confirm = realConfirm;
    return { refused, held, asked, said: said.map(s => s[0].slice(0, 60)) };
  });
  report("C14) a page too big for a layered file in a browser is refused with its size and pointed at the print PDF, and a page merely large asks first and does nothing when the answer is no — a studio that lets the tab die instead is not being honest about what it can do",
    c14.refused === false && c14.held === false && c14.asked === 1 &&
    c14.said.some(s => /MB/.test(s)) && c14.said.some(s => /^CONFIRM:/.test(s)), c14);

  report("C15) nothing in the whole walk threw",
    errs.length === 0, errs);

  await ctx.close();
  await browser.close();
}

/* ============================ D) the release ============================ */
function release() {
  /* 6.107.0 — THIS CHECK USED TO MEASURE A FROZEN PAIR. Wave D wrote "6.106.0" and
     "6.177.0" into it as literals under the name "they move together", so it said nothing
     about moving and went red on the first release after it — the same mistake its sibling
     in verify_album_occasions carried until wave D rewrote it. What it should say is that
     the four surfaces agree with docs/app/version.json, that the service worker's cache
     name is that version, and that the panel is at or past the pair this wave shipped. */
  const web = JSON.parse(read("docs/app/version.json")).v;
  const cache = "hnk-web-studio-v" + web.replace(/\./g, "-");
  const cmp = (a, b) => {
    const x = String(a).split("."), y = String(b).split(".");
    for (let i = 0; i < 3; i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; }
    return 0;
  };
  report("D1) the web app, the service worker, the API and the landing site all say the same version, and the panel moved with them — at or past the 6.106.0 / 6.177.0 this wave shipped",
    new RegExp('var APP_VER="' + web + '";').test(APP) &&
    read("docs/app/sw.js").indexOf('var CACHE = "' + cache + '";') >= 0 &&
    read("server/index.js").indexOf(web) >= 0 &&
    LANDING.indexOf("Panel v" + MANIFEST.version) >= 0 &&
    cmp(web, WEB) >= 0 && cmp(MANIFEST.version, "6.177.0") >= 0,
    { web, cache, manifest: MANIFEST.version });

  const n = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []).size;
  const badge = Number((LANDING.match(/"badge\.tests":\s*\{"my":\s*"(\d+) tests green/) || [])[1] || 0);
  report("D2) CI runs this file and installs the PSD reader it checks with, and the landing site states the true number of tests",
    /node test\/verify_album_output\.js/.test(CI) &&
    /npm install playwright@1\.62\.1 acorn@8\.18\.0 ag-psd@31\.0\.2/.test(CI) &&
    n === badge && n >= 248, { ciTests: n, badge });

  const row = WN.appRow("6.106.0", "pgAlbum");
  const missing = LANGS.filter(L => !new RegExp("[,{]" + L + ':"').test(row.split("s:{")[0]) ||
                                    !new RegExp("[,{]" + L + ':"').test("s:{" + (row.split("s:{")[1] || "")));
  report("D3) the What's New row for this release is written in all nine base languages, title and body, and points at the Album page",
    row.length > 2000 && missing.length === 0, { bytes: row.length, missing });

  report("D4) the studio's own mark is a constant in one place, so the closing page and any future signature cannot drift apart",
    /var STUDIO_MARK = "HNK Create Studio";/.test(APP) &&
    (APP.match(/STUDIO_MARK/g) || []).length >= 2, null);
}

(async () => {
  source();
  await browserWalk();
  release();
  console.log(failures === 0 ? "\nALL PASS — the album leaves the studio: a print file, a layered file, and a page that reaches the paper's edge" : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("FAIL — harness :: " + (e && e.stack || e)); process.exit(1); });
