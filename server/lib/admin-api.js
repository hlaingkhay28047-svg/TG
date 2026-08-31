"use strict";

const crypto = require("crypto");
const path = require("path");
const { authorizeAdminAction } = require("./admin");
const { createPgSessionRepository } = require("./session");
const { createPgDeviceRepository } = require("./devices");
const { ApiError } = require("./api-error");
const { generateSecret,encryptSecret,decryptSecret,verifyTotp } = require("./mfa");
const { requireSecret,normalizeDeviceSlots } = require("./entitlements");
const { compareVersions } = require("./panel-versions");
const panelArtifacts = require("./panel-artifacts");

const MONTHS = new Set([1,3,6,12]);
const PAYMENT_REVIEW_STATUSES = new Set(["approved","rejected"]);
const PAYMENT_QUEUE_STATUSES = new Set(["pending","approved","rejected","history"]);
const PAYMENT_GRANT_KINDS = new Set(["join_first","plan_1m","plan_3m","plan_6m"]);
const PAYMENT_PROOF_MIME_TYPES = new Set([
  "image/jpeg","image/png","image/webp","image/gif","image/avif",
  "image/heic","image/heif","image/bmp","image/tiff",
]);
const PAYMENT_PROOF_DEFAULT_MAX_BYTES = 8*1024*1024;
const PAYMENT_PROOF_HARD_MAX_BYTES = 16*1024*1024;
const configuredPaymentProofMax=Number(process.env.MAX_UPLOAD_BYTES||PAYMENT_PROOF_DEFAULT_MAX_BYTES);
const PAYMENT_PROOF_MAX_BYTES=Number.isSafeInteger(configuredPaymentProofMax)&&configuredPaymentProofMax>0
  ? Math.min(configuredPaymentProofMax,PAYMENT_PROOF_HARD_MAX_BYTES)
  : PAYMENT_PROOF_DEFAULT_MAX_BYTES;
const PAYMENT_NOTE_MAX_LENGTH = 1000;
const ADMIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const MFA_FAILED_LIMIT = Math.max(3,Number(process.env.MFA_FAILED_LIMIT || 5));
const MFA_FAILED_WINDOW_SECONDS = Math.max(60,Number(process.env.MFA_FAILED_WINDOW_SECONDS || 900));

function assertUuid(value, name) {
  if (!UUID_RE.test(String(value || ""))) throw new ApiError(400, "Invalid " + name, "invalid_" + name);
  return String(value);
}

function requireMutationId(value) {
  if (!UUID_RE.test(String(value||""))) {
    throw new ApiError(400,"A valid mutation_id is required","invalid_mutation_id");
  }
  return String(value).toLowerCase();
}

