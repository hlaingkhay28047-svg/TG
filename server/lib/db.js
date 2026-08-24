"use strict";
/* The one place a query reaches the database.
 *
 * WHY THIS MODULE HAS NO RAW QUERY FUNCTION. supabase/schema.sql decides who
 * may approve a payment, promote an admin or read another customer's rows, and
 * it decides it with row-level security keyed on auth.uid(). Those policies
 * only apply to the role the statement runs as. The service connects as the
 * database owner, and an owner BYPASSES row-level security — so a query issued
 * without first switching role would sail straight past every guard, silently
 * and with no error to notice.
 *
 * The defence is structural rather than remembered: nothing is exported that
 * can run a statement outside a transaction that has already set a role. Adding
 * a convenience "just run this" helper here would undo the entire model.
 *
 * Owner bypass is not "fixed" with FORCE ROW LEVEL SECURITY on purpose. The
 * README's bootstrap — `update public.profiles set is_admin = true where
 * email = ...`, run by hand as the owner — is how the first admin can ever
 * exist, and section 6 of schema.sql deliberately steps aside for a caller with
 * no auth.uid() for exactly that reason. Forcing RLS would make the documented
 * first step impossible.
 */
const crypto = require("crypto");
const { Pool } = require("pg");

const ROLES = new Set(["anon", "authenticated"]);

/* Which connection string to use, and — if none is usable — why not, in words.
 *
 * App Platform substitutes ${component.VARIABLE} only when a component by that
 * exact name exists in the app's OWN spec. When it does not, the text is passed
 * through unchanged, so the service receives the literal
 * "${hnk-db.DATABASE_URL}" and pg does not reject it: it parses it into
 * nonsense and reports `getaddrinfo ENOTFOUND base`, which names neither the
 * database nor the binding and sends the reader looking for a DNS fault that
 * does not exist. The same trap through DATABASE_CA_CERT already cost one
 * rolled-back deploy.
 *
 * THE FALLBACK IS NOT A GUESS. Both .do specs bind the URL twice — once under
 * `hnk-db` and once under `db`, the name the console gives a database added
 * from the console — precisely because only one of them can resolve. The other
 * stays as text, which is not a postgres:// URL, so exactly one candidate is
 * left and taking it is not a choice.
 *
 * ONLY DATABASE_URL* KEYS ARE CONSIDERED, and that restriction is the point.
 * Scanning the whole environment for anything that looks like a PostgreSQL URL
 * would sweep up a leftover credential from somewhere else entirely — the old
 * Supabase database, say, which is still live during a migration — and quietly
 * apply this schema to it. The keys this spec controls are the only ones that
 * mean "the database this app was given".
 *
 * Two resolved candidates would be a choice, and a service silently deciding
 * which database holds the payment records is worse than one that refuses to
 * start, so two is reported instead of picked between.
 */
function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL || "";
  const unresolved = direct.match(/\$\{[^}]*\}/);
  if (direct && !unresolved) return { url: direct, key: "DATABASE_URL", why: null };

  const found = Object.keys(process.env).filter(k =>
    k !== "DATABASE_URL" && /^DATABASE_URL./.test(k) &&
    /^postgres(?:ql)?:\/\/\S+$/.test(process.env[k] || ""));
  if (found.length === 1) return { url: process.env[found[0]], key: found[0], why: null };

  const why = unresolved
    ? "DATABASE_URL is an unresolved App Platform binding " + unresolved[0] +
      " — no component with that name exists in this app's spec, so the text was " +
      "passed through instead of substituted"
    : "DATABASE_URL is not set on this service";
  return {
    url: "", key: null,
    why: found.length > 1
      ? why + "; " + found.length + " other PostgreSQL URLs are set (" +
        found.join(", ") + ") and choosing between them would be a guess"
      : why,
  };
}

