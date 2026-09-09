/* v6.48.0 — ONE BROWSER MAY BELONG TO SEVERAL ACCOUNTS.
 *
 * WHY THIS FILE EXISTS. device_installations_active_hash_uniq was
 *
 *     unique (installation_hash) where revoked_at is null
 *
 * across the WHOLE table: a browser registered to one account could not be
 * registered to any other, anywhere in the system. It was written as an
 * anti-sharing control and it was not one. Licence sharing is ONE ACCOUNT ON
 * MANY DEVICES, and profiles.allowed_devices is what counts that. This index
 * stopped MANY ACCOUNTS ON ONE BROWSER, where each account pays for its own
 * licence and spends its own seat — the borrowed laptop, the family computer,
 * the shop machine, the teacher opening a student's own view. And it never
 * enforced what it looked like it enforced: the identity is a per-BROWSER id,
 * so anyone it inconvenienced opened a second browser and walked around it.
 *
 * Worse, it destroyed the signal. Blocking pushed genuine multi-account use
 * onto separate browser profiles where nothing can see it. The owner asked for
 * the trade on 2026-09-09: stop blocking, start recording.
 *
 * So this file holds the new shape from both ends:
 *
 *   A) the SCHEMA — the global index is gone, the per-account one is there,
 *      and user_id is a real, backfilled, NOT NULL column, because a uniqueness
 *      scoped to an account cannot exist without it
 *   B) a LIVE DATABASE — three accounts on one browser, each on its own seat,
 *      the admin-set limit still refusing, and the co-use counted
 *   C) the ADMIN sees the count instead of the block
 *   D) CI runs this test
 *
 * Usage: node test/verify_shared_device.js   (a local Postgres enables B and C) */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) failures++;
}
/* this file's own prose names the identifiers it asserts; a comment is not
   code, so every source check reads the DECOMMENTED text */
const decomment = src => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const SCHEMA = decomment(read("server/sql/schema.sql"));
const DEVICES = decomment(read("server/lib/devices.js"));
const ADMIN_API = decomment(read("server/lib/admin-api.js"));
const ADMIN_JS = decomment(read("docs/admin/admin.js"));
const WORKFLOW = read(".github/workflows/test.yml");

/* ---------------- A) the schema ---------------- */
report("A) the global one-browser-one-account index is dropped, by name",
  /drop index if exists device_installations_active_hash_uniq;/.test(SCHEMA) &&
  !/create unique index if not exists device_installations_active_hash_uniq/.test(SCHEMA), null);
report("A2) uniqueness is scoped to the account, the client and the browser — all three",
  /create unique index if not exists device_installations_active_user_hash_uniq\s*\n\s*on public\.device_installations \(user_id, client_type, installation_hash\)\s*\n\s*where revoked_at is null;/.test(SCHEMA), null);
/* an index cannot reference a joined column, so the scoping needs the column
   on the row. Added, backfilled from the slot, and only then made NOT NULL —
   in that order, or a deployed database with rows fails the migration. */
const addAt = SCHEMA.indexOf("add column if not exists user_id uuid");
const fillAt = SCHEMA.indexOf("set user_id = s.user_id");
const notNullAt = SCHEMA.indexOf("alter column user_id set not null");
report("A3) user_id is added, backfilled from the slot, and only then required — in that order",
  addAt > 0 && fillAt > addAt && notNullAt > fillAt, { addAt, fillAt, notNullAt });
report("A4) the migration is idempotent, so a redeploy over live rows is a no-op",
  /add column if not exists user_id/.test(SCHEMA) &&
  /i\.user_id is distinct from s\.user_id/.test(SCHEMA) &&
  /create index if not exists device_installations_user_hash_idx/.test(SCHEMA), null);
/* the one-active-panel-per-computer-seat index is a different rule and is NOT
   what this release touches — it is the control that actually limits panels */
report("A5) the per-seat client index is untouched — one active panel per computer seat still stands",
  /create unique index if not exists device_installations_active_client_uniq\s*\n\s*on public\.device_installations \(slot_id, client_type\)\s*\n\s*where revoked_at is null;/.test(SCHEMA), null);

/* ---------------- the server no longer refuses on ownership ---------------- */
report("A6) no path can answer device_registered_elsewhere any more",
  DEVICES.indexOf("device_registered_elsewhere") < 0, null);
report("A7) user_id is written on insert, not left to a join",
  /\(slot_id,user_id,client_type,installation_hash,label,created_at,last_seen_at\)/.test(DEVICES), null);
report("A8) the co-use count is a repository method, counting live rows of OTHER accounts only",
  /async countOtherAccountsOnHash\(installationHash, userId\)/.test(DEVICES) &&
  /count\(distinct i\.user_id\)/.test(DEVICES) &&
  /i\.revoked_at is null and i\.user_id <> \$2/.test(DEVICES), null);

