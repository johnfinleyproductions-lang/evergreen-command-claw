// app/api/profiles/route.ts
//
// Collection-level API for business profiles:
//   GET  /api/profiles  → list all profiles, active first
//   POST /api/profiles  → create a new profile from { name, content, activate? }
//
// If `activate` is true on create, the new profile is flipped to active in
// the same transaction and all other profiles are deactivated — so uploading
// a CLAUDE.md and immediately making it the running context is one request.

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

export const runtime = "nodejs";

const MAX_NAME_LEN = 120;
const MAX_CONTENT_BYTES = 256 * 1024; // 256KB — a CLAUDE.md should fit ten times over

export async function GET() {
  const rows = await db
    .select()
    .from(profiles)
    .orderBy(desc(profiles.isActive), desc(profiles.updatedAt));
  return NextResponse.json({ profiles: rows, count: rows.length });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const b = (body ?? {}) as {
    name?: unknown;
    content?: unknown;
    activate?: unknown;
  };

  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (b.name.trim().length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `name must be <= ${MAX_NAME_LEN} chars` },
      { status: 400 },
    );
  }
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

  const activate = b.activate === true;

  const inserted = await db.transaction(async (tx) => {
    if (activate) {
      await tx
        .update(profiles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(profiles.isActive, true));
    }
    const [row] = await tx
      .insert(profiles)
      .values({
        name: (b.name as string).trim(),
        content: b.content as string,
        isActive: activate,
      })
      .returning();
    return row;
  });

  return NextResponse.json({ profile: inserted }, { status: 201 });
}
