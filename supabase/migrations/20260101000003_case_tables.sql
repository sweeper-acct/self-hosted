-- Migration 003 鈥?Case tables: cases, files, tasks, task_edits, case_log
-- Covers 003a (case_type values) in the same file 鈥?TEXT + CHECK, not Postgres ENUM.
-- No RLS in this migration 鈥?applied in Migration 004.
--
-- Append-only enforcement:
--   case_log  鈫?BEFORE DELETE/UPDATE FOR EACH STATEMENT 鈫?RAISE EXCEPTION (service role included)
--   files     鈫?BEFORE UPDATE FOR EACH ROW 鈫?RAISE EXCEPTION if file_state changes
--              (INSERT-only model: each state transition = new file record, never update-in-place)
--
-- Denormalised fields (set by trigger, application must not pass them):
--   cases.firm_id    鈫?clients.firm_id
--   cases.team_id    鈫?clients.team_id   (enforces case always follows client's team)
--   files.firm_id    鈫?cases.firm_id
--   tasks.firm_id    鈫?cases.firm_id
--   tasks.case_type  鈫?cases.case_type   (sync: update both CHECK lists together)

-- 鈹€鈹€ case_type canonical list (003a) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Defined once as a SQL function so both cases.case_type and tasks.case_type
-- reference the same truth 鈥?if a new business line is added, update this
-- function AND the two CHECK constraints below.
--
-- MVP active:    bank_statement, bas_gst
-- Reserved only: all others 鈥?UI shows "Coming soon", workflow cannot start

CREATE OR REPLACE FUNCTION is_mvp_active_case_type(ct TEXT) RETURNS BOOLEAN AS $$
BEGIN
    RETURN ct IN ('bank_statement', 'bas_gst');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 鈹€鈹€ cases 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

CREATE TABLE cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    -- team_id and firm_id are derived from client_id by trigger on INSERT/UPDATE.
    -- Application must not pass these 鈥?they are set automatically.
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_type       TEXT NOT NULL
                        CHECK (case_type IN (
                            -- MVP active
                            'bank_statement', 'bas_gst',
                            -- Reserved 鈥?not implemented in MVP.
                            -- Add future business lines here AND in tasks.case_type CHECK.
                            'tax_return', 'payroll', 'smsf',
                            'asic', 'audit', 'advisory'
                        )),
    -- Computed convenience flag. Application reads this to gate workflow start.
    -- True only for MVP-active types; reserved types are always false.
    is_mvp_active   BOOLEAN NOT NULL
                        GENERATED ALWAYS AS (
                            case_type IN ('bank_statement', 'bas_gst')
                        ) STORED,
    period          TEXT NOT NULL
                        CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending',        -- created, no tasks started
                            'in_progress',    -- at least one task running
                            'waiting_human',  -- paused at a human gate
                            'complete',       -- Partner certified
                            'cancelled'
                        )),
    current_step    TEXT,    -- mirrors the active task's task_type; null before first task
    assigned_junior UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_senior UUID REFERENCES users(id) ON DELETE SET NULL,
    sla_profile_id  UUID REFERENCES sla_profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_team_status     ON cases(team_id, status);
CREATE INDEX idx_cases_client_id       ON cases(client_id);
CREATE INDEX idx_cases_firm_id         ON cases(firm_id);
CREATE INDEX idx_cases_assigned_junior ON cases(assigned_junior);
CREATE INDEX idx_cases_assigned_senior ON cases(assigned_senior);
CREATE INDEX idx_cases_case_type       ON cases(case_type, team_id);
CREATE INDEX idx_cases_period          ON cases(period);

-- Derive team_id and firm_id from client_id. Fires on INSERT and when client_id
-- changes (client reassignment propagates to the case automatically).
CREATE OR REPLACE FUNCTION set_case_derived_fields()
RETURNS TRIGGER AS $$
BEGIN
    SELECT firm_id, team_id
    INTO   NEW.firm_id, NEW.team_id
    FROM   clients
    WHERE  id = NEW.client_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'client_id % does not exist', NEW.client_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_set_derived_fields
    BEFORE INSERT OR UPDATE OF client_id ON cases
    FOR EACH ROW EXECUTE FUNCTION set_case_derived_fields();

CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 鈹€鈹€ files 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- INSERT-only: each workflow state transition creates a NEW file record.
-- file_state is set at INSERT and must never be changed.
-- storage_path must be prefixed with firm_id to prevent cross-tenant access.
--
-- State sequence (forward only, never reversed):
--   raw 鈫?extracted 鈫?validated 鈫?processed 鈫?reviewed 鈫?final 鈫?archived
--   鈽?validated and reviewed are human-certified (written only by system on human action)
--   鈽?archived is immutable 鈥?Partner certify locks the file permanently

