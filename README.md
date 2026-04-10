# Evergreen Command

**A local AI task runner for the Framestation.**
Bring-your-own-GPU agentic workflows — no API tokens, no cloud round-trips, no per-token billing. One prompt in, a structured task run out, with every tool call, model thought, and artifact saved to Postgres.

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Hardware Target: The Framestation](#hardware-target-the-framestation)
3. [Architecture Overview](#architecture-overview)
4. [Where Everything Lives](#where-everything-lives)
5. [Dev Environment Quickstart](#dev-environment-quickstart)
6. [The Stack](#the-stack)
7. [Why We Chose What We Chose](#why-we-chose-what-we-chose)
8. [Pre-Research Findings](#pre-research-findings)
9. [Lessons Learned](#lessons-learned)
10. [What's Been Done So Far](#whats-been-done-so-far)
11. [What's Left To Do](#whats-left-to-do)
12. [Phase 5+ Ideas (Parked)](#phase-5-ideas-parked)
13. [Open Questions](#open-questions)
14. [Reference Commands](#reference-commands)

---

## What This Is

Evergreen Command is the third project in the Evergreen family, alongside:

- **evergreen-vault** — the knowledge / file system (Next.js 15 + App Router + Drizzle + postgres.js)
- **evergreenagent** — the Python tool registry and agent loop
- **evergreen-command** — *this project* — a UI-first task runner that fuses the two

The goal is to give a non-developer a simple "what do you want to do" textbox, send that prompt through a local 120 B model running on the Framestation, and watch the model autonomously call tools (web search, scraping, file writing, DB inserts) until the task is done. Every run is logged, every artifact is saved, every cost is $0.00.

The canonical first task is **"research Nvidia as a potential lead and save a brief to the vault."**

---

## Hardware Target: The Framestation

| Component | Spec |
|---|---|
| GPU | NVIDIA RTX PRO 4500 Blackwell, 32 GB VRAM, compute capability 12.0 (sm_120) |
| System RAM | 128 GB |
| OS | CachyOS (Arch-based) |
| NVIDIA Driver | 595.58.03 / CUDA 13.2 |
| CUDA Toolkit | Installed to `/opt/cuda/` (not on default PATH) |
| Connection | GPU over USB4 — PCIe link is sensitive to renegotiation |

**Critical hardware rule:** The Blackwell-over-USB4 link will crash mid-inference if GPU clocks drift. We **lock clocks (min = max)** before every heavy workload. See the clock-lock section under Lessons Learned.

---

## Architecture Overview

Two processes sharing one Postgres instance.

```
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│  Next.js 15 Web UI (App Router)    │      │  Python Worker (worker/)           │
│  ──────────────────────────────   │      │  ──────────────────────────────   │
│  • Task input / template picker    │      │  • Tool registry (4 real tools)   │
│  • Live log stream                 │◄────►│  • asyncio poll loop               │
│  • Inspector panels                │  PG  │  • agent.py — LLM tool loop        │
│  • Output viewer                   │      │  • llm.py — llama.cpp client       │
│  • Run history                     │      │  • Tool execute → DB insert        │
└──────────────┬─────────────────────┘      └──────────────┬─────────────────────┘
               │                                            │
               └──────────┬─────────────────────────────────┘
                          ▼
                  ┌──────────────┐
                  │  Postgres    │  tasks · runs · tool_calls · artifacts · logs
                  └──────────────┘
                          ▲
                          │
            ┌─────────────┬──────────────┐
            │   llama.cpp (port :8081)   │  Nemotron-3-Super-120B Q4_K_M
            │   Ollama    (port :11434)  │  Embeddings + small-model fallback
            └──────────────────────────────┘
```

**Why two processes?** The Next.js app gives us a premium UI stack we already know (Drizzle, Radix, Tailwind v4, Vercel AI SDK) and matches evergreen-vault byte-for-byte so everything composes. The Python worker preserves the tool registry we already built in evergreenagent — no rewrite, no port. They communicate through shared Postgres tables and an SSE stream for the live log.

**Two modes, one worker.** The worker branches on the shape of `runs.input`:
- `{"prompt": "..."}` → **agent mode**: `agent.py` runs the LLM tool loop against llama.cpp, iterating until the model returns a final answer.
- `{"tool_calls": [...]}` → **literal mode**: the worker dispatches the listed tool calls in order, no LLM. This is how Phase 3A originally tested the plumbing, and it's kept as a regression path.

---

## Where Everything Lives

A map of the repo after the Phase 3B landing. Every path is relative to the repo root (`~/evergreen-command-claw` on the Framestation).

### Next.js App Router

```
app/
├── layout.tsx               Root HTML layout + metadata ("Evergreen Command")
├── page.tsx                 Landing page (minimal, Phase 4 will replace)
├── login/page.tsx           HMAC single-password login → redirects to /
└── api/
    └── auth/login/route.ts  POST { password } → sets httpOnly session cookie
```

Everything under `app/(vault)/` and `app/api/` that wasn't `auth/login` was deleted during Phase 2. The new task UI will rebuild under `app/` in Phase 4.

### Database (Drizzle + Postgres)

```
lib/db/
├── client.ts                Lazy-singleton postgres.js client via Proxy
└── schema/
    ├── index.ts             Barrel export — this is what drizzle.config.ts points at
    ├── tasks.ts             Task definitions (templates)
    ├── runs.ts              Individual task executions
    ├── toolCalls.ts         Per-step tool invocations within a run
    ├── artifacts.ts         Files + MinIO object references produced by runs
    └── logs.ts              Streaming log entries for SSE

drizzle/
├── 0000_complete_bucky.sql  Generated CREATE TABLE SQL (the live schema)
└── meta/
    ├── _journal.json        Drizzle-kit's migration journal (gitignored)
    └── 0000_snapshot.json   Schema snapshot for diffing on next generate
```

**The 5 tables:**

| Table | Columns | FKs | Purpose |
|---|---|---|---|
| `tasks` | 10 | 0 | Named, reusable task templates with prompt + tools_allowed[] + tags[] |
| `runs` | 14 | 1 → tasks | A single execution; holds status, model, tokens, timings |
| `tool_calls` | 10 | 1 → runs | Each tool invocation with input/output JSONB |
| `artifacts` | 9 | 1 → runs | File references (path or MinIO key) produced during a run |
| `logs` | 6 | 1 → runs | Append-only log stream with `created_at` index for SSE tailing |

### Python worker (Phase 3B — agent loop + real tools)

```
worker/
├── main.py                  asyncio poll loop + run executor + mode dispatch
├── db.py                    asyncpg pool w/ jsonb codec + claim/insert/finalize + insert_artifact
├── config.py                loads .env.local + LLM_* + AGENT_* + ARTIFACTS_DIR settings
├── context.py               ContextVar[current_run_id] — propagates run id to tools
├── llm.py                   httpx wrapper for llama.cpp OpenAI-compatible /v1/chat/completions
├── agent.py                 Core agent loop — LLM → tool_calls → execute → iterate → final_answer
├── requirements.txt         asyncpg + python-dotenv + httpx + ddgs + beautifulsoup4
├── README.md                Quickstart, literal vs agent mode, smoke tests
├── artifacts/               Agent-generated markdown briefs land here (gitignored runtime dir)
└── tools/
    ├── __init__.py
    ├── base.py              Tool ABC (returns dict, OpenAI-compat schema)
    ├── registry.py          sync/async dispatch via asyncio.to_thread
    ├── echo.py              Phase 3A stub tool — kept for regression testing
    ├── web_search.py        DuckDuckGo via ddgs → {query, result_count, results[]}
    ├── fetch_url.py         httpx + BeautifulSoup → {url, status, title, text (truncated)}
    └── write_brief.py       Writes a markdown artifact + inserts an artifacts row via context
```

**Mode dispatch:** `execute_run()` reads `runs.input`:
1. If `"prompt"` key present → `agent.run_agent(run_id, prompt)` runs the LLM loop, writes tool_calls / logs as it goes, and returns `{output, model, prompt_tokens, completion_tokens, total_tokens}`.
2. Else if `"tool_calls"` key present → `_execute_literal_tool_calls()` dispatches in order (Phase 3A behavior).
3. Else → fail the run with a descriptive error.

Before dispatch, the worker sets `current_run_id` ContextVar so tools like `write_brief` can insert artifacts without being handed the run id explicitly. The token is reset in a `finally` block.

### Auth

```
lib/auth/
├── api-key.ts               Pure crypto helpers for REST API key header check
└── session.ts               HMAC cookie login/logout + verify (next/headers)

middleware.ts                Cookie gate: unauthenticated → /login (except /login + /api/auth/*)
```

### Config

```
drizzle.config.ts            Points at ./lib/db/schema/index.ts, out: ./drizzle
docker-compose.yml           Postgres (host :5433 → container :5432) + MinIO (:9010 S3, :9011 console)
next.config.ts               Next.js config (mostly defaults)
tsconfig.json                Root TS config — include glob is **/*.ts **/*.tsx
postcss.config.mjs           Tailwind v4 PostCSS plugin
.env.example                 All env vars documented — copy to .env.local
```

### What's NOT in this repo (yet)

- **SSE log stream** — Phase 3C. Worker already writes to `logs` with the right index; Next.js route still needs to tail and stream.
- **Task UI** — Phase 4. Prompt textbox, template picker, live log panel, output viewer.
- **Additional tools** — HTTP POST, file parsing, vault upload, MinIO write. Added on demand as real tasks need them.
- **MinIO bucket contents** — runtime artifacts, volume-mounted to `miniodata` in docker-compose.

---

## Dev Environment Quickstart

Everything you need to get this running on the Framestation from a fresh clone.

### 1. Prerequisites

- Node.js 20+ and npm (already on the Framestation)
- Python 3.11+ and `python -m venv` (already on CachyOS)
- Docker + docker compose (already on the Framestation)
- llama.cpp built with CUDA support in `~/llama.cpp/build/bin/` (see Phase 1)
- The Nemotron GGUF shards in `~/models/nemotron-3-super-120b/`

### 2. Clone + install

```bash
git clone git@github.com:johnfinleyproductions-lang/evergreen-command-claw.git
cd evergreen-command-claw
npm install
```

### 3. Env config

```bash
cp .env.example .env.local
# Edit .env.local to set AUTH_SECRET, AUTH_PASSWORD, COMMAND_API_KEY to real values.
# The Postgres URL default already matches docker-compose.yml (host port 5433, not 5432 —
# see Lessons Learned: "Docker compose silently drops a port mapping if the port is bound").
```

### 4. Start the database (Postgres only for now — MinIO deferred to Phase 4)

```bash
# VERIFY host port 5433 is free first. If it isn't, pick another port and
# update both docker-compose.yml and .env.local to match.
ss -tlnp | grep 5433

docker compose up -d postgres
docker compose ps postgres   # wait for "Up (healthy)"
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep command-db
# Must show: 0.0.0.0:5433->5432/tcp — if PORTS is empty, the mapping
# silently failed to bind. Change the port in docker-compose.yml and retry.
```

### 5. Apply the schema

```bash
set -a && source .env.local && set +a && npm run db:push
# Expected: [✓] Pulling schema from database... [✓] Changes applied
# Or the fallback if drizzle-kit is acting up:
docker exec -i evergreen-command-db psql -U command -d evergreen_command < drizzle/0000_complete_bucky.sql

docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\dt"
# Should list: artifacts, logs, runs, tasks, tool_calls
```

### 6. Launch llama-server (required for agent mode)

```bash
# Lock GPU clocks first (only if not already locked)
sudo nvidia-smi -pm 1 && sudo nvidia-smi -lgc 1933,1933

tmux new -d -s llama-server "$HOME/llama.cpp/build/bin/llama-server \
  -m $HOME/models/nemotron-3-super-120b/nvidia_Nemotron-3-Super-120B-A12B-Q4_K_M/nvidia_Nemotron-3-Super-120B-A12B-Q4_K_M-00001-of-00003.gguf \
  --n-gpu-layers 26 \
  --ctx-size 8192 \
  --threads 32 \
  --flash-attn on \
  --host 0.0.0.0 \
  --port 8081 \
  2>&1 | tee $HOME/llama-server.log"

curl http://localhost:8081/v1/models   # smoke test
```

### 7. Start the Python worker (Phase 3B)

```bash
cd worker
python -m venv .venv              # skip if .venv already exists
source .venv/bin/activate
pip install -r requirements.txt   # installs httpx, ddgs, beautifulsoup4 (new in 3B)
python main.py
# Expected: worker started. poll_interval=2.0s tools=['echo', 'web_search', 'fetch_url', 'write_brief'] llm=http://127.0.0.1:8081 model=nemotron
```

The worker will sit idle until a `runs` row shows up with `status = 'pending'`.

### 8. Trigger a test run (in a second terminal)

**Phase 3A regression — literal mode, no LLM:**
```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"tool_calls\": [{\"name\": \"echo\", \"arguments\": {\"message\": \"hello phase 3\"}}]}'::jsonb);"
```

**Phase 3B tier 1 — single-tool agent smoke test:**
```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Use web_search to find the official Python asyncio docs URL, then return only the URL as your final answer.\"}'::jsonb);"
```

**Phase 3B tier 2 — canonical Nvidia lead-research task:**
```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Research Nvidia as a potential lead. Use web_search and fetch_url to gather recent news, products, leadership, and financials. Then use write_brief to save a one-page markdown brief titled Nvidia Lead Brief with the findings.\"}'::jsonb);"
```

Agent runs take anywhere from 30 seconds to several minutes depending on tool calls and model latency. Watch progress live:

```bash
# Tail logs for the most recent run
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT level, message, created_at FROM logs WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1) ORDER BY created_at;"

# Inspect finalized run
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT id, status, model, prompt_tokens, completion_tokens, total_tokens, output FROM runs ORDER BY created_at DESC LIMIT 1;"

# Inspect tool calls
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT sequence, tool_name, status, duration_ms FROM tool_calls WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1) ORDER BY sequence;"

# Inspect written artifacts
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT name, path, kind, size FROM artifacts ORDER BY created_at DESC LIMIT 5;"
```

### 9. Run the Next.js dev server

```bash
npm run dev
# Open http://localhost:3000 — the minimal landing page
```

### 10. Verify the build still compiles cleanly

```bash
npm run build
# Should compile in ~1-2 seconds with no errors
```

---

## The Stack

Current versions as of 2026-04-10 (post Phase 3B landing, verified on disk):

- **Next.js 15.5.15** with Turbopack
- **App Router** (not Pages Router)
- **React 19.1** + React DOM 19.1
- **Drizzle ORM 0.45.2** + **drizzle-kit 0.31.10** — use `db:push` for schema sync (migrate CLI has a silent-error bug in 0.31.x)
- **postgres.js 3.4.8**
- **Tailwind CSS v4** + `@tailwindcss/postcss`
- **Radix UI** (dialog, dropdown, scroll-area, select, separator, slot, tabs, toast, tooltip)
- **Vercel AI SDK** (`ai` 6.0.116 + `@ai-sdk/openai` 1.3.22) — talks directly to llama.cpp's OpenAI-compatible endpoint
- **lucide-react 0.511** for icons
- **middleware.ts** for auth/routing (HMAC cookie gate)
- **docker-compose.yml** for local Postgres (host :5433) + MinIO (:9010/:9011)

Added for Command:

- **llama.cpp** (built from source with CUDA) serving `Nemotron-3-Super-120B-A12B Q4_K_M` on port `:8081`
- **Ollama** (already running) for `nomic-embed-text` embeddings and small-model fallback
- **Python worker** — `worker/` subdirectory, asyncio + asyncpg + httpx, ships with 4 tools (`echo`, `web_search`, `fetch_url`, `write_brief`) and a full LLM agent loop against llama.cpp on `:8081`

Post-Phase-2, dead vault-era dependencies were pruned: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `mammoth`, `pdfjs-dist`, `react-dropzone`, `@napi-rs/canvas`. Package count dropped to 141 and build time went from 2.4 s → 1.1 s.

---

## Why We Chose What We Chose

### llama.cpp instead of Ollama for the heavy model

| Concern | llama.cpp | Ollama |
|---|---|---|
| Multi-shard GGUF support | Native (`-m shard-00001-of-00003.gguf` auto-loads the rest) | Requires `Modelfile` wrangling |
| `--n-gpu-layers` tuning | Explicit flag, easy to probe | Hidden behind `num_gpu` env var |
| Hybrid VRAM + system RAM offload | First-class, documented | Works but less transparent |
| Upstream model support | Gets Blackwell support fastest | Waits on releases |
| OpenAI-compatible API | Yes (`llama-server`) | Yes |
| Ease of use for small models | Overkill | Perfect |

**Decision:** llama.cpp serves the 120 B model. Ollama stays put for `nomic-embed-text` embeddings and the small-model fallback so we don't rebuild everything.

### Fork evergreen-vault instead of scaffolding fresh

The original plan called for a fresh Next.js scaffold — this was wrong. Evergreen-vault is not a "divergence from the stack." It **is** the stack: Next.js 15 App Router + Drizzle + postgres.js + middleware.ts + docker-compose + Radix + Vercel AI SDK. Forking it gives us the auth layer, the DB migrations, the UI primitives, the build config, and the docker dev loop — all on day one.

### Next.js App Router instead of React + Vite (from the brief)

The project brief originally suggested React + Vite. We overrode this because every other Evergreen dashboard is Next.js App Router — keeping the stack uniform means components, hooks, and DB schemas cross-pollinate between projects for free.

### asyncio + asyncpg for the worker, not FastAPI or Celery

Phase 3 considered three runtimes: FastAPI with a background task queue, Celery with Redis, and plain asyncio. We picked plain asyncio because:

- No extra infra — no Redis, no broker, no worker/scheduler split
- Postgres is already the queue via `FOR UPDATE SKIP LOCKED`
- Concurrent workers are safe for free (SKIP LOCKED handles the race)
- `asyncpg` is the fastest Postgres driver in Python and speaks JSONB natively via type codecs
- Graceful shutdown is a single `asyncio.Event` + two signal handlers

If we ever need horizontal scale, we just start N workers — no code change.

### Input-shape dispatch instead of two separate worker entrypoints

Phase 3B could have introduced a new table column, a new enum, or a second worker binary to distinguish "literal tool_calls" from "agent prompt." Instead, `execute_run()` branches on whether `runs.input` has a `prompt` key or a `tool_calls` key. Zero schema changes, zero operational overhead, and Phase 3A's existing smoke tests still work as a regression path. Future modes (e.g. a `plan` key for a dry-run planner) can be added the same way.

### ContextVars for tool-to-run plumbing instead of passing run_id everywhere

Tools like `write_brief` need to know which run they belong to so they can insert an `artifacts` row — but we didn't want to add a `run_id` parameter to every tool signature (and then remember to thread it through). Python's `contextvars.ContextVar` solves this cleanly: `main.py` sets `current_run_id.set(run_id)` before dispatch, the tool reads it via `current_run_id.get()`, and the token is reset in a `finally` block. `asyncio.to_thread` automatically propagates the context via `copy_context()`, so sync tools (like `web_search`, which uses ddgs) see the same value as async tools (like `fetch_url`).

---

## Pre-Research Findings

### evergreen-vault is the perfect template

Read directly from GitHub:

- `package.json`: `next ^15.3.2`, `drizzle-orm ^0.45.1`, `drizzle-kit ^0.31.1`, `postgres ^3.4.8`, `@ai-sdk/openai ^1.3.22`, `ai ^6.0.116`, `tailwindcss ^4.1.7`, `@tailwindcss/postcss ^4.1.7`, full Radix set, `mammoth`, `pdfjs-dist`
- Root tree includes: `drizzle.config.ts`, `drizzle/` migrations folder, `middleware.ts`, `docker-compose.yml`, `mcp-server/`, `CLAUDE.md`, `.env.example`, `.mcp.json`

Everything we need, already wired. Fork → rename → swap the schema → ship.

### Nemotron-3-Super-120B as the heavy model

- Repo: `bartowski/nvidia_Nemotron-3-Super-120B-A12B-GGUF` on Hugging Face
- Quant: `Q4_K_M` — the sweet spot for 32 GB VRAM + 128 GB RAM hybrid offload
- Size: ~82 GB across 3 shards (37 + 37 + 7.6)
- Architecture: 120 B MoE with only 12 B active parameters per token
- Why this one: Best quality model that will fit in our hybrid VRAM+RAM envelope with useful throughput

### The VoxStation / videostar clock-lock pattern

Two existing scripts on the Framestation already solved the Blackwell-over-USB4 crash:

- `~/VoxStation/vox`
- `~/videostar/scripts/frame`

Both use the pattern:
```bash
sudo nvidia-smi -lgc "${GPU_CLOCK},${GPU_CLOCK}"
```

With the documented rule: **"NEVER change clocks mid-inference. Always kill the running workload first, change clocks, then restart. Always use locked clocks (min=max): `nvidia-smi -lgc 1933,1933` not `nvidia-smi -lgc 300,1933`."**

We reuse this exact pattern and clock value before launching `llama-server`.

### evergreenagent is the perfect tool registry template

Read directly from the `johnfinleyproductions-lang/evergreenagrent` GitHub repo (note the typo in the repo name):

- `tools/base.py` — clean `Tool` ABC with `name`, `description`, `parameters` (JSON Schema), and `execute(**kwargs)`. Already emits OpenAI-compatible function-calling schemas via `to_schema()`.
- `tools/registry.py` — `ToolRegistry` class with `register()`, `schemas` property, and dispatch `execute()`.
- `tools/web_search.py` — DuckDuckGo search tool as a reference implementation.

For the worker, we ported these with two deliberate changes: (1) `execute()` returns a `dict` instead of a string so it can be stored natively as JSONB, and (2) the registry supports both sync and async tools, bridging sync ones to the event loop via `asyncio.to_thread`.

---

## Lessons Learned

Every pothole we've hit so far, and what to do next time.

### CachyOS ships without pip

`pip: command not found`. CachyOS is Arch-based and does not install pip by default.

**Fix:** Use [uv](https://astral.sh/uv). One-line install:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install "huggingface_hub[cli]"
```
Ignore the `source $HOME/.local/bin/env` post-install step — that file doesn't exist in uv 0.11.6, PATH is already set.

### `huggingface-cli` is deprecated — use `hf`

The binary renamed. The `[cli]` extra also doesn't exist anymore, but the warning is non-fatal and the binaries still install.

**New command shape:**
```bash
hf download bartowski/nvidia_Nemotron-3-Super-120B-A12B-GGUF \
  --include "*Q4_K_M*" \
  --local-dir ~/models/nemotron-3-super-120b
```
Drop `--local-dir-use-symlinks False` — it was removed.

### `hf-xet` stages downloads in a hidden subdir *inside* the target

This one burned half an hour. The new parallel chunked downloader (`hf-xet`) stages `.incomplete` files in:
```
~/models/nemotron-3-super-120b/.cache/huggingface/download/
```
Not `~/.cache/huggingface/`. So `du -sh ~/models/nemotron-3-super-120b/` counts staging + finalized combined, making it look like the download is "done" at 71 GB when in reality only one shard is finalized and two are still streaming.

**Detection:**
```bash
find ~/models/nemotron-3-super-120b/ -name "*.incomplete"
```
If that returns anything, you're not done.

### tqdm progress bars lie, and `tee` destroys them

- The outer "Fetching 3 files" tqdm bar only ticks when a **whole file** finishes — it will read "0%" until the first shard is done, even if you're 30 GB deep into shard 1.
- tqdm uses `\r` (carriage return) not `\n`, so piping through `tee` captures only the first line and you see nothing.

**Fix:** Don't pipe through tee. Monitor via `du -sh` or `tmux attach -t nemotron-dl` directly and watch the live bar.

### CachyOS needs cmake, base-devel, and cuda from pacman

`cmake: command not found` + `nvcc: command not found`.

**Fix:**
```bash
sudo pacman -S --needed cmake base-devel cuda
export PATH=/opt/cuda/bin:$PATH
export CUDAToolkit_ROOT=/opt/cuda
```
Arch installs CUDA to `/opt/cuda`, not `/usr/local/cuda`. Also: if cmake fails mid-configure, `rm -rf build` before retrying — a partial build dir will not self-heal.

### Blackwell-over-USB4 requires clock locking

The PCIe link renegotiates if clocks drift during inference, and the driver crashes. Pattern from our existing working scripts:
```bash
sudo nvidia-smi -pm 1                                 # persistence mode on
sudo nvidia-smi -lgc 1933,1933                        # min = max
# ...run workload...
```
**Never** change clocks mid-inference. Kill the workload, change clocks, restart.

### The 8.8 GB VRAM holder was a Docker container

Symptoms: `nvidia-smi` shows `python3` PID holding 8.8 GB. `ps` shows `uvicorn main:app --host 0.0.0.0 --port 8020`. `ss -tlnp` shows `docker-proxy` on `:8020`. `/proc/<pid>/cwd → /app`.

**Lesson:** `/app` as cwd + `docker-proxy` in `ss` output = Docker container. Killing the PID directly will not work — Docker's restart policy will spin it back up. Use:
```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}"
docker stop <container>
docker update --restart=no <container>   # optional: prevent auto-revive
```

On this Framestation the culprit was `voxstation_voice` on :8020.

### `--flash-attn` takes an explicit argument in recent llama.cpp builds

In build `b8739-d132f22fc`, `--flash-attn` is no longer a bare boolean flag — it requires `on`, `off`, or `auto`. Passing it bare causes llama-server to consume the next argument as its value, producing a confusing error like `error: unknown value for --flash-attn: '--host'`, and the server silently fails to come up.

```bash
# WRONG (older syntax, crashes immediately)
--flash-attn

# RIGHT
--flash-attn on
```

### Don't use `\$(nproc)` inside tmux double-quoted commands

The backslash escape gets mangled through `tmux new -d -s name "cmd"` and the shell never substitutes the command. Hardcode the thread count:

```bash
nproc   # returns 32
tmux new -d -s llama "... --threads 32 ..."
```

### `fs-mode-*` scripts are needed

Each workload has a different VRAM/clock profile (ComfyUI vs. llama.cpp vs. TTS). We need a mode switcher — `fs-mode-command`, `fs-mode-video`, `fs-mode-voice` — that:
1. Kills the currently-running workload cleanly
2. Changes clocks to the target mode's locked value
3. Starts the target workload

This belongs in `evergreen-infrastructure` alongside `gpu` (the Ollama backend switcher).

### Multi-shard GGUF: point llama.cpp at shard 00001

llama.cpp auto-discovers the rest of the shards when you pass it the first one:
```bash
llama-server -m ~/models/.../nvidia_Nemotron-3-Super-120B-A12B-Q4_K_M-00001-of-00003.gguf ...
```

### VRAM headroom: 89% target, not 94%

Dropping from 28 → 26 GPU layers on this 120 B MoE gave up **zero** generation speed (12.96 tok/s both configs) while doubling the VRAM headroom from 1.8 GB to 3.6 GB. Proves the MoE is CPU-bottlenecked on expert routing, not GPU-bound.

**Rule:** Tune layers to a headroom target (~89%), not to "fill the GPU." The speed ceiling is set by CPU dispatch, not GPU layer count. Only prompt processing takes a modest hit (13-15%), and that's a one-time per-request cost invisible in real agent workloads.

### drizzle-kit 0.31.x silently no-ops on `migrate` and exits with code 1

**Symptom:** `npm run db:migrate` prints `Using 'postgres' driver for database querying` and then exits to the shell. No applied-migration list, no error message, no traceback. `\dt` shows zero tables afterwards. Running `npx drizzle-kit migrate; echo $?` reveals `exit code: 1` — so it **is** failing, it's just swallowing the error.

**Why (discovered during Phase 2 debugging):** drizzle-kit's `migrate` and `push` commands both swallow Postgres connection errors instead of surfacing them. In our case the underlying error was `password authentication failed for user "command"` — but drizzle-kit printed only `Pulling schema from database...` before exiting silently. We only discovered the real error by running raw `postgres.js` from node, which printed the actual Postgres message.

**Versions affected:** Confirmed on `drizzle-kit 0.31.10` + `drizzle-orm 0.45.2` + `postgres 3.4.8`. 0.31.10 is the latest published version on npm — no upgrade available as of 2026-04-10.

**Workaround (what we use today):** `drizzle-kit push` works fine **once the underlying connection is actually reachable**. If push is silent, the real problem is a connection issue that drizzle-kit is hiding — always cross-test with a raw postgres.js call before assuming drizzle-kit is broken:

```bash
node -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);s\`select current_user\`.then(r=>{console.log('OK',r);return s.end()}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
```

### Docker compose silently drops port mappings if the host port is already bound

**Symptom:** `docker compose up -d` returned success. `docker ps` showed the container `Up (healthy)`. But `docker ps` also showed an **empty PORTS column** for that container. Meanwhile every TCP connection from the host to the published port was hitting a **different** container on the same port from an unrelated project. The connection succeeded — it was just talking to the wrong database.

**Why:** When you publish host port X with `ports: ["X:Y"]`, Docker first tries to bind a `docker-proxy` process on X. If X is already owned by something else (another container, a native process), the bind fails — but docker compose does **not** abort. It starts the container anyway without the port mapping, logs a success message, and leaves the container running but unreachable over TCP. The container works fine over the internal Docker network, and `docker exec` into it works (that's over a Unix socket, not the published port), which makes the failure invisible unless you specifically check `docker ps --format 'table {{.Names}}\t{{.Ports}}'`.

**Concrete case:** `evergreen-vault-db` from another project had been up 43 hours on host port 5432. When we brought up `evergreen-command-db` with `ports: ["5432:5432"]`, the mapping silently never took effect. Every `node -e` postgres.js test and every `drizzle-kit push` call from the host was connecting to **vault-db**, getting `password authentication failed for user "command"` (because vault-db's role didn't match), and we spent hours editing `pg_hba.conf` on command-db wondering why our changes didn't take effect — because our changes were going to the right container, but our connections were going to the wrong one.

**Fix:**
1. **Before** committing any port binding in `docker-compose.yml`, run `ss -tlnp | grep <port>` and `docker ps -a | grep -i <service>`. If anything owns the port, pick a different one.
2. **After** `docker compose up -d`, verify the mapping actually bound: `docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep <container>`. If the PORTS column is empty, the publish silently failed.
3. Our concrete resolution: moved `evergreen-command-db` from `5432:5432` → `5433:5432` and updated `.env.local`. Both projects now coexist cleanly.

### Docker bridge NAT makes host TCP connections look like they're from the bridge IP, not 127.0.0.1

**Symptom:** `pg_hba.conf` had `host all all 127.0.0.1/32 trust`, but TCP connections from the host to the Docker-published Postgres port were still getting hit by the fallback `scram-sha-256` auth rule. Trust was never applied.

**Why:** When you connect to `127.0.0.1:<published-port>` from the host, the packet goes through Docker's `docker-proxy` + bridge NAT, and by the time it reaches Postgres inside the container, the source address has been rewritten to the Docker bridge IP (e.g. `172.24.0.1`), **not** `127.0.0.1`. Postgres's `pg_hba.conf` `127.0.0.1/32` rule never matches a bridge-NAT'd connection — it falls through to whatever catch-all comes next.

**How to confirm:** Add `inet_client_addr()` to a query and you'll see the bridge IP, not 127.0.0.1:

```sql
SELECT current_user, inet_client_addr();
-- → command | 172.24.0.1
```

**Fix:** If you need trust-level auth for local dev through the Docker bridge, use `host all all 0.0.0.0/0 trust` (dev only, container is only exposed on localhost anyway). The correct rule to cover Docker bridge connections is the IPv4 catch-all, not loopback.

### Docker port coexistence: always `ss -tlnp` before binding

**Symptom:** Early in Phase 2, `docker compose up -d` failed with `Bind for 0.0.0.0:9000 failed: port is already allocated`. (Interestingly, Postgres port bindings failed *silently* instead — see the "silently drops port mappings" lesson above. MinIO threw a loud error because of how docker-proxy handles the port class differently.)

**Rule:** Before committing port bindings in `docker-compose.yml`, run:

```bash
ss -tlnp | grep :<port>
docker ps -a | grep -i <service>
```

If anything owns the port, **move** — never kill. Killing a container from an unrelated project is a foot-gun. In Evergreen Command, MinIO is on `:9010` (S3 API) and `:9011` (console), and Postgres is on host `:5433`, so both compose stacks coexist with vault's `:9000`/`:9001`/`:5432`.

**Also note:** `docker compose down -v` only removes resources in the **current compose project's namespace** (based on the directory name). Orphan containers from a previous compose project that shared the same container names will still be sitting there — `docker ps -a` is the only way to see them.

### Next.js auto-loads `.env.local`, but drizzle-kit CLI does not

**Symptom:** `npm run db:migrate` errored with `Please provide required params for Postgres driver: [x] url: undefined` even though `.env.local` was committed with `DATABASE_URL=...`.

**Why:** Next.js runtime auto-loads `.env` and `.env.local` via its built-in env loader. Drizzle-kit is a **standalone Node CLI** that does not. It only sees variables that are already exported in the parent shell.

**Fix:** Auto-export when sourcing:

```bash
set -a && source .env.local && set +a && npm run db:migrate
```

`set -a` flips on auto-export; every variable assigned while it's active gets exported to child processes. `set +a` turns it back off. This is the cleanest way to bridge a `.env.local` file into any CLI that doesn't auto-load env files.

### Parallel GitHub `delete_file` calls race on the branch ref SHA

**Symptom:** Running 10 parallel `mcp__github__delete_file` calls during the Phase 2 vault nuke produced ~20% failures with `422 Update is not a fast forward`. Dropping to 5 parallel still had ~40% failures on the second batch.

**Why:** Each `delete_file` call internally reads the current branch ref, stages a commit, and pushes. Parallel calls all read the **same** starting SHA, so only the first one to land fast-forwards cleanly — the rest fail because the ref has moved.

**Fix:** Serial deletes only. One file per tool call. 100% reliable, ~3-5 seconds per file. Slower but predictable. This is a GitHub API limitation, not an MCP bug.

### Root `tsconfig.json` include glob pulls sibling subpackages into type-check

**Symptom:** After deleting the vault UI/API, the build still had dangling type errors from files under `mcp-server/src/*.ts` that imported the now-deleted vault schema.

**Why:** The root `tsconfig.json` had `"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`. The `**/*.ts` glob is greedy — it pulled everything under `mcp-server/` into the root type-check pass, even though `mcp-server/` had its own `tsconfig.json` and was meant to be its own subpackage.

**Fix (what we did):** Deleted `mcp-server/` entirely because it was all vault-specific code anyway.

**Fix (if we had wanted to keep it):** Add `"exclude": ["mcp-server/**", "worker/**", ...]` to the root `tsconfig.json` so the subpackage has to be built independently. (We've now shipped `worker/` as a Python subpackage, which sidesteps this entirely — Python is invisible to tsc.)

### Postgres runs in Docker on the Framestation, not natively

**Symptom:** `sudo -u postgres psql` failed with `sudo: unknown user postgres`, and `psql` itself wasn't on `$PATH`.

**Why:** CachyOS doesn't have a system `postgres` user because Postgres isn't installed via pacman — it runs inside the `pgvector/pgvector:pg17` container from `docker-compose.yml`. All psql access has to go through `docker exec`.

**Pattern:**

```bash
# List databases
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\l"

# List tables
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\dt"

# Apply a SQL file (note: docker exec -i, not -it, for stdin piping)
docker exec -i evergreen-command-db psql -U command -d evergreen_command < some.sql

# Interactive shell
docker exec -it evergreen-command-db psql -U command -d evergreen_command
```

Note: `docker exec` uses a Unix socket inside the container, which is covered by `pg_hba.conf`'s `local all all trust` rule — so it works even when TCP auth is failing on the published port. This is a great sanity-check path: if `docker exec` psql works but TCP from the host doesn't, the problem is either the hba rules or the port mapping itself.

### asyncpg needs a connection-level JSONB type codec to round-trip Python dicts

**Symptom:** Passing a plain `dict` to a JSONB column produced `DataError: invalid input for query argument: expected str, got dict`. Passing `json.dumps(d)` stored the payload fine but reading it back gave a `str`, not a `dict`, forcing every caller to re-parse.

**Fix:** Register a type codec on every pool connection via the `init` hook so JSONB auto-encodes on write and auto-decodes on read:

```python
async def _init_connection(conn):
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )

pool = await asyncpg.create_pool(dsn=..., init=_init_connection)
```

Now Python dicts go in and Python dicts come out — no per-call boilerplate.

### Schema column naming: `runs` uses `input`/`output`, but `tool_calls` uses `arguments`/`result`

**Symptom:** First pass of the worker tried to `INSERT INTO tool_calls (input, output, ...)` and got `column "input" does not exist`.

**Why:** The Drizzle schema was deliberately built with different naming to match two different mental models: a `run` has an `input` payload (the user's prompt + tool_calls list) and an `output` payload (the final result), while a `tool_call` has `arguments` (what the LLM passed) and a `result` (what the tool returned). Both concepts are valid; they just use different words. Also worth noting: `runs.finished_at` (not `completed_at`) and status value `succeeded` (not `completed`).

**Fix:** The worker's `db.py` hardcodes the right column names per table. When adding real tools in Phase 3B+, double-check which table you're writing to before picking column names.

### `artifacts.size` (not `size_bytes`) and `artifacts.kind` is a typed enum

**Symptom:** First draft of `write_brief` tried to `INSERT INTO artifacts (size_bytes, kind, ...) VALUES (..., 'brief', ...)` and failed on both columns — the column is called `size`, and `'brief'` is not a valid enum value.

**Why:** The Drizzle schema defines `size` as the column name (matching pg convention) and `kind` as an `artifact_kind` enum with values `'report' | 'data' | 'image' | 'code' | 'log' | 'other'`. There's no `'brief'` value, and the Python string needs an explicit `::artifact_kind` cast in the INSERT so asyncpg doesn't fall back to text.

**Fix:** `INSERT INTO artifacts (run_id, name, path, kind, mime_type, size, metadata) VALUES ($1, $2, $3, $4::artifact_kind, $5, $6, $7)` with `kind='report'`. The lesson generalizes: **re-read `drizzle/0000_complete_bucky.sql` as ground truth before writing any new INSERT.** Drizzle snapshot JSON lies about enum casts.

### ContextVars auto-propagate through `asyncio.to_thread`, so sync tools see them too

**Concern during Phase 3B design:** I wanted tools like `write_brief` to know their run_id without plumbing it through every call signature, and `contextvars.ContextVar` was the obvious answer for async code — but the registry bridges sync tools to the event loop via `asyncio.to_thread`, and I was worried the context wouldn't cross the thread boundary.

**Reality:** `asyncio.to_thread` calls `contextvars.copy_context().run(...)` internally, so the current context (including every `ContextVar.set()` done so far) is captured and replayed inside the worker thread. Sync tools read `current_run_id.get()` successfully. No extra plumbing needed. This is documented but easy to miss.

### Feed tool errors back to the LLM instead of failing the run

**Tempting pattern:** If a tool call raises an exception, mark the run as `failed` and exit.

**Better pattern (what we ship):** Catch the exception, mark just the `tool_calls` row as `failed` with the error in `result`, and feed the error back to the model as the tool message (`{role: "tool", tool_call_id, content: "Error: ..."}`). The model sees the failure on its next iteration and can retry with different args, use a different tool, or gracefully abandon that subtask. This makes agent runs vastly more robust — a single tool hiccup (network blip, bad URL, search quota) doesn't nuke the entire run. Max iterations (default 10) is still the hard stop against infinite loops.

### Agent mode vs. literal mode via input-shape dispatch is a clean separation

**Problem:** Phase 3A's worker only understood `{"tool_calls": [...]}` — a literal script. Phase 3B needed `{"prompt": "..."}` for the agent loop. Do we add a `mode` column to `runs`? A separate table? Two worker binaries?

**What we did:** Neither. `execute_run()` just branches on `"prompt" in input_data` vs `"tool_calls" in input_data`. Zero schema changes. Phase 3A's echo regression test still works. Future modes (a dry-run planner, a structured function plan, batch mode) can be added by adding new keys — each becomes a self-describing run without touching the schema or the call sites that create runs.

---

## What's Been Done So Far

### Research & planning ✅
- [x] Reviewed `Evergreen-Command-Project-Brief.docx`
- [x] Reviewed evergreen-vault GitHub repo (confirmed perfect template)
- [x] Broke down llama.cpp vs Ollama roles
- [x] Decided on two-process architecture (Next.js web + Python worker)
- [x] Identified VoxStation/videostar clock-lock pattern as the reference

### Model download ✅
- [x] Installed `uv` on the Framestation
- [x] Installed `hf` CLI via `uv tool install`
- [x] Downloaded Nemotron-3-Super-120B-A12B Q4_K_M (~82 GB, 3 shards)
- [x] Verified all shards finalized

### llama.cpp build ✅
- [x] `pacman -S --needed cmake base-devel cuda`
- [x] Built from source with CUDA enabled
- [x] Confirmed Blackwell detection at startup

### Phase 1 — llama-server launch ✅
- [x] Stopped `voxstation_voice` Docker container (freed 8.8 GB VRAM)
- [x] Locked GPU clocks at 1933 MHz
- [x] Launched llama-server in detached tmux
- [x] Tuned layers and CPU flags
- [x] Recorded 12.96 tok/s production baseline at 26 layers + threads 32 + flash-attn on
- [x] Verified inference via curl Paris test

### Phase 2 — Fork + schema swap ✅
- [x] GitHub repo created: `johnfinleyproductions-lang/evergreen-command-claw`
- [x] Forked evergreen-vault as clean base (single initial commit, no history)
- [x] Committed Phase 2 planning docs
- [x] Wrote new 5-table Drizzle schema (tasks, runs, tool_calls, artifacts, logs)
- [x] Deleted all vault-era UI routes under `app/(vault)/` (12 files)
- [x] Deleted all vault-era API routes under `app/api/` (25 files)
- [x] Deleted vault-era `lib/rag/*` and `lib/storage/minio.ts` (9 files)
- [x] Deleted orphaned layout components (sidebar, header)
- [x] Deleted entire `mcp-server/` vault subpackage (5 files)
- [x] Rebranded `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`
- [x] Rewrote `docker-compose.yml` for Evergreen Command branding + non-conflicting MinIO ports
- [x] Updated `.env.example` to match
- [x] `npm run build` passes cleanly (Next.js 15.5.15, 1.1 s compile post-dep-prune)
- [x] `npm run db:generate` produces `0000_complete_bucky.sql` matching schema
- [x] Applied schema to Postgres and verified all 5 tables present
- [x] Pruned dead vault-era dependencies (`@aws-sdk/*`, `mammoth`, `pdfjs-dist`, `react-dropzone`, `@napi-rs/canvas`) — 141 packages total
- [x] Rewrote `CLAUDE.md` for post-Phase-2 reality (npm, new stack versions, 7 non-negotiable rules)
- [x] Diagnosed and fixed the Postgres port-hijack / Docker bridge NAT bug — moved host port to `5433`, confirmed `drizzle-kit push` connects successfully and reports `[✓] Changes applied`

### Phase 3A — Python worker scaffold (stub echo tool) ✅
- [x] Decided on asyncio + asyncpg + plain Postgres as the queue (no Redis, no Celery, no FastAPI)
- [x] Read evergreenagrent source (`tools/base.py`, `tools/registry.py`, `tools/web_search.py`) as the porting target
- [x] Re-read Drizzle schema to confirm exact column names per table
- [x] Created `worker/` subdirectory (one git history, one repo)
- [x] `worker/requirements.txt` — asyncpg + python-dotenv
- [x] `worker/config.py` — loads `.env.local` from repo root via upward path walk
- [x] `worker/db.py` — asyncpg pool with JSONB type codec, `claim_next_run()` via `FOR UPDATE SKIP LOCKED`, insert/complete/fail tool calls, write logs, finalize runs
- [x] `worker/tools/base.py` — ported `Tool` ABC, now returns `dict` (not str) for JSONB storage
- [x] `worker/tools/registry.py` — ported with async dispatch (`inspect.iscoroutinefunction` + `asyncio.to_thread` for sync tools)
- [x] `worker/tools/echo.py` — stub `EchoTool` that takes `{message}` and returns `{echo, length, reversed}`
- [x] `worker/main.py` — asyncio poll loop with SIGINT/SIGTERM graceful shutdown + `execute_run()` that dispatches `run.input.tool_calls`
- [x] `worker/README.md` — quickstart, architecture diagram, end-to-end test SQL
- [x] **End-to-end test passed 100% green:** `runs` row finalized as `succeeded` with correct `output` JSONB, `tool_calls` row inserted with `sequence=0` + `duration_ms=0`, `logs` table populated with 4 lines (claimed → dispatching → succeeded → run succeeded)

### Phase 3B — Real tools + LLM agent loop ✅
- [x] Added httpx + ddgs + beautifulsoup4 to `worker/requirements.txt`
- [x] Extended `worker/config.py` with `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT`, `LLM_TEMPERATURE`, `AGENT_MAX_ITERATIONS`, `ARTIFACTS_DIR`
- [x] `worker/context.py` — `ContextVar[current_run_id]` for run-id propagation across sync and async tools
- [x] `worker/llm.py` — async httpx wrapper for llama.cpp's `/v1/chat/completions` endpoint with tool-use payload shape
- [x] `worker/agent.py` — full LLM agent loop with default system prompt, token accounting across iterations, tool-error feedback, and max-iteration safety guard
- [x] `worker/tools/web_search.py` — DuckDuckGo via `ddgs` with fallback import to legacy `duckduckgo_search`
- [x] `worker/tools/fetch_url.py` — httpx + BeautifulSoup page fetcher with script/style stripping + 50 KB truncation
- [x] `worker/tools/write_brief.py` — writes a timestamped markdown file under `ARTIFACTS_DIR`, inserts an `artifacts` row with `kind='report'`, reads `current_run_id` from context
- [x] Extended `worker/db.py` with `insert_artifact(...)` and extended `finalize_run_success(...)` to accept optional model + token counts
- [x] Refactored `worker/main.py` to dispatch on `input` shape: `prompt` key → agent mode, `tool_calls` key → literal mode (Phase 3A regression path preserved), else → descriptive failure
- [x] `execute_run()` sets `current_run_id.set(run_id)` in a token and resets it in `finally`
- [x] Rewrote `worker/README.md` to document both modes + smoke tests + architecture diagram
- [x] All Phase 3B files committed to `main` in a single atomic push (commit `e609408`)

---

## What's Left To Do

### Phase 3B verification 🟡

1. Pull the new worker files on the Framestation, reinstall deps (`pip install -r requirements.txt`), restart the worker
2. Confirm `llama-server` is still up on `:8081` (`curl http://localhost:8081/v1/models`)
3. Run the Phase 3A regression test (echo via literal mode) — must still pass
4. Run the Phase 3B tier 1 smoke test (single-tool web_search for asyncio docs URL)
5. Run the Phase 3B tier 2 canonical Nvidia lead-research task
6. Inspect resulting `runs`, `tool_calls`, `logs`, and `artifacts` rows
7. Open the generated brief under `worker/artifacts/` to eyeball quality

### Phase 3C — SSE log stream 🔴

1. SSE endpoint from Next.js tails `logs` rows for a given `run_id` and streams them to the UI
2. Re-use the `created_at` index on `logs` we already shipped in the schema
3. Worker writes → Postgres NOTIFY → Next.js SSE route → browser EventSource

### Phase 4 — UI polish 🔴

1. Build out the mockup into real React components
2. Resolve parked mockup feedback questions (see Open Questions)
3. Template picker populates a prompt library
4. Inspector panels pull live VRAM/RAM/clock data from a Framestation health endpoint
5. Bring up MinIO (`docker compose up -d minio`) and wire artifact uploads

### Phase 5+ — Future capability layers (parked)

See [Phase 5+ Ideas](#phase-5-ideas-parked) below.

### Infrastructure (parallel track) 🔴

1. Build `fs-mode-command`, `fs-mode-video`, `fs-mode-voice` scripts in `evergreen-infrastructure`
2. Each one: kill current workload, change clocks, start target workload
3. Document the "never change clocks mid-inference" rule

---

## Phase 5+ Ideas (Parked)

These came up during planning. Not in the MVP, but in the roadmap so they're not forgotten.

### `/instructions/` — task-type system prompts
Per-task-type system prompts that get injected based on the template picked. "Lead Research" gets a different system prompt than "Contract Review." Lives as markdown files in `/instructions/` and loads by filename.

### `/skills/` — a skills library (clone of the Claude Code pattern)
A folder of `SKILL.md` files the agent can read *before* starting a task to pick up methodology. Exactly the pattern used in Cowork. Discoverable by description, loaded on demand.

### `/examples/` — pgvector few-shot memory
Store successful past runs as embedding vectors in pgvector. When a new task comes in, retrieve the 3 most similar past runs and include them as few-shot examples. Self-improving over time.

### 4-layer feedback loop
1. **Per-step:** tool-call validation (did the tool succeed?)
2. **Per-run:** quality score on final output (heuristic + optional self-critique pass)
3. **Per-task-type:** aggregate score trends over time, surface regressions
4. **Per-template:** prompt tuning based on which prompts produce highest-scoring runs

---

## Open Questions

Parked until we have something running:

- **Sidebar width:** 280 px fixed (mockup default) or collapsible?
- **Inspector density:** current mockup is dense — does it need more whitespace, or is dense correct for a power-user tool?
- **Accent color:** green (`#3ddc84`) or amber?
- **Task prompt placement:** top of main area (mockup) or floating/command-palette style?

---

## Reference Commands

### GPU state
```bash
nvidia-smi                                              # who is holding VRAM
sudo nvidia-smi -pm 1                                   # persistence on
sudo nvidia-smi -lgc 1933,1933                          # lock clocks at 1933 MHz
sudo nvidia-smi -rgc                                    # reset clocks
```

### Docker container cleanup
```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Status}}"
docker stop <container>
docker update --restart=no <container>
```

### Docker compose — Evergreen Command services
```bash
docker compose up -d postgres       # start only Postgres (Phase 2+)
docker compose up -d                # start Postgres + MinIO (Phase 4+)
docker compose ps                   # list services with health status
docker compose down                 # stop and remove containers (keeps volumes)
docker compose down -v              # also remove named volumes (WIPES DATA)
docker compose logs -f postgres     # tail Postgres logs

# CRITICAL: verify the port mapping actually bound (silent-fail bug)
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep evergreen-command
```

### Postgres via docker exec (unix socket — always works)
```bash
# List databases
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\l"

# List tables
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\dt"

# Describe a table
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\d tasks"

# Apply a SQL file (note: -i not -it for stdin piping)
docker exec -i evergreen-command-db psql -U command -d evergreen_command < drizzle/0000_complete_bucky.sql

# Interactive psql shell
docker exec -it evergreen-command-db psql -U command -d evergreen_command
```

### Postgres from the host (TCP, port 5433)
```bash
# Raw postgres.js smoke test — great for diagnosing drizzle-kit silent failures
node -e "const p=require('postgres');const s=p('postgresql://command:command_secret@127.0.0.1:5433/evergreen_command');s\`select current_user, inet_client_addr()\`.then(r=>{console.log('OK',r);return s.end()}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"

# psql from host, via a throwaway postgres container (no local psql needed)
docker run --rm --network host postgres:17 \
  psql "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT current_database(), current_user, inet_client_addr();"
```

### Phase 3A worker — literal mode regression smoke test
```bash
# Terminal 1: start the worker
cd worker
source .venv/bin/activate
python main.py
# → worker started. poll_interval=2.0s tools=['echo', 'web_search', 'fetch_url', 'write_brief'] llm=http://127.0.0.1:8081 model=nemotron

# Terminal 2: insert a pending literal-mode run (no LLM involved)
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"tool_calls\": [{\"name\": \"echo\", \"arguments\": {\"message\": \"hello phase 3\"}}]}'::jsonb);"

# Inspect the result (within 2s of the INSERT)
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT id, status, output FROM runs ORDER BY created_at DESC LIMIT 1;"
```

### Phase 3B worker — tier 1 agent mode smoke test (single tool)
```bash
# Requires llama-server up on :8081
curl http://localhost:8081/v1/models

# Insert a pending agent-mode run
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Use web_search to find the official Python asyncio docs URL, then return only the URL as your final answer.\"}'::jsonb);"

# Tail live logs for the newest run
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT level, message, created_at FROM logs WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1) ORDER BY created_at;"

# Final run inspection
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT id, status, model, prompt_tokens, completion_tokens, total_tokens, output FROM runs ORDER BY created_at DESC LIMIT 1;"
```

### Phase 3B worker — tier 2 canonical Nvidia lead-research task
```bash
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "INSERT INTO runs (status, input) VALUES ('pending', '{\"prompt\": \"Research Nvidia as a potential lead. Use web_search and fetch_url to gather recent news, products, leadership, and financials. Then use write_brief to save a one-page markdown brief titled Nvidia Lead Brief with the findings.\"}'::jsonb);"

# Inspect artifacts written
docker run --rm --network host postgres:17 psql \
  "postgresql://command:command_secret@127.0.0.1:5433/evergreen_command" \
  -c "SELECT name, path, kind, size, created_at FROM artifacts ORDER BY created_at DESC LIMIT 5;"

# View the actual brief on disk
ls -lah worker/artifacts/
cat worker/artifacts/*nvidia*.md
```

### Drizzle schema workflow
```bash
# Generate a new migration from schema changes
set -a && source .env.local && set +a && npm run db:generate

# Push schema → DB (preferred for single-dev, the migrate CLI is flaky in 0.31.x)
set -a && source .env.local && set +a && npm run db:push

# Direct SQL apply (fallback if drizzle-kit is silent)
docker exec -i evergreen-command-db psql -U command -d evergreen_command < drizzle/0000_complete_bucky.sql

# Drizzle Studio (browser-based DB browser)
set -a && source .env.local && set +a && npm run db:studio
```

### llama-server launch (production config)
```bash
tmux new -d -s llama-server "$HOME/llama.cpp/build/bin/llama-server \
  -m $HOME/models/nemotron-3-super-120b/nvidia_Nemotron-3-Super-120B-A12B-Q4_K_M/nvidia_Nemotron-3-Super-120B-A12B-Q4_K_M-00001-of-00003.gguf \
  --n-gpu-layers 26 \
  --ctx-size 8192 \
  --threads 32 \
  --flash-attn on \
  --host 0.0.0.0 \
  --port 8081 \
  2>&1 | tee $HOME/llama-server.log"

curl http://localhost:8081/v1/models
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nemotron","messages":[{"role":"user","content":"Say hello."}]}'
```

### tmux session management
```bash
tmux ls
tmux attach -t <session>              # Ctrl+b then d to detach, never Ctrl+c
tmux kill-session -t <session>
```

### Next.js dev workflow
```bash
npm install                           # one-time setup
npm run dev                           # dev server at :3000 with Turbopack
npm run build                         # production build (verify nothing's broken)
npm run lint                          # ESLint
```

---

*Last updated: 2026-04-10. Project state: **Phase 3B complete** — the Python worker now has a full LLM agent loop against llama.cpp on `:8081`, four real tools (`echo`, `web_search`, `fetch_url`, `write_brief`), ContextVar-based run-id propagation, token accounting across agent iterations, tool-error feedback to the model, and input-shape dispatch that preserves the Phase 3A literal-mode regression path. Ready to run the canonical Nvidia lead-research task end-to-end. Next: Phase 3C (SSE log stream from Next.js) and Phase 4 (UI polish).*
