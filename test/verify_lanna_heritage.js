/* v6.10.0 — LANNA GOLD HERITAGE: the owner's reference video as a card, and
 * every element of the set on its own switch.
 *
 * WHAT THE OWNER ASKED FOR, in their words: make a new Smart Workflow in
 * exactly the style of this video, and let the student choose what they want
 * — skin smooth, dress, lighting and colour tone, background, parasol,
 * jewellery, makeup, hair, footwear — one ON/OFF switch each.
 *
 * A switch is only a switch if turning it OFF actually removes that element
 * from what is sent, and leaves every other element in place. That is a
 * property of the prompt text and the field wiring, and both are the easiest
 * things in this codebase to weaken by accident — so each is checked here:
 *
 *   - the card exists, in Studio Scenes, and asks for exactly one photograph;
 *   - it carries the nine owner-named switches plus REALISM, a note field and the
 *     app's own skin-tone truth switch, in that order, every switch ON by default,
 *     labelled in all nine languages;
 *   - every switch's tag names EXACTLY ONE line of the prompt and no tag is a
 *     prefix of another (toggling one control leaves the rest alone);
 *   - OFF really means off: with a switch off the composed prompt carries that
 *     switch's OFF line and not its ON line, and the other eight ON lines stay;
 *   - the composed prompt states the framing, consistency and realism rules,
 *     carries the TASK GUARD, no raw {{token}}, and the negative as AVOID;
 *   - the TASK GUARD survives truncation at every prompt cap in the catalog;
 *   - a Burmese student reads a Burmese summary;
 *   - the card renders on the Workflows page with a 960x640 picture of its own.
 *
 * Usage: PORT=8931 node test/verify_lanna_heritage.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.resolve(__dirname, "..");
const ID = "lanna-gold-heritage";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
/* the app appends its own SKIN TONE TRUTH switch to every tone-group card, so it
   is the twelfth control here — read from the record, never retyped into it */
