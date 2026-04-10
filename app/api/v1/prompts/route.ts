/**
 * GET /api/v1/prompts — List prompts with optional filtering.
 * Query params: ?type=system_prompt|megaprompt|template|chain
 *               &q=search_text
 *               &tag=tag_name
 *               &limit=20&offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/client";
import { prompts } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  // Auth check
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = db
      .select()
      .from(prompts)
      .orderBy(desc(prompts.updatedAt));

    if (type && type !== "all") {
      query = query.where(
        eq(prompts.type, type as typeof prompts.type.enumValues[number])
      ) as typeof query;
    }

    const results = await query;

    // Apply search filter in JS (matches existing pattern from /api/prompts)
    let filtered = results;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (tag) {
      const t = tag.toLowerCase();
      filtered = filtered.filter(
        (p) => p.tags && p.tags.some((pt) => pt.toLowerCase() === t)
      );
    }

    // Apply pagination
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      total,
      count: paged.length,
      offset,
      limit,
      has_more: total > offset + paged.length,
      next_offset: total > offset + paged.length ? offset + paged.length : null,
      prompts: paged.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        type: p.type,
        description: p.description,
        targetModel: p.targetModel,
        variables: p.variables,
        tags: p.tags,
        usageCount: p.usageCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[API v1] Prompts list error:", error);
    return NextResponse.json(
      { error: "Failed to list prompts" },
      { status: 500 }
    );
  }
}
