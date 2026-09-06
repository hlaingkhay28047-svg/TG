/* v6.22.0 — dump the EXACT request body the app would send for every video
   model, every video tool and the video upscaler (v6.26.0: and every IMAGE
   model at 1..14 reference photos, so the lane can measure each endpoint's
   real photo capacity), with placeholder media URLs.
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
/* v6.26.0 — the IMAGE catalog: IMG1..IMG14 placeholders, probed at these reference counts (single-image kinds at one) */
const IMGS = Array.from({ length: 14 }, (_, i) => "https://placeholder.invalid/IMG" + (i + 1) + ".jpg"), COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 14];
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const dump = await page.evaluate(async (P) => {
      const out = { video: [], tools: [], upscale: null, image: [], t2i: [], counts: {} };
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
      /* v6.26.0 — every image model's body, built by rhV2Body (or the upscale submit paths) exactly as
         a Freeform GENERATE would send it, at each reference count the UI could offer. Kinds that take
         one image by construction (imageUrl/image, node graphs with one image key, fluxedit, zimage,
         grokimg, sdlayer, the upscalers) are probed once; node graphs with an ordered image list at one
         and at their slot count; array-taking kinds at every COUNTS step. */
      if (typeof RH_MODELS !== "undefined" && typeof rhV2Body === "function") {
        for (const m of RH_MODELS) {
          if (!m.apiPath) continue;
          const k = m.kind || "", nodeImgs = (k === "node" && m.node && m.node.images) ? m.node.images.length : 0;
          const single = m.imageParam === "image" || m.imageParam === "imageUrl" || k === "fluxedit" || k === "zimage" || k === "grokimg" || k === "sdlayer" || (k === "node" && !nodeImgs) || k === "upscale" || k === "upscale-transparent";
          const counts = single ? [1] : (nodeImgs ? [1, nodeImgs] : P.COUNTS);
          for (const n of counts) {
            let url = RH_V2_BASE + "/" + m.apiPath, body = null, err = null;
            try {
              if (k === "upscale") { const s = await capture(() => rhV2SubmitUpscale("K", m.apiPath, P.IMGS[0], "2x", null)); body = s && s.body; url = (s && s.url) || url; }
              else if (k === "upscale-transparent") { const s = await capture(() => rhV2SubmitUpscaleTransparent("K", m.apiPath, P.IMGS[0], "2k", null)); body = s && s.body; url = (s && s.url) || url; }
              else body = rhV2Body(m.apiPath, P.IMGS.slice(0, n), "A woman in a red dress, soft studio light, natural skin, sharp eyes.", "1:1", "1k", m);
            } catch (e) { err = String(e).slice(0, 200); }
            out.image.push({ id: m.id, label: m.label, apiPath: m.apiPath, kind: k, n: n, single: single, url: url, body: body, err: err });
          }
        }
      }
      /* v6.26.0 — every text-to-image model through rhV2SubmitT2I (its first ratio, "1k"), the same halting stub */
      if (typeof RH_T2I_MODELS !== "undefined" && typeof rhV2SubmitT2I === "function") {
        for (const m of RH_T2I_MODELS) {
          if (!m.apiPath) continue;
          const seen = await capture(() => rhV2SubmitT2I("K", m, "A woman in a red dress, soft studio light, natural skin, sharp eyes.", (m.ratios || [])[0] || "1:1", "1k", null));
          out.t2i.push({ id: m.id, label: m.label, apiPath: m.apiPath, url: seen && seen.url, body: seen && seen.body, nodeKeys: !!m.nodeKeys });
        }
      }
      window.fetch = orig;
      out.counts = { video: out.video.length, tools: out.tools.length, videoNoBody: out.video.filter(v => !v.body).length, toolsNoBody: out.tools.filter(t => !t.body).length, image: out.image.length, imageNoBody: out.image.filter(x => !x.body).length, t2i: out.t2i.length, t2iNoBody: out.t2i.filter(x => !x.body).length };
      return out;
    }, { IMG1, IMG2, VID, IMGS, COUNTS });
    dump.errors = errs;
    fs.writeFileSync(OUT, JSON.stringify(dump, null, 1));
    console.log("bodies:", JSON.stringify(dump.counts), "pageErrors:", errs.length, "->", OUT);
    if (dump.counts.videoNoBody || dump.counts.toolsNoBody || dump.counts.imageNoBody || dump.counts.t2iNoBody || errs.length) process.exit(1);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
