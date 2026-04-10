# Evergreen Vault

Centralized knowledge base and resource vault with AI-powered search, drag-and-drop ingestion, and MCP server for agent access.

## Architecture

- **Framework**: Next.js 15 App Router + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **Database**: PostgreSQL 17 + pgvector (via Docker)
- **ORM**: Drizzle ORM with drizzle-kit migrations
- **File Storage**: MinIO (S3-compatible, self-hosted)
- **AI**: Vercel AI SDK (`ai` package) with configurable Ollama/OpenAI providers
- **Auth**: Single-user HMAC-SHA256 session cookies
- **Package Manager**: pnpm

## Infrastructure

- **Framestation 395** (GPU box): 192.168.4.240
  - Ollama: port 11434 (default model: qwen3.5:9b)
  - MinIO: port 9000 (console: 9001)
  - PostgreSQL: port 5432
  - Embedding model: nomic-embed-text (768 dimensions)

## Project Structure

```
app/
  (vault)/          # Authenticated route group
    layout.tsx      # Sidebar + Header shell
    dashboard/      # Overview stats
    library/        # Resource management (upload, browse, search)
    prompts/        # Prompt management (system, mega, template, chain)
    collections/    # Grouped resources + prompts
    librarian/      # RAG-powered chat
    settings/       # Config (models, storage, auth)
  login/            # Auth page
  api/
    auth/           # Login/logout endpoints
    resources/      # CRUD + upload + vectorize
    chat/           # Streaming chat with retrieval
components/
  layout/           # Sidebar, Header
  ui/               # shadcn/ui components
lib/
  auth/             # HMAC-SHA256 session management
  db/
    client.ts       # Drizzle + postgres.js (lazy singleton)
    schema/         # All table definitions
  rag/              # Chunking, embedding, retrieval, citations
  storage/          # MinIO S3 client
  utils/            # cn(), helpers
```

## Key Patterns

- **Server -> Client**: page.tsx fetches data, passes to client.tsx for interactivity
- **Lazy DB**: Proxy-based singleton initialization (same as evergreen-os)
- **Configurable Embeddings**: EMBEDDING_PROVIDER env switches between ollama/openai
- **Content Hashing**: SHA-256 hash of file content to skip re-ingestion of duplicates
- **Chunking**: 1000 chars, 200 overlap, paragraph-boundary-aware splitting
- **Progressive Retrieval**: Cosine similarity with threshold relaxation for sparse results

## Database Schema

- `resources` — Files/documents with type, index status, content hash, tags
- `prompts` — System prompts, megaprompts, templates, chains with variables
- `collections` — Named groups linking to resources and prompts
- `embeddings` — Vector chunks with pgvector (768-dim default)
- `chat_sessions` / `chat_messages` — Librarian conversations with citations
- `chat_resource_links` — Which resources are attached to a chat session

## Commands

```bash
# Development
pnpm dev              # Start dev server (turbopack)
pnpm build            # Production build
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema directly (dev)
pnpm db:studio        # Open Drizzle Studio

# Infrastructure
docker compose up -d  # Start Postgres + MinIO
docker compose down   # Stop services
```

## Environment Variables

See `.env.example` for all required variables.
