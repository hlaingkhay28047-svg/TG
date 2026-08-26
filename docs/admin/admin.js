"use strict";

(() => {
  const API = Object.freeze({
    password: "/api/auth/v1/token?grant_type=password",
    refresh: "/api/auth/v1/token?grant_type=refresh_token",
    logout: "/api/auth/v1/logout",
    dashboard: "/api/v1/admin/dashboard",
    students: "/api/v1/admin/students",
    paymentRequests: "/api/v1/admin/payment-requests",
    paymentGrants: "/api/v1/admin/payment-grants",
    histories: "/api/v1/admin/histories",
    panelVersion: "/api/v1/admin/panel-version",
    artifactInitiate: "/api/v1/admin/panel-artifacts/initiate",
    artifacts: "/api/v1/admin/panel-artifacts",
    mfaSetup: "/api/v1/admin/mfa/setup",
    mfaVerify: "/api/v1/admin/mfa/verify",
  });
  const SESSION_KEY = "hnk_admin_sess_v1";
  const MUTATION_KEY_PREFIX = "hnk_admin_mutation_v1";
  const ARTIFACT_STATE_KEY = "hnk_admin_artifact_upload_v1";
  const CLIENT_TYPE = "admin";
  const ARTIFACT_CHUNK_SIZE = 4 * 1024 * 1024;
  const MAX_ARTIFACT_SIZE = 512 * 1024 * 1024;
  const pageSize = 20;
  const state = { studentPage: 1, historyPage: 1, studentTotal: 0, historyTotal: 0,
    paymentPage: 1, paymentTotal: 0, paymentView: "pending", paymentRequests: [],
    paymentSequence: 0, paymentReview: null, proofUrl: "", proofRequestId: "",
    selected: null, loading: false, mfaSecret: "", artifactFile: null, artifactBusy: false };
  let refreshInFlight = null;
  let sessionGeneration = 0;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function newMutationId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10).join("")}`;
  }

  function stablePayload(value) {
    if (Array.isArray(value)) return `[${value.map(stablePayload).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stablePayload(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async function mutationFor(scope, payload) {
    const digest = await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(`${scope}\n${stablePayload(payload)}`));
    const fingerprint = [...new Uint8Array(digest)]
      .map(value => value.toString(16).padStart(2, "0")).join("");
    const key = `${MUTATION_KEY_PREFIX}:${scope}:${fingerprint}`;
    const stored = sessionStorage.getItem(key);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored || "")) {
      return { id: stored, fingerprint, key };
    }
    const mutation = { id: newMutationId(), fingerprint, key };
    sessionStorage.setItem(key, mutation.id);
    return mutation;
  }

  function clearMutation(mutation) {
    if (mutation && sessionStorage.getItem(mutation.key) === mutation.id) {
      sessionStorage.removeItem(mutation.key);
    }
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") || {}; }
    catch (_) { return {}; }
  }

  function saveSession(next) {
    sessionGeneration++;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }

  function clearSession() {
    sessionGeneration++;
    sessionStorage.removeItem(SESSION_KEY);
  }

  function sessionEnvelope(body, current = {}) {
    const user = body.user || current.user || {};
    return {
      access: body.access_token || body.access || current.access || current.access_token || "",
      refresh: body.refresh_token || body.refresh || current.refresh || current.refresh_token || "",
      access_token: body.access_token || body.access || current.access_token || current.access || "",
      refresh_token: body.refresh_token || body.refresh || current.refresh_token || current.refresh || "",
      expires_at: body.expires_at || current.expires_at || null,
      session_id: body.session_id || current.session_id || null,
      uid: user.id || current.uid || "",
      email: user.email || current.email || "",
      user,
      client_type: CLIENT_TYPE,
    };
  }

  function accessToken() {
    const session = readSession();
    return session.access || session.access_token || "";
  }

  function refreshToken() {
    const session = readSession();
    return session.refresh || session.refresh_token || "";
  }

  async function refreshSession() {
    if (refreshInFlight) return refreshInFlight;
    const token = refreshToken();
    if (!token) return false;
    const generation = sessionGeneration;
    const request = (async () => {
      let response;
      try {
        response = await fetch(API.refresh, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ refresh_token: token, client_type: "admin" }),
        });
      } catch (_) { return false; }
      if (!response.ok || generation !== sessionGeneration) return false;
      let body;
      try { body = await response.json(); } catch (_) { return false; }
      if (generation !== sessionGeneration) return false;
      saveSession(sessionEnvelope(body, readSession()));
      return true;
    })();
    refreshInFlight = request;
    try { return await request; }
    finally { if (refreshInFlight === request) refreshInFlight = null; }
  }

  async function api(path, options = {}, retried = false) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    const token = accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    let response;
    try { response = await fetch(path, { ...options, headers, credentials: "same-origin" }); }
    catch (_) { throw Object.assign(new Error("The server could not be reached."), { status: 0 }); }
    if (response.status === 401 && !retried) {
      if (token && accessToken() && accessToken() !== token) return api(path, options, true);
      if (await refreshSession()) return api(path, options, true);
    }
    let body = {};
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) {
      const message = body.message || body.msg || body.error || `Request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status, body });
    }
    return body;
  }

  async function apiBlob(path, retried = false) {
    const headers = new Headers({ "Accept": "image/*" });
    const token = accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response;
    try { response = await fetch(path, { headers, credentials: "same-origin" }); }
    catch (_) { throw Object.assign(new Error("The server could not be reached."), { status: 0 }); }
    if (response.status === 401 && !retried) {
      if (token && accessToken() && accessToken() !== token) return apiBlob(path, true);
      if (await refreshSession()) return apiBlob(path, true);
    }
    if (!response.ok) {
      let body = {};
      try { body = await response.json(); } catch (_) {}
      const message = body.message || body.msg || body.error || `Request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status, body });
    }
    const blob = await response.blob();
    if (!blob.size) throw Object.assign(new Error("The payment proof is empty."), { status: 502 });
    return blob;
  }

  async function adminPasswordLogin(email, password) {
    let response;
    try {
      response = await fetch(API.password, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, client_type: "admin" }),
      });
    } catch (_) { throw Object.assign(new Error("The server could not be reached."), { status: 0 }); }
    let body = {};
    try { body = await response.json(); } catch (_) {}
    if (!response.ok || !(body.access_token || body.access)) {
      throw Object.assign(new Error(body.message || body.msg || body.error || "Administrator sign-in failed."),
        { status: response.status, body });
    }
    const session = sessionEnvelope(body);
    saveSession(session);
    return session;
  }

  async function signOutAdmin(message = "Administrator session ended.") {
    const session = readSession();
    const bearer = session.access || session.access_token || "";
    clearSession();
    try {
      await fetch(API.logout, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json",
          ...(bearer ? { "Authorization": `Bearer ${bearer}` } : {}) },
        credentials: "same-origin",
        body: JSON.stringify({ refresh_token: session.refresh || session.refresh_token || "", client_type: "admin" }),
      });
    } catch (_) {}
    showLogin(message);
  }

  function notify(message, kind = "ok") {
    const toast = $("#liveStatus");
    toast.textContent = message;
    toast.className = `toast on ${kind}`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.className = "toast"; }, 4200);
  }

  function text(value, fallback = "—") {
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function title(value) {
    return text(value, "unknown").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  }

  function formatDate(value, dateOnly = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat(undefined, dateOnly
      ? { year: "numeric", month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function node(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key === "dataset") Object.assign(element.dataset, value);
      else if (key in element && key !== "role") element[key] = value;
      else element.setAttribute(key, value);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => element.append(child));
    return element;
  }

  function statusPill(value) {
    const normalized = text(value, "unknown").toLowerCase().replaceAll(" ", "_");
    return node("span", { className: `status-pill ${normalized}`, text: title(normalized) });
  }

  function normalizeList(body, keys) {
    for (const key of keys) if (Array.isArray(body && body[key])) return body[key];
    if (Array.isArray(body)) return body;
    return [];
  }

  function count(body, ...keys) {
    for (const key of keys) if (Number.isFinite(Number(body && body[key]))) return Number(body[key]);
    return 0;
  }

  function hideAuthSurfaces() {
    $$('dialog[open]').forEach(dialog => dialog.close());
    ["#adminChecking", "#adminLogin", "#adminMfa", "#adminForbidden"].forEach(selector => { $(selector).hidden = true; });
    $("#adminApp").hidden = true;
  }

  function setFormStatus(selector, message = "", ok = false) {
    const status = $(selector);
    status.textContent = message;
    status.className = `form-status${ok ? " ok" : ""}`;
  }

  function showLogin(message = "") {
    hideAuthSurfaces();
    $("#adminLogin").hidden = false;
    setFormStatus("#adminLoginStatus", message);
    $("#adminLoginPassword").value = "";
    requestAnimationFrame(() => $("#adminLoginEmail").focus());
  }

  function showMfa(message = "Enter the current 6-digit code from your authenticator.") {
    hideAuthSurfaces();
    $("#adminMfa").hidden = false;
    setFormStatus("#adminMfaStatus", message);
    $("#adminMfaCode").value = "";
    requestAnimationFrame(() => $("#adminMfaCode").focus());
  }

  function showForbidden(message = "Admin access was not authorized by the server.") {
    hideAuthSurfaces();
    $("#adminForbidden").hidden = false;
    $("#adminForbidden p:last-of-type").textContent = message;
  }

  function showApp(body) {
    hideAuthSurfaces();
    $("#adminApp").hidden = false;
    const user = body.user || body.admin || readSession();
    const display = user.name || user.full_name || user.email || "Administrator";
    $("#adminName").textContent = display;
    $("#adminEmail").textContent = user.email || "";
    $("#adminInitial").textContent = display.trim().slice(0, 1).toUpperCase() || "A";
  }

  function metricsFrom(body) {
    return body.metrics || body.counts || body.dashboard || body;
  }

  function renderDashboard(body) {
    const metrics = metricsFrom(body);
    const definitions = [
      ["Total students", count(metrics, "total_students", "total"), "◎", ""],
      ["Active students", count(metrics, "active_students", "active"), "✓", "good"],
      ["Pending approval", count(metrics, "pending_students", "pending"), "◷", "warn"],
      ["Expired", count(metrics, "expired_students", "expired"), "!", "danger"],
      ["Suspended", count(metrics, "suspended_students", "suspended"), "Ⅱ", "danger"],
      ["Online now", count(metrics, "online_students", "online"), "●", "good"],
      ["Expiring soon", count(metrics, "expiring_soon"), "⌛", "warn"],
    ];
    const grid = $("#metricGrid");
    grid.replaceChildren(...definitions.map(([label, value, icon, tone]) => node("article", { className: `metric ${tone}` }, [
      node("div", { className: "metric-top" }, [node("span", { text: label }), node("span", { className: "metric-icon", text: icon, "aria-hidden": "true" })]),
      node("b", { text: String(value) }), node("span", { text: "Live server count" }),
    ])));
    $("#overviewUpdated").dateTime = new Date().toISOString();
    $("#overviewUpdated").textContent = `Updated ${formatDate(new Date())}`;

    const logins = normalizeList(body, ["latest_logins", "logins", "recent_logins"]);
    const rows = logins.map(item => node("tr", {}, [
      node("td", {}, person(item)),
      node("td", { text: item.device_name || item.device_type || "Unknown device" }),
      node("td", { text: formatDate(item.login_at || item.created_at || item.time) }),
      node("td", {}, statusPill(item.result || item.status || "success")),
    ]));
    $("#latestLogins").replaceChildren(...rows);
    $("#latestEmpty").hidden = rows.length > 0;

    const attention = [
      ["Pending", count(metrics, "pending_students", "pending")],
      ["Expired", count(metrics, "expired_students", "expired")],
      ["Expiring soon", count(metrics, "expiring_soon")],
    ];
    $("#attentionList").replaceChildren(...attention.map(([label, value]) => node("div", { className: "attention-row" }, [node("span", { text: label }), node("b", { text: String(value) })])));
  }

  function person(item) {
    const name = item.name || item.full_name || item.student_name || item.email || "Student";
    return [node("span", { className: "avatar", text: name.slice(0, 1).toUpperCase(), "aria-hidden": "true" }), node("span", {}, [node("b", { text: name }), node("small", { text: item.email || item.student_email || "" })])];
  }

  function studentStatus(item) {
    return item.account_status || item.effective_status || item.status || (item.account && (item.account.effective_status || item.account.status)) || "unknown";
  }

  function studentLicense(item) {
    const license = item.license || {};
    return item.license_status || license.status || (license.active ? "active" : "none");
  }

  function deviceSummary(item) {
    const devices = item.devices || {};
    const phone = devices.phone || item.phone_device;
    const computer = devices.computer || item.computer_device;
    return `${phone ? "Phone 1/1" : "Phone 0/1"} · ${computer ? "Computer 1/1" : "Computer 0/1"}`;
  }

  function detailButton(item, compact = false) {
    const id = item.id || item.user_id || item.student_id;
    return node("button", { className: compact ? "button" : "text-button", type: "button", text: "View details", dataset: { studentId: id } });
  }

  function renderStudents(body) {
    const students = normalizeList(body, ["students", "items", "data"]);
    state.studentTotal = count(body, "total", "count") || students.length;
    const rows = students.map(item => {
      const expiry = item.license_expires_at || item.expires_at || (item.license && item.license.expires_at);
      return node("tr", {}, [node("td", {}, person(item)), node("td", {}, statusPill(studentStatus(item))), node("td", {}, [statusPill(studentLicense(item)), node("small", { text: expiry ? ` ${formatDate(expiry, true)}` : "" })]), node("td", { text: deviceSummary(item) }), node("td", { text: formatDate(item.last_active_at) }), node("td", {}, detailButton(item))]);
    });
    const cards = students.map(item => node("article", { className: "student-card" }, [
      node("div", { className: "student-card-top" }, [node("div", {}, person(item)), statusPill(studentStatus(item))]),
      node("div", { className: "student-card-meta" }, [statusPill(studentLicense(item)), node("span", { className: "status-pill", text: deviceSummary(item) })]),
      detailButton(item, true),
    ]));
    $("#studentRows").replaceChildren(...rows);
    $("#studentCards").replaceChildren(...cards);
    $("#studentsEmpty").hidden = students.length > 0;
    $("#studentsPage").textContent = `Page ${state.studentPage}`;
    $("#studentsPrev").disabled = state.studentPage <= 1;
    $("#studentsNext").disabled = state.studentPage * pageSize >= state.studentTotal;
  }

  function studentQuery() {
    const query = new URLSearchParams({ page: String(state.studentPage), limit: String(pageSize) });
    const search = $("#studentSearch").value.trim();
    const status = $("#studentStatus").value;
    const license = $("#studentLicense").value;
    if (search) query.set("q", search);
    if (status) query.set("status", status);
    if (license) query.set("license_status", license);
    return query;
  }

  async function loadStudents() {
    try { renderStudents(await api(`${API.students}?${studentQuery()}`)); }
    catch (error) { handleError(error, "Could not load students."); }
  }

  function historyQuery(studentId = "") {
    const query = new URLSearchParams({ page: String(state.historyPage), limit: String(pageSize) });
    const search = $("#historySearch").value.trim();
    const type = $("#historyType").value;
    if (search) query.set("search", search);
    query.set("type", type || "all");
    if ($("#historyFrom").value) query.set("from", $("#historyFrom").value);
    if ($("#historyTo").value) query.set("to", $("#historyTo").value);
    if (studentId) query.set("student_id", studentId);
    return query;
  }

  function eventName(item) {
    return item.action || item.event_type || item.type || "activity";
  }

  function renderHistory(body) {
    const events = normalizeList(body, ["events", "history", "items", "data"]);
    state.historyTotal = count(body, "total", "count") || events.length;
    $("#historyRows").replaceChildren(...events.map(item => node("tr", {}, [
      node("td", { text: formatDate(item.created_at || item.time || item.login_at) }),
      node("td", {}, person(item)),
      node("td", {}, [node("b", { text: title(eventName(item)) }), node("small", { text: item.detail || item.message || "" })]),
      node("td", { text: item.device_name || item.browser || item.app || item.channel || "—" }),
      node("td", {}, statusPill(item.result || item.status || "success")),
    ])));
    $("#historyEmpty").hidden = events.length > 0;
    $("#historyPage").textContent = `Page ${state.historyPage}`;
    $("#historyPrev").disabled = state.historyPage <= 1;
    $("#historyNext").disabled = state.historyPage * pageSize >= state.historyTotal;
  }

  async function loadHistory() {
    try { renderHistory(await api(`${API.histories}?${historyQuery()}`)); }
    catch (error) { handleError(error, "Could not load activity history."); }
  }

  function paymentId(item) {
    return item.id || item.payment_request_id || "";
  }

  function paymentStudent(item) {
    const nested = item.student || item.profile || item.user || {};
    return {
      name: item.student_name || item.name || nested.name || nested.full_name || item.student_email || item.email || nested.email || "Student",
      email: item.student_email || item.email || nested.email || "",
    };
  }

  function paymentKindLabel(value) {
    const labels = { join_first: "First access / VIP", plan_1m: "1 month", plan_3m: "3 months", plan_6m: "6 months" };
    return labels[value] || title(value || "payment");
  }

  function formatMmk(value) {
    if (value === null || value === undefined || value === "") return "—";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return text(value);
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} MMK`;
  }

  function paymentSentAmount(item) {
    return item.amount_mmk ?? item.amount;
  }

  function paymentDueAmount(item) {
    return item.quoted_amount_mmk;
  }

  function numericMmk(value) {
    if (value === null || value === undefined || value === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

  function paymentAmountMismatch(item) {
    if (item.is_grant) return false;
    const sent = numericMmk(paymentSentAmount(item));
    const due = numericMmk(paymentDueAmount(item));
    return sent !== null && due !== null && sent !== due;
  }

  function paymentMismatchWarning(item) {
    if (!paymentAmountMismatch(item)) return null;
    const sent = formatMmk(paymentSentAmount(item));
    const due = formatMmk(paymentDueAmount(item));
    return node("span", { className: "payment-mismatch", role: "alert", "aria-label": `Amount mismatch: student sent ${sent}; server amount due ${due}`, text: "Amount mismatch" });
  }

  function paymentHasProof(item) {
    if (item.is_grant) return false;
    return item.has_proof !== false && item.proof_available !== false;
  }

  function paymentActions(item) {
    const id = paymentId(item);
    const student = paymentStudent(item);
    const who = student.email || student.name;
    const actions = [];
    if (id && paymentHasProof(item)) actions.push(node("button", { className: "button", type: "button", text: "View proof", "aria-label": `View payment proof for ${who}`, dataset: { paymentProof: id } }));
    if (id && String(item.status || "pending").toLowerCase() === "pending") {
      actions.push(node("button", { className: "button primary", type: "button", text: "Approve", "aria-label": `Approve payment for ${who}`, dataset: { paymentReview: id, paymentDecision: "approved" } }));
      actions.push(node("button", { className: "button danger", type: "button", text: "Reject", "aria-label": `Reject payment for ${who}`, dataset: { paymentReview: id, paymentDecision: "rejected" } }));
    }
    return node("div", { className: "payment-actions" }, actions);
  }

  function paymentPerson(item) {
    const student = paymentStudent(item);
    return person({ name: student.name, email: student.email });
  }

  function paymentTransfer(item) {
    if (item.is_grant) return [node("b", { text: "VIP grant" }), node("small", { text: "No transfer" })];
    const suffix = item.txn_last6 ? `Txn ending ${item.txn_last6}` : "Transfer reference unavailable";
    return [
      node("b", { text: `Sent ${formatMmk(paymentSentAmount(item))}` }),
      node("small", { text: `Due ${formatMmk(paymentDueAmount(item))}` }),
      paymentMismatchWarning(item),
      node("small", { text: suffix }),
    ];
  }

  function renderPaymentConfigurationWarnings(body) {
    const warnings = normalizeList(body, ["configuration_warnings", "warnings"]);
    const warning = warnings.find(item => item && item.code === "app_settings_row_count");
    const surface = $("#paymentConfigWarning");
    if (!warning) {
      surface.hidden = true;
      $("#paymentConfigWarningText").textContent = "";
      return;
    }
    const countValue = Number(warning.count);
    const countLabel = Number.isFinite(countValue) ? String(countValue) : "an unexpected number of";
    $("#paymentConfigWarningText").textContent = `The server found ${countLabel} configuration rows; exactly 1 is required. Review pricing settings before approving payments or granting access.`;
    surface.hidden = false;
  }

  function renderPaymentRequests(body) {
    const requests = normalizeList(body, ["payment_requests", "requests", "items", "data"]);
    renderPaymentConfigurationWarnings(body);
    state.paymentRequests = requests;
    state.paymentTotal = count(body, "total", "count") || requests.length;
    const rows = requests.map(item => node("tr", {}, [
      node("td", {}, paymentPerson(item)),
      node("td", {}, [node("b", { text: paymentKindLabel(item.kind) }), node("small", { text: item.is_grant ? "Manual grant" : "Student payment" })]),
      node("td", {}, paymentTransfer(item)),
      node("td", { text: formatDate(item.created_at || item.submitted_at) }),
      node("td", {}, [statusPill(item.status || "pending"), node("small", { text: item.note || (item.reviewed_at ? `Reviewed ${formatDate(item.reviewed_at)}` : "") })]),
      node("td", {}, paymentActions(item)),
    ]));
    const cards = requests.map(item => {
      const student = paymentStudent(item);
      const amountDetails = item.is_grant
        ? [node("div", {}, [node("dt", { text: "Amount" }), node("dd", { text: "VIP grant" })])]
        : [
          node("div", {}, [node("dt", { text: "Sent" }), node("dd", { text: formatMmk(paymentSentAmount(item)) })]),
          node("div", {}, [node("dt", { text: "Due" }), node("dd", { text: formatMmk(paymentDueAmount(item)) })]),
        ];
      const mismatch = paymentMismatchWarning(item);
      return node("article", { className: "payment-card" }, [
        node("div", { className: "payment-card-head" }, [node("div", {}, paymentPerson(item)), statusPill(item.status || "pending")]),
        node("dl", { className: "payment-card-details" }, [
          node("div", {}, [node("dt", { text: "Request" }), node("dd", { text: paymentKindLabel(item.kind) })]),
          ...amountDetails,
          node("div", {}, [node("dt", { text: "Submitted" }), node("dd", { text: formatDate(item.created_at || item.submitted_at) })]),
          ...(item.note ? [node("div", {}, [node("dt", { text: "Admin note" }), node("dd", { text: item.note })])] : []),
        ]),
        mismatch,
        paymentActions(item),
        node("span", { className: "sr-only", text: `Payment request for ${student.email || student.name}` }),
      ]);
    });
    $("#paymentRows").replaceChildren(...rows);
    $("#paymentCards").replaceChildren(...cards);
    $("#paymentsEmpty").hidden = requests.length > 0;
    $("#paymentsPage").textContent = `Page ${state.paymentPage}`;
    $("#paymentsPrev").disabled = state.paymentPage <= 1;
    $("#paymentsNext").disabled = state.paymentPage * pageSize >= state.paymentTotal;
    const label = state.paymentView === "pending" ? "pending request" : "reviewed request";
    $("#paymentQueueStatus").textContent = `${state.paymentTotal} ${label}${state.paymentTotal === 1 ? "" : "s"}`;
  }

  async function loadPaymentRequests() {
    const sequence = ++state.paymentSequence;
    const queue = $(".payment-queue");
    queue.setAttribute("aria-busy", "true");
    $("#paymentQueueStatus").textContent = state.paymentView === "pending" ? "Loading pending requests…" : "Loading review history…";
    const query = new URLSearchParams({ status: state.paymentView, page: String(state.paymentPage), limit: String(pageSize) });
    try {
      const body = await api(`${API.paymentRequests}?${query}`);
      if (sequence === state.paymentSequence) renderPaymentRequests(body);
    } catch (error) {
      if (sequence === state.paymentSequence) {
        $("#paymentQueueStatus").textContent = "Payment requests could not be loaded.";
        handleError(error, "Could not load payment requests.");
      }
    } finally {
      if (sequence === state.paymentSequence) queue.setAttribute("aria-busy", "false");
    }
  }

  function selectPaymentView(view) {
    state.paymentView = view === "history" ? "history" : "pending";
    state.paymentPage = 1;
    $$('[data-payment-view]').forEach(button => {
      const active = button.dataset.paymentView === state.paymentView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    loadPaymentRequests();
  }

  function paymentRequestById(id) {
    return state.paymentRequests.find(item => String(paymentId(item)) === String(id));
  }

  function clearPaymentProof() {
    state.proofRequestId = "";
    if (state.proofUrl) URL.revokeObjectURL(state.proofUrl);
    state.proofUrl = "";
    $("#paymentProofImage").removeAttribute("src");
    $("#paymentProofImage").hidden = true;
  }

  async function showPaymentProof(id) {
    const item = paymentRequestById(id);
    const student = paymentStudent(item || {});
    const dialog = $("#paymentProofDialog");
    clearPaymentProof();
    state.proofRequestId = String(id);
    $("#paymentProofStudent").textContent = student.email || student.name;
    $("#paymentProofImage").alt = `Payment proof for ${student.name}`;
    $("#paymentProofStatus").textContent = "Loading proof securely…";
    if (!dialog.open) dialog.showModal();
    $("#closePaymentProof").focus();
    try {
      const blob = await apiBlob(`${API.paymentRequests}/${encodeURIComponent(id)}/proof`);
      if (state.proofRequestId !== String(id) || !dialog.open) return;
      if (blob.type && !blob.type.toLowerCase().startsWith("image/")) throw Object.assign(new Error("This payment proof is not a supported image."), { status: 415 });
      state.proofUrl = URL.createObjectURL(blob);
      $("#paymentProofImage").src = state.proofUrl;
      $("#paymentProofImage").hidden = false;
      $("#paymentProofStatus").textContent = "Payment proof loaded from private storage.";
    } catch (error) {
      if (state.proofRequestId !== String(id)) return;
      $("#paymentProofStatus").textContent = error.message || "Payment proof could not be loaded.";
      if (error.status === 401 || error.status === 403) { dialog.close(); handleError(error, "Payment proof was not authorized."); }
    }
  }

  function openPaymentReview(id, decision) {
    const item = paymentRequestById(id);
    if (!item || !["approved", "rejected"].includes(decision)) return;
    const student = paymentStudent(item);
    const sent = item.is_grant ? "no transfer" : formatMmk(paymentSentAmount(item));
    const due = item.is_grant ? "no payment due" : formatMmk(paymentDueAmount(item));
    const mismatch = paymentAmountMismatch(item) ? " Amount mismatch: verify the discrepancy before deciding." : "";
    state.paymentReview = { id: String(id), decision, item };
    const approving = decision === "approved";
    $("#paymentReviewTitle").textContent = approving ? "Approve payment" : "Reject payment";
    $("#paymentReviewStudent").textContent = student.email || student.name;
    $("#paymentReviewMessage").textContent = approving
      ? `Confirm the submitted proof. Student sent ${sent}; server due ${due}.${mismatch} Approval may activate or extend access immediately.`
      : `Student sent ${sent}; server due ${due}.${mismatch} Confirm that this request should be rejected. No entitlement will be granted.`;
    $("#paymentReviewNote").value = "";
    setFormStatus("#paymentReviewStatus");
    const button = $("#confirmPaymentReview");
    button.textContent = approving ? "Confirm approval" : "Confirm rejection";
    button.className = `button ${approving ? "primary" : "danger"}`;
    const dialog = $("#paymentReviewDialog");
    dialog.showModal();
    $("#paymentReviewNote").focus();
  }

  function refreshPaymentSurfaces() {
    loadPaymentRequests();
    loadStudents();
    loadDashboard(false).catch(error => handleError(error, "Could not refresh payment dashboard data."));
  }

  async function submitPaymentReview(event) {
    event.preventDefault();
    const review = state.paymentReview;
    const note = $("#paymentReviewNote").value.trim();
    if (!review) return setFormStatus("#paymentReviewStatus", "Choose a payment request first.");
    if (!note) return setFormStatus("#paymentReviewStatus", "Record an admin note before confirming.");
    const button = $("#confirmPaymentReview");
    button.disabled = true;
    setFormStatus("#paymentReviewStatus", review.decision === "approved" ? "Approving payment…" : "Rejecting payment…", true);
    try {
      const body = await api(`${API.paymentRequests}/${encodeURIComponent(review.id)}/review`, {
        method: "POST", body: JSON.stringify({ status: review.decision, note }),
      });
      button.disabled = false;
      $("#paymentReviewDialog").close();
      notify(body.message || `Payment ${review.decision}.`);
      refreshPaymentSurfaces();
    } catch (error) {
      setFormStatus("#paymentReviewStatus", error.message || "Payment review failed.");
      if (error.status === 401 || error.status === 403) { $("#paymentReviewDialog").close(); handleError(error, "Payment review was not authorized."); }
    } finally { button.disabled = false; }
  }

  async function submitPaymentGrant(event) {
    event.preventDefault();
    const email = $("#grantEmail").value.trim().toLowerCase();
    const kind = $("#grantKind").value;
    const note = $("#grantNote").value.trim();
    if (!email || !["join_first", "plan_1m", "plan_3m", "plan_6m"].includes(kind) || !note) {
      return setFormStatus("#paymentGrantStatus", "Enter a valid student email, access period and admin note.");
    }
    const confirmed = await confirmAction(`Grant ${paymentKindLabel(kind)} access to ${email}? This creates an approved entry in the admin audit history.`);
    if (!confirmed) return;
    const mutation = await mutationFor("payment_grant", { email, kind, note });
    const button = $("#createPaymentGrant");
    button.disabled = true;
    setFormStatus("#paymentGrantStatus", "Creating audited VIP grant…", true);
    try {
      const body = await api(API.paymentGrants, { method: "POST", body: JSON.stringify({ email, kind, note, mutation_id: mutation.id }) });
      clearMutation(mutation);
      $("#paymentGrantForm").reset();
      setFormStatus("#paymentGrantStatus", body.message || `VIP access granted to ${email}.`, true);
      notify(body.message || "VIP access granted.");
      refreshPaymentSurfaces();
    } catch (error) {
      setFormStatus("#paymentGrantStatus", error.message || "VIP grant could not be created.");
      if (error.status === 401 || error.status === 403) handleError(error, "VIP grant was not authorized.");
    } finally { button.disabled = false; }
  }

  function detailRecord(body) {
    const student = body.student || body.user || body.profile || body;
    const flatLicense = {
      status: student.license_status,
      starts_at: student.license_starts_at || student.starts_at,
      expires_at: student.license_expires_at || student.expires_at,
      active: student.license_active,
    };
    const flatPermissions = {
      web_app: student.web_app_enabled,
      ccx_download: student.ccx_download_enabled,
      panel: student.panel_enabled,
      photoshop_panel: student.panel_enabled,
    };
    let devices = body.devices || student.devices || {};
    if (Array.isArray(devices)) {
      devices = devices.reduce((slots, slot) => {
        const key = slot.slot_type || slot.device_type || slot.type;
        if (key === "phone" || key === "computer") {
          const installations = Array.isArray(slot.installations) ? slot.installations.filter(item => item && !item.revoked_at) : [];
          slots[key] = installations[0] ? { ...slot, ...installations[0] } : (slot.status === "active" ? slot : null);
        }
        return slots;
      }, { phone: null, computer: null });
    }
    return {
      ...student,
      account: body.account || student.account || { status: student.account_status || student.status },
      license: body.license || student.license || flatLicense,
      permissions: body.permissions || student.permissions || flatPermissions,
      devices,
      history: body.history || body.events || student.history || [],
    };
  }

  function permissionValue(permissions, key) {
    if (key === "photoshop_panel") return Boolean(permissions.photoshop_panel ?? permissions.panel);
    return Boolean(permissions[key]);
  }

  function renderStudentDetail(body) {
    const item = detailRecord(body);
    state.selected = item;
    const name = item.name || item.full_name || item.email || "Student";
    $("#studentDialogTitle").textContent = name;
    $("#studentDialogEmail").textContent = item.email || "";
    const account = item.account || {};
    const license = item.license || {};
    const stats = [
      ["Account", title(account.effective_status || account.status || studentStatus(item))],
      ["License", title(license.status || studentLicense(item))],
      ["Starts", formatDate(license.starts_at, true)],
      ["Expires", formatDate(license.expires_at || item.license_expires_at, true)],
      ["Last login", formatDate(item.last_login_at)],
      ["Last active", formatDate(item.last_active_at)],
      ["Last download", formatDate(item.last_download_at)],
      ["Devices", deviceSummary(item)],
    ];
    $("#studentSummary").replaceChildren(...stats.map(([label, value]) => node("div", { className: "detail-stat" }, [node("span", { text: label }), node("b", { text: value })])));

    const permissionLabels = [["web_app", "Student Web App"], ["ccx_download", "Panel download"], ["photoshop_panel", "Photoshop Panel"]];
    $("#permissionToggles").replaceChildren(...permissionLabels.map(([key, label]) => {
      const control = node("input", { type: "checkbox", checked: permissionValue(item.permissions || {}, key), "aria-label": `${label} permission` });
      control.addEventListener("change", async () => {
        control.disabled = true;
        try {
          await runAction("set_permission", { permission: key, enabled: control.checked }, false);
          notify(`${label} permission updated.`);
        } catch (_) { control.checked = !control.checked; }
        finally { control.disabled = false; }
      });
      return node("label", { className: "toggle-row" }, [node("span", { text: label }), control]);
    }));

    const devices = item.devices || {};
    $("#studentDevices").replaceChildren(...[["Phone", devices.phone], ["Computer", devices.computer]].map(([kind, device]) => node("div", { className: "device-row" }, [
      node("div", {}, [node("b", { text: `${kind} ${device ? "1/1" : "0/1"}` }), node("small", { text: device ? device.label || device.device_name || "Registered" : "Not registered" })]),
      statusPill(device ? "active" : "empty"),
    ])));

    const canonicalAccountStatus = String(account.status || item.account_status || item.status || "pending").toLowerCase();
    const accountActions = [
      ...(canonicalAccountStatus === "pending" ? [["approve", "Approve", "primary"]] : []),
      ["reject", "Reject", "danger"], ["activate", "Activate", ""],
      ["suspend", "Suspend", "danger"], ["ban", "Ban", "danger"],
    ];
    $("#accountActions").replaceChildren(...accountActions.map(([action, label, tone]) => actionButton(action, label, tone)));
    const securityActions = [
      ["reset_phone", "Reset Phone", ""], ["reset_computer", "Reset Computer", ""],
      ["force_logout", "Force logout", "danger"], ["password_reset", "Send password reset", ""],
    ];
    $("#securityActions").replaceChildren(...securityActions.map(([action, label, tone]) => actionButton(action, label, tone)));

    const events = normalizeList({ events: item.history }, ["events"]);
    $("#studentHistory").replaceChildren(...events.slice(0, 6).map(event => node("div", { className: "history-item" }, [node("time", { text: formatDate(event.created_at || event.time) }), node("b", { text: title(eventName(event)) }), node("span", { text: event.detail || event.message || event.device_name || "—" })])));
    if (!events.length) $("#studentHistory").append(node("p", { className: "empty", text: "No recent history." }));
  }

  function selectedId() {
    return state.selected && (state.selected.id || state.selected.user_id || state.selected.student_id);
  }

  function actionButton(action, label, tone) {
    const button = node("button", { type: "button", className: `button ${tone}`, text: label });
    button.addEventListener("click", () => confirmAndRun(action, label));
    return button;
  }

  function confirmAction(message, danger = false) {
    const dialog = $("#confirmDialog");
    $("#confirmMessage").textContent = message;
    $("#confirmAction").className = `button ${danger ? "danger" : "primary"}`;
    dialog.returnValue = "";
    dialog.showModal();
    $("#confirmAction").focus();
    return new Promise(resolve => {
      const done = () => { dialog.removeEventListener("close", done); resolve(dialog.returnValue === "confirm"); };
      dialog.addEventListener("close", done);
    });
  }

  async function confirmAndRun(action, label, extra = {}) {
    const approved = await confirmAction(`${label} for ${state.selected && (state.selected.email || state.selected.name || "this student")}? This operation is written to the admin audit history.`, ["reject", "suspend", "ban", "force_logout", "reset_phone", "reset_computer"].includes(action));
    if (!approved) return;
    await runAction(action, extra);
  }

  async function runAction(action, extra = {}, refresh = true) {
    const id = selectedId();
    if (!id) throw new Error("No student is selected.");
    const payload = { action, ...extra };
    const mutation = action === "extend_license"
      ? await mutationFor("extend_license", { student_id: id, ...payload }) : null;
    if (mutation) payload.mutation_id = mutation.id;
    let body;
    try {
      body = await api(`${API.students}/${encodeURIComponent(id)}/actions`, { method: "POST", body: JSON.stringify(payload) });
    } catch (error) { handleError(error, `${title(action)} failed.`); throw error; }
    notify(body.message || `${title(action)} completed.`);
    if (refresh) {
      try {
        await Promise.all([openStudent(id, false), loadStudents(), loadDashboard(false)]);
        if (mutation) clearMutation(mutation);
      }
      catch (error) {
        const summary = `${title(action)} completed, but refreshed data could not be loaded.`;
        const message = error && error.message ? `${summary} ${error.message}` : summary;
        handleError(Object.assign(new Error(message), {
          status: error && error.status,
          body: error && error.body,
        }), summary);
      }
    } else if (mutation) clearMutation(mutation);
    return body;
  }

  async function openStudent(id, open = true) {
    try {
      const body = await api(`${API.students}/${encodeURIComponent(id)}`);
      renderStudentDetail(body);
      const dialog = $("#studentDialog");
      if (open && !dialog.open) dialog.showModal();
      $("#closeStudentDialog").focus();
    } catch (error) { handleError(error, "Could not load student details."); }
  }

  async function loadPanelVersion() {
    try {
      const body = await api(API.panelVersion);
      const policy = body.panel || body;
      $("#latestVersion").value = policy.latest_version || policy.latest || "6.24.0";
      $("#minimumVersion").value = policy.minimum_supported_version || policy.minimum || "6.24.0";
      if (!$("#artifactVersion").value) $("#artifactVersion").value = $("#latestVersion").value;
      const resumable = readArtifactState();
      $("#checkArtifactResume").hidden = !(resumable && resumable.id);
      if (resumable && resumable.id) checkArtifactResume(false);
    } catch (error) { handleError(error, "Could not load the panel version policy."); }
  }

  function readArtifactState() {
    try { return JSON.parse(sessionStorage.getItem(ARTIFACT_STATE_KEY) || "null"); }
    catch (_) { return null; }
  }

  function saveArtifactState(value) {
    sessionStorage.setItem(ARTIFACT_STATE_KEY, JSON.stringify(value));
    $("#checkArtifactResume").hidden = !(value && value.id);
  }

  function clearArtifactState() {
    sessionStorage.removeItem(ARTIFACT_STATE_KEY);
    $("#checkArtifactResume").hidden = true;
  }

  function humanBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function setArtifactProgress(uploaded, total, message) {
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(uploaded / total * 100))) : 0;
    $("#artifactProgress").value = percent;
    $("#artifactProgressText").textContent = message || `${percent}% · ${humanBytes(uploaded)} of ${humanBytes(total)}`;
  }

  function setArtifactStatus(message = "", ok = false) {
    setFormStatus("#artifactUploadStatus", message, ok);
  }

  async function sha256Hex(source) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("Secure browser hashing is unavailable.");
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function base64FromBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 32768)));
    }
    return btoa(binary);
  }

  function uploadedBytes(indices, size, chunkSize) {
    return [...indices].reduce((sum, index) => sum + Math.max(0, Math.min(chunkSize, size - index * chunkSize)), 0);
  }

  async function checkArtifactResume(announce = true) {
    const saved = readArtifactState();
    if (!saved || !saved.id) return setArtifactStatus("No resumable upload is recorded in this tab.");
    try {
      const body = await api(`${API.artifacts}/${encodeURIComponent(saved.id)}`);
      const artifact = body.artifact || {};
      const indices = new Set((artifact.uploaded_indices || []).map(Number));
      const bytes = Number(artifact.uploaded_size_bytes || uploadedBytes(indices, saved.size, saved.chunkSize || ARTIFACT_CHUNK_SIZE));
      setArtifactProgress(bytes, Number(saved.size), artifact.status === "ready" ? "Artifact verified · ready to enable" : `${indices.size} of ${artifact.chunk_count || saved.chunkCount || "?"} chunks uploaded`);
      $("#artifactHashText").textContent = saved.sha256 ? `SHA-256 ${saved.sha256.slice(0, 16)}…` : "";
      $("#artifactFileSummary").textContent = `${saved.name || "Panel package"} · ${humanBytes(saved.size)} · reselect the same file to resume`;
      if (announce) setArtifactStatus(artifact.status === "ready" ? "Private artifact is finalized. Reselect the file to enable its release policy." : "Resumable upload found. Reselect the same package, then continue.", true);
      return artifact;
    } catch (error) { handleError(error, "Could not read resumable artifact status."); return null; }
  }

  function selectedArtifactFile() {
    const file = $("#panelArtifactFile").files && $("#panelArtifactFile").files[0];
    if (!file) throw new Error("Choose a Panel package first.");
    if (!/\.[c][c][x]$/i.test(file.name)) throw new Error("Choose a valid Creative Cloud panel package.");
    if (!file.size || file.size > MAX_ARTIFACT_SIZE) throw new Error("Panel package size must be between 1 byte and 512 MiB.");
    return file;
  }

  async function finalizePanelArtifact(upload) {
    setArtifactStatus("All chunks uploaded. Verifying the complete private artifact…", true);
    const finalized = await api(`${API.artifacts}/${encodeURIComponent(upload.id)}/finalize`, { method:"POST", body:"{}" });
    setArtifactProgress(upload.size, upload.size, "Artifact integrity verified · enabling release");
    await api(API.panelVersion, { method:"PUT", body:JSON.stringify({
      latest_version:upload.version,
      minimum_supported_version:$("#minimumVersion").value || upload.version,
      enabled: true,
      sha256:upload.sha256,
      size_bytes:upload.size,
    }) });
    $("#latestVersion").value = upload.version;
    $("#artifactVersion").value = upload.version;
    clearArtifactState();
    setArtifactStatus(`Version ${upload.version} is finalized in private storage and enabled.`, true);
    notify(`Panel ${upload.version} verified and enabled.`);
    return finalized;
  }

  async function uploadPanelArtifact(event) {
    event.preventDefault();
    if (state.artifactBusy) return;
    let file;
    try { file = selectedArtifactFile(); }
    catch (error) { return setArtifactStatus(error.message); }
    const version = $("#artifactVersion").value.trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return setArtifactStatus("Enter a valid semantic version.");
    state.artifactBusy = true; state.artifactFile = file;
    const button = $("#uploadPanelArtifact"); button.disabled = true;
    try {
      setArtifactProgress(0, file.size, "Computing complete SHA-256 in this tab…");
      setArtifactStatus("The package stays in memory while its integrity hash is computed.", true);
      const totalSha256 = await sha256Hex(file);
      $("#artifactHashText").textContent = `SHA-256 ${totalSha256.slice(0, 16)}…`;
      const initiated = await api(API.artifactInitiate, { method:"POST", body:JSON.stringify({
        version, sha256:totalSha256, size_bytes:file.size, chunk_size:ARTIFACT_CHUNK_SIZE,
      }) });
      const initialArtifact = initiated.artifact || {};
      const upload = { id:initialArtifact.id, version, sha256:totalSha256, size:file.size,
        name:file.name, chunkSize:Number(initialArtifact.chunk_size || ARTIFACT_CHUNK_SIZE),
        chunkCount:Number(initialArtifact.chunk_count || Math.ceil(file.size / ARTIFACT_CHUNK_SIZE)) };
      if (!upload.id) throw new Error("The server did not create a private upload.");
      saveArtifactState(upload);
      const statusBody = await api(`${API.artifacts}/${encodeURIComponent(upload.id)}`);
      const status = statusBody.artifact || initialArtifact;
      const uploaded = new Set((status.uploaded_indices || []).map(Number));
      setArtifactProgress(uploadedBytes(uploaded, upload.size, upload.chunkSize), upload.size,
        status.status === "ready" ? "Artifact already verified · enabling release" : `Resuming after ${uploaded.size} verified chunks`);
      if (status.status !== "ready") {
        for (let index = 0; index < upload.chunkCount; index++) {
          if (uploaded.has(index)) continue;
          const start = index * upload.chunkSize, end = Math.min(file.size, start + upload.chunkSize);
          const buffer = await file.slice(start, end).arrayBuffer();
          const chunkSha256 = await sha256Hex(buffer);
          await api(`${API.artifacts}/${encodeURIComponent(upload.id)}/chunks/${index}`, { method:"PUT", body:JSON.stringify({
            data_base64:base64FromBuffer(buffer), sha256:chunkSha256,
          }) });
          uploaded.add(index);
          setArtifactProgress(uploadedBytes(uploaded, upload.size, upload.chunkSize), upload.size,
            `Uploaded verified chunk ${uploaded.size} of ${upload.chunkCount}`);
        }
      }
      await finalizePanelArtifact(upload);
    } catch (error) {
      setArtifactStatus(`${error.message || "Artifact upload failed."}\nReselect the same package to resume verified chunks.`);
      if (error.status === 401 || error.status === 403) handleError(error, "Artifact upload was not authorized.");
    } finally { state.artifactBusy = false; state.artifactFile = null; button.disabled = false; }
  }

  function errorCode(error) {
    const body = error && error.body || {};
    return String(body.code || body.error || body.reason || "").toLowerCase();
  }

  function mfaInstructions(body) {
    state.mfaSecret = String(body.secret || "");
    const lines = [];
    if (state.mfaSecret) lines.push(`Setup key: ${state.mfaSecret}`);
    if (body.otpauth_uri || body.uri) lines.push(`Authenticator URI: ${body.otpauth_uri || body.uri}`);
    if (!lines.length) lines.push(body.instructions || "Add HNK Studio to your authenticator, then enter its 6-digit code.");
    return lines.join("\n");
  }

  async function startMfaSetup(target = "gate") {
    try {
      const body = await api(API.mfaSetup, { method: "POST", body: "{}" });
      const instructions = mfaInstructions(body);
      if (target === "gate") {
        $("#adminMfaInstructions").textContent = instructions;
        $("#adminMfaEnrollment").hidden = false;
        setFormStatus("#adminMfaStatus", "Authenticator setup created. Enter the new 6-digit code above.", true);
        $("#adminMfaCode").focus();
      } else {
        $("#mfaInstructions").textContent = instructions;
        $("#mfaSetup").hidden = false;
        $("#mfaCode").focus();
      }
    } catch (error) {
      if (target === "gate" && error.status !== 401 && error.status !== 403) setFormStatus("#adminMfaStatus", error.message || "2FA setup could not start.");
      else handleError(error, "2FA setup could not start.");
    }
  }

  async function verifyMfaGate(event) {
    event.preventDefault();
    const code = $("#adminMfaCode").value.trim();
    if (!/^\d{6}$/.test(code)) return setFormStatus("#adminMfaStatus", "Enter a valid 6-digit code.");
    const button = $("#adminMfaVerifyButton"); button.disabled = true;
    try {
      await api(API.mfaVerify, { method: "POST", body: JSON.stringify({ code }) });
      setFormStatus("#adminMfaStatus", "Verified. Opening the Control Center…", true);
      await loadDashboard(true);
      await Promise.all([loadStudents(), loadHistory(), loadPanelVersion()]);
    } catch (error) {
      if (errorCode(error) === "mfa_not_configured") {
        setFormStatus("#adminMfaStatus", "Set up an authenticator for this administrator first.");
        $("#adminMfaSetupButton").focus();
      } else if (error.status === 400) setFormStatus("#adminMfaStatus", error.message || "The authenticator code was not accepted.");
      else handleError(error, "The authenticator code was not accepted.");
    } finally { button.disabled = false; }
  }

  async function submitAdminLogin(event) {
    event.preventDefault();
    const email = $("#adminLoginEmail").value.trim();
    const password = $("#adminLoginPassword").value;
    if (!email || password.length < 6) return setFormStatus("#adminLoginStatus", "Enter the administrator email and password.");
    const button = $("#adminLoginButton"); button.disabled = true;
    setFormStatus("#adminLoginStatus", "Signing in…", true);
    try {
      await adminPasswordLogin(email, password);
      $("#adminLoginPassword").value = "";
      await bootstrap();
    } catch (error) {
      clearSession();
      setFormStatus("#adminLoginStatus", error.message || "Administrator sign-in failed.");
      $("#adminLoginPassword").select();
    } finally { button.disabled = false; }
  }

  function handleError(error, fallback) {
    if (error.status === 401) { clearSession(); showLogin("Your secure admin session expired. Sign in again to continue."); return; }
    if (error.status === 403 && errorCode(error) === "mfa_required") { showMfa(); return; }
    if (error.status === 403) { showForbidden("Not authorized: the server rejected this session's administrator role."); return; }
    notify(error.message || fallback, "error");
  }

  async function loadDashboard(reveal = true) {
    const body = await api(API.dashboard);
    if (reveal) showApp(body);
    renderDashboard(body);
    return body;
  }

  function activatePanel(name) {
    $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `panel-${name}`));
    $$(".nav-item").forEach(button => {
      const active = button.dataset.panel === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    const titles = { security: "Security & Panel", payments: "Payment Review" };
    $("#pageTitle").textContent = titles[name] || title(name);
    $(".sidebar").classList.remove("open");
    $("#menuButton").setAttribute("aria-expanded", "false");
    if (name === "students") loadStudents();
    if (name === "payments") loadPaymentRequests();
    if (name === "history") loadHistory();
    if (name === "security") loadPanelVersion();
    if (name === "overview") loadDashboard(false).catch(error => handleError(error, "Could not refresh the dashboard."));
    $("#main").focus({ preventScroll: true });
  }

  function bind() {
    $("#adminLoginForm").addEventListener("submit", submitAdminLogin);
    $("#adminMfaForm").addEventListener("submit", verifyMfaGate);
    $("#adminMfaSetupButton").addEventListener("click", () => startMfaSetup("gate"));
    $("#copyMfaSecret").addEventListener("click", async () => {
      if (!state.mfaSecret) return setFormStatus("#adminMfaStatus", "Create the authenticator setup first.");
      try { await navigator.clipboard.writeText(state.mfaSecret); setFormStatus("#adminMfaStatus", "Setup key copied.", true); }
      catch (_) { setFormStatus("#adminMfaStatus", `Setup key: ${state.mfaSecret}`); }
    });
    $("#cancelAdminMfa").addEventListener("click", () => signOutAdmin("Sign in with another administrator account."));
    $("#clearAdmin").addEventListener("click", () => signOutAdmin("Sign in with another administrator account."));
    $("#adminSignOut").addEventListener("click", () => signOutAdmin());
    $$("[data-panel]").forEach(button => button.addEventListener("click", () => activatePanel(button.dataset.panel)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => {
      activatePanel(button.dataset.go);
      if (button.dataset.filterStatus) { $("#studentStatus").value = button.dataset.filterStatus; state.studentPage = 1; loadStudents(); }
    }));
    $("#menuButton").addEventListener("click", () => {
      const open = $(".sidebar").classList.toggle("open");
      $("#menuButton").setAttribute("aria-expanded", String(open));
    });
    $("#refreshAll").addEventListener("click", () => activatePanel($(".nav-item.active").dataset.panel));
    $("#retryAdmin").addEventListener("click", bootstrap);
    $("#reloadStudents").addEventListener("click", loadStudents);
    $("#studentFilters").addEventListener("submit", event => { event.preventDefault(); state.studentPage = 1; loadStudents(); });
    $("#studentsPrev").addEventListener("click", () => { if (state.studentPage > 1) { state.studentPage--; loadStudents(); } });
    $("#studentsNext").addEventListener("click", () => { state.studentPage++; loadStudents(); });
    $("#studentRows").addEventListener("click", event => { const button = event.target.closest("[data-student-id]"); if (button) openStudent(button.dataset.studentId); });
    $("#studentCards").addEventListener("click", event => { const button = event.target.closest("[data-student-id]"); if (button) openStudent(button.dataset.studentId); });
    $("#closeStudentDialog").addEventListener("click", () => $("#studentDialog").close());
    $("#reloadPayments").addEventListener("click", loadPaymentRequests);
    $$('[data-payment-view]').forEach(button => button.addEventListener("click", () => selectPaymentView(button.dataset.paymentView)));
    $("#paymentsPrev").addEventListener("click", () => { if (state.paymentPage > 1) { state.paymentPage--; loadPaymentRequests(); } });
    $("#paymentsNext").addEventListener("click", () => { state.paymentPage++; loadPaymentRequests(); });
    ["#paymentRows", "#paymentCards"].forEach(selector => $(selector).addEventListener("click", event => {
      const proof = event.target.closest("[data-payment-proof]");
      if (proof) return showPaymentProof(proof.dataset.paymentProof);
      const review = event.target.closest("[data-payment-review]");
      if (review) openPaymentReview(review.dataset.paymentReview, review.dataset.paymentDecision);
    }));
    $("#closePaymentProof").addEventListener("click", () => $("#paymentProofDialog").close());
    $("#paymentProofDialog").addEventListener("close", clearPaymentProof);
    $("#paymentReviewForm").addEventListener("submit", submitPaymentReview);
    ["#cancelPaymentReview", "#cancelPaymentReviewTop"].forEach(selector => $(selector).addEventListener("click", () => $("#paymentReviewDialog").close()));
    $("#paymentReviewDialog").addEventListener("close", () => { state.paymentReview = null; setFormStatus("#paymentReviewStatus"); });
    $("#paymentGrantForm").addEventListener("submit", submitPaymentGrant);
    $("#reloadHistory").addEventListener("click", loadHistory);
    $("#historyFilters").addEventListener("submit", event => { event.preventDefault(); state.historyPage = 1; loadHistory(); });
    $("#historyPrev").addEventListener("click", () => { if (state.historyPage > 1) { state.historyPage--; loadHistory(); } });
    $("#historyNext").addEventListener("click", () => { state.historyPage++; loadHistory(); });
    $("#viewStudentHistory").addEventListener("click", () => {
      $("#studentDialog").close(); activatePanel("history"); $("#historySearch").value = state.selected && (state.selected.email || state.selected.name) || ""; state.historyPage = 1; loadHistory();
    });
    $("#extendLicense").addEventListener("click", () => confirmAndRun("extend_license", "Extend license", { months: Number($("#licenseMonths").value) }));
    $("#setExpiry").addEventListener("click", () => {
      const value = $("#customExpiry").value;
      if (!value) return notify("Choose a custom expiry date first.", "error");
      confirmAndRun("set_expiry", "Set custom expiry", { expires_at: new Date(`${value}T23:59:59Z`).toISOString() });
    });
    $("#panelArtifactForm").addEventListener("submit", uploadPanelArtifact);
    $("#panelArtifactFile").addEventListener("change", () => {
      try {
        const file = selectedArtifactFile(); state.artifactFile = file;
        $("#artifactFileSummary").textContent = `${file.name} · ${humanBytes(file.size)} · held only in this tab's memory`;
        setArtifactProgress(0, file.size, "Ready to compute integrity hash"); setArtifactStatus("");
      } catch (error) { state.artifactFile = null; setArtifactStatus(error.message); }
    });
    $("#checkArtifactResume").addEventListener("click", () => checkArtifactResume(true));
    $("#panelVersionForm").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        await api(API.panelVersion, { method: "PUT", body: JSON.stringify({ latest_version: $("#latestVersion").value, minimum_supported_version: $("#minimumVersion").value }) });
        notify("Panel version policy saved.");
      } catch (error) { handleError(error, "Could not save panel version policy."); }
    });
    $("#setupMfa").addEventListener("click", () => startMfaSetup("settings"));
    $("#verifyMfa").addEventListener("click", async () => {
      const code = $("#mfaCode").value.trim();
      if (!/^\d{6}$/.test(code)) return notify("Enter a valid 6-digit code.", "error");
      try { await api(API.mfaVerify, { method: "POST", body: JSON.stringify({ code }) }); notify("2FA is verified and enabled."); $("#mfaSetup").hidden = true; }
      catch (error) { handleError(error, "The authenticator code was not accepted."); }
    });
  }

  async function bootstrap() {
    hideAuthSurfaces();
    $("#adminChecking").hidden = false;
    if (!accessToken()) return showLogin();
    try {
      await loadDashboard(true);
      await Promise.all([loadStudents(), loadHistory(), loadPanelVersion()]);
    } catch (error) { handleError(error, "Could not verify administrator access."); }
  }

  bind();
  bootstrap();
})();
