/*
  Reminder state, push subscriptions, and client_id for per-device isolation.
  Used by reminder-cron Edge Function for background notifications and auto-rollover.
*/

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_tasks_client_date ON tasks(client_id, task_date);

CREATE TABLE IF NOT EXISTS reminder_state (
  client_id text PRIMARY KEY,
  timezone text NOT NULL DEFAULT 'UTC',
  morning_hour integer NOT NULL DEFAULT 8 CHECK (morning_hour >= 0 AND morning_hour <= 23),
  evening_hour integer NOT NULL DEFAULT 17 CHECK (evening_hour >= 0 AND evening_hour <= 23),
  last_morning_notif_date date,
  last_evening_notif_date date,
  last_evening_review_date date,
  pending_rollover_notice text,
  midnight_job_done_for_date date,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client ON push_subscriptions(client_id);

ALTER TABLE reminder_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon reminder_state"
  ON reminder_state FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon push_subscriptions"
  ON push_subscriptions FOR ALL TO anon
  USING (true) WITH CHECK (true);
