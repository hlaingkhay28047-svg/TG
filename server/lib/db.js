"use strict";
/* The one place a query reaches the database.
 *
 * WHY THIS MODULE HAS NO RAW QUERY FUNCTION. supabase/schema.sql decides who
 * may approve a payment, promote an admin or read another customer's rows, and
 * it decides it with row-level security keyed on auth.uid(). Those policies
 * only apply to the role the statement runs as. The service connects as the
 * database owner, and an owner BYPASSES row-level security — so a query issued
 * without first switching role would sail straight past every guard, silently
 * and with no error to notice.
 *
 * The defence is structural rather than remembered: nothing is exported that
 * can run a statement outside a transaction that has already set a role. Adding
 * a convenience "just run this" helper here would undo the entire model.
 *
 * Owner bypass is not "fixed" with FORCE ROW LEVEL SECURITY on purpose. The
 * README's bootstrap — `update public.profiles set is_admin = true where
 * email = ...`, run by hand as the owner — is how the first admin can ever
 * exist, and section 6 of schema.sql deliberately steps aside for a caller with
 * no auth.uid() for exactly that reason. Forcing RLS would make the documented
 * first step impossible.
 */
const { Pool } = require("pg");

const ROLES = new Set(["anon", "authenticated"]);

/* Which connection string to use, and — if none is usable — why not, in words.
 *
 * App Platform substitutes ${component.VARIABLE} only when a component by that
 * exact name exists in the app's OWN spec. When it does not, the text is passed
 * through unchanged, so the service receives the literal
 * "${hnk-db.DATABASE_URL}" and pg does not reject it: it parses it into
 * nonsense and reports `getaddrinfo ENOTFOUND base`, which names neither the
 * database nor the binding and sends the reader looking for a DNS fault that
 * does not exist. The same trap through DATABASE_CA_CERT already cost one
 * rolled-back deploy.
 *
 * THE FALLBACK IS NOT A GUESS. A database added from the DigitalOcean console
 * rather than from this spec is named by the console, and App Platform exposes
 * its URL under a variable named after THAT component — so the database is
 * present and reachable while ${hnk-db.DATABASE_URL} sits there as text. One
 * unambiguous PostgreSQL URL elsewhere in the environment is that database and
 * nothing else. Two would be a choice, and a service silently choosing which
 * database holds the payments is worse than one that refuses to start, so two
 * is reported instead of picked between.
 */
function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL || "";
  const unresolved = direct.match(/\$\{[^}]*\}/);
  if (direct && !unresolved) return { url: direct, key: "DATABASE_URL", why: null };

  const found = Object.keys(process.env).filter(k =>
    k !== "DATABASE_URL" && /^postgres(?:ql)?:\/\/\S+$/.test(process.env[k] || ""));
  if (found.length === 1) return { url: process.env[found[0]], key: found[0], why: null };

  const why = unresolved
    ? "DATABASE_URL is an unresolved App Platform binding " + unresolved[0] +
      " — no component with that name exists in this app's spec, so the text was " +
      "passed through instead of substituted"
    : "DATABASE_URL is not set on this service";
  return {
    url: "", key: null,
    why: found.length > 1
      ? why + "; " + found.length + " other PostgreSQL URLs are set (" +
        found.join(", ") + ") and choosing between them would be a guess"
      : why,
  };
}

const RESOLVED = resolveDatabaseUrl();
if (RESOLVED.key && RESOLVED.key !== "DATABASE_URL") {
  console.warn("db: DATABASE_URL is unusable — connecting with " + RESOLVED.key + " instead.");
}

const pool = new Pool({
  /* undefined, not "", so a local development run still falls back to the
     PG* environment variables the way psql does. */
  connectionString: RESOLVED.url || undefined,
  /* DigitalOcean Managed PostgreSQL terminates TLS with its own CA. When a real
     certificate is supplied we verify against it; otherwise we still encrypt.
     Set PGSSLMODE=disable only for a local development database.

     THE CERTIFICATE IS CHECKED FOR BEING A CERTIFICATE, not merely for being
     set. .do/app.yaml binds DATABASE_CA_CERT to ${hnk-db.CA_CERT}; a binding
     that does not resolve — which is the case for a development database — is
     passed through as the LITERAL text "${hnk-db.CA_CERT}". Treating that as a
     CA with rejectUnauthorized:true fails every TLS handshake, the pool never
     connects, and the process exits during migration. App Platform then reports
     "your container exited with a non-zero exit code" and rolls back, so the
     old build keeps answering and nothing looks like it changed. */
  ssl: process.env.PGSSLMODE === "disable"
    ? false
    : /BEGIN CERTIFICATE/.test(process.env.DATABASE_CA_CERT || "")
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", err => { console.error("pg pool error:", err.message); });

/* Why the database cannot be reached for a reason /health can state plainly,
   or null when the configuration is fine. */
const describeDatabaseUrl = () => RESOLVED.why;

/* Run fn inside one transaction, as `role`, with auth.uid() answering `uid`.
 *
 * SET LOCAL is what scopes both to the transaction, so a pooled connection
 * cannot leak one request's identity into the next. It is also why this must be
 * a transaction at all: outside one, SET LOCAL is a no-op that leaves the
 * caller as the owner with a null uid — which would not error, it would quietly
 * disable every policy. `set_config(..., true)` is the parameterised form of
 * SET LOCAL; the role cannot be parameterised, so it is checked against a fixed
 * set instead of interpolated from anything a request can influence.
 */
async function asRole(role, uid, fn) {
  if (!ROLES.has(role)) throw new Error("refusing to set an unknown role: " + role);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role " + role);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/* A signed-in customer or admin. uid has already been verified from the token. */
const asUser = (uid, fn) => asRole("authenticated", uid, fn);

/* Signed out. Only app_settings is readable this way, and only because
   appset_read_all grants select to anon so the buy screen can quote prices. */
const asAnon = fn => asRole("anon", null, fn);

/* The auth tables, which no customer role may touch at all.
 *
 * This runs as the connecting owner with NO role switch, so it is the one path
 * that is not policy-checked. It is reserved for auth.users and
 * auth.refresh_tokens — creating an account, checking a password, issuing and
 * revoking tokens — none of which a customer may read. It must never be handed
 * a statement against public.*, because that is precisely the owner bypass this
 * module exists to prevent.
 */
async function asService(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, asUser, asAnon, asService, describeDatabaseUrl };
