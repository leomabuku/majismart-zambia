import crypto from 'node:crypto';
import { db } from '../database/db.js';
import { realtime } from '../services/realtimeService.js';

const options = {
  confirmed_category: ['UNCLASSIFIED','COMPLETE_INTERRUPTION','REDUCED_SUPPLY','LOW_PRESSURE','MINOR_LEAK','MAJOR_LEAK','BURST_PIPE','DAMAGED_CONNECTION','UNDERGROUND_LEAK','TANK_LEAK','STRUCTURAL_DAMAGE','OVERFLOW','FAULTY_INLET','FAULTY_OUTLET','DAMAGED_VALVE','DISCOLORATION','UNUSUAL_SMELL','CONTAMINATION','SENSOR_MALFUNCTION','DEVICE_OFFLINE','INACCURATE_READING','POWER_FAILURE','COMMUNICATION_FAILURE','OTHER'],
  severity: ['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL'],
  action_taken: ['NONE','INSPECTION','REPAIR','REPLACEMENT','FLUSHING','RESTORE_SUPPLY','ESCALATED','OTHER'],
  outcome: ['PENDING','RESOLVED','PARTIALLY_RESOLVED','INVALID','OTHER']
};
export class CaseController {
  static async list(req,res) {
    const report = await db.prepare('SELECT id FROM community_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({success:false,error:'Report not found'});
    const events = await db.prepare('SELECT e.*, p.full_name AS actor_name FROM report_case_events e LEFT JOIN profiles p ON p.id = e.actor_id WHERE e.report_id = ? ORDER BY e.created_at ASC, e.id ASC').all(req.params.id);
    res.json({success:true,data:events});
  }
  static async create(req,res) {
    try {
      const b = req.body || {};
      for (const [key, allowed] of Object.entries(options)) if (b[key] && !allowed.includes(b[key])) return res.status(400).json({success:false,error:`Invalid ${key}`});
      for (const key of ['suspected_cause','confirmed_cause','findings','assigned_to','notes']) if (b[key] != null && (typeof b[key] !== 'string' || b[key].length > 2000)) return res.status(400).json({success:false,error:`Invalid ${key}`});
      const report = await db.prepare('SELECT id FROM community_reports WHERE id = ?').get(req.params.id);
      if (!report) return res.status(404).json({success:false,error:'Report not found'});
      const id = 'case-' + crypto.randomUUID();
      await db.prepare(`INSERT INTO report_case_events (id,report_id,actor_id,confirmed_category,severity,suspected_cause,confirmed_cause,findings,action_taken,outcome,assigned_to,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.params.id, req.user.id, ...['confirmed_category','severity','suspected_cause','confirmed_cause','findings','action_taken','outcome','assigned_to','notes'].map(k => b[k] || null));
      realtime.broadcast('REPORT_STATUS_CHANGED', {});
      res.status(201).json({success:true,data:{id}});
    } catch (err) { console.error('[Case]', err.message); res.status(500).json({success:false,error:'Unable to save case event'}); }
  }
}
