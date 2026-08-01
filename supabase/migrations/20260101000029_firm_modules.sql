-- Migration 029: firm_modules — per-firm module activation
-- Firms activate only the modules they need (bas_gst, payroll, tax_returns, smsf, asic, advisory)

CREATE TABLE firm_modules (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id         UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
  module_name     TEXT NOT NULL CHECK (
    module_name IN ('bas_gst', 'payroll', 'tax_individual', 'tax_company', 'smsf', 'asic', 'advisory')
  ),
  active          BOOLEAN DEFAULT true,
  activated_at    TIMESTAMPTZ DEFAULT NOW(),
  activated_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_firm_modules_firm_module ON firm_modules(firm_id, module_name);

ALTER TABLE firm_modules ENABLE ROW LEVEL SECURITY;

-- Firm boundary — restrictive, cannot be overridden
CREATE POLICY firm_modules_firm_boundary ON firm_modules
  AS RESTRICTIVE FOR ALL
  USING (firm_id = auth_firm_id());

-- All authenticated users can read (controls what shows in UI)
CREATE POLICY firm_modules_read ON firm_modules
  AS PERMISSIVE FOR SELECT
  USING (firm_id = auth_firm_id());

-- Owner / admin / partner can manage modules
CREATE POLICY firm_modules_manage ON firm_modules
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() IN ('owner', 'admin', 'partner'));

CREATE POLICY firm_modules_update ON firm_modules
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('owner', 'admin', 'partner'));

CREATE POLICY firm_modules_delete ON firm_modules
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (auth_user_role() IN ('owner', 'admin', 'partner'));

-- Seed bas_gst as active for all existing firms
INSERT INTO firm_modules (firm_id, module_name, active)
SELECT id, 'bas_gst', true FROM firms
ON CONFLICT (firm_id, module_name) DO NOTHING;
