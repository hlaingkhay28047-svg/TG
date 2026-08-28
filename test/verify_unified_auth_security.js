"use strict";

/* RED-first JWT key and failed-login throttling contracts. */
const fs=require("fs");
const path=require("path");
const ROOT=path.join(__dirname,"..");
let failures=0;
function report(name,ok,detail) {
  console.log((ok?"PASS":"FAIL")+" — "+name+(ok?"":"  :: "+JSON.stringify(detail)));
  if (!ok) failures++;
}

function verifyJwt() {
  const tokens=require(path.join(ROOT,"server/lib/crypto.js"));
  report("crypto exports a JWT secret readiness predicate",typeof tokens.hasSecureTokenSecret==="function");
  if (typeof tokens.hasSecureTokenSecret==="function") {
    report("JWT readiness requires at least 32 bytes",
      tokens.hasSecureTokenSecret("x".repeat(31))===false&&tokens.hasSecureTokenSecret("x".repeat(32))===true);
  }
  let issueCode=null,unsafeToken=null;
  try { unsafeToken=tokens.signToken({sub:"11111111-1111-4111-8111-111111111111"},"short",60).token; }
  catch (error) { issueCode=error&&error.code; }
  report("access-token issue fails closed on a short signing key",
    issueCode==="security_configuration_missing",{issueCode});
  report("access-token verification fails closed on a short signing key",
    tokens.verifyToken(unsafeToken||"a.b.c","short")===null);
}

async function verifyKdfCapacity() {
  const tokens=require(path.join(ROOT,"server/lib/crypto.js"));
  let release;
  const held=new Promise(resolve=>{release=resolve;});
  const gate=tokens.createPasswordKdfGate(2);
  const first=gate(()=>held);
  const second=gate(()=>held);
  let busyCode=null;
  try { await gate(async()=>"unexpected"); }
  catch (error) { busyCode=error&&error.code; }
  release("done");
  await Promise.all([first,second]);
  const recovered=await gate(async()=>"recovered");
  report("password KDF capacity rejects overflow without leaking a slot",
    busyCode==="auth_busy"&&recovered==="recovered",{busyCode,recovered});
}

