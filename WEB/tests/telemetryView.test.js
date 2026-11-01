import test from 'node:test';
import assert from 'node:assert/strict';
import { latestTankPacket, mergeTankReadings, newestPacket } from '../src/services/telemetryView.js';

const row = (time, percent) => ({ id: 'tank-1', tank_id_code: 'TANK_001', last_reading_at: time, current_water_percent: percent });
test('one-second readings update the latest packet; empty or malformed timestamps are not fabricated', () => {
  assert.equal(latestTankPacket([row(null, 50), row('invalid', 20)]), null);
  const first = latestTankPacket([row('2026-11-01 10:00:00', 40)]);
  const next = latestTankPacket([row('2026-11-01T10:00:01Z', 41)]);
  assert.equal(newestPacket(first, next).water_level_percent, 41);
  assert.equal(newestPacket(next, first), next);
});
test('a slower full-dashboard fetch cannot overwrite a newer tank reading', () => {
  const current = [row('2026-11-01T10:00:01Z', 41)];
  const merged = mergeTankReadings(current, [{ ...row('2026-11-01T10:00:00Z', 40), name: 'Updated metadata' }]);
  assert.equal(merged[0].current_water_percent, 41);
  assert.equal(merged[0].name, 'Updated metadata');
  assert.equal(mergeTankReadings(current, [row('2026-11-01T10:00:02Z', 42)])[0].current_water_percent, 42);
});
