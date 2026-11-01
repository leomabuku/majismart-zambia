# Dashboard readings from the ESP32 Supabase project

## Existing paths and the disconnect

The GiftTank `Smart_Water_Za.ino` sketch sends `tank_id`, distance, water depth,
percentage and status to the `receive-reading` Edge Function in project
`rdrwxahuxbgtugvacjpp`. The other `FIRMWARE/maji_smart_esp32` sketch sends to
the Render API. These are separate ingestion paths.

Before this change the web dashboard fetched only the Render API and listened
only to that process's SSE broadcasts. A direct insert into Supabase could
therefore remain invisible, even while the dashboard claimed to be connected.

## Configuration

Keep `VITE_API_BASE_URL=https://majismart-api.onrender.com/api` for tank metadata,
reports, alerts and configuration. For the direct Supabase telemetry path, set
these Cloudflare Pages **build** environment variables and rebuild:

```
VITE_SUPABASE_URL=https://rdrwxahuxbgtugvacjpp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
VITE_SUPABASE_READINGS_TABLE=<verified destination table>
```

Never put a service role key, secret key, device key or database password in
`VITE_*`. These values are public browser configuration. The publishable key
does not grant permission by itself: the table's existing grants and RLS apply.
The web app currently uses custom API authentication, not Supabase Auth. Do not
grant unrestricted authenticated access expecting the API login to supply a
Supabase session. If readings are private, implement scoped Supabase Auth or
an authenticated backend bridge before enabling this browser path.

The default table is `water_level_readings`, matching the repository migration.
The live Edge Function and destination table have **not** been inspected: the
connected Supabase account denied access to this project. Verify the table
before setting the variable. Required columns:

`id`, `tank_id`, `distance_cm`, `water_depth_cm`, `water_level_percent`, `status`,
`created_at` (timestamp with timezone).

`tank_id` must match the tank's `tank_id_code` from the API, e.g. `TANK_001`.
If the live table uses different column names or identifiers, adapt the source
after inspecting it. Do not change the hardware calibration to match seed data.

## Database setup to verify with the project owner

1. Inspect `receive-reading` and confirm its destination table, columns, and
   timestamp behavior. Confirm accepted ESP32 packets actually create rows.
2. Keep RLS enabled. Confirm the browser's role has SELECT only on telemetry
   intended for public dashboard display. Do not expose device credentials,
   profiles, raw payloads or community personal information.
3. In Database > Publications, enable the verified telemetry table under the
   existing `supabase_realtime` publication. Do not recreate the publication.
4. Check for an index on `(tank_id, created_at DESC)` for latest/history queries.

No live policies, tables, publication settings or firmware were changed here.

## Resulting behavior

- Fetch the latest row for each registered tank on page load. No latest reading
  is fabricated from the API's demonstration values when Supabase is selected.
- Subscribe to INSERT and UPDATE events; update cards, tank counters and latest
  packet display. Analytics history uses the same source.
- Refetch after subscription/reconnection and every 15 seconds. Polling covers
  missed events and disabled replication; it is not proof that Realtime works.
- Ignore malformed, duplicate and older packets. Treat readings older than
  60 seconds as offline while retaining the last measurement and timestamp.
- Show connection status from the actual stream lifecycle. Stream connection
  does not imply a physical sensor is online or calibrated.
- The Render API still supplies alerts/reports. This change does not generate
  Render alerts for direct Edge Function inserts or synchronize its database.

Without Supabase variables the existing API/SSE path remains available, with a
15-second API refresh and honest stream state. SSE now sends keepalive comments.

## Validation and release gate

Run `npm test --prefix WEB`, `npm run build --prefix WEB`, and the backend tests
with local test JWT/device keys. PostgreSQL integration requires a separate
`TEST_DATABASE_URL`.

On the deployed preview, open DevTools Network and confirm both the initial
Supabase SELECT and the Realtime WebSocket succeed. Send one physical ESP32
packet, then compare the exact tank ID, percentage, depth and database timestamp
against the dashboard and chart without reloading. Disconnect the sensor for
over 60 seconds; the card must go offline. Reconnect the browser and verify
catch-up. Disable the WebSocket temporarily and verify the 15-second fallback.
Check an empty tank, a denied SELECT, and switching between tanks.

No live data, authenticated browser or physical ESP32 verification has been
completed. This is a review branch, not a verified production release.
