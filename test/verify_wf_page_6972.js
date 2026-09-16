/* verify_wf_page_6972.js — 6.97.2 / panel 6.168.2
   TWO THINGS THE OWNER PHOTOGRAPHED ON THE SMART WORKFLOW PAGE.

   ONE — THE LONE FULL-WIDTH CARD'S SQUASHED PICTURE (A · B · C).

   The owner's photograph of 6.168.1: "Smart workflow card အောက်နားက ပုံက အချိုးမမှန်ပဲကွယ်နေတယ်" —
   the picture on the card at the bottom is out of proportion and hidden. It is the odd
   card of a group, the one that fills the row on its own.

   MEASURED, BEFORE THE FIX. A normal card's picture box came back 126 × 84 — ratio 1.5,
   exactly the ratio the picture is drawn at. The lone full-width card's box came back
   282 × 141 — ratio 2.0. Every Smart Workflow picture the studio ships is 3:2 (194 of 194
   in docs/app/lib/wf/cards5, 10 of 10 bundled in panel/icons/cards), so that card was
   painting a 3:2 photograph into a 2:1 hole: three quarters of its height, everybody
   squat, the lower edge of the composition mashed into the frame.

   WHY THE APP IS FINE AND THE PANEL IS NOT. The 2:1 box came from the app, where it is
   correct: the app CROPS — object-fit: cover with an object-position chosen to keep the
   faces. This renderer has no object-fit at all (verify_panel_uxp_safe A12 counts the nine
   declarations that remain, and .wfv's <img> is not one of them), so an <img> at
   width:100%/height:100% is STRETCHED into whatever box it is given. The app knows this
   shape of trouble itself: its own narrow-width media query drops .wfmini.wf-span2 .wfv
   back to aspect-ratio 3/2 — and a Photoshop panel is always that width.

   SO: the full-width card keeps the 3:2 box the other cards use. The picture is drawn
   LARGER, never squeezed. C measures it on three pages, and C4 puts the old rule back to
   prove this file would have caught the photograph.

   TWO — THE RUN STRIP WAS AT THE BOTTOM OF THE PAGE (E). "ခုပြထားတဲ့ဟာကို Generate
   ခလုတ်နားမှာထားပေးပါ အဓိပါယ် မရှိလို့အောက်ထိသွားကြည့်နေရတာ" — put the thing it is showing
   next to the Generate button; down there it is pointless, I have to scroll all the way
   down to look at it. The strip (queued → uploading → generating → downloading → placing,
   then the green "it is in the group as a Layer + Mask" sentence) was appended to the AI
   Tools mount root, so it always landed last: below the Results card, below the History
   link, below everything. The student pressed GENERATE at the top and had no idea whether
   anything was happening.

   The strip now looks for an anchor — an empty div with id hnkRunHere — inside its root and
   moves itself into it; the Smart Workflow screen renders that anchor as GENERATE's very
   next sibling. A screen that renders no anchor keeps the old behaviour, so nothing else
   moved. E2 measures the arrangement and E3 takes the anchor away to prove both halves. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PCSS = read("panel/styles.css");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the rule, in the source ================= */
function sourcePins() {
  report("A1) the lone full-width card keeps the 3:2 box the other cards use — the 2:1 box the app can afford is gone from the panel",
    /\.wfmini \.wfv \{[^}]*padding-top: 66\.6667%/.test(PCSS) &&
    /\.wfmini\.wf-span2 \.wfv \{ padding-top: 66\.6667%; \}/.test(PCSS) &&
    !/\.wfmini\.wf-span2 \.wfv \{ padding-top: 50%; \}/.test(PCSS), null);

  report("A2) and the picture is stretched, not cropped, because this renderer has no object-fit — the reason is written where the rule is",
    /\.wfmini \.wfv > img \{[^}]*width: 100%; height: 100%/.test(PCSS) &&
    !/\.wfmini \.wfv > img \{[^}]*object-fit/.test(PCSS) &&
    /THE LONE CARD'S SQUASHED PICTURE/.test(PCSS) &&
    /no object-fit/.test(PCSS), null);

  /* the app is NOT wrong — it crops, and at a panel's width it already does what the
     panel now does. Both halves are pinned so a later app change cannot quietly
     invalidate the reasoning above. */
  report("A3) the app keeps its own 2:1 box because it crops, and its narrow-width rule is the one the panel copies",
    /\.wfmini\.wf-span2 \.wfv\{aspect-ratio:2\/1\}/.test(APP) &&
    /\.wfmini\.wf-span2 \.wfv img\{object-position:center 22%\}/.test(APP) &&
    /\.wfmini\.wf-span2 \.wfv\{aspect-ratio:3\/2\}/.test(APP), null);
}

