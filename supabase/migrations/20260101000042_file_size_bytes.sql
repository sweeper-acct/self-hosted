-- Migration 042: file_size_bytes — track uploaded file sizes for storage quota enforcement

-- Pipeline files (bank statements, workpapers, BAS reports)
ALTER TABLE files
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

-- Supporting evidence and client query documents
ALTER TABLE case_documents
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

COMMENT ON COLUMN files.file_size_bytes IS 'Raw file size in bytes at upload time. NULL for agent-generated files promoted from extraction.';
COMMENT ON COLUMN case_documents.file_size_bytes IS 'Raw file size in bytes at upload time.';
