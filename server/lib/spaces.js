"use strict";
/* A small S3-compatible client, for the private panel-artifact Space.
 *
 * Rather than adopting an SDK for four requests, this speaks AWS Signature
 * Version 4 directly with node's own crypto and https — the same posture as
 * email.js, which speaks SMTP rather than adopting a mail vendor. The
 * surface is exactly what the artifact path needs: GET an object, PUT an
 * object, HEAD an object, and (for the guarded setup lane only) ensure the
 * private bucket exists.
 *
 * Configuration is read per call, so a spawned test can point
 * SPACES_ENDPOINT at a local fake and the production service, which sets
 * only the four SPACES_* variables, never notices the override exists:
 *
 *   SPACES_REGION    e.g. sgp1
 *   SPACES_BUCKET    the private bucket name
 *   SPACES_KEY_ID    runtime access key (read grant is enough to serve)
 *   SPACES_SECRET    its secret — never logged, never in an error message
 *   SPACES_ENDPOINT  optional absolute URL override; when set, requests are
 *                    path-style against it (tests, unusual gateways)
 *
 * Every response is bounded: a GET refuses to buffer past the caller's
 * declared maximum, because the caller always knows the artifact's exact
 * expected size. Errors carry the HTTP status and the S3 <Code> only —
 * never a header, never a credential. */

const crypto = require("crypto");
const http = require("http");
const https = require("https");

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]{0,511}$/;
const TIMEOUT_MS = 20000;

function config() {
  return {
    region: String(process.env.SPACES_REGION || "").trim(),
    bucket: String(process.env.SPACES_BUCKET || "").trim(),
    keyId: String(process.env.SPACES_KEY_ID || "").trim(),
    secret: String(process.env.SPACES_SECRET || "").trim(),
    endpoint: String(process.env.SPACES_ENDPOINT || "").trim(),
  };
}

function spacesConfigured() {
  const c = config();
  return !!(c.region && c.bucket && c.keyId && c.secret);
}

function assertKey(objectKey) {
  const key = String(objectKey || "");
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("invalid object key");
  }
  return key;
}

const sha256hex = data => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/* AWS SigV4 over exactly three signed headers. Keys stay within KEY_RE, so
 * the canonical URI needs no percent-encoding beyond what the key already
 * carries — enforced rather than assumed. */
function signedHeaders(method, host, pathName, payloadHash, when, c) {
  const amzDate = when.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const canonical = [
    method, pathName, "",
    `host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`, "",
    "host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + c.secret, day), c.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(toSign).digest("hex");
  return {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${c.keyId}/${scope}, ` +
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date, " +
      `Signature=${signature}`,
  };
}

function target(c, pathInBucket) {
  if (c.endpoint) {
    const base = new URL(c.endpoint);
    return {
      transport: base.protocol === "http:" ? http : https,
      host: base.host,
      hostname: base.hostname,
      port: base.port || (base.protocol === "http:" ? 80 : 443),
      pathName: `/${c.bucket}${pathInBucket}`,
    };
  }
  const hostname = `${c.bucket}.${c.region}.digitaloceanspaces.com`;
  return { transport: https, host: hostname, hostname, port: 443, pathName: pathInBucket };
}

function request(method, pathInBucket, body, { maxBytes = 1024 * 1024, contentType } = {}) {
  const c = config();
  if (!spacesConfigured()) return Promise.reject(new Error("Spaces storage is not configured"));
  const t = target(c, pathInBucket);
  const payload = body || Buffer.alloc(0);
  const headers = signedHeaders(method, t.host, t.pathName, sha256hex(payload), new Date(), c);
  if (contentType) headers["content-type"] = contentType;
  if (payload.length) headers["content-length"] = payload.length;
  return new Promise((resolve, reject) => {
    const req = t.transport.request({
      method, hostname: t.hostname, port: t.port, path: t.pathName, headers,
    }, response => {
      const parts = [];
      let received = 0;
      response.on("data", part => {
        received += part.length;
        if (received > maxBytes) {
          response.destroy();
          reject(new Error(`spaces ${method} response exceeded ${maxBytes} bytes`));
          return;
        }
        parts.push(part);
      });
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(parts),
      }));
      response.on("error", reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("spaces request timeout")));
    req.on("error", reject);
    if (payload.length) req.write(payload);
    req.end();
  });
}

/* The S3 error <Code> names the failure without repeating the request; a
 * credential never appears in a response body. */
function s3Failure(method, result) {
  const code = (/<Code>([^<]{1,64})<\/Code>/.exec(result.body.toString("utf8")) || [])[1] || "";
  return new Error(`spaces ${method} failed: HTTP ${result.status}${code ? ` ${code}` : ""}`);
}

async function getObject(objectKey, { maxBytes }) {
  const key = assertKey(objectKey);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("getObject requires the expected size");
  const result = await request("GET", `/${key}`, null, { maxBytes });
  if (result.status !== 200) throw s3Failure("GET", result);
  return result.body;
}

async function putObject(objectKey, buffer, contentType) {
  const key = assertKey(objectKey);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("putObject requires a non-empty buffer");
  const result = await request("PUT", `/${key}`, buffer, { contentType: contentType || "application/octet-stream" });
  if (result.status !== 200) throw s3Failure("PUT", result);
  return { etag: String(result.headers.etag || "") };
}

async function headObject(objectKey) {
  const key = assertKey(objectKey);
  const result = await request("HEAD", `/${key}`, null, {});
  if (result.status === 200) {
    return { exists: true, size: Number(result.headers["content-length"] || 0) };
  }
  if (result.status === 404) return { exists: false, size: 0 };
  throw s3Failure("HEAD", result);
}

/* Setup-lane only: a private bucket, created idempotently. A 409 means a
 * bucket by this name already exists somewhere; only a HEAD proving THIS
 * credential reaches it turns that into success. */
async function ensureBucket() {
  const c = config();
  const constraint = `<CreateBucketConfiguration><LocationConstraint>${c.region}</LocationConstraint></CreateBucketConfiguration>`;
  const result = await request("PUT", "/", Buffer.from(constraint), { contentType: "application/xml" });
  if (result.status === 200) return { created: true };
  if (result.status === 409) {
    const probe = await request("HEAD", "/", null, {});
    if (probe.status === 200) return { created: false };
  }
  throw s3Failure("CREATE-BUCKET", result);
}

module.exports = { spacesConfigured, getObject, putObject, headObject, ensureBucket, assertKey };
