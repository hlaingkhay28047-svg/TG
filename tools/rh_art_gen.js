/* ============================================================
   RunningHub art generator for the studio's own card art (task #112, Imagine).

   Runs on a GitHub runner (the maintenance container has no egress to
   runninghub.ai). Reads a job list, and for every job uploads the base
   photo (if any) to media/upload/binary, submits the edit / text-to-image to
   the named apiPath, polls /openapi/v2/query to SUCCESS, downloads the first
   result and prints it as base64 chunks between unambiguous markers so the
   container can decode it from the job log. The key comes from the
   environment only and is never printed; the log carries images and task
   ids, nothing else.

   Usage:  RH_KEY=… node tools/rh_art_gen.js <jobs.json> [onlyJobName,…]
   jobs.json: { "jobs": [ { "name": "light-01", "apiPath": "rhart-image-n-g31-flash/image-to-image",
                            "base": "docs/app/lib/st-sample.jpg" | null, "prompt": "…",
                            "ratio": "1:1" | "", "resolution": "1k" | "2k", "extra": { … body fields … } } ] }
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const KEY = String(process.env.RH_KEY || "").trim();
const BASE = "https://www.runninghub.ai";
const V2 = BASE + "/openapi/v2";
const POLL_MS = 4000, POLL_MAX_MS = 6 * 60 * 1000, CONCURRENCY = 3;

if (!KEY) { console.log("RH_KEY missing"); process.exit(2); }
const jobsFile = process.argv[2];
const only = (process.argv[3] || "").split(",").map(s => s.trim()).filter(Boolean);
const spec = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
const jobs = spec.jobs.filter(j => !only.length || only.indexOf(j.name) >= 0);

const H = { "Authorization": "Bearer " + KEY, "Accept": "application/json" };
const uploads = new Map();

async function upload(rel) {
  if (uploads.has(rel)) return uploads.get(rel);
  const buf = fs.readFileSync(path.resolve(rel));
  const ext = /\.png$/i.test(rel) ? "png" : /\.webp$/i.test(rel) ? "webp" : "jpg";
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" }), "hnk_base." + ext);
  const r = await fetch(V2 + "/media/upload/binary", { method: "POST", headers: { "Authorization": "Bearer " + KEY }, body: fd });
  const j = await r.json().catch(() => null);
  let url = j && j.data && (j.data.download_url || j.data.fileName);
  if (!r.ok || !url) throw new Error("upload-failed " + r.status + " " + JSON.stringify(j).slice(0, 200));
  if (!/^https?:\/\//i.test(url)) url = BASE + "/" + String(url).replace(/^\/+/, "");
  uploads.set(rel, url);
  return url;
}
async function submit(apiPath, body) {
  const r = await fetch(V2 + "/" + apiPath.replace(/^\/+/, ""), { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify(body) });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
  const tid = j && (j.taskId || (j.data && j.data.taskId));
  if (!r.ok || !tid) throw new Error("submit-failed " + r.status + " " + txt.slice(0, 240));
  return tid;
}
async function poll(tid) {
  const t0 = Date.now();
  while (Date.now() - t0 < POLL_MAX_MS) {
    const r = await fetch(V2 + "/query", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ taskId: tid }) });
    const j = await r.json().catch(() => ({}));
    const s = String(j.status || "").toUpperCase();
    if (s === "SUCCESS") return j;
    if (s === "FAILED") throw new Error("failed " + JSON.stringify(j).slice(0, 240));
    await new Promise(res => setTimeout(res, POLL_MS));
  }
  throw new Error("timeout");
}
function bodyFor(job, imageUrl) {
  const ap = job.apiPath;
  const body = Object.assign({}, job.extra || {});
  if (/^rhart-image\//.test(ap)) { /* the flat node-graph shape (v6.26.0) */
    if (imageUrl) body.imageUrl = imageUrl;
    body.prompt = job.prompt; body.aspectRatio = job.ratio || "auto"; body.outputFormat = "png";
    return body;
  }
  body.prompt = job.prompt;
  if (imageUrl) body.imageUrls = [imageUrl];
  if (job.ratio) body.aspectRatio = job.ratio;
  if (job.resolution) body.resolution = job.resolution;
  return body;
}
async function runJob(job) {
  const imageUrl = job.base ? await upload(job.base) : null;
  const tid = await submit(job.apiPath, bodyFor(job, imageUrl));
  const fin = await poll(tid);
  const res = (fin.results || []).find(x => x && x.url);
  if (!res) throw new Error("no result " + JSON.stringify(fin).slice(0, 200));
  const r = await fetch(res.url); const ab = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "image/png";
  const b64 = ab.toString("base64");
  console.log(`=====ART ${job.name} ${ct} ${ab.length} START=====`);
  for (let i = 0; i < b64.length; i += 60000) console.log(b64.slice(i, i + 60000));
  console.log(`=====ART ${job.name} END=====`);
  return { name: job.name, taskId: tid, bytes: ab.length, usage: fin.usage || fin.taskUsageList || null };
}
(async () => {
  const done = [], failed = [];
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      try { done.push(await runJob(job)); console.log("OK", job.name); }
      catch (e) { failed.push({ name: job.name, error: String(e && e.message || e).slice(0, 300) }); console.log("FAIL", job.name, String(e && e.message || e).slice(0, 300)); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  console.log("===ART-SUMMARY-BEGIN===");
  console.log(JSON.stringify({ ok: done.map(d => ({ name: d.name, taskId: d.taskId, bytes: d.bytes, usage: d.usage })), failed }, null, 0));
  console.log("===ART-SUMMARY-END===");
  process.exit(failed.length && !done.length ? 1 : 0);
})();