/* ---------------- C) the admin sees it ---------------- */
report("C) the admin student view carries shared_with on every installation",
  /'shared_with',\(select count\(distinct o\.user_id\) from public\.device_installations o/.test(ADMIN_API) &&
  /where o\.installation_hash=i\.installation_hash\s*\n\s*and o\.revoked_at is null and o\.user_id<>\$1\)/.test(ADMIN_API), null);
report("C2) the console reads it, shows it only when there is co-use, and names no other student",
  /function sharedWith\(device\)/.test(ADMIN_JS) &&
  /Math\.max\(most, Number\(row && row\.shared_with\) \|\| 0\)/.test(ADMIN_JS) &&
  /sharedWith\(device\) \? node\("small", \{ className: "shared-note",/.test(ADMIN_JS) &&
  /"d\.sharedWith":/.test(ADMIN_JS), null);

/* ---------------- D) CI ---------------- */
report("D) CI runs this test", WORKFLOW.indexOf("verify_shared_device.js") >= 0, null);

/* ---------------- B) the live database ---------------- */
const DB = "hnk_shared_device_probe";
const RUNTIME = "hnk_shared_device_role";
const PASSWORD = "shared-device-probe";
const A_ID = "cccccccc-0000-4000-8000-00000000000a";
const B_ID = "cccccccc-0000-4000-8000-00000000000b";
const C_ID = "cccccccc-0000-4000-8000-00000000000c";
const ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ENV.PGOPTIONS;
function psql(args) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args),
    { env: ENV, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (child.error) return { ok: false, out: child.error.message };
  return { ok: child.status === 0, out: ((child.stdout || "") + (child.stderr || "")).trim() };
}
const sql = (text, db = "postgres") => psql(["-d", db, "-c", text]);
function cleanup() {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'`);
  sql(`drop database if exists "${DB}"`);
  sql(`drop role if exists "${RUNTIME}"`);
}

(async () => {
  const probe = sql("select 1");
  if (!probe.ok) {
    report("B) a live database proves one browser serves several accounts", false,
      "no local Postgres: " + probe.out.slice(0, 160));
    console.log("\n" + (failures ? failures + " FAILURE(S)" : "All checks passed"));
    process.exit(failures ? 1 : 0);
  }
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (r.ok) r = sql(`create database "${DB}" owner "${RUNTIME}"`);
  if (!r.ok) { report("B) scratch role and database", false, r.out.slice(0, 200)); cleanup(); process.exit(1); }
  const url = `postgres://${RUNTIME}:${PASSWORD}@${ENV.PGHOST}:${ENV.PGPORT}/${DB}`;
  const migrated = spawnSync("node",
    ["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
    { cwd: path.join(ROOT, "server"),
      env: Object.assign({}, ENV, { PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1", DATABASE_URL: url }),
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000 });
  if (migrated.status !== 0) {
    report("B0) the scratch database carries the tracked schema", false,
      ((migrated.stdout || "") + (migrated.stderr || "")).split(/\r?\n/).slice(-4));
    cleanup(); process.exit(1);
  }
  report("B0) the scratch database carries the tracked schema", true);

  /* the indexes are asserted from the DATABASE, not from the file that was
     supposed to create them */
  const indexes = sql(
    "select indexname from pg_indexes where tablename='device_installations' order by indexname", DB);
  report("B1) the live database has the per-account index and NOT the global one",
    indexes.ok && indexes.out.includes("device_installations_active_user_hash_uniq") &&
    !indexes.out.includes("device_installations_active_hash_uniq"), indexes.out);
  const notNull = sql(
    "select is_nullable from information_schema.columns where table_name='device_installations' and column_name='user_id'", DB);
  report("B1b) user_id exists on the row and is required",
    notNull.ok && notNull.out.trim() === "NO", notNull.out);

  process.env.DEVICE_PAIRING_SECRET = "s".repeat(48);
  process.env.DEVICE_ID_HASH_SECRET = "h".repeat(48);
  const { Client } = require(path.join(ROOT, "server/node_modules/pg"));
  const ent = require(path.join(ROOT, "server/lib/entitlements.js"));
  const admin = require(path.join(ROOT, "server/lib/admin-api.js"));
  const { createPgDeviceRepository } = require(path.join(ROOT, "server/lib/devices.js"));
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  await client.query(
    "select set_config('request.role','service_role',false)," +
    "set_config('request.jwt.claim.sub','',false)," +
    "set_config('request.is_admin','true',false)," +
    "set_config('request.user_email','',false)");

  async function seed(uid, email, allowed, isAdmin) {
    await client.query(
      `insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at)
       values ($1,$2,'x',now()) on conflict do nothing`, [uid, email]);
    await client.query(
      `insert into public.profiles (id,name,email,account_status,allowed_devices,is_admin)
       values ($1,$2,$3,'active',$4,$5) on conflict (id) do update
       set account_status='active',allowed_devices=$4,is_admin=$5`,
      [uid, email, email, allowed, !!isAdmin]);
  }
  const seats = async uid => Number((await client.query(
    "select count(*)::int as n from public.device_slots where user_id=$1 and status='active'", [uid])).rows[0].n);

  await seed(A_ID, "shared-a@probe.test", 2);
  await seed(B_ID, "shared-b@probe.test", 2);
  await seed(C_ID, "shared-c@probe.test", 1, true);
  const reg = ent.deviceRegistry(client);
  const repo = createPgDeviceRepository(client);
  const BROWSER = "one-shared-browser";

  /* THE FAMILY LAPTOP. Three accounts, one browser, in the order a shop or a
     household actually produces: one after another on the same machine. */
  const a = await reg.registerWebDevice({ userId: A_ID, deviceType: "computer", installationId: BROWSER });
  const b = await reg.registerWebDevice({ userId: B_ID, deviceType: "computer", installationId: BROWSER });
  const c = await reg.registerWebDevice({ userId: C_ID, deviceType: "computer", installationId: BROWSER });
  report("B2) three accounts register the same browser, and every one of them is allowed",
    a.allowed === true && b.allowed === true && c.allowed === true, { a, b, c });
  report("B2b) each spends exactly one seat, and the seats belong to different accounts",
    (await seats(A_ID)) === 1 && (await seats(B_ID)) === 1 && (await seats(C_ID)) === 1 &&
    new Set([a.slotId, b.slotId, c.slotId]).size === 3,
    { a: await seats(A_ID), b: await seats(B_ID), c: await seats(C_ID) });

  /* every one of them still WORKS on that browser — a registration nobody can
     validate would be an allowance in name only */
  /* one pg client, one query at a time — Promise.all over the same connection
     overlaps them, which pg deprecates and which would make this read racy */
  const validated = [];
  for (const uid of [A_ID, B_ID, C_ID]) {
    validated.push(await reg.validate({ userId: uid, clientType: "web", installationId: BROWSER }));
  }
  report("B3) all three validate on that browser afterwards — none was quietly displaced",
    validated.every(v => v && v.allowed === true), validated.map(v => v && v.reason));

  /* THE LIMIT IS UNTOUCHED. C was given one device and has spent it; a second
     machine is refused exactly as before, which is the control that actually
     stops licence sharing. */
  const cSecond = await reg.registerWebDevice({
    userId: C_ID, deviceType: "computer", installationId: "c-second-machine" });
  report("B4) the admin-set device limit still refuses — one account, one seat, one machine",
    cSecond.allowed === false && cSecond.reason === "computer_slot_occupied" &&
    (await seats(C_ID)) === 1, { cSecond, seats: await seats(C_ID) });

  /* THE RECORD. Each account sees the other two, and an account that shares
     nothing sees nobody. */
  const hash = (await client.query(
    "select installation_hash from public.device_installations where user_id=$1 and revoked_at is null limit 1",
    [A_ID])).rows[0].installation_hash;
  const counts = [];
  for (const uid of [A_ID, B_ID, C_ID]) counts.push(await repo.countOtherAccountsOnHash(hash, uid));
  await seed("cccccccc-0000-4000-8000-00000000000d", "shared-alone@probe.test", 2);
  const alone = await reg.registerWebDevice({
    userId: "cccccccc-0000-4000-8000-00000000000d", deviceType: "phone", installationId: "a-private-phone" });
  const aloneHash = (await client.query(
    "select installation_hash from public.device_installations where user_id=$1 and revoked_at is null limit 1",
    ["cccccccc-0000-4000-8000-00000000000d"])).rows[0].installation_hash;
  const aloneCount = await repo.countOtherAccountsOnHash(aloneHash,
    "cccccccc-0000-4000-8000-00000000000d");
  report("B5) the co-use is counted — two others for each of the three, none for a browser nobody shares",
    counts.every(n => n === 2) && alone.allowed === true && aloneCount === 0,
    { counts, aloneCount });

  /* a revoked row is history, not co-use: releasing the seat must take the
     account out of the count rather than leave a number nobody can explain */
  await repo.resetSlot(A_ID, "computer", new Date().toISOString());
  const afterRelease = await repo.countOtherAccountsOnHash(hash, B_ID);
  report("B6) an account that released the machine drops out of the count",
    afterRelease === 1, { afterRelease });

  /* C) the number reaches the console through the real admin call */
  const detail = await admin.studentDetail(client, { clientType: "admin", roles: ["admin"], uid: C_ID }, B_ID);
  const rows = ((detail.student.devices.computer || {}).installations) || [];
  report("C3) the admin student view carries the live count on the device row",
    rows.length > 0 && Number(rows[0].shared_with) === 1,
    { installations: rows.map(row => ({ client: row.client_type, shared_with: row.shared_with })) });

  await client.end();
  cleanup();
  console.log(failures
    ? "\nFAIL (" + failures + ")"
    : "\nPASS — one browser, several accounts: the block is gone, the seats still bind, and the co-use is recorded");
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error("FAIL — the probe threw:", error && error.stack || error);
  process.exit(1);
});
