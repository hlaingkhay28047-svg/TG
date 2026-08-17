const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productionWorkflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-digitalocean.yml'), 'utf8');
const stagingWorkflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-digitalocean-staging.yml'), 'utf8');
const productionSpec = fs.readFileSync(path.join(root, '.do/app.yaml'), 'utf8');
const stagingSpec = fs.readFileSync(path.join(root, '.do/staging.app.yaml'), 'utf8');
const failures = [];

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) failures.push(label);
}

check('production workflow follows every main push', /push:\s*\n\s*branches:\s*\[main\]/m.test(productionWorkflow));
check('production manual dispatch remains available', /workflow_dispatch\s*:/m.test(productionWorkflow));
check('production app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-3\b/.test(productionWorkflow));
check('production host is locked', /DO_APP_HOST:\s*hnk-ai-tools-3-s4nnu\.ondigitalocean\.app\b/.test(productionWorkflow));
check('production verifies the live release version', productionWorkflow.includes('/app/version.json'));
check('production verification is cache-busted by commit SHA', productionWorkflow.includes('sha=${GITHUB_SHA}'));
check('production live verification has a bounded propagation wait', /seq\s+1\s+30/.test(productionWorkflow) && /sleep\s+10/.test(productionWorkflow));
check('production API fallback pulls latest configured source', productionWorkflow.includes('--update-sources'));
check('production API fallback forces rebuild', productionWorkflow.includes('--force-rebuild'));
check('production API fallback waits for completion', productionWorkflow.includes('--wait'));
check('production workflow has a finite timeout', /timeout-minutes:\s*25\b/.test(productionWorkflow));

check('staging workflow follows every upgrade branch push', /push:\s*\n\s*branches:\s*\[upgrade-safe-wave\]/m.test(stagingWorkflow));
check('staging app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-2\b/.test(stagingWorkflow));
check('staging deploy concurrency cancels stale builds', /group:\s*digitalocean-staging/.test(stagingWorkflow) && /cancel-in-progress:\s*true/.test(stagingWorkflow));
check('staging API fallback pulls latest configured source', stagingWorkflow.includes('--update-sources'));
check('staging API fallback forces rebuild', stagingWorkflow.includes('--force-rebuild'));
check('staging API fallback waits for completion', stagingWorkflow.includes('--wait'));

const combinedWorkflows = productionWorkflow + '\n' + stagingWorkflow;
check('three accepted token secret aliases are supported',
  ['DIGITALOCEAN_ACCESS_TOKEN', 'DIGITALOCEAN_TOKEN', 'DO_TOKEN'].every(name => combinedWorkflows.includes(`secrets.${name}`)));
check('no DigitalOcean personal-access-token literal is committed', !/dop_v1_[A-Za-z0-9_-]{20,}/.test(combinedWorkflows));
check('repository checkout is pinned to reviewed checkout v6.0.2 SHA',
  productionWorkflow.includes('actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd') &&
  stagingWorkflow.includes('actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd'));
check('doctl binary version is explicit in both fallbacks',
  /version:\s*1\.164\.0\b/.test(productionWorkflow) && /version:\s*1\.164\.0\b/.test(stagingWorkflow));

check('production spec stays on main', /branch:\s*main\b/.test(productionSpec));
check('production DigitalOcean source auto-deploy is enabled', /deploy_on_push:\s*true\b/.test(productionSpec));
check('staging app is hnk-ai-tools-2', /^name:\s*hnk-ai-tools-2\s*$/m.test(stagingSpec));
check('staging source is upgrade-safe-wave', /branch:\s*upgrade-safe-wave\b/.test(stagingSpec));
check('staging DigitalOcean source auto-deploy is enabled', /deploy_on_push:\s*true\b/.test(stagingSpec));
check('staging and production both serve docs', /source_dir:\s*\/docs\b/.test(stagingSpec) && /source_dir:\s*\/docs\b/.test(productionSpec));

if (failures.length) {
  console.error(`\n${failures.length} DigitalOcean deployment contract check(s) failed.`);
  process.exit(1);
}

console.log('\nAutomatic staging + production live-upgrade contract is healthy.');
