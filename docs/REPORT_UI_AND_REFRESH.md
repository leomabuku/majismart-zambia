# Summary-first reports and one-second telemetry

Report Intelligence now opens with four headline measures, two overview charts,
compact issue/location breakdowns and two recommended focus items. Filters,
written analysis, methodology and additional recommendations are expandable.
Issues, Response, Locations and Reports are separate views. Individual reports
open in a keyboard-dismissable detail dialog instead of expanding a long page.
All existing October records, calculations, filters and CSV fields are retained.
Historical demo data remains visibly labelled; it does not pretend to update as
new physical sensor data.

New tank values use a separate serialized request queue. Reading events fetch
`/tanks`, with summary metrics checked at most every five seconds. They do not
refetch report lists or station metadata. A slow older response cannot roll a
tank back to an earlier timestamp. The latest saved reading timestamp is visible
in the header and the dashboard ticker. The photo-reading injection shortcut has
been removed from the header.

The server's default fallback tank-state check is now 1000 ms while viewers are
connected. `telemetry_updates.check_interval_ms` in `/api/health` reports the
effective setting. Supabase push, when configured, still relays events directly.
If SSE is unavailable, the browser checks tank values every second and refreshes
the larger dashboard data less often. Report analysis only refetches on report
activity/reconnection; degraded polling is throttled for that larger dataset.

Tank history refreshes through its own queue, avoiding cancellation starvation
when a reading arrives every second. Live chart animation is disabled so it does
not restart a long transition on each packet. Sensor values always come from
saved API data; client clocks and animation do not manufacture new measurements.

A one-second check is not a one-second end-to-end guarantee. Upload time, database
commit time, API latency, connection quality and free-tier cold starts still
affect display delay. The dashboard presents the newest available state; history
retains individual accepted readings. No firmware or physical calibration change
is made in this release.
