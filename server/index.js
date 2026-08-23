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

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const parsed = url.parse(req.url, false);
    const pathname = decodeURIComponent(parsed.pathname || "");
    const params = new url.URLSearchParams(parsed.query || "");
    const uid = uidFrom(req);

    /* /health answers without touching the database, so App Platform's health
       check passes while the schema is still being applied. `schema` is filled
       in separately and reports how many of the four application tables exist:
       it is the only way, from outside, to tell a service that booted from a
       service that booted AND migrated. 4 means ready. */
    if (pathname === "/health") {
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
      const body = { ok: true, schema: schema, ready: schema === 4 };
      /* Only while something is actually wrong — a stale boot error must not
         keep accusing a database that has since come back. */
      if (schema === null) {
        /* A configuration fault is reported ahead of whatever pg made of it.
           An unresolved binding reaches the driver as a hostname and comes back
           as `getaddrinfo ENOTFOUND base`, which sends the reader hunting for a
           DNS problem; the binding itself is the answer. */
        const why = require("./lib/db").describeDatabaseUrl() ||
                    require("./lib/migrate").getLastError();
        if (why) body.error = why;
      }
      return send(res, 200, body);
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
  /* The schema is applied before the first request rather than by hand. Both
     files are idempotent — verify_schema_behaviour.js check B applies them
     three times and requires app_settings to still hold one row — so this
     converges on every boot instead of needing a database client the owner
     does not have. */
  const listen = () => server.listen(PORT, () => console.log("hnk-api listening on " + PORT));
  require("./lib/migrate").migrate().then(listen).catch(err => {
    /* A migration that COULD NOT REACH the database has applied nothing, so
       there is no half-secured schema to protect anyone from — and exiting
       makes App Platform roll back to the previous build, which answers
       /health in the old shape and hides the reason entirely. Boot instead:
       /health then reports schema:null, the log carries the error, and the
       problem is visible rather than disguised as "nothing happened".
       A failure AFTER a file applied is different and still fatal; migrate()
       raises that one only once it has proved the tables are missing. */
    if (err && err.applied === false) {
      require("./lib/migrate").setLastError(err.message);
      console.error("WARNING: could not reach the database —", err.message);
      console.error("WARNING: booting anyway; /health will report schema:null until this is fixed.");
      return listen();
    }
    console.error("FATAL: migration failed —", err && err.message);
    process.exit(1);
  });
}

module.exports = { server };
