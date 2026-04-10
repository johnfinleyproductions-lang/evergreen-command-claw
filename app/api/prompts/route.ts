import { NextRequest, NextResponse } from "next/server";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prompts } from "@/lib/db/schema";

/** List prompts with optional type filter and search */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");

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

    // Apply search filter in JS (simpler than building dynamic SQL with multiple conditions)
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

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("[Prompts] List error:", error);
    return NextResponse.json(
      { error: "Failed to list prompts" },
      { status: 500 }
    );
  }
}

/** Create a new prompt */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, type, description, targetModel, variables, tags } =
      body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content are required" },
        { status: 400 }
      );
    }

    const [prompt] = await db
      .insert(prompts)
      .values({
        title,
        content,
        type: type || "template",
        description: description || null,
        targetModel: targetModel || null,
        variables: variables || [],
        tags: tags || [],
      })
      .returning();

    return NextResponse.json(prompt);
  } catch (error) {
    console.error("[Prompts] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create prompt" },
      { status: 500 }
    );
  }
}

/** Update a prompt */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(prompts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(prompts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Prompts] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update prompt" },
      { status: 500 }
    );
  }
}

/** Delete a prompt */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await db.delete(prompts).where(eq(prompts.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Prompts] Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt" },
      { status: 500 }
    );
  }
}
