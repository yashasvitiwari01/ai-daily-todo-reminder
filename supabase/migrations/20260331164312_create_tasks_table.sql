/*
  # Create tasks table for daily to-do tracking

  1. New Tables
    - `tasks`
      - `id` (uuid, primary key) - Unique identifier for each task
      - `user_id` (uuid) - User who owns the task (for future auth support)
      - `title` (text) - Task title/description
      - `completed` (boolean) - Whether task is completed
      - `task_date` (date) - The date this task is scheduled for
      - `created_at` (timestamptz) - When the task was created
      - `completed_at` (timestamptz, nullable) - When the task was completed

  2. Security
    - Enable RLS on `tasks` table
    - Add policies for future authenticated users to manage their own tasks
    - For now, policies will allow public access for development

  3. Indexes
    - Index on `task_date` for efficient date-based queries
    - Index on `user_id` for efficient user-based queries
*/

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  completed boolean DEFAULT false,
  task_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

CREATE POLICY "Allow public access to tasks for development"
  ON tasks
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);