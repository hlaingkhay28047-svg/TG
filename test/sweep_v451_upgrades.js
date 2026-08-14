/* v4.51.0 regression sweep — Edit Wave 4b: real delivery pixels and real
   album sizes.

   Two promises the app could not previously keep:
     - "Full size" export was silently the 1536px PREVIEW buffer, not the
       photo the studio actually picked. A studio selling prints was handed
       an upscaled-looking file and no sign of why.
     - The batch cap of 30 predates sequential baking; the old ptBakeAll
       allocated one full-resolution canvas PER PHOTO at the same time,
       which is what kills iOS Safari on a real album.

   Pinned contracts:
   A) The original picked file is retained for the session and decoded into
      ST.fullBitmap (device-capped), keyed so it can only attach to its own
      photo.
   B) stBake() with "Full size" produces the ORIGINAL dimensions, not the
      preview ceiling; an explicit px cap still caps.
   C) Without a retained original the export falls back to the preview
      source, and the note says so — no silent claim of full resolution.
   D) The export note prints the real outgoing pixel dimensions.
   E) PT_MAX follows the device (60 phone / 100 desktop) and the cap toast
      states the real number instead of a hardcoded 30.
   F) ptBakeAll bakes sequentially and still emits exactly one ZIP.
   G) Studio's busy line carries the elapsed-seconds ticker.
   H) Every language quotes the cap through the {N} placeholder. Raising the
      cap while a translated string still reads "30" would hand a Hindi or
      Bengali studio the wrong limit — the same class of lie as (C).

   Usage: PORT=8931 node test/sweep_v451_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];

  /* ---- phone viewport: full-res delivery + cap + sequential bake ---- */
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  const r = await page.evaluate(async (B64) => {
    const out = {};
    switchPage("pgStudio");
    await new Promise(r2 => setTimeout(r2, 300));
    const big = document.createElement("canvas"); big.width = 3000; big.height = 2000;
    const x = big.getContext("2d");
    x.fillStyle = "#c9a227"; x.fillRect(0, 0, 3000, 2000);
    x.fillStyle = "#203040"; x.fillRect(900, 600, 1200, 800);
    const rawDu = big.toDataURL("image/jpeg", 0.92);
    const prev = await new Promise(res => downscale(rawDu, res));
    const m = prev.match(/^data:([^;]+);base64,(.+)$/);
    /* v4.53.1: the retained original is keyed on a real content fingerprint
       (length + tail), not the encoder-fixed JPEG header */
    state.stFull = { key: stFullKey(m[2]), du: rawDu };
    await new Promise(res => ST.loadImage(prev, { done: res }));
    await new Promise(r2 => setTimeout(r2, 1200));
    const dimOf = du => new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.src = du; });

    out.A_preview = Math.max(ST.srcBitmap.naturalWidth, ST.srcBitmap.naturalHeight);
    out.A_attached = !!ST.fullBitmap;
    out.A_fullEdge = ST.fullBitmap ? Math.max(ST.fullBitmap.width || ST.fullBitmap.naturalWidth, ST.fullBitmap.height || ST.fullBitmap.naturalHeight) : 0;

    svSet("st_exp_size", 0);
    const d1 = await dimOf(stBake());
    out.B_full = d1.w === 3000 && d1.h === 2000;
    svSet("st_exp_size", 2048);
    const d2 = await dimOf(stBake());
    out.B_capped = Math.max(d2.w, d2.h) === 2048;

    svSet("st_exp_size", 0);
    stRenderExportNote();
    out.D_note = document.getElementById("stExpNote").textContent;
    out.D_dims = /3000 × 2000 px/.test(out.D_note);

    /* C) no retained original -> preview source, and the note admits it */
    state.stFull = null;
    await new Promise(res => ST.loadImage(prev, { done: res }));
    await new Promise(r2 => setTimeout(r2, 500));
    const d3 = await dimOf(stBake());
    out.C_fallback = d3.w === out.A_preview;
    stRenderExportNote();
    out.C_noteAdmits = document.getElementById("stExpNote").textContent !== out.D_note;

    /* E/F) batch cap + sequential bake */
    out.E_cap = PT_MAX;
    out.E_msg = t("pt_cap").replace("{N}", String(PT_MAX));
    out.E_msgHasCap = out.E_msg.indexOf(String(PT_MAX)) >= 0 && out.E_msg.indexOf("{N}") < 0;
    /* H) EVERY language must carry the placeholder, not a baked-in number.
       Raising the cap while a translated string still reads "30" would tell a
       Hindi or Bengali studio the wrong limit — the exact defect this release
       claims to have removed. The three strings that quote the cap are
       pt_cap (the toast), pt_intro (the page lede) and pt_empty (the picker). */
    out.H_bad = [];
    ["pt_cap", "pt_intro", "pt_empty"].forEach(function (k) {
      Object.keys(TR_L).forEach(function (lang) {
        var v = TR_L[lang] && TR_L[lang][k];
        if (typeof v === "string" && v.indexOf("{N}") < 0) out.H_bad.push(lang + "." + k);
      });
      Object.keys(TR[k] || {}).forEach(function (lang) {
        var v = TR[k][lang];
        if (typeof v === "string" && v.indexOf("{N}") < 0) out.H_bad.push(lang + "." + k);
      });
    });
    PT.photos = [1, 2, 3, 4].map((n, i) => ({ id: "b" + i, name: "p" + n + ".jpg", srcDataUrl: "data:image/png;base64," + B64, status: "queued" }));
    let zips = 0, zipBytes = 0;
    const realSave = window.ptSaveBlob;
    window.ptSaveBlob = function (u8) { zips++; zipBytes = u8.length; };
    ptBakeAll();
    await new Promise(r2 => setTimeout(r2, 2500));
    window.ptSaveBlob = realSave;
    PT.photos = [];
    out.F_zips = zips; out.F_bytes = zipBytes;

    /* G) Studio ticker */
    stSetBusy(true, "Working");
    await new Promise(r2 => setTimeout(r2, 1200));
    out.G_tick = /\d+s$/.test(document.getElementById("stSpin").textContent);
    stSetBusy(false);

    /* I) The retained original must only ever attach to ITS OWN photo.
       v4.51 keyed it on the first 64 base64 chars, which for a canvas JPEG is
       the encoder's header + quantization table — identical for every photo the
       app downscales. A stale original therefore matched everything, and the
       export delivered the WRONG CLIENT'S PHOTO at full resolution. */
    function mkJpeg(w, h, fill){
      var cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      var cx=cv.getContext("2d"); cx.fillStyle=fill; cx.fillRect(0,0,w,h);
      cx.fillStyle="#000"; cx.fillRect(w*0.2,h*0.2,w*0.3,h*0.3);
      return cv.toDataURL("image/jpeg",0.9);
    }
    var duA=mkJpeg(1200,900,"#c9a227"), duB=mkJpeg(1200,900,"#2277cc");
    var bA=duA.split(",")[1], bB=duB.split(",")[1];
    out.I_headCollides = bA.slice(0,64)===bB.slice(0,64);   /* the old key: same for both */
    out.I_keyDiffers   = stFullKey(bA)!==stFullKey(bB);      /* the new key: distinct */

    /* end to end: photo A is retained, photo B is loaded, nothing attaches */
    state.stFull={ key:stFullKey(bA), du:duA };
    await new Promise(function(res){ ST.loadImage(duB,{done:res}); });
    await new Promise(function(r2){ setTimeout(r2,500); });
    out.I_noCrossAttach = !ST.fullBitmap;

    /* J) the full-size geometry cache dies wherever the preview's does, so an
       Undo can't leave the export baking the previous crop */
    var src=[stUndoReset, stApplySnap].map(String).join("\n")+String($("stReset").onclick||"");
    out.J_invalidated = (src.match(/geoCacheFull/g)||[]).length >= 3;

    state.stFull=null;
    return out;
  }, B64);

  report("A) the original is retained and decoded (3000px) beside the 1536px preview",
    r.A_preview === 1536 && r.A_attached && r.A_fullEdge === 3000, r);
  report("B) Full size exports the original pixels; an explicit cap still caps",
    r.B_full && r.B_capped, r);
  report("C) without the original it falls back to the preview and says so",
    r.C_fallback && r.C_noteAdmits, r);
  report("D) the export note prints the real outgoing dimensions", r.D_dims, r.D_note);
  report("E) batch cap follows the device and the toast states it", r.E_cap === 60 && r.E_msgHasCap, r);
  report("F) ptBakeAll bakes sequentially into exactly one ZIP", r.F_zips === 1 && r.F_bytes > 0, r);
  report("G) Studio's busy line ticks elapsed seconds", r.G_tick, r);
  report("H) every language states the cap by placeholder, never a baked-in number",
    r.H_bad.length === 0, r.H_bad);
  report("I) the retained original attaches only to its own photo (content key, not the JPEG header)",
    r.I_headCollides && r.I_keyDiffers && r.I_noCrossAttach, r);
  report("J) the full-size geometry cache is invalidated wherever the preview's is",
    r.J_invalidated, r);
  await page.close();

  /* ---- desktop viewport: the cap is 100 there ---- */
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  page2.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page2.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(700);
  const cap2 = await page2.evaluate(() => PT_MAX);
  report("E2) desktop raises the same cap to 100", cap2 === 100, { cap2 });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
