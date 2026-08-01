-- Migration 037: Billing anchor day (anniversary-based extraction reset)
-- billing_anchor_day: day-of-month on which the firm's billing cycle resets (1–28)
-- Capped at 28 to avoid Feb 29/30/31 edge cases.
-- Set at firm registration time; Stripe webhook will update on plan change.

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS billing_anchor_day INT NOT NULL DEFAULT 1
  CHECK (billing_anchor_day BETWEEN 1 AND 28);
