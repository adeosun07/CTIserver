-- Migration 004: Add voicemail and user mapping support

-- Create voicemails table
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

-- Index for efficient filtering by app and user
CREATE INDEX idx_voicemails_app_id ON voicemails(app_id);
CREATE INDEX idx_voicemails_app_created ON voicemails(app_id, created_at DESC);
CREATE INDEX idx_voicemails_dialpad_call ON voicemails(app_id, dialpad_call_id);
CREATE INDEX idx_voicemails_user ON voicemails(app_id, dialpad_user_id);

-- Create dialpad_user_mappings table
CREATE TABLE dialpad_user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  dialpad_user_id BIGINT NOT NULL,
  crm_user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(app_id, dialpad_user_id)
);

-- Index for efficient lookups
CREATE INDEX idx_user_mappings_app_dialpad ON dialpad_user_mappings(app_id, dialpad_user_id);
CREATE INDEX idx_user_mappings_app_crm ON dialpad_user_mappings(app_id, crm_user_id);

-- Add tracking columns to calls table for API key rotation audit
ALTER TABLE apps
ADD COLUMN api_key_rotated_at TIMESTAMP;

-- Create audit log for API key rotations (optional but recommended)
CREATE TABLE api_key_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'rotated', 'revoked')),
  old_key_hint TEXT,
  new_key_hint TEXT,
  performed_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_api_key_audit_app ON api_key_audit_log(app_id, created_at DESC);
