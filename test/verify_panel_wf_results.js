/* verify_panel_wf_results.js — 6.83.0 / panel 6.154.0
   THE SIXTEEN PHOTOGRAPHS OF 6.153.0 — the Smart Workflow wizard shows its
   results, compares them with IMAGE 1, keeps its history, and lets the
   student write the prompt.

   The owner wrote: "Smart workflow မှာ Results Before after compare history
   ထည့်ပေးပါ … smartworkflow prompts ကို ဖြည့်ပြင် ဖြုတ်လို့ရအောင် အရှင်ထားပေးပါ".
   Four things the photographs showed:

     1. A run ended in a green "Done." and a Photoshop layer, and the wizard
        showed nothing of what it had made. Every result is recorded now
        (HNK.wfResults, from bootstrap as it lands, with the IMAGE 1 that went
        in) and the wizard draws a Results card under GENERATE: the picture,
        Before | After on a percent slider, Place again · Run again · Use as
        IMAGE 1 · Open in Edit · Remove, a board of this workflow's runs (the
        gallery folder's earlier ones on request) and the History rows.
     2. The compiled prompt went out unseen. The app's step-3 "Advanced — edit
        the prompt" box is on the panel: the live compiled text, editable; an
        edit is sent verbatim (state.promptOverride, request.promptEdited);
        Reset brings the live prompt back.
     3. The Reference Scenes result showed IMAGE 2's person at IMAGE 2's
        head-and-shoulders crop while IMAGE 1 was a full-body photograph. The
        record now tells the model, in the IMAGE 2 role and again in RESULT,
        that IMAGE 2's person is not in the photograph and that the output
        frame IS IMAGE 1's frame (aspect, crop, subject size and position).
     4. The URL prompt's OK button printed its key, "btn_ok" — the key existed
        in no language table. It does now, in all nine, beside wiz_promptnote.

   Fault-injected while writing: the record call removed from bootstrap fails
   A2 and C11; the override dropped from the compiler fails B2 and C2; the
   hardening sentences removed fails A6; btn_ok removed fails A5 and C12. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const LANGS = ["en", "my", "shn", "kac", "th", "zh", "vi", "id", "ms"];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const BOOT = read("panel/src/app/bootstrap.js");
const WFRES = read("panel/src/app/wf-results.js");
const STATE = read("panel/src/workflows/workflow-state.js");
const COMPILER = read("panel/src/workflows/workflow-request-compiler.js");
const GALLERY = read("panel/src/app/gallery-store.js");
const INDEX = read("panel/index.html");
const CSS = read("panel/styles.css");
const CAT = read("panel/js/hnk_wf_catalog_data.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

/* small real PNGs — three different pictures, so a src can be told apart */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngRGB(w, h, shade) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 3, shade); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG_A = pngRGB(40, 60, 0x40), PNG_B = pngRGB(40, 60, 0x80), PNG_C = pngRGB(40, 60, 0xc0);
const URL_A = "data:image/png;base64," + PNG_A.toString("base64");
const URL_B = "data:image/png;base64," + PNG_B.toString("base64");
const URL_C = "data:image/png;base64," + PNG_C.toString("base64");

const Q = String.fromCharCode(39);
const OWNER = "Reference scenes from image 2 keep image 1 subject frame and composition and scenes follow the subject compose";
const HARD_A = "If IMAGE 2 shows a person, that person is NOT in this photograph: ignore them completely — do not keep, blend, resize or re-pose them, and do not take their head size, framing or crop.";
const HARD_B = "The output frame IS IMAGE 1" + Q + "s frame: the same aspect ratio, the same crop (a full-body photograph stays full-body from head to feet; a head-and-shoulders portrait stays head-and-shoulders), the same subject size and position — the scene fills in around the person, the person is never re-fitted to the scene.";
const TAIL = "Never return IMAGE 2 itself, and never put IMAGE 2" + Q + "s person in the frame.";