/* A certificate that merely LOOKS like a certificate.
 *
 * Testing for "BEGIN CERTIFICATE" is not the same as testing for a usable CA,
 * and the difference took production down. A PEM carried through a layer that
 * escaped its newlines still contains that phrase and parses as nothing: pg is
 * handed a trust anchor that can anchor nothing, every handshake is refused as
 * `self-signed certificate in certificate chain`, and the reason names the
 * server's chain rather than our own broken input. Reproduced exactly, both
 * halves — the escaped PEM matches the phrase and throws
 * ERR_OSSL_PEM_NO_START_LINE, and against a real two-level chain it produces
 * that precise error.
 *
 * So the text is repaired where it can be, and then actually parsed. Anything
 * that still will not parse is not a CA and is not treated as one. */
function usableCa(raw) {
  let text = String(raw || "");
  if (!text) return null;
  if (!text.includes("\n") && text.includes("\\n")) text = text.replace(/\\n/g, "\n");
  if (!/BEGIN CERTIFICATE/.test(text)) {
    /* Some providers hand the whole PEM over base64-encoded. */
    let decoded = "";
    try { decoded = Buffer.from(text.trim(), "base64").toString("utf8"); } catch (_) { decoded = ""; }
    if (/BEGIN CERTIFICATE/.test(decoded)) text = decoded;
  }
  if (!/BEGIN CERTIFICATE/.test(text)) return null;
  try { new crypto.X509Certificate(text); } catch (_) { return null; }
  return text;
}

/* Recorded when a certificate was supplied and could not be used. Reported by
   /health, because silently connecting unverified is exactly the kind of
   downgrade that is invisible until it matters. */
let tlsNote = null;
const getTlsNote = () => tlsNote;

/* How TLS to the database is configured — and how much of it is verified.
 *
 * DigitalOcean Managed PostgreSQL terminates TLS with its own CA. Given a real
 * certificate the database is AUTHENTICATED, not merely encrypted to; without
 * one the traffic is still encrypted but an in-path substitution is not
 * refused, and this connection carries the payment records.
 *
 * An unusable certificate falls back to encrypted-but-unverified rather than
 * refusing to connect. Refusing is what production was doing: not one request
 * served, on the strength of a string that could not verify anything anyway.
 * Unverified and running, saying so loudly, beats verified-in-principle and
 * down.
 *
 * Bound twice for the same reason DATABASE_URL is, and read under the same
 * key-prefix restriction: a certificate elsewhere in the environment — an
 * outbound proxy's CA, NODE_EXTRA_CA_CERTS — is not this database's trust
 * anchor, and verifying against the wrong CA refuses every connection. */
function resolveSsl() {
  if (process.env.PGSSLMODE === "disable") return false;
  let sawSomethingCertificateShaped = false;
  for (const key of Object.keys(process.env)) {
    if (!/^DATABASE_CA_CERT/.test(key)) continue;
    const raw = process.env[key] || "";
    if (!raw) continue;
    const ca = usableCa(raw);
    if (ca) return { ca, rejectUnauthorized: true };
    /* An unresolved ${...} binding is not certificate-shaped and is not worth
       reporting — it is the ordinary case for a database that exposes no CA. */
    if (/BEGIN CERTIFICATE/.test(raw)) sawSomethingCertificateShaped = true;
  }
  if (sawSomethingCertificateShaped) {
    tlsNote = "a database CA certificate was supplied but could not be parsed; " +
              "connecting encrypted but UNVERIFIED";
    console.error("db: WARNING —", tlsNote);
  }
  return { rejectUnauthorized: false };
}


const RESOLVED = resolveDatabaseUrl();
if (RESOLVED.key && RESOLVED.key !== "DATABASE_URL") {
  console.warn("db: DATABASE_URL is unusable — connecting with " + RESOLVED.key + " instead.");
}

