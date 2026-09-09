/* v6.47.0 — A REFUSED REGISTRATION MUST NOT EAT A PAID SEAT.
 *
 * WHY THIS FILE EXISTS. On 2026-09-09 the owner's own account showed four
 * allowed devices and one in use, and the admin console showed both slots
 * "Not registered · Empty". A live-database probe found the cause: the
 * registration path claimed a seat FIRST and asked whose machine it was
 * SECOND, so every refusal ("this device is registered to another account")
 * left an active, empty seat behind. Two refused attempts, one seat gone, and
 * only an administrator could see why — the student is simply told they have
 * fewer devices than they paid for.
 *
 * The fix is an ordering, which is exactly the kind of thing a later edit
 * reverts without noticing. So this file does not read the code and hope:
 *
 *   A) the ORDER is asserted in the source of both register paths, and the
 *      seat-release and seat-recycle helpers are asserted to be guarded
 *   B) every denial reason is EXECUTED against a repository that counts, so a
 *      refusal that claims a seat fails here rather than in production
 *   C) the whole thing runs against a live Postgres carrying the tracked
 *      schema: the real leak scenario, the release of a raced seat, and the
 *      recycling of an empty seat at the account's ceiling
 *   D) CI runs this test
 *
 * Usage: node test/verify_seat_leak.js   (a local Postgres enables C) */
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
/* the same trap verify_offline_grace and verify_admin_self_action hit: this
   file's own prose quotes the identifiers it asserts, and a comment is not
   code. Every source assertion below reads the DECOMMENTED text. */
const decomment = src => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const DEVICES = decomment(read("server/lib/devices.js"));
const WORKFLOW = read(".github/workflows/test.yml");

/* ---------------- A) the order, in the source ---------------- */
function orderIn(fnName) {
  const start = DEVICES.indexOf("async function " + fnName + "(");
  if (start < 0) return null;
  const body = DEVICES.slice(start, DEVICES.indexOf("\n  }\n", start));
  return {
    ownership: body.indexOf("findLiveInstallationByHash"),
    denial: body.indexOf('denial("device_registered_elsewhere")'),
    seat: body.indexOf("takeSeat("),
    release: body.indexOf("releaseUnusedSeat("),
    body,
  };
}
["registerWebDevice", "registerPanelDevice"].forEach(fn => {
  const o = orderIn(fn);
  report("A) " + fn + " asks whose machine it is BEFORE it takes a seat",
    !!o && o.ownership > 0 && o.seat > 0 && o.denial > 0 &&
    o.ownership < o.seat && o.denial < o.seat, o && {
      ownership: o.ownership, denial: o.denial, seat: o.seat });
  report("A2) " + fn + " hands back a seat it claimed and could not fill",
    !!o && o.release > o.seat, o && { seat: o.seat, release: o.release });
});
/* takeSeat is the only place a seat is opened, and the `claimed` bit it
   returns is the only thing releaseUnusedSeat trusts — a seat findFreeSlot sat
   us on belongs to the account already and may carry the other client's
   installation, so releasing it would sign the panel out of a computer the
   student never touched. */
