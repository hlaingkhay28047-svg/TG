"use strict";

/*
 * RED-first schema contract for the HNK unified account/license system.
 *
 * This intentionally checks the deployable SQL rather than a hand-maintained
 * inventory.  The new model must be additive: the four legacy application
 * tables and the compatibility columns used by the current web app stay in
 * place while the canonical account, role, license, device, session, history,
 * permission, download and panel-version records are introduced.
 *
 * Usage: node test/verify_unified_schema.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCHEMA_PATHS = [
  { dialect: "native", file: path.join(ROOT, "supabase", "schema.sql") },
  { dialect: "roleless", file: path.join(ROOT, "server", "sql", "schema.sql") },
];

const CANONICAL = {
  roles: ["id", "name"],
  user_roles: ["user_id", "role_id"],
  licenses: ["user_id", "status", "starts_at", "expires_at"],
  app_permissions: ["user_id", "web_app_enabled", "ccx_download_enabled", "panel_enabled"],
  device_slots: ["id", "user_id", "slot_type", "status", "generation"],
  device_installations: ["id", "slot_id", "client_type", "installation_hash", "revoked_at"],
  device_pairing_codes: ["id", "user_id", "slot_id", "code_hash", "expires_at", "consumed_at"],
  device_history: ["id", "user_id", "device_slot_id", "event_type", "created_at"],
  sessions: ["id", "user_id", "client_type", "refresh_token_hash", "expires_at", "revoked_at"],
  login_history: ["id", "user_id", "event_type", "occurred_at", "client_type", "success"],
  download_history: ["id", "user_id", "panel_version", "token_hash", "issued_at", "downloaded_at"],
  admin_audit_logs: ["id", "actor_user_id", "target_user_id", "action", "created_at", "details",
    "mutation_id", "request_hash", "result", "completed_at"],
  admin_mfa: ["user_id", "encrypted_secret", "pending_encrypted_secret", "confirmed_at"],
  auth_attempts: ["id", "operation", "occurred_at", "ip_hash", "email_hash"],
  panel_versions: ["version", "is_latest", "minimum_supported", "enabled", "artifact_key", "sha256", "artifact_id"],
  panel_artifacts: ["id", "version", "artifact_key", "expected_sha256", "expected_size_bytes", "chunk_size_bytes", "chunk_count", "status"],
  panel_artifact_chunks: ["artifact_id", "chunk_index", "data", "size_bytes", "sha256"],
};

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function withoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ");
}

function tableBody(sql, table) {
  const start = new RegExp(
    "create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?" +
      table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(", "i").exec(sql);
  if (!start) return null;
  const open = start.index + start[0].lastIndexOf("(");
  let depth = 0;
  let quoted = false;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (ch === "(") depth++;
    if (ch === ")" && --depth === 0) return sql.slice(open + 1, i);
  }
  return null;
}

function topLevelParts(body) {
  if (body === null) return [];
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" && body[i - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function columnsFor(sql, table) {
  const ignored = new Set(["constraint", "primary", "foreign", "unique", "check", "exclude"]);
  const names = new Set();
  for (const part of topLevelParts(tableBody(sql, table))) {
    const match = /^\s*"?([a-z_][a-z0-9_]*)"?\s+/i.exec(part);
    if (match && !ignored.has(match[1].toLowerCase())) names.add(match[1].toLowerCase());
  }
  /* Additive migrations commonly preserve an old CREATE TABLE and append new
   * columns with ALTER TABLE.  Those are just as real as inline columns and
   * must count here; otherwise this contract would report a false regression
   * for the legacy compatibility fields it is meant to protect. */
  const altered = new RegExp(
    "alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?" + table +
      "\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?\"?([a-z_][a-z0-9_]*)\"?\\b",
    "gi");
  let match;
  while ((match = altered.exec(sql))) names.add(match[1].toLowerCase());
  return names;
}

function missingColumns(sql, table, wanted) {
  const columns = columnsFor(sql, table);
  return wanted.filter(column => !columns.has(column));
}

