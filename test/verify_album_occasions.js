/* verify_album_occasions.js — 6.105.0 / panel 6.176.0
   ALBUM PAGES, WAVE C: THE OCCASIONS, AND THE WHOLE ALBUM.

   The owner, again: "ဒီထက်ပိုကောင်းပိုစုံတာရှိရင် အသေးစိတ်ရှာပြီး ထပ် update
   upgrade ပေးပါ လိုအပ်တာတေွအကုန်အစုံအပြီး update upgrade လုပ်ပါ".

   WHAT THE FIRST TWO WAVES LEFT UNDONE. Wave A gave a student one page at a time
   and wave B gave that page its type. Neither gave the thing a studio is actually
   paid for: an ALBUM — forty photographs off a card, in an order, on pages that do
   not all look the same, opening on a title in the student's own language. Until
   this wave, a forty-photograph wedding book was thirty-odd rounds of "add page,
   add photos, pick layout, type title", by hand, with the size and the typeface
   re-decided on every one.

   WHAT THIS WAVE SHIPS, and what this file is the teeth of:

     1. NINE OCCASIONS in data/album.js — prewedding, wedding day, portrait,
        family, baby, newborn, kids, birthday, events. The owner named seven of
        those by hand when the page was first asked for; section B insists all
        seven are still there by id, so a later refactor cannot quietly drop one.
        Each carries a wave-B pairing, an ink the picker really offers, a print
        size the picker can select, starter words in nine languages, and a PLAN.

     2. THE PLAN is the part that reads as expensive, and it is a decision about
        photography rather than about code: two to four photographs a page, one
        clear subject on each, never two crowded pages in a row. A wedding plan is
        fuller than a newborn plan because a wedding day is fuller than a newborn
        morning. The generator enforces the one rule that can be written down — at
        least one page in every cycle rests at two photographs or fewer — and it
        caught the first `event` plan written for this wave, which crowded all
        eight of its pages.

     3. "MAKE THE WHOLE ALBUM" — up to forty photographs at once, broken into
        pages by planPages(), the occasion's words set on the opener, and each
        page then picking its own layout through the same auto-flow one page uses.

   TWO THINGS THIS FILE EXISTS TO STOP FROM COMING BACK:

     THE ANCHOR THAT READ THE WRONG PAGE. reAnchor() took the page but scored its
     template against DOC.cur — the OPEN page — so a freshly laid-out fifteen-page
     album had fourteen of its pages cropped for a layout they are not drawn with.
     On a one-page album, which is all wave A could make, nothing showed. C6 lays
     out forty photographs and measures that page 9's anchors follow page 9's own
     template.

     THE MODE THAT COULD NOT TRAVEL. One mirror <input type=file> serves both the
     photo button and "Make the whole album", and on a phone nativePick lays a real
     input OVER the button — which swallows the button's own click, so a mode set
     in onclick never fires. The mode travels through nativePick's `before` hook
     instead, the one place both routes pass through. C7 drives the overlay, not
     the button, and insists an album comes back rather than one page of photos. */

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
const BUILDER = read("tools/build_album_data.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const ALBUM = A.readAlbum();
const TRL = A.readTrl();

const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const READERS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const OWNER_ASKED = ["prewed", "solo", "family", "baby", "kid", "newborn", "event"];
const KEYS = ["alb_occ", "alb_occ_note", "alb_make", "alb_make_hint", "alb_make_busy",
              "alb_make_done", "alb_make_cap", "alb_make_replace", "alb_make_none"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}

/* ===================== A) the generator, and what it refuses ===================== */
function generator() {
  /* A1 — the table is generated, and re-generating it changes nothing. */
  const before = read("docs/app/data/album.js");
  const built = require(path.join(ROOT, "tools", "build_album_data.js")).build({ dry: true });
  report("A1) data/album.js is exactly what tools/build_album_data.js produces — the occasions are generated, never typed into the shipped file",
    built.text === before, { builtBytes: built.text.length, onDiskBytes: before.length });

  /* A2 — the refusals, driven for real. Each of these is a mistake this wave's own
     author made or could have made, and each one has to be red before it is fixed. */
  const mod = path.join(ROOT, "tools", "build_album_data.js");
  const src = fs.readFileSync(mod, "utf8");
  const faults = [
    { why: "a pairing nothing ships",
      from: 'occ("prewed", "wedding",', to: 'occ("prewed", "no-such-pair",', want: /is not shipped/ },
    { why: "an ink the picker does not offer",
      from: 'occ("wedding", "classic", "#1b1b1f"', to: 'occ("wedding", "classic", "#123456"', want: /is not one the picker offers/ },
    { why: "a print size that does not exist",
      from: 'occ("family", "heritage", "#1b1b1f", "12x12"', to: 'occ("family", "heritage", "#1b1b1f", "99x99"', want: /is not a size/ },
    { why: "a page holding seven photographs when the templates stop at six",
      from: '[1, 2, 3, 2, 4, 3, 6, 2]', to: '[1, 2, 3, 2, 4, 3, 7, 2]', want: /the templates hold one to six/ },
    { why: "a plan where every page is crowded — the mistake the first `event` plan really made",
      from: '[1, 1, 2, 3, 1, 2, 3, 1]', to: '[3, 4, 5, 3, 4, 5, 3, 4]', want: /one must rest at two photographs or fewer/ },
    { why: "an occasion the owner named by hand, deleted",
      from: 'occ("newborn"', to: 'occ("newb0rn"', want: /the owner asked for newborn/ }
  ];
  const tmp = path.join(ROOT, "tools", ".album_fault_tmp.js");
  const caught = [];
  faults.forEach(f => {
    if (src.indexOf(f.from) < 0) { caught.push(f.why + " — ANCHOR NOT FOUND"); return; }
    fs.writeFileSync(tmp, src.split(f.from).join(f.to));
    try {
      delete require.cache[tmp];
      require(tmp).build({ dry: true });
      caught.push(f.why + " — NOT REFUSED");
    } catch (e) {
      if (!f.want.test(String(e.message))) caught.push(f.why + " — wrong reason: " + e.message);
    }
    delete require.cache[tmp];
  });
  try { fs.unlinkSync(tmp); } catch (e) {}
  report("A2) the generator refuses every one of six broken occasions by name — an unshipped pairing, an ink the picker cannot show, a size that does not exist, a seven-photograph page, a plan where nothing rests, and one of the owner's own seven deleted",
    caught.length === 0, caught);

  /* A3 — the inks live in the data now, which is what lets A2's second fault be caught at all. */
  report("A3) the ink row lives in data/album.js and the app reads it from there, so an occasion's default ink is a colour the picker really offers",
    /const INKS = \["#1b1b1f", "#ffffff", "#6b6b73", "#8a6a3b", "#b08d57", "#7a2f36"\];/.test(BUILDER) &&
    /inks: INKS,/.test(BUILDER) &&
    /var INKS = \(D\.inks && D\.inks\.length\) \? D\.inks/.test(APP) &&
    Array.isArray(ALBUM.inks) && ALBUM.inks.length === 6, { inks: ALBUM.inks });
}

/* ===================== B) the tables, and the maths, in Node ===================== */
function tables() {
  const occ = ALBUM.occasions || [];
  report("B1) nine occasions ship, each with an id nothing else uses",
    occ.length === 9 && new Set(occ.map(o => o.id)).size === 9, occ.map(o => o.id));

  report("B2) all seven kinds of session the owner named by hand are still there, by id",
    OWNER_ASKED.every(id => occ.some(o => o.id === id)),
    OWNER_ASKED.filter(id => !occ.some(o => o.id === id)));

  report("B3) every occasion's name and note, and its three starter lines, are written in all nine base languages",
    occ.every(o => [o.name, o.note, o.words.title, o.words.subtitle, o.words.quote]
      .every(t => LANGS.every(l => typeof t[l] === "string" && t[l].length))),
    occ.filter(o => !LANGS.every(l => o.name[l] && o.note[l] && o.words.title[l])).map(o => o.id));

  report("B4) every occasion's defaults are things the studio really ships — a pairing with two faces on disk, one of the six inks, and a size the picker can select",
    occ.every(o => ALBUM.pairs.some(p => p.id === o.pair) &&
                   ALBUM.inks.indexOf(o.ink) >= 0 &&
                   ALBUM.sizes.some(s => s.id === o.size)),
    occ.filter(o => !ALBUM.pairs.some(p => p.id === o.pair)).map(o => o.id));

  report("B5) every plan is one to six photographs a page and rests at least once at two or fewer — two to four a page is what reads as expensive, and a plan with no rest prints a contact sheet",
    occ.every(o => o.plan.length >= 4 && o.plan.every(n => Number.isInteger(n) && n >= 1 && n <= 6) &&
                   o.plan.some(n => n <= 2)),
    occ.map(o => ({ id: o.id, plan: o.plan })).filter(x => !x.plan.some(n => n <= 2)));

  report("B6) the plans really differ — a newborn morning and a wedding day cannot lay out the same album",
    new Set(occ.map(o => o.plan.join(","))).size === 9 &&
    occ.find(o => o.id === "newborn").plan.reduce((a, b) => a + b, 0) <
    occ.find(o => o.id === "wedding").plan.reduce((a, b) => a + b, 0),
    occ.map(o => o.id + "=" + o.plan.reduce((a, b) => a + b, 0)));

  report("B7) the default occasion is one of the nine, and one album may hold between twelve and two hundred photographs",
    occ.some(o => o.id === ALBUM.defOcc) && ALBUM.maxAlbum >= 12 && ALBUM.maxAlbum <= 200 && ALBUM.v === 3,
    { defOcc: ALBUM.defOcc, maxAlbum: ALBUM.maxAlbum, v: ALBUM.v });

  /* the app writes each key's languages across TWO blocks (my + en in one, the other seven in
     the next), and four of these nine carry a {N} or a {P} inside their VALUE — so the row has
     to be read by balancing braces from the key, over every block that names it, rather than by
     a regex that stops at the first "}" it meets. */
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
  const langMissing = {};
  KEYS.forEach(k => {
    const row = rows(k);
    const gaps = LANGS.filter(l => !new RegExp("[{,]\\s*" + l + ":[\"']").test(row));
    if (gaps.length) langMissing[k] = gaps;
  });
  report("B8) the nine new lines are in the app's own table in all nine base languages",
    Object.keys(langMissing).length === 0, langMissing);

  report("B9) the fifteen packs with a reader carry all nine, with {N} and {P} intact where the English has them",
    READERS.every(c => KEYS.every(k => typeof TRL[c][k] === "string" && TRL[c][k])) &&
    READERS.every(c => /\{N\}/.test(TRL[c].alb_make_done) && /\{P\}/.test(TRL[c].alb_make_done) &&
                       /\{N\}/.test(TRL[c].alb_make_hint)),
    READERS.filter(c => !KEYS.every(k => TRL[c][k])));

  report("B10) the three Tai packs are registered in sweep_v477's PENDING with the reason written down, rather than filled with Shan text a Tai Le reader cannot read",
    /V61050_KEYS/.test(read("test/sweep_v477_upgrades.js")) &&
    (read("test/sweep_v477_upgrades.js").match(/\.\.\.V61050_KEYS[,\]]/g) || []).length === 3, null);
}

