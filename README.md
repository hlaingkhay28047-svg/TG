# TG

Adobe Photoshop plugin tools and HNK web app.

## Always-live upgrade flow

Every upgrade should have a live DigitalOcean copy automatically:

1. Work on `upgrade-safe-wave`.
2. Every push to `upgrade-safe-wave` runs GitHub CI and updates DigitalOcean staging `hnk-ai-tools-2`.
3. As soon as the full CI sweep is green, merge to `main` — tested upgrades ship immediately by standing owner approval; the test suite is the release gate.
4. Every push/merge to `main` updates DigitalOcean production `hnk-ai-tools-3` and verifies `/app/version.json` matches the repository release.
5. Web app, landing site and Photoshop panel always ship together in one wave.

This keeps both GitHub and DigitalOcean moving together while still separating unfinished staging code from the production app.

## Supabase — accounts, the Premium wall and the admin panel

From web v5.30.0 the app opens on a login wall: no session shows sign-in, a
signed-in account with no active plan shows the buy flow, and only an active
plan reaches the studio. A foreground tab re-reads the profile every five
minutes, so an expiry or an admin approval lands without a manual refresh, and
a sign-in older than 30 days is asked to log in again. Admins get a payment
card on Home that approves or rejects each request.

**None of that is a security boundary.** `docs/` is a static site holding the
anon key, so every request the browser makes can be replayed by hand. The wall
and the admin card are user interface. What actually stops a customer approving
their own payment is row-level security, and it lives in `supabase/schema.sql`.

Apply it once — Supabase dashboard → SQL editor → paste → Run (it is
idempotent) — then grant yourself admin. It creates the four tables it
protects, so it also works on a project that has never held them:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

The file also carries the two triggers the client deliberately does not do
itself: approval extends the plan in the database (from the later of now and
the current expiry, so renewing early adds time instead of losing it), and a
guard trigger reverts any attempt by a non-admin to write their own
`plan_status`, `plan_expires_at`, `allowed_devices` or `is_admin`.

Until it is applied, treat the admin panel as a convenience and assume any
signed-in user could approve themselves. Section 9 of the file is the check
that proves it took.

**Re-run it after web v5.32.0.** That release closed three holes in the file
itself, so a project still running the older schema is not protected by the
paragraphs above:

- `app_settings` — the row holding `payment_instructions_my`, i.e. the bank
  account number every customer wires money to — had no row-level security at
  all. Supabase's default grants make an RLS-less table not merely readable but
  *writable*, so one `PATCH` from a browser console could have redirected the
  studio's revenue. It is now RLS-on with a read-only policy and no write
  policy of any kind.
- The device cap was enforced only in the browser. It is now a trigger, raising
  the same `P0001` the client already knows how to explain.
- The guard trigger used to run its admin check unconditionally, and
  `auth.uid()` is NULL in the SQL editor — so the guard blocked the very
  `update ... set is_admin = true` bootstrap above. It now returns early when
  there is no authenticated user, which is exactly the SQL-editor case and
  never a browser one.

The file stays idempotent, so re-running it is safe whatever state the project
is in. `test/verify_rls_contract.js` proves the schema covers every table the
client actually fetches, but no test in this repo can prove you have run it.

## Moving the database to DigitalOcean

The app used Supabase for four things, not one: the PostgreSQL database, the
PostgREST HTTP API the browser calls, the Auth service, and object storage for
payment proofs. A DigitalOcean managed database supplies the first. `server/`
supplies the other three in about a thousand lines, and `.do/app.yaml` runs it
alongside the static site in the same app.

**Authorisation was not rewritten, deliberately.** Every request opens a
transaction, sets the role and `request.jwt.claim.sub` from a verified token,
and lets `supabase/schema.sql` decide the rest — the same policies, the same
triggers, the same 22 checks in `verify_schema_behaviour.js`. Reimplementing
"who may approve a payment" in JavaScript is where that kind of bug lives.

`server/sql/platform.sql` creates what the platform used to: `auth.users`,
`auth.uid()`, `storage.objects`, and the `anon` / `authenticated` roles. It
applies **before** `supabase/schema.sql`, which needs no edits at all.

### What you have to do, in order

Nothing below can be done from this repository — it needs your DigitalOcean
account.

1. **Deploy the app.** `.do/app.yaml` already declares the static site, the
   `hnk-api` service and a managed PostgreSQL database. DigitalOcean creates the
   database and fills in `DATABASE_URL` itself; there is no connection string to
   copy anywhere.

2. **Set `JWT_SECRET`** in the DigitalOcean console, as an encrypted secret, to
   64 random hex characters. Anything that knows this value can mint a token for
   any account, so it belongs nowhere else — not in this repository, not in a
   message. Changing it later logs everybody out, which is exactly what you want
   if it is ever exposed.

3. **Apply the schema**, in this order, against the new database:

   ```
   server/sql/platform.sql
   supabase/schema.sql
   ```

