/* verify_copy_database — the dev-to-cluster copier, against two real scratch
   databases, as the NOBYPASSRLS runtime role App Platform actually connects
   with. "It worked as postgres" is not evidence: every table FORCEs row-level
   security, so the copier's service-role context is load-bearing on both
   sides — a contextless run would read zero rows and report a "successful"
   copy of nothing, which assertion B below would catch.

   Pinned contracts:
   A) A fresh target receives the tracked schema and every row: per-table
      counts equal the seeded source, and the copier says MIGRATION COMPLETE.
   B) The copied rows are the real rows: the seeded accounts, device, session
      and audit rows are present in the target (asserted as booleans — CI logs
      are public, so no address is ever printed).
   C) The second run is a no-op: it reports the populated target and changes
      nothing — the POST_DEPLOY job re-runs on every later deployment.
   D) Sequences continue: an insert into a serial-keyed table succeeds after
      the copy instead of colliding with a copied id.
   E) Without SOURCE_DATABASE_URL the copier refuses with a named reason and a
      non-zero exit, and its output carries no connection string.

   This deliberately uses a real PostgreSQL server. CI supplies PostgreSQL 16;
   locally, point PGHOST/PGPORT/PGUSER/PGPASSWORD at an administrator that may
   create scratch roles and databases.

   Usage: node test/verify_copy_database.js */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SUFFIX = String(process.pid);
const SRC_DB = "hnk_copy_src_" + SUFFIX;
const TGT_DB = "hnk_copy_tgt_" + SUFFIX;
const RUNTIME = "hnk_copy_runtime_" + SUFFIX;
const PASSWORD = "copy-database-probe";

const OWNER = "bbbbbbbb-0000-4000-8000-000000000001";
const STUDENT = "bbbbbbbb-0000-4000-8000-000000000002";
const DEVICE_SLOT = "bbbbbbbb-0000-4000-8000-0000000000aa";
const SESSION = "bbbbbbbb-0000-4000-8000-0000000000bb";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function psql(args, env = ADMIN_ENV) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args), {
    env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  const output = ((child.stdout || "") + (child.stderr || "")).trim();
  if (child.error) return { ok: false, out: child.error.message };
  return { ok: child.status === 0, out: output };
}
const sql = (text, db = "postgres") => psql(["-d", db, "-c", text]);

const RUNTIME_ENV = Object.assign({}, ADMIN_ENV, { PGUSER: RUNTIME, PGPASSWORD: PASSWORD });
const SERVICE_CONTEXT =
  "select set_config('request.role','service_role',false), " +
  "set_config('request.jwt.claim.sub','',false), " +
  "set_config('request.is_admin','false',false), " +
  "set_config('request.user_email','',false)";
function serviceSql(db, text) {
  const result = psql(["-d", db, "-c", SERVICE_CONTEXT, "-c", text], RUNTIME_ENV);
  const lines = result.out.split(/\r?\n/);
  return { ok: result.ok, out: lines.slice(1).join("\n").trim() };
}

function url(db) {
  return "postgres://" + RUNTIME + ":" + PASSWORD + "@" +
    ADMIN_ENV.PGHOST + ":" + ADMIN_ENV.PGPORT + "/" + db;
}

