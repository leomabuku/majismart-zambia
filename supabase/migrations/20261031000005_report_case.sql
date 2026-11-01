CREATE TABLE IF NOT EXISTS report_case_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_category TEXT, severity TEXT, suspected_cause TEXT, confirmed_cause TEXT,
  findings TEXT, action_taken TEXT, outcome TEXT, assigned_to TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_case_events_report ON report_case_events(report_id, created_at);
ALTER TABLE public.report_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_case_events FROM anon, authenticated;
