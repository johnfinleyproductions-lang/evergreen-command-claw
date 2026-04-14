// app/runs/run-row.tsx

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Run } from "@/lib/db/schema/runs";
import { RunStatusBadge } from "@/components/run-status-badge";
import { formatRelativeTime } from "@/lib/utils/time";

export function RunRow({ run }: { run: Run }) {
  const input = (run.input ?? {}) as { prompt?: unknown };
  const rawPrompt =
    typeof input.prompt === "string" && input.prompt.length > 0
      ? input.prompt
      : "(no prompt)";
  const preview =
    rawPrompt.length > 160 ? rawPrompt.slice(0, 160) + "…" : rawPrompt;

  return (
    <Link
      href={`/runs/${run.id}`}
      className="group flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors"
    >
      <RunStatusBadge status={run.status} size="sm" className="shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{preview}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
          <span className="font-mono" title={new Date(run.createdAt).toISOString()}>
            {formatRelativeTime(run.createdAt)}
          </span>
          {run.model && <span className="font-mono">{run.model}</span>}
          {run.totalTokens != null && run.totalTokens > 0 && (
            <span className="tabular-nums">
              {run.totalTokens.toLocaleString()} tok
            </span>
          )}
        </div>
      </div>

      <span className="text-muted-foreground text-xs tabular-nums shrink-0 font-mono hidden sm:inline">
        {run.id.slice(0, 8)}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}
