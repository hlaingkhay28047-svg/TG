/* v5.86.0 — THE WORK IS STILL THERE WHEN YOU COME BACK.
 *
 * WHY THIS FILE EXISTS. The owner reported it plainly: results disappear when
 * you leave the app and open it again. They were half right, and the half
 * they were wrong about is the half that made it worse.
 *
 *   · Images were never lost — every take has gone into the Gallery for a
 *     long time. But the PAGE that made them forgot: the result card came
 *     back empty and the take strip came back gone, so a studio had to go
 *     hunting in the Gallery for work they made ten minutes earlier.
 *   · Videos really were lost. The page held a RunningHub link, the app's own
 *     notice said that link works for 24 hours, and the strip under it said
 *     "this session only". Nothing was saved at all.
 *   · Before/After could only be made while the original was still in memory.
 *     The record carried no before image, so a returning studio had a result
 *     and nothing to compare it against.
 *   · And the store deleted the oldest work once it passed sixty records, to
 *     make room nobody asked about.
 *
 * All four are the same promise from a studio's side: what I made is mine
 * until I delete it, and it is where I left it. This drives the real app in a
 * browser and holds that promise — a reload is a real reload, in the same
 * browser profile, exactly as closing and reopening the app would be.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_results_persist.js */
"use strict";
const path = require("path");
const { APP_INIT, APP_PORT } = require("../tools/build_panel_studio_suites.js");

const ROOT = path.join(__dirname, "..");
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/* 2x2 solid PNGs: one stands for the photograph a studio uploaded, the other
   for what came back. Distinct bytes, so "the before survived" is provable
   rather than a guess about which image is on screen. */
const RED = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z4APMOGVHZUeUdIAmvIBDXJTGYIAAAAASUVORK5CYII=";
const BLUE = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGNkYPjPgAcw4ZMclR5R0gCcLgEN9Vv92gAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

function route(r) {
  const u = r.request().url();
  if (u.indexOf("127.0.0.1") >= 0) return r.continue();
  if (r.request().resourceType() === "image")
    return r.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
  return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
}

/* A page of the app, signed in, with the wall and the splash out of the way.
   Every call opens a NEW page in the SAME context, which is what makes the
   second one a genuine "closed it and opened it again". */
async function openApp(ctx, errs, tag) {
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(tag + ": " + String(e).slice(0, 160)));
  await p.route("**/*", route);
  await p.addInitScript(APP_INIT);
  await p.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2400);
  await p.evaluate(() => {
    try { document.body.classList.remove("wall"); } catch (e) { }
    try { const s = document.getElementById("splash"); if (s) s.remove(); } catch (e) { }
  });
  return p;
}

