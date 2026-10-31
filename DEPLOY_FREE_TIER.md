# MajiSmart Zambia — Free-tier setup (Cloudflare Pages + Render + Supabase)

This is the operational checklist for the current plan: **web on Cloudflare Pages**, **shared API on Render Free**, **database on Supabase Free**, **Android app pointed at the deployed API**.

Strategy and trade-offs live in [DEPLOYMENT.md](./DEPLOYMENT.md). This file is "do these steps".

---

## What is already done (Supabase)

| Item | Value |
|---|---|
| Organization | `MajiSmart Zambia.` (`ujstlgxkgoytlvsivxid`) |
| Project | `majismart-zambia` |
| Project ref | `rdrwxahuxbgtugvacjpp` |
| Region | `eu-west-1` (Ireland) — fine with Render `frankfurt` (~20 ms apart) |
| Schema | all 9 tables from `supabase/migrations/20261024000001_initial_schema.sql`, RLS enabled |
| Data | cleared (fresh), so the API seeds a consistent baseline on first boot |
| Direct PostgREST access | **revoked** for `anon`/`authenticated` — see `supabase/migrations/20261031000001_api_only_table_access.sql` |

The API is now the only client that can read/write these tables. The previous state had `anon` holding full `SELECT/INSERT/UPDATE/DELETE` on every table (including `profiles` and `system_settings`), which was a real data-exposure risk because the anon key ships in clients.

**Seed data on first API boot:** 3 users, 5 Lusaka/Ndola stations, 5 tanks, 5 devices, 25 readings, 2 alerts, 3 community reports. Admin login is `admin@majismart.zm` with `SEED_ADMIN_PASSWORD`.

---

## 1. Render — deploy the shared API (free)

### 1.1 Create the service from the blueprint

1. Render Dashboard → **New** → **Blueprint**.
2. Connect the `leomabuku/majismart-zambia` repository and the branch you deploy from.
3. Render reads [`render.yaml`](./render.yaml): service `majismart-api`, runtime Node, plan **free**, region **frankfurt**, health check `/api/health`.
4. When prompted, fill the `sync: false` variables (next step). Nothing else needs changing.

### 1.2 Environment variables

Generate the secrets first (run locally):

```bash
openssl rand -base64 48          # JWT_SECRET
openssl rand -hex 32             # IOT_API_KEY
```

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase → **Project Settings → Database → Connection string → Transaction pooler**, then append `?sslmode=require` (optional — the API enforces TLS either way). It looks like:<br>`postgresql://postgres.rdrwxahuxbgtugvacjpp:<DB_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require`<br>Use the **pooler** (port 6543), not `db.<ref>.supabase.co` — direct connections are IPv6-only and Render has no IPv6 egress. |
| `JWT_SECRET` | output of `openssl rand -base64 48` |
| `IOT_API_KEY` | output of `openssl rand -hex 32` — this is the key the ESP32/simulator sends as `x-api-key` |
| `SEED_ADMIN_PASSWORD` | a strong password you will actually use to log in as admin |
| `SEED_CUSTOMER_PASSWORD` | a different strong password for the demo customer account |
| `CORS_ORIGINS` | `https://majismart-zambia.pages.dev` — update after step 2 once you know the exact Pages hostname; add your custom domain later, comma-separated, no trailing slash |

Everything else (`NODE_VERSION=24`, `DB_MODE=supabase`, `AUTO_MIGRATE=false`, `DB_POOL_MAX=5`, `TRUST_PROXY_HOPS=1`, `PORT=10000`) is already in `render.yaml`.

### 1.3 Deploy and verify

Deploy, wait for "Live", then:

```bash
curl -s https://majismart-api.onrender.com/api/health
```

Expected:

```json
{"status":"ONLINE","system":"MajiSmart Zambia Core API","sse_clients":0,"db_mode":"supabase"}
```

