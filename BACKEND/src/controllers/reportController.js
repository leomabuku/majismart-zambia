import { db } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';
import crypto from 'node:crypto';

// Photo evidence arrives as base64 from the Android camera (or a https URL from
// the dashboard). Inline data URLs keep the pilot working without provisioning
// a storage bucket; Supabase Storage is the next step once photo volume grows.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function normalisePhoto({ image_url, photo_base64, photo_mime }) {
  if (typeof photo_base64 === 'string' && photo_base64.trim()) {
    const mime = String(photo_mime || 'image/jpeg').toLowerCase();
    if (!ALLOWED_PHOTO_MIME.includes(mime)) {
      return { error: 'Photo must be a JPEG, PNG or WebP image' };
    }
    const raw = photo_base64.includes(',') ? photo_base64.split(',').pop() : photo_base64;
    const approxBytes = Math.floor((raw.length * 3) / 4);
    if (approxBytes > MAX_PHOTO_BYTES) {
      return { error: 'Photo is larger than 2 MB after compression' };
    }
    return { value: `data:${mime === 'image/jpg' ? 'image/jpeg' : mime};base64,${raw}` };
  }

  if (typeof image_url === 'string' && /^https?:\/\//i.test(image_url.trim())) {
    return { value: image_url.trim() };
  }

  return { value: null };
}

function sanitizeReportForViewer(report, viewer) {
  if (viewer?.role === 'admin') return report;
  const isOwner = viewer && report.reporter_id === viewer.id;
  const safeHistory = (report.history || []).map(({ notes, changed_by, changed_by_name, ...event }) => event);
  const safe = { ...report, admin_notes: null, rejection_reason: isOwner ? report.rejection_reason : null, history: safeHistory };
  if (isOwner) return safe;
  return {
    ...safe,
    affected_area: null,
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
          r.*, d.reported_category, d.observed_at, d.reported_severity, d.ongoing, d.affected_area,
          s.name as station_name,
          s.code as station_code,
          p.full_name as reporter_name_profile,
          p.phone_number as reporter_phone_profile
        FROM community_reports r
        LEFT JOIN report_submission_details d ON d.report_id = r.id
        LEFT JOIN monitoring_stations s ON r.station_id = s.id
        LEFT JOIN profiles p ON r.reporter_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (category) {
        query += ' AND COALESCE(d.reported_category, r.category) = ?';
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

      query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
      // Bounded by default so a free-tier instance never loads the whole table.
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      params.push(limit, offset);

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
          r.*, d.reported_category, d.observed_at, d.reported_severity, d.ongoing, d.affected_area,
          s.name as station_name,
          s.code as station_code,
          p.full_name as reporter_name_profile,
          p.phone_number as reporter_phone_profile
        FROM community_reports r
        LEFT JOIN report_submission_details d ON d.report_id = r.id
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
      const {
        category, title, description, location_name, latitude, longitude,
        location_accuracy_m, location_source, station_id, image_url,
        photo_base64, photo_mime, reporter_name, reporter_phone, observed_at, reported_severity, ongoing, affected_area
      } = req.body;

      if (typeof category !== 'string' || typeof title !== 'string' || !title.trim() || typeof description !== 'string' || !description.trim() || typeof location_name !== 'string' || !location_name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Required fields: category, title, description, location_name'
        });
      }

      const validCategories = ['WATER_SHORTAGE', 'PIPE_LEAKAGE', 'BURST_PIPE', 'LOW_PRESSURE', 'WATER_INTERRUPTION', 'DAMAGED_INFRASTRUCTURE', 'TANK_MALFUNCTION', 'MONITORING_FAULT', 'WATER_QUALITY', 'OTHER'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          error: `Invalid category. Allowed: ${validCategories.join(', ')}`
        });
      }

      if (reported_severity && !['LOW','MEDIUM','HIGH','UNKNOWN'].includes(reported_severity)) return res.status(400).json({success:false,error:'Invalid reported severity'});
      if (ongoing && !['YES','NO','UNKNOWN'].includes(ongoing)) return res.status(400).json({success:false,error:'Invalid ongoing value'});
      if (affected_area != null && (typeof affected_area !== 'string' || affected_area.length > 255)) return res.status(400).json({success:false,error:'Invalid affected area'});
      if (observed_at && (typeof observed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(observed_at) || !Number.isFinite(Date.parse(observed_at)) || Date.parse(observed_at) > Date.now() + 300000)) return res.status(400).json({success:false,error:'Observation time must be a valid, non-future timezone-qualified timestamp'});
      const legacyCategory = ['WATER_SHORTAGE','PIPE_LEAKAGE','BURST_PIPE','TANK_MALFUNCTION','WATER_QUALITY','OTHER'].includes(category) ? category : 'OTHER';

      const photo = normalisePhoto({ image_url, photo_base64, photo_mime });
      if (photo.error) {
        return res.status(400).json({ success: false, error: photo.error });
      }

      // Number(null) is 0, which would place every manual report at 0,0 - treat
      // null/undefined/'' as "no value" instead.
      const toNumber = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const lat = toNumber(latitude);
      const lng = toNumber(longitude);
      const hasPin = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      const accuracy = toNumber(location_accuracy_m);
      const source = typeof location_source === 'string' && location_source.trim()
        ? location_source.trim().toUpperCase().slice(0, 20)
        : (hasPin ? 'GPS' : 'MANUAL');

      const reportId = 'rep-' + crypto.randomUUID().slice(0, 8);
      const reporterId = req.user ? req.user.id : null;
      const rName = (req.user && req.user.full_name) || reporter_name || 'Community Resident';
      const rPhone = (req.user && req.user.phone_number) || reporter_phone || null;

      const created = await db.transaction(async (tx) => {
        await tx.run(`
        INSERT INTO community_reports (
          id, reporter_id, reporter_name, reporter_phone, category, title, 
          description, location_name, latitude, longitude, location_accuracy_m,
          location_source, station_id, image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
        `, 
        reportId,
        reporterId,
        rName,
        rPhone,
        legacyCategory,
        title.trim(),
        description.trim(),
        location_name.trim(),
        hasPin ? lat : null,
        hasPin ? lng : null,
        accuracy !== null && accuracy >= 0 ? Math.round(accuracy * 100) / 100 : null,
        source,
        station_id || null,
        photo.value
        );

        // Unknown provenance is explicit: the server cannot infer whether a
        // human submission is operational or a test from its content.
        await tx.run(`INSERT INTO report_submission_details (report_id,reported_category,observed_at,reported_severity,ongoing,affected_area,provenance) VALUES (?,?,?,?,?,?,'UNKNOWN')`, reportId,category,observed_at || null,reported_severity || null,ongoing || null,affected_area?.trim() || null);

        const historyId = 'hist-' + crypto.randomUUID().slice(0, 8);
        await tx.run(`
        INSERT INTO report_status_history (id, report_id, previous_status, new_status, changed_by, notes)
        VALUES (?, ?, NULL, 'SUBMITTED', ?, 'Report submitted via SmartWater')
        `, historyId, reportId, reporterId);
        return tx.get('SELECT r.*, d.reported_category, d.observed_at, d.reported_severity, d.ongoing, d.affected_area FROM community_reports r LEFT JOIN report_submission_details d ON d.report_id = r.id WHERE r.id = ?', reportId);
      });

      // Broadcast real-time event to Web Dashboard
      realtime.broadcast('REPORT_CREATED', { report_id: created.id });

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
