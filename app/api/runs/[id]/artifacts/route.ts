// app/api/runs/[id]/artifacts/route.ts
//
// Phase 5.0 — List artifacts produced by a given run. Returns metadata only;
// content is fetched separately via /api/artifacts/[id]/content.
//
// We explicitly select columns and DO NOT include `path` — the raw filesystem
// path is a server-only detail and must never leak to clients.

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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

  const rows = await db
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
    .where(eq(artifacts.runId, id))
    .orderBy(desc(artifacts.createdAt));

  return NextResponse.json({ artifacts: rows, count: rows.length });
}
