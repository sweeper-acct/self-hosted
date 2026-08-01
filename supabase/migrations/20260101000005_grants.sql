-- Migration 005 — Postgres role grants
-- Tables created via raw SQL migrations do not get Supabase's automatic grants.
-- PostgREST routes requests through the Postgres roles below; without GRANT
-- the service_role API client gets "permission denied" even though it bypasses RLS.
--
-- service_role : ALL  → admin_client() in tests, background jobs, migrations
-- authenticated: DML  → every real user JWT; access shaped by RLS in Migration 004
-- anon         : none → no unauthenticated access to any table

-- Schema usage
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

-- All current tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- All current sequences (UUID defaults use gen_random_uuid(), but explicit seqs may exist)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Default privileges — applies to tables/sequences created by future migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO authenticated;
