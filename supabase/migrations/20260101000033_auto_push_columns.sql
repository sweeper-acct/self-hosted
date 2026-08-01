-- Migration 033: Auto-push flags for Xero / QuickBooks per client
-- Set by owner/admin at client-setup time; certify task checks these and pushes automatically

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS xero_auto_push BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS qbo_auto_push  BOOLEAN NOT NULL DEFAULT FALSE;