4. **Make yourself an admin**, the same statement as before — it works because
   the guard trigger steps aside for a caller with no `auth.uid()`:

   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```

5. **Set prices and payment details** in `app_settings`, exactly as before.

### Two things that do not come across

**Passwords cannot be migrated.** Supabase stores bcrypt; this service stores
scrypt, and a bcrypt hash simply never verifies — it is not a setting that can
be flipped. Every account has to set a new password. If the only account is
yours, that is one signup and this does not matter; if you have customers by
then, they all need a reset, and step two below has to be working first.

**Password-reset email needs an SMTP server.** Supabase sent those messages.
Set `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` as secrets — a Gmail address with
an app password is enough. Until you do, `recover` still answers 200 (it must
not reveal which addresses exist) but **no mail is sent**, and a locked-out
customer needs you to change their password by hand.

### Moving existing rows

Only the four application tables carry anything worth keeping, and none of them
holds a password. Export from Supabase's SQL editor and import into the new
database:

```sql
-- run in Supabase, save the output
select * from public.app_settings;
select * from public.profiles;
select * from public.payment_requests;
select * from public.devices;
```

Insert `auth.users` rows first — `profiles.id` references them — leaving
`encrypted_password` null so the account exists but cannot be signed into until
its owner sets a password. `profiles_email_uniq` and `users_email_uniq` will
refuse a duplicate address, which is the point.

Uploaded payment proofs live in Supabase storage rather than in a table. They
are evidence for payments you have already approved, so they are usually not
worth moving; if they are, download and re-upload them through the app.

### Cost, plainly

A managed PostgreSQL cluster and a service instance are each billed monthly, on
top of the static site that is currently free. This is **not** cheaper than
Supabase Pro — it is comparable or more, and it is more moving parts to run.
What it buys is that everything is in one account, on one bill, and nothing
pauses itself after a week of inactivity. Check the current prices in the
DigitalOcean console before committing; they change.

### Going back

The Supabase project is untouched by any of this. Reverting means restoring the
previous `SB_URL` in `docs/app/index.html` and removing the `services:` and
`databases:` blocks from `.do/app.yaml` — the app schema is identical on both
sides, so nothing else has to change.

## The Visual Library was mostly thumbnails (panel v6.23.0)

The panel's headline feature advertises 1,801 reference images. 1,446 of them —
**80%** — resolved `paths.full` to `assets/user_library_ui/`, the UI card tier,
median **5.6 KB**. A customer who paid for the panel, opened the library and
pulled a reference into Photoshop got a thumbnail, and would know it instantly.

The real images were never missing. They were sitting in `docs/app/lib/full`,
where the web app serves them, and every one of the 1,446 had a same-named file
waiting: 1,446 of 1,446 matched. Only the panel's copy of the index pointed at
the wrong tier. The 355 items that did resolve correctly already used
`assets/user_library/`, so this extends a path proven in production rather than
introducing one.

`paths.full` now points at the real tier for all 1,801. Thumbnail-tier entries
fall from 1,446 (80%) to 31 (2%) — the 31 are genuinely small originals — and
the median jumps from 5.6 KB to **41.8 KB**. `preview` and `thumb` are
untouched: a card grid *should* load the small tier.

**Why the archive is 88 MB and not 101 MB.** Bundling the full tier unchanged
produced a 101.3 MiB `.ccx`, and GitHub refuses any file over 100 MiB — the
push would simply have been rejected, with no LFS configured and no reason to
believe a static-site host would resolve LFS pointers for a download link. The
full tier is therefore re-encoded at JPEG quality 82, progressive, and a file is
only replaced when the result is *smaller* (123 were left alone because
re-encoding would have grown them).

That number is measured, not guessed. These are 427×640 reference images, not
high-resolution photographs, and at quality 82 the median PSNR against the
original is **43.8 dB** with a worst case of 36.4 dB — above the ~40 dB at which
a re-encode is considered visually identical. The archive lands at 88.0 MiB,
12 MiB inside the cap, and the landing's advertised size follows in 54 places.

## The schema could not build the database it protects

Every statement in `supabase/schema.sql` used to `ALTER`; none `CREATE`d. The
four tables were made by hand in the dashboard when the project was first stood
up, and that work was never written down — the file said so in its own header,
and the app repeated it at `accLoadProfile`.

That is survivable right up until the file meets a project without them: a new
region, a restored backup, a second environment, or the SQL editor of the wrong
one of two projects. The run then stops on its first statement —

```
ERROR:  42P01: relation "public.profiles" does not exist
```

— **before a single policy is created.** The database is left with no tables
*and* no protection, which is the worse of the two states it could have been
in, and the error names a missing table rather than the missing `CREATE` that
actually explains it.

Section 0 now declares `profiles`, `payment_requests`, `app_settings` and
`devices` from the contract the header already documented, with `if not exists`
throughout — so it is a no-op on a live project, and section 1 still adds the
columns an existing table is missing. Two things stay deliberately absent, and
are commented as such: no foreign key from `payment_requests.user_id` to
`profiles.id`, because `admLoadWho` fetches names in a second request precisely
*because* there is none, and declaring one would make a fresh project behave
differently from the live one; and no signup trigger, because v5.38.0 moved
that job to `profiles_insert_self`.

**The device cap counted a re-registration as a new device.** The unique index
on `(user_id, device_id)` was documented as making a second POST for the same
browser "a no-op collision instead of a new row" — but a `BEFORE INSERT`
trigger runs *before* any index is consulted. At the cap, re-registering a
browser the customer already owned raised `P0001`. `accRegisterDevice` falls
through to its POST whenever the preceding GET is merely `!ok` — an expired
token, a network blip — so a customer at their limit could be shown "remove an
old device" for a device already in the list, and might delete a real one to
obey. The trigger now returns `NULL` for a pair that exists, which is the no-op
the index was meant to produce; the index still backstops the concurrent case.

`verify_rls_contract.js` gains checks H and I. A–G all passed throughout this,
because each reads what the file *says* about tables it assumed into existence;
H reads whether the file can produce them, and I that it does so before
altering them.

## Two things the entry path used to get wrong (v5.38.0)

**A missing profiles row was a permanent hang.** `accLoadProfile` asks
PostgREST for a single object (`Accept: application/vnd.pgrst.object+json`),
and PostgREST answers **406** when the result is not exactly one row. That was
read as a failed read: `acc.profile` stayed null, the wall stayed on "Checking
your account…", and no retry could ever help because the row was never going to
appear on its own.

Whose row is missing? Anybody who signed up while the trigger that creates
`profiles` rows was absent or broken — **and that trigger is not in this
repository.** When this was written `supabase/schema.sql` did not ship the
table either. So the app's entry path depended on code this project does not
ship, and failed silently and permanently when it was missing. The file now
creates `public.profiles` itself (see above); the signup trigger stays
deliberately absent, because the 406 path below is the one that fills the row. A 406 now creates the row through
`profiles_insert_self` — a policy that had been in the schema all along,
granting exactly this insert, and used by nothing. The insert sends only the
id; the guard trigger fills in the plan, the cap and the email from
`auth.users`, so the result is the same free-tier row the signup trigger would
have made.

**A walled-out customer was told nothing was wrong.** The no-offer notice
reused `acc_unreachable`, which ends "the app still works as normal" — true
where that string was written (`#accPlanOffline`, shown when a *cached* profile
exists) and false where v5.37.0 reused it, because that branch is only reached
with the profile unread and the wall up. It now says nothing; the wall's own
"Checking your account…" is the accurate message, and saying nothing beats
saying something false in 37 languages.

