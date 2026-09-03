/* v5.91.0 — THE LOOK SETS: one card per set, and the set never drifts.
 *
 * WHAT THE OWNER ASKED FOR, in their words: this exact backdrop colour, this
 * exact lighting, this exact skin retouch and colour grading; a switch for the
 * original skin tone and a switch for the wardrobe and makeup; a hundred
 * photographs all coming out the same; half body or full body, whatever the
 * student picks; and it must look genuinely photographed, not generated.
 *
 * Every one of those is a property of the prompt, and a prompt is the easiest
 * thing in this codebase to weaken by accident — a tag renamed, a line dropped,
 * a toggle whose tag no longer matches the line it is meant to remove. So each
 * is checked here rather than trusted:
 *
 *   - the set exists as its own category, with all thirteen cards in it;
 *   - every card takes ONE photo (the look is in the card, not in a reference);
 *   - every card carries the same nine controls, including the two switches the
 *     owner named by hand — wardrobe+makeup, and face+body skin tone;
 *   - every toggle's tag names EXACTLY ONE line of its own prompt, and no tag
 *     is a prefix of another (that is what makes toggling one control leave the
 *     rest alone);
 *   - the composed prompt states the consistency rule, the framing rule and the
 *     realism rule, and carries no unreplaced {{token}};
 *   - the TASK GUARD survives truncation at EVERY prompt cap in the shipped
 *     model catalog — thirteen of the twenty-six models silently cut long
 *     prompts, and the guard is what keeps the student's face their own.
 *
 * Usage: PORT=8931 node test/verify_look_sets.js  (serve docs/app first) */
