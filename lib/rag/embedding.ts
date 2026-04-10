/**
 * Configurable embedding provider.
 * Supports Ollama (local, default) and OpenAI (cloud fallback).
 */

const BATCH_SIZE = 50; // Ollama handles fewer at once than OpenAI

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

// ---- Ollama Provider ----

function createOllamaProvider(): EmbeddingProvider {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://192.168.4.240:11434";
  const model = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || "768", 10);

  async function embed(text: string): Promise<number[]> {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding failed: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();
    return data.embeddings[0];
  }

  async function embedMany(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await fetch(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: batch }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama embedding failed: ${response.status} ${await response.text()}`
        );
      }

      const data = await response.json();
      results.push(...data.embeddings);
    }

    return results;
  }

  return { embed, embedMany, dimensions };
}

// ---- OpenAI Provider ----

function createOpenAIProvider(): EmbeddingProvider {
  const dimensions = 1536; // text-embedding-3-small default
  const apiKey = process.env.OPENAI_API_KEY;

  async function callOpenAI(input: string[]): Promise<number[][]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI embedding failed: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();
    return data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);
  }

  async function embed(text: string): Promise<number[]> {
    const results = await callOpenAI([text]);
    return results[0];
  }

  async function embedMany(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const batchResults = await callOpenAI(batch);
      results.push(...batchResults);
    }
    return results;
  }

  return { embed, embedMany, dimensions };
}

// ---- Provider Factory ----

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) {
    const providerName = process.env.EMBEDDING_PROVIDER || "ollama";
    _provider =
      providerName === "openai"
        ? createOpenAIProvider()
        : createOllamaProvider();

    console.log(
      `[Embedding] Using ${providerName} provider (${_provider.dimensions} dimensions)`
    );
  }
  return _provider;
}
