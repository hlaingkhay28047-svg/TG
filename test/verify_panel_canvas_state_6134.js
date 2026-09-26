/* 6.134.0 / panel 6.205.0 — THE CANVAS THAT COULD NOT SAVE ITSELF.
 *
 * THE PHOTOGRAPH. The owner opened the Album page in Photoshop 27.10.0 (panel 6.203.0) and the
 * panel's own error line read:
 *
 *     album:  x.save is not a function @ hnk_album.js:4250
 *
 * Line 4250 is the first statement of drawLook(), which paints the paper a standee page stands
 * on. Adobe's UXP renderer DRAWS — fillRect, fillText, drawImage have worked since 6.135.0 — but
 * the 2D context it hands out has no save() and no restore(). The web app's Album module uses
 * them twenty times, Imagine once more, and nobody had ever asked whether the host had them.
 *
 * WHAT THE CRASH REALLY COST, MEASURED. With the renderer crippled the way Photoshop's is, the
 * Album page builds SEVEN of its thirteen cards and FORTY-FOUR of its 234 controls. It is not
 * that the labels lose their words — C4 reads them and they are all there, in Burmese. The draw
 * throws and the rest of the page is never built. One root cause, both symptoms.
 *
 * THE FIX. panel/src/app/uxp-canvas.js, loaded second (behind the storage shim, ahead of every
 * module that draws), wraps getContext so every 2D context can save and restore. The state stack
 * keeps the twelve properties the panel assigns and undoes the transform with an inverse log —
 * exact, because canvas transform ops post-multiply, and it needs only translate/rotate/scale,
 * which a host with no setTransform still has. ellipse() is rebuilt from translate+scale+arc.
 * setLineDash, where the host has none, draws solid and SAYS SO. In a browser the shim installs
 * nothing at all.
 *
 * B1 is the proof that matters: the same drawing, once on a native context and once on a crippled
 * one with the shim fitted, must come back PIXEL-IDENTICAL over all 160,000 bytes.
 *
 * And the panel now MEASURES its own renderer: a SELF-TEST "Canvas" row prints what the host has,
 * which fallbacks are live, and NAMES anything the panel uses that is still missing — so the next
 * one arrives as a row in a photograph instead of as a dead page.
 *
 * A) source pins   B) the shim measured against a native context   C) the panel, crippled the way
 * Photoshop is, before and after   D) release pins
 * Usage: PORT=8931 node test/verify_panel_canvas_state_6134.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js"), INDEX = read("panel/index.html");
const SHIM = read("panel/src/app/uxp-canvas.js");
const ALBUM = read("panel/js/hnk_album.js");
/* 6.137.0 — the owner photographed "hnk_album.js:4250", and that number was drawLook's first
   statement IN THE BUILD THEY PHOTOGRAPHED. It is a fact about that afternoon, not about the
   file, and the album module has grown since (the frame's own exposure and contrast). C2 still
   demands the live stack name drawLook's own x.save() — it just works out which line that is
   rather than being re-pinned by hand every time a line is added above it. */
const DRAW_SAVE_LINE = (function () {
  const lines = ALBUM.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/function drawLook\(x, look, X, Y, W, Hh\)\{/.test(lines[i])) continue;
    for (let k = i; k < Math.min(lines.length, i + 8); k++) if (/^\s*x\.save\(\);/.test(lines[k])) return k + 1;
  }
  return -1;
})();
const VER = "6.137.0", PVER = "6.208.0";
const COUNT = 279;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".woff2": "font/woff2", ".ico": "image/x-icon" };

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}

/* ===================== A) source pins ===================== */

