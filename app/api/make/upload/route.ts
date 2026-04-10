import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { makeBlueprints } from "@/lib/db/schema";
import { uploadFile, ensureBucket } from "@/lib/storage/minio";

function detectMakeCategory(fileName: string, folderHint?: string): string {
  const combined = `${folderHint || ""} ${fileName}`.toLowerCase();
  if (combined.includes("instagram") || combined.includes("linkedin") || combined.includes("twitter") || combined.includes("youtube") || combined.includes("social") || combined.includes("viral") || combined.includes("reel") || combined.includes("canva") || combined.includes("thumbnail")) return "social-media";
  if (combined.includes("lead") || combined.includes("email") || combined.includes("scrape") || combined.includes("outreach") || combined.includes("proposal")) return "lead-gen";
  if (combined.includes("content") || combined.includes("blog") || combined.includes("newsletter") || combined.includes("video") || combined.includes("podcast")) return "content-creation";
  if (combined.includes("voice") || combined.includes("whatsapp") || combined.includes("appointment") || combined.includes("sales") || combined.includes("crm")) return "voice-sales";
  if (combined.includes("agent") || combined.includes("brain") || combined.includes("rag") || combined.includes("research") || combined.includes("gpt") || combined.includes("deepseek")) return "ai-agents";
  if (combined.includes("saas") || combined.includes("dashboard") || combined.includes("app") || combined.includes("stripe") || combined.includes("api")) return "saas-tools";
  return "other";
}

function extractBlueprintName(json: Record<string, unknown>, fileName: string): string {
  if (json.name && typeof json.name === "string") return json.name;
  return fileName.replace(/\.json$/i, "").replace(/[_-]/g, " ").trim();
}

function countModules(json: Record<string, unknown>): number {
  if (Array.isArray(json.flow)) return json.flow.length;
  if (Array.isArray((json.blueprint as Record<string,unknown>)?.flow)) return ((json.blueprint as Record<string,unknown>).flow as unknown[]).length;
  return 0;
}

function sanitizeFileName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._\-]/g, "");
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

    const safeName = sanitizeFileName(file.name);
    const key = `make/${randomUUID()}/${safeName}`;
    const fileUrl = await uploadFile(key, buffer, file.type || "application/octet-stream");

    let blueprintJson: Record<string, unknown> | null = null;
    let name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();
    let moduleCount = 0;
    let description: string | null = null;

    try {
      const text = buffer.toString("utf-8");
      blueprintJson = JSON.parse(text);
      name = extractBlueprintName(blueprintJson!, file.name);
      moduleCount = countModules(blueprintJson!);
      description = `Make.com blueprint with ${moduleCount} modules`;
    } catch {
      console.warn(`[Make Upload] Could not parse JSON: ${file.name}`);
    }

    const category = categoryHint || detectMakeCategory(file.name, folderHint || undefined);

    const [record] = await db
      .insert(makeBlueprints)
      .values({
        name,
        description,
        category: category as typeof makeBlueprints.$inferInsert.category,
        fileName: file.name,
        fileUrl,
        blueprintJson,
        moduleCount,
        tags,
        metadata: {
          originalFolder: folderHint || null,
          mimeType: file.type || null,
          fileSize: buffer.length,
        },
      })
      .returning();

    return NextResponse.json({
      id: record.id,
      name: record.name,
      category: record.category,
      fileName: record.fileName,
      fileUrl: record.fileUrl,
      moduleCount: record.moduleCount,
      tags: record.tags,
    });
  } catch (error) {
    console.error("[Make Upload] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
