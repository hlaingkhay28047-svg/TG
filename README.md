# TG

Adobe Photoshop plugin tools and HNK web app.

## Release order

HNK releases are prepared **GitHub first**. Finish the code, review the pull request, and let the complete test suite pass before touching DigitalOcean. Production deployment is the final step after the GitHub release is ready.

## DigitalOcean App Platform

This repository is ready for DigitalOcean App Platform deployment.

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/hlaingkhay28047-svg/TG/tree/main)

### Deployment settings

- Repository: `hlaingkhay28047-svg/TG`
- Branch: `main`
- Resource type: Static Site
- Source directory: `/docs`
- Index document: `index.html`
- App spec supports authenticated GitHub auto-deploy, but the production force-deploy workflow itself is manual-only.
- Region: Singapore (`sgp`)
- Production app: `hnk-ai-tools-3`
- Production host: `hnk-ai-tools-3-s4nnu.ondigitalocean.app`

DigitalOcean configuration files:

- `.do/app.yaml` — App Platform spec for a GitHub-connected deployment.
- `.do/deploy.template.yaml` — one-click Deploy to DigitalOcean template.
- `.github/workflows/deploy-digitalocean.yml` — manual production force-rebuild automation for the existing production app.

The public website is served from `/docs`, and the web app/PWA is available under `/docs/app` in the repository (served as `/app/` after deployment).

### Updating the existing DigitalOcean app

The one-click button uses a public `git` source. That source is correct for a new public deployment, but it requires a manual deploy to pull later commits.

For an authenticated GitHub source, DigitalOcean can also be configured with:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: main
  deploy_on_push: true
```

Preserve the app's generated domains, ingress, alerts, and all other fields when changing its source settings.

For the current GitHub-first release process, do **not** deploy while upgrade work is still in progress. After the release PR is reviewed, all tests pass, and the intended commit is on `main`, use **Actions → Force rebuild and deploy** in DigitalOcean or run the manual GitHub production workflow. This pulls the newest configured source and rebuilds the static site from scratch.

### Manual GitHub force-deploy automation

`.github/workflows/deploy-digitalocean.yml` is started only with `workflow_dispatch`; a normal push does not run this production deployment workflow. It is also intentionally inert until the repository has a DigitalOcean API token secret named `DIGITALOCEAN_ACCESS_TOKEN` (the aliases `DIGITALOCEAN_TOKEN` and `DO_TOKEN` are also accepted).

When manually started with credentials present, the workflow:

1. Resolves the existing `hnk-ai-tools-3` app instead of creating a new app.
2. Pulls the latest configured source with `--update-sources`.
3. Requests a `--force-rebuild` and waits for DigitalOcean to finish.
4. Polls the production `/app/version.json` endpoint and verifies that the live version matches the repository release version before reporting success.

No DigitalOcean token is stored in repository files or logs.
