/* Regression for the first-administrator bootstrap.

   public.profiles.is_admin defaults to false and schema.sql's own trigger
   forces `new.is_admin := false` on any insert carrying a JWT, so no account
   can promote itself. That is deliberate, and it means the FIRST administrator
   on a fresh database can never be created through the product.
   server/lib/bootstrap-admin.js closes that hole from inside the container, on
   the service-role session that has just applied the schema.

   The properties that matter are the ones that would be dangerous to get
   wrong, so each is asserted rather than assumed:

     * it grants, and never revokes — removing the variable must not be able to
       lock every administrator out of /admin
     * it promotes nobody but the requested address
     * it matches case-insensitively, because signup stores the address exactly
       as typed while every lookup uses lower(email); a case-sensitive `=` here
       would silently update nothing and look like success
     * it joins through the identifier, so a profiles row with no email copy is
       still reachable
     * it never throws — not on a typo, not on a missing account, not on a
       failing query. A boot must not die for an administrator convenience.

   It runs under the SAME restricted login production uses — NOSUPERUSER,
   NOBYPASSRLS — and against the real schema, because "it worked as postgres"
   has never been evidence about App Platform.

   This deliberately uses a real PostgreSQL server. CI supplies PostgreSQL 16;
   locally, point the standard PGHOST/PGPORT/PGUSER/PGPASSWORD variables at an
   administrator that may create a scratch role and database.

   Usage: node test/verify_admin_bootstrap.js */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LEGACY = path.join(ROOT, "server", "sql", "legacy-auth-storage.sql");
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");
const SCHEMA = path.join(ROOT, "server", "sql", "schema.sql");

const SUFFIX = String(process.pid);
const DB = "hnk_admin_bootstrap_" + SUFFIX;
const RUNTIME = "hnk_admin_runtime_" + SUFFIX;
const PASSWORD = "admin-bootstrap-probe";

const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const STUDENT = "aaaaaaaa-0000-4000-8000-000000000002";
const NO_COPY = "aaaaaaaa-0000-4000-8000-000000000003";

const OWNER_EMAIL = "Hlaingkhay28047@gmail.com";
const STUDENT_EMAIL = "student@example.com";
const NO_COPY_EMAIL = "NoProfileCopy@example.com";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;
const RUNTIME_ENV = Object.assign({}, ADMIN_ENV, {
  PGUSER: RUNTIME, PGPASSWORD: PASSWORD,
});

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
const sql = (text, db = "postgres", env = ADMIN_ENV) => psql(["-d", db, "-c", text], env);

/* The session settings server/lib/migrate.js establishes before it applies a
   file. Without them the schema's own service-only inserts are refused, which
   would be a property of this harness rather than of the schema. */
const SERVICE_CONTEXT =
  "select set_config('request.role','service_role',false), " +
  "set_config('request.jwt.claim.sub','',false), " +
  "set_config('request.is_admin','false',false), " +
  "set_config('request.user_email','',false)";

/* profiles carries FORCE RLS with service-only policies, so a read that does
   not establish the service context first sees an empty table and would report
   a passing assertion as a failure — a property of this harness, not of the
   schema. psql runs -c flags in order on one connection, so the context is
   live for the statement that follows; the context select's own result row is
   the first line of output and is dropped, leaving only the answer asserted. */
function serviceSql(text) {
  const result = psql(["-d", DB, "-c", SERVICE_CONTEXT, "-c", text], RUNTIME_ENV);
  const lines = result.out.split(/\r?\n/);
  return { ok: result.ok, out: lines.slice(1).join("\n").trim() };
}

function cleanup() {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'`);
  sql(`drop database if exists "${DB}"`);
  sql(`drop role if exists "${RUNTIME}"`);
}

