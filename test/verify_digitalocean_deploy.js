const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const productionWorkflow = read('.github/workflows/deploy-digitalocean.yml');
const stagingWorkflow = read('.github/workflows/deploy-digitalocean-staging.yml');
const verifyWorkflow = read('.github/workflows/verify-digitalocean-deploy.yml');
const healthWorkflow = read('.github/workflows/read-production-health.yml');
const productionSpec = read('.do/app.yaml');
const stagingSpec = read('.do/staging.app.yaml');
const apiServer = read('server/index.js');
const migration = read('server/lib/migrate.js');
const stagingSyncStart = stagingWorkflow.indexOf('        id: spec_sync');
const stagingSyncEnd = stagingWorkflow.indexOf('\n      - name: Force staging deploy', stagingSyncStart);
const stagingSync = stagingSyncStart >= 0 && stagingSyncEnd > stagingSyncStart
  ? stagingWorkflow.slice(stagingSyncStart, stagingSyncEnd) : '';
const failures = [];

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) failures.push(label);
}
function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

check('production workflow follows every main push', /push:\s*\n\s*branches:\s*\[main\]/m.test(productionWorkflow));
check('production manual dispatch exposes explicit force_rebuild recovery', /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force_rebuild:/m.test(productionWorkflow));
check('production manual dispatch is restricted to main', productionWorkflow.includes('refs/heads/main'));
check('production app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-3\b/.test(productionWorkflow));
check('production host is locked', /DO_APP_HOST:\s*hnk-ai-tools-3-s4nnu\.ondigitalocean\.app\b/.test(productionWorkflow));
check('production verifier cancels when a newer main release supersedes it', /group:\s*digitalocean-production[\s\S]*?cancel-in-progress:\s*true/.test(productionWorkflow));
check('production verifies version plus exact landing and app HTML', productionWorkflow.includes('/app/version.json') && productionWorkflow.includes('sha256sum docs/index.html') && productionWorkflow.includes('sha256sum docs/app/index.html'));
check('production gates on live API version, exact schema fingerprint, readiness and verified TLS',
  productionWorkflow.includes('/api/health') &&
  productionWorkflow.includes('sha256sum server/sql/schema.sql') &&
  productionWorkflow.includes(".apiVersion // empty") &&
  productionWorkflow.includes(".schemaFingerprint // empty") &&
  productionWorkflow.includes('[ "$ACTUAL_READY" = "true" ]') &&
  productionWorkflow.includes('[ "$ACTUAL_TLS" = "verified" ]'));
check('production verification is cache-busted by commit SHA', productionWorkflow.includes('sha=${GITHUB_SHA}'));
check('production attests the active API deployment commit',
  productionWorkflow.includes('.active_deployment.services[]?') &&
  productionWorkflow.includes('.source_commit_hash // empty') &&
  productionWorkflow.includes('[ "$ACTUAL_SOURCE_SHA" = "$GITHUB_SHA" ]'));
check('production live verification consumes the shared job deadline', productionWorkflow.includes('DEADLINE_EPOCH="${JOB_DEADLINE_EPOCH:?deployment deadline was not recorded}"') && !productionWorkflow.includes('DEADLINE=$((SECONDS + 1800))') && !productionWorkflow.includes('seq 1 120'));
check('production workflow leaves headroom for its scripted diagnostic', /timeout-minutes:\s*35\b/.test(productionWorkflow));

check('staging workflow follows every upgrade branch push', /push:\s*\n\s*branches:\s*\[upgrade-safe-wave\]/m.test(stagingWorkflow));
check('staging manual dispatch exposes explicit force_rebuild recovery', /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force_rebuild:/m.test(stagingWorkflow));
check('staging manual dispatch is restricted to upgrade-safe-wave', stagingWorkflow.includes('refs/heads/upgrade-safe-wave'));
check('staging app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-2\b/.test(stagingWorkflow));
check('staging host is locked', /DO_APP_HOST:\s*hnk-ai-tools-2-gibhz\.ondigitalocean\.app\b/.test(stagingWorkflow));
check('staging verifies version plus exact landing and app HTML', stagingWorkflow.includes('/app/version.json') && stagingWorkflow.includes('sha256sum docs/index.html') && stagingWorkflow.includes('sha256sum docs/app/index.html'));
check('staging gates on live API version, exact schema fingerprint, readiness and verified TLS',
  stagingWorkflow.includes('/api/health') &&
  stagingWorkflow.includes('sha256sum server/sql/schema.sql') &&
  stagingWorkflow.includes(".apiVersion // empty") &&
  stagingWorkflow.includes(".schemaFingerprint // empty") &&
  stagingWorkflow.includes('[ "$ACTUAL_READY" = "true" ]') &&
  stagingWorkflow.includes('[ "$ACTUAL_TLS" = "verified" ]'));
check('staging verification is cache-busted by commit SHA', stagingWorkflow.includes('sha=${GITHUB_SHA}'));
check('staging attests the active API deployment commit',
  stagingWorkflow.includes('.active_deployment.services[]?') &&
  stagingWorkflow.includes('.source_commit_hash // empty') &&
  stagingWorkflow.includes('[ "$ACTUAL_SOURCE_SHA" = "$GITHUB_SHA" ]'));
check('both lanes bound an exact active-service source lookup',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    workflow.includes('doctl apps get "$DO_APP_ID" --output json') &&
    workflow.includes('if length == 1 then .[0] else empty end') &&
    workflow.includes('timeout --foreground --signal=TERM --kill-after=2s 10s')));
check('staging live verification consumes the shared job deadline', stagingWorkflow.includes('DEADLINE_EPOCH="${JOB_DEADLINE_EPOCH:?deployment deadline was not recorded}"') && !stagingWorkflow.includes('DEADLINE=$((SECONDS + 1800))') && !stagingWorkflow.includes('seq 1 120'));
check('staging workflow leaves headroom for its scripted diagnostic', /timeout-minutes:\s*35\b/.test(stagingWorkflow));
check('staging deploy concurrency cancels stale builds', /group:\s*digitalocean-staging[\s\S]*?cancel-in-progress:\s*true/.test(stagingWorkflow));
check('the static-only repair is staging-only, release-locked, and owner-only',
  stagingWorkflow.includes('bootstrap_digitalocean_staging_spec.js') &&
  stagingWorkflow.includes('[ "$EXPECTED_VERSION" != "5.42.2" ]') &&
  stagingWorkflow.includes('openssl rand -hex 64 > "$JWT_SECRET_FILE"') &&
  stagingWorkflow.includes('chmod 600 "$JWT_SECRET_FILE"') &&
  !productionWorkflow.includes('bootstrap_digitalocean_staging_spec.js'));
check('staging proposes a narrow liveness warmup before its bounded update',
  stagingSync.includes('doctl apps propose') &&
  stagingSync.includes('> "$PROPOSAL_FILE" 2>&1') &&
  stagingSync.indexOf('doctl apps propose') <
    stagingSync.indexOf('--spec "$WARMUP_SPEC"', stagingSync.indexOf('doctl apps update')) &&
  stagingSync.includes('WARMUP_TIMEOUT_SECONDS=$(( JOB_DEADLINE_EPOCH - $(date +%s) - 720 ))'));
check('staging redownloads and validates encrypted state after bootstrapping',
  occurrences(stagingSync, 'doctl apps spec get') >= 3 &&
  stagingSync.includes('"$ROUNDTRIP_SPEC" "$ROUNDTRIP_PATCHED_SPEC"') &&
  stagingSync.includes('cmp -s <(jq -S . "$ROUNDTRIP_SPEC") <(jq -S . "$WARMUP_RESTORED_SPEC")') &&
  stagingSync.includes('"$FINAL_SPEC" "$FINAL_PATCHED_SPEC"') &&
  stagingSync.includes('cmp -s <(jq -S . "$FINAL_SPEC") <(jq -S . "$FINAL_PATCHED_SPEC")'));
check('staging bootstraps and recovers an inactive API through the liveness probe',
  stagingSync.includes('[ "$DESIRED_SERVICE_COUNT" -eq 0 ]') &&
  stagingSync.includes('[ "$DESIRED_SERVICE_COUNT" -eq 1 ]') &&
  stagingSync.includes('[ "$ACTIVE_SERVICE_COUNT" -eq 0 ]') &&
  stagingSync.includes('[ "$ACTIVE_SERVICE_COUNT" -eq 1 ]') &&
  stagingSync.includes('.active_deployment.services[]?') &&
  stagingSync.includes('.health_check.http_path) = "/live"') &&
  stagingSync.includes('WARMUP_RESTORED_SPEC') &&
  stagingSync.includes('Refusing an ambiguous staging deployment state'));
check('staging steady state requires desired and active readiness probes to agree',
  stagingSync.includes('ACTIVE_READY_PATH') &&
  stagingSync.includes('ACTIVE_LIVE_PATH') &&
  stagingSync.includes('[ "$CURRENT_READY_PATH" = "/ready" ]') &&
  stagingSync.includes('[ "$ACTIVE_READY_PATH" = "/ready" ]') &&
  stagingSync.includes('[ "$ACTIVE_LIVE_PATH" = "/live" ]'));
check('staging retries a persisted desired-ready but active-live promotion',
  stagingSync.includes('[ "$ACTIVE_READY_PATH" = "/live" ]') &&
  stagingSync.includes('Resuming the staged readiness promotion') &&
  stagingSync.includes('The final active staging deployment did not retain /ready and /live.'));
check('staging waits for the exact API and schema before enforcing readiness',
  stagingSync.includes('Waiting for the warm API and database before enforcing /ready') &&
  stagingSync.includes('EXPECTED_SCHEMA_SHA="$(sha256sum server/sql/schema.sql') &&
  stagingSync.includes('[ "$ACTUAL_API_VERSION" = "$EXPECTED_VERSION" ]') &&
  stagingSync.includes('[ "$ACTUAL_SCHEMA_SHA" = "$EXPECTED_SCHEMA_SHA" ]') &&
  stagingSync.includes('[ "$ACTUAL_READY" = "true" ]') &&
  stagingSync.includes('[ "$ACTUAL_TLS" = "verified" ]') &&
  stagingSync.includes('Enforced /ready after the staging API reached the release contract.'));
check('staging attests the warmup source before the readiness promotion',
  stagingSync.indexOf('[ "$ACTIVE_SOURCE_SHA" != "$GITHUB_SHA" ]') >= 0 &&
  stagingSync.indexOf('[ "$ACTIVE_SOURCE_SHA" != "$GITHUB_SHA" ]') <
    stagingSync.indexOf('--spec "$ROUNDTRIP_PATCHED_SPEC"'));
check('staging promotes readiness exactly once after the warmup health gate',
  occurrences(stagingSync, '--spec "$ROUNDTRIP_PATCHED_SPEC"') === 2 &&
  stagingSync.indexOf('Waiting for the warm API and database before enforcing /ready') <
    stagingSync.indexOf('doctl apps spec get "$APP_ID" --format json > "$ROUNDTRIP_SPEC"') &&
  stagingSync.indexOf('doctl apps spec get "$APP_ID" --format json > "$ROUNDTRIP_SPEC"') <
    stagingSync.indexOf('--spec "$ROUNDTRIP_PATCHED_SPEC"') &&
  stagingSync.indexOf('--spec "$ROUNDTRIP_PATCHED_SPEC"') <
    stagingSync.indexOf('doctl apps spec get "$APP_ID" --format json > "$FINAL_SPEC"'));
check('staging warmup diagnostics never print remote specs, health bodies, or runtime logs',
  !stagingSync.includes('doctl apps logs') &&
  !stagingSync.includes('cat "$HEALTH_FILE"') &&
  !stagingSync.includes('cat "$LIVE_SPEC"') &&
  !stagingSync.includes("'.error //"));
check('bootstrap plaintext material is deleted before later workflow steps',
  stagingWorkflow.includes("trap 'rm -f") &&
  stagingWorkflow.includes('$JWT_SECRET_FILE') &&
  stagingWorkflow.includes('$BOOTSTRAP_SPEC') &&
  stagingWorkflow.includes('$PROPOSAL_FILE'));

const manualRecovery = "github.event_name == 'workflow_dispatch' && inputs.force_rebuild == true && steps.auth.outputs.available == 'true'";
check('forced-rebuild recovery is manual-only and does not duplicate a two-phase repair',
  occurrences(productionWorkflow, manualRecovery) === 1 && occurrences(stagingWorkflow, manualRecovery) === 1 &&
  productionWorkflow.indexOf(manualRecovery) < productionWorkflow.indexOf('apps create-deployment') &&
  stagingWorkflow.indexOf(manualRecovery) < stagingWorkflow.indexOf('apps create-deployment') &&
  !productionWorkflow.includes("steps.spec_sync.outputs.changed != 'true'") &&
  stagingWorkflow.includes("steps.spec_sync.outputs.changed != 'true'"));
check('manual release verification fails closed when its lane token is absent',
  productionWorkflow.includes("github.event_name == 'workflow_dispatch' && steps.auth.outputs.available != 'true'") &&
  stagingWorkflow.includes("github.event_name == 'workflow_dispatch' && steps.auth.outputs.available != 'true'"));
check('manual recovery validates the actual DigitalOcean repo and branch before mutation',
  [productionWorkflow, stagingWorkflow].every(workflow => workflow.includes('.github.repo == $repo') && workflow.includes('.github.branch == $branch') && workflow.indexOf('.github.repo == $repo') < workflow.indexOf('apps create-deployment')));
check('manual recovery still pulls, rebuilds, and waits exactly once per lane',
  [productionWorkflow, stagingWorkflow].every(workflow => occurrences(workflow, 'apps create-deployment') === 1 && workflow.includes('--update-sources') && workflow.includes('--force-rebuild') && workflow.includes('--wait')));
/* --update-sources belongs to `apps update`; on `apps create-deployment` this
   doctl prints its usage and exits 255, which is exactly how recovery run
   #104 died while the spec-sync race it existed to fix stayed unfixed. */
check('manual recovery passes create-deployment only flags it actually has',
  [productionWorkflow, stagingWorkflow].every(workflow => {
    const invocation = workflow.slice(workflow.indexOf('apps create-deployment'),
      workflow.indexOf('--format ID,Phase,Updated'));
    return invocation.length > 0 && !invocation.includes('--update-sources');
  }));
check('both lanes record one shared 33-minute deadline before optional recovery',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    occurrences(workflow, 'JOB_DEADLINE_EPOCH=$(( $(date +%s) + 1980 ))') === 1 &&
    workflow.indexOf('JOB_DEADLINE_EPOCH=$(( $(date +%s) + 1980 ))') < workflow.indexOf('Install doctl for manual recovery')));
