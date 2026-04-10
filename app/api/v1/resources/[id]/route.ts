/**
 * GET /api/v1/resources/:id — Get a single resource by ID with chunk count.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/client";
import { resources, embeddings } from "@/lib/db/schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Resource ID is required" },
        { status: 400 }
      );
    }

    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, id))
      .limit(1);

    if (!resource) {
      return NextResponse.json(
        { error: `Resource not found: ${id}` },
        { status: 404 }
      );
    }

    // Get actual chunk count from embeddings table
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(embeddings)
      .where(eq(embeddings.resourceId, id));

    return NextResponse.json({
      resource: {
        ...resource,
        embeddingCount: count,
      },
    });
  } catch (error) {
    console.error("[API v1] Resource get error:", error);
    return NextResponse.json(
      { error: "Failed to get resource" },
      { status: 500 }
    );
  }
}
