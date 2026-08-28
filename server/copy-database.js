"use strict";
/* One-shot data copy from the App Platform dev database into the managed
 * cluster, run as an App Platform POST_DEPLOY job while both databases are
 * attached to the app:
 *
 *   DATABASE_URL / DATABASE_CA_CERT               -> the TARGET (managed cluster)
 *   SOURCE_DATABASE_URL / SOURCE_DATABASE_CA_CERT -> the dev database
 *
 * The target is prepared by the same tracked migration the service itself
 * boots with, so the copy lands in exactly the schema production runs. Every
 * read and write runs under the service-role request context: the schema
 * FORCEs row-level security on every table, so a bare connection — even the
 * database owner's — would silently see and copy nothing.
 *
 * The copy REFUSES to run into a populated target: a POST_DEPLOY job re-runs
 * on every later deployment, and the second run must be a no-op rather than a
 * duplicate-key crash or, far worse, a merge of two histories. That refusal
 * line doubles as the post-switch proof that the data arrived.
 *
 * Nothing here prints a row value, an address, or a connection string. The
 * job's stdout is reachable through the public diagnostics lanes, so the
 * report is table names, row counts and durations only.
 */
const { Client } = require("pg");
const migration = require("./lib/migrate");
const db = require("./lib/db");

const PLATFORM_TABLES = Object.freeze([
  "hnk_auth_users", "hnk_auth_refresh_tokens", "hnk_storage_buckets", "hnk_storage_objects",
]);

function sourceSsl() {
  /* Local development and the test harness run against a plain-TCP scratch
     server, exactly as lib/db.js allows for the target. */
  if (process.env.PGSSLMODE === "disable") return false;
  const ca = String(process.env.SOURCE_DATABASE_CA_CERT || "").trim();
  if (ca && /BEGIN CERTIFICATE/.test(ca)) return { ca, rejectUnauthorized: true };
  /* The dev database is being read once, on its way out. Encrypted-but-
     unverified is accepted for the source only, and said out loud. */
  console.log("copy-database: source CA not provided; connecting encrypted but unverified");
  return { rejectUnauthorized: false };
}

function sourceConfig() {
  const raw = String(process.env.SOURCE_DATABASE_URL || "").trim();
  if (!raw) throw new Error("SOURCE_DATABASE_URL is not set");
  if (/^\$\{[^}]+\}$/.test(raw)) throw new Error("SOURCE_DATABASE_URL is an unresolved App Platform binding");
  /* sslmode in the URL overrules the ssl config per client (see lib/db.js);
     strip it so the ssl options above are the single source of truth. */
  const stripped = db.stripSslMode(raw);
  return { connectionString: stripped.url, ssl: sourceSsl() };
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function tableNames(client) {
  const wanted = [...PLATFORM_TABLES, ...migration.REQUIRED_APPLICATION_TABLES];
  const { rows } = await client.query(
    "select tablename from pg_tables where schemaname='public' and tablename = any($1::text[])", [wanted]);
  const present = new Set(rows.map(r => r.tablename));
  const missing = wanted.filter(t => !present.has(t));
  if (missing.length) throw new Error("target schema is missing tables: " + missing.join(", "));
  return wanted;
}

/* Copy order is derived from the target's own foreign keys, not hardcoded:
   the next table someone adds is ordered correctly the day it lands. */
async function topoOrder(client, tables) {
  const { rows } = await client.query(`
    select c.relname as child, p.relname as parent
      from pg_constraint fk
      join pg_class c on c.oid = fk.conrelid
      join pg_class p on p.oid = fk.confrelid
      join pg_namespace n on n.oid = c.relnamespace
     where fk.contype = 'f' and n.nspname = 'public'`);
  const deps = new Map(tables.map(t => [t, new Set()]));
  for (const { child, parent } of rows) {
    if (deps.has(child) && deps.has(parent) && child !== parent) deps.get(child).add(parent);
  }
  const ordered = [];
  const placed = new Set();
  while (ordered.length < tables.length) {
    const ready = tables.filter(t => !placed.has(t) && [...deps.get(t)].every(d => placed.has(d)));
    if (!ready.length) throw new Error("foreign-key cycle among: " + tables.filter(t => !placed.has(t)).join(", "));
    for (const t of ready) { ordered.push(t); placed.add(t); }
  }
  return ordered;
}

