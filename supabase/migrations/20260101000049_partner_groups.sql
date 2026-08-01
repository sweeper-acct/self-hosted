-- Migration 049 — Partner Groups
--
-- Adds parent_team_id to teams, enabling Partner to create N sub-groups
-- within their team (each with its own Manager, Seniors, Juniors, approval chain).
--
-- Hierarchy:
--   Partner Team  (parent_team_id = NULL, created by Admin)
--     └── Group A (parent_team_id = Partner Team ID, created by Partner)
--     └── Group B (parent_team_id = Partner Team ID, created by Partner)
--
-- RLS extension: Partner sees all data in child groups via auth_child_team_ids().
-- Group members see only their group's data (existing team-scoped RLS unchanged).

-- ── Schema ───────────────────────────────────────────────────────────────────

ALTER TABLE teams ADD COLUMN IF NOT EXISTS
    parent_team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_teams_parent_team_id ON teams(parent_team_id);

-- ── Helper function ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_child_team_ids()
RETURNS UUID[] AS $$
    SELECT COALESCE(
        ARRAY(
            SELECT id FROM teams
            WHERE parent_team_id = auth_team_id()
            AND firm_id = auth_firm_id()
        ),
        ARRAY[]::UUID[]
    )
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION auth_child_team_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION auth_child_team_ids() TO authenticated;

-- ── teams RLS — Partner can see and manage their groups ───────────────────────

CREATE POLICY teams_select_partner_groups ON teams
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND parent_team_id = auth_team_id()
    );

-- Allow Partner to create groups (child teams with parent_team_id = own team)
DROP POLICY IF EXISTS teams_insert ON teams;
CREATE POLICY teams_insert ON teams
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        auth_user_role() = 'admin'
        OR (
            auth_user_role() = 'partner'
            AND parent_team_id = auth_team_id()
            AND firm_id = auth_firm_id()
        )
    );

-- Allow Partner to update their groups (rename, approval chain)
DROP POLICY IF EXISTS teams_update ON teams;
CREATE POLICY teams_update ON teams
    AS PERMISSIVE FOR UPDATE
    USING (
        auth_user_role() = 'admin'
        OR (id = auth_team_id() AND auth_user_role() IN ('partner', 'manager'))
        OR (parent_team_id = auth_team_id() AND auth_user_role() = 'partner')
    )
    WITH CHECK (
        auth_user_role() = 'admin'
        OR (id = auth_team_id() AND auth_user_role() IN ('partner', 'manager'))
        OR (parent_team_id = auth_team_id() AND auth_user_role() = 'partner')
    );

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE POLICY users_select_partner_groups ON users
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND team_id = ANY(auth_child_team_ids())
    );

-- ── clients ───────────────────────────────────────────────────────────────────

CREATE POLICY clients_select_partner_groups ON clients
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND team_id = ANY(auth_child_team_ids())
    );

-- ── directors ─────────────────────────────────────────────────────────────────

CREATE POLICY directors_select_partner_groups ON directors
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.team_id = ANY(auth_child_team_ids())
        )
    );

-- ── cases ─────────────────────────────────────────────────────────────────────

CREATE POLICY cases_select_partner_groups ON cases
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND team_id = ANY(auth_child_team_ids())
    );

-- ── files ─────────────────────────────────────────────────────────────────────

CREATE POLICY files_select_partner_groups ON files
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.team_id = ANY(auth_child_team_ids())
        )
    );

-- ── tasks ─────────────────────────────────────────────────────────────────────

CREATE POLICY tasks_select_partner_groups ON tasks
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.team_id = ANY(auth_child_team_ids())
        )
    );

-- ── task_edits ────────────────────────────────────────────────────────────────

CREATE POLICY task_edits_select_partner_groups ON task_edits
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.team_id = ANY(auth_child_team_ids())
        )
    );

-- ── case_log ──────────────────────────────────────────────────────────────────

CREATE POLICY case_log_select_partner_groups ON case_log
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'partner'
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = case_log.case_id
            AND c.team_id = ANY(auth_child_team_ids())
        )
    );
