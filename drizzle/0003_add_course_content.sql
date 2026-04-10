-- Course content table for Skool lesson transcripts (.srt) and case studies (.txt)
CREATE TABLE IF NOT EXISTS course_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  chapter TEXT NOT NULL,
  section TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT,
  content_type TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_content_chapter ON course_content(chapter);
CREATE INDEX IF NOT EXISTS idx_course_content_section ON course_content(section);
CREATE INDEX IF NOT EXISTS idx_course_content_tags ON course_content USING GIN(tags);
