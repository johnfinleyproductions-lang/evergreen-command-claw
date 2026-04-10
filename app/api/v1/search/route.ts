/**
 * POST /api/v1/search — Semantic search against the knowledge base.
 * Wraps the existing retrieveContext() with API key auth.
 *
 * Body: { query: string, topK?: number, resourceIds?: string[] }
 * Returns: { chunks, sources, timing, contextText }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { retrieveContext } from "@/lib/rag";

export async function POST(request: NextRequest) {
  // Auth check
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { query, topK, resourceIds } = body as {
      query?: string;
      topK?: number;
      resourceIds?: string[];
    };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "query is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (topK !== undefined && (typeof topK !== "number" || topK < 1 || topK > 50)) {
      return NextResponse.json(
        { error: "topK must be a number between 1 and 50" },
        { status: 400 }
      );
    }

    const result = await retrieveContext(query.trim(), {
      topK: topK ?? 8,
      resourceIds: resourceIds ?? undefined,
    });

    return NextResponse.json({
      query: query.trim(),
      total: result.chunks.length,
      timing_ms: Math.round(result.timing),
      chunks: result.chunks.map((c) => ({
        content: c.content,
        resourceId: c.resourceId,
        resourceName: c.resourceName,
        similarity: Math.round(c.similarity * 1000) / 1000,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber ?? null,
      })),
      sources: result.sources,
      contextText: result.contextText,
    });
  } catch (error) {
    console.error("[API v1] Search error:", error);
    return NextResponse.json(
      { error: "Search failed. Check that Ollama is running for embeddings." },
      { status: 500 }
    );
  }
}
