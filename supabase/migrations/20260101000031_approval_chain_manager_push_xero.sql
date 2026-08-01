-- Migration 031: add manager_can_push_xero to teams.approval_chain
-- Backfills existing rows with the default value (false = Partner only)

UPDATE teams
SET approval_chain = approval_chain || '{"manager_can_push_xero": false}'::jsonb
WHERE approval_chain IS NOT NULL
  AND NOT (approval_chain ? 'manager_can_push_xero');
