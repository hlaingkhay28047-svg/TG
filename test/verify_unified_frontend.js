"use strict";

/* Security-sensitive frontend contract. The backend remains authoritative;
 * these checks prove the published clients call that authority and expose all
 * required states without embedding a second policy engine or a client secret. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failed++; console.error("FAIL — " + name + (detail ? "\n       " + detail : "")); }
}

const needed = ["docs/admin/index.html", "docs/admin/admin.js", "docs/admin/admin.css",
  "docs/download/index.html", "docs/download/download.js", "docs/download/download.css"];
needed.forEach(rel => check(rel + " exists", fs.existsSync(path.join(ROOT, rel))));

const app = read("docs/app/index.html");
const admin = fs.existsSync(path.join(ROOT, "docs/admin/admin.js")) ? read("docs/admin/admin.js") : "";
const adminHtml = fs.existsSync(path.join(ROOT, "docs/admin/index.html")) ? read("docs/admin/index.html") : "";
const adminCss = fs.existsSync(path.join(ROOT, "docs/admin/admin.css")) ? read("docs/admin/admin.css") : "";
const download = fs.existsSync(path.join(ROOT, "docs/download/download.js")) ? read("docs/download/download.js") : "";
const downloadHtml = fs.existsSync(path.join(ROOT, "docs/download/index.html")) ? read("docs/download/index.html") : "";

function hasAll(text, values) { return values.every(value => text.includes(value)); }

check("student app consumes the authoritative entitlement endpoint",
  app.includes("/v1/me/entitlement") || app.includes("/api/v1/me/entitlement"));
check("student app exposes every account outcome",
  hasAll(app.toLowerCase(), ["pending", "active", "suspended", "expired", "banned", "rejected"]));
check("student app exposes independent permission outcomes",
  hasAll(app, ["web_app", "ccx_download", "panel"]));
check("student app refreshes entitlement on visibility and heartbeat",
  /visibilitychange/.test(app) && /setInterval\s*\(\s*unifiedHeartbeat\s*,\s*15000\s*\)/.test(app));
const gateAllowsSource = (app.match(/function gateAllows\(key\)\{[\s\S]*?\n\}/) || [""])[0];
let unifiedGateOutcomes = [];
try {
  const context = {
    PREMIUM_GATES:{video:true},
    unified:{enforced:true,entitlement:null},
    isPremium:()=>true,
    unifiedCanWeb(){
      const data = context.unified.entitlement;
      return !!(data && data.account.effective_status === "active" && data.license.active && data.permissions.web_app);
    },
  };
  const gateAllows = vm.runInNewContext(`(${gateAllowsSource})`, context);
  const active = {account:{effective_status:"active"},license:{active:true},permissions:{web_app:true}};
  context.unified.entitlement = {...active,account:{effective_status:"suspended"}}; unifiedGateOutcomes.push(gateAllows("video"));
  context.unified.entitlement = {...active,permissions:{web_app:false}}; unifiedGateOutcomes.push(gateAllows("video"));
  context.unified.entitlement = active; unifiedGateOutcomes.push(gateAllows("video"));
} catch (_) { unifiedGateOutcomes = [true,true,false]; }
check("premium execution gates honor cached suspension and Web App disable verdicts",
  JSON.stringify(unifiedGateOutcomes) === JSON.stringify([false,false,true]));
check("entitlement authorization failures clear cached verdicts and stay fail-closed",
  /catch\(e\)\{\s*unified\.enforced\s*=\s*true;\s*unified\.error\s*=\s*true;\s*unified\.entitlement\s*=\s*null;/.test(app) &&
  /if \(unified\.loading \|\| unified\.error \|\| !unified\.entitlement\) return ["']checking["']/.test(app));
check("student app targets typed enrollment and computer pairing",
  hasAll(app, ["/v1/devices/enroll", "/v1/devices/pairing-code", "device_type", "installation_id"]));
check("pairing submits this browser installation id, never a returned slot id or hash",
  /\/v1\/devices\/pairing-code[\s\S]{0,220}computer_installation_id\s*:\s*deviceId\(\)/.test(app));
check("student UI has dashboard, AI tools, account and tutorials destinations",
  hasAll(app, ["pgDash", "AI Tools", "pgAccount", "pgTutorials"]));
check("student cannot self-reset or delete a registered device",
  !/accFetch\([^\n]+\/rest\/v1\/devices[^\n]+method:\s*["']DELETE["']/.test(app),
  "device replacement is an audited admin action");
check("student panel acquisition no longer embeds a CCX path", !/href=["'][^"']*\.ccx/i.test(app));

check("admin uses only same-origin /api/v1 routes", admin.includes("/api/v1/admin/") && !/https?:\/\//i.test(admin));
check("admin uses an isolated tab-scoped session instead of the student session",
  admin.includes("sessionStorage") && admin.includes("hnk_admin_sess_v1") &&
  !admin.includes("hnk_acc_sess_v1") && !/localStorage\.(?:getItem|setItem)\(/.test(admin));
check("admin password and refresh grants explicitly request an admin client session",
  admin.includes("/api/auth/v1/token?grant_type=password") &&
  admin.includes("/api/auth/v1/token?grant_type=refresh_token") &&
  (admin.match(/client_type\s*:\s*["']admin["']/g) || []).length >= 2);
check("admin has an authoritative 403 role guard", /403/.test(admin) && /forbidden|not authorized|admin access/i.test(admin));
check("admin exposes dashboard, students, histories and panel-version endpoints",
  hasAll(admin, ["/api/v1/admin/dashboard", "/api/v1/admin/students", "/api/v1/admin/histories", "/api/v1/admin/panel-version"]));
check("admin sends functional student and history filter contracts",
  /query\.set\(["']q["'],\s*search\)/.test(admin) &&
  /query\.set\(["']type["'],\s*type\s*\|\|\s*["']all["']\)/.test(admin) &&
  hasAll(adminHtml, ['value="failed_login"', 'value="license"', 'value="account"', 'value="admin"']));
check("admin detail tolerates flat permissions/licenses and device-slot arrays",
  hasAll(admin, ["web_app_enabled", "ccx_download_enabled", "panel_enabled", "license_status", "slot_type", "installations"]));
const actions = ["approve", "reject", "activate", "suspend", "ban", "extend_license", "set_expiry",
  "reset_phone", "reset_computer", "force_logout", "set_permission", "password_reset"];
check("admin exposes every required named student action", hasAll(admin, actions),
  "missing: " + actions.filter(a => !admin.includes(a)).join(", "));
check("admin provides MFA setup and verification UI",
  hasAll(admin, ["/api/v1/admin/mfa/setup", "/api/v1/admin/mfa/verify"]) &&
  hasAll(adminHtml, ["adminLoginForm", "adminMfaForm"]) && /mfa|2fa/i.test(adminHtml));
check("dashboard data is loaded only after an admin session passes MFA",
  /mfa_required/.test(admin) && /verifyMfaGate[\s\S]{0,900}loadDashboard/.test(admin));
check("admin supports resumable private Panel artifact upload and finalization",
  hasAll(admin, ["/api/v1/admin/panel-artifacts/initiate", "/chunks/", "/finalize", "uploaded_indices", "crypto.subtle.digest", "data_base64"]) &&
  hasAll(adminHtml, ["panelArtifactFile", "artifactProgress", "artifactUploadStatus"]));
check("artifact chunks are capped at 4 MiB and release enable follows finalization",
  /ARTIFACT_CHUNK_SIZE\s*=\s*4\s*\*\s*1024\s*\*\s*1024/.test(admin) &&
  /finalizePanelArtifact[\s\S]{0,1600}enabled\s*:\s*true/.test(admin));
check("admin markup has search, filters, student detail dialog and live feedback",
  /type=["']search["']/.test(adminHtml) && /<dialog\b/i.test(adminHtml) && /aria-live=["']polite["']/.test(adminHtml));
check("admin payment queue stays on strict same-origin endpoints with Pending and History views",
  hasAll(admin, ["/api/v1/admin/payment-requests", "/api/v1/admin/payment-grants"]) &&
  hasAll(adminHtml, ['data-payment-view="pending"', 'data-payment-view="history"']) &&
  !/\/rest\/v1\/payment_requests|supabase\.co\/rest/i.test(admin));
check("payment proof uses a private Blob URL and revokes it on close",
  /URL\.createObjectURL\(blob\)/.test(admin) && /URL\.revokeObjectURL\(state\.proofUrl\)/.test(admin) &&
  hasAll(adminHtml, ["paymentProofDialog", "paymentProofImage"]));
check("payment review and VIP grant submit only allowlisted confirmed fields",
  /JSON\.stringify\(\{ status: review\.decision, note \}\)/.test(admin) &&
  /JSON\.stringify\(\{ email, kind, note \}\)/.test(admin) &&
  hasAll(adminHtml, ["paymentReviewNote", "confirmPaymentReview", "paymentGrantForm", "grantNote"]));
check("concurrent admin 401s share one refresh and ignore stale responses after session rotation",
  hasAll(admin, ["refreshInFlight", "sessionGeneration"]) &&
  /accessToken\(\) !== token/.test(admin) && /generation !== sessionGeneration/.test(admin));
check("payment configuration cardinality warnings render as a high-contrast alert",
  /id="paymentConfigWarning"[^>]*role="alert"/.test(adminHtml) && admin.includes("app_settings_row_count") &&
  /\.payment-config-warning\{[^}]*border:[^}]*background:/s.test(adminCss));
check("payment review keeps sent and due amounts separate and flags numeric mismatches",
  hasAll(admin, ["paymentSentAmount", "paymentDueAmount", "paymentAmountMismatch"]) &&
  /className: "payment-mismatch", role: "alert"/.test(admin) &&
  /\.payment-mismatch\{[^}]*border:[^}]*background:/s.test(adminCss) &&
  /Student sent \$\{sent\}; server due \$\{due\}/.test(admin));

check("download requests a temporary URL only from an explicit control",
  download.includes("/api/v1/downloads/panel") && /addEventListener\s*\(\s*["']click["']/.test(download));
check("download request never round-trips a server device id or installation hash",
  !/computer_installation_id|installation_hash/.test(download));
check("download page never embeds a CCX path", !/\.ccx(?:["'?#]|$)/i.test(download + downloadHtml));
check("download UI describes expiring secure delivery", /expir|temporary|secure|သက်တမ်း/i.test(downloadHtml + download));

const published = app + admin + adminHtml + download + downloadHtml;
check("new clients contain no service/admin/database secret",
  !/(service[_-]?role|database[_-]?service[_-]?key|secret[_-]?admin[_-]?key)/i.test(published));

if (failed) process.exit(1);
console.log("\nPASS — unified frontend authorization and UX contract");
