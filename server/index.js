"use strict";
/* HTTP entry point.
 *
 * Routes are Supabase's, deliberately: /auth/v1/*, /rest/v1/<table>,
 * /storage/v1/object/<bucket>/<path>. Keeping the shapes means the ninety
 * account functions in the web app change by their base URL and nothing else,
 * which is the difference between a configuration change and a rewrite of the
 * code that handles customers' money.
 */
const http = require("http");
const url = require("url");
const auth = require("./lib/auth");
const rest = require("./lib/rest");
const storage = require("./lib/storage");
const { verifyToken } = require("./lib/crypto");

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);
const API_VERSION = "5.42.2";

/* The browser calls this from another origin, so CORS has to allow the headers
   accFetch sends. ALLOWED_ORIGIN should name the site in production; the
   fallback echoes the caller, which is right for local development and wrong
   for a deployment, so it is logged loudly at boot. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

function cors(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",
    "authorization,apikey,content-type,accept,prefer,x-upsert,x-client-info");
  res.setHeader("Access-Control-Expose-Headers", "content-range,content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(res, status, body, contentType) {
  if (body === null || body === undefined) { res.writeHead(status); return res.end(); }
  if (Buffer.isBuffer(body)) {
    res.writeHead(status, { "Content-Type": contentType || "application/octet-stream", "Content-Length": body.length });
    return res.end(body);
  }
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/* Errors answer in Supabase's shape. accFriendly reads `message`/`msg`/`error`
   to choose which translated line the customer sees, so the field names and the
   wording both matter. An unexpected error is logged in full and reported as a
   bare 500 — a stack trace in the response body is a gift to an attacker. */
/* PostgreSQL error codes that are an answer, not a fault. 42501 is
   insufficient_privilege — the role genuinely may not touch that table, which
   is the correct outcome for an anonymous caller reaching for profiles, and
   reporting it as 500 would both hide the reason and look like an outage. */
const PG_STATUS = { "42501": 403, "42P01": 404, "23505": 409, "23503": 409, "23514": 400, "22P02": 400, "P0001": 403 };

