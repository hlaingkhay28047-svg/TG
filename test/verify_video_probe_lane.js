/* v6.22.0 — the video-model probe lane: every model the app ships can be asked,
   on RunningHub itself, whether it accepts the body the app would send — without
   spending a credit and without the key ever leaving the run's environment.

   WHY. The owner asked whether the video models "really work". The catalog is
   verified against RunningHub's published registry (verify_rh_registry_contract)
   and every body is checked for the fields its endpoint declares
   (sweep_v498 D), but both read a snapshot. The only live answer is
   RunningHub's own price-preview — the same pre-submit quote the app's cost
   line makes — and the maintenance container has no egress to it, so the ask
   is made from a GitHub runner, key masked, results key-free.

   A) the lane is dispatch-only, gated, read-only, masks the key before any
      other step, pins the same reviewed actions as CI, and never submits
   B) the body script is the app's own code under a halting fetch stub
   C) the probe script only ever posts to price-preview and media/upload,
      never prints the key, and classifies RunningHub's errorCode
   D) driven: the body script dumps a body for EVERY video model, every video
      tool and the upscaler, and the probe script's dry run reads them all

   Usage: PORT=8931 node test/verify_video_probe_lane.js (serve docs/app first) */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8931;
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const WF = read(".github/workflows/probe-video-models.yml");
const CI = read(".github/workflows/test.yml");
const BODIES = read("tools/probe_video_bodies.js");
const PROBE = read("tools/probe_price_preview.py");
const APP = read("docs/app/index.html");

/* ---- A) the lane ---- */
report("A) dispatch-only, gated on the word PROBE, contents: read, one job on the pinned runner",
  /^on:\n  workflow_dispatch:/m.test(WF) && !/\n  push:/.test(WF) && /if: \$\{\{ inputs\.confirm == 'PROBE' \}\}/.test(WF) &&
  /^permissions:\n  contents: read/m.test(WF) && /runs-on: ubuntu-24\.04/.test(WF), null);
report("A2) the key is masked before any other step — secret first, typed input as the announced fallback — and reaches later steps only through GITHUB_ENV",
  WF.indexOf("- name: Mask the key before any other step can log") < WF.indexOf("- uses: actions/checkout@") &&
  /if \[ -n "\$S" \]; then echo "::add-mask::\$S"; fi/.test(WF) && /if \[ -n "\$K" \]; then echo "::add-mask::\$K"; fi/.test(WF) &&
  /echo "::add-mask::\$USE"/.test(WF) && /echo "RH_KEY=\$USE" >> "\$GITHUB_ENV"/.test(WF) &&
  /S: \$\{\{ secrets\.RUNNINGHUB_KEY \}\}/.test(WF) && /K: \$\{\{ inputs\.rh_key \}\}/.test(WF) &&
  (WF.match(/\$\{\{ inputs\.rh_key \}\}/g) || []).length === 1 && !/^\s*set -x\b/m.test(WF), null);
const sha = (s, name) => (s.match(new RegExp("uses: actions/" + name + "@([0-9a-f]{40})")) || [])[1] || null;
report("A3) checkout, setup-node, node and Playwright are pinned exactly as CI pins them",
  sha(WF, "checkout") === sha(CI, "checkout") && sha(WF, "setup-node") === sha(CI, "setup-node") && !!sha(WF, "checkout") &&
  /node-version: "24"/.test(WF) && /npm install playwright@1\.62\.1\b/.test(WF) && /\.\/node_modules\/\.bin\/playwright install --with-deps chromium/.test(WF),
  { wf: [sha(WF, "checkout"), sha(WF, "setup-node")], ci: [sha(CI, "checkout"), sha(CI, "setup-node")] });
report("A4) the lane runs the two scripts in order — bodies first, without a key; the ask second — and keeps only the key-free report",
  WF.indexOf("node tools/probe_video_bodies.js out/bodies.json") < WF.indexOf("python3 tools/probe_price_preview.py out/bodies.json out/results.json") &&
  /path: out\/results\.json/.test(WF) && !/out\/bodies\.json\n\s+if-no-files/.test(WF) && !/RH_KEY/.test(WF.slice(WF.indexOf("- name: Build every request body"), WF.indexOf("- name: Ask RunningHub"))), null);

