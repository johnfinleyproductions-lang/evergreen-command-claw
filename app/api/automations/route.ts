import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { automations } from "@/lib/db/schema";

/** List automations with optional category filter, search, and grouping */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");

    let query = db
      .select()
      .from(automations)
      .orderBy(desc(automations.updatedAt));

    if (category && category !== "all") {
      query = query.where(
        eq(automations.category, category as typeof automations.category.enumValues[number])
      ) as typeof query;
    }

    const results = await query;

    // Apply search filter in JS
    let filtered = results;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          a.fileName.toLowerCase().includes(q) ||
          (a.tags && a.tags.some((t) => t.toLowerCase().includes(q))) ||
          (a.lessonKey && a.lessonKey.toLowerCase().includes(q))
      );
    }

    if (tag) {
      const t = tag.toLowerCase();
      filtered = filtered.filter(
        (a) => a.tags && a.tags.some((at) => at.toLowerCase() === t)
      );
    }

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("[Automations] List error:", error);
    return NextResponse.json(
      { error: "Failed to list automations" },
      { status: 500 }
    );
  }
}

/** Create a new automation */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, category, lessonKey, fileName, fileUrl, workflowJson, nodeCount, tags, metadata } = body;

    if (!name || !fileName) {
      return NextResponse.json(
        { error: "name and fileName are required" },
        { status: 400 }
      );
    }

    const [automation] = await db
      .insert(automations)
      .values({
        name,
        description: description || null,
        category: category || "other",
        lessonKey: lessonKey || null,
        fileName,
        fileUrl: fileUrl || null,
        workflowJson: workflowJson || null,
        nodeCount: nodeCount || 0,
        tags: tags || [],
        metadata: metadata || null,
      })
      .returning();

    return NextResponse.json(automation);
  } catch (error) {
    console.error("[Automations] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create automation" },
      { status: 500 }
    );
  }
}

/** Update an automation */
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
      .update(automations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(automations.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Automations] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update automation" },
      { status: 500 }
    );
  }
}

/** Delete an automation */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await db.delete(automations).where(eq(automations.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Automations] Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete automation" },
      { status: 500 }
    );
  }
}
