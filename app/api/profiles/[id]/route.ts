// app/api/profiles/[id]/route.ts
//
// Single-profile API:
//   GET    /api/profiles/[id]  → fetch
//   PATCH  /api/profiles/[id]  → partial update (name/content)
//   DELETE /api/profiles/[id]  → hard delete
//
// Activation is NOT handled here — see /api/profiles/[id]/activate. Keeping
// activation on its own route makes the one-row-at-a-time invariant easy to
// reason about (single transaction, single entry point).

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

export const runtime = "nodejs";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LEN = 120;
const MAX_CONTENT_BYTES = 256 * 1024;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({ profile: row });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400 },
    );
  }
  const b = (body ?? {}) as { name?: unknown; content?: unknown };

  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    if (b.name.trim().length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `name must be <= ${MAX_NAME_LEN} chars` },
        { status: 400 },
      );
    }
    update.name = b.name.trim();
  }

  if (b.content !== undefined) {
    if (typeof b.content !== "string") {
      return NextResponse.json(
        { error: "content must be a string" },
        { status: 400 },
      );
    }
    if (Buffer.byteLength(b.content, "utf8") > MAX_CONTENT_BYTES) {
      return NextResponse.json(
        { error: `content must be <= ${MAX_CONTENT_BYTES} bytes` },
        { status: 413 },
      );
    }
    update.content = b.content;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(profiles)
    .set(update)
    .where(eq(profiles.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({ profile: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }
  const [deleted] = await db
    .delete(profiles)
    .where(eq(profiles.id, id))
    .returning({ id: profiles.id });
  if (!deleted) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: deleted.id });
}
