/* sweep_v480_video_wf.js — the Video page gets one-tap workflows.

   pgVideo shipped as a bare textarea: no presets, no examples, nothing but a
   blinking cursor and a model dropdown. Measured before this change, the four
   Retouch card hosts and this page were the only generating surfaces in the
   app with zero one-tap work on them.

   The first workflow is BOARDING PASS TRAVEL, studied frame by frame from the
   reference clip (360x640, 13.33s, 30fps, h264): a woman walks left-to-right
   on a white cyclorama, a giant vertical boarding pass slides in from the
   right, she crosses behind it and is revealed inside the card re-costumed for
   the printed destination.

   Pinned contracts — every one of these is a way the feature can be shipped
   looking finished while being useless:

   A) The workflow exists, renders as a chip, and its destination row only
      appears once a workflow that HAS destinations is chosen.
   B) Tapping it fills the prompt AND sets model, resolution, duration and
      aspect. A preset that fills text and leaves a 16:9 720p 6s default
      behind produces the wrong video silently.
   C) The composed prompt fits the chosen model's promptMax. rhV2SubmitVideo
      clips at submit with no warning, so an over-length prompt reaches the
      endpoint truncated mid-sentence and the failure looks like a bad model.
      Checked for EVERY destination, not just the default one.
   D) The model it selects is one that can actually do the shot: aspect
      control (9:16 or the format is wrong) and a promptMax the text fits.
      RH Video G has neither — aspect:false and promptMax 800.
   E) Changing destination RE-COMPOSES the prompt rather than patching it —
      the city appears in three places (headline, local script, outfit), so a
      string-replace would leave a Bangkok sundress under a Seoul headline.
   F) No unsubstituted template placeholders survive into the prompt.
   G) The reference photo's own identity is pinned in the prompt text — this
      is a face the studio's customer is paying for, and the one instruction
      an image-to-video model most readily drops.
   H) Nine languages, no English fallback leaking into the Burmese UI.

   Usage: PORT=8931 node test/sweep_v480_video_wf.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 180)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const r = await page.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const out = {};
    document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
    $("pgVideo").classList.add("on");
    await new Promise(r => setTimeout(r, 300));

    const row = $("vidWfRow");
    out.chips = row.children.length;
    out.labels = Array.from(row.children).map(c => c.textContent.trim());
    out.optsHiddenBeforePick = $("vidWfOpts").style.display === "none";
    out.promptEmptyBefore = $("vidPrompt").value.length === 0;

    row.children[0].click();
    await new Promise(r => setTimeout(r, 250));

    out.optsShownAfterPick = $("vidWfOpts").style.display !== "none";
    out.cityChips = $("vidWfCityRow").children.length;
    out.setup = {
      model: $("selVidModel").value, res: $("selVidRes").value,
      dur: $("selVidDur").value, aspect: $("selVidAspect").value
    };
    out.aspectControlVisible = $("selVidAspect").style.display !== "none";

    /* C/F/G) every destination, not just the default */
    const m = rhVideoModelDef($("selVidModel").value);
    out.promptMax = m.promptMax;
    out.modelHasAspect = m.aspect === true;
    out.perCity = VID_CITIES.map(c => {
      const t = VID_WF[0].text(c);
      return {
        k: c.k,
        len: t.length,
        fits: t.length <= m.promptMax,
        placeholder: /\{[A-Za-z_]+\}/.test(t),
        namesCity: t.indexOf(c.en.toUpperCase()) >= 0 && t.indexOf(c.loc) >= 0,
        keepsIdentity: /face, bone structure, hair and identity stay exactly as the reference photo/.test(t)
      };
    });

    /* E) switching destination re-composes */
    const before = $("vidPrompt").value;
    const seoulIdx = VID_CITIES.findIndex(c => c.k === "seoul");
    $("vidWfCityRow").children[seoulIdx].click();
    await new Promise(r => setTimeout(r, 200));
    const after = $("vidPrompt").value;
    out.recompose = {
      changed: after !== before,
      hasSeoul: /SEOUL/.test(after),
      dropsBangkok: !/BANGKOK/.test(after) && !/曼谷/.test(after),
      outfitSwapped: /striped knit top/.test(after) && !/chiffon sundress/.test(after),
      countInSync: $("vidPromptCount").textContent.indexOf(String(after.length) + " /") === 0
    };
    return out;
  });

  /* H) nine languages on every new string this release adds.
     The app has no setLang() to call — switching language writes
     localStorage and calls location.reload(), so the strings are only
     produced by a fresh init. Probing in-page without the reload would read
     the previous language's DOM and pass on a lie. */
  const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
  const i18n = {};
  for (const L of LANGS) {
    await page.evaluate(l => localStorage.setItem("hnk_ws_lang", l), L);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    i18n[L] = await page.evaluate(async () => {
      document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
      document.getElementById("pgVideo").classList.add("on");
      /* the destination row and the workflow's own hint only exist once a
         workflow is chosen — read them in the state a user would see */
      document.getElementById("vidWfRow").children[0].click();
      await new Promise(r => setTimeout(r, 200));
      return {
        /* the h2 is a literal English product label with an icon child, per
           the phase-3 header pattern — read it, but never expect it to
           translate (see the FIELDS/myEqEn split below) */
        h2: document.getElementById("vidWfH2").textContent.trim(),
        intro: document.getElementById("vidWfIntro").textContent.trim(),
        cityH: document.getElementById("vidWfCityH").textContent.trim(),
        chip: ((document.getElementById("vidWfRow").children[0] || {}).textContent || "").trim(),
        hint: document.getElementById("vidWfHint").textContent.trim(),
        firstCity: ((document.getElementById("vidWfCityRow").children[0] || {}).textContent || "").trim()
      };
    });
  }

  report("A) the boarding-pass workflow renders as a chip and its destination row is gated on picking it",
    r.chips >= 1 && r.optsHiddenBeforePick === true && r.optsShownAfterPick === true && r.cityChips === 8,
    { chips: r.chips, labels: r.labels, cities: r.cityChips,
      hiddenBefore: r.optsHiddenBeforePick, shownAfter: r.optsShownAfterPick });

  report("B) one tap sets the prompt AND the model, resolution, duration and aspect",
    r.promptEmptyBefore === true && r.setup.model === "gemini-omni-video" &&
    r.setup.res === "1080p" && r.setup.dur === "10" && r.setup.aspect === "9:16",
    r.setup);

  const tooLong = r.perCity.filter(c => !c.fits);
  report("C) the composed prompt fits promptMax for EVERY destination — a clipped prompt fails silently at submit",
    tooLong.length === 0,
    { promptMax: r.promptMax, over: tooLong,
      lengths: r.perCity.map(c => c.k + ":" + c.len).join(" ") });

  report("D) it selects a model that can actually shoot this — aspect control and a big enough prompt ceiling",
    r.modelHasAspect === true && r.aspectControlVisible === true && r.promptMax >= 2048,
    { model: r.setup.model, aspect: r.modelHasAspect, visible: r.aspectControlVisible, promptMax: r.promptMax });

  report("E) changing destination re-composes the whole prompt, headline and outfit together",
    r.recompose.changed && r.recompose.hasSeoul && r.recompose.dropsBangkok &&
    r.recompose.outfitSwapped && r.recompose.countInSync,
    r.recompose);

  const ph = r.perCity.filter(c => c.placeholder).map(c => c.k);
  const noName = r.perCity.filter(c => !c.namesCity).map(c => c.k);
  report("F) no destination leaves an unsubstituted placeholder, and each names its city in both scripts",
    ph.length === 0 && noName.length === 0, { placeholders: ph, unnamed: noName });

  const noId = r.perCity.filter(c => !c.keepsIdentity).map(c => c.k);
  report("G) every destination pins the reference face — the instruction a video model drops first",
    noId.length === 0, { missing: noId });

  const FIELDS = ["h2", "intro", "cityH", "chip", "hint", "firstCity"];
  const empty = [];
  LANGS.forEach(L => FIELDS.forEach(k => { if (!i18n[L][k]) empty.push(L + "." + k); }));
  /* Burmese must be its own string on every field that carries prose. "h2" is
     excluded on purpose: VIDEO WORKFLOW is a product label the owner uses in
     English, and demanding a translation there would be pinning taste, not a
     contract. */
  const myEqEn = ["intro", "cityH", "hint", "firstCity"].filter(k => i18n.my[k] === i18n.en[k]);
  report("H) all nine languages fill the workflow chrome, and Burmese is not just the English string",
    empty.length === 0 && myEqEn.length === 0,
    { empty: empty, burmeseSameAsEnglish: myEqEn, my: i18n.my, en: i18n.en });

  report("no page errors", pageErrors.length === 0, pageErrors);

  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "");
  report("the catalogue is an array so a second video workflow is one entry away",
    /var VID_WF\s*=\s*\[/.test(stripped) && /var VID_CITIES\s*=\s*\[/.test(stripped));

  console.log("      (" + r.cityChips + " destinations, prompts " +
    Math.min.apply(null, r.perCity.map(c => c.len)) + "-" +
    Math.max.apply(null, r.perCity.map(c => c.len)) + " chars against a " +
    r.promptMax + "-char ceiling)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
