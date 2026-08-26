"use strict";

/*
 * RED-first contracts for the JSON shapes and admin filters shared by the
 * student app, download page and admin dashboard.
 *
 * Usage: node test/verify_unified_api_contracts.js
 */
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function load(relativePath, wanted) {
  try {
    const value = require(path.join(ROOT, relativePath));
    const missing = wanted.filter(name => typeof value[name] === "undefined");
    report(relativePath + " exports " + wanted.join(", "), missing.length === 0, { missing });
    return missing.length ? null : value;
  } catch (error) {
    report(relativePath + " is loadable", false, { error: String(error && error.message || error) });
    return null;
  }
}

async function verifyEntitlementShape() {
  const contract = load("server/lib/entitlements.js", ["publicEntitlement"]);
  if (!contract) return;
  const state = {
    account: { id: "student-1", name: "Student", email: "student@example.test", status: "active" },
    accountStatus: "active",
    license: {
      status: "active",
      startsAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-02-01T00:00:00.000Z",
    },
    permissions: { webAppEnabled: true, ccxDownloadEnabled: true, panelEnabled: true },
    panelVersion: { latestVersion: "6.24.0", minimumSupportedVersion: "6.24.0" },
  };
  const slots = [
    { id: "phone-slot", type: "phone", status: "active", registered: true },
    { id: "computer-slot", type: "computer", status: "active", registered: true },
  ];
  const output = contract.publicEntitlement(state, {
    web: { allowed: false, reason: "license_expired" },
    download: { allowed: false, reason: "license_expired" },
    panel: { allowed: false, reason: "license_expired" },
  }, slots);
  report("entitlement derives Expired without mutating canonical account status",
    output.account.account_status === "active" && output.account.effective_status === "expired" &&
      output.license.status === "expired",
    { account: output.account, license: output.license });
  report("entitlement exposes keyed phone/computer slots and keeps the list for compatibility",
    output.devices && output.devices.phone && output.devices.phone.id === "phone-slot" &&
      output.devices.computer && output.devices.computer.id === "computer-slot" &&
      Array.isArray(output.devices.slots) && output.devices.slots.length === 2,
    { devices: output.devices });
}