function requestHash(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function claimAdminMutation(client,identity,action,targetUserId,mutationId,parts,context) {
  const hash=requestHash(parts);
  const claimed=await client.query(
    `insert into public.admin_audit_logs
       (actor_user_id,target_user_id,action,details,ip_hash,user_agent,mutation_id,request_hash)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
     on conflict (actor_user_id,action,mutation_id) where mutation_id is not null do nothing
     returning id`,
    [identity.uid,targetUserId||null,action,JSON.stringify({mutation_id:mutationId}),
     context&&context.ipHash||null,context&&context.userAgent||null,mutationId,hash]);
  if (claimed.rows.length) {
    return {id:claimed.rows[0].id,mutationId,requestHash:hash,replayed:false};
  }
  const existing=await client.query(
    `select target_user_id,request_hash,result,completed_at
       from public.admin_audit_logs
      where actor_user_id=$1 and action=$2 and mutation_id=$3`,
    [identity.uid,action,mutationId]);
  const row=existing.rows[0];
  if (!row||row.request_hash!==hash||String(row.target_user_id||"")!==String(targetUserId||"")) {
    throw new ApiError(409,"mutation_id was already used for a different request","mutation_conflict");
  }
  if (!row.completed_at||!row.result||typeof row.result!=="object") {
    throw new ApiError(409,"The original mutation has not completed","mutation_incomplete");
  }
  return {mutationId,requestHash:hash,replayed:true,result:row.result};
}

async function completeAdminMutation(client,claim,details,result) {
  const completed=await client.query(
    `update public.admin_audit_logs
        set details=$2::jsonb,result=$3::jsonb,completed_at=now()
      where id=$1 and mutation_id=$4 and result is null
      returning id`,
    [claim.id,JSON.stringify(Object.assign({},details||{},{mutation_id:claim.mutationId})),
     JSON.stringify(result),claim.mutationId]);
  if (!completed.rows.length) throw new Error("admin mutation result was not persisted");
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function effectiveLicenseStatus(row, now) {
  if (!row || !row.license_status) return "missing";
  if (row.license_status !== "active") return "revoked";
  const at = now instanceof Date ? now.getTime() : Date.now();
  const starts = new Date(row.starts_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  if (Number.isFinite(starts) && starts > at) return "not_started";
  if (Number.isFinite(expires) && expires <= at) return "expired";
  return "active";
}

function effectiveAccountStatus(row, now) {
  const status = row && row.account_status || "pending";
  return status === "active" && effectiveLicenseStatus(row, now) === "expired" ? "expired" : status;
}

function normalizeStudent(row, slots, now) {
  const source = Object.assign({}, row || {});
  delete source.total_count;
  const devices = normalizeDeviceSlots(slots || [source.phone_device,source.computer_device].filter(Boolean));
  const licenseStatus = effectiveLicenseStatus(source, now);
  const effectiveStatus = effectiveAccountStatus(source, now);
  return Object.assign(source, {
    effective_status:effectiveStatus,
    canonical_license_status:source.license_status || null,
    license_status:licenseStatus,
    account:{ status:source.account_status,effective_status:effectiveStatus },
    license:{
      status:licenseStatus,canonical_status:source.license_status || null,
      starts_at:iso(source.starts_at),expires_at:iso(source.expires_at),
      active:licenseStatus === "active",
    },
    permissions:{
      web_app:source.web_app_enabled === true,
      ccx_download:source.ccx_download_enabled === true,
      photoshop_panel:source.panel_enabled === true,
    },
    devices,
    phone_device:devices.phone,
    computer_device:devices.computer,
  });
}

function requireAdminBase(identity) {
  if (!identity || identity.clientType !== "admin" || !identity.roles.includes("admin")) {
    throw new ApiError(403,"Admin permission required","forbidden");
  }
}

/* MFA is OPTIONAL, not mandatory. The owner instruction (2026-08-28) is that a
   forced first-sign-in enrolment must not be able to lock the sole
   administrator out of a panel nothing else can reopen — which is exactly what
   happened. So a second factor is required only from an administrator who has
   actually confirmed one (identity.mfaEnrolled): they opted in, so it is held
   to. An administrator with no confirmed secret reaches the dashboard with
   email and password alone, and may still enrol later from the same screen. */
function requireAdmin(identity, action) {
  requireAdminBase(identity);
  const decision = authorizeAdminAction({
    actor:{ userId:identity.uid,roles:identity.roles,mfaVerified:identity.mfaVerified },
    action,requireMfa:identity.mfaEnrolled === true,
  });
  if (!decision.allowed) {
    const status = decision.reason === "mfa_required" ? 403 : 403;
    throw new ApiError(status,
      decision.reason === "mfa_required" ? "Two-factor verification is required" : "Admin permission required",
      decision.reason);
  }
}

async function audit(client, identity, action, targetUserId, details, context) {
  await client.query(
    `insert into public.admin_audit_logs
      (actor_user_id,target_user_id,action,details,ip_hash,user_agent)
     values ($1,$2,$3,$4::jsonb,$5,$6)`,
    [identity.uid,targetUserId || null,action,JSON.stringify(details || {}),
     context.ipHash || null,context.userAgent || null]);
}

/* v5.61.0 — the landing's privacy-light visit counters: per-day totals and
   per-room ranking over the last 30 days. The table stores nothing but
   (day, page, hits), so this is the whole story there is to tell. */
async function visits(client, identity) {
  requireAdmin(identity, "view_visits");
  const days = await client.query(
    `select day, sum(hits)::bigint as hits from public.site_visits
      where day > (now() at time zone 'utc')::date - 30
      group by day order by day desc`);
  const pages = await client.query(
    `select page, sum(hits)::bigint as hits from public.site_visits
      where day > (now() at time zone 'utc')::date - 30
      group by page order by hits desc limit 40`);
  const total = days.rows.reduce((n, r) => n + Number(r.hits), 0);
  return { total_30d: total, days: days.rows.map(r => ({ day: r.day, hits: Number(r.hits) })),
    pages: pages.rows.map(r => ({ page: r.page, hits: Number(r.hits) })) };
}

async function dashboard(client, identity) {
  requireAdmin(identity, "view_dashboard");
  const counts = await client.query(
    `select count(*)::int as total,
            count(*) filter (where account_status='active')::int as active,
            count(*) filter (where account_status='pending')::int as pending,
            count(*) filter (where account_status='suspended')::int as suspended,
            count(*) filter (where account_status='banned')::int as banned,
            count(*) filter (where account_status='rejected')::int as rejected
       from public.profiles`);
  const license = await client.query(
    `select count(*) filter (where status='active' and expires_at <= now())::int as expired,
            count(*) filter (where status='active' and expires_at > now()
                              and expires_at <= now()+interval '7 days')::int as expiring_soon
       from public.licenses`);
  const online = await client.query(
    "select count(distinct user_id)::int as n from public.sessions where revoked_at is null and expires_at>now() and last_seen_at>now()-interval '5 minutes'");
  const latest = await client.query(
    `select h.user_id,p.name,coalesce(p.email,u.email) as email,h.occurred_at,h.client_type,h.success
       from public.login_history h left join public.profiles p on p.id=h.user_id
       left join public.hnk_auth_users u on u.id=h.user_id
      where h.event_type='login' order by h.occurred_at desc limit 10`);
  return Object.assign({}, counts.rows[0], license.rows[0], {
    online:online.rows[0].n,latest_logins:latest.rows,
  });
}

async function students(client, identity, params) {
  requireAdmin(identity, "list_students");
  const values = [];
  const where = [];
  const q = String(params.get("q") || params.get("search") || "").trim();
  const status = String(params.get("status") || "").trim();
  const licenseStatus = String(params.get("license_status") || "").trim();
  if (q) {
    values.push("%" + q.toLowerCase().slice(0,100) + "%");
    where.push(`(lower(coalesce(p.name,'')) like $${values.length} or lower(coalesce(p.email,u.email,'')) like $${values.length})`);
  }
  if (["pending","active","suspended","banned","rejected"].includes(status)) {
    values.push(status); where.push(`p.account_status=$${values.length}`);
  } else if (status === "expired") {
    where.push("l.status='active' and l.expires_at<=now()");
  }
  if (licenseStatus === "active") {
    where.push("l.status='active' and l.starts_at<=now() and l.expires_at>now()");
  } else if (licenseStatus === "expired") {
    where.push("l.status='active' and l.expires_at<=now()");
  } else if (licenseStatus === "revoked") {
    where.push("l.status='revoked'");
  } else if (["missing","none"].includes(licenseStatus)) {
    where.push("l.user_id is null");
  }
  const page = Math.max(1,Number(params.get("page") || 1));
  const limit = Math.min(100,Math.max(1,Number(params.get("limit") || 50)));
  values.push(limit,(page-1)*limit);
  const clause = where.length ? " where " + where.join(" and ") : "";
  const { rows } = await client.query(
    `select p.id,p.name,coalesce(p.email,u.email) as email,p.account_status,p.created_at,
            p.avatar,
            p.allowed_devices,
            l.status as license_status,l.starts_at,l.expires_at,
            a.web_app_enabled,a.ccx_download_enabled,a.panel_enabled,
            (select max(s.last_seen_at) from public.sessions s where s.user_id=p.id) as last_active_at,
            (select json_build_object('id',d.id,'slot_type',d.slot_type,'status',d.status,
                       'generation',d.generation,'label',d.label,'created_at',d.created_at,
                       'last_active_at',d.updated_at,'reset_at',d.reset_at)
               from public.device_slots d where d.user_id=p.id and d.slot_type='phone'
                and d.status='active' limit 1) as phone_device,
            (select json_build_object('id',d.id,'slot_type',d.slot_type,'status',d.status,
                       'generation',d.generation,'label',d.label,'created_at',d.created_at,
                       'last_active_at',d.updated_at,'reset_at',d.reset_at)
               from public.device_slots d where d.user_id=p.id and d.slot_type='computer'
                and d.status='active' limit 1) as computer_device,
            count(*) over()::int as total_count
       from public.profiles p join public.hnk_auth_users u on u.id=p.id
       left join public.licenses l on l.user_id=p.id
       left join public.app_permissions a on a.user_id=p.id
       ${clause}
      order by p.created_at desc limit $${values.length-1} offset $${values.length}`, values);
  const total=rows.length ? Number(rows[0].total_count) : 0;
  return { students:rows.map(row=>normalizeStudent(row)),page,limit,total };
}

async function studentDetail(client, identity, userId) {
  requireAdmin(identity, "list_students");
  assertUuid(userId,"student_id");
  const profile = await client.query(
    `select p.id,p.name,coalesce(p.email,u.email) as email,p.account_status,p.created_at,
            p.avatar,
            p.allowed_devices,
            l.status as license_status,l.starts_at,l.expires_at,
            a.web_app_enabled,a.ccx_download_enabled,a.panel_enabled,
            (select max(occurred_at) from public.login_history where user_id=p.id and event_type='login' and success) as last_login_at,
            (select max(last_seen_at) from public.sessions where user_id=p.id) as last_active_at,
            (select max(downloaded_at) from public.download_history where user_id=p.id) as last_download_at
       from public.profiles p join public.hnk_auth_users u on u.id=p.id
       left join public.licenses l on l.user_id=p.id
       left join public.app_permissions a on a.user_id=p.id where p.id=$1`, [userId]);
  if (!profile.rows.length) throw new ApiError(404,"Student not found","not_found");
  const devices = await client.query(
    `select s.id,s.slot_type,s.status,s.generation,s.label,s.created_at,s.updated_at,s.reset_at,
            json_agg(json_build_object('id',i.id,'client_type',i.client_type,'label',i.label,
                     'created_at',i.created_at,'last_seen_at',i.last_seen_at,'revoked_at',i.revoked_at)
                     order by i.created_at) filter (where i.id is not null) as installations
       from public.device_slots s left join public.device_installations i on i.slot_id=s.id
      where s.user_id=$1 group by s.id order by s.slot_type`, [userId]);
  const student=normalizeStudent(profile.rows[0],devices.rows);
  return {
    student,
    account:student.account,
    license:student.license,
    permissions:student.permissions,
    devices:student.devices,
  };
}

function licenseExpiry(body) {
  if (body.expires_at) {
    const expiry = new Date(body.expires_at);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      throw new ApiError(400,"Expiry must be in the future","invalid_expiry");
    }
    if (expiry.getTime() > Date.now() + 366*24*60*60*1000) {
      throw new ApiError(400,"Expiry cannot be more than one year away","invalid_expiry");
    }
    return { expiresAt:expiry.toISOString(),months:null };
  }
  const months = Number(body.months || 1);
  if (!MONTHS.has(months)) throw new ApiError(400,"License months must be 1, 3, 6 or 12","invalid_license_preset");
  return { expiresAt:null,months };
}

async function upsertLicense(client, target, body, actor, mode) {
  const expiry = licenseExpiry(body);
  if (expiry.expiresAt) {
    await client.query(
      `insert into public.licenses (user_id,status,starts_at,expires_at,created_by)
       values ($1,'active',now(),$2,$3)
       on conflict (user_id) do update set status='active',starts_at=least(public.licenses.starts_at,now()),
         expires_at=case when $4='replace' then excluded.expires_at
           else greatest(public.licenses.expires_at,excluded.expires_at) end,
         updated_at=now(),created_by=$3`, [target,expiry.expiresAt,actor,mode]);
  } else {
    await client.query(
      `insert into public.licenses (user_id,status,starts_at,expires_at,created_by)
       values ($1,'active',now(),now()+make_interval(months=>$2),$3)
       on conflict (user_id) do update set status='active',
         starts_at=least(public.licenses.starts_at,now()),
         expires_at=case when $4='extend'
           then greatest(public.licenses.expires_at,now())+make_interval(months=>$2)
           else greatest(public.licenses.expires_at,excluded.expires_at) end,
         updated_at=now(),created_by=$3`, [target,expiry.months,actor,mode]);
  }
  await client.query(
    `update public.profiles p set plan_status='active',plan_expires_at=l.expires_at
      from public.licenses l where p.id=$1 and l.user_id=p.id`, [target]);
}

async function revokeAllUserSessions(client,userId,reason) {
  const count=await createPgSessionRepository(client).revokeByUser(
    userId,new Date().toISOString(),reason);
  /* Pre-v5.43 refresh rows carry no session/client metadata. They must be
     deleted with every all-session/device revocation or the compatibility
     bridge could mint a fresh canonical session after force logout. */
  await client.query("delete from public.hnk_auth_refresh_tokens where user_id=$1",[userId]);
  return count;
}

async function studentAction(client, identity, userId, body, context) {
  assertUuid(userId,"student_id");
  const requested = String(body && body.action || "");
  const actionMap = {
    set_expiry:"change_expiry",set_permission:
      body.permission === "web_app" ? "set_web_app_enabled" :
      body.permission === "ccx_download" ? "set_ccx_download_enabled" : "set_panel_enabled",
  };
  const action = actionMap[requested] || requested;
  requireAdmin(identity, action);
  let extensionMutation=null;
  if (requested==="extend_license") {
    extensionMutation={
      expiry:licenseExpiry(body||{}),
      mutationId:requireMutationId(body&&body.mutation_id),
    };
  }
  const locked = await client.query("select id,account_status from public.profiles where id=$1 for update", [userId]);
  if (!locked.rows.length) throw new ApiError(404,"Student not found","not_found");
  let mutationClaim=null;
  if (extensionMutation) {
    mutationClaim=await claimAdminMutation(client,identity,requested,userId,extensionMutation.mutationId,
      [userId,extensionMutation.expiry.months,extensionMutation.expiry.expiresAt],context||{});
    if (mutationClaim.replayed) return mutationClaim.result;
  }
  let resetType = null;
  let passwordReset = false;
  let passwordResetEmail = null;

  if (requested === "approve") {
    if (locked.rows[0].account_status!=="pending") {
      throw new ApiError(409,"Only a pending account can be approved","account_not_pending");
    }
    const activated=await client.query(
      "update public.profiles set account_status='active' where id=$1 and account_status='pending' returning id",
      [userId]);
    if (!activated.rows.length) {
      throw new ApiError(409,"Only a pending account can be approved","account_not_pending");
    }
    await upsertLicense(client,userId,body,identity.uid,"preserve");
  } else if (["reject","activate","suspend","ban"].includes(requested)) {
    const status = requested === "activate" ? "active" : requested === "reject" ? "rejected" : requested;
    /* Account state and license state are independent controls. In particular,
       Suspend must preserve the remaining paid term so Activate can restore
       access without silently revoking that license through the legacy sync
       trigger on profiles.plan_status. */
    await client.query("update public.profiles set account_status=$2 where id=$1", [userId,status]);
    if (["rejected","suspended","banned"].includes(status)) {
      await revokeAllUserSessions(client,userId,status);
      await client.query(
        `insert into public.login_history (user_id,event_type,client_type,success,failure_reason)
         values ($1,'forced_logout','admin',true,$2)`, [userId,status]);
    }
  } else if (requested === "extend_license") {
    await upsertLicense(client,userId,body,identity.uid,"extend");
  } else if (requested === "set_expiry") {
    if (!body.expires_at) throw new ApiError(400,"expires_at is required","invalid_expiry");
    await upsertLicense(client,userId,body,identity.uid,"replace");
  } else if (requested === "reset_phone" || requested === "reset_computer") {
    resetType = requested === "reset_phone" ? "phone" : "computer";
    const count = await createPgDeviceRepository(client).resetSlot(userId,resetType,new Date().toISOString());
    await client.query(
      `update public.sessions set revoked_at=now(),revoked_reason=$3
        where user_id=$1 and device_installation_id in
          (select i.id from public.device_installations i join public.device_slots s on s.id=i.slot_id where s.user_id=$1 and s.slot_type=$2)
        and revoked_at is null`, [userId,resetType,"reset_"+resetType]);
    await client.query("delete from public.hnk_auth_refresh_tokens where user_id=$1",[userId]);
    await client.query(
      `insert into public.device_history (user_id,actor_user_id,event_type,details)
       values ($1,$2,'reset',$3::jsonb)`, [userId,identity.uid,JSON.stringify({slot_type:resetType,count})]);
  } else if (requested === "force_logout") {
    await revokeAllUserSessions(client,userId,"force_logout");
    await client.query(
      `insert into public.login_history (user_id,event_type,client_type,success,failure_reason)
       values ($1,'forced_logout','admin',true,'force_logout')`, [userId]);
  } else if (requested === "set_permission") {
    const columns = { web_app:"web_app_enabled",ccx_download:"ccx_download_enabled",photoshop_panel:"panel_enabled" };
    const column = columns[body.permission];
    if (!column || typeof body.enabled !== "boolean") throw new ApiError(400,"Invalid permission update","invalid_permission");
    await client.query(
      `insert into public.app_permissions (user_id,${column},updated_by,updated_at)
       values ($1,$2,$3,now()) on conflict (user_id) do update
       set ${column}=excluded.${column},updated_by=$3,updated_at=now()`, [userId,body.enabled,identity.uid]);
    if (!body.enabled&&body.permission!=="ccx_download") {
      const sessionType=body.permission==="photoshop_panel"?"panel":"web";
      await client.query(
        `update public.sessions set revoked_at=now(),revoked_reason=$3
          where user_id=$1 and client_type=$2 and revoked_at is null`,
        [userId,sessionType,body.permission+"_disabled"]);
      await client.query("delete from public.hnk_auth_refresh_tokens where user_id=$1",[userId]);
    }
  } else if (requested === "set_devices") {
    /* 2026-08-30 owner instruction: the machine count is the admin's dial.
       allowed_devices is the same column renewal payments multiply by, so
       raising a student to 2 machines also prices their renewal at 2. */
    const n = Number(body.allowed_devices);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      throw new ApiError(400,"allowed_devices must be a whole number from 1 to 20","invalid_device_limit");
    }
    await client.query("update public.profiles set allowed_devices=$2 where id=$1",[userId,n]);
    await client.query(
      `insert into public.device_history (user_id,actor_user_id,event_type,details)
       values ($1,$2,'limit',$3::jsonb)`, [userId,identity.uid,JSON.stringify({allowed_devices:n})]);
  } else if (requested === "password_reset") {
    passwordReset = true;
    const user = await client.query("select email from public.hnk_auth_users where id=$1",[userId]);
    passwordResetEmail = user.rows[0] && user.rows[0].email;
  } else {
    throw new ApiError(400,"Unknown student action","unknown_action");
  }

  const details={
    months:body.months || null,expires_at:body.expires_at || null,
    permission:body.permission || null,enabled:typeof body.enabled === "boolean" ? body.enabled : null,
    reset_type:resetType,
    allowed_devices:requested === "set_devices" ? Number(body.allowed_devices) : null,
  };
  const result={ ok:true,action:requested,student_id:userId,passwordReset,passwordResetEmail };
  if (mutationClaim) await completeAdminMutation(client,mutationClaim,details,result);
  else await audit(client,identity,requested,userId,details,context);
  return result;
}

function paymentBody(body, allowed, code) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400,"A JSON object is required",code);
  }
  const unexpected=Object.keys(body).filter(key=>!allowed.has(key));
  if (unexpected.length) {
    throw new ApiError(400,"Unexpected payment fields",code,{unexpected});
  }
  return body;
}

