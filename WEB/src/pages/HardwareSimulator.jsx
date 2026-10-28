import React, { useState } from 'react';
import { api } from '../services/api';
import { Cpu, Send, Play, Square, CheckCircle, AlertTriangle, AlertOctagon, Terminal } from 'lucide-react';

export default function HardwareSimulator({ onReadingSent, lastPacket }) {
  const [targetTank, setTargetTank] = useState('TANK_001');
  const [deviceId, setDeviceId] = useState('ESP32_001');
  const [distanceCm, setDistanceCm] = useState(15.5);
  const [depthCm, setDepthCm] = useState(34.5);
  const [percent, setPercent] = useState(69);
  const [status, setStatus] = useState('NORMAL');
  const [isSending, setIsSending] = useState(false);
  const [resultLog, setResultLog] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamTimer, setStreamTimer] = useState(null);

  const addLog = (msg, success = true) => {
    setResultLog(prev => [
      { time: new Date().toLocaleTimeString(), msg, success },
      ...prev.slice(0, 19)
    ]);
  };

  const transmitPayload = async (customPayload) => {
    setIsSending(true);
    const payload = customPayload || {
      device_id: deviceId,
      tank_id: targetTank,
      distance_cm: parseFloat(distanceCm),
      water_depth_cm: parseFloat(depthCm),
      water_level_percent: parseInt(percent),
      status: status
    };

    try {
      const res = await api.post('/iot/readings', payload);
      if (res.success) {
        addLog(`Ingested packet: ${payload.tank_id} | ${payload.water_level_percent}% | ${payload.status}`);
        if (onReadingSent) onReadingSent(res.data);
      } else {
        addLog(`Rejected: ${res.error}`, false);
      }
    } catch (err) {
      addLog(`Network failure: ${err.message}`, false);
    } finally {
      setIsSending(false);
    }
  };

  // Preset: Photo Format
  const sendPhotoFormat = () => {
    setDistanceCm(15.5);
    setDepthCm(34.5);
    setPercent(69);
    setStatus('NORMAL');
    transmitPayload({
      device_id: "ESP32_001",
      tank_id: "TANK_001",
      distance_cm: 15.5,
      water_depth_cm: 34.5,
      water_level_percent: 69,
      status: "NORMAL"
    });
  };

  // Preset: Critical Water Outage
  const sendCriticalPreset = () => {
    setDistanceCm(45.0);
    setDepthCm(5.0);
    setPercent(10);
    setStatus('CRITICAL');
    transmitPayload({
      device_id: deviceId,
      tank_id: targetTank,
      distance_cm: 45.0,
      water_depth_cm: 5.0,
      water_level_percent: 10,
      status: "CRITICAL"
    });
  };

  // Preset: Low Water Warning
  const sendLowPreset = () => {
    setDistanceCm(39.0);
    setDepthCm(11.0);
    setPercent(22);
    setStatus('LOW');
    transmitPayload({
      device_id: deviceId,
      tank_id: targetTank,
      distance_cm: 39.0,
      water_depth_cm: 11.0,
      water_level_percent: 22,
      status: "LOW"
    });
  };

  // Preset: Tank Refill Recovery
  const sendRecoverPreset = () => {
    setDistanceCm(7.5);
    setDepthCm(42.5);
    setPercent(85);
    setStatus('NORMAL');
    transmitPayload({
      device_id: deviceId,
      tank_id: targetTank,
      distance_cm: 7.5,
      water_depth_cm: 42.5,
      water_level_percent: 85,
      status: "NORMAL"
    });
  };

  // Automatic stream simulation
  const toggleStreaming = () => {
    if (streaming) {
      clearInterval(streamTimer);
      setStreamTimer(null);
      setStreaming(false);
      addLog('Continuous stream halted');
    } else {
      setStreaming(true);
      addLog('Started automated stream simulation (interval: 4s)');
      let currDepth = 34.5;
      let step = -1.2;

      const timer = setInterval(() => {
        currDepth = Number((currDepth + step).toFixed(1));
        if (currDepth <= 4.0) step = 2.5; // Trigger refill
        if (currDepth >= 46.0) step = -1.5; // Drain again

        const totalH = 50.0;
        const dist = Number((totalH - currDepth).toFixed(1));
        const pct = Math.min(100, Math.max(0, Math.round((currDepth / totalH) * 100)));
        const st = pct <= 15 ? 'CRITICAL' : (pct <= 25 ? 'LOW' : 'NORMAL');

        transmitPayload({
          device_id: deviceId,
          tank_id: targetTank,
          distance_cm: dist,
          water_depth_cm: currDepth,
          water_level_percent: pct,
          status: st
        });
      }, 4000);

      setStreamTimer(timer);
    }
  };

  // Auto-calculate depth when distance changes (Assuming 50cm total height)
  const handleDistanceChange = (val) => {
    const dist = parseFloat(val) || 0;
    setDistanceCm(dist);
    const depth = Math.max(0, Number((50.0 - dist).toFixed(1)));
    setDepthCm(depth);
    const pct = Math.min(100, Math.max(0, Math.round((depth / 50.0) * 100)));
    setPercent(pct);
    setStatus(pct <= 15 ? 'CRITICAL' : pct <= 25 ? 'LOW' : 'NORMAL');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', color: '#03045E' }}>ESP32 IoT Telemetry Simulator</h2>
          <p style={{ fontSize: '13px', color: '#64748B' }}>
            Interactive simulation console sending authentic ultrasonic telemetry packets matching the photo format
          </p>
        </div>

        <button 
          onClick={toggleStreaming}
          className={`btn-sim ${streaming ? 'critical' : 'primary'}`}
          style={{ padding: '8px 16px' }}
        >
          {streaming ? <Square size={16} /> : <Play size={16} />}
          <span>{streaming ? 'Stop Continuous Stream' : 'Start Continuous Stream (4s)'}</span>
        </button>
      </div>

      {/* Quick Presets Row */}
      <div className="stat-card" style={{ marginBottom: '24px', background: '#F8FAFC', border: '1px solid #CBD5E1' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '12px', color: '#03045E' }}>Hardware Scenario Presets</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <button 
            onClick={sendPhotoFormat}
            className="btn-sim primary"
            style={{ background: '#0284C7' }}
          >
            <Send size={15} />
            <span>Send Photo Format (69% NORMAL)</span>
          </button>

          <button 
            onClick={sendCriticalPreset}
            className="btn-sim critical"
          >
            <AlertOctagon size={15} />
            <span>Simulate Critical Outage (10%)</span>
          </button>

          <button 
            onClick={sendLowPreset}
            className="btn-sim"
            style={{ color: '#D97706', borderColor: '#F59E0B' }}
          >
            <AlertTriangle size={15} />
            <span>Simulate Low Water (22%)</span>
          </button>

          <button 
            onClick={sendRecoverPreset}
            className="btn-sim"
            style={{ color: '#059669', borderColor: '#10B981' }}
          >
            <CheckCircle size={15} />
            <span>Simulate Tank Refill (85%)</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Custom Packet Constructor */}
        <div className="stat-card">
          <h3 style={{ fontSize: '16px', color: '#03045E', marginBottom: '16px' }}>Construct Custom ESP32 Packet</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Device Identifier (device_id)</label>
              <input 
                className="form-input" 
                value={deviceId} 
                onChange={e => setDeviceId(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Target Tank (tank_id)</label>
              <select 
                className="form-select" 
                value={targetTank} 
                onChange={e => setTargetTank(e.target.value)}
              >
                <option value="TANK_001">TANK_001 (Lusaka Central)</option>
                <option value="TANK_002">TANK_002 (Chilenje Tower)</option>
                <option value="TANK_003">TANK_003 (Matero Reservoir)</option>
                <option value="TANK_004">TANK_004 (Chelston Depot)</option>
                <option value="TANK_005">TANK_005 (Ndola Copperbelt)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Ultrasonic Distance: <strong>{distanceCm} cm</strong> (Sensor to water surface)
            </label>
            <input 
              type="range" 
              min="2.0" 
              max="48.0" 
              step="0.5" 
              value={distanceCm} 
              onChange={e => handleDistanceChange(e.target.value)} 
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">water_depth_cm</label>
              <input 
                type="number"
                step="0.1"
                className="form-input" 
                value={depthCm} 
                onChange={e => setDepthCm(parseFloat(e.target.value))} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">water_level_percent</label>
              <input 
                type="number"
                className="form-input" 
                value={percent} 
                onChange={e => setPercent(parseInt(e.target.value))} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">status</label>
              <select 
                className="form-select" 
                value={status} 
                onChange={e => setStatus(e.target.value)}
              >
                <option value="NORMAL">NORMAL</option>
                <option value="LOW">LOW</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="SENSOR_ERROR">SENSOR_ERROR</option>
              </select>
            </div>
          </div>

          {/* JSON Preview matching Photo */}
          <div style={{ marginTop: '12px', background: '#0F172A', padding: '14px', borderRadius: '8px', color: '#93C5FD', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
            <div style={{ color: '#94A3B8', fontSize: '11px', marginBottom: '6px' }}>// Payload sent to POST /api/iot/readings:</div>
            <pre>{JSON.stringify({
  device_id: deviceId,
  tank_id: targetTank,
  distance_cm: distanceCm,
  water_depth_cm: depthCm,
  water_level_percent: percent,
  status: status
}, null, 2)}</pre>
          </div>

          <button 
            onClick={() => transmitPayload()} 
            disabled={isSending}
            className="btn-primary"
            style={{ width: '100%', marginTop: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <Send size={16} />
            <span>{isSending ? 'Transmitting to Backend...' : 'Transmit Telemetry Reading'}</span>
          </button>
        </div>

        {/* Realtime Ingestion Terminal & Packet Feed */}
        <div className="stat-card" style={{ background: '#0B0F19', color: '#E2E8F0', border: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #1E293B', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#38BDF8' }}>
              <Terminal size={16} />
              <span>Telemetry Ingestion Log</span>
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B' }}>Live Server Ingestion</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {resultLog.map((log, idx) => (
              <div key={idx} style={{ padding: '6px 10px', background: log.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', borderLeft: `3px solid ${log.success ? '#10B981' : '#EF4444'}` }}>
                <span style={{ color: '#94A3B8' }}>[{log.time}] </span>
                <span style={{ color: log.success ? '#A7F3D0' : '#FECACA' }}>{log.msg}</span>
              </div>
            ))}
            {resultLog.length === 0 && (
              <div style={{ padding: '30px', textAlign: 'center', color: '#475569' }}>
                Press any preset above or click "Transmit" to generate and observe live telemetry packets.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
