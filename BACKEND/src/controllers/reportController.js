import { db } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';
import crypto from 'node:crypto';

function sanitizeReportForViewer(report, viewer) {
  if (viewer?.role === 'admin') return report;
  const isOwner = viewer && report.reporter_id === viewer.id;
  if (isOwner) return report;
  return {
    ...report,
    reporter_id: null,
    reporter_name: null,
    reporter_phone: null,
    reporter_name_profile: null,
    reporter_phone_profile: null
  };
}

export class ReportController {
  /**
   * GET /api/reports
   * Filterable by category, status, reporter_id
   */
  static async getAllReports(req, res) {
    try {
      const { category, status, reporter_id } = req.query;
      const isAdmin = req.user?.role === 'admin';
      let query = `
        SELECT 
          r.*,
          s.name as station_name,
          s.code as station_code,
          p.full_name as reporter_name_profile,
          p.phone_number as reporter_phone_profile
        FROM community_reports r
        LEFT JOIN monitoring_stations s ON r.station_id = s.id
        LEFT JOIN profiles p ON r.reporter_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (category) {
        query += ' AND r.category = ?';
        params.push(category);
      }
      if (status) {
        query += ' AND r.status = ?';
        params.push(status);
      }
      if (reporter_id) {
        query += ' AND r.reporter_id = ?';
        params.push(reporter_id);
      }

      if (!isAdmin) {
        if (req.user) {
          query += " AND (r.status != 'REJECTED' OR r.reporter_id = ?)";
          params.push(req.user.id);
        } else {
          query += " AND r.status != 'REJECTED'";
        }
      }

      query += ' ORDER BY r.created_at DESC';

      const reports = await db.prepare(query).all(...params);

      // Populate status history for each report
      const populated = await Promise.all(reports.map(async (rep) => {
        const history = await db.prepare(`
          SELECT h.*, p.full_name as changed_by_name
          FROM report_status_history h
          LEFT JOIN profiles p ON h.changed_by = p.id
          WHERE h.report_id = ?
          ORDER BY h.created_at ASC
        `).all(rep.id);

        return sanitizeReportForViewer({ ...rep, history }, req.user);
      }));

      return res.json({ success: true, count: populated.length, data: populated });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/reports/:id
   */
  static async getReportById(req, res) {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.role === 'admin';
      const report = await db.prepare(`
        SELECT 
          r.*,
          s.name as station_name,
          s.code as station_code,
          p.full_name as reporter_name_profile,
          p.phone_number as reporter_phone_profile
        FROM community_reports r
        LEFT JOIN monitoring_stations s ON r.station_id = s.id
        LEFT JOIN profiles p ON r.reporter_id = p.id
        WHERE r.id = ?
      `).get(id);

      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const isOwner = req.user && report.reporter_id === req.user.id;
      if (!isAdmin && report.status === 'REJECTED' && !isOwner) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const history = await db.prepare(`
        SELECT h.*, p.full_name as changed_by_name
        FROM report_status_history h
        LEFT JOIN profiles p ON h.changed_by = p.id
        WHERE h.report_id = ?
        ORDER BY h.created_at ASC
      `).all(report.id);

      const safeReport = sanitizeReportForViewer({ ...report, history }, req.user);
      return res.json({ success: true, data: safeReport });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * POST /api/reports
   * Create report from Mobile app or Web
   */
  static async createReport(req, res) {
    try {
      const { category, title, description, location_name, latitude, longitude, station_id, image_url, reporter_name, reporter_phone } = req.body;

      if (!category || !title || !description || !location_name) {
        return res.status(400).json({
          success: false,
          error: 'Required fields: category, title, description, location_name'
        });
      }

      const validCategories = ['WATER_SHORTAGE', 'PIPE_LEAKAGE', 'BURST_PIPE', 'TANK_MALFUNCTION', 'WATER_QUALITY', 'OTHER'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          error: `Invalid category. Allowed: ${validCategories.join(', ')}`
        });
      }

      const reportId = 'rep-' + crypto.randomUUID().slice(0, 8);
      const reporterId = req.user ? req.user.id : null;
      const rName = (req.user && req.user.full_name) || reporter_name || 'Community Resident';
      const rPhone = (req.user && req.user.phone_number) || reporter_phone || null;

      const created = await db.transaction(async (tx) => {
        await tx.run(`
        INSERT INTO community_reports (
          id, reporter_id, reporter_name, reporter_phone, category, title, 
          description, location_name, latitude, longitude, station_id, image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
        `, 
        reportId,
        reporterId,
        rName,
        rPhone,
        category,
        title.trim(),
        description.trim(),
        location_name.trim(),
        typeof latitude === 'number' ? latitude : null,
        typeof longitude === 'number' ? longitude : null,
        station_id || null,
        image_url || null
        );

        const historyId = 'hist-' + crypto.randomUUID().slice(0, 8);
        await tx.run(`
        INSERT INTO report_status_history (id, report_id, previous_status, new_status, changed_by, notes)
        VALUES (?, ?, NULL, 'SUBMITTED', ?, 'Report submitted via MajiSmart')
        `, historyId, reportId, reporterId);
        return tx.get('SELECT * FROM community_reports WHERE id = ?', reportId);
      });

      // Broadcast real-time event to Web Dashboard
      realtime.broadcast('REPORT_CREATED', created);

      return res.status(201).json({
        success: true,
        message: 'Water report submitted successfully',
        data: created
      });
    } catch (err) {
      console.error('[ReportController] Error creating report:', err);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * PUT /api/reports/:id/status (Admin only)
   * Lifecycle: SUBMITTED -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED -> REJECTED
   */
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, admin_notes, rejection_reason } = req.body;

      const validStatuses = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const report = await db.prepare('SELECT * FROM community_reports WHERE id = ?').get(id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const previousStatus = report.status;
      const adminId = req.user ? req.user.id : null;

      const updated = await db.transaction(async (tx) => {
        await tx.run(`
        UPDATE community_reports
        SET 
          status = ?, 
          admin_notes = COALESCE(?, admin_notes),
          rejection_reason = COALESCE(?, rejection_reason),
          updated_at = datetime('now')
        WHERE id = ?
        `, status, admin_notes || null, rejection_reason || null, id);

      // Record in audit history
        const historyId = 'hist-' + crypto.randomUUID().slice(0, 8);
        await tx.run(`
        INSERT INTO report_status_history (id, report_id, previous_status, new_status, changed_by, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        `, historyId, id, previousStatus, status, adminId, admin_notes || rejection_reason || `Status updated to ${status}`);
        return tx.get('SELECT * FROM community_reports WHERE id = ?', id);
      });

      // Broadcast to mobile app and web dashboard
      realtime.broadcast('REPORT_STATUS_CHANGED', {
        report_id: id,
        previous_status: previousStatus,
        new_status: status,
        admin_notes: admin_notes || null,
        rejection_reason: rejection_reason || null,
        updated_at: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: `Report status updated from ${previousStatus} to ${status}`,
        data: updated
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}
