import React from 'react';
import { 
  LayoutDashboard, 
  Droplet, 
  FileText, 
  MapPin, 
  Bell, 
  Cpu, 
  LogOut, 
  User,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab, alertCount, reportCount, isLive }) {
  const { user, logout } = useAuth();
  const displayName = user?.full_name || 'Signed in';
  const roleLabel = user?.role === 'admin' ? 'Administrator' : user?.role === 'technician' ? 'Technician' : 'Customer';
  const initial = (displayName.trim()[0] || 'U').toUpperCase();

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand-section">
        <div className="brand-logo">
          <div className="brand-icon">
            <Droplet size={24} color="#03045E" fill="#03045E" />
          </div>
          <div>
            <div className="brand-title">SmartWater</div>
            <div className="brand-subtitle">Zambia Smart Water</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="nav-menu">
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
        <div className="user-profile-widget">
          <div className="user-avatar">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
            ) : (
              initial
            )}
          </div>
          <div className="user-info">
            <div className="user-name" title={user?.email || ''}>{displayName}</div>
            <span className="user-role-badge">{roleLabel}</span>
          </div>
          <button
            type="button"
            className="logout-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={logout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
