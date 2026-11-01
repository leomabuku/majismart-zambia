import { db, databaseMode } from '../database/db.js';
import { analyzeReports } from '../services/reportIntelligence.js';
import { OCTOBER_DEMO } from '../services/octoberDemo.js';

// All filters select the submission cohort, not events occurring in the interval.
export class AnalyticsController {
  static async sensorFaults(req, res) {
    try {
      const {from, to} = req.query;
      for (const date of [from,to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) return res.status(400).json({success:false,error:'Invalid date'});
      if (from && to && from > to) return res.status(400).json({success:false,error:'Invalid date range'});
      let where = " WHERE f.provenance = 'OPERATIONAL'";
      const params=[];
      for (const [value,clause] of [[from,'DATE(f.created_at) >= ?'],[to,'DATE(f.created_at) <= ?']]) if(value) { where += ` AND ${clause}`; params.push(value); }
      const data = await db.prepare(`SELECT t.tank_id_code AS tank_id, f.fault_code, COUNT(*) AS observations FROM sensor_fault_events f JOIN tanks t ON t.id = f.tank_id ${where} GROUP BY t.tank_id_code,f.fault_code ORDER BY t.tank_id_code,f.fault_code`).all(...params);
      res.json({success:true,data});
    } catch (err) { console.error('[Sensor fault analytics]',err.message); res.status(500).json({success:false,error:'Unable to load sensor fault analytics'}); }
  }
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
      const {from,to,category,status,station,location} = req.query;
      const dataset = req.query.dataset || 'operational';
      if (!['operational','october-demo'].includes(dataset)) return res.status(400).json({success:false,error:'Invalid dataset'});
      for (const value of [from,to]) if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) return res.status(400).json({success:false,error:'Dates must be valid YYYY-MM-DD values'});
      if (from && to && (from>to || Date.parse(to)-Date.parse(from)>366*86400000)) return res.status(400).json({success:false,error:'Choose a range of no more than 366 days'});
      for (const value of [category,status,station,location]) if(value && (typeof value!=='string'||value.length>200)) return res.status(400).json({success:false,error:'Invalid filter'});
      const asOf=dataset==='october-demo'?OCTOBER_DEMO.asOf:new Date().toISOString();
      let where="WHERE r.id NOT IN ('rep-001','rep-002','rep-003')";
      const params=[];
      if(dataset==='october-demo') {where += " AND r.id LIKE ? AND d.provenance = 'SIMULATED'";params.push(OCTOBER_DEMO.prefix+'%');}
      else where += " AND COALESCE(d.provenance,'UNKNOWN') NOT IN ('SIMULATED','TEST')";
      const stamp=databaseMode==='supabase'?'r.created_at':'julianday(r.created_at)';
      const parameter=databaseMode==='supabase'?'?':'julianday(?)';
      where += ` AND ${stamp} <= ${parameter}`;params.push(asOf);
      if(from){where += ` AND ${stamp} >= ${parameter}`;params.push(new Date(from+'T00:00:00+02:00').toISOString());}
      if(to){where += ` AND ${stamp} < ${parameter}`;params.push(new Date(Date.parse(to+'T00:00:00+02:00')+86400000).toISOString());}
      for(const [value,clause] of [[category,'COALESCE(d.reported_category,r.category) = ?'],[status,'r.status = ?'],[station,'r.station_id = ?'],[location,'LOWER(r.location_name) = LOWER(?)']]) if(value){where += ' AND '+clause;params.push(value);}
      const rows=await db.all(`SELECT r.id,r.title,r.reporter_name,r.category,r.status,r.station_id,r.location_name,r.created_at,r.updated_at,d.reported_category,d.provenance FROM community_reports r LEFT JOIN report_submission_details d ON d.report_id=r.id ${where} ORDER BY r.created_at,r.id LIMIT 5001`,...params);
      if(rows.length>5000) return res.status(400).json({success:false,error:'More than 5000 reports match. Narrow the dates or category for complete analysis.'});
      let history=[],cases=[];
      if(rows.length){
        const marks=rows.map(()=>'?').join(','),ids=rows.map(r=>r.id);
        [history,cases]=await Promise.all([
          db.all(`SELECT id,report_id,previous_status,new_status,notes,created_at FROM report_status_history WHERE report_id IN (${marks})`,...ids),
          db.all(`SELECT id,report_id,confirmed_category,severity,suspected_cause,confirmed_cause,action_taken,outcome,assigned_to,notes,created_at FROM report_case_events WHERE report_id IN (${marks})`,...ids)
        ]);
      }
      const data=analyzeReports(rows,history,cases,{dataset,from,to,asOf});
      res.setHeader('Cache-Control','private, no-store');
      return res.json({success:true,data});
    } catch(error) {console.error('[Report intelligence]',error.message);return res.status(500).json({success:false,error:'Unable to load report intelligence'});}
  }
}
