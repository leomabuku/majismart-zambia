import React, { useState, useEffect } from 'react';
import { CloudRain, Sun, RefreshCw, Smartphone, Menu } from 'lucide-react';
import { api } from '../services/api';

export default function Topbar({ title, onRefresh, lastPacket, isConnected, onOpenMobile, onMenuClick, menuOpen }) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    api.get('/weather')
      .then(res => {
        if (res.success) setWeather(res.data);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="navigation-toggle" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={onMenuClick}><Menu size={24} /></button>
        <h1 className="topbar-title">{title}</h1>
        
        {/* Realtime Stream Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', background: '#F1F5F9', padding: '4px 10px', borderRadius: '9999px' }}>
          <span className="live-pulse-dot" style={{ background: isConnected ? '#10B981' : '#F59E0B' }} />
          <span style={{ fontWeight: 600, color: '#334155' }}>
            {isConnected ? 'Live connection' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      <div className="topbar-right">
        {lastPacket?.recorded_at && <span className="reading-received" aria-label="Last saved tank reading">Reading {new Date(lastPacket.recorded_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' })}</span>}
        {/* Weather Context Widget (Section 9) */}
        {weather && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            padding: '6px 14px',
            borderRadius: '10px',
            fontSize: '0.875rem',
            color: '#0369A1'
          }}>
            {weather.precipitation_mm > 0 ? <CloudRain size={16} color="#0284C7" /> : <Sun size={16} color="#F59E0B" />}
            <div>
              <strong>{weather.city}</strong>: {weather.temperature_c}°C ({weather.condition})
            </div>
          </div>
        )}

        {/* Customer Mobile App Preview Toggle */}
        <button 
          onClick={onOpenMobile} 
          className="btn-secondary"
          style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1' }}
          title="Open Customer Android App in interactive phone preview"
        >
          <Smartphone size={15} color="#0077B6" />
          <span style={{ fontWeight: 600 }}>Customer App</span>
        </button>

        {/* Refresh button */}
        <button 
          onClick={onRefresh} 
          className="btn-secondary"
          style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
          title="Manual Reload"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}