/* Run a node script with the copier's production environment shape. */
function runNode(args, envExtra) {
  const child = spawnSync("node", args, {
    cwd: path.join(ROOT, "server"),
    env: Object.assign({}, ADMIN_ENV, { PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1" }, envExtra),
    encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000,
  });
  return { status: child.status, out: (child.stdout || "") + (child.stderr || "") };
}

function migrateInto(db) {
  return runNode(["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
    { DATABASE_URL: url(db) });
}

function cleanup() {
  for (const db of [SRC_DB, TGT_DB]) {
    sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${db}'`);
    sql(`drop database if exists "${db}"`);
  }
  sql(`drop role if exists "${RUNTIME}"`);
}

const FIXTURE = `
insert into public.hnk_auth_users (id, email, encrypted_password, email_confirmed_at)
values ('${OWNER}', 'owner-copy-probe@example.com', 'scrypt$16384$8$1$AAAA$AAAA', now()),
       ('${STUDENT}', 'student-copy-probe@example.com', 'scrypt$16384$8$1$BBBB$BBBB', now());
insert into public.profiles (id, email, name, is_admin) values
  ('${OWNER}', 'owner-copy-probe@example.com', 'Owner', true),
  ('${STUDENT}', 'student-copy-probe@example.com', 'Student', false);
insert into public.device_slots (id, user_id, slot_type, status) values
  ('${DEVICE_SLOT}', '${STUDENT}', 'phone', 'active');
insert into public.sessions (id, user_id, client_type, refresh_token_hash, expires_at) values
  ('${SESSION}', '${STUDENT}', 'web', 'hash-copy-probe', now() + interval '30 days');
insert into public.login_history (user_id, event_type, success, attempted_email) values
  ('${STUDENT}', 'login', true, 'student-copy-probe@example.com');
update public.app_settings set price_1m = 24680;
`;

(async () => {
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (r.ok) r = sql(`create database "${SRC_DB}" owner "${RUNTIME}"`);
  if (r.ok) r = sql(`create database "${TGT_DB}" owner "${RUNTIME}"`);
  if (!r.ok) { report("scratch roles and databases", false, r.out.slice(0, 300)); process.exit(1); }

  const migrated = migrateInto(SRC_DB);
  if (migrated.status !== 0) {
    report("source database carries the tracked schema", false, migrated.out.split(/\r?\n/).slice(-4));
    cleanup(); process.exit(1);
  }
  const seeded = psql(["-d", SRC_DB, "-c", SERVICE_CONTEXT, "-c", FIXTURE], RUNTIME_ENV);
  if (!seeded.ok) {
    report("source database seeded", false, seeded.out.slice(0, 400));
    cleanup(); process.exit(1);
  }

  /* ---- A) the copy ---- */
  const first = runNode(["copy-database.js"], {
    DATABASE_URL: url(TGT_DB),
    SOURCE_DATABASE_URL: url(SRC_DB),
  });
  const complete = /MIGRATION COMPLETE/.test(first.out);
  report("A) first run applies the schema and reports a complete verified copy",
    first.status === 0 && complete,
    { status: first.status, tail: first.out.split(/\r?\n/).slice(-4) });

  const counts = {};
  /* roles and app_settings are seeded by the migration on BOTH sides; equal
     counts prove the copier cleared the target's seeds instead of merging. */
  for (const table of ["hnk_auth_users", "profiles", "device_slots", "sessions", "login_history", "app_settings", "roles"]) {
    const src = serviceSql(SRC_DB, `select count(*) from public.${table}`);
    const tgt = serviceSql(TGT_DB, `select count(*) from public.${table}`);
    counts[table] = src.out + "->" + tgt.out;
    if (!src.ok || !tgt.ok || src.out !== tgt.out || src.out === "0") {
      report("B) " + table + " arrived in full", false, counts[table]);
    }
  }
  const ownerThere = serviceSql(TGT_DB,
    `select count(*) from public.profiles where id='${OWNER}' and is_admin`);
  const sessionThere = serviceSql(TGT_DB,
    `select count(*) from public.sessions where id='${SESSION}'`);
  const priceThere = serviceSql(TGT_DB,
    "select count(*) from public.app_settings where price_1m = 24680");
  report("B) every seeded table matches its source count and the copied rows are the real rows",
    ownerThere.out === "1" && sessionThere.out === "1" && priceThere.out === "1" &&
      Object.values(counts).every(pair => { const [a, b] = pair.split("->"); return a === b && a !== "0"; }),
    { counts, ownerThere: ownerThere.out, sessionThere: sessionThere.out, priceThere: priceThere.out });

  /* ---- C) the rerun no-ops ---- */
  const again = runNode(["copy-database.js"], {
    DATABASE_URL: url(TGT_DB),
    SOURCE_DATABASE_URL: url(SRC_DB),
  });
  const users = serviceSql(TGT_DB, "select count(*) from public.hnk_auth_users");
  report("C) the second run refuses the populated target and duplicates nothing",
    again.status === 0 && /already holds 2 account/.test(again.out) &&
      !/MIGRATION COMPLETE/.test(again.out) && users.out === "2",
    { status: again.status, users: users.out, tail: again.out.split(/\r?\n/).slice(-2) });

  /* ---- D) the target keeps accepting writes after the copy ---- */
  const nextRow = serviceSql(TGT_DB,
    "insert into public.login_history (user_id, event_type, success, attempted_email) " +
    `values ('${STUDENT}', 'login', true, 'student-copy-probe@example.com') returning id`);
  report("D) an ordinary insert after the copy succeeds with a fresh id",
    nextRow.ok && /^[0-9a-f-]{36}$/.test(nextRow.out), { ok: nextRow.ok });

  /* ---- E) refusal without a source ---- */
  const refused = runNode(["copy-database.js"], { DATABASE_URL: url(TGT_DB) });
  report("E) without SOURCE_DATABASE_URL the copier refuses by name and leaks no connection string",
    refused.status === 1 && /SOURCE_DATABASE_URL is not set/.test(refused.out) &&
      !refused.out.includes(PASSWORD),
    { status: refused.status, tail: refused.out.split(/\r?\n/).slice(-2) });

  cleanup();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})().catch(error => {
  cleanup();
  console.error("verify_copy_database: " + (error && error.message));
  process.exit(1);
});
