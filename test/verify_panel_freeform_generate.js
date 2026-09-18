/* verify_panel_freeform_generate.js — 6.88.1 / panel 6.159.1
   THE SIXTEEN PHOTOGRAPHS OF 6.159.0: FREEFORM GENERATE THREW, THE GUIDE
   BOX JUMPED, SMART WORKFLOW RUNS WERE NEVER COUNTED.

   The owner photographed panel 6.159.0 in Photoshop 27.10.0 (win32):

     1. Edit ▸ Freeform ▸ GENERATE with a prompt and IMAGE 1 ended in the
        status line "Error: MODEL_PRO_IMG is not defined". The constant left
        with the Gemini engine in 6.26.0; one comparison in runGenerate
        (`model === MODEL_PRO_IMG`) stayed behind, and a ReferenceError there
        ended every Freeform run since — no test drove the real runGenerate
        past that line. The line is dead (model is always null since 6.26.0;
        callImageAPI shapes the size by tier) and is gone. A static pass now
        pins that every SCREAMING_CASE identifier main.js uses is declared.
     2. Learn Mode's guide box sat above the GENERATE card on the first tap
        and at the TOP of the page on the second. The only path to the page
        top is guidePlace's fallback — the move failed. On the second tap the
        box is already the card's previous sibling, and the host refuses that
        no-op move, so guidePlace now leaves a box that is already in place
        alone, detaches it before any move, and re-finds a repainted button
        by id. (B2 simulates the host's refusal; Chromium itself moves fine.)
     3. Setup ▸ COST & BALANCE read "0 runs · 0 USD" after five Reference
        Scenes runs. The app books every paid run inside its poll
        (rhPollTracked → rhBookSpend); the panel's video pages and Freeform
        book their own (rhBookUsage), but the Smart Workflow wizard's runs
        (bootstrap runViaProvider) never reached the ledger. The adapter has
        always returned usage:[{taskId, final}]; bootstrap now hands it to
        HNK.spendBook, which main.js wires to rhBookUsage.

   Fault-injected while writing: the dead line restored fails A1/B1; the
   in-place skip removed fails B2; the spendBook call removed fails A3/B3.
   Usage: PORT=8931 node test/verify_panel_freeform_generate.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const BOOT = read("panel/src/app/bootstrap.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* every SCREAMING_CASE identifier main.js reads must be declared somewhere in
   main.js — the class of failure MODEL_PRO_IMG was. Strings and comments are
   stripped first; the few words this crude pass still sees inside regex
   literals and prompt text are listed, and nothing else may join them. */
function stripCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
function undeclaredScreaming(src) {
  const s = stripCode(src);
  const used = new Set(); let m;
  const re = /(^|[^.\w$])([A-Z][A-Z0-9_]{3,})\b(?!\s*:)/g;
  while ((m = re.exec(s))) used.add(m[2]);
  const declared = new Set();
  const dre = /\b(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{3,})\b/g;
  while ((m = dre.exec(s))) declared.add(m[1]);
  const builtin = new Set(["JSON", "URL", "NAN", "INFINITY", "HNK", "IMAGE", "ROLES", "GUARD", "KEEP", "ORIGINAL"]);
  return [...used].filter(x => !declared.has(x) && !builtin.has(x)).sort();
}

