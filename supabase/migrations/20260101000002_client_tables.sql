-- Migration 002 鈥?Client tables: coding_rule_sets, clients, directors
-- No RLS in this migration 鈥?applied in Migration 004.
--
-- Circular dependency between coding_rule_sets 鈫?clients is resolved by:
--   1. Create coding_rule_sets (firm_id only, no client_id yet)
--   2. Create clients (references coding_rule_sets)
--   3. ALTER coding_rule_sets to add client_id (references clients)

-- 鈹€鈹€ coding_rule_sets 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- firm_id + client_id = null  鈫?firm-level default (one per firm)
-- firm_id + client_id = uuid  鈫?client-specific override (one per client)
--
-- GST coding rule priority (enforced by BASAgent, not here):
--   Priority 1 鈥?custom rules from this table (mode = 'custom')
--   Priority 2 鈥?standard ATO rules (BASAgent built-in)
--   Priority 3 鈥?LLM + Orvexa signal (last resort, always flagged)

CREATE TABLE coding_rule_sets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- client_id added after clients table exists (see ALTER below)
    name            TEXT NOT NULL,
    mode            TEXT NOT NULL DEFAULT 'standard'
                        CHECK (mode IN ('standard', 'custom')),
    -- Array of rule objects. Each rule:
    --   { "field": "supplier"|"amount"|"description",
    --     "operator": "contains"|"equals"|"lt"|"gt"|"lte"|"gte",
    --     "value": <string or number>,
    --     "gst_code": "G1"|"G2"|"G3"|"G4"|"G10"|"G11"|"G20",
    --     "type": "cash"|"accruals"  (optional, for amount rules) }
    custom_rules    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When mode='standard', custom_rules must be empty (they are ignored by
    -- BASAgent but an inconsistent state here would be confusing in audits).
    CONSTRAINT chk_coding_rules_mode_consistency
        CHECK (
            (mode = 'standard' AND custom_rules = '[]'::jsonb)
            OR mode = 'custom'
        ),

    -- custom_rules must always be a JSON array, never an object or scalar.
    CONSTRAINT chk_coding_rules_is_array
        CHECK (jsonb_typeof(custom_rules) = 'array')
);

CREATE INDEX idx_coding_rule_sets_firm_id ON coding_rule_sets(firm_id);

-- 鈹€鈹€ clients 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- firm_id is denormalised from teams for RLS performance.
-- Set automatically by trigger on INSERT 鈥?application must not pass it.
--
-- assigned_junior: one Junior per client (fixed assignment).
-- Required when status = 'active'; nullable during onboarding (status = 'pending').

CREATE TABLE clients (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    team_id                 UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    business_name           TEXT NOT NULL,
    abn                     CHAR(11),
    entity_type             TEXT NOT NULL
                                CHECK (entity_type IN (
                                    'company', 'trust', 'partnership',
                                    'sole_trader', 'individual', 'smsf', 'other'
                                )),
    industry                TEXT,
    address                 TEXT,
    bas_cycle               TEXT NOT NULL DEFAULT 'quarterly'
                                CHECK (bas_cycle IN ('monthly', 'quarterly', 'annual')),
    gst_method              TEXT NOT NULL DEFAULT 'accruals'
                                CHECK (gst_method IN ('cash', 'accruals')),
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'active', 'inactive')),
    assigned_junior         UUID REFERENCES users(id) ON DELETE SET NULL,
    coding_rule_set_id      UUID REFERENCES coding_rule_sets(id) ON DELETE SET NULL,
    sla_profile_id          UUID REFERENCES sla_profiles(id) ON DELETE SET NULL,
    activated_at            TIMESTAMPTZ,
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Active clients must have an assigned Junior.
    -- Inactive clients retain their last assigned_junior for audit trail.
    CONSTRAINT chk_active_client_has_junior
        CHECK (status != 'active' OR assigned_junior IS NOT NULL),

    -- activated_at must be set when (and only when) status becomes 'active'.
    CONSTRAINT chk_activated_at_consistency
        CHECK (
            (status = 'active' AND activated_at IS NOT NULL)
            OR (status != 'active' AND activated_at IS NULL)
        )
);

-- Indexes from checklist requirement: "composite indexes on (team_id, status)
-- and (assigned_junior, status)"
CREATE INDEX idx_clients_team_status       ON clients(team_id, status);
CREATE INDEX idx_clients_junior_status     ON clients(assigned_junior, status);
CREATE INDEX idx_clients_firm_id           ON clients(firm_id);
CREATE INDEX idx_clients_coding_rule_set   ON clients(coding_rule_set_id);

-- 鈹€鈹€ firm_id auto-population trigger for clients 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Ensures firm_id on clients always matches teams.firm_id.
-- Application never passes firm_id for client INSERT 鈥?trigger sets it.
-- On UPDATE of team_id (team reassignment), firm_id is recalculated.

CREATE OR REPLACE FUNCTION set_client_firm_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT firm_id INTO NEW.firm_id
    FROM teams
    WHERE id = NEW.team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'team_id % does not exist', NEW.team_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_set_firm_id
    BEFORE INSERT OR UPDATE OF team_id ON clients
    FOR EACH ROW EXECUTE FUNCTION set_client_firm_id();

-- 鈹€鈹€ Back-fill: coding_rule_sets.client_id 鈫?clients 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Added now that clients exists. Nullable: null = firm-level default rule set.

ALTER TABLE coding_rule_sets
    ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX idx_coding_rule_sets_client_id ON coding_rule_sets(client_id);

-- One rule set per (firm, client) pair. client_id = null means firm default,
-- and there can be only one firm default per firm.
CREATE UNIQUE INDEX idx_coding_rule_sets_firm_client
    ON coding_rule_sets(firm_id, client_id);
-- Note: UNIQUE INDEX on (firm_id, client_id) where client_id IS NULL is valid
-- in Postgres 鈥?NULLs are treated as distinct by default, but for a unique
-- partial index covering the null case we use:
CREATE UNIQUE INDEX idx_coding_rule_sets_firm_default
    ON coding_rule_sets(firm_id)
    WHERE client_id IS NULL;

-- Drop the less-specific index now that the partial unique index covers nulls.
DROP INDEX idx_coding_rule_sets_firm_client;

-- 鈹€鈹€ directors 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
-- Multiple directors per client. Used for client confirmation step (BAS sign-off).

CREATE TABLE directors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    position    TEXT,
    email       TEXT,
    phone       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_directors_client_id ON directors(client_id);

-- 鈹€鈹€ updated_at triggers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

CREATE TRIGGER trg_coding_rule_sets_updated_at
    BEFORE UPDATE ON coding_rule_sets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_directors_updated_at
    BEFORE UPDATE ON directors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