/* ---- B) the body script ---- */
report("B) the body script drives the app's own builders under a halting fetch stub and covers the three shelves",
  /rhV2SubmitVideo\("K", m\.apiPath/.test(BODIES) && /rhVtBody\(d, P\.VID, \[P\.IMG1\]/.test(BODIES) && /rhV2SubmitVideoUpscale\("K", P\.VID/.test(BODIES) &&
  /window\.fetch = async \(u, o\) => \{ seen = /.test(BODIES) && /throw new Error\("halt"\)/.test(BODIES) &&
  /for \(const m of RH_VIDEO_MODELS\)/.test(BODIES) && /for \(const d of RH_VTOOL_MODELS\)/.test(BODIES) &&
  /if \(dump\.counts\.videoNoBody \|\| dump\.counts\.toolsNoBody \|\| errs\.length\) process\.exit\(1\);/.test(BODIES), null);
report("B2) its media are placeholders on a reserved, unroutable host — nothing real is baked into the repository",
  /placeholder\.invalid\/FIRST\.jpg/.test(BODIES) && /placeholder\.invalid\/SECOND\.jpg/.test(BODIES) && /placeholder\.invalid\/VIDEO\.mp4/.test(BODIES), null);

/* ---- C) the probe script ---- */
const posts = PROBE.match(/post\("([^"]+)/g) || [];
report("C) the probe asks price-preview and nothing else — no submit, no query — and uploads only through media/upload/binary",
  posts.length === 1 && posts[0] === 'post("price-preview/' && (PROBE.match(/BASE \+ "\/media\/upload\/binary"/g) || []).length === 1 &&
  !/BASE \+ "\/" \+ (it|m|d)\[/.test(PROBE), posts);
report("C2) the key comes from RH_KEY alone and is never printed or written",
  /KEY = os\.environ\.get\("RH_KEY", ""\)/.test(PROBE) && !/print\([^\n]*\bKEY\b/.test(PROBE) && !/json\.dump\([^\n]*\bKEY\b/.test(PROBE) &&
  (PROBE.match(/"Bearer " \+ KEY/g) || []).length === 2 && (PROBE.match(/\bKEY\b/g) || []).length === 4,
  { bearer: (PROBE.match(/"Bearer " \+ KEY/g) || []).length, uses: (PROBE.match(/\bKEY\b/g) || []).length });
report("C3) RunningHub's own errorCode/errorMessage is what makes a row REJECTED, and the report carries the reason",
  /d\.get\("errorCode"\) or d\.get\("errorMessage"\)/.test(PROBE) && /return "REJECTED"/.test(PROBE) && /"OK", str\(d\.get\("priceText"\)/.test(PROBE) &&
  /===PROBE-JSON-BEGIN===/.test(PROBE) && /GITHUB_STEP_SUMMARY/.test(PROBE), null);
report("C4) the app's price-preview reader agrees: errorCode means rejected, priceText means quoted",
  /if\(d\.errorCode\)\{ var e2=new Error\("price-rejected"\)/.test(APP) && /text:\s+String\(d\.priceText\|\|d\.priceTextEn\|\|""\)/.test(APP), null);

/* ---- D) driven ---- */
(async () => {
  const outDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "hnk-probe-"));
  const bodies = path.join(outDir, "bodies.json"), results = path.join(outDir, "results.json");
  let dumpOut = "", dumpErr = null;
  try { dumpOut = execFileSync("node", [path.join(ROOT, "tools", "probe_video_bodies.js"), bodies], { env: Object.assign({}, process.env, { PORT: String(PORT) }), encoding: "utf8", timeout: 240000 }); }
  catch (e) { dumpErr = String((e.stdout || "") + (e.stderr || "")).slice(0, 400); }
  const d = dumpErr ? null : JSON.parse(fs.readFileSync(bodies, "utf8"));
  const vmStart = APP.indexOf("var RH_VIDEO_MODELS = ["), vmEnd = APP.indexOf("\n];", vmStart);
  const nVideo = (APP.slice(vmStart, vmEnd).match(/\n  \{ id:"/g) || []).length;
  const vtStart = APP.indexOf("var RH_VTOOL_MODELS = ["), vtEnd = APP.indexOf("\n];", vtStart);
  const nTools = (APP.slice(vtStart, vtEnd).match(/\n  \{ id:"/g) || []).length;
  report("D) the body script dumps a body for every video model, every video tool and the upscaler, with no page error",
    !!d && d.counts.video === nVideo && d.counts.tools === nTools && d.counts.videoNoBody === 0 && d.counts.toolsNoBody === 0 && !!(d.upscale && d.upscale.body) && d.errors.length === 0,
    dumpErr || (d && { counts: d.counts, wantVideo: nVideo, wantTools: nTools, errors: d.errors }));
  report("D2) every video body is addressed to its own apiPath under /openapi/v2 and carries the prompt the student typed",
    !!d && d.video.every(v => v.url === "https://www.runninghub.ai/openapi/v2/" + v.apiPath) &&
    d.video.every(v => v.body && Object.values(v.body).some(x => typeof x === "string" && /smiles at the camera/.test(x))),
    d && d.video.filter(v => !(v.url === "https://www.runninghub.ai/openapi/v2/" + v.apiPath)).slice(0, 3).map(v => v.id));
  let probeOut = "", probeErr = null;
  try { probeOut = execFileSync("python3", [path.join(ROOT, "tools", "probe_price_preview.py"), bodies, results, "--dry"], { encoding: "utf8", timeout: 120000 }); }
  catch (e) { probeErr = String((e.stdout || "") + (e.stderr || "")).slice(0, 400); }
  const r = probeErr ? null : JSON.parse(fs.readFileSync(results, "utf8"));
  const marker = /===PROBE-JSON-BEGIN===\n(\{.*\})\n===PROBE-JSON-END===/.exec(probeOut);
  report("D3) the probe's dry run reads every body, writes the key-free report and prints the marker block the container reads back",
    !!r && r.probed === (d ? d.counts.video + d.counts.tools + 1 : -1) && r.ok === r.probed && !!marker && JSON.parse(marker[1]).probed === r.probed &&
    !/RH_KEY|Bearer/.test(JSON.stringify(r)), probeErr || (r && { probed: r.probed, ok: r.ok }));
  report("D4) CI runs this", /node test\/verify_video_probe_lane\.js/.test(CI), null);
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every video model can be asked on RunningHub itself, and the key never leaves the run");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
