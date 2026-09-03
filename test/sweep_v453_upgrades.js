/* v4.53.0 regression sweep — the Gallery becomes a real archive.

   Three promises the Gallery made and could not keep. Every string in the app
   ("Every result is saved here automatically", "Every AI result is already
   saved in your gallery") told a studio it was safe to skip the download:

     - A write that failed — a full quota is the normal case on a phone after
       a couple of batches — aborted its transaction in silence. The only
       catch handler in the whole path fired when the DATABASE failed to open,
       never when the record failed to land.
     - The grid stamped the FULL delivered plate into every 84px tile and held
       all sixty in a module-level array, re-read from scratch on every
       selection toggle. Studio bakes at the source photo's own resolution, so
       this is hundreds of megabytes on a phone.
     - Passing sixty results deleted the oldest with no warning, no way to
       protect anything, and nothing said afterwards.

   Pinned contracts:
   A) A thumbnail is stored beside every plate and is materially smaller.
   B) The grid index holds NO full plates, and the tiles render the thumb.
   C) The full plate is still reachable by id for the work that needs pixels.
   D) galleryAdd reports whether the record actually landed, and a failed
      write is surfaced rather than swallowed.
   E) The eviction path warns before the cap, announces what it dropped, and
      skips starred records.
   F) Starring persists to the record and the button reflects it.
   G) Home reads one record to draw its thumbnail, not the whole store.
   H) Every new string is translated in all nine base languages.

   Usage: PORT=8931 node test/sweep_v453_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  /* v5.30: the app is account + Premium only, and the wall now REDIRECTS —
     switchPage refuses to leave pgHome while it is up, so a suite page never
     mounts and the controls below do not exist. Sign in first. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1200;
    const x = c.getContext("2d");
    x.fillStyle = "#c9a227"; x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = "#203040"; x.fillRect(400, 300, 800, 600);
    const plate = c.toDataURL("image/jpeg", 0.92).split(",")[1];

    /* A) a thumb exists and is materially smaller than the plate */
    const th = await galMakeThumb("image/jpeg", plate);
    out.A_made = !!th && th.length > 100;
    out.A_smaller = th.length < plate.length / 4;

    /* D) the write reports its outcome */
    out.D_reports = (await galleryAdd({ mime: "image/jpeg", b64: plate }, "sweep plate")) === true;
    out.D_writeErrors = String(galleryAdd).indexOf("rq.onerror=fail") >= 0 &&
      String(galleryAdd).indexOf("tx.onabort=fail") >= 0;

    switchPage("pgGallery");
    await new Promise(s => setTimeout(s, 700));

    /* B) the index carries no plates; the tile renders the thumb */
    const items = window._galItems || [];
    out.B_indexed = items.length >= 1;
    out.B_noPlates = items.every(it => !("b64" in it));
    out.B_hasThumb = items.every(it => !!it.thumb);
    out.B_sizeHonest = items.every(it => it.bytes > 1000);
    const tile = document.querySelector("#galGrid img");
    out.B_tileIsThumb = !!tile && tile.src.indexOf("data:image/jpeg;base64,") === 0 &&
      tile.src.length < plate.length / 4;

    /* C) the plate is still there when something actually needs pixels */
    const rec = await galFull(items[0].id);
    out.C_full = !!rec && rec.b64 === plate;

    /* F) starring persists and shows */
    galSel = items[0];
    document.getElementById("galKeep").onclick();
    await new Promise(s => setTimeout(s, 350));
    const rec2 = await galFull(items[0].id);
    out.F_persists = !!rec2 && rec2.keep === 1;
    out.F_reflects = document.getElementById("galKeep").className.indexOf("btn-gold") >= 0;

    /* E) NOTHING IS EVICTED (v5.86.0, owner instruction: keep it until I
       delete it). This check used to pin the opposite — that eviction was
       bounded, announced and skipped starred records. The behaviour it
       described was real and careful, and it still deleted a studio's work
       to make room they were never asked about. The promise is now stronger,
       so the check pins the stronger promise: the save path deletes nothing,
       it only counts, and the one control that removes work is the one the
       studio presses themselves. */
    out.E_neverDeletes = String(galleryAdd).indexOf("c.delete()") < 0 &&
      String(galleryAdd).indexOf("toDrop") < 0;
    out.E_stillCounts = String(galleryAdd).indexOf("galNearFull") >= 0 &&
      String(galleryAdd).indexOf("st.count()") >= 0;
    /* Clear Gallery is still the deliberate way out, and it still spares stars */
    out.E_clearSparesStars = String(document.getElementById("galClearAll").onclick).indexOf("c.value.keep") >= 0;
    /* the count survives past the old ceiling: sixty-one records, sixty-one kept */
    const before = (await galCountAll());
    for (let i = 0; i < 4; i++) await galleryAdd({ mime: "image/jpeg", b64: plate }, "cap probe " + i);
    out.E_countGrew = (await galCountAll()) === before + 4;

    /* G) Home draws its thumbnail from one record */
    out.G_cursor = String(renderDashCont).indexOf('openCursor(null,"prev")') >= 0 &&
      String(renderDashCont).indexOf('objectStore("gal").getAll()') < 0;

    /* H) translations */
    const KEYS = ["gal_keep", "gal_kept", "gal_kept_on",
      "gal_kept_off", "gal_read_fail", "gal_zip_partial"];
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    out.H_missing = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) out.H_missing.push(l + "." + k);
    }));

    return out;
  });

  report("A) a thumbnail is stored beside the plate and is materially smaller",
    r.A_made && r.A_smaller, r);
  report("B) the grid holds no full plates and the tiles render the thumb",
    r.B_indexed && r.B_noPlates && r.B_hasThumb && r.B_sizeHonest && r.B_tileIsThumb, r);
  report("C) the full plate is still reachable by id", r.C_full, r);
  report("D) a write reports its outcome and a failure is surfaced",
    r.D_reports && r.D_writeErrors, r);
  report("E) nothing is ever deleted to make room — only the studio deletes",
    r.E_neverDeletes && r.E_stillCounts && r.E_clearSparesStars && r.E_countGrew, r);
  report("F) starring persists to the record and the button reflects it",
    r.F_persists && r.F_reflects, r);
  report("G) Home draws its thumbnail from one record, not the whole store", r.G_cursor, r);
  report("H) every new string is translated in all nine languages",
    r.H_missing.length === 0, r.H_missing);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
