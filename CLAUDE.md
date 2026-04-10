# Evergreen Command

Local AI task runner. Next.js 15 App Router web UI + Python worker (Phase 3), both talking to a local llama.cpp server hosting Nemotron-3-Super-120B on the Framestation. Zero cloud dependency, zero per-token cost.

**First-read orientation for any AI session.** For full project history, architecture rationale, lessons learned, the Phase 1 tuning journey, and the complete directory map, read `README.md` in the repo root.

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
- **Postgres** (docker compose, port `:5432`) — tables: `tasks`, `runs`, `tool_calls`, `artifacts`, `logs`
- **llama.cpp on :8081** — heavy-lifting 120 B model (OpenAI-compatible API)
- **Ollama on :11434** — embeddings (`nomic-embed-text`) + small-model fallback
- **MinIO** (docker compose, ports `:9010` S3 / `:9011` console — **not 9000/9001**, those are claimed by evergreen-vault-minio)

The Next.js app streams live log rows to the UI via SSE. The worker writes to Postgres; the web UI reads from Postgres.

## Stack

Verified current as of 2026-04-10 (post Phase 2 cleanup):

- **Next.js 15.5.15** App Router + Turbopack
- **React 19.1** + React DOM 19.1
- **TypeScript 5.8** everywhere
- **Drizzle ORM 0.45.2** + **drizzle-kit 0.31.10** ⚠️ *(see silent-migrate bug below)*
- **postgres.js 3.4.8** driver (lazy singleton via Proxy in `lib/db/client.ts`)
- **Tailwind CSS v4** + `@tailwindcss/postcss` (no `tailwind.config.ts` — config lives in `app/globals.css` via `@theme`)
- **Radix UI** (dialog, dropdown, scroll-area, select, separator, slot, tabs, toast, tooltip)
- **Vercel AI SDK** (`ai` 6.0.116 + `@ai-sdk/openai` 1.3.22) — points at local llama.cpp via `OPENAI_BASE_URL`
- **HMAC-SHA256 session auth** in `lib/auth/` (single-user, cookie-gated)
- **Middleware** at `middleware.ts` for route protection
- **Package manager:** **npm** (not pnpm — the repo has a `package-lock.json`, always `npm install` / `npm run`)

## Project structure (post-Phase-2 actual state)

```
app/
  layout.tsx          Root HTML + "Evergreen Command" metadata
  page.tsx            Minimal landing page (Phase 4 will replace)
  login/page.tsx      HMAC single-password login → redirects to /
  api/
    auth/login/route.ts   POST { password } → sets httpOnly session cookie
lib/
  auth/
    api-key.ts        Pure crypto helpers for REST API key check
    session.ts        HMAC cookie login/verify (next/headers)
  db/
    client.ts         Drizzle + postgres.js lazy-singleton Proxy
    schema/
      index.ts        Barrel export
      tasks.ts        Task templates (10 cols, 0 FKs)
      runs.ts         Execution records (14 cols, 1 FK → tasks)
      toolCalls.ts    Per-step tool invocations (10 cols, 1 FK → runs)
      artifacts.ts    File refs (9 cols, 1 FK → runs)
      logs.ts         Streaming log entries (6 cols, 1 index, 1 FK → runs)
drizzle/
  0000_complete_bucky.sql   Generated CREATE TABLE SQL
  meta/
    _journal.json     Drizzle-kit migration journal (gitignored)
    0000_snapshot.json  Schema snapshot for next generate
middleware.ts         Cookie gate: unauth → /login (except /login + /api/auth/*)
drizzle.config.ts     Points at ./lib/db/schema/index.ts, out: ./drizzle
docker-compose.yml    Postgres (:5432) + MinIO (:9010/:9011)
next.config.ts        Next.js config (mostly defaults)
tsconfig.json         Include **/*.ts, **/*.tsx
postcss.config.mjs    Tailwind v4 PostCSS
.env.example          All env vars documented — copy to .env.local
```

**Deleted in Phase 2** (do not reference in new code):
- `app/(vault)/*` — entire vault UI tree (12 files)
- `app/api/{automations,chat,collections,course-content,dashboard,links,make,prompts,resources,v1}/*` — vault API (25 files)
- `lib/rag/*` — vault RAG pipeline (8 files)
- `lib/storage/minio.ts` — vault MinIO wrapper
- `components/layout/{sidebar,header}.tsx` — orphaned vault chrome
- `mcp-server/*` — vault-specific MCP server subpackage (5 files)

## Commands

```bash
# Development
npm install           # first time setup (use npm, not pnpm)
npm run dev           # Start Next.js dev server (Turbopack) on :3000
npm run build         # Production build (currently ~2.4s clean)
npm run lint          # Run Next.js linter

# Database (use push, not migrate — see drizzle-kit bug note below)
set -a && source .env.local && set +a   # export env vars for drizzle CLI
npm run db:generate   # Generate migration SQL from schema changes
npm run db:push       # ✅ PRIMARY: sync schema → DB directly (solo-dev friendly)
npm run db:migrate    # ⚠️ BROKEN on drizzle-kit 0.31.10 — silent exit code 1
npm run db:studio     # Drizzle Studio browser UI

# Infrastructure
docker compose up -d postgres    # Phase 2+: just Postgres
docker compose up -d             # Phase 4+: Postgres + MinIO
docker compose ps                # Check health
docker compose down              # Stop (keeps volumes)
docker compose down -v           # Stop and WIPE VOLUMES (destructive)

# Postgres via docker exec (no native psql on the Framestation)
docker exec -it evergreen-command-db psql -U command -d evergreen_command -c "\dt"
docker exec -i  evergreen-command-db psql -U command -d evergreen_command < some.sql
```

