# MajiSmart Zambia — Production Deployment Plan

**Status:** recommendation for deploying the web dashboard + shared API + Supabase schema.
**Last updated:** 30 October 2026
**Scope:** web (`WEB/`), shared API (`BACKEND/`), database (`supabase/`), Android app (`APP/`), ESP32 firmware (`FIRMWARE/`).

---

## 0. TL;DR — recommended stack

| Layer | Recommendation | Why | Cost to start |
|---|---|---|---|
| **Web dashboard hosting** | **Cloudflare Pages** (`WEB`, Vite → `dist`) | Free tier allows commercial use, **unmetered bandwidth**, free WAF/DDoS, `_headers` + `_redirects` already work here. Vercel Hobby is **non-commercial only**. | $0 |
| **Shared API hosting** | **Fly.io — Frankfurt (`fra`)** *or* **Render Starter — Frankfurt** | The API must be a **long-running process** (15 s device monitor + persistent SSE). Region must match the database region, not the user region — see §3. | ~$3–7/mo |
| **Database** | **Supabase Postgres**, project region **`eu-central-1` (Frankfurt)** | Closest available region to Zambia (Supabase has **no** African region). Use the **Supavisor pooler** for the API. | $0 → $25/mo |
| **Realtime** | Keep **SSE** on a single API instance; move to **Supabase Realtime** before scaling out | Today's SSE hub is in-process; it cannot fan out across instances. | $0 |
| **File/photo storage** | **Cloudflare R2** (or Supabase Storage) | Report photos are currently smuggled through a 10 MB JSON body into the DB. | $0–2/mo |
| **Auth** | Migrate to **Supabase Auth** (email + Google) | Current auth is `sha256(password + static salt)` — not production-safe; Android Google sign-in is currently client-side only. | $0 |
| **DNS / TLS / CDN / WAF** | **Cloudflare** (registrar + DNS, proxy the API) | Free, one control plane for domain + dashboard + API edge rules. | $0 |
| **CI/CD** | **GitHub Actions** (`.github/workflows/ci.yml` added) + host autodeploy | Tests already exist; migrations need a reviewed pipeline. | $0 |
| **Observability** | **Sentry** (API + web) + **Better Stack/UptimeRobot** on `/api/health` + Supabase logs | You currently have no error visibility in production. | $0–26/mo |
| **Email (password resets, report updates)** | **Resend** or Supabase Auth SMTP | Free tiers cover pilot volume. | $0–20/mo |
| **Android distribution** | **Google Play internal testing** → closed → production | $25 one-time; needs a signed AAB + OAuth SHA-1 fingerprints. | $25 once |
| **ESP32 fleet** | Per-device keys, HTTPS with a pinned CA, telemetry retry buffer | Currently a single global `IOT_API_KEY`. | $0 |

Everything below explains the trade-offs, then gives a runbook you can follow top to bottom.

---

## 1. What the repo actually requires from a host

These four facts rule out "just put it on Vercel/Cloudflare Workers" and are the reason for the split above:

1. **Background work inside the process.** `DeviceMonitorService` runs `setInterval` every 15 s and writes `OFFLINE` alerts (`BACKEND/src/services/deviceMonitorService.js`). Serverless functions do not keep timers alive between requests.
2. **Long-lived responses.** `/api/realtime/stream` holds an SSE connection open indefinitely (`BACKEND/src/services/realtimeService.js`). Vercel Functions cap execution (60 s Hobby / 300 s Pro), Cloudflare Workers/Pages need a rewrite to the Workers runtime (Express does not run there).
3. **In-memory state.** `realtime.clients` is a `Set` in process memory, and `/api/health` reports `sse_clients`. This works only with **one instance**. Scaling to 2+ instances silently loses ~half the live updates until a pub/sub layer exists.
4. **A TCP Postgres connection pool.** `pg` pools connections; PostgREST/edge runtimes prefer HTTP. Pool size must be small (`DB_POOL_MAX=5`) when using the Supavisor pooler.

> Conclusion: **static frontend on a CDN** + **one always-on small container for the API** + **managed Postgres**. Exactly the stack in §0.

---

## 2. Frontend: Cloudflare Pages vs Vercel

