// app/api/artifacts/[id]/content/route.ts
//
// Phase 5.0.1 — Serve artifact content from Postgres (with legacy file fallback).
//
// The Phase 5.0 version tried to coordinate disk paths between the Python
// worker and the Next.js app and required ARTIFACTS_DIR + realpath
// containment checks. That returned 500 in practice because two processes
// on the same machine disagreed about filesystem state.
//
// This version reads from the `content` column on the artifacts table.
// For legacy rows (content IS NULL), it falls back to the Phase 5.0 file
// path logic so old runs keep working.
//
// Response:
//   - Content-Type = artifacts.mime_type (or application/octet-stream)
//   - Content-Disposition = inline by default; attachment if ?download=1

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/client";
import { artifacts } from "@/lib/db/schema/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: artifacts.id,
      name: artifacts.name,
      path: artifacts.path,
      mimeType: artifacts.mimeType,
      content: artifacts.content,
      contentSize: artifacts.contentSize,
    })
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const contentType = row.mimeType ?? "application/octet-stream";
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="${sanitizeFilename(row.name)}"`
    : `inline; filename="${sanitizeFilename(row.name)}"`;

  // --- Path A: content lives in the DB (Phase 5.0.1+, happy path) ---
  if (row.content !== null && row.content !== undefined) {
    const bytes = Buffer.from(row.content, "utf-8");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-cache",
      },
    });
  }

  // --- Path B: legacy file-based artifact (backwards compatibility) ---
  const artifactsDir = process.env.ARTIFACTS_DIR;
  if (!artifactsDir) {
    return NextResponse.json(
      {
        error:
          "Legacy artifact requires ARTIFACTS_DIR. Add it to .env.local or re-run the task to populate the content column.",
      },
      { status: 500 },
    );
  }

  let realRoot: string;
  let realPath: string;
  try {
    realRoot = await realpath(path.resolve(artifactsDir));
  } catch {
    return NextResponse.json(
      {
        error: `ARTIFACTS_DIR does not exist or is inaccessible: ${artifactsDir}`,
      },
      { status: 500 },
    );
  }

  try {
    realPath = await realpath(path.resolve(row.path));
  } catch {
    return NextResponse.json(
      { error: "Artifact file is missing on disk" },
      { status: 410 },
    );
  }

  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (!realPath.startsWith(rootWithSep)) {
    return NextResponse.json(
      { error: "Artifact path is outside ARTIFACTS_DIR" },
      { status: 403 },
    );
  }

  let fileStat;
  try {
    fileStat = await stat(realPath);
  } catch {
    return NextResponse.json(
      { error: "Artifact file is missing on disk" },
      { status: 410 },
    );
  }
  if (!fileStat.isFile()) {
    return NextResponse.json(
      { error: "Artifact path is not a regular file" },
      { status: 400 },
    );
  }

  const bytes = await readFile(realPath);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-cache",
    },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/"/g, "").replace(/[\r\n]/g, " ");
}
