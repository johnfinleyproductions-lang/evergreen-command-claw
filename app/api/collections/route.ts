import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collections, collectionResources, collectionPrompts } from "@/lib/db/schema";

/** List all collections with item counts */
export async function GET() {
  try {
    const allCollections = await db
      .select()
      .from(collections)
      .orderBy(desc(collections.updatedAt));

    // Get counts for each collection
    const withCounts = await Promise.all(
      allCollections.map(async (col) => {
        const [resourceCount] = await db
          .select({ count: count() })
          .from(collectionResources)
          .where(eq(collectionResources.collectionId, col.id));
        const [promptCount] = await db
          .select({ count: count() })
          .from(collectionPrompts)
          .where(eq(collectionPrompts.collectionId, col.id));
        return {
          ...col,
          resourceCount: resourceCount.count,
          promptCount: promptCount.count,
        };
      })
    );

    return NextResponse.json(withCounts);
  } catch (error) {
    console.error("[Collections] List error:", error);
    return NextResponse.json({ error: "Failed to list collections" }, { status: 500 });
  }
}

/** Create a new collection */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, icon, color } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const [created] = await db
      .insert(collections)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || "📁",
        color: color || "#22c55e",
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[Collections] Create error:", error);
    return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
  }
}

/** Update a collection */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, icon, color } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(collections)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Collections] Update error:", error);
    return NextResponse.json({ error: "Failed to update collection" }, { status: 500 });
  }
}

/** Delete a collection */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(collections).where(eq(collections.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Collections] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
}
