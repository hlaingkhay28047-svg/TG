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
const crypto = require("crypto");
const { asService } = require("./db");
const { withPasswordKdfSlot, signToken, verifyToken, randomToken } = require("./crypto");
const { sendRecoveryEmail, sendSignupNotice } = require("./email");
const { createSessionStore, createPgSessionRepository, hashRefreshToken } = require("./session");
const { evaluateFailedLoginThrottle,evaluateAuthAttemptThrottle,
  evaluateLoginAdmissionThrottle } = require("./login-protection");

const ACCESS_TTL  = Number(process.env.ACCESS_TOKEN_TTL  || 3600);          // 1 hour
const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL || 60 * 60 * 24 * 30); // 30 days
const SECRET = process.env.JWT_SECRET || "";
/* Confirmation email is a separate product decision; until the owner wires SMTP
   an account is usable immediately. Set REQUIRE_EMAIL_CONFIRMATION=1 to demand
   it — the client already renders the "check your email" state. */
const REQUIRE_CONFIRM = process.env.REQUIRE_EMAIL_CONFIRMATION === "1";
const FAILED_LOGIN_LIMIT = Math.max(3, Number(process.env.FAILED_LOGIN_LIMIT || 5));
const FAILED_EMAIL_LIMIT = Math.max(FAILED_LOGIN_LIMIT, Number(process.env.FAILED_EMAIL_LIMIT || 10));
const FAILED_IP_LIMIT = Math.max(FAILED_LOGIN_LIMIT + 1, Number(process.env.FAILED_IP_LIMIT || 25));
const FAILED_LOGIN_WINDOW_SECONDS = Math.max(60, Number(process.env.FAILED_LOGIN_WINDOW_SECONDS || 900));
const LOGIN_ADMISSION_WINDOW_SECONDS = Math.max(10,
  Number(process.env.LOGIN_ADMISSION_WINDOW_SECONDS || 60));
const LOGIN_ADMISSION_IP_LIMIT = Math.max(1,
  Number(process.env.LOGIN_ADMISSION_IP_LIMIT || 20));
const LOGIN_ADMISSION_GLOBAL_LIMIT = Math.max(LOGIN_ADMISSION_IP_LIMIT,
  Number(process.env.LOGIN_ADMISSION_GLOBAL_LIMIT || 300));
const AUTH_ATTEMPT_WINDOW_SECONDS = Math.max(60,Number(process.env.AUTH_ATTEMPT_WINDOW_SECONDS || 3600));
const SIGNUP_IP_LIMIT = Math.max(1,Number(process.env.SIGNUP_IP_LIMIT || 5));
const SIGNUP_EMAIL_LIMIT = Math.max(1,Number(process.env.SIGNUP_EMAIL_LIMIT || 3));
const SIGNUP_GLOBAL_LIMIT = Math.max(SIGNUP_IP_LIMIT,Number(process.env.SIGNUP_GLOBAL_LIMIT || 200));
const RECOVER_IP_LIMIT = Math.max(1,Number(process.env.RECOVER_IP_LIMIT || 10));
const RECOVER_EMAIL_LIMIT = Math.max(1,Number(process.env.RECOVER_EMAIL_LIMIT || 3));
const RECOVER_GLOBAL_LIMIT = Math.max(RECOVER_IP_LIMIT,Number(process.env.RECOVER_GLOBAL_LIMIT || 300));
const RECOVERY_PROBE_IP_LIMIT = Math.max(1,Number(process.env.RECOVERY_PROBE_IP_LIMIT || 10));
const RECOVERY_PROBE_TOKEN_LIMIT = Math.max(1,Number(process.env.RECOVERY_PROBE_TOKEN_LIMIT || 2));
const RECOVERY_PROBE_GLOBAL_LIMIT = Math.max(RECOVERY_PROBE_IP_LIMIT,
  Number(process.env.RECOVERY_PROBE_GLOBAL_LIMIT || 300));
