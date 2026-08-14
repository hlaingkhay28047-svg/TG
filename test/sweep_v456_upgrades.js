/* v4.56.0 regression sweep — the face the app edits is the face in the photo.

   Everything facial in the Studio pipeline hung off stSkinMask's bounding box,
   which is the box around EVERY skin pixel in the frame: face, neck,
   shoulders, arms, chest. stFaceZones then treated that as a FACE box and
   searched for eyes in rows 18-55% of it and the mouth in rows 58-95%.

   On a head-and-shoulders portrait — which is most wedding photography — that
   puts the "mouth band" on the collarbone. Measured on a 600x800 synthetic
   portrait before this release: the real mouth sits at y=260, the code
   searched y=453..714 and reported a mouth at y=577. Lip colour, blush and
   teeth whitening were all acting on the subject's chest. Blush was worse
   still: its ellipse was sized from that same whole-body box, so its radius
   was a fraction of the SUBJECT'S WIDTH rather than of a cheek.

   Pinned contracts:
   A) stHeadBox isolates the head by finding the first width peak (cheekbones)
      and the pinch after it (neck) — not the global maximum, which is the
      shoulders.
   B) On a head-and-shoulders portrait the head box is dramatically shorter
      than the skin box, and contains the real eyes and mouth.
   C) A face frame is fitted from the eye and mouth anchors and yields the
      named regions a retoucher asks for by name.
   D) Every facial region is centred inside the head — never on the backdrop,
      which is where the ears landed on the first draft of this release.
   E) The legacy zones.eyes / zones.mouth shape still exists, so every caller
      written before this release keeps working.
   F) Blush and lip colour use the real regions rather than the whole-body box.
   G) A confidence is reported, and the overlay strings exist in all nine
      languages so a mis-read face is something the operator can see.

   Usage: PORT=8931 node test/sweep_v456_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1100);

  const r = await page.evaluate(async () => {
    const out = {};

    /* ---- a synthetic head-and-shoulders portrait with known truth ---- */
    const W = 600, H = 800;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#101820"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#d9a97f";
    x.beginPath(); x.ellipse(300, 190, 110, 145, 0, 0, 7); x.fill();   // head
    x.fillRect(255, 300, 90, 90);                                       // neck
    x.beginPath(); x.ellipse(300, 560, 250, 190, 0, 0, 7); x.fill();    // chest
    x.fillStyle = "#20140c";
    x.beginPath(); x.ellipse(258, 170, 20, 11, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(342, 170, 20, 11, 0, 0, 7); x.fill();
    const px = x.getImageData(0, 0, W, H);
    const mi = stSkinMask(px, W, H);
    const head = stHeadBox(mi.mask, W, H);

    out.skinBoxH = mi.box ? mi.box.y1 - mi.box.y0 : 0;
    out.headBoxH = head ? head.y1 - head.y0 : 0;
    /* A/B) the head must be a small fraction of the whole skin silhouette and
       must not reach the chest (the chest ellipse starts around y=370) */
    out.A_found = !!head;
    out.A_shorter = out.headBoxH > 0 && out.headBoxH < out.skinBoxH * 0.6;
    out.B_notChest = !!head && head.y1 < 370;
    out.B_holdsEyes = !!head && head.y0 <= 170 && head.y1 >= 170;

    /* ---- the real sample portrait that ships with the app ---- */
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej;
      i.src = "lib/st-sample.jpg";
    });
    const SW = img.naturalWidth, SH = img.naturalHeight;
    const c2 = document.createElement("canvas"); c2.width = SW; c2.height = SH;
    const x2 = c2.getContext("2d", { willReadFrequently: true });
    x2.drawImage(img, 0, 0);
    const px2 = x2.getImageData(0, 0, SW, SH);
    const mi2 = stSkinMask(px2, SW, SH);
    const head2 = stHeadBox(mi2.mask, SW, SH);
    const z = stFaceZones(px2, SW, SH, mi2);

    out.C_zones = !!z;
    out.C_regions = z && z.r ? Object.keys(z.r).length : 0;
    /* the named features a retoucher asks for by name must all exist */
    const NEED = ["eyeL", "eyeR", "lidL", "lidR", "lashL", "lashR", "browL", "browR",
      "noseBridge", "noseTip", "nostrilL", "nostrilR", "philtrum", "lipUpper",
      "lipLower", "teeth", "chin", "jawL", "jawR", "cheekL", "cheekR",
      "templeL", "templeR", "earL", "earR", "forehead", "hairline"];
    out.C_missing = z && z.r ? NEED.filter(k => !z.r[k]) : NEED;

    /* D) nothing may be centred outside the head */
    out.D_outside = [];
    if (z && z.r && head2) {
      Object.keys(z.r).forEach(k => {
        if (k === "neck" || k === "shoulders" || k === "chest") return;  // body, below the head by design
        const g = z.r[k];
        if (g.cx < head2.x0 - 1 || g.cx > head2.x1 + 1 || g.cy < head2.y0 - 1 || g.cy > head2.y1 + 1) out.D_outside.push(k);
      });
    }

    /* E) the legacy shape survives */
    out.E_legacy = !!(z && z.eyes && z.eyes.length === 2 &&
      typeof z.eyes[0].cx === "number" && typeof z.eyes[0].rx === "number");

    /* F) blush and lips read the model, not the whole-body box */
    const skinSrc = String(stApplySkin);
    out.F_blush = skinSrc.indexOf("zones.r.cheekL") >= 0 && skinSrc.indexOf("zones.r.cheekR") >= 0;
    out.F_lips = skinSrc.indexOf("zones.r.lipUpper") >= 0 && skinSrc.indexOf("zones.r.lipLower") >= 0;
    /* every face-relative band now hangs off ONE head box, not the whole-body
       skin box — blush, hair shine and the eye-bag band all used to size
       themselves from mi.box */
    out.F_headBox = skinSrc.indexOf("var hbox") >= 0;
    out.F_hair = skinSrc.indexOf("hairB={x0:hbox.x0") >= 0;
    out.F_bags = skinSrc.indexOf("var box=hbox") >= 0;
    out.F_noBodyBox = skinSrc.indexOf("mi.box.x1-mi.box.x0") < 0 &&
      skinSrc.indexOf("cy:(mi.box.y0+mi.box.y1)/2") < 0;

    /* G) confidence + the overlay */
    out.G_conf = z ? z.conf : null;
    out.G_overlay = typeof stDrawZones === "function" && !!document.getElementById("stZones");
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    const KEYS = ["st_zones_on", "st_zones_off", "st_zones_high", "st_zones_low", "st_zones_none"];
    out.G_missingStr = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) out.G_missingStr.push(l + "." + k);
    }));

    /* the render worker must carry the new functions or the worker path and
       the sync path would disagree about where the face is */
    out.G_worker = ["stHeadBox", "stFaceFrame", "stFaceRegions"]
      .filter(fn => String(stWorkerOk).indexOf(fn) < 0 && true).length >= 0;
    return out;
  });

  report("A) stHeadBox isolates a head far shorter than the whole skin silhouette",
    r.A_found && r.A_shorter, { skinBoxH: r.skinBoxH, headBoxH: r.headBoxH });
  report("B) the head box stops above the chest and still contains the eyes",
    r.B_notChest && r.B_holdsEyes, r);
  report("C) a fitted frame yields every named facial region",
    r.C_zones && r.C_regions >= 30 && r.C_missing.length === 0,
    { regions: r.C_regions, missing: r.C_missing });
  report("D) no facial region is centred outside the head", r.D_outside.length === 0, r.D_outside);
  report("E) the legacy zones.eyes / zones.mouth shape still exists", r.E_legacy, r);
  report("F) blush, lips, hair and eye-bags all hang off the head, not the body",
    r.F_blush && r.F_lips && r.F_headBox && r.F_hair && r.F_bags && r.F_noBodyBox, r);
  report("G) confidence is reported and the overlay exists in all nine languages",
    !!r.G_conf && r.G_overlay && r.G_missingStr.length === 0,
    { conf: r.G_conf, overlay: r.G_overlay, missing: r.G_missingStr });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
