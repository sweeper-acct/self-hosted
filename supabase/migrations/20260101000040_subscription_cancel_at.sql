-- Migration 040: subscription_cancel_at for cancel-at-period-end state
ALTER TABLE firms ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMPTZ;
