import { db, databaseMode } from '../database/db.js';
import { realtime } from './realtimeService.js';
import crypto from 'node:crypto';

export class DeviceMonitorService {
  static timeoutSeconds = parseInt(process.env.DEVICE_OFFLINE_TIMEOUT_SECONDS || '60', 10);
  static intervalTimer = null;

  static start() {
    if (this.intervalTimer) return;

    // Run check every 15 seconds
    this.intervalTimer = setInterval(() => {
      this.checkOfflineDevices();
    }, 15000);

    console.log(`[DeviceMonitor] Started offline heartbeat checker (${this.timeoutSeconds}s threshold)`);
  }

  static stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  static async checkOfflineDevices() {
    try {
      // SQLite stores `datetime('now')` as "YYYY-MM-DD HH:MM:SS" while JavaScript produces
      // "YYYY-MM-DDTHH:MM:SS.sssZ". Compared as text the space sorts before "T", so every
      // device looked stale on its first check and was incorrectly marked OFFLINE.
      // Match the storage format per backend; Postgres parses the ISO form unambiguously.
      const thresholdDate = new Date(Date.now() - this.timeoutSeconds * 1000);
      const timeoutThreshold = databaseMode === 'supabase'
        ? thresholdDate.toISOString()
        : thresholdDate.toISOString().replace('T', ' ').slice(0, 19);

      // Find devices that are marked ONLINE but haven't sent a reading recently
      const staleDevices = await db.prepare(`
        SELECT d.*, t.name as tank_name, t.id as tank_id
        FROM monitoring_devices d
        LEFT JOIN tanks t ON d.tank_id = t.id
        WHERE d.status = 'ONLINE' 
        AND (d.last_seen_at IS NULL OR d.last_seen_at < ?)
      `).all(timeoutThreshold);

      for (const dev of staleDevices) {
        console.log(`[DeviceMonitor] Device ${dev.device_id_code} is offline (last seen: ${dev.last_seen_at})`);

        await db.prepare(`
          UPDATE monitoring_devices
          SET status = 'OFFLINE', updated_at = datetime('now')
          WHERE id = ?
        `).run(dev.id);

        if (dev.tank_id) {
          await db.prepare(`
            UPDATE tanks
            SET current_status = 'OFFLINE', updated_at = datetime('now')
            WHERE id = ?
          `).run(dev.tank_id);

          // Check if an offline alert already exists
          const existingAlert = await db.prepare(`
            SELECT id FROM water_alerts
            WHERE tank_id = ? AND alert_type = 'DEVICE_OFFLINE' AND status = 'ACTIVE'
          `).get(dev.tank_id);

          if (!existingAlert) {
            const alertId = 'alt-' + crypto.randomUUID().slice(0, 8);
            await db.prepare(`
              INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status)
              VALUES (?, ?, ?, 'DEVICE_OFFLINE', 'WARNING', ?, ?, 'ACTIVE')
            `).run(
              alertId,
              dev.tank_id,
              dev.device_id_code,
              `Device Offline: ${dev.device_id_code}`,
              `Telemetry transmission stopped for ${dev.device_id_code} on tank ${dev.tank_name || dev.tank_id}. Check power and Wi-Fi.`
            );
          }
        }

        realtime.broadcast('DEVICE_STATUS_CHANGED', {
          device_id_code: dev.device_id_code,
          status: 'OFFLINE',
          tank_id: dev.tank_id,
          last_seen_at: dev.last_seen_at
        });
      }
    } catch (err) {
      console.error('[DeviceMonitor] Error during heartbeat check:', err.message);
    }
  }
}