/* ---------------- A. source pins ---------------- */
function sourcePins() {
  report("A1) wf-results.js ships (record · list · latest · get · remove · clear · subscribe, CAP 24, HNK.wfResults), holds data: URLs only and index.html loads it after the gallery store and before bootstrap",
    /function record\(r\)/.test(WFRES) && /var CAP = 24;/.test(WFRES) && /globalThis\.HNK\.wfResults = API/.test(WFRES) && /_isDataImage\(r\.after\)\) return null/.test(WFRES) &&
    ["record", "list", "latest", "get", "remove", "clear", "subscribe"].every(k => new RegExp("\\b" + k + ": " + k + "\\b").test(WFRES)) &&
    INDEX.indexOf('<script src="src/app/gallery-store.js"></script>') < INDEX.indexOf('<script src="src/app/wf-results.js"></script>') &&
    INDEX.indexOf('<script src="src/app/wf-results.js"></script>') < INDEX.indexOf('<script src="src/app/bootstrap.js"></script>'), null);
  report("A2) bootstrap records every smart-workflow result as it lands — the IMAGE 1 that went in, the prompt that made it, promptEdited, model, ratio, size — never blocking the run, and the handle carries placeResult",
    /wr\.record\(\{ workflowId: request\.workflowId, before: firstIn, after: r && r\.ref,/.test(BOOT) && /promptEdited: !!request\.promptEdited/.test(BOOT) &&
    /request\.mode === "smart-workflow" && res\.results/.test(BOOT) && /async function placeResult\(ref, workflowId, modelId(, regionBounds)?\)/.test(BOOT) && /placeResult: placeResult,/.test(BOOT) &&
    BOOT.indexOf("wr.record(") > BOOT.indexOf("gs.save(") && BOOT.indexOf("wr.record(") < BOOT.indexOf("if (s.addAsNewLayer === false)"), null);
  report("A3) the state carries promptOverride (empty = the live prompt; cleared when a workflow is chosen; setPromptOverride exported, whitespace clears) and the compiler sends it verbatim, flagging promptEdited on the request",
    /promptOverride: "",/.test(STATE) && /state\.promptOverride = "";\s*\/\* v6\.83\.0/.test(STATE) && /function setPromptOverride\(state, text\)/.test(STATE) && /setPromptOverride: setPromptOverride,/.test(STATE) &&
    /state\.promptOverride = t\.trim\(\) \? t\.slice\(0, 6000\) : "";/.test(STATE) &&
    /if \(state\.promptOverride && String\(state\.promptOverride\)\.trim\(\)\) \{\s*prompt = String\(state\.promptOverride\);\s*promptEdited = true;/.test(COMPILER) && /promptEdited: promptEdited,/.test(COMPILER) &&
    COMPILER.indexOf("prompt = String(state.promptOverride)") > COMPILER.indexOf("prompt += _scenePresetLine(state);"), null);
  const ids = ["hnkWfAdvH", "hnkWfAdvB", "hnkWfPrompt", "hnkWfPromptReset", "hnkWfPromptState", "hnkWfResults", "hnkWfResultImg", "hnkWfCmpBtn", "hnkWfCmpWrap", "hnkWfCmpRange", "hnkWfImgBefore", "hnkWfImgAfter",
    "hnkWfPlaceAgain", "hnkWfRunAgain", "hnkWfUseAsInput", "hnkWfToFreeform", "hnkWfResultDel", "hnkWfBoard", "hnkWfEarlier", "hnkWfHistory", "hnkWfHistAll"];
  const dicts = ["L_ADV", "L_PROMPT_RESET", "L_PROMPT_EDITED", "L_PROMPT_LIVE", "L_RESULTS", "L_RES_EMPTY", "L_SAVED", "L_PLACE_AGAIN", "L_RUN_AGAIN", "L_USE_AS_IN", "L_USED_AS_IN", "L_OPEN_EDIT", "L_REMOVE", "L_BOARD", "L_EARLIER", "L_HIST_ALL"];
  const nine = dicts.filter(d => { const m = new RegExp("var " + d + " = \\{([^\\n]*)\\};").exec(SCREEN); return m && LANGS.every(l => new RegExp("(^\\s*|[,{]\\s*)" + l + ': "').test(m[1])); });
  report("A4) the wizard draws the Advanced box after the pickers and the Results card under GENERATE (every control by id), repaints the live prompt on refresh, and every new label carries all nine languages",
    ids.every(id => SCREEN.indexOf('"' + id + '"') >= 0) && nine.length === dicts.length && /renderAdvanced\(root, wf\);/.test(SCREEN) && /nodes\.results = dom\.el\(doc, "div", \{ class: "hnk-wf-results", id: "hnkWfResults" \}\);/.test(SCREEN) &&
    SCREEN.indexOf("renderGenOpts(root, wf);") < SCREEN.indexOf("renderAdvanced(root, wf);") && SCREEN.indexOf("root.appendChild(nodes.generate);") < SCREEN.indexOf("nodes.results = dom.el(") &&
    /try \{ paintPromptLive\(\); \} catch \(e\) \{ \}/.test(SCREEN) && /unsubscribeResults\(\); wstate\.reset\(state\); renderList\(\);/.test(SCREEN) && /w\.subscribe\(function \(\) \{/.test(SCREEN),
    { missing: ids.filter(id => SCREEN.indexOf('"' + id + '"') < 0), nine: nine.length });
  const okRows = MAIN.match(/^    btn_ok: "[^"]+",$/gm) || [], noteRows = MAIN.match(/^    wiz_promptnote: "[^"]+",$/gm) || [];
  const appNote = /wiz_promptnote: \{([^\n]*)\},/.exec(APP);
  const appNoteMy = appNote && /my: '([^']*)'/.exec(appNote[1]), appNoteEn = appNote && /en: '((?:[^'\\]|\\.)*)'/.exec(appNote[1]);
  report("A5) main.js carries btn_ok and wiz_promptnote in all nine tables (OK · အိုကေ · ตกลง · 确定), the app's wiz_promptnote speaks nine languages too and its Burmese/English equal the panel's, and HNK.bufToB64 + HNK.wfToFreeform are published",
    okRows.length === 9 && noteRows.length === 9 && okRows.indexOf('    btn_ok: "OK",') >= 0 && okRows.indexOf('    btn_ok: "အိုကေ",') >= 0 && okRows.indexOf('    btn_ok: "ตกลง",') >= 0 && okRows.indexOf('    btn_ok: "确定",') >= 0 &&
    !!appNote && LANGS.every(l => new RegExp("(^\\s*|[,{]\\s*)" + l + ": '").test(appNote[1])) && !!appNoteMy && noteRows.indexOf('    wiz_promptnote: "' + appNoteMy[1] + '",') >= 0 &&
    !!appNoteEn && noteRows.indexOf('    wiz_promptnote: "' + appNoteEn[1].replace(/\\'/g, "'") + '",') >= 0 &&
    /g\.HNK\.bufToB64 = bufToB64;/.test(MAIN) && /g\.HNK\.wfToFreeform = function \(beforeRef, afterRef\)/.test(MAIN) && /studioAskText\(msg, def\)[\s\S]{0,2000}ok\.textContent = t\("btn_ok"\)/.test(MAIN),
    { ok: okRows.length, note: noteRows.length, appNote: !!appNote });
  const lib = require("../tools/lib/app-data.js").readLibWf();
  const w = lib.workflows.find(x => x.id === "reference-scenes");
  const cat = JSON.parse(CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
  const pw = cat.categories.flatMap(c => c.items).find(x => x.id === "reference-scenes");
  report("A6) the Reference Scenes record says, inside the IMAGE 2 role, that IMAGE 2's person is not in the photograph, and inside RESULT that the output frame IS IMAGE 1's frame — while the 6.32.3 pins still hold (owner's sentence first, the roles, the same last sentence, no FRAME LOCK / guard / token); the AVOID list names IMAGE 2's framing and head size and a tighter crop; the panel catalog opens with the same bytes (its two house lines follow)",
    !!w && w.prompt.indexOf(OWNER + "\n\nINPUT ROLES:\n- IMAGE 1 is the ONLY edit target and the ONLY person in the result.") === 0 && w.prompt.indexOf(HARD_A) > 0 && w.prompt.indexOf(HARD_B) > 0 &&
    w.prompt.indexOf(HARD_A) < w.prompt.indexOf("Never copy its person, its pose, its framing or its crop") && w.prompt.indexOf(HARD_B) > w.prompt.indexOf("\n\nRESULT: ") && w.prompt.endsWith(HARD_B + " " + TAIL) &&
    !/FRAME LOCK|TASK GUARD|EXTRA REQUEST|\{\{/.test(w.prompt) && /IMAGE 2's framing, IMAGE 2's head size, head-and-shoulders crop of a full-body subject, tighter crop than IMAGE 1, subject re-fitted to the scene$/.test(w.negative) &&
    !!pw && pw.prompt.indexOf(w.prompt) === 0 && pw.negative.indexOf(w.negative) === 0,
    w && { head: w.prompt.slice(0, 80), tail: w.prompt.slice(-90), neg: w.negative.slice(-120), panel: !!pw && pw.prompt.indexOf(w.prompt) === 0 });
  const wn = (APP.match(/\{ v:"6\.83\.0", kind:"page", ref:"pgWf",[\s\S]*?\} \},\n/) || [""])[0];
  const wnP = (WHATS.match(/\{ v:"6\.83\.0", kind:"page", ref:"pgWf",[\s\S]*?\} \},\n/) || [""])[0];
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A7) the compare draws in percent only (.cmp-top width, the Before picture 100/pct % wide) with no new object-fit; CI runs this test right after verify_panel_freeform_sources; the landing counts at least 218 tests; What's New carries the 6.83.0 page row (pgWf) in nine languages on the app and the panel",
    /\.apg \.hnk-wf-cmp \.cmp-top img \{ position: absolute; left: 0; top: 0; display: block; width: 200%; max-width: none; height: auto; \}/.test(CSS) && /nodes\.cmpBefore\.style\.width = \(pct > 0 \? \(10000 \/ pct\) : 100\) \+ "%"/.test(SCREEN) &&
    !/hnk-wf[^\n]*object-fit/.test(CSS) &&
    CI.indexOf("node test/verify_panel_wf_results.js") > CI.indexOf("node test/verify_panel_freeform_sources.js") && CI.indexOf("node test/verify_panel_wf_results.js") > 0 && tests >= 218 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /Results/.test(wn) && /Before/.test(wn) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });
}

/* ---------------- B. in Node ---------------- */
function inNode() {
  const wr = require(path.join(PANEL, "src/app/wf-results.js"));
  let ticks = 0; const off = wr.subscribe(() => ticks++);
  const e1 = wr.record({ workflowId: "reference-scenes", before: URL_A, after: URL_B, prompt: "p", model: "nano-banana-2", ratio: "2:3", size: "2k" });
  const none = wr.record({ workflowId: "reference-scenes", before: URL_A, after: "https://x/y.png" });
  const noBefore = wr.record({ workflowId: "other", before: "ref_img1", after: URL_C });
  for (let i = 0; i < 30; i++) wr.record({ workflowId: "flood", after: URL_C });
  const flood = wr.list("flood").length, all = wr.list().length;
  const kept = wr.list("reference-scenes").length; // pushed out by the flood (cap is global, newest first)
  wr.clear("flood");
  const e2 = wr.record({ workflowId: "reference-scenes", before: URL_A, after: URL_C, prompt: "q" });
  const latest = wr.latest("reference-scenes");
  const removed = wr.remove(e2.id), gone = wr.get(e2.id);
  off(); const before = ticks; wr.record({ workflowId: "z", after: URL_B }); const after = ticks;
  report("B1) HNK.wfResults: a data: picture is recorded with what went in (a non-data before is dropped, a non-data after refused), the newest is latest(), the store caps at 24 newest-first, clear(workflowId) empties one workflow, remove() takes one out, subscribers hear every change until they unsubscribe",
    !!e1 && e1.before === URL_A && e1.after === URL_B && e1.model === "nano-banana-2" && e1.ratio === "2:3" && none === null && !!noBefore && noBefore.before === "" &&
    flood === 24 && all === 24 && kept === 0 && wr.list("flood").length === 0 && latest && latest.id === e2.id && removed === true && gone === null && before > 0 && after === before,
    { flood, all, kept, ticks });
  wr.clear();

  const st = require(path.join(PANEL, "src/workflows/workflow-state.js"));
  const comp = require(path.join(PANEL, "src/workflows/workflow-request-compiler.js"));
  const s = st.defaultState(); st.selectWorkflow(s, "reference-scenes");
  st.setInput(s, "img1", { source: "file", ref: URL_A, valid: true }); st.setInput(s, "img2", { source: "file", ref: URL_B, valid: true });
  const live = comp.compile(s);
  st.setPromptOverride(s, "  the student" + Q + "s own words  ");
  const edited = comp.compile(s);
  st.setPromptOverride(s, "   \n ");
  const cleared = comp.compile(s);
  st.setPromptOverride(s, "x"); st.selectWorkflow(s, "reference-scenes");
  report("B2) the compiler: the live prompt opens with the owner's sentence and is not flagged; an override is sent verbatim (spaces kept) with promptEdited, the negative prompt and the images untouched; whitespace clears it; choosing a workflow clears it",
    !!live && live.compiledPrompt.indexOf(OWNER) === 0 && live.promptEdited === false && live.compiledPrompt.indexOf(HARD_A) > 0 &&
    edited.compiledPrompt === "  the student" + Q + "s own words  " && edited.promptEdited === true && edited.negativePrompt === live.negativePrompt && edited.images.length === 2 &&
    cleared.promptEdited === false && cleared.compiledPrompt === live.compiledPrompt && s.promptOverride === "",
    { live: live && live.compiledPrompt.slice(0, 40), edited: edited && edited.compiledPrompt });

  const gs = require(path.join(PANEL, "src/app/gallery-store.js"));
  report("B3) the gallery store can list one workflow's files and read one back (listFor · readDataUrl), and answers empty, not a throw, where there is no UXP",
    typeof gs.listFor === "function" && typeof gs.readDataUrl === "function" && /files\[i\]\.read\(\{ format: uxp\.storage\.formats\.binary \}\)/.test(GALLERY) && /globalThis\.HNK\.bufToB64/.test(GALLERY), null);
  return Promise.all([gs.listFor("reference-scenes"), gs.readDataUrl("x.png")]).then(([l, d]) => {
    report("B4) …listFor → [] and readDataUrl → \"\" without a host", Array.isArray(l) && l.length === 0 && d === "", { l, d });
  });
}

/* ---------------- C. in the panel ---------------- */
async function main() {
  sourcePins();
  await inNode();
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 220)));
  try {
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (/\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(u)) return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(400);

    /* open the Reference Scenes wizard */
    await page.evaluate(() => switchPage("wf"));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("hnkWf_reference-scenes").click());
    await page.waitForTimeout(300);
    const wiz = () => page.evaluate(() => HNK.aiToolsApp.controller().workflow);

    /* ---- C1: the Advanced box ---- */
    const c1 = await page.evaluate((owner) => {
      const st = HNK.aiToolsApp.controller().workflow;
      const live = HNK.workflowRequestCompiler.compile(st).compiledPrompt;
      const h = document.getElementById("hnkWfAdvH"), b = document.getElementById("hnkWfAdvB"), ta = document.getElementById("hnkWfPrompt");
      const closed = b.className;
      h.click();
      const opened = b.className;
      const order = [];
      for (const id of ["hnkWfOpts", "hnkWfAdvH", "hnkWfRouteLine", "hnkWfGenerate", "hnkWfResults"]) { const el = document.getElementById(id); order.push(el ? Array.from(document.querySelectorAll("#hnkAiToolsRoot [id]")).indexOf(el) : -1); }
      return { head: h.textContent, closed, opened, val: ta.value, live, startsOwner: ta.value.indexOf(owner) === 0, hasRoles: ta.value.indexOf("INPUT ROLES") > 0, hasHard: ta.value.indexOf("If IMAGE 2 shows a person") > 0,
        note: b.querySelector("p.mut") && b.querySelector("p.mut").textContent, noteWant: HNK.i18n.t("wiz_promptnote"), state: document.getElementById("hnkWfPromptState").textContent, resetShown: document.getElementById("hnkWfPromptReset").style.display, order, override: st.promptOverride };
    }, OWNER);
    report("C1) the wizard carries \"⚙ Advanced — …\" after the pickers and before the route line; closed at first, a tap opens it; the box holds the live compiled prompt (the owner's sentence, the roles, the new hardening) with the nine-language note above it, the state line says the workflow's prompt is sent and Reset is hidden",
      /^⚙ Advanced — /.test(c1.head) && c1.closed === "hnk-wf-adv-b" && c1.opened === "hnk-wf-adv-b on" && c1.val === c1.live && c1.startsOwner && c1.hasRoles && c1.hasHard &&
      c1.note === c1.noteWant && c1.note !== "wiz_promptnote" && c1.resetShown === "none" && c1.override === "" && c1.order[0] < c1.order[1] && c1.order[1] < c1.order[2] && c1.order[2] < c1.order[3] && c1.order[3] < c1.order[4],
      { head: c1.head, closed: c1.closed, opened: c1.opened, same: c1.val === c1.live, note: (c1.note || "").slice(0, 40), order: c1.order });

    /* ---- C2: an edit is sent verbatim; Reset brings the live prompt back ---- */
    const c2 = await page.evaluate(() => {
      const st = HNK.aiToolsApp.controller().workflow;
      const ta = document.getElementById("hnkWfPrompt");
      ta.value = "the same woman, full body, in that garden"; ta.dispatchEvent(new Event("input", { bubbles: true }));
      const req = HNK.workflowRequestCompiler.compile(st);
      const stLine = document.getElementById("hnkWfPromptState");
      const editedState = { text: stLine.textContent, cls: stLine.className, reset: document.getElementById("hnkWfPromptReset").style.display, override: st.promptOverride };
      document.getElementById("hnkWfPromptReset").click();
      const live = HNK.workflowRequestCompiler.compile(Object.assign({}, st, { promptOverride: "" })).compiledPrompt;
      const back = { val: ta.value, override: st.promptOverride, cls: stLine.className, reset: document.getElementById("hnkWfPromptReset").style.display, edited: HNK.workflowRequestCompiler.compile(st).promptEdited };
      /* typing the live text back is not an edit */
      ta.value = live; ta.dispatchEvent(new Event("input", { bubbles: true }));
      const same = { override: st.promptOverride, cls: stLine.className };
      return { req: { prompt: req.compiledPrompt, edited: req.promptEdited, neg: req.negativePrompt.length }, editedState, back, live, same };
    });
    report("C2) typing in the box makes the student's text the request's whole prompt (promptEdited, the negative prompt still travels), the state line turns to \"edited\" and Reset appears; Reset restores the live prompt and clears the flag; typing the live text back is not an edit",
      c2.req.prompt === "the same woman, full body, in that garden" && c2.req.edited === true && c2.req.neg > 0 && c2.editedState.override === "the same woman, full body, in that garden" && /edited/.test(c2.editedState.cls) && c2.editedState.reset === "" &&
      c2.back.val === c2.live && c2.back.override === "" && !/edited/.test(c2.back.cls) && c2.back.reset === "none" && c2.back.edited === false && c2.same.override === "" && !/edited/.test(c2.same.cls), c2);

    /* ---- C3: the empty Results card ---- */
    const c3 = await page.evaluate(() => ({
      card: !!document.getElementById("hnkWfResults"), empty: !!document.getElementById("hnkWfResultsEmpty"), img: !!document.getElementById("hnkWfResultImg"),
      hist: !!document.getElementById("hnkWfHistory"), histEmpty: !!document.getElementById("hnkWfHistoryEmpty"), board: !!document.getElementById("hnkWfBoard"),
      secs: Array.from(document.querySelectorAll("#hnkWfResults .hnk-sec")).map(e => e.textContent), want: [HNK.i18n.t("ai_history")] }));
    report("C3) before any run the card is there with its empty line, no picture, no board, and an empty History section",
      c3.card && c3.empty && !c3.img && c3.hist && c3.histEmpty && !c3.board && c3.secs.length === 2 && c3.secs[1] === c3.want[0], c3);

    /* ---- C4: a result lands → the picture, its line, the six actions ---- */
    const c4 = await page.evaluate(([a, b]) => {
      const e = HNK.wfResults.record({ workflowId: "reference-scenes", before: a, after: b, prompt: "p", model: "nano-banana-2", ratio: "2:3", size: "2k" });
      const im = document.getElementById("hnkWfResultImg");
      const ids = ["hnkWfCmpBtn", "hnkWfPlaceAgain", "hnkWfRunAgain", "hnkWfUseAsInput", "hnkWfToFreeform", "hnkWfResultDel"].map(id => !!document.getElementById(id));
      return { id: e && e.id, src: im && im.src, meta: (document.getElementById("hnkWfResultMeta") || {}).textContent, saved: !!document.getElementById("hnkWfResultSaved"), empty: !!document.getElementById("hnkWfResultsEmpty"), ids, board: !!document.getElementById("hnkWfBoard"),
        acts: Array.from(document.querySelectorAll("#hnkWfResActs .hnk-btn")).map(x => x.textContent) };
    }, [URL_A, URL_B]);
    report("C4) the moment a result is recorded the card shows it (the picture, \"Nano Banana 2 · 2K · 2:3\", the Saved line) with Before/After · Place again · Run again · Use as IMAGE 1 · Open in Edit · Remove, and no board for a single run",
      !!c4.id && c4.src === URL_B && /Nano Banana 2/.test(c4.meta) && /2K/.test(c4.meta) && /2:3/.test(c4.meta) && c4.saved && !c4.empty && c4.ids.every(Boolean) && !c4.board && c4.acts.length === 6 && c4.acts[0] === "Before/After",
      { src: c4.src === URL_B, meta: c4.meta, ids: c4.ids, acts: c4.acts });

    /* ---- C5: Before | After on a percent slider ---- */
    const c5 = await page.evaluate(() => {
      document.getElementById("hnkWfCmpBtn").click();
      const wrap = document.getElementById("hnkWfCmpWrap"), top = document.getElementById("hnkWfCmpTop"), line = document.getElementById("hnkWfCmpLine");
      const bef = document.getElementById("hnkWfImgBefore"), aft = document.getElementById("hnkWfImgAfter"), r = document.getElementById("hnkWfCmpRange");
      const at50 = { top: top.style.width, line: line.style.left, bef: bef.style.width };
      r.value = "30"; r.dispatchEvent(new Event("input", { bubbles: true }));
      const at30 = { top: top.style.width, line: line.style.left, bef: parseFloat(bef.style.width) };
      const tags = Array.from(wrap.querySelectorAll(".hnk-wf-cmp-tags span")).map(s => s.textContent);
      return { has: !!wrap, cls: document.getElementById("hnkWfCmpBtn").className, befSrc: bef.src, aftSrc: aft.src, at50, at30, tags, rangeType: r.getAttribute("type"), inCmp: !!wrap.querySelector(".cmp") };
    }, []);
    report("C5) Before/After opens the compare: IMAGE 1 under the divider, the result behind it, 50 % at first; moving the slider to 30 sets the window 30 % wide, the divider at 30 % and the Before picture 333.3 % of the window — percent only, no ruler — under \"← Before (IMAGE 1)\" / \"After →\"",
      c5.has && / on$/.test(c5.cls) && c5.befSrc === URL_A && c5.aftSrc === URL_B && c5.at50.top === "50%" && c5.at50.line === "50%" && c5.at50.bef === "200%" &&
      c5.at30.top === "30%" && c5.at30.line === "30%" && Math.abs(c5.at30.bef - 333.333) < 0.01 && c5.tags[0] === "← Before (IMAGE 1)" && c5.tags[1] === "After →" && c5.rangeType === "range" && c5.inCmp,
      { at50: c5.at50, at30: c5.at30, tags: c5.tags, cls: c5.cls });

    /* ---- C6: a second run → the board, selection, Remove ---- */
    const c6 = await page.evaluate(([a, c]) => {
      const e2 = HNK.wfResults.record({ workflowId: "reference-scenes", before: a, after: c, prompt: "p2", model: "nano-banana-2", ratio: "2:3", size: "2k" });
      const afterRecord = { src: document.getElementById("hnkWfResultImg").src, thumbs: Array.from(document.querySelectorAll("#hnkWfBoard .hnk-wf-board-th")).map(t => ({ on: / on$/.test(t.className), id: t.getAttribute("data-id"), src: t.querySelector("img").src })),
        cmpStill: !!document.getElementById("hnkWfCmpWrap"), subh: (document.querySelector("#hnkWfResults .subh") || {}).textContent };
      const second = document.queryelectorAll ? null : document.querySelectorAll("#hnkWfBoard .hnk-wf-board-th")[1];
      second.click();
      const afterPick = { src: document.getElementById("hnkWfResultImg").src, on: Array.from(document.querySelectorAll("#hnkWfBoard .hnk-wf-board-th")).map(t => / on$/.test(t.className)) };
      document.getElementById("hnkWfResultDel").click();
      const afterDel = { n: HNK.wfResults.list("reference-scenes").length, src: document.getElementById("hnkWfResultImg").src, board: !!document.getElementById("hnkWfBoard") };
      return { e2: e2 && e2.id, afterRecord, afterPick, afterDel };
    }, [URL_A, URL_C]);
    report("C6) a second result becomes the one on view, a board of both appears under the app's \"Results from this workflow\" line with the newest marked, the compare stays open; tapping the older thumbnail brings it back on view; Remove takes it out of the store and the card repaints with the one left",
      c6.afterRecord.src === URL_C && c6.afterRecord.thumbs.length === 2 && c6.afterRecord.thumbs[0].on && !c6.afterRecord.thumbs[1].on && c6.afterRecord.thumbs[0].src === URL_C && c6.afterRecord.thumbs[1].src === URL_B && c6.afterRecord.cmpStill && /Results from this workflow|workflow/.test(c6.afterRecord.subh || "") &&
      c6.afterPick.src === URL_B && c6.afterPick.on[1] === true && c6.afterPick.on[0] === false && c6.afterDel.n === 1 && c6.afterDel.src === URL_C && !c6.afterDel.board,
      { rec: c6.afterRecord.thumbs.map(t => t.on), pick: c6.afterPick.on, del: c6.afterDel });

    /* ---- C7: Use as IMAGE 1 chains the result ---- */
    const c7 = await page.evaluate(() => {
      document.getElementById("hnkWfUseAsInput").click();
      const st = HNK.aiToolsApp.controller().workflow;
      const th = document.querementById ? null : document.getElementById("hnkWfThumb_img1");
      return { ref: st.requiredInputs[0].image && st.requiredInputs[0].image.ref, source: st.requiredInputs[0].image && st.requiredInputs[0].image.source, thumb: th && th.firstChild && th.firstChild.src, mark: document.querySelector("#hnkWfThumb_img1") && document.querySelectorAll(".hnk-req-mark")[0].textContent };
    });
    report("C7) \"Use as IMAGE 1\" puts the result on view into the first slot (source result, the thumbnail shows it, the slot ticks) — the chain the app's students use to run one look after another",
      c7.ref === URL_C && c7.source === "result" && c7.thumb === URL_C && c7.mark === "✓", c7);

    /* ---- C8: History rows of this workflow ---- */
    const c8 = await page.evaluate(() => {
      HNK.aiToolsBoot.services.history.addFromRequest({ mode: "smart-workflow", workflowId: "reference-scenes", model: "nano-banana-2", output: { size: "2k", ratio: "2:3" } }, { now: 1, timeLabel: "10:00" });
      HNK.aiToolsBoot.services.history.addFromRequest({ mode: "smart-workflow", workflowId: "studio-look-copy", model: "nano-banana-2", output: { size: "2k", ratio: "2:3" } }, { now: 2, timeLabel: "10:01" });
      HNK.aiToolsApp.workflowScreen().select("reference-scenes");
      const rows = Array.from(document.querySelectorAll("#hnkWfHistory .hnk-hist")).map(r => ({ meta: r.querySelector(".hnk-hist-meta").textContent, rerun: r.querySelector(".hnk-btn") && r.querySelector(".hnk-btn").textContent }));
      return { rows, all: !!document.getElementById("hnkWfHistAll"), empty: !!document.getElementById("hnkWfHistoryEmpty"), rerunWant: HNK.i18n.t("ai_rerun"), stillResult: !!document.getElementById("hnkWfResultImg"), override: HNK.aiToolsApp.controller().workflow.promptOverride };
    });
    report("C8) the History section lists this workflow's sanitized runs only (\"10:00 · Nano Banana 2 · 2K · 2:3\", not Studio Look Copy's) with Re-run and an \"All history →\" door; re-opening the workflow keeps the session's results on the card and clears any prompt edit",
      c8.rows.length === 1 && c8.rows[0].meta === "10:00 · Nano Banana 2 · 2K · 2:3" && c8.rows[0].rerun === c8.rerunWant && c8.all && !c8.empty && c8.stillResult && c8.override === "", c8);

    /* ---- C9: Open in Edit hands Before + After to Freeform ---- */
    const c9 = await page.evaluate(([a, c]) => {
      document.getElementById("hnkWfToFreeform").click();
      const b64 = (u) => u.split(",")[1];
      return { page: state.page, result: state.resultB64 === b64(c), before: state.beforeB64 === b64(a), mime: state.resultMime, hist: state.history[0] && state.history[0].action, box: (document.getElementById("resultBox") || {}).className };
    }, [URL_A, URL_C]);
    report("C9) \"Open in Edit\" lands on Freeform with the result as After and IMAGE 1 as Before, entered into Freeform's own results history, the result box on",
      c9.page === "prompt" && c9.result && c9.before && c9.mime === "image/png" && c9.hist === "workflow" && / on$/.test(c9.box || ""), c9);

    /* ---- C10: a real run through runViaProvider records itself ---- */
    await page.evaluate(() => switchPage("wf"));
    await page.waitForTimeout(200);
    const c10 = await page.evaluate(async ([a, b]) => {
      HNK.wfResults.clear();
      const st = HNK.aiToolsApp.controller().workflow;
      HNK.workflowState.setInput(st, "img1", { source: "file", ref: a, valid: true });
      HNK.workflowState.setInput(st, "img2", { source: "file", ref: b, valid: true });
      HNK.aiToolsApp.workflowScreen().refresh();
      const req = HNK.workflowRequestCompiler.compile(st);
      const prev = window.fetch;
      const json = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }));
      const calls = [];
      window.fetch = function (url, init) {
        url = String(url); calls.push(((init && init.method) || "GET") + " " + url.slice(0, 90));
        if (url.indexOf("myqcloud.com") >= 0) { const bytes = Uint8Array.from(atob(b.split(",")[1]), ch => ch.charCodeAt(0)); return Promise.resolve(new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } })); }
        if (url.indexOf("/media/upload/binary") >= 0) return json({ code: 0, data: { download_url: "https://rh-hk-images-switch.xiaoyaoyou.com/input/openapi/a.jpg" } });
        if (url.indexOf("/openapi/v2/query") >= 0) return json({ taskId: "t-1", status: "SUCCESS", results: [{ url: "https://rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com/output/z.png" }] });
        if (url.indexOf("runninghub.ai/openapi/v2/") >= 0) return json({ taskId: "t-1" });
        return prev(url, init);
      };
      let res;
      try { res = await HNK.aiToolsBoot.runViaProvider(req); } finally { window.fetch = prev; }
      const e = HNK.wfResults.latest("reference-scenes");
      const im = document.getElementById("hnkWfResultImg");
      return { ok: res && res.ok, n: HNK.wfResults.list("reference-scenes").length, before: e && e.before === req.images[0].ref, after: e && /^data:image\/png;base64,/.test(e.after), edited: e && e.promptEdited, prompt: e && e.prompt === req.compiledPrompt,
        model: e && e.model, ratio: e && e.ratio, onCard: !!im && !!e && im.src === e.after, calls: calls.filter(u => /runninghub|xiaoyaoyou|myqcloud/.test(u)).length, err: res && res.error && res.error.code };
    }, [URL_A, URL_B]);
    report("C10) a run through the real provider path — upload · submit · query SUCCESS · download — records itself: IMAGE 1 as before, the downloaded PNG as after, the compiled prompt, unflagged, the model and ratio, and the card shows it at once",
      c10.ok === true && c10.n === 1 && c10.before && c10.after && c10.edited === false && c10.prompt && c10.model === "nano-banana-2" && c10.onCard && c10.calls >= 4, c10);

    /* ---- C11: the URL prompt's OK button speaks ---- */
    const c11 = await page.evaluate(async () => {
      const p = studioAskText("x", "");
      await new Promise(r => setTimeout(r, 50));
      const dlg = document.querySelector("dialog.hnk-dlg");
      const ok = dlg && dlg.querySelector(".btn-gold"), no = dlg && dlg.querySelector(".hnk-dlg-row .btn");
      const out = { ok: ok && ok.textContent, want: t("btn_ok"), cancel: no && no.textContent, cancelWant: t("btn_cancel") };
      if (no) no.click();
      await p;
      return out;
    });
    report("C11) the URL prompt's OK button reads the panel's own word (never the key \"btn_ok\") beside Cancel",
      !!c11.ok && c11.ok === c11.want && c11.ok !== "btn_ok" && c11.cancel === c11.cancelWant, c11);

    report("C12) nothing threw in the panel while all of that ran", errs.length === 0, errs);

    /* ---------------- D. the web app's wizard carries the same compare ---------------- */
    const APP_PORT = process.env.PORT || 8931;
    const { withPremium } = require("./_seed_premium.js");
    const appBrowser = withPremium(browser);
    const ap = await appBrowser.newPage({ viewport: { width: 390, height: 844 } });
    const appErrs = []; ap.on("pageerror", e => appErrs.push(String(e).slice(0, 240)));
    try {
      await ap.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
      await ap.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await ap.waitForTimeout(2600);
      const d1 = await ap.evaluate(async ([a, b]) => {
        state.refs = [];
        window.openWorkflowById("reference-scenes");
        await new Promise(r => setTimeout(r, 200));
        state.refs[0] = { b64: a.split(",")[1], mime: "image/png", label: "me" };
        window._wizShowResult({ b64: b.split(",")[1], mime: "image/png" });
        await new Promise(r => setTimeout(r, 150));
        const btn = document.querySelector("#wiz .wiz-cmp-btn");
        const before = { btn: !!btn, cmp: !!document.querySelector("#wiz .wiz-cmp"), acts: document.querySelectorAll("#wiz .wiz-acts .btn").length, result: !!document.querySelector("#wiz .wiz-result") };
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 150));
        const cw = document.querySelector("#wiz .wiz-cmp"), top = cw && cw.querySelector(".cmp-top"), ib = top && top.querySelector("img"), ia = cw && cw.querySelector(".wiz-cmp-after"), ln = cw && cw.querySelector(".cmp-line"), rg = document.getElementById("wizCmpRange");
        const at50 = cw && { top: top.style.width, line: ln.style.left, bef: ib.style.width, befSrc: ib.src, aftSrc: ia.src };
        if (rg) { rg.value = "25"; rg.dispatchEvent(new Event("input", { bubbles: true })); }
        const at25 = cw && { top: top.style.width, line: ln.style.left, bef: parseFloat(ib.style.width) };
        const tags = cw ? Array.from(cw.querySelectorAll(".wiz-cmp-tags span")).map(x => x.textContent) : [];
        const active = document.querySelector("#wiz .wiz-cmp-btn") && document.querySelector("#wiz .wiz-cmp-btn").className;
        return { before, at50, at25, tags, active };
      }, [URL_A, URL_B]);
      report("D1) the web app's wizard result step carries the same Before/After: the button beside Download · Saved · Run again · Open in Edit, the compare opening at 50 % with IMAGE 1 under the divider and the result behind, 25 % → window 25 %, divider 25 %, Before 400 % — percent only, the panel's rule",
        d1.before.btn && !d1.before.cmp && d1.before.acts === 5 && d1.before.result && !!d1.at50 && d1.at50.top === "50%" && d1.at50.line === "50%" && d1.at50.bef === "200%" && d1.at50.befSrc === URL_A && d1.at50.aftSrc === URL_B &&
        d1.at25.top === "25%" && d1.at25.line === "25%" && Math.abs(d1.at25.bef - 400) < 0.01 && d1.tags[0] === "\u2190 Before (IMAGE 1)" && d1.tags[1] === "After \u2192" && / active/.test(d1.active || ""), d1);
      const d2 = await ap.evaluate(() => {
        const note = /wiz_promptnote/.test(document.documentElement.outerHTML) ? "" : "";
        const langs = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
        const keep = LANG; const out = {};
        for (const l of langs) { LANG = l; out[l] = t("wiz_promptnote"); }
        LANG = keep;
        return { out, distinct: new Set(Object.values(out)).size, note };
      });
      report("D2) the app's wiz_promptnote answers in all nine languages (nine distinct lines, none the key)",
        Object.keys(d2.out).length === 9 && d2.distinct === 9 && Object.values(d2.out).every(v => v && v !== "wiz_promptnote"), d2);
      report("D3) nothing threw in the web app", appErrs.length === 0, appErrs);
    } finally { await ap.close(); }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
