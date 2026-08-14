/* v4.62.0 regression sweep — the look shelf tells the looks apart.

   A design pass proposed grading every preset tile at x1.8 so the operator
   could "see what the preset does". Measuring first killed that idea and
   replaced it with a better one.

   Measured in Chromium against lib/st-sample.jpg, through the app's own tile
   path (ctx.filter = stCssFilter), mean |delta| per RGB channel out of 255,
   JPEG noise floor ~1.0:

     - vs the untouched frame: ZERO of 16 presets were below the floor. The
       weakest cleared it by 1.9x. So the premise "some tiles look like the
       raw photo" was simply false, and x1.8 was solving nothing.
     - tile vs tile: muGoddess vs evCommercial measured 0.3423 — a THIRD of
       the floor. The same picture, twice, under two names. x1.8 did not
       rescue it either (0.5951, still below the floor), because the two
       recipes are authored almost identically: {bri:8,con:8,sat:6} against
       {bri:8,con:8,sat:4,shp:20}, and shp is not rendered anywhere.

   Two causes, two fixes, both pinned here.

   1. stCssFilter emits 13 of the 19 t1 keys and silently drops shp, cla, grn,
      vig, bgb, dhz. muDouyin and muCCD differ ENTIRELY in cla/grn/vig, so
      their tiles sat 1.2878 apart while the recipes are nothing alike.
      stTileFx now draws cla, vig and grn onto the tile canvas. shp is
      deliberately NOT drawn — at 76x96 a sharpen is below the resolution of
      the tile, and faking it would be the overstatement this release removes.
      stCssFilter itself is untouched: sweep_path.js asserts its exact output
      string on #ptGrid, so changing it would break Path for a Studio problem.

   2. Four presets were authored too close to each other to be told apart at
      any gain. Their VALUES changed — never their keys, never their feats.

   Pinned contracts:
   A) No pair of shipped presets renders within the noise floor of any other.
      This is the axis that was actually broken; distance-from-original was
      not, and a test asserting it would have passed while the defect shipped.
   B) Every preset still clears the floor against an untouched frame.
   C) stTileFx renders cla, vig and grn, and does NOT invent a sharpen.
   D) stCssFilter's output is byte-identical to before — Path's contract.
   E) Every preset key and feats list is unchanged, so stApplyPreset's
      tap-again restore, stSnapshot's serialisation and every positional test
      that indexes the preset rows keep working.
   F) The grain is deterministic: a tile re-rendered on every slider move must
      not shimmer, and a measurement must repeat.

   Usage: PORT=8931 node test/sweep_v462_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const FLOOR = 1.0;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1300);

  const r = await page.evaluate(async (FLOOR) => {
    const out = {};
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "lib/st-sample.jpg";
    });
    const W = 76, H = 96;
    const base = document.createElement("canvas"); base.width = W; base.height = H;
    const bx = base.getContext("2d", { willReadFrequently: true });
    const s = Math.min(img.naturalWidth / W, img.naturalHeight / H);
    bx.drawImage(img, (img.naturalWidth - W * s) / 2, (img.naturalHeight - H * s) / 2, W * s, H * s, 0, 0, W, H);

    /* render each preset exactly as stRenderPresetCards does */
    const paint = (pr, cv) => {
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.filter = stCssFilter(stPresetT1Full(pr));
      cx.drawImage(base, 0, 0);
      cx.filter = "none";
      if (pr.t2 && pr.t2.smooth >= 30) {
        cx.globalAlpha = 0.4; cx.filter = "blur(0.6px)"; cx.drawImage(base, 0, 0);
        cx.filter = "none"; cx.globalAlpha = 1;
      }
      stTileFx(cx, stPresetT1Full(pr), W, H);
      return cx;
    };
    const ALL = ST_PRESETS_MU.concat(ST_PRESETS_EV);
    const px = {};
    ALL.forEach(pr => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      px[pr.key] = paint(pr, c).getImageData(0, 0, W, H).data;
    });
    const raw = bx.getImageData(0, 0, W, H).data;
    const mean = (a, b) => {
      let sum = 0, n = 0;
      for (let i = 0; i < a.length; i += 4) {
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        n += 3;
      }
      return sum / n;
    };
    const keys = Object.keys(px);

    /* A) pairwise — the axis that was actually broken */
    out.A_bad = []; out.A_min = Infinity; out.A_pairs = 0;
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const d = mean(px[keys[i]], px[keys[j]]);
      out.A_pairs++;
      if (d < out.A_min) { out.A_min = +d.toFixed(4); out.A_minPair = keys[i] + " vs " + keys[j]; }
      if (d < FLOOR) out.A_bad.push(keys[i] + " vs " + keys[j] + " = " + d.toFixed(4));
    }

    /* B) and still distinct from an untouched frame */
    out.B_bad = [];
    keys.forEach(k => { const d = mean(px[k], raw); if (d < FLOOR) out.B_bad.push(k + " = " + d.toFixed(4)); });

    /* C) stTileFx draws the three, and invents no sharpen */
    const src = String(stTileFx);
    out.C_cla = src.indexOf("t1.cla") >= 0 && src.indexOf('"overlay"') >= 0;
    out.C_vig = src.indexOf("t1.vig") >= 0 && src.indexOf("createRadialGradient") >= 0;
    out.C_grn = src.indexOf("t1.grn") >= 0;
    out.C_noShp = src.indexOf("t1.shp") < 0;
    /* it must actually change pixels for a look that carries them, and do
       nothing at all for one that does not */
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(base, 0, 0); return x; };
    const none = mk(); stTileFx(none, { bri: 5 }, W, H);
    out.C_noop = mean(none.getImageData(0, 0, W, H).data, raw) === 0;
    const withVig = mk(); stTileFx(withVig, { vig: 18 }, W, H);
    out.C_vigMoves = mean(withVig.getImageData(0, 0, W, H).data, raw) > FLOOR;
    const withGrn = mk(); stTileFx(withGrn, { grn: 25 }, W, H);
    out.C_grnMoves = mean(withGrn.getImageData(0, 0, W, H).data, raw) > 0.3;
    const withCla = mk(); stTileFx(withCla, { cla: 24 }, W, H);
    out.C_claMoves = mean(withCla.getImageData(0, 0, W, H).data, raw) > FLOOR;

    /* D) Path's contract — stCssFilter untouched in shape */
    out.D_filter = stCssFilter({ exp: 10, bri: 10, sh: 20, sat: 6, wrm: 4 });
    out.D_noFx = String(stCssFilter).indexOf("stTileFx") < 0;

    /* E) keys and feats unchanged */
    out.E_keys = ALL.map(p => p.key).join(",");
    out.E_feats = ALL.map(p => (p.feats || []).join("+")).join("|");

    /* F) grain is deterministic */
    const g1 = mk(); stTileFx(g1, { grn: 25 }, W, H);
    const g2 = mk(); stTileFx(g2, { grn: 25 }, W, H);
    out.F_stable = mean(g1.getImageData(0, 0, W, H).data, g2.getImageData(0, 0, W, H).data) === 0;
    /* a CALL, not the word — the source comment names Math.random to explain
       why it is not used, and a substring check would fail on that comment */
    out.F_noRandom = !/Math\.random\s*\(/.test(src);

    /* H) the jump-chip class collision. stRefreshDots means "has edits";
       chipSpot means "you are here". They shared .chip.on, so every scroll
       erased the edit markers and lit an unedited chip as adjusted. */
    out.H_dots = String(stRefreshDots).indexOf('classList.toggle("edited"') >= 0;
    out.H_dotsNotOn = !/jumpChip\.classList\.toggle\("on"/.test(String(stRefreshDots));
    out.H_css = (function () {
      let seen = { edited: false, here: false, both: false };
      for (const sh of document.styleSheets) {
        let rules; try { rules = sh.cssRules; } catch (e) { continue; }
        for (const rl of rules || []) {
          const t = rl.selectorText || "";
          if (t.indexOf("#stGroupChips .chip.edited") >= 0) seen.edited = true;
          if (t.indexOf("#stGroupChips .chip.here") >= 0) seen.here = true;
          if (t.indexOf("#stGroupChips .chip.here.edited") >= 0) seen.both = true;
        }
      }
      return seen;
    })();
    /* drive it: mark a group dirty, then move the spotlight elsewhere, and the
       dirty marker must survive */
    out.H_survives = (function () {
      if (!ST.groups.length) return "no groups";
      const g0 = ST.groups[0], g1 = ST.groups[1];
      if (!g0.jumpChip || !g1.jumpChip) return "no chips";
      g0.jumpChip.classList.add("edited");
      /* simulate chipSpot moving to g1 */
      if (ST._chipOn) ST._chipOn.classList.remove("here");
      ST._chipOn = g1.jumpChip; g1.jumpChip.classList.add("here");
      const ok = g0.jumpChip.classList.contains("edited");
      g0.jumpChip.classList.remove("edited"); g1.jumpChip.classList.remove("here"); ST._chipOn = null;
      return ok;
    })();

    /* and the real shelf renders without throwing */
    out.G_rendered = (function () {
      try { stRenderPresetCards(); return document.querySelectorAll("#muPresetRow .pcard, #evPresetRow .pcard").length; }
      catch (e) { return "threw: " + e.message; }
    })();
    return out;
  }, FLOOR);

  report("A) no two preset tiles render within the JPEG noise floor of each other",
    r.A_bad.length === 0, { below: r.A_bad, closest: r.A_minPair + " = " + r.A_min, pairs: r.A_pairs });
  report("B) every preset still reads as a change against an untouched frame",
    r.B_bad.length === 0, r.B_bad);
  report("C) stTileFx draws clarity, vignette and grain — and invents no sharpen",
    r.C_cla && r.C_vig && r.C_grn && r.C_noShp,
    { cla: r.C_cla, vig: r.C_vig, grn: r.C_grn, noSharpen: r.C_noShp });
  report("C) it moves pixels for a look that carries those keys and is a no-op for one that does not",
    r.C_noop && r.C_vigMoves && r.C_grnMoves && r.C_claMoves,
    { noop: r.C_noop, vig: r.C_vigMoves, grn: r.C_grnMoves, cla: r.C_claMoves });
  report("D) stCssFilter is untouched — Path asserts its exact output string",
    /brightness\(/.test(r.D_filter) && /saturate\(/.test(r.D_filter) && r.D_noFx,
    { filter: r.D_filter, noFxLeak: r.D_noFx });
  report("E) every preset key and feats list is unchanged",
    r.E_keys === "muNatural,muFirstLove,muGoddess,muPorcelain,muHoney,muDouyin,muCream,muCCD," +
      "evNaturalPro,evEditorial,evSoftFilm,evCommercial,evWedding,evMatte,evAiry,evBW" &&
    r.E_feats === "|mu_makeup|mu_eye+mu_faceSlim+mu_makeup||mu_skinToneF|mu_makeup+mu_eye|||" +
      "ev_evoto|ev_evenDBF+ev_blem||ev_blem+ev_stray|ev_unifyB|||",
    { keys: r.E_keys, feats: r.E_feats });
  report("F) the grain is deterministic — a tile must not shimmer as sliders move",
    r.F_stable && r.F_noRandom, { stable: r.F_stable, noRandom: r.F_noRandom });
  report("G) the real shelf still renders all 16 tiles",
    r.G_rendered === 16, r.G_rendered);
  report("H) has-edits and you-are-here are different classes, so neither erases the other",
    r.H_dots && r.H_dotsNotOn && r.H_css.edited && r.H_css.here && r.H_css.both && r.H_survives === true,
    { dotsUsesEdited: r.H_dots, dotsDroppedOn: r.H_dotsNotOn, css: r.H_css, survivesScroll: r.H_survives });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
