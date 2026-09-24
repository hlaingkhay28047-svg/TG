/* 6.132.0 — THE CARD STOPS ARGUING WITH ITS OWN LOCK.
 *
 * The owner ran one photograph through a Background & Scene card twice and wrote, in short:
 * "လူက scenes ကိုလိုက်တာနဲ့ scenes က လူကိုလိုက်တာမှာ လဲ original subject frame compostion မူလအတိုင်းရအောင်လုပ်ပေးပါ …
 * ပထမပုံထုတ်တုန်းက professional ဟန်ချက်ထိန်းနဲ့ထုတ်တဲ့အချိန် မူလ frame အတိုင်းရပါတယ် … scene က လူကိုလိုက်နဲ့ထုတ်တော့
 * မူလ subject frame compostion မရဲ ခြေထောက်ပါလာတယ် နေရာရွေ့သွားတယ် … skin က background နဲ့အတူတူဖြစ်နေတယ်".
 * The three names he uses are the 6.129.0 Light-match options, not three cards: Professional
 * balance held the frame; Scene follows subject lost it and flattened the skin into the backdrop.
 *
 * 6.129.0 had already given all sixty-two cards in Background & Scene, Studio Scenes and Studio
 * Relight a FRAME EXTENT LOCK and a COLOUR SEPARATION LOCK. So the locks were there and the result
 * broke anyway. Measuring each card's OWN words against its own locks said why — four of them still
 * said the opposite in the same prompt:
 *
 *   reference-scenes  "extended wherever IMAGE 1's frame reaches past what IMAGE 2 shows"
 *                     "IMAGE 2's light and colour falling on the subject"
 *   studio-look-copy  "extend it convincingly wherever IMAGE 1's frame reaches past…"
 *   bg-replace        "colour-grade the subject into the new scene's white balance"
 *   pr-roBgSwap       "choosing a natural spot, scale and framing for them"
 *                     "Relight and colour-grade the subject to match the scene's … mood"
 *
 * A model handed two opposite instructions obeys one of them. Six more cards matched the same scan
 * and were read, not changed — master-bgfg-replace, pr-fgbglc, kitsune-nine-tail, mermaid-transform
 * and fairy-wings say "never zoom, re-crop or pull back" and "without zooming out", which REINFORCE
 * the lock, and lg-winSoftL's "widen" is a beam of light, not a frame.
 *
 * A third finding: COLOUR SEPARATION LOCK freezes the person's white balance, and it had been given
 * to the three cards whose whole job is to put IMAGE 2's grade on the frame — Studio Look Copy, Full
 * Look Transfer and Regency Birthday Portrait. Those three now carry SUBJECT SEPARATION LOCK, which
 * allows the grade and forbids the flattening.
 *
 * What this pins: the three house-line changes; the four rewritten card sentences with the six old
 * ones gone from every surface; the per-card choice of separation lock and the balance line that
 * cites it; both non-default Light-match options carrying the separation requirement; the AVOID list
 * naming the two failures the owner photographed; and — the rule that stops this class coming back —
 * a standing scan proving no card in the three groups licenses, in its own words, what its own locks
 * forbid. The panel's lifted catalog carries the identical lines, and the 6.132.0 / 6.203.0 chain.
 * Usage: PORT=8931 node test/verify_scene_lock_agreement_6132.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const A = require("../tools/lib/app-data.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js"), WN = read("docs/app/data/whatsnew.js"), PWN = read("panel/js/hnk_whats_new.js");
const LIBWF = A.libWfText(), HNKDATA = A.hnkDataText(), PCAT = read("panel/js/hnk_wf_catalog_data.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.133.0", PVER = "6.204.0";
const COUNT = 275;
const LOOK_IDS = ["studio-look-copy", "full-look-transfer", "regency-birthday"];
const HOUSE_TAGS = ["FRAME EXTENT LOCK:", "COLOUR SEPARATION LOCK:", "SUBJECT SEPARATION LOCK:",
  "LIGHT MATCH LOCK:", "SKIN FINISH:", "FRAME BALANCE:", "REAL PHOTOGRAPH:", "SKIN TONE TRUTH:"];

/* the six sentences 6.132.0 removed — none of them may come back, on any surface */
const GONE = [
  "extended wherever IMAGE 1's frame reaches past what IMAGE 2 shows",
  "IMAGE 2's light and colour falling on the subject",
  "extend it convincingly wherever IMAGE 1's frame reaches past what IMAGE 2 shows",
  "colour-grade the subject into the new scene's white balance",
  "choosing a natural spot, scale and framing for them",
  "Relight and colour-grade the subject to match the scene's light direction, colour temperature and mood",
];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ===================== A) the house lines, at their source ===================== */
report("A1) FRAME EXTENT LOCK names the failure the owner photographed — the abstract rule was already there and the legs came back anyway",
  has(APP, "never pull back, zoom out or extend the canvas.") &&
  has(APP, "Never draw a leg, a foot, a shoe, a hand or a hem that the photograph you are") &&
  has(APP, " editing does not already show.\";"), null);

