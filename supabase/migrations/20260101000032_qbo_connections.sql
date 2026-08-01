-- Migration 032: QuickBooks Online OAuth connections
-- Mirrors xero_connections table structure

CREATE TABLE IF NOT EXISTS qbo_firm_connections (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id        UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    access_token   TEXT NOT NULL,
    refresh_token  TEXT NOT NULL,
    token_expiry   TIMESTAMPTZ NOT NULL,
    realm_id       TEXT NOT NULL,          -- QBO company ID (from OAuth callback)
    company_name   TEXT,                   -- fetched from QBO CompanyInfo
    scopes         TEXT DEFAULT '',
    connected_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (firm_id)
);

-- RLS
ALTER TABLE qbo_firm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY qbo_connections_firm_boundary ON qbo_firm_connections
    AS RESTRICTIVE FOR ALL
    USING (firm_id = auth_firm_id());

CREATE POLICY qbo_connections_manage ON qbo_firm_connections
    AS PERMISSIVE FOR ALL
    USING (auth_user_role() IN ('owner', 'admin', 'partner'));

-- Per-client QBO company mapping
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS qbo_realm_id    TEXT,
    ADD COLUMN IF NOT EXISTS qbo_company_name TEXT;
