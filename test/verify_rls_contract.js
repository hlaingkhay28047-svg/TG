/* v5.32.0 RLS contract — every table the client touches is actually protected.

   WHY THIS FILE EXISTS. An external audit found that app_settings — the row
   that supplies payment_instructions_my, i.e. THE BANK ACCOUNT NUMBER every
   customer wires money to — was fetched by the client with { anon: true } and
   appeared exactly zero times in supabase/schema.sql. Under Supabase's default
   grants a table with no RLS is not merely readable, it is WRITABLE: one PATCH
   from a browser console would have redirected the studio's revenue to an
   account of the attacker's choosing, and nothing in 86 test scripts would have
   noticed.

   The hole was not exotic. It was a table nobody remembered to list. So this
   file does not check for that one table by name — that would only pin the bug
   already found. It DERIVES the list of tables from the client at run time and
   demands that the schema account for every one of them. The next table someone
   adds a fetch for is covered the day the fetch lands.

   WHAT IT CANNOT DO. It reads two files; it does not connect to Supabase. It
   therefore proves the schema is internally complete and consistent, not that
   the owner has run it. That second half is a human step the README calls out
   and no test in this repo can perform.

   Pinned contracts:
   A) Every /rest/v1/<table> the app fetches has `enable row level security`
      and the roleless runtime FORCEs it for the database-owner connection.
   B) Every such table has at least one policy, so RLS-on does not silently
      mean nobody-can-read.
   C) The tables the app WRITES have a policy for that verb.
   D) app_settings, which is read anonymously, grants select to `anon` — a
      policy scoped only `to authenticated` would lock out the buy screen.
   E) No table exposed to the client is left writable by anon — counting a
      policy with no `to` clause, or `to public`, as granting anon.
   F) Every SECURITY DEFINER function pins search_path, the standard
      privilege-escalation guard.
   G) The functions a policy or trigger references are defined before use, so
      the file survives being pasted as one script.

   Usage: node test/verify_rls_contract.js   (no server, no network) */
const fs = require("fs");
const path = require("path");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const sql = fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8");

/* ---- derive what the client actually talks to ---- */
const readTables = new Set();
const writeTables = new Set();
const anonTables = new Set();

/* accFetch("/rest/v1/<table>?...", { method: "X" }, { anon: true }) — the
   method and the options object are both optional and both matter, so the
   call is matched loosely and then inspected. */
const callRe = /accFetch\(\s*"(\/rest\/v1\/[^"?]+)[^"]*"\s*,?([\s\S]{0,220}?)\)\s*[;,)]/g;
let m;
while ((m = callRe.exec(app))) {
  const table = m[1].replace("/rest/v1/", "").replace(/\/.*$/, "");
  const tail = m[2] || "";
  readTables.add(table);
  if (/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(tail)) writeTables.add(table);
  if (/anon:\s*true/.test(tail)) anonTables.add(table);
}
/* string-concatenated paths (…"/rest/v1/devices?id=eq." + id) are caught by the
   same expression because the table name precedes the first quote break */

/* v5.45.0 — the payment flow's payment_requests and app_settings reads left
   with the dead purchase machinery, so the client's whole REST surface is
   devices + profiles. The floor exists only to prove the parser still finds
   the calls; every check below derives from whatever it finds. */
report("client tables discovered", readTables.size >= 2,
  { read: [...readTables].sort(), write: [...writeTables].sort(), anon: [...anonTables].sort() });

/* ---- A) RLS is on for every one of them ---- */
const rlsOn = new Set(
  [...sql.matchAll(/alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/gi)].map(x => x[1])
);
const unprotected = [...readTables].filter(t => !rlsOn.has(t));
report("A) every table the client fetches has RLS enabled",
  unprotected.length === 0, { unprotected, rlsOn: [...rlsOn].sort() });

