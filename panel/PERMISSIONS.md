# HNK Panel permission rationale

The production manifest uses an explicit network allowlist. It includes the HNK
license API, the three AI providers supported by the panel, and the web editors
that users can deliberately open inside the panel. The retired Supabase project
and unrestricted `domains: all` permission are not present.

`localFileSystem: fullAccess` remains necessary because the panel's documented
batch workflow, reference-image library, recipe import/export, and result export
operate on folders selected by the user. The panel does not scan unrelated
folders automatically. Removing this permission would disable those core
Photoshop workflows rather than merely narrow an implementation detail.

Clipboard access supports explicit Copy/Paste actions for prompts, diagnostic
logs, and image URLs. Remote webviews remain user-initiated and are restricted
to the domains listed in `manifest.json`. No HNK admin key, service credential,
JWT signing secret, or database password belongs in the package.

The tracked ZIP build is the reproducible CI artifact. Before broad Creative
Cloud distribution, the same source must also be packaged and install-tested
with Adobe UXP Developer Tool on each supported Photoshop platform.