CREATE TABLE files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    file_type       TEXT NOT NULL
                        CHECK (file_type IN ('pdf', 'xlsx', 'xls', 'csv')),
    storage_path    TEXT NOT NULL,
    file_state      TEXT NOT NULL
                        CHECK (file_state IN (
                            'raw', 'extracted', 'validated',
                            'processed', 'reviewed', 'final', 'archived'
                        )),
    source          TEXT NOT NULL
                        CHECK (source IN (
                            'uploaded',          -- user upload
                            'agent_generated',   -- BookkeepingAgent or BASAgent output
                            'human_certified'    -- promoted by system on human submit/approve
                        )),
    uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- No updated_at: files are INSERT-only, no field should be tracked for change time.

    -- Storage path must be scoped to the owning firm. Prevents cross-tenant path construction.
    CONSTRAINT chk_storage_path_firm_scoped
        CHECK (storage_path LIKE (firm_id::text || '/%'))
);

CREATE INDEX idx_files_case_state  ON files(case_id, file_state);
CREATE INDEX idx_files_firm_id     ON files(firm_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);

-- Derive firm_id from the parent case. Fires on INSERT only (case_id never changes).
CREATE OR REPLACE FUNCTION set_file_firm_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT firm_id INTO NEW.firm_id
    FROM   cases
    WHERE  id = NEW.case_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'case_id % does not exist', NEW.case_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_files_set_firm_id
    BEFORE INSERT ON files
    FOR EACH ROW EXECUTE FUNCTION set_file_firm_id();

-- Prevent file_state from ever being changed after INSERT.
-- Other columns (file_name, storage_path) may be updated 鈥?only file_state is locked.
CREATE OR REPLACE FUNCTION prevent_file_state_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.file_state IS DISTINCT FROM OLD.file_state THEN
        RAISE EXCEPTION
            'file_state is immutable after INSERT. '
            'Transition attempted: % 鈫?%. '
            'Create a new file record instead.',
            OLD.file_state, NEW.file_state;
    END IF;
    RETURN NEW;  -- allow update to proceed (for other columns)
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_files_immutable_state
    BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION prevent_file_state_update();

-- 鈹€鈹€ tasks 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- One task per workflow step per case. Orchestrator creates tasks;
-- humans and agents update status.
--
-- case_type is denormalised from cases for JOIN-free filtering.
-- Must use the same CHECK list as cases.case_type 鈥?update both together
-- when adding new business lines.
--
-- task_type covers BAS/GST workflow steps (MVP). Future business lines
-- will add their own step names here. The case_type column identifies
-- which business line a task belongs to, enabling type-safe routing.

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- Sync note: update this CHECK and cases.case_type CHECK together.
    case_type       TEXT NOT NULL
                        CHECK (case_type IN (
                            'bank_statement', 'bas_gst',
                            'tax_return', 'payroll', 'smsf',
                            'asic', 'audit', 'advisory'
                        )),
    task_type       TEXT NOT NULL
                        CHECK (task_type IN (
                            -- BAS/GST workflow steps (MVP active)
                            'extract',
                            'validate_extraction',
                            'gst_prep',
                            'validate_gst',
                            'senior_review',
                            'bas_draft',
                            'manager_review',
                            'client_confirm',
                            'certify'
                            -- Add future business line step names here as implemented.
                            -- Pattern: keep step names generic where possible so they
                            -- can be reused across business lines (e.g. senior_review,
                            -- client_confirm, certify are business-line agnostic).
                        )),
    assigned_agent  TEXT
                        CHECK (assigned_agent IN (
                            -- MVP active
                            'bookkeeping_agent', 'bas_agent', 'human',
                            -- Reserved for future phases
                            'tax_agent', 'payroll_agent', 'smsf_agent',
                            'asic_agent', 'audit_agent', 'advisory_agent'
                        )),
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending',
                            'in_progress',
                            'waiting_human',
                            'approved',
                            'rejected',
                            'complete'
                        )),
    sla_due_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    reject_comment  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Human-assigned tasks must have a specific user assigned.
    CONSTRAINT chk_human_task_has_assignee
        CHECK (assigned_agent != 'human' OR assigned_to IS NOT NULL),

    -- completed_at must only be set when status is terminal.
    CONSTRAINT chk_completed_at_consistency
        CHECK (
            (status IN ('approved', 'rejected', 'complete') AND completed_at IS NOT NULL)
            OR status NOT IN ('approved', 'rejected', 'complete')
        )
);

