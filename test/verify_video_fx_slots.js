/* v6.21.0 — VIDEO CARDS CUT FAST WITH VFX; REFERENCE SLOTS FOLLOW THE MODEL.
 *
 * The owner's brief, with six screenshots of the Media Lab deck (every card
 * "၁ ပုံ"): "prompts တွေကို ခပ်မြန်မြန်ခပ်သွက်သွက် တည်းဖြတ်အလန်းစားတွေနဲ့ visual effects
 * လန်းလန်းနဲ့ ပိုကောင်းအောင် … reference images slots ကိုလဲ ထပ်တိုး … မျက်နှာ reference ယူဖို့
 * models အလိုက် slots အလိုလို သတ်မှတ်ပြီး တိုးလို့ရအောင် … slots တိုင်း အားလုံး".
 *
 * Two shared clauses now live in the lifted VID block: VID_REFS (every reference
 * photograph is one person) and VID_FX (the edit-and-VFX language). VID_ID cuts
 * fast with VFX; VID_KEEP stays one take but gains motion and VFX; VID_CUT gains
 * transitions between its shots; boardingPass, the one card with no tail, closes
 * on VID_FX + VID_REFS; the four exact reference-video cards keep VID_REF as it
 * was. Slots: the Create page keeps its three; the VIDEO page's extra
 * photographs live in state.vidRefs, offered only when the model's image field
 * is an array with room (Omni Flash 3, Seedance 2.5 up to 30), shown as the
 * filled ones plus one empty on the strip and in the wizard, all of them sent.
 *
 * Usage: PORT=8931 node test/verify_video_fx_slots.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel", "main.js"), "utf8");
const PANEL_VID = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_video_wf_data.js"), "utf8");
const PANEL_WN = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_whats_new.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const REF_CARDS = ["triadBoss", "vipNight", "mistArch", "apsaraDance"];
const KEEP_CARDS = ["dressSpin", "veilWind", "portraitLive", "pushIn", "couplePose"];
const SHELF = "seedance-2-5-global-token-mmv";
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const VID_REF_6150 = 'var VID_REF = " Their face, bone structure and identity stay exactly as the reference photograph in every cut — it is the face from that photograph in this video, never another person\'s — while the styling, wardrobe and setting follow the shots above. Cut hard between shots, no dissolves, and no text or captions anywhere in the frame, no watermarks.";';

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
const line = name => (APP.match(new RegExp("\\nvar " + name + " = ([^\\n]*);\\n")) || [])[1] || "";

/* ---- A) the tails, in the source ---- */
const blkStart = APP.indexOf("var VID_CITIES=["), blkEnd = APP.indexOf("var VID_WF=[");
report("A) VID_REFS and VID_FX are defined inside the lifted VID block, so the panel's copy carries them",
  blkStart > 0 && APP.indexOf("var VID_REFS = ") > blkStart && APP.indexOf("var VID_REFS = ") < blkEnd && APP.indexOf("var VID_FX = ") > blkStart && APP.indexOf("var VID_FX = ") < blkEnd &&
  /var VID_REFS = " All reference photographs are the same person — use every one of them, the face from each angle, for her identity\."/.test(APP) &&
  /var VID_FX = " EDIT AND VFX: snappy beats — whip-pan, swipe and flash-frame transitions, a speed ramp, a punchy push-in, light leaks, a lens flare, film grain, a bold cinematic grade; nothing covers the face"/.test(APP), null);
const id = line("VID_ID"), keep = line("VID_KEEP"), cut = line("VID_CUT");
report("A2) VID_ID locks identity, closes on VID_REFS + VID_FX, no longer says one continuous take or forbids camera motion, and still bans stray text in the words the sweeps read",
  /^" Her face, bone structure, hair, makeup and identity stay exactly as the reference photograph from the first frame to the last\." \+ VID_REFS \+ VID_FX \+ ", and no text or captions anywhere in the frame beyond the lettering this shot calls for\."$/.test(id) && !/continuous take|no cuts|camera shake/.test(id), id.slice(0, 160));