const PASSWORD_CHANGE_IP_LIMIT = Math.max(1,Number(process.env.PASSWORD_CHANGE_IP_LIMIT || 5));
const PASSWORD_CHANGE_SUBJECT_LIMIT = Math.max(1,Number(process.env.PASSWORD_CHANGE_SUBJECT_LIMIT || 1));
const PASSWORD_CHANGE_GLOBAL_LIMIT = Math.max(PASSWORD_CHANGE_IP_LIMIT,
  Number(process.env.PASSWORD_CHANGE_GLOBAL_LIMIT || 100));

class AuthError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RECOVERY_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;

function clientType(value) {
  return ["web", "panel", "admin"].includes(value) ? value : "web";
}

function authAttemptEmailHash(email) {
  return crypto.createHmac("sha256",SECRET).update(String(email||"").trim().toLowerCase(),"utf8").digest("hex");
}

async function reserveAuthAttempt(operation,email,context) {
  const limitMap={
    signup:{ipLimit:SIGNUP_IP_LIMIT,emailLimit:SIGNUP_EMAIL_LIMIT,globalLimit:SIGNUP_GLOBAL_LIMIT},
    recover:{ipLimit:RECOVER_IP_LIMIT,emailLimit:RECOVER_EMAIL_LIMIT,globalLimit:RECOVER_GLOBAL_LIMIT},
    recovery_probe:{ipLimit:RECOVERY_PROBE_IP_LIMIT,emailLimit:RECOVERY_PROBE_TOKEN_LIMIT,
      globalLimit:RECOVERY_PROBE_GLOBAL_LIMIT},
    password_change:{ipLimit:PASSWORD_CHANGE_IP_LIMIT,emailLimit:PASSWORD_CHANGE_SUBJECT_LIMIT,
      globalLimit:PASSWORD_CHANGE_GLOBAL_LIMIT},
  };
  const limits=limitMap[operation];
  if (!limits) throw new Error("unknown auth attempt operation");
  const ipHash=String(context&&context.ipHash||"missing_source");
  const emailHash=authAttemptEmailHash(email);
  const decision=await asService(async client=>{
    /* A per-operation advisory lock makes the count+reservation atomic across
       every application instance. The reservation happens before scrypt or
       SMTP work, so parallel requests cannot all pass a stale count. */
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["auth-attempt:"+operation]);
    const {rows}=await client.query(
      `select
        (select count(*)::int from public.auth_attempts where operation=$1 and ip_hash=$2
          and occurred_at>now()-($4||' seconds')::interval) as ip_attempts,
        (select count(*)::int from public.auth_attempts where operation=$1 and email_hash=$3
          and occurred_at>now()-($4||' seconds')::interval) as email_attempts,
        (select count(*)::int from public.auth_attempts where operation=$1
          and occurred_at>now()-($4||' seconds')::interval) as global_attempts`,
      [operation,ipHash,emailHash,String(AUTH_ATTEMPT_WINDOW_SECONDS)]);
    const verdict=evaluateAuthAttemptThrottle(Object.assign({},limits,{
      ipAttempts:rows[0].ip_attempts,emailAttempts:rows[0].email_attempts,
      globalAttempts:rows[0].global_attempts,
    }));
    if (verdict.blocked) return verdict;
    await client.query(
      "insert into public.auth_attempts (operation,ip_hash,email_hash) values ($1,$2,$3)",
      [operation,ipHash,emailHash]);
    await client.query(
      `delete from public.auth_attempts where id in
        (select id from public.auth_attempts where occurred_at<now()-interval '7 days'
          order by occurred_at limit 100)`);
    return verdict;
  });
  if (decision.blocked) {
    throw new AuthError(429,"Too many requests. Try again later.","rate_limited");
  }
}

