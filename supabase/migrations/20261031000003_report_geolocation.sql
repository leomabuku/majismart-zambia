-- ==============================================================================
-- MAJISMART / SMARTWATER: report geolocation quality + photo evidence
--
-- Customers report leaks from the Android app or the dashboard. The app now
-- attaches the device's real GPS fix (and optionally a photo) so dispatch teams
-- get a map pin and a picture instead of a typed street name.
--
--   location_accuracy_m  radius of the GPS fix in metres (nullable for manual)
--   location_source      GPS | NETWORK | MANUAL - how the pin was obtained
--   image_url            already existed; now also carries inline photo
--                        evidence as a data: URL when Supabase Storage is not
--                        configured
-- ==============================================================================

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS location_accuracy_m NUMERIC(8, 2);

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS location_source TEXT;

-- Reports are queried by both dimensions: "everything open" and "everything in
-- this community", and the map only cares about rows that have a pin.
CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.community_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_geolocated
  ON public.community_reports(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
