import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  collections,
  collectionResources,
  collectionPrompts,
  resources,
  prompts
} from "@/lib/db/schema";

/** Get items in a collection */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
    }

    const [collectionResourcesList, collectionPromptsList] = await Promise.all([
      db
        .select({
          resourceId: collectionResources.resourceId,
          addedAt: collectionResources.addedAt,
          fileName: resources.fileName,
          type: resources.type,
          indexStatus: resources.indexStatus,
          fileSize: resources.fileSize,
        })
        .from(collectionResources)
        .innerJoin(resources, eq(collectionResources.resourceId, resources.id))
        .where(eq(collectionResources.collectionId, collectionId)),
      db
        .select({
          promptId: collectionPrompts.promptId,
          addedAt: collectionPrompts.addedAt,
          title: prompts.title,
          type: prompts.type,
          description: prompts.description,
        })
        .from(collectionPrompts)
        .innerJoin(prompts, eq(collectionPrompts.promptId, prompts.id))
        .where(eq(collectionPrompts.collectionId, collectionId)),
    ]);

    return NextResponse.json({
      resources: collectionResourcesList,
      prompts: collectionPromptsList,
    });
  } catch (error) {
    console.error("[Collections] Get items error:", error);
    return NextResponse.json({ error: "Failed to get collection items" }, { status: 500 });
  }
}

/** Add item to collection */
export async function POST(request: NextRequest) {
  try {
    const { collectionId, resourceId, promptId } = await request.json();

    if (!collectionId) {
      return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
    }

    if (!resourceId && !promptId) {
      return NextResponse.json({ error: "resourceId or promptId is required" }, { status: 400 });
    }

    if (resourceId) {
      await db
        .insert(collectionResources)
        .values({ collectionId, resourceId })
        .onConflictDoNothing();
    }

    if (promptId) {
      await db
        .insert(collectionPrompts)
        .values({ collectionId, promptId })
        .onConflictDoNothing();
    }

    // Update collection timestamp
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Collections] Add item error:", error);
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

/** Remove item from collection */
export async function DELETE(request: NextRequest) {
  try {
    const { collectionId, resourceId, promptId } = await request.json();

    if (!collectionId) {
      return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
    }

    if (resourceId) {
      await db
        .delete(collectionResources)
        .where(
          and(
            eq(collectionResources.collectionId, collectionId),
            eq(collectionResources.resourceId, resourceId)
          )
        );
    }

    if (promptId) {
      await db
        .delete(collectionPrompts)
        .where(
          and(
            eq(collectionPrompts.collectionId, collectionId),
            eq(collectionPrompts.promptId, promptId)
          )
        );
    }

    // Update collection timestamp
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Collections] Remove item error:", error);
    return NextResponse.json({ error: "Failed to remove item" }, { status: 500 });
  }
}
