import { db } from '../database/db.js';
import { parseStoredTimestamp } from '../lib/timestamps.js';
import crypto from 'node:crypto';
import { classifyCondition } from '../lib/tankCondition.js';

const visibleTank = req => req.user?.role === 'admin' ? ['1=1', []] : ['(i.owner_id IS NULL OR i.owner_id = ?)', [req.user?.id || null]];

// A tank is "reporting" when its newest reading is recent, regardless of which
// path absorbed it. Field units that post to the legacy Supabase edge function
// never touch monitoring_devices, so that row can say OFFLINE while a reading
// arrives every few seconds; trusting the row alone hides live data.
const REPORTING_WINDOW_MS = 10 * 60 * 1000;

function markReportingTanks(rows) {
  const now = Date.now();
  return rows.map((row) => {
    const lastReading = parseStoredTimestamp(row.last_reading_at);
    const reporting = Number.isFinite(lastReading) && (now - lastReading) <= REPORTING_WINDOW_MS;
    if (!reporting) return { ...row, reading_fresh: false };
    return {
      ...row,
      reading_fresh: true,
      device_status: row.device_status === 'ERROR' ? row.device_status : 'ONLINE'
    };
  });
}

export class StationController {
  static async getMyTanks(req, res) {
    try {
      const tanks = await db.prepare(`SELECT t.*, i.current_condition, i.current_volume_l, i.installation_status, i.provenance, s.name AS station_name, d.device_id_code, d.status AS device_status, d.last_seen_at AS device_last_seen_at FROM tanks t JOIN tank_installations i ON i.tank_id = t.id LEFT JOIN monitoring_stations s ON s.id = t.station_id LEFT JOIN monitoring_devices d ON d.tank_id = t.id WHERE i.owner_id = ? ORDER BY t.name`).all(req.user.id);
      const reporting = markReportingTanks(tanks);
      res.json({success:true,data:reporting,count:reporting.length});
    } catch (err) { console.error('[My tanks]',err.message); res.status(500).json({success:false,error:'Unable to load tanks'}); }
  }

