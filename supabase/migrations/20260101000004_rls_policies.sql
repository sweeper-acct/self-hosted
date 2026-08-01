-- Migration 004 — Row Level Security policies
--
-- Architecture: RESTRICTIVE firm boundary + PERMISSIVE role branches
--   RESTRICTIVE (firm_id = auth_firm_id()): outer fence, always enforced.
--     A bug in any PERMISSIVE policy cannot cause cross-firm data leak.
--   PERMISSIVE (role branches): inner access logic, OR-combined per operation.
--     Any single PERMISSIVE policy passing is sufficient for access.
--
-- Write policies (INSERT/UPDATE): loose version — team member can write to own
--   team's records. Phase 2 tightens to field-level and role-level constraints.
--
-- DELETE policies: intentionally absent on all tables.
--   No DELETE = default deny. Sweeper uses status transitions, not hard deletes.
--   Exceptions enforced by trigger (case_log, file_state) are in Migration 003.
--
-- JWT claim extraction: always use the three helper functions below.
--   NEVER use auth.role() or current_role for app-level role checks —
--   auth.role() returns our app role (junior/senior/...) but only because our
--   custom JWT hook overwrites the standard 'role' claim. current_role returns
--   the Postgres database role ('authenticated'), which is NEVER the right
--   variable for app-level role checks in RLS. See CLAUDE.md JWT section.

-- ── Helper functions ──────────────────────────────────────────────────────────
-- STABLE: result is consistent within a single query; JWT doesn't change per request.
-- Centralised here — if Supabase changes claim injection path, change only these.

CREATE OR REPLACE FUNCTION auth_firm_id() RETURNS UUID AS $$
    SELECT (auth.jwt() ->> 'firm_id')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_team_id() RETURNS UUID AS $$
    SELECT (auth.jwt() ->> 'team_id')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_user_role() RETURNS TEXT AS $$
    SELECT auth.jwt() ->> 'role'
$$ LANGUAGE sql STABLE;

-- ── Enable RLS on all tables ──────────────────────────────────────────────────

ALTER TABLE firms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_rule_sets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE directors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE files             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_edits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_log          ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- firms
-- Firm table's own id IS the firm_id. RESTRICTIVE uses id = auth_firm_id().
-- All roles see their own firm. Admin-only writes (firm creation is
-- platform-level onboarding, not user-initiated).
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY firms_firm_boundary ON firms
    AS RESTRICTIVE FOR ALL
    USING     (id = auth_firm_id())
    WITH CHECK(id = auth_firm_id());

CREATE POLICY firms_select ON firms
    AS PERMISSIVE FOR SELECT
    USING (true);
    -- firm_boundary restricts to own firm; no further role branching needed.

CREATE POLICY firms_insert ON firms
    AS PERMISSIVE FOR INSERT
    WITH CHECK (auth_user_role() = 'admin');

CREATE POLICY firms_update ON firms
    AS PERMISSIVE FOR UPDATE
    USING     (auth_user_role() = 'admin')
    WITH CHECK(auth_user_role() = 'admin');

-- ════════════════════════════════════════════════════════════════════════════
-- sla_profiles
-- Firm-level configuration; all roles can read (SLA deadlines are visible
-- across the team). Admin/Partner/Manager can write.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY sla_profiles_firm_boundary ON sla_profiles
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY sla_profiles_select ON sla_profiles
    AS PERMISSIVE FOR SELECT
    USING (true);

CREATE POLICY sla_profiles_insert ON sla_profiles
    AS PERMISSIVE FOR INSERT
    WITH CHECK (auth_user_role() IN ('admin', 'partner', 'manager'));

CREATE POLICY sla_profiles_update ON sla_profiles
    AS PERMISSIVE FOR UPDATE
    USING     (auth_user_role() IN ('admin', 'partner', 'manager'))
    WITH CHECK(auth_user_role() IN ('admin', 'partner', 'manager'));

-- ════════════════════════════════════════════════════════════════════════════
-- teams
-- Admin sees all teams in firm. Others see only their own team.
-- Writes: admin can manage all teams; partner/manager can update their own team
-- (approval_chain config, team settings). Phase 2 narrows to specific columns.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY teams_firm_boundary ON teams
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY teams_select_admin ON teams
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY teams_select_own ON teams
    AS PERMISSIVE FOR SELECT
    USING (id = auth_team_id());

CREATE POLICY teams_insert ON teams
    AS PERMISSIVE FOR INSERT
    WITH CHECK (auth_user_role() = 'admin');

CREATE POLICY teams_update ON teams
    AS PERMISSIVE FOR UPDATE
    USING (
        auth_user_role() = 'admin'
        OR (id = auth_team_id() AND auth_user_role() IN ('partner', 'manager'))
    )
    WITH CHECK(
        auth_user_role() = 'admin'
        OR (id = auth_team_id() AND auth_user_role() IN ('partner', 'manager'))
    );

