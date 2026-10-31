import test from 'node:test';
import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import crypto from 'node:crypto';
import { shutdownServer } from '../src/server.js';

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
