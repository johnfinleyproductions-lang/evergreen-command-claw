import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";

const TEXT_TYPES = new Set(["transcript", "text", "markdown", "html", "code"]);

/**
 * GET /api/resources/preview?id={resourceId}
 * Returns the raw text content of a resource file for in-browser preview.
 * Only works for text-based resource types.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new NextResponse("id is required", { status: 400 });
    }

    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, id))
      .limit(1);

    if (!resource) {
      return new NextResponse("Resource not found", { status: 404 });
    }

    if (!TEXT_TYPES.has(resource.type)) {
      return new NextResponse("Preview not available for this file type", { status: 415 });
    }

    if (!resource.fileUrl) {
      return new NextResponse("No file URL", { status: 404 });
    }

    // Fetch file content from MinIO
    const fileRes = await fetch(resource.fileUrl);
    if (!fileRes.ok) {
      return new NextResponse("Failed to fetch file", { status: 502 });
    }

    const text = await fileRes.text();
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[Preview] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
