-- Migration 008 — Supabase Storage RLS policies
--
-- Policies on storage.objects cover ALL firm-{firm_id} buckets.
-- Buckets are created dynamically at firm onboarding (Task 1.4, FastAPI).
-- These policies apply automatically when each new bucket is created —
-- no per-firm policy configuration required.
--
-- service_role bypasses RLS → promote_file() (Task 1.4) needs no entry here.
-- Only user JWT paths (authenticated role) are constrained.
--
-- File path format (matches files.storage_path CHECK in Migration 003):
--   bucket : firm-{firm_id}
--   name   : {firm_id}/{client_id}/{period}/{state}/{filename}
--   e.g.     3295e7cb-.../a1b2c3-.../2025-03/raw/statement.pdf
--
-- auth_firm_id() → public.auth_firm_id() (defined in Migration 004, updated 007)
-- NULL-safe: if auth_firm_id() is NULL (no custom claims yet), all policies
-- evaluate to NULL = false → access blocked. No explicit NULL guard needed.

-- ── SELECT ────────────────────────────────────────────────────────────────────
-- Read files only from your own firm's bucket.
-- Fine-grained control (Junior sees only assigned-client files) is enforced at
-- the DB layer via files table RLS (Migration 004) — not duplicated here.

CREATE POLICY storage_objects_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'firm-' || (public.auth_firm_id())::text
    );

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- Upload only to raw/ paths within your firm's bucket.
-- Blocks direct writes to validated/, reviewed/, final/, archived/ via the
-- Storage API. Those paths are written exclusively by service_role via
-- promote_file() (Task 1.4), which bypasses RLS by design.
--
-- Pattern: {firm_id}/{client_id}/{period}/raw/{filename}
-- LIKE '/%/%/raw/%' allows any client_id and period segment before raw/.

CREATE POLICY storage_objects_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'firm-' || (public.auth_firm_id())::text
        AND name LIKE (public.auth_firm_id())::text || '/%/%/raw/%'
    );

-- ── UPDATE: no policy → default deny ─────────────────────────────────────────
-- Files are immutable once uploaded. State transitions create a new file at a
-- new path (INSERT-only model, mirroring files table design in Migration 003).

-- ── DELETE: no policy → default deny ─────────────────────────────────────────
-- 5-year minimum retention requirement. Archival = promote to archived/ path
-- via service_role, never deletion.