/* ================= B) the pictures themselves, off the disk ================= */
function pictureRatios() {
  const dims = (p) => {
    const b = fs.readFileSync(p);
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xC0 || m === 0xC1 || m === 0xC2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  };
  const scan = (dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return { dir, n: 0, off: ["missing"] };
    const off = []; let n = 0;
    for (const f of fs.readdirSync(abs)) {
      if (!/\.(jpe?g|png)$/i.test(f)) continue;
      const d = dims(path.join(abs, f));
      if (!d || !d.h) continue;
      n++;
      const r = d.w / d.h;
      if (Math.abs(r - 1.5) > 0.02) off.push(f + " " + d.w + "x" + d.h);
    }
    return { dir, n, off };
  };
  const bundled = scan("panel/icons/cards");
  const shipped = scan("docs/app/lib/wf/cards5");
  report("B1) every Smart Workflow picture the studio ships is 3:2 — the ratio the card box has to be, measured off the files and not off a manifest",
    bundled.n >= 10 && bundled.off.length === 0 && shipped.n >= 190 && shipped.off.length === 0,
    { bundled: { n: bundled.n, off: bundled.off.slice(0, 4) }, shipped: { n: shipped.n, off: shipped.off.slice(0, 4) } });
}

/* ================= C) the panel, measured ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  try {
    await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });

    const measure = async (pg) => {
      await page.evaluate((p) => { try { switchPage(p); } catch (e) { } }, pg);
      await page.waitForTimeout(1400);
      return await page.evaluate(async () => {
        const heads = Array.from(document.querySelectorAll(".app-grp > button, .grp-h, button.grp"));
        for (const h of heads) { try { h.click(); } catch (e) { } await new Promise((r) => setTimeout(r, 80)); }
        await new Promise((r) => setTimeout(r, 1000));
        const rows = { span: [], plain: [] };
        Array.from(document.querySelectorAll(".wfmini")).forEach((card) => {
          const box = card.querySelector(".wfv");
          if (!box) return;
          const r = box.getBoundingClientRect();
          if (!(r.width > 8 && r.height > 8)) return;
          const rec = { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3) };
          (String(card.className || "").indexOf("wf-span2") >= 0 ? rows.span : rows.plain).push(rec);
        });
        return rows;
      });
    };

    const wf = await measure("wf");
    const bad = (rows) => rows.filter((x) => Math.abs(x.ratio - 1.5) > 0.03);
    report("C1) THE PHOTOGRAPH, ANSWERED: on Workflows the lone full-width card's picture box is 3:2, the same as every other card's — a 3:2 photograph is never squeezed into it",
      wf.span.length > 0 && bad(wf.span).length === 0,
      { spans: wf.span.length, off: bad(wf.span).slice(0, 4), sample: wf.span[0] });
    report("C2) and the two-column cards are unchanged — every picture box on the page is 3:2",
      wf.plain.length > 4 && bad(wf.plain).length === 0,
      { plain: wf.plain.length, off: bad(wf.plain).slice(0, 4), sample: wf.plain[0] });

    /* the other grids draw the same .wfmini card from main.js and add wf-span2 to
       their own odd card, so one CSS rule covers them — measured, not assumed. The
       routes are discovered rather than named: a page that renders no card is simply
       not one of them. */
    const others = {};
    for (const pg of ["video", "v2v", "talk", "vidup", "path", "gallery"]) {
      let r = null;
      try { r = await measure(pg); } catch (e) { continue; }
      if ((r.span.length + r.plain.length) > 0) others[pg] = r;
    }
    const allOther = Object.keys(others).reduce((a, k) => a.concat(others[k].span, others[k].plain), []);
    report("C3) every other panel page that draws these cards gets the same 3:2 box — one rule, measured on each page that actually has one",
      Object.keys(others).length >= 1 && allOther.length > 0 && bad(allOther).length === 0,
      { pages: Object.keys(others).map((k) => k + ":" + (others[k].span.length + others[k].plain.length)),
        off: bad(allOther).slice(0, 4) });

    /* C4 — the fault, injected: put 6.168.1's rule back and watch the same card flatten.
       Without this the three checks above would pass on a page that never had a
       full-width card at all. Back to Workflows first — C3 left us elsewhere. */
    await measure("wf");
    const hurt = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.textContent = ".wfmini.wf-span2 .wfv { padding-top: 50%; }";
      document.head.appendChild(st);
      await new Promise((r) => setTimeout(r, 400));
      const out = [];
      Array.from(document.querySelectorAll(".wfmini.wf-span2")).forEach((card) => {
        const box = card.querySelector(".wfv");
        if (!box) return;
        const r = box.getBoundingClientRect();
        if (r.width > 8 && r.height > 8) out.push(+(r.width / r.height).toFixed(3));
      });
      st.parentNode.removeChild(st);
      return out;
    });
    report("C4) FAULT INJECTED: with 6.168.1's 2:1 rule put back the same card measures 2.0 — so this file would have caught the owner's photograph",
      hurt.length > 0 && hurt.every((r) => Math.abs(r - 2) < 0.03), { hurt: hurt.slice(0, 4) });

    report("C5) nothing threw while all of that ran", errs.length === 0, errs.slice(0, 4));
  } finally {
    await page.close(); await ctx.close(); server.close();
  }
}

