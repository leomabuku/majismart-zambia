import crypto from 'node:crypto';
import { db, hashPassword, databaseMode } from '../database/db.js';
import { calculateMeasurement } from '../lib/tankGeometry.js';
import { classifyCondition } from '../lib/tankCondition.js';

const str = x => typeof x === 'string' ? x.trim() : '';
const nullable = x => x === '' || x == null ? null : x;
export class InstallationController {
  static async list(req, res) {
    try {
      const data = await db.prepare(`SELECT t.id, t.tank_id_code, t.name, i.installation_status, i.calibration_date FROM tanks t JOIN tank_installations i ON i.tank_id = t.id ORDER BY t.name LIMIT 500`).all();
      res.json({success:true,data});
    } catch (error) { console.error('[Installation list]', error.message); res.status(500).json({success:false,error:'Unable to load installations'}); }
  }
  static async calibrationHistory(req, res) {
    try {
      const installation = await db.prepare('SELECT installation_status, calibration_date FROM tank_installations WHERE tank_id = ?').get(req.params.id);
      if (!installation) return res.status(404).json({success:false,error:'Installation not found'});
      const tests = await db.prepare(`SELECT t.id, t.raw_distance_cm, t.manual_depth_cm, t.calculated_depth_cm, t.depth_error_cm, t.created_at, p.full_name AS actor_name FROM tank_calibration_tests t LEFT JOIN profiles p ON p.id = t.actor_id WHERE t.tank_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 100`).all(req.params.id);
      res.json({success:true,data:{...installation,tests}});
    } catch (error) { console.error('[Calibration history]', error.message); res.status(500).json({success:false,error:'Unable to load calibration history'}); }
  }
  static async create(req, res) {
    const b = req.body || {};
    try {
      if (!str(b.name) || !/^[A-Za-z0-9_-]{1,50}$/.test(str(b.tank_id_code)) || !/^[A-Za-z0-9_-]{1,50}$/.test(str(b.device_id)) || typeof b.device_key !== 'string' || b.device_key.length < 24 || b.device_key.length > 256) throw new Error('Name, tank ID, device ID and a device credential of 24–256 characters are required');
      const num = key => b[key] === '' || b[key] == null ? null : Number(b[key]);
      const config = { shape: b.shape, height_cm: num('height_cm'), diameter_cm: num('diameter_cm'), length_cm: num('length_cm'), width_cm: num('width_cm'), empty_distance_cm: num('empty_distance_cm'), full_distance_cm: num('full_distance_cm'), dead_zone_cm: num('dead_zone_cm') ?? 0, tolerance_cm: num('tolerance_cm') ?? 0 };
      const offset = num('measurement_offset_cm') ?? 0;
      if (!Number.isFinite(offset) || Math.abs(offset) > 1000) throw new Error('Invalid measurement offset');
      if (b.mounting_position && b.mounting_position !== 'TOP') throw new Error('Only top-mounted sensors are supported');
      const measurement = calculateMeasurement(config, config.empty_distance_cm);
      const provenance = b.provenance || 'UNKNOWN';
      if (!['OPERATIONAL', 'SIMULATED', 'TEST', 'UNKNOWN'].includes(provenance)) throw new Error('Invalid provenance');
      const lat = num('latitude'), lng = num('longitude');
      if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))) throw new Error('Provide valid latitude and longitude together');
      const nominal = num('nominal_capacity_l');
      if (nominal !== null && (!Number.isFinite(nominal) || nominal <= 0)) throw new Error('Nominal capacity must be positive');
      const critical = num('critical_threshold') ?? 15, low = num('low_threshold') ?? 25, warning = num('warning_threshold') ?? 40, hysteresis = num('hysteresis') ?? 2;
      classifyCondition(50, null, {critical, low, warning, hysteresis});
      if (b.station_id && !(await db.prepare('SELECT id FROM monitoring_stations WHERE id = ?').get(b.station_id))) throw new Error('Station not found');
      if (b.owner_id && !(await db.prepare('SELECT id FROM profiles WHERE id = ?').get(b.owner_id))) throw new Error('Owner not found');
      if (await db.prepare('SELECT id FROM tanks WHERE tank_id_code = ?').get(str(b.tank_id_code)) || await db.prepare('SELECT id FROM monitoring_devices WHERE device_id_code = ?').get(str(b.device_id))) return res.status(409).json({success:false, error:'Tank or device ID already exists'});
      const id = `tank-${crypto.randomUUID()}`, deviceId = `dev-${crypto.randomUUID()}`;
      await db.transaction(async tx => {
        await tx.run(`INSERT INTO tanks (id,tank_id_code,name,station_id,total_height_cm,usable_height_cm,capacity_liters,critical_threshold_percent,low_threshold_percent,current_status) VALUES (?,?,?,?,?,?,?,?,?,'OFFLINE')`, id, str(b.tank_id_code), str(b.name), nullable(b.station_id), config.height_cm, config.height_cm, Math.max(1, Math.round(nominal || measurement.usable_capacity_l)), critical, low);
        await tx.run(`INSERT INTO tank_installations (tank_id,owner_id,address,community,latitude,longitude,shape,height_cm,diameter_cm,length_cm,width_cm,nominal_capacity_l,empty_distance_cm,full_distance_cm,measurement_offset_cm,dead_zone_cm,tolerance_cm,sensor_model,mounting_position,installer_notes,warning_threshold,hysteresis,provenance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, nullable(b.owner_id), nullable(b.address), nullable(b.community), lat, lng, config.shape, config.height_cm, config.diameter_cm, config.length_cm, config.width_cm, nominal, config.empty_distance_cm, config.full_distance_cm, offset, config.dead_zone_cm, config.tolerance_cm, nullable(b.sensor_model), nullable(b.mounting_position), nullable(b.installer_notes), warning, hysteresis, provenance);
        await tx.run(`INSERT INTO monitoring_devices (id,device_id_code,tank_id,api_key_hash,status) VALUES (?,?,?,?,'OFFLINE')`, deviceId, str(b.device_id), id, hashPassword(b.device_key));
      });
      return res.status(201).json({success:true, data:{id, tank_id_code:str(b.tank_id_code), device_id:str(b.device_id), installation_status:'AWAITING_CALIBRATION', calculated_capacity_l:measurement.usable_capacity_l}});
    } catch (err) { console.error('[Installation]', err.message); return res.status(400).json({success:false, error:err.message}); }
  }
  static async calibrationTest(req, res) {
    const config = await db.prepare('SELECT * FROM tank_installations WHERE tank_id = ?').get(req.params.id);
    if (!config) return res.status(404).json({success:false,error:'Installation not found'});
    const { distance_cm, manual_depth_cm } = req.body || {};
    if (typeof manual_depth_cm !== 'number' || !Number.isFinite(manual_depth_cm) || manual_depth_cm < 0 || manual_depth_cm > config.height_cm || typeof distance_cm !== 'number') return res.status(400).json({success:false,error:'Valid measured distance and manual depth required'});
    try {
      const result = calculateMeasurement(config, distance_cm + Number(config.measurement_offset_cm));
      const id = `cal-${crypto.randomUUID()}`;
      const error = result.water_depth_cm - manual_depth_cm;
      await db.prepare('INSERT INTO tank_calibration_tests (id,tank_id,actor_id,raw_distance_cm,manual_depth_cm,calculated_depth_cm,depth_error_cm) VALUES (?,?,?,?,?,?,?)').run(id,req.params.id,req.user.id,distance_cm,manual_depth_cm,result.water_depth_cm,error);
      res.status(201).json({success:true,data:{id,calculated_depth_cm:result.water_depth_cm,depth_error_cm:error,estimated_volume_l:result.estimated_volume_l}});
    } catch { res.status(400).json({success:false,error:'Invalid measurement or calibration'}); }
  }
  static async verifyCalibration(req, res) {
    const tolerance = req.body?.max_error_cm;
    if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0) return res.status(400).json({success:false,error:'Positive maximum error in cm required'});
    const config = await db.prepare('SELECT * FROM tank_installations WHERE tank_id = ?').get(req.params.id);
    if (!config) return res.status(404).json({success:false,error:'Installation not found'});
    const tests = await db.prepare('SELECT manual_depth_cm, depth_error_cm FROM tank_calibration_tests WHERE tank_id = ? ORDER BY created_at DESC LIMIT 100').all(req.params.id);
    // Require distinct low, middle and high manual fill levels, all within tolerance.
    const qualifying = tests.filter(t => Math.abs(Number(t.depth_error_cm)) <= tolerance);
    if (![0.25,0.5,0.75].every((x,i) => qualifying.some(t => i===0 ? t.manual_depth_cm <= config.height_cm*x : i===1 ? t.manual_depth_cm > config.height_cm*0.25 && t.manual_depth_cm < config.height_cm*0.75 : t.manual_depth_cm >= config.height_cm*x))) return res.status(400).json({success:false,error:'Passing low, middle and high manual-depth tests are required'});
    const now = new Date().toISOString();
    await db.prepare("UPDATE tank_installations SET installation_status = 'CALIBRATED', calibration_date = ?, updated_at = ? WHERE tank_id = ?").run(now,now,req.params.id);
    res.json({success:true,data:{installation_status:'CALIBRATED',calibration_date:now}});
  }
  static async deviceCredential(req, res) {
    const { device_id } = req.params; const { device_key, revoke } = req.body || {};
    if (typeof revoke !== 'boolean' && (typeof device_key !== 'string' || device_key.length < 24 || device_key.length > 256)) return res.status(400).json({success:false,error:'Supply a new credential (24–256 characters) or revoke flag'});
    const device = await db.prepare('SELECT id FROM monitoring_devices WHERE device_id_code = ?').get(device_id);
    if (!device) return res.status(404).json({success:false,error:'Device not found'});
    if (typeof device_key === 'string' && device_key.length >= 24 && device_key.length <= 256) await db.prepare('UPDATE monitoring_devices SET api_key_hash = ? WHERE id = ?').run(hashPassword(device_key), device.id);
    if (typeof revoke === 'boolean') await db.prepare('UPDATE monitoring_devices SET is_active = ? WHERE id = ?').run(databaseMode === 'supabase' ? !revoke : Number(!revoke), device.id);
    res.json({success:true});
  }
}
