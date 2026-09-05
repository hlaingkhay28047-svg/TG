/* v6.19.0 — OUTFIT & SCENE: four Smart Workflows and the wizard's OUTFIT BOARD.
 *
 * The owner's brief (2026-09-05): "image1 က မိန်းကလေးဝတ်စုံကို image 4 က မိန်းကလေးဆီ ဝတ်ပေး၊
 * image 2 က ယောက်ျားလေးဝတ်စုံကို image 4 က ယောက်ျားလေးဆီ ဝတ်ပေး၊ image 3 က ပုံထဲ လူပါရင် လူဖျောက်ပြီး
 * နောက်ခံနဲ့ scene lighting ကို ယူပြီး image 4 ထဲ ထည့်၊ image 4 ရဲ့ မူလ skin ကို smooth ပေးပြီး ကြွအောင်၊
 * ဆံပင် retouch smooth၊ ပိုစ့် မူရင်းအတိုင်း၊ အစစ်နဲ့တူအောင်၊ အလင်းအမှောင်အရိပ် သေချာညှိ၊ image 4 ရဲ့
 * original frame ratio composition အတိုင်း … solo / family / group ပါ လုပ်ပေးထားပါ".
 *
 * Every configured image model carries three pictures (rhModelMaxIn), so the
 * two outfit photographs travel as ONE — the OUTFIT BOARD the wizard composes
 * (her look LEFT, his look RIGHT; two to four looks for a family or a group) —
 * and the numbering the model sees is IMAGE 1 outfits · IMAGE 2 scene · IMAGE 3
 * the people, the only edit target.
 *
 * What is asserted: the four records with three required inputs each and the
 * board declared on the three that take one; a prompt that names every role,
 * removes people from the scene picture, tailors the clothes, relights to the
 * scene, retouches skin without recolouring it, and keeps IMAGE 3's pose, frame
 * ratio and composition — with WHO WEARS WHAT stated per card; the four sit in
 * Background & Scene after Couple Compose and in WF_LOCK_NONE; nine-language
 * summaries and four-step guides in both languages; the counts move to 193 /
 * 200 on app, landing and the panel's Home; the wizard shows "Combine" only on
 * a board slot; composeBoard lays two pictures side by side and four two-by-two;
 * the panel's lifted catalog carries the same four records; What's New says so;
 * CI runs this.
 *
 * Usage: PORT=8931 node test/verify_outfit_scene.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const PANEL_CAT = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"), "utf8");
const PANEL_WN = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_whats_new.js"), "utf8");
const PANEL_HOME = fs.readFileSync(path.join(ROOT, "panel", "src", "ui", "screens", "home-screen.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const IDS = ["outfit-scene-solo", "outfit-scene-couple", "outfit-scene-family", "outfit-scene-group"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ---- A) the records ---- */
const lib = JSON.parse(APP.match(/<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const W = {}; IDS.forEach(id => { W[id] = lib.workflows.find(x => x.id === id); });
report("A) four records, each with exactly three required inputs — outfit(s), scene, the people — numbered IMAGE 1, 2, 3",
  IDS.every(id => W[id] && W[id].req.length === 3 && /IMAGE 1/.test(W[id].req[0]) && /Scene \(IMAGE 2\)/.test(W[id].req[1]) && /IMAGE 3/.test(W[id].req[2]) && (W[id].opt || []).length === 0),
  IDS.map(id => W[id] && W[id].req));
report("A2) titles say which of the four it is, one optional text field each, summaries name what moves and what stays",
  W["outfit-scene-solo"].title === "Outfit & Scene · Solo" && W["outfit-scene-couple"].title === "Outfit & Scene · Couple" &&
  W["outfit-scene-family"].title === "Outfit & Scene · Family" && W["outfit-scene-group"].title === "Outfit & Scene · Group" &&
  IDS.every(id => Array.isArray(W[id].fields) && W[id].fields.length === 1 && W[id].fields[0].token === "{{NOTE}}" && LANGS.every(l => W[id].fields[0].label[l])) &&
  IDS.every(id => /IMAGE 2/.test(W[id].summary) && /frame ratio and composition kept/.test(W[id].summary)), IDS.map(id => W[id].summary.slice(0, 80)));
report("A3) the board is declared on Couple (two looks) and on Family and Group (up to four), on slot 0 — and not on Solo",
  !W["outfit-scene-solo"].board && W["outfit-scene-couple"].board && W["outfit-scene-couple"].board.slot === 0 && W["outfit-scene-couple"].board.max === 2 &&
  W["outfit-scene-family"].board && W["outfit-scene-family"].board.max === 4 && W["outfit-scene-group"].board && W["outfit-scene-group"].board.max === 4 && W["outfit-scene-group"].board.slot === 0,
  IDS.map(id => W[id].board));

/* ---- B) the prompts ---- */
const gaps = [];
IDS.forEach(id => {
  const P = W[id].prompt;
  const need = [
    ["names IMAGE 1 as the outfit reference and takes the clothing only", /IMAGE 1 is the OUTFIT REFERENCE[\s\S]*Take the clothing only/],
    ["names IMAGE 2 as the scene and removes any person in it", /IMAGE 2 is the SCENE REFERENCE[\s\S]*remove them completely and rebuild the scene where they stood/],
    ["names IMAGE 3 as the only edit target with pose, frame ratio and composition fixed", /IMAGE 3 is the PHOTOGRAPH OF [\s\S]*ONLY edit target[\s\S]*frame ratio and the composition all stay exactly as photographed/],
    ["measures IMAGE 3 first", /MEASURE IMAGE 3 FIRST/],
    ["tailors the clothes to the pose and keeps nothing of the reference wearer", /re-tailored to each body and pose in IMAGE 3[\s\S]*Nothing of the reference wearer crosses over/],
    ["states who wears what", /WHO WEARS WHAT:/],
    ["rebuilds the surroundings as IMAGE 2's place, grounded, in IMAGE 3's frame", /SCENE: rebuild everything around the people as the place in IMAGE 2[\s\S]*feet grounded on IMAGE 2's ground with contact shadows[\s\S]*The crop and frame ratio remain IMAGE 3's/],
    ["relights to IMAGE 2's light with no gear in frame", /LIGHT AND SHADOW: relight the people to IMAGE 2's light[\s\S]*No lamps, softboxes, stands or light panels appear anywhere in the frame/],
    ["smooths and glows the skin without recolouring it, tidies the hair without restyling it", /SKIN AND HAIR:[\s\S]*luminous glow[\s\S]*never plastic or waxy[\s\S]*never lightened, darkened or shifted[\s\S]*no new hairstyle/],
    ["keeps faces, poses, positions, crop, frame ratio and composition", /KEEP: the faces and identities, expressions, gaze, poses, hands, body proportions and positions in the frame, the camera angle, the crop, the frame ratio and the composition of IMAGE 3/],
    ["carries the extra-request token and the series rule", /EXTRA REQUEST: \{\{NOTE\}\}[\s\S]*CONSISTENCY — THIS IS A SERIES/],
    ["ends on a TASK GUARD that changes exactly three things", /TASK GUARD:\nEdit IMAGE 3 only\. Change exactly three things: the clothing \(from IMAGE 1\), the surroundings and their light \(from IMAGE 2\), and the skin and hair finish\./],
  ];
  need.forEach(([what, re]) => { if (!re.test(P)) gaps.push(id + ": " + what); });
  if ((P.match(/TASK GUARD:/g) || []).length !== 1) gaps.push(id + ": TASK GUARD count");
  if (!/changed aspect ratio/.test(W[id].negative) || !/light panel in frame/.test(W[id].negative) || !/changed skin tone/.test(W[id].negative)) gaps.push(id + ": AVOID list");
});
report("B) every prompt states the three roles, measures IMAGE 3 first, tailors, rebuilds the scene, relights, retouches without recolouring, keeps pose and frame, and guards exactly three changes", gaps.length === 0, gaps);
const C = W["outfit-scene-couple"].prompt, F = W["outfit-scene-family"].prompt, G = W["outfit-scene-group"].prompt;
report("B2) Couple: her look is the LEFT of the board and goes onto the woman, his the RIGHT onto the man — never swapped or merged",
  /LEFT half shows the woman's look, the RIGHT half shows the man's look/.test(C) && /the woman of IMAGE 3 wears the LEFT look of IMAGE 1 and the man of IMAGE 3 wears the RIGHT look of IMAGE 1 — never swapped, merged or averaged/.test(C) && /outfits swapped between the woman and the man/.test(W["outfit-scene-couple"].negative), null);
report("B3) Family: each look to the person it fits, children sized to age, shared looks when there are more people than looks, nobody added or removed",
  /a girl's or boy's look to the children, every child's outfit sized to that child's age and body/.test(F) && /When there are more people than looks, people of the same kind share the fitting look/.test(F) && /Nobody is added or removed/.test(F) && /an adult's outfit on a child/.test(W["outfit-scene-family"].negative), null);
report("B4) Group: the board is the dress code, looks repeat around the group with no two identical side by side unless it is a uniform",
  /no two identical outfits stand side by side — unless the board shows a uniform/.test(G) && /DRESS-CODE BOARD/.test(G) && /two identical outfits side by side when the board is not a uniform/.test(W["outfit-scene-group"].negative), null);
report("B5) Solo: the one person wears the look; if the board shows several, the one that fits",
  /the one person in IMAGE 3 wears the look of IMAGE 1, sized to their body; if IMAGE 1 shows more than one look, use the one that fits this person/.test(W["outfit-scene-solo"].prompt), null);

/* ---- C) placement, locks, guides, summaries ---- */
report("C) the four sit in Background & Scene right after Couple Compose, and in WF_LOCK_NONE so the generic IMAGE 1 frame lock is never appended to an IMAGE 3 edit",
  APP.indexOf('"couple-compose","outfit-scene-solo","outfit-scene-couple","outfit-scene-family","outfit-scene-group","silhouette-romance"') >= 0 &&
  IDS.every(id => new RegExp('WF_LOCK_NONE = \\{[\\s\\S]{0,600}"' + id + '":1').test(APP)), null);
const stepGaps = [];
["WF_STEPS_EN", "WF_STEPS"].forEach(map => {
  const start = APP.indexOf("var " + map + " = {"); const end = APP.indexOf("\n    };", start) > 0 ? APP.indexOf("\n    };", start) : APP.indexOf("\n  };", start);
  const block = APP.slice(start, end > start ? end : start + 400000);
  IDS.forEach(id => {
    const m = block.match(new RegExp('"' + id + '": \\[\\n((?:      "[^\\n]*",?\\n)+)    \\]'));
    if (!m) { stepGaps.push(map + "." + id + " missing"); return; }
    const n = (m[1].match(/\n/g) || []).length;
    if (n !== 4) stepGaps.push(map + "." + id + " has " + n + " steps");
    if (map === "WF_STEPS_EN" && !/IMAGE 2/.test(m[1])) stepGaps.push(map + "." + id + " never names IMAGE 2");
    if (map === "WF_STEPS" && !/GENERATE/.test(m[1])) stepGaps.push(map + "." + id + " never says GENERATE");
  });
});
report("C2) four guide steps per card in English and in Myanmar", stepGaps.length === 0, stepGaps);
const sumGaps = [];
IDS.forEach(id => {
  const m = APP.match(new RegExp('      "' + id + '":\\{([^\\n]*)\\},\\n'));
  if (!m) { sumGaps.push(id + " summary row missing"); return; }
  LANGS.forEach(l => { if (!new RegExp('(^|,)' + l + ':"').test(m[1])) sumGaps.push(id + "." + l); });
  if (!/IMAGE 3/.test(m[1])) sumGaps.push(id + " summary never names IMAGE 3");
});
report("C3) nine-language summaries for all four", sumGaps.length === 0, sumGaps);
report("C4) Couple's steps tell the student to combine HER photo first, then HIS — the board's left-to-right order",
  /pick HER outfit photo first, then HIS/.test(APP) && /မိန်းကလေးဝတ်စုံပုံ အရင်၊ ယောက်ျားလေးဝတ်စုံပုံ နောက်/.test(APP), null);

/* ---- D) counts ---- */
report("D) the app, the landing and the panel's Home all count 193 Smart Workflows and 200 One-Tap",
  lib.workflows.filter(x => IDS.indexOf(x.id) >= 0).length === 4 && APP.indexOf("Smart Workflow 193") >= 0 && APP.indexOf("Smart Workflow 189") < 0 && APP.indexOf("One-Tap 200") >= 0 &&
  (LANDING.match(/Smart Workflow 193/g) || []).length >= 30 && /data-count="wf">193</.test(LANDING) && /data-count="tap">200</.test(LANDING) && LANDING.indexOf("One-Tap 196") < 0 &&
  /stat\(200, "One-Tap Workflows"\)/.test(PANEL_HOME),
  { n: lib.workflows.filter(x => IDS.indexOf(x.id) >= 0).length, app193: APP.indexOf("Smart Workflow 193") >= 0, landing193: (LANDING.match(/Smart Workflow 193/g) || []).length, panelHome: /stat\(200,/.test(PANEL_HOME) });

/* ---- E) the board helper in the source ---- */
report("E) the wizard owns a multi-file board input, a composeBoard that lays two or three side by side and four two-by-two, and a Combine button only on a board slot",
  /<input type="file" id="filePickBoard" [^>]*multiple hidden>/.test(APP) && /function composeBoard\(imgs\)\{\n    var n=imgs\.length, cols=n>3\?2:n, rows=n>3\?2:1, cell=1024, gap=24;/.test(APP) &&
  /if\(w\.board && w\.board\.slot===i\)\{/.test(APP) && /if\(files\.length===1\)\{ acceptImageFile\(files\[0\], slot\); return; \}/.test(APP) && /state\.refs\[slot\]=\{ mime:b\.mime, b64:b\.b64, label:"board x"\+imgs\.length \};/.test(APP), null);

/* ---- F..H) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const got = await page.evaluate(async (IDS) => {
      const out = { slots: {} };
      const sk = document.getElementById("onbSkip"); if (sk) sk.click();
      for (const id of IDS) {
        window._openWizardById(id);
        const start = document.querySelector("#wiz .wiz-nav .btn-gold"); start.click();
        const slots = Array.from(document.querySelectorAll("#wiz .wslot"));
        out.slots[id] = { n: slots.length, boardOn: slots.map(s => !!s.querySelector(".wboard")), names: slots.map(s => (s.querySelector(".nm") || {}).textContent || "") };
      }
      /* composeBoard, with two coloured pictures and then four */
      const mk = (w, h, color) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); return c; };
      const two = window.composeBoard([mk(600, 900, "#ff0000"), mk(900, 600, "#0000ff")]);
      const four = window.composeBoard([mk(500, 500, "#ff0000"), mk(500, 500, "#00ff00"), mk(500, 500, "#0000ff"), mk(500, 500, "#ffff00")]);
      const probe = await new Promise(res => { const im = new Image(); im.onload = () => { const c = mk(two.w, two.h, "#000"); const x = c.getContext("2d"); x.drawImage(im, 0, 0); const l = x.getImageData(Math.round(two.w * 0.25), Math.round(two.h * 0.5), 1, 1).data; const r = x.getImageData(Math.round(two.w * 0.75), Math.round(two.h * 0.5), 1, 1).data; res({ l: [l[0], l[1], l[2]], r: [r[0], r[1], r[2]] }); }; im.src = "data:image/jpeg;base64," + two.b64; });
      out.two = { w: two.w, h: two.h, n: two.n, mime: two.mime, probe };
      out.four = { w: four.w, h: four.h, n: four.n };
      return out;
    }, IDS);
    report("F) step 2 of each wizard shows three slots; the Combine button appears on slot 1 of Couple, Family and Group and nowhere on Solo",
      IDS.every(id => got.slots[id].n === 3) && JSON.stringify(got.slots["outfit-scene-solo"].boardOn) === "[false,false,false]" &&
      ["outfit-scene-couple", "outfit-scene-family", "outfit-scene-group"].every(id => JSON.stringify(got.slots[id].boardOn) === "[true,false,false]") &&
      /IMAGE 1 — Her Outfit LEFT/.test(got.slots["outfit-scene-couple"].names[0]), got.slots);
    report("G) composeBoard lays two pictures side by side — the first on the left, the second on the right — as one JPEG of two cells",
      got.two.w === 2 * 1024 + 3 * 24 && got.two.h === 1024 + 2 * 24 && got.two.n === 2 && got.two.mime === "image/jpeg" &&
      got.two.probe.l[0] > 200 && got.two.probe.l[2] < 80 && got.two.probe.r[2] > 200 && got.two.probe.r[0] < 80, got.two);
    report("G2) four pictures go two-by-two", got.four.w === 2 * 1024 + 3 * 24 && got.four.h === 2 * 1024 + 3 * 24 && got.four.n === 4, got.four);
    report("H) no page errors while driving it", errs.length === 0, errs);
  } finally {
    await browser.close();
  }

  /* ---- I) the panel carries the same records ---- */
  const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
  const items = [].concat.apply([], cat.categories.map(c => c.items));
  const pGaps = [];
  IDS.forEach(id => {
    const it = items.find(x => x.id === id);
    if (!it) { pGaps.push(id + " missing"); return; }
    /* the app appends its SKIN TONE TRUTH switch to every Background & Scene card at build time; the lifted copy carries it too */
    if (it.prompt.indexOf(W[id].prompt) !== 0) pGaps.push(id + " prompt differs");
    if (it.negative.indexOf(W[id].negative) !== 0) pGaps.push(id + " negative differs");
    if (it.req.length !== 3 || it.req[2] !== W[id].req[2]) pGaps.push(id + " inputs differ");
    /* the board is the web wizard's own convenience — the panel's student supplies the one board picture the label asks for */
  });
  const bgCat = cat.categories.find(c => c.category === "Background & Scene" || c.t === "Background & Scene");
  report("I) the panel's lifted catalog carries all four in Background & Scene with the app's prompts, AVOID lists and inputs",
    pGaps.length === 0 && !!bgCat && IDS.every(id => bgCat.items.some(x => x.id === id)) && items.length === 193,
    { pGaps, total: items.length, bg: !!bgCat });

  /* ---- J) What's New, CI ---- */
  const wnStart = APP.indexOf("var WHATS_NEW = [");
  const wnBlock = APP.slice(wnStart, APP.indexOf("\n];", wnStart));
  const rowRe = /\{ v:"([\d.]+)", kind:"wf", ref:"outfit-scene-couple",\s*t:\{my:"([^"]*)",en:"([^"]*)"/g;
  let row = null, m;
  while ((m = rowRe.exec(wnBlock))) { if (/Outfit & Scene/.test(m[3])) row = m; }
  report("J) What's New carries the row at 6.19.0 — found by what it says — naming all four and the three pictures, in Burmese and English",
    !!row && row[1] === "6.19.0" && /Solo \/ Couple \/ Family \/ Group/.test(row[3]) && /IMAGE 3/.test(row[3]) && /Solo \/ Couple \/ Family \/ Group/.test(row[2]), row && row.slice(1, 4).map(x => x.slice(0, 80)));
  report("J2) the panel's lifted What's New says the same, byte for byte", !!row && PANEL_WN.indexOf(row[0]) >= 0, null);
  report("J3) CI runs this", /node test\/verify_outfit_scene\.js/.test(CI), null);

  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — dressed from IMAGE 1, placed in IMAGE 2, IMAGE 3's pose and frame kept, on both surfaces");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