- `db_mode` must be `supabase` (if it says `sqlite`, `DB_MODE` did not apply and the data is ephemeral — fix before going further).
- If the service crashes on boot, check the log for `Missing required production environment variables` — one of the secrets is empty.

Then verify the seed:

```bash
curl -s https://majismart-api.onrender.com/api/dashboard/summary
curl -s https://majismart-api.onrender.com/api/tanks | head -c 300
```

You should see 5 stations / 5 tanks / 5 devices and `TANK_001` at 69%.

### 1.4 Demo telemetry (why the dashboard is not empty)

`render.yaml` sets `DEMO_MODE=true`. With no hardware attached, every device would be marked OFFLINE one timeout window after the seed, and each one would raise a `DEVICE_OFFLINE` alert — a correct behaviour that makes a public demo look broken.

`DEMO_MODE` (see `BACKEND/src/services/demoTelemetryService.js`) emits a mean-reverting random-walk reading for each seeded tank every `DEMO_INTERVAL_SECONDS` (90 s) **through the real ingestion pipeline**, so device auth, threshold alerts, tank status, charts and the SSE stream all behave as they would with sensors.

Before connecting real sensors: set `DEMO_MODE=false` and set `DEVICE_OFFLINE_TIMEOUT_SECONDS` to 2–3× your gateway reporting interval (currently 300 s).

> The Render URL is `https://<service-name>.onrender.com`. `render.yaml` asks for `majismart-api`; if the name is taken Render appends a suffix — use the exact URL it shows and put it in `VITE_API_BASE_URL` (step 2) and `RENDER_API_URL` (step 4).

---

## 2. Cloudflare — deploy the dashboard (free)

### Option A — dashboard Git integration (simplest)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the repo. Settings:

| Setting | Value |
|---|---|
| Project name | `majismart-zambia` |
| Production branch | `main` (or your deploy branch) |
| Framework preset | Vite |
| **Root directory** | `WEB` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION=24` |
| Environment variable | `VITE_API_BASE_URL=https://majismart-api.onrender.com/api` |

3. Deploy. Every push to `main` then rebuilds. `WEB/public/_redirects` (SPA fallback) and `WEB/public/_headers` (security + cache headers) ship with the build automatically.

### Option B — GitHub Actions (already wired)

[`.github/workflows/deploy-web.yml`](./.github/workflows/deploy-web.yml) builds `WEB` and runs `wrangler pages deploy`. To enable it:

1. Create the Pages project once (dashboard → Pages → **Create** → **Direct upload**, name `majismart-zambia`).
2. Repo → **Settings → Secrets and variables → Actions**:
   - Secret `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → Create Token → "Cloudflare Pages: Edit".
   - Secret `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard right sidebar / account home.
   - Variable `VITE_API_BASE_URL=https://majismart-api.onrender.com/api`.
3. Push to `main` (or run the workflow manually). Without the secrets the job skips cleanly with a notice.

### 2.1 Close the loop

1. Copy the Pages URL (e.g. `https://majismart-zambia.pages.dev`).
2. Put it in Render's `CORS_ORIGINS` and redeploy the API.
3. If you change `VITE_API_BASE_URL`, **rebuild** the Pages project — it is inlined at build time.
4. Open the dashboard, log in as `admin@majismart.zm`, and check the header shows **Realtime Connected**.

### 2.2 Custom domain (when you have one)

Pages → project → **Custom domains** → add `majismart.co.zm` (or whatever you own). If the domain's DNS is on Cloudflare, the CNAME is created automatically; otherwise add the CNAME at your registrar. HTTPS is automatic. Add the domain to `CORS_ORIGINS` as well.

---

## 3. Android app — point it at the deployed API

The default build URL is already `https://majismart-api.onrender.com/` (`APP/android/app/build.gradle.kts`). Override if your Render URL differs:

```bash
cd APP/android
./gradlew assembleDebug -PapiBaseUrl=https://your-service.onrender.com/
```

Rules:

