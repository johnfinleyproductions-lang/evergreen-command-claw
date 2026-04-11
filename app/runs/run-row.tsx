// app/runs/run-row.tsx

import Link from "next/link";
import type { Run } from "@/lib/db/schema/runs";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-500",
  running: "bg-blue-500 animate-pulse",
  succeeded: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-yellow-500",
};

export function RunRow({ run }: { run: Run }) {
  const dotClass = STATUS_DOT[run.status] ?? "bg-gray-500";
  const input = (run.input ?? {}) as { prompt?: unknown };
  const rawPrompt =
    typeof input.prompt === "string" && input.prompt.length > 0
      ? input.prompt
      : "(no prompt)";
  const preview = rawPrompt.length > 140 ? rawPrompt.slice(0, 140) + "…" : rawPrompt;

  return (
    <Link
      href={`/runs/${run.id}`}
      className="flex items-center gap-4 p-4 hover:bg-gray-900/50 transition-colors"
    >
      <span
        className={`inline-block rounded-full w-2 h-2 shrink-0 ${dotClass}`}
        aria-label={run.status}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate">{preview}</p>
        <p className="text-xs text-text-muted mt-0.5">
          {run.status} · {new Date(run.createdAt).toLocaleString()} · {run.model}
          {run.totalTokens ? ` · ${run.totalTokens.toLocaleString()} tokens` : ""}
        </p>
      </div>
      <span className="text-text-muted text-xs tabular-nums shrink-0 font-mono">
        {run.id.slice(0, 8)}
      </span>
    </Link>
  );
}