check('manual recovery is bounded and reserves two minutes for live verification',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    workflow.includes('RECOVERY_TIMEOUT_SECONDS=$(( JOB_DEADLINE_EPOCH - $(date +%s) - 120 ))') &&
    workflow.includes('timeout --foreground --signal=TERM --kill-after=10s "${RECOVERY_TIMEOUT_SECONDS}s"')));
check('manual recovery escalates stuck processes and preserves diagnostic exit status',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    workflow.includes('RECOVERY_STATUS=$?') &&
    workflow.includes('exceeded its bounded deadline (exit ${RECOVERY_STATUS})') &&
    workflow.includes('failed with exit status ${RECOVERY_STATUS}')));
check('DigitalOcean app inventories are created with owner-only permissions',
  [productionWorkflow, stagingWorkflow].every(workflow => {
    const resolveAt = workflow.indexOf('id: app');
    const umaskAt = workflow.indexOf('umask 077', resolveAt);
    const listAt = workflow.indexOf('doctl apps list --output json', resolveAt);
    return resolveAt >= 0 && umaskAt > resolveAt && umaskAt < listAt;
  }));

check('staging and production credentials are lane-isolated',
  stagingWorkflow.includes('secrets.DIGITALOCEAN_STAGING_ACCESS_TOKEN') &&
  !stagingWorkflow.includes('DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN') &&
  productionWorkflow.includes('secrets.DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN') &&
  !productionWorkflow.includes('DIGITALOCEAN_STAGING_ACCESS_TOKEN'));
