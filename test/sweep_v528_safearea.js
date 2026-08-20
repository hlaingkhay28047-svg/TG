/* v5.28.0 regression sweep — the app is usable on a notched phone held sideways.

   WHAT WAS WRONG. The stylesheet used env(safe-area-inset-top) and
   env(safe-area-inset-bottom) in ten places each, and env(safe-area-inset-left)
   / env(safe-area-inset-right) in none. Upright that is fine: the horizontal
   insets are 0px in portrait on every device. Turn the phone sideways and they
   are not — on a notched iPhone the sensor housing takes ~44px off one edge and
   the rounded corner takes a few off the other, and the browser reports exactly
   that through the left/right insets so a page can move out of the way.

   Nothing in this app moved. Every full-bleed fixed surface ran edge to edge
   underneath the notch: the first and last tab of .tabbar, the wizard and both
   Path sheets (whose close button lives in the top-left corner), the onboarding
   card, the look-zoom overlay, the toast, the scroll-to-top FAB and the Studio
   PiP stage. .wrap — which is every page's content AND the sticky nav, so the
   logo and the language picker with it — had a flat 16px of horizontal padding,
   less than half the inset it needed to clear.

   HOW THIS IS TESTED AT ALL. env() cannot be set from script and headless
   Chromium reports 0px for it, so a test that reads env() directly can only
   ever confirm the portrait case and would pass just as happily on the broken
   build. The fix therefore names the insets once at :root —

       --sa-l:env(safe-area-inset-left, 0px); --sa-r:env(safe-area-inset-right, 0px)

   — and every site consumes the custom property. A custom property CAN be
   overridden at runtime, so this file sets --sa-l/--sa-r to a synthetic 44px
   and measures that each surface actually moves by 44px. That is the whole
   point of the indirection: it turns "we wrote env() somewhere" into a
   measurement.

   Measured at 844x390 (iPhone-class landscape), inset 0px -> 44px:

                        before        after
     .wrap padding-left   16 -> 16     16 -> 60
     .tabbar padding-left  0 ->  0      0 -> 44
     .toast left          16 -> 16     16 -> 60
     .fab-top right       14 -> 14     14 -> 58
     #wiz padding-left     0 ->  0      0 -> 44

   Pinned contracts:
   A) :root defines --sa-l/--sa-r from the left/right env() insets, with a 0px
      fallback so a browser that does not know them is unaffected.
   B) With the insets at 0 — every device in portrait, every desktop — the
      layout is byte-for-byte what it was: 16px on .wrap, 0 on .tabbar, and the
      floaters exactly where they were pinned. This is the no-regression half
      and it is the one that would catch a fix that "helps" by always padding.
   C) With the insets at 44px, each surface moves by exactly 44px. Every one of
      these fails on the pre-v5.28 tree, where nothing consumes the property.
   D) Nothing starts scrolling sideways because of the added padding.
   E) No page errors.

   Usage: PORT=8931 node test/sweep_v528_safearea.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
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

/* ---- A) the source-level contract ---- */
const rootDecl = (src.match(/--sa-l:\s*env\(safe-area-inset-left,\s*0px\);\s*--sa-r:\s*env\(safe-area-inset-right,\s*0px\)/) || [])[0] || "";
report("A) :root names both horizontal insets, with a 0px fallback",
  !!rootDecl, { found: rootDecl || null });

/* Every surface that is pinned to a screen edge must consume them. Listed by
   the selector rather than counted, so adding a tenth use cannot mask a
   regression in one of these nine. */