report("A1) the shim is its own file, loaded second — behind the storage shim (whose own test pins it first) and AHEAD of every js/ and src/ module that draws",
  fs.existsSync(path.join(PANEL, "src/app/uxp-canvas.js")) &&
  INDEX.indexOf('<script src="src/app/uxp-canvas.js"></script>') > INDEX.indexOf('<script src="src/app/uxp-local-storage.js"></script>') &&
  INDEX.indexOf('<script src="src/app/uxp-canvas.js"></script>') < INDEX.indexOf('<script src="js/hnk_album.js"></script>') &&
  INDEX.indexOf('<script src="src/app/uxp-canvas.js"></script>') < INDEX.indexOf('<script src="js/hnk_imagine.js"></script>') &&
  INDEX.indexOf('<script src="src/app/uxp-canvas.js"></script>') < INDEX.indexOf('<script src="main.js"'),
  { canvas: INDEX.indexOf('<script src="src/app/uxp-canvas.js"></script>'), album: INDEX.indexOf('<script src="js/hnk_album.js"></script>') });

report("A2) it names the owner's line and the call sites it covers, and it is panel-only — the web app's browsers have save() and never load it",
  has(SHIM, "x.save is not a function") && has(SHIM, "hnk_album.js:4250") && has(SHIM, "drawLook") &&
  !has(APP, "uxp-canvas") && !fs.existsSync(path.join(ROOT, "docs/app/uxp-canvas.js")),
  { inApp: has(APP, "uxp-canvas") });

/* the two lists in the shim must BE the panel's real usage, or the SELF-TEST row measures the
   wrong thing. Re-derive them here the way the 6.134.0 scan did and compare. */
(function () {
  const CTXVARS = ["x", "cx", "ctx", "fx", "bx", "tx", "x2", "fxc", "target", "MEAS", "cx2"];
  const files = [];
  (function walk(d) {
    fs.readdirSync(d).forEach((f) => {
      const p = path.join(d, f), s = fs.statSync(p);
      if (s.isDirectory()) { if (!/node_modules|icons|fonts/.test(p)) walk(p); }
      else if (/\.js$/.test(f)) files.push(p);
    });
  })(PANEL);
  const calls = new Set(), props = new Set();
  files.forEach((p) => {
    const s = fs.readFileSync(p, "utf8");
    CTXVARS.forEach((v) => {
      const re = new RegExp("\\b" + v + "\\.([A-Za-z_][A-Za-z0-9_]*)", "g");
      let g;
      while ((g = re.exec(s))) {
        const after = s.slice(g.index + g[0].length, g.index + g[0].length + 1);
        (after === "(" ? calls : props).add(g[1]);
      }
    });
  });
  /* the shim's own declared lists */
  const listOf = (name) => {
    const m = SHIM.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\]);"));
    return m ? JSON.parse(m[1].replace(/\s+/g, " ")) : null;
  };
  const used = listOf("USED_METHODS"), state = listOf("STATE_PROPS");
  const missM = (used || []).filter((m) => !calls.has(m));
  /* every 2D method the shim claims to cover must really be called somewhere in the panel, and
     every state property it saves must really be assigned somewhere */
  const missP = (state || []).filter((p) => !props.has(p));
  report("A3) the two lists in the shim are the panel's MEASURED 2D usage, not a guess: every one of the " +
    (used || []).length + " methods and " + (state || []).length + " state properties it names is really used by panel code",
    !!used && !!state && used.length >= 24 && state.length >= 12 && missM.length === 0 && missP.length === 0,
    { missingMethods: missM, missingProps: missP });

  /* and the other way: save/restore really are used by the module the owner's line names */
  report("A4) hnk_album.js still calls save/restore (20 and 24 sites at 6.134.0) and hnk_imagine.js once — the shim is not covering a call site that no longer exists",
    (ALBUM.match(/\.save\(\)/g) || []).length >= 18 && (ALBUM.match(/\.restore\(\)/g) || []).length >= 18 &&
    has(ALBUM, "function drawLook(x, look, X, Y, W, Hh)") && has(read("panel/js/hnk_imagine.js"), "ctx.save()"),
    { save: (ALBUM.match(/\.save\(\)/g) || []).length, restore: (ALBUM.match(/\.restore\(\)/g) || []).length });
})();

