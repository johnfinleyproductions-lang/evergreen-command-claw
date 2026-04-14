-- Phase 5.3 — worker crash recovery + heartbeat.
--
-- Adds a last_heartbeat timestamp the worker bumps every
-- HEARTBEAT_INTERVAL_SECONDS while a run is active. On startup the worker
-- sweeps any status='running' rows whose heartbeat is older than
-- STALE_HEARTBEAT_THRESHOLD_SECONDS and flips them to 'failed' so crashed
-- runs don't strand the queue.
--
-- The partial index keeps lookups cheap: we only ever scan heartbeats for
-- running rows, so we skip indexing the long tail of terminal rows.

ALTER TABLE runs ADD COLUMN last_heartbeat timestamp;

CREATE INDEX IF NOT EXISTS idx_runs_heartbeat
  ON runs(last_heartbeat)
  WHERE status = 'running';
