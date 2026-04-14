// app/api/profiles/active/route.ts
//
// GET /api/profiles/active
//   Fastpath lookup of the currently-active profile. Used by the top-nav
//   switcher and the new-run form to show which context will ride along on
//   the next run. Returns { profile: null } when nothing is active rather
//   than 404ing — callers treat "no active profile" as a normal state.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .limit(1);
  return NextResponse.json({ profile: row ?? null });
}
