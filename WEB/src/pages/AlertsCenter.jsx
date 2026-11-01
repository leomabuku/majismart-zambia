import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react';

export default function AlertsCenter({ alerts, onReload }) {
  const { isAdmin } = useAuth();
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [loadingId, setLoadingId] = useState(null);

  const filtered = alerts.filter(a => {
    if (filterStatus === 'ALL') return true;
    return a.status === filterStatus;
  });

  const handleAcknowledge = async (id) => {
    setLoadingId(id);
    try {
      const res = await api.put(`/alerts/${id}/acknowledge`, {});
      if (res.success) onReload();
    } finally {
      setLoadingId(null);
    }
  };

  const handleResolve = async (id) => {
    setLoadingId(id);
    try {
      const res = await api.put(`/alerts/${id}/resolve`, {});
      if (res.success) onReload();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', color: '#03045E' }}>Telemetry Alerts & Exception Center</h2>
          <p style={{ fontSize: '14px', color: '#64748B' }}>
            Automated threshold violation alerts, offline timeouts, and recovery logs
          </p>
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: '8px', background: '#E2E8F0', padding: '4px', borderRadius: '8px' }}>
          {['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ALL'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                background: filterStatus === st ? '#FFFFFF' : 'transparent',
                color: filterStatus === st ? '#03045E' : '#475569',
                boxShadow: filterStatus === st ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filtered.map(alert => {
          const isCritical = alert.severity === 'CRITICAL';
          const isWarning = alert.severity === 'WARNING';

          return (
            <div 
              key={alert.id}
              className="stat-card"
              style={{
                borderLeft: `6px solid ${isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981'}`,
                padding: '20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: isCritical ? '#FEF2F2' : isWarning ? '#FFFBEB' : '#ECFDF5',
                    color: isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isCritical ? <AlertOctagon size={22} /> : isWarning ? <AlertTriangle size={22} /> : <CheckCircle size={22} />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h3 style={{ fontSize: '16px', color: '#0F172A' }}>{alert.title}</h3>
                      <span className={`badge ${isCritical ? 'badge-critical' : isWarning ? 'badge-low' : 'badge-normal'}`}>
                        {alert.severity}
                      </span>
                      <span className="badge" style={{ background: '#F1F5F9', color: '#475569' }}>
                        {alert.status}
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: '#475569', marginTop: '6px' }}>
                      {alert.message}
                    </p>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#64748B', marginTop: '8px' }}>
                      <span>Tank: <strong>{alert.tank_name || alert.tank_id_code}</strong></span>
                      <span>Device: <strong>{alert.device_id || 'ESP32'}</strong></span>
                      <span>Triggered: <strong>{new Date(alert.created_at).toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {isAdmin && alert.status !== 'RESOLVED' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {alert.status === 'ACTIVE' && (
                      <button 
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={loadingId === alert.id}
                        className="btn-secondary"
                        style={{ fontSize: '14px', padding: '6px 12px' }}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button 
                      onClick={() => handleResolve(alert.id)}
                      disabled={loadingId === alert.id}
                      className="btn-primary"
                      style={{ fontSize: '14px', padding: '6px 12px' }}
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="stat-card" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
            No alerts match status "{filterStatus}".
          </div>
        )}
      </div>
    </div>
  );
}

