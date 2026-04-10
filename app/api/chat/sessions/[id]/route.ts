/**
 * Single chat session API — get messages, delete session.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatSessions, chatMessages } from "@/lib/db/schema";

// GET: Get session with its messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.createdAt));

    return NextResponse.json({ session, messages });
  } catch (error) {
    console.error("[Session] Error:", error);
    return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
  }
}

// DELETE: Delete session (cascades to messages)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.delete(chatSessions).where(eq(chatSessions.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
