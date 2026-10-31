import { db } from '../database/db.js';

// All filters select the submission cohort, not events occurring in the interval.
export class AnalyticsController {
  static async telemetry(req, res) {
    try {
      const {from,to,tank} = req.query;
      for (const date of [from,to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) return res.status(400).json({success:false,error:'Invalid date'});
      if (from && to && from > to) return res.status(400).json({success:false,error:'Invalid date range'});
      let where = " WHERE m.provenance = 'OPERATIONAL'";
      const params = [];
      for (const [value,clause] of [[from,'DATE(r.created_at) >= ?'],[to,'DATE(r.created_at) <= ?'],[tank,'r.tank_id = ?']]) if(value) {where += ` AND ${clause}`; params.push(value);}
      const data = await db.prepare(`SELECT r.tank_id, COUNT(*) AS observations, AVG(r.water_level_percent) AS mean_percent, MIN(r.water_level_percent) AS min_percent, MAX(r.water_level_percent) AS max_percent, SUM(CASE WHEN m.condition = 'LOW' THEN 1 ELSE 0 END) AS low_readings, SUM(CASE WHEN m.condition = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_readings FROM water_level_readings r JOIN telemetry_metadata m ON m.reading_id = r.id ${where} GROUP BY r.tank_id ORDER BY r.tank_id`).all(...params);
      res.json({success:true,data});
    } catch (err) { console.error('[Telemetry analytics]', err.message); res.status(500).json({success:false,error:'Unable to load telemetry analytics'}); }
  }
  static async reports(req, res) {
    try {
      const { from, to, category, status, station, location } = req.query;
      for (const date of [from, to]) {
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
          return res.status(400).json({ success: false, error: 'Dates must be valid YYYY-MM-DD values' });
        }
      }
      if (from && to && from > to) return res.status(400).json({ success: false, error: 'Start date must not follow end date' });
      // Exclude the three fixed baseline reports inserted by both database seeders.
      let where = " WHERE r.id NOT IN ('rep-001', 'rep-002', 'rep-003')";
      const params = [];
      for (const [value, clause] of [[from, 'DATE(r.created_at) >= ?'], [to, 'DATE(r.created_at) <= ?'], [category, 'r.category = ?'], [status, 'r.status = ?'], [station, 'r.station_id = ?'], [location, 'LOWER(r.location_name) = LOWER(?)']]) {
        if (value) { where += ` AND ${clause}`; params.push(value); }
      }
      const group = async (field) => db.prepare(`SELECT ${field} AS label, COUNT(*) AS count FROM community_reports r ${where} GROUP BY ${field} ORDER BY count DESC, label ASC`).all(...params);
      const [statuses, categories, locations, days, durations] = await Promise.all([
        group('r.status'), group('r.category'), group('r.location_name'), group('DATE(r.created_at)'),
        db.prepare(`SELECT r.created_at, (SELECT MAX(h.created_at) FROM report_status_history h WHERE h.report_id = r.id AND h.new_status = 'RESOLVED') AS resolved_at FROM community_reports r ${where} AND r.status = 'RESOLVED'`).all(...params)
      ]);
      const total = statuses.reduce((n, row) => n + Number(row.count), 0);
      const counts = Object.fromEntries(statuses.map(row => [row.label, Number(row.count)]));
      const hours = durations.map(row => (new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()) / 3600000).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
      const median = hours.length ? (hours[Math.floor((hours.length - 1) / 2)] + hours[Math.floor(hours.length / 2)]) / 2 : null;
      const eligible = total - (counts.REJECTED || 0);
      return res.json({ success: true, data: { total, statuses: counts, categories, locations, days, resolution: {
        eligible, rate_percent: eligible ? (counts.RESOLVED || 0) * 100 / eligible : null,
        observations: hours.length, mean_hours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null, median_hours: median
      } } });
    } catch (err) {
      console.error('[Analytics] Unable to aggregate reports:', err);
      return res.status(500).json({ success: false, error: 'Unable to load analytics' });
    }
  }
}
