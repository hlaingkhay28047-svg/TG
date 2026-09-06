/* v5.94.0 — DOES THE PICTURE COME OUT AT THE SIZE AND SHAPE THAT WAS ASKED FOR?
 *
 * The owner's question, in their words: "quality နဲ့ size နဲ့ ratio ပိုင်းစစ်ပေးပါ
 * အမှန်ထွက်ရဲ့လား" — check the quality, size and ratio; do they really come out?
 *
 * The app already states the rule, in updateGenOptsForRHKind():
 *
 *     "a kind whose endpoint declares no ratio field hides Ratio; one with
 *      no size/resolution tier hides Size — never offered-but-ignored."
 *
 * It is enforced by two hand-written tables (noRatio, noSize) listing model
 * kinds. A table is a promise about behaviour, and nothing checked that the
 * promise matched the behaviour. Seedream v4 and v4.5 were the proof: the
 * "seedream" kind was missing from noRatio, so the Ratio control was shown
 * with all eight ratios while rhV2Body's seedream branch never reads `ratio`
 * at all. A student framed a 9:16 portrait, spent a credit, and received
 * whatever shape the model chose.
 *
 * So this test does not read the tables. It MEASURES: for every model in all
 * three catalogs it builds the real request body twice — once per ratio, and
 * once at 1K against 4K — and asks whether the body actually changed. A
 * control is honest only when shown-and-changes or hidden-and-unchanged.
 * Both mismatches fail:
 *
 *   - shown but ignored — the student picks a shape they will not get;
 *   - hidden but supported — the student cannot reach a shape the model has.
 *
 * Usage: PORT=8931 node test/verify_size_ratio_honesty.js  (serve docs/app) */
