"use strict";

const crypto = require("crypto");
const { evaluateAuthorization } = require("./authorization");
const { createDeviceRegistry, createPgDeviceRepository } = require("./devices");

const REQUIRED_SECURITY_SECRETS=Object.freeze([
  "MFA_ENCRYPTION_KEY","DEVICE_ID_HASH_SECRET","DEVICE_PAIRING_SECRET",
  "CCX_DOWNLOAD_SECRET","PANEL_LEASE_SECRET",
]);

function securitySecretStatus() {
  const missing=REQUIRED_SECURITY_SECRETS.filter(name=>
    Buffer.byteLength(String(process.env[name]||""),"utf8")<32);
  const owners=new Map();
  for (const name of REQUIRED_SECURITY_SECRETS) {
    const value=String(process.env[name]||"");
    if (Buffer.byteLength(value,"utf8")<32) continue;
    const fingerprint=crypto.createHash("sha256").update(value,"utf8").digest("hex");
    if (!owners.has(fingerprint)) owners.set(fingerprint,[]);
    owners.get(fingerprint).push(name);
  }
  const jwt=String(process.env.JWT_SECRET||"");
  if (Buffer.byteLength(jwt,"utf8")>=32) {
    const fingerprint=crypto.createHash("sha256").update(jwt,"utf8").digest("hex");
    if (owners.has(fingerprint)) owners.get(fingerprint).push("JWT_SECRET");
  }
  const duplicates=[...owners.values()].filter(group=>group.length>1);
  return {ready:missing.length===0&&duplicates.length===0,missing,duplicates};
}

function requireSecret(name, fallback, minimum) {
  const allowDerived=process.env.ALLOW_DERIVED_SECURITY_SECRETS === "1";
  const value = String(process.env[name] || (allowDerived ? fallback : "") || "");
  if (value.length < (minimum || 32)) {
    const error = new Error(name + " must contain at least " + (minimum || 32) + " characters");
    error.status = 503;
    error.code = "security_configuration_missing";
    throw error;
  }
  return value;
}

function hashInstallationId(value) {
  const id = String(value || "");
  if (!id || id.length > 500) {
    const error = new Error("A valid installation_id is required");
    error.status = 400;
    error.code = "invalid_installation_id";
    throw error;
  }
  const secret = requireSecret("DEVICE_ID_HASH_SECRET", process.env.JWT_SECRET, 32);
  return crypto.createHmac("sha256", secret).update(id, "utf8").digest("hex");
}

function deviceRegistry(client) {
  return createDeviceRegistry({
    repository: createPgDeviceRepository(client),
    pairingSecret: requireSecret("DEVICE_PAIRING_SECRET", process.env.JWT_SECRET, 32),
    pairingTtlSeconds: 300,
    /* 72 bits makes online guessing infeasible even before one-time consume;
       six decimal digits did not. base64url remains easy to paste in UXP. */
    randomToken: () => crypto.randomBytes(9).toString("base64url"),
    hashInstallationId,
  });
}

const iso = value => value ? new Date(value).toISOString() : null;

async function loadEntitlementState(client, userId, options) {
  const input = options || {};
  const { rows } = await client.query(
    `select p.id,p.name,coalesce(p.email,u.email) as email,p.account_status,p.is_admin,
            l.status as license_status,l.starts_at,l.expires_at,
            a.web_app_enabled,a.ccx_download_enabled,a.panel_enabled
       from public.hnk_auth_users u
       left join public.profiles p on p.id=u.id
       left join public.licenses l on l.user_id=u.id
       left join public.app_permissions a on a.user_id=u.id
      where u.id=$1`, [userId]);
  if (!rows.length || !rows[0].id) {
    const error = new Error("Account profile is unavailable");
    error.status = 403;
    error.code = "profile_missing";
    throw error;
  }
  const row = rows[0];

  const releases = await client.query(
    `select version,is_latest,minimum_supported,enabled,artifact_key,sha256,size_bytes,released_at
       from public.panel_versions
      where is_latest or minimum_supported or version=$1
      order by released_at desc`, [input.panelVersion || ""]);
  const latest = releases.rows.find(item => item.is_latest) || null;
  const minimum = releases.rows.find(item => item.minimum_supported) || latest;
  const installed = releases.rows.find(item => item.version === input.panelVersion) || null;

  let installation = null;
  if (input.installationHash && input.clientType) {
    const found = await client.query(
      `select i.id,i.client_type,i.installation_hash,i.last_seen_at,
              s.id as slot_id,s.slot_type,s.status,s.generation,s.label
         from public.device_installations i
         join public.device_slots s on s.id=i.slot_id
        where s.user_id=$1 and s.status='active' and i.client_type=$2
          and i.installation_hash=$3 and i.revoked_at is null`,
      [userId,input.clientType,input.installationHash]);
    installation = found.rows[0] || null;
  }

  return {
    account: { id:row.id,name:row.name,email:row.email,status:row.account_status,isAdmin:!!row.is_admin },
    accountStatus: row.account_status,
    license: row.license_status ? {
      status:row.license_status,startsAt:iso(row.starts_at),expiresAt:iso(row.expires_at),
    } : null,
    permissions: {
      webAppEnabled: row.web_app_enabled === true,
      ccxDownloadEnabled: row.ccx_download_enabled === true,
      panelEnabled: row.panel_enabled === true,
    },
    device: installation ? {
      registered:true,matches:true,slotType:installation.slot_type,slotId:installation.slot_id,
      installationId:installation.id,generation:installation.generation,label:installation.label,
    } : null,
    panelVersion: {
      installedVersion: input.panelVersion || latest && latest.version || "",
      minimumSupportedVersion: minimum && minimum.version || "",
      latestVersion: latest && latest.version || "",
      enabled: !!installed && installed.enabled === true,
      artifactKey: latest && latest.artifact_key || null,
      sha256: latest && latest.sha256 || null,
      sizeBytes: latest && latest.size_bytes || null,
    },
  };
}

