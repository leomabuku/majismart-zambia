#!/usr/bin/env node
/**
 * MAJISMART ZAMBIA — IOT HARDWARE TELEMETRY SIMULATOR
 * Simulates ESP32 ultrasonic water tank sensor transmissions matching the photo format:
 * {
 *   "device_id": "ESP32_001",
 *   "tank_id": "TANK_001",
 *   "distance_cm": 15.5,
 *   "water_depth_cm": 34.5,
 *   "water_level_percent": 69,
 *   "status": "NORMAL"
 * }
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000/api/iot/readings';
const API_KEY = process.env.IOT_API_KEY || 'majismart_iot_esp32_device_secret_2026';

const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'once';
const tankArg = args.find(a => a.startsWith('--tank='))?.split('=')[1] || 'TANK_001';
const devArg = args.find(a => a.startsWith('--device='))?.split('=')[1] || 'ESP32_001';

async function sendReading(payload) {
  try {
    console.log(`[SIMULATOR] Transmitting payload to ${BACKEND_URL}:`);
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[SIMULATOR] Ingestion SUCCESS (HTTP ${response.status}):`, result.message);
    } else {
      console.error(`[SIMULATOR] Ingestion FAILED (HTTP ${response.status}):`, result.error);
    }
  } catch (err) {
    console.error(`[SIMULATOR] Network error transmitting reading:`, err.message);
  }
}

async function main() {
  console.log(`=======================================================`);
  console.log(`  MajiSmart Zambia — ESP32 Telemetry Simulator`);
  console.log(`  Target: ${BACKEND_URL} | Mode: ${modeArg}`);
  console.log(`=======================================================\n`);

  if (modeArg === 'once') {
    // Exact payload from photo
    const photoPayload = {
      device_id: devArg,
      tank_id: tankArg,
      distance_cm: 15.5,
      water_depth_cm: 34.5,
      water_level_percent: 69,
      status: "NORMAL"
    };
    await sendReading(photoPayload);
  } else if (modeArg === 'critical') {
    // Critically low tank level
    const criticalPayload = {
      device_id: devArg,
      tank_id: tankArg,
      distance_cm: 45.0,
      water_depth_cm: 5.0,
      water_level_percent: 10,
      status: "CRITICAL"
    };
    await sendReading(criticalPayload);
  } else if (modeArg === 'low') {
    // Low warning tank level
    const lowPayload = {
      device_id: devArg,
      tank_id: tankArg,
      distance_cm: 39.0,
      water_depth_cm: 11.0,
      water_level_percent: 22,
      status: "LOW"
    };
    await sendReading(lowPayload);
  } else if (modeArg === 'recover') {
    // Refilled tank
    const recoveryPayload = {
      device_id: devArg,
      tank_id: tankArg,
      distance_cm: 8.0,
      water_depth_cm: 42.0,
      water_level_percent: 84,
      status: "NORMAL"
    };
    await sendReading(recoveryPayload);
  } else if (modeArg === 'stream') {
    console.log('[SIMULATOR] Streaming dynamic water level readings every 5 seconds... Press Ctrl+C to exit.');
    let depth = 34.5;
    let delta = -0.5; // Starts slowly draining

    setInterval(async () => {
      depth = Number((depth + delta).toFixed(1));
      if (depth <= 4.0) delta = 2.0; // Refill triggered
      if (depth >= 46.0) delta = -0.6; // Draining again

      const totalHeight = 50.0;
      const dist = Number((totalHeight - depth).toFixed(1));
      const percent = Math.min(100, Math.max(0, Math.round((depth / totalHeight) * 100)));
      const status = percent <= 15 ? 'CRITICAL' : (percent <= 25 ? 'LOW' : 'NORMAL');

      await sendReading({
        device_id: devArg,
        tank_id: tankArg,
        distance_cm: dist,
        water_depth_cm: depth,
        water_level_percent: percent,
        status: status
      });
    }, 5000);
  }
}

main();
