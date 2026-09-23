/* verify_panel_v2_layer.js — 6.127.1 / panel 6.198.1
 *
 * WHY THIS EXISTS. The owner asked one question — "in the CCX, can Retouch V2
 * call the Active layer?" — and the honest answer was half yes.
 *
 * Walking the real panel: the V2 card's "Add a photo" DID open the Layer ·
 * File sheet, the Photoshop layer WAS captured, state.refs[0] carried it, the
 * status line said "Layer added as photo ✓" and V2 RETOUCH was enabled. And
 * the card still read "Add a photo". The picture only appeared after leaving
 * the page and coming back.
 *
 * That is the 6.163.0 defect, word for word, surviving in a second place.
 * 6.164.0 fixed it for Retouch A/B by teaching main.js's renderRefs — the
 * repaint that EVERY route filling the slot ends at — about the studio
 * screen's #stPicker. V2 Retouch draws through the app's own lifted
 * #rsPicker and was never added to that call, so it kept the bug, and it
 * never gained the two marks the A/B card got in the same release: the
 * layer's name under the picture and a ↻ that reads the active layer again.
 *
 * This test holds all of it:
 *   A) the source — renderRefs calls BOTH pickers, the screen exports the V2
 *      one, the decorator only marks a photo that came from a layer, and the
 *      lifted V2 picker asks the host (not the browser's dead file input).
 *   B) the panel walked for real — capture, the card, the caption, the ↻ that
 *      captures again, a file photo that draws neither, and clearing.
 *   C) the release pins.
 *
 * Fault injection: remove the renderRs line from main.js and B2 fails (the
 * card stays empty, which is the owner's report); remove decorateRs and B3
 * fails; point the lifted picker back at #filePick and B1 fails (no sheet). */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const PMAIN = read("panel/main.js");
