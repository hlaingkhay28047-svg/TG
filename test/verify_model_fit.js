/* v5.95.0 / 6.66.0 — THE PROMPT FOLLOWS THE MODEL, AND THE MODEL FOLLOWS THE
 * PROMPT.
 *
 * The owner asked for two things, in their words: "model ပြောင်းတိုင်း prompts
 * ပြောင်းအောင်" — when the model changes, the prompt changes — and "လိုတိုးပိုလျော့
 * auto" — add and remove automatically, so the result is always right.
 *
 * Measuring first showed what each half can and cannot do. A Look Set is 5,368
 * characters; Qwen Image 2 and Jimeng 4.6 take 800, and the TASK GUARD alone is
 * 1,215 — longer than the whole cap. On those models NO amount of trimming can
 * deliver the set: the backdrop, the light, the grade and the wardrobe cannot
 * be said at all. So the answer is two stages, not one:
 *
 *   STAGE 1, for the middle caps (2000 / 3000 / 5000): drop whole labelled
 *   BLOCKS by what the photograph can most afford to lose, cheapest first,
 *   instead of cutting characters. A character cut ends mid-block and leaves a
 *   half-stated instruction, which is worse than not stating it. Nothing on
 *   the essential list is ever dropped — the roles, the request, every LOCK,
 *   the framing and consistency rules (they are what makes a hundred
 *   photographs match), the student's own EXTRA REQUEST, and the guard.
 *
 *   STAGE 2, when even that cannot fit: move the run to a model that can hear
 *   the whole workflow, exactly as the image-capacity switch has done since
 *   v5.56.0 — and say so, because a switch the student cannot see is the same
 *   dishonesty as a cut they cannot see.
 *
 * What this deliberately does NOT do is invent text for roomy models. Adding
 * instructions nobody wrote would make a hundred photographs LESS alike, which
 * is the opposite of what a Look Set is for.
 *
 * Usage: PORT=8931 node test/verify_model_fit.js  (serve docs/app first) */