/* ================= D) the release ================= */
function releasePins() {
  const app = (read("docs/app/index.html").match(/var APP_VER="([\d.]+)";/) || [])[1];
  const pan = (read("panel/main.js").match(/PANEL_VERSION *= *"([\d.]+)"/) || [])[1];
  const esc = (v) => String(v).replace(/\./g, "\\.");
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  report("D1) the wave ships in lockstep and the suite carries this file, counted on the landing page",
    !!app && !!pan && MANIFEST.version === pan &&
    new RegExp('"version": *"' + esc(pan) + '"').test(read("panel/manifest.json")) &&
    new RegExp('"v":"' + esc(app) + '"').test(read("docs/app/version.json")) &&
    steps.has("node test/verify_wf_page_6972.js") &&
    String(steps.size) === badge, { app, pan, manifest: MANIFEST.version, steps: steps.size, badge });
}

/* ================= E) the run strip, beside the button that starts it ================= */
const STRIP = read("panel/src/ui/progress-strip.js");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");

function stripPins() {
  report("E1) the strip goes where the screen says — an anchor inside its root, falling back to the root itself for a screen that renders none",
    /function anchor\(\) \{/.test(STRIP) &&
    /return rootEl\.querySelector\("#hnkRunHere"\);/.test(STRIP) &&
    /var host = anchor\(\) \|\| rootEl;/.test(STRIP) &&
    /if \(!attached\) \{ try \{ host\.appendChild\(el\); \}/.test(STRIP) &&
    !/rootEl\.appendChild\(el\)/.test(STRIP) &&
    /WHERE THE STRIP LIVES/.test(STRIP), null);

  report("E2) and the Smart Workflow page renders that anchor as GENERATE's very next sibling, weightless until a run starts",
    /root\.appendChild\(nodes\.generate\);\s*\n\s*\n(\s*\/\*[\s\S]*?\*\/\s*\n)\s*root\.appendChild\(dom\.el\(doc, "div", \{ class: "hnk-run-here", id: "hnkRunHere" \}\)\);/.test(SCREEN) &&
    /\.hnk-run-here \{ display: block; \}/.test(PCSS) &&
    /\.hnk-progress \{ display: none; \}/.test(PCSS), null);
}

async function stripWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  try {
    await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(1400);

    const out = await page.evaluate(async () => {
      const wfs = HNK.aiToolsApp.workflowScreen();
      wfs.select("region-edit"); await new Promise((r) => setTimeout(r, 900));
      const rootEl = document.getElementById("hnkAiToolsRoot");
      const ord = (id) => { const e = document.getElementById(id); if (!e) return -1;
        return Array.prototype.indexOf.call(document.querySelectorAll("#hnkAiToolsRoot *"), e); };
      const o = { mod: !!(window.HNK && HNK.progressStrip) };
      const gen = document.getElementById("hnkWfGenerate");
      o.genNext = gen && gen.nextSibling ? String(gen.nextSibling.id || "") : "";

      /* the strip module, driven over the live root exactly as the bootstrap drives it */
      const st = HNK.progressStrip.create({ document: document, root: rootEl });
      st.onStage("UPLOADING", { label: "up" });
      await new Promise((r) => setTimeout(r, 200));
      let s1 = document.getElementById("hnkProgressStrip");
      o.parent = s1 ? String((s1.parentNode && s1.parentNode.id) || "") : "";
      o.shown = s1 ? getComputedStyle(s1).display : "gone";
      o.order = { generate: ord("hnkWfGenerate"), anchor: ord("hnkRunHere"), strip: ord("hnkProgressStrip"), results: ord("hnkWfResults") };
      st.onStage("READY", { label: "ok" });
      await new Promise((r) => setTimeout(r, 200));
      s1 = document.getElementById("hnkProgressStrip");
      o.doneParent = s1 ? String((s1.parentNode && s1.parentNode.id) || "") : "";

      /* FAULT: take the anchor away — the strip must fall back to the root's end,
         which is where 6.168.1 always put it and where a screen with no anchor
         still wants it */
      const a = document.getElementById("hnkRunHere");
      if (a && a.parentNode) a.parentNode.removeChild(a);
      st.onStage("UPLOADING", { label: "up again" });
      await new Promise((r) => setTimeout(r, 200));
      const s2 = document.getElementById("hnkProgressStrip");
      o.fallbackParent = s2 ? String((s2.parentNode && s2.parentNode.id) || "") : "";
      o.fallbackLast = !!(s2 && rootEl && rootEl.lastElementChild === s2);
      return o;
    });

    report("E3) THE STRIP IS BESIDE THE BUTTON: the anchor is GENERATE's next sibling, the strip lives inside it, and it is above the Results card instead of below the whole page",
      out.mod && out.genNext === "hnkRunHere" && out.parent === "hnkRunHere" && out.doneParent === "hnkRunHere" &&
      out.order.generate >= 0 && out.order.anchor === out.order.generate + 1 &&
      out.order.strip > out.order.anchor && out.order.results > out.order.strip &&
      out.shown !== "none", out);
    report("E4) FAULT INJECTED: with the anchor gone the strip falls back to the end of the mount root — 6.168.1's place, and still the right one for a screen that renders no anchor",
      out.fallbackParent === "hnkAiToolsRoot" && out.fallbackLast === true,
      { fallbackParent: out.fallbackParent, last: out.fallbackLast });
    report("E5) nothing threw while the strip was driven", errs.length === 0, errs.slice(0, 4));
  } finally {
    await page.close(); await ctx.close(); server.close();
  }
}

(async () => {
  sourcePins();
  pictureRatios();
  stripPins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); await stripWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures === 0 ? "ALL PASS" : failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