## A gap between what this file claims and what CI does

`CLAUDE.md` says "the tests are the gate". On the pull-request path they are:
CI runs the full suite and nothing is merged red. **On the `main` push path they
are not.** `deploy-digitalocean.yml` triggers on `push: branches: [main]` with
no `needs:` and no `workflow_run` dependency on `test.yml`, so the deploy and
the suite run in parallel — measured on the v5.37.0 release, production
concluded success at 07:36:46Z while the Test run was still in progress.

In practice the deployed code is tested, because the PR CI was green before the
merge. But the guarantee is procedural, not enforced: a direct push to `main`
ships unverified. Gating the deploy on the suite (`on: workflow_run`) is the
fix, and it is deliberately **not** made here — it changes the production
delivery path, `test/verify_digitalocean_deploy.js` and
`verify_release_contract.js` both pin that contract, and deploy-fast-roll-back-
on-red is a defensible choice. It is the owner's call. What is not defensible
is a document claiming a gate that the path does not have, so this paragraph
exists.

## What an outage is allowed to do (v5.37.0)

A signal that a service **failed to answer** is not a verdict, and reading it as
one cost real customers real access in two places at once:

- `accRefreshOnce` answered `"dead"` for any non-2xx from the token endpoint,
  and both callers treat `"dead"` as a logout — `accSignOutLocal` deletes the
  session, the cached profile and the login stamp. Measured: 500, 503 and 429
  produced exactly the same "session expired — sign in again" as a real 400. A
  paying customer opening the app during a Supabase blip lost their session and
  the cached profile the offline path reads, on a phone that may have no way to
  type the password back in. Only 400/401 with a body naming the grant is a
  verdict now.
- `wallRecheck` early-returned on `!acc.online`, and `acc.online` is set false by
  any failed account request and true again only by a successful one. One
  dropped profile read at boot therefore latched the app on "Checking your
  account…", wall up, no tab bar — the five-minute interval, the focus handler
  and `visibilitychange` all returned at that line, so the retry that would have
  cleared it could never run. Measured: six focus cycles, one profile request,
  forever, until reload.

The Photoshop panel's gate shipped the identical bug in v6.22.0 and was fixed
the same way. Same signal, same wrong reading, two codebases — which is why both
now say it in a comment rather than only in a commit message.

## The owner's own account is the owner's own (v5.37.0)

`payreq_select_own_or_admin` and `devices_all_own_or_admin` return every row to
an admin, on purpose. The client rendered all of them into the *customer* cards:
"MY PAYMENT REQUESTS" listed a customer's row, "MY DEVICES" listed their
machines with a working Remove button, and the buy panel adopted their pending
request — so the owner saw "waiting for approval" against a stranger's reference
and could not file a payment of their own at all. Both loaders are now scoped to
the signed-in user. That filter is not a security control; RLS is. It is a scope
control, for the case where RLS is doing exactly what it should.

