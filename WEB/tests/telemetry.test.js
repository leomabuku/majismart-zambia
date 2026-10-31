import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryState, parseTimestamp, packetLabel } from '../src/utils/telemetry.js';
const now = Date.parse('2026-10-31T12:00:00Z');
test('fresh sensor readings remain explicitly unverified until commissioned', () => {
  const q = telemetryState({ last_reading_at: '2026-10-31T11:59:50Z', current_water_percent: 0, source: 'SENSOR' }, now);
  assert.equal(q.connection, 'ONLINE'); assert.equal(q.hasValue, true); assert.equal(q.calibration, 'NOT VERIFIED');
});
test('ages readings independently of server online status', () => {
  assert.equal(telemetryState({ last_reading_at: '2026-10-31T11:58:50Z' }, now).connection, 'STALE');
  assert.equal(telemetryState({ last_reading_at: '2026-10-31T11:57:00Z', device_status: 'ONLINE' }, now).connection, 'OFFLINE');
});
test('simulation, missing readings and faults cannot appear as valid live measurements', () => {
  assert.equal(telemetryState({ source: 'SIMULATED' }, now).source, 'SIMULATED — TEST ONLY');
  assert.equal(telemetryState({}, now).hasValue, false);
  assert.equal(telemetryState({ current_status: 'SENSOR_ERROR', current_water_percent: 0, last_reading_at: '2026-10-31T11:59:50Z' }, now).hasValue, false);
});
test('legacy SQLite timestamps are interpreted as UTC', () => assert.equal(parseTimestamp('2026-10-31 12:00:00'), now));

test('legacy live API events never become verified sensor packets', () => {
 assert.equal(packetLabel({device_id:'TEST_DEVICE'}),'SOURCE UNKNOWN — NOT VERIFIED');
 assert.equal(packetLabel({source:'SENSOR'}),'DEVICE-REPORTED SENSOR PACKET');
 assert.equal(packetLabel({simulated:true}),'SIMULATED — TEST ONLY');
});