const RSCREEN = read("panel/src/ui/screens/retouch-studio-screen.js");
const PSUITES = read("panel/js/hnk_studio_suites.js");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const PWN = read("panel/js/hnk_whats_new.js");
const VER = "6.130.0", PVER = "6.201.0";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ===================== A) the source ===================== */
function sourcePins() {
  /* the one repaint every fill route ends at must name BOTH cards. The A/B
     line is 6.164.0's; the V2 line is this release's, and the order matters
     only in that both are inside renderRefs and not somewhere a page switch
     would have to reach. */
  const rr = PMAIN.slice(PMAIN.indexOf("\nfunction renderRefs()"), PMAIN.indexOf("\nfunction renderRefs()") + 2200);
  report("A1) main.js renderRefs repaints the Retouch A/B card AND the V2 Retouch card — the studio screen's two entry points, each guarded",
    rr.indexOf("renderPicker") > 0 && rr.indexOf("renderRs") > 0 &&
    /typeof sc\.renderPicker === "function"/.test(rr) && /typeof sc\.renderRs === "function"/.test(rr), {
      picker: rr.indexOf("renderPicker") > 0, rs: rr.indexOf("renderRs") > 0 });

  report("A2) the studio screen exports renderRs, and it repaints the V2 picker, the V2 hero and the layer marks together",
    /renderRs:\s*renderRsCard/.test(RSCREEN) &&
    /function renderRsCard\(\)[\s\S]{0,420}API\.renderRsPicker[\s\S]{0,200}API\.renderV2Hero[\s\S]{0,120}decorateRs\(\)/.test(RSCREEN),
    null);

  /* the screen's own renderRefs — what the app's studio module calls through
     H — must go through the same function, or the two paths drift */
  report("A3) the screen's own renderRefs paints both cards through the same two functions",
    /function renderRefs\(\)\s*\{\s*renderStPicker\(\);\s*renderRsCard\(\);\s*\}/.test(RSCREEN), null);

  /* the decorator is honest: only a photo whose label names a layer gets the
     caption and the ↻, and it never stacks a second pair on a repaint */
  const dec = RSCREEN.slice(RSCREEN.indexOf("function decorateRs()"), RSCREEN.indexOf("function decorateRs()") + 1400);
  report("A4) decorateRs marks only a photo captured from a layer, never twice, and its ↻ asks the host to read the active layer again",
    /\/\^Layer:\/\.test/.test(dec) && has(dec, 'box.querySelector(".x.re")') && has(dec, "b.pickLayer()") &&
    has(dec, "icons/ui/i-reset-muted.png") && has(dec, '"tag src"'), null);

  /* the lifted V2 picker asks the host. #filePick is a void element in the
     panel, so the app's own line would be a button that does nothing. */
  report("A5) the panel's lifted V2 picker opens the host's photo sheet (H.pickPhoto), not the browser's file input — which the panel replaces with a void element",
    /renderRsPicker\(\)[\s\S]{0,1400}H\.pickPhoto\(\)/.test(PSUITES) &&
    !/renderRsPicker\(\)[\s\S]{0,1400}filePick/.test(PSUITES) &&
    /renderRsPicker\(\)[\s\S]{0,1400}\$\("filePick"\)\.click\(\)/.test(APP) && has(RSCREEN, "filePick: 1"), null);

  /* and the host's pickPhoto really is the Layer · File sheet */
  report("A6) the host's pickPhoto is the Layer · File sheet on the shared PHOTO slot, and that slot writes state.refs[0]",
    /pickPhoto: function \(\) \{ try \{ stPickInto\("subject-reference", "PHOTO"\)/.test(PMAIN) &&
    /function stPickInto\(slotId, title\) \{\s*photoSheet\(title, \{\s*onLayer:/.test(PMAIN) &&
    /id: "subject-reference",[\s\S]{0,140}state\.refs\[0\] = cap; renderRefs\(\)/.test(PMAIN), null);
}

/* ===================== B) the panel, walked ===================== */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } },
      null, { timeout: 30000 }).catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(1000);
    /* one Photoshop layer the host will hand over, counted on every read */
    await page.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 40; cv.height = 60;
      const g = cv.getContext("2d"); g.fillStyle = "#c98a5b"; g.fillRect(0, 0, 40, 60);
      const b64 = cv.toDataURL("image/jpeg", 0.9).split(",")[1];
      window.__capCalls = 0;
      window.captureLayerB64Direct = async function () { window.__capCalls++; return { b64: b64, mime: "image/jpeg", label: "Layer: Bride retouch v2", w: 40, h: 60 }; };
    });
    await page.evaluate(() => { try { switchPage("retouch"); } catch (e) { } });
    await page.waitForTimeout(1200);

    const w = await page.evaluate(async () => {
      const p = document.getElementById("rsPicker");
      const o = { empty: !!p.querySelector(".add"), addText: (p.querySelector(".add") || {}).textContent || "" };
      p.querySelector(".add").click(); await new Promise(r => setTimeout(r, 300));
      const sheet = document.getElementById("ffSheet");
      o.sheet = !!sheet;
      o.doors = sheet ? Array.from(sheet.querySelectorAll(".btn")).length : 0;
      const first = sheet && sheet.querySelector(".btn");
      o.firstIsLayer = !!(first && /layer/i.test(first.textContent || ""));
      first.click(); await new Promise(r => setTimeout(r, 900));
      /* the card, WITHOUT any nudge from the test */
      o.filled = !!p.querySelector(".ref.filled img");
      o.tag = (p.querySelector(".tag.src") || {}).textContent || null;
      o.re = !!p.querySelector(".x.re");
      o.reSrc = (p.querySelector(".x.re img") || { getAttribute: () => "" }).getAttribute("src");
      o.caps = window.__capCalls;
      try { o.label = state.refs[0] && state.refs[0].label; } catch (e) { o.label = "ERR"; }
      o.startOn = !(document.getElementById("btnV2Start") || {}).disabled;
      /* the ↻ reads the layer again and the card stays filled */
      p.querySelector(".x.re").click(); await new Promise(r => setTimeout(r, 900));
      o.again = { caps: window.__capCalls, filled: !!p.querySelector(".ref.filled img"), tag: !!p.querySelector(".tag.src") };
      /* a photo from a file names no layer, so it draws neither mark */
      state.refs[0] = { mime: "image/jpeg", b64: state.refs[0].b64, label: "bride.jpg" };
      renderRefs(); await new Promise(r => setTimeout(r, 150));
      o.file = { filled: !!p.querySelector(".ref.filled img"), re: !!p.querySelector(".x.re"), tag: !!p.querySelector(".tag.src") };
      /* a second repaint must not stack a second ↻ */
      renderRefs(); renderRefs(); await new Promise(r => setTimeout(r, 100));
      state.refs[0] = { mime: "image/jpeg", b64: state.refs[0].b64, label: "Layer: Bride retouch v2.jpg" };
      renderRefs(); renderRefs(); await new Promise(r => setTimeout(r, 150));
      o.once = { re: p.querySelectorAll(".x.re").length, tag: p.querySelectorAll(".tag.src").length };
      /* clearing empties the card */
      p.querySelector(".ref.filled .x:not(.re)").click(); await new Promise(r => setTimeout(r, 250));
      o.cleared = !!p.querySelector(".add");
      return o;
    });

    report("B1) V2 Retouch's empty card opens the photo sheet, and its first door is the Photoshop layer",
      w.empty && /V2 Retouch/.test(w.addText) && w.sheet && w.doors >= 2 && w.firstIsLayer, w);
    report("B2) the capture lands AND the card shows it at once — the owner's report: captured, the status said so, and the card still read \"Add a photo\" until the page was left and re-entered",
      w.caps === 1 && w.label === "Layer: Bride retouch v2.jpg" && w.filled && w.startOn, w);
    report("B3) the card names the layer it came from and carries a ↻ that reads the active layer again (+1 capture, still filled and still named)",
      w.tag === "Layer · Bride retouch v2" && w.re && /icons\/ui\/i-reset-muted\.png$/.test(w.reSrc || "") &&
      w.again.caps === 2 && w.again.filled && w.again.tag, w);
    report("B4) a photo chosen from a file draws neither mark, repeated repaints never stack a second pair, and ✕ empties the card",
      w.file.filled && !w.file.re && !w.file.tag && w.once.re === 1 && w.once.tag === 1 && w.cleared, w);
    report("B5) no page error in the panel while all of that ran", errs.length === 0, errs);
  } finally {
    await page.close().catch(() => { });
    server.close();
  }
}

