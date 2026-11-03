import crypto from 'node:crypto';

const fields = ['name', 'type', 'latitude', 'longitude', 'operational_status', 'source', 'verification_status', 'community', 'district'];
const columns = `id, ${fields.join(', ')}, revision, created_at, updated_at`;
const types = ['BOREHOLE', 'KIOSK', 'PUBLIC_TAP', 'OTHER'];
const statuses = ['UNKNOWN', 'OPERATIONAL', 'NOT_OPERATIONAL'];
const verification = ['UNVERIFIED', 'VERIFIED'];

export class WaterPointError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function text(value, name, required, max, min = 1) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') throw new WaterPointError(400, `${name} must be text`);
  const trimmed = value.trim();
  if (!required && !trimmed) return null;
  if (trimmed.length < min || trimmed.length > max) throw new WaterPointError(400, `${name} must be ${min}–${max} characters`);
  return trimmed;
}
function coordinate(value, name, max) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > max) {
    throw new WaterPointError(400, `Invalid ${name}`);
  }
  return Number(value);
}
export function validateWaterPoint(body, updating = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WaterPointError(400, 'A water point object is required');
  const allowed = new Set([...fields, 'confirm_verified', ...(updating ? ['revision'] : [])]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new WaterPointError(400, 'Unknown water point field');
  const data = {
    name: text(body.name, 'Name', true, 255),
    type: body.type,
    latitude: coordinate(body.latitude, 'latitude', 90),
    longitude: coordinate(body.longitude, 'longitude', 180),
    operational_status: body.operational_status,
    source: text(body.source, 'Source or verification evidence', true, 500, 5),
    verification_status: body.verification_status,
    community: text(body.community, 'Community', false, 100),
    district: text(body.district, 'District', false, 100)
  };
  if (data.latitude === 0 && data.longitude === 0) throw new WaterPointError(400, 'Zero coordinates are not accepted');
  if (!types.includes(data.type) || !statuses.includes(data.operational_status) || !verification.includes(data.verification_status)) throw new WaterPointError(400, 'Invalid type, operational status or verification status');
  if (body.confirm_verified !== undefined && typeof body.confirm_verified !== 'boolean') throw new WaterPointError(400, 'Invalid verification confirmation');
  if (data.verification_status === 'VERIFIED' && body.confirm_verified !== true) throw new WaterPointError(400, 'Confirm the location has been verified');
  if (updating && (!Number.isSafeInteger(body.revision) || body.revision < 1)) throw new WaterPointError(400, 'Valid revision required');
  return data;
}

export async function listWaterPoints(db, query) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new WaterPointError(400, 'Invalid pagination');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new WaterPointError(400, 'Invalid pagination');
    return n;
  };
  const limit = parse(query.limit, 20, 100), offset = parse(query.offset, 0, 100000);
  if (!limit) throw new WaterPointError(400, 'Invalid pagination');
  const rows = await db.all(`SELECT ${columns} FROM gis_water_points ORDER BY name, id LIMIT ? OFFSET ?`, limit + 1, offset);
  return { data: rows.slice(0, limit), meta: { limit, offset, hasMore: rows.length > limit } };
}

export async function saveWaterPoint(db, actorId, body, id = null) {
  const data = validateWaterPoint(body, Boolean(id));
  return db.transaction(async tx => {
    let before = null;
    const pointId = id || `wp-${crypto.randomUUID()}`;
    if (id) {
      before = await tx.get(`SELECT ${columns} FROM gis_water_points WHERE id = ?`, id);
      if (!before) throw new WaterPointError(404, 'Water point not found');
      if (before.revision !== body.revision) throw new WaterPointError(409, 'Water point changed. Reload before saving.');
      // A changed location or source must be reviewed again in a separate step.
      if (before.verification_status === 'VERIFIED' && data.verification_status === 'VERIFIED' &&
          (Number(before.latitude) !== data.latitude || Number(before.longitude) !== data.longitude || before.source !== data.source)) {
        throw new WaterPointError(400, 'Changing coordinates or source requires marking the location unverified and reviewing it again');
      }
      const result = await tx.run(`UPDATE gis_water_points SET ${fields.map(field => `${field} = ?`).join(', ')}, revision = revision + 1, updated_at = datetime('now') WHERE id = ? AND revision = ?`, ...fields.map(field => data[field]), id, body.revision);
      if ((result.rowCount ?? result.changes) !== 1) throw new WaterPointError(409, 'Water point changed. Reload before saving.');
    } else {
      await tx.run(`INSERT INTO gis_water_points (id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`, pointId, ...fields.map(field => data[field]));
    }
    const after = await tx.get(`SELECT ${columns} FROM gis_water_points WHERE id = ?`, pointId);
    await tx.run('INSERT INTO gis_water_point_events (id, water_point_id, actor_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)', `wpe-${crypto.randomUUID()}`, pointId, actorId, id ? 'UPDATED' : 'CREATED', before ? JSON.stringify(before) : null, JSON.stringify(after));
    return after;
  });
}
