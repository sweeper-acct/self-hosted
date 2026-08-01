-- Migration 015 — Add senior_bas_review to tasks.task_type CHECK constraint
--
-- senior_bas_review is inserted between bas_draft and manager_review for teams
-- with approval_chain.senior_review = true. The task_type CHECK constraint must
-- include it or any case creation for such teams fails with a constraint violation.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_task_type_check
    CHECK (task_type IN (
        'extract',
        'validate_extraction',
        'gst_prep',
        'validate_gst',
        'senior_review',
        'bas_draft',
        'senior_bas_review',
        'manager_review',
        'client_confirm',
        'certify'
    ));
