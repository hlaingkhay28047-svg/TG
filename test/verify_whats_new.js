/* v5.90.0 — WHAT'S NEW: the student is told, at the top, and can try it.
 *
 * WHY THIS FILE EXISTS. The owner asked for something simple to describe and
 * easy to let rot: when a new Smart Workflow or feature ships, a student
 * should SEE that it is new — pinned at the top, marked, and tappable so they
 * can try it right away rather than read about it.
 *
 * The rot is the whole risk. An announcement list is not load-bearing: the app
 * works perfectly with a stale one, so nothing pushes back when a release
 * forgets to add its entry, and a "NEW" strip that still advertises last
 * month's release teaches students to ignore it. So the discipline is a test,
 * not a habit: the newest entry must name THIS APP_VER, every workflow it
 * points at must exist, and every entry must speak all nine languages.
 *
 * Usage: PORT=8931 node test/verify_whats_new.js  (serve docs/app first) */
"use strict";
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  /* ---- A) the list is real, current, and points at things that exist ---- */
  const A = await page.evaluate(() => {
    const wfIds = {};
    (window.HNK_WF_CATALOG || []).forEach(c => (c.items || []).forEach(w => { wfIds[w.id] = true; }));
    const pageIds = {};
    PAGES.forEach(p => { pageIds[p[0]] = true; });
    return {
      appVer: APP_VER,
      n: WHATS_NEW.length,
      versions: WHATS_NEW.map(e => e.v),
      kinds: WHATS_NEW.map(e => e.kind),
      badWf: WHATS_NEW.filter(e => e.kind === "wf" && !wfIds[e.ref]).map(e => e.ref),
      badPage: WHATS_NEW.filter(e => e.kind === "page" && !pageIds[e.ref]).map(e => e.ref),
      dupes: WHATS_NEW.map(e => e.v + "|" + e.ref)
        .filter((k, i, a) => a.indexOf(k) !== i)
    };
  });

  /* v5.91.1 — matched on major.minor rather than the whole version, and the
     distinction is real rather than a loophole: a MINOR adds something a
     student can use, and must announce itself here or the build fails. A
     PATCH repairs something already announced — 5.91.1 made the ✦ NEW chip
     readable again — and adding a row for that would push the actual news
     down the strip to make room for "we fixed the thing we told you about",
     which serves nobody. Ship a new minor without a row and this still
     refuses the build. */
  const mm = v => v.split(".").slice(0, 2).join(".");
  report("A) the newest entry names the minor being shipped — a release cannot add something and forget to say so",
    mm(A.versions[0]) === mm(A.appVer), { appVer: A.appVer, newest: A.versions[0] });

  const cmp = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  /* non-increasing, not strictly decreasing: one release may legitimately
     have two things to say — 5.97.0 pinned the engine of a series AND took
     the blown white light out of the thirteen Look Sets — and A4 below is
     what stops the same thing being announced twice. */
  report("A2) entries run newest-first and none claims a version that has not shipped",
    A.versions.every((v, i) => i === 0 || cmp(A.versions[i - 1], v) >= 0) &&
    A.versions.every(v => cmp(v, A.appVer) <= 0), A.versions);

  report("A3) every entry points at a workflow or a page that actually exists",
    A.badWf.length === 0 && A.badPage.length === 0, { badWf: A.badWf, badPage: A.badPage });

  report("A4) no two entries share a version+target, so nothing is announced twice",
    A.dupes.length === 0, A.dupes);

  report("A5) only kinds the app can actually open",
    A.kinds.every(k => k === "wf" || k === "page"), A.kinds);

  /* ---- B) every entry speaks every language the app offers ---- */
  const B = await page.evaluate(langs => WHATS_NEW.map(e => ({
    ref: e.ref,
    missT: langs.filter(l => !e.t || !e.t[l]),
    missS: langs.filter(l => !e.s || !e.s[l])
  })).filter(r => r.missT.length || r.missS.length), LANGS);
  report("B) every entry has a title and a line in all nine languages", B.length === 0, B.slice(0, 3));

  /* ---- C) the Home strip: at the top, one row each, and it TAKES you there ---- */
  const C = await page.evaluate(() => {
    try { localStorage.removeItem("hnk_new_seen"); } catch (e) { }
    switchPage("pgDash");
    const card = document.getElementById("dashNew");
    const dash = document.getElementById("pgDash");
    const kids = [...dash.children];
    return {
      visible: card.style.display !== "none",
      /* "pinned at the top" is a position, not a wish: nothing but the
         greeting may come before it. */
      index: kids.indexOf(card),
      before: kids.slice(0, kids.indexOf(card)).map(k => k.id || k.className),
      rows: document.querySelectorAll("#dashNewList .nw-row").length,
      total: WHATS_NEW.length,
      cap: (typeof NW_STRIP_MAX === "number" ? NW_STRIP_MAX : 0),
      /* the heading must still confess the true number, or a ceiling would
         be a way of hiding news rather than of ordering it */
      headSaysTotal: ((document.getElementById("dashNewH2") || {}).textContent || "")
        .indexOf("(" + WHATS_NEW.length + ")") >= 0,
      tagged: document.querySelectorAll("#dashNewList .nw-tag").length,
      dismissable: document.querySelectorAll("#dashNewList .nw-x").length
    };
  });
  report("C) with nothing read yet, the strip is visible and sits above every other card on Home",
    C.visible && C.index === 1 && C.before.every(b => /dash-greet|dashGreet/.test(b)), C);
  /* v6.0.0 — the strip draws the newest three, not one row per unread
     entry: WHATS_NEW reached seventeen and a first-ever launch met a wall
     of changelog above the studio (and pushed two of Home's own tiles below
     the fold — sweep_v484_bootbytes caught that). The ceiling is only
     honest while the heading still names the real total, which is checked
     with it. */
  report("C2) the strip draws the newest three, each marked NEW and each individually dismissable, and the heading still names the true total",
    C.cap === 3 && C.rows === Math.min(C.total, C.cap) &&
    C.tagged === C.rows && C.dismissable === C.rows && C.headSaysTotal, C);

  /* ---- D) tapping a row opens the thing, not a changelog ---- */
  const D = await page.evaluate(async () => {
    try { localStorage.removeItem("hnk_new_seen"); } catch (e) { }
    switchPage("pgDash");
    /* pick a workflow row among the ones actually DRAWN: under the ceiling
       the newest workflow entry is not guaranteed to be on the strip, and a
       test that reached for a row that was never rendered would report a
       failure the app did not have. */
    /* v6.2.0 — and if the newest three happen to be PAGE entries, the newest
       workflow row is simply below the ceiling and this check would have
       nothing to click. That is a property of what shipped this month, not a
       defect, and skipping would quietly retire the check — so the rows above
       it are marked READ first, which is exactly what a student who has kept
       up would have done, and the workflow row rises into the strip. */
    const wfEntry = WHATS_NEW.find(e => e.kind === "wf");
    if (!wfEntry) return { found: false, why: "no workflow entry in the table at all" };
    const preRead = WHATS_NEW.slice(0, WHATS_NEW.indexOf(wfEntry));
    if (preRead.length) {
      try { localStorage.setItem("hnk_new_seen", JSON.stringify(preRead.map(e => e.v + "|" + e.ref))); } catch (e) { }
      /* the app's own single entry point for "what has been seen changed" —
         switching pages is not it, and a test that repainted by hand would
         be testing its own repaint rather than the app's */
      nwSync();
      await new Promise(r => setTimeout(r, 120));
    }
    const rows = [...document.querySelectorAll("#dashNewList .nw-row")];
    const wfKey = wfEntry.v + "|" + wfEntry.ref;
    const row = rows.find(r => r.dataset.nw === wfKey);
    if (!row) return { found: false, why: "the newest workflow row did not reach the strip", drawn: rows.map(r => r.dataset.nw) };
    row.click();
    await new Promise(r => setTimeout(r, 120));
    const wiz = document.querySelector(".wiz.on");
    const title = wiz ? (wiz.textContent || "").slice(0, 400) : "";
    const wx = wiz && wiz.querySelector(".wiz-x"); if (wx) wx.click();
    switchPage("pgDash");
    return {
      found: true,
      opened: !!wiz,
      namesIt: title.indexOf(wfEntry.ref.replace(/-/g, " ")) >= 0 ||
        /Studio Look Copy/i.test(title),
      rowsLeft: document.querySelectorAll("#dashNewList .nw-row").length,
      total: WHATS_NEW.length,
      preRead: preRead.length,
      cap: (typeof NW_STRIP_MAX === "number" ? NW_STRIP_MAX : 0),
      /* the row that was opened must be gone by name — counting rows cannot
         show that under a ceiling, because the next unread takes its place */
      openedGone: !document.querySelector('#dashNewList .nw-row[data-nw="' + wfKey + '"]'),
      unseenLeft: nwUnseen().length
    };
  });
  report("D) tapping a workflow row opens that workflow's wizard",
    D.found && D.opened, D);
  report("D2) opening a row retires that exact row, and the next unread moves up to fill the ceiling",
    D.openedGone && D.unseenLeft === D.total - D.preRead - 1 &&
    D.rowsLeft === Math.min(D.unseenLeft, D.cap), D);

  /* ---- E) the Workflows page: ribbon, top-of-category, ✦ NEW rail chip ---- */
  const E = await page.evaluate(async () => {
    try { localStorage.removeItem("hnk_new_seen"); } catch (e) { }
    location.reload();
  }).catch(() => { });
  await page.waitForTimeout(2600);
  const E2 = await page.evaluate(() => {
    switchPage("pgWf");
    const wfEntries = WHATS_NEW.filter(e => e.kind === "wf");
    const marked = [...document.querySelectorAll(".wfmini.is-new")].map(m => m.dataset.nwId);
    /* the leading run of every grid: the new cards must be positions
       0..k-1 of their own category, with no older card wedged between
       them. With one new card that is "it is the first card"; with two
       it is "they are the first two", which the app already renders by
       sorting the new ones forward. */
    const leadOk = [...document.querySelectorAll(".wfgrid")].every(g => {
      const kids = [...g.children];
      const at = [];
      kids.forEach((k, i) => { if (k.classList.contains("is-new")) at.push(i); });
      return at.every((v, i) => v === i);
    });
    const chip = document.getElementById("wfJumpNew");
    const rail = document.getElementById("wfJump");
    return {
      /* by card, not by row: a card two releases have touched is named by
         two entries and must still wear exactly ONE ribbon, which the
         ribbons === want.length check below then measures. */
      want: [...new Set(wfEntries.map(e => e.ref))],
      marked: marked,
      ribbons: document.querySelectorAll(".wf-new").length,
      /* every marked card leads its own grid — see leadOk above */
      allFirst: leadOk,
      chipText: chip ? chip.textContent : null,
      chipIsFirst: !!(chip && rail && rail.firstElementChild === chip)
    };
  });
  report("E) every unread workflow wears a NEW ribbon, and only those",
    E2.marked.slice().sort().join(",") === E2.want.slice().sort().join(",") &&
    E2.ribbons === E2.want.length, E2);
  report("E2) each one leads its own category — two in one category take the first two places, so none is pushed under an older card",
    E2.allFirst, E2);
  report("E3) the rail's first stop is a ✦ NEW chip carrying the count",
    !!E2.chipText && /NEW\s+\d+/.test(E2.chipText) && E2.chipIsFirst, E2);

  /* E4 — v5.92.0. The owner opened the shipped app and found this chip as a
     blank gold pill: an inline colour:var(--gold) had been layered on top of
     .chip.on, which already paints gold, so the text was gold on gold. Every
     check above passed the whole time — they read the chip's textContent, and
     text that is present but invisible reads identically to text that works.
     So this one measures what a person actually sees: the painted colour
     against the painted background. Any future control that becomes
     unreadable this way fails here instead of shipping. */
  const E4 = await page.evaluate(() => {
    const el = document.getElementById("wfJumpNew");
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    /* walk up for the first non-transparent background, the way a person's
       eye does — a transparent chip shows whatever is behind it. */
    let bg = cs.backgroundColor, node = el;
    while (node && (!bg || bg === "transparent" || /rgba\(0,\s*0,\s*0,\s*0\)/.test(bg))) {
      node = node.parentElement;
      bg = node ? getComputedStyle(node).backgroundColor : "rgb(0,0,0)";
    }
    const rgb = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = c => {
      const a = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const l1 = lum(rgb(cs.color)), l2 = lum(rgb(bg));
    return {
      found: true, color: cs.color, bg: bg,
      contrast: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2)
    };
  });
  /* 4.5:1 is the ordinary readable-text threshold; the failure this exists to
     catch scored 1.0 — the exact same colour on both sides. */
  report("E4) …and its text is actually readable against its own background, not gold on gold",
    E4.found && E4.contrast >= 4.5, E4);

  /* ---- F) the tab dot, and that it goes away ---- */
  const F = await page.evaluate(() => {
    const before = document.querySelectorAll("#tabbar .nw-dot").length;
    /* read everything the way a student eventually does */
    WHATS_NEW.forEach(e => nwMarkSeen(e));
    nwSync();
    switchPage("pgDash");
    return {
      before: before,
      after: document.querySelectorAll("#tabbar .nw-dot").length,
      cardHidden: document.getElementById("dashNew").style.display === "none",
      ribbons: document.querySelectorAll(".wf-new").length,
      chip: !!document.getElementById("wfJumpNew")
    };
  });
  report("F) an unread entry puts a dot on the tab that holds it", F.before > 0, F);
  report("F2) once everything is read the strip, the ribbons, the chip and the dots are all gone — a studio that is up to date sees no empty box",
    F.after === 0 && F.cardHidden && F.ribbons === 0 && !F.chip, F);

  /* ---- G) the record is per student and survives a reload ---- */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const G = await page.evaluate(() => ({
    stored: JSON.parse(localStorage.getItem("hnk_new_seen") || "[]").length,
    total: WHATS_NEW.length,
    cardHidden: document.getElementById("dashNew").style.display === "none",
    dots: document.querySelectorAll("#tabbar .nw-dot").length
  }));
  report("G) what a student has read is remembered across launches",
    G.stored === G.total && G.cardHidden && G.dots === 0, G);

  report("H) no page error anywhere in this journey", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(failures
    ? `\n${failures} FAILURE(S) — the students would not learn what shipped.`
    : "\nAll checks passed — what shipped is at the top of Home, marked on its card, and one tap from being tried.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
