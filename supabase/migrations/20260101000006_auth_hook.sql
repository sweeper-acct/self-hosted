-- Migration 006 — JWT custom access token hook
-- Injects firm_id, team_id, user_role into the JWT at login time.
-- These are read by auth_firm_id(), auth_team_id(), auth_user_role() in Migration 004.
--
-- AFTER APPLYING THIS MIGRATION:
--   Supabase Dashboard → Authentication → Hooks
--   → "Custom Access Token" → Schema: public, Function: custom_access_token_hook
--   (The function exists in the DB after this migration but is inert until the
--    Dashboard hook is wired. Tests will still fail until the hook is active.)
--
-- DESIGN NOTE: 'role' claim is NOT changed.
-- PostgREST uses the JWT 'role' claim for database role routing (SET ROLE ...).
-- Setting it to 'junior' would cause SET ROLE junior → error (no such Postgres role).
-- App-level role goes in 'user_role' instead. auth_user_role() reads 'user_role'.
-- Supabase keeps 'role: authenticated' for all user JWTs — leave it as-is.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_rec RECORD;
    claims   jsonb;
BEGIN
    SELECT firm_id, team_id, role AS user_role
    INTO   user_rec
    FROM   public.users
    WHERE  id = (event->>'user_id')::uuid;

    IF FOUND THEN
        claims := event -> 'claims';
        claims := jsonb_set(claims, '{firm_id}',   to_jsonb(user_rec.firm_id::text));
        claims := jsonb_set(claims, '{team_id}',   to_jsonb(user_rec.team_id::text));
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_rec.user_role));
        RETURN jsonb_set(event, '{claims}', claims);
    END IF;

    -- User not yet in public.users (invited but not onboarded) — return unchanged.
    RETURN event;
END;
$$;

-- supabase_auth_admin is the role that calls hooks during JWT generation.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO postgres;
-- Block regular app users from calling the hook directly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
