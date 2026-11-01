import test from 'node:test';
import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import crypto from 'node:crypto';
import { shutdownServer, telemetryBridge } from '../src/server.js';

const BASE_URL = 'http://localhost:5000';
const API_KEY = 'test-device-credential-123456789';
const suffix = crypto.randomUUID().slice(0,8);
const tankCode = `TEST_TANK_${suffix}`;
const deviceCode = `TEST_DEVICE_${suffix}`;
before(async () => {
  const token = await loginAsAdmin();
  const response = await fetch(`${BASE_URL}/api/installations`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({name:'Integration tank', tank_id_code:tankCode,device_id:deviceCode,device_key:API_KEY,shape:'rectangular',height_cm:50,length_cm:20,width_cm:20,empty_distance_cm:50,full_distance_cm:0,provenance:'TEST'})});
  assert.equal(response.status, 201, await response.text());
});

async function loginAsAdmin() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@majismart.zm',
      password: 'AdminPassword2026!'
    })
  });
  const data = await response.json();
  assert.ok(data.token, 'Admin token should be issued');
  return data.token;
}

function deviceRequest(payload, apiKey = API_KEY) {
  return fetch(`${BASE_URL}/api/iot/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });
}

after(async () => {
  await shutdownServer();
});

test('system health check', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ONLINE');
});

test('ingests the hardware telemetry contract', async () => {
  const response = await deviceRequest({
    device_id: deviceCode,
    tank_id: tankCode,
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 69,
    status: 'NORMAL'
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.water_level_percent, 69);
  assert.equal(body.data.status, 'NORMAL');
});

test('rejects invalid telemetry input', async () => {
  const invalidPercent = await deviceRequest({
    device_id: deviceCode,
    tank_id: tankCode,
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 140,
    status: 'NORMAL'
  });
  assert.equal(invalidPercent.status, 201); // Client-derived percentages are ignored.
  assert.equal((await invalidPercent.json()).data.water_level_percent, 69);

  const missingDevice = await deviceRequest({
    tank_id: tankCode,
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 50,
    status: 'NORMAL'
  });
  assert.equal(missingDevice.status, 400);
});

test('critical readings trigger alerts', async () => {
  const response = await deviceRequest({
    device_id: deviceCode,
    tank_id: tankCode,
    distance_cm: 45,
    water_depth_cm: 5,
    water_level_percent: 10,
    status: 'CRITICAL'
  });
  assert.equal(response.status, 201);

  const alerts = await fetch(`${BASE_URL}/api/alerts?status=ACTIVE`);
  const data = await alerts.json();
  assert.ok(data.data.some((alert) => alert.tank_id_code === tankCode && alert.severity === 'CRITICAL'));
});

test('admin can resolve a community report', async () => {
  const token = await loginAsAdmin();
  const reportResponse = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'WATER_SHORTAGE',
      title: 'Severe drought shortage',
      description: 'No piped water for 48 hours.',
      location_name: 'Chilenje Zone 3'
    })
  });
  assert.equal(reportResponse.status, 201);
  const report = await reportResponse.json();

  const updateResponse = await fetch(`${BASE_URL}/api/reports/${report.data.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'RESOLVED', admin_notes: 'Supply restored.' })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).data.status, 'RESOLVED');
});

test('rejects an invalid device key', async () => {
  const response = await deviceRequest({
    device_id: 'ESP32_UNKNOWN_01',
    tank_id: tankCode,
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 69,
    status: 'NORMAL'
  }, 'invalid-key');
  assert.equal(response.status, 401);
});