function fail(res, err) {
  const status = (err && err.status) ? err.status
    : (err && err.code && PG_STATUS[err.code]) ? PG_STATUS[err.code]
    : 500;
  if (status >= 500) console.error("unhandled:", err && err.stack ? err.stack : err);
  const message = status >= 500 ? "Internal error" : String((err && err.message) || "Bad request");
  send(res, status, {
    error: err && err.code ? err.code : (status >= 500 ? "internal_error" : "bad_request"),
    message: message,
    msg: message,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("payload too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/* The bearer token is the ONLY thing that decides auth.uid(). A missing or
   invalid token yields null, which makes the request anonymous rather than
   trusted — never an error at this layer, because /rest/v1/app_settings is
   meant to be readable signed out. */
function uidFrom(req) {
  const header = String(req.headers.authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const payload = verifyToken(m[1].trim(), auth.SECRET);
  return payload ? payload.sub : null;
}

/* Set when the schema failed to apply PARTWAY THROUGH — see the boot block at
   the bottom. While it is set the service answers only /live, /ready and
   /health, so a schema with some of its row-level security missing is never
   queried, and the reason is still readable from a URL. */
let locked = null;

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const parsed = url.parse(req.url, false);
    const pathname = decodeURIComponent(parsed.pathname || "");
    const params = new url.URLSearchParams(parsed.query || "");

    /* App Platform uses this as process liveness, not database readiness. A
       zero-downtime deploy runs schema DDL while the previous container can
       still hold ordinary transaction locks. The new process must open its
       port and answer this probe even while that migration is waiting/retrying;
       every database-backed route below remains closed by the schema
       fingerprint guard until the exact tracked SQL has applied. */
    if (pathname === "/live") {
      return send(res, 200, { ok: true, live: true, apiVersion: API_VERSION });
    }

    /* Readiness is process-local and database-free. It changes to 200 only
       after this exact process has applied the tracked schema. App Platform
       therefore leaves traffic on the previous healthy instance while DDL is
       waiting, but its separate /live probe still knows this process is alive. */
    if (pathname === "/ready") {
      const ready = !!require("./lib/migrate").getAppliedSchemaFingerprint() && locked === null;
      return send(res, ready ? 200 : 503,
        { ok: true, ready: ready, apiVersion: API_VERSION });
    }

    const uid = uidFrom(req);

    /* /health is readiness attestation and deliberately checks the database;
       App Platform uses the database-free /live endpoint above for process
       liveness. `schema` reports how many application tables exist, while
       schemaFingerprint proves this running build successfully applied the
       exact tracked SQL. Both are required: four stale or half-built tables
       are not ready. */
    if (pathname === "/health") {
      const migration = require("./lib/migrate");
      const schemaFingerprint = migration.getAppliedSchemaFingerprint();

      /* The stored App Platform spec may still probe /health during the first
         deployment that introduces /ready. Do not wait for a second database
         connection while the boot migration is itself waiting; answer 503
         promptly so the old healthy instance keeps traffic until migration
         completes and the workflow applies the new live spec. */
      if (!schemaFingerprint &&
          migration.getLastError() === "database schema migration is still applying") {
        return send(res, 503, {
          ok: true,
          apiVersion: API_VERSION,
          schema: null,
          schemaFingerprint: null,
          ready: false,
          tls: require("./lib/db").tlsState(),
          error: migration.getLastError(),
        });
      }

      let schema = null;
      try {
        const { rows } = await require("./lib/db").pool.query(
          "select count(*)::int as n from pg_tables where schemaname='public' " +
          "and tablename in ('profiles','payment_requests','app_settings','devices')");
        schema = rows[0].n;
      } catch (err) {
        /* An unreachable database is reported as null, not as an outage: the
           service itself is up. The reason is recorded here as well as at boot,
           so a database that disappears AFTER a successful migration is named
           too, not only one that was never reachable. */
        require("./lib/migrate").setLastError(err && err.message);
      }
      const body = {
        ok: true,
        apiVersion: API_VERSION,
        schema: schema,
        schemaFingerprint: schemaFingerprint,
        ready: schema === 4 && !!schemaFingerprint && locked === null,
      };
      /* Reported even when ready. Connecting to the database encrypted but
         UNVERIFIED because its certificate could not be parsed is precisely the
         kind of downgrade that is invisible until it matters, and `ready:true`
         is exactly when nobody would think to look. */
      body.tls = require("./lib/db").tlsState();
      /* Only while something is actually wrong — a stale boot error must not
         keep accusing a database that has since come back. */
      if (!body.ready) {
        /* A configuration fault is reported ahead of whatever pg made of it.
           An unresolved binding reaches the driver as a hostname and comes back
           as `getaddrinfo ENOTFOUND base`, which sends the reader hunting for a
           DNS problem; the binding itself is the answer. */
        const why = require("./lib/db").describeDatabaseUrl() ||
                    migration.getLastError();
        if (why) body.error = why;
      }
      return send(res, body.ready ? 200 : 503, body);
    }

    /* Everything below this line touches the database. A schema that failed
       partway through may have tables whose policies never got created, and
       answering a query against those is the one outcome worse than answering
       nothing — so nothing is answered. Exiting instead would be worse again:
       App Platform rolls the deployment back, the previous build answers
       /health in its own shape, and the failure becomes invisible to anyone
       without the runtime logs. */
    if (locked || !require("./lib/migrate").getAppliedSchemaFingerprint()) {
      return send(res, 503, {
        error: "schema_incomplete",
        message: "The database schema did not finish applying. See /health.",
        msg: "The database schema did not finish applying. See /health.",
      });
    }

    /* ---------------- auth ---------------- */
    if (pathname.startsWith("/auth/v1/")) {
      const raw = req.method === "GET" ? Buffer.alloc(0) : await readBody(req);
      let body = {};
      if (raw.length) { try { body = JSON.parse(raw.toString("utf8")); } catch (_) { return fail(res, Object.assign(new Error("invalid JSON"), { status: 400 })); } }
      const route = pathname.slice("/auth/v1/".length);
      let out;
      if (route === "signup" && req.method === "POST") out = await auth.signup(body);
      else if (route === "token" && req.method === "POST") {
        const grant = params.get("grant_type");
        if (grant === "password") out = await auth.tokenPassword(body);
        else if (grant === "refresh_token") out = await auth.tokenRefresh(body);
        else return fail(res, Object.assign(new Error("unsupported grant_type"), { status: 400 }));
      }
      else if (route === "logout" && req.method === "POST") out = await auth.logout(body, uid);
      else if (route === "recover" && req.method === "POST") out = await auth.recover(body, params.get("redirect_to"));
      else if (route === "user" && req.method === "PUT") {
        /* A reset link carries its token; a signed-in change carries a bearer. */
        out = await auth.updateUser(body, uid, params.get("token") || (body && body.recovery_token) || null);
      }
      else if (route === "user" && req.method === "GET") {
        if (!uid) return fail(res, Object.assign(new Error("Not authenticated"), { status: 401, code: "unauthorized" }));
        out = await auth.getUser(uid);
      }
      else return fail(res, Object.assign(new Error("not found"), { status: 404 }));
      return send(res, out.status, out.body);
    }

    /* ---------------- rest ---------------- */
    if (pathname.startsWith("/rest/v1/")) {
      const table = pathname.slice("/rest/v1/".length).split("/")[0];
      const raw = (req.method === "GET" || req.method === "DELETE") ? Buffer.alloc(0) : await readBody(req);
      let body = null;
      if (raw.length) { try { body = JSON.parse(raw.toString("utf8")); } catch (_) { return fail(res, Object.assign(new Error("invalid JSON"), { status: 400 })); } }
      const out = await rest.handle({ method: req.method, table, params, headers: req.headers, body, uid });
      return send(res, out.status, out.body);
    }

    /* ---------------- storage ---------------- */
    if (pathname.startsWith("/storage/v1/object/")) {
      const rest_ = pathname.slice("/storage/v1/object/".length);
      const slash = rest_.indexOf("/");
      const bucket = slash < 0 ? rest_ : rest_.slice(0, slash);
      const objectName = slash < 0 ? "" : rest_.slice(slash + 1);
      if (bucket !== "payment-proofs") return fail(res, Object.assign(new Error("unknown bucket"), { status: 404 }));
      if (req.method === "POST" || req.method === "PUT") {
        const raw = await readBody(req);
        const out = await storage.upload({
          uid, objectName, body: raw,
          contentType: req.headers["content-type"],
          upsert: String(req.headers["x-upsert"] || "") === "true",
        });
        return send(res, out.status, out.body);
      }
      if (req.method === "GET") {
        const out = await storage.download({ uid, objectName });
        return send(res, out.status, out.raw, out.contentType);
      }
      return fail(res, Object.assign(new Error("method not allowed"), { status: 405 }));
    }

    return fail(res, Object.assign(new Error("not found"), { status: 404 }));
  } catch (err) {
    fail(res, err);
  }
});

if (require.main === module) {
  if (!process.env.JWT_SECRET) { console.error("FATAL: JWT_SECRET is not set — refusing to start."); process.exit(1); }
  /* A missing DATABASE_URL used to be fatal here. It is not any more, for the
     same reason an unreachable database is not: exiting makes App Platform roll
     back to the previous build, which answers /health in the old shape, so the
     deployment looks like it simply did not happen and the cause is invisible
     to anyone without the runtime logs. migrate() reports this one through
     /health instead — nothing is served that needs the database anyway, because
     every query fails on the same missing configuration.
     JWT_SECRET above stays fatal: booting without a signing key would mean
     inventing one per container, which silently logs everyone out on restart
     and differs between instances. */
  if (!ALLOWED_ORIGIN) console.warn("WARNING: ALLOWED_ORIGIN is unset — CORS will echo the caller's origin. Set it in production.");
  /* The schema is applied automatically rather than by hand. Both files are
     idempotent — verify_schema_behaviour.js check B applies them three times
     and requires app_settings to still hold one row — so this converges on
     every boot instead of needing a database client the owner does not have. */
  const listen = () => server.listen(PORT, () => console.log("hnk-api listening on " + PORT));
  const migration = require("./lib/migrate");

  /* KEEP TRYING. A DigitalOcean development database is created WITH the app
     and takes minutes to provision, so a container that boots first fails once
     — and one attempt was all there was. Nothing restarts the container, so the
     database becoming ready a minute later changed nothing: the service sat
     there reporting schema:null until somebody redeployed it by hand.

     Retrying is safe because both SQL files are idempotent by construction, and
     that is not an assumption: verify_schema_behaviour.js check B applies them
     three times in a row and requires app_settings to still hold exactly one
     row afterwards.

     There is no attempt limit. A cap only decides how long the service stays
     broken after the cause clears, and a connection attempt a minute costs
     nothing. */
  const RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000, 60000];
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  function finishMigration() {
    if (!migration.getAppliedSchemaFingerprint()) return false;
    locked = null;
    migration.setLastError("");
    return true;
  }
  async function keepMigrating() {
    let attempt = 0;
    for (;;) {
      await sleep(RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
      try {
        await migration.migrate();
        if (!finishMigration()) {
          if (attempt < 3 || attempt % 10 === 0) {
            console.error("migrate: retry " + (attempt + 1) +
              " completed without the application schema; retries continue.");
          }
        } else {
          console.log("migrate: succeeded on retry " + (attempt + 1) + "; the service is now serving normally.");
          return;
        }
      } catch (err) {
        migration.setLastError(err && err.message);
        /* Logged sparsely on purpose: a database that is gone for a day would
           otherwise write a line a minute into the runtime log the owner has
           to page through to find anything. */
        if (attempt < 3 || attempt % 10 === 0) {
          console.error("migrate: retry " + (attempt + 1) + " failed —", err && err.message);
        }
      }
      attempt++;
    }
  }

  /* Listen BEFORE migrating. A migration may wait on a live transaction's DDL
     lock; tying the port to that promise makes App Platform report that the
     container never answered health checks and roll it back. /live remains
     database-free, while the fingerprint guard keeps every real route at 503
     until migration proves this process applied the tracked schema. */
  migration.setLastError(process.env.SKIP_MIGRATE === "1"
    ? "database schema migration is disabled by SKIP_MIGRATE=1"
    : "database schema migration is still applying");
  listen();

  if (process.env.SKIP_MIGRATE === "1") {
    console.warn("migrate: disabled by SKIP_MIGRATE=1; the service will remain not-ready.");
  } else migration.migrate().then(() => {
    if (!finishMigration()) {
      console.error("migrate: initial migration completed without the application schema; retries continue.");
      keepMigrating();
      return;
    }
    console.log("migrate: initial migration succeeded; the service is now serving normally.");
  }).catch(err => {
    /* A migration that COULD NOT REACH the database has applied nothing, so
       there is no half-secured schema to protect anyone from — and exiting
       makes App Platform roll back to the previous build, which answers
       /health in the old shape and hides the reason entirely. Boot instead:
       /health then reports schema:null, the log carries the error, and the
       problem is visible rather than disguised as "nothing happened".

       A failure AFTER a file started applying is different: the schema may be
       partly there, so the service must not serve queries. It boots locked —
       /health tells the truth, every other route answers 503 — because exiting
       would make the reason unreachable, which is strictly worse than serving
       nothing while saying why.

       Either way /ready remains 503 and every database route stays closed
       until a retry proves the tracked schema applied successfully. */
    migration.setLastError(err && err.message);
    if (err && err.applied === false) {
      console.error("WARNING: could not reach the database —", err && err.message);
      console.error("WARNING: booting anyway; /health reports the reason and retries continue.");
    } else {
      locked = String((err && err.message) || "migration failed");
      console.error("FATAL: migration failed —", locked);
      console.error("FATAL: booting LOCKED; /health reports the reason and every other route answers 503.");
    }
    keepMigrating();
  });
}

module.exports = { server };