check('no legacy shared token aliases remain in deploy workflows',
  !['DIGITALOCEAN_ACCESS_TOKEN', 'DIGITALOCEAN_TOKEN', 'secrets.DO_TOKEN'].some(name => (productionWorkflow + stagingWorkflow).includes(name)));
check('no DigitalOcean personal-access-token literal is committed', !/dop_v1_[A-Za-z0-9_-]{20,}/.test(productionWorkflow + stagingWorkflow));
check('repository checkout is pinned to reviewed checkout v7.0.1 SHA in every deploy lane',
  [productionWorkflow, stagingWorkflow, verifyWorkflow].every(workflow => workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1')));
check('deploy contract CI is pinned to reviewed setup-node v7.0.0 SHA',
  verifyWorkflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'));
check('deploy contract CI follows both release branches directly',
  /push:\s*\n\s*branches:\s*\[main, upgrade-safe-wave\]/m.test(verifyWorkflow));
check('action-doctl is pinned to reviewed v2.5.2 SHA in both recovery lanes',
  [productionWorkflow, stagingWorkflow].every(workflow => workflow.includes('digitalocean/action-doctl@3cb3953159719656269e044e0e24ca16dd2a690f')));
check('doctl binary version is explicit and current in both recovery lanes',
  /version:\s*1\.166\.0\b/.test(productionWorkflow) && /version:\s*1\.166\.0\b/.test(stagingWorkflow));

check('production spec app is hnk-ai-tools-3', /^name:\s*hnk-ai-tools-3\s*$/m.test(productionSpec));
check('production spec stays on main', /branch:\s*main\b/.test(productionSpec));
check('production DigitalOcean source auto-deploy is enabled', /deploy_on_push:\s*true\b/.test(productionSpec));
check('production separates readiness from process liveness',
  /health_check:\s*\n\s*http_path:\s*\/ready\b/.test(productionSpec) &&
  /liveness_health_check:\s*\n\s*http_path:\s*\/live\b/.test(productionSpec) &&
  apiServer.includes('pathname === "/ready"') &&
  apiServer.includes('pathname === "/live"'));
check('staging separates readiness from process liveness',
  /health_check:\s*\n\s*http_path:\s*\/ready\b/.test(stagingSpec) &&
  /liveness_health_check:\s*\n\s*http_path:\s*\/live\b/.test(stagingSpec));
const listenAt = apiServer.indexOf('listen();');
const migrateAt = apiServer.indexOf('migration.migrate().then');
check('the API opens its port before beginning the boot migration',
  listenAt >= 0 && migrateAt > listenAt);
check('boot migration bounds lock and statement waits',
  migration.includes("set_config('lock_timeout'") &&
  migration.includes("set_config('statement_timeout'"));
check('the timeout-configured migration session is discarded, never pooled for requests',
  migration.includes('client.release(true)'));
check('both deploy lanes validate and narrowly patch the downloaded live spec before updating source',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    workflow.includes('apps spec get') &&
    workflow.includes('id: spec_sync') &&
    workflow.includes('DO_STATIC_SITE: hnk-web') &&
    workflow.includes('node .github/scripts/patch_digitalocean_spec.js') &&
    workflow.includes('"$DO_SERVICE" "$DO_STATIC_SITE"') &&
    workflow.includes('apps update') &&
    workflow.includes('--spec "$PATCHED_SPEC"') &&
    workflow.includes('--update-sources') &&
    workflow.indexOf('apps spec get') < workflow.indexOf('apps update')));
check('production pushes synchronize the current source even when health probes already match',
  /if \[ "\$CURRENT_READY_PATH" = "\/ready" \] && \[ "\$CURRENT_LIVE_PATH" = "\/live" \] &&\s*\[ "\$GITHUB_EVENT_NAME" != "push" \]; then[\s\S]{0,300}?echo "changed=false" >> "\$GITHUB_OUTPUT"[\s\S]{0,300}?exit 0/.test(productionWorkflow) &&
  productionWorkflow.indexOf('doctl apps update', productionWorkflow.indexOf('[ "$GITHUB_EVENT_NAME" != "push" ]')) >= 0);
check('staging steady-state exits only when the active deployment matches the pushed commit',
  /if \[ "\$CURRENT_READY_PATH" = "\/ready" \] && \[ "\$CURRENT_LIVE_PATH" = "\/live" \] &&\s*\[ "\$ACTIVE_READY_PATH" = "\/ready" \] && \[ "\$ACTIVE_LIVE_PATH" = "\/live" \] &&\s*\[ "\$ACTIVE_SOURCE_SHA" = "\$GITHUB_SHA" \]; then[\s\S]{0,300}?echo "changed=false" >> "\$GITHUB_OUTPUT"[\s\S]{0,300}?exit 0/.test(stagingWorkflow) &&
  stagingWorkflow.indexOf('doctl apps update', stagingWorkflow.indexOf('[ "$ACTIVE_SOURCE_SHA" = "$GITHUB_SHA" ]')) >= 0);
check('the one-time probe transition updates source in the same deployment',
  [productionWorkflow, stagingWorkflow].every(workflow =>
    workflow.includes('doctl apps update') &&
    /doctl apps update[\s\S]*?--spec "\$PATCHED_SPEC"[\s\S]*?--update-sources[\s\S]*?--wait/.test(workflow)));
check('staging app is hnk-ai-tools-2', /^name:\s*hnk-ai-tools-2\s*$/m.test(stagingSpec));
check('staging source is upgrade-safe-wave', /branch:\s*upgrade-safe-wave\b/.test(stagingSpec));
check('staging DigitalOcean source auto-deploy is enabled', /deploy_on_push:\s*true\b/.test(stagingSpec));
check('staging and production both serve docs', /source_dir:\s*\/docs\b/.test(stagingSpec) && /source_dir:\s*\/docs\b/.test(productionSpec));

/* Both specs must bind the database URL under TWO component names.
 *
 * App Platform substitutes ${component.VARIABLE} only when a component by that
 * exact name exists, and passes an unmatched one through as literal text rather
 * than failing — so an app whose database was added from the console, where the
 * default component name is `db`, receives the string "${hnk-db.DATABASE_URL}"
 * and no database at all. The second binding resolves in exactly the case the
 * first does not, and server/lib/db.js connects with whichever became a real
 * postgres:// URL (verify_api_service.js H6 through H9 prove that end of it).
 *
 * Checked as a pair, because one binding alone is the bug. */
const doubleBound = [
  /* variable, the env key it lands in */
  ['DATABASE_URL', 'DATABASE_URL'],
  /* The certificate decides whether the database is AUTHENTICATED or merely
     encrypted to, on the connection that carries the payment records. */
  ['CA_CERT', 'DATABASE_CA_CERT'],
];
[['production', productionSpec], ['staging', stagingSpec]].forEach(([lane, spec]) => {
  doubleBound.forEach(([variable, key]) => {
    const pattern = new RegExp('value:\\s*\\$\\{[^}]*\\.' + variable + '\\}', 'g');
    const components = (spec.match(pattern) || [])
      .map(line => line.replace(/^value:\s*/, ''))
      .map(b => b.slice(2, b.indexOf('.')));
    check(`${lane} spec binds ${variable} under both component names`,
      components.includes('hnk-db') && components.includes('db'));
    /* ...and they must be separate KEYS. Two values under one key is a spec
       that overwrites itself, which looks right and delivers only the last. */
    check(`${lane} spec gives the second ${variable} binding its own key`,
      occurrences(spec, '- key: ' + key) === 2 &&
      new RegExp('- key: ' + key + '\\n').test(spec) &&
      new RegExp('- key: ' + key + '_[A-Z_]+\\n').test(spec));
  });
});

/* The production health reading has to be reachable from somewhere with a
 * network route to the live app. /api/health is the only window into whether
 * the API reached its database, and a development container behind a network
 * policy has no way to open it — which is how a five-minute diagnosis became an
 * afternoon. This workflow is that route, so these checks keep it one. */
check('production health can be read on demand from Actions',
  /workflow_dispatch:/.test(healthWorkflow) && /\/api\/health/.test(healthWorkflow));

/* It reports rather than gates, deliberately: a red reading means production is
 * not ready, which failing this run would not change, and a permanently red
 * lane teaches people to ignore red lanes. An endpoint that does not answer at
 * all is the exception — that is the service being down. */
check('a health reading that is merely not-ready does not fail the run',
  /::warning::The API is not ready/.test(healthWorkflow) &&
  /did not answer/.test(healthWorkflow));
check('the health reader preserves a 503 JSON body and records its HTTP status',
  healthWorkflow.includes('--output "$BODY_FILE"') &&
  healthWorkflow.includes("--write-out '%{http_code}'") &&
  healthWorkflow.includes('HTTP_STATUS') &&
  !healthWorkflow.includes('curl -fsSL'));
check('the health reader rejects unexpected HTTP statuses and non-health JSON',
  healthWorkflow.includes('[ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "503" ]') &&
  healthWorkflow.includes("jq -s -e 'length == 1") &&
  healthWorkflow.includes('returned invalid health JSON'));
check('the health reader requires status and readiness to agree',
  healthWorkflow.includes('[ "$HTTP_STATUS" = "200" ] && [ "$READY" != "true" ]') &&
  healthWorkflow.includes('[ "$HTTP_STATUS" = "503" ] && [ "$READY" != "false" ]'));
check('the health reader escapes remote diagnostics before annotations and Markdown',
  healthWorkflow.includes('WHY_ANNOTATION') && healthWorkflow.includes("'%25'") &&
  healthWorkflow.includes("'%0D'") && healthWorkflow.includes("'%0A'") &&
  healthWorkflow.includes('WHY_SUMMARY') && healthWorkflow.includes('jq -Rs .') &&
  healthWorkflow.includes('BODY_SUMMARY') && healthWorkflow.includes('FIELDS_SUMMARY'));

/* THE HOST REACHES BASH THROUGH THE ENVIRONMENT, NEVER THROUGH ${{ }}.
 * A workflow input is attacker-controlled text the moment anyone else can
 * dispatch it, and ${{ }} inside `run:` is substituted before bash ever sees
 * the line — so an interpolated input is a shell injection, not a string. */
function runScriptBlocks(workflow) {
  /* Read by indentation rather than by regex over the whole file. A regex that
     scans for `run:` and then for `${{` anywhere after it also matches the two
     appearing in a comment, which is how the first version of this check failed
     on a workflow that was already correct. */
  const lines = workflow.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const opener = /^(\s*)run:\s*[|>]/.exec(lines[i]);
    if (!opener) continue;
    const indent = opener[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() !== '' && line.length - line.trimStart().length <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

function runBlockForStep(workflow, stepId) {
  const lines = workflow.split('\n');
  const idAt = lines.findIndex(line =>
    new RegExp(`^\\s*id:\\s*${stepId}\\s*$`).test(line));
  if (idAt < 0) return '';
  for (let i = idAt + 1; i < lines.length; i++) {
    if (/^\s*- name:/.test(lines[i])) break;
    const opener = /^(\s*)run:\s*\|\s*$/.exec(lines[i]);
    if (!opener) continue;
    const indent = opener[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() !== '' && line.length - line.trimStart().length <= indent) break;
      body.push(line);
    }
    const bodyIndent = Math.min(...body
      .filter(line => line.trim() !== '')
      .map(line => line.length - line.trimStart().length));
    return body.map(line => line.slice(Math.min(bodyIndent, line.length))).join('\n');
  }
  return '';
}

/* Execute the checked-in spec-sync shell, rather than only recognizing its
 * text. The fake doctl persists the submitted spec and active source SHA, so a
 * reverted early exit is observable as a missing update (and the staging
 * source transition exercises the complete warmup/readiness path). */
const deployControlTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'hnk-deploy-control-'));
try {
  const fakeBin = path.join(deployControlTemp, 'bin');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, 'doctl'), `#!/usr/bin/env node
"use strict";
const fs = require("fs");
const args = process.argv.slice(2);
const statePath = process.env.FAKE_DOCTL_STATE;
const logPath = process.env.FAKE_DOCTL_LOG;
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
function save() { fs.writeFileSync(statePath, JSON.stringify(state)); }
function log(command) {
  fs.appendFileSync(logPath, JSON.stringify({ command, args }) + "\\n");
}
if (args[0] !== "apps") process.exit(64);
if (args[1] === "spec" && args[2] === "get") {
  process.stdout.write(JSON.stringify(state.spec));
} else if (args[1] === "get") {
  process.stdout.write(JSON.stringify({
    id: "test-app",
    active_deployment: {
      services: [{
        name: process.env.FAKE_SERVICE_NAME,
        source_commit_hash: state.source,
      }],
      static_sites: [{ name: process.env.FAKE_STATIC_SITE_NAME }],
      spec: { services: state.spec.services },
    },
  }));
} else if (args[1] === "propose") {
  log("propose");
  process.stdout.write("proposal accepted\\n");
} else if (args[1] === "update") {
  const specAt = args.indexOf("--spec");
  if (specAt < 0 || !args[specAt + 1]) process.exit(65);
  state.spec = JSON.parse(fs.readFileSync(args[specAt + 1], "utf8"));
  state.source = process.env.GITHUB_SHA;
  save();
  log("update");
  process.stdout.write("updated\\n");
} else {
  process.exit(66);
}
`, { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, 'curl'), `#!/usr/bin/env node
"use strict";
const fs = require("fs");
const args = process.argv.slice(2);
const outputAt = args.indexOf("--output");
if (outputAt < 0 || !args[outputAt + 1]) process.exit(67);
fs.writeFileSync(args[outputAt + 1], process.env.FAKE_HEALTH_BODY);
process.stdout.write("200");
`, { mode: 0o755 });

  const releaseSha = '0123456789abcdef0123456789abcdef01234567';
  const expectedVersion = JSON.parse(read('docs/app/version.json')).v;
  const expectedSchema = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'server/sql/schema.sql'))).digest('hex');
  const healthBody = JSON.stringify({
    ok: true,
    ready: true,
    apiVersion: expectedVersion,
    schemaFingerprint: expectedSchema,
    tls: 'verified',
  });

  function makeLiveSpec(lane, readyPath = '/ready') {
    const production = lane === 'production';
    const appName = production ? 'hnk-ai-tools-3' : 'hnk-ai-tools-2';
    const branch = production ? 'main' : 'upgrade-safe-wave';
    const github = {
      repo: 'hlaingkhay28047-svg/TG',
      branch,
      deploy_on_push: true,
    };
    return {
      name: appName,
      services: [{
        name: 'hnk-api',
        github,
        health_check: { http_path: readyPath },
        liveness_health_check: { http_path: '/live' },
        envs: [{ key: 'JWT_SECRET', type: 'SECRET', value: 'EV[test-ciphertext]' }],
      }],
      static_sites: [{ name: 'hnk-web', github }],
    };
  }

  function executeSpecSync(label, workflow, lane, options = {}) {
    const caseDir = path.join(deployControlTemp, label.replace(/[^a-z0-9]+/gi, '-'));
    fs.mkdirSync(caseDir);
    const statePath = path.join(caseDir, 'state.json');
    const logPath = path.join(caseDir, 'doctl.jsonl');
    const outputPath = path.join(caseDir, 'github-output.txt');
    fs.writeFileSync(statePath, JSON.stringify({
      spec: makeLiveSpec(lane, options.readyPath),
      source: options.activeSource || releaseSha,
    }));
    fs.writeFileSync(logPath, '');
    fs.writeFileSync(outputPath, '');
    const rawScript = runBlockForStep(workflow, 'spec_sync');
    const script = rawScript.replace(
      /\$\{\{\s*steps\.app\.outputs\.app_id\s*\}\}/g, 'test-app');
    const production = lane === 'production';
    const run = spawnSync('bash', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        RUNNER_TEMP: caseDir,
        GITHUB_OUTPUT: outputPath,
        GITHUB_EVENT_NAME: options.eventName || 'push',
        GITHUB_SHA: releaseSha,
        JOB_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 3600),
        DO_APP_NAME: production ? 'hnk-ai-tools-3' : 'hnk-ai-tools-2',
        DO_APP_HOST: production ? 'hnk-ai-tools-3-s4nnu.ondigitalocean.app' : 'hnk-ai-tools-2-gibhz.ondigitalocean.app',
        DO_SERVICE: 'hnk-api',
        DO_STATIC_SITE: 'hnk-web',
        DO_REPO: 'hlaingkhay28047-svg/TG',
        DO_BRANCH: production ? 'main' : 'upgrade-safe-wave',
        FAKE_DOCTL_STATE: statePath,
        FAKE_DOCTL_LOG: logPath,
        FAKE_SERVICE_NAME: 'hnk-api',
        FAKE_STATIC_SITE_NAME: 'hnk-web',
        FAKE_HEALTH_BODY: healthBody,
      }),
    });
    const commands = fs.readFileSync(logPath, 'utf8').trim().split('\n')
      .filter(Boolean).map(line => JSON.parse(line));
    return {
      run,
      commands,
      updates: commands.filter(command => command.command === 'update'),
      output: fs.readFileSync(outputPath, 'utf8'),
    };
  }

  const productionPush = executeSpecSync(
    'production-push-ready', productionWorkflow, 'production', { eventName: 'push' });
  check('production spec-sync executes an update for a push whose probes already match',
    productionPush.run.status === 0 &&
    productionPush.updates.length === 1 &&
    productionPush.updates[0].args.includes('--update-sources') &&
    productionPush.output.includes('changed=true') &&
    !productionPush.output.includes('changed=false'));

  const productionManual = executeSpecSync(
    'production-manual-ready', productionWorkflow, 'production', { eventName: 'workflow_dispatch' });
  check('production spec-sync leaves matching probes unchanged only for manual recovery',
    productionManual.run.status === 0 &&
    productionManual.updates.length === 0 &&
    productionManual.output.includes('changed=false') &&
    !productionManual.output.includes('changed=true'));

  const productionManualRepair = executeSpecSync(
    'production-manual-repair', productionWorkflow, 'production', {
      eventName: 'workflow_dispatch',
      readyPath: '/live',
    });
  check('production manual recovery still updates a noncanonical probe spec',
    productionManualRepair.run.status === 0 &&
    productionManualRepair.updates.length === 1 &&
    productionManualRepair.updates[0].args.includes('--update-sources') &&
    productionManualRepair.output.includes('changed=true'));

  const stagingCurrent = executeSpecSync(
    'staging-current-source', stagingWorkflow, 'staging');
  check('staging spec-sync exits without an update only for the current active source',
    stagingCurrent.run.status === 0 &&
    stagingCurrent.updates.length === 0 &&
    stagingCurrent.output.includes('changed=false'));

  const stagingStale = executeSpecSync(
    'staging-stale-source', stagingWorkflow, 'staging', { activeSource: 'stale-source-sha' });
  check('staging spec-sync behaviorally warms a stale source and promotes readiness',
    stagingStale.run.status === 0 &&
    stagingStale.updates.length === 2 &&
    stagingStale.updates[0].args.includes('--update-sources') &&
    !stagingStale.updates[1].args.includes('--update-sources') &&
    stagingStale.output.includes('changed=true') &&
    !stagingStale.output.includes('changed=false'));
} finally {
  fs.rmSync(deployControlTemp, { recursive: true, force: true });
}

