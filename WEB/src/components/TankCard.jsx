import React from 'react';
import { Wifi, WifiOff, Clock, Gauge, FlaskConical, Radio } from 'lucide-react';

// Data provenance decides how a tank is labelled. Tanks fed by a real field
// device (OPERATIONAL) must never be presented as simulated, and simulated tanks
// must always say so — the dashboard is used to demonstrate live telemetry.
const PROVENANCE_META = {
  OPERATIONAL: { label: 'Live sensor', className: 'prov-live', Icon: Radio, hint: 'Readings come from an installed field device.' },
  SIMULATED: { label: 'Simulated', className: 'prov-simulated', Icon: FlaskConical, hint: 'Demo telemetry — no field device is reporting.' },
  TEST: { label: 'Test bench', className: 'prov-test', Icon: FlaskConical, hint: 'Test data, not a production tank.' },
  UNKNOWN: { label: 'Unclassified', className: 'prov-unknown', Icon: Gauge, hint: 'Provenance has not been set for this tank yet.' }
};

export default function TankCard({ tank, onClick }) {
  const percent = Number(tank.current_water_percent ?? 0);
  const status = tank.current_status || 'NORMAL';
  const hasReading = Boolean(tank.last_reading_at);
  // "Reporting" means a fresh reading arrived, whichever ingestion path handled
  // it — the device row alone goes stale for units posting to Supabase directly.
  const reporting = tank.reading_fresh != null ? Boolean(tank.reading_fresh) : tank.device_status === 'ONLINE';
  const provenance = PROVENANCE_META[tank.provenance] ? tank.provenance : (tank.provenance ? 'UNKNOWN' : null);
  const prov = provenance ? PROVENANCE_META[provenance] : null;

  // The badge follows the water level, exactly like the other tanks. Connectivity
  // is carried by the small icon in the footer instead of replacing the reading.
  const getStatusBadge = () => {
    if (!hasReading) return <span className="badge badge-offline">No readings yet</span>;
    if (status === 'SENSOR_ERROR') return <span className="badge badge-low">Sensor error</span>;
    if (status === 'CRITICAL' || percent <= 15) return <span className="badge badge-critical">Critical ({percent}%)</span>;
    if (status === 'LOW' || percent <= 25) return <span className="badge badge-low">Low ({percent}%)</span>;
    return <span className="badge badge-normal">Normal ({percent}%)</span>;
  };

  const getFillClass = () => {
    if (!hasReading) return 'unknown';
    if (status === 'CRITICAL' || percent <= 15) return 'critical';
    if (status === 'LOW' || percent <= 25) return 'low';
    return 'normal';
  };

  const formatTime = (ts) => {
    if (!ts) return 'No readings yet';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="tank-card" onClick={onClick}>
      <div className="tank-card-header">
        <div>
          <div className="tank-title">{tank.name}</div>
          <div className="tank-subtitle">
            <strong style={{ color: '#0077B6' }}>{tank.tank_id_code}</strong> • {tank.station_name || tank.station_community || 'Central Grid'}
          </div>
          {prov && (
            <div className="tank-tags">
              <span className={`tank-tag ${prov.className}`} title={prov.hint}>
                <prov.Icon size={11} /> {prov.label}
              </span>
            </div>
          )}
        </div>
        {getStatusBadge()}
      </div>

      {/* Visual Cylinder Gauge */}
      <div className="tank-visual">
        <div className="cylinder-gauge" title={hasReading ? `${percent}% full` : 'No reading received yet'}>
          <div
            className={`water-fill ${getFillClass()}`}
            style={{ height: hasReading ? `${Math.min(100, Math.max(0, percent))}%` : '0%' }}
          />
        </div>

        <div className="tank-metrics">
          <div className="metric-big" style={{
            color: !hasReading ? '#94A3B8' : (status === 'CRITICAL' || percent <= 15) ? '#EF4444' : (status === 'LOW' || percent <= 25) ? '#D97706' : '#0284C7'
          }}>
            {hasReading ? `${percent}%` : '—'}
          </div>
          <div className="metric-sub">
            Depth: <strong>{hasReading ? `${tank.current_water_depth_cm ?? 0} cm` : '—'}</strong> / {tank.total_height_cm} cm
          </div>
          <div className="metric-sub" style={{ fontSize: '0.875rem', color: '#64748B' }}>
            Capacity: {(tank.capacity_liters || 10000).toLocaleString()} L
          </div>
        </div>
      </div>

      <div className="tank-card-footer">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title={reporting ? 'Device is sending readings' : 'No recent reading from this device'}
        >
          {reporting ? <Wifi size={14} color="#10B981" /> : <WifiOff size={14} color="#94A3B8" />}
          <span>{tank.device_id_code || 'No device'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
          <Clock size={13} />
          <span>{formatTime(tank.last_reading_at)}</span>
        </div>
      </div>
    </div>
  );
}
