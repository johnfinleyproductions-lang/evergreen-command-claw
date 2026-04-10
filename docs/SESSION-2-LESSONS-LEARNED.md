# Session 2 — Lessons Learned & Pitfalls

**Date:** March 20, 2026

This document captures every bug, failed approach, and gotcha discovered during Session 2 so future sessions don't repeat them.

---

## Bug #1: Next.js Body Size Limits (Two Separate Settings!)

**Symptom:** Uploading large PDFs or zip files failed with `Request body exceeded 10MB`.

**What we tried first (WRONG):**
```typescript
// next.config.ts
experimental: {
  serverActions: {
    bodySizeLimit: "100mb"
  }
}
```
This only applies to **Server Actions** — NOT Route Handlers (`app/api/*/route.ts`).

**What actually fixed it:**
```typescript
// next.config.ts
experimental: {
  serverActions: {
    bodySizeLimit: "100mb",
  },
  middlewareClientMaxBodySize: "100mb",  // <-- THIS is for Route Handlers
}
```

**Key lesson:** Next.js has TWO separate body size configs:
- `serverActions.bodySizeLimit` → Server Actions only
- `middlewareClientMaxBodySize` → Middleware / Route Handlers (this is the one that was truncating our uploads)

The error message itself pointed to the fix URL — read the full error next time.

---

## Bug #2: Notion Filename Regex Mangled by GitHub Push

**Symptom:** Files extracted from Notion zip archives still had 32-char hex hash IDs in their names (e.g., `My Prompt a1b2c3d4e5f6...89.md` instead of `My Prompt.md`).

**Root cause:** The regex `\s+[a-f0-9]{32}(\.\w+)$` used `\w+` which, when serialized to JSON for the GitHub `push_files` API, became double-escaped (`\\.+`), breaking the pattern.

**Fix:** Replaced `\w+` with `[a-zA-Z0-9]+` character class:
```typescript
const hashPattern = /\s+[a-f0-9]{32}(\.[a-zA-Z0-9]+)$/;
```

**Key lesson:** When pushing code via GitHub API (JSON body), avoid regex shortcuts like `\w`, `\d`, `\s` in string literals — they get double-escaped. Use explicit character classes `[a-zA-Z0-9]` instead.

---

## Bug #3: Librarian Returning Stale Transcript Content

**Symptom:** After fixing the VTT parser, the Librarian still returned old minimal content ("See you" snippet from Harut masterclass).

**Root cause:** Deploying new parser code doesn't re-process existing data. The old embeddings (created with the buggy parser) were still in the database. The similarity search found those stale chunks.

**Fix:** Re-index the resource via the Library UI (click Re-index button) or delete and re-upload.

**Key lesson:** When you fix an extraction/parsing bug, you must re-index affected resources. New code only applies to NEW uploads unless you explicitly re-process.

---

## Bug #4: Zip Upload Failing Despite serverActions Fix

**Symptom:** After fixing the body size limit for PDFs, zip upload still failed with `TypeError: Failed to parse body as FormData. [cause]: TypeError: expected boundary after body`.

**Root cause:** Same as Bug #1 — the middleware was truncating the request body at 10MB, so by the time it reached the Route Handler, the multipart boundary marker was chopped off. `formData()` couldn't parse a truncated body.

**Fix:** Same as Bug #1 — `middlewareClientMaxBodySize: "100mb"`.

---

## Pitfall #5: Ollama Loopback Only

**Symptom (from Session 1):** Ollama requests failed when using `192.168.4.240:11434`.

**Root cause:** Ollama binds to `127.0.0.1` by default, not `0.0.0.0`.

**Fix:** Always use `OLLAMA_BASE_URL=http://localhost:11434` in `.env`. Since the Next.js app runs on the same box, localhost works fine.

---

## Pitfall #6: Postgres Array Syntax in Drizzle

**What doesn't work:**
```typescript
// JS array directly in SQL template
sql`WHERE resource_id = ANY(${resourceIds})`
```

**What works:**
```typescript
const pgArray = `{${resourceIds.join(",")}}`;
sql`WHERE resource_id = ANY(${pgArray}::uuid[])`
```

Drizzle's `sql` template doesn't auto-convert JS arrays to Postgres array literals. You must format them as `{uuid1,uuid2}` and cast with `::uuid[]`.

---

## Pitfall #7: Port 3000 Is Taken

Open WebUI runs on port 3000 via Docker on Framestation. Evergreen Vault uses **port 3010**. This is configured in `package.json` scripts:
```json
"dev": "next dev --port 3010"
```

---

## Pitfall #8: adm-zip as External Package

`adm-zip` must be in `serverExternalPackages` in `next.config.ts` or Next.js bundler will fail to compile it:
```typescript
serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "mammoth", "adm-zip"]
```

---

## Technical Patterns Worth Knowing

### SSE Streaming from Ollama
Ollama returns NDJSON (one JSON object per line). The chat route uses `TransformStream` to convert each line to SSE format (`data: {content}\n\n`). The final event includes sources and sessionId when `parsed.done === true`.

### Progressive Similarity Threshold
Retrieval tries cosine similarity at 0.7, then relaxes to 0.6, 0.5, 0.4 if not enough results are found. This prevents empty results on vague queries while still preferring high-confidence matches.

### VTT Transcript Parsing
Strips WEBVTT header, timestamps, and cue numbers. Deduplicates consecutive repeated/extended lines (common in live transcription where the service self-corrects as it processes speech).

### Auto-Prompt Detection Heuristic
`looksLikePrompt()` checks: filename contains "prompt" or "chatgpt", OR content has code blocks + AI instruction patterns ("you are", "I want you to", "act as", "step 1:", "your task").

### Auto-Tag From Filename
`autoTagFromFilename()` detects: `[BONUS]`, `[PGA]`, ChatGPT, hook, headline, voice, email, landing page, outline, niche — and applies matching tags to imported prompts.
