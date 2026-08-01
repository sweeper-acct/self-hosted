-- Migration 046: Change auth RLS helpers to SECURITY INVOKER
-- These functions only call auth.jwt() which is accessible to authenticated users.
-- SECURITY INVOKER eliminates the 3 "Signed-In Users Can Execute SECURITY DEFINER"
-- warnings in Supabase Security Advisor without affecting RLS behaviour.

ALTER FUNCTION public.auth_firm_id() SECURITY INVOKER;
ALTER FUNCTION public.auth_team_id() SECURITY INVOKER;
ALTER FUNCTION public.auth_user_role() SECURITY INVOKER;
