/* verify_panel_dead_lookups.js — 6.90.0 / panel 6.161.0
   EVERY CONTROL THE STUDIO LOOKS UP EXISTS — AND EVERY DICTIONARY KEY IS READ.

   6.89.0 proved every identifier is declared. This is the same question one
   level up. An element id a script looks up by literal — $("id"),
   getElementById("id"), the ids handed to bindToggle / bindCard /
   buildObjChips / paintChecks — must exist in the page's HTML or be created by
   the scripts. A lookup that can never resolve is a control that no longer
   exists, and the code behind it is dead — or, as here, a control that was
   never rebuilt and quietly locked a setting at its default.

   What the first run found (test/lib/dead-lookups.js), all fixed in this wave:
     - 129 ids panel/main.js looked up were no longer in panel/index.html: the
       theme picker, the Library-folder card, the URL bars, the relight stage,
       camera pro, wedding, scenes, recipes, batch, nineteen preset buttons,
       eighteen card headers and four toggles — the old Freeform page, left
       behind when the pages became the app's own in 6.51.0. Among them was
       the LEARN MODE SWITCH (tglLearn): Learn Mode defaults to on and could
       not be turned off in Photoshop at all — every GENERATE took three taps.
       The switch is back on the AI Tools ▸ Settings screen (HNK.learnMode).
     - st_nokey: the Video Upscale / Talking Photo / V→V pages showed that raw
       key when the RunningHub key was missing (no dictionary carried it); they
       now say the app's job_needkey line in nine languages.
     - 6,100 dead lines went with the ids (130+ functions, 455 dictionary keys
       nothing read × nine languages, the starter packs' copies of them).
     - the web app: accHideDeviceLimit existed and was never called, so the
       "device limit reached — remove an old device" line outlived the slot it
       described; devLimitAct never existed.
     - version files: docs/download/panel-version.json's date moves with the
       release; panel/release-manifest.json's minimum_supported_version is the
       cluster policy's minimum (6.24.0), never the release itself.

   Sections: A the scanner's model · B both surfaces clean · C the dictionaries
   in both directions · D the source pins · E the real panel (the switch, the
   three refusals) · F the release pins.
   Fault-injected while writing: `$("noSuchControl")` appended to main.js fails
   B1; the bridge line removed fails D1/E2.
   Usage: PORT=8931 node test/verify_panel_dead_lookups.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const D = require("./lib/dead-lookups.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const HTML = read("panel/index.html");
const SETTINGS = read("panel/src/ui/screens/settings-screen.js");
const STUDIO_SCREEN = read("panel/src/ui/screens/retouch-studio-screen.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) failures++;
}
function walk(dir, out) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; }
const stripCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

(async () => {
  /* ---------------- A. the scanner's model ---------------- */
  const a = D.scanIds({
    html: '<div id="a"></div><div id="spin"></div>',
    sources: [{ name: "x.js", code: 'function f() { $("a"); getElementById("b"); bindToggle("c", "k"); bindCard("dH", "dB", "k", true); paintChecks([["e", "on"], ["gone", "x"]]); $("spinTxt"); }\n' +
      'function g() { $("zz"); mk("e", 1); const t = `<i id="b">`; const o = { id: "dH" }; el.id = "c"; el.id = "dB"; }' }],
    creators: ["mk"], computed: (id, ids) => /Txt$/.test(id) && ids.has(id.replace(/Txt$/, ""))
  });
  report("A1) the scanner sees every lookup form ($, getElementById, binder arguments, paintChecks pairs), every creation form (markup, template strings, id: / .id = , a creator builder) and the computed spinner text — the two controls that exist nowhere are the only findings, each with its function",
    a.dead.map(d => d.id).join() === "gone,zz" && a.dead[1].sites[0].fn === "g" && a.dead[0].sites[0].via === "paintChecks", a.dead);
  const dict = 'const I18N = {\n  en: {\n    used: "a",\n    dead: "b",\n    half: "c",\n    rh_err_x: "d",\n  },\n  my: {\n    used: "x",\n    dead: "y",\n    rh_err_x: "z",\n  },\n};';
  const sd = D.scanDictionary({ dictSrc: dict, readers: 't("used"); t("ghost"); data-i18n="attr"; var lk = "rh_err_" + String(code); t(lk);', langs: ["en", "my"] });
  report("A2) the dictionary scanner names a key one language lacks, a key nothing reads, and a key the code reads that no language carries — and a key built by concatenation (\"rh_err_\" + code) counts as read",
    sd.missing.length === 1 && sd.missing[0].key === "half" && sd.unread.join() === "dead,half" && sd.readButUndefined.join() === "ghost" && sd.prefixes.join() === "rh_err_", sd);

  /* ---------------- B. both surfaces ---------------- */
  const srcs = [...HTML.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  const panelFiles = srcs.map(s => ({ name: "panel/" + s, code: read("panel/" + s) }));
  /* the app's Retouch result markup the panel replaces on purpose (its $ hands those ids a void element) */
  const replaced = new Set([...((STUDIO_SCREEN.match(/var REPLACED_IDS = \{([\s\S]*?)\n\};/) || ["", ""])[1]).matchAll(/([A-Za-z0-9_]+): 1/g)].map(m => m[1]));
  const rPanel = D.scanIds({ html: HTML, sources: panelFiles, creators: [], computed: (id, ids) => (/Txt$/.test(id) && ids.has(id.replace(/Txt$/, ""))) });
  const panelDead = rPanel.dead.filter(d => !d.sites.every(s => s.file === "panel/js/hnk_studio_suites.js" && replaced.has(d.id)));
  report("B1) the panel — every id its " + panelFiles.length + " scripts look up exists in panel/index.html or is created by them (spinner texts are computed from their spinner's id; the app's Retouch result ids the studio module replaces by design are the only allowance, and the panel's $ voids exactly those)",
    panelFiles.length >= 60 && replaced.size >= 30 && panelDead.length === 0, panelDead.slice(0, 20));
  const creatorsOk = /^\s*function mk\(id,[^\n]*\n[\s\S]{0,300}\.id\s*=\s*id/m.test(APP) && /^\s*function pchip\(id,[^\n]*\n[\s\S]{0,400}\.id\s*=\s*id/m.test(APP);
  const rApp = D.scanIds({ html: APP, sources: [{ name: "docs/app/index.html", code: APP }], creators: ["mk", "pchip"] });
  report("B2) the web app — every id its scripts look up exists in the page or is built by mk() / pchip(), both of which assign the id they are handed", creatorsOk && rApp.dead.length === 0, { creatorsOk, dead: rApp.dead.slice(0, 20) });

  /* ---------------- C. the dictionaries ---------------- */
  const lines = MAIN.split("\n");
  const da = lines.findIndex(l => /^const I18N = \{/.test(l)); let db = da; for (let i = da + 1; i < lines.length; i++) { if (/^\};/.test(lines[i])) { db = i; break; } }
  const dictSrc = lines.slice(da, db + 1).join("\n");
  /* a lifted module that defines its own t() reads its own dictionary (the app's TR block travels with it) — never main.js's I18N */
  const OWN_T = /(?:^|\n)\s*(?:function t\(|(?:var|let|const)\s+t\s*=)/;
  const moduleFiles = walk(path.join(ROOT, "panel/src"), []).concat(walk(path.join(ROOT, "panel/js"), [])).map(f => ({ name: path.relative(ROOT, f), code: fs.readFileSync(f, "utf8") }));
  const selfDict = moduleFiles.filter(m => /^panel\/js\//.test(m.name) && OWN_T.test(m.code));   /* panel/src helpers that define a t() only wrap main.js's (dom.t → HNK.i18n) */
  const readers = lines.slice(0, da).join("\n") + "\n" + lines.slice(db + 1).join("\n") + "\n" + HTML + "\n" +
    moduleFiles.filter(m => selfDict.indexOf(m) < 0).map(m => m.code).join("\n");
  const dd = D.scanDictionary({ dictSrc, readers, langs: LANGS });
  const sizes = LANGS.map(l => (dd.per[l] || new Set()).size);
  report("C1) the nine full dictionaries carry the same " + sizes[0] + " keys, every key the panel's code / markup / modules read exists in all nine, and no key is left that nothing reads",
    sizes.every(n => n === sizes[0] && n >= 150) && dd.missing.length === 0 && dd.readButUndefined.length === 0 && dd.unread.length === 0, { sizes, missing: dd.missing.slice(0, 5), readButUndefined: dd.readButUndefined, unread: dd.unread.slice(0, 20), prefixes: dd.prefixes });
  const la = MAIN.indexOf("const I18N_L = {"); const lb = MAIN.indexOf("\n};", la); const packs = MAIN.slice(la, lb);
  const allKeys = new Set(); for (const l of LANGS) for (const k of dd.per[l] || []) allKeys.add(k);
  const packKeys = [...packs.matchAll(/(?<=[{,])([a-z][a-z0-9_]*):"/g)].map(m => m[1]);
  const strays = [...new Set(packKeys.filter(k => !allKeys.has(k)))];
  report("C2) the fifteen native starter packs (I18N_L) carry only keys the nine full dictionaries carry — nothing a full language lost survives there",
    packKeys.length > 200 && strays.length === 0 && /^bn:\{/m.test(packs), { packKeys: packKeys.length, strays: strays.slice(0, 20) });
  const selfMiss = selfDict.map(m => {
    const reads = [...new Set([...m.code.matchAll(/\bt\(\s*"([a-z][a-z0-9_]*)"\s*\)/g)].map(x => x[1]))];
    return { name: m.name, reads: reads.length, missing: reads.filter(k => m.code.indexOf("\"" + k + "\":{") < 0 && !(new RegExp("(?<![\\w$])" + k + "\\s*:\\s*\\{")).test(m.code)) };
  });
  report("C3) the lifted modules that carry their own dictionary (" + selfDict.map(m => path.basename(m.name)).join(", ") + ") read only keys that dictionary carries — those reads are theirs, not main.js's",
    selfDict.length === 2 && selfMiss.every(m => m.reads >= 10 && m.missing.length === 0), selfMiss);

  /* ---------------- D. the fixes, pinned in source ---------------- */
  const CODE = stripCode(MAIN);
  report("D1) v6.170.0 — the Learn Mode switch is gone with the three-tap cycle it governed: main.js publishes no HNK.learnMode and keeps no state.learnMode, the AI Tools Settings screen draws no #hnkSetLearn, the ai_learn_mode string is gone from every dictionary, and the note in settings-screen.js says why",
    !/HNK\.learnMode|state\.learnMode/.test(CODE) && !/hnkSetLearn|ai_learn_mode|LEARN_FALLBACK/.test(stripCode(SETTINGS)) &&
    MAIN.indexOf("ai_learn_mode") < 0 &&
    /v6\.170\.0 — the Learn Mode switch is gone with the three-tap cycle it governed\./.test(SETTINGS) &&
    !/tglLearn|bindToggle\(/.test(CODE), null);
  const needkey = (MAIN.match(/if \(!state\.rhKey\) \{ setStatus\(t\("job_needkey"\), "err"\); return; \}/g) || []).length;
  report("D2) the missing-key refusal — Video Upscale, Talking Photo and V→V read job_needkey (the app's wording, nine languages); st_nokey is gone",
    needkey === 3 && (MAIN.match(/^    job_needkey: "/gm) || []).length === 9 && !/st_nokey/.test(MAIN) &&
    /^async function vuRun\(\) \{[\s\S]{0,400}job_needkey/m.test(MAIN) && /^async function tkRun\(\) \{[\s\S]{0,400}job_needkey/m.test(MAIN) && /^async function vtRun\(\) \{[\s\S]{0,400}job_needkey/m.test(MAIN), { needkey });
  const gone = ["PRESETS", "bindCard(", "bindGroup(", "bindToggle(", "buildObjChips(", "paintChecks(", "renderLightStage", "buildCameraPrompt", "applyRecipe", "batchRun", "saveResultToDisk", "populateSelects", "openUrlBar", "bindScenes", "replaceMixRun", "sceneGenerate", "refreshPromptMeta", "registerWeddingPresets", "applyRealDirRouting", "CARD_PAINT", "wpTrailGo", "finalPromptBox", "promptBoxMy", "selRecentPrompts"];
  const stateLit = (MAIN.match(/const state = \{[\s\S]*?\n\};/) || [""])[0];
  const fieldsGone = ["autoRun", "intensity", "sections", "clean", "rmix", "i2p", "lights", "lightEquip", "chains", "restMode", "recentPrompts", "refTarget", "match", "bdayAge", "capText", "wedTrail", "camOn", "camIso", "autoSave", "sessionLog", "batch", "urlSlot", "cUrlSlot", "lastPreset"];
  report("D3) the old Freeform page's code is gone from main.js (" + gone.length + " names) and its fields from the state literal (" + fieldsGone.length + "); the settings file no longer carries them; autoPlace and the Library token stay, and (6.170.0) Learn Mode's own five fields left with the cycle",
    gone.every(n => CODE.indexOf(n) < 0) && fieldsGone.every(f => !(new RegExp("(?<![\\w$])" + f + "\\s*:")).test(stateLit)) &&
    !/learnMode|armedKey|armedEl|armTimer|armStage/.test(stateLit) && /autoPlace: true/.test(stateLit) && /libToken: ""/.test(stateLit) &&
    !/autoSave: state\.autoSave|camOn: state\.camOn|wedTrail: state\.wedTrail|sections: state\.sections|recentPrompts: state\.recentPrompts/.test(MAIN) && !/learnMode: state\.learnMode,/.test(MAIN),
    { gone: gone.filter(n => CODE.indexOf(n) >= 0), fields: fieldsGone.filter(f => (new RegExp("(?<![\\w$])" + f + "\\s*:")).test(stateLit)) });
  report("D4) the web app — accHideDeviceLimit is called wherever a registration comes back without a limit (three sites) and after a slot is released; devLimitAct, an element that never existed, is looked up nowhere",
    (APP.match(/if \(d && d\.limit\) accShowDeviceLimit\(\); else accHideDeviceLimit\(\);/g) || []).length === 3 &&
    /await unifiedRefresh\(true\);\n    accHideDeviceLimit\(\);   \/\* v6\.90\.0/.test(APP) && APP.indexOf("devLimitAct") < 0 && /^function accHideDeviceLimit\(\)\{/m.test(APP), null);
  const manifest = JSON.parse(read("panel/release-manifest.json")); const policy = JSON.parse(read("docs/download/panel-version.json")); const CONTRACT = read("test/verify_release_contract.js");
  report("D5) the version files — the download page's panel-version.json carries the release's date, its minimum_supported_version is the cluster policy (6.24.0) and the release-manifest repeats that minimum (never the release itself); the release contract pins exactly that",
    policy.released === manifest.released && policy.minimum_supported_version === "6.24.0" && manifest.minimum_supported_version === policy.minimum_supported_version && manifest.version === policy.latest_version &&
    /panelRelease\.minimum_supported_version === panelPolicyMinimum/.test(CONTRACT) && /const panelPolicyMinimum = JSON\.parse\(read\("docs\/download\/panel-version\.json"\)\)\.minimum_supported_version;/.test(CONTRACT),
    { policy, manifestMin: manifest.minimum_supported_version, manifestReleased: manifest.released });

  /* ---------------- E. the real panel ---------------- */
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
      const $$ = id => document.getElementById(id);
      /* -- v6.170.0: the switch and the cycle it governed are gone; GENERATE runs on the first tap -- */
      HNK.aiToolsApp.navigate("settings"); await settle();
      out.gone = { bridge: !(window.HNK && window.HNK.learnMode), field: typeof state.learnMode === "undefined",
        gate: typeof armGate === "undefined", box: !document.getElementById("guideBox"), btn: !$$("hnkSetLearn") };
      switchPage("prompt"); await settle();
      let ran = 0; const keepRun = runGenerate;
      runGenerate = function () { ran++; return Promise.resolve(); };
      const g = $$("btnGenerate");
      out.genBtn = !!g;
      if (g) { g.click(); await settle(); }
      out.firstTap = ran;
      state.busy = true; if (g) { g.click(); await settle(); } state.busy = false;
      out.whileBusy = ran;
      runGenerate = keepRun;
      /* -- the three refusals without a key -- */
      const keep = state.rhKey; state.rhKey = "";
      const seen = []; const origStatus = setStatus; setStatus = function (m, k) { seen.push({ m: String(m), k: k }); };
      try { await vuRun(); } catch (e) { seen.push({ m: "threw " + e }); }
      try { await tkRun(); } catch (e) { seen.push({ m: "threw " + e }); }
      try { await vtRun(); } catch (e) { seen.push({ m: "threw " + e }); }
      setStatus = origStatus; state.rhKey = keep;
      out.refusals = seen; out.wantKey = t("job_needkey");
      return out;
    });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }
  report("E1) panel · nothing of Learn Mode is left to look up — no HNK.learnMode bridge, no state.learnMode, no armGate, no #guideBox in the document, and no switch on the AI Tools ▸ Settings screen",
    pan.gone && pan.gone.bridge && pan.gone.field && pan.gone.gate && pan.gone.box && pan.gone.btn, pan.gone);
  report("E2) panel · Freeform's GENERATE runs on the FIRST tap (one tap, one run) and a tap while a run is in flight starts nothing",
    pan.genBtn && pan.firstTap === 1 && pan.whileBusy === 1, { genBtn: pan.genBtn, firstTap: pan.firstTap, whileBusy: pan.whileBusy });
  report("E3) panel · with no RunningHub key, Video Upscale, Talking Photo and V→V each refuse with the job_needkey line (an error status, never the raw key)",
    pan.refusals && pan.refusals.length === 3 && pan.refusals.every(r => r.m === pan.wantKey && r.k === "err") && !/st_nokey/.test(pan.wantKey), { refusals: pan.refusals, want: pan.wantKey });
  report("E4) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  /* ---------------- F. release pins ---------------- */
  const wn = WN.appRow("6.90.0", "pgHome");
  const wnP = WN.panelRow("6.90.0", "pgHome");
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("F1) CI runs this test right after verify_no_undeclared_identifiers; the landing counts at least 226 tests; What's New carries the 6.90.0 row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_dead_lookups.js") > CI.indexOf("node test/verify_no_undeclared_identifiers.js") && CI.indexOf("node test/verify_no_undeclared_identifiers.js") > 0 && tests >= 226 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn, { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — every control the studio looks up exists, every dictionary key is read, the three-tap gate is gone, and the refusals speak.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
