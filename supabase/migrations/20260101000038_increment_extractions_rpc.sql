-- Migration 038: atomic extraction counter increment RPC
-- Called by Celery run_extraction task after each successful Orvexa API call.
-- Uses UPDATE ... SET x = x + 1 to avoid read-modify-write races under concurrent workers.

CREATE OR REPLACE FUNCTION increment_firm_extractions(p_firm_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE firms
  SET extractions_used_this_month = extractions_used_this_month + 1
  WHERE id = p_firm_id;
$$;

-- Only service_role (Celery admin client) can call this — not user JWT
REVOKE ALL ON FUNCTION increment_firm_extractions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_firm_extractions(UUID) TO service_role;
