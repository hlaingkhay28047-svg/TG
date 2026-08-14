/* v4.66.0 regression sweep — 30 makeup looks land in the thinnest shelf.

   The owner delivered "HNK Makeup Creation 30": thirty finished 1024x1536
   portraits, one facial identity across all of them, each with its own concept,
   pose, outfit, makeup, hair and setting recorded in a CSV.

   WHERE THEY WENT, AND WHY THERE. Counting the catalogue by group before this
   wave: Snoot Lighting 126, Editorial Beauty 36, Cinematic Portrait 35 — and
   "Makeup Look" ONE. A shelf with a single plate on it is not a shelf. These
   thirty go exactly there, taking the group from 1 to 31.

   THE SIZING RULE THIS LIBRARY ACTUALLY USES. Every plate is normalised to a
   fixed HEIGHT and lets its width follow the source aspect — lib/full is 640
   tall, lib/ui is 180 tall — which is why the folder already holds four
   different widths (512, 427, 360, 480) and exactly one height. These looks are
   2:3, so they land at 427x640 and 120x180, matching the 30 plates already at
   that aspect. Nothing about the grid changes. A naive "resize to 512x640"
   would have squashed all thirty.

   Pinned contracts:
   A) All 30 ids exist in BOTH lib/ui and lib/full — a plate present in one and
      missing from the other is a broken tile the catalogue still advertises.
   B) Every new plate is 120x180 (ui) and 427x640 (full): the height rule held
      and the 2:3 aspect survived.
   C) Disk and catalogue agree in BOTH directions across the whole library, not
      just the new rows. An orphan either way is a bug that outlives this wave.
   D) The Makeup Look group is no longer a shelf of one.
   E) Every new record is complete — id, title, bilingual label, family,
      category, group, search blob — and its search blob actually carries the
      makeup words a user would type, not just the title.
   F) The library still renders with no page errors after 30 new rows.

   Usage: PORT=8931 node test/sweep_v466_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const NEW = [];
for (let n = 608; n <= 637; n++) NEW.push("user-ref-" + n);

/* dependency-free JPEG dimension read, same helper shape as the v4.64 sweep */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb].indexOf(m) >= 0) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return null;
}

const missUi = [], missFull = [], badDim = [];
let addedBytes = 0;
NEW.forEach(id => {
  const u = path.join(APP, "lib", "ui", id + ".jpg");
  const f = path.join(APP, "lib", "full", id + ".jpg");
  if (!fs.existsSync(u)) { missUi.push(id); return; }
  if (!fs.existsSync(f)) { missFull.push(id); return; }
  addedBytes += fs.statSync(u).size + fs.statSync(f).size;
  const du = jpegSize(fs.readFileSync(u)), df = jpegSize(fs.readFileSync(f));
  if (!du || du.w !== 120 || du.h !== 180) badDim.push(id + " ui=" + (du ? du.w + "x" + du.h : "?"));
  if (!df || df.w !== 427 || df.h !== 640) badDim.push(id + " full=" + (df ? df.w + "x" + df.h : "?"));
});

report("A) all 30 new plates exist in both lib/ui and lib/full",
  missUi.length === 0 && missFull.length === 0,
  { missingUi: missUi.slice(0, 5), missingFull: missFull.slice(0, 5) });

report("B) every new plate is 120x180 (ui) and 427x640 (full) — height rule held, 2:3 survived",
  badDim.length === 0, badDim.slice(0, 6));

/* C) whole-library agreement, both directions */
const onDiskUi = new Set(fs.readdirSync(path.join(APP, "lib", "ui"))
  .filter(f => /\.jpg$/.test(f)).map(f => f.replace(/\.jpg$/, "")));
const onDiskFull = new Set(fs.readdirSync(path.join(APP, "lib", "full"))
  .filter(f => /\.jpg$/.test(f)).map(f => f.replace(/\.jpg$/, "")));
const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
const cat = JSON.parse(/<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
const ids = new Set(cat.items.map(i => i.id));
const catNotDisk = [...ids].filter(x => !onDiskUi.has(x));
const diskNotCat = [...onDiskUi].filter(x => !ids.has(x));
const uiVsFull = [...onDiskUi].filter(x => !onDiskFull.has(x))
  .concat([...onDiskFull].filter(x => !onDiskUi.has(x)));

report("C) disk and catalogue agree in both directions across the whole library",
  catNotDisk.length === 0 && diskNotCat.length === 0 && uiVsFull.length === 0,
  { catalogue: ids.size, ui: onDiskUi.size, full: onDiskFull.size,
    catNotDisk: catNotDisk.slice(0, 4), diskNotCat: diskNotCat.slice(0, 4), uiVsFull: uiVsFull.slice(0, 4) });

/* D) the shelf this pack was for */
const byGroup = {};
cat.items.forEach(i => { byGroup[i.g] = (byGroup[i.g] || 0) + 1; });
report("D) Makeup Look is no longer a shelf of one",
  byGroup["Makeup Look"] >= 31,
  { makeupLook: byGroup["Makeup Look"], wasBefore: 1 });

/* E) record completeness + a search blob that carries more than the title */
const rows = cat.items.filter(i => ids.has(i.id) && NEW.indexOf(i.id) >= 0);
const incomplete = rows.filter(i =>
  !i.t || !i.tm || !i.f || !i.c || !i.g || !i.q ||
  i.tm.indexOf(i.t) < 0 ||                       /* label must contain the title */
  i.q.indexOf(i.t.toLowerCase()) < 0);           /* blob must contain the title */
/* the blob has to be richer than the title, or search only ever finds exact names */
const thinBlob = rows.filter(i => i.q.length < i.t.length + 80);

report("E) all 30 records are complete, and each search blob carries more than its title",
  rows.length === 30 && incomplete.length === 0 && thinBlob.length === 0,
  { rows: rows.length, incomplete: incomplete.map(i => i.id).slice(0, 4),
    thin: thinBlob.map(i => i.id).slice(0, 4) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const live = await page.evaluate(async (newIds) => {
    document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
    const pg = document.getElementById("pgLib");
    if (!pg) return { err: "no pgLib" };
    pg.classList.add("on");
    await new Promise(r => setTimeout(r, 1300));
    /* the tiles the catalogue promises must actually decode, not 404 */
    const probe = await Promise.all(newIds.slice(0, 8).map(id => new Promise(res => {
      const im = new Image();
      im.onload = () => res({ id: id, ok: true, w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ id: id, ok: false });
      im.src = "lib/ui/" + id + ".jpg";
    })));
    return { probe: probe, tiles: pg.querySelectorAll(".lib-grid img").length };
  }, NEW);

  report("F) the promised tiles actually decode at the size the library expects",
    live.probe && live.probe.every(x => x.ok && x.w === 120 && x.h === 180),
    live.probe);

  report("F2) the library page still renders tiles with no page errors",
    live.tiles > 0 && errs.length === 0, { tiles: live.tiles, errs: errs });

  console.log("      (30 looks added " + (addedBytes / 1e6).toFixed(2) +
    " MB across ui+full; library now " + ids.size + " plates, Makeup Look " +
    byGroup["Makeup Look"] + ")");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