report("A3) VID_KEEP now holds the dress, the light and the setting across cuts — the five hold-the-scene cards cut too — and closes on the same clauses",
  /the dress, the light and the setting stay as they are in every shot\." \+ VID_REFS \+ VID_FX \+ ", and no text or captions anywhere in the frame\."$/.test(keep) && !/no cuts|continuous take/.test(keep), keep.slice(0, 160));
report("A4) VID_CUT keeps the makeup-only lock and its hard cuts, gains transitions between shots, closes on VID_REFS, and never forbids cutting",
  /makeup is the only thing that changes on her/.test(cut) && /Cut hard on the beat/.test(cut) && /Between shots: whip-pan and flash-frame transitions, a speed ramp on each reveal/.test(cut) && /" \+ VID_REFS$/.test(cut) && !/no cuts|One continuous take/.test(cut), cut.slice(-120));
report("A5) VID_REF — the four exact reference-video cards' tail — is byte for byte what 6.15.0 shipped", APP.indexOf(VID_REF_6150) >= 0, null);
report("A6) boardingPass reaches VID_ID mid-text and adds nothing twice; the shelf pins Seedance 2.5 at thirty seconds", /\+ VID_ID \+ " The only lettering in the shot is the printing on the boarding pass itself\.";/.test(APP) && !/lookbook finish\." \+ VID_FX/.test(APP) &&
  /var VID_SETUP_V = \{ model:"seedance-2-5-global-token-mmv", res:"1080p", dur:"30", aspect:"9:16" \};/.test(APP), null);

/* ---- B) slots, in the source ---- */
report("B) the slot helpers exist — a fixed Create ceiling, get/set by slot, the model's capacity, every filled photo, the shown count, the label",
  /var REF_BASE=3;/.test(APP) && /function refGet\(slot\)/.test(APP) && /function refSet\(slot,obj\)/.test(APP) && /function vidRefMax\(m\)\{ m=m\|\|vidModelDef\(\); var ip=\(m&&m\.imageParam\)\|\|""; return \(\/Urls\$\|Images\$\|keyframes\/\.test\(ip\) && \(m\.maxImages\|0\)>1\) \? m\.maxImages : 1; \}/.test(APP) &&
  /function vidAllRefs\(\)\{ var mx=vidRefMax\(\); return state\.refs\.concat\(\(state\.vidRefs\|\|\[\]\)\.slice\(0, Math\.max\(0, mx-REF_BASE\)\)\)\.filter\(Boolean\); \}/.test(APP) && /function vidSlotsShown\(mx\)/.test(APP) && /function vidNeedLabel\(m\)/.test(APP) && /refs: \[null,null,null\], vidRefs: \[\], pickSlot: 0,/.test(APP), null);
report("B2) every pick writes through refSet — no bare state.refs[slot]= is left — and the VIDEO dispatch sends every filled photo",
  !/state\.refs\[slot\]=\{/.test(APP) && (APP.match(/refSet\(slot,\{/g) || []).length === 4 && /var refs=vidAllRefs\(\);[^\n]*\n  if\(refs\.length<m\.minImages\)/.test(APP), { refSets: (APP.match(/refSet\(slot,\{/g) || []).length });
report("B3) the VIDEO strip grows with the model and the wizard offers face-reference slots, both as the filled ones plus one empty",
  /if\(hostId==="vidRefStrip" && typeof vidRefMax==="function"\)\{\n      var mx=vidRefMax\(\), shown=vidSlotsShown\(mx\);/.test(APP) && /"IMG "\+\(k\+1\)\+" · "\+L9\(\{my:"မျက်နှာ",en:"face"/.test(APP) &&
  /var vmx=vidRefMax\(\), vlast=0; for\(var q0=1;q0<vmx;q0\+\+\) if\(refGet\(q0\)\) vlast=q0;\n      var vshown=Math\.min\(vmx, vlast\+2\);/.test(APP) && /"IMAGE "\+\(q\+1\)\+" — "\+vwizL\("slotFace"\), false,/.test(APP) &&
  /setTimeout\(renderRefStrip,0\)/.test(APP), null);
const slotFace = (APP.match(/\n  slotFace:\{([^\n]*)\},\n/) || [])[1] || "";
const needFn = (APP.match(/function vidNeedLabel\(m\)\{[\s\S]*?\n\}/) || [])[0] || "";
report("B4) the face-reference label and both badge strings speak the nine languages, and the badge reads the card's own model",
  LANGS.every(l => new RegExp('(^|,)' + l + ':"').test(slotFace)) && LANGS.every(l => (needFn.match(new RegExp('(^|,|\\{)' + l + ':"', "g")) || []).length === 2) &&
  /v\.appendChild\(el\("span","wf-need", vidNeedLabel\(rhVideoModelDef\(\(w\.setup\|\|\{\}\)\.model\) \|\| vidModelDef\(\)\)\)\);/.test(APP) && /if\(vwiz\.kind==="i2v"\) return vidNeedLabel\(vidModelDef\(\)\);/.test(APP), { slotFace: slotFace.slice(0, 80) });
const steps = (APP.match(/var VWIZ_STEPS=\{\n  i2v:\{\n([\s\S]*?)\n  \},/) || [])[1] || "";
report("B5) the guide's first step tells the student about face references in all nine languages",
  LANGS.every(l => new RegExp("\\n    " + l + ':\\["[^"]*\\{N\\}"').test("\n" + steps)) && /en:\["Add your photo — plus face references if you like — \{N\}"/.test(steps) && /my:\["ကိုယ့်ပုံ တင်ပါ — မျက်နှာ reference ပုံ ထပ်ထည့်လို့ရ — \{N\}"/.test(steps), steps.slice(0, 120));

/* ---- C) the panel ---- */
report("C) the panel's lifted VID_WF carries the same two clauses and the same three tails, and its badge reads the lifted model list",
  PANEL_VID.indexOf("var VID_REFS = ") >= 0 && PANEL_VID.indexOf("var VID_FX = ") >= 0 && PANEL_VID.indexOf("var VID_ID = " + id + ";") >= 0 && PANEL_VID.indexOf("var VID_KEEP = " + keep + ";") >= 0 && PANEL_VID.indexOf("var VID_CUT = " + cut + ";") >= 0 &&
  /function vwRefMax\(id\)/.test(PANEL_JS) && /function vwNeedFor\(w\)/.test(PANEL_JS) && /need\.textContent = vwNeedFor\(w\);/.test(PANEL_JS) && /if \(vwiz\.kind === "i2v"\) return vwNeedFor\(vwiz\.w\);/.test(PANEL_JS), null);

/* ---- D..H) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const got = await page.evaluate((PNG1) => {
      const out = {};
      const sk = document.getElementById("onbSkip"); if (sk) sk.click();
      /* D) every card's prompt fits its model, and closes on the right clause */
      out.cards = VID_WF.map(w => {
        const m = rhVideoModelDef((w.setup || {}).model) || vidModelDef();
        const t = w.cities ? w.text(vidCityDef(vidWfCity)) : w.text();
        return { key: w.key, model: m.id, dur: (w.setup || {}).dur, aspect: (w.setup || {}).aspect, len: t.length, cap: m.promptMax, refs: t.indexOf(VID_REFS) >= 0, fx: t.indexOf("EDIT AND VFX") >= 0, whip: t.indexOf("whip-pan") >= 0, one: t.indexOf("One continuous take") >= 0, endsRef: t.endsWith(VID_REF), noCuts: t.indexOf("no cuts") >= 0, thirty: /^Thirty seconds/.test(t), shots: (t.match(/SHOT \d+ \(/g) || []).length, lastShot: (t.match(/SHOT \d+ \([\d.]+-30s\)/) || [null])[0], quotes: (t.match(/"[^"]+"/g) || []).length, alien: /AI camera rig/.test(t) && /robot gun/.test(t) && /alien army|alien soldiers/.test(t) && /TRANSFORMS|transforms/.test(t) };
      });
      /* E) badges on the deck */
      switchPage("pgVideo");
      out.badges = Array.from(document.querySelectorAll("#pgVideo .wf-need")).map(e => e.textContent.trim());
      /* F) the strip follows the model */
      const strip = () => Array.from(document.querySelectorAll("#vidRefStrip .rs")).map(d => (d.className.indexOf("rs-face") >= 0 ? "F" : "B") + (d.className.indexOf("filled") >= 0 ? "*" : ""));
      const sd = VID_WF.find(w => w.key === "triadBoss");
      state.refs = [null, null, null]; state.vidRefs = [];
      vidWfApply(sd); renderRefs();
      out.F0 = { max: vidRefMax(), strip: strip() };
      refSet(0, { mime: "image/png", b64: PNG1 }); refSet(3, { mime: "image/png", b64: PNG1 }); renderRefs();
      out.F1 = { strip: strip(), all: vidAllRefs().length, vidRefs: state.vidRefs.filter(Boolean).length, refsBase: state.refs.filter(Boolean).length };
      refSet(4, { mime: "image/png", b64: PNG1 }); renderRefs();
      out.F2 = { strip: strip(), all: vidAllRefs().length };
      document.getElementById("selVidModel").value = "gemini-omni-video"; updateVidModelUI(); renderRefs();
      out.F3 = { max: vidRefMax(), strip: strip(), all: vidAllRefs().length };
      /* G) the wizard's face-reference slots */
      state.refs = [{ mime: "image/png", b64: PNG1 }, null, null]; state.vidRefs = [];
      vidWfApply(sd);
      openVWiz("i2v", sd);
      document.querySelector("#wiz .wiz-nav .btn-gold").click();
      const slots = () => Array.from(document.querySelectorAll("#wiz .wslot")).map(s => ({ nm: (s.querySelector(".nm") || {}).textContent || "", req: !!s.querySelector(".rq:not(.opt)"), filled: s.className.indexOf("filled") >= 0 }));
      out.G0 = slots();
      refSet(1, { mime: "image/png", b64: PNG1 }); renderVWiz();
      out.G1 = slots();
      refSet(2, { mime: "image/png", b64: PNG1 }); renderVWiz();
      out.G2 = slots();
      out.needText = document.querySelector("#wiz .mut") ? document.querySelector("#wiz .wiz-body") && true : false;
      closeVWiz();
      state.refs = [null, null, null]; state.vidRefs = []; renderRefs();
      return out;
    }, PNG1);
    const over = got.cards.filter(c => c.len > c.cap);
    report("D) all 34 cards' prompts fit their own model's cap", got.cards.length === 34 && over.length === 0, { over, longest: got.cards.slice().sort((a, b) => b.len - a.len).slice(0, 3) });
    const refCards = got.cards.filter(c => REF_CARDS.indexOf(c.key) >= 0), others = got.cards.filter(c => REF_CARDS.indexOf(c.key) < 0);
    report("D2) the four exact reference cards still close on VID_REF with none of the new language; every other card carries the one-person clause",
      refCards.length === 4 && refCards.every(c => c.endsRef && !c.refs && !c.fx && !c.thirty) && others.length === 30 && others.every(c => c.refs), { refCards, missing: others.filter(c => !c.refs).map(c => c.key) });
    report("D3) every one of the 30 carries whip-pan transitions and none closes on a continuous-take or no-cuts clause",
      others.every(c => c.whip && !c.one && !c.noCuts), { bad: others.filter(c => !(c.whip && !c.one && !c.noCuts)).map(c => [c.key, c.one, c.noCuts, c.whip]) });
    const shelf = others.filter(c => c.key !== "alienCommander");
    report("D4) the 29 shelf cards are thirty-second, time-coded fast-cut lists of ten to fourteen shots ending at 30s, all on Seedance 2.5 at dur 30 / 9:16",
      shelf.length === 29 && shelf.every(c => c.thirty && c.shots >= 10 && c.shots <= 14 && c.lastShot && c.model === SHELF && c.dur === "30" && c.aspect === "9:16"), { bad: shelf.filter(c => !(c.thirty && c.shots >= 10 && c.shots <= 14 && c.lastShot && c.model === SHELF && c.dur === "30" && c.aspect === "9:16")).map(c => [c.key, c.thirty, c.shots, c.lastShot, c.model, c.dur, c.aspect]) });
    const al = got.cards.find(c => c.key === "alienCommander");
    report("D5) Alien War Commander: 16:9, thirty seconds, fourteen shots, the AI camera that transforms into a robot gun, the alien army, three lines of English dialogue, the one-person clause, its own identity lock",
      !!al && al.aspect === "16:9" && al.dur === "30" && al.model === SHELF && al.thirty && al.shots === 14 && al.alien && al.quotes === 3 && al.refs && al.whip, al);
    report("E) the deck's 34 badges read the card's model — every card now on Seedance 2.5 says \"1–30 photos\"",
      got.badges.length === 34 && got.badges.every(b => /1–30 /.test(b) || /၁–၃၀ /.test(b)), { n: got.badges.length, sample: got.badges.slice(0, 3), last: got.badges.slice(-2) });
    report("F) on a Seedance card the VIDEO strip shows the three base slots plus one empty face slot; filling one adds the next; every filled photo is counted",
      got.F0.max === 30 && JSON.stringify(got.F0.strip) === '["B","B","B","F"]' && JSON.stringify(got.F1.strip) === '["B*","B","B","F*","F"]' && got.F1.all === 2 && got.F1.vidRefs === 1 && got.F1.refsBase === 1 &&
      JSON.stringify(got.F2.strip) === '["B*","B","B","F*","F*","F"]' && got.F2.all === 3, { F0: got.F0, F1: got.F1, F2: got.F2 });
    report("F2) switched to Omni Flash (three images) the strip is the three base slots again, and only the photos the model can hold are sent",
      got.F3.max === 3 && JSON.stringify(got.F3.strip) === '["B*","B","B"]' && got.F3.all === 1, got.F3);
    report("G) the wizard shows IMAGE 1 (required) and one empty face-reference slot; each filled reference reveals the next; extras are optional",
      got.G0.length === 2 && got.G0[0].req && got.G0[0].filled && !got.G0[1].req && !got.G0[1].filled && /IMAGE 2 — /.test(got.G0[1].nm) &&
      got.G1.length === 3 && got.G1[1].filled && !got.G1[2].filled && /IMAGE 3 — /.test(got.G1[2].nm) && got.G2.length === 4 && /IMAGE 4 — /.test(got.G2[3].nm) && !got.G2[3].req, { G0: got.G0, G1: got.G1, G2: got.G2 });
    report("H) no page errors while driving it", errs.length === 0, errs);
  } finally {
    await browser.close();
  }

  /* ---- I) What's New, CI ---- */
  const wnStart = APP.indexOf("var WHATS_NEW = [");
  const wnBlock = APP.slice(wnStart, APP.indexOf("\n];", wnStart));
  const rowRe = /\{ v:"([\d.]+)", kind:"page", ref:"pgVideo",\s*t:\{my:"([^"]*)",en:"([^"]*)"/g;
  let row = null, m;
  while ((m = rowRe.exec(wnBlock))) { if (/30-second fast-cut films with VFX/.test(m[3])) row = m; }
  report("I) What's New carries the row at 6.21.0 — found by what it says — naming the fast editing, the VFX and the model-following slots",
    !!row && row[1] === "6.21.0" && /face-reference slots/.test(row[3]) && /VFX/.test(row[2]), row && row.slice(1, 4).map(x => x.slice(0, 80)));
  report("I2) the panel's lifted What's New says the same, byte for byte", !!row && PANEL_WN.indexOf(row[0]) >= 0, null);
  report("I3) CI runs this", /node test\/verify_video_fx_slots\.js/.test(CI), null);

  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every card cuts the way it should, and the slots follow the model");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
