/* ============================================================
   HNK AI Tools — Image Import Service
   Spec §5 (Slot input methods: Active Layer · File · Paste · Web Link)
   · §11/§24 (invalid web image blocks Generate)

   Turns each slot input method into a normalized slot descriptor the Free
   Generate / Workflow state can hold:
       { source, ref, valid, width, height, reason? }
   All host I/O (reading files, fetching URLs, capturing the active layer) is
   delegated to an injected `host` so this module is unit-testable with a stub
   and carries the validation/normalization logic itself.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _fail(source, reason) {
  return { source: source, ref: null, valid: false, width: 0, height: 0, reason: reason };
}
function _ok(source, res) {
  return {
    source: source,
    ref: res.ref,
    valid: true,
    width: (res.width | 0) || 0,
    height: (res.height | 0) || 0
  };
}

/* URL must be http(s) and look like an image the host can fetch (spec §5). */
function isLikelyImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url.trim())) return false;
  return true;
}

/* v6.59.0 — the link a studio actually copies.
   The owner asked for photos to come in "from the web, the way you get one off
   Pinterest". What a phone or a browser gives you there is a link to the PAGE,
   not to the picture: pinterest.com/pin/12345, instagram.com/p/…, a Facebook
   photo permalink. isLikelyImageUrl accepts any http(s) string, so those all
   passed validation, went to the host, came back HTML instead of an image, and
   the studio was told "check the URL and try again" — which is true and
   useless, because the URL is fine, it is just the wrong one.
   Naming the case is the whole fix: the message can then say the one thing
   that works — long-press or right-click the picture itself and copy the IMAGE
   address (it ends .jpg/.png/.webp). Matching is on the host, never on the
   path, so a direct pinimg.com/… image link still loads normally. */
var PAGE_HOSTS = ["pinterest.", "pin.it", "instagram.com", "facebook.com", "fb.watch",
  "twitter.com", "x.com", "weibo.com", "xiaohongshu.com", "xhslink.com",
  "tiktok.com", "threads.net", "behance.net", "dribbble.com"];
function isPageLink(url) {
  var u = String(url || "").trim().toLowerCase();
  if (!/^https?:\/\//.test(u)) return false;
  var host = u.replace(/^https?:\/\//, "").split(/[\/?#]/)[0];
  /* a direct image URL is never a page link, whatever the host */
  if (/\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)/.test(u)) return false;
  for (var i = 0; i < PAGE_HOSTS.length; i++) if (host.indexOf(PAGE_HOSTS[i]) >= 0) return true;
  return false;
}

/* host.captureActiveLayer() -> { ref, width, height } | throws/null */
function fromActiveLayer(host) {
  try {
    if (!host || !host.captureActiveLayer) return _fail("active-layer", "no-host");
    var res = host.captureActiveLayer();
    if (res && typeof res.then === "function") return res.then(function (r) {
      return r && r.ref ? _ok("active-layer", r) : _fail("active-layer", "no-active-layer");
    }, function () { return _fail("active-layer", "no-active-layer"); });
    return res && res.ref ? _ok("active-layer", res) : _fail("active-layer", "no-active-layer");
  } catch (e) { return _fail("active-layer", "no-active-layer"); }
}

/* host.readImageFile(file) -> { ref, width, height } */
function fromFile(host, file) {
  try {
    if (!host || !host.readImageFile) return _fail("file", "no-host");
    var res = host.readImageFile(file);
    if (res && typeof res.then === "function") return res.then(function (r) {
      return r && r.ref ? _ok("file", r) : _fail("file", "unreadable");
    }, function () { return _fail("file", "unreadable"); });
    return res && res.ref ? _ok("file", res) : _fail("file", "unreadable");
  } catch (e) { return _fail("file", "unreadable"); }
}

/* host.readClipboardImage() -> { ref, width, height } */
function fromPaste(host) {
  try {
    if (!host || !host.readClipboardImage) return _fail("paste", "no-host");
    var res = host.readClipboardImage();
    if (res && typeof res.then === "function") return res.then(function (r) {
      return r && r.ref ? _ok("paste", r) : _fail("paste", "no-clipboard-image");
    }, function () { return _fail("paste", "no-clipboard-image"); });
    return res && res.ref ? _ok("paste", res) : _fail("paste", "no-clipboard-image");
  } catch (e) { return _fail("paste", "no-clipboard-image"); }
}

/* host.fetchImageUrl(url) -> { ref, width, height } ; invalid URLs are rejected
   before the host is touched so the validator can show the §24 message. */
function fromWebLink(host, url) {
  if (!isLikelyImageUrl(url)) return _fail("web-link", "invalid-url");
  if (isPageLink(url)) return _fail("web-link", "page-link");
  try {
    if (!host || !host.fetchImageUrl) return _fail("web-link", "no-host");
    var res = host.fetchImageUrl(url);
    if (res && typeof res.then === "function") return res.then(function (r) {
      return r && r.ref ? _ok("web-link", r) : _fail("web-link", "fetch-failed");
    }, function () { return _fail("web-link", "fetch-failed"); });
    return res && res.ref ? _ok("web-link", res) : _fail("web-link", "fetch-failed");
  } catch (e) { return _fail("web-link", "fetch-failed"); }
}

/* v6.19: each reason code above already pinpoints the exact fix (open a
   document, select the right layer, pick a real image file) — this was
   computed correctly but silently dropped by both screens that consume a
   slot. dom is passed in so the message can go through dom.t() (i18n) with
   this English text as the fallback, matching how every other panel string
   is looked up. */
function reasonMessage(dom, reason) {
  var MAP = {
    "no-host":            ["slot_reason_no_host", "Photoshop connection not available — try again."],
    "no-active-layer":    ["slot_reason_no_active_layer", "No document/layer selected — open the photo and select its layer, then try again."],
    "unreadable":         ["slot_reason_unreadable", "Could not read that file — pick a valid image file."],
    "no-clipboard-image": ["slot_reason_no_clipboard", "No image on the clipboard — copy an image first."],
    "invalid-url":        ["slot_reason_invalid_url", "That doesn't look like a valid image link (must start with http/https)."],
    "fetch-failed":       ["slot_reason_fetch_failed", "Could not load that image link — check the URL and try again."],
    "page-link":          ["slot_reason_page_link", "That is a link to the page, not to the picture — open the image, then copy the IMAGE address (it ends .jpg / .png / .webp)."]
  };
  var e = MAP[reason];
  if (!e) return "";
  return dom && typeof dom.t === "function" ? dom.t(e[0], e[1]) : e[1];
}

var API = {
  isLikelyImageUrl: isLikelyImageUrl,
  isPageLink: isPageLink,
  fromActiveLayer: fromActiveLayer,
  fromFile: fromFile,
  fromPaste: fromPaste,
  fromWebLink: fromWebLink,
  reasonMessage: reasonMessage
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.imageImportService = API; }
})();
