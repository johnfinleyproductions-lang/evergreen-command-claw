-- Add n8n Automations table
CREATE TYPE automation_category AS ENUM (
  'fundamentals',
  'web-apps',
  'ai-agents',
  'javascript',
  'voice-comms',
  'lead-gen',
  'make-conversions',
  'standalone',
  'other'
);

CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category automation_category NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_url TEXT,
  workflow_json JSONB,
  node_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automations_category ON automations(category);
CREATE INDEX idx_automations_tags ON automations USING GIN(tags);
