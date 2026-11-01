# Deployment alignment — integrated telemetry branch (1 Nov 2026)

Status of the Supabase / Render / Cloudflare stack after merging
`arena/3d3cc8cd-majismart-zambia` into `arena/b49ba57d-majismart-zambia`.

Everything below was verified against the live project unless explicitly marked
**unverified**. No credential values are recorded in this file.

---

## 1. Database (Supabase) — verified and up to date

Target project: `rdrwxahuxbgtugvacjpp` (`majismart-zambia`), region `eu-west-1`,
PostgreSQL 17, healthy.

### What was found

* `supabase_migrations.schema_migrations` did **not exist**: the project had never
  been touched by the Supabase CLI. Earlier migrations had been applied by hand.
  That means `supabase db push` (and the `migrate` job in `.github/workflows/ci.yml`)
  would have replayed **all nine** migrations, and the initial schema would have
  failed on `CREATE POLICY` (not idempotent), breaking the workflow.
* The nine tables of the initial schema were present, `profiles.google_sub`,
  `avatar_url`, `auth_provider` existed, `community_reports.location_accuracy_m`
  and `location_source` existed, and `anon`/`authenticated` held no privileges on
  any public table — so migrations `20261024000001` and `20261031000001`–`000003`
  had in fact been applied.
* `tank_installations`, `telemetry_metadata`, `report_case_events`,
  `tank_calibration_tests`, `sensor_fault_events` and `report_submission_details`
  did **not** exist. Deploying the merged API before applying them would have
  produced 500s on installation, analytics, case-history and structured-report
  endpoints.

### What was done

1. **Dry run.** The five pending migrations were executed against a throwaway
   `migprobe` schema in the same database (with stub copies of the referenced
   base tables), so the DDL was validated by a real PostgreSQL 17 parser before it
   touched `public`. The scratch schema was then dropped. No rows were touched.