test('hides rejected reports from unauthenticated users', async () => {
  const token = await loginAsAdmin();
  const createResponse = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'OTHER',
      title: 'Privacy check report',
      description: 'Automated visibility test.',
      location_name: 'Lusaka Test Area'
    })
  });
  const created = await createResponse.json();

  const rejectResponse = await fetch(`${BASE_URL}/api/reports/${created.data.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'REJECTED', rejection_reason: 'Automated test rejection.' })
  });
  assert.equal(rejectResponse.status, 200);

  const unauthenticatedResponse = await fetch(`${BASE_URL}/api/reports/${created.data.id}`);
  assert.equal(unauthenticatedResponse.status, 404);
});

test('provisioning, authorization, revocation, rotation and calibrated persistence', async () => {
  const admin = await loginAsAdmin();
  const headers = {'Content-Type':'application/json', Authorization:`Bearer ${admin}`};
  const unknown = await deviceRequest({device_id:'unknown-device',tank_id:tankCode,distance_cm:15});
  assert.equal(unknown.status,401);
  const wrongTank = await deviceRequest({device_id:deviceCode,tank_id:'TANK_002',distance_cm:15});
  assert.equal(wrongTank.status,403);
  const impossible = await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:99});
  assert.equal(impossible.status,400);
  const critical = await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:48,status:'NORMAL'});
  assert.equal((await critical.json()).data.condition,'CRITICAL');
  const rotate = await fetch(`${BASE_URL}/api/devices/${deviceCode}/credential`,{method:'PUT',headers,body:JSON.stringify({revoke:true})});
  assert.equal(rotate.status,200);
  assert.equal((await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:15})).status,403);
  const newKey='rotated-test-credential-123456789';
  assert.equal((await fetch(`${BASE_URL}/api/devices/${deviceCode}/credential`,{method:'PUT',headers,body:JSON.stringify({revoke:false,device_key:newKey})})).status,200);
  assert.equal((await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:15})).status,401);
  assert.equal((await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:15},newKey)).status,201);
});

test('private installation, calibration tests and provenance separation', async () => {
  const admin = await loginAsAdmin();
  const customerLogin = await fetch(`${BASE_URL}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'mwape@community.zm',password:'CustomerPass2026!'})});
  const customer = await customerLogin.json();
  const headers = {'Content-Type':'application/json', Authorization:`Bearer ${admin}`};
  const code = `P_${suffix}`; const dev = `D_${suffix}`;
  const create = await fetch(`${BASE_URL}/api/installations`,{method:'POST',headers,body:JSON.stringify({name:'Private test tank',tank_id_code:code,device_id:dev,device_key:API_KEY,owner_id:customer.user.id,shape:'rectangular',height_cm:20,width_cm:10,length_cm:20,empty_distance_cm:25,full_distance_cm:5,provenance:'TEST'})});
  assert.equal(create.status,201); const id=(await create.json()).data.id;
  assert.equal((await fetch(`${BASE_URL}/api/tanks/${id}`)).status,404);
  assert.equal((await fetch(`${BASE_URL}/api/tanks/${id}`,{headers:{Authorization:`Bearer ${customer.token}`}})).status,200);
  const mine = await (await fetch(`${BASE_URL}/api/my/tanks`,{headers:{Authorization:`Bearer ${customer.token}`}})).json();
  assert.ok(mine.data.some(t=>t.id===id));
  const verify = () => fetch(`${BASE_URL}/api/installations/${id}/verify-calibration`,{method:'POST',headers,body:JSON.stringify({max_error_cm:1})});
  assert.equal((await verify()).status,400);
  for (const depth of [0,10,20]) {
    const r=await fetch(`${BASE_URL}/api/installations/${id}/calibration-tests`,{method:'POST',headers,body:JSON.stringify({distance_cm:25-depth,manual_depth_cm:depth})});
    assert.equal(r.status,201);
  }
  assert.equal((await verify()).status,200);
  const reading=await deviceRequest({device_id:dev,tank_id:code,distance_cm:15});
  assert.equal(reading.status,201); const data=(await reading.json()).data;
  assert.equal(data.water_level_percent,50); assert.equal(data.estimated_volume_l,2);
  const analytics=await (await fetch(`${BASE_URL}/api/analytics/telemetry?tank=${code}`,{headers})).json();
  assert.equal(analytics.data.length,0);
});

test('accepted telemetry persists and triggers a privacy-safe SSE invalidation', async () => {
  const controller = new AbortController();
  const stream = await fetch(`${BASE_URL}/api/realtime/stream`,{signal:controller.signal});
  assert.equal(stream.status,200);
  const reader=stream.body.getReader();
  try {
    await reader.read(); // connected comment
    const reading=await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:20},'rotated-test-credential-123456789');
    assert.equal(reading.status,201);
    const payload=(await reading.json()).data;
    const event=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE timeout')),2000))]);
    const text=new TextDecoder().decode(event.value);
    assert.match(text,/event: NEW_READING/);
    assert.ok(!text.includes(tankCode));
    const history=await (await fetch(`${BASE_URL}/api/iot/history/${tankCode}`)).json();
    assert.ok(history.data.some(r=>r.id===payload.reading_id));
  } finally { controller.abort(); }
});

