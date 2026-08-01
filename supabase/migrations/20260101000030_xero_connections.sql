-- Migration 030: Xero OAuth connections + client tenant mapping

CREATE TABLE IF NOT EXISTS xero_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    token_expiry    TIMESTAMPTZ NOT NULL,
    scopes          TEXT DEFAULT '',
    connected_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    connected_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (firm_id)  -- one Xero connection per firm
);

-- Client → Xero tenant mapping
ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_tenant_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_tenant_name TEXT;

-- RLS
ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;

-- Firm boundary — RESTRICTIVE
CREATE POLICY xero_connections_firm_boundary ON xero_connections
    AS RESTRICTIVE FOR ALL
    USING (firm_id = auth_firm_id());

-- Read: all authenticated users in firm
CREATE POLICY xero_connections_select ON xero_connections
    AS PERMISSIVE FOR SELECT
    USING (true);

-- Write: owner/admin/partner only
CREATE POLICY xero_connections_manage ON xero_connections
    AS PERMISSIVE FOR ALL
    USING (auth_user_role() IN ('owner', 'admin', 'partner'));
