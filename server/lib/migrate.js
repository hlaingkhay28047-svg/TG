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
 * it is what test/verify_schema_behaviour.js check B asserts by applying them
 * three times in a row and requiring app_settings to still hold exactly one
 * row afterwards.
 *
 * ORDER MATTERS. platform.sql creates auth.users, auth.uid() and the roles that
 * supabase/schema.sql's policies are written against; reversed, the second file
 * fails on its first statement.
 *
 * A failure here is fatal on purpose. A service that starts with a half-applied
 * schema answers requests with row-level security partly missing, which is the
 * one outcome worse than not starting.
 */
const fs = require("fs");
const path = require("path");
const { pool, describeDatabaseUrl, downgradeTlsAfter } = require("./db");

/* platform.sql sits inside server/ and is always there. supabase/schema.sql
   does not — it belongs to the repository root, and App Platform builds from
   source_dir, so whether the sibling directory is present depends on how the
   source was packaged. Both locations are tried rather than assumed, and the
   difference between "not shipped" and "failed to apply" is kept, because they
   need opposite responses. */
const PLATFORM = path.join(__dirname, "..", "sql", "platform.sql");
const SCHEMA_CANDIDATES = [
  path.join(__dirname, "..", "..", "supabase", "schema.sql"),  /* full checkout */
  path.join(__dirname, "..", "sql", "schema.sql"),             /* copied in at build */
];
function resolveSchema() {
  for (const p of SCHEMA_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

async function migrate() {
  if (process.env.SKIP_MIGRATE === "1") {
    console.log("migrate: skipped (SKIP_MIGRATE=1)");
    return;
  }
  const schema = resolveSchema();
  const files = schema ? [PLATFORM, schema] : [PLATFORM];
  if (!schema) {
    /* NOT fatal, deliberately. A missing file here is a packaging problem, not
       a broken database, and killing the process would leave the owner staring
       at a failed deploy with no way to see why. Booting means /health answers
       and this line is visible in the logs; every account request will fail
       loudly against the empty schema until it is resolved. */
    console.error("migrate: WARNING — supabase/schema.sql was not found in this build.");
    console.error("migrate: looked in:\n  " + SCHEMA_CANDIDATES.join("\n  "));
    console.error("migrate: platform.sql will still be applied; the application tables will NOT exist.");
  }

  /* Checked before connecting, because pg turns an unresolved binding into
     `getaddrinfo ENOTFOUND base` and that names the wrong problem. */
  const unusable = describeDatabaseUrl();
  if (unusable) {
    const err = new Error(unusable);
    err.applied = false;
    throw err;
  }

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
    for (const file of files) {
      const sql = fs.readFileSync(file, "utf8");
      const started = Date.now();
      /* Not wrapped in an explicit transaction: each file is individually
         idempotent, so a retry on the next boot converges. */
      await client.query(sql);
      console.log(`migrate: applied ${path.basename(file)} in ${Date.now() - started}ms`);
    }
    const { rows } = await client.query(
      "select count(*)::int as n from pg_tables where schemaname='public' " +
      "and tablename in ('profiles','payment_requests','app_settings','devices')");
    console.log(`migrate: ${rows[0].n} of 4 application tables present`);
    if (schema && rows[0].n !== 4) {
      /* The file was there and applied, and the tables still are not. That is a
         real failure and the service must not serve requests with row-level
         security partly missing. */
      throw new Error("schema applied but only " + rows[0].n + " of 4 tables exist");
    }
  } finally {
    client.release();
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

module.exports = { migrate, setLastError, getLastError };
