"use strict";
/* A small SMTP client, for one message: the password-reset link.
 *
 * This is the one thing Supabase supplied that has no equivalent in a
 * PostgreSQL cluster. Rather than add a dependency and an account with a mail
 * vendor, this speaks SMTP to whatever server the owner already has — the same
 * Gmail address the project is run from will do, with an app password.
 *
 * If SMTP is not configured it throws, and recover() catches, logs and still
 * answers 200. That is deliberate: a reset request must not reveal whether an
 * address exists, and it must not 500 the endpoint either. The consequence is
 * real and worth stating plainly — until SMTP_HOST is set, NO reset mail is
 * sent and a locked-out customer needs the owner to change their password by
 * hand.
 */
const tls = require("tls");

const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.SMTP_FROM || USER;
const APP_ORIGIN = process.env.APP_ORIGIN || "";

function talk(socket, expectCode, line) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = chunk => {
      buf += chunk.toString("utf8");
      /* A reply is finished when a line reads "250 x"; "250-x" is a continuation. */
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last || !/^\d{3} /.test(last)) return;
      socket.removeListener("data", onData);
      const code = Number(last.slice(0, 3));
      if (expectCode && code !== expectCode) return reject(new Error(`SMTP expected ${expectCode}, got: ${last}`));
      resolve(buf);
    };
    socket.on("data", onData);
    socket.once("error", reject);
    if (line !== undefined) socket.write(line + "\r\n");
  });
}

function smtpTlsOptions(host,port) {
  const hostname=String(host||"").trim();
  const number=Number(port);
  if (!hostname) throw new Error("SMTP_HOST is required");
  if (!Number.isInteger(number)||number<1||number>65535) throw new Error("SMTP_PORT is invalid");
  return {
    host:hostname,port:number,servername:hostname,
    rejectUnauthorized:true,minVersion:"TLSv1.2",
  };
}

function connect() {
  return new Promise((resolve, reject) => {
    /* Credentials and the reset bearer are never written before a verified
       TLS handshake. Port 465 is the default. A STARTTLS-only port such as 587
       will fail closed instead of silently falling back to plaintext. */
    const socket = tls.connect(smtpTlsOptions(HOST,PORT), () => resolve(socket));
    socket.setTimeout(15000, () => { socket.destroy(new Error("SMTP timeout")); });
    socket.once("error", reject);
  });
}

async function sendMail(to, subject, text) {
  if (!HOST || !USER || !PASS) throw new Error("SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)");
  const socket = await connect();
  try {
    await talk(socket, 220);
    await talk(socket, 250, "EHLO hnk");
    await talk(socket, 334, "AUTH LOGIN");
    await talk(socket, 334, Buffer.from(USER).toString("base64"));
    await talk(socket, 235, Buffer.from(PASS).toString("base64"));
    await talk(socket, 250, `MAIL FROM:<${FROM}>`);
    await talk(socket, 250, `RCPT TO:<${to}>`);
    await talk(socket, 354, "DATA");
    const headers = [
      `From: HNK Create Studio <${FROM}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
    ].join("\r\n");
    /* A line consisting of a single dot ends DATA, so any such line in the body
       must be escaped or the message is truncated there. */
    const body = text.split(/\r?\n/).map(l => (l === "." ? ".." : l)).join("\r\n");
    await talk(socket, 250, headers + "\r\n\r\n" + body + "\r\n.");
    await talk(socket, 221, "QUIT");
  } finally {
    socket.destroy();
  }
}

function recoveryBase(appOrigin) {
  const configured = String(appOrigin === undefined ? APP_ORIGIN : appOrigin).trim();
  if (!configured) throw new Error("no reset URL: set APP_ORIGIN");
  let origin;
  try { origin = new URL(configured); }
  catch (_) { throw new Error("APP_ORIGIN must be a valid absolute URL"); }
  if (origin.protocol !== "https:" && origin.hostname !== "127.0.0.1" && origin.hostname !== "localhost") {
    throw new Error("APP_ORIGIN must use HTTPS");
  }
  if (origin.username || origin.password) throw new Error("APP_ORIGIN must not contain credentials");
  return new URL("/reset/", origin.origin).href;
}

function recoveryLink(token,appOrigin) {
  const base=recoveryBase(appOrigin);
  /* URL fragments are consumed by the browser and are never sent in the HTTP
     request line. Keeping the one-hour bearer here prevents DigitalOcean,
     reverse proxies, CDNs, and access logs from retaining an account-reset
     credential before the page has a chance to erase it. */
  return base+"#"+new URLSearchParams({token:String(token||""),type:"recovery"}).toString();
}

async function sendRecoveryEmail(to, token) {
  /* The destination is intentionally not a parameter. A caller may choose
     which account receives mail, but never which origin receives its bearer. */
  const link = recoveryLink(token);
  await sendMail(to, "HNK Create Studio — password reset",
    "A password reset was requested for this address.\n\n" +
    link + "\n\n" +
    "The link is valid for one hour. If you did not ask for this, ignore this message — nothing has changed.\n");
}

function smtpConfigured() {
  return !!(HOST && USER && PASS);
}

/* Where the owner is told about a new signup. The recipient comes only from
   the owner's own configuration — SIGNUP_NOTICE_EMAIL, or the address already
   trusted to name the first administrator — never from the request, so a
   signup cannot choose where its notification lands. */
const SIGNUP_NOTICE_TO = String(process.env.SIGNUP_NOTICE_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim();

async function sendSignupNotice(studentEmail) {
  if (!SIGNUP_NOTICE_TO) throw new Error("no signup-notice recipient: set BOOTSTRAP_ADMIN_EMAIL or SIGNUP_NOTICE_EMAIL");
  let adminUrl = "";
  try { adminUrl = new URL(recoveryBase()).origin + "/admin/"; } catch (_) {}
  await sendMail(SIGNUP_NOTICE_TO, "HNK Create Studio — new student awaiting approval",
    "A new student just signed up and is waiting for approval:\n\n" +
    "    " + String(studentEmail || "") + "\n\n" +
    (adminUrl
      ? "Approve or reject from the Control Center:\n\n    " + adminUrl + "\n"
      : "Approve or reject from the Control Center.\n"));
}

module.exports = { sendMail, sendRecoveryEmail, sendSignupNotice, smtpConfigured, recoveryBase, recoveryLink, smtpTlsOptions };
