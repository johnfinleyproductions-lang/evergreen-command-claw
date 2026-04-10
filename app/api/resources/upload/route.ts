import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { resources, prompts } from "@/lib/db/schema";
import { uploadFile, ensureBucket } from "@/lib/storage/minio";
import { detectResourceType, isSkillFile } from "@/lib/rag";
import { isZipFile, extractZipContents } from "@/lib/rag/extract-zip";
import type { ResourceType } from "@/lib/rag";

const VALID_TYPES: ResourceType[] = [
  "pdf", "docx", "markdown", "text", "code", "url",
  "transcript", "image", "html", "skill", "other",
];

/** Check if a markdown file looks like a prompt */
function looksLikePrompt(fileName: string, content: string): boolean {
  const name = fileName.toLowerCase();
  if (name.includes("prompt")) return true;
  if (name.includes("chatgpt") || name.includes("gpt")) return true;
  if (content.includes("```") && (
    content.toLowerCase().includes("you are") ||
    content.toLowerCase().includes("i want you to") ||
    content.toLowerCase().includes("act as") ||
    content.toLowerCase().includes("step 1:") ||
    content.toLowerCase().includes("your task")
  )) return true;
  return false;
}

/** Auto-detect tags from filename patterns */
function autoTagFromFilename(fileName: string): string[] {
  const tags: string[] = [];
  if (fileName.startsWith("[BONUS]")) tags.push("bonus");
  if (fileName.startsWith("[PGA]")) tags.push("PGA");
  if (fileName.toLowerCase().includes("chatgpt")) tags.push("ChatGPT");
  if (fileName.toLowerCase().includes("hook")) tags.push("hooks");
  if (fileName.toLowerCase().includes("headline")) tags.push("headlines");
  if (fileName.toLowerCase().includes("voice")) tags.push("voice");
  if (fileName.toLowerCase().includes("email")) tags.push("email");
  if (fileName.toLowerCase().includes("landing page")) tags.push("landing-page");
  if (fileName.toLowerCase().includes("outline")) tags.push("outlining");
  if (fileName.toLowerCase().includes("niche") || fileName.toLowerCase().includes("niching")) tags.push("niche");
  return tags;
}

/** Sanitize a filename for safe storage in MinIO */
function sanitizeFileName(name: string): string {
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\-]/g, "");
}

/** Upload a single file: store in MinIO + create DB record */
async function uploadSingleFile(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  type: string,
  metadata?: Record<string, unknown>,
  tags?: string[]
) {
  const safeName = sanitizeFileName(fileName);
  const key = `resources/${randomUUID()}/${safeName}`;
  const fileUrl = await uploadFile(key, buffer, mimeType);

  const [resource] = await db
    .insert(resources)
    .values({
      fileName,
      fileUrl,
      type: type as typeof resources.$inferInsert.type,
      indexStatus: "pending",
      fileSize: buffer.length,
      mimeType: mimeType || null,
      metadata: metadata || null,
      tags: tags && tags.length > 0 ? tags : [],
    })
    .returning();

  return resource;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    // Optional type override — caller can force a specific resource type
    const typeOverride = formData.get("type") as string | null;
    // Optional tags — comma-separated string e.g. "source:skool,chapter:ai-native-entrepreneur,section:co-builds"
    const tagsRaw = formData.get("tags") as string | null;
    const callerTags: string[] = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await ensureBucket();

    // ── ZIP / Archive handling ────────────────────────────────────────────────
    if (isZipFile(file.name, buffer)) {
      console.log(`[Upload] Detected archive: ${file.name}, extracting...`);

      const extractedFiles = extractZipContents(buffer);

      if (extractedFiles.length === 0) {
        return NextResponse.json(
          { error: "No supported files found in archive" },
          { status: 400 }
        );
      }

      const zipSafeName = sanitizeFileName(file.name);
      const zipKey = `archives/${randomUUID()}/${zipSafeName}`;
      await uploadFile(zipKey, buffer, file.type || "application/zip");

      const created: Array<{
        id: string;
        fileName: string;
        type: string;
        fileUrl: string;
        status: string;
      }> = [];

      for (const extracted of extractedFiles) {
        try {
          let type: string = extracted.type;
          if (isSkillFile(extracted.fileName)) {
            type = "skill";
          } else if (typeOverride && VALID_TYPES.includes(typeOverride as ResourceType)) {
            type = typeOverride;
          }

          const resource = await uploadSingleFile(
            extracted.fileName,
            extracted.buffer,
            extracted.mimeType,
            type,
            {
              sourceArchive: file.name,
              archivePath: extracted.archivePath,
            },
            callerTags
          );

          created.push({
            id: resource.id,
            fileName: resource.fileName,
            type: resource.type,
            fileUrl: resource.fileUrl!,
            status: resource.indexStatus,
          });
        } catch (err) {
          console.error(`[Upload] Failed to process ${extracted.fileName} from archive:`, err);
        }
      }

      console.log(`[Upload] Archive ${file.name}: created ${created.length}/${extractedFiles.length} resources`);

      // Auto-import markdown files that look like prompts
      let promptsImported = 0;
      for (const extracted of extractedFiles) {
        if (extracted.type === "markdown" || extracted.type === "text") {
          const content = extracted.buffer.toString("utf-8");
          if (looksLikePrompt(extracted.fileName, content)) {
            try {
              const title = extracted.fileName.replace(/\.[^.]+$/, "").trim();
              const tags = ["imported", ...autoTagFromFilename(extracted.fileName), ...callerTags];
              await db.insert(prompts).values({
                title,
                content,
                type: "template",
                description: content.slice(0, 200).replace(/[#*`\n]/g, " ").trim(),
                tags,
                metadata: {
                  sourceArchive: file.name,
                  archivePath: extracted.archivePath,
                },
              });
              promptsImported++;
            } catch (err) {
              console.error(`[Upload] Failed to auto-import prompt "${extracted.fileName}":`, err);
            }
          }
        }
      }

      if (promptsImported > 0) {
        console.log(`[Upload] Auto-imported ${promptsImported} prompts from archive`);
      }

      return NextResponse.json({
        archive: true,
        sourceFile: file.name,
        count: created.length,
        promptsImported,
        resources: created,
      });
    }

    // ── Single file handling ──────────────────────────────────────────────────
    let type: string = detectResourceType(file.name);
    if (isSkillFile(file.name)) {
      type = "skill";
    } else if (typeOverride && VALID_TYPES.includes(typeOverride as ResourceType)) {
      type = typeOverride;
    }

    const resource = await uploadSingleFile(
      file.name,
      buffer,
      file.type || "application/octet-stream",
      type,
      undefined,
      callerTags
    );

    return NextResponse.json({
      id: resource.id,
      fileName: resource.fileName,
      type: resource.type,
      fileUrl: resource.fileUrl,
      status: resource.indexStatus,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