const KEYS = "skin,dress,light,bg,parasol,jewel,makeup,hair,shoes,real,note,skintone";
const SWITCHES = ["skin", "dress", "light", "bg", "parasol", "jewel", "makeup", "hair", "shoes"];
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

  /* ---- A) the card exists where it belongs ---- */
  const A = await page.evaluate(id => {
    const cats = window.HNK_WF_CATALOG || [];
    const holder = cats.find(c => c.items.some(w => w.id === id));
    const w = holder ? holder.items.find(x => x.id === id) : null;
    return {
      cat: holder ? holder.t : null,
      found: !!w,
      req: w ? (w.req || []).length : -1,
      opt: w ? (w.opt || []).length : -1,
      keys: w ? (w.fields || []).map(f => f.key).join(",") : "",
      copies: cats.reduce((n, c) => n + c.items.filter(x => x.id === id).length, 0)
    };
  }, ID);
  report("A) Lanna Gold Heritage is a Studio Scenes card, listed once",
    A.found && A.cat === "Studio Scenes" && A.copies === 1, A);
  report("A2) it asks for exactly one photograph and no reference — the set lives in the card",
    A.req === 1 && A.opt === 0, A);
  report("A3) it carries the nine owner-named switches, then REALISM, the note and the app's own skin-tone truth switch, in that order",
    A.keys === KEYS, A.keys);

  /* ---- B) every switch is a real switch ---- */
  const B = await page.evaluate(({ id, langs, switches }) => {
    const w = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(x => x.id === id);
    const bad = [];
    (w.fields || []).forEach(f => {
      if (f.key === "note") {
        if (f.type !== "text" || !f.token) bad.push({ key: f.key, why: "note is not a text field with a token" });
      } else {
        if (f.type !== "toggle") bad.push({ key: f.key, why: "not a toggle" });
        if (f.default !== true) bad.push({ key: f.key, why: "off by default" });
        if (switches.indexOf(f.key) >= 0 && !(f.off && f.off.indexOf(f.tag) === 0))
          bad.push({ key: f.key, why: "no OFF line starting with its own tag" });
      }
      langs.forEach(l => { if (!f.label || !f.label[l]) bad.push({ key: f.key, why: "no " + l + " label" }); });
    });
    return bad;
  }, { id: ID, langs: LANGS, switches: SWITCHES });
  report("B) every switch is a toggle, ON by default, with an OFF line of its own, labelled in all nine languages",
    B.length === 0, B.slice(0, 4));

  /* ---- C) a tag names exactly one line, and no tag shadows another ---- */
  const C = await page.evaluate(id => {
    const w = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(x => x.id === id);
    const lines = String(w.prompt || "").split("\n");
    const tags = (w.fields || []).map(f => f.tag);
    const bad = [];
    tags.forEach(t => {
      const hits = lines.filter(l => l.indexOf(t) === 0).length;
      if (hits !== 1) bad.push({ tag: t, lines: hits });
    });
    tags.forEach(a => tags.forEach(b => { if (a !== b && b.indexOf(a) === 0) bad.push({ shadow: a + " shadows " + b }); }));
    return bad;
  }, ID);
  report("C) each control's tag names exactly one line of the prompt, and no tag is a prefix of another",
    C.length === 0, C.slice(0, 4));

  /* ---- D) OFF means off — for each of the nine, alone ---- */
  const D = await page.evaluate(({ id, switches }) => {
    const w = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(x => x.id === id);
    const field = k => (w.fields || []).find(f => f.key === k);
    const onLine = k => String(w.prompt).split("\n").find(l => l.indexOf(field(k).tag) === 0);
    const all = window._wfFieldPrompt(id) || "";
    const bad = [];
    switches.forEach(k => {
      const vals = {}; vals[k] = false;
      const p = window._wfFieldPrompt(id, vals) || "";
      if (p.indexOf(field(k).off) < 0) bad.push({ key: k, why: "OFF line missing" });
      if (p.indexOf(onLine(k)) >= 0) bad.push({ key: k, why: "ON line still present" });
      switches.filter(o => o !== k).forEach(o => {
        if (p.indexOf(onLine(o)) < 0) bad.push({ key: k, why: "turned off " + o + " as well" });
      });
      if (p.split("\n").filter(l => l.indexOf(field(k).tag) === 0).length !== 1)
        bad.push({ key: k, why: "tag appears on more than one line after toggling" });
    });
    /* all on: every ON line present, no OFF line anywhere */
    switches.forEach(k => {
      if (all.indexOf(onLine(k)) < 0) bad.push({ key: k, why: "ON line missing at defaults" });
      if (all.indexOf(field(k).off) >= 0) bad.push({ key: k, why: "OFF line present at defaults" });
    });
    return bad;
  }, { id: ID, switches: SWITCHES });
  report("D) turning any one switch OFF sends its OFF line, drops its ON line, and leaves the other eight in place",
    D.length === 0, D.slice(0, 5));

  /* ---- E) what the composed prompt promises ---- */
  const E = await page.evaluate(id => {
    const p = window._wfBatchPrompt(id) || "";
    return {
      len: p.length,
      guard: p.indexOf("TASK GUARD") >= 0,
      consistency: p.indexOf("CONSISTENCY RULE") >= 0,
      framing: p.indexOf("FRAMING RULE") >= 0,
      realism: p.indexOf("REALISM:") >= 0,
      roles: p.indexOf("IMAGE 1 is the ONLY edit target") >= 0,
      raw: /\{\{[A-Z_]+\}\}/.test(p),
      avoid: p.indexOf("AVOID:") >= 0,
      lanna: /sabai/i.test(p) && /pha-sin/i.test(p) && /parasol/i.test(p) && /jasmine/i.test(p)
    };
  }, ID);
  report("E) the composed prompt locks IMAGE 1, states the framing, consistency and realism rules and carries the TASK GUARD",
    E.roles && E.framing && E.consistency && E.realism && E.guard, E);
  report("E2) no unreplaced {{token}} reaches the engine, the negative rides along, and the set is the video's — sabai, pha-sin, parasol, jasmine",
    !E.raw && E.avoid && E.lanna, E);

  /* ---- F) the guard survives every prompt cap the catalog ships ---- */
  const F = await page.evaluate(id => {
    const caps = [];
    (typeof RH_MODELS !== "undefined" ? RH_MODELS : []).forEach(m => {
      const c = m && (m.promptMax || (m.def && m.def.promptMax));
      if (c && caps.indexOf(c) < 0) caps.push(c);
    });
    if (!caps.length) caps.push(800, 2000, 2048, 3000, 5000);
    const p = window._wfBatchPrompt(id) || "";
    const bad = caps.filter(c => rhTruncatePrompt(p, c).indexOf("TASK GUARD") < 0);
    return { caps: caps.sort((a, b) => a - b), bad };
  }, ID);
  report("F) the TASK GUARD survives truncation at every prompt cap in the shipped catalog",
    F.bad.length === 0, F);

  /* ---- G) a Burmese student reads a Burmese card ---- */
  const G = await page.evaluate(id => {
    const w = (window.HNK_WF_CATALOG || []).flatMap(c => c.items).find(x => x.id === id);
    return { summary: w.summary || "", explanation: (w.explanation || "").length };
  }, ID);
  report("G) the card carries a Burmese summary in a Burmese UI, and an explanation",
    /[က-႟]/.test(G.summary) && G.explanation >= 40, G);

  /* ---- H) it renders, with a picture of its own ---- */
  const H = await page.evaluate(async id => {
    switchPage("pgWf");
    await new Promise(r => setTimeout(r, 400));
    const drawn = !!document.getElementById("hnkWf_" + id) ||
      [...document.querySelectorAll(".wfmini")].some(m => (m.dataset.nwId || "") === id);
    const dims = await new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ w: 0, h: 0 });
      im.src = "lib/wf/cards5/" + id + ".jpg";
    });
    return { drawn, dims };
  }, ID);
  const cardFile = path.join(ROOT, "docs/app/lib/wf/cards5", ID + ".jpg");
  report("H) the card renders on the Workflows page",
    H.drawn, H);
  report("H2) and its picture exists at the card pack's geometry, 960x640",
    fs.existsSync(cardFile) && H.dims.w === 960 && H.dims.h === 640, H.dims);

  report("I) no page error through the run", errs.length === 0, errs.slice(0, 2));
  await browser.close();
  console.log(failures
    ? `\n${failures} check(s) failed`
    : "\nAll checks passed — the Lanna Gold Heritage set is the video's, and every switch means what it says.");
  process.exit(failures ? 1 : 0);
})();