function paymentNote(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400,"Payment note must be text","invalid_payment_note");
  const note=value.trim();
  if (note.length>PAYMENT_NOTE_MAX_LENGTH) {
    throw new ApiError(400,"Payment note is too long","invalid_payment_note");
  }
  return note || null;
}

function pageNumber(value, fallback, maximum) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed=Number(value);
  if (!Number.isSafeInteger(parsed)||parsed<1) return fallback;
  return maximum ? Math.min(parsed,maximum) : parsed;
}

async function listPaymentRequests(client, identity, params) {
  requireAdmin(identity,"list_payment_requests");
  const query=params&&typeof params.get==="function"?params:new URLSearchParams();
  const values=[];const where=[];
  const status=String(query.get("status")||"").trim().toLowerCase();
  if (status&&!PAYMENT_QUEUE_STATUSES.has(status)) {
    throw new ApiError(400,"Unknown payment status","invalid_payment_status");
  }
  if (status === "history") {
    where.push("r.status in ('approved','rejected')");
  } else if (status) {
    values.push(status);where.push(`r.status=$${values.length}`);
  }
  const search=String(query.get("q")||query.get("search")||"").trim().toLowerCase().slice(0,100);
  if (search) {
    values.push("%"+search+"%");
    where.push(`lower(concat_ws(' ',p.name,coalesce(p.email,u.email),r.txn_last6,r.kind,r.note)) like $${values.length}`);
  }
  const page=pageNumber(query.get("page"),1,1000000);
  const limit=pageNumber(query.get("limit"),50,100);
  const filterSql=where.length?"where "+where.join(" and "):"";
  const counted=await client.query(
    `select count(*)::int as total,
            (select count(*)::int from public.app_settings) as app_settings_count
       from public.payment_requests r
       join public.profiles p on p.id=r.user_id
       join public.hnk_auth_users u on u.id=r.user_id
       ${filterSql}`,values.slice());
  values.push(limit,(page-1)*limit);
  const { rows }=await client.query(
    `select r.id,r.user_id,r.kind,r.txn_last6,r.amount_mmk,r.is_grant,r.device_count,
            r.pricing_mode,r.quoted_amount_mmk,r.status,r.note,r.screenshot_path,
            r.created_at,r.reviewed_at,r.reviewed_by,p.name,coalesce(p.email,u.email) as email
       from public.payment_requests r
       join public.profiles p on p.id=r.user_id
       join public.hnk_auth_users u on u.id=r.user_id
       ${filterSql}
      order by case when r.status='pending' then 0 else 1 end,r.created_at desc
      limit $${values.length-1} offset $${values.length}`,values);
  const total=Number(counted.rows[0]&&counted.rows[0].total||0);
  const appSettingsCount=Number(counted.rows[0]&&counted.rows[0].app_settings_count||0);
  const paymentRequests=rows.map(row=>{
    const item=Object.assign({},row);
    const hasProof=typeof item.screenshot_path==="string"&&item.screenshot_path.length>0;
    delete item.screenshot_path;
    item.proof_available=hasProof;
    item.proof_url=hasProof?`/api/v1/admin/payment-requests/${item.id}/proof`:null;
    return item;
  });
  const configurationWarnings=appSettingsCount===1?[]:[{
    code:"app_settings_row_count",count:appSettingsCount,
  }];
  return {payment_requests:paymentRequests,page,limit,total,
    configuration_warnings:configurationWarnings};
}

