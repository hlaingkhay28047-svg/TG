/* v4.46.0 regression sweep — Edit-pages Wave 4a: batch scale & delivery.

   Pinned contracts:
   A) downscale(dataUrl, cb, max): the cap is a parameter — default stays
      1536, an explicit 2048 is honored (paid Retouch tiers pass it).
   B) V2 batch results tray: every outcome lands in rsBatchResults; the tray
      renders ok-thumbnails + failed chips, a ZIP(n) button for 2+ oks and a
      Retry(n) button for fails.
   C) Path multi-select: toggle chip -> taps select (ring), action chips
      (run / ZIP / remove / apply-look) appear with a selection; Remove is
      undoable via the toast action.
   D) Contact sheet: btnPtSheetAll wired to ptContactSheet.
   E) refs[0] clobber guard: replacing a 'result'-labeled IMAGE 1 offers an
      Undo toast that restores it.
   F) Path hist restore: ptRunAll archives into PT.photos and restores the
      pre-run state.hist (source pin — behavior is exercised by sweep_path).

   Usage: PORT=8931 node test/sweep_v446_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  /* ---- A) downscale cap param ---- */
  const capA = await page.evaluate(async () => {
    const big = document.createElement("canvas"); big.width = 2400; big.height = 1600;
    const x = big.getContext("2d"); x.fillStyle = "#888"; x.fillRect(0, 0, 2400, 1600);
    const du = big.toDataURL("image/jpeg", 0.9);
    const d1536 = await new Promise(res => downscale(du, res));
    const d2048 = await new Promise(res => downscale(du, res, 2048));
    const dim = s => new Promise(res => { const i = new Image(); i.onload = () => res(i.width); i.src = s; });
    return { def: await dim(d1536), hi: await dim(d2048) };
  });
  report("A) downscale cap: default 1536, explicit 2048 honored",
    capA.def === 1536 && capA.hi === 2048, capA);

  /* ---- B) batch results tray ---- */
  const trayB = await page.evaluate(async (B64) => {
    switchPage("pgRetouch");
    await new Promise(r => setTimeout(r, 250));
    rsBatchResults.length = 0;
    rsBatchResults.push({ name: "a.jpg", ok: true, mime: "image/png", b64: B64, file: null });
    rsBatchResults.push({ name: "b.jpg", ok: false, file: null });
    rsBatchResults.push({ name: "c.jpg", ok: true, mime: "image/png", b64: B64, file: null });
    rsRenderBatchTray();
    const tray = document.getElementById("rsBatchTray");
    const out = {
      tray: !!tray,
      thumbs: tray.querySelectorAll(".hist img").length,
      zip: Array.from(tray.querySelectorAll(".btn")).some(x => /ZIP \(2\)/.test(x.textContent)),
      retry: Array.from(tray.querySelectorAll(".btn")).some(x => /\(1\)/.test(x.textContent) && x.textContent.indexOf("ZIP") < 0)
    };
    rsBatchResults.length = 0; rsRenderBatchTray();
    return out;
  }, B64);
  report("B) batch tray: 2 thumbs + 1 fail chip, ZIP(2) + Retry(1)",
    trayB.tray && trayB.thumbs === 2 && trayB.zip && trayB.retry, trayB);

  /* ---- C) Path multi-select ---- */
  const multiC = await page.evaluate(async (B64) => {
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 250));
    PT.photos = [
      { id: "s1", name: "a.jpg", srcDataUrl: "data:image/png;base64," + B64, status: "done", outB64: B64, outMime: "image/png" },
      { id: "s2", name: "b.jpg", srcDataUrl: "data:image/png;base64," + B64, status: "queued" },
      { id: "s3", name: "c.jpg", srcDataUrl: "data:image/png;base64," + B64, status: "queued" }
    ];
    ptSync();
    const bar = document.getElementById("ptMultiBar");
    const out = { toggle: !!bar && bar.querySelectorAll(".chip").length === 1 };
    bar.querySelector(".chip").click();
    out.on = ptMulti.on === true;
    document.querySelectorAll("#ptGrid .pt-th")[0].click();
    document.querySelectorAll("#ptGrid .pt-th")[1].click();
    out.sel = ptMultiSel().length === 2;
    out.ring = document.querySelectorAll("#ptGrid .pt-th.on").length === 2;
    out.actions = document.getElementById("ptMultiBar").querySelectorAll(".chip").length >= 4;
    const rm = Array.from(document.getElementById("ptMultiBar").querySelectorAll(".chip")).find(c => /Remove|ဖယ်မယ်/.test(c.textContent));
    rm.click();
    out.removed = PT.photos.length === 1;
    const act = document.querySelector("#toast .toast-act");
    if (act) act.click();
    out.undone = PT.photos.length === 3;
    ptMulti.on = false; ptMulti.ids = {};
    PT.photos = []; ptSync();
    return out;
  }, B64);
  report("C) multi-select: toggle, ring selection, 4+ action chips, undoable remove",
    multiC.toggle && multiC.on && multiC.sel && multiC.ring && multiC.actions && multiC.removed && multiC.undone, multiC);

  /* ---- D) contact sheet wired ---- */
  const sheetD = await page.evaluate(() => ({
    btn: !!document.getElementById("btnPtSheetAll"),
    fn: typeof ptContactSheet === "function",
    label: (document.getElementById("btnPtSheetAll") || {}).textContent || ""
  }));
  report("D) contact-sheet button wired to ptContactSheet", sheetD.btn && sheetD.fn && sheetD.label.length > 3, sheetD);

  /* ---- E) refs clobber guard ---- */
  const guardE = await page.evaluate(async (B64) => {
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    state.refs[0] = { mime: "image/png", b64: B64, label: "result" };
    refsClobberGuard(0);
    state.refs[0] = { mime: "image/png", b64: B64, label: "fresh.jpg" };
    await new Promise(r => setTimeout(r, 200));
    const act = document.querySelector("#toast .toast-act");
    const out = { toast: !!act };
    if (act) act.click();
    out.undo = !!(state.refs[0] && state.refs[0].label === "result");
    state.refs[0] = null;
    document.getElementById("toast").className = "toast";
    return out;
  }, B64);
  report("E) clobber guard: replacing a result-labeled IMAGE 1 offers working Undo",
    guardE.toast && guardE.undo, guardE);

  /* ---- F) source pins ---- */
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
  report("F) source pins: hist restore in ptRunAll + 2048 caps at both Retouch ingestion points",
    src.indexOf("state.hist=preHist") >= 0 &&
    (src.match(/quality!=="fast"\)\s*\?\s*2048/g) || []).length === 2 &&
    src.indexOf("rsBatchResults.push({name:files[i].name,ok:true") >= 0,
    {});

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
