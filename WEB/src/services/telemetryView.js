export function latestTankPacket(tanks) {
  let latest = null;
  for (const tank of tanks) {
    const timestamp = typeof tank.last_reading_at === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(tank.last_reading_at)
      ? tank.last_reading_at.replace(' ', 'T') + 'Z' : tank.last_reading_at;
    const time = timestamp ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(time) || (latest && time <= Date.parse(latest.recorded_at))) continue;
    latest = { tank_id: tank.tank_id_code || tank.id, device_id: tank.device_id_code,
      water_depth_cm: tank.current_water_depth_cm, water_level_percent: tank.current_water_percent,
      status: tank.current_status, recorded_at: new Date(time).toISOString() };
  }
  return latest;
}

export function mergeTankReadings(previous, incoming) {
  const prior = new Map(previous.map(t => [t.id || t.tank_id_code, t]));
  return incoming.map(tank => {
    const old = prior.get(tank.id || tank.tank_id_code);
    const oldTime = old && latestTankPacket([old])?.recorded_at;
    const nextTime = latestTankPacket([tank])?.recorded_at;
    if (!oldTime || (nextTime && Date.parse(nextTime) >= Date.parse(oldTime))) return tank;
    const result = { ...tank };
    for (const key of ['current_water_percent', 'current_water_depth_cm', 'current_status', 'last_reading_at', 'current_volume_l', 'current_condition', 'device_status', 'device_last_seen_at']) {
      if (key in old) result[key] = old[key];
    }
    return result;
  });
}

export function newestPacket(previous, next) {
  if (!next) return previous;
  return previous && Date.parse(previous.recorded_at) > Date.parse(next.recorded_at) ? previous : next;
}