Three more from the same audit:

- The v5.34 amount-vs-due check was **dead on any fresh admin session**.
  `admDue()` needs `acc.settings`, and `acc.settings` was only ever loaded by
  opening the admin's own Buy accordion — so an owner reviewing payments on a
  phone saw a 10,000 underpayment rendered identically to a 37,000 payment in
  full. `admLoad()` now awaits the settings before it renders.
- `ACC_REQ_KIND` had no `join_first` entry and fell back to `pay_1m`, so a filed
  500,000 joining fee read **"1 month"** to the customer and to the owner, in
  every language. The fallback now names the unknown kind instead of quietly
  claiming to be the cheapest plan.
- `profiles.email` and `profiles.name` were writable by the owning customer
  while the approval queue printed them as *who filed this payment*, `admGrant`
  looked students up by them, and this README hands out admin rights with
  `where email = '...'`. The guard trigger now restores both on update, and a
  unique index on `lower(email)` means the database refuses a duplicate identity
  rather than letting `limit=1` pick one arbitrarily.

  On **insert** it takes the address from `auth.users` instead. The first
  version of that line blanked the column — which quietly rested on an
  assumption about the trigger that creates a profiles row on signup, and
  **that trigger lives in your Supabase project, not in this repository**. If it
  ever ran with a non-null `auth.uid()`, every new customer would have arrived
  with no email at all, breaking the approval queue and VIP grants for
  everybody. Reading the identity provider is correct whoever does the insert:
  a no-op when the trigger is right, an overwrite when the payload is forged.

## The Photoshop panel is behind the same account (v6.22.0)

Until v6.22.0 the `.ccx` was the hole in the paywall. The web app had been
behind a joining fee plus a monthly fee since v5.31.0, and anybody who found
the download got the whole panel free, forever. From v6.22.0 the panel opens on
the same login the web app uses, reads the same `profiles` row, and applies the
same rule the app's `isPremium()` applies — `plan_status = 'active'` **and** a
`plan_expires_at` still in the future, both fields, because the server extends
the date on approval but never sweeps the status back when a plan lapses.

**One account opens both products, and one payment buys the pair.** The joining
fee and the monthly fee are for the web app *and* the panel together, not one
each. No amount is written into the panel: prices live in `app_settings`, the
website quotes them, and the panel only ever says "buy or renew on the website".

Three things the gate does beyond letting people in:

- **Records the panel as a device.** It writes to the same `devices` table with
  a "Photoshop panel" label, so the owner can see which machines are running
  it. It does **not** gate on `allowed_devices`. A draft of this release did,
  on the reasoning that a panel which shrugged made one account worth unlimited
  installs — and that was wrong twice over. The web app has never failed a
  login on the cap, so the panel refusing would punish the same customer
  differently on two products bought with one payment, while the buy screen
  this wave added promises in every language that one payment covers both. And
  `allowed_devices` defaults to 2, which a studio spends on a phone and a
  desktop browser before Photoshop is even opened. Whether the panel should
  consume a paid device slot is a pricing decision for the owner to make
  deliberately, not something to bolt on inside a gate.
- **Counts the days in the header**, in gold for the last week, so a plan does
  not quietly run out mid-shoot.
- **Keeps working offline for seven days** after a confirmed check — a studio
  on location has no internet — and never one hour past the expiry date it was
  confirmed with. Two fences; whichever is reached first stops the car.

**None of that is a security boundary either.** A `.ccx` is a plain zip and the
gate is client-side JavaScript: somebody willing to open `main.js` in a text
editor can delete it, exactly as somebody can replay the web app's requests by
hand. The overlay ships *visible* and JavaScript is what takes it down, so a
thrown exception leaves the panel locked rather than open — but that is
fail-closed behaviour, not enforcement, and one residual is worth naming: the
wall hides the app with `display:none` set from JavaScript, so a failure early
enough that *no* panel script runs would leave the app in the DOM behind an
opaque cover. That panel would also have no working buttons, which is why the
trade was taken this way round rather than shipping `.app` hidden and risking a
permanently blank panel for a paying customer.

**The panel runs in Adobe UXP, not a browser**, and `test/verify_panel_gate.js`
drives Chromium. That gap ate a whole draft of this gate: it positioned the
wall with `inset:0`, hid the app with `pointer-events:none` carried on a
`#hnkGate:not(.off) ~ .app` selector — and `inset`, `:not()` and `~` appear zero
times in the panel's own 860-line stylesheet, while `pointer-events` is named as
unsupported both in that stylesheet's header and again in `main.js`. Every
assertion passed, because Chromium supports all of it. Check A4 now derives the allowed property set from
`styles.css` itself, so the browser is no longer the authority on what the
renderer accepts. What it buys is real and
limited: the honest majority is asked to pay, the owner sees who is running the
panel, and a lapsed plan stops working by itself instead of needing a
re-download.

`test/verify_panel_gate.js` unzips the shipped artifact and drives the real
`index.html` in a browser behind a UXP shim, so the assertions are about what
the wall does, not about which words appear in the file.

## Right-to-left, and sharing a language (v5.35.0)

