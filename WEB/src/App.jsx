import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/api';
import { createRefreshQueue } from './services/refreshQueue';
import { latestTankPacket, mergeTankReadings, newestPacket } from './services/telemetryView';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import BrandMark from './components/BrandMark';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import TankAnalytics from './pages/TankAnalytics';
import ReportAnalytics from './pages/ReportAnalytics';
import TankInstallation from './pages/TankInstallation';
import CustomerHome from './pages/CustomerHome';
import CommunityReports from './pages/CommunityReports';
import IncidentMap from './pages/IncidentMap';
import AlertsCenter from './pages/AlertsCenter';
import TeamRoles from './pages/TeamRoles';
import HardwareSimulator from './pages/HardwareSimulator';
import MobileAppSimulator from './components/MobileAppSimulator';
import LoginPage from './pages/LoginPage';

function MainApp() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const closeNavigation = useCallback(() => setNavOpen(false), []);
  const navigate = useCallback(tab => { setActiveTab(tab); setNavOpen(false); }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => { setIsCompact(query.matches); if (!query.matches) setNavOpen(false); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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
  const [telemetryRevision, setTelemetryRevision] = useState(0);
  const refreshQueue = useRef(null);

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
      if (tkRes.success) { setTanks(prev => mergeTankReadings(prev, tkRes.data)); setLastTelemetry(prev => newestPacket(prev, latestTankPacket(tkRes.data))); }
      if (altRes.success) setAlerts(altRes.data);
      if (repRes.success) setReports(repRes.data);
      setLastSyncAt(new Date());
    } catch (err) {
      console.error('[MajiSmart] Failed to load data:', err);
    }
  };

  useEffect(() => {
    const queue = createRefreshQueue(reloadData, error => console.error('[Realtime] Refresh failed:', error));
    let lastSummaryAt = 0, lastFullAt = Date.now(), streamState = 'connecting', summaryBusy = false;
    const readings = createRefreshQueue(async () => {
      const res = await api.get('/tanks');
      if (res.success) {
        setTanks(prev => mergeTankReadings(prev, res.data));
        setLastTelemetry(prev => newestPacket(prev, latestTankPacket(res.data)));
        setLastSyncAt(new Date());
        setTelemetryRevision(value => value + 1);
      }
      if (!summaryBusy && Date.now() - lastSummaryAt >= 5000) {
        lastSummaryAt = Date.now(); summaryBusy = true;
        void api.get('/dashboard/summary').then(sum => { if (sum.success) setSummary(sum.summary); }).finally(() => { summaryBusy = false; });
      }
    });
    refreshQueue.current = queue;
    void queue.request();
    const unsubscribe = api.subscribeRealtime(event => {
      if (['NEW_READING', 'TANK_UPDATED', 'DEVICE_STATUS_CHANGED'].includes(event) || (event === 'SYNC' && streamState === 'polling')) {
        void readings.request();
        if (streamState === 'polling' && Date.now() - lastFullAt >= 15000) {
          lastFullAt = Date.now(); void queue.request();
        }
      } else {
        lastFullAt = Date.now(); void queue.request();
      }
    }, { onStatus: next => { streamState = next; setConnState(next); } });
    return () => { readings.close(); queue.close(); unsubscribe(); refreshQueue.current = null; };
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
      case 'report-analytics': return 'Report intelligence';
      case 'map': return 'Geographic Infrastructure Map';
      case 'alerts': return 'Telemetry Alerts Center';
      case 'simulator': return 'ESP32 Hardware Simulator';
      case 'team': return 'Team & Role Management';
      default: return 'SmartWater Zambia';
    }
  };

  const isConnected = connState === 'live';
  const activeAlertsCount = alerts?.filter(a => a.status === 'ACTIVE').length || 0;
  const openReportsCount = reports?.filter(r => r.status === 'SUBMITTED' || r.status === 'IN_PROGRESS').length || 0;

  return (
    <div className={`app-container ${activeTab === 'report-analytics' ? 'analysis-view' : ''}`}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navigate}
        mobile={isCompact}
        open={navOpen}
        onClose={closeNavigation}
        alertCount={activeAlertsCount}
        reportCount={openReportsCount}
        isLive={isConnected}
      />

      {isCompact && navOpen && <button className="navigation-backdrop" aria-label="Dismiss navigation" onClick={closeNavigation} />}
      <div className="main-wrapper" inert={isCompact && navOpen ? true : undefined}>
        <Topbar
          title={getPageTitle()}
          menuOpen={navOpen}
          onMenuClick={() => setNavOpen(v => !v)}
          onRefresh={() => refreshQueue.current?.request()}
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
                ? 'Connecting to the SmartWater API…'
                : 'Live stream unavailable — checking tank readings every second.'}
              {lastSyncAt ? ` Last sync ${lastSyncAt.toLocaleTimeString()}.` : ''}
              {' '}Free-tier servers may take up to a minute to wake.
            </span>
            <button type="button" className="conn-retry" onClick={reloadData}>Retry now</button>
          </div>
        )}

        <main className="content-area">
          {activeTab === 'dashboard' && !isAdmin && <CustomerHome onReport={() => setActiveTab('reports')} />}
          {activeTab === 'dashboard' && isAdmin && (
            <Dashboard
              summary={summary}
              tanks={tanks}
              alerts={alerts}
              reports={reports}
              onSelectTank={handleSelectTank}
              lastTelemetry={lastTelemetry}
            />
          )}

          {activeTab === 'analytics' && isAdmin && (
            <TankAnalytics
              refreshVersion={telemetryRevision}
              selectedTankId={selectedTankId}
              onBack={() => setActiveTab('dashboard')}
              tanks={tanks}
            />
          )}

          {activeTab === 'installation' && isAdmin && <TankInstallation stations={stations} tanks={tanks} onSaved={reloadData} />}

          {activeTab === 'report-analytics' && isAdmin && <ReportAnalytics stations={stations} />}

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
              isAdmin={isAdmin}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsCenter
              alerts={alerts}
              onReload={reloadData}
            />
          )}

          {activeTab === 'simulator' && isAdmin && (
            <HardwareSimulator
              onReadingSent={(data) => {
                setLastTelemetry(data);
                reloadData();
              }}
              lastPacket={lastTelemetry}
            />
          )}
          {activeTab === 'team' && isAdmin && <TeamRoles />}

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
        <BrandMark size={48} />
      </div>
      <div className="boot-text">SmartWater Zambia</div>
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

