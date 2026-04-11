// app/runs/[id]/run-log-panel.tsx
//
// Client component with smart auto-scroll. Sticks to the bottom while new
// logs arrive unless the user has scrolled up.

"use client";

import { useEffect, useRef } from "react";
import { useRunLogs, type LogLevel } from "@/lib/hooks/use-run-logs";

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-gray-500",
  info: "text-gray-200",
  warn: "text-yellow-400",
  error: "text-red-400",
};

function StatusDot({
  status,
  finalRunStatus,
  error,
}: {
  status: string;
  finalRunStatus: string | null;
  error: string | null;
}) {
  if (status === "connecting") {
    return <span className="text-gray-400">connecting...</span>;
  }
  if (status === "streaming") {
    return (
      <span className="text-green-400 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        streaming live
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="text-gray-400">
        ● done{finalRunStatus ? ` (${finalRunStatus})` : ""}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-red-400">
        ● error{error ? `: ${error}` : ""}
      </span>
    );
  }
  return <span className="text-gray-500">idle</span>;
}

export function RunLogPanel({ runId }: { runId: string }) {
  const { logs, status, error, finalRunStatus } = useRunLogs(runId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 40;
  };

  return (
    <div className="border border-gray-800 rounded-md bg-black text-gray-200 font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <StatusDot status={status} finalRunStatus={finalRunStatus} error={error} />
        <span className="text-gray-500">{logs.length.toLocaleString()} lines</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[480px] overflow-auto p-3 space-y-0.5"
      >
        {logs.length === 0 && status !== "done" && (
          <div className="text-gray-500 italic">Waiting for logs...</div>
        )}
        {logs.length === 0 && status === "done" && (
          <div className="text-gray-500 italic">No logs recorded for this run.</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 leading-relaxed">
            <span className="text-gray-600 shrink-0 tabular-nums">
              {new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span
              className={`shrink-0 w-12 uppercase ${LEVEL_COLORS[log.level] ?? "text-gray-400"}`}
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
