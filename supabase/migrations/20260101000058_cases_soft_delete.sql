-- Migration 058: Soft delete for cases + unique constraint on active folders
-- Prevents duplicate folders for same client+type+period
-- Allows "delete" without triggering case_log append-only trigger

ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Only one active (non-deleted) folder per client + type + period
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_client_type_period_active
  ON cases (client_id, case_type, period)
  WHERE deleted_at IS NULL;