Urdu has been in the picker since v4.41 and neither surface ever set `dir`, so
it rendered left to right for thirteen releases. Both now set it from a single
list of RTL languages — `ur` is the only one shipped, the rest are named so the
rule is already right the day one of them is added.

Fixing it immediately exposed a second bug: under `dir="rtl"` the landing page
scrolled sideways. `.sec-head::before`, a decorative glow, hangs 24px past the
inline start of every section heading; in LTR that is the left edge and
browsers do not count overflow past it, but flipped it became the trailing edge
and each section widened the document. `inset-inline-start` fixed it, and
`test/sweep_v535_rtl_lang.js` measures the page width rather than trusting the
rule.

`?lang=xx` opens the landing in that language, so a studio can send a Thai
client a link that arrives in Thai. The parameter wins over the stored
preference **for that visit and no longer** — see the v5.39.0/v5.40.0 notes
below for what "a link is not a preference" cost and how the journey was put
back together. A **pick** writes the URL back and the default language leaves
it clean; a **link's** parameter is left exactly as it arrived, because since
v5.39.0 nothing is stored and the parameter is the only carrier.

**No hreflang tags accompany it, deliberately.** hreflang tells a crawler that
separate documents exist per language and they do not — every `?lang=` URL
serves byte-identical HTML and the language is applied by script afterwards.
Claiming 37 alternates would be a false statement about the site's structure,
and reads as duplication rather than translation. An assertion holds that line
until the site serves real per-language documents.

`test/sweep_xss.js` drives hostile text through every field a server controls —
a display name, an admin note, payment instructions, a device label, the QR URL
— and checks nothing executes AND that the text still renders escaped rather
than being silently dropped. The app was already safe; nothing was testing that
it stayed safe, which matters more now that the admin queue renders a
customer's name to the one account that can approve payments.

## Prices, payments and VIP grants (v5.34.0)

**No price is written anywhere in this repository, and that is deliberate.**
The buy screen quotes whatever `app_settings` holds, so the owner changes what
things cost from the Supabase dashboard without a release. `test/sweep_v534_payments.js`
feeds invented prices through a fixture and checks the UI quotes *those* — an
assertion naming a real price would pin a business decision into the code, the
same mistake `verify_release_contract` made with "One-Tap 131".

```sql
update public.app_settings set
  price_join_first   = 500000,   -- the one-time first purchase
  join_first_months  = 1,        -- what that purchase opens
  price_1m           = 30000,    -- the default monthly rate
  price_3m           = 85000,
  price_6m           = 160000,
  price_extra_device = 15000,
  payment_phone      = '09688200680',
  payment_qr_url     = 'https://<project>.supabase.co/storage/v1/object/public/<bucket>/kbzpay-qr.jpg';
```

`price_join_first` is optional and behaves as you would hope when it is not
set: **no joining fee configured means no joining fee**, and new customers see
the ordinary monthly plans exactly as they did before the feature existed. Zero
means the same thing. That is deliberate — it is a new column, and a project
that upgrades and sets `price_1m` but forgets this one would otherwise show
every new customer an unpriced "First purchase" chip with the plans hidden
behind it, unable to buy anything at all.

**The KBZPay QR is a URL, not a committed file.** It encodes a live bank
account and this repository is public, so upload the image to a Supabase
storage bucket and paste its URL above. Changing bank details is then a
dashboard edit, not a release — and nothing about the account is left in git
history, which cannot be revoked.

**A different rate for one customer** — this is how a training-course student
pays less than a studio, with no second price list and no code change:

```sql
update public.profiles set price_1m_override = 10000 where email = 'student@example.com';
```

**A free period for a VIP student** is *filed*, not silently written. The admin
card has a form for it: type the email, pick the period, and it lands in the
approval queue as a grant with no money attached, which you then approve like
any payment. Two things follow. The same trigger extends the plan, so a grant
and a purchase can never drift apart; and "why does this account have Premium?"
has an answer in the same list as every payment, instead of being an edit
nobody recorded. Grant `join_first` for a student who has never joined — that
both opens the period and clears the joining fee, which is what "first one
free" means.

**What the admin sees on each request**, and none of it was there before:
the customer's name and email rather than a UUID, the amount they say they
sent, and the amount that was actually due for *that* customer — flagged in red
when the two differ. The amount is a claim, not a fact: nothing in the database
compares it to a price or acts on it. It exists so a 10,000 filed against a
50,000 plan is visible before approval rather than argued about after it. A
customer who underpaid can still file, deliberately — otherwise the mistake
never reaches the person who can resolve it and the money is simply gone.

Approval remains the only thing that grants access. This wave adds a second way
to *file* a request and no second way to *approve* one.

### One small thing still open: Tai Le and Tai Lue

The ten payment strings this wave added were translated into fifteen languages,
and Khamti was produced by replaying the Shan→Khamti character map derived from
the 228 pairs already in the file (it reproduces every one of the 171
comparable shipped Khamti strings exactly).

