# MajiSmart Zambia deployment guide

This repository is prepared for the following split deployment:

- Web dashboard: Cloudflare Pages, built from `WEB`
- API: Render Web Service, configured by [`render.yaml`](./render.yaml)
- Database: Supabase PostgreSQL through the async `pg` pool
- Android: native Kotlin app with a build-time API URL
- Hardware: ESP32 HTTPS telemetry against the Render API

## Local verification

```powershell
npm.cmd --prefix BACKEND install
npm.cmd --prefix WEB install
npm.cmd --prefix BACKEND test
npm.cmd --prefix WEB run build
```

The backend tests use the local SQLite seed database. PostgreSQL integration tests are opt-in and run only when `TEST_DATABASE_URL` is set; no remote database is assumed.

To run the PostgreSQL integration checks against an isolated test database:

```powershell
$env:TEST_DATABASE_URL = "<isolated-postgresql-connection-string>"
npm.cmd --prefix BACKEND test
```

Those checks cover pool health, baseline seed data, telemetry persistence, and transaction rollback. They were not run in this workspace because Docker was unavailable and no test database credentials were supplied.

## Render API deployment

1. Connect the repository in Render and select the `render.yaml` blueprint.
2. Set `JWT_SECRET`, `IOT_API_KEY`, `SEED_ADMIN_PASSWORD`, and `SEED_CUSTOMER_PASSWORD` to unique values in Render's secret environment configuration.
3. Set `CORS_ORIGINS` to the Cloudflare Pages origin, for example `https://dashboard.example.pages.dev`.
4. Deploy and verify `https://<service>.onrender.com/api/health`.
5. Confirm the response reports `db_mode: "supabase"` and an `ONLINE` database health check.

Set `DATABASE_URL` to the Supabase pooled PostgreSQL connection string. Render does not use a disk; SQLite is for local development and tests only.

## Cloudflare Pages deployment

Create a Pages project with:

- Root directory: `WEB`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://<service>.onrender.com/api`

The same variable can be set to `/api` when the dashboard is served by the backend or through the local Vite proxy.

## Android build

The default emulator URL is `http://10.0.2.2:5000/`. For a deployed API, pass the URL at build time:

```powershell
Push-Location APP\android
.\gradlew.bat assembleRelease -PapiBaseUrl=https://<service>.onrender.com/
Pop-Location
```

The URL must end in `/` for Retrofit. Production Android builds should also replace the placeholder Google Maps key and use a release signing configuration.

## ESP32 configuration

Before flashing, set `BACKEND_URL` and `IOT_API_KEY` in [`maji_smart_esp32.ino`](./FIRMWARE/maji_smart_esp32/maji_smart_esp32.ino) to the Render HTTPS endpoint and the device key stored in Render. Never commit those values.

## Required human-only steps

The following cannot be completed safely from this workspace:

1. Authenticate and create the Cloudflare Pages and Render services.
2. Create or select the Supabase project and run the reviewed migration.
3. Provide production secrets through each provider's secret manager.
4. Run `supabase/migrations/20261024000001_initial_schema.sql` in the selected Supabase project before deploying.
