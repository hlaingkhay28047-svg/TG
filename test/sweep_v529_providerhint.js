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

   v5.50.0 — ONE ENGINE. Gemini and OpenAI are removed outright (owner
   decision), so the picker's job narrows but does not vanish: a studio
   without a RunningHub key still opens a picker that must EXPLAIN, not sit
   silent — one locked RunningHub hint row with the reason, the derived
   count, and a tap to the Setup card. With the key saved the hint is gone.
   B/B2/D below now pin that; the three-provider scenarios left with the
   providers they described.

   Usage: PORT=8931 node test/sweep_v529_providerhint.js  (serve docs/app first) */
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

/* ---- A) source-level contract ---- */
const hasFn = /function providerLocks\(\)\{/.test(src);
/* The guard names both ids explicitly. It was originally an end-anchored
   /selProvider$/, which covered the wizard's #wiz_selProvider clone only by
   accident — pinning the explicit form stops that quietly narrowing to one id
   and silently dropping the hint for wizard users. */
const guarded = /if\(sel\.id === "selProvider" \|\| sel\.id === "wiz_selProvider"\)\{\s*var locks=providerLocks\(\);/.test(src);
/* The dim MUST come from a keyframe. .hsl-op runs a both-filled animation that
   ends at opacity:1, so a plain .hsl-op.lock{opacity:.6} is overridden and
   measured 1 — the rows looked exactly like real choices. G below measures it,
   but pin the mechanism too so nobody "simplifies" it back. */
const dimByKeyframe = /@keyframes hslInLock\{from\{opacity:0;transform:translateY\(-4px\)\}to\{opacity:\.62;transform:none\}\}/.test(src)
  && /\.hsl-op\.lock\{animation-name:hslInLock\}/.test(src);
const derived = /RH_MODELS\.filter\(function\(m\)\{ return rhIsConfigured\(m\.id\); \}\)\.length/.test(src)
  && /\(RH_VIDEO_MODELS\?RH_VIDEO_MODELS\.length:0\)/.test(src);
report("A) providerLocks() exists and openPop renders it for both provider pickers",
  hasFn && guarded, { hasFn: hasFn, guarded: guarded });
report("A3) the dim is a keyframe, not a declaration the entrance animation overrides",
  dimByKeyframe, { dimByKeyframe: dimByKeyframe });
report("A2) the unlock count is derived from the real model arrays, not typed",
  derived, { derived: derived });

const openPage = async (browser, keys) => {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  await page.addInitScript(k => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      /* v5.50.0 — the only key that exists any more */
      if (k.rh) localStorage.setItem("hnk_rh_apikey", "TEST-rh-key");
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

/* v5.39.0 — E AND H WERE BOTH UNFALSIFIABLE. Neither seeded an account, so the
   access wall pinned the app to pgHome before either tap happened: "lands on
   the Setup page" was already true, and would have stayed true with the tap
   handler deleted. The other half of E was `!!document.getElementById("cardRh")`
   — a node the static HTML ships unconditionally, so it could not detect
   setupJump failing either. Both now start somewhere else and assert the tap
   MOVED them, and E records the element setupJump actually scrolled to rather
   than asking whether a div exists. */
(async () => {
  const browser = withPremium(await chromium.launch());
  const errs = [];

  /* ---- B + C: v5.50.0's reported case — NO RunningHub key yet ---- */
  const p1 = await openPage(browser, {});
  p1.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const only = await readPicker(p1);
  const rh = only.locked.find(l => l.name === "RunningHub");

  report("B) with no RunningHub key the picker still explains itself: the one engine row plus one locked RunningHub hint row",
    only.selectable.length === 1 && only.selectable[0] === "RunningHub" &&
    only.locked.length === 1 && !!rh,
    { selectable: only.selectable, locked: only.locked.map(l => l.name) });

  report("B2) the locked row carries a reason and is marked not-choosable",
    !!rh && rh.why.length > 8 && rh.ariaDisabled === "true" && rh.role === "option",
    { rh: rh });

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
  const before = await p1.evaluate(() => {
    /* start somewhere the tap has to move us AWAY from, and record what
       setupJump scrolls to — the real effect, rather than whether a div the
       HTML always ships happens to exist */
    if (typeof switchPage === "function") switchPage("pgWf");
    window.__scrolled = [];
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      try { window.__scrolled.push(this.id || this.className || "?"); } catch (e) {}
      return real.apply(this, arguments);
    };
    return (document.querySelector(".page.on") || {}).id || "none";
  });
  await p1.waitForTimeout(300);
  await p1.evaluate(() => { document.querySelector(".hsl-op.lock").click(); });
  await p1.waitForTimeout(800);
  const nav = await p1.evaluate(() => ({
    page: (document.querySelector(".page.on") || {}).id || "none",
    popOpen: !!document.querySelector(".hsl-pop"),
    scrolled: window.__scrolled || [],
  }));
  report("E) tapping a locked row closes the picker, moves to Setup and scrolls to the RunningHub card",
    before !== "pgHome" && nav.page === "pgHome" && !nav.popOpen &&
    nav.scrolled.indexOf("cardRh") >= 0,
    { before, nav });
  await p1.close();

  /* ---- D: it must disappear once there is nothing to say. v5.50.0 — one
     key is now EVERY key, so the old D2 midpoint (one of three keys) has no
     separate scenario left and is folded into this. ---- */
  const p2 = await openPage(browser, { rh: 1 });
  p2.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const all = await readPicker(p2);
  report("D) with the RunningHub key set there are no locked rows and no header — the hint never becomes a permanent nag",
    all.locked.length === 0 && all.headers.length === 0 &&
    all.selectable.length === 1 && all.selectable[0] === "RunningHub",
    { selectable: all.selectable, locked: all.locked.length, headers: all.headers });
  await p2.close();

  /* ---- G: the dim has to be VISIBLE, not just declared ---- */
  const p4 = await openPage(browser, {});
  p4.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  await readPicker(p4);
  await p4.waitForTimeout(700);          /* past --dur-2 plus the 180ms max stagger */
  const dim = await p4.evaluate(() => {
    const l = document.querySelector(".hsl-pop .hsl-op.lock");
    const n = document.querySelector(".hsl-pop .hsl-op:not(.lock)");
    return { lock: getComputedStyle(l).opacity, selectable: getComputedStyle(n).opacity };
  });
  report("G) a locked row actually RENDERS dimmed, and a selectable one does not",
    parseFloat(dim.lock) < 0.8 && parseFloat(dim.selectable) > 0.95, dim);
  await p4.close();

  /* ---- H: the wizard clone gets the hint, and the tap dismisses the wizard ----
     The wizard mirrors #selProvider as #wiz_selProvider on its last step, and
     that step is only reachable once the workflow's image slots are filled —
     hence the 1x1 PNGs. Driving the real wizard rather than faking one: the
     dismissal goes through the wizard's own X, so a mock would only be testing
     the mock. */
  const PX1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const p5 = await openPage(browser, {});
  p5.on("pageerror", e => errs.push(String(e).slice(0, 180)));
  const wiz = await p5.evaluate(async px => {
    state.refs[0] = { mime: "image/png", b64: px };
    state.refs[1] = { mime: "image/png", b64: px };
    if (typeof renderRefs === "function") renderRefs();
    switchPage("pgWf");
    await new Promise(r => setTimeout(r, 700));
    const startedOn = (document.querySelector(".page.on") || {}).id || "none";
    const card = document.querySelector("#pgWf .wfmini, #pgWf .pcard");
    if (!card) return { reachedClone: false, why: "no workflow card" };
    card.click();
    await new Promise(r => setTimeout(r, 800));
    for (let i = 0; i < 5 && !document.getElementById("wiz_selProvider"); i++) {
      const gold = Array.from(document.querySelectorAll("#wiz button"))
        .filter(b => /btn-gold/.test(b.className));
      if (!gold.length) break;
      gold[gold.length - 1].click();
      await new Promise(r => setTimeout(r, 550));
    }
    const clone = document.getElementById("wiz_selProvider");
    if (!clone || !clone._hsl) return { reachedClone: false, why: "clone not built" };
    clone._hsl.btn.click();
    await new Promise(r => setTimeout(r, 400));
    const locked = document.querySelectorAll(".hsl-pop .hsl-op.lock").length;
    const row = document.querySelector(".hsl-pop .hsl-op.lock");
    if (row) row.click();
    await new Promise(r => setTimeout(r, 800));
    return {
      reachedClone: true, lockedRowsInWizard: locked, startedOn,
      wizStillOpen: /(^|\s)on(\s|$)/.test(document.getElementById("wiz").className),
      bodyOverflow: document.body.style.overflow,
      page: (document.querySelector(".page.on") || {}).id || "none",
      popStillOpen: !!document.querySelector(".hsl-pop"),
    };
  }, PX1);
  /* A wizard whose flow changed shape must not turn into a silent pass. */
  report(wiz.reachedClone
      ? "H) in the wizard the hint shows, and tapping it dismisses the wizard cleanly"
      : "H) the wizard's provider clone was not reached — this assertion proved nothing",
    wiz.reachedClone === true && wiz.startedOn === "pgWf" &&
    wiz.lockedRowsInWizard > 0 && wiz.wizStillOpen === false &&
    wiz.bodyOverflow === "" && wiz.page === "pgHome" && wiz.popStillOpen === false,
    wiz);
  await p5.close();

  /* ---- F ---- */
  report("F) no page errors", errs.length === 0, errs.slice(0, 5));

  console.log("      (on the v5.28.0 tree this same file reports 6 failures: no providerLocks in " +
    "source, no locked rows, no header, no count and nothing to tap — while D still passes there, " +
    "which is why D alone would prove nothing)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
