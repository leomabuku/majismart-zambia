import React, { useEffect, useState } from 'react';
import { telemetryState, parseTimestamp } from '../utils/telemetry';
import { Wifi, WifiOff, Clock, Gauge, ArrowRight } from 'lucide-react';

export default function TankCard({ tank, onClick }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const quality = telemetryState(tank, now);
  const percent = quality.hasValue ? Number(tank.current_water_percent) : null;
  const status = tank.current_status || 'NORMAL';
  const isOffline = quality.connection !== 'ONLINE';

  const getStatusBadge = () => {
    if (isOffline) return <span className="badge badge-offline">{quality.connection}</span>;
    if (status === 'CRITICAL') return <span className="badge badge-critical">Critical ({percent == null ? '—' : `${percent}%`})</span>;
    if (status === 'LOW') return <span className="badge badge-low">Low ({percent == null ? '—' : `${percent}%`})</span>;
    return <span className="badge badge-normal">Normal ({percent == null ? '—' : `${percent}%`})</span>;
  };

  const getFillClass = () => {
    if (status === 'CRITICAL') return 'critical';
    if (status === 'LOW') return 'low';
    return 'normal';
  };

  const formatTime = (ts) => {
    if (!ts) return 'No readings yet';
    const date = new Date(parseTimestamp(ts));
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
        </div>
        {getStatusBadge()}
      </div>

      <div style={{ padding: '0 16px', fontSize: 11, color: '#64748B' }}>{quality.source} · Calibration: {quality.calibration}</div>
      {/* Visual Cylinder Gauge */}
      <div className="tank-visual">
        <div className="cylinder-gauge" title={`${percent == null ? '—' : `${percent}%`} full`}>
          <div 
            className={`water-fill ${getFillClass()}`} 
            style={{ height: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        
        <div className="tank-metrics">
          <div className="metric-big" style={{ 
            color: (status === 'CRITICAL' || percent <= 15) ? '#EF4444' : (status === 'LOW' || percent <= 25) ? '#D97706' : '#0284C7' 
          }}>
            {percent == null ? '—' : `${percent}%`}
          </div>
          <div className="metric-sub">
            Depth: <strong>{quality.hasValue ? tank.current_water_depth_cm : '—'} cm</strong> / {tank.total_height_cm} cm
          </div>
          <div className="metric-sub" style={{ fontSize: '11px', color: '#64748B' }}>
            Capacity: {tank.capacity_liters ? Number(tank.capacity_liters).toLocaleString() : '—'} L
          </div>
        </div>
      </div>

      <div className="tank-card-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isOffline ? <WifiOff size={14} color="#94A3B8" /> : <Wifi size={14} color="#10B981" />}
          <span>{tank.device_id_code || 'ESP32'} ({quality.connection})</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
          <Clock size={13} />
          <span>{formatTime(tank.last_reading_at)}</span>
        </div>
      </div>
    </div>
  );
}
