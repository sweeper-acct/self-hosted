-- Migration 017: Add engagement_date to clients
-- engagement_date: the date the client formally engaged the accounting firm
-- (when the engagement letter / service agreement was signed).
-- Separate from activated_at (system activation timestamp, set by staff action).

ALTER TABLE clients ADD COLUMN engagement_date DATE;
