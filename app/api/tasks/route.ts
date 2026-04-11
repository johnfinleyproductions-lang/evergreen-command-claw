// app/api/tasks/route.ts

import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(tasks).orderBy(desc(tasks.updatedAt));
  return NextResponse.json({ tasks: rows, count: rows.length });
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
    description?: unknown;
    prompt?: unknown;
    systemPrompt?: unknown;
    toolsAllowed?: unknown;
    inputSchema?: unknown;
    tags?: unknown;
  };

  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof b.prompt !== "string" || b.prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const description =
    typeof b.description === "string" && b.description.trim().length > 0
      ? b.description.trim()
      : null;

  const systemPrompt =
    typeof b.systemPrompt === "string" && b.systemPrompt.trim().length > 0
      ? b.systemPrompt.trim()
      : null;

  const toolsAllowed = Array.isArray(b.toolsAllowed)
    ? b.toolsAllowed.filter((t): t is string => typeof t === "string")
    : [];

  const tags = Array.isArray(b.tags)
    ? b.tags.filter((t): t is string => typeof t === "string")
    : [];

  const inputSchema =
    b.inputSchema && typeof b.inputSchema === "object" && !Array.isArray(b.inputSchema)
      ? (b.inputSchema as Record<string, unknown>)
      : null;

  const [inserted] = await db
    .insert(tasks)
    .values({
      name: b.name.trim(),
      description,
      prompt: b.prompt.trim(),
      systemPrompt,
      toolsAllowed,
      inputSchema,
      tags,
    })
    .returning();

  return NextResponse.json({ task: inserted }, { status: 201 });
}