**Tai Le (`tdd`) and Tai Lue (`khb`) are not done**, and were deliberately not
faked. There is no mechanical route from Shan to either — only 6 of the 14
words needed appear anywhere in those packs — so the twenty missing entries are
listed by name in `test/sweep_v477_upgrades.js` under `PENDING`, and a second
assertion proves the app degrades correctly for exactly them: `LANG_FB` sends
both languages to Shan, so a customer sees real Shan rather than a raw key or a
blank label. Anything else missing from any pack still fails, and a registry
entry that is no longer missing fails too, so the list cannot rot.

To close it: a Tai Le / Tai Lue reader translates ten short strings, they go in
the packs, and the `PENDING` block is deleted.

## Password reset, and the one setting it needs

Web v5.33.0 moved the reset page onto this origin, at `/reset/`. Before that
`ACC_RESET_URL` pointed at a third-party preview deployment, which meant the
recovery token Supabase mails — and a recovery token is, while it lives, the
account — was delivered to a host outside the product.

**Owner step, once:** add

```
https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/reset/
```

under Supabase -> Authentication -> URL Configuration -> Redirect URLs. GoTrue
silently falls back to the project Site URL for any `redirect_to` that is not
allow-listed, so a missing entry raises no error: it just quietly sends people
somewhere else. `test/sweep_v533_reset.js` proves the app asks for that URL and
that the page handles the token responsibly, but no test here can prove the
dashboard has it.

## A password you can look at (v5.41.0)

The three API-key fields have carried a Show/Hide reveal since v4.41. The three
**account password** fields — sign-in, sign-up, and change-password — had none,
and neither did `/reset/`. A password typed on a phone, in a script whose
keyboard offers no preview, with no way to see what you typed, is how people
lock themselves out of an account they have just created.

Same helper (`wireKeyReveal`), same button, same word: `btn_show` already ships,
so this adds no new mechanism and no 38th translation. The reveal flips
`input.type` and keeps `aria-pressed` in step with it, which is what makes the
gold border and the screen-reader state agree rather than drift. `sweep_account`
check 20 asserts the behaviour — the type really flips, `aria-pressed` really
follows, the control clears 44px on the form actually on screen — not the markup.

Two things this turned up in the checks themselves. `sweep_v533_reset` J matched
reused strings across a fixed list of nine languages, so a source key that
legitimately ships two (`btn_show` is `{my, en}`, English for the rest, on both
surfaces) failed as "missing" in seven. It compares the languages **either side
carries** now, which is the stricter comparison: a language present on one side
and absent on the other is a mismatch, which the fixed list could not see. And
its parser only accepted double-quoted values, so a single-quoted source entry —
which `btn_show` is — parsed to an empty object and blamed the reset page for a
drift that was really a blind spot here.

## What v5.39.0 broke, and how it was caught (v5.40.0)

Two of v5.39.0's own fixes shipped regressions. Both were found by an
adversarial review of the merged diff, not by the suite — the suite was green
on all 95 scripts, twice, with both defects in it.

**The wall's copy could not follow the language.** v5.39.0 memoised it so a
polite live region would stop re-announcing identical text every five minutes,
and the memo key carried the wall state, connectivity and whether the plan had
lapsed — but not the language. Switch language without reloading and the
heading and pay instructions stayed in the old one while the contact links
beside them changed: half the wall in each language, on the conversion screen.

How reachable it actually was, stated honestly because the first draft of this
section got it wrong: the app's language picker ends in `location.reload()` and
`applyLang()` has exactly one call site, so **no customer could reach it
through the UI as it ships**. It was latent. `LANG` is in the key now and
`a11yApplyLang()` clears the memo, because a memo that cannot see the language
is wrong on its face and would become live the day a no-reload switch lands —
and because the repaint call added with it was throwing a swallowed TypeError
on every page load (`acc` is not initialised until 15,500 lines after
`applyLang()` runs). `sweep_v530` W5 is the guard.

**Wrapping the role label removed the only bound on it.** Replacing
`nowrap`+`ellipsis` with `white-space:normal` stopped the label being cut in
half — and, with no height cap, made `scrollHeight > clientHeight` unable to
fire, so `sweep_v467` C2 became a tautology for the second time in two
releases. A long enough label also grew the pill taller than its 88px tile and
hung it off the top edge. `max-height:calc(100% - 8px)` restores both
properties at once: the pill is bounded by its tile, and a label that outgrows
it is detectable. Measured: a 70-character label now reports
`scrollHeight 87 > clientHeight 76` and stays inside the tile.

**And the pill fix needed a second pass.** The review that found the two
regressions above also measured three things wrong with the cap that replaced
them, all confirmed here: deleting the `max-height` line left `sweep_v467` C2
green (every shipped label fits, so only a hypothetical long one would have
tripped it — the rule itself was unasserted); C2 measured Burmese only, so the
English badge this release edited, the one all 35 non-Burmese locales fall back
to, sat outside its own check; and because `.chip` is a centred flex box, the
cap cut the *opening* words off the top rather than the tail — the half
v5.39.0's own note said an ellipsis must not remove. C2 now asserts the cap
directly (a deliberate over-long probe must register as overflow), loops
Burmese and English, and the rule carries `align-items:flex-start`.

