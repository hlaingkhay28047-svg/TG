# TG — HNK Create Studio

Adobe Photoshop panel (`docs/download/*.ccx`) + HNK web app (`docs/app/`) +
landing site (`docs/index.html`), deployed as DigitalOcean static sites.

## Standing release policy (owner instruction, 2026-08-18)

**Every completed fix or upgrade goes live everywhere immediately once tests
are green.** The owner has granted standing approval — do not hold tested
work on staging waiting for per-wave sign-off:

1. Develop on `upgrade-safe-wave`. Every push autodeploys staging
   `hnk-ai-tools-2` and runs the full CI sweep on the open PR.
2. When local + CI checks are green, merge the PR to `main` right away.
   `main` autodeploys production `hnk-ai-tools-3` (authenticated GitHub
   binding, `deploy_on_push: true`); both deploy workflows verify the live
   `/app/version.json` and the exact SHA-256 of landing and app HTML.
3. Verify the production deploy run succeeded before calling the work done.
4. Web app, landing site and Photoshop panel ship together: a panel change
   bumps the panel version (new `.ccx` + `panel-version.json` + download
   links) and the web app version in lockstep (`APP_VER`, `version.json`,
   service-worker cache name, landing badges, JSON-LD).

The tests are the gate: never merge red, never skip or weaken a check to
get green, and never expose or commit API keys or tokens.

## Testing

- Full suite: the ~80 `test/*.js` scripts, in the order listed in
  `.github/workflows/test.yml` (serve `docs/app` on port 8931 first;
  Playwright 1.62.1 pinned).
- `test/verify_release_contract.js` and `test/verify_digitalocean_deploy.js`
  pin the release/CI/deploy contracts — run them after any version bump,
  README release-flow edit, or workflow change.

## Hard-won rules

- RunningHub `rhart-*` apiPaths are server-side deployments — never invent
  new ones client-side; list only endpoints that actually exist.
- The one-click template (`.do/deploy.template.yaml`) stays a public-git
  source with no `deploy_on_push` — that contract is tested.
- `docs/app/index.html` is one large file; the panel `.ccx` is a plain zip
  whose `manifest.json` version must equal `panel-version.json` and the
  download filename.
