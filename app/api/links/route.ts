import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { links } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");

    let query = db.select().from(links).orderBy(desc(links.createdAt));

    if (category && category !== "all") {
      query = query.where(
        eq(links.category, category as typeof links.category.enumValues[number])
      ) as typeof query;
    }

    const results = await query;

    let filtered = results;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q)) ||
          l.url.toLowerCase().includes(q) ||
          (l.tags && l.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (tag) {
      const t = tag.toLowerCase();
      filtered = filtered.filter(
        (l) => l.tags && l.tags.some((lt) => lt.toLowerCase() === t)
      );
    }

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("[Links] List error:", error);
    return NextResponse.json({ error: "Failed to list links" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, url, category, lessonKey, description, tags } = body;

    if (!title || !url) {
      return NextResponse.json(
        { error: "title and url are required" },
        { status: 400 }
      );
    }

    const [link] = await db
      .insert(links)
      .values({
        title,
        url,
        category: category || "other",
        lessonKey: lessonKey || null,
        description: description || null,
        tags: tags || [],
      })
      .returning();

    return NextResponse.json(link);
  } catch (error) {
    console.error("[Links] Create error:", error);
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
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
      .update(links)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(links.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Links] Update error:", error);
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(links).where(eq(links.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Links] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  }
}