const rlsForced = new Set(
  [...sql.matchAll(/alter\s+table\s+public\.(\w+)\s+force\s+row\s+level\s+security/gi)].map(x => x[1])
);
const unforced = [...readTables].filter(t => !rlsForced.has(t));
report("A2) the roleless database owner cannot bypass any client-table policy",
  unforced.length === 0, { unforced, rlsForced: [...rlsForced].sort() });

/* ---- the policy parser ----
   v5.39.0: THE `to` CLAUSE IS OPTIONAL IN POSTGRES, AND IT WAS MANDATORY HERE.
   The old expression required `... for <verb> to <roles> using`, so a policy
   written in the most ordinary form Postgres accepts —

       create policy p on public.app_settings for update using (true);

   — simply did not match, and a policy that does not match is a policy this
   file never checks. Omitting `to` means TO PUBLIC, which INCLUDES anon, so
   the shape that vanished from the parser is exactly the shape that would
   re-open the PATCH this file's header says would have redirected the
   studio's revenue. The literal role `public` was invisible for the same
   reason: checks D and E only ever asked whether the list contained "anon".

   So: `to` is now optional and defaults to ['public'], and rolesInclude()
   treats public as covering every role. selfTest() below parses deliberately
   bad policy text so these blind spots fail loudly here rather than being
   rediscovered by the next audit. */
/* v5.40.0 — two more optional pieces of the same statement. Postgres also
   accepts `AS PERMISSIVE` / `AS RESTRICTIVE` between the name and FOR, and
   role names may be double-quoted ("anon"). Either one made a policy vanish
   from this parser exactly the way a missing `to` clause did, and a policy the
   parser cannot see is a policy this file does not check. */
/* v5.40.0 (second pass) — THE `for` CLAUSE IS OPTIONAL TOO, and omitting it is
   the worst case of the three. Postgres's grammar is
     CREATE POLICY n ON t [AS ...] [FOR cmd] [TO role] [USING ...] [WITH CHECK ...]
   and a missing FOR defaults to ALL. So the shortest policy anyone can write —
     create policy p on public.app_settings using (true);
   — is FOR ALL TO PUBLIC: every verb, every role, anon included. That is
   precisely the write this file exists to catch, and it was the one statement
   the parser could not even see. Both optional clauses now default the way
   Postgres does. */
