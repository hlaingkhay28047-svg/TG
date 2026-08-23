"use strict";
/* The six auth endpoints the app calls, answering in Supabase's shapes.
 *
 * COMPATIBILITY IS THE POINT. accSaveSession reads a session envelope
 * {access_token, refresh_token, expires_in, expires_at, user:{id,email}}, and
 * accFriendly picks which of the 37 translated messages to show by pattern-
 * matching the error TEXT: "Invalid login credentials", "Email not confirmed",
 * "User already registered", "should be at least". Inventing tidier wording
 * here would compile and pass a smoke test, and every customer error would
 * quietly become the generic "cannot reach the service" — so the strings below
 * are the ones the client already knows, deliberately.
 */
const { asService } = require("./db");
const { hashPassword, verifyPassword, signToken, verifyToken, randomToken } = require("./crypto");
const { sendRecoveryEmail } = require("./email");

const ACCESS_TTL  = Number(process.env.ACCESS_TOKEN_TTL  || 3600);          // 1 hour
const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL || 60 * 60 * 24 * 30); // 30 days
const SECRET = process.env.JWT_SECRET || "";
/* Confirmation email is a separate product decision; until the owner wires SMTP
   an account is usable immediately. Set REQUIRE_EMAIL_CONFIRMATION=1 to demand
   it — the client already renders the "check your email" state. */
const REQUIRE_CONFIRM = process.env.REQUIRE_EMAIL_CONFIRMATION === "1";

class AuthError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function session(client, user) {
  const access = signToken({ sub: user.id, email: user.email, role: "authenticated" }, SECRET, ACCESS_TTL);
  const refresh = randomToken();
  await client.query(
    "insert into auth.refresh_tokens (token, user_id, expires_at) values ($1, $2, now() + ($3 || ' seconds')::interval)",
    [refresh, user.id, String(REFRESH_TTL)]);
  return {
    access_token: access.token,
    token_type: "bearer",
    expires_in: access.expires_in,
    expires_at: access.expires_at,
    refresh_token: refresh,
    user: { id: user.id, email: user.email },
  };
}

async function signup(body) {
  const email = String((body && body.email) || "").trim();
  const password = String((body && body.password) || "");
  if (!EMAIL_RE.test(email)) throw new AuthError(400, "Unable to validate email address: invalid format", "invalid_email");
  if (password.length < 6) throw new AuthError(422, "Password should be at least 6 characters", "weak_password");

  const encrypted = await hashPassword(password);
  return asService(async client => {
    const existing = await client.query("select id from auth.users where lower(email) = lower($1)", [email]);
    if (existing.rowCount) throw new AuthError(422, "User already registered", "user_already_exists");
    const { rows } = await client.query(
      "insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, $2, $3) returning id, email",
      [email, encrypted, REQUIRE_CONFIRM ? null : new Date()]);
    const user = rows[0];
    if (REQUIRE_CONFIRM) return { status: 200, body: { id: user.id, email: user.email, confirmation_sent_at: new Date() } };
    return { status: 200, body: await session(client, user) };
  });
}

async function tokenPassword(body) {
  const email = String((body && body.email) || "").trim();
  const password = String((body && body.password) || "");
  return asService(async client => {
    const { rows } = await client.query(
      "select id, email, encrypted_password, email_confirmed_at from auth.users where lower(email) = lower($1)", [email]);
    const user = rows[0];
    /* The password is verified even when no such account exists, against a
       throwaway hash, so a wrong address and a wrong password take the same
       time. Answering instantly for an unknown address turns this endpoint into
       a way to enumerate who has an account. */
    const ok = await verifyPassword(password, user ? user.encrypted_password : "scrypt$16384$8$1$AAAA$AAAA");
    if (!user || !ok) throw new AuthError(400, "Invalid login credentials", "invalid_grant");
    if (REQUIRE_CONFIRM && !user.email_confirmed_at) throw new AuthError(400, "Email not confirmed", "email_not_confirmed");
    return { status: 200, body: await session(client, user) };
  });
}

async function tokenRefresh(body) {
  const token = String((body && body.refresh_token) || "");
  return asService(async client => {
    const { rows } = await client.query(
      "select t.token, u.id, u.email from auth.refresh_tokens t join auth.users u on u.id = t.user_id " +
      "where t.token = $1 and t.expires_at > now()", [token]);
    if (!rows.length) throw new AuthError(400, "Invalid Refresh Token: Refresh Token Not Found", "invalid_grant");
    /* Rotate: the presented token is spent. A stolen refresh token is then good
       for one use at most, and the theft shows up as the real customer being
       logged out rather than as nothing at all. */
    await client.query("delete from auth.refresh_tokens where token = $1", [token]);
    return { status: 200, body: await session(client, rows[0]) };
  });
}

async function logout(body, uid) {
  return asService(async client => {
    if (body && body.refresh_token) await client.query("delete from auth.refresh_tokens where token = $1", [String(body.refresh_token)]);
    else if (uid) await client.query("delete from auth.refresh_tokens where user_id = $1", [uid]);
    return { status: 204, body: null };
  });
}

async function recover(body, redirectTo) {
  const email = String((body && body.email) || "").trim();
  const token = randomToken();
  return asService(async client => {
    const { rows } = await client.query("select id, email from auth.users where lower(email) = lower($1)", [email]);
    if (rows.length) {
      await client.query("update auth.users set recovery_token = $1, recovery_sent_at = now() where id = $2", [token, rows[0].id]);
      try { await sendRecoveryEmail(rows[0].email, token, redirectTo); }
      catch (err) { console.error("recovery email failed:", err.message); }
    }
    /* Always 200, whether or not the address exists — the alternative tells an
       attacker which of a list of addresses are customers. */
    return { status: 200, body: {} };
  });
}

/* PUT /auth/v1/user — the password change after a reset, and from Settings.
   Accepts either a signed-in access token or a recovery token. */
async function updateUser(body, uid, recoveryToken) {
  const password = String((body && body.password) || "");
  if (password.length < 6) throw new AuthError(422, "Password should be at least 6 characters", "weak_password");
  const encrypted = await hashPassword(password);
  return asService(async client => {
    let target = uid;
    if (!target && recoveryToken) {
      const { rows } = await client.query(
        "select id from auth.users where recovery_token = $1 and recovery_sent_at > now() - interval '1 hour'", [recoveryToken]);
      if (!rows.length) throw new AuthError(401, "Invalid or expired recovery token", "invalid_grant");
      target = rows[0].id;
    }
    if (!target) throw new AuthError(401, "Not authenticated", "unauthorized");
    const { rows } = await client.query(
      "update auth.users set encrypted_password = $1, recovery_token = null, updated_at = now() " +
      "where id = $2 returning id, email", [encrypted, target]);
    if (!rows.length) throw new AuthError(404, "User not found", "not_found");
    /* Changing a password invalidates every other session. */
    await client.query("delete from auth.refresh_tokens where user_id = $1", [target]);
    const s = await session(client, rows[0]);
    /* The client's accSaveSession accepts a USER object with a rotated token at
       the top level, which is the shape Supabase returns here. */
    return { status: 200, body: Object.assign({ id: rows[0].id, email: rows[0].email }, s) };
  });
}

async function getUser(uid) {
  return asService(async client => {
    const { rows } = await client.query("select id, email, created_at from auth.users where id = $1", [uid]);
    if (!rows.length) throw new AuthError(404, "User not found", "not_found");
    return { status: 200, body: rows[0] };
  });
}

module.exports = { signup, tokenPassword, tokenRefresh, logout, recover, updateUser, getUser, AuthError, verifyToken, SECRET };
