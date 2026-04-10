-- Make.com Blueprints table
CREATE TYPE make_category AS ENUM (
  'social-media',
  'lead-gen',
  'content-creation',
  'voice-sales',
  'ai-agents',
  'saas-tools',
  'other'
);

CREATE TABLE make_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category make_category NOT NULL DEFAULT 'other',
  lesson_key TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT,
  blueprint_json JSONB,
  module_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_make_blueprints_category ON make_blueprints(category);
CREATE INDEX idx_make_blueprints_tags ON make_blueprints USING GIN(tags);
CREATE INDEX idx_make_blueprints_lesson_key ON make_blueprints(lesson_key);
