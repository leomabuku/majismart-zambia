# October 2026 report-analysis scenario

This user-requested dataset contains **334 synthetic reports from 80 fictional
resident aliases**, with 1,093 workflow events and 510 administrative case
entries. No real resident account, email address, phone number, sensor record or
physical incident is created. Named Lusaka communities provide scenario context;
the records do not establish that any described incident actually occurred there.

## Population and separation

`ensureOctoberDemo` inserts a deterministic versioned batch once at API startup,
using existing report/history/case tables. Every report has a `[DEMO]` title,
`demo-oct2026-v1-` identifier and `SIMULATED` submission provenance. Reporter IDs
and admin actor IDs are null, so actions are not attributed to real people.
The marker in `system_settings` makes restarts idempotent. Bulk parameterized
inserts use conflict protection and the existing database transaction helper.

The historical snapshot ends at **31 October 2026, 23:59 Zambia time**. Reports
and their responses cannot be edited through the live case-management endpoints.
Do not change the generator under the existing batch key to revise stored data;
use a new explicitly reviewed batch version if a revised scenario is requested.

Operational analytics, normal report lists and dashboard report totals exclude
SIMULATED and TEST submissions. Non-admin viewers cannot fetch the snapshot by
report ID. Real/unknown submissions are not rewritten or deleted. Operational
analytics still includes UNKNOWN-provenance submissions with a visible warning;
it does not certify them as verified incidents.

## Analysis

The admin Report Intelligence page defaults to the October scenario and offers
an explicit operational-data switch. Date filters use inclusive Zambia days.
Categories reflect original resident observations; latest admin classification,
severity, cause, action and outcome remain separate fields. Each report counts
once regardless of the number of case entries.

Charts cover daily workload/closures, current workflow status, reported fault,
admin severity, first-response duration, resolution duration, actions, causes,
open-report age and latest outcome. A location/category matrix shows exact
counts, and tables retain accessible numeric values. Every filter recomputes
charts, narrative, recommendations, the report explorer and the CSV export.

- Resolution rate = currently resolved / selected non-rejected reports.
- First response = earliest recorded status action or case entry after submission.
- Resolution time = submission to latest transition into RESOLVED for currently
  resolved reports. Re-saving the same status does not reset the clock.
- Mean, median and nearest-rank 90th percentile use valid recorded durations.
  Missing durations are omitted with sample sizes shown, never replaced by zero.
- Open-report age uses the snapshot time for demonstration data and current time
  for operational data. The 24-hour and seven-day comparisons are review bands,
  not contractual service levels.
- Daily closures show the latest resolutions of selected reports on the given
  day; they do not count all utility work or every reopen/close event.
- Multiple complaints may concern one incident. Counts are not population-adjusted
  failure rates, water-loss volumes, budget estimates or confirmed water safety.

Narratives and recommended actions are deterministic, evidence-linked rules.
They highlight unresolved water-quality complaints, high-severity work,
concentrated reporting, leak investigations, missing responses and classification
gaps. They do not dispatch teams, approve spending or claim causal proof.

Report-level CSV includes anonymized/synthetic reporter labels, categories,
administrative findings, status, timestamps, response/resolution hours, actions,
outcomes and responses. Phone numbers and real reporter names are not exported.
Text cells are escaped and spreadsheet formula prefixes neutralized.

## Verification and limits

Tests verify deterministic population, lifecycle chronology, idempotent loading,
admin authorization, isolation from operational views, reconciled chart counts,
history-derived durations, empty cohorts, narrative evidence and CSV escaping.
Existing telemetry/authentication/report tests must remain green.

No schema migration or new runtime dependency is required. The API queries at
most 5,000 reports per cohort; larger selections are rejected with an instruction
to narrow filters rather than silently returning partial metrics. Browser visual
acceptance and the PostgreSQL integration test are separate from SQLite checks.
After deployment, verify `october_demo.ready` in `/api/health`, inspect the admin
page and confirm real report totals have not grown by the demonstration count.
