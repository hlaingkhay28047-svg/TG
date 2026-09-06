/* v6.26.0 — FREEFORM SLOTS FOLLOW THE MODEL.
   Owner: "freeform page မှာ models အလိုက် image slots တွေ … nano banana က reference 10 ပုံအထက်ရရတာမျိုး …
   သူ့ဟာသူ reference ဘယ်နှစ်ခုထိ ရတယ်ဆိုတာမျိုး".
   Every RH_MODELS entry carries maxImages MEASURED by the probe lane (price-preview at 1..14 reference photos,
   RunningHub quoting its own ceiling in the refusal). The Create strip and the Library IMAGES grid grow past the
   base three to that number, one empty slot at a time; the dispatch sends every filled slot up to the capacity
   and says so when it left some out. Also pinned here: wan-2.5 image-edit sends its REQUIRED n, the node-keyed
   T2I create site reads every task-id shape, and the panel carries the same slots, capacities and n. */
const fs = require("fs"), path = require("path");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const PANEL = fs.readFileSync(path.join(ROOT, "panel/main.js"), "utf8");
const PCFG = fs.readFileSync(path.join(ROOT, "panel/src/providers/runninghub-config.js"), "utf8");
const PADP = fs.readFileSync(path.join(ROOT, "panel/src/providers/runninghub-enterprise-adapter.js"), "utf8");
const PCSS = fs.readFileSync(path.join(ROOT, "panel/styles.css"), "utf8");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 520)));
  if (!ok) failures++;
}
/* the measured table (probe run #12, 2026-09-06): RunningHub's own "maximum number of inputs" per endpoint */
const MEASURED = { "nano-banana-2": 10, "nano-banana-2-off": 14, "nano-banana-pro": 10, "nano-banana-pro-off": 10, "nano-banana-pro-ultra": 10,
  "nano-banana-v1": 5, "nano-banana-v1-off": 5, "nano-banana-2-lite-off": 4, "nano-banana-2-lite": 10, "rh-image-g2": 10, "rh-image-g2-off": 10,
  "gpt-image-15-off": 10, "qwen-image-2": 3, "qwen-image-2-pro": 3, "qwen-image-3": 3, "qwen-image-3-pro": 3, "wan-image-edit": 9, "wan-image-edit-pro": 9,
  "wan-25-image": 3, "seedream-v4": 10, "seedream-v4-5": 10, "seedream-v5-lite": 10, "seedream-v5-pro": 10, "dola-seedream-5-pro": 10, "jimeng-46": 14,
  "qwen-edit-2511": 3, "upscale-pro": 1, "rh-image-x-off": 1, "grok-image-i2i": 1, "z-image-turbo": 1, "flux-2-dev": 1, "topaz-gp-standard": 1 };

