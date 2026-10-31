-- Explicit device-reported faults, separate from water-level observations.
CREATE TABLE IF NOT EXISTS sensor_fault_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES monitoring_devices(id) ON DELETE CASCADE,
  tank_id TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  fault_code TEXT NOT NULL CHECK (fault_code IN ('TIMEOUT', 'INVALID_SAMPLE')),
  measured_at TEXT,
  provenance TEXT NOT NULL CHECK (provenance IN ('OPERATIONAL', 'SIMULATED', 'TEST', 'UNKNOWN')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sensor_fault_tank_time ON sensor_fault_events(tank_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sensor_fault_provenance_time ON sensor_fault_events(provenance, created_at);
ALTER TABLE public.sensor_fault_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sensor_fault_events FROM anon, authenticated;