-- ════════════════════════════════════════════════════════════════════════════
-- users
-- Admin sees all users in firm. Others see only own team.
-- Users can update their own record; admin can update any in firm;
-- partner/manager can update team members (role changes etc).
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY users_firm_boundary ON users
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY users_select_admin ON users
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY users_select_team ON users
    AS PERMISSIVE FOR SELECT
    USING (team_id = auth_team_id());

-- INSERT: admin creates users (invite flow). Team join handled by auth hook.
CREATE POLICY users_insert ON users
    AS PERMISSIVE FOR INSERT
    WITH CHECK (auth_user_role() = 'admin');

CREATE POLICY users_update ON users
    AS PERMISSIVE FOR UPDATE
    USING (
        id = auth.uid()                                                -- own record
        OR auth_user_role() = 'admin'                                  -- admin: firm-wide
        OR (team_id = auth_team_id()
            AND auth_user_role() IN ('partner', 'manager'))            -- team lead
    )
    WITH CHECK(
        id = auth.uid()
        OR auth_user_role() = 'admin'
        OR (team_id = auth_team_id()
            AND auth_user_role() IN ('partner', 'manager'))
    );

-- ════════════════════════════════════════════════════════════════════════════
-- coding_rule_sets
-- Senior+ can read firm's rule sets (needed for GST coding context).
-- Manager+ can write. Junior cannot read — they don't need config access.
-- client_id = null means firm default; client_id = uuid means client override.
-- Both are accessible to the same roles (firm-level access, not team-scoped).
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY coding_rule_sets_firm_boundary ON coding_rule_sets
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY coding_rule_sets_select ON coding_rule_sets
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() IN ('admin', 'partner', 'manager', 'senior'));

CREATE POLICY coding_rule_sets_insert ON coding_rule_sets
    AS PERMISSIVE FOR INSERT
    WITH CHECK (auth_user_role() IN ('admin', 'partner', 'manager'));

CREATE POLICY coding_rule_sets_update ON coding_rule_sets
    AS PERMISSIVE FOR UPDATE
    USING     (auth_user_role() IN ('admin', 'partner', 'manager'))
    WITH CHECK(auth_user_role() IN ('admin', 'partner', 'manager'));

-- ════════════════════════════════════════════════════════════════════════════
-- clients
-- Three-tier SELECT:
--   admin        → all clients in firm (firm_boundary handles scoping)
--   partner/manager/senior → all clients in their team
--   junior       → only clients where assigned_junior = auth.uid()
--
-- INSERT/UPDATE: loose (team member) — Phase 2 adds field-level constraints,
-- e.g. assigned_junior can only be written by Senior+.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY clients_firm_boundary ON clients
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY clients_select_admin ON clients
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY clients_select_team ON clients
    AS PERMISSIVE FOR SELECT
    USING (
        team_id = auth_team_id()
        AND auth_user_role() IN ('partner', 'manager', 'senior')
    );

CREATE POLICY clients_select_junior ON clients
    AS PERMISSIVE FOR SELECT
    USING (
        assigned_junior = auth.uid()
        AND auth_user_role() = 'junior'
    );
    -- Junior only sees their assigned clients. team_id check is implicit:
    -- a junior's auth.uid() can only appear as assigned_junior within their firm
    -- (enforced by firm_boundary RESTRICTIVE + users.team_id).

CREATE POLICY clients_insert ON clients
    AS PERMISSIVE FOR INSERT
    WITH CHECK (team_id = auth_team_id());

CREATE POLICY clients_update ON clients
    AS PERMISSIVE FOR UPDATE
    USING     (team_id = auth_team_id())
    WITH CHECK(team_id = auth_team_id());

-- ════════════════════════════════════════════════════════════════════════════
-- directors
-- No direct firm_id or team_id — access is inherited from parent client.
-- RESTRICTIVE: EXISTS into clients (firm boundary).
-- SELECT: mirrors clients access pattern via EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY directors_firm_boundary ON directors
    AS RESTRICTIVE FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.firm_id = auth_firm_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.firm_id = auth_firm_id()
        )
    );

CREATE POLICY directors_select_admin ON directors
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY directors_select_team ON directors
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() IN ('partner', 'manager', 'senior')
        AND EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY directors_select_junior ON directors
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'junior'
        AND EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.assigned_junior = auth.uid()
        )
    );

CREATE POLICY directors_insert ON directors
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY directors_update ON directors
    AS PERMISSIVE FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.team_id = auth_team_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = directors.client_id
            AND c.team_id = auth_team_id()
        )
    );

-- ════════════════════════════════════════════════════════════════════════════
-- cases
-- Same three-tier SELECT as clients (admin / team / junior-assigned).
-- Junior access uses assigned_junior column (matches clients pattern).
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY cases_firm_boundary ON cases
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY cases_select_admin ON cases
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY cases_select_team ON cases
    AS PERMISSIVE FOR SELECT
    USING (
        team_id = auth_team_id()
        AND auth_user_role() IN ('partner', 'manager', 'senior')
    );

CREATE POLICY cases_select_junior ON cases
    AS PERMISSIVE FOR SELECT
    USING (
        assigned_junior = auth.uid()
        AND auth_user_role() = 'junior'
    );

