"use strict";

/*
 * RED-first security contracts for panel versions, temporary CCX downloads,
 * and admin role checks.
 *
 * Required exports:
 *   server/lib/panel-versions.js
 *     { evaluatePanelVersion(input) }
 *   server/lib/panel-download.js
 *     { createDownloadTokenService(options) }
 *   server/lib/admin.js
 *     { authorizeAdminAction(input), ADMIN_ACTIONS }
 *
 * createDownloadTokenService receives the repository implemented below. Its
 * public methods are issue({userId,panelVersion,artifactKey}) and
 * consume({token}). A denial may be returned as {allowed:false,reason} or
 * thrown with the same machine-readable `code`.
 *
 * Usage: node test/verify_unified_security.js
 */
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function loadContract(relativePath, exportsWanted) {
  try {
    const loaded = require(path.join(ROOT, relativePath));
    const missing = exportsWanted.filter(name => typeof loaded[name] === "undefined");
    report(relativePath + " exports " + exportsWanted.join(", "), missing.length === 0, { missing });
    return missing.length ? null : loaded;
  } catch (error) {
    report(relativePath + " is loadable", false, {
      error: error && error.code === "MODULE_NOT_FOUND"
        ? "missing module: " + relativePath
        : String(error && error.message || error),
    });
    return null;
  }
}

function reasonOf(value) {
  return value && (value.reason || value.code ||
    (value.error && (value.error.reason || value.error.code))) || null;
}

async function denied(call) {
  try {
    const result = await call();
    if (result && (result.allowed === false || result.ok === false)) return reasonOf(result);
    return null;
  } catch (error) {
    return reasonOf(error);
  }
}

function toMilliseconds(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}

function createDownloadRepository() {
  const rows = [];
  let sequence = 0;
  const copy = value => value ? Object.assign({}, value) : null;
  return {
    rows,
    async create(row) {
      const saved = Object.assign({ id: "download-" + (++sequence), downloadedAt: null }, row);
      rows.push(saved);
      return copy(saved);
    },
    async findByTokenHash(tokenHash) {
      return copy(rows.find(row => row.tokenHash === tokenHash));
    },
    /* PostgreSQL adapter contract: one conditional UPDATE owns replay safety.
     * UPDATE ... SET downloaded_at=$now
     * WHERE token_hash=$hash AND downloaded_at IS NULL RETURNING * */
    async consumeIfUnused(tokenHash, downloadedAt) {
      const row = rows.find(item => item.tokenHash === tokenHash && !item.downloadedAt);
      if (!row) return null;
      row.downloadedAt = downloadedAt;
      return copy(row);
    },
  };
}

async function verifyPanelVersions() {
  const contract = loadContract("server/lib/panel-versions.js", ["evaluatePanelVersion"]);
  if (!contract) return;

  const cases = [
    {
      name: "the supported 6.24.0 release opens",
      input: { installedVersion: "6.24.0", minimumSupportedVersion: "6.24.0", latestVersion: "6.24.0", enabled: true },
      expected: { allowed: true, reason: "allowed", updateRequired: false },
    },
    {
      name: "a release below 6.24.0 is forced to update",
      input: { installedVersion: "6.23.10", minimumSupportedVersion: "6.24.0", latestVersion: "6.24.0", enabled: true },
      expected: { allowed: false, reason: "update_required", updateRequired: true },
    },
    {
      name: "an explicitly disabled release is blocked",
      input: { installedVersion: "6.24.0", minimumSupportedVersion: "6.24.0", latestVersion: "6.24.0", enabled: false },
      expected: { allowed: false, reason: "version_blocked", updateRequired: false },
    },
    {
      name: "semantic versions compare numerically, not lexically",
      input: { installedVersion: "6.24.0", minimumSupportedVersion: "6.9.0", latestVersion: "6.24.0", enabled: true },
      expected: { allowed: true, reason: "allowed", updateRequired: false },
    },
  ];

  for (const item of cases) {
    let output;
    let error = null;
    try { output = await contract.evaluatePanelVersion(item.input); }
    catch (caught) { error = String(caught && caught.message || caught); }
    report("panel version gate: " + item.name,
      !error && output && output.allowed === item.expected.allowed &&
        output.reason === item.expected.reason && output.updateRequired === item.expected.updateRequired &&
        output.latestVersion === item.input.latestVersion,
      { expected: Object.assign({ latestVersion: item.input.latestVersion }, item.expected), output, error });
  }
}

