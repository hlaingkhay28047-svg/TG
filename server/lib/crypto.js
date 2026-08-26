"use strict";
/* Passwords and tokens. node:crypto only — no dependency handles either.
 *
 * Supabase did this part, and it is the half of a migration that is easy to get
 * quietly wrong: a fast hash or a == comparison still logs everybody in, so
 * nothing looks broken until the database leaks.
 */
const crypto = require("crypto");

/* ---------------- passwords ----------------
 * scrypt is a memory-hard KDF and is in the standard library, so there is no
 * argument for storing anything cheaper. Parameters are recorded IN the hash
 * string, which is what lets them be raised later without invalidating every
 * existing password: verify reads the cost the hash was made with.
 */
const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, KEYLEN = 64;

function createPasswordKdfGate(maxConcurrent) {
  const parsed=Number(maxConcurrent);
  const limit=Number.isFinite(parsed)
    ? Math.min(16,Math.max(1,Math.floor(parsed))) : 4;
  let active=0;
  return async function runPasswordKdf(work) {
    if (active>=limit) {
      const error=new Error("Authentication is busy. Try again shortly.");
      error.status=429;
      error.code="auth_busy";
      throw error;
    }
    active++;
    try { return await work(); }
    finally { active--; }
  };
}

/* Reject excess work instead of letting crypto.scrypt build an unbounded
   libuv queue. Public-auth database limits apply across instances; this gate
   is the final per-process memory/CPU bound for login, signup and reset KDFs. */
const runPasswordKdf=createPasswordKdfGate(
  process.env.PASSWORD_KDF_MAX_CONCURRENCY||4);

function hashPasswordWithSlot(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p }, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${key.toString("base64")}`);
    });
  });
}

function verifyPasswordWithSlot(password, stored) {
  return new Promise(resolve => {
    if (!stored || typeof stored !== "string") return resolve(false);
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return resolve(false);
    const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
    let salt, expected;
    try { salt = Buffer.from(parts[4], "base64"); expected = Buffer.from(parts[5], "base64"); }
    catch (_) { return resolve(false); }
    if (!N || !r || !p || !expected.length) return resolve(false);
    crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, key) => {
      /* timingSafeEqual throws on a length mismatch, so the lengths are checked
         first — and compared as lengths, which are not secret. */
      if (err || key.length !== expected.length) return resolve(false);
      resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}

/* Auth flows acquire capacity before they reserve a durable database attempt.
   An overloaded process therefore rejects without poisoning a reset/signup
   allowance or creating an unbounded reserve+cleanup loop. Raw KDF functions
   are exposed only to the callback while the slot is owned. */
function withPasswordKdfSlot(work) {
  return runPasswordKdf(async()=>{
    let operation=null;
    const start=(fn,args)=>{
      if (operation) {
        const error=new Error("A password KDF slot may run only one operation");
        error.status=500;
        error.code="kdf_slot_reused";
        throw error;
      }
      operation=fn(...args);
      return operation;
    };
    const operations=Object.freeze({
      hashPassword:password=>start(hashPasswordWithSlot,[password]),
      verifyPassword:(password,stored)=>start(verifyPasswordWithSlot,[password,stored]),
    });
    try { return await work(operations); }
    finally {
      /* A callback that accidentally forgets to await its KDF cannot release
         capacity while crypto.scrypt is still consuming memory/CPU. */
      if (operation) await operation.catch(()=>{});
    }
  });
}

const hashPassword=password=>
  withPasswordKdfSlot(kdf=>kdf.hashPassword(password));
const verifyPassword=(password,stored)=>
  withPasswordKdfSlot(kdf=>kdf.verifyPassword(password,stored));

/* ---------------- access tokens ----------------
 * A compact JWT, HS256, verified with a timing-safe compare. The shape matters:
 * the app reads `sub` out of the payload, and public.hnk_uid() is fed from it, so a
 * forged or expired token must never reach db.asUser.
 */
const b64u = buf => Buffer.from(buf).toString("base64url");

function hasSecureTokenSecret(secret) {
  return Buffer.byteLength(String(secret||""),"utf8")>=32;
}

function assertSecureTokenSecret(secret) {
  if (hasSecureTokenSecret(secret)) return String(secret);
  const error=new Error("JWT_SECRET must contain at least 32 bytes");
  error.status=503;
  error.code="security_configuration_missing";
  throw error;
}

function signToken(payload, secret, ttlSeconds) {
  secret=assertSecureTokenSecret(secret);
  const now = Math.floor(Date.now() / 1000);
  const body = Object.assign({}, payload, { iat: now, exp: now + ttlSeconds });
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = head + "." + b64u(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return { token: data + "." + sig, expires_at: body.exp, expires_in: ttlSeconds };
}

function verifyToken(token, secret) {
  if (!hasSecureTokenSecret(secret)) return null;
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = parts[0] + "." + parts[1];
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const a = Buffer.from(parts[2]), b = Buffer.from(expected);
  /* An attacker controls the signature's length, so compare lengths before
     timingSafeEqual rather than letting it throw. */
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch (_) { return null; }
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  /* A uuid, because it is going to become public.hnk_uid(). Anything else is refused
     here rather than at the database, where a cast error would read as a bug. */
  if (typeof payload.sub !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) return null;
  return payload;
}

/* Refresh and recovery tokens are opaque secrets, not JWTs: they are looked up
   in the database, so they carry no claims and can be revoked. */
const randomToken = () => crypto.randomBytes(32).toString("base64url");

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, randomToken,
  hasSecureTokenSecret,assertSecureTokenSecret,createPasswordKdfGate,
  withPasswordKdfSlot };