- The URL must be **HTTPS** and end with `/` (the code normalises a missing slash).
- Cleartext HTTP is now blocked except for `10.0.2.2`, `localhost`, `127.0.0.1` (`res/xml/network_security_config.xml`), so an emulator build still works against a local API with `-PapiBaseUrl=http://10.0.2.2:5000/`.
- Requests now use 30 s connect / 90 s read timeouts, so the first request after Render has been idle succeeds instead of failing at 10 s.
- The app has **no offline cache** and no auth token; it reads public endpoints and posts reports anonymously. That is fine for the pilot but not for Play Store production — see DEPLOYMENT.md §5.

Release build for Play internal testing:

```bash
./gradlew bundleRelease -PapiBaseUrl=https://your-service.onrender.com/ -PmapsApiKey=YOUR_MAPS_KEY
```

You need a release keystore (`signingConfigs`) and the Play Console account ($25 one-time) before this can be uploaded.

---

## 4. Keep the free tier awake

Free tiers sleep. Two mechanisms, use both:

1. **UptimeRobot / Better Stack** (free) — HTTP monitor on `https://<api>/api/health` every 5 minutes, alerting to your email. This both prevents Render's 15-minute spin-down and tells you when the service is down.
2. **GitHub Actions** — [`.github/workflows/keepalive.yml`](./.github/workflows/keepalive.yml) pings the API every 10 minutes and Supabase auth once per run. Enable it by adding repo variables:
   - `RENDER_API_URL=https://your-service.onrender.com`
   - `SUPABASE_URL=https://rdrwxahuxbgtugvacjpp.supabase.co`

Budget note: 10-minute pings keep one service warm ~24/7 ≈ **730 of the 750 free instance hours/month**. Do not add a second always-on free web service to the same workspace or both will be suspended near month end. If you need the hours back, change the cron to business hours only (`*/10 6-20 * * *`).

Supabase free projects pause after ~7 days of inactivity; the daily auth ping in the same workflow prevents that.

---

## 5. Verify the whole chain

```bash
# 1. API is alive and on Postgres
curl -s https://<api>/api/health          # db_mode: supabase, status ONLINE

# 2. Seed data is there
curl -s https://<api>/api/dashboard/summary

# 3. CORS accepts the dashboard origin
curl -s -o /dev/null -D - -X OPTIONS https://<api>/api/tanks \
  -H "Origin: https://majismart-zambia.pages.dev" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control

# 4. SSE stream opens (heartbeat every 25 s)
curl -N -H "Origin: https://majismart-zambia.pages.dev" https://<api>/api/realtime/stream

# 5. A reading flows end to end
curl -s -X POST https://<api>/api/iot/readings \
  -H 'Content-Type: application/json' -H "x-api-key: <IOT_API_KEY>" \
  -d '{"device_id":"ESP32_001","tank_id":"TANK_001","distance_cm":15.5,"water_depth_cm":34.5,"water_level_percent":69,"status":"NORMAL"}'
```

In the browser: dashboard loads, header says **Realtime Connected**, the new reading appears without a refresh, and a submitted report shows up in Community Reports. In the app: tanks list loads and report submission succeeds.

---

## 6. Free-tier limits and what breaks first

