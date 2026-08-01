-- Migration 20260101000009: task idempotency guard
--
-- Prevents duplicate active tasks of the same type within a case.
-- An active task is one whose status is pending, in_progress, or waiting_human.
--
-- This is a partial unique index (not a constraint on completed/rejected tasks),
-- so a task can be retried after rejection without violating uniqueness.
--
-- Protects against:
--   (a) task-seeding being called twice for the same case (INSERT conflict → 23505)
--   (b) advance_workflow or case-creation code inserting a duplicate active task
--
-- Does NOT protect against double-UPDATE in advance_workflow (UPDATE does not
-- trigger a unique index violation). Entry-status checks in agent tasks handle that.

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_case_type_active
    ON tasks (case_id, task_type)
    WHERE status IN ('pending', 'in_progress', 'waiting_human');
