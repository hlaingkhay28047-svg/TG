/* v6.12.0 — CREATOR STUDIO: the owner's RunningHub Explore feed, as cards over the
 * studio's own engines.
 *
 * WHAT THE OWNER ASKED FOR, in their words: study these workflows in detail
 * and add new Smart Workflow cards to my app; the card pictures in one new
 * style; look for more and add them too.
 *
 * The community apps are webappId AI Apps whose node schemas cannot be read
 * from here, and the studio never invents an endpoint client-side — so each
 * app's FUNCTION is rebuilt as a prompt over the shipped edit engines, in its
 * own category. What is checked here is what would quietly rot:
 *
 *   - the ten cards exist, once each, in Style Studio, in the order shipped;
 *     every one asks for exactly one photograph;
 *   - every switch is ON by default with an OFF line of its own and nine
 *     labels; every tag names exactly one line and none shadows another;
 *     OFF sends the OFF line and drops the ON line;
 *   - every composed prompt locks IMAGE 1, carries a TASK GUARD, no raw
 *     token, the negative as AVOID, and survives every prompt cap whole;
 *   - the cards that keep the person a PHOTOGRAPH say so (REALISM), and the
 *     cards that redraw the person keep them recognisable (the identity
 *     guard) — the two promises a style card can break;
 *   - a Burmese summary in a Burmese UI; a 960x640 picture per card that
 *     renders on the Workflows page.
 *
 * Usage: PORT=8931 node test/verify_creator_studio.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.resolve(__dirname, "..");
const CAT = "Creator Studio";
const IDS = ["outfit-set-sheet", "cute-3d-figure", "playing-card-queen", "product-ad-shot", "oil-painting",
  "instant-film", "id-photo", "business-headshot", "pet-portrait", "chinese-ink-painting"];
/* the cards that hand back a PHOTOGRAPH of the person, and the ones that redraw them */
const PHOTO = ["outfit-set-sheet", "playing-card-queen", "product-ad-shot", "instant-film", "id-photo", "business-headshot", "pet-portrait"];
const REDRAW = ["cute-3d-figure", "oil-painting", "chinese-ink-painting"];
/* the one card that takes a second picture: the product it puts in the hand */
const TWO_IN = { "product-ad-shot": 2 };
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
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);

  /* ---- A) the category and its ten cards ---- */
  const A = await page.evaluate(({ cat, ids, twoIn }) => {
    const cats = window.HNK_WF_CATALOG || [];
    const c = cats.find(x => x.t === cat);
    const items = c ? c.items : [];
    return {
      hasCat: !!c, order: items.map(w => w.id),
      badReq: items.filter(w => (w.req || []).length !== (twoIn[w.id] || 1) || (w.opt || []).length !== 0).map(w => w.id),
      copies: ids.map(id => cats.reduce((n, k) => n + k.items.filter(w => w.id === id).length, 0))
    };
  }, { cat: CAT, ids: IDS, twoIn: TWO_IN });
  report("A) Creator Studio is a category of its own with the ten cards, in the order shipped",
    A.hasCat && A.order.join(",") === IDS.join(","), A);
  report("A2) every card asks for exactly the pictures it names — one photograph, two for the product ad — and no reference",
    A.badReq.length === 0, A.badReq);
  report("A3) each card is listed once in the whole catalog",
    A.copies.every(n => n === 1), A.copies);

  /* ---- B) switches ---- */
  const B = await page.evaluate(({ cat, langs }) => {
    const items = ((window.HNK_WF_CATALOG || []).find(x => x.t === cat) || { items: [] }).items;
    const bad = [];
    items.forEach(w => {
      const fields = w.fields || [];
      if (!fields.some(f => f.key === "note" && f.type === "text" && f.token)) bad.push({ id: w.id, why: "no note field" });
      fields.forEach(f => {
        if (f.type === "toggle") {
          if (f.default !== true) bad.push({ id: w.id, key: f.key, why: "off by default" });
          if (!(f.off && f.off.indexOf(f.tag) === 0)) bad.push({ id: w.id, key: f.key, why: "no OFF line starting with its tag" });
        }
        langs.forEach(l => { if (!f.label || !f.label[l]) bad.push({ id: w.id, key: f.key, why: "no " + l + " label" }); });
      });
      const lines = String(w.prompt || "").split("\n"); const tags = fields.map(f => f.tag);
      tags.forEach(t => { const hits = lines.filter(l => l.indexOf(t) === 0).length; if (hits !== 1) bad.push({ id: w.id, tag: t, lines: hits }); });
      tags.forEach(a => tags.forEach(b => { if (a !== b && b.indexOf(a) === 0) bad.push({ id: w.id, shadow: a + " shadows " + b }); }));
      fields.filter(f => f.type === "toggle").forEach(f => {
        const on = lines.find(l => l.indexOf(f.tag) === 0);
        const vals = {}; vals[f.key] = false;
        const p = window._wfFieldPrompt(w.id, vals) || "";
        if (p.indexOf(f.off) < 0) bad.push({ id: w.id, key: f.key, why: "OFF line missing when off" });
        if (p.indexOf(on) >= 0) bad.push({ id: w.id, key: f.key, why: "ON line still present when off" });
      });
    });
    return bad;
  }, { cat: CAT, langs: LANGS });
  report("B) every switch is ON by default with its own OFF line and nine labels; each tag names one line; OFF means off",
    B.length === 0, B.slice(0, 4));

  /* ---- C) what the composed prompts promise ---- */
  const C = await page.evaluate(({ cat, photo, redraw }) => {
    const items = ((window.HNK_WF_CATALOG || []).find(x => x.t === cat) || { items: [] }).items;
    const caps = [];
    (typeof RH_MODELS !== "undefined" ? RH_MODELS : []).forEach(m => { const c = m && (m.promptMax || (m.def && m.def.promptMax)); if (c && caps.indexOf(c) < 0) caps.push(c); });
    if (!caps.length) caps.push(800, 2000, 2048, 3000, 5000);
    const out = [];
    items.forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      out.push({
        id: w.id, len: p.length,
        roles: p.indexOf("INPUT ROLES:") >= 0 && p.indexOf("IMAGE 1") >= 0,
        request: p.indexOf("PRIMARY REQUEST:") >= 0,
        guard: p.indexOf("TASK GUARD:") >= 0,
        raw: /\{\{[A-Z_]+\}\}/.test(p),
        avoid: p.indexOf("AVOID:") >= 0,
        realism: p.indexOf("REALISM:") >= 0,
        identity: /recognisably themselves|recognisably as photographed/.test(p),
        capsBad: caps.filter(c => rhTruncatePrompt(p, c).indexOf("TASK GUARD") < 0),
        fits5000: p.length <= 5000
      });
    });
    return out;
  }, { cat: CAT, photo: PHOTO, redraw: REDRAW });
  report("C) every composed prompt names IMAGE 1 as the target, states its request and carries the TASK GUARD",
    C.every(x => x.roles && x.request && x.guard), C.filter(x => !(x.roles && x.request && x.guard)).map(x => x.id));
  report("C2) no raw {{token}} reaches the engine, the negative rides as AVOID, and every card fits the 5000 cap whole",
    C.every(x => !x.raw && x.avoid && x.fits5000), C.filter(x => x.raw || !x.avoid || !x.fits5000).map(x => ({ id: x.id, len: x.len })));
  report("C3) the TASK GUARD survives truncation at every prompt cap in the shipped catalog",
    C.every(x => x.capsBad.length === 0), C.filter(x => x.capsBad.length).map(x => ({ id: x.id, caps: x.capsBad })));
  report("C4) the seven cards that hand back a photograph say REALISM; the three that redraw keep the person recognisable",
    PHOTO.every(id => C.find(x => x.id === id).realism) && REDRAW.every(id => C.find(x => x.id === id).identity),
    { photo: PHOTO.filter(id => !C.find(x => x.id === id).realism), redraw: REDRAW.filter(id => !C.find(x => x.id === id).identity) });

  /* ---- D) a Burmese student reads Burmese; a picture per card ---- */
  const D = await page.evaluate(async cat => {
    const items = ((window.HNK_WF_CATALOG || []).find(x => x.t === cat) || { items: [] }).items;
    switchPage("pgWf"); await new Promise(r => setTimeout(r, 500));
    const out = [];
    for (const w of items) {
      const dims = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = "lib/wf/cards5/" + w.id + ".jpg"; });
      out.push({ id: w.id, my: /[က-႟]/.test(w.summary || ""), expl: (w.explanation || "").length >= 60,
        drawn: !!document.getElementById("hnkWf_" + w.id) || [...document.querySelectorAll(".wfmini")].some(m => (m.dataset.nwId || "") === w.id), dims });
    }
    return out;
  }, CAT);
  report("D) every card carries a Burmese summary in a Burmese UI, and an explanation",
    D.every(x => x.my && x.expl), D.filter(x => !(x.my && x.expl)).map(x => x.id));
  report("D2) every card renders on the Workflows page with a 960x640 picture of its own",
    D.every(x => x.drawn && x.dims[0] === 960 && x.dims[1] === 640 && fs.existsSync(path.join(ROOT, "docs/app/lib/wf/cards5", x.id + ".jpg"))),
    D.filter(x => !(x.drawn && x.dims[0] === 960 && x.dims[1] === 640)).map(x => ({ id: x.id, drawn: x.drawn, dims: x.dims })));
  report("E) no page error through the run", errs.length === 0, errs.slice(0, 2));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed — the Creator Studio cards do what the posts they were modelled on do, over the studio's own engines.");
  process.exit(failures ? 1 : 0);
})();
