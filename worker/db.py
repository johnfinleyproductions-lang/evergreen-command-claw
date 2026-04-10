"""asyncpg database layer for the Evergreen Command worker.

Responsibilities:
- Pool lifecycle (open/close) with JSONB type codec
- claim_next_run: atomic FOR UPDATE SKIP LOCKED fetch + flip to 'running'
- insert_tool_call / update_tool_call: tool execution records
- log: append a row to the `logs` table
- finalize_run: mark run 'succeeded' or 'failed' with output + timing
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


async def claim_next_run() -> Optional[asyncpg.Record]:
    """Atomically claim one pending run and flip to 'running'.

    Returns the run row or None if no pending runs exist.
    Safe for concurrent workers thanks to FOR UPDATE SKIP LOCKED.
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
                SET status = 'running', started_at = now()
                WHERE id = $1
                """,
                row["id"],
            )
            return row


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


async def finalize_run_success(run_id: UUID, output: dict) -> None:
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET status = 'succeeded', output = $2, finished_at = now()
            WHERE id = $1
            """,
            run_id,
            output,
        )


async def finalize_run_failure(run_id: UUID, error_message: str) -> None:
    assert _pool is not None
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE runs
            SET status = 'failed', error_message = $2, finished_at = now()
            WHERE id = $1
            """,
            run_id,
            error_message,
        )
