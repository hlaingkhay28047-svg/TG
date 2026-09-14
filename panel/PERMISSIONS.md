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

`https://api.open-meteo.com` (v6.11.0) is the Home card's weather line: one
keyless request for the current temperature and sky at the coordinates of the
city named by the device's own IANA time zone — never a geolocation prompt,
never an address, nothing about the member. The reading is kept thirty
minutes; offline, the line is simply absent.

`https://*.xiaoyaoyou.com` (v6.151.0) is RunningHub's own file storage. Every
reference the panel uploads and every finished picture RunningHub hands back
is a URL on that host (the probe lane's upload answer names
`rh-hk-images-switch.xiaoyaoyou.com`), and a UXP plugin may only fetch the
hosts its manifest lists. Without it the panel could submit and pay for a task
and never be allowed to download its result — which is exactly what the
owner's 6.150.0 photograph showed as "cannot reach RunningHub".

`https://*.myqcloud.com` and `https://*.cos.ap-hongkong.myqcloud.com`
(v6.152.0) are where RunningHub's finished pictures actually live: Tencent
Cloud COS. The owner's 6.151.0 photograph carried the panel's own refusal,
word for word — "Permission denied to the url
rh-hk-images-1252422369.cos.ap-hongkong.myqcloud.com Manifest entry not
found" — after a paid task had reached SUCCESS. The xiaoyaoyou host above is
the upload side; the result side is this one. Both forms are listed because
UXP documents the wildcard for one subdomain label and the bucket host is
four labels deep.

Web pictures for a photo slot (v6.153.0) come through the studio's own API
when the picture's host is not listed here. A "Web" import first tries the
host itself; under UXP that succeeds only for the hosts above and Photoshop
refuses every other one with "Permission denied to the url <host> Manifest
entry not found." (the owner's 6.152.0 photographs). The panel then asks
`GET /v1/image?url=…` on the studio API — signed-in members only, image
bodies only, 25 MB, three redirects, every hostname resolved and refused when
any address is private — which the manifest already allows. The list needs
no picture hosts for this, and never gains `"all"`.

Clipboard access supports explicit Copy/Paste actions for prompts, diagnostic
logs, and image URLs. Remote webviews remain user-initiated and are restricted
to the domains listed in `manifest.json`. No HNK admin key, service credential,
JWT signing secret, or database password belongs in the package.

The tracked ZIP build is the reproducible CI artifact. Before broad Creative
Cloud distribution, the same source must also be packaged and install-tested
with Adobe UXP Developer Tool on each supported Photoshop platform.