report("A5) the SELF-TEST card carries a Canvas row, fed by the shim's own line(), and the shim publishes what that row reads",
  has(MAIN, 'label: "Canvas"') && has(MAIN, "globalThis.HNK.canvasShim") &&
  has(SHIM, "G.HNK.canvasShim.line = function") && has(SHIM, "G.HNK.canvasShim.fit = function") &&
  has(SHIM, "STILL MISSING"),
  { row: has(MAIN, 'label: "Canvas"') });

report("A6) the shim refuses to fake a draw: only save/restore, ellipse and setLineDash get a stand-in, and the solid-line degradation is DECLARED rather than passed off as a fix",
  has(SHIM, "ellipse (translate+scale+arc)") && has(SHIM, "setLineDash (lines draw solid)") &&
  has(SHIM, "a no-op that swallows a draw would") && !/USED_METHODS\.forEach[\s\S]{0,200}function\s*\(\)\s*\{\s*\}/.test(SHIM));

/* ===================== B) the shim, measured against a native context ===================== */

/* the same drawing twice: nested saves, a transform chain, alpha, colours, a dashed ellipse,
   and work after the outermost restore that only lands right if the state really came back */
const DRAW = `function (x) {
  x.fillStyle = "#123456"; x.fillRect(0, 0, 200, 200);
  x.save();
    x.fillStyle = "#ff0000";
    x.translate(40, 30); x.rotate(0.4); x.scale(2, 1.5);
    x.globalAlpha = 0.5;
    x.fillRect(0, 0, 20, 20);
    x.save();
      x.fillStyle = "#00ff00"; x.translate(10, 10); x.globalAlpha = 1;
      x.fillRect(0, 0, 8, 8);
    x.restore();
    x.fillRect(30, 0, 10, 10);
  x.restore();
  x.fillRect(150, 150, 30, 30);
  x.save();
    x.strokeStyle = "#ffffff"; x.lineWidth = 3; x.setLineDash([4, 2]);
    x.beginPath(); x.ellipse(100, 100, 40, 20, 0.3, 0, Math.PI * 2); x.stroke();
  x.restore();
  x.lineWidth = 1; x.strokeStyle = "#000000";
  x.beginPath(); x.moveTo(0, 199); x.lineTo(199, 199); x.stroke();
}`;

