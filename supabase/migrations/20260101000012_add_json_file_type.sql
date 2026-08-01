-- Migration 012: Allow 'json' as a valid file_type for agent-generated BAS draft files.
-- The original check constraint in migration 003 only listed pdf/xlsx/xls/csv.

ALTER TABLE files
  DROP CONSTRAINT IF EXISTS files_file_type_check;

ALTER TABLE files
  ADD CONSTRAINT files_file_type_check
  CHECK (file_type IN ('pdf', 'xlsx', 'xls', 'csv', 'json'));
