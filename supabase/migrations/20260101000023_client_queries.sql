-- Migration 023: client query links + queries
-- Accountant generates a magic link → client opens in browser → fills form → submits

CREATE TABLE IF NOT EXISTS client_query_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    password    TEXT NOT NULL,          -- 4-digit PIN, set by accountant
    expires_at  TIMESTAMPTZ NOT NULL,   -- 7 days from creation
    submitted_at TIMESTAMPTZ,           -- when client submitted answers
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id              UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id              UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    link_id              UUID REFERENCES client_query_links(id) ON DELETE SET NULL,
    transaction_row_ref  TEXT,          -- null = case-level query
    merchant             TEXT,
    amount               TEXT,
    query_text           TEXT NOT NULL, -- from explanation
    context_note         TEXT,          -- from accountant note
    status               TEXT NOT NULL DEFAULT 'pending',
                                        -- pending | answered | resolved
    client_answer        TEXT,
    answered_at          TIMESTAMPTZ,
    resolved_by          UUID REFERENCES users(id),
    resolved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queries_case_id  ON queries(case_id);
CREATE INDEX IF NOT EXISTS idx_queries_link_id  ON queries(link_id);
CREATE INDEX IF NOT EXISTS idx_client_query_links_token ON client_query_links(token);

-- RLS on client_query_links (firm-scoped, accountant-only)
ALTER TABLE client_query_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY cql_firm_boundary ON client_query_links
    AS RESTRICTIVE FOR ALL USING (firm_id = auth_firm_id());

CREATE POLICY cql_select ON client_query_links
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() IN ('owner','admin','partner','manager','senior','junior'));

CREATE POLICY cql_insert ON client_query_links
    AS PERMISSIVE FOR INSERT
    WITH CHECK (firm_id = auth_firm_id()
        AND auth_user_role() IN ('owner','admin','partner','manager','senior','junior'));

-- RLS on queries (firm-scoped, accountant-only)
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY queries_firm_boundary ON queries
    AS RESTRICTIVE FOR ALL USING (firm_id = auth_firm_id());

CREATE POLICY queries_select ON queries
    AS PERMISSIVE FOR SELECT
    USING (auth_user_role() IN ('owner','admin','partner','manager','senior','junior'));

CREATE POLICY queries_insert ON queries
    AS PERMISSIVE FOR INSERT
    WITH CHECK (firm_id = auth_firm_id()
        AND auth_user_role() IN ('owner','admin','partner','manager','senior','junior'));

CREATE POLICY queries_update ON queries
    AS PERMISSIVE FOR UPDATE
    USING (auth_user_role() IN ('owner','admin','partner','manager','senior','junior'));

GRANT SELECT, INSERT, UPDATE ON client_query_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON queries TO authenticated;
