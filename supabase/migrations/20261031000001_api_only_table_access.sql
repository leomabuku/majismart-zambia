-- ==============================================================================
-- MAJISMART ZAMBIA: API-only table access
--
-- Why: the shared Express API connects to Postgres with the `postgres` role
-- through the Supavisor pooler, which bypasses RLS. Supabase additionally grants
-- anon/authenticated full DML on every public table, so anything holding the
-- (public) anon key could talk to PostgREST directly. Today every read/write goes
-- through the API, and the RLS policies reference auth.uid(), which can never
-- match because profiles.id is a TEXT id and not auth.users.id.
--
-- This migration removes direct PostgREST access to application tables. The API
-- is unaffected (it does not use the anon key).
--
-- If you later adopt Supabase Auth + direct client access (documented plan B in
-- DEPLOYMENT.md), re-grant deliberately, table by table, after rewriting the RLS
-- policies against auth.uid() - do not grant ALL.
-- ==============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future tables closed by default as well.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
