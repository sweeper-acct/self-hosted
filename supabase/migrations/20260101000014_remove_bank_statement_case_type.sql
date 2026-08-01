-- Migration 014 — Remove bank_statement as a case_type
--
-- bank_statement was never a distinct business line. It ran the identical
-- task chain as bas_gst. All staging case data has been manually cleared,
-- so no data migration is required — this is a constraint-only cleanup.
--
-- Changes:
--   1. is_mvp_active_case_type() function — remove bank_statement
--   2. cases.case_type CHECK constraint — remove bank_statement
--   3. cases.is_mvp_active generated column — remove bank_statement
--   4. tasks.case_type CHECK constraint — remove bank_statement (must stay in sync)

-- ── 1. Update helper function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_mvp_active_case_type(ct TEXT) RETURNS BOOLEAN AS $$
BEGIN
    RETURN ct IN ('bas_gst');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 2. cases.case_type CHECK constraint ───────────────────────────────────────

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_case_type_check;

ALTER TABLE cases
    ADD CONSTRAINT cases_case_type_check
    CHECK (case_type IN (
        -- MVP active
        'bas_gst',
        -- Reserved — not implemented in MVP; UI shows "Coming soon"
        'tax_return', 'payroll', 'smsf',
        'asic', 'audit', 'advisory'
    ));

-- ── 3. cases.is_mvp_active generated column ──────────────────────────────────
-- Generated column expressions cannot be altered in-place; must drop + re-add.

ALTER TABLE cases DROP COLUMN is_mvp_active;

ALTER TABLE cases
    ADD COLUMN is_mvp_active BOOLEAN NOT NULL
        GENERATED ALWAYS AS (case_type IN ('bas_gst')) STORED;

-- ── 4. tasks.case_type CHECK constraint ───────────────────────────────────────
-- tasks.case_type mirrors cases.case_type (set by trigger). Must stay in sync.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_case_type_check;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_case_type_check
    CHECK (case_type IN (
        'bas_gst',
        'tax_return', 'payroll', 'smsf',
        'asic', 'audit', 'advisory'
    ));
