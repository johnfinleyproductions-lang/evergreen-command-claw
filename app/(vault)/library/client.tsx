"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  File,
  Code,
  Globe,
  Zap,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Download,
  X,
  Tag,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Resource {
  id: string;
  fileName: string;
  fileUrl: string | null;
  type: string;
  indexStatus: string;
  fileSize: number | null;
  chunkCount: number | null;
  pageCount: number | null;
  tags: string[] | null;
  createdAt: string;
}

const TYPE_FILTERS = [
  "All",
  "PDF",
  "DOCX",
  "Markdown",
  "HTML",
  "Code",
  "Skills",
  "Transcript",
];

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: File,
  markdown: FileText,
  text: FileText,
  code: Code,
  html: Globe,
  skill: Zap,
  transcript: FileText,
  other: File,
};

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle; label: string; color: string }
> = {
  ready: { icon: CheckCircle, label: "Ready", color: "text-green-400" },
  processing: { icon: Loader2, label: "Indexing", color: "text-amber-400" },
  pending: { icon: Clock, label: "Pending", color: "text-text-dim" },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400" },
};

const TEXT_PREVIEW_TYPES = new Set(["transcript", "text", "markdown", "html", "code"]);

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function ResourcePanel({
  resource,
  onClose,
  onDelete,
  onReindex,
}: {
  resource: Resource;
  onClose: () => void;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const canPreview = TEXT_PREVIEW_TYPES.has(resource.type);

  // Auto-load preview for text-based files
  useEffect(() => {
    if (!canPreview || !resource.fileUrl) return;
    setLoadingPreview(true);
    fetch(`/api/resources/preview?id=${resource.id}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => setPreview(text))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [resource.id, resource.fileUrl, canPreview]);

  async function handleSummarize() {
    setSummarizing(true);
    setSummary(null);
    try {
      const res = await fetch("/api/resources/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: resource.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      } else {
        setSummary("Failed to generate summary. Try re-indexing this resource first.");
      }
    } catch {
      setSummary("Failed to generate summary.");
    } finally {
      setSummarizing(false);
    }
  }

  const Icon = TYPE_ICONS[resource.type] || File;
  const status = STATUS_CONFIG[resource.indexStatus] || STATUS_CONFIG.pending;
  const StatusIcon = status.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 shrink-0">
            <Icon className="h-4 w-4 text-text-dim" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight break-all">{resource.fileName}</p>
            <p className="text-xs text-text-dim mt-0.5">{formatDate(resource.createdAt)}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-surface-2 text-text-dim hover:text-text transition-colors shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-text-dim mb-0.5">Type</p>
            <p className="capitalize font-medium">{resource.type}</p>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-text-dim mb-0.5">Size</p>
            <p className="font-medium">{formatFileSize(resource.fileSize)}</p>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-text-dim mb-0.5">Chunks</p>
            <p className="font-medium">{resource.chunkCount ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-1 mb-0.5">
              <StatusIcon className={cn("h-3 w-3", status.color, resource.indexStatus === "processing" && "animate-spin")} />
              <p className={cn("text-text-dim")}>Status</p>
            </div>
            <p className={cn("font-medium", status.color)}>{status.label}</p>
          </div>
        </div>

        {/* Tags */}
        {resource.tags && resource.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="h-3.5 w-3.5 text-text-dim" />
              <p className="text-xs text-text-dim font-medium">Tags</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {resource.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-xs text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {resource.fileUrl && (
            <a
              href={resource.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-dim transition-colors"
            >
              <Download className="h-4 w-4" />
              Download File
            </a>
          )}

          {resource.indexStatus === "ready" && (
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {summarizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {summarizing ? "Summarizing…" : "Summarize"}
            </button>
          )}

          <div className="flex gap-2">
            {(resource.indexStatus === "failed" || resource.indexStatus === "ready" || resource.indexStatus === "pending") && (
              <button
                onClick={() => onReindex(resource.id)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-text-muted hover:bg-surface-2 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-index
              </button>
            )}
            <button
              onClick={() => onDelete(resource.id)}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-xs text-accent font-medium mb-2">Summary</p>
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        {/* Text Preview */}
        {canPreview && (
          <div>
            <p className="text-xs text-text-dim font-medium mb-2">Preview</p>
            {loadingPreview ? (
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading preview…
              </div>
            ) : preview ? (
              <pre className="rounded-lg bg-surface-2 p-3 text-xs text-text-muted overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {preview.slice(0, 4000)}{preview.length > 4000 ? "\n\n… (truncated)" : ""}
              </pre>
            ) : (
              <p className="text-xs text-text-dim italic">Preview not available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LibraryClient() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [reindexing, setReindexing] = useState<Set<string>>(new Set());

  const fetchResources = useCallback(async () => {
    try {
      const typeParam =
        activeFilter === "All"
          ? ""
          : `?type=${activeFilter.toLowerCase().replace("skills", "skill")}`;
      const res = await fetch(`/api/resources${typeParam}`);
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (error) {
      console.error("Failed to fetch resources:", error);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    const hasProcessing = resources.some(
      (r) => r.indexStatus === "processing" || r.indexStatus === "pending"
    );
    if (!hasProcessing) return;
    const interval = setInterval(fetchResources, 3000);
    return () => clearInterval(interval);
  }, [resources, fetchResources]);

  // Count failed/pending for banner
  const failedCount = resources.filter((r) => r.indexStatus === "failed").length;
  const pendingCount = resources.filter((r) => r.indexStatus === "pending").length;

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      const progress: string[] = [];

      for (const file of acceptedFiles) {
        try {
          progress.push(`Uploading ${file.name}...`);
          setUploadProgress([...progress]);

          const formData = new FormData();
          formData.append("file", file);
          const uploadRes = await fetch("/api/resources/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) {
            progress.push(`✗ ${file.name} upload failed`);
            setUploadProgress([...progress]);
            continue;
          }

          const data = await uploadRes.json();

          if (data.archive) {
            progress.push(`📦 Extracted ${data.count} files from ${file.name}`);
            setUploadProgress([...progress]);
            for (const res of data.resources) {
              fetch("/api/resources/vectorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resourceId: res.id }),
              }).catch(console.error);
            }
            progress.push(`✓ ${file.name}: ${data.count} files imported`);
          } else {
            progress.push(`Vectorizing ${file.name}...`);
            fetch("/api/resources/vectorize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resourceId: data.id }),
            }).catch(console.error);
            progress.push(`✓ ${file.name} uploaded`);
          }
          setUploadProgress([...progress]);
        } catch (error) {
          progress.push(`✗ ${file.name} failed: ${error}`);
          setUploadProgress([...progress]);
        }
      }

      setUploading(false);
      setUploadProgress([]);
      fetchResources();
    },
    [fetchResources]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: resources.length > 0,
  });

  async function handleDelete(resourceId: string) {
    if (!confirm("Delete this resource and all its embeddings?")) return;
    await fetch("/api/resources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId }),
    });
    if (selectedResource?.id === resourceId) setSelectedResource(null);
    fetchResources();
  }

  async function handleReindex(resourceId: string) {
    setReindexing((prev) => new Set(prev).add(resourceId));
    try {
      await fetch("/api/resources/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
      });
    } finally {
      setReindexing((prev) => {
        const next = new Set(prev);
        next.delete(resourceId);
        return next;
      });
      fetchResources();
    }
  }

  async function handleRetryAll() {
    const targets = resources.filter(
      (r) => r.indexStatus === "failed" || r.indexStatus === "pending"
    );
    for (const r of targets) {
      handleReindex(r.id);
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Main list */}
      <div className={cn("flex-1 space-y-4 min-w-0", selectedResource && "hidden lg:block")}>

        {/* Failed/pending banner with Retry All */}
        {(failedCount > 0 || pendingCount > 0) && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span className="text-red-300">
                {failedCount > 0 && `${failedCount} failed`}
                {failedCount > 0 && pendingCount > 0 && ", "}
                {pendingCount > 0 && `${pendingCount} pending`}
                {" "}— not yet indexed
              </span>
            </div>
            <button
              onClick={handleRetryAll}
              className="flex items-center gap-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 px-3 py-1 text-xs text-red-300 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry All
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  activeFilter === filter
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "text-text-muted hover:bg-surface-2"
                )}
              >
                {filter}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-dim transition-colors cursor-pointer shrink-0">
            <Upload className="h-4 w-4" />
            Upload
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onDrop(Array.from(e.target.files));
              }}
            />
          </label>
        </div>

        {uploadProgress.length > 0 && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-1">
            {uploadProgress.map((msg, i) => (
              <p key={i} className="text-sm text-text-muted">{msg}</p>
            ))}
          </div>
        )}

        {resources.length === 0 && !uploading ? (
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 transition-colors cursor-pointer",
              isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-border-hover"
            )}
          >
            <input {...getInputProps()} />
            <Upload className={cn("h-6 w-6 mb-4", isDragActive ? "text-accent" : "text-text-dim")} />
            <h3 className="font-medium text-text-muted">
              {isDragActive ? "Drop files here" : "No resources yet"}
            </h3>
            <p className="mt-1 text-sm text-text-dim">
              {isDragActive ? "Release to upload" : "Drag and drop or click Upload"}
            </p>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={cn("rounded-xl border transition-colors", isDragActive ? "border-accent bg-accent/5" : "border-border")}
          >
            <input {...getInputProps()} />
            {isDragActive && (
              <div className="flex items-center justify-center py-8 border-b border-border">
                <p className="text-sm text-accent font-medium">Drop to upload</p>
              </div>
            )}
            <div className="divide-y divide-border">
              <div className="grid grid-cols-[1fr_100px_80px_80px_100px_40px] gap-4 px-4 py-2 text-xs text-text-dim font-medium">
                <span>Name</span>
                <span>Type</span>
                <span>Size</span>
                <span>Chunks</span>
                <span>Status</span>
                <span></span>
              </div>
              {resources.map((resource) => {
                const Icon = TYPE_ICONS[resource.type] || File;
                const status = STATUS_CONFIG[resource.indexStatus] || STATUS_CONFIG.pending;
                const StatusIcon = status.icon;
                const isSelected = selectedResource?.id === resource.id;
                const isRetrying = reindexing.has(resource.id);
                const canRetry = resource.indexStatus === "failed" || resource.indexStatus === "pending";

                return (
                  <div
                    key={resource.id}
                    onClick={() => setSelectedResource(isSelected ? null : resource)}
                    className={cn(
                      "grid grid-cols-[1fr_100px_80px_80px_100px_40px] gap-4 px-4 py-3 items-center cursor-pointer transition-colors",
                      isSelected ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-surface-2/50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 text-text-dim shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{resource.fileName}</p>
                        <p className="text-[10px] text-text-dim">{formatDate(resource.createdAt)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-text-muted capitalize">{resource.type}</span>
                    <span className="text-xs text-text-muted">{formatFileSize(resource.fileSize)}</span>
                    <span className="text-xs text-text-muted">{resource.chunkCount ?? "—"}</span>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={cn("h-3.5 w-3.5", status.color, resource.indexStatus === "processing" && "animate-spin")} />
                      <span className={cn("text-xs", status.color)}>{status.label}</span>
                    </div>
                    {/* Inline retry button */}
                    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      {canRetry && (
                        <button
                          onClick={() => handleReindex(resource.id)}
                          disabled={isRetrying}
                          title="Retry indexing"
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isRetrying
                              ? "text-text-dim cursor-not-allowed"
                              : "text-text-dim hover:bg-amber-500/10 hover:text-amber-400"
                          )}
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedResource && (
        <div className="w-80 shrink-0 rounded-xl border border-border bg-surface-1 overflow-hidden flex flex-col">
          <ResourcePanel
            resource={selectedResource}
            onClose={() => setSelectedResource(null)}
            onDelete={handleDelete}
            onReindex={handleReindex}
          />
        </div>
      )}
    </div>
  );
}
