/**
 * Chat sessions API — list and create sessions.
 */

import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatSessions } from "@/lib/db/schema";

// GET: List all chat sessions
export async function GET() {
  try {
    const sessions = await db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updatedAt))
      .limit(50);

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[Sessions] Error:", error);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}