| Limit | Impact | Mitigation / upgrade trigger |
|---|---|---|
| Render sleeps after 15 min idle | First request after idle takes 30–60 s; SSE drops | Keep-alive + the dashboard's polling banner + long client timeouts. Upgrade to Starter ($7) when you demo to a utility. |
| Render 750 instance hours/month | One always-on service fits; two do not | Keep one API service. |
| Render 512 MB RAM | Fine for this API; no disk (SQLite is throwaway) | Postgres is the source of truth. |
| Supabase free: project pauses after ~7 days idle | API returns 500/503 | Daily ping; upgrade to Pro ($25) for real users (backups + PITR). |
| Supabase free: 500 MB database | Readings grow ~1 row/device/60 s | Add a retention job (delete readings > 90 days) or upgrade. Rough: 10 devices at 1/min ≈ 5M rows/year. |
| Cloudflare Pages free: 500 builds/month | CI redeploys wasted | `paths: WEB/**` already limits builds. |
| GitHub cron can be delayed; disabled after 60 days idle | Keep-alive gaps | UptimeRobot is the primary keep-alive. |

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502` / `503` in the browser for ~60 s, then it works | Render free instance was asleep | Expected; the dashboard now shows "refreshing every 30s" and retries. Confirm keep-alive is running. |
| API boots then exits: `Missing required production environment variables` | Empty `JWT_SECRET`, `IOT_API_KEY`, `CORS_ORIGINS`, or `SEED_*` | Fill all `sync: false` vars in Render. |
| API boots then exits: `SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD are required` | Same as above, or `NODE_ENV=production` with blank seed passwords | Set both. |
| `/api/health` shows `db_mode: "sqlite"` | `DB_MODE` missing | Set `DB_MODE=supabase` and redeploy. |
| `self-signed certificate in certificate chain` | Older builds let `sslmode=require` in the URI override the app's TLS setting, forcing full chain verification that Supabase's pooler cannot satisfy | Fixed in the API (SSL params are stripped from the URI and TLS is configured explicitly). Redeploy the latest commit. |
| `getaddrinfo EAI_AGAIN` / timeout connecting to the database | Using the direct `db.<ref>.supabase.co` host (IPv6) or a wrong password | Use the pooler on port 6543 and re-copy the password. |
| `permission denied for table ...` from the API | You connected with the anon key instead of the postgres pooler URL | `DATABASE_URL` must be the Supabase **postgres** pooler connection string. |
| Browser console: CORS blocked | `CORS_ORIGINS` missing the exact Pages origin (scheme + host, no trailing slash) | Update the Render env var and redeploy. |
| Browser console: SSE `403 Origin not allowed` | Same as above; the stream is origin-checked now | Same fix. |
| Login fails with the seeded admin | The account was seeded earlier with a different `SEED_ADMIN_PASSWORD`; `ON CONFLICT DO NOTHING` keeps the old hash | Reset it in Supabase SQL editor:<br>`UPDATE public.profiles SET password_hash = encode(digest('<new-password>_majismart_salt','sha256'),'hex') WHERE email='admin@majismart.zm';` |
| Every tank shows OFFLINE and `DEVICE_OFFLINE` alerts appear ~1 min after deploy | No hardware is reporting (expected), or an older build compared SQLite and ISO timestamps as text and marked fresh devices stale | Keep `DEMO_MODE=true` for a hardware-less demo, or disable it and raise `DEVICE_OFFLINE_TIMEOUT_SECONDS` once sensors report. The timestamp comparison is fixed in the current code. |
| Dashboard loads but everything is empty | Seed ran against a stale database, or you are hitting SQLite | Check `/api/health` `db_mode`, then inspect `select count(*) from public.tanks;` in Supabase. |
| App shows 10 s timeouts | Old APK with default OkHttp timeouts | Rebuild with the current `MajiSmartApiService`. |
| Android "Cleartext HTTP traffic not permitted" | You set an `http://` API URL | Use HTTPS; only the three local hosts allow cleartext. |

---

## 8. Next (not required to go live)

1. **Supabase Pro** or a nightly `pg_dump` → R2 backup before real users.
2. **Rate limiting + helmet** on the API (`/api/auth/login` and `/api/reports` especially) plus a Cloudflare rate-limit rule.
3. **Pagination** on `/api/reports` and `/api/alerts` (currently unbounded) — matters as soon as the free instance has real traffic.
4. **Supabase Auth** to replace the custom `sha256` password scheme, and real Google sign-in in the app (DEPLOYMENT.md §5.2).
5. **Photos to Supabase Storage or R2** instead of base64 in the report body.