async function shimLab(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent("<html><body></body></html>");
  const out = await page.evaluate(({ shim, drawSrc }) => {
    const draw = eval("(" + drawSrc + ")");
    const mk = () => { const c = document.createElement("canvas"); c.width = c.height = 200; return c; };
    const res = {};

    /* B1 — pixel identity */
    const a = mk(), ax = a.getContext("2d"); draw(ax);
    const pa = ax.getImageData(0, 0, 200, 200).data;
    const b = mk(), bx = b.getContext("2d");
    bx.save = undefined; bx.restore = undefined; bx.ellipse = undefined;
    (new Function(shim))();
    const S = window.HNK.canvasShim;
    S.fit(bx);
    draw(bx);
    const pb = bx.getImageData(0, 0, 200, 200).data;
    let diff = 0; for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diff++;
    res.pixelDiff = diff; res.bytes = pa.length;
    res.installedEllipse = typeof bx.ellipse === "function";

    /* B2 — the state stack itself, read back rather than drawn */
    const c = mk(), cx = c.getContext("2d");
    cx.save = undefined; cx.restore = undefined;
    S.fit(cx);
    cx.fillStyle = "#010203"; cx.lineWidth = 7; cx.globalAlpha = 0.25; cx.font = "11px serif"; cx.textAlign = "right";
    cx.save();
    cx.fillStyle = "#fefefe"; cx.lineWidth = 1; cx.globalAlpha = 1; cx.font = "40px monospace"; cx.textAlign = "left";
    cx.restore();
    res.state = { fill: cx.fillStyle, lw: cx.lineWidth, alpha: cx.globalAlpha, font: cx.font, align: cx.textAlign };

    /* B3 — an unmatched restore is a no-op, as in a real context; and deep nesting unwinds */
    let threw = "";
    try { cx.restore(); cx.restore(); } catch (e) { threw = String(e.message || e); }
    res.unmatchedThrew = threw;
    for (let i = 0; i < 40; i++) { cx.save(); cx.fillStyle = "#0" + (i % 10) + "0" + (i % 10) + "0" + (i % 10); }
    for (let i = 0; i < 40; i++) cx.restore();
    res.deepFill = cx.fillStyle;

    /* B4 — the transform really returns, measured by where a 1×1 dot lands */
    const d = mk(), dx = d.getContext("2d");
    dx.save = undefined; dx.restore = undefined;
    S.fit(dx);
    dx.fillStyle = "#ffffff";
    dx.save(); dx.translate(50, 60); dx.rotate(1.1); dx.scale(3, 4); dx.translate(7, 8); dx.restore();
    dx.fillRect(10, 10, 1, 1);                     /* must land at exactly (10,10) */
    const hit = dx.getImageData(10, 10, 1, 1).data[0];
    const nearby = dx.getImageData(11, 10, 1, 1).data[0];
    res.dot = { at10: hit, at11: nearby };

    /* B5 — in a browser the shim installs NOTHING. A second load publishes a FRESH report (it
       replaces HNK.canvasShim), so read that one's own counter rather than a delta against the
       first: on a native host install() measures, finds save/restore, and returns without
       wrapping getContext or fitting a single context. */
    (new Function(shim))();                        /* a second load, as a reload would */
    const S2 = window.HNK.canvasShim;
    const e2 = mk().getContext("2d");
    res.browser = { native: S2.native, installed: S2.installed, fallbacks: S2.fallbacks.length,
                    nativeSaveKept: typeof e2.save === "function" && !e2.__hnkCanvasState };

    /* B6 — setLineDash: where the host has none the call is accepted and the line draws solid */
    const f = mk(), fx = f.getContext("2d");
    fx.save = undefined; fx.restore = undefined; fx.setLineDash = undefined;
    S.fit(fx);
    let dashThrew = "";
    try { fx.setLineDash([3, 3]); } catch (e) { dashThrew = String(e.message || e); }
    fx.strokeStyle = "#ffffff"; fx.lineWidth = 2;
    fx.beginPath(); fx.moveTo(0, 100); fx.lineTo(199, 100); fx.stroke();
    let solid = 0;
    const row = fx.getImageData(0, 100, 200, 1).data;
    for (let i = 0; i < 200; i++) if (row[i * 4] > 200) solid++;
    res.dash = { threw: dashThrew, litPixels: solid };

    return res;
  }, { shim: SHIM, drawSrc: DRAW });
  await ctx.close();
  return out;
}

/* ===================== C) the panel, crippled the way Photoshop is ===================== */

const CRIPPLE = `(function(){
  try {
    var P = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!P) return;
    ["save","restore","ellipse"].forEach(function(m){ try { delete P[m]; } catch(e){} });
    window.__crippled = ["save","restore","ellipse"].filter(function(m){ return typeof P[m] !== "function"; });
  } catch(e) { window.__crippleErr = String(e); }
})();`;

