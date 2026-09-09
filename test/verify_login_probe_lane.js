/* v6.33.2 / panel 6.102.2 — the panel sign-in probe lane: the panel's exact sign-in,
   refresh, entitlement and logout requests are made against the LIVE server from a
   GitHub runner with a throwaway account, because the maintenance container has no
   egress and the owner asked for the sign-in itself to be exercised (2026-09-08).

   A) the lane is dispatch-only, gated, read-only, pins the same reviewed actions as
      CI, never echoes commands, and runs the one script
   B) the script masks its random password before anything else prints, uses the
      panel's own header and body shapes and the web app's beside them, posts only
      to the two studio hosts' auth / entitlement routes, withholds tokens from
      every record, and never touches a real student's address
   C) the panel source it mirrors still says what the script assumes (gateHeaders,
      the client_kind body field, the hosts)
   D) CI runs this test */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const WF = read(".github/workflows/probe-panel-login.yml");
const CI = read(".github/workflows/test.yml");
const S = read("tools/probe_panel_login.js");
const PANEL = read("panel/main.js");
const APP = read("docs/app/index.html");

/* ---- A) the lane ---- */
const pushBlock = (WF.match(/\n  push:\n((?:    .*\n)+)/) || [])[1] || "";
report("A) dispatch-only in effect — the one push trigger registers this file alone and the confirm gate makes that run a no-op; contents: read; one job, pinned runner, ten-minute cap",
  /^on:\n  workflow_dispatch:/m.test(WF) && (WF.match(/\n  push:/g) || []).length === 1 &&
  /^    branches: \[claude\/hnk-studio-deployment-pr292-www53j\]\n    paths: \["\.github\/workflows\/probe-panel-login\.yml"\]\n$/.test(pushBlock) &&
  /if: \$\{\{ inputs\.confirm == 'LOGIN' \}\}/.test(WF) && /^permissions:\n  contents: read/m.test(WF) &&
  /runs-on: ubuntu-24\.04/.test(WF) && /timeout-minutes: 10/.test(WF), null);
const sha = (s, name) => (s.match(new RegExp("uses: actions/" + name + "@([0-9a-f]{40})")) || [])[1] || null;
report("A2) checkout (credentials not persisted) and setup-node are pinned exactly as CI pins them; no set -x; the step runs the one script",
  sha(WF, "checkout") === sha(CI, "checkout") && sha(WF, "setup-node") === sha(CI, "setup-node") && !!sha(WF, "checkout") &&
  /persist-credentials: false/.test(WF) && /node-version: "24"/.test(WF) && !/^\s*set -x\b/m.test(WF) &&
  /set -euo pipefail/.test(WF) && /node tools\/probe_panel_login\.js/.test(WF) && !/inputs\.(email|password)/.test(WF), null);

/* ---- B) the script ---- */
report("B) the password is random, generated on the runner, and masked before anything else can print",
  /const PASSWORD = crypto\.randomBytes\(18\)\.toString\("base64url"\);\nconsole\.log\("::add-mask::" \+ PASSWORD\);/.test(S) &&
  S.indexOf('console.log("::add-mask::" + PASSWORD)') < S.indexOf("console.log(\"probe account"), null);
report("B2) the account is a throwaway on the studio's own domain, named by the run — never a real student's address, never an input",
  /const EMAIL = "panel-probe-" \+ RUN \+ "@hnkaistudio\.com";/.test(S) && !/process\.env\.(PROBE_EMAIL|EMAIL|PASSWORD)/.test(S), null);
