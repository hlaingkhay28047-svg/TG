/* v5.0.0 regression sweep — a hundred photos through any workflow or tool.

   WHAT THE OWNER ASKED FOR. "ပုံ၁၀၀ တစ်ခါတည်း smark workflow ကြိုတဲ့ဟာသုံးလိုရ
   ကြိုက်တဲ့ pages က funtion features tools ကို ပုံ၁၀၀ Generate လုပ်လို့ရတာမျိုး" —
   one batch of a hundred photos, driven by whichever Smart Workflow he likes,
   and by the tools of whichever page he likes, not only by the Studio looks
   Path shipped with.

   WHERE THE OTHER PAGES ALREADY WERE. Retouch, Cleanup, Chains, Camera and Mix
   compose their fragments inside the SHARED dispatcher, so they have always
   ridden along on every Path request. Studio was the exception: its 92 AI
   features build their own prompt (stComposePrompt) and bake their own local
   pixels first, so they could not reach a batch at all. O is that third source.

   WHAT WAS ALREADY THERE, AND THE DESIGN DECISION THIS SWEEP PROTECTS. Path
   already owned a working many-photo engine: PT.photos, a sequential queue with
   per-photo status, a live median ETA, Stop, retry-errors, multi-select, ZIP and
   a contact sheet. What it could not do was point that engine at anything except
   PT_LOOKS. So the change EXTENDS the source instead of building a second batch
   page: state.pt.wf names a workflow id, ptBuildPrompt branches on it, and every
   other part of the queue is untouched. If someone later adds a parallel
   "workflow batch" screen, C and D are what should stop them — there is one
   engine and it has three sources.

   THE CENTRAL CLAIM IS PROMPT IDENTITY. A card's art is a promise about what it
   does. A batch run that quietly sent a different prompt than the wizard would
   send for the same card is a lie told a hundred times at once, so B asserts
   the two expressions are literally the same code, and D asserts that what the
   batch actually composes is that prompt and nothing bolted onto it — no look
   fragment, no PT_FX fragment, no second PRESERVE block fighting the card's own
   guards.

   E AND L ARE CONTROL HONESTY. Path's whole reason for existing is that every
   thumbnail shows the look for free before a single call is spent. A workflow
   has no CSS equivalent, so E asserts the thumbnails carry NO filter in workflow
   mode rather than tinting them with whatever look happened to be selected last,
   and L asserts the per-photo look rail is hidden rather than rendered inert.

   F AND G ARE THE MONEY. A hundred photos is a hundred API calls. F refuses to
   start a two-image workflow that has no IMAGE 2 — before the first call, not
   after the hundredth — and G proves the count is said out loud and that
   declining spends nothing.

   Usage: PORT=8931 node test/sweep_v500_batchwf.js  (serve docs/app first) */
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
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* ---- B) prompt identity, checked at the source ----
   openWizard and _wfBatchPrompt must compose the prompt with the SAME
   expression. Two copies of a formula drift; this counts them. */
const AVOID_EXPR = 'w.negative ? "\\n\\nAVOID: "+w.negative+"." : ""';
const avoidCount = src.split(AVOID_EXPR).length - 1;
report("B) the wizard and the batch compose the prompt with one identical expression (x2)",
  avoidCount === 2, { occurrences: avoidCount });

