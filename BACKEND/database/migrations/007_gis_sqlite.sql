-- Local development only; spatial calculations are performed by the API.
CREATE TABLE IF NOT EXISTS gis_water_points (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BOREHOLE','KIOSK','PUBLIC_TAP','OTHER')),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  operational_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (operational_status IN ('OPERATIONAL','NOT_OPERATIONAL','UNKNOWN')),
  source TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('VERIFIED','UNVERIFIED')),
  community TEXT, district TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (latitude <> 0 OR longitude <> 0)
);
