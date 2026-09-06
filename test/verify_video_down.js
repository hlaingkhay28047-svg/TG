/* v6.28.2 — GREYED VIDEO MODELS.

   Seven rhart-video graphs (wan-2.2 ×3, ltx-2.3 ×4) answer RunningHub's own
   price-preview with a bare "301 PARAMS_INVALID" to the body RunningHub's field
   validator accepts field by field (probe runs #19/#22/#23/#24, docs run #35,
   2026-09-06). The owner's decision: keep them LISTED, greyed, with the reason
   in the student's language, until a probe accepts them again. This test pins
   the flag on exactly those seven in the app and in the panel's hand-synced
   catalog, the picker behaviour in both, the fallback for a stored pick, the
   generate guard, and drives the app.

   Requires docs/app served on http://127.0.0.1:${PORT||8931}/ . */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { withPremium, premiumEntitlement } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 400) : "")); }
  else { fail++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 600) : "")); }
}
const DOWN = ["rhv-wan-2-2-i2v", "rhv-wan-2-2-se2v", "rhv-wan-2-2-t2v", "rhv-ltx-2-3-i2v", "rhv-ltx-2-3-i2v-lora", "rhv-ltx-2-3-t2v", "rhv-ltx-2-3-t2v-lora"];
const APP = read("docs/app/index.html");
const PANEL = read("panel/main.js");
const CAT = read("panel/js/hnk_video_models.js");
const CI = read(".github/workflows/test.yml");
const appBlock = (APP.match(/var RH_VIDEO_MODELS = \[([\s\S]*?)\n\];/) || [])[1] || "";
const flagged = src => [...src.matchAll(/\{ id:"([^"]+)", down:"rh-301",/g)].map(m => m[1]);
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

/* ---- A) the flag ---- */
report("A) exactly the seven wan-2.2 / ltx-2.3 graphs carry down:\"rh-301\" in the app's catalog, nothing else does",
  JSON.stringify(flagged(appBlock).sort()) === JSON.stringify([...DOWN].sort()) && (appBlock.match(/down:"rh-301"/g) || []).length === 8 /* seven entries + the DOWN note */, flagged(appBlock));
report("A2) the panel's hand-synced catalog carries the same seven flags",
  JSON.stringify(flagged(CAT).sort()) === JSON.stringify([...DOWN].sort()) && (CAT.match(/down:"rh-301"/g) || []).length === 8, flagged(CAT));
report("A3) the DOWN note on both catalogs names the evidence and the re-enable rule",
  /DOWN \(v6\.28\.2\) — down:"rh-301"/.test(appBlock) && /probe runs #19, #22, #23 — 43 bodies — and #24/.test(appBlock) &&
  /Remove the flag only when the probe lane accepts the row again/.test(appBlock) && /DOWN \(v6\.28\.2\) — down:"rh-301"/.test(CAT));

/* ---- B) the app's behaviour, at the source ---- */
const noteApp = (APP.match(/var RH_DOWN_NOTE=(\{[^\n]*?\});\n/) || [])[1] || "";
const noteKeys = s => LANGS.filter(k => new RegExp("(?:^|[{, ])" + k + ":\\s*\"").test(s));
report("B) the app's RH_DOWN_NOTE speaks all nine languages and names RunningHub in each",
  noteKeys(noteApp).length === 9 && (noteApp.match(/RunningHub/g) || []).length === 9, noteKeys(noteApp));
report("B2) the picker lists a down model disabled, labelled with the note, and keeps it in its family group",
  APP.includes('o.textContent=m.down?rhDownLabel(m):m.label; if(m.down){ o.disabled=true; o.setAttribute("data-down",m.down); } g.appendChild(o);') &&
  APP.includes('function rhDownLabel(m){ return m.label+" — "+L9(RH_DOWN_NOTE); }'));
report("B3) a stored pick of a down model falls back to the first model that answers and the status line says why; the options are repainted in the current language",
  APP.includes('if(rawDef&&rawDef.down){ var upM=rhFirstUpModel(); $("selVidModel").value=upM.id;') &&
  APP.includes('function rhFirstUpModel(){ for(var i=0;i<RH_VIDEO_MODELS.length;i++) if(!RH_VIDEO_MODELS[i].down) return RH_VIDEO_MODELS[i]; return RH_VIDEO_MODELS[0]; }') &&
  APP.includes('rhPaintDownOptions($("selVidModel"));'));
report("B4) GENERATE refuses a down model before anything is uploaded or submitted",
  /var m=vidModelDef\(\);\n  if\(m\.down\)\{ var dn=m\.label\+" — "\+L9\(RH_DOWN_NOTE\); setSt\("stVidGen",dn,"err"\); toast\(dn,"err"\); return; \}/.test(APP));
report("B5) What's New 6.28.2 names the seven and the reason (my + en)",
  /\{ v:"6\.28\.2", kind:"page", ref:"pgVideo",\n\s+t:\{my:"Video model 7 ခု[^"]*RunningHub[^"]*",en:"Seven video models \(Wan 2\.2 ×3 · LTX 2\.3 ×4\)[^"]*RunningHub/.test(APP));

/* ---- C) the panel, in step ---- */
const notePanel = (PANEL.match(/const RH_DOWN_NOTE = (\{[^\n]*?\});\n/) || [])[1] || "";
const enOf = s => (s.match(/en:\s*"([^"]+)"/) || [])[1];
report("C) the panel's RH_DOWN_NOTE speaks the same nine languages, word for word in English",
  noteKeys(notePanel).length === 9 && enOf(notePanel) === enOf(noteApp) && !!enOf(noteApp), { app: enOf(noteApp), panel: enOf(notePanel) });
report("C2) the panel's picker greys a down model, its options painter falls back and repaints, and vidGenerate refuses",
  PANEL.includes('const o = mkOption(m.id, m.down ? vidDownLabel(m) : (m.label || m.id));') &&
  PANEL.includes('if (m.down) { o.disabled = true; o.setAttribute("data-down", m.down); }') &&
  PANEL.includes('if (raw && raw.down) { const up = vidFirstUp(); if (up) { sel0.value = up.id;') &&
  PANEL.includes('vidPaintDownOptions(sel0);') &&
  PANEL.includes('if (m.down) { setStatus((m.label || m.id) + " \\u2014 " + ff9(RH_DOWN_NOTE), "err"); return; }'));
report("CI runs this test", CI.includes("node test/verify_video_down.js"));

/* ---- D) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  const ent = premiumEntitlement(); ent.devices.computer = { id: "dev-pc", label: "PC" }; ent.allowed.ccx_download = true;
  await page.route("**/api/v1/me/entitlement", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ent) }));
  const seen = [];
  await page.route("**/openapi/**", r => { seen.push(r.request().url()); r.fulfill({ status: 500, contentType: "application/json", body: "{}" }); });
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_ws_lang", "en"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const d = await page.evaluate((DOWN) => {
    switchPage("pgVideo");
    const sel = document.getElementById("selVidModel");
    const opts = Array.from(sel.options);
    const down = opts.filter(o => o.disabled).map(o => ({ v: o.value, t: o.textContent, grp: o.parentElement && o.parentElement.label, data: o.getAttribute("data-down") }));
    const wanGroup = opts.find(o => o.value === "rhv-wan-2-2-i2v").parentElement;
    const wanCount = RH_VIDEO_MODELS.filter(m => (m.fam || "HNK") === "Wan").length;
    return { down, total: opts.length, catalog: RH_VIDEO_MODELS.length, wanLabel: wanGroup && wanGroup.label, wanCount,
             enabledOthers: opts.filter(o => !o.disabled).length, note: L9(RH_DOWN_NOTE) };
  }, DOWN);
  report("D) in the picker exactly the seven are disabled, each labelled with the note, each still inside its family group whose count is unchanged",
    d.down.length === 7 && JSON.stringify(d.down.map(x => x.v).sort()) === JSON.stringify([...DOWN].sort()) &&
    d.down.every(x => x.t.endsWith(" — " + d.note) && x.data === "rh-301" && x.grp) &&
    d.wanLabel === "Wan (" + d.wanCount + ")" && d.total === d.catalog && d.enabledOthers === d.catalog - 7,
    { down: d.down.slice(0, 2), wanLabel: d.wanLabel, total: d.total, catalog: d.catalog, note: d.note });
  const f = await page.evaluate(() => {
    const sel = document.getElementById("selVidModel");
    sel.value = "rhv-ltx-2-3-t2v"; updateVidModelUI();
    const after = sel.value, def = vidModelDef();
    return { after, downNow: !!def.down, status: document.getElementById("stVidGen").textContent, first: RH_VIDEO_MODELS.find(m => !m.down).id };
  });
  report("E) a stored pick of a down model falls back to the first model that answers, and the status line names the greyed model and the reason",
    f.after === f.first && !f.downNow && f.status.includes("Ltx 2.3 — T2V (15s)") && f.status.includes("RunningHub-side issue"), f);
  seen.length = 0;   /* judge only what the click sends */
  const g = await page.evaluate(async () => {
    state.rhKey = "test-key";
    const sel = document.getElementById("selVidModel");
    sel.value = "rhv-wan-2-2-t2v";                      /* set behind the UI's back: no updateVidModelUI, so the guard is what stands */
    document.getElementById("stVidGen").textContent = "";
    document.getElementById("vidPrompt").value = "a cat";
    document.getElementById("btnVidGen").click();
    await new Promise(r => setTimeout(r, 600));
    return { status: document.getElementById("stVidGen").textContent, still: sel.value };
  });
  const reached = seen.filter(u => /wan-2\.2|ltx-2\.3|price-preview/.test(u));
  report("F) GENERATE on a down model refuses with the note and never reaches RunningHub for it — no submit, no price-preview",
    g.status.includes("Wan 2.2 — T2V") && g.status.includes("RunningHub-side issue") && reached.length === 0, { status: g.status, seen });
  report("G) no page error while the picker was driven", errs.length === 0, errs);
  await browser.close();
  console.log(`\n${fail ? "FAIL" : "PASS"} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
