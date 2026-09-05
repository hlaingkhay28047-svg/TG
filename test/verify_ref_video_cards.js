/* v6.15.0 — FOUR IMAGE→VIDEO SMART WORKFLOW CARDS FROM FOUR REFERENCE VIDEOS.
 *
 * The owner sent four clips, one at a time, each with the same brief: "make
 * this video's smart workflow exactly, 100% the same, and add it as a new
 * image→video card" — and then, for all four, "so that my own face is the one
 * in it". Every clip was decoded frame by frame (1 fps, then 3–4 fps contact
 * sheets). Two carried their Seedance 2.5 prompt on screen, transcribed word
 * for word with CapCut's @person mention becoming the person in the reference
 * photograph; two carried no text, so their prompts are the shot lists read
 * off the frames, cut by cut, at the clips' own lengths and aspects.
 *
 * What can go quietly wrong, and is therefore driven here against the shipped
 * source on both surfaces:
 *   - a card that pins its own model whose duration or aspect the model does
 *     not offer: the select silently keeps the old value and the student gets
 *     a ten-second 9:16 clip from a fifteen-second 16:9 card;
 *   - a prompt longer than the model accepts, clipped at submit;
 *   - an @person left behind from the source, or a tail that forbids the cuts
 *     the body asks for (VID_ID says one continuous take; VID_CUT says only the
 *     makeup may change) — the coin-flip contradiction v4.87 and v4.94 found;
 *   - a hint that does not tell the student the face will be theirs;
 *   - a panel copy of the deck that was retyped instead of lifted.
 *
 * Usage: PORT=8931 node test/verify_ref_video_cards.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { build } = require("../tools/build_panel_video_wf.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const PANEL = path.join(ROOT, "panel");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MODEL = "seedance-2-5-global-token-mmv";

/* what is on screen in each clip, stated here rather than derived from the
   prompt, so this fails if a prompt is ever swapped onto the wrong key */
const CARDS = {
  triadBoss:   { dur: "15", aspect: "16:9", secs: 15, brackets: ["[0s-4s]", "[4s-9s]", "[9s-12s]", "[12s-15s]"],
                 sig: ["triad boss", "exactly 12 rapid rhythmic cuts", "whiskey glasses", "silver lighter", "dark leather sofa"] },
  vipNight:    { dur: "15", aspect: "16:9", secs: 15, brackets: ["[0s-4s]", "[4s-9s]", "[9s-12s]", "[12s-15s]"],
                 sig: ["neon-lit nightclub", "exactly 12 rapid rhythmic cuts", "liquor bottles", "VIP sofa", "empty glass"] },
  mistArch:    { dur: "8", aspect: "16:9", secs: 8, cuts: 4,
                 sig: ["stone arch", "platinum-blonde wig", "qipao", "canal", "Four cuts"] },
  apsaraDance: { dur: "9", aspect: "9:16", secs: 9, cuts: 6,
                 sig: ["Dunhuang", "lotus", "pipa", "gauze ribbons", "Six cuts"] }
};
const KEYS = Object.keys(CARDS);

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
/* read a top-level array literal out of the app by bracket depth */
function appArray(name) {
  const i = APP.indexOf("var " + name + " = ["); const j = i >= 0 ? i : APP.indexOf("var " + name + "=[");
  const st = APP.indexOf("[", j); let d = 0;
  for (let k = st; k < APP.length; k++) {
    if (APP[k] === "[") d++; else if (APP[k] === "]") { d--; if (!d) return eval(APP.slice(st, k + 1)); }
  }
  throw new Error(name + " unterminated");
}

