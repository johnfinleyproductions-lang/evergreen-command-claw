import { NextRequest, NextResponse } from "next/server";
import { ingestResource } from "@/lib/rag";

export async function POST(request: NextRequest) {
  try {
    const { resourceId } = await request.json();

    if (!resourceId) {
      return NextResponse.json(
        { error: "resourceId is required" },
        { status: 400 }
      );
    }

    // Run ingestion
    await ingestResource(resourceId);

    return NextResponse.json({ ok: true, resourceId });
  } catch (error) {
    console.error("[Vectorize] Error:", error);
    return NextResponse.json(
      { error: "Vectorization failed", details: String(error) },
      { status: 500 }
    );
  }
}