CREATE POLICY cases_insert ON cases
    AS PERMISSIVE FOR INSERT
    WITH CHECK (team_id = auth_team_id());
    -- firm_id and team_id are set by trigger from client_id —
    -- the WITH CHECK runs after the trigger, so the derived values are correct.

CREATE POLICY cases_update ON cases
    AS PERMISSIVE FOR UPDATE
    USING     (team_id = auth_team_id())
    WITH CHECK(team_id = auth_team_id());

-- ════════════════════════════════════════════════════════════════════════════
-- files
-- Has firm_id (denormalised by trigger) but not team_id.
-- RESTRICTIVE: firm_id boundary (same pattern as cases).
-- SELECT: admin by firm; others via parent case team membership.
-- Junior access: parent case must be assigned to them.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY files_firm_boundary ON files
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY files_select_admin ON files
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY files_select_team ON files
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() IN ('partner', 'manager', 'senior')
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY files_select_junior ON files
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'junior'
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.assigned_junior = auth.uid()
        )
    );

CREATE POLICY files_insert ON files
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.team_id = auth_team_id()
        )
    );
    -- file_state is INSERT-only; prevent_file_state_update trigger (Migration 003)
    -- blocks any UPDATE to the file_state column. No UPDATE policy needed for
    -- state transitions — they are handled by inserting new file records.

CREATE POLICY files_update ON files
    AS PERMISSIVE FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.team_id = auth_team_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = files.case_id
            AND c.team_id = auth_team_id()
        )
    );

-- ════════════════════════════════════════════════════════════════════════════
-- tasks
-- Has firm_id and case_type (denormalised) but not team_id.
-- Junior can see all tasks for cases assigned to them — not just their own
-- task assignments — so they can track case progress.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY tasks_firm_boundary ON tasks
    AS RESTRICTIVE FOR ALL
    USING     (firm_id = auth_firm_id())
    WITH CHECK(firm_id = auth_firm_id());

CREATE POLICY tasks_select_admin ON tasks
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY tasks_select_team ON tasks
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() IN ('partner', 'manager', 'senior')
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY tasks_select_junior ON tasks
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() = 'junior'
        AND EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.assigned_junior = auth.uid()
        )
    );

CREATE POLICY tasks_insert ON tasks
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY tasks_update ON tasks
    AS PERMISSIVE FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.team_id = auth_team_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = tasks.case_id
            AND c.team_id = auth_team_id()
        )
    );

-- ════════════════════════════════════════════════════════════════════════════
-- task_edits
-- No direct firm_id or team_id — access inherited from task → case.
-- INSERT-only by application convention (no UPDATE/DELETE endpoint).
-- RLS does not add a formal UPDATE policy; application layer enforces this.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY task_edits_firm_boundary ON task_edits
    AS RESTRICTIVE FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.firm_id = auth_firm_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.firm_id = auth_firm_id()
        )
    );

CREATE POLICY task_edits_select_admin ON task_edits
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY task_edits_select_team ON task_edits
    AS PERMISSIVE FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.team_id = auth_team_id()
        )
    );
    -- No junior-specific branch: junior access is via the team policy when
    -- their case is in the team. If stricter junior isolation is needed,
    -- add a junior branch in Phase 2 using c.assigned_junior = auth.uid().

CREATE POLICY task_edits_insert ON task_edits
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN cases c ON c.id = t.case_id
            WHERE t.id = task_edits.task_id
            AND c.team_id = auth_team_id()
        )
    );

-- ════════════════════════════════════════════════════════════════════════════
-- case_log
-- Append-only: INSERT is permitted; UPDATE and DELETE are blocked by
-- statement-level triggers (Migration 003) — no UPDATE/DELETE policy needed.
-- Default deny on UPDATE/DELETE is correct; triggers add a second layer.
--
-- RESTRICTIVE uses EXISTS via cases (no direct firm_id on case_log).
-- INSERT WITH CHECK verifies the target case belongs to the user's team —
-- agents log via service role (bypasses RLS) so this only constrains humans.
-- SELECT: all team members can read audit logs for their team's cases.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY case_log_firm_boundary ON case_log
    AS RESTRICTIVE FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = case_log.case_id
            AND c.firm_id = auth_firm_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = case_log.case_id
            AND c.firm_id = auth_firm_id()
        )
    );

CREATE POLICY case_log_select_admin ON case_log
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() = 'admin');

CREATE POLICY case_log_select_team ON case_log
    AS PERMISSIVE FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = case_log.case_id
            AND c.team_id = auth_team_id()
        )
    );

CREATE POLICY case_log_insert ON case_log
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases c
            WHERE c.id = case_log.case_id
            AND c.team_id = auth_team_id()
        )
    );
    -- Agents (Orchestrator, BookkeepingAgent, BASAgent) write case_log via
    -- the service role (bypasses RLS). This INSERT policy only constrains
    -- humans writing case_log directly — an unlikely but possible path.
    -- The WITH CHECK still prevents a rogue user from logging against another
    -- team's case, even with a valid JWT.
