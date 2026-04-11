// app/api/artifacts/[id]/content/route.ts
//
// Phase 5.0 — Stream artifact file contents.
//
// Security model:
//   1. ARTIFACTS_DIR must be set in process.env. We fail loud with 500 if
//      not — no fallback, no silent defaults, no drift between worker and
//      web app.
//   2. We resolve both the configured ARTIFACTS_DIR and the artifact's
//      stored `path` via fs.realpath, then verify the artifact's real
//      path lives strictly inside ARTIFACTS_DIR with a trailing-separator
//      prefix check. This defeats both relative-path traversal and
//      symlink escapes.
//   3. The raw filesystem `path` column is never sent to the client from
//      any API route. It exists only server-side, read here and in
//      worker/tools/write_brief.py.
//
// Response:
//   - Content-Type = artifacts.mime_type (or application/octet-stream)
//   - Content-Disposition = inline by default; attachment if ?download=1
//
// Artifacts are small markdown briefs (single-digit KB), so we readFile
// into a Buffer rather than piping. If we ever store images or large
// files, swap to a ReadableStream via Readable.toWeb(createReadStream(...)).

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

  const artifactsDir = process.env.ARTIFACTS_DIR;
  if (!artifactsDir) {
    return NextResponse.json(
      {
        error:
          "ARTIFACTS_DIR is not set. Add it to .env.local — must match the value worker/config.py uses.",
      },
      { status: 500 },
    );
  }

  const [row] = await db
    .select({
      id: artifacts.id,
      name: artifacts.name,
      path: artifacts.path,
      mimeType: artifacts.mimeType,
    })
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Resolve both sides of the containment check through realpath so symlinks
  // cannot sneak the artifact out of the sandbox.
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
    // 410 Gone — row survived a deletion on disk.
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
  const contentType = row.mimeType ?? "application/octet-stream";
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="${sanitizeFilename(row.name)}"`
    : `inline; filename="${sanitizeFilename(row.name)}"`;

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
  // Keep it ASCII-safe for Content-Disposition filename= — write_brief
  // already slugs on the way in, but belt and suspenders.
  return name.replace(/"/g, "").replace(/[\r\n]/g, " ");
}
