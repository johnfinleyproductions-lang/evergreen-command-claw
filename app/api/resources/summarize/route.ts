import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, embeddings } from "@/lib/db/schema";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://192.168.4.240:11434";
const DEFAULT_MODEL = process.env.OLLAMA_CHAT_MODEL || "qwen3.5:9b";

/**
 * POST /api/resources/summarize
 * Body: { resourceId: string }
 * Generates a concise summary of a resource using its indexed chunks + Ollama.
 */
export async function POST(request: NextRequest) {
  try {
    const { resourceId } = await request.json();

    if (!resourceId) {
      return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
    }

    // Get resource metadata
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    if (resource.indexStatus !== "ready") {
      return NextResponse.json(
        { error: "Resource is not indexed yet. Please wait for indexing to complete." },
        { status: 400 }
      );
    }

    // Pull up to 20 chunks from the embeddings table (content field)
    const chunks = await db
      .select({ content: embeddings.content })
      .from(embeddings)
      .where(eq(embeddings.resourceId, resourceId))
      .limit(20);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No indexed content found for this resource." },
        { status: 400 }
      );
    }

    const contentSample = chunks
      .map((c, i) => `[Chunk ${i + 1}]\n${c.content}`)
      .join("\n\n");

    const prompt = `You are summarizing a document from a knowledge base.

File: ${resource.fileName}
Type: ${resource.type}
${resource.tags && resource.tags.length > 0 ? `Tags: ${resource.tags.join(", ")}` : ""}

Here are excerpts from the document:

${contentSample}

Write a clear, concise summary (3-5 sentences) that captures:
- What this document is about
- The key information or insights it contains
- Who would find it useful

Be direct and informative. No preamble.`;

    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      const err = await ollamaRes.text();
      console.error("[Summarize] Ollama error:", err);
      return NextResponse.json(
        { error: "Failed to generate summary. Is Ollama running?" },
        { status: 502 }
      );
    }

    const data = await ollamaRes.json();
    const summary = data.message?.content?.trim() || "Could not generate summary.";

    return NextResponse.json({ summary, fileName: resource.fileName });
  } catch (error) {
    console.error("[Summarize] Error:", error);
    return NextResponse.json({ error: "Summarize failed" }, { status: 500 });
  }
}
