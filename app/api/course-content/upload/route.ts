import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { courseContent } from "@/lib/db/schema";
import { uploadFile, ensureBucket } from "@/lib/storage/minio";

function sanitizeFileName(name: string): string {
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\-]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const chapter = (formData.get("chapter") as string) || "Unknown Chapter";
    const section = (formData.get("section") as string) || null;
    const nameOverride = formData.get("name") as string | null;
    const tagsRaw = formData.get("tags") as string | null;
    const existingId = formData.get("existingId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await ensureBucket();

    const safeName = sanitizeFileName(file.name);
    const key = `course-content/${randomUUID()}/${safeName}`;
    const mimeType = file.name.endsWith(".srt") ? "text/plain" :
                     file.name.endsWith(".txt") ? "text/plain" :
                     file.type || "application/octet-stream";
    const fileUrl = await uploadFile(key, buffer, mimeType);

    const name = nameOverride || file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();

    // If existingId provided, UPDATE that record with the fileUrl instead of creating new
    if (existingId) {
      const [updated] = await db
        .update(courseContent)
        .set({ fileUrl, updatedAt: new Date() })
        .where(eq(courseContent.id, existingId))
        .returning();

      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        chapter: updated.chapter,
        section: updated.section,
        fileName: updated.fileName,
        fileUrl: updated.fileUrl,
        updated: true,
      });
    }

    // Otherwise create a new record
    const [record] = await db
      .insert(courseContent)
      .values({
        name,
        chapter,
        section,
        fileName: file.name,
        fileUrl,
        contentType: mimeType,
        tags,
        metadata: {
          fileSize: buffer.length,
          minioKey: key,
        },
      })
      .returning();

    return NextResponse.json({
      id: record.id,
      name: record.name,
      chapter: record.chapter,
      section: record.section,
      fileName: record.fileName,
      fileUrl: record.fileUrl,
      updated: false,
    });
  } catch (error) {
    console.error("[CourseContent Upload] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
