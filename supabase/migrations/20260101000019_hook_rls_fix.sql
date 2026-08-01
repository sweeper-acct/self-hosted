-- Migration 019: Fix auth hook RLS + VOLATILE + EXCEPTION handler
--
-- Problem: custom_access_token_hook (SECURITY DEFINER, runs as postgres) was
-- blocked by the RESTRICTIVE firm_boundary policy on users (no TO clause →
-- applied to all roles including postgres).  postgres has no BYPASSRLS in
-- Supabase's managed environment, so the SELECT returned 0 rows and GoTrue
-- received an event without firm_id/team_id/user_role claims.
--
-- Fix 1: Scope users_firm_boundary RESTRICTIVE policy to authenticated + anon only.
-- Fix 2: Add PERMISSIVE SELECT policy for postgres so the hook can read all users.
-- Fix 3: Update hook to VOLATILE + EXCEPTION WHEN OTHERS (defensive fallback).

-- ── 1. Restrict firm_boundary to authenticated/anon roles only ─────────────
DROP POLICY IF EXISTS users_firm_boundary ON users;

CREATE POLICY users_firm_boundary ON users
    AS RESTRICTIVE FOR ALL
    TO authenticated, anon
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

-- ── 2. Allow postgres (hook's SECURITY DEFINER role) to read all users ─────
DROP POLICY IF EXISTS users_postgres_internal ON users;

CREATE POLICY users_postgres_internal ON users
    AS PERMISSIVE FOR SELECT
    TO postgres
    USING (true);

-- ── 3. Update hook: VOLATILE + EXCEPTION handler ───────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_rec RECORD;
    claims   jsonb;
BEGIN
    SELECT firm_id, team_id, role AS user_role INTO user_rec
    FROM public.users WHERE id = (event->>'user_id')::uuid;
    IF FOUND THEN
        claims := event -> 'claims';
        claims := jsonb_set(claims, '{firm_id}',   to_jsonb(user_rec.firm_id::text));
        claims := jsonb_set(claims, '{team_id}',   to_jsonb(user_rec.team_id::text));
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_rec.user_role));
        RETURN jsonb_set(event, '{claims}', claims);
    END IF;
    RETURN event;
EXCEPTION WHEN OTHERS THEN
    -- Graceful fallback: return event unchanged rather than failing login with 500.
    -- JWT will lack custom claims; app-level RLS will block data access.
    RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
