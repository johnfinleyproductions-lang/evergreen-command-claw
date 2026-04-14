"""asyncpg database layer for the Evergreen Command worker.

Responsibilities:
- Pool lifecycle (open/close) with JSONB type codec
- claim_next_run: atomic FOR UPDATE SKIP LOCKED fetch + flip to 'running'
- update_heartbeat / sweep_stale_runs: Phase 5.3 crash-recovery primitives
- is_cancelled / finalize_run_cancelled: Phase 5.4 cooperative-cancel primitives
- insert_tool_call / complete_tool_call / fail_tool_call: tool execution rows
- insert_artifact: artifact rows (briefs, reports, etc)
- write_log: append a structured row to the `logs` table
- finalize_run_success / finalize_run_failure: run status transitions
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

import asyncpg

from config import config

log = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register a JSONB codec so Python dicts round-trip cleanly."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def open_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        log.info("opening asyncpg pool")
        _pool = await asyncpg.create_pool(
            dsn=config.DATABASE_URL,
            min_size=config.POOL_MIN_SIZE,
            max_size=config.POOL_MAX_SIZE,
            init=_init_connection,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        log.info("closing asyncpg pool")
        await _pool.close()
        _pool = None


# --- runs --------------------------------------------------------------------


async def claim_next_run() -> Optional[asyncpg.Record]:
    """Atomically claim one pending run and flip to 'running'.

    Returns the run row or None if no pending runs exist.
    Safe for concurrent workers thanks to FOR UPDATE SKIP LOCKED.

    Phase 5.3: also stamps last_heartbeat = now() so the row has a fresh
    timestamp immediately — otherwise the first heartbeat wouldn't fire
    for HEARTBEAT_INTERVAL_SECONDS and a crashed-at-start run would look
    stale for way too long.
    """
    assert _pool is not None, "pool not opened"
    async with _pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, task_id, status, input, model, created_at
                FROM runs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """
            )
            if row is None:
                return None
            await conn.execute(
                """
                UPDATE runs
                SET status = 'running',
                    started_at = now(),
                    last_heartbeat = now()
                WHERE id = $1
                """,
                row["id"],
            )
            return row


async def update_heartbeat(run_id: UUID) -> None:
    """Bump last_heartbeat for an active run.

    Called every HEARTBEAT_INTERVAL_SECONDS from the background heartbeat
    task in main.py. The WHERE clause limits the write to 'running' rows
    so a late heartbeat can't clobber a run that already terminated.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET last_heartbeat = now()
            WHERE id = $1 AND status = 'running'
            """,
            run_id,
        )


async def sweep_stale_runs(threshold_seconds: float) -> list[UUID]:
    """Flip any 'running' rows with a stale heartbeat to 'failed'.

    Called once on worker startup. Catches two failure modes:
      1. A previous worker crashed mid-run and never finalized the row.
      2. A run is truly stuck and will never heartbeat again.

    Rows with NULL last_heartbeat are also swept if their started_at is
    older than the threshold — that covers rows claimed by a pre-Phase-5.3
    worker that never wrote a heartbeat.

    Returns the list of ids that were flipped so main.py can log them.

    Implementation note: we bind the threshold as a float8 and multiply
    by `interval '1 second'`. An earlier version used `$1::text` +
    `|| ' seconds'::interval` but asyncpg won't auto-cast a Python float
    to text at bind time ("expected str, got float"). Keeping the
    error_message formatting in Python also lets the query take a
    single parameter, which is easier to reason about.
    """
    assert _pool is not None
    error_message = (
        f"Worker crash detected: heartbeat stale (> {threshold_seconds:g}s). "
        f"Run swept on worker startup."
    )
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            UPDATE runs
            SET status = 'failed',
                error_message = $2,
                finished_at = now()
            WHERE status = 'running'
              AND (
                (last_heartbeat IS NOT NULL
                   AND last_heartbeat < now() - ($1 * interval '1 second'))
                OR (last_heartbeat IS NULL
                   AND started_at < now() - ($1 * interval '1 second'))
              )
            RETURNING id
            """,
            threshold_seconds,
            error_message,
        )
        return [r["id"] for r in rows]


async def is_cancelled(run_id: UUID) -> bool:
    """Return True iff the run is currently in status='cancelled'.

    Phase 5.4. Called by agent.py at the top of each iteration of
    run_agent's loop. Also called inside _execute_literal_tool_calls
    between tool dispatches. Must stay cheap — it's in the hot path
    of every iteration.

    The query is a single indexed PK lookup; runs with id missing
    (shouldn't happen in practice, since the caller owns the id from
    claim_next_run) return False, which lets the agent keep running
    rather than aborting on a phantom cancel.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status FROM runs WHERE id = $1",
            run_id,
        )
        return row is not None and row["status"] == "cancelled"