async function panelRun(browser, withShim) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(abs);
    /* FAULT INJECTION: the 6.204.0 panel is this panel with the shim tag taken out again */
    if (!withShim && rel === "index.html") body = Buffer.from(String(body).replace('<script src="src/app/uxp-canvas.js"></script>', "<!-- removed for the reproduction -->"), "utf8");
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
  const page = await ctx.newPage();
  const warns = [];
  page.on("console", (m) => { const t = m.text(); if (/album:|not a function/i.test(t)) warns.push(t.slice(0, 200)); });
  await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.addInitScript(CRIPPLE);
  await page.addInitScript(UXP_STUB);
  await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
  await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
  const crippled = await page.evaluate(() => window.__crippled || window.__crippleErr || "not crippled");
  await page.evaluate(() => switchPage("album"));
  await page.waitForTimeout(2000);
  const seen = await page.evaluate(() => {
    const root = document.getElementById("albRoot");
    const out = { cards: 0, controls: 0, burmese: 0, drawErr: "" };
    if (root) {
      out.cards = root.querySelectorAll("section.card").length;
      const vis = [...root.querySelectorAll("button, .chip")].filter((e) => { const r = e.getBoundingClientRect(); return r.width || r.height; });
      out.controls = vis.length;
      out.burmese = vis.filter((e) => /[က-႟]/.test(e.textContent || "")).length;
    }
    /* drawLook's own first three statements, on a context the page really makes */
    try {
      const cv = document.createElement("canvas"); cv.width = 240; cv.height = 160;
      const x = cv.getContext("2d");
      x.save(); x.fillStyle = "#f6f1e7"; x.fillRect(0, 0, 240, 160);
      x.strokeStyle = "#b08d57"; x.globalAlpha = 0.9; x.strokeRect(8, 8, 224, 144); x.restore();
      out.px = [...x.getImageData(1, 1, 1, 1).data].slice(0, 3).join(",");
    } catch (e) { out.drawErr = String((e && e.message) || e); }
    out.canvasRow = (function () { try { return window.HNK.canvasShim ? window.HNK.canvasShim.line() : null; } catch (e) { return null; } })();
    return out;
  });
  await ctx.close(); server.close();
  return { crippled, warns, seen };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const B = await shimLab(browser);

    report("B1) THE PROOF: the same drawing on a native context and on a crippled one with the shim fitted is PIXEL-IDENTICAL over all " +
      B.bytes + " bytes — nested saves, the transform chain, alpha, colours and the dashed ellipse all come back",
      B.pixelDiff === 0 && B.bytes === 160000 && B.installedEllipse, B);

    report("B2) save() keeps the drawing state and restore() puts every one of it back — fill, line width, alpha, font and alignment",
      B.state && String(B.state.fill).toLowerCase() === "#010203" && B.state.lw === 7 &&
      Math.abs(B.state.alpha - 0.25) < 1e-6 && /11px/.test(B.state.font) && B.state.align === "right", B.state);

    report("B3) an unmatched restore is a no-op, not a throw (a real context does the same), and forty nested levels unwind to the right one",
      B.unmatchedThrew === "" && String(B.deepFill).toLowerCase() === "#010203", { threw: B.unmatchedThrew, deep: B.deepFill });

    report("B4) the transform really returns to where save() found it: after translate + rotate + scale + translate inside a save, a 1×1 dot drawn at (10,10) lands at (10,10) and nowhere else",
      B.dot && B.dot.at10 === 255 && B.dot.at11 === 0, B.dot);

    report("B5) in a browser the shim installs NOTHING — it reports the context as native, fits no context of its own, and leaves a fresh context's own save() in place",
      B.browser && B.browser.native === true && B.browser.installed === 0 && B.browser.fallbacks === 0 && B.browser.nativeSaveKept === true, B.browser);

    report("B6) setLineDash on a host that has none is accepted rather than thrown, and the line draws SOLID — the degradation the SELF-TEST row names",
      B.dash && B.dash.threw === "" && B.dash.litPixels >= 190, B.dash);

    /* --- C: the panel, before and after --- */
    const before = await panelRun(browser, false);
    const after = await panelRun(browser, true);

    report("C1) the harness really is crippled the way Photoshop is — save, restore and ellipse are gone from the 2D context prototype in both runs",
      Array.isArray(before.crippled) && before.crippled.length === 3 && Array.isArray(after.crippled) && after.crippled.length === 3,
      { before: before.crippled, after: after.crippled });

    report("C2) FAULT INJECTION: without the shim the panel reproduces the owner's photographed line — \"x.save is not a function @ hnk_album.js:" + DRAW_SAVE_LINE + "\", which is drawLook's own first statement — and drawLook throws",
      DRAW_SAVE_LINE > 0 &&
      before.warns.some((w) => /x\.save is not a function/.test(w) && new RegExp("hnk_album\\.js:" + DRAW_SAVE_LINE + "\\b").test(w)) &&
      /x\.save is not a function/.test(before.seen.drawErr),
      { line: DRAW_SAVE_LINE, warns: before.warns.slice(0, 3), drawErr: before.seen.drawErr });

    report("C3) with the shim the line is gone and drawLook's shape paints its own paper colour (#f6f1e7 = 246,241,231)",
      after.warns.length === 0 && after.seen.drawErr === "" && after.seen.px === "246,241,231",
      { warns: after.warns.slice(0, 3), err: after.seen.drawErr, px: after.seen.px });

    report("C4) WHAT THE CRASH REALLY COST, both ways: the crippled panel built " + before.seen.cards + " of the Album page's cards and " +
      before.seen.controls + " controls; with the shim it builds " + after.seen.cards + " cards and " + after.seen.controls +
      " controls. The words were never the problem — " + after.seen.burmese + " controls carry Burmese once the page is allowed to finish",
      before.seen.cards <= 8 && before.seen.controls <= 60 &&
      after.seen.cards === 13 && after.seen.controls >= 200 && after.seen.burmese >= 100,
      { before: before.seen, after: after.seen });

    report("C5) the SELF-TEST Canvas row tells the truth on a host with no save/restore: it says so, counts the contexts it fitted, names the ellipse fallback, and does NOT claim anything is still missing",
      after.seen.canvasRow && after.seen.canvasRow.level === "host" &&
      /host has no save\/restore/.test(after.seen.canvasRow.detail) &&
      /shim on \d+ contexts?/.test(after.seen.canvasRow.detail) &&
      /ellipse \(translate\+scale\+arc\)/.test(after.seen.canvasRow.detail) &&
      !/STILL MISSING/.test(after.seen.canvasRow.detail),
      after.seen.canvasRow);

    /* ===================== D) release pins ===================== */
    report("D1) the CI workflow runs this test and the studio counts " + COUNT + " tests",
      has(CI, "node test/verify_panel_canvas_state_6134.js") &&
      (CI.match(/node test\/[a-zA-Z0-9_]+\.js/g) || []).length === COUNT,
      { steps: (CI.match(/node test\/[a-zA-Z0-9_]+\.js/g) || []).length });

    report("D2) the landing site says " + COUNT + " tests",
      has(LANDING, COUNT + " tests") && has(LANDING, 'data-count="tests">' + COUNT + "<") && !has(LANDING, (COUNT - 1) + " tests"));

    const man = JSON.parse(read("panel/release-manifest.json"));
    const pv = JSON.parse(read("docs/download/panel-version.json"));
    report("D3) " + VER + " / panel " + PVER + " in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest, panel-version.json, the download footer and the landing's badges",
      has(APP, 'var APP_VER="' + VER + '";') && has(read("docs/app/version.json"), '"v":"' + VER + '"') &&
      /* derived from VER, not spelled out — see the note in verify_horse_straw_6133 */
      has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
      has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') && has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') &&
      has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
      man.version === PVER && man.artifact_file === "HNK_Ai_Panel_v" + PVER + ".ccx" && /^[0-9a-f]{64}$/.test(man.sha256) && man.bytes > 20000000 &&
      pv.v === PVER && pv.latest_version === PVER &&
      has(read("docs/download/index.html"), "Web App " + VER + " · Panel " + PVER) &&
      has(LANDING, VER) && has(LANDING, PVER),
      { man: man.version, pv: pv.v });
  } catch (e) {
    report("X) the walk ran", false, String((e && e.stack) || e).slice(0, 700));
  }
  await browser.close();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nALL PASS — the panel's canvas can save itself, and it says what it cannot do");
  process.exit(failures ? 1 : 0);
})();
