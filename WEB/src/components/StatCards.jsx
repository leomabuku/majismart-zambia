import React from 'react';
import { 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  WifiOff, 
  ClipboardList 
} from 'lucide-react';

export default function StatCards({ summary }) {
  if (!summary) return null;

  const stats = [
    {
      title: 'Active Stations',
      value: summary.total_stations,
      icon: Building2,
      color: '#0077B6',
      bg: '#E0F2FE'
    },
    {
      title: 'Normal Level Tanks',
      value: summary.normal_tanks,
      icon: CheckCircle2,
      color: '#10B981',
      bg: '#ECFDF5'
    },
    {
      title: 'Low Water Tanks',
      value: summary.low_tanks,
      icon: AlertTriangle,
      color: '#F59E0B',
      bg: '#FFFBEB'
    },
    {
      title: 'Critical Tanks',
      value: summary.critical_tanks,
      icon: AlertOctagon,
      color: '#EF4444',
      bg: '#FEF2F2'
    },
    {
      title: 'Offline Devices',
      value: summary.offline_devices,
      icon: WifiOff,
      color: '#64748B',
      bg: '#F1F5F9'
    },
    {
      title: 'Open Reports',
      value: summary.open_reports,
      icon: ClipboardList,
      color: '#0284C7',
      bg: '#E0F2FE'
    }
  ];

  return (
    <div className="stat-grid">
      {stats.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div key={idx} className="stat-card">
            <div className="stat-header">
              <span>{item.title}</span>
              <div className="stat-icon-bg" style={{ background: item.bg, color: item.color }}>
                <Icon size={20} />
              </div>
            </div>
            <div className="stat-value">{item.value ?? 0}</div>
          </div>
        );
      })}
    </div>
  );
}