The same measurement pass turned up something older: the pill sat on the
`IMG 1`/`IMG 2` badge — the only thing naming the ordered slot a multi-reference
ROLE MAP binds against — and covered it completely for both Burmese labels at
every phone width. It stacks above the badge now.

Two more from the same review:

- The retry button was armed on state alone, but `wallRecheck` returns
  immediately when `navigator.onLine` is false. On a disconnected phone the
  only control on the screen was gold, enabled, and completely inert — measured
  zero requests and zero visible change on tap. The first fix only covered a
  page that was *already* offline when the wall last painted: the four-second
  arming timer did not re-test connectivity when it fired, and the window
  `offline` event never repainted, so a customer whose data dropped inside that
  window still got the dead button. Both are closed now, and `sweep_v530` W6
  drives a real `context.setOffline` transition rather than a stubbed flag. The
  offline copy also stopped borrowing `acc_offline` ("showing your last known
  status") for the one state defined by having no known status.
- **The share died at the door.** Removing the write was right — merely opening
  the site should not reset the language of the paid app — but the app read the
  language *only* from that key, so `/?lang=th` rendered a fully Thai landing
  whose own gold button opened the Web Studio in Burmese. Measured across three
  builds: it worked in v5.38.0, and has been broken since v5.39.0, for 36 of the
  37 locales. The language rides the outbound `app/` links now and the app
  applies it for that visit without storing it, so a link stays a link on both
  surfaces. `sweep_v535` H5/H6, negative-controlled by reverting both halves.
- Forcing a recheck from the `online` event cost a second, concurrent profile
  read: the handler already called `accLoadProfile()` four lines later and
  there is no in-flight dedupe. Measured two identical GETs per reconnect, and
  for a customer whose `profiles` row does not exist yet, two concurrent
  INSERTs where v5.38.0's self-heal expects one. Clearing the recheck throttle
  does the same job with one read. `sweep_v530` W7 counts them.
- v5.39.0 marked only the `?lang=` branch transient, so the landing's automatic
  startup call still counted as an explicit choice. A customer using the app in
  Gujarati who tapped the app's own "visit the site" link had `hnk_ws_lang`
  rewritten to the landing's default on arrival — the same harm the release set
  out to fix, on the highest-traffic path. Opening a page is not a choice now;
  only a press of the picker is. And a shared `/?lang=my` link keeps its
  parameter, which became its only carrier once nothing was being stored.

## Five tests that had stopped testing anything (v5.39.0)

The v5.30 access wall changed what an unauthenticated page load looks like:
the tab bar is `display:none`, every page but Home is hidden, and `switchPage`
rewrites every target to `pgHome`. Sweeps written before that kept passing, and
what they were passing on had quietly become nothing:

| file | what it thought it measured | what it actually measured |
|---|---|---|
| `verify_tabbar_reachable.js` | 5 tabs fit a 390px phone | a 0×0 bar, so `scrollWidth > clientWidth` was `0 > 0` |
| `verify_tabbar_reachable.js` | the gear opens Setup | `pgHome` was already the active page before the click |
| `verify_phase2_design_tokens.js` | radii on five pages | `pgHome`, five times — and a missing element scored a pass |
| `sweep_v467_upgrades.js` | a role label fits its tile | 0×0 rectangles, so "fits" and "clipped" were constants |
| `sweep_v529_providerhint.js` | a locked row navigates to Setup | it was on `pgHome` already; deleting the tap handler still passed |
| `sweep_v428_upgrades.js` | two sections, on `pgSetup` / `pgWorkflows` | neither id has existed since v4.27 — no page was displayed at all |

Each now seeds `test/_seed_premium.js`, starts somewhere the action has to move
it away from, and carries a guard that turns "not rendered" back into a
failure rather than a pass. Two of them found real defects the moment they
could see: `verify_phase2` reported `pgStudio -> pgMeitu` (an id retired by the
Meitu/Evoto split), and `sweep_v467` reported the reference-role label clipped
at every phone width in both languages — `လူ (identity ထိန်း)` needs 101px in a
76px pill, so it had been rendering as `လူ (identity ထိ…` on every phone since
v4.67. The pill wraps to two lines now, and the check covers height as well as
width.

Two other guards were narrowed the same way and widened back:
`verify_rls_contract.js` required a `to <role>` clause that Postgres makes
optional — a policy in the most ordinary form, `create policy p on
public.app_settings for update using (true)`, did not match the parser at all,
so the one shape that would re-open the bank-account row was the one shape the
guard could not see. And `sweep_v461_upgrades.js` now fails any language pack
that carries Myanmar script in a language not written in it, which is how the
Gujarati pack shipped the Burmese counter word `ခု` and rendered Burmese at
seven counters for every `gu` customer.

## The walled door had a handle missing (v5.39.0)

Every outbound human route in the web app — the privacy policy, the terms,
Facebook, Telegram, TikTok and both phone numbers — lives in one card,
`#cardAbout`. The access wall hides every card on Home except the Account card,
in all three of its states. So a studio that had already transferred by KBZPay,
uploaded the slip and was waiting on an admin saw a payment demand above a shut
door, with the studio's own Telegram and phone numbers rendered `display:none`
on the same page, and no way to open the terms it had just agreed to. Nothing in
the app linked back to the landing site where the contact row lives.

The wall note now carries those routes itself. It does not repeat them: it
**clones** the anchors out of the About card at render time, so a changed phone
number still has exactly one place to change, and the check in
`sweep_v533_legal.js` that pins the contact routes identical across both legal
pages, the landing footer and the app keeps working against one source rather
than two that can drift. `sweep_v530_accesswall.js` W and W2 assert this in
every wall state, and W2 is what would catch a second copy being introduced.

The `checking` state got the other half. It was a heading with an empty
paragraph under it and no control at all — a recoverable state that said so
nowhere. It now says so, and arms a Retry after four seconds (immediately would
mean a button that flashes on every healthy boot, which teaches people to
ignore it). W4 drives the whole path: first profile read never settles, wait
past the delay, tap, wall down, no reload.

## Two pages that were quietly resetting your language (v5.39.0)

`docs/privacy/` and `docs/terms/` show two languages, Burmese and English. They
also wrote the language they were showing into `hnk_ws_lang` — the key the web
app reads for **all 37** of its locales. Opening the privacy policy from the
About panel therefore reset the whole paid app to English on its next launch,
and an Urdu customer lost right-to-left with it. Nothing looked wrong at the
time, which is what made it hard to report.

The shared key is now read-only on those pages: it still decides which of the
two texts opens, which was the wanted behaviour, and an explicit tap on the
toggle is remembered under the pages' own `hnk_legal_lang`.

The landing page had the same bug wearing different clothes. `?lang=` exists so
a studio can send a Thai client a link that arrives in Thai, and the comment
beside it has always promised the parameter wins "for this visit" while "the
stored value still decides on a bare visit afterwards". It did not: `apply()`
persisted on every call, so following a shared link silently rewrote both the
site language and the app's. `apply(l, transient)` is that comment implemented.

## Privacy and terms

`docs/privacy/` and `docs/terms/` are real pages, in Burmese and English, on
this origin. Both are emitted from one shell by `test/_gen_legal_pages.py` —
edit that and re-run it rather than editing the two HTML files, which would
drift. `test/sweep_v533_legal.js` checks the shell is still identical in both
AND that the policy's factual claims still match the code: no analytics, no
photo ever uploaded to our servers, a random device id rather than a
fingerprint, keys and results kept in the browser. Add an analytics snippet or
an image upload and that sweep goes red, because the policy would have become
a false statement made to paying customers.

## DigitalOcean App Platform

- Repository: `hlaingkhay28047-svg/TG`
- Staging branch: `upgrade-safe-wave`
- Production branch: `main`
- Static source directory: `/docs`
- Index document: `index.html`
- Region: Singapore (`sgp`)
- Staging app: `hnk-ai-tools-2`
- Staging host: `hnk-ai-tools-2-gibhz.ondigitalocean.app`
- Production app: `hnk-ai-tools-3`
- Production host: `hnk-ai-tools-3-s4nnu.ondigitalocean.app`

Configuration files:

- `.do/staging.app.yaml` — `hnk-ai-tools-2` follows `upgrade-safe-wave` with `deploy_on_push: true`.
- `.do/app.yaml` — production follows `main` with `deploy_on_push: true`.
- `.github/workflows/deploy-digitalocean-staging.yml` — staging push workflow, manual API recovery, and live version + exact landing/app-content verification.
- `.github/workflows/deploy-digitalocean.yml` — production push workflow, manual API recovery, and live version + exact landing/app-content verification.
- `.github/workflows/verify-digitalocean-deploy.yml` — regression guard for both deployment lanes.

### One-time DigitalOcean source binding

For truly automatic deployments without storing a DigitalOcean API token in GitHub, each existing DigitalOcean app must be connected to the authenticated GitHub source once. **This migration is complete for both lanes as of 2026-08-17** — staging `hnk-ai-tools-2` and production `hnk-ai-tools-3` both follow their branches automatically.

Staging `hnk-ai-tools-2`:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: upgrade-safe-wave
  deploy_on_push: true
```

Production `hnk-ai-tools-3`:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: main
  deploy_on_push: true
```

The public one-click template intentionally uses a direct public-git source, so an app created from it does not auto-deploy later commits. Any such app must either be manually deployed from DigitalOcean after each approved branch update, or migrated once to authenticated GitHub (via the dashboard App Spec editor, replacing the `git:` block with the `github:` block above) the way both live lanes already were.

With the binding in place, normal pushes deploy directly from DigitalOcean. Each deploy workflow uses one shared 33-minute deadline across optional manual recovery and live verification, then verifies `/app/version.json` plus the SHA-256 of both live landing and app HTML against the checked-out commit. API force-rebuild is manual-only (`workflow_dispatch` with `force_rebuild: true`) so normal auto-deploys are never duplicated. Manual staging recovery requires `DIGITALOCEAN_STAGING_ACCESS_TOKEN`; manual production recovery requires the separate `DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN`. Before mutation, the workflow verifies the actual DigitalOcean app uses the expected repository and lane branch.

No DigitalOcean access token is stored in repository files or logs.
