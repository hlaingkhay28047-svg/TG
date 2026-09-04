/* Every HD Finish body is a body RunningHub documents — and the face pass is
 * the student's choice, not a silent default.
 *
 * WHAT THIS CLOSES. Retouch A, Retouch B and Retouch Pro all end in one HD
 * Finish pass, and that pass used to be a single hard-wired endpoint sent at
 * its bare defaults: topazlabs/image-upscale-standard-v2. RunningHub's own
 * schema gives that endpoint faceEnhancement a default of TRUE at strength
 * 0.8 — so every HD Finish in this app quietly ran a Topaz face pass over the
 * skin retouch the student had just paid a model to perform, with no way to
 * decline it. One engine also cannot suit every source photo, and RunningHub
 * publishes several that do.
 *
 * The engines and every field of every body below are read back out of the
 * pinned registry, so a body this app sends can only contain parameters the
 * endpoint declares, of the type it declares, and can never omit one the
 * endpoint marks required.
 *
 * Usage: node test/verify_retouch_finish.js */
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

/* the app's own table and body builder, run rather than parsed */
const box = vm.createContext({});
vm.runInContext(
  APP.match(/var RH_FINISH_ENGINES = \[[\s\S]*?\n\];/)[0] +
  APP.match(/function rhScaleFromSize\([\s\S]*?\n\}/)[0] +
  APP.match(/function rhFinishEngine\([\s\S]*?\n\}/)[0] +
  APP.match(/function rhFinishWH\([\s\S]*?\n\}/)[0] +
  APP.match(/function rhFinishBody\([\s\S]*?\n\}/)[0] +
  "; globalThis.__E = RH_FINISH_ENGINES; globalThis.__B = rhFinishBody;" +
  "globalThis.__G = rhFinishEngine;", box);
const ENGINES = box.__E, buildBody = box.__B, engineById = box.__G;

const byEndpoint = new Map(REG.models.map(m => [m.endpoint, m]));

check("A) the retouch pages offer more than one finish engine",
  Array.isArray(ENGINES) && ENGINES.length >= 5, `only ${ENGINES && ENGINES.length} engine(s)`);

check("A2) the historical engine is still the default, so nothing changes unasked",
  ENGINES[0].id === "standard" &&
  ENGINES[0].apiPath === "topazlabs/image-upscale-standard-v2" &&
  engineById("nonsense-id").id === "standard",
  "the first/fallback engine is no longer the one this app has always used");

check("B) every engine names an endpoint RunningHub publishes",
  ENGINES.every(e => byEndpoint.has(e.apiPath)),
  ENGINES.filter(e => !byEndpoint.has(e.apiPath)).map(e => e.apiPath).join(", "));

/* C — the bodies, field by field, against each endpoint's own schema */
const TYPE_OK = {
  IMAGE: v => typeof v === "string",
  STRING: v => typeof v === "string",
  LIST: v => typeof v === "string",          /* "send exactly one declared option" */
  INT: v => Number.isInteger(v),
  FLOAT: v => typeof v === "number",
  BOOLEAN: v => typeof v === "boolean"
};
const SIZES = ["", "1k", "2k", "4k"];
const FACES = ["auto", "keep", "strong"];
const undeclared = [], badType = [], badOption = [], missingRequired = [];
for (const e of ENGINES) {
  const spec = byEndpoint.get(e.apiPath);
  if (!spec) continue;
  const params = new Map((spec.params || []).map(p => [p.fieldKey, p]));
  for (const z of SIZES) for (const f of FACES) {
    const body = buildBody(e, "https://x/y.jpg", z, f);
    for (const [k, v] of Object.entries(body)) {
      const p = params.get(k);
      if (!p) { undeclared.push(`${e.id}.${k}`); continue; }
      if (TYPE_OK[p.type] && !TYPE_OK[p.type](v)) badType.push(`${e.id}.${k}=${JSON.stringify(v)} not ${p.type}`);
      if (p.type === "LIST" && Array.isArray(p.options) && p.options.indexOf(v) < 0)
        badOption.push(`${e.id}.${k}=${JSON.stringify(v)} not in ${JSON.stringify(p.options)}`);
      if (p.type === "INT" && typeof p.min === "number" && v < p.min)
        badType.push(`${e.id}.${k}=${v} below min ${p.min}`);
    }
    for (const p of spec.params || [])
      if (p.required && !(p.fieldKey in body)) missingRequired.push(`${e.id} omits required ${p.fieldKey}`);
  }
}
check("C) no finish body sends a field its endpoint does not declare",
  undeclared.length === 0, [...new Set(undeclared)].join(", "));
check("C2) every value matches the declared type, option list and minimum",
  badType.length === 0 && badOption.length === 0,
  [...new Set(badType.concat(badOption))].slice(0, 6).join(" | "));
check("C3) and no finish body omits a parameter the endpoint requires",
  missingRequired.length === 0, [...new Set(missingRequired)].join(", "));

/* D — the face pass: the point of the whole change */
const std = engineById("standard");
const auto = buildBody(std, "u", "2k", "auto");
const keep = buildBody(std, "u", "2k", "keep");
const strong = buildBody(std, "u", "2k", "strong");
check("D) 'automatic' sends no face field at all, leaving RunningHub's default",
  !("faceEnhancement" in auto) && !("faceEnhancementStrength" in auto),
  "the historical body changed shape — an existing student's finish would move");
check("D2) 'keep my retouch' turns the face pass off with a real JSON false",
  keep.faceEnhancement === false,
  "a careful retouch is still overwritten by the finish");
check("D3) 'strongest' asks for it explicitly, at the documented maximum",
  strong.faceEnhancement === true && strong.faceEnhancementStrength === 1,
  "the strong setting does not reach the endpoint");
check("D4) an engine whose schema has no face fields never receives them",
  ENGINES.filter(e => !e.face).every(e =>
    FACES.every(f => !("faceEnhancement" in buildBody(e, "u", "2k", f)))),
  "a face field is sent to an endpoint that does not declare one");

/* E — the pages actually go through it */
check("E) every HD Finish call site runs the engine layer",
  (APP.match(/rhGenerateFinish\(state\.rhKey/g) || []).length === 3 &&
  !/rhGenerateUpscale\(state\.rhKey, rhEffectiveApiPath\("upscale-pro"\)/.test(APP),
  "a retouch page still calls the old hard-wired upscale-pro finish");

check("E2) all three pages read one shared choice, through one reader",
  (APP.match(/function rhFinishSettings\(/g) || []).length === 1 &&
  /svGet\("st_fin_engine","standard"\)/.test(APP) && /svGet\("st_fin_face","auto"\)/.test(APP) &&
  (APP.match(/rhFinishSettings\(\)/g) || []).length >= 2,
  "the finish choice is read from more than one place, so the pages can disagree");

check("E3) the settings sit outside the pipe keys, so choosing one is not an edit",
  /svSet\("st_fin_engine"/.test(APP) && !/pipeSv[^\n]*st_fin_/.test(APP),
  "the finish choice dirties the canvas");

/* F — the two endpoints this wave adds are real, and new to us */
for (const id of ["lowres", "restore"]) {
  const e = engineById(id);
  const spec = byEndpoint.get(e.apiPath);
  check(`F) ${id} (${e.apiPath}) is a published endpoint with an imageUrl slot`,
    !!spec && (spec.params || []).some(p => p.fieldKey === "imageUrl" && p.type === "IMAGE"),
    "the endpoint is missing from the registry or takes no image");
}

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${ENGINES.length} finish engines, every body checked field-by-field against RunningHub's own schema.`);
process.exit(failures.length ? 1 : 0);
