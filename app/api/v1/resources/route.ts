/**
 * GET /api/v1/resources — List resources with optional type filtering.
 * Query params: ?type=pdf|docx|markdown|text|code|url|transcript|html|skill|other
 *               &status=ready|pending|processing|failed
 *               &q=search_text
 *               &limit=20&offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, sql } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  // Auth check
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const search = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // Build conditions array
    const conditions = [];

    if (type && type !== "all") {
      conditions.push(
        eq(resources.type, type as typeof resources.type.enumValues[number])
      );
    }

    if (status && status !== "all") {
      conditions.push(
        eq(
          resources.indexStatus,
          status as typeof resources.indexStatus.enumValues[number]
        )
      );
    }

    let query = db
      .select()
      .from(resources)
      .orderBy(desc(resources.createdAt));

    if (conditions.length > 0) {
      query = query.where(
        conditions.length === 1 ? conditions[0] : and(...conditions)
      ) as typeof query;
    }

    let results = await query;

    // Apply text search in JS (matches pattern from existing routes)
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.fileName.toLowerCase().includes(q) ||
          (r.tags && r.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    // Apply pagination
    const total = results.length;
    const paged = results.slice(offset, offset + limit);

    return NextResponse.json({
      total,
      count: paged.length,
      offset,
      limit,
      has_more: total > offset + paged.length,
      next_offset: total > offset + paged.length ? offset + paged.length : null,
      resources: paged.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        type: r.type,
        indexStatus: r.indexStatus,
        chunkCount: r.chunkCount,
        pageCount: r.pageCount,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        tags: r.tags,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[API v1] Resources list error:", error);
    return NextResponse.json(
      { error: "Failed to list resources" },
      { status: 500 }
    );
  }
}
