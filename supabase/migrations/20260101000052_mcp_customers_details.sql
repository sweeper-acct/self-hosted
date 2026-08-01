-- Migration 052: Add firm details to mcp_customers
-- abn, address, contact_person are now required fields on the enterprise request form

ALTER TABLE mcp_customers
  ADD COLUMN IF NOT EXISTS abn TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT;
