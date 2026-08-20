/* v4.96.0 regression sweep — Meitu and Evoto are two pages, and the photo
   survives the trip between them.

   WHAT THE OWNER ASKED FOR, AND WHAT WAS MEASURED INSTEAD. He asked repeatedly
   for the two suites to be split into pages. They were not. Both #muHost and
   #evHost were display:block at the same moment, and the MEITU/EVOTO chips
   called scrollIntoView and nothing else — they never switched suite and never
   marked which one you were in. One page carried 34 accordions and 253 sliders,
   4395px tall on a 390px phone: 5.2 screens of scrolling to reach a slider.

   THE DESIGN DECISION THIS SWEEP EXISTS TO PROTECT. Only the suite CARD is
   per-page. The photo picker, the live-preview canvas, the zoom rail, the jump
   bar, recipes, the result box, export and the generate bar all live ONCE, in
   #stCols, and are MOVED between the pages with appendChild — which relocates a
   node while preserving its listeners and its canvas bitmap. Copying the markup
   would have cloned ~40 ids and re-run the preview init, dropping the customer's
   photo on every suite switch. E and F are the two halves of that: exactly one
   of each shared node exists, and a photo loaded on Meitu is still on screen
   after switching to Evoto. If someone later "simplifies" this by duplicating
   the markup, F is what fails.

   AND TWO ASSERTIONS PIN MISTAKES THIS CHANGE ACTUALLY MADE.

   L — the CSS specificity trap. 27 rules were scoped to #pgStudio. Rewriting
   them to a .stpg class looked tidier and dropped the slider track from 200px+
   to 112px, because an id scores 100 and a class scores 10, so rules that had
   been losing started winning. sweep_v463 caught it within a minute. The fix was
   to expand every selector to all three ids rather than reach for a class, and L
   measures the outcome on BOTH new pages so the tidier-looking version cannot
   come back.

   H — the returning customer. Boot validates the saved page id against PAGES.
   With pgStudio gone from that list, every existing Studio user would have
   opened the app on Home and lost their place. stNormalizePage() resolves the
   legacy id everywhere it can still appear: the saved page, the v4.27 group
   seed, the deep link and switchPage itself.

   Usage: PORT=8931 node test/sweep_v496_studiosplit.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* Measured on the build this release replaced, at 360/390/412. Stated as the
   thing to beat rather than as a vague "smaller".
   `sliders` is the union that must SURVIVE the split — it tracks the suite as
   controls are added (v5.9 added five: mu_nailV, mu_petFur, mu_petEye,
   ev_glowV, ev_edgeFringe), so bump it whenever a slider ships, never to
   paper over one that went missing. */
const BEFORE = { h390: 4395, groups: 34, sliders: 258 };

