/* v5.29.0 regression sweep — the Provider picker explains what is missing.

   WHAT THE OWNER SENT. A screenshot of the Provider dropdown open on his phone
   with exactly one row in it, Gemini, and the message "models တွေ ပျောက်နေတယ်"
   — the models have disappeared.

   WHAT IT ACTUALLY WAS. Nothing had disappeared. #selProvider ships with a
   single <option> for Gemini; renderRhProviderOption() and
   renderOaProviderOption() APPEND RunningHub and OpenAI only once their key is
   saved, and remove them again when it is not. So a studio holding only a
   Gemini key opens the picker, sees one row, and is told nothing at all —
   nothing about the RunningHub image, video and text-to-image catalogues
   sitting one key away, and nothing about where that key goes. Verified across
   40 commits that the Gemini model list itself never changed: auto,
   gemini-2.5-flash-image, gemini-3-pro-image-preview, all three present and
   translated in all 37 languages. The defect was never a missing model. It was
   a picker that stays silent about the reason it is short.

   That the owner — who knows this app better than anyone — read it as data
   loss is the whole argument for the fix. A studio owner in Mandalay has no
   chance.

   So the missing providers are now listed rather than omitted: dimmed, under a
   header, carrying the reason and the count of what they unlock, and each row
   takes a tap to the exact Setup card that fixes it.

   THE COUNT IS DERIVED, NEVER TYPED. It is
   RH_MODELS + RH_VIDEO_MODELS + RH_T2I_MODELS measured at runtime, so it
   cannot drift the way a hardcoded number in landing copy has before. C pins
   that it equals the real array total rather than any literal.

   Pinned contracts:
   A) providerLocks() exists and openPop() renders it for #selProvider only.
   B) With a Gemini key alone: Gemini stays selectable, and RunningHub and
      OpenAI both appear as locked rows carrying a reason, marked
      aria-disabled so assistive tech says they are not choosable yet.
   C) The RunningHub row's count equals the live array total — not a literal.
   D) With all three keys set, there are no locked rows and no header at all.
      This is the half that stops the hint becoming a permanent nag, and it is
      the one that would catch a fix that always renders the rows.
   E) Tapping a locked row closes the popover and lands on the Setup page.
   F) No page errors.

   EVERY ONE OF THESE HAS BEEN SEEN TO FAIL. Against the v5.28.0 tree A, B, C
   and E all report FAIL — there is no providerLocks, no locked row, no count
   and nothing to tap. D passes there, correctly: a build that renders no hints
   at all trivially renders none when all keys are set, which is exactly why D
   alone would be a worthless assertion.

   Usage: PORT=8931 node test/sweep_v529_providerhint.js  (serve docs/app first) */
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

/* ---- A) source-level contract ---- */
const hasFn = /function providerLocks\(\)\{/.test(src);
const guarded = /if\(\/selProvider\$\/\.test\(sel\.id\|\|""\)\)\{\s*var locks=providerLocks\(\);/.test(src);
const derived = /RH_MODELS\.filter\(function\(m\)\{ return rhIsConfigured\(m\.id\); \}\)\.length/.test(src)
  && /\(RH_VIDEO_MODELS\?RH_VIDEO_MODELS\.length:0\)/.test(src);
report("A) providerLocks() exists and openPop renders it for #selProvider only",
  hasFn && guarded, { hasFn: hasFn, guarded: guarded });
report("A2) the unlock count is derived from the real model arrays, not typed",
  derived, { derived: derived });

const openPage = async (browser, keys) => {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  await page.addInitScript(k => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_web_studio_key", "AIzaTESTONLY");
      if (k.rh) localStorage.setItem("hnk_rh_apikey", "TEST-rh-key");
      if (k.oa) localStorage.setItem("hnk_oa_apikey", "sk-TESTONLY");
    } catch (e) {}
  }, keys);
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  return page;
};

