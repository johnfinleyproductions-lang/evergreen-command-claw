// app/api/profiles/[id]/activate/route.ts
//
// POST /api/profiles/[id]/activate
//   Flip the given profile to active. Deactivates every other profile in the
//   same transaction so the `profiles_single_active_idx` partial unique index
//   is never contested mid-swap.
//
// Body: none, or `{ active: false }` to explicitly deactivate (rather than
// swap). Defaults to activating the target.

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

export const runtime = "nodejs";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  let active = true;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      active?: unknown;
    };
    if (typeof body.active === "boolean") active = body.active;
  } catch {
    // no-body is fine — default to activating
  }

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    if (!target) return null;

    if (active) {
      // Deactivate anything currently active that isn't the target, then
      // activate the target. Two statements because Postgres evaluates
      // partial-index uniqueness per-statement, not per-row.
      await tx
        .update(profiles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(profiles.isActive, true), ne(profiles.id, id)));
      const [row] = await tx
        .update(profiles)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(profiles.id, id))
        .returning();
      return row;
    }

    const [row] = await tx
      .update(profiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return row;
  });

  if (!result) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({ profile: result });
}
