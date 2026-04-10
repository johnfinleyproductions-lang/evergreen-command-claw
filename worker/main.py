"""Evergreen Command worker — Phase 3B.

Polls the `runs` table for pending work, claims one row at a time, and
branches on the shape of run.input:

- `{"prompt": "...", "system": "..." (optional)}`  → agent mode (run_agent)
- `{"tool_calls": [{name, arguments}, ...]}`        → literal mode (Phase 3A regression)

Either way, writes tool_calls + logs rows as it goes and finalizes the run.

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

from agent import run_agent
from config import config
from context import current_run_id
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
from tools.fetch_url import FetchUrlTool
from tools.registry import registry
from tools.web_search import WebSearchTool
from tools.write_brief import WriteBriefTool

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")

# --- tool registration -------------------------------------------------------
registry.register(EchoTool())
registry.register(WebSearchTool())
registry.register(FetchUrlTool())
registry.register(WriteBriefTool())

# --- shutdown handling -------------------------------------------------------
_shutdown = asyncio.Event()


def _request_shutdown(*_: Any) -> None:
    log.info("shutdown requested")
    _shutdown.set()


# --- literal mode (Phase 3A regression path) --------------------------------
async def _execute_literal_tool_calls(
    run_id: UUID, tool_calls: list[dict]
) -> None:
    """Dispatch a hardcoded list of tool calls. No LLM involvement."""
    if not tool_calls:
        msg = "run.input.tool_calls is empty"
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
                run_id,
                "error",
                f"tool_call[{seq}] missing 'name'",
                {"call": call},
            )
            await finalize_run_failure(
                run_id, f"tool_call[{seq}] missing 'name'"
            )
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
                run_id,
                "error",
                f"tool '{name}' failed: {err}",
                {"sequence": seq},
            )
            await finalize_run_failure(run_id, err)
            return

    await finalize_run_success(run_id, {"tool_results": results})
    await write_log(
        run_id, "info", "run succeeded (literal mode)", {"tool_count": len(results)}
    )
    log.info("run %s succeeded (literal, %d tool calls)", run_id, len(results))


# --- run execution (mode dispatch) -------------------------------------------
async def execute_run(run: asyncpg.Record) -> None:
    run_id: UUID = run["id"]
    token = current_run_id.set(run_id)
    try:
        log.info("executing run %s", run_id)
        await write_log(run_id, "info", "worker claimed run", {"worker": "phase3b"})

        input_data = run["input"] or {}

        if "prompt" in input_data:
            # --- Phase 3B: agent mode ---
            prompt = input_data["prompt"]
            system = input_data.get("system")
            result = await run_agent(run_id, prompt, system=system)
            await finalize_run_success(
                run_id,
                result["output"],
                model=result.get("model"),
                prompt_tokens=result.get("prompt_tokens"),
                completion_tokens=result.get("completion_tokens"),
                total_tokens=result.get("total_tokens"),
            )
            await write_log(
                run_id,
                "info",
                "run succeeded (agent mode)",
                {
                    "iterations": result["output"].get("iterations"),
                    "tool_calls_made": result["output"].get("tool_calls_made"),
                    "total_tokens": result.get("total_tokens"),
                },
            )
            log.info(
                "run %s succeeded via agent (%s iter, %s tool calls, %s tokens)",
                run_id,
                result["output"].get("iterations"),
                result["output"].get("tool_calls_made"),
                result.get("total_tokens"),
            )

        elif "tool_calls" in input_data:
            # --- Phase 3A: literal mode (kept for regression) ---
            await _execute_literal_tool_calls(run_id, input_data["tool_calls"])

        else:
            msg = (
                "run.input must contain 'prompt' (agent mode) or 'tool_calls' "
                "(literal mode)"
            )
            log.warning("%s: %s", run_id, msg)
            await write_log(run_id, "error", msg, {"input": input_data})
            await finalize_run_failure(run_id, msg)

    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
        log.exception("execute_run failed for %s", run_id)
        try:
            await write_log(run_id, "error", f"execute_run exception: {err}")
            await finalize_run_failure(run_id, err)
        except Exception:
            log.exception("also failed to mark run as failed")
    finally:
        current_run_id.reset(token)


# --- main loop ---------------------------------------------------------------
async def poll_loop() -> None:
    log.info(
        "worker started. poll_interval=%.1fs tools=%s llm=%s model=%s",
        config.POLL_INTERVAL_SECONDS,
        registry.names,
        config.LLM_BASE_URL,
        config.LLM_MODEL,
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

        await execute_run(run)

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
