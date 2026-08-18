/* v5.10 — the live preview's face geometry comes from a real model.

   WHY THIS SWEEP EXISTS. Before this release the Studio located a face by
   heuristic: a fixed YCbCr box for "skin", the first width peak for the head,
   the darkest blobs for eyes and the reddest pixels for the mouth. Measured
   over 21 library photographs that found a usable face on 6, missed 5, and on
   8 produced a "head box" covering 99.8% of the frame — a beige shirt, a warm
   wall and an ivory gown all read as skin. With the head box spanning the
   picture, the mouth band is a stripe across it, so lip colour, blush and
   teeth whitening landed wherever the frame happened to be reddest. The owner
   photographed the result on his own cheek.

   These checks pin the properties that made that possible, so no future edit
   can quietly reintroduce it.
   Usage: PORT=8931 node test/sweep_v510_realface.js  (serve docs/app on $PORT) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
  const pageErrors = [];
  const missing = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    switchPage("pgStudio");
    window.scrollTo = function () {}; Element.prototype.scrollIntoView = function () {};
  });

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  async function load(rel) {
    return page.evaluate(async (r) => {
      const res = await fetch("lib/" + r);
      if (!res.ok) return { err: "http " + res.status };
      const bl = await res.blob();
      const du = await new Promise(x => { const f = new FileReader(); f.onload = () => x(f.result); f.readAsDataURL(bl); });
      await new Promise(x => { ST.loadImage(du, { done: x }); });
      /* the scan is async and deliberately off the critical path */
      for (let i = 0; i < 80; i++) {
        if (ST.faceLM && ST.faceLM.scanned) break;
        await new Promise(x => setTimeout(x, 100));
      }
      await new Promise(x => setTimeout(x, 250));
      const W = ST.buf.width, H = ST.buf.height;
      const mi = stSkinMask(ST.px0, W, H, ST.faceLM || null);
      let skin = 0; for (let i = 0; i < mi.mask.length; i++) if (mi.mask[i] > 128) skin++;
      const z = stFaceZones(ST.px0, W, H, mi, ST.faceLM || null);
      return {
        scanned: !!(ST.faceLM && ST.faceLM.scanned),
        faces: ST.faceLM ? ST.faceLM.faces.length : 0,
        real: !!(z && z.real), conf: z ? z.conf : null, zNull: !z,
        skinPct: 100 * skin / (W * H),
        pts: ST.faceLM && ST.faceLM.faces[0] ? ST.faceLM.faces[0].pts.length : 0,
        /* where the mouth sits inside the head box: anatomically ~0.6-0.9 */
        mouthRelY: (z && z.mouth && z.head) ? (z.mouth.cy - z.head.y0) / (z.head.y1 - z.head.y0) : null,
        /* the teeth zone must sit INSIDE the mouth zone, not on the nose */
        teethInMouth: !!(z && z.r && z.r.teeth && z.mouth &&
          Math.abs(z.r.teeth.cy - z.mouth.cy) < z.mouth.ry &&
          Math.abs(z.r.teeth.cx - z.mouth.cx) < z.mouth.rx),
        headPctH: (z && z.head) ? 100 * (z.head.y1 - z.head.y0) / H : null
      };
    }, rel);
  }

  // 1) a real portrait: the model loads, returns 68 points, and drives the zones
  const s = await load("st-sample.jpg");
  report("the detector loads and reads the studio sample as a real face",
    s.scanned && s.faces === 1 && s.real && s.conf === "high", JSON.stringify(s));
  report("the landmark net returns the full 68-point set", s.pts === 68, "pts=" + s.pts);

  // 2) the zones land on the anatomy, which is the whole point
  report("the mouth sits in the lower half of the head box, not on the nose",
    s.mouthRelY > 0.6 && s.mouthRelY < 0.95, "mouthRelY=" + (s.mouthRelY || 0).toFixed(2));
  report("the teeth zone sits inside the mouth zone", s.teethInMouth);
  report("the head box is a head, not the whole frame",
    s.headPctH > 5 && s.headPctH < 80, "headPctH=" + (s.headPctH || 0).toFixed(1) + "%");

  // 3) the skin mask is measured off the face instead of a fixed chroma box
  report("the skin mask no longer claims most of the frame",
    s.skinPct < 55, "skinPct=" + s.skinPct.toFixed(1) + "%");

  // 4) a photo with NO face must report no face — never fall through to the
  //    geometric reader, which is exactly what invents one on a gown
  const m = await load("full/user-ref-120.jpg");   // a gown on a faceless mannequin
  report("a faceless plate reports no face instead of hallucinating one",
    m.scanned && m.faces === 0 && m.zNull, JSON.stringify({ scanned: m.scanned, faces: m.faces, zNull: m.zNull }));

  // 5) the geometric reader still exists for when the model cannot load
  const fb = await page.evaluate(() => {
    const W = ST.buf.width, H = ST.buf.height;
    const mi = stSkinMask(ST.px0, W, H, null);
    const z = stFaceZones(ST.px0, W, H, mi, null);   // lm=null => "never looked"
    return { got: !!z, real: !!(z && z.real) };
  });
  report("with no landmarks the geometric fallback still answers", fb.got && !fb.real, JSON.stringify(fb));

  // 6) shipping hygiene
  report("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  report("nothing 404s (the wasm backend is removed, not probed)",
    missing.length === 0, JSON.stringify(missing.slice(0, 3)));

  await browser.close();
  console.log(allOk ? "\nALL PASS" : "\nFAILURES ABOVE");
  process.exit(allOk ? 0 : 1);
})();
