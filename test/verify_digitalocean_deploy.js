const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const productionWorkflow = read('.github/workflows/deploy-digitalocean.yml');
const stagingWorkflow = read('.github/workflows/deploy-digitalocean-staging.yml');
const verifyWorkflow = read('.github/workflows/verify-digitalocean-deploy.yml');
const productionSpec = read('.do/app.yaml');
const stagingSpec = read('.do/staging.app.yaml');
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
check('production verification is cache-busted by commit SHA', productionWorkflow.includes('sha=${GITHUB_SHA}'));
check('production live verification consumes the shared job deadline', productionWorkflow.includes('DEADLINE_EPOCH="${JOB_DEADLINE_EPOCH:?deployment deadline was not recorded}"') && !productionWorkflow.includes('DEADLINE=$((SECONDS + 1800))') && !productionWorkflow.includes('seq 1 120'));
check('production workflow leaves headroom for its scripted diagnostic', /timeout-minutes:\s*35\b/.test(productionWorkflow));

check('staging workflow follows every upgrade branch push', /push:\s*\n\s*branches:\s*\[upgrade-safe-wave\]/m.test(stagingWorkflow));
check('staging manual dispatch exposes explicit force_rebuild recovery', /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force_rebuild:/m.test(stagingWorkflow));
check('staging manual dispatch is restricted to upgrade-safe-wave', stagingWorkflow.includes('refs/heads/upgrade-safe-wave'));
check('staging app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-2\b/.test(stagingWorkflow));
check('staging host is locked', /DO_APP_HOST:\s*hnk-ai-tools-2-gibhz\.ondigitalocean\.app\b/.test(stagingWorkflow));
check('staging verifies version plus exact landing and app HTML', stagingWorkflow.includes('/app/version.json') && stagingWorkflow.includes('sha256sum docs/index.html') && stagingWorkflow.includes('sha256sum docs/app/index.html'));
check('staging verification is cache-busted by commit SHA', stagingWorkflow.includes('sha=${GITHUB_SHA}'));
check('staging live verification consumes the shared job deadline', stagingWorkflow.includes('DEADLINE_EPOCH="${JOB_DEADLINE_EPOCH:?deployment deadline was not recorded}"') && !stagingWorkflow.includes('DEADLINE=$((SECONDS + 1800))') && !stagingWorkflow.includes('seq 1 120'));
check('staging workflow leaves headroom for its scripted diagnostic', /timeout-minutes:\s*35\b/.test(stagingWorkflow));
check('staging deploy concurrency cancels stale builds', /group:\s*digitalocean-staging[\s\S]*?cancel-in-progress:\s*true/.test(stagingWorkflow));

const manualRecovery = "github.event_name == 'workflow_dispatch' && inputs.force_rebuild == true && steps.auth.outputs.available == 'true'";
check('API recovery is manual-only in both lanes',
  occurrences(productionWorkflow, manualRecovery) === 3 && occurrences(stagingWorkflow, manualRecovery) === 3);
check('manual recovery fails closed when its token is absent',
  productionWorkflow.includes("inputs.force_rebuild == true && steps.auth.outputs.available != 'true'") &&
  stagingWorkflow.includes("inputs.force_rebuild == true && steps.auth.outputs.available != 'true'"));
check('manual recovery validates the actual DigitalOcean repo and branch before mutation',
  [productionWorkflow, stagingWorkflow].every(workflow => workflow.includes('.github.repo == $repo') && workflow.includes('.github.branch == $branch') && workflow.indexOf('.github.repo == $repo') < workflow.indexOf('apps create-deployment')));
check('manual recovery still pulls, rebuilds, and waits exactly once per lane',
  [productionWorkflow, stagingWorkflow].every(workflow => occurrences(workflow, 'apps create-deployment') === 1 && workflow.includes('--update-sources') && workflow.includes('--force-rebuild') && workflow.includes('--wait')));
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
check('action-doctl is pinned to reviewed v2.5.2 SHA in both recovery lanes',
  [productionWorkflow, stagingWorkflow].every(workflow => workflow.includes('digitalocean/action-doctl@3cb3953159719656269e044e0e24ca16dd2a690f')));
check('doctl binary version is explicit and current in both recovery lanes',
  /version:\s*1\.166\.0\b/.test(productionWorkflow) && /version:\s*1\.166\.0\b/.test(stagingWorkflow));

check('production spec app is hnk-ai-tools-3', /^name:\s*hnk-ai-tools-3\s*$/m.test(productionSpec));
check('production spec stays on main', /branch:\s*main\b/.test(productionSpec));
check('production DigitalOcean source auto-deploy is enabled', /deploy_on_push:\s*true\b/.test(productionSpec));
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
[['production', productionSpec], ['staging', stagingSpec]].forEach(([lane, spec]) => {
  const bindings = (spec.match(/value:\s*\$\{[^}]*\.DATABASE_URL\}/g) || [])
    .map(line => line.replace(/^value:\s*/, ''));
  const components = bindings.map(b => b.slice(2, b.indexOf('.')));
  check(`${lane} spec binds DATABASE_URL under both component names`,
    components.includes('hnk-db') && components.includes('db'));
  /* ...and they must be separate KEYS. Two values under one key is a spec that
     overwrites itself, which looks right and delivers only the last one. */
  check(`${lane} spec gives the second binding its own key`,
    occurrences(spec, '- key: DATABASE_URL') === 2 &&
    /- key: DATABASE_URL\n/.test(spec) &&
    /- key: DATABASE_URL_[A-Z_]+\n/.test(spec));
});

if (failures.length) {
  console.error(`\n${failures.length} DigitalOcean deployment contract check(s) failed.`);
  process.exit(1);
}
console.log('\nAutomatic deploy verification and manual recovery contracts are healthy.');