const POLICY_RE =
  /create\s+policy\s+"?(\w+)"?\s+on\s+public\.(\w+)(?:\s+as\s+(?:permissive|restrictive))?(?:\s+for\s+(\w+))?(?:\s+to\s+([\w\s,"]+?))?\s+(using|with)/gi;
function parsePolicies(text) {
  return [...text.matchAll(POLICY_RE)].map(x => {
    const end = text.indexOf(";", x.index);
    const statement = text.slice(x.index, end < 0 ? text.length : end + 1);
    const requestRoles = new Set();
    for (const r of statement.matchAll(/hnk_request_role\(\)\s*=\s*'([^']+)'/gi)) requestRoles.add(r[1].toLowerCase());
    for (const r of statement.matchAll(/hnk_request_role\(\)\s+in\s*\(([^)]+)\)/gi)) {
      for (const value of r[1].matchAll(/'([^']+)'/g)) requestRoles.add(value[1].toLowerCase());
    }
    return {
    name: x[1], table: x[2], statement,
    /* no `for` clause == FOR ALL, per Postgres */
    verb: (x[3] || "all").toLowerCase(),
    /* no `to` clause == TO PUBLIC, per Postgres */
    roles: (x[4] || "public").split(/[,\s]+/).filter(Boolean)
             .map(r => r.replace(/"/g, "").toLowerCase()).filter(Boolean),
    requestRoles: [...requestRoles],
  }; });
}
/* TO PUBLIC is narrowed when the policy carries an explicit, exact internal
   request-role predicate. With no predicate it still means every role. */
const rolesInclude = (p, role) => p.roles.includes(role) ||
  (p.roles.includes("public") && (!p.requestRoles.length || p.requestRoles.includes(role)));

/* ---- parser self-test: the blind spots, as fixtures ---- */
(function selfTest() {
  const cases = [
    { sql: "create policy a on public.t for update using (true);", roles: ["public"], why: "no `to` clause means TO PUBLIC" },
    { sql: "create policy b on public.t for select to public using (true);", roles: ["public"], why: "literal public" },
    { sql: "create policy c on public.t for select to anon, authenticated using (true);", roles: ["anon", "authenticated"], why: "role list" },
    { sql: "create policy d on public.t for insert to authenticated with check (true);", roles: ["authenticated"], why: "with check, not using" },
    { sql: "create policy e on public.t as permissive for update using (true);", roles: ["public"], why: "AS PERMISSIVE + no to clause" },
    { sql: "create policy f on public.t as restrictive for select to anon using (true);", roles: ["anon"], why: "AS RESTRICTIVE" },
    { sql: 'create policy g on public.t for delete to "anon" using (true);', roles: ["anon"], why: "quoted role name" },
    { sql: "create policy h on public.t using (true);", roles: ["public"], verb: "all", why: "no FOR and no TO — the shortest policy there is, and the widest" },
    { sql: "create policy i on public.t to anon using (true);", roles: ["anon"], verb: "all", why: "no FOR, explicit TO" },
    { sql: "create policy j on public.t as restrictive with check (true);", roles: ["public"], verb: "all", why: "no FOR, WITH CHECK" }
  ];
  const bad = [];
  for (const c of cases) {
    const got = parsePolicies(c.sql);
    if (got.length !== 1 || got[0].roles.join(",") !== c.roles.join(",") ||
        (c.verb && got[0].verb !== c.verb)) {
      bad.push({ why: c.why, got: got.map(g => ({ roles: g.roles, verb: g.verb })) });
    }
  }
  /* and the checks that consume it must SEE public as anon */
  if (!rolesInclude({ roles: ["public"], requestRoles: [] }, "anon")) bad.push({ why: "unguarded public must cover anon" });
  if (rolesInclude({ roles: ["authenticated"], requestRoles: [] }, "anon")) bad.push({ why: "authenticated must NOT cover anon" });
  if (rolesInclude({ roles: ["public"], requestRoles: ["authenticated"] }, "anon")) {
    bad.push({ why: "an explicit authenticated request guard must exclude anon" });
  }
  report("0) the policy parser sees the shapes Postgres accepts", bad.length === 0, bad);
})();

/* ---- B) and at least one policy, or RLS-on means nobody reads ---- */
const policies = parsePolicies(sql);

const noPolicy = [...readTables].filter(t => !policies.some(p => p.table === t));
report("B) every such table carries at least one policy",
  noPolicy.length === 0, { noPolicy, policyCount: policies.length });

/* ---- C) writes are actually permitted where the client writes ---- */
const VERB = { POST: "insert", PATCH: "update", PUT: "update", DELETE: "delete" };
const missingWrite = [];
for (const t of writeTables) {
  const verbs = new Set(policies.filter(p => p.table === t).map(p => p.verb));
  /* "for all" covers every verb */
  if (verbs.has("all")) continue;
  const wanted = [...app.matchAll(new RegExp('accFetch\\(\\s*"\\/rest\\/v1\\/' + t + '[^"]*"\\s*,([\\s\\S]{0,160}?)\\)', "g"))]
    .map(x => (x[1].match(/method:\s*"(\w+)"/) || [])[1])
    .filter(Boolean).map(v => VERB[v]).filter(Boolean);
  for (const w of new Set(wanted)) if (!verbs.has(w)) missingWrite.push({ table: t, verb: w });
}
report("C) the writes the client makes have a matching policy",
  missingWrite.length === 0, missingWrite);

/* ---- D) the anonymous read is granted to anon, not just authenticated ----
   This is the exact shape of the original defect seen from the other side: a
   policy that exists but is scoped `to authenticated` would still break the
   pre-login buy screen, and would do it silently. */
const anonBroken = [];
for (const t of anonTables) {
  const sel = policies.filter(p => p.table === t && (p.verb === "select" || p.verb === "all"));
  if (!sel.length || !sel.some(p => rolesInclude(p, "anon"))) anonBroken.push({ table: t, policies: sel.map(p => p.name + " to " + p.roles.join("+")) });
}
report("D) tables read before login grant select to the anon role",
  anonBroken.length === 0, anonBroken);

/* ---- E) ...and nothing lets anon WRITE ---- */
const anonWrite = policies.filter(p => rolesInclude(p, "anon") && p.verb !== "select");
report("E) no policy grants anon anything but select",
  anonWrite.length === 0, anonWrite.map(p => p.name + " for " + p.verb));

/* ---- F) definer functions pin search_path ---- */
const defs = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)[\s\S]{0,400}?\$\$/gi)];
const unpinned = defs
  .filter(d => /security\s+definer/i.test(d[0]) && !/set\s+search_path\s*=/i.test(d[0]))
  .map(d => d[1]);
report("F) every SECURITY DEFINER function pins search_path",
  unpinned.length === 0, { unpinned, definerCount: defs.filter(d => /security definer/i.test(d[0])).length });

/* ---- G) nothing is referenced before it is defined ---- */
const defAt = {};
for (const d of defs) defAt[d[1]] = d.index;
const tooEarly = [];
for (const fn of Object.keys(defAt)) {
  const useRe = new RegExp("public\\." + fn + "\\s*\\(", "g");
  let u;
  while ((u = useRe.exec(sql))) {
    /* the definition itself is a use; ignore anything at or after it */
    if (u.index < defAt[fn] && !/create\s+or\s+replace\s+function\s*$/i.test(sql.slice(Math.max(0, u.index - 60), u.index))) {
      tooEarly.push({ fn, usedAt: u.index, definedAt: defAt[fn] });
      break;
    }
  }
}
report("G) no policy or trigger references a function before it is defined",
  tooEarly.length === 0, tooEarly);

/* ---- H) the file can build the database it protects ----

   For eleven releases every statement in schema.sql ALTERed, and nothing
   CREATEd: the four tables were made by hand in the dashboard when the project
   was first stood up and that work was never written down. Applying the file to
   a project without them — a new region, a restored backup, a second
   environment, or simply the wrong one of two projects in the SQL editor —
   died on its first statement with

       ERROR: 42P01: relation "public.profiles" does not exist

   and every policy below it, which is the entire point of the file, never ran.
   The database was left with no tables AND no protection.

   Checks A-G all passed throughout, because each one reads what the file says
   about tables it assumed into existence. This is the check that reads whether
   the file can produce them. */
const created = {};
for (const m of sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)) {
  if (!(m[1] in created)) created[m[1]] = m.index;
}
const uncreated = [...readTables].filter(t => !(t in created));
report("H) every table the client fetches is created by this file, not just altered",
  uncreated.length === 0, { uncreated, created: Object.keys(created) });

/* ---- I) ...and creates it before it touches it ----

   `create table if not exists` placed after the first `alter table` is the same
   failure with a longer fuse: the ALTER still runs first and still 42P01s. The
   create has to lead. */
const late = [];
for (const t of Object.keys(created)) {
  const firstTouch = sql.search(new RegExp("alter\\s+table\\s+public\\." + t + "\\b", "i"));
  if (firstTouch >= 0 && firstTouch < created[t]) late.push({ table: t, alterAt: firstTouch, createAt: created[t] });
}
report("I) each table is created before the first statement that alters it",
  late.length === 0, late);

console.log("      (this file reads the repo only — it proves the schema is complete and " +
  "self-consistent, NOT that the owner has run it in the Supabase dashboard, which no " +
  "test here can do)");

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
