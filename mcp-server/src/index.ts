#!/usr/bin/env node
/**
 * Evergreen Vault MCP Server
 *
 * Provides agent access to the Evergreen Vault knowledge base:
 *   - vault_search_knowledge: Semantic search across all indexed documents
 *   - vault_get_prompt: Retrieve a specific prompt by ID or title
 *   - vault_list_prompts: List/search prompts with filtering
 *   - vault_list_resources: List indexed resources with filtering
 *
 * Supports both stdio (local) and streamable HTTP (remote) transport.
 *
 * Environment:
 *   DATABASE_URL — Postgres connection string (required)
 *   OLLAMA_BASE_URL — Ollama API (default: http://localhost:11434)
 *   OLLAMA_EMBEDDING_MODEL — Embedding model (default: nomic-embed-text)
 *   TRANSPORT — "stdio" (default) or "http"
 *   MCP_PORT — HTTP port (default: 8020)
 *   VAULT_API_KEY — Required for HTTP transport auth
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { getDb, closeDb } from "./db.js";
import { embedQuery } from "./embed.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25000;
const SIMILARITY_THRESHOLDS = [0.7, 0.6, 0.5, 0.4];

// ── MCP Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "evergreen-vault-mcp-server",
  version: "1.0.0",
});

// ── Tool: vault_search_knowledge ───────────────────────────────────────────────

const SearchKnowledgeSchema = z
  .object({
    query: z
      .string()
      .min(2, "Query must be at least 2 characters")
      .max(500, "Query must not exceed 500 characters")
      .describe("Natural language search query against the knowledge base"),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("Maximum number of chunks to return (default: 8)"),
  })
  .strict();

server.registerTool(
  "vault_search_knowledge",
  {
    title: "Search Evergreen Vault Knowledge Base",
    description: `Perform semantic search across all indexed documents in the Evergreen Vault.
Returns the most relevant text chunks with similarity scores and source attribution.

Use this tool to find information from PDFs, transcripts, markdown files, code,
and other documents that have been uploaded to the vault.

Args:
  - query (string): Natural language search query (2-500 chars)
  - top_k (number): Max chunks to return, 1-20 (default: 8)

Returns:
  JSON with total results, timing, and an array of chunks each containing:
  content, resourceName, similarity score, chunkIndex, and pageNumber.

Examples:
  - "What did Harut say about masterclass pricing?" -> searches transcripts
  - "TypeScript error handling patterns" -> searches code & docs
  - "newsletter subject line formulas" -> searches writing resources`,
    inputSchema: SearchKnowledgeSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof SearchKnowledgeSchema>) => {
    try {
      const sql = getDb();
      const queryEmbedding = await embedQuery(params.query);
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // Find ready resources
      const readyResources = await sql`
        SELECT id FROM resources WHERE index_status = 'ready'
      `;

      if (readyResources.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                total: 0,
                query: params.query,
                message: "No indexed resources found. Upload documents to the vault first.",
              }),
            },
          ],
        };
      }

      const resourceIds = readyResources.map((r) => r.id);
      const pgArray = `{${resourceIds.join(",")}}`;

      // Progressive threshold search (same logic as retrieve.ts)
      let results: Array<Record<string, unknown>> = [];

      for (const threshold of SIMILARITY_THRESHOLDS) {
        const rows = await sql`
          SELECT
            e.id,
            e.content,
            e.resource_id,
            e.chunk_index,
            e.page_number,
            r.file_name,
            1 - (e.embedding <=> ${embeddingStr}::vector) as similarity
          FROM embeddings e
          JOIN resources r ON r.id = e.resource_id
          WHERE e.resource_id = ANY(${pgArray}::uuid[])
            AND 1 - (e.embedding <=> ${embeddingStr}::vector) >= ${threshold}
          ORDER BY similarity DESC
          LIMIT ${params.top_k}
        `;

        results = rows as Array<Record<string, unknown>>;
        if (results.length >= 3) break;
      }

      const chunks = results.map((row) => ({
        content: row.content as string,
        resourceId: row.resource_id as string,
        resourceName: row.file_name as string,
        similarity: Math.round(parseFloat(row.similarity as string) * 1000) / 1000,
        chunkIndex: row.chunk_index as number,
        pageNumber: (row.page_number as number) ?? null,
      }));

      const output = {
        query: params.query,
        total: chunks.length,
        chunks,
      };

      let text = JSON.stringify(output, null, 2);
      if (text.length > CHARACTER_LIMIT) {
        // Truncate chunks to fit
        const truncated = { ...output, chunks: chunks.slice(0, 3), truncated: true };
        text = JSON.stringify(truncated, null, 2);
      }

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching knowledge base: ${error instanceof Error ? error.message : String(error)}. Ensure Ollama is running for embeddings.`,
          },
        ],
      };
    }
  }
);

// ── Tool: vault_list_prompts ─────────────────────────────────────────────────

const ListPromptsSchema = z
  .object({
    type: z
      .enum(["system_prompt", "megaprompt", "template", "chain"])
      .optional()
      .describe("Filter by prompt type"),
    search: z
      .string()
      .max(200)
      .optional()
      .describe("Search text to match against title, content, description, or tags"),
    tag: z
      .string()
      .max(100)
      .optional()
      .describe("Filter by exact tag name"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results (default: 20)"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  })
  .strict();

server.registerTool(
  "vault_list_prompts",
  {
    title: "List Evergreen Vault Prompts",
    description: `List and search prompts stored in the Evergreen Vault.
Supports filtering by type, tag, and free-text search.

Prompt types: system_prompt, megaprompt, template, chain.

Args:
  - type (string, optional): Filter by prompt type
  - search (string, optional): Free-text search across title/content/description/tags
  - tag (string, optional): Filter by exact tag name
  - limit (number): Max results, 1-100 (default: 20)
  - offset (number): Pagination offset (default: 0)

Returns:
  JSON with total count, pagination info, and array of prompt objects.`,
    inputSchema: ListPromptsSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof ListPromptsSchema>) => {
    try {
      const sql = getDb();

      let rows;
      if (params.type) {
        rows = await sql`
          SELECT * FROM prompts
          WHERE type = ${params.type}
          ORDER BY updated_at DESC
        `;
      } else {
        rows = await sql`
          SELECT * FROM prompts ORDER BY updated_at DESC
        `;
      }

      // Apply search filter (matches Next.js pattern)
      let filtered = rows as Array<Record<string, unknown>>;
      if (params.search) {
        const q = params.search.toLowerCase();
        filtered = filtered.filter((p) => {
          const title = (p.title as string || "").toLowerCase();
          const content = (p.content as string || "").toLowerCase();
          const desc = (p.description as string || "").toLowerCase();
          const tags = (p.tags as string[]) || [];
          return (
            title.includes(q) ||
            content.includes(q) ||
            desc.includes(q) ||
            tags.some((t) => t.toLowerCase().includes(q))
          );
        });
      }

      if (params.tag) {
        const t = params.tag.toLowerCase();
        filtered = filtered.filter((p) => {
          const tags = (p.tags as string[]) || [];
          return tags.some((pt) => pt.toLowerCase() === t);
        });
      }

      const total = filtered.length;
      const paged = filtered.slice(params.offset, params.offset + params.limit);

      const output = {
        total,
        count: paged.length,
        offset: params.offset,
        limit: params.limit,
        has_more: total > params.offset + paged.length,
        next_offset:
          total > params.offset + paged.length ? params.offset + paged.length : null,
        prompts: paged.map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          description: p.description || null,
          tags: p.tags || [],
          content_preview:
            (p.content as string).length > 200
              ? (p.content as string).slice(0, 200) + "..."
              : p.content,
          usage_count: p.usage_count ?? 0,
        })),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing prompts: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ── Tool: vault_get_prompt ───────────────────────────────────────────────────

const GetPromptSchema = z
  .object({
    id: z.string().optional().describe("Prompt UUID"),
    title: z
      .string()
      .max(200)
      .optional()
      .describe("Exact or partial title match (case-insensitive)"),
  })
  .strict()
  .refine((data) => data.id || data.title, {
    message: "Either id or title must be provided",
  });

server.registerTool(
  "vault_get_prompt",
  {
    title: "Get Evergreen Vault Prompt",
    description: `Retrieve the full content of a specific prompt by ID or title.

Provide either an ID (UUID) or a title (partial match, case-insensitive).
Returns the complete prompt including content, variables, tags, and metadata.

Args:
  - id (string, optional): Prompt UUID
  - title (string, optional): Full or partial title (case-insensitive)
  At least one of id or title must be provided.

Returns:
  Full prompt object with all fields including content.`,
    inputSchema: GetPromptSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof GetPromptSchema>) => {
    try {
      const sql = getDb();

      let rows;
      if (params.id) {
        rows = await sql`SELECT * FROM prompts WHERE id = ${params.id} LIMIT 1`;
      } else if (params.title) {
        rows = await sql`
          SELECT * FROM prompts
          WHERE LOWER(title) LIKE ${"%" + params.title.toLowerCase() + "%"}
          ORDER BY updated_at DESC
          LIMIT 5
        `;
      } else {
        return {
          content: [
            { type: "text" as const, text: "Error: Either id or title must be provided." },
          ],
        };
      }

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No prompt found matching ${params.id ? `id="${params.id}"` : `title="${params.title}"`}`,
            },
          ],
        };
      }

      const output =
        rows.length === 1
          ? { prompt: rows[0] }
          : { message: `Found ${rows.length} matching prompts`, prompts: rows };

      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting prompt: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ── Tool: vault_list_resources ───────────────────────────────────────────────

const ListResourcesSchema = z
  .object({
    type: z
      .enum([
        "pdf",
        "docx",
        "markdown",
        "text",
        "code",
        "url",
        "transcript",
        "image",
        "html",
        "skill",
        "other",
      ])
      .optional()
      .describe("Filter by resource type"),
    status: z
      .enum(["pending", "processing", "ready", "failed"])
      .optional()
      .describe("Filter by index status (default: all)"),
    search: z
      .string()
      .max(200)
      .optional()
      .describe("Search by filename"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results (default: 20)"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  })
  .strict();

server.registerTool(
  "vault_list_resources",
  {
    title: "List Evergreen Vault Resources",
    description: `List documents and files indexed in the Evergreen Vault.
Supports filtering by type and index status.

Resource types: pdf, docx, markdown, text, code, url, transcript, image, html, skill, other.
Index statuses: pending, processing, ready, failed.

Args:
  - type (string, optional): Filter by resource type
  - status (string, optional): Filter by index status
  - search (string, optional): Search by filename
  - limit (number): Max results, 1-100 (default: 20)
  - offset (number): Pagination offset (default: 0)

Returns:
  JSON with total count, pagination info, and array of resource objects
  (id, fileName, type, indexStatus, chunkCount, fileSize, tags, dates).`,
    inputSchema: ListResourcesSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof ListResourcesSchema>) => {
    try {
      const sql = getDb();

      // Build query with optional filters
      const conditions: string[] = [];
      const values: unknown[] = [];

      if (params.type) {
        conditions.push(`type = '${params.type}'`);
      }
      if (params.status) {
        conditions.push(`index_status = '${params.status}'`);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const rows = await sql.unsafe(
        `SELECT * FROM resources ${whereClause} ORDER BY created_at DESC`
      );

      // Apply search filter
      let filtered = rows as Array<Record<string, unknown>>;
      if (params.search) {
        const q = params.search.toLowerCase();
        filtered = filtered.filter((r) =>
          (r.file_name as string).toLowerCase().includes(q)
        );
      }

      const total = filtered.length;
      const paged = filtered.slice(params.offset, params.offset + params.limit);

      const output = {
        total,
        count: paged.length,
        offset: params.offset,
        limit: params.limit,
        has_more: total > params.offset + paged.length,
        next_offset:
          total > params.offset + paged.length ? params.offset + paged.length : null,
        resources: paged.map((r) => ({
          id: r.id,
          fileName: r.file_name,
          type: r.type,
          indexStatus: r.index_status,
          chunkCount: r.chunk_count ?? 0,
          fileSize: r.file_size ?? null,
          tags: r.tags || [],
          createdAt: r.created_at,
        })),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing resources: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ── Transport Setup ──────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vault-mcp] Running via stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "evergreen-vault-mcp-server" });
  });

  app.post("/mcp", async (req, res) => {
    // Optional API key check for HTTP transport
    const apiKey = process.env.VAULT_API_KEY;
    if (apiKey) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ") || auth.slice(7) !== apiKey) {
        res.status(403).json({ error: "Invalid API key" });
        return;
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.MCP_PORT || "8020", 10);
  app.listen(port, "0.0.0.0", () => {
    console.error(`[vault-mcp] Running via HTTP on port ${port}`);
    console.error(`[vault-mcp] Endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("[vault-mcp] Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("[vault-mcp] Server error:", error);
    process.exit(1);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDb();
  process.exit(0);
});
