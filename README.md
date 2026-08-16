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
- Auto deploy on push: enabled in `.do/app.yaml`
- Region: Singapore (`sgp`)

DigitalOcean configuration files:

- `.do/app.yaml` — App Platform spec for GitHub-connected deployment and auto-deploy.
- `.do/deploy.template.yaml` — one-click Deploy to DigitalOcean template.

The public website is served from `/docs`, and the web app/PWA is available under `/docs/app` in the repository (served as `/app/` after deployment).
