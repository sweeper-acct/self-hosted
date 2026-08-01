-- Migration 039: Stripe billing fields on firms table
ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_interval          TEXT NOT NULL DEFAULT 'monthly'
    CHECK (plan_interval IN ('monthly', 'annual'));
