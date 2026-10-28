import { db, hashPassword } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';
import { AlertService } from '../services/alertService.js';
import crypto from 'node:crypto';

export class IoTController {
  /**
   * INGESTION ENDPOINT: POST /api/iot/readings
   * Receives telemetry payload matching the photo format:
   * {
   *   "device_id": "ESP32_001",
   *   "tank_id": "TANK_001",
   *   "distance_cm": 15.5,
   *   "water_depth_cm": 34.5,
   *   "water_level_percent": 69,
   *   "status": "NORMAL"
   * }
   */
  static async ingestReading(req, res) {
    try {
      const payload = req.body;

      // 1. Authenticate Device (via x-api-key or Authorization Bearer header)
      const apiKeyHeader = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/, ''));
      const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '';
      const configuredKey = process.env.IOT_API_KEY;
      if (!configuredKey) {
        return res.status(503).json({ success: false, error: 'Device authentication is not configured' });
      }
      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Device API key is required'
        });
      }

      // 2. Strict Input Validation based on the photo specification
      const { device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status } = payload;

      if (!device_id || typeof device_id !== 'string') {
        return res.status(400).json({ success: false, error: "Validation error: 'device_id' is required as a string." });
      }
      if (!tank_id || typeof tank_id !== 'string') {
        return res.status(400).json({ success: false, error: "Validation error: 'tank_id' is required as a string." });
      }
      if (typeof distance_cm !== 'number' || isNaN(distance_cm) || distance_cm < 0) {
        return res.status(400).json({ success: false, error: "Validation error: 'distance_cm' must be a non-negative number." });
      }
      if (typeof water_depth_cm !== 'number' || isNaN(water_depth_cm) || water_depth_cm < 0) {
        return res.status(400).json({ success: false, error: "Validation error: 'water_depth_cm' must be a non-negative number." });
      }
      if (typeof water_level_percent !== 'number' || isNaN(water_level_percent) || water_level_percent < 0 || water_level_percent > 100) {
        return res.status(400).json({ success: false, error: "Validation error: 'water_level_percent' must be between 0 and 100." });
      }

      // 3. Look up or auto-register Tank
      let tank = await db.prepare('SELECT * FROM tanks WHERE tank_id_code = ?').get(tank_id);
      if (!tank) {
        const newTankId = 'tank-' + crypto.randomUUID().slice(0, 8);
        const totalHeight = Number((distance_cm + water_depth_cm).toFixed(2)) || 50.0;
        const provisionalPercent = Math.max(0, Math.min(100, Number(((water_depth_cm / totalHeight) * 100).toFixed(2))));
        const provisionalStatus = provisionalPercent <= 15 ? 'CRITICAL' : (provisionalPercent <= 25 ? 'LOW' : 'NORMAL');
        await db.prepare(`
          INSERT INTO tanks (id, tank_id_code, name, total_height_cm, usable_height_cm, current_water_depth_cm, current_water_percent, current_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newTankId, tank_id, `Auto-registered Tank ${tank_id}`, totalHeight, totalHeight, water_depth_cm, provisionalPercent, provisionalStatus);
        tank = await db.prepare('SELECT * FROM tanks WHERE id = ?').get(newTankId);
      }

      const usableHeight = Number(tank.usable_height_cm || tank.total_height_cm || 50.0);
      const sensorOffset = Number(tank.sensor_offset_cm || 0.0);
      const computedDepth = Math.max(0, Math.min(usableHeight, Number((usableHeight - distance_cm - sensorOffset).toFixed(2))));
      const computedPercent = Math.max(0, Math.min(100, Number(((computedDepth / usableHeight) * 100).toFixed(2))));
      const depthDelta = Math.abs(computedDepth - water_depth_cm);
      const percentDelta = Math.abs(computedPercent - water_level_percent);

      if (depthDelta > 5 || percentDelta > 15) {
        return res.status(400).json({
          success: false,
          error: 'Validation error: reading is inconsistent with calibrated tank geometry.'
        });
      }

      const lowThreshold = Number(tank.low_threshold_percent || 25);
      const criticalThreshold = Number(tank.critical_threshold_percent || 15);
      const statusMap = { SAFE: 'NORMAL', WARNING: 'LOW' };
      const incomingStatus = typeof status === 'string' ? status.toUpperCase() : '';
      const mappedStatus = statusMap[incomingStatus] || incomingStatus;
      const validStatuses = ['NORMAL', 'LOW', 'CRITICAL', 'SENSOR_ERROR'];
      const normalizedStatus = validStatuses.includes(mappedStatus)
        ? mappedStatus
        : (computedPercent <= criticalThreshold ? 'CRITICAL' : (computedPercent <= lowThreshold ? 'LOW' : 'NORMAL'));

      // 4. Look up or auto-register Device
      let device = await db.prepare('SELECT * FROM monitoring_devices WHERE device_id_code = ?').get(device_id);
      const nowIso = new Date().toISOString();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const apiKeyHash = hashPassword(apiKey);

      if (!device) {
        if (apiKey !== configuredKey) {
          return res.status(401).json({
            success: false,
            error: 'Unauthorized: Unknown device must use provisioning key'
          });
        }

        const newDevId = 'dev-' + crypto.randomUUID().slice(0, 8);
        await db.prepare(`
          INSERT INTO monitoring_devices (id, device_id_code, tank_id, api_key_hash, firmware_version, last_seen_at, ip_address, status)
          VALUES (?, ?, ?, ?, 'v1.0.0', datetime('now'), ?, 'ONLINE')
        `).run(newDevId, device_id, tank.id, apiKeyHash, clientIp);
      } else {
        if (device.is_active === 0 || device.is_active === false) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden: Device is deactivated'
          });
        }

        if (device.api_key_hash !== apiKeyHash) {
          return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid device API key'
          });
        }

        if (device.tank_id && device.tank_id !== tank.id) {
          return res.status(409).json({
            success: false,
            error: 'Conflict: Device is registered to a different tank'
          });
        }

        await db.prepare(`
          UPDATE monitoring_devices 
          SET tank_id = ?, last_seen_at = datetime('now'), ip_address = ?, status = 'ONLINE', updated_at = datetime('now')
          WHERE id = ?
        `).run(tank.id, clientIp, device.id);
      }

      // 5. Record the Reading
      const readingId = 'rd-' + crypto.randomUUID().slice(0, 10);
      await db.transaction(async (tx) => {
        await tx.run(`
        INSERT INTO water_level_readings (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        readingId,
        device_id,
        tank_id,
        distance_cm,
        computedDepth,
        computedPercent,
        normalizedStatus,
        JSON.stringify(payload)
        );

        await tx.run(`
        UPDATE tanks 
        SET current_water_depth_cm = ?, current_water_percent = ?, current_status = ?, last_reading_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
        `, computedDepth, computedPercent, normalizedStatus, tank.id);
      });

      // 7. Check Alerts & Threshold transitions
      await AlertService.processReading(tank, {
        device_id,
        tank_id,
        distance_cm,
        water_depth_cm: computedDepth,
        water_level_percent: computedPercent,
        status: normalizedStatus
      });

      // 8. Realtime Broadcast to Web Dashboard & Mobile App
      const broadcastPayload = {
        reading_id: readingId,
        device_id,
        tank_id,
        tank_name: tank.name,
        distance_cm,
        water_depth_cm: computedDepth,
        water_level_percent: computedPercent,
        status: normalizedStatus,
        recorded_at: nowIso
      };

      realtime.broadcast('NEW_READING', broadcastPayload);
      realtime.broadcast('TANK_UPDATED', {
        id: tank.id,
        tank_id_code: tank_id,
        name: tank.name,
        current_water_depth_cm: computedDepth,
        current_water_percent: computedPercent,
        current_status: normalizedStatus,
        last_reading_at: nowIso
      });

      return res.status(201).json({
        success: true,
        message: 'Telemetry reading accepted and synchronized',
        data: broadcastPayload
      });

    } catch (err) {
      console.error('[IoTController] Ingestion error:', err);
      return res.status(500).json({
        success: false,
        error: 'Server error processing telemetry reading'
      });
    }
  }

  /**
   * GET /api/iot/history/:tank_id?range=24h|7d|30d
   */
  static async getReadingsHistory(req, res) {
    try {
      const { tank_id } = req.params;
      const range = req.query.range || '24h';

      let timeModifier = "-24 hours";
      if (range === '7d') timeModifier = "-7 days";
      if (range === '30d') timeModifier = "-30 days";

      const since = new Date(Date.now() - ({ '-24 hours': 24, '-7 days': 168, '-30 days': 720 }[timeModifier] || 24) * 3600000).toISOString();
      const readings = await db.prepare(`
        SELECT id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, created_at
        FROM water_level_readings
        WHERE tank_id = ? AND created_at >= ?
        ORDER BY created_at ASC
      `).all(tank_id, since);

      return res.json({ success: true, count: readings.length, data: readings });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}