  /**
   * GET /api/dashboard/summary
   * Provides high-level metrics for dashboard cards
   */
  static async getSummary(req, res) {
    try {
      const stationCount = (await db.prepare("SELECT count(*) as count FROM monitoring_stations WHERE status = 'ACTIVE'").get()).count;

      const tankStats = await db.prepare(`
        SELECT
          count(*) as total_tanks,
          sum(CASE WHEN current_status = 'NORMAL' THEN 1 ELSE 0 END) as normal_tanks,
          sum(CASE WHEN current_status = 'LOW' THEN 1 ELSE 0 END) as low_tanks,
          sum(CASE WHEN current_status = 'CRITICAL' THEN 1 ELSE 0 END) as critical_tanks,
          sum(CASE WHEN current_status = 'OFFLINE' THEN 1 ELSE 0 END) as offline_tanks
        FROM tanks
      `).get();

      // Device connectivity uses the same "did a reading arrive recently" rule as
      // the cards, so a unit posting straight to Supabase is not counted offline.
      const deviceRows = await db.prepare(`
        SELECT d.id, d.device_id_code, d.status, d.last_seen_at, t.last_reading_at
        FROM monitoring_devices d
        LEFT JOIN tanks t ON t.id = d.tank_id
      `).all();
      const deviceStats = { total_devices: deviceRows.length, online_devices: 0, offline_devices: 0 };
      for (const device of markReportingTanks(deviceRows)) {
        if (device.reading_fresh || device.status === 'ONLINE') deviceStats.online_devices += 1;
        else deviceStats.offline_devices += 1;
      }

      const reportStats = await db.prepare(`
        SELECT
          count(*) as total_reports,
          sum(CASE WHEN status IN ('SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS') THEN 1 ELSE 0 END) as open_reports,
          sum(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved_reports
        FROM community_reports r
        WHERE NOT EXISTS (SELECT 1 FROM report_submission_details d WHERE d.report_id=r.id AND d.provenance IN ('SIMULATED','TEST'))
      `).get();

      const activeAlertsCount = (await db.prepare("SELECT count(*) as count FROM water_alerts WHERE status = 'ACTIVE'").get()).count;

      return res.json({
        success: true,
        summary: {
          total_stations: stationCount,
          total_tanks: tankStats.total_tanks || 0,
          normal_tanks: tankStats.normal_tanks || 0,
          low_tanks: tankStats.low_tanks || 0,
          critical_tanks: tankStats.critical_tanks || 0,
          offline_tanks: tankStats.offline_tanks || 0,
          online_devices: deviceStats.online_devices || 0,
          offline_devices: deviceStats.offline_devices || 0,
          open_reports: reportStats.open_reports || 0,
          resolved_reports: reportStats.resolved_reports || 0,
          active_alerts: activeAlertsCount
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/stations
   */
  static async getAllStations(req, res) {
    try {
      const stations = await db.prepare('SELECT * FROM monitoring_stations ORDER BY name ASC').all();

      const [visibility, viewer] = visibleTank(req);
      const populated = await Promise.all(stations.map(async (station) => {
        const [visibility, viewer] = visibleTank(req);
      const tanks = await db.prepare(`
          SELECT t.*, d.device_id_code, d.status as device_status, d.last_seen_at
          FROM tanks t
          LEFT JOIN monitoring_devices d ON t.id = d.tank_id
          LEFT JOIN tank_installations i ON i.tank_id = t.id
          WHERE t.station_id = ? AND ${visibility}
        `).all(station.id, ...viewer);

        return { ...station, tanks };
      }));

      return res.json({ success: true, count: populated.length, data: populated });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/stations/:id
   */
  static async getStationById(req, res) {
    try {
      const { id } = req.params;
      const station = await db.prepare('SELECT * FROM monitoring_stations WHERE id = ? OR code = ?').get(id, id);

      if (!station) {
        return res.status(404).json({ success: false, error: 'Station not found' });
      }

      const tanks = await db.prepare(`
        SELECT t.*, d.device_id_code, d.status as device_status, d.last_seen_at
        FROM tanks t
        LEFT JOIN monitoring_devices d ON t.id = d.tank_id
        LEFT JOIN tank_installations i ON i.tank_id = t.id
        WHERE t.station_id = ? AND ${visibility}
      `).all(station.id, ...viewer);

      const recentReports = await db.prepare(`
        SELECT id, category, title, description, location_name, latitude, longitude, status, created_at FROM community_reports
        WHERE station_id = ? AND status != 'REJECTED'
        ORDER BY created_at DESC LIMIT 5
      `).all(station.id);

      return res.json({
        success: true,
        data: {
          ...station,
          tanks,
          recent_reports: recentReports
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/tanks
   */
  static async getAllTanks(req, res) {
    try {
      const [visibility, viewer] = visibleTank(req);
      const tanks = await db.prepare(`
        SELECT
          t.*, i.current_volume_l, i.current_condition, i.installation_status, i.provenance, i.latitude, i.longitude,
          s.name as station_name,
          s.code as station_code,
          s.community as station_community,
          s.district as station_district,
          s.latitude as station_latitude,
          s.longitude as station_longitude,
          d.device_id_code,
          d.status as device_status,
          d.last_seen_at as device_last_seen_at
        FROM tanks t
        LEFT JOIN monitoring_stations s ON t.station_id = s.id
        LEFT JOIN monitoring_devices d ON t.id = d.tank_id
        LEFT JOIN tank_installations i ON i.tank_id = t.id
        WHERE ${visibility}
        ORDER BY t.name ASC
      `).all(...viewer);

      const reporting = markReportingTanks(tanks);
      return res.json({ success: true, count: reporting.length, data: reporting });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/tanks/:id
   */
  static async getTankById(req, res) {
    try {
      const { id } = req.params;
      const [visibility, viewer] = visibleTank(req);
      const tank = await db.prepare(`
        SELECT
          t.*, i.current_volume_l, i.current_condition, i.installation_status, i.provenance, i.latitude, i.longitude,
          s.name as station_name,
          s.code as station_code,
          s.community as station_community,
          s.district as station_district,
          s.latitude as station_latitude,
          s.longitude as station_longitude,
          d.device_id_code,
          d.status as device_status,
          d.last_seen_at as device_last_seen_at
        FROM tanks t
        LEFT JOIN monitoring_stations s ON t.station_id = s.id
        LEFT JOIN monitoring_devices d ON t.id = d.tank_id
        LEFT JOIN tank_installations i ON i.tank_id = t.id
        WHERE (t.id = ? OR t.tank_id_code = ?) AND ${visibility}
      `).get(id, id, ...viewer);

      if (!tank) {
        return res.status(404).json({ success: false, error: 'Tank not found' });
      }

      // Recent 24h readings
      const recentReadings = await db.prepare(`
        SELECT distance_cm, water_depth_cm, water_level_percent, status, created_at
        FROM water_level_readings
        WHERE tank_id = ?
        ORDER BY created_at DESC LIMIT 50
      `).all(tank.tank_id_code);

      // Active alerts
      const alerts = await db.prepare(`
        SELECT * FROM water_alerts
        WHERE tank_id = ?
        ORDER BY created_at DESC
      `).all(tank.id);

      const [fresh] = markReportingTanks([tank]);
      return res.json({
        success: true,
        data: {
          ...fresh,
          recent_readings: recentReadings.reverse(),
          alerts
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * PUT /api/tanks/:id (Admin only)
   * Configure tank geometry and threshold boundaries
   */
  static async updateTank(req, res) {
    try {
      const { id } = req.params;
      const { name, total_height_cm, usable_height_cm, capacity_liters, low_threshold_percent, critical_threshold_percent, recovery_threshold_percent } = req.body;

      const tank = await db.prepare('SELECT id FROM tanks WHERE id = ? OR tank_id_code = ?').get(id, id);
      if (!tank) {
        return res.status(404).json({ success: false, error: 'Tank not found' });
      }

      const installation = await db.prepare('SELECT * FROM tank_installations WHERE tank_id = ?').get(tank.id);
      if (installation) {
        if (total_height_cm != null || usable_height_cm != null || capacity_liters != null) return res.status(400).json({success:false,error:'Installed tank geometry cannot be changed via legacy settings; recalibration is required'});
        const original = await db.prepare('SELECT * FROM tanks WHERE id = ?').get(tank.id);
        try { classifyCondition(50, null, { critical:Number(critical_threshold_percent ?? original.critical_threshold_percent), low:Number(low_threshold_percent ?? original.low_threshold_percent), warning:Number(installation.warning_threshold), hysteresis:Number(installation.hysteresis) }); }
        catch { return res.status(400).json({success:false,error:'Invalid threshold configuration'}); }
      }
      await db.prepare(`
        UPDATE tanks
        SET
          name = COALESCE(?, name),
          total_height_cm = COALESCE(?, total_height_cm),
          usable_height_cm = COALESCE(?, usable_height_cm),
          capacity_liters = COALESCE(?, capacity_liters),
          low_threshold_percent = COALESCE(?, low_threshold_percent),
          critical_threshold_percent = COALESCE(?, critical_threshold_percent),
          recovery_threshold_percent = COALESCE(?, recovery_threshold_percent),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(name, total_height_cm, usable_height_cm, capacity_liters, low_threshold_percent, critical_threshold_percent, recovery_threshold_percent, tank.id);

      const updated = await db.prepare('SELECT * FROM tanks WHERE id = ?').get(tank.id);
      return res.json({ success: true, message: 'Tank configuration updated', data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}