const healthScripts = runScriptBlocks(healthWorkflow);
check('the dispatch input is passed through the environment, not interpolated into the script',
  /env:\s*\n\s*HOST:\s*\$\{\{\s*inputs\.host\s*\}\}/.test(healthWorkflow) &&
  healthScripts.length > 0 && healthScripts.every(block => !/\$\{\{/.test(block)));

/* ...and is refused outright unless it looks like a hostname. */
check('the host is validated before it is used',
  /\*\[!a-zA-Z0-9\.-\]\*/.test(healthWorkflow) &&
  /Refusing a host with unexpected characters/.test(healthWorkflow));

/* Execute the actual YAML run block with a fake curl. Static substring checks
 * prove the guards are present; these cases prove their shell control flow
 * accepts a truthful 200/503 pair and fails every false-green shape. */
const healthTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'hnk-health-reader-'));
try {
  const fakeBin = path.join(healthTemp, 'bin');
  fs.mkdirSync(fakeBin);
  const fakeCurl = path.join(fakeBin, 'curl');
  fs.writeFileSync(fakeCurl, `#!/usr/bin/env node
"use strict";
const fs = require("fs");
const args = process.argv.slice(2);
const outputAt = args.indexOf("--output");
if (outputAt >= 0 && args[outputAt + 1]) {
  fs.writeFileSync(args[outputAt + 1], process.env.FAKE_BODY || "");
}
process.stdout.write(process.env.FAKE_HTTP_STATUS || "000");
process.exit(Number(process.env.FAKE_CURL_STATUS || "0"));
`, { mode: 0o755 });

  const readyBody = JSON.stringify({
    ok: true, ready: true, apiVersion: '5.42.1', schema: 4,
    schemaFingerprint: 'abc', tls: 'verified',
  });
  const unreadyBody = JSON.stringify({
    ok: true, ready: false,
    apiVersion: '5.42.1\r# forged heading\n[forged link](https://attacker.invalid)', schema: null,
    schemaFingerprint: null, tls: 'verified',
    error: 'database unavailable\n::error::forged%annotation',
  });
  const streamedBody = `0\n${unreadyBody}`;
  const cases = [
    ['200 ready health JSON', '200', readyBody, '0', true, '::notice::', null],
    ['503 unready health JSON', '503', unreadyBody, '0', true,
      'database unavailable%0A::error::forged%25annotation', '\n::error::forged%annotation'],
    ['404 HTML', '404', '<html>missing</html>', '0', false, 'unexpected HTTP', null],
    ['500 health-shaped JSON', '500', unreadyBody, '0', false, 'unexpected HTTP', null],
    ['200 with ready false', '200', unreadyBody, '0', false, 'inconsistent health status', null],
    ['503 malformed JSON', '503', '{broken', '0', false, 'invalid health JSON', null],
    ['503 multiple JSON documents', '503', streamedBody, '0', false, 'invalid health JSON', null],
    ['curl transport failure', '000', '', '7', false, 'did not answer reliably', null],
  ];
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
    const [label, status, body, curlStatus, expectedSuccess, marker, forbidden] = cases[caseIndex];
    const summaryPath = path.join(healthTemp, `${caseIndex}-${status}-${curlStatus}.md`);
    const run = spawnSync('bash', ['-c', healthScripts[0]], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        HOST: 'example.com',
        RUNNER_TEMP: healthTemp,
        GITHUB_STEP_SUMMARY: summaryPath,
        FAKE_HTTP_STATUS: status,
        FAKE_BODY: body,
        FAKE_CURL_STATUS: curlStatus,
      }),
    });
    const output = `${run.stdout || ''}\n${run.stderr || ''}`;
    const summary = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '';
    const summaryHasInjection = /[\r\n](?:::error::forged|# forged heading|\[forged link\]\()/.test(summary);
    check(`health reader executes the ${label} contract`,
      (run.status === 0) === expectedSuccess && output.includes(marker) &&
      (!forbidden || (!output.includes(forbidden) &&
        !summaryHasInjection)));
  }
} finally {
  fs.rmSync(healthTemp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} DigitalOcean deployment contract check(s) failed.`);
  process.exit(1);
}
console.log('\nAutomatic deploy verification and manual recovery contracts are healthy.');
