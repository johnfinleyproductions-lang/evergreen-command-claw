/**
 * GET /api/v1/prompts/:id — Get a single prompt by ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/client";
import { prompts } from "@/lib/db/schema";

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
        { error: "Prompt ID is required" },
        { status: 400 }
      );
    }

    const [prompt] = await db
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1);

    if (!prompt) {
      return NextResponse.json(
        { error: `Prompt not found: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("[API v1] Prompt get error:", error);
    return NextResponse.json(
      { error: "Failed to get prompt" },
      { status: 500 }
    );
  }
}
