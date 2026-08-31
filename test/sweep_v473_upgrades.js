/* v4.73.0 regression sweep — the look shelf shows real photographs.

   WHAT SHIPPED. Before a customer picks a photo, every Retouch A/Retouch B look tile
   was the neutral sample run through the app's OWN approximation of that look.
   That approximation cannot render three of the nineteen Tier-1 controls at all
   — sharpen, background blur and dehaze — so the shelf undersold itself on the
   one screen that has to sell it: the first one.

   Sixteen commissioned photographs now stand in for that empty state, shot from
   the same base sample so the whole row is one woman in one frame. They are
   used ONLY while no customer photo is loaded. The moment one arrives the live
   computed tile takes over, because a customer's own face is worth more than
   any stock demonstration — and that switch is the contract most at risk of
   quietly breaking, so it is measured here rather than assumed.

   THE BASE SAMPLE WAS REPLACED UNDER ITS OWN NAME, which is exactly the
   stale-/lib/ class v4.68 and v4.69 exist to close: /lib/ is served cache-first
   and never revalidated, so a device still holding the old sample would build
   the entire shelf on the wrong face, for ever. It gets a purge entry. The
   sixteen previews sit at fresh paths and need none — a cache miss simply
   fetches them.

   Pinned contracts:
   A) All 16 previews exist at 256x384, and the set stays small enough that a
      studio owner on mobile data does not pay for the empty state.
   B) With no photo loaded, every tile paints its photograph.
   C) THE SWITCH WORKS. Once a photo is loaded the tiles show THAT face, not
      the stock art.
   D) A preview that fails to load falls back to the computed tile rather than
      leaving a hole — the art is an upgrade, never a dependency.
   E) The replaced base sample carries a purge entry, and the new /lib/looks/
      art deliberately does not.
   F) No page errors.

   v4.96 note: the shelf's page no longer exists. #pgStudio split into #pgMeitu
   and #pgEvoto, and the shared #stCols block plus the inactive suite card live
   in the hidden #stDock until stMountSuite() moves them — which is only reached
   through switchPage(). So the shelf is now reached by navigating to #pgMeitu
   rather than by dropping `.on` onto a page id that is gone. Every contract and
   every threshold above is unchanged; B still counts all sixteen photographs
   from that one visit, because stRenderPresetCards() paints #muPresetRow and
   #evPresetRow together wherever the two cards happen to be parked. See the
   comment at the visit.

   Usage: PORT=8931 node test/sweep_v473_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");

/* ---- A) the files, before a browser is involved ---- */
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
const LOOKS = path.join(APP, "lib", "looks");
const files = fs.existsSync(LOOKS) ? fs.readdirSync(LOOKS).filter(f => /^look-.+\.jpg$/.test(f)) : [];
let bytes = 0; const odd = [];
files.forEach(f => {
  const p = path.join(LOOKS, f);
  bytes += fs.statSync(p).size;
  const d = jpegSize(fs.readFileSync(p));
  if (!d || d.w !== 256 || d.h !== 384) odd.push(f + "=" + (d ? d.w + "x" + d.h : "unreadable"));
});
/* The tile is 228x288 device pixels at DPR 3 and never larger, so anything past
   256 wide is data a studio pays for and cannot see. 300KB is a generous cap on
   a set that measures ~181KB. */
report("A) 16 look previews, all 256x384, and the set stays under 300KB",
  files.length === 16 && odd.length === 0 && bytes < 300000,
  { count: files.length, kb: Math.round(bytes / 1000), odd: odd.slice(0, 4) });

const sample = jpegSize(fs.readFileSync(path.join(APP, "lib", "st-sample.jpg")));
const sampleKb = Math.round(fs.statSync(path.join(APP, "lib", "st-sample.jpg")).size / 1000);
report("A2) the base sample is the new one, and still small enough to ship to a phone",
  !!sample && sample.w >= 480 && sampleKb < 150,
  { size: sample, kb: sampleKb });

/* ---- E) the cache contract ---- */
/* Read the purge LIST, not the file. sw.js explains in prose why /lib/looks/
   needs no entry, and a whole-file search for that string matches the
   explanation — the same trap that once made three plugin assertions pass on
   their own comments. */
