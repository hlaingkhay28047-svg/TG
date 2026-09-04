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

  report("A) the deck ships the two cards the owner asked for — a whole character, and a face",
    WF.length === 2 && WF[0].key === "vtCharSwap" && WF[1].key === "vtFaceSwap",
    WF.map(w => w.key));

  const unknown = WF.filter(w => !TOOLS.some(t => t.id === w.model)).map(w => w.key + "→" + w.model);
  report("A2) every card names a tool the app actually carries — no card invents an endpoint",
    unknown.length === 0, unknown);

  const wrongShape = [];
  WF.forEach(w => {
    const t = TOOLS.find(x => x.id === w.model);
    if (!t) return;
    if (!t.videoParam) wrongShape.push(w.key + ": its tool takes no video");
    if (!t.imageParam) wrongShape.push(w.key + ": its tool takes no reference photo, so the character never arrives");
    if (!t.prompt) wrongShape.push(w.key + ": its tool takes no prompt, so the card's request is dropped");
  });
  report("A3) each card's tool takes the three things the card hands it — the clip, the photo and the request",
    wrongShape.length === 0, wrongShape);

  const overlong = [];
  WF.forEach(w => {
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

  const lockGaps = WF.filter(w => w.text().indexOf(PACK.KEEP) < 0 || w.text().indexOf(PACK.FINISH) < 0)
    .map(w => w.key);
  report("A8) both cards carry the shared locks, from the one copy of them",
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
  /* both must keep the frame and the sound — that is the whole point of
     editing a clip the student already likes */
  [["camera", /camera angle/i], ["timing", /same timing/i], ["background", /background/i], ["sound", /original sound/i]]
    .forEach(([what, re]) => {
      WF.forEach(w => { if (!re.test(w.text())) contradictions.push(w.key + " does not keep the " + what); });
    });
  report("A9) neither card asks for something it also promises to keep",
    contradictions.length === 0, contradictions);

  /* A10 — the sound is the one promise the prompt cannot keep on its own.
     Both cards tell the model to leave the original sound alone, and the
     endpoint has a field for exactly that; if the body ever stopped sending
     it, the request would be asking for something the call had already
     declined. The descriptor is checked, not the sentence. */
  const soundGaps = WF.filter(w => {
    const t = TOOLS.find(x => x.id === w.model);
    return !(t && t.extra && t.extra.keepOriginalSound === true);
  }).map(w => w.key);
  report("A10) the original sound both cards promise to keep is also asked for in the request body",
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
  const browser = await chromium.launch();
  withPremium(browser);
  let appCards = null;
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);

    appCards = await page.evaluate(() => {
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
      return out;
    });
    report("C) the deck draws on the app's VidUp page, both cards, each saying what to bring",
      appCards.drawn && appCards.cards === 2 && appCards.needs.length === 2 &&
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
    report("C4) no page error while the app drew or applied either card", errs.length === 0, errs.slice(0, 3));
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

    const p = await page.evaluate(() => {
      try { switchPage("vidup"); } catch (e) { }
      const out = {};
      out.cards = document.querySelectorAll("#vtWfRow .wfmini").length;
      out.titles = [...document.querySelectorAll("#vtWfRow .wfmini .t")].map(n => n.textContent);
      out.needs = [...document.querySelectorAll("#vtWfRow .wf-need")].map(n => n.textContent);
      const first = document.querySelectorAll("#vtWfRow .wfmini")[0];
      if (first) first.click();
      out.model = (document.getElementById("vtModel") || {}).value;
      out.prompt = (document.getElementById("vtPrompt") || {}).value;
      out.intro = (document.getElementById("vtWfIntro") || {}).textContent;
      return out;
    });
    report("D) the panel draws the same two cards on its VidUp page",
      p.cards === 2 && p.titles.length === 2 && p.needs.length === 2, p);
    report("D2) the panel's cards are titled exactly as the app's are",
      appCards && p.titles.join("|") === appCards.titles.join("|"),
      { panel: p.titles, app: appCards && appCards.titles });
    report("D3) tapping in the panel picks the same tool and writes the same request, character for character",
      p.model === WF[0].model && p.prompt === WF[0].text(),
      { model: p.model, same: p.prompt === WF[0].text(), len: (p.prompt || "").length });
    report("D4) no page error while the panel drew or applied the card", errs.length === 0, errs.slice(0, 3));
  } finally {
    await pb.close();
    await new Promise(r => server.close(r));
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — the Video Smart Workflow would not do what its cards promise.`
    : "\nAll checks passed — two cards, one real endpoint, the same request on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
