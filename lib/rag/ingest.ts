/**
 * Ingestion orchestrator.
 * Full pipeline: extract → chunk → embed → store.
 * Handles status tracking and content hashing for deduplication.
 */

import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, embeddings } from "@/lib/db/schema";
import { getFile } from "@/lib/storage/minio";
import { extractText } from "./extract";
import { buildChunkedDocuments } from "./chunking";
import { getEmbeddingProvider } from "./embedding";
import type { ResourceType } from "./types";

const EMBEDDING_BATCH_SIZE = 50;

/** Generate SHA-256 hash of content for deduplication */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Detect resource type from file extension */
export function detectResourceType(fileName: string): ResourceType {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  const typeMap: Record<string, ResourceType> = {
    pdf: "pdf",
    docx: "docx",
    doc: "docx",
    md: "markdown",
    mdx: "markdown",
    txt: "text",
    html: "html",
    htm: "html",
    js: "code",
    ts: "code",
    jsx: "code",
    tsx: "code",
    py: "code",
    go: "code",
    rs: "code",
    sh: "code",
    bash: "code",
    yaml: "code",
    yml: "code",
    json: "code",
    toml: "code",
    css: "code",
    scss: "code",
    sql: "code",
    // Transcripts
    vtt: "transcript",
    srt: "transcript",
    // Skill files (SKILL.md files are detected by content, but .skill extension too)
    skill: "skill",
  };
  return typeMap[ext] || "other";
}

/** Check if a file name looks like a Claude skill */
export function isSkillFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower === "skill.md" || lower.endsWith("/skill.md") || lower.endsWith(".skill");
}

/** Full ingestion pipeline for a single resource */
export async function ingestResource(resourceId: string): Promise<void> {
  // 1. Mark as processing
  await db
    .update(resources)
    .set({ indexStatus: "processing", updatedAt: new Date() })
    .where(eq(resources.id, resourceId));

  try {
    // 2. Fetch resource record
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) throw new Error(`Resource ${resourceId} not found`);
    if (!resource.fileUrl) throw new Error(`Resource ${resourceId} has no file URL`);

    // 3. Extract the storage key from the file URL (decode URI to match MinIO key)
    const url = new URL(resource.fileUrl);
    const key = decodeURIComponent(url.pathname.split("/").slice(2).join("/")); // Remove /bucket/ prefix

    // 4. Download file from MinIO
    const buffer = await getFile(key);

    // 5. Determine type (override if it's a skill file)
    let type = resource.type as ResourceType;
    if (isSkillFile(resource.fileName)) {
      type = "skill";
    }

    // 6. Extract text
    const extraction = await extractText(buffer, type);
    const contentHash = hashContent(extraction.text);

    // 7. Check for duplicate content
    if (resource.contentHash === contentHash) {
      console.log(`[Ingest] Skipping ${resource.fileName} — content unchanged`);
      await db
        .update(resources)
        .set({ indexStatus: "ready", updatedAt: new Date() })
        .where(eq(resources.id, resourceId));
      return;
    }

    // 8. Delete old embeddings if re-ingesting
    await db
      .delete(embeddings)
      .where(eq(embeddings.resourceId, resourceId));

    // 9. Chunk the text
    const chunks = buildChunkedDocuments(
      extraction.text,
      extraction.pages
    );

    if (chunks.length === 0) {
      console.log(`[Ingest] No chunks generated for ${resource.fileName}`);
      await db
        .update(resources)
        .set({
          indexStatus: "ready",
          contentHash,
          chunkCount: 0,
          pageCount: extraction.pageCount,
          updatedAt: new Date(),
        })
        .where(eq(resources.id, resourceId));
      return;
    }

    // 10. Generate embeddings in batches
    const provider = getEmbeddingProvider();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const batchTexts = batch.map((c) => c.content);
      const batchEmbeddings = await provider.embedMany(batchTexts);
      allEmbeddings.push(...batchEmbeddings);
      console.log(
        `[Ingest] ${resource.fileName}: embedded ${Math.min(i + EMBEDDING_BATCH_SIZE, chunks.length)}/${chunks.length} chunks`
      );
    }

    // 11. Store embeddings in batches of 100
    for (let i = 0; i < chunks.length; i += 100) {
      const batch = chunks.slice(i, i + 100).map((chunk, idx) => ({
        resourceId,
        content: chunk.content,
        embedding: allEmbeddings[i + idx],
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        metadata: chunk.metadata,
      }));

      await db.insert(embeddings).values(batch);
    }

    // 12. Update resource status
    await db
      .update(resources)
      .set({
        indexStatus: "ready",
        contentHash,
        chunkCount: chunks.length,
        pageCount: extraction.pageCount,
        type, // Update type in case we detected skill
        updatedAt: new Date(),
      })
      .where(eq(resources.id, resourceId));

    console.log(
      `[Ingest] ✓ ${resource.fileName}: ${chunks.length} chunks, ${extraction.pageCount ?? "?"} pages`
    );
  } catch (error) {
    console.error(`[Ingest] ✗ Failed for resource ${resourceId}:`, error);
    await db
      .update(resources)
      .set({
        indexStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(resources.id, resourceId));
    throw error;
  }
}
