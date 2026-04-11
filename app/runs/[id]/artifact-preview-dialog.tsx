// app/runs/[id]/artifact-preview-dialog.tsx
//
// Phase 5.0 — Preview modal for a single artifact. Controlled by its
// parent; lazy-loads metadata + content when mounted.
//
// Content rendering strategy (v1):
//   - text/markdown + text/*  → pre-wrap monospace block
//   - application/json/xml/js → pre-wrap monospace block
//   - image/*                 → <img> with object-contain
//   - everything else         → "download only" message
//
// Markdown gets rendered as plain pre-wrap text, NOT parsed to HTML. If we
// want rich markdown (headings, code blocks, GFM tables), add react-markdown
// as a dep and swap the render branch. Keeping blast radius small for v1.

"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ArtifactMetadata {
  id: string;
  runId: string;
  name: string;
  kind: string;
  mimeType: string | null;
  size: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function ArtifactPreviewDialog({
  artifactId,
  onClose,
}: {
  artifactId: string;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<ArtifactMetadata | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const metaRes = await fetch(`/api/artifacts/${artifactId}`, {
          cache: "no-store",
        });
        if (!metaRes.ok) throw new Error(`metadata ${metaRes.status}`);
        const metaJson = (await metaRes.json()) as { artifact: ArtifactMetadata };
        if (cancelled) return;
        setMeta(metaJson.artifact);

        const mime = metaJson.artifact.mimeType ?? "application/octet-stream";
        if (isPreviewableText(mime)) {
          setContentLoading(true);
          const contentRes = await fetch(
            `/api/artifacts/${artifactId}/content`,
            { cache: "no-store" },
          );
          if (!contentRes.ok) {
            throw new Error(`content ${contentRes.status}`);
          }
          const text = await contentRes.text();
          if (cancelled) return;
          setContent(text);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "load failed");
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const mime = meta?.mimeType ?? null;
  const isImage = mime?.startsWith("image/") ?? false;
  const isText = mime ? isPreviewableText(mime) : false;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8 truncate">
            {meta?.name ?? "Loading…"}
          </DialogTitle>
          <DialogDescription>
            {meta
              ? `${meta.kind} · ${meta.mimeType ?? "unknown"}${meta.size != null ? ` · ${formatSize(meta.size)}` : ""}`
              : " "}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto p-5 min-h-[200px]">
          {error && <div className="text-sm text-red-600">Error: {error}</div>}

          {!error && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/artifacts/${artifactId}/content`}
              alt={meta?.name ?? ""}
              className="max-w-full h-auto mx-auto"
            />
          )}

          {!error && isText && contentLoading && (
            <div className="text-sm text-muted-foreground italic">
              Loading content…
            </div>
          )}

          {!error && isText && !contentLoading && content != null && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {content}
            </pre>
          )}

          {!error && meta && !isImage && !isText && (
            <div className="text-sm text-muted-foreground">
              Preview not supported for {meta.mimeType ?? "this file type"}. Use
              download.
            </div>
          )}
        </div>

        <DialogFooter>
          <a
            href={`/api/artifacts/${artifactId}/content?download=1`}
            download={meta?.name}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isPreviewableText(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml"
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
