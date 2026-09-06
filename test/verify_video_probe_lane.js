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
const pushBlock = (WF.match(/\n  push:\n((?:    .*\n)+)/) || [])[1] || "";
report("A) dispatch-only in effect — the one push trigger fires for this file alone (how GitHub registers a workflow_dispatch lane from a work branch, as fetch-docs.yml does) and the confirm gate makes that run a no-op; contents: read; one job on the pinned runner",
  /^on:\n  workflow_dispatch:/m.test(WF) && (WF.match(/\n  push:/g) || []).length === 1 &&
  /^    branches: \[claude\/hnk-studio-deployment-pr292-www53j\]\n    paths: \["\.github\/workflows\/probe-video-models\.yml"\]\n$/.test(pushBlock) &&
  /if: \$\{\{ inputs\.confirm == 'PROBE' \}\}/.test(WF) &&
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
  /if \(dump\.counts\.videoNoBody \|\| dump\.counts\.toolsNoBody \|\| dump\.counts\.imageNoBody \|\| dump\.counts\.t2iNoBody \|\| errs\.length\) process\.exit\(1\);/.test(BODIES), null);
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

report("C5) --variants rides candidate bodies for a row alongside it (id~1, id~2 …; a null drops the field) so a bare PARAMS_INVALID can be narrowed without touching the source — lane input, env and flag agree",
  /VARIANTS = json\.loads\(opt\("--variants", ""\) or "\{\}"\)/.test(PROBE) && /"%s~%d" % \(it\["id"\], k\)/.test(PROBE) && /if v is None: body\.pop\(f, None\)/.test(PROBE) &&
  /^      variants:\n        description: 'optional JSON/m.test(WF) && /VARIANTS: \$\{\{ inputs\.variants \}\}/.test(WF) && /--variants "\$\{VARIANTS:-\}"/.test(WF), null);

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
    !!r && r.probed === (d ? d.counts.video + d.counts.tools + 1 + d.counts.image + d.counts.t2i : -1) && r.ok === r.probed && !!marker && JSON.parse(marker[1]).probed === r.probed &&
    !/RH_KEY|Bearer/.test(JSON.stringify(r)), probeErr || (r && { probed: r.probed, ok: r.ok }));
  /* v6.26.0 — the IMAGE catalog rides the same lane: every RH_MODELS entry with an apiPath has a body at
     each reference count the UI could offer (single-image kinds once), addressed to its own apiPath, and the
     dry run's imageCap table names every model with its largest accepted count. */
  const imStart = APP.indexOf("var RH_MODELS = ["), imEnd = APP.indexOf("\n];", imStart);
  const imIds = (APP.slice(imStart, imEnd).match(/\n  \{ id:"([^"]+)"/g) || []).map(x => x.replace(/[\s\S]*id:"/, "").replace(/"$/, ""));
  const imBase = d ? Array.from(new Set(d.image.map(x => x.id))) : [];
  const capIds = r && r.imageCap ? Object.keys(r.imageCap) : [];
  report("D5) the image group: one dump row per model per probed reference count (single-image kinds exactly once, array kinds at 1..14), each on its own apiPath with a body, and the dry run's imageCap table covers every image model",
    !!d && d.counts.image === d.image.length && d.counts.imageNoBody === 0 && imBase.length === imIds.length && imBase.every(id => imIds.includes(id)) &&
    d.image.every(x => x.url === "https://www.runninghub.ai/openapi/v2/" + x.apiPath && x.body) &&
    d.image.filter(x => x.single).every(x => x.n === 1) && d.image.filter(x => x.id === "nano-banana-pro").map(x => x.n).join() === "1,2,3,4,5,6,8,10,14" &&
    d.image.filter(x => x.id === "qwen-edit-2511").map(x => x.n).join() === "1,3" && d.image.filter(x => x.id === "upscale-pro").length === 1 &&
    !!r && capIds.length === imIds.length && capIds.every(id => imIds.includes(id)) && r.imageCap["nano-banana-pro"].max === 14 && r.imageCap["upscale-pro"].single === true,
    d && r && { image: d.counts.image, models: imBase.length, want: imIds.length, cap: capIds.length });
  /* v6.26.0 — the TEXT→IMAGE catalog rides the lane too: one body per RH_T2I_MODELS entry through rhV2SubmitT2I */
  const t2Start = APP.indexOf("var RH_T2I_MODELS = ["), t2End = APP.indexOf("\n];", t2Start);
  const nT2i = (APP.slice(t2Start, t2End).match(/\n  \{ id:"/g) || []).length;
  report("D6) the t2i group: one dump row per text-to-image model, each on its own apiPath with a body carrying the prompt, none missing",
    !!d && d.counts.t2i === nT2i && d.counts.t2iNoBody === 0 && d.t2i.every(x => x.url === "https://www.runninghub.ai/openapi/v2/" + x.apiPath && x.body && Object.values(x.body).some(v => typeof v === "string" && /red dress/.test(v))),
    d && { t2i: d.counts.t2i, want: nT2i, noBody: d.counts.t2iNoBody });
  const results2 = path.join(outDir, "results-variants.json");
  let varOut = "", varErr = null;
  try { varOut = execFileSync("python3", [path.join(ROOT, "tools", "probe_price_preview.py"), bodies, results2, "--dry", "--ids", "rhv-wan-2-2-t2v", "--variants", JSON.stringify({ "rhv-wan-2-2-t2v": [{ resolution: "auto" }, { duration: null }] })], { encoding: "utf8", timeout: 120000 }); }
  catch (e) { varErr = String((e.stdout || "") + (e.stderr || "")).slice(0, 400); }
  const r2 = varErr ? null : JSON.parse(fs.readFileSync(results2, "utf8"));
  const v2 = r2 ? r2.results.map(x => x.id) : [];
  report("D3b) driven: --variants probes the row's own body first, then id~1 with the patched value and id~2 with the field dropped; the base row's variant is null",
    !!r2 && r2.probed === 3 && v2.join() === "rhv-wan-2-2-t2v,rhv-wan-2-2-t2v~1,rhv-wan-2-2-t2v~2" && r2.results[0].variant === null &&
    r2.results[1].variant.resolution === "auto" && r2.results[1].sentKeys.includes("resolution") && r2.results[2].sentKeys.includes("prompt") && !r2.results[2].sentKeys.includes("duration") &&
    /rhv-wan-2-2-t2v~2/.test(varOut), varErr || v2);
  report("D4) CI runs this", /node test\/verify_video_probe_lane\.js/.test(CI), null);
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every video model can be asked on RunningHub itself, and the key never leaves the run");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
