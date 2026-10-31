import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMeasurement } from '../src/lib/tankGeometry.js';

for (const geometry of [
  { shape: 'rectangular', height_cm: 20, width_cm: 10, length_cm: 30 },
  { shape: 'vertical_cylinder', height_cm: 20, diameter_cm: 10 },
  { shape: 'horizontal_cylinder', height_cm: 20, diameter_cm: 20, length_cm: 30 }
]) {
  test(`${geometry.shape}: empty, half and full`, () => {
    const config = { ...geometry, empty_distance_cm: 25, full_distance_cm: 5, dead_zone_cm: 2, tolerance_cm: 1 };
    for (const [distance, expected] of [[25, 0], [15, 50], [5, 100], [25.5, 0], [4.5, 100]]) {
      assert.ok(Math.abs(calculateMeasurement(config, distance).water_level_percent - expected) < 1e-8);
    }
    for (const invalid of [null, NaN, 0, 3, 27]) assert.throws(() => calculateMeasurement(config, invalid));
    assert.throws(() => calculateMeasurement({ ...config, full_distance_cm: 1 }, 15));
  });
}
test('horizontal cylinder volume is not linear with depth', () => {
  const c = { shape: 'horizontal_cylinder', height_cm: 20, diameter_cm: 20, length_cm: 30, empty_distance_cm: 25, full_distance_cm: 5 };
  assert.ok(calculateMeasurement(c, 20).water_level_percent < 25);
});

test('condition hysteresis delays only recovery', async () => {
  const { classifyCondition } = await import('../src/lib/tankCondition.js');
  const thresholds = {critical: 15, low: 25, warning: 40, hysteresis: 2};
  assert.equal(classifyCondition(15, 'NORMAL', thresholds), 'CRITICAL');
  assert.equal(classifyCondition(17, 'CRITICAL', thresholds), 'CRITICAL');
  assert.equal(classifyCondition(17.1, 'CRITICAL', thresholds), 'LOW');
  assert.equal(classifyCondition(26, 'LOW', thresholds), 'LOW');
  assert.equal(classifyCondition(28, 'LOW', thresholds), 'WARNING');
  assert.equal(classifyCondition(43, 'WARNING', thresholds), 'NORMAL');
});
