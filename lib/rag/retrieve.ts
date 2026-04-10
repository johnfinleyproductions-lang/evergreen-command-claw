/**
 * Retrieval engine.
 * Embeds query → cosine similarity search → progressive threshold relaxation.
 * Returns ranked chunks with citations.
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, embeddings } from "@/lib/db/schema";
import { getEmbeddingProvider } from "./embedding";
import type { RetrievalResult, RetrievalChunk } from "./types";

const DEFAULT_TOP_K = 8;
const MAX_CONTEXT_CHARS = 12000;
const SIMILARITY_THRESHOLDS = [0.7, 0.6, 0.5, 0.4];

/** Retrieve relevant chunks for a query */
export async function retrieveContext(
  query: string,
  options?: {
    topK?: number;
    resourceIds?: string[];
    maxContextChars?: number;
  }
): Promise<RetrievalResult> {
  const start = performance.now();
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const maxChars = options?.maxContextChars ?? MAX_CONTEXT_CHARS;

  // 1. Embed the query
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 2. Find ready resources
  let readyResourceIds: string[];
  if (options?.resourceIds && options.resourceIds.length > 0) {
    readyResourceIds = options.resourceIds;
  } else {
    const readyResources = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.indexStatus, "ready"));
    readyResourceIds = readyResources.map((r) => r.id);
  }

  if (readyResourceIds.length === 0) {
    return {
      contextText: "",
      chunks: [],
      sources: [],
      timing: performance.now() - start,
    };
  }

  // 3. Progressive threshold search
  let results: RetrievalChunk[] = [];

  // Format as Postgres array literal for ANY()
  const pgArray = `{${readyResourceIds.join(",")}}`;

  for (const threshold of SIMILARITY_THRESHOLDS) {
    const rows = await db.execute(sql`
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
      LIMIT ${topK}
    `);

    results = (rows as unknown as Record<string, unknown>[]).map((row) => ({
      content: row.content as string,
      resourceId: row.resource_id as string,
      resourceName: row.file_name as string,
      similarity: parseFloat(row.similarity as string),
      pageNumber: row.page_number as number | undefined,
      chunkIndex: row.chunk_index as number,
    }));

    if (results.length >= 3) break; // Good enough
  }

  // 4. Build context text (capped at maxChars)
  let contextText = "";
  const usedChunks: RetrievalChunk[] = [];

  for (const chunk of results) {
    const entry = `[Source: ${chunk.resourceName}${chunk.pageNumber ? ` p.${chunk.pageNumber}` : ""}]\n${chunk.content}\n\n`;
    if (contextText.length + entry.length > maxChars) break;
    contextText += entry;
    usedChunks.push(chunk);
  }

  // 5. Build citation sources
  const sources = usedChunks.map((chunk) => ({
    resourceId: chunk.resourceId,
    resourceName: chunk.resourceName,
    pageNumber: chunk.pageNumber,
    similarity: chunk.similarity,
    quote:
      chunk.content.length > 150
        ? chunk.content.slice(0, 150) + "..."
        : chunk.content,
  }));

  return {
    contextText,
    chunks: usedChunks,
    sources,
    timing: performance.now() - start,
  };
}
