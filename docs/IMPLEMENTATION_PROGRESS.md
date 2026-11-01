# Product enhancement: implementation progress and operating cautions

> Historical milestone. Later integration work supersedes parts of this document; see [INTEGRATED_TELEMETRY.md](INTEGRATED_TELEMETRY.md) for the current state and limitations.

## Repository findings

The Express API uses a small SQL adapter: SQLite is the default and PostgreSQL is used only with `DB_MODE=supabase` and a database connection string. PostgreSQL migrations live in `supabase/migrations`; the local SQLite schema is initialized separately. No remote database was inspected or modified. The application seeds accounts, stations, tanks, devices, readings, alerts and three reports into a fresh database. `DEMO_MODE=true` adds synthetic readings. Existing records do not have a general provenance flag, so test and synthetic data cannot reliably be excluded from all analytics.

Users register or sign in through the API (password or Google); JWTs carry an application role, and admin middleware guards management routes. The React app uses REST and an unauthenticated SSE stream with polling fallback. Android uses Retrofit and JWT authentication. Reports support categories, optional coordinates and photos, status updates and status history; status is currently SUBMITTED, ACKNOWLEDGED, IN_PROGRESS, RESOLVED or REJECTED. A status update and its history entry are transactional. The ESP32 and simulator send distance, depth and percent; the backend persists raw payload and broadcasts events, but the legacy endpoint auto-registers unknown tanks/devices with a shared provisioning key, assumes linear height, and accepts the device's status. It is not a calibrated geometry-aware device provisioning system. SSE is process-local and cannot guarantee delivery across instances or during disconnects.

## Implemented slice

`GET /api/analytics/reports` requires an administrator JWT. Optional query parameters: `from`, `to` (inclusive YYYY-MM-DD submission dates), `category`, `status`, `station` (station ID), and `location` (case-insensitive exact recorded location name). All filters apply to the same submission cohort. Three fixed baseline report IDs (`rep-001`, `rep-002`, `rep-003`) are excluded. Other synthetic/test data cannot be distinguished. The page is linked from the admin sidebar. No AI is used.

Metrics use `community_reports` (`id`, `created_at`, `status`, `category`, `location_name`, `station_id`) and `report_status_history` (`report_id`, `new_status`, `created_at`):

* Total and category, location, status and daily counts count each selected report once, using its current category/status and submission date. Category share is count / total × 100; no percentage is shown when empty. Location names are not administrative boundaries and no coordinates are invented.
* Resolution rate is currently resolved / (total minus currently rejected) × 100, or unavailable for zero eligible reports. Counts represent current state, not the state at the end of the selected period.
* Resolution mean and median use elapsed hours from submission to the **latest** RESOLVED history event for currently resolved reports. Reports without a valid nonnegative duration are excluded; the observation count is displayed. Reopened reports that are currently open are not included. Repeated history entries do not multiply counts.
* Dates use the database's date conversion; configure the PostgreSQL session timezone consistently before using day boundaries for operational comparisons. The location grouping is exact text, not proximity or recurrence matching.

No migration was added. Report SSE messages now contain only IDs/status, rather than reporter details or internal notes. Report reads hide internal notes and history notes from non-admin users, including the owner; owners may still see the rejection reason. Other report fields remain governed by the existing public report model; a broader privacy review is still needed.

`BACKEND/src/lib/tankGeometry.js` is a **standalone, tested foundation, not integrated into ingestion or UI**. It takes centimetres, rejects invalid calibration and measurements beyond tolerance, and calculates depth, geometry-based volume, volume percentage and usable litres for rectangular, vertical-cylinder and horizontal-cylinder tanks. Horizontal cylinder support assumes the usable height equals the internal diameter and the empty/full references span that height. It does not handle partial usable heights in horizontal cylinders. Sensor offset is represented by the measured empty and full reference distances. Nominal capacity is not used.

## Remaining implementation and operator guidance

Do not rely on current telemetry for accurate water volume or hardware deployment. Work still needed: provenance and migration strategy for seeded/synthetic data; structured case taxonomy and findings, assignment and event audit; richer analytics and historical filters; owner/tank associations; registration and calibration wizard with map; calibrated ingestion and provisioned per-device credentials; sensor timeout and hysteresis; offline/stale handling; authenticated/scoped realtime; Android and customer redesign; full PostgreSQL and end-to-end SSE verification. These should be developed and reviewed before deployment. Existing public APIs and the unauthenticated realtime stream also need a security review. No production migrations or deployment were performed.

To verify PostgreSQL locally, provision a disposable PostgreSQL instance, apply the Supabase migrations and set `TEST_DATABASE_URL` as described in the integration test. Do not use production credentials or a production database for destructive tests. To build Android, install JDK 17 and Android SDK 35, set `JAVA_HOME` and SDK paths, then run `bash gradlew assembleDebug` from `APP/android` (the wrapper's Gradle distribution must be obtainable). Firmware requires Arduino ESP32 tools, sensor wiring and an HTTPS endpoint with certificate verification; current firmware still needs review and changes before field use. Never put privileged database credentials on a device.

## Physical demonstration calibration protocol (not yet performed)

1. Measure internal dimensions and verify usable height and geometry; calculate capacity independently and compare with manufacturer capacity.
2. Secure a top-mounted sensor, measure sensor-to-empty and sensor-to-full distances, and check the full reference is outside its dead zone. Ensure empty minus full equals usable height.
3. At empty, quarter, half, three-quarter and full levels, take multiple readings, note timeouts and outliers, and record the median distance. Measure actual depth and volume independently.
4. Compare calculated depth/volume with manual measurements, record signed and absolute errors, adjust calibration if justified, and repeat. Do not claim accuracy until measured against an agreed tolerance. Take care with sensor voltage levels and water safety.

| Test point | Manual depth (cm) | Manual volume (L) | Median distance (cm) | Calculated depth (cm) | Calculated volume (L) | Depth error (cm) | Volume error (L) | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Empty | | | | | | | | |
| Quarter | | | | | | | | |
| Half | | | | | | | | |
| Three-quarter | | | | | | | | |
| Full | | | | | | | | |
