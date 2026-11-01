import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  BarChart3,
  Droplet, 
  FileText, 
  MapPin, 
  Bell, 
  Cpu, 
  LogOut, 
  User, 
  ShieldCheck,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab, alertCount, reportCount, isLive }) {
  const { user, logout, login, loading } = useAuth();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const signIn = async event => {
    event.preventDefault();
    setSigningIn(true); setLoginError('');
    try {
      const result = await login(credentials.email.trim(), credentials.password);
      if (!result.success) setLoginError(result.error || 'Sign-in failed. Check your details.');
      else setCredentials({ email: '', password: '' });
    } catch { setLoginError('Unable to sign in. Check your connection and try again.'); }
    finally { setSigningIn(false); }
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand-section">
        <div className="brand-logo">
          <div className="brand-icon">
            <Droplet size={24} color="#03045E" fill="#03045E" />
          </div>
          <div>
            <div className="brand-title">MajiSmart</div>
            <div className="brand-subtitle">Zambia IoT Water</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="nav-menu">
        {user?.role === 'admin' && <button
          className={`nav-item ${activeTab === 'report-analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('report-analytics')}
        ><BarChart3 size={18} /><span>Report Analytics</span></button>}
        <button 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Monitoring Dashboard</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Droplet size={18} />
          <span>Tanks & Analytics</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <FileText size={18} />
          <span>Community Reports</span>
          {reportCount > 0 && <span className="nav-badge" style={{ background: '#0284C7' }}>{reportCount}</span>}
        </button>

        <button 
          className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <MapPin size={18} />
          <span>Incident & Tank Map</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <Bell size={18} />
          <span>Alerts Center</span>
          {alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
        </button>

        <button 
          className={`nav-item ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
          style={{ marginTop: '12px', border: '1px dashed rgba(72, 202, 228, 0.4)' }}
        >
          <Cpu size={18} color="#48CAE4" />
          <span style={{ color: '#48CAE4' }}>ESP32 Simulator</span>
          <span className="badge-normal" style={{ fontSize: '10px', padding: '1px 5px', background: '#064E3B', color: '#6EE7B7' }}>LIVE</span>
        </button>
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        {!user && !loading && <form onSubmit={signIn} className="sidebar-signin">
          <p>Administrator / staff sign-in</p>
          <label>Email<input type="email" autoComplete="username" required value={credentials.email} onChange={e => setCredentials(c => ({ ...c, email: e.target.value }))} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={credentials.password} onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))} /></label>
          {loginError && <p role="alert">{loginError}</p>}
          <button type="submit" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>}
        {user &&
        <div className="user-profile-widget">
          <div className="user-avatar">
            {user?.full_name ? user.full_name[0] : 'U'}
          </div>
          <div className="user-info">
            <div className="user-name">{user?.full_name || 'Mulenga Banda'}</div>
            <span className="user-role-badge">
              {user?.role === 'admin' ? 'Administrator' : 'Customer'}
            </span>
          </div>
          <button 
            title="Sign out"
            onClick={logout}
            style={{ color: '#90E0EF', padding: '4px' }}
          >
            <ShieldCheck size={18} />
          </button>
        </div>}
      </div>
    </aside>
  );
}

