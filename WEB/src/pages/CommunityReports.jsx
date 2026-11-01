import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ReportLocationCard from '../components/ReportLocationCard';
import CaseManagement from '../components/CaseManagement';
import { 
  Plus, 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  MessageSquare,
  MapPin,
  Calendar
} from 'lucide-react';

export default function CommunityReports({ reports, onReload }) {
  const { user, isAdmin } = useAuth();
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedReport, setSelectedReport] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [statusAction, setStatusAction] = useState({ status: '', notes: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // New report form state
  const [newReport, setNewReport] = useState({
    category: 'WATER_SHORTAGE',
    title: '',
    description: '',
    location_name: '',
    latitude: null,
    longitude: null,
    location_accuracy_m: null,
    location_source: 'MANUAL'
  });
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote('This browser cannot share a location.');
      return;
    }
    setLocating(true);
    setLocationNote('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewReport((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          location_accuracy_m: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
          location_source: pos.coords.accuracy && pos.coords.accuracy <= 60 ? 'GPS' : 'NETWORK'
        }));
        setLocationNote(
          `Pinned at ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` +
          (pos.coords.accuracy ? ` (±${Math.round(pos.coords.accuracy)} m)` : '')
        );
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationNote(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Type the street name instead.'
            : 'Could not get a GPS fix. Type the street name instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const filtered = reports.filter(r => {
    if (!isAdmin && r.reporter_id !== user?.id) return false;
    if (filterCategory !== 'ALL' && (r.reported_category || r.category) !== filterCategory) return false;
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedReport || !statusAction.status) return;

    setSubmitting(true);
    try {
      const res = await api.put(`/reports/${selectedReport.id}/status`, {
        status: statusAction.status,
        admin_notes: statusAction.notes,
        rejection_reason: statusAction.status === 'REJECTED' ? statusAction.reason : null
      });

      if (res.success) {
        setSelectedReport(null);
        setStatusAction({ status: '', notes: '', reason: '' });
        onReload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReport = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = { ...newReport, observed_at: newReport.observed_at ? new Date(newReport.observed_at).toISOString() : null };
      const res = await api.post('/reports', payload);
      if (res.success) {
        setShowNewModal(false);
        setNewReport({
          category: 'WATER_SHORTAGE',
          title: '',
          description: '',
          location_name: '',
          latitude: null,
          longitude: null,
          location_accuracy_m: null,
          location_source: 'MANUAL'
        });
        setLocationNote('');
        onReload();
      } else { setSubmitError(`${res.error || 'Submission not confirmed'}. Check your reports before retrying to avoid duplicates.`); }
    } catch (err) {
      setSubmitError('Submission not confirmed. Check your reports before retrying to avoid duplicates.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB' }}>Submitted</span>;
      case 'ACKNOWLEDGED':
        return <span className="badge" style={{ background: '#F5F3FF', color: '#7C3AED' }}>Acknowledged</span>;
      case 'IN_PROGRESS':
        return <span className="badge" style={{ background: '#FFFBEB', color: '#D97706' }}>In Progress</span>;
      case 'RESOLVED':
        return <span className="badge" style={{ background: '#ECFDF5', color: '#059669' }}>Resolved</span>;
      case 'REJECTED':
        return <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626' }}>Rejected</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', color: '#03045E' }}>Community Water Reports</h2>
          <p style={{ fontSize: '13px', color: '#64748B' }}>
            Citizen-submitted alerts on leakages, water cuts, burst pipes, and quality issues
          </p>
        </div>

        <button 
          onClick={() => setShowNewModal(true)} 
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} />
          <span>Submit Incident Report</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '16px', background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B' }}>
          <Filter size={16} />
          <span style={{ fontWeight: 600 }}>Filter:</span>
        </div>

        <select 
          value={filterCategory} 
          onChange={e => setFilterCategory(e.target.value)} 
          className="form-select"
          style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
        >
          <option value="ALL">All Categories</option>
          <option value="WATER_SHORTAGE">Water Shortage</option>
          <option value="PIPE_LEAKAGE">Pipe Leakage</option>
          <option value="BURST_PIPE">Burst Pipe</option>
          <option value="LOW_PRESSURE">Low Pressure</option>
          <option value="WATER_INTERRUPTION">Water Interruption</option>
          <option value="DAMAGED_INFRASTRUCTURE">Damaged Infrastructure</option>
          <option value="MONITORING_FAULT">Monitoring Fault</option>
          <option value="TANK_MALFUNCTION">Tank Malfunction</option>
          <option value="WATER_QUALITY">Water Quality</option>
          <option value="OTHER">Other Issues</option>
        </select>

        <select 
          value={filterStatus} 
          onChange={e => setFilterStatus(e.target.value)} 
          className="form-select"
          style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Reports Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Category</th>
              <th>Incident Title & Location</th>
              <th>Reporter</th>
              <th>Date Submitted</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(report => (
              <tr key={report.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: '#0077B6' }}>
                  {report.id}
                </td>
                <td>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    {(report.reported_category || report.category).replaceAll('_', ' ')}
                  </span>
                </td>
                <td>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{report.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <MapPin size={12} /> {report.location_name}
                  </div>
                </td>
                <td style={{ fontSize: '13px' }}>
                  <div>{report.reporter_name_profile || report.reporter_name || 'Resident'}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>{report.reporter_phone_profile || report.reporter_phone || 'No phone'}</div>
                </td>
                <td style={{ fontSize: '12px', color: '#64748B' }}>
                  {new Date(report.created_at).toLocaleDateString()} {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td>
                  {getStatusBadge(report.status)}
                </td>
                <td>
                  <button 
                    onClick={() => {
                      setSelectedReport(report);
                      setStatusAction({ status: report.status, notes: report.admin_notes || '', reason: report.rejection_reason || '' });
                    }}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    View & Manage
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>
                  No community reports match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Report Lifecycle & Detail Modal */}
      {selectedReport && (
        <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#0077B6', fontWeight: 700 }}>{selectedReport.id}</span>
                <h3 style={{ fontSize: '18px', color: '#03045E', marginTop: '2px' }}>{selectedReport.title}</h3>
              </div>
              <button onClick={() => setSelectedReport(null)} style={{ color: '#94A3B8', fontSize: '20px' }}>&times;</button>
            </div>

            <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              <p><strong>Description:</strong> {selectedReport.description}</p>
              <p><strong>Customer-reported category:</strong> {(selectedReport.reported_category || selectedReport.category).replaceAll('_', ' ')}</p>
              {selectedReport.reported_severity && <p><strong>Customer-reported severity:</strong> {selectedReport.reported_severity}</p>}
              {selectedReport.ongoing && <p><strong>Still ongoing (reported):</strong> {selectedReport.ongoing}</p>}
              {selectedReport.observed_at && <p><strong>Observed:</strong> {new Date(selectedReport.observed_at).toLocaleString()}</p>}
              {selectedReport.affected_area && <p><strong>Affected area (reported):</strong> {selectedReport.affected_area}</p>}
              <p style={{ marginTop: '6px' }}><strong>Location:</strong> {selectedReport.location_name}</p>
              <p style={{ marginTop: '6px' }}>
                <strong>Reporter:</strong>{' '}
                {selectedReport.reporter_name_profile || selectedReport.reporter_name || 'Resident'}
                {' '}({selectedReport.reporter_phone_profile || selectedReport.reporter_phone || 'no phone on file'})
              </p>
              <p style={{ marginTop: '6px' }}>
                <strong>Submitted:</strong> {new Date(selectedReport.created_at).toLocaleString()}
              </p>
              {selectedReport.admin_notes && (
                <p style={{ marginTop: '6px', color: '#0284C7' }}><strong>Current Admin Notes:</strong> {selectedReport.admin_notes}</p>
              )}
            </div>

            {/* GPS fix, directions and photo evidence */}
            <ReportLocationCard report={selectedReport} />
            {isAdmin && <CaseManagement reportId={selectedReport.id} />}

            {/* Lifecycle History Audit Timeline */}
            <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#03045E' }}>Status Progression History</h4>
            <div style={{ borderLeft: '2px solid #E2E8F0', paddingLeft: '14px', marginLeft: '6px', marginBottom: '20px' }}>
              {selectedReport.history?.map((h, idx) => (
                <div key={idx} style={{ marginBottom: '10px', position: 'relative' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0077B6', position: 'absolute', left: '-19px', top: '4px' }} />
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>
                    {h.previous_status ? `${h.previous_status} → ` : ''}{h.new_status}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {h.notes || 'Status updated'} • {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Admin Status Update Form */}
            {isAdmin ? (
              <form onSubmit={handleUpdateStatus} style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', marginBottom: '12px', color: '#03045E' }}>Update Report Lifecycle State</h4>
                <div className="form-group">
                  <label className="form-label">Lifecycle Stage</label>
                  <select 
                    value={statusAction.status}
                    onChange={e => setStatusAction({ ...statusAction, status: e.target.value })}
                    className="form-select"
                  >
                    <option value="SUBMITTED">SUBMITTED</option>
                    <option value="ACKNOWLEDGED">ACKNOWLEDGED (Under review)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS (Technicians dispatched)</option>
                    <option value="RESOLVED">RESOLVED (Restored)</option>
                    <option value="REJECTED">REJECTED (Invalid / Duplicate)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {statusAction.status === 'REJECTED' ? 'Reason for Rejection *' : 'Administrative Dispatch Notes'}
                  </label>
                  <textarea 
                    className="form-textarea"
                    rows="3"
                    value={statusAction.status === 'REJECTED' ? statusAction.reason : statusAction.notes}
                    onChange={e => {
                      if (statusAction.status === 'REJECTED') {
                        setStatusAction({ ...statusAction, reason: e.target.value });
                      } else {
                        setStatusAction({ ...statusAction, notes: e.target.value });
                      }
                    }}
                    placeholder="Enter dispatch notes, actions taken, or citizen communication details..."
                    required={statusAction.status === 'REJECTED'}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" onClick={() => setSelectedReport(null)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? 'Updating...' : 'Save & Synchronize to Mobile'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                * Log in as an Administrator to update report statuses and record maintenance actions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Report Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', color: '#03045E', marginBottom: '16px' }}>Submit Water Incident Report</h3>
            <form onSubmit={handleCreateReport}>
              {submitError && <p role="alert" style={{color: "#b91c1c"}}>{submitError}</p>}
              <div className="form-group">
                <label className="form-label">Category</label>
                <select 
                  className="form-select"
                  value={newReport.category}
                  onChange={e => setNewReport({ ...newReport, category: e.target.value })}
                >
                  <option value="WATER_SHORTAGE">Water Shortage</option>
                  <option value="PIPE_LEAKAGE">Pipe Leakage</option>
                  <option value="BURST_PIPE">Burst Pipe</option>
                  <option value="LOW_PRESSURE">Low Pressure</option>
          <option value="WATER_INTERRUPTION">Water Interruption</option>
          <option value="DAMAGED_INFRASTRUCTURE">Damaged Infrastructure</option>
          <option value="MONITORING_FAULT">Monitoring Fault</option>
          <option value="TANK_MALFUNCTION">Tank Malfunction</option>
                  <option value="WATER_QUALITY">Water Quality Concern</option>
                  <option value="OTHER">Other Issue</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Incident Summary Title *</label>
                <input 
                  className="form-input"
                  required
                  placeholder="e.g. Major pipe leak near Market 4"
                  value={newReport.title}
                  onChange={e => setNewReport({ ...newReport, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Location / Community *</label>
                <input 
                  className="form-input"
                  required
                  placeholder="e.g. Chilenje South, Plot 24"
                  value={newReport.location_name}
                  onChange={e => setNewReport({ ...newReport, location_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Pin the exact spot</label>
                <div className="geo-capture-row">
                  <button
                    type="button"
                    className="btn-secondary geo-capture-btn"
                    onClick={useMyLocation}
                    disabled={locating}
                  >
                    <MapPin size={14} /> {locating ? 'Getting GPS fix…' : 'Use my current location'}
                  </button>
                  {newReport.latitude != null && (
                    <span className="geo-capture-chip">
                      {newReport.latitude.toFixed(5)}, {newReport.longitude.toFixed(5)}
                      {newReport.location_accuracy_m ? ` ±${newReport.location_accuracy_m} m` : ''}
                    </span>
                  )}
                </div>
                {locationNote && <p className="geo-capture-note">{locationNote}</p>}
              </div>

              <div className="form-group">
                <label className="form-label">When did you observe it? (optional)</label>
                <input className="form-input" type="datetime-local" value={newReport.observed_at || ''} onChange={e => setNewReport({ ...newReport, observed_at: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Your assessment of severity (optional)</label>
                <select className="form-select" value={newReport.reported_severity || ''} onChange={e => setNewReport({ ...newReport, reported_severity: e.target.value })}><option value="">Not stated</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="UNKNOWN">Not sure</option></select>
              </div>
              <div className="form-group">
                <label className="form-label">Is it still happening? (optional)</label>
                <select className="form-select" value={newReport.ongoing || ''} onChange={e => setNewReport({ ...newReport, ongoing: e.target.value })}><option value="">Not stated</option><option value="YES">Yes</option><option value="NO">No</option><option value="UNKNOWN">Not sure</option></select>
              </div>
              <div className="form-group"><label className="form-label">Affected area (optional; avoid names or personal details)</label><input className="form-input" maxLength="255" value={newReport.affected_area || ''} onChange={e => setNewReport({ ...newReport, affected_area: e.target.value })} /></div>
              <div className="form-group">
                <label className="form-label">Detailed Description *</label>
                <textarea 
                  className="form-textarea"
                  rows="3"
                  required
                  placeholder="Describe severity, how long it has been ongoing, and number of households affected..."
                  value={newReport.description}
                  onChange={e => setNewReport({ ...newReport, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowNewModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
