import React from 'react';
import { Wifi, WifiOff, Clock, Gauge, ArrowRight } from 'lucide-react';

export default function TankCard({ tank, onClick }) {
  const percent = tank.current_water_percent ?? 0;
  const missing = tank.telemetry_missing;
  const status = tank.current_status || 'NORMAL';
  const isOffline = status === 'OFFLINE' || tank.device_status === 'OFFLINE';

  const getStatusBadge = () => {
    if (missing) return <span className="badge badge-offline">No readings</span>;
    if (status === 'SENSOR_ERROR') return <span className="badge badge-critical">Sensor error</span>;
    if (isOffline) return <span className="badge badge-offline">Offline</span>;
    if (status === 'CRITICAL' || percent <= 15) return <span className="badge badge-critical">Critical ({percent}%)</span>;
    if (status === 'LOW' || percent <= 25) return <span className="badge badge-low">Low ({percent}%)</span>;
    return <span className="badge badge-normal">Normal ({percent}%)</span>;
  };

  const getFillClass = () => {
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
        </div>
        {getStatusBadge()}
      </div>

      {/* Visual Cylinder Gauge */}
      <div className="tank-visual">
        <div className="cylinder-gauge" title={`${percent}% full`}>
          <div 
            className={`water-fill ${getFillClass()}`} 
            style={{ height: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        
        <div className="tank-metrics">
          <div className="metric-big" style={{ 
            color: (status === 'CRITICAL' || percent <= 15) ? '#EF4444' : (status === 'LOW' || percent <= 25) ? '#D97706' : '#0284C7' 
          }}>
            {missing ? '—' : `${percent}%`}
          </div>
          <div className="metric-sub">
            Depth: <strong>{missing ? '—' : tank.current_water_depth_cm} cm</strong> / {tank.total_height_cm} cm
          </div>
          <div className="metric-sub" style={{ fontSize: '11px', color: '#64748B' }}>
            Capacity: {(tank.capacity_liters || 10000).toLocaleString()} L
          </div>
        </div>
      </div>

      <div className="tank-card-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isOffline ? <WifiOff size={14} color="#94A3B8" /> : <Wifi size={14} color="#10B981" />}
          <span>{tank.device_id_code || 'ESP32'} ({isOffline ? 'Offline' : 'Online'})</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
          <Clock size={13} />
          <span>{formatTime(tank.last_reading_at)}</span>
        </div>
      </div>
    </div>
  );
}

