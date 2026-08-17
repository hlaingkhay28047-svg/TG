# TG

Adobe Photoshop plugin tools and HNK web app.

## DigitalOcean App Platform

This repository is ready for DigitalOcean App Platform deployment.

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/hlaingkhay28047-svg/TG/tree/main)

### Deployment settings

- Repository: `hlaingkhay28047-svg/TG`
- Branch: `main`
- Resource type: Static Site
- Source directory: `/docs`
- Index document: `index.html`
- Auto deploy on push: enabled when the app uses the authenticated GitHub source in `.do/app.yaml`
- Region: Singapore (`sgp`)
- Production app: `hnk-ai-tools-3`
- Production host: `hnk-ai-tools-3-s4nnu.ondigitalocean.app`

DigitalOcean configuration files:

- `.do/app.yaml` — App Platform spec for GitHub-connected deployment and auto-deploy.
- `.do/deploy.template.yaml` — one-click Deploy to DigitalOcean template.
- `.github/workflows/deploy-digitalocean.yml` — optional force-rebuild deployment automation for the existing production app.

The public website is served from `/docs`, and the web app/PWA is available under `/docs/app` in the repository (served as `/app/` after deployment).

### Updating the existing DigitalOcean app

The one-click button uses a public `git` source. That source is correct for a new public deployment, but it requires a manual deploy to pull later commits.

For production auto-deploy, connect the existing app to authenticated GitHub once:

1. Authorize DigitalOcean App Platform to access `hlaingkhay28047-svg/TG`.
2. Open **App → Settings → App Spec → Edit**.
3. In the existing `hnk-web` component, replace only its `git:` source block with:

   ```yaml
   github:
     repo: hlaingkhay28047-svg/TG
     branch: main
     deploy_on_push: true
   ```

4. Preserve the app's generated domains, ingress, alerts, and all other fields, then save the spec.

Until that one-time migration is complete, use **Actions → Force rebuild and deploy** in DigitalOcean after merging a release to `main`. This pulls the newest configured source and rebuilds the static site from scratch.

### Optional GitHub force-deploy automation

`.github/workflows/deploy-digitalocean.yml` can perform the same production force rebuild after a push to `main`. It is intentionally inert until the repository has a DigitalOcean API token secret named `DIGITALOCEAN_ACCESS_TOKEN` (the aliases `DIGITALOCEAN_TOKEN` and `DO_TOKEN` are also accepted).

When credentials are present, the workflow:

1. Resolves the existing `hnk-ai-tools-3` app instead of creating a new app.
2. Pulls the latest configured source with `--update-sources`.
3. Requests a `--force-rebuild` and waits for DigitalOcean to finish.
4. Polls the production `/app/version.json` endpoint and verifies that the live version matches the repository release version before reporting success.

No DigitalOcean token is stored in repository files or logs.
