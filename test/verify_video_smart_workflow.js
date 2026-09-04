/* v6.1.0 — the Video Smart Workflow: two cards that put a student's own
 * character into a clip they already like.
 *
 * WHY THIS FILE EXISTS. Everything the feature needs had shipped months ago:
 * kling-video-o3-pro/video-edit takes a video, up to four reference
 * photographs and a prompt, and it has been in RH_VTOOL_MODELS since
 * v5.55.0. What was missing was a student who could find it — among thirty-one
 * raw endpoint labels — and who would then write the paragraph that keeps the
 * camera, the motion, the background and the sound from being rewritten along
 * with the person. Two cards do all of it, which means two cards can now get
 * all of it wrong, quietly:
 *
 *   - a card can name an endpoint that does not exist, or one that takes no
 *     reference image, and the request goes nowhere;
 *   - a card can write past the endpoint's prompt ceiling and be clipped
 *     mid-lock, which is worse than not asking;
 *   - the face-only card can ask to keep the hair and change it in the same
 *     breath — the exact defect v5.99.0 found in Derma Skin Pro's switches;
 *   - the panel's copy can drift from the app's, so the same card asks for
 *     two different things on two surfaces;
 *   - and a card can promise a ceiling it does not enforce.
 *
 * Every one of those is checked here, against the shipped source rather than
 * against a description of it.
 *
 * Usage: PORT=8931 node test/verify_video_smart_workflow.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { build } = require("../tools/build_panel_video_tool_wf.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) failures++;
}

/* the app's own tool catalog, read the way the app reads it */
function appArray(name) {
  const i = APP.indexOf("var " + name + " = [");
  if (i < 0) throw new Error(name + " is no longer in the app");
  const start = APP.indexOf("[", i);
  let d = 0;
  for (let k = start; k < APP.length; k++) {
    if (APP[k] === "[") d++;
    else if (APP[k] === "]") { d--; if (!d) return eval(APP.slice(start, k + 1)); }
  }
  throw new Error(name + " is unterminated");
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

(async () => {
  /* ---- A) the deck, read off the shipped source ---- */
  const TOOLS = appArray("RH_VTOOL_MODELS");
  /* the panel's lifted catalog is the app's block verbatim — B1 below proves
     that, and until it does this file treats them as one */
  const PACK = require(path.join(PANEL, "js", "hnk_video_tool_wf.js"));
  const WF = PACK.WF;

  /* v6.3.0 — the deck grew from two cards to nine. The two the owner asked
     for first still lead it, because they are the ones a student comes
     looking for; the seven behind them open the rest of the video-in
     catalog, which had been reachable only by name. */
  /* Make-it-longer adds action after the last frame, so it is the one card
     that must NOT swear the timing and the action are unchanged. */
  const KEEP_EXEMPT = { vtExtend: 1 };
  const EXPECT = ["vtCharSwap", "vtFaceSwap", "vtAnime", "vtFilmLook",
                  "vtHeritage", "vtExtend", "vtRestore4K", "vtEraseSub", "vtChar30"];
  report("A) the deck ships all nine cards, the two character cards leading",
    WF.map(w => w.key).join(",") === EXPECT.join(","), WF.map(w => w.key));

  const unknown = WF.filter(w => !TOOLS.some(t => t.id === w.model)).map(w => w.key + "→" + w.model);
  report("A2) every card names a tool the app actually carries — no card invents an endpoint",
    unknown.length === 0, unknown);

  /* v6.3.0 — what a card HANDS its tool, per card, rather than one shape for
     all of them. Three of the nine drive endpoints with no prompt field at
     all (Topaz Starlight, the subtitle eraser, DreamActor v2) and four take
     no reference photograph, so the old blanket assertion would now fail
     nine correct cards. What must hold is narrower and stronger:
       - every card's tool takes a VIDEO, because every card is video-in;
       - a card that writes a request drives a tool that has a prompt field,
         or the request is dropped on the floor;
       - a card whose tool REQUIRES a photograph says so on its badge, or the
         student brings a clip and gets an error instead of a result;
       - and a card whose tool takes no photograph does not promise one. */
  const wrongShape = [];
  WF.forEach(w => {
    const t = TOOLS.find(x => x.id === w.model);
    if (!t) return;
    const promisesPhoto = /photo/i.test(w.need.en);
    if (!t.videoParam) wrongShape.push(w.key + ": its tool takes no video");
    if (w.text && !t.prompt) wrongShape.push(w.key + ": it writes a request its tool cannot take");
    if (t.imageReq && !promisesPhoto) wrongShape.push(w.key + ": its tool demands a photo the badge never asks for");
    if (!t.imageParam && promisesPhoto) wrongShape.push(w.key + ": it asks for a photo its tool cannot use");
  });
  report("A3) every card hands its tool only what that tool takes, and asks the student for exactly that",
    wrongShape.length === 0, wrongShape);

  const overlong = [];
  WF.filter(w => w.text).forEach(w => {
    const t = TOOLS.find(x => x.id === w.model);
    const max = t && t.promptMax;
    const n = w.text().length;
    /* clipped mid-lock is worse than not asking: the AVOID list and the last
       FINISH line are what a character cut takes first */
    if (max && n > max) overlong.push(w.key + ": " + n + " > " + max);
  });
  report("A4) no card writes past its endpoint's prompt ceiling, so no lock is ever cut in half",
    overlong.length === 0, overlong);

  const langGaps = [];
  WF.forEach(w => ["label", "summary", "hint", "need"].forEach(f => {
    LANGS.forEach(l => { if (!w[f] || !w[f][l]) langGaps.push(w.key + "." + f + "." + l); });
  }));
  LANGS.forEach(l => { if (!PACK.CLIP_WARN[l]) langGaps.push("CLIP_WARN." + l); });
  report("A5) every line a student reads exists in all nine languages",
    langGaps.length === 0, langGaps.slice(0, 8));

  const missingArt = WF.filter(w => {
    const f = path.join(ROOT, "docs", "app", w.art);
    return !fs.existsSync(f) || fs.statSync(f).size < 5000;
  }).map(w => w.art);
  report("A6) each card's photograph is on disk and is a real picture",
    missingArt.length === 0, missingArt);

  /* the ceiling a card enforces and the ceiling it promises are the same
     number — a card that measures 10 and says 8 teaches the student wrong */
  const ceilingLies = WF.filter(w => w.maxSecs &&
    String(w.hint.en).indexOf("up to " + w.maxSecs + "s") < 0).map(w => w.key + " says: " + w.hint.en);
  report("A7) the clip ceiling each card enforces is the one its hint promises",
    ceilingLies.length === 0, ceilingLies);

  /* v6.3.0 — FINISH belongs to every written request: it is the "same person,
     no flicker, same length" clause. KEEP belongs to the cards that edit the
     footage in place, and deliberately NOT to Make-it-longer, whose whole job
     is to add action after the last frame — a card that both adds time and
     swears every action keeps its timing is the contradiction this file
     exists to catch. */
  const lockGaps = [];
  WF.filter(w => w.text).forEach(w => {
    const t = w.text();
    if (t.indexOf(PACK.FINISH) < 0) lockGaps.push(w.key + ": no FINISH");
    if (!KEEP_EXEMPT[w.key] && t.indexOf(PACK.KEEP) < 0) lockGaps.push(w.key + ": no KEEP");
    if (KEEP_EXEMPT[w.key] && t.indexOf(PACK.KEEP) >= 0) lockGaps.push(w.key + ": carries KEEP while adding time");
  });
  report("A8) every written request carries the shared locks that apply to it, from the one copy of them",
    lockGaps.length === 0, lockGaps);

  /* A9 — the contradiction scan verify_switch_honesty runs over the image
     workflows, run over these two: whatever a card says it KEEPS, it must not
     also order changed. The face card is the one at risk — it keeps the hair,
     the body and the clothes while replacing the face. */
  const face = WF.find(w => w.key === "vtFaceSwap").text();
  const whole = WF.find(w => w.key === "vtCharSwap").text();
  const contradictions = [];
  if (/replace[^.]{0,60}\b(hair|body|clothes|wardrobe|outfit)\b/i.test(face))
    contradictions.push("the face-only card orders something it also keeps");
  if (!/ONLY the face/.test(face))
    contradictions.push("the face-only card never says only the face");
  if (!/hairstyle and the hair colour already in the video/.test(face))
    contradictions.push("the face-only card does not keep the hair it promises to keep");
  if (/\bONLY the face\b/.test(whole))
    contradictions.push("the whole-character card limits itself to the face");
  if (!/Replace the main person/.test(whole))
    contradictions.push("the whole-character card never says who is replaced");
  /* v6.3.0 — the frame is the whole point of editing a clip the student
     already likes, so every card that KEEPS the footage keeps it;
     Make-it-longer is exempt for the same reason it is exempt from KEEP, and
     the three cards with no request at all have nothing to check here — their
     tools take no prompt. */
  [["camera", /camera angle/i], ["timing", /same timing/i], ["background", /background/i]]
    .forEach(([what, re]) => {
      WF.filter(w => w.text && !KEEP_EXEMPT[w.key]).forEach(w => {
        if (!re.test(w.text())) contradictions.push(w.key + " does not keep the " + what);
      });
    });
  /* The SOUND is the one lock a prompt cannot keep on its own, so it is
     checked against the ENDPOINT rather than against the other cards, and in
     both directions: a card whose tool carries keepOriginalSound must ask for
     it, and a card whose tool has no such field must not promise it — a
     sentence the call has already declined is a promise to the student that
     nothing behind it keeps. That is why VT_SOUND is not part of VT_KEEP.
     A10 walks the same seam from the body's side. */
  WF.filter(w => w.text).forEach(w => {
    const t = TOOLS.find(x => x.id === w.model);
    const canKeep = !!(t && t.extra && t.extra.keepOriginalSound === true);
    const says = /original sound/i.test(w.text());
    if (canKeep && !says) contradictions.push(w.key + " could keep the sound and never asks");
    if (!canKeep && says) contradictions.push(w.key + " promises a sound its tool cannot keep");
  });
  /* the three restyle cards change the LOOK and nothing else: each must say
     so, and none may reach for the person */
  ["vtAnime", "vtFilmLook", "vtHeritage"].forEach(k => {
    const w = WF.find(x => x.key === k);
    if (!w) { contradictions.push(k + " is missing"); return; }
    const t = w.text();
    if (!/^(Redraw|Grade) this video/.test(t)) contradictions.push(k + " does not open by naming what it does");
    if (/\bReplace (the|only)\b/i.test(t)) contradictions.push(k + " replaces someone in a card that only restyles");
  });
  report("A9) no card asks for something it also promises to keep",
    contradictions.length === 0, contradictions);

  /* A7b — v6.4.0. The other way a clip can be wrong for a card: wan-2.7's
     duration is the TOTAL the result runs, so a clip longer than it is refused
     by the endpoint itself. The first render wave proved it — a 5.04-second
     source against a card asking for 5 came back errorCode 1007, after the
     submit. A card carrying clipUnder must name an option its tool actually
     has, and must not ALSO default that option to something its own summary
     calls too short. */
  const underGaps = [];
  WF.filter(w => w.clipUnder).forEach(w => {
    const t = TOOLS.find(x => x.id === w.model);
    const o = (t && t.options || []).find(x => x.key === w.clipUnder);
    if (!o) { underGaps.push(w.key + ": clipUnder names " + w.clipUnder + ", which its tool has no option for"); return; }
    const chosen = Number((w.opts || {})[w.clipUnder] !== undefined ? w.opts[w.clipUnder] : o.def);
    const highest = Math.max.apply(null, o.values.map(Number).filter(n => !isNaN(n)));
    if (!chosen) { underGaps.push(w.key + ": no usable default for " + w.clipUnder); return; }
    /* the card is "make it longer": defaulting to the LOWEST value its tool
       offers guarantees the refusal for any ordinary clip */
    const lowest = Math.min.apply(null, o.values.map(Number).filter(n => !isNaN(n)));
    if (chosen <= lowest) underGaps.push(w.key + ": defaults " + w.clipUnder + " to its tool's smallest value (" + chosen + ")");
    if (chosen > highest) underGaps.push(w.key + ": defaults " + w.clipUnder + " past what its tool offers");
  });
  report("A7b) a card gated on one of its tool's options names a real one, and does not default it to the smallest",
    underGaps.length === 0, underGaps);
  /* and the app has to be able to ENFORCE it — a gate nothing reads is a
     comment, and the student still learns about it from the error */
  report("A7c) the app measures the clip against that option before the run is paid for",
    APP.indexOf("w.clipUnder") >= 0 && APP.indexOf("VT_UNDER_WARN") >= 0 &&
    /_vtUnderBound/.test(APP),
    "nothing reads clipUnder, or changing the option does not re-check the clip");

  /* A10 — the sound is the one promise the prompt cannot keep on its own.
     Both cards tell the model to leave the original sound alone, and the
     endpoint has a field for exactly that; if the body ever stopped sending
     it, the request would be asking for something the call had already
     declined. The descriptor is checked, not the sentence. */
  const soundGaps = WF.filter(w => w.text && w.text().indexOf("original sound") >= 0).filter(w => {
    const t = TOOLS.find(x => x.id === w.model);
    return !(t && t.extra && t.extra.keepOriginalSound === true);
  }).map(w => w.key);
  report("A10) every card that promises to keep the original sound drives a tool that asks for it in the body",
    soundGaps.length === 0, soundGaps);

  /* ---- B) the panel carries the app's deck, not a retyped one ---- */
  const committed = fs.readFileSync(path.join(PANEL, "js", "hnk_video_tool_wf.js"), "utf8");
  report("B) the panel's catalog is exactly what the app's block produces today",
    committed === build(),
    "run: node tools/build_panel_video_tool_wf.js");

  const mainJs = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
  function appL9(anchor) {
    const i = APP.indexOf(anchor);
    if (i < 0) throw new Error("anchor gone: " + anchor);
    const j = APP.indexOf("L9({", i) + 3;
    let d = 0;
    for (let k = j; k < APP.length; k++) {
      if (APP[k] === "{") d++;
      else if (APP[k] === "}") { d--; if (!d) return APP.slice(j, k + 1); }
    }
    throw new Error("unterminated: " + anchor);
  }
  const introLit = appL9('$("vtWfIntro").textContent = ');
  const hintLit = appL9("var VT_WF_INTRO_HINT = ");
  report("B2) the deck's own two lines are the app's words in the panel too",
    mainJs.indexOf(introLit) >= 0 && mainJs.indexOf(hintLit) >= 0,
    { intro: mainJs.indexOf(introLit) >= 0, hint: mainJs.indexOf(hintLit) >= 0 });

  /* ---- C) and the app draws it ---- */
  /* v6.3.0 — two of the nine cards' behaviours cannot be read off the source
     at all, because both are things the deck gets wrong SILENTLY: a card with
     no request of its own must leave what the student already typed alone,
     and a card that carries option defaults must land them in the selects the
     body reads. Both indices are computed from the shipped deck rather than
     typed, so re-ordering the deck still tests the right cards, and both
     surfaces below are asked the same two questions. */
  const QUIET_IDX = WF.findIndex(w => !w.text);
  const OPTS_IDXS = WF.map((w, i) => w.opts ? i : -1).filter(i => i >= 0);
  const SENTINEL = "a line the student had already typed";
  /* what the tool would have chosen on its own, exactly as both surfaces
     preselect it. A card that only restates its tool's default proves
     nothing about whether apply ran, so the gap scan below also demands that
     at least one card in the deck OVERRIDE one — otherwise a deck that never
     applied its options at all would pass this file green. */
  const optDefault = (model, key) => {
    const t = TOOLS.find(x => x.id === model);
    if (!t) return undefined;
    if (key === "whPreset") return "720p";
    const o = (t.options || []).find(x => x.key === key);
    return o ? String(o.def) : undefined;
  };
  const OVERRIDES = OPTS_IDXS.filter(i => Object.keys(WF[i].opts)
    .some(k => String(WF[i].opts[k]) !== optDefault(WF[i].model, k)));
  /* one gap scan, run over whatever each surface read back */
  const optGapScan = seen => {
    const gaps = [];
    OPTS_IDXS.forEach(i => {
      const slots = seen[i] || [];
      Object.keys(WF[i].opts).forEach(k => {
        const want = String(WF[i].opts[k]);
        const slot = slots.find(o => o.key === k);
        if (!slot) { gaps.push(WF[i].key + "/" + k + ": no select carries it"); return; }
        if (slot.value !== want) gaps.push(WF[i].key + "/" + k + ": select reads " + slot.value + ", card asks " + want);
        if (slot.shown.indexOf(want) < 0) gaps.push(WF[i].key + "/" + k + ": the label reads " + slot.shown + ", card asks " + want);
      });
    });
    return gaps;
  };
  const browser = await chromium.launch();
  withPremium(browser);
  let appCards = null;
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);

    appCards = await page.evaluate(async arg => {
      const out = { titles: [], needs: [] };
      const row = document.getElementById("vtWfRow");
      out.drawn = !!row;
      out.cards = row ? row.querySelectorAll(".wfmini").length : 0;
      out.titles = [...document.querySelectorAll("#vtWfRow .wfmini .t")].map(n => n.textContent);
      out.needs = [...document.querySelectorAll("#vtWfRow .wf-need")].map(n => n.textContent);
      out.hintBefore = (document.getElementById("vtWfHint") || {}).textContent;
      const tap = i => {
        document.querySelectorAll("#vtWfRow .wfmini")[i].click();
        const box = document.getElementById("vtPrompt");
        return {
          model: document.getElementById("selVtModel").value,
          prompt: box.value,
          shown: box.style.display !== "none",
          max: Number(box.getAttribute("maxlength") || 0),
          on: [...document.querySelectorAll("#vtWfRow .wfmini")].map(m => /\bon\b/.test(m.className))
        };
      };
      out.first = tap(0);
      out.second = tap(1);
      /* v6.1.0 — what a person SEES the tool is. The app paints a styled
         picker over the native select and repaints it from the select's own
         change event; the first cut of this deck wrote .value silently, so
         the card's request sat under the name of the previous tool and every
         value-based check still passed. Same failure shape as the ✦ NEW chip
         that was gold-on-gold: present, correct, invisible. */
      const shownOf = id => {
        const sel = document.getElementById(id);
        const wrap = sel.closest(".hsl") || sel.parentNode;
        const lab = wrap && wrap.querySelector(".hsl-val");
        return lab ? lab.textContent.trim() : "";
      };
      out.shownTool = shownOf("selVtModel");
      out.optionText = (() => {
        const sel = document.getElementById("selVtModel");
        const o = sel.options[sel.selectedIndex];
        return o ? o.textContent.trim() : "";
      })();

      /* a card that writes no request must not overwrite one, and must not
         leave an empty box open inviting a request its tool cannot take */
      const box = document.getElementById("vtPrompt");
      box.value = arg.sentinel;
      document.querySelectorAll("#vtWfRow .wfmini")[arg.quietIdx].click();
      out.quiet = {
        prompt: box.value,
        shown: box.style.display !== "none",
        model: document.getElementById("selVtModel").value
      };

      /* every card that carries option defaults must land them in the selects
         the body reads AND in the labels painted over those selects — all of
         them, not one sampled card */
      /* a frame before each read: the styled labels are also repainted by a
         MutationObserver, so reading them in the same tick as the click would
         be testing which repaint path happened to be synchronous rather than
         what a student ends up looking at. */
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.opts = {};
      for (const i of arg.optsIdxs) {
        document.querySelectorAll("#vtWfRow .wfmini")[i].click();
        await settle();
        out.opts[i] = ["selVtOpt1", "selVtOpt2"].map(id => {
          const s = document.getElementById(id);
          if (!s || s.style.display === "none") return null;
          return { key: s.dataset.key, value: s.value, shown: shownOf(id) };
        }).filter(Boolean);
      }
      return out;
    }, { quietIdx: QUIET_IDX, optsIdxs: OPTS_IDXS, sentinel: SENTINEL });

    report("C) the deck draws all nine cards on the app's V→V page, each saying what to bring",
      appCards.drawn && appCards.cards === WF.length && appCards.needs.length === WF.length &&
      appCards.titles.length === WF.length &&
      appCards.titles.every(t => t && t.length > 2), appCards);
    report("C2) tapping a card picks its tool and writes the whole request into the box",
      appCards.first.model === WF[0].model && appCards.first.shown &&
      appCards.first.prompt === WF[0].text() &&
      appCards.first.prompt.length <= appCards.first.max, {
        model: appCards.first.model, len: appCards.first.prompt.length, max: appCards.first.max,
        same: appCards.first.prompt === WF[0].text()
      });
    report("C3) tapping the other card REPLACES the request rather than adding to it, and moves the mark",
      appCards.second.prompt === WF[1].text() &&
      appCards.second.on[1] === true && appCards.second.on[0] === false, {
        same: appCards.second.prompt === WF[1].text(), on: appCards.second.on
      });
    /* the label a student reads must name the tool the card actually chose —
       the option's own text, matched whole, not merely "not empty" */
    report("C3b) the picker a student can SEE names the tool the card chose",
      appCards.shownTool.length > 0 &&
      appCards.optionText.indexOf(appCards.shownTool.replace(/^Tool\s*/, "")) >= 0,
      { shown: appCards.shownTool, option: appCards.optionText });
    report("C3c) a card with no request of its own leaves what the student typed alone, and closes the box its tool cannot read",
      QUIET_IDX >= 0 && appCards.quiet.prompt === SENTINEL &&
      appCards.quiet.shown === false && appCards.quiet.model === WF[QUIET_IDX].model,
      { idx: QUIET_IDX, key: QUIET_IDX >= 0 && WF[QUIET_IDX].key, quiet: appCards.quiet });
    /* v6.3.0 — the option selects are what the body actually reads
       (rhVtBody's optVals), so a card whose opts never arrive sends the
       tool's own default instead of the one the card promises: a "1080p"
       card quietly returning 720p. Checked by value AND by the painted
       label, for the same reason C3b exists. */
    const optGaps = optGapScan(appCards.opts);
    report("C3d) every card's option defaults reach the selects the request is built from, and the labels over them",
      OPTS_IDXS.length > 0 && OVERRIDES.length > 0 && optGaps.length === 0,
      { cards: OPTS_IDXS.map(i => WF[i].key), overriding: OVERRIDES.map(i => WF[i].key),
        gaps: optGaps, seen: appCards.opts });
    report("C4) no page error while the app drew or applied any card", errs.length === 0, errs.slice(0, 3));
  } finally {
    await browser.close();
  }

  /* ---- D) and so does the panel ---- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif",
          body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
      catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });

    const p = await page.evaluate(async arg => {
      try { switchPage("v2v"); } catch (e) { }
      const out = {};
      out.cards = document.querySelectorAll("#vtWfRow .wfmini").length;
      out.titles = [...document.querySelectorAll("#vtWfRow .wfmini .t")].map(n => n.textContent);
      out.needs = [...document.querySelectorAll("#vtWfRow .wf-need")].map(n => n.textContent);
      const first = document.querySelectorAll("#vtWfRow .wfmini")[0];
      if (first) first.click();
      out.model = (document.getElementById("vtModel") || {}).value;
      out.prompt = (document.getElementById("vtPrompt") || {}).value;
      /* the panel paints its own styled button over the select — same
         question as C3b, asked of the surface that has its own painter */
      out.shownTool = ((document.getElementById("vtModelVal") || {}).textContent || "").trim();
      out.optionText = (() => {
        const sel = document.getElementById("vtModel");
        const o = sel && sel.options[sel.selectedIndex];
        return o ? o.textContent.trim() : "";
      })();
      out.intro = (document.getElementById("vtWfIntro") || {}).textContent;

      /* the same two silent failures asked of the panel. It has its own
         apply, its own option selects and its own painter, so C3c and C3d
         prove nothing here. */
      const box = document.getElementById("vtPrompt");
      if (box) box.value = arg.sentinel;
      const quietCard = document.querySelectorAll("#vtWfRow .wfmini")[arg.quietIdx];
      if (quietCard) quietCard.click();
      out.quiet = {
        prompt: box ? box.value : null,
        shown: box ? box.style.display !== "none" : null,
        model: (document.getElementById("vtModel") || {}).value
      };
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.opts = {};
      for (const i of arg.optsIdxs) {
        const c = document.querySelectorAll("#vtWfRow .wfmini")[i];
        if (c) c.click();
        await settle();
        out.opts[i] = [["vtOpt", "vtOptVal"], ["vtOpt2", "vtOpt2Val"]].map(q => {
          const s = document.getElementById(q[0]);
          if (!s || s.style.display === "none") return null;
          const lab = document.getElementById(q[1]);
          return { key: s.getAttribute("data-key"), value: s.value,
                   shown: lab ? lab.textContent.trim() : "" };
        }).filter(Boolean);
      }
      return out;
    }, { quietIdx: QUIET_IDX, optsIdxs: OPTS_IDXS, sentinel: SENTINEL });

    report("D) the panel draws the same nine cards on its V→V page",
      p.cards === WF.length && p.titles.length === WF.length &&
      p.needs.length === WF.length, p);
    report("D2) the panel's cards are titled exactly as the app's are",
      appCards && p.titles.join("|") === appCards.titles.join("|"),
      { panel: p.titles, app: appCards && appCards.titles });
    report("D3) tapping in the panel picks the same tool and writes the same request, character for character",
      p.model === WF[0].model && p.prompt === WF[0].text(),
      { model: p.model, same: p.prompt === WF[0].text(), len: (p.prompt || "").length });
    report("D3b) the panel's own picker also SHOWS the tool the card chose",
      p.shownTool.length > 0 && p.optionText.indexOf(p.shownTool) >= 0,
      { shown: p.shownTool, option: p.optionText });
    report("D3c) a card with no request of its own leaves the panel's box alone too, and closes it",
      QUIET_IDX >= 0 && p.quiet.prompt === SENTINEL && p.quiet.shown === false &&
      p.quiet.model === WF[QUIET_IDX].model,
      { idx: QUIET_IDX, key: QUIET_IDX >= 0 && WF[QUIET_IDX].key, quiet: p.quiet });
    /* the panel used to carry ONE option select, so a tool documenting two
       enums had its second silently dropped and the endpoint's own default
       went out under a card promising something else. v6.3.0 gives it the
       app's two slots; this is the check that keeps them. */
    const pOptGaps = optGapScan(p.opts);
    report("D3d) the panel carries every card's option defaults too — both slots, and in what a student reads",
      OPTS_IDXS.length > 0 && OVERRIDES.length > 0 && pOptGaps.length === 0,
      { cards: OPTS_IDXS.map(i => WF[i].key), overriding: OVERRIDES.map(i => WF[i].key),
        gaps: pOptGaps, seen: p.opts });
    report("D4) no page error while the panel drew or applied any card", errs.length === 0, errs.slice(0, 3));
  } finally {
    await pb.close();
    await new Promise(r => server.close(r));
  }

  /* ---- E) and the art the cards wear is a picture of what they do ----
     The render lane submits a REAL call per card and crops its result into
     the card's picture. That is only honest while the call it submits is the
     call the card submits, so the lane reads the body out of the app's own
     rhVtBody (tools/v2v_card_request.js) instead of assembling JSON itself.
     The first cut of the lane hand-wrote one body shape for two look-alike
     cards; over nine cards that shape is wrong for seven of them — three
     take no prompt, four take no photograph, five carry option defaults, and
     only two carry keepOriginalSound. */
  const V2V = require(path.join(ROOT, "tools", "v2v_card_request.js"));
  const reqGaps = [];
  WF.forEach(w => {
    let r;
    try { r = V2V.request(w.key, "https://example.invalid/v.mp4", "https://example.invalid/i.jpg"); }
    catch (e) { reqGaps.push(w.key + ": " + e.message); return; }
    const t = TOOLS.find(x => x.id === w.model);
    if (r.apiPath !== t.apiPath) reqGaps.push(w.key + ": the lane would post to " + r.apiPath);
    if (!r.body[t.videoParam]) reqGaps.push(w.key + ": the request carries no video");
    /* the two shapes a hand-written body gets wrong */
    if (!!r.body.prompt !== !!w.text) reqGaps.push(w.key + ": prompt " + (w.text ? "missing from" : "invented in") + " the request");
    Object.keys(w.opts || {}).forEach(k => {
      if (k === "whPreset") { if (!r.body.outputWidth) reqGaps.push(w.key + ": the size preset never became a width"); return; }
      if (String(r.body[k]) !== String(w.opts[k])) reqGaps.push(w.key + "/" + k + ": the request sends " + r.body[k]);
    });
  });
  report("E) the render lane can build every card's real request, from the app's own builder",
    reqGaps.length === 0, reqGaps);

  const lane = fs.readFileSync(path.join(ROOT, ".github", "workflows", "showcase-images.yml"), "utf8");
  /* the lane's own comments explain what it must not hand-write, so read the
     code and not the prose — otherwise the explanation fails the check it
     exists to explain */
  const v2vLane = lane.slice(lane.indexOf("v2vcards)"), lane.indexOf("retouch)"))
    .split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  report("E2) the lane asks that builder for every card rather than writing a body of its own",
    v2vLane.indexOf("tools/v2v_card_request.js") >= 0 &&
    v2vLane.indexOf("keys") >= 0 &&
    !/keepOriginalSound/.test(v2vLane) && !/videoUrl["']\s*:/.test(v2vLane),
    { callsTool: v2vLane.indexOf("tools/v2v_card_request.js") >= 0,
      loopsAllCards: v2vLane.indexOf("keys") >= 0,
      handRolled: /keepOriginalSound|videoUrl["']\s*:/.test(v2vLane) });

  /* E3 — v6.4.0, the owner's rule after seeing the first wave: "ကတ်တေွကို
     အဟောင်း လုံးဝ မသုံးပါနဲ့". The first cut submitted a shipped banner clip
     and the shipped promo poster, so every card's picture was built on
     material a student has already met elsewhere in the product — and the
     thirty-second card's own before half was that poster. The lane generates
     BOTH inputs for this purpose now, and this check keeps it that way: no
     path into docs/ may appear in the card branch at all. */
  const shippedAssets = [...v2vLane.matchAll(/docs\/[A-Za-z0-9_.\/-]+\.(?:mp4|jpg|jpeg|png|webp)/g)].map(m => m[0]);
  report("E3) the card lane brings its own clip and its own portrait — no shipped asset is reused",
    shippedAssets.length === 0 &&
    /submit "v2v-source"/.test(v2vLane) && /submit "v2v-ref"/.test(v2vLane),
    { reused: shippedAssets, generatesClip: /submit "v2v-source"/.test(v2vLane),
      generatesPortrait: /submit "v2v-ref"/.test(v2vLane) });
  const art = fs.readFileSync(path.join(ROOT, "tools", "build_v2v_card_art.py"), "utf8");
  report("E3b) and the composer reads only what that lane produced",
    !/docs\/[A-Za-z0-9_.\/-]+\.(?:mp4|jpg|jpeg|png|webp)/.test(art.replace(/^\s*#.*$/gm, "")),
    "the composer still points at a shipped file for one of its halves");

  /* E4 — a run may publish only what it just composed. The lane copied every
     vt-*.jpg in the output folder, so a card the composer SKIPPED went out as
     whatever was already committed: when the RunningHub balance ran out
     mid-wave, two cards were re-published with art the owner had already
     rejected, and the run reported success. */
  report("E4) the lane publishes the cards this run composed, not every file in the folder",
    /cards-written\.txt/.test(lane) && !/for f in docs\/app\/lib\/vid\/vt-\*\.jpg/.test(lane),
    "the drop still copies every vt-*.jpg, so a skipped card ships its old art");
  report("E4b) and the composer records what it wrote for that to read",
    /cards-written\.txt/.test(art),
    "build_v2v_card_art.py does not report which cards it actually wrote");

  console.log(failures
    ? `\n${failures} FAILURE(S) — the Video Smart Workflow would not do what its cards promise.`
    : "\nAll checks passed — nine cards, every one over an endpoint we already ship, the same request on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
