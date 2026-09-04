/* A video tool is offered only the containers it documents — on both surfaces,
 * before the run is paid for.
 *
 * THE ASYMMETRY THIS CLOSES. Every video endpoint RunningHub publishes accepts
 * MP4; only fourteen of the ones we ship accept anything else. The web app has
 * always asked for MP4 and been safe — safe but blunt, since it turned away an
 * iPhone .mov even for the tools that take one. The PANEL had the opposite
 * fault and the expensive one: its picker offered mp4/mov/webm for EVERY tool,
 * so a student could hand a .mov to one of the twenty-three MP4-only endpoints,
 * be charged at submit, and have it rejected afterwards.
 *
 * The table is RunningHub's own, read out of the registry the contract test
 * pins, and it is LIFTED into the panel rather than retyped — the two surfaces
 * cannot answer differently because they read the same map.
 *
 * Usage: node test/verify_video_containers.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const APP = read("docs/app/index.html");
const REG = JSON.parse(read("test/fixtures/rh-model-registry.public.json"));
const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures.push(label);
}

/* the app's table and helpers, run rather than parsed */
const box = vm.createContext({});
const src = APP.match(/var RH_VIDEO_EXTRA_CONTAINERS = \{[\s\S]*?\n\};/)[0] +
  APP.match(/function rhVideoContainers\([\s\S]*?\n\}/)[0] +
  APP.match(/function rhVideoAccepts\([\s\S]*?\n\}/)[0] +
  "; globalThis.__M = RH_VIDEO_EXTRA_CONTAINERS;" +
  "globalThis.__C = rhVideoContainers; globalThis.__A = rhVideoAccepts;";
vm.runInContext(src, box);
const MAP = box.__M, containers = box.__C, accepts = box.__A;

check("A) the app carries a per-endpoint container table",
  MAP && Object.keys(MAP).length > 0, "RH_VIDEO_EXTRA_CONTAINERS is missing or empty");

check("A2) MP4 is offered by every tool, and always first",
  Object.keys(MAP).concat(["some/unknown-endpoint"]).every(k => containers(k)[0] === "mp4"),
  "a tool does not lead with MP4");

/* B — the table says exactly what RunningHub's registry says */
const byEndpoint = new Map(REG.models.map(m => [m.endpoint, m]));
const wrong = [], missed = [];
for (const m of REG.models) {
  const p = (m.params || []).find(q => q.type === "VIDEO" && q.accept);
  if (!p) continue;
  if (!APP.includes(`apiPath:"${m.endpoint}"`)) continue;       /* not shipped */
  const doc = [...new Set(JSON.parse(p.accept).map(a => a.toLowerCase()))].filter(a => a !== "mp4").sort();
  const ours = (MAP[m.endpoint] || []).slice().sort();
  if (doc.join(",") !== ours.join(",")) {
    (doc.length ? wrong : wrong).push(`${m.endpoint}: registry ${JSON.stringify(doc)} vs ours ${JSON.stringify(ours)}`);
  }
}
check("B) every shipped video tool's extra containers match the published registry",
  wrong.length === 0, wrong.slice(0, 8).join(" | "));

/* B0 — the guard this check needs to mean anything. The pinned fixture was
   once a TRIMMED copy of RunningHub's registry that dropped the very
   "accept" field B reads, so B compared nothing and passed on an empty
   loop. A fixture that loses the field again must fail loudly, not quietly
   go green. */
check("B0) the pinned registry still carries the container lists B reads",
  REG.models.reduce((n, m) => n + (m.params || []).filter(q => q.accept).length, 0) > 300,
  "the fixture has been trimmed of its accept data — check B would pass vacuously");

check("B2) and the table names nothing the registry does not",
  Object.keys(MAP).every(k => byEndpoint.has(k)),
  Object.keys(MAP).filter(k => !byEndpoint.has(k)).join(", "));

