/* v6.22.0 — dump the EXACT request body the app would send for every video
   model, every video tool and the video upscaler, with placeholder media URLs.
   Nothing here touches the network: the app's own rhV2SubmitVideo / rhVtBody
   / rhV2SubmitVideoUpscale run against a stubbed fetch that records the call
   and halts. The probe lane then swaps the placeholders for real uploaded
   media and asks RunningHub's price-preview whether each endpoint accepts
   that body — the same check the app's own cost line makes before a submit.

   Usage: PORT=8931 node tools/probe_video_bodies.js out/probe_bodies.json */
const { chromium } = require("playwright-core");
const fs = require("fs");
const PORT = process.env.PORT || 8931;
const OUT = process.argv[2] || "probe_bodies.json";
const IMG1 = "https://placeholder.invalid/FIRST.jpg", IMG2 = "https://placeholder.invalid/SECOND.jpg", VID = "https://placeholder.invalid/VIDEO.mp4";
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const dump = await page.evaluate(async (P) => {
      const out = { video: [], tools: [], upscale: null, counts: {} };
      const orig = window.fetch;
      const capture = async (fn) => {
        let seen = null;
        window.fetch = async (u, o) => { seen = { url: String(u), body: o && o.body ? JSON.parse(o.body) : null }; throw new Error("halt"); };
        try { await fn(); } catch (e) { /* halted on purpose */ }
        return seen;
      };
      for (const m of RH_VIDEO_MODELS) {
        const imgs = m.maxImages === 0 ? [] : (m.maxImages > 1 || m.lastParam ? [P.IMG1, P.IMG2] : [P.IMG1]);
        const seen = await capture(() => rhV2SubmitVideo("K", m.apiPath, imgs, "A woman turns her head and smiles at the camera.",
          (m.resolutions || [])[0], (m.durations || [])[0], (m.aspects || [])[0], m.imageParam, m.promptMax, m));
        out.video.push({ id: m.id, label: m.label, fam: m.fam, apiPath: m.apiPath, url: seen && seen.url, body: seen && seen.body,
          imageParam: m.imageParam, minImages: m.minImages, maxImages: m.maxImages });
      }
      if (typeof RH_VTOOL_MODELS !== "undefined" && typeof rhVtBody === "function") {
        for (const d of RH_VTOOL_MODELS) {
          let body = null, err = null;
          try { body = rhVtBody(d, P.VID, [P.IMG1], "A short prompt.", {}); } catch (e) { err = String(e); }
          out.tools.push({ id: d.id, label: d.label, apiPath: d.apiPath, url: RH_V2_BASE + "/" + d.apiPath, body: body, err: err });
        }
      }
      if (typeof rhV2SubmitVideoUpscale === "function") {
        const seen = await capture(() => rhV2SubmitVideoUpscale("K", P.VID, "1080p", null));
        out.upscale = { id: "video-upscaler", apiPath: RH_VU_APIPATH, url: seen && seen.url, body: seen && seen.body };
      }
      window.fetch = orig;
      out.counts = { video: out.video.length, tools: out.tools.length, videoNoBody: out.video.filter(v => !v.body).length, toolsNoBody: out.tools.filter(t => !t.body).length };
      return out;
    }, { IMG1, IMG2, VID });
    dump.errors = errs;
    fs.writeFileSync(OUT, JSON.stringify(dump, null, 1));
    console.log("bodies:", JSON.stringify(dump.counts), "pageErrors:", errs.length, "->", OUT);
    if (dump.counts.videoNoBody || dump.counts.toolsNoBody || errs.length) process.exit(1);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
