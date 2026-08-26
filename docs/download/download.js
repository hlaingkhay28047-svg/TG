"use strict";

(() => {
  const SESSION_KEY = "hnk_acc_sess_v1";
  const ENTITLEMENT_ENDPOINT = "/api/v1/me/entitlement";
  const DOWNLOAD_ENDPOINT = "/api/v1/downloads/panel";
  const $ = selector => document.querySelector(selector);
  let entitlement = null;
  let countdownTimer = 0;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") || {}; }
    catch (_) { return {}; }
  }

  function token() {
    const current = session();
    return current.access || current.access_token || "";
  }

  function refreshToken() {
    const current = session();
    return current.refresh || current.refresh_token || "";
  }

  async function renew() {
    const refresh = refreshToken();
    if (!refresh) return false;
    const response = await fetch("/api/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      credentials: "same-origin",
    });
    if (!response.ok) return false;
    const body = await response.json();
    const current = session();
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...current,
      access: body.access_token || body.access || current.access,
      refresh: body.refresh_token || body.refresh || current.refresh,
      access_token: body.access_token || body.access || current.access_token,
      refresh_token: body.refresh_token || body.refresh || current.refresh_token,
    }));
    return true;
  }

  async function api(path, options = {}, retried = false) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (token()) headers.set("Authorization", `Bearer ${token()}`);
    if (options.body) headers.set("Content-Type", "application/json");
    let response;
    try { response = await fetch(path, { ...options, headers, credentials: "same-origin" }); }
    catch (_) { throw Object.assign(new Error("The HNK server could not be reached."), { status: 0 }); }
    if (response.status === 401 && !retried && await renew()) return api(path, options, true);
    let body = {};
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) throw Object.assign(new Error(body.message || body.msg || body.error || `Request failed (${response.status})`), { status: response.status });
    return body;
  }

  function value(input, fallback = "—") {
    return input === null || input === undefined || input === "" ? fallback : String(input);
  }

  function label(input) {
    return value(input, "unknown").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  }

  function date(input) {
    if (!input) return "—";
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return value(input);
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
  }

  function showToast(message) {
    const live = $("#downloadLive");
    live.textContent = message;
    live.classList.add("on");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => live.classList.remove("on"), 4200);
  }

  function accountStatus(data) {
    return value(data.account && (data.account.effective_status || data.account.status), "pending").toLowerCase();
  }

  function downloadAllowed(data) {
    const account = accountStatus(data);
    const license = data.license || {};
    const permissions = data.permissions || {};
    const devices = data.devices || {};
    const serverAllowed = data.allowed && typeof data.allowed === "object" ? data.allowed.ccx_download ?? data.allowed.download : data.allowed;
    return account === "active" && Boolean(license.active || license.status === "active") && permissions.ccx_download === true && Boolean(devices.computer) && serverAllowed !== false;
  }

  function reasonFor(data) {
    const status = accountStatus(data);
    const license = data.license || {};
    const permissions = data.permissions || {};
    const devices = data.devices || {};
    const messages = {
      pending: ["Approval pending", "An administrator must approve your registration before panel delivery is available."],
      suspended: ["Account suspended", "Web App and panel access are paused. Contact HNK Studio for assistance."],
      expired: ["Account expired", "Your license has expired. Renew it before requesting the panel."],
      banned: ["Account banned", "This account cannot request or use the Photoshop Panel."],
      rejected: ["Registration rejected", "This registration was not approved for HNK Studio access."],
    };
    if (status !== "active") return messages[status] || ["Account unavailable", "Your account is not currently eligible for panel delivery."];
    if (!(license.active || license.status === "active")) return ["License inactive", "A current license is required for Web App and Photoshop Panel access."];
    if (permissions.ccx_download !== true) return ["Download disabled", "Panel download permission is currently disabled for this account."];
    if (!devices.computer) return ["Computer not registered", "Open the Student App on your Computer and register its shared Computer slot first."];
    return ["Panel download available", "All server checks passed. Create a short-lived link when you are ready to download."];
  }

  function fact(name, display) {
    const item = document.createElement("div");
    item.className = "fact";
    const caption = document.createElement("span");
    caption.textContent = name;
    const detail = document.createElement("b");
    detail.textContent = display;
    item.append(caption, detail);
    return item;
  }

  function render(data) {
    entitlement = data;
    const allowed = downloadAllowed(data);
    const status = accountStatus(data);
    const [title, message] = reasonFor(data);
    const license = data.license || {};
    const panel = data.panel || {};
    $("#downloadChecking").hidden = true;
    $("#issuedState").hidden = true;
    $("#downloadResult").hidden = false;
    $("#downloadResult").classList.toggle("denied", !allowed);
    $("#statusIcon").textContent = allowed ? "✓" : "!";
    $("#statusLabel").textContent = allowed ? "SERVER VERIFIED" : label(status).toUpperCase();
    $("#statusTitle").textContent = title;
    $("#statusMessage").textContent = message;
    $("#downloadFacts").replaceChildren(
      fact("Account", label(status)),
      fact("License expiry", date(license.expires_at)),
      fact("Panel version", value(panel.latest_version, "6.24.0")),
    );
    $("#requestDownload").hidden = !allowed;
    $("#requestDownload").disabled = !allowed;
    $("#accountAction").textContent = allowed ? "Review account & device status" : "Resolve this in Student Account";
  }

  function showUnavailable(title, message) {
    $("#downloadChecking").hidden = true;
    $("#issuedState").hidden = true;
    $("#downloadResult").hidden = false;
    $("#downloadResult").classList.add("denied");
    $("#statusIcon").textContent = "!";
    $("#statusLabel").textContent = "ACCESS UNAVAILABLE";
    $("#statusTitle").textContent = title;
    $("#statusMessage").textContent = message;
    $("#downloadFacts").replaceChildren();
    $("#requestDownload").hidden = true;
    $("#requestDownload").disabled = true;
  }

  async function checkEntitlement() {
    $("#downloadChecking").hidden = false;
    $("#downloadResult").hidden = true;
    $("#issuedState").hidden = true;
    if (!token()) return showUnavailable("Sign in required", "Sign in to the Student App before opening the secure panel download area.");
    try { render(await api(ENTITLEMENT_ENDPOINT)); }
    catch (error) {
      if (error.status === 401) showUnavailable("Session expired", "Sign in to the Student App again, then return to this page.");
      else if (error.status === 403) showUnavailable("Permission denied", "The server did not authorize panel delivery for this account.");
      else showUnavailable("Unable to verify access", "Panel delivery stays locked while the server cannot confirm your entitlement. Try again shortly.");
    }
  }

  function safeDeliveryPath(candidate) {
    if (!candidate || typeof candidate !== "string") throw new Error("The server did not return a delivery address.");
    const url = new URL(candidate, location.href);
    if (location.protocol !== "file:" && url.origin !== location.origin) throw new Error("The delivery address was not issued by this site.");
    return url.href;
  }

  function startCountdown(expiresAt) {
    clearInterval(countdownTimer);
    const expires = new Date(expiresAt).getTime();
    const draw = () => {
      const remaining = Math.max(0, expires - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      $("#downloadCountdown").textContent = remaining ? `Temporary delivery expires in ${minutes}:${String(seconds).padStart(2, "0")}` : "Temporary delivery has expired";
      if (!remaining) clearInterval(countdownTimer);
    };
    draw();
    countdownTimer = setInterval(draw, 1000);
  }

  async function requestDownload() {
    const button = $("#requestDownload");
    button.disabled = true;
    button.textContent = "Creating secure link…";
    try {
      const body = await api(DOWNLOAD_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          version: entitlement && entitlement.panel && entitlement.panel.latest_version
        }),
      });
      const delivery = safeDeliveryPath(body.download_url);
      $("#downloadResult").hidden = true;
      $("#issuedState").hidden = false;
      $("#issuedMessage").textContent = `Version ${value(body.version, "6.24.0")} was authorized. The address is valid only for this short delivery window.`;
      startCountdown(body.expires_at || new Date(Date.now() + 5 * 60000).toISOString());
      const anchor = document.createElement("a");
      anchor.href = delivery;
      anchor.hidden = true;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      showToast(error.message || "A secure download could not be created.");
      await checkEntitlement();
    } finally {
      button.disabled = false;
      button.textContent = "Create secure download";
    }
  }

  $("#requestDownload").addEventListener("click", requestDownload);
  $("#requestAgain").addEventListener("click", checkEntitlement);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && $("#issuedState").hidden) checkEntitlement(); });
  checkEntitlement();
})();
