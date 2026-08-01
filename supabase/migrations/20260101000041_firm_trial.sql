-- Migration 041 — Firm trial access
-- trial_ends_at: null = not on trial; set to future date = active trial
-- trial_plan: which plan level during trial (default growth)
-- Standard trial = 7 days; special partners can be extended manually via SQL or admin endpoint.

ALTER TABLE firms
    ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_plan     TEXT DEFAULT 'growth'
                                            CHECK (trial_plan IN ('starter', 'growth', 'scale'));

COMMENT ON COLUMN firms.trial_ends_at IS 'Trial expiry timestamp. NULL = not on trial. Set to future date to grant/extend trial.';
COMMENT ON COLUMN firms.trial_plan IS 'Plan level active during trial period (starter/growth/scale). Default growth.';
