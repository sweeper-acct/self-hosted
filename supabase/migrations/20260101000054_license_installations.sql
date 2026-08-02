-- Migration 053: license_installations table
-- Tracks which installation_id is bound to which MCP subscription.
-- Phase 1: records bindings for audit; instance-count enforcement deferred to Phase 2.
-- Accessible only via service_role (admin client); RLS blocks all user access.

CREATE TABLE IF NOT EXISTS license_installations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES mcp_customers(id)     ON DELETE CASCADE,
    subscription_id UUID        NOT NULL REFERENCES mcp_subscriptions(id) ON DELETE CASCADE,
    installation_id UUID        NOT NULL,
    hostname        TEXT,
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_license_inst UNIQUE (subscription_id, installation_id)
);

-- Index for fast lookup by subscription
CREATE INDEX IF NOT EXISTS idx_license_inst_sub ON license_installations(subscription_id);

-- RLS: deny all user access — only service_role (admin client) may read/write
ALTER TABLE license_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY license_installations_deny_users ON license_installations
    AS RESTRICTIVE FOR ALL
    USING (FALSE);
