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
┌────────────────────────────────────┐      ┌────────────────────────────────────┐
│  Next.js 15 Web UI (App Router)    │      │  Python Worker (evergreenagent)    │
│  ───────────────────────────────   │      │  ───────────────────────────────   │
│  • Task input / template picker    │      │  • Tool registry                   │
│  • Live log stream                 │◄────►│  • Agent loop                      │
│  • Inspector panels                │  PG  │  • llama.cpp client                │
│  • Output viewer                   │      │  • Ollama fallback                 │
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
            ┌─────────────┴──────────────┐
            │   llama.cpp (port :8081)   │  Nemotron-3-Super-120B Q4_K_M
            │   Ollama    (port :11434)  │  Embeddings + small-model fallback
            └────────────────────────────┘
```

**Why two processes?** The Next.js app gives us a premium UI stack we already know (Drizzle, Radix, Tailwind v4, Vercel AI SDK) and matches evergreen-vault byte-for-byte so everything composes. The Python worker preserves the tool registry we already built in evergreenagent — no rewrite, no port. They communicate through shared Postgres tables and an SSE stream for the live log.

---

## Where Everything Lives

A map of the repo after the Phase 2 cleanup. Every path is relative to the repo root (`~/evergreen-command-claw` on the Framestation).

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

- **Python worker** — Phase 3. Will live in a `worker/` subdirectory or as a sibling repo pointing at the same Postgres instance.
- **evergreenagent tool registry** — lives in `~/evergreenagent`, will be ported into the worker.
- **llama.cpp / Ollama** — model servers, not code artifacts. Launched via tmux sessions, config pointed at from `.env.local`.
- **MinIO bucket contents** — runtime artifacts, volume-mounted to `miniodata` in docker-compose.

---

## Dev Environment Quickstart

Everything you need to get this running on the Framestation from a fresh clone.

### 1. Prerequisites

- Node.js 20+ and npm (already on the Framestation)
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

### 6. Launch llama-server (if not already running)

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

### 7. Run the Next.js dev server

```bash
npm run dev
# Open http://localhost:3000 — the minimal landing page
```

### 8. Verify the build still compiles cleanly

```bash
npm run build
# Should compile in ~1-2 seconds with no errors
```

---

## The Stack

Current versions as of 2026-04-10 (post Phase 2 cleanup, verified on disk):

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
- **Python worker** (FastAPI or plain asyncio, TBD) — ports the tool registry from evergreenagent

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

**Fix (if we had wanted to keep it):** Add `"exclude": ["mcp-server/**", "worker/**", ...]` to the root `tsconfig.json` so the subpackage has to be built independently.

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

---

## What's Left To Do

### Phase 3 — Python worker 🔴

1. Port the tool registry from `evergreenagent` into a worker process
2. Wire worker ↔ Postgres: worker polls `runs` table, writes `tool_calls` + `logs`
3. SSE endpoint from Next.js streams `logs` rows to the UI in real time
4. First end-to-end test: the Nvidia lead-research task

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

*Last updated: 2026-04-10. Project state: **Phase 2 complete** — vault nuked, 5-table schema applied, build passing in 1.1 s, dead deps pruned, Postgres TCP routing fixed (host port 5433, drizzle-kit push green). Next: Phase 3 (Python worker + tool registry port from evergreenagent).*