async function verifyDownloads() {
  const contract = loadContract("server/lib/panel-download.js", ["createDownloadTokenService","createDownloadStreamLifecycle"]);
  if (!contract) return;

  const repository = createDownloadRepository();
  let nowMs = Date.parse("2026-08-26T00:00:00.000Z");
  let sequence = 0;
  const service = contract.createDownloadTokenService({
    repository,
    clock: () => new Date(nowMs),
    secret: "test-only-download-signing-secret-that-is-long-enough",
    randomToken: () => "download-nonce-" + (++sequence),
    /* Deliberately unsafe input: the service must clamp it to five minutes. */
    ttlSeconds: 600,
  });

  const request = {
    userId: "33333333-3333-4333-8333-333333333333",
    panelVersion: "6.24.0",
    artifactKey: "private/panel/HNK_Ai_Panel_v6.24.0.ccx",
  };
  const issued = await service.issue(request);
  const expiryDelta = issued ? toMilliseconds(issued.expiresAt) - nowMs : NaN;
  const persisted = repository.rows[0];
  report("download issuance returns a signed token capped at 300 seconds and stores only its hash",
    issued && typeof issued.token === "string" && issued.token.length >= 32 &&
      expiryDelta > 0 && expiryDelta <= 300000 && persisted && persisted.tokenHash &&
      !JSON.stringify(persisted).includes(issued.token),
    { issued: issued && { tokenLength: issued.token.length, expiresAt: issued.expiresAt }, expiryDelta, persisted });

  const inspected=service.inspect({token:issued.token});
  report("a signed token exposes its bound user for fair-capacity checks without consuming it",
    inspected&&inspected.allowed===true&&inspected.userId===request.userId&&
      persisted.downloadedAt===null,{inspected,downloadedAt:persisted.downloadedAt});

  const consumed = await service.consume({ token: issued.token });
  const replayReason = await denied(() => service.consume({ token: issued.token }));
  report("a valid download token reveals its private artifact once and rejects replay",
    consumed && consumed.allowed === true && consumed.userId === request.userId &&
      consumed.panelVersion === request.panelVersion && consumed.artifactKey === request.artifactKey &&
      replayReason === "download_token_replayed",
    { consumed, replayReason });

  const tampered = issued.token.slice(0, -1) + (issued.token.endsWith("a") ? "b" : "a");
  const tamperReason = await denied(() => service.consume({ token: tampered }));
  report("changing one character invalidates a signed download token",
    tamperReason === "invalid_download_token", { tamperReason });

  const expiring = await service.issue(request);
  nowMs += 300001;
  const expiryReason = await denied(() => service.consume({ token: expiring.token }));
  report("a download token cannot be consumed after the five-minute window",
    expiryReason === "download_token_expired", { expiryReason });

  const outcomes=[];let cleanups=0;
  const completed=contract.createDownloadStreamLifecycle({
    complete:async (result,reason)=>outcomes.push({result,reason}),
    cleanup:async()=>{cleanups++;},
  });
  await Promise.all([completed.finish(),completed.abort("stream_aborted")]);
  const abortedOutcomes=[];
  const aborted=contract.createDownloadStreamLifecycle({
    complete:async (result,reason)=>abortedOutcomes.push({result,reason}),cleanup:async()=>{},
  });
  await Promise.all([aborted.abort("stream_error"),aborted.finish()]);
  report("stream completion is one-shot across finish/close races and records aborts",
    outcomes.length===1&&outcomes[0].result==="downloaded"&&cleanups===1&&
      abortedOutcomes.length===1&&abortedOutcomes[0].result==="failed"&&
      abortedOutcomes[0].reason==="stream_error",
    {outcomes,cleanups,abortedOutcomes});
}

function actionValues(actions) {
  if (Array.isArray(actions)) return actions;
  if (actions instanceof Set) return [...actions];
  if (actions && typeof actions === "object") return Object.values(actions);
  return [];
}

async function verifyAdminRbac() {
  const contract = loadContract("server/lib/admin.js", ["authorizeAdminAction", "ADMIN_ACTIONS"]);
  if (!contract) return;

  const requiredActions = [
    "view_dashboard", "list_students", "approve", "reject", "activate", "suspend", "ban",
    "extend_license", "change_expiry", "reset_phone", "reset_computer", "force_logout",
    "set_web_app_enabled", "set_ccx_download_enabled", "set_panel_enabled", "password_reset",
    "view_login_history", "view_device_history", "view_download_history", "manage_panel_versions",
    "set_devices",
  ];
  const published = actionValues(contract.ADMIN_ACTIONS);
  report("admin action registry covers every specified control and history view",
    requiredActions.every(action => published.includes(action)),
    { required: requiredActions, published });

  const targetUserId = "44444444-4444-4444-8444-444444444444";
  const student = { userId: "55555555-5555-4555-8555-555555555555", roles: ["student"], mfaVerified: true };
  const admin = { userId: "66666666-6666-4666-8666-666666666666", roles: ["admin"], mfaVerified: true };
  const adminWithoutMfa = Object.assign({}, admin, { mfaVerified: false });

  const studentResults = await Promise.all(requiredActions.map(action =>
    contract.authorizeAdminAction({ actor: student, action, targetUserId, requireMfa: true })));
  report("a student is denied every admin dashboard action even when they know the URL",
    studentResults.every(result => result && result.allowed === false && result.reason === "forbidden"),
    { unexpected: requiredActions.filter((_, index) => !studentResults[index] || studentResults[index].allowed !== false) });

  const adminResults = await Promise.all(requiredActions.map(action =>
    contract.authorizeAdminAction({ actor: admin, action, targetUserId, requireMfa: true })));
  report("an MFA-verified admin may perform every registered action and each action requires audit",
    adminResults.every(result => result && result.allowed === true && result.reason === "allowed" && result.auditRequired === true),
    { unexpected: requiredActions.filter((_, index) => {
      const result = adminResults[index];
      return !result || result.allowed !== true || result.auditRequired !== true;
    }) });

  const mfaDenied = await contract.authorizeAdminAction({
    actor: adminWithoutMfa, action: "ban", targetUserId, requireMfa: true,
  });
  report("an admin session without the required second factor cannot perform a high-risk action",
    mfaDenied && mfaDenied.allowed === false && mfaDenied.reason === "mfa_required" &&
      mfaDenied.auditRequired === true,
    { mfaDenied });

  const unknown = await contract.authorizeAdminAction({
    actor: admin, action: "read_plaintext_password", targetUserId, requireMfa: true,
  });
  report("an unregistered admin action fails closed",
    unknown && unknown.allowed === false && unknown.reason === "unknown_action",
    { unknown });
}

(async () => {
  await verifyPanelVersions();
  await verifyDownloads();
  await verifyAdminRbac();
})().catch(error => {
  report("security contract runner completes", false, { error: error && error.stack || String(error) });
}).finally(() => {
  console.log("\n" + (failures ? "FAIL (" + failures + ")" : "PASS (unified security contract)"));
  process.exit(failures ? 1 : 0);
});
