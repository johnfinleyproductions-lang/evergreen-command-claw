# Evergreen Command

Local AI task runner. Next.js 15 App Router web UI + Python worker, both talking to a local llama.cpp server hosting Nemotron-3-Super-120B on the Framestation. Zero cloud dependency, zero per-token cost.

**First-read orientation for any AI session.** For full project history, architecture rationale, and the Phase 1 tuning journey, read `README.md` in the repo root.

## Live inference endpoint

- **URL:** `http://localhost:8081/v1/` (OpenAI-compatible)
- **Model:** `Nemotron-3-Super-120B-A12B Q4_K_M` (120 B MoE, 12 B active params)
- **Baseline:** 12.96 tok/s generation, 28.74 tok/s prompt processing
- **VRAM:** 28,998 / 32,623 MiB (~89% — 3.6 GB headroom for concurrent requests and Ollama embeddings)
- **Launch process:** `llama.cpp` in a detached tmux session on the Framestation

### Production launch command
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
```

**Before launching:** Always run `sudo nvidia-smi -pm 1 && sudo nvidia-smi -lgc 1933,1933` first. The Blackwell-over-USB4 link crashes mid-inference if clocks drift. This rule is non-negotiable.

### Verify endpoint is alive
```bash
curl http://localhost:8081/v1/models
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nemotron","messages":[{"role":"user","content":"Say hello."}]}'
```

## Architecture

Two processes sharing one Postgres instance:

- **Next.js 15 App Router web UI** — task input, live log, inspector panels, run history. This repo.
- **Python worker** (coming in Phase 3) — polls Postgres for new tasks, runs the agent loop with tool calls, writes results back. Ports the tool registry from `evergreenagent`.

Both talk to:
- **Postgres** (docker-compose) — `tasks`, `runs`, `tool_calls`, `artifacts`, `logs`
- **llama.cpp on :8081** — heavy-lifting 120 B model
- **Ollama on :11434** — embeddings (`nomic-embed-text`) + small-model fallback

The Next.js app streams live log rows to the UI via SSE. The worker writes to Postgres; the web UI reads from Postgres.

## Stack (inherited from evergreen-vault fork)

- **Next.js 15.3.2** App Router + Turbopack
- **TypeScript** everywhere
- **Drizzle ORM 0.45.1** + **drizzle-kit** migrations in `drizzle/`
- **postgres.js 3.4.8** driver (lazy singleton via Proxy)
- **Tailwind CSS v4** + `@tailwindcss/postcss`
- **Radix UI** (shadcn/ui components in `components/ui/`)
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) — points at local llama.cpp via `OPENAI_BASE_URL`
- **HMAC-SHA256 session auth** in `lib/auth/` (single-user)
- **Middleware** at `middleware.ts` for route protection
- **Package manager:** pnpm

## Project structure (fork-inherited, being rewritten)

```
app/
  (vault)/          → to be renamed to (command)/
    layout.tsx      # Sidebar + Header shell (keep)
    dashboard/      # Overview stats (repurpose for runs/tasks)
    library/        # ← will be replaced by task runner
    ...
  login/            # Auth page (keep as-is)
  api/
    auth/           # Login/logout (keep)
    chat/           # Streaming chat (repurpose to point at :8081)
components/
  layout/           # Sidebar, Header (keep, will update nav items)
  ui/               # shadcn/ui components (keep all)
lib/
  auth/             # HMAC-SHA256 sessions (keep)
  db/
    client.ts       # Drizzle + postgres.js lazy singleton (keep)
    schema/         # TO REWRITE: drop vault tables, add tasks/runs/tool_calls
  rag/              # Keep for embedding + retrieval
  storage/          # Keep MinIO client for artifact storage
drizzle/            # Migrations — will need new ones for command schema
mcp-server/         # Keep, may expose command tasks via MCP later
docker-compose.yml  # Postgres + MinIO (keep)
```

## Commands

```bash
# Development
pnpm install          # first time setup
pnpm dev              # Start Next.js dev server (Turbopack) on :3000
pnpm build            # Production build
pnpm lint             # Run Next.js linter

# Database
pnpm db:generate      # Generate Drizzle migrations from schema
pnpm db:migrate       # Run pending migrations
pnpm db:push          # Push schema directly (dev-only, skips migrations)
pnpm db:studio        # Open Drizzle Studio UI

# Infrastructure
docker compose up -d  # Start Postgres + MinIO
docker compose down   # Stop services
```

## Conventions

- **Server → client boundary:** `page.tsx` fetches data server-side and passes it to `client.tsx` for interactivity.
- **Lazy DB:** Proxy-based singleton in `lib/db/client.ts` — never instantiate Drizzle eagerly; the proxy handles the first access.
- **No OpenAI cloud calls:** Everything routes through `http://localhost:8081/v1/`. The Vercel AI SDK is configured with `OPENAI_BASE_URL` pointing at llama.cpp, not OpenAI.
- **Tailwind v4:** Uses the new `@tailwindcss/postcss` pipeline. No `tailwind.config.ts` — config lives in `app/globals.css` via `@theme`.
- **Commit messages:** Describe the *why*, not just the *what*. See the Phase 2 setup commit for the format.

## Current phase

**Phase 2 — Fork + doc setup (in progress).**

Next step is the Drizzle schema swap: drop the vault tables (`resources`, `prompts`, `collections`, `embeddings`, `chat_sessions`, `chat_messages`, `chat_resource_links`) and add the command tables (`tasks`, `runs`, `tool_calls`, `artifacts`, `logs`).

After that: rewrite the landing page as a task input + template picker, wire the Vercel AI SDK to the local `:8081` endpoint, and get the first `pnpm dev` working against the 120 B model.

## Non-negotiable rules

1. **Never change GPU clocks mid-inference.** Always kill the workload first, change clocks, then restart. Use locked clocks: `nvidia-smi -lgc 1933,1933`, never `-lgc 300,1933`.
2. **Don't target >90% VRAM utilization** for production. 89% is the sweet spot for this model — leaves room for concurrent requests, driver fragmentation, and Ollama coexistence.
3. **Never pipe `tmux attach` output or use `Ctrl+c` to leave llama-server.** Always detach with `Ctrl+b` then `d` — Ctrl+c kills the server and forces a 90-second model reload.
4. **All AI calls go through `http://localhost:8081/v1/`.** No direct OpenAI calls, no API keys in source. Cost per token is $0.00 and we keep it that way.
