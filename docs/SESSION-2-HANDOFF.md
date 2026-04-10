# Evergreen Vault — Session 2 Handoff

**Date:** March 20, 2026

---

## Infrastructure Reference

| Component | Detail |
|-----------|--------|
| **Server** | Framestation 395 — Arch Linux, user `lynf`, IP `192.168.4.240` |
| **Dev Port** | `3010` (port 3000 is taken by Open WebUI Docker) |
| **Local Domain** | `lib.local` → `192.168.4.240:3010` via LocalCan |
| **PostgreSQL** | Port `5432` via Docker, with pgvector extension |
| **MinIO** | Port `9000` (API) / `9001` (console) via Docker |
| **Ollama** | `localhost:11434` — **must be localhost, NOT 192.168.4.240** (loopback only) |
| **Embedding Model** | `nomic-embed-text` (768 dimensions) |
| **Chat Model** | `qwen3.5:9b` (default, switchable in UI) |
| **Stack** | Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM |
| **GitHub** | `johnfinleyproductions-lang/evergreen-vault` (private) |

### Key Environment Variables (.env)

```
DATABASE_URL=postgresql://...
MINIO_ENDPOINT=http://192.168.4.240:9000
MINIO_ACCESS_KEY=... / MINIO_SECRET_KEY=...
MINIO_BUCKET=evergreen-vault
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=qwen3.5:9b
AUTH_SECRET=... (HMAC key)
AUTH_PASSWORD=... (login password)
```

### Deployment Commands

```bash
cd ~/evergreen-vault && git pull
npm install    # only if new deps were added
npm run dev    # starts on port 3010
```

---

## Completed Phases

### Phase 1: Foundation ✅
- Next.js 15 App Router scaffold with TypeScript + Tailwind v4
- Drizzle ORM schema: resources, prompts, collections, chat sessions/messages, embeddings (pgvector)
- Docker Compose: PostgreSQL 17 + pgvector, MinIO
- HMAC-SHA256 single-user session auth with middleware (cookie-based, 30-day expiry)
- MinIO S3 client for file storage
- App shell: sidebar nav, header, dark theme, 6 page stubs

### Phase 2: RAG Pipeline ✅
- Text extraction: PDF (pdfjs-dist), DOCX (mammoth), Markdown/HTML/Code (UTF-8), VTT/SRT transcripts
- Chunking: 1000 chars, 200 overlap, paragraph/line/word boundary-aware
- Embedding: Ollama nomic-embed-text (768 dims) with OpenAI fallback
- Ingestion orchestrator: extract → chunk → embed → store with content hashing for dedup
- Retrieval: cosine similarity with progressive threshold relaxation (0.7 → 0.6 → 0.5 → 0.4)
- Upload API + Library UI with drag-and-drop, status badges, re-index, delete

### Phase 3: Prompts Page ✅ (Session 2)
- Prompts API: full CRUD (GET/POST/PUT/DELETE) at `/api/prompts`
- Bulk import API at `/api/prompts/import`
- Prompts page UI: expandable cards, markdown rendering, one-click copy
- Search bar: real-time full-text search across titles, content, descriptions, tags
- Type filters: All, System Prompts, Megaprompts, Templates, Chains
- Tag bar: clickable tags derived from all prompts, filter by category
- Create new prompt form: title, content, type selector, comma-separated tags
- Import panel: upload .md/.txt files directly as prompts
- Auto-import from zip archives: markdown files with prompt/ChatGPT patterns auto-create Prompt records with smart tags

### Phase 4: Librarian Chat ✅
- Chat API streams from Ollama with RAG context injection via SSE
- Progressive similarity search retrieves relevant chunks from knowledge base
- Model selector: Qwen 3.5, Llama 3.1, Gemma 3, Mistral, DeepSeek R1
- Citations panel: per-message expandable sources with similarity %, quotes
- Chat history sidebar: load, delete past sessions
- Messages persisted to Postgres with citation metadata
- Markdown rendering for responses (code blocks, headers, lists, bold, inline code)

### Zip/Archive Import ✅ (Session 2)
- `lib/rag/extract-zip.ts`: extracts indexable files from zip archives
- Handles nested zips (Notion exports: outer.zip → inner.zip → files)
- Cleans Notion-style filenames (strips 32-char hex hash IDs)
- Filters to indexable types: md, pdf, csv, txt, code, vtt, srt, etc.
- Skips images, hidden files, OS metadata (`__MACOSX`)
- Detects zips by extension + magic bytes (`PK\x03\x04` header)
- Original zip preserved in MinIO under `archives/` for reference

---

## File Map

### App Routes
| Path | File | Purpose |
|------|------|---------|
| `/` | `app/(vault)/dashboard/page.tsx` | Dashboard (stats placeholder) |
| `/library` | `app/(vault)/library/page.tsx` + `client.tsx` | File upload, browse, re-index |
| `/chat` | `app/(vault)/chat/page.tsx` + `client.tsx` | Librarian AI chat |
| `/prompts` | `app/(vault)/prompts/page.tsx` + `client.tsx` | Prompt manager |
| `/collections` | `app/(vault)/collections/page.tsx` | Stub — not built yet |
| `/settings` | `app/(vault)/settings/page.tsx` | Stub — not built yet |

### API Routes
| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /api/resources/upload` | `app/api/resources/upload/route.ts` | File + zip upload, auto-prompt import |
| `POST /api/resources/vectorize` | `app/api/resources/vectorize/route.ts` | Chunk + embed a resource |
| `GET/DELETE /api/resources/[id]` | `app/api/resources/[id]/route.ts` | Resource CRUD |
| `POST /api/chat` | `app/api/chat/route.ts` | SSE streaming chat with RAG |
| `GET/POST/PUT/DELETE /api/prompts` | `app/api/prompts/route.ts` | Prompts CRUD |
| `POST /api/prompts/import` | `app/api/prompts/import/route.ts` | Bulk prompt import |
| `GET/POST /api/chat/sessions` | `app/api/chat/sessions/route.ts` | Chat session management |
| `POST /api/auth/login` | `app/api/auth/login/route.ts` | Authentication |

### Core Libraries
| File | Purpose |
|------|---------|
| `lib/rag/ingest.ts` | Ingestion orchestrator (extract → chunk → embed → store) |
| `lib/rag/extract.ts` | Text extraction (PDF, DOCX, MD, VTT, code) |
| `lib/rag/extract-zip.ts` | ZIP archive extraction with nested zip + Notion cleanup |
| `lib/rag/chunk.ts` | Text chunking (1000 chars, 200 overlap) |
| `lib/rag/embed.ts` | Ollama embedding client (768 dims) |
| `lib/rag/retrieve.ts` | Similarity search with progressive threshold |
| `lib/db/schema/` | Drizzle schema (resources, prompts, collections, embeddings, chat) |
| `lib/s3.ts` | MinIO client |
| `lib/auth.ts` | HMAC-SHA256 session auth |
