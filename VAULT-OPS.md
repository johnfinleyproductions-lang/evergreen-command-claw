# Evergreen Vault — Operations Guide

> **READ THIS FIRST.** This document is the single source of truth for how the Evergreen Vault works, how to deploy changes, and what NOT to do. Any Claude session working with the vault (via skills, direct coding, or troubleshooting) MUST follow these rules.

---

## 1. Architecture

| Component | Detail |
|-----------|--------|
| **App** | Next.js 15 (App Router) + TypeScript |
| **Database** | PostgreSQL 17 + pgvector in Docker (`evergreen-vault-db`) |
| **File Storage** | MinIO (S3-compatible) in Docker (`evergreen-vault-minio`) |
| **ORM** | Drizzle ORM |
| **Host** | Framestation at `192.168.4.240` |
| **Port** | `3010` (NOT 3000) |
| **URL** | `http://192.168.4.240:3010` |
| **Auth** | Single password → HMAC-SHA256 `ev-session` cookie |
| **GitHub** | `johnfinleyproductions-lang/evergreen-vault` |
| **Mode** | **PRODUCTION** (`npm run build` + `npm start -- -p 3010`) |

---

## 2. Content Types (Current)

| Type | Schema File | Page Route | API Route | Migration |
|------|------------|------------|-----------|----------|
| Resources | `lib/db/schema/resources.ts` | `/library` | `/api/resources` | (init) |
| Prompts | `lib/db/schema/prompts.ts` | `/prompts` | `/api/prompts` | (init) |
| Collections | `lib/db/schema/collections.ts` | `/collections` | `/api/collections` | (init) |
| Automations | `lib/db/schema/automations.ts` | `/automations` | `/api/automations` | `0001_add_automations.sql` |
| Course Content | `lib/db/schema/courseContent.ts` | `/course-content` | `/api/course-content` | `0003_add_course_content.sql` |
| Make Blueprints | `lib/db/schema/makeBlueprints.ts` | `/make` | `/api/make` | `0004_add_make_blueprints.sql` |
| Links | `lib/db/schema/links.ts` | `/links` | `/api/links` | `0005_add_links.sql` |
| Chat | `lib/db/schema/chat.ts` | `/librarian` | `/api/chat` | (init) |
| Embeddings | `lib/db/schema/embeddings.ts` | — | — | (init) |

---

## 3. Deployment Rules

### 3.1 ALWAYS use production mode

The vault runs in **production mode**. Do NOT suggest or use `npm run dev` as an alternative. The user wants a production build. Period.

### 3.2 The correct deployment sequence

When code changes are pushed to GitHub (new features, new content types, bug fixes), the user runs this on the Framestation:

```bash
cd ~/evergreen-vault && git pull
```

If there is a NEW migration file (check the `drizzle/` folder):

```bash
docker exec -i evergreen-vault-db psql -U vault evergreen_vault < drizzle/XXXX_migration_name.sql
```

Then rebuild and restart:

```bash
kill $(lsof -t -i:3010) 2>/dev/null; rm -rf .next && npm run build && npm start -- -p 3010
```

**IMPORTANT:** If nothing is running on port 3010, the `kill` command will print an error — that's fine, ignore it. The `npm start` will still run.

### 3.3 Migration MUST run BEFORE the build

If a new content type was added (new schema + new API route), the migration MUST be applied to the database BEFORE `npm run build`. Otherwise the app will start but the API endpoints will return errors because the table doesn't exist.

**Order matters:**
1. `git pull` (get the code)
2. Run migration SQL (create the table)
3. `npm run build` (compile the app)
4. `npm start -- -p 3010` (serve it)

NEVER skip step 2. NEVER reverse steps 2 and 3.

---

## 4. Critical Build Rules

### 4.1 Server components with DB queries MUST be dynamic

Any `page.tsx` that calls `await db.select(...)` or any other Drizzle query directly (i.e., a server component) MUST include:

```typescript
export const dynamic = "force-dynamic";
```

**Why:** During `npm run build`, Next.js tries to pre-render (statically generate) every page. If a page makes a database query, the build process opens a DB connection and waits. If the connection pool stalls, the entire build hangs forever — no error, no timeout, just frozen.