async function copyTable(source, target, table) {
  const { rows, fields } = await source.query(`select * from public.${quoteIdent(table)}`);
  if (!rows.length) return 0;
  const columns = fields.map(f => f.name);
  const columnList = columns.map(quoteIdent).join(",");
  const holes = columns.map((_, i) => "$" + (i + 1)).join(",");
  for (const row of rows) {
    await target.query(
      `insert into public.${quoteIdent(table)} (${columnList}) values (${holes})`,
      columns.map(c => row[c]));
  }
  return rows.length;
}

/* Serial/identity columns must not hand out ids the copy already used. */
async function resetSequences(client, tables) {
  const { rows } = await client.query(`
    select t.relname as table, a.attname as column,
           pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(t.relname), a.attname) as seq
      from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and t.relname = any($1::text[])
       and pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(t.relname), a.attname) is not null`,
    [tables]);
  for (const r of rows) {
    await client.query(
      `select setval($1::regclass,
                     greatest(coalesce((select max(${quoteIdent(r.column)}) from public.${quoteIdent(r.table)}), 0), 1),
                     exists(select 1 from public.${quoteIdent(r.table)}))`, [r.seq]);
  }
  return rows.length;
}

(async () => {
  const startedAt = Date.now();
  console.log("copy-database: applying the tracked schema to the target");
  await migration.migrate();

  const source = new Client(sourceConfig());
  await source.connect();
  try {
    /* Session-level service context: the source schema FORCEs RLS too, and a
       contextless owner connection would read zero rows from every table and
       "successfully" copy an empty database. */
    await source.query(
      "select set_config('request.role','service_role',false), " +
      "set_config('request.jwt.claim.sub','',false), " +
      "set_config('request.is_admin','false',false), " +
      "set_config('request.user_email','',false)");

    const outcome = await db.asService(async target => {
      const guard = await target.query("select count(*)::int as n from public.hnk_auth_users");
      if (guard.rows[0].n > 0) {
        return { skipped: true, accounts: guard.rows[0].n };
      }
      const tables = await tableNames(target);
      const ordered = await topoOrder(target, tables);
      console.log("copy-database: copy order " + ordered.join(" -> "));
      /* The migration pre-seeds defaults into a fresh database — the
         app_settings singleton, the two roles, the storage buckets. The copy
         must MIRROR the source, not merge with those seeds, so every table is
         cleared first (children before parents). Safe precisely because the
         guard above has just proven the target holds no accounts. */
      for (const table of [...ordered].reverse()) {
        await target.query(`delete from public.${quoteIdent(table)}`);
      }
      /* The schema's own triggers derive rows (an admin profile grants a
         role row) and rewrite columns. During a mirror copy they would run a
         second time against rows that already carry their results, and the
         derived insert then collides with the copied original. USER triggers
         are disabled for the transaction — the table owner may do that
         without superuser — while FK (system) triggers stay on, which is why
         the copy runs in dependency order. */
      for (const table of ordered) {
        await target.query(`alter table public.${quoteIdent(table)} disable trigger user`);
      }
      const report = [];
      const mismatches = [];
      for (const table of ordered) {
        const copied = await copyTable(source, target, table);
        const back = await target.query(`select count(*)::int as n from public.${quoteIdent(table)}`);
        const there = await source.query(`select count(*)::int as n from public.${quoteIdent(table)}`);
        if (back.rows[0].n !== there.rows[0].n) {
          mismatches.push(table + " source=" + there.rows[0].n + " target=" + back.rows[0].n);
        }
        report.push(table + "=" + copied);
      }
      if (mismatches.length) throw new Error("count mismatch during copy: " + mismatches.join("; "));
      for (const table of ordered) {
        await target.query(`alter table public.${quoteIdent(table)} enable trigger user`);
      }
      const sequences = await resetSequences(target, tables);
      return { skipped: false, report, sequences };
    });

    if (outcome.skipped) {
      console.log("copy-database: target already holds " + outcome.accounts +
        " account(s); refusing to copy over a populated database. Nothing was changed.");
      return;
    }
    console.log("copy-database: rows " + outcome.report.join(" "));
    console.log("copy-database: sequences reset " + outcome.sequences);
    console.log("copy-database: MIGRATION COMPLETE in " + (Date.now() - startedAt) +
      "ms — every table matches its source count");
  } finally {
    await source.end().catch(() => {});
    await db.pool.end().catch(() => {});
  }
})().catch(error => {
  /* Names and counts only — a pg error can quote a value, so keep the first
     line and drop any detail lines. */
  console.error("copy-database: FAILED — " + String((error && error.message) || error).split("\n")[0]);
  process.exit(1);
});