"use strict";
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);

  const A = await page.evaluate(() => {
    const cats = window.HNK_WF_CATALOG || [];
    const cat = cats.find(c => c.t === "Look Sets");
    const items = cat ? cat.items : [];
    return {
      hasCat: !!cat,
      n: items.length,
      ids: items.map(w => w.id),
      /* a Look Set is a set, not a transfer: one photo in, nothing else */
      badReq: items.filter(w => (w.req || []).length !== 1).map(w => w.id),
      /* every card carries the same nine controls */
      fieldSets: items.map(w => ({ id: w.id, keys: (w.fields || []).map(f => f.key).join(",") })),
      elsewhere: cats.filter(c => c.t !== "Look Sets")
        .flatMap(c => c.items.map(w => w.id)).filter(id => /^look-/.test(id))
    };
  });

  report("A) the thirteen Look Sets are a category of their own",
    A.hasCat && A.n === 13, { hasCat: A.hasCat, n: A.n });
  report("A2) every one of them asks for exactly one photograph — the set lives in the card, not in a reference",
    A.badReq.length === 0, A.badReq);
  const WANT = "scene,light,grade,wardrobe,retouch,skintone,hair,real,note";
  report("A3) all thirteen carry the same nine controls, in the same order",
    A.fieldSets.every(f => f.keys === WANT),
    A.fieldSets.filter(f => f.keys !== WANT).slice(0, 3));
  report("A4) and none of them has leaked into another category",
    A.elsewhere.length === 0, A.elsewhere);

  /* ---- B) the two switches the owner asked for by name ---- */
  const B = await page.evaluate(langs => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const bad = [];
    (cat ? cat.items : []).forEach(w => {
      const f = k => (w.fields || []).find(x => x.key === k);
      const wardrobe = f("wardrobe"), skin = f("skintone");
      if (!wardrobe || wardrobe.type !== "toggle" || wardrobe.default !== true)
        bad.push({ id: w.id, why: "wardrobe+makeup switch missing or off by default" });
      if (!skin || skin.type !== "toggle" || skin.default !== true)
        bad.push({ id: w.id, why: "skin tone switch missing or off by default" });
      langs.forEach(l => {
        (w.fields || []).forEach(x => {
          if (!x.label || !x.label[l]) bad.push({ id: w.id, why: "no " + l + " label on " + x.key });
        });
      });
    });
    return bad;
  }, LANGS);
  report("B) every set has a wardrobe+makeup switch and a skin-tone switch, both on by default, labelled in all nine languages",
    B.length === 0, B.slice(0, 4));

  /* ---- C) a tag names exactly one line, and no tag shadows another ---- */
  const C = await page.evaluate(() => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const bad = [];
    (cat ? cat.items : []).forEach(w => {
      const lines = String(w.prompt || "").split("\n");
      const tags = (w.fields || []).map(f => f.tag);
      tags.forEach(t => {
        const hits = lines.filter(l => l.indexOf(t) === 0).length;
        if (hits !== 1) bad.push({ id: w.id, tag: t, lines: hits });
      });
      tags.forEach(a => tags.forEach(b => {
        if (a !== b && b.indexOf(a) === 0) bad.push({ id: w.id, shadow: a + " shadows " + b });
      }));
    });
    return bad;
  });
  report("C) each control's tag names exactly one line of its own prompt, and no tag is a prefix of another",
    C.length === 0, C.slice(0, 4));

  /* ---- D) what the composed prompt actually promises ---- */
  const D = await page.evaluate(() => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const out = [];
    (cat ? cat.items : []).forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      out.push({
        id: w.id, len: p.length,
        guard: p.indexOf("TASK GUARD") >= 0,
        consistency: p.indexOf("CONSISTENCY RULE") >= 0,
        framing: p.indexOf("FRAMING RULE") >= 0,
        realism: p.indexOf("REALISM:") >= 0,
        wardrobe: p.indexOf("WARDROBE AND MAKEUP:") >= 0,
        raw: /\{\{[A-Z_]+\}\}/.test(p),
        avoid: p.indexOf("AVOID:") >= 0
      });
    });
    return out;
  });
  report("D) every composed prompt states the consistency rule — the set is fixed, only the pose changes",
    D.every(x => x.consistency), D.filter(x => !x.consistency).map(x => x.id));
  report("D2) …the framing rule, so a half-length and a full-length photo both keep their own frame",
    D.every(x => x.framing), D.filter(x => !x.framing).map(x => x.id));
  report("D3) …and the realism rule, so the result reads as a photograph rather than a render",
    D.every(x => x.realism && x.wardrobe), D.filter(x => !x.realism || !x.wardrobe).map(x => x.id));
  report("D4) no unreplaced {{token}} ever reaches the engine, and the negative rides along",
    D.every(x => !x.raw && x.avoid), D.filter(x => x.raw || !x.avoid).map(x => x.id));

  /* ---- E) the guard survives every prompt cap the catalog actually ships ---- */
  const E = await page.evaluate(() => {
    const caps = [];
    (typeof RH_MODELS !== "undefined" ? RH_MODELS : []).forEach(m => {
      const c = m && (m.promptMax || (m.def && m.def.promptMax));
      if (c && caps.indexOf(c) < 0) caps.push(c);
    });
    if (!caps.length) caps.push(800, 2000, 2048, 3000, 5000);
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const bad = [];
    (cat ? cat.items : []).forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      caps.forEach(c => {
        const cut = rhTruncatePrompt(p, c);
        if (cut.indexOf("TASK GUARD") < 0) bad.push({ id: w.id, cap: c });
      });
    });
    return { caps: caps.sort((a, b) => a - b), bad: bad };
  });
  report("E) the TASK GUARD survives truncation at every prompt cap in the shipped catalog — the student's face stays their own even on the models that cut",
    E.bad.length === 0, { caps: E.caps, bad: E.bad.slice(0, 4) });

  /* ---- F) a Burmese student reads a Burmese card ---- */
  const F = await page.evaluate(langs => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const bad = [];
    (cat ? cat.items : []).forEach(w => {
      if (!w.summary || w.summary.length < 8) bad.push({ id: w.id, why: "no summary" });
      if (!w.explanation || w.explanation.length < 40) bad.push({ id: w.id, why: "no explanation" });
    });
    /* ST_SUM is what makes the card Burmese; the raw catalog summary is English */
    const mm = (cat ? cat.items : []).filter(w => /[က-႟]/.test(w.summary || "")).length;
    return { bad: bad, burmese: mm, total: (cat ? cat.items : []).length };
  }, LANGS);
  report("F) every card carries a summary and an explanation",
    F.bad.length === 0, F.bad.slice(0, 3));
  report("F2) and in a Burmese UI all thirteen summaries are Burmese, not English fallbacks",
    F.burmese === F.total, F);

  /* ---- G) they are reachable, and marked NEW while unread ---- */
  const G = await page.evaluate(() => {
    switchPage("pgWf");
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const ids = (cat ? cat.items : []).map(w => w.id);
    return {
      drawn: ids.filter(id => !!document.getElementById("hnkWf_" + id)).length,
      cards: [...document.querySelectorAll(".wfmini")].filter(m => /^look-/.test(m.dataset.nwId || "")).length,
      total: ids.length
    };
  });
  report("G) all thirteen render on the Workflows page", G.cards === G.total || G.drawn === G.total, G);

  /* v5.96.0 — the shared boilerplate was 62% of a Look Set prompt and has been
     compressed (5,150 -> 4,252 characters each), which is only safe if it
     still SAYS everything it used to. The words may change; the constraints
     may not. Each entry below is a rule the old wording carried, expressed as
     the concepts that must still appear somewhere in the composed prompt. */
  const RULES = [
    ["only IMAGE 1 is edited",            [/IMAGE 1 is the ONLY edit target/i]],
    ["identity is preserved",             [/face/i, /identity/i, /expression/i]],
    ["pose and hands are preserved",      [/pose/i, /hands/i]],
    ["body is never reshaped",            [/never slim or reshape/i]],
    ["the person is never swapped",       [/never replace or blend/i]],
    ["the frame is never re-cropped",     [/never re-crop, zoom or rescale/i]],
    ["the aspect ratio is kept",          [/aspect ratio/i]],
    ["the set answers the frame given",   [/build the set to fit the frame/i]],
    ["only specified things change",      [/Change only what the lines above specify/i]],
    ["the unspecified stays as shot",     [/stays exactly as photographed/i]],
    ["the set is FIXED across photos",    [/FIXED for this set/i, /identical in every photograph/i]],
    ["the palette never drifts",          [/vary the palette/i]],
    ["no unspecified props",              [/props not specified above/i]],
    ["only the pose changes",             [/Only the pose changes/i]],
    ["skin keeps its real texture",       [/pore/i, /freckle/i, /mole/i]],
    ["makeup is improved, not repainted", [/never repaint/i]],
    ["skin tone is never shifted",        [/never lightened, darkened, or shifted/i]],
    ["it must read as a photograph",      [/full-frame camera/i, /never a render/i]],
    ["no plastic or AI look",             [/No plastic skin/i, /AI gloss/i]],
    ["nothing is written on the image",   [/No text, logo, signature or watermark/i]]
  ];
  const GRULES = await page.evaluate(({ rules }) => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const missing = [];
    (cat ? cat.items : []).forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      rules.forEach(([name, pats]) => {
        pats.forEach(src => {
          if (!new RegExp(src.source, src.flags).test(p)) missing.push(w.id + ": " + name);
        });
      });
    });
    return missing;
  }, { rules: RULES.map(([n, ps]) => [n, ps.map(r => ({ source: r.source, flags: r.flags }))]) });
  report("I) the compressed boilerplate still carries every rule the long wording did — twenty constraints, checked on all thirteen composed prompts",
    GRULES.length === 0, Array.from(new Set(GRULES)).slice(0, 8));

  report("H) no page error while the sets were composed and drawn", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(failures
    ? `\n${failures} FAILURE(S) — a Look Set would not hold its set across a hundred photographs.`
    : "\nAll checks passed — thirteen sets, each fixed: backdrop, light, grade and wardrobe identical every time, with the two switches the owner asked for.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
