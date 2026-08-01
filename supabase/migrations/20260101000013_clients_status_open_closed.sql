-- Migration 013: Rename client status open/closed
--
-- Old values: pending | active | inactive
-- New values: open (client being serviced) | closed (service ended)
--
-- Data migration: pending + active → open, inactive → closed
-- activated_at is now set on registration and retained when closed.

-- 1. Drop ALL old constraints — clients_status_check MUST be dropped before
--    the UPDATE or the INSERT of 'open'/'closed' will be rejected by the old CHECK.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_active_client_has_junior;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_activated_at_consistency;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;

-- 2. Migrate existing rows (old constraint is now gone)
UPDATE clients SET status = 'open'   WHERE status IN ('pending', 'active');
UPDATE clients SET status = 'closed' WHERE status = 'inactive';

-- 3. Backfill activated_at for any rows that lack it (old pending clients)
UPDATE clients SET activated_at = created_at WHERE activated_at IS NULL;

-- 4. Add the new status CHECK constraint

ALTER TABLE clients ADD CONSTRAINT clients_status_check
    CHECK (status IN ('open', 'closed'));

-- 5. All clients now have activated_at (set on registration, retained on close)
ALTER TABLE clients ADD CONSTRAINT chk_activated_at_required
    CHECK (activated_at IS NOT NULL);

-- 6. Update column default
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'open';
