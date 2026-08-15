/* v4.64.0 regression sweep — the commissioned card art is shown, whole.

   WHAT HAPPENED. The owner commissioned a full set of 116 workflow-card images
   and they arrived at 1536x1024 — landscape 3:2. The app had been showing
   840x630 art (4:3) in a 4:3 box, so the fit was exact and nobody had ever had
   to think about it. Dropping 3:2 art into that same box with
   object-fit:cover crops the WIDTH: measured at 5.56% off each side, which is
   not a rounding error on these cards. It is exactly where the art keeps its
   labels. The first render of the new pack showed "IMAGE 1" gone completely
   and "IMAGE 2" sliced down to a lone "2".

   Then a second, older problem surfaced underneath it. Two app pills — the
   badge (.bdg) and the how-many-photos pill (.wf-need) — were both anchored to
   the TOP-LEFT corner, directly over where every card in the pack puts its
   first label. That had been true for the old art too; it only became visible
   when the new art's labels were worth reading.

   So this file pins the whole chain: the art is the right shape, the box is
   the right shape, nothing is cropped, and the app's own chrome has got out of
   the way of the thing the owner paid for.

   Pinned contracts:
   A) THE FIT IS EXACT. Box aspect equals image aspect, so the visible fraction
      of the source is 100% in both axes. Computed from the real layout and the
      real decoded image, not from the stylesheet text.
   B) All 116 cards exist, all are 960x640, and none is a stray size. A single
      odd file silently reintroduces the crop for that one card.
   C) NOTHING COVERS THE LABEL BAND. No app pill may sit in the top 22% of the
      visual on the left 55% — that rectangle is where "IMAGE 1" and "BEFORE"
      live on every card in the pack.
   D) The favourite star may stay top-right: measured, it clears "AFTER" (which
      sits at the mid-line, not the right edge) and "RESULT".
   E) THE PHONE STILL AFFORDS IT. The whole card set must not weigh more than
      the set it replaced — a studio owner on a Myanmar mobile connection pays
      for every megabyte, and 1536px art would have tripled it.
   F) The need-pill rides inside the visual, so it is anchored to the visual's
      bottom edge rather than to a card-relative offset that cannot follow a
      height which changes with width.
   G) The grid still renders 116 cards with no page errors.

   Usage: PORT=8931 node test/sweep_v464_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const CARDS = path.join(__dirname, "..", "docs", "app", "lib", "wf", "cards5");

/* ---- B + E) the files on disk, before a browser is involved ---- */
function jpegSize(buf) {
  /* minimal JPEG SOF parser — reading dimensions without an image library
     keeps this suite dependency-free like every other sweep in this repo */
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    /* SOF0/1/2/9/10 carry the frame header; skip DHT/DQT/APPn/SOS */
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb].indexOf(m) >= 0) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return null;
}

const files = fs.readdirSync(CARDS).filter(f => /\.jpg$/i.test(f));
const dims = {};
let totalBytes = 0;
const odd = [];
files.forEach(f => {
  const p = path.join(CARDS, f);
  totalBytes += fs.statSync(p).size;
  const d = jpegSize(fs.readFileSync(p));
  const k = d ? d.w + "x" + d.h : "unreadable";
  dims[k] = (dims[k] || 0) + 1;
  if (!d || d.w !== 960 || d.h !== 640) odd.push(f + "=" + k);
});

/* v4.79 — the count is a FLOOR, not an equality. This asserted exactly 116 and
   went red the moment a 117th card image shipped (pr-sketchPose, whose photo
   v4.67 promised and this wave delivered) — the identical mistake assertion G
   below already records making, one level down: G pinned the number of
   WORKFLOWS, this pinned the number of IMAGES. What the contract actually
   cares about is that no card is missing and none is a stray size; the pack
   growing is the product improving, and a test that punishes that is testing
   the wrong thing. */
report("B) every workflow card is present and 960x640 (3:2), and the pack may grow",
  files.length >= 116 && odd.length === 0,
  { count: files.length, dims, odd: odd.slice(0, 6) });

/* The set this replaced was 116 files totalling 13.8 MB. Shipping the pack at
   its native 1536x1024 would have been 38.1 MB — nearly triple — for art that
   is never displayed wider than ~306 CSS px. */