/* ===================== C) the release ===================== */
function releasePins() {
  const man = JSON.parse(read("panel/manifest.json"));
  const rel = JSON.parse(read("panel/release-manifest.json"));
  const ver = JSON.parse(read("docs/app/version.json"));
  const appVer = (APP.match(/APP_VER\s*=\s*"([\d.]+)"/) || [])[1];
  report(`C1) ${VER} / panel ${PVER} in lockstep — the web app, version.json, the service worker's cache name, the panel manifest and the release manifest`,
    appVer === VER && ver.v === VER && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + VER.replace(/\./g, "-") + '"') &&
    String(man.version) === PVER && String(rel.version) === PVER,
    { appVer, ver: ver.v, panel: man.version, rel: rel.version });

  /* 6.128.0 — this wave shipped as 6.127.1 and led the strip that day; the row
     is found rather than read at 0 now that a release sits above it.
     6.129.0 — one more release above it. */
  const wn = JSON.parse(read("docs/app/data/whatsnew.js").replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const WAVE_V = "6.127.1";
  const row = wn.find(r => r.v === WAVE_V);
  report(`C2) the What's New strip carries the ${WAVE_V} row, in all nine languages, with a bold-led excerpt, and the panel's lifted table carries it (it led the strip when this wave shipped)`,
    !!row && wn.indexOf(row) <= 3 && LANGS.every(l => row.t[l] && row.s[l] && !row.t[l].startsWith("**") && row.s[l].startsWith("**")) &&
    has(PWN, '"v":"' + WAVE_V + '"'), row && { at: wn.indexOf(row), kind: row.kind, ref: row.ref });

  report("C3) CI runs this test right after the skin-card check, and the suite counts 271 invocations (269 when this release shipped; 6.128.0 added verify_gen_loading_billing)",
    has(CI, "run: node test/verify_skin_age_guard.js") && has(CI, "run: PORT=8931 node test/verify_panel_v2_layer.js") &&
    CI.indexOf("verify_skin_age_guard.js") < CI.indexOf("verify_panel_v2_layer.js") &&
    (CI.match(/node test\//g) || []).length === 272 && has(LANDING, "272 tests"),
    { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log("\nverify_panel_v2_layer: " + (failures ? failures + " failed" : "all checks passed"));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — the run itself threw :: " + (e && e.message)); process.exit(1); });
