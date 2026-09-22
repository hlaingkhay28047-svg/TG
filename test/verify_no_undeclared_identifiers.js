/* verify_no_undeclared_identifiers.js — 6.89.0 / panel 6.160.0
   EVERY IDENTIFIER THE STUDIO READS IS DECLARED — FOUND STATICALLY.

   6.88.1 removed `model === MODEL_PRO_IMG` from panel/main.js: the constant
   had left with the Gemini engine in 6.26.0, one comparison outlived it, and
   a ReferenceError there ended every Freeform GENERATE in Photoshop for more
   than thirty releases. No test executed that path. A ReferenceError is the
   one class of fault that needs no execution to find: an identifier is bound
   by a declaration in an enclosing scope, is a property of the host's global
   object, or throws the moment its line runs. test/lib/free-identifiers.js
   parses every shipped script with acorn and resolves each reference against
   the scopes the language actually creates; this test runs it over every
   surface and demands zero findings.

   What the first run found (both fixed here):
     - panel/main.js still carried the Pipeline Chain Builder (v3.0) — its
       card left panel/index.html when the pages became the app's own in
       6.51.0, and its runPipeline / buildMergedPipeline still called
       buildRetouchPrompt, deleted in that same wave. 387 dead lines, gone.
     - panel/js/hnk_finish_engines.js (lifted from the app) reads the
       student's HD Finish chip in finishPassOn and the engine / face choice
       in settings() through globalThis.svGet — the studio module's settings
       store, which nothing ever published. In Photoshop the finish pass
       therefore always ran the default engine, and the note under the engine
       rows always said HD Finish was off. The studio module now publishes
       svGet / svSet the moment a retouch page is built.

   Sections: A the analyzer's own model on synthetic code · B every surface
   clean · C the two fixes (source pins, a VM proof, the real panel mounting
   Retouch A) · D the release pins.
   Fault-injected while writing: `x = y + zz;` appended to main.js fails B1;
   the publish line removed from the lifter fails C2/C4.
   Usage: PORT=8931 node test/verify_no_undeclared_identifiers.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const F = require("./lib/free-identifiers.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const U = (...a) => [].concat(...a);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) failures++;
}
const names = (r) => r.findings.map(x => x.name + (x.write ? "(w)" : "")).sort();
const brief = (r) => ({ n: r.findings.length, first: r.findings.slice(0, 20).map(x => (x.file ? x.file + ":" : "") + x.line + ":" + x.column + " " + x.name + (x.write ? " (write)" : "")), parse: r.parseErrors || r.parseError || null });

(async () => {
  /* ---------------- A. the analyzer's model ---------------- */
  report("A0) acorn is installed (npm install acorn@8.18.0 — CI installs it beside Playwright)", F.available && /npm install playwright@1\.62\.1 acorn@8\.18\.0\b/.test(CI), { available: F.available });

  const r1 = F.scanScript(
    'var a = 1; function g(x) { return x + b + c; } let c = 2; d = 3;\n' +
    'const { p, r: [t = e2] } = o; ({ w } = o); obj.prop; ({ key: 1, k2 }); `${tpl}`; u++; for (v in o2) {}',
    { globals: F.ECMA });
  report("A1) every kind of undeclared reference is found — a read (b), a write (d), a destructuring default (e2), the destructured source (o), an assignment-pattern target (w), a member's object (obj), a shorthand property (k2), a template expression (tpl), an update (u), a for-in target (v) and its iterable (o2)",
    !r1.parseError && names(r1).join(" ") === "b d(w) e2 k2 o o o2 obj tpl u(w) v(w) w(w)".split(" ").sort().join(" "), { got: names(r1), parse: r1.parseError });

  const r2 = F.scanScript(
    'hoisted(); function hoisted() { later; new.target; } var later; { function blk() {} } blk;\n' +
    'class K { m() { return K; } static { var sv = 1; sv; } } (function named() { named; arguments; });\n' +
    'try { } catch (e) { e; } switch (1) { case 1: let s = 1; default: s; } for (const q of []) { q; } for (let i = 0; i < 1; i++) { i; }\n' +
    'label: for (;;) { break label; } typeof zz; if (typeof A === "function") A(); typeof B !== "undefined" && B.x;\n' +
    'var c1 = typeof C === "undefined" ? 1 : C.y; if (typeof D === "undefined") { D = 1; } (function () { if (typeof E === "function") { E(); } else { E; } })();\n' +
    'const fn = (x = y0, { z = x } = {}) => x + z; var y0 = 1; ({ [a1]: b1 } = o1); var a1, b1, o1;',
    { globals: F.ECMA });
  report("A2) nothing the language binds is flagged — hoisted functions and vars, a block-level function, a class inside its own body and its static block, a named function expression's name, arguments, the catch parameter, a switch block's let, for / for-of heads, labels, the typeof operand, and every branch a bare typeof guard protects (if / ?: / && / else)",
    !r2.parseError && r2.findings.length === 0, { got: names(r2), parse: r2.parseError });

  const html = '<!-- prose that says <script> inside a comment -->\n<script type="application/ld+json">{"a":1}</script>\n<script src="x.js"></script>\n<script>\nshared; fromA; missing;\n</script>';
  const blocks = F.inlineScripts(html);
  const r3 = F.scanSurface([{ name: "a.js", code: "var shared = 1; window.fromA = 2;" }].concat(blocks.map(b => ({ name: "page.html", code: b.code, line: b.line }))), { globals: F.BROWSER });
  report("A3) one page, one scope — a script's top-level declaration and a window.X = assignment bind for every other script on the page; an HTML comment that mentions <script>, a JSON block and a src block form no inline block; the one real block is found with its true line, and the one undeclared name is reported on line 5",
    blocks.length === 1 && blocks[0].line === 4 && r3.parseErrors.length === 0 && r3.findings.length === 1 && r3.findings[0].name === "missing" && r3.findings[0].line === 5 && r3.findings[0].file === "page.html",
    { blocks, findings: r3.findings, parse: r3.parseErrors });

  /* ---------------- B. every surface ---------------- */
  const panelIndex = read("panel/index.html");
  const srcs = [...panelIndex.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  const panelFiles = srcs.map(s => ({ name: "panel/" + s, code: read("panel/" + s) }));
  const srcSet = new Set(srcs);
  const panelSrcOnDisk = [];
  (function walk(d) { for (const f of fs.readdirSync(path.join(ROOT, "panel/src", d))) { const rel = d ? d + "/" + f : f; const abs = path.join(ROOT, "panel/src", rel); if (fs.statSync(abs).isDirectory()) walk(rel); else if (/\.js$/.test(f)) panelSrcOnDisk.push("src/" + rel); } })("");
  const notTagged = panelSrcOnDisk.filter(f => !srcSet.has(f));
  const rPanel = F.scanSurface(panelFiles, { globals: U(F.ECMA, F.BROWSER, F.UXP) });
  report("B1) the panel — every classic script panel/index.html loads (" + panelFiles.length + ", main.js and every panel/src module but the CJS entry among them) as ONE page scope with the browser + UXP globals: zero undeclared identifiers, zero parse errors",
    panelFiles.length >= 60 && srcSet.has("main.js") && notTagged.join() === "src/index.js" && rPanel.parseErrors.length === 0 && rPanel.findings.length === 0, { notTagged, ...brief(rPanel) });

  const rIdx = F.scanScript(read("panel/src/index.js"), { kind: "cjs", globals: U(F.ECMA, F.NODE) });
  report("B2) the panel's CommonJS entry (panel/src/index.js) over the Node globals: clean", !rIdx.parseError && rIdx.findings.length === 0, brief(rIdx));

  /* 6.125.0 — the shell also loads its own data files by <script src="data/…?v=…">, and one of them
     (data/album-module.js) declares the Album page's module. They are classic scripts on the same
     page, so they join the scope exactly as the panel's do in B1 — more code read, not less. */
  /* a real file name only — the pack loader writes a src it builds from a variable, and that
     string is not a file on disk */
  const appSrcs = [...APP.matchAll(/<script\s+src="(data\/[a-z0-9_-]+\.js)(?:\?v=[0-9a-f]+)?"/g)].map((m) => m[1]);
  const appDataFiles = appSrcs.map((s) => ({ name: "docs/app/" + s, code: read("docs/app/" + s) }));
  const appBlocks = appDataFiles.concat(F.inlineScripts(APP).map(b => ({ name: "docs/app/index.html", code: b.code, line: b.line })));
  const rApp = F.scanSurface(appBlocks, { globals: U(F.ECMA, F.BROWSER) });
  const bigApp = Math.max(...appBlocks.map(b => b.code.length));
  report("B3) the web app — every data file the shell loads by src (" + appDataFiles.length + ", the Album module among them) and every inline <script> block of docs/app/index.html (" + (appBlocks.length - appDataFiles.length) + " blocks, the studio itself among them) as one page scope: clean",
    appBlocks.length >= 4 && bigApp > 1000000 && rApp.parseErrors.length === 0 && rApp.findings.length === 0, { blocks: appBlocks.map(b => [b.line, b.code.length]), ...brief(rApp) });

  const rSw = F.scanScript(read("docs/app/sw.js"), { kind: "script", globals: U(F.ECMA, F.WORKER) });
  report("B4) the service worker (docs/app/sw.js) over the worker globals: clean", !rSw.parseError && rSw.findings.length === 0, brief(rSw));

  const landBlocks = F.inlineScripts(LANDING).map(b => ({ name: "docs/index.html", code: b.code, line: b.line }));
  const rLand = F.scanSurface(landBlocks, { globals: U(F.ECMA, F.BROWSER) });
  report("B5) the landing page — its inline blocks (" + landBlocks.length + ", the JSON-LD block skipped): clean", landBlocks.length >= 5 && rLand.parseErrors.length === 0 && rLand.findings.length === 0, brief(rLand));

  const admBlocks = F.inlineScripts(read("docs/admin/index.html")).map(b => ({ name: "docs/admin/index.html", code: b.code, line: b.line }));
  admBlocks.push({ name: "docs/admin/admin.js", code: read("docs/admin/admin.js") });
  const rAdm = F.scanSurface(admBlocks, { globals: U(F.ECMA, F.BROWSER) });
  report("B6) the admin console — index.html inline blocks + admin.js as one page scope: clean", admBlocks.length >= 2 && rAdm.parseErrors.length === 0 && rAdm.findings.length === 0, brief(rAdm));

  const serverFiles = U(fs.readdirSync(path.join(ROOT, "server")).filter(f => f.endsWith(".js")).map(f => "server/" + f),
    fs.readdirSync(path.join(ROOT, "server/lib")).filter(f => f.endsWith(".js")).map(f => "server/lib/" + f));
  const sAll = [], sErr = [];
  for (const f of serverFiles) { const r = F.scanScript(read(f), { kind: "cjs", globals: U(F.ECMA, F.NODE) }); if (r.parseError) sErr.push({ file: f, error: r.parseError }); for (const x of r.findings) sAll.push({ file: f, ...x }); }
  report("B7) the API service — server/*.js + server/lib/*.js (" + serverFiles.length + " CommonJS modules) over the Node globals: clean", serverFiles.length >= 25 && sErr.length === 0 && sAll.length === 0, brief({ findings: sAll, parseErrors: sErr }));

  /* ---------------- C. the two fixes ---------------- */
  const CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, ""); /* the note that replaced the section names what it called */
  report("C1) main.js — the Pipeline Chain Builder is gone with its state, its settings hooks, its guide entry, its card binding and its fifteen i18n keys in every dictionary; the note that replaces it names the scan; and (6.170.0) the three-tap Learn cycle is gone too — no armGate, no GEN_GUIDES, and Freeform's GENERATE guards on state.busy itself",
    !/PIPELINE CHAIN BUILDER|bindPipeline|runPipeline|buildMergedPipeline|sanitizePipeline|paintPipeline|addPipeStep|buildRetouchPrompt|state\.pipeline|pipeRunning|pipeMerge|PIPE_MAX|cPipeH/.test(CODE) &&
    !/\b(crd_pipe|pipe_[a-z_]+|st_pipe[a-z_]*|g_pipe)\b/.test(MAIN) &&
    /v6\.160\.0 — the Pipeline Chain Builder \(v3\.0\) lost its card/.test(MAIN) && /verify_no_undeclared_identifiers\.js\) found the call; the dead code is gone/.test(MAIN) &&
    !/GEN_GUIDES|function armGate|state\.learnMode|function showPromptStage|function guidePlace/.test(CODE) &&
    /v6\.170\.0 — THE THREE-TAP LEARN CYCLE IS GONE; GENERATE RUNS ON THE FIRST TAP\./.test(MAIN) &&
    /if \(state\.busy\) return;   \/\* never start a second run on top of one \*\//.test(MAIN), null);

  const LIFTER = read("tools/build_panel_studio_suites.js");
  const SUITES = read("panel/js/hnk_studio_suites.js");
  const FIN = read("panel/js/hnk_finish_engines.js");
  const pub = "globalThis.svGet=svGet; globalThis.svSet=svSet;";
  report("C2) the studio module publishes its settings store the moment a retouch page is built — the lifter's exports block carries the line, the generated hnk_studio_suites.js carries it inside build(H), and the finish engines read exactly that store (settings via globalThis.svGet; finishPassOn as lifted from the app)",
    LIFTER.indexOf('"  ' + pub + '",') > 0 && LIFTER.indexOf(pub) < LIFTER.indexOf('"  return {",') &&
    SUITES.indexOf(pub) > SUITES.indexOf("function build(H){") && SUITES.indexOf(pub) < SUITES.indexOf("var API={build:build") &&
    /var g = \(typeof globalThis\.svGet === "function"\) \? globalThis\.svGet : function \(k, d\) \{ return d; \};/.test(FIN) && /function finishPassOn\(\)\{\n\s*try\{\n\s*if\(state\.v2 && state\.v2\.quality==="hd"\) return true;\n\s*if\(svGet\("st_hd",false\)\) return true;/.test(FIN),
    { lifter: LIFTER.indexOf(pub), suites: SUITES.indexOf(pub) });

  /* a VM proof over the real lifted file: the page branch (no `module`), a bare `state`, and the store arriving later */
  const ctx = { state: {}, console }; vm.createContext(ctx);
  vm.runInContext(FIN, ctx);
  const before = { on: ctx.finishPassOn(), face: ctx.rhFinishSettings().face, engine: ctx.rhFinishSettings().engine.id };
  ctx.svGet = function (k, d) { return k === "st_hd" ? true : k === "st_fin_engine" ? "faces" : k === "st_fin_face" ? "keep" : d; };
  const after = { on: ctx.finishPassOn(), face: ctx.rhFinishSettings().face, engine: ctx.rhFinishSettings().engine.id };
  report("C3) VM · the lifted finish engines with no store: HD Finish reads off, engine standard, face auto (the panel's whole history); the same functions once svGet exists on the global: HD Finish on, the chosen engine (faces), face keep",
    before.on === false && before.face === "auto" && before.engine === "standard" && after.on === true && after.face === "keep" && after.engine === "faces", { before, after });

  /* ---------------- the real panel: Retouch A mounted, the store published, the finish engines reading it ---------------- */
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
  let pan = { errs: ["not run"] };
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
    pan = await page.evaluate(async () => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 15000) r(); else setTimeout(w, 40); })(); });
      out.beforeMount = { svGet: typeof window.svGet, on: (function () { try { return finishPassOn(); } catch (e) { return "threw"; } })() };
      switchPage("meitu"); await settle();
      await until(() => typeof window.svGet === "function"); await settle();
      out.afterMount = { svGet: typeof window.svGet, svSet: typeof window.svSet, hd0: window.svGet ? window.svGet("st_hd", false) : null };
      if (typeof window.svSet === "function") {
        window.svSet("st_hd", true); window.svSet("st_fin_engine", "faces"); window.svSet("st_fin_face", "keep");
        out.chosen = { on: finishPassOn(), engine: rhFinishSettings().engine.id, face: rhFinishSettings().face, api: HNK.finishEngines.settings().engine.id };
        window.svSet("st_hd", false); window.svSet("st_fin_engine", "standard"); window.svSet("st_fin_face", "auto");
        out.reset = { on: finishPassOn(), engine: rhFinishSettings().engine.id, face: rhFinishSettings().face };
      }
      out.groups = document.querySelectorAll("#muHost .grp").length;
      return out;
    });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  report("C4) panel · before any retouch page the store is absent and finishPassOn reads off without throwing; mounting Retouch A publishes svGet / svSet; the HD Finish chip + engine faces + face keep chosen through the store are what finishPassOn, rhFinishSettings and HNK.finishEngines.settings now return, and resetting them returns the defaults",
    pan.beforeMount && pan.beforeMount.svGet === "undefined" && pan.beforeMount.on === false &&
    pan.afterMount && pan.afterMount.svGet === "function" && pan.afterMount.svSet === "function" && pan.groups > 0 &&
    pan.chosen && pan.chosen.on === true && pan.chosen.engine === "faces" && pan.chosen.face === "keep" && pan.chosen.api === "faces" &&
    pan.reset && pan.reset.on === false && pan.reset.engine === "standard" && pan.reset.face === "auto", pan);
  report("C5) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  /* ---------------- D. release pins ---------------- */
  const wn = WN.appRow("6.89.0", "pgMeitu");
  const wnP = WN.panelRow("6.89.0", "pgMeitu");
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("D1) CI runs this test right after verify_panel_freeform_generate and installs acorn beside Playwright; the landing counts at least 225 tests; What's New carries the 6.89.0 Retouch row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_no_undeclared_identifiers.js") > CI.indexOf("node test/verify_panel_freeform_generate.js") && CI.indexOf("node test/verify_panel_freeform_generate.js") > 0 && tests >= 225 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — every identifier the studio reads is declared, the finish pass reads the student's choice, and the dead pipeline is gone.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
