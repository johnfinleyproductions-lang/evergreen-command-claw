-- Add lesson_key column for grouping workflows with their documentation
ALTER TABLE automations ADD COLUMN lesson_key TEXT;
CREATE INDEX idx_automations_lesson_key ON automations(lesson_key);