/* C — the gate itself, on real filenames */
check("C) an MP4-only tool refuses a .mov",
  accepts("gemini-omni-11-video-edit", "clip.mp4", "video/mp4") === true &&
  accepts("gemini-omni-11-video-edit", "clip.mov", "video/quicktime") === false,
  "the gate lets a .mov through to an MP4-only endpoint");

check("C2) a tool that documents MOV accepts one, in any case",
  accepts("alibaba/wan-2.7/video-edit", "clip.MOV", "video/quicktime") === true &&
  accepts("alibaba/wan-2.7/video-edit", "clip.webm", "video/webm") === false,
  "the gate does not follow the tool's own list");

check("C3) a file with no extension is judged by its type instead",
  accepts("volc-subtitle-erase/video", "clip", "video/quicktime") === true &&
  accepts("gemini-omni-11-video-edit", "clip", "video/quicktime") === false,
  "an extensionless file is not judged by MIME type");

/* D — the panel reads the same table, lifted rather than retyped */
const built = require("../tools/build_panel_video_containers.js").build();
const onDisk = read("panel/js/hnk_video_containers.js");
check("D) the panel's copy is the app's, lifted — not retyped",
  built === onDisk,
  "panel/js/hnk_video_containers.js is not what tools/build_panel_video_containers.js produces — re-run it");

const PANEL = read("panel/main.js");
check("D2) the panel picker asks the tool instead of offering everything",
  /VC\.containers\(d\.apiPath\)/.test(PANEL) && !/pickFile\(\["mp4", "mov", "webm"\]\)/.test(PANEL),
  "the panel still offers mp4/mov/webm to every video tool");
check("D3) and refuses, in nine languages, before the run is submitted",
  /VC\.accepts\(d\.apiPath, f\.name\)/.test(PANEL) && /container:\s*\{my:/.test(PANEL),
  "the panel accepts the file and lets the endpoint reject it after payment");

/* E — the name that goes up matches the container that came in.
   Letting a MOV past the picker is only half the job: both surfaces used to
   name every upload for the type they were written for (".mp4" in the app,
   ".png" in the panel, for photos, clips and recordings alike). A container
   the filename denies is the same charged-then-rejected failure, one step
   later, so the name is derived from the ref's own type on both sides. */
const upName = vm.runInNewContext(
  APP.match(/var RH_VIDEO_UPLOAD_EXT = \{[\s\S]*?\n\};/)[0] +
  APP.match(/function rhVideoUploadName\([\s\S]*?\n\}/)[0] +
  "; rhVideoUploadName", {});

check("E) the app names a video upload for the container it really is",
  upName("data:video/quicktime;base64,AA") === "hnk_video.mov" &&
  upName("data:video/mp4;base64,AA") === "hnk_video.mp4" &&
  upName("") === "hnk_video.mp4",
  "a MOV would be uploaded under an .mp4 filename");

const panelUp = require("../panel/src/providers/runninghub-upload-service.js").uploadName;
check("E2) and the panel does the same for clips, photos and recordings alike",
  panelUp("data:video/quicktime;base64,AA", 0) === "hnk_0.mov" &&
  panelUp("data:audio/wav;base64,AA", 1) === "hnk_1.wav" &&
  panelUp("data:image/jpeg;base64,AA", 2) === "hnk_2.jpg" &&
  panelUp("", 0) === "hnk_0.png",
  "the panel still uploads every file as .png");

const VTFILE = APP.match(/<input[^>]*id="vtFilePick"[^>]*>/)[0];
check("E3) the video picker's accept list is no longer MP4-alone",
  /accept="[^"]*\.mov[^"]*"/.test(VTFILE) && /accept="[^"]*video\/mp4[^"]*"/.test(VTFILE),
  "the file dialog still hides every MOV from the tools that take one");

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${Object.keys(MAP).length} tools take more than MP4, and both surfaces know which.`);
process.exit(failures.length ? 1 : 0);
