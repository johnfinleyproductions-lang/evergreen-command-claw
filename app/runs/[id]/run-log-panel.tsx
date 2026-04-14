// app/runs/[id]/run-log-panel.tsx
//
// Client component with smart auto-scroll. Sticks to the bottom while new
// logs arrive unless the user has scrolled up.
// Phase 5.4.1 — wrapped in Card, status pill refactored onto shared palette.
// Phase 5.4.1 (round 2) — fires router.refresh() once on SSE termination,
// so the run detail page auto-updates when the run naturally completes.

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRunLogs, type LogLevel } from "@/lib/hooks/use-run-logs";
import { cn } from "@/lib/utils/cn";

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground/80",
  warn: "text-amber-300",
  error: "text-red-400",
};

function StreamStatus({
  status,
  finalRunStatus,
  error,
}: {
  status: string;
  finalRunStatus: string | null;
  error: string | null;
}) {
  if (status === "connecting") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
        connecting…
      </span>
    );
  }
  if (status === "streaming") {
    return (
      <span className="text-emerald-300 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        streaming live
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        done{finalRunStatus ? ` · ${finalRunStatus}` : ""}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-destructive flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        error{error ? ` · ${error}` : ""}
      </span>
    );
  }
  return <span className="text-muted-foreground">idle</span>;
}

export function RunLogPanel({ runId }: { runId: string }) {
  const router = useRouter();
  const { logs, status, error, finalRunStatus } = useRunLogs(runId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const refreshedRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Fire router.refresh() exactly once when the run terminates, so the
  // server component re-reads status/output/error without an F5.
  useEffect(() => {
    if (refreshedRef.current) return;
    if (!finalRunStatus) return;
    if (finalRunStatus === "pending" || finalRunStatus === "running") return;
    refreshedRef.current = true;
    // Tiny debounce so the last log row paints before the server refetch.
    const t = window.setTimeout(() => router.refresh(), 300);
    return () => window.clearTimeout(t);
  }, [finalRunStatus, router]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 40;
  };

  return (
    <div className="rounded-lg border border-border bg-black/60 text-foreground/90 font-mono text-xs overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/60">
        <StreamStatus
          status={status}
          finalRunStatus={finalRunStatus}
          error={error}
        />
        <span className="text-muted-foreground tabular-nums">
          {logs.length.toLocaleString()} lines
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[480px] overflow-auto p-4 space-y-0.5"
      >
        {logs.length === 0 && status !== "done" && (
          <div className="text-muted-foreground italic">
            Waiting for logs…
          </div>
        )}
        {logs.length === 0 && status === "done" && (
          <div className="text-muted-foreground italic">
            No logs recorded for this run.
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 leading-relaxed">
            <span className="text-muted-foreground/70 shrink-0 tabular-nums">
              {new Date(log.createdAt).toLocaleTimeString("en-US", {
                hour12: false,
              })}
            </span>
            <span
              className={cn(
                "shrink-0 w-12 uppercase text-[10px] tracking-wider self-center",
                LEVEL_COLORS[log.level] ?? "text-muted-foreground"
              )}
            >
              {log.level}
            </span>
            <span className="whitespace-pre-wrap break-words min-w-0">
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
