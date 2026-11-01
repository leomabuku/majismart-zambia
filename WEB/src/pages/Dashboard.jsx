import React, { useState } from 'react';
import StatCards from '../components/StatCards';
import TankCard from '../components/TankCard';
import { Radio, AlertOctagon, ArrowUpRight, Filter } from 'lucide-react';

export default function Dashboard({ summary, tanks, alerts, reports, onSelectTank, lastTelemetry }) {
  const [filter, setFilter] = useState('ALL');

  const filteredTanks = tanks.filter(tank => {
    if (filter === 'NORMAL') return tank.current_status === 'NORMAL' && tank.current_water_percent > 25;
    if (filter === 'LOW') return tank.current_status === 'LOW' || (tank.current_water_percent <= 25 && tank.current_water_percent > 15);
    if (filter === 'CRITICAL') return tank.current_status === 'CRITICAL' || tank.current_water_percent <= 15;
    if (filter === 'OFFLINE') return tank.current_status === 'OFFLINE' || tank.device_status === 'OFFLINE';
    return true;
  });

  return (
    <div>
      {/* Live Telemetry Ticker */}
      {lastTelemetry && (
        <div className="telemetry-ticker" style={{ borderRadius: '12px', marginBottom: '24px' }}>
          <div className="ticker-left">
            <span className="live-pulse-dot" />
            <span style={{ fontWeight: 600, color: '#38BDF8' }}>LATEST TANK READING:</span>
            <span>Device: <strong>{lastTelemetry.device_id || 'Not supplied'}</strong></span>
            <span>•</span>
            <span>Tank: <strong>{lastTelemetry.tank_id}</strong></span>
            <span>•</span>
            <span>Depth: <strong>{lastTelemetry.water_depth_cm} cm</strong></span>
            <span>•</span>
            <span>Level: <strong>{lastTelemetry.water_level_percent}%</strong></span>
          </div>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>
            {new Date(lastTelemetry.recorded_at).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <StatCards summary={summary} />

      {/* Tank Controls & Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', color: '#03045E' }}>Water Storage Tanks & Reservoirs</h2>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Live level measurements transmitted via ESP32 ultrasonic telemetry</p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: '#E2E8F0', padding: '4px', borderRadius: '8px' }}>
          {['ALL', 'NORMAL', 'LOW', 'CRITICAL', 'OFFLINE'].map(statusKey => (
            <button
              key={statusKey}
              onClick={() => setFilter(statusKey)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: filter === statusKey ? '#FFFFFF' : 'transparent',
                color: filter === statusKey ? '#03045E' : '#475569',
                boxShadow: filter === statusKey ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {statusKey}
            </button>
          ))}
        </div>
      </div>

      {/* Tank Grid */}
      <div className="tank-grid">
        {filteredTanks.map(tank => (
          <TankCard 
            key={tank.id} 
            tank={tank} 
            onClick={() => onSelectTank(tank.tank_id_code || tank.id)} 
          />
        ))}
      </div>

      {/* Bottom Section: Active Alerts and Recent Reports Snippet */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '36px' }}>
        {/* Active Alerts Box */}
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertOctagon size={18} color="#EF4444" />
              <span>Active Water Alerts</span>
            </h3>
            <span className="badge badge-critical">{alerts?.filter(a => a.status === 'ACTIVE').length || 0} Active</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {alerts?.filter(a => a.status === 'ACTIVE').slice(0, 3).map(alt => (
              <div key={alt.id} style={{
                padding: '12px',
                background: alt.severity === 'CRITICAL' ? '#FEF2F2' : '#FFFBEB',
                border: `1px solid ${alt.severity === 'CRITICAL' ? '#FCA5A5' : '#FDE68A'}`,
                borderRadius: '8px',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: 700, color: alt.severity === 'CRITICAL' ? '#991B1B' : '#92400E' }}>
                  {alt.title}
                </div>
                <div style={{ color: '#475569', fontSize: '12px', marginTop: '2px' }}>
                  {alt.message}
                </div>
              </div>
            ))}
            {(!alerts || alerts.filter(a => a.status === 'ACTIVE').length === 0) && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '13px' }}>
                All tanks operating within nominal parameters. No active alerts.
              </div>
            )}
          </div>
        </div>

        {/* Recent Community Reports Box */}
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', color: '#03045E' }}>Recent Community Reports</h3>
            <span className="badge" style={{ background: '#E0F2FE', color: '#0284C7' }}>
              {reports?.length || 0} Total
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reports?.slice(0, 3).map(rep => (
              <div key={rep.id} style={{
                padding: '12px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{rep.title}</span>
                  <span className="badge" style={{
                    fontSize: '10px',
                    background: rep.status === 'RESOLVED' ? '#ECFDF5' : rep.status === 'IN_PROGRESS' ? '#FFFBEB' : '#EFF6FF',
                    color: rep.status === 'RESOLVED' ? '#059669' : rep.status === 'IN_PROGRESS' ? '#D97706' : '#2563EB'
                  }}>
                    {rep.status}
                  </span>
                </div>
                <div style={{ color: '#64748B', fontSize: '12px', marginTop: '4px' }}>
                  {rep.location_name} • Reported by {rep.reporter_name || 'Resident'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