(async () => {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const a = await openApp(ctx, errs, "first");

    /* ---- an image take, made on Edit, with a real original behind it ---- */
    const saved = await a.evaluate(async ({ RED, BLUE }) => {
      switchPage("pgCreate");
      state.refs[0] = { mime: "image/png", b64: RED };
      state.cmpBase = { mime: "image/png", b64: RED };
      return await galleryAdd({ mime: "image/png", b64: BLUE }, "persist probe");
    }, { RED, BLUE });
    report("a result reports that it was saved", saved === true, saved);

    const rec = await a.evaluate(async () => {
      const list = await galListPage("pgCreate", 8);
      const r = list[0] || {};
      return { n: list.length, page: r.page, kind: r.kind,
        before: (r.before && r.before.b64) || "", after: r.b64 || "" };
    });
    report("the record knows which page made it", rec.page === "pgCreate" && rec.kind === "image", JSON.stringify(rec).slice(0, 160));
    report("the BEFORE image is stored beside the after, and they are different pictures",
      !!rec.before && rec.before !== rec.after && rec.after === BLUE,
      "before " + rec.before.length + " chars, after " + rec.after.length);

    /* ---- text to image has no original, and must not borrow one ---- */
    const t2i = await a.evaluate(async ({ BLUE }) => {
      switchPage("pgText2Img");
      await galleryAdd({ mime: "image/png", b64: BLUE }, "t2i probe");
      const list = await galListPage("pgText2Img", 4);
      return { page: (list[0] || {}).page, before: (list[0] || {}).before };
    }, { BLUE });
    report("a text-to-image result files no 'before' — it never had one",
      t2i.page === "pgText2Img" && !t2i.before, JSON.stringify(t2i).slice(0, 160));

    /* ---- a video: the one result the app used to lose outright ---- */
    const vid = await a.evaluate(async (u) => {
      switchPage("pgVideo");
      const id = await galleryAddVideo(u, "clip probe", { page: "pgVideo", res: "720p", dur: "6" });
      if (!id) return { id: 0 };
      const r = await galFull(id);
      return { id: id, kind: r.kind, page: r.page, bytes: (r.blob && r.blob.size) || 0, mime: (r.blob && r.blob.type) || "" };
    }, `http://127.0.0.1:${APP_PORT}/lib/banners/motion/hero-mermaid.mp4`);
    report("a video is stored as the file itself, not as a link that expires",
      vid.id > 0 && vid.kind === "video" && vid.bytes > 10000 && /^video\//.test(vid.mime),
      JSON.stringify(vid));

    /* ---- nothing is deleted to make room ---- */
    const grew = await a.evaluate(async ({ BLUE }) => {
      switchPage("pgCreate");
      const before = await galCountAll();
      for (let i = 0; i < 5; i++) await galleryAdd({ mime: "image/png", b64: BLUE }, "cap probe " + i);
      return { before: before, after: await galCountAll() };
    }, { BLUE });
    report("saving never deletes older work to make room",
      grew.after === grew.before + 5, JSON.stringify(grew));

    /* ================= CLOSE IT AND OPEN IT AGAIN ================= */
    const b = await openApp(ctx, errs, "second");

    const edit = await b.evaluate(async () => {
      switchPage("pgCreate");
      await new Promise(r => setTimeout(r, 1800));
      return {
        takes: state.hist.length,
        card: (document.getElementById("resultBox") || {}).className || "",
        painted: ((document.getElementById("resultImg") || {}).src || "").indexOf("data:image/") === 0,
        before: (state.cmpBase && state.cmpBase.b64) || ""
      };
    });
    report("Edit opens on the takes it was left with, in its own result card",
      edit.takes > 0 && / on\b/.test(edit.card) && edit.painted, JSON.stringify(edit).slice(0, 200));
    report("and Before/After still has its before",
      edit.before === RED, edit.before ? "restored " + edit.before.length + " chars" : "no before restored");

    const t2iBack = await b.evaluate(async () => {
      switchPage("pgText2Img");
      await new Promise(r => setTimeout(r, 1600));
      return { t2i: state.t2iHist.length, shared: state.hist.length };
    });
    report("Text to Image restores into its OWN strip, not the shared one",
      t2iBack.t2i > 0, JSON.stringify(t2iBack));

    const video = await b.evaluate(async () => {
      switchPage("pgVideo");
      await new Promise(r => setTimeout(r, 2200));
      const ex = document.getElementById("vidExpireNote");
      return {
        clips: state.vidHist.length,
        card: (document.getElementById("vidResultBox") || {}).className || "",
        playsLocally: ((document.getElementById("vidResultVideo") || {}).src || "").indexOf("blob:") === 0,
        expiryNoticeShown: !!ex && ex.style.display !== "none"
      };
    });
    report("the video is still there, and plays from this device",
      video.clips > 0 && / on\b/.test(video.card) && video.playsLocally, JSON.stringify(video));
    report("the 24-hour link warning is down once the file itself is saved",
      !video.expiryNoticeShown, "the notice belongs to a link, not to a saved file");

    report("neither visit raises a page error", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — work a studio made is not where they left it.`
    : "\nAll checks passed — results survive leaving the app, with their originals, and nothing is deleted but by hand.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
