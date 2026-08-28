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
const fs = require("fs");
const auth = require("./lib/auth");
const rest = require("./lib/rest");
const storage = require("./lib/storage");
const v1 = require("./lib/v1");
const { authenticateRequest, requestContext } = require("./lib/live-auth");
const { hasSecureTokenSecret } = require("./lib/crypto");
const database = require("./lib/db");
const { securitySecretStatus } = require("./lib/entitlements");

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);
const API_VERSION = "5.45.0";

function boundedTimeout(value,fallback,minimum,maximum) {
  const parsed=Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum,Math.max(minimum,Math.floor(parsed)));
}
const DOWNLOAD_IDLE_TIMEOUT_MS=boundedTimeout(
  process.env.CCX_DOWNLOAD_IDLE_TIMEOUT_MS,30000,5000,120000);
const DOWNLOAD_MAX_DURATION_MS=boundedTimeout(
  process.env.CCX_DOWNLOAD_MAX_DURATION_MS,10*60*1000,60000,30*60*1000);

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
    "authorization,apikey,content-type,accept,prefer,x-upsert,x-client-info,x-device-name,x-device-type");
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
  const body = {
    error: err && err.code ? err.code : (status >= 500 ? "internal_error" : "bad_request"),
    message: message,
    msg: message,
  };
  if (status < 500 && err && err.details !== undefined) body.details = err.details;
  send(res,status,body);
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

/* The bearer token is the ONLY thing that decides public.hnk_uid(). A missing or
   invalid token yields null, which makes the request anonymous rather than
   trusted — never an error at this layer, because /rest/v1/app_settings is
   meant to be readable signed out. */
/* Set when the schema failed to apply PARTWAY THROUGH — see the boot block at
   the bottom. While it is set the service answers only /live, /ready and
   /health, so a schema with some of its row-level security missing is never
   queried, and the reason is still readable from a URL. */
let locked = null;

/* WHY READINESS EXPLAINS ITSELF IN THE LOG.
 *
 * /ready has always known exactly why it is refusing — which secrets are too
 * short, which collide, whether the certificate verified, whether the schema
 * applied — and it says so in its body. But nothing can read that body. App
 * Platform keeps traffic on the previous healthy instance until this one is
 * ready, so a container that never becomes ready is never routed to, and when
 * it is rolled back the API declines to return its logs at all:
 *
 *   400 cannot get running logs from deployment <id> in phase final_cleanup
 *
 * Three deploys failed with DeployContainerHealthChecksFailed and the reason
 * was, each time, sitting in a response nobody could fetch. Writing it to
 * stdout costs one line and makes it survivable.
 *
 * NAMES, NEVER VALUES. A missing or duplicated secret is identified by the
 * variable it lives in; entitlements.js compares digests rather than the
 * secrets themselves for the same reason. Logged only when the reason CHANGES,
 * because App Platform probes every ten seconds and a line per probe is a line
 * nobody reads. */
let lastReadinessReport = null;
function reportReadiness(state) {
  const reason = state.ready ? "ready" : [
    state.schemaReady ? null : "schema not applied",
    locked === null ? null : "migration locked",
    state.securityReady ? null : "security configuration incomplete",
    state.tlsReady ? null : "database TLS unverified",
  ].filter(Boolean).join("; ");
  /* duplicates is a list of GROUPS that share one digest, so each group is
     named as the set it is — "A = B" says more than listing A and B apart. */
  const detail = [
    reason,
    state.jwtReady === false ? "JWT_SECRET missing or under 32 bytes" : null,
    state.secretStatus.missing.length
      ? "missing or under 32 bytes: " + state.secretStatus.missing.join(", ") : null,
    state.secretStatus.duplicates.length
      ? "not unique: " + state.secretStatus.duplicates
          .map(group => group.join(" = ")).join("; ") : null,
  ].filter(Boolean).join(" | ");
  if (detail === lastReadinessReport) return;
  lastReadinessReport = detail;
  if (state.ready) console.log("ready: serving");
  else console.error("ready: NOT READY — " + detail);
}

