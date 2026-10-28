import { db } from '../database/db.js';
import crypto from 'node:crypto';

export class StationController {
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

      const deviceStats = await db.prepare(`
        SELECT 
          count(*) as total_devices,
          sum(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online_devices,
          sum(CASE WHEN status = 'OFFLINE' THEN 1 ELSE 0 END) as offline_devices
        FROM monitoring_devices
      `).get();

      const reportStats = await db.prepare(`
        SELECT 
          count(*) as total_reports,
          sum(CASE WHEN status IN ('SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS') THEN 1 ELSE 0 END) as open_reports,
          sum(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved_reports
        FROM community_reports
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

      const populated = await Promise.all(stations.map(async (station) => {
        const tanks = await db.prepare(`
          SELECT t.*, d.device_id_code, d.status as device_status, d.last_seen_at
          FROM tanks t
          LEFT JOIN monitoring_devices d ON t.id = d.tank_id
          WHERE t.station_id = ?
        `).all(station.id);

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
        WHERE t.station_id = ?
      `).all(station.id);

      const recentReports = await db.prepare(`
        SELECT * FROM community_reports 
        WHERE station_id = ? 
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
      const tanks = await db.prepare(`
        SELECT 
          t.*,
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
        ORDER BY t.name ASC
      `).all();

      return res.json({ success: true, count: tanks.length, data: tanks });
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
      const tank = await db.prepare(`
        SELECT 
          t.*,
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
        WHERE t.id = ? OR t.tank_id_code = ?
      `).get(id, id);

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

      return res.json({
        success: true,
        data: {
          ...tank,
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
