-- Migration 060: Per-client Xero and QBO tenant mapping
-- Accounting firms push BAS to each CLIENT's own Xero/QBO org,
-- not the firm's own account. These columns store the per-client mapping.
-- Fallback: if NULL, push falls back to firm-level selected tenant.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS xero_tenant_id   TEXT,
  ADD COLUMN IF NOT EXISTS xero_tenant_name TEXT,
  ADD COLUMN IF NOT EXISTS qbo_realm_id     TEXT,
  ADD COLUMN IF NOT EXISTS qbo_company_name TEXT;