report("A2) COLOUR SEPARATION LOCK now also forbids the flattening, not only the tint",
  has(APP, "They stay clearly separated from what is behind") &&
  has(APP, "never one flat tone across person and place."), null);

report("A3) the three whole-frame look cards carry SUBJECT SEPARATION LOCK instead — it allows the grade their card exists for and forbids one tone across person and place",
  has(APP, 'var SEP_LOOK_IDS=["studio-look-copy","full-look-transfer","regency-birthday"];') &&
  has(APP, 'var SEP_LOOK_TAG="SUBJECT SEPARATION LOCK:";') &&
  has(APP, "this card grades the whole frame on purpose") &&
  has(APP, "wash across person and place alike is a failed result.") &&
  has(APP, "var sepTag=(SEP_LOOK_IDS.indexOf(w.id)>=0)?SEP_LOOK_TAG:SEP_TAG;") &&
  has(APP, "var sepLine=(SEP_LOOK_IDS.indexOf(w.id)>=0)?SEP_LOOK_LINE:SEP_LINE;") &&
  has(APP, "if(w.prompt.indexOf(sepTag)<0) w.prompt=sceneAdd(w.prompt, sepLine);"), null);

report("A4) FRAME BALANCE cites the lock its own card carries — naming COLOUR SEPARATION LOCK on a look card put the contradiction straight back",
  has(APP, "never overrides COLOUR SEPARATION LOCK: the person's own colour still comes from IMAGE 1.") &&
  has(APP, "var BAL_LOOK_LINE=BAL_TAG+") &&
  has(APP, "never overrides SUBJECT SEPARATION LOCK: the person must still read as separated from the") &&
  has(APP, "w.prompt=sceneAdd(w.prompt, (SEP_LOOK_IDS.indexOf(w.id)>=0)?BAL_LOOK_LINE:BAL_LINE);"), null);

report("A5) both ways the owner named keep the person separated from the backdrop; the professional balance he said already worked is untouched",
  has(APP, "one flat tone: keep them clearly SEPARATED from the backdrop in brightness, in hue") &&
  has(APP, "skin the same tone as the wall behind it is a failed result.") &&
  has(APP, "they must still read as SEPARATED from the backdrop in brightness,") &&
  has(APP, "never relight them until skin and background are one tone.") &&
  has(APP, "the person and the scene meet in the middle"), null);

report("A6) the AVOID list every scene card gets names the two failures from the photograph",
  has(APP, "a leg or a foot") && has(APP, "drawn that the photograph never showed") &&
  has(APP, "the person and the background reduced to one") && has(APP, "tone, the subject lost against the backdrop"), null);