## The drizzle-kit silent migrate bug

**Symptom:** `npm run db:migrate` prints `Using 'postgres' driver for database querying` and silently exits with code 1. No applied-migration list, no error, no traceback. `\dt` afterwards shows no tables were created.

**Version affected:** drizzle-kit 0.31.10 (the current latest on npm as of 2026-04-10) + drizzle-orm 0.45.2 + postgres.js 3.4.8 on Postgres 17.9.

**Workaround 1 (preferred — use `push` instead of `migrate`):**

For a single-developer project, `drizzle-kit push` is strictly simpler than migrate. It syncs the schema directly into the database without needing a migration file or a `__drizzle_migrations` tracking table. Use this for all schema changes going forward:

```bash
set -a && source .env.local && set +a && npm run db:push
```

Push is the correct tool for this project. Migrate is for teams that need reviewable migration files in git; we don't.

**Workaround 2 (fallback — direct SQL apply):**

If you need to apply a specific generated migration file explicitly:

```bash
docker exec -i evergreen-command-db psql -U command -d evergreen_command < drizzle/0000_complete_bucky.sql
```

This is what we used for the initial Phase 2 schema bootstrap.

## Conventions

- **Server → client boundary:** Server components (`page.tsx`) fetch data and pass it to client components (`*-client.tsx`) for interactivity. Don't mark pages as `"use client"` unnecessarily.
- **Lazy DB client:** `lib/db/client.ts` uses a Proxy singleton — never instantiate Drizzle eagerly. The proxy handles the first access and caches the postgres.js client.
- **No OpenAI cloud calls:** Everything routes through `http://localhost:8081/v1/`. The Vercel AI SDK is configured with `OPENAI_BASE_URL` pointing at llama.cpp, not OpenAI. Never add `api.openai.com` to any code path.
- **Tailwind v4:** No `tailwind.config.ts`. All config lives in `app/globals.css` via `@theme`. PostCSS plugin is `@tailwindcss/postcss`.
- **Commit messages:** Describe the *why*, not just the *what*. Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- **Env vars for CLI tools:** Next.js auto-loads `.env.local`. Drizzle-kit does **not**. Prefix any drizzle-kit command with `set -a && source .env.local && set +a &&` so the URL gets exported to the child process.

## Current phase

**Phase 2 — Vault nuke + schema swap: COMPLETE ✅**

- 48 vault-era files deleted
- 3 files rewritten (layout, page, login)
- New 5-table schema generated and applied to Postgres
- `npm run build` passes cleanly in 2.4s (6 static pages, 4 routes, 33.3 kB middleware)
- docker-compose.yml rebranded + MinIO moved to :9010/:9011 to avoid collision with evergreen-vault-minio
- 6 dead vault-era deps pruned from package.json

**Phase 3 — Python worker (next):** Port the tool registry from `~/evergreenagent` into a worker process that polls the `runs` table, executes tool calls against llama.cpp, writes `tool_calls` + `logs` + `artifacts` rows, and exposes an SSE stream for the web UI to tail.

**Phase 4 — UI polish:** Rebuild the mockup into real React components on top of the minimal landing page. Bring up MinIO (`docker compose up -d minio`) and wire artifact uploads.

## Non-negotiable rules

1. **Never change GPU clocks mid-inference.** Always kill the workload first, change clocks, then restart. Use locked clocks: `nvidia-smi -lgc 1933,1933`, never `-lgc 300,1933`.
2. **Don't target >90% VRAM utilization** for production. 89% is the sweet spot for this model — leaves room for concurrent requests, driver fragmentation, and Ollama coexistence.
3. **Never pipe `tmux attach` output or use `Ctrl+c` to leave llama-server.** Always detach with `Ctrl+b` then `d` — Ctrl+c kills the server and forces a 90-second model reload.
4. **All AI calls go through `http://localhost:8081/v1/`.** No direct OpenAI calls, no API keys in source. Cost per token is $0.00 and we keep it that way.
5. **Never reuse a port owned by another project without checking first.** Run `ss -tlnp | grep :<port>` and `docker ps -a | grep <service>` before committing any new port binding in `docker-compose.yml`. The Framestation runs multiple coexisting projects (evergreen-vault, VoxStation, videostar); colliding with their ports will break their services without warning. Evergreen Command's MinIO moved from `:9000/:9001` to `:9010/:9011` for exactly this reason.
6. **Use `npm`, not `pnpm`.** This repo has a `package-lock.json`; pnpm commands will generate a competing lock file and cause install drift.
7. **Use `db:push`, not `db:migrate`.** Drizzle-kit 0.31.10 has a silent migrate bug. Push is the correct primary workflow for this solo-developer project.
