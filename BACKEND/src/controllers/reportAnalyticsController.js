import { db, databaseMode } from '../database/db.js';
import { analyticsFilters, summarizeReports } from '../services/reportAnalytics.js';

export async function getReportAnalytics(req, res) {
  let filters;
  try { filters = analyticsFilters(req.query); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const created = databaseMode === 'supabase' ? 'r.created_at' : 'julianday(r.created_at)';
    const placeholder = databaseMode === 'supabase' ? '?' : 'julianday(?)';
    const rows = await db.all(`
      SELECT r.category, r.status, r.created_at, r.location_name,
             s.name AS station_name, h.resolved_at
      FROM community_reports r
      LEFT JOIN monitoring_stations s ON s.id = r.station_id
      LEFT JOIN (
        SELECT report_id, MAX(created_at) AS resolved_at
        FROM report_status_history
        WHERE new_status = 'RESOLVED'
          AND (previous_status IS NULL OR previous_status <> 'RESOLVED')
        GROUP BY report_id
      ) h ON h.report_id = r.id
      WHERE ${created} >= ${placeholder} AND ${created} < ${placeholder}
        ${filters.category === 'ALL' ? '' : 'AND r.category = ?'}
    `, new Date(filters.since).toISOString(), new Date(filters.until).toISOString(),
    ...(filters.category === 'ALL' ? [] : [filters.category]));
    return res.json({ success: true, data: summarizeReports(rows, filters) });
  } catch (error) {
    console.error('[ReportAnalytics] Query failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load report analytics.' });
  }
}
