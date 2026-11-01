CREATE TABLE IF NOT EXISTS tank_calibration_tests (
  id TEXT PRIMARY KEY,
  tank_id TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  raw_distance_cm REAL NOT NULL,
  manual_depth_cm REAL NOT NULL,
  calculated_depth_cm REAL NOT NULL,
  depth_error_cm REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calibration_tank ON tank_calibration_tests(tank_id, created_at);
ALTER TABLE public.tank_calibration_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tank_calibration_tests FROM anon, authenticated;
