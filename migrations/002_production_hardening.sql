-- Migration: Production Hardening
-- Description: Adds raw_payload column to calls table for debugging
-- Date: 2026-01-27

-- Add raw_payload column to store sanitized webhook payload
-- This provides debugging context while keeping payload size manageable
-- Full payloads are preserved in webhook_events.payload
ALTER TABLE calls
ADD COLUMN raw_payload JSONB DEFAULT NULL;

-- Create index on raw_payload for debugging queries (GIN index for JSONB)
CREATE INDEX idx_calls_raw_payload ON calls USING GIN (raw_payload);

-- Add comment explaining the column
COMMENT ON COLUMN calls.raw_payload IS 'Sanitized webhook payload for debugging. Full payload in webhook_events.payload';
