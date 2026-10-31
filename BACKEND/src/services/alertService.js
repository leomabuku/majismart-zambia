import { db } from '../database/db.js';
import { realtime } from './realtimeService.js';
import crypto from 'node:crypto';

export class AlertService {
  /**
   * Process a water level reading and generate or resolve alerts as needed.
   */
  static async processReading(tank, reading) {
    const percent = reading.water_level_percent;
    const lowThreshold = tank.low_threshold_percent || 25.0;
    const critThreshold = tank.critical_threshold_percent || 15.0;
    const recovThreshold = tank.recovery_threshold_percent || 35.0;

    // Check existing active alerts for this tank
    const activeAlerts = await db.prepare(`
      SELECT * FROM water_alerts 
      WHERE tank_id = ? AND status = 'ACTIVE'
    `).all(tank.id);

    // Telemetry resumed for this tank: close any stale offline alert.
    if (activeAlerts.some(a => a.alert_type === 'DEVICE_OFFLINE')) {
      await db.prepare(`
        UPDATE water_alerts
        SET status = 'RESOLVED', resolved_at = datetime('now')
        WHERE tank_id = ? AND alert_type = 'DEVICE_OFFLINE' AND status = 'ACTIVE'
      `).run(tank.id);

      realtime.broadcast('ALERT_RESOLVED', {
        tank_id: tank.id,
        tank_name: tank.name,
        reason: 'DEVICE_ONLINE',
        resolved_at: new Date().toISOString()
      });
    }

    // Recovery handling below must only consider water-level alerts. Counting every
    // active alert made each reading emit a new WATER_RECOVERED alert whenever a
    // DEVICE_OFFLINE alert existed for the tank.
    const levelAlerts = activeAlerts.filter(
      (a) => a.alert_type === 'LOW_WATER' || a.alert_type === 'CRITICAL_WATER'
    );
    const hasCriticalAlert = levelAlerts.some(a => a.alert_type === 'CRITICAL_WATER');
    const hasLowAlert = levelAlerts.some(a => a.alert_type === 'LOW_WATER');

    // Case 1: Critical Threshold Breach (<= 15%)
    if (reading.condition ? reading.condition === 'CRITICAL' : percent <= critThreshold) {
      if (!hasCriticalAlert) {
        // Resolve any lower severity alert first
        await db.prepare(`
          UPDATE water_alerts 
          SET status = 'RESOLVED', resolved_at = datetime('now')
          WHERE tank_id = ? AND alert_type = 'LOW_WATER' AND status = 'ACTIVE'
        `).run(tank.id);

        const alertId = 'alt-' + crypto.randomUUID().slice(0, 8);
        const title = `CRITICAL: Water level at ${percent}% on ${tank.name}`;
        const message = `Tank water level has dropped to ${percent}% (${reading.water_depth_cm}cm depth), below critical threshold of ${critThreshold}%. Risk of immediate water outage.`;

        await db.prepare(`
          INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status)
          VALUES (?, ?, ?, 'CRITICAL_WATER', 'CRITICAL', ?, ?, 'ACTIVE')
        `).run(alertId, tank.id, reading.device_id, title, message);

        realtime.broadcast('NEW_ALERT', {
          id: alertId,
          tank_id: tank.id,
          tank_name: tank.name,
          device_id: reading.device_id,
          alert_type: 'CRITICAL_WATER',
          severity: 'CRITICAL',
          title,
          message,
          created_at: new Date().toISOString()
        });
      }
    }
    // Case 2: Low Threshold Breach (between critThreshold and lowThreshold)
    else if (reading.condition ? reading.condition === 'LOW' : percent <= lowThreshold) {
      if (!hasLowAlert && !hasCriticalAlert) {
        const alertId = 'alt-' + crypto.randomUUID().slice(0, 8);
        const title = `WARNING: Low water level at ${percent}% on ${tank.name}`;
        const message = `Tank water level is at ${percent}% (${reading.water_depth_cm}cm depth), below warning threshold of ${lowThreshold}%. Inflow replenishment needed.`;

        await db.prepare(`
          INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status)
          VALUES (?, ?, ?, 'LOW_WATER', 'WARNING', ?, ?, 'ACTIVE')
        `).run(alertId, tank.id, reading.device_id, title, message);

        realtime.broadcast('NEW_ALERT', {
          id: alertId,
          tank_id: tank.id,
          tank_name: tank.name,
          device_id: reading.device_id,
          alert_type: 'LOW_WATER',
          severity: 'WARNING',
          title,
          message,
          created_at: new Date().toISOString()
        });
      }
    }
    // Case 3: Water Level Recovered (>= recovery threshold)
    else if (reading.condition ? ['NORMAL','WARNING'].includes(reading.condition) : percent >= recovThreshold) {
      if (levelAlerts.length > 0) {
        // Resolve all active low/critical alerts for this tank
        await db.prepare(`
          UPDATE water_alerts 
          SET status = 'RESOLVED', resolved_at = datetime('now')
          WHERE tank_id = ? AND status = 'ACTIVE' AND alert_type IN ('LOW_WATER', 'CRITICAL_WATER')
        `).run(tank.id);

        const alertId = 'alt-' + crypto.randomUUID().slice(0, 8);
        const title = `RECOVERED: Water level normalized to ${percent}% on ${tank.name}`;
        const message = `Tank condition has recovered to ${percent}% (${reading.water_depth_cm}cm depth). Supply is stable.`;

        await db.prepare(`
          INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status)
          VALUES (?, ?, ?, 'WATER_RECOVERED', 'INFO', ?, ?, 'RESOLVED')
        `).run(alertId, tank.id, reading.device_id, title, message);

        realtime.broadcast('ALERT_RESOLVED', {
          tank_id: tank.id,
          tank_name: tank.name,
          percent,
          resolved_at: new Date().toISOString()
        });
      }
    }
  }
}
