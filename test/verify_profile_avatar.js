/* v5.48.0 profile photo — the circle above the account card.
 *
 * WHY THIS FILE EXISTS. The avatar is the first column the client writes that
 * carries user-supplied binary content (a base64 data URL). Two things must
 * hold or the feature is a liability rather than a feature:
 *
 *   1. The SERVER bounds what any writer may store — size and format — because
 *      the app's canvas downscale is a courtesy, not a control. A missing
 *      check turns the profiles row into unbounded blob storage writable by
 *      every authenticated browser.
 *   2. RLS keeps the write self-only. The column rides the same
 *      profiles_update_own policy as everything else; this file PROVES that
 *      holds for the new column on a real database instead of assuming it.
 *
 * Sections A/B read the repository (no database). Section C applies
 * platform.sql + server/sql/schema.sql to a scratch PostgreSQL database as a
 * NOBYPASSRLS runtime login — the exact posture the DigitalOcean runtime holds
 * — and attacks the column.
 *
 * Usage: node test/verify_profile_avatar.js   (needs PostgreSQL; see
 *        verify_schema_behaviour.js for how to start one) */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DB = "hnk_avatar_test";
const RUNTIME_USER = "hnk_avatar_runtime";
const RUNTIME_PASSWORD = "roleless-avatar-probe";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const app = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const roleless = fs.readFileSync(path.join(ROOT, "server", "sql", "schema.sql"), "utf8");
const supabase = fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8");

/* ---- A) both schema dialects carry the column and the SAME bound ---- */
for (const [label, sql] of [["roleless", roleless], ["supabase", supabase]]) {
  report(label + " schema adds profiles.avatar",
    /alter table public\.profiles add column if not exists avatar text;/.test(sql));
  const chk = sql.match(/add constraint profiles_avatar_chk[\s\S]{0,600}?\)\)\);/);
  report(label + " schema bounds the avatar", !!chk, "profiles_avatar_chk missing");
  if (chk) {
    report(label + " bound is 98304 chars and data-URL-only",
      /char_length\(avatar\) <= 98304/.test(chk[0]) &&
      /'data:image\/jpeg;base64,%'/.test(chk[0]) &&
      /'data:image\/png;base64,%'/.test(chk[0]) &&
      /'data:image\/webp;base64,%'/.test(chk[0]) &&
      /avatar is null/.test(chk[0]),
      chk[0].slice(0, 200));
  }
}

/* ---- B) the app's side of the contract ---- */
report("app bounds match the schema bound",
  /var AVA_MAX_CHARS = 98304;/.test(app));
