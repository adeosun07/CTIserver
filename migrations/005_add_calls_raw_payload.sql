-- Migration: Add raw_payload to calls
-- Date: 2026-01-29

ALTER TABLE calls
ADD COLUMN IF NOT EXISTS raw_payload JSONB;
