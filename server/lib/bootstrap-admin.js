"use strict";
/* Grant the first administrator, and say out loud who holds the flag.
 *
 * WHY THIS EXISTS. `/admin` is gated on public.profiles.is_admin, and nothing
 * in the running application can set it: schema.sql defaults the column to
 * false and its own trigger forces `new.is_admin := false` on any insert that
 * arrives with a JWT, so an account cannot promote itself. That is the correct
 * design and it leaves exactly one hole — the FIRST administrator, on a
 * database that has none, can never be created through the product.
 *
 * The documented answer in schema.sql is to run one UPDATE in a SQL editor.
 * That instruction is stale: it was written for Supabase, and the database is
 * now DigitalOcean managed PostgreSQL, which ships no query console. Reaching
 * it from outside means a psql client the owner does not have on the phone
 * they administer this from, or putting the database password on a CI runner
 * and opening its firewall to that runner. Both are worse than the problem.
 *
 * So it happens where the connection already exists: in the container, on the
 * same service-role session that has just applied the schema. No new
 * credential, no new network path, and the result lands in the boot log the
 * diagnostics workflow already reads.
 *
 * IT ONLY EVER GRANTS. Setting is_admin true is the whole write; nothing here
 * clears it. Removing BOOTSTRAP_ADMIN_EMAIL therefore does not demote anyone —
 * a config slip must not be able to lock every administrator out of the panel.
 * Demotion stays a deliberate database action.
 *
 * IT CANNOT WIDEN ACCESS. Whoever can set this variable already sets
 * JWT_SECRET on the same component, and can mint any session they like. The
 * variable grants no authority its holder did not already have.
 *
 * A FAILURE HERE NEVER FAILS THE BOOT. A typo, a missing account, a permission
 * the runtime login turns out not to hold: each is reported and stepped over.
 * Taking production down over an administrator convenience would be a worse
 * outcome than an owner who cannot yet reach the panel.
 */

const MAX_EMAIL_LENGTH = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The roster is a debugging aid, not a directory: it names at most this many
   administrators so a misconfiguration that promotes a whole table cannot turn
   one boot into thousands of log lines. */
const ROSTER_LIMIT = 20;

/* Read the request, or explain why there isn't one. Whitespace around a value
   pasted into a console field is normal and is trimmed; anything else that
   fails to look like an address is a typo worth naming, because the silent
   alternative is an owner staring at "Not authorized" with no idea the
   variable never applied. */
function requestedAdminEmail(env) {
  const raw = String((env || process.env).BOOTSTRAP_ADMIN_EMAIL || "").trim();
  if (!raw) return null;
  if (raw.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(raw)) {
    const err = new Error("BOOTSTRAP_ADMIN_EMAIL is not a valid email address");
    err.code = "invalid_bootstrap_admin_email";
    throw err;
  }
  return raw;
}

/* public.hnk_auth_users.email is the authoritative address: signup stores it
   exactly as typed and matches on lower(email), so `Hlaingkhay28047@gmail.com`
   and `hlaingkhay28047@gmail.com` are one account and a case-sensitive `=`
   here would silently update nothing. profiles.email is a copy, and older rows
   may not carry one, so the join runs through the identifier instead. */
async function promoteAdmin(client, email) {
  const { rows } = await client.query(
    `update public.profiles p set is_admin = true
       from public.hnk_auth_users u
      where u.id = p.id
        and lower(u.email) = lower($1)
        and p.is_admin is not true
     returning u.email`,
    [email]);
  return rows.map(row => row.email);
}

/* Answering "who is administrator right now" is half of what this module is
   for: before it existed there was no way to ask at all. */
async function listAdmins(client) {
  const { rows } = await client.query(
    `select coalesce(p.email, u.email) as email, p.account_status
       from public.profiles p
       join public.hnk_auth_users u on u.id = p.id
      where p.is_admin is true
      order by 1
      limit $1`,
    [ROSTER_LIMIT + 1]);
  const { rows: counted } = await client.query(
    "select count(*)::int as n from public.profiles where is_admin is true");
  return { total: counted[0].n, listed: rows.slice(0, ROSTER_LIMIT) };
}

/* NEVER PRINT A WHOLE ADDRESS. This repository is public, and the production
   diagnostics workflow republishes container stdout into a GitHub Actions log
   that anyone on the internet can read. The line exists so the owner can tell
   whether the administrator is them, which a masked address answers just as
   well as a whole one — and an address that never reaches stdout cannot be
   republished by a lane that learns a new pattern later.
 *
 * IT MUST NOT LOOK LIKE AN ADDRESS EITHER. The diagnostics lane redacts
 * anything matching local@domain.tld, so `Hl***47@gmail.com` would come back
 * as `<email redacted>` and answer nothing. Writing " [at] " instead of "@"
 * keeps the line legible through a filter whose job is to be indiscriminate.
 * Pure ASCII, because that lane also strips the log to printable ASCII. */
function maskEmail(value) {
  const email = String(value || "");
  const at = email.lastIndexOf("@");
  if (at < 1) return "<address withheld>";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = local.length <= 4
    ? local.slice(0, 1) + "***"
    : local.slice(0, 2) + "***" + local.slice(-2);
  return shown + " [at] " + domain;
}

function describeAdmin(row) {
  return maskEmail(row.email) + " (" + row.account_status + ")";
}

/* Promote first, then report, so one boot log answers both "did my variable
   take effect" and "who holds the flag now" consistently. */
async function bootstrapAdmin(client, env, log) {
  const say = log || console.log;
  const warn = (log && log.warn) || console.error;

  let email = null;
  try {
    email = requestedAdminEmail(env);
  } catch (err) {
    warn("admin: " + err.message + " — no account was promoted");
  }

  if (email) {
    try {
      const promoted = await promoteAdmin(client, email);
      if (promoted.length) {
        say("admin: promoted " + promoted.length + " account to administrator — " +
            promoted.map(maskEmail).join(", "));
      } else {
        /* Two very different situations share this branch and the owner needs
           to tell them apart, so the roster line below carries the answer:
           already an administrator, or no such account yet. */
        say("admin: BOOTSTRAP_ADMIN_EMAIL " + maskEmail(email) +
            " promoted nothing — either it is already an administrator, or no " +
            "account has signed up with that address yet");
      }
    } catch (err) {
      warn("admin: promoting " + maskEmail(email) + " failed — " + (err && err.message));
    }
  }

  try {
    const roster = await listAdmins(client);
    if (!roster.total) {
      say("admin: no account holds is_admin — /admin will refuse everyone");
      return;
    }
    const shown = roster.listed.map(describeAdmin).join(", ");
    const more = roster.total > roster.listed.length
      ? " (+" + (roster.total - roster.listed.length) + " more)" : "";
    say("admin: " + roster.total + " account(s) hold is_admin — " + shown + more);
  } catch (err) {
    warn("admin: reading the administrator roster failed — " + (err && err.message));
  }
}

module.exports = { bootstrapAdmin, promoteAdmin, listAdmins, requestedAdminEmail, maskEmail };
