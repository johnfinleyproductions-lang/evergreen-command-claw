# Evergreen Command — Architecture & Operations Reference

**Repo:** `/home/lynf/evergreen-command-claw` on `framerbox395` (user `lynf`)
**Remote:** `github.com/johnfinleyproductions-lang/evergreen-command-claw` (private)
**Last meaningful commit at time of writing:** `e45da02` (Phase 4 + 4.5 landed)

This doc is the source of truth for "how does this thing actually work on this box." When something diverges from here, fix the code or fix the doc — don't let drift pile up.

---

## 0. Common commands

Day-to-day operations, copy-paste ready.

Start the web app (Next.js 15, dev mode):

    cd /home/lynf/evergreen-command-claw && npm run dev

Start the worker (uses shell helper that loads `.env.local` and activates the venv):

    run-worker

Start the LLM server (llama.cpp + Nemotron 120B on port 8081):

    run-agent

Tail the worker log:

    tail -F /home/lynf/evergreen-command-claw/worker.log

Kill the worker cleanly:

    pkill -f "worker/main.py"

Psql into the app DB:

    psql -U evergreen -d evergreen_command

Quick run status via API:

    curl -s http://127.0.0.1:3000/api/runs | jq '.[0:3]'

Kick a smoke-test run (agent mode, prompt in body):

    curl -sX POST http://127.0.0.1:3000/api/runs \
      -H 'content-type: application/json' \
      -d '{"input":{"prompt":"Write a one-paragraph brief on llama.cpp speculative decoding."}}'

---

## 1. Service map

Three long-lived processes, one database, one filesystem artifact dir.

- **Web app (Next.js 15)** — `npm run dev` on port 3000. Serves the UI (`app/`) and API routes (`app/api/*`). Talks to Postgres via Drizzle. Reads `worker/artifacts/` for Phase 5.0 artifact display.
- **Worker (Python 3)** — `worker/main.py`, long-running asyncio loop. Claims rows from `runs` where `status='pending'`, executes them (agent mode or literal tool-call mode), writes results back. Talks to Postgres via `asyncpg` and to the LLM via `httpx` against `LLM_BASE_URL`.
- **LLM server (llama.cpp)** — `run-agent` shell helper wraps llama.cpp in OpenAI-compatible mode serving `nemotron-3-super-120b-a12b` on `http://127.0.0.1:8081`. The worker speaks OpenAI chat-completions to it.
- **Postgres** — local cluster, DB `evergreen_command`, user `evergreen`. Schema owned by Drizzle migrations in `drizzle/`.
- **Filesystem artifacts** — `worker/artifacts/*.md` is where `write_brief` drops files. Also the read path for the artifact viewer.

Dataflow per run: UI → POST `/api/runs` → insert row `status=pending` → worker `claim_next_run()` (FOR UPDATE SKIP LOCKED) → execute → `finalize_run_success` → UI polls / SSE streams logs.

---

## 2. File tree (important paths only)

    evergreen-command-claw/
    ├── app/                        # Next.js 15 app router
    │   ├── api/
    │   │   ├── runs/
    │   │   │   ├── route.ts                # GET list, POST create
    │   │   │   └── [id]/
    │   │   │       ├── route.ts            # GET single run
    │   │   │       ├── logs/route.ts       # SSE live log stream
    │   │   │       └── cancel/route.ts     # POST cancel
    │   │   ├── tasks/route.ts              # task CRUD
    │   │   └── artifacts/                  # Phase 5.0 (pending)
    │   ├── runs/[id]/page.tsx              # run detail view
    │   └── tasks/page.tsx                  # task list
    ├── lib/
    │   ├── db/                             # Drizzle client + schema
    │   ├── hooks/use-run-logs.ts           # SSE hook with id-based dedup
    │   └── prompt-template.ts              # {{var}} substitution
    ├── drizzle/
    │   └── 0000_complete_bucky.sql         # initial migration
    ├── worker/
    │   ├── main.py                         # claim loop, execute_run dispatcher
    │   ├── agent.py                        # run_agent() iteration loop
    │   ├── db.py                           # all DB writes/reads
    │   ├── config.py                       # env loader
    │   ├── context.py                      # current_run_id ContextVar
    │   ├── llm.py                          # httpx client for llama.cpp
    │   └── tools/
    │       ├── registry.py                 # ToolRegistry, async dispatch
    │       ├── write_brief.py              # writes .md artifact + registers row
    │       ├── web_search.py
    │       └── fetch_url.py
    ├── worker/artifacts/                   # runtime output, gitignored
    ├── .env.local                          # secrets, gitignored
    ├── .env.example                        # committed template
    ├── ARCHITECTURE.md                     # ← this file
    └── README.md

