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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

module.exports = { pool, asUser, asAnon, asService };
