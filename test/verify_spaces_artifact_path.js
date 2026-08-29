/* verify_spaces_artifact_path — which store actually serves a panel
   artifact, and what it must prove first.

   materializeArtifact is the single door every authorized download passes
   through. With a Space configured it must prefer the object store and
   leave the database untouched; with a bad object it must verify, refuse,
   and fall back to the chunk bridge; with no Space it must behave exactly
   as before. The chunk source here is a stub client whose every call is
   counted, so "the database was not consulted" is asserted, not assumed.

   Pinned contracts:
   A) A verified Space object is served without one database read.
   B) A corrupt Space object (wrong bytes or wrong size) never reaches the
      caller: the digest check fails closed and the chunk bridge serves the
      true bytes instead.
   C) A Space outage (denial) falls back to the chunk bridge the same way.
   D) With no object key, or no Space configured, the chunk path serves
      exactly as it always has.
   E) When the fallback also cannot serve (no chunks), the caller gets the
      artifact_not_ready refusal, not a stream of nothing.

   Usage: node test/verify_spaces_artifact_path.js */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const hexOf = data => crypto.createHash("sha256").update(data).digest("hex");

const PAYLOAD = crypto.randomBytes(96 * 1024);
const SHA = hexOf(PAYLOAD);
const OBJECT_KEY = `ccx/${SHA}/HNK_Ai_Panel_v9.9.9.ccx`;
const BUCKET = "hnk-panel-probe";

/* one chunk fits the whole payload — the bridge's simplest honest shape */
function artifactRow(objectKey) {
  return {
    id: "cccccccc-0000-4000-8000-0000000000aa", version: "9.9.9",
    artifactKey: "HNK_Ai_Panel_v9.9.9.ccx", expectedSha256: SHA,
    expectedSizeBytes: PAYLOAD.length, chunkSize: 4 * 1024 * 1024, chunkCount: 1,
    status: "ready", uploadedSizeBytes: PAYLOAD.length, objectKey: objectKey || null,
  };
}

function stubClient(withChunks) {
  const calls = [];
  return {
    calls,
    query(text, values) {
      calls.push({ text, values });
      if (!withChunks) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{ chunk_index: 0, data: PAYLOAD, size_bytes: PAYLOAD.length, sha256: SHA }] });
    },
  };
}

/* the fake Space: switchable between serving truth, garbage, and denial */
let mode = "good";
const server = http.createServer((request, response) => {
  request.on("data", () => {});
  request.on("end", () => {
    if (mode === "deny") { response.writeHead(403, { "content-type": "application/xml" }); response.end("<Error><Code>AccessDenied</Code></Error>"); return; }
    const body = mode === "corrupt" ? crypto.randomBytes(PAYLOAD.length) : PAYLOAD;
    response.writeHead(200, { "content-length": body.length }); response.end(body);
  });
});

async function materialize(objectKey, withChunks) {
  const { materializeArtifact } = require(path.join("..", "server", "lib", "panel-artifacts.js"));
  const client = stubClient(withChunks);
  const result = await materializeArtifact(client, artifactRow(objectKey));
  const served = fs.readFileSync(result.filePath);
  await result.cleanup();
  return { client, served };
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.SPACES_REGION = "sgp1";
  process.env.SPACES_BUCKET = BUCKET;
  process.env.SPACES_KEY_ID = "SPACESKEYIDPROBE";
  process.env.SPACES_SECRET = "spaces-secret-probe-value-1234567890";
  process.env.SPACES_ENDPOINT = `http://127.0.0.1:${server.address().port}`;

  mode = "good";
  const fromSpace = await materialize(OBJECT_KEY, true);
  report("A) a verified Space object is served without one database read",
    hexOf(fromSpace.served) === SHA && fromSpace.client.calls.length === 0,
    { queries: fromSpace.client.calls.length });

  mode = "corrupt";
  const corrupt = await materialize(OBJECT_KEY, true);
  report("B) a corrupt object fails the digest and the bridge serves the true bytes",
    hexOf(corrupt.served) === SHA && corrupt.client.calls.length > 0,
    { queries: corrupt.client.calls.length });

  mode = "deny";
  const denied = await materialize(OBJECT_KEY, true);
  report("C) a Space outage falls back to the chunk bridge",
    hexOf(denied.served) === SHA && denied.client.calls.length > 0,
    { queries: denied.client.calls.length });

  mode = "good";
  const noKey = await materialize(null, true);
  report("D1) with no object key the chunk path serves as before",
    hexOf(noKey.served) === SHA && noKey.client.calls.length > 0);

  const savedSecret = process.env.SPACES_SECRET;
  process.env.SPACES_SECRET = "";
  const noSpace = await materialize(OBJECT_KEY, true);
  process.env.SPACES_SECRET = savedSecret;
  report("D2) with no Space configured the chunk path serves as before",
    hexOf(noSpace.served) === SHA && noSpace.client.calls.length > 0);

  mode = "deny";
  let refusal = null;
  try { await materialize(OBJECT_KEY, false); }
  catch (error) { refusal = error; }
  report("E) outage plus an empty bridge refuses rather than serving nothing",
    !!refusal && /artifact|chunk/i.test(String(refusal.code || "") + String(refusal.message || "")),
    refusal && { code: refusal.code, message: refusal.message });

  server.close();
  if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
  console.log("\nPASS — the Space serves only what it proves; the bridge catches everything else");
})().catch(error => { console.error("FAIL — " + (error && error.message)); process.exit(1); });
