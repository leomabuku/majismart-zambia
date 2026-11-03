// PostGIS geography distances use metres. SQLite is a local, unindexed spherical approximation.
const MAX_RADIUS = 50000;
function number(value) {
  if (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return NaN;
  return Number(value);
}
export function parseNearby(query) {
  const latitude = number(query.latitude), longitude = number(query.longitude);
  const radiusMeters = query.radiusMeters === undefined ? 5000 : number(query.radiusMeters);
  const limit = query.limit === undefined ? 50 : number(query.limit);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) throw new Error('Invalid latitude or longitude');
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_RADIUS) throw new Error('radiusMeters must be greater than 0 and at most 50000');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100');
  return { latitude, longitude, radiusMeters, limit };
}
export function haversine(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
const definitions = {
  'water-points': {
    table: 'gis_water_points w', point: 'w',
    fields: 'w.id, w.name, w.type, w.latitude, w.longitude, w.operational_status, w.source, w.verification_status, w.community, w.district, w.updated_at',
    where: "w.verification_status = 'VERIFIED'"
  },
  reports: {
    table: 'community_reports r LEFT JOIN report_submission_details d ON d.report_id = r.id', point: 'r',
    fields: "r.id, r.latitude, r.longitude, r.category, r.status, r.created_at, COALESCE(d.provenance, 'UNKNOWN') AS provenance",
    where: "r.status <> 'REJECTED' AND COALESCE(d.provenance, 'UNKNOWN') NOT IN ('SIMULATED','TEST')"
  }
};
export async function nearby(db, mode, kind, input) {
  const def = definitions[kind];
  if (!def) throw new Error('Unknown GIS layer');
  let rows;
  if (mode === 'supabase') {
    // The geography expression exactly matches the GiST indexes in the migration.
    const center = 'extensions.ST_SetSRID(extensions.ST_MakePoint(?, ?), 4326)::extensions.geography';
    rows = await db.all(`SELECT ${def.fields}, extensions.ST_Distance(${def.point}.gis_point::extensions.geography, ${center}) AS distance_meters
      FROM ${def.table} WHERE ${def.where} AND ${def.point}.gis_point IS NOT NULL
      AND extensions.ST_DWithin(${def.point}.gis_point::extensions.geography, ${center}, ?)
      ORDER BY distance_meters, ${def.point}.id LIMIT ?`, input.longitude, input.latitude, input.longitude, input.latitude, input.radiusMeters, input.limit);
  } else if (mode === 'sqlite') {
    rows = await db.all(`SELECT ${def.fields} FROM ${def.table} WHERE ${def.where}
      AND ${def.point}.latitude BETWEEN -90 AND 90 AND ${def.point}.longitude BETWEEN -180 AND 180
      AND (${def.point}.latitude <> 0 OR ${def.point}.longitude <> 0)`);
    rows = rows.map(row => ({ ...row, distance_meters: haversine(input.latitude, input.longitude, Number(row.latitude), Number(row.longitude)) }))
      .filter(row => row.distance_meters <= input.radiusMeters)
      .sort((a,b) => a.distance_meters - b.distance_meters || String(a.id).localeCompare(String(b.id))).slice(0, input.limit);
  } else throw new Error('Unsupported database mode');
  return { type: 'FeatureCollection', features: rows.map(({ latitude, longitude, ...properties }) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] }, properties
  })) };
}
