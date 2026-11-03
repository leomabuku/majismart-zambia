import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { parseNearby, haversine, nearby } from '../src/services/geospatialService.js';
import { db } from '../src/database/db.js';
import { shutdownServer } from '../src/server.js';

const base = 'http://localhost:5000/api';
const q = '?latitude=-15.4&longitude=28.3&radiusMeters=5000';
async function token(email, password) {
  const response = await fetch(`${base}/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
  return (await response.json()).token;
}
const auth = token => ({ Authorization: `Bearer ${token}` });
after(async () => {
  await db.run("DELETE FROM gis_water_points WHERE id LIKE 'gis-test-%'");
  await db.run("DELETE FROM community_reports WHERE id LIKE 'gis-test-%'");
  await shutdownServer();
});

test('coordinate, radius and limit validation is strict', () => {
  assert.deepEqual(parseNearby({latitude:'-15.4', longitude:'28.3'}), {latitude:-15.4,longitude:28.3,radiusMeters:5000,limit:50});
  for (const bad of [{latitude:'91',longitude:'28'}, {latitude:'-15',longitude:'181'}, {latitude:'',longitude:'28'}, {latitude:'0',longitude:'0'}, {latitude:'1;SELECT 1',longitude:'28'}, {latitude:'NaN',longitude:'28'}]) assert.throws(() => parseNearby(bad));
  for (const radiusMeters of ['0','-1','50001','1e3','Infinity']) assert.throws(() => parseNearby({latitude:'1',longitude:'2',radiusMeters}));
  for (const limit of ['0','101','2.5']) assert.throws(() => parseNearby({latitude:'1',longitude:'2',limit}));
  assert.ok(Math.abs(haversine(0, 0, 0, 1) - 111195) < 10);
});

test('PostGIS SQL is parameterized, indexed and not used for SQLite or unknown modes', async () => {
  let sql, params;
  const mock = { all: async (s, ...p) => { sql=s; params=p; return []; } };
  const input = parseNearby({latitude:'-15.4',longitude:'28.3'});
  await nearby(mock, 'supabase', 'water-points', input);
  assert.match(sql, /ST_DWithin/); assert.match(sql, /gis_point::extensions.geography/);
  assert.deepEqual(params, [28.3,-15.4,28.3,-15.4,5000,50]);
  await nearby(mock, 'sqlite', 'reports', input);
  assert.doesNotMatch(sql, /ST_DWithin|geography|gis_point/);
  await assert.rejects(() => nearby(mock,'invalid','reports',input), /Unsupported/);
});

test('administrator nearby search filters privacy, verification, provenance and invalid points', async () => {
  const admin = await token('admin@majismart.zm', process.env.SEED_ADMIN_PASSWORD || 'AdminPassword2026!');
  const customer = await token('mwape@community.zm', process.env.SEED_CUSTOMER_PASSWORD || 'CustomerPass2026!');
  assert.ok(admin && customer);
  assert.equal((await fetch(`${base}/gis/nearby/reports${q}`)).status,401);
  assert.equal((await fetch(`${base}/gis/nearby/reports${q}`,{headers:auth(customer)})).status,403);
  assert.equal((await fetch(`${base}/gis/nearby/reports?latitude=91&longitude=28`,{headers:auth(admin)})).status,400);
  assert.equal((await fetch(`${base}/gis/nearby/reports${q}&limit=101`,{headers:auth(admin)})).status,400);
  await db.run("INSERT INTO gis_water_points (id,name,type,latitude,longitude,source,verification_status,operational_status) VALUES (?,?,?,?,?,?,?,?)",'gis-test-point','Test point','BOREHOLE',-15.4,28.3,'Field survey','VERIFIED','UNKNOWN');
  await db.run("INSERT INTO gis_water_points (id,name,type,latitude,longitude,source,verification_status) VALUES (?,?,?,?,?,?,?)",'gis-test-farther','Farther point','KIOSK',-15.41,28.3,'Field survey','VERIFIED');
  await db.run("INSERT INTO gis_water_points (id,name,type,latitude,longitude,source,verification_status) VALUES (?,?,?,?,?,?,?)",'gis-test-unverified','Unverified','KIOSK',-15.4,28.3,'Unknown','UNVERIFIED');
  await db.run("INSERT INTO community_reports (id,category,title,description,location_name,latitude,longitude,reporter_name,reporter_phone) VALUES (?,?,?,?,?,?,?,?,?)",'gis-test-report','OTHER','Private title','Private description','Private location',-15.4,28.3,'Private name','Private phone');
  await db.run("INSERT INTO community_reports (id,category,title,description,location_name,latitude,longitude) VALUES (?,?,?,?,?,?,?)",'gis-test-missing','OTHER','Missing','Missing','Missing',null,null);
  const water = await (await fetch(`${base}/gis/nearby/water-points${q}`,{headers:auth(admin)})).json();
  assert.equal(water.success,true);
  const point = water.data.features.find(f=>f.properties.id==='gis-test-point');
  assert.ok(water.data.features.findIndex(f=>f.properties.id==='gis-test-point') < water.data.features.findIndex(f=>f.properties.id==='gis-test-farther'));
  assert.deepEqual(point.geometry.coordinates,[28.3,-15.4]); assert.equal(point.properties.distance_meters,0);
  assert.ok(point.properties.updated_at, 'water-point record update time is returned');
  assert.ok(!water.data.features.some(f=>f.properties.id==='gis-test-unverified'));
  const reports = await (await fetch(`${base}/gis/nearby/reports${q}`,{headers:auth(admin)})).json();
  const report = reports.data.features.find(f=>f.properties.id==='gis-test-report');
  assert.ok(report); assert.deepEqual(report.geometry.coordinates,[28.3,-15.4]);
  for (const field of ['title','description','location_name','reporter_name','reporter_phone','reporter_id','image_url','admin_notes']) assert.equal(report.properties[field],undefined);
  assert.ok(!reports.data.features.some(f=>f.properties.id==='gis-test-missing'));
  assert.ok(!reports.data.features.some(f=>['SIMULATED','TEST'].includes(f.properties.provenance)));
  const empty = await (await fetch(`${base}/gis/nearby/water-points?latitude=50&longitude=50&radiusMeters=1`,{headers:auth(admin)})).json();
  assert.deepEqual(empty.data.features,[]);
  const limited = await (await fetch(`${base}/gis/nearby/water-points${q}&limit=1`,{headers:auth(admin)})).json();
  assert.equal(limited.data.features.length,1); assert.equal(limited.data.features[0].properties.id,'gis-test-point'); assert.equal(limited.meta.truncated,true);
});

test('administrators can curate water points, with review, history and conflict protection', async () => {
  const admin = await token('admin@majismart.zm', process.env.SEED_ADMIN_PASSWORD || 'AdminPassword2026!');
  const customer = await token('mwape@community.zm', process.env.SEED_CUSTOMER_PASSWORD || 'CustomerPass2026!');
  const endpoint = `${base}/gis/water-points`;
  const body = {name:'GIS test reviewed point', type:'BOREHOLE', latitude:-15.42, longitude:28.31, source:'Test survey 2026', operational_status:'UNKNOWN', verification_status:'UNVERIFIED', community:'', district:''};
  const send = (url, method, tokenValue, payload) => fetch(url, {method, headers:{...auth(tokenValue),'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  assert.equal((await fetch(endpoint)).status,401);
  assert.equal((await fetch(endpoint,{headers:auth(customer)})).status,403);
  assert.equal((await send(endpoint,'POST',customer,body)).status,403);
  for (const invalid of [
    {...body, latitude:''}, {...body, longitude:181}, {...body, latitude:0,longitude:0},
    {...body, source:' '}, {...body, type:'PIPE'}, {...body, operational_status:'GOOD'},
    {...body, extra:'unexpected'}, {...body, verification_status:'VERIFIED'},
    {...body, latitude:'1; DROP TABLE profiles'}
  ]) assert.equal((await send(endpoint,'POST',admin,invalid)).status,400);
  const createdResponse = await send(endpoint,'POST',admin,body);
  assert.equal(createdResponse.status,201);
  const created = (await createdResponse.json()).data;
  try {
    assert.equal(created.revision,1); assert.equal(created.community,null);
    const list = await (await fetch(`${endpoint}?limit=1&offset=0`,{headers:auth(admin)})).json();
    assert.equal(list.data.length,1); assert.equal(typeof list.meta.hasMore,'boolean');
    assert.equal((await fetch(`${endpoint}?limit=101`,{headers:auth(admin)})).status,400);
    const before = await (await fetch(`${base}/gis/nearby/water-points${q}`,{headers:auth(admin)})).json();
    assert.ok(!before.data.features.some(f=>f.properties.id===created.id));
    const url = `${endpoint}/${created.id}`;
    const verifiedBody = {...body, verification_status:'VERIFIED', confirm_verified:true, revision:1};
    assert.equal((await send(url,'PUT',customer,verifiedBody)).status,403);
    const verifiedResponse = await send(url,'PUT',admin,verifiedBody);
    assert.equal(verifiedResponse.status,200);
    const verified = (await verifiedResponse.json()).data;
    assert.equal(verified.revision,2);
    const nearbyResult = await (await fetch(`${base}/gis/nearby/water-points${q}`,{headers:auth(admin)})).json();
    assert.ok(nearbyResult.data.features.some(f=>f.properties.id===created.id));
    assert.equal((await send(url,'PUT',admin,verifiedBody)).status,409);
    assert.equal((await send(url,'PUT',admin,{...verifiedBody,revision:2,longitude:28.32})).status,400);
    const unverifiedResponse = await send(url,'PUT',admin,{...verifiedBody,revision:2,longitude:28.32,verification_status:'UNVERIFIED'});
    assert.equal(unverifiedResponse.status,200);
    assert.equal((await unverifiedResponse.json()).data.revision,3);
    const after = await (await fetch(`${base}/gis/nearby/water-points${q}`,{headers:auth(admin)})).json();
    assert.ok(!after.data.features.some(f=>f.properties.id===created.id));
    const events = await db.all('SELECT action, actor_id, before_json, after_json FROM gis_water_point_events WHERE water_point_id = ? ORDER BY action', created.id);
    assert.equal(events.length,3);
    assert.ok(events.every(e=>e.actor_id==='usr-admin-01'));
    assert.equal(events.find(e=>e.action==='CREATED').before_json,null);
    assert.ok(events.filter(e=>e.action==='UPDATED').every(e=>JSON.parse(e.after_json).revision > JSON.parse(e.before_json).revision));
    assert.equal((await send(`${endpoint}/no-such-point`,'PUT',admin,{...body,revision:1})).status,404);
  } finally { await db.run('DELETE FROM gis_water_points WHERE id = ?',created.id); }
});

test('a failed audit insert rolls back the water point write in SQLite', async () => {
  const { databaseMode } = await import('../src/database/db.js');
  if (databaseMode !== 'sqlite') return;
  const { saveWaterPoint } = await import('../src/services/waterPointService.js');
  await db.run("CREATE TRIGGER gis_test_fail_event BEFORE INSERT ON gis_water_point_events BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
  try {
    await assert.rejects(() => saveWaterPoint(db, 'usr-admin-01', {name:'GIS audit rollback test',type:'KIOSK',latitude:-15.4,longitude:28.3,source:'Test survey',operational_status:'UNKNOWN',verification_status:'UNVERIFIED'}));
    const row = await db.get("SELECT id FROM gis_water_points WHERE name = ?", 'GIS audit rollback test');
    assert.equal(row, undefined);
  } finally { await db.run('DROP TRIGGER gis_test_fail_event'); }
});