async function reviewPayment(client, identity, paymentId, input, context) {
  requireAdmin(identity,"review_payment");
  assertUuid(paymentId,"payment_request_id");
  const body=paymentBody(input,new Set(["status","note"]),"invalid_payment_review");
  const status=String(body.status||"").trim().toLowerCase();
  if (!PAYMENT_REVIEW_STATUSES.has(status)) {
    throw new ApiError(400,"Payment status must be approved or rejected","invalid_payment_status");
  }
  const note=paymentNote(body.note);
  if (!note) {
    throw new ApiError(400,"An admin note is required","invalid_payment_note");
  }
  const candidate=await client.query(
    "select r.id,r.user_id,r.kind,r.status from public.payment_requests r where r.id=$1",
    [paymentId]);
  if (!candidate.rows.length) throw new ApiError(404,"Payment request not found","not_found");
  if (candidate.rows[0].status!=="pending") {
    throw new ApiError(409,"Payment request was already reviewed","payment_already_reviewed");
  }
  const userId=candidate.rows[0].user_id;
  const profile=await client.query("select id from public.profiles where id=$1 for update",[userId]);
  if (!profile.rows.length) throw new ApiError(409,"Payment account is unavailable","payment_account_missing");
  const locked=await client.query(
    "select id,user_id,kind,status,note from public.payment_requests where id=$1 and user_id=$2 for update",
    [paymentId,userId]);
  if (!locked.rows.length) throw new ApiError(404,"Payment request not found","not_found");
  if (locked.rows[0].status!=="pending") {
    throw new ApiError(409,"Payment request was already reviewed","payment_already_reviewed");
  }
  const reviewed=await client.query(
    `update public.payment_requests
        set status=$2,reviewed_at=now(),reviewed_by=$3,
            note=case when $4::boolean then $5 else note end
      where id=$1 and status='pending'
      returning id,user_id,kind,txn_last6,amount_mmk,is_grant,device_count,
                pricing_mode,quoted_amount_mmk,status,note,created_at,reviewed_at,reviewed_by`,
    [paymentId,status,identity.uid,body.note!==undefined,note===undefined?null:note]);
  if (!reviewed.rows.length) {
    throw new ApiError(409,"Payment request was already reviewed","payment_already_reviewed");
  }
  await audit(client,identity,"review_payment",userId,{
    payment_request_id:paymentId,status,kind:locked.rows[0].kind,
  },context||{});
  return {ok:true,payment_request:reviewed.rows[0]};
}

