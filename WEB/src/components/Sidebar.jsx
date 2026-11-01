import React, { useEffect, useRef } from 'react';
import BrandMark from './BrandMark';
import {
  LayoutDashboard,
  Droplet,
  FileText,
  MapPin,
  Bell,
  Cpu,
  LogOut,
  ShieldCheck,
  User,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab, alertCount, reportCount, isLive, mobile = false, open = false, onClose }) {
  const { user, logout, isAdmin } = useAuth();
  const displayName = user?.full_name || 'Signed in';
  const roleLabel = user?.role === 'admin' ? 'Administrator' : user?.role === 'technician' ? 'Technician' : 'Customer';
  const initial = (displayName.trim()[0] || 'U').toUpperCase();

  const navigation = useRef(null);
  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.activeElement, oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = navigation.current;
    const focusable = () => [...node.querySelectorAll('button:not([disabled]), a[href], input')];
    focusable()[0]?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    node.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; node.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [mobile, open, onClose]);

  return (
    <aside id="primary-navigation" ref={navigation} className={`sidebar ${open ? 'is-open' : ''}`} role={mobile ? 'dialog' : undefined} aria-label="Main navigation" aria-modal={mobile && open ? true : undefined} aria-hidden={mobile && !open ? true : undefined} inert={mobile && !open ? true : undefined}>
      {/* Brand */}
      <div className="brand-section">
        <div className="brand-logo">
          <BrandMark size={44} />
          <div>
            <div className="brand-title">SmartWater</div>
            <div className="brand-subtitle">Zambia Smart Water</div>
          </div>
        </div>
      </div>

      <button className="navigation-close" aria-label="Close menu" onClick={onClose}>Close ×</button>
      {/* Navigation */}
      <nav className="nav-menu">
        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>{isAdmin ? 'Monitoring Dashboard' : 'Your water'}</span>
        </button>

        {isAdmin && <button
          className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Droplet size={18} />
          <span>Tanks & Analytics</span>
        </button>}

        {isAdmin && <button className={`nav-item ${activeTab === 'installation' ? 'active' : ''}`} onClick={() => setActiveTab('installation')}><Droplet size={18} /><span>Install tank</span></button>}
        {isAdmin && <button className={`nav-item ${activeTab === 'report-analytics' ? 'active' : ''}`} onClick={() => setActiveTab('report-analytics')}><FileText size={18} /><span>Report intelligence</span></button>}

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

        {isAdmin && (
          <button
            className={`nav-item ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
            style={{ marginTop: '12px', border: '1px dashed rgba(72, 202, 228, 0.4)' }}
          >
            <ShieldCheck size={18} color="#48CAE4" />
            <span style={{ color: '#48CAE4' }}>Team &amp; Roles</span>
          </button>
        )}
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

