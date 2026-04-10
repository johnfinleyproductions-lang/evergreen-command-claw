# worker/

Phase 3B: asyncio Python worker for Evergreen Command with agent loop + real tools.

## What it does

Polls `runs` table every 2 seconds. When it finds a row with `status = 'pending'`,
it atomically claims the row (`FOR UPDATE SKIP LOCKED`), flips to `running`, and
branches on the shape of `run.input`:

- **Agent mode** — `{"prompt": "...", "system": "..."}`  
  Runs the full agent loop against llama.cpp: the LLM plans + calls tools, the
  worker dispatches them through the registry, results feed back to the LLM,
  iterates until the model returns a plain-text final answer or hits
  `AGENT_MAX_ITERATIONS` (default 10).

- **Literal mode** — `{"tool_calls": [{"name": "...", "arguments": {...}}, ...]}`  
  Dispatches the exact list of tool calls the caller provided. No LLM involvement.
  Kept as a Phase 3A regression path / debugging lever.

Either way, `tool_calls` + `logs` rows are written as it goes, and the run is
finalized as `succeeded` or `failed` with token usage recorded.

## Tools (Phase 3B)

| name        | description                                                               |
|-------------|---------------------------------------------------------------------------|
| `echo`      | stub: `{message}` → `{echo, length, reversed}` (regression test tool)     |
| `web_search`| DuckDuckGo search via `ddgs` — `{query, max_results?}` → `{results[]}`    |
| `fetch_url` | async HTTP fetch + HTML strip — `{url}` → `{text, title, length, ...}`   |
| `write_brief` | save markdown to `artifacts/` + insert artifacts row — `{title, content}` |

## Quickstart

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

You should see:

```
worker started. poll_interval=2.0s tools=['echo', 'web_search', 'fetch_url', 'write_brief'] llm=http://127.0.0.1:8081 model=nemotron
```

Prereqs:
- Postgres running (host `:5433`)
- llama-server running on `:8081` with Nemotron loaded (only required for agent mode)

Verify llama-server is up before running an agent task:

```bash
curl http://127.0.0.1:8081/v1/models
```

## Phase 3A smoke test (no LLM required)

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"tool_calls\": [{\"name\": \"echo\", \"arguments\": {\"message\": \"phase3b regression\"}}]}'::jsonb);"
```

Worker should log `run <uuid> succeeded (literal, 1 tool calls)` within 2 seconds.

## Phase 3B tier 1: single-tool agent test (requires llama-server)

Simplest possible agent task — one web search, no briefs, one iteration:

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Use web_search to find the homepage of the Python asyncio documentation and tell me the URL.\"}'::jsonb);"
```

Expected: 1-2 agent iterations, 1 `tool_calls` row for `web_search`, final answer
with the URL. This proves the full loop (LLM → tool call → result → LLM final
answer) works without involving fetch_url or write_brief.

## Phase 3B tier 2: canonical Nvidia lead-research task

The canonical first real task — full research chain:

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Research Nvidia as a potential enterprise lead. Find their current CEO, latest major product announcements, recent financial performance, and key AI partnerships. Save the findings as a brief titled Nvidia Lead Research using write_brief. Return a one-paragraph summary of what you saved.\"}'::jsonb);"
```

Expected: 3-6 agent iterations, multiple `tool_calls` rows (web_search + fetch_url
calls, then a final write_brief), one `artifacts` row pointing at a markdown file
in `worker/artifacts/`, a final answer summarizing the brief.

Inspect:

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT id, status, prompt_tokens, completion_tokens, total_tokens, finished_at - started_at AS duration FROM runs ORDER BY created_at DESC LIMIT 1;"

docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT sequence, tool_name, status, duration_ms FROM tool_calls WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1) ORDER BY sequence;"

docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT name, path, size, kind FROM artifacts WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1);"

# Then read the actual brief:
cat worker/artifacts/<the-path-from-above>
```

## Architecture

```
┌───────────────────┐
│ worker/main.py    │  poll loop + input-shape dispatch
└─────┬────────────┘
      │
      ├─── prompt? ─▶ agent.py (LLM loop) ────► llm.py ──► llama-server :8081
      │                      │
      │                      ▼
      │                 tools/registry ─► web_search / fetch_url / write_brief / echo
      │                      │
      │                      ▼
      │                   db.py ─► Postgres :5433
      │
      └─── tool_calls? ─▶ _execute_literal_tool_calls (Phase 3A regression)
```

## Files

| file                 | role                                                |
|----------------------|-----------------------------------------------------|
| `config.py`          | loads `.env.local` from repo root                   |
| `context.py`         | ContextVar for current_run_id (read by tools)       |
| `db.py`              | asyncpg pool, run claim, tool_call/log/artifact writes |
| `llm.py`             | async httpx client for llama.cpp                    |
| `agent.py`           | agent loop (LLM → tools → LLM, with token accounting) |
| `main.py`            | poll loop, run executor, mode dispatch, signal handling |
| `tools/base.py`      | `Tool` ABC (returns dict, OpenAI-compatible schema) |
| `tools/registry.py`  | sync/async dispatch via `asyncio.to_thread`         |
| `tools/echo.py`      | stub tool (regression test)                         |
| `tools/web_search.py`| DuckDuckGo search via `ddgs`                        |
| `tools/fetch_url.py` | async httpx fetch + BeautifulSoup text extract      |
| `tools/write_brief.py` | save markdown + insert artifacts row              |

## Environment variables

All optional — defaults work for the Framestation dev setup.

| var                    | default                                          | purpose                          |
|------------------------|--------------------------------------------------|----------------------------------|
| `DATABASE_URL`         | `postgresql://command:command_secret@localhost:5433/evergreen_command` | Postgres connection |
| `WORKER_POLL_INTERVAL` | `2.0`                                            | seconds between poll ticks       |
| `WORKER_LOG_LEVEL`     | `INFO`                                           | python logging level             |
| `LLM_BASE_URL`         | `http://127.0.0.1:8081`                          | llama-server base URL            |
| `LLM_MODEL`            | `nemotron`                                       | model name sent in request body  |
| `LLM_TIMEOUT`          | `600.0`                                          | per-request timeout (seconds)    |
| `LLM_TEMPERATURE`      | `0.3`                                            | sampling temperature             |
| `AGENT_MAX_ITERATIONS` | `10`                                             | max LLM ↔ tools loops per run    |
| `ARTIFACTS_DIR`        | `<repo>/worker/artifacts`                        | where write_brief saves files    |

## Notes

- Worker uses `FOR UPDATE SKIP LOCKED` so multiple workers are safe — you can
  run two instances side by side and they won't step on each other.
- JSONB columns auto-encode/decode to Python dicts via a connection-level
  type codec in `db.py`.
- Sync tools are offloaded to a thread via `asyncio.to_thread` so they don't
  block the event loop. `asyncio.to_thread` propagates contextvars via
  `copy_context`, so sync tools can still read `current_run_id`.
- Schema naming: `runs` uses `input`/`output`, `tool_calls` uses `arguments`/`result`,
  `artifacts` uses `size` (not `size_bytes`) and `kind` is an enum.
- `write_brief` uses `kind='report'` and `mime_type='text/markdown'`.