async function verifyAdminContracts() {
  const contract = load("server/lib/admin-api.js", [
    "effectiveAccountStatus", "normalizeDeviceSlots", "normalizeStudent",
    "normalizeHistoryType", "validatePanelPolicy", "requireAdmin", "mfaSetup", "mfaVerify",
  ]);
  if (!contract) return;

  const expired = contract.effectiveAccountStatus({
    account_status: "active", license_status: "active", expires_at: "2020-01-01T00:00:00.000Z",
  }, new Date("2026-08-26T00:00:00.000Z"));
  const suspended = contract.effectiveAccountStatus({
    account_status: "suspended", license_status: "active", expires_at: "2020-01-01T00:00:00.000Z",
  }, new Date("2026-08-26T00:00:00.000Z"));
  report("admin derives expired only for otherwise-active accounts",
    expired === "expired" && suspended === "suspended", { expired, suspended });

  const devices = contract.normalizeDeviceSlots([
    { id: "phone", slot_type: "phone", status: "active", label: "Pixel" },
    { id: "computer", slot_type: "computer", status: "active", label: "Studio PC" },
  ]);
  const student = contract.normalizeStudent({
    id: "student-1", account_status: "active", license_status: "active",
    starts_at: "2026-08-01T00:00:00.000Z", expires_at: "2026-09-01T00:00:00.000Z",
    web_app_enabled: true, ccx_download_enabled: false, panel_enabled: true,
  }, devices.slots, new Date("2026-08-26T00:00:00.000Z"));
  report("admin student payload has nested license, permissions and keyed devices",
    student.license && student.license.expires_at === "2026-09-01T00:00:00.000Z" &&
      student.permissions && student.permissions.web_app === true &&
      student.permissions.ccx_download === false && student.permissions.photoshop_panel === true &&
      student.devices.phone.id === "phone" && student.devices.computer.id === "computer",
    { student });

  const historyTypes = ["all", "login", "failed_login", "device", "download", "admin", "license", "account"];
  const normalized = historyTypes.map(type => contract.normalizeHistoryType(type));
  report("history API recognizes aggregate, failed-login, license and account filters",
    normalized.every((value, index) => value === historyTypes[index]), { normalized });

  let invalidType = null;
  try { contract.normalizeHistoryType("made_up"); } catch (error) { invalidType = error && error.code; }
  report("history API rejects unknown filters instead of silently showing login events",
    invalidType === "invalid_history_type", { invalidType });

  const validPolicy = contract.validatePanelPolicy({
    latest_version: "6.24.0", minimum_supported_version: "6.23.0", enabled: true,
    sha256: "a".repeat(64), size_bytes: 123,
  });
  report("enabled panel policy requires pinned integrity metadata",
    validPolicy.sha256 === "a".repeat(64) && validPolicy.sizeBytes === 123,
    { validPolicy });

  const invalidPolicies = [
    { latest_version: "6.24.0", minimum_supported_version: "6.25.0", enabled: true, sha256: "a".repeat(64), size_bytes: 123 },
    { latest_version: "6.24.0", minimum_supported_version: "6.24.0", enabled: true, size_bytes: 123 },
    { latest_version: "6.24.0", minimum_supported_version: "6.24.0", enabled: true, sha256: "a".repeat(64), size_bytes: 0 },
  ];
  const invalidCodes = invalidPolicies.map(body => {
    try { contract.validatePanelPolicy(body); return null; }
    catch (error) { return error && error.code; }
  });
  report("panel policy rejects minimum-above-latest and unpinned enabled releases",
    invalidCodes[0] === "minimum_version_newer" &&
      invalidCodes[1] === "invalid_sha256" && invalidCodes[2] === "invalid_artifact_size",
    { invalidCodes });

  let wrongClient = null;
  try {
    contract.requireAdmin({ clientType: "web", roles: ["admin"], mfaVerified: true }, "view_dashboard");
  } catch (error) { wrongClient = error && error.code; }
  let missingMfa = null;
  try {
    contract.requireAdmin({ clientType: "admin", roles: ["admin"], mfaVerified: false }, "view_dashboard");
  } catch (error) { missingMfa = error && error.code; }
  report("admin actions require both an admin-client session and current MFA",
    wrongClient === "forbidden" && missingMfa === "mfa_required", { wrongClient, missingMfa });

  const fakeClient = {
    async query(sql) {
      if (/select confirmed_at/.test(sql)) return { rows: [{ confirmed_at: new Date() }] };
      throw new Error("MFA rotation should have stopped before writing");
    },
  };
  let resetMfa = null;
  try {
    await contract.mfaSetup(fakeClient, {
      uid: "admin-1", clientType: "admin", roles: ["admin"], mfaVerified: false,
    }, {});
  } catch (error) { resetMfa = error && error.code; }
  report("password-only admin session cannot replace an enrolled TOTP secret",
    resetMfa === "mfa_required", { resetMfa });

  const limitedMfaClient={
    async query(sql) {
      if (/select encrypted_secret/.test(sql)) return {rows:[{encrypted_secret:"not-needed-while-limited"}]};
      if (/pg_advisory_xact_lock/.test(sql)) return {rows:[{}]};
      if (/count\(\*\).*mfa_failed/is.test(sql)) return {rows:[{failures:5}]};
      throw new Error("rate-limited MFA must not decrypt, update, or append attempts");
    },
  };
  const limitedMfa=await contract.mfaVerify(limitedMfaClient,{
    uid:"admin-1",sessionId:"session-1",clientType:"admin",roles:["admin"],mfaVerified:false,
  },{code:"000000"},{});
  report("MFA guesses are serialized and stop at the per-admin window limit",
    limitedMfa&&limitedMfa.ok===false&&limitedMfa.error&&
      limitedMfa.error.status===429&&limitedMfa.error.code==="mfa_rate_limited",
    {limitedMfa});

  const mfa=require(path.join(ROOT,"server/lib/mfa.js"));
  const savedMfaKey=process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY="test-mfa-encryption-key-with-at-least-32-characters";
  const oldSecret="JBSWY3DPEHPK3PXP";
  const pendingSecret="GEZDGNBVGY3TQOJQ";
  const mfaRow={
    encrypted_secret:mfa.encryptSecret(oldSecret,process.env.MFA_ENCRYPTION_KEY),
    pending_encrypted_secret:mfa.encryptSecret(pendingSecret,process.env.MFA_ENCRYPTION_KEY),
    confirmed_at:new Date(),
  };
  const verifyWith=async(identity,code)=>{
    const queries=[];
    const client={async query(sql,params){
      queries.push({sql:String(sql),params});
      if (/select encrypted_secret,pending_encrypted_secret/.test(sql)) return {rows:[mfaRow]};
      if (/count\(\*\).*mfa_failed/is.test(sql)) return {rows:[{failures:0}]};
      return {rows:[{}],rowCount:1};
    }};
    return {result:await contract.mfaVerify(client,identity,{code},{}),queries};
  };
  const passwordOnlyIdentity={uid:"admin-1",sessionId:"session-1",clientType:"admin",
    roles:["admin"],mfaVerified:false,payload:{email:"admin@example.test"}};
  const currentProof=await verifyWith(passwordOnlyIdentity,mfa.totp(oldSecret,Date.now()));
  const replacementProof=await verifyWith({...passwordOnlyIdentity,mfaVerified:true},
    mfa.totp(pendingSecret,Date.now()));
  if (savedMfaKey===undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY=savedMfaKey;
  report("an interrupted MFA replacement keeps the confirmed secret usable until pending proof promotes it",
    currentProof.result.mfa_replaced===false&&
      !currentProof.queries.some(item=>/encrypted_secret=pending_encrypted_secret/.test(item.sql))&&
      replacementProof.result.mfa_replaced===true&&
      replacementProof.queries.some(item=>/encrypted_secret=pending_encrypted_secret/.test(item.sql)),
    {current:currentProof.result,replacement:replacementProof.result});

  const stateQueries=[];
  const stateClient={
    async query(sql,params) {
      stateQueries.push({sql:String(sql),params});
      if (/select id,account_status from public\.profiles/.test(sql)) {
        return {rows:[{id:"11111111-1111-4111-8111-111111111111",account_status:"active"}],rowCount:1};
      }
      return {rows:[],rowCount:1};
    },
  };
  const adminIdentity={uid:"22222222-2222-4222-8222-222222222222",
    clientType:"admin",roles:["admin"],mfaVerified:true};
  const target="11111111-1111-4111-8111-111111111111";
  await contract.studentAction(stateClient,adminIdentity,target,{action:"suspend"},{});
  await contract.studentAction(stateClient,adminIdentity,target,{action:"activate"},{});
  const accountUpdates=stateQueries.filter(item=>/update public\.profiles set account_status=\$2 where id=\$1/.test(item.sql));
  const licenseMutation=stateQueries.find(item=>/update public\.licenses|plan_status\s*=/.test(item.sql));
  report("Suspend then Activate preserves an unexpired license as an independent control",
    accountUpdates.length===2&&!licenseMutation,
    {accountUpdates:accountUpdates.map(item=>item.params),licenseMutation:licenseMutation&&licenseMutation.sql});

  stateQueries.length=0;
  await contract.studentAction(stateClient,adminIdentity,target,{action:"force_logout"},{});
  const canonicalRevoke=stateQueries.some(item=>/update public\.sessions set revoked_at=\$2/.test(item.sql));
  const legacyRevoke=stateQueries.some(item=>/delete from public\.hnk_auth_refresh_tokens where user_id=\$1/.test(item.sql));
  report("admin force logout revokes canonical sessions and deletes every legacy refresh row",
    canonicalRevoke&&legacyRevoke,{canonicalRevoke,legacyRevoke});
}

async function main() {
  await verifyEntitlementShape();
  await verifyAdminContracts();
  if (failures) {
    console.error("\nFAIL (unified API contracts): " + failures + " check(s)");
    process.exit(1);
  }
  console.log("\nPASS (unified API contracts)");
}

main().catch(error => {
  console.error("FAIL — unified API contract test crashed", error);
  process.exit(1);
});