async function reserveLoginAttempt(email,context) {
  const ipHash=String(context&&context.ipHash||"missing_source");
  const emailHash=authAttemptEmailHash(email);
  const decision=await asService(async client=>{
    /* Failed-password limits span both email and source. A short global lock
       makes their count+reservation atomic across every instance without
       holding the lock during scrypt. Successful credentials remove their
       reservation below; failed credentials leave durable evidence. */
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended($1,0))",
      ["auth-attempt:login"]);
    const {rows}=await client.query(
      `select
        (select count(*)::int from public.auth_attempts
          where operation='login' and email_hash=$1 and ip_hash=$2
            and occurred_at>now()-($3||' seconds')::interval) as email_ip_failures,
        (select count(*)::int from public.auth_attempts
          where operation='login' and email_hash=$1
            and occurred_at>now()-($3||' seconds')::interval) as email_failures,
        (select count(*)::int from public.auth_attempts
          where operation='login' and ip_hash=$2
            and occurred_at>now()-($3||' seconds')::interval) as ip_failures,
        (select count(*)::int from public.auth_attempts
          where operation='login_admission' and ip_hash=$2
            and occurred_at>now()-($4||' seconds')::interval) as admission_ip_attempts,
        (select count(*)::int from public.auth_attempts
          where operation='login_admission'
            and occurred_at>now()-($4||' seconds')::interval) as admission_global_attempts`,
      [emailHash,ipHash,String(FAILED_LOGIN_WINDOW_SECONDS),
        String(LOGIN_ADMISSION_WINDOW_SECONDS)]);
    const failureVerdict=evaluateFailedLoginThrottle({
      emailIpFailures:rows[0].email_ip_failures,
      emailFailures:rows[0].email_failures,
      ipFailures:rows[0].ip_failures,
      emailIpLimit:FAILED_LOGIN_LIMIT,
      emailLimit:FAILED_EMAIL_LIMIT,
      ipLimit:FAILED_IP_LIMIT,
    });
    if (failureVerdict.blocked) return failureVerdict;
    const admissionVerdict=evaluateLoginAdmissionThrottle({
      ipAttempts:rows[0].admission_ip_attempts,
      globalAttempts:rows[0].admission_global_attempts,
      ipLimit:LOGIN_ADMISSION_IP_LIMIT,
      globalLimit:LOGIN_ADMISSION_GLOBAL_LIMIT,
    });
    if (admissionVerdict.blocked) return admissionVerdict;
    /* Admissions remain for the short all-attempt window, including after a
       successful password proof. This bounds known-correct-password KDF and
       session floods without charging success to a victim email's failure
       allowance. */
    await client.query(
      "insert into public.auth_attempts (operation,ip_hash,email_hash) values ('login_admission',$1,$2)",
      [ipHash,emailHash]);
    const inserted=await client.query(
      "insert into public.auth_attempts (operation,ip_hash,email_hash) values ('login',$1,$2) returning id",
      [ipHash,emailHash]);
    await client.query(
      `delete from public.auth_attempts where id in
        (select id from public.auth_attempts where occurred_at<now()-interval '7 days'
          order by occurred_at limit 100)`);
    return Object.assign({},admissionVerdict,{reservationId:inserted.rows[0].id});
  });
  if (decision.blocked) {
    throw new AuthError(429,"Too many login attempts. Try again later.","rate_limited");
  }
  return decision.reservationId;
}

function sessionBody(user, issued) {
  const access = signToken({
    sub: user.id, email: user.email, role: "authenticated", sid: issued.sessionId,
  }, SECRET, ACCESS_TTL);
  return {
    access_token: access.token,
    token_type: "bearer",
    expires_in: access.expires_in,
    expires_at: access.expires_at,
    refresh_token: issued.refreshToken,
    session_id: issued.sessionId,
    user: { id: user.id, email: user.email },
  };
}

async function session(client, user, context) {
  const input = context || {};
  const store = createSessionStore({
    repository: createPgSessionRepository(client),
    randomToken,
    refreshTtlSeconds: REFRESH_TTL,
  });
  const issued = await store.issue({
    userId: user.id,
    clientType: clientType(input.clientType),
    deviceInstallationId: input.deviceInstallationId || null,
    ipHash: input.ipHash || null,
    userAgent: input.userAgent || null,
  });
  return sessionBody(user, issued);
}

