"""Evergreen Command worker — Phase 3A.

Polls the `runs` table for pending work, claims one row at a time,
dispatches tool calls from run.input['tool_calls'], and writes back
tool_calls + logs + final run status.

Expected run.input shape for Phase 3A:
    {
        "tool_calls": [
            {"name": "echo", "arguments": {"message": "hello"}},
            ...
        ]
    }

Run:
    python main.py

Stop: Ctrl-C (graceful shutdown via SIGINT).
"""
import asyncio
import logging
import signal
import time
from typing import Any
from uuid import UUID

import asyncpg

from config import config
from db import (
    claim_next_run,
    close_pool,
    complete_tool_call,
    fail_tool_call,
    finalize_run_failure,
    finalize_run_success,
    insert_tool_call,
    open_pool,
    write_log,
)
from tools.echo import EchoTool
from tools.registry import registry

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")

# --- tool registration -------------------------------------------------------
registry.register(EchoTool())

# --- shutdown handling -------------------------------------------------------
_shutdown = asyncio.Event()


def _request_shutdown(*_: Any) -> None:
    log.info("shutdown requested")
    _shutdown.set()


# --- run execution -----------------------------------------------------------
async def execute_run(run: asyncpg.Record) -> None:
    run_id: UUID = run["id"]
    log.info("executing run %s", run_id)
    await write_log(run_id, "info", "worker claimed run", {"worker": "phase3a"})

    input_data = run["input"] or {}
    tool_calls = input_data.get("tool_calls", [])

    if not tool_calls:
        msg = "run.input.tool_calls is empty or missing"
        log.warning("%s: %s", run_id, msg)
        await write_log(run_id, "warn", msg)
        await finalize_run_failure(run_id, msg)
        return

    results: list[dict] = []

    for seq, call in enumerate(tool_calls):
        name = call.get("name")
        arguments = call.get("arguments", {}) or {}

        if not name:
            await write_log(
                run_id, "error", f"tool_call[{seq}] missing 'name'", {"call": call}
            )
            await finalize_run_failure(run_id, f"tool_call[{seq}] missing 'name'")
            return

        tc_id = await insert_tool_call(run_id, seq, name, arguments)
        await write_log(
            run_id,
            "info",
            f"dispatching tool '{name}'",
            {"sequence": seq, "arguments": arguments},
        )

        start = time.monotonic()
        try:
            result = await registry.execute(name, **arguments)
            duration_ms = int((time.monotonic() - start) * 1000)
            await complete_tool_call(tc_id, result, duration_ms)
            await write_log(
                run_id,
                "info",
                f"tool '{name}' succeeded in {duration_ms}ms",
                {"sequence": seq, "result": result},
            )
            results.append({"name": name, "result": result})
        except Exception as exc:  # noqa: BLE001
            duration_ms = int((time.monotonic() - start) * 1000)
            err = f"{type(exc).__name__}: {exc}"
            log.exception("tool '%s' failed", name)
            await fail_tool_call(tc_id, err, duration_ms)
            await write_log(
                run_id, "error", f"tool '{name}' failed: {err}", {"sequence": seq}
            )
            await finalize_run_failure(run_id, err)
            return

    await finalize_run_success(run_id, {"tool_results": results})
    await write_log(run_id, "info", "run succeeded", {"tool_count": len(results)})
    log.info("run %s succeeded (%d tool calls)", run_id, len(results))


# --- main loop ---------------------------------------------------------------
async def poll_loop() -> None:
    log.info(
        "worker started. poll_interval=%.1fs tools=%s",
        config.POLL_INTERVAL_SECONDS,
        registry.names,
    )
    while not _shutdown.is_set():
        try:
            run = await claim_next_run()
        except Exception:
            log.exception("error claiming next run; backing off")
            await asyncio.sleep(config.POLL_INTERVAL_SECONDS)
            continue

        if run is None:
            try:
                await asyncio.wait_for(
                    _shutdown.wait(), timeout=config.POLL_INTERVAL_SECONDS
                )
            except asyncio.TimeoutError:
                pass
            continue

        try:
            await execute_run(run)
        except Exception:
            log.exception("unhandled error executing run %s", run["id"])
            try:
                await finalize_run_failure(
                    run["id"], "unhandled worker exception"
                )
            except Exception:
                log.exception("also failed to mark run as failed")

    log.info("poll loop exiting")


async def main() -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _request_shutdown)

    await open_pool()
    try:
        await poll_loop()
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
