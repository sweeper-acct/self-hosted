-- Migration 001 — Core tables: firms, teams, users, sla_profiles
-- No RLS in this migration — applied in Migration 004.
-- Enums, foreign keys, check constraints, indexes all included here.

-- ── firms ─────────────────────────────────────────────────────────────────────
-- gen_random_uuid() is built into PostgreSQL 13+ — no extension needed.

CREATE TABLE firms (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    abn                 CHAR(11),                        -- 11 digits, no spaces
    address             TEXT,
    subscription_plan   TEXT NOT NULL DEFAULT 'starter'
                            CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
    data_region         TEXT NOT NULL DEFAULT 'ap-southeast-2',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN firms.abn IS '11-digit Australian Business Number, stored without spaces or hyphens';
COMMENT ON COLUMN firms.data_region IS 'Must be ap-southeast-2 (Sydney) for Australian data residency compliance';

-- ── sla_profiles ──────────────────────────────────────────────────────────────
-- Created before teams because teams will reference it in a later migration.
-- Defined here so the table exists when Migration 002 adds the FK on clients.

CREATE TABLE sla_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- SLA days per workflow step. Zero = same business day.
    -- Keys must match task_type values in tasks table (Migration 003).
    step_sla_days   JSONB NOT NULL DEFAULT '{
        "extract":              0,
        "validate_extraction":  1,
        "gst_prep":             0,
        "validate_gst":         1,
        "senior_review":        2,
        "bas_draft":            0,
        "manager_review":       1,
        "client_confirm":       2,
        "certify":              1
    }'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sla_profiles_firm_id ON sla_profiles(firm_id);

-- ── teams ─────────────────────────────────────────────────────────────────────
-- approval_chain drives the Orchestrator's dynamic task plan.
-- The Orchestrator reads this at case creation to determine which optional
-- steps (senior_review, manager_approve) to include in the workflow.
-- Updated by the system whenever team members change roles.

CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- partner_id resolved after users table exists; added via ALTER below.
    name            TEXT NOT NULL,
    approval_chain  JSONB NOT NULL DEFAULT '{
        "senior_review":    false,
        "senior_id":        null,
        "manager_approve":  false,
        "manager_id":       null
    }'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_firm_id ON teams(firm_id);

-- ── users ─────────────────────────────────────────────────────────────────────
-- id matches Supabase Auth user UUID — no separate auth table needed.
-- role is stored here; JWT custom claims hook reads this to inject into token.

CREATE TABLE users (
    id          UUID PRIMARY KEY,           -- must match auth.users.id
    firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL
                    CHECK (role IN ('admin', 'partner', 'manager', 'senior', 'junior')),
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'pending')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (firm_id, email)
);

CREATE INDEX idx_users_firm_id   ON users(firm_id);
CREATE INDEX idx_users_team_id   ON users(team_id);
CREATE INDEX idx_users_role      ON users(team_id, role);   -- common: "all juniors in team"

-- ── Back-fill FK: teams.partner_id → users ────────────────────────────────────
-- Added after users exists to avoid circular dependency.
-- Nullable because the team may be created before the partner user record exists
-- during onboarding (partner invites themselves first).

ALTER TABLE teams
    ADD COLUMN partner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_teams_partner_id ON teams(partner_id);

-- ── Back-fill FK: sla_profiles default on teams ───────────────────────────────
-- Teams can have a default SLA profile. Added here after sla_profiles exists.
-- Clients can override per-client (added in Migration 002).

ALTER TABLE teams
    ADD COLUMN default_sla_profile_id UUID REFERENCES sla_profiles(id) ON DELETE SET NULL;

-- ── updated_at triggers ───────────────────────────────────────────────────────
-- Keeps updated_at current without relying on application layer.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_firms_updated_at
    BEFORE UPDATE ON firms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sla_profiles_updated_at
    BEFORE UPDATE ON sla_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── approval_chain integrity check ───────────────────────────────────────────
-- Enforces: if senior_review=true then senior_id must not be null,
-- and vice versa. Same for manager_approve / manager_id.
-- Applied as a CHECK constraint using a plpgsql function so the logic
-- is readable and reusable.

CREATE OR REPLACE FUNCTION validate_approval_chain(chain JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- senior_review enabled → senior_id must be present
    IF (chain->>'senior_review')::boolean IS TRUE
       AND (chain->>'senior_id') IS NULL THEN
        RETURN FALSE;
    END IF;
    -- senior_id present → senior_review must be enabled
    IF (chain->>'senior_id') IS NOT NULL
       AND (chain->>'senior_review')::boolean IS NOT TRUE THEN
        RETURN FALSE;
    END IF;
    -- manager_approve enabled → manager_id must be present
    IF (chain->>'manager_approve')::boolean IS TRUE
       AND (chain->>'manager_id') IS NULL THEN
        RETURN FALSE;
    END IF;
    -- manager_id present → manager_approve must be enabled
    IF (chain->>'manager_id') IS NOT NULL
       AND (chain->>'manager_approve')::boolean IS NOT TRUE THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Default value passes validation (all false/null), so existing rows are fine.
-- The constraint allows null senior_id/manager_id when corresponding flag is false.
ALTER TABLE teams
    ADD CONSTRAINT chk_approval_chain_consistency
    CHECK (validate_approval_chain(approval_chain));
