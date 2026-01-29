-- ============================================================================
-- CTI SERVER DATABASE SCHEMA
-- ============================================================================
-- Complete production-ready PostgreSQL schema
-- Combines base schema + all migrations
-- Copy this entire file and execute in your CTI database
-- ============================================================================

-- ============================================================================
-- TABLES: Core Application & Authentication
-- ============================================================================

-- Apps table: Stores tenant/app records
CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  api_key_rotated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Dialpad OAuth connections: Stores access tokens per app
CREATE TABLE dialpad_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_org_id BIGINT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  environment TEXT CHECK (environment IN ('sandbox', 'production')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- API key audit log: Tracks all key generation, rotation, revocation
CREATE TABLE api_key_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'rotated', 'revoked')),
  old_key_hint TEXT,
  new_key_hint TEXT,
  performed_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================================
-- TABLES: User Management & Mappings
-- ============================================================================

-- Dialpad users: Caches Dialpad user metadata
CREATE TABLE dialpad_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialpad_user_id BIGINT UNIQUE NOT NULL,
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- User mappings: Links Dialpad users to your CRM users
CREATE TABLE dialpad_user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_user_id BIGINT NOT NULL,
  crm_user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(app_id, dialpad_user_id)
);

-- ============================================================================
-- TABLES: Call & Message Records
-- ============================================================================

-- Calls table: Stores all call records
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_call_id BIGINT UNIQUE NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT,
  to_number TEXT,
  status TEXT,
  dialpad_user_id BIGINT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  recording_url TEXT,
  is_voicemail BOOLEAN DEFAULT false,
  voicemail_audio_url TEXT,
  voicemail_transcript TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- Messages table: Stores SMS/messaging records
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_message_id BIGINT UNIQUE NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT,
  to_number TEXT,
  text TEXT,
  dialpad_user_id BIGINT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- Voicemails table: Dedicated voicemail records
CREATE TABLE voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_call_id BIGINT,
  dialpad_user_id BIGINT,
  from_number TEXT,
  to_number TEXT,
  recording_url TEXT,
  transcript TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ============================================================================
-- TABLES: Webhook Event Processing
-- ============================================================================

-- Webhook events: Queue of incoming Dialpad webhook events
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES apps(id),
  event_type TEXT,
  dialpad_event_id TEXT UNIQUE,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NULL,
  received_at TIMESTAMP DEFAULT now()
);

-- ============================================================================
-- INDEXES: App Management
-- ============================================================================

-- Fast lookup of apps by ID (primary key index auto-created)
-- Fast lookup of apps by name
CREATE INDEX idx_apps_name ON apps(name);

-- Fast lookup of active apps
CREATE INDEX idx_apps_active ON apps(is_active) WHERE is_active = true;

-- ============================================================================
-- INDEXES: Dialpad Connections
-- ============================================================================

-- Fast lookup of connection by app_id
CREATE INDEX idx_dialpad_connections_app_id ON dialpad_connections(app_id);

-- Fast lookup of connection by Dialpad org ID
CREATE INDEX idx_dialpad_connections_org_id ON dialpad_connections(dialpad_org_id);

-- ============================================================================
-- INDEXES: API Key Audit Log
-- ============================================================================

-- Fast lookup of audit log by app (most common query)
CREATE INDEX idx_api_key_audit_app ON api_key_audit_log(app_id, created_at DESC);

-- ============================================================================
-- INDEXES: User Management
-- ============================================================================

-- Fast lookup of Dialpad users by app
CREATE INDEX idx_dialpad_users_app_id ON dialpad_users(app_id);

-- Fast lookup of Dialpad users by dialpad_user_id
CREATE INDEX idx_dialpad_users_dialpad_id ON dialpad_users(dialpad_user_id);

-- Fast lookup of user mappings by app + Dialpad user
CREATE INDEX idx_user_mappings_app_dialpad ON dialpad_user_mappings(app_id, dialpad_user_id);

-- Fast lookup of user mappings by app + CRM user
CREATE INDEX idx_user_mappings_app_crm ON dialpad_user_mappings(app_id, crm_user_id);

-- ============================================================================
-- INDEXES: Calls (Performance-Critical)
-- ============================================================================

-- Primary index for listing calls by app, ordered by start time (DESC)
-- Covers query: SELECT * FROM calls WHERE app_id = ? ORDER BY started_at DESC
CREATE INDEX idx_calls_app_started ON calls(app_id, started_at DESC NULLS LAST);

-- Index for filtering calls by app + status
-- Covers query: SELECT * FROM calls WHERE app_id = ? AND status = ?
CREATE INDEX idx_calls_app_status_started ON calls(app_id, status, started_at DESC NULLS LAST);

-- Index for filtering calls by app + direction
-- Covers query: SELECT * FROM calls WHERE app_id = ? AND direction = ?
CREATE INDEX idx_calls_app_direction_started ON calls(app_id, direction, started_at DESC NULLS LAST);

-- Partial index for active calls only (hot query optimization)
-- Covers: SELECT * FROM calls WHERE app_id = ? AND status IN ('ringing', 'active')
CREATE INDEX idx_calls_active ON calls(app_id, started_at DESC NULLS LAST)
WHERE status IN ('ringing', 'active');

-- Index for phone number lookups (from_number)
CREATE INDEX idx_calls_from_number ON calls(app_id, from_number);

