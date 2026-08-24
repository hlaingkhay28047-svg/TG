"use strict";
/* A PostgREST-compatible shim, deliberately narrow.
 *
 * The app makes a small, fixed set of query shapes against four tables. This implements those
 * shapes and refuses everything else, because the alternative — a general
 * translator from URL to SQL — is a much larger thing to get right and the app
 * has never needed it.
 *
 * TWO RULES HOLD THE SECURITY.
 *
 * 1. Every value is a bound parameter. No request text is concatenated into
 *    SQL, ever.
 * 2. Every identifier — table, selected column, filtered column, ordered
 *    column — is checked against the columns the database actually has, read
 *    from information_schema at first use. Identifiers cannot be parameterised
 *    in SQL, so the only safe move is to refuse anything not on that list. It
 *    is read from the live database rather than typed here so it cannot drift
 *    from the schema the way a hand-kept list would.
 *
 * Authorisation is NOT here. Every statement runs through db.asUser/asAnon
 * inside a transaction that has set the role and auth.uid(), so the same
 * row-level security that protects the Supabase project protects this one. A
 * bug in this file can return the wrong shape; it cannot hand a customer
 * another customer's row.
 */
const { asUser, asAnon } = require("./db");

const TABLES = new Set(["profiles", "payment_requests", "app_settings", "devices"]);

let columnCache = null;
async function columns(client) {
  if (columnCache) return columnCache;
  const { rows } = await client.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public'");
  const map = {};
  for (const r of rows) (map[r.table_name] = map[r.table_name] || new Set()).add(r.column_name);
  columnCache = map;
  return map;
}

class RestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* PostgREST spells filters `column=eq.value` and `column=in.(a,b)`. The app's
   only set-valued query is the admin profile lookup by primary-key UUID, so IN
   is deliberately restricted to `id`, 100 non-empty values, and bound SQL
   parameters. Every other operator is refused rather than ignored — silently
   dropping a filter would widen a query, which for `user_id=eq.<me>` means
   returning everybody's rows. */
function parseQuery(params, cols) {
  const out = { select: "*", filters: [], order: null, limit: null };
  for (const [key, raw] of params) {
    if (key === "select") {
      if (raw === "*") { out.select = "*"; continue; }
      const names = raw.split(",").map(s => s.trim()).filter(Boolean);
      for (const n of names) if (!cols.has(n)) throw new RestError(400, "unknown column in select: " + n);
      out.select = names.map(n => `"${n}"`).join(", ");
    } else if (key === "order") {
      const [col, dir] = raw.split(".");
      if (!cols.has(col)) throw new RestError(400, "unknown column in order: " + col);
      out.order = `"${col}" ${dir === "desc" ? "desc" : "asc"}`;
    } else if (key === "limit") {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new RestError(400, "bad limit");
      out.limit = n;
    } else if (key === "offset" || key === "apikey") {
      /* ignored: offset is unused by the app, apikey is a Supabase habit */
    } else {
      if (!cols.has(key)) throw new RestError(400, "unknown column in filter: " + key);
      const dot = raw.indexOf(".");
      const op = dot < 0 ? "" : raw.slice(0, dot);
      if (op === "eq") {
        out.filters.push({ col: key, op: "eq", value: raw.slice(dot + 1) });
      } else if (op === "in" && key === "id") {
        const payload = raw.slice(dot + 1);
        if (payload[0] !== "(" || payload[payload.length - 1] !== ")") {
          throw new RestError(400, "bad in filter");
        }
        const list = payload.slice(1, -1).split(",");
        if (!list.length || list.length > 100 || list.some(v => !v || v.length > 200)) {
          throw new RestError(400, "bad in filter");
        }
        out.filters.push({ col: key, op: "in", values: list });
      } else {
        throw new RestError(400, "unsupported operator: " + (op || raw));
      }
    }
  }
  return out;
}

function whereClause(filters, values) {
  if (!filters.length) return "";
  const parts = filters.map(f => {
    if (f.op === "in") {
      const bound = f.values.map(v => { values.push(v); return "$" + values.length; });
      return `"${f.col}" in (${bound.join(", ")})`;
    }
    values.push(f.value);
    return `"${f.col}" = $${values.length}`;
  });
  return " where " + parts.join(" and ");
}

