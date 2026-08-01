-- Migration 045: Fix auth helper function permissions
-- Remove PUBLIC (anon) execute access; grant only to authenticated role.
-- Fixes 3 "Public Can Execute SECURITY DEFINER Function" warnings in Supabase Security Advisor.
-- The 3 "Signed-In Users Can Execute" warnings for the same functions are expected — RLS policies
-- require authenticated users to call these helpers, so those warnings cannot be eliminated.

REVOKE EXECUTE ON FUNCTION public.auth_firm_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_team_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
