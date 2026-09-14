"use strict";
/* ============================================================
   v6.82.0 — GET /v1/image?url=…  : a web picture, fetched by the studio's
   own API for a signed-in member.

   WHY IT EXISTS. The Photoshop panel runs under a UXP manifest allowlist:
   fetch() to any host not named there is refused ("Permission denied to the
   url <host> Manifest entry not found."). "Web" on a photo slot therefore
   worked only for the handful of hosts the manifest names — the owner's
   6.152.0 photographs say "choose web မရဘူး". The web app has the same wall
   in a different shape (a picture host that sends no CORS header). Both
   surfaces can always reach hnkaistudio.com, so the picture comes through
   here: the client asks for a URL, the API fetches it and hands the bytes
   back with their content type.

   WHAT HOLDS THE SECURITY (this is a server that fetches what it is told to).
     1. Only http(s), no credentials in the URL, no IP-literal or private
        host: every hostname is resolved first and EVERY address must be
        public — loopback, RFC 1918, link-local, CGNAT, multicast, the IPv6
        equivalents and v4-mapped v6 are refused. The request is then pinned
        to the resolved address (custom lookup), so a DNS answer cannot
        change between the check and the connection (rebinding).
     2. Redirects are followed at most three times and each hop goes through
        the same checks.
     3. Only image/* bodies come back, at most MAX_BYTES, within TIMEOUT_MS;
        anything else is a typed ApiError, never a relayed page.
     4. The caller must be a signed-in member (v1.handle requires identity
        before this route is reached) — the proxy is not open to the world.
   ============================================================ */
const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");
const { ApiError } = require("./api-error");

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "HNK-Create-Studio image fetch/6.82.0";

/* An address a member must never be able to make this server talk to. */
function isPrivateAddress(ip) {
  const s = String(ip || "").trim().toLowerCase();
  if (!s) return true;
  if (net.isIPv4(s)) {
    const p = s.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;        // CGNAT
    if (p[0] === 169 && p[1] === 254) return true;                     // link-local, cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 192 && p[1] === 0 && (p[2] === 0 || p[2] === 2)) return true;
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
    if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;
    if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
    if (p[0] >= 224) return true;                                      // multicast + reserved + broadcast
    return false;
  }
  if (net.isIPv6(s)) {
    const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (v4) return isPrivateAddress(v4[1]);
    if (s === "::" || s === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(s)) return true;                     // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(s)) return true;                     // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(s)) return true;                        // multicast
    if (/^64:ff9b:/.test(s)) return true;                              // NAT64 — could map to anything
    if (/^2001:db8:/.test(s)) return true;                             // documentation
    return false;
  }
  return true;
}

/* The URL a member may ask for: http(s), a real hostname, no credentials,
   no IP literal (an address is checked after resolution, never named). */
