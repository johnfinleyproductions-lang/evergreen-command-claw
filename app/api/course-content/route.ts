import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { courseContent } from "@/lib/db/schema";

/** List course content with optional chapter/section/search filters */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapter = searchParams.get("chapter");
    const section = searchParams.get("section");
    const search = searchParams.get("q");
    const tag = searchParams.get("tag");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    let query = db
      .select()
      .from(courseContent)
      .orderBy(desc(courseContent.updatedAt));

    if (chapter) {
      query = query.where(eq(courseContent.chapter, chapter)) as typeof query;
    }

    let results = await query;

    if (section) {
      results = results.filter((r) => r.section === section);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.fileName.toLowerCase().includes(q) ||
          (r.section && r.section.toLowerCase().includes(q)) ||
          (r.tags && r.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    if (tag) {
      const t = tag.toLowerCase();
      results = results.filter(
        (r) => r.tags && r.tags.some((rt) => rt.toLowerCase() === t)
      );
    }
    if (limit) {
      results = results.slice(0, limit);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[CourseContent] List error:", error);
    return NextResponse.json({ error: "Failed to list course content" }, { status: 500 });
  }
}

/** Create a new course content record (metadata only, no file) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, chapter, section, fileName, fileUrl, contentType, tags, metadata } = body;

    if (!name || !chapter || !fileName) {
      return NextResponse.json(
        { error: "name, chapter, and fileName are required" },
        { status: 400 }
      );
    }

    const [record] = await db
      .insert(courseContent)
      .values({
        name,
        chapter,
        section: section || null,
        fileName,
        fileUrl: fileUrl || null,
        contentType: contentType || null,
        tags: tags || [],
        metadata: metadata || null,
      })
      .returning();

    return NextResponse.json(record);
  } catch (error) {
    console.error("[CourseContent] Create error:", error);
    return NextResponse.json({ error: "Failed to create course content" }, { status: 500 });
  }
}

/** Update a course content record (e.g. backfill fileUrl) */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(courseContent)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(courseContent.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[CourseContent] Update error:", error);
    return NextResponse.json({ error: "Failed to update course content" }, { status: 500 });
  }
}

/** Delete a course content record */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(courseContent).where(eq(courseContent.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CourseContent] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete course content" }, { status: 500 });
  }
}
