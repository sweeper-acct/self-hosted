-- Migration 022: case_documents table
-- Stores client-provided query evidence (WeChat screenshots, explanations,
-- contracts, invoices supplied in response to accountant queries).
-- Agents NEVER read this table. Pipeline documents remain in the files table.

CREATE TABLE IF NOT EXISTS case_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    query_id        UUID,           -- null until Query module built (Phase N)
    document_type   TEXT NOT NULL,  -- receipt | invoice | payroll | ato_statement
                                    -- | screenshot | contract | ato_receipt | other
    file_name       TEXT NOT NULL,
    storage_path    TEXT NOT NULL,  -- {firm_id}/{client_id}/{period}/evidence/{ts}_{name}
    note            TEXT,           -- optional accountant note on upload
    uploaded_by     UUID REFERENCES users(id),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_case_documents_case_id  ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_firm_id  ON case_documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_query_id ON case_documents(query_id)
    WHERE query_id IS NOT NULL;

-- RLS
ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;

-- Outer fence: firm boundary (RESTRICTIVE — cannot be overridden by any PERMISSIVE policy)
CREATE POLICY case_documents_firm_boundary ON case_documents
    AS RESTRICTIVE FOR ALL
    USING (firm_id = auth_firm_id());

-- Read: any team member in the same firm (firm boundary already guaranteed above)
CREATE POLICY case_documents_select ON case_documents
    AS PERMISSIVE FOR SELECT
    USING (
        auth_user_role() IN ('owner', 'admin', 'partner', 'manager', 'senior', 'junior')
    );

-- Insert: any authenticated team member
CREATE POLICY case_documents_insert ON case_documents
    AS PERMISSIVE FOR INSERT
    WITH CHECK (
        firm_id = auth_firm_id()
        AND auth_user_role() IN ('owner', 'admin', 'partner', 'manager', 'senior', 'junior')
    );

-- Delete: uploader, senior+, or admin/owner
CREATE POLICY case_documents_delete ON case_documents
    AS PERMISSIVE FOR DELETE
    USING (
        uploaded_by = auth.uid()
        OR auth_user_role() IN ('owner', 'admin', 'partner', 'manager', 'senior')
    );

-- Grant to authenticated role
GRANT SELECT, INSERT, DELETE ON case_documents TO authenticated;
