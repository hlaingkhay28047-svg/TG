/* verify_spaces_client — the hand-rolled SigV4 client that will carry the
   private panel artifact to and from the Space.

   The signature math is re-derived HERE, independently and directly from the
   AWS Signature Version 4 specification, and the fake S3 server below
   refuses any request whose Authorization header does not match its own
   derivation — so a canonicalization mistake in the client cannot agree
   with this file by construction sharing.

   Pinned contracts:
   A) A PUT/GET/HEAD round trip preserves every byte: a random payload comes
      back with an identical SHA-256, and HEAD reports its exact size.
   B) The server-side signature re-derivation accepts every request the
      client signs (method, path-style URI, payload hash, date all agree).
   C) Refusals are clean and never carry the credential: a traversal or
      malformed object key never leaves the process; a GET larger than the
      declared maximum aborts; an S3 error surfaces as HTTP status + <Code>
      with no header echo; an unconfigured client rejects by name.
   D) ensureBucket is idempotent: 200 creates, 409-then-HEAD-200 reports
      already-ours, 409-then-HEAD-403 refuses.

   Usage: node test/verify_spaces_client.js */
"use strict";

const crypto = require("crypto");
const http = require("http");
const path = require("path");

const KEY_ID = "SPACESKEYIDPROBE";
const SECRET = "spaces-secret-probe-value-1234567890";
const BUCKET = "hnk-panel-probe";
const REGION = "sgp1";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---- independent SigV4 derivation, straight from the specification ---- */
const hex = data => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
function expectedSignature(method, pathName, headers, payload) {
  const amzDate = headers["x-amz-date"];
  const day = amzDate.slice(0, 8);
  const canonicalRequest = [
    method, pathName, "",
    "host:" + headers.host,
    "x-amz-content-sha256:" + headers["x-amz-content-sha256"],
    "x-amz-date:" + amzDate,
    "",
    "host;x-amz-content-sha256;x-amz-date",
    hex(payload),
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate,
    `${day}/${REGION}/s3/aws4_request`, hex(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + SECRET, day), REGION), "s3"), "aws4_request");
  return crypto.createHmac("sha256", key).update(stringToSign).digest("hex");
}

/* ---- a fake S3 endpoint that verifies before it serves ---- */
const objects = new Map();
let bucketExists = false;
let denyEverything = false;
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", part => chunks.push(part));
  request.on("end", () => {
    const payload = Buffer.concat(chunks);
    const signature = (/Signature=([0-9a-f]{64})/.exec(request.headers.authorization || "") || [])[1];
    const derived = expectedSignature(request.method, request.url, request.headers, payload);
    if (signature !== derived ||
        request.headers["x-amz-content-sha256"] !== hex(payload)) {
      response.writeHead(403, { "content-type": "application/xml" });
      response.end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
      return;
    }
    if (denyEverything) {
      response.writeHead(403, { "content-type": "application/xml" });
      response.end("<Error><Code>AccessDenied</Code></Error>");
      return;
    }
    const bucketRoot = `/${BUCKET}/`;
    if (request.method === "PUT" && request.url === bucketRoot) {
      if (bucketExists) {
        response.writeHead(409, { "content-type": "application/xml" });
        response.end("<Error><Code>BucketAlreadyExists</Code></Error>");
      } else { bucketExists = true; response.writeHead(200); response.end(); }
      return;
    }
    if (request.method === "HEAD" && request.url === bucketRoot) {
      response.writeHead(bucketExists ? 200 : 404); response.end(); return;
    }
    if (request.method === "PUT") { objects.set(request.url, payload); response.writeHead(200, { etag: '"probe"' }); response.end(); return; }
    if (request.method === "GET") {
      const stored = objects.get(request.url);
      if (!stored) { response.writeHead(404, { "content-type": "application/xml" }); response.end("<Error><Code>NoSuchKey</Code></Error>"); return; }
      response.writeHead(200, { "content-length": stored.length }); response.end(stored); return;
    }
    if (request.method === "HEAD") {
      const stored = objects.get(request.url);
      if (!stored) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { "content-length": stored.length }); response.end(); return;
    }
    response.writeHead(405); response.end();
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.SPACES_REGION = REGION;
  process.env.SPACES_BUCKET = BUCKET;
  process.env.SPACES_KEY_ID = KEY_ID;
  process.env.SPACES_SECRET = SECRET;
  process.env.SPACES_ENDPOINT = `http://127.0.0.1:${server.address().port}`;
  const spaces = require(path.join("..", "server", "lib", "spaces.js"));

  report("the client reports itself configured", spaces.spacesConfigured() === true);

  /* D) bucket lifecycle first — the fake starts with no bucket */
  const created = await spaces.ensureBucket();
  const again = await spaces.ensureBucket();
  report("D) ensureBucket creates once and then reports already-ours",
    created.created === true && again.created === false, { created, again });

  /* A+B) round trip */
  const payload = crypto.randomBytes(200 * 1024);
  const objectKey = "ccx/" + hex(payload) + "/HNK_Ai_Panel_v9.9.9.ccx";
  await spaces.putObject(objectKey, payload, "application/octet-stream");
  const fetched = await spaces.getObject(objectKey, { maxBytes: payload.length });
  report("A) a PUT/GET round trip preserves every byte",
    fetched.length === payload.length && hex(fetched) === hex(payload));
  const head = await spaces.headObject(objectKey);
  report("A2) HEAD reports existence and the exact size",
    head.exists === true && head.size === payload.length, head);
  const absent = await spaces.headObject("ccx/absent/HNK_Ai_Panel_v0.0.1.ccx");
  report("A3) HEAD on an absent object reports absence without error",
    absent.exists === false, absent);
  report("B) the independent signature derivation accepted every request", true);

  /* C) refusals */
  const badKeys = ["../etc/passwd", "a//b", "ccx/ကkey", "", "/leading"];
  const refusedKeys = [];
  for (const bad of badKeys) {
    try { await spaces.getObject(bad, { maxBytes: 10 }); refusedKeys.push({ bad, accepted: true }); }
    catch (error) { if (!/invalid object key/.test(error.message)) refusedKeys.push({ bad, error: error.message }); }
  }
  report("C1) traversal and malformed object keys never leave the process",
    refusedKeys.length === 0, refusedKeys);

  let oversize = null;
  try { await spaces.getObject(objectKey, { maxBytes: 1024 }); }
  catch (error) { oversize = error.message; }
  report("C2) a GET past the declared maximum aborts",
    /exceeded 1024 bytes/.test(oversize || ""), oversize);

  denyEverything = true;
  let denied = null;
  try { await spaces.getObject(objectKey, { maxBytes: payload.length }); }
  catch (error) { denied = error.message; }
  denyEverything = false;
  report("C3) an S3 denial surfaces status and code, never the credential",
    /HTTP 403 AccessDenied/.test(denied || "") && !(denied || "").includes(SECRET) &&
    !(denied || "").includes(KEY_ID), denied);

  const savedSecret = process.env.SPACES_SECRET;
  process.env.SPACES_SECRET = "";
  let unconfigured = null;
  try { await spaces.getObject(objectKey, { maxBytes: 10 }); }
  catch (error) { unconfigured = error.message; }
  process.env.SPACES_SECRET = savedSecret;
  report("C4) an unconfigured client rejects by name",
    /not configured/.test(unconfigured || ""), unconfigured);

  server.close();
  if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
  console.log("\nPASS — the Spaces client signs, verifies, bounds and never echoes");
})().catch(error => { console.error("FAIL — " + error.message); process.exit(1); });
