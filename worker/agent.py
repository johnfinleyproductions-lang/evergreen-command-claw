"""Agent loop — Phase 3B.

Given a prompt, builds a messages list, asks the LLM to plan + call tools,
dispatches the tool calls through the registry, feeds the results back, and
iterates until the model returns a final plain-text answer (no tool calls)
or hits AGENT_MAX_ITERATIONS.

Returns a dict with `output` (destined for runs.output) plus aggregated token
usage so the caller can update runs.model / runs.*_tokens.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional
from uuid import UUID

from config import config
from db import complete_tool_call, fail_tool_call, insert_tool_call, write_log
from llm import make_client
from tools.registry import registry

log = logging.getLogger(__name__)


DEFAULT_SYSTEM_PROMPT = """You are Evergreen Command, a local AI task runner running on a private GPU server.

You have access to a set of tools provided to you via the function-calling interface. Use them to gather real information and produce real deliverables. Never fabricate tool results — always call the tool.

Guidelines:
- For research tasks, use `web_search` to find relevant pages, then `fetch_url` to read the ones that look promising.
- For written deliverables (briefs, reports, summaries), use `write_brief` to save the final document to disk as an artifact.
- Be efficient: don't call tools you don't need. 3–6 tool calls is usually enough for a research brief.
- When the task is complete, reply with a short plain-text summary of what you did and where to find any artifacts you saved. Do NOT call any tool in your final message.
"""


async def run_agent(
    run_id: UUID,
    prompt: str,
    system: Optional[str] = None,
) -> dict:
    """Execute the agent loop for one run.

    Returns:
        {
            "output": {final_answer, iterations, message_count, ...},
            "model": str | None,
            "prompt_tokens": int,
            "completion_tokens": int,
            "total_tokens": int,
        }
    """
    messages: list[dict] = [
        {"role": "system", "content": system or DEFAULT_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    tool_schemas = registry.schemas
    await write_log(
        run_id,
        "info",
        "starting agent loop",
        {
            "tools_available": registry.names,
            "max_iterations": config.AGENT_MAX_ITERATIONS,
        },
    )

    sequence = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_total_tokens = 0
    last_model: Optional[str] = None
    hit_max = False
    final_answer: Optional[str] = None

    async with make_client() as llm:
        for iteration in range(config.AGENT_MAX_ITERATIONS):
            await write_log(
                run_id,
                "info",
                f"agent iteration {iteration + 1}",
                {"iteration": iteration + 1},
            )

            try:
                response = await llm.chat(messages, tools=tool_schemas)
            except Exception as exc:
                err = f"LLM call failed: {type(exc).__name__}: {exc}"
                log.exception("llm.chat failed")
                await write_log(run_id, "error", err)
                raise

            # --- token accounting ---
            usage = response.get("usage") or {}
            total_prompt_tokens += int(usage.get("prompt_tokens") or 0)
            total_completion_tokens += int(usage.get("completion_tokens") or 0)
            total_total_tokens += int(usage.get("total_tokens") or 0)
            last_model = response.get("model") or last_model

            choice = response["choices"][0]
            assistant_msg = choice["message"]
            finish_reason = choice.get("finish_reason")

            content = assistant_msg.get("content") or ""
            tool_calls = assistant_msg.get("tool_calls") or []

            await write_log(
                run_id,
                "info",
                f"LLM returned (finish_reason={finish_reason}, tool_calls={len(tool_calls)})",
                {
                    "finish_reason": finish_reason,
                    "content_preview": content[:200] if content else None,
                    "tool_call_count": len(tool_calls),
                    "usage": usage,
                },
            )

            # Append the assistant message so the model sees its own history next round.
            # Keep only the fields the OpenAI spec expects.
            assistant_append: dict[str, Any] = {
                "role": "assistant",
                "content": content if content else None,
            }
            if tool_calls:
                assistant_append["tool_calls"] = tool_calls
            messages.append(assistant_append)

            if not tool_calls:
                # Final answer — we're done
                final_answer = content
                await write_log(
                    run_id,
                    "info",
                    "agent loop finished with final answer",
                    {"iterations": iteration + 1},
                )
                break

            # --- dispatch each tool call ---
            for tc in tool_calls:
                tc_id = tc.get("id") or f"call_{sequence}"
                func = tc.get("function") or {}
                name = func.get("name")
                raw_args = func.get("arguments") or "{}"
                try:
                    arguments = (
                        json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    )
                except json.JSONDecodeError:
                    arguments = {}

                if not name:
                    err = f"tool_call[{sequence}] missing function.name"
                    await write_log(run_id, "error", err, {"tool_call": tc})
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": json.dumps({"error": err}),
                        }
                    )
                    sequence += 1
                    continue

                db_tc_id = await insert_tool_call(run_id, sequence, name, arguments)
                await write_log(
                    run_id,
                    "info",
                    f"dispatching tool '{name}'",
                    {"sequence": sequence, "arguments": arguments},
                )

                start = time.monotonic()
                try:
                    result = await registry.execute(name, **arguments)
                    duration_ms = int((time.monotonic() - start) * 1000)
                    await complete_tool_call(db_tc_id, result, duration_ms)
                    await write_log(
                        run_id,
                        "info",
                        f"tool '{name}' succeeded in {duration_ms}ms",
                        {"sequence": sequence},
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": json.dumps(result, default=str),
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    duration_ms = int((time.monotonic() - start) * 1000)
                    err = f"{type(exc).__name__}: {exc}"
                    log.exception("tool '%s' failed", name)
                    await fail_tool_call(db_tc_id, err, duration_ms)
                    await write_log(
                        run_id,
                        "error",
                        f"tool '{name}' failed: {err}",
                        {"sequence": sequence},
                    )
                    # feed the error back to the model so it can recover
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": json.dumps({"error": err}),
                        }
                    )

                sequence += 1
        else:
            # Loop fell through without break — hit max iterations
            hit_max = True
            await write_log(
                run_id,
                "warn",
                "agent hit max iterations without converging",
                {"max_iterations": config.AGENT_MAX_ITERATIONS},
            )

    output = {
        "final_answer": final_answer
        or "[agent hit max iterations without a final answer]",
        "iterations": iteration + 1,
        "message_count": len(messages),
        "tool_calls_made": sequence,
    }
    if hit_max:
        output["error"] = "max_iterations_exceeded"

    return {
        "output": output,
        "model": last_model,
        "prompt_tokens": total_prompt_tokens or None,
        "completion_tokens": total_completion_tokens or None,
        "total_tokens": total_total_tokens or None,
    }