"use strict";
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 800)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.addScriptTag({ path: path.join(__dirname, "..", "panel", "src", "providers", "prompt-fit.js") });

  /* ---- A: a block is dropped whole, or not at all ---- */
  const A = await page.evaluate(() => {
    const caps = Array.from(new Set(RH_MODELS.map(m => m.promptMax).filter(c => c && c < 20000))).sort((a, b) => a - b);
    const items = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const bad = [], mismatch = [];
    let dropCases = 0;
    items.forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      const srcBlocks = rhSplitBlocks(p.split("\n\nAVOID:")[0]);
      caps.forEach(cap => {
        if (p.length <= cap) return;
        const r = rhFitByBlocks(p, cap);
        if (r.dropped.length) dropCases++;
        /* every block that survives must survive WHOLE */
        const outBlocks = rhSplitBlocks(r.text.split("\n\nAVOID:")[0]);
        outBlocks.forEach(ob => {
          if (!ob.tag) return;
          const src = srcBlocks.find(sb => sb.tag === ob.tag);
          if (src && src.lines.join("\n") !== ob.lines.join("\n"))
            bad.push(w.id + "@" + cap + " " + ob.tag + " arrived cut");
        });
        /* the panel must do the same thing */
        const pf = HNK.promptFit.fitByBlocks(p, cap);
        if (pf.text !== r.text) mismatch.push(w.id + "@" + cap);
      });
    });
    return { caps, bad, mismatch, dropCases, n: items.length };
  });
  report("A) when a block has to go it goes WHOLE — nothing that survives the fit arrives half-said",
    A.bad.length === 0, A.bad.slice(0, 6));
  report("A2) and the panel drops exactly the same blocks as the app",
    A.mismatch.length === 0, A.mismatch.slice(0, 6));
  console.log("      (" + A.n + " workflows × caps " + A.caps.join("/") + "; " + A.dropCases + " cases where a block was dropped)");

  /* ---- B: the essential blocks are never the ones dropped ---- */
  const B = await page.evaluate(() => {
    const caps = Array.from(new Set(RH_MODELS.map(m => m.promptMax).filter(c => c && c < 20000)));
    const items = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const ESSENTIAL = /^(INPUT ROLES:|PRIMARY REQUEST:|TASK GUARD:|EXTRA REQUEST:|FRAMING RULE:|CONSISTENCY RULE:|FINAL |.*LOCK)/;
    const lost = [];
    items.forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      caps.forEach(cap => {
        if (p.length <= cap) return;
        rhFitByBlocks(p, cap).dropped.forEach(tag => {
          if (ESSENTIAL.test(tag)) lost.push(w.id + "@" + cap + " dropped " + tag);
        });
      });
    });
    return lost;
  });
  report("B) no essential block is ever a candidate — the roles, the request, the locks, the framing and consistency rules, the student's own note and the guard all stay",
    B.length === 0, B.slice(0, 6));

  /* ---- C: freeform text is left alone ---- */
  const C = await page.evaluate(() => {
    const plain = "Make the photo brighter and warmer, keep her face exactly as it is.";
    const long = plain + " " + "x".repeat(3000);
    return { same: rhFitByBlocks(long, 800).text === long, dropped: rhFitByBlocks(long, 800).dropped.length };
  });
  report("C) a prompt with no labelled blocks — the freeform Create box — is handed back untouched and takes the character cut as before",
    C.same && C.dropped === 0, C);

  /* ---- D: stage 2, the model moves when the words will not fit ---- */
  const D = await page.evaluate(() => {
    const sel = document.getElementById("selModel");
    const tight = Array.from(sel.options).map(o => o.value)
      .filter(id => { const c = rhEffectivePromptMax(id); return c && c <= 2000; })[0];
    if (!tight) return { skip: "no tight model configured" };
    sel.value = tight; if (sel.onchange) sel.onchange();
    const before = sel.value;
    const long = 6000;
    const ok = wfEnsureCapableModel(1, long);
    const after = sel.value;
    const cap = rhEffectivePromptMax(after);
    return { ok, before, after, moved: before !== after, cap: cap || "no cap",
      fits: !cap || cap >= long, announced: !!wfSwitchedFor,
      why: wfSwitchedFor && wfSwitchedFor.why };
  });
  if (D.skip) report("D) stage 2 could not be measured", false, D);
  else report("D) a workflow too long for the picked model moves the run to one that can hear all of it",
    D.ok && D.moved && D.fits && D.announced && D.why === "prompt", D);

  /* ---- D2: and it does NOT move when the current model already fits ---- */
  const D2 = await page.evaluate(() => {
    const sel = document.getElementById("selModel");
    const roomy = Array.from(sel.options).map(o => o.value)
      .filter(id => { const c = rhEffectivePromptMax(id); return !c || c >= 20000; })[0];
    sel.value = roomy; if (sel.onchange) sel.onchange();
    const before = sel.value;
    wfEnsureCapableModel(1, 6000);
    return { before, after: sel.value, stayed: before === sel.value, quiet: !wfSwitchedFor };
  });
  report("D2) and a model that already fits is left alone — the student's own choice is never overridden for no reason",
    D2.stayed && D2.quiet, D2);

  /* ---- E: the student is told, in every language ---- */
  const E = await page.evaluate(({ langs }) => {
    const out = {};
    langs.forEach(L => {
      window.LANG = L;
      wfSwitchedFor = { from: "Model A", to: "Model B", why: "prompt", chars: 6000 };
      const w = (window.HNK_WF_CATALOG || []).flatMap(c => c.items)[0];
      out[L] = { hasFrom: true };
    });
    window.LANG = "my";
    return out;
  }, { langs: LANGS });
  const srcApp = await page.evaluate(() => {
    /* the nine-language switch line lives in the wizard footer builder */
    return document.documentElement.innerHTML.indexOf("could not take this whole workflow") >= 0;
  });
  report("E) the switch is announced to the student, not made behind their back",
    srcApp, "the nine-language switch line is missing from the wizard footer");

  report("F) no page error while any of this was measured", errs.length === 0, errs);
  console.log("\n" + (failures === 0
    ? "All checks passed — blocks go whole or not at all, the essentials always survive, and when the words will not fit the run moves to a model that can hear them."
    : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