---

## 3. Database schema

Four tables: `tasks`, `runs`, `run_logs`, `artifacts`. Plus two enums.

### Enums

- `run_status`: `'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'`
- `artifact_kind`: `'report' | 'data' | 'image' | 'code' | 'log' | 'other'`

### `tasks`

Saved, reusable prompts. Phase 5.1 will add the CRUD UI.

- `id uuid PK default gen_random_uuid()`
- `name text NOT NULL`
- `description text`
- `prompt_template text NOT NULL` — supports `{{var}}` substitution via `lib/prompt-template.ts`
- `default_input jsonb` — default variable values
- `created_at timestamp default now() NOT NULL`
- `updated_at timestamp default now() NOT NULL`

### `runs`

Every execution, agent-mode or literal-mode.

- `id uuid PK default gen_random_uuid()`
- `task_id uuid` → `tasks(id)` nullable (ad-hoc runs allowed)
- `status run_status NOT NULL default 'pending'`
- `input jsonb` — either `{prompt, system?}` (agent mode) or `{tool_calls: [...]}` (literal mode)
- `output jsonb` — agent returns `{final_answer, iterations, message_count, tool_calls_made, error?}`
- `model text default 'nemotron-3-super-120b-a12b'`
- `error_message text`
- `prompt_tokens integer`
- `completion_tokens integer`
- `total_tokens integer`
- `tokens_per_sec real`
- `started_at timestamp`
- `finished_at timestamp`
- `created_at timestamp default now() NOT NULL`

### `run_logs`

Per-run event stream. Feeds the live log UI.

- `id uuid PK default gen_random_uuid()`
- `run_id uuid NOT NULL` → `runs(id)` ON DELETE CASCADE
- `level text NOT NULL` — `'info' | 'warn' | 'error' | 'debug'`
- `message text NOT NULL`
- `metadata jsonb`
- `created_at timestamp default now() NOT NULL`
- Index: `(run_id, created_at)`

### `artifacts`

File outputs from tool calls. `write_brief` is the current producer.

- `id uuid PK default gen_random_uuid()`
- `run_id uuid NOT NULL` → `runs(id)` ON DELETE CASCADE
- `name text NOT NULL`
- `path text NOT NULL` — absolute filesystem path
- `mime_type text`
- `size integer` — bytes
- `kind artifact_kind NOT NULL default 'other'`
- `metadata jsonb`
- `content text` — **Phase 5.0.1:** the artifact body stored directly in Postgres (nullable for legacy rows)
- `content_size integer` — **Phase 5.0.1:** byte length of `content` (nullable for legacy rows)
- `created_at timestamp default now() NOT NULL`
- **Missing (Phase 5.0 decision):** no `(run_id, created_at)` index, no `tool_call_id` column

---

## 4. `worker/db.py` — function signatures

