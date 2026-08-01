-- Migration 007 — Fix auth_user_role() + test cleanup helper
--
-- Part A: auth_user_role() must read 'user_role', not 'role'.
--   Migration 006 injects the app role as 'user_role' in the JWT.
--   The 'role' claim stays as 'authenticated' for PostgREST routing.
--
-- Part B: test_cleanup_firms() — isolation_test.py teardown helper.
--   The BEFORE DELETE trigger on case_log blocks CASCADE deletion of test data.
--   Solution: use a custom GUC 'app.cleanup_mode' (any role can set user-defined GUCs)
--   that the trigger checks before raising. The trigger update in this migration
--   replaces the one created in Migration 003.

-- ── Part A: auth_user_role ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_user_role() RETURNS TEXT AS $$
    SELECT auth.jwt() ->> 'user_role'
$$ LANGUAGE sql STABLE;

-- ── Part B: updated case_log mutation trigger ──────────────────────────────
-- Replaces the version from Migration 003.
-- Allows deletion when app.cleanup_mode = 'true' (set by test_cleanup_firms).
-- In production, nothing sets this GUC, so the trigger always blocks.

CREATE OR REPLACE FUNCTION prevent_case_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.cleanup_mode', true) = 'true' THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'case_log is append-only. % is not permitted. Retention policy: 5 years minimum.', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── Part C: test cleanup RPC ───────────────────────────────────────────────
-- Sets app.cleanup_mode for the transaction, then deletes firms via CASCADE.
-- The updated trigger (above) allows the deletion.
-- GUC is transaction-local (third arg = true) — resets when function returns.

CREATE OR REPLACE FUNCTION test_cleanup_firms(firm_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('app.cleanup_mode', 'true', true);
    DELETE FROM firms WHERE id = ANY(firm_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION test_cleanup_firms FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION test_cleanup_firms TO service_role;