Your web app is a plain Vite + React SPA with `localStorage` JWT auth, Leaflet, and Chart.js. There is **no SSR, ISR, image optimisation, or Next.js** in play, so Vercel's differentiating features add nothing here.

| | **Cloudflare Pages** | **Vercel Hobby** |
|---|---|---|
| Commercial use on free tier | ✅ Allowed | ❌ **Non-commercial only** (water utility/paid pilot ⇒ Pro $20/seat) |
| Bandwidth | **Unmetered** | 100 GB/mo, then paused |
| Builds | 500/mo, 1 concurrent | 6,000 min/mo, 1 concurrent |
| SPA routing | `WEB/public/_redirects` — already in repo | also fine |
| Security headers | `WEB/public/_headers` — **added in this change** | `vercel.json` |
| Preview deploys | ✅ per branch/PR | ✅ per branch/PR |
| Africa edge | Cloudflare's regional edge (JNB/CPT/NBO) | Vercel `jnb1` region available |
| Cost at pilot scale | $0 | $20/mo (to be legal) |

**Recommendation: Cloudflare Pages.**
Verdict is driven by two things only: Cloudflare's free tier permits commercial use, and its bandwidth is unmetered — useful when a lot of Zambian traffic is on metered mobile data and you want room to add a public community portal later.

If your team is already deep in the Vercel ecosystem and $20/seat is acceptable, Vercel works fine too — but then you must not ship on Hobby.

### Cloudflare Pages project settings

| Setting | Value |
|---|---|
| Git repository | this repo |
| Production branch | `main` |
| Framework preset | Vite (or None) |
| **Root directory** | `WEB` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Node version | `24` (env var `NODE_VERSION=24`) |
| Env var | `VITE_API_BASE_URL=https://api.majismart.zm/api` |

`VITE_API_BASE_URL` is **baked in at build time** — changing it requires a rebuild. Use the absolute API origin (`https://api.…/api`), not `/api`, because the SPA and the API are on different hosts.

**Build size note:** the current bundle is a single 619 kB JS chunk (192 kB gzipped) because Chart.js, Leaflet, and every page load eagerly. For Zambian mobile data, split routes with `React.lazy` / `manualChunks` — target < 200 kB initial. Cheap win, do it before launch.

---

## 3. API hosting: which platform, and which region

### Region choice matters more than the platform

Round-trip times from Lusaka (approx.): **Johannesburg ~30–50 ms**, **Frankfurt ~150–180 ms**. It is tempting to put the API in `jnb` to be "close to users". Don't — a request touches the database several times, and database round trips multiply.

| API location | User → API | API → DB (per query) | 4 queries in one request (server time) | Total perceived |
|---|---|---|---|---|
| Johannesburg (`jnb`) | ~40 ms | ~160 ms | ~640 ms | **~680 ms** |
| **Frankfurt (`fra`)** | ~160 ms | ~2 ms | ~8 ms | **~170 ms** |
| Frankfurt, if queries batched to 1 | ~160 ms | ~2 ms | ~2 ms | **~162 ms** |

Co-locating the API with Postgres is **~4× faster** for real request shapes. Static assets don't care (Cloudflare edge serves them), and SSE doesn't care (push latency after ingestion). So: **API and database in the same region — Frankfurt — and one TLS handshake/round trip from Lusaka is the floor.**

If you later need to cut that 160 ms, the move is not "API in Johannesburg"; it's "database in Africa" (self-hosted Postgres on Fly `jnb`/`cpt`, or AWS `af-south-1`), which is a much bigger operational jump.

### Platform comparison

| Option | Verdict |
|---|---|
| **Fly.io `fra`** (`fly.toml` added) | ✅ **Recommended.** ~$2–4/mo for `shared-cpu-1x`/512 MB, real `SIGTERM`, machine never sleeps (`auto_stop_machines = "off"`), Docker-based so the runtime is reproducible, easy `jnb` later. Requires a card and comfort with a CLI. |
| **Render Starter `frankfurt`** (`render.yaml` updated) | ✅ **Recommended if you prefer a dashboard over a CLI.** $7/mo, no spin-down, health checks, autodeploy, blueprint already in repo. Slightly slower cold restarts on deploys; supports SSE fine on paid plans. |
| Railway | Good DX, ~$5/mo, but weaker free margin and fewer African/EU region guarantees. Fine alternative. |
| Render **Free** | ❌ Sleeps after 15 min ⇒ SSE dies, monitor pauses, 30–60 s cold starts. Also no long-lived connections on free. Not for production, not even for a demo you present live. |
| Vercel Functions / Netlify Functions | ❌ No background timer, request timeouts kill SSE. |
| Cloudflare Workers / Containers | ❌ Workers: Express won't run without a rewrite, no `pg` TCP pool without Hyperdrive, timers killed. Containers: viable but overkill today. |
| A VPS (Hetzner/DigitalOcean, ~$5) | Works, but you inherit OS patching, TLS, and uptime. Only pick this if you want the ops experience. |

