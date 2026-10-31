export function parseTimestamp(value) {
  if (!value) return NaN;
  return Date.parse(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
}
export function telemetryState(tank, now = Date.now()) {
  const last = parseTimestamp(tank.last_reading_at);
  const age = now - last;
  let connection = !Number.isFinite(last) ? 'NO DATA' : age > 120000 ? 'OFFLINE' : age > 60000 ? 'STALE' : 'ONLINE';
  if (tank.device_status === 'OFFLINE' || tank.current_status === 'OFFLINE') connection = 'OFFLINE';
  if (tank.current_status === 'SENSOR_ERROR' && connection === 'ONLINE') connection = 'SENSOR ERROR';
  const source = tank.source === 'SIMULATED' ? 'SIMULATED — TEST ONLY' : tank.source === 'SENSOR' ? 'SENSOR READING' : 'SOURCE UNKNOWN';
  return { connection, source, calibration: tank.calibration_status || 'NOT VERIFIED',
    hasValue: Number.isFinite(Number(tank.current_water_percent)) && tank.current_water_percent != null && tank.current_status !== 'SENSOR_ERROR' && Number.isFinite(last) };
}

export function packetLabel(packet) {
  if (packet.simulated === true || packet.source === 'SIMULATED') return 'SIMULATED — TEST ONLY';
  if (packet.source === 'SENSOR') return 'DEVICE-REPORTED SENSOR PACKET';
  return 'SOURCE UNKNOWN — NOT VERIFIED';
}
