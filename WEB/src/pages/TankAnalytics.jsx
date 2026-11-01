import React, { useState, useEffect } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler 
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { api } from '../services/api';
import { telemetrySource, usesSupabaseTelemetry } from '../services/supabaseTelemetry';
import { useAuth } from '../context/AuthContext';
import { Wifi, Clock, ArrowLeft, Settings, Check, AlertCircle } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function TankAnalytics({ selectedTankId, onBack, tanks }) {
  const { isAdmin } = useAuth();
  const [tankId, setTankId] = useState(selectedTankId || 'TANK_001');
  const [storedTankData, setTankData] = useState(null);
  const tankData = usesSupabaseTelemetry
    ? { ...storedTankData, ...tanks.find(t => t.tank_id_code === tankId || t.id === tankId) }
    : storedTankData;
  const [range, setRange] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [saveMsg, setSaveMsg] = useState('');
  const [sourceReadings, setSourceReadings] = useState([]);
  const [sourceError, setSourceError] = useState('');

  useEffect(() => {
    if (!telemetrySource) return;
    let active = true;
    setSourceReadings([]);
    const refresh = async () => {
      try {
        const readings = await telemetrySource.history(tankId);
        if (active) { setSourceReadings(readings); setSourceError(''); }
      } catch { if (active) setSourceError('Unable to load Supabase reading history.'); }
    };
    void refresh();
    const stop = telemetrySource.watch([tankId], {
      onReading: () => { void refresh(); },
      onStatus: () => {},
      onError: error => { if (active && error) setSourceError(error); }
    });
    return () => { active = false; stop(); };
  }, [tankId]);

  useEffect(() => {
    if (selectedTankId) setTankId(selectedTankId);
  }, [selectedTankId]);

  const loadTank = () => {
    setLoading(true);
    api.get(`/tanks/${tankId}`)
      .then(res => {
        if (res.success) {
          setTankData(res.data);
          setFormData({
            name: res.data.name,
            total_height_cm: res.data.total_height_cm,
            capacity_liters: res.data.capacity_liters,
            low_threshold_percent: res.data.low_threshold_percent,
            critical_threshold_percent: res.data.critical_threshold_percent,
            recovery_threshold_percent: res.data.recovery_threshold_percent
          });
        }
      })
      .catch(() => setSourceError('Unable to load tank details.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTank();
  }, [tankId]);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const res = await api.put(`/tanks/${tankId}`, formData);
    if (res.success) {
      setSaveMsg('Configuration updated successfully!');
      setEditMode(false);
      loadTank();
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  if (loading && !tankData) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading tank telemetry analytics...</div>;
  }

  // Keep the chart aligned with the same source as the tank cards.
  const readings = usesSupabaseTelemetry ? sourceReadings : (tankData?.recent_readings || []);
  const percentValues = readings.map(r => r.water_level_percent);
  const minPercent = percentValues.length ? Math.min(...percentValues) : 0;
  const maxPercent = percentValues.length ? Math.max(...percentValues) : 0;
  const avgPercent = percentValues.length ? Math.round(percentValues.reduce((a, b) => a + b, 0) / percentValues.length) : 0;

  // Chart data
  const chartData = {
    labels: readings.map(r => new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [
      {
        label: 'Water Level (%)',
        data: readings.map(r => r.water_level_percent),
        borderColor: '#0284C7',
        backgroundColor: 'rgba(2, 132, 199, 0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: readings.length > 30 ? 2 : 4,
        pointHoverRadius: 6,
        borderWidth: 2
      },
      {
        label: 'Low Threshold (25%)',
        data: readings.map(() => tankData.low_threshold_percent || 25),
        borderColor: '#F59E0B',
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      },
      {
        label: 'Critical Threshold (15%)',
        data: readings.map(() => tankData.critical_threshold_percent || 15),
        borderColor: '#EF4444',
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`
        },
        grid: {
          color: '#E2E8F0'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 14,
          font: { family: 'Inter', size: 12 }
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%`
        }
      }
    }
  };

  return (
    <div>
      {/* Top action row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {onBack && (
            <button onClick={onBack} className="btn-secondary" style={{ padding: '8px 12px' }}>
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 style={{ fontSize: '22px', color: '#03045E' }}>{tankData.name} ({tankData.tank_id_code})</h2>
            <p style={{ fontSize: '13px', color: '#64748B' }}>
              Station: {tankData.station_name || 'Central'} • Coordinates: {tankData.station_latitude}, {tankData.station_longitude}
            </p>
          </div>
        </div>

        {/* Tank selector & admin config */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={tankId} 
            onChange={(e) => setTankId(e.target.value)}
            className="form-select"
            style={{ width: 'auto', fontWeight: 600 }}
          >
            {tanks.map(t => (
              <option key={t.id} value={t.tank_id_code || t.id}>
                {t.tank_id_code}: {t.name}
              </option>
            ))}
          </select>

          {isAdmin && (
            <button 
              onClick={() => setEditMode(!editMode)} 
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Settings size={15} />
              <span>{editMode ? 'Close Settings' : 'Configure Tank'}</span>
            </button>
          )}
        </div>
      </div>

      {saveMsg && (
        <div style={{ padding: '12px 18px', background: '#ECFDF5', color: '#065F46', borderRadius: '8px', marginBottom: '20px', fontWeight: 600 }}>
          {saveMsg}
        </div>
      )}

      {/* Admin Settings Form */}
      {editMode && (
        <form onSubmit={handleSaveConfig} className="stat-card" style={{ marginBottom: '24px', border: '1px solid #38BDF8' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: '#03045E' }}>Administrative Tank Parameters</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Tank Name</label>
              <input 
                className="form-input" 
                value={formData.name || ''} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Total Height (cm)</label>
              <input 
                type="number"
                className="form-input" 
                value={formData.total_height_cm || ''} 
                onChange={e => setFormData({ ...formData, total_height_cm: parseFloat(e.target.value) })} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Capacity (Liters)</label>
              <input 
                type="number"
                className="form-input" 
                value={formData.capacity_liters || ''} 
                onChange={e => setFormData({ ...formData, capacity_liters: parseInt(e.target.value) })} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Low Warning (%)</label>
              <input 
                type="number"
                className="form-input" 
                value={formData.low_threshold_percent || ''} 
                onChange={e => setFormData({ ...formData, low_threshold_percent: parseFloat(e.target.value) })} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Critical Threshold (%)</label>
              <input 
                type="number"
                className="form-input" 
                value={formData.critical_threshold_percent || ''} 
                onChange={e => setFormData({ ...formData, critical_threshold_percent: parseFloat(e.target.value) })} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Recovery Threshold (%)</label>
              <input 
                type="number"
                className="form-input" 
                value={formData.recovery_threshold_percent || ''} 
                onChange={e => setFormData({ ...formData, recovery_threshold_percent: parseFloat(e.target.value) })} 
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
            Save Configuration Changes
          </button>
        </form>
      )}

      {/* Metric Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card">
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>CURRENT WATER LEVEL</span>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0284C7', marginTop: '6px' }}>
            {tankData.current_water_percent ?? '—'}%
          </div>
          <span style={{ fontSize: '13px', color: '#475569' }}>
            Depth: {tankData.current_water_depth_cm ?? '—'} cm
          </span>
        </div>

        <div className="stat-card">
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>PERIOD MINIMUM</span>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#F59E0B', marginTop: '6px' }}>
            {minPercent}%
          </div>
          <span style={{ fontSize: '13px', color: '#475569' }}>Lowest recorded level</span>
        </div>

        <div className="stat-card">
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>PERIOD MAXIMUM</span>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#10B981', marginTop: '6px' }}>
            {maxPercent}%
          </div>
          <span style={{ fontSize: '13px', color: '#475569' }}>Peak filling mark</span>
        </div>

        <div className="stat-card">
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>PAIRED IOT HARDWARE</span>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#03045E', marginTop: '8px' }}>
            {tankData.device_id_code || 'ESP32_001'}
          </div>
          <span style={{ fontSize: '12px', color: tankData.device_status === 'ONLINE' ? '#10B981' : '#64748B', fontWeight: 600 }}>
            ● {tankData.device_status || 'ONLINE'} (Last: {tankData.last_reading_at ? new Date(tankData.last_reading_at).toLocaleTimeString() : 'No readings'})
          </span>
        </div>
      </div>

      {/* Main Historical Chart Box */}
      <div className="stat-card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '17px', color: '#03045E' }}>Telemetry Historical Trend</h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Ultrasonic distance-derived water depth & fill percentages</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
            {['24h', '7d', '30d'].map(r => (
              <button 
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: range === r ? '#FFFFFF' : 'transparent',
                  color: range === r ? '#03045E' : '#64748B',
                  boxShadow: range === r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: '340px' }}>
          {sourceError && <p role="alert">{sourceError}</p>}
            <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Recent Telemetry Readings Table */}
      <div className="table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 700, color: '#03045E' }}>
          Recent Telemetry Packets (ESP32 Ingestion)
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Sensor Distance (cm)</th>
              <th>Water Depth (cm)</th>
              <th>Water Level (%)</th>
              <th>Calculated Status</th>
            </tr>
          </thead>
          <tbody>
            {readings.slice(-10).reverse().map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{r.distance_cm} cm</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{r.water_depth_cm} cm</td>
                <td style={{ fontWeight: 700, color: '#0284C7' }}>{r.water_level_percent}%</td>
                <td>
                  <span className={`badge ${r.status === 'CRITICAL' ? 'badge-critical' : r.status === 'LOW' ? 'badge-low' : 'badge-normal'}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