> **Single instance until you add pub/sub.** If you need HA, add Redis (Upstash) broadcasting to every instance, or replace SSE with Supabase Realtime channels (best long-term — no extra infra, works multi-instance).

### Why not one container serving both web and API?

The root `Dockerfile` does that (API serves `WEB/dist`). It's convenient but: no CDN, no edge cache, API restarts blank the dashboard, and every deploy needs a container rebuild. Keep it only as an emergency fallback.

---

## 4. Supabase: project, connection, migrations, schema

### 4.1 Project setup

1. Create project, **region `eu-central-1` (Frankfurt)** — closest supported to Zambia. Test `eu-west-2` (London) only if your ISP route proves better; don't guess, measure from Lusaka.
2. Copy the **pooler** connection string from *Project Settings → Database → Connection string → Transaction pooler*:
   `postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
3. **Use the pooler, not the direct host.** Direct connections are IPv6-only on new projects and Render/Fly have no IPv6 egress. The pooler is IPv4 and is what your small pool should talk to. (Direct `5432` is for migrations/psql from a machine that has IPv6.)
4. Set `DATABASE_URL` in the API host to the pooler string, add `?sslmode=require`, and keep `DB_POOL_MAX` at 5 — every instance and every `pg` client consumes pooler slots.
5. Public keys: `SUPABASE_URL` + `SUPABASE_ANON_KEY` go to clients. **`SUPABASE_SERVICE_ROLE_KEY` must never leave the server** — it bypasses RLS.

### 4.2 Migrations must not run at boot

Previously `initDatabase()` executed the whole migration file on startup whenever tables were missing. In production that means DDL from an app process, racing when two instances boot, and a crash if the file isn't in the image (the old Dockerfile didn't copy `supabase/`).

Changed in this PR:
- `AUTO_MIGRATE=false` (the new production default) skips boot-time DDL and logs a clear instruction instead.
- A missing migration file now raises an explicit error rather than an opaque `ENOENT`.
- The Docker images copy `supabase/migrations` so `AUTO_MIGRATE=true` still works when you want it (single-instance environments only).

Apply schema changes with the CLI from CI (job included in `.github/workflows/ci.yml`):

```bash
supabase link --project-ref <project-ref>
supabase db push --include-all
```

**Seeding is separate from migrating.** `seedPostgresData()` still runs on every boot: on an empty database it inserts the admin/customer demo accounts, sample Lusaka stations, tanks, and `ESP32_001` with `IOT_API_KEY`. That is convenient for a pilot and wrong for a live utility (demo rows in production). Either keep it and accept the demo data, or gate it behind `SEED_ON_BOOT=true` and load real reference data with a reviewed `supabase/seed.sql`.

**Single source of truth:** `supabase/migrations/` is what the CLI applies and what the API reads. `BACKEND/database/migrations/001_initial_schema.sql` is a **divergent copy** — delete it (or mark it read-only) and update `ARCHITECTURE.md`, otherwise the two will drift and nobody will know which one is real.

### 4.3 RLS is currently decorative — decide the access model

`supabase/migrations/…_initial_schema.sql` enables RLS with `auth.uid()` policies, but the API connects as the **`postgres` superuser via `pg`**, which bypasses RLS entirely. Meanwhile `profiles.id` is `TEXT` and unrelated to `auth.users.id`, so `auth.uid()` can never match today. You have two coherent options:

| Option | What it means | When |
|---|---|---|
| **A — API-only access (fastest)** | The API is the only DB client. Enforce authorization in Express middleware. Either drop the RLS policies or keep them as documentation; revoke `anon`/`authenticated` grants on all tables so PostgREST cannot read them. Add a dedicated non-superuser role for the API. | Ship now |
| **B — Supabase-native (recommended target)** | Move identity to Supabase Auth, add `profiles.auth_user_id uuid references auth.users(id)`, rewrite policies against `auth.uid()`, and let the Android app/Web talk to Supabase directly for reads + Realtime. | Before you scale past one API instance or add more clients |

Either way, **today's biggest gap is that RLS gives a false sense of security.** Pick one and document it. (Option A has a trap: keeping the policies while connecting as `postgres` means any future change that uses the anon key inherits permissive access.)

Also: `system_settings` has RLS enabled with **no policies** — invisible to anon/authenticated, which is fine, but note it so nobody "fixes" it by disabling RLS.

### 4.4 Realtime

- **Phase 1 (now):** keep SSE. Single API instance, in-process hub, heartbeat added (`SSE_HEARTBEAT_MS`, default 25 s) so Cloudflare/Fly proxies don't drop the stream every minute.
- **Phase 2:** Supabase Realtime channels (`broadcast` or `postgres_changes`). Removes the single-instance constraint, removes the SSE reconnect storm, and the Android app gets live data without a custom client. Requires Option B auth/RLS if you use `postgres_changes` with the anon key.

### 4.5 Backups

- Free tier: no PITR. Add a nightly `pg_dump` GitHub Action to R2 with 30-day retention **before** real users arrive.
- Pro ($25/mo): daily backups + 7-day PITR, no project pausing, more compute. This is the first upgrade to buy once a utility is a real customer.

---

## 5. Everything else

### 5.1 Storage (report photos)

`POST /api/reports` accepts a JSON body up to 10 MB and stores `image_url` only. Base64 photos in a JSON column will bloat the DB, slow every query, and break the pooler's patience. Do this instead:

1. Client requests a presigned upload URL from the API.
2. Client PUTs the photo to **R2** (`reports/<station>/<uuid>.jpg`).
3. Client submits the report with the object key; API validates and stores the key.
4. Serve via signed URLs (or a public bucket for non-sensitive photos).

R2: 10 GB storage + Class A/B ops free, **zero egress fees** — the cheapest option for image-heavy dashboards on metered links. Supabase Storage is the alternative if you want one vendor and one bill.

### 5.2 Auth — replace the custom scheme

Current: `sha256(password + "_majismart_salt")` (`BACKEND/src/database/db.js`). A single static salt means identical passwords hash identically and a leaked DB is crackable with a GPU and rainbow tables. JWT lives 7 days in `localStorage`.

Recommended path:
1. Enable **Supabase Auth** (email+password, Google OAuth). Add `auth_user_id` to `profiles`, keep `role` there, and mirror it into a custom JWT claim via an Auth Hook.
2. API verifies Supabase JWTs against the project JWKS (`jose`), then reads role from the claim — no shared `JWT_SECRET` between web, Android, and API.
3. Android: `GoogleSignIn` → `idToken` → `supabase.auth.signInWithIdToken({ provider: 'google' })`. Today `GoogleAuthManager` fakes this with `defaultDemoProfile` and the API has **no** `/api/auth/google` endpoint, so app identity is decorative. Also register your release keystore **SHA-1** in the Google Cloud OAuth client — without it sign-in fails on Play-signed builds.
4. Web: keep session in memory + refresh token rotation (supabase-js default), or move the token to an `HttpOnly; Secure; SameSite=Lax` cookie issued by the API. If you keep `localStorage`, ship a strict CSP (template in `WEB/public/_headers`).

Interim (if Auth migration must wait): bcrypt/argon2id with per-user salt, 15 min access token + refresh token, `Authorization` header only. Do not go live with the current hashing.

### 5.3 API hardening before public exposure

| Item | Status / action |
|---|---|
| `trust proxy` | ✅ added (client IPs correct behind Fly/CF/Render) |
| Graceful `SIGTERM` shutdown | ✅ added (SSE closed, pool drained, 15 s force-exit) |
| SSE heartbeat | ✅ added (25 s keepalive) |
| SSE `Access-Control-Allow-Origin: *` | ✅ fixed — stream is now origin-restricted and returns 403 otherwise |
| Idle pooler disconnect crash | ✅ guarded with a `pool.on('error')` handler |
| Rate limiting | ❌ add `express-rate-limit` (login, report creation, IoT ingest) + Cloudflare rate-limit rules on `/api/auth/login` and `/api/reports` |
| `helmet` / security headers | ❌ add on the API |
| Body size | ⚠️ `express.json({ limit: '10mb' })` — drop to 256 kB once photos go to R2 |
| Pagination | ⚠️ `/api/reports` and `/api/alerts` have **no `LIMIT`** — add `?limit&offset` (default 50) before data grows |
| IoT replay protection | ❌ per-device keys + HMAC(`device_id|timestamp|nonce`) and a timestamp window; today one global `IOT_API_KEY` |
| Timezone bug | ✅ fixed `Africa/Maputo` → `Africa/Lusaka` in the weather call |
| Tests | `npm test` needs `JWT_SECRET`/`IOT_API_KEY` and the **default** seed passwords; CI sets them. Don't export custom `SEED_*_PASSWORD` when running tests locally, or reset `BACKEND/data/majismart.db`. |

### 5.4 Domain, DNS, email

- **Domain:** `.zm` must be registered through a ZICTA-accredited registrar (e.g. Zamnet/iWay/Q-Net) with company documents — allow days. Launch path: register `majismart.zm` (or `.co.zm`) and start on a `.com`/`.app` you can buy in 5 minutes; point the `.zm` at the same Cloudflare Pages project when it clears.
- **DNS:** move the domain to Cloudflare (free), proxy `api.` through Cloudflare with **Proxy status ON** for WAF/DDoS/rate limiting. Keep SSE working: caching bypassed for `/api/*`, no buffering (the API now sends `X-Accel-Buffering: no`).
- **TLS:** automatic on Cloudflare, Fly, Render.
- **Email:** Resend/Postmark for transactional mail; configure SPF, DKIM, DMARC. Verify the sending domain before enabling Supabase Auth signup confirmations.

### 5.5 Observability & operations

- **Sentry**: `@sentry/node` in the API (unhandled rejections, slow transactions), `@sentry/react` in `WEB`.
- **Uptime**: Better Stack / UptimeRobot every 5 min on `GET https://api.…/api/health` — alert if `status != ONLINE`, `db_mode != supabase`, or `sse_clients == 0` during business hours.
- **Logs**: Fly/Render log tail + drain; Supabase Postgres logs + `pg_stat_statements` for slow queries (the pooler hides per-query latency until you look).
- **Analytics**: Cloudflare Web Analytics (free, cookieless) instead of GA4 — lighter on mobile data and no consent banner.
- **Load-shedding reality check:** assume gateways and the dashboard go offline. The ESP32 must buffer readings and retry with backoff; the dashboard must show `last_seen` staleness rather than pretending a reading is current.

### 5.6 CI/CD and releases

- `.github/workflows/ci.yml` (added): backend tests on Node 24 with required env, web build, optional `supabase db push` on `main`.
- Cloudflare Pages: PR preview URL per branch; production on `main`.
- API: Fly (`fly deploy` in CI with `FLY_API_TOKEN`) or Render autodeploy. Both should run **after** migrations.
- **Pin Node 24 everywhere.** `node:sqlite` (used for local dev) needs Node ≥22.5 with a flag on 22; Node 24 is what the Dockerfiles use.
- Tag releases (`v1.2.0`), and keep `DEPLOYMENT.md` next to the code (this file).

### 5.7 Android and firmware release notes

- `API_BASE_URL` comes from `-PapiBaseUrl=` and **must end with `/`** for Retrofit (`https://api.majismart.zm/`).
- Add a **release signing config** and upload an `.aab`; Play requires an `internal testing` track first. Play Console: $25 one-time.
- Replace the placeholder Google Maps key; ship a privacy policy for Play review (location + water reports are personal data).
- Bump `targetSdk` annually (currently 35) — Play enforces it.
- ESP32: `BACKEND_URL=https://api.majismart.zm`, per-device key, **verify TLS with the CA bundle** (`WiFiClientSecure::setCACert`) instead of `setInsecure()`, and add exponential-backoff retry with a small ring buffer for offline readings.

---

## 6. Environment variables

### API (`BACKEND`)

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (Fly) / `10000` (Render) |
| `DB_MODE` | `supabase` |
| `DATABASE_URL` | Supavisor **transaction pooler** string + `?sslmode=require` |
| `AUTO_MIGRATE` | **`false`** |
| `DB_POOL_MAX` | `5` |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` |
| `TRUST_PROXY_HOPS` | `1` |
| `CORS_ORIGINS` | `https://majismart.zm,https://www.majismart.zm,https://majismart.pages.dev` (no `*`) |
| `JWT_SECRET` | 48+ random bytes (`openssl rand -base64 48`) |
| `IOT_API_KEY` | 32+ random bytes — rotate when moving to per-device keys |
| `SEED_ADMIN_PASSWORD` / `SEED_CUSTOMER_PASSWORD` | unique per environment; also force a password change on first login |
| `DEVICE_OFFLINE_TIMEOUT_SECONDS` | `60` (raise to 900 for cellular/LoRa gateways) |
| `SSE_HEARTBEAT_MS` | `25000` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | only if you use the Supabase JS client; service role = server only |

### Web (build-time)

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.majismart.zm/api` |

Secrets live in the host's secret manager (Fly secrets / Render env / GitHub Actions secrets). Never commit `.env`; `.env.example` files stay in sync with the tables above.

---

## 7. Runbook (first deploy, in order)

```bash
# 0) Local sanity
npm --prefix BACKEND ci
npm --prefix WEB ci
JWT_SECRET=dev IOT_API_KEY=dev npm --prefix BACKEND test     # 7 pass, 1 skipped
npm --prefix WEB run build

# 1) Supabase
#    - create project (eu-central-1), save the DB password
supabase link --project-ref <ref>
supabase db push --include-all

# 2) Shared API  (Fly shown; Render: connect repo, pick render.yaml, set the same vars)
#    fly.toml already describes the app, so create the app and deploy from the repo root.
fly apps create majismart-api
fly secrets set \
  DATABASE_URL='postgresql://postgres.<ref>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require' \
  JWT_SECRET="$(openssl rand -base64 48)" \
  IOT_API_KEY="$(openssl rand -hex 32)" \
  SEED_ADMIN_PASSWORD='<strong>' SEED_CUSTOMER_PASSWORD='<strong>' \
  CORS_ORIGINS='https://majismart.zm,https://majismart.pages.dev'
fly deploy
curl -s https://majismart-api.fly.dev/api/health | jq   # status ONLINE, db_mode supabase

# 3) Web
#    Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> connect repo
#    Root dir: WEB | Build: npm ci && npm run build | Output: dist
#    Env: VITE_API_BASE_URL=https://api.majismart.zm/api  (or the fly.dev hostname first)

# 4) DNS / TLS
#    Cloudflare: CNAME api -> majismart-api.fly.dev (proxied)
#                CNAME @ / www -> <project>.pages.dev

# 5) Smoke test from the browser and from Zambia
curl -s https://api.majismart.zm/api/dashboard/summary | head
#    login as admin, load a tank, open the SSE stream, POST one simulated reading

# 6) Android
cd APP/android
./gradlew assembleRelease -PapiBaseUrl=https://api.majismart.zm/

# 7) ESP32
#    set BACKEND_URL + per-device key, flash, watch the reading appear within ~5 s
```

**Staging:** duplicate the whole chain (`staging` branch → a second Pages project, a second Fly app, and a **separate** Supabase project or schema). Never point staging at production data — the seed step writes users and devices.

---

## 8. Cost by stage

| | Demo / hackathon | Pilot (1 utility, <50 devices) | Production |
|---|---|---|---|
| Web | Cloudflare Pages $0 | $0 | $0 (Pages Pro $20 optional) |
| API | Fly `fra` ~$3 *or* Render Starter $7 | $7 | $7–20 (2 machines) |
| DB | Supabase Free $0 *(pauses when idle)* | Free $0 → Pro $25 | Pro $25 + compute ~$15 |
| Storage | — | R2 ~$0–1 | R2 ~$2–5 |
| Monitoring | $0 | Sentry Free / Better Stack Free | Sentry Team $26 + uptime $10 |
| Email | $0 | Resend Free (3k/mo) | Resend $20 |
| Domain | ~$12–15/yr `.com`; `.zm` varies | same | same |
| **Monthly** | **$0–7** | **$7–32** | **~$105–120** |

Cheapest *correct* setup: **Cloudflare Pages + Fly `fra` ($3) + Supabase Free** ≈ **$3/mo total** (plus domain). Do **not** substitute Render Free to reach $0: the service sleeps, and both the live map and the offline detector stop working.

---

## 9. Go-live checklist

- [ ] `supabase db push` applied; `AUTO_MIGRATE=false` in the API env
- [ ] API `/api/health` returns `status: ONLINE`, `db_mode: supabase`, `sse_clients` increments when the dashboard opens
- [ ] `CORS_ORIGINS` contains only real origins (no `*`); SSE returns 403 from an unknown origin
- [ ] Secrets rotated from repo defaults; `SEED_*` passwords changed; seed accounts forced to reset
- [ ] Rate limiting + `helmet` on the API; Cloudflare rate-limit rule on `/api/auth/login`
- [ ] Backups: Supabase Pro, or nightly `pg_dump` → R2 verified by a restore test
- [ ] Uptime monitor + Sentry alerts reaching a human (email/Slack/WhatsApp)
- [ ] Pagination on `/api/reports` and `/api/alerts`
- [ ] Photos go to R2/Supabase Storage; JSON body limit reduced
- [ ] Web: route-split bundle, CSP enabled with the real API origin, cache headers verified (`immutable` on `/assets/*`, `no-cache` on `index.html`)
- [ ] Android: release keystore, signed AAB, OAuth SHA-1 registered, API URL ends with `/`
- [ ] ESP32: HTTPS with CA verification, per-device key, offline buffering
- [ ] One-command rollback rehearsed (`fly releases` / Render rollback; Pages instant rollback to previous deployment)
- [ ] `DEPLOYMENT.md` + `ARCHITECTURE.md` updated to match what is actually deployed

---

## 10. What changed in this branch

| File | Change |
|---|---|
| `BACKEND/src/server.js` | `trust proxy`, no-store health response, origin-restricted SSE with `X-Accel-Buffering: no`, graceful `SIGTERM`/`SIGINT` shutdown |
| `BACKEND/src/services/realtimeService.js` | 25 s heartbeat, safe client removal, `closeAll()` on shutdown, `SERVER_RESTART` event |
| `BACKEND/src/database/db.js` | `AUTO_MIGRATE` guard (production default off), explicit missing-migration error, pooler-safe pool settings, idle-client error handler |
| `BACKEND/src/controllers/weatherController.js` | Open-Meteo timezone `Africa/Maputo` → `Africa/Lusaka` |
| `BACKEND/Dockerfile` *(new)* | API-only image for Fly/containers: Node 24, non-root, migrations included, writable `data/` |
| `Dockerfile` | Fixed: `npm ci`, copies `supabase/migrations` (boot previously crashed in a container), non-root user |
| `fly.toml` *(new)* | Fly app in `fra`, no sleep, health check, single machine documented |
| `render.yaml` | Frankfurt, Starter plan, `AUTO_MIGRATE=false`, pool cap, `NODE_VERSION=24` |
| `WEB/public/_headers` *(new)* | Security headers + asset caching for Cloudflare Pages (CSP template commented) |
| `.github/workflows/ci.yml` *(new)* | Backend tests, web build, optional `supabase db push` |
| `.dockerignore` *(new)* | Keeps images small and secrets out |

**Suggested next code tasks, in priority order:** (1) paginate reports/alerts, (2) per-device IoT keys + HMAC, (3) move photos to R2, (4) bcrypt or Supabase Auth, (5) rate limiting + helmet, (6) delete the duplicate schema file, (7) Supabase Realtime to allow >1 API instance.

---

## 11. Decisions for you

1. **API host:** Fly CLI (`fly.toml`, ~$3) or Render dashboard (`render.yaml`, $7)? Everything downstream is identical.
2. **Auth:** ship with hardened custom JWT now and migrate to Supabase Auth later, or block launch until Auth is done? (Recommendation: harden now, migrate before onboarding a second utility.)
3. **Domain:** start on `.com`/`.app` and add `.zm` when the registrar paperwork clears, or wait for `.zm`?
4. **Supabase tier:** Free with nightly dumps until the first paying utility, or Pro from day one for PITR?