test('a direct database write is relayed to SSE and fresh API reads without HTTP ingestion', async () => {
  const { db } = await import('../src/database/db.js');
  const controller = new AbortController();
  const stream = await fetch(`${BASE_URL}/api/realtime/stream`, { signal: controller.signal });
  const reader = stream.body.getReader();
  let timeout;
  try {
    await reader.read();
    await telemetryBridge.check(); // establish a baseline while the viewer is connected
    const before = await db.get('SELECT * FROM tanks WHERE tank_id_code = ?', tankCode);
    const stamp = new Date().toISOString();
    await db.run('UPDATE tanks SET current_water_percent = ?, last_reading_at = ? WHERE id = ?', 47.25, stamp, before.id);
    await telemetryBridge.check();
    const event = await Promise.race([reader.read(), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Direct database change did not reach SSE')), 2000);
    })]);
    const text = new TextDecoder().decode(event.value);
    assert.match(text, /event: NEW_READING/);
    assert.ok(!text.includes(tankCode));
    const token = await loginAsAdmin();
    const response = await fetch(`${BASE_URL}/api/tanks/${tankCode}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).data.current_water_percent, 47.25);
  } finally { clearTimeout(timeout); controller.abort(); }
});

test('calibration history is accessible to administrators only', async () => {
  const token = await loginAsAdmin();
  assert.equal((await fetch(`${BASE_URL}/api/installations`)).status, 401);
  const list = await (await fetch(`${BASE_URL}/api/installations`, {headers:{Authorization:`Bearer ${token}`}})).json();
  const installation = list.data.find(i => i.tank_id_code === tankCode);
  assert.ok(installation);
  const history = await fetch(`${BASE_URL}/api/installations/${installation.id}/calibration-tests`, {headers:{Authorization:`Bearer ${token}`}});
  assert.equal(history.status,200);
  assert.ok(Array.isArray((await history.json()).data.tests));
});

test('administrator can replace a device without allowing the old device to transmit', async () => {
  const token = await loginAsAdmin();
  const headers = {'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const list = await (await fetch(`${BASE_URL}/api/installations`, {headers})).json();
  const installation = list.data.find(i=>i.tank_id_code===tankCode);
  const newDevice = `REPLACE_${suffix}`;
  const result = await fetch(`${BASE_URL}/api/installations/${installation.id}/device`, {method:'POST',headers,body:JSON.stringify({device_id:newDevice,device_key:API_KEY})});
  assert.equal(result.status,201);
  assert.equal((await deviceRequest({device_id:deviceCode,tank_id:tankCode,distance_cm:15},'rotated-test-credential-123456789')).status,403);
  assert.equal((await deviceRequest({device_id:newDevice,tank_id:tankCode,distance_cm:15})).status,201);
});

test('new failing calibration evidence blocks verification even after older passing tests', async () => {
  const token=await loginAsAdmin(); const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const list=await (await fetch(`${BASE_URL}/api/installations`,{headers})).json();
  const installation=list.data.find(i=>i.tank_id_code===tankCode);
  const testReading=async (distance,depth)=>fetch(`${BASE_URL}/api/installations/${installation.id}/calibration-tests`,{method:'POST',headers,body:JSON.stringify({distance_cm:distance,manual_depth_cm:depth})});
  for(const [distance,depth] of [[50,0],[25,25],[0.1,50]]) assert.equal((await testReading(distance,depth)).status,201);
  const verify=()=>fetch(`${BASE_URL}/api/installations/${installation.id}/verify-calibration`,{method:'POST',headers,body:JSON.stringify({max_error_cm:1})});
  assert.equal((await verify()).status,200);
  assert.equal((await testReading(20,25)).status,201);
  assert.equal((await verify()).status,400);
  const history=await (await fetch(`${BASE_URL}/api/installations/${installation.id}/calibration-tests`,{headers})).json();
  assert.equal(history.data.installation_status,'AWAITING_CALIBRATION');
});

test('administrator can configure a legacy tank without overwriting its identity or history', async () => {
  const { db, hashPassword } = await import('../src/database/db.js');
  const id = `legacy-${suffix}`, code = `LEGACY_${suffix}`, oldDevice = `OLD_${suffix}`, nextDevice = `MIGRATED_${suffix}`;
  await db.prepare('INSERT INTO tanks (id,tank_id_code,name) VALUES (?,?,?)').run(id,code,'Existing tank');
  await db.prepare('INSERT INTO monitoring_devices (id,device_id_code,tank_id,api_key_hash) VALUES (?,?,?,?)').run(`old-${suffix}`,oldDevice,id,hashPassword(API_KEY));
  const token=await loginAsAdmin(); const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const create = () => fetch(`${BASE_URL}/api/installations`,{method:'POST',headers,body:JSON.stringify({existing_tank_id:id,device_id:nextDevice,device_key:API_KEY,shape:'rectangular',height_cm:20,width_cm:10,length_cm:20,empty_distance_cm:25,full_distance_cm:5,provenance:'TEST'})});
  const result=await create(); assert.equal(result.status,201); assert.equal((await result.json()).data.tank_id_code,code);
  assert.equal((await create()).status,409);
  const tank=await db.prepare('SELECT name,last_reading_at FROM tanks WHERE id = ?').get(id); assert.equal(tank.name,'Existing tank'); assert.equal(tank.last_reading_at,null);
  assert.equal((await deviceRequest({device_id:oldDevice,tank_id:code,distance_cm:15})).status,403);
  assert.equal((await deviceRequest({device_id:nextDevice,tank_id:code,distance_cm:15})).status,201);
});

test('device sensor faults are authenticated, persisted separately and clear on recovery', async () => {
  const { db } = await import('../src/database/db.js');
  const tank = await db.prepare('SELECT id, last_reading_at, current_water_percent FROM tanks WHERE tank_id_code = ?').get(tankCode);
  const dev = `REPLACE_${suffix}`;
  const invalid = await deviceRequest({device_id:dev,tank_id:tankCode,sensor_fault:'TIMEOUT'},'wrong-key');
  assert.equal(invalid.status,401);
  const ambiguous = await deviceRequest({device_id:dev,tank_id:tankCode,sensor_fault:'TIMEOUT',distance_cm:15},API_KEY);
  assert.equal(ambiguous.status,400);
  const fault = await deviceRequest({device_id:dev,tank_id:tankCode,sensor_fault:'TIMEOUT'},API_KEY);
  assert.equal(fault.status,202); const faultBody = await fault.json();
  const event = await db.prepare('SELECT fault_code, provenance FROM sensor_fault_events WHERE id = ?').get(faultBody.data.fault_id);
  assert.equal(event.fault_code,'TIMEOUT'); assert.equal(event.provenance,'TEST');
  const after = await db.prepare('SELECT last_reading_at,current_water_percent,current_status FROM tanks WHERE id = ?').get(tank.id);
  assert.equal(after.current_status,'SENSOR_ERROR'); assert.equal(after.last_reading_at,tank.last_reading_at); assert.equal(after.current_water_percent,tank.current_water_percent);
  const alerts=await db.prepare("SELECT id FROM water_alerts WHERE tank_id = ? AND alert_type = 'SENSOR_ERROR' AND status = 'ACTIVE'").all(tank.id);
  assert.equal(alerts.length,1);
  assert.equal((await deviceRequest({device_id:dev,tank_id:tankCode,sensor_fault:'TIMEOUT'},API_KEY)).status,202);
  assert.equal((await db.prepare("SELECT id FROM water_alerts WHERE tank_id = ? AND alert_type = 'SENSOR_ERROR' AND status = 'ACTIVE'").all(tank.id)).length,1);
  assert.equal((await deviceRequest({device_id:dev,tank_id:tankCode,distance_cm:15},API_KEY)).status,201);
  assert.equal((await db.prepare("SELECT id FROM water_alerts WHERE tank_id = ? AND alert_type = 'SENSOR_ERROR' AND status = 'ACTIVE'").all(tank.id)).length,0);
});

test('sensor fault analytics is admin-only and excludes test provenance', async () => {
  const token = await loginAsAdmin();
  const unauthorized=await fetch(`${BASE_URL}/api/analytics/sensor-faults`);
  assert.equal(unauthorized.status,401);
  const response=await fetch(`${BASE_URL}/api/analytics/sensor-faults`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(response.status,200);
  assert.ok(!(await response.json()).data.some(r=>r.tank_id===tankCode));
});

test('device reporting a sensor fault becomes offline when its heartbeat stops', async () => {
  const {db} = await import('../src/database/db.js');
  const {DeviceMonitorService} = await import('../src/services/deviceMonitorService.js');
  const dev=`REPLACE_${suffix}`;
  assert.equal((await deviceRequest({device_id:dev,tank_id:tankCode,sensor_fault:'INVALID_SAMPLE'},API_KEY)).status,202);
  await db.prepare("UPDATE monitoring_devices SET last_seen_at = ? WHERE device_id_code = ?").run('2000-01-01 00:00:00',dev);
  await DeviceMonitorService.checkOfflineDevices();
  assert.equal((await db.prepare('SELECT status FROM monitoring_devices WHERE device_id_code = ?').get(dev)).status,'OFFLINE');
  assert.equal((await db.prepare('SELECT current_status FROM tanks WHERE tank_id_code = ?').get(tankCode)).current_status,'OFFLINE');
  assert.equal((await deviceRequest({device_id:dev,tank_id:tankCode,distance_cm:15},API_KEY)).status,201);
});

test('history includes SQLite-formatted readings inside the requested window', async () => {
  const {db}=await import('../src/database/db.js');
  const id=`history-window-${suffix}`;
  const inside=new Date(Date.now()-23*3600000).toISOString().replace('T',' ').slice(0,19);
  await db.prepare('INSERT INTO water_level_readings (id,device_id,tank_id,distance_cm,water_depth_cm,water_level_percent,status,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,deviceCode,tankCode,20,30,60,'NORMAL',inside);
  const response=await (await fetch(`${BASE_URL}/api/iot/history/${tankCode}?range=24h`)).json();
  assert.ok(response.data.some(r=>r.id===id));
});

