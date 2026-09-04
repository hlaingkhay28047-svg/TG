/* v5.87.0 — ONE REFERENCE, A HUNDRED PHOTOGRAPHS, ONE LOOK.
 *
 * WHY THIS FILE EXISTS. The owner asked for a workflow that copies a
 * reference photograph's whole look — its scene, its colour, its lighting and
 * white balance, its skin and hair finish — into a student's own photo, while
 * the student's subject, pose, framing and aspect ratio stay exactly as shot;
 * and asked for it to give the same result on a hundred different photos, at
 * any pose, half body or full, "on a proper set of AI models — be sure which
 * ones".
 *
 * Being sure turned out to be the interesting part. Twenty-six of the shipped
 * image models can carry the two images this workflow needs — that capacity is
 * already read from what each builder really sends. But THIRTEEN of those
 * twenty-six cap the prompt: 800 characters on Qwen Image 2 and Jimeng 4.6,
 * 2000 on Seedream v4 and Wan, 3000 on Qwen Image 3, 5000 on Seedream v5 Pro.
 * rhTruncatePrompt cuts at that cap SILENTLY, so a long workflow arrives at
 * those models with its ending missing — and the ending is where every lock
 * lives. A hundred photos would not have come back as one series; they would
 * have come back as two, depending on which model was selected.
 *
 * The app has always had the answer and no Smart Workflow had ever used it:
 * rhTruncatePrompt keeps everything from "TASK GUARD:" onwards and trims the
 * front instead. So this workflow ends with a guard block that carries the
 * whole contract in under 700 characters, and this test proves the contract
 * survives at EVERY cap in the shipped catalog — not at a cap someone typed
 * in here, at the real ones, read from the catalog itself.
 *
 * It also holds the nine switches to their prompt: each one removes its own
 * line and nothing else, which is what makes "colour but not scene" a real
 * choice rather than a label.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_studio_look_copy.js */
"use strict";
const path = require("path");
const fs = require("fs");
const { APP_INIT, APP_PORT } = require("../tools/build_panel_studio_suites.js");