(async () => {
  /* ---------------- A. source pins ---------------- */
  const und = undeclaredScreaming(MAIN);
  report("A1) MODEL_PRO_IMG is gone from main.js (the Gemini-era constant left in 6.26.0; the comparison that outlived it ended every Freeform run), model stays null into callImageAPI, and no other SCREAMING_CASE identifier main.js reads is undeclared",
    !/MODEL_PRO_IMG/.test(stripCode(MAIN)) /* the name survives only in the comment that explains its removal */ && /const model = null; \/\* v6\.26\.0 — the tier \(state\.model\) shapes the call inside callImageAPI \*\//.test(MAIN) &&
    /if \(ratio\) imageConfig\.aspectRatio = ratio;\n\s*\/\* v6\.159\.1/.test(MAIN) && und.length === 0, { undeclared: und });

  const FCODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, "");   /* the 6.170.0 note names what it removed — read the code, not the comment */
  report("A2) v6.170.0 — the Learn-Mode guide box left with the three-tap cycle: no guidePlace / elInDoc / showGuide / showPromptStage / armGate / GEN_GUIDES / dualT in main.js, no #guideBox in the markup, and the four run buttons call their run directly behind state.busy",
    !/function guidePlace|function elInDoc|function showGuide|function showPromptStage|function armGate|function dualT|GEN_GUIDES/.test(FCODE) &&
    read("panel/index.html").indexOf("guideBox") < 0 &&
    /if \(state\.busy\) return;   \/\* never start a second run on top of one \*\/\n  \/\* the label stays put while the run feeds back through the card \(no busy dots\) \*\/\n  setBusyBtn\(null\);\n  runGenerate\(null, false, \[\], false, \{ action: "Prompt", ffCard: true \}\);/.test(MAIN) &&
    (MAIN.match(/if \(state\.busy\) return;\n        studioRun\(/g) || []).length === 2, null);

  report("A3) the Smart Workflow wizard's runs reach the ledger: bootstrap hands the adapter's usage to HNK.spendBook with the feature's name (never blocking the run), main.js wires spendBook to rhBookUsage, and the adapter still returns usage:[{taskId, final}]",
    /var sb = \(typeof globalThis !== "undefined" && globalThis\.HNK\) \? globalThis\.HNK\.spendBook : null;/.test(BOOT) &&
    /if \(typeof sb === "function" && res && res\.usage && res\.usage\.length\) sb\(res\.usage, \{ kind: "image", label: featureOf\(request\), prov: "rh" \}\);/.test(BOOT) &&
    BOOT.indexOf("globalThis.HNK.spendBook") < BOOT.indexOf("if (!res.ok) { status(res.error); return res; }") &&
    /g\.HNK\.spendBook = function \(usage, meta\) \{ try \{ rhBookUsage\(usage, meta\); \} catch \(e\) \{ \} \};/.test(MAIN) &&
    /return \{ ok: true, results: all, model: request\.model, machine: m, usage: deps\._usage \|\| \[\] \};/.test(read("panel/src/providers/runninghub-enterprise-adapter.js")), null);

  const wn = WN.appRow("6.88.1", "pgCreate");
  const wnP = WN.panelRow("6.88.1", "pgCreate");
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A4) CI runs this test right after verify_tutorials; the landing counts at least 224 tests; What's New carries the 6.88.1 Freeform row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_freeform_generate.js") > CI.indexOf("node test/verify_tutorials.js") && CI.indexOf("node test/verify_tutorials.js") > 0 && tests >= 224 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  /* ---------------- B. the panel ---------------- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  let pan;
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    pan = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const $$ = id => document.getElementById(id);
      const PXU = "data:image/png;base64," + arg.px;
      state.rhKey = state.rhKey || "TEST_RH_KEY";

      /* -- B1. Freeform GENERATE, one tap, the real runGenerate over a stubbed provider call -- */
      switchPage("prompt"); await settle();
      state.subj = { b64: arg.px, mime: "image/png" };   /* IMAGE 1 — the photograph */
      $$("promptBox").value = "meitu skin";
      window.__calls = 0; window.__placed = 0;
      callImageAPI = async function (model, parts, cfg) { window.__calls++; window.__model = model; window.__parts = parts.length; window.__cfg = cfg; return { b64: arg.px, mime: "image/png" }; };
      placeResultToPS = async function () { window.__placed++; };
      saveResultToDisk = async function () { };
      const h0 = state.history.length;
      $$("btnGenerate").click(); await settle();
      await until(() => !state.busy && (window.__calls > 0 || /err/.test(($$("stGen") || {}).className || ""))); await settle();
      out.ff = { calls: window.__calls, model: window.__model, parts: window.__parts, cfg: window.__cfg, result: state.resultB64 === arg.px, hist: state.history.length - h0,
        st: ($$("stGen") || {}).textContent, stCls: ($$("stGen") || {}).className, want: ff9(FF_L.done), status: ($$("status") || {}).textContent, placed: window.__placed };

      /* -- B2. v6.170.0: one tap runs. No gate, no guide box, and a tap while busy starts nothing -- */
      out.gate = { box: !!$$("guideBox"), armGate: typeof armGate, learnMode: typeof state.learnMode };
      window.__calls = 0;
      const btn2 = $$("btnGenerate");
      btn2.click(); await settle();
      await until(() => !state.busy && window.__calls > 0); await settle();
      out.gate.firstTap = window.__calls;
      state.busy = true; btn2.click(); await settle(); state.busy = false;
      out.gate.whileBusy = window.__calls;

      /* -- B3. a Smart Workflow run through the real runViaProvider books its usage -- */
      switchPage("aitools"); await settle();
      const boot = window.HNK.aiToolsBoot; const A = window.HNK.runninghubAdapter;
      const origGen = A.generate;
      A.generate = async function (deps, request) {
        return { ok: true, results: [{ ref: PXU, url: "" }], model: request.model || "m", machine: "x",
          usage: [{ taskId: "t-" + Date.now(), final: { code: 0, data: { taskId: "t1", taskUsageList: [{ taskId: "t1", consumeMoney: 0.05, consumeCoins: 5, taskCostTime: 12 }] } } }] };
      };
      const pa = window.HNK.panelAuth; const rl = pa && pa.requireLease; if (pa) pa.requireLease = async function () { };
      const sset = boot.services.settings; const sv = sset.get().addAsNewLayer; sset.set({ addAsNewLayer: false });
      const n0 = spendRollup().all.n;
      const res = await boot.runViaProvider({ model: "nano-banana-2", mode: "smart-workflow", workflowId: "reference-scenes",
        images: [{ ref: PXU, source: "file" }], prompt: "p", compiledPrompt: "p", output: { ratio: "auto", size: "2k" } });
      const r = spendRollup();
      out.spend = { ok: !!(res && res.ok), n: r.all.n - n0, money: r.all.money, row: r.rows[0] && { m: r.rows[0].m, k: r.rows[0].k, p: r.rows[0].p, money: r.rows[0].money, coins: r.rows[0].coins, has: r.rows[0].has } };
      A.generate = origGen; if (pa && rl) pa.requireLease = rl; sset.set({ addAsNewLayer: sv });
      return out;
    }, { px: PX });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  const F = pan.ff;
  report("B1) panel · Freeform GENERATE with a prompt and IMAGE 1 runs through the real runGenerate: the provider call is made once (null model · the prompt part + the picture), the result lands, the history strip grows by one, the card says Done — and nothing is \"not defined\"",
    F.calls === 1 && F.model === null && F.parts >= 2 && F.result && F.hist === 1 && F.st.indexOf(F.want) === 0 /* "Done ✓ (1/1)" */ && /\bok\b/.test(F.stCls) && !/not defined/i.test(F.st + " " + F.status) && F.placed === 1, F);
  report("B2) panel · GENERATE runs on the FIRST tap — there is no guide box in the document, no armGate and no state.learnMode, one tap makes exactly one provider call, and a tap while a run is in flight starts nothing",
    pan.gate.box === false && pan.gate.armGate === "undefined" && pan.gate.learnMode === "undefined" &&
    pan.gate.firstTap === 1 && pan.gate.whileBusy === 1, pan.gate);
  report("B3) panel · a Smart Workflow run through the real runViaProvider (adapter answering with RunningHub's usage) books one row in COST & BALANCE — image · rh · the workflow's name · 0.05 USD · 5 RH",
    pan.spend.ok && pan.spend.n === 1 && pan.spend.row && pan.spend.row.k === "image" && pan.spend.row.p === "rh" && pan.spend.row.m.length > 0 && pan.spend.row.money === 0.05 && pan.spend.row.coins === 5 && pan.spend.row.has === 1, pan.spend);
  report("B4) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — Freeform generates on the first tap, the three-tap gate is gone, and every wizard run is counted.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
