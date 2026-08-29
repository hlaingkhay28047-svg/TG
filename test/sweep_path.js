/* Mocked regression sweep for PATH RETOUCH (pgPath) — the batch-look page.
   Structure mirrors sweep_v428_upgrades.js: one page, mocked network,
   report(name, ok, extra) lines, hard exit code, pageerror capture.

   Covers, in spec §5 order:
     1  page renders    switchPage("pgPath"), hero copy, 5 Edit subtabs
     2  multi-pick      ptIngestDataUrls seeds N cells, all queued, #ptCount
     3  look -> all     one look writes the SAME css filter on every thumb
     4  prompt honesty  #ptPromptPreview == what the run sends; fx toggles show
     5  mocked batch    N requests, prompt+image in each, badges done, Gallery
                        grew by N, shared selects/refs/#prompt all restored
     6  per-photo look  an override only reshapes that photo's request
     7  Stop            halts the queue, un-runs the in-flight cell, frees busy
     8  error continues one 500 marks that cell error, the rest still run
     9  re-entrancy     a double tap during flight fires no second request
     10 ZIP integrity   ptZip bytes: PK\x03\x04, N local headers, EOCD count N
     11 no overflow     320 and 390 wide with 9 photos seeded
     12 ingest + errors  empty-grid tap opens the picker, a real 3-file pick
                        lands 3 cells, and no pageerror fired all sweep

   Usage: PORT=8931 node test/sweep_path.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", e => { pageErrors.push(String(e).slice(0, 300)); console.log("PAGEERROR:", String(e).slice(0, 300)); });

  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.addInitScript(`
    window.__reqs = [];        // recorded RunningHub model SUBMITS (v5.50.0 — the one engine)
    window.__rhDelay = 60;     // ms each submit stalls (Stop / re-entrancy windows)
    window.__failAt = -1;      // 0-based submit index that answers HTTP 500
    window.__pickN = 0;        // #ptFilePick.click() spy
    const realFetch = window.fetch;
    function png(){
      var bin = atob("${B64}"), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}});
    }
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("mock.runninghub.test") >= 0) return Promise.resolve(png());
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      if (u.indexOf("/media/upload/binary") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{download_url:"https://mock.runninghub.test/up.png",fileName:"openapi/up.png"}}), {status:200}));
      if (u.indexOf("/openapi/v2/query") >= 0)
        return Promise.resolve(new Response(JSON.stringify({taskId:"t1",status:"SUCCESS",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png"}]}), {status:200}));
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      var body = null; try { body = JSON.parse(opts.body); } catch(e) {}
      var idx = window.__reqs.length;
      window.__reqs.push({ url: u, body: body });
      var res;
      if (idx === window.__failAt) {
        res = new Response(JSON.stringify({code:500,message:"mock server error"}), {status:500});
      } else {
        res = new Response(JSON.stringify({taskId:"t1",status:"RUNNING"}), {status:200});
      }
      return new Promise(function(ok){ setTimeout(function(){ ok(res); }, window.__rhDelay); });
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.rhKey = "TEST_KEY";
    window.scrollTo = function(){};
    Element.prototype.scrollIntoView = function(){};
    document.getElementById("ptFilePick").click = function(){ window.__pickN++; };
    /* seed helper + gallery counter used by several checks below.
       v5.50.0 — the dataUrl must be REAL base64 now: the RunningHub flow
       atob()s it for the upload, unlike the old Gemini flow which passed the
       string through untouched. This function body is serialized by
       page.evaluate, so "${B64}" here would be a literal — the real bytes
       arrive via window.__B64 (set right after this evaluate). */
    window.__seed = function(n, from){
      const du = "data:image/png;base64," + window.__B64;
      const list = [];
      for (let i = 0; i < n; i++) list.push({ name: "wed-" + ((from||0) + i + 1) + ".jpg", dataUrl: du });
      return ptIngestDataUrls(list);
    };
    window.__reset = function(){
      PT.photos = []; PT.logLines = []; PT.sheetIdx = -1; PT.ref = null;
      state.pt.look = "pt_foliage"; state.pt.tier = "fast";
      state.pt.fx = { blur:"off", fg:"off", sync:false, proLight:true, frame:"off" };
      state.pt.custom = "";
      window.__reqs = []; window.__failAt = -1; window.__rhDelay = 60;
      ptSync();
    };
    window.__galCount = function(){
      return galDb().then(function(d){
        return new Promise(function(res){
          d.transaction("gal").objectStore("gal").count().onsuccess = function(e){ res(e.target.result); };
        });
      });
    };
  });
  /* the seed helper needs the real B64 — addInitScript templating above put it
     in the page source, this line just proves it resolved */
  await page.evaluate(b64 => { window.__B64 = b64; }, B64);

  let allOk = true;
  function report(name, ok, extra){
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }
  /* v5.50.0 — the captured request is a RunningHub submit: the prompt is a
     plain body field and the image rides as the uploaded file's URL */
  const joinedText = r => String((r && r.body && r.body.prompt) || "");
  const hasImage = r => {
    const b = (r && r.body) || {};
    return (Array.isArray(b.imageUrls) && b.imageUrls.length > 0) || !!b.image || !!b.imageUrl;
  };

  // ---------------------------------------------------------------- 1
  const r1 = await page.evaluate(() => {
    switchPage("pgPath");
    const pg = document.getElementById("pgPath");
    return {
      on: pg.className.indexOf("on") >= 0,
      offsetOk: pg.offsetParent !== null || getComputedStyle(pg).display !== "none",
      hero: (document.getElementById("phPath").textContent || "").trim(),
      subtabs: [...document.querySelectorAll("#subtabbar .subtab")].map(b => b.textContent.trim()),
      inPages: PAGES.some(p => p[0] === "pgPath" && p[1] === "i-stack"),
      sprite: !!document.querySelector('symbol#i-stack'),
      lookCount: Object.keys(PT_LOOKS).length
    };
  });
  /* v4.96 split the single pgStudio page into pgMeitu + pgEvoto, so the Edit
     group's roster went from ["pgCreate","pgStudio","pgRetouch","pgPath"] to
     ["pgCreate","pgMeitu","pgEvoto","pgRetouch","pgPath"] — 5 subtabs, not 4.
     The count is still exact; the two new siblings are named so the number is
     pinned to that split rather than to an arbitrary total. */
  report("1 page renders: pgPath is switchable and visible, its hero headline is non-empty, the Edit group now carries 5 subtabs (Meitu and Evoto having replaced the merged Studio page) including Path, and the new i-stack sprite symbol exists",
    r1.on && r1.offsetOk && r1.hero.length > 4 && r1.subtabs.length === 5 && r1.subtabs.some(s => /Path/.test(s))
      && r1.subtabs.some(s => /Meitu/.test(s)) && r1.subtabs.some(s => /Evoto/.test(s))
      && r1.inPages && r1.sprite && r1.lookCount === 12,
    JSON.stringify(r1));

  // ---------------------------------------------------------------- 2
  const r2 = await page.evaluate(() => {
    window.__reset();
    const added = window.__seed(5);
    const cells = [...document.querySelectorAll("#ptGrid .pt-th")];
    return {
      added,
      cells: cells.length,
      badges: [...document.querySelectorAll("#ptGrid .pt-badge")].map(b => b.className.replace("pt-badge ", "")),
      count: document.getElementById("ptCount").textContent,
      hasFive: /5/.test(document.getElementById("ptCount").textContent),
      emptyHidden: document.getElementById("ptEmpty").style.display === "none",
      photos: PT.photos.length,
      /* session-only contract: the persisted blob must carry look/tier/fx and
         no image bytes at all */
      persisted: (function(){
        var raw = localStorage.getItem("hnk_web_studio_v2_state") || "";
        var o = {}; try { o = JSON.parse(raw); } catch(e) {}
        return raw.indexOf("data:image") < 0 && raw.indexOf(PT.photos[0].srcDataUrl.slice(24, 60)) < 0
          && !!o.pt && o.pt.look === "pt_foliage" && !("photos" in o.pt);
      })()
    };
  });
  report("2 multi-pick seeds N photos: ptIngestDataUrls(5) builds 5 .pt-th cells, every badge reads queued, #ptCount shows 5, the empty state hides, and no photo data reached localStorage",
    r2.added === 5 && r2.cells === 5 && r2.badges.length === 5 && r2.badges.every(b => b === "queued") && r2.hasFive && r2.emptyHidden && r2.persisted,
    JSON.stringify(r2));

  // ---------------------------------------------------------------- 3
  const r3 = await page.evaluate(() => {
    /* the browser normalises style.filter, so compare against a probe element
       fed the same stCssFilter() string rather than against the raw text */
    function norm(css){ const d = document.createElement("div"); d.style.filter = css; return d.style.filter; }
    const pick = id => [...document.querySelectorAll("#ptLookRail .pcard")]
      .find(c => (c.title || "") === L9(PT_LOOKS[id].name));
    pick("pt_foliage").onclick();
    const fol = [...document.querySelectorAll("#ptGrid .pt-th img")].map(i => i.style.filter);
    const folWant = norm(stCssFilter(PT_LOOKS.pt_foliage.t1));
    const folOn = [...document.querySelectorAll("#ptLookRail .pcard.on")].map(c => c.title);
    pick("pt_mono").onclick();
    const mono = [...document.querySelectorAll("#ptGrid .pt-th img")].map(i => i.style.filter);
    const monoWant = norm(stCssFilter(PT_LOOKS.pt_mono.t1));
    const monoOn = [...document.querySelectorAll("#ptLookRail .pcard.on")].map(c => c.title);
    pick("pt_foliage").onclick();
    return {
      folAllSet: fol.every(f => !!f), folAllMatch: fol.every(f => f === folWant),
      monoAllMatch: mono.every(f => f === monoWant),
      changed: fol[0] !== mono[0],
      folOnCount: folOn.length, monoOnCount: monoOn.length,
      monoOnIsMono: monoOn[0] === L9(PT_LOOKS.pt_mono.name)
    };
  });
  report("3 one look previews on EVERY thumbnail: selecting pt_foliage writes the exact stCssFilter(PT_LOOKS.pt_foliage.t1) onto all 5 imgs, switching to pt_mono changes all 5, and exactly one .pcard carries .on each time",
    r3.folAllSet && r3.folAllMatch && r3.monoAllMatch && r3.changed && r3.folOnCount === 1 && r3.monoOnCount === 1 && r3.monoOnIsMono,
    JSON.stringify(r3));

  // ---------------------------------------------------------------- 4
  const r4 = await page.evaluate(() => {
    const pre = document.getElementById("ptPromptPreview");
    const withPro = pre.textContent;
    const proSentence = PT_FX.proLight.frag();
    state.pt.fx.proLight = false; ptSync();
    const without = pre.textContent;
    state.pt.fx.blur = "f2.8"; ptSync();
    const withBlur = pre.textContent;
    state.pt.fx.blur = "off"; state.pt.fx.proLight = true; ptSync();
    return {
      hasFoliage: withPro.indexOf("dappled leaf-and-branch shadows") >= 0,
      hasPreserve: withPro.indexOf("PRESERVE EXACTLY:") >= 0 && withPro.indexOf("studio watermark or logo text") >= 0,
      hasFraming: withPro.indexOf("and the framing/crop") >= 0,
      proIn: withPro.indexOf(proSentence) >= 0,
      proOut: without.indexOf(proSentence) < 0,
      blurIn: withBlur.indexOf("f/2.8") >= 0,
      matchesRun: document.getElementById("ptPromptPreview").textContent === ptBuildPrompt(null),
      aiBadges: document.querySelectorAll("#pgPath .pt-ai").length
    };
  });
  report("4 prompt honesty: the live preview equals what a run would send, carries the foliage fragment plus the PRESERVE block (watermark + framing clauses), gains the f/2.8 line when Lens Blur is on, loses the Pro-relight sentence when it is switched off, and every AI-only control is badged",
    r4.hasFoliage && r4.hasPreserve && r4.hasFraming && r4.proIn && r4.proOut && r4.blurIn && r4.matchesRun && r4.aiBadges >= 6,
    JSON.stringify(r4));

  // ---------------------------------------------------------------- 5
  const r5 = await page.evaluate(async () => {
    window.__reset();
    window.__seed(5);
    const gal0 = await window.__galCount();
    /* make the pre-run values of every borrowed control distinctive.
       v5.50.0 — selQual left with Gemini (_forceQualityHigh is the internal
       replacement) and selModel is now the RH model picker whose value the
       run may legitimately re-sync, so the restored-controls pin covers the
       three the Path runner forces: Ratio (blanked), Count (forced 1),
       Size (tier). */
    document.getElementById("selRatio").value = "9:16";
    document.getElementById("selCount").value = "2";
    document.getElementById("selSize").value = "4K";
    document.getElementById("prompt").value = "MY FREEFORM PROMPT";
    state.refs = [{mime:"image/png", b64:"FREEFORMREF", label:"kept"}, null, null];
    const pre = ["selRatio","selCount","selSize"].map(id => document.getElementById(id).value);
    window.__reqs = [];
    await ptRunAll(null);
    const post = ["selRatio","selCount","selSize"].map(id => document.getElementById(id).value);
    const gal1 = await window.__galCount();
    return {
      reqs: window.__reqs.length,
      texts: window.__reqs.map(r => String(r.body.prompt || "")),
      images: window.__reqs.map(r => (Array.isArray(r.body.imageUrls) && r.body.imageUrls.length > 0) || !!r.body.image || !!r.body.imageUrl),
      models: window.__reqs.map(r => (r.url.match(/openapi\/v2\/(.+)$/) || [])[1]),
      badges: [...document.querySelectorAll("#ptGrid .pt-badge")].map(b => b.className.replace("pt-badge ", "")),
      galDelta: gal1 - gal0,
      selectsRestored: JSON.stringify(pre) === JSON.stringify(post),
      pre, post,
      promptRestored: document.getElementById("prompt").value === "MY FREEFORM PROMPT",
      refsRestored: !!state.refs[0] && state.refs[0].b64 === "FREEFORMREF" && !state.refs[1] && !state.refs[2],
      busy: PT.busy, rsBusy: rsBusy
    };
  });
  report("5 mocked batch generates N results: 5 photos -> 5 RunningHub fast-tier submits, each carrying the composed Path prompt AND its uploaded photo URL, all 5 badges land done, the Gallery grew by exactly 5 (no double-add), and every borrowed control (selRatio/Count/Size, #prompt, state.refs) is restored to its pre-run value",
    r5.reqs === 5 && r5.texts.every(t => t.indexOf("dappled leaf-and-branch shadows") >= 0 && t.indexOf("PRESERVE EXACTLY:") >= 0)
      && r5.images.every(Boolean) && r5.models.every(m => m === "rhart-image-n-g31-flash/image-to-image")
      && r5.badges.length === 5 && r5.badges.every(b => b === "done")
      && r5.galDelta === 5 && r5.selectsRestored && r5.promptRestored && r5.refsRestored && !r5.busy && !r5.rsBusy,
    JSON.stringify({ reqs: r5.reqs, badges: r5.badges, galDelta: r5.galDelta, models: r5.models, pre: r5.pre, post: r5.post, promptRestored: r5.promptRestored, refsRestored: r5.refsRestored }));

  // ---------------------------------------------------------------- 6
  const r6 = await page.evaluate(async () => {
    window.__reset();
    window.__seed(3);
    PT.photos[1].lookOverride = "pt_mono";
    ptSync();
    const thumbFilters = [...document.querySelectorAll("#ptGrid .pt-th img")].map(i => i.style.filter);
    window.__reqs = [];
    await ptRunAll(null);
    const texts = window.__reqs.map(r => String(r.body.prompt || ""));
    return {
      reqs: window.__reqs.length,
      p0Foliage: texts[0].indexOf("dappled leaf-and-branch shadows") >= 0,
      p1Mono: texts[1].indexOf("silver-gelatin contrast") >= 0 && texts[1].indexOf("dappled leaf-and-branch shadows") < 0,
      p1Header: texts[1].indexOf("'Mono Classic' look") >= 0,
      p2Foliage: texts[2].indexOf("dappled leaf-and-branch shadows") >= 0,
      previewDiffers: thumbFilters[0] !== thumbFilters[1] && thumbFilters[0] === thumbFilters[2]
    };
  });
  report("6 per-photo override: photo 2 set to pt_mono previews differently in the grid and sends the mono fragment (and its own header line) while photos 1 and 3 still send foliage",
    r6.reqs === 3 && r6.p0Foliage && r6.p1Mono && r6.p1Header && r6.p2Foliage && r6.previewDiffers,
    JSON.stringify(r6));

  // ---------------------------------------------------------------- 7
  const r7 = await page.evaluate(async () => {
    window.__reset();
    window.__seed(5);
    window.__rhDelay = 400;
    window.__reqs = [];
    const run = ptRunAll(null);
    /* let the first photo's request go out, then Stop */
    await new Promise(r => setTimeout(r, 500));
    const midReqs = window.__reqs.length;
    document.getElementById("btnPtStop").onclick();
    await run;
    const badges = [...document.querySelectorAll("#ptGrid .pt-badge")].map(b => b.className.replace("pt-badge ", ""));
    /* Run must be tappable again straight away */
    const runnable = !document.getElementById("btnPtRun").disabled;
    window.__rhDelay = 60;
    return {
      midReqs, total: window.__reqs.length,
      badges,
      noRunning: badges.every(b => b !== "running"),
      busy: PT.busy, rsBusy: rsBusy, runnable,
      status: document.getElementById("stPtGen").textContent,
      stopHidden: document.getElementById("btnPtStop").style.display === "none"
    };
  });
  report("7 Stop halts the queue: after the first response the Stop button ends the loop with fewer than 5 requests, no cell is left running (the in-flight one goes back to queued), PT.busy/rsBusy are released, the Stop button hides and Run is tappable again",
    r7.total < 5 && r7.total >= 1 && r7.noRunning && !r7.busy && !r7.rsBusy && r7.runnable && r7.stopHidden && !!r7.status,
    JSON.stringify(r7));

  // ---------------------------------------------------------------- 8
  const r8 = await page.evaluate(async () => {
    window.__reset();
    window.__seed(4);
    window.__failAt = 1;      // 2nd photo answers HTTP 500
    window.__reqs = [];
    await ptRunAll(null);
    const badges = [...document.querySelectorAll("#ptGrid .pt-badge")].map(b => b.className.replace("pt-badge ", ""));
    /* the failed cell offers a retry inside its sheet */
    ptOpenSheet(1);
    const retryShown = document.getElementById("btnPtRetryOne").style.display !== "none";
    const sheetOn = document.getElementById("ptSheet").className.indexOf("on") >= 0;
    ptCloseSheet();
    return { reqs: window.__reqs.length, badges, retryShown, sheetOn, log: document.getElementById("ptLog").textContent.split("\n").length };
  });
  report("8 one failure never sinks the queue: a mid-batch HTTP 500 marks only that photo error, the remaining photos still run (4 requests, 3 done + 1 error), and the failed cell's sheet offers Retry",
    r8.reqs === 4 && r8.badges.length === 4 && r8.badges[1] === "error"
      && r8.badges.filter(b => b === "done").length === 3 && r8.retryShown && r8.sheetOn,
    JSON.stringify(r8));

  // ---------------------------------------------------------------- 9
  const r9 = await page.evaluate(async () => {
    window.__reset();
    window.__seed(3);
    window.__rhDelay = 300;
    window.__reqs = [];
    const a = document.getElementById("btnPtRun").onclick();
    const b = document.getElementById("btnPtRun").onclick();   // double tap, same tick
    await new Promise(r => setTimeout(r, 120));
    const duringFirst = window.__reqs.length;
    /* the guarded call must return immediately (it never awaits a fetch),
       while the real pass is still mid-flight */
    const secondWasSwallowed = await Promise.race([
      Promise.resolve(b).then(() => true),
      new Promise(r => setTimeout(() => r(false), 40))
    ]);
    await a;
    window.__rhDelay = 60;
    return { duringFirst, total: window.__reqs.length, busy: PT.busy, secondWasSwallowed };
  });
  report("9 re-entrancy: a second Run tap while the first pass is in flight is swallowed by the shared rsBusy/PT.busy guard — only one request is open at a time and the batch still totals 3, not 6",
    r9.duringFirst === 1 && r9.total === 3 && !r9.busy && r9.secondWasSwallowed,
    JSON.stringify(r9));

  // ---------------------------------------------------------------- 10
  const r10 = await page.evaluate(() => {
    const entries = ptResultEntries();
    const bytes = ptZip(entries);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return { n: entries.length, names: entries.map(e => e.name), b64: btoa(s) };
  });
  const zip = Buffer.from(r10.b64, "base64");
  const countSig = sig => { let n = 0; for (let i = 0; i + 4 <= zip.length; i++) if (zip.readUInt32LE(i) === sig) n++; return n; };
  const eocdAt = (() => { for (let i = zip.length - 22; i >= 0; i--) if (zip.readUInt32LE(i) === 0x06054b50) return i; return -1; })();
  const eocdCount = eocdAt >= 0 ? zip.readUInt16LE(eocdAt + 10) : -1;
  const cdSize = eocdAt >= 0 ? zip.readUInt32LE(eocdAt + 12) : -1;
  const cdOff = eocdAt >= 0 ? zip.readUInt32LE(eocdAt + 16) : -1;
  report("10 ZIP integrity: the dependency-free stored-entry builder emits a PK\\x03\\x04 archive with one local header and one central-directory record per finished photo, an end-of-central-directory count that matches, and a central directory whose offset+size lands exactly on the EOCD record",
    r10.n === 3 && zip.length > 22 && zip.readUInt32LE(0) === 0x04034b50
      && countSig(0x04034b50) === r10.n && countSig(0x02014b50) === r10.n
      && eocdCount === r10.n && cdOff + cdSize === eocdAt
      && r10.names.every(n => /^path-\d\d-.+\.(png|jpg)$/.test(n)),
    JSON.stringify({ n: r10.n, bytes: zip.length, locals: countSig(0x04034b50), centrals: countSig(0x02014b50), eocdCount, cdOff, cdSize, eocdAt, names: r10.names }));

  // ---------------------------------------------------------------- 11
  await page.evaluate(() => { window.__reset(); window.__seed(9); });
  const widths = [];
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 850 });
    await page.waitForTimeout(150);
    widths.push(await page.evaluate(() => ({
      w: window.innerWidth,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      cells: document.querySelectorAll("#ptGrid .pt-th").length,
      /* every tap target on the page must clear 44px */
      small: [...document.querySelectorAll("#pgPath button, #pgPath a.btn")]
        .filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 44)
        .map(b => (b.id || b.className) + ":" + Math.round(b.getBoundingClientRect().height))
    })));
  }
  report("11 no horizontal overflow at phone widths: with 9 photos seeded the auto-fill grid reflows inside 320 and 390 CSS px without widening the document, and no visible Path control is under the 44px touch minimum",
    widths.every(r => r.scrollW <= r.w && r.bodyScrollW <= r.w && r.cells === 9 && r.small.length === 0),
    JSON.stringify(widths));
  await page.setViewportSize({ width: 420, height: 1000 });

  // ---------------------------------------------------------------- 12
  const r12 = await page.evaluate(() => {
    window.__reset();
    const before = window.__pickN;
    document.getElementById("ptEmpty").onclick();     // empty grid = picker
    const afterEmpty = window.__pickN;
    document.getElementById("btnPtAdd").onclick();    // and so is Add photos
    return { before, afterEmpty, afterAdd: window.__pickN, emptyShown: document.getElementById("ptEmpty").style.display === "" };
  });
  /* and a REAL multi-file pick through the hidden input: this guards the
     live-FileList hazard (resetting input.value empties .files, so the list
     must be snapshotted before the reset) */
  const pngBuf = Buffer.from(B64, "base64");
  await page.evaluate(() => { delete document.getElementById("ptFilePick").click; });
  await page.setInputFiles("#ptFilePick", [1, 2, 3].map(i => ({ name: "pick-" + i + ".png", mimeType: "image/png", buffer: pngBuf })));
  await page.waitForTimeout(600);
  const r12b = await page.evaluate(() => ({
    photos: PT.photos.length,
    names: PT.photos.map(p => p.name),
    cells: document.querySelectorAll("#ptGrid .pt-th").length,
    inputCleared: document.getElementById("ptFilePick").value === ""
  }));
  report("12 empty-grid tap opens the picker (gen-bar-as-picker pattern), a real 3-file pick through #ptFilePick ingests all three (the live FileList is snapshotted before input.value is reset), and zero page errors were raised across the whole sweep",
    r12.afterEmpty === r12.before + 1 && r12.afterAdd === r12.before + 2 && r12.emptyShown
      && r12b.photos === 3 && r12b.cells === 3 && r12b.names.join(",") === "pick-1.png,pick-2.png,pick-3.png"
      && r12b.inputCleared && pageErrors.length === 0,
    JSON.stringify({ ...r12, ...r12b, pageErrors }));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
