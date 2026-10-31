import { db, hashPassword, databaseMode } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';
import { AlertService } from '../services/alertService.js';
import crypto from 'node:crypto';
import { calculateMeasurement } from '../lib/tankGeometry.js';
import { classifyCondition } from '../lib/tankCondition.js';

export class IoTController {
  static async ingestReading(req, res) {
    try {
      const payload = req.body || {};
      const { device_id, tank_id, distance_cm, measured_at, sensor_fault } = payload;
      const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!key || typeof key !== 'string') return res.status(401).json({success:false,error:'Device credential required'});
      if (typeof device_id !== 'string' || typeof tank_id !== 'string' || !device_id || !tank_id) return res.status(400).json({success:false,error:'device_id and tank_id are required'});
      if (sensor_fault != null) {
        if (!['TIMEOUT', 'INVALID_SAMPLE'].includes(sensor_fault) || distance_cm != null) return res.status(400).json({success:false,error:'Invalid sensor fault payload'});
      } else if (typeof distance_cm !== 'number' || !Number.isFinite(distance_cm)) return res.status(400).json({success:false,error:'A finite distance_cm is required'});
      if (measured_at != null && (typeof measured_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(measured_at) || !Number.isFinite(Date.parse(measured_at)) || Date.parse(measured_at) > Date.now() + 300000 || Date.parse(measured_at) < Date.now() - 300000)) return res.status(400).json({success:false,error:'Invalid or stale measurement timestamp'});
      const device = await db.prepare('SELECT * FROM monitoring_devices WHERE device_id_code = ?').get(device_id);
      const digest = hashPassword(key);
      if (!device || typeof device.api_key_hash !== 'string' || device.api_key_hash.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(device.api_key_hash), Buffer.from(digest))) return res.status(401).json({success:false,error:'Invalid device credential'});
      if (device.is_active === false || device.is_active === 0) return res.status(403).json({success:false,error:'Device revoked'});
      const tank = await db.prepare('SELECT * FROM tanks WHERE tank_id_code = ?').get(tank_id);
      if (!tank || device.tank_id !== tank.id) return res.status(403).json({success:false,error:'Device is not assigned to this tank'});
      const config = await db.prepare('SELECT * FROM tank_installations WHERE tank_id = ?').get(tank.id);
      if (!config) return res.status(422).json({success:false,error:'Tank geometry and calibration must be registered first'});
      if (req.headers['x-simulation'] === 'true' && config.provenance !== 'SIMULATED' && config.provenance !== 'TEST') return res.status(403).json({success:false,error:'Simulation requires a SIMULATED or TEST installation'});
      if (sensor_fault != null) {
        const faultId = 'fault-' + crypto.randomUUID();
        const now = new Date().toISOString();
        await db.transaction(async tx => {
          await tx.run('INSERT INTO sensor_fault_events (id,device_id,tank_id,fault_code,measured_at,provenance,created_at) VALUES (?,?,?,?,?,?,?)', faultId,device.id,tank.id,sensor_fault,measured_at || null,config.provenance,now);
          await tx.run("UPDATE monitoring_devices SET last_seen_at = datetime('now'), status = 'ERROR', updated_at = datetime('now') WHERE id = ?",device.id);
          // Preserve last known level and last_reading_at: a fault is not a water reading.
          await tx.run("UPDATE tanks SET current_status = 'SENSOR_ERROR', updated_at = datetime('now') WHERE id = ?",tank.id);
          await tx.run("UPDATE water_alerts SET status = 'RESOLVED', resolved_at = datetime('now') WHERE tank_id = ? AND alert_type = 'DEVICE_OFFLINE' AND status IN ('ACTIVE','ACKNOWLEDGED')",tank.id);
          const existing = await tx.get("SELECT id FROM water_alerts WHERE tank_id = ? AND alert_type = 'SENSOR_ERROR' AND status IN ('ACTIVE','ACKNOWLEDGED')",tank.id);
          if (!existing) await tx.run("INSERT INTO water_alerts (id,tank_id,device_id,alert_type,severity,title,message,status) VALUES (?,?,?,'SENSOR_ERROR','WARNING',?,?,'ACTIVE')", 'alt-'+crypto.randomUUID(),tank.id,device_id,`Sensor fault on ${tank.name}`,`The device reported a sensor fault (${sensor_fault}). Inspect the sensor; the last level may be stale.`);
        });
        realtime.broadcast('DEVICE_STATUS_CHANGED', {});
        realtime.broadcast('NEW_ALERT', {});
        return res.status(202).json({success:true,message:'Sensor fault recorded; no water-level reading was created',data:{fault_id:faultId,condition:'SENSOR_ERROR',recorded_at:now}});
      }
      if (distance_cm <= 0 || distance_cm < Number(config.dead_zone_cm)) return res.status(400).json({success:false,error:'Distance falls inside the sensor dead zone'});
      let reading;
      try { reading = calculateMeasurement(config, distance_cm + Number(config.measurement_offset_cm)); }
      catch { return res.status(400).json({success:false,error:'Invalid sensor distance or calibration'}); }
      const condition = classifyCondition(reading.water_level_percent, config.current_condition, {critical:Number(tank.critical_threshold_percent), low:Number(tank.low_threshold_percent), warning:Number(config.warning_threshold), hysteresis:Number(config.hysteresis)});
      // Existing consumers and database constraints do not know WARNING. Keep the
      // legacy field compatible; the exact classification is in condition.
      const status = condition === 'WARNING' ? 'NORMAL' : condition;
      const readingId = 'rd-' + crypto.randomUUID();
      const now = new Date().toISOString();
      await db.transaction(async tx => {
        await tx.run(`INSERT INTO water_level_readings (id,device_id,tank_id,distance_cm,water_depth_cm,water_level_percent,status,raw_payload) VALUES (?,?,?,?,?,?,?,?)`, readingId, device_id, tank_id, distance_cm, reading.water_depth_cm, reading.water_level_percent, status, JSON.stringify({device_id,tank_id,distance_cm,measured_at:measured_at || null}));
        await tx.run(`INSERT INTO telemetry_metadata (reading_id,volume_l,condition,measured_at,provenance) VALUES (?,?,?,?,?)`, readingId, reading.estimated_volume_l, condition, measured_at || null, config.provenance);
        await tx.run(`UPDATE tanks SET current_water_depth_cm = ?, current_water_percent = ?, current_status = ?, last_reading_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, reading.water_depth_cm, reading.water_level_percent, status, tank.id);
        await tx.run(`UPDATE tank_installations SET current_condition = ?, current_volume_l = ?, updated_at = ? WHERE tank_id = ?`, condition, reading.estimated_volume_l, now, tank.id);
        await tx.run(`UPDATE monitoring_devices SET last_seen_at = datetime('now'), status = 'ONLINE', updated_at = datetime('now') WHERE id = ?`, device.id);
      });
      const data = {reading_id:readingId, device_id, tank_id, tank_name:tank.name, distance_cm, water_depth_cm:reading.water_depth_cm, water_level_percent:reading.water_level_percent, estimated_volume_l:reading.estimated_volume_l, condition, status, recorded_at:now, calibration_status:config.installation_status};
      // Notifications are best effort after persistence; failure must not invite a duplicate retry.
      try { await AlertService.processReading(tank, data); } catch (err) { console.error('[IoT] Alert processing failed:', err.message); }
      realtime.broadcast('NEW_READING', data);
      realtime.broadcast('TANK_UPDATED', {id:tank.id, tank_id_code:tank_id, name:tank.name, current_water_depth_cm:reading.water_depth_cm, current_water_percent:reading.water_level_percent, current_status:status, current_condition:condition, current_volume_l:reading.estimated_volume_l, last_reading_at:now});
      return res.status(201).json({success:true,message:'Telemetry reading accepted and synchronized',data});
    } catch (err) { console.error('[IoTController] Ingestion error:', err); return res.status(500).json({success:false,error:'Server error processing telemetry reading'}); }
  }

  /**
   * GET /api/iot/history/:tank_id?range=24h|7d|30d
   */
  static async getReadingsHistory(req, res) {
    try {
      const { tank_id } = req.params;
      const access = await db.prepare('SELECT i.owner_id FROM tanks t LEFT JOIN tank_installations i ON i.tank_id = t.id WHERE t.tank_id_code = ?').get(tank_id);
      if (!access || (access.owner_id && req.user?.role !== 'admin' && access.owner_id !== req.user?.id)) return res.status(404).json({success:false,error:'Tank not found'});
      const range = req.query.range || '24h';

      let timeModifier = "-24 hours";
      if (range === '7d') timeModifier = "-7 days";
      if (range === '30d') timeModifier = "-30 days";

      const since = new Date(Date.now() - ({ '-24 hours': 24, '-7 days': 168, '-30 days': 720 }[timeModifier] || 24) * 3600000).toISOString();
      // SQLite contains both SQL datetime strings and ISO strings. Comparing
      // them lexically omits some valid readings near the start of the window.
      const sinceClause = databaseMode === 'supabase' ? 'created_at >= ?' : 'julianday(created_at) >= julianday(?)';
      const orderColumn = databaseMode === 'supabase' ? 'created_at' : 'julianday(created_at)';
      const readings = await db.prepare(`
        SELECT id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, created_at
        FROM water_level_readings
        WHERE tank_id = ? AND ${sinceClause}
        ORDER BY ${orderColumn} ASC
      `).all(tank_id, since);

      return res.json({ success: true, count: readings.length, data: readings });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}