function setup() {
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (!r.ok) return r;
  r = sql(`create database "${DB}" owner "${RUNTIME}"`);
  if (!r.ok) return r;
  for (const file of [LEGACY, PLATFORM, SCHEMA]) {
    r = psql(["-d", DB, "-c", SERVICE_CONTEXT, "-f", file], RUNTIME_ENV);
    if (!r.ok) return { ok: false, out: path.basename(file) + ": " + r.out };
  }
  return { ok: true };
}

/* Three accounts: the owner whose address is stored with a capital letter, an
   ordinary student who must be left alone, and one whose profiles row carries
   no email copy at all — the shape older rows have, and the reason the module
   joins through the identifier instead of comparing profiles.email. */
const FIXTURE = `
${SERVICE_CONTEXT};
insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at)
values ('${OWNER}','${OWNER_EMAIL}','x',now()),
       ('${STUDENT}','${STUDENT_EMAIL}','x',now()),
       ('${NO_COPY}','${NO_COPY_EMAIL}','x',now());
insert into public.profiles (id,name,email,account_status)
values ('${OWNER}',null,'${OWNER_EMAIL}','pending'),
       ('${STUDENT}',null,'${STUDENT_EMAIL}','active'),
       ('${NO_COPY}',null,null,'pending');
`;

/* The module under test, driven exactly as migrate.js drives it: one pg client
   on the restricted login, the service context set first, and every line it
   writes captured so the boot log itself can be asserted. */
function runBootstrap(bootstrapEmail) {
  const script = `
    const { Client } = require(${JSON.stringify(path.join(ROOT, "server", "node_modules", "pg"))});
    const { bootstrapAdmin } = require(${JSON.stringify(path.join(ROOT, "server", "lib", "bootstrap-admin.js"))});
    const lines = [];
    const log = m => lines.push(String(m));
    log.warn = m => lines.push(String(m));
    (async () => {
      const client = new Client({
        host: process.env.PGHOST, port: Number(process.env.PGPORT),
        user: process.env.PGUSER, password: process.env.PGPASSWORD,
        database: ${JSON.stringify(DB)},
      });
      await client.connect();
      await client.query(${JSON.stringify(SERVICE_CONTEXT)});
      let threw = null;
      try {
        await bootstrapAdmin(client, ${JSON.stringify(
          bootstrapEmail === null ? {} : { BOOTSTRAP_ADMIN_EMAIL: bootstrapEmail })}, log);
      } catch (err) { threw = String(err && err.message); }
      await client.end();
      process.stdout.write(JSON.stringify({ lines, threw }));
    })().catch(err => { process.stdout.write(JSON.stringify({ fatal: String(err && err.message) })); });
  `;
  const child = spawnSync(process.execPath, ["-e", script], {
    env: RUNTIME_ENV, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, cwd: ROOT,
  });
  try {
    return Object.assign({ exit: child.status }, JSON.parse(child.stdout || "{}"));
  } catch (err) {
    return { exit: child.status, parseError: String(err && err.message),
             stdout: (child.stdout || "").slice(0, 400),
             stderr: (child.stderr || "").slice(0, 400) };
  }
}

const admins = () => serviceSql(
  "select coalesce(string_agg(id::text, ',' order by id), '') from public.profiles where is_admin is true"
).out.trim();