Adding `force-dynamic` tells Next.js to skip pre-rendering that page and render it on each request instead.

**Currently affected pages:**
- `app/(vault)/dashboard/page.tsx` — has `export const dynamic = "force-dynamic"` (ALREADY FIXED)

**If you create a new page that queries the database on the server side, you MUST add this line.** The safer pattern is to use a client component (`"use client"`) that fetches from an API route via `useEffect` — this is what every other page in the vault does and it's the preferred pattern.

### 4.2 Preferred page architecture

```
page.tsx         → Simple server component, just renders <ClientComponent />
client.tsx       → "use client" component that fetches from /api/xxx via useEffect
/api/xxx/route.ts → API route that queries the database
```

This pattern means:
- Pages pre-render as empty shells during build (fast, no DB needed)
- Data loads client-side at runtime (always fresh, no build issues)
- All existing vault pages follow this pattern EXCEPT the dashboard (which was fixed with force-dynamic)

### 4.3 The next.config.ts settings

These settings exist and MUST be kept:

```typescript
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```

These are intentional — the vault has some loose types from rapid development. Removing these will cause the build to fail on type errors that don't affect runtime.

---

## 5. Adding a New Content Type

When ingesting a new kind of content (e.g., "video scripts", "cheat sheets"), follow this exact checklist:

### Step 1: Schema
Create `lib/db/schema/{type}.ts` following the pattern in existing schemas (automations.ts, links.ts).

### Step 2: Export from index
Add `export * from "./{type}";` to `lib/db/schema/index.ts`.

### Step 3: Migration
Create `drizzle/XXXX_{description}.sql` with the SQL to create the table. Use the next number in sequence (currently the next one would be `0006_*.sql`).

The SQL should use `IF NOT EXISTS` for safety:

```sql
CREATE TABLE IF NOT EXISTS {table_name} (
  ...
);
```

### Step 4: API route
Create `app/api/{type}/route.ts` with GET (list/search) and POST (create) handlers. Follow the pattern in `/api/links/route.ts` or `/api/automations/route.ts`.

### Step 5: UI page
Create `app/(vault)/{type}/page.tsx` and `app/(vault)/{type}/client.tsx`.

- `page.tsx` should be a simple wrapper that renders the client component
- `client.tsx` should be `"use client"` and fetch from the API route
- **DO NOT** put database queries directly in `page.tsx`

### Step 6: Sidebar link
Add the new page to `components/layout/sidebar.tsx`.

### Step 7: Dashboard import (if needed)
If the dashboard should show stats for this type, update `app/(vault)/dashboard/page.tsx` and its client component.

### Step 8: Push and deploy
Push all files to GitHub, then give the user the deployment commands (see Section 3.2).

---

## 6. Uploading Data to the Vault

### 6.1 The Cowork VM CANNOT reach the vault

The Cowork VM (where Claude runs) is sandboxed and cannot reach `192.168.4.240` or any LAN host. This means you CANNOT use `fetch("http://192.168.4.240:3010/api/...")` from Bash or Python.

### 6.2 Two ways to upload data

**Method A: Browser JS injection (PREFERRED)**

Execute JavaScript in the Chrome tab that's viewing the vault. The browser IS on the user's network and CAN reach the vault. Use `mcp__Claude_in_Chrome__javascript_tool` to run fetch calls against the vault API from the browser context.

```javascript
(async () => {
  const res = await fetch('/api/{type}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ /* data */ })
  });
  return await res.json();
})()
```

This works because:
- The browser tab is already on `http://192.168.4.240:3010` (same origin)
- The session cookie is already set
- No CORS issues
- Good for JSON payloads under ~50KB per request

For bulk uploads, batch into chunks of 10-20 items per request to avoid overwhelming the browser.

**Method B: Node.js script on the Framestation**

For large binary files or very large datasets, write a `.mjs` script to the user's Downloads folder and have them run it on their Framestation. The Framestation can reach itself at localhost:3010.