report("B3) it speaks the panel's shapes and the web app's beside them — gateHeaders (Accept · Content-Type · Bearer) with client_kind:\"panel\", accHeaders (apikey anon)",
  /function panelHeaders\(tok, json\) \{\n  const h = \{ "Accept": "application\/json" \};\n  if \(tok\) h\.Authorization = "Bearer " \+ tok;\n  if \(json\) h\["Content-Type"\] = "application\/json";/.test(S) &&
  /function webHeaders\(tok, json\) \{\n  const h = \{ "apikey": "anon", "Authorization": "Bearer " \+ \(tok \|\| "anon"\) \};/.test(S) &&
  (S.match(/client_kind: "panel"/g) || []).length >= 6, null);
const urls = [...S.matchAll(/(PANEL_HOST|WEB_HOST) \+ ([A-Z_]+|"[^"]+")/g)].map(m => m[2]);
report("B4) every request goes to one of the two studio hosts and only to the auth token / signup / logout routes and the entitlement read — nothing else",
  /const PANEL_HOST = "https:\/\/hnk-ai-tools-3-s4nnu\.ondigitalocean\.app";/.test(S) && /const WEB_HOST = "https:\/\/hnkaistudio\.com";/.test(S) &&
  urls.length >= 11 && urls.every(u => ["TOKEN", "REFRESH", '"/api/auth/v1/signup"', '"/api/auth/v1/logout"',
    '"/api/v1/me/entitlement"', '"/api/v1/devices/enroll"', '"/api/v1/panel/validate"'].includes(u)) &&
  !/https?:\/\/(?!hnk-ai-tools-3-s4nnu\.ondigitalocean\.app|hnkaistudio\.com)[a-z0-9.-]+/i.test(S.replace(/\/\*[\s\S]*?\*\//g, "")), { urls });
report("B5) tokens never reach a record or a line: a body is reduced to booleans, sanitize() withholds any token/password/secret key, and the JSON dump carries the records only",
  /has_access: !!\(j && j\.access_token\), has_refresh: !!\(j && j\.refresh_token\), user_id: !!\(j && j\.user && j\.user\.id\)/.test(S) &&
  /if \(\/token\|password\|secret\/i\.test\(k\)\) \{ out\[k\] = "<withheld>"; continue; \}/.test(S) &&
  !/^(?!.*add-mask).*console\.log\(.*\b(access_token|refresh_token|PASSWORD)\b/m.test(S.replace(/\/\*[\s\S]*?\*\//g, "")) &&
  /JSON\.stringify\(sanitize\(\{ account: en\.json\.account, allowed: en\.json\.allowed, reasons: en\.json\.reasons, panel: en\.json\.panel \}\)\)/.test(S) &&
  /results\.map\(r => Object\.assign\(\{\}, r, \{ expect: undefined \}\)\)/.test(S), null);
report("B6) the walk is the panel's: sign-in on both hosts, refresh, entitlement, logout, the refresh after logout must be refused, a wrong password and an unknown address must both be 400 invalid_grant; the verdict is the exit code",
  /call\(2, "sign-in PANEL shape · DO host"/.test(S) && /call\(3, "sign-in PANEL shape · web host"/.test(S) && /call\(4, "sign-in WEB shape · web host"/.test(S) &&
  /call\(5, "refresh PANEL shape · DO host"/.test(S) && /call\(6, "entitlement PANEL bearer · DO host"/.test(S) && /call\(10, "logout PANEL bearer · DO host"/.test(S) &&
  /call\(11, "refresh after logout · must fail"[\s\S]*?s => s === 400 \|\| s === 401\)/.test(S) &&
  /call\(12, "wrong password PANEL shape"[\s\S]*?isInvalidGrant\)/.test(S) && /call\(13, "unknown address PANEL shape"[\s\S]*?isInvalidGrant\)/.test(S) &&
  /const isInvalidGrant = \(s, c\) => s === 400 && \/invalid_grant\/\.test\(c\);/.test(S) && /process\.exit\(failed\.length \? 1 : 0\);/.test(S), null);

/* v6.33.5 — the guard added after 2026-09-08. A .ccx built from a tree whose release is
   not published on the cluster signs in and then locks (version_blocked, server/lib/
   entitlements.js), and until now nothing on this side said so: the owner found it by
   installing three builds that could never have worked. A pending probe account is denied
   at the ACCOUNT check long before the version check, so the gate cannot be proven by a
   refusal — the lane asks the live server which version it calls latest and compares it
   with the version this tree ships. */
report("B7) the walk reaches the panel's own two calls, and the version this tree ships is checked against the version the cluster serves",
  /call\(7, "enroll PANEL bearer · DO host"[\s\S]*?notVersionVerdict\)/.test(S) &&
  /call\(8, "validate PANEL bearer · DO host"[\s\S]*?panel_version: TREE_VERSION[\s\S]*?notVersionVerdict\)/.test(S) &&
  /const VERSION_VERDICT = \/version_blocked\|invalid_version\|update_required\//.test(S) &&
  /const TREE_VERSION = String\(\(require\("\.\.\/panel\/release-manifest\.json"\) \|\| \{\}\)\.version \|\| ""\);/.test(S) &&
  /note\(9, "released version = this tree", !!liveLatest && !!TREE_VERSION && liveLatest === TREE_VERSION,/.test(S) &&
  /THE PANEL RELEASE IS NOT PUBLISHED\./.test(S), null);
/* The installation id is invented per run and is never a real one. */
report("B8) the computer it registers is a throwaway named by the run, never a student's installation",
  /const INSTALL_ID = "probe-" \+ crypto\.randomBytes\(8\)\.toString\("hex"\);/.test(S) &&
  (S.match(/installation_id: INSTALL_ID/g) || []).length === 2, null);

/* ---- C) the sources it mirrors ---- */
report("C) the panel still signs in the way the script assumes — gateHeaders, client_kind:\"panel\", the DigitalOcean API host — and the web app still signs in from its own origin with apikey anon",
  /function gateHeaders\(tok, json\) \{\n  const h = \{ "Accept": "application\/json" \};/.test(PANEL) &&
  /* 6.39.4 — hnkNoRetry rides in the same options object now (the panel used to
     re-send a sign-in that met a 5xx, spending two of the server's attempts for
     one press), so the pin follows the call and additionally requires it: what
     the lane mirrors is ONE post per press. */
  /grant_type=password",\n\s+\{ method: "POST", hnkNoRetry: true,\n\s+body: JSON\.stringify\(\{ email: em, password: pw, client_kind: "panel" \}\) \}/.test(PANEL) &&
  /const GATE_API_URL = "https:\/\/hnk-ai-tools-3-s4nnu\.ondigitalocean\.app\/api";/.test(PANEL) &&
  /var SB_URL  = location\.origin \+ "\/api";/.test(APP) && /var h = \{ "apikey": SB_ANON, "Authorization": "Bearer " \+ \(tok \|\| SB_ANON\) \};/.test(APP), null);

/* ---- D) CI ---- */
report("D) CI runs this test", CI.includes("node test/verify_login_probe_lane.js"), null);

console.log(failures ? "\nFAIL (" + failures + ")" : "\nPASS — the sign-in probe lane is dispatch-only, masked, token-free and mirrors the panel");
process.exit(failures ? 1 : 0);