function hasRls(sql, table) {
  return new RegExp(
    "alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?" + table +
      "\\s+enable\\s+row\\s+level\\s+security", "i").test(sql);
}

function hasForceRls(sql, table) {
  return new RegExp(
    "alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?" + table +
      "\\s+force\\s+row\\s+level\\s+security", "i").test(sql);
}

function canonicalSection(sql) {
  const marker = sql.indexOf("-- 10. unified accounts");
  return marker < 0 ? "" : sql.slice(marker);
}

function policyBody(sql, name) {
  const match = new RegExp(
    "create\\s+policy\\s+" + name + "\\s+on\\s+[^;]+;", "i").exec(sql);
  return match ? match[0] : "";
}

function functionDefinition(sql, name) {
  const start = sql.search(new RegExp(
    "create\\s+or\\s+replace\\s+function\\s+public\\." + name + "\\s*\\(", "i"));
  if (start < 0) return "";
  const tail = sql.slice(start);
  const end = tail.search(new RegExp(
    "revoke\\s+all\\s+on\\s+function\\s+public\\." + name + "\\s*\\(", "i"));
  return end < 0 ? tail : tail.slice(0, end);
}

const source = SCHEMA_PATHS.map(item => ({
  ...item,
  exists: fs.existsSync(item.file),
  raw: fs.existsSync(item.file) ? fs.readFileSync(item.file, "utf8") : "",
}));

for (const item of source) {
  report("schema artifact exists: " + path.relative(ROOT, item.file), item.exists, { file: item.file });
}