report("app accepts only image data URLs back out of the profile",
  /AVA_RE = \/\^data:image\\\/\(jpeg\|png\|webp\);base64,\//.test(app));
report("avatar reaches the row through the caller's own PATCH",
  /accFetch\("\/rest\/v1\/profiles\?id=eq\." \+ encodeURIComponent\(acc\.sess\.uid\), \{\s*\n\s*method: "PATCH"/.test(app));
report("the photo is downscaled on a canvas before it travels",
  /c\.width = S; c\.height = S;/.test(app) && /toDataURL\("image\/jpeg", \.82\)/.test(app));
report("avatar renders via img.src, never innerHTML",
  /img\.src = a; img\.style\.display = ""/.test(app) &&
  !/innerHTML[^\n]*avatar/i.test(app));
report("account card carries the circle, the monogram, the + badge and the picker",
  ["accAva", "accAvaImg", "accAvaBrand", "accAvaPlus", "btnAvaPick", "btnAvaDrop", "avaFile", "stAva", "accWelcome", "awSub"]
    .every(id => app.includes('id="' + id + '"')));
report("the circle wears the HNK monogram until a photo is saved",
  /<span class="ava-brand" id="accAvaBrand" aria-hidden="true">HNK<\/span>/.test(app) &&
  /img\.style\.display = "none"; brand\.style\.display = ""/.test(app));
report("the welcome line is present and animated",
  /Welcome to <b>HNK AI Studio<\/b>/.test(app) &&
  /@keyframes awUp/.test(app) && /animation:awUp/.test(app));
report("the + badge needs an account and the circle routes accordingly",
  /plus\.style\.display = acc\.sess \? "" : "none"/.test(app) &&
  /if \(acc\.sess\) avaOpen\(\);/.test(app));
report("motion stands down under prefers-reduced-motion",
  /prefers-reduced-motion:reduce\)\{\.ava-ring,\.ava-brand,\.aw-en b\{animation:none\}/.test(app));
report("signed-out state never shows a stale photo",
  /var a = acc\.sess \? accAvaValue\(\) : "";/.test(app));
for (const key of ["ava_change", "ava_remove", "ava_saved", "ava_removed", "ava_fail", "aw_sub", "aw_back"]) {
  report("string " + key + " is translated", new RegExp("\\b" + key + ":\\{my:").test(app));
}

/* ---- B2) the admin can see every member's photo, safely ---- */
const adminApi = fs.readFileSync(path.join(ROOT, "server", "lib", "admin-api.js"), "utf8");
const adminJs = fs.readFileSync(path.join(ROOT, "docs", "admin", "admin.js"), "utf8");
report("admin list and detail queries both carry the avatar",
  (adminApi.match(/^\s*p\.avatar,$/gm) || []).length === 2);
report("admin UI accepts the avatar only as a bounded image data URL",
  /item\.avatar\.length <= 98304/.test(adminJs) &&
  /\^data:image\\\/\(jpeg\|png\|webp\);base64,\[A-Za-z0-9\+\/=\]\+\$/.test(adminJs));
report("admin UI falls back to the initial badge, never an empty img",
  /: node\("span", \{ className: "avatar", text: name\.slice\(0, 1\)\.toUpperCase\(\)/.test(adminJs));

/* ---- C) the real database refuses what it should ---- */
const ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
const RUNTIME_ENV = Object.assign({}, ENV, { PGUSER: RUNTIME_USER, PGPASSWORD: RUNTIME_PASSWORD });
const psql = (sql, db, env) => execFileSync("psql",
  ["-d", db || "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
  { env: env || ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/* schema files are applied the way migrate.js applies them: one session that
   has pinned the service context first (set_config(..., false) = session) */
const psqlFile = (file, db, env) => execFileSync("psql",
  ["-d", db, "-v", "ON_ERROR_STOP=1", "-q",
   "-c", "select set_config('request.role','service_role',false), " +
         "set_config('request.jwt.claim.sub','',false), " +
         "set_config('request.is_admin','false',false), " +
         "set_config('request.user_email','',false)",
   "-f", file],
  { env: env || ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const AS_USER = uid =>
  "set local request.role = 'authenticated'; " +
  `set local request.jwt.claim.sub = '${uid}'; ` +
  "set local request.is_admin = 'false'; set local request.user_email = ''; ";
const AS_SERVICE =
  "set local request.role = 'service_role'; " +
  "set local request.jwt.claim.sub = ''; " +
  "set local request.is_admin = 'false'; set local request.user_email = ''; ";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB   = "22222222-2222-4222-8222-222222222222";
const GOOD  = "data:image/jpeg;base64," + "A".repeat(64);
const HUGE  = "data:image/jpeg;base64," + "A".repeat(98305);
const EVIL  = "data:text/html;base64," + "A".repeat(64);

try {
  psql("select 1");
} catch (e) {
  report("PostgreSQL reachable", false,
    "start one: docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16");
  process.exit(1);
}

try {
  try { psql(`create role ${RUNTIME_USER} login password '${RUNTIME_PASSWORD}' ` +
    "nosuperuser nocreaterole nocreatedb noreplication nobypassrls"); } catch (e) { /* exists */ }
  psql(`drop database if exists ${DB}`);
  psql(`create database ${DB}`);
  psql(`revoke create on database ${DB} from public; grant connect on database ${DB} to ${RUNTIME_USER}`);
  psql(`revoke create on schema public from public; grant usage, create on schema public to ${RUNTIME_USER}`, DB);
  psqlFile(path.join(ROOT, "server", "sql", "platform.sql"), DB, RUNTIME_ENV);
  psqlFile(path.join(ROOT, "server", "sql", "schema.sql"), DB, RUNTIME_ENV);
  report("schemas apply cleanly to a scratch roleless database", true);

  psql("begin; " + AS_SERVICE +
    `insert into public.hnk_auth_users (id, email) values ('${ALICE}', 'alice@test'), ('${BOB}', 'bob@test'); ` +
    `insert into public.profiles (id) values ('${ALICE}'), ('${BOB}') on conflict do nothing; commit`,
    DB, RUNTIME_ENV);

  const ok = psql("begin; " + AS_USER(ALICE) +
    `update public.profiles set avatar = '${GOOD}' where id = '${ALICE}' returning 'saved'; commit`,
    DB, RUNTIME_ENV);
  report("a customer can save their own avatar", ok.includes("saved"), ok);

  let huge = "not-run";
  try {
    psql("begin; " + AS_USER(ALICE) +
      `update public.profiles set avatar = '${HUGE}' where id = '${ALICE}'; commit`, DB, RUNTIME_ENV);
    huge = "accepted";
  } catch (e) { huge = /profiles_avatar_chk/.test(String(e.stderr || e.message)) ? "refused" : "other:" + e.message; }
  report("an oversize avatar is refused by the named check", huge === "refused", huge);

  let evil = "not-run";
  try {
    psql("begin; " + AS_USER(ALICE) +
      `update public.profiles set avatar = '${EVIL}' where id = '${ALICE}'; commit`, DB, RUNTIME_ENV);
    evil = "accepted";
  } catch (e) { evil = /profiles_avatar_chk/.test(String(e.stderr || e.message)) ? "refused" : "other:" + e.message; }
  report("a non-image data URL is refused by the named check", evil === "refused", evil);

  const cross = psql("begin; " + AS_USER(BOB) +
    `update public.profiles set avatar = '${GOOD}' where id = '${ALICE}' returning 'crossed'; commit`,
    DB, RUNTIME_ENV);
  report("RLS keeps another customer's hands off the photo", !cross.includes("crossed"), cross || "(0 rows — good)");

  const kept = psql("begin; " + AS_SERVICE +
    `select avatar = '${GOOD}' from public.profiles where id = '${ALICE}'; commit`, DB, RUNTIME_ENV);
  report("the attacks left the saved photo untouched", kept === "t", kept);

  const cleared = psql("begin; " + AS_USER(ALICE) +
    `update public.profiles set avatar = null where id = '${ALICE}' returning 'cleared'; commit`,
    DB, RUNTIME_ENV);
  report("a customer can remove their own photo", cleared.includes("cleared"), cleared);
} finally {
  try { psql(`drop database if exists ${DB}`); } catch (e) { /* leave it for inspection */ }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nProfile avatar contract verified.");
process.exit(failures ? 1 : 0);
