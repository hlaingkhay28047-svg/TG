/* v5.33.0 accessibility sweep — the app is usable without a mouse or eyes.

   WHAT WAS MISSING, measured before any of it was written:

     skip link ............ none. Tab on load walked the entire bottom bar
                            before reaching the page the user had opened.
                            WCAG 2.4.1 Bypass Blocks, unmet.
     .sr-only ............. none. There was no way to give a control text a
                            screen reader can read and a sighted user cannot
                            see, so several controls had neither.
     <nav> names .......... 0 of 3. A landmark list read "navigation,
                            navigation, navigation".
     dialog names ......... 0 of 5. Every role="dialog" aria-modal="true"
                            surface announced itself as "dialog" and stopped.
     live status .......... 2 of 25 .status elements. setSt writes into all
                            25 — a failed generate, a saved key, a rejected
                            payment — and 23 of them were announced to nobody.

   WHY IT IS TESTED THROUGH A BROWSER AND NOT BY GREP. Three of the five are
   about the ACCESSIBILITY TREE, not the markup: an aria-labelledby pointing at
   an element that is empty at the moment the dialog opens produces a dialog
   with no name, and the HTML looks perfect. So this file opens the app, opens
   the modals, and reads the computed name Playwright's accessibility snapshot
   reports — the same thing a screen reader would say.

   Pinned contracts:
   A) The skip link is the FIRST focusable element, is off-screen until it
      takes focus, and is on-screen once it has it.
   B) Activating it actually moves focus to the main region — not merely
      scrolls, which leaves the next Tab back at the top of the document.
   C) Every .status element is a polite live region.
   D) Every role="dialog" has a non-empty accessible NAME once open, including
      the two whose contents are built at open time.
   E) A dialog's derived name matches the title it visibly shows, and a second
      workflow opened into the same shell does not inherit the first one's.
   F) Both navigation landmarks are named.
   G) The skip link's label is localized, and the two languages that have no
      attested phrase fall back to English DELIBERATELY rather than rendering
      an empty string or the key.
   H) Nothing above cost a console error, and the focus trap the app already
      had still holds.

   Usage: PORT=8931 node test/sweep_v533_a11y.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const seed = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const BASE = "http://127.0.0.1:" + PORT + "/";
const APP = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* The accessible NAME Playwright computes for an element, which is what a
   screen reader would say. page.accessibility.snapshot() was removed after
   Playwright 1.5x; locator.ariaSnapshot() is its replacement and renders the
   node as `- dialog "AI Retouch":`, so the name is the first quoted run. */
async function nameOf(page, selector) {
  const snap = await page.locator(selector).ariaSnapshot().catch(() => null);
  if (snap == null) return null;
  const first = snap.split("\n")[0] || "";
  const m = first.match(/"((?:[^"\\]|\\.)*)"/);
  return m ? m[1] : "";
}