const PREV_MB = 13.8;
report("E) the new set is no heavier than the one it replaced (phone data budget)",
  totalBytes / 1e6 <= PREV_MB,
  { newMB: +(totalBytes / 1e6).toFixed(2), prevMB: PREV_MB, nativeWouldHaveBeenMB: 38.1 });

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];
  const byWidth = {};

  for (const w of [390, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1200 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(w + "px " + String(e).slice(0, 160)));
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    byWidth[w] = await page.evaluate(async () => {
      const out = {};
      document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
      const pg = document.getElementById("pgWf");
      if (!pg) return { err: "no pgWf" };
      pg.classList.add("on");
      await new Promise(r => setTimeout(r, 800));
      /* The workflow page is a set of collapsed groups — every card is built
         into the DOM, but only the open group's cards have a layout box. Count
         both: the total proves nothing was dropped, the visible count proves
         the open group actually painted. An earlier draft asserted 116 VISIBLE
         and failed at 7, which was the test misreading the page, not the page
         losing cards. */
      out.nCardsTotal = document.querySelectorAll(".wfv").length;
      const cards = Array.from(document.querySelectorAll(".wfv")).filter(x => x.offsetWidth > 0);
      out.nCards = cards.length;
      /* force the lazy images near the top to decode so naturalWidth is real */
      cards.slice(0, 6).forEach(c => c.scrollIntoView());
      await new Promise(r => setTimeout(r, 1400));
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 400));

      const loaded = cards.filter(c => {
        const i = c.querySelector("img");
        return i && i.naturalWidth > 0 && /cards5\//.test(i.src);
      }).slice(0, 4);
      out.nMeasured = loaded.length;

      /* A) visible fraction of the source under object-fit:cover */
      out.fit = loaded.map(c => {
        const R = c.getBoundingClientRect(), im = c.querySelector("img");
        const boxA = R.width / R.height, imgA = im.naturalWidth / im.naturalHeight;
        const visW = imgA > boxA ? boxA / imgA : 1;
        const visH = imgA > boxA ? 1 : imgA / boxA;
        return {
          boxA: +boxA.toFixed(3), imgA: +imgA.toFixed(3),
          visW: +(visW * 100).toFixed(1), visH: +(visH * 100).toFixed(1),
          fit: getComputedStyle(im).objectFit
        };
      });

      /* C) nothing in the label band: top 22% of the visual, left 55% */
      const intruders = [];
      loaded.forEach(c => {
        const R = c.getBoundingClientRect();
        document.querySelectorAll(".bdg,.wf-need,.fav").forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const inBand = r.top < R.top + R.height * 0.22 && r.bottom > R.top;
          const onLeft = r.left < R.left + R.width * 0.55 && r.right > R.left;
          if (inBand && onLeft) intruders.push((e.className || "?") + "@" + Math.round(r.left - R.left) + "," + Math.round(r.top - R.top));
        });
      });
      out.labelBandIntruders = intruders.slice(0, 8);

      /* D) the star sits right of the mid-line, so it cannot cover "AFTER" */
      const first = loaded[0];
      if (first) {
        const R = first.getBoundingClientRect();
        const star = first.parentElement.querySelector(".fav");
        out.starLeftOfMid = star ? (star.getBoundingClientRect().left < R.left + R.width * 0.5) : null;
      }

      /* F) the need pill rides inside the visual */
      out.needInVisual = document.querySelectorAll(".wfv .wf-need").length;
      out.needOutside = Array.from(document.querySelectorAll(".wf-need"))
        .filter(e => !e.closest(".wfv")).length;
      return out;
    });
    await ctx.close();
  }

  const at = w => byWidth[w] || {};
  const WS = [390, 768, 1280];

  report("A) the box matches the art — 100% of the source is visible in both axes",
    WS.every(w => (at(w).fit || []).length > 0 &&
      at(w).fit.every(f => f.visW === 100 && f.visH === 100 && f.fit === "cover")),
    WS.map(w => w + ":" + JSON.stringify(at(w).fit && at(w).fit[0])).join(" | "));

  report("C) no app pill sits in the card's label band (top 22%, left 55%)",
    WS.every(w => (at(w).labelBandIntruders || []).length === 0),
    WS.map(w => w + ":" + JSON.stringify(at(w).labelBandIntruders)).join(" | "));

  report("D) the favourite star stays right of the mid-line, clear of AFTER/RESULT",
    WS.every(w => at(w).starLeftOfMid === false),
    WS.map(w => w + ":leftOfMid=" + at(w).starLeftOfMid).join(" "));

  report("F) every need-pill rides inside its visual, none left on the card",
    WS.every(w => at(w).needInVisual > 100 && at(w).needOutside === 0),
    WS.map(w => w + ":in=" + at(w).needInVisual + " out=" + at(w).needOutside).join(" "));

  /* This asked for exactly 116 workflow cards and went red the moment a 117th
     workflow shipped — the same mistake the page-count assertion made two waves
     earlier. The pack is 116 IMAGES, which assertion B already pins on disk;
     the number of WORKFLOWS is free to grow and pinning it just punishes the
     next feature. What matters here is that the grid is fully built and the
     open group actually painted cards this sweep could measure. */
  report("G) the grid is fully built and the open group paints measurable cards",
    WS.every(w => at(w).nCardsTotal >= 116 && at(w).nCards > 0 && at(w).nMeasured > 0),
    WS.map(w => w + ":total=" + at(w).nCardsTotal + " visible=" + at(w).nCards +
      " measured=" + at(w).nMeasured).join(" | "));

  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("      (card set: " + files.length + " files, " +
    (totalBytes / 1e6).toFixed(2) + " MB at 960x640 — the pack shipped at 1536x1024/38.1 MB " +
    "and is never displayed wider than ~306 CSS px)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
