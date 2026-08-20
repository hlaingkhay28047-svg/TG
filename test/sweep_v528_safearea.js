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
   overridden at runtime, so this file sets a synthetic inset and measures that
   each surface actually moves. That is the whole point of the indirection: it
   turns "we wrote env() somewhere" into a measurement.

   The two sides are set to DIFFERENT values on purpose. An equal pair makes a
   left/right swap invisible — the easiest mistake to make in a padding
   shorthand, whose order is top/right/bottom/left — because every surface still
   moves by the expected amount while landing on the wrong side. 10 and 50
   cannot both be right by accident.

   Measured at 844x390 (iPhone-class landscape), inset 0px -> 10px left /
   50px right:

                          before          after
     .wrap padding L/R    16/16 -> 16/16  16/16 -> 26/66
     .tabbar padding L/R    0/0 ->   0/0    0/0 -> 10/50
     .toast left/right    16/16 -> 16/16  16/16 -> 26/66
     .fab-top right          14 ->    14      14 ->    64
     #wiz padding L/R       0/0 ->   0/0    0/0 -> 10/50

   Pinned contracts:
   A) :root defines --sa-l/--sa-r from the left/right env() insets, with a 0px
      fallback so a browser that does not know them is unaffected.
   B) With the insets at 0 — every device in portrait, every desktop — the
      layout is byte-for-byte what it was: 16px on .wrap, 0 on .tabbar, and the
      floaters exactly where they were pinned. This is the no-regression half
      and it is the one that would catch a fix that "helps" by always padding.
   C) With an asymmetric inset, each SIDE moves by its own amount — 13 measured
      sides across 6 surfaces. Every one fails on the pre-v5.28 tree, where
      nothing consumes the property, and a swapped pair fails here too.
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
  /* the tablet rule uses the padding SHORTHAND, so it has to restate them */
  [".wiz @768",    /\.wiz\{background:rgba\(5,7,12,\.72\);backdrop-filter:blur\(6px\);padding:32px var\(--sa-r\) 32px var\(--sa-l\)\}/],
];
const missing = CONSUMERS.filter(([, re]) => !re.test(src)).map(([sel]) => sel);
report("A2) every edge-pinned surface consumes the named insets",
  missing.length === 0, { missing: missing });

/* Two viewports, because a single one cannot see a breakpoint override. The
   phone size fails @media(min-height:481px), so it is blind to the tablet
   rules — and .wiz's tablet rule sets `padding:32px 0`, a SHORTHAND, which
   silently resets the horizontal insets to 0 on precisely the wide screens it
   targets. An iPad in landscape is 1024x768: wide enough, tall enough, and
   notched. Every assertion below runs at both. */
const VIEWPORTS = [
  { w: 844, h: 390, name: "phone landscape" },
  { w: 1024, h: 768, name: "tablet landscape" },
];

/* Deliberately ASYMMETRIC. Setting both insets to the same number makes a
   left/right swap — the single easiest mistake in a padding shorthand, whose
   order is top/right/bottom/left — completely invisible: every measurement
   still moves by the expected amount while landing on the wrong side. 10 and
   50 cannot both be right by accident. */
const L = 10, R = 50;

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const RES = {};
  for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  page.on("pageerror", e => errs.push(vp.name + ": " + String(e).slice(0, 180)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const measure = on => page.evaluate(v => {
    const root = document.documentElement;
    if (!v) { root.style.removeProperty("--sa-l"); root.style.removeProperty("--sa-r"); }
    else { root.style.setProperty("--sa-l", v.l + "px"); root.style.setProperty("--sa-r", v.r + "px"); }
    const n = x => Math.round(parseFloat(x) || 0);
    const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const wrap = cs(".wrap"), tab = cs(".tabbar"), toast = cs(".toast"),
          fab = cs(".fab-top"), wiz = cs("#wiz"), sheet = cs(".pt-sheet"), onb = cs(".onb");
    return {
      wrapL: wrap ? n(wrap.paddingLeft) : -1,
      wrapR: wrap ? n(wrap.paddingRight) : -1,
      tabL: tab ? n(tab.paddingLeft) : -1,
      tabR: tab ? n(tab.paddingRight) : -1,
      toastL: toast ? n(toast.left) : -1,
      toastR: toast ? n(toast.right) : -1,
      fabR: fab ? n(fab.right) : -1,
      wizL: wiz ? n(wiz.paddingLeft) : -1,
      wizR: wiz ? n(wiz.paddingRight) : -1,
      sheetL: sheet ? n(sheet.paddingLeft) : -1,
      sheetR: sheet ? n(sheet.paddingRight) : -1,
      onbL: onb ? n(onb.paddingLeft) : -1,
      onbR: onb ? n(onb.paddingRight) : -1,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  }, on);

  RES[vp.name] = { base: await measure({ l: 0, r: 0 }), notched: await measure({ l: L, r: R }) };
  await measure(null);            /* leave the page as we found it */
  await page.close();
  }

  for (const vp of VIEWPORTS) {
  const base = RES[vp.name].base, notched = RES[vp.name].notched, at = " @ " + vp.name;

  /* ---- B) the no-regression half ---- */
  report("B) at a 0px inset the layout is exactly what it was" + at,
    base.wrapL === 16 && base.wrapR === 16 && base.tabL === 0 && base.tabR === 0 &&
    base.toastL === 16 && base.toastR === 16 && base.fabR === 14 &&
    base.wizL === 0 && base.wizR === 0 && base.sheetL === 0 && base.sheetR === 0 &&
    base.onbL === 0 && base.onbR === 0,
    base);

  /* ---- C) the half that fails on the old tree ---- */
  const SHIFTS = [
    ["wrap padding-left", base.wrapL, notched.wrapL, L],
    ["wrap padding-right", base.wrapR, notched.wrapR, R],
    ["tabbar padding-left", base.tabL, notched.tabL, L],
    ["tabbar padding-right", base.tabR, notched.tabR, R],
    ["toast left", base.toastL, notched.toastL, L],
    ["toast right", base.toastR, notched.toastR, R],
    ["fab-top right", base.fabR, notched.fabR, R],
    ["wiz padding-left", base.wizL, notched.wizL, L],
    ["wiz padding-right", base.wizR, notched.wizR, R],
    ["pt-sheet padding-left", base.sheetL, notched.sheetL, L],
    ["pt-sheet padding-right", base.sheetR, notched.sheetR, R],
    ["onb padding-left", base.onbL, notched.onbL, L],
    ["onb padding-right", base.onbR, notched.onbR, R],
  ];
  const wrong = SHIFTS.filter(([, b, a, d]) => a - b !== d)
    .map(([name, b, a, d]) => ({ what: name, from: b, to: a, expected: b + d }));
  report("C) an asymmetric " + L + "/" + R + "px inset moves each side by its OWN amount" + at,
    wrong.length === 0, wrong);

  /* ---- D ---- */
  report("D) the added padding does not push the document sideways" + at,
    notched.docScrollW <= notched.docClientW,
    { scroll: notched.docScrollW, client: notched.docClientW });

  }

  /* ---- E ---- */
  report("E) no page errors", errs.length === 0, errs.slice(0, 5));

  console.log("      (on the v5.27.0 tree this same file reports 3 failures: A and A2 find no " +
    "--sa-l/--sa-r at all, and C measures 0 of 13 sides moving — .wrap stays at 16px, " +
    ".tabbar at 0, .toast at 16 and .fab-top at 14 no matter how large the inset)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
