-- Migration 024: Add transaction detail fields to queries table
-- So client can see the exact bank row they're being asked about.

ALTER TABLE queries ADD COLUMN IF NOT EXISTS date        TEXT;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS account     TEXT;