async function recordLogin(client, input) {
  await client.query(
    `insert into public.login_history
      (user_id,session_id,event_type,client_type,success,attempted_email,device_type,
       device_name,ip_hash,user_agent,failure_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [input.userId || null,input.sessionId || null,input.eventType,
     clientType(input.clientType),!!input.success,input.email || null,input.deviceType || null,
     input.deviceName || null,input.ipHash || null,input.userAgent || null,input.failureReason || null]);
}

async function ensureUnifiedProfile(client, user, body) {
  const name = String(body && body.data && body.data.name || "").trim() || null;
  await client.query(
    `insert into public.profiles (id,name,email,account_status)
     values ($1,$2,$3,'pending') on conflict (id) do nothing`,
    [user.id,name,user.email]);
  await client.query(
    `insert into public.user_roles (user_id,role_id)
     select $1,id from public.roles where name='student'
     on conflict (user_id,role_id) do nothing`, [user.id]);
  await client.query(
    "insert into public.app_permissions (user_id) values ($1) on conflict (user_id) do nothing",
    [user.id]);
}

const EMAIL_MASK_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
function notifySignupBestEffort(studentEmail) {
  /* Fire-and-forget: the account is already created, so a notification
     failure must neither fail nor slow the signup response. Container stdout
     is republished by public diagnostics lanes, so no address — the student's,
     or the owner's echoed back inside an SMTP reply — may reach the log. */
  sendSignupNotice(studentEmail).catch(error => {
    const why = String((error && error.message) || error).replace(EMAIL_MASK_RE, "<address withheld>");
    console.warn("signup notice not sent: " + why);
  });
}

async function signup(body, context) {
  const email = String((body && body.email) || "").trim();
  const password = String((body && body.password) || "");
  if (email.length>MAX_EMAIL_LENGTH||!EMAIL_RE.test(email)) throw new AuthError(400, "Unable to validate email address: invalid format", "invalid_email");
  if (password.length < 6) throw new AuthError(422, "Password should be at least 6 characters", "weak_password");
  if (password.length>MAX_PASSWORD_LENGTH) throw new AuthError(422,"Password is too long","invalid_password");

  const encrypted = await withPasswordKdfSlot(async kdf=>{
    await reserveAuthAttempt("signup",email,context);
    return kdf.hashPassword(password);
  });
  const outcome = await asService(async client => {
    const existing = await client.query("select id from public.hnk_auth_users where lower(email) = lower($1)", [email]);
    if (existing.rowCount) throw new AuthError(422, "User already registered", "user_already_exists");
    const { rows } = await client.query(
      "insert into public.hnk_auth_users (email, encrypted_password, email_confirmed_at) values ($1, $2, $3) returning id, email",
      [email, encrypted, REQUIRE_CONFIRM ? null : new Date()]);
    const user = rows[0];
    await ensureUnifiedProfile(client, user, body);
    if (REQUIRE_CONFIRM) return { status: 200, body: { id: user.id, email: user.email, confirmation_sent_at: new Date() } };
    const envelope = await session(client, user, context);
    await recordLogin(client, Object.assign({}, context, {
      userId: user.id, sessionId: envelope.session_id, email: user.email,
      eventType: "login", success: true,
    }));
    return { status: 200, body: envelope };
  });
  /* Outside the transaction, after the commit: SMTP work must never hold a
     database connection open, and only a signup that really happened may
     notify the owner. */
  notifySignupBestEffort(email);
  return outcome;
}

async function tokenPassword(body, context) {
  const email = String((body && body.email) || "").trim();
  const password = String((body && body.password) || "");
  /* Reject payload abuse before it can consume the deployment-wide KDF
     admission window. These requests prove no account interaction and are not
     written into the customer-facing login history. */
  if (email.length>MAX_EMAIL_LENGTH||password.length>MAX_PASSWORD_LENGTH) {
    throw new AuthError(400,"Invalid login credentials","invalid_grant");
  }
  return withPasswordKdfSlot(async kdf=>{
    /* Capacity is owned before durable admission. If the process is already at
       its KDF bound, the request receives auth_busy without touching the DB;
       once admitted, the DB record remains an honest all-attempt observation. */
    const loginReservationId=await reserveLoginAttempt(email,context);
    const result=await asService(async client => {
      const { rows } = await client.query(
        "select id, email, encrypted_password, email_confirmed_at from public.hnk_auth_users " +
        "where lower(email) = lower($1) for share", [email]);
      const user = rows[0];
      /* The password is verified even when no such account exists, against a
         throwaway hash, so a wrong address and a wrong password take the same
         time. Answering instantly for an unknown address turns this endpoint into
         a way to enumerate who has an account. */
      const ok = await kdf.verifyPassword(password,
        user ? user.encrypted_password : "scrypt$16384$8$1$AAAA$AAAA");
      if (!user || !ok) {
        await recordLogin(client, Object.assign({}, context, {
          userId:user && user.id,email,eventType:"failed_login",success:false,
          failureReason:"invalid_credentials",
        }));
        return { error: new AuthError(400, "Invalid login credentials", "invalid_grant") };
      }
      /* This row represented an unproven password attempt, not an audit event.
         Once the credential is proven it must not consume the failed-password
         allowance, even if a later account-status check denies access. */
      await client.query(
        "delete from public.auth_attempts where id=$1 and operation='login'",
        [loginReservationId]);
      if (REQUIRE_CONFIRM && !user.email_confirmed_at) {
        await recordLogin(client, Object.assign({}, context, {
          userId:user.id,email,eventType:"failed_login",success:false,
          failureReason:"email_not_confirmed",
        }));
        return { error: new AuthError(400, "Email not confirmed", "email_not_confirmed") };
      }
      await ensureUnifiedProfile(client, user, body);
      const profile = await client.query("select account_status from public.profiles where id=$1", [user.id]);
      const status = profile.rows[0] && profile.rows[0].account_status;
      if (["suspended","banned","rejected"].includes(status)) {
        await recordLogin(client, Object.assign({}, context, {
          userId:user.id,email,eventType:"failed_login",success:false,failureReason:status,
        }));
        return { error: new AuthError(403, "Account is " + status, "account_" + status) };
      }
      const requestedClient=body.client_type||body.client_kind||context&&context.clientType;
      const envelope = await session(client, user,
        Object.assign({}, context, { clientType:requestedClient }));
      await recordLogin(client, Object.assign({}, context, {
        userId:user.id,sessionId:envelope.session_id,email,eventType:"login",success:true,
        clientType:requestedClient,
      }));
      return { out: { status: 200, body: envelope } };
    });
    if (result.error) throw result.error;
    return result.out;
  });
}

async function tokenRefresh(body, context) {
  const token = String((body && body.refresh_token) || "");
  return asService(async client => {
    const store = createSessionStore({
      repository: createPgSessionRepository(client), randomToken, refreshTtlSeconds: REFRESH_TTL,
    });
    const rotated = await store.rotate({ refreshToken: token });
    if (rotated.active !== false) {
      const userRows = await client.query("select id,email from public.hnk_auth_users where id=$1", [rotated.userId]);
      if (!userRows.rows.length) throw new AuthError(400, "Invalid Refresh Token: Refresh Token Not Found", "invalid_grant");
      const profile = await client.query("select account_status from public.profiles where id=$1", [rotated.userId]);
      const status = profile.rows[0] && profile.rows[0].account_status;
      if (["suspended","banned","rejected"].includes(status)) {
        await createPgSessionRepository(client).revokeByUser(rotated.userId, new Date().toISOString(), status);
        return { status:403, body:{ error:"account_"+status,code:"account_"+status,
          message:"Account is "+status,msg:"Account is "+status } };
      }
      const envelope = sessionBody(userRows.rows[0], rotated);
      await recordLogin(client, Object.assign({}, context, {
        userId:rotated.userId,sessionId:rotated.sessionId,email:userRows.rows[0].email,
        eventType:"refresh",success:true,clientType:body.client_type||body.client_kind||context&&context.clientType,
      }));
      return { status: 200, body: envelope };
    }

    /* A canonical session that is expired, revoked, or idle is authoritative.
       Only a token absent from the canonical table may enter the one-time
       legacy bridge below; otherwise an old raw row could resurrect it. */
    if (rotated.reason !== "invalid_refresh_token") {
      const status = rotated.reason === "admin_session_timeout" ? 401 : 400;
      const message = rotated.reason === "admin_session_timeout"
        ? "Admin session timed out. Sign in again."
        : "Invalid Refresh Token: Refresh Token Not Found";
      return { status, body:{ error:rotated.reason,code:rotated.reason,message,msg:message } };
    }

    /* One-time compatibility bridge for refresh tokens issued before v5.43.0.
       The raw legacy token is deleted and the replacement is hash-only. */
    const { rows } = await client.query(
      "select t.token,u.id,u.email from public.hnk_auth_refresh_tokens t join public.hnk_auth_users u on u.id=t.user_id " +
      "where t.token=$1 and t.expires_at>now() for update", [token]);
    if (!rows.length) throw new AuthError(400, "Invalid Refresh Token: Refresh Token Not Found", "invalid_grant");
    await client.query("delete from public.hnk_auth_refresh_tokens where token=$1", [token]);
    await ensureUnifiedProfile(client,rows[0],body);
    const legacyProfile=await client.query("select account_status from public.profiles where id=$1",[rows[0].id]);
    const legacyStatus=legacyProfile.rows[0]&&legacyProfile.rows[0].account_status;
    if (["suspended","banned","rejected"].includes(legacyStatus)) {
      return {status:403,body:{error:"account_"+legacyStatus,code:"account_"+legacyStatus,
        message:"Account is "+legacyStatus,msg:"Account is "+legacyStatus}};
    }
    const envelope = await session(client, rows[0], Object.assign({}, context, { clientType:body.client_type||body.client_kind||"web" }));
    await recordLogin(client, Object.assign({}, context, {
      userId:rows[0].id,sessionId:envelope.session_id,email:rows[0].email,eventType:"refresh",success:true,
    }));
    return { status: 200, body: envelope };
  });
}

async function logout(body, uid, sessionId, context) {
  return asService(async client => {
    const repo = createPgSessionRepository(client);
    if (sessionId) await repo.revokeById(sessionId, new Date().toISOString(), "logout");
    if (body && body.refresh_token) {
      const hash = hashRefreshToken(String(body.refresh_token));
      await client.query("update public.sessions set revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,'logout') where refresh_token_hash=$1", [hash]);
      await client.query("delete from public.hnk_auth_refresh_tokens where token=$1", [String(body.refresh_token)]);
    } else if (uid) {
      await repo.revokeByUser(uid, new Date().toISOString(), "logout");
      await client.query("delete from public.hnk_auth_refresh_tokens where user_id=$1", [uid]);
    }
    if (uid) await recordLogin(client, Object.assign({}, context, {
      userId:uid,sessionId:sessionId || null,eventType:"logout",success:true,
    }));
    return { status: 204, body: null };
  });
}

async function recover(body,context) {
  const email = String((body && body.email) || "").trim();
  const boundedEmail=email.slice(0,MAX_EMAIL_LENGTH+1);
  await reserveAuthAttempt("recover",boundedEmail,context);
  const token = randomToken();
  const recipient=await asService(async client => {
    const { rows } = await client.query(
      "select id, email from public.hnk_auth_users where lower(email) = lower($1)",
      [email.length<=MAX_EMAIL_LENGTH?email:""]);
    if (rows.length) {
      /* Recovery tokens are random bearer secrets. Persist only a digest so a
         database read cannot be turned directly into a password-reset link. */
      await client.query("update public.hnk_auth_users set recovery_token = $1, recovery_sent_at = now() where id = $2",
        [hashRefreshToken(token), rows[0].id]);
      return rows[0].email;
    }
    return null;
  });
  if (recipient) {
    try { await sendRecoveryEmail(recipient, token); }
    catch (err) { console.error("recovery email failed:", err.message); }
  }
  /* Always 200, whether or not the address exists — the alternative tells an
     attacker which of a list of addresses are customers. */
  return { status: 200, body: {} };
}

/* PUT /auth/v1/user — the password change after a reset, and from Settings.
   Accepts either a signed-in access token or a recovery token. */
async function updateUser(body, uid, recoveryToken, context, sourceSessionId) {
  const password = String((body && body.password) || "");
  const recoveryBearer=String(recoveryToken||"");
  if (password.length < 6) throw new AuthError(422, "Password should be at least 6 characters", "weak_password");
  if (password.length>MAX_PASSWORD_LENGTH) throw new AuthError(422,"Password is too long","invalid_password");
  if (!uid&&!RECOVERY_TOKEN_RE.test(recoveryBearer)) {
    throw new AuthError(401,"Invalid or expired recovery token","invalid_grant");
  }

  /* Capacity is acquired before any anonymous recovery-token database work.
     Valid-looking probes receive their own durable IP/token/global admission;
     the indexed digest lookup then proves a subject before the one-attempt
     password-change reservation or scrypt. */
  const prepared = await withPasswordKdfSlot(async kdf=>{
    let preflightTarget=uid||null;
    if (!preflightTarget) {
      await reserveAuthAttempt("recovery_probe",recoveryBearer,context);
      preflightTarget=await asService(async client=>{
        const {rows}=await client.query(
          "select id from public.hnk_auth_users where recovery_token=$1 and recovery_sent_at>now()-interval '1 hour'",
          [hashRefreshToken(recoveryBearer)]);
        return rows[0]&&rows[0].id||null;
      });
      if (!preflightTarget) {
        throw new AuthError(401,"Invalid or expired recovery token","invalid_grant");
      }
    }
    await reserveAuthAttempt("password_change",preflightTarget,context);
    return {preflightTarget,encrypted:await kdf.hashPassword(password)};
  });
  return asService(async client => {
    const target=prepared.preflightTarget;
    /* Admin account actions lock this profile row before revoking sessions.
       Taking the compatible lock first gives password changes the same lock
       order and one clear commit boundary: if this transaction wins, a
       waiting force-logout revokes the newly issued session; if the admin
       wins, the source session check below observes that revocation. */
    const profile=await client.query(
      "select account_status from public.profiles where id=$1 for share",
      [target]);
    if (!profile.rows.length) throw new AuthError(404,"User not found","not_found");
    const accountStatus=profile.rows[0].account_status;
    if (["suspended","banned","rejected"].includes(accountStatus)) {
      throw new AuthError(403,"Account is "+accountStatus,"account_"+accountStatus);
    }

    if (uid) {
      if (!sourceSessionId) {
        throw new AuthError(401,"Session has been revoked","session_revoked");
      }
      const sourceSession=await client.query(
        `select id from public.sessions
          where id=$1 and user_id=$2 and revoked_at is null and expires_at>now()
          for update`,
        [sourceSessionId,target]);
      if (!sourceSession.rows.length) {
        throw new AuthError(401,"Session has been revoked","session_revoked");
      }
    } else {
      const recovery=await client.query(
        `select id from public.hnk_auth_users
          where recovery_token=$1 and id=$2
            and recovery_sent_at>now()-interval '1 hour'
          for update`,
        [hashRefreshToken(recoveryBearer),target]);
      if (!recovery.rows.length) {
        throw new AuthError(401,"Invalid or expired recovery token","invalid_grant");
      }
    }

    const { rows } = await client.query(
      "update public.hnk_auth_users set encrypted_password = $1, recovery_token = null, updated_at = now() " +
      "where id = $2 returning id, email", [prepared.encrypted, target]);
    if (!rows.length) throw new AuthError(404, "User not found", "not_found");
    /* Changing a password invalidates every other session. */
    await client.query("delete from public.hnk_auth_refresh_tokens where user_id = $1", [target]);
    await createPgSessionRepository(client).revokeByUser(target, new Date().toISOString(), "password_reset");
    const s = await session(client, rows[0], context);
    await recordLogin(client, Object.assign({}, context, {
      userId:target,sessionId:s.session_id,email:rows[0].email,eventType:"password_reset",success:true,
    }));
    /* The client's accSaveSession accepts a USER object with a rotated token at
       the top level, which is the shape Supabase returns here. */
    return { status: 200, body: Object.assign({ id: rows[0].id, email: rows[0].email }, s) };
  });
}

async function getUser(uid) {
  return asService(async client => {
    const { rows } = await client.query("select id, email, created_at from public.hnk_auth_users where id = $1", [uid]);
    if (!rows.length) throw new AuthError(404, "User not found", "not_found");
    return { status: 200, body: rows[0] };
  });
}

module.exports = { signup, tokenPassword, tokenRefresh, logout, recover, updateUser, getUser,
  reserveAuthAttempt,authAttemptEmailHash,AuthError,verifyToken,SECRET };
