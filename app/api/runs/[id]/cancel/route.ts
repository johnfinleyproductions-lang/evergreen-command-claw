// app/api/runs/[id]/cancel/route.ts
//
// Phase 5.4 — POST /api/runs/[id]/cancel
//
// Flips a pending or running run to 'cancelled'. The worker picks up
// the flip at the top of its next agent iteration (see worker/agent.py)
// and exits cooperatively via finalize_run_cancelled.
//
// Semantics:
//   - 200 { id, previousStatus, newStatus: 'cancelled' } on success.
//   - 409 { error, currentStatus } if the row is already in a terminal
//     state (succeeded/failed/cancelled). Idempotent on repeat cancel.
//   - 404 if the id doesn't match any row.
//   - 400 if the id isn't a uuid.
//
// The UPDATE is atomic — WHERE status IN ('pending','running') — so two
// racing cancel POSTs either both succeed (one flips, the other sees
// 'cancelled' and 409s) or the row was never cancellable to begin with.

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";

export const runtime = "nodejs";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json(
      { error: "id must be a uuid" },
      { status: 400 },
    );
  }

  // Atomic flip. Only non-terminal rows get updated; RETURNING gives
  // us the pre-update status via a subquery-free pattern (Drizzle
  // returns the updated row, so we capture previousStatus by reading
  // the row first — trading one extra SELECT for a cleaner response
  // shape. The SELECT+UPDATE is not atomic across connections, but
  // the UPDATE's WHERE clause is, so we can never double-cancel or
  // clobber a terminal state.)

  const [existing] = await db
    .select({ id: runs.id, status: runs.status })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (existing.status !== "pending" && existing.status !== "running") {
    return NextResponse.json(
      {
        error: "Run is already in a terminal state",
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(runs)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(runs.id, id),
        inArray(runs.status, ["pending", "running"]),
      ),
    )
    .returning({ id: runs.id, status: runs.status });

  if (!updated) {
    // Row transitioned between SELECT and UPDATE — another cancel
    // won the race, or the worker flipped it to a terminal status.
    // Re-read to report the actual current state.
    const [fresh] = await db
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);

    return NextResponse.json(
      {
        error: "Run is no longer cancellable",
        currentStatus: fresh?.status ?? "unknown",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: updated.id,
    previousStatus: existing.status,
    newStatus: updated.status,
  });
}
