-- Shared SQLite/PostgreSQL tables. Length and distance are cm; volume is litres.
CREATE TABLE IF NOT EXISTS tank_installations (
  tank_id TEXT PRIMARY KEY REFERENCES tanks(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  address TEXT, community TEXT, latitude REAL, longitude REAL,
  shape TEXT NOT NULL CHECK (shape IN ('vertical_cylinder','rectangular','horizontal_cylinder')),
  height_cm REAL NOT NULL, diameter_cm REAL, length_cm REAL, width_cm REAL,
  nominal_capacity_l REAL, empty_distance_cm REAL NOT NULL, full_distance_cm REAL NOT NULL,
  measurement_offset_cm REAL NOT NULL DEFAULT 0, dead_zone_cm REAL NOT NULL DEFAULT 0,
  tolerance_cm REAL NOT NULL DEFAULT 0, sensor_model TEXT, mounting_position TEXT,
  calibration_date TEXT, installer_notes TEXT,
  installation_status TEXT NOT NULL DEFAULT 'AWAITING_CALIBRATION',
  warning_threshold REAL NOT NULL DEFAULT 40, hysteresis REAL NOT NULL DEFAULT 2,
  current_condition TEXT, current_volume_l REAL,
  provenance TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (provenance IN ('OPERATIONAL','SIMULATED','TEST','UNKNOWN')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS telemetry_metadata (
  reading_id TEXT PRIMARY KEY REFERENCES water_level_readings(id) ON DELETE CASCADE,
  volume_l REAL NOT NULL, condition TEXT NOT NULL, measured_at TEXT,
  provenance TEXT NOT NULL CHECK (provenance IN ('OPERATIONAL','SIMULATED','TEST','UNKNOWN'))
);
CREATE INDEX IF NOT EXISTS idx_telemetry_metadata_provenance ON telemetry_metadata(provenance);
ALTER TABLE public.tank_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tank_installations, public.telemetry_metadata FROM anon, authenticated;
