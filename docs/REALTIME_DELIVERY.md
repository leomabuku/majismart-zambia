# ESP32 reading delivery

The deployed browser already consumes `NEW_READING` invalidations from Render.
API ingestion emits them, but `receive-reading` writes directly to Supabase and
does not call Render's in-process broadcaster. A connected SSE transport alone
therefore did not guarantee that those readings refreshed the dashboard.

The API now relays database changes to the existing SSE clients. With the
existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured,
it subscribes to Postgres changes on `public.water_level_readings` and
`public.tanks`. Enable those two tables in the existing `supabase_realtime`
publication for push delivery. RLS, table read policies and browser keys do not
need to be weakened. Never put the service role key in frontend variables.

A read-only fallback compares the small tank-state snapshot every 2 seconds
while SSE clients are connected. It covers missing credentials, unpublished
tables, connection failures and writes from other processes. This fallback is
near-real-time polling, not a substitute for verifying Supabase push events.
`TELEMETRY_CHANGE_CHECK_MS` optionally changes the interval (minimum 1000 ms).
No queries are added when there are no SSE viewers.

`/api/health` includes `telemetry_updates.mode`, `last_event_at`, `last_check_at`
and `check_error` so operators can see whether the relay is subscribed or using
the fallback. A channel joining is not proof of physical ESP32 reception.

The SSE channel continues to contain **empty invalidations**, never rows,
credentials or personal information. Clients fetch values through the existing
API authorization. API responses and browser requests disable caching.

Frontend events now trigger a serialized refresh with a catch-up request if
another reading arrives during a fetch. Tank history refreshes on those events
as well, without resetting the administrator's unsaved configuration fields.
When SSE itself fails, the browser reports its degraded state and refreshes
every 5 seconds rather than every 30 seconds.

Validation covers an actual local direct database update -> SSE -> uncached API
read, as well as Supabase callback delivery, reconnect, fallback, shutdown,
concurrent events, API authorization and the current deployed branch's full
test suite. No production sensor values were written as a test. PostgreSQL
integration requires `TEST_DATABASE_URL`; physical hardware/browser acceptance
remains separate.

This fix does not change calibration or reconcile the legacy Edge Function and
simulated writers documented in DEPLOYMENT_ALIGNMENT_20261101.md. The dashboard
shows the latest database state; a synthetic writer must not be mistaken for
physical evidence.