function authorizeState(state, capability, deviceOverride) {
  return evaluateAuthorization({
    now: new Date().toISOString(),
    accountStatus: state.accountStatus,
    license: state.license,
    permissions: state.permissions,
    capability,
    device: deviceOverride === undefined ? state.device : deviceOverride,
    panelVersion: state.panelVersion,
  });
}

function normalizeDeviceSlots(slots) {
  const list = Array.isArray(slots) ? slots.map(slot => {
    const item = Object.assign({}, slot || {});
    const type = item.slot_type || item.type || null;
    item.type = type;
    item.slot_type = type;
    item.registered = item.registered === true || item.status === "active";
    return item;
  }) : [];
  const active = type => list.find(slot => slot.type === type && slot.registered === true) || null;
  return { phone:active("phone"),computer:active("computer"),slots:list };
}

function publicEntitlement(state, decisions, slots) {
  const now = Date.now();
  const license = state.license;
  let effective = "missing";
  if (license) {
    if (license.status !== "active") effective = "revoked";
    else if (new Date(license.startsAt).getTime() > now) effective = "not_started";
    else if (new Date(license.expiresAt).getTime() <= now) effective = "expired";
    else effective = "active";
  }
  const effectiveAccountStatus = state.account.status === "active" && effective === "expired"
    ? "expired" : state.account.status;
  return {
    account: {
      id:state.account.id,name:state.account.name,email:state.account.email,
      account_status:state.account.status,effective_status:effectiveAccountStatus,
      approved:state.account.status === "active",
    },
    license: license ? {
      status:effective,start_at:license.startsAt,expires_at:license.expiresAt,
      active:effective === "active",
    } : { status:"missing",start_at:null,expires_at:null,active:false },
    permissions: {
      web_app:state.permissions.webAppEnabled,
      ccx_download:state.permissions.ccxDownloadEnabled,
      photoshop_panel:state.permissions.panelEnabled,
    },
    devices: normalizeDeviceSlots(slots),
    panel: {
      latest_version:state.panelVersion.latestVersion,
      minimum_supported_version:state.panelVersion.minimumSupportedVersion,
    },
    allowed: {
      web_app:!!(decisions.web && decisions.web.allowed),
      ccx_download:!!(decisions.download && decisions.download.allowed),
      panel:!!(decisions.panel && decisions.panel.allowed),
    },
    reasons: {
      web_app:decisions.web && decisions.web.reason,
      ccx_download:decisions.download && decisions.download.reason,
      panel:decisions.panel && decisions.panel.reason,
    },
  };
}

async function listDeviceSlots(client, userId) {
  const { rows } = await client.query(
    `select s.id,s.slot_type,s.status,s.generation,s.label,s.created_at,s.updated_at,s.reset_at,
            count(i.id) filter (where i.revoked_at is null)::int as installations
       from public.device_slots s left join public.device_installations i on i.slot_id=s.id
      where s.user_id=$1 group by s.id order by s.slot_type`, [userId]);
  return rows.map(row => ({
    id:row.id,type:row.slot_type,status:row.status,generation:row.generation,label:row.label,
    registered:row.status === "active",installations:row.installations,
    created_at:iso(row.created_at),last_active_at:iso(row.updated_at),reset_at:iso(row.reset_at),
  }));
}

module.exports = {
  REQUIRED_SECURITY_SECRETS,securitySecretStatus,requireSecret,hashInstallationId,deviceRegistry,loadEntitlementState,
  authorizeState, publicEntitlement, listDeviceSlots, normalizeDeviceSlots,
};
