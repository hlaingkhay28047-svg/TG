#!/usr/bin/env node
/* v5.99.0 — WHAT A SWITCH TURNED OFF ACTUALLY MEANS.
   The owner asked whether Derma Skin Pro really produces what its card
   shows. Three things were wrong with the workflow's own text, and two of
   them are the same defect the Look Sets were cured of in v5.92.0 and again
   in v5.98.0: a prompt that contradicts itself.
     1. Its five switches carried NO `off` line, so turning one off merely
        deleted its instruction — while FINISH went on demanding "completely
        clear skin ... never a single leftover spot". Blemish healing off,
        and the request still ordered blemish-free skin.
     2. The AVOID list forbade "removed moles" while the prompt asked for
        every dark spot to go and allowed exactly one signature mole to stay.
        The request argued with itself in the same breath.
   A switch is a promise to the student about what will and will not be
   touched. This pins that promise. */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 8931;
const URL = "http://127.0.0.1:" + PORT + "/index.html";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* what each Derma switch promises NOT to do once it is off. If any of these
   survives elsewhere in the composed prompt, the switch is a lie. */
const DEMANDS = {
  heal:  /completely clear skin|blemish-free|no spot, mark or bump remains|leftover spot|remove EVERY pimple/i,
  even:  /even the skin tone|calm redness|soften under-eye/i,
  body:  /every visible area of body skin|one continuous skin with the face/i,
  eyes:  /clean the eye whites|tidy the teeth|define lashes/i,
  shine: /reduce oily hotspots|matte-dead/i
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(2600);

  const A = await page.evaluate(() => {
    const wf = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(w => w.id === "derma-skin");
    if (!wf) return { missing: true };
    const toggles = (wf.fields || []).filter(f => f.tag);
    return {
      toggles: toggles.map(f => ({ key: f.key, tag: f.tag, off: f.off || "" })),
      negative: wf.negative || ""
    };
  });
  report("A) Derma Skin Pro exists and every one of its switches says what OFF means",
    !A.missing && A.toggles.length === 5 && A.toggles.every(t => t.off),
    A.missing ? "workflow not found" : A.toggles.filter(t => !t.off).map(t => t.key));

  report("A2) each OFF line stands in for the line it replaced — it opens with the same tag",
    !A.missing && A.toggles.every(t => t.off.indexOf(t.tag) === 0),
    (A.toggles || []).filter(t => t.off.indexOf(t.tag) !== 0).map(t => t.key));

  /* ---- B) the whole prompt, not just the one line, honours the switch ---- */
  const B = await page.evaluate(({ demands }) => {
    const wf = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(w => w.id === "derma-skin");
    const toggles = (wf.fields || []).filter(f => f.tag);
    const out = [];
    toggles.forEach(f => {
      const vals = {};
      toggles.forEach(g => { vals[g.key] = (g.key === f.key) ? false : true; });
      const p = window._wfFieldPrompt("derma-skin", vals) || "";
      const re = new RegExp(demands[f.key].source, demands[f.key].flags);
      /* the question is whether anything ELSE still demands it, so the OFF
         line is taken out before looking: an OFF line legitimately names the
         thing in order to forbid it ("do not even it, calm redness"). */
      const rest = p.split("\n").filter(l => l !== f.off).join("\n");
      out.push({
        key: f.key,
        offLinePresent: p.indexOf(f.off) >= 0,
        demandSurvives: re.test(rest)
      });
    });
    /* and with everything ON the demands are all present, so the patterns
       above are proved to match something in the first place */
    const allOn = {}; toggles.forEach(g => { allOn[g.key] = true; });
    const full = window._wfFieldPrompt("derma-skin", allOn) || "";
    const patternsBite = toggles.every(f => new RegExp(demands[f.key].source, demands[f.key].flags).test(full));
    return { rows: out, patternsBite };
  }, { demands: Object.fromEntries(Object.entries(DEMANDS).map(([k, r]) => [k, { source: r.source, flags: r.flags }])) });

  report("B) with every switch on, each thing a switch controls is actually asked for — the patterns below bite",
    B.patternsBite, B.patternsBite);
  report("B2) turning a switch OFF puts its OFF line into the prompt",
    B.rows.every(r => r.offLinePresent), B.rows.filter(r => !r.offLinePresent).map(r => r.key));
  report("B3) …and nothing anywhere else in the prompt still demands what was switched off",
    B.rows.every(r => !r.demandSurvives), B.rows.filter(r => r.demandSurvives).map(r => r.key));

  /* ---- C) the AVOID list never forbids what the prompt asks for ---- */
  const C = await page.evaluate(() => {
    const all = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const bad = [];
    all.forEach(w => {
      const p = w.prompt || "", n = w.negative || "";
      /* a prompt that lets ONE signature mole stay is asking for the others
         to go; an AVOID of "removed moles" then forbids its own request. */
      if (/mole[^.]{0,80}may stay/i.test(p) && /removed moles/i.test(n)) bad.push(w.id + ": moles");
      /* a prompt that asks for pore texture must not be paired with an AVOID
         that bans texture, and vice versa */
      if (/visible pores/i.test(p) && /\bpores\b(?![^,]*kept)/i.test(n) && !/airbrushed pores/i.test(n)) bad.push(w.id + ": pores");
    });
    return bad;
  });
  report("C) no workflow's AVOID list forbids something its own prompt asks for",
    C.length === 0, C);

  report("D) no page error while every switch state was composed", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(failures
    ? "\n" + failures + " FAILURE(S) — a switch would promise one thing and the request ask for another."
    : "\nAll checks passed — every switch means what it says, across the whole request, and nothing the prompt asks for is banned by its own AVOID list.");
  process.exit(failures ? 1 : 0);
})();
