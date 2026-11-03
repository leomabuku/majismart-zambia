-- Admin review history and optimistic concurrency. No existing water points are changed.
ALTER TABLE public.gis_water_points ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);
CREATE TABLE IF NOT EXISTS public.gis_water_point_events (
  id TEXT PRIMARY KEY,
  water_point_id TEXT NOT NULL REFERENCES public.gis_water_points(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED','UPDATED')),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_water_point_events_point ON public.gis_water_point_events(water_point_id, created_at);
ALTER TABLE public.gis_water_point_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gis_water_point_events FROM anon, authenticated;
