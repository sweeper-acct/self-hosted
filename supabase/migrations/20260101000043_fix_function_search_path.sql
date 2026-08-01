-- Migration 043: Fix Function Search Path Mutable security warnings
--
-- Supabase Security Advisor flags functions without a fixed search_path.
-- Without SET search_path, a malicious DB user could inject a schema earlier
-- in the path and shadow public objects. Fix: pin all functions to public.
--
-- Uses ALTER FUNCTION to avoid re-writing function bodies.
-- rls_auto_enable is a Supabase internal; revoke public execute access.

-- ── Trigger functions (no parameters) ────────────────────────────────────────
ALTER FUNCTION public.set_updated_at()              SET search_path = public;
ALTER FUNCTION public.set_case_derived_fields()     SET search_path = public;
ALTER FUNCTION public.set_file_firm_id()            SET search_path = public;
ALTER FUNCTION public.prevent_file_state_update()   SET search_path = public;
ALTER FUNCTION public.set_task_derived_fields()     SET search_path = public;
ALTER FUNCTION public.prevent_case_log_mutation()   SET search_path = public;
ALTER FUNCTION public.set_client_firm_id()          SET search_path = public;

-- ── Validation / helper functions ────────────────────────────────────────────
ALTER FUNCTION public.validate_approval_chain(JSONB)  SET search_path = public;
ALTER FUNCTION public.is_mvp_active_case_type(TEXT)   SET search_path = public;

-- ── RLS JWT helper functions ──────────────────────────────────────────────────
ALTER FUNCTION public.auth_firm_id()    SET search_path = public;
ALTER FUNCTION public.auth_team_id()    SET search_path = public;
ALTER FUNCTION public.auth_user_role()  SET search_path = public;

-- ── Service-role RPCs ─────────────────────────────────────────────────────────
ALTER FUNCTION public.test_cleanup_firms(uuid[])          SET search_path = public;
ALTER FUNCTION public.increment_firm_extractions(UUID)    SET search_path = public;

-- ── rls_auto_enable: Supabase internal — revoke public execute ────────────────
-- This function is created by Supabase and uses SECURITY DEFINER.
-- Regular users should never call it directly.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