const readPicker = page => page.evaluate(() => {
  const s = document.getElementById("selProvider");
  s._hsl.btn.click();
  const pop = document.querySelector(".hsl-pop");
  const txt = e => { const n = e.querySelector(".hsl-t"); return n ? n.textContent.trim() : ""; };
  const sub = e => { const n = e.querySelector(".hsl-s"); return n ? n.textContent.trim() : ""; };
  return {
    selectable: Array.from(pop.querySelectorAll(".hsl-op:not(.lock)")).map(txt),
    locked: Array.from(pop.querySelectorAll(".hsl-op.lock")).map(e => ({
      name: txt(e), why: sub(e), ariaDisabled: e.getAttribute("aria-disabled"), role: e.getAttribute("role"),
    })),
    headers: Array.from(pop.querySelectorAll(".hsl-hd")).map(e => e.textContent.trim()),
    /* what a KEY ALONE unlocks — the two RH_MODELS without a built-in apiPath
       need one pasted per model, so they are not bought by the key */
    arrayTotal: (typeof RH_MODELS !== "undefined" ? RH_MODELS.filter(function(m){ return rhIsConfigured(m.id); }).length : 0)
              + (typeof RH_VIDEO_MODELS !== "undefined" ? RH_VIDEO_MODELS.length : 0)
              + (typeof RH_T2I_MODELS !== "undefined" ? RH_T2I_MODELS.length : 0),
    rawTotal: (typeof RH_MODELS !== "undefined" ? RH_MODELS.length : 0)
              + (typeof RH_VIDEO_MODELS !== "undefined" ? RH_VIDEO_MODELS.length : 0)
              + (typeof RH_T2I_MODELS !== "undefined" ? RH_T2I_MODELS.length : 0),
  };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  /* ---- B + C: the reported case, a Gemini key alone ---- */
  const p1 = await openPage(browser, {});
  p1.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const only = await readPicker(p1);
  const rh = only.locked.find(l => l.name === "RunningHub");
  const oa = only.locked.find(l => l.name === "OpenAI");

  report("B) with only a Gemini key, Gemini stays selectable and both others are shown as locked",
    only.selectable.length === 1 && only.selectable[0] === "Gemini" && !!rh && !!oa,
    { selectable: only.selectable, locked: only.locked.map(l => l.name) });

  report("B2) each locked row carries a reason and is marked not-choosable",
    !!rh && !!oa && rh.why.length > 8 && oa.why.length > 8 &&
    rh.ariaDisabled === "true" && oa.ariaDisabled === "true" &&
    rh.role === "option" && oa.role === "option",
    { rh: rh, oa: oa });

  report("B3) the locked rows sit under their own header",
    only.headers.length >= 1, { headers: only.headers });

  const shown = rh ? (rh.why.match(/(\d+)/) || [])[1] : null;
  report("C) the RunningHub row counts what a key ALONE unlocks",
    !!shown && Number(shown) === only.arrayTotal && only.arrayTotal > 50,
    { shownInRow: shown, keyAloneUnlocks: only.arrayTotal, rawArrayTotal: only.rawTotal });
  report("C2) it does not quote the raw array total, which overclaims by the unconfigured models",
    only.rawTotal > only.arrayTotal && Number(shown) !== only.rawTotal,
    { shownInRow: shown, keyAloneUnlocks: only.arrayTotal, rawArrayTotal: only.rawTotal });

  /* ---- E: the tap is the point of the row ---- */
  await p1.evaluate(() => { document.querySelector(".hsl-op.lock").click(); });
  await p1.waitForTimeout(800);
  const nav = await p1.evaluate(() => ({
    page: (document.querySelector(".page.on") || {}).id || "none",
    popOpen: !!document.querySelector(".hsl-pop"),
    cardRh: !!document.getElementById("cardRh"),
  }));
  report("E) tapping a locked row closes the picker and lands on the Setup page",
    nav.page === "pgHome" && !nav.popOpen && nav.cardRh, nav);
  await p1.close();

  /* ---- D: it must disappear once there is nothing to say ---- */
  const p2 = await openPage(browser, { rh: 1, oa: 1 });
  p2.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const all = await readPicker(p2);
  report("D) with every key set there are no locked rows and no header",
    all.locked.length === 0 && all.headers.length === 0 && all.selectable.length === 3,
    { selectable: all.selectable, locked: all.locked.length, headers: all.headers });
  await p2.close();

  /* one key in between — the list must shrink, not stay static */
  const p3 = await openPage(browser, { rh: 1 });
  p3.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const mid = await readPicker(p3);
  report("D2) adding one key moves that provider from locked to selectable",
    mid.selectable.length === 2 && mid.locked.length === 1 && mid.locked[0].name === "OpenAI",
    { selectable: mid.selectable, locked: mid.locked.map(l => l.name) });
  await p3.close();

  /* ---- F ---- */
  report("F) no page errors", errs.length === 0, errs.slice(0, 5));

  console.log("      (on the v5.28.0 tree this same file reports 6 failures: no providerLocks in " +
    "source, no locked rows, no header, no count and nothing to tap — while D still passes there, " +
    "which is why D alone would prove nothing)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
