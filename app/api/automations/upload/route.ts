import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { automations } from "@/lib/db/schema";
import { uploadFile, ensureBucket } from "@/lib/storage/minio";

/** Detect category from filename or path */
function detectCategory(fileName: string, folderHint?: string): string {
  const combined = `${folderHint || ""} ${fileName}`.toLowerCase();
  if (combined.includes("fundamental") || /m2l\d/i.test(combined)) return "fundamentals";
  if (combined.includes("web-app") || combined.includes("webapp") || /m3l\d/i.test(combined)) return "web-apps";
  if (combined.includes("ai-agent") || combined.includes("ai agent") || /m4l\d/i.test(combined)) return "ai-agents";
  if (combined.includes("javascript") || combined.includes("multi-agent") || /m5l\d/i.test(combined)) return "javascript";
  if (combined.includes("voice") || combined.includes("comms") || /m6l\d/i.test(combined)) return "voice-comms";
  if (combined.includes("lead") || /m7l\d/i.test(combined)) return "lead-gen";
  if (combined.includes("make") || combined.includes("conversion") || /m8l\d/i.test(combined)) return "make-conversions";
  if (combined.includes("standalone") || combined.includes("rag") || combined.includes("pdf")) return "standalone";
  return "other";
}

/** Extract a readable name from n8n workflow JSON */
function extractWorkflowName(json: Record<string, unknown>, fileName: string): string {
  if (json.name && typeof json.name === "string") return json.name;
  return fileName.replace(/\.json$/i, "").replace(/[_-]/g, " ").trim();
}

/** Count nodes in n8n workflow */
function countNodes(json: Record<string, unknown>): number {
  if (Array.isArray(json.nodes)) return json.nodes.length;
  return 0;
}

/** Sanitize a filename for MinIO */
function sanitizeFileName(name: string): string {
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\-]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tagsRaw = formData.get("tags") as string | null;
    const categoryHint = formData.get("category") as string | null;
    const folderHint = formData.get("folder") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await ensureBucket();

    // Store file in MinIO
    const safeName = sanitizeFileName(file.name);
    const key = `automations/${randomUUID()}/${safeName}`;
    const fileUrl = await uploadFile(key, buffer, file.type || "application/octet-stream");

    const isJson = file.name.toLowerCase().endsWith(".json");
    let workflowJson: Record<string, unknown> | null = null;
    let name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();
    let nodeCount = 0;
    let description: string | null = null;

    if (isJson) {
      try {
        const text = buffer.toString("utf-8");
        workflowJson = JSON.parse(text);
        name = extractWorkflowName(workflowJson!, file.name);
        nodeCount = countNodes(workflowJson!);
        description = `n8n workflow with ${nodeCount} nodes`;
      } catch {
        console.warn(`[Automations Upload] Could not parse JSON: ${file.name}`);
      }
    } else {
      description = `Follow-along document for n8n lesson`;
    }

    const category = categoryHint || detectCategory(file.name, folderHint || undefined);

    const [automation] = await db
      .insert(automations)
      .values({
        name,
        description,
        category: category as typeof automations.$inferInsert.category,
        fileName: file.name,
        fileUrl,
        workflowJson,
        nodeCount,
        tags,
        metadata: {
          originalFolder: folderHint || null,
          mimeType: file.type || null,
          fileSize: buffer.length,
        },
      })
      .returning();

    return NextResponse.json({
      id: automation.id,
      name: automation.name,
      category: automation.category,
      fileName: automation.fileName,
      fileUrl: automation.fileUrl,
      nodeCount: automation.nodeCount,
      tags: automation.tags,
    });
  } catch (error) {
    console.error("[Automations Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