async def finalize_run_success(
    run_id: UUID,
    output: dict,
    *,
    model: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
) -> None:
    """Mark a run 'succeeded' and optionally record token usage + model.

    Phase 5.4: the UPDATE now guards on `status != 'cancelled'` so a
    cancel flip that arrives between run_agent returning and this call
    can't be clobbered back to 'succeeded'. The worker loses the
    computed output in that race, which is acceptable — cancel is rare
    and the cancelled status is what the user asked for.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET status = 'succeeded',
                output = $2,
                finished_at = now(),
                model = COALESCE($3, model),
                prompt_tokens = $4,
                completion_tokens = $5,
                total_tokens = $6
            WHERE id = $1
              AND status != 'cancelled'
            """,
            run_id,
            output,
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
        )


async def finalize_run_failure(run_id: UUID, error_message: str) -> None:
    """Mark a run 'failed' with an error_message.

    Phase 4.5 nuance: this can be called after finalize_run_success for
    max_iterations_exceeded handling. It only touches status +
    error_message + finished_at, preserving the output + token counts
    that finalize_run_success wrote.

    Phase 5.4: guarded on `status != 'cancelled'` so a cancel flip
    sticks. The Phase 4.5 dance still works because the guard lets the
    failure flip from 'succeeded' — it just won't clobber 'cancelled'.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET status = 'failed', error_message = $2, finished_at = now()
            WHERE id = $1
              AND status != 'cancelled'
            """,
            run_id,
            error_message,
        )


async def finalize_run_cancelled(run_id: UUID, output: dict) -> None:
    """Record partial progress for a cancelled run.

    Phase 5.4. Called by execute_run when run_agent returns with
    output.cancelled=true. The status flip itself was done by the
    /api/runs/[id]/cancel endpoint; this call exists to record
    diagnostics (iterations completed, tool_calls_made, reason) and
    stamp finished_at.

    The WHERE clause guards on `status='cancelled'` so a late worker
    write can't resurrect a row that the UI already rejected as
    terminal. If the status has somehow changed (it shouldn't — only
    the worker itself and the cancel endpoint touch status), the
    UPDATE is a no-op.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET output = $2, finished_at = now()
            WHERE id = $1
              AND status = 'cancelled'
            """,
            run_id,
            output,
        )


# --- tool calls --------------------------------------------------------------


async def insert_tool_call(
    run_id: UUID,
    sequence: int,
    tool_name: str,
    arguments: dict,
) -> UUID:
    """Create a tool_calls row in 'running' state. Returns the new id."""
    assert _pool is not None
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO tool_calls (run_id, sequence, tool_name, arguments, status)
            VALUES ($1, $2, $3, $4, 'running')
            RETURNING id
            """,
            run_id,
            sequence,
            tool_name,
            arguments,
        )
        return row["id"]


async def complete_tool_call(
    tool_call_id: UUID,
    result: dict,
    duration_ms: int,
) -> None:
    """Mark a tool_call 'succeeded' with result payload."""
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tool_calls
            SET status = 'succeeded', result = $2, duration_ms = $3
            WHERE id = $1
            """,
            tool_call_id,
            result,
            duration_ms,
        )


async def fail_tool_call(
    tool_call_id: UUID,
    error_message: str,
    duration_ms: int,
) -> None:
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tool_calls
            SET status = 'failed', error_message = $2, duration_ms = $3
            WHERE id = $1
            """,
            tool_call_id,
            error_message,
            duration_ms,
        )


# --- artifacts ---------------------------------------------------------------


async def insert_artifact(
    run_id: UUID,
    *,
    name: str,
    path: str,
    kind: str = "other",
    mime_type: Optional[str] = None,
    size: Optional[int] = None,
    metadata: Optional[dict] = None,
    content: Optional[str] = None,
    content_size: Optional[int] = None,
) -> UUID:
    """Insert an artifact row. `kind` must be report|data|image|code|log|other.

    Phase 5.0.1: accepts `content` (the authoritative text body) and
    `content_size` (byte length) so text artifacts can be read back from
    Postgres without touching disk. `path` is still required for
    backwards compatibility — write_brief continues to write a disk
    backup as belt-and-suspenders until we're confident in DB-only.
    """
    assert _pool is not None
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO artifacts (
                run_id, name, path, kind, mime_type, size, metadata,
                content, content_size
            )
            VALUES ($1, $2, $3, $4::artifact_kind, $5, $6, $7, $8, $9)
            RETURNING id
            """,
            run_id,
            name,
            path,
            kind,
            mime_type,
            size,
            metadata,
            content,
            content_size,
        )
        return row["id"]


# --- logs --------------------------------------------------------------------


async def write_log(
    run_id: UUID,
    level: str,
    message: str,
    data: Optional[dict] = None,
) -> None:
    """Append a structured log row. level must be debug|info|warn|error."""
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO logs (run_id, level, message, data)
            VALUES ($1, $2, $3, $4)
            """,
            run_id,
            level,
            message,
            data,
        )
