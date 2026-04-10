/**
 * Embedding client for the MCP server.
 * Calls Ollama's /api/embed endpoint directly (same as the Next.js app).
 * IMPORTANT: Must use localhost:11434 — Ollama binds loopback only.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export async function embedQuery(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, input: text }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama embedding failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  return data.embeddings[0];
}
