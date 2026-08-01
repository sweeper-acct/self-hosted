-- Migration 021: Owner policy gaps + task_edits junior isolation
--
-- Gaps found in Migration 020:
--   directors, sla_profiles, coding_rule_sets, firms
--   were missing owner PERMISSIVE policies.
--
-- task_edits_select_team had no junior branch — junior could query
--   team-wide edits (not just their own cases). Frontend blocked
--   via ProtectedRoute, but RLS should enforce it too.

-- ── owner policies for missing tables ────────────────────────────────────────

CREATE POLICY directors_owner ON directors
    AS PERMISSIVE FOR ALL TO authenticated
    USING (auth_user_role() = 'owner');

CREATE POLICY sla_profiles_owner ON sla_profiles
    AS PERMISSIVE FOR ALL TO authenticated
    USING (auth_user_role() = 'owner');

CREATE POLICY coding_rule_sets_owner ON coding_rule_sets
    AS PERMISSIVE FOR ALL TO authenticated
    USING (auth_user_role() = 'owner');

CREATE POLICY firms_owner ON firms
    AS PERMISSIVE FOR ALL TO authenticated
    USING (id = auth_firm_id() AND auth_user_role() = 'owner');

-- ── task_edits junior isolation ───────────────────────────────────────────────
-- Replace the team policy (no role filter) with two explicit branches:
--   senior/manager/partner → team-scoped (existing intent, now explicit)
--   junior               → only cases assigned to them (matches tasks/cases)

DROP POLICY IF EXISTS task_edits_select_team ON task_edits;

CREATE POLICY task_edits_select_team ON task_edits
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() IN ('partner', 'manager', 'senior')
        AND EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY task_edits_select_junior ON task_edits
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'junior'
        AND EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.assigned_junior = auth.uid()
        )
    );