const pool = new Pool({
  /* undefined, not "", so a local development run still falls back to the
     PG* environment variables the way psql does. */
  connectionString: RESOLVED.url || undefined,
  ssl: resolveSsl(),
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", err => { console.error("pg pool error:", err.message); });

/* Failures that mean THE CERTIFICATE REFUSED, as distinct from the database
   being unreachable. The two need opposite responses: one is worth retrying
   unchanged, the other will fail identically forever. */
const CERT_ERROR_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const isCertificateError = err =>
  !!err && (CERT_ERROR_CODES.has(err.code) || /certificate/i.test(String(err.message || "")));

/* Give up on VERIFYING, not on connecting.
 *
 * Parsing catches a certificate that is malformed. It cannot catch one that is
 * perfectly well-formed and simply not this database's CA — that failure looks
 * identical from the outside and refuses every connection forever. So
 * verification is attempted first and abandoned only after it has actually
 * failed, which is the only moment the difference is observable.
 *
 * The traffic stays encrypted either way. The alternative on offer was never a
 * safer connection, it was no product: production served zero requests for
 * hours on the strength of a certificate that could not verify anything. pg
 * reads pool.options.ssl per connection, so the next attempt picks this up. */
function downgradeTlsAfter(err) {
  if (!isCertificateError(err)) return false;
  if (!pool.options.ssl || pool.options.ssl.rejectUnauthorized === false) return false;
  pool.options.ssl = { rejectUnauthorized: false };
  tlsNote = "the database certificate did not verify (" + (err.code || "certificate error") +
            "); reconnected encrypted but UNVERIFIED";
  console.error("db: WARNING —", tlsNote);
  return true;
}

/* What /health reports, in every case rather than only the bad ones. Reported
   always because "verified" is the claim worth being able to check, and a
   field that appears only when something is wrong cannot distinguish a healthy
   deployment from an old build that never had the field. */
function tlsState() {
  if (pool.options.ssl === false) return "off (PGSSLMODE=disable)";
  if (pool.options.ssl && pool.options.ssl.rejectUnauthorized) return "verified";
  return tlsNote ? "unverified — " + tlsNote : "unverified (no CA certificate supplied)";
}

/* Why the database cannot be reached for a reason /health can state plainly,
   or null when the configuration is fine. */
const describeDatabaseUrl = () => RESOLVED.why;

/* Run fn inside one transaction, as `role`, with auth.uid() answering `uid`.
 *
 * SET LOCAL is what scopes both to the transaction, so a pooled connection
 * cannot leak one request's identity into the next. It is also why this must be
 * a transaction at all: outside one, SET LOCAL is a no-op that leaves the
 * caller as the owner with a null uid — which would not error, it would quietly
 * disable every policy. `set_config(..., true)` is the parameterised form of
 * SET LOCAL; the role cannot be parameterised, so it is checked against a fixed
 * set instead of interpolated from anything a request can influence.
 */
async function asRole(role, uid, fn) {
  if (!ROLES.has(role)) throw new Error("refusing to set an unknown role: " + role);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role " + role);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/* A signed-in customer or admin. uid has already been verified from the token. */
const asUser = (uid, fn) => asRole("authenticated", uid, fn);

/* Signed out. Only app_settings is readable this way, and only because
   appset_read_all grants select to anon so the buy screen can quote prices. */
const asAnon = fn => asRole("anon", null, fn);

/* The auth tables, which no customer role may touch at all.
 *
 * This runs as the connecting owner with NO role switch, so it is the one path
 * that is not policy-checked. It is reserved for auth.users and
 * auth.refresh_tokens — creating an account, checking a password, issuing and
 * revoking tokens — none of which a customer may read. It must never be handed
 * a statement against public.*, because that is precisely the owner bypass this
 * module exists to prevent.
 */
async function asService(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, asUser, asAnon, asService, describeDatabaseUrl, resolveSsl,
                   usableCa, getTlsNote, downgradeTlsAfter, isCertificateError, tlsState };
