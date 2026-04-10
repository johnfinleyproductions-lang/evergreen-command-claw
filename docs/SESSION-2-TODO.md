# Evergreen Vault — Remaining Work

**Updated:** March 20, 2026

---

## Immediate Tasks

- [ ] **Re-index Harut masterclass transcript** — Old embeddings still in DB from before VTT parser fix. Go to Library → find the transcript → click Re-index (or delete and re-upload)
- [x] **Re-upload PGA ChatGPT Prompt Library zip** — User confirmed re-uploaded after auto-import feature was built
- [x] **Install adm-zip** — Confirmed installed (`adm-zip@0.5.16`, `@types/adm-zip@0.5.8`)

---

## Phase 5: API + MCP Server (Not Started)

- [ ] REST API endpoints for external agent access to the knowledge base
- [ ] MCP server tools: `search_knowledge`, `get_prompt`, `list_resources`
- [ ] API key authentication for external tools
- [ ] OpenAPI spec / documentation

---

## Phase 6: Migration + Polish (Not Started)

- [ ] **Dashboard** — Wire up real stats (resource count, chunk count, recent activity, storage used)
- [ ] **Collections** — Full CRUD for organizing resources into named groups
- [ ] **Settings page** — Model config, auth settings, storage stats, re-index all
- [ ] **Production deployment** — systemd service, reverse proxy (nginx/caddy), SSL cert
- [ ] **Migrate existing RAG data** — Import from the Python Qdrant-based system (`johnfinleyproductions-lang/RAG`)

---

## Nice-to-Have Improvements

- [ ] Resource preview in Library (click to read content inline)
- [ ] Prompt inline editing (currently read-only after creation)
- [ ] Image extraction from archives (OCR for embedded screenshots)
- [ ] Batch operations in Library (select multiple → bulk delete/re-index)
- [ ] Export prompts as markdown files
- [ ] Chat conversation export (markdown or PDF)
- [ ] Keyboard shortcuts for common actions
- [ ] Mobile-responsive layout improvements