const CONSUMERS = [
  [".wrap",        /\.wrap\{max-width:760px;margin:0 auto;padding:0 calc\(16px \+ var\(--sa-r\)\) 0 calc\(16px \+ var\(--sa-l\)\)\}/],
  [".tabbar",      /\.tabbar\{[^}]*padding-left:var\(--sa-l\);padding-right:var\(--sa-r\)\}/],
  [".wiz",         /\.wiz\{[^}]*padding-left:var\(--sa-l\);padding-right:var\(--sa-r\)\}/],
  [".pt-sheet",    /\.pt-sheet\{[^}]*padding-left:var\(--sa-l\);padding-right:var\(--sa-r\)\}/],
  [".onb",         /\.onb\{[^}]*padding-left:var\(--sa-l\);padding-right:var\(--sa-r\)\}/],
  ["#lookZoom",    /#lookZoom\{[^}]*padding-left:var\(--sa-l\);padding-right:var\(--sa-r\)\}/],
  [".toast",       /\.toast\{position:fixed;left:calc\(16px \+ var\(--sa-l\)\);right:calc\(16px \+ var\(--sa-r\)\)/],
  [".fab-top",     /\.fab-top\{position:fixed;right:calc\(14px \+ var\(--sa-r\)\)/],
  ["#stStage.pip", /#stStage\.pip\{position:fixed;right:calc\(10px \+ var\(--sa-r\)\)/],
];
const missing = CONSUMERS.filter(([, re]) => !re.test(src)).map(([sel]) => sel);
report("A2) every edge-pinned surface consumes the named insets",
  missing.length === 0, { missing: missing });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const measure = inset => page.evaluate(px => {
    const root = document.documentElement;
    if (px === null) { root.style.removeProperty("--sa-l"); root.style.removeProperty("--sa-r"); }
    else { root.style.setProperty("--sa-l", px + "px"); root.style.setProperty("--sa-r", px + "px"); }
    const n = v => Math.round(parseFloat(v) || 0);
    const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const wrap = cs(".wrap"), tab = cs(".tabbar"), toast = cs(".toast"),
          fab = cs(".fab-top"), wiz = cs("#wiz"), sheet = cs(".pt-sheet"), onb = cs(".onb");
    return {
      wrapL: wrap ? n(wrap.paddingLeft) : -1,
      wrapR: wrap ? n(wrap.paddingRight) : -1,
      tabL: tab ? n(tab.paddingLeft) : -1,
      tabR: tab ? n(tab.paddingRight) : -1,
      toastL: toast ? n(toast.left) : -1,
      fabR: fab ? n(fab.right) : -1,
      wizL: wiz ? n(wiz.paddingLeft) : -1,
      sheetL: sheet ? n(sheet.paddingLeft) : -1,
      onbL: onb ? n(onb.paddingLeft) : -1,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  }, inset);

  const base = await measure(0);
  const notched = await measure(44);
  await measure(null);            /* leave the page as we found it */

  /* ---- B) the no-regression half ---- */
  report("B) at a 0px inset the layout is exactly what it was",
    base.wrapL === 16 && base.wrapR === 16 && base.tabL === 0 && base.tabR === 0 &&
    base.toastL === 16 && base.fabR === 14 && base.wizL === 0 && base.sheetL === 0 && base.onbL === 0,
    base);

  /* ---- C) the half that fails on the old tree ---- */
  const SHIFTS = [
    ["wrap padding-left", base.wrapL, notched.wrapL, 44],
    ["wrap padding-right", base.wrapR, notched.wrapR, 44],
    ["tabbar padding-left", base.tabL, notched.tabL, 44],
    ["tabbar padding-right", base.tabR, notched.tabR, 44],
    ["toast left", base.toastL, notched.toastL, 44],
    ["fab-top right", base.fabR, notched.fabR, 44],
    ["wiz padding-left", base.wizL, notched.wizL, 44],
    ["pt-sheet padding-left", base.sheetL, notched.sheetL, 44],
    ["onb padding-left", base.onbL, notched.onbL, 44],
  ];
  const wrong = SHIFTS.filter(([, b, a, d]) => a - b !== d)
    .map(([name, b, a, d]) => ({ what: name, from: b, to: a, expected: b + d }));
  report("C) a 44px inset moves every edge-pinned surface by exactly 44px",
    wrong.length === 0, wrong);

  /* ---- D ---- */
  report("D) the added padding does not push the document sideways",
    notched.docScrollW <= notched.docClientW,
    { scroll: notched.docScrollW, client: notched.docClientW });

  /* ---- E ---- */
  report("E) no page errors", errs.length === 0, errs.slice(0, 5));

  console.log("      (on the v5.27.0 tree this same file reports 3 failures: A and A2 find no " +
    "--sa-l/--sa-r at all, and C measures 0 of 9 surfaces moving — .wrap stays at 16px, " +
    ".tabbar at 0, .toast at 16 and .fab-top at 14 no matter how large the inset)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
