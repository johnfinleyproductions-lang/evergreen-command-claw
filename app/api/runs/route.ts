// app/api/runs/route.ts
//
// Collection-level API for runs:
//   GET  /api/runs                     → list with optional status + taskId filters
//   POST /api/runs                     → create a new run (free-form or from template)

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { tasks } from "@/lib/db/schema/tasks";

export const runtime = "nodejs";

const DEFAULT_MODEL = "nemotron";
const VALID_STATUSES = new Set([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const taskIdParam = url.searchParams.get("taskId");
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const rawOffset = Number(url.searchParams.get("offset") ?? "0");

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
    : 50;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(Math.trunc(rawOffset), 0)
    : 0;

  const conditions = [];
  if (statusParam) {
    if (!VALID_STATUSES.has(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status '${statusParam}'` },
        { status: 400 },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(runs.status, statusParam as any));
  }
  if (taskIdParam) {
    if (!UUID_SHAPE.test(taskIdParam)) {
      return NextResponse.json(
        { error: "taskId must be a uuid" },
        { status: 400 },
      );
    }
    conditions.push(eq(runs.taskId, taskIdParam));
  }

  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await db
    .select()
    .from(runs)
    .where(whereClause)
    .orderBy(desc(runs.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ runs: rows, limit, offset, count: rows.length });
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
    taskId?: unknown;
    prompt?: unknown;
    model?: unknown;
    inputVars?: unknown;
  };

  const model =
    typeof b.model === "string" && b.model.trim().length > 0
      ? b.model.trim()
      : DEFAULT_MODEL;

  const inputVars =
    b.inputVars && typeof b.inputVars === "object" && !Array.isArray(b.inputVars)
      ? (b.inputVars as Record<string, unknown>)
      : {};

  let finalPrompt: string;
  let finalTaskId: string | null = null;

  if (typeof b.taskId === "string" && b.taskId.length > 0) {
    if (!UUID_SHAPE.test(b.taskId)) {
      return NextResponse.json(
        { error: "taskId must be a uuid" },
        { status: 400 },
      );
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, b.taskId))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    finalPrompt = renderPromptTemplate(task.prompt, inputVars);
    finalTaskId = task.id;
  } else {
    if (typeof b.prompt !== "string" || b.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Either taskId or a non-empty prompt is required" },
        { status: 400 },
      );
    }
    finalPrompt = b.prompt.trim();
  }

  const [inserted] = await db
    .insert(runs)
    .values({
      taskId: finalTaskId,
      status: "pending",
      input: {
        prompt: finalPrompt,
        ...(Object.keys(inputVars).length > 0 ? { variables: inputVars } : {}),
      },
      model,
    })
    .returning();

  return NextResponse.json({ run: inserted }, { status: 201 });
}

function renderPromptTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = vars[key as string];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}
