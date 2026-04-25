// app/runs/[id]/artifact-panel.tsx
//
// Phase 5.0 — Right-rail panel on the run detail page showing all artifacts
// produced by the run. Fetches /api/runs/[id]/artifacts on mount and polls
// every 5s while the run is non-terminal (pending/running).
// Phase 5.4.1 — wrapped in Card, badges use the shared Badge primitive.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  FileCode,
  FileImage,
  File as FileIcon,
  Database,
  ScrollText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelativeTime } from "@/lib/utils/time";
import { ArtifactPreviewDialog } from "./artifact-preview-dialog";

type ArtifactKind = "report" | "data" | "image" | "code" | "log" | "other";

interface ArtifactListItem {
  id: string;
  runId: string;
  name: string;
  kind: ArtifactKind;
  mimeType: string | null;
  size: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const KIND_ICONS: Record<ArtifactKind, typeof FileText> = {
  report: FileText,
  data: Database,
  image: FileImage,
  code: FileCode,
  log: ScrollText,
  other: FileIcon,
};

const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function ArtifactPanel({
  runId,
  runStatus,
}: {
  runId: string;
  runStatus: string;
}) {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/artifacts`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`${res.status} ${res.statusText}`);
        return;
      }
      const data = (await res.json()) as { artifacts: ArtifactListItem[] };
      setItems(data.artifacts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchList();
    if (TERMINAL_STATUSES.has(runStatus)) return;
    const id = setInterval(fetchList, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchList, runStatus]);

  const polling = !TERMINAL_STATUSES.has(runStatus);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Artifacts
          </h2>
          <div className="flex items-center gap-2">
            {polling && (
              <Badge variant="info" className="text-[10px] py-0">
                polling 5s
              </Badge>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length}
            </span>
          </div>
        </div>
        <div className="p-2 max-h-[600px] overflow-auto">
          {loading && items.length === 0 && (
            <div className="text-xs text-muted-foreground italic p-2">
              Loading…
            </div>
          )}
          {!loading && error && (
            <div className="text-xs text-destructive p-2">Error: {error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="text-xs text-muted-foreground italic p-3">
              No artifacts yet.
              {polling && " Still running — polling every 5s."}
            </div>
          )}
          <ul className="space-y-0.5">
            {items.map((a) => {
              const Icon = KIND_ICONS[a.kind] ?? FileIcon;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="w-full text-left px-2 py-2 rounded-md hover:bg-secondary/70 transition-colors flex items-start gap-2 group"
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate text-foreground">
                        {a.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                        <span className="uppercase tracking-wider">
                          {a.kind}
                        </span>
                        {a.size != null && <span>{formatBytes(a.size)}</span>}
                        <span>{formatRelativeTime(a.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      {selectedId && (
        <ArtifactPreviewDialog
          artifactId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