"use strict";
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const LANGS = ["my","en","shn","kac","th","zh","vi","id","ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  const A = await page.evaluate(() => {
    const ALL = ["1:1", "3:4", "4:3", "4:5", "9:16", "16:9", "2:3", "3:2"];
    const sel = document.getElementById("selRatio");
    const rows = [];
    RH_MODELS.forEach(m => {
      const cfg = rhModelCfgOut(m.id);
      /* what the UI decides for this model — its own honesty tables.
         rhCfg() re-parses localStorage on every call, so the active model has
         to be SAVED the way the app saves it (rhRenderConfiguredList's own
         handler); mutating the returned object is discarded, and an earlier
         cut of this test did exactly that and measured every control as
         "shown" because the active model never actually moved. */
      const cc = rhCfg();
      cc.activeModel = m.id;
      rhSaveCfg(cc);
      if (!rhIsConfigured(m.id)) return;   /* unconfigured models are unreachable */
      updateGenOptsForRHKind();
      const ratioShown = document.getElementById("selRatio").style.display !== "none";
      const sizeShown = document.getElementById("selSize").style.display !== "none";
      const offered = Array.from(sel.options).map(o => o.value).filter(Boolean);
      /* what the request body actually does with the pick */
      const bodyFor = (rt, sz) => { try { return JSON.stringify(rhV2Body(m.apiPath, ["u1"], "p", rt, sz, cfg)); } catch (e) { return "ERR:" + e; } };
      const list = offered.length ? offered : ALL;
      const distinct = new Set(list.map(rt => bodyFor(rt, "")));
      const ratioMatters = distinct.size > 1;
      /* v6.26.0 — the Size picker is narrowed per model (a model with its own resolution list offers exactly
         those tiers), so the honest question is whether the LOWEST and HIGHEST tier it offers reach the body. */
      const sizesOffered = Array.from(document.getElementById("selSize").options).map(o => o.value).filter(Boolean);
      const szLo = sizesOffered[0] || "1K", szHi = sizesOffered[sizesOffered.length - 1] || "4K";
      const sizeMatters = bodyFor("", szLo) !== bodyFor("", szHi);
      const firstReal = (offered.length ? offered : ALL).find(x => x !== "");
      const sizeMattersWithRatio = bodyFor(firstReal, szLo) !== bodyFor(firstReal, szHi);
      rows.push({ id: m.id, kind: cfg.kind || "", ratioShown, sizeShown,
        ratioMatters, sizeMatters, sizeMattersWithRatio, offered: list.length, distinct: distinct.size,
        sample: bodyFor(list[0], "").slice(0, 160) });
    });
    return rows;
  });

  const shownIgnored = A.filter(r => r.ratioShown && !r.ratioMatters);
  report("A) every model that SHOWS the Ratio control actually sends the ratio — none offers a shape it will not deliver",
    shownIgnored.length === 0,
    shownIgnored.map(r => r.id + " (kind:" + r.kind + ", offers " + r.offered + " ratios, body never changes) e.g. " + r.sample));

  /* the upscale kinds are excluded from A2 on purpose: they do NOT dispatch
     through rhV2Body at all (rhGenerateUpscale / rhGenerateUpscaleTransparent
     build their own body), so the ratio this harness sees in a rhV2Body probe
     is never sent. An upscale keeps the shape of the picture it is given —
     hiding Ratio there is correct, and an earlier cut of this test reported
     nine false defects by measuring a body that no upscale run ever sends. */
  const hiddenSupported = A.filter(r => !r.ratioShown && r.ratioMatters
    && r.kind !== "upscale" && r.kind !== "upscale-transparent");
  report("A2) and no model HIDES a Ratio control it would actually honour — a capability the student cannot reach is also a loss",
    hiddenSupported.length === 0, hiddenSupported.map(r => r.id + " (kind:" + r.kind + ")"));

  /* B is not "does size change the body with Ratio on Auto" — on the
     sizeParam/whParam kinds the pixel size is looked up FROM the ratio, so
     with Auto there is legitimately nothing to send. What must never happen
     is that the student is left believing their 4K pick was applied. So:
     either the size changes the request on its own, or it changes it once a
     ratio is picked AND the app says so on screen. */
  const sizeShownIgnored = A.filter(r => r.sizeShown && !r.sizeMatters && !r.sizeMattersWithRatio);
  report("B) every model that SHOWS the Size control does something with the size — on its own, or once a ratio is picked",
    sizeShownIgnored.length === 0, sizeShownIgnored.map(r => r.id + " (kind:" + r.kind + ")"));

  const needsRatio = A.filter(r => r.sizeShown && !r.sizeMatters && r.sizeMattersWithRatio);
  console.log("      (" + needsRatio.length + " models take their size FROM the ratio: "
    + needsRatio.map(r => r.id).join(", ") + ")");

  const sizeHiddenSupported = A.filter(r => !r.sizeShown && r.sizeMatters);
  report("B2) and no model hides a Size control it would honour",
    sizeHiddenSupported.length === 0, sizeHiddenSupported.map(r => r.id + " (kind:" + r.kind + ")"));

  console.log("      (" + A.length + " image models: " + A.filter(r => r.ratioShown).length
    + " show Ratio, " + A.filter(r => r.sizeShown).length + " show Size)");

  /* ---- C: the video shelf, where the same three controls exist ---- */
  const C = await page.evaluate(() => {
    const bad = [];
    RH_VIDEO_MODELS.forEach(m => {
      const b = (rt, res, dur) => { try { return JSON.stringify(rhVideoBodyForTest ? rhVideoBodyForTest(m, rt, res, dur) : null); } catch (e) { return "ERR"; } };
      /* the video page hides a control with no options — that contract is
         declared per model, so measure the declaration against itself */
      const hasRes = (m.resolutions || []).length > 0;
      const hasDur = (m.durations || []).length > 0;
      if (m.aspect && !(m.aspects || []).length && !hasRes && !hasDur) bad.push(m.id + ": aspect claimed with nothing else");
      if (!m.aspect && (m.aspects || []).length) bad.push(m.id + ": aspect list but aspect off");
      if ((m.resolutions || []).length === 0 && m.resolutionRequired) bad.push(m.id + ": resolution required with no enum");
    });
    return { total: RH_VIDEO_MODELS.length, bad };
  });
  report("C) no video model declares a shape control it has no values for, or values for a control it says it lacks",
    C.bad.length === 0, C.bad.slice(0, 8));
  console.log("      (" + C.total + " video models)");

  /* ---- D: and the student is TOLD, on screen, in their own language ---- */
  const D = await page.evaluate(({ langs }) => {
    /* pick a model whose size is looked up from the ratio */
    const m = RH_MODELS.find(x => x.sizeParam || x.whParam);
    const cc = rhCfg(); cc.activeModel = m.id; rhSaveCfg(cc);
    const out = { id: m.id, langs: {} };
    const size = document.getElementById("selSize"), ratio = document.getElementById("selRatio");
    langs.forEach(L => {
      window.LANG = L;
      size.value = "4K"; ratio.value = "";
      updateGenOptsForRHKind();
      const n = document.getElementById("genSizeNote");
      const shown = n && n.style.display !== "none" ? n.textContent : "";
      /* and it must go away once a ratio is chosen */
      ratio.value = Array.from(ratio.options).map(o => o.value).filter(Boolean)[0] || "1:1";
      updateGenOptsForRHKind();
      const after = n && n.style.display !== "none" ? n.textContent : "";
      out.langs[L] = { shown, cleared: after === "" };
    });
    window.LANG = "my";
    return out;
  }, { langs: LANGS });
  const noNote = LANGS.filter(L => !D.langs[L].shown || !/4K/.test(D.langs[L].shown));
  report("D) with Ratio on Auto, a 4K pick that will not be sent says so on screen, in all nine languages",
    noNote.length === 0, { model: D.id, missing: noNote, sample: D.langs.en });
  const notCleared = LANGS.filter(L => !D.langs[L].cleared);
  report("D2) and the warning goes away the moment a ratio is picked, so it never nags a student who has already fixed it",
    notCleared.length === 0, notCleared);

  report("E) no page error while any of this was measured", errs.length === 0, errs);

  console.log("\n" + (failures === 0
    ? "All checks passed — every shape and size control that is shown is a control that reaches the engine."
    : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
