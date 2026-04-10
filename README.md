# Evergreen Command

**A local AI task runner for the Framestation.**
Bring-your-own-GPU agentic workflows — no API tokens, no cloud round-trips, no per-token billing. One prompt in, a structured task run out, with every tool call, model thought, and artifact saved to Postgres.

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Hardware Target: The Framestation](#hardware-target-the-framestation)
3. [Architecture Overview](#architecture-overview)
4. [The Stack](#the-stack)
5. [Why We Chose What We Chose](#why-we-chose-what-we-chose)
6. [Pre-Research Findings](#pre-research-findings)
7. [Lessons Learned](#lessons-learned)
8. [What's Been Done So Far](#whats-been-done-so-far)
9. [What's Left To Do](#whats-left-to-do)
10. [Phase 5+ Ideas (Parked)](#phase-5-ideas-parked)
11. [Open Questions](#open-questions)
12. [Reference Commands](#reference-commands)

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

## The Stack

Inherited from evergreen-vault (confirmed via GitHub API read of `package.json`):

- **Next.js 15.3.2** with Turbopack
- **App Router** (not Pages Router)
- **Drizzle ORM 0.45.1** + **drizzle-kit 0.31.1**
- **postgres.js 3.4.8**
- **Tailwind CSS v4** + `@tailwindcss/postcss`
- **Radix UI** full set
- **Vercel AI SDK** (`ai` 6.0.116 + `@ai-sdk/openai` 1.3.22) — talks directly to llama.cpp's OpenAI-compatible endpoint
- **middleware.ts** for auth/routing
- **docker-compose.yml** for local Postgres
- **mammoth** + **pdfjs-dist** for file parsing (inherited from vault, useful here too)

Added for Command:

- **llama.cpp** (built from source with CUDA) serving `Nemotron-3-Super-120B-A12B Q4_K_M` on port `:8081`
- **Ollama** (already running) for `nomic-embed-text` embeddings and small-model fallback
- **Python worker** (FastAPI or plain asyncio, TBD) — ports the tool registry from evergreenagent

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

### Phase 1 launch ✅
- [x] Stopped `voxstation_voice` Docker container (freed 8.8 GB VRAM)
- [x] Locked GPU clocks at 1933 MHz
- [x] Launched llama-server in detached tmux
- [x] Tuned layers and CPU flags
- [x] Recorded 12.96 tok/s production baseline at 26 layers + threads 32 + flash-attn on
- [x] Verified inference via curl Paris test

### Repo seeding ✅
- [x] GitHub repo created: `johnfinleyproductions-lang/evergreen-command-claw`
- [x] Forked evergreen-vault as clean base (single initial commit, no history)
- [x] Phase 2 docs + endpoint wiring committed

---

## What's Left To Do

### Phase 1 — Launch llama-server ✅ DONE

**Production config (locked): `--n-gpu-layers 26 --threads 32 --flash-attn on --ctx-size 8192`**

Final baseline (2026-04-09, measured):

| Metric | Value |
|---|---|
| Generation speed | **12.96 tok/s** |
| Prompt processing | **28.74 tok/s** |
| VRAM used | 28,998 / 32,623 MiB (~89%) |
| VRAM headroom | 3.6 GB |
| GPU clocks | 1933 MHz (locked) |
| Power draw | 33 W / 186 W (CPU-bottlenecked on MoE dispatch) |
| Temp | 26 °C |
| Endpoint | `http://localhost:8081/v1/` (OpenAI-compatible) |

**Launch command for restarts (production):**
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

Run `sudo nvidia-smi -pm 1 && sudo nvidia-smi -lgc 1933,1933` before launch if clocks aren't already locked.

### Phase 2 — Fork evergreen-vault into evergreen-command 🟡 IN PROGRESS

1. [x] Fork `evergreen-vault` → `evergreen-command-claw` (clean, no history)
2. [x] Overwrite README.md + CLAUDE.md with Command-specific docs
3. [x] Update `.env.example` to point at local llama-server on :8081
4. [ ] Swap `drizzle` schema: drop vault tables, add `tasks`, `runs`, `tool_calls`, `artifacts`, `logs`
5. [ ] Rewrite landing page to the task input / template picker from the mockup
6. [ ] Wire the Vercel AI SDK to the local llama.cpp endpoint
7. [ ] Update `FramestationAgent` `config.py` to point at `:8081` as the heavy model
8. [ ] First `npm install && npm run dev` against the local 120 B model

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

---

*Last updated: 2026-04-09. Project state: **Phase 2 in progress** — repo forked, docs committed, endpoint wiring in place. Next: schema swap + first `npm run dev` against the local 120 B model.*
