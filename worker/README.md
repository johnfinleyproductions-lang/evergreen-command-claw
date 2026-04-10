# worker/

Phase 3A: asyncio Python worker for Evergreen Command.

## What it does

Polls `runs` table every 2 seconds. When it finds a row with
`status = 'pending'`, it atomically claims the row (`FOR UPDATE SKIP LOCKED`),
flips it to `running`, dispatches each entry in `run.input.tool_calls` through
the tool registry, writes `tool_calls` + `logs` rows as it goes, and finalizes
the run as `succeeded` or `failed`.

Phase 3A ships with **one** tool: `echo`. It's a plumbing proof. Real tools
(file I/O, HTTP, llama.cpp) come in Phase 3B+.

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
worker started. poll_interval=2.0s tools=['echo']
```

## End-to-end test

In another terminal, insert a pending run:

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"tool_calls\": [{\"name\": \"echo\", \"arguments\": {\"message\": \"hello phase 3\"}}]}'::jsonb);"
```

Within 2 seconds the worker should log:

```
executing run <uuid>
dispatching tool 'echo'
tool 'echo' succeeded in <n>ms
run <uuid> succeeded (1 tool calls)
```

Inspect the result:

```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT id, status, output FROM runs ORDER BY created_at DESC LIMIT 1;"
```

Expected `output`:

```json
{"tool_results": [{"name": "echo", "result": {"echo": "hello phase 3", "length": 13, "reversed": "3 esahp olleh"}}]}
```

And check the sidecar tables:

```sql
SELECT sequence, tool_name, status, duration_ms FROM tool_calls ORDER BY created_at DESC LIMIT 5;
SELECT level, message FROM logs ORDER BY created_at DESC LIMIT 10;
```

## Architecture

```
┌─────────────────┐
│ worker/main.py  │  asyncio poll loop + signal handlers
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌────────────────┐
│  worker/db.py   │◀────▶│  asyncpg pool  │──▶ Postgres 5433
└────────┬────────┘      └────────────────┘
         │
         ▼
┌──────────────────────┐
│ worker/tools/        │
│  - base.py (ABC)     │
│  - registry.py       │
│  - echo.py           │
└──────────────────────┘
```

## Files

| file              | role                                                |
|-------------------|-----------------------------------------------------|
| `config.py`       | loads `.env.local` from repo root                   |
| `db.py`           | asyncpg pool, claim/insert/update/finalize helpers  |
| `main.py`         | poll loop, run executor, signal handling            |
| `tools/base.py`   | `Tool` ABC (returns dict, OpenAI-compatible schema) |
| `tools/registry.py` | sync/async dispatch via `asyncio.to_thread`       |
| `tools/echo.py`   | stub tool: `{message}` → `{echo,length,reversed}`   |

## Notes

- Worker uses `FOR UPDATE SKIP LOCKED` so multiple workers are safe — you can
  run two instances side by side and they won't step on each other.
- JSONB columns auto-encode/decode to Python dicts via a connection-level
  type codec in `db.py`.
- Sync tools are offloaded to a thread via `asyncio.to_thread` so they don't
  block the event loop. Async tools are awaited directly.
- Schema naming gotcha: `runs` uses `input`/`output`, `tool_calls` uses
  `arguments`/`result`. The worker handles this.
