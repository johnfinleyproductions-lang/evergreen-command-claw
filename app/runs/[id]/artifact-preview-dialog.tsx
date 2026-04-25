// app/runs/[id]/artifact-preview-dialog.tsx
//
// Phase 5.0 — Preview modal for a single artifact. Controlled by its
// parent; lazy-loads metadata + content when mounted.
// Phase 5.4.1 (round 2) — polished with shadcn primitives, shared
// formatBytes, copy-to-clipboard action, and clearer error/empty states.
//
// Content rendering strategy:
//   - text/markdown + text/*  → pre-wrap monospace block (with Copy)
//   - application/json/xml/js → pre-wrap monospace block (with Copy)
//   - image/*                 → <img> with object-contain
//   - everything else         → "download only" message with FileX icon
//
// Markdown is rendered as plain pre-wrap text, not parsed. Swap the text
// branch for react-markdown if rich rendering becomes needed.

"use client";

import { useEffect, useState } from "react";
import {
  Download,
  Copy,
  Check,
  FileX,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/utils/time";
import { useToast } from "@/lib/hooks/use-toast";

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

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }
  // Legacy fallback — required on non-secure origins.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

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

  async function handleCopy() {
    if (content == null) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      toast({ title: "Copied to clipboard", variant: "success" });
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({
        title: "Copy failed",
        description: "Your browser blocked the write. Try downloading instead.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8 truncate">
            {meta?.name ?? "Loading…"}
          </DialogTitle>
          <DialogDescription>
            {meta ? (
              <span className="font-mono">
                {meta.kind}
                {meta.mimeType ? ` · ${meta.mimeType}` : ""}
                {meta.size != null ? ` · ${formatBytes(meta.size)}` : ""}
              </span>
            ) : (
              " "
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto p-5 min-h-[200px]">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Error loading artifact: {error}</span>
            </div>
          )}

          {!error && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/artifacts/${artifactId}/content`}
              alt={meta?.name ?? ""}
              className="max-w-full h-auto mx-auto rounded-md border border-border"
            />
          )}

          {!error && isText && contentLoading && (
            <div className="space-y-2" aria-label="Loading content">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          )}

          {!error && isText && !contentLoading && content != null && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground">
              {content}
            </pre>
          )}

          {!error && meta && !isImage && !isText && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
              <FileX className="h-8 w-8 opacity-60" />
              <p className="text-sm">
                Preview not supported for{" "}
                <span className="font-mono">
                  {meta.mimeType ?? "this file type"}
                </span>
                .
              </p>
              <p className="text-xs">Download the file to inspect it locally.</p>
            </div>
          )}

          {!error && !meta && (
            <div className="space-y-2" aria-label="Loading metadata">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          )}
        </div>

        <DialogFooter>
          {!error && isText && content != null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy content to clipboard"
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
          {!error && isImage && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/artifacts/${artifactId}/content`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                Open
              </a>
            </Button>
          )}
          <Button asChild size="sm" disabled={!meta}>
            <a
              href={`/api/artifacts/${artifactId}/content?download=1`}
              download={meta?.name}
            >
              {contentLoading && !meta ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              Download
            </a>
          </Button>
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