/* prose-level: the batch composer must not append Path's own blocks */
const wfBranch = (src.match(/var wf=ptWfActive\(\);\s*if\(wf\)\{[\s\S]{0,400}?\n  \}/) || [""])[0];
report("B2) the workflow branch appends nothing but the user's own extra line",
  /_wfBatchPrompt/.test(wfBranch) && !/ptPreserve|PT_FX|look\.ai/.test(wfBranch),
  { snippet: wfBranch.slice(0, 200) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_ws_lang", "my");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  /* ---- A) the bridge exposes the catalogue, and only the batchable half ---- */
  const bridge = await page.evaluate(() => {
    const list = window._wfBatchList();
    const cardsWithPhoto = document.querySelectorAll("#wfHost .wfmini .wfbatch").length;
    const allCards = document.querySelectorAll("#wfHost .wfmini").length;
    return {
      n: list.length,
      allCards,
      cardsWithPhoto,
      everyHasReq: list.every(w => w.reqN >= 1),
      everyResolves: list.every(w => !!window._wfBatchInfo(w.id)),
      everyHasPrompt: list.every(w => (window._wfBatchPrompt(w.id) || "").length > 40),
      /* Prompt Ideas take no photo — batching them would spend N calls on one
         text prompt, so they must NOT be offered */
      noPhotoless: list.every(w => w.id.indexOf("pl-") !== 0),
      twoImage: list.filter(w => w.reqN >= 2).length,
      cats: Array.from(new Set(list.map(w => w.cat))).length
    };
  });
  report("A) the batch list is the real catalogue minus the photo-less cards",
    bridge.n >= 100 && bridge.everyHasReq && bridge.everyResolves &&
    bridge.everyHasPrompt && bridge.noPhotoless && bridge.twoImage > 0 && bridge.cats >= 5,
    bridge);
  report("A2) every batchable card carries the batch button, and only those",
    bridge.cardsWithPhoto === bridge.n && bridge.cardsWithPhoto < bridge.allCards,
    { withButton: bridge.cardsWithPhoto, batchable: bridge.n, allCards: bridge.allCards });

  /* ---- C) the mode switch really swaps which half of the page is live ---- */
  const modes = await page.evaluate(async () => {
    const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none"; };
    const snap = () => ({
      lookBox: vis("ptLookBox"), wfBox: vis("ptWfBox"),
      fxLookOnly: vis("ptFxLookOnly"), bake: vis("btnPtBake"),
      srcOn: Array.from(document.querySelectorAll("#ptSrcChips .chip")).map(c => c.classList.contains("on"))
    });
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 300));
    const look = snap();
    const id = window._wfBatchList()[0].id;
    ptSetWorkflow(id);
    await new Promise(r => setTimeout(r, 200));
    const wf = snap();
    ptSetWorkflow("");
    await new Promise(r => setTimeout(r, 200));
    return { look, wf, back: snap(), id };
  });
  report("C) Look mode and Workflow mode show opposite halves, and the switch is reversible",
    modes.look.lookBox && !modes.look.wfBox && modes.look.fxLookOnly && modes.look.bake &&
    !modes.wf.lookBox && modes.wf.wfBox && !modes.wf.fxLookOnly && !modes.wf.bake &&
    modes.back.lookBox && !modes.back.wfBox &&
    JSON.stringify(modes.look.srcOn) === "[true,false,false]" &&
    JSON.stringify(modes.wf.srcOn) === "[false,true,false]",
    modes);

  /* ---- D) what the batch actually composes ---- */
  const composed = await page.evaluate(async () => {
    const px = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    ptIngestDataUrls([{ name: "a.jpg", dataUrl: px }]);
    await new Promise(r => setTimeout(r, 200));
    const photo = PT.photos[0];
    ptSetWorkflow("");
    await new Promise(r => setTimeout(r, 150));
    const lookPrompt = ptBuildPrompt(photo);
    const id = window._wfBatchList().find(w => w.reqN === 1).id;
    ptSetWorkflow(id);
    await new Promise(r => setTimeout(r, 150));
    const wfPrompt = ptBuildPrompt(photo);
    const canon = window._wfBatchPrompt(id);
    /* and with the customer's own extra line appended */
    state.pt.custom = "extra line from the owner";
    const withCustom = ptBuildPrompt(photo);
    state.pt.custom = "";
    return { lookPrompt, wfPrompt, canon, withCustom, id,
             preview: document.getElementById("ptPromptPreview").textContent };
  });
  report("D) in workflow mode the batch sends the card's own prompt, byte for byte",
    composed.wfPrompt === composed.canon && composed.canon.length > 40,
    { same: composed.wfPrompt === composed.canon, len: composed.canon.length, id: composed.id });
  report("D2) no look fragment and no second PRESERVE block ride along",
    !/PRESERVE EXACTLY/.test(composed.wfPrompt) &&
    !/Professional batch wedding-photo relight/.test(composed.wfPrompt) &&
    /PRESERVE EXACTLY/.test(composed.lookPrompt),
    { wfHasPreserve: /PRESERVE EXACTLY/.test(composed.wfPrompt),
      lookHasPreserve: /PRESERVE EXACTLY/.test(composed.lookPrompt) });
  report("D3) the customer's extra line is the ONE thing appended",
    composed.withCustom === composed.canon + "\n\nextra line from the owner",
    { tail: composed.withCustom.slice(-40) });

  /* ---- E) control honesty: no invented free preview ---- */
  const honesty = await page.evaluate(async () => {
    const filt = () => {
      const im = document.querySelector("#ptGrid .pt-th img");
      return im ? { filter: getComputedStyle(im).filter, lazy: im.loading, dec: im.decoding } : null;
    };
    const note = () => document.getElementById("ptFreeNote").textContent;
    ptSetWorkflow("");
    await new Promise(r => setTimeout(r, 200));
    const look = filt(), lookNote = note();
    ptSetWorkflow(window._wfBatchList()[0].id);
    await new Promise(r => setTimeout(r, 200));
    const wf = filt(), wfNote = note();
    return { look, wf, lookNote, wfNote };
  });
  report("E) workflow thumbnails carry NO grade — a look's filter is never borrowed",
    !!honesty.look && !!honesty.wf &&
    honesty.look.filter !== "none" && honesty.wf.filter === "none",
    honesty);
  report("E2) and the page says so instead of leaving the free-preview promise up",
    honesty.wfNote.length > 0 && honesty.wfNote !== honesty.lookNote,
    { look: honesty.lookNote, wf: honesty.wfNote });
  report("E3) the grid lazy-decodes so a hundred 2048px data URLs do not land at once",
    !!honesty.wf && honesty.wf.lazy === "lazy" && honesty.wf.dec === "async", honesty.wf);

  /* ---- F) a two-image workflow refuses to start without IMAGE 2 ---- */
  const guard = await page.evaluate(async () => {
    const gen = document.getElementById("btnGen");
    const realOnclick = gen.onclick;
    let calls = 0;
    gen.onclick = async function () { calls++; };
    const realConfirm = window.confirm;
    window.confirm = () => true;
    const two = window._wfBatchList().find(w => w.reqN >= 2);
    PT.ref = null;
    ptSetWorkflow(two.id);
    await new Promise(r => setTimeout(r, 200));
    const fxOpen = /open/.test(document.getElementById("ptGrpFx").className);
    await ptRunAll(null);
    await new Promise(r => setTimeout(r, 300));
    const refused = { calls, busy: PT.busy, st: document.getElementById("stPtGen").textContent, fxOpen, id: two.id };
    /* now satisfy IMAGE 2 and prove the same run proceeds */
    PT.ref = { mime: "image/gif", b64: "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", label: "ref" };
    ptSync();
    await new Promise(r => setTimeout(r, 150));
    await ptRunAll(null);
    await new Promise(r => setTimeout(r, 400));
    const proceeded = calls;
    gen.onclick = realOnclick;
    window.confirm = realConfirm;
    PT.ref = null;
    return { refused, proceeded };
  });
  report("F) a 2-image workflow with no IMAGE 2 spends nothing and says why",
    guard.refused.calls === 0 && guard.refused.busy === false &&
    guard.refused.st.length > 0 && guard.refused.fxOpen === true,
    guard.refused);
  report("F2) once IMAGE 2 is supplied the same run proceeds",
    guard.proceeded > 0, guard);

  /* ---- G) the money is named before it is spent ---- */
  const cost = await page.evaluate(async () => {
    const px = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    /* twelve distinct photos — ptDupKey folds identical name+bytes */
    const list = [];
    for (let i = 0; i < 12; i++) list.push({ name: "shot-" + i + ".jpg", dataUrl: px });
    ptIngestDataUrls(list);
    await new Promise(r => setTimeout(r, 300));
    const gen = document.getElementById("btnGen");
    const realOnclick = gen.onclick;
    let calls = 0;
    gen.onclick = async function () { calls++; };
    const realConfirm = window.confirm;
    let asked = "";
    window.confirm = m => { asked = m; return false; };
    ptSetWorkflow(window._wfBatchList().find(w => w.reqN === 1).id);
    await new Promise(r => setTimeout(r, 200));
    const queued = PT.photos.filter(p => p.status !== "done").length;
    await ptRunAll(null);
    await new Promise(r => setTimeout(r, 300));
    const declined = calls;
    /* and a small run is not interrogated */
    let asked2 = "";
    window.confirm = m => { asked2 = m; return false; };
    await ptRunAll([PT.photos[0]]);
    await new Promise(r => setTimeout(r, 300));
    gen.onclick = realOnclick;
    window.confirm = realConfirm;
    return { asked, asked2, declined, queued, oneRan: calls > 0, max: PT_MAX, ask: PT_COST_ASK };
  });
  report("G) a batch of 10 or more names its exact API-call cost first",
    cost.queued >= 10 && cost.asked.indexOf(String(cost.queued)) >= 0 && cost.asked.length > 30,
    { queued: cost.queued, asked: cost.asked.slice(0, 120) });
  report("G2) declining spends nothing", cost.declined === 0, cost);
  report("G3) a single-photo run is not interrogated",
    cost.asked2 === "" && cost.oneRan === true, cost);
  report("G4) the ceiling the owner asked for is the ceiling shipped",
    cost.max === 100, { PT_MAX: cost.max });

  /* ---- H) the request carries the workflow's OWN role labels ---- */
  const roles = await page.evaluate(async () => {
    const gen = document.getElementById("btnGen");
    const realOnclick = gen.onclick;
    let seen = null;
    gen.onclick = async function () {
      seen = {
        roles: state.imgRoles ? state.imgRoles.slice() : null,
        prompt: document.getElementById("prompt").value,
        ratio: document.getElementById("selRatio").value,
        count: document.getElementById("selCount").value,
        img1: !!state.refs[0], img2: !!state.refs[1], img3: !!state.refs[2]
      };
    };
    const realConfirm = window.confirm; window.confirm = () => true;
    const wf = window._wfBatchList().find(w => w.reqN >= 2);
    PT.ref = { mime: "image/gif", b64: "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", label: "ref" };
    ptSetWorkflow(wf.id);
    await new Promise(r => setTimeout(r, 200));
    /* the Create page's own hand-set roles must survive a batch: Path borrows
       the shared dispatcher and has to give every borrowed control back */
    state.imgRoles = ["CREATE PAGE ROLE A", "CREATE PAGE ROLE B"];
    await ptRunAll([PT.photos[0]]);
    await new Promise(r => setTimeout(r, 400));
    const after = state.imgRoles ? state.imgRoles.slice() : null;
    state.imgRoles = null;
    gen.onclick = realOnclick; window.confirm = realConfirm; PT.ref = null;
    return { seen, after, want: wf.req.concat(wf.opt), canon: window._wfBatchPrompt(wf.id) };
  });
  report("H) the dispatcher is handed the workflow's own IMAGE 1/2 role labels",
    roles.seen && JSON.stringify(roles.seen.roles) === JSON.stringify(roles.want) &&
    roles.seen.img1 && roles.seen.img2 && !roles.seen.img3,
    { got: roles.seen && roles.seen.roles, want: roles.want });
  report("H2) it sends the card's prompt, at original framing, one image out",
    roles.seen && roles.seen.prompt === roles.canon &&
    roles.seen.ratio === "" && roles.seen.count === "1",
    roles.seen && { ratio: roles.seen.ratio, count: roles.seen.count, same: roles.seen.prompt === roles.canon });
  report("H3) the Create page's own roles are handed back untouched after the run",
    JSON.stringify(roles.after) === JSON.stringify(["CREATE PAGE ROLE A", "CREATE PAGE ROLE B"]),
    { after: roles.after });

  /* ---- I) the hand-off from a card and from the wizard both land here ---- */
  const handoff = await page.evaluate(async () => {
    ptSetWorkflow("");
    switchPage("pgWorkflow");
    await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector("#wfHost .wfmini .wfbatch");
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const fromCard = { page: curPage, wf: state.pt.wf };
    /* the wizard's own chip */
    ptSetWorkflow("");
    const id = window._wfBatchList()[3].id;
    window._openWizardById(id);
    await new Promise(r => setTimeout(r, 300));
    const chip = Array.from(document.querySelectorAll("#wizIn .wiz-body .btn"))
      .find(b => /1|၁|၀/.test(b.textContent) && b.querySelector("svg"));
    const chips = Array.from(document.querySelectorAll("#wizIn .wiz-body .btn")).map(b => b.textContent.trim());
    const target = Array.from(document.querySelectorAll("#wizIn .wiz-body .btn"))
      .find(b => b.textContent.indexOf(String(PT_MAX)) >= 0);
    if (target) target.click();
    await new Promise(r => setTimeout(r, 400));
    return { fromCard, fromWiz: { page: curPage, wf: state.pt.wf, want: id },
             wizOpen: /on/.test(document.getElementById("wiz").className), chips, hadChip: !!chip };
  });
  report("I) the batch button on a card selects that workflow and opens Path",
    handoff.fromCard.page === "pgPath" && !!handoff.fromCard.wf, handoff.fromCard);
  report("I2) the wizard's own batch chip does the same and closes the wizard",
    handoff.fromWiz.page === "pgPath" && handoff.fromWiz.wf === handoff.fromWiz.want &&
    handoff.wizOpen === false,
    handoff);

  /* ---- K) a stale id degrades to look mode instead of sending an empty prompt ---- */
  const stale = await page.evaluate(async () => {
    state.pt.wf = "this-card-no-longer-exists";
    ptSync();
    await new Promise(r => setTimeout(r, 200));
    const p = ptBuildPrompt(PT.photos[0]);
    const lookBox = getComputedStyle(document.getElementById("ptLookBox")).display !== "none";
    ptSetWorkflow("");
    return { active: !!ptWfActive(), lookBox, hasPreserve: /PRESERVE EXACTLY/.test(p), len: p.length };
  });
  report("K) an id whose card is gone falls back to look mode, never to an empty prompt",
    stale.active === false && stale.lookBox === true && stale.hasPreserve === true && stale.len > 100,
    stale);

  /* ---- L) the per-photo look rail is withdrawn, not left inert ---- */
  const sheet = await page.evaluate(async () => {
    ptSetWorkflow(window._wfBatchList()[0].id);
    await new Promise(r => setTimeout(r, 150));
    ptOpenSheet(0);
    await new Promise(r => setTimeout(r, 250));
    const railWrap = document.getElementById("ptSheetRail").parentNode;
    const wf = { rail: getComputedStyle(railWrap).display !== "none",
                 cards: document.querySelectorAll("#ptSheetRail .pcard").length };
    ptSetWorkflow("");
    ptRenderSheet();
    await new Promise(r => setTimeout(r, 250));
    const look = { rail: getComputedStyle(railWrap).display !== "none",
                   cards: document.querySelectorAll("#ptSheetRail .pcard").length };
    ptCloseSheet();
    return { wf, look };
  });
  report("L) the per-photo look override is hidden in workflow mode and back in look mode",
    sheet.wf.rail === false && sheet.wf.cards === 0 &&
    sheet.look.rail === true && sheet.look.cards > 0,
    sheet);

  /* ---- M) the picker is a real, searchable catalogue ---- */
  const picker = await page.evaluate(async () => {
    ptOpenWfSheet();
    await new Promise(r => setTimeout(r, 250));
    const open = /on/.test(document.getElementById("ptWfSheet").className);
    const all = document.querySelectorAll("#ptWfList .pt-wfrow").length;
    const s = document.getElementById("ptWfSearch");
    s.value = "zzzznotathing"; s.oninput();
    await new Promise(r => setTimeout(r, 120));
    const none = document.querySelectorAll("#ptWfList .pt-wfrow").length;
    s.value = "relight"; s.oninput();
    await new Promise(r => setTimeout(r, 120));
    const some = document.querySelectorAll("#ptWfList .pt-wfrow").length;
    const first = document.querySelector("#ptWfList .pt-wfrow");
    const tall = first ? Math.round(first.getBoundingClientRect().height) : 0;
    first.click();
    await new Promise(r => setTimeout(r, 250));
    const closed = !/on/.test(document.getElementById("ptWfSheet").className);
    const picked = state.pt.wf;
    ptSetWorkflow("");
    return { open, all, none, some, closed, picked, tall };
  });
  report("M) the picker lists the whole catalogue, filters it, and picking one closes it",
    picker.open && picker.all >= 100 && picker.none === 0 &&
    picker.some > 0 && picker.some < picker.all && picker.closed && !!picker.picked,
    picker);
  report("M2) picker rows clear the 44px touch floor", picker.tall >= 44, { height: picker.tall });

  /* ---- J) the choice survives a reload, like every other Path setting ----
     Measured through an actual reload, not by reading the serialized blob: a
     value can reach localStorage and still be dropped by the restore guard. */
  const chosen = await page.evaluate(async () => {
    const id = window._wfBatchList().find(w => w.reqN === 1).id;
    ptSetWorkflow(id);
    await new Promise(r => setTimeout(r, 250));
    return id;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const persisted = await page.evaluate(async () => {
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 300));
    return { wf: state.pt.wf, active: !!ptWfActive(),
             wfBox: getComputedStyle(document.getElementById("ptWfBox")).display !== "none",
             title: document.getElementById("ptWfSelTitle").textContent };
  });
  report("J) the chosen workflow survives a reload and the page comes back in that mode",
    persisted.wf === chosen && persisted.active && persisted.wfBox && persisted.title.length > 0,
    { got: persisted, want: chosen });
  await page.evaluate(() => { ptSetWorkflow(""); });

  /* ---- O) the third source: the Meitu/Evoto suite over the whole shoot ----
     The owner asked for "ကြိုက်တဲ့ pages က function features tools" — the tools
     of whichever page he likes, not only the workflow cards. Retouch, Cleanup,
     Chains, Camera and Mix already ride along on every Path request through the
     shared dispatcher; Studio was the one page whose 92 AI features could not
     reach a batch, because they compose their own prompt (stComposePrompt) and
     bake their own local pixels first. O measures both halves. */
  const studio = await page.evaluate(async () => {
    /* J reloaded the page, and PT.photos is session-only by design — re-seed */
    if (!PT.photos.length) {
      ptIngestDataUrls([{ name: "o.jpg",
        dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" }]);
      await new Promise(r => setTimeout(r, 300));
    }
    /* Queue a real AI feature by FINDING one, not by naming one. Most Studio
       sliders are Tier-1/Tier-2 local pixel work and never reach state.st.pend;
       hard-coding an id that turns out to be one of those would leave the queue
       empty and quietly make the rest of this block vacuous. */
    let chosen = null;
    for (const id of Object.keys(ST.feats)) {
      const f = ST.feats[id];
      if (!f || !f.calc || !f.keys || !f.keys.length) continue;
      for (const val of [true, 50]) {
        f.keys.forEach(k => svSet(k, val));
        let r = null; try { r = f.calc(); } catch (e) { }
        if (r && r.frag) { chosen = id; break; }
        f.keys.forEach(k => { delete state.st.v[k]; });
      }
      if (chosen) break;
    }
    if (chosen) stSync(chosen);
    /* and a local grade, which Studio bakes into the photo BEFORE the prompt */
    state.st.t1.wrm = 18;
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 300));
    ptSetWorkflow("@studio");
    await new Promise(r => setTimeout(r, 300));
    const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none"; };
    const ui = { stBox: vis("ptStBox"), wfBox: vis("ptWfBox"), lookBox: vis("ptLookBox"),
                 refBox: vis("ptRefBox"), bake: vis("btnPtBake"),
                 list: document.getElementById("ptStList").textContent,
                 title: document.getElementById("ptStTitle").textContent,
                 srcOn: Array.from(document.querySelectorAll("#ptSrcChips .chip")).map(c => c.classList.contains("on")) };
    const prompt = ptBuildPrompt(PT.photos[0]);
    const canon = stComposePrompt();
    const pendCount = state.st.pend.length;
    /* what actually gets sent: the photo must arrive BAKED, not raw */
    const gen = document.getElementById("btnGen");
    const realOnclick = gen.onclick;
    let sent = null;
    gen.onclick = async function () {
      sent = { b64: state.refs[0] ? state.refs[0].b64 : null, prompt: document.getElementById("prompt").value };
    };
    const realConfirm = window.confirm; window.confirm = () => true;
    await ptRunAll([PT.photos[0]]);
    await new Promise(r => setTimeout(r, 800));
    const pendWas = pendCount;
    const rawB64 = PT.photos[0].srcDataUrl.split(",")[1];
    const baked = !!sent && sent.b64 !== rawB64;
    /* with the queue emptied, the mode refuses to spend anything */
    let refusedCalls = 0;
    gen.onclick = async function () { refusedCalls++; };
    state.st.pend.length = 0;
    state.st.t1.wrm = 0;
    ptSync();
    await new Promise(r => setTimeout(r, 200));
    await ptRunAll([PT.photos[0]]);
    await new Promise(r => setTimeout(r, 300));
    const emptyTitle = document.getElementById("ptStTitle").textContent;
    gen.onclick = realOnclick; window.confirm = realConfirm;
    ptSetWorkflow("");
    return { ui, prompt, canon, baked, sentPrompt: sent && sent.prompt, refusedCalls,
             emptyTitle, chosen, pendN: pendWas,
             st: document.getElementById("stPtGen").textContent };
  });
  report("O) Studio mode is its own third source, and the other two step aside",
    studio.ui.stBox && !studio.ui.wfBox && !studio.ui.lookBox &&
    !studio.ui.refBox && !studio.ui.bake &&
    JSON.stringify(studio.ui.srcOn) === "[false,false,true]",
    studio.ui);
  report("O2) a real AI feature reached the queue, and the box names it",
    !!studio.chosen && studio.pendN >= 1 && studio.ui.list.length > 0 &&
    studio.ui.title.indexOf(String(studio.pendN)) >= 0,
    { chosen: studio.chosen, pend: studio.pendN, title: studio.ui.title, list: studio.ui.list });
  report("O3) it sends exactly the prompt the Studio page would send",
    studio.prompt === studio.canon && studio.sentPrompt === studio.canon &&
    /PORTRAIT RETOUCH TASK/.test(studio.canon),
    { same: studio.prompt === studio.canon, len: studio.canon.length });
  report("O4) and the local grade is baked into every photo first, as Studio does",
    studio.baked === true, { baked: studio.baked });
  report("O5) with nothing queued it refuses rather than buying N empty retouches",
    studio.refusedCalls === 0 && studio.st.length > 0 && studio.emptyTitle.length > 0,
    { calls: studio.refusedCalls, st: studio.st, title: studio.emptyTitle });

  /* the sentinel must not be able to collide with a real card id */
  report("O6) the Studio sentinel cannot collide with any workflow id",
    await page.evaluate(() => window._wfBatchList().every(w => w.id !== "@studio" && w.id.indexOf("@") < 0)),
    { sentinel: "@studio" });

  report("N) no page errors", errs.length === 0, errs);
  report("N2) nothing 404s", bad.length === 0, bad.slice(0, 6));

  console.log("      (" + bridge.n + " Smart Workflows are now batchable, " +
    bridge.twoImage + " of them two-image, at up to " + cost.max + " photos a run)");

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
