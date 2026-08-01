-- Migration 011: Semantic task status values
--
-- Replace generic 'approved' with role-specific terminal statuses:
--   validated  → validate_extraction / validate_gst submitted by Junior/Senior
--   reviewed   → senior_review submitted by Senior
--   confirmed  → client_confirm submitted by Partner
--   certified  → certify submitted by Partner
--   approved   → manager_approve submitted by Manager (kept — manager IS approving)
--
-- 'approved' is retained in the enum for manager_approve tasks and as a fallback.

-- 1. Drop existing CHECK constraint on status
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 2. Add new CHECK constraint with semantic values
ALTER TABLE tasks
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN (
        'pending',
        'in_progress',
        'waiting_human',
        'validated',
        'reviewed',
        'confirmed',
        'certified',
        'approved',
        'rejected',
        'complete'
    ));

-- 3. Drop and recreate completed_at consistency constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_completed_at_consistency;

ALTER TABLE tasks
    ADD CONSTRAINT chk_completed_at_consistency
    CHECK (
        (status IN ('validated', 'reviewed', 'confirmed', 'certified', 'approved', 'rejected', 'complete')
            AND completed_at IS NOT NULL)
        OR status NOT IN ('validated', 'reviewed', 'confirmed', 'certified', 'approved', 'rejected', 'complete')
    );