/* ===================== B) the four card sentences ===================== */
report("B1) Reference Scenes extends the PLACE and nothing else, and IMAGE 2's colour belongs to the scene",
  has(LIBWF, "extending THE PLACE ALONE") &&
  has(LIBWF, "the frame does not grow and neither does the person") &&
  has(LIBWF, "IMAGE 2's light DIRECTION agreeing with the light already on the subject") &&
  has(LIBWF, "IMAGE 2's colour belongs to the scene, never to the skin"), null);
report("B2) Studio Look Copy extends the SET",
  has(LIBWF, "extend THE SET convincingly wherever IMAGE 1's frame reaches past what IMAGE 2 shows"), null);
report("B3) BG Replace relights the person without repainting them",
  has(LIBWF, "The scene's colour reaches the person only as a faint ambient bounce at the very edge of the body"), null);
report("B4) BG Swap keeps IMAGE 1's framing and leaves the person's colour alone (it lives in the studio tables, not the catalog)",
  has(HNKDATA, "keeping their exact position, scale and framing from IMAGE 1 and fitting the scene around them") &&
  has(HNKDATA, "no leg, foot, shoe or hand it does not show is ever drawn") &&
  has(HNKDATA, "The scene's colour temperature and mood belong to the scene"), null);
const goneLeft = GONE.filter(t => has(LIBWF, t) || has(HNKDATA, t) || has(APP, t) || has(PCAT, t));
report("B5) none of the six removed sentences survives anywhere — catalog, studio tables, shell or the panel's lifted copy",
  goneLeft.length === 0, goneLeft);

/* ===================== C) the app, booted ===================== */
/* THE STANDING RULE — this is what stops the class of defect coming back.
   A card in the three lock groups may name extending the frame, zooming out, pulling back,
   choosing its own framing, or putting the scene's colour on the person ONLY to forbid it (a
   negation in the words just before the verb), or — for the frame — when what it extends is
   named as the place, on either side of the verb. The colour rules do not apply to the three
   cards that carry SUBJECT SEPARATION LOCK: grading the whole frame is what those cards are for.
   Measured on this catalog: SIX hits before 6.132.0 — exactly the four cards and six sentences
   this release rewrote — and none after. */
const SCAN_FN = `(function (body, look) {
    const RULES = [
      { v: "\\\\bextend(?:s|ed|ing)?\\\\b",            k: "extend",              f: "frame",  n: "\\\\bframe\\\\b|\\\\bcanvas\\\\b", a: 200 },
      { v: "\\\\bzoom(?:ing)? out\\\\b",               k: "zoom out",            f: "frame" },
      { v: "\\\\bpull(?:ing)? back\\\\b",              k: "pull back",           f: "frame" },
      { v: "\\\\bchoos(?:e|ing)\\\\b",                 k: "choose the framing",  f: "frame",  n: "\\\\b(scale|framing)\\\\b", a: 90 },
      /* the object must FOLLOW the verb: "colour-grade the subject" is a licence,
         "the mood of its colour grade … remove them completely" is not */
      { v: "colou?r[- ]?grad(?:e|ing)\\\\s+(?:the subject|the person|them)\\\\b", k: "grade the person", f: "colour" },
      { v: "\\\\bcolou?r\\\\b",                        k: "scene colour on the person", f: "colour",
        n: "\\\\b(on|onto|over|falling on)\\\\s+the\\\\s+(subject|person|skin)\\\\b", a: 70 },
    ];
    const NEG = /\\b(never|not|no|without|cannot|don't)\\b/i;
    const PLACE = /\\b(THE PLACE|THE SET|the place|the set|the environment|the scene|the background|the backdrop)\\b/;
    const out = [];
    RULES.forEach(function (r) {
      if (r.f === "colour" && look) return;          /* a whole-frame look card may grade */
      const re = new RegExp(r.v, "gi");
      let m;
      while ((m = re.exec(body))) {
        const i = m.index;
        if (r.n && !new RegExp(r.n, "i").test(body.slice(i, i + (r.a || 120)))) continue;
        if (NEG.test(body.slice(Math.max(0, i - 70), i))) continue;           /* it forbids the thing */
        /* what it extends is the place, named on either side of the verb */
        if (r.f === "frame" && PLACE.test(body.slice(Math.max(0, i - 45), i + 60))) continue;
        out.push(r.k + " :: " + body.slice(Math.max(0, i - 40), i + 110).replace(/\\s+/g, " ").trim());
      }
    });
    return out;
  })`;

