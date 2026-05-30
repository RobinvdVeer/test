-- Migration: Add email reminders functionality
-- Date: 2024-01-15
-- Description: Add due_date to todos table and create email reminder config tables

BEGIN;

-- Add due_date column to todos table
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

-- Create email reminder configuration table
CREATE TABLE IF NOT EXISTS email_reminders_config (
  user_id VARCHAR(255) PRIMARY KEY,
  frequency_millis BIGINT DEFAULT 86400000, -- 24 hours in milliseconds
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email reminder status table (tracking when last email was sent)
CREATE TABLE IF NOT EXISTS email_reminder_status (
  user_id VARCHAR(255) PRIMARY KEY,
  last_email_sent TIMESTAMP,
  last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

COMMIT;

-- Rollback (if needed)
-- BEGIN;
-- DROP INDEX IF EXISTS idx_todos_due_date;
-- DROP TABLE IF EXISTS email_reminder_status;
-- DROP TABLE IF EXISTS email_reminders_config;
-- ALTER TABLE todos DROP COLUMN IF EXISTS due_date;
-- COMMIT;