async function grantPayment(client, identity, input, context) {
  requireAdmin(identity,"grant_payment");
  const body=paymentBody(input,new Set(["email","kind","note","mutation_id"]),"invalid_payment_grant");
  const email=String(body.email||"").trim().toLowerCase();
  if (email.length>320||!ADMIN_EMAIL_RE.test(email)) {
    throw new ApiError(400,"A valid student email is required","invalid_email");
  }
  const kind=String(body.kind||"").trim();
  if (!PAYMENT_GRANT_KINDS.has(kind)) {
    throw new ApiError(400,"Grant kind is not supported","invalid_payment_kind");
  }
  const note=paymentNote(body.note);
  if (!note) {
    throw new ApiError(400,"An admin note is required","invalid_payment_note");
  }
  const mutationId=requireMutationId(body.mutation_id);
  const found=await client.query(
    `select p.id,coalesce(p.email,u.email) as email
       from public.profiles p join public.hnk_auth_users u on u.id=p.id
      where lower(coalesce(p.email,u.email))=lower($1) limit 2`,[email]);
  if (found.rows.length!==1) throw new ApiError(404,"Student account not found","not_found");
  const userId=found.rows[0].id;
  const mutationClaim=await claimAdminMutation(client,identity,"grant_payment",userId,mutationId,
    [email,kind,note],context||{});
  if (mutationClaim.replayed) return mutationClaim.result;
  const profile=await client.query("select id from public.profiles where id=$1 for update",[userId]);
  if (!profile.rows.length) throw new ApiError(404,"Student account not found","not_found");
  const inserted=await client.query(
    `insert into public.payment_requests (user_id,kind,is_grant,amount_mmk,note)
     values ($1,$2,true,0,$3)
     returning id,user_id,kind,status`,
    [userId,kind,note]);
  const granted=await client.query(
    `update public.payment_requests
        set status='approved',reviewed_at=now(),reviewed_by=$2
      where id=$1 and status='pending'
      returning id,user_id,kind,txn_last6,amount_mmk,is_grant,device_count,
                pricing_mode,quoted_amount_mmk,status,note,created_at,reviewed_at,reviewed_by`,
    [inserted.rows[0].id,identity.uid]);
  if (!granted.rows.length) {
    throw new ApiError(409,"Payment grant could not be applied","payment_grant_conflict");
  }
  const result={ok:true,message:"VIP access granted.",payment_request:granted.rows[0]};
  await completeAdminMutation(client,mutationClaim,{
    payment_request_id:granted.rows[0].id,kind,status:"approved",
  },result);
  return result;
}

async function paymentProof(client, identity, paymentId, context) {
  requireAdmin(identity,"view_payment_proof");
  assertUuid(paymentId,"payment_request_id");
  const payment=await client.query(
    "select id,user_id,screenshot_path from public.payment_requests where id=$1 for share",
    [paymentId]);
  if (!payment.rows.length) throw new ApiError(404,"Payment request not found","not_found");
  const objectName=String(payment.rows[0].screenshot_path||"");
  const expectedPrefix=String(payment.rows[0].user_id)+"/";
  if (!objectName||objectName.length>1024||objectName.includes("\0")||!objectName.startsWith(expectedPrefix)) {
    throw new ApiError(404,"Payment proof not found","not_found");
  }
  const object=await client.query(
    `select mime_type,octet_length(data)::bigint as byte_length
       from public.hnk_storage_objects where bucket_id=$1 and name=$2 for share`,
    ["payment-proofs",objectName]);
  if (!object.rows.length) {
    throw new ApiError(404,"Payment proof not found","not_found");
  }
  const byteLength=Number(object.rows[0].byte_length);
  if (!Number.isSafeInteger(byteLength)||byteLength<1) {
    throw new ApiError(404,"Payment proof not found","not_found");
  }
  if (byteLength>PAYMENT_PROOF_MAX_BYTES) {
    throw new ApiError(413,"Payment proof is too large","payment_proof_too_large");
  }
  const storedType=String(object.rows[0].mime_type||"").split(";",1)[0].trim().toLowerCase();
  if (!PAYMENT_PROOF_MIME_TYPES.has(storedType)) {
    throw new ApiError(415,"Payment proof type is not supported","unsupported_payment_proof_type");
  }
  const bytes=await client.query(
    "select data from public.hnk_storage_objects where bucket_id=$1 and name=$2",
    ["payment-proofs",objectName]);
  if (!bytes.rows.length||!Buffer.isBuffer(bytes.rows[0].data)||bytes.rows[0].data.length!==byteLength) {
    throw new ApiError(404,"Payment proof not found","not_found");
  }
  await audit(client,identity,"view_payment_proof",payment.rows[0].user_id,{
    payment_request_id:paymentId,
  },context||{});
  return {raw:bytes.rows[0].data,contentType:storedType};
}

