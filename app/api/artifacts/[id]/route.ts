// app/api/artifacts/[id]/route.ts
//
// Phase 5.0 — Single artifact metadata lookup. Used by the preview dialog
// to render the header (name, size, kind) without fetching the content
// until the user opens the dialog.
//
// Excludes `path` from the selection — server-only.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { artifacts } from "@/lib/db/schema/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: artifacts.id,
      runId: artifacts.runId,
      name: artifacts.name,
      kind: artifacts.kind,
      mimeType: artifacts.mimeType,
      size: artifacts.size,
      metadata: artifacts.metadata,
      createdAt: artifacts.createdAt,
    })
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ artifact: row });
}