function verifyThrottle() {
  let protection=null;
  try { protection=require(path.join(ROOT,"server/lib/login-protection.js")); }
  catch (error) { report("login protection module is loadable",false,{error:String(error.message||error)});return; }
  report("login protection exports login and public-auth attempt evaluators",
    typeof protection.evaluateFailedLoginThrottle==="function"&&
      typeof protection.evaluateAuthAttemptThrottle==="function"&&
      typeof protection.evaluateLoginAdmissionThrottle==="function");
  if (typeof protection.evaluateFailedLoginThrottle!=="function") return;
  const shared={emailIpLimit:5,emailLimit:10,ipLimit:25};
  const emailIp=protection.evaluateFailedLoginThrottle({...shared,emailIpFailures:5,ipFailures:5});
  const email=protection.evaluateFailedLoginThrottle({...shared,emailIpFailures:1,emailFailures:10,ipFailures:4});
  const ip=protection.evaluateFailedLoginThrottle({...shared,emailIpFailures:1,ipFailures:25});
  const otherIps=protection.evaluateFailedLoginThrottle({...shared,emailIpFailures:0,ipFailures:4});
  report("throttle limits an email/source pair, a distributed email attack, and a high-volume IP independently",
    emailIp.blocked&&emailIp.reason==="email_ip_rate_limited"&&
      email.blocked&&email.reason==="email_rate_limited"&&
      ip.blocked&&ip.reason==="ip_rate_limited"&&!otherIps.blocked,
    {emailIp,email,ip,otherIps});
  const admissionIp=protection.evaluateLoginAdmissionThrottle({
    ipAttempts:20,globalAttempts:20,ipLimit:20,globalLimit:300});
  const admissionGlobal=protection.evaluateLoginAdmissionThrottle({
    ipAttempts:1,globalAttempts:300,ipLimit:20,globalLimit:300});
  report("all password attempts have independent IP and global admission limits",
    admissionIp.blocked&&admissionIp.reason==="ip_rate_limited"&&
      admissionGlobal.blocked&&admissionGlobal.reason==="global_rate_limited",
    {admissionIp,admissionGlobal});

  const source=fs.readFileSync(path.join(ROOT,"server/lib/auth.js"),"utf8");
  report("failed-login SQL keys the low threshold by email plus server-hashed IP",
    /operation='login'.*email_hash=\$1 and ip_hash=\$2/is.test(source)&&
      /email_ip_failures/i.test(source)&&/email_failures/i.test(source)&&
      /ip_failures/i.test(source)&&!/count\(\*\)\s+filter/i.test(source));
  report("blocked login attempts do not amplify the audit table after reaching the threshold",
    /if \(decision\.blocked\) \{[\s\S]{0,180}rate_limited/m.test(source));
  report("failed-password admission is atomically reserved before scrypt and released only after proof",
    /async function reserveLoginAttempt[\s\S]*pg_advisory_xact_lock[\s\S]*operation='login'[\s\S]*insert into public\.auth_attempts[\s\S]*returning id/.test(source)&&
      source.lastIndexOf("reserveLoginAttempt(email,context)")<source.indexOf("kdf.verifyPassword(password")&&
      /delete from public\.auth_attempts where id=\$1 and operation='login'/.test(source));
  report("known-correct logins retain a separate all-attempt admission without poisoning victim failure counts",
    /operation='login_admission'/.test(source)&&
      /insert into public\.auth_attempts \(operation,ip_hash,email_hash\) values \('login_admission'/.test(source)&&
      !/delete from public\.auth_attempts where id=\$1 and operation='login_admission'/.test(source));
  report("KDF overflow is rejected before login, signup, or reset reserves durable DB capacity",
    /withPasswordKdfSlot\(async kdf=>\{[\s\S]{0,500}reserveLoginAttempt\(email,context\)/.test(source)&&
      /withPasswordKdfSlot\(async kdf=>\{[\s\S]{0,180}reserveAuthAttempt\("signup"/.test(source)&&
      /withPasswordKdfSlot\(async kdf=>\{[\s\S]{0,1200}reserveAuthAttempt\("password_change"/.test(source)&&
      !/error&&error\.code==="auth_busy"[\s\S]{0,500}delete from public\.auth_attempts/.test(source));
  const passwordSelect=source.indexOf("where lower(email) = lower($1) for share");
  const passwordVerify=source.indexOf("kdf.verifyPassword(password",passwordSelect);
  const sessionIssue=source.indexOf("const envelope = await session",passwordVerify);
  report("password login holds the identity row through session issuance so reset revocation cannot be bypassed",
    passwordSelect>=0&&passwordSelect<passwordVerify&&passwordVerify<sessionIssue);

  const signupBlocked=protection.evaluateAuthAttemptThrottle({
    ipAttempts:5,emailAttempts:1,globalAttempts:5,ipLimit:5,emailLimit:3,globalLimit:200});
  const recoverEmailBlocked=protection.evaluateAuthAttemptThrottle({
    ipAttempts:1,emailAttempts:3,globalAttempts:3,ipLimit:10,emailLimit:3,globalLimit:300});
  report("signup/recovery throttle enforces independent source, email, and global reservations",
    signupBlocked.blocked&&signupBlocked.reason==="ip_rate_limited"&&
      recoverEmailBlocked.blocked&&recoverEmailBlocked.reason==="email_rate_limited",
    {signupBlocked,recoverEmailBlocked});
  report("public signup reserves an indexed DB attempt before expensive password hashing",
    source.indexOf('reserveAuthAttempt("signup"')>=0&&
      source.indexOf('reserveAuthAttempt("signup"')<source.indexOf("kdf.hashPassword(password)"));
  report("oversized login credentials are rejected before password KDF work",
    /MAX_PASSWORD_LENGTH/.test(source)&&
      /password\.length>MAX_PASSWORD_LENGTH[\s\S]{0,300}Invalid login credentials/.test(source));
  const updateStart=source.indexOf("async function updateUser");
  const updateEnd=source.indexOf("async function getUser",updateStart);
  const updateSource=source.slice(updateStart,updateEnd);
  const platform=fs.readFileSync(path.join(ROOT,"server/sql/platform.sql"),"utf8");
  report("anonymous password reset validates, rate-reserves and index-proves its bearer before scrypt",
    /RECOVERY_TOKEN_RE\.test\(recoveryBearer\)/.test(updateSource)&&
      updateSource.indexOf("withPasswordKdfSlot")<updateSource.indexOf('reserveAuthAttempt("recovery_probe"')&&
      updateSource.indexOf('reserveAuthAttempt("recovery_probe"')<updateSource.indexOf("recovery_token=$1")&&
      updateSource.indexOf("recovery_token=$1")<updateSource.indexOf('reserveAuthAttempt("password_change"')&&
      updateSource.indexOf('reserveAuthAttempt("password_change"')<updateSource.indexOf("kdf.hashPassword(password)")&&
      /password\.length>MAX_PASSWORD_LENGTH/.test(updateSource)&&
      /hnk_auth_users_recovery_token_uniq[\s\S]{0,180}recovery_token[\s\S]{0,100}is not null/i.test(platform));
  const profileLock=updateSource.indexOf("where id=$1 for share");
  const sourceSessionLock=updateSource.indexOf("where id=$1 and user_id=$2 and revoked_at is null and expires_at>now()");
  const passwordWrite=updateSource.indexOf("update public.hnk_auth_users set encrypted_password");
  const resetSessionIssue=updateSource.indexOf("const s = await session");
  report("password change revalidates its canonical source session under the admin lock order",
    /auth\.updateUser\(body,uid,[\s\S]{0,180}context,identity\.sessionId\|\|null\)/.test(
      fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8"))&&
      profileLock>=0&&profileLock<sourceSessionLock&&sourceSessionLock<passwordWrite&&passwordWrite<resetSessionIssue&&
      /for update/.test(updateSource.slice(sourceSessionLock,sourceSessionLock+180))&&
      /sourceSession\.rows\.length[\s\S]{0,100}session_revoked/.test(updateSource));
  report("recovery reserves before mail and SMTP work happens outside the database transaction",
    /reserveAuthAttempt\("recover"/.test(source)&&
      /const recipient=await asService/.test(source)&&
      /\}\);\s*if \(recipient\)/.test(source));

  const sourceIdentity=require(path.join(ROOT,"server/lib/request-source.js"));
  const request={headers:{"x-forwarded-for":"198.51.100.9, 203.0.113.7",
    "do-connecting-ip":"192.0.2.25"},
    socket:{remoteAddress:"10.0.0.4"}};
  report("rate-limit identity trusts DigitalOcean's client header only when explicitly configured",
    sourceIdentity.resolveClientAddress(request,0,false)==="10.0.0.4"&&
      sourceIdentity.resolveClientAddress(request,0,true)==="192.0.2.25"&&
      sourceIdentity.resolveClientAddress(request,1,false)==="203.0.113.7");
}

function verifyRecoveryTokens() {
  const source=fs.readFileSync(path.join(ROOT,"server/lib/auth.js"),"utf8");
  const server=fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8");
  const emailSource=fs.readFileSync(path.join(ROOT,"server/lib/email.js"),"utf8");
  const email=require(path.join(ROOT,"server/lib/email.js"));
  report("password-recovery secrets are hashed before database storage and lookup",
    /recovery_token\s*=\s*\$1[\s\S]{0,180}hashRefreshToken\(token\)/.test(source)&&
    /where recovery_token\s*=\s*\$1[\s\S]{0,180}hashRefreshToken\(recoveryBearer\)/.test(source));
  report("password-recovery consumption locks the matching row against concurrent replay",
    /recovery_sent_at[\s\S]{0,160}for update/.test(source));
  report("caller-controlled recovery redirects never reach the email builder",
    /auth\.recover\(body,context\)/.test(server)&&
    /async function sendRecoveryEmail\(to, token\)/.test(emailSource)&&!/redirectTo/.test(emailSource));
  let hostileBase=null,httpsBase=null;
  try { hostileBase=email.recoveryBase("http://attacker.example/path"); } catch (error) { hostileBase=error&&error.message; }
  try { httpsBase=email.recoveryBase("https://studio.example/anything?ignored=1"); } catch (error) { httpsBase=error&&error.message; }
  report("recovery links are forced to the configured HTTPS origin's /reset/ route",
    /must use HTTPS/.test(String(hostileBase))&&httpsBase==="https://studio.example/reset/",
    {hostileBase,httpsBase});
  const recoveryLink=email.recoveryLink("reset-token-fixture","https://studio.example/ignored");
  const parsedRecoveryLink=new URL(recoveryLink);
  const recoveryFragment=new URLSearchParams(parsedRecoveryLink.hash.slice(1));
  const resetPage=fs.readFileSync(path.join(ROOT,"docs/reset/index.html"),"utf8");
  const fragmentRead=resetPage.indexOf('h.get("token")');
  const legacyQueryRead=resetPage.indexOf('q.get("token")');
  report("new recovery links keep the reset bearer out of HTTP request URLs",
    parsedRecoveryLink.search===""&&recoveryFragment.get("token")==="reset-token-fixture"&&
      recoveryFragment.get("type")==="recovery"&&
      /const link\s*=\s*recoveryLink\(token\)/.test(emailSource)&&
      !/\?token=/.test(emailSource)&&fragmentRead>=0&&fragmentRead<legacyQueryRead,
    {pathname:parsedRecoveryLink.pathname,search:parsedRecoveryLink.search,hashKeys:[...recoveryFragment.keys()]});
  const smtp=email.smtpTlsOptions("smtp.example.test",465);
  report("SMTP credentials and recovery bearers are sent only over verified TLS 1.2+",
    smtp&&smtp.rejectUnauthorized===true&&smtp.minVersion==="TLSv1.2"&&
      /tls\.connect\(smtpTlsOptions/.test(emailSource)&&
      !/require\(["']net["']\)|net\.connect/.test(emailSource));
  /* 2026-08-28 — the owner is emailed on each signup so pending students are
     approved without polling the dashboard. The recipient is only ever the
     owner's configured address, the send is fire-and-forget after the commit,
     and a failure log carries no address (public diagnostics republish
     container stdout). */
  report("signup notices go only to the owner-configured address, fire-and-forget, with masked failure logs",
    /async function sendSignupNotice\(/.test(emailSource)&&
      /SIGNUP_NOTICE_EMAIL|BOOTSTRAP_ADMIN_EMAIL/.test(emailSource)&&
      !/sendSignupNotice\([^)]*to[,)]/.test(emailSource)&&
      /notifySignupBestEffort\(email\);\s*return outcome;/.test(source)&&
      /replace\(EMAIL_MASK_RE, "<address withheld>"\)/.test(source)&&
      /smtpConfigured:require\("\.\/lib\/email"\)\.smtpConfigured\(\)/.test(
        fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8")));
}

function verifyReadiness() {
  const source=fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8");
  report("readiness and health both attest JWT signing-key strength",
    /hasSecureTokenSecret/.test(source)&&/securityReady/.test(source));
  report("readiness and every database route fail closed without verified TLS",
    /tlsSecurityReady/.test(source)&&/database_tls_unverified/.test(source)&&
      /verified database TLS is required/.test(source));
  const database=fs.readFileSync(path.join(ROOT,"server/lib/db.js"),"utf8");
  report("certificate verification cannot downgrade without an explicit local/test override",
    /ALLOW_UNVERIFIED_DB_TLS/.test(database)&&
      /if \(!allowsUnverifiedTls\(\)\)[\s\S]{0,180}return false/.test(database));
  const migration=fs.readFileSync(path.join(ROOT,"server/lib/migrate.js"),"utf8");
  report("migration and request transactions refuse to open an unverified database connection",
    /assertTlsConnectionAllowed\(\);[\s\S]{0,100}pool\.connect\(\)/.test(database)&&
      /assertTlsConnectionAllowed\(\)/.test(migration)&&
      /database\.assertTlsConnectionAllowed\(\)/.test(source));
}

function verifyIndependentSecrets() {
  const entitlements=require(path.join(ROOT,"server/lib/entitlements.js"));
  const names=entitlements.REQUIRED_SECURITY_SECRETS||[];
  const saved={};
  for (const name of [...names,"JWT_SECRET","ALLOW_DERIVED_SECURITY_SECRETS"]) saved[name]=process.env[name];
  delete process.env.ALLOW_DERIVED_SECURITY_SECRETS;
  names.forEach((name,index)=>{process.env[name]=(name+"-"+index+"-").padEnd(48,"x");});
  process.env.JWT_SECRET="jwt-before-rotation-".padEnd(48,"j");
  const before=entitlements.requireSecret("MFA_ENCRYPTION_KEY",process.env.JWT_SECRET,32);
  process.env.JWT_SECRET="jwt-after-rotation-".padEnd(48,"k");
  const after=entitlements.requireSecret("MFA_ENCRYPTION_KEY",process.env.JWT_SECRET,32);
  const ready=entitlements.securitySecretStatus();
  process.env.PANEL_LEASE_SECRET=process.env.JWT_SECRET;
  const duplicated=entitlements.securitySecretStatus();
  process.env.PANEL_LEASE_SECRET=("PANEL_LEASE_SECRET-4-").padEnd(48,"x");
  delete process.env.DEVICE_ID_HASH_SECRET;
  const missing=entitlements.securitySecretStatus();
  let fallbackCode=null;
  try { entitlements.requireSecret("DEVICE_ID_HASH_SECRET",process.env.JWT_SECRET,32); }
  catch (error) { fallbackCode=error&&error.code; }
  for (const [name,value] of Object.entries(saved)) {
    if (value===undefined) delete process.env[name]; else process.env[name]=value;
  }
  const productionSpec=fs.readFileSync(path.join(ROOT,".do/app.yaml"),"utf8");
  const stagingSpec=fs.readFileSync(path.join(ROOT,".do/staging.app.yaml"),"utf8");
  report("JWT rotation leaves independent MFA/device secrets stable and missing keys fail closed",
    names.length===5&&ready.ready&&!duplicated.ready&&
      duplicated.duplicates.some(group=>group.includes("PANEL_LEASE_SECRET")&&group.includes("JWT_SECRET"))&&
      before===after&&!missing.ready&&
      missing.missing.includes("DEVICE_ID_HASH_SECRET")&&fallbackCode==="security_configuration_missing",
    {names,ready,duplicated,missing,fallbackCode});
  report("both DigitalOcean specs declare every independent key as an encrypted secret",
    names.every(name=>new RegExp("key: "+name+"[\\s\\S]{0,80}type: SECRET").test(productionSpec)&&
      new RegExp("key: "+name+"[\\s\\S]{0,80}type: SECRET").test(stagingSpec)));
}

function verifyDeviceBinding() {
  const v1=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  const entitlements=fs.readFileSync(path.join(ROOT,"server/lib/entitlements.js"),"utf8");
  report("session-bound installation identity takes priority over caller-supplied query identity",
    /const bound = await sessionInstallationHash[\s\S]{0,180}if \(bound\)[\s\S]{0,160}else if \(supplied\)/.test(v1));
  report("production panel pairing codes carry at least 72 bits of cryptographic entropy",
    /randomBytes\(9\)\.toString\("base64url"\)/.test(entitlements)&&
      !/randomInt\(0,\s*1000000\)/.test(entitlements));
}

function verifyMfaThrottle() {
  const admin=fs.readFileSync(path.join(ROOT,"server/lib/admin-api.js"),"utf8");
  const v1=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  report("admin MFA attempts use a serialized per-user time-window limit",
    /pg_advisory_xact_lock/.test(admin)&&/event_type='mfa_failed'/.test(admin)&&
      /MFA_FAILED_LIMIT/.test(admin)&&/mfa_rate_limited/.test(admin));
  report("an invalid MFA attempt commits its audit row before v1 emits the HTTP error",
    /insert into public\.login_history[\s\S]{0,500}'mfa_failed'/.test(admin)&&
      /return \{ok:false,error:/.test(admin)&&
      /result&&result\.error[\s\S]{0,180}throw new ApiError/.test(v1));
  report("MFA replacement keeps the confirmed secret active until the pending secret is proven",
    /pending_encrypted_secret/.test(admin)&&
      /then public\.admin_mfa\.encrypted_secret else excluded\.encrypted_secret/.test(admin)&&
      /encrypted_secret=pending_encrypted_secret[\s\S]{0,120}pending_encrypted_secret=null/.test(admin));
}

function verifyAdminDemotion() {
  const live=fs.readFileSync(path.join(ROOT,"server/lib/live-auth.js"),"utf8");
  report("a stale admin role is stripped whenever the authoritative profile flag is false",
    /if \(!row\.is_admin&&adminRoleIndex>=0\) roles\.splice/.test(live));
}

(async()=>{
  verifyJwt();
  await verifyKdfCapacity();
  verifyThrottle();verifyRecoveryTokens();verifyReadiness();verifyIndependentSecrets();
  verifyDeviceBinding();verifyMfaThrottle();verifyAdminDemotion();
  if (failures) {
    console.error("\nFAIL (unified auth security): "+failures+" check(s)");
    process.exit(1);
  }
  console.log("\nPASS (unified auth security)");
})().catch(error=>{
  console.error("\nFAIL (unified auth security): "+String(error&&error.stack||error));
  process.exit(1);
});
