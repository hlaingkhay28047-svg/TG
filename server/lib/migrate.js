"use strict";
/* Apply the schema on boot.
 *
 * WHY THIS EXISTS. The two SQL files have to reach the database somehow, and
 * every other route to a DigitalOcean development database runs through a
 * psql client the owner does not have on the phone they administer this from.
 * Asking someone to install a database client to finish a deployment is how a
 * migration stalls indefinitely.
 *
 * It is safe here for one specific reason: both files are idempotent by
 * construction — `create ... if not exists`, `create or replace`,
 * `drop policy if exists` before every create — and that is not an assumption,
 * it is what test/verify_no_create_schema.js asserts by applying both under the
 * exact restricted runtime more than once.
 *
 * ORDER MATTERS. platform.sql creates public.hnk_auth_users, public.hnk_uid()
 * and the marker that makes server/sql/schema.sql enforce roleless FORCE RLS;
 * reversed, the second file fails on its first statement. The native Supabase
 * dialect is deliberately not a migration candidate here.
 *
 * A failure here keeps readiness false and every database-backed route closed.
 * The database-free process liveness and diagnostic health endpoints remain
 * reachable so App Platform does not hide the cause behind an automatic
 * rollback.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool, describeDatabaseUrl, downgradeTlsAfter, assertTlsConnectionAllowed } = require("./db");
const { bootstrapAdmin } = require("./bootstrap-admin");

const REQUIRED_APPLICATION_TABLES = Object.freeze([
  "profiles","payment_requests","app_settings","devices",
  "roles","user_roles","licenses","app_permissions","device_slots","device_installations",
  "sessions","login_history","download_history","admin_audit_logs","panel_versions",
  "device_pairing_codes","device_history","admin_mfa","auth_attempts","panel_artifacts","panel_artifact_chunks",
]);
const REQUIRED_PLATFORM_TABLES = Object.freeze([
  "hnk_auth_users","hnk_auth_refresh_tokens","hnk_storage_buckets","hnk_storage_objects",
]);
const REQUIRED_FORCE_RLS_TABLES = Object.freeze([
  ...REQUIRED_PLATFORM_TABLES,
  ...REQUIRED_APPLICATION_TABLES,
]);

function positiveMilliseconds(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/* DDL must never own process startup indefinitely. A short lock timeout lets a
   live request finish and the retry loop try again; the statement timeout also
   bounds a migration that is slow for a reason other than a conflicting lock.
   Both defaults can be raised explicitly for a known large migration. */
const MIGRATION_LOCK_TIMEOUT_MS = positiveMilliseconds(
  process.env.MIGRATION_LOCK_TIMEOUT_MS, 5000);
const MIGRATION_STATEMENT_TIMEOUT_MS = positiveMilliseconds(
  process.env.MIGRATION_STATEMENT_TIMEOUT_MS, 120000);

/* Both DigitalOcean SQL files are tracked inside /server, which is App
   Platform's source_dir. Never prefer ../../supabase/schema.sql: it uses native
   auth/storage schemas and intentionally remains a separate deployment
   dialect. */
const PLATFORM = path.join(__dirname, "..", "sql", "platform.sql");
const SCHEMA_CANDIDATES = [path.join(__dirname, "..", "sql", "schema.sql")];
/* Applied BEFORE platform.sql, whose first statement refuses a database still
   carrying the legacy auth/storage dialect rather than silently stranding the
   accounts in it. This file is the explicit migration that guard asks for. On a
   database that never used the legacy dialect every block in it is a no-op, so
   it costs one statement per boot and is never conditional on a flag somebody
   has to remember to set. */
