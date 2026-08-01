-- Migration 020: Owner role — firm-wide access, bypasses team_id boundary
-- Owner = firm registrant / managing partner. Supersedes admin + partner.
-- RESTRICTIVE firm_boundary policies still apply (firm_id = auth_firm_id()).
-- These PERMISSIVE policies give owner access to all rows within the firm.

-- Extend role check constraint to include 'owner'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'partner', 'manager', 'senior', 'junior'));

CREATE POLICY users_owner ON users
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY teams_owner ON teams
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY clients_owner ON clients
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY cases_owner ON cases
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY tasks_owner ON tasks
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY files_owner ON files
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY case_log_owner ON case_log
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');

CREATE POLICY task_edits_owner ON task_edits
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth_user_role() = 'owner');
