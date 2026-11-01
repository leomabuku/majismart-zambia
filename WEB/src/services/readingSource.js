// Read-only telemetry source. Never pass the application's custom JWT to Supabase.
export function normalizeReading(row) {
  if (!row || !row.tank_id) return null;
  const timestamp = row.created_at || row.recorded_at;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  const percent = row.water_level_percent;
  const depth = row.water_depth_cm;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100 ||
      typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0) return null;
  return { ...row, created_at: timestamp, recorded_at: timestamp };
}

export function mergeReading(current, candidate) {
  const reading = normalizeReading(candidate);
  if (!reading) return current;
  const previous = current[reading.tank_id];
  if (previous) {
    const difference = Date.parse(reading.created_at) - Date.parse(previous.created_at);
    if (difference < 0) return current;
    if (difference === 0) {
      if (previous.id !== reading.id || JSON.stringify(previous) === JSON.stringify(reading)) return current;
    }
  }
  return { ...current, [reading.tank_id]: reading };
}

export function applyReadings(tanks, readings, now = Date.now()) {
  return tanks.map(tank => {
    const reading = readings[tank.tank_id_code] || readings[tank.id];
    const fresh = reading && now - Date.parse(reading.created_at) <= 60000;
    return {
      ...tank,
      current_water_depth_cm: reading?.water_depth_cm ?? null,
      current_water_percent: reading?.water_level_percent ?? null,
      current_status: reading ? (fresh ? reading.status : 'OFFLINE') : 'OFFLINE',
      device_status: fresh ? 'ONLINE' : 'OFFLINE',
      last_reading_at: reading?.created_at ?? null,
      telemetry_missing: !reading
    };
  });
}

export function createReadingSource(client, { table = 'water_level_readings', pollMs = 15000 } = {}) {
  let sequence = 0;
  async function latest(tankIds) {
    // One indexed query per tank avoids a busy device hiding slower devices in a global limit.
    const rows = await Promise.all(tankIds.map(async id => {
      const { data, error } = await client.from(table).select('id,tank_id,distance_cm,water_depth_cm,water_level_percent,status,created_at').eq('tank_id', id)
        .order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0];
    }));
    return rows.filter(Boolean);
  }
  return {
    async history(tankId) {
      const { data, error } = await client.from(table).select('id,tank_id,distance_cm,water_depth_cm,water_level_percent,status,created_at').eq('tank_id', tankId)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []).map(normalizeReading).filter(Boolean).reverse();
    },
    watch(tankIds, { onReading, onStatus, onError }) {
      let stopped = false;
      let fetching = false;
      let connected = false;
      const ids = new Set(tankIds);
      const refresh = async () => {
        if (stopped || fetching) return;
        fetching = true;
        try {
          const rows = await latest(tankIds);
          if (!stopped) {
            rows.forEach(row => onReading(row));
            onError(null);
            onStatus(connected);
          }
        } catch {
          if (!stopped) {
            onStatus(false);
            onError('Unable to read Supabase telemetry. Check project configuration and read permissions.');
          }
        } finally { fetching = false; }
      };
      const channel = client.channel(`dashboard-readings-${++sequence}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, payload => {
          if (!stopped && ids.has(payload.new.tank_id)) onReading(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, payload => {
          if (!stopped && ids.has(payload.new.tank_id)) onReading(payload.new);
        })
        .subscribe(status => {
          if (stopped) return;
          connected = status === 'SUBSCRIBED';
          onStatus(connected);
          if (connected) void refresh(); // Catch up after an offline interval.
        });
      void refresh();
      const timer = setInterval(refresh, pollMs);
      const resume = () => { void refresh(); };
      globalThis.addEventListener?.('online', resume);
      return () => {
        stopped = true;
        clearInterval(timer);
        globalThis.removeEventListener?.('online', resume);
        void client.removeChannel(channel);
      };
    }
  };
}
