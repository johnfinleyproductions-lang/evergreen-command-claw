/**
 * Librarian Chat API — streams responses from Ollama with RAG context.
 * POST { messages, model?, sessionId? }
 * Returns a streaming text response with citations header.
 */

import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatSessions, chatMessages } from "@/lib/db/schema";
import { retrieveContext } from "@/lib/rag";

const DEFAULT_MODEL = process.env.OLLAMA_CHAT_MODEL || "qwen3.5:9b";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://192.168.4.240:11434";

const SYSTEM_PROMPT = `You are The Librarian — an expert knowledge assistant for the Evergreen Vault.
Your job is to answer questions using the provided context from the user's knowledge base.

Rules:
- Answer based on the provided context. If the context doesn't contain relevant information, say so honestly.
- When citing sources, reference the source filename naturally (e.g., "According to [filename]...").
- Be concise but thorough. Use direct quotes when they add value.
- If asked about something not in the context, you can provide general knowledge but clearly distinguish it from vault content.
- Format responses with markdown when helpful (headers, lists, bold for emphasis).
- Be warm and helpful — you're a librarian, not a robot.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model, sessionId } = body as {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      sessionId?: string;
    };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const chatModel = model || DEFAULT_MODEL;
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();

    // 1. Retrieve context from the knowledge base
    let contextText = "";
    let sources: Array<{
      resourceId: string;
      resourceName: string;
      pageNumber?: number;
      similarity: number;
      quote: string;
    }> = [];

    if (lastUserMessage) {
      const retrieval = await retrieveContext(lastUserMessage.content);
      contextText = retrieval.contextText;
      sources = retrieval.sources;
      console.log(
        `[Chat] Retrieved ${retrieval.chunks.length} chunks in ${Math.round(retrieval.timing)}ms`
      );
    }

    // 2. Build the full message list for Ollama
    const contextBlock = contextText
      ? `\n\n--- KNOWLEDGE BASE CONTEXT ---\n${contextText}\n--- END CONTEXT ---\n\nUse the above context to answer the user's question. Cite sources by filename when relevant.`
      : "\n\n(No relevant context found in the knowledge base for this query.)";

    const ollamaMessages = [
      { role: "system", content: SYSTEM_PROMPT + contextBlock },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // 3. Save/update session if needed
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const [session] = await db
        .insert(chatSessions)
        .values({
          title:
            lastUserMessage?.content.slice(0, 60) ||
            "New Chat",
          model: chatModel,
        })
        .returning();
      activeSessionId = session.id;
    }

    // Save user message
    if (lastUserMessage) {
      await db.insert(chatMessages).values({
        sessionId: activeSessionId,
        role: "user",
        content: lastUserMessage.content,
      });
    }

    // 4. Stream from Ollama
    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModel,
        messages: ollamaMessages,
        stream: true,
      }),
    });

    if (!ollamaResponse.ok) {
      const errText = await ollamaResponse.text();
      console.error("[Chat] Ollama error:", errText);
      return new Response(
        JSON.stringify({ error: `Ollama error: ${ollamaResponse.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Transform Ollama's NDJSON stream into a text stream for the client
    const ollamaBody = ollamaResponse.body;
    if (!ollamaBody) {
      return new Response(JSON.stringify({ error: "No response body" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    let fullResponse = "";

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Ollama sends newline-delimited JSON
        const lines = text.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullResponse += parsed.message.content;
              // Send as SSE-style data
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ content: parsed.message.content })}\n\n`
                )
              );
            }
            if (parsed.done) {
              // Send sources and session info at the end
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    done: true,
                    sessionId: activeSessionId,
                    sources,
                  })}\n\n`
                )
              );
            }
          } catch {
            // Skip malformed lines
          }
        }
      },
      async flush() {
        // Save assistant message to DB
        if (activeSessionId && fullResponse) {
          try {
            await db.insert(chatMessages).values({
              sessionId: activeSessionId,
              role: "assistant",
              content: fullResponse,
              citations: sources.length > 0
                ? sources.map((s) => ({
                    resourceId: s.resourceId,
                    resourceName: s.resourceName,
                    chunk: s.quote,
                    page: s.pageNumber,
                    similarity: s.similarity,
                  }))
                : null,
            });
          } catch (err) {
            console.error("[Chat] Failed to save assistant message:", err);
          }
        }
      },
    });

    const stream = ollamaBody.pipeThrough(transformStream);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return new Response(
      JSON.stringify({ error: "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
