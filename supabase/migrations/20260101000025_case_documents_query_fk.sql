-- Migration 025: Add FK constraint case_documents.query_id → queries.id
-- Required for PostgREST embedded join: .select("*, docs:case_documents(id, file_name)")
-- ON DELETE SET NULL: if a query is deleted, document remains as case evidence.

ALTER TABLE case_documents
  ADD CONSTRAINT fk_case_documents_query
  FOREIGN KEY (query_id) REFERENCES queries(id) ON DELETE SET NULL;
