-- Local audit history; revision is added idempotently by initDatabase.
CREATE TABLE IF NOT EXISTS gis_water_point_events (
  id TEXT PRIMARY KEY,
  water_point_id TEXT NOT NULL REFERENCES gis_water_points(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED','UPDATED')),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gis_water_point_events_point ON gis_water_point_events(water_point_id, created_at);
