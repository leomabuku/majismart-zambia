// DEMO TELEMETRY (opt-in via DEMO_MODE=true)
//
// A freshly seeded database has no hardware attached, so within one offline-timeout
// window the device monitor marks every tank OFFLINE and raises an alert per device.
// That is correct behaviour for a real utility, but it makes a public demo look broken.
//
// When DEMO_MODE is enabled this service emits a plausible random walk reading for each
// seeded tank on an interval, through the *real* ingestion pipeline - so device auth,
// threshold alerts, tank updates, websocket/SSE broadcast and charts all behave exactly
// as they do with hardware. Never enable it on an installation with real sensors.

import { db } from '../database/db.js';
import { IoTController } from '../controllers/iotController.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function fakeResponse() {
  const captured = { statusCode: 200, body: null };
  const res = {
    status(code) {
      captured.statusCode = code;
      return res;
    },
    json(body) {
      captured.body = body;
      return res;
    }
  };
  return { res, captured };
}

export class DemoTelemetryService {
  static timer = null;
  static warmupTimer = null;
  static levels = new Map();
  static failureLogged = false;

  static get enabled() {
    return (process.env.DEMO_MODE || '').toLowerCase() === 'true';
  }

  static get intervalSeconds() {
    return Math.max(Number(process.env.DEMO_INTERVAL_SECONDS || 90), 15);
  }

  static start() {
    if (!this.enabled || this.timer) return;

    console.warn(
      `[DemoTelemetry] DEMO_MODE is ON - synthetic readings every ${this.intervalSeconds}s. `
      + 'Disable DEMO_MODE before connecting real sensors.'
    );

    // First tick shortly after boot so the dashboard is live within seconds.
    this.warmupTimer = setTimeout(() => this.tick(), 5000);
    this.warmupTimer.unref?.();

    this.timer = setInterval(() => this.tick(), this.intervalSeconds * 1000);
    this.timer.unref?.();
  }

  static stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.timer = null;
    this.warmupTimer = null;
  }

  static async tick() {
    try {
      const rows = await db.prepare(`
        SELECT t.tank_id_code, t.usable_height_cm, t.total_height_cm, t.sensor_offset_cm,
               t.current_water_percent, t.low_threshold_percent, t.critical_threshold_percent,
               d.device_id_code, i.empty_distance_cm, i.full_distance_cm, i.measurement_offset_cm
        FROM tanks t
        JOIN monitoring_devices d ON d.tank_id = t.id
        JOIN tank_installations i ON i.tank_id = t.id
        WHERE d.is_active = TRUE AND i.provenance = 'SIMULATED'
        ORDER BY t.tank_id_code ASC
      `).all();

      for (const tank of rows) {
        await this.emitReading(tank);
      }
      this.failureLogged = false;
    } catch (error) {
      if (!this.failureLogged) {
        console.error('[DemoTelemetry] Tick failed:', error.message);
        this.failureLogged = true;
      }
    }
  }

  static async emitReading(tank) {
    const usable = Number(tank.usable_height_cm || tank.total_height_cm || 50);
    const offset = Number(tank.sensor_offset_cm || 0);
    const baseline = Number(tank.current_water_percent || 60);

    // Mean-reverting random walk: alive, but the demo stays near its seeded levels.
    const previous = this.levels.get(tank.tank_id_code) ?? clamp(baseline, 5, 95);
    const drift = (Math.random() - 0.5) * 4 + (baseline - previous) * 0.2;
    const percent = Number(clamp(previous + drift, 3, 97).toFixed(1));
    this.levels.set(tank.tank_id_code, percent);

    const depth = Number(((usable * percent) / 100).toFixed(2));
    const distance = Number((Number(tank.empty_distance_cm) - (Number(tank.empty_distance_cm) - Number(tank.full_distance_cm)) * percent / 100 - Number(tank.measurement_offset_cm)).toFixed(2));

    const low = Number(tank.low_threshold_percent || 25);
    const critical = Number(tank.critical_threshold_percent || 15);
    const status = percent <= critical ? 'CRITICAL' : (percent <= low ? 'LOW' : 'NORMAL');

    const { res, captured } = fakeResponse();
    const req = {
      body: {
        device_id: tank.device_id_code,
        tank_id: tank.tank_id_code,
        distance_cm: distance,
        water_depth_cm: depth,
        water_level_percent: percent,
        status
      },
      headers: {
        'x-api-key': process.env.IOT_API_KEY,
        'x-simulation': 'true',
        'x-forwarded-for': 'demo-telemetry'
      },
      socket: { remoteAddress: '127.0.0.1' }
    };

    await IoTController.ingestReading(req, res);

    if (captured.statusCode >= 400) {
      console.warn(
        `[DemoTelemetry] ${tank.device_id_code}/${tank.tank_id_code} rejected `
        + `(${captured.statusCode}): ${captured.body?.error || 'unknown error'}`
      );
    }
  }
}