/* ===================== C) the page, in a browser ===================== */
async function browserWalk() {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 430, height: 930 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(900);

  /* a photograph the test can make, at a size it chooses */
  await page.evaluate(() => {
    window.__albMade = function (w, h, fill, subjectY) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = fill; x.fillRect(0, 0, w, h);
      x.fillStyle = "#e8d8c8";
      x.fillRect(w * 0.3, h * (subjectY - 0.1), w * 0.4, h * 0.2);
      return c.toDataURL("image/jpeg", 0.7);
    };
  });
  await page.evaluate(() => { try { switchPage("pgAlbum"); } catch (e) {} });
  await page.waitForTimeout(700);

  /* C1 — the card is there, first, with all nine and the button. */
  const card = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#albOccs .alb-occ")];
    return {
      first: (document.querySelector("#albRoot > section.card") || {}).id,
      chips: chips.length,
      sketches: document.querySelectorAll("#albOccs canvas.alb-plan").length,
      named: chips.every(c => (c.textContent || "").trim().length > 1),
      titled: chips.every(c => (c.getAttribute("title") || "").length > 4),
      on: document.querySelectorAll("#albOccs .alb-occ.on").length,
      make: (document.getElementById("albMake") || {}).textContent || "",
      note: (document.getElementById("albOccNote") || {}).textContent || ""
    };
  });
  report("C1) the occasion card opens the page — nine chips, each drawing its own plan and naming its occasion, exactly one already chosen, and \"Make the whole album\" under them",
    card.first === "albOccCard" && card.chips === 9 && card.sketches === 9 &&
    card.named && card.titled && card.on === 1 && card.make.length > 3 && card.note.length > 10, card);

  /* C2 — picking one moves the type, the size and the ink together. */
  const picked = await page.evaluate(async () => {
    const d0 = ALBUM.doc();
    document.getElementById("albOcc_newborn").click();
    await new Promise(r => setTimeout(r, 250));
    const d = ALBUM.doc();
    return { was: { pair: d0.pair, size: d0.sizeId }, pair: d.pair, size: d.sizeId, occ: d.occ,
             on: !!document.querySelector("#albOcc_newborn.on"),
             note: (document.getElementById("albOccNote") || {}).textContent || "" };
  });
  report("C2) one tap sets the three decisions together — the pairing, the print size and the occasion — and the note states them back",
    picked.occ === "newborn" && picked.pair === "quiet" && picked.size === "10x10" && picked.on &&
    picked.note.length > 10, picked);

  /* C3 — the words the student does not have to type, in their own language. */
  const words = await page.evaluate(async () => {
    await ALBUM.accept([window.__albMade(800, 1200, "#3a2a2a", 0.35)]);
    await new Promise(r => setTimeout(r, 400));
    return { texts: (ALBUM.doc().pages[0].texts || []).map(t => t.role) };
  });
  report("C3) adding one photograph to the open page still adds only a photograph — the occasion's starter words belong to \"Make the whole album\", not to every pick",
    words.texts.length === 0, words);

  /* C4 — the whole album, laid out. */
  const album = await page.evaluate(async () => {
    const srcs = [];
    for (let i = 0; i < 28; i++) srcs.push(window.__albMade(i % 3 ? 900 : 600, i % 3 ? 600 : 900, "#2a3a5a", 0.3));
    window.confirm = () => true;
    await ALBUM.accept(srcs, "album");   /* the API path; C7 drives the real overlay */
    await new Promise(r => setTimeout(r, 2500));
    const d = ALBUM.doc();
    return {
      pages: d.pages.length,
      counts: d.pages.map(p => p.photos.length),
      total: d.pages.reduce((n, p) => n + p.photos.length, 0),
      opener: (d.pages[0].texts || []).map(t => ({ role: t.role, len: (t.text || "").length, ink: t.color })),
      occ: d.occ, pair: d.pair, size: d.sizeId,
      rail: document.querySelectorAll("#albPages .alb-page").length ||
            document.querySelectorAll("[id^=albThumb_]").length
    };
  });
  report("C4) twenty-eight photographs become a whole album — every photograph placed, no page over six, the opener carrying the occasion's three lines in its ink, and a thumbnail rail for every page",
    album.total === 28 && album.pages >= 6 && album.counts.every(n => n >= 1 && n <= 6) &&
    album.counts[0] === 1 && album.opener.length === 3 &&
    album.opener.every(t => t.len > 0 && t.ink === "#6b6b73") &&
    album.occ === "newborn" && album.rail === album.pages, album);

  /* C5 — the orphan rule, and the arithmetic, driven directly. */
  const maths = await page.evaluate(() => {
    const M = ALBUM.math;
    const out = {};
    (window.HNK_ALBUM.occasions || []).forEach(o => {
      out[o.id] = {};
      [1, 2, 4, 7, 13, 28, 40].forEach(n => {
        const p = M.planPages(n, o.plan);
        out[o.id][n] = { sum: p.reduce((a, b) => a + b, 0), pages: p.length,
                         first: p[0], last: p[p.length - 1], max: Math.max.apply(null, p) };
      });
    });
    out.__zero = M.planPages(0, [2, 3]).length;
    out.__noPlan = M.planPages(5, []).reduce((a, b) => a + b, 0);
    return out;
  });
  const ids = Object.keys(maths).filter(k => k.indexOf("__") !== 0);
  const bad = [];
  ids.forEach(id => Object.keys(maths[id]).forEach(n => {
    const r = maths[id][n];
    if (r.sum !== Number(n)) bad.push(id + "/" + n + " sums to " + r.sum);
    if (r.first !== 1) bad.push(id + "/" + n + " does not open on one");
    if (r.max > 6) bad.push(id + "/" + n + " has a page of " + r.max);
    if (Number(n) > 2 && r.pages > 2 && r.last === 1) bad.push(id + "/" + n + " ends on an orphan");
  }));
  report("C5) planPages is arithmetic, not luck — for every occasion at 1, 2, 4, 7, 13, 28 and 40 photographs it places every one, opens on a single page for the words, never exceeds six, and never ends on a lone orphan; nought photographs make nought pages and a missing plan still works",
    bad.length === 0 && maths.__zero === 0 && maths.__noPlan === 5, { bad: bad.slice(0, 8), zero: maths.__zero, noPlan: maths.__noPlan });

  /* C6 — THE ANCHOR THAT READ THE WRONG PAGE. */
  const anchors = await page.evaluate(() => {
    const d = ALBUM.doc(), M = ALBUM.math;
    const sz = M.sizeById(d.sizeId), safe = M.safeArea(sz);
    const wrong = [];
    d.pages.forEach((pg, i) => {
      if (!pg.photos.length) return;
      const n = Math.min(pg.photos.length, 6);
      const mine = M.autoTemplate(pg.photos.map(p => ({ w: p.w, h: p.h })), i);
      const tpl = (mine && mine.tpl) || M.tplsFor(n)[0];
      const rects = M.cellRects(tpl, safe);
      pg.photos.forEach((ph, k) => {
        if (!rects[k]) return;
        const want = M.anchorFor(ph.subject, ph.w, ph.h, rects[k].w, rects[k].h);
        if (Math.abs(want.x - ph.anchor.x) > 1e-6 || Math.abs(want.y - ph.anchor.y) > 1e-6) {
          wrong.push("page " + i + " photo " + k);
        }
      });
    });
    return { pages: d.pages.length, wrong: wrong.slice(0, 6), wrongCount: wrong.length };
  });
  report("C6) every page of a freshly laid-out album is cropped for ITS OWN template — reAnchor used to score every page against the OPEN page's layout, which on a one-page album showed nothing and on a fifteen-page album cropped fourteen of them wrong",
    anchors.wrongCount === 0 && anchors.pages >= 6, anchors);

  /* C7 — THE MODE THAT COULD NOT TRAVEL: through the phone's real overlay. */
  const viaOverlay = await page.evaluate(async () => {
    const wrap = document.getElementById("albMake").parentNode;
    const inp = wrap.querySelector("input.npick");
    if (!inp) return { err: "no overlay input over the Make button" };
    window.confirm = () => true;
    const before = ALBUM.doc().pages.length;
    /* the overlay's own onchange, exactly as the phone fires it */
    const files = [];
    for (let i = 0; i < 9; i++) {
      const blob = await (await fetch(window.__albMade(600, 900, "#2a3a5a", 0.3))).blob();
      files.push(new File([blob], "p" + i + ".jpg", { type: "image/jpeg" }));
    }
    Object.defineProperty(inp, "files", { value: files, configurable: true });
    inp.onchange.call(inp);
    await new Promise(r => setTimeout(r, 2000));
    const d = ALBUM.doc();
    return { before, pages: d.pages.length, total: d.pages.reduce((n, p) => n + p.photos.length, 0),
             opener: (d.pages[0].texts || []).length };
  });
  report("C7) the phone's own file overlay carries the mode — driving the input laid OVER \"Make the whole album\" (which swallows the button's click) lays out a whole album, not one page of photographs",
    !viaOverlay.err && viaOverlay.pages >= 3 && viaOverlay.total === 9 && viaOverlay.opener === 3, viaOverlay);

  /* C8 — the ceiling is stated and honoured. */
  const cap = await page.evaluate(async () => {
    const MAX = window.HNK_ALBUM.maxAlbum;
    const srcs = [];
    for (let i = 0; i < MAX + 5; i++) srcs.push(window.__albMade(400, 600, "#404050", 0.4));
    window.confirm = () => true;
    await ALBUM.accept(srcs, "album");
    await new Promise(r => setTimeout(r, 6000));
    const d = ALBUM.doc();
    return { MAX, total: d.pages.reduce((n, p) => n + p.photos.length, 0), pages: d.pages.length };
  });
  report("C8) more photographs than one album may hold takes the first forty and says so, rather than writing a record the student's phone cannot store",
    cap.total === cap.MAX && cap.pages >= 8, cap);

  /* C9 — a saved album survives an occasion this build no longer ships. */
  const restored = await page.evaluate(async () => {
    const d = ALBUM.doc();
    d.occ = "no-such-occasion";
    ALBUM.setDoc(d);
    await new Promise(r => setTimeout(r, 300));
    return { occ: ALBUM.doc().occ, on: document.querySelectorAll("#albOccs .alb-occ.on").length,
             cards: document.querySelectorAll("#albRoot > section.card").length };
  });
  report("C9) an album saved against an occasion this build no longer ships falls back to the default and still draws — the same rule wave A gave sizes and wave B gave pairings",
    restored.occ === ALBUM.defOcc && restored.on === 1 && restored.cards === 8, restored);

  /* C10 — the chips must not pull a typeface down. Wave B's whole point.
     A FRESH CONTEXT, not just a fresh page: the walk above saved a forty-photograph album with
     the occasion's words on its opener, and an album that carries words is supposed to load the
     faces those words are set in. What must fetch nothing is the page with no album in it. */
  const cleanCtx = await browser.newContext({ viewport: { width: 430, height: 930 } });
  const fresh = await cleanCtx.newPage();
  const freshFonts = [];
  fresh.on("request", r => { if (/\.woff2(\?|$)/.test(r.url())) freshFonts.push(r.url()); });
  await fresh.goto(BASE + "/index.html?page=pgAlbum", { waitUntil: "load" });
  await fresh.waitForTimeout(1800);
  report("C10) opening the Album page still fetches NO typeface — the occasion chips name their occasions in the studio's own face, because a chip that used the album's would pull a woff2 down on a page that has not asked for one",
    freshFonts.length === 0, freshFonts);

  report("C11) nothing threw anywhere in the walk", errs.length === 0, errs.slice(0, 4));
  await browser.close();
}

