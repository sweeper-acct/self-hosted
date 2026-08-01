-- Migration 018: Add contact_email to clients
-- Stores the primary accounting contact email for client communication
-- (separate from directors.email which holds legal director emails)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email TEXT;
