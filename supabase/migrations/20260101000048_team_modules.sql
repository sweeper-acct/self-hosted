-- Migration 048: team_modules — per-team business module activation
-- Each team activates a subset of the firm's active modules.
-- Constraint: team_modules ⊆ firm_modules (enforced at API layer).
-- Empty team_modules = inherits all firm modules (backward compatible).

CREATE TABLE team_modules (
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  firm_id      UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  module_name  TEXT NOT NULL CHECK (
    module_name IN ('bas_gst', 'payroll', 'tax_individual', 'tax_company', 'smsf', 'asic', 'advisory')
  ),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, module_name)
);

CREATE INDEX idx_team_modules_team_id ON team_modules(team_id);
CREATE INDEX idx_team_modules_firm_id  ON team_modules(firm_id);

ALTER TABLE team_modules ENABLE ROW LEVEL SECURITY;

-- Firm boundary — RESTRICTIVE, cannot be overridden
CREATE POLICY team_modules_firm_boundary ON team_modules
  AS RESTRICTIVE FOR ALL
  USING (firm_id = auth_firm_id());

-- All authenticated users can read their firm's team_modules
CREATE POLICY team_modules_read ON team_modules
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (firm_id = auth_firm_id());

-- Owner / admin: firm-wide manage
-- Partner: own team only
CREATE POLICY team_modules_manage ON team_modules
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_role() IN ('owner', 'admin')
    OR (auth_user_role() = 'partner' AND team_id = auth_team_id())
  );

CREATE POLICY team_modules_update ON team_modules
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    auth_user_role() IN ('owner', 'admin')
    OR (auth_user_role() = 'partner' AND team_id = auth_team_id())
  );

CREATE POLICY team_modules_delete ON team_modules
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    auth_user_role() IN ('owner', 'admin')
    OR (auth_user_role() = 'partner' AND team_id = auth_team_id())
  );
