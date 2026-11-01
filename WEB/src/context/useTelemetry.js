import { useEffect, useState } from 'react';
import { applyReadings, mergeReading } from '../services/readingSource';
import { telemetrySource, telemetryConfigurationError, usesSupabaseTelemetry } from '../services/supabaseTelemetry';

export function useTelemetry(tanks, summary) {
  const [readings, setReadings] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(telemetryConfigurationError);
  const [now, setNow] = useState(Date.now());
  const tankIds = JSON.stringify([...new Set(tanks.map(t => t.tank_id_code || t.id))].sort());

  useEffect(() => {
    if (!telemetrySource) return;
    setConnected(false);
    return telemetrySource.watch(JSON.parse(tankIds), {
      onReading: row => setReadings(previous => mergeReading(previous, row)),
      onStatus: setConnected,
      onError: setError
    });
  }, [tankIds]);

  useEffect(() => {
    if (!usesSupabaseTelemetry) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const resolvedTanks = usesSupabaseTelemetry ? applyReadings(tanks, readings, now) : tanks;
  const latest = Object.values(readings).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
  const resolvedSummary = usesSupabaseTelemetry && summary ? {
    ...summary,
    total_tanks: resolvedTanks.length,
    normal_tanks: resolvedTanks.filter(t => t.current_status === 'NORMAL').length,
    low_tanks: resolvedTanks.filter(t => t.current_status === 'LOW').length,
    critical_tanks: resolvedTanks.filter(t => t.current_status === 'CRITICAL').length,
    offline_tanks: resolvedTanks.filter(t => t.current_status === 'OFFLINE').length,
    online_devices: resolvedTanks.filter(t => t.device_status === 'ONLINE').length,
    offline_devices: resolvedTanks.filter(t => t.device_status === 'OFFLINE').length
  } : summary;
  return { tanks: resolvedTanks, summary: resolvedSummary, latest, connected, error };
}