const LEGACY = path.join(__dirname, "..", "sql", "legacy-auth-storage.sql");
function resolveSchema() {
  for (const p of SCHEMA_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

/* This is intentionally process-local. It proves THIS running build read and
   successfully applied THIS exact schema file; four tables left by an older or
   half-failed deploy are not equivalent evidence. */
let appliedSchemaFingerprint = null;
const getAppliedSchemaFingerprint = () => appliedSchemaFingerprint;

async function migrate() {
  /* Fail closed while a new attempt is in flight and after every failed or
     skipped attempt. Only the success path at the bottom may publish a digest. */
  appliedSchemaFingerprint = null;
  if (process.env.SKIP_MIGRATE === "1") {
    console.log("migrate: skipped (SKIP_MIGRATE=1)");
    return;
  }
  const schema = resolveSchema();
  const files = [
    ...(fs.existsSync(LEGACY) ? [LEGACY] : []),
    PLATFORM,
    ...(schema ? [schema] : []),
  ];
  const schemaBytes = schema ? fs.readFileSync(schema) : null;
  const expectedFingerprint = schemaBytes
    ? crypto.createHash("sha256").update(schemaBytes).digest("hex")
    : null;
  if (!schema) {
    /* NOT fatal, deliberately. A missing file here is a packaging problem, not
       a broken database, and killing the process would leave the owner staring
       at a failed deploy with no way to see why. Booting means /health answers
       and this line is visible in the logs; every account request will fail
       loudly against the empty schema until it is resolved. */
    console.error("migrate: WARNING — server/sql/schema.sql was not found in this build.");
    console.error("migrate: looked in:\n  " + SCHEMA_CANDIDATES.join("\n  "));
    console.error("migrate: platform.sql will still be applied; the application tables will NOT exist.");
    setLastError("application schema file was not found in this build");
  }

  /* Checked before connecting, because pg turns an unresolved binding into
     `getaddrinfo ENOTFOUND base` and that names the wrong problem. */
  const unusable = describeDatabaseUrl();
  if (unusable) {
    const err = new Error(unusable);
    err.applied = false;
    throw err;
  }

  try { assertTlsConnectionAllowed(); }
  catch (err) { err.applied=false;throw err; }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    /* A certificate that refuses the handshake will refuse it identically on
       every retry, so the retry is only worth making after standing down from
       verification. Done here rather than at the call site because this is the
       one place that knows the attempt failed at connect time. */
    downgradeTlsAfter(err);
    /* Marked so index.js can tell "never reached the database" — nothing
       applied, nothing half-done — from "applied something and it did not
       take", which must still stop the service. */
    err.applied = false;
    throw err;
  }
  try {
    const runtimeRole = await client.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    if (!runtimeRole.rows.length || runtimeRole.rows[0].rolsuper || runtimeRole.rows[0].rolbypassrls) {
      throw new Error("database runtime user must be NOSUPERUSER and NOBYPASSRLS");
    }

    await client.query(
      "select set_config('lock_timeout', $1, false), " +
      "set_config('statement_timeout', $2, false), " +
      "set_config('request.role', 'service_role', false), " +
      "set_config('request.jwt.claim.sub', '', false), " +
      "set_config('request.is_admin', 'false', false), " +
      "set_config('request.user_email', '', false)",
      [MIGRATION_LOCK_TIMEOUT_MS + "ms", MIGRATION_STATEMENT_TIMEOUT_MS + "ms"]);
    for (const file of files) {
      const sql = file === schema && schemaBytes
        ? schemaBytes.toString("utf8")
        : fs.readFileSync(file, "utf8");
      const started = Date.now();
      /* Not wrapped in an explicit transaction: each file is individually
         idempotent, so a retry on the next boot converges. */
      await client.query(sql);
      console.log(`migrate: applied ${path.basename(file)} in ${Date.now() - started}ms`);
    }
    const { rows } = await client.query(
      "select count(*)::int as n from pg_tables where schemaname='public' and tablename=any($1::text[])",
      [REQUIRED_APPLICATION_TABLES]);
    console.log(`migrate: ${rows[0].n} of ${REQUIRED_APPLICATION_TABLES.length} application tables present`);
    if (schema && rows[0].n !== REQUIRED_APPLICATION_TABLES.length) {
      /* The file was there and applied, and the tables still are not. That is a
         real failure and the service must not serve requests with row-level
         security partly missing. */
      throw new Error("schema applied but only " + rows[0].n + " of " + REQUIRED_APPLICATION_TABLES.length + " tables exist");
    }
    const rls = await client.query(
      "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relname=any($1::text[]) " +
      "and c.relrowsecurity and c.relforcerowsecurity",
      [REQUIRED_FORCE_RLS_TABLES]);
    console.log(`migrate: ${rls.rows[0].n} of ${REQUIRED_FORCE_RLS_TABLES.length} required tables have ENABLE + FORCE RLS`);
    if (schema && rls.rows[0].n !== REQUIRED_FORCE_RLS_TABLES.length) {
      throw new Error("schema applied but only " + rls.rows[0].n + " of " + REQUIRED_FORCE_RLS_TABLES.length + " required tables have ENABLE + FORCE RLS");
    }
    if (schema && rows[0].n === REQUIRED_APPLICATION_TABLES.length &&
        rls.rows[0].n === REQUIRED_FORCE_RLS_TABLES.length) {
      appliedSchemaFingerprint = expectedFingerprint;
      console.log("migrate: schema fingerprint " + expectedFingerprint.slice(0, 12));
    }
    /* Last, on the same service-role session, because the first administrator
       cannot be created through the product and this connection is the only
       one that exists. It never throws: see server/lib/bootstrap-admin.js for
       why an administrator convenience must not be able to fail a boot. */
    await bootstrapAdmin(client, process.env);
  } finally {
    /* These timeouts are session-scoped. Never return this connection to the
       request pool: an ordinary payment/auth transaction must not inherit a
       migration-only 5-second lock timeout. A truthy release argument makes
       pg-pool discard the session and open a clean one for future traffic. */
    client.release(true);
  }
}

/* The last migration failure, sanitised, so /health can report WHY rather than
   only that something is wrong. Reading DigitalOcean's runtime logs on a phone
   is a genuine obstacle; a URL is not. Credentials are stripped because a
   connection error can carry the connection string, and /health is public. */
let lastError = null;
function setLastError(msg) {
  lastError = String(msg || "")
    .replace(/postgres(?:ql)?:\/\/[^\s]*/gi, "postgres://<redacted>")
    .replace(/password=\S+/gi, "password=<redacted>")
    .slice(0, 200);
}
const getLastError = () => lastError;

module.exports = { migrate, setLastError, getLastError, getAppliedSchemaFingerprint,
                   REQUIRED_APPLICATION_TABLES, REQUIRED_PLATFORM_TABLES,
                   REQUIRED_FORCE_RLS_TABLES };