/* The app asks for a single object with Accept: application/vnd.pgrst.object+json
   and accLoadProfile depends on the 406 that comes back when the result is not
   exactly one row — v5.38.0 reads it as "there is no profile row yet" and
   creates one. Returning 200 with an empty array instead would hang the access
   wall on "Checking your account…" forever, which is the exact bug that release
   fixed. */
function single(rows, wantsObject) {
  if (!wantsObject) return { status: 200, body: rows };
  if (rows.length !== 1) return { status: 406, body: { message: "JSON object requested, multiple (or no) rows returned" } };
  return { status: 200, body: rows[0] };
}

async function handle({ method, table, params, headers, body, uid }) {
  if (!TABLES.has(table)) throw new RestError(404, "unknown table: " + table);

  const prefer = String(headers["prefer"] || "");
  const wantsObject = String(headers["accept"] || "").includes("vnd.pgrst.object+json");
  const returnMinimal = prefer.includes("return=minimal");
  const runner = uid ? fn => asUser(uid, fn) : fn => asAnon(fn);

  return runner(async client => {
    const all = await columns(client);
    const cols = all[table];
    if (!cols) throw new RestError(404, "unknown table: " + table);
    const q = parseQuery(params, cols);
    const values = [];

    if (method === "GET") {
      let sql = `select ${q.select} from public."${table}"` + whereClause(q.filters, values);
      if (q.order) sql += " order by " + q.order;
      if (q.limit !== null) sql += " limit " + q.limit;
      const { rows } = await client.query(sql, values);
      return single(rows, wantsObject);
    }

    if (method === "POST") {
      const rowsIn = Array.isArray(body) ? body : [body];
      if (!rowsIn.length || typeof rowsIn[0] !== "object" || rowsIn[0] === null) throw new RestError(400, "expected an object");
      const names = Object.keys(rowsIn[0]);
      for (const n of names) if (!cols.has(n)) throw new RestError(400, "unknown column: " + n);
      const out = [];
      for (const row of rowsIn) {
        const vals = [], place = names.map(n => { vals.push(row[n]); return "$" + vals.length; });
        const sql = `insert into public."${table}" (${names.map(n => `"${n}"`).join(", ")}) ` +
                    `values (${place.join(", ")}) returning *`;
        const { rows } = await client.query(sql, vals);
        /* A BEFORE INSERT trigger may legitimately return NULL and cancel the
           row — hnk_guard_device_cap does exactly that when a browser
           re-registers a device it already has. That is a success with nothing
           to return, not an error. */
        if (rows[0]) out.push(rows[0]);
      }
      if (returnMinimal) return { status: 204, body: null };
      if (wantsObject && out.length === 1) return { status: 201, body: out[0] };
      return { status: 201, body: out };
    }

    if (method === "PATCH") {
      if (!q.filters.length) throw new RestError(400, "refusing an unfiltered update");
      if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RestError(400, "expected an object");
      const names = Object.keys(body);
      if (!names.length) throw new RestError(400, "nothing to update");
      for (const n of names) if (!cols.has(n)) throw new RestError(400, "unknown column: " + n);
      const sets = names.map(n => { values.push(body[n]); return `"${n}" = $${values.length}`; });
      const sql = `update public."${table}" set ${sets.join(", ")}` + whereClause(q.filters, values) + " returning *";
      const { rows } = await client.query(sql, values);
      if (returnMinimal) return { status: 204, body: null };
      return { status: 200, body: rows };
    }

    if (method === "DELETE") {
      if (!q.filters.length) throw new RestError(400, "refusing an unfiltered delete");
      const sql = `delete from public."${table}"` + whereClause(q.filters, values) + " returning *";
      const { rows } = await client.query(sql, values);
      if (returnMinimal) return { status: 204, body: null };
      return { status: 200, body: rows };
    }

    throw new RestError(405, "method not allowed: " + method);
  });
}

module.exports = { handle, RestError };