Every DB write goes through this module. If you're writing raw SQL outside it you're probably doing it wrong.

    async def open_pool() -> None
    async def close_pool() -> None

    async def claim_next_run() -> Optional[dict]
        # SELECT ... FOR UPDATE SKIP LOCKED, flips status='running',
        # sets started_at=now(). Returns full row dict or None.

    async def finalize_run_success(
        run_id: UUID,
        output: dict,
        *,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
    ) -> None
        # Updates: status='succeeded', output, finished_at, model, *_tokens.

    async def finalize_run_failure(
        run_id: UUID,
        error_message: str,
    ) -> None
        # Updates: status='failed', error_message, finished_at.
        # Does NOT clear output/model/*_tokens — load-bearing for the
        # Phase 4.5 "finalize success then flip to failed" double-call.

    async def insert_tool_call(run_id, name, arguments) -> UUID
    async def complete_tool_call(tool_call_id, result) -> None
    async def fail_tool_call(tool_call_id, error) -> None

    async def write_log(run_id, level, message, metadata=None) -> None

    async def insert_artifact(
        run_id: UUID,
        *,
        name: str,
        path: str,
        kind: str = "other",           # must be report|data|image|code|log|other
        mime_type: Optional[str] = None,
        size: Optional[int] = None,
        metadata: Optional[dict] = None,
        content: Optional[str] = None,           # Phase 5.0.1
        content_size: Optional[int] = None,      # Phase 5.0.1
    ) -> UUID

    # TODO: cancel_run(run_id), reset_stale_running_rows() — sign before Phase 5.3

---

## 5. Worker lifecycle

`worker/main.py` top level:

1. `open_pool()` — asyncpg pool against `evergreen_command`.
2. Register tools into `ToolRegistry`.
3. Enter the claim loop: `while True: run = await claim_next_run(); if run: await execute_run(run); else: await asyncio.sleep(poll_interval)`.

`execute_run(run)`:

    run_id = run["id"]
    token = current_run_id.set(run_id)
    try:
        await write_log(run_id, "info", "run started")

        if "prompt" in run["input"]:
            result = await run_agent(
                run_id,
                prompt=run["input"]["prompt"],
                system=run["input"].get("system"),
            )
            await finalize_run_success(
                run_id,
                result["output"],
                model=result["model"],
                prompt_tokens=result["prompt_tokens"],
                completion_tokens=result["completion_tokens"],
                total_tokens=result["total_tokens"],
            )
            if result["output"].get("error") == "max_iterations_exceeded":
                await finalize_run_failure(
                    run_id,
                    "Agent hit max iterations without producing a final answer",
                )
        elif "tool_calls" in run["input"]:
            await _execute_literal_tool_calls(run_id, run["input"]["tool_calls"])
        else:
            await finalize_run_failure(run_id, "unrecognized input shape")

    except Exception as e:
        await finalize_run_failure(run_id, f"{type(e).__name__}: {e}")
    finally:
        current_run_id.reset(token)

**Indent drift is the silent killer here.** The `if result["output"].get("error") == "max_iterations_exceeded"` branch MUST live inside the `try` block at the same indent as the `finalize_run_success` call. When editing this, use a regex-based patch script, not nano paste.

**Crash recovery:** TODO — on worker startup, sweep `status='running'` rows older than N minutes back to pending or failed. Not implemented yet. Heartbeat on the run row also TODO.

---

## 6. Agent lifecycle (`worker/agent.py`)

`run_agent(run_id, prompt, system)` iterates up to `AGENT_MAX_ITERATIONS` (default 20, bumped from 10 in Phase 4.5).

