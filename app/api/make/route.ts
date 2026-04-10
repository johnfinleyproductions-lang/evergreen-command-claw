import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { makeBlueprints } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");

    let query = db
      .select()
      .from(makeBlueprints)
      .orderBy(desc(makeBlueprints.updatedAt));

    if (category && category !== "all") {
      query = query.where(
        eq(makeBlueprints.category, category as typeof makeBlueprints.category.enumValues[number])
      ) as typeof query;
    }

    const results = await query;

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
    console.error("[Make] List error:", error);
    return NextResponse.json({ error: "Failed to list blueprints" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, category, lessonKey, fileName, fileUrl, blueprintJson, moduleCount, tags, metadata } = body;

    if (!name || !fileName) {
      return NextResponse.json({ error: "name and fileName are required" }, { status: 400 });
    }

    const [record] = await db
      .insert(makeBlueprints)
      .values({
        name,
        description: description || null,
        category: category || "other",
        lessonKey: lessonKey || null,
        fileName,
        fileUrl: fileUrl || null,
        blueprintJson: blueprintJson || null,
        moduleCount: moduleCount || 0,
        tags: tags || [],
        metadata: metadata || null,
      })
      .returning();

    return NextResponse.json(record);
  } catch (error) {
    console.error("[Make] Create error:", error);
    return NextResponse.json({ error: "Failed to create blueprint" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(makeBlueprints)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(makeBlueprints.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Make] Update error:", error);
    return NextResponse.json({ error: "Failed to update blueprint" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await db.delete(makeBlueprints).where(eq(makeBlueprints.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Make] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete blueprint" }, { status: 500 });
  }
}
