-- Add due_date column to todos table
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

-- Create email reminder configuration table
CREATE TABLE IF NOT EXISTS email_reminders_config (
  user_id VARCHAR(255) PRIMARY KEY,
  frequency_millis BIGINT DEFAULT 86400000,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email reminder status table (tracking when last email was sent)
CREATE TABLE IF NOT EXISTS email_reminder_status (
  user_id VARCHAR(255) PRIMARY KEY,
  last_email_sent TIMESTAMP,
  last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