function parseTarget(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); }
  catch (e) { throw new ApiError(400, "That is not a valid web address.", "invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ApiError(400, "Only http and https links can be fetched.", "invalid_url");
  if (u.username || u.password) throw new ApiError(400, "A link with a password in it cannot be fetched.", "invalid_url");
  const host = String(u.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new ApiError(400, "That is not a valid web address.", "invalid_url");
  if (net.isIP(host)) throw new ApiError(403, "Links to a numeric address are not fetched.", "address_refused");
  if (host === "localhost" || /\.(localhost|local|internal|home|lan|intranet)$/.test(host) || host.indexOf(".") < 0) {
    throw new ApiError(403, "Links to a private host are not fetched.", "address_refused");
  }
  const port = u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
  if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443) throw new ApiError(403, "Links on that port are not fetched.", "address_refused");
  return u;
}

/* Every address the name resolves to must be public. Returns the one the
   connection will be pinned to. */
async function resolvePublic(hostname, lookup) {
  const doLookup = lookup || ((h) => dns.promises.lookup(h, { all: true, verbatim: true }));
  let addrs;
  try { addrs = await doLookup(hostname); }
  catch (e) { throw new ApiError(502, "That host could not be found.", "fetch_failed"); }
  if (!Array.isArray(addrs) || !addrs.length) throw new ApiError(502, "That host could not be found.", "fetch_failed");
  for (const a of addrs) {
    if (isPrivateAddress(a && a.address)) throw new ApiError(403, "Links to a private host are not fetched.", "address_refused");
  }
  return addrs[0];
}

/* One HTTP(S) request pinned to `addr`; resolves {status, headers, body} or
   {status, headers, redirect}. `request` is injectable for tests. */
function fetchOnce(u, addr, request) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const doRequest = request || mod.request.bind(mod);
    const opts = {
      protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: "GET",
      headers: { "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5", "User-Agent": USER_AGENT },
      timeout: TIMEOUT_MS,
      lookup: (host, o, cb) => { const fam = addr.family || (net.isIPv6(addr.address) ? 6 : 4); if (o && o.all) cb(null, [{ address: addr.address, family: fam }]); else cb(null, addr.address, fam); },
      servername: u.hostname
    };
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; fn(v); };
    const req = doRequest(opts, (res) => {
      const status = res.statusCode || 0;
      const loc = res.headers && res.headers.location;
      if (status >= 300 && status < 400 && loc) { res.resume(); return finish(resolve, { status, headers: res.headers, redirect: String(loc) }); }
      if (status !== 200) { res.resume(); return finish(reject, new ApiError(502, "That link answered " + status + ".", "fetch_failed")); }
      const ct = String((res.headers && res.headers["content-type"]) || "").split(";")[0].trim().toLowerCase();
      if (ct.indexOf("image/") !== 0) { res.resume(); return finish(reject, new ApiError(415, "That link is not a picture — copy the image address itself (it ends .jpg / .png / .webp).", "not_image")); }
      const declared = Number((res.headers && res.headers["content-length"]) || 0);
      if (declared > MAX_BYTES) { res.resume(); return finish(reject, new ApiError(413, "That picture is larger than 25 MB.", "too_large")); }
      const chunks = []; let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > MAX_BYTES) { try { req.destroy(); } catch (e) { } return finish(reject, new ApiError(413, "That picture is larger than 25 MB.", "too_large")); }
        chunks.push(c);
      });
      res.on("end", () => finish(resolve, { status, headers: res.headers, body: Buffer.concat(chunks), contentType: ct }));
      res.on("error", () => finish(reject, new ApiError(502, "The picture could not be read.", "fetch_failed")));
    });
    req.on("timeout", () => { try { req.destroy(); } catch (e) { } finish(reject, new ApiError(504, "That link took too long to answer.", "fetch_timeout")); });
    req.on("error", () => finish(reject, new ApiError(502, "The picture could not be fetched.", "fetch_failed")));
    req.end();
  });
}

/* The one call the route makes. deps.lookup / deps.request are for tests. */
async function fetchImage(rawUrl, deps) {
  deps = deps || {};
  let u = parseTarget(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addr = await resolvePublic(u.hostname, deps.lookup);
    const r = await fetchOnce(u, addr, deps.request);
    if (r.redirect !== undefined) {
      if (hop === MAX_REDIRECTS) throw new ApiError(502, "That link redirects too many times.", "fetch_failed");
      let next;
      try { next = new URL(r.redirect, u); } catch (e) { throw new ApiError(502, "That link redirects somewhere unreadable.", "fetch_failed"); }
      u = parseTarget(next.href);
      continue;
    }
    if (!r.body || !r.body.length) throw new ApiError(502, "That link answered with an empty picture.", "fetch_failed");
    return { bytes: r.body, contentType: r.contentType };
  }
  throw new ApiError(502, "That link redirects too many times.", "fetch_failed");
}

module.exports = { fetchImage, parseTarget, isPrivateAddress, resolvePublic, MAX_BYTES, TIMEOUT_MS, MAX_REDIRECTS };