(async () => {
  /* ---- A) the source: four cards at the end of the deck, each with its own setup ---- */
  const block = APP.slice(APP.indexOf("var VID_WF=["), APP.indexOf("function vidWfByKey"));
  const keys = (block.match(/key:"([a-zA-Z0-9]+)"/g) || []).map(k => k.slice(5, -1));
  report("A) the deck holds thirty-three cards and the four reference-video cards close it, in the order the clips arrived",
    keys.length === 34 && new Set(keys).size === 34 && keys.slice(-4).join(",") === KEYS.join(","), { n: keys.length, tail: keys.slice(-4) });
  const setupGaps = [];
  KEYS.forEach(k => {
    const m = block.match(new RegExp('\\{ key:"' + k + '", art:"lib/vid/vw-' + k + '\\.jpg", setup:\\{ model:"([^"]+)", res:"([^"]+)", dur:"([^"]+)", aspect:"([^"]+)" \\},'));
    if (!m) { setupGaps.push(k + ": header line not in the expected shape"); return; }
    if (m[1] !== MODEL || m[2] !== "1080p" || m[3] !== CARDS[k].dur || m[4] !== CARDS[k].aspect)
      setupGaps.push(k + ": " + m.slice(1).join("/"));
  });
  report("A2) each carries its OWN setup — Seedance 2.5 Reference, 1080p, the clip's length and aspect — not the shelf's default",
    setupGaps.length === 0, setupGaps);

  const refLine = (APP.match(/var VID_REF = "([^"]*)";/) || [])[1] || "";
  report("A3) VID_REF exists, locks the student's identity, allows cuts, and is not written for one gender",
    refLine.indexOf("identity stay exactly as the reference photograph in every cut") >= 0 &&
    refLine.indexOf("no text or captions anywhere in the frame") >= 0 &&
    refLine.indexOf("Cut hard between shots") >= 0 &&
    refLine.indexOf("One continuous take") < 0 && refLine.indexOf("no cuts") < 0 &&
    refLine.indexOf("makeup is the only thing") < 0 && !/\bHer\b|\bher\b|\bshe\b/.test(refLine),
    { refLine });

  /* nine languages on every card, and the hint says whose face it is */
  const langGaps = [];
  KEYS.forEach(k => {
    const st = block.indexOf('{ key:"' + k + '"'); const en = block.indexOf("\n\n", st) > 0 ? block.indexOf("\n\n", st) : block.length;
    const card = block.slice(st, en);
    ["label", "summary", "hint"].forEach(f => {
      const m = card.match(new RegExp(f + ":L9\\(\\{([^\\n]*)\\}\\)"));
      if (!m) { langGaps.push(k + "." + f + " missing"); return; }
      LANGS.forEach(l => { if (m[1].indexOf(l + ':"') < 0) langGaps.push(k + "." + f + "." + l); });
    });
    const hint = (card.match(/hint:L9\(\{([^\n]*)\}\)/) || [])[1] || "";
    if (!/en:"1 photo — your own face/.test(hint)) langGaps.push(k + ".hint.en does not say it is your own face");
    if (hint.indexOf("ကိုယ့်မျက်နှာ") < 0) langGaps.push(k + ".hint.my does not say ကိုယ့်မျက်နှာ");
    const sum = (card.match(/summary:L9\(\{([^\n]*)\}\)/) || [])[1] || "";
    if (!/en:"Your face/.test(sum)) langGaps.push(k + ".summary.en does not lead with the student's face");
  });
  report("A4) label, summary and hint exist in all nine languages, and the hint and summary tell the student the face in the video is their own",
    langGaps.length === 0, langGaps.slice(0, 8));

  /* ---- B) the model the cards pin really offers what they set ---- */
  const models = appArray("RH_VIDEO_MODELS");
  const m = models.find(x => x.id === MODEL);
  const offerGaps = [];
  KEYS.forEach(k => {
    if (!m) return;
    if ((m.durations || []).map(String).indexOf(CARDS[k].dur) < 0) offerGaps.push(k + ": duration " + CARDS[k].dur + " not offered");
    if ((m.aspects || []).indexOf(CARDS[k].aspect) < 0) offerGaps.push(k + ": aspect " + CARDS[k].aspect + " not offered");
  });
  report("B) Seedance 2.5 Reference is in the catalog, takes reference photographs (imageUrls, 1 allowed), offers 1080p and every duration and aspect the four cards set",
    !!m && m.imageParam === "imageUrls" && m.minImages <= 1 && m.maxImages >= 1 && (m.resolutions || []).indexOf("1080p") >= 0 &&
    offerGaps.length === 0 && m.promptMax >= 4000,
    { found: !!m, offerGaps, promptMax: m && m.promptMax });

  /* ---- C) the prompts, evaluated as the app evaluates them ---- */
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    const got = await page.evaluate((KEYS) => {
      const out = { ref: VID_REF, rows: {} };
      KEYS.forEach(k => {
        const w = vidWfByKey(k);
        out.rows[k] = { text: w.text(), label: w.label, summary: w.summary, hint: w.hint, setup: w.setup, art: w.art };
      });
      return out;
    }, KEYS);
    const promptGaps = [];
    KEYS.forEach(k => {
      const r = got.rows[k], c = CARDS[k], t = r.text;
      if (t.indexOf("@person") >= 0) promptGaps.push(k + ": @person left in");
      if (!/the person in the reference photograph/i.test(t)) promptGaps.push(k + ": never names the reference photograph");
      if (!t.endsWith(got.ref)) promptGaps.push(k + ": does not close on VID_REF");
      if (t.indexOf("One continuous take") >= 0 || t.indexOf("no cuts") >= 0 || t.indexOf("makeup is the only thing") >= 0) promptGaps.push(k + ": carries a tail that fights the cuts");
      if (t.length > m.promptMax) promptGaps.push(k + ": " + t.length + " chars > promptMax " + m.promptMax);
      c.sig.forEach(s => { if (t.indexOf(s) < 0) promptGaps.push(k + ": missing '" + s + "'"); });
      if (c.brackets) {
        c.brackets.forEach(b => { if (t.indexOf(b) < 0) promptGaps.push(k + ": missing " + b); });
        if ((t.match(/Cut \d+-\d+:/g) || []).length !== 4) promptGaps.push(k + ": the four cut groups are not all there");
        if (t.indexOf("A " + c.secs + "-second") !== 0) promptGaps.push(k + ": does not open by naming its " + c.secs + " seconds");
      } else {
        /* the shots tile the clip exactly: 0 → secs, each starting where the last ended */
        const shots = [...t.matchAll(/Cut (\d+) \((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\)/g)].map(x => [+x[1], +x[2], +x[3]]);
        if (shots.length !== c.cuts) promptGaps.push(k + ": " + shots.length + " cuts, expected " + c.cuts);
        let ok = shots.length > 0 && shots[0][1] === 0 && shots[shots.length - 1][2] === c.secs;
        for (let i = 0; i < shots.length; i++) { if (shots[i][0] !== i + 1) ok = false; if (i && shots[i][1] !== shots[i - 1][2]) ok = false; if (shots[i][2] <= shots[i][1]) ok = false; }
        if (!ok) promptGaps.push(k + ": shots do not tile 0-" + c.secs + "s: " + JSON.stringify(shots));
        if (!new RegExp("^An? " + c.secs + "-second").test(t)) promptGaps.push(k + ": does not open by naming its " + c.secs + " seconds");
      }
      if (typeof r.label !== "string" || typeof r.summary !== "string" || typeof r.hint !== "string" || !r.label || !r.summary || !r.hint) promptGaps.push(k + ": label/summary/hint not resolved to strings");
    });
    report("C) every prompt is the clip's own — no @person, the reference photograph named, the cuts and beats of the clip, the clip's length, VID_REF at the end, inside the model's ceiling",
      promptGaps.length === 0, promptGaps.slice(0, 8));

    /* ---- D) the tap: model, size, length, aspect and prompt land on the page, and the wizard opens on the card ---- */
    const tap = await page.evaluate(async (KEYS) => {
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = [];
      switchPage("pgVideo"); await settle();
      for (const k of KEYS) {
        const w = vidWfByKey(k);
        const btn = [...document.querySelectorAll("#vidWfRow .wfmini")].find(b => (b.querySelector(".t") || {}).textContent === stripIcn(w.label));
        if (!btn) { out.push({ k, missing: true }); continue; }
        btn.click(); await settle();
        const sel = id => document.getElementById(id);
        out.push({ k,
          model: sel("selVidModel").value, res: sel("selVidRes").value, dur: sel("selVidDur").value, aspect: sel("selVidAspect").value,
          durOffered: [...sel("selVidDur").options].map(o => o.value).indexOf(w.setup.dur) >= 0,
          aspectOffered: [...sel("selVidAspect").options].map(o => o.value).indexOf(w.setup.aspect) >= 0,
          prompt: sel("vidPrompt").value === w.text(),
          wizOpen: /\bon\b/.test(document.getElementById("wiz").className),
          wizTitle: (document.querySelector("#wizIn .wiz-top .ttl") || {}).textContent || "",
          label: stripIcn(w.label), art: btn.querySelector("img") ? btn.querySelector("img").getAttribute("src") : null });
        closeVWiz(); await settle();
      }
      return out;
    }, KEYS);
    const tapGaps = tap.filter(r => r.missing || r.model !== MODEL || r.res !== "1080p" || r.dur !== CARDS[r.k].dur || r.aspect !== CARDS[r.k].aspect ||
      !r.durOffered || !r.aspectOffered || !r.prompt || !r.wizOpen || r.wizTitle.indexOf(r.label) < 0 || !/^lib\/vid\/vw-[A-Za-z]+\.jpg$/.test(r.art || ""));
    report("D) one tap on each card sets Seedance 2.5 Reference, 1080p, the clip's length and aspect (both really offered by the rebuilt selects), writes the prompt, and opens the wizard on the card",
      tap.length === 4 && tapGaps.length === 0, tapGaps);

    /* ---- E) the art: a real 960x640 card picture for each ---- */
    const art = await page.evaluate(KEYS => Promise.all(KEYS.map(k => new Promise(r => {
      const im = new Image(); im.onload = () => r({ k, w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => r({ k, w: 0, h: 0 });
      im.src = "lib/vid/vw-" + k + ".jpg?t=" + Date.now();
    }))), KEYS);
    report("E) every card has its own 960x640 picture on disk and it loads",
      KEYS.every(k => fs.existsSync(path.join(ROOT, "docs/app/lib/vid/vw-" + k + ".jpg"))) && art.every(a => a.w === 960 && a.h === 640), art);

    /* ---- F) What's New names the cards — the row shipped with 6.15.0 and later releases stack above it,
       so it is found by what it says, not by its position ---- */
    const wn = await page.evaluate(() => {
      const row = WHATS_NEW.find(e => e.kind === "page" && e.ref === "pgVideo" && /your own face in the lead/.test(e.t.en));
      return row ? { v: row.v, kind: row.kind, ref: row.ref, t: row.t.en, idx: WHATS_NEW.indexOf(row) } : { missing: true };
    });
    report("F) a What's New row opens the Video page and says whose face leads the four cards",
      !wn.missing && wn.v === "6.15.0" && /Triad Boss|Flying Apsara/.test(wn.t), wn);

    report("G) no page errors", errs.length === 0, errs);
  } finally { await browser.close(); }

  /* ---- H) the panel LIFTS the deck; it does not retype it ---- */
  const committed = fs.readFileSync(path.join(PANEL, "js", "hnk_video_wf_data.js"), "utf8");
  report("H) panel/js/hnk_video_wf_data.js is exactly what the app's deck produces today",
    committed === build(), "run: node tools/build_panel_video_wf.js");
  const pack = require(path.join(PANEL, "js", "hnk_video_wf_data.js"));
  const pmodels = require(path.join(PANEL, "js", "hnk_video_models.js"));
  const pm = (Array.isArray(pmodels) ? pmodels : []).find(x => x.id === MODEL);
  const pGaps = [];
  KEYS.forEach(k => {
    const w = pack.byKey(k);
    if (!w) { pGaps.push(k + " missing on the panel"); return; }
    if (w.setup.model !== MODEL || w.setup.dur !== CARDS[k].dur || w.setup.aspect !== CARDS[k].aspect || w.setup.res !== "1080p") pGaps.push(k + ": panel setup differs");
    if (!w.text || w.text().indexOf("@person") >= 0) pGaps.push(k + ": panel prompt");
    LANGS.forEach(l => { if (!w.label[l] || !w.summary[l] || !w.hint[l]) pGaps.push(k + "." + l + " missing on the panel"); });
  });
  report("H2) the lifted deck carries all thirty-three cards, the four with the same setup and prompts, and the panel's own video catalog knows the model they pin",
    pack.WF.length === 34 && pGaps.length === 0 && !!pm && pm.apiPath === m.apiPath, { n: pack.WF.length, pGaps, panelModel: !!pm });

  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
