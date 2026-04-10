import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, embeddings } from "@/lib/db/schema";
import { deleteFile } from "@/lib/storage/minio";

/** List all resources */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    let query = db
      .select()
      .from(resources)
      .orderBy(desc(resources.createdAt));

    if (type && type !== "all") {
      query = query.where(eq(resources.type, type as typeof resources.type.enumValues[number])) as typeof query;
    }

    const results = await query;
    return NextResponse.json(results);
  } catch (error) {
    console.error("[Resources] List error:", error);
    return NextResponse.json(
      { error: "Failed to list resources" },
      { status: 500 }
    );
  }
}

/** Delete a resource */
export async function DELETE(request: NextRequest) {
  try {
    const { resourceId } = await request.json();

    if (!resourceId) {
      return NextResponse.json(
        { error: "resourceId is required" },
        { status: 400 }
      );
    }

    // Get resource to find file URL
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 }
      );
    }

    // Delete embeddings
    await db
      .delete(embeddings)
      .where(eq(embeddings.resourceId, resourceId));

    // Delete resource record
    await db.delete(resources).where(eq(resources.id, resourceId));

    // Delete file from MinIO
    if (resource.fileUrl) {
      try {
        const url = new URL(resource.fileUrl);
        const key = url.pathname.split("/").slice(2).join("/");
        await deleteFile(key);
      } catch {
        console.warn("[Resources] Failed to delete file from MinIO");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Resources] Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete resource" },
      { status: 500 }
    );
  }
}