async function streamDownloadResponse(req,res,status,stream,options) {
  const runtime=options||{};
  const createReadStream=runtime.createReadStream||fs.createReadStream;
  const scheduleTimeout=runtime.setTimeout||setTimeout;
  const cancelTimeout=runtime.clearTimeout||clearTimeout;
  const idleTimeoutMs=runtime.idleTimeoutMs===undefined
    ? DOWNLOAD_IDLE_TIMEOUT_MS : runtime.idleTimeoutMs;
  const maxDurationMs=runtime.maxDurationMs===undefined
    ? DOWNLOAD_MAX_DURATION_MS : runtime.maxDurationMs;
  const onLifecycleError=runtime.onLifecycleError||((error)=>{
    console.error("download stream lifecycle:",error&&error.stack?error.stack:error);
  });
  const onStreamError=runtime.onStreamError||((error)=>{
    console.error("download stream setup:",error&&error.stack?error.stack:error);
  });
  const lifecycle=stream.lifecycle;
  let file=null;
  let totalTimer=null;
  let idleTimeoutArmed=false;
  let streamSettled=false;

  function completeLifecycle(result,reason) {
    let completion;
    try {
      if (lifecycle) completion=result==="finish" ? lifecycle.finish() : lifecycle.abort(reason);
      else if (typeof stream.cleanup==="function") completion=stream.cleanup();
    } catch (error) {
      onLifecycleError(error);
      return Promise.resolve();
    }
    return Promise.resolve(completion).catch(onLifecycleError);
  }

  function clearStreamTimers() {
    if (totalTimer!==null) {
      cancelTimeout(totalTimer);
      totalTimer=null;
    }
    if (idleTimeoutArmed&&!res.destroyed) {
      try { res.setTimeout(0); } catch (_) {}
    }
    idleTimeoutArmed=false;
  }

  async function settleStream(result,reason,destroyStreams) {
    if (streamSettled) return false;
    streamSettled=true;
    clearStreamTimers();
    if (destroyStreams&&file&&typeof file.destroy==="function") {
      try { file.destroy(); } catch (_) {}
    }
    const completion=completeLifecycle(result,reason);
    if (destroyStreams&&!res.destroyed&&typeof res.destroy==="function") {
      try { res.destroy(); } catch (_) {}
    }
    await completion;
    return true;
  }

  if (req.destroyed||res.destroyed||!res.writable) {
    await settleStream("abort","stream_aborted_before_start",false);
    return false;
  }

  /* Register response terminal events before committing headers. This closes
     the ownership gap between token redemption/materialization and file.pipe. */
  res.on("finish",()=>{settleStream("finish",null,false);});
  res.on("close",()=>{
    if (!res.writableFinished) settleStream("abort","stream_aborted",true);
  });
  res.on("error",()=>{settleStream("abort","stream_error",true);});

  try {
    res.writeHead(status, {
      "Content-Type": stream.contentType,
      "Content-Length": stream.size,
      "Content-Disposition": `attachment; filename="${stream.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    });
    file=createReadStream(stream.filePath);
    file.on("error",()=>{settleStream("abort","stream_error",true);});
    totalTimer=scheduleTimeout(
      ()=>{settleStream("abort","stream_duration_timeout",true);},maxDurationMs);
    if (totalTimer&&typeof totalTimer.unref==="function") totalTimer.unref();
    idleTimeoutArmed=true;
    res.setTimeout(idleTimeoutMs,()=>{settleStream("abort","stream_idle_timeout",true);});
    if (streamSettled) return false;
    file.pipe(res);
    return true;
  } catch (error) {
    const responseStarted=!!res.headersSent;
    await settleStream("abort","stream_setup_error",responseStarted||res.destroyed);
    if (!responseStarted&&!res.destroyed) throw error;
    onStreamError(error);
    return false;
  }
}

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
      const secretStatus=securitySecretStatus();
      const securityReady=hasSecureTokenSecret(auth.SECRET)&&secretStatus.ready;
      const tlsReady=database.tlsSecurityReady();
      const schemaReady=!!require("./lib/migrate").getAppliedSchemaFingerprint();
      const jwtReady=hasSecureTokenSecret(auth.SECRET);
      const ready = schemaReady && locked === null && securityReady && tlsReady;
      reportReadiness({ ready, schemaReady, securityReady, tlsReady, jwtReady, secretStatus });
      return send(res, ready ? 200 : 503,
        { ok:true,ready,apiVersion:API_VERSION,securityReady,
          missingSecuritySecrets:secretStatus.missing,
          duplicateSecuritySecrets:secretStatus.duplicates,tlsReady,tls:database.tlsState() });
    }

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
        const secretStatus=securitySecretStatus();
        return send(res, 503, {
          ok: true,
          apiVersion: API_VERSION,
          schema: null,
          schemaFingerprint: null,
          ready: false,
          securityReady:hasSecureTokenSecret(auth.SECRET)&&secretStatus.ready,
          missingSecuritySecrets:secretStatus.missing,
          duplicateSecuritySecrets:secretStatus.duplicates,
          tls: database.tlsState(),
          tlsReady: database.tlsSecurityReady(),
          error: migration.getLastError(),
        });
      }

      let schema = null;
      let unifiedSchema = null;
      try {
        database.assertTlsConnectionAllowed();
        const { rows } = await require("./lib/db").pool.query(
          "select count(*)::int as n from pg_tables where schemaname='public' " +
          "and tablename in ('profiles','payment_requests','app_settings','devices')");
        schema = rows[0].n;
        const required = require("./lib/migrate").REQUIRED_APPLICATION_TABLES;
        const attested = await require("./lib/db").pool.query(
          "select count(*)::int as n from pg_tables where schemaname='public' and tablename=any($1::text[])",
          [required]);
        unifiedSchema = attested.rows[0].n;
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
        unifiedSchema: unifiedSchema,
        unifiedSchemaExpected: migration.REQUIRED_APPLICATION_TABLES.length,
        schemaFingerprint: schemaFingerprint,
        securityReady:hasSecureTokenSecret(auth.SECRET)&&securitySecretStatus().ready,
        missingSecuritySecrets:securitySecretStatus().missing,
        duplicateSecuritySecrets:securitySecretStatus().duplicates,
        tlsReady:database.tlsSecurityReady(),
        /* Boolean only — whether owner mail (password resets, signup notices)
           can send at all. Never the host, user or any address. */
        smtpConfigured:require("./lib/email").smtpConfigured(),
        ready: schema === 4 && unifiedSchema === migration.REQUIRED_APPLICATION_TABLES.length &&
          !!schemaFingerprint && locked === null && hasSecureTokenSecret(auth.SECRET) &&
          securitySecretStatus().ready &&
          database.tlsSecurityReady(),
      };
      /* Reported even when ready. Connecting to the database encrypted but
         UNVERIFIED because its certificate could not be parsed is precisely the
         kind of downgrade that is invisible until it matters, and `ready:true`
         is exactly when nobody would think to look. */
      body.tls = database.tlsState();
      /* Only while something is actually wrong — a stale boot error must not
         keep accusing a database that has since come back. */
      if (!body.ready) {
        /* A configuration fault is reported ahead of whatever pg made of it.
           An unresolved binding reaches the driver as a hostname and comes back
           as `getaddrinfo ENOTFOUND base`, which sends the reader hunting for a
           DNS problem; the binding itself is the answer. */
        const why = (!hasSecureTokenSecret(auth.SECRET) ? "JWT_SECRET must contain at least 32 bytes" : null) ||
                    (!securitySecretStatus().ready ? "required independent security secrets are missing" : null) ||
                    (!body.tlsReady ? "verified database TLS is required; configure the managed database CA" : null) ||
                    database.describeDatabaseUrl() ||
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
    if (locked || !require("./lib/migrate").getAppliedSchemaFingerprint() ||
        !hasSecureTokenSecret(auth.SECRET) || !securitySecretStatus().ready ||
        !database.tlsSecurityReady()) {
      const tlsBlocked=!database.tlsSecurityReady();
      const secretsBlocked=!hasSecureTokenSecret(auth.SECRET)||!securitySecretStatus().ready;
      return send(res, 503, {
        error: secretsBlocked ? "security_configuration_missing" :
          tlsBlocked ? "database_tls_unverified" : "schema_incomplete",
        message: secretsBlocked
          ? "Required security secrets are not independently configured. See /health."
          : tlsBlocked
          ? "Verified database TLS is not configured. See /health."
          : "The database schema did not finish applying. See /health.",
        msg: secretsBlocked
          ? "Required security secrets are not independently configured. See /health."
          : tlsBlocked
          ? "Verified database TLS is not configured. See /health."
          : "The database schema did not finish applying. See /health.",
      });
    }

    /* A bearer is only an assertion until its canonical session row is checked.
       This lookup happens for every protected request, so force logout,
       suspension and ban take effect without waiting for JWT expiry. */
    const identity = await authenticateRequest(req, auth.SECRET);
    const uid = identity.valid ? identity.uid : null;
    const baseContext = requestContext(req, auth.SECRET, identity.clientType || "web");

    /* ---------------- unified server-owned API ---------------- */
    if (pathname.startsWith("/v1/")) {
      const raw = (req.method === "GET" || req.method === "DELETE") ? Buffer.alloc(0) : await readBody(req);
      let body = {};
      if (raw.length) {
        try { body = JSON.parse(raw.toString("utf8")); }
        catch (_) { return fail(res, Object.assign(new Error("invalid JSON"), { status: 400, code: "invalid_json" })); }
      }
      const context = Object.assign({}, baseContext, {
        clientType: ["web","panel","admin"].includes(body.client_type) ? body.client_type : baseContext.clientType,
      });
      const out = await v1.handle({ method:req.method,pathname,params,headers:req.headers,body,identity,context });
      if (out.stream) {
        await streamDownloadResponse(req,res,out.status,out.stream);
        return;
      }
      if (Buffer.isBuffer(out.raw)) {
        res.setHeader("Cache-Control","private, no-store, max-age=0");
        res.setHeader("Pragma","no-cache");
        res.setHeader("X-Content-Type-Options","nosniff");
        return send(res,out.status,out.raw,out.contentType);
      }
      return send(res,out.status,out.body);
    }

    /* ---------------- auth ---------------- */
    if (pathname.startsWith("/auth/v1/")) {
      const raw = req.method === "GET" ? Buffer.alloc(0) : await readBody(req);
      let body = {};
      if (raw.length) { try { body = JSON.parse(raw.toString("utf8")); } catch (_) { return fail(res, Object.assign(new Error("invalid JSON"), { status: 400 })); } }
      const route = pathname.slice("/auth/v1/".length);
      let out;
      const context = Object.assign({}, baseContext, {
        clientType:["web","panel","admin"].includes(body.client_type || body.client_kind)
          ? (body.client_type || body.client_kind) : "web",
      });
      if (route === "signup" && req.method === "POST") out = await auth.signup(body,context);
      else if (route === "token" && req.method === "POST") {
        const grant = params.get("grant_type");
        if (grant === "password") out = await auth.tokenPassword(body,context);
        else if (grant === "refresh_token") out = await auth.tokenRefresh(body,context);
        else return fail(res, Object.assign(new Error("unsupported grant_type"), { status: 400 }));
      }
      else if (route === "logout" && req.method === "POST") out = await auth.logout(body,uid,identity.sessionId,context);
      /* Recovery destinations are server configuration, never caller input.
         Accepting redirect_to here would email a raw reset bearer to an
         attacker-controlled origin. */
      else if (route === "recover" && req.method === "POST") out = await auth.recover(body,context);
      else if (route === "user" && req.method === "PUT") {
        /* A reset link carries its token; a signed-in change carries a bearer. */
        out = await auth.updateUser(body,uid,
          params.get("token") || (body && body.recovery_token) || null,
          context,identity.sessionId||null);
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
      if (identity.provided && !identity.valid) {
        return fail(res,Object.assign(new Error("Not authenticated"),{status:401,code:"unauthorized"}));
      }
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
  if (!hasSecureTokenSecret(process.env.JWT_SECRET)) {
    console.error("FATAL: JWT_SECRET must contain at least 32 bytes — booting diagnostic-only and not ready.");
  }
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
