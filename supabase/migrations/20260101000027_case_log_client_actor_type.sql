-- Migration 027: add 'client' actor_type to case_log
-- Needed for client_query_answered entries where actor has no user account (no actor_id).
-- 'client' is distinct from 'human' (staff) — client submissions go through public magic link.

-- Extend the actor_type CHECK constraint
ALTER TABLE case_log DROP CONSTRAINT IF EXISTS case_log_actor_type_check;
ALTER TABLE case_log ADD CONSTRAINT case_log_actor_type_check CHECK (
    actor_type IN ('human', 'hermes_orchestrator', 'bookkeeping_agent', 'bas_agent', 'client')
);

-- The existing chk_case_log_human_has_actor only applies to 'human' — 'client' is exempt.
-- No change needed to that constraint.