CREATE INDEX idx_tasks_case_id        ON tasks(case_id);
CREATE INDEX idx_tasks_assigned_to    ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_firm_status    ON tasks(firm_id, status);
CREATE INDEX idx_tasks_case_type      ON tasks(case_type, firm_id);

-- Derive firm_id and case_type from parent case on INSERT.
-- case_id never changes after insert, so UPDATE trigger not needed.
CREATE OR REPLACE FUNCTION set_task_derived_fields()
RETURNS TRIGGER AS $$
BEGIN
    SELECT firm_id, case_type
    INTO   NEW.firm_id, NEW.case_type
    FROM   cases
    WHERE  id = NEW.case_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'case_id % does not exist', NEW.case_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_set_derived_fields
    BEFORE INSERT ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_task_derived_fields();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 鈹€鈹€ task_edits 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Immutable audit trail of inline edits made by humans during validate/review steps.
-- row_ref identifies which row in the task output was edited (e.g. transaction ID).

CREATE TABLE task_edits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    row_ref     TEXT NOT NULL,
    field       TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    edited_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    edited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No updated_at: task_edits are INSERT-only by convention (not DB-enforced here;
    -- enforcement comes via no UPDATE endpoint in the API layer + RLS in Migration 004).
);

CREATE INDEX idx_task_edits_task_id ON task_edits(task_id);
CREATE INDEX idx_task_edits_edited_by ON task_edits(edited_by);

-- 鈹€鈹€ case_log 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Immutable audit log. Every routing decision, human action, and agent output is
-- recorded here. Retention: 5 years minimum (compliance requirement).
--
-- Append-only enforcement: BEFORE DELETE/UPDATE FOR EACH STATEMENT triggers
-- raise exceptions for ALL callers 鈥?including service role (which bypasses RLS
-- but not triggers). This is the structural guarantee; RLS in Migration 004
-- adds defence-in-depth for normal user paths.
--
-- diagnostic_observation entries: output_snapshot must contain
--   { "speculative": true, "language": "may indicate / possible / unverified" }
-- This is an application-layer convention 鈥?not DB-enforced to keep the schema
-- flexible for future observation types.

CREATE TABLE case_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    actor_type      TEXT NOT NULL
                        CHECK (actor_type IN (
                            'human',
                            'hermes_orchestrator',
                            'bookkeeping_agent',
                            'bas_agent'
                            -- Add future agent types here as implemented.
                        )),
    -- Null for agent actors; required for human actors (see constraints below).
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL
                        CHECK (action IN (
                            -- Orchestrator routing decisions
                            'delegate', 'promote', 'pause', 'resume', 'reject_route',
                            -- Human actions
                            'validate', 'approve', 'reject', 'certify',
                            -- Agent completion signals
                            'extraction_complete', 'gst_prep_complete', 'bas_draft_complete',
                            -- Orchestrator diagnostic (speculative, never triggers behaviour)
                            'diagnostic_observation'
                        )),
    input_snapshot  JSONB,
    output_snapshot JSONB,
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Human actions must be traceable to a user.
    CONSTRAINT chk_case_log_human_has_actor
        CHECK (actor_type != 'human' OR actor_id IS NOT NULL),

    -- Agent entries must not carry a user actor_id (no impersonation).
    CONSTRAINT chk_case_log_agent_no_actor
        CHECK (actor_type = 'human' OR actor_id IS NULL)
);

-- Primary audit query pattern: all events for a case in chronological order.
CREATE INDEX idx_case_log_case_time   ON case_log(case_id, logged_at);
CREATE INDEX idx_case_log_actor_id    ON case_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_case_log_action      ON case_log(action, logged_at);

-- 鈹€鈹€ case_log append-only triggers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- FOR EACH STATEMENT fires before RLS evaluation, catching all callers including
-- service role. RETURN NULL after RAISE EXCEPTION is unreachable but satisfies
-- plpgsql static analysis (avoids schema linter warnings).

CREATE OR REPLACE FUNCTION prevent_case_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'case_log is append-only. % is not permitted. '
        'Retention policy: 5 years minimum (compliance requirement).',
        TG_OP;
    RETURN NULL;  -- never reached; satisfies plpgsql static analysis
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_case_log_no_delete
    BEFORE DELETE ON case_log
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_case_log_mutation();

CREATE TRIGGER trg_case_log_no_update
    BEFORE UPDATE ON case_log
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_case_log_mutation();
