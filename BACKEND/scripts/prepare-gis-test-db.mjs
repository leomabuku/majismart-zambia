// Bootstrap a disposable, empty local PostGIS database for the native GIS tests.
// Never connect this helper to Supabase or any other remote/valuable database.
import pg from 'pg';
import fs from 'node:fs/promises';

const url = process.env.TEST_GIS_DATABASE_URL;
if (!url || process.env.GIS_TEST_BOOTSTRAP !== '1') throw new Error('Set TEST_GIS_DATABASE_URL and GIS_TEST_BOOTSTRAP=1 for a disposable local database');
const parsed = new URL(url);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/gis_test') throw new Error('Only a local database named gis_test is allowed');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const exists = await client.query("SELECT to_regclass('public.profiles') AS profiles, to_regclass('public.gis_water_points') AS gis_water_points");
  if (exists.rows[0].profiles || exists.rows[0].gis_water_points) throw new Error('Expected an empty disposable database');
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;`);
  const folder = new URL('../../supabase/migrations/', import.meta.url);
  const migrations = (await fs.readdir(folder)).filter(file => /^\d+.*\.sql$/.test(file) && file < '20261103000001_gis.sql').sort();
  for (const file of migrations) {
    await client.query(await fs.readFile(new URL(file, folder), 'utf8'));
    console.log(`Applied baseline migration ${file}`);
  }
} finally { await client.end(); }
