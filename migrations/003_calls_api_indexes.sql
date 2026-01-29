-- Migration: Calls API Performance Indexes
-- Description: Adds indexes to optimize common query patterns for the Calls API
-- Date: 2026-01-27

-- Index for listing calls by app (primary query pattern)
-- Covers: app_id + started_at DESC ordering
CREATE INDEX idx_calls_app_started 
ON calls(app_id, started_at DESC NULLS LAST);

-- Index for filtering by status (e.g., active calls dashboard)
-- Covers: app_id + status + started_at
CREATE INDEX idx_calls_app_status_started 
ON calls(app_id, status, started_at DESC NULLS LAST);

-- Index for filtering by direction
-- Covers: app_id + direction + started_at
CREATE INDEX idx_calls_app_direction_started 
ON calls(app_id, direction, started_at DESC NULLS LAST);

-- Index for active calls specifically (hot query)
-- Covers: app_id + status IN ('ringing', 'active')
CREATE INDEX idx_calls_active 
ON calls(app_id, started_at DESC NULLS LAST) 
WHERE status IN ('ringing', 'active');

-- Index for phone number lookups
-- Covers: app_id + from_number
CREATE INDEX idx_calls_from_number 
ON calls(app_id, from_number);

-- Index for phone number lookups
-- Covers: app_id + to_number
CREATE INDEX idx_calls_to_number 
ON calls(app_id, to_number);

-- Add comment explaining the indexes
COMMENT ON INDEX idx_calls_app_started IS 'Primary index for listing calls by app, ordered by started_at';
COMMENT ON INDEX idx_calls_app_status_started IS 'Index for filtering calls by status';
COMMENT ON INDEX idx_calls_active IS 'Partial index for active calls dashboard (hot query)';