const HISTORY_TYPES = new Set(["all","login","failed_login","device","download","admin","license","account"]);
const LICENSE_ACTIONS = ["approve","extend_license","set_expiry"];
const ACCOUNT_ACTIONS = ["reject","activate","suspend","ban","reset_phone","reset_computer",
  "force_logout","set_permission","set_devices","password_reset"];

function normalizeHistoryType(value) {
  const kind=String(value || "all").trim() || "all";
  if (!HISTORY_TYPES.has(kind)) throw new ApiError(400,"Unknown history type","invalid_history_type");
  return kind;
}

function historyDate(value,name) {
  if (!value) return null;
  const parsed=new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ApiError(400,"Invalid "+name,"invalid_"+name);
  return parsed;
}

const LOGIN_EVENTS_SQL = `
  select h.occurred_at as created_at,h.user_id,p.name,
         coalesce(p.email,u.email,h.attempted_email) as email,
         h.event_type,h.event_type as action,h.device_name,h.user_agent as browser,
         h.client_type as app,h.client_type as channel,
         case when h.success then 'success' else 'failed' end as result,
         h.failure_reason as detail,'login'::text as source
    from public.login_history h
    left join public.profiles p on p.id=h.user_id
    left join public.hnk_auth_users u on u.id=h.user_id`;
const DEVICE_EVENTS_SQL = `
  select h.created_at,h.user_id,p.name,coalesce(p.email,u.email) as email,
         h.event_type,h.event_type as action,h.label as device_name,null::text as browser,
         h.client_type as app,h.client_type as channel,
         case when h.event_type='blocked' then 'denied' else 'success' end as result,
         h.details::text as detail,'device'::text as source
    from public.device_history h
    left join public.profiles p on p.id=h.user_id
    left join public.hnk_auth_users u on u.id=h.user_id`;
const DOWNLOAD_EVENTS_SQL = `
  select h.issued_at as created_at,h.user_id,p.name,coalesce(p.email,u.email) as email,
         'ccx_download'::text as event_type,'ccx_download'::text as action,
         h.artifact_key as device_name,h.user_agent as browser,
         'web'::text as app,'download'::text as channel,h.result,h.reason as detail,
         'download'::text as source
    from public.download_history h
    left join public.profiles p on p.id=h.user_id
    left join public.hnk_auth_users u on u.id=h.user_id`;
const ADMIN_EVENTS_SQL = `
  select h.created_at,h.target_user_id as user_id,p.name,coalesce(p.email,u.email) as email,
         h.action as event_type,h.action,null::text as device_name,h.user_agent as browser,
         'admin'::text as app,'admin'::text as channel,'success'::text as result,
         h.details::text as detail,'admin'::text as source
    from public.admin_audit_logs h
    left join public.profiles p on p.id=h.target_user_id
    left join public.hnk_auth_users u on u.id=h.target_user_id`;

function historySql(kind) {
  if (kind === "login" || kind === "failed_login") return LOGIN_EVENTS_SQL;
  if (kind === "device") return DEVICE_EVENTS_SQL;
  if (kind === "download") return DOWNLOAD_EVENTS_SQL;
  if (["admin","license","account"].includes(kind)) return ADMIN_EVENTS_SQL;
  return [LOGIN_EVENTS_SQL,DEVICE_EVENTS_SQL,DOWNLOAD_EVENTS_SQL,ADMIN_EVENTS_SQL]
    .map(sql=>"("+sql+")").join(" union all ");
}

async function histories(client, identity, params) {
  const kind=normalizeHistoryType(params.get("type"));
  const requiredAction=kind === "login" || kind === "failed_login" ? "view_login_history" :
    kind === "device" ? "view_device_history" : kind === "download" ? "view_download_history" : "view_dashboard";
  requireAdmin(identity,requiredAction);
  const values=[]; const where=[];
  const studentId=params.get("student_id");
  if (studentId) { values.push(assertUuid(studentId,"student_id"));where.push(`e.user_id=$${values.length}`); }
  const from=historyDate(params.get("from"),"from"),to=historyDate(params.get("to"),"to");
  if (from) { values.push(from);where.push(`e.created_at>=$${values.length}`); }
  if (to) { values.push(to);where.push(`e.created_at<=$${values.length}`); }
  if (kind === "failed_login") where.push("e.event_type='failed_login'");
  if (kind === "license") {
    values.push(LICENSE_ACTIONS);where.push(`e.action=any($${values.length}::text[])`);
  }
  if (kind === "account") {
    values.push(ACCOUNT_ACTIONS);where.push(`e.action=any($${values.length}::text[])`);
  }
  const q=String(params.get("q")||params.get("search")||"").trim().toLowerCase().slice(0,100);
  if (q) {
    values.push("%"+q+"%");
    where.push(`lower(concat_ws(' ',e.name,e.email,e.event_type,e.action,e.device_name,e.browser,e.app,e.channel,e.result,e.detail)) like $${values.length}`);
  }
  const page=Math.max(1,Number(params.get("page")||1));
  const limit=Math.min(100,Math.max(1,Number(params.get("limit")||50)));
  values.push(limit,(page-1)*limit);
  const { rows }=await client.query(
    `select e.*,count(*) over()::int as total_count from (${historySql(kind)}) e
      ${where.length?"where "+where.join(" and "):""}
      order by e.created_at desc limit $${values.length-1} offset $${values.length}`,values);
  const total=rows.length?Number(rows[0].total_count):0;
  const events=rows.map(row=>{const item=Object.assign({},row);delete item.total_count;return item;});
  return { type:kind,events,history:events,page,limit,total };
}

async function getPanelVersion(client, identity) {
  requireAdmin(identity,"manage_panel_versions");
  const { rows }=await client.query("select * from public.panel_versions order by released_at desc");
  return { versions:rows,latest_version:(rows.find(r=>r.is_latest)||{}).version||null,
    minimum_supported_version:(rows.find(r=>r.minimum_supported)||{}).version||null };
}

