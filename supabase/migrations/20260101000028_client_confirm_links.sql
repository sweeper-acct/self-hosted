-- Migration 028: client_confirm_links table + extend case_log constraints
-- Supports the client BAS confirmation flow via magic link.
-- Manager (full chain) or Senior (minimal chain) sends BAS PDF to client,
-- client returns signed document, accountant confirms to close the loop.

-- ── 1. client_confirm_links table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_confirm_links (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id         UUID        NOT NULL REFERENCES firms(id),
    token           TEXT        NOT NULL UNIQUE,
    password        TEXT        NOT NULL,
    outbound_doc_id UUID        REFERENCES case_documents(id) ON DELETE SET NULL,
    signed_doc_id   UUID        REFERENCES case_documents(id) ON DELETE SET NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    submitted_at    TIMESTAMPTZ,   -- when client uploaded signed document
    confirmed_at    TIMESTAMPTZ,   -- when accountant confirmed receipt
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE client_confirm_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_confirm_links_firm_boundary ON client_confirm_links
    AS RESTRICTIVE FOR ALL
    USING (firm_id = auth_firm_id());

CREATE POLICY client_confirm_links_team_select ON client_confirm_links
    AS PERMISSIVE FOR SELECT
    USING (
        case_id IN (
            SELECT id FROM cases WHERE team_id = auth_team_id()
        )
        OR auth_user_role() IN ('owner', 'admin')
    );

CREATE POLICY client_confirm_links_team_insert ON client_confirm_links
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        firm_id = auth_firm_id()
        AND (
            case_id IN (SELECT id FROM cases WHERE team_id = auth_team_id())
            OR auth_user_role() IN ('owner', 'admin')
        )
    );

CREATE POLICY client_confirm_links_team_update ON client_confirm_links
    AS PERMISSIVE FOR UPDATE
    USING (
        case_id IN (
            SELECT id FROM cases WHERE team_id = auth_team_id()
        )
        OR auth_user_role() IN ('owner', 'admin')
    );

CREATE POLICY client_confirm_links_team_delete ON client_confirm_links
    AS PERMISSIVE FOR DELETE
    USING (
        case_id IN (
            SELECT id FROM cases WHERE team_id = auth_team_id()
        )
        OR auth_user_role() IN ('owner', 'admin')
    );

-- ── 3. Extend case_log action CHECK ────────────────────────────────────────

ALTER TABLE case_log DROP CONSTRAINT IF EXISTS case_log_action_check;
ALTER TABLE case_log ADD CONSTRAINT case_log_action_check CHECK (
    action IN (
        'delegate', 'promote', 'pause', 'resume', 'reject_route',
        'validate', 'approve', 'reject', 'certify',
        'extraction_complete', 'gst_prep_complete', 'bas_draft_complete',
        'diagnostic_observation',
        'client_query_sent', 'client_query_answered', 'client_query_revoked',
        'client_confirm_sent', 'client_confirmation_received'
    )
);
