-- Migration 051: subscription_status column for cancelled firms
-- Replaces the pattern of reverting to 'starter' on subscription deletion.
-- Cancelled firms: data preserved, access locked until reactivation.

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    CHECK (subscription_status IN ('active', 'trialing', 'cancelled'))
    DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- All existing firms with a stripe_subscription_id are active
UPDATE firms SET subscription_status = 'active' WHERE subscription_status IS NULL;