async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.HNK_WF_CATALOG, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate((T) => {
    const G = ["Background & Scene", "Studio Scenes", "Studio Relight"];
    const out = { all: 0, bg: 0, extent: [], sepPlain: [], sepLook: [], balWrong: [], avoid: [], licence: [] };
    const own = (p) => String(p || "").split("\n").filter(l => !T.HOUSE.some(t => l.indexOf(t) === 0)).join("\n");
    const scan = eval(T.SCAN);
    (window.HNK_WF_CATALOG || []).forEach(c => {
      if (G.indexOf(c.t) < 0) return;
      (c.items || []).forEach(w => {
        const p = String(w.prompt || ""), n = String(w.negative || "");
        out.all++;
        if (c.t === "Background & Scene") out.bg++;
        if (p.indexOf("Never draw a leg, a foot, a shoe, a hand or a hem") < 0) out.extent.push(w.id);
        const look = T.LOOK.indexOf(w.id) >= 0;
        if (look) {
          if (p.indexOf("SUBJECT SEPARATION LOCK:") < 0) out.sepLook.push(w.id + " missing");
          if (p.indexOf("\nCOLOUR SEPARATION LOCK:") >= 0) out.sepLook.push(w.id + " also frozen");
        } else {
          if (p.indexOf("COLOUR SEPARATION LOCK:") < 0) out.sepPlain.push(w.id + " missing");
          if (p.indexOf("never one flat tone across person and place") < 0) out.sepPlain.push(w.id + " no separation");
          if (p.indexOf("SUBJECT SEPARATION LOCK:") >= 0) out.sepPlain.push(w.id + " wrong lock");
        }
        if (p.indexOf("FRAME BALANCE:") >= 0) {
          const wantsLook = look;
          const citesLook = p.indexOf("never overrides SUBJECT SEPARATION LOCK") >= 0;
          const citesPlain = p.indexOf("never overrides COLOUR SEPARATION LOCK") >= 0;
          if (wantsLook ? !citesLook || citesPlain : !citesPlain || citesLook) out.balWrong.push(w.id);
        }
        if (c.t === "Background & Scene") {
          if (n.indexOf("a leg or a foot drawn that the photograph never showed") < 0) out.avoid.push(w.id + " no leg");
          if (n.indexOf("the person and the background reduced to one tone") < 0) out.avoid.push(w.id + " no tone");
          if (n.indexOf("the subject lost against the backdrop") < 0) out.avoid.push(w.id + " no separation");
        }
        /* the standing scan */
        scan(own(p), look).forEach(h => out.licence.push(w.id + "  " + h));
      });
    });
    out.def = window._wfFieldPrompt("reference-scenes", null);
    out.subject = window._wfFieldPrompt("reference-scenes", { matchmode: "subject" });
    out.scene = window._wfFieldPrompt("reference-scenes", { matchmode: "scene" });
    out.look = window._wfFieldPrompt("studio-look-copy", null);
    return out;
  }, { HOUSE: HOUSE_TAGS, LOOK: LOOK_IDS, SCAN: SCAN_FN });
  await ctx.close();
  return { r, errs };
}

