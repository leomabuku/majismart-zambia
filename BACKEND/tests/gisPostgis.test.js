import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import { nearby, parseNearby } from '../src/services/geospatialService.js';

// Only point this at a disposable PostgreSQL database with all earlier migrations applied.
test('PostGIS migration backfill, synchronization, index and metre query', { skip: !process.env.TEST_GIS_DATABASE_URL }, async () => {
  const client = new pg.Client({ connectionString: process.env.TEST_GIS_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO public.community_reports (id,category,title,description,location_name,latitude,longitude) VALUES ('gis-migration-test','OTHER','test','test','test',-15.4,28.3), ('gis-migration-invalid','OTHER','test','test','test',91,28.3)");
    const sql = await fs.readFile(new URL('../../supabase/migrations/20261103000001_gis.sql', import.meta.url), 'utf8');
    await client.query(sql);
    const reviewSql = await fs.readFile(new URL('../../supabase/migrations/20261103000002_gis_water_point_review.sql', import.meta.url), 'utf8');
    await client.query(reviewSql);
    // Reapplication should preserve records and recreate triggers/indexes safely.
    await client.query(sql);
    await client.query(reviewSql);
    await client.query("INSERT INTO public.gis_water_points (id,name,type,latitude,longitude,source) VALUES ('gis-migration-water','test','BOREHOLE',-15.4,28.3,'test survey')");
    await client.query("UPDATE public.gis_water_points SET longitude=28.4, revision=revision+1 WHERE id='gis-migration-water'");
    let point = await client.query("SELECT revision, extensions.ST_X(gis_point) x FROM public.gis_water_points WHERE id='gis-migration-water'");
    assert.equal(point.rows[0].revision,2); assert.equal(point.rows[0].x,28.4);
    await client.query("INSERT INTO public.gis_water_point_events (id,water_point_id,action,after_json) VALUES ('gis-migration-event','gis-migration-water','UPDATED','{}')");
    point = await client.query("SELECT count(*)::int AS count FROM public.gis_water_point_events WHERE water_point_id='gis-migration-water'");
    assert.equal(point.rows[0].count,1);
    let result = await client.query("SELECT extensions.ST_X(gis_point) x, extensions.ST_Y(gis_point) y FROM public.community_reports WHERE id='gis-migration-test'");
    assert.equal(result.rows[0].x,28.3); assert.equal(result.rows[0].y,-15.4);
    result = await client.query("SELECT gis_point FROM public.community_reports WHERE id='gis-migration-invalid'");
    assert.equal(result.rows[0].gis_point,null);
    await client.query("UPDATE public.community_reports SET latitude=NULL WHERE id='gis-migration-test'");
    result = await client.query("SELECT gis_point FROM public.community_reports WHERE id='gis-migration-test'");
    assert.equal(result.rows[0].gis_point,null);
    await client.query("UPDATE public.community_reports SET latitude=-15.4, longitude=28.3 WHERE id='gis-migration-test'");
    result = await client.query("SELECT extensions.ST_DWithin(gis_point::extensions.geography, extensions.ST_SetSRID(extensions.ST_MakePoint(28.3,-15.4),4326)::extensions.geography, 1) AS nearby FROM public.community_reports WHERE id='gis-migration-test'");
    assert.equal(result.rows[0].nearby,true);
    result = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='idx_community_reports_gis_geography'");
    assert.equal(result.rowCount,1);

    await client.query(`INSERT INTO public.gis_water_points (id,name,type,latitude,longitude,source,verification_status)
      VALUES ('gis-near','near','BOREHOLE',-15.4,28.3,'survey','VERIFIED'),
             ('gis-far','far','KIOSK',-15.41,28.3,'survey','VERIFIED'),
             ('gis-unverified','unverified','KIOSK',-15.4,28.3,'survey','UNVERIFIED'),
             ('gis-outside','outside','KIOSK',-16.4,28.3,'survey','VERIFIED')`);
    // The API's adapter converts ? placeholders to pg parameters in this same order.
    const db = { all: async (sql, ...params) => {
      let i = 0;
      return (await client.query(sql.replace(/\?/g, () => `$${++i}`), params)).rows;
    } };
    const input = parseNearby({latitude:'-15.4', longitude:'28.3', radiusMeters:'5000', limit:'2'});
    const water = await nearby(db, 'supabase', 'water-points', input);
    assert.deepEqual(water.features.map(f => f.properties.id), ['gis-near','gis-far']);
    assert.deepEqual(water.features[0].geometry.coordinates, [28.3,-15.4]);
    assert.ok(water.features[0].properties.distance_meters < 1);
    assert.ok(water.features[1].properties.distance_meters > 1000 && water.features[1].properties.distance_meters < 1200);
    await client.query("UPDATE public.gis_water_points SET operational_status='OPERATIONAL' WHERE id='gis-far'");
    const filteredInput = parseNearby({latitude:'-15.4', longitude:'28.3', radiusMeters:'5000', limit:'1', operationalStatus:'OPERATIONAL'}, 'water-points');
    const filtered = await nearby(db, 'supabase', 'water-points', filteredInput);
    assert.deepEqual(filtered.features.map(f => f.properties.id), ['gis-far']);
    assert.equal(filtered.features[0].properties.operational_status, 'OPERATIONAL');
    const reports = await nearby(db, 'supabase', 'reports', input);
    assert.ok(reports.features.some(f => f.properties.id === 'gis-migration-test'));
    assert.ok(!reports.features.some(f => f.properties.id === 'gis-migration-invalid'));
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