/* ===================== D) the release ===================== */
/* the module's CODE, with its block comments taken out — the comments name occasions while
   explaining what they differ by, and prose is not a hard-coded id. */
function occasionIdInCode() {
  const mod = APP.slice(APP.indexOf("/* ---- ALBUM_MODULE ---- */"),
                        APP.indexOf("/* ---- /ALBUM_MODULE ---- */"))
                 .replace(/\/\*[\s\S]*?\*\//g, " ");
  const ids = (ALBUM.occasions || []).map(o => o.id);
  return ids.filter(id => new RegExp('["\']' + id + '["\']').test(mod));
}

function release() {
  const app = (APP.match(/var APP_VER\s*=\s*"([\d.]+)"/) || [])[1];
  report("D1) the web app and the panel move together",
    app === "6.105.0" && MANIFEST.version === "6.176.0", { app, panel: MANIFEST.version });

  const n = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []).size;
  const badge = Number((LANDING.match(/"badge\.tests":\s*\{"my":\s*"(\d+) tests green/) || [])[1] || 0);
  report("D2) CI runs this file, and the landing site states the true number of tests",
    /node test\/verify_album_occasions\.js/.test(CI) && n === badge && n >= 247, { ciTests: n, badge });

  report("D3) the album module reaches every occasion through the data table — the page can only offer what data/album.js ships",
    /function occById\(id\)/.test(APP) && /function curOcc\(\)/.test(APP) &&
    /function planPages\(count, plan\)/.test(APP) && /function makeAlbum\(srcs\)/.test(APP) &&
    /function setOccasion\(id\)/.test(APP) && /function openerTexts\(o\)/.test(APP) &&
    occasionIdInCode().length === 0, occasionIdInCode());

  report("D4) reAnchor takes the page's own index, and onDocChange hands it over for every page",
    /function reAnchor\(pg, idx\)/.test(APP) &&
    /reAnchor\(DOC\.pages\[i\], i\)/.test(APP) && /reAnchor\(curPage\(\), DOC\.cur\)/.test(APP), null);
}

(async () => {
  generator();
  tables();
  await browserWalk();
  release();
  console.log(failures === 0 ? "\nALL PASS — the Album page's occasions, and the whole album" : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("FAIL — harness :: " + (e && e.stack || e)); process.exit(1); });