(async () => {
  const browser = withPremium(await chromium.launch());
  try {
    const { r, errs } = await appWalk(browser);
    report("C1) every scene card's frame lock now names the failure — no leg, foot, shoe, hand or hem the photograph does not show",
      r.all === 62 && r.extent.length === 0, { n: r.all, gaps: r.extent.slice(0, 6) });
    report("C2) each card carries the separation lock that fits it: the three whole-frame look cards the subject one, the other fifty-nine the colour one with the flattening forbidden",
      r.sepLook.length === 0 && r.sepPlain.length === 0,
      { look: r.sepLook.slice(0, 6), plain: r.sepPlain.slice(0, 6) });
    report("C3) FRAME BALANCE names the lock its own card actually carries, on all twenty-nine Background & Scene cards",
      r.bg === 29 && r.balWrong.length === 0, { bg: r.bg, wrong: r.balWrong.slice(0, 6) });
    report("C4) THE STANDING RULE — no card in the three groups licenses, in its own words, what its own locks forbid; the same scan found exactly six such sentences before this release, on the four cards it rewrote",
      r.licence.length === 0, r.licence.slice(0, 5));
    report("C5) both ways the owner named compile with the separation requirement and no raw token; the professional balance he said worked is unchanged",
      /the person follows the scene/.test(r.subject) && /must still read as SEPARATED from the backdrop/.test(r.subject) &&
      /the scene follows the person/.test(r.scene) && /keep them clearly SEPARATED from the backdrop/.test(r.scene) &&
      /skin the same tone as the wall behind it is a failed result/.test(r.scene) &&
      /the person and the scene meet in the middle/.test(r.def) &&
      ![r.def, r.subject, r.scene].some(s => /\{\{/.test(s)),
      { subject: /SEPARATED/.test(r.subject), scene: /SEPARATED/.test(r.scene), def: /meet in the middle/.test(r.def) });
    report("C6) every Background & Scene card's AVOID list names the leg the photograph never showed and the person lost against the backdrop",
      r.avoid.length === 0, r.avoid.slice(0, 6));
    report("C7) a whole-frame look card compiles with the grade it exists for AND the separation it must keep, and the boot raised no page error",
      /SUBJECT SEPARATION LOCK: this card grades the whole frame on purpose/.test(r.look) &&
      /wash across person and place alike is a failed result/.test(r.look) &&
      !/COLOUR SEPARATION LOCK:/.test(r.look) && errs.length === 0,
      { errs, head: (r.look.match(/SUBJECT SEPARATION LOCK:[^\n]{0,60}/) || [])[0] });

    /* ===================== D) the panel carries the identical lines ===================== */
    const cat = (() => { const i = PCAT.indexOf("var CATALOG = "); const j = PCAT.indexOf(";\n", i);
      return JSON.parse(PCAT.slice(i + 14, j)); })();
    const pBg = cat.categories.find(c => c.category === "Background & Scene");
    const pItems = [].concat.apply([], cat.categories.map(c => c.items));
    const pGaps = [];
    ["Background & Scene", "Studio Scenes", "Studio Relight"].forEach(t => {
      const c = cat.categories.find(x => x.category === t);
      if (!c) { pGaps.push(t + " missing"); return; }
      c.items.forEach(w => {
        const p = String(w.prompt || "");
        if (p.indexOf("Never draw a leg, a foot, a shoe, a hand or a hem") < 0) pGaps.push(w.id + " no named extent");
        const look = LOOK_IDS.indexOf(w.id) >= 0;
        if (look && p.indexOf("SUBJECT SEPARATION LOCK:") < 0) pGaps.push(w.id + " no subject lock");
        if (!look && p.indexOf("never one flat tone across person and place") < 0) pGaps.push(w.id + " no separation");
      });
    });
    report("D1) the Photoshop panel's lifted catalog carries the identical lines — it is generated from this same composed catalog, so the student sees one studio on both surfaces",
      !!pBg && pBg.items.length === 29 && pItems.length > 190 && pGaps.length === 0,
      { bg: pBg && pBg.items.length, n: pItems.length, gaps: pGaps.slice(0, 6) });

    /* ===================== F) the locks reach Imagine too ===================== */
    /* THE SECOND HOLE THE OWNER'S "အစအဆုံး" EXPOSED. 6.129.0 closed the frame and the skin on the
       sixty-two Smart Workflow scene cards and never touched Imagine. Composing every Imagine
       tool's REAL prompt and scanning it proved it: all twenty-two say "framing exactly" and "a
       changed crop", NOT ONE said how much of the body stays visible, and NOT ONE forbade the new
       scene's colour washing the person — and three of them (Background, Portrait, Sky) told the
       model the opposite in their own basePrompt. The nine tools that change what is AROUND the
       subject now carry the frame-extent lock; the six of those that put a new scene or new light
       on a PERSON also carry the colour-separation lock. ID Photo carries NEITHER, on purpose:
       "Frame the head and shoulders facing straight to the camera" IS that tool, and a frame
       lock would break it. Both lines are named "... LOCK:" so the 6.126.0 lock-aware cut keeps
       them whole on the capped models. */
    const IM = A.readImagine(), IMF = IM.frame;   /* the tables the page really loads, from data/imagine.js */
    const EXTENT_IDS = ["background", "portrait", "sky", "surface", "weather", "lighting", "productbg", "objremove", "objadd"];
    const SEP_IDS = ["background", "portrait", "sky", "surface", "weather", "lighting"];
    report("F1) the two Imagine house lines say what the photograph showed, and are named LOCK so the prompt cut keeps them",
      /^FRAME EXTENT LOCK:/.test(IMF.extent) && /no leg, foot, shoe, hand or hem/i.test(IMF.extent) &&
      /the frame never grows/.test(IMF.extent) && /whatever IMAGE 1's edge cuts off stays cut off/.test(IMF.extent) &&
      /^COLOUR SEPARATION LOCK:/.test(IMF.sep) && /stay as photographed/.test(IMF.sep) &&
      /skin the same tone as the wall behind it is a failed result/.test(IMF.sep),
      { extent: String(IMF.extent).slice(0, 70), sep: String(IMF.sep).slice(0, 70) });
    report("F2) the two lists name exactly the tools that change what is around the subject, and ID Photo is in neither",
      JSON.stringify(IMF.extentIds) === JSON.stringify(EXTENT_IDS) &&
      JSON.stringify(IMF.sepIds) === JSON.stringify(SEP_IDS) &&
      SEP_IDS.every(id => EXTENT_IDS.indexOf(id) >= 0) &&
      IMF.extentIds.indexOf("idphoto") < 0 && IMF.sepIds.indexOf("idphoto") < 0,
      { extent: IMF.extentIds, sep: IMF.sepIds });
    const imWalk = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pg = await ctx.newPage();
      const e2 = []; pg.on("pageerror", x => e2.push(String(x).slice(0, 200)));
      await pg.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
      await pg.waitForTimeout(2200);
      const out = await pg.evaluate(() => {
        const D = window.HNK_IMAGINE, res = {};
        D.tools.forEach(t => {
          const p0 = (t.presets && t.presets[0]) ? t.presets[0].id : "";
          res[t.id] = {
            plain: IMAGINE.prompt(t.id, p0, ""),
            ref: IMAGINE.prompt(t.id, "__ref", ""),
          };
        });
        return res;
      });
      await ctx.close();
      return { out, e2 };
    })();
    const IMP = imWalk.out;
    const noExtent = EXTENT_IDS.filter(id => !IMP[id] || IMP[id].plain.indexOf(IMF.extent) < 0);
    report("F3a) every one of the nine scene tools really composes the frame-extent lock into the prompt it sends",
      noExtent.length === 0, noExtent);
    const noSep = SEP_IDS.filter(id => !IMP[id] || IMP[id].plain.indexOf(IMF.sep) < 0);
    report("F3b) and the six that put a new scene or new light on a person compose the colour-separation lock",
      noSep.length === 0, noSep);
    const noRef = EXTENT_IDS.filter(id => IMP[id].ref.indexOf(IMF.extent) < 0)
      .concat(SEP_IDS.filter(id => IMP[id].ref.indexOf(IMF.sep) < 0));
    report("F4) the Reference Card route carries them too — a scene copied from IMAGE 2 is the very case the owner photographed",
      noRef.length === 0, noRef);
    report("F5) ID Photo carries NEITHER lock and still re-frames to head and shoulders, which is the whole tool",
      IMP.idphoto.plain.indexOf(IMF.extent) < 0 && IMP.idphoto.plain.indexOf(IMF.sep) < 0 &&
      /head and shoulders/i.test(IMP.idphoto.plain) && /IDENTITY LOCK:/.test(IMP.idphoto.plain),
      { extent: IMP.idphoto.plain.indexOf(IMF.extent), sep: IMP.idphoto.plain.indexOf(IMF.sep) });
    const OUTSIDE = IM.tools.map(t => t.id).filter(id => EXTENT_IDS.indexOf(id) < 0 && id !== "batch");
    const leaked = OUTSIDE.filter(id => IMP[id].plain.indexOf(IMF.extent) >= 0 || IMP[id].plain.indexOf(IMF.sep) >= 0);
    report("F6) no tool outside the two lists picked a lock up by accident — the change is scoped to the scene tools",
      leaked.length === 0, leaked);
    const FAIL2 = "a leg or a foot drawn that the photograph never showed, the person and the background reduced to one tone";
    const noFail = SEP_IDS.filter(id => IMP[id].plain.indexOf(FAIL2) < 0);
    report("F7) the AVOID list those six tools actually read names the two failures from the photograph",
      noFail.length === 0 && imWalk.e2.length === 0, { missing: noFail, errs: imWalk.e2 });
    const PIM = read("panel/js/hnk_imagine.js");
    report("F8) the Photoshop panel's lifted Imagine module carries the identical two lines and the identical lists",
      has(PIM, IMF.extent) && has(PIM, IMF.sep) &&
      has(PIM, 'D.frame.extentIds && D.frame.extentIds.indexOf(tool.id) >= 0') &&
      has(PIM, 'D.frame.sepIds && D.frame.sepIds.indexOf(tool.id) >= 0') &&
      EXTENT_IDS.every(id => has(PIM, '"' + id + '"')),
      { extent: has(PIM, IMF.extent), sep: has(PIM, IMF.sep) });

    /* ===================== G) the request itself cannot re-shape the frame ===================== */
    /* The owner asked for the whole path, not only the words. There are exactly two image-edit
       submit paths and both land in rhGenerateOne, which since 6.82.0 MEASURES IMAGE 1 when the
       ratio is Auto. That makes the v5.94.0 size note false — and it was telling the student to
       replace Auto with a fixed ratio, the one request in this path that really can change the
       frame of the photograph being edited. It now states what happens. */
    report("G1) Imagine sends no ratio of its own, so every Imagine run goes through the measured-from-IMAGE-1 path",
      /rhGenerateOne\(state\.rhKey, cfg\.apiPath, o\.prompt, "",/.test(APP) &&
      has(APP, 'var ratio=$("selRatio").value;'),
      { imagine: /rhGenerateOne\(state\.rhKey, cfg\.apiPath, o\.prompt, "",/.test(APP) });
    const g = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pg = await ctx.newPage();
      const e3 = []; pg.on("pageerror", x => e3.push(String(x).slice(0, 200)));
      await pg.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
      await pg.waitForTimeout(2200);
      const out = await pg.evaluate((langs) => {
        /* the mechanism: Auto really resolves to a shape these endpoints can express */
        const m = RH_MODELS.find(x => x.sizeParam || x.whParam);
        const keys = Object.keys(RH_RATIO_WH);
        const unresolved = keys.filter(k => !rhWanWH(k, "4k") && !rhQwenSize(k, "4k"));
        const cc = rhCfg(); cc.activeModel = m.id; rhSaveCfg(cc);
        const size = document.getElementById("selSize"), ratio = document.getElementById("selRatio");
        const notes = {};
        langs.forEach(L => {
          window.LANG = L;
          size.value = "4K"; ratio.value = "";
          updateGenOptsForRHKind();
          const n = document.getElementById("genSizeNote");
          const shown = n && n.style.display !== "none" ? n.textContent : "";
          ratio.value = Array.from(ratio.options).map(o => o.value).filter(Boolean)[0] || "1:1";
          updateGenOptsForRHKind();
          notes[L] = { shown, cleared: (n && n.style.display !== "none" ? n.textContent : "") === "" };
        });
        window.LANG = "my";
        return { id: m.id, measured: rhNeedsMeasuredRatio(rhModelCfgOut(m.id), ""), keys: keys.length, unresolved, notes };
      }, LANGS);
      await ctx.close();
      return { out, e3 };
    })();
    report("G2) on a size-from-shape model an Auto ratio IS measured, and all seven shapes it can return reach a real size",
      g.out.measured === true && g.out.keys === 7 && g.out.unresolved.length === 0,
      { model: g.out.id, measured: g.out.measured, unresolved: g.out.unresolved });
    const badNote = LANGS.filter(L => {
      const s = g.out.notes[L].shown;
      return !s || s.indexOf("4K") < 0 || /Pick a ratio|Ratio တစ်ခု ရွေးပါ|လိူၵ်ႈ ratio|Ratio lata u|เลือกอัตราส่วน|选择一个比例|chọn tỷ lệ|Pilih rasio|Pilih nisbah/.test(s);
    });
    report("G3) the note tells the truth in all nine languages and no longer asks the student to replace Auto with a fixed ratio",
      badNote.length === 0 && LANGS.every(L => g.out.notes[L].cleared) && g.e3.length === 0,
      { wrong: badNote, sample: g.out.notes.en.shown, errs: g.e3 });

    /* ===================== E) the release chain ===================== */
    const manifest = JSON.parse(read("panel/release-manifest.json")), pv = JSON.parse(read("docs/download/panel-version.json"));
    report(`E1) ${VER} / panel ${PVER} in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest (+ artifact file, a 64-hex sha and a real size), panel-version.json, the download footer and the landing's badges`,
      has(APP, `var APP_VER="${VER}";`) && has(read("docs/app/version.json"), `"v":"${VER}"`) &&
      has(read("docs/app/sw.js"), `var CACHE = "hnk-web-studio-v${VER.replace(/\./g, "-")}";`) &&
      has(read("server/index.js"), `const API_VERSION = "${VER}";`) && has(MAIN, `const PANEL_VERSION = "${PVER}";`) &&
      has(read("panel/manifest.json"), `"version": "${PVER}"`) &&
      manifest.version === PVER && manifest.artifact_file === `HNK_Ai_Panel_v${PVER}.ccx` &&
      /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
      pv.v === PVER && pv.latest_version === PVER &&
      has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`) &&
      has(LANDING, VER) && has(LANDING, PVER),
      { manifest: manifest.version, pv: pv.v });
    const wnRow = (s) => { const i = s.indexOf(VER); return i < 0 ? "" : s.slice(i, i + 4000); };
    const rowA = wnRow(WN), rowP = wnRow(PWN);
    report("E2) the What's New row is there in all nine languages, on the web app and in the panel's lifted table",
      !!rowA && !!rowP && LANGS.every(l => new RegExp('"' + l + '"\\s*:').test(rowA.slice(0, 2600))) &&
      LANGS.every(l => new RegExp('"' + l + '"\\s*:').test(rowP.slice(0, 2600))),
      { app: rowA.slice(0, 80), panel: rowP.slice(0, 80) });
    const steps = (CI.match(/node test\//g) || []).length;
    report(`E3) the suite runs this test and the chain says ${COUNT}: the CI step, the count in the workflow and the landing's "${COUNT} tests"`,
      has(CI, "node test/verify_scene_lock_agreement_6132.js") && steps === COUNT &&
      has(LANDING, String(COUNT) + " tests") && has(LANDING, 'data-count="tests">' + COUNT + "<"),
      { steps });
  } finally {
    await browser.close();
  }
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — the card and its lock say the same thing, in both directions");
  process.exit(failures ? 1 : 0);
})();
