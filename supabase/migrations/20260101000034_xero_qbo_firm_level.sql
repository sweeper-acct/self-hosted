-- Migration 034: Firm-level Xero/QBO configuration
-- Adds selected_tenant_id + tenant_name + auto_push to xero_connections
-- Adds auto_push to qbo_firm_connections
-- Drops per-client Xero/QBO columns (moved to firm level)

ALTER TABLE xero_connections
  ADD COLUMN IF NOT EXISTS selected_tenant_id   TEXT,
  ADD COLUMN IF NOT EXISTS selected_tenant_name TEXT,
  ADD COLUMN IF NOT EXISTS auto_push            BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE qbo_firm_connections
  ADD COLUMN IF NOT EXISTS auto_push BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE clients
  DROP COLUMN IF EXISTS xero_tenant_id,
  DROP COLUMN IF EXISTS xero_tenant_name,
  DROP COLUMN IF EXISTS xero_auto_push,
  DROP COLUMN IF EXISTS qbo_realm_id,
  DROP COLUMN IF EXISTS qbo_company_name,
  DROP COLUMN IF EXISTS qbo_auto_push;