2. **Type fix.** The pending migrations declared `created_at TEXT NOT NULL DEFAULT
   CURRENT_TIMESTAMP` and `updated_at` likewise. PostgreSQL accepted the default,
   but every other table in this schema stores timestamps as `TIMESTAMPTZ`. A text
   column would break joins and comparisons against `tanks.created_at`,
   `water_level_readings.created_at` and friends (there is no `text >= timestamptz`
   operator), and rows written by the API (`toISOString()`) would have sorted
   differently from rows written by the column default (`CURRENT_TIMESTAMP` text
   form). `created_at`/`updated_at` in `tank_installations`,
   `report_case_events`, `tank_calibration_tests` and `sensor_fault_events` were
   changed to `TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Timestamps that carry payload
   meaning (`measured_at`, `observed_at`, `calibration_date`) remain `TEXT`, because
   the device supplies them and they are never compared in SQL. The SQLite
   migrations are unchanged — SQLite is dynamically typed.
3. **Applied.** All five migrations were applied to `public`. Verified afterwards:
   15 tables in `public`, RLS enabled on all six new tables, and `anon` /
   `authenticated` denied `SELECT` on every one of them.
4. **History baseline.** `supabase_migrations.schema_migrations` was created with
   one row per already-applied migration (`20261024000001` … `20261101000002`),
   so future `supabase db push` runs are incremental instead of a full replay.

### Safety argument

The five pending migrations are **purely additive**: they create new tables,
indexes and grants. No existing table, column or row is altered or dropped, so the
live demo data (7 profiles, 7 reports, 3 tanks, 5 devices, ~3,400 readings, 8
alerts) could not be affected. That is also why no separate backup snapshot was
required *for this step*; take one before any future `ALTER`-style migration.

### Caveat for future changelog hygiene

`created_at` on the three affected tables is now `TIMESTAMPTZ` in PostgreSQL and
`TEXT` in SQLite. The API writes ISO-8601 strings in both, and
`BACKEND/src/lib/timestamps.js` already normalises both dialects when parsing, so
ordering and duration maths behave the same. Keep that in mind when writing new
SQL that sorts or compares these columns directly.

---

## 2. API (Render) — deploys from this branch, but is behind

* Service `majismart-api`, free plan, `autoDeploy: true`, health check
  `/api/health`. Proven to be tracking **this Arena branch**: `GET /api/users`
  (added in `0cfa24d`) returns `401 Access token required` on the live service,
  while `GET /api/analytics/telemetry` (only present after the merge) returns
  `Cannot GET` — i.e. the deployed build predates the merge.
* `render.yaml` sets `AUTO_MIGRATE=false`, so the API never runs DDL at boot. The
  database step above had to come first, and did.
* Required env vars are already present on the service (`DATABASE_URL`,
  `JWT_SECRET`, `IOT_API_KEY`, `SEED_*_PASSWORD`, `CORS_ORIGINS`,
  `GOOGLE_CLIENT_ID`, `DB_MODE=supabase`, `DEMO_MODE=true`). Nothing in the merged
  code adds a new required variable.

### Operational consequence of the telemetry change

Telemetry is now geometry-derived, and **unknown devices no longer self-register**.
The seeded demo tanks have no geometry, so after this deploy `DEMO_MODE` will find
no `SIMULATED` installation to feed and every tank will flip to `OFFLINE` within
`DEVICE_OFFLINE_TIMEOUT_SECONDS`. This is correct behaviour, but it makes the
public demo look broken.

Provision the demo tanks once, after the deploy is live:

```bash
API_BASE_URL=https://majismart-api.onrender.com \
ADMIN_EMAIL=admin@majismart.zm \
ADMIN_PASSWORD='<SEED_ADMIN_PASSWORD>' \
IOT_API_KEY='<IOT_API_KEY>' \
node BACKEND/scripts/provision-demo-tanks.mjs --dry-run   # review the plan first
```

then drop `--dry-run`. The script is idempotent (it skips tanks that already have
an installation), creates a vertical-cylinder geometry derived from each tank's
`usable_height_cm` and `capacity_liters`, registers a `SIM_<TANK_CODE>` device
whose credential is the shared `IOT_API_KEY`, records three calibration tests
(20/50/80 % depth) and approves them with a 1 cm tolerance. It never prints the
credential. **This shared-credential shortcut is demo-only** — real sensors must
get their own unique keys via the installation screen.

---

## 3. Frontend (Cloudflare Pages) — unchanged configuration

* Project `majismart-zambia`; build with the **React (Vite)** preset, root `WEB`,
  command `npm ci && npm run build`, output `dist`. Build-time variables
  `VITE_API_BASE_URL=https://majismart-api.onrender.com/api`,
  `VITE_GOOGLE_CLIENT_ID`, `NODE_VERSION=24`. `WEB/public/_headers` still carries
  the CSP and `Cross-Origin-Opener-Policy: same-origin-allow-popups` that Google
  sign-in needs.
* The merged branch only adds pages and components; it needs **no new build
  variables**. Nothing to change in the dashboard.
* Cloudflare builds are immutable: any variable edit needs a fresh deployment.

---

## 4. Deployment order

1. **Database** — apply migrations (done for this merge).
2. **API** — Render rebuilds `majismart-api` from the branch; wait for
   `/api/health` to report `ONLINE` with `db_mode: "supabase"`.
3. **Verify API** — `GET /api/analytics/telemetry` without a token must return
   `401 Access token required` (route exists). `Cannot GET` means the old build is
   still serving; wait for the deploy, do not "fix" it in code.
4. **Provision demo tanks** — `provision-demo-tanks.mjs` (see §2), then confirm
   `GET /api/tanks` shows recent `last_reading_at` values.
5. **Frontend** — deploy Pages last, so the app never points at an API that is
   still mid-migration.

Never let the frontend deploy ahead of the API: the new pages call endpoints that
return 404 on the old build.

---

## 5. What is still unverified

| Item | Why |
|---|---|
| PostgreSQL **runtime** behaviour of the new endpoints | No disposable PostgreSQL in the build environment. The DDL was verified on the real PG 17 instance (scratch schema); query behaviour was exercised only against SQLite. |
| Android app | No JDK and no Android SDK available here; `gradlew` cannot run. |
| ESP32 firmware | No Arduino toolchain, no hardware. Nothing physical was tested. |
| Cloudflare Pages build of this merge | Needs a push to the Pages-tracked branch; not triggered from here. |
| SSE across instances | Still process-local, no replay. Documented limitation, unchanged. |