const ROOT = path.join(__dirname, "..");
const ID = "studio-look-copy";
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(APP_INIT);
    await page.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2400);

    /* ---- 1. the workflow is in the catalog, and in a category ---- */
    const wf = await page.evaluate(id => {
      const w = LW.workflows.filter(x => x.id === id)[0];
      if (!w) return null;
      const cat = (window.HNK_WF_CATALOG || [])
        .filter(c => (c.items || []).some(i => i.id === id)).map(c => c.t);
      return { title: w.title, req: w.req.length, opt: (w.opt || []).length,
        fields: (w.fields || []).map(f => ({ key: f.key, type: f.type, tag: f.tag || "", on: f.default !== false })),
        prompt: w.prompt, negative: w.negative || "", visual: w.visual || "", cat: cat };
    }, ID);
    report("the workflow is in the shipped catalog, in a category a student can reach",
      !!wf && wf.req === 2 && wf.cat.length === 1, wf ? JSON.stringify({ req: wf.req, cat: wf.cat }) : "not found");
    if (!wf) { console.log("\nFAIL — nothing else can be checked."); process.exit(1); }

    report("it asks for exactly two images — your photo and the look reference",
      wf.req === 2 && wf.opt === 0, JSON.stringify({ req: wf.req, opt: wf.opt }));

    /* ---- 2. every switch the owner asked for, and each one owns a line ---- */
    /* v6.0.0 — three more, because the owner asked this tool to copy a look
       whole: the makeup in full detail, the jewellery and hair ornaments,
       and the hairstyle. The pin moves 9 -> 12 so a control still cannot
       vanish unnoticed; the ABSOLUTE LOCK and the TASK GUARD that used to
       freeze all three are now conditional on these switches, which
       verify_switch_honesty C2-C5 proves. */
    const want = ["scene", "tone", "light", "smooth", "retouch", "skintone", "hair", "finish",
                  "mkcopy", "adorn", "hairstyle", "note"];
    const got = wf.fields.map(f => f.key);
    report("all twelve controls are there — scene, colour+WB, lighting, skin smoothing, skin retouch, face+body tone, hair, finish, makeup, ornaments, hairstyle, and a free request",
      want.every(k => got.indexOf(k) >= 0) && got.length === want.length, got.join(","));
    report("every control starts switched ON, so the default is the whole look",
      wf.fields.filter(f => f.type === "toggle").every(f => f.on), JSON.stringify(wf.fields.map(f => f.key + ":" + f.on)));

    const lines = wf.prompt.split("\n");
    const bad = wf.fields.filter(f => f.tag && lines.filter(l => l.indexOf(f.tag) === 0).length !== 1);
    report("each control's tag names exactly one line of the prompt — no switch that silently does nothing, none that takes two lines with it",
      bad.length === 0, bad.map(f => f.tag).join(" | "));

    /* A tag is matched as a LINE PREFIX, so one tag that begins another would
       take two lines away when a student switched one control off. Nothing
       catches that by reading the prompt; only comparing the tags does. */
    const pairs = [];
    wf.fields.filter(f => f.tag).forEach(a => wf.fields.filter(f => f.tag && f !== a)
      .forEach(b => { if (b.tag.indexOf(a.tag) === 0) pairs.push(a.tag + " swallows " + b.tag); }));
    report("no control's tag begins another's — switching one off can never take a second line with it",
      pairs.length === 0, pairs.join(" | "));

    /* the composed prompt is the app's own composition, asked of the app */
    const composed = await page.evaluate(id => window._wfBatchPrompt(id), ID);
    const onTags = wf.fields.filter(f => f.type === "toggle").map(f => f.tag);
    report("with every switch on, the composed prompt carries all eight look lines",
      onTags.every(t => composed.split("\n").some(l => l.indexOf(t) === 0)),
      "missing: " + onTags.filter(t => !composed.split("\n").some(l => l.indexOf(t) === 0)).join(", "));
    report("no {{token}} ever reaches the engine raw — an unfilled request takes its own line away instead",
      composed.indexOf("{{") < 0 && composed.indexOf("EXTRA REQUEST:") < 0,
      composed.indexOf("{{") >= 0 ? "raw token left in" : "the empty request line is still there");

    /* ---- 3. the contract survives every prompt cap in the shipped catalog ---- */
    const guardKeys = ["Edit IMAGE 1 only", "aspect ratio", "never its person", "watermark"];
    const trunc = await page.evaluate(({ id, keys }) => {
      const full = window._wfBatchPrompt(id);
      function maxIn(d) { const k = d.kind || "";
        if (k === "node") return (d.node && d.node.images) ? d.node.images.length : 1;
        if (["zimage", "grokimg", "sdlayer", "xedit", "fluxedit", "upscale", "upscale-transparent"].indexOf(k) >= 0) return 1;
        const ip = d.imageParam || "imageUrls";
        return (ip === "image" || ip === "imageUrl") ? 1 : 3; }
      const capable = RH_MODELS.filter(m => m.apiPath && maxIn(m) >= 2);
      const capped = capable.filter(m => m.promptMax && m.promptMax < full.length);
      const lost = capped.filter(m => {
        const sent = rhTruncatePrompt(full, m.promptMax);
        return !keys.every(t => sent.indexOf(t) >= 0);
      }).map(m => m.id + "@" + m.promptMax);
      return { total: capable.length, capped: capped.length, lost: lost,
        chars: full.length, guarded: full.indexOf("TASK GUARD:") >= 0,
        smallest: Math.min.apply(null, capped.map(m => m.promptMax).concat([1e9])) };
    }, { id: ID, keys: guardKeys });

    report("the workflow ends with a TASK GUARD block — the one thing rhTruncatePrompt never cuts",
      trunc.guarded, "no guard: on a capped model the locks would be the first thing dropped");
    report("every model that can carry two images keeps the whole contract, however hard it caps the prompt",
      trunc.lost.length === 0,
      trunc.lost.length + " would arrive without it: " + trunc.lost.join(", "));
    console.log("      (" + trunc.total + " two-image models, " + trunc.capped
      + " of them cap this " + trunc.chars + "-character prompt; the tightest cap is " + trunc.smallest + ")");

    /* ---- 4. the last screen before the money says the prompt will be cut ---- */
    const warn = await page.evaluate(async ({ id, png }) => {
      window.scrollTo = function () { };
      Element.prototype.scrollIntoView = function () { };
      state.refs[0] = { mime: "image/png", b64: png, label: "subject" };
      state.refs[1] = { mime: "image/png", b64: png, label: "reference" };
      window.openWorkflowById(id);
      const nav = () => { const b = document.querySelectorAll("#wiz .wiz-nav .btn"); b[b.length - 1].click(); };
      nav(); nav();                                   /* step 1 -> 2 -> 3 */
      const sel = document.getElementById("wiz_selModel");
      const foot = () => (document.getElementById("wizFoot") || {}).textContent || "";
      if (!sel) return { err: "the wizard never reached its last screen" };
      function at(mid) {
        const s2 = document.getElementById("wiz_selModel");
        if (!s2 || !s2.querySelector('option[value="' + mid + '"]')) return null;
        s2.value = mid; s2.onchange();
        return foot();
      }
      return { tight: at("qwen-image-2"), roomy: at("nano-banana-pro") };
    }, { id: ID, png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" });
    report("the wizard reaches its last screen with both images loaded",
      !warn.err, warn.err);
    report("on a model that caps the prompt, that screen says so before any credit is spent — how much is cut, that the guard survives, and which model takes the whole thing",
      warn.tight === null || (/✂/.test(warn.tight) && /800/.test(warn.tight) && /TASK GUARD/.test(warn.tight)),
      "footer said: " + String(warn.tight).slice(0, 260));
    report("and it stays quiet on a model that takes the whole thing",
      warn.roomy === null || !/✂/.test(warn.roomy), "footer said: " + String(warn.roomy).slice(0, 200));

    /* ---- 5. the card art is either drawn or honestly declared absent ---- */
    const jpg = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
    /* cardImg is set on the composed CATEGORY item, not on the raw catalog
       entry, so ask the app's own accessor rather than the source list. */
    const declared = await page.evaluate(id => {
      const w = LW.workflows.filter(x => x.id === id)[0];
      return { cardImg: window._wfCardImgById(id) || "", visual: w.visual || "" };
    }, ID);
    const hasJpg = fs.existsSync(jpg);
    /* _wfCardImgById falls back to the generated SVG when there is no
       photograph, so "asks for a jpg" is the test, not "asks for anything". */
    const asksJpg = /lib\/wf\/cards5\//.test(declared.cardImg);
    report("the card either has its photograph on disk, or asks for no photograph at all — never a guaranteed 404",
      hasJpg === asksJpg, JSON.stringify({ onDisk: hasJpg, requested: declared.cardImg.slice(0, 60) }));
    report("the guide carries a reference plate that exists",
      !!declared.visual && fs.existsSync(path.join(ROOT, "docs", "app", "lib", "ui", declared.visual)),
      declared.visual || "no visual");

    report("the page raises no error while all of this runs", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — the same reference would not give the same look.`
    : "\nAll checks passed — one reference, any photo, the same look, on every model that can take two images.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
