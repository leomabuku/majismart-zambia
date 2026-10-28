import { db } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';

export class AlertController {
  static async getAlerts(req, res) {
    try {
      const { status, severity } = req.query;
      let sql = `
        SELECT a.*, t.name as tank_name, t.tank_id_code, s.name as station_name
        FROM water_alerts a
        LEFT JOIN tanks t ON a.tank_id = t.id
        LEFT JOIN monitoring_stations s ON t.station_id = s.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
      }
      if (severity) {
        sql += ' AND a.severity = ?';
        params.push(severity);
      }

      sql += ' ORDER BY a.created_at DESC';
      const alerts = await db.prepare(sql).all(...params);

      return res.json({ success: true, count: alerts.length, data: alerts });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  static async acknowledgeAlert(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user ? req.user.id : null;

      await db.prepare(`
        UPDATE water_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = datetime('now')
        WHERE id = ?
      `).run(adminId, id);

      const updated = await db.prepare('SELECT * FROM water_alerts WHERE id = ?').get(id);
      realtime.broadcast('ALERT_UPDATED', updated);

      return res.json({ success: true, message: 'Alert acknowledged', data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  static async resolveAlert(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user ? req.user.id : null;

      await db.prepare(`
        UPDATE water_alerts
        SET status = 'RESOLVED', resolved_by = ?, resolved_at = datetime('now')
        WHERE id = ?
      `).run(adminId, id);

      const updated = await db.prepare('SELECT * FROM water_alerts WHERE id = ?').get(id);
      realtime.broadcast('ALERT_RESOLVED', updated);

      return res.json({ success: true, message: 'Alert resolved', data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}
