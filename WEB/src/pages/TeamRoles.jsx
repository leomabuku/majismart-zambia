import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  UserRound,
  Wrench,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  MapPin,
  FileText,
  RefreshCw,
  Lock
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ROLE_META = {
  admin: { label: 'Administrator', icon: ShieldCheck, color: '#0284C7', bg: '#E0F2FE' },
  technician: { label: 'Technician', icon: Wrench, color: '#B45309', bg: '#FEF3C7' },
  customer: { label: 'Customer', icon: UserRound, color: '#0F766E', bg: '#CCFBF1' }
};

export default function TeamRoles() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api.get('/users');
    if (res.success) {
      setUsers(res.data || []);
    } else {
      setError(res.error || 'Could not load the team list');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (target, role) => {
    if (role === target.role) return;

    if (target.id === user?.id && role !== 'admin') {
      const sure = window.confirm(
        'You are about to remove your own administrator access. You will keep a normal account. Continue?'
      );
      if (!sure) return;
    }

    setSavingId(target.id);
    setError('');
    setNotice('');
    const res = await api.patch(`/users/${target.id}/role`, { role });
    if (res.success) {
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...res.data } : u)));
      setNotice(res.message || 'Role updated');
      // A self-demotion invalidates what the sidebar is allowed to show.
      if (target.id === user?.id) window.location.reload();
    } else {
      setError(res.error || 'Role change failed');
    }
    setSavingId(null);
  };

  if (!isAdmin) {
    return (
      <div className="empty-state-card">
        <Lock size={30} />
        <h3>Administrators only</h3>
        <p>
          Team and role management is restricted to administrator accounts. Ask an
          administrator of the utility to upgrade your access.
        </p>
      </div>
    );
  }

  const counts = users.reduce(
    (acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }),
    {}
  );

  return (
    <div className="team-page">
      <div className="page-heading">
        <div>
          <h2>Team &amp; Roles</h2>
          <p>
            Everyone with a verified SmartWater account. Changing a role takes effect
            the next time that person loads the dashboard or the mobile app.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="role-summary">
        {['admin', 'technician', 'customer'].map((role) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <div key={role} className="role-summary-card" style={{ background: meta.bg }}>
              <Icon size={18} color={meta.color} />
              <div>
                <div className="role-summary-count" style={{ color: meta.color }}>
                  {counts[role] || 0}
                </div>
                <div className="role-summary-label">{meta.label}{counts[role] === 1 ? '' : 's'}</div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="inline-alert inline-alert-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {notice && (
        <div className="inline-alert inline-alert-success">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Contact</th>
              <th>Sign-in method</th>
              <th>Reports</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '28px', color: '#64748B' }}>
                  <Loader2 size={18} className="spin" /> Loading accounts…
                </td>
              </tr>
            )}

            {!loading && users.map((person) => {
              const meta = ROLE_META[person.role] || ROLE_META.customer;
              return (
                <tr key={person.id}>
                  <td>
                    <div className="person-cell">
                      <div className="person-avatar">
                        {person.avatar_url ? (
                          <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          (person.full_name || person.email).slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="person-name">
                          {person.full_name || 'Unnamed account'}
                          {person.is_self && <span className="self-badge">You</span>}
                        </div>
                        <div className="person-id">{person.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="person-contact"><Mail size={12} /> {person.email}</div>
                    <div className="person-contact muted">
                      <MapPin size={12} /> {[person.community, person.district].filter(Boolean).join(', ') || '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`provider-badge provider-${person.auth_provider || 'password'}`}>
                      {person.auth_provider === 'google' ? 'Google' : 'Password'}
                    </span>
                  </td>
                  <td>
                    <span className="report-count"><FileText size={12} /> {person.report_count}</span>
                  </td>
                  <td>
                    <div className="role-cell">
                      <span className="role-chip" style={{ color: meta.color, background: meta.bg }}>
                        <meta.icon size={13} /> {meta.label}
                      </span>
                      <select
                        className="form-select role-select"
                        value={person.role}
                        disabled={savingId === person.id}
                        onChange={(e) => changeRole(person, e.target.value)}
                      >
                        <option value="customer">Customer</option>
                        <option value="technician">Technician</option>
                        <option value="admin">Administrator</option>
                      </select>
                      {savingId === person.id && <Loader2 size={14} className="spin" />}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && users.length === 0 && !error && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '28px', color: '#64748B' }}>
                  <Users size={18} /> No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="page-footnote">
        Administrators manage tanks, alerts, reports and roles. Technicians can be
        dispatched to incidents. Customers report leaks and follow their own reports.
        The platform always keeps at least one administrator.
      </p>
    </div>
  );
}

