-- Migration 052: MCP Enterprise — self-hosted customer tables
-- mcp_customers: one record per self-hosted deployment
-- mcp_subscriptions: their MCP API access plan (monthly/annual)
-- mcp_api_keys: the actual bearer keys used to call /mcp/* endpoints

-- ─── mcp_customers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcp_customers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   TEXT UNIQUE NOT NULL,
    firm_name               TEXT NOT NULL,
    stripe_customer_id      TEXT,

    -- License (download access gate)
    license_issued_at       TIMESTAMPTZ,
    license_is_free         BOOLEAN DEFAULT FALSE,
    license_payment_intent  TEXT,   -- null for free-tier licenses

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_mcp_customers_updated_at
    BEFORE UPDATE ON mcp_customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mcp_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcp_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id             UUID NOT NULL REFERENCES mcp_customers(id) ON DELETE CASCADE,
    stripe_subscription_id  TEXT,
    plan                    TEXT NOT NULL CHECK (plan IN ('trial', 'starter', 'growth', 'scale')),
    interval                TEXT NOT NULL CHECK (interval IN ('monthly', 'annual')),
    runs_per_period         INTEGER NOT NULL,
    runs_used               INTEGER NOT NULL DEFAULT 0,
    period_reset_at         TIMESTAMPTZ,
    status                  TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    cancel_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_mcp_subscriptions_updated_at
    BEFORE UPDATE ON mcp_subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mcp_api_keys ────────────────────────────────────────────────────────────
-- key_prefix: first 12 chars shown to customer (e.g. "sk-swp-a1b2c")
-- key_hash:   SHA256 of full key, used for server-side validation
CREATE TABLE IF NOT EXISTS mcp_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES mcp_customers(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES mcp_subscriptions(id) ON DELETE SET NULL,
    key_prefix      TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,
    label           TEXT NOT NULL DEFAULT 'Default',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mcp_subscriptions_customer
    ON mcp_subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_customer
    ON mcp_api_keys(customer_id);

-- key_hash lookup is the hot path for every MCP request
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_hash
    ON mcp_api_keys(key_hash) WHERE is_active = TRUE;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- MCP customers are NOT Supabase Auth users.
-- All access from backend uses service_role (bypasses RLS).
-- RLS enabled with no PERMISSIVE policies = anon/authenticated cannot read.
ALTER TABLE mcp_customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_api_keys     ENABLE ROW LEVEL SECURITY;

-- ─── Free license counter helper ─────────────────────────────────────────────
-- Count via: SELECT COUNT(*) FROM mcp_customers WHERE license_is_free = TRUE
-- Limit configured here as a constant (change when promotion ends)
CREATE OR REPLACE FUNCTION mcp_free_licenses_remaining()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    SELECT GREATEST(0, 50 - COUNT(*)::int)
    FROM mcp_customers
    WHERE license_is_free = TRUE AND license_issued_at IS NOT NULL;
$$;