(async () => {
  const browser = seed.withPremium(await chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  /* the onboarding modal is correctly modal and traps focus, so it would
     answer every keyboard question below with its own answer */
  await ctx.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => {
    /* v6.27.0 — WebKit logs the Chromium-only viewport key (interactive-widget=resizes-content, the
       phone keyboard rule) as an error-level notice and ignores it; that is the engine talking
       about a key it does not have, not the app raising an error. Measured by the cross-engine lane. */
    if (/Viewport argument key "interactive-widget" not recognized/.test(m.text())) return;
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);

  /* ---------- A) the skip link ---------- */
  const boot = await page.evaluate(() => {
    const sk = document.getElementById("skipLink");
    const focusables = [...document.querySelectorAll(
      "a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])")]
      .filter(e => e.getClientRects().length || e.id === "skipLink");
    return {
      exists: !!sk,
      first: focusables[0] ? (focusables[0].id || focusables[0].tagName) : null,
      text: sk ? sk.textContent.trim() : "",
      offscreen: sk ? parseFloat(getComputedStyle(sk).top) < 0 : null,
      mainTabindex: document.getElementById("mainWrap") &&
        document.getElementById("mainWrap").getAttribute("tabindex"),
    };
  });
  report("A) the skip link exists, comes first in the tab order and starts off-screen",
    boot.exists && boot.first === "skipLink" && boot.offscreen === true &&
    boot.text.length > 0 && boot.mainTabindex === "-1", boot);

  await page.keyboard.press("Tab");
  /* the link slides in over 120ms, so reading the computed top immediately
     returns the off-screen start value. Wait for the element to actually be
     in the viewport rather than for a guessed delay. */
  await page.waitForFunction(() => {
    const sk = document.getElementById("skipLink");
    return sk && sk.getBoundingClientRect().top >= 0;
  }, null, { timeout: 3000 }).catch(() => {});
  const onFocus = await page.evaluate(() => {
    const a = document.activeElement;
    const sk = document.getElementById("skipLink");
    return { id: a && a.id, focusMatches: sk.matches(":focus"),
             rectTop: sk.getBoundingClientRect().top,
             rectBottom: sk.getBoundingClientRect().bottom };
  });
  report("A2) taking focus brings it fully into the viewport",
    onFocus.id === "skipLink" && onFocus.focusMatches === true &&
    onFocus.rectTop >= 0 && onFocus.rectBottom > onFocus.rectTop, onFocus);

  /* ---------- B) it moves FOCUS, not just the scroll position ---------- */
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const afterSkip = await page.evaluate(() => document.activeElement && document.activeElement.id);
  report("B) activating it moves focus into the main region",
    afterSkip === "mainWrap", { activeElement: afterSkip });

  /* ---------- C) live status regions ---------- */
  const live = await page.evaluate(() => ({
    total: document.querySelectorAll(".status").length,
    polite: document.querySelectorAll(".status[aria-live='polite']").length,
    role: document.querySelectorAll(".status[role='status']").length,
  }));
  report("C) every .status element is a polite live region",
    live.total > 20 && live.polite === live.total && live.role === live.total, live);

  /* ---------- F) the navigation landmarks ---------- */
  const navs = await page.evaluate(() => [...document.querySelectorAll("nav")]
    .map(n => ({ id: n.id || "(header)", label: n.getAttribute("aria-label") || "" })));
  const unnamedNav = navs.filter(n => n.id !== "(header)" && !n.label);
  report("F) every navigation landmark that repeats on each page is named",
    navs.length >= 3 && unnamedNav.length === 0, { navs, unnamedNav });

  /* ---------- D + E) dialog names ---------- */
  const dialogIds = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')].map(d => d.id));
  report("D0) the app still has the five modal surfaces this file knows about",
    dialogIds.length >= 5, dialogIds);

  /* the three with markup headings are labelled by them */
  const staticNamed = await page.evaluate(() =>
    ["ptSheet", "ptWfSheet", "onb"].map(id => {
      const d = document.getElementById(id);
      return { id, by: d && d.getAttribute("aria-labelledby"),
               target: d && d.getAttribute("aria-labelledby") &&
                       !!document.getElementById(d.getAttribute("aria-labelledby")) };
    }));
  report("D) the three modals with a heading in the markup are labelled by it, and the target exists",
    staticNamed.every(x => x.by && x.target), staticNamed);

  /* the two built at open time */
  const wiz1 = await page.evaluate(async () => {
    window.openWorkflowById("retouch");
    await new Promise(r => setTimeout(r, 600));
    const w = document.getElementById("wiz");
    const ttl = w.querySelector(".ttl");
    return { label: w.getAttribute("aria-label"), visible: ttl ? ttl.textContent.trim() : null };
  });
  const wizName = await nameOf(page, "#wiz");
  report("D2) a wizard built at open time gets a non-empty accessible name",
    !!wiz1.label && wiz1.label.length > 0 && !!wizName && wizName.length > 0,
    { attr: wiz1.label, computed: wizName });
  report("E) that name is the title the wizard visibly shows",
    wiz1.label === wiz1.visible, wiz1);

  /* close it and open a different one — the name must follow */
  const wiz2 = await page.evaluate(async () => {
    const w = document.getElementById("wiz");
    const x = w.querySelector(".wiz-x");
    if (x) x.click();
    await new Promise(r => setTimeout(r, 300));
    const afterClose = w.getAttribute("aria-label");
    window.openWorkflowById("upscale");
    await new Promise(r => setTimeout(r, 600));
    return { afterClose: afterClose, label: w.getAttribute("aria-label"),
             visible: w.querySelector(".ttl") ? w.querySelector(".ttl").textContent.trim() : null };
  });
  report("E2) a second workflow opened into the same shell does not inherit the first one's name",
    wiz2.afterClose === null && !!wiz2.label && wiz2.label === wiz2.visible && wiz2.label !== wiz1.label,
    { first: wiz1.label, afterClose: wiz2.afterClose, second: wiz2.label, secondVisible: wiz2.visible });

  /* ---------- H) the focus trap the app already had still holds ---------- */
  const trapped = await page.evaluate(async () => {
    const w = document.getElementById("wiz");
    for (let i = 0; i < 40; i++) {
      const before = document.activeElement;
      before.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
    }
    return w.contains(document.activeElement);
  });
  report("H) focus is still trapped inside an open modal",
    trapped === true, { insideModal: trapped });

  await page.evaluate(() => {
    const x = document.getElementById("wiz").querySelector(".wiz-x");
    if (x) x.click();
  });

  /* ---------- G) the label is localized, and its gaps are deliberate ---------- */
  const langs = await page.evaluate(async () => {
    const out = {};
    for (const L of ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"]) {
      try { localStorage.setItem("hnk_ws_lang", L); } catch (e) {}
      window.LANG = L;
      if (window.applyLang) window.applyLang();
      out[L] = (document.getElementById("skipLink").textContent || "").trim();
    }
    return out;
  }).catch(() => null);
  if (langs) {
    const vals = Object.values(langs);
    const empty = Object.entries(langs).filter(([, v]) => !v).map(([k]) => k);
    const fellBack = ["shn", "kac"].filter(L => langs[L] === langs.en);
    report("G) the skip-link label is localized, non-empty everywhere, and shn/kac fall back to English on purpose",
      empty.length === 0 && langs.my !== langs.en && fellBack.length === 2, { langs, empty, fellBack });
  } else {
    /* applyLang is not reachable from the page scope in this build — check the
       source instead rather than silently skipping the contract */
    const block = (APP.match(/sk\.textContent\s*=\s*L9\(\{([\s\S]*?)\}\);/) || [])[1] || "";
    const has = L => new RegExp('\\b' + L + ':"').test(block);
    report("G) the skip-link label is written for seven languages and omits shn/kac so L9 hands them English",
      ["my", "en", "th", "zh", "vi", "id", "ms"].every(has) && !has("shn") && !has("kac"),
      { block: block.slice(0, 120) });
  }

  report("H2) none of this raised a console error",
    errors.length === 0, errors.slice(0, 5));

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
