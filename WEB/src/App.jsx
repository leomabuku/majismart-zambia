import React, { useState, useEffect } from 'react';
import { api } from './services/api';
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
import LoginPage from './pages/LoginPage';

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
  // 'connecting' | 'live' | 'polling' — driven by the real SSE/polling fallback.
  const [connState, setConnState] = useState('connecting');
  const [lastSyncAt, setLastSyncAt] = useState(null);

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
    } catch (err) {
      console.error('[MajiSmart] Failed to load data:', err);
    }
  };

  // Lightweight refresh used while the SSE stream is unavailable (3 requests
  // instead of 5, so a sleeping free-tier instance is not hammered).
  const syncLive = async () => {
    const [sumRes, tkRes, altRes] = await Promise.all([
      api.get('/dashboard/summary'),
      api.get('/tanks'),
      api.get('/alerts')
    ]);
    if (sumRes.success) setSummary(sumRes.summary);
    if (tkRes.success) setTanks(tkRes.data);
    if (altRes.success) setAlerts(altRes.data);
    setLastSyncAt(new Date());
  };

  useEffect(() => {
    reloadData();

    // Subscribe to Server-Sent Events (Realtime)
    const unsubscribe = api.subscribeRealtime((event, data) => {
      if (event === 'SYNC') {
        syncLive();
        return;
      }

      setLastSyncAt(new Date());

      if (event === 'NEW_READING') {
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
    }, { onStatus: setConnState });

    return () => unsubscribe();
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

  const isConnected = connState === 'live';
  const activeAlertsCount = alerts?.filter(a => a.status === 'ACTIVE').length || 0;
  const openReportsCount = reports?.filter(r => r.status === 'SUBMITTED' || r.status === 'IN_PROGRESS').length || 0;

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        alertCount={activeAlertsCount}
        reportCount={openReportsCount}
        isLive={isConnected}
      />

      <div className="main-wrapper">
        <Topbar 
          title={getPageTitle()} 
          onRefresh={reloadData}
          lastPacket={lastTelemetry}
          isConnected={isConnected}
          onOpenMobile={() => setShowMobileApp(true)}
        />

        {showMobileApp && (
          <MobileAppSimulator 
            tanks={tanks}
            reports={reports}
            onReload={reloadData}
            onClose={() => setShowMobileApp(false)}
          />
        )}

        {connState !== 'live' && (
          <div className={`conn-banner conn-${connState}`}>
            <span className="conn-dot" />
            <span className="conn-text">
              {connState === 'connecting'
                ? 'Connecting to the MajiSmart API…'
                : 'Live stream unavailable — refreshing every 30s instead.'}
              {lastSyncAt ? ` Last sync ${lastSyncAt.toLocaleTimeString()}.` : ''}
              {' '}Free-tier servers may take up to a minute to wake.
            </span>
            <button type="button" className="conn-retry" onClick={reloadData}>Retry now</button>
          </div>
        )}

        <main className="content-area">
          {activeTab === 'dashboard' && (
            <Dashboard 
              summary={summary}
              tanks={tanks}
              alerts={alerts}
              reports={reports}
              onSelectTank={handleSelectTank}
              lastTelemetry={lastTelemetry}
            />
          )}

          {activeTab === 'analytics' && (
            <TankAnalytics 
              selectedTankId={selectedTankId}
              onBack={() => setActiveTab('dashboard')}
              tanks={tanks}
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
              tanks={tanks}
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
              lastPacket={lastTelemetry}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// Shown while the stored session is being confirmed against the API.
function BootSplash() {
  return (
    <div className="boot-splash">
      <div className="boot-logo">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="#03045E" aria-hidden="true">
          <path d="M12 2.5c3.6 4.4 6.5 8 6.5 11.4a6.5 6.5 0 1 1-13 0C5.5 10.5 8.4 6.9 12 2.5z" />
        </svg>
      </div>
      <div className="boot-text">MajiSmart Zambia</div>
      <div className="boot-sub">Restoring your session…</div>
    </div>
  );
}

// Auth gate: nothing renders until we know who is signed in.
function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!user) return <LoginPage />;
  return <MainApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
