-- Optional original customer-submitted details; distinct from administrative case events.
CREATE TABLE IF NOT EXISTS report_submission_details (
  report_id TEXT PRIMARY KEY REFERENCES community_reports(id) ON DELETE CASCADE,
  reported_category TEXT NOT NULL,
  observed_at TEXT,
  reported_severity TEXT CHECK (reported_severity IS NULL OR reported_severity IN ('LOW','MEDIUM','HIGH','UNKNOWN')),
  ongoing TEXT CHECK (ongoing IS NULL OR ongoing IN ('YES','NO','UNKNOWN')),
  affected_area TEXT,
  provenance TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (provenance IN ('OPERATIONAL','SIMULATED','TEST','UNKNOWN'))
);
CREATE INDEX IF NOT EXISTS idx_report_submission_category ON report_submission_details(reported_category);