const swEntries = (function () {
  const i = sw.indexOf("var LIB_PURGES = [");
  if (i < 0) return "";
  return sw.slice(i, sw.indexOf("\n];", i)).replace(/\/\*[\s\S]*?\*\//g, " ");
})();
report("E) the replaced base sample has a purge entry; the new art needs none",
  /tag: "\.\/__lib-purge-v4-73-st-sample"/.test(swEntries) &&
  /re: \/\\\/lib\\\/st-sample\\\.jpg\$\//.test(swEntries) &&
  swEntries.indexOf("/lib/looks/") < 0 && swEntries.indexOf("looks") < 0,
  { entriesOnly: swEntries.replace(/\s+/g, " ").slice(0, 240) });

report("E2) the art is a fallback-safe upgrade, not a dependency",
  /im\.onerror=function\(\)\{ ST_LOOK_ART\[key\]="missing"; \}/.test(src) &&
  /var art = ST\.srcBitmap \? null : stLookArt\(p\.key\);/.test(src));

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async () => {
    /* v4.96 — this used to hand-reveal the shelf by putting `.on` straight on
       #pgStudio. That page is gone, and hand-revealing #pgMeitu instead shows
       an EMPTY page: #stCols and #stMuCard only leave the hidden #stDock inside
       stMountSuite(), which nothing but switchPage() calls. Navigate properly
       and the Retouch A shelf is mounted, on screen, and — because stArtWatch arms
       its IntersectionObserver on stActivePage(), #pgMeitu on fresh storage —
       the look art and the base sample are woken by this very visit. */
    switchPage("pgMeitu");
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 2200));
    let n = document.getElementById("muPresetRow");
    while (n && n !== document.body) { if (n.classList && n.classList.contains("grp")) n.classList.add("open"); n = n.parentElement; }
    await new Promise(r => setTimeout(r, 1200));

    function tilePixels(rowId, idx) {
      const h = document.getElementById(rowId);
      const cards = h ? h.querySelectorAll(".pcard canvas") : [];
      const cv = cards[idx]; if (!cv) return null;
      const t = document.createElement("canvas"); t.width = 64; t.height = 80;
      t.getContext("2d").drawImage(cv, 0, 0, 64, 80);
      return t.getContext("2d").getImageData(0, 0, 64, 80).data;
    }
    function meanAbs(a, b) { let s = 0, nn = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]); nn++; } return nn ? s / nn : 0; }

    const loaded = Object.keys(ST_LOOK_ART).filter(k => ST_LOOK_ART[k] && ST_LOOK_ART[k].nodeName).length;
    const missing = Object.keys(ST_LOOK_ART).filter(k => ST_LOOK_ART[k] === "missing");

    /* B) the empty-state tile should BE the photograph. Draw the art the same
          way the renderer does and compare — a computed approximation of the
          sample would not land within a couple of levels of it. */
    const key = ST_PRESETS_MU[0].key;
    const art = ST_LOOK_ART[key];
    let bakedDelta = null;
    if (art && art.nodeName) {
      const CW = ST_TILE_W * stTileDPR(), CH = ST_TILE_H * stTileDPR();
      const ref = document.createElement("canvas"); ref.width = CW; ref.height = CH;
      stDrawLookArt(ref.getContext("2d"), art, CW, CH);
      const r2 = document.createElement("canvas"); r2.width = 64; r2.height = 80;
      r2.getContext("2d").drawImage(ref, 0, 0, 64, 80);
      bakedDelta = +meanAbs(tilePixels("muPresetRow", 0), r2.getContext("2d").getImageData(0, 0, 64, 80).data).toFixed(2);
    }
    const emptyTile = tilePixels("muPresetRow", 0);

    /* C) load a photo and the shelf must switch to that face */
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "lib/ui/user-ref-001.jpg";
    });
    const c0 = document.createElement("canvas"); c0.width = img.naturalWidth; c0.height = img.naturalHeight;
    c0.getContext("2d").drawImage(img, 0, 0);
    await new Promise(r => ST.loadImage(c0.toDataURL("image/jpeg", 0.9), { done: r }));
    await new Promise(r => setTimeout(r, 1200));
    const photoTile = tilePixels("muPresetRow", 0);

    return {
      loaded, missing,
      bakedDelta,
      switchDelta: +meanAbs(emptyTile, photoTile).toFixed(2),
      hasPhoto: !!ST.srcBitmap
    };
  });

  report("B) with no photo, all 16 tiles paint their photograph",
    out.loaded === 16 && out.missing.length === 0 && out.bakedDelta !== null && out.bakedDelta < 3,
    { loaded: out.loaded, missing: out.missing, tileVsArt: out.bakedDelta });

  report("C) once a photo is loaded the shelf switches to THAT face",
    out.hasPhoto === true && out.switchDelta > 5,
    { switchDelta: out.switchDelta });

  report("no page errors", errs.length === 0, errs);

  console.log("      (the pack arrived at 1024x1536 and 10.1MB; the shelf never shows more " +
    "than 228x288 device pixels, so it ships at " + Math.round(bytes / 1000) + "KB)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
