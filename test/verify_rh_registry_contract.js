/* Every endpoint this product ships is checked against RunningHub's OWN
   published schema.

   WHY THIS EXISTS. The catalog carries hundreds of apiPaths, and each one
   also declares the resolutions, durations and aspect ratios a student may
   pick. A value the endpoint does not accept is not a cosmetic error: the
   student taps Generate, the credit is charged at submit, and the call comes
   back with an errorCode. Until now nothing compared those lists against the
   provider — they were transcribed from documentation by hand.

   THE FIXTURE is RunningHub's official machine-readable registry, taken
   verbatim from HM-RunningHub/ComfyUI_RH_OpenAPI (developer-kit/
   model-registry.public.json) and trimmed to endpoint, category, output type
   and each parameter's key, type, required flag and allowed option values.
   Nothing here is transcribed or invented; the file IS the read doc.

   IT IS A SNAPSHOT, NOT A LIVE ORACLE. The published registry is dated in
   its own `version` field, and RunningHub ships models faster than it
   republishes the file. So an endpoint MISSING from the registry is not an
   error — it is newer than the snapshot — and this check says nothing about
   it. Only endpoints the registry actually describes are held to it, and the
   handful of values that are newer than the snapshot are named below, one by
   one, with the reason. Anything else that drifts fails. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures.push(label);
}

const registry = JSON.parse(read("test/fixtures/rh-model-registry.public.json"));
const html = read("docs/app/index.html");

/* Values we ship that the snapshot does not list. Each one is an option the
   endpoint gained AFTER the registry was published, transcribed at the time
   from that model's own live documentation page. They are listed here rather
   than deleted because removing a working option would take capability away
   from students on the strength of a stale file — and listing them means a
   TENTH drift cannot slip in unnoticed. Re-check these whenever the fixture
   is refreshed: any that the new snapshot lists should leave this table. */
const NEWER_THAN_SNAPSHOT = [
  { apiPath: "rhart-video/sparkvideo-2.0/text-to-video",      field: "durations",   value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "rhart-video/sparkvideo-2.0/image-to-video",     field: "durations",   value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "rhart-video/sparkvideo-2.0/multimodal-video",   field: "durations",   value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "rhart-video/sparkvideo-2.0-fast/text-to-video", field: "durations",   value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "rhart-video/sparkvideo-2.0-fast/image-to-video",field: "durations",   value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "rhart-video/sparkvideo-2.0-fast/multimodal-video", field: "durations",value: "-1",   why: "auto-length, added with Seedance 2.0" },
  { apiPath: "minimax/hailuo-h3/text-to-video",       field: "resolutions", value: "768P", why: "the cheaper tier H3 gained after the snapshot" },
  { apiPath: "minimax/hailuo-h3/image-to-video",      field: "resolutions", value: "768P", why: "the cheaper tier H3 gained after the snapshot" },
  { apiPath: "minimax/hailuo-h3/multimodal-to-video", field: "resolutions", value: "768P", why: "the cheaper tier H3 gained after the snapshot" }
];

/* our list field -> the registry's parameter it constrains */
const FIELD_MAP = { resolutions: "resolution", durations: "duration", aspects: "aspectRatio" };

const byEndpoint = new Map(registry.models.map(m => [m.endpoint, m]));

/* Pull every catalog object literal that carries an apiPath, by matching the
   braces around it — the catalog is hand-written JS, not JSON, so it cannot
   simply be parsed. */
function entries() {
  const out = [];
  const re = /apiPath:"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let i = m.index, depth = 0;
    while (i > 0) {
      if (html[i] === "}") depth++;
      else if (html[i] === "{") { if (depth === 0) break; depth--; }
      i--;
    }
    let k = m.index + m[0].length; depth = 0;
    while (k < html.length) {
      if (html[k] === "{") depth++;
      else if (html[k] === "}") { if (depth === 0) break; depth--; }
      k++;
    }
    out.push({ apiPath: m[1], text: html.slice(i, k + 1) });
  }
  return out;
}

const ours = entries();
const covered = ours.filter(e => byEndpoint.has(e.apiPath));

check("A) the vendored registry is RunningHub's own published file, intact",
  registry.models.length === registry.model_count && registry.model_count === 383 &&
  /ComfyUI_RH_OpenAPI/.test(registry.source) && typeof registry.version === "string",
  `models=${registry.models.length} count=${registry.model_count} source=${registry.source}`);

