/* v4.44 Edit-pages Wave 1 sweep — pins the 8 correctness fixes:
   1. spot heal reaches the RENDERED canvas and the export bake (the v4.42
      version healed only the mask snapshot), ops replay through undo/redo
   2. V2 runs surface the Manual-slider carryover (toggle chip + honest
      prompt preview; excluded sliders never reach the run)
   3. Stop buttons exist on Create (#btnGenStop) and Studio (#btnStStop),
      wired to the per-dispatch AbortController
   4. Path batch survival: beforeunload guard + wake-lock plumbing +
      sticky run card while busy
   5. re-generating with a starred prompt keeps the star
   6. HEIC intake: accept attr covers heic/heif, undecodable images fail
      with an immediate localized reason (downscale -> null)
   7. dlName(): extensions come from the real mime — a JPEG can never
      download as .png (Retouch + T2I)
   8. destructive-action Undo parity (Path clear/remove, Retouch clear-all)
      and btnPtGalOne no longer double-adds to the Gallery */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const BASE = "http://localhost:8931/index.html";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS — " : "FAIL — ") + name + (ok ? "" : "  " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  /* v5.30: the app is account + Premium only, and the wall now REDIRECTS —
     switchPage refuses to leave pgHome while it is up, so a suite page never
     mounts and the controls below do not exist. Sign in first. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  page.on("pageerror", e => report("no page error", false, e.message));
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  /* ---- 1) heal reaches the rendered canvas + the export ---- */
  const heal = await page.evaluate(async () => {
    switchPage("pgStudio");
    const W = 220, H = 220, cxp = 110, cyp = 110, SR = 6;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const d = x.createImageData(W, H);
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return (s % 41) - 20; };
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 205 + rnd(); d.data[i + 1] = 155 + rnd(); d.data[i + 2] = 125 + rnd(); d.data[i + 3] = 255;
    }
    for (let yy = cyp - SR; yy <= cyp + SR; yy++) for (let xx = cxp - SR; xx <= cxp + SR; xx++) {
      if ((xx - cxp) ** 2 + (yy - cyp) ** 2 <= SR * SR) { const p = (yy * W + xx) * 4; d.data[p] = 60; d.data[p + 1] = 40; d.data[p + 2] = 30; }
    }
    x.putImageData(d, 0, 0);
    await new Promise(res => ST.loadImage(c.toDataURL("image/png"), { done: res }));
    await new Promise(r => setTimeout(r, 500));
    const canvasSpot = () => {
      const cnv = document.getElementById("stCanvas");
      const cd = cnv.getContext("2d").getImageData(0, 0, cnv.width, cnv.height).data;
      let m = 0, n = 0;
      for (let yy = cyp - 4; yy <= cyp + 4; yy++) for (let xx = cxp - 4; xx <= cxp + 4; xx++) {
        const p = (yy * cnv.width + xx) * 4; m += (cd[p] + cd[p + 1] + cd[p + 2]) / 3; n++;
      }
      return +(m / n).toFixed(1);
    };
    const out = { before: canvasSpot() };
    svSet("st_healR", 5);
    stHealAt(cxp, cyp);
    await new Promise(r => setTimeout(r, 300));
    out.healed = canvasSpot();
    out.ops = ST.heals.length;
    const bakeUrl = stBake();
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = bakeUrl; });
    const bc = document.createElement("canvas"); bc.width = img.width; bc.height = img.height;
    bc.getContext("2d").drawImage(img, 0, 0);
    const bd = bc.getContext("2d").getImageData(0, 0, bc.width, bc.height).data;
    const sx2 = img.width / W;
    let bm = 0, bn = 0;
    for (let yy = Math.round((cyp - 3) * sx2); yy <= Math.round((cyp + 3) * sx2); yy++)
      for (let xx = Math.round((cxp - 3) * sx2); xx <= Math.round((cxp + 3) * sx2); xx++) {
        const p = (yy * img.width + xx) * 4; bm += (bd[p] + bd[p + 1] + bd[p + 2]) / 3; bn++;
      }
    out.baked = +(bm / bn).toFixed(1);
    stHealUndoLast();
    await new Promise(r => setTimeout(r, 300));
    out.restored = canvasSpot(); out.opsAfter = ST.heals.length;
    return out;
  });
  report("1) heal lands on canvas + bake, undo restores", heal.before < 90 && heal.healed > heal.before + 40 && heal.baked > 110 && heal.ops === 1 && heal.restored < 90 && heal.opsAfter === 0, heal);

  /* ---- 3) Stop buttons exist and are wired ---- */
  const stops = await page.evaluate(() => {
    return {
      create: !!document.getElementById("btnGenStop"),
      studio: !!document.getElementById("btnStStop"),
      createWired: typeof document.getElementById("btnGenStop").onclick === "function",
      studioWired: typeof document.getElementById("btnStStop").onclick === "function"
    };
  });
  report("3) Stop buttons on Create + Studio, wired", stops.create && stops.studio && stops.createWired && stops.studioWired, stops);

  /* ---- 5) star survives re-generate ---- */
  const star = await page.evaluate(() => {
    localStorage.setItem("hnk_ws_prompts", JSON.stringify([{ p: "my treasured starred prompt", star: true }]));
    pushPromptHistory("my treasured starred prompt");
    const list = JSON.parse(localStorage.getItem("hnk_ws_prompts"));
    localStorage.removeItem("hnk_ws_prompts");
    return { star: list[0] && list[0].star === true, first: list[0] && list[0].p };
  });
  report("5) re-generating keeps the star", star.star && star.first === "my treasured starred prompt", star);

  /* ---- 6) HEIC accept attr + downscale(null) contract ---- */
  const heic = await page.evaluate(async () => {
    const accept = document.getElementById("filePick").getAttribute("accept") || "";
    const nullResult = await new Promise(res => downscale("data:image/heic;base64,AAAA", res));
    /* v6.23.1: the attribute is image/* — it covers image/heic and image/heif, and the explicit MIME list it replaced
       is one of the things OEM pickers refuse (verify_native_pick pins image/* and the .heic/.heif name sniff) */
    const heicOk = accept === "image/*" || (/heic/.test(accept) && /heif/.test(accept));
    return { accept: heicOk, nullOnBad: nullResult === null, msg: typeof unreadableImgMsg === "function" && unreadableImgMsg().length > 10 };
  });
  report("6) HEIC accept + undecodable -> null + localized reason", heic.accept && heic.nullOnBad && heic.msg, heic);

  /* ---- 7) mime-correct download names ---- */
  const names = await page.evaluate(() => {
    return {
      jpg: /\.jpg$/.test(dlName("retouch", "image/jpeg", 3)),
      png: /\.png$/.test(dlName("t2i", "image/png")),
      base: dlName("retouch", "image/jpeg", 1, "Bride 042.HEIC").indexOf("Bride 042-retouch-1.jpg") >= 0
    };
  });
  report("7) dlName(): real-mime extensions + source-name stems", names.jpg && names.png && names.base, names);

  /* ---- 4+8) Path guards + destructive Undo parity ---- */
  const path8 = await page.evaluate(async () => {
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 250));
    const out = {};
    PT.photos = [{ name: "a.jpg" }, { name: "b.jpg" }];
    document.getElementById("btnPtClear").onclick();
    out.cleared = PT.photos.length === 0;
    const act = document.querySelector(".toast .toast-act");
    out.undoOffered = !!act;
    if (act) act.click();
    await new Promise(r => setTimeout(r, 150));
    out.restored = PT.photos.length === 2;
    PT.photos = [];
    /* GalOne: no galleryAdd call anymore — just an honest toast */
    out.stickyClass = !!document.getElementById("ptRunCard");
    ptSetBusy(true); out.busySticky = document.getElementById("ptRunCard").classList.contains("pt-sticky");
    ptSetBusy(false); out.idleSticky = document.getElementById("ptRunCard").classList.contains("pt-sticky");
    /* Retouch clear-all undo */
    switchPage("pgRetouch");
    await new Promise(r => setTimeout(r, 250));
    state.rt[D.retouch.sliders[0].key] = 60;
    document.getElementById("rsClearAll").onclick();
    out.rtCleared = state.rt[D.retouch.sliders[0].key] === 0;
    const act2 = document.querySelector(".toast .toast-act");
    if (act2) act2.click();
    await new Promise(r => setTimeout(r, 150));
    out.rtRestored = state.rt[D.retouch.sliders[0].key] === 60;
    state.rt[D.retouch.sliders[0].key] = 0;
    return out;
  });
  report("4+8) Path clear Undo, sticky run card, Retouch clear-all Undo",
    path8.cleared && path8.undoOffered && path8.restored && path8.busySticky && !path8.idleSticky && path8.rtCleared && path8.rtRestored, path8);

  /* ---- 4b) beforeunload guard present in source ---- */
  const fs = require("fs"), pathmod = require("path");
  const src = fs.readFileSync(pathmod.resolve(__dirname, "..", "docs", "app", "index.html"), "utf8");
  /* v5.25 — beforeunload used to guard on PT.busy alone; a fresh audit found
     that left every OTHER in-flight paid/generate path (Smart Workflow
     wizard, Studio bake, Video/T2I generate) with zero refresh warning,
     silently losing photos + an already-spent paid API call. The guard now
     ORs in wiz.busy (via window._wizBusy — wiz itself is scoped out of
     reach at this point in the file), ST.busy and every *Abort in-flight
     flag; PT.busy is still one of the conditions, just no longer alone. */
  report("4b) wake-lock + beforeunload plumbing in source",
    src.indexOf("navigator.wakeLock.request") >= 0 && src.indexOf('addEventListener("beforeunload"') >= 0 && src.indexOf("PT.busy || window._wizBusy") >= 0, {});

  /* ---- 2) V2 manual-slider carryover honesty ---- */
  const v2 = await page.evaluate(async () => {
    const out = {};
    state.rt[D.retouch.sliders[0].key] = 50;
    renderV2Hero();
    const chip = document.querySelector("#v2RtCarry .chip");
    out.chip = !!chip;
    out.previewIncludes = document.getElementById("v2PromptPreview").textContent.indexOf("RETOUCH INSTRUCTIONS") >= 0;
    if (chip) chip.click();
    await new Promise(r => setTimeout(r, 150));
    out.previewExcludes = document.getElementById("v2PromptPreview").textContent.indexOf("RETOUCH INSTRUCTIONS") < 0;
    out.inclFlag = state.v2.inclRt === false;
    state.v2.inclRt = true; state.rt[D.retouch.sliders[0].key] = 0; renderV2Hero();
    return out;
  });
  report("2) V2 carryover chip + honest preview (include/exclude)", v2.chip && v2.previewIncludes && v2.previewExcludes && v2.inclFlag, v2);

  /* ================= v4.44.1 — Wave 2 daily-driver ergonomics ================= */

  /* ---- W2a) Path sheet: n/N label, prev/next, run-one, scrub box ---- */
  const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const w2path = await page.evaluate(async (B64) => {
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 250));
    PT.photos = [
      { name: "a.jpg", srcDataUrl: "data:image/png;base64," + B64, status: "queued" },
      { name: "b.jpg", srcDataUrl: "data:image/png;base64," + B64, status: "queued" }
    ];
    ptOpenSheet(0);
    const out = {
      label: document.getElementById("ptSheetName").textContent,
      runOne: document.getElementById("btnPtRunOne").style.display !== "none",
      prevDisabled: document.getElementById("btnPtPrev").disabled
    };
    document.getElementById("btnPtNext").onclick();
    out.stepped = PT.sheetIdx === 1;
    ptCloseSheet();
    PT.photos = []; ptSync();
    return out;
  }, B64);
  report("W2a) Path sheet: position label, prev/next, single-photo run", /1 \/ 2/.test(w2path.label) && w2path.runOne && w2path.prevDisabled && w2path.stepped, w2path);

  /* ---- W2b) Create: multi-take ZIP + full-screen zoom; Retouch zoom chip ---- */
  const w2res = await page.evaluate(async (B64) => {
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    state.hist = [{ mime: "image/png", b64: B64 }, { mime: "image/png", b64: B64 }];
    state.histSel = 0; state.result = state.hist[0];
    showResult();
    const out = {
      zip: document.getElementById("btnDlAll").style.display !== "none",
      zoomCursor: document.getElementById("resultImg").style.cursor === "zoom-in"
    };
    document.getElementById("resultImg").click();
    await new Promise(r => setTimeout(r, 200));
    out.lz = document.getElementById("lookZoom") && document.getElementById("lookZoom").className === "on";
    if (out.lz) document.getElementById("lookZoom").click();
    switchPage("pgRetouch");
    await new Promise(r => setTimeout(r, 250));
    state.refs[0] = { mime: "image/png", b64: B64, label: "x.png" };
    rsShowResult();
    out.rsZoom = !!document.getElementById("rsZoomBtn") && document.getElementById("rsZoomBtn").textContent.length > 0;
    state.hist = []; state.result = null; state.refs[0] = null;
    return out;
  }, B64);
  report("W2b) Create ZIP-all + zoom viewer; Retouch zoom chip", w2res.zip && w2res.zoomCursor && w2res.lz && w2res.rsZoom, w2res);

  /* ---- W2c) shared intake + desktop keyboard + WB eyedropper wiring ---- */
  const w2st = await page.evaluate(async () => {
    const out = { acceptFn: typeof acceptImageFile === "function" };
    switchPage("pgStudio");
    await new Promise(r => setTimeout(r, 250));
    out.wbBtn = !!document.getElementById("stWbPickBtn");
    // keyboard undo against the still-loaded Wave-1 fixture
    document.getElementById("mu_bri").value = "22";
    document.getElementById("mu_bri").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1100));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    out.kbUndo = state.st.t1.bri === 0;
    return out;
  });
  report("W2c) acceptImageFile shared intake, WB chip, Ctrl+Z undo", w2st.acceptFn && w2st.wbBtn && w2st.kbUndo, w2st);

  /* ---- W2d) source pins: paste/drop wiring + coarse-pointer chip rule ---- */
  report("W2d) paste/drag-drop handlers + 44px coarse-pointer chips in source",
    src.indexOf('document.addEventListener("paste"') >= 0 && src.indexOf('addEventListener("drop"') >= 0
    && src.indexOf("pointer: coarse") >= 0 && src.indexOf('$("ptCmp")') >= 0 && src.indexOf('box.setPointerCapture') >= 0, {});

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
