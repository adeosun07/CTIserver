-- Migration: Add webhook event processing support
-- Description: Adds processed_at column to webhook_events table to track processing status
-- Date: 2026-01-27

-- Add processed_at column to track when webhook events are processed
ALTER TABLE webhook_events
ADD COLUMN processed_at TIMESTAMP DEFAULT NULL;

-- Create index on processed_at for efficient querying of unprocessed events
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at) WHERE processed_at IS NULL;

-- Create index on event_type for efficient routing
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);

-- Add unique constraint on dialpad_event_id to enforce idempotency
ALTER TABLE webhook_events
ADD CONSTRAINT uq_webhook_events_dialpad_event_id UNIQUE (dialpad_event_id);

-- Note: The calls table already exists with required fields including:
-- - dialpad_call_id (with UNIQUE constraint for idempotency)
-- - app_id, direction, from_number, to_number, status
-- - dialpad_user_id, started_at, ended_at, duration_seconds
-- - recording_url, is_voicemail, voicemail_audio_url, voicemail_transcript
