-- Smart Water Zambia GIS. Coordinates remain authoritative; geometry is derived.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
                 WHERE e.extname = 'postgis' AND n.nspname = 'extensions') THEN
    RAISE EXCEPTION 'PostGIS must be installed in the extensions schema; see docs/GIS.md';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gis_water_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BOREHOLE','KIOSK','PUBLIC_TAP','OTHER')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  operational_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (operational_status IN ('OPERATIONAL','NOT_OPERATIONAL','UNKNOWN')),
  source TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('VERIFIED','UNVERIFIED')),
  community TEXT, district TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (latitude <> 0 OR longitude <> 0)
);
ALTER TABLE public.gis_water_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gis_water_points FROM anon, authenticated;

ALTER TABLE public.monitoring_stations ADD COLUMN IF NOT EXISTS gis_point extensions.geometry(Point, 4326);
ALTER TABLE public.tank_installations ADD COLUMN IF NOT EXISTS gis_point extensions.geometry(Point, 4326);
ALTER TABLE public.community_reports ADD COLUMN IF NOT EXISTS gis_point extensions.geometry(Point, 4326);
ALTER TABLE public.gis_water_points ADD COLUMN IF NOT EXISTS gis_point extensions.geometry(Point, 4326);

CREATE OR REPLACE FUNCTION public.gis_sync_point() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitude BETWEEN -90 AND 90 AND NEW.longitude BETWEEN -180 AND 180
     AND (NEW.latitude <> 0 OR NEW.longitude <> 0) THEN
    NEW.gis_point := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.gis_point := NULL;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['monitoring_stations','tank_installations','community_reports','gis_water_points'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS gis_sync_point ON public.%I', t);
    EXECUTE format('CREATE TRIGGER gis_sync_point BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gis_sync_point()', t);
    -- Recompute every point, including clearing invalid or missing locations.
    EXECUTE format('UPDATE public.%I SET gis_point = NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING GIST ((gis_point::extensions.geography))', 'idx_' || t || '_gis_geography', t);
  END LOOP;
END $$;
