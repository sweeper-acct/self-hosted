-- Migration 061: Track when BAS journals were pushed to accounting software
-- Prevents duplicate pushes by persisting push state across page navigations.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS xero_pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qbo_pushed_at  TIMESTAMPTZ;