Loop shape:

    messages = [
        {"role": "system", "content": system or DEFAULT_SYSTEM},
        {"role": "user", "content": prompt},
    ]
    tool_calls_made = 0

    for iteration in range(config.AGENT_MAX_ITERATIONS):
        remaining = config.AGENT_MAX_ITERATIONS - iteration
        is_last = remaining == 1

        # Phase 4.5: ephemeral budget reminder (not persisted into `messages`)
        call_messages = list(messages)
        if remaining <= 2:
            call_messages.append({
                "role": "system",
                "content": "HARD STOP next turn. You MUST stop calling tools and "
                           "produce your final answer now.",
            })
        elif remaining <= 5:
            call_messages.append({
                "role": "system",
                "content": f"Budget notice: {remaining} iterations remaining. "
                           f"Prefer synthesis over new tool calls.",
            })

        # Phase 4.5: on the final iteration, strip tools entirely — forces
        # finish_reason=stop and guarantees a natural-language answer.
        tools_for_call = None if is_last else registry.openai_schema()

        response = await llm.chat(
            messages=call_messages,
            tools=tools_for_call,
            model=config.LLM_MODEL,
        )

        message = response["choices"][0]["message"]
        messages.append(message)

        if message.get("tool_calls"):
            for tc in message["tool_calls"]:
                result = await registry.dispatch(tc["function"]["name"], tc["function"]["arguments"])
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })
                tool_calls_made += 1
            continue  # next iteration

        # No tool calls → we got a final answer
        final_answer = message["content"]
        return {
            "output": {
                "final_answer": final_answer,
                "iterations": iteration + 1,
                "message_count": len(messages),
                "tool_calls_made": tool_calls_made,
            },
            "model": config.LLM_MODEL,
            "prompt_tokens": response["usage"]["prompt_tokens"],
            "completion_tokens": response["usage"]["completion_tokens"],
            "total_tokens": response["usage"]["total_tokens"],
        }
    else:
        # for/else — loop completed without break
        return {
            "output": {
                "final_answer": None,
                "iterations": config.AGENT_MAX_ITERATIONS,
                "message_count": len(messages),
                "tool_calls_made": tool_calls_made,
                "error": "max_iterations_exceeded",
            },
            "model": config.LLM_MODEL,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

**Key nuance:** `call_messages = list(messages)` is a shallow copy per iteration. Budget reminders go into the copy, never into `messages`, so they don't pile up over turns and they don't leak into the conversation history the model sees next iteration.

**Why strip tools on the last turn:** llama.cpp + Nemotron will happily keep emitting tool calls until you physically cannot. Passing `tools=None` forces `finish_reason=stop` and guarantees a final answer.

### Tools

- **`web_search`** — provider TODO (document which — Brave? Tavily?), returns list of `{title, url, snippet}`.
- **`fetch_url`** — HTTP GET with max content size cap (TODO: document limit). Returns `{url, status, content_type, text}`.
- **`write_brief(title, content)`** — writes markdown to `worker/artifacts/{ts}-{slug}.md`, registers via `insert_artifact(run_id=current_run_id.get(), ..., kind="report", mime_type="text/markdown", content=content, content_size=len(content.encode("utf-8")))`. Returns `{title, path, size_bytes, artifact_id, saved}`. **Phase 5.0.1:** content is now stored in Postgres (`artifacts.content`) in addition to being written to disk. The file write is belt-and-suspenders; the DB column is the source of truth.

---

## 7. API routes

All under `app/api/`.

- `GET /api/runs` — list recent runs, most recent first.
- `POST /api/runs` — body `{task_id?, input}`. Inserts `status=pending`. Worker picks up within poll interval.
- `GET /api/runs/[id]` — single run including output/tokens/timestamps.
- `GET /api/runs/[id]/logs` — **SSE** stream. Initial drain of all existing logs, then polls for new rows. Client must dedup by `id` via `Set` (see `lib/hooks/use-run-logs.ts` `seenIdsRef`).
- `POST /api/runs/[id]/cancel` — flips status to `cancelled`. Worker cooperative-cancel TODO.
- `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]` — task CRUD.
- `GET /api/runs/[id]/artifacts` — list artifacts for a run (Phase 5.0).
- `GET /api/artifacts/[id]/content` — fetch artifact body. **Phase 5.0.1:** reads from `artifacts.content` column first (happy path), falls back to `file_path` on disk only for legacy rows where `content IS NULL`. The fallback exists only so old runs from before the migration still render — new runs never touch disk on read.

---

## 8. Environment variables

Loaded by `worker/config.py` from repo-root `.env.local` with fallback to `.env`. Next.js reads `.env.local` natively.

Required:

- `DATABASE_URL` — Postgres URI. Both worker and Next.js use this one var.
- `LLM_BASE_URL` — default `http://127.0.0.1:8081`.
- `LLM_MODEL` — default `nemotron`.
- `ARTIFACTS_DIR` — default `<repo>/worker/artifacts`. **Phase 5.0.1:** new runs store content directly in Postgres, so Next.js no longer needs to resolve this path on the read side. The worker still writes files here as a belt-and-suspenders backup and for `GET /api/artifacts/[id]/content`'s legacy fallback path to work on pre-5.0.1 rows.
- `AGENT_MAX_ITERATIONS` — default `20` in `.env.example`, read at **import time** in `config.py`. Changing it in `.env.local` requires a worker restart: `pkill -f "worker/main.py" && run-worker`.

Optional:

- `WORKER_POLL_INTERVAL_SEC` — claim loop sleep between empty polls.
- `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_API_KEY` — TODO audit.

---

## 9. `main.py` try/except topology

Three places where exceptions can land. Getting the indent wrong here is how you break everything invisibly.

    execute_run()
      try:
        current_run_id.set(...)
        (agent OR literal branch)
        finalize_run_success(...)
        if output.error == max_iterations_exceeded:
            finalize_run_failure(...)       # <-- SAME indent as finalize_run_success
      except Exception as e:
        finalize_run_failure(run_id, f"{type(e).__name__}: {e}")
      finally:
        current_run_id.reset(token)

Rule: **any edit to `execute_run` uses a regex patch script, never nano paste.** Nano paste drops or adds whitespace invisibly when bracketed-paste mode is mismatched.

Verify before restart:

    python3 -m py_compile worker/main.py worker/agent.py

If that's clean, restart. If not, fix first.

---

## 10. Log locations

- **Worker stdout/stderr** → `worker.log` (via `run-worker` redirect)
- **llama.cpp stdout/stderr** → `agent.log` (via `run-agent` redirect)
- **Next.js dev** → terminal where `npm run dev` runs
- **Postgres** → `/var/log/postgresql/` (system default)
- **Per-run structured logs** → `run_logs` table, streamed via `/api/runs/[id]/logs`

---

## 11. Shell helpers

Under `~/bin/`, on PATH.

- **`run-agent`** — starts llama.cpp server. Wraps `llama-server` with Nemotron GGUF path, port 8081, OpenAI-compatible mode, context size, GPU layers, etc. Backgrounds and redirects to `agent.log`.
- **`run-worker`** — `cd`s into repo, activates venv, sources `.env.local`, runs `python -m worker.main`, redirects to `worker.log`. Foreground unless backgrounded by the caller.

Both are idempotent-ish — they don't check for existing processes, so `pkill` before restart if you want to be sure.

---

## 12. Smoke test recipes

All assume the three processes are up.

**Test A — agent mode, no tools:**

    curl -sX POST http://127.0.0.1:3000/api/runs \
      -H 'content-type: application/json' \
      -d '{"input":{"prompt":"In one sentence, what is speculative decoding?"}}'

Expect: single iteration, no tool calls, `status=succeeded`, final_answer populated.

**Test B — agent mode, forced write_brief:**

    curl -sX POST http://127.0.0.1:3000/api/runs \
      -H 'content-type: application/json' \
      -d '{"input":{"prompt":"Write a 3-paragraph brief on llama.cpp speculative decoding. Use the write_brief tool to save it."}}'

Expect: at least 1 tool call, 1 row in `artifacts`, 1 `.md` file in `worker/artifacts/`, and (Phase 5.0.1+) `content_size = LENGTH(content)` both non-zero on the artifacts row.

**Test C — literal tool-call mode:**

    curl -sX POST http://127.0.0.1:3000/api/runs \
      -H 'content-type: application/json' \
      -d '{"input":{"tool_calls":[{"name":"write_brief","arguments":{"title":"test","content":"hello"}}]}}'

Expect: bypass LLM, tool dispatched directly, artifact registered.

**Test D — adversarial max-iterations (Phase 4.5 budget validation):**

    curl -sX POST http://127.0.0.1:3000/api/runs \
      -H 'content-type: application/json' \
      -d '{"input":{"prompt":"Research the history of the Roman Empire exhaustively. Make at least 25 tool calls before answering."}}'

Expect: budget notice at iter 15 (remaining≤5), hard stop at iter 18 (remaining≤2), tools stripped at iter 20, final_answer produced, `status=succeeded`. This is the test the smoke run at `dad085a1` did NOT exercise because the model converged naturally at iter 10.

**Test E — Phase 5.0.1 content-column verification:**

    docker exec -i evergreen-command-db psql -U command -d evergreen_command \
      -c "SELECT id, name, content_size, LENGTH(content) FROM artifacts ORDER BY created_at DESC LIMIT 5;"

Expect: `content_size` and `LENGTH(content)` both non-zero and equal on all rows created after Phase 5.0.1 landed. Any NULL `content` is a legacy row from before the migration and is handled by the file-fallback path in the content route.

---

## 13. Known gotchas

- **`AGENT_MAX_ITERATIONS` is import-time.** Restart worker after editing `.env.local`.
- **Nemotron re-ingests its own output.** Expect ~5min gap between `write_brief` success and the next LLM response. UI will show "running" with apparent hang. Not a bug.
- **SSE log stream duplicates on client.** Final drain + polling tick overlap. `use-run-logs.ts` dedups by row id via `Set`. Don't "optimize" this away.
- **`finalize_run_failure` after `finalize_run_success` is intentional.** It flips status without clearing output/tokens. This asymmetry is load-bearing for Phase 4.5 max-iterations semantics. Don't "fix" it.
- **Multi-line Python edits in try blocks: regex patch scripts only.** Nano paste loses indent alignment invisibly. The bug surfaces as `IndentationError` at restart or — worse — silent logic drift.
- **Markdown table edits: nano is fine.** Don't use regex patch scripts for one-line prose edits — that's overengineering.
- **Heredoc doc writes: avoid nested triple-backticks.** Shell heredoc parsing breaks on them. If you must embed code fences in a doc you're generating, use `printf` + explicit file writes, or write the file from outside the shell (Python, editor, sandbox).
- **`current_run_id.get()` outside a run raises `LookupError`.** Tools must handle it explicitly — `write_brief` does.
- **Filesystem state between processes is a liability.** Phase 5.0 tried to coordinate artifact storage between the Python worker (writes) and the Next.js app (reads) using shared disk paths. This broke immediately — the content endpoint returned 500 because the two processes had different views of the filesystem (different cwd, different env-resolved `ARTIFACTS_DIR`, different permissions). Phase 5.0.1 moved content into Postgres as a `TEXT` column and kept the file write only as a belt-and-suspenders backup. **Lesson: if state needs to cross a process boundary, put it in the database.** This is also why a single `pkill` + `run-worker` wasn't enough to pick up the Phase 5.0.1 fix on the first try — the worker's Python modules were already imported from the old code, and `evergreen restart` before `git checkout` meant the new code on disk was invisible to the running process until the next restart.
- **Python imports are cached at process start, not on disk read.** If you edit a worker module and the change doesn't seem to land, verify the order: `git checkout` (or `git pull`) first, then `evergreen restart` (or `pkill -f worker/main.py && run-worker`). Restarting before updating the files on disk reloads the old code.

---

## 14. Git hygiene

- **Gitignored:** `.env.local`, `.env.local.bak*`, `worker/artifacts/`, `worker.log`, `agent.log`, `node_modules/`, `.next/`, `__pycache__/`, `.venv/`
- **Never commit:** anything under `secrets-backups/` in your home dir. Keep those backups outside the repo entirely.
- **Commit discipline:** fixup commits for doc restores, feature commits per phase. Tag milestones (`v0.4.5`, `v0.5.0`) after hardening smoke tests pass.
- **CI:** TODO — not wired up yet. Minimum bar when we add it: `py_compile worker/*.py`, `tsc --noEmit`, `npm run lint`.

---

## 15. Phase ledger

Chronological record of what landed when, with the commit that landed it.

| Phase | Description                                                 | Status    | Commit    |
|-------|-------------------------------------------------------------|-----------|-----------|
| 0     | Scaffolding — Next.js + Drizzle + Postgres                  | done      | initial   |
| 1     | Worker claim loop, literal tool-call mode                   | done      |           |
| 2     | LLM integration, agent mode (`run_agent`)                   | done      |           |
| 3A    | Run detail page, polling                                    | done      |           |
| 3B    | Tool registry, `write_brief`, `web_search`, `fetch_url`     | done      |           |
| 3C    | SSE live log stream + client dedup                          | done      |           |
| 4     | Token usage tracking, `tokens_per_sec`                      | done      | `e45da02` |
| 4.5   | Graduated budget awareness + final-turn tool strip          | done      | `e45da02` |
| 5.0   | Artifact viewer (list + preview)                            | shipped + hotfixed |  |
| 5.0.1 | Artifact content in Postgres (`content TEXT` column)        | done      |           |
| 5.1   | Task create/edit UI                                         | pending   |           |
| 5.2   | Rendered `final_answer` hero panel on run detail            | pending   |           |
| 5.3   | Worker crash recovery + heartbeat                           | pending   |           |
| 5.4   | Cooperative cancel wired through agent loop                 | pending   |           |
| 6.0   | Second worker node + fast/slow model tiering                | pending   |           |
| 6.1   | Remote access layer (FileBrowser + Tailscale primary, NCB secondary) | pending |   |

**Phase 4.5 validation note:** smoke test `dad085a1` succeeded at 10 iters / 9 tool calls / 74k tokens but did NOT trip the ≤5 or ≤2 budget thresholds. Test D (§12) still needs to run to confirm the budget mechanism actually fires under adversarial prompts.

**Phase 5.0.1 shipped note:** the Phase 5.0 content endpoint 500 was caused by the web app and the worker having different views of `worker/artifacts/` on disk. We added `content TEXT` and `content_size INTEGER` columns to the `artifacts` table, taught `insert_artifact()` and `write_brief` to populate them, and rewrote `app/api/artifacts/[id]/content/route.ts` to read from the DB column first with the file path only as a legacy-row fallback. Smoke test: new artifact row showed `content_size=148` matching `LENGTH(content)=148`, content endpoint returned 200, preview rendered inline. Gotcha hit during rollout: the worker was restarted before `git checkout` so it imported the old Python code on disk — second restart picked up the fix. See §13 "Filesystem state between processes is a liability."

### Phase 6.1 block (parked — NCB / FileBrowser / remote access)

The goal of Phase 6.1 is to make Evergreen Command usable from outside the house LAN — from a phone, a laptop at a coffee shop, or from a teammate's machine — without exposing the Framestation directly to the public internet.

**Primary path — self-hosted:**

- **FileBrowser** on the Framestation for artifact browsing and direct file downloads, behind basic auth.
- **Tailscale** for the network layer — everyone in the ops circle joins the tailnet, FileBrowser and the Next.js app are reachable over MagicDNS at `framerbox395.tail-scale-name.ts.net:3000` (or whatever the assigned name is). No port forwarding, no public DNS.
- Next.js app and the Postgres admin port stay bound to `127.0.0.1` on the Framestation; Tailscale ACLs decide who can reach them.
- Belt-and-suspenders: a spare NoCodeBackend project as a warm mirror for artifacts, using the existing lifetime subscription. This is the "laptop dies in the field, need to hand someone a URL" lever.

**Team collaboration — look into later:** once remote access works for the owner, investigate whether to let a small ops circle (2–4 people) collaborate on task runs. Open questions: multi-user auth model (do we need proper accounts, or is tailnet identity enough?), run visibility rules (private by default, share by run URL?), audit trail beyond the existing `run_logs` table, and cost/perf impact of concurrent runs against a single llama.cpp instance before Phase 6.0's fast/slow tiering lands.

**Why this order:** Phase 6.0 (a second worker node + fast/slow model tiering) is the prerequisite for anything multi-user — a single 120B on one GPU can't serve two concurrent research runs without the second one waiting 5 minutes. Phase 6.1 goes after 6.0 so by the time remote users can reach the box, the box can actually serve them.

---

## 16. Secrets inventory

Everything secret lives in `.env.local` (gitignored). Backups live in `~/secrets-backups/` (outside the repo entirely). If you rotate any of these, rotate them in both places and document the rotation date below.

- `DATABASE_URL` — Postgres password, local cluster. Rotation: n/a (local only).
- `WEB_SEARCH_API_KEY` — TODO audit, confirm provider.
- Any LLM provider keys — currently none; llama.cpp is local, no auth.

Rotation log:

    (none yet)

---

## 17. Antipatterns

Patterns we've tried and rejected. Don't re-introduce these without reading the incident they came from.

- **Persisting budget reminders into `messages`.** Causes them to pile up across iterations and pollutes the conversation history the model replays. Use `call_messages = list(messages)` per iteration instead.
- **Letting the agent loop exit naturally without stripping tools on the final turn.** Nemotron will keep emitting tool calls forever. Pass `tools=None` on the last iteration.
- **Catching exceptions inside tool dispatch and swallowing them.** Tools should raise; the registry logs and fails the tool call row but propagates nothing to the agent's `messages` except a structured error result.
- **Writing raw SQL outside `worker/db.py`.** If you need a new query, add it to `db.py` with a typed signature.
- **Editing multi-line Python via nano paste.** See §13.
- **Using regex patch scripts for one-line markdown edits.** See §13.
- **Coordinating state across process boundaries via shared filesystem paths.** Phase 5.0 tried this for artifact content and it broke immediately. Put state that crosses a process boundary in the database. See §13.

---

## 18. Local dev quickstart

Cold start on framerbox395 from a reboot:

    # 1. DB
    systemctl status postgresql      # confirm running

    # 2. LLM
    run-agent &                      # starts llama.cpp on :8081
    curl -s http://127.0.0.1:8081/v1/models | jq .   # sanity check

    # 3. Worker
    cd /home/lynf/evergreen-command-claw
    run-worker &                     # claims pending runs

    # 4. Web
    npm run dev                      # :3000

Browse to http://127.0.0.1:3000. Kick a run from the UI or via curl (§0).

Shutdown (clean):

    pkill -f "worker/main.py"
    pkill -f "llama-server"
    # Ctrl-C the npm dev process

---

## 19. Debugging journal

Persistent notes from past incidents. Newest on top.

**2026-04-11 — Phase 5.0.1 shipped, first smoke test caught a stale-import trap**
Phase 5.0 shipped with a content endpoint 500 because the web app and the worker disagreed about where `worker/artifacts/*.md` lived on disk. Fix: added `content TEXT` and `content_size INTEGER` columns to the `artifacts` table, taught `insert_artifact` + `write_brief` to populate them, rewrote the content route to `SELECT content FROM artifacts WHERE id = $1` with a legacy file fallback only for rows where `content IS NULL`. First smoke test after rollout still returned NULL content — root cause was `evergreen restart` having been run before `git checkout phase-5.0.1-artifacts-in-db`, so the worker's Python modules were cached from the old code. Second restart picked up the fix cleanly. New artifact row: `content_size=148`, `LENGTH(content)=148`, content endpoint 200. Filed §13 gotcha "Filesystem state between processes is a liability" and §13 "Python imports are cached at process start."

**2026-04 — ARCHITECTURE.md heredoc truncation**
Writing this doc via `cat > ARCHITECTURE.md <<'MDEOF' ... MDEOF` with embedded triple-backtick code blocks (` ```bash `) produced a 16-line stub. Fix: don't generate docs with nested code fences via shell heredoc. Write via editor, Python script, or sandbox file write. Fixed in a follow-up to `e45da02`.

**2026-04 — Phase 4.5 smoke test `dad085a1`**
10 iters, 9 tool calls, 74k tokens, `finish_reason=stop`, real brief written, `status=succeeded`. Model converged naturally — budget mechanism was NOT exercised. Need adversarial test D to validate the ≤5/≤2/final-strip path actually fires.

**2026-04 — Nemotron 5-minute re-ingest gap**
Observed on `dad085a1`: 5min between `write_brief` success at 00:15:34 and LLM response at 00:20:13. Model re-ingesting its own tool output through the full context window. Not a bug. UI will show "running" with apparent hang — plan Phase 5.2 hero panel to show the last tool result so the user has something to look at during the gap.

---

*End of ARCHITECTURE.md. If you add a section, bump the numbering in §2's file tree reference and update the phase ledger in §15.*
