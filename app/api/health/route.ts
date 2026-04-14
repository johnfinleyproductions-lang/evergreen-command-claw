// app/api/health/route.ts
//
// Cheap liveness probe. Issues a single `SELECT 1` through Drizzle and
// reports the round-trip latency. The UI polls this on an interval to
// light up the health dot in the TopNav.
//
// This is intentionally NOT gated by auth — if someone can hit the app
// at all, the health endpoint needs to answer so the user knows whether
// it's the app or the DB that's wedged.
//
// Response shape (stable, do not break):
//   { ok: true,  dbLatencyMs: number, checkedAt: ISO string }
//   { ok: false, error: string,       checkedAt: ISO string }  // 503

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    await db.execute(sql`select 1`);
    const dbLatencyMs = Date.now() - started;
    return NextResponse.json(
      { ok: true, dbLatencyMs, checkedAt },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, checkedAt },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
