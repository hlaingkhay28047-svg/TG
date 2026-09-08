/* v6.37.0 / panel 6.106.0 — THE ADMIN CAN FIX A RECORD, AND REVIEW IN BULK.

   WHAT WAS MISSING. Until this wave exactly two things about a student were
   writable: account_status and allowed_devices. A name typed badly at sign-up
   was permanent, and the teacher had nowhere to keep "paid by KBZ on 3 Sep"
   except their own memory. Reviewing a morning's signups meant opening and
   closing one dialog per student, each with its own confirm.

   THE SECURITY DECISION THIS FILE EXISTS TO PIN. The note obviously belongs in
   a column on `profiles`. It must not be there. `profiles` carries two policies
   for the student themselves — profiles_select_own and profiles_update_own —
   and Postgres row-level security is ROW level: neither policy can exclude one
   column, and the table-wide grant to `authenticated` cannot be narrowed by a
   column-level revoke. Measured on a real database before the design was
   chosen, with the note as a column on profiles:

       student READS: PRIVATE chasing Sept payment
       student WROTE: erased

   — the person the note is about could read it verbatim and delete it. In
   public.student_notes, which `authenticated` holds no grant on and whose only
   policy is the service context, the same student sees zero rows and their
   UPDATE changes nothing. Check C proves that against a live scratch database
   every run, because this is the kind of property that a later "let's simplify
   the schema" quietly reverses.

   A) evaluateRecordUpdate — pure, so every branch is EXECUTED, not read
   B) the sources: the action is authorized, routed, and the audit never copies
      the note's text into admin_audit_logs (a wider read than the note itself)
   C) a real database: the student can neither read nor write the note, while
      the service context can — and the counterfactual column is shown leaking,
      so the comparison is measured rather than asserted
   D) the admin page carries the bulk bar, the pick column and the record editor

   Usage: node test/verify_admin_record_and_bulk.js   (needs local Postgres for C) */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const {
  ADMIN_ACTIONS, evaluateRecordUpdate, RECORD_NAME_MAX, RECORD_NOTE_MAX,
} = require("../server/lib/admin");
const SCHEMA = fs.readFileSync(path.join(ROOT, "server/sql/schema.sql"), "utf8");
const API_SRC = fs.readFileSync(path.join(ROOT, "server/lib/admin-api.js"), "utf8");
const MIGRATE_SRC = fs.readFileSync(path.join(ROOT, "server/lib/migrate.js"), "utf8");
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, "docs/admin/index.html"), "utf8");
const ADMIN_JS = fs.readFileSync(path.join(ROOT, "docs/admin/admin.js"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------- A) the rules, executed ---------- */
const NUL = String.fromCharCode(0);
const A = [
  ["nothing to change is refused", evaluateRecordUpdate({}), r => !r.ok && r.code === "record_unchanged"],
  ["a null body is refused", evaluateRecordUpdate(null), r => !r.ok && r.code === "record_unchanged"],
  ["an array body is refused", evaluateRecordUpdate([]), r => !r.ok && r.code === "record_unchanged"],
  ["runs of whitespace collapse", evaluateRecordUpdate({ name: "  Ma   Thida  " }),
    r => r.ok && r.changes.name === "Ma Thida"],
  ["a Burmese name survives intact", evaluateRecordUpdate({ name: "မသီတာ ရန်ကုန်" }),
    r => r.ok && r.changes.name === "မသီတာ ရန်ကုန်"],
  ["a Shan name survives intact", evaluateRecordUpdate({ name: "ၸၢႆးသႅင်" }),
    r => r.ok && r.changes.name === "ၸၢႆးသႅင်"],
  ["a NUL, a BOM and a non-breaking space are removed or normalised",
    evaluateRecordUpdate({ name: "A" + NUL + " ﻿B" }), r => r.ok && r.changes.name === "A B"],
  ["an ideographic space becomes one plain space",
    evaluateRecordUpdate({ name: "A　B" }), r => r.ok && r.changes.name === "A B"],
  ["a blank name is refused", evaluateRecordUpdate({ name: "   " }),
    r => !r.ok && r.code === "invalid_name"],
  ["a name at the limit is accepted", evaluateRecordUpdate({ name: "x".repeat(RECORD_NAME_MAX) }), r => r.ok],
  ["a name one over the limit is refused",
    evaluateRecordUpdate({ name: "x".repeat(RECORD_NAME_MAX + 1) }),
    r => !r.ok && r.code === "invalid_name" && r.details.max === RECORD_NAME_MAX],
  ["a name that is not text is refused", evaluateRecordUpdate({ name: 42 }),
    r => !r.ok && r.code === "invalid_name"],
  ["null clears the note", evaluateRecordUpdate({ admin_note: null }),
    r => r.ok && r.changes.adminNote === ""],
  ["an empty note clears it too", evaluateRecordUpdate({ admin_note: "   " }),
    r => r.ok && r.changes.adminNote === ""],
  ["a note keeps its line breaks", evaluateRecordUpdate({ admin_note: "KBZ 3 Sep\nphone 09" }),
    r => r.ok && r.changes.adminNote === "KBZ 3 Sep\nphone 09"],
  ["a note at the limit is accepted", evaluateRecordUpdate({ admin_note: "y".repeat(RECORD_NOTE_MAX) }), r => r.ok],
  ["a note one over the limit is refused",
    evaluateRecordUpdate({ admin_note: "y".repeat(RECORD_NOTE_MAX + 1) }),
    r => !r.ok && r.code === "invalid_note" && r.details.max === RECORD_NOTE_MAX],
  ["a note that is not text is refused", evaluateRecordUpdate({ admin_note: 42 }),
    r => !r.ok && r.code === "invalid_note"],
  ["name and note together", evaluateRecordUpdate({ name: "Ko Ko", admin_note: "paid" }),
    r => r.ok && r.changes.name === "Ko Ko" && r.changes.adminNote === "paid"],
];
const badA = A.filter(([, result, ok]) => !ok(result)).map(([label, result]) => ({ label, result }));
report("A) every rule of a record edit, executed (" + A.length + " cases)", badA.length === 0, badA);

/* ---------- B) the sources ---------- */
report("B1) update_record is an authorized admin action",
  ADMIN_ACTIONS.includes("update_record"), ADMIN_ACTIONS.length);
report("B2) the API routes it and writes both halves",
  /requested === "update_record"/.test(API_SRC) &&
  /update public\.profiles set name=\$2 where id=\$1/.test(API_SRC) &&
  /insert into public\.student_notes/.test(API_SRC) &&
  /delete from public\.student_notes where user_id=\$1/.test(API_SRC), null);
report("B3) the student detail returns the note, so the editor shows what is stored",
  /select note,updated_at from public\.student_notes where user_id=\$1/.test(API_SRC) &&
  /admin_note: noteRow\.rows\.length/.test(API_SRC), null);
/* The audit is read by every admin; the note is read by none of them except
   through the student it belongs to. Copying the text into the audit would
   undo the whole table boundary, so the audit records the FIELD NAMES only. */
report("B4) the audit records which fields changed, never the note's text",
  /record_fields:recordChanges \? Object\.keys\(recordChanges\)\.sort\(\) : null/.test(API_SRC) &&
  !/record_note|admin_note:recordChanges|note:recordChanges\.adminNote/.test(API_SRC), null);
report("B5) student_notes is declared, and migrate REQUIRES it to carry FORCE RLS",
  /create table if not exists public\.student_notes \(/.test(SCHEMA) &&
  /alter table public\.student_notes enable row level security;/.test(SCHEMA) &&
  /alter table public\.student_notes force row level security;/.test(SCHEMA) &&
  /create policy student_notes_service_all on public\.student_notes/.test(SCHEMA) &&
  /public\.student_notes,?/.test(SCHEMA.slice(SCHEMA.indexOf("revoke all on public.roles"))) &&
  /"student_notes",/.test(MIGRATE_SRC), null);
/* If a later wave "simplifies" this onto profiles, C below would start failing
   — but only where a database is available. This pin fails everywhere. */
report("B6) the note is NOT a column on profiles, which the student can read and write",
  !/alter table public\.profiles add column if not exists admin_note/.test(SCHEMA), null);

/* ---------- D) the admin page ---------- */
report("D1) the students list carries a pick column and a bulk bar",
  /id="pickAll"/.test(ADMIN_HTML) && /id="bulkBar"/.test(ADMIN_HTML) &&
  /id="bulkApprove"/.test(ADMIN_HTML) && /id="bulkReject"/.test(ADMIN_HTML), null);
report("D2) the student dialog carries the record editor",
  /id="recordName"/.test(ADMIN_HTML) && /id="recordNote"/.test(ADMIN_HTML) &&
  /id="recordSave"/.test(ADMIN_HTML), null);
/* Every approval stays individually audited: the bulk run sends one request per
   student rather than a batch endpoint, which is the property the audit trail
   exists for. A future refactor to "one call for speed" trips this. */
report("D3) the bulk run posts one audited action per student, and reports what failed",
  /for \(const id of ids\)/.test(ADMIN_JS) &&
  /\$\{API\.students\}\/\$\{encodeURIComponent\(id\)\}\/actions/.test(ADMIN_JS) &&
  /failed\.push\(/.test(ADMIN_JS), null);
report("D4) a selection cannot outlive the rows it was made on",
  /\[\.\.\.state\.picked\]\.forEach\(id => \{ if \(!visible\.has\(id\)\) state\.picked\.delete\(id\); \}\);/.test(ADMIN_JS), null);
report("D5) the record editor is wired to update_record",
  /runAction\("update_record",/.test(ADMIN_JS) && /admin_note: noteField/.test(ADMIN_JS), null);
report("D6) the note field is labelled as invisible to the student",
  /the student never sees this/.test(ADMIN_HTML) ||
  /ကျောင်းသား မမြင်ရပါ/.test(ADMIN_JS), null);

/* ---------- C) a real database ---------- */
const SUFFIX = String(process.pid);
const DB = "hnk_record_probe_" + SUFFIX;
const RUNTIME = "hnk_record_runtime_" + SUFFIX;
const PASSWORD = "record-probe";
const STUDENT = "dddddddd-0000-4000-8000-000000000001";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;
const RUNTIME_ENV = Object.assign({}, ADMIN_ENV, { PGUSER: RUNTIME, PGPASSWORD: PASSWORD });

function psql(args, env = ADMIN_ENV) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args),
    { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (child.error) return { ok: false, out: child.error.message };
  return { ok: child.status === 0, out: ((child.stdout || "") + (child.stderr || "")).trim() };
}
const sql = (text, db = "postgres") => psql(["-d", db, "-c", text]);
function asRole(role, uid, text) {
  const ctx = `select set_config('request.role','${role}',false), ` +
    `set_config('request.jwt.claim.sub','${uid}',false), ` +
    `set_config('request.is_admin','false',false), set_config('request.user_email','',false)`;
  const r = psql(["-d", DB, "-c", ctx, "-c", text], RUNTIME_ENV);
  return { ok: r.ok, out: r.out.split(/\r?\n/).slice(1).join("\n").trim() };
}
function cleanup() {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'`);
  sql(`drop database if exists "${DB}"`);
  sql(`drop role if exists "${RUNTIME}"`);
}

(async () => {
  const probe = sql("select 1");
  if (!probe.ok) {
    report("C) a live database proves the note is unreachable by the student", false,
      "no local Postgres: " + probe.out.slice(0, 160));
    console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
    process.exit(failures === 0 ? 0 : 1);
  }
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (r.ok) r = sql(`create database "${DB}" owner "${RUNTIME}"`);
  if (!r.ok) { report("C) scratch role and database", false, r.out.slice(0, 200)); cleanup(); process.exit(1); }

  const migrated = spawnSync("node",
    ["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
    {
      cwd: path.join(ROOT, "server"),
      env: Object.assign({}, ADMIN_ENV, {
        PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1",
        DATABASE_URL: `postgres://${RUNTIME}:${PASSWORD}@${ADMIN_ENV.PGHOST}:${ADMIN_ENV.PGPORT}/${DB}`,
      }),
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000,
    });
  if (migrated.status !== 0) {
    report("C) the scratch database carries the tracked schema", false,
      ((migrated.stdout || "") + (migrated.stderr || "")).split(/\r?\n/).slice(-4));
    cleanup(); process.exit(1);
  }
  report("C0) the scratch database carries the tracked schema", true);

  const SECRET = "PRIVATE chasing the September payment";
  const seeded = asRole("service_role", "", `
    insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at)
      values ('${STUDENT}','record-probe@x.test','x',now()) on conflict do nothing;
    insert into public.profiles (id,name,email)
      values ('${STUDENT}','Student','record-probe@x.test') on conflict do nothing;
    insert into public.student_notes (user_id,note) values ('${STUDENT}','${SECRET}')
      on conflict (user_id) do update set note=excluded.note;
    select count(*) from public.student_notes`);
  report("C1) the service context can write the note", seeded.ok && seeded.out === "1", seeded.out);

  const read = asRole("authenticated", STUDENT, "select count(*) from public.student_notes");
  report("C2) the student sees NONE of it — not one row",
    read.ok && read.out === "0", { rowsVisibleToStudent: read.out });

  asRole("authenticated", STUDENT,
    `update public.student_notes set note='erased by the student' where user_id='${STUDENT}'`);
  const after = asRole("service_role", "", `select note from public.student_notes where user_id='${STUDENT}'`);
  report("C3) the student's own UPDATE does not touch it",
    after.ok && after.out === SECRET, { noteNow: after.out });

  asRole("authenticated", STUDENT, `delete from public.student_notes where user_id='${STUDENT}'`);
  const afterDelete = asRole("service_role", "", "select count(*) from public.student_notes");
  report("C4) the student cannot delete it either",
    afterDelete.ok && afterDelete.out === "1", { rows: afterDelete.out });

  /* The counterfactual, measured rather than argued: the same note as a column
     on profiles is readable AND writable by the student it is about. This is
     the whole reason student_notes exists, so the comparison ships with it. */
  asRole("service_role", "", `
    alter table public.profiles add column if not exists probe_note text;
    update public.profiles set probe_note='${SECRET}' where id='${STUDENT}'`);
  const leakRead = asRole("authenticated", STUDENT,
    `select coalesce(probe_note,'(null)') from public.profiles where id='${STUDENT}'`);
  asRole("authenticated", STUDENT,
    `update public.profiles set probe_note='erased' where id='${STUDENT}'`);
  const leakWrite = asRole("service_role", "",
    `select coalesce(probe_note,'(null)') from public.profiles where id='${STUDENT}'`);
  report("C5) and the column on profiles that this design rejects really does leak"
    + "  [student read: " + JSON.stringify(leakRead.out) + ", then wrote: " + JSON.stringify(leakWrite.out) + "]",
    leakRead.out === SECRET && leakWrite.out === "erased",
    { read: leakRead.out, afterStudentWrite: leakWrite.out });

  cleanup();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
