CREATE TYPE link_category AS ENUM (
  'google-doc',
  'notion',
  'canva',
  'google-drive',
  'github',
  'airtable',
  'community',
  'tool',
  'other'
);

CREATE TABLE links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category link_category NOT NULL DEFAULT 'other',
  lesson_key TEXT,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_links_category ON links(category);
CREATE INDEX idx_links_tags ON links USING GIN(tags);
CREATE INDEX idx_links_lesson_key ON links(lesson_key);