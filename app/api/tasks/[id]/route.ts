// app/api/tasks/[id]/route.ts
//
// Single-task API:
//   GET    /api/tasks/[id]  → fetch one task
//   PATCH  /api/tasks/[id]  → update (partial; only provided fields touched)
//   DELETE /api/tasks/[id]  → hard delete
//
// Phase 5.1 ships this to back the task create/edit UI on /tasks. Before this
// route existed, tasks were effectively write-once from the UI side — the
// POST /api/tasks route handled creation, but update and delete required raw
// SQL. PATCH uses a partial-update pattern: only the fields present in the
// request body are touched, everything else is preserved.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";

export const runtime = "nodejs";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
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

  const b = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    prompt?: unknown;
    systemPrompt?: unknown;
    toolsAllowed?: unknown;
    inputSchema?: unknown;
    tags?: unknown;
  };

  // Build a partial update object. Only fields explicitly present in the
  // request body are touched. `undefined` means "don't update this column";
  // `null` means "clear this nullable column."
  const update: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    update.name = b.name.trim();
  }

  if (b.description !== undefined) {
    if (b.description === null) {
      update.description = null;
    } else if (typeof b.description === "string") {
      update.description = b.description.trim().length > 0
        ? b.description.trim()
        : null;
    } else {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (b.prompt !== undefined) {
    if (typeof b.prompt !== "string" || b.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "prompt must be a non-empty string" },
        { status: 400 },
      );
    }
    update.prompt = b.prompt.trim();
  }

  if (b.systemPrompt !== undefined) {
    if (b.systemPrompt === null) {
      update.systemPrompt = null;
    } else if (typeof b.systemPrompt === "string") {
      update.systemPrompt = b.systemPrompt.trim().length > 0
        ? b.systemPrompt.trim()
        : null;
    } else {
      return NextResponse.json(
        { error: "systemPrompt must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (b.toolsAllowed !== undefined) {
    if (!Array.isArray(b.toolsAllowed)) {
      return NextResponse.json(
        { error: "toolsAllowed must be an array of strings" },
        { status: 400 },
      );
    }
    update.toolsAllowed = b.toolsAllowed.filter(
      (t): t is string => typeof t === "string",
    );
  }

  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) {
      return NextResponse.json(
        { error: "tags must be an array of strings" },
        { status: 400 },
      );
    }
    update.tags = b.tags.filter((t): t is string => typeof t === "string");
  }

  if (b.inputSchema !== undefined) {
    if (b.inputSchema === null) {
      update.inputSchema = null;
    } else if (
      typeof b.inputSchema === "object" &&
      !Array.isArray(b.inputSchema)
    ) {
      update.inputSchema = b.inputSchema as Record<string, unknown>;
    } else {
      return NextResponse.json(
        { error: "inputSchema must be a JSON object or null" },
        { status: 400 },
      );
    }
  }

  // Keys present in update are {updatedAt} + at least one real field, or
  // only {updatedAt} if the caller sent an empty body. Reject the latter
  // so we don't silently bump updatedAt for no reason.
  if (Object.keys(update).length === 1) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(tasks)
    .set(update)
    .where(eq(tasks.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id });

  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: deleted.id });
}
