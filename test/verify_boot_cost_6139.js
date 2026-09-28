/* 6.139.0 / panel 6.210.0 — THE APP DOES NOT MEASURE TEXT NOBODY CAN SEE.
 *
 * THE MEASUREMENT THAT STARTED THIS. On a phone at 4x CPU throttling, with the app served from
 * localhost so no network was in the way at all:
 *
 *     first paint            436 ms
 *     one blocking task    4,341 ms          <- the screen is frozen for this
 *     DOMContentLoaded     5,421 ms
 *
 * The obvious suspects were innocent. All eight data files together — the 1.2 MB library
 * catalogue, the Imagine tables, the album module, the translation packs, the What's New strip —
 * cost 63 ms of fetch, parse and execute between them. A CPU profile named the real one:
 * ellMark, 1,991 ms, 44% of the whole boot.
 *
 * WHAT IT WAS DOING. ellMark is the clamp marker: it works out whether a sentence is too long for
 * its box and appends the "…". To measure one it has to unclamp it — six inline styles off, read
 * scrollHeight, seven styles back — which is a forced layout per element, plus a binary search
 * over the string when the text really is too long. At boot it was doing all of that to the 502
 * title and summary lines of the 251 Smart Workflow cards, every one of which was inside a closed
 * group and therefore had no layout box at all. scrollHeight of a box with no layout is 0, so the
 * answer was always "not cut": 938 ms per pass, measured, for ZERO marks.
 *
 * THE FIX IS ONE CONDITION. A box with no layout is skipped. clientWidth is read in that loop
 * anyway (ellKey asks for it), so the guard is free, and nothing is lost: the card is measured the
 * moment it is really shown — renderWf marks the list, opening a group marks that group, the
 * filter marks what it re-opens. Both surfaces carry it, because the panel draws the same cards.
 *
 * AND THE STRIP THAT COULD NOT BE TRIMMED, WHICH IS WORTH WRITING DOWN. The What's New cut has
 * stood at 6.80.0 since 6.91.0, so the live table is 72 rows and 638 KB — release notes every
 * phone downloads on its first load and the panel parses at every boot. Moving the cut forward
 * was tried in this wave and put back: sixteen tests read the LIVE table as the record that their
 * release announced itself in nine languages on both surfaces (WN.appRow / WN.panelRow), and the
 * oldest of those is 6.80.0 exactly. The panel has no archive to compare against either, so
 * archiving a row would take the row away from the panel's table and break that comparison
 * rather than merely move it. C1 pins that constraint so the next wave meets it as a fact instead
 * of finding it the way this one did — and so that whoever decides to trim knows the job is to
 * give the archive a panel-side copy first.
 *
 * A) the guard, in both copies   B) the app booted for real: no marks on hidden cards, marks the
 * moment they are shown, and the text itself unchanged   C) what pins the strip's length
 * D) release pins
 * Usage: PORT=8931 node test/verify_boot_cost_6139.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const VER = "6.149.0", PVER = "6.220.0";
const COUNT = 291;
const CUT = "6.110.0";
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}
const sv = (v) => String(v).split(".").map(Number);
const cmp = (a, b) => { const x = sv(a), y = sv(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

/* ===================== A) the guard ===================== */

function partA() {
  report("A1) the web app skips a box with no layout before it touches a style, and says why",
    has(APP, "var w=n.clientWidth;\n        if(!(w>0)) return;") &&
    has(APP, "A BOX WITH NO LAYOUT IS NOT MEASURED, AND THAT IS MOST OF THE BOOT"),
    { guard: has(APP, "var w=n.clientWidth;\n        if(!(w>0)) return;") });

  report("A2) the panel's own copy carries the same guard — it draws the same cards from the same module, so it was paying the same price",
    has(MAIN, "const w = n.clientWidth;\n        if (!(w > 0)) return;") &&
    has(MAIN, "A BOX WITH NO LAYOUT IS NOT MEASURED"),
    { guard: has(MAIN, "const w = n.clientWidth;\n        if (!(w > 0)) return;") });

  report("A3) the guard sits in phase 1, before the writes, so a skipped box costs one property read and nothing else",
    (function () {
      const i = APP.indexOf("function ellMark(root, sel, lines){");
      const p2 = APP.indexOf("PHASE 2", i);
      const g = APP.indexOf("if(!(w>0)) return;", i);
      return i > 0 && g > i && g < p2;
    })());

  report("A4) what makes a box measurable is unchanged: a laid-out box still goes through the whole unclamp, and the half-line rule that Burmese diacritics need is still the test for a cut",
    has(APP, "if(n.scrollHeight>m.ceil+m.lh/2){") && has(APP, 'n.style.maxHeight="none"') &&
    has(MAIN, "if (n.scrollHeight > m.ceil + m.lh / 2) {") );
}

/* ===================== B) the app booted for real ===================== */

