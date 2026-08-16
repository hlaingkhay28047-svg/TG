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

DigitalOcean configuration files:

- `.do/app.yaml` — App Platform spec for GitHub-connected deployment and auto-deploy.
- `.do/deploy.template.yaml` — one-click Deploy to DigitalOcean template.

The public website is served from `/docs`, and the web app/PWA is available under `/docs/app` in the repository (served as `/app/` after deployment).

### Updating an existing DigitalOcean app

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

Until that one-time migration is complete, use **Actions → Deploy** in DigitalOcean after merging a release to `main`.