```javascript
// Save as upload-{type}.mjs
const items = [ /* data */ ];
for (const item of items) {
  const res = await fetch('http://localhost:3010/api/{type}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
  console.log(await res.json());
}
```

### 6.3 NEVER ask the user for cookies

Do NOT ask the user to find document cookies, copy session tokens, or export authentication headers. The browser injection method handles auth automatically (the cookie is already in the browser). The localhost method on the Framestation doesn't need auth for most API routes.

If authentication is needed for a script, have the script call the login endpoint first:

```javascript
await fetch('http://localhost:3010/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'change-me' })
});
```

---

## 7. Things That Will Break (And How to Avoid Them)

### 7.1 Build hangs forever
**Cause:** A server component page.tsx has `await db.select()` without `export const dynamic = "force-dynamic"`.
**Fix:** Add the dynamic export, or better yet, refactor to use the client component + API route pattern.

### 7.2 API returns HTML instead of JSON
**Cause:** The table doesn't exist yet (migration wasn't run), so the API route throws an error and Next.js returns an HTML error page.
**Fix:** Run the migration SQL before building/starting the app.

### 7.3 "Failed to fetch" from browser JS
**Cause:** The vault server isn't running (crashed, was killed, or was never started after a rebuild).
**Fix:** Check if the vault is running: navigate to `http://192.168.4.240:3010` in the browser tab. If it shows an error page, the user needs to restart it on the Framestation.

### 7.4 Port 3010 already in use
**Cause:** A previous instance is still running.
**Fix:** `kill $(lsof -t -i:3010) 2>/dev/null` then start again. If the kill command errors, nothing was running — just start directly.

### 7.5 CORS errors when fetching files from Skool
**Cause:** `files.skool.com` blocks cross-origin requests. You cannot `fetch()` Skool file URLs from the vault's browser context.
**Fix:** Use the Skool tab (not the vault tab) for Skool operations. Or use the click-based download approach from the ingester skill.

### 7.6 Skool API returns plain text, not JSON
**Cause:** The Skool files API (`api2.skool.com/files/{file_id}/download-url`) returns a **plain text URL**, not a JSON object.
**Fix:** Use `res.text()` not `res.json()` when calling this endpoint.

---

## 8. Quick Reference Commands

**Start the vault (on Framestation):**
```bash
cd ~/evergreen-vault && npm start -- -p 3010
```

**Full redeploy after code changes:**
```bash
cd ~/evergreen-vault && git pull && kill $(lsof -t -i:3010) 2>/dev/null; rm -rf .next && npm run build && npm start -- -p 3010
```

**Redeploy with a new migration:**
```bash
cd ~/evergreen-vault && git pull && \
docker exec -i evergreen-vault-db psql -U vault evergreen_vault < drizzle/XXXX_migration.sql && \
kill $(lsof -t -i:3010) 2>/dev/null; rm -rf .next && npm run build && npm start -- -p 3010
```

**Check what's running on port 3010:**
```bash
lsof -i:3010
```

**Connect to the database directly:**
```bash
docker exec -it evergreen-vault-db psql -U vault evergreen_vault
```

**Check if a table exists:**
```bash
docker exec -i evergreen-vault-db psql -U vault evergreen_vault -c "\dt vault_*"
```

---

## 9. For Claude Sessions: Rules Summary

1. **The vault runs on port 3010 in production mode.** Never suggest dev mode.
2. **Push code to GitHub, then give the user terminal commands.** Don't try to SSH or reach the Framestation from the VM.
3. **Run migrations BEFORE builds.** Always.
4. **Never put database queries in page.tsx without `force-dynamic`.** Use client components + API routes instead.
5. **Upload data via browser JS injection or Node.js scripts.** Never via the Cowork VM directly.
6. **Never ask the user for cookies or session tokens.** The browser handles auth automatically.
7. **Test the API exists before uploading.** Fetch the endpoint first and check you get JSON back, not HTML.
8. **Keep `ignoreBuildErrors` and `ignoreDuringBuilds` in next.config.ts.** They're intentional.
9. **New content types need ALL pieces:** schema, index export, migration, API route, UI page, sidebar link.
10. **When in doubt, read this document.**
