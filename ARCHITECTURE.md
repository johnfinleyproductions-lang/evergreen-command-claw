# Evergreen Command — Architecture & Operations Reference

**Repo:** `/home/lynf/evergreen-command-claw` on `framerbox395` (user `lynf`)
**Remote:** `github.com/johnfinleyproductions-lang/evergreen-command-claw` (private)
**Last meaningful commit at time of writing:** `e45da02` (Phase 4 + 4.5 landed)

This doc is the source of truth for "how does this thing actually work on this box." When something diverges from here, fix the code or fix the doc — don't let drift pile up.

---

## 0. Common commands

Day-to-day operations, copy-paste ready.

Start the web app (Next.js 15, dev mode, port 3015):

    cd /home/lynf/evergreen-command-claw && npm run dev

Start the worker (uses shell helper that loads `.env.local` and activates the venv):

    run-worker

Start the LLM server (llama.cpp + Nemotron 120B on port 8081):

    run-agent

Or start / stop / inspect the whole stack (web + worker + LLM) via the `evergreen` CLI — see §11:

    evergreen restart          # all three processes, clean
    evergreen status           # what's running, on what ports
    evergreen stop             # graceful shutdown