function main() {
  const ready = setup();
  if (!ready.ok) {
    report("scratch database with the real schema", false, ready.out.split(/\r?\n/).slice(0, 6));
    return;
  }
  const seeded = psql(["-d", DB, "-c", FIXTURE], RUNTIME_ENV);
  if (!seeded.ok) {
    report("three seeded accounts", false, seeded.out.split(/\r?\n/).slice(0, 6));
    return;
  }
  report("A schema applies and nobody starts out an administrator", admins() === "", admins());

  /* B — unset. The variable is how an owner asks for a promotion; with no
     request there must be no write, and the roster must still answer the
     question the module also exists to answer. */
  let run = runBootstrap(null);
  const bNoWrite = admins() === "";
  const bReports = (run.lines || []).some(l => /no account holds is_admin/.test(l));
  report("B unset: nothing is promoted and the empty roster is still reported",
    bNoWrite && bReports && !run.threw, run);

  /* C — a typo must be loud and harmless. Silence here is the failure mode
     that leaves an owner staring at "Not authorized" with no idea why. */
  run = runBootstrap("not-an-email");
  report("C invalid address: named in the log, no write, no throw",
    admins() === "" && !run.threw &&
    (run.lines || []).some(l => /BOOTSTRAP_ADMIN_EMAIL is not a valid email/.test(l)), run);

  /* D — an address nobody has signed up with. Also harmless, also named, and
     distinguishable from "already an administrator" via the roster line. */
  run = runBootstrap("nobody@example.com");
  report("D unknown address: promoted nothing, said so, did not throw",
    admins() === "" && !run.threw &&
    (run.lines || []).some(l => /promoted nothing/.test(l)), run);

  /* E — the real promotion, in the case that would break a case-sensitive
     comparison: stored with a capital H, requested in lower case. */
  run = runBootstrap(OWNER_EMAIL.toLowerCase());
  const ePromoted = admins() === OWNER;
  const eSaid = (run.lines || []).some(l => /promoted 1 account to administrator/.test(l));
  const eRoster = (run.lines || []).some(l => /1 account\(s\) hold is_admin/.test(l) && l.includes(OWNER_EMAIL));
  report("E case-insensitive promotion: exactly the owner, announced, and in the roster",
    ePromoted && eSaid && eRoster && !run.threw, { admins: admins(), run });

  /* F — the student is not collateral. */
  const studentFlag = serviceSql(`select is_admin from public.profiles where id='${STUDENT}'`).out.trim();
  report("F no other account was promoted", studentFlag === "f", studentFlag);

  /* G — idempotent. A second boot with the variable still set must be a no-op
     that still reports the truth, because every redeploy runs this again. */
  run = runBootstrap(OWNER_EMAIL);
  report("G second boot: promotes nothing more and still names the administrator",
    admins() === OWNER &&
    (run.lines || []).some(l => /promoted nothing/.test(l)) &&
    (run.lines || []).some(l => /1 account\(s\) hold is_admin/.test(l)), run);

  /* H — THE ONE THAT MUST NEVER REGRESS. Clearing the variable must not clear
     the flag: a config slip cannot be allowed to lock every administrator out
     of the panel, which is a state no one could recover from through the
     product. */
  run = runBootstrap(null);
  report("H removing the variable does NOT demote the administrator",
    admins() === OWNER && !run.threw, { admins: admins(), run });

  /* I — a profiles row with no email copy is still reachable, because the
     match runs through hnk_auth_users. */
  run = runBootstrap(NO_COPY_EMAIL.toUpperCase());
  report("I an account whose profile carries no email copy is still promoted",
    admins().split(",").includes(NO_COPY) && !run.threw, { admins: admins(), run });

  /* J — the roster names the account_status too, so an owner can see at a
     glance that a pending administrator is still an administrator. */
  run = runBootstrap(null);
  report("J the roster reports each administrator's account status",
    (run.lines || []).some(l => l.includes(OWNER_EMAIL + " (pending)")), run);

  /* K — a failing query is reported, not thrown. Revoking the runtime login's
     access to profiles reproduces the shape of a permission the migration
     login turns out not to hold. */
  sql(`revoke all on public.profiles from "${RUNTIME}"`, DB, ADMIN_ENV);
  run = runBootstrap(OWNER_EMAIL);
  report("K a failing bootstrap is reported and never throws",
    !run.threw && !run.fatal && (run.lines || []).some(l => /failed —/.test(l)), run);
  sql(`grant all on public.profiles to "${RUNTIME}"`, DB, ADMIN_ENV);
}

try { main(); } finally { cleanup(); }
console.log(failures ? "FAIL" : "PASS");
process.exit(failures ? 1 : 0);
