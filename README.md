# TG

Adobe Photoshop plugin tools and HNK web app.

## Release order

HNK upgrade work runs in two lanes at the same time without touching production:

1. GitHub development happens on `upgrade-safe-wave`; every change is reviewed by pull-request CI.
2. DigitalOcean staging uses `hnk-ai-tools-2` and follows the same `upgrade-safe-wave` branch with `deploy_on_push: true`.
3. Production remains `hnk-ai-tools-3` and is not deployed automatically by the GitHub production workflow.
4. Only after the upgrade branch is complete and CI is green do we merge to `main` and perform the final production deployment.

This gives a real browser-hosted DigitalOcean copy while GitHub tests run, without exposing unfinished code on the production app.

## DigitalOcean App Platform

This repository is ready for DigitalOcean App Platform deployment.

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/hlaingkhay28047-svg/TG/tree/main)

### Deployment settings

- Repository: `hlaingkhay28047-svg/TG`
- Production branch: `main`
- Upgrade/staging branch: `upgrade-safe-wave`
- Resource type: Static Site
- Source directory: `/docs`
- Index document: `index.html`
- Region: Singapore (`sgp`)
- Staging app: `hnk-ai-tools-2`
- Production app: `hnk-ai-tools-3`
- Production host: `hnk-ai-tools-3-s4nnu.ondigitalocean.app`

DigitalOcean configuration files:

- `.do/app.yaml` — production GitHub source contract for `main`.
- `.do/staging.app.yaml` — staging GitHub source contract for `upgrade-safe-wave`, with deploy-on-push enabled.
- `.do/deploy.template.yaml` — one-click Deploy to DigitalOcean template.
- `.github/workflows/deploy-digitalocean.yml` — manual production force-rebuild automation for `hnk-ai-tools-3`.

The public website is served from `/docs`, and the web app/PWA is available under `/docs/app` in the repository (served as `/app/` after deployment).

### Staging: GitHub + DigitalOcean together

Configure `hnk-ai-tools-2` once with the authenticated GitHub source defined in `.do/staging.app.yaml`:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: upgrade-safe-wave
  deploy_on_push: true
```

After that one-time DigitalOcean setup, every push to `upgrade-safe-wave` runs GitHub CI and triggers a staging deployment in parallel. Staging can be tested on phones and browsers while production stays on the last approved release.

### Production deployment

For production, do not deploy while upgrade work is still in progress. After the release PR is reviewed, all tests pass, and the intended commit is on `main`, use **Actions → Force rebuild and deploy** in DigitalOcean or run the manual GitHub production workflow.

`.github/workflows/deploy-digitalocean.yml` is started only with `workflow_dispatch`; a normal push does not run this production deployment workflow. It is intentionally inert until the repository has a DigitalOcean API token secret named `DIGITALOCEAN_ACCESS_TOKEN` (the aliases `DIGITALOCEAN_TOKEN` and `DO_TOKEN` are also accepted).

When manually started with credentials present, the workflow:

1. Resolves the existing `hnk-ai-tools-3` app instead of creating a new app.
2. Pulls the latest configured source with `--update-sources`.
3. Requests a `--force-rebuild` and waits for DigitalOcean to finish.
4. Polls the production `/app/version.json` endpoint and verifies that the live version matches the repository release version before reporting success.

No DigitalOcean token is stored in repository files or logs.