function publicArtifact(artifact, progress) {
  const item=artifact||{};
  const uploaded=progress&&Number(progress.uploaded_chunks||progress.uploadedChunks)||0;
  return {
    id:item.id,version:item.version,artifact_key:item.artifactKey,
    sha256:item.expectedSha256,size_bytes:item.expectedSizeBytes,
    chunk_size:item.chunkSize,chunk_count:item.chunkCount,status:item.status,
    uploaded_size_bytes:progress?Number(progress.uploaded_bytes||progress.uploadedSizeBytes||0):item.uploadedSizeBytes,
    uploaded_chunks:uploaded,
    uploaded_indices:progress&&progress.uploaded_indices||[],
    finalized_at:item.finalizedAt||null,
  };
}

async function initiatePanelArtifact(client,identity,body,context) {
  requireAdmin(identity,"manage_panel_versions");
  const artifact=await panelArtifacts.initiateUpload(client,identity.uid,body);
  await audit(client,identity,"panel_artifact_initiated",null,{
    artifact_id:artifact.id,version:artifact.version,sha256:artifact.expectedSha256,
    size_bytes:artifact.expectedSizeBytes,chunk_count:artifact.chunkCount,
  },context);
  return {ok:true,artifact:publicArtifact(artifact),
    chunk_url_template:`/api/v1/admin/panel-artifacts/${artifact.id}/chunks/{index}`,
    finalize_url:`/api/v1/admin/panel-artifacts/${artifact.id}/finalize`};
}

async function panelArtifactStatus(client,identity,artifactId) {
  requireAdmin(identity,"manage_panel_versions");
  assertUuid(artifactId,"artifact_id");
  const artifactRows=await client.query("select * from public.panel_artifacts where id=$1",[artifactId]);
  if (!artifactRows.rows.length) throw new ApiError(404,"Artifact upload not found","artifact_not_found");
  const progress=await client.query(
    `select count(*)::int as uploaded_chunks,coalesce(sum(size_bytes),0)::bigint as uploaded_bytes,
            coalesce(array_agg(chunk_index order by chunk_index),'{}') as uploaded_indices
       from public.panel_artifact_chunks where artifact_id=$1`,[artifactId]);
  return {ok:true,artifact:publicArtifact(panelArtifacts.mapArtifact(artifactRows.rows[0]),progress.rows[0])};
}

async function putPanelArtifactChunk(client,identity,artifactId,index,body,context) {
  requireAdmin(identity,"manage_panel_versions");
  const progress=await panelArtifacts.uploadChunk(client,artifactId,index,body);
  await audit(client,identity,"panel_artifact_chunk",null,{
    artifact_id:artifactId,chunk_index:progress.index,sha256:progress.sha256,size_bytes:progress.sizeBytes,
  },context);
  return {ok:true,artifact_id:artifactId,chunk_index:progress.index,sha256:progress.sha256,
    size_bytes:progress.sizeBytes,uploaded_chunks:progress.uploadedChunks,
    uploaded_size_bytes:progress.uploadedSizeBytes,chunk_count:progress.chunkCount,
    expected_size_bytes:progress.expectedSizeBytes};
}

async function finalizePanelArtifact(client,identity,artifactId,context) {
  requireAdmin(identity,"manage_panel_versions");
  const artifact=await panelArtifacts.finalizeUpload(client,artifactId);
  await audit(client,identity,"panel_artifact_finalized",null,{
    artifact_id:artifact.id,version:artifact.version,sha256:artifact.expectedSha256,
    size_bytes:artifact.expectedSizeBytes,chunk_count:artifact.chunkCount,
  },context);
  return {ok:true,artifact:publicArtifact(artifact,{uploadedChunks:artifact.chunkCount,
    uploadedSizeBytes:artifact.expectedSizeBytes,uploaded_indices:Array.from({length:artifact.chunkCount},(_,i)=>i)})};
}

function validatePanelPolicy(body, existingRelease) {
  const input=body||{};
  const existing=existingRelease||{};
  const latest=String(input.latest_version||input.version||"");
  const minimum=String(input.minimum_supported_version||latest);
  if (!VERSION_RE.test(latest)||!VERSION_RE.test(minimum)) {
    throw new ApiError(400,"Invalid semantic version","invalid_version");
  }
  if (compareVersions(minimum,latest)>0) {
    throw new ApiError(400,"Minimum supported version cannot be newer than latest","minimum_version_newer");
  }
  const requestedArtifact=input.artifact_key === undefined ?
    (existing.artifact_key||`HNK_Ai_Panel_v${latest}.ccx`) : String(input.artifact_key);
  const artifact=path.basename(String(requestedArtifact||""));
  if (artifact!==requestedArtifact||!/^HNK_Ai_Panel_v\d+\.\d+\.\d+\.ccx$/.test(artifact)) {
    throw new ApiError(400,"Invalid panel artifact name","invalid_artifact");
  }
  const enabled=input.enabled!==false;
  const sha256=String(input.sha256||existing.sha256||"").toLowerCase();
  const sizeBytes=Number(input.size_bytes === undefined ? existing.size_bytes : input.size_bytes);
  if (sha256&&!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ApiError(400,"Invalid SHA-256","invalid_sha256");
  }
  if (input.size_bytes!==undefined&&(!Number.isSafeInteger(sizeBytes)||sizeBytes<=0)) {
    throw new ApiError(400,"Invalid artifact size","invalid_artifact_size");
  }
  if (enabled&&!sha256) throw new ApiError(400,"Enabled releases require SHA-256","invalid_sha256");
  if (enabled&&(!Number.isSafeInteger(sizeBytes)||sizeBytes<=0)) {
    throw new ApiError(400,"Enabled releases require a positive artifact size","invalid_artifact_size");
  }
  return {latest,minimum,artifact,enabled,sha256:sha256||null,sizeBytes:Number.isSafeInteger(sizeBytes)&&sizeBytes>0?sizeBytes:null};
}

