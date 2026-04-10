import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { prompts } from "@/lib/db/schema";

interface ImportedPrompt {
  title: string;
  content: string;
  tags?: string[];
  module?: string;
  sourceArchive?: string;
}

/** Bulk import prompts from parsed archive data */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: ImportedPrompt[] = body.prompts;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No prompts provided" },
        { status: 400 }
      );
    }

    const created = [];

    for (const item of items) {
      try {
        const tags: string[] = [...(item.tags || [])];
        if (item.module) tags.push(item.module);
        if (item.sourceArchive) tags.push("imported");

        const [prompt] = await db
          .insert(prompts)
          .values({
            title: item.title,
            content: item.content,
            type: "template",
            description: item.content.slice(0, 200).replace(/[#*`\n]/g, " ").trim(),
            tags,
            metadata: item.sourceArchive
              ? { sourceArchive: item.sourceArchive }
              : null,
          })
          .returning();

        created.push(prompt);
      } catch (err) {
        console.error(`[Prompts Import] Failed to import "${item.title}":`, err);
      }
    }

    return NextResponse.json({
      imported: created.length,
      total: items.length,
      prompts: created,
    });
  } catch (error) {
    console.error("[Prompts Import] Error:", error);
    return NextResponse.json(
      { error: "Failed to import prompts" },
      { status: 500 }
    );
  }
}