if (source.every(item => item.exists)) {
  const native = withoutComments(canonicalSection(source.find(item => item.dialect === "native").raw));
  const roleless = withoutComments(canonicalSection(source.find(item => item.dialect === "roleless").raw));
  report("canonical foreign keys use each platform's authoritative identity table",
    /references\s+auth\.users\s*\(/i.test(native) && !/public\.hnk_auth_users/i.test(native) &&
      /references\s+public\.hnk_auth_users\s*\(/i.test(roleless) && !/\bauth\.users\b/i.test(roleless),
    { nativeIdentity: "auth.users", rolelessIdentity: "public.hnk_auth_users" });
  report("roleless canonical SQL has no native schema or missing request-role dependency",
    !/\b(?:auth|storage)\./i.test(roleless) && !/\b(?:anon|authenticated)\b/i.test(roleless),
    { expected: "public-only objects and hnk_request_role service context" });
}

/* Run every semantic assertion against both copies so a deploy cannot pass on
 * the source schema while shipping an old packaged copy. */
for (const item of source.filter(entry => entry.exists)) {
  const label = path.relative(ROOT, item.file);
  const sql = withoutComments(item.raw);

  const legacyTables = ["profiles", "payment_requests", "app_settings", "devices"];
  const missingLegacyTables = legacyTables.filter(table => tableBody(sql, table) === null);
  report(label + " preserves all four legacy application tables",
    missingLegacyTables.length === 0, { missing: missingLegacyTables });

  const legacyProfileColumns = ["is_admin", "plan_status", "plan_expires_at", "allowed_devices"];
  report(label + " preserves legacy profile compatibility columns",
    missingColumns(sql, "profiles", legacyProfileColumns).length === 0,
    { missing: missingColumns(sql, "profiles", legacyProfileColumns) });

  const legacyDeviceColumns = ["id", "user_id", "device_id"];
  report(label + " preserves legacy device compatibility columns",
    missingColumns(sql, "devices", legacyDeviceColumns).length === 0,
    { missing: missingColumns(sql, "devices", legacyDeviceColumns) });

  const canonical = CANONICAL;

  const missingTables = Object.keys(canonical).filter(table => tableBody(sql, table) === null);
  report(label + " defines every canonical unified-system table",
    missingTables.length === 0, { missing: missingTables });

  const incomplete = [];
  for (const [table, wanted] of Object.entries(canonical)) {
    if (tableBody(sql, table) === null) continue;
    const missing = missingColumns(sql, table, wanted);
    if (missing.length) incomplete.push({ table, missing });
  }
  report(label + " gives canonical tables the enforcement fields used by the backend",
    incomplete.length === 0, incomplete);

  const profile = (tableBody(sql, "profiles") || "").toLowerCase();
  /* Expiry is deliberately NOT persisted as an account state. It is derived
   * from the authoritative license timestamp so the same account cannot be
   * both "active" and "expired" in two competing columns. */
  const accountStates = ["pending", "active", "suspended", "banned", "rejected"];
  report(label + " constrains profiles.account_status while deriving expiry from licenses",
    columnsFor(sql, "profiles").has("account_status") &&
      accountStates.every(state => profile.includes("'" + state + "'")) &&
      !profile.includes("'expired'"),
    { persistedStates: accountStates, forbiddenPersistedState: "expired",
      hasColumn: columnsFor(sql, "profiles").has("account_status") });

  const license = (tableBody(sql, "licenses") || "").toLowerCase();
  report(label + " rejects a license whose expiry is not after its start",
    /check\s*\([^)]*expires_at\s*>\s*starts_at[^)]*\)/i.test(license),
    { expected: "CHECK (expires_at > starts_at)" });

  const slots = (tableBody(sql, "device_slots") || "").toLowerCase();
  report(label + " models exactly the phone and shared-computer slot types",
    ["phone", "computer"].every(kind => slots.includes("'" + kind + "'")),
    { expectedSlotTypes: ["phone", "computer"] });

  const compact = sql.replace(/\s+/g, " ");
  const uniqueSlot = /unique\s*(?:index[^;]*?on\s+(?:public\.)?device_slots\s*)?\(\s*user_id\s*,\s*slot_type\s*\)/i.test(compact) ||
    /unique\s*\(\s*user_id\s*,\s*slot_type\s*\)/i.test(slots);
  report(label + " enforces one slot of each type per account at the database boundary",
    uniqueSlot, { expected: "UNIQUE (user_id, slot_type)" });

  const installations = (tableBody(sql, "device_installations") || "").toLowerCase();
  report(label + " permits web and panel installations to share one computer slot",
    ["web", "panel"].every(client => installations.includes("'" + client + "'")),
    { expectedClientTypes: ["web", "panel"] });

  const sessions = columnsFor(sql, "sessions");
  report(label + " stores only a refresh-token hash in canonical sessions",
    sessions.has("refresh_token_hash") && !sessions.has("refresh_token"),
    { columns: [...sessions].sort() });

  const rlsTables = Object.keys(canonical);
  const withoutRls = rlsTables.filter(table => tableBody(sql, table) !== null && !hasRls(sql, table));
  report(label + " enables RLS on every canonical public table",
    missingTables.length === 0 && withoutRls.length === 0,
    { missingTables, withoutRls });

  report(label + " idempotently allows MFA failures in login history",
    /drop\s+constraint\s+if\s+exists\s+login_history_event_type_check/i.test(sql) &&
      /add\s+constraint\s+login_history_event_type_check\s+check\s*\([^;]*'mfa_failed'/i.test(sql),
    { expected: "named login_history_event_type_check including mfa_failed" });
  report(label + " indexes failed-login protection by IP and time",
    /create\s+index\s+if\s+not\s+exists\s+login_history_failed_ip_idx\s+on\s+public\.login_history\s*\(\s*ip_hash\s*,\s*occurred_at\s+desc\s*\)\s*where\s+success\s*=\s*false/i.test(sql),
    { expected: "login_history_failed_ip_idx" });
  report(label + " indexes MFA failures by user and time",
    /create\s+index\s+if\s+not\s+exists\s+login_history_mfa_failed_user_idx\s+on\s+public\.login_history\s*\(\s*user_id\s*,\s*occurred_at\s+desc\s*\)\s*where\s+success\s*=\s*false\s+and\s+event_type\s*=\s*'mfa_failed'/i.test(sql),
    { expected: "login_history_mfa_failed_user_idx" });
  report(label + " indexes each user's active panel stream gate",
    /create\s+index\s+if\s+not\s+exists\s+download_history_streaming_user_idx\s+on\s+public\.download_history\s*\(\s*user_id\s*,\s*downloaded_at\s+desc\s*\)\s*where\s+result\s*=\s*'streaming'/i.test(sql),
    { expected: "download_history_streaming_user_idx" });

  report(label + " constrains and indexes durable public/password throttles",
    /drop\s+constraint\s+if\s+exists\s+auth_attempts_operation_check/i.test(sql) &&
      /add\s+constraint\s+auth_attempts_operation_check\s+check\s*\([^;]*'signup'[^;]*'login'[^;]*'login_admission'[^;]*'recover'[^;]*'recovery_probe'[^;]*'password_change'/i.test(sql) &&
      /auth_attempts_operation_ip_time_idx\s+on\s+public\.auth_attempts\s*\(\s*operation\s*,\s*ip_hash\s*,\s*occurred_at\s+desc/i.test(sql) &&
      /auth_attempts_operation_email_ip_time_idx\s+on\s+public\.auth_attempts\s*\(\s*operation\s*,\s*email_hash\s*,\s*ip_hash\s*,\s*occurred_at\s+desc/i.test(sql) &&
      /auth_attempts_operation_email_time_idx\s+on\s+public\.auth_attempts\s*\(\s*operation\s*,\s*email_hash\s*,\s*occurred_at\s+desc\s*\)\s*where\s+email_hash\s+is\s+not\s+null/i.test(sql) &&
      /auth_attempts_operation_time_idx\s+on\s+public\.auth_attempts\s*\(\s*operation\s*,\s*occurred_at\s+desc/i.test(sql) &&
      /auth_attempts_occurred_at_idx\s+on\s+public\.auth_attempts\s*\(\s*occurred_at\s*\)/i.test(sql),
    { expected: "named signup/recover/password_change check plus operation/IP, partial email, operation/time and cleanup indexes" });

  const adminSync = functionDefinition(sql, "hnk_sync_admin_role_from_profile");
  report(label + " reconciles profile admin flags into RBAC and revokes sessions on demotion",
    /delete\s+from\s+public\.user_roles[\s\S]*?r\.name\s*=\s*'admin'[\s\S]*?p\.is_admin\s*=\s*true/i.test(sql) &&
      /insert\s+into\s+public\.user_roles[\s\S]*?p\.is_admin\s*=\s*true[\s\S]*?on\s+conflict/i.test(sql) &&
      /after\s+insert\s+or\s+update\s+of\s+is_admin\s+on\s+public\.profiles/i.test(sql) &&
      /delete\s+from\s+public\.user_roles/i.test(adminSync) &&
      /update\s+public\.sessions[\s\S]*?revoked_at\s*=\s*now\s*\(\s*\)/i.test(adminSync),
    { expected: "idempotent admin-role reconcile + profile trigger + session revocation" });
  if (item.dialect === "roleless") {
    report(label + " invalidates roleless refresh tokens on admin demotion",
      /delete\s+from\s+public\.hnk_auth_refresh_tokens\s+where\s+user_id\s*=\s*new\.id/i.test(adminSync),
      { expected: "delete hnk_auth_refresh_tokens for demoted profile" });
  } else {
    report(label + " keeps native RBAC trigger free of roleless identity tables",
      !/hnk_auth_refresh_tokens/i.test(adminSync),
      { expected: "native sessions only; platform owns native refresh tokens" });
  }

  const ownPolicies = ["profiles_select_own", "profiles_update_own", "payreq_select_own",
    "devices_all_own", "proofs_read_own"];
  const missingOwnPolicies = ownPolicies.filter(name => !policyBody(sql, name));
  const adminBearingOwnPolicies = ownPolicies.filter(name => /hnk_is_admin/i.test(policyBody(sql, name)));
  report(label + " legacy bearer policies never grant cross-account browser administration",
    missingOwnPolicies.length === 0 && adminBearingOwnPolicies.length === 0 &&
      !policyBody(sql, "payreq_update_admin_only") &&
      !policyBody(sql, "payreq_insert_admin_grant"),
    { missingOwnPolicies, adminBearingOwnPolicies,
      directPaymentUpdate: Boolean(policyBody(sql, "payreq_update_admin_only")),
      browserAdminGrant: Boolean(policyBody(sql, "payreq_insert_admin_grant")) });

  if (item.dialect === "roleless") {
    const withoutForce = Object.keys(canonical).filter(table => !hasForceRls(sql, table));
    const missingServicePolicy = Object.keys(canonical).filter(table => {
      const body = policyBody(sql, table + "_service_all");
      return !body || !/for\s+all\s+to\s+public/i.test(body) ||
        !/hnk_request_role\s*\(\s*\)\s*=\s*'service_role'/i.test(body);
    });
    report(label + " FORCEs canonical RLS and admits only server service context",
      withoutForce.length === 0 && missingServicePolicy.length === 0,
      { withoutForce, missingServicePolicy });
  } else {
    const canonicalOwnPolicies = ["user_roles_read_own", "licenses_read_own",
      "permissions_read_own", "device_slots_read_own",
      "device_installations_read_own", "login_history_read_own",
      "download_history_read_own", "device_history_read_own"];
    const missingCanonicalOwn = canonicalOwnPolicies.filter(name => !policyBody(sql, name));
    const canonicalAdminBypass = canonicalOwnPolicies.filter(name =>
      /hnk_is_admin/i.test(policyBody(sql, name)));
    report(label + " canonical student policies are own-read only",
      missingCanonicalOwn.length === 0 && canonicalAdminBypass.length === 0,
      { missingCanonicalOwn, canonicalAdminBypass });
    report(label + " exposes no browser policy for authentication attempts",
      !/create\s+policy\s+\w+\s+on\s+public\.auth_attempts/i.test(sql),
      { expected: "service-owned table with no anon/authenticated policy" });
  }
}

const migrate = fs.readFileSync(path.join(ROOT, "server", "lib", "migrate.js"), "utf8");
report("startup migration verifies FORCE RLS before publishing its schema fingerprint",
  /REQUIRED_FORCE_RLS_TABLES/.test(migrate) && /relforcerowsecurity/.test(migrate) &&
    /schema applied but only[^\n]+FORCE RLS/i.test(migrate) &&
    ["hnk_auth_users", "hnk_auth_refresh_tokens", "hnk_storage_buckets", "hnk_storage_objects"]
      .every(table => new RegExp('["\\\']' + table + '["\\\']').test(migrate)),
  { expected: "application plus platform auth/storage relrowsecurity + relforcerowsecurity check" });

const platform = fs.readFileSync(path.join(ROOT, "server", "sql", "platform.sql"), "utf8");
const platformForceTables = ["hnk_auth_users", "hnk_auth_refresh_tokens",
  "hnk_storage_buckets", "hnk_storage_objects"];
report("roleless recovery tokens have a partial unique lookup index",
  /create\s+unique\s+index\s+if\s+not\s+exists\s+hnk_auth_users_recovery_token_uniq[\s\S]{0,180}on\s+public\.hnk_auth_users\s*\(\s*recovery_token\s*\)[\s\S]{0,100}where\s+recovery_token\s+is\s+not\s+null/i.test(platform));
report("roleless platform tables all FORCE service-only RLS",
  platformForceTables.every(table => hasForceRls(platform, table) &&
    /for\s+all\s+to\s+public/i.test(policyBody(platform, table + "_service_all")) &&
    /request\.role[^;]*service_role/i.test(policyBody(platform, table + "_service_all"))),
  { missing: platformForceTables.filter(table => !hasForceRls(platform, table) ||
    !policyBody(platform, table + "_service_all")) });

console.log("\n" + (failures ? "FAIL (" + failures + ")" : "PASS (unified schema contract)"));
process.exit(failures ? 1 : 0);