-- Index for phone number lookups (to_number)
CREATE INDEX idx_calls_to_number ON calls(app_id, to_number);

-- Index for JSONB payload searching
CREATE INDEX idx_calls_raw_payload ON calls USING GIN (raw_payload);

-- ============================================================================
-- INDEXES: Messages
-- ============================================================================

-- Fast lookup of messages by app
CREATE INDEX idx_messages_app_id ON messages(app_id);

-- Fast lookup of messages by sent time
CREATE INDEX idx_messages_app_sent ON messages(app_id, sent_at DESC NULLS LAST);

-- ============================================================================
-- INDEXES: Voicemails
-- ============================================================================

-- Fast lookup of voicemails by app
CREATE INDEX idx_voicemails_app_id ON voicemails(app_id);

-- Fast lookup of voicemails with timeline
CREATE INDEX idx_voicemails_app_created ON voicemails(app_id, created_at DESC);

-- Fast lookup of voicemails by Dialpad call
CREATE INDEX idx_voicemails_dialpad_call ON voicemails(app_id, dialpad_call_id);

-- Fast lookup of voicemails by user
CREATE INDEX idx_voicemails_user ON voicemails(app_id, dialpad_user_id);

-- ============================================================================
-- INDEXES: Webhook Events (Processing Pipeline)
-- ============================================================================

-- Most critical index: Find unprocessed events efficiently
-- Covers: SELECT * FROM webhook_events WHERE processed_at IS NULL
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at)
WHERE processed_at IS NULL;

-- Index for routing events by type
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);

-- Index for timeline queries
CREATE INDEX idx_webhook_events_received ON webhook_events(received_at DESC);

-- Index for app-specific event queries
CREATE INDEX idx_webhook_events_app_id ON webhook_events(app_id);

-- ============================================================================
-- COMMENTS: Documentation
-- ============================================================================

COMMENT ON TABLE apps IS 'Multi-tenant app records. Each app is completely isolated.';
COMMENT ON COLUMN apps.api_key IS 'Bcrypt-hashed API key. Plain key never stored.';
COMMENT ON COLUMN apps.api_key_rotated_at IS 'Timestamp of last key rotation/generation.';

COMMENT ON TABLE dialpad_connections IS 'OAuth token storage per app. Refreshed automatically before expiry.';
COMMENT ON COLUMN dialpad_connections.dialpad_org_id IS 'Dialpad organization ID. Used for webhook routing.';

COMMENT ON TABLE api_key_audit_log IS 'Immutable audit trail of all API key operations for compliance.';
COMMENT ON COLUMN api_key_audit_log.action IS 'Operation: created (initial), rotated (new key), revoked (disabled).';
COMMENT ON COLUMN api_key_audit_log.old_key_hint IS 'First 8 + last 4 chars of old key (for identification).';
COMMENT ON COLUMN api_key_audit_log.new_key_hint IS 'First 8 + last 4 chars of new key (for identification).';

COMMENT ON TABLE calls IS 'Call records created from Dialpad webhook events and API queries.';
COMMENT ON COLUMN calls.dialpad_call_id IS 'Unique call ID from Dialpad. Used to prevent duplicate insertions.';
COMMENT ON COLUMN calls.status IS 'Call state: ringing, active, ended, held, etc.';
COMMENT ON COLUMN calls.raw_payload IS 'Sanitized Dialpad webhook payload for debugging/auditing.';

COMMENT ON TABLE webhook_events IS 'Incoming Dialpad webhook events awaiting async processing.';
COMMENT ON COLUMN webhook_events.event_type IS 'Determines which handler processes this event (call.ring, call.started, etc).';
COMMENT ON COLUMN webhook_events.dialpad_event_id IS 'Unique event ID from Dialpad. Prevents duplicate processing.';
COMMENT ON COLUMN webhook_events.processed_at IS 'NULL = unprocessed. Set when handler completes.';

COMMENT ON INDEX idx_calls_active IS 'Hot query optimization. Active calls dashboard query runs very frequently.';
COMMENT ON INDEX idx_webhook_events_processed_at IS 'Critical for event processor performance. Used every 5 seconds.';

-- ============================================================================
-- GRANT PERMISSIONS (if using separate DB user)
-- ============================================================================
-- Uncomment if using a separate non-admin database user

-- CREATE USER cti_app WITH PASSWORD 'secure-password';
-- GRANT CONNECT ON DATABASE CTI TO cti_app;
-- GRANT USAGE ON SCHEMA public TO cti_app;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cti_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cti_app;

-- ============================================================================
-- SAMPLE DATA (for testing only - remove in production)
-- ============================================================================
-- Uncomment to populate sample test data

-- INSERT INTO apps (id, name, is_active, created_at, updated_at)
-- VALUES (
--   '550e8400-e29b-41d4-a716-446655440000',
--   'Postman Test App',
--   true,
--   NOW(),
--   NOW()
-- );

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================
-- Run these queries to verify schema is complete

-- SELECT count(*) as table_count FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expected: 11 tables

-- SELECT count(*) as index_count FROM pg_indexes
-- WHERE schemaname = 'public';
-- Expected: 28+ indexes

-- \dt        -- List all tables
-- \di        -- List all indexes
-- \d apps    -- Show apps table structure
