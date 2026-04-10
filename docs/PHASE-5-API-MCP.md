# Phase 5: REST API + MCP Server

**Date:** March 20, 2026

---

## What Was Built

### 1. REST API (inside Next.js app)

External-facing API endpoints gated by `VAULT_API_KEY` via Bearer token auth.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/search` | POST | Semantic search against the knowledge base |
| `/api/v1/prompts` | GET | List/search prompts with type, tag, and text filters |
| `/api/v1/prompts/:id` | GET | Get a single prompt by UUID |
| `/api/v1/resources` | GET | List resources with type/status/search filters |
| `/api/v1/resources/:id` | GET | Get a single resource with embedding count |

**Auth:** All `/api/v1/*` routes require `Authorization: Bearer <VAULT_API_KEY>` header.

**Examples:**

```bash
# Search the knowledge base
curl -X POST http://lib.local/api/v1/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "newsletter subject line formulas", "topK": 5}'

# List all megaprompts
curl http://lib.local/api/v1/prompts?type=megaprompt \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get a specific prompt
curl http://lib.local/api/v1/prompts/PROMPT_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"

# List ready resources
curl http://lib.local/api/v1/resources?status=ready \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 2. MCP Server (standalone TypeScript)

Lives in `mcp-server/` directory. Queries Postgres directly (no HTTP hop to the Next.js app).

| Tool | Purpose |
|------|---------|
| `vault_search_knowledge` | Semantic search — embeds query via Ollama, progressive similarity search |
| `vault_list_prompts` | List/search prompts with type, tag, and text filters |
| `vault_get_prompt` | Get a prompt by ID or partial title match |
| `vault_list_resources` | List indexed resources with type/status filters |

**Supports two transports:**
- **stdio** — For Claude Code on the Framestation (default, zero config)
- **HTTP** — For remote access from Macs over LAN (port 8020)

---

## New Files

```
lib/auth/api-key.ts              # API key validation (timing-safe)
app/api/v1/search/route.ts       # POST — semantic search
app/api/v1/prompts/route.ts      # GET — list prompts
app/api/v1/prompts/[id]/route.ts # GET — get prompt by ID
app/api/v1/resources/route.ts    # GET — list resources
app/api/v1/resources/[id]/route.ts # GET — get resource by ID
middleware.ts                     # Updated — bypasses cookie auth for /api/v1/*
.mcp.json                        # Claude Code MCP registration
mcp-server/                      # Standalone MCP server
  package.json
  tsconfig.json
  .env.example
  src/
    index.ts                     # Server + 4 tools + transport setup
    db.ts                        # Direct Postgres connection
    embed.ts                     # Ollama embedding client
```

## Modified Files

```
middleware.ts    — Added /api/v1 bypass (5 lines added, 0 removed)
.env.example     — Added VAULT_API_KEY line
```

---

## Setup Instructions

### 1. Generate an API key

```bash
# Generate a random key
openssl rand -hex 32
```

Add to `.env`:
```
VAULT_API_KEY=<the-key-you-generated>
```

### 2. Deploy REST API

The REST API is part of the Next.js app — just restart it:

```bash
cd ~/evergreen-vault && git pull
npm install    # no new deps for the REST API
npm run dev    # or restart your systemd service
```

### 3. Build the MCP Server

```bash
cd ~/evergreen-vault/mcp-server
npm install
npm run build    # outputs to dist/
```

### 4. Register with Claude Code (stdio — local)

The `.mcp.json` in the repo root auto-registers when you open the project in Claude Code.

**Or** add to `~/.claude/mcp.json` for global access:

```json
{
  "mcpServers": {
    "evergreen-vault": {
      "command": "node",
      "args": ["/home/lynf/evergreen-vault/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://vault:YOUR_PASSWORD@192.168.4.240:5432/evergreen_vault",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OLLAMA_EMBEDDING_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

### 5. Run HTTP transport (for remote access from Macs)

```bash
cd ~/evergreen-vault/mcp-server
TRANSPORT=http MCP_PORT=8020 VAULT_API_KEY=your-key \
  DATABASE_URL="postgresql://..." \
  OLLAMA_BASE_URL="http://localhost:11434" \
  node dist/index.js

# Or with PM2 for persistence:
pm2 start dist/index.js --name "vault-mcp" -- \
  --env TRANSPORT=http --env MCP_PORT=8020
```

**Connect Claude Desktop on M4:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "evergreen-vault": {
      "url": "http://192.168.4.240:8020/mcp"
    }
  }
}
```

---

## Quick Reference — Evergreen MCP Fleet

| MCP Server | Machine | Transport | Port |
|---|---|---|---|
| vault-mcp | Framestation 395 | stdio + HTTP | 8020 |
| ncb-mcp | Mac mini M2 | HTTP | 8010 |
| daisyui-mcp | Mac mini M4 | stdio | local |

---

## Architecture Notes

- The REST API and MCP server both query the **same Postgres database**
- The MCP server has its own lightweight DB connection (not Drizzle — raw `postgres` queries)
- The similarity search in the MCP server replicates the exact same progressive threshold logic from `lib/rag/retrieve.ts`
- API key auth uses timing-safe comparison to prevent timing attacks
- The middleware change is additive only — existing cookie auth for the browser UI is untouched
- No new database migrations needed — all reads against existing tables