report("A3) only a seat THIS call claimed is ever handed back",
  /async function releaseUnusedSeat\(seat\) \{\s*if \(!seat \|\| seat\.claimed !== true \|\| !seat\.slot\) return false;/.test(DEVICES) &&
  /if \(free\) return \{ slot: free, claimed: false \};/.test(DEVICES) &&
  /return \{ slot: claim\.slot, claimed: true \};/.test(DEVICES), null);
report("A4) neither register path calls claimSlot or findFreeSlot on its own any more — both go through takeSeat",
  (DEVICES.match(/repository\.claimSlot\(/g) || []).length === 1 &&
  (DEVICES.match(/repository\.findFreeSlot\(/g) || []).length === 1, {
    claimSlot: (DEVICES.match(/repository\.claimSlot\(/g) || []).length,
    findFreeSlot: (DEVICES.match(/repository\.findFreeSlot\(/g) || []).length });
/* the release is a guarded UPDATE, not a trusted one: between the failed
   insert and this statement another browser may have sat down on the seat
   through findFreeSlot, and that browser keeps it. */
report("A5) releaseEmptySlot only touches a seat that is still active and still empty, and resets rather than deletes",
  /update public\.device_slots set status='reset',reset_at=\$2,updated_at=\$2\s*\n\s*where id=\$1 and status='active'\s*\n\s*and not exists \(select 1 from public\.device_installations i\s*\n\s*where i\.slot_id=\$1 and i\.revoked_at is null\)/.test(DEVICES), null);
report("A6) at the ceiling claimSlot reuses an active seat with nothing live on it instead of refusing",
  /set slot_type=\$2,generation=generation\+1,label=\$3,updated_at=\$4,reset_at=null/.test(DEVICES) &&
  /where s\.user_id=\$1 and s\.status='active'\s*\n\s*and not exists \(select 1 from public\.device_installations i\s*\n\s*where i\.slot_id=s\.id and i\.revoked_at is null\)/.test(DEVICES) &&
  /if \(recycled\.rows\[0\]\) return \{ claimed: true, slot: mapSlot\(recycled\.rows\[0\]\) \};/.test(DEVICES), null);

/* ---------------- D) CI ---------------- */
report("D) CI runs this test", WORKFLOW.indexOf("verify_seat_leak.js") >= 0, null);

/* ---------------- B) every denial, executed ---------------- */
const { createDeviceRegistry } = require(path.join(ROOT, "server/lib/devices.js"));
/* a repository that answers like the real one and COUNTS. Seats are objects;
   nothing is faked about who owns what. */
function fakeRepo(options) {
  const o = options || {};
  const state = {
    slots: (o.slots || []).slice(),
    installations: (o.installations || []).slice(),
    limit: o.limit === undefined ? 4 : o.limit,
    claims: 0, releases: 0, nextId: 100,
  };
  const live = () => state.installations.filter(i => !i.revokedAt);
  const repo = {
    state,
    async getInstallation(userId, clientType, hash) {
      return live().find(i => {
        const slot = state.slots.find(s => s.id === i.slotId);
        return slot && slot.userId === userId && slot.status === "active" &&
          i.clientType === clientType && i.installationId === hash;
      }) || null;
    },
    async findFreeSlot(userId, slotType, clientType) {
      return state.slots.find(s => s.userId === userId && s.slotType === slotType &&
        s.status === "active" &&
        !live().some(i => i.slotId === s.id && i.clientType === clientType)) || null;
    },
    async claimSlot(row) {
      state.claims++;
      const active = state.slots.filter(s => s.userId === row.userId && s.status === "active");
      if (active.length >= state.limit) {
        const empty = active.find(s => !live().some(i => i.slotId === s.id));
        if (empty) { empty.slotType = row.slotType; return { claimed: true, slot: empty }; }
        return { claimed: false, slot: active[0] || null };
      }
      const slot = { id: "slot-" + (state.nextId++), userId: row.userId,
        slotType: row.slotType, status: "active" };
      state.slots.push(slot);
      return { claimed: true, slot };
    },
    async releaseEmptySlot(slotId) {
      const slot = state.slots.find(s => s.id === slotId);
      if (!slot || slot.status !== "active") return 0;
      if (live().some(i => i.slotId === slotId)) return 0;
      slot.status = "reset"; state.releases++; return 1;
    },
    async findLiveInstallationByHash(hash) {
      const row = live().find(i => i.installationId === hash);
      if (!row) return null;
      /* mapInstallation reads userId off the JOINED SLOT, never off the
         installation row — the fake must too, or B3 measures the fake */
      const slot = state.slots.find(x => x.id === row.slotId);
      return Object.assign({}, row, { userId: slot && slot.userId, slotType: slot && slot.slotType });
    },
    async revokeInstallation(id) {
      const row = state.installations.find(i => i.id === id);
      if (row) row.revokedAt = "now";
      return row ? 1 : 0;
    },
    async insertInstallation(row) {
      if (live().some(i => i.installationId === row.installationId)) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
      const inserted = Object.assign({ id: "inst-" + (state.nextId++), revokedAt: null }, row);
      state.installations.push(inserted);
      return inserted;
    },
  };
  return repo;
}
const registry = repo => createDeviceRegistry({
  repository: repo, pairingSecret: "x".repeat(32), clock: () => new Date("2026-09-09T00:00:00Z") });
const activeSeats = repo => repo.state.slots.filter(s => s.status === "active").length;

(async () => {
  const ME = "user-me", OTHER = "user-other";

  /* the exact case the owner hit: the machine is live on somebody else's seat */
  {
    const repo = fakeRepo({
      slots: [{ id: "s-other", userId: OTHER, slotType: "computer", status: "active" }],
      installations: [{ id: "i-other", slotId: "s-other", clientType: "web",
        installationId: "machine-1", revokedAt: null }],
    });
    const before = activeSeats(repo);
    const first = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "machine-1" });
    const after = activeSeats(repo);
    const second = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "machine-1" });
    report("B) a machine registered to another account is refused, and the refusal costs the student nothing",
      first.allowed === false && first.reason === "device_registered_elsewhere" &&
      second.reason === "device_registered_elsewhere" &&
      after === before && activeSeats(repo) === before && repo.state.claims === 0,
      { first, before, after, end: activeSeats(repo), claims: repo.state.claims });
  }

  /* the panel path had the same order, and the same fix */
  {
    const repo = fakeRepo({
      slots: [{ id: "s-other", userId: OTHER, slotType: "computer", status: "active" }],
      installations: [{ id: "i-other", slotId: "s-other", clientType: "panel",
        installationId: "machine-2", revokedAt: null }],
    });
    const before = activeSeats(repo);
    const verdict = await registry(repo).registerPanelDevice({ userId: ME, installationId: "machine-2" });
    report("B2) the Photoshop panel path refuses the same machine, and takes no seat either",
      verdict.allowed === false && verdict.reason === "device_registered_elsewhere" &&
      activeSeats(repo) === before && repo.state.claims === 0,
      { verdict, before, end: activeSeats(repo), claims: repo.state.claims });
  }

  /* the OTHER refusal on that path: the hash belongs to this account but to the
     other client. Also a denial, also free. */
  {
    const repo = fakeRepo({
      slots: [{ id: "s-mine", userId: ME, slotType: "computer", status: "active" }],
      installations: [{ id: "i-mine", slotId: "s-mine", clientType: "panel",
        installationId: "machine-3", revokedAt: null }],
    });
    const before = activeSeats(repo);
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "machine-3" });
    report("B3) a hash held by this account on the OTHER client is a named conflict, not a seat",
      verdict.allowed === false && verdict.reason === "installation_id_conflict" &&
      activeSeats(repo) === before, { verdict, before, end: activeSeats(repo) });
  }

  /* the race the ordering cannot close: two browsers, one hash, the insert
     loses. The seat this call opened goes straight back. */
  {
    const repo = fakeRepo({ slots: [], installations: [] });
    const original = repo.insertInstallation;
    repo.insertInstallation = async row => {
      /* another browser wins the hash between the lookup and the insert */
      repo.state.installations.push({ id: "i-race", slotId: "s-race", clientType: "web",
        installationId: row.installationId, revokedAt: null });
      repo.insertInstallation = original;
      return original.call(repo, row);
    };
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "phone", installationId: "machine-4" });
    report("B4) a lost race answers in words and returns the seat it had just opened",
      verdict.allowed === false && verdict.reason === "device_registered_elsewhere" &&
      repo.state.claims === 1 && repo.state.releases === 1 &&
      repo.state.slots.filter(s => s.userId === ME && s.status === "active").length === 0,
      { verdict, claims: repo.state.claims, releases: repo.state.releases,
        active: repo.state.slots.filter(s => s.userId === ME && s.status === "active").length });
  }

  /* and the seat a registration DID fill is not released by anything here */
  {
    const repo = fakeRepo({ slots: [], installations: [] });
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "phone", installationId: "machine-5" });
    report("B5) a registration that succeeds keeps its seat — exactly one, and nothing is released",
      verdict.allowed === true && activeSeats(repo) === 1 &&
      repo.state.claims === 1 && repo.state.releases === 0,
      { verdict, seats: activeSeats(repo), releases: repo.state.releases });
  }

  /* an existing seat of the right type is sat on rather than claimed — the seat
     model's own rule, and the reason releaseUnusedSeat must never touch it */
  {
    const repo = fakeRepo({
      slots: [{ id: "s-shared", userId: ME, slotType: "computer", status: "active" }],
      installations: [{ id: "i-panel", slotId: "s-shared", clientType: "panel",
        installationId: "machine-6", revokedAt: null }],
    });
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "machine-7" });
    report("B6) the Web App sits down on the computer seat the Panel already holds — one seat, not two",
      verdict.allowed === true && verdict.slotId === "s-shared" &&
      activeSeats(repo) === 1 && repo.state.claims === 0,
      { verdict, seats: activeSeats(repo), claims: repo.state.claims });
  }

  /* the ceiling: four seats, three of them empty leftovers, and a student who
     still cannot register is exactly the fault this release closes */
  {
    const repo = fakeRepo({
      limit: 4,
      slots: [
        { id: "s1", userId: ME, slotType: "phone", status: "active" },
        { id: "s2", userId: ME, slotType: "phone", status: "active" },
        { id: "s3", userId: ME, slotType: "phone", status: "active" },
        { id: "s4", userId: ME, slotType: "phone", status: "active" },
      ],
      installations: [{ id: "i1", slotId: "s1", clientType: "web",
        installationId: "machine-8", revokedAt: null }],
    });
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "machine-9" });
    report("B7) at the ceiling an empty seat is reused rather than the student refused, and the total does not grow",
      verdict.allowed === true && activeSeats(repo) === 4,
      { verdict, seats: activeSeats(repo) });
  }

  /* and a ceiling with every seat genuinely in use is still a refusal — the
     recycler must not become a way past the count the teacher set */
  {
    const repo = fakeRepo({
      limit: 2,
      slots: [
        { id: "s1", userId: ME, slotType: "phone", status: "active" },
        { id: "s2", userId: ME, slotType: "phone", status: "active" },
      ],
      installations: [
        { id: "i1", slotId: "s1", clientType: "web", installationId: "m-a", revokedAt: null },
        { id: "i2", slotId: "s2", clientType: "web", installationId: "m-b", revokedAt: null },
      ],
    });
    const verdict = await registry(repo).registerWebDevice({
      userId: ME, deviceType: "computer", installationId: "m-c" });
    report("B8) a full account is still full — every seat in use means the refusal stands",
      verdict.allowed === false && verdict.reason === "computer_slot_occupied" &&
      activeSeats(repo) === 2, { verdict, seats: activeSeats(repo) });
  }

  /* ---------------- C) the live database ---------------- */
  const DB = "hnk_seat_leak_probe";
  const RUNTIME = "hnk_seat_leak_role";
  const PASSWORD = "seat-leak-probe";
  const ME_ID = "dddddddd-0000-4000-8000-00000000000a";
  const OTHER_ID = "dddddddd-0000-4000-8000-00000000000b";
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
  const probe = sql("select 1");
  if (!probe.ok) {
    report("C) a live database proves a refusal leaves the seat count untouched", false,
      "no local Postgres: " + probe.out.slice(0, 160));
    console.log("\n" + (failures ? failures + " FAILURE(S)" : "All checks passed"));
    process.exit(failures ? 1 : 0);
  }
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (r.ok) r = sql(`create database "${DB}" owner "${RUNTIME}"`);
  if (!r.ok) { report("C) scratch role and database", false, r.out.slice(0, 200)); cleanup(); process.exit(1); }
  const url = `postgres://${RUNTIME}:${PASSWORD}@${ENV.PGHOST}:${ENV.PGPORT}/${DB}`;
  const migrated = spawnSync("node",
    ["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
    { cwd: path.join(ROOT, "server"),
      env: Object.assign({}, ENV, { PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1", DATABASE_URL: url }),
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000 });
  if (migrated.status !== 0) {
    report("C0) the scratch database carries the tracked schema", false,
      ((migrated.stdout || "") + (migrated.stderr || "")).split(/\r?\n/).slice(-4));
    cleanup(); process.exit(1);
  }
  report("C0) the scratch database carries the tracked schema", true);

  process.env.DEVICE_PAIRING_SECRET = "s".repeat(48);
  process.env.DEVICE_ID_HASH_SECRET = "h".repeat(48);
  const { Client } = require(path.join(ROOT, "server/node_modules/pg"));
  const ent = require(path.join(ROOT, "server/lib/entitlements.js"));
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  await client.query(
    "select set_config('request.role','service_role',false)," +
    "set_config('request.jwt.claim.sub','',false)," +
    "set_config('request.is_admin','true',false)," +
    "set_config('request.user_email','',false)");

  async function seed(uid, email, allowed) {
    await client.query(
      `insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at)
       values ($1,$2,'x',now()) on conflict do nothing`, [uid, email]);
    await client.query(
      `insert into public.profiles (id,name,email,account_status,allowed_devices)
       values ($1,$2,$3,'active',$4) on conflict (id) do update
       set account_status='active',allowed_devices=$4`, [uid, email, email, allowed]);
  }
  const seats = async uid => Number((await client.query(
    "select count(*)::int as n from public.device_slots where user_id=$1 and status='active'", [uid])).rows[0].n);
  const liveInstalls = async uid => Number((await client.query(
    `select count(*)::int as n from public.device_installations i
      join public.device_slots s on s.id=i.slot_id
     where s.user_id=$1 and i.revoked_at is null`, [uid])).rows[0].n);

  await seed(ME_ID, "seat-me@probe.test", 4);
  await seed(OTHER_ID, "seat-other@probe.test", 2);
  const reg = ent.deviceRegistry(client);

  /* the other student's phone is registered on the machine first */
  const theirs = await reg.registerWebDevice({
    userId: OTHER_ID, deviceType: "computer", installationId: "shared-machine" });
  report("C1) the other account registers the machine first",
    theirs.allowed === true && (await seats(OTHER_ID)) === 1, theirs);

  /* now the owner's account tries twice from that same machine — the exact
     probe that measured the leak on 2026-09-09 */
  const startSeats = await seats(ME_ID);
  const try1 = await reg.registerWebDevice({
    userId: ME_ID, deviceType: "computer", installationId: "shared-machine" });
  const afterOne = await seats(ME_ID);
  const try2 = await reg.registerWebDevice({
    userId: ME_ID, deviceType: "computer", installationId: "shared-machine" });
  const afterTwo = await seats(ME_ID);
  report("C2) two refusals from a machine registered elsewhere leave the student's seat count exactly where it was",
    try1.allowed === false && try1.reason === "device_registered_elsewhere" &&
    try2.reason === "device_registered_elsewhere" &&
    startSeats === 0 && afterOne === 0 && afterTwo === 0,
    { try1, try2, startSeats, afterOne, afterTwo });

  /* the entitlement the app and the console both read must agree */
  const state = await ent.loadEntitlementState(client, ME_ID, {});
  const slots = await ent.listDeviceSlots(client, ME_ID);
  report("C3) the account the student sees still has every seat free — no phantom row for the console to explain",
    state.allowedDevices === 4 && slots.length === 0,
    { allowed: state.allowedDevices, slots });

  /* their own machine still registers, and takes exactly one seat */
  const mine = await reg.registerWebDevice({
    userId: ME_ID, deviceType: "computer", installationId: "my-own-machine" });
  report("C4) the student's own machine registers and takes exactly one of the four",
    mine.allowed === true && (await seats(ME_ID)) === 1 && (await liveInstalls(ME_ID)) === 1, mine);

  /* the Photoshop panel joins the SAME computer seat */
  const panel = await reg.registerPanelDevice({ userId: ME_ID, installationId: "my-own-machine-panel" });
  report("C5) the Photoshop Panel joins the same computer seat rather than opening a second one",
    panel.allowed === true && panel.slotId === mine.slotId && (await seats(ME_ID)) === 1,
    { panel, webSlot: mine.slotId, seats: await seats(ME_ID) });

  /* a panel that registers the same installation twice is not a new
     registration and must not be charged for one */
  const panelAgain = await reg.registerPanelDevice({ userId: ME_ID, installationId: "my-own-machine-panel" });
  report("C6) the same panel installation registering again is answered from the seat it already holds",
    panelAgain.allowed === true && panelAgain.slotId === mine.slotId && (await seats(ME_ID)) === 1,
    { panelAgain, seats: await seats(ME_ID) });

  /* THE CEILING. Fill the account to four with seats nothing lives on, then
     ask for a device the student can actually use. */
  await client.query(
    `insert into public.device_slots (user_id,slot_type,status,generation,created_at,updated_at)
     values ($1,'phone','active',1,now(),now()),($1,'phone','active',1,now(),now()),
            ($1,'phone','active',1,now(),now())`, [ME_ID]);
  const full = await seats(ME_ID);
  const atCeiling = await reg.registerWebDevice({
    userId: ME_ID, deviceType: "phone", installationId: "my-phone" });
  report("C7) at a ceiling of empty seats the student registers anyway — an empty seat is reused, the total does not grow",
    full === 4 && atCeiling.allowed === true && (await seats(ME_ID)) === 4,
    { full, atCeiling, after: await seats(ME_ID) });

  /* and the count the teacher set is still the count */
  await client.query("update public.profiles set allowed_devices=2 where id=$1", [OTHER_ID]);
  const theirSecond = await reg.registerWebDevice({
    userId: OTHER_ID, deviceType: "phone", installationId: "their-phone" });
  const theirThird = await reg.registerWebDevice({
    userId: OTHER_ID, deviceType: "phone", installationId: "their-second-phone" });
  report("C8) the recycler is not a way past the limit — a genuinely full account is still refused",
    theirSecond.allowed === true && theirThird.allowed === false &&
    theirThird.reason === "phone_slot_occupied" && (await seats(OTHER_ID)) === 2,
    { theirSecond, theirThird, seats: await seats(OTHER_ID) });

  await client.end();
  cleanup();
  console.log(failures
    ? "\nFAIL (" + failures + ")"
    : "\nPASS — a refused registration costs no seat: order asserted, every denial executed, and proved on a live database");
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error("FAIL — the probe threw:", error && error.stack || error);
  process.exit(1);
});
