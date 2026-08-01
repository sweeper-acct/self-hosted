-- Migration 036: Billing — subscription plan names + extraction tracking + credits

-- 1. Update subscription_plan constraint to match new plan names
ALTER TABLE firms DROP CONSTRAINT IF EXISTS firms_subscription_plan_check;
ALTER TABLE firms ADD CONSTRAINT firms_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'growth', 'scale'));

-- Migrate any existing rows using old values
UPDATE firms SET subscription_plan = 'starter'
  WHERE subscription_plan IN ('professional', 'enterprise');

-- 2. Monthly extraction counter (reset by Celery beat on 1st of each month)
ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS extractions_used_this_month INT NOT NULL DEFAULT 0;

-- 3. Top-up credits table
CREATE TABLE IF NOT EXISTS firm_extraction_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  amount        INT  NOT NULL CHECK (amount > 0),
  remaining     INT  NOT NULL CHECK (remaining >= 0),
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  stripe_payment_intent TEXT
);

CREATE INDEX IF NOT EXISTS idx_firm_credits_firm ON firm_extraction_credits(firm_id)
  WHERE remaining > 0;

-- RLS
ALTER TABLE firm_extraction_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_extraction_credits_boundary ON firm_extraction_credits
  AS RESTRICTIVE FOR ALL
  USING (firm_id = auth_firm_id());

CREATE POLICY firm_extraction_credits_owner_read ON firm_extraction_credits
  AS PERMISSIVE FOR SELECT
  USING (auth_user_role() IN ('owner', 'admin'));
