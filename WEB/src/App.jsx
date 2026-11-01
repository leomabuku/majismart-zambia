import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { useTelemetry } from './context/useTelemetry';
import { usesSupabaseTelemetry } from './services/supabaseTelemetry';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import TankAnalytics from './pages/TankAnalytics';
import CommunityReports from './pages/CommunityReports';
import IncidentMap from './pages/IncidentMap';
import AlertsCenter from './pages/AlertsCenter';
import HardwareSimulator from './pages/HardwareSimulator';
import MobileAppSimulator from './components/MobileAppSimulator';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showMobileApp, setShowMobileApp] = useState(false);
  const [summary, setSummary] = useState(null);
  const [stations, setStations] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('TANK_001');
  const [lastTelemetry, setLastTelemetry] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [dataError, setDataError] = useState(null);

  const telemetry = useTelemetry(tanks, summary);

  // Load baseline data from Shared Backend
  const reloadData = async () => {
    try {
      const [sumRes, stRes, tkRes, altRes, repRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/stations'),
        api.get('/tanks'),
        api.get('/alerts'),
        api.get('/reports')
      ]);

      if (sumRes.success) setSummary(sumRes.summary);
      if (stRes.success) setStations(stRes.data);
      if (tkRes.success) setTanks(tkRes.data);
      if (altRes.success) setAlerts(altRes.data);
      if (repRes.success) setReports(repRes.data);
      setDataError([sumRes, stRes, tkRes, altRes, repRes].some(res => !res.success)
        ? 'Some dashboard data could not be loaded. Retrying automatically.' : null);
    } catch (err) {
      setDataError('Unable to load dashboard data from the API. Retrying automatically.');
      console.error('[MajiSmart] Failed to load data:', err);
    }
  };

  useEffect(() => {
    reloadData();

    // Subscribe to Server-Sent Events (Realtime)
    const unsubscribe = api.subscribeRealtime((event, data) => {
      if (!usesSupabaseTelemetry && event === 'NEW_READING') {
        setLastTelemetry(data);
      }

      if (event === 'TANK_UPDATED') {
        setTanks(prev => prev.map(t => (t.id === data.id || t.tank_id_code === data.tank_id_code) ? { ...t, ...data } : t));
        // Refresh summary metrics
        api.get('/dashboard/summary').then(res => { if (res.success) setSummary(res.summary); });
      }

      if (event === 'NEW_ALERT' || event === 'ALERT_RESOLVED' || event === 'ALERT_UPDATED') {
        api.get('/alerts').then(res => { if (res.success) setAlerts(res.data); });
        api.get('/dashboard/summary').then(res => { if (res.success) setSummary(res.summary); });
      }

      if (event === 'REPORT_CREATED' || event === 'REPORT_STATUS_CHANGED') {
        api.get('/reports').then(res => { if (res.success) setReports(res.data); });
        api.get('/dashboard/summary').then(res => { if (res.success) setSummary(res.summary); });
      }

      if (event === 'DEVICE_STATUS_CHANGED') {
        api.get('/tanks').then(res => { if (res.success) setTanks(res.data); });
        api.get('/dashboard/summary').then(res => { if (res.success) setSummary(res.summary); });
      }
    }, setIsConnected);
    const timer = setInterval(reloadData, 15000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);

  const handleSelectTank = (tankId) => {
    setSelectedTankId(tankId);
    setActiveTab('analytics');
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Water Monitoring Dashboard';
      case 'analytics': return 'Tank Telemetry Analytics';
      case 'reports': return 'Citizen Community Reports';
      case 'map': return 'Geographic Infrastructure Map';
      case 'alerts': return 'Telemetry Alerts Center';
      case 'simulator': return 'ESP32 Hardware Simulator';
      default: return 'MajiSmart Zambia';
    }
  };

  const activeAlertsCount = alerts?.filter(a => a.status === 'ACTIVE').length || 0;
  const openReportsCount = reports?.filter(r => r.status === 'SUBMITTED' || r.status === 'IN_PROGRESS').length || 0;

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        alertCount={activeAlertsCount}
        reportCount={openReportsCount}
        isLive={usesSupabaseTelemetry ? telemetry.connected : isConnected}
      />

      <div className="main-wrapper">
        <Topbar 
          title={getPageTitle()} 
          onRefresh={reloadData}
          lastPacket={usesSupabaseTelemetry ? telemetry.latest : lastTelemetry}
          isConnected={usesSupabaseTelemetry ? telemetry.connected : isConnected}
          onOpenMobile={() => setShowMobileApp(true)}
        />

        {showMobileApp && (
          <MobileAppSimulator 
            tanks={telemetry.tanks}
            reports={reports}
            onReload={reloadData}
            onClose={() => setShowMobileApp(false)}
          />
        )}

        <main className="content-area">
          {dataError && <div role="alert" style={{ padding: 16, marginBottom: 16, background: '#FFFBEB', color: '#92400E' }}>{dataError}</div>}
          {telemetry.error && <div role="alert" style={{ padding: 16, marginBottom: 16, background: '#FFFBEB', color: '#92400E' }}>{telemetry.error}</div>}
          {activeTab === 'dashboard' && (
            <Dashboard 
              summary={telemetry.summary}
              tanks={telemetry.tanks}
              alerts={alerts}
              reports={reports}
              onSelectTank={handleSelectTank}
              lastTelemetry={usesSupabaseTelemetry ? telemetry.latest : lastTelemetry}
            />
          )}

          {activeTab === 'analytics' && (
            <TankAnalytics 
              selectedTankId={selectedTankId}
              onBack={() => setActiveTab('dashboard')}
              tanks={telemetry.tanks}
            />
          )}

          {activeTab === 'reports' && (
            <CommunityReports 
              reports={reports}
              onReload={reloadData}
            />
          )}

          {activeTab === 'map' && (
            <IncidentMap 
              stations={stations}
              tanks={telemetry.tanks}
              reports={reports}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsCenter 
              alerts={alerts}
              onReload={reloadData}
            />
          )}

          {activeTab === 'simulator' && (
            <HardwareSimulator 
              onReadingSent={(data) => {
                setLastTelemetry(data);
                reloadData();
              }}
              lastPacket={usesSupabaseTelemetry ? telemetry.latest : lastTelemetry}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

