import { db, databaseMode } from '../database/db.js';
import { nearby, parseNearby } from '../services/geospatialService.js';

export async function getNearby(req, res) {
  let input;
  try { input = parseNearby(req.query, req.params.layer); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  try {
    const data = await nearby(db, databaseMode, req.params.layer, input);
    return res.json({ success: true, data, meta: { ...input, method: databaseMode === 'sqlite' ? 'spherical approximation (development)' : 'PostGIS geography', truncated: data.features.length === input.limit } });
  } catch (error) {
    console.error('[GIS] Query unavailable:', error.message);
    return res.status(503).json({ success: false, error: 'GIS data unavailable. Check database mode and migrations.' });
  }
}

import { listWaterPoints, saveWaterPoint, WaterPointError } from '../services/waterPointService.js';
function handleWaterPointError(res, error) {
  if (error instanceof WaterPointError) return res.status(error.status).json({ success: false, error: error.message });
  console.error('[GIS] Water point operation unavailable:', error.message);
  return res.status(503).json({ success: false, error: 'Water point management unavailable. Check database migrations.' });
}
export async function listPoints(req, res) {
  try { return res.json({ success: true, ...await listWaterPoints(db, req.query) }); }
  catch (error) { return handleWaterPointError(res, error); }
}
export async function createPoint(req, res) {
  try { return res.status(201).json({ success: true, data: await saveWaterPoint(db, req.user.id, req.body) }); }
  catch (error) { return handleWaterPointError(res, error); }
}
export async function updatePoint(req, res) {
  if (!/^wp-[0-9a-f-]{36}$/.test(req.params.id) && !/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid water point ID' });
  try { return res.json({ success: true, data: await saveWaterPoint(db, req.user.id, req.body, req.params.id) }); }
  catch (error) { return handleWaterPointError(res, error); }
}