check("A2) it still describes a large part of what we ship",
  covered.length >= 240,
  `only ${covered.length} of ${ours.length} shipped endpoints are in the snapshot`);

/* B — every option a student can pick is one the endpoint accepts */
const allowed = new Set(NEWER_THAN_SNAPSHOT.map(x => `${x.apiPath}|${x.field}|${x.value}`));
const used = new Set();
const drift = [];
for (const e of covered) {
  const model = byEndpoint.get(e.apiPath);
  for (const [ourField, regField] of Object.entries(FIELD_MAP)) {
    const m = new RegExp(ourField + ":\\[([^\\]]*)\\]").exec(e.text);
    if (!m) continue;
    const param = model.params.find(p => p.fieldKey === regField && p.options);
    if (!param) continue;
    const ok = new Set(param.options);
    for (const raw of m[1].split(",")) {
      const v = raw.trim().replace(/^"|"$/g, "");
      if (!v || ok.has(v)) continue;
      const key = `${e.apiPath}|${ourField}|${v}`;
      if (allowed.has(key)) { used.add(key); continue; }
      drift.push(`${e.apiPath} ${ourField} offers "${v}"; the endpoint accepts ${param.options.join("/")}`);
    }
  }
}
check("B) every resolution, duration and ratio we offer is one the endpoint documents",
  drift.length === 0, drift.slice(0, 8).join(" | "));

check("B2) the newer-than-snapshot table is exactly the exceptions that occur — no stale entries",
  used.size === NEWER_THAN_SNAPSHOT.length,
  `${NEWER_THAN_SNAPSHOT.length} listed, ${used.size} still needed: drop ${
    NEWER_THAN_SNAPSHOT.map(x => `${x.apiPath}|${x.field}|${x.value}`).filter(k => !used.has(k)).join(", ")}`);

check("B3) and every exception says why it is there",
  NEWER_THAN_SNAPSHOT.every(x => typeof x.why === "string" && x.why.length > 10),
  "an exception carries no reason");

/* C — an endpoint that requires a file must have a slot in our entry to carry
   it. A required IMAGE, VIDEO or AUDIO parameter with nothing wired to it is
   a call that cannot succeed.

   ONLY THE CATALOGS THAT DECLARE SLOTS. The image models are a plain
   {id,label,apiPath} list: their picture comes from the page's own uploader,
   not from a field on the entry, so asking those entries to name a slot would
   be asking the wrong question. The video and video-tool catalogs DO name
   their slots (imageParam, videoParam), and there a missing one is a real
   defect — which is exactly where this check earns its keep. */
const SLOT = { IMAGE: /\bimageParam:\s*"/, VIDEO: /\bvideoParam:\s*"/, AUDIO: /\baudioParam:\s*"/ };
const declaresSlots = e => /\b(imageParam|videoParam|audioParam):/.test(e.text);
const unwired = [];
for (const e of covered.filter(declaresSlots)) {
  for (const p of byEndpoint.get(e.apiPath).params) {
    if (!p.required || !SLOT[p.type]) continue;
    if (!SLOT[p.type].test(e.text)) unwired.push(`${e.apiPath} needs a required ${p.type} (${p.fieldKey}) and declares no slot for it`);
  }
}
check("C) every slot-declaring endpoint that requires a file has a slot wired to carry it",
  unwired.length === 0, unwired.slice(0, 8).join(" | "));

check("C2) and the slot-declaring catalogs really are being examined",
  covered.filter(declaresSlots).length >= 150,
  `only ${covered.filter(declaresSlots).length} slot-declaring endpoints reached check C`);

/* D — we never point at an endpoint the snapshot marks deprecated */
const deprecated = ours.filter(e => /\[Deprecated\]/i.test(e.apiPath) ||
  (byEndpoint.get(e.apiPath) || {}).display_name && /\[Deprecated\]/i.test(byEndpoint.get(e.apiPath).display_name));
check("D) no shipped endpoint is one RunningHub marks deprecated",
  deprecated.length === 0, deprecated.map(e => e.apiPath).join(", "));

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${covered.length} shipped endpoints hold to RunningHub's published schema (${registry.version}).`);
process.exit(failures.length ? 1 : 0);
