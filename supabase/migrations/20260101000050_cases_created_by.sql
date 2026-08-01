-- Migration 050: Add created_by to cases table
ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
