-- Migration 016: Add account column to files table
--
-- Files that represent bank statements can now be tagged with a
-- "Bank / Account" label (e.g. "CBA Operating", "ANZ Payroll").
-- This label is injected into every extracted CSV row at extraction time
-- and flows through validated/ → processed/ → reviewed/ unchanged.
-- calculate_bas_summary() groups by account for multi-account BAS workpapers.
--
-- Nullable by design: single-account cases omit the field entirely.

ALTER TABLE files ADD COLUMN IF NOT EXISTS account TEXT DEFAULT NULL;
