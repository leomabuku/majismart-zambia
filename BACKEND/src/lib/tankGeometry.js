/** Geometry and calibration calculations. Dimensions and distances are in cm.
 * Returns estimated volume in litres; nominal manufacturer capacity is not used.
 * Used by telemetry ingestion and calibration tests.
 */
export function calculateMeasurement(config, distanceCm) {
  const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const { shape, height_cm: height, diameter_cm: diameter, length_cm: length, width_cm: width, empty_distance_cm: empty, full_distance_cm: full, dead_zone_cm: deadZone = 0, tolerance_cm: tolerance = 0 } = config;
  if (!positive(height) || !positive(empty) || typeof full !== 'number' || !Number.isFinite(full) || full < 0 || empty <= full || Math.abs((empty - full) - height) > 0.01 || !Number.isFinite(deadZone) || deadZone < 0 || full < deadZone || !Number.isFinite(tolerance) || tolerance < 0) throw new Error('Invalid calibration');
  if (typeof distanceCm !== 'number' || !Number.isFinite(distanceCm) || distanceCm <= 0 || distanceCm < deadZone || distanceCm < full - tolerance || distanceCm > empty + tolerance) throw new Error('Invalid measurement');
  const depth = Math.max(0, Math.min(height, empty - distanceCm));
  let capacity, volume;
  if (shape === 'vertical_cylinder' && positive(diameter)) {
    capacity = Math.PI * (diameter / 2) ** 2 * height;
    volume = Math.PI * (diameter / 2) ** 2 * depth;
  } else if (shape === 'rectangular' && positive(length) && positive(width)) {
    capacity = length * width * height;
    volume = length * width * depth;
  } else if (shape === 'horizontal_cylinder' && positive(diameter) && positive(length) && Math.abs(height - diameter) <= 0.01) {
    const radius = diameter / 2;
    capacity = Math.PI * radius ** 2 * length;
    const area = radius ** 2 * Math.acos(Math.max(-1, Math.min(1, (radius - depth) / radius))) - (radius - depth) * Math.sqrt(Math.max(0, 2 * radius * depth - depth ** 2));
    volume = area * length;
  } else throw new Error('Invalid geometry');
  return { distance_cm: distanceCm, water_depth_cm: depth, water_level_percent: 100 * volume / capacity, estimated_volume_l: volume / 1000, usable_capacity_l: capacity / 1000 };
}
