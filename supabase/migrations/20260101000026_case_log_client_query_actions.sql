-- Migration 026: extend case_log action check constraint to include client query actions
-- Root cause: create_query_link and submit_query_answers write case_log with
-- 'client_query_sent', 'client_query_answered', 'client_query_revoked' — all blocked
-- by the original constraint defined inline in migration 003.

ALTER TABLE case_log DROP CONSTRAINT IF EXISTS case_log_action_check;

ALTER TABLE case_log ADD CONSTRAINT case_log_action_check CHECK (action IN (
    -- Orchestrator routing decisions
    'delegate', 'promote', 'pause', 'resume', 'reject_route',
    -- Human actions
    'validate', 'approve', 'reject', 'certify',
    -- Agent completion signals
    'extraction_complete', 'gst_prep_complete', 'bas_draft_complete',
    -- Orchestrator diagnostic (speculative, never triggers behaviour)
    'diagnostic_observation',
    -- Client query audit trail
    'client_query_sent', 'client_query_answered', 'client_query_revoked'
));
