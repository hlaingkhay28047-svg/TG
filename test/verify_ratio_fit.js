#!/usr/bin/env node
/* v5.98.0 — WHAT SHAPE A PHOTOGRAPH IS SENT AS.
   The owner ran a Look Set and got a picture whose pose AND frame ratio had
   both moved, while the prompt in the very same request promised "aspect
   ratio stays exactly as photographed". The prompt was not the problem:
   RH_NODE_RATIO_MAP has no "auto" key, so on every endpoint whose documented
   enum cannot say "match the input", `RH_NODE_RATIO_MAP[ratio] || "1"` sent
   "1" — 1:1, SQUARE — for the DEFAULT Ratio of Auto. A request beats a
   prompt every time, so no wording could ever have fixed it.
   This pins the fix: IMAGE 1 is measured from its own header bytes and the
   nearest DOCUMENTED ratio is sent instead. No enum value is invented, an
   endpoint that documents auto is left alone, and a ratio the student picked
   is never overridden. The size probe is shared with the panel byte for byte
   because UXP's Image is not the browser's — a header reader is the only
   probe both surfaces can run, and the only one testable without a browser. */
"use strict";
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
const PANEL = fs.readFileSync(path.join(__dirname, "..", "panel", "src", "providers", "ratio-fit.js"), "utf8");
const ADAPTER = fs.readFileSync(path.join(__dirname, "..", "panel", "src", "providers", "runninghub-enterprise-adapter.js"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---- the fixtures: five real files, made once and pinned by their true
   pixel size, so the probe is tested against bytes rather than a mock. ---- */
const FIX = {
  png_tall:      { w: 90, h: 160, b64:
    "iVBORw0KGgoAAAANSUhEUgAAAFoAAACgCAIAAAADw+wqAAABPElEQVR4nO3QMRHAIADAQEBXlaAE+Z06RAEd/hXkMs9+Bp91" +
    "O+Bf7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6w" +
    "I+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPs" +
    "CDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7" +
    "wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag74gU3cwJOrc6f" +
    "iwAAAABJRU5ErkJggg==" },
  jpg_base:      { w: 160, h: 90, b64:
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhl" +
    "bXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8" +
    "fHx8fHx8fHx8fHx8fHz/wAARCABaAKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA" +
    "AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6" +
    "Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
    "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA" +
    "AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5" +
    "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPE" +
    "xcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRXObBRRRQAUUUUAFFFFABRRRQAUUUU" +
    "AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU" +
    "AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU" +
    "AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU" +
    "Af/Z" },
  jpg_prog:      { w: 617, h: 284, b64:
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWG" +
    "kJ6jq62rZ4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSk" +
    "pKSkpKSkpKSkpKSkpKT/wgARCAEcAmkDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAVAQEBAAAAAAAAAAAA" +
    "AAAAAAAAAv/aAAwDAQACEAMQAAABkIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAsP/aAAgB" +
    "AQABBQIvj//EABQRAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQMBAT8BL7//xAAUEQEAAAAAAAAAAAAAAAAAAACQ/9oACAECAQE/" +
    "AS+//8QAFBABAAAAAAAAAAAAAAAAAAAAsP/aAAgBAQAGPwIvj//EABQQAQAAAAAAAAAAAAAAAAAAALD/2gAIAQEAAT8hL4//" +
    "2gAMAwEAAgADAAAAEPffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffff/8QAFBEBAAAAAAAAAAAAAAAAAAAAkP/aAAgBAwEBPxAvv//E" +
    "ABQRAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQIBAT8QL7//xAAUEAEAAAAAAAAAAAAAAAAAAACw/9oACAEBAAE/EC+P/9k=" },
  webp_lossy:    { w: 300, h: 400, b64:
    "UklGRh4BAABXRUJQVlA4IBIBAADwHACdASosAZABPm02mUmkIyKhICgAgA2JaW7hd2Ee3AAAE9gHvtk5D32ych77ZOQ99snI" +
    "e+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2" +
    "TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkP" +
    "fbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIesAA/v+o3v/8Qu9jbf/rQtB86ThXgBQAAAAAAAAA" +
    "AAAAAAAA" },
  webp_lossless: { w: 400, h: 300, b64:
    
    "UklGRigAAABXRUJQVlA4TBwAAAAvj8FKAAdQreKVp/8BAUnS//9kRP8z/vOf/2cK" }
};

/* ---- load the app's own functions, and the panel's module ---- */
global.atob = s => Buffer.from(s, "base64").toString("binary");
function grab(re, what) {
  const m = re.exec(APP);
  if (!m) { console.log("FAIL — could not find " + what + " in the app"); process.exit(1); }
  return m[0];
}
const CORE_APP = grab(/function rhB64Head\(b64, bytes\)\{[\s\S]*?\n  return null;\n\}/, "the size probe");
const APP_FNS = CORE_APP + "\n" +
  grab(/var RH_NODE_RATIO_MAP = \{[^\n]*\};/, "RH_NODE_RATIO_MAP") + "\n" +
  grab(/var RH_RATIO_WH = \{[^\n]*\};/, "RH_RATIO_WH") + "\n" +
  grab(/function rhNearestRatio\(w, h\)\{[\s\S]*?\n\}/, "rhNearestRatio") + "\n" +
  grab(/function rhNeedsMeasuredRatio\(cfg, ratio\)\{[\s\S]*?\n\}/, "rhNeedsMeasuredRatio") + "\n" +
  grab(/function rhMeasureDataUrl\(dataUrl\)\{[\s\S]*?\n\}/, "rhMeasureDataUrl") + "\n" +
  "module.exports = { rhImageSize, rhNearestRatio, rhNeedsMeasuredRatio, rhMeasureDataUrl, RH_NODE_RATIO_MAP };";
const app = (function () { const m = { exports: {} }; new Function("module", "atob", APP_FNS)(m, global.atob); return m.exports; })();
require(path.join(__dirname, "..", "panel", "src", "providers", "ratio-fit.js"));
const pan = globalThis.HNK.ratioFit;

/* ---- A) the two surfaces run the SAME probe ---- */
const norm = s => s.replace(/\r/g, "").replace(/^[ \t]+/gm, "").trim();
const coreInPanel = /function rhB64Head\(b64, bytes\)\{[\s\S]*?\n  return null;\n\}/.exec(PANEL);
report("A) the panel carries the app's size probe, line for line",
  !!coreInPanel && norm(coreInPanel[0]) === norm(CORE_APP),
  { panelHasIt: !!coreInPanel });

/* ---- B) it reads the true size out of real bytes, in every format the
   pickers accept — including a progressive JPEG, whose size lives in a SOF2
   the old fixed-offset reads would have missed, and a lossless WebP, whose
   header is a different chunk entirely ---- */
const badSize = [];
for (const k of Object.keys(FIX)) {
  const f = FIX[k];
  const a = app.rhImageSize(f.b64), p = pan.imageSize(f.b64);
  if (!a || a.w !== f.w || a.h !== f.h) badSize.push(k + " app=" + JSON.stringify(a));
  if (!p || p.w !== f.w || p.h !== f.h) badSize.push(k + " panel=" + JSON.stringify(p));
}
report("B) the pixel size is read from the file's own header — png, baseline jpeg, progressive jpeg, lossy webp, lossless webp",
  badSize.length === 0, badSize);

report("B2) a data URL is measured the same way, and rubbish measures to nothing rather than to a guess",
  JSON.stringify(app.rhMeasureDataUrl("data:image/png;base64," + FIX.png_tall.b64)) === JSON.stringify({ w: FIX.png_tall.w, h: FIX.png_tall.h }) &&
  app.rhMeasureDataUrl("data:image/png;base64,bm90YW5pbWFnZQ==") === null &&
  app.rhMeasureDataUrl("") === null && app.rhMeasureDataUrl(null) === null,
  { dataUrl: app.rhMeasureDataUrl("data:image/png;base64," + FIX.png_tall.b64) });

/* ---- C) the nearest documented ratio, judged in log space so a tall frame
   is as well served as a wide one ---- */
const NEAR = [
  [960, 640, "3:2"], [640, 960, "2:3"], [1000, 1000, "1:1"],
  [1080, 1920, "9:16"], [1920, 1080, "16:9"], [1200, 1600, "3:4"], [1600, 1200, "4:3"],
  [4032, 3024, "4:3"], [3024, 4032, "3:4"]
];
const nearBad = NEAR.filter(([w, h, want]) => app.rhNearestRatio(w, h) !== want || pan.nearestRatio(w, h) !== want)
  .map(([w, h, want]) => w + "x" + h + " wanted " + want + " got " + app.rhNearestRatio(w, h));
report("C) a photograph is matched to the nearest ratio the endpoint documents",
  nearBad.length === 0, nearBad);

report("C2) tall and wide are judged evenly — 9:16 sits exactly as far from square as 16:9",
  app.rhNearestRatio(9, 16) === "9:16" && app.rhNearestRatio(16, 9) === "16:9" &&
  app.rhNearestRatio(1, 1) === "1:1" && app.rhNearestRatio(0, 0) === "" && app.rhNearestRatio(100, 0) === "",
  { tall: app.rhNearestRatio(9, 16), wide: app.rhNearestRatio(16, 9) });

/* ---- D) exactly the endpoints that cannot say "auto" get a measured ratio,
   read from the shipped catalog rather than from a list kept by hand ---- */
const MODELS = (() => {
  const m = /var RH_MODELS\s*=\s*\[/.exec(APP);
  let i = m.index + m[0].length, depth = 1;
  while (depth) { const c = APP[i++]; if (c === "[") depth++; else if (c === "]") depth--; }
  return APP.slice(m.index + m[0].length, i - 1);
})();
const rows = MODELS.split("\n").map(l => {
  const id = /id:"([^"]+)"/.exec(l), kind = /kind:"([^"]+)"/.exec(l);
  if (!id || !kind) return null;
  return { id: id[1], kind: kind[1], auto: /\bauto:\s*true/.test(l) };
}).filter(Boolean);
const wantMeasured = rows.filter(r => r.kind === "zimage" || (r.kind === "node" && !r.auto)).map(r => r.id).sort();
const gotMeasured = rows.filter(r => app.rhNeedsMeasuredRatio({ kind: r.kind, node: r.auto ? { auto: true } : {} }, "")).map(r => r.id).sort();
report("D) every endpoint whose documented enum has no auto value is measured, and only those",
  wantMeasured.length > 0 && JSON.stringify(wantMeasured) === JSON.stringify(gotMeasured),
  { want: wantMeasured, got: gotMeasured });

report("D2) an endpoint that documents auto is left exactly as it was, and a ratio the student picked is never overridden",
  app.rhNeedsMeasuredRatio({ kind: "node", node: { auto: true } }, "") === false &&
  app.rhNeedsMeasuredRatio({ kind: "fluxedit" }, "") === false &&
  app.rhNeedsMeasuredRatio({ kind: "zimage" }, "3:4") === false &&
  app.rhNeedsMeasuredRatio({ kind: "node", node: {} }, "16:9") === false &&
  app.rhNeedsMeasuredRatio(null, "") === false,
  {});

/* ---- E) the defect itself: a tall photograph, Ratio on Auto ---- */
const tallUrl = "data:image/png;base64," + FIX.png_tall.b64;   /* 90x160 */
const cfgNoAuto = { kind: "zimage" };
const resolvedApp = (() => {
  let r = "";
  if (app.rhNeedsMeasuredRatio(cfgNoAuto, r)) {
    const wh = app.rhMeasureDataUrl(tallUrl);
    const near = wh ? app.rhNearestRatio(wh.w, wh.h) : "";
    if (near) r = near;
  }
  return r;
})();
report("E) a 90x160 portrait sent with Ratio on Auto now carries 9:16, where it used to carry 1:1",
  resolvedApp === "9:16" && app.RH_NODE_RATIO_MAP[resolvedApp] === "4" && app.RH_NODE_RATIO_MAP[""] === undefined,
  { resolved: resolvedApp, enum: app.RH_NODE_RATIO_MAP[resolvedApp] });

/* ---- F) the panel resolves to the same thing, through its own one call ---- */
report("F) the panel answers identically for the same photograph and the same endpoint",
  pan.resolve(cfgNoAuto, "", tallUrl) === "9:16" &&
  pan.resolve({ kind: "node", node: { auto: true } }, "", tallUrl) === "" &&
  pan.resolve(cfgNoAuto, "4:3", tallUrl) === "4:3",
  { auto: pan.resolve(cfgNoAuto, "", tallUrl) });

/* ---- G) the wiring, so neither surface can quietly stop calling it ---- */
report("G) the app resolves the ratio inside rhGenerateOne, before the body is built",
  /rhNeedsMeasuredRatio\(modelCfg, ratio\)[\s\S]{0,400}?rhV2Submit\(/.test(APP),
  {});
report("G2) the panel resolves it in _runOnce, before buildRequestBody",
  /HNK\.ratioFit[\s\S]{0,600}?rf\.resolve\(mc,[\s\S]{0,900}?buildRequestBody\(/.test(ADAPTER),
  {});
report("G3) the panel loads the module",
  /src\/providers\/ratio-fit\.js/.test(fs.readFileSync(path.join(__dirname, "..", "panel", "index.html"), "utf8")),
  {});

console.log(failures
  ? "\n" + failures + " FAILURE(S) — a photograph could come back a different shape than it went in."
  : "\nAll checks passed — Auto now means the shape the photograph already is, on both surfaces, without inventing an enum value.");
process.exit(failures ? 1 : 0);
