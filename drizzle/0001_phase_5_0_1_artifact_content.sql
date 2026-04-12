-- Phase 5.0.1 — Store artifact content directly in Postgres
--
-- Why: the Phase 5.0 content route returns 500 because two processes
-- (Python worker writes, Next.js reads) disagreed about disk paths and
-- realpath containment. Moving content into a TEXT column eliminates
-- the whole class of bugs. See README §Lessons Learned and
-- ARCHITECTURE.md §13.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).
-- `path` stays NOT NULL for now — write_brief still writes to disk as a
-- belt-and-suspenders backup until we're confident in the DB-only path.

BEGIN;

ALTER TABLE artifacts
    ADD COLUMN IF NOT EXISTS content TEXT;

ALTER TABLE artifacts
    ADD COLUMN IF NOT EXISTS content_size INTEGER;

-- Index already exists from Phase 5.0 schema (on run_id via FK), no new index needed.

COMMIT;

-- Verification (run manually after migration):
--   \d artifacts
-- Expect to see: content (text), content_size (integer)
