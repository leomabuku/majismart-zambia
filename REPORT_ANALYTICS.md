# Admin report analytics

Open **Report Analytics** in the sidebar after signing in as an administrator.
The new sidebar sign-in form uses the existing backend authentication endpoint.
The API enforces the administrator role; hiding the sidebar item alone is not
the authorization boundary.

## API and source

`GET /api/reports/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&category=ALL`

- Requires a valid API access token and the current database role `admin`.
- Reads `community_reports`, `monitoring_stations` and `report_status_history`
  from the API's configured database. Supabase PostgreSQL is used when the API
  is configured with `DB_MODE=supabase`; the local default is SQLite.
- Dates are inclusive Zambia calendar dates (`Africa/Lusaka`), converted to a
  half-open timestamp range. Default: 30 days; maximum: 366 days.
- Optional category uses the existing allowed categories. Filters are validated
  and passed as SQL parameters. The response is private and not cacheable.
- Response includes aggregate counts only: no reporter identifiers, phone
  numbers, names, descriptions or administrator notes.

## Metric definitions

All metrics describe reports **submitted during the selected period**, using
their current statuses at query time. This is a submission cohort, not a count
of every status transition during the period.

- Open: submitted, acknowledged or in progress.
- Resolved share: currently resolved / all selected reports, including rejected.
  An empty cohort has no rate, shown as an em dash.
- Average resolution: elapsed hours from submission to the latest transition
  into resolved, for reports that are currently resolved. Reopened reports are
  excluded until resolved again. Re-saving an already resolved status does not
  reset the clock. Missing/invalid resolution history is excluded, with sample
  size displayed. `updated_at` is not a substitute for resolution history.
- Open age: time since submission, in under-24, 24–48 and over-48-hour bands.
  Over 48 hours is an operational review flag, not a promised service level.
- Locations: group by linked station name or otherwise submitted location text;
  show the top 10 by open count. Free-text locations are not geocoded or merged.
- Daily submissions include zero-count days in Zambia time. Invalid and future
  timestamps are excluded rather than creating misleading metrics.

The page refreshes on report creation/status SSE events, on SSE reconnection,
and every 30 seconds. A failed refresh keeps the previous data with a visible
warning and its update timestamp. Date/category changes discard the previous
cohort before fetching, so stale data is not labelled with new filters.

CSV export contains the current aggregate snapshot and filter metadata. It
escapes quoted cells and neutralizes spreadsheet formula prefixes in text.
No database schema change or new dependency is required for this feature.

## Verification

- Backend tests cover role enforcement, invalid filters, actual SQLite queries,
  Zambia day boundaries, all report statuses, reopened reports, missing history,
  category filtering, empty results and invalid dates.
- Frontend tests cover CSV values, quoting and formula injection. Existing
  telemetry tests remain in the same suite.
- Production frontend build passes. PostgreSQL integration remains unverified
  without `TEST_DATABASE_URL` and access to the live Supabase project.
- A local browser could not be installed because its download was truncated.
  Responsive layout, sign-in, chart rendering and CSV download still require
  browser acceptance on a deployed preview. Confirm an admin can open the page,
  a customer cannot fetch its API, a new report updates the metrics, filters
  align with report records, and mobile layout works at 390px and 768px.

Deploy the API and frontend together: the page needs the new protected API
endpoint. The Supabase telemetry work has separate build variables and release
checks documented in `SUPABASE_TELEMETRY.md`.
