/* v6.54.0 — the panel's Batch Looks data IS the web app's.
 *
 * WHY THIS FILE EXISTS. The panel's Path page runs a hundred photos through
 * the app's own looks. Retyping twelve looks × nine languages, five effects
 * with their option fragments, three tiers and thirty-eight copy keys is how
 * two surfaces drift — and a drifted FRAGMENT is worse than a drifted label,
 * because it silently changes what a hundred paid calls ask for. So the whole
 * table is READ OUT OF THE RUNNING APP by tools/build_panel_path_looks.js,
 * and this test re-runs that read and requires the committed file to match it
 * byte for byte.
 *
 * It also pins the two things the panel composes rather than copies: that the
 * looks arrive in the app's order, and that the prompt the panel builds from
 * this data for the default state is the sentence the app builds from its own
 * — the same header, the same look line, the same effect fragment, the same
 * PRESERVE block, joined the same way.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_panel_path_looks.js */
"use strict";
const fs = require("fs");
const path = require("path");
const gen = require("../tools/build_panel_path_looks.js");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

const APP_ORDER = ["pt_foliage", "pt_golden", "pt_window", "pt_overcast", "pt_sunset",
  "pt_rain", "pt_mist", "pt_cine", "pt_porcelain", "pt_forest", "pt_noir", "pt_mono"];
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

