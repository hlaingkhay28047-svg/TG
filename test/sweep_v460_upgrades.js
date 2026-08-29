/* v4.60.0 regression sweep — three lies on the last screen before a paid run.

   A) #wfSearch's Enter key picked from the PREVIOUS query's result set.
      oninput wrapped the whole filter in setTimeout(...,120) while onkeydown's
      Enter read `it.el.style.display` synchronously. Type "veil", hit Enter
      inside 120ms, and the wizard opens whatever matched "vei" — or, on the
      first search of a session, the very first card on the page. With a phone
      keyboard whose enterkeyhint is "search", that race is the normal path.

   B) The wizard's step-3 footer counted every loaded photo, but runWizGenerate
      nulls every slot past the workflow's own input count before dispatching:
        for(var ri=inputs.length; ri<state.refs.length; ri++) state.refs[ri]=null;
      So a 2-input workflow with 3 photos loaded promised "Images: 3" and sent 2.

   C) The same footer read "prompt 1847 chars · RunningHub engine · guards
      included" even when the active RunningHub model is an upscale endpoint.
      rhV2SubmitUpscale's body is {imageUrl, scale} and nothing else, and the
      dispatcher routes kind==="upscale" there with no prompt argument at all.
      Every one of those characters was discarded: the operator paid for an
      enlargement and the workflow they chose never ran.

   Usage: PORT=8931 node test/sweep_v460_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 860 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  /* ---- A) Enter must flush the debounce, not race it ---- */
  const A = await page.evaluate(async () => {
    const out = {};
    const s = document.getElementById("wfSearch");
    /* seed a different query so the "previous result set" is genuinely different */
    s.value = "veil"; s.oninput.call(s);
    await new Promise(r => setTimeout(r, 200));
    /* v4.81 — scoped to #wfHost: pgVideo renders its own .wfmini cards now,
       and they are never touched by the workflow search, so a document-wide
       selector would count six cards this assertion has no business seeing. */
    const afterVeil = Array.from(document.querySelectorAll("#wfHost .wfmini"))
      .filter(e => e.style.display !== "none").length;

    /* now type a query with a KNOWN different first hit and press Enter
       immediately — inside the 120ms window */
    s.value = "upscale"; s.oninput.call(s);
    let opened = null;
    const realOpen = window._openWizardById;
    /* capture which card Enter actually activates by watching the wizard */
    const before = document.getElementById("wiz").className;
    s.onkeydown({ key: "Enter" });
    const wizOn = document.getElementById("wiz").className.indexOf("on") >= 0;
    /* the visible set at the moment Enter ran must already be "upscale"'s */
    const visNow = Array.from(document.querySelectorAll("#wfHost .wfmini"))
      .filter(e => e.style.display !== "none");
    out.afterVeil = afterVeil;
    out.visAtEnter = visNow.length;
    out.firstTitle = visNow.length ? (visNow[0].textContent || "").trim().slice(0, 40) : "";
    out.wizOpened = wizOn;
    /* and the filter must have been applied synchronously, i.e. the count line
       already reflects "upscale" */
    out.countLine = (document.getElementById("wfCount") || {}).textContent || "";
    /* clean up */
    document.getElementById("wiz").className = before;
    s.value = ""; s.oninput.call(s);
    await new Promise(r => setTimeout(r, 200));
    /* structural: the filter is a named function and Enter flushes the timer */
    out.named = typeof wfApplyFilterProbe === "undefined";  // not exported; checked via source below
    return out;
  });

  const SRC = require("fs").readFileSync("docs/app/index.html", "utf8");
  const A_named = /function wfApplyFilter\(\)/.test(SRC);
  const A_debounced = /oninput=function\(\)\{\s*clearTimeout\(_wfT\);\s*_wfT=setTimeout\(wfApplyFilter,120\);/.test(SRC);
  const A_flush = /"Enter"\)\{[\s\S]{0,220}?clearTimeout\(_wfT\); wfApplyFilter\(\);[\s\S]{0,200}?style\.display!=="none"/.test(SRC);
  const A_esc = /"Escape"\)\{[\s\S]{0,120}?clearTimeout\(_wfT\); wfApplyFilter\(\);/.test(SRC);

  report("A) the filter is a named function the debounce calls",
    A_named && A_debounced, { named: A_named, debounced: A_debounced });
  report("A) Enter flushes the pending filter BEFORE picking the first visible card",
    A_flush, { flushBeforePick: A_flush });
  report("A) Escape flushes too, rather than re-entering the 120ms wait",
    A_esc, { escFlush: A_esc });
  report("A) after Enter the visible set is the CURRENT query's, and it opened something",
    A.visAtEnter > 0 && A.wizOpened && /upscale/i.test(A.firstTitle + A.countLine + ""),
    { visible: A.visAtEnter, first: A.firstTitle, opened: A.wizOpened, count: A.countLine });

  /* ---- B + C) the step-3 footer, driven through the real UI ---- */
  const BC = await page.evaluate(async () => {
    const out = {};
    const px = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const mk = () => ({ mime: "image/png", b64: px });
    /* three photos loaded — more than most workflows declare */
    state.refs[0] = mk(); state.refs[1] = mk(); state.refs[2] = mk();
    /* open a real workflow and walk it to step 3 via its own buttons */
    const card = document.querySelector("#pgWf .wfmini");
    if (!card) return { skipped: "no workflow cards" };
    card.onclick();
    await new Promise(r => setTimeout(r, 120));
    for (let guard = 0; guard < 6; guard++) {
      const foot = document.querySelector("#wizIn .wizrow");
      if (foot) break;
      const next = Array.from(document.querySelectorAll("#wizIn button"))
        .filter(b => /→/.test(b.textContent) && !/←/.test(b.textContent)).pop();
      const fast = document.querySelector("#wizIn .wiz-fast");
      (fast || next || {}).click && (fast || next).click();
      await new Promise(r => setTimeout(r, 120));
    }
    const foots = Array.from(document.querySelectorAll("#wizIn .wiz-body p.mut"));
    out.footText = foots.map(f => f.textContent).join(" || ").slice(0, 300);
    out.reachedStep3 = !!document.querySelector("#wizIn .wizrow");
    /* close */
    const x = document.querySelector("#wizIn .wiz-x"); if (x) x.click();
    state.refs = [null, null, null];
    return out;
  });
  report("B/C) the wizard reaches step 3 and its footer renders",
    !BC.skipped && BC.reachedStep3 && /Images:|ပုံ|ภาพ|图片/.test(BC.footText),
    BC);

  /* the wizard internals are inside a closure, so B and C are pinned from the
     shipped source plus a DOM read after driving the UI */
  const B_countsSent = /var wizNIn=wizInputs\(w\)\.length;\s*var n=state\.refs\.slice\(0,wizNIn\)\.filter\(Boolean\)\.length;/.test(SRC);
  const B_reportsDrop = /var nDrop=state\.refs\.filter\(Boolean\)\.length-n;/.test(SRC) &&
    /if\(nDrop>0\) head \+= " " \+ t\("wiz_drop"\)/.test(SRC);
  const B_matchesDispatch = /for\(var ri=inputs\.length; ri<state\.refs\.length; ri\+\+\) state\.refs\[ri\]=null;/.test(SRC);
  report("B) the footer counts the photos that will be SENT, not the photos that are loaded",
    B_countsSent && B_matchesDispatch,
    { countsSent: B_countsSent, dispatchStillNulls: B_matchesDispatch });
  report("B) and it says so when a loaded photo will be dropped",
    B_reportsDrop, { reportsDrop: B_reportsDrop });

  const C_detects = /if\(ac && \(ac\.kind==="upscale" \|\| ac\.kind==="upscale-transparent"\)\) rhUp=ac;/.test(SRC);
  const C_warns = /wfoot\.textContent=head\+" · "\+t\("wiz_noprompt"\)\.replace\("\{M\}"/.test(SRC);
  const C_styled = /wfoot\.className="mut warn";/.test(SRC) && /\.mut\.warn\{color:var\(--err\)\}/.test(SRC);
  /* the premise: the upscale endpoint genuinely cannot take a prompt */
  /* v5.20.0: rhV2SubmitUpscale gained a trailing `signal` param (Stop-button
     wiring via fetchWithTimeout) — the premise itself (no prompt field in
     the body) is unchanged, so the pin follows the signature, not drops it */
  const C_premise = /async function rhV2SubmitUpscale\(apiKey, apiPath, imageUrl, scale, signal\)\{\s*var body = \{ imageUrl: imageUrl\|\|"", scale: scale\|\|"2x" \};/.test(SRC);
  /* v5.50.0 — the dispatcher's active-model variable is plain `rhActive` now
     (the fallback-chain naming left with the retired providers); the pinned
     premise is unchanged: the upscale route gets NO prompt argument. */
  const C_dispatch = /rhGenerateUpscale\(state\.rhKey, rhActive\.apiPath, refDataUrls, sizeSel, onTick, genAbort\.signal\)/.test(SRC);
  report("C) an upscale endpoint really cannot take a prompt, and the dispatcher really sends none",
    C_premise && C_dispatch, { body: C_premise, dispatch: C_dispatch });
  report("C) the footer detects an upscale model and says the prompt will be discarded",
    C_detects && C_warns, { detects: C_detects, warns: C_warns });
  report("C) that warning is not styled as muted grey",
    C_styled, { styled: C_styled });

  /* every new string in all nine languages */
  const L = await page.evaluate(() => {
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    const KEYS = ["wiz_drop", "wiz_noprompt"];
    const missing = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) missing.push(l + "." + k);
    }));
    /* the warning must name the model and the way out */
    return { missing, hasModelSlot: (TR.wiz_noprompt.en || "").indexOf("{M}") >= 0,
      namesWayOut: /Setup/i.test(TR.wiz_noprompt.en || ""),
      dropSlot: (TR.wiz_drop.en || "").indexOf("{N}") >= 0 };
  });
  report("every new string exists in all nine languages, names the model and the way out",
    L.missing.length === 0 && L.hasModelSlot && L.namesWayOut && L.dropSlot, L);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
