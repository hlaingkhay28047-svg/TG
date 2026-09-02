#!/usr/bin/env node
"use strict";
/* Build panel/js/hnk_path_looks.js — the web app's Batch Looks data, read
   out of the running app.

   The panel's Path page must offer what the app's Batch Looks page offers:
   the same twelve looks in the same order with the same names in every
   language, the same effects and their options, the same quality tiers, and
   prompts composed from the same fragments — so a batch run from Photoshop
   is the batch run the app would have made.

   The tables are DATA, and they live in one <script> with the rest of the
   app, so they are read at runtime rather than parsed out of the file: the
   app is loaded in a browser, its own PT_LOOKS / PT_FX / PT_TIERS and its
   own t() strings are serialised, and the effect fragments are evaluated
   (they are functions of the chosen option) so the panel composes the app's
   exact prompt without shipping the app's code.

   Usage: node tools/build_panel_path_looks.js
   Requires docs/app served at http://127.0.0.1:8931/.
   test/verify_panel_path_looks.js re-runs this and fails on drift. */

const fs = require("fs");
const path = require("path");
const { APP_INIT, APP_PORT } = require("./build_panel_studio_suites.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "panel", "js", "hnk_path_looks.js");

/* the page's own copy, by the keys the app paints it with */
const T_KEYS = ["pt_intro", "pt_free_note", "pt_add", "pt_clear", "pt_empty", "pt_n",
  "pt_err_n", "pt_look_note",
  "pt_tier", "pt_fx", "pt_fx_note", "pt_blur", "pt_fg", "pt_frame", "pt_extras",
  "pt_ref", "pt_custom", "pt_frame_note", "pt_ref_note", "pt_ref_pick", "pt_ref_clear",
  "pt_custom_ph", "pt_prompt", "pt_run", "pt_stop", "pt_stop_note", "pt_out_note",
  "pt_zip", "pt_dlseq", "pt_bake", "pt_close", "pt_orig", "pt_retry", "pt_save",
  "pt_gal", "pt_remove", "pt_sheet_look", "pt_before", "pt_after", "pt_done_n"];
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

/* Two labels the app writes as an inline L9 at wiring time rather than from
   its tr table. They are read out of the source by anchor — a moved anchor is
   a build error, never a silently missing label. */
const INLINE = [
  ["strength", '$("ptLbStrength").textContent=L9('],
  ["fromStudio", 'b.innerHTML=icn("i-palette")+" "+escH(L9('],
  ["hdHint", '$("ptHdHint").textContent=L9('],
  ["engineNote", 'pen.textContent="Engine: "+pl+L9(']
];
function inlineL9() {
  const html = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
  const out = {};
  INLINE.forEach(function (pair) {
    const at = html.indexOf(pair[1]);
    if (at < 0) throw new Error("inline label anchor moved: " + pair[1]);
    const from = html.indexOf("{", at + pair[1].length - 1);
    let depth = 0, end = -1, inStr = false, q = "";
    for (let i = from; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (c === "\\") { i++; continue; } if (c === q) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) throw new Error("inline label never closed: " + pair[1]);
    /* the app writes these as {my:"…",en:"…"} — JSON needs quoted keys */
    const body = html.slice(from, end + 1).replace(/([{,])\s*([a-z]{2,3}):/g, '$1"$2":');
    out[pair[0]] = JSON.parse(body);
  });
  return out;
}

async function snapshot() {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image")
        return route.fulfill({ status: 200, contentType: "image/gif",
          body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(APP_INIT);
    await page.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    const data = await page.evaluate(([tKeys, langs]) => {
      const pick = (o) => {
        if (!o) return null;
        const out = {};
        langs.forEach(l => { if (typeof o[l] === "string") out[l] = o[l]; });
        return Object.keys(out).length ? out : null;
      };
      const looks = PT_ORDER.map(id => {
        const l = PT_LOOKS[id];
        const o = { id: id, name: pick(l.name), ai: l.ai };
        const h = pick(l.hint); if (h) o.hint = h;
        return o;
      });
      const fx = {};
      Object.keys(PT_FX).forEach(k => {
        const f = PT_FX[k];
        const e = { key: f.key || k, aiOnly: !!f.aiOnly };
        if (f.opts) {
          e.opts = f.opts.map(op => ({ v: op.v, label: pick(op.label),
            frag: (op.v === "off" || op.v === "") ? "" : String(f.frag(op.v)) }));
        } else {
          e.label = pick(f.label);
          e.frag = String(f.frag());
        }
        fx[k] = e;
      });
      const tiers = PT_TIERS.map(t => ({ v: t.v || t.key || t.id, icon: t.icon || "", label: pick(t.label) || pick(t.name) }));
      const tr = {};
      const keep = LANG;
      tKeys.forEach(k => { tr[k] = {}; });
      langs.forEach(l => { LANG = l; tKeys.forEach(k => { tr[k][l] = t(k); }); });
      LANG = keep;
      const src = {};
      Object.keys(PT_SRC_L).forEach(k => { const v = pick(PT_SRC_L[k]); if (v) src[k] = v; });
      return { PT_MAX: PT_MAX, looks: looks, fx: fx, tiers: tiers, def: PT_DEF,
        refFrag: PT_REF_FRAG, preserve: ptPreserve(), tr: tr, src: src };
    }, [T_KEYS, LANGS]);
    if (errs.length) throw new Error("the app raised an error while being read: " + errs[0]);
    return data;
  } finally { await browser.close(); }
}

function render(d) {
  const j = (v) => JSON.stringify(v, null, 0);
  const lines = [
    "/* ============================================================",
    "   HNK Batch Looks data — LIFTED, do not edit by hand.",
    "   Source of truth: the web app's own PT_LOOKS / PT_FX / PT_TIERS and",
    "   its pt_* copy, read out of the running app by",
    "   tools/build_panel_path_looks.js so the panel's Path page offers the",
    "   same looks in the same order, the same effects and options, and",
    "   composes the same prompt. test/verify_panel_path_looks.js pins this",
    "   file to the app.",
    "   ============================================================ */",
    "(function () {",
    '"use strict";',
    "var PATH = {",
    "  max: " + j(d.PT_MAX) + ",",
    "  def: " + j(d.def) + ",",
    "  refFrag: " + j(d.refFrag) + ",",
    "  preserve: " + j(d.preserve) + ",",
    "  looks: [",
  ];
  d.looks.forEach(function (l) { lines.push("    " + j(l) + ","); });
  lines.push("  ],");
  lines.push("  fx: {");
  Object.keys(d.fx).forEach(function (k) { lines.push("    " + JSON.stringify(k) + ": " + j(d.fx[k]) + ","); });
  lines.push("  },");
  lines.push("  tiers: " + j(d.tiers) + ",");
  lines.push("  src: " + j(d.src) + ",");
  lines.push("  inline: " + j(d.inline) + ",");
  lines.push("  tr: {");
  Object.keys(d.tr).forEach(function (k) { lines.push("    " + JSON.stringify(k) + ": " + j(d.tr[k]) + ","); });
  lines.push("  }");
  lines.push("};");
  lines.push('if (typeof module !== "undefined" && module.exports) module.exports = PATH;');
  lines.push("else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.pathLooks = PATH; }");
  lines.push("})();");
  lines.push("");
  return lines.join("\n");
}

async function generate() {
  const d = await snapshot();
  d.inline = inlineL9();
  return { text: render(d), data: d };
}

if (require.main === module) {
  generate().then(function (out) {
    fs.writeFileSync(OUT, out.text);
    console.log("wrote " + path.relative(ROOT, OUT) + " — " + out.data.looks.length +
      " looks, " + Object.keys(out.data.fx).length + " effects, " + out.data.tiers.length + " tiers");
  }).catch(function (e) { console.error(String(e && e.stack || e)); process.exit(1); });
}

module.exports = { generate: generate, snapshot: snapshot, render: render, OUT: OUT };