/* ---- A) both pages are first-class ---- */
report("A) pgMeitu and pgEvoto are registered pages and pgStudio is not",
  /\["pgMeitu","i-makeup"/.test(src) && /\["pgEvoto","i-target"/.test(src) &&
  !/\["pgStudio",/.test(src),
  { meitu: /\["pgMeitu"/.test(src), evoto: /\["pgEvoto"/.test(src), studio: /\["pgStudio",/.test(src) });

report("A2) both sit in the Edit group, beside the other photo pages",
  /pages:\["pgCreate","pgMeitu","pgEvoto","pgRetouch","pgPath"\]/.test(src));

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);

  /* ---- H) the legacy id, from a cold boot ----
     Done first and in its own context: it is about what a RETURNING customer
     sees on launch, so it must not be polluted by navigation this test did. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
      localStorage.setItem("hnk_web_studio_page", "pgStudio");  /* saved by an older build */
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    const landed = await page.evaluate(() => curPage);
    report("H) a customer whose saved page is the old pgStudio still lands in a suite, not on Home",
      landed === "pgMeitu" || landed === "pgEvoto", { landed: landed });
    await ctx.close();
  }

  /* hasTouch/isMobile, like sweep_v463. The v4.63 slider layout lives inside
     `@media (pointer:coarse)`, so a default mouse context renders the OLD
     one-line row and reads 120px — which looks exactly like the specificity
     regression this file is meant to catch. Measuring the phone rule requires
     being a phone. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_ws_lang", "my");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  const look = (pg) => page.evaluate((pg) => {
    switchPage(pg);
    return new Promise(res => setTimeout(() => {
      const el = document.getElementById(pg);
      const has = id => { const e = document.getElementById(id); return !!e && el.contains(e); };
      const dock = document.getElementById("stDock");
      const inDock = id => { const e = document.getElementById(id); return !!e && dock.contains(e); };
      res({
        h: Math.round(el.scrollHeight),
        groups: el.querySelectorAll(".grp").length,
        sliders: el.querySelectorAll("input[type=range]").length,
        mu: has("stMuCard"), ev: has("stEvCard"),
        muDocked: inDock("stMuCard"), evDocked: inDock("stEvCard"),
        cols: has("stCols"), canvas: has("stCanvas"), genbar: has("stGenBar"),
        heroBurmese: /[က-႟]/.test((el.querySelector(".ph-head") || {}).textContent || ""),
        chipOn: [...document.querySelectorAll("#stSuiteTabs .chip")]
          .filter(c => /\bon\b/.test(c.className)).map(c => c.textContent.trim()),
        /* the exact measurement the .stpg experiment broke. The accordions ship
           collapsed, so a slider inside one measures 0 — open the first group
           before reading, or this asserts nothing at all. */
        track: (function () {
          const g = el.querySelector(".grp"); if (g) g.className = "grp open";
          const r = el.querySelector(".st-ctl.st-slider .rng");
          return r ? Math.round(r.getBoundingClientRect().width) : -1;
        })()
      });
    }, 1100));
  }, pg);

  const M = await look("pgMeitu");
  const E = await look("pgEvoto");

  /* ---- B) one suite per page, the other parked ---- */
  report("B) Meitu shows only the Meitu card, and Evoto's is parked in the dock",
    M.mu === true && M.ev === false && M.evDocked === true, M);
  report("B2) Evoto shows only the Evoto card, and Meitu's is parked in the dock",
    E.ev === true && E.mu === false && E.muDocked === true, E);

  /* ---- C/D) the scrolling this release exists to cut ---- */
  report("C) each page is materially shorter than the one page that held both",
    M.h < BEFORE.h390 * 0.8 && E.h < BEFORE.h390 * 0.8,
    { before: BEFORE.h390, meitu: M.h, evoto: E.h,
      screensBefore: +(BEFORE.h390 / 844).toFixed(1),
      screensAfter: [+(M.h / 844).toFixed(1), +(E.h / 844).toFixed(1)] });

  report("D) the accordion pile is halved — each page carries its own suite only",
    M.groups + E.groups === BEFORE.groups && M.groups > 0 && E.groups > 0,
    { before: BEFORE.groups, meitu: M.groups, evoto: E.groups });

  /* Naive addition gives 254, not 253, and that is CORRECT: one slider lives in
     the shared block and so is legitimately on both pages. Summing would have
     been a wrong assertion dressed as a strict one. Count the union of ids. */
  const union = await page.evaluate(async () => {
    const ids = new Set(); let shared = 0;
    for (const pg of ["pgMeitu", "pgEvoto"]) {
      switchPage(pg);
      await new Promise(r => setTimeout(r, 900));
      document.getElementById(pg).querySelectorAll("input[type=range]")
        .forEach(r => { if (ids.has(r.id)) shared++; ids.add(r.id); });
    }
    return { n: ids.size, shared: shared };
  });
  report("D2) every slider survives the split — the union across both pages is unchanged",
    union.n === BEFORE.sliders,
    { before: BEFORE.sliders, union: union.n, onBothPages: union.shared,
      meitu: M.sliders, evoto: E.sliders });

  /* ---- E) shared, not duplicated ---- */
  const dup = await page.evaluate(() => ["stCols", "stCanvas", "stGenBar", "stJumpBar", "stResultBox"]
    .map(id => ({ id: id, n: document.querySelectorAll("#" + id).length })));
  report("E) the shared stage exists exactly once — it is moved between pages, not copied",
    dup.every(d => d.n === 1) && M.cols && E.cols && M.canvas && E.canvas && M.genbar && E.genbar, dup);

  /* ---- F) THE PROMISE THAT MOVING BUYS ----
     appendChild relocates a live node. If anyone rebuilds the markup per page
     instead, the canvas is re-created and this is the assertion that notices. */
  const carried = await page.evaluate(async () => {
    switchPage("pgMeitu");
    await new Promise(r => setTimeout(r, 700));
    const c = document.createElement("canvas"); c.width = 48; c.height = 48;
    const x = c.getContext("2d");
    x.fillStyle = "#e0ac8c"; x.fillRect(0, 0, 48, 48);
    x.fillStyle = "#404060"; x.fillRect(10, 10, 28, 28);
    await new Promise(res => { ST.loadImage(c.toDataURL("image/png"), { done: res }); });
    await new Promise(r => setTimeout(r, 500));
    const shot = () => {
      const cv = document.getElementById("stCanvas");
      const g = cv.getContext("2d");
      const d = g.getImageData(0, 0, Math.min(64, cv.width), Math.min(64, cv.height)).data;
      let mn = 255, mx = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); sum += d[i]; }
      return { spread: mx - mn, mean: Math.round(sum / (d.length / 4)), url: cv.toDataURL().length };
    };
    const px0 = shot();
    const before = px0.url;
    const stageBefore = document.getElementById("stStage").style.display;
    switchPage("pgEvoto");
    await new Promise(r => setTimeout(r, 900));
    const cv = document.getElementById("stCanvas");
    const px1 = shot();
    return {
      before: before, after: cv ? cv.toDataURL().length : 0,
      spreadBefore: px0.spread, spreadAfter: px1.spread,
      meanBefore: px0.mean, meanAfter: px1.mean,
      sameNode: !!cv && document.getElementById("pgEvoto").contains(cv),
      stageBefore: stageBefore, stageAfter: document.getElementById("stStage").style.display,
      srcStillLoaded: !!(window.ST && ST.srcBitmap)
    };
  });
  report("F) a photo loaded on Meitu is still loaded, and still drawn, after switching to Evoto",
    carried.srcStillLoaded === true && carried.sameNode === true &&
    carried.spreadBefore > 20 && carried.spreadAfter === carried.spreadBefore &&
    carried.meanAfter === carried.meanBefore && carried.after === carried.before, carried);

  /* ---- G) the chip finally answers "which suite am I in" ---- */
  report("G) exactly one suite chip is marked active, and it is the page you are on",
    M.chipOn.length === 1 && /MEITU/.test(M.chipOn[0]) &&
    E.chipOn.length === 1 && /EVOTO/.test(E.chipOn[0]),
    { onMeitu: M.chipOn, onEvoto: E.chipOn });

  /* ---- L) the specificity guard ---- */
  report("L) the slider track keeps its full width on BOTH pages — the id-scoped CSS still applies",
    M.track >= 200 && E.track >= 200,
    { meitu: M.track, evoto: E.track,
      note: "a .stpg class scored 10 against #pgStudio's 100 and collapsed this to 112px" });

  /* ---- I) the label that was being clipped ---- */
  const fits = [];
  for (const w of [360, 390, 412]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(500);
    fits.push(await page.evaluate((w) => {
      const g = document.getElementById("btnStGen");
      return { w: w, clipped: g.scrollWidth > g.clientWidth + 1, sw: g.scrollWidth, cw: g.clientWidth };
    }, w));
  }
  report("I) the generate button's empty-state label fits at every phone width",
    fits.every(f => !f.clipped), fits);
  await page.setViewportSize({ width: 390, height: 844 });

  /* ---- J) translated like every other page ---- */
  report("J) both heroes render Burmese in a Burmese UI", M.heroBurmese && E.heroBurmese,
    { meitu: M.heroBurmese, evoto: E.heroBurmese });

  const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
  const miss = ["ph_meitu", "ph_evoto"].map(k => {
    const found = new Set();
    (src.match(new RegExp(k + ":\\{[^}]*\\}", "g")) || []).forEach(b => {
      (b.match(/([a-z]{2,3}):/g) || []).forEach(m => found.add(m.slice(0, -1)));
    });
    return { key: k, missing: LANGS.filter(l => !found.has(l)) };
  }).filter(x => x.missing.length);
  report("J2) both hero strings exist in all nine languages", miss.length === 0, miss);

  /* ---- M) THE FOUR THINGS THE SPLIT LEFT BEHIND ----
     v4.96 moved the DOM but left four things still thinking there was one
     Studio page. All four were found by audit and all four were measured, not
     argued: none of them threw, so nothing in the suite noticed. */

  /* M1 — the jump bar carries all 34 groups on a page that holds 17 of them.
     Before the fix, on either page exactly 17 chips pointed at a card parked in
     #stDock, and tapping one did nothing at all — scrollIntoView on a node with
     no box is a no-op. Filtering the strip to 17 would have traded a dead tap
     for half the features being unreachable; the chip switches page instead. */
  const crossChip = await page.evaluate(async () => {
    switchPage("pgMeitu");
    await new Promise(r => setTimeout(r, 800));
    const g = (ST.groups || []).find(x => x.host === "ev");
    if (!g || !g.jumpChip) return { ok: false, why: "no evoto group chip" };
    g.jumpChip.click();
    await new Promise(r => setTimeout(r, 700));
    return { ok: true, landed: curPage, visible: document.getElementById(curPage).contains(g.el) };
  });
  report("M1) a jump chip for the other suite takes you there instead of doing nothing",
    crossChip.ok && crossChip.landed === "pgEvoto" && crossChip.visible === true, crossChip);

  /* M2 — the search index spans both suites but only one is on screen, so a
     term living entirely in the parked suite looked like a search that found
     nothing. */
  const crossSearch = await page.evaluate(async () => {
    switchPage("pgEvoto");
    await new Promise(r => setTimeout(r, 800));
    const g = (ST.groups || []).find(x => x.host === "mu");
    const term = (g.title || "").trim().toLowerCase().slice(0, 6);
    const inp = document.getElementById("stSearch");
    inp.value = term; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    const landed = curPage;
    inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return { term: term, landed: landed, visible: document.getElementById(landed).contains(g.el) };
  });
  report("M2) searching a term that only exists in the parked suite goes to it",
    crossSearch.landed === "pgMeitu" && crossSearch.visible === true, crossSearch);

  /* M3 — the look-shelf art observer armed on stActivePage() ONCE at load, which
     is pgMeitu until told otherwise. A studio whose first Studio visit was Evoto
     watched a page that never appeared: the art never woke and the shelf stayed
     on computed tiles for the whole session. */
  const viaEvoto = await (async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await c.newPage();
    await pp.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1");
    });
    await pp.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await pp.waitForTimeout(2500);
    const r = await pp.evaluate(async () => {
      switchPage("pgEvoto");
      await new Promise(r => setTimeout(r, 1500));
      return { page: curPage, artOn: typeof _stArtOn !== "undefined" ? _stArtOn : null };
    });
    await c.close();
    return r;
  })();
  report("M3) entering Studio via Evoto FIRST still wakes the look art",
    viaEvoto.artOn === true && viaEvoto.page === "pgEvoto", viaEvoto);

  /* M4 — v4.96's own comment claimed stNormalizePage covered "the saved page,
     the group seed, the deep link and switchPage alike". The deep-link guard
     tested the RAW id against PAGES, so every bookmarked ?page=pgStudio was
     silently dropped. H covers the saved page; this covers the link. */
  const viaLink = await (async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await c.newPage();
    await pp.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1");
    });
    await pp.goto(`http://127.0.0.1:${PORT}/index.html?page=pgStudio`, { waitUntil: "domcontentloaded" });
    await pp.waitForTimeout(2500);
    const r = await pp.evaluate(() => curPage);
    await c.close();
    return r;
  })();
  report("M4) a bookmarked ?page=pgStudio link still opens a suite",
    viaLink === "pgMeitu" || viaLink === "pgEvoto", { landed: viaLink });

  /* ---- N) THUMB ERGONOMICS ON THE TWO SUITE PAGES ----
     Counted with all seventeen groups open: 34 jump chips at 34px, 2 suite tabs
     at 40px and 50 look-tile pins at 24x24 — 86 targets under the 44px floor
     this repo has held since v4.63. None of them was RESIZED: the jump bar
     already takes 94px of an 844px viewport and the pin sits in the corner of a
     76px tile, so growing either costs more than it buys. The hit area is
     expanded with a centred ::after, the same technique v4.63 used on .st-val —
     which is why 99 readouts measure 24px and are still comfortable to hit.
     This measures the EFFECTIVE hit box, so it cannot be satisfied by making
     things visually bigger, and cannot be broken by making them visually
     smaller as long as the hit area survives. */
  for (const pg of ["pgMeitu", "pgEvoto"]) {
    const erg = await page.evaluate(async (id) => {
      switchPage(id);
      await new Promise(r => setTimeout(r, 900));
      document.querySelectorAll("#" + id + " .grp-h").forEach(h => h.click());
      await new Promise(r => setTimeout(r, 700));
      const hit = e => {
        const r = e.getBoundingClientRect();
        const a = getComputedStyle(e, "::after");
        const ah = parseFloat(a.height);
        return Math.max(r.height, (a.content !== "none" && !isNaN(ah)) ? ah : 0);
      };
      const grab = sel => [...document.querySelectorAll(sel)]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const out = {};
      [["jumpChips", "#stGroupChips .chip"], ["suiteTabs", "#stSuiteTabs .chip"],
       ["pins", "#" + id + " .pin"]].forEach(([k, sel]) => {
        const els = grab(sel);
        out[k] = { n: els.length, under: els.filter(e => hit(e) < 43.5).length };
      });
      return out;
    }, pg);
    report("N) " + pg + ": every jump chip, suite tab and pin has a 44px hit area",
      erg.jumpChips.n > 0 && erg.jumpChips.under === 0 &&
      erg.suiteTabs.n === 2 && erg.suiteTabs.under === 0 &&
      erg.pins.n > 0 && erg.pins.under === 0, erg);
  }

  /* N2 — the gold phrase in a hero paints with -webkit-text-fill-color:transparent,
     so a text-shadow has no glyph to fall from: the ONE phrase the banner exists
     to emphasise was the only text on it with no separation from the photograph
     behind. drop-shadow filters the painted gradient instead. */
  const heroEm = await page.evaluate(() => {
    const out = {};
    ["pgMeitu", "pgEvoto"].forEach(id => {
      const em = document.querySelector("#" + id + " .ph-head em");
      out[id] = em ? { fill: getComputedStyle(em).webkitTextFillColor,
                       filter: getComputedStyle(em).filter } : null;
    });
    return out;
  });
  report("N2) the gradient-filled hero phrase carries a drop-shadow, since a text-shadow cannot",
    Object.keys(heroEm).every(k => heroEm[k] && /drop-shadow/.test(heroEm[k].filter)), heroEm);

  /* N3 — with no photo the generate bar wore the same gold as the dropzone and
     said the same thing. Two primaries means neither is primary. */
  /* In its OWN context. Assertion F loads a photo to prove the canvas survives
     the suite switch, so by the time this runs there IS a photo and gold is the
     correct styling — the first cut of this check asserted the empty state on a
     page that was no longer empty and failed against a working app. */
  const twoPrimaries = await (async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await c.newPage();
    await pp.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1");
    });
    await pp.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await pp.waitForTimeout(2500);
    const r = await pp.evaluate(async () => {
      switchPage("pgMeitu");
      await new Promise(r => setTimeout(r, 900));
      const g = document.getElementById("btnStGen");
      return { photo: !!(window.ST && ST.srcBitmap), empty: g.classList.contains("is-empty"),
               bg: getComputedStyle(g).backgroundImage + "|" + getComputedStyle(g).backgroundColor };
    });
    await c.close();
    return r;
  })();
  report("N3) with no photo the generate button steps back so the dropzone is the one call",
    twoPrimaries.photo === false && twoPrimaries.empty === true &&
    /rgba\(0, 0, 0, 0\)|transparent/.test(twoPrimaries.bg),
    twoPrimaries);

  report("K) no page errors", errs.length === 0, errs);
  report("K2) nothing 404s", bad.length === 0, bad.slice(0, 6));

  console.log("      (4395px and 34 accordions on one page became " + M.h + "px/" + M.groups +
    " and " + E.h + "px/" + E.groups + " on two, and the photo survives the switch)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
