-- Migration 20260101000010: notifications table + Realtime
--
-- Replaces the notify_user_in_app log-only stub.
-- All roles subscribe to notifications WHERE user_id = auth.uid().
-- Fan-out logic (who gets notified for which event) lives in the backend
-- notify_user_in_app Celery task — frontend has no role awareness required.

CREATE TABLE notifications (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    case_id     uuid        NOT NULL REFERENCES cases(id)  ON DELETE CASCADE,
    task_id     uuid        NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
    message     text        NOT NULL,
    action_url  text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    read_at     timestamptz
);

-- Efficient query for "my unread notifications" (ordered newest-first)
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- user_id = auth.uid() is already the tightest possible scope (more specific
-- than firm_id), so a separate RESTRICTIVE firm boundary is not needed here.
CREATE POLICY notifications_own_select ON notifications
    AS PERMISSIVE FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY notifications_own_update ON notifications
    AS PERMISSIVE FOR UPDATE
    USING (user_id = auth.uid());

-- INSERT is via admin/service-role client (notify_user_in_app Celery task).
-- No user INSERT policy — prevents clients from spoofing notifications.

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Add to the default Supabase Realtime publication so the frontend channel
-- subscription receives postgres_changes events for INSERT.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
