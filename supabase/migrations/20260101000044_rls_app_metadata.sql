-- Migration 044: Read JWT claims from app_metadata (no hook dependency)
--
-- app_metadata is always present in Supabase JWT without requiring any hook.
-- custom_access_token_hook (Migration 006) wrote claims at top level.
-- These updated helpers check app_metadata first, fall back to top-level
-- for backwards compatibility with sessions issued before this migration.
--
-- After backfilling all existing users' app_metadata and confirming login
-- works without the hook, the hook can be safely disabled in the dashboard.

CREATE OR REPLACE FUNCTION auth_firm_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'firm_id')::uuid,
        (auth.jwt() ->> 'firm_id')::uuid
    )
$$;

CREATE OR REPLACE FUNCTION auth_team_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'team_id')::uuid,
        (auth.jwt() ->> 'team_id')::uuid
    )
$$;

CREATE OR REPLACE FUNCTION auth_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
AS $$
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'user_role',
        auth.jwt() ->> 'user_role'
    )
$$;
