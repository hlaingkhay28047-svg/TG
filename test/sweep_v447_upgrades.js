/* v4.47.0 regression sweep — Retouch V2: mouth-lock + body retouch.

   The owner reported a real drift: a closed-lip smile came back with the
   mouth open (teeth showing). Root cause was the always-on "teeth slightly
   cleaner and brighter" clause — an explicit teeth TASK that let the model
   ride the guard's "unless the TASK changes them" escape and part the lips.

   Pinned contracts:
   A) Default prompt mentions NO teeth work at all; lips are cleaned "exactly
      as they are photographed"; PRESERVE carries the mouth lock ("a closed
      mouth stays closed", "never add or widen a smile").
   B) Teeth is an opt-in control whose fragment acts ONLY on already-visible
      teeth and forbids parting the lips.
   C) New face controls render and compose: eyes (no shape/openness change),
      under-eye circles.
   D) Body skin retouch control: neck/chest/shoulders/arms/hands/back pass,
      strong adds elbows/knees/veins.
   E) Body shape is opt-in, two-state (off/subtle), capped at 5%, and flips
      the PRESERVE line from "No liquify, no reshaping" to the
      single-refinement wording; a note appears when armed.
   F) The shared TASK GUARD core carries the mouth lock for every dispatcher
      request (V2, presets, bundles, Path, Studio alike).
   G) All five new keys persist through saveState (LS_STATE.v2).

   Usage: PORT=8931 node test/sweep_v447_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const out = {};
    switchPage("pgRetouch");
    await new Promise(r2 => setTimeout(r2, 300));
    Object.assign(state.v2, { teeth: "off", eyes: "off", eyebags: "off", body: "off", shape: "off", mode: "both" });
    renderV2Hero();
    let p = v2BuildPrompt();
    out.A_noTeethDefault = p.indexOf("TEETH:") < 0 && p.indexOf("teeth slightly") < 0;
    out.A_lipsInPlace = p.indexOf("exactly as they are photographed") >= 0;
    out.A_mouthLock = p.indexOf("a closed mouth stays closed") >= 0 && p.indexOf("never add or widen a smile") >= 0;
    out.A_noLiquify = p.indexOf("No liquify, no reshaping") >= 0;

    state.v2.teeth = "soft"; renderV2Hero(); p = v2BuildPrompt();
    out.B_optIn = p.indexOf("TEETH: ONLY where teeth are already visible") >= 0 && p.indexOf("NEVER part the lips") >= 0;

    state.v2.eyes = "soft"; state.v2.eyebags = "strong"; renderV2Hero(); p = v2BuildPrompt();
    out.C_eyes = p.indexOf("EYES: brighten the eye whites") >= 0 && p.indexOf("no change to eye shape, size or openness") >= 0;
    out.C_eyebags = p.indexOf("UNDER-EYE: reduce dark circles") >= 0;
    out.C_rows = ["v2TeethChips", "v2EyesChips", "v2EyebagChips", "v2BodyChips", "v2ShapeChips"]
      .every(id => document.getElementById(id) && document.getElementById(id).querySelectorAll(".chip").length >= 2);

    state.v2.body = "strong"; renderV2Hero(); p = v2BuildPrompt();
    out.D_body = p.indexOf("BODY SKIN: retouch ALL visible body skin") >= 0 &&
      p.indexOf("neck, chest, shoulders, arms, hands, back") >= 0 &&
      p.indexOf("smooth rough elbows") >= 0;
    state.v2.body = "soft"; renderV2Hero();
    out.D_softNoElbows = v2BuildPrompt().indexOf("smooth rough elbows") < 0;

    state.v2.shape = "subtle"; renderV2Hero(); p = v2BuildPrompt();
    out.E_shape = p.indexOf("BODY SHAPE (explicitly requested)") >= 0 && p.indexOf("at most 5% slimmer") >= 0;
    out.E_preserveAdapts = p.indexOf("No reshaping beyond the single subtle silhouette refinement") >= 0 &&
      p.indexOf("No liquify, no reshaping,") < 0;
    out.E_note = document.getElementById("v2ShapeNote").style.display !== "none";
    out.E_twoState = document.getElementById("v2ShapeChips").querySelectorAll(".chip").length === 2;

    out.F_guard = D.guards.core.indexOf("a closed mouth stays closed") >= 0 &&
      D.guards.core.indexOf("never add or widen a smile") >= 0;

    saveState();
    const saved = JSON.parse(localStorage.getItem("hnk_web_studio_v2_state") || "{}");
    out.G_persist = saved.v2 && saved.v2.body === "soft" && saved.v2.shape === "subtle" &&
      saved.v2.teeth === "soft" && saved.v2.eyes === "soft" && saved.v2.eyebags === "strong";

    /* preview honesty still holds with the new fragments */
    out.preview = document.getElementById("v2PromptPreview").textContent.indexOf("BODY SHAPE (explicitly requested)") >= 0;

    Object.assign(state.v2, { teeth: "off", eyes: "off", eyebags: "off", body: "off", shape: "off" });
    renderV2Hero(); saveState();
    return out;
  });

  report("A) default prompt: no teeth clause, lips in place, mouth locked in PRESERVE, no-liquify intact",
    r.A_noTeethDefault && r.A_lipsInPlace && r.A_mouthLock && r.A_noLiquify, r);
  report("B) teeth is opt-in and can never part the lips", r.B_optIn, r);
  report("C) eyes + under-eye controls render and compose safely", r.C_eyes && r.C_eyebags && r.C_rows, r);
  report("D) body-skin pass covers the body list; strong adds elbows/knees/veins", r.D_body && r.D_softNoElbows, r);
  report("E) body shape: opt-in two-state, 5% cap, PRESERVE adapts, note shown",
    r.E_shape && r.E_preserveAdapts && r.E_note && r.E_twoState, r);
  report("F) shared TASK GUARD carries the mouth lock for every dispatcher run", r.F_guard, r);
  report("G) all five new v2 keys persist through saveState", r.G_persist, r);
  report("preview honesty holds with the new fragments", r.preview, r);
  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
