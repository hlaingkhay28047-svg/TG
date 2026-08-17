const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-digitalocean.yml'), 'utf8');
const failures = [];

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) failures.push(label);
}

check('production deploy workflow is manual-only', !/^\s*push\s*:/m.test(workflow));
check('manual dispatch is available', /workflow_dispatch\s*:/m.test(workflow));
check('production app name is locked', /DO_APP_NAME:\s*hnk-ai-tools-3\b/.test(workflow));
check('production host is locked', /DO_APP_HOST:\s*hnk-ai-tools-3-s4nnu\.ondigitalocean\.app\b/.test(workflow));
check('three accepted token secret aliases are supported',
  ['DIGITALOCEAN_ACCESS_TOKEN', 'DIGITALOCEAN_TOKEN', 'DO_TOKEN'].every(name => workflow.includes(`secrets.${name}`)));
check('no DigitalOcean personal-access-token literal is committed', !/dop_v1_[A-Za-z0-9_-]{20,}/.test(workflow));
check('deployment pulls latest configured source', workflow.includes('--update-sources'));
check('deployment forces a clean rebuild', workflow.includes('--force-rebuild'));
check('deployment waits for completion', workflow.includes('--wait'));
check('deploy job has a finite timeout', /timeout-minutes:\s*25\b/.test(workflow));
check('repository checkout is pinned to reviewed checkout v6.0.2 SHA',
  workflow.includes('actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd'));
check('doctl binary version is explicit', /version:\s*1\.164\.0\b/.test(workflow));
check('post-deploy verification reads the repo release version', workflow.includes('docs/app/version.json'));
check('post-deploy verification checks the live app version endpoint', workflow.includes('/app/version.json'));
check('live verification is cache-busted by commit SHA', workflow.includes('sha=${GITHUB_SHA}'));
check('live verification retries for propagation', /seq\s+1\s+18/.test(workflow) && /sleep\s+5/.test(workflow));
check('missing credentials keep deployment deferred safely', workflow.includes('GitHub work can finish first'));

if (failures.length) {
  console.error(`\n${failures.length} DigitalOcean deployment contract check(s) failed.`);
  process.exit(1);
}

console.log('\nDigitalOcean deployment workflow is healthy and manual-only.');