/* ---- A) the catalog carries its measured capacities ---- */
const imStart = APP.indexOf("var RH_MODELS = ["), imEnd = APP.indexOf("\n];", imStart);
const entries = APP.slice(imStart, imEnd).split("\n").filter(l => /^  \{ id:"/.test(l));
const capOf = {}; entries.forEach(l => { const id = /id:"([^"]+)"/.exec(l)[1]; const m = /maxImages:(\d+)/.exec(l); capOf[id] = m ? +m[1] : null; });
report("A) every RH_MODELS entry carries maxImages, and the measured ones read exactly what RunningHub quoted (Nano Banana 10, Qwen 3, Wan 2.7 edit 9, Wan 2.5 3, Nano v1 5, Lite official 4, Jimeng 14; single-image kinds 1)",
  entries.length >= 45 && Object.values(capOf).every(v => typeof v === "number" && v >= 1) && Object.keys(MEASURED).every(id => capOf[id] === MEASURED[id]),
  { entries: entries.length, missing: Object.keys(capOf).filter(k => !capOf[k]), off: Object.keys(MEASURED).filter(id => capOf[id] !== MEASURED[id]).map(id => [id, capOf[id]]) });
report("A2) the helpers: ffRefMax (single-image kinds 1, node graphs their slot count, else maxImages), ffSlotsShown (base three, then the filled extras plus one empty), ffAllRefs, ffCapLabel; What's New names the wave",
  /function ffRefMax\(m\)\{/.test(APP) && /function ffSlotsShown\(mx\)\{/.test(APP) && /function ffAllRefs\(mx\)\{/.test(APP) && /function ffCapLabel\(m\)\{/.test(APP) &&
  /k==="node"&&m\.node&&m\.node\.images\) return m\.node\.images\.length;/.test(APP) && /return \(m\.maxImages\|0\)>0 \? m\.maxImages : RB;/.test(APP) &&
  /\{ v:"6\.26\.0", kind:"page", ref:"pgCreate",/.test(APP), null);
report("A3) the Create strip grows with the image model (refStrip branch, rs-ref tiles on refGet/refSet, a capacity line), the Library grid grows the same way, the model dropdown repaints the slots, the strip wraps",
  /if\(hostId==="refStrip" && typeof ffRefMax==="function"\)\{\s*var fmx=ffRefMax\(\), fshown=ffSlotsShown\(fmx\);/.test(APP) && /d=el\("div","rs rs-face rs-ref"\+\(ref\?" filled":""\)\)/.test(APP) &&
  /host\.appendChild\(el\("div","note cap",\(cm\.label\|\|cm\.id\)\+" · "\+ffCapLabel\(cm\)\)\)/.test(APP) &&
  /var gmx=\(typeof ffRefMax==="function"\)\?ffRefMax\(\):3, gshown=\(typeof ffSlotsShown==="function"\)\?ffSlotsShown\(gmx\):3;/.test(APP) && /\}\)\(refGet\(gi\),gi\); \}\n\}\nrenderRefs\(\);/.test(APP) &&
  /updateGenOptsForRHKind\(\);\n    try\{ renderRefs\(\); \}catch\(e0\)\{\} \/\* v6\.26\.0/.test(APP) &&
  /\.refstrip\{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px\}/.test(APP) && /\.refstrip \.note\{flex:1 1 100%;/.test(APP) && /\.refstrip \.note\.cap\{/.test(APP), null);
report("A4) the dispatch sends every filled slot up to the model's capacity (ffAllRefs → slice) and names the model when it left some out; the role lines follow the slots that were sent",
  /var ffMx=ffRefMax\(rhActive\), ffAll=ffAllRefs\(ffMx\), ffSent=ffAll\.slice\(0, Math\.max\(ffMx,1\)\), refs=ffSent\.map\(function\(x\)\{ return x\.ref; \}\);/.test(APP) &&
  /if\(ffAll\.length>ffSent\.length\) toast\(/.test(APP) && /ffSent\.forEach\(function\(x\)\{\n      var slot=x\.slot;\n      roleIdx\+\+;/.test(APP) && !/var refs=state\.refs\.filter\(Boolean\);/.test(APP), null);
report("A5) wan-2.5 image-edit sends its REQUIRED n; the node-keyed T2I create site reads every task-id shape and keeps the refusal text",
  /var w25=RH_WAN25I_SIZE\[ratio\]; if\(w25\) body\.size=w25;\n[\s\S]{0,400}body\.n=1;/.test(APP) &&
  /var tidN=rhV2TaskIdOf\(jN\);\n    if\(!rN\.ok \|\| !tidN\)\{ var eN=new Error\("submit-failed"\); eN\.status=rN\.status; eN\.body=jN; eN\.raw=String\(tN\|\|""\)\.slice\(0,300\); throw eN; \}\n    return tidN;/.test(APP) &&
  !/if\(!rN\.ok \|\| !jN \|\| !jN\.taskId\)/.test(APP), null);
/* ---- P) the panel carries the same ---- */
const pcfgCaps = {}; (PCFG.match(/^\s+"([^"]+)":\s+\{ apiPath: "[^"]+"[^\n]*maxImages: (\d+)/gm) || []).forEach(l => { const m = /"([^"]+)":\s+\{[^\n]*maxImages: (\d+)/.exec(l); pcfgCaps[m[1]] = +m[2]; });
report("A6) the node graphs speak flat (probe runs #14/#15): one branch for fluxedit / zimage / node builds imageUrl (+imageUrl2/3), prompt, aspectRatio (ratio or auto), outputFormat png; Grok Imagine Quality Edit sends imageUrl as a one-element list; the panel adapter mirrors both",
  /if\(cfg\.kind==="fluxedit"\|\|cfg\.kind==="zimage"\|\|cfg\.kind==="node"\)\{/.test(APP) && /fb\.aspectRatio = RH_NODE_RATIO_MAP\[ratio\] \? ratio : \(autoOk \? "auto" : "1:1"\);/.test(APP) &&
  /for\(var fq=1;fq<slots&&fq<imageUrls\.length;fq\+\+\) fb\["imageUrl"\+\(fq\+1\)\]=imageUrls\[fq\];/.test(APP) && !/fx\["51##image"\]=imageUrls\[0\]/.test(APP) && !/nb2\[nn\.images\[qi\]\]=imageUrls\[qi\]/.test(APP) &&
  /body\.imageUrl=imageUrls\.slice\(0,1\);/.test(APP) &&
  /if \(mc\.kind === "fluxedit" \|\| mc\.kind === "zimage" \|\| mc\.kind === "node"\) \{/.test(PADP) && /fb\.aspectRatio = RH_NODE_RATIO_MAP\[ratio\] \? ratio : \(autoOk \? "auto" : "1:1"\);/.test(PADP) && /body\.imageUrl = uploadedUrls\.slice\(0, 1\);/.test(PADP) && !/nb2\[nn\.images\[qi\]\] = uploadedUrls\[qi\]/.test(PADP), null);
report("A7) the node-keyed text-to-image graphs speak flat too (prompt + aspectRatio + outputFormat png, app and adapter); Size tiers follow the model (rhNarrowSizeOptionsFor / ffNarrowSize, 8k accepted); the honesty test measures the offered tiers",
  /var nb=\{ prompt: model\.promptMax \? String\(promptText\|\|""\)\.slice\(0, model\.promptMax\) : \(promptText\|\|""\) \};/.test(APP) && /nb\.aspectRatio = nr; nb\.outputFormat = "png";/.test(APP) && !/nb\[model\.nodeKeys\.prompt\]/.test(APP) &&
  /nbT\.aspectRatio = nrT; nbT\.outputFormat = "png";/.test(PADP) && !/nbT\[mc\.t2iNodeKeys\.prompt\]/.test(PADP) &&
  /function rhNarrowSizeOptionsFor\(active\)\{/.test(APP) && /rhNarrowSizeOptionsFor\(active\);/.test(APP) && /s==="8k"\) \? s : "1k"/.test(APP) && /body\.resolution = String\(resolution\|\|"1k"\)\.toLowerCase\(\);/.test(APP) &&
  /function ffNarrowSize\(m\) \{/.test(PANEL) && /ffNarrowSize\(m\);/.test(PANEL) && /s === "8k"\) \? s : "1k"/.test(PADP) &&
  /const sizesOffered = Array\.from\(document\.getElementById\("selSize"\)\.options\)/.test(fs.readFileSync(path.join(ROOT, "test/verify_size_ratio_honesty.js"), "utf8")), null);
report("P) the panel's runninghub-config carries the same measured capacities, its adapter sends wan-2.5's n, and main.js grows the Create strip + IMAGES grid, sends IMG 4+ with the Freeform run and repaints on a model change",
  ["nano-banana-2", "nano-banana-pro", "qwen-image-2", "wan-image-edit", "wan-25-image", "nano-banana-v1", "jimeng-46", "seedream-v5-pro"].every(id => pcfgCaps[id] === MEASURED[id]) &&
  /var w25 = RH_WAN25I_SIZE\[ratio\]; if \(w25\) body\.size = w25;\n    body\.n = 1;/.test(PADP) &&
  /function ffRefMaxP\(m\) \{/.test(PANEL) && /function ffSlotsShownP\(mx\) \{/.test(PANEL) && /function ffExtraRefs\(\) \{/.test(PANEL) &&
  /if \(hostId === "refStrip"\) \{\s*const fmx = ffRefMaxP\(\), fshown = ffSlotsShownP\(fmx\);/.test(PANEL) && /for \(let i = 0; i < ffSlotsShownP\(ffRefMaxP\(\)\); i\+\+\) \{/.test(PANEL) &&
  /if \(!noRefs\) \{ const xs = ffExtraRefs\(\); for \(let x = 0; x < xs\.length; x\+\+\) \{ parts\.push/.test(PANEL) && /state\.rhModel = m\.id;\n  try \{ renderRefs\(\); \} catch \(e0\) \{ \}/.test(PANEL) &&
  /\.apg \.refstrip \{ display: flex; flex-direction: row; flex-wrap: wrap;/.test(PCSS) && /\.apg \.refstrip \.note\.cap \{/.test(PCSS), { pcfg: Object.keys(pcfgCaps).length });
report("CI runs this", /node test\/verify_freeform_slots\.js/.test(CI), null);

/* ---- B) driven ---- */
(async () => {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  try {
    withPremium(browser);
    const page = await browser.newPage({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const r = await page.evaluate(async (PX) => {
      switchPage("pgCreate");
      const out = {};
      const strip = () => Array.from(document.querySelectorAll("#refStrip .rs")).map(d => d.querySelector(".tag").textContent);
      const cap = () => (document.querySelector("#refStrip .note.cap") || {}).textContent || "";
      const grid = () => document.querySelectorAll("#refs .ref").length;
      const pick = (id) => { const c = rhCfg(); c.activeModel = id; rhSaveCfg(c); $("selModel").value = id; try { updateGenOptsForRHKind(); } catch (e) {} renderRefs(); };
      state.refs = [null, null, null]; state.vidRefs = []; state.imgRoles = null;
      pick("nano-banana-pro"); out.nbp = { strip: strip(), cap: cap(), grid: grid(), max: ffRefMax() };
      pick("qwen-image-2"); out.qwen = { strip: strip(), cap: cap(), grid: grid(), max: ffRefMax() };
      pick("rh-image-x-off"); out.xedit = { strip: strip(), cap: cap(), max: ffRefMax() };
      pick("nano-banana-pro");
      for (let s = 0; s < 4; s++) refSet(s, { mime: "image/png", b64: PX, label: "t" + s }); renderRefs();
      out.four = { strip: strip(), all: ffAllRefs(ffRefMax()).map(x => x.slot), grid: grid() };
      for (let s = 4; s < 10; s++) refSet(s, { mime: "image/png", b64: PX, label: "t" + s }); renderRefs();
      out.ten = { strip: strip(), all: ffAllRefs(ffRefMax()).length };
      pick("qwen-image-2"); out.qwenFull = { strip: strip(), sent: ffAllRefs(ffRefMax()).slice(0, ffRefMax()).length, all: ffAllRefs(ffRefMax()).length };
      /* the body wan-2.5 gets */
      out.wan = rhV2Body("alibaba/wan-2.5-preview/image-to-image", ["https://x/1.jpg"], "p", "2:3", "1k", rhModelDef("wan-25-image"));
      /* the flat node bodies + the imagine list, straight from rhV2Body */
      out.nodes = {
        z45: rhV2Body("rhart-image/z-image-turbo/image-to-image", ["https://x/1.jpg"], "p", "4:5", "1k", rhModelDef("z-image-turbo")),
        z169: rhV2Body("rhart-image/z-image-turbo/image-to-image", ["https://x/1.jpg"], "p", "16:9", "1k", rhModelDef("z-image-turbo")),
        fluxAuto: rhV2Body("rhart-image/f-2-dev/edit-lora", ["https://x/1.jpg"], "p", "", "1k", rhModelDef("flux-2-dev")),
        q3: rhV2Body("rhart-image/qwen-image/edit-2511", ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg", "https://x/4.jpg"], "p", "3:4", "1k", rhModelDef("qwen-edit-2511")),
        wan22: rhV2Body("rhart-video/wan-2.2/image-to-image", ["https://x/1.jpg"], "p", "", "1k", rhModelDef("wan-22-image")),
        imagine: rhV2Body("rhart-imagine-image-quality/edit", ["https://x/1.jpg", "https://x/2.jpg"], "p", "16:9", "2k", rhModelDef("rh-imagine-quality-edit")),
        ultra: rhV2Body("rhart-image-n-pro-official/edit-ultra", ["https://x/1.jpg"], "p", "1:1", "1k", rhModelDef("nano-banana-pro-ultra"))
      };
      /* Size tiers follow the model: Pro Ultra offers Auto · 4K · 8K, everything else the stock four */
      pick("nano-banana-pro-ultra"); const ultraSizes = Array.from($("selSize").options).map(o => o.value);
      $("selSize").value = "8K"; out.ultraBody = rhV2Body("rhart-image-n-pro-official/edit-ultra", ["https://x/1.jpg"], "p", "1:1", rhV2Resolution($("selSize").value), rhModelDef("nano-banana-pro-ultra"));
      pick("nano-banana-pro"); const stockSizes = Array.from($("selSize").options).map(o => o.value);
      out.sizes = { ultra: ultraSizes, stock: stockSizes };
      /* remove an extra through its × and the strip shrinks back */
      pick("nano-banana-pro");
      for (let s = 4; s < 10; s++) refSet(s, null); renderRefs();
      document.querySelector("#refStrip .rs.rs-ref .rsx").click();
      out.afterX = { strip: strip(), v3: !!state.vidRefs[0] };
      /* a real GENERATE through a stubbed fetch: the submit body carries every filled slot up to the capacity */
      pick("qwen-image-2"); state.refs = [null, null, null]; state.vidRefs = [];
      for (let s = 0; s < 5; s++) refSet(s, { mime: "image/png", b64: PX, label: "t" + s }); renderRefs();
      state.rhKey = "k-test"; $("prompt").value = "Soft studio light, natural skin.";
      const calls = []; const orig = window.fetch;
      window.fetch = async (u, o) => {
        const url = String(u); calls.push({ url, body: o && typeof o.body === "string" ? JSON.parse(o.body) : null });
        if (/media\/upload/.test(url)) return new Response(JSON.stringify({ code: 0, data: { download_url: "https://up.invalid/" + calls.length + ".png" } }), { status: 200 });
        if (/image-edit$/.test(url)) return new Response(JSON.stringify({ code: 0, msg: "", taskId: "" }), { status: 400 });
        return new Response("{}", { status: 200 });
      };
      try { $("btnGen").click(); for (let w = 0; w < 80 && !calls.some(c => /image-edit$/.test(c.url)); w++) await new Promise(r => setTimeout(r, 50)); }
      finally { window.fetch = orig; }
      const sub = calls.find(c => /image-edit$/.test(c.url));
      out.gen = { uploads: calls.filter(c => /media\/upload/.test(c.url)).length, imgs: sub && sub.body && sub.body.imageUrls ? sub.body.imageUrls.length : -1, roles: sub && sub.body ? (sub.body.prompt.match(/IMAGE \d+ = /g) || []).length : -1 };
      return out;
    }, PX);
    report("B) Nano Banana Pro (10): the strip shows the base three plus ONE empty extra (IMG 4), the grid too, and the capacity line names the model and its ten",
      r.nbp.max === 10 && r.nbp.strip.join() === "IMG 1,IMG 2,IMG 3,IMG 4" && r.nbp.grid === 4 && /Nano Banana Pro/.test(r.nbp.cap) && /(10|၁၀)/.test(r.nbp.cap), r.nbp);
    report("B2) Qwen Image 2 (3): exactly the base three, capacity line says three; Grok Imagine Edit (1 image): base three, capacity line says one photo",
      r.qwen.max === 3 && r.qwen.strip.length === 3 && r.qwen.grid === 3 && /(3|၃)/.test(r.qwen.cap) && r.xedit.max === 1 && r.xedit.strip.length === 3 && /(1 photo|၁ ပုံ)/.test(r.xedit.cap), { qwen: r.qwen, xedit: r.xedit });
    report("B3) filling IMG 1–4 opens IMG 5; ten filled stays at ten (no eleventh); switching to Qwen keeps the photos but the run would send only its three",
      r.four.strip.length === 5 && r.four.all.join() === "0,1,2,3" && r.four.grid === 5 && r.ten.strip.length === 10 && r.ten.all === 10 && r.qwenFull.strip.length === 3 && r.qwenFull.sent === 3 && r.qwenFull.all === 3, { four: r.four, ten: r.ten, qwenFull: r.qwenFull });
    report("B4) wan-2.5 image-edit body: imageUrls + prompt + size + n:1", r.wan && r.wan.n === 1 && Array.isArray(r.wan.imageUrls) && r.wan.size === "800*1200" && r.wan.prompt === "p", r.wan);
    report("B5) removing an extra through its × frees the slot and the strip shrinks back to the base three plus one empty", r.afterX.strip.length === 4 && r.afterX.v3 === false, r.afterX);
    report("B6) a GENERATE on Qwen Image 2 with five photos filled uploads and submits exactly its three (imageUrls length 3, three role lines) — through the real dispatch under a stubbed fetch",
      r.gen.uploads === 3 && r.gen.imgs === 3 && r.gen.roles === 3, r.gen);
    const N = r.nodes;
    report("B8) rhV2Body: z-image 4:5 → {imageUrl, prompt, aspectRatio 1:1, outputFormat png} and 16:9 rides as itself; flux-2-dev Auto → \"auto\"; qwen edit-2511 with four photos → imageUrl/imageUrl2/imageUrl3 (its three slots) at 3:4; wan-2.2 Auto → auto; Grok Imagine Quality Edit → imageUrl as a one-element list; Pro Ultra on 1k → 4k (its lowest tier)",
      N.z45.aspectRatio === "1:1" && N.z45.outputFormat === "png" && N.z45.imageUrl === "https://x/1.jpg" && N.z45.prompt === "p" && N.z45["66##image"] === undefined && Object.keys(N.z45).sort().join() === "aspectRatio,imageUrl,outputFormat,prompt" &&
      N.z169.aspectRatio === "16:9" && N.fluxAuto.aspectRatio === "auto" && N.fluxAuto["51##image"] === undefined &&
      N.q3.imageUrl === "https://x/1.jpg" && N.q3.imageUrl2 === "https://x/2.jpg" && N.q3.imageUrl3 === "https://x/3.jpg" && N.q3.imageUrl4 === undefined && N.q3.aspectRatio === "3:4" && N.q3.imageUrls === undefined &&
      N.wan22.aspectRatio === "auto" && Array.isArray(N.imagine.imageUrl) && N.imagine.imageUrl.length === 1 && N.imagine.imageUrls === undefined && N.imagine.resolution === "2k" &&
      N.ultra.resolution === "4k" && Array.isArray(N.ultra.imageUrls), N);
    report("B9) the Size picker on Nano Banana Pro Ultra offers Auto · 4K · 8K and an 8K pick reaches the body as 8k; back on Nano Banana Pro the stock Auto · 1K · 2K · 4K return",
      r.sizes.ultra.join() === ",4K,8K" && r.ultraBody.resolution === "8k" && r.sizes.stock.join() === ",1K,2K,4K", r.sizes);
    report("B7) no page error while the slots were driven", errs.length === 0, errs.slice(0, 3));
  } finally { await browser.close(); }
  console.log(failures ? failures + " FAILED" : "ALL PASS");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