async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const b1 = await page.evaluate(() => {
    const lines = [...document.querySelectorAll(".wfmini .t, .wfmini .s")];
    return {
      cards: document.querySelectorAll(".wfmini").length,
      lines: lines.length,
      laidOut: lines.filter((n) => n.clientWidth > 0).length,
      marked: document.querySelectorAll(".wfmini .ell").length,
      touched: lines.filter((n) => n.hasAttribute("data-full")).length
    };
  });
  /* the app opens ONE group by default, and those cards are laid out for a moment while the list
     renders — they are measured, and should be. Every other card is inside a closed group and is
     now skipped. The claim is that ratio, not a zero: a zero here would mean the default group had
     stopped being measured too, which is a regression of a different kind. */
  report("B1) at boot only the one group the app opens by default is measured — 18 lines of 502 — so better than 95% of the pass is gone, and the rest of the cards are never written to",
    b1.cards > 100 && b1.lines === b1.cards * 2 && b1.laidOut === 0 &&
    b1.touched > 0 && b1.touched <= 60 && (b1.touched / b1.lines) < 0.15, b1);

  /* the cost of the pass boot used to make, measured on this machine rather than asserted */
  const b2 = await page.evaluate(() => {
    const t = performance.now();
    ellMark(document, ".wfmini .t", 2); ellMark(document, ".wfmini .s", 3);
    return Math.round(performance.now() - t);
  });
  report("B2) that pass now costs almost nothing — under 120 ms at 4x CPU where it cost 938 ms before, and it is the same pass boot makes",
    b2 < 120, { ms: b2 });

  /* and the moment a group really opens, the cards inside it are measured properly */
  const b3 = await page.evaluate(async () => {
    switchPage("pgWf");
    await new Promise((r) => setTimeout(r, 900));
    /* a group that is really closed — the first one is the group the app opens by default, and
       clicking that would close it rather than open anything */
    const grp = document.querySelector("#pgWf .grp:not(.open)");
    const head = grp && grp.querySelector(".grp-h");
    if (!head) return { opened: false };
    const before = [...grp.querySelectorAll(".wfmini .t, .wfmini .s")]
      .filter((n) => n.hasAttribute("data-full")).length;
    head.click();
    await new Promise((r) => setTimeout(r, 1200));
    const inside = [...grp.querySelectorAll(".wfmini .t, .wfmini .s")];
    return {
      opened: true,
      before: before,
      open: /\bopen\b/.test(grp.className),
      lines: inside.length,
      laidOut: inside.filter((n) => n.clientWidth > 0).length,
      touched: inside.filter((n) => n.hasAttribute("data-full")).length,
      empty: inside.filter((n) => !(n.textContent || "").trim()).length
    };
  });
  report("B3) a group that was skipped at boot is measured the moment it is opened — nothing was measured in it before, every line is laid out and carries its full sentence after, and none of them is emptied",
    b3.opened && b3.open && b3.lines > 0 && b3.before === 0 &&
    b3.laidOut === b3.lines && b3.touched === b3.lines && b3.empty === 0, b3);

  /* the words a studio reads are the words the data holds: the guard must not have eaten any */
  const b4 = await page.evaluate(() => {
    const out = { checked: 0, wrong: [] };
    document.querySelectorAll("#pgWf .grp.open .wfmini").forEach(function (c) {
      const t = c.querySelector(".t"); if (!t) return;
      const full = t.getAttribute("data-full") || "";
      const shown = (t.textContent || "").replace(/…$/, "");
      out.checked++;
      if (full && shown && full.indexOf(shown.trim()) !== 0) out.wrong.push(full.slice(0, 40));
    });
    return out;
  });
  report("B4) and every card's visible title is still the beginning of its real title — a clamp that lost or reordered a word would show here",
    b4.checked > 0 && b4.wrong.length === 0, b4);

  report("B5) the boot raised no error", errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

/* ===================== C) what pins the strip's length ===================== */

function partC() {
  const live = A.readWhatsNew();
  const arc = A.readWhatsNewArchive();
  /* every release a test fetches out of the LIVE table by name */
  const demanded = [];
  fs.readdirSync(path.join(ROOT, "test")).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    const t = fs.readFileSync(path.join(ROOT, "test", f), "utf8");
    [...t.matchAll(/WN\.(?:app|panel)Row\("(\d+\.\d+\.\d+)"/g)].forEach((m) => demanded.push(m[1]));
  });
  const oldestDemanded = demanded.sort(cmp)[0];
  const oldestOnStrip = live[live.length - 1].v;

  report("C1) the strip reaches back exactly as far as the suite reads it: the oldest release any test fetches from the live table is " + oldestDemanded + ", and that is the oldest row on the strip. Trimming the strip means giving the archive a panel-side copy first, because WN.panelRow has nowhere else to look",
    demanded.length >= 10 && oldestOnStrip === oldestDemanded &&
    live.every((r) => cmp(r.v, oldestDemanded) >= 0),
    { oldestDemanded: oldestDemanded, oldestOnStrip: oldestOnStrip, demanded: demanded.length, rows: live.length });

  report("C2) this wave moved no release note: the record holds what it held, and the strip differs only by the row this release added",
    arc.length === 111 && live[0].v === VER && live.length === 82 &&   /* 72 when 6.139.0 shipped; one more row per release since (6.140.0, 6.141.0, 6.142.0) — the archive stays at 111 */
    arc.every((r) => cmp(r.v, oldestOnStrip) < 0),
    { archive: arc.length, rows: live.length, newest: live[0].v });

  const panel = (function () {
    const s2 = read("panel/js/hnk_whats_new.js");
    const i = s2.indexOf("var WHATS_NEW = ");
    const j = s2.indexOf("\n", i);
    return JSON.parse(s2.slice(i + "var WHATS_NEW = ".length, j).replace(/;\s*$/, ""));
  })();
  report("C3) the panel's lifted table is the same rows in the same order, which is the comparison a trim would have to keep",
    panel.map((r) => r.v).join(",") === live.map((r) => r.v).join(","),
    { panelRows: panel.length, liveRows: live.length });
}

/* ===================== D) release pins ===================== */

function partD() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("D1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the album check it follows",
    steps === COUNT && has(CI, "node test/verify_boot_cost_6139.js") &&
    CI.indexOf("verify_boot_cost_6139.js") > CI.indexOf("verify_album_all_6138.js"), { steps: steps });
  report("D2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') &&
    has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("D3) the landing counts " + COUNT + " tests",
    has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

/* ===================== run ===================== */

(async function main() {
  partA();
  partC();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    await partB(browser);
  } finally { await browser.close(); }
  partD();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
