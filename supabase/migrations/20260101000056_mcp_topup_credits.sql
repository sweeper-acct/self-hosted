-- Migration 053: Add topup_credits to mcp_subscriptions
-- Topup credits are purchased separately and never expire across billing periods.
-- runs_per_period = base plan quota (resets monthly)
-- topup_credits   = purchased top-up (never zeroed on reset)
-- Quota gate: runs_used >= runs_per_period + topup_credits → blocked

ALTER TABLE mcp_subscriptions
    ADD COLUMN IF NOT EXISTS topup_credits INTEGER NOT NULL DEFAULT 0;