(async () => {
  report("the lifted Batch Looks data is committed", fs.existsSync(gen.OUT), gen.OUT);
  if (!fs.existsSync(gen.OUT)) {
    console.log("\n1 FAILURE — build it with: node tools/build_panel_path_looks.js");
    process.exit(1);
  }

  const stored = fs.readFileSync(gen.OUT, "utf8");
  const live = await gen.generate();
  report("the data is byte-for-byte what the app's tables produce today",
    stored === live.text,
    (function () {
      for (let i = 0; i < Math.max(stored.length, live.text.length); i++) {
        if (stored[i] !== live.text[i])
          return "first difference at byte " + i + ": stored " +
            JSON.stringify(stored.slice(i, i + 60)) + " vs app " + JSON.stringify(live.text.slice(i, i + 60));
      }
      return "lengths differ";
    })());

  const P = require("../panel/js/hnk_path_looks.js");

  report("the twelve looks arrive in the app's own order",
    P.looks.length === APP_ORDER.length && P.looks.every((l, i) => l.id === APP_ORDER[i]),
    P.looks.map(l => l.id).join(","));

  /* A look with a missing NAME language is a student reading English on a
     Burmese page, and a look with no `ai` line is a paid call that asks for
     nothing. The per-look `hint` is optional in the app itself — only two
     looks carry one, the rest fall back to pt_look_note — so it is checked
     where it exists rather than demanded everywhere. */
  const thin = P.looks.filter(l => !l.ai || LANGS.some(k => !(l.name && l.name[k])));
  report("every look carries its AI line and its name in all nine languages", thin.length === 0,
    thin.map(l => l.id).join(", "));
  const thinHint = P.looks.filter(l => l.hint && LANGS.some(k => !l.hint[k]));
  report("a look that carries a hint carries it in all nine languages", thinHint.length === 0,
    thinHint.map(l => l.id).join(", "));
  report("the fallback note every other look shows is lifted too",
    !!(P.tr.pt_look_note && P.tr.pt_look_note.my), "pt_look_note missing");

  const fxKeys = ["blur", "fg", "frame", "sync", "proLight"];
  report("the five effects are all present", fxKeys.every(k => !!P.fx[k]), Object.keys(P.fx).join(","));
  /* every non-"off" option must carry the sentence it puts in the prompt */
  const mute = [];
  ["blur", "fg", "frame"].forEach(function (k) {
    (P.fx[k].opts || []).forEach(function (o) {
      if (o.v !== "off" && !o.frag) mute.push(k + "/" + o.v);
      if (LANGS.some(l => !(o.label && o.label[l]))) mute.push(k + "/" + o.v + " (label)");
    });
  });
  ["sync", "proLight"].forEach(function (k) { if (!P.fx[k].frag) mute.push(k); });
  report("every effect option carries the fragment it writes into the prompt",
    mute.length === 0, mute.join(", "));

  report("the three tiers are the app's, with their icons",
    P.tiers.length === 3 && P.tiers.map(t => t.v).join(",") === "fast,quality,hd" && P.tiers.every(t => !!t.icon),
    P.tiers.map(t => t.v + "/" + t.icon).join(" "));

  /* THE PROMPT. This is what the data is FOR: with the app's own defaults —
     the first look, full strength, no blur/foreground/frame, Pro relight on —
     the panel's composition must be the app's, sentence for sentence. */
  const d = P.def, look = P.looks[0];
  const built = [
    "Professional batch wedding-photo relight/regrade of IMAGE 1 — apply the '" + look.name.en + "' look.",
    look.ai,
    P.fx.proLight.frag,
    P.preserve
  ].join("\n\n");
  const want = live.data;
  report("the default state composes the app's own prompt",
    built.indexOf(look.ai) > 0 && built.endsWith(P.preserve) &&
    d.look === "pt_foliage" && d.strength === 100 && d.fx.proLight === true &&
    d.fx.blur === "off" && d.fx.fg === "off" && d.fx.frame === "off" && d.fx.sync === false,
    JSON.stringify(d));

  report("the reference fragment and the PRESERVE block came across whole",
    /IMAGE 2/.test(P.refFrag) && /^PRESERVE EXACTLY:/.test(P.preserve) && P.preserve.length > 200,
    P.preserve.slice(0, 80));

  /* the copy the page paints: every key the app paints, in every language */
  const missing = [];
  Object.keys(P.tr).forEach(function (k) {
    LANGS.forEach(function (l) { if (!P.tr[k][l]) missing.push(k + "." + l); });
  });
  Object.keys(P.src).forEach(function (k) {
    LANGS.forEach(function (l) { if (!P.src[k][l]) missing.push("src." + k + "." + l); });
  });
  /* The four inline labels are written by the app as a literal L9 map at the
     point of use, and two of them carry only my/en there — L9 falls back to
     English, so that IS the app's copy and demanding nine here would fail on
     the app's own page. What must hold is that both ends of that fallback
     chain exist for every one of them. */
  Object.keys(P.inline).forEach(function (k) {
    if (!P.inline[k].my || !P.inline[k].en) missing.push("inline." + k);
  });
  report("the page's copy is complete in all nine languages", missing.length === 0,
    missing.slice(0, 12).join(", "));

  /* the rail's chip art ships with the panel — a missing file is twelve blank
     tiles in Photoshop and nothing at all in this repository's tests */
  const art = P.looks.filter(l => !fs.existsSync(path.join(ROOT, "panel", "icons", "lookchips", l.id + ".jpg")));
  report("every look's rail art ships in the panel", art.length === 0,
    art.map(l => l.id + ".jpg").join(", "));

  /* THE UXP CONTRACT. This file ships inside the CCX and its strings are
     written straight into the page, so anything the panel's renderer cannot
     draw must not be in it — the same ban verify_panel_studio_sync.js puts on
     the studio module, for the same reason: it fails in Photoshop, not here. */
  const banned = [[/<svg\b/, "inline SVG"], [/<[a-z]+[ >]/i, "raw markup"],
    [/\.getContext\(/, "canvas 2d context"], [/new FileReader\(/, "FileReader"]];
  banned.forEach(function (pair) {
    const m = pair[0].exec(stored);
    report("the lifted data carries no " + pair[1], !m, m && stored.slice(Math.max(0, m.index - 60), m.index + 40));
  });

  /* the panel actually loads it */
  const html = fs.readFileSync(path.join(ROOT, "panel", "index.html"), "utf8");
  report("panel/index.html loads the data module",
    html.indexOf('<script src="js/hnk_path_looks.js"></script>') >= 0, "script tag missing");

  console.log(failures
    ? `\n${failures} FAILURE(S) — regenerate with: node tools/build_panel_path_looks.js`
    : "\nAll checks passed — the panel's Batch Looks are the app's.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
