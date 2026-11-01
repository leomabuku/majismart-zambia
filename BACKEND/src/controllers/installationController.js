import crypto from 'node:crypto';
import { db, hashPassword, databaseMode } from '../database/db.js';
import { calculateMeasurement } from '../lib/tankGeometry.js';
import { classifyCondition } from '../lib/tankCondition.js';

const str = x => typeof x === 'string' ? x.trim() : '';
const nullable = x => x === '' || x == null ? null : x;
export class InstallationController {
  static async list(req, res) {
    try {
      const data = await db.prepare(`SELECT t.id, t.tank_id_code, t.name, t.station_id, s.name AS station_name,
          i.installation_status, i.calibration_date, i.owner_id, p.full_name AS owner_name, p.email AS owner_email,
          i.provenance, i.shape, i.height_cm, i.diameter_cm, i.nominal_capacity_l,
          (SELECT d.device_id_code FROM monitoring_devices d WHERE d.tank_id = t.id AND d.is_active = TRUE ORDER BY d.created_at DESC, d.id DESC LIMIT 1) AS device_id_code
        FROM tanks t JOIN tank_installations i ON i.tank_id = t.id
        LEFT JOIN profiles p ON p.id = i.owner_id
        LEFT JOIN monitoring_stations s ON s.id = t.station_id
        ORDER BY t.tank_id_code LIMIT 500`).all();
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
  // Admins provisioning tanks in bulk should not have to invent unique codes.
  // Anything derivable is derived; explicit values still win.
  static async nextTankCode() {
    const rows = await db.prepare("SELECT tank_id_code FROM tanks WHERE UPPER(tank_id_code) LIKE 'TANK%'").all();
    let max = 0;
    for (const row of rows) {
      const match = /^TANK_(\d+)$/.exec(String(row.tank_id_code || '').toUpperCase());
      if (match) max = Math.max(max, Number(match[1]));
    }
    for (let i = max + 1; i < max + 500; i += 1) {
      const code = `TANK_${String(i).padStart(3, '0')}`;
      if (!(await db.prepare('SELECT id FROM tanks WHERE tank_id_code = ?').get(code))) return code;
    }
    throw new Error('Unable to allocate a tank identifier');
  }

  static async nextDeviceId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = `DEV_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      if (!(await db.prepare('SELECT id FROM monitoring_devices WHERE device_id_code = ?').get(code))) return code;
    }
    throw new Error('Unable to allocate a device identifier');
  }

  static async create(req, res) {
    const b = req.body || {};
    try {
      const existingId = str(b.existing_tank_id);
      const requestedCode = str(b.tank_id_code);
      if (requestedCode && !/^[A-Za-z0-9_-]{1,50}$/.test(requestedCode)) throw new Error('Tank identifier may only use letters, digits, hyphen and underscore');
      const requestedDevice = str(b.device_id);
      if (requestedDevice && !/^[A-Za-z0-9_-]{1,50}$/.test(requestedDevice)) throw new Error('Device identifier may only use letters, digits, hyphen and underscore');
      if (b.device_key != null && b.device_key !== '' && (typeof b.device_key !== 'string' || b.device_key.length < 24 || b.device_key.length > 256)) {
        throw new Error('A device credential must be 24–256 characters, or omitted to generate one');
      }

      // Auto-assigned identity: tank code, device id and device credential.
      const tankCode = existingId ? null : (requestedCode || await InstallationController.nextTankCode());
      const tankName = existingId ? null : (str(b.name) || `Tank ${tankCode}`);
      const deviceCode = requestedDevice || await InstallationController.nextDeviceId();
      const generatedKey = b.device_key ? null : crypto.randomBytes(24).toString('base64url');
      const deviceKey = generatedKey || b.device_key;

      const existing = existingId ? await db.prepare('SELECT id,tank_id_code FROM tanks WHERE id = ?').get(existingId) : null;
      if (existingId && !existing) return res.status(404).json({success:false,error:'Existing tank not found'});
      if (existingId && await db.prepare('SELECT tank_id FROM tank_installations WHERE tank_id = ?').get(existingId)) return res.status(409).json({success:false,error:'Tank already has an installation; use calibration or device replacement'});
      const num = key => b[key] === '' || b[key] == null ? null : Number(b[key]);
      const config = { shape: b.shape, height_cm: num('height_cm'), diameter_cm: num('diameter_cm'), length_cm: num('length_cm'), width_cm: num('width_cm'), empty_distance_cm: num('empty_distance_cm'), full_distance_cm: num('full_distance_cm'), dead_zone_cm: num('dead_zone_cm') ?? 0, tolerance_cm: num('tolerance_cm') ?? 0 };
      const offset = num('measurement_offset_cm') ?? 0;
      if (!Number.isFinite(offset) || Math.abs(offset) > 1000) throw new Error('Invalid measurement offset');
      if (b.mounting_position && b.mounting_position !== 'TOP') throw new Error('Only top-mounted sensors are supported');
      const measurement = calculateMeasurement(config, config.empty_distance_cm);
      const provenance = b.provenance || 'UNKNOWN';
      if (!['OPERATIONAL', 'SIMULATED', 'TEST', 'UNKNOWN'].includes(provenance)) throw new Error('Invalid provenance');
      // A SIMULATED tank can be driven by the API's own DEMO_MODE synthetic
      // telemetry, which authenticates with the shared IOT_API_KEY. The credential
      // is then never handed out, because it is not a per-device secret.
      const useDemoCredential = b.use_demo_credential === true;
      if (useDemoCredential && provenance !== 'SIMULATED') throw new Error('The shared demo credential can only be used for SIMULATED installations');
      if (useDemoCredential && !process.env.IOT_API_KEY) throw new Error('IOT_API_KEY is not configured on this server, so demo telemetry cannot authenticate');
      const autoCalibrate = b.auto_calibrate === true;
      if (autoCalibrate && !['SIMULATED', 'TEST'].includes(provenance)) {
        throw new Error('Automatic calibration approval is only allowed for SIMULATED or TEST installations; real sensors need manual tests');
      }
      const lat = num('latitude'), lng = num('longitude');
      if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))) throw new Error('Provide valid latitude and longitude together');
      const nominal = num('nominal_capacity_l');
      if (nominal !== null && (!Number.isFinite(nominal) || nominal <= 0)) throw new Error('Nominal capacity must be positive');
      const critical = num('critical_threshold') ?? 15, low = num('low_threshold') ?? 25, warning = num('warning_threshold') ?? 40, hysteresis = num('hysteresis') ?? 2;
      classifyCondition(50, null, {critical, low, warning, hysteresis});
      if (b.station_id && !(await db.prepare('SELECT id FROM monitoring_stations WHERE id = ?').get(b.station_id))) throw new Error('Station not found');
      if (b.owner_id && !(await db.prepare('SELECT id FROM profiles WHERE id = ?').get(b.owner_id))) throw new Error('Owner not found');
      if ((!existingId && await db.prepare('SELECT id FROM tanks WHERE tank_id_code = ?').get(tankCode)) || await db.prepare('SELECT id FROM monitoring_devices WHERE device_id_code = ?').get(deviceCode)) return res.status(409).json({success:false, error:'Tank or device ID already exists'});
      const id = existingId || `tank-${crypto.randomUUID()}`, deviceId = `dev-${crypto.randomUUID()}`;
      const calibratedAt = new Date().toISOString();
      await db.transaction(async tx => {
        if (existingId) {
          // Do not infer calibration from old values. Retain history but clear the
          // last-known display until the newly provisioned sensor reports.
          await tx.run("UPDATE monitoring_devices SET is_active = FALSE, status = 'OFFLINE', tank_id = NULL, updated_at = datetime('now') WHERE tank_id = ?", id);
          await tx.run("UPDATE tanks SET total_height_cm = ?, usable_height_cm = ?, capacity_liters = ?, critical_threshold_percent = ?, low_threshold_percent = ?, current_status = 'OFFLINE', last_reading_at = NULL, updated_at = datetime('now') WHERE id = ?", config.height_cm, config.height_cm, Math.max(1, Math.round(nominal || measurement.usable_capacity_l)), critical, low, id);
        } else {
          await tx.run(`INSERT INTO tanks (id,tank_id_code,name,station_id,total_height_cm,usable_height_cm,capacity_liters,critical_threshold_percent,low_threshold_percent,current_status) VALUES (?,?,?,?,?,?,?,?,?,'OFFLINE')`, id, tankCode, tankName, nullable(b.station_id), config.height_cm, config.height_cm, Math.max(1, Math.round(nominal || measurement.usable_capacity_l)), critical, low);
        }
        await tx.run(`INSERT INTO tank_installations (tank_id,owner_id,address,community,latitude,longitude,shape,height_cm,diameter_cm,length_cm,width_cm,nominal_capacity_l,empty_distance_cm,full_distance_cm,measurement_offset_cm,dead_zone_cm,tolerance_cm,sensor_model,mounting_position,installer_notes,warning_threshold,hysteresis,provenance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, nullable(b.owner_id), nullable(b.address), nullable(b.community), lat, lng, config.shape, config.height_cm, config.diameter_cm, config.length_cm, config.width_cm, nominal, config.empty_distance_cm, config.full_distance_cm, offset, config.dead_zone_cm, config.tolerance_cm, nullable(b.sensor_model), nullable(b.mounting_position), nullable(b.installer_notes), warning, hysteresis, provenance);
        const credentialHash = useDemoCredential ? hashPassword(process.env.IOT_API_KEY) : hashPassword(deviceKey);
        await tx.run(`INSERT INTO monitoring_devices (id,device_id_code,tank_id,api_key_hash,status) VALUES (?,?,?,?,'OFFLINE')`, deviceId, deviceCode, id, credentialHash);
        if (autoCalibrate) {
          // Demo/simulated only: record the three band tests the verifier needs and
          // approve them, so a bulk-provisioned demo tank can ingest immediately.
          for (const percent of [20, 50, 80]) {
            const manualDepth = Number((config.height_cm * percent / 100).toFixed(2));
            const rawDistance = Number((config.empty_distance_cm - manualDepth - offset).toFixed(2));
            const result = calculateMeasurement(config, rawDistance + offset);
            await tx.run('INSERT INTO tank_calibration_tests (id,tank_id,actor_id,raw_distance_cm,manual_depth_cm,calculated_depth_cm,depth_error_cm,created_at) VALUES (?,?,?,?,?,?,?,?)', `cal-${crypto.randomUUID()}`, id, req.user.id, rawDistance, manualDepth, result.water_depth_cm, result.water_depth_cm - manualDepth, calibratedAt);
          }
          await tx.run("UPDATE tank_installations SET installation_status = 'CALIBRATED', calibration_date = ?, updated_at = ? WHERE tank_id = ?", calibratedAt, calibratedAt, id);
        }
      });
      return res.status(201).json({success:true, data:{
        id,
        tank_id_code: existing ? existing.tank_id_code : tankCode,
        name: existing ? null : tankName,
        device_id: deviceCode,
        // Returned once, at creation. The API never stores the plaintext credential.
        device_key: useDemoCredential ? null : generatedKey,
        demo_credential: useDemoCredential,
        owner_id: nullable(b.owner_id),
        station_id: nullable(b.station_id),
        installation_status: autoCalibrate ? 'CALIBRATED' : 'AWAITING_CALIBRATION',
        calculated_capacity_l: measurement.usable_capacity_l,
        provenance
      }});
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
      const now = new Date().toISOString();
      await db.transaction(async tx => {
        await tx.run('INSERT INTO tank_calibration_tests (id,tank_id,actor_id,raw_distance_cm,manual_depth_cm,calculated_depth_cm,depth_error_cm,created_at) VALUES (?,?,?,?,?,?,?,?)',id,req.params.id,req.user.id,distance_cm,manual_depth_cm,result.water_depth_cm,error,now);
        // New evidence requires review before the installation is again called calibrated.
        await tx.run("UPDATE tank_installations SET installation_status = 'AWAITING_CALIBRATION', updated_at = ? WHERE tank_id = ?",now,req.params.id);
      });
      res.status(201).json({success:true,data:{id,calculated_depth_cm:result.water_depth_cm,depth_error_cm:error,estimated_volume_l:result.estimated_volume_l}});
    } catch { res.status(400).json({success:false,error:'Invalid measurement or calibration'}); }
  }
  static async verifyCalibration(req, res) {
    const tolerance = req.body?.max_error_cm;
    if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0) return res.status(400).json({success:false,error:'Positive maximum error in cm required'});
    const config = await db.prepare('SELECT * FROM tank_installations WHERE tank_id = ?').get(req.params.id);
    if (!config) return res.status(404).json({success:false,error:'Installation not found'});
    const tests = await db.prepare('SELECT manual_depth_cm, depth_error_cm FROM tank_calibration_tests WHERE tank_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(req.params.id);
    // Use the latest test in each band; old passing tests must not mask new failures.
    const latest = [0,1,2].map(i => tests.find(t => i === 0 ? t.manual_depth_cm <= config.height_cm * 0.25 : i === 1 ? t.manual_depth_cm > config.height_cm * 0.25 && t.manual_depth_cm < config.height_cm * 0.75 : t.manual_depth_cm >= config.height_cm * 0.75));
    if (!latest.every(t => t && Math.abs(Number(t.depth_error_cm)) <= tolerance)) return res.status(400).json({success:false,error:'Passing low, middle and high manual-depth tests are required'});
    const now = new Date().toISOString();
    await db.prepare("UPDATE tank_installations SET installation_status = 'CALIBRATED', calibration_date = ?, updated_at = ? WHERE tank_id = ?").run(now,now,req.params.id);
    res.json({success:true,data:{installation_status:'CALIBRATED',calibration_date:now}});
  }
  // Replacing a device never changes the installation or rewrites its readings.
  static async replaceDevice(req, res) {
    try {
      const body = req.body || {};
      const installation = await db.prepare('SELECT tank_id FROM tank_installations WHERE tank_id = ?').get(req.params.id);
      if (!installation) return res.status(404).json({success:false,error:'Configured installation not found'});
      // Identifiers and credentials are generated when the caller omits them.
      const deviceCode = str(body.device_id) || await InstallationController.nextDeviceId();
      if (!/^[A-Za-z0-9_-]{1,50}$/.test(deviceCode)) return res.status(400).json({success:false,error:'Device identifier may only use letters, digits, hyphen and underscore'});
      if (body.device_key != null && body.device_key !== '' && (typeof body.device_key !== 'string' || body.device_key.length < 24 || body.device_key.length > 256)) {
        return res.status(400).json({success:false,error:'A device credential must be 24–256 characters, or omitted to generate one'});
      }
      const generatedKey = body.device_key ? null : crypto.randomBytes(24).toString('base64url');
      const deviceKey = generatedKey || body.device_key;
      if (await db.prepare('SELECT id FROM monitoring_devices WHERE device_id_code = ?').get(deviceCode)) return res.status(409).json({success:false,error:'Device ID already exists; rotate its credential instead'});
      await db.transaction(async tx => {
        // Detach and revoke previous devices so a single live device is associated.
        await tx.run("UPDATE monitoring_devices SET is_active = FALSE, status = 'OFFLINE', tank_id = NULL, updated_at = datetime('now') WHERE tank_id = ?", req.params.id);
        await tx.run("INSERT INTO monitoring_devices (id,device_id_code,tank_id,api_key_hash,status) VALUES (?,?,?,?,'OFFLINE')", `dev-${crypto.randomUUID()}`, deviceCode, req.params.id, hashPassword(deviceKey));
        await tx.run("UPDATE tanks SET current_status = 'OFFLINE', updated_at = datetime('now') WHERE id = ?", req.params.id);
      });
      res.status(201).json({success:true,data:{device_id:deviceCode,device_key:generatedKey,status:'OFFLINE'}});
    } catch (error) { console.error('[Device replacement]', error.message); res.status(500).json({success:false,error:'Unable to replace device'}); }
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