async function putPanelVersion(client, identity, body, context) {
  requireAdmin(identity,"manage_panel_versions");
  const requestedVersion=String(body.latest_version||body.version||"");
  const existingRows=VERSION_RE.test(requestedVersion)
    ? await client.query("select artifact_key,sha256,size_bytes,enabled from public.panel_versions where version=$1",[requestedVersion])
    : {rows:[]};
  const policy=validatePanelPolicy(body,existingRows.rows[0]);
  const {latest,minimum,artifact,enabled,sha256,sizeBytes}=policy;
  let artifactId=null;
  if (enabled) {
    const stored=await client.query(
      `select id from public.panel_artifacts
        where version=$1 and artifact_key=$2 and expected_sha256=$3
          and expected_size_bytes=$4 and status='ready'`,[latest,artifact,sha256,sizeBytes]);
    if (!stored.rows.length) {
      throw new ApiError(409,"A verified private artifact must be finalized before enabling this release","artifact_not_ready");
    }
    artifactId=stored.rows[0].id;
  }
  if (minimum!==latest) {
    const existing=await client.query("select version from public.panel_versions where version=$1",[minimum]);
    if (!existing.rows.length) throw new ApiError(400,"Minimum version has no release record","minimum_version_missing");
  }
  await client.query("update public.panel_versions set is_latest=false,minimum_supported=false");
  await client.query(
    `insert into public.panel_versions
      (version,is_latest,minimum_supported,enabled,artifact_key,sha256,size_bytes,artifact_id,released_at,created_by)
     values ($1,true,$2,$3,$4,$5,$6,$7,now(),$8)
     on conflict (version) do update set is_latest=true,minimum_supported=$2,enabled=$3,
       artifact_key=$4,sha256=$5,size_bytes=$6,artifact_id=$7,released_at=now(),created_by=$8`,
    [latest,latest===minimum,enabled,artifact,sha256,sizeBytes,artifactId,identity.uid]);
  if (minimum!==latest) {
    const existing=await client.query("update public.panel_versions set minimum_supported=true where version=$1 returning version",[minimum]);
    if (!existing.rows.length) throw new ApiError(409,"Minimum version could not be selected","minimum_version_missing");
  }
  await audit(client,identity,"manage_panel_versions",null,{latest,minimum,artifact},context);
  return { ok:true,latest_version:latest,minimum_supported_version:minimum };
}

async function mfaSetup(client, identity, context) {
  requireAdminBase(identity);
  const existing=await client.query(
    "select confirmed_at,pending_encrypted_secret from public.admin_mfa where user_id=$1",
    [identity.uid]);
  if (existing.rows[0]&&existing.rows[0].confirmed_at&&!identity.mfaVerified) {
    throw new ApiError(403,"Current two-factor verification is required before replacing MFA","mfa_required");
  }
  const key=requireSecret("MFA_ENCRYPTION_KEY",process.env.JWT_SECRET,32);
  const secret=generateSecret();
  const encrypted=encryptSecret(secret,key);
  await client.query(
    `insert into public.admin_mfa
       (user_id,encrypted_secret,pending_encrypted_secret,confirmed_at,updated_at)
     values ($1,$2,null,null,now()) on conflict (user_id) do update set
       encrypted_secret=case when public.admin_mfa.confirmed_at is not null
         then public.admin_mfa.encrypted_secret else excluded.encrypted_secret end,
       pending_encrypted_secret=case when public.admin_mfa.confirmed_at is not null
         then excluded.encrypted_secret else null end,
       confirmed_at=public.admin_mfa.confirmed_at,updated_at=now()`,[identity.uid,encrypted]);
  await audit(client,identity,"mfa_setup",identity.uid,
    {replaced:!!(existing.rows[0]&&existing.rows[0].confirmed_at)},context||{});
  const email=identity.payload&&identity.payload.email||"admin";
  return { ok:true,secret,otpauth_uri:`otpauth://totp/HNK%20Studio:${encodeURIComponent(email)}?secret=${secret}&issuer=HNK%20Studio` };
}

async function mfaVerify(client, identity, body, context) {
  requireAdminBase(identity);
  const { rows }=await client.query(
    `select encrypted_secret,pending_encrypted_secret,confirmed_at
       from public.admin_mfa where user_id=$1 for update`,[identity.uid]);
  if (!rows.length) throw new ApiError(400,"MFA setup is required","mfa_not_configured");
  /* Serialize attempts per admin so parallel guesses cannot all observe the
     same pre-limit count. The sentinel error is returned (not thrown) so the
     failed-attempt row commits; v1 turns it into an HTTP error afterwards. */
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["mfa:"+identity.uid]);
  const recent=await client.query(
    `select count(*)::int as failures from public.login_history
      where user_id=$1 and event_type='mfa_failed' and success=false
        and occurred_at > now() - ($2 || ' seconds')::interval`,
    [identity.uid,String(MFA_FAILED_WINDOW_SECONDS)]);
  if (Number(recent.rows[0]&&recent.rows[0].failures||0)>=MFA_FAILED_LIMIT) {
    return {ok:false,error:{status:429,code:"mfa_rate_limited",
      message:"Too many authentication attempts. Try again later."}};
  }
  let secret;
  const promotingPending=!!(identity.mfaVerified&&rows[0].confirmed_at&&rows[0].pending_encrypted_secret);
  const encryptedCandidate=promotingPending?rows[0].pending_encrypted_secret:rows[0].encrypted_secret;
  try { secret=decryptSecret(encryptedCandidate,
    requireSecret("MFA_ENCRYPTION_KEY",process.env.JWT_SECRET,32)); }
  catch (_) { throw new ApiError(503,"MFA security configuration is unavailable","security_configuration_missing"); }
  if (!verifyTotp(secret,body.code,Date.now())) {
    await client.query(
      `insert into public.login_history
        (user_id,session_id,event_type,client_type,success,attempted_email,ip_hash,user_agent,failure_reason)
       values ($1,$2,'mfa_failed','admin',false,$3,$4,$5,'invalid_mfa_code')`,
      [identity.uid,identity.sessionId||null,identity.payload&&identity.payload.email||null,
       context&&context.ipHash||null,context&&context.userAgent||null]);
    return {ok:false,error:{status:400,code:"invalid_mfa_code",message:"Invalid authentication code"}};
  }
  if (promotingPending) {
    await client.query(
      `update public.admin_mfa set encrypted_secret=pending_encrypted_secret,
         pending_encrypted_secret=null,confirmed_at=now(),updated_at=now() where user_id=$1`,
      [identity.uid]);
  } else {
    await client.query(
      "update public.admin_mfa set confirmed_at=coalesce(confirmed_at,now()),updated_at=now() where user_id=$1",
      [identity.uid]);
  }
  await client.query("update public.sessions set mfa_verified_at=now() where id=$1 and user_id=$2",[identity.sessionId,identity.uid]);
  await audit(client,identity,"mfa_verified",identity.uid,{},context);
  return { ok:true,mfa_verified:true,mfa_replaced:promotingPending };
}

module.exports={ audit,visits,dashboard,students,studentDetail,studentAction,
  listPaymentRequests,reviewPayment,paymentProof,grantPayment,histories,
  getPanelVersion,putPanelVersion,mfaSetup,mfaVerify,requireAdmin,requireAdminBase,
  effectiveAccountStatus,normalizeDeviceSlots,normalizeStudent,normalizeHistoryType,validatePanelPolicy,
  initiatePanelArtifact,panelArtifactStatus,putPanelArtifactChunk,finalizePanelArtifact };
