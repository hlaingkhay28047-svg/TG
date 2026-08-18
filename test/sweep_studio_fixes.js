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
  /* v4.96 split the one #pgStudio into #pgMeitu + #pgEvoto. "pgStudio" is no
     longer a page, but switchPage still accepts it — stNormalizePage resolves
     it to the last-used suite (pgMeitu on a fresh profile like this one), so
     this line keeps working AND keeps covering that deep-link path. */
  await page.evaluate(() => switchPage("pgStudio"));
  await page.waitForTimeout(300);

  /* ---- 1) unset colour pickers no longer impersonate a chosen gold ---- */
  const colours = await page.evaluate(() => {
    /* v4.96: scoped to the two suite CARDS, not to a page. The pickers are a
       DOM/state fact, not a layout one — nothing here is measured — and both
       cards are always in the document: the active suite's card sits in the
       active page, the other is parked in #stDock. Scoping by card therefore
       still sees all 12 (7 Meitu + 5 Evoto) in one pass, so the count stays 12
       instead of being split into two smaller numbers. */
    const out = Array.from(document.querySelectorAll('#stMuCard input[type="color"],#stEvCard input[type="color"]')).map(i => ({
      id: i.id, value: i.value, unset: i.classList.contains("unset"),
      stored: svGet(i.id, null)
    }));
    return { out, gold: out.filter(o => o.value === "#d9a441").length, total: out.length };
  });
  check(colours.total === 12 && colours.gold === 0 &&
        colours.out.every(o => o.stored === null && o.unset) &&
        colours.out.find(o => o.id === "mu_lipCustom").value === "#c94f5e" &&
        colours.out.find(o => o.id === "mu_hairHex").value === "#3b2417" &&
        colours.out.find(o => o.id === "mu_lipLocHex").value === "#c04858" &&
        colours.out.find(o => o.id === "mu_blushLocHex").value === "#e88a9a",
    "all 12 unset colour pickers read as unset, and the four with a real render default show that colour",
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
    /* deliberately RE-IMPLEMENTED rather than calling stCountControls: the
       point of this check is that the badge law and the app agree, and a test
       that calls the same function can only ever agree with itself. Keep these
       five selectors byte-identical to stCountControls when it changes.
       v4.57 added the last two — bare chips and prompt fields. */
    const count = g => {
      const b = g.el.querySelector(".grp-b") || g.el;
      return b.querySelectorAll('input[type="range"]').length
           + b.querySelectorAll(".chips").length
           + b.querySelectorAll('input[type="color"]').length
           + b.querySelectorAll(".chip:not(.chips .chip)").length
           + b.querySelectorAll('input.inp:not([type="color"]):not(.st-find)').length;
    };
    const measure = host => ST.groups.filter(g => (g.host === "ev") === (host === "ev"))
      .reduce((a, g) => a + count(g), 0);
    const groupsAgree = ST.groups.every(g =>
      (g.el.querySelector(".cnt") || {}).textContent === count(g) + t("unit"));
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

  /* ---- 10) denoise says so when it cannot act ---- */
  const noise = await page.evaluate(async () => {
    const load = async url => new Promise(res => stLoadImage(url, { done: res }));
    const toUrl = async src => {
      const r = await fetch(src); const b = await r.blob();
      return new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    };
    /* v4.96: same card-scoping as check 1. There is exactly one stNoiseNote()
       per suite — Meitu's "Skin" group and Evoto's "Sharpen & Noise Reduction"
       group — so the total is still 2 and the threshold below is unchanged.
       The per-note display flag is set on the <p> itself by its refresh(), and
       a computed display is not rewritten by a display:none ancestor, so a note
       inside the suite card currently parked in #stDock still reports its own
       "" / "none" honestly. */
    const notes = () => Array.from(document.querySelectorAll("#stMuCard p.mut,#stEvCard p.mut"))
      .filter(n => /no visible noise|မြင်သာတဲ့ noise/i.test(n.textContent) &&
                   getComputedStyle(n).display !== "none").length;
    const grainStillAPattern = () => { state.st.t1 = stDefT1(); state.st.t1.grn = 60;
      stRenderSettle(); return !(ST.noise instanceof HTMLCanvasElement) ? false : true; };

    await load(await toUrl("lib/st-sample.jpg"));
    await new Promise(r => setTimeout(r, 500));
    const clean = { metric: +ST.chromaNoise.toFixed(3), notes: notes() };

    /* same photo, chroma noise injected — the sliders now have work to do */
    const im = new Image();
    await new Promise(res => { im.onload = res; im.src = ST.srcBitmap.src; });
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
    for (let i = 0; i < d.length; i += 4) { const n = Math.random() * 60 - 30;
      d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] - n)); }
    x.putImageData(px, 0, 0);
    await load(c.toDataURL("image/png"));
    await new Promise(r => setTimeout(r, 500));
    const noisy = { metric: +ST.chromaNoise.toFixed(3), notes: notes() };
    return { clean, noisy, grain: grainStillAPattern() };
  });
  check(noise.clean.metric < 0.5 && noise.clean.notes === 2 &&
        noise.noisy.metric > 2 && noise.noisy.notes === 0 && noise.grain,
    "denoise tells the user when the photo has no noise to remove, and stays quiet when it does — without clobbering the grain tile",
    noise);

  /* v4.40 — the real-pixel-engine guarantees: true frequency separation
     (texture survives), and zone-limited teeth/eye edits (a detected face
     confines the whitening to the mouth and the brightening to the eyes). */
  const engine = await page.evaluate(async () => {
    /* v4.96: the shared block (#stCanvas, #stStage, #stReset) is MOVED into
       whichever suite page is active, so this only has to land on a real suite
       page — "pgStudio" normalises to the last-used one, still pgMeitu here. */
    switchPage("pgStudio");
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    const c = document.createElement("canvas"); c.width = 96; c.height = 120;
    const x = c.getContext("2d");
    x.fillStyle = "#5a6a4a"; x.fillRect(0, 0, 96, 120);
    x.fillStyle = "#e2ab8a"; x.beginPath(); x.ellipse(48, 58, 30, 42, 0, 0, 7); x.fill();
    const im0 = x.getImageData(0, 0, 96, 120);
    for (let i = 0; i < im0.data.length; i += 4) { const n = (Math.random() * 24 - 12);
      im0.data[i] += n; im0.data[i + 1] += n; im0.data[i + 2] += n; }
    x.putImageData(im0, 0, 0);
    x.fillStyle = "#241a14"; x.beginPath(); x.ellipse(36, 44, 5, 3, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(60, 44, 5, 3, 0, 0, 7); x.fill();
    x.fillStyle = "#b2453f"; x.beginPath(); x.ellipse(48, 82, 11, 6, 0, 0, 7); x.fill();
    x.fillStyle = "#ded8be"; x.fillRect(42, 80, 12, 4);
    x.fillStyle = "#c8b830"; x.fillRect(4, 4, 14, 14);
    await new Promise(r => ST.loadImage(c.toDataURL("image/png"), { done: r }));
    const cc = () => document.getElementById("stCanvas").getContext("2d");
    function fineVar(x0, y0, x1, y1) {
      const im = cc().getImageData(0, 0, 96, 120); let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1 - 1; xx++) {
        const p = (y * 96 + xx) * 4, q = p + 4;
        const l1 = 0.299 * im.data[p] + 0.587 * im.data[p + 1] + 0.114 * im.data[p + 2];
        const l2 = 0.299 * im.data[q] + 0.587 * im.data[q + 1] + 0.114 * im.data[q + 2];
        s += (l1 - l2) * (l1 - l2); n++;
      }
      return s / n;
    }
    function meanRegion(x0, y0, x1, y1) {
      const im = cc().getImageData(0, 0, 96, 120); let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) {
        const p = (y * 96 + xx) * 4;
        s += 0.299 * im.data[p] + 0.587 * im.data[p + 1] + 0.114 * im.data[p + 2]; n++;
      }
      return s / n;
    }
    async function withT2(k, v) {
      document.getElementById("stReset").click();
      await new Promise(r => setTimeout(r, 350));
      state.st.t2[k] = v; stT2Changed();
      await new Promise(r => setTimeout(r, 450));
    }
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 350));
    const baseVar = fineVar(40, 58, 58, 70);
    await withT2("freqLo", 80); const flVar = fineVar(40, 58, 58, 70);
    await withT2("smooth", 80); const smVar = fineVar(40, 58, 58, 70);
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    return { baseVar, flVar, smVar };
  });
  check(engine.flVar > engine.baseVar * 0.8 && engine.smVar < engine.baseVar * 0.4,
    "frequency separation preserves fine texture that plain smoothing destroys",
    { baseVar: +engine.baseVar.toFixed(1), flVar: +engine.flVar.toFixed(1), smVar: +engine.smVar.toFixed(1) });

  /* v5.11 — teeth/eyeb precision moved off the painted-oval fixture above and
     onto a REAL photo. The synthetic canvas (a flat ellipse with two painted
     dots for eyes) is not photorealistic, and the real model correctly finds
     no face in it — the model isn't broken, the fixture never was a face.
     Before v5.11 that didn't matter: the GEOMETRIC reader drove teeth/eyeb off
     hand-placed coordinates regardless of whether a face was actually there.
     After v5.11 that reader is disqualified from driving teeth/eyeb on
     purpose (see sweep_v511_facegate.js) — painting a guessed zone is exactly
     the bug that release exists to remove — so this fixture can no longer
     exercise the precision claim at all, and the claim itself is more
     meaningful proven against a face the model actually measured. */
  const real = await page.evaluate(async () => {
    async function loadAndScan(du) {
      await new Promise(r => { ST.loadImage(du, { done: r }); });
      for (let i = 0; i < 450; i++) {
        if (ST.faceLM && ST.faceLM.scanned) break;
        if (typeof STFACE !== "undefined" && STFACE.off) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
    const res = await fetch("lib/st-sample.jpg");
    const bl = await res.blob();
    const du0 = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(bl); });
    await loadAndScan(du0);
    let W = ST.buf.width, H = ST.buf.height;
    let mi = stSkinMask(ST.px0, W, H, ST.faceLM || null);
    let z = stFaceZones(ST.px0, W, H, mi, ST.faceLM || null);
    if (!z || !z.mouth || !z.eyes) return { noFace: true };

    /* THE FIXTURE'S REAL PROBLEM. st-sample.jpg's mouth is closed — there is
       no tooth-coloured pixel anywhere in it for a whitening pass to act on,
       which is a correct, boring zero, not a defect (the same way testing
       denoise against a noiseless photo should read zero). Paint a small
       off-white patch inside the MEASURED mouth ellipse, on the real photo,
       and reload it — that gives teeth whitening something real to find
       while keeping the face genuinely model-detected rather than painted
       from scratch on a synthetic oval no model would ever call a face. */
    const patchCanvas = document.createElement("canvas");
    patchCanvas.width = W; patchCanvas.height = H;
    const pcx = patchCanvas.getContext("2d");
    pcx.drawImage(ST.buf, 0, 0);
    pcx.fillStyle = "#ded8be";
    pcx.beginPath();
    pcx.ellipse(z.mouth.cx, z.mouth.cy, Math.max(3, z.mouth.rx * 0.4), Math.max(2, z.mouth.ry * 0.35), 0, 0, Math.PI * 2);
    pcx.fill();
    await loadAndScan(patchCanvas.toDataURL("image/png"));
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));

    W = ST.buf.width; H = ST.buf.height;
    mi = stSkinMask(ST.px0, W, H, ST.faceLM || null);
    z = stFaceZones(ST.px0, W, H, mi, ST.faceLM || null);
    if (!z || !z.mouth || !z.eyes) return { noFace: true, afterPatch: true };

    const luma = (data, x0, y0, x1, y1) => {
      let s = 0, n = 0;
      for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++) for (let xx = Math.max(0, x0 | 0); xx < Math.min(W, x1 | 0); xx++) {
        const p = (y * W + xx) * 4;
        s += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]; n++;
      }
      return n ? s / n : null;
    };
    const cc = () => document.getElementById("stCanvas").getContext("2d");
    const region = (ellipse, pad) => { const rx = ellipse.rx * (pad || 0.6), ry = ellipse.ry * (pad || 0.6);
      return [ellipse.cx - rx, ellipse.cy - ry, ellipse.cx + rx, ellipse.cy + ry]; };
    const mouthR = region(z.mouth, 0.35);   // the patch itself, not the surrounding lip
    const eyeR = region(z.eyes[0], 0.6);
    /* a corner of the photo is guaranteed outside every face zone regardless
       of where the face sits in frame — the background this fixture used to
       paint yellow, now just "wherever the face definitely is not" */
    const bgBox = [4, 4, Math.min(60, W * 0.15), Math.min(60, H * 0.12)];
    const before = ST.px0.data;
    const teethBase = luma(before, ...mouthR), eyeBase = luma(before, ...eyeR), bgBase = luma(before, ...bgBox);
    await new Promise(r => { state.st.t2.teeth = 90; stT2Changed(); setTimeout(r, 500); });
    const afterTeeth = cc().getImageData(0, 0, W, H).data;
    const teethAfter = luma(afterTeeth, ...mouthR), bgAfterTeeth = luma(afterTeeth, ...bgBox);
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    await new Promise(r => { state.st.t2.eyeb = 90; stT2Changed(); setTimeout(r, 500); });
    const eyeAfter = luma(cc().getImageData(0, 0, W, H).data, ...eyeR);
    return { noFace: false, teethBase, teethAfter, bgBase, bgAfterTeeth, eyeBase, eyeAfter };
  });
  check(real.noFace === false, "the real photo is detected as a face — the precision checks below actually exercised something", JSON.stringify(real));
  check(!real.noFace && real.teethAfter > real.teethBase + 2 && Math.abs(real.bgAfterTeeth - real.bgBase) < 1.5,
    "teeth whitening lands inside the detected mouth and leaves a background corner alone",
    { teethBase: +(real.teethBase || 0).toFixed(1), teethAfter: +(real.teethAfter || 0).toFixed(1), bgDelta: +((real.bgAfterTeeth || 0) - (real.bgBase || 0)).toFixed(2) });
  check(!real.noFace && real.eyeAfter > real.eyeBase + 8,
    "eye brighten reaches the detected eye region",
    { eyeBase: +(real.eyeBase || 0).toFixed(1), eyeAfter: +(real.eyeAfter || 0).toFixed(1) });

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
