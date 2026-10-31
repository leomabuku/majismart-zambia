import React, { useState } from 'react';
import { api } from '../services/api';
import { 
  Smartphone, 
  Droplet, 
  PlusCircle, 
  FileText, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  X,
  AlertTriangle
} from 'lucide-react';

export default function MobileAppSimulator({ tanks, reports, onReload, onClose }) {
  const [mobileTab, setMobileTab] = useState('tanks'); // 'tanks' | 'report' | 'my_reports'
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Mobile Report Form State
  const [reportForm, setReportForm] = useState({
    category: 'WATER_SHORTAGE',
    title: '',
    location_name: 'Chilenje South, Zone 4',
    description: '',
    latitude: -15.452,
    longitude: 28.324
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/reports', reportForm);
      if (res.success) {
        setSubmitSuccess(true);
        setReportForm({
          category: 'WATER_SHORTAGE',
          title: '',
          location_name: 'Chilenje South, Zone 4',
          description: '',
          latitude: -15.452,
          longitude: 28.324
        });
        if (onReload) onReload();
        setTimeout(() => {
          setSubmitSuccess(false);
          setMobileTab('my_reports');
        }, 1200);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      {/* Smartphone Device Frame */}
      <div 
        onClick={e => e.stopPropagation()} 
        style={{
          width: '380px',
          height: '760px',
          background: '#0B0F19',
          borderRadius: '44px',
          border: '10px solid #1E293B',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Dynamic Island / Notch */}
        <div style={{
          height: '24px',
          background: '#0B0F19',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{ width: '80px', height: '14px', background: '#1E293B', borderRadius: '10px' }} />
          <button 
            onClick={onClose} 
            style={{ position: 'absolute', right: '14px', top: '4px', color: '#94A3B8' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Mobile App Header */}
        <div style={{
          background: 'linear-gradient(135deg, #03045E 0%, #0077B6 100%)',
          padding: '16px 20px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#90E0EF', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              SmartWater Customer App
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800 }}>Community Water Status</div>
          </div>
          <button onClick={onReload} style={{ color: '#E0F2FE' }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Mobile Screen Body */}
        <div style={{
          flex: 1,
          background: '#F8FAFC',
          overflowY: 'auto',
          padding: '16px',
          fontSize: '13px'
        }}>
          {mobileTab === 'tanks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                padding: '10px 14px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#065F46'
              }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>Synchronized with Central Lusaka Telemetry</span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: '#03045E', marginTop: '4px' }}>
                Storage Tanks in Your Area
              </div>

              {tanks.map(t => {
                const pct = t.current_water_percent;
                const isCrit = pct <= 15;
                const isLow = pct <= 25;
                const color = isCrit ? '#EF4444' : isLow ? '#F59E0B' : '#0284C7';

                return (
                  <div key={t.id} style={{
                    background: 'white',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{t.name}</span>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '14px',
                        color: color,
                        background: isCrit ? '#FEF2F2' : isLow ? '#FFFBEB' : '#EFF6FF',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        {pct}%
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', margin: '8px 0', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                      <span>Depth: {t.current_water_depth_cm} cm</span>
                      <span>Sensor: {t.device_id_code || 'ESP32'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mobileTab === 'report' && (
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#03045E', marginBottom: '12px' }}>
                Report a Water Issue
              </div>

              {submitSuccess ? (
                <div style={{
                  padding: '20px',
                  background: '#ECFDF5',
                  color: '#065F46',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700 }}>Report Submitted!</div>
                  <div style={{ fontSize: '12px' }}>Forwarded to Lusaka dispatch queue.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Issue Category</label>
                    <select 
                      className="form-select"
                      style={{ fontSize: '12px', padding: '8px' }}
                      value={reportForm.category}
                      onChange={e => setReportForm({ ...reportForm, category: e.target.value })}
                    >
                      <option value="WATER_SHORTAGE">Water Shortage</option>
                      <option value="PIPE_LEAKAGE">Pipe Leakage</option>
                      <option value="BURST_PIPE">Burst Pipe</option>
                      <option value="TANK_MALFUNCTION">Tank Malfunction</option>
                      <option value="WATER_QUALITY">Water Quality Issue</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Headline / Title *</label>
                    <input 
                      className="form-input"
                      style={{ fontSize: '12px', padding: '8px' }}
                      required
                      placeholder="e.g. Dry taps since morning"
                      value={reportForm.title}
                      onChange={e => setReportForm({ ...reportForm, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Location *</label>
                    <input 
                      className="form-input"
                      style={{ fontSize: '12px', padding: '8px' }}
                      required
                      value={reportForm.location_name}
                      onChange={e => setReportForm({ ...reportForm, location_name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Details *</label>
                    <textarea 
                      className="form-textarea"
                      style={{ fontSize: '12px', padding: '8px' }}
                      rows="3"
                      required
                      placeholder="Details on households affected..."
                      value={reportForm.description}
                      onChange={e => setReportForm({ ...reportForm, description: e.target.value })}
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="btn-primary"
                    style={{ marginTop: '6px', padding: '10px', fontSize: '13px' }}
                  >
                    {submitting ? 'Transmitting Report...' : 'Submit Incident Report'}
                  </button>
                </form>
              )}
            </div>
          )}

          {mobileTab === 'my_reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#03045E' }}>
                My Submitted Incidents
              </div>

              {reports.map(r => (
                <div key={r.id} style={{
                  background: 'white',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ color: '#03045E' }}>{r.title}</strong>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: r.status === 'RESOLVED' ? '#ECFDF5' : r.status === 'IN_PROGRESS' ? '#FFFBEB' : '#EFF6FF',
                      color: r.status === 'RESOLVED' ? '#059669' : r.status === 'IN_PROGRESS' ? '#D97706' : '#2563EB'
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>{r.location_name}</div>
                  <div style={{ marginTop: '6px', color: '#334155' }}>{r.description}</div>
                  {r.admin_notes && (
                    <div style={{
                      marginTop: '6px',
                      background: '#F1F5F9',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      color: '#0077B6',
                      fontSize: '11px'
                    }}>
                      <strong>Admin Update:</strong> {r.admin_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <div style={{
          height: '60px',
          background: 'white',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '0 8px'
        }}>
          <button 
            onClick={() => setMobileTab('tanks')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: mobileTab === 'tanks' ? '#0077B6' : '#94A3B8',
              fontSize: '10px',
              fontWeight: 600
            }}
          >
            <Droplet size={18} />
            <span>Water Levels</span>
          </button>

          <button 
            onClick={() => setMobileTab('report')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: mobileTab === 'report' ? '#0077B6' : '#94A3B8',
              fontSize: '10px',
              fontWeight: 600
            }}
          >
            <PlusCircle size={18} />
            <span>Report Issue</span>
          </button>

          <button 
            onClick={() => setMobileTab('my_reports')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: mobileTab === 'my_reports' ? '#0077B6' : '#94A3B8',
              fontSize: '10px',
              fontWeight: 600
            }}
          >
            <FileText size={18} />
            <span>My Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
}
