/* Studio honesty sweep — the controls stop lying about what they did.

   Every check here was measured red against v4.33.0 before the fix, so each one
   pins a defect a photographer could actually hit:

     1. ten colour pickers rendered brand gold while unset, so "not chosen" and
        "amber chosen" were the same pixels — and re-confirming the shown swatch
        stored nothing, making the control look dead
     2. Frame Width read 0% while the renderer drew at 40, so the first nudge
        made the frame ~2.7x thinner and "reset this slider" changed the picture
     3. Reset announced "all adjustments reset" but left Bride/Groom armed, so
        the next GENERATE silently retouched one person only
     4. Evoto Color Grading was pinned to k:45 with no Amount, so the subtle end
        of the grade was unreachable while its Meitu sibling had the full range
     5. twelve sub-sliders were gated on a master the UI never mentioned: the
        readout lit gold, nothing queued, no pixel moved
     6. both suite badges read 79 — a sum of 31 hand-typed literals that matched
        neither suite and made Evoto look the same size as Meitu

   Usage: PORT=8931 node test/sweep_studio_fixes.js   (serve docs/app on $PORT) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

let failures = 0;
function check(ok, label, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + label + (ok ? "" : "  " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on("pageerror", e => { console.log("PAGEERROR:", String(e).slice(0, 300)); failures++; });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => switchPage("pgStudio"));
  await page.waitForTimeout(300);

  /* ---- 1) unset colour pickers no longer impersonate a chosen gold ---- */
  const colours = await page.evaluate(() => {
    const out = Array.from(document.querySelectorAll('#pgStudio input[type="color"]')).map(i => ({
      id: i.id, value: i.value, unset: i.classList.contains("unset"),
      stored: svGet(i.id, null)
    }));
    return { out, gold: out.filter(o => o.value === "#d9a441").length, total: out.length };
  });
  check(colours.total === 10 && colours.gold === 0 &&
        colours.out.every(o => o.stored === null && o.unset) &&
        colours.out.find(o => o.id === "mu_lipCustom").value === "#c94f5e" &&
        colours.out.find(o => o.id === "mu_hairHex").value === "#3b2417",
    "all 10 unset colour pickers read as unset, and the two with a real render default show that colour",
    colours);

  /* re-confirming the swatch already on screen must commit it (change, not input) */
  const confirmed = await page.evaluate(() => {
    const i = document.getElementById("st_grade_evSh");
    i.dispatchEvent(new Event("change"));
    return { stored: svGet("st_grade_evSh", null), unset: i.classList.contains("unset") };
  });
  check(confirmed.stored === "#808080" && confirmed.unset === false,
    "confirming the shown swatch stores it — the control is no longer dead on a same-value pick",
    confirmed);

  /* ---- 2) Frame Width agrees with the renderer ---- */
  const frame = await page.evaluate(() => {
    state.st.v = {};
    stRefreshUI();
    const inp = document.getElementById("st_frameW");
    const val = inp.parentElement.querySelector(".st-val");
    return { shown: inp.value, text: val.textContent, pipe: stPipeVals().frameW };
  });
  check(frame.shown === "40" && frame.text === "40%" && frame.pipe === 40,
    "Frame Width shows the width the renderer actually draws with", frame);

  /* ---- 3) Reset clears the retouch target ---- */
  const reset = await page.evaluate(() => {
    state.st.target = "bride";
    svSet("mu_eyeSize", 35);
    state.st.t1.bri = 22;
    document.getElementById("stReset").click();
    return { target: state.st.target, v: Object.keys(state.st.v).length, bri: state.st.t1.bri };
  });
  check(reset.target === "all" && reset.v === 0 && reset.bri === 0,
    "Reset clears the retouch target too, so the next GENERATE cannot silently retouch one person",
    reset);

  /* ---- 4) Evoto Color Grading has a reachable Amount ---- */
  const grade = await page.evaluate(() => {
    state.st.v = {}; stRefreshUI();
    const amt = document.getElementById("st_grade_evAmt");
    if (!amt) return { missing: true };
    svSet("st_grade_evSh", "#ff2000");
    const atDefault = stPipeVals().gradeZones.map(z => z.k);
    svSet("st_grade_evAmt", 90);
    const at90 = stPipeVals().gradeZones.map(z => z.k);
    svSet("st_grade_evAmt", 10);
    const at10 = stPipeVals().gradeZones.map(z => z.k);
    return { shown: amt.value, atDefault, at90, at10 };
  });
  check(!grade.missing && grade.shown === "45" &&
        grade.atDefault[0] === 45 && grade.at90[0] === 90 && grade.at10[0] === 10,
    "Evoto grading strength is a real control: 45 by default (so saved recipes render unchanged) and reachable from 10 to 90",
    grade);

  /* ---- 5) a sub-slider moved off zero seeds the master it depends on ---- */
  const seeded = [];
  for (const [child, parent] of [["ev_freckle", "ev_blemish"], ["ev_dwFine", "ev_dressWrinkle"]]) {
    const r = await page.evaluate(([c, p]) => {
      state.st.v = {}; state.st.pend = []; stRefreshUI();
      const before = { parent: svGet(p, 0), pend: state.st.pend.length };
      const inp = document.getElementById(c);
      inp.value = "70";
      inp.dispatchEvent(new Event("input"));
      return { child: c, parent: p, before, after: { parent: svGet(p, 0), pend: state.st.pend.length } };
    }, [child, parent]);
    seeded.push(r);
  }
  check(seeded.every(r => r.before.parent === 0 && r.before.pend === 0 &&
                          r.after.parent > 0 && r.after.pend > 0),
    "dragging a sub-slider whose master is still 0 seeds the master, so the edit actually reaches the queue",
    seeded);

  /* the eye subs hang off a canvas param rather than a v-key */
  const eyeSeed = await page.evaluate(() => {
    state.st.v = {}; state.st.t2 = stDefT2(); state.st.pend = []; stRefreshUI();
    const before = state.st.t2.eyeb || 0;
    const inp = document.getElementById("ev_ebIris");
    inp.value = "55";
    inp.dispatchEvent(new Event("input"));
    return { before, after: state.st.t2.eyeb || 0, pend: state.st.pend.length };
  });
  check(eyeSeed.before === 0 && eyeSeed.after > 0 && eyeSeed.pend > 0,
    "the same rule covers the eye sub-sliders, whose master lives in the canvas params", eyeSeed);

  /* ---- 6) suite badges are counted, not typed ---- */
  const badges = await page.evaluate(() => {
    const measure = host => ST.groups.filter(g => (g.host === "ev") === (host === "ev"))
      .reduce((a, g) => {
        const b = g.el.querySelector(".grp-b") || g.el;
        return a + b.querySelectorAll('input[type="range"]').length
                 + b.querySelectorAll(".chips").length
                 + b.querySelectorAll('input[type="color"]').length;
      }, 0);
    const groupsAgree = ST.groups.every(g => {
      const b = g.el.querySelector(".grp-b") || g.el;
      const n = b.querySelectorAll('input[type="range"]').length
              + b.querySelectorAll(".chips").length
              + b.querySelectorAll('input[type="color"]').length;
      return (g.el.querySelector(".cnt") || {}).textContent === n + t("unit");
    });
    return {
      mu: document.getElementById("stMeituCount").textContent,
      ev: document.getElementById("stEvotoCount").textContent,
      measuredMu: measure("mu"), measuredEv: measure("ev"), groupsAgree
    };
  });
  check(Number(badges.mu) === badges.measuredMu && Number(badges.ev) === badges.measuredEv &&
        badges.mu !== badges.ev && badges.groupsAgree,
    "every suite and group badge equals the controls actually in it, and the two suites no longer claim the same size",
    badges);

  /* ---- 7) Reset is recoverable ---- */
  const undone = await page.evaluate(() => {
    state.st.v = {}; state.st.t1 = stDefT1(); state.st.pend = [];
    svSet("mu_eyeSize", 35); state.st.t1.bri = 22; state.st.target = "bride";
    stRefreshUI();
    document.getElementById("stReset").click();
    const afterReset = { eye: svGet("mu_eyeSize", 0), bri: state.st.t1.bri, target: state.st.target };
    const act = document.querySelector("#toast .toast-act");
    const offered = !!act;
    if (act) act.click();
    return { afterReset, offered,
      afterUndo: { eye: svGet("mu_eyeSize", 0), bri: state.st.t1.bri, target: state.st.target } };
  });
  check(undone.offered &&
        undone.afterReset.eye === 0 && undone.afterReset.bri === 0 && undone.afterReset.target === "all" &&
        undone.afterUndo.eye === 35 && undone.afterUndo.bri === 22 && undone.afterUndo.target === "bride",
    "Reset offers an Undo that restores the whole setup — sliders, canvas params and the target",
    undone);

  /* ---- 8) the readout steps back one drag before going to the default ---- */
  const twoStage = await page.evaluate(() => {
    state.st.v = {}; stRefreshUI();
    const inp = document.getElementById("mu_eyeSize");
    const val = inp.parentElement.querySelector(".st-val");
    inp.dispatchEvent(new Event("pointerdown"));       // deliberate drag
    inp.value = "27"; inp.dispatchEvent(new Event("input"));
    const good = svGet("mu_eyeSize", 0);
    inp.dispatchEvent(new Event("pointerdown"));       // the wrong drag
    inp.value = "100"; inp.dispatchEvent(new Event("input"));
    const bad = svGet("mu_eyeSize", 0);
    val.click(); const back = svGet("mu_eyeSize", 0);   // first tap: undo the drag
    val.click(); const def = svGet("mu_eyeSize", 0);    // second tap: default
    return { good, bad, back, def };
  });
  check(twoStage.good === 27 && twoStage.bad === 100 && twoStage.back === 27 && twoStage.def === 0,
    "one tap on the value returns the pre-drag number, a second tap goes to the default",
    twoStage);

  /* ---- 9) a second preset keeps the snapshot of the user's own work ---- */
  const snap = await page.evaluate(() => {
    state.st.v = {}; state.st.t1 = stDefT1(); state.st.preset = null; ST.presetSnap = null;
    svSet("mu_eyeSize", 42);                       // the hand-built look
    const cards = (typeof ST_PRESETS_MU !== "undefined" ? ST_PRESETS_MU : []).slice(0, 2);
    if (cards.length < 2) return { skipped: true };
    stApplyPreset(cards[0]);
    stApplyPreset(cards[1]);                       // step across, not back
    stApplyPreset(cards[1]);                       // tap again = restore
    return { eye: svGet("mu_eyeSize", 0), preset: state.st.preset };
  });
  check(snap.skipped || (snap.eye === 42 && snap.preset === null),
    "tapping a preset twice returns to the user's own look, not to the previous preset", snap);